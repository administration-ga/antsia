// Dupliqué de socle/packages/agent-features/src/features/iappel/CallWaitingChip.tsx @ ad2e7fdc2 — adaptations : branche « poste » élaguée (titre de poste : l'appel est toujours personnel) ; libellés et noms accessibles traduits (i18n `iappel`) ; `peerDisplayName` et `scopeBadgeLabel` reçoivent `t` en dernier paramètre ; rond Refuser à l'aplat et au texte de Supprimer (`--role-danger-*`, ADR-0027), facture d'origine en repli.
"use client"

/**
 * CallWaitingChip — « quelqu'un d'autre appelle », pendant une conversation.
 *
 * Jusqu'ici, toute alerte était SUPPRIMÉE pendant un appel : le second
 * appelant sonnait dans le vide, sans que personne ne le sache — ni lui, ni
 * celui qu'on cherchait à joindre. C'est le défaut que cette bande répare.
 *
 * Elle reste discrète par construction : une bande, pas une carte ; un signal
 * sonore bref, pas la sonnerie ; et « Accepter » dit ce qu'il fait vraiment —
 * il met l'appel en cours en attente, il ne le raccroche pas.
 */

import { PhoneIncoming, PhoneOff } from "lucide-react"
import { useTranslation } from "react-i18next"

import { peerDisplayName, scopeBadgeLabel } from "./call-peer"
import type { RingingCall } from "./call-types"

export interface CallWaitingChipProps {
	call: RingingCall
	onAccept: () => void
	onDecline: () => void
}

export function CallWaitingChip({ call, onAccept, onDecline }: CallWaitingChipProps) {
	const { t } = useTranslation("iappel")
	const name = peerDisplayName(call.caller, undefined, t)
	return (
		<div
			className="iappel-enter mx-3 mt-3 flex items-center gap-[var(--esp-card-gap,0.75rem)] rounded-[var(--esp-primitive-card-radius,0.75rem)] px-3 py-2"
			style={{
				background: "color-mix(in srgb, var(--esp-immersive-on-ink) 12%, transparent)",
				color: "var(--esp-immersive-on-ink)",
			}}
			role="group"
			aria-label={t("callWaitingChip.label", { name })}
		>
			<PhoneIncoming aria-hidden="true" className="h-4 w-4 shrink-0" />
			<span className="min-w-0 flex-1">
				<span className="block truncate text-[13.5px] font-semibold">{name}</span>
				<span className="block truncate text-[11.5px]" style={{ opacity: 0.7 }}>
					{scopeBadgeLabel(call.scope, t)}
				</span>
			</span>
			<button
				type="button"
				onClick={onDecline}
				aria-label={t("callWaitingChip.decline", { name })}
				className="inline-flex h-9 w-9 items-center justify-center rounded-full"
				style={{ background: "var(--role-danger-fill, var(--destructive))", color: "var(--role-danger-on, var(--destructive-foreground))" }}
			>
				<PhoneOff aria-hidden="true" className="h-4 w-4" />
			</button>
			{/* Le libellé dit l'effet réel : l'appel en cours passe en attente. */}
			<button
				type="button"
				onClick={onAccept}
				className="iappel-soft-action"
				style={{ minHeight: 36 }}
				title={t("callWaitingChip.acceptHint")}
			>
				{t("callWaitingChip.accept")}
			</button>
		</div>
	)
}
