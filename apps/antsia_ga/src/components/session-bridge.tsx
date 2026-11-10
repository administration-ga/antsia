"use client"

import { useConvexAuth } from "convex/react"
import { type ReactNode, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { isSigningOutEverywhere } from "@antsia/api/sign-out-everywhere"

import { authClient } from "@/lib/auth-client"
import { buttonClassName } from "@/components/shared/button-class"
import { BRIDGE_CLIENT_TIMEOUT_MS, BRIDGE_RESUME_EVENT, sdkSessionCookie } from "@/lib/session-bridge"
import { clearLocalSessionForAnonymousBridge, currentSessionBridgeGeneration, requestSessionBridge, rotateSessionBridgeFence, withSessionBridgeLock } from "@/lib/session-bridge-client"

/** La génération ferme l'ancien reçu AVANT que le SDK ne consomme un éventuel OTT. */
export function SessionBridgePreflight({ children }: { children: ReactNode }) {
  const { t } = useTranslation("publicNetwork")
  const [phase, setPhase] = useState<"pending" | "ready" | "error">("pending")
  const pending = useRef<Promise<boolean> | null>(null)
  useEffect(() => {
    // Une transition déjà engagée peut remonter cette porte pendant la sortie.
    // Seul le gestionnaire de sortie possède alors la génération et sa purge.
    if (isSigningOutEverywhere()) return
    let cancelled = false
    if (!pending.current) pending.current = withSessionBridgeLock(async () => {
        if (isSigningOutEverywhere()) return false
        const generation = rotateSessionBridgeFence()
        // Pas de marque anonyme avant la purge/proof du SDK. Même un OTT sans API sera fermé.
        return requestSessionBridge("DELETE", { generation, anonymous: false })
    })
    void pending.current.then((cleared) => { if (!cancelled && !isSigningOutEverywhere()) setPhase(cleared ? "ready" : "error") }).catch(() => { if (!cancelled && !isSigningOutEverywhere()) setPhase("error") })
    return () => { cancelled = true }
  }, [])
  if (phase === "ready") return children
  return <BridgeStatus failed={phase === "error"} label={t(phase === "error" ? "session.unavailable" : "session.preparing")} />
}

function BridgeStatus({ label, failed }: { label: string; failed: boolean }) {
  const { t } = useTranslation("publicNetwork")
  return <div role={failed ? "alert" : "status"} className="mx-auto flex min-h-[50dvh] max-w-lg flex-col items-center justify-center gap-4 px-5 text-center"><p>{label}</p>{failed ? <button className={buttonClassName("outline")} onClick={() => window.location.reload()}>{t("states.retry")}</button> : null}</div>
}

/** Monté APRÈS LiveSessionGate : promotion seulement après les barrières session/JWT réussies. */
export function SessionBridge({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useConvexAuth()
  const { t } = useTranslation("publicNetwork")
  const [phase, setPhase] = useState<"pending" | "ready" | "error">("pending")
  const [resume, setResume] = useState<string | null>(null)
  useEffect(() => {
    const requested = (event: Event) => {
      if (event instanceof CustomEvent && typeof event.detail === "string") setResume(event.detail)
    }
    window.addEventListener(BRIDGE_RESUME_EVENT, requested)
    return () => window.removeEventListener(BRIDGE_RESUME_EVENT, requested)
  }, [])
  useEffect(() => {
    if (isLoading || isSigningOutEverywhere()) return
    let cancelled = false
    const controller = new AbortController()
    setPhase("pending")
    async function synchronize() {
      let admitted = false
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        admitted = await withSessionBridgeLock(async () => {
          if (cancelled || isSigningOutEverywhere()) return false
          const generation = resume ?? currentSessionBridgeGeneration()
          if (!generation) return false
          if (isAuthenticated) {
            const cookie = authClient.getCookie()
            const sessionCookie = sdkSessionCookie(cookie)
            const result = await Promise.race([authClient.convex.token({ fetchOptions: { throw: false, signal: controller.signal } }), new Promise<never>((_resolve, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("bridgeTimeout")) }, BRIDGE_CLIENT_TIMEOUT_MS) })])
            // Le SDK renouvelle aussi des cookies auxiliaires (JWT/cache) : seul le SID signé porte la session.
            const currentCookie = sdkSessionCookie(authClient.getCookie())
            const sameSession = sessionCookie !== null && currentCookie?.name === sessionCookie.name && currentCookie.value === sessionCookie.value
            if (!result.error && typeof result.data?.token === "string" && currentSessionBridgeGeneration() === generation && sameSession && !isSigningOutEverywhere()) return requestSessionBridge("POST", { generation, cookie, jwt: result.data.token }, fetch, controller.signal)
            return false
          } else {
            const anonymous = clearLocalSessionForAnonymousBridge()
            if (!anonymous) return false
            return requestSessionBridge("DELETE", { generation, anonymous: true }, fetch, controller.signal)
          }
        }, controller.signal)
      } catch { admitted = false }
      finally { if (timer !== undefined) clearTimeout(timer) }
      if (!cancelled && !isSigningOutEverywhere()) setPhase(admitted ? "ready" : "error")
    }
    void synchronize()
    return () => { cancelled = true; controller.abort() }
    // Une rotation ne déclenche rien : seul un nouveau montage/état prouvé ou un geste de reprise le fait.
  }, [isAuthenticated, isLoading, resume])
  if (phase === "ready") return children
  return <BridgeStatus failed={phase === "error"} label={t(phase === "error" ? "session.unavailable" : "session.confirming")} />
}
