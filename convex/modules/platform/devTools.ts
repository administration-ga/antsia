/**
 * Codes à usage unique de DÉVELOPPEMENT LOCAL : sans service de courriel, la
 * personne qui teste lit son code à l'écran de connexion. Fermé partout
 * ailleurs (`devToolsAllowed` : variable `ANTSIA_DEV_TOOLS` ET backend local) —
 * en production la table reste vide et la lecture rend `null`. Sur le
 * déploiement de démonstration déclaré, seuls les codes des adresses réservées
 * aux comptes de démonstration s'enregistrent et se relisent (`demoCodeReadable`).
 *
 * CH-817 E3 — porte des comptes de démonstration (`./demoGate.ts`) armée, le code
 * d'une adresse de la famille `…@demo.diaspora-ga.test` ne se relit qu'avec un jeton
 * de session de porte valide (`gateToken`) ; toute autre adresse (celles de la racine,
 * celles du développement local) se lit comme avant. Porte non armée : rien ne change.
 *
 * CH-817 E5 (relecture de sécurité, constat 1) : cette lecture n'est PLUS le verrou
 * réel. Un anonyme pouvait demander un code pour une adresse réservée et l'essayer
 * sans jamais le lire ; le verrou réel est désormais la CONNEXION elle-même (crochet
 * de `betterAuth/auth.ts` : envoi et connexion d'une adresse de la famille refusés
 * sans session de porte valide). `latestOtp` reste le SECOND verrou : sans jeton
 * valide, le code ne s'affiche pas.
 */
import type { DemoGateScope } from "@antsia/social-contracts/demoGate"
import { v } from "convex/values"

import { internalMutation, query, type QueryCtx } from "../../_generated/server"
import { demoGateScopeOfEmail, demoGateState } from "../../lib/demoGate"
import { demoCodeReadable } from "../../lib/devTools"
import { demoGateSessionOf, type DemoGateSessionOptions } from "./demoGate"

// CH-817 E5 : la règle vit dans `lib/demoGate.ts`, que lit aussi le crochet de connexion ; réexportée ici.
export { demoGateScopeOfEmail }

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/**
 * Ce que la porte répond à une lecture qui ouvre un compte de démonstration : refus, ou admission
 * avec l'échéance de la session de porte (`null` quand la porte n'est pas armée et n'en exige aucune).
 */
export type DemoGateAdmission = { admitted: false } | { admitted: true; sessionExpiresAt: number | null }

/**
 * LA règle des lectures qui ouvrent les comptes de démonstration (`catalogue`, `latestOtp`) — celle
 * de `demoGateAdmits` (lot E2), qui rend en plus l'échéance de la session : porte `open` (non armée)
 * → admise, sans échéance ; `gated` → seulement avec une session valide pour la portée ; `closed` et
 * `unavailable` → refusée, pour tous. Une requête fige `Date.now()` : un abonnement ne se réévalue
 * pas à l'échéance de lui-même ; l'écran lâche son jeton à `sessionExpiresAt` (jamais le jeton n'est
 * rendu). Lecture seule.
 */
export async function demoGateAdmission(
  ctx: Pick<QueryCtx, "db">,
  scope: DemoGateScope,
  token: string | undefined,
  options: DemoGateSessionOptions = {},
): Promise<DemoGateAdmission> {
  const state = demoGateState(options.env ?? process.env)
  if (state === "open") return { admitted: true, sessionExpiresAt: null }
  if (state !== "gated") return { admitted: false }
  const session = await demoGateSessionOf(ctx, { scope, token }, options)
  return session ? { admitted: true, sessionExpiresAt: session.expiresAt } : { admitted: false }
}

/** Appelée par l'envoi du code (Better Auth) : une ligne par adresse, remplacée. */
export const recordOtp = internalMutation({
  args: { email: v.string(), code: v.string(), expiresAt: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!demoCodeReadable(args.email)) return null
    const email = normalizeEmail(args.email)
    const existing = await ctx.db
      .query("devOtpCodes")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique()
    const row = { email, code: args.code, expiresAt: args.expiresAt, createdAt: Date.now() }
    if (existing) await ctx.db.patch(existing._id, row)
    else await ctx.db.insert("devOtpCodes", row)
    return null
  },
})

/**
 * @publicProjection Outil de développement local seulement : rend le dernier
 * code envoyé à cette adresse quand les outils sont ouverts (sur la démonstration
 * déclarée : à une adresse de compte de démonstration), `null` partout ailleurs
 * (production comprise). L'écran décide de l'expiration. Porte de démonstration
 * armée (CH-817 E3) : une adresse de DIASPORA.GA exige un jeton de session de porte
 * valide (`gateToken`), et la réponse porte alors l'échéance de cette session
 * (`gateExpiresAt`) ; sans session valide, `null`, comme pour une adresse inconnue.
 */
export const latestOtp = query({
  args: { email: v.string(), gateToken: v.optional(v.string()) },
  returns: v.union(v.object({ code: v.string(), expiresAt: v.number(), gateExpiresAt: v.optional(v.number()) }), v.null()),
  handler: async (ctx, args) => {
    if (!demoCodeReadable(args.email)) return null
    const scope = demoGateScopeOfEmail(args.email)
    let gateExpiresAt: number | null = null
    if (scope !== null) {
      const admission = await demoGateAdmission(ctx, scope, args.gateToken)
      if (!admission.admitted) return null
      gateExpiresAt = admission.sessionExpiresAt
    }
    const row = await ctx.db
      .query("devOtpCodes")
      .withIndex("by_email", (q) => q.eq("email", normalizeEmail(args.email)))
      .unique()
    if (!row) return null
    return { code: row.code, expiresAt: row.expiresAt, ...(gateExpiresAt !== null ? { gateExpiresAt } : {}) }
  },
})
