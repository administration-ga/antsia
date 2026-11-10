"use client"

import { api, type Id } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import { useAction } from "convex/react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shared/controls"
import { useShopAction } from "./shop-ui"

export function CatalogReconcilePanel({ shopId, dirty }: { shopId: Id<"shops">; dirty: boolean }) {
  const { networkId, personId } = useNetwork()
  const { t } = useTranslation("shops")
  const query = useAuthenticatedConvexQuery(api.modules.shops.commerceLinks.linkStatus, { networkId, shopId })
  if (query.isError || !query.data) return <p className="text-sm text-muted-foreground">{t("catalog.sync.unavailable")}</p>
  if (!query.data.available || query.data.link?.state !== "active" || !query.data.link.permissions.includes("publish_catalog")) return <p className="text-sm text-muted-foreground">{t("catalog.sync.linkRequired")}</p>
  return <ReconcileAction key={JSON.stringify([networkId, personId, shopId, query.data.link])} shopId={shopId} dirty={dirty} />
}
function ReconcileAction({ shopId, dirty }: { shopId: Id<"shops">; dirty: boolean }) {
  const { networkId } = useNetwork()
  const { t } = useTranslation("shops")
  const reconcile = useAction(api.modules.shops.catalogActions.reconcile)
  const action = useShopAction()
  const [cursor, setCursor] = useState<string | null>(null)
  const [queued, setQueued] = useState<number | null>(null)
  const [refused, setRefused] = useState(false)
  return <section className="grid gap-3 rounded-[var(--ui2-card-radius)] border border-[color:var(--esp-surface-border)] bg-background p-[var(--esp-card-padding,16px)]"><h3 className="font-display text-base font-bold leading-snug">{t("catalog.sync.title")}</h3><p className="text-sm text-muted-foreground">{t("catalog.sync.lead")}</p><Button type="button" variant="outline" pending={action.pending} disabled={dirty || refused} className="w-full sm:w-auto sm:justify-self-start" onClick={() => {
    if (dirty || refused) return
    void action.run(() => reconcile({ networkId, shopId, cursor }), (result) => {
      if (result.outcome !== "queued") { setCursor(null); setQueued(null); setRefused(true); return }
      setCursor(result.done ? null : result.cursor)
      setQueued(result.queued)
    })
  }}>{t(cursor ? "catalog.sync.continue" : "catalog.sync.start")}</Button>{dirty ? <p role="status" className="text-sm text-muted-foreground">{t("link.saveFirst")}</p> : null}{queued !== null ? <p role="status" className="text-sm">{t("catalog.sync.queued", { count: queued })}</p> : null}{refused ? <p role="alert" className="text-sm text-muted-foreground">{t("catalog.sync.unavailable")}</p> : null}{action.error ? <p role="alert" className="text-sm text-destructive">{action.error}</p> : null}</section>
}
