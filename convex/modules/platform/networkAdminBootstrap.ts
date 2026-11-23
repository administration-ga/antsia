/**
 * CH-831 (ADR-0043, brouillon de l'architecte) — l'amorçage du PREMIER administrateur d'un réseau
 * administré, sur le déploiement de DÉMONSTRATION.
 *
 * La démonstration n'a pas de console : le premier administrateur d'un réseau qui a son application
 * d'administration au catalogue (`administers_network`) y est nommé UNE fois, depuis le terminal du
 * propriétaire (`convex run`, clé de déploiement), par l'une de ces deux fonctions INTERNES,
 * journalisées. En production, la console reste le seul chemin (`platform/networkRoles.setNetworkRole`) :
 * ces fonctions y sont fermées (`demoAccountsAllowed` : développement local ou démonstration DÉCLARÉE ;
 * une variable recopiée sur un autre déploiement ne correspond pas à son nom et n'ouvre rien). Aucune
 * source de production ne les appelle (cliquet `network-admin-bootstrap-callers`).
 *
 * La garde d'ADR-0042 ne change pas : la personne nommée n'entre dans l'application d'administration
 * qu'avec une session IDN vivante, scellée pour cette application, accès journalisé
 * (`lib/networkAdminIdentity.requireNetworkAdminSession`). Nommer ne donne aucune session.
 *
 * Portes COMMUNES aux deux gestes, dans cet ordre (`admitBootstrap` ; refus distincts, voir
 * `NETWORK_ADMIN_BOOTSTRAP_REFUSALS`) :
 *   1. démonstration déclarée ou développement local ;
 *   2. phrase de confirmation exacte, construite des arguments tels que tapés (`nameFirstConfirmation`,
 *      `withdrawConfirmation`) : la commande dit ce qu'elle fait ;
 *   3. motif nettoyé, entre `NETWORK_ROLE_REASON_MIN` et `DECISION_REASON_MAX` (la borne de la console) ;
 *   4. réseau lu par son identifiant d'adresse (index), actif, administré au catalogue ;
 *   5. personne lue par son identifiant public NORMALISÉ (index ; un `@` de tête est retiré) — ni `_id`,
 *      ni adresse en argument —, adhésion EXISTANTE dans le réseau (jamais créée d'office).
 * Porte 6, propre à la NOMINATION (`nameFirst`) : effacement ni demandé ni fait ; compte lisible qui
 * n'est PAS un compte de démonstration (domaine réservé, `isDemoEmail`) ; lien IDN courant
 * (`hasCurrentIdnLink`, le seuil de la console) ; adhésion active (« déclarée » au moins) ; aucun vrai
 * administrateur actif déjà là (fermé par défaut : un compte illisible ou sans lien IDN compte).
 * Le RETRAIT (`withdraw`) ne la passe pas : « retirer un pouvoir n'attend jamais » (voir sa notice).
 *
 * Puis l'aide commune du moteur (`people/networkRoles.setMembershipRole`) pose ou retire le rôle, et la
 * décision entre au journal DANS la même fonction (`membership.role_set`, qualité `system` : un acte du
 * propriétaire par la clé de déploiement n'a pas d'acteur personne ; `origin: "bootstrap"`). Aucune
 * nouvelle action ni qualité de journal. Le résultat nomme la personne visée (`personId`, identifiant
 * normalisé) : l'opérateur voit qui il a nommé ou retiré.
 *
 * Hors du cliquet `rate-limited-writes` (fonctions internes, jamais exposées à un client) : aucun seau.
 * Aucune donnée de personne dans un refus : un code stable seulement.
 *
 * Sujets IDN de démonstration : le moteur n'a ni constante ni aide PARTAGÉE qui les reconnaisse (chaque
 * catalogue de démonstration construit les siens en privé) ; la garde se fie au domaine réservé de
 * l'adresse et au lien IDN courant.
 */
import type { EngineErrorCode } from "@antsia/social-contracts/errors"
import { assertDecisionReason } from "@antsia/social-domain/audit"
import { normalizeHandle } from "@antsia/social-domain/content"
import { v } from "convex/values"

import { components } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import { internalMutation, type MutationCtx, type QueryCtx } from "../../_generated/server"
import { getMembership } from "../../lib/access"
import { demoAccountsAllowed, isDemoEmail } from "../../lib/devTools"
import { checked, failAppRule } from "../../lib/errors"
import { isAdministeredNetwork } from "../../lib/networkAdminIdentity"
import { hasCurrentIdnLink } from "../../lib/operatorIdentity"
import { membershipRoleValidator } from "../../lib/validators"
import { canHoldNetworkRole, NETWORK_ROLE_HOLDERS_MAX, type NetworkRoleChange, setMembershipRole } from "../people/networkRoles"
import { appendAudit, type AuditEntry } from "./audit"
import { NETWORK_ROLE_REASON_MIN } from "./networkRoles"

/** Le mot de tête de la phrase de confirmation de la nomination. */
export const NAME_FIRST_CONFIRMATION_PREFIX = "NAME_FIRST_NETWORK_ADMIN"
/** Le mot de tête de la phrase de confirmation du retrait. */
export const WITHDRAW_CONFIRMATION_PREFIX = "WITHDRAW_NETWORK_ADMIN"
/** L'origine inscrite au détail de la ligne de journal (`details.origin`). */
export const BOOTSTRAP_AUDIT_ORIGIN = "bootstrap"

/** La phrase exacte qui confirme la nomination : `NAME_FIRST_NETWORK_ADMIN <réseau> <identifiant>`. */
export function nameFirstConfirmation(networkSlug: string, handle: string): string {
  return `${NAME_FIRST_CONFIRMATION_PREFIX} ${networkSlug} ${handle}`
}

/** La phrase exacte qui confirme le retrait : `WITHDRAW_NETWORK_ADMIN <réseau> <identifiant>`. */
export function withdrawConfirmation(networkSlug: string, handle: string): string {
  return `${WITHDRAW_CONFIRMATION_PREFIX} ${networkSlug} ${handle}`
}

/** L'identifiant public tel que le moteur le range : espaces retirés, `@` de tête retiré, minuscules. */
export function bootstrapHandleOf(raw: string): string {
  return normalizeHandle(raw.trim().replace(/^@/, ""))
}

/**
 * Les refus de l'amorçage, codes STABLES pour l'opérateur qui lance la commande (`appRule` de l'erreur
 * du moteur, avec son `code`). Le motif trop court garde le refus de la console
 * (`invalidArgument`, règle `DECISION_REASON_LENGTH`).
 */
export const NETWORK_ADMIN_BOOTSTRAP_REFUSALS = [
  "bootstrap_closed",
  "bootstrap_confirmation",
  "bootstrap_network_unknown",
  "bootstrap_network_inactive",
  "bootstrap_network_not_administered",
  "bootstrap_person_unknown",
  "bootstrap_person_erasing",
  "bootstrap_membership_missing",
  "bootstrap_membership_inactive",
  "bootstrap_demo_account",
  "bootstrap_idn_link_missing",
  "bootstrap_admin_present",
  "bootstrap_not_admin",
] as const
export type NetworkAdminBootstrapRefusal = (typeof NETWORK_ADMIN_BOOTSTRAP_REFUSALS)[number]

const REFUSAL_CODES = {
  bootstrap_closed: "policyRefused",
  bootstrap_confirmation: "invalidArgument",
  bootstrap_network_unknown: "notFound",
  bootstrap_network_inactive: "policyRefused",
  bootstrap_network_not_administered: "policyRefused",
  bootstrap_person_unknown: "notFound",
  bootstrap_person_erasing: "policyRefused",
  bootstrap_membership_missing: "notFound",
  bootstrap_membership_inactive: "statusInsufficient",
  bootstrap_demo_account: "policyRefused",
  bootstrap_idn_link_missing: "policyRefused",
  bootstrap_admin_present: "conflict",
  bootstrap_not_admin: "conflict",
} as const satisfies Record<NetworkAdminBootstrapRefusal, EngineErrorCode>

function refuse(refusal: NetworkAdminBootstrapRefusal): never {
  return failAppRule(refusal, {}, REFUSAL_CODES[refusal])
}

const bootstrapArgs = { confirmation: v.string(), networkSlug: v.string(), handle: v.string(), reason: v.string() }
const bootstrapResult = v.object({
  changed: v.boolean(),
  from: membershipRoleValidator,
  to: membershipRoleValidator,
  /** La personne visée, et son identifiant public normalisé. */
  personId: v.id("persons"),
  handle: v.string(),
})

type BootstrapArgs = { confirmation: string; networkSlug: string; handle: string; reason: string }
type BootstrapResult = Pick<NetworkRoleChange, "changed" | "from" | "to" | "personId"> & { handle: string }
type AdmittedBootstrap = {
  network: Doc<"networks">
  person: Doc<"persons">
  membership: Doc<"networkMemberships">
  /** L'identifiant normalisé sous lequel la personne a été trouvée. */
  handle: string
  reason: string
}

/** L'adresse du compte (vérifiée ou non), normalisée, relue dans le composant d'authentification ; `null` sans compte lisible. */
async function accountEmailOf(ctx: Pick<MutationCtx, "runQuery">, authUserId: string): Promise<string | null> {
  const user = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
    model: "user",
    where: [{ field: "_id", value: authUserId }],
    select: ["_id", "email"],
  })) as { _id: string; email?: unknown } | null
  if (!user || user._id !== authUserId || typeof user.email !== "string") return null
  return user.email.trim().toLowerCase()
}

/** La personne tient-elle un lien IDN COURANT (non révoqué, garantie au seuil de la console, preuve concordante) ? */
async function hasLiveIdnLink(ctx: Pick<QueryCtx, "db">, person: Doc<"persons">): Promise<boolean> {
  const link = await ctx.db.query("identityLinks").withIndex("by_person_and_provider", (q) => q.eq("personId", person._id).eq("provider", "idn")).unique()
  return link !== null && (await hasCurrentIdnLink(ctx, person, link.subject))
}

/**
 * Un administrateur ACTIF du réseau, autre que `exceptPersonId`, dont le compte n'est PAS un compte de
 * démonstration ? Les comptes de démonstration qui tiennent le rôle (le catalogue de démonstration
 * équipe `demo.administrateur`) ne comptent pas ; un administrateur suspendu (qui n'exerce plus) non
 * plus. Fermé par défaut : un compte illisible compte comme un vrai administrateur, un titulaire sans
 * lien IDN aussi — le propriétaire le retire d'abord (`withdraw`), puis nomme. Lecture bornée par
 * l'index du rôle (au plus `NETWORK_ROLE_HOLDERS_MAX` titulaires : l'aide commune refuse d'en nommer
 * au-delà).
 */
async function hasRealActiveAdmin(ctx: MutationCtx, networkId: Id<"networks">, exceptPersonId: Id<"persons">): Promise<boolean> {
  const holders = await ctx.db
    .query("networkMemberships")
    .withIndex("by_network_and_role", (q) => q.eq("networkId", networkId).eq("role", "network_admin"))
    .take(NETWORK_ROLE_HOLDERS_MAX)
  for (const holder of holders) {
    if (holder.personId === exceptPersonId) continue
    if (!(await canHoldNetworkRole(ctx, networkId, holder.personId))) continue
    const person = await ctx.db.get(holder.personId)
    const email = person ? await accountEmailOf(ctx, person.authUserId) : null
    if (email === null || !isDemoEmail(email)) return true
  }
  return false
}

/** Les portes COMMUNES aux deux gestes (voir l'en-tête, points 1 à 5), dans l'ordre ; refus distinct sinon. */
async function admitBootstrap(ctx: MutationCtx, args: BootstrapArgs, expectedConfirmation: string): Promise<AdmittedBootstrap> {
  if (!demoAccountsAllowed()) return refuse("bootstrap_closed")
  if (args.confirmation !== expectedConfirmation) return refuse("bootstrap_confirmation")
  const reason = checked(() => assertDecisionReason(args.reason, NETWORK_ROLE_REASON_MIN))

  const network = await ctx.db.query("networks").withIndex("by_slug", (q) => q.eq("slug", args.networkSlug)).unique()
  if (!network) return refuse("bootstrap_network_unknown")
  if (network.status !== "active") return refuse("bootstrap_network_inactive")
  if (!isAdministeredNetwork(network)) return refuse("bootstrap_network_not_administered")

  const handle = bootstrapHandleOf(args.handle)
  const person = handle.length > 0 ? await ctx.db.query("persons").withIndex("by_handle", (q) => q.eq("handle", handle)).unique() : null
  if (!person) return refuse("bootstrap_person_unknown")
  const membership = await getMembership(ctx, network._id, person._id)
  if (!membership) return refuse("bootstrap_membership_missing")
  return { network, person, membership, handle, reason }
}

/** La ligne de journal de l'amorçage : celle de tout changement de rôle, qualité `system` sans acteur, plus son origine. */
function bootstrapAuditEntry(networkId: Id<"networks">, change: NetworkRoleChange, reason: string): AuditEntry {
  return {
    action: "membership.role_set",
    capacity: "system",
    networkId,
    subject: { table: "persons", id: change.personId },
    details: { reason, from: change.from, to: change.to, origin: BOOTSTRAP_AUDIT_ORIGIN },
  }
}

/**
 * Nomme le PREMIER administrateur du réseau, sur une adhésion existante et active (« déclarée » au
 * moins, sans suspension), après la porte 6 (voir l'en-tête). Refusé si un vrai administrateur actif
 * est déjà là (les comptes de démonstration ne comptent pas) : ensuite, l'administration du réseau
 * nomme ses responsables depuis son application (`diaspora/membership.setResponsibleRole`). Rejoué sur
 * la personne déjà nommée : `changed: false`, aucune seconde ligne au journal.
 */
export const nameFirst = internalMutation({
  args: bootstrapArgs,
  returns: bootstrapResult,
  handler: async (ctx, args): Promise<BootstrapResult> => {
    const { network, person, membership, handle, reason } = await admitBootstrap(ctx, args, nameFirstConfirmation(args.networkSlug, args.handle))
    // Porte 6 : la nomination seulement.
    if (person.erasedAt !== undefined || person.deletionRequestedAt !== undefined) return refuse("bootstrap_person_erasing")
    const email = await accountEmailOf(ctx, person.authUserId)
    if (email === null) return refuse("bootstrap_person_unknown")
    if (isDemoEmail(email)) return refuse("bootstrap_demo_account")
    if (!(await hasLiveIdnLink(ctx, person))) return refuse("bootstrap_idn_link_missing")
    if (!(await canHoldNetworkRole(ctx, network._id, person._id))) return refuse("bootstrap_membership_inactive")
    if (membership.role === "network_admin") return { changed: false, from: membership.role, to: membership.role, personId: person._id, handle }
    if (await hasRealActiveAdmin(ctx, network._id, person._id)) return refuse("bootstrap_admin_present")
    const change = await setMembershipRole(ctx, { network, personId: person._id, role: "network_admin" })
    if (change.changed) await appendAudit(ctx, bootstrapAuditEntry(network._id, change, reason))
    return { changed: change.changed, from: change.from, to: change.to, personId: change.personId, handle }
  },
})

/**
 * Retire le rôle d'administrateur (retour au rôle `member`) : le chemin de retour de l'amorçage sur la
 * démonstration. « Retirer un pouvoir n'attend jamais » : ni lien IDN, ni adhésion active, ni compte
 * d'authentification lisible ne sont exigés (portes communes 1 à 5 seulement). Refusé si la personne
 * ne tient pas le rôle, ou si son compte LISIBLE est un compte de démonstration (son rôle appartient au
 * catalogue de démonstration). Le dernier administrateur actif SE RETIRE (option `allowLastAdmin` de
 * l'aide commune, admise sur la démonstration seule, et ici seulement — cliquet `operator-audit`) :
 * l'amorçage peut alors nommer quelqu'un d'autre. Le rôle est relu à chaque appel : l'acte suivant de
 * l'ancien administrateur reçoit le refus indistinct.
 */
export const withdraw = internalMutation({
  args: bootstrapArgs,
  returns: bootstrapResult,
  handler: async (ctx, args): Promise<BootstrapResult> => {
    const { network, person, membership, handle, reason } = await admitBootstrap(ctx, args, withdrawConfirmation(args.networkSlug, args.handle))
    const email = await accountEmailOf(ctx, person.authUserId)
    if (email !== null && isDemoEmail(email)) return refuse("bootstrap_demo_account")
    if (membership.role !== "network_admin") return refuse("bootstrap_not_admin")
    const change = await setMembershipRole(ctx, { network, personId: person._id, role: "member", allowLastAdmin: true })
    if (change.changed) await appendAudit(ctx, bootstrapAuditEntry(network._id, change, reason))
    return { changed: change.changed, from: change.from, to: change.to, personId: change.personId, handle }
  },
})
