"use client"

/**
 * useCoordinatedVideo — branche UNE vidéo de publication sur le coordinateur
 * de lecture de la session (lot P04).
 *
 * Sans coordinateur monté (`MediaPlaybackProvider` absent : DIASPORA.GA, carte
 * publique), le hook rend `null` et ne fait rien : la vidéo garde son rendu et
 * son comportement P03 à l'identique (commandes natives, métadonnées).
 *
 * Avec lui :
 *  · la vidéo est déclarée avec son rôle (`useMediaRole`, posé par le créneau
 *    du lecteur immersif ; `unmanaged` ailleurs) ;
 *  · sa visibilité est mesurée par un `IntersectionObserver` au seuil du
 *    coordinateur (70 % par défaut) ;
 *  · le préchargement est calculé AU RENDU depuis le rôle courant et
 *    l'environnement — le premier rendu d'une vidéo lointaine ne demande donc
 *    jamais ses métadonnées, même avant la déclaration.
 *
 * `primary` : la vidéo de la publication elle-même. Celle d'une publication
 * CITÉE dans un partage ne prend jamais le rôle actif — une seule lecture
 * automatique par créneau.
 */

import { useCallback, useEffect, useId, useRef, useSyncExternalStore, type RefObject } from "react"

import { IDLE_PLAYBACK_SNAPSHOT, type MediaPlaybackSnapshot } from "./media-playback-coordinator"
import type { MediaPreload, MediaRole, PlaybackEnvironment } from "./media-playback-policy"
import { useOptionalMediaPlayback } from "./media-playback-context"
import { useMediaRole } from "./media-role-context"

export interface CoordinatedVideo {
  snapshot: MediaPlaybackSnapshot
  preload: MediaPreload
  /** « Lire » — geste de la personne. */
  requestPlay: () => void
  /** « Son » — geste de la personne. */
  toggleSound: () => void
}

const noopSubscribe = () => () => {}
const NO_ENVIRONMENT: PlaybackEnvironment | null = null

/** Le rôle effectif d'une vidéo : une vidéo citée ne joue jamais d'elle-même. */
export function effectiveVideoRole(slotRole: MediaRole, primary: boolean): MediaRole {
  return slotRole === "active" && !primary ? "neighbor" : slotRole
}

export function useCoordinatedVideo(
  ref: RefObject<HTMLVideoElement | null>,
  options: { enabled: boolean; primary: boolean },
): CoordinatedVideo | null {
  const coordinator = useOptionalMediaPlayback()
  const role = effectiveVideoRole(useMediaRole(), options.primary)
  const id = useId()
  const roleRef = useRef(role)
  roleRef.current = role

  useEffect(() => {
    const element = ref.current
    if (coordinator === null || !options.enabled || element === null) return
    return coordinator.register(id, element, roleRef.current)
  }, [coordinator, options.enabled, id, ref])

  useEffect(() => {
    coordinator?.setRole(id, role)
  }, [coordinator, id, role])

  useEffect(() => {
    const element = ref.current
    if (coordinator === null || !options.enabled || element === null || typeof IntersectionObserver === "undefined") return
    const observer = new IntersectionObserver(
      (records) => {
        for (const record of records) coordinator.setVisibility(id, record.isIntersecting ? record.intersectionRatio : 0)
      },
      { threshold: [0, coordinator.threshold, 1] },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [coordinator, options.enabled, id, ref])

  const subscribe = useCallback((listener: () => void) => (coordinator === null ? () => {} : coordinator.subscribe(id, listener)), [coordinator, id])
  const snapshot = useSyncExternalStore(
    subscribe,
    () => (coordinator === null ? IDLE_PLAYBACK_SNAPSHOT : coordinator.getSnapshot(id)),
    () => IDLE_PLAYBACK_SNAPSHOT,
  )
  // L'environnement (économie de données) décide aussi du préchargement.
  const environment = useSyncExternalStore(
    coordinator === null ? noopSubscribe : coordinator.subscribeEnvironment,
    () => (coordinator === null ? NO_ENVIRONMENT : coordinator.getEnvironment()),
    () => NO_ENVIRONMENT,
  )

  const requestPlay = useCallback(() => coordinator?.requestPlay(id), [coordinator, id])
  const toggleSound = useCallback(() => coordinator?.toggleSound(id), [coordinator, id])

  if (coordinator === null || environment === null) return null
  return { snapshot, preload: coordinator.preloadFor(role), requestPlay, toggleSound }
}
