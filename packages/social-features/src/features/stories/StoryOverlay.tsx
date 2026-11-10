// Dupliqué de socle/packages/agent-features/src/features/stories/StoryOverlay.tsx @ ad2e7fdc2 — adaptations : lien de profil composé par la table des routes de l'application (`useRoutes().profile(handle)`) au lieu de la route de l'espace du socle ; nom d'auteur nullable (contrat `counterpartLabel`) dit par le libellé neutre, pastille sans initiales dans ce cas ; légende nullable (DTO du moteur) ; nom accessible de la croix traduit (clé `stories:storyOverlay.close`).
"use client"

/**
 * StoryOverlay — les deux bandeaux posés sur une story : l'auteur et l'âge en
 * haut, la légende et les commandes en bas.
 *
 * ⚠️ Le voile de lisibilité (`.esp-story-shade`) ne capte AUCUN geste
 * (`pointer-events: none` dans `stories-styles`) : sans cela, il couvrirait le
 * cadre entier et avalerait les taps « précédent / suivant » — le lecteur
 * paraîtrait figé sans qu'aucune erreur ne le signale. Seuls les enfants
 * réellement interactifs reprennent les événements.
 *
 * ⚠️ Le nom de l'auteur est un LIEN vers son profil, et il n'est pas décoratif :
 * c'est le seul chemin qui sort d'une story vers la personne. Il ouvre en
 * quittant le lecteur — un profil rendu dans un cadre 9:16 ne serait pas un
 * profil.
 */

import { useRoutes } from "@antsia/api/network"
import { Link } from "@antsia/api/routing"
import type { PointerEvent, ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Avatar } from "../reseau-personnel/Avatar"
import { storyAuthorName } from "./stories-tray"

export interface StoryOverlayProps {
	/** `null` : le moteur n'a rien à nommer — le bandeau dit le libellé neutre. */
	displayName: string | null
	handle: string | null
	avatarUrl: string | null
	/** Déjà formaté par `storyAgeLabel` — ce composant ne calcule rien. */
	ageLabel: string
	caption?: string | null
	/** Fermer le lecteur. Toujours présent : Échap n'existe pas au téléphone. */
	onClose: () => void
	/** Commandes du bas (son, « Vu par », retrait) — composées par l'appelant. */
	actions?: ReactNode
	/** Carte facultative relue par le moteur, par exemple le plat du jour de la boutique. */
	content?: ReactNode
}

export function StoryOverlay({
	displayName,
	handle,
	avatarUrl,
	ageLabel,
	caption,
	onClose,
	actions,
	content,
}: StoryOverlayProps) {
	const { t } = useTranslation("stories")
	const routes = useRoutes()
	const name = storyAuthorName(displayName, t)

	const identity = (
		<>
			<Avatar
				displayName={displayName ?? ""}
				hasIdentity={displayName !== null}
				avatarUrl={avatarUrl}
				size={34}
			/>
			<span style={{ minWidth: 0 }}>
				<span className="st-author-name">{name}</span>
				<span
					className="st-author-age"
					style={{ display: "block", marginTop: 1 }}
				>
					{ageLabel}
				</span>
			</span>
		</>
	)

	/**
	 * ⚠️ Les gestes du bandeau NE REMONTENT PAS à la scène.
	 *
	 * `pointer-events: none` sur le bandeau n'y suffit pas : il empêche le
	 * bandeau de RECEVOIR un geste, il n'empêche pas celui de ses enfants
	 * interactifs de REMONTER. Sans cette coupure, toucher « Activer le son »
	 * ou « Vu par » déclencherait aussi le tap de la scène — et la story
	 * passerait à la suivante au moment précis où l'on essaie d'agir dessus.
	 */
	const stopBubbling = {
		onPointerDown: (event: PointerEvent<HTMLDivElement>) =>
			event.stopPropagation(),
		onPointerUp: (event: PointerEvent<HTMLDivElement>) =>
			event.stopPropagation(),
	}

	return (
		<>
			{/* Le voile — purement visuel, et donc invisible aux lecteurs
			    d'écran comme aux pointeurs. */}
			<div className="st-shade esp-story-shade" aria-hidden="true" />

			<div className="st-overlay st-overlay-top" {...stopBubbling}>
				{handle !== null ? (
					<Link href={routes.profile(handle)} className="st-author">
						{identity}
					</Link>
				) : (
					// Sans handle publié, il n'y a aucune page où aller : un lien mort
					// vaudrait moins qu'un texte honnête.
					<span className="st-author">{identity}</span>
				)}
				<button
					type="button"
					className="st-chip esp-story-chip"
					onClick={onClose}
					aria-label={t("storyOverlay.close")}
				>
					<span aria-hidden="true">✕</span>
				</button>
			</div>

			<div className="st-overlay st-overlay-bottom" {...stopBubbling}>
				{content}
				{caption !== undefined && caption !== null && caption.length > 0 ? (
					<p className="st-caption">{caption}</p>
				) : null}
				{actions !== undefined ? (
					<div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
						{actions}
					</div>
				) : null}
			</div>
		</>
	)
}
