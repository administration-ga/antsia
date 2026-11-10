"use client"

import { clearCrossDomainSessionResidue } from "@antsia/api/cross-domain-session-bootstrap"
import { isSigningOutEverywhere } from "@antsia/api/sign-out-everywhere"
import type { IdentityAuthClient } from "@antsia/social-features/identity"
import { authClient } from "./auth-client"
import { appBasePath, browserAppPath } from "./app-path"
import { demoSessionStorage } from "./demo-storage"
import { routes } from "./routes"
import { BRIDGE_CLIENT_TIMEOUT_MS, BRIDGE_RESUME_EVENT, BRIDGE_TTL_SECONDS, bridgeCookieNames, isBridgeGeneration, sdkSessionCookie } from "./session-bridge"

const SESSION_BRIDGE_LOCK_NAME = appBasePath() ? "antsia-demo-scope:session-transition" : "antsia:session-transition"
export const SESSION_BRIDGE_LOCK_WAIT_MS = 30_000
const SESSION_ENTRY_TIMEOUT_MS = 10_000

/** Verrou d'origine : aucun préflight d'un autre onglet ne tourne la génération pendant une sortie. */
export async function withSessionBridgeLock<T>(work: () => T | Promise<T>, signal?: AbortSignal): Promise<T> {
  const manager = typeof navigator === "undefined" ? undefined : navigator.locks
  if (!manager?.request) throw new Error("sessionBridgeLockUnavailable")
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal?.addEventListener("abort", abort, { once: true })
  if (signal?.aborted) controller.abort()
  // Seule l'attente en file est bornée ici ; SDK et pont gardent leurs propres délais.
  const timer = setTimeout(abort, SESSION_BRIDGE_LOCK_WAIT_MS)
  try {
    return await manager.request(SESSION_BRIDGE_LOCK_NAME, { mode: "exclusive", signal: controller.signal }, async () => {
      clearTimeout(timer)
      signal?.throwIfAborted()
      return await work()
    })
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener("abort", abort)
  }
}

export function currentSessionBridgeGeneration(): string | null {
  if (typeof document === "undefined") return null
  const name = bridgeCookieNames(window.location.protocol === "https:").generation
  const value = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1)
  return isBridgeGeneration(value) ? value : null
}

/** Synchrone : aucune ancienne réponse HTTP ne peut ouvrir la nouvelle génération. */
export function rotateSessionBridgeFence(): string {
  const generation = crypto.randomUUID()
  const secure = window.location.protocol === "https:"
  const name = bridgeCookieNames(secure).generation
  document.cookie = `${name}=${generation}; Path=/; SameSite=Lax; Max-Age=${BRIDGE_TTL_SECONDS}${secure ? "; Secure" : ""}`
  if (currentSessionBridgeGeneration() !== generation) throw new Error("bridgeStorageUnavailable")
  return generation
}

export async function requestSessionBridge(method: "POST" | "DELETE", body: { generation: string; cookie?: string; jwt?: string; anonymous?: boolean }, fetchImpl: typeof fetch = fetch, outerSignal?: AbortSignal): Promise<boolean> {
  const controller = new AbortController()
  const abort = () => controller.abort()
  outerSignal?.addEventListener("abort", abort, { once: true })
  if (outerSignal?.aborted) { outerSignal.removeEventListener("abort", abort); return false }
  let timer: ReturnType<typeof setTimeout> | undefined
  let rejectAbort: () => void = () => undefined
  const interrupted = new Promise<never>((_resolve, reject) => { rejectAbort = () => reject(new Error("bridgeInterrupted")) })
  controller.signal.addEventListener("abort", rejectAbort, { once: true })
  try {
    const response = await Promise.race([
      fetchImpl(browserAppPath(routes.publicSessionBridge()), { method, credentials: "same-origin", cache: "no-store", redirect: "error", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: controller.signal }),
      interrupted,
      new Promise<never>((_resolve, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("bridgeTimeout")) }, BRIDGE_CLIENT_TIMEOUT_MS) }),
    ])
    return response.ok && currentSessionBridgeGeneration() === body.generation
  } catch { return false }
  finally { if (timer !== undefined) clearTimeout(timer); outerSignal?.removeEventListener("abort", abort); controller.signal.removeEventListener("abort", rejectAbort) }
}

/** Pas de logout SDK ici : une arrivée refusée ne révoque aucune session étrangère. */
export function clearLocalSessionForAnonymousBridge(): boolean {
  try {
    // Un autre onglet peut avoir connecté B depuis notre amorçage anonyme.
    if (sdkSessionCookie(authClient.getCookie()) || authClient.getSessionData() !== null) return false
    clearCrossDomainSessionResidue(demoSessionStorage() ?? window.localStorage, authClient)
    return !sdkSessionCookie(authClient.getCookie()) && authClient.getSessionData() === null
  } catch { return false }
}

/** Reprise demandée par la personne, jamais déclenchée par une simple rotation. */
export async function resumeSessionBridge(): Promise<void> {
  await withSessionBridgeLock(() => {
    if (isSigningOutEverywhere()) throw new Error("sessionBridgeTransitionUnavailable")
    const generation = rotateSessionBridgeFence()
    window.dispatchEvent(new CustomEvent(BRIDGE_RESUME_EVENT, { detail: generation }))
  })
}

/** Adaptateur d'entrée local : le client partagé et ses plugins restent inchangés. */
export function fencedIdentityEntryClient(client: IdentityAuthClient, fence: () => string = rotateSessionBridgeFence): IdentityAuthClient {
  const enter = <T>(work: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal) => withSessionBridgeLock(async () => {
    if (isSigningOutEverywhere()) throw new Error("sessionBridgeTransitionUnavailable")
    const controller = new AbortController()
    const abort = () => controller.abort()
    signal?.addEventListener("abort", abort, { once: true })
    if (signal?.aborted) controller.abort()
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      controller.signal.throwIfAborted()
      fence()
      const result = await Promise.race([
        work(controller.signal),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => { controller.abort(); reject(new Error("sessionEntryTimeout")) }, SESSION_ENTRY_TIMEOUT_MS)
        }),
      ])
      controller.signal.throwIfAborted()
      return result
    } finally {
      if (timer !== undefined) clearTimeout(timer)
      signal?.removeEventListener("abort", abort)
    }
  }, signal)
  return {
    signIn: {
      oauth2: (args) => enter((signal) => client.signIn.oauth2({ ...args, fetchOptions: { ...args.fetchOptions, signal } }), args.fetchOptions?.signal),
      emailOtp: (args) => enter((signal) => client.signIn.emailOtp({ ...args, fetchOptions: { ...args.fetchOptions, signal } }), args.fetchOptions?.signal),
    },
    emailOtp: { sendVerificationOtp: (args) => client.emailOtp.sendVerificationOtp(args) },
    phoneNumber: { sendOtp: (args) => client.phoneNumber.sendOtp(args), verify: (args) => enter((signal) => client.phoneNumber.verify({ ...args, fetchOptions: { ...args.fetchOptions, signal } }), args.fetchOptions?.signal) },
  }
}
