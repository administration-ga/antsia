"use client"

import { useNetwork } from "@antsia/api/network"
import type { CSSProperties } from "react"
import { demoWorkspaceHeight } from "@/lib/demo-embed"
import { ReseauAgentPage } from "@antsia/social-features/reseau-personnel"

import { MemberPage, MemberTopBar } from "@/components/member-chrome"
import { MemberDiscoveryFeed } from "@/components/discovery/member-feed"
import type { MemberFeedFilter } from "@/components/discovery/member-feed-filter"
import { useTranslation } from "react-i18next"
import Link from "next/link"
import { routes } from "@/lib/routes"

/**
 * Le fil : la PAGE RÉSEAU du moteur (volets, rails, iCom, statuts), qui choisit
 * elle-même entre la coquille téléphone et le rail. U02 : sous 768 px sur
 * opt-in ANTSIA ; le moteur historique conserve son seuil de 960 px.
 *
 * Au bureau, le fil garde une hauteur définie sous la barre du haut. Les
 * colonnes défilent séparément ; le centre entraîne le contexte jusqu'à sa
 * dernière carte. Au téléphone, la coquille conserve le défilement du document
 * et ses propres barres. Le lecteur immersif garde son défileur dédié.
 */
export function FeedScreen({ filter = { kind: "personal" } }: { filter?: MemberFeedFilter }) {
  const { t } = useTranslation("memberNetwork")
  const { t: tApp } = useTranslation("antsia")
  // Navigation par destinations (lot P02) : Découvrir et Profil portent déjà
  // ces entrées ; la rangée mobile ne sert qu'à la navigation par volets.
  const network = useNetwork()
  const destinations = network.navigation === "destinations"
  const adaptive = destinations && network.navigationLayout === "adaptive"
  if (filter.kind === "national") return <MemberDiscoveryFeed filter={filter} />
  if (filter.kind === "invalid") {
    const invalid = <><h1 className="text-2xl font-semibold">{t("discovery.invalidTitle")}</h1><p role="alert">{t("discovery.invalidFilter")}</p><Link href={routes.nationalFeed()} className="inline-flex min-h-11 items-center self-start rounded-[var(--ui2-button-radius)] px-3 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{t("discovery.nationalTitle")}</Link></>
    if (destinations) return <MemberPage><div className="flex w-full flex-col gap-4">{invalid}</div></MemberPage>
    return <div className="min-h-dvh bg-background"><MemberTopBar /><main id="contenu" className="mx-auto flex max-w-3xl flex-col gap-4 p-6">{invalid}</main></div>
  }
  return (
    <div className={adaptive ? "flex [--antsia-workspace-height:100dvh] min-h-[var(--antsia-workspace-height,100dvh)] flex-col bg-background min-[768px]:h-[var(--antsia-workspace-height,100dvh)] min-[768px]:overflow-hidden" : "flex [--antsia-workspace-height:100dvh] min-h-[var(--antsia-workspace-height,100dvh)] flex-col bg-background min-[960px]:h-[var(--antsia-workspace-height,100dvh)]"} style={{ "--antsia-workspace-height": demoWorkspaceHeight() } as CSSProperties}>
      <MemberTopBar onMobile="hidden" />
      {destinations ? null : <nav aria-label={t("nav.discover")} className="flex flex-wrap items-center gap-1 border-b border-border px-3 min-[960px]:hidden">
        <Link href={routes.feedPreferences()} className="inline-flex min-h-11 items-center rounded-[var(--ui2-button-radius)] px-3 text-sm underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{tApp("feedPreferences.title")}</Link>
        <Link href={routes.nationalFeed()} className="inline-flex min-h-11 items-center rounded-[var(--ui2-button-radius)] px-3 text-sm underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{t("nav.national")}</Link>
        <Link href={routes.discover()} className="inline-flex min-h-11 items-center rounded-[var(--ui2-button-radius)] px-3 text-sm underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{t("nav.discover")}</Link>
        <Link href={routes.moderation()} className="inline-flex min-h-11 items-center rounded-[var(--ui2-button-radius)] px-3 text-sm underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{t("nav.moderation")}</Link>
      </nav>}
      {/* La page porte son propre `<main>` (le volet ouvert) : cette enveloppe
          n'est que la cible du lien d'évitement. */}
      <div id="contenu" tabIndex={-1} className={adaptive ? "flex min-h-0 flex-1 flex-col focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring" : "flex flex-1 flex-col focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring min-[960px]:min-h-0"}>
        <ReseauAgentPage />
      </div>
    </div>
  )
}
