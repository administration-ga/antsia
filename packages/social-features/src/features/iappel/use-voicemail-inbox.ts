"use client"

/**
 * useVoicemailInbox — IC-02 : MA messagerie vocale dans le réseau courant.
 *
 * Le journal (liste) et les pastilles de l'onglet Appels lisent la MÊME requête,
 * avec les mêmes arguments : une seule souscription, deux lectures qui ne
 * divergent jamais.
 */
import { api } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"

import { VOICEMAIL_INBOX_LIMIT, voicemailInboxOf, type VoicemailInbox } from "./voicemail-inbox"

/** `enabled = false` (iCom Pro, surface masquée) : aucune souscription, boîte vide. */
export function useVoicemailInbox(enabled = true): VoicemailInbox {
	const { networkId } = useNetwork()
	const query = useAuthenticatedConvexQuery(
		api.modules.calls.voicemail.listMine,
		enabled ? { networkId, limit: VOICEMAIL_INBOX_LIMIT } : "skip",
	)
	return voicemailInboxOf({ data: query.data, isError: query.isError, enabled })
}
