import { BRAND_NAME } from "@antsia/social-contracts/brand"
import type { PublicLegalDeadlines } from "@antsia/social-contracts/publicNetwork"
import { REPORT_DEADLINES_ORDINANCE, reportDecisionDelayHours } from "@antsia/social-domain/moderation"
import { GABON_PROVINCES, isProvinceSlug } from "@antsia/social-domain/provinces"
import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"

import { AccessHomeScreen } from "@/components/access-home-screen"
import { getAppT } from "@/i18n/server"
import { loadOfficialPage, loadOfficialPagePosts, loadPublicPost, loadPublicPosts, loadPublicProfile, loadPublicSnapshot, loadPublicTransparency, loadPublicTransparencyDeadlines, publicMetadata, publicSearch } from "@/lib/public-data"
import { decodeRouteSegment } from "@/lib/route-params"
import { routes } from "@/lib/routes"
import { getPublicLocale } from "@/lib/server-session"
import { getPublicT, publicDate } from "./public-copy"
import { PublicFeed } from "./public-feed"
import { PublicLegalContent } from "./public-legal"
import { PublicIdentity, PublicPostCard } from "./public-post-card"
import { PUBLIC_CTA, PUBLIC_LINK, PublicShell } from "./public-shell"
import { PublicStatus } from "./public-status"

type Search = Promise<Record<string, string | string[] | undefined>>
export type PublicPageProps = { searchParams?: Search }
export type PublicDynamicProps<T extends string> = PublicPageProps & { params: Promise<Record<T, string>> }
const searchOf = async (props: PublicPageProps) => publicSearch(await props.searchParams ?? {})

async function fallbackMetadata(path: string) {
  const t = getPublicT(await getPublicLocale())
  return publicMetadata(t("states.refused.title"), t("states.refused.body"), path, false)
}

export async function HomeMetadata(props: PublicPageProps) {
  if ((await searchOf(props)).handoff) return fallbackMetadata(routes.home())
  const { t } = getAppT(await getPublicLocale())
  return publicMetadata(t("meta.title"), t("access.lead"), routes.home())
}

export async function HomeScreen(props: PublicPageProps) {
  const search = await searchOf(props)
  if (search.handoff) return <PublicShell viewer="handoff"><PublicStatus status="handoff" locale={await getPublicLocale()} /></PublicShell>
  return <AccessHomeScreen />
}

function ProvinceLinks({ locale }: { locale: "fr" | "en" }) {
  const t = getPublicT(locale)
  return <section className="border-t border-border pt-6"><h2 className="text-lg font-semibold">{t("provinces.title")}</h2><p className="mt-2 text-sm text-muted-foreground">{t("provinces.lead")}</p><ul className="mt-3 flex flex-wrap gap-1">{GABON_PROVINCES.map((province) => <li key={province.slug}><Link href={routes.province(province.slug)} prefetch={false} className={PUBLIC_LINK}>{province.name}</Link></li>)}</ul></section>
}

export async function DiscoverMetadata(props: PublicPageProps) {
  const t = getPublicT(await getPublicLocale()), result = await loadPublicSnapshot((await searchOf(props)).handoff)
  if (result.status !== "ready") return fallbackMetadata(routes.discover())
  return publicMetadata(t("discover.title"), t("discover.lead"), routes.discover(), result.status === "ready")
}

export async function DiscoverScreen(props: PublicPageProps) {
  const search = await searchOf(props)
  const [locale, snapshot, posts] = await Promise.all([getPublicLocale(), loadPublicSnapshot(search.handoff), loadPublicPosts(search.cursor, undefined, undefined, search.handoff)])
  const t = getPublicT(locale)
  if (search.handoff) return <PublicShell viewer="handoff"><PublicStatus status="handoff" locale={locale} /></PublicShell>
  return <PublicShell viewer={posts.status === "ready" ? posts.viewer : posts.status}><div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]"><aside className="flex flex-col gap-6"><header><h1 className="text-4xl font-semibold tracking-tight">{t("discover.title")}</h1><p className="mt-4 leading-relaxed text-muted-foreground">{t("discover.lead")}</p></header><Link href={routes.nationalFeed()} prefetch={false} className={PUBLIC_CTA}>{t("discover.member")}</Link><ProvinceLinks locale={locale} />{snapshot.status === "ready" && snapshot.data.trends.length ? <section><h2 className="text-lg font-semibold">{t("discover.trends")}</h2>{snapshot.data.periodStart !== null && snapshot.data.periodEnd !== null ? <p className="mt-2 text-xs text-muted-foreground">{t("discover.period", { start: publicDate(snapshot.data.periodStart, locale), end: publicDate(snapshot.data.periodEnd, locale) })}</p> : null}<ul className="mt-3 flex flex-wrap gap-1">{snapshot.data.trends.map((trend) => <li key={trend.tag}><Link href={routes.tag(trend.tag)} prefetch={false} className={PUBLIC_LINK}>#{trend.tag}<span className="text-xs text-muted-foreground">{new Intl.NumberFormat(locale).format(trend.posts)}</span></Link></li>)}</ul>{snapshot.data.bounded ? <p className="mt-2 text-xs text-muted-foreground">{t("snapshot.bounded")}</p> : null}</section> : null}</aside><PublicFeed result={posts} locale={locale} base={routes.discover()} /></div></PublicShell>
}

async function tagOf(params: PublicDynamicProps<"tag">["params"]) {
  const tag = decodeRouteSegment((await params).tag)?.toLocaleLowerCase("fr-FR")
  return tag && /^[\p{L}\p{N}_]{2,30}$/u.test(tag) ? tag : null
}

export async function TagMetadata(props: PublicDynamicProps<"tag">) {
  const tag = await tagOf(props.params), t = getPublicT(await getPublicLocale())
  if (!tag) return fallbackMetadata(routes.discover())
  const search = await searchOf(props), result = await loadPublicPosts(search.cursor, tag, undefined, search.handoff)
  if (result.status !== "ready") return fallbackMetadata(routes.discover())
  return publicMetadata(t("tag.title", { tag }), t("feed.lead"), routes.tag(tag), result.status === "ready")
}
export async function TagScreen(props: PublicDynamicProps<"tag">) {
  const tag = await tagOf(props.params)
  if (!tag) notFound()
  const search = await searchOf(props), locale = await getPublicLocale(), t = getPublicT(locale)
  if (search.handoff) return <PublicShell viewer="handoff"><PublicStatus status="handoff" locale={locale} /></PublicShell>
  const posts = await loadPublicPosts(search.cursor, tag, undefined, search.handoff)
  return <PublicShell viewer={posts.status === "ready" ? posts.viewer : posts.status}><div className="mx-auto max-w-3xl"><header className="mb-6"><h1 className="text-4xl font-semibold break-words">{t("tag.title", { tag })}</h1><p className="mt-3 text-muted-foreground">{t("feed.lead")}</p><Link href={routes.memberTag(tag)} prefetch={false} className={`${PUBLIC_LINK} mt-3`}>{t("discover.member")}</Link></header><PublicFeed result={posts} locale={locale} base={routes.tag(tag)} /></div></PublicShell>
}

export async function ProvinceMetadata(props: PublicDynamicProps<"slug">) {
  const slug = (await props.params).slug, province = GABON_PROVINCES.find((item) => item.slug === slug), t = getPublicT(await getPublicLocale())
  if (!province) return fallbackMetadata(routes.discover())
  const search = await searchOf(props), result = await loadPublicPosts(search.cursor, undefined, province.slug, search.handoff)
  if (result.status !== "ready") return fallbackMetadata(routes.discover())
  return publicMetadata(province.name, t("provinces.lead"), routes.province(province.slug), result.status === "ready")
}
export async function ProvinceScreen(props: PublicDynamicProps<"slug">) {
  const slug = (await props.params).slug
  if (!isProvinceSlug(slug)) notFound()
  const province = GABON_PROVINCES.find((item) => item.slug === slug)!, search = await searchOf(props), locale = await getPublicLocale(), t = getPublicT(locale)
  if (search.handoff) return <PublicShell viewer="handoff"><PublicStatus status="handoff" locale={locale} /></PublicShell>
  const posts = await loadPublicPosts(search.cursor, undefined, slug, search.handoff)
  return <PublicShell viewer={posts.status === "ready" ? posts.viewer : posts.status}><div className="mx-auto max-w-3xl"><header className="mb-6"><p className="text-sm text-primary">{t("provinces.title")}</p><h1 className="mt-2 text-4xl font-semibold">{province.name}</h1><p className="mt-3 text-muted-foreground">{t("provinces.lead")}</p><Link href={routes.memberProvince(slug)} prefetch={false} className={`${PUBLIC_LINK} mt-3`}>{t("discover.member")}</Link></header><PublicFeed result={posts} locale={locale} base={routes.province(slug)} /></div></PublicShell>
}

async function profileHandle(params: PublicDynamicProps<"publicHandle">["params"]): Promise<string | null> {
  const raw = decodeRouteSegment((await params).publicHandle)
  return raw?.startsWith("@") && raw.length > 1 ? raw.slice(1) : null
}
export async function ProfileMetadata(props: PublicDynamicProps<"publicHandle">) {
  const handle = await profileHandle(props.params)
  if (!handle) return fallbackMetadata(routes.home())
  const result = await loadPublicProfile(handle, (await searchOf(props)).handoff)
  return result.status === "ready" && result.data ? publicMetadata(result.data.displayName, result.data.headline ?? BRAND_NAME, routes.publicProfile(result.data.handle)) : fallbackMetadata(routes.home())
}
export async function ProfileScreen(props: PublicDynamicProps<"publicHandle">) {
  const handle = await profileHandle(props.params)
  if (!handle) notFound()
  const locale = await getPublicLocale(), t = getPublicT(locale), result = await loadPublicProfile(handle, (await searchOf(props)).handoff)
  if (result.status !== "ready") return <PublicShell viewer={result.status}><PublicStatus status={result.status} locale={locale} /></PublicShell>
  if (!result.data) notFound()
  const { t: tApp } = getAppT(locale)
  const affiliation = result.data.publicAgent
  return <PublicShell viewer={result.viewer}>
    <article className="mx-auto max-w-3xl rounded-[var(--ui2-card-radius)] border border-[color:var(--esp-surface-border)] bg-card p-4">
      <p className="mb-6 text-sm font-medium text-primary">{t("profile.public")}</p>
      <PublicIdentity author={{ kind: "person", handle: result.data.handle, displayName: result.data.displayName, avatarUrl: result.data.avatarUrl, badges: result.data.badges }} locale={locale} />
      <h1 className="mt-6 break-words text-3xl font-semibold">{result.data.displayName}</h1>
      {result.data.headline ? <p className="mt-3 whitespace-pre-wrap break-words text-muted-foreground">{result.data.headline}</p> : null}
      {affiliation ? <section aria-labelledby="public-agent-title" className="mt-6 rounded-[var(--ui2-card-radius)] border border-border p-4">
        <h2 id="public-agent-title" className="text-lg font-semibold">{tApp("publicAgent.affiliationTitle")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{tApp("publicAgent.publicExplanation")}</p>
        <dl className="mt-3 grid gap-3 text-sm">
          <div><dt className="font-medium">{tApp("publicAgent.administrationLabel")}</dt><dd><Link href={routes.officialPage(affiliation.administrationHandle)} prefetch={false} className={PUBLIC_LINK}>{affiliation.administrationName}</Link></dd></div>
          <div><dt className="font-medium">{tApp("publicAgent.roleLabel")}</dt><dd className="break-words">{affiliation.roleLabel}</dd></div>
        </dl>
      </section> : null}
      <p className="mt-6 text-sm text-muted-foreground">{t("profile.reduced")}</p>
      <Link href={routes.profile(result.data.handle)} prefetch={false} className={`${PUBLIC_CTA} mt-6`}>{t("profile.member")}</Link>
    </article>
  </PublicShell>
}

export async function PageMetadata(props: PublicDynamicProps<"handle">) {
  const handle = decodeRouteSegment((await props.params).handle)
  if (!handle) return fallbackMetadata(routes.home())
  const result = await loadOfficialPage(handle, (await searchOf(props)).handoff)
  return result.status === "ready" && result.data ? publicMetadata(result.data.name, result.data.description?.slice(0, 180) ?? BRAND_NAME, routes.officialPage(result.data.handle)) : fallbackMetadata(routes.home())
}
export async function PageScreen(props: PublicDynamicProps<"handle">) {
  const handle = decodeRouteSegment((await props.params).handle)
  if (!handle) notFound()
  const search = await searchOf(props), locale = await getPublicLocale(), t = getPublicT(locale)
  const result = await loadOfficialPage(handle, search.handoff)
  if (result.status !== "ready") return <PublicShell viewer={result.status}><PublicStatus status={result.status} locale={locale} /></PublicShell>
  if (!result.data) notFound()
  const page = result.data, posts = await loadOfficialPagePosts(page.handle, search.cursor, search.handoff)
  return <PublicShell viewer={result.viewer}><div className="mx-auto max-w-3xl"><header className="mb-7 overflow-hidden rounded-[var(--ui2-card-radius)] border border-[color:var(--esp-surface-border)] bg-card">{page.bannerUrl ? <div className="p-4 pb-0"><Image unoptimized src={page.bannerUrl} width={1200} height={400} alt="" loading="lazy" className="max-h-60 w-full rounded-[var(--esp-media-radius)] object-cover" /></div> : null}<div className="p-4"><PublicIdentity author={{ kind: "page", handle: page.handle, displayName: page.name, avatarUrl: page.logoUrl, badges: [page.badge] }} locale={locale} /><h1 className="mt-5 break-words text-3xl font-semibold">{page.name}</h1>{page.description ? <p className="mt-3 whitespace-pre-wrap break-words text-muted-foreground">{page.description}</p> : null}<p className="mt-4 text-xs text-muted-foreground">{t("post.origin", { name: page.origin.name })}</p><Link href={routes.page(page.handle)} prefetch={false} className={`${PUBLIC_LINK} mt-4`}>{t("page.member")}</Link></div></header><PublicFeed result={posts} locale={locale} base={routes.officialPage(page.handle)} /></div></PublicShell>
}

export async function PostMetadata(props: PublicDynamicProps<"id">) {
  const id = decodeRouteSegment((await props.params).id)
  if (!id) return fallbackMetadata(routes.home())
  const result = await loadPublicPost(id, (await searchOf(props)).handoff)
  return result.status === "ready" && result.data ? publicMetadata(result.data.author.displayName ?? BRAND_NAME, result.data.body.replace(/\s+/g, " ").slice(0, 180), routes.publication(result.data.id)) : fallbackMetadata(routes.home())
}
export async function PostScreen(props: PublicDynamicProps<"id">) {
  const id = decodeRouteSegment((await props.params).id)
  if (!id) notFound()
  const locale = await getPublicLocale(), t = getPublicT(locale), result = await loadPublicPost(id, (await searchOf(props)).handoff)
  if (result.status !== "ready") return <PublicShell viewer={result.status}><PublicStatus status={result.status} locale={locale} /></PublicShell>
  if (!result.data) notFound()
  return <PublicShell viewer={result.viewer}><div className="mx-auto max-w-3xl"><h1 className="mb-5 text-2xl font-semibold">{t("post.title")}</h1><PublicPostCard post={result.data} locale={locale} /></div></PublicShell>
}

export async function TransparencyMetadata(props: PublicPageProps) {
  const t = getPublicT(await getPublicLocale()), result = await loadPublicTransparency((await searchOf(props)).handoff)
  if (result.status !== "ready") return fallbackMetadata(routes.transparency())
  return publicMetadata(t("transparency.title"), t("transparency.lead"), routes.transparency(), result.status === "ready")
}
export async function TransparencyScreen(props: PublicPageProps) {
  const locale = await getPublicLocale(), t = getPublicT(locale), { handoff } = await searchOf(props)
  const [result, deadlines] = await Promise.all([loadPublicTransparency(handoff), loadPublicTransparencyDeadlines(handoff)])
  if (result.status === "handoff") return <PublicShell viewer="handoff"><PublicStatus status="handoff" locale={locale} /></PublicShell>
  // SU01d : les échéances légales se lisent à part ; indisponibles, la page garde ses totaux.
  const legal = deadlines.status === "ready" ? deadlines.data : null, legalOf = new Map(legal?.periods.map((period) => [period.periodStart, period.legal]) ?? [])
  return <PublicShell viewer={result.status === "ready" ? result.viewer : result.status}><div className="mx-auto max-w-3xl"><header className="mb-7"><h1 className="text-4xl font-semibold">{t("transparency.title")}</h1><p className="mt-4 leading-relaxed text-muted-foreground">{t("transparency.lead")}</p></header>{result.status !== "ready" ? <PublicStatus status={result.status} locale={locale} headingLevel={2} /> : <><p className="mb-5 rounded-[var(--ui2-card-radius)] bg-muted p-4 text-sm text-muted-foreground">{t("transparency.threshold", { count: result.data.threshold })}</p>{legal ? <p className="mb-5 rounded-[var(--ui2-card-radius)] bg-muted p-4 text-sm text-muted-foreground">{t("transparency.legalLead", { ordinance: REPORT_DEADLINES_ORDINANCE, decisionHours: reportDecisionDelayHours("art24"), removalHours: reportDecisionDelayHours("art33"), count: legal.threshold })}</p> : null}{result.data.periods.length ? <ul className="divide-y divide-border rounded-[var(--ui2-card-radius)] border border-[color:var(--esp-surface-border)] bg-card p-4 ">{result.data.periods.map((period) => <li key={period.periodStart} className="flex flex-wrap items-center justify-between gap-4 py-5"><p>{t("transparency.period", { start: publicDate(period.periodStart, locale), end: publicDate(period.periodEnd, locale) })}</p><p className="font-medium tabular-nums">{period.cases === null ? t("transparency.suppressed") : t("transparency.cases", { count: period.cases })}</p>{legal ? <TransparencyLegal legal={legalOf.get(period.periodStart) ?? null} threshold={legal.threshold} t={t} /> : null}</li>)}</ul> : <p role="status" className="rounded-[var(--ui2-card-radius)] border border-dashed border-border p-4 text-muted-foreground">{t("transparency.empty")}</p>}</>}</div></PublicShell>
}

/** SU01d — les échéances légales d'une période : chaque nombre, ou « moins de » sous le seuil ; rien quand la période ne les publie pas. */
function TransparencyLegal({ legal, threshold, t }: { legal: PublicLegalDeadlines | null; threshold: number; t: ReturnType<typeof getPublicT> }) {
  if (!legal) return null
  const met = legal.met === null ? t("transparency.legalMetFew", { threshold }) : t("transparency.legalMet", { value: legal.met })
  const missed = legal.missed === null ? t("transparency.legalMissedFew", { threshold }) : t("transparency.legalMissed", { value: legal.missed })
  return <p className="basis-full text-sm text-muted-foreground">{t("transparency.legalLine", { met, missed })}</p>
}

export function legalMetadata(kind: "about" | "legal" | "privacy", path: string) {
  return async (props: PublicPageProps) => { if ((await searchOf(props)).handoff) return fallbackMetadata(path); const t = getPublicT(await getPublicLocale()); return publicMetadata(t(`legal.${kind}.title`), t(`legal.${kind}.lead`), path) }
}
export function legalScreen(kind: "about" | "legal" | "privacy") {
  return async function LegalScreen(props: PublicPageProps) {
    return (await searchOf(props)).handoff ? <PublicShell viewer="handoff"><PublicStatus status="handoff" locale={await getPublicLocale()} /></PublicShell> : <PublicShell><PublicLegalContent kind={kind} locale={await getPublicLocale()} /></PublicShell>
  }
}
