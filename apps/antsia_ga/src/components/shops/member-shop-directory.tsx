"use client"

import { api } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import type { FunctionReturnType } from "convex/server"
import Image from "next/image"
import Link from "next/link"
import { useId, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/shared/controls"
import { routes } from "@/lib/routes"
import { SHOP_ACTION_CLASS } from "./offer-experience-styles"

type StorefrontCard = FunctionReturnType<typeof api.modules.shops.shops.directory>["page"][number]

export function DirectoryCard({ storefront }: { storefront: StorefrontCard }) {
  const { t } = useTranslation("shops")
  return <article className="flex h-full min-w-0 flex-col overflow-hidden rounded-[var(--ui2-card-radius)] border border-[color:var(--esp-surface-border)] bg-card text-card-foreground">
    <Link href={routes.storefront(storefront.handle)} className="flex min-h-11 items-start gap-4 p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
      {storefront.logoUrl ? <Image unoptimized src={storefront.logoUrl} alt="" width={80} height={80} loading="lazy" className="size-20 shrink-0 rounded-[var(--esp-avatar-page-radius)] object-cover object-center" /> : <span aria-hidden="true" className="flex size-20 shrink-0 items-center justify-center rounded-[var(--esp-avatar-page-radius)] bg-muted text-2xl font-semibold">{storefront.name.slice(0, 1)}</span>}
      <span className="flex min-w-0 flex-col gap-2">
        <span className="break-words font-display text-base font-bold leading-snug">{storefront.name}</span>
        <span className="break-all text-xs text-muted-foreground">@{storefront.handle}</span>
        <span className="self-start rounded-[var(--esp-social-action-radius,var(--ui2-button-radius))] bg-muted px-2 py-1 text-xs font-semibold">{t(`badges.${storefront.badge}`)}</span>
        <span className="text-sm text-muted-foreground">{t(`models.${storefront.model}`)}</span>
      </span>
    </Link>
    <div className="mt-auto flex min-w-0 flex-wrap items-center justify-between gap-3 border-t border-border bg-muted p-4">
      {storefront.specialty || storefront.serviceArea ? <div className="grid min-w-0 flex-1 gap-1">{storefront.specialty ? <p className="break-words text-sm font-semibold text-[color:var(--role-commerce-ink,var(--foreground))]">{storefront.specialty}</p> : null}{storefront.serviceArea ? <p className="break-words text-sm text-muted-foreground">{storefront.serviceArea}</p> : null}</div> : null}
      <Link href={routes.storefront(storefront.handle)} className={SHOP_ACTION_CLASS}>{t("storefront.viewStorefront")}</Link>
    </div>
  </article>
}

/** Une fenêtre réactive : aucun DTO ancien n'est copié dans un stockage local. */
function DirectoryWindows() {
  const { t } = useTranslation("shops")
  const { networkId } = useNetwork()
  const [cursors, setCursors] = useState<(string | null)[]>([null])
  const cursor = cursors.at(-1) ?? null
  const query = useAuthenticatedConvexQuery(api.modules.shops.shops.directory, { networkId, paginationOpts: { cursor, numItems: 12 } })

  if (query.isError) return <div role="alert" className="flex flex-col gap-3 rounded-[var(--ui2-card-radius)] border border-[color:var(--esp-surface-border)] bg-card p-4 ">
    <h3 className="font-display text-base font-bold leading-snug">{t("directory.errorTitle")}</h3>
    <p className="text-sm text-muted-foreground">{t("directory.errorMessage")}</p>
    <Button variant="outline" className="self-start rounded-[var(--esp-social-action-radius,var(--ui2-button-radius))]" pending={query.isFetching} onClick={() => { void query.refetch() }}>{t("directory.retry")}</Button>
  </div>
  if (query.isPending || !query.data) return <p role="status" className="text-sm text-muted-foreground">{t("directory.loading")}</p>

  const result = query.data
  const hasNext = !result.isDone && result.continueCursor.length > 0
  return <div className="flex flex-col gap-4" aria-busy={query.isFetching || undefined}>
    {result.page.length ? <ul className="grid gap-3 sm:grid-cols-2">{result.page.map((storefront) => <li key={storefront.handle} className="min-w-0"><DirectoryCard storefront={storefront} /></li>)}</ul> : <p role="status" className="rounded-[var(--ui2-card-radius)] border border-dashed border-border p-4 text-sm text-muted-foreground">{t(result.isDone ? "directory.empty" : "directory.filteredWindow")}</p>}
    {cursors.length > 1 || hasNext ? <nav aria-label={t("directory.title")} className="flex flex-wrap items-center justify-between gap-3">
      {cursors.length > 1 ? <Button variant="outline" className="rounded-[var(--esp-social-action-radius,var(--ui2-button-radius))]" disabled={query.isFetching} onClick={() => setCursors((current) => current.slice(0, -1))}>{t("directory.previousPage")}</Button> : <span />}
      {hasNext ? <Button variant="outline" className="rounded-[var(--esp-social-action-radius,var(--ui2-button-radius))]" disabled={query.isFetching} onClick={() => setCursors((current) => [...current, result.continueCursor])}>{t("directory.loadMore")}</Button> : null}
    </nav> : null}
  </div>
}

/** L'annuaire de vitrines membres P07 ; aucune offre canonique ni achat simulé. */
export function MemberShopDirectory() {
  const { t } = useTranslation("shops")
  const { t: tMember } = useTranslation("memberNetwork")
  const { networkId, personId } = useNetwork()
  const titleId = useId()
  return <section id="boutiques" aria-labelledby={titleId} className="scroll-mt-24 flex flex-col gap-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex flex-col gap-2"><h2 id={titleId} className="mp-subtitle">{t("directory.title")}</h2><p className="text-sm text-muted-foreground">{t("directory.lead")}</p></div>
      <Link href={routes.myShops()} className={SHOP_ACTION_CLASS}>{tMember("commerce.myShop")}</Link>
    </div>
    <DirectoryWindows key={`${networkId}:${personId}`} />
  </section>
}
