"use client"

import { api, type Id } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useMutation } from "convex/react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Button, Card } from "./shared/controls"
import { useShopAction } from "./shops/shop-ui"

/** Pas d'adhésion réseau exigée : seule la preuve personnelle de consentement est lue. */
export function PersonalCommerceControls({ personId }: { personId: Id<"persons"> }) {
  const { t } = useTranslation(["antsia", "shops"])
  const [cursors, setCursors] = useState<(string | null)[]>([null])
  const page = useAuthenticatedConvexQuery(api.modules.commercialMessaging.crm.paginateMyTransfers, { expectedPersonId: personId, paginationOpts: { cursor: cursors.at(-1) ?? null, numItems: 10 } })
  const withdraw = useMutation(api.modules.commercialMessaging.crm.withdrawCrmConsent)
  const retry = useMutation(api.modules.commercialMessaging.crm.retryTransfer)
  const action = useShopAction()
  const [saved, setSaved] = useState(false)
  return <Card><div className="grid gap-4">
    <h2 className="text-xl font-semibold">{t("personal.commerceTitle")}</h2>
    <p className="text-sm text-muted-foreground">{t("personal.commerceLead")}</p>
    {page.isError ? <p role="alert">{t("personal.error")}</p> : page.data === undefined ? <p role="status">{t("personal.loading")}</p> : page.data.page.length === 0 ? <p>{t("personal.commerceEmpty")}</p> : <ul className="grid gap-3">{page.data.page.map((row) => <li key={row.transferId} className="grid gap-2 rounded-[var(--ui2-card-radius)] border border-border p-[var(--esp-card-padding,16px)]">
      <p className="text-sm">{t(`shops:contact.crm.states.${row.state}`)}</p>
      <p className="text-xs text-muted-foreground">{t("personal.commerceVersion", { version: row.textVersion })}</p>
      <div className="flex flex-wrap gap-2">
        {row.revokedAt === undefined ? <Button variant="outline" pending={action.pending} onClick={() => void action.run(() => withdraw({ networkId: row.networkId, threadId: row.threadId }), () => setSaved(true))}>{t("shops:contact.crm.withdraw")}</Button> : null}
        {row.state === "failed" || row.state === "withdrawal_pending" ? <Button variant="outline" pending={action.pending} onClick={() => void action.run(() => retry({ networkId: row.networkId, threadId: row.threadId }), () => setSaved(true))}>{t("shops:contact.crm.retry")}</Button> : null}
      </div>
    </li>)}</ul>}
    {page.isError ? <Button variant="outline" onClick={() => void page.refetch()}>{t("shops:common.retry")}</Button> : null}
    <div className="flex flex-wrap gap-2">
      <Button variant="ghost" disabled={cursors.length <= 1 || action.pending} onClick={() => setCursors((value) => value.slice(0, -1))}>{t("personal.commercePrevious")}</Button>
      <Button variant="ghost" disabled={!page.data || page.data.isDone || action.pending} onClick={() => { const cursor = page.data?.continueCursor; if (cursor) setCursors((value) => [...value, cursor]) }}>{t("personal.commerceNext")}</Button>
    </div>
    {action.error ? <p role="alert">{action.error}</p> : saved ? <p role="status">{t("shops:contact.crm.recorded")}</p> : null}
  </div></Card>
}
