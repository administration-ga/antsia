/**
 * SU01h — ce que tient une mesure sur ordre du juge, relu par les gardes du moteur.
 *
 * Aucune fonction publique : des lectures BORNÉES par index, appelées par la garde d'adhésion
 * (`lib/access.ts` : compte suspendu, accès à un réseau suspendu), la garde de débit (`lib/rateLimit.ts` :
 * fonction restreinte), les lectures publiques, la recherche et Découvrir (déréférencement), les écrans
 * (correctif, étiquette d'origine) ; et l'aide qui TRANSMET la responsabilité d'un rétablissement à une
 * mesure encore vivante, appelée par chaque chemin qui rétablirait trop tôt (recours accueilli, sanction
 * échue, levée manuelle). Une mesure se juge vivante sur son échéance, sans attendre le passage de levée.
 *
 * Aucune importation de `lib/` : `lib/access.ts` et `lib/rateLimit.ts` importent ce fichier.
 */
import { isJudicialMeasureLive, type JudicialMeasureKind, type JudicialNoticeKind, type JudicialTargetKind, type RestrictableFeature } from "@antsia/social-domain/judicialMeasures"

import type { Doc, Id } from "../../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../../_generated/server"

type ReadCtx = Pick<QueryCtx, "db">
type Measure = Doc<"judicialMeasures">
export type JudicialEffect = keyof Measure["effects"]

/** Au-delà, la garde ferme (fail-closed) : un tel nombre de mesures sur UNE cible n'est pas un état normal. */
export const JUDICIAL_HOLD_SCAN_LIMIT = 50
/** Les mesures vivantes d'un genre lues d'un coup (déréférencements, restrictions, suspensions d'accès). */
const KIND_SCAN_LIMIT = 200

async function activeOnTarget(ctx: ReadCtx, targetKind: JudicialTargetKind, targetId: string): Promise<{ rows: Measure[]; full: boolean }> {
  const rows = await ctx.db.query("judicialMeasures").withIndex("by_target_status", (q) => q.eq("targetKind", targetKind).eq("targetId", targetId).eq("status", "active")).take(JUDICIAL_HOLD_SCAN_LIMIT + 1)
  return { rows, full: rows.length > JUDICIAL_HOLD_SCAN_LIMIT }
}

async function holds(ctx: ReadCtx, targetKind: JudicialTargetKind, targetId: string, kind: JudicialMeasureKind, now = Date.now()): Promise<boolean> {
  const { rows, full } = await activeOnTarget(ctx, targetKind, targetId)
  return full || rows.some((row) => row.kind === kind && isJudicialMeasureLive(row, now))
}

/** Le compte d'une personne est suspendu sur ordre (suspension racine : partout). */
export async function hasJudicialAccountHold(ctx: ReadCtx, personId: Id<"persons">): Promise<boolean> {
  return await holds(ctx, "person", personId, "suspend_account")
}

/** Une page est mise hors ligne sur ordre : aucune réactivation tant que la mesure vit. */
export async function hasJudicialPageHold(ctx: ReadCtx, pageId: Id<"pages">): Promise<boolean> {
  return await holds(ctx, "page", pageId, "suspend_account")
}

/** Un contenu est suspendu sur ordre : aucun rétablissement tant que la mesure vit. */
export async function hasJudicialContentHold(ctx: ReadCtx, targetKind: JudicialTargetKind, targetId: string): Promise<boolean> {
  return await holds(ctx, targetKind, targetId, "suspend_content")
}

/**
 * Un rétablissement qui arriverait PENDANT une mesure vivante (recours accueilli, sanction échue) est
 * différé : la mesure vivante prend la charge de l'effet (`effects[effect] = true`) et le défera à sa
 * levée. `true` si une mesure vivante tient la cible — l'appelant ne rétablit alors rien.
 */
export async function deferRestorationToJudicialHold(ctx: Pick<MutationCtx, "db">, targetKind: JudicialTargetKind, targetId: string, kind: JudicialMeasureKind, effect: JudicialEffect): Promise<boolean> {
  const now = Date.now()
  const { rows, full } = await activeOnTarget(ctx, targetKind, targetId)
  const live = rows.find((row) => row.kind === kind && isJudicialMeasureLive(row, now))
  if (!live) return full
  if (!live.effects[effect]) await ctx.db.patch(live._id, { effects: { ...live.effects, [effect]: true }, updatedAt: now })
  return true
}

async function liveOfKind(ctx: ReadCtx, kind: JudicialMeasureKind, now: number): Promise<{ rows: Measure[]; full: boolean }> {
  const rows = await ctx.db.query("judicialMeasures").withIndex("by_kind_status", (q) => q.eq("kind", kind).eq("status", "active")).take(KIND_SCAN_LIMIT + 1)
  return { rows: rows.filter((row) => isJudicialMeasureLive(row, now)), full: rows.length > KIND_SCAN_LIMIT }
}

/**
 * Une mesure de réseau (art. 44) vaut pour SON réseau, ou pour tous par la racine (comme une suspension
 * racine). Chaque cible se lit par son propre index : ce réseau, puis la racine — jamais toute la plage
 * d'un genre. Le refus de sûreté reste PAR CIBLE (plus de `JUDICIAL_HOLD_SCAN_LIMIT` mesures actives sur
 * un même réseau ferment CE réseau) : un excès de mesures sur un réseau ne ferme jamais les autres.
 */
async function networkHeld(ctx: ReadCtx, networkIds: readonly (Id<"networks"> | undefined)[], test: (row: Measure) => boolean): Promise<boolean> {
  const now = Date.now()
  for (const networkId of new Set(networkIds)) {
    if (networkId === undefined) continue
    const { rows, full } = await activeOnTarget(ctx, "network", networkId)
    if (full || rows.some((row) => test(row) && isJudicialMeasureLive(row, now))) return true
  }
  return false
}

/** Art. 44 : l'accès à ce réseau est suspendu — sur lui, ou sur la racine (`rootId`, connu de l'appelant). */
export async function isNetworkAccessSuspended(ctx: ReadCtx, networkId: Id<"networks">, rootId: Id<"networks">): Promise<boolean> {
  return await networkHeld(ctx, [networkId, rootId], (row) => row.kind === "suspend_access")
}

/**
 * Art. 44 : une fonction du registre fermé est coupée pour ce réseau ou pour la racine. Sans réseau
 * (geste d'une personne hors réseau), seule la racine compte.
 */
export async function isFeatureRestricted(ctx: ReadCtx, feature: RestrictableFeature, networkId: Id<"networks"> | undefined, rootId: Id<"networks"> | undefined): Promise<boolean> {
  return await networkHeld(ctx, [networkId, rootId], (row) => row.kind === "restrict_feature" && row.feature === feature)
}

/**
 * Le déréférencement : une lecture de liste (recherche, Découvrir, lectures publiques) relit chaque
 * candidat sans changer la forme de son retour. Les déréférencements vivants se lisent UNE fois ;
 * au-delà de la borne, chaque candidat est relu par son index.
 */
export async function judicialDelistReader(ctx: ReadCtx): Promise<(targetKind: JudicialTargetKind, targetId: string) => Promise<boolean>> {
  const now = Date.now()
  const { rows, full } = await liveOfKind(ctx, "delist", now)
  if (full) return async (targetKind, targetId) => await holds(ctx, targetKind, targetId, "delist", now)
  const delisted = new Set(rows.map((row) => `${row.targetKind}:${row.targetId}`))
  return async (targetKind, targetId) => delisted.has(`${targetKind}:${targetId}`)
}

export async function isJudiciallyDelisted(ctx: ReadCtx, targetKind: JudicialTargetKind, targetId: string): Promise<boolean> {
  return await holds(ctx, targetKind, targetId, "delist")
}

export type JudicialNotice = { kind: JudicialNoticeKind; text: string; startsAt: number }

/** Le correctif épinglé et l'étiquette d'origine vivants d'une cible, le plus ancien d'abord. */
export async function liveJudicialNotices(ctx: ReadCtx, targetKind: JudicialTargetKind, targetId: string): Promise<JudicialNotice[]> {
  const now = Date.now()
  const { rows } = await activeOnTarget(ctx, targetKind, targetId)
  const notices: JudicialNotice[] = []
  for (const row of rows) {
    if (!isJudicialMeasureLive(row, now)) continue
    if (row.kind === "pin_correction" && row.correctionText !== undefined) notices.push({ kind: "pin_correction", text: row.correctionText, startsAt: row.startsAt })
    if (row.kind === "origin_label" && row.originLabel !== undefined) notices.push({ kind: "origin_label", text: row.originLabel, startsAt: row.startsAt })
  }
  return notices.sort((left, right) => left.startsAt - right.startsAt)
}
