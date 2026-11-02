// Dupliqué de socle/packages/agent-features/src/features/iappel/IncomingCallBanner.tsx @ ad2e7fdc2 — adaptations : branches retirées — poste (fonction, administration, portée), invitation de réunion iRéunion, appel prioritaire (aucune priorité dans le moteur) ; libellés et noms accessibles traduits (i18n `iappel`) ; `peerDisplayName`, `scopeBadgeLabel` et `incomingGroupBannerLabel` reçoivent `t` en dernier paramètre ; couleurs par fonction (ADR-0027) : « Refuser avec un message » à l'aplat des messages (`data-tone="message"`, rond neutre en repli).
"use client"

/**
 * IncomingCallBanner — l'appel entrant au bureau.
 *
 * En HAUT à droite, et c'est délibéré : le coin bas-droite est déjà pris par
 * la fenêtre d'appel elle-même, la pilule d'appel réduit et le dock iCom. Une
 * bannière qui atterrit sous une autre surface se fait cliquer à travers.
 *
 * ⚠️ Elle ne VOLE PAS le focus. La personne est peut-être en train d'écrire :
 * lui arracher le curseur pour un appel qu'elle refusera est pire que la
 * laisser cliquer. L'annonce passe par une région vivante, que les lecteurs
 * d'écran lisent sans déplacer personne.
 */

import { BellOff, MessageSquare, Phone, PhoneOff, Video } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { Avatar } from "../reseau-personnel/Avatar"
import { peerDisplayName, peerSubtitle, scopeBadgeLabel } from "./call-peer"
import type { RingingCall } from "./call-types"
import { incomingGroupBannerLabel } from "./incoming-group"

export interface IncomingCallBannerProps {
	call: RingingCall
	quickReplies?: readonly string[]
	onAnswer: (mediaType: "audio" | "video") => void
	onDecline: (note?: string) => void
	/** Rang d'affichage : la seconde bannière se glisse sous la première. */
	rank?: 1 | 2
	/**
	 * L'audio est bloqué par la politique autoplay (aucun geste depuis
	 * l'ouverture de l'onglet) : la bannière le DIT — sonner en silence sans
	 * un mot est indiscernable d'une panne (S1).
	 */
	audioBlocked?: boolean
	/**
	 * La sonnerie est COUPÉE par la préférence de la personne : la bannière le DIT
	 * aussi — un silence choisi qui ne s'annonce pas se lit comme une panne,
	 * exactement comme l'autoplay. Les deux états sont exclusifs par
	 * construction (mute ⇒ plus rien d'audible à bloquer).
	 */
	ringtoneMuted?: boolean
}

export function IncomingCallBanner({
	call,
	quickReplies = [],
	onAnswer,
	onDecline,
	rank = 1,
	audioBlocked = false,
	ringtoneMuted = false,
}: IncomingCallBannerProps) {
	const { t } = useTranslation("iappel")
	const [repliesOpen, setRepliesOpen] = useState(false)
	const name = peerDisplayName(call.caller, undefined, t)
	// L'adresse de réseau (`@handle`) quand elle est connue — sinon le badge.
	const subtitle = peerSubtitle(call.caller, call.scope)
	/**
	 * Un appel de GROUPE se reconnaît AVANT le décrochage — décrocher fait
	 * entrer dans une conversation à plusieurs, et on répond autrement quand
	 * on le sait.
	 */
	const isGroup = call.kind === "group"
	/**
	 * « <titre court> · N personnes » au-delà de deux (fiche « appels de groupe
	 * de 2 à 11 ») : le titre reste celui de `shortGroupLabel`, le nombre porte
	 * son unité — « Cellule budget · 7 » ne disait pas 7 quoi.
	 */
	const groupLabel = isGroup ? incomingGroupBannerLabel(call.group, t) : null

	return (
		<div
			className="iappel-banner iappel-layer iappel-enter"
			data-rank={rank}
			role="group"
			aria-label={
				isGroup
					? t("incomingCallBanner.groupLabel", { name, group: groupLabel })
					: t("incomingCallBanner.label", { name })
			}
		>
			<Avatar displayName={name} avatarUrl={call.caller.avatarUrl} size={44} />

			<div className="min-w-0">
				{/* Le sur-titre porte l'information la plus décisive du bandeau :
				    ce n'est pas un tête-à-tête. Il précède le nom. */}
				{isGroup && (
					<p
						className="iappel-eyebrow truncate"
						style={{ color: "var(--muted-foreground)" }}
						title={groupLabel ?? undefined}
					>
						{groupLabel}
					</p>
				)}
				<p className="truncate text-[12.5px] font-medium">{name}</p>
				<p
					className="mt-0.5 truncate text-[11.5px]"
					style={{ color: "var(--muted-foreground)" }}
				>
					{subtitle ?? scopeBadgeLabel(call.scope, t)}
				</p>
				{audioBlocked ? (
					<p
						className="mt-0.5 flex items-center gap-1 truncate text-[10.5px]"
						style={{ color: "var(--muted-foreground)" }}
						role="status"
					>
						<BellOff aria-hidden="true" className="h-3 w-3 shrink-0" />
						{t("incomingCallBanner.audioBlocked")}
					</p>
				) : null}
				{ringtoneMuted ? (
					<p
						className="mt-0.5 flex items-center gap-1 truncate text-[10.5px]"
						style={{ color: "var(--muted-foreground)" }}
						role="status"
					>
						<BellOff aria-hidden="true" className="h-3 w-3 shrink-0" />
						{t("incomingCallBanner.ringtoneMuted")}
					</p>
				) : null}
			</div>

			<div className="flex items-center gap-1.5">
				{quickReplies.length > 0 && (
					<button
						type="button"
						onClick={() => setRepliesOpen((open) => !open)}
						aria-label={t("incomingCallBanner.declineWithMessage")}
						aria-expanded={repliesOpen}
						className="iappel-ctl"
						data-tone="message"
						style={{ width: 36, height: 36, minWidth: 36, minHeight: 36 }}
					>
						<MessageSquare aria-hidden="true" className="h-4 w-4" />
					</button>
				)}
				<button
					type="button"
					onClick={() => onDecline()}
					aria-label={t("incomingCallBanner.decline")}
					className="iappel-ctl"
					data-tone="hangup"
					style={{ width: 36, height: 36, minWidth: 36, minHeight: 36 }}
				>
					<PhoneOff aria-hidden="true" className="h-4 w-4" />
				</button>
				<button
					type="button"
					onClick={() => onAnswer(call.mediaType)}
					aria-label={
						call.mediaType === "video"
							? t("incomingCallBanner.answerVideo")
							: t("incomingCallBanner.answer")
					}
					className="iappel-ctl"
					data-tone="answer"
					style={{ width: 36, height: 36, minWidth: 36, minHeight: 36 }}
				>
					{call.mediaType === "video" ? (
						<Video aria-hidden="true" className="h-4 w-4" />
					) : (
						<Phone aria-hidden="true" className="h-4 w-4" />
					)}
				</button>
			</div>

			{repliesOpen && (
				<div className="col-span-3 flex flex-col gap-1.5 pt-1">
					{quickReplies.map((reply) => (
						<button
							key={reply}
							type="button"
							onClick={() => onDecline(reply)}
							className="rounded-[var(--esp-primitive-chip-radius,0.5rem)] px-3 py-2 text-left text-[13px]"
							style={{
								background: "color-mix(in srgb, var(--primary) 8%, transparent)",
								color: "var(--card-foreground)",
							}}
						>
							{reply}
						</button>
					))}
				</div>
			)}
		</div>
	)
}
