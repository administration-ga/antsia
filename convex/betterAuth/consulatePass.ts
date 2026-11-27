import type { BetterAuthPlugin } from "better-auth"
import { APIError, createAuthEndpoint, getAuthoritativeSessionFromCtx } from "better-auth/api"
import { setSessionCookie } from "better-auth/cookies"
import { z } from "zod"
import { consulatePassConfiguration } from "../lib/consulatePassConfiguration"

const hexSecret = z.string().regex(/^[a-f0-9]{64}$/)
const refused = () => new APIError("UNAUTHORIZED", { code: "consulatePassRejected", message: "Passage expiré ou refusé." })

export interface PassEntryState {
  membership: "active" | "absent" | "blocked"
  currentIdn: boolean
}

export function consulatePass(
  refreshMembership: (userId: string) => Promise<void>,
  entryState: (userId: string, sessionId?: string, idn?: string) => Promise<PassEntryState>,
  linkAccount: (userId: string, subject: string, idn: string) => Promise<boolean>,
): BetterAuthPlugin {
  return {
    id: "consulate-pass",
    rateLimit: [{ pathMatcher: path => path === "/sign-in/consulate-pass", window: 60, max: 15 }],
    endpoints: {
      redeemConsulatePass: createAuthEndpoint("/sign-in/consulate-pass", {
        method: "POST", body: z.object({ code: hexSecret, verifier: hexSecret, version: z.literal(2).optional(), afterIdn: z.literal(true).optional() }),
      }, async ctx => {
        const config = consulatePassConfiguration()
        if (!config || ctx.headers?.get("origin") !== config.origin) throw refused()
        const { secret, issuer } = config
        const response = await fetch(new URL("/diaspora/session/redeem", issuer), {
          method: "POST", redirect: "error", signal: AbortSignal.timeout(8000),
          headers: { Authorization: "Bearer " + secret, "Content-Type": "application/json" },
          body: JSON.stringify({ code: ctx.body.code, verifier: ctx.body.verifier, ...(ctx.body.version === 2 ? { version: 2 } : {}) }),
        })
        if (!response.ok) throw refused()
        const grant = z.object({
          subject: hexSecret,
          idn: z.string().min(1).max(512).optional(),
          emailHash: hexSecret.optional(),
          loginHint: z.string().min(1).max(320).optional(),
          givenNames: z.string().min(1).max(200).optional(),
          familyName: z.string().min(1).max(200).optional(),
          countryOfResidence: z.string().regex(/^[A-Z]{2}$/).optional(),
        }).safeParse(await response.json())
        if (!grant.success) throw refused()
        const { subject, idn } = grant.data
        const adapter = ctx.context.internalAdapter
        const known = await adapter.findAccountByProviderId(subject, "consulat")
        const linked = idn ? await adapter.findAccountByProviderId(idn, "idn") : null
        if (linked && known && linked.userId !== known.userId) throw refused()
        // Le passe autorise le retour d'un membre. Pour une première adhésion,
        // l'IDN du billet doit aussi être celle de la session OIDC du navigateur.
        const userId = (known ?? linked)?.userId
        const current = await getAuthoritativeSessionFromCtx(ctx)
        const state = userId ? await entryState(userId, current?.session.id, idn) : null
        if (state?.membership === "blocked") throw refused()
        if (state?.membership !== "active") {
          if (ctx.body.version !== 2) {
            throw new APIError("CONFLICT", { code: "consulatePassUpdateRequired", message: "Actualisez votre application pour valider votre identité numérique." })
          }
          if (!idn) throw refused()
          if (!ctx.body.afterIdn) {
            return ctx.json({ ok: true, next: "idn", ...(grant.data.loginHint ? { loginHint: grant.data.loginHint } : {}) })
          }
          if (!linked || linked.userId !== current?.user.id || !state?.currentIdn) throw refused()
        } else if (ctx.body.afterIdn && (!linked || current?.user.id !== linked.userId || !state.currentIdn)) {
          throw refused()
        }
        if (!userId) throw refused()
        if (known && idn && !linked) {
          const accounts = await adapter.findAccounts(userId)
          if (accounts.some(account => account.providerId === "idn" && account.accountId !== idn)) throw refused()
        }
        const user = await adapter.findUserById(userId)
        if (!user) throw refused()
        if (!known && (!idn || !await linkAccount(userId, subject, idn))) throw refused()
        if (state?.membership === "active") {
          await refreshMembership(userId)
          if (ctx.body.version !== 2 || current?.user.id !== userId) await setSessionCookie(ctx, { user, session: await adapter.createSession(userId) })
          return ctx.json(ctx.body.version === 2 ? { ok: true, next: "feed" } : { ok: true })
        }
        const { givenNames, familyName, countryOfResidence } = grant.data
        return ctx.json({ ok: true, next: "consent", userId, givenNames, familyName, countryOfResidence })
      }),
    },
  }
}
