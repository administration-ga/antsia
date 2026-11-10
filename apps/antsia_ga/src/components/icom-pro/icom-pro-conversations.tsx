"use client"

/**
 * ADR-0036 : les conversations d'iCom Pro, par activité.
 *
 * - « Mes achats et démarches » : les boutiques à qui j'ai écrit (côté client) ;
 * - « Mises en relation » : collaborations, mentorat, candidatures, prestations ;
 * - chaque boutique que je tiens ou pour laquelle je suis mandaté (côté boutique), triée par état.
 *
 * Une boutique que je tiens sans mandat de lecture se montre aussi : elle renvoie à son équipe,
 * où l'on se donne le droit de lire ses messages — jamais une liste vide inexpliquée.
 */
import { api } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import type { ContextualMessagesInjection } from "@antsia/social-features/features/messagerie/contextual-entry"
import { icomProHref } from "@antsia/social-features/features/messagerie/icom-space"
import Link from "next/link"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { ContactInboxWindow, ContactInvitations, type ContactInboxStateFilter } from "@/components/shops/contact-inbox"
import { SHOP_ACTION_CLASS } from "@/components/shops/offer-experience-styles"
import { SHOP_SELECT_CLASS } from "@/components/shops/shop-ui"
import { routes } from "@/lib/routes"

const CHIP_CLASS = `${SHOP_ACTION_CLASS} aria-[current=page]:border-primary aria-[current=page]:bg-muted`
const TOGGLE_CHIP_CLASS = `${SHOP_ACTION_CLASS} aria-pressed:border-primary aria-pressed:bg-muted`
const STATE_FILTERS: readonly ContactInboxStateFilter[] = ["all", "requested", "accepted", "closed"]

type Activity =
  | { id: "achats"; kind: "purchases"; label: string }
  | { id: "relations"; kind: "relations"; label: string }
  | { id: string; kind: "shop"; label: string; shopId: string }
  | { id: string; kind: "shopWithoutMandate"; label: string; shopId: string }

/** Les activités dans l'ordre : mes boutiques d'abord, puis mes achats et les mises en relation. */
export function icomProActivities(input: {
  mandated: readonly { shopId: string; shopName: string }[]
  owned: readonly { shopId: string; name: string | null; pageHandle: string | null }[]
  labels: { purchases: string; relations: string }
}): Activity[] {
  const mandatedIds = new Set(input.mandated.map((shop) => shop.shopId))
  return [
    ...input.mandated.map((shop): Activity => ({ id: shop.shopId, kind: "shop", label: shop.shopName, shopId: shop.shopId })),
    ...input.owned
      .filter((shop) => shop.pageHandle !== null && !mandatedIds.has(shop.shopId))
      .map((shop): Activity => ({ id: shop.shopId, kind: "shopWithoutMandate", label: shop.name ?? shop.pageHandle ?? shop.shopId, shopId: shop.shopId })),
    { id: "achats", kind: "purchases", label: input.labels.purchases },
    { id: "relations", kind: "relations", label: input.labels.relations },
  ]
}

/** L'activité ouverte : celle de l'adresse si elle existe, sinon la première (une boutique tenue, ou mes achats). */
export function currentIcomProActivity(activities: readonly Activity[], requested: string | null): Activity | undefined {
  return activities.find((activity) => activity.id === requested) ?? activities[0]
}

export function IcomProConversations({ activity: requested, contextual }: { activity: string | null; contextual: ContextualMessagesInjection }) {
  const { t } = useTranslation("icomPro")
  const { networkId } = useNetwork()
  const [query, setQuery] = useState("")
  const [stateFilter, setStateFilter] = useState<ContactInboxStateFilter>("all")
  const mandated = useAuthenticatedConvexQuery(api.modules.commercialMessaging.team.myShops, { networkId })
  const owned = useAuthenticatedConvexQuery(api.modules.shops.shops.myShops, { networkId })
  const activities = icomProActivities({
    mandated: (mandated.data?.items ?? []).map((shop) => ({ shopId: String(shop.shopId), shopName: shop.shopName })),
    owned: (owned.data?.items ?? []).map((shop) => ({ shopId: String(shop.shopId), name: shop.name, pageHandle: shop.pageHandle })),
    labels: { purchases: t("conversations.purchases"), relations: t("conversations.relations") },
  })
  const current = currentIcomProActivity(activities, requested)
  const shopId = current?.kind === "shop" ? mandated.data?.items.find((shop) => String(shop.shopId) === current.shopId)?.shopId : undefined
  return (
    <section aria-label={t("conversations.label")} className="grid min-w-0 content-start gap-3 p-3">
      <ContactInvitations />
      <nav aria-label={t("conversations.activities")} className="flex min-w-0 flex-wrap gap-2">
        {activities.map((activity) => (
          <Link key={activity.id} href={icomProHref(routes.messages(), activity.id)} prefetch={false} scroll={false} aria-current={activity.id === current?.id ? "page" : undefined} className={CHIP_CLASS}>
            {activity.label}
          </Link>
        ))}
      </nav>
      {current?.kind === "shopWithoutMandate" ? (
        <div className="grid gap-2 rounded-xl border border-border p-3">
          <p className="text-sm">{t("conversations.noShopMandate", { shop: current.label })}</p>
          <Link href={routes.shopEditor(current.shopId)} prefetch={false} className={`${SHOP_ACTION_CLASS} justify-self-start`}>{t("conversations.openTeam")}</Link>
        </div>
      ) : (
        <>
          <label className="grid gap-1 text-sm font-medium">
            {t("conversations.search")}
            <input type="search" className={SHOP_SELECT_CLASS} maxLength={120} value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
          {current?.kind === "shop" ? (
            <div role="group" aria-label={t("conversations.states.label")} className="flex min-w-0 flex-wrap gap-2">
              {STATE_FILTERS.map((state) => (
                <button key={state} type="button" aria-pressed={state === stateFilter} className={TOGGLE_CHIP_CLASS} onClick={() => setStateFilter(state)}>
                  {t(`conversations.states.${state}`)}
                </button>
              ))}
            </div>
          ) : null}
          {current?.kind === "relations" ? contextual.renderList(query)
            : current?.kind === "shop" ? <ContactInboxWindow key={JSON.stringify([current.shopId, query])} query={query} shopId={shopId} stateFilter={stateFilter} />
            : <ContactInboxWindow key={JSON.stringify(["achats", query])} query={query} />}
          {current?.kind === "shop" && stateFilter !== "all" ? <p className="text-xs text-muted-foreground">{t("conversations.windowNote")}</p> : null}
        </>
      )}
    </section>
  )
}
