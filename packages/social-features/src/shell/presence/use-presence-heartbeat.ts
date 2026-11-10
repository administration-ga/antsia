// Réécrit d'après socle/packages/agent-features/src/hooks/use-agent-presence.ts @ ad2e7fdc2 — présence par (réseau, personne) au lieu d'un battement par organisation (le hook du socle sortait sans rien faire quand la personne n'avait aucune organisation) ; plus d'appel en cours transmis : le serveur le lit sur les lignes de participation ; « hors ligne » à la fermeture de l'onglet et au démontage, DIFFÉRÉ et annulé par un remontage, et aucun battement redoublé à moins de vingt secondes (le seau `presence.heartbeat` du moteur est de huit par minute).
"use client"

import { api, type Id } from "@antsia/api/engine"
import { useNetwork } from "@antsia/api/network"
import { isSigningOutEverywhere } from "@antsia/api/sign-out-everywhere"
import { PRESENCE_HEARTBEAT_INTERVAL_MS } from "@antsia/social-contracts/calls"
import { useMutation } from "convex/react"
import { useEffect, useRef } from "react"

/** Écart minimal entre deux battements d'un même onglet (remontage, double montage de développement). */
export const PRESENCE_MIN_BEAT_GAP_MS = 20_000
/** Délai avant de dire « hors ligne » au démontage : un remontage immédiat l'annule. */
export const PRESENCE_OFFLINE_DELAY_MS = 1_500

/**
 * État d'ONGLET (module) : le dernier battement par réseau et le « hors ligne »
 * en attente. Il survit au démontage de la coque, ce qui évite de rejouer le
 * battement à chaque remontage (navigation, double montage de développement).
 */
const lastBeatAt = new Map<string, number>()
const pendingOffline = new Map<string, ReturnType<typeof setTimeout>>()

/** Faut-il battre maintenant ? Pur : l'horloge et le dernier battement sont passés. */
export function shouldBeat(now: number, last: number | undefined, minGapMs: number = PRESENCE_MIN_BEAT_GAP_MS): boolean {
  return last === undefined || now - last >= minGapMs
}

/**
 * Le BATTEMENT de présence de la personne dans le réseau courant : au montage
 * (sauf battement récent), puis toutes les 30 s ; « hors ligne » à la fermeture
 * de l'onglet, et au démontage après un court délai qu'un remontage annule.
 * Monté UNE fois par la coque, sous `NetworkProvider` : un appel du réseau ne
 * sonne que là où une application du réseau est ouverte.
 *
 * Les erreurs sont avalées : la présence est un confort (la pastille de mes
 * relations), jamais une condition — un battement perdu se rattrape au suivant,
 * et le nettoyage serveur éteint une présence qui ne bat plus.
 */
export function usePresenceHeartbeat(): void {
  const { networkId } = useNetwork()
  const heartbeat = useMutation(api.modules.calls.presence.heartbeat)
  const setOffline = useMutation(api.modules.calls.presence.setOffline)
  // Références miroir : l'intervalle et l'écouteur lisent toujours la dernière mutation
  // (mises à jour après le rendu, jamais pendant).
  const heartbeatRef = useRef(heartbeat)
  const setOfflineRef = useRef(setOffline)
  useEffect(() => {
    heartbeatRef.current = heartbeat
    setOfflineRef.current = setOffline
  })

  useEffect(() => {
    const key: Id<"networks"> = networkId
    const waiting = pendingOffline.get(key)
    if (waiting !== undefined) {
      clearTimeout(waiting)
      pendingOffline.delete(key)
    }
    const beat = () => {
      if (isSigningOutEverywhere()) return
      lastBeatAt.set(key, Date.now())
      heartbeatRef.current({ networkId: key }).catch(() => undefined)
    }
    const goOffline = () => {
      lastBeatAt.delete(key)
      // La sortie ferme la session ; le nettoyage local reste nécessaire.
      if (isSigningOutEverywhere()) return
      setOfflineRef.current({ networkId: key }).catch(() => undefined)
    }
    if (shouldBeat(Date.now(), lastBeatAt.get(key))) beat()
    const interval = setInterval(beat, PRESENCE_HEARTBEAT_INTERVAL_MS)
    window.addEventListener("beforeunload", goOffline)
    return () => {
      clearInterval(interval)
      window.removeEventListener("beforeunload", goOffline)
      pendingOffline.set(
        key,
        setTimeout(() => {
          pendingOffline.delete(key)
          goOffline()
        }, PRESENCE_OFFLINE_DELAY_MS),
      )
    }
  }, [networkId])
}
