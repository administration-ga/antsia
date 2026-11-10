// Dupliqué de socle/packages/agent-features/src/features/notifications/ReseauNotificationRow.tsx @ ad2e7fdc2 — adaptations : ligne = le DTO de la cloche du moteur (`notifications.bell.paginateNotifications`, type tiré de l'API : sujet `{ kind, id }`, acteur par mini-profil au nom NULLABLE, état vivant d'une invitation et d'un fichier retenu) au lieu de la forme à colonnes `subject…Id` ; phrase de TOUS les genres du moteur (`notificationRowSentence` : ceux de `shared.notificationSentence` et ceux que le moteur ajoute, nom neutre sans profil publié ; la page d'un `page_post` NOMMÉE avec son badge calculé) ; ligne de résultat par `notificationRowNote` (invitation tranchée, fichier libéré ou de nouveau analysé) ; cible composée sur les adresses injectées (`useRoutes()`) ; rappel de l'hôte par `targetCallback` (plus de cible « direct ») ; décision d'invitation sur `graph.connections.{pendingState, respondToConnection}` du réseau courant (`useNetwork()`), un refus qui ne dit rien de l'invitation (débit, adhésion) se dit par son code (`errors:<code>`) et garde les boutons ; libellés, dates relatives et refus traduits (espace `notifications`, clés `reseauNotificationRow.…`) ; commentaires sans l'onglet « Administration » ni le volet « Activité » de l'espace agent. ; PA6 : dates et jours civils dans le fuseau personnel du lecteur (repli appareil) ; couleurs par fonction (ADR-0027) : Accepter une relation en variante `social`.
"use client"

/**
 * ReseauNotificationRow — UNE ligne de la cloche sociale du réseau, et la
 * décision sur place d'une invitation de relation. La carte sous la cloche et
 * toute page qui monte la liste rendent la même ligne.
 *
 * Deux règles :
 *   · toute NAVIGATION depuis la ligne (lien, rappel de l'hôte) ferme d'abord
 *     la carte de notifications — `useModalA11y` inerte tout ce qui est sous
 *     une carte ouverte, la destination le serait aussi. Hors de la carte, la
 *     fermeture est sans effet ;
 *   · une invitation TRANCHÉE ailleurs mais restée NON LUE garde « Marquer
 *     lu » : sans lui, elle tiendrait la pastille allumée sans aucun geste
 *     pour l'éteindre, hors « Tout marquer lu ».
 *
 * Elle ne montre JAMAIS le contenu du sujet : le serveur ne le lui donne pas
 * (le DTO ne porte que le genre, l'acteur et une référence).
 */

import { COMPACT_SOCIAL_ACTION_STYLE } from "../social-action-style"
import { Avatar } from "../reseau-personnel/Avatar"
import { BadgeCheck, Bell, Calendar, Heart, Image, MessageCircle, Phone, ShieldCheck, ShoppingBag, UserPlus, Users, Video, type LucideIcon } from "lucide-react"
import { useViewerTimeZone } from "@antsia/api/viewer-preferences"
import { api } from "@antsia/api/engine"
import type { Id } from "@antsia/api/engine"
import { useNetwork, useRoutes } from "@antsia/api/network"
import { Link } from "@antsia/api/routing"
import { engineErrorCode } from "@antsia/social-contracts/errors"
import { Badge, Button } from "@antsia/ui"
import { useConvex, useMutation } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { useRef, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { pageBadgeView } from "../reseau-personnel/pages-panel"
import { formatRelativeDate } from "../reseau-personnel/shared"
import { closeNotificationCenter } from "./notification-center-store"
import {
	connectionInviteOutcome,
	notificationRowAction,
	notificationRowNote,
	notificationRowSentence,
	type NotificationTargets,
	targetCallback,
} from "./notification-targets"

/**
 * Une ligne telle que le moteur la rend — le type est TIRÉ de l'API : un champ
 * ajouté ou renommé côté serveur se voit ici à la compilation.
 */
export type NotificationListItem = FunctionReturnType<
	typeof api.modules.notifications.bell.paginateNotifications
>["page"][number]

export interface NotificationRowProps {
	item: NotificationListItem
	now: number
	compact: boolean
	targets: NotificationTargets
	/** Accompagne une ouverture ou une décision : silencieux en cas d'échec. */
	onMarkRead: (notificationId: Id<"notifications">) => void
	/** Le bouton « Marquer lu » : son échec se dit. */
	onMarkReadExplicitly: (notificationId: Id<"notifications">) => void
}

function NotificationPageBadge({ badge }: { badge: Parameters<typeof pageBadgeView>[0] }) {
	const { t } = useTranslation("notifications")
	const view = pageBadgeView(badge)
	return (
		<span style={{ display: "inline-flex", marginTop: 4 }}>
			<Badge tone={view.tone} size="sm" icon={view.icon}>
				{t(view.labelKey)}
			</Badge>
		</span>
	)
}

function notificationMarker(kind: string): { icon: LucideIcon; background: string; color: string } {
	if (kind === "post_reaction") return { icon: Heart, background: "var(--role-react-fill, var(--primary-fill))", color: "var(--role-react-on, var(--on-fill))" }
	if (kind.includes("comment") || kind.includes("mention") || kind.startsWith("contextual_")) return { icon: MessageCircle, background: "var(--role-message-fill, var(--primary-fill))", color: "var(--role-message-on, var(--on-fill))" }
	if (kind.startsWith("connection_") || kind === "new_follower" || kind.startsWith("sponsorship_")) return { icon: UserPlus, background: "var(--role-social-fill, var(--primary-fill))", color: "var(--role-social-on, var(--on-fill))" }
	if (kind.includes("group")) return { icon: Users, background: "var(--role-social-fill, var(--primary-fill))", color: "var(--role-social-on, var(--on-fill))" }
	if (kind.includes("event")) return { icon: Calendar, background: "var(--role-commerce-fill, var(--primary-fill))", color: "var(--role-commerce-on, var(--on-fill))" }
	if (kind.startsWith("live_")) return { icon: Video, background: "var(--primary-fill)", color: "var(--primary-fill-on, var(--on-fill))" }
	if (kind === "file_withheld" || kind === "moderation_decision" || kind === "attestation_not_confirmed") return { icon: ShieldCheck, background: "var(--role-danger-fill, var(--danger-fill))", color: "var(--role-danger-on, var(--on-fill))" }
	// SU01d : l'accusé de réception et la décision au déclarant informent, ils n'alertent pas.
	if (kind === "report_received" || kind === "report_decided") return { icon: ShieldCheck, background: "var(--primary-fill)", color: "var(--primary-fill-on, var(--on-fill))" }
	if (kind.startsWith("commerce_") || kind === "commercial_contact") return { icon: ShoppingBag, background: "var(--role-commerce-fill, var(--primary-fill))", color: "var(--role-commerce-on, var(--on-fill))" }
	if (kind === "call_missed" || kind === "voicemail_left") return { icon: Phone, background: "var(--role-message-fill, var(--primary-fill))", color: "var(--role-message-on, var(--on-fill))" }
	if (kind === "album_published" || kind === "page_post") return { icon: Image, background: "var(--primary-fill)", color: "var(--primary-fill-on, var(--on-fill))" }
	if (kind === "badge_changed" || kind === "attestation_verified") return { icon: BadgeCheck, background: "var(--role-success-fill, var(--success-fill))", color: "var(--role-success-on, var(--on-fill))" }
	return { icon: Bell, background: "var(--muted)", color: "var(--foreground)" }
}

export function NotificationRow({
	item,
	now,
	compact,
	targets,
	onMarkRead,
	onMarkReadExplicitly,
}: NotificationRowProps) {
	const { t } = useTranslation("notifications")
	const timeZone = useViewerTimeZone()
	const routes = useRoutes()
	const action = notificationRowAction(item, routes, targets, t)
	// Ce que l'invitation (ou le fichier retenu) est DEVENU. Une demande de
	// relation tranchée le porte dans son action ; les autres genres gardent
	// leur ouverture et disent le résultat EN PLUS.
	const resultText = notificationRowNote(item, action, t)

	const open = () => {
		// La carte se ferme AVANT de suivre la cible (idempotent : sans effet
		// hors de la carte, où aucune n'est ouverte).
		closeNotificationCenter()
		onMarkRead(item.notificationId)
		if (action.mode !== "callback") return
		targetCallback(action.kind, targets)?.(action.id)
	}

	// « Marquer lu » : rien d'autre à faire sur la ligne, et elle n'est pas
	// lue. Une invitation tranchée ailleurs en fait partie : le résultat se
	// dit, mais la ligne restait non lue sans aucun geste.
	const offersMarkRead =
		(action.mode === "none" || action.mode === "resolved") &&
		item.readAt === null

	const unread = item.readAt === null
	const sentence = notificationRowSentence(item, t)
	// A system notice must not turn a projected actor into its apparent
	// author. In particular, page posts keep the page voice, and moderation
	// notices never acquire a moderator portrait from an incidental actor.
	const systemVoice = ["page_post", "moderation_decision", "report_received", "report_decided", "membership_changed", "badge_changed", "file_withheld", "association_event_reminder", "attestation_verified", "attestation_not_confirmed"].includes(item.kind) || item.kind.startsWith("commerce_")
	const actorName = item.actor?.displayName?.trim() || ""
	const displayName = item.page?.name.trim() || (!systemVoice && actorName && sentence.includes(actorName) ? actorName : "")
	const nameAt = displayName.length > 0 ? sentence.indexOf(displayName) : -1
	const emphasizedSentence: ReactNode = nameAt < 0 ? sentence : <>
		{sentence.slice(0, nameAt)}<strong>{displayName}</strong>{sentence.slice(nameAt + displayName.length)}
	</>
	const marker = notificationMarker(item.kind)
	const Marker = marker.icon
	const content = <>
		<span className="ntf-avatar" aria-hidden="true">
			<Avatar displayName={displayName} avatarUrl={item.page ? item.page.logoUrl : displayName ? item.actor?.avatarUrl : null} hasIdentity={displayName.length > 0} size={compact ? 40 : 48} shape={item.page ? "square" : "round"} />
			<span className="ntf-kind" style={{ background: marker.background, color: marker.color }}><Marker size={12} strokeWidth={2.5} /></span>
		</span>
		<span className="ntf-details">
			<span className="ntf-sentence">{emphasizedSentence}</span>
			{item.page ? <NotificationPageBadge badge={item.page.badge} /> : null}
			<span className="ntf-date">
				<time dateTime={new Date(item.createdAt).toISOString()}>{formatRelativeDate(item.createdAt, now, t, timeZone)}</time>
				{unread ? <span className="ntf-sr-only">{t("reseauNotificationRow.unread")}</span> : null}
			</span>
			{resultText !== null ? <span className="ntf-result">{resultText}</span> : null}
		</span>
	</>

	return (
		<li className="ntf-row" data-unread={unread ? "" : undefined} data-compact={compact ? "" : undefined}>
			{!compact && action.mode === "link" ? (
				<Link href={action.href} aria-label={action.label} className="ntf-open" onClick={open}>{content}</Link>
			) : !compact && action.mode === "callback" ? (
				<button type="button" aria-label={action.label} className="ntf-open" onClick={open}>{content}</button>
			) : <div className="ntf-open">{content}</div>}
			{unread ? <span className="ntf-unread-dot" aria-hidden="true" /> : null}
			{!compact && action.mode === "connection" ? (
				<div className="ntf-row-actions"><ConnectionInviteActions connectionId={action.connectionId} onSettled={() => onMarkRead(item.notificationId)} /></div>
			) : !compact && offersMarkRead ? (
				<div className="ntf-row-actions"><Button variant="link" size="sm" style={COMPACT_SOCIAL_ACTION_STYLE} onClick={() => onMarkReadExplicitly(item.notificationId)}>{t("reseauNotificationRow.markRead")}</Button></div>
			) : null}
		</li>
	)
}

/**
 * Accepter ou refuser une invitation de relation, APRÈS relecture.
 *
 * L'ordre est le contrat : `pendingState` → `respondToConnection`. Sans la
 * première lecture, un second client ayant déjà accepté ferait échouer la
 * mutation (`conflict`) — la ligne dirait « ça n'a pas marché » là où elle doit
 * dire « déjà traitée ».
 *
 * Une réponse ENREGISTRÉE n'est suivie d'aucun `markRead` : la transaction qui
 * tranche résout aussi la notification et la marque lue. Le marquage ne sert
 * plus que là où rien n'a été décidé ici — invitation déjà traitée, annulée,
 * ou réponse refusée par le serveur.
 */
export function ConnectionInviteActions({
	connectionId,
	onSettled,
}: {
	connectionId: string
	onSettled: () => void
}) {
	const { t } = useTranslation("notifications")
	const { networkId } = useNetwork()
	const convex = useConvex()
	const respond = useMutation(api.modules.graph.connections.respondToConnection)
	const [busy, setBusy] = useState(false)
	const deciding = useRef(false)
	const [notice, setNotice] = useState<string | null>(null)

	const decide = async (accept: boolean) => {
		if (deciding.current) return
		deciding.current = true
		setBusy(true)
		// Le sujet générique du moteur porte l'identifiant en chaîne ; le
		// serveur le revalide (`v.id("connections")`) et refuse une référence
		// inventée.
		const id = connectionId as Id<"connections">
		try {
			const state = await convex.query(
				api.modules.graph.connections.pendingState,
				{ networkId, connectionId: id },
			)
			const outcome = connectionInviteOutcome(state, t)
			if (!outcome.actionable) {
				setNotice(outcome.message)
				onSettled()
				return
			}
			await respond({ networkId, connectionId: id, accept })
			// Le serveur a tranché ET résolu la ligne dans la même transaction :
			// on dit le résultat en place, sans marquage à ajouter.
			const done = accept
				? t("reseauNotificationRow.accepted")
				: t("reseauNotificationRow.declined")
			toast.success(done)
			setNotice(done)
		} catch (error) {
			// Le serveur reste l'arbitre : entre la relecture et la réponse, un
			// autre client a pu trancher (`conflict`) ou la demande disparaître
			// (`notFound`). On le DIT, on ne réessaie pas. Un refus qui ne dit
			// RIEN de l'invitation (débit, adhésion) se dit par son code, et les
			// boutons restent : la demande attend toujours une réponse.
			const code = engineErrorCode(error)
			if (code !== "conflict" && code !== "notFound") {
				toast.error(code === null ? t("reseauNotificationRow.decisionFailed") : t(`errors:${code}`))
				return
			}
			setNotice(t("reseauNotificationRow.alreadyHandled"))
			onSettled()
		} finally {
			deciding.current = false
			setBusy(false)
		}
	}

	if (notice !== null) {
		return (
			<p
				role="status"
				style={{
					margin: "6px 0 0",
					fontSize: 12.5,
					color: "var(--ink-600)",
				}}
			>
				{notice}
			</p>
		)
	}

	return (
		<div className="ntf-invite-actions" aria-busy={busy}>
			{/* Accepter : couleur des relations (ADR-0027). */}
			<Button style={{ ...COMPACT_SOCIAL_ACTION_STYLE, flex: "1 1 0", minWidth: 0 }}
				size="sm"
				variant="social"
				disabled={busy}
				onClick={() => void decide(true)}
			>
				{t("reseauNotificationRow.accept")}
			</Button>
			<Button style={{ ...COMPACT_SOCIAL_ACTION_STYLE, flex: "1 1 0", minWidth: 0 }}
				size="sm"
				variant="outline"
				disabled={busy}
				onClick={() => void decide(false)}
			>
				{t("reseauNotificationRow.decline")}
			</Button>
		</div>
	)
}
