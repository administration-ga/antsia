"use client"

/**
 * useFeedMode — le mode d'affichage du fil pour CETTE pose et CE réseau (lot
 * P04). Rend `null` quand l'application n'a pas déclaré le fil immersif
 * (`NetworkProvider feedPresentation`) : la liste historique, sans commande.
 *
 * Le choix vit dans `localStorage`, sous le préfixe du réseau
 * (`feedModeStorageKey(storagePrefix)`) : la porte de déconnexion
 * (`signOutEverywhere`) le purge avec tout l'état personnel du moteur. Une
 * mémoire de module double le stockage : un navigateur qui refuse l'écriture
 * (navigation privée, quota) garde le choix pour l'onglet, sans erreur.
 */

import { useNetwork } from "@antsia/api/network"
import { useIsReseauMobile } from "@antsia/ui/overlay"
import { useReducedMotion } from "motion/react"
import { useCallback, useSyncExternalStore } from "react"

import {
  feedModeStorageKey,
  parseStoredFeedModes,
  resolveFeedMode,
  serializeStoredFeedModes,
  withStoredFeedMode,
  type FeedMode,
  type FeedModeResolution,
  type FeedPose,
  type StoredFeedModes,
} from "./feed-mode"

export interface FeedModeState extends FeedModeResolution {
  pose: FeedPose
  /** La largeur est-elle connue ? Tant qu'elle ne l'est pas, la liste s'affiche. */
  known: boolean
  setMode: (mode: FeedMode) => void
}

const memory = new Map<string, StoredFeedModes>()
const listeners = new Set<() => void>()

function readStoredModes(key: string): StoredFeedModes {
  const remembered = memory.get(key)
  if (remembered !== undefined) return remembered
  let raw: string | null = null
  try {
    raw = typeof window === "undefined" ? null : window.localStorage.getItem(key)
  } catch {
    raw = null
  }
  const value = parseStoredFeedModes(raw)
  memory.set(key, value)
  return value
}

function writeStoredModes(key: string, value: StoredFeedModes): void {
  memory.set(key, value)
  try {
    window.localStorage.setItem(key, serializeStoredFeedModes(value))
  } catch {
    // Stockage refusé : le choix tient pour l'onglet (mémoire de module).
  }
  for (const listener of listeners) listener()
}

function subscribeStoredModes(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const EMPTY: StoredFeedModes = Object.freeze({})

function subscribeViewport(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {}
  window.addEventListener("resize", listener)
  window.addEventListener("orientationchange", listener)
  return () => {
    window.removeEventListener("resize", listener)
    window.removeEventListener("orientationchange", listener)
  }
}

function viewportHeight(): number | null {
  return typeof window === "undefined" ? null : window.innerHeight
}

/** Remise à zéro de la mémoire de module — RÉSERVÉE AUX TESTS. */
export function __resetFeedModeMemoryForTests(): void {
  memory.clear()
}

export function useFeedMode(options: { surface?: "clips"; phoneDefault?: FeedMode } = {}): FeedModeState | null {
  const { storagePrefix, feedPresentation, postPresentation } = useNetwork()
  const mobile = useIsReseauMobile()
  const reducedMotion = useReducedMotion() === true
  // Clips garde son choix sans changer le mode du fil. La clé reste sous le
  // préfixe personnel déjà effacé à la déconnexion.
  const key = feedModeStorageKey(`${storagePrefix}${options.surface ? `${options.surface}:` : ""}`)
  const stored = useSyncExternalStore(subscribeStoredModes, () => readStoredModes(key), () => EMPTY)
  const height = useSyncExternalStore(subscribeViewport, viewportHeight, () => null)
  const pose: FeedPose = mobile === false ? "desktop" : "phone"

  const setMode = useCallback(
    (mode: FeedMode) => {
      writeStoredModes(key, withStoredFeedMode(readStoredModes(key), pose, mode))
    },
    [key, pose],
  )

  if (feedPresentation !== "immersive") return null
  // L'écran des chartes (ADR-0028) ouvre le fil du téléphone en liste.
  const phoneDefault: FeedMode = options.phoneDefault ?? (postPresentation === "charte" ? "list" : "immersive")
  const resolution = resolveFeedMode({ pose, stored, reducedMotion, viewportHeight: height, phoneDefault })
  if (mobile === null) {
    // Largeur inconnue : aucun arbre immersif monté « en attendant ».
    return { ...resolution, effective: "list", fallback: null, pose, known: false, setMode }
  }
  return { ...resolution, pose, known: true, setMode }
}
