"use client"

import { api } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import { GABON_PROVINCES, isProvinceSlug } from "@antsia/social-domain/provinces"
import {
  FeedListReturn,
  FeedModeToggle,
  FeedPostMemoryScope,
  FeedSurfaceMemoryProvider,
  ImmersiveFeedReader,
  ImmersiveFeedSlot,
  ImmersiveStatusSlot,
  PostCard,
  useFeedImmersion,
  useImmersiveFrozenHead,
  useImmersivePageReport,
  type ImmersivePageReport,
} from "@antsia/social-features/reseau-personnel"
import { zodResolver } from "@hookform/resolvers/zod"
import type { FunctionReturnType } from "convex/server"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useId, useMemo } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { z } from "zod"

import { MemberPage } from "@/components/member-chrome"
import { Button, Field } from "@/components/shared/controls"
import { routes } from "@/lib/routes"
import type { MemberFeedFilter } from "./member-feed-filter"

type NationalPost = FunctionReturnType<typeof api.modules.discovery.discovery.rootFeed>["page"][number]

const noop = () => {}

/** Un choix de province : « toutes » (vide) ou un identifiant de province connu. */
const provinceFilterSchema = z.object({ province: z.string().refine((value) => value === "" || isProvinceSlug(value)) })
// Valeurs SAISIES (entrée du schéma) : le prédicat de `refine` rétrécit seulement la sortie.
type ProvinceFilterValues = z.input<typeof provinceFilterSchema>

/**
 * P18b (A12, WCAG 3.2.2) : choisir une province ne change PLUS de page à
 * chaque `change` — sous Windows, une flèche au clavier naviguait dès la
 * première option. La page change à la VALIDATION (« Afficher »), comme un
 * formulaire GET ; l'adresse reste construite par les routes de l'application.
 */
export function ProvinceFilterForm({ current }: { current: string | undefined }) {
  const { t } = useTranslation("memberNetwork")
  const router = useRouter()
  const id = useId()
  const form = useForm<ProvinceFilterValues>({ resolver: zodResolver(provinceFilterSchema), defaultValues: { province: current ?? "" } })
  const { reset } = form
  // L'adresse change (lien, retour arrière) : le choix affiché suit la province courante.
  useEffect(() => { reset({ province: current ?? "" }) }, [current, reset])
  const submit = form.handleSubmit(({ province }) => router.push(isProvinceSlug(province) ? routes.memberProvince(province) : routes.nationalFeed()))
  return <form noValidate onSubmit={(event) => { void submit(event) }} className="flex flex-wrap items-end gap-3">
    <div className="min-w-0 flex-1">
      <Field id={id} label={t("discovery.provinceLabel")}>
        <select id={id} className="min-h-11 w-full rounded-lg border border-input bg-background px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" {...form.register("province")}>
          <option value="">{t("discovery.allProvinces")}</option>
          {GABON_PROVINCES.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}
        </select>
      </Field>
    </div>
    <Button type="submit" variant="outline">{t("discovery.provinceApply")}</Button>
  </form>
}

/**
 * Les publications d'une fenêtre dans le lecteur immersif (P04). La PREMIÈRE
 * fenêtre (sans curseur) retient en tête les publications arrivées pendant la
 * lecture : le lecteur propose de les voir, rien ne s'insère sous la lecture.
 */
function NationalSlots({ posts, first, now, onTag, onMention }: { posts: readonly NationalPost[]; first: boolean; now: number; onTag: (tag: string) => void; onMention: (handle: string) => void }) {
  const { t } = useTranslation("reseau")
  const ids = useMemo(() => (first ? posts.map((post): string => post._id) : null), [first, posts])
  const hidden = useImmersiveFrozenHead(ids)
  const shown = hidden > 0 ? posts.slice(hidden) : posts
  const report = useMemo<ImmersivePageReport>(
    () => ({ pageKey: "national", isFirst: true, isLast: true, status: "ready", count: shown.length, lacunar: false, preparing: false, materializedSince: null, newCount: hidden }),
    [shown.length, hidden],
  )
  useImmersivePageReport(report)
  return <>
    {shown.map((post) => (
      <ImmersiveFeedSlot key={post._id} postId={post._id} label={t("immersiveFeed.slotLabel", { name: post.page?.name ?? post.author.displayName ?? t("postCard.unknownAuthor") })}>
        <PostCard post={post} now={now} onTag={onTag} onMention={onMention} />
      </ImmersiveFeedSlot>
    ))}
  </>
}

export function MemberDiscoveryFeed({ filter }: { filter: Extract<MemberFeedFilter, { kind: "national" }> }) {
  const { t } = useTranslation("memberNetwork")
  const { t: tReseau } = useTranslation("reseau")
  const { networkId } = useNetwork()
  const router = useRouter()
  const query = useAuthenticatedConvexQuery(api.modules.discovery.discovery.rootFeed, {
    networkId,
    paginationOpts: { numItems: 20, cursor: filter.cursor ?? null, maximumRowsRead: 100, maximumBytesRead: 1_048_576 },
    ...(filter.province ? { province: filter.province } : {}),
    ...(filter.tag ? { tag: filter.tag } : {}),
  })
  const province = GABON_PROVINCES.find((item) => item.slug === filter.province)
  const page = query.data
  const now = Date.now()
  /*
   * P04 — le lecteur immersif sur les portées National, province et mot-clé,
   * quand l'application le déclare (`feedPresentation`). La fenêtre reste
   * celle de l'adresse (curseur `curseur`) : « Suivant » et « Première page »
   * gardent leur rôle, dans la fin du lecteur. L'identifiant du fil porte la
   * mémoire de retour de l'onglet, sans adresse ni contenu.
   */
  const feedId = `national:${filter.province ?? "*"}:${filter.tag ?? "*"}:${filter.cursor ?? "first"}`
  const immersion = useFeedImmersion({ feedId, depth: 1 })
  const onTag = (tag: string) => router.push(routes.memberTag(tag))
  const onMention = (handle: string) => router.push(routes.profile(handle))

  const header = <header className="flex flex-col gap-2">
    <Link href={routes.feed()} className="inline-flex min-h-11 items-center self-start rounded-lg px-3 text-sm underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{t("discovery.back")}</Link>
    <h1 className="text-2xl font-semibold">{province ? t("discovery.provinceTitle", { name: province.name }) : filter.tag ? t("discovery.tagTitle", { tag: filter.tag }) : t("discovery.nationalTitle")}</h1>
    <p className="text-sm text-muted-foreground">{t("discovery.memberScope")}</p>
  </header>
  const provinceField = <ProvinceFilterForm current={filter.province} />
  const publicLink = <Link href={routes.discover()} className="inline-flex min-h-11 items-center self-start rounded-lg px-3 text-sm underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{t("discovery.publicDiscover")}</Link>
  const emptyNote = page && page.page.length === 0 ? <p role="status" className="rounded-xl border border-border bg-card p-5 text-muted-foreground">{t(page.isDone ? "discovery.empty" : "discovery.emptyWindow")}</p> : null
  const pagination = page ? <nav aria-label={t("discovery.pagination")} className="flex flex-wrap items-center justify-between gap-2">
    {filter.cursor ? <Link href={routes.memberFeedWindow(filter)} className="inline-flex min-h-11 items-center rounded-lg border border-border px-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{t("common.firstPage")}</Link> : <span />}
    {!page.isDone ? <Button variant="outline" disabled={!page.continueCursor || page.continueCursor === filter.cursor} onClick={() => router.push(routes.memberFeedWindow(filter, page.continueCursor))}>{t("common.next")}</Button> : <p role="status" className="text-sm text-muted-foreground">{t("common.end")}</p>}
  </nav> : null

  if (immersion !== null && immersion.immersive && !query.error) {
    // Une publication par hauteur disponible ; la fenêtre suivante reste un
    // geste explicite (« Suivant »), jamais un changement d'adresse automatique.
    return <MemberPage>
      <div className="flex w-full flex-col pb-[env(safe-area-inset-bottom)]">
        <FeedSurfaceMemoryProvider value={immersion.surfaceMemory}>
          <ImmersiveFeedReader
            key={feedId}
            label={tReseau("immersiveFeed.label")}
            head={<>{header}{provinceField}{publicLink}</>}
            toggle={<FeedModeToggle state={immersion.mode} onChange={immersion.changeMode} />}
            end={<>{emptyNote}{pagination}</>}
            // Une fenêtre d'adresse ne se prolonge pas dans le lecteur : chargée,
            // elle est complète (une publication absente n'y sera pas rechargée).
            exhausted={page !== undefined}
            restore={immersion.restore}
            onRestored={immersion.onRestored}
            onAnchor={immersion.recordSlotAnchor}
          >
            {page ? <NationalSlots posts={page.page} first={filter.cursor === undefined} now={now} onTag={onTag} onMention={onMention} /> : <ImmersiveStatusSlot id="national:loading" busy><p role="status">{t("common.loading")}</p></ImmersiveStatusSlot>}
          </ImmersiveFeedReader>
        </FeedSurfaceMemoryProvider>
      </div>
    </MemberPage>
  }

  const listed = page ? <>
    {page.page.length === 0 ? emptyNote : page.page.map((post) => immersion !== null
      ? <div key={post._id} className="contents" data-feed-anchor={post._id}><FeedPostMemoryScope postId={post._id}><PostCard post={post} now={now} onTag={onTag} onMention={onMention} /></FeedPostMemoryScope></div>
      : <PostCard key={post._id} post={post} now={now} onTag={onTag} onMention={onMention} />)}
    {pagination}
    {immersion !== null ? <FeedListReturn restore={immersion.restore} onRestored={immersion.onRestored} onAnchor={immersion.recordListAnchor} canLoadMore={false} exhausted onLoadMore={noop} /> : null}
  </> : null

  return <MemberPage>
    <div className="flex w-full flex-col gap-5 pb-[env(safe-area-inset-bottom)]">
      {header}
      {/* P04 : la bascule Liste/Immersion, toujours visible et nommée — absente sans déclaration de l'application. */}
      {immersion !== null ? <div className="fil-mode-row"><FeedModeToggle state={immersion.mode} onChange={immersion.changeMode} /></div> : null}
      {provinceField}
      {publicLink}
      {query.error ? <div role="alert" className="rounded-xl border border-destructive p-4"><p>{t("common.failed")}</p><Button variant="outline" onClick={() => void query.refetch()}>{t("common.retry")}</Button></div>
        : !page ? <p role="status">{t("common.loading")}</p>
          : immersion !== null ? <FeedSurfaceMemoryProvider value={immersion.surfaceMemory}>{listed}</FeedSurfaceMemoryProvider> : listed}
    </div>
  </MemberPage>
}
