/**
 * profile-overflow — ce que le menu « … » de la fiche d'AUTRUI propose (PF-01).
 *
 * Même patron que `post-overflow.ts` : la composition du menu vit dans un
 * module pur, vérifiable en environnement `node`, et le composant
 * (`ProfileOverflowMenu`) ne fait que la rendre.
 *
 * Trois gestes, tous SILENCIEUX pour la personne visée :
 *  · la sourdine (ses publications quittent MON fil de ce réseau), à bascule ;
 *  · le blocage, à part (geste grave, confirmé) ;
 *  · le signalement du profil (MC-01, brique commune `ReportTargetDialog`),
 *    grave lui aussi et TOUJOURS en dernier, comme au menu d'une publication.
 * Copier le lien (PF-06) viendra ici.
 *
 * ⚠️ La sourdine ne s'offre que si son état est CONNU : proposer « Mettre en
 * sourdine » à quelqu'un déjà en sourdine ferait douter de ce que l'écran a
 * compris. Le blocage, lui, s'offre toujours.
 */
import type { TFunction } from "i18next"

export type ProfileOverflowAction = "mute" | "unmute" | "block" | "report"

export interface ProfileOverflowEntry {
  id: ProfileOverflowAction
  label: string
  hint: string
  /** Geste grave : rendu à part, en fin de menu, en couleur de suppression. */
  grave: boolean
}

export interface ProfileOverflowInput {
  handle: string
  /** `undefined` tant que la lecture n'a pas répondu : l'entrée n'apparaît pas. */
  muted: boolean | undefined
}

export function profileOverflowEntriesFor(input: ProfileOverflowInput, t: TFunction): readonly ProfileOverflowEntry[] {
  const entries: ProfileOverflowEntry[] = []
  if (input.muted === true) {
    entries.push({ id: "unmute", label: t("reseau:profilPersonnePage.overflow.unmute.label"), hint: t("reseau:profilPersonnePage.overflow.unmute.hint"), grave: false })
  } else if (input.muted === false) {
    entries.push({ id: "mute", label: t("reseau:profilPersonnePage.overflow.mute.label"), hint: t("reseau:profilPersonnePage.overflow.mute.hint"), grave: false })
  }
  entries.push({
    id: "block",
    label: t("reseau:profilPersonnePage.overflow.block.label", { handle: input.handle }),
    hint: t("reseau:profilPersonnePage.overflow.block.hint"),
    grave: true,
  })
  entries.push({
    id: "report",
    label: t("reseau:profilPersonnePage.overflow.report.label"),
    hint: t("reseau:profilPersonnePage.overflow.report.hint"),
    grave: true,
  })
  return Object.freeze(entries)
}
