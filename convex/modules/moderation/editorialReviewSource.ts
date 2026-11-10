/** MP12 : seule la version éditoriale assignée, intégrale et liée à ses parents courants. */
import { engineErrorCode } from "@antsia/social-contracts/errors"
import { EDITORIAL_TEXT_BYTES_MAX, parseEditorialConfigInput, parseEditorialDraftInput } from "@antsia/social-domain/editorial"

import type { Id } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
import { editorialMediaOf, editorialPageOrNull } from "../editorial/access"
import { editorialDigest, editorialMediaModerationText, editorialVersionModerationText } from "../editorial/rules"

export async function editorialReviewSource(ctx: Pick<QueryCtx, "db">, networkId: Id<"networks">, versionId: Id<"editorialVersions">) {
  const version = await ctx.db.get(versionId)
  if (!version || version.networkId !== networkId || !Number.isSafeInteger(version.versionNumber) || version.versionNumber < 1 || !/^[a-f0-9]{64}$/.test(version.digest)) return null
  const [article, page, network, media] = await Promise.all([ctx.db.get(version.articleId), editorialPageOrNull(ctx, networkId, version.pageId), ctx.db.get(networkId), editorialMediaOf(ctx, version.pageId)])
  if (!article || article.networkId !== networkId || article.pageId !== version.pageId || version.versionNumber > article.versionCount ||
    !page || page.networkId !== networkId || page.status !== "active" || !network || network.status !== "active" || !media || media.networkId !== networkId) return null
  if (!parseEditorialDraftInput({ title: version.title, chapeau: version.chapeau, sectionKey: version.sectionKey, byline: version.byline, correctionNotice: version.correctionNotice, blocks: version.blocks })) return null
  let body: string
  try { body = await editorialVersionModerationText(ctx, version) } catch (error) {
    const code = engineErrorCode(error)
    if (code === "notFound" || code === "invalidArgument") return null
    throw error
  }
  if (new TextEncoder().encode(body).byteLength > EDITORIAL_TEXT_BYTES_MAX) return null
  // La preuve associe le digest du snapshot immuable et TOUT le texte
  // effectivement relu, y compris descriptions/crédits d'assets. Aucune URL de fichier.
  const sourceDigest = await editorialDigest(["editorial-review-v1", version._id, version.versionNumber, version.digest, body])
  return { title: version.title, body, sourceRevision: version.versionNumber, sourceDigest }
}

/** La configuration de média a sa propre cible ; elle ne réécrit ni la page ni ses articles. */
export async function editorialMediaReviewSource(ctx: Pick<QueryCtx, "db">, networkId: Id<"networks">, mediaId: Id<"editorialMedia">) {
  const media = await ctx.db.get(mediaId)
  if (!media || media.networkId !== networkId || !Number.isSafeInteger(media.revision) || media.revision < 1) return null
  const [page, network, current] = await Promise.all([editorialPageOrNull(ctx, networkId, media.pageId), ctx.db.get(networkId), editorialMediaOf(ctx, media.pageId)])
  if (!page || !network || network.status !== "active" || current?._id !== mediaId) return null
  if (!parseEditorialConfigInput({ description: media.description, sections: media.sections, visibility: media.visibility,
    ...(media.visibility === "public" ? { publicConsentTextVersion: media.publicConsentTextVersion } : {}) })) return null
  const body = editorialMediaModerationText(media)
  if (new TextEncoder().encode(body).byteLength > EDITORIAL_TEXT_BYTES_MAX) return null
  return { title: null, body, sourceRevision: media.revision, sourceDigest: await editorialDigest(["editorial-media-review-v1", media._id, media.revision, body]) }
}
