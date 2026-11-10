/** Retour IDN natif : code éphémère lié à S256, jamais une session dans le lien. */
import type { BetterAuthPlugin } from "better-auth"
import { APIError, createAuthEndpoint, createAuthMiddleware, getOAuthState } from "better-auth/api"
import { setSessionCookie } from "better-auth/cookies"
import { constantTimeEqual, generateRandomString } from "better-auth/crypto"
import { z } from "zod/v4"

const CODE = /^[A-Za-z0-9_-]{43}$/
const VERIFIER = /^[A-Za-z0-9_-]{43,128}$/
const LIFETIME_MS = 90_000
const RESERVED_SCHEMES = new Set(["http:", "https:", "file:", "data:", "javascript:", "exp:", "exps:", "about:", "blob:", "ftp:", "ws:", "wss:", "mailto:", "tel:", "sms:", "intent:", "chrome:", "chrome-extension:", "safari:", "itms:"])
const nativeStateSchema = z.object({ challenge: z.string().regex(CODE), state: z.string().regex(CODE), redirectUri: z.string() }).strict()
const storedCodeSchema = z.object({
  token: z.string().min(16).max(1_024), sessionId: z.string().min(1).max(512),
  userId: z.string().min(1).max(512), challenge: z.string().regex(CODE),
}).strict()

function configuredRedirect(raw: string | undefined): string | null {
  if (!raw || raw.length > 256) return null
  try {
    const url = new URL(raw)
    if (!/^[a-z][a-z0-9+.-]*:$/.test(url.protocol) || RESERVED_SCHEMES.has(url.protocol) ||
      url.hostname !== "auth" || url.pathname !== "/idn" || url.port || url.username || url.password || url.search || url.hash || url.href !== raw) return null
    return raw
  } catch { return null }
}

async function digest(value: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")
}

function denied(): never { throw new APIError("BAD_REQUEST", { message: "nativeIdnInvalid", code: "nativeIdnInvalid" }) }
function disabled(): never { throw new APIError("SERVICE_UNAVAILABLE", { message: "nativeIdnUnavailable", code: "nativeIdnUnavailable" }) }
function unexpired(value: unknown): boolean {
  const timestamp = value instanceof Date ? value.getTime() : typeof value === "number" || typeof value === "string" ? new Date(value).getTime() : NaN
  return Number.isFinite(timestamp) && timestamp > Date.now()
}

/** Seulement dans le callback : Better Auth a déjà vérifié et consommé son état OAuth. */
export async function isNativeIdnOAuth(): Promise<boolean> {
  const state = await getOAuthState()
  return Boolean(state && Object.prototype.hasOwnProperty.call(state, "antsiaNative"))
}

export function nativeIdn({ redirectUri, siteUrl }: { redirectUri: string | undefined; siteUrl: string }): BetterAuthPlugin {
  const destination = configuredRedirect(redirectUri)
  const site = new URL(siteUrl)
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(site.hostname)
  if ((site.protocol !== "https:" && !(site.protocol === "http:" && local)) || site.username || site.password || site.search || site.hash || site.pathname !== "/") throw new Error("nativeIdnSiteInvalid")
  const callbackURL = `${site.origin}/api/auth/native/return`
  return {
    id: "engine-native-idn",
    hooks: {
      before: [{
        matcher: (ctx) => ctx.path === "/sign-in/oauth2",
        handler: createAuthMiddleware(async (ctx) => {
          const data: unknown = ctx.body?.additionalData
          if (!data || typeof data !== "object" || !Object.prototype.hasOwnProperty.call(data, "antsiaNative")) return
          if (!destination) disabled()
          const parsed = nativeStateSchema.safeParse((data as Record<string, unknown>).antsiaNative)
          if (!parsed.success || parsed.data.redirectUri !== destination || ctx.body?.providerId !== "idn" ||
            ctx.body?.callbackURL !== callbackURL || ctx.body?.newUserCallbackURL !== callbackURL ||
            (ctx.body?.errorCallbackURL !== undefined && ctx.body.errorCallbackURL !== callbackURL)) denied()
        }),
      }],
      after: [{
        matcher: (ctx) => ctx.path === "/oauth2/callback/idn" || (ctx.path === "/oauth2/callback/:providerId" && ctx.params?.providerId === "idn"),
        handler: createAuthMiddleware(async (ctx) => {
          const state = await getOAuthState()
          if (!state || !Object.prototype.hasOwnProperty.call(state, "antsiaNative")) return
          if (!destination) disabled()
          const parsed = nativeStateSchema.safeParse(state.antsiaNative)
          const session = ctx.context.newSession
          if (!parsed.success || parsed.data.redirectUri !== destination || state.callbackURL !== callbackURL || state.newUserURL !== callbackURL ||
            (state.errorURL !== undefined && state.errorURL !== callbackURL) || !session || !unexpired(session.session.expiresAt) || session.session.userId !== session.user.id) denied()
          const code = generateRandomString(43)
          await ctx.context.internalAdapter.createVerificationValue({
            identifier: `native-idn:${await digest(code)}`,
            value: JSON.stringify({ token: session.session.token, sessionId: session.session.id, userId: session.user.id, challenge: parsed.data.challenge }),
            expiresAt: new Date(Date.now() + LIFETIME_MS),
          })
          const redirect = new URL(destination)
          redirect.searchParams.set("code", code)
          redirect.searchParams.set("state", parsed.data.state)
          throw ctx.redirect(redirect.toString())
        }),
      }],
    },
    endpoints: {
      exchangeNativeIdn: createAuthEndpoint("/native-idn/exchange", {
        method: "POST",
        body: z.object({ code: z.string().regex(CODE), verifier: z.string().regex(VERIFIER) }).strict(),
      }, async (ctx) => {
        if (!destination) disabled()
        const consumed = await ctx.context.internalAdapter.consumeVerificationValue(`native-idn:${await digest(ctx.body.code)}`)
        if (!consumed || !unexpired(consumed.expiresAt)) denied()
        let raw: unknown
        try { raw = JSON.parse(consumed.value) } catch { denied() }
        const stored = storedCodeSchema.safeParse(raw)
        if (!stored.success || !constantTimeEqual(await digest(ctx.body.verifier), stored.data.challenge)) denied()
        const session = await ctx.context.internalAdapter.findSession(stored.data.token)
        if (!session || session.session.id !== stored.data.sessionId || session.session.userId !== stored.data.userId ||
          session.user.id !== stored.data.userId || !unexpired(session.session.expiresAt)) denied()
        await setSessionCookie(ctx, session)
        return ctx.json(session)
      }),
    },
  }
}
