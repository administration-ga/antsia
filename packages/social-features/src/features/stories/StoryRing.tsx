// Dupliqué de socle/packages/agent-features/src/features/stories/StoryRing.tsx @ ad2e7fdc2 — adaptations : aucune dans le code (aucun libellé ; un nom vide rend la silhouette, ce que l'appelant passe pour un auteur que le moteur ne nomme pas) ; classes d'anneau `.esp-story-ring*` lues dans la couche de communication de `@antsia/ui` (`communication.css`).
"use client"

/**
 * StoryRing — l'anneau d'une vignette du plateau, et ce qu'il entoure.
 *
 * Trois états, décidés par `ringStateFor` (`stories-tray.ts`) et jamais ici :
 * `self` (ma série), `unseen` (il reste à voir), `seen` (tout est vu). La
 * COULEUR des trois vient des classes `.esp-story-ring*` de la couche de
 * communication de `@antsia/ui` (`communication.css`) — un dégradé conique est
 * une valeur composée, elle ne se dit ni en classe Tailwind ni en style en
 * ligne.
 *
 * ⚠️ L'image est `aria-hidden` et le composant n'a AUCUN nom accessible : il
 * est toujours rendu DANS un contrôle (bouton de la barre, lien d'auteur) qui
 * porte, lui, la phrase de `trayTileLabel`. Un `alt` ici doublerait
 * l'annonce — un lecteur d'écran dirait deux fois le même nom.
 */

import { Icon } from "@antsia/ui"
import { useState, type ReactNode } from "react"
import { initialsOf } from "../reseau-personnel/Avatar"
import type { StoryRingState } from "./stories-tray"

const RING_CLASS: Record<StoryRingState, string> = {
	self: "esp-story-ring-self",
	unseen: "esp-story-ring",
	seen: "esp-story-ring-seen",
}

export interface StoryRingProps {
	state: StoryRingState
	displayName: string
	/** La vignette de la story la plus récente ; à défaut, l'avatar. */
	coverUrl?: string | null
	avatarUrl?: string | null
	/** Les tons décoratifs du nom public ne concernent que les médaillons. */
	presentation?: "cards" | "rings"
}

export function StoryRing({
	state,
	displayName,
	coverUrl,
	avatarUrl,
	presentation = "cards",
}: StoryRingProps) {
	// La COUVERTURE d'abord : c'est ce que la personne vient de publier, et
	// c'est ce qui donne envie d'ouvrir. L'avatar n'est qu'un repli — une
	// rangée de portraits ne dit pas ce qu'il y a derrière.
	const image = coverUrl ?? avatarUrl ?? null
	const fallback = displayName.trim().length > 0 ? <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: "0.02em" }}>{initialsOf(displayName)}</span> : <Icon name="user" size={22} />

	return (
		<span className={`st-tray-ring ${RING_CLASS[state]}`} aria-hidden="true">
			<span className="st-tray-disc">
				{image !== null ? (
					<RingImage key={image} url={image} fallback={fallback} />
				) : fallback}
			</span>
		</span>
	)
}

function RingImage({ url, fallback }: { url: string; fallback: ReactNode }) {
	const [failed, setFailed] = useState(false)
	if (failed) return fallback
	// eslint-disable-next-line @next/next/no-img-element -- moteur indépendant de Next : URL délivrée par la garde, miniature au cadre déjà dimensionné.
	return <img className="st-tray-cover" src={url} alt="" onError={() => setFailed(true)} />
}
