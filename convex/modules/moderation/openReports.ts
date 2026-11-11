/**
 * SD-01 — un objet sous signalement OUVERT : un dossier `open` ou `reviewing` le vise encore.
 *
 * La modération doit pouvoir relire ce qu'on lui a transmis jusqu'à sa décision : une purge de
 * contenu éphémère (la Story, `stories.purgeExpired`) consulte cette règle avant d'effacer, et
 * efface au passage suivant, une fois la décision prise (`dismissed` ou `actioned`). Les dossiers
 * de relecture préalable (`source: "pre_review"`) naissent tranchés : ils ne retiennent rien.
 *
 * Aucune écriture, aucun contenu lu : la seule existence d'un dossier ouvert, par l'index de la cible.
 */
import type { ModerationSurface } from "@antsia/social-domain/moderationPolicy"

import type { QueryCtx } from "../../_generated/server"

/** Les statuts d'un dossier qui attend encore sa décision. */
const UNDECIDED_REPORT_STATUSES = ["open", "reviewing"] as const

export async function hasOpenReport(ctx: Pick<QueryCtx, "db">, kind: ModerationSurface, id: string): Promise<boolean> {
  for (const status of UNDECIDED_REPORT_STATUSES) {
    // borné : une seule ligne lue par statut, sur l'index exact de la cible.
    const row = await ctx.db
      .query("reports")
      .withIndex("by_target_status", (q) => q.eq("targetKind", kind).eq("targetId", id).eq("status", status))
      .first()
    if (row !== null) return true
  }
  return false
}
