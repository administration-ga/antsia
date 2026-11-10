// Dupliqué de socle/packages/agent-features/src/features/notifications/NotificationBell.tsx @ ad2e7fdc2 — adaptations : UNE seule source, la cloche sociale du réseau (`notifications.bell.unreadCount`, réseau courant de `useNetwork()`) — le second décompte de la table centrale (`notificationCenter.queries.unreadCountForEspace`) et leur addition retirés ; pastille et nom accessible instruits de la LACUNE du décompte (`capped`, par `tabBadge` / `unreadLabel`) ; la carte flottante de la coque porte la charte de `<html>` (relecture de `data-charte` sur le déclencheur et prop `charte` retirées : plus de charte de poste) ; prop `reseauBaseHref` retirée (les cibles se composent sur `useRoutes()`) ; pastille de la variante coque sans jeton de poste (`--poste-chip`) et texte sur le jeton déclaré `--destructive-foreground` ; libellés traduits (espace `notifications`, clés `notificationBell.…`) ; commentaires sans iRéseau, l'espace agent ni l'onglet « Administration » ; système épuré (ADR-0027) : rond gris de l'en-tête (`--esp-header-icon-*`) et pastille de non-lus aux couleurs des réactions (`--role-react-*`), valeurs d'origine en repli.
"use client"

/**
 * NotificationBell — LA cloche, partout où la coque en pose une.
 *
 * Un bouton qui ouvre une carte flottante par-dessus la page : relever ses
 * notifications ne coûte pas de QUITTER la page, et la page dessous ne bouge
 * pas.
 *
 * ⚠️ L'ouverture n'est PAS un état local. Elle vit dans
 * `notification-center-store`, parce que les anciens liens doivent continuer
 * de fonctionner : la page réseau consomme `?tab=activite` / `?notifications=1`
 * et DEMANDE l'ouverture, la cloche — montée ailleurs dans la coque —
 * l'entend par ce magasin. Une demande faite AVANT le montage de la cloche
 * est honorée telle quelle : le magasin est global, la cloche lit son état
 * au premier rendu.
 *
 * Focus, Échap, inertage et retour au déclencheur viennent d'`EspaceFloatingCard`
 * → `ImmersiveOverlay` → `useModalA11y` : la cloche n'en réimplémente rien. La
 * carte porte la charte de l'application (`<html data-charte>`).
 *
 * Une seule source : la cloche sociale du réseau. Le serveur compte jusqu'au
 * plafond du domaine et dit s'il en reste au-delà (`capped`) : la pastille
 * affiche alors « 99+ », et son nom accessible « plus de 99 ».
 */

import { api } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import { Bell } from "lucide-react"
import { useEffect, useMemo, useState, useSyncExternalStore } from "react"
import { useTranslation } from "react-i18next"
import { EspaceFloatingCard } from "../../shell/floating-card/EspaceFloatingCard"
import { NotificationsCenter } from "./NotificationsCenter"
import {
	closeNotificationCenter,
	toggleNotificationCenter,
	useNotificationCenter,
} from "./notification-center-store"
import { tabBadge, unreadLabel } from "./notification-center-tabs"
import type { NotificationTargets } from "./notification-targets"

/**
 * Deux poses, deux hôtes. `"chrome"` = la barre de la coque (pastille
 * absolue, 44 px, mêmes jetons que ses voisines) ; `"reseau"` = l'en-tête
 * mobile du réseau, qui a sa propre facture d'onglets (`.rm-tab`, 44 px).
 */
export type NotificationBellVariant = "chrome" | "reseau"

export interface NotificationBellProps {
	/** Destination « Tout voir » — absente, la carte n'affiche aucun lien. */
	fullHref?: string
	variant?: NotificationBellVariant
}

/**
 * La cloche n'ouvre rien sur place : la liste tombe sur les adresses
 * (`useRoutes()`). Constante de module : la même référence à chaque rendu.
 */
const NO_TARGETS: NotificationTargets = Object.freeze({})

/**
 * ⚠️ UNE seule carte, même quand PLUSIEURS cloches sont montées.
 *
 * Au téléphone, il peut y en avoir deux : celle de l'en-tête mobile, et celle
 * de la barre de la coque, MASQUÉE en CSS sans être démontée. Deux cartes
 * ouvertes en même temps sont deux `<dialog>` frères de `<body>`, et
 * `useModalA11y` inerte tous les frères du sien : chacune inerterait l'autre,
 * et plus rien ne répondrait. Le registre ci-dessous désigne UNE hôtesse — la
 * dernière montée, donc la plus intérieure, donc celle qu'on voit.
 */
const mountedBells: symbol[] = []
const bellListeners = new Set<() => void>()

function subscribeBells(listener: () => void): () => void {
	bellListeners.add(listener)
	return () => {
		bellListeners.delete(listener)
	}
}

function cardHost(): symbol | null {
	return mountedBells.length > 0
		? (mountedBells[mountedBells.length - 1] ?? null)
		: null
}

/** Instantané SERVEUR stable : aucune carte n'est rendue avant l'hydratation. */
function noCardHost(): symbol | null {
	return null
}

const CHROME_CLASS =
	"relative grid size-11 place-items-center rounded-[var(--esp-header-icon-radius,var(--esp-r-chrome))] bg-[var(--esp-header-icon-bg,var(--esp-neutral-chip))] text-muted-foreground transition-colors hover:bg-[var(--esp-neutral-hover)] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"

export function NotificationBell({
	fullHref,
	variant = "chrome",
}: NotificationBellProps) {
	const { t } = useTranslation("notifications")
	const { networkId } = useNetwork()
	const { open } = useNotificationCenter()
	const unread = useAuthenticatedConvexQuery(
		api.modules.notifications.bell.unreadCount,
		{ networkId },
	)

	/**
	 * L'instant de référence des dates relatives, rafraîchi à CHAQUE
	 * ouverture : figé au montage, « il y a 2 min » vieillirait avec l'onglet.
	 */
	const [now, setNow] = useState(() => Date.now())
	useEffect(() => {
		if (!open) return
		setNow(Date.now())
	}, [open])

	const bellId = useMemo(() => Symbol("notification-bell"), [])
	useEffect(() => {
		mountedBells.push(bellId)
		for (const listener of bellListeners) listener()
		return () => {
			const index = mountedBells.indexOf(bellId)
			if (index >= 0) mountedBells.splice(index, 1)
			for (const listener of bellListeners) listener()
		}
	}, [bellId])
	const rendersCard =
		useSyncExternalStore(subscribeBells, cardHost, noCardHost) === bellId

	const count = unread.data?.count
	const capped = unread.data?.capped ?? false
	const badge = tabBadge(count, capped)
	const label = unreadLabel(count, capped, t)

	return (
		<>
			<button
				type="button"
				aria-expanded={open}
				aria-haspopup="dialog"
				aria-label={label ?? t("notificationBell.open")}
				onClick={toggleNotificationCenter}
				className={
					variant === "reseau"
						? "rm-tab min-h-11 min-w-11"
						: CHROME_CLASS
				}
				style={variant === "reseau" ? { flex: "0 0 auto", width: 44 } : undefined}
			>
				{variant === "reseau" ? (
					<span className="rm-tab-icon">
						<Bell aria-hidden="true" size={20} />
						{badge ? (
							<span className="rm-tab-badge">
								<span aria-hidden="true">{badge}</span>
							</span>
						) : null}
					</span>
				) : (
					<>
						<Bell aria-hidden="true" className="size-[17px]" />
						{badge ? (
							<span
								aria-hidden="true"
								className="absolute -top-1 -right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--role-react-fill,var(--destructive))] px-1 text-[10.5px] font-bold tabular-nums text-[color:var(--role-react-on,var(--destructive-foreground))]"
							>
								{badge}
							</span>
						) : null}
					</>
				)}
			</button>

			<EspaceFloatingCard
				open={open && rendersCard}
				onClose={closeNotificationCenter}
				title={t("notificationBell.title")}
				kind="choice"
			>
				<NotificationsCenter
					now={now}
					targets={NO_TARGETS}
					fullHref={fullHref}
				/>
			</EspaceFloatingCard>
		</>
	)
}
