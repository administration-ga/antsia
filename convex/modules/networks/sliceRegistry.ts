/**
 * Registre FERMÉ des tranches qui gouvernent un réseau (`networks.managedBy`, issue antsia#121,
 * lot EA-03 de DIASPORALE) : une entrée par valeur de `NETWORK_SLICES`. Aucune fonction Convex ici.
 *
 * Point d'extension : la réconciliation des adhésions (`people/identity.ts`), quand l'identité d'une
 * personne change (lien IDN posé, niveau gagné ou perdu, lien révoqué), confie chaque adhésion ACTIVE
 * à un réseau gouverné au gestionnaire de sa tranche, au lieu de la sauter. `people/` ne connaît que
 * ce registre et son contrat : il n'importe jamais la tranche.
 *
 * Même motif que le registre des conversations contextuelles (`contextualMessaging/registry.ts`) :
 *   - c'est le SEUL fichier du moteur qui importe le gestionnaire d'une tranche pour ce point
 *     d'extension (une ligne par tranche) ;
 *   - `null` est le repli sûr : sans gestionnaire, la réconciliation SAUTE le réseau gouverné,
 *     exactement comme avant (aucune régression pour les fronts et les données en ligne) ;
 *   - les tests du moteur remplacent ce module (`vi.mock`) : aucun gestionnaire de test n'est
 *     jamais enregistré ici.
 *
 * Tranche `diaspora` : en attente de `rederiveMembership` (`convex/modules/diaspora/facts.ts`,
 * PR antsia#119, pas encore sur `main`). Le jour venu, l'entrée devient
 *   `diaspora: (ctx, membership, now) => rederiveMembership(ctx, membership, now),`
 * TOUJOURS par une flèche : la tranche importe `people/`, qui importe ce registre ; l'appel
 * paresseux ne dépend pas de l'ordre d'initialisation de ce cycle d'imports.
 */
import type { MembershipStatus } from "@antsia/social-domain/membership"
import type { NetworkSlice } from "@antsia/social-domain/network"

import type { Doc } from "../../_generated/dataModel"
import type { MutationCtx } from "../../_generated/server"
import { rederiveMembership } from "../diaspora/facts"

/**
 * Relecture, par la tranche, d'une adhésion ACTIVE (`en_attente`, `declaree`, `verifiee`) à un réseau
 * qu'elle gouverne, dans la transaction de la réconciliation. Le moteur ne l'appelle jamais pour un
 * départ ni une sanction (`partie`, `suspendue`), ni quand l'adhésion racine est sortie, ni pour un
 * réseau archivé. Elle DOIT être idempotente (rejouée sans fait nouveau, elle n'écrit rien de plus),
 * bornée, et rend le statut tenu après la relecture.
 */
export type ManagedMembershipRederiver = (ctx: MutationCtx, membership: Doc<"networkMemberships">, now: number) => Promise<MembershipStatus>

export type ManagedMembershipRegistry = { readonly [S in NetworkSlice]: ManagedMembershipRederiver | null }

export const MANAGED_MEMBERSHIP_REDERIVERS: ManagedMembershipRegistry = {
  diaspora: (ctx, membership, now) => rederiveMembership(ctx, membership, now),
}
