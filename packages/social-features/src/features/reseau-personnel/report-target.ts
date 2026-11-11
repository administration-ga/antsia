/**
 * report-target — ce que la brique commune « Signaler depuis n'importe quel
 * objet » (MC-01, plan directeur § 5.1) sait signaler, et ce qu'elle en dit.
 *
 * Module pur, testé en environnement `node` : aucune phrase n'y est écrite,
 * seulement des clés qualifiées (`reseau:reportContentDialog.*`).
 *
 * Une CIBLE est exactement celle du moteur (`moderation.cases.report`,
 * `moderationTargetValidator`) : la nature et l'identifiant de l'objet. La
 * surface la tient déjà (la fiche, la carte, la bulle) ; la brique ne
 * recalcule rien, le moteur rejuge tout (audience réelle, auto-signalement,
 * doublon) et rend un refus indistinct.
 *
 * Les publications et commentaires gardent leur chemin historique
 * (`moderation.moderation.reportPost` / `reportComment`, avec précision
 * facultative), les profils professionnels et articles le leur : ils ne
 * passent pas par ici, mais partagent le même dialogue.
 */
import type { api } from "@antsia/api/engine"
import type { FunctionArgs } from "convex/server"

/** Les natures d'objet que la brique signale, dans l'ordre de la liste du plan 12 (MC-01). */
export const REPORT_TARGET_KINDS = [
  "person",
  "page",
  "thematicGroup",
  "event",
  "story",
  "live",
  "album",
  "commerceOffer",
  "commerceStorefront",
  "commerceJob",
  "serviceReview",
  "groupMessage",
  "personalMessage",
] as const

export type ReportTargetKind = (typeof REPORT_TARGET_KINDS)[number]

type EngineReportTarget = FunctionArgs<typeof api.modules.moderation.cases.report>["target"]

/** La cible d'un signalement : celle du moteur, restreinte aux natures de la brique. */
export type ReportTarget = Extract<EngineReportTarget, { kind: ReportTargetKind }>

/**
 * Les natures historiques du dialogue (publication et commentaire du fil,
 * profil professionnel, collaboration, article, média), signalées par leurs
 * propres chemins mais sous le même dialogue.
 */
export const REPORT_DIALOG_LEGACY_KINDS = [
  "publication",
  "commentaire",
  "professionalProfile",
  "professionalCollaboration",
  "editorialVersion",
  "editorialMedia",
] as const

/** Toute nature que le dialogue sait titrer. */
export type ReportDialogKind = (typeof REPORT_DIALOG_LEGACY_KINDS)[number] | ReportTargetKind

export const REPORT_DIALOG_KINDS: readonly ReportDialogKind[] = Object.freeze([...REPORT_DIALOG_LEGACY_KINDS, ...REPORT_TARGET_KINDS])

/** Le titre du dialogue pour une nature (« Signaler ce profil », « Signaler ce message »…). */
export function reportDialogTitleKey(kind: ReportDialogKind): string {
  return `reseau:reportContentDialog.title.${kind}`
}

/**
 * L'issue d'une transmission acceptée par le moteur : un dossier neuf
 * (`sent` : accusé de réception émis, contenu masqué pour le déclarant), ou
 * le rejeu d'un signalement déjà fait (`already` : aucun doublon, même suivi).
 */
export type ReportAcknowledgement = "sent" | "already"

export function reportAcknowledgementOf(result: { created: boolean }): ReportAcknowledgement {
  return result.created ? "sent" : "already"
}

/** La phrase de l'accusé, dite par un toast (annoncé) : il survit à la surface qui disparaît. */
export function reportAcknowledgementKey(acknowledgement: ReportAcknowledgement): string {
  return `reseau:reportContentDialog.acknowledgement.${acknowledgement}`
}
