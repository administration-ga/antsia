"use client"

/**
 * MediaPlaybackProvider — le coordinateur de lecture d'UNE session de membre
 * (lot P04 de l'étude social-commerce du 18/10/2026).
 *
 * Monté par l'APPLICATION qui le choisit (ANTSIA, `network-shell.tsx`), sous
 * `NetworkProvider`, autour de ses pages de membre : toutes les vidéos de
 * publication qui s'y rendent (`PostMedia`, présentation « media ») se
 * déclarent au même coordinateur — au plus une joue. Sans ce fournisseur
 * (DIASPORA.GA, carte publique servie sans compte), les vidéos gardent
 * exactement leur comportement P03 : aucun changement de leur côté.
 *
 * Le pont d'environnement (`PlaybackEnvironmentBridge`) lit, sans rien écrire :
 *  · l'état d'appel EXISTANT de la couche d'appel — les slots du magasin
 *    d'appel (`useCallStore` : appel en établissement, actif ou en attente),
 *    sa fenêtre d'appel sortant qui sonne encore, et ce qui sonne (`calls.ringing.listRinging`, la même requête et les mêmes
 *    arguments que l'hôte d'appel : TanStack partage l'abonnement, aucune
 *    lecture de plus) ;
 *  · la visibilité de l'onglet, l'économie de données, l'indice de lecture
 *    automatique du navigateur.
 * Il est un composant à part, rendu `null` : le magasin d'appel bat à chaque
 * geste (micro, caméra, pilule), seul ce petit nœud se re-rend.
 */

import { api } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import { useEffect, useState, type ReactNode } from "react"

import { useCallStore } from "../../stores/call-store"
import { MediaPlaybackContext } from "./media-playback-context"
import { createMediaPlaybackCoordinator, type MediaPlaybackCoordinator } from "./media-playback-coordinator"
import {
  readAutoplayCapability,
  readDataSaver,
  readDocumentHidden,
  subscribeDataSaver,
  subscribeDocumentVisibility,
} from "./media-playback-environment"

export function MediaPlaybackProvider({ children, threshold }: { children: ReactNode; threshold?: number }) {
  // Un coordinateur par montage de la coque : il ne survit pas à la session
  // (la déconnexion recharge le document).
  const [coordinator] = useState(() => createMediaPlaybackCoordinator({ threshold }))
  return (
    <MediaPlaybackContext.Provider value={coordinator}>
      <PlaybackEnvironmentBridge coordinator={coordinator} />
      {children}
    </MediaPlaybackContext.Provider>
  )
}

/** Vrai tant qu'un appel occupe la ligne : en établissement, actif ou en attente. */
export function hasCallInProgress(slots: readonly { status: string }[]): boolean {
  return slots.some((slot) => slot.status !== "ended")
}

export function PlaybackEnvironmentBridge({ coordinator }: { coordinator: MediaPlaybackCoordinator }) {
  const { networkId } = useNetwork()
  const { slots, outgoingCallWindow } = useCallStore()
  // Lecture seule de ce qui sonne, mêmes arguments que `useIncomingCalls`.
  const ringing = useAuthenticatedConvexQuery(api.modules.calls.ringing.listRinging, { networkId })
  const ringingCount = ringing.data?.calls.length ?? 0
  // Un appel sortant qui sonne encore (sa fenêtre, avant tout slot) occupe aussi la ligne.
  const callInProgress = hasCallInProgress(slots) || outgoingCallWindow !== null || ringingCount > 0

  useEffect(() => {
    coordinator.setEnvironment({ callInProgress })
  }, [coordinator, callInProgress])

  useEffect(() => {
    const update = () => coordinator.setEnvironment({ documentHidden: readDocumentHidden() })
    update()
    return subscribeDocumentVisibility(update)
  }, [coordinator])

  useEffect(() => {
    const update = () => coordinator.setEnvironment({ dataSaver: readDataSaver() })
    update()
    return subscribeDataSaver(update)
  }, [coordinator])

  useEffect(() => {
    // Un indice seulement : « inconnu » ne remplace jamais un refus constaté.
    const hint = readAutoplayCapability()
    if (hint !== "unknown") coordinator.setAutoplayCapability(hint)
  }, [coordinator])

  return null
}
