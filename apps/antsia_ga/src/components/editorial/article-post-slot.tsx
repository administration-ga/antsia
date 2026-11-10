"use client"

import { api, type Id } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import Link from "next/link"
import { useTranslation } from "react-i18next"
import { routes } from "@/lib/routes"

/** Une référence relue : aucune copie du titre ou d'une ancienne version dans le post. */
export function ArticlePostSlot({ networkId, postId }: { networkId: Id<"networks">; postId: Id<"posts"> }) {
  const { personId } = useNetwork()
  return <ArticlePostQuery key={JSON.stringify([networkId, personId, postId])} networkId={networkId} postId={postId} />
}

function ArticlePostQuery({ networkId, postId }: { networkId: Id<"networks">; postId: Id<"posts"> }) {
  const { t, i18n } = useTranslation("editorialPublic")
  const { personId } = useNetwork()
  const query = useAuthenticatedConvexQuery(api.modules.editorial.social.card, { networkId, postId, readerScope: personId })
  if (query.isError || (!query.isPending && !query.isFetching && !query.data)) return <p role="status" className="px-4 py-3 text-sm text-muted-foreground">{t("previewUnavailable")}</p>
  if (query.isPending || query.isFetching || query.data === undefined) return <p role="status" className="px-4 py-3 text-sm text-muted-foreground">{t("loading")}</p>
  const article = query.data
  if (!article) return null
  return <aside aria-label={t("articlePreview")} className="grid min-w-0 gap-3 rounded-[var(--ui2-card-radius)] border border-border bg-card p-4 [overflow-wrap:anywhere]">
    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">{article.sectionLabel ? <span>{article.sectionLabel}</span> : null}<time dateTime={new Date(article.publishedAt).toISOString()}>{new Intl.DateTimeFormat(i18n.resolvedLanguage ?? "fr", { dateStyle: "long", timeZone: "Africa/Libreville" }).format(article.publishedAt)}</time></div>
    <h3 className="text-xl font-semibold leading-snug"><Link href={routes.memberArticle(article.handle, article.articleKey)} className="rounded-sm hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">{article.title}</Link></h3>
    {article.excerpt ? <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{article.excerpt}</p> : null}
    <Link href={routes.memberArticle(article.handle, article.articleKey)} className="inline-flex min-h-11 items-center justify-self-start rounded-[var(--ui2-button-radius)] px-3 text-sm font-semibold hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">{t("read")}<span className="sr-only"> : {article.title}</span></Link>
    <Link href={routes.memberPost(postId)} className="inline-flex min-h-11 items-center justify-self-start rounded-[var(--ui2-button-radius)] px-3 text-sm font-medium hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">{t("discuss")}</Link>
  </aside>
}
