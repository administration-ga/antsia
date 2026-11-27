// Dupliqué de socle/packages/agent-features/src/features/iappel/conference-launch-store.ts @ ad2e7fdc2 — adaptations : branche PERSONNELLE seule — refus de poste retirés (`other_org`, `poste_unreachable` : organisation de l'appel, organisation active, carte de poste) ; `planConferenceLaunch` ne lit plus que la portée et la présence d'un réseau ; phrase de refus traduite par i18n (`t` ajouté en dernier paramètre de `conferenceLaunchRefusalMessage`, clé `iappel:conferenceLaunchStore.…`) ; personnes du moteur (`Id<"persons">`, champ `userIds` gardé) ; le magasin reste — la conférence (direct) et l'hôte qui consomme la demande arrivent au lot `live`.
"use client"

/**
 * conference-launch-store — « ouvrir la création d'une conférence », sans URL
 * et sans prop à faire descendre (ADR-0149, fiche « Appels de groupe » §6.3).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POURQUOI UN MAGASIN, ET PAS UN ÉTAT LOCAL
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * « Lancer une conférence » part de TROIS endroits qui ne se connaissent pas :
 * la carte T1 d'un fil trop grand, la carte T2 du sélecteur d'invités, la
 * ligne T3 de la scène d'appel. La conférence du réseau est un DIRECT (lot
 * `live`) — et son dialogue doit survivre à ce qui l'a demandé : la carte T2
 * se ferme, le sélecteur se referme, l'appel se RÉDUIT en bande (ADR-0148).
 * Un état local à l'un de ces écrans démonterait le dialogue avec lui.
 *
 * La demande est donc posée ici, et CONSOMMÉE par un hôte monté une seule fois
 * au niveau de la couche d'appel, que rien ne démonte au changement de page.
 * ⚠️ Cet hôte arrive avec le lot `live` : d'ici là, la demande est posée et
 * attend.
 *
 * La demande se consomme, et elle porte un compteur — demander deux fois la
 * même conférence doit rouvrir le formulaire, pas être avalé comme un
 * doublon.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LES PERSONNES VOYAGENT (ADR-0150, arbitrage I)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Jusqu'au 2026-09-14, la demande ne portait que le titre : la conférence du
 * réseau était une AUDIENCE, sans liste nominative, et les trois déclencheurs
 * perdaient les personnes qu'ils venaient pourtant de nommer. Depuis ADR-0150
 * un direct a des INVITÉS : la demande porte donc aussi les personnes à
 * convier (`userIds`, des personnes) et, quand le geste part d'un fil de
 * groupe, le fil lui-même (`sourceThreadId`) — c'est lui qui prouve au serveur
 * la co-appartenance d'un invité qui n'est pas une connexion de l'hôte. Ce que
 * le dialogue en fait (audience, rôles de scène) se décide ailleurs, avec le
 * direct.
 *
 * Module PUR : la logique n'appelle aucun hook ; seul `useConferenceLaunchRequest`
 * branche React, par `useSyncExternalStore`. Testé en `node`.
 */

import type { TFunction } from "i18next"
import { useSyncExternalStore } from "react"

import type { CallParticipantState, CallScope } from "./call-types"

/**
 * Pourquoi « Lancer une conférence » ne peut pas aboutir ICI.
 *
 *  · `personal_elsewhere` — l'écran n'est dans AUCUN réseau (hors
 *    `NetworkProvider`) : le direct du réseau serait créé (et annoncé), puis
 *    la navigation vers sa page tomberait dans le vide.
 *
 * (Les deux refus du socle propres au poste — conférence d'une autre
 * administration, carte de poste absente — n'ont pas d'objet dans le moteur.)
 */
export type ConferenceLaunchRefusal = "personal_elsewhere"

export type ConferenceLaunchPlan =
	| { ok: true }
	| { ok: false; reason: ConferenceLaunchRefusal }

/**
 * La conférence peut-elle s'ouvrir d'ici ? Décision PURE, partagée par l'hôte
 * d'appel (qui ne propose pas un geste voué à l'échec) et par le geste lui-même
 * (qui refuse en le disant, avant de réduire l'appel).
 */
export function planConferenceLaunch(input: {
	scope: CallScope
	/**
	 * L'écran est-il dans un réseau (`useOptionalNetwork()` non nul : l'espace
	 * personnel est ici) ? Le nom est celui du socle (le foyer).
	 */
	personalSpaceHere: boolean
}): ConferenceLaunchPlan {
	if (!input.personalSpaceHere) return { ok: false, reason: "personal_elsewhere" }
	return { ok: true }
}

/**
 * La phrase du refus — jamais un bouton qui ne fait rien. L'hôte retire le
 * lien de la ligne T3 quand il ne mène nulle part : la phrase ne sert qu'en
 * défense.
 */
export function conferenceLaunchRefusalMessage(reason: ConferenceLaunchRefusal, t: TFunction): string {
	switch (reason) {
		case "personal_elsewhere":
			return t("iappel:conferenceLaunchStore.refusal.personalElsewhere")
	}
}

/**
 * Les états d'un convié d'appel qui le font VOYAGER vers la conférence (T3).
 *
 * Ceux qui sont LÀ (l'hôte, les décrochés) et ceux qu'on est en train de
 * joindre (ça sonne). Pas les autres : proposer comme invités d'une conférence
 * des personnes qui viennent de raccrocher, de refuser, de manquer l'appel ou
 * que l'admission a écartées reconvoquerait précisément ceux qui ont dit non —
 * et chacun d'eux recevrait une cloche « vous invite à la conférence ».
 */
export const CONFERENCE_CARRIED_CALL_STATES: readonly CallParticipantState[] = [
	"host",
	"connected",
	"ringing",
]

/** Ce qu'il faut savoir d'un convié pour décider s'il voyage. */
export interface ConferenceCallParticipant {
	/** La personne (`Id<"persons">`, en chaîne) — le nom du champ est celui du socle. */
	userId: string
	isMe: boolean
	state: CallParticipantState
}

/**
 * Les personnes d'un appel de groupe à proposer comme invités de la
 * conférence lancée depuis la ligne T3 : hôte, en ligne ou qui sonnent — moi
 * exclu, sans doublon, dans l'ordre de la grille.
 */
export function conferenceInviteesFromCall(
	participants: readonly ConferenceCallParticipant[],
): string[] {
	const seen = new Set<string>()
	const ids: string[] = []
	for (const participant of participants) {
		if (participant.isMe) continue
		if (!CONFERENCE_CARRIED_CALL_STATES.includes(participant.state)) continue
		const id = String(participant.userId)
		if (id.length === 0 || seen.has(id)) continue
		seen.add(id)
		ids.push(id)
	}
	return ids
}

/**
 * Ce qu'on sait AFFICHER d'une personne de la demande. Le déclencheur l'a déjà
 * montré à l'usager (membres du fil, conviés de l'appel) : le transmettre évite
 * au dialogue des lignes « Personne invitée » indistinctes. Un AFFICHAGE
 * seulement — le serveur rejuge toujours chaque invité.
 */
export interface ConferenceLaunchPerson {
	displayName: string
	handle: string | null
	avatarUrl: string | null
}

export interface ConferenceLaunchState {
	quickSetup?: boolean
	/**
	 * Le titre PROPOSÉ au dialogue (le nom du fil), ou `null` — l'usager le
	 * saisit alors. Une proposition, jamais une valeur imposée : le champ reste
	 * modifiable.
	 */
	title: string | null
	/**
	 * Les personnes à convier (moi exclu, `Id<"persons">` en chaîne), sans
	 * doublon — vide quand le geste n'en nomme aucune. Des identifiants
	 * seulement : le serveur rejuge chacun (ADR-0150, éligibilité B), le client
	 * ne décide rien.
	 */
	userIds: readonly string[]
	/**
	 * Le fil de groupe d'où part le geste, ou `null` (appel sans fil, ligne T3
	 * sans fil connu). Il ne donne aucun droit : il désigne le fil dont le
	 * serveur vérifie la co-appartenance de l'hôte ET de l'invité.
	 */
	sourceThreadId: string | null
	/**
	 * Les noms connus des personnes RETENUES (`userIds`), par identifiant — vide
	 * quand le déclencheur n'en transmet pas. Figée, comme la liste.
	 */
	people: Readonly<Record<string, ConferenceLaunchPerson>>
	/** Incrémenté à chaque demande : deux demandes identiques restent deux. */
	seq: number
}

let current: ConferenceLaunchState | null = null
let seq = 0
const listeners = new Set<() => void>()

function notify(): void {
	for (const listener of listeners) listener()
}

export function subscribeConferenceLaunch(listener: () => void): () => void {
	listeners.add(listener)
	return () => {
		listeners.delete(listener)
	}
}

/** La demande en attente, ou `null`. Lecture seule — pour l'hôte et les tests. */
export function getConferenceLaunchRequest(): ConferenceLaunchState | null {
	return current
}

/** Rien au rendu serveur : une demande est toujours un geste du navigateur. */
function getServerSnapshot(): ConferenceLaunchState | null {
	return null
}

/**
 * Demander le dialogue de création d'une conférence.
 *
 * Un titre vide ou fait d'espaces n'est pas un titre : il devient `null`, et
 * le champ s'ouvre vide plutôt que pré-rempli d'un blanc qui bloquerait
 * « Créer la conférence » sans rien montrer.
 *
 * Les personnes sont nettoyées ici, une fois pour les trois déclencheurs :
 * identifiants vides écartés, doublons retirés (un même membre peut arriver
 * deux fois d'une liste qui a vieilli), ordre conservé. Un fil source vide
 * vaut `null` — un identifiant blanc n'est pas un fil. `{ title }` seul reste
 * une demande valide : aucune personne, aucun fil.
 */
export function requestConferenceLaunch({
	quickSetup,
	title,
	userIds,
	sourceThreadId,
	people,
}: {
	quickSetup?: boolean
	title?: string | null
	userIds?: readonly string[] | null
	sourceThreadId?: string | null
	/** Les noms que le déclencheur connaît — facultatif, affichage seulement. */
	people?: readonly ConferenceLaunchPersonInput[] | null
}): void {
	const trimmed = typeof title === "string" ? title.trim() : ""
	const thread = typeof sourceThreadId === "string" ? sourceThreadId.trim() : ""
	const ids = uniqueIds(userIds ?? [])
	seq += 1
	current = {
		...(quickSetup ? { quickSetup: true } : {}),
		title: trimmed.length > 0 ? trimmed : null,
		userIds: Object.freeze(ids),
		sourceThreadId: thread.length > 0 ? thread : null,
		people: Object.freeze(knownPeople(ids, people ?? [])),
		seq,
	}
	notify()
}

/** Une personne telle qu'un déclencheur la décrit — champs bruts, nettoyés ici. */
export interface ConferenceLaunchPersonInput {
	/** La personne (`Id<"persons">`, en chaîne) — le nom du champ est celui du socle. */
	userId: string
	displayName?: string | null
	handle?: string | null
	avatarUrl?: string | null
}

/**
 * Les noms des SEULES personnes retenues : un nom vide n'est pas un nom, et une
 * personne absente de `userIds` n'a rien à faire dans la table.
 */
function knownPeople(
	ids: readonly string[],
	people: readonly ConferenceLaunchPersonInput[],
): Record<string, ConferenceLaunchPerson> {
	const retained = new Set(ids)
	const out: Record<string, ConferenceLaunchPerson> = {}
	for (const person of people) {
		if (typeof person?.userId !== "string") continue
		const id = person.userId.trim()
		if (!retained.has(id) || out[id] !== undefined) continue
		const displayName =
			typeof person.displayName === "string" ? person.displayName.trim() : ""
		if (displayName.length === 0) continue
		const handle = typeof person.handle === "string" ? person.handle.trim() : ""
		out[id] = {
			displayName,
			handle: handle.length > 0 ? handle : null,
			avatarUrl: typeof person.avatarUrl === "string" ? person.avatarUrl : null,
		}
	}
	return out
}

function uniqueIds(ids: readonly string[]): string[] {
	const seen = new Set<string>()
	const out: string[] = []
	for (const raw of ids) {
		if (typeof raw !== "string") continue
		const id = raw.trim()
		if (id.length === 0 || seen.has(id)) continue
		seen.add(id)
		out.push(id)
	}
	return out
}

/** Prise en compte (dialogue fermé ou conférence créée) : ne se rejoue pas. */
export function consumeConferenceLaunch(): void {
	if (current === null) return
	current = null
	notify()
}

export function useConferenceLaunchRequest(): ConferenceLaunchState | null {
	return useSyncExternalStore(
		subscribeConferenceLaunch,
		getConferenceLaunchRequest,
		getServerSnapshot,
	)
}
