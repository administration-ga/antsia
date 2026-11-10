"use client"

import { api, type Id } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import type { ModerationSurface } from "@antsia/social-domain/moderationPolicy"
import { PostMedia } from "@antsia/social-features/reseau-personnel"
import type { FunctionArgs } from "convex/server"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shared/controls"

export function useModerationPreview(input: { reportId: Id<"reports">; target?: never } | { target: { kind: ModerationSurface; id: string }; reportId?: never }) {
  const { networkId } = useNetwork()
  // La paire kind/id vient de la projection de file autorisée ; les validateurs
  // précis et l'autorité sont relus par la query, sans identifiant de lecteur.
  return useAuthenticatedConvexQuery(api.modules.moderation.reviewProjection.preview, input.reportId ? { networkId, reportId: input.reportId } : { networkId, target: input.target as NonNullable<FunctionArgs<typeof api.modules.moderation.reviewProjection.preview>["target"]> })
}

/** La preuve ne contient que la révision relue, jamais le corps signé ni le contenu privé. */
export function moderationSourceProof(preview: { sourceRevision?: number; sourceDigest?: string } | undefined) {
  const revision = preview?.sourceRevision, digest = preview?.sourceDigest
  return revision !== undefined && Number.isSafeInteger(revision) && revision >= 1 && digest !== undefined && /^[a-f0-9]{64}$/.test(digest)
    ? { expectedSourceRevision: revision, expectedSourceDigest: digest }
    : null
}

export function ModerationPreview({ query, allowDismiss = false }: { query: ReturnType<typeof useModerationPreview>; allowDismiss?: boolean }) {
  const { t } = useTranslation("memberNetwork")
  if (query.error) return <div role="alert" className="rounded-lg border border-destructive p-3"><p>{t("moderation.previewFailed")}</p><Button variant="outline" type="button" onClick={() => void query.refetch()}>{t("common.retry")}</Button></div>
  if (!query.data) return <p role="status">{t("common.loading")}</p>
  if (!query.data.available) return <p role="status" className="rounded-lg border border-border bg-muted p-3 text-sm">{t(allowDismiss ? "moderation.previewDismissOnly" : "moderation.previewUnavailable")}</p>
  return <section aria-label={t("moderation.preview")} className="flex min-w-0 flex-col gap-3 rounded-lg border border-border p-3">
    <p className="text-xs font-medium text-muted-foreground">{t("moderation.previewBounded")}</p>
    {query.data.title ? <h3 className="break-words font-semibold">{query.data.title}</h3> : null}
    {query.data.body ? <p className="break-words whitespace-pre-wrap text-sm">{query.data.body}</p> : null}
    {query.data.media.length > 0 ? <PostMedia media={query.data.media} /> : null}
    {!query.data.title && !query.data.body && query.data.media.length === 0 ? <p className="text-sm text-muted-foreground">{t("moderation.previewNoText")}</p> : null}
  </section>
}
