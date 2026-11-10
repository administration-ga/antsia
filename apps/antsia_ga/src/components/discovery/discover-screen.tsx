"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { ArrowRight, Hash } from "lucide-react"
import Link from "next/link"
import { SCREEN_SECTIONS } from "@/components/shared/screen-layout"
import { useRouter } from "next/navigation"
import { Suspense, useId } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"

import { MemberPage } from "@/components/member-chrome"
import { MemberJobDirectory, useJobsDiscoverable } from "@/components/jobs/member-job-directory"
import { MemberServiceDirectory, useServicesDiscoverable } from "@/components/services/member-service-directory"
import { MemberShopDirectory } from "@/components/shops/member-shop-directory"
import { Button, Field, TextInput } from "@/components/shared/controls"
import { routes } from "@/lib/routes"
import { useFoodStorefronts } from "@/components/universes/food-universe-screen"
import { MediaDiscoveryScreen } from "./media-discovery-screen"
import {
  discoverContentEntries,
  discoverJobEntry,
  discoverNetworkEntries,
  discoverProvinceEntries,
  discoverPublicEntry,
  discoverServiceEntry,
  discoverShopEntry,
  discoverTagSchema,
  type DiscoverEntry,
  type DiscoverTagValues,
  servedDiscoverTabs,
  showsDiscoverTabs,
} from "./discover-model"

const ENTRY_LINK =
  "flex min-h-11 items-start justify-between gap-3 rounded-xl border border-border bg-card p-4 text-card-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

const CHIP_LINK =
  "inline-flex min-h-11 items-center rounded-full border border-border bg-card px-4 text-sm font-medium text-card-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

/**
 * Découvrir rangé par piliers (étude des sept univers, § 4 et § 12, lot SU02) : le Business et ses univers OUVERTS
 * seulement, la Vie publique, puis le Divertissement. Un univers sans adresse ni offre réelle n'a pas de tuile
 * (aucune entrée vide, ADR-0034) : les services attendent une offre publiée, l'alimentation une adresse ouverte.
 */
function DiscoverPillars({ services }: { services: boolean }) {
  const { t } = useTranslation("memberNetwork")
  const food = useFoodStorefronts().storefronts.length > 0
  const pillars: { id: string; label: string; entries: { href: string; label: string }[] }[] = [
    { id: "business", label: t("discoverHub.pillars.business"), entries: [
      { href: routes.marketplaceHome(), label: t("discoverHub.universes.shops") },
      ...(services ? [{ href: routes.marketplace({ view: "services" }), label: t("discoverHub.universes.services") }] : []),
      ...(food ? [{ href: routes.foodUniverse(), label: t("discoverHub.universes.food") }] : []),
      { href: routes.professionals(), label: t("specializedSpaces:professionalSpace") },
    ] },
    { id: "public", label: t("discoverHub.pillars.publicLife"), entries: [{ href: routes.press(), label: t("specializedSpaces:editorialSpace") }] },
    { id: "entertainment", label: t("discoverHub.pillars.entertainment"), entries: [
      { href: routes.clips(), label: t("discoverHub.universes.clips") },
      { href: routes.personalMeetings(), label: t("personalMeetings:entryLabel") },
    ] },
  ]
  return <nav aria-label={t("discoverHub.pillars.label")} className="grid min-w-0 gap-4">
    {pillars.map(pillar => <section key={pillar.id} aria-label={pillar.label} className="grid min-w-0 gap-2" data-discover-pillar={pillar.id}>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{pillar.label}</h2>
      <ul className="flex min-w-0 flex-wrap gap-2">{pillar.entries.map(entry => <li key={entry.href}><Link href={entry.href} className={CHIP_LINK}><span>{entry.label}</span><ArrowRight aria-hidden="true" className="ml-3 size-4" /></Link></li>)}</ul>
    </section>)}
  </nav>
}

/** Une entrée de Découvrir : un lien d'une seule pièce, libellé puis phrase. */
function EntryLink({ entry }: { entry: DiscoverEntry }) {
  const { t } = useTranslation("memberNetwork")
  return (
    <Link href={entry.href} className={ENTRY_LINK}>
      <span className="flex min-w-0 flex-col gap-1">
        <span className="font-semibold">{t(entry.labelKey)}</span>
        <span className="text-sm text-muted-foreground">{t(entry.descriptionKey)}</span>
      </span>
      <ArrowRight aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
    </Link>
  )
}

/** Ouvrir le fil national sur un mot-clé — le même filtre que le clic sur un `#mot` d'une publication. */
function DiscoverTagForm() {
  const { t } = useTranslation("memberNetwork")
  const router = useRouter()
  const id = useId()
  const form = useForm<DiscoverTagValues>({ resolver: zodResolver(discoverTagSchema(t("discoverHub.tagInvalid"))), defaultValues: { tag: "" } })
  const error = form.formState.errors.tag?.message

  return (
    <form
      noValidate
      aria-label={t("discoverHub.tagTitle")}
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
      // Les valeurs reçues sont celles du schéma, déjà nettoyées (`#` de tête retiré).
      onSubmit={form.handleSubmit((values) => router.push(routes.memberTag(values.tag)))}
    >
      <div className="min-w-0 flex-1">
        <Field id={id} label={t("discoverHub.tagLabel")} hint={t("discoverHub.tagHint")} error={error}>
          <TextInput
            id={id}
            inputMode="text"
            autoComplete="off"
            enterKeyHint="search"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : `${id}-hint`}
            {...form.register("tag")}
          />
        </Field>
      </div>
      <Button type="submit" variant="outline">
        <Hash aria-hidden="true" className="size-4" />
        {t("discoverHub.tagSubmit")}
      </Button>
    </form>
  )
}

/**
 * La destination « Découvrir » des membres (P02) : contenus nationaux,
 * provinces et mots-clés, volets de découverte du réseau, vue publique. Sous
 * la coque des membres — un appel en cours y survit. Les onglets commerciaux
 * (boutiques, services, emplois) n'apparaissent qu'avec leurs lots
 * (`DISCOVER_TABS`).
 */
export function MemberDiscoverScreen() {
  const { t } = useTranslation("memberNetwork")
  const contentTitle = useId()
  const provincesTitle = useId()
  const networkTitle = useId()
  const publicTitle = useId()
  const publicEntry = discoverPublicEntry()
  const shopEntry = discoverShopEntry()
  // P15 : l'onglet Emplois n'existe qu'avec de vraies offres reçues et lisibles (moteur).
  const discoverData = { jobs: useJobsDiscoverable(), services: useServicesDiscoverable() }
  const jobEntry = discoverJobEntry()
  // P14 : l'onglet Services n'existe qu'avec de vraies offres de service publiées (moteur).
  const serviceEntry = discoverServiceEntry()

  return (
    <MemberPage>
      <div className="flex w-full min-w-0 flex-col gap-8">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{t("nav.discover")}</h1>
          <p className="text-base text-muted-foreground">{t("discoverHub.lead")}</p>
          <p className="text-sm text-muted-foreground">{t("discovery.memberScope")}</p>
        </header>

        <DiscoverPillars services={discoverData.services} />

        <Suspense fallback={<p role="status">{t("socialExperience:loading")}</p>}><MediaDiscoveryScreen mode="explore" /></Suspense>

        {showsDiscoverTabs(discoverData) ? <nav aria-label={t("commerce.sections")} className="flex flex-wrap gap-2">
          {servedDiscoverTabs(discoverData).map((tab) => {
            const entry = tab.id === "boutiques" ? shopEntry : tab.id === "emplois" ? jobEntry : tab.id === "services" ? serviceEntry : null
            return <Link key={tab.id} href={entry ? entry.href : routes.memberDiscover()} className={CHIP_LINK} title={entry ? t(entry.descriptionKey) : undefined}>{t(entry ? entry.labelKey : "commerce.all")}</Link>
          })}
        </nav> : null}

        <section aria-labelledby={contentTitle} className="flex flex-col gap-4">
          <h2 id={contentTitle} className="text-lg font-semibold">{t("discoverHub.contentTitle")}</h2>
          <ul className={`${SCREEN_SECTIONS} gap-y-3`}>
            {discoverContentEntries().map((entry) => (
              <li key={entry.id}>
                <EntryLink entry={entry} />
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-2">
            <h3 id={provincesTitle} className="text-base font-semibold">{t("discoverHub.provincesTitle")}</h3>
            <ul aria-labelledby={provincesTitle} className="flex flex-wrap gap-2">
              {discoverProvinceEntries().map((province) => (
                <li key={province.slug}>
                  <Link href={province.href} className={CHIP_LINK}>
                    {province.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <DiscoverTagForm />
        </section>

        <section aria-labelledby={networkTitle} className="flex flex-col gap-4">
          <h2 id={networkTitle} className="text-lg font-semibold">{t("discoverHub.networkTitle")}</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {discoverNetworkEntries().map((entry) => (
              <li key={entry.id} className="flex">
                <EntryLink entry={entry} />
              </li>
            ))}
          </ul>
        </section>

        <MemberShopDirectory />

        <MemberServiceDirectory />

        <MemberJobDirectory />

        <section aria-labelledby={publicTitle} className="flex flex-col gap-4">
          <h2 id={publicTitle} className="text-lg font-semibold">{t("discoverHub.publicTitle")}</h2>
          <EntryLink entry={publicEntry} />
        </section>
      </div>
    </MemberPage>
  )
}
