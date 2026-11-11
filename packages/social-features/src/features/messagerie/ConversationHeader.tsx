// Dupliqué de socle/packages/agent-features/src/features/messagerie/ConversationHeader.tsx @ ad2e7fdc2 — adaptations : TQ* — branche poste élaguée (prop `eyebrow`, la fonction au-dessus du titre, ADR-0021 du socle) ; libellés traduits (espace de noms `messagerie`, clés `conversationHeader.*`, `callActionsFor(…, t)`) ; doctrine d'appel du moteur (`calls.direct.callMember`, `calls.groupCalls.startFromThread`) au lieu de `callByHandle` et de l'évènement de réunion. ; IM-01 (IC-04) : boutons d'appel retirés quand l'application déclare `callsAvailable={false}` ; IC-03 : emplacement `protection` après les appels (« Signaler ou bloquer » la personne d'un fil à deux, rendu par la vue).
"use client"

/**
 * ConversationHeader — l'en-tête d'une conversation : retour, identité, appels.
 *
 * Ce qu'il PORTE se décide dans `call-actions.ts` (module pur, testé) : un
 * brouillon n'appelle personne, un groupe propose les deux médias, un appel
 * déjà en cours désactive tout, et un appel VIVANT dans le groupe change le
 * libellé sans désactiver quoi que ce soit. Ici, le rendu et les mutations seuls.
 *
 * ⚠️ Le RETOUR ne veut pas dire la même chose des deux côtés — d'où `nav.back`
 * injecté (cf. `messagerie-views.ts`) : dans la carte, il revient à la liste
 * sans quitter la page ; sur la page, il remonte d'un cran dans l'historique.
 *
 * ⚠️ L'appel de groupe est un APPEL (`calls.groupCalls.startFromThread`),
 * posé dans le magasin d'appel que la surface globale rend. L'en-tête
 * n'embarque AUCUNE surface flottante : sous `.rp-scope` (`container-type:
 * inline-size`, donc `contain: layout`), tout `position: fixed` se fait
 * cadrer par la grille du fil au lieu du viewport.
 *
 * IC-03 : `protection` reçoit, DÉJÀ RENDU par la vue, le bouton « Signaler ou
 * bloquer » de la personne d'un fil à deux (`PersonProtectionMenu`). L'en-tête
 * reste une présentation : aucune mutation, aucune feuille ici.
 *
 * ⚠️ Le 1:1 appelle une personne au profil PUBLIÉ (`calls.direct.callMember`),
 * dont le HANDLE est l'adresse. Un correspondant sans profil publié n'en a
 * pas, et `callActionsFor` retire alors les boutons plutôt que de les laisser
 * échouer à l'appui.
 */

import { useCallsAvailable } from "@antsia/api/network"
import { ArrowLeft, ChevronDown, Phone, Users, Video } from "lucide-react"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { callActionsFor, type CallConversationKind } from "./call-actions"
import {
	isCompactPose,
	isRepliablePose,
	type MessagerieVariant,
} from "./messagerie-views"

export interface ConversationHeaderProps {
	variant: MessagerieVariant
	kind: CallConversationKind
	title: string
	/** Sous-titre : « 8 membres », « @handle », « appel en cours ». */
	subtitle?: ReactNode
	/** L'avatar ou l'emblème, déjà rendu par l'appelant. */
	avatar?: ReactNode
	/** L'identifiant DOM du titre, pour `aria-labelledby` du fil. */
	titleId?: string
	counterpartHandle?: string | null
	/** JE suis déjà dans un appel : plus rien ne s'ouvre. */
	hasActiveCall?: boolean
	/** LE GROUPE a un appel vivant : on le REJOINT. */
	groupCallLive?: boolean
	onBack: () => void
	/** Ouvrir le profil du correspondant (le titre devient cliquable). */
	onOpenProfile?: () => void
	onCallAudio?: () => void
	onCallVideo?: () => void
	callPending?: boolean
	/** Repli de la carte — la page n'a rien à replier. */
	open?: boolean
	onToggleOpen?: () => void
	/** IC-03 : « Signaler ou bloquer », rendu par la vue, en dernier dans la rangée. */
	protection?: ReactNode
}

export function ConversationHeader({
	variant,
	kind,
	title,
	subtitle,
	avatar,
	titleId,
	counterpartHandle,
	hasActiveCall = false,
	groupCallLive = false,
	onBack,
	onOpenProfile,
	onCallAudio,
	onCallVideo,
	callPending = false,
	open = true,
	onToggleOpen,
	protection,
}: ConversationHeaderProps) {
	const { t } = useTranslation("messagerie")
	// IM-01 : une application sans appels (`callsAvailable={false}`) ne propose ni audio, ni vidéo, ni appel de groupe.
	const callsAvailable = useCallsAvailable()
	const actions = callActionsFor(
		{
			kind,
			counterpartHandle,
			hasActiveCall,
			groupCallLive,
		},
		t,
	)
	const repliable = isRepliablePose(variant) && onToggleOpen !== undefined
	const withProtection = protection !== undefined && protection !== null
	// La marge du bord, en pose compacte, revient au DERNIER élément de la rangée.
	const edgeMargin = isCompactPose(variant) ? { marginRight: 6 } : undefined
	/*
	 * Le titre et le chevron n'ont PAS le même rôle :
	 *  - surface ouverte : l'identité mène au profil ou aux informations du groupe ;
	 *  - surface rétractée : l'identité la déplie avant d'offrir sa destination ;
	 *  - le chevron reste toujours la commande explicite de la pose.
	 *
	 * L'ancien bouton unique capturait le clic sur un groupe dans le dock :
	 * `onOpenProfile` était bien fourni, mais jamais appelé dès que la carte était
	 * repliable. La fiche mobile existait donc aussi sur ordinateur sans qu'aucun
	 * geste ne puisse l'atteindre.
	 */
	const identityOpensTarget = onOpenProfile !== undefined && (!repliable || open)
	const identityAction = identityOpensTarget
		? onOpenProfile
		: repliable
			? onToggleOpen
			: undefined
	const identityLabel = identityOpensTarget
		? kind === "groupe"
			? t("conversationHeader.groupInfo", { title })
			: t("conversationHeader.openProfile", { title })
		: repliable
			? t("conversationHeader.expandNamed", { title })
			: undefined

	return (
		<div className="msg-head-row">
			<button
				type="button"
				className="msg-icon-btn"
				aria-label={
					variant === "page"
						? t("conversationHeader.backPage")
						: t("conversationHeader.backList")
				}
				onClick={onBack}
				style={isCompactPose(variant) ? { marginLeft: 6 } : undefined}
			>
				<ArrowLeft aria-hidden="true" size={variant === "page" ? 20 : 16} />
			</button>

			{/*
			 * ⚠️ FRÈRES, jamais imbriqués : un bouton dans un bouton est du balisage
			 * invalide, et le clavier n'atteint jamais les suivants. C'est pour cela
			 * que l'en-tête est un bouton SEUL, avec les appels à côté — et non un
			 * en-tête cliquable qui les contiendrait.
			 */}
			<button
				type="button"
				className="msg-head"
				aria-label={identityLabel}
				aria-expanded={repliable && !identityOpensTarget ? open : undefined}
				onClick={identityAction}
				// L'en-tête n'est cliquable que s'il mène quelque part.
				disabled={identityAction === undefined}
				style={
					identityAction === undefined
						? { cursor: "default", opacity: 1 }
						: undefined
				}
			>
				{avatar}
				<span className="msg-row-main">
					<span className="msg-head-title" id={titleId}>
						{title}
					</span>
					{subtitle !== undefined && subtitle !== null ? (
						<span className="msg-row-preview">{subtitle}</span>
					) : null}
				</span>
			</button>

			{repliable ? (
				<button
					type="button"
					className="msg-icon-btn msg-collapse-btn"
					aria-label={open ? t("conversationHeader.collapse") : t("conversationHeader.expand")}
					aria-expanded={open}
					onClick={onToggleOpen}
				>
					<ChevronDown aria-hidden="true" size={16} className="msg-collapse-icon" />
				</button>
			) : null}

				{callsAvailable && (actions.audio.available || actions.video.available) ? (
					<div
						className="icom-action-group"
						role="group"
						aria-label={t("conversationHeader.callActions", { title })}
						style={withProtection ? undefined : edgeMargin}
					>
						{actions.audio.available ? (
							<button
								type="button"
								className="icom-action-group-btn"
								// Le vert dit qu'un appel est VIVANT dans le groupe : la même
								// signalétique que dans la carte du bureau. Elle vivait sur le
								// bouton « groupe », retiré depuis que l'appel de groupe se
								// demande en audio ou en vidéo comme n'importe quel appel.
								data-live={groupCallLive ? "true" : "false"}
								aria-label={actions.audio.label}
								title={actions.audio.label}
								disabled={actions.audio.disabled || callPending}
								onClick={onCallAudio}
							>
								{kind === "groupe" && groupCallLive ? (
									<Users aria-hidden="true" size={17} />
								) : (
									<Phone aria-hidden="true" size={17} />
								)}
							</button>
						) : null}

						{actions.video.available ? (
							<button
								type="button"
								className="icom-action-group-btn"
								aria-label={actions.video.label}
								title={actions.video.label}
								disabled={actions.video.disabled || callPending}
								onClick={onCallVideo}
							>
								<Video aria-hidden="true" size={17} />
							</button>
						) : null}
					</div>
				) : null}

			{withProtection ? (
				<div style={{ display: "flex", flex: "0 0 auto", ...edgeMargin }}>{protection}</div>
			) : null}

			{/* ⚠️ Le bouton « groupe » a été RETIRÉ le 2026-08-22. Il existait
			    parce que l'appel de groupe partait sur le canal des RÉUNIONS,
			    où le média ne se choisit pas d'avance. Devenu un APPEL, un
			    groupe se demande en audio ou en vidéo — par les deux boutons
			    ci-dessus, qui servent désormais les deux genres de fil. */}
		</div>
	)
}
