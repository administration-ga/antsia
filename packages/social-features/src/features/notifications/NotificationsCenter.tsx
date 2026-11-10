// Dupliqué de socle/packages/agent-features/src/features/notifications/NotificationsCenter.tsx @ ad2e7fdc2 — adaptations : RÉÉCRIT pour l'onglet Réseau SEUL — onglet « Administration » retiré avec sa liste, sa table centrale (`notificationCenter.*`), le mode du chrome (`useOptionalOrg`), les routes de poste (`useNotificationRoutes`) et la carte iCom de poste (`useIcomPosteHosted`) ; plus de barre d'onglets ni d'onglet figé (une seule source n'a rien à choisir) : la liste du réseau sans son en-tête, et « Tout marquer lu » sur la cloche du moteur (`notifications.bell.{unreadCount, markAllRead}`, réseau courant de `useNetwork()`) ; refus dit par son code (`readFailureText`) ; libellé traduit (espace `notifications`, clé `notificationsCenter.markAllRead`).
"use client"

/**
 * NotificationsCenter — le CONTENU de la carte sous la cloche : la liste des
 * notifications du réseau, et un « Tout marquer lu ».
 *
 * Une seule source, la cloche sociale du réseau (`notifications.bell`) : la
 * carte n'a donc ni onglets ni choix à figer. Elle monte la liste SANS son
 * en-tête — le titre « Notifications » est celui de la carte — et porte
 * elle-même le « Tout marquer lu », proposé seulement quand il y a du neuf.
 */

import { api } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import { Button } from "@antsia/ui"
import { useMutation } from "convex/react"
import { useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { COMPACT_SOCIAL_ACTION_STYLE } from "../social-action-style"
import { toast } from "sonner"
import { NotificationsList } from "./NotificationsList"
import { readFailureText } from "./notification-center-tabs"
import type { NotificationTargets } from "./notification-targets"

export interface NotificationsCenterProps {
	/** L'instant de référence des dates relatives (rafraîchi à chaque ouverture). */
	now: number
	/** Ce que l'hôte sait ouvrir sur place (rappels facultatifs). */
	targets: NotificationTargets
	/** Destination « Tout voir » — absente, aucun lien. */
	fullHref?: string
}

export function NotificationsCenter({
	now,
	targets,
	fullHref,
}: NotificationsCenterProps) {
	const { t } = useTranslation("notifications")
	const { networkId } = useNetwork()
	const unread = useAuthenticatedConvexQuery(
		api.modules.notifications.bell.unreadCount,
		{ networkId },
	)
	const markAllRead = useMutation(api.modules.notifications.bell.markAllRead)

	const hasUnread = (unread.data?.count ?? 0) > 0
	const marking = useRef(false)
	const [markingRead, setMarkingRead] = useState(false)

	// Son échec se DIT : sinon la pastille resterait allumée sans raison
	// apparente.
	const markEverythingRead = async () => {
		if (marking.current) return
		marking.current = true
		setMarkingRead(true)
		try {
			await markAllRead({ networkId })
		} catch (error: unknown) {
			toast.error(readFailureText(error, t))
		} finally {
			marking.current = false
			setMarkingRead(false)
		}
	}

	return (
		<>
			{hasUnread ? (
				<div
					style={{
						display: "flex",
						justifyContent: "flex-end",
						marginBottom: 12,
					}}
				>
					<Button variant="link" size="sm" disabled={markingRead} aria-busy={markingRead} style={COMPACT_SOCIAL_ACTION_STYLE} onClick={() => void markEverythingRead()}>
						{t("notificationsCenter.markAllRead")}
					</Button>
				</div>
			) : null}
			<NotificationsList
				now={now}
				targets={targets}
				fullHref={fullHref}
				hideHeader
			/>
		</>
	)
}
