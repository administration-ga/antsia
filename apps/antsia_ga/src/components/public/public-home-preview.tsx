"use client"

import { GABON_PROVINCES } from "@antsia/social-domain/provinces"
import Link from "next/link"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { buttonClassName } from "@/components/shared/button-class"
import { routes } from "@/lib/routes"
import { PublicRetryButton } from "./public-actions"
import { PublicHandoff } from "./public-handoff"

const PREVIEW_LINK = "inline-flex min-h-11 items-center gap-2 rounded-[var(--ui2-button-radius)] px-3 text-sm font-medium hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"

type PreviewState = { status: "ready"; hasPosts: boolean; isDone: boolean; continueCursor: string | null } | { status: "refused" | "unavailable" | "handoff" }

/** Données projetées par le serveur ; la langue suit aussi le sélecteur de la porte d'entrée. */
export function PublicHomePreview({ state, posts }: { state: PreviewState; posts?: Record<"fr" | "en", ReactNode> }) {
  const { t, i18n } = useTranslation("publicNetwork")
  const locale = i18n.resolvedLanguage?.startsWith("en") ? "en" : "fr"
  return <div className="antsia-copy mx-auto grid w-full max-w-[1080px] items-start gap-6 px-4 pb-8 sm:px-6 sm:pb-12 min-[960px]:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
    <section aria-labelledby="public-home-feed" className="antsia-page min-w-0">
      <header className="antsia-page-header"><h2 id="public-home-feed" className="antsia-subtitle">{t("feed.title")}</h2><p className="text-muted-foreground">{t("feed.lead")}</p></header>
      {state.status === "ready" ? <>
        {state.hasPosts ? posts?.[locale] : <div role="status" className="antsia-panel"><p className="font-semibold">{t("feed.emptyTitle")}</p><p className="mt-2 text-sm text-muted-foreground">{t(state.isDone ? "feed.emptyBody" : "feed.filteredWindow")}</p></div>}
        {!state.isDone && state.continueCursor ? <nav aria-label={t("feed.pagination")} className="flex flex-wrap justify-between gap-3"><Link href={routes.home()} prefetch={false} className={PREVIEW_LINK}>{t("feed.first")}</Link><Link href={`${routes.home()}?${new URLSearchParams({ cursor: state.continueCursor })}`} prefetch={false} className={PREVIEW_LINK}>{t("feed.next")}</Link></nav> : null}
      </> : <section role={state.status === "unavailable" ? "alert" : "status"} className="antsia-panel"><h3 className="font-semibold">{t(`states.${state.status}.title`)}</h3><p className="mt-3 text-muted-foreground">{t(`states.${state.status}.body`)}</p>{state.status === "handoff" ? <PublicHandoff /> : <div className="mt-4 flex flex-wrap gap-3">{state.status === "unavailable" ? <PublicRetryButton /> : null}<Link href={routes.signIn()} prefetch={false} className={buttonClassName("outline")}>{t("nav.enter")}</Link></div>}</section>}
    </section>
    <aside className="antsia-page min-w-0">
      <section className="antsia-panel"><h2 className="antsia-subtitle">{t("home.contextTitle")}</h2><p className="mt-3 text-muted-foreground">{t("home.contextBody")}</p></section>
      <section className="antsia-panel"><h2 className="antsia-subtitle">{t("legal.about.trust.title")}</h2><ul className="my-3 flex flex-wrap gap-2">{(["official", "verified", "public_agent", "community"] as const).map((badge) => <li key={badge} className="rounded-[var(--ui2-badge-radius)] bg-muted px-2 py-1 text-xs font-semibold">{t(`badges.${badge}`)}</li>)}</ul><p className="text-muted-foreground">{t("legal.about.trust.body")}</p></section>
      <section id="provinces" className="antsia-panel scroll-mt-6"><h2 className="antsia-subtitle">{t("provinces.title")}</h2><p className="mt-2 text-sm text-muted-foreground">{t("provinces.lead")}</p><ul className="mt-3 flex flex-wrap gap-1">{GABON_PROVINCES.map((province) => <li key={province.slug}><Link href={routes.province(province.slug)} prefetch={false} className={PREVIEW_LINK}>{province.name}</Link></li>)}</ul></section>
    </aside>
  </div>
}
