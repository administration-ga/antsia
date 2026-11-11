// Dupliqué de socle/packages/agent-features/src/features/iappel/use-incoming-calls.ts @ ad2e7fdc2 — adaptations : ce qui sonne vient du moteur (`calls.ringing.listRinging`, fonction de réseau : `networkId` de `useNetwork()`, sans environnement back-office) et son DTO est traduit ici en `RingingCall` (appel `callId`, correspondant nommé par le contrat `counterpartLabel`, identité de groupe avec son fil, titre composé dans la langue de l'écran) ; fenêtre de sonnerie tenue par l'ÉTAT du serveur (plus d'heure serveur `serverNow` ni de filtre sur l'horloge du téléphone) ; réponses rapides par défaut traduites quand la personne n'en a jamais réglé (`quickReplies: null`) ; sonneries du lot W8 (`../../lib/livekit/*`) ; identifiants `Id<"calls">` ; référence `dismissedRef` jamais lue retirée. ; IC-04 : clés des réponses rapides par défaut sorties dans `quick-replies.ts` (module pur, lu aussi par la rubrique iCom des réglages).
"use client"

/**
 * useIncomingCalls — ce qui sonne, ce qu'on entend, ce qui vibre.
 *
 * Le serveur dit CE QUI sonne (`calls.ringing.listRinging`, lecture indexée) ;
 * un module pur décide COMMENT le présenter (`planIncomingCalls` : ancienneté,
 * une seule sonnerie) ; ce hook ne fait que les brancher et jouer le signal.
 *
 * ⚠️ La mémoire des appels écartés localement (`dismissed`) est nécessaire :
 * entre le refus et la propagation de la query, il s'écoule un aller-retour
 * pendant lequel le serveur continue de dire « ça sonne ». Sans elle, la
 * sonnerie repart une seconde après qu'on l'a coupée.
 */

import { api } from "@antsia/api/engine"
import type { Id } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import type { TFunction } from "i18next"
import type { FunctionReturnType } from "convex/server"
import { useCallback, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { useRingtoneAudioBlocked } from "../../lib/livekit/audio-unlock"
import { useRingtone } from "../../lib/livekit/use-ringtone"
import { useWaitingBeep } from "../../lib/livekit/use-waiting-beep"
import { useCallStore } from "../../stores/call-store"
import { planIncomingCalls, type IncomingPlan } from "./call-inbox"
import { DEFAULT_QUICK_REPLY_KEYS } from "./quick-replies"
import type { RingingCall } from "./call-types"
import { composeGroupCallTitle } from "./group-stage"
import { useRingtoneMutedPref } from "./hooks/use-ringtone-muted-pref"
import { useRingVibration } from "./use-ring-vibration"

/** Une ligne de « ce qui sonne », telle que le moteur la rend. */
type RingingCallDto = FunctionReturnType<typeof api.modules.calls.ringing.listRinging>["calls"][number]

/**
 * Le DTO du moteur, dans le vocabulaire de la surface d'appel.
 *
 * Un appel de groupe arrive avec ses premiers conviés (moi et l'appelant
 * exclus) et son effectif ; son titre se compose ICI, dans la langue de
 * l'écran — le fil d'origine, quand j'en suis membre, voyage avec lui
 * (`threadId`) pour qui veut y lire son titre.
 */
function ringingCallOf(call: RingingCallDto, t: TFunction): RingingCall {
	const caller = call.caller.label
	return {
		meetingId: call.callId,
		kind: call.kind,
		scope: "personnel",
		caller: {
			userId: call.caller.personId,
			name: caller.displayName,
			avatarUrl: caller.avatarUrl,
			handle: caller.handle,
		},
		mediaType: call.mediaType,
		ringingSince: call.ringingSince,
		group:
			call.group === null
				? null
				: {
						title: composeGroupCallTitle(
							{
								names: call.group.invitees.flatMap((invitee) =>
									invitee.label.displayName === null ? [] : [invitee.label.displayName],
								),
								// Tous les AUTRES conviés : l'effectif moins l'appelant et moi.
								total: Math.max(0, call.group.memberCount - 2),
							},
							t,
						),
						memberCount: call.group.memberCount,
						invitees: call.group.invitees.map((invitee) => ({
							userId: String(invitee.personId),
							name: invitee.label.displayName,
							avatarUrl: invitee.label.avatarUrl,
						})),
						threadId: call.threadId,
					},
	}
}

export interface IncomingCallsState extends IncomingPlan {
	quickReplies: readonly string[]
	/** Écarte un appel localement, sans attendre le serveur. */
	dismiss: (meetingId: Id<"calls">) => void
	/**
	 * L'audio des sonneries est bloqué par la politique autoplay (aucun geste
	 * utilisateur depuis l'ouverture de l'onglet) — la surface doit le DIRE
	 * pendant que ça sonne, au lieu de sonner en silence (S1).
	 */
	audioBlocked: boolean
}

export function useIncomingCalls(options: { isMobile: boolean }): IncomingCallsState {
	const { networkId } = useNetwork()
	const { t } = useTranslation("iappel")
	const { slots } = useCallStore()
	const { muted, vibrate: vibrateEnabled } = useRingtoneMutedPref()
	const audioBlocked = useRingtoneAudioBlocked()
	const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set())

	const { data } = useAuthenticatedConvexQuery(api.modules.calls.ringing.listRinging, { networkId })

	const dismiss = useCallback((meetingId: Id<"calls">) => {
		setDismissed((current) => new Set([...current, meetingId as string]))
	}, [])

	const ringing = useMemo(
		() => (data?.calls ?? []).map((call) => ringingCallOf(call, t)),
		[data, t],
	)

	const plan = useMemo(
		() =>
			planIncomingCalls({
				ringing,
				slots: slots.map((s) => ({
					meetingId: s.meetingId as string,
					status: s.status,
				})),
				now: Date.now(),
				// La fenêtre de sonnerie est tenue par l'ÉTAT côté serveur
				// (extinction programmée à l'échéance) : la liste rendue fait foi.
				// La refiltrer sur l'horloge du téléphone — qui peut être décalée
				// de plusieurs minutes — ferait disparaître un appel qui sonne
				// encore.
				ringWindowMs: Number.POSITIVE_INFINITY,
				ringtoneMuted: muted,
				isMobile: options.isMobile,
				vibrateEnabled,
				dismissed,
			}),
		[ringing, slots, muted, vibrateEnabled, options.isMobile, dismissed],
	)

	const quickReplies = useMemo<readonly string[]>(() => {
		if (data === undefined) return []
		return data.quickReplies ?? DEFAULT_QUICK_REPLY_KEYS.map((key) => t(key))
	}, [data, t])

	// Un seul son à la fois, celui de l'appel mis en avant. En « attente »
	// (je suis déjà en ligne), un signal BREF à la place de la sonnerie —
	// couvrir la voix de son interlocuteur avec une sonnerie ne s'excuse pas.
	useRingtone(
		plan.audible !== null && plan.audible.mode === "ring",
		plan.audible?.profile ?? "standard",
	)
	useWaitingBeep(
		plan.audible !== null && plan.audible.mode === "waiting"
			? plan.audible.meetingId
			: null,
	)
	useRingVibration(plan.vibrate, plan.audible?.profile ?? "standard")

	return {
		...plan,
		quickReplies,
		dismiss,
		audioBlocked,
	}
}
