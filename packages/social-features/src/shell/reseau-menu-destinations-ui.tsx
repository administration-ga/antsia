// Écrit pour le moteur (lot P02 de l'étude social-commerce du 18/10/2026, sans équivalent au socle) : ce que la barre du téléphone et le rail du bureau partagent pour rendre les destinations — la capacité déclarée par l'application, les icônes et le clic « ordinaire ».
"use client"

/**
 * reseau-menu-destinations-ui — la face REACT des destinations.
 *
 * Ce qui DÉCIDE vit dans `reseau-menu-destinations.ts` (module pur, testé en
 * `node`) ; ici, seulement ce qu'il faut à un composant pour le lire : la
 * capacité déclarée par l'application, une seule famille d'icônes pour les
 * deux formats, et le test du clic qui peut être intercepté sans voler au
 * navigateur l'ouverture dans un nouvel onglet.
 */

import { api } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork, useRoutes } from "@antsia/api/network"
import { CircleUserRound, Compass, House, MessageCircle, SquarePlay, SquarePlus, type LucideIcon } from "lucide-react"
import type { MouseEvent } from "react"

import {
	destinationRoutesOf,
	messagesUnreadTotal,
	type ReseauDestinationId,
	type ReseauDestinationRoutes,
} from "./reseau-menu-destinations"

/** Une icône par destination — la même au téléphone et au bureau. */
export const RESEAU_DESTINATION_ICONS: Readonly<Record<ReseauDestinationId, LucideIcon>> = Object.freeze({
	fil: House,
	decouvrir: Compass,
	creer: SquarePlus,
	messages: MessageCircle,
	profil: CircleUserRound,
	clips: SquarePlay,
})

/**
 * Les adresses des destinations quand l'APPLICATION a choisi cette navigation
 * (`NetworkProvider navigation="destinations"`) — `null` sinon : la coque rend
 * alors sa navigation historique, à l'identique.
 */
export function useReseauDestinationRoutes(): ReseauDestinationRoutes | null {
	const { navigation, navigationLayout, navigationLabels } = useNetwork()
	const routes = useRoutes()
	const destinations = navigation === "destinations" ? destinationRoutesOf(routes) : null
	if (destinations !== null && navigationLayout === "adaptive" && routes.clips !== undefined && navigationLabels?.clips?.trim()) {
		return { ...destinations, clips: routes.clips, clipsLabel: navigationLabels.clips }
	}
	return destinations
}

/**
 * Les conversations non lues de la destination Messages — les DEUX décomptes
 * du serveur (tête-à-tête et groupes), les mêmes abonnements que la barre
 * d'iCom (le client Convex les partage), réunis par `messagesUnreadTotal`.
 */
export function useMessagesUnreadTotal(): number {
	const { networkId } = useNetwork()
	const directs = useAuthenticatedConvexQuery(api.modules.messaging.inbox.totalUnread, { networkId })
	const groupes = useAuthenticatedConvexQuery(api.modules.groups.threads.totalUnread, { networkId })
	return messagesUnreadTotal(directs.data, groupes.data)
}

/**
 * Un clic « ordinaire » — bouton principal, sans touche de modification.
 * Seul celui-là peut être remplacé par un geste de la page ; les autres
 * (nouvel onglet, nouvelle fenêtre) restent au navigateur.
 */
export function isPlainLeftClick(event: MouseEvent<HTMLElement>): boolean {
	return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
}
