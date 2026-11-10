"use client"
import { signOutEverywhere } from "@antsia/api/sign-out-everywhere"
import { authClient } from "./auth-client"
import { demoSessionStorage } from "./demo-storage"
import { appBasePath, browserAppPath } from "./app-path"
import { routes } from "./routes"
import { requestSessionBridge, rotateSessionBridgeFence, withSessionBridgeLock } from "./session-bridge-client"

async function finishSignOut(generation: string | null): Promise<void> {
  let navigation: Promise<void> = Promise.resolve()
  let storageUnavailable = false
  let storages: Storage[] | undefined
  if (appBasePath()) {
    storages = []
    try { storages = [demoSessionStorage()!, demoSessionStorage("sessionStorage")!] }
    catch { storageUnavailable = true }
  }
  await signOutEverywhere(authClient, {
    storages,
    navigate: (result) => {
      // Le callback démarre la navigation, le verrou shared reste acquis jusqu'au nouveau document.
      navigation = (async () => {
        const localCleared = result.localCleared && !storageUnavailable
        const bridgeCleared = generation !== null && await requestSessionBridge("DELETE", { generation, anonymous: localCleared })
        window.location.assign(browserAppPath(routes.signedOut(!result.serverRevoked || !localCleared || !bridgeCleared)))
      })()
    },
  })
  // Le callback partagé est synchrone : garder le verrou d'origine jusqu'à sa continuation.
  await navigation
}

/** Rechargement complet : les singletons, médias et caches de l'onglet disparaissent. */
export async function signOutAndRedirect(): Promise<void> {
  let started = false
  try {
    await withSessionBridgeLock(async () => {
      started = true
      let generation: string | null = null
      try { generation = rotateSessionBridgeFence() } catch { /* La sortie SDK et sa purge restent nécessaires. */ }
      await finishSignOut(generation)
    })
  } catch (error) {
    if (started) throw error
    // Sans verrou, révoquer/purger le SDK reste nécessaire ; aucun reçu étranger n'est touché.
    await finishSignOut(null)
  }
}
