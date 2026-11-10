"use client"

/**
 * IappelVoicemails — IC-02 : la messagerie vocale REÇUE, dans le journal d'appels.
 *
 * Le message laissé après un appel sans réponse (`VoicemailRecorder`, chez
 * l'appelant) se retrouve ICI, chez son destinataire seul : l'écouter, le
 * marquer comme écouté, le supprimer.
 *
 * ⚠️ Aucune URL d'écoute dans la liste : `playbackUrl` la délivre à la demande,
 * sous la garde des fichiers — la retenue est DITE tant que l'analyse n'a pas
 * parlé, jamais un lecteur muet.
 *
 * ⚠️ Le son passe par `<audio controls>` NATIF, comme les vocaux des
 * conversations (`MessageAttachment`) : barre, déplacement, vitesse et clavier
 * viennent du navigateur. La durée, connue du serveur, s'affiche à côté.
 *
 * ⚠️ « Écouté » = la première lecture, ou le geste explicite : `markRead` est
 * idempotent côté serveur (la première écoute est un fait, jamais réécrit).
 *
 * ⚠️ Supprimer est DÉFINITIF (la ligne, l'enregistrement, l'avis de la cloche) :
 * une confirmation d'abord, au motif des gestes sensibles d'un groupe.
 */

import { api } from "@antsia/api/engine"
import { useNetwork } from "@antsia/api/network"
import { useViewerTimeZone } from "@antsia/api/viewer-preferences"
import { useMutation } from "convex/react"
import { Check, Play, Trash2, Voicemail } from "lucide-react"
import { useEffect, useId, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { formatClockTime, formatElapsed } from "./call-timer"
import {
	VOICEMAIL_INBOX_LIMIT,
	voicemailErrorMessage,
	type VoicemailInbox,
	type VoicemailInboxItem,
	type VoicemailWithheld,
} from "./voicemail-inbox"

type Playback =
	| { kind: "url"; url: string }
	| { kind: "withheld"; code: VoicemailWithheld }
	| { kind: "failed" }

export function IappelVoicemails({ inbox }: { inbox: VoicemailInbox }) {
	const { t } = useTranslation("iappel")

	if (inbox.isError) {
		return <p className="icom-relations-empty" role="alert">{t("iappelVoicemails.error")}</p>
	}
	if (inbox.isLoading) {
		return <p className="icom-relations-empty" role="status">{t("iappelVoicemails.loading")}</p>
	}
	if (inbox.items.length === 0) {
		return <p className="icom-relations-empty">{t("iappelVoicemails.empty")}</p>
	}

	const now = Date.now()
	return (
		<>
			<ul className="icom-relations-list" aria-label={t("iappelVoicemails.label")}>
				{inbox.items.map((item) => (
					<VoicemailRow key={item.voicemailId} item={item} now={now} />
				))}
			</ul>
			{inbox.truncated ? (
				<p className="icom-relations-empty">
					{t("iappelVoicemails.truncated", { limit: VOICEMAIL_INBOX_LIMIT })}
				</p>
			) : null}
		</>
	)
}

function VoicemailRow({ item, now }: { item: VoicemailInboxItem; now: number }) {
	const { t, i18n } = useTranslation("iappel")
	const timeZone = useViewerTimeZone()
	const { networkId } = useNetwork()
	const playbackUrl = useMutation(api.modules.calls.voicemail.playbackUrl)
	const markRead = useMutation(api.modules.calls.voicemail.markRead)
	const deleteMine = useMutation(api.modules.calls.voicemail.deleteMine)
	const [playback, setPlayback] = useState<Playback | null>(null)
	const [busy, setBusy] = useState<"listen" | "delete" | null>(null)
	const [marking, setMarking] = useState(false)
	const [confirming, setConfirming] = useState(false)
	const audioRef = useRef<HTMLAudioElement>(null)
	const confirmId = useId()
	const voicemailId = item.voicemailId
	const unheard = !item.isRead
	// Le nom choisi ou publié (`counterpartLabel`) ; sans nom, le libellé neutre du journal.
	const name = item.from.label.displayName ?? t("iappelJournal.peer")

	// Le lecteur paraît après le geste « Écouter » : la lecture est tentée. Un
	// navigateur qui la refuse hors du geste (iOS) laisse les contrôles natifs.
	useEffect(() => {
		if (playback?.kind !== "url") return
		const audio = audioRef.current
		if (audio === null) return
		void Promise.resolve()
			.then(() => audio.play())
			.catch(() => undefined)
	}, [playback])

	const listen = async () => {
		if (busy !== null) return
		setBusy("listen")
		try {
			const delivery = await playbackUrl({ networkId, voicemailId })
			setPlayback(
				delivery.url !== null
					? { kind: "url", url: delivery.url }
					: { kind: "withheld", code: delivery.withheld ?? "fileScanPending" },
			)
		} catch (error) {
			toast.error(voicemailErrorMessage(error, t))
		} finally {
			setBusy(null)
		}
	}

	const markHeard = async () => {
		if (!unheard || marking) return
		setMarking(true)
		try {
			await markRead({ networkId, voicemailId })
		} catch (error) {
			toast.error(voicemailErrorMessage(error, t))
		} finally {
			setMarking(false)
		}
	}

	const remove = async () => {
		if (busy !== null) return
		setBusy("delete")
		try {
			await deleteMine({ networkId, voicemailId })
			// La ligne part avec la souscription : rien à remettre en état.
			toast.success(t("iappelVoicemails.deleted"))
		} catch (error) {
			toast.error(voicemailErrorMessage(error, t))
			setBusy(null)
		}
	}

	return (
		<li className="iappel-voicemail" data-unheard={unheard ? "true" : undefined}>
			<div className="icom-relations-row">
				<Voicemail aria-hidden="true" size={18} className="iappel-voicemail-icon" />
				<span className="icom-relations-ident">
					<span className="icom-relations-name">
						{unheard ? <span className="iappel-voicemail-dot" aria-hidden="true" /> : null}
						{name}
					</span>
					<span className="icom-relations-handle">
						{t("iappelVoicemails.kind")} · <span className="iappel-count">{formatElapsed(item.durationMs)}</span>
						{unheard ? <> · {t("iappelVoicemails.unheard")}</> : null}
					</span>
				</span>
				<span className="iappel-voicemail-time">
					{formatClockTime(item.createdAt, now, i18n.language, t, timeZone)}
				</span>
				<span className="icom-relations-actions">
					{playback?.kind !== "url" ? (
						<button
							type="button"
							className="icom-relations-action"
							data-icon="true"
							disabled={busy !== null}
							aria-label={t("iappelVoicemails.listen", { name })}
							onClick={() => void listen()}
						>
							<Play aria-hidden="true" size={16} />
						</button>
					) : null}
					{unheard ? (
						<button
							type="button"
							className="icom-relations-action"
							data-icon="true"
							disabled={marking || busy === "delete"}
							aria-label={t("iappelVoicemails.markRead", { name })}
							onClick={() => void markHeard()}
						>
							<Check aria-hidden="true" size={16} />
						</button>
					) : null}
					<button
						type="button"
						className="icom-relations-action"
						data-icon="true"
						disabled={busy === "delete"}
						aria-pressed={confirming}
						aria-label={t("iappelVoicemails.delete", { name })}
						onClick={() => setConfirming((open) => !open)}
					>
						<Trash2 aria-hidden="true" size={16} />
					</button>
				</span>
			</div>

			{busy === "listen" ? (
				<p className="iappel-voicemail-note" role="status">{t("iappelVoicemails.preparing")}</p>
			) : null}
			{playback?.kind === "url" ? (
				<div className="iappel-voicemail-detail">
					<audio
						ref={audioRef}
						className="msg-audio"
						src={playback.url}
						controls
						preload="metadata"
						aria-label={t("iappelVoicemails.player", { name })}
						onPlay={() => void markHeard()}
						onError={() => setPlayback({ kind: "failed" })}
					/>
				</div>
			) : null}
			{playback?.kind === "withheld" ? (
				<p className="iappel-voicemail-note" role="status">{t(`errors:${playback.code}`)}</p>
			) : null}
			{playback?.kind === "failed" ? (
				<p className="iappel-voicemail-note" role="alert">{t("iappelVoicemails.playbackFailed")}</p>
			) : null}
			{confirming ? (
				<div className="iappel-voicemail-detail">
					<div className="msg-infos-confirm msg-infos-sensitive-confirm" role="group" aria-labelledby={confirmId}>
						<p id={confirmId}>{t("iappelVoicemails.confirmDelete", { name })}</p>
						<div className="msg-infos-confirm-actions">
							<button
								type="button"
								className="msg-infos-mini"
								data-danger="true"
								disabled={busy === "delete"}
								onClick={() => void remove()}
							>
								{busy === "delete" ? t("iappelVoicemails.deleting") : t("iappelVoicemails.confirm")}
							</button>
							<button
								type="button"
								className="msg-infos-mini"
								data-role="cancel"
								disabled={busy === "delete"}
								onClick={() => setConfirming(false)}
							>
								{t("iappelVoicemails.cancel")}
							</button>
						</div>
					</div>
				</div>
			) : null}
		</li>
	)
}
