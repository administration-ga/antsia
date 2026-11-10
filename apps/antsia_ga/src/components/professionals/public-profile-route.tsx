import { notFound } from "next/navigation"
import Link from "next/link"
import { PublicShell, PUBLIC_LINK, PUBLIC_CTA } from "@/components/public/public-shell"
import { PublicStatus } from "@/components/public/public-status"
import { getAppT } from "@/i18n/server"
import { loadPublicProfessional } from "@/lib/public-professional-data"
import { publicMetadata, publicSearch } from "@/lib/public-data"
import { decodeRouteSegment } from "@/lib/route-params"
import { routes } from "@/lib/routes"
import { getPublicLocale } from "@/lib/server-session"

type Props = { params: Promise<{ handle: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>> }
async function request(props: Props) {
  return { handle: decodeRouteSegment((await props.params).handle), handoff: publicSearch(await props.searchParams ?? {}).handoff }
}
export async function PublicProfessionalMetadata(props: Props) {
  const { t } = getAppT(await getPublicLocale())
  const { handle, handoff } = await request(props)
  const result = handle ? await loadPublicProfessional(handle, handoff) : null
  if (result?.status !== "ready" || !result.data) return publicMetadata(t("professionalPublic:title"), t("professionalPublic:lead"), routes.home(), false)
  return publicMetadata(result.data.displayName, result.data.bio?.replace(/\s+/gu, " ").slice(0, 180) || t("professionalPublic:lead"), routes.publicProfessional(result.data.handle))
}
/** Projection explicite : chaque champ absent est omis, aucune donnée sociale ajoutée. */
export async function PublicProfessionalScreen(props: Props) {
  const { handle, handoff } = await request(props)
  if (!handle) notFound()
  const locale = await getPublicLocale()
  const { t } = getAppT(locale)
  const result = await loadPublicProfessional(handle, handoff)
  if (result.status !== "ready") return <PublicShell viewer={result.status}><PublicStatus status={result.status} locale={locale} /></PublicShell>
  const profile = result.data
  if (!profile) notFound()
  const copy = (key: string) => t(`professionalPublic:${key}`)
  const language = (code: string) => { try { return new Intl.DisplayNames([locale], { type: "language" }).of(code) ?? code } catch { return code } }
  const destination = { kind: "professional", handle: profile.handle } as const
  const contact = result.viewer === "authenticated" ? routes.professionalProfile(profile.handle) : routes.signIn(undefined, undefined, undefined, undefined, destination)
  return <PublicShell viewer={result.viewer} specialized={destination}><article className="mx-auto grid w-full min-w-0 max-w-5xl gap-8 [overflow-wrap:anywhere]">
    <header className="grid gap-3"><p className="text-sm font-medium text-muted-foreground">{copy("title")}</p><h1 className="mp-title">{profile.displayName}</h1><p className="text-sm text-muted-foreground">@{profile.handle}</p>{profile.title ? <p className="text-lg font-medium">{profile.title}</p> : null}<p className="text-sm text-muted-foreground">{copy("voluntary")}</p><Link href={contact} prefetch={false} className={`${PUBLIC_CTA} justify-self-start`}>{copy("collaborate")}</Link></header>
    {profile.bio ? <section className="grid gap-3"><h2 className="mp-subtitle">{copy("about")}</h2><p className="whitespace-pre-line leading-relaxed">{profile.bio}</p></section> : null}
    <div className="grid min-w-0 gap-6 sm:grid-cols-2">
      {profile.skills?.length ? <section className="mp-panel grid content-start gap-3"><h2 className="mp-subtitle">{copy("skills")}</h2><ul className="flex flex-wrap gap-2">{profile.skills.map(skill => <li key={skill} className="rounded-full border border-border px-3 py-2 text-sm">{skill}</li>)}</ul><p className="text-sm text-muted-foreground">{copy("declared")}</p></section> : null}
      {profile.languageCodes?.length ? <section className="mp-panel grid content-start gap-3"><h2 className="mp-subtitle">{copy("languages")}</h2><ul className="list-inside list-disc space-y-2">{profile.languageCodes.map(code => <li key={code}>{language(code)}</li>)}</ul></section> : null}
      {profile.zone ? <section className="mp-panel grid content-start gap-3"><h2 className="mp-subtitle">{copy("zone")}</h2><p>{profile.zone}</p></section> : null}
      {profile.availability ? <section className="mp-panel grid content-start gap-3"><h2 className="mp-subtitle">{copy("availability")}</h2><p>{copy(`availabilities.${profile.availability}`)}</p></section> : null}
    </div>
    {profile.portfolio?.length ? <section className="grid gap-4"><h2 className="mp-subtitle">{copy("portfolio")}</h2><ul className="grid min-w-0 gap-4 sm:grid-cols-2">{profile.portfolio.map((item,index) => <li key={index} className="mp-panel grid content-start gap-3"><h3 className="font-semibold">{item.title}</h3><p className="whitespace-pre-line text-sm leading-relaxed">{item.description}</p></li>)}</ul></section> : null}
    {profile.activities?.length ? <section className="grid gap-4"><h2 className="mp-subtitle">{copy("activities")}</h2><ul className="grid gap-3 sm:grid-cols-2">{profile.activities.map(activity => <li key={`${activity.kind}:${activity.handle}`}><Link href={activity.kind === "shop" ? routes.publicStorefront(activity.handle) : routes.officialPage(activity.handle)} prefetch={false} className={PUBLIC_LINK}>{activity.name}</Link></li>)}</ul><p className="text-sm text-muted-foreground">{copy("mandates")}</p></section> : null}
  </article></PublicShell>
}
