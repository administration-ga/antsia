"use client"

/**
 * direct-reception-store — MON choix de réception d'un direct (DL-04) et la
 * suggestion « Écouter seulement », hors de l'arbre React.
 *
 * Le choix est lu par TROIS montages qui ne se voient pas : le contrôleur
 * d'abonnement de la salle (`DirectRoomMount`, toujours monté), le studio et
 * la carte flottante. Un état de module + `useSyncExternalStore`, comme
 * `direct-session-store.ts` et le mode du fil (`use-feed-mode.ts`).
 *
 * Préférence : `localStorage`, sous le préfixe du réseau
 * (`directReceptionStorageKey(storagePrefix)`), purgée par la porte de
 * déconnexion avec l'état personnel du moteur. Une mémoire de module double
 * le stockage : navigation privée, stockage refusé ou plein, la page marche
 * et le choix tient pour l'onglet — il n'est simplement pas retenu.
 *
 * Suggestion : proposée UNE fois par direct (par onglet), jamais imposée.
 * Une fois proposée, elle reste jusqu'à ce que la personne la referme ou
 * l'accepte ; elle ne revient pas pour ce direct, même si la connexion
 * faiblit de nouveau.
 */

import { useNetwork } from "@antsia/api/network"
import { useCallback, useSyncExternalStore } from "react"

import {
  DIRECT_RECEPTION_DEFAULT,
  directReceptionStorageKey,
  parseStoredDirectReception,
  serializeDirectReception,
  type DirectReceptionMode,
  type DirectReceptionPreference,
  type DirectReceptionQuality,
} from "../features/direct/direct-reception"

const memory = new Map<string, DirectReceptionPreference>()
const listeners = new Set<() => void>()
/** Le direct pour lequel la suggestion est affichée, ou `null`. */
let offeredSessionId: string | null = null
/** Les directs pour lesquels elle a déjà été proposée : jamais deux fois. */
const proposedSessionIds = new Set<string>()

function notify(): void {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function readPreference(key: string): DirectReceptionPreference {
  const remembered = memory.get(key)
  if (remembered !== undefined) return remembered
  // Rendu serveur : le défaut, sans rien retenir dans une mémoire partagée.
  if (typeof window === "undefined") return DIRECT_RECEPTION_DEFAULT
  let raw: string | null = null
  try {
    raw = window.localStorage.getItem(key)
  } catch {
    raw = null
  }
  const value = parseStoredDirectReception(raw)
  memory.set(key, value)
  return value
}

function writePreference(key: string, value: DirectReceptionPreference): void {
  memory.set(key, value)
  try {
    window.localStorage.setItem(key, serializeDirectReception(value))
  } catch {
    // Stockage refusé : le choix tient pour l'onglet (mémoire de module).
  }
  notify()
}

export const directReceptionStore = {
  getPreference(storagePrefix: string): DirectReceptionPreference {
    return readPreference(directReceptionStorageKey(storagePrefix))
  },

  /** Correctif de préférence — les champs absents ne bougent pas. */
  setPreference(storagePrefix: string, patch: Partial<DirectReceptionPreference>): void {
    const key = directReceptionStorageKey(storagePrefix)
    const current = readPreference(key)
    const next = Object.freeze({ mode: patch.mode ?? current.mode, quality: patch.quality ?? current.quality })
    if (next.mode === current.mode && next.quality === current.quality) return
    writePreference(key, next)
  },

  /** Propose « Écouter seulement » pour ce direct — sans effet s'il l'a déjà été. */
  offerHint(sessionId: string): void {
    if (proposedSessionIds.has(sessionId)) return
    proposedSessionIds.add(sessionId)
    offeredSessionId = sessionId
    notify()
  },

  /** Referme la suggestion (refusée ou acceptée) ; elle ne reviendra pas pour ce direct. */
  closeHint(sessionId: string): void {
    if (offeredSessionId !== sessionId) return
    offeredSessionId = null
    notify()
  },

  isHintOffered(sessionId: string | null): boolean {
    return sessionId !== null && offeredSessionId === sessionId
  },

  __resetForTests(): void {
    memory.clear()
    offeredSessionId = null
    proposedSessionIds.clear()
    notify()
  },
}

const serverPreference = (): DirectReceptionPreference => DIRECT_RECEPTION_DEFAULT

/** Ma préférence de réception dans le réseau courant, et ses deux commandes. */
export function useDirectReception(): {
  preference: DirectReceptionPreference
  setMode: (mode: DirectReceptionMode) => void
  setQuality: (quality: DirectReceptionQuality) => void
} {
  const { storagePrefix } = useNetwork()
  const getSnapshot = useCallback(() => directReceptionStore.getPreference(storagePrefix), [storagePrefix])
  const preference = useSyncExternalStore(subscribe, getSnapshot, serverPreference)
  const setMode = useCallback((mode: DirectReceptionMode) => directReceptionStore.setPreference(storagePrefix, { mode }), [storagePrefix])
  const setQuality = useCallback((quality: DirectReceptionQuality) => directReceptionStore.setPreference(storagePrefix, { quality }), [storagePrefix])
  return { preference, setMode, setQuality }
}

/** La suggestion « Écouter seulement » est-elle affichée pour ce direct ? */
export function useDirectReceptionHint(sessionId: string | null): boolean {
  const getSnapshot = useCallback(() => directReceptionStore.isHintOffered(sessionId), [sessionId])
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
