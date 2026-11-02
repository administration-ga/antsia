// Dupliqué de socle/packages/agent-features/src/features/iappel/CallEndScreen.tsx @ ad2e7fdc2 — adaptations : branche « poste » élaguée (prop `scope` et titre de poste retirés) ; phrase d'admission du serveur retirée (prop `serverMessage` : le moteur rend un code, l'écran compose) ; actions traduites (i18n `iappel`) ; `describeCallEnd` et `peerDisplayName` reçoivent `t` en dernier paramètre ; couleurs par fonction (ADR-0027) : « Écrire » à l'aplat des messages (`data-role="message"`, pilule discrète en repli).
"use client"

/**
 * CallEndScreen — ce que l'appelant lit quand l'appel ne s'est pas fait.
 *
 * Un appel qui se referme en silence laisse conclure « ça ne marche pas ». Or
 * le serveur sait presque toujours quoi répondre : personne n'a décroché, on a
 * refusé, la personne ne prend pas d'appel en ce moment. Une fin d'appel est
 * une INFORMATION, et souvent la seule chose utile de tout l'écran.
 *
 * Les actions offertes découlent de la raison, et pas l'inverse :
 * « Réessayer » n'apparaît PAS sous un « ne pas déranger » — ce bouton
 * transformerait l'outil en moyen d'insister.
 *
 * Le moteur rend une RAISON, jamais une phrase : c'est ici qu'elle se dit
 * (`describeCallEnd`), dans la langue de l'écran.
 */

import { MessageSquare, Mic, PhoneOutgoing, X } from "lucide-react"
import { useTranslation } from "react-i18next"

import { describeCallEnd } from "./call-phase"
import type { CallEndKind, CallPeerIdentity } from "./call-types"
import { peerDisplayName } from "./call-peer"

export interface CallEndScreenProps {
	kind: CallEndKind
	peer: CallPeerIdentity | null
	/** Note laissée par le destinataire en refusant. */
	note?: string | null
	/** Durée de la communication, déjà formatée. */
	durationLabel?: string | null
	/** Le destinataire accepte-t-il un message vocal ? */
	voicemailOffered?: boolean
	/** Le contexte courant permet-il réellement de reconstruire cet appel ? */
	retryAvailable?: boolean
	/** Une nouvelle tentative est déjà en cours : interdit le double appel. */
	retrying?: boolean
	/** Une adresse de messagerie vérifiée est-elle disponible ? */
	writeAvailable?: boolean
	onRetry: () => void
	onWrite: () => void
	onLeaveVoicemail: () => void
	onClose: () => void
	/**
	 * Incrustations posées PAR-DESSUS l'écran de fin — la puce « Prendre »
	 * d'un appel qui sonne, les appels en attente.
	 *
	 * ⚠️ Cet écran n'en acceptait pas, et c'était une fenêtre morte : quand le
	 * correspondant raccroche pendant qu'un troisième appelle, l'hôte remplace
	 * `CallStage` par cet écran-ci, et la bannière d'entrant est simultanément
	 * supprimée (un appel vivant dans le magasin rend `callWaiting` vrai). Plus
	 * rien à l'écran ne permettait de décrocher, jusqu'à ce qu'on pense à
	 * fermer.
	 */
	children?: React.ReactNode
}

export function CallEndScreen({
	kind,
	peer,
	note,
	durationLabel,
	voicemailOffered,
	retryAvailable = true,
	retrying = false,
	writeAvailable = true,
	onRetry,
	onWrite,
	onLeaveVoicemail,
	onClose,
	children,
}: CallEndScreenProps) {
	const { t } = useTranslation("iappel")
	const copy = describeCallEnd(
		kind,
		{
			peerName: peerDisplayName(peer, undefined, t),
			note,
			durationLabel,
			voicemailOffered,
		},
		t,
	)

	return (
		<div
			className="call-hero-dark flex h-full w-full flex-col items-center justify-center gap-6 px-8 text-center"
			data-call-end={kind}
			role="status"
			aria-live="polite"
		>
			{children !== undefined && children !== null && children !== false && (
				<div className="iappel-stage-band">{children}</div>
			)}
			<div className="flex flex-col gap-2">
				<h1
					className="text-[22px] font-semibold text-pretty tracking-[-0.01em]"
					style={{ color: "var(--esp-immersive-on-ink)", fontFamily: "var(--esp-heading-font-family, inherit)", fontSize: "var(--esp-page-title-size, 22px)", fontWeight: "var(--esp-heading-font-weight, 600)", lineHeight: "var(--esp-page-title-leading, inherit)", letterSpacing: "var(--esp-page-title-tracking, -0.01em)" }}
				>
					{copy.title}
				</h1>
				{copy.body.length > 0 && (
					<p
						className="max-w-sm text-[14.5px] leading-relaxed"
						style={{ color: "var(--esp-immersive-on-ink)", opacity: 0.72, fontSize: "var(--esp-content-font-size, 14.5px)", lineHeight: "var(--esp-content-line-height, 1.625)" }}
					>
						{copy.body}
					</p>
				)}
			</div>

			<div className="flex flex-wrap items-center justify-center gap-2">
				{copy.canRetry && retryAvailable && (
					<button
						type="button"
						onClick={onRetry}
						disabled={retrying}
						aria-busy={retrying}
						className="iappel-soft-action"
					>
						<PhoneOutgoing aria-hidden="true" className="h-4 w-4" />
						{retrying ? t("callEndScreen.retrying") : t("callEndScreen.retry")}
					</button>
				)}
				{copy.canLeaveVoicemail && (
					<button
						type="button"
						onClick={onLeaveVoicemail}
						className="iappel-soft-action"
					>
						<Mic aria-hidden="true" className="h-4 w-4" />
						{t("callEndScreen.voicemail")}
					</button>
				)}
				{copy.canWrite && writeAvailable && (
					<button type="button" onClick={onWrite} className="iappel-soft-action" data-role="message">
						<MessageSquare aria-hidden="true" className="h-4 w-4" />
						{t("callEndScreen.write")}
					</button>
				)}
				<button type="button" onClick={onClose} className="iappel-soft-action">
					<X aria-hidden="true" className="h-4 w-4" />
					{t("callEndScreen.close")}
				</button>
			</div>
		</div>
	)
}
