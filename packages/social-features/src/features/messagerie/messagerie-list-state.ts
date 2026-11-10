/**
 * messagerie-list-state — ce que la LISTE retrouve au retour (P05, 18/10/2026).
 *
 * Au téléphone, ouvrir une conversation REMPLACE la liste (pleine page) ; au
 * bureau, l'aiguillage remonte la page à chaque changement d'adresse. Sans
 * mémoire, revenir de la conversation rendait une liste vierge : recherche
 * effacée, filtre perdu, liste remontée tout en haut. La spécification 05 §1
 * demande l'inverse : « retour qui conserve recherche et position ».
 *
 * La mémoire est un singleton de MODULE, et seulement en mémoire : la frappe
 * d'une recherche est une saisie de la personne ; elle n'a rien à faire dans un
 * stockage qu'une session suivante pourrait relire. Un rechargement complet (la
 * déconnexion en est un) l'efface.
 *
 * Une portée par réseau et par pose (`stateScope`) : la liste du téléphone et
 * celle du bureau ne se marchent pas dessus.
 */

import type { ConversationFilterId, IcomViewId } from "./icom-views"

export interface ListUiState {
	/** La recherche en cours, telle que la personne l'a tapée. */
	query: string
	filter: ConversationFilterId
	/** La position de défilement de la liste, en pixels. */
	scrollTop: number
	view: IcomViewId
	/** Profondeur réellement chargée, sans aucune copie des conversations. */
	loadedThreadCount: number
	/** Référence de ligne uniquement, pour rendre le focus au retour du détail. */
	returnFocusKey: string | null
}

const DEFAULT_STATE: ListUiState = Object.freeze({ query: "", filter: "toutes" as const, scrollTop: 0, view: "conversations" as const, loadedThreadCount: 0, returnFocusKey: null })

const states = new Map<string, ListUiState>()
let sessionOwner: string | null = null

/** La coque persistante ouvre cette portée et la purge à sa sortie de session. */
export function activateListSession(owner: string): void {
	if (sessionOwner === owner) return
	states.clear()
	sessionOwner = owner
}

/** Une ancienne coque ne doit jamais purger la nouvelle personne. */
export function clearListSession(owner: string): void {
	if (sessionOwner !== owner) return
	states.clear()
	sessionOwner = null
}

/** Aucune recherche ni conversation ne participe à cette clé. */
export function messagerieListScope(networkId: string, personId: string, pose: "phone" | "desktop" | "dock"): string {
	return JSON.stringify([networkId, personId, pose])
}

function ownerOfScope(scope: string): string | null {
	try {
		const parts: unknown = JSON.parse(scope)
		return Array.isArray(parts) && parts.length === 3 && parts.every((part) => typeof part === "string") ? JSON.stringify(parts.slice(0, 2)) : null
	} catch {
		return null
	}
}

/** L'état retenu pour cette portée — l'état vierge s'il n'y en a pas. */
export function readListState(scope: string): ListUiState {
	const owner = ownerOfScope(scope)
	if (owner !== null && owner !== sessionOwner) return DEFAULT_STATE
	return states.get(scope) ?? DEFAULT_STATE
}

/** Retient une partie de l'état ; une position non finie ou négative vaut 0. */
export function writeListState(scope: string, patch: Partial<ListUiState>): void {
	const owner = ownerOfScope(scope)
	if (owner !== null && owner !== sessionOwner) return
	const current = readListState(scope)
	const scrollTop = patch.scrollTop === undefined ? current.scrollTop : Number.isFinite(patch.scrollTop) && patch.scrollTop > 0 ? patch.scrollTop : 0
	const loadedThreadCount = patch.loadedThreadCount === undefined ? current.loadedThreadCount : Number.isFinite(patch.loadedThreadCount) ? Math.max(0, Math.trunc(patch.loadedThreadCount)) : 0
	states.set(scope, { ...current, ...patch, scrollTop, loadedThreadCount })
}

/** Remise à zéro — RÉSERVÉE AUX TESTS. */
export function __resetListStatesForTests(): void {
	states.clear()
	sessionOwner = null
}
