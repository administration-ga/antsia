/**
 * Codes à usage unique de DÉVELOPPEMENT LOCAL : sans service de courriel, la
 * personne qui teste lit son code à l'écran de connexion. Fermé partout
 * ailleurs (`devToolsAllowed` : variable `ANTSIA_DEV_TOOLS` ET backend local) —
 * en production la table reste vide et la lecture rend `null`. Sur le
 * déploiement de démonstration déclaré, seuls les codes des adresses réservées
 * aux comptes de démonstration s'enregistrent et se relisent (`demoCodeReadable`).
 */
import { v } from "convex/values"

import { internalMutation, query } from "../../_generated/server"
import { demoCodeReadable } from "../../lib/devTools"

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
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
 * (production comprise). L'écran décide de l'expiration.
 */
export const latestOtp = query({
  args: { email: v.string() },
  returns: v.union(v.object({ code: v.string(), expiresAt: v.number() }), v.null()),
  handler: async (ctx, args) => {
    if (!demoCodeReadable(args.email)) return null
    const row = await ctx.db
      .query("devOtpCodes")
      .withIndex("by_email", (q) => q.eq("email", normalizeEmail(args.email)))
      .unique()
    return row ? { code: row.code, expiresAt: row.expiresAt } : null
  },
})
