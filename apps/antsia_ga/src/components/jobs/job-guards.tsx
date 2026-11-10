"use client"

import { api, type Id } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import { useMutation } from "convex/react"
import { useRouter } from "next/navigation"
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { useCartConnectivity } from "@/components/cart/use-cart-draft"
import { Button } from "@/components/shared/controls"
import { ShopLink, useShopAction } from "@/components/shops/shop-ui"
import { jobIntentKey, readJobIntent, removeJobIntent, writeJobIntent, type JobIntent, type JobIntentScope } from "@/lib/job-intent"
import { routes } from "@/lib/routes"
import { jobIdempotencyKey } from "./job-model"

/** Invalide aussi les opérations dont le composant n'a pas encore été remonté par son parent. */
export function useJobAction() {
  const { networkId, personId } = useNetwork()
  const action = useShopAction()
  const actor = JSON.stringify([networkId, personId])
  const epoch = useRef({ actor, version: 0 })
  if (epoch.current.actor !== actor) epoch.current = { actor, version: epoch.current.version + 1 }
  const version = epoch.current.version
  const current = useCallback(() => action.current() && epoch.current.version === version, [action.current, version])
  const run = useCallback(async <T,>(operation: () => Promise<T>, receive?: (result: T) => void) => {
    if (!current()) return undefined
    return await action.run(operation, (result) => { if (current()) receive?.(result) })
  }, [action.run, current])
  return { ...action, current, run }
}
export function useJobReview(conditions = "") {
  const connectivity = useCartConnectivity()
  const [invalidations, setInvalidations] = useState(0)
  const stamp = JSON.stringify([connectivity.generation, conditions, invalidations])
  const latest = useRef(stamp); latest.current = stamp
  const [reviewed, setReviewed] = useState(stamp)
  const action = useJobAction()
  const current = useCallback((expected: string) => action.current() && latest.current === expected, [action.current])
  const refresh = useCallback(async (read: () => Promise<boolean>) => {
    if (!navigator.onLine) return
    const expected = latest.current
    await action.run(read, (ready) => { if (ready && navigator.onLine && current(expected)) setReviewed(expected) })
  }, [action.run, current])
  return { ...connectivity, stamp, current, paused: !connectivity.online || stamp !== reviewed, refresh, invalidate: () => setInvalidations((value) => value + 1), pending: action.pending, error: action.error }
}
export function JobReviewNotice({ review, onReview }: { review: ReturnType<typeof useJobReview>; onReview: () => Promise<boolean> }) {
  const { t } = useTranslation("jobs")
  return <>{!review.online ? <p role="status" className="text-sm">{t("recovery.offline")}</p> : review.paused ? <div className="grid gap-2"><p role="status" className="text-sm">{t("recovery.reviewRequired")}</p><Button type="button" variant="outline" pending={review.pending} onClick={() => { void review.refresh(onReview) }}>{t("recovery.review")}</Button></div> : null}{review.error ? <p role="alert" className="text-sm">{review.error}</p> : null}</>
}

export function useJobIntent(handle: string, jobRef: string) {
  const { networkId, personId } = useNetwork()
  const scope: JobIntentScope = { networkId: String(networkId), personId: String(personId), handle, jobRef }
  const key = jobIntentKey(scope)
  const action = useJobAction()
  const router = useRouter()
  const held = useRef<JobIntent | null>(null)
  const [state, setState] = useState<{ key: string; record: JobIntent | null; failed: boolean; restored: boolean } | null>(null)
  useEffect(() => {
    try { const record = readJobIntent(window.sessionStorage, scope, Date.now()); held.current = record; setState({ key, record, failed: false, restored: !!record }) }
    catch { held.current = null; setState({ key, record: null, failed: true, restored: false }) }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  const begin = () => {
    if (!action.current() || !navigator.onLine || state?.key !== key || state.failed || held.current) return null
    try {
      const existing = readJobIntent(window.sessionStorage, scope, Date.now())
      if (existing) { held.current = existing; setState({ key, record: existing, failed: false, restored: true }); return null }
      const value: JobIntent = { version: 1, ...scope, idempotencyKey: jobIdempotencyKey(), createdAt: Date.now() }
      if (!writeJobIntent(window.sessionStorage, value, Date.now())) throw new Error("jobIntentStorage")
      held.current = value; setState({ key, record: value, failed: false, restored: false }); return value.idempotencyKey
    } catch { setState({ key, record: held.current, failed: true, restored: false }); return null }
  }
  const complete = useCallback((applicationId: Id<"commerceApplications">) => {
    if (!action.current()) return
    try { removeJobIntent(window.sessionStorage, scope) } catch { /* Le suivi reste accessible. */ }
    router.push(routes.jobApplication(applicationId))
  }, [action.current, key, router]) // eslint-disable-line react-hooks/exhaustive-deps
  const stopped = () => {
    if (!action.current()) return false
    try { if (!removeJobIntent(window.sessionStorage, scope)) return false } catch { return false }
    held.current = null; setState({ key, record: null, failed: false, restored: false }); return true
  }
  return { begin, complete, stopped, current: action.current, record: state?.key === key ? state.record : null, ready: state?.key === key, failed: state?.key === key && state.failed, restored: state?.key === key && state.restored, locked: state?.key !== key || !!held.current }
}
const IntentContext = createContext<ReturnType<typeof useJobIntent> | null>(null)
export function useJobEntryIntent() { return useContext(IntentContext) }
export function JobIntentBoundary({ handle, jobRef, children }: { handle: string; jobRef: string; children: ReactNode }) {
  const intent = useJobIntent(handle, jobRef)
  const { t } = useTranslation("jobs")
  if (!intent.ready) return <p role="status">{t("directory.loading")}</p>
  if (intent.restored && intent.record) return <JobIntentRecovery intent={intent} onStopped={() => {}} />
  if (intent.failed) return <div role="alert"><p>{t("recovery.storageUnavailable")}</p><ShopLink href={routes.myApplications()}>{t("applications.title")}</ShopLink></div>
  return <IntentContext.Provider value={intent}>{children}</IntentContext.Provider>
}
export function JobIntentRecovery({ intent, onStopped }: { intent: ReturnType<typeof useJobIntent>; onStopped: () => void }) {
  const { networkId } = useNetwork()
  const { t } = useTranslation("jobs")
  const connectivity = useCartConnectivity()
  const action = useJobAction()
  const stop = useMutation(api.modules.shops.jobApplications.stopClientIntent)
  const query = useAuthenticatedConvexQuery(api.modules.shops.jobApplications.findByIdempotencyKey, intent.record ? { networkId, idempotencyKey: intent.record.idempotencyKey } : "skip")
  useEffect(() => { if (!query.isError && query.data?.outcome === "application") intent.complete(query.data.applicationId) }, [query.data, query.isError, intent.complete])
  if (!intent.record) return intent.failed ? <p role="alert">{t("recovery.storageUnavailable")}</p> : null
  const absent = !query.isError && !query.isPending && (query.data?.outcome === "absent" || query.data?.outcome === "stopped")
  return <div role="status" className="grid gap-3"><p>{t("recovery.uncertain")}</p><ShopLink href={routes.myApplications()}>{t("applications.title")}</ShopLink><Button type="button" variant="outline" pending={query.isFetching} disabled={!connectivity.online} onClick={() => { if (navigator.onLine) void query.refetch() }}>{t("recovery.lookup")}</Button>{absent ? <><p className="text-sm">{t("recovery.stopHint")}</p><Button type="button" variant="outline" pending={action.pending} disabled={!connectivity.online} onClick={() => {
    if (!navigator.onLine || !intent.record) return
    void action.run(() => stop({ networkId, idempotencyKey: intent.record!.idempotencyKey }), (result) => {
      if (result.outcome === "application") intent.complete(result.applicationId)
      else if (result.outcome === "stopped" && intent.stopped()) onStopped()
    })
  }}>{t("recovery.stop")}</Button></> : query.isError ? <p>{t("applications.unavailable")}</p> : null}{action.error ? <p role="alert">{action.error}</p> : null}</div>
}
