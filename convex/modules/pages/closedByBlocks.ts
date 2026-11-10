/**
 * Une page FERMÉE à une personne par les blocages (issue antsia#141 ; décision 5 du plan 05 de
 * DIASPORALE, lot RP-03) — aucune fonction Convex ici.
 *
 * Une page se ferme, de façon INDISTINCTE, à la personne que TOUS ses signataires vivants ont
 * bloquée, ou qui les a tous bloqués : le blocage compte dans un sens ou dans l'autre, dans
 * quelque réseau que ce soit (`graph.isBlockedBetween`). Un seul signataire qui bloque ne ferme
 * pas une page collective. Ne comptent que les signataires VIVANTS : invitation acceptée et rôle
 * vivant (`access.liveSignatoryRole` : page active et native, signataire membre actif du réseau
 * de la page, identité forte pour une page Officielle) ; une invitation en attente ou un
 * signataire parti ne comptent pas. Une page sans signataire vivant n'est pas fermée par ce
 * fait ; la personne elle-même signataire vivante ne l'est jamais.
 *
 * Même sémantique que `isPageClosedByBlocks` de la tranche (`diaspora/facts.ts`, antsia#140),
 * écrite dans le module qui possède les signataires : le moteur n'importe pas la tranche, la
 * tranche peut importer ce module. L'appelant lève le refus indistinct de SON objet (celui d'un
 * objet introuvable ou retiré), jamais « vous êtes bloqué ».
 *
 * Lectures bornées : les lignes de signataires sont plafonnées (`access.signatoryRowsOf`,
 * `PAGE_SIGNATORIES_MAX` par rôle) et chaque contrôle de blocage lit une paire bornée.
 */
import type { Doc, Id } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
import { isBlockedBetween } from "../graph/graph"
import { liveSignatoryRole, signatoryRowsOf } from "./access"

type ReadCtx = Pick<QueryCtx, "db">

/**
 * La page est-elle fermée à `personId` par les blocages ? Pour UN acte : la lecture s'arrête au
 * premier signataire vivant hors blocage (le cas courant ne lit qu'une paire).
 */
export async function isPageClosedByBlocks(ctx: ReadCtx, page: Doc<"pages">, personId: Id<"persons">): Promise<boolean> {
  let liveBlocked = 0
  // borné : au plus PAGE_SIGNATORIES_MAX + 1 lignes par rôle (`signatoryRowsOf`).
  for (const row of await signatoryRowsOf(ctx, page._id)) {
    if (row.acceptedAt === undefined) continue
    if ((await liveSignatoryRole(ctx, page, row.personId)) === null) continue
    if (!(await isBlockedBetween(ctx, row.personId, personId))) return false
    liveBlocked += 1
  }
  return liveBlocked > 0
}

/**
 * Les signataires VIVANTS d'une page, lus une fois pour juger plusieurs personnes dans la même
 * transaction (une file d'attente) avec `isClosedByBlocksAmong`. Même définition que ci-dessus.
 */
export async function livePageSignatoryIds(ctx: ReadCtx, page: Doc<"pages">): Promise<Id<"persons">[]> {
  const live: Id<"persons">[] = []
  // borné : au plus PAGE_SIGNATORIES_MAX + 1 lignes par rôle (`signatoryRowsOf`).
  for (const row of await signatoryRowsOf(ctx, page._id)) {
    if (row.acceptedAt === undefined) continue
    if ((await liveSignatoryRole(ctx, page, row.personId)) !== null) live.push(row.personId)
  }
  return live
}

/** `isPageClosedByBlocks` sur des signataires vivants déjà lus (`livePageSignatoryIds`). */
export async function isClosedByBlocksAmong(ctx: ReadCtx, liveSignatoryIds: readonly Id<"persons">[], personId: Id<"persons">): Promise<boolean> {
  if (liveSignatoryIds.length === 0) return false
  for (const signatoryId of liveSignatoryIds) if (!(await isBlockedBetween(ctx, signatoryId, personId))) return false
  return true
}
