"use client"

import { api } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import { useSearchParams } from "next/navigation"
import { Suspense } from "react"
import { useTranslation } from "react-i18next"
import { MemberPage } from "@/components/member-chrome"
import { Button } from "@/components/shared/controls"
import { editorialReadingLabels, editorialReadingSearch } from "@/lib/editorial-reading"
import { ArticleSocialActions } from "./article-social-actions"
import { EditorialArticleContent, EditorialMediaContent } from "./site-content"

export function MemberMediaScreen({ handle }: { handle: string }) {
  const { t } = useTranslation("editorialPublic")
  return <MemberPage><Suspense fallback={<p role="status">{t("loading")}</p>}><MediaQuery handle={handle} /></Suspense></MemberPage>
}
function MediaQuery({ handle }: { handle: string }) {
  const params = useSearchParams(), { networkId, personId } = useNetwork(), { t, i18n } = useTranslation("editorialPublic")
  const raw = Object.fromEntries([...new Set(params.keys())].map(key => { const values = params.getAll(key); return [key, values.length === 1 ? values[0]! : values] }))
  const search = editorialReadingSearch(raw)
  const query = useAuthenticatedConvexQuery(api.modules.editorial.read.media, search ? { networkId, readerScope: personId, handle, paginationOpts: { cursor: search.cursor, numItems: 12 }, ...(search.section ? { section: search.section } : {}) } : "skip")
  if (!search) return <p role="alert">{t("invalid")}</p>
  if (query.isError) return <ReadingError retry={() => { void query.refetch() }} />
  if (query.isPending || query.isFetching || query.data === undefined) return <p role="status">{t("loading")}</p>
  if (!query.data) return <p role="alert">{t("unavailable")}</p>
  return <EditorialMediaContent media={query.data} locale={i18n.resolvedLanguage ?? "fr"} labels={editorialReadingLabels(t)} section={search.section} cursor={search.cursor} />
}

export function MemberArticleScreen({ handle, articleKey }: { handle: string; articleKey: string }) {
  const { networkId, personId } = useNetwork()
  return <MemberPage><ArticleQuery key={JSON.stringify([networkId, personId, handle, articleKey])} handle={handle} articleKey={articleKey} /></MemberPage>
}
function ArticleQuery({ handle, articleKey }: { handle: string; articleKey: string }) {
  const { networkId, personId } = useNetwork(), { t, i18n } = useTranslation("editorialPublic")
  const query = useAuthenticatedConvexQuery(api.modules.editorial.read.article, { networkId, readerScope: personId, handle, articleKey })
  if (query.isError) return <ReadingError retry={() => { void query.refetch() }} />
  if (query.isPending || query.isFetching || query.data === undefined) return <p role="status">{t("loading")}</p>
  if (!query.data) return <p role="alert">{t("unavailable")}</p>
  return <><EditorialArticleContent article={query.data} locale={i18n.resolvedLanguage ?? "fr"} labels={editorialReadingLabels(t)} /><ArticleSocialActions handle={query.data.mediaHandle} articleKey={query.data.articleKey} versionId={query.data.versionId} /></>
}
function ReadingError({ retry }: { retry: () => void }) {
  const { t } = useTranslation("editorialPublic")
  return <div role="alert" className="grid gap-3"><p>{t("unavailable")}</p><Button variant="outline" className="justify-self-start" onClick={retry}>{t("retry")}</Button></div>
}
