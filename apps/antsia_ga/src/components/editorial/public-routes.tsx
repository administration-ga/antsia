import Link from "next/link"
import { notFound } from "next/navigation"
import { PublicShell, PUBLIC_CTA } from "@/components/public/public-shell"
import { PublicStatus } from "@/components/public/public-status"
import { getAppT } from "@/i18n/server"
import { editorialReadingLabels, editorialReadingSearch } from "@/lib/editorial-reading"
import { publicMetadata, publicSearch } from "@/lib/public-data"
import { loadPublicEditorialArticle, loadPublicEditorialMedia } from "@/lib/public-editorial-data"
import { decodeRouteSegment } from "@/lib/route-params"
import { routes } from "@/lib/routes"
import { getPublicLocale } from "@/lib/server-session"
import { PublicEditorialNavigation } from "./public-navigation"
import { EditorialArticleContent, EditorialMediaContent } from "./site-content"

type MediaProps = { params: Promise<{ handle: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>> }
type ArticleProps = { params: Promise<{ handle: string; articleKey: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>> }
async function request(props: MediaProps) { const params = await props.params, search = await props.searchParams ?? {}; return { handle: decodeRouteSegment(params.handle), search: editorialReadingSearch(search), handoff: publicSearch(search).handoff } }

export async function PublicMediaMetadata(props: MediaProps) {
  const { t } = getAppT(await getPublicLocale()), input = await request(props)
  const result = input.handle && input.search ? await loadPublicEditorialMedia(input.handle, input.search.section, input.search.cursor, input.handoff) : null
  return result?.status === "ready" && result.data ? publicMetadata(result.data.name, result.data.description.slice(0, 180), routes.publicMedia(result.data.handle)) : publicMetadata(t("editorialPublic:title"), t("editorialPublic:lead"), routes.home(), false)
}
export async function PublicMediaScreen(props: MediaProps) {
  const input = await request(props)
  if (!input.handle || !input.search) notFound()
  const locale = await getPublicLocale(), { t } = getAppT(locale)
  const result = await loadPublicEditorialMedia(input.handle, input.search.section, input.search.cursor, input.handoff)
  if (result.status !== "ready") return <PublicShell viewer={result.status}><PublicStatus status={result.status} locale={locale} /></PublicShell>
  if (!result.data) notFound()
  return <PublicShell viewer={result.viewer} specialized={{ kind: "media", handle: result.data.handle }}><PublicEditorialNavigation handle={result.data.handle} search={input.search} snapshotId={crypto.randomUUID()}><EditorialMediaContent media={result.data} locale={locale} labels={editorialReadingLabels(key => t(`editorialPublic:${key}`))} section={input.search.section} cursor={input.search.cursor} publicView /></PublicEditorialNavigation></PublicShell>
}
export async function PublicArticleMetadata(props: ArticleProps) {
  const params = await props.params, handle = decodeRouteSegment(params.handle), key = decodeRouteSegment(params.articleKey), { t } = getAppT(await getPublicLocale())
  const result = handle && key ? await loadPublicEditorialArticle(handle, key, publicSearch(await props.searchParams ?? {}).handoff) : null
  return result?.status === "ready" && result.data ? publicMetadata(result.data.title, result.data.chapeau.slice(0, 180) || result.data.mediaName, routes.publicArticle(result.data.mediaHandle, result.data.articleKey)) : publicMetadata(t("editorialPublic:title"), t("editorialPublic:lead"), routes.home(), false)
}
export async function PublicArticleScreen(props: ArticleProps) {
  const params = await props.params, handle = decodeRouteSegment(params.handle), articleKey = decodeRouteSegment(params.articleKey)
  if (!handle || !articleKey) notFound()
  const locale = await getPublicLocale(), { t } = getAppT(locale), result = await loadPublicEditorialArticle(handle, articleKey, publicSearch(await props.searchParams ?? {}).handoff)
  if (result.status !== "ready") return <PublicShell viewer={result.status}><PublicStatus status={result.status} locale={locale} /></PublicShell>
  if (!result.data) notFound()
  const destination = { kind: "article", handle: result.data.mediaHandle, articleKey: result.data.articleKey } as const
  const member = result.viewer === "authenticated" ? routes.memberArticle(destination.handle, destination.articleKey) : routes.signIn(undefined, undefined, undefined, undefined, destination)
  return <PublicShell viewer={result.viewer} specialized={destination}><EditorialArticleContent article={result.data} locale={locale} labels={editorialReadingLabels(key => t(`editorialPublic:${key}`))} publicView /><div className="mx-auto mt-8 flex max-w-[76ch] flex-wrap gap-3"><Link href={member} prefetch={false} className={PUBLIC_CTA}>{t("editorialPublic:openMember")}</Link></div></PublicShell>
}
