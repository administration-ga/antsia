/** MP09 : extrait intégral borné et preuve de la seule révision professionnelle relue. */
import type { Id } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
import { professionalModerationText } from "../professionals/rules"

type ProfessionalTarget = { kind: "professionalProfile"; id: Id<"professionalProfiles"> } | { kind: "professionalCollaboration"; id: Id<"professionalCollaborations"> }
export type ProfessionalReviewSource = { title: string | null; body: string; sourceRevision: number; sourceDigest: string }

export async function professionalReviewSource(ctx: Pick<QueryCtx, "db">, networkId: Id<"networks">, target: ProfessionalTarget): Promise<ProfessionalReviewSource | null> {
  let title: string | null, body: string, revision: number
  if (target.kind === "professionalProfile") {
    const row = await ctx.db.get(target.id)
    if (!row || row.networkId !== networkId) return null
    title = row.title
    body = professionalModerationText(row)
    revision = row.revision
    // Le contrat borne tous les champs ; aucune clause finale du portfolio n'est tronquée.
    if (title.length > 120 || body.length > 12_000) return null
  } else {
    const row = await ctx.db.get(target.id)
    if (!row || row.networkId !== networkId || row.message.length > 600) return null
    title = null
    body = row.message
    revision = row.revision
  }
  if (!Number.isSafeInteger(revision) || revision < 1) return null
  const bytes = new TextEncoder().encode(JSON.stringify([target.kind, target.id, revision, title, body]))
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return { title, body, sourceRevision: revision, sourceDigest: [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("") }
}
