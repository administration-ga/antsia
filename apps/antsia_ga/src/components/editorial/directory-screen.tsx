"use client"

import { api } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import type { FunctionReturnType } from "convex/server"
import Link from "next/link"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { MemberPage } from "@/components/member-chrome"
import { Button, Card } from "@/components/shared/controls"
import { SHOP_ACTION_CLASS } from "@/components/shops/offer-experience-styles"
import { routes } from "@/lib/routes"

type MediaCard = FunctionReturnType<typeof api.modules.editorial.directory.list>["page"][number]

/** Annuaire lecteur distinct du bureau de rédaction et remis à zéro par identité/réseau. Il occupe toute la
 * colonne de l'espace, bords et écarts sur la gouttière (décision du propriétaire du 22/10/2026). */
export function MemberEditorialDirectory() {
  const { networkId, personId } = useNetwork()
  const { t } = useTranslation("editorial")
  return <MemberPage><div className="mp-page mp-copy grid w-full min-w-0 gap-5 pb-24 [overflow-wrap:anywhere]">
    <header className="mp-page-header min-w-0"><h1 className="mp-title">{t("directory.title")}</h1><p className="text-muted-foreground">{t("directory.lead")}</p><Link href={routes.mediaHome()} className={`${SHOP_ACTION_CLASS} justify-self-start`}>{t("directory.myMedia")}</Link></header>
    <DirectoryWindow key={JSON.stringify([networkId, personId])} />
  </div></MemberPage>
}

function DirectoryWindow() {
  const { networkId, personId } = useNetwork()
  const { t } = useTranslation("editorial")
  const [cursors, setCursors] = useState<(string | null)[]>([null])
  const cursor = cursors.at(-1) ?? null
  const query = useAuthenticatedConvexQuery(api.modules.editorial.directory.list, { networkId, readerScope: personId, paginationOpts: { cursor, numItems: 12 } })
  if (query.isError) return <div role="alert" className="grid gap-3"><p>{t("directory.error")}</p><Button type="button" variant="outline" className="justify-self-start" onClick={() => { void query.refetch() }}>{t("directory.retry")}</Button></div>
  // Un résultat conservé par le cache n'est jamais montré pendant sa relecture.
  if (query.isPending || query.isFetching || query.data === undefined) return <p role="status">{t("directory.loading")}</p>
  const result = query.data
  const hasNext = !result.isDone && result.continueCursor.length > 0
  return <section className="grid min-w-0 gap-4" aria-label={t("directory.title")}>
    {result.page.length ? <ul className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">{result.page.map(media => <li key={media.handle} className="min-w-0"><DirectoryCard media={media} /></li>)}</ul> : <p role="status">{t(result.isDone ? "directory.empty" : "directory.filteredWindow")}</p>}
    {hasNext || cursors.length > 1 ? <nav aria-label={t("directory.title")} className="flex min-w-0 flex-wrap justify-between gap-3">
      {cursors.length > 1 ? <Button type="button" variant="outline" onClick={() => setCursors(previous => previous.slice(0, -1))}>{t("directory.previous")}</Button> : <span />}
      {hasNext ? <Button type="button" variant="outline" onClick={() => setCursors(previous => [...previous, result.continueCursor])}>{t("directory.next")}</Button> : null}
    </nav> : null}
  </section>
}

function DirectoryCard({ media }: { media: MediaCard }) {
  const { t } = useTranslation("editorial")
  return <Card className="h-full"><article className="grid min-w-0 gap-3">
    <header><h2 className="mp-subtitle break-words">{media.name}</h2><p className="break-all text-sm text-muted-foreground">@{media.handle}</p></header>
    {media.description ? <p className="whitespace-pre-wrap break-words text-sm">{media.description}</p> : null}
    {media.sections.length ? <ul aria-label={t("directory.sections")} className="flex min-w-0 flex-wrap gap-2">{media.sections.map(section => <li key={section.key} className="rounded-full bg-muted px-3 py-1 text-sm">{section.label}</li>)}</ul> : null}
    <Link href={routes.memberMedia(media.handle)} className={`${SHOP_ACTION_CLASS} justify-self-start`}>{t("directory.view")}</Link>
  </article></Card>
}
