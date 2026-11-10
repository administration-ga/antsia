"use client"

import { api } from "@antsia/api/engine"
import { useNetwork } from "@antsia/api/network"
import { connectionRequestRetryAfter } from "@antsia/social-contracts/connectionRequests"
import { useMutation } from "convex/react"
import { useCallback, useEffect, useState, useSyncExternalStore } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

type State = { pendingHandle: string | null; retryAt: number }
const EMPTY: State = { pendingHandle: null, retryAt: 0 }
// Le budget serveur est personnel, partagé entre réseaux. Mémoire du document
// uniquement : la navigation complète de déconnexion la détruit.
const states = new Map<string, State>()
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
function publish(personId: string, state: State) {
  states.set(personId, state)
  for (const listener of listeners) listener()
}

/** Même verrou et même attente dans le rail, l'annuaire, la recherche et le profil. */
export function useConnectionRequest() {
  const { networkId, personId } = useNetwork()
  const mutation = useMutation(api.modules.graph.connections.requestConnection)
  const { t } = useTranslation("reseau")
  const getSnapshot = useCallback(() => states.get(personId) ?? EMPTY, [personId])
  const state = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY)
  const [now, setNow] = useState(Date.now)
  const seconds = Math.max(0, Math.ceil((state.retryAt - now) / 1000))
  useEffect(() => {
    setNow(Date.now())
    if (state.retryAt <= Date.now()) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [state.retryAt])

  const send = useCallback(async (args: { handle: string; message?: string }): Promise<boolean> => {
    // Synchrone : deux clics avant le prochain rendu ne peuvent pas envoyer deux demandes.
    const current = states.get(personId) ?? EMPTY
    if (current.pendingHandle !== null || current.retryAt > Date.now()) return false
    publish(personId, { pendingHandle: args.handle, retryAt: 0 })
    const wait = (retryAfterMs: number) => {
      publish(personId, { pendingHandle: null, retryAt: Date.now() + retryAfterMs })
      toast.info(t("connectionRequest.wait", { count: Math.ceil(retryAfterMs / 1000) }))
      return false
    }
    try {
      const result = await mutation({ networkId, ...args, returnRateLimit: true })
      const delay = connectionRequestRetryAfter(result)
      if (delay !== null) return wait(delay)
      return true
    } catch (error) {
      // Compatible avec le serveur précédent pendant la publication du correctif.
      const delay = connectionRequestRetryAfter(error)
      if (delay !== null) return wait(delay)
      throw error
    } finally {
      const latest = states.get(personId) ?? EMPTY
      if (latest.pendingHandle !== null) publish(personId, { ...latest, pendingHandle: null })
    }
  }, [mutation, networkId, personId, t])

  return {
    send,
    pendingHandle: state.pendingHandle,
    disabled: state.pendingHandle !== null || seconds > 0,
    waitLabel: seconds > 0 ? t("connectionRequest.wait", { count: seconds }) : null,
  }
}
