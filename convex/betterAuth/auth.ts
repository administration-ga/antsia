// Dupliqué de socle/convex/betterAuth/auth.ts @ ad2e7fdc2 — adaptations : PA4, IDN avec PKCE et preuve serveur minimale, comptes légers par OTP e-mail/SMS, aucune route de mot de passe ; origines du catalogue et de l'environnement ; session sept jours et JWT trente minutes avec sessionId contrôlé côté serveur ; OTT trois minutes ; délivrance locale bornée ou transport configuré, erreurs et limitation de débit du moteur.
/**
 * Better Auth du moteur — l'émetteur UNIQUE des jetons Convex (ADR-0002).
 *
 * Les applications parlent à Better Auth par leur propre origine (proxy Next
 * `/api/auth/*` → actions HTTP Convex) ; le greffon `crossDomain` garde la
 * session par origine et `oneTimeToken` prépare le passage entre applications
 * avec un jeton à usage unique de trois minutes.
 */
import { createClient, type GenericCtx } from "@convex-dev/better-auth"
import { convex, crossDomain } from "@convex-dev/better-auth/plugins"
import type { BetterAuthPlugin } from "better-auth"
import { APIError, createAuthMiddleware } from "better-auth/api"
import { betterAuth } from "better-auth/minimal"
import { bearer, emailOTP, genericOAuth, oneTimeToken, phoneNumber } from "better-auth/plugins"
import { idn } from "@idn-ga/better-auth"

import { BRAND_NAME } from "@antsia/social-contracts/brand"

import { components, internal } from "../_generated/api"
import type { DataModel } from "../_generated/dataModel"
import authConfig from "../auth.config"
import { devToolsAllowed } from "../lib/devTools"
import { deliverOtp, type OtpRequest } from "./delivery"
import { isNativeIdnOAuth, nativeIdn } from "./nativeIdn"
import { authenticationConfiguration, idnConfiguration, idnProfileProof, isE164Phone, trustedOrigins } from "./settings"

export { parseOriginList, trustedOrigins } from "./settings"

export const authComponent = createClient<DataModel>(components.betterAuth)

/** Durée de vie d'un code à usage unique : cinq minutes. */
export const OTP_TTL_SECONDS = 300

/** L'origine principale, lue dans le déploiement — jamais une adresse écrite ici (dépôt public). */
function primarySiteUrl(): string {
  const siteUrl = process.env.SITE_URL
  if (!siteUrl) throw new Error("[Auth] SITE_URL manquant : variable du déploiement Convex.")
  return new URL(siteUrl).origin
}

/**
 * L'origine qui demande, si elle est de confiance ; sinon l'origine principale.
 * Le greffon `crossDomain` y renvoie la personne après un parcours de connexion.
 */
export function resolveSiteUrl(origin: string | null | undefined, allowlist: string[], fallback: string): string {
  if (origin) {
    try {
      const normalized = new URL(origin).origin
      if (allowlist.includes(normalized)) return normalized
    } catch {
      // origine illisible : repli
    }
  }
  return fallback
}

/** Valide que BETTER_AUTH_SECRET est présent et assez long. */
function validateAuthSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret) throw new Error("[Auth] BETTER_AUTH_SECRET manquant.")
  if (secret.length < 32) throw new Error(`[Auth] BETTER_AUTH_SECRET trop court (${secret.length} caractères, 32 requis).`)
  return secret
}

type RunMutationCtx = { runMutation: (reference: never, args: never) => Promise<unknown> }

function canRunMutation(ctx: unknown): ctx is RunMutationCtx {
  return typeof ctx === "object" && ctx !== null && "runMutation" in ctx && typeof (ctx as RunMutationCtx).runMutation === "function"
}

// Limitation de débit : avant l'envoi d'un code et avant une connexion. Clé =
// adresse normalisée ; au-delà du quota, 429 avec le code `rateLimited`.
const RL_LOGIN_PATHS = new Set<string>(["/sign-in/email-otp", "/phone-number/verify"])
const RL_OTP_SEND_PATHS = new Set<string>(["/email-otp/send-verification-otp", "/phone-number/send-otp"])
// Les plugins OTP exposent aussi des réinitialisations capables de créer un
// compte `credential`, même si emailAndPassword.enabled est false.
const PASSWORD_PATHS = new Set([
  "/sign-in/email", "/sign-up/email", "/sign-in/phone-number",
  "/request-password-reset", "/reset-password", "/change-password", "/verify-password", "/set-password",
  "/email-otp/request-password-reset", "/email-otp/reset-password", "/forget-password/email-otp",
  "/phone-number/request-password-reset", "/phone-number/reset-password",
])

function isPasswordRequest(hookCtx: { path?: string; body?: unknown }): boolean {
  const path = hookCtx.path ?? ""
  if (PASSWORD_PATHS.has(path) || path.startsWith("/reset-password/")) return true
  return path === "/email-otp/send-verification-otp" && typeof hookCtx.body === "object" && hookCtx.body !== null && "type" in hookCtx.body && hookCtx.body.type === "forget-password"
}

/** L'origine et la langue de la requête qui demande un code ; l'origine de `createAuth` à défaut d'en-têtes. */
function otpRequestOf(endpoint: { headers?: Headers | null } | undefined, requestOrigin: string | null | undefined): OtpRequest {
  return { origin: endpoint?.headers?.get("origin") ?? requestOrigin, acceptLanguage: endpoint?.headers?.get("accept-language") }
}

type DeliveryState = { attempted: boolean; delivered: boolean }
function deliveryState(context: unknown): DeliveryState | null {
  if (!context || typeof context !== "object" || !("engineOtpDelivery" in context)) return null
  const state = context.engineOtpDelivery
  return state && typeof state === "object" && "attempted" in state && "delivered" in state && typeof state.attempted === "boolean" && typeof state.delivered === "boolean" ? state as DeliveryState : null
}

const rateLimitPlugin = (ctx: GenericCtx<DataModel>): BetterAuthPlugin => ({
  id: "engine-auth-rate-limit",
  hooks: {
    before: [
      {
        matcher: (hookCtx) => Boolean(hookCtx.headers?.get("origin")),
        handler: createAuthMiddleware(async (hookCtx) => {
          const origin = hookCtx.headers?.get("origin")
          if (origin && !trustedOrigins().includes(origin)) throw new APIError("FORBIDDEN", { message: "INVALID_ORIGIN", code: "INVALID_ORIGIN" })
        }),
      },
      {
        matcher: isPasswordRequest,
        handler: createAuthMiddleware(async () => {
          throw new APIError("NOT_FOUND", { message: "passwordSignInDisabled", code: "passwordSignInDisabled" })
        }),
      },
      {
        matcher: (hookCtx) => RL_OTP_SEND_PATHS.has(hookCtx.path ?? ""),
        handler: createAuthMiddleware(async (hookCtx) => {
          const available = authenticationConfiguration()
          if (hookCtx.path === "/phone-number/send-otp" ? !available.smsOtp : !available.emailOtp) throw new APIError("SERVICE_UNAVAILABLE", { message: "otpDeliveryUnavailable", code: "otpDeliveryUnavailable" })
          // Le dispatcher fusionne ce retour dans le contexte de l'endpoint :
          // les données partagées avec le callback vivent dans .context.
          return { context: { context: { engineOtpDelivery: { attempted: false, delivered: false } satisfies DeliveryState } } }
        }),
      },
      {
        matcher: (hookCtx) => RL_LOGIN_PATHS.has(hookCtx.path ?? "") || RL_OTP_SEND_PATHS.has(hookCtx.path ?? ""),
        handler: createAuthMiddleware(async (hookCtx) => {
          const body = (hookCtx as { body?: { email?: unknown; phoneNumber?: unknown } }).body ?? {}
          const identifier = body.email ?? body.phoneNumber
          const key = typeof identifier === "string" ? identifier.trim().toLowerCase() : ""
          if (!key || !canRunMutation(ctx)) return
          const bucket = RL_OTP_SEND_PATHS.has(hookCtx.path ?? "") ? "auth.otp.send" : "auth.login"
          const result = (await ctx.runMutation(
            internal.modules.platform.authRateLimit.checkAuthRateLimit as never,
            { bucket, key } as never,
          )) as { ok: boolean; retryAfterMs: number }
          if (!result.ok) throw new APIError("TOO_MANY_REQUESTS", { message: "rateLimited", code: "rateLimited" })
        }),
      },
    ],
    after: [{
      matcher: (hookCtx) => RL_OTP_SEND_PATHS.has(hookCtx.path ?? ""),
      handler: createAuthMiddleware(async (hookCtx) => {
        const state = deliveryState(hookCtx.context)
        // Better Auth masque les erreurs d'envoi e-mail ; restaurer un refus
        // explicite quand le transport a réellement échoué, sans détails privés.
        if (state?.attempted && !state.delivered) throw new APIError("SERVICE_UNAVAILABLE", { message: "otpDeliveryUnavailable", code: "otpDeliveryUnavailable" })
      }),
    }],
  },
})

/** Retire le champ `mode` des clauses `where`, que l'adaptateur Convex refuse (contournement repris du socle). */
function stripModeClauses<T>(args: T): T {
  const strip = (clause: unknown) => {
    if (clause && typeof clause === "object" && "mode" in clause) {
      const { mode: _mode, ...rest } = clause as Record<string, unknown>
      return rest
    }
    return clause
  }
  if (!args || typeof args !== "object") return args
  const copy = { ...(args as Record<string, unknown>) }
  if ("where" in copy) copy.where = Array.isArray(copy.where) ? copy.where.map(strip) : strip(copy.where)
  const input = copy.input
  if (input && typeof input === "object" && "where" in input) {
    const inputCopy = { ...(input as Record<string, unknown>) }
    inputCopy.where = Array.isArray(inputCopy.where) ? inputCopy.where.map(strip) : strip(inputCopy.where)
    copy.input = inputCopy
  }
  return copy as T
}

/** Le contexte passé à l'adaptateur, avec le contournement `mode`. */
export function adapterContext(ctx: GenericCtx<DataModel>): GenericCtx<DataModel> {
  const base = ctx as unknown as Record<string, unknown> & {
    runQuery?: (reference: unknown, args: unknown) => Promise<unknown>
    runMutation?: (reference: unknown, args: unknown) => Promise<unknown>
  }
  return {
    ...base,
    ...(base.runQuery ? { runQuery: (reference: unknown, args: unknown) => base.runQuery?.(reference, stripModeClauses(args)) } : {}),
    ...(base.runMutation ? { runMutation: (reference: unknown, args: unknown) => base.runMutation?.(reference, stripModeClauses(args)) } : {}),
  } as unknown as GenericCtx<DataModel>
}

export const createAuth = (ctx: GenericCtx<DataModel>, requestOrigin?: string | null) => {
  const siteUrl = primarySiteUrl()
  const allowedOrigins = trustedOrigins()
  const isLocalDev = devToolsAllowed()
  const idnOptions = idnConfiguration()
  const browserSession = crossDomain({ siteUrl: resolveSiteUrl(requestOrigin, allowedOrigins, siteUrl) })
  const skipBrowserAfter = createAuthMiddleware(async () => {})
  // Le retour natif délivre son propre code S256. Ne jamais lui ajouter l'OTT Web.
  browserSession.hooks.after = browserSession.hooks.after.map((hook) => ({
    ...hook,
    // Le handler est déjà un middleware Better Call : conserver son enveloppe
    // { response, headers }. L'envelopper une seconde fois remplace le corps
    // OAuth/OTP par cet objet d'en-têtes dans le transport crossDomain.
    handler: async (hookCtx) => {
      // Les champs de route sont fournis par le répartiteur Better Auth, mais
      // absents du type générique des entrées de middleware Better Call.
      const route = hookCtx as typeof hookCtx & { path?: string; params?: { providerId?: string } }
      if ((route.path === "/oauth2/callback/idn" || route.path === "/oauth2/callback/:providerId" && route.params?.providerId === "idn") && await isNativeIdnOAuth()) return skipBrowserAfter(hookCtx)
      return hook.handler(hookCtx)
    },
  }))
  // Propre à CETTE requête : seul le profil du callback OIDC peut sceller
  // la nouvelle session. Un lien de compte ou un OTP ne le peuvent pas.
  let idnLoginProof: ReturnType<typeof idnProfileProof> | null = null
  type OAuthConfig = Parameters<typeof genericOAuth>[0]["config"][number]
  const idnProvider: OAuthConfig[] = idnOptions ? [{
    ...idn({ ...idnOptions, scopes: ["openid", "profile", "email"] }),
    // Une nouvelle entrée doit permettre une autre identité, même si IDN garde son SSO.
    prompt: "login",
    // Callback central stable, aussi pendant l'échange sans en-tête Origin.
    redirectURI: `${siteUrl}/api/auth/oauth2/callback/idn`,
    mapProfileToUser: async (profile: Record<string, unknown>) => {
      if (!canRunMutation(ctx)) throw new APIError("SERVICE_UNAVAILABLE", { message: "idnUnavailable", code: "idnUnavailable" })
      const proof = idnProfileProof(profile)
      await ctx.runMutation(internal.modules.people.identity.recordIdnProof as never, proof as never)
      idnLoginProof = proof
      // Le nom social est choisi à l'accueil ; aucun état civil n'est recopié.
      return { email: String(profile.email).trim().toLowerCase(), emailVerified: true, name: BRAND_NAME }
    },
  } as OAuthConfig] : []

  return betterAuth({
    appName: BRAND_NAME,
    baseURL: siteUrl,
    secret: validateAuthSecret(),
    session: {
      // Sept jours, rafraîchis chaque jour ; le JWT Convex se renouvelle en
      // trente minutes et porte sessionId. La garde relit la session serveur :
      // une révocation refuse immédiatement même un JWT encore valide.
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    },
    trustedOrigins: allowedOrigins,
    database: authComponent.adapter(adapterContext(ctx)),
    emailAndPassword: { enabled: false },
    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: ["idn"],
        disableImplicitLinking: true,
        allowDifferentEmails: true,
        // Le compte SMS porte un email technique non vérifié. Le rattachement
        // est explicite et exige sa session OTP + l'authentification chez IDN.
        requireLocalEmailVerified: false,
      },
    },
    advanced: {
      // Le proxy de développement parle en http://localhost : cookies non sécurisés en local seulement.
      useSecureCookies: isLocalDev ? false : undefined,
    },
    plugins: [
      {
        id: "engine-idn-session-proof",
        hooks: { after: [{
          matcher: () => idnLoginProof !== null,
          handler: createAuthMiddleware(async (hookCtx) => {
            const proof = idnLoginProof
            const session = hookCtx.context.newSession?.session
            if (!proof || proof.loa === undefined || !session) return
            if (!canRunMutation(ctx)) throw new APIError("SERVICE_UNAVAILABLE", { message: "idnUnavailable", code: "idnUnavailable" })
            await ctx.runMutation(internal.modules.platform.operatorAccess.recordIdnSession as never, {
              sessionId: session.id, authUserId: session.userId, idnSubject: proof.subject, loa: proof.loa,
            } as never)
          }),
        }] },
      },
      convex({ authConfig, jwt: { expirationSeconds: 60 * 30 } }) as unknown as BetterAuthPlugin,
      browserSession,
      nativeIdn({ redirectUri: process.env.NATIVE_AUTH_REDIRECT_URI, siteUrl }),
      oneTimeToken({ expiresIn: 3, storeToken: "plain" }),
      bearer(),
      ...(idnProvider.length ? [genericOAuth({ config: idnProvider })] : []),
      rateLimitPlugin(ctx),
      emailOTP({
        otpLength: 6,
        expiresIn: OTP_TTL_SECONDS,
        allowedAttempts: 3,
        storeOTP: "hashed",
        async sendVerificationOTP({ email, otp }, endpoint) {
          const state = deliveryState(endpoint?.context)
          if (state) state.attempted = true
          try {
            await deliverOtp(ctx, "email", email, otp, otpRequestOf(endpoint, requestOrigin))
            if (state) state.delivered = true
          } catch (error) {
            if (!state) throw error
          }
        },
      }),
      phoneNumber({
        otpLength: 6,
        expiresIn: OTP_TTL_SECONDS,
        allowedAttempts: 3,
        requireVerification: true,
        phoneNumberValidator: isE164Phone,
        sendOTP: async ({ phoneNumber: phone, code }, endpoint) => deliverOtp(ctx, "phone", phone, code, otpRequestOf(endpoint, requestOrigin)),
        signUpOnVerification: {
          getTempEmail: (phone) => `${phone.replace(/\D/g, "")}@phone.antsia.invalid`,
          getTempName: () => BRAND_NAME,
        },
      }),
    ],
  })
}
