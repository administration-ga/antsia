"use client"

/**
 * ADR-0036 : iCom Pro existe-t-il pour la personne de la session ?
 *
 * Oui dès qu'une activité professionnelle existe : une boutique tenue ou mandatée, un profil
 * professionnel, une conversation de boutique (côté client compris) ou une mise en relation.
 * Chaque source est une lecture serveur existante, bornée à une ligne ; aucune n'est lue sans la
 * capacité `icomPro` déclarée par l'application (DIASPORALE n'en lit aucune).
 *
 * `null` : la réponse n'est pas encore connue — la bascule ne s'affiche qu'une fois tranché, pour
 * ne pas apparaître puis disparaître.
 */
import { api } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"

/** La décision, pure et testée : une source positive suffit, toutes les réponses sont attendues sinon. */
export function icomProAvailabilityOf(sources: readonly (boolean | null)[]): boolean | null {
	if (sources.some((source) => source === true)) return true
	return sources.every((source) => source === false) ? false : null
}

type Answer<T> = { data: T | undefined; isError: boolean }

function answered<T>(query: Answer<T>, positive: (data: T) => boolean): boolean | null {
	if (query.isError) return false
	return query.data === undefined ? null : positive(query.data)
}

export function useIcomProAvailability(): boolean | null {
	const { networkId, icomPro } = useNetwork()
	const args = icomPro ? { networkId } : "skip"
	const mandated = useAuthenticatedConvexQuery(api.modules.commercialMessaging.team.myShops, args)
	const owned = useAuthenticatedConvexQuery(api.modules.shops.shops.myShops, args)
	const purchases = useAuthenticatedConvexQuery(api.modules.commercialMessaging.threads.paginateMyThreads, icomPro ? { networkId, query: "", paginationOpts: { cursor: null, numItems: 1 } } : "skip")
	const relations = useAuthenticatedConvexQuery(api.modules.contextualMessaging.threads.paginateMine, icomPro ? { networkId, limit: 1 } : "skip")
	const profile = useAuthenticatedConvexQuery(api.modules.professionals.profiles.myProfile, args)
	if (!icomPro) return false
	return icomProAvailabilityOf([
		answered(mandated, (data) => data.items.length > 0),
		answered(owned, (data) => data.items.some((shop) => shop.pageHandle !== null)),
		answered(purchases, (data) => data.page.length > 0),
		answered(relations, (data) => data.items.length > 0),
		answered(profile, (data) => data !== null),
	])
}
