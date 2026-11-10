// Dupliqué de socle/packages/agent-features/src/features/notifications/NotificationsList.tsx @ ad2e7fdc2 — adaptations : cloche sociale du moteur (`notifications.bell.{paginateNotifications, unreadCount, markRead, markAllRead}`, réseau courant de `useNetwork()`) ; décompte à LACUNE (`{ count, capped }`) dit par `tabBadge` / `unreadLabel` de `notification-center-tabs` au lieu de `formatUnreadBadge` (qui écrit « 99+ » dès 99) ; lignes typées par l'API (plus de conversion d'identifiants) ; refus d'un marquage dit par son code (`readFailureText`) ; libellés traduits (espace `notifications`, clés `notificationsList.…`) ; commentaires sans l'onglet « Administration », iRéseau ni le volet « Activité » de l'espace agent ; couleurs par fonction (ADR-0027) : pastille de décompte de l'en-tête aux couleurs des réactions (`--role-react-*`), ton `primary` d'origine en repli.
"use client"

/**
 * NotificationsList — LA liste des notifications de la cloche sociale du
 * réseau, une fois pour toutes les surfaces qui la montrent : la carte
 * flottante sous la cloche (en-tête de la coque, en-tête mobile) et toute page
 * qui la monte (le rail du fil en version compacte). Il n'y a PAS deux bases
 * de notifications sociales, et il n'y en aura pas.
 *
 * Dans la carte, la liste est montée sans son en-tête (`hideHeader`) : la
 * carte porte le sien. Les lignes vivent dans `ReseauNotificationRow` : la
 * ligne, et la décision sur place d'une invitation de relation (relue AVANT
 * la réponse).
 *
 * Elle ne montre JAMAIS le contenu du sujet : le serveur ne le lui donne pas
 * (le DTO ne porte que le genre, l'acteur et une référence). Le contenu se
 * relit avec sa garde à l'ouverture — une notification n'est pas un canal de
 * lecture dérobé.
 */

import { api } from "@antsia/api/engine"
import type { Id } from "@antsia/api/engine"
import {
	useAuthenticatedConvexQuery,
	useAuthenticatedPaginatedQuery,
} from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import { Link } from "@antsia/api/routing"
import { Badge, Button } from "@antsia/ui"
import { useMutation } from "convex/react"
import { useState, type CSSProperties } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { COMPACT_SOCIAL_ACTION_STYLE } from "../social-action-style"
import { closeNotificationCenter } from "./notification-center-store"
import { NOTIFICATIONS_STYLES_CSS } from "./notifications-styles"
import { ReseauPaginatedErrorBoundary } from "../../shell/ReseauPaginatedErrorBoundary"
import {
	readFailureText,
	tabBadge,
	unreadLabel,
} from "./notification-center-tabs"
import type { NotificationTargets } from "./notification-targets"
import {
	type NotificationListItem,
	NotificationRow,
} from "./ReseauNotificationRow"

export type { NotificationListItem } from "./ReseauNotificationRow"

export const NOTIFICATIONS_PAGE_SIZE = 20

/**
 * La pastille de décompte de l'en-tête : aplat des réactions dans les thèmes
 * qui le déclarent (ADR-0027, comme le rail et la cloche) ; ailleurs, le ton
 * `primary` d'origine du badge.
 */
const COUNT_BADGE_STYLE: CSSProperties = {
	background: "var(--role-react-fill, var(--primary-50))",
	color: "var(--role-react-on, var(--primary-600))",
	borderRadius: 999,
}

export interface NotificationsListProps {
	now: number
	/** Ce que l'hôte sait ouvrir sur place (rappels facultatifs). */
	targets: NotificationTargets
	/** Le rail du fil reprend la version compacte de la maquette. */
	compact?: boolean
	pageSize?: number
	/** Destination « Tout voir » — absente, aucun lien n'est rendu. */
	fullHref?: string
	/**
	 * Sans en-tête propre — ni titre « Activité », ni pastille, ni « Tout
	 * marquer lu » : l'hôte porte les siens (la carte sous la cloche).
	 */
	hideHeader?: boolean
}

export function NotificationsList(props: NotificationsListProps) {
	const { t } = useTranslation("notifications")
	return (
		<ReseauPaginatedErrorBoundary
			resetKey="notifications"
			title={t("notificationsList.errorTitle")}
			message={t("notificationsList.errorMessage")}
		>
			<NotificationsListContent {...props} />
		</ReseauPaginatedErrorBoundary>
	)
}

function NotificationsListContent({
	now,
	targets,
	compact = false,
	pageSize = NOTIFICATIONS_PAGE_SIZE,
	fullHref,
	hideHeader = false,
}: NotificationsListProps) {
	const { t } = useTranslation("notifications")
	const { networkId } = useNetwork()
	const notifications = useAuthenticatedPaginatedQuery(
		api.modules.notifications.bell.paginateNotifications,
		{ networkId },
		{ initialNumItems: pageSize },
	)
	const unread = useAuthenticatedConvexQuery(
		api.modules.notifications.bell.unreadCount,
		{ networkId },
	)
	const markRead = useMutation(api.modules.notifications.bell.markRead)
	const markAllRead = useMutation(api.modules.notifications.bell.markAllRead)

	const items: NotificationListItem[] = notifications.results
	const [filter, setFilter] = useState<"all" | "unread">("all")
	const visibleItems = compact ? items.slice(0, 2) : filter === "unread" ? items.filter((item) => item.readAt === null) : items
	// Group only the loaded DTOs. A filtered empty page never claims that
	// older pages contain no unread notification.
	const recentCutoff = now - 24 * 60 * 60 * 1000
	const sections = compact ? [{ key: "compact", items: visibleItems }] : [
		{ key: "new", items: visibleItems.filter((item) => item.createdAt >= recentCutoff) },
		{ key: "earlier", items: visibleItems.filter((item) => item.createdAt < recentCutoff) },
	]
	const unreadCount = unread.data?.count
	const capped = unread.data?.capped ?? false
	const badge = tabBadge(unreadCount, capped)
	const badgeLabel = unreadLabel(unreadCount, capped, t)

	// Marquer lu est idempotent côté serveur : un échec ne doit pas empêcher
	// l'ouverture du sujet, qui reste le geste principal.
	const read = (notificationId: Id<"notifications">) => {
		void markRead({ networkId, notificationId }).catch(() => {})
	}
	// Le bouton « Marquer lu », lui, n'accompagne rien : le marquage EST le
	// geste. Son échec se DIT — sinon la ligne resterait non lue sans raison
	// apparente.
	const readExplicitly = (notificationId: Id<"notifications">) => {
		void markRead({ networkId, notificationId }).catch((error: unknown) =>
			toast.error(readFailureText(error, t)),
		)
	}

	return (
		<>
			<style href="antsia-notifications" precedence="default">{NOTIFICATIONS_STYLES_CSS}</style>
			{hideHeader ? null : (
				<header
					style={{
						display: "flex",
						alignItems: "center",
						gap: 8,
						marginBottom: compact ? 10 : 12,
					}}
				>
					<h2
						style={{
							margin: 0,
							fontSize: compact ? 10.5 : 15,
							fontWeight: 700,
							letterSpacing: compact ? "0.09em" : "normal",
							textTransform: compact ? "uppercase" : "none",
							color: compact ? "var(--ink-500)" : "var(--ink-900)",
						}}
					>
						{t("notificationsList.heading")}
					</h2>
					{!compact && badge ? (
						<Badge tone="primary" size="sm" style={COUNT_BADGE_STYLE}>
							<span aria-label={badgeLabel ?? undefined}>{badge}</span>
						</Badge>
					) : null}
					{!compact && (unreadCount ?? 0) > 0 ? (
						<Button
							variant="link"
							size="sm"
							style={{ ...COMPACT_SOCIAL_ACTION_STYLE, marginLeft: "auto" }}
							onClick={() =>
								void markAllRead({ networkId }).catch((error: unknown) =>
									toast.error(readFailureText(error, t)),
								)
							}
						>
							{t("notificationsList.markAllRead")}
						</Button>
					) : null}
				</header>
			)}

			{!compact ? <>
				<div className="ntf-filters" role="group" aria-label={t("notificationsList.filters")}>
					<button type="button" className="ntf-filter" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>{t("notificationsList.all")}</button>
					<button type="button" className="ntf-filter" aria-pressed={filter === "unread"} onClick={() => setFilter("unread")}>{t("notificationsList.unread")}</button>
				</div>
				{filter === "unread" ? <p className="ntf-scope">{t("notificationsList.filterScope")}</p> : null}
			</> : null}
			{notifications.isLoading && items.length === 0 ? (
				<p role="status" style={{ margin: 0, fontSize: 13, color: "var(--ink-600)" }}>{t("notificationsList.loading")}</p>
			) : visibleItems.length === 0 ? (
				<p role="status" style={{ margin: 0, fontSize: 13, color: "var(--ink-600)" }}>{t(filter === "unread" && !compact ? "notificationsList.emptyUnread" : "notificationsList.empty")}</p>
			) : (
				<div className="ntf-list">
					{sections.filter((section) => section.items.length > 0).map((section) => (
						<section className="ntf-list-section" key={section.key} aria-label={compact ? undefined : t(`notificationsList.groups.${section.key}`)}>
							{compact ? null : <h3>{t(`notificationsList.groups.${section.key}`)}</h3>}
							<ul>{section.items.map((item) => <NotificationRow key={item.notificationId} item={item} now={now} compact={compact} targets={targets} onMarkRead={read} onMarkReadExplicitly={readExplicitly} />)}</ul>
						</section>
					))}
				</div>
			) }

			{!compact && notifications.status === "CanLoadMore" ? (
				<div style={{ marginTop: 12 }}>
					<Button
						variant="secondary"
						size="sm"
						style={COMPACT_SOCIAL_ACTION_STYLE}
						onClick={() => notifications.loadMore(pageSize)}
					>
						{t("notificationsList.loadMore")}
					</Button>
				</div>
			) : null}
			{!compact && notifications.status === "LoadingMore" ? (
				<p
					style={{ margin: "12px 0 0", fontSize: 13, color: "var(--ink-600)" }}
				>
					{t("notificationsList.loadingMore")}
				</p>
			) : null}
			{!compact && fullHref ? (
				<p style={{ margin: "12px 0 0" }}>
					<Link
						href={fullHref}
						onClick={closeNotificationCenter}
						style={{ fontSize: 13, color: "var(--primary-700)" }}
					>
						{t("notificationsList.seeAll")}
					</Link>
				</p>
			) : null}
		</>
	)
}
