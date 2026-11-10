"use client"

import { api } from "@antsia/api/engine"
import { useNetwork } from "@antsia/api/network"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useMutation } from "convex/react"
import { useRouter } from "next/navigation"
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { useCartConnectivity } from "@/components/cart/use-cart-draft"
import { Button } from "@/components/shared/controls"
import { ShopLink, useShopAction } from "@/components/shops/shop-ui"
import { readServiceIntent, removeServiceIntent, serviceIntentKey, writeServiceIntent, type ServiceIntent, type ServiceIntentScope } from "@/lib/service-intent"
import { routes } from "@/lib/routes"

/** Pas d'envoi automatique au retour du réseau ; les champs saisis restent en mémoire. */
export function useServiceReview(conditions = "") {
  const connectivity = useCartConnectivity()
  const [invalidations, setInvalidations] = useState(0)
  const stamp = JSON.stringify([connectivity.generation, conditions, invalidations])
  const [reviewed, setReviewed] = useState(stamp)
  const action = useShopAction()
  const stampRef = useRef(stamp); stampRef.current = stamp
  const generationRef = useRef(connectivity.generation); generationRef.current = connectivity.generation
  const refresh = useCallback(async (read: () => Promise<boolean>) => {
    if (!navigator.onLine) return
    const expectedGeneration = generationRef.current
    const expectedStamp = stampRef.current
    await action.run(read, (accepted) => { if (accepted && navigator.onLine && generationRef.current === expectedGeneration && stampRef.current === expectedStamp) setReviewed(expectedStamp) })
  }, [action.run])
  return { ...connectivity, stamp, paused: !connectivity.online || reviewed !== stamp, pending: action.pending, error: action.error, refresh, invalidate: () => setInvalidations((value) => value + 1) }
}
export function ServiceReviewNotice({ review, onReview }: { review: ReturnType<typeof useServiceReview>; onReview: () => Promise<boolean> }) {
  const { t } = useTranslation("services")
  return <>{!review.online ? <p role="status" className="text-sm">{t("recovery.offline")}</p> : review.paused ? <div className="grid gap-2"><p role="status" className="text-sm">{t("recovery.reviewRequired")}</p><Button type="button" variant="outline" pending={review.pending} onClick={() => { void review.refresh(onReview) }}>{t("recovery.review")}</Button></div> : null}{review.error ? <p role="alert" className="text-sm">{review.error}</p> : null}</>
}

export function useServiceInitialIntent({ mode, handle, offerRef, requestRowId }: Pick<ServiceIntentScope, "mode" | "handle" | "offerRef" | "requestRowId">) {
  const { networkId, personId } = useNetwork()
  const scope: ServiceIntentScope = { networkId: String(networkId), personId: String(personId), mode, handle, offerRef, ...(requestRowId ? { requestRowId } : {}) }
  const key = serviceIntentKey(scope)
  const router = useRouter()
  const action = useShopAction()
  const [state, setState] = useState<{ key: string; record: ServiceIntent | null; failed: boolean; restored: boolean } | null>(null)
  const held = useRef<ServiceIntent | null>(null)
  useEffect(() => {
    try { const record = readServiceIntent(window.sessionStorage, scope, Date.now()); held.current = record; setState({ key, record, failed: false, restored: !!record }) }
    catch { setState({ key, record: null, failed: true, restored: false }) }
    // La frontière par personne/réseau remonte également le formulaire parent.
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  const record = state?.key === key ? state.record : null
  const begin = (): string | null => {
    if (!action.current() || !navigator.onLine || !state || state.key !== key || state.failed || held.current) return null
    const value: ServiceIntent = { version: 1, ...scope, clientRequestId: crypto.randomUUID(), createdAt: Date.now() }
    try { if (!writeServiceIntent(window.sessionStorage, value, Date.now())) { setState({ key, record: null, failed: true, restored: false }); return null } }
    catch { setState({ key, record: null, failed: true, restored: false }); return null }
    held.current = value; setState({ key, record: value, failed: false, restored: false })
    return value.clientRequestId
  }
  const complete = useCallback((requestRowId: string) => {
    if (!action.current()) return
    // La demande existe avec certitude ; son suivi serveur devient la porte de reprise.
    try { removeServiceIntent(window.sessionStorage, scope) } catch { /* Le suivi reste accessible même si le stockage est verrouillé. */ }
    router.push(scope.requestRowId ? routes.serviceRequests() : routes.serviceRequest(requestRowId))
  }, [action.current, key, router]) // eslint-disable-line react-hooks/exhaustive-deps
  const stopped = () => {
    if (!action.current()) return false
    if (!removeServiceIntent(window.sessionStorage, scope)) { setState({ key, record: held.current, failed: true, restored: !!state?.restored }); return false }
    held.current = null; setState({ key, record: null, failed: false, restored: false }); return true
  }
  return { record, begin, complete, stopped, ready: state?.key === key, failed: state?.key === key && state.failed, locked: !!record || !!held.current, restored: state?.key === key && state.restored, current: action.current }
}
const EntryIntent = createContext<ReturnType<typeof useServiceInitialIntent> | null>(null)
export function useServiceEntryIntent() { return useContext(EntryIntent) }
/** La reprise précède les lectures de l'offre : un retrait ne masque pas une demande envoyée. */
export function ServiceInitialIntentBoundary({ mode, handle, offerRef, children }: Pick<ServiceIntentScope, "mode" | "handle" | "offerRef"> & { children: ReactNode }) {
  const intent = useServiceInitialIntent({ mode, handle, offerRef })
  const { t } = useTranslation("services")
  if (!intent.ready) return <p role="status">{t("common.loading")}</p>
  if (intent.restored && intent.record) return <ServiceIntentRecovery intent={intent} onStopped={() => {}} />
  return <EntryIntent.Provider value={intent}>{intent.failed ? <p role="alert">{t("recovery.storageUnavailable")}</p> : null}{children}</EntryIntent.Provider>
}
export function ServiceIntentRecovery({ intent, onStopped }: { intent: ReturnType<typeof useServiceInitialIntent>; onStopped: () => void }) {
  const { networkId } = useNetwork()
  const { t } = useTranslation("services")
  const connectivity = useCartConnectivity()
  const action = useShopAction()
  const stop = useMutation(api.modules.shops.services.stopClientIntent)
  const query = useAuthenticatedConvexQuery(api.modules.shops.services.findByClientRequestId, intent.record ? { networkId, clientRequestId: intent.record.clientRequestId } : "skip")
  useEffect(() => { if (!query.isError && query.data?.outcome === "request") intent.complete(query.data.requestRowId) }, [query.data, query.isError, intent.complete])
  if (!intent.record) return intent.failed ? <p role="alert">{t("recovery.storageUnavailable")}</p> : null
  const absent = !query.isError && (query.data?.outcome === "absent" || query.data?.outcome === "stopped")
  return <div className="grid gap-3" role="status"><p>{t("recovery.uncertain")}</p><ShopLink href={routes.serviceRequests()}>{t("requests.title")}</ShopLink><Button type="button" variant="outline" disabled={!connectivity.online} pending={query.isFetching} onClick={() => { if (navigator.onLine) void query.refetch() }}>{t("recovery.lookup")}</Button>{absent ? <><p className="text-sm">{t("recovery.stopHint")}</p><Button type="button" variant="outline" pending={action.pending} disabled={!connectivity.online} onClick={() => {
    if (!navigator.onLine || !intent.record) return
    void action.run(() => stop({ networkId, clientRequestId: intent.record!.clientRequestId }), (result) => {
      if (result.outcome === "request") intent.complete(result.requestRowId)
      else if (result.outcome === "stopped" && intent.stopped()) onStopped()
    })
  }}>{t("recovery.stop")}</Button></> : query.isError ? <p>{t("common.unavailable")}</p> : null}{action.error ? <p role="alert">{action.error}</p> : null}</div>
}
