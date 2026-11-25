/**
 * Disponibilité d'un identifiant POUR une personne — sortie de `profile.ts`, inchangée, pour être
 * partagée avec l'accueil pré-rempli par IDN (`idnPrefill.ts`, ADR-0044) sans import circulaire.
 */
import type { Id } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"

/**
 * Un identifiant est-il libre POUR cette personne ? Pris par une autre
 * personne, ou porté naguère par une autre (un identifiant est une ADRESSE : le
 * recycler ferait suivre les liens anciens vers quelqu'un d'autre) : non.
 */
export async function isHandleFreeFor(ctx: QueryCtx, handle: string, personId: Id<"persons">): Promise<boolean> {
  const holder = await ctx.db
    .query("persons")
    .withIndex("by_handle", (q) => q.eq("handle", handle))
    .unique()
  if (holder && holder._id !== personId) return false
  // borné : un identifiant n'a qu'une poignée de titulaires successifs.
  const past = await ctx.db
    .query("handleHistory")
    .withIndex("by_handle", (q) => q.eq("handle", handle))
    .take(20)
  return past.every((row) => row.personId === personId)
}
