// Dupliqué de socle/packages/agent-features/src/features/iappel/call-phase.ts @ ad2e7fdc2 — adaptations : branche poste élaguée (horaires de poste `outside_hours`, secrétariat `secretariat_unavailable`, trace du renvoi `routed*` et `routedCallNotice`, sujet « Le poste … ») ; phrase composée par le serveur (`serverMessage`) retirée — le moteur rend des codes, l'écran compose ; libellés et phrases traduits par i18n (`t` ajouté en dernier paramètre de `deriveCallPhase`, `endLabel`, `describeCallEnd` ; clés `iappel:callPhase.…`) ; P05 (18/10/2026) : entrée optionnelle `establishedAt` — fournie, « En communication » et le chrono partent de l'établissement RÉEL des médias (salle connectée + autre participant), et l'appel sortant ne dit « Sonnerie… » que lorsque le serveur l'a mis à sonner (avant : « Appel en préparation… ») ; absente, comportement d'origine inchangé. ; IC-04 : « hors de ses relations » dit à l'APPELANT comme un appel sans réponse (titre, phrase et rappel du manqué, jamais de message vocal) — aucune phrase « cette personne vous filtre » ; le réglage d'autrui ne se lit pas sur l'écran de fin.
/**
 * call-phase — DANS QUEL ÉTAT est l'appel, et QUE DIT-ON quand il se termine.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CE QUE CE MODULE RÉPARE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Deux défauts d'origine, tous deux invisibles au typage :
 *
 *  1. **Le chrono comptait la sonnerie.** L'écran affichait `00:00` puis
 *     égrenait les secondes AVANT que le correspondant ait décroché. La durée
 *     d'un appel se compte depuis le décrochage — c'est elle qui va dans le
 *     journal, et c'est elle qu'on relit six mois plus tard.
 *  2. **Une fin d'appel non qualifiée se referme en silence.** L'appelant
 *     concluait « ça ne marche pas » là où le serveur savait précisément quoi
 *     répondre : personne n'a décroché, l'appel a été refusé, l'appelé a
 *     demandé le silence. Une fin d'appel est une INFORMATION, pas une
 *     absence d'information.
 *
 * `reconnecting` est un état à part entière : pendant une bascule réseau,
 * l'appel n'est pas mort mais la voix ne passe plus. Le taire ferait croire à
 * un correspondant devenu muet, et raccrocher serait pire.
 *
 * Aucun import React ni LiveKit : module pur. Les phrases passent par la
 * fonction de traduction REÇUE (`t`, clés qualifiées `iappel:callPhase.…`).
 */

import type { TFunction } from "i18next"

import type {
	CallAdmissionReason,
	CallDirection,
	CallEndKind,
	CallPhase,
} from "./call-types"

/** L'état de la connexion LiveKit, réduit à ce qui change l'écran. */
export type CallConnectionState =
	| "connecting"
	| "connected"
	| "reconnecting"
	| "disconnected"

/**
 * L'appel re-queryé (`calls.lifecycle.getCall`), réduit à ce qui décide. Le
 * nom du type est celui du socle (le document `meetings`).
 */
export interface CallMeetingSnapshot {
	status?: string
	callStatus?: string
	endReason?: string | null
	answeredAt?: number | null
	declineNote?: string | null
	/**
	 * L'appelé tenait déjà une communication à l'admission (photographié par la
	 * mutation). Pendant « ringing » : tonalité « occupé » + incise « · Occupé »
	 * — le label de phase, lui, ne bouge pas (il voyage aussi vers la pilule et
	 * se confondrait avec l'écran de REFUS « Occupé »).
	 */
	calleeEngagedAtCreate?: boolean
	/**
	 * `direct` ou `group` (le `kind` de `getCall`) — un appel de GROUPE ne se
	 * met pas en attente (exclu des deux côtés, le serveur le refuse). Sans ce
	 * champ, un `on_hold` hérité d'une ligne de groupe ferait basculer toute
	 * la grille en « Mis en attente ».
	 */
	callKind?: string | null
	/**
	 * QUI tient l'appel en attente (`getCall.heldBy`, des personnes). Tableau :
	 * l'attente peut être croisée, et le REPRENEUR ne doit jamais voir un
	 * flash « votre correspondant vous a mis en attente » entre sa reprise et
	 * la propagation du document.
	 *
	 * Absent : on retombe alors sur le seul `isHeld` local (cf.
	 * `peerHoldsCall`).
	 */
	heldBy?: readonly string[] | null
}

export interface CallPhaseInput {
	direction: CallDirection
	meeting: CallMeetingSnapshot | null
	connection: CallConnectionState
	/** Le correspondant est-il dans la salle ? */
	hasRemote: boolean
	/** Le slot est-il PARQUÉ (mis en attente par moi) ? */
	isHeld?: boolean
	/** Échec de jeton ou de salle — l'appel ne partira pas. */
	hasError?: boolean
	/** Décrochage constaté localement, quand le serveur n'a pas encore suivi. */
	answeredAtLocal?: number | null
	/**
	 * MA personne (`Id<"persons">`, en chaîne) — c'est elle qui distingue
	 * « j'ai mis en attente » de « on m'a mis en attente » dans `heldBy`.
	 * Absente (pas encore connue) : `peerHoldsCall` retombe sur `isHeld`.
	 */
	myUserId?: string | null
	/**
	 * P05 — l'instant où les médias ont été RÉELLEMENT établis sur cet appareil
	 * (`call-establishment.ts` : salle connectée + un autre participant), ou
	 * `null` s'ils ne le sont pas encore.
	 *
	 * ⚠️ `undefined` (champ absent) et `null` ne disent pas la même chose :
	 * absent, l'appelant ne suit pas l'établissement et la règle d'origine
	 * s'applique (décrochage serveur) ; `null`, il le suit et l'appel n'est PAS
	 * encore établi — « Connexion… », sans chrono.
	 */
	establishedAt?: number | null
}

export interface CallPhaseResult {
	phase: CallPhase
	/**
	 * Depuis quand compter — `null` tant qu'il n'y a rien à compter.
	 * ⚠️ Jamais la date de création de l'appel : ce serait compter la sonnerie.
	 */
	timerStart: number | null
	/** L'état, en toutes lettres, tel qu'il s'affiche. */
	label: string
	/** Renseigné seulement une fois l'appel terminé. */
	endKind: CallEndKind | null
}

/**
 * Les raisons d'admission que l'ÉCRAN DE FIN sait dire — celles du moteur.
 *
 * « Hors ligne » a son écran à lui — mais côté JOURNAL il reste un « manqué » :
 * cette liste est celle de l'AFFICHAGE (`callEndKindV2`), pas celle de la
 * catégorisation (`AUTO_DECLINE_REASONS` du domaine, qui range les quatre
 * AUTRES en « refusé automatiquement »).
 */
const ADMISSION_REASONS: readonly string[] = [
	"dnd",
	"busy",
	"in_meeting",
	"offline",
	// L'appelé ne prend que ses relations (réglage personnel).
	"outside_relations",
]

/**
 * Comment l'appel s'est terminé.
 *
 * Étend les trois fins ordinaires (`missed`, `declined`, `ended`) des refus
 * AUTOMATIQUES décidés par les réglages du destinataire — ne pas déranger,
 * déjà en ligne, en réunion, hors de ses relations. Ces appels-là n'ont jamais
 * sonné : les afficher « pas de réponse » accuserait quelqu'un de ne pas avoir
 * décroché.
 */
export function callEndKindV2(
	meeting: CallMeetingSnapshot | null | undefined,
): CallEndKind | null {
	if (!meeting) return null
	if (meeting.status !== "ended" && meeting.status !== "cancelled") return null

	const reason = meeting.endReason ?? null
	if (reason !== null && ADMISSION_REASONS.includes(reason)) {
		return reason as CallEndKind
	}
	if (reason === "error") return "error"
	if (reason === "cancelled") return "cancelled"
	if (meeting.callStatus === "missed") return "missed"
	if (meeting.callStatus === "declined") return "declined"
	if (reason === "timeout") return "missed"
	// `rejected` est l'alias historique de `declined`, antérieur à
	// l'unification du schéma du socle. Le moteur ne l'émet pas ; le traiter à
	// part ne coûte rien, et le laisser tomber en « fin normale » rendrait muet
	// un refus.
	if (reason === "declined" || reason === "rejected") return "declined"
	return "ended"
}

/**
 * LE CORRESPONDANT M'A-T-IL MIS EN ATTENTE ?
 *
 * Jusqu'au 2026-09-22, cet état n'existait pas : `deriveCallPhase` ne lisait
 * que le `isHeld` LOCAL et déduisait « En communication » de la présence du
 * correspondant dans la salle — or celui qui parque RESTE dans la salle. Côté
 * tenu, l'écran affirmait donc une conversation là où plus personne
 * n'entendait rien.
 *
 * Trois conditions, chacune pour une raison :
 *
 *  · `callStatus === "on_hold"` — l'attente est tenue par le SERVEUR, pas par
 *    un second canal (le jeton LiveKit n'a pas `canUpdateOwnMetadata`, une
 *    métadonnée de salle dériverait) ;
 *  · l'appel n'est pas un GROUPE — un appel de groupe ne se met pas en
 *    attente, des deux côtés ;
 *  · quelqu'un d'AUTRE que moi tient la ligne. Le tableau `heldBy` est ce qui
 *    évite le flash au retour : à ma reprise, je sors du tableau alors que le
 *    correspondant y reste — sans lui, `on_hold` se lirait « on m'a mis en
 *    attente » pendant un rendu.
 *
 * Repli documenté : `heldBy` absent ⇒ un `on_hold` que je n'ai pas posé
 * moi-même est, par construction, celui de l'autre.
 */
export function peerHoldsCall(input: {
	meeting: CallMeetingSnapshot | null
	myUserId?: string | null
	isHeld?: boolean
}): boolean {
	const meeting = input.meeting
	if (!meeting) return false
	if (meeting.callStatus !== "on_hold") return false
	if (meeting.callKind === "group") return false
	const heldBy = meeting.heldBy
	if (heldBy === null || heldBy === undefined) return input.isHeld !== true
	return heldBy.some((id) => id !== input.myUserId)
}

export function deriveCallPhase(input: CallPhaseInput, t: TFunction): CallPhaseResult {
	const endKind = callEndKindV2(input.meeting)
	const answeredAt = input.meeting?.answeredAt ?? input.answeredAtLocal ?? null
	/**
	 * P05 — l'appelant SUIT-il l'établissement réel ? (`establishedAt` fourni,
	 * même `null`). Alors la durée part de lui, jamais du décrochage serveur :
	 * entre l'acceptation et l'arrivée des médias, il peut s'écouler plusieurs
	 * secondes pendant lesquelles personne ne s'entend.
	 */
	const tracksEstablishment = input.establishedAt !== undefined
	const establishedAt = input.establishedAt ?? null
	const elapsedFrom = tracksEstablishment ? establishedAt : answeredAt

	if (endKind !== null) {
		return {
			phase: "ended",
			timerStart: null,
			label: endLabel(endKind, t),
			endKind,
		}
	}

	if (input.hasError === true || input.connection === "disconnected") {
		return {
			phase: "failed",
			timerStart: null,
			label: t("iappel:callPhase.phase.failed"),
			endKind: null,
		}
	}

	if (input.connection === "reconnecting") {
		return {
			phase: "reconnecting",
			// Le chrono NE S'ARRÊTE PAS pendant une reconnexion : l'appel dure,
			// c'est le réseau qui hoquette. Le remettre à zéro donnerait
			// l'impression d'un nouvel appel.
			timerStart: elapsedFrom,
			label: t("iappel:callPhase.phase.reconnecting"),
			endKind: null,
		}
	}

	if (input.isHeld === true) {
		return { phase: "held", timerStart: elapsedFrom, label: t("iappel:callPhase.phase.held"), endKind: null }
	}

	// ⚠️ APRÈS ma propre attente, et c'est délibéré : au moment où je reprends,
	// mon slot repasse `active` avant que le document ne l'ait dit. L'ordre
	// inverse afficherait « Mis en attente » le temps d'un aller-retour.
	if (
		peerHoldsCall({
			meeting: input.meeting,
			myUserId: input.myUserId,
			isHeld: input.isHeld,
		})
	) {
		return {
			phase: "peer_held",
			// Le chrono NE S'ARRÊTE PAS : l'appel dure, même suspendu — c'est
			// cette durée-là qui ira au journal.
			timerStart: elapsedFrom,
			label: t("iappel:callPhase.phase.peerHeld"),
			endKind: null,
		}
	}

	const callStatus = input.meeting?.callStatus

	if (tracksEstablishment) {
		// « Connecté » seulement quand les médias passent — jamais sur la seule
		// foi d'un statut serveur qui précède l'arrivée du correspondant.
		if (establishedAt !== null && input.connection === "connected") {
			return {
				phase: "active",
				timerStart: establishedAt,
				label: t("iappel:callPhase.phase.active"),
				endKind: null,
			}
		}
		if (input.direction === "outgoing" && callStatus === "ringing") {
			return { phase: "ringing", timerStart: null, label: t("iappel:callPhase.phase.ringing"), endKind: null }
		}
		// Composé mais pas encore mis à sonner (`initiating`, ou document pas
		// encore lu) : le téléphone d'en face ne sonne PAS encore — dire
		// « Sonnerie… » serait un statut fabriqué.
		if (input.direction === "outgoing" && (callStatus === undefined || callStatus === "initiating")) {
			return { phase: "connecting", timerStart: null, label: t("iappel:callPhase.phase.preparing"), endKind: null }
		}
		return { phase: "connecting", timerStart: null, label: t("iappel:callPhase.phase.connecting"), endKind: null }
	}
	const connected = callStatus === "connected" || input.hasRemote
	if (connected && input.connection === "connected") {
		return {
			phase: "active",
			timerStart: answeredAt,
			label: t("iappel:callPhase.phase.active"),
			endKind: null,
		}
	}

	// Sonne-t-il vraiment ? Côté APPELANT, oui dès que le serveur l'a inscrit
	// (`initiating`/`ringing`, ou statut pas encore lu). Côté APPELÉ,
	// « sonnerie » n'a pas de sens une fois qu'on a décroché : on attend la
	// salle, ce qui est un établissement de connexion.
	const awaiting =
		callStatus === undefined ||
		callStatus === "initiating" ||
		callStatus === "ringing"
	if (input.direction === "outgoing" && awaiting) {
		return { phase: "ringing", timerStart: null, label: t("iappel:callPhase.phase.ringing"), endKind: null }
	}

	return { phase: "connecting", timerStart: null, label: t("iappel:callPhase.phase.connecting"), endKind: null }
}

/** L'état d'un appel terminé, en une ligne — le titre de l'écran de fin. */
export function endLabel(kind: CallEndKind, t: TFunction): string {
	switch (kind) {
		case "missed":
			return t("iappel:callPhase.end.missed")
		case "declined":
			return t("iappel:callPhase.end.declined")
		case "busy":
			return t("iappel:callPhase.end.busy")
		case "dnd":
			return t("iappel:callPhase.end.dnd")
		case "in_meeting":
			return t("iappel:callPhase.end.inMeeting")
		case "offline":
			return t("iappel:callPhase.end.offline")
		// IC-04 : l'appelant lit un appel SANS RÉPONSE — jamais le réglage de l'appelé.
		case "outside_relations":
			return t("iappel:callPhase.end.missed")
		case "cancelled":
			return t("iappel:callPhase.end.cancelled")
		case "error":
			return t("iappel:callPhase.end.error")
		default:
			return t("iappel:callPhase.end.ended")
	}
}

export interface CallEndCopyInput {
	/** Nom du correspondant, quand on le connaît. */
	peerName?: string | null
	/** Note laissée par le destinataire en refusant. */
	note?: string | null
	/** Durée de la communication, pour une fin normale. */
	durationLabel?: string | null
	/** Le destinataire accepte-t-il un message vocal ? */
	voicemailOffered?: boolean
}

export interface CallEndCopy {
	title: string
	body: string
	/** Proposer de rappeler ? */
	canRetry: boolean
	/** Proposer de laisser un message vocal ? */
	canLeaveVoicemail: boolean
	/** Proposer d'écrire ? (presque toujours : c'est le repli universel) */
	canWrite: boolean
}

/**
 * Ce que l'écran de fin RACONTE.
 *
 * Deux règles de fond :
 *  · **on ne propose pas de rappeler quelqu'un qui a demandé le silence.**
 *    Sous « ne pas déranger », le bouton « Réessayer » transforme l'outil en
 *    moyen d'insister ; il n'est pas rendu ;
 *  · **on ne devine pas les réglages d'autrui.** Le moteur rend une raison,
 *    jamais une phrase ni une heure de fin de silence : la durée d'un « ne pas
 *    déranger » est un réglage personnel, elle n'appartient pas à l'appelant.
 */
export function describeCallEnd(
	kind: CallEndKind,
	input: CallEndCopyInput,
	t: TFunction,
): CallEndCopy {
	const who = input.peerName?.trim()
	const subject = who !== undefined && who.length > 0 ? who : t("iappel:callPhase.copy.subjectFallback")

	switch (kind) {
		case "missed":
			return {
				title: endLabel(kind, t),
				body: t("iappel:callPhase.copy.missed", { subject }),
				canRetry: true,
				canLeaveVoicemail: input.voicemailOffered === true,
				canWrite: true,
			}
		case "declined": {
			const note = input.note?.trim()
			return {
				title: endLabel(kind, t),
				body:
					note !== undefined && note.length > 0
						? t("iappel:callPhase.copy.declinedNote", { note })
						: t("iappel:callPhase.copy.declined", { subject }),
				canRetry: false,
				canLeaveVoicemail: input.voicemailOffered === true,
				canWrite: true,
			}
		}
		case "busy":
			return {
				title: endLabel(kind, t),
				body: t("iappel:callPhase.copy.busy", { subject }),
				canRetry: true,
				canLeaveVoicemail: input.voicemailOffered === true,
				canWrite: true,
			}
		case "dnd":
			return {
				title: endLabel(kind, t),
				// Aucune heure de fin : la durée d'un « ne pas déranger » est un
				// réglage personnel, elle n'appartient pas à l'appelant.
				body: t("iappel:callPhase.copy.dnd", { subject }),
				canRetry: false,
				canLeaveVoicemail: input.voicemailOffered === true,
				canWrite: true,
			}
		case "in_meeting":
			return {
				title: endLabel(kind, t),
				body: t("iappel:callPhase.copy.inMeeting", { subject }),
				canRetry: false,
				canLeaveVoicemail: input.voicemailOffered === true,
				canWrite: true,
			}
		case "offline":
			return {
				title: endLabel(kind, t),
				body: t("iappel:callPhase.copy.offline", { subject }),
				// Rappeler quelqu'un d'absent n'insiste auprès de personne — et il
				// peut revenir d'une minute à l'autre.
				canRetry: true,
				canLeaveVoicemail: input.voicemailOffered === true,
				canWrite: true,
			}
		case "outside_relations":
			// IC-04 (décision du propriétaire du 9/11/2026) : par défaut, seules
			// les relations font sonner un téléphone ; l'appel d'une personne non
			// reliée est inscrit au journal de l'appelé. L'APPELANT lit le même
			// écran qu'un appel sans réponse — même titre, même phrase, même
			// rappel — : aucune phrase « cette personne ne prend que ses
			// relations », qui dirait à qui le demande le réglage d'autrui.
			return {
				title: endLabel(kind, t),
				body: t("iappel:callPhase.copy.missed", { subject }),
				canRetry: true,
				// Jamais de message vocal : le serveur le refuse (décision 6d du
				// socle) — un message laissé par une personne non reliée serait
				// le même appel sous un autre nom, et ferait sonner la cloche.
				canLeaveVoicemail: false,
				canWrite: true,
			}
		case "error":
			return {
				title: endLabel(kind, t),
				body: t("iappel:callPhase.copy.error"),
				canRetry: true,
				canLeaveVoicemail: false,
				canWrite: true,
			}
		case "cancelled":
			return {
				title: endLabel(kind, t),
				body: t("iappel:callPhase.copy.cancelled"),
				canRetry: true,
				canLeaveVoicemail: false,
				canWrite: true,
			}
		default: {
			const duration = input.durationLabel?.trim()
			return {
				title: endLabel(kind, t),
				body:
					duration !== undefined && duration.length > 0
						? t("iappel:callPhase.copy.duration", { duration })
						: "",
				canRetry: false,
				canLeaveVoicemail: false,
				canWrite: false,
			}
		}
	}
}

/** Un refus AUTOMATIQUE se reconnaît à sa raison — utile aux journaux. */
export function isAdmissionRefusal(
	kind: CallEndKind | null,
): kind is CallAdmissionReason {
	return kind !== null && ADMISSION_REASONS.includes(kind)
}

/**
 * L'écran de fin à ouvrir pour un refus d'admission, depuis la `reason` que
 * la mutation retourne. LE point de conversion — les surfaces qui écrivaient
 * `appel.reason ?? "declined"` cassaient silencieusement dès qu'une raison
 * nouvelle arrivait du serveur (l'union TypeScript inférée s'élargit, pas
 * `CallEndKind`). Ici, une raison inconnue tombe sur « refusé » : le plus
 * neutre des replis, jamais un écran menteur.
 */
export function refusalEndKind(
	reason: string | null | undefined,
): CallEndKind {
	if (reason !== null && reason !== undefined && ADMISSION_REASONS.includes(reason)) {
		return reason as CallEndKind
	}
	return "declined"
}
