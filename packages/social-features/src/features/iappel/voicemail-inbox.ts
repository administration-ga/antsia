/**
 * voicemail-inbox — IC-02 : la messagerie vocale REÇUE, lue dans le journal d'appels.
 *
 * Module PUR : la borne de lecture, la forme de la boîte que voient le journal et
 * les pastilles, et la phrase d'un refus. Le serveur (`calls/voicemail.ts`) garde
 * tout : seul le destinataire liste, marque et supprime, refus indistinct pour un
 * tiers ; l'écoute passe par la garde de délivrance des fichiers (`playbackUrl`).
 */
import type { api } from "@antsia/api/engine"
import { engineErrorCode, engineErrorRule } from "@antsia/social-contracts/errors"
import type { FunctionReturnType } from "convex/server"
import type { TFunction } from "i18next"

/** Le plafond du serveur (`MAX_LIST_LIMIT`) : la boîte se lit en UNE page, la plus récente d'abord. */
export const VOICEMAIL_INBOX_LIMIT = 50

export type VoicemailListing = FunctionReturnType<typeof api.modules.calls.voicemail.listMine>
export type VoicemailInboxItem = VoicemailListing["items"][number]
/** Pourquoi la garde retient l'enregistrement : analyse en cours, indisponible, ou bloqué. */
export type VoicemailWithheld = NonNullable<FunctionReturnType<typeof api.modules.calls.voicemail.playbackUrl>["withheld"]>

export interface VoicemailInbox {
	items: readonly VoicemailInboxItem[]
	/** Les non-écoutés de la page rendue — ce que comptent la pastille et le filtre. */
	unreadCount: number
	/** La page est pleine : des messages plus anciens peuvent exister au-delà. */
	truncated: boolean
	isLoading: boolean
	isError: boolean
}

/**
 * La boîte telle que l'écran la lit. Désactivée (iCom Pro, carte masquée), elle
 * est vide sans être « en chargement » : aucune pastille, aucun état d'attente.
 */
export function voicemailInboxOf(state: { data: VoicemailListing | undefined; isError: boolean; enabled: boolean }): VoicemailInbox {
	const items = state.data?.items ?? []
	return {
		items,
		unreadCount: state.data?.unreadCount ?? 0,
		truncated: items.length >= VOICEMAIL_INBOX_LIMIT,
		isLoading: state.enabled && state.data === undefined && !state.isError,
		isError: state.enabled && state.isError,
	}
}

/**
 * La phrase d'un geste refusé. Le refus indistinct (`notFound`) dit seulement que
 * le message n'est plus là (supprimé depuis un autre appareil, par exemple) ;
 * une règle ou un autre code du moteur se traduit tel quel ; le reste, générique.
 */
export function voicemailErrorMessage(error: unknown, t: TFunction): string {
	const rule = engineErrorRule(error)
	if (rule !== null) return t(`rules:${rule.rule}`, rule.params)
	const code = engineErrorCode(error)
	if (code === "notFound") return t("iappel:iappelVoicemails.gone")
	if (code !== null) return t(`errors:${code}`)
	return t("iappel:iappelVoicemails.failed")
}
