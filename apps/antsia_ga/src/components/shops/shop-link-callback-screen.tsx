"use client"

import { api } from "@antsia/api/engine"
import { useNetwork } from "@antsia/api/network"
import { useAction, useConvexAuth } from "convex/react"
import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button, Card } from "@/components/shared/controls"
import { routes } from "@/lib/routes"
import { browserAppPath } from "@/lib/app-path"
import { ShopFrame, ShopLink, useShopAction } from "./shop-ui"

export function ShopLinkCallbackScreen({ state, code }: { state: string | null; code: string | null }) {
  const { networkId, personId } = useNetwork()
  return <ShopLinkCallback key={`${networkId}:${personId}:${state ?? "invalid"}`} state={state} code={code} />
}

function ShopLinkCallback({ state, code }: { state: string | null; code: string | null }) {
  const { t } = useTranslation("shops")
  const { networkId } = useNetwork()
  const { isAuthenticated } = useConvexAuth()
  const complete = useAction(api.modules.shops.commerceLinkActions.completeLink)
  const action = useShopAction()
  const started = useRef(false)
  const [outcome, setOutcome] = useState<"waiting" | "linked" | "refused" | "unavailable">("waiting")
  const [shopId, setShopId] = useState<string | null>(null)
  const run = useCallback(async () => {
    if (!state || !code || !isAuthenticated) return
    setOutcome("waiting")
    await action.run(() => complete({ networkId, state, code }), (result) => {
      setOutcome(result.outcome)
      if (result.outcome === "linked") setShopId(String(result.shopId))
    })
  }, [action.run, code, complete, isAuthenticated, networkId, state])

  useEffect(() => {
    // Retire les preuves de la barre d'adresse ; aucune persistance navigateur.
    window.history.replaceState(window.history.state, "", browserAppPath(routes.shopLinkCallback()))
  }, [])
  useEffect(() => {
    if (started.current || !isAuthenticated || !state || !code) return
    started.current = true
    void run()
  }, [code, isAuthenticated, run, state])

  const invalid = !state || !code
  return <ShopFrame title={t("link.callbackTitle")}><Card><div className="grid gap-4">
    <p role={invalid || outcome === "refused" || action.error ? "alert" : "status"}>{t(invalid ? "link.callbackInvalid" : `link.callback.${outcome}`)}</p>
    {action.error ? <p role="alert" className="text-sm text-destructive">{action.error}</p> : null}
    {!invalid && (outcome === "unavailable" || action.error) ? <Button type="button" variant="outline" pending={action.pending} className="w-full sm:w-auto sm:justify-self-start" onClick={() => void run()}>{t("common.retry")}</Button> : null}
    <ShopLink href={shopId ? routes.shopEditor(shopId) : routes.myShops()}>{t(shopId ? "link.returnEditor" : "list.title")}</ShopLink>
  </div></Card></ShopFrame>
}
