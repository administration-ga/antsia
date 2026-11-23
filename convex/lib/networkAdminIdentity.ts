/**
 * ADR-0042 — l'administrateur d'un réseau gouverné, en session d'identité numérique PROUVÉE, depuis
 * l'application qui administre CE réseau. La garde des constructeurs `networkAdminQuery` et
 * `networkAdminMutation` (`lib/functions.ts`), après `requireMembership` :
 *
 *   1. rôle `network_admin` sur l'adhésion, relu à chaque appel (un retrait vaut à l'acte suivant) ;
 *   2. adhésion qui permet d'exercer le rôle : « déclarée » au moins, sans suspension
 *      (`canHoldNetworkRole`, la définition de la garde du dernier administrateur) ;
 *   3. preuve de la session appelante VIVANTE (`isLiveIdnSession`, la même que la console :
 *      garantie `CONSOLE_MIN_LOA`, lien IDN courant, session Better Auth vivante, non expirée) ;
 *   4. preuve scellée pour une application qui administre CE réseau (`administers_network` au
 *      catalogue, égal au `slug` du réseau) : une session de l'application des membres, de la
 *      console, d'avant ADR-0042 ou du natif ne passe pas ;
 *   5. accès d'administration journalisé pour ce couple (session, réseau) — `networkAdminAccess`,
 *      DISTINCT de l'`accessLoggedAt` de la console —, sauf pour les deux portes d'entrée
 *      (`allowUnloggedAccess`).
 *
 * Tout refus est le refus indistinct du non-membre (`notFound`) : le rôle, l'application, la
 * session et le journal ne se devinent pas. Une suspension garde le refus de tout membre suspendu
 * (`requireMembership`).
 */
import type { Doc, Id } from "../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../_generated/server"
import { networkAdministeredBy } from "../betterAuth/settings"
import { canHoldNetworkRole } from "../modules/people/networkRoles"
import type { NetworkAccess } from "./access"
import { notFound } from "./errors"
import { liveIdnSessionProofOrNull } from "./operatorIdentity"

export type NetworkAdminSession = Doc<"operatorSessionProofs">

/** La preuve a-t-elle été scellée pour une application qui administre CE réseau ? */
export function proofAdministersNetwork(proof: NetworkAdminSession, network: Doc<"networks">): boolean {
  const administered = networkAdministeredBy(proof.application)
  return administered !== null && administered === network.slug
}

/** L'accès d'administration de ce réseau est-il journalisé pour cette session ? */
export function isNetworkAdminAccessLogged(proof: NetworkAdminSession, networkId: Id<"networks">): boolean {
  return proof.networkAdminAccess?.networkId === networkId
}

/** La preuve vivante de la session appelante, scellée pour l'application qui administre ce réseau, ou `null` — sans lever. */
export async function liveNetworkAdminSessionOrNull(ctx: QueryCtx | MutationCtx, person: Doc<"persons">, network: Doc<"networks">): Promise<NetworkAdminSession | null> {
  const proof = await liveIdnSessionProofOrNull(ctx, person)
  return proof !== null && proofAdministersNetwork(proof, network) ? proof : null
}

/** LA garde (points 1 à 5 ci-dessus), sur un accès déjà admis par `requireMembership` ; `notFound` sinon. */
export async function requireNetworkAdminSession(ctx: QueryCtx | MutationCtx, access: NetworkAccess, options: { allowUnloggedAccess?: true }): Promise<NetworkAdminSession> {
  if (access.membership.role !== "network_admin") return notFound()
  if (!(await canHoldNetworkRole(ctx, access.network._id, access.person._id))) return notFound()
  const proof = await liveNetworkAdminSessionOrNull(ctx, access.person, access.network)
  if (proof === null) return notFound()
  if (!options.allowUnloggedAccess && !isNetworkAdminAccessLogged(proof, access.network._id)) return notFound()
  return proof
}
