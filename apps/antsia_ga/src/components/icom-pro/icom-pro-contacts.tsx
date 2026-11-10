"use client"

/** ADR-0036 : les contacts d'iCom Pro — clients de mes boutiques, partenaires, boutiques contactées. */
import { api } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import { useViewerTimeZone } from "@antsia/api/viewer-preferences"
import { COMMERCIAL_MESSAGING_SOURCE, type CommercialShopId } from "@antsia/social-features/messagerie"
import Link from "next/link"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { routes } from "@/lib/routes"
import { icomProClientsOf, icomProPartnersOf, icomProSuppliersOf } from "./icom-pro-contacts-model"

const ROW_CLASS = "grid min-h-11 min-w-0 gap-0.5 rounded-xl border border-border bg-card p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
const PARTNERS_PAGE = { cursor: null, numItems: 20 }

function useExchangeDate() {
  const { i18n } = useTranslation("icomPro")
  const timeZone = useViewerTimeZone()
  return (at: number) => new Intl.DateTimeFormat(i18n.resolvedLanguage ?? "fr", { dateStyle: "medium", timeZone }).format(at)
}

function ContactGroup({ title, help, children }: { title: string; help?: string; children: ReactNode }) {
  return (
    <section className="grid min-w-0 gap-2">
      <h2 className="text-base font-semibold">{title}</h2>
      {help ? <p className="text-xs text-muted-foreground">{help}</p> : null}
      {children}
    </section>
  )
}

function ShopClients({ shopId, shopName }: { shopId: CommercialShopId; shopName: string }) {
  const { t } = useTranslation("icomPro")
  const date = useExchangeDate()
  const page = COMMERCIAL_MESSAGING_SOURCE.useThreads(shopId, "", null)
  if (page.isError) return <p role="alert" className="text-sm">{t("contacts.unavailable")}</p>
  if (page.data === undefined) return <p role="status" className="text-sm">{t("contacts.loading")}</p>
  const clients = icomProClientsOf(page.data.page.map((thread) => ({ threadId: String(thread.threadId), requesterPersonId: String(thread.requesterPersonId), requester: thread.requester, lastMessageAt: thread.lastMessageAt })))
  return (
    <div className="grid min-w-0 gap-2">
      <h3 className="text-sm font-semibold text-muted-foreground">{shopName}</h3>
      {clients.length === 0 ? <p className="text-sm text-muted-foreground">{t("contacts.noClients")}</p> : (
        <ul className="grid min-w-0 gap-2">
          {clients.map((client) => {
            const name = client.label.displayName ?? client.label.handle ?? t("contacts.person")
            return (
              <li key={client.personKey} className="min-w-0">
                <Link href={routes.commercialConversation(client.threadId)} prefetch={false} aria-label={t("contacts.openConversation", { name })} className={ROW_CLASS}>
                  <span className="truncate font-medium">{name}</span>
                  {client.label.handle ? <span className="truncate text-xs text-muted-foreground">@{client.label.handle}</span> : null}
                  <span className="text-xs text-muted-foreground">{t("contacts.lastExchange", { date: date(client.lastMessageAt) })}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function Clients() {
  const { t } = useTranslation("icomPro")
  const { networkId } = useNetwork()
  const mandated = useAuthenticatedConvexQuery(api.modules.commercialMessaging.team.myShops, { networkId })
  if (mandated.isError) return <p role="alert" className="text-sm">{t("contacts.unavailable")}</p>
  if (mandated.data === undefined) return <p role="status" className="text-sm">{t("contacts.loading")}</p>
  if (mandated.data.items.length === 0) return <p className="text-sm text-muted-foreground">{t("contacts.noShops")}</p>
  return <>{mandated.data.items.map((shop) => <ShopClients key={shop.shopId} shopId={shop.shopId} shopName={shop.shopName} />)}</>
}

function Partners() {
  const { t } = useTranslation("icomPro")
  const { networkId } = useNetwork()
  const sent = useAuthenticatedConvexQuery(api.modules.professionals.collaborations.listMine, { networkId, status: "accepted", paginationOpts: PARTNERS_PAGE })
  const received = useAuthenticatedConvexQuery(api.modules.professionals.collaborations.listIncoming, { networkId, status: "accepted", paginationOpts: PARTNERS_PAGE })
  if (sent.isError || received.isError) return <p role="alert" className="text-sm">{t("contacts.unavailable")}</p>
  if (sent.data === undefined || received.data === undefined) return <p role="status" className="text-sm">{t("contacts.loading")}</p>
  const partners = icomProPartnersOf(sent.data.page, received.data.page)
  if (partners.length === 0) return <p className="text-sm text-muted-foreground">{t("contacts.noPartners")}</p>
  return (
    <ul className="grid min-w-0 gap-2">
      {partners.map((partner) => (
        <li key={partner.handle} className="min-w-0">
          <Link href={routes.profile(partner.handle)} prefetch={false} aria-label={t("contacts.openProfile", { name: partner.displayName })} className={ROW_CLASS}>
            <span className="truncate font-medium">{partner.displayName}</span>
            <span className="truncate text-xs text-muted-foreground">@{partner.handle}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

function Suppliers() {
  const { t } = useTranslation("icomPro")
  const date = useExchangeDate()
  const page = COMMERCIAL_MESSAGING_SOURCE.useThreads(undefined, "", null)
  if (page.isError) return <p role="alert" className="text-sm">{t("contacts.unavailable")}</p>
  if (page.data === undefined) return <p role="status" className="text-sm">{t("contacts.loading")}</p>
  const suppliers = icomProSuppliersOf(page.data.page.map((thread) => ({ threadId: String(thread.threadId), shop: { shopId: String(thread.shop.shopId), name: thread.shop.name, handle: thread.shop.handle }, lastMessageAt: thread.lastMessageAt })))
  if (suppliers.length === 0) return <p className="text-sm text-muted-foreground">{t("contacts.noSuppliers")}</p>
  return (
    <ul className="grid min-w-0 gap-2">
      {suppliers.map((supplier) => (
        <li key={supplier.shopKey} className="grid min-w-0 gap-1">
          <Link href={routes.commercialConversation(supplier.threadId)} prefetch={false} aria-label={t("contacts.openConversation", { name: supplier.name })} className={ROW_CLASS}>
            <span className="truncate font-medium">{supplier.name}</span>
            <span className="text-xs text-muted-foreground">{t("contacts.lastExchange", { date: date(supplier.lastMessageAt) })}</span>
          </Link>
          <Link href={routes.storefront(supplier.handle)} prefetch={false} className="justify-self-start text-xs font-medium text-primary underline-offset-2 hover:underline">{t("contacts.openShop", { name: supplier.name })}</Link>
        </li>
      ))}
    </ul>
  )
}

export function IcomProContacts() {
  const { t } = useTranslation("icomPro")
  return (
    <section aria-label={t("contacts.label")} className="grid min-w-0 content-start gap-5 p-3">
      <ContactGroup title={t("contacts.clients")} help={t("contacts.clientsHelp")}><Clients /></ContactGroup>
      <ContactGroup title={t("contacts.partners")} help={t("contacts.partnersHelp")}><Partners /></ContactGroup>
      <ContactGroup title={t("contacts.suppliers")}><Suppliers /></ContactGroup>
      <p className="text-xs text-muted-foreground">{t("contacts.window")}</p>
    </section>
  )
}
