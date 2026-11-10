// Dupliqué de socle/packages/agent-features/src/features/iappel/call-journal.ts @ ad2e7fdc2 — adaptations : ligne d'historique = le DTO du moteur (`calls.history.listCallHistory`, type tiré de l'API) au lieu de la ligne `meetings` reconvertie champ à champ ; le CLASSEMENT (qui a composé, refus automatique, manqué, ticket de groupe) est fait par le serveur avec la règle pure du domaine (`categorizeCall` de `@antsia/social-domain/callJournal`) — l'écran le relit et revérifie seulement qu'un « refus automatique » porte bien une raison de réglage (`isAutoDeclineReason`) ; environnement back-office (`callerEnvironment`, `callSideOf` à trois termes) retiré ; branche poste élaguée (portée, fonction, administration, renvoi au secrétariat, appel prioritaire ADR-0217) ; correspondant nommé par le contrat `counterpartLabel` (appelant d'un appel de groupe compris) ; `groupCallJournal` sans identité de lecteur (le serveur dit `createdByMe`) ; CC-5 : origine contextuelle conservée (`contextualThreadId`), rappel par la conversation.
/**
 * call-journal — le JOURNAL des appels (écran « iAppel » : appels récents et
 * appels manqués).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LE DÉFAUT QUE CE MODULE CORRIGE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * L'ancien classement ne regardait pas QUI avait composé le numéro : il
 * classait « entrant » les seuls appels arrivés par une file, et tout le reste
 * passait pour « sortant ». Un appel personnel REÇU — un ami qui appelle —
 * s'affichait donc comme si on l'avait soi-même passé. Le seul critère juste
 * est « qui a composé », rien d'autre — et c'est désormais le SERVEUR qui
 * l'applique (`createdByMe`, `categorizeCall` du domaine), parce que lui seul
 * lit aussi MON ticket d'un appel de groupe (manqué, refusé, écarté par mes
 * réglages).
 *
 * Deux autres pièges, tenus de bout en bout :
 *
 *  · un refus AUTOMATIQUE (ne pas déranger, occupé, en réunion, hors de mes
 *    relations) n'est ni un refus humain ni un appel manqué — c'est un réglage
 *    du destinataire qui a agi avant même que ça sonne pour lui. Le confondre
 *    avec « manqué » pousserait à rappeler quelqu'un qui n'a jamais rien vu ;
 *  · la durée d'un appel jamais décroché n'est PAS `endedAt - startedAt` (ça
 *    compterait la sonnerie comme de la conversation) : sans décrochage, il
 *    n'y a pas de durée, il y a `null` (le serveur la calcule ainsi).
 *
 * Aucun import React ni runtime Convex : module pur, testable en
 * environnement `node`. Sa seule dépendance d'exécution est la règle PURE
 * partagée avec le serveur (`isAutoDeclineReason`).
 */

import type { api } from "@antsia/api/engine"
import type { CounterpartLabel } from "@antsia/social-contracts/counterpart"
import { isAutoDeclineReason, type CallCategory } from "@antsia/social-domain/callJournal"
import type { FunctionReturnType } from "convex/server"

import type { CallScope } from "./call-types"

/** Comment un appel se range dans le journal — les catégories du domaine. */
export type CallJournalCategory = CallCategory

/**
 * Une ligne d'historique, telle qu'elle vient du serveur
 * (`calls.history.listCallHistory`) : catégorie, raison, durée et
 * correspondant déjà établis pour celui qui lit.
 */
export type CallHistoryRow = FunctionReturnType<
	typeof api.modules.calls.history.listCallHistory
>["calls"][number]

/** Une ligne de journal, prête pour l'écran. */
export interface JournalEntry {
	/** L'appel (`Id<"calls">`) — le nom du champ est celui du socle. */
	meetingId: string
	/** Origine commerciale conservée ; jamais un destinataire de fil personnel. */
	commercialThreadId?: CallHistoryRow["commercialThreadId"]
	/**
	 * CC-4/CC-5 : la conversation CONTEXTUELLE d'où part l'appel — on la rappelle PAR elle (accord et
	 * cible relus), jamais par l'appel personnel (`callMember`) ni par un fil personnel.
	 */
	contextualThreadId?: CallHistoryRow["contextualThreadId"]
	category: CallJournalCategory
	reason: string | null
	/** `direct` ou `group` : un appel de groupe se lit par son appelant. */
	kind: "direct" | "group"
	/** La personne à rappeler ou à qui écrire — `null` quand il n'y en a pas une seule. */
	counterpartUserId: string | null
	/**
	 * Comment la nommer (contrat `counterpartLabel`). `displayName: null` : le
	 * nom neutre, que l'écran traduit.
	 */
	counterpartLabel: CounterpartLabel | null
	direction: "incoming" | "outgoing"
	at: number
	durationMs: number | null
	mediaType: "audio" | "video"
	scope: CallScope
	note: string | null
}

/**
 * La catégorie d'une ligne, et sa raison.
 *
 * Le serveur a classé (`categorizeCall`, ou mon ticket pour un appel de
 * groupe) ; l'écran ne refait pas son travail, mais il refuse d'afficher un
 * « refus automatique » sans raison de RÉGLAGE : `offline` n'en est pas une
 * — un appelé simplement absent a manqué l'appel, le ranger en « refusé
 * automatiquement » serait une accusation à la place d'une absence.
 */
export function categorizeCallRow(
	row: Pick<CallHistoryRow, "category" | "reason">,
): { category: CallJournalCategory; reason: string | null } {
	if (row.category === "auto_declined") {
		return isAutoDeclineReason(row.reason)
			? { category: "auto_declined", reason: row.reason }
			: { category: "missed", reason: null }
	}
	return { category: row.category, reason: null }
}

/**
 * QUI rappeler, ou à qui écrire.
 *
 *  · un tête-à-tête : l'autre bout du fil (`counterpart`, que l'appel soit
 *    entrant ou sortant) ;
 *  · un appel de groupe REÇU : celui qui l'a lancé ;
 *  · un appel de groupe que J'AI lancé : personne en particulier — on ne
 *    « rappelle » pas un groupe d'un seul geste.
 */
function counterpartOf(
	row: CallHistoryRow,
): { personId: string; label: CounterpartLabel } | null {
	if (row.counterpart !== null) return { personId: String(row.counterpart.personId), label: row.counterpart.label }
	if (row.group !== null && !row.createdByMe) {
		return { personId: String(row.group.caller.personId), label: row.group.caller.label }
	}
	return null
}

/** Construit la ligne de journal complète à partir d'une ligne serveur. */
export function journalEntryOf(row: CallHistoryRow): JournalEntry {
	const { category, reason } = categorizeCallRow(row)
	const counterpart = counterpartOf(row)
	return {
		meetingId: String(row.callId),
		...(row.commercialThreadId === undefined ? {} : { commercialThreadId: row.commercialThreadId }),
		...(row.contextualThreadId === undefined ? {} : { contextualThreadId: row.contextualThreadId }),
		category,
		reason,
		kind: row.kind,
		counterpartUserId: counterpart?.personId ?? null,
		counterpartLabel: counterpart?.label ?? null,
		direction: row.createdByMe ? "outgoing" : "incoming",
		at: row.startedAt,
		// Sans décrochage, pas de conversation : le serveur rend `null`, jamais
		// une durée qui compterait la sonnerie.
		durationMs: row.durationMs,
		mediaType: row.mediaType,
		scope: "personnel",
		note: row.declineNote,
	}
}

/**
 * Trie l'historique et en extrait les appels manqués À TRAITER.
 *
 * ⚠️ Pas de paramètre `now` : le filtrage par date de dernière consultation
 * est un geste SERVEUR (lui seul connaît la marque de lecture), et le refaire
 * ici sur un sous-ensemble déjà chargé donnerait un compte faux. Un paramètre
 * inutilisé aurait laissé croire le contraire à qui lit la signature.
 */
export function groupCallJournal(rows: readonly CallHistoryRow[]): {
	missed: JournalEntry[]
	all: JournalEntry[]
	unseenMissedCount: number
	lastMissedAt: number | null
} {
	const all = rows.map((row) => journalEntryOf(row)).sort((a, b) => b.at - a.at)

	// Un appel SORTANT resté sans réponse n'est pas un manqué à traiter : je
	// suis celui qui n'a pas eu de réponse, pas celui qui doit rappeler.
	const missed = all.filter(
		(entry) =>
			(entry.category === "missed" || entry.category === "auto_declined") &&
			entry.direction === "incoming",
	)

	return {
		missed,
		all,
		unseenMissedCount: missed.length,
		// `all` — donc `missed` qui en dérive — est trié décroissant : le
		// premier élément est le plus récent.
		lastMissedAt: missed[0]?.at ?? null,
	}
}

/** ADR-0036 : la famille d'une ligne — un appel de boutique ou de mise en relation est pro. */
export type CallJournalFamily = "personnel" | "pro"

export function callJournalFamilyOf(entry: Pick<JournalEntry, "commercialThreadId" | "contextualThreadId">): CallJournalFamily {
	return entry.commercialThreadId !== undefined || entry.contextualThreadId !== undefined ? "pro" : "personnel"
}

/** Les lignes d'une famille ; sans famille demandée, le journal entier (messagerie unique). */
export function journalOfFamily<E extends Pick<JournalEntry, "commercialThreadId" | "contextualThreadId">>(entries: readonly E[], family: CallJournalFamily | undefined): readonly E[] {
	return family === undefined ? entries : entries.filter((entry) => callJournalFamilyOf(entry) === family)
}

