// Dupliqué de socle/packages/agent-features/src/features/messagerie/MessageAttachment.tsx @ ad2e7fdc2 — adaptations : iDocument retiré (bouton « Enregistrer dans iDocument », `onSave`, `sourceDocumentId`) ; la retenue d'un fichier se lit dans le DTO du moteur (`withheld` : `fileScanPending` / `fileQuarantined`, garde fail-closed) et se ramène à l'état de service de la politique de fichiers (`ServiceState` de `@antsia/social-domain/filePolicy`) au lieu du statut d'analyse et de `scanBadgeLabel` ; libellés traduits (espace de noms `messagerie`, clés `messageAttachment.*`) ; poids dit dans la langue courante (`formatBytes(bytes, locale, t)`).
"use client"

/**
 * MessageAttachment — UNE pièce jointe, rendue selon ce qu'elle EST.
 *
 * Quatre rendus, décidés par `attachmentKind` (module pur) et jamais ici :
 * image, vidéo, son, fichier. Le composant ne fait qu'appliquer.
 *
 * ⚠️ `playsInline` sur la vidéo n'est pas une option. Sans lui, iOS ouvre la
 * vidéo en PLEIN ÉCRAN dès la lecture, quitte la conversation, et la barre de
 * retour du lecteur système ramène à la page précédente — pas au fil.
 *
 * ⚠️ Le son passe par `<audio controls>` NATIF, et non par une barre dessinée
 * à la main. Un lecteur maison doit réimplémenter la barre de progression, le
 * déplacement, la vitesse, l'accessibilité clavier et l'annonce de durée — et
 * il perd le contrôle système de l'écran verrouillé. La durée, elle, est
 * affichée À CÔTÉ quand le serveur la porte : `<audio>` ne la connaît qu'après
 * avoir téléchargé assez d'octets pour la décoder.
 *
 * ⚠️ Une pièce RETENUE par la garde des fichiers arrive sans URL, avec la
 * raison (`withheld`) : l'écran la DIT (« analyse en cours », « bloqué ») au
 * lieu d'un « indisponible » muet. La garde est fail-closed : un fichier qu'elle
 * ne connaît pas est retenu, jamais servi.
 *
 * ⚠️ Aucune couleur ici : tout passe par la feuille partagée (cf.
 * `messagerie-styles.tsx`) et ses jetons de rôle.
 */

import type { MediaWithheld } from "@antsia/social-contracts/media"
import type { ServiceState } from "@antsia/social-domain/filePolicy"
import { Download, FileText, Loader2, Music, ShieldAlert } from "lucide-react"
import { useTranslation } from "react-i18next"
import { attachmentKind, formatBytes } from "./messagerie-composer"
import { formatVoiceDuration } from "./voice-note"

export interface MessageAttachmentData {
	filename: string
	mimeType: string
	sizeBytes: number
	/** Durée d'un vocal, en millisecondes — absente sur toute autre pièce. */
	durationMs?: number | null
	/** L'URL servie par la garde des fichiers — `null` tant que le fichier est retenu. */
	url: string | null
	/**
	 * POURQUOI l'URL manque, quand la garde des fichiers le dit : analyse en
	 * cours (`fileScanPending`) ou fichier bloqué (`fileQuarantined`). Absent ou
	 * `null` avec une URL `null` : la pièce est simplement indisponible.
	 */
	withheld?: MediaWithheld | null
}

/**
 * L'état de service d'une pièce retenue, au vocabulaire de la politique de
 * fichiers du domaine : la garde du moteur rend `fileScanPending` pour un
 * fichier en analyse (ou inconnu d'elle) et `fileQuarantined` pour un fichier
 * bloqué (suspect ou infecté). `fileScanUnavailable` signale séparément un
 * échec de l'analyse, sans affirmer que le fichier est dangereux.
 */
function retenueDe(withheld: MediaWithheld | null | undefined): Exclude<ServiceState, "servable"> | null {
	if (withheld === "fileScanPending") return "pending"
	if (withheld === "fileQuarantined") return "blocked"
	return null
}

export function MessageAttachment({
	attachment,
}: {
	attachment: MessageAttachmentData
}) {
	const { t, i18n } = useTranslation("messagerie")
	const kind = attachmentKind(attachment.mimeType)
	const { url, filename } = attachment

	// Une pièce sans URL n'est pas rendue en média : une balise `<img>` à `src`
	// vide affiche l'icône de rupture du navigateur, qui ressemble à un bug de
	// l'application. On tombe sur la ligne de fichier, qui dit au moins le nom —
	// et POURQUOI l'URL manque quand la garde des fichiers le sait.
	if (url === null || attachment.withheld != null) {
		const retenue = retenueDe(attachment.withheld)
		return (
			<span className="msg-file" data-withheld={attachment.withheld ?? "none"}>
				{retenue === "blocked" ? (
					<ShieldAlert aria-hidden="true" size={15} />
				) : retenue === "pending" ? (
					<Loader2 aria-hidden="true" size={15} className="animate-spin" />
				) : (
					<FileText aria-hidden="true" size={15} />
				)}
				<span className="msg-pending-name">{filename}</span>
				<span className="msg-file-meta">
					{attachment.withheld === "fileScanUnavailable"
						? t("errors:fileScanUnavailable")
						: retenue === "blocked"
						? t("messageAttachment.blocked")
						: retenue === "pending"
							? t("messageAttachment.scanPending")
							: t("messageAttachment.unavailable")}
				</span>
			</span>
		)
	}

	if (kind === "image") {
		return (
			<span style={{ position: "relative", display: "inline-block" }}>
				<a href={url} target="_blank" rel="noreferrer noopener">
					{/* biome-ignore lint/performance/noImgElement: pièce jointe distante
					    à URL servie par la garde des fichiers — l'optimiseur d'images de
					    Next ne peut ni la mettre en cache ni la re-servir. */}
					<img
						className="msg-media"
						src={url}
						alt={filename}
						loading="lazy"
						decoding="async"
					/>
				</a>
			</span>
		)
	}

	if (kind === "video") {
		return (
			// eslint-disable-next-line jsx-a11y/media-has-caption
			<video
				className="msg-media"
				src={url}
				controls
				playsInline
				preload="metadata"
				aria-label={filename}
			/>
		)
	}

	if (kind === "audio") {
		const duree =
			attachment.durationMs !== null && attachment.durationMs !== undefined
				? formatVoiceDuration(attachment.durationMs)
				: null
		return (
			<span
				style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}
			>
				<Music aria-hidden="true" size={14} />
				{/* eslint-disable-next-line jsx-a11y/media-has-caption */}
				<audio
					className="msg-audio"
					src={url}
					controls
					preload="metadata"
					aria-label={
						duree === null
							? t("messageAttachment.voiceMessage")
							: t("messageAttachment.voiceMessageWithDuration", { duration: duree })
					}
				/>
				{duree !== null ? (
					<span className="msg-file-meta">{duree}</span>
				) : null}
			</span>
		)
	}

	return (
		<span style={{ display: "inline-flex", alignItems: "center", gap: 4, minWidth: 0 }}>
			<a
				className="msg-file"
				href={url}
				target="_blank"
				rel="noreferrer noopener"
				download={filename}
			>
				<Download aria-hidden="true" size={15} />
				<span className="msg-pending-name">{filename}</span>
				<span className="msg-file-meta">
					{formatBytes(attachment.sizeBytes, i18n.language, t)}
				</span>
			</a>
		</span>
	)
}
