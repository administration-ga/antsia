"use client"

import { api } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import type { PostMediaDto } from "@antsia/social-contracts/media"
import {
  FeedListReturn,
  FeedPostMemoryScope,
  FeedSurfaceMemoryProvider,
  ImmersiveFeedReader,
  ImmersiveFeedSlot,
  ImmersiveStatusSlot,
  PostCard,
  useFeedImmersion,
  useImmersivePageReport,
  type ImmersivePageReport,
} from "@antsia/social-features/reseau-personnel"
import type { FeedItem } from "@convex/modules/posts/posts"
import { zodResolver } from "@hookform/resolvers/zod"
import { ImageIcon, Video } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { z } from "zod"

import { Button, Field, TextInput } from "@/components/shared/controls"
import { routes } from "@/lib/routes"
import { MediaDiscoveryStyles } from "./media-discovery-styles"

type MediaMode = "explore" | "clips"
const mediaFeed = api.modules.posts.mediaFeed.paginate
const MAX_WINDOWS = 6
const WINDOW_SIZE = 18
const searchSchema = z.object({ q: z.string().transform((value) => value.trim().normalize("NFC")).pipe(z.string().max(80)) })
type SearchValues = z.input<typeof searchSchema>
type PageReport = { status: "loading" | "error" | "ready"; ids: string[]; fetching: boolean; isDone: boolean; next: string; revalidationToken: string }
type Filters = { mode: MediaMode; handle?: string; query?: string; cursor: string | null }
type Connectivity = { online: boolean | null; generation: number; revalidationToken: string | null }
const SERVER_CONNECTIVITY: Connectivity = { online: null, generation: 0, revalidationToken: null }

function newRevalidationToken(): string | null {
  try { return globalThis.crypto.randomUUID() } catch { return null }
}

/** Le jeton sépare les souscriptions de chaque connexion ; ce n'est jamais une preuve d'identité. */
function createConnectivityStore() {
  let snapshot: Connectivity = typeof navigator === "undefined" ? SERVER_CONNECTIVITY : { online: navigator.onLine, generation: 0, revalidationToken: navigator.onLine ? newRevalidationToken() : null }
  return {
    getSnapshot: () => snapshot,
    subscribe: (notify: () => void) => {
      const update = () => {
        const online = navigator.onLine
        if (online === snapshot.online) return
        snapshot = { online, generation: snapshot.generation + 1, revalidationToken: online ? newRevalidationToken() : null }
        notify()
      }
      window.addEventListener("offline", update)
      window.addEventListener("online", update)
      update()
      return () => { window.removeEventListener("offline", update); window.removeEventListener("online", update) }
    },
  }
}

function useMediaConnectivity() {
  const [store] = useState(createConnectivityStore)
  return useSyncExternalStore(store.subscribe, store.getSnapshot, () => SERVER_CONNECTIVITY)
}

function admittedMedia(post: FeedItem, mode: MediaMode) {
  return post.media.filter((media) => media.url !== null && media.withheld === null && (mode !== "clips" || media.kind === "video"))
}

/** Les champs de recherche portent sur le texte des publications, jamais sur un annuaire supposé exhaustif. */
function MediaSearch({ mode, handle, query }: Omit<Filters, "cursor">) {
  const { t } = useTranslation("socialExperience")
  const router = useRouter()
  const id = useId()
  const form = useForm<SearchValues>({ resolver: zodResolver(searchSchema), defaultValues: { q: query ?? "" } })
  const { reset } = form
  useEffect(() => { reset({ q: query ?? "" }) }, [query, reset])
  return <form method="get" action={routes.mediaWindow({ mode })} noValidate aria-label={t("search")} className="flex flex-wrap items-end gap-3" onSubmit={form.handleSubmit((values) => router.push(routes.mediaWindow({ mode, handle, query: values.q })))}>
    {handle ? <input type="hidden" name="auteur" value={handle} /> : null}
    <div className="min-w-0 flex-1">
      <Field id={id} label={t("search")} hint={t("searchHint")} error={form.formState.errors.q ? t("failed") : undefined}>
        <TextInput id={id} maxLength={80} type="search" enterKeyHint="search" autoComplete="off" aria-describedby={form.formState.errors.q ? `${id}-error` : `${id}-hint`} aria-invalid={form.formState.errors.q ? true : undefined} {...form.register("q")} />
      </Field>
    </div>
    <Button type="submit" variant="outline">{t("apply")}</Button>
  </form>
}

/** Aucune lecture vidéo automatique dans la grille ; la source n'est attachée qu'à l'approche. */
function DeferredPreview({ media }: { media: PostMediaDto }) {
  const element = useRef<HTMLDivElement>(null)
  const [near, setNear] = useState(false)
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") { setNear(true); return }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { setNear(true); observer.disconnect() }
    }, { rootMargin: "200px" })
    if (element.current) observer.observe(element.current)
    return () => observer.disconnect()
  }, [])
  if (media.url === null || media.withheld !== null) return null
  return <div ref={element} className="h-full w-full">
    {media.kind === "video"
      ? <video src={near ? media.url : undefined} preload={near ? "metadata" : "none"} muted playsInline aria-hidden="true" tabIndex={-1} />
      : <Image src={media.url} alt="" width={media.width ?? 600} height={media.height ?? 750} loading="lazy" unoptimized />}
  </div>
}

function MediaTile({ post }: { post: FeedItem }) {
  const { t } = useTranslation("socialExperience")
  const media = admittedMedia(post, "explore")[0]
  if (!media) return null
  const name = post.page?.name ?? post.author.displayName ?? t("unknownAuthor")
  return <div data-feed-anchor={post._id}>
    <Link href={routes.memberPost(post._id)} className="antsia-media-tile" aria-label={t("open", { name })}>
      <DeferredPreview media={media} />
      <span className="antsia-media-tile-caption">{media.kind === "video" ? <Video aria-hidden="true" className="size-4 shrink-0" /> : <ImageIcon aria-hidden="true" className="size-4 shrink-0" />}<span>{name}</span></span>
    </Link>
    {post.page === null && post.author.handle ? <Link href={routes.clips(post.author.handle)} className="antsia-media-author">{t("authorClips", { handle: post.author.handle })}</Link> : null}
  </div>
}

/** Chaque fenêtre garde sa souscription réactive ; le parent ne retient que curseurs et références. */
function MediaWindowPage({ filters, cursor, index, last, immersive, previousIds, revalidationToken, reconnecting, onReport }: {
  filters: Filters; cursor: string | null; index: number; last: boolean; immersive: boolean; previousIds: string;
  revalidationToken: string; reconnecting: boolean;
  onReport: (index: number, report: PageReport | null) => void;
}) {
  const { t } = useTranslation("socialExperience")
  const { networkId } = useNetwork()
  const router = useRouter()
  const result = useAuthenticatedConvexQuery(mediaFeed, {
    networkId, kind: filters.mode === "clips" ? "video" : "media", revalidationToken,
    ...(filters.handle ? { authorHandle: filters.handle } : {}), ...(filters.query ? { query: filters.query } : {}),
    paginationOpts: { numItems: WINDOW_SIZE, cursor },
  })
  // Une erreur ou une relecture en cours ferme aussi les anciennes données TanStack.
  // Le nouveau jeton après coupure force une clé sans ancien résultat Convex local.
  const data = result.error || result.isFetching ? undefined : result.data
  const posts = useMemo(() => {
    const seen = new Set<string>(JSON.parse(previousIds) as string[])
    return (data?.page ?? []).filter((post) => {
      if (seen.has(post._id) || admittedMedia(post, filters.mode).length === 0) return false
      seen.add(post._id)
      return true
    })
  }, [data, filters.mode, previousIds])
  const ids = JSON.stringify(posts.map((post) => post._id))
  const status = result.error ? "error" : data ? "ready" : "loading"
  const report = useMemo<PageReport>(() => ({ status, ids: JSON.parse(ids) as string[], fetching: result.isFetching, isDone: data?.isDone ?? false, next: data?.continueCursor ?? "", revalidationToken }), [status, ids, result.isFetching, data?.isDone, data?.continueCursor, revalidationToken])
  useEffect(() => { onReport(index, report) }, [index, onReport, report])
  useEffect(() => () => onReport(index, null), [index, onReport])
  const immersiveReport = useMemo<ImmersivePageReport | null>(() => immersive ? { pageKey: `media:${index}`, isFirst: index === 0, isLast: last, status, count: posts.length, lacunar: false, preparing: false, materializedSince: null, newCount: 0 } : null, [immersive, index, last, status, posts.length])
  useImmersivePageReport(immersiveReport)
  const statusContent = result.error
    ? <div role="alert"><p>{t("failed")}</p><Button variant="outline" onClick={() => void result.refetch()}>{t("retry")}</Button></div>
    : !data ? <p role="status">{t(reconnecting ? "reconnect" : "loading")}</p>
      : posts.length === 0 ? <p role="status">{t(data.isDone ? "empty" : "emptyWindow")}</p> : null
  const statusNode = statusContent ? immersive
    ? <ImmersiveStatusSlot id={`media:${index}:status`} busy={status === "loading"}>{statusContent}</ImmersiveStatusSlot>
    : <div className={filters.mode === "explore" ? "antsia-media-grid-status" : undefined}>{statusContent}</div> : null
  return <>
    {posts.map((post) => {
      if (filters.mode === "explore") return <MediaTile key={post._id} post={post} />
      // Un post mixte reste une publication réelle, mais ce parcours montre uniquement ses vidéos admises.
      const clip = { ...post, media: admittedMedia(post, "clips") }
      const card = <PostCard post={clip} now={Date.now()} onTag={(tag) => router.push(routes.memberTag(tag))} onMention={(handle) => router.push(routes.profile(handle))} />
      return immersive
        ? <ImmersiveFeedSlot key={post._id} postId={post._id} label={t("open", { name: post.page?.name ?? post.author.displayName ?? t("unknownAuthor") })}>{card}</ImmersiveFeedSlot>
        : <div key={post._id} className="contents" data-feed-anchor={post._id}><FeedPostMemoryScope postId={post._id}>{card}</FeedPostMemoryScope></div>
    })}
    {statusNode}
  </>
}

function MediaDiscoveryWindow({ filters }: { filters: Filters }) {
  const { t } = useTranslation("socialExperience")
  const [cursors, setCursors] = useState<(string | null)[]>([filters.cursor])
  const [reports, setReports] = useState<Record<number, PageReport>>({})
  const connectivity = useMediaConnectivity()
  const online = connectivity.online === true && connectivity.revalidationToken !== null
  const instance = useId()
  // Une recherche n'inscrit ni son texte ni un contenu privé dans la mémoire de retour.
  const feedId = `media:${filters.mode}:${filters.handle ?? "all"}:${filters.query ? instance : "all"}:${filters.cursor ?? "first"}`
  const immersion = useFeedImmersion({ feedId, depth: cursors.length, ...(filters.mode === "clips" ? { surface: "clips" as const } : {}) })
  const immersive = filters.mode === "clips" && immersion?.immersive === true
  const onReport = useCallback((index: number, report: PageReport | null) => setReports((current) => {
    if (report === null) { if (!(index in current)) return current; const next = { ...current }; delete next[index]; return next }
    if (JSON.stringify(current[index]) === JSON.stringify(report)) return current
    return { ...current, [index]: report }
  }), [])
  const tailReport = reports[cursors.length - 1]
  const tail = tailReport?.revalidationToken === connectivity.revalidationToken ? tailReport : undefined
  const next = online && tail?.status === "ready" && !tail.fetching && !tail.isDone && tail.next && !cursors.includes(tail.next) ? tail.next : null
  const canLoadMore = next !== null && cursors.length < MAX_WINDOWS
  const append = useCallback(() => {
    if (!next) return
    setCursors((current) => current.length === cursors.length && current.length < MAX_WINDOWS && !current.includes(next) ? [...current, next] : current)
  }, [cursors.length, next])
  const exhausted = tail?.status === "ready" && (tail.isDone || cursors.length >= MAX_WINDOWS || (!tail.fetching && !next))
  const controls = <div className="flex flex-col gap-4">
    {filters.mode === "clips" ? <header className="flex flex-col gap-2"><Link href={routes.memberDiscover()} className="min-h-11 self-start underline underline-offset-4">{t("back")}</Link><h1 className="antsia-title">{filters.handle ? t("authorClips", { handle: filters.handle }) : t("clips")}</h1></header> : null}
    <MediaSearch mode={filters.mode} handle={filters.handle} query={filters.query} />
    <nav aria-label={t("filters")} className="flex flex-wrap gap-2">
      <Link className="antsia-media-filter" aria-current={filters.mode === "explore" ? "page" : undefined} href={routes.mediaWindow({ mode: "explore", query: filters.query, handle: filters.handle })}>{t("all")}</Link>
      <Link className="antsia-media-filter" aria-current={filters.mode === "clips" ? "page" : undefined} href={routes.mediaWindow({ mode: "clips", query: filters.query, handle: filters.handle })}>{t("clips")}</Link>
      <Link className="antsia-media-filter" href={routes.shopDirectory()}>{t("shops")}</Link>
    </nav>
    {filters.mode === "clips" && immersion !== null ? <div className="flex flex-wrap gap-2" role="group" aria-label={t("clips")}><Button variant="outline" aria-pressed={!immersive} onClick={() => immersion.changeMode("list")}>{t("list")}</Button><Button variant="outline" aria-pressed={immersive} onClick={() => immersion.changeMode("immersive")}>{t("immersive")}</Button></div> : null}
  </div>
  const token = connectivity.revalidationToken
  // Hors ligne, les fenêtres sont démontées : ni lecteur privé ni observateur de page.
  // À la reprise, une clé neuve attend son résultat courant avant tout média.
  const pages = online && token ? cursors.map((cursor, index) => <MediaWindowPage key={JSON.stringify([cursor, token])} filters={filters} cursor={cursor} index={index} last={index === cursors.length - 1} immersive={immersive} previousIds={JSON.stringify(Array.from({ length: index }, (_, previous) => reports[previous]?.revalidationToken === token ? reports[previous]!.ids : []).flat())} revalidationToken={token} reconnecting={connectivity.generation > 0} onReport={onReport} />) : null
  const footer = <nav aria-label={t("pagination")} className="flex flex-col items-start gap-3">
    {canLoadMore ? <Button variant="outline" onClick={append}>{t("more")}</Button> : null}
    {next && cursors.length >= MAX_WINDOWS ? <><p role="status">{t("windowLimit")}</p><Link className="antsia-media-filter" href={routes.mediaWindow({ ...filters, cursor: next })}>{t("nextWindow")}</Link></> : null}
    {tail?.status === "ready" && !tail.fetching && tail.isDone ? <p role="status">{t("end")}</p> : null}
    {tail?.status === "ready" && !tail.fetching && !tail.isDone && !next ? <p role="alert">{t("failed")}</p> : null}
  </nav>
  return <section className="antsia-media-discovery" aria-label={t(filters.mode === "clips" ? "clips" : "grid")}>
    <MediaDiscoveryStyles />
    <FeedSurfaceMemoryProvider value={immersion?.surfaceMemory ?? null}>
      {!online ? <>{controls}<p role="status">{t(connectivity.online === false ? "offline" : connectivity.online === null ? "loading" : "failed")}</p></> : immersive ? <div className="antsia-clips-reader"><ImmersiveFeedReader label={t("clips")} head={controls} end={footer} canLoadMore={canLoadMore} exhausted={exhausted} onLoadMore={append} depth={cursors.length} restore={immersion?.restore} onRestored={immersion?.onRestored} onAnchor={immersion?.recordSlotAnchor}>{pages}</ImmersiveFeedReader></div>
        : <>{controls}<div className={filters.mode === "explore" ? "antsia-media-grid" : "antsia-clips-list"}>{pages}</div>{footer}{immersion ? <FeedListReturn restore={immersion.restore} onRestored={immersion.onRestored} onAnchor={immersion.recordListAnchor} canLoadMore={canLoadMore} exhausted={exhausted} onLoadMore={append} /> : null}</>}
    </FeedSurfaceMemoryProvider>
  </section>
}

/** Deux parcours de médias sous la même coque membre persistante, sans copie de contenu dans un cache local. */
export function MediaDiscoveryScreen({ mode }: { mode: MediaMode }) {
  const { t } = useTranslation("socialExperience")
  const params = useSearchParams()
  const { networkId, personId } = useNetwork()
  const rawQuery = params.get("q") ?? ""
  const handle = params.get("auteur") || undefined
  const query = rawQuery.trim().normalize("NFC") || undefined
  const cursor = params.get("curseur") || null
  if (rawQuery.length > 80 || (query?.length ?? 0) > 80 || (handle?.length ?? 0) > 80 || (cursor?.length ?? 0) > 4096 || params.getAll("q").length > 1 || params.getAll("auteur").length > 1 || params.getAll("curseur").length > 1) return <section className="antsia-media-discovery"><p role="alert">{t("failed")}</p><Link href={routes.mediaWindow({ mode })}>{t("back")}</Link></section>
  const filters = { mode, handle, query, cursor }
  // Changement de personne, de réseau ou de sélection : aucun curseur ni rapport précédent n'est réadopté.
  return <MediaDiscoveryWindow key={JSON.stringify([networkId, personId, mode, handle, query, cursor])} filters={filters} />
}
