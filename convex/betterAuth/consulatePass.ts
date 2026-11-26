import type { BetterAuthPlugin } from "better-auth"
import { APIError, createAuthEndpoint, getAuthoritativeSessionFromCtx } from "better-auth/api"
import { setSessionCookie } from "better-auth/cookies"
import { handleOAuthUserInfo } from "better-auth/oauth2"
import { z } from "zod"

const hexSecret = z.string().regex(/^[a-f0-9]{64}$/)
const refused = () => new APIError("UNAUTHORIZED", { code: "consulatePassRejected", message: "Passage expiré ou refusé." })

/** Seules deux sessions en cours dont le canal vérifié concorde permettent de rattacher un compte local existant. */
export async function sameVerifiedMailbox(user: { email: string; emailVerified: boolean }, hash: string): Promise<boolean> {
  if (!user.emailVerified || !user.email.trim()) return false
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(user.email.trim().toLowerCase()))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("") === hash
}

/** Le lien fournisseur prouve l'inscription sur CONSULAT.GA lors de l'adhésion à DIASPORA.GA. */
export function consulatePass(): BetterAuthPlugin {
  return {
    id: "consulate-pass",
    rateLimit: [{ pathMatcher: path => path === "/sign-in/consulate-pass", window: 60, max: 15 }],
    endpoints: {
      redeemConsulatePass: createAuthEndpoint("/sign-in/consulate-pass", {
        method: "POST", body: z.object({ code: hexSecret, verifier: hexSecret }),
      }, async ctx => {
        const secret = process.env.DIASPORA_PASS_SECRET
        const issuer = process.env.CONSULAT_PASS_ISSUER
        const origin = process.env.DIASPORA_PASS_APP_ORIGIN
        if (!secret || secret.length < 32 || !issuer || !origin || ctx.headers?.get("origin") !== origin) throw refused()
        const url = new URL(issuer)
        if (url.protocol !== "https:" || url.origin !== issuer) throw refused()
        const response = await fetch(new URL("/diaspora/session/redeem", url), {
          method: "POST", redirect: "error", signal: AbortSignal.timeout(8000),
          headers: { Authorization: "Bearer " + secret, "Content-Type": "application/json" },
          body: JSON.stringify(ctx.body),
        })
        if (!response.ok) throw refused()
        const grant = z.object({ subject: hexSecret, idn: z.string().min(1).max(512).optional(), emailHash: hexSecret.optional() }).safeParse(await response.json())
        if (!grant.success) throw refused()
        const { subject, idn, emailHash } = grant.data
        const adapter = ctx.context.internalAdapter
        const known = await adapter.findAccountByProviderId(subject, "consulat")
        const linked = idn ? await adapter.findAccountByProviderId(idn, "idn") : null
        if (linked && known && linked.userId !== known.userId) throw refused()
        let userId = (known ?? linked)?.userId
        if (!userId && emailHash) {
          const current = await getAuthoritativeSessionFromCtx(ctx)
          if (current && await sameVerifiedMailbox(current.user, emailHash)) {
            const accounts = await adapter.findAccounts(current.user.id)
            if (accounts.some(row => row.providerId === "consulat" || (row.providerId === "idn" && idn && row.accountId !== idn))) throw refused()
            userId = current.user.id
          }
        }
        if (userId) {
          const user = await adapter.findUserById(userId)
          if (!user) throw refused()
          if (!known) await adapter.linkAccount({ providerId: "consulat", accountId: subject, userId: user.id })
          await setSessionCookie(ctx, { user, session: await adapter.createSession(user.id) })
        } else {
          const result = await handleOAuthUserInfo(ctx, {
            userInfo: { id: subject, email: subject + "@consulat.invalid", emailVerified: false, name: "Membre" },
            account: { providerId: "consulat", accountId: subject }, callbackURL: "/bienvenue",
          })
          if (result.error || !result.data) throw refused()
          await setSessionCookie(ctx, result.data)
        }
        return ctx.json({ ok: true })
      }),
    },
  }
}
