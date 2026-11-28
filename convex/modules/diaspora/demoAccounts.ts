/**
 * Comptes de DÉMONSTRATION de DIASPORA.GA — développement local, ou déploiement
 * de démonstration déclaré (ADR-0029, ADR-0038), jamais la production.
 *
 * Sur le modèle de `convex/modules/platform/demoAccounts.ts` (comptes de
 * démonstration de la racine), pour le réseau `diaspora-ga`. Le catalogue vient
 * du domaine (`DIASPORA_GA_DEMO_ACTOR_SPECS`) : un acteur par statut de membre,
 * par nature de page, par rôle et par accès restreint, sur une adresse réservée
 * (`<acteur>@demo.diaspora-ga.test`, domaine `.test` jamais routable).
 *
 * La connexion passe par le VRAI parcours OTP (code lu par `devTools.latestOtp`),
 * l'accueil par les vraies mutations (profil publié, consentements,
 * `joinDiasporaGa`), appelées par l'application ; les gestes ensuite (profil de
 * mentor, de talent, offres, mission) aussi. Ce module ne pose que ce qu'un
 * compte ne peut pas se donner seul, pour la seule personne de la session, et
 * seulement si son adresse vérifiée est celle de l'acteur demandé :
 * - les FAITS fictifs dont le statut se dérive — identité IDN (niveau,
 *   nationalité), attestation consulaire, admission fondatrice (EA-01, par le vrai
 *   chemin de décision, sans opérateur), parrainage par l'acteur « verifie » —
 *   puis la vraie dérivation (`applyDerivedStatus`) : aucun statut n'est écrit ;
 * - l'ancienneté d'un parrain (vérifié depuis plus de 30 jours, comme la graine
 *   `verifyForRecette`) ;
 * - le rôle de réseau et l'équipe de modération de démonstration ;
 * - la page (association, entreprise, média, communauté, institution), sa
 *   confiance et sa présentation, la personne en étant l'administratrice ;
 * - le hub des pays de la démonstration DÉJÀ ouverts : aucun pays n'est ouvert
 *   ici (CH-817 E3), l'ouverture reste une décision de l'administration du réseau ;
 * - le blocage d'un acteur par un autre (« bloque » par « verifie »), par le vrai
 *   mécanisme du moteur (`graph/connections.blockPair`, le corps de
 *   `blockPerson`), dès que les deux comptes existent ;
 * - EN DERNIER, les sanctions, qui ne sont jamais dérivées : la suspension de
 *   l'acteur « suspendu » dans DIASPORA.GA seulement (une adhésion suspendue ne se
 *   rejoint plus), et celle de « suspendu-racine » à la RACINE, par le chemin de
 *   la console (`people/memberships.suspendRootMembership`, celui de
 *   `suspendEverywhere`) : elle vaut partout, sans toucher au statut propre de
 *   son adhésion DIASPORA.GA.
 *
 * L'utilisateur extérieur au réseau (« exterieur ») n'a pas d'adhésion
 * DIASPORA.GA : l'application ne rejoue que l'accueil d'ANTSIA (consentement,
 * profil publié), l'équipement l'admet à la racine par la vraie règle
 * d'admission et n'écrit rien dans DIASPORA.GA.
 *
 * L’équipement est idempotent et réservé au développement local explicitement activé.
 * Tout déploiement hébergé renvoie un catalogue vide et refuse l’équipement.
 *
 * CH-817 E3 — deux verrous de plus, qui resserrent sans rien ouvrir :
 * - la PORTE (`platform/demoGate.ts`) : armée, le catalogue est vide sans session de
 *   porte valide (`gateToken`), comme le code affiché (`devTools.latestOtp`, le
 *   verrou réel : sans code, aucune session sur une adresse réservée) ;
 * - la RÈGLE du catalogue (`diasporaGaDemoActorsOffered`) : un acteur n'est proposé,
 *   et ne s'équipe, que si ses modules (`openFeaturesOf`) et son pays sont ouverts ;
 *   les acteurs de recette (accès restreints, média, collectif) en développement
 *   local seulement. Un acteur non proposé est refusé d'un refus indistinct.
 * CH-817 E4 — l'équipement planifie les publications d'exemple de l'acteur
 * (`./demoContent.ts#animateActor`), écrites par le moteur après la transaction.
 * CH-817 E5 (relecture de sécurité, constats 2 et 4) :
 * - `closeDemoSessions` ferme les sessions Better Auth des acteurs DÉCLARÉS, et d'eux seuls :
 *   planifiée par le retrait d'un numéro de la porte (`platform/demoGate.revokePhones`) et par sa
 *   remise à zéro (`resetScope`, à l'armement et à chaque rotation du secret) ;
 * - `accountEmailOf` et `isDeclaredDiasporaGaDemoEmail` servent le refus de `joinDiasporaGa` : porte
 *   armée, une adresse réservée qui n'est pas celle d'un acteur déclaré n'entre pas dans le réseau.
 */
import type { DemoGateScope } from "@antsia/social-contracts/demoGate"
import { CONSENT_TEXT_VERSIONS, isConsentInForce, missingConsentsToJoin } from "@antsia/social-domain/consent"
import { entryStatusFor } from "@antsia/social-domain/membership"
import { assertPageHandle, assertPageName, assertTrustAllowedForOwner, pageTrustRank } from "@antsia/social-domain/pages"
import { normalizePageAssociationType, normalizePageCity, normalizePageSector } from "@antsia/social-domain/pagePresentation"
import {
  DAY_MS,
  DIASPORA_GA_DEMO_ACTORS,
  DIASPORA_GA_DEMO_ACTOR_SPECS,
  DIASPORA_GA_DEMO_COUNTRIES,
  DIASPORA_GA_NETWORK_SLUG,
  diasporaGaDemoActorsOffered,
  diasporaGaDemoEmailOf,
  type DiasporaGaDemoActor,
  type DiasporaGaDemoActorSpec,
  type DiasporaGaDemoPage,
} from "@diaspora-ga/domain"
import { v } from "convex/values"

import { components, internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import { internalMutation, type MutationCtx, query, type QueryCtx } from "../../_generated/server"
import { getMembership, getRootNetwork, isActiveMember } from "../../lib/access"
import { demoAccountsAllowed, devToolsAllowed } from "../../lib/devTools"
import { checked, fail } from "../../lib/errors"
import { personMutation } from "../../lib/functions"
import { openFeaturesOf } from "../../lib/networkFeatures"
import { literals, membershipRoleValidator, membershipStatusValidator } from "../../lib/validators"
import { blockPair } from "../graph/connections"
import { ownBlockIntent } from "../graph/graph"
import { moderateContentWrite } from "../moderation/policy"
import { assertPageHandleFree, isPageOnRoot, pageSearchText } from "../pages/access"
import { applyPageStatus } from "../pages/admin"
import { markCommentRemoved, markPostRemoved } from "../posts/contentRemoval"
import { applyReactionDelta, countComments, countShares, readReactionCounts } from "../posts/counters"
import { assertLeaveKeepsNetworkAdmin, setMembershipRole } from "../people/networkRoles"
import { admitToNetwork, setDirectoryListed, setMembershipStatus } from "../people/admission"
import { syncIdentityForPerson } from "../people/identity"
import { suspendRootMembership } from "../people/memberships"
import { hasStrongIdentityFor, liveIdentityLinks } from "../people/persons"
import { appendAudit } from "../platform/audit"
import { demoGateAdmission } from "../platform/devTools"
import { demoGateScopeValidator } from "../platform/tables"
import { refreshReaderContexts } from "../posts/feedMaterialization"
import { sha256Hex } from "./attestation"
import { activeFoundingAdmissionOf, activeSponsorshipOf, applyDerivedStatus, effectiveStatusIn, endFoundingAdmissionOnDeparture, endSponsorshipOnDeparture, isDiasporaNetwork, membershipGrounds, privacyOf, sponsorCodeOf, writePrivacy } from "./facts"
import { admitFounder } from "./founders"
import { hubRow } from "./hubs"

export const demoActorValidator = literals(DIASPORA_GA_DEMO_ACTORS)

/** Le parrain des acteurs parrainés : l'acteur « verifie », vérifié depuis plus de 30 jours. */
const DEMO_SPONSOR: DiasporaGaDemoActor = "verifie"
/** Ancienneté posée au parrain : au-delà du délai de parrainage (30 jours, strictement). */
const SPONSOR_SENIORITY_DAYS = 31
/** L'équipe de modération de démonstration (sans périmètre : elle reçoit les nouveaux signalements). */
const DEMO_MODERATION_TEAM = "Équipe de démonstration"
/** Le poste consulaire FICTIF des attestations de démonstration. */
const DEMO_POST_SLUG = "poste-de-demonstration"
/** Le motif de l'admission fondatrice FICTIVE (EA-01) : aucune décision réelle n'est imitée. */
const DEMO_FOUNDING_REASON = "Membre fondateur de démonstration (développement local)."

/** Sujets fictifs, propres à DIASPORA.GA : ceux de la racine (`demo-idn-<acteur>`) portent les mêmes noms d'acteurs. */
function demoIdnSubjectOf(actor: DiasporaGaDemoActor): string {
  return `diaspora-ga-demo-idn-${actor}`
}

function demoAttestationSubjectOf(actor: DiasporaGaDemoActor): string {
  return `diaspora-ga-demo-attestation-${actor}`
}

/** Le réseau DIASPORA.GA, s'il est semé et gouverné par la tranche ; `null` sinon. */
export async function diasporaGaNetwork(ctx: Pick<QueryCtx, "db">): Promise<Doc<"networks"> | null> {
  const network = await ctx.db.query("networks").withIndex("by_slug", (q) => q.eq("slug", DIASPORA_GA_NETWORK_SLUG)).unique()
  return isDiasporaNetwork(network) ? network : null
}

/**
 * Les acteurs PROPOSÉS ici, dans l'ordre du panneau (CH-817 E3) : la règle du domaine
 * (`diasporaGaDemoActorsOffered`), appliquée aux modules ouverts tels que le moteur les
 * calcule (`openFeaturesOf` : un module n'y figure qu'avec son parent), aux pays ouverts
 * du réseau, et au développement local (`devToolsAllowed`) pour les acteurs de recette.
 * Le catalogue et l'équipement lisent la même liste.
 */
export async function offeredDemoActors(ctx: Pick<QueryCtx, "db">, network: Doc<"networks">): Promise<DiasporaGaDemoActor[]> {
  return diasporaGaDemoActorsOffered({
    openFeatures: await openFeaturesOf(ctx, network),
    openCountries: network.openCountries ?? [],
    local: devToolsAllowed(),
  })
}

/**
 * @publicProjection Développement local explicitement activé : le
 * catalogue des comptes de démonstration de DIASPORA.GA (acteur et adresse
 * réservée), vide partout ailleurs, production comprise. CH-817 E3 : seuls les
 * acteurs PROPOSÉS par la règle (modules et pays ouverts, recette en local) ; porte
 * armée, vide sans session de porte valide (`gateToken`), et chaque entrée porte
 * alors l'échéance de la session (`gateExpiresAt`), jamais le jeton.
 */
export const catalogue = query({
  args: { gateToken: v.optional(v.string()) },
  returns: v.array(v.object({ actor: demoActorValidator, email: v.string(), gateExpiresAt: v.optional(v.number()) })),
  handler: async (ctx, { gateToken }) => {
    if (!devToolsAllowed()) return []
    const admission = await demoGateAdmission(ctx, "diaspora-ga", gateToken)
    if (!admission.admitted) return []
    const network = await diasporaGaNetwork(ctx)
    if (!network) return []
    const gate = admission.sessionExpiresAt !== null ? { gateExpiresAt: admission.sessionExpiresAt } : {}
    return (await offeredDemoActors(ctx, network)).map((actor) => ({ actor, email: diasporaGaDemoEmailOf(actor), ...gate }))
  },
})

/**
 * L'adresse d'un compte, VÉRIFIÉE OU NON, normalisée, relue dans le composant d'authentification
 * (CH-817 E5, § 7.3) : le refus de `joinDiasporaGa` regarde l'adresse même du compte, que Better Auth
 * l'ait marquée vérifiée ou pas encore.
 */
export async function accountEmailOf(ctx: Pick<MutationCtx, "runQuery">, authUserId: string): Promise<string | null> {
  const user = await ctx.runQuery(components.betterAuth.adapter.findOne, {
    model: "user",
    where: [{ field: "_id", value: authUserId }],
    select: ["_id", "email"],
  }) as { _id: string; email: string } | null
  if (!user || user._id !== authUserId || typeof user.email !== "string") return null
  return user.email.trim().toLowerCase()
}

/** L'adresse (normalisée) est-elle celle d'un acteur DÉCLARÉ de DIASPORA.GA ? Une adresse libre de la famille ne l'est pas. */
export function isDeclaredDiasporaGaDemoEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase()
  return DIASPORA_GA_DEMO_ACTORS.some((actor) => diasporaGaDemoEmailOf(actor) === normalized)
}

/** Sessions supprimées au plus par compte et par passage ; au-delà, la mutation se replanifie. */
const DEMO_SESSIONS_PER_ACCOUNT = 100

export type CloseDemoSessionsResult = { accounts: number; sessionsClosed: number; complete: boolean }

/**
 * CH-817 E5 (constat 2) — ferme les sessions Better Auth des acteurs DÉCLARÉS de la portée : pour
 * chacune des adresses déclarées (`diasporaGaDemoEmailOf`), le compte (`user` par `email`), puis ses
 * sessions (`session` par `userId`, modèle `people/erasure.ts`), 100 au plus par compte ; incomplète,
 * elle se replanifie. Aucune autre adresse n'est touchée, ni celles de la racine, ni les adresses
 * libres de la famille. Fermée hors des comptes de démonstration (production comprise). Rend des
 * nombres, jamais une adresse.
 */
export async function closeDemoSessionsImpl(ctx: MutationCtx, args: { scope: DemoGateScope }): Promise<CloseDemoSessionsResult> {
  const result: CloseDemoSessionsResult = { accounts: 0, sessionsClosed: 0, complete: true }
  if (!demoAccountsAllowed() || args.scope !== "diaspora-ga") return result
  for (const actor of DIASPORA_GA_DEMO_ACTORS) {
    const email = diasporaGaDemoEmailOf(actor)
    const user = await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: "user",
      where: [{ field: "email", value: email }],
      select: ["_id", "email"],
    }) as { _id: string; email: string } | null
    if (!user || user.email.trim().toLowerCase() !== email) continue
    result.accounts += 1
    const closed = await ctx.runMutation(components.betterAuth.adapter.deleteMany, {
      input: { model: "session", where: [{ field: "userId", value: user._id }] },
      paginationOpts: { cursor: null, numItems: DEMO_SESSIONS_PER_ACCOUNT },
    })
    result.sessionsClosed += closed.count
    if (!closed.isDone) result.complete = false
  }
  if (!result.complete) await ctx.scheduler.runAfter(0, internal.modules.diaspora.demoAccounts.closeDemoSessions, { scope: args.scope })
  return result
}

/** Ferme les sessions des acteurs déclarés de la portée (voir `closeDemoSessionsImpl`) ; planifiée par la porte, argument `{ scope }` seul. */
export const closeDemoSessions = internalMutation({
  args: { scope: demoGateScopeValidator },
  returns: v.object({ accounts: v.number(), sessionsClosed: v.number(), complete: v.boolean() }),
  handler: async (ctx, args) => await closeDemoSessionsImpl(ctx, args),
})

/** L'adresse vérifiée d'un compte, relue dans le composant d'authentification. */
async function verifiedEmailOf(ctx: MutationCtx, authUserId: string): Promise<string | null> {
  const user = await ctx.runQuery(components.betterAuth.adapter.findOne, {
    model: "user",
    where: [{ field: "_id", value: authUserId }],
    select: ["_id", "email", "emailVerified"],
  }) as { _id: string; email: string; emailVerified?: boolean } | null
  if (!user || user._id !== authUserId || user.emailVerified !== true) return null
  return user.email.trim().toLowerCase()
}

/**
 * Un acteur déjà entré, retrouvé par l'identifiant de son profil fictif. L'identifiant
 * public ne suffit pas : une autre personne peut le porter ; seule compte celle dont
 * l'adresse vérifiée est l'adresse réservée de l'acteur.
 */
export async function personOfActor(ctx: MutationCtx, actor: DiasporaGaDemoActor): Promise<Doc<"persons"> | null> {
  const profile = DIASPORA_GA_DEMO_ACTOR_SPECS[actor].profile
  if (profile === null) return null
  const person = await ctx.db.query("persons").withIndex("by_handle", (q) => q.eq("handle", profile.handle)).unique()
  if (!person || (await verifiedEmailOf(ctx, person.authUserId)) !== diasporaGaDemoEmailOf(actor)) return null
  return person
}

/** La vraie dérivation du statut, avec le parrain en cours (passer `null` l'effacerait). */
async function rederive(ctx: MutationCtx, network: Doc<"networks">, personId: Id<"persons">, now: number): Promise<Doc<"networkMemberships"> | null> {
  const membership = await getMembership(ctx, network._id, personId)
  if (!membership) return null
  const grounds = await membershipGrounds(ctx, network._id, personId, membership)
  const sponsor = (await activeSponsorshipOf(ctx, network._id, personId))?.sponsorPersonId ?? null
  await applyDerivedStatus(ctx, membership, grounds, sponsor, now)
  return await getMembership(ctx, network._id, personId)
}

/**
 * Le hub des pays de la démonstration (France, Belgique, Canada) DÉJÀ ouverts. CH-817 E3 :
 * plus aucun pays n'est ouvert d'office — l'ouverture est une décision de l'administration du
 * réseau (`networkSettings.setOpenCountry`) ; un acteur d'un pays fermé n'est ni proposé ni
 * équipé. Ne reste que le hub qui manquerait à un pays ouvert autrement (par la graine).
 */
async function ensureDemoCountryHubs(ctx: MutationCtx, network: Doc<"networks">, now: number): Promise<void> {
  const open = network.openCountries ?? []
  for (const country of DIASPORA_GA_DEMO_COUNTRIES) {
    if (!open.includes(country) || (await hubRow(ctx, network._id, country))) continue
    await ctx.db.insert("countryHubs", { networkId: network._id, country, members: 0, associations: 0, companies: 0, upcomingEvents: 0, updatedAt: now })
  }
}

/**
 * Compte IDN et preuve FICTIFS (niveau et nationalité de l'acteur), puis la vraie
 * synchronisation écrit le lien. Un vrai compte IDN déjà lié n'est jamais remplacé.
 */
async function ensureDemoIdentity(
  ctx: MutationCtx,
  actor: DiasporaGaDemoActor,
  person: Doc<"persons">,
  idn: NonNullable<DiasporaGaDemoActorSpec["grounds"]["idn"]>,
  now: number,
): Promise<void> {
  const subject = demoIdnSubjectOf(actor)
  const accounts = await ctx.runQuery(components.betterAuth.adapter.findMany, {
    model: "account",
    where: [{ field: "providerId", value: "idn" }, { field: "userId", value: person.authUserId }],
    select: ["accountId"],
    paginationOpts: { cursor: null, numItems: 2 },
  }) as { page: { accountId: string }[] }
  if (accounts.page.length === 0) {
    await ctx.runMutation(components.betterAuth.adapter.create, {
      input: { model: "account", data: { userId: person.authUserId, providerId: "idn", accountId: subject, createdAt: now, updatedAt: now } },
    })
  } else if (accounts.page[0]?.accountId !== subject) {
    return
  }
  // La nationalité que la preuve IDN porterait : le Gabon, ou un autre pays si l'acteur le dit.
  const nationality = idn.gaboneseNationality ? "GA" : "FR"
  const proof = await ctx.db.query("idnProofs").withIndex("by_subject", (q) => q.eq("subject", subject)).unique()
  if (proof) await ctx.db.patch(proof._id, { loa: idn.loa, nationality, observedAt: now })
  else await ctx.db.insert("idnProofs", { subject, loa: idn.loa, nationality, observedAt: now })
  await syncIdentityForPerson(ctx, person)
}

/**
 * L'attestation consulaire FICTIVE, jamais une donnée consulaire : le lien
 * d'identité que lisent les faits, et la demande « vérifiée » (avec son
 * consentement) que lit l'écran des réglages, comme le ferait une réponse de
 * consulat.ga.
 */
async function ensureDemoAttestation(
  ctx: MutationCtx,
  network: Doc<"networks">,
  actor: DiasporaGaDemoActor,
  person: Doc<"persons">,
  country: string,
  now: number,
): Promise<void> {
  const subject = demoAttestationSubjectOf(actor)
  const links = await liveIdentityLinks(ctx, person._id)
  if (!links.some((link) => link.provider === "consular_attestation")) {
    await ctx.db.insert("identityLinks", { personId: person._id, provider: "consular_attestation", subject, country, postSlug: DEMO_POST_SLUG, linkedAt: now })
  }
  const consentRef = `${subject}:consent`
  if (await ctx.db.query("consularAttestations").withIndex("by_consentRef", (q) => q.eq("consentRef", consentRef)).unique()) return
  // borné : un consentement par finalité et par réseau.
  const consents = await ctx.db
    .query("consents")
    .withIndex("by_person_and_purpose", (q) => q.eq("personId", person._id).eq("purpose", "consular_attestation"))
    .take(100)
  const consentId =
    consents.find((row) => row.networkId === network._id && isConsentInForce([row], "consular_attestation"))?._id ??
    (await ctx.db.insert("consents", {
      personId: person._id,
      networkId: network._id,
      purpose: "consular_attestation",
      textVersion: CONSENT_TEXT_VERSIONS.consular_attestation,
      origin: "prompt",
      grantedAt: now,
    }))
  await ctx.db.insert("consularAttestations", {
    networkId: network._id,
    personId: person._id,
    subjectKind: "emailHash",
    subjectHash: await sha256Hex(subject),
    consentId,
    consentRef,
    result: "verified",
    country,
    postSlug: DEMO_POST_SLUG,
    attestedAt: now,
    requestedAt: now,
    respondedAt: now,
  })
}

/**
 * EA-01 — l'admission fondatrice FICTIVE de l'acteur, par le vrai chemin de décision
 * (`admitFounder` : membre active, plafond de la cohorte, motif), sans opérateur :
 * seul l'équipement de démonstration décide ainsi. Une admission en vigueur n'est pas rejouée.
 */
async function ensureDemoFoundingAdmission(ctx: MutationCtx, network: Doc<"networks">, person: Doc<"persons">, seniorityWaiver: boolean, now: number): Promise<void> {
  if (await activeFoundingAdmissionOf(ctx, network._id, person._id)) return
  await admitFounder(ctx, network, { personId: person._id, reason: DEMO_FOUNDING_REASON, seniorityWaiver, admittedByPersonId: null, now })
}

/** Le parrainage du filleul par le parrain de la démonstration, s'il n'en a aucun en cours. */
async function ensureSponsorship(ctx: MutationCtx, network: Doc<"networks">, sponsor: Doc<"persons">, sponsoredPersonId: Id<"persons">, now: number): Promise<void> {
  if (sponsor._id === sponsoredPersonId) return
  const sponsorMembership = await getMembership(ctx, network._id, sponsor._id)
  if (sponsorMembership?.status !== "verifiee") return
  if ((await activeSponsorshipOf(ctx, network._id, sponsoredPersonId)) !== null) return
  await ctx.db.insert("sponsorships", { networkId: network._id, sponsorPersonId: sponsor._id, sponsoredPersonId, createdAt: now })
}

/**
 * L'équipe de modération de démonstration du réseau, créée une seule fois (active, sans
 * périmètre). Partagée avec la graine locale du banc de recette (`seed.matchmakingBenchForRecette`) : les deux
 * chemins retrouvent la même équipe par son nom, quel que soit l'ordre.
 */
export async function ensureDemoModerationTeam(ctx: MutationCtx, network: Doc<"networks">, now: number): Promise<{ teamId: Id<"moderationTeams">; created: boolean }> {
  const teams = await ctx.db.query("moderationTeams").withIndex("by_network_active", (q) => q.eq("networkId", network._id).eq("active", true)).take(101)
  const existing = teams.find((team) => team.name === DEMO_MODERATION_TEAM)
  if (existing) return { teamId: existing._id, created: false }
  return { teamId: await ctx.db.insert("moderationTeams", { networkId: network._id, name: DEMO_MODERATION_TEAM, active: true, createdAt: now }), created: true }
}

/** La personne parmi les membres actifs de l'équipe ; rend `true` si elle ne l'était pas encore. */
export async function ensureModerationTeamMember(ctx: MutationCtx, network: Doc<"networks">, teamId: Id<"moderationTeams">, personId: Id<"persons">, now: number): Promise<boolean> {
  const member = await ctx.db.query("moderationTeamMembers").withIndex("by_team_person", (q) => q.eq("teamId", teamId).eq("personId", personId)).unique()
  if (!member) {
    await ctx.db.insert("moderationTeamMembers", { networkId: network._id, teamId, personId, active: true, updatedAt: now })
    return true
  }
  if (member.active) return false
  await ctx.db.patch(member._id, { active: true, updatedAt: now })
  return true
}

/** L'équipe de modération de démonstration, et la personne parmi ses membres actifs. */
async function ensureModerationTeam(ctx: MutationCtx, network: Doc<"networks">, person: Doc<"persons">, now: number): Promise<void> {
  const { teamId } = await ensureDemoModerationTeam(ctx, network, now)
  await ensureModerationTeamMember(ctx, network, teamId, person._id, now)
}

/**
 * La page de l'acteur dans DIASPORA.GA, créée une fois, dans le pays de l'acteur ;
 * la personne en est l'administratrice acceptée. Rend son identifiant et si elle
 * vient d'être créée (les gestes de la page ne se jouent qu'à la création).
 */
async function ensureDemoPage(
  ctx: MutationCtx,
  network: Doc<"networks">,
  person: Doc<"persons">,
  country: string,
  spec: DiasporaGaDemoPage,
  now: number,
): Promise<{ pageId: Id<"pages">; created: boolean }> {
  const ownerKind = spec.kind
  checked(() => assertTrustAllowedForOwner(ownerKind, spec.trust))
  const handle = checked(() => assertPageHandle(spec.handle))
  const existing = await ctx.db.query("pages").withIndex("by_handle", (q) => q.eq("handle", handle)).unique()
  let pageId: Id<"pages">
  let created = false
  if (existing) {
    // Une page du même identifiant qui n'est pas celle de la démonstration n'est jamais reprise.
    if (existing.createdByPersonId !== person._id || existing.networkId !== network._id) return fail("conflict")
    pageId = existing._id
  } else {
    await assertPageHandleFree(ctx, handle)
    const name = checked(() => assertPageName(spec.name))
    const city = checked(() => normalizePageCity(spec.city))
    const associationType = checked(() => normalizePageAssociationType(ownerKind, spec.associationType))
    const sector = checked(() => normalizePageSector(ownerKind, spec.sector))
    const visibility = "network" as const
    pageId = await ctx.db.insert("pages", {
      networkId: network._id,
      handle,
      name,
      ownerKind,
      trust: spec.trust,
      trustRank: pageTrustRank(spec.trust),
      country,
      ...(city !== undefined ? { city } : {}),
      ...(associationType !== undefined ? { associationType } : {}),
      ...(sector !== undefined ? { sector } : {}),
      visibility,
      onRoot: isPageOnRoot(network, visibility),
      status: "active",
      createdByPersonId: person._id,
      searchText: pageSearchText({ name, handle }),
      createdAt: now,
      updatedAt: now,
    })
    await moderateContentWrite(ctx, {
      networkId: network._id,
      ownerPersonId: person._id,
      kind: "page",
      id: pageId,
      text: [name, city, associationType, sector].filter((part) => part !== undefined).join(" "),
    })
    created = true
  }
  const signatory = await ctx.db.query("pageSignatories").withIndex("by_page_person", (q) => q.eq("pageId", pageId).eq("personId", person._id)).unique()
  if (!signatory) await ctx.db.insert("pageSignatories", { networkId: network._id, pageId, personId: person._id, role: "admin", acceptedAt: now, createdAt: now, updatedAt: now })
  else if (signatory.role !== "admin" || signatory.acceptedAt === undefined) await ctx.db.patch(signatory._id, { role: "admin", acceptedAt: signatory.acceptedAt ?? now, updatedAt: now })
  return { pageId, created }
}

/**
 * Le blocage d'un acteur par un autre, par le vrai mécanisme du moteur
 * (`blockPair`, le corps de `blockPerson`) et avec ses gardes : le bloqueur membre
 * actif du réseau, la cible vivante. Une intention déjà posée n'est pas rejouée.
 */
async function ensureDemoBlock(ctx: MutationCtx, network: Doc<"networks">, blocker: Doc<"persons">, target: Doc<"persons">): Promise<void> {
  if (blocker._id === target._id || target.deletionRequestedAt !== undefined || target.erasedAt !== undefined) return
  if (!(await isActiveMember(ctx, network._id, blocker._id))) return
  if (await ownBlockIntent(ctx, blocker._id, target._id)) return
  await blockPair(ctx, { networkId: network._id, blockerPersonId: blocker._id, targetPersonId: target._id })
}

/**
 * Les blocages de la démonstration autour de l'acteur : celui qu'il subit, si son
 * bloqueur est déjà équipé, et ceux qu'il pose, envers ses bloqués déjà équipés.
 * L'ordre d'équipement n'y change rien, comme pour le parrainage.
 */
async function ensureDemoBlocks(ctx: MutationCtx, network: Doc<"networks">, actor: DiasporaGaDemoActor, person: Doc<"persons">): Promise<void> {
  const blockedBy = DIASPORA_GA_DEMO_ACTOR_SPECS[actor].blockedBy
  if (blockedBy !== null) {
    const blocker = await personOfActor(ctx, blockedBy)
    if (blocker) await ensureDemoBlock(ctx, network, blocker, person)
  }
  for (const blocked of DIASPORA_GA_DEMO_ACTORS) {
    if (DIASPORA_GA_DEMO_ACTOR_SPECS[blocked].blockedBy !== actor) continue
    const target = await personOfActor(ctx, blocked)
    if (target) await ensureDemoBlock(ctx, network, person, target)
  }
}

/**
 * La suspension de la RACINE, par le chemin de la console (`suspendRootMembership`,
 * partagé avec `suspendEverywhere`) : elle vaut partout, DIASPORA.GA compris, et
 * l'adhésion DIASPORA.GA garde son statut propre. Déjà suspendue : rien.
 */
async function ensureRootSuspension(ctx: MutationCtx, personId: Id<"persons">): Promise<void> {
  const root = await getRootNetwork(ctx)
  const membership = root ? await getMembership(ctx, root._id, personId) : null
  if (!membership) return fail("notFound")
  if (membership.status !== "suspendue") await suspendRootMembership(ctx, membership)
}

/**
 * L'utilisateur extérieur au réseau : son compte ANTSIA seulement. Il exige
 * l'accueil d'ANTSIA rejoué par l'application (profil publié, consentement au
 * profil social), puis l'admet à la RACINE par la vraie règle d'admission, comme
 * les comptes de démonstration de la racine (`platform/demoAccounts`). Rien ne
 * s'écrit dans DIASPORA.GA : ni adhésion, ni fait, ni pays.
 */
async function admitOutsiderToRoot(ctx: MutationCtx, person: Doc<"persons">): Promise<void> {
  if (!person.handle || !person.displayName || person.publishedAt === undefined) return fail("profileRequired")
  // borné : un consentement par finalité et par réseau.
  const consents = await ctx.db.query("consents").withIndex("by_person_and_purpose", (q) => q.eq("personId", person._id)).take(100)
  if (missingConsentsToJoin(consents).length > 0) return fail("consentRequired")
  const root = await getRootNetwork(ctx)
  if (!root) return fail("notFound")
  const membership = await getMembership(ctx, root._id, person._id)
  if (membership && membership.status !== "partie") return
  const evidence = { strongIdentity: await hasStrongIdentityFor(ctx, person._id), externalVerification: false, sponsored: false }
  const entry = entryStatusFor(root.membershipPolicy, evidence)
  if (entry === null) return fail("policyRefused")
  await admitToNetwork(ctx, { personId: person._id, network: root, root, entry, evidence })
  await refreshReaderContexts(ctx, root._id, person._id)
}

/**
 * @selfScoped Développement local ou démonstration déclarée seulement : équipe le compte de la SESSION en
 * l'acteur demandé, si son adresse vérifiée est celle de cet acteur. Exige
 * l'adhésion faite par le vrai accueil (`joinDiasporaGa`), sauf pour
 * l'utilisateur extérieur au réseau, qui n'en a pas ; idempotente — un second
 * appel ne recrée rien. Rend le statut EFFECTIF dans DIASPORA.GA (une suspension
 * de la racine vaut partout) et le rôle, `null` sans adhésion, puis la page de
 * l'acteur (avec `pageCreated` : les gestes de la page ne se jouent qu'une fois).
 * CH-817 E3 : un acteur que la règle ne PROPOSE pas ici (module ou pays fermé, recette
 * hors du développement local) est refusé (`policyRefused`, le refus de toute autre
 * garde), avant toute écriture. CH-817 E4 : planifie ses publications d'exemple
 * (`demoContent.animateActor`), et celles des filleuls que son parrainage vient de déclarer.
 */
export const equipMyDemoAccount = personMutation({
  args: { actor: demoActorValidator },
  returns: v.object({
    actor: demoActorValidator,
    status: v.union(membershipStatusValidator, v.null()),
    role: v.union(membershipRoleValidator, v.null()),
    pageId: v.union(v.id("pages"), v.null()),
    pageCreated: v.boolean(),
  }),
  handler: async (ctx, { actor }) => {
    if (!devToolsAllowed()) return fail("policyRefused")
    const person = ctx.person
    if ((await verifiedEmailOf(ctx, person.authUserId)) !== diasporaGaDemoEmailOf(actor)) return fail("policyRefused")
    const spec = DIASPORA_GA_DEMO_ACTOR_SPECS[actor]
    // Le nouvel arrivant remplit l'accueil lui-même : rien à équiper.
    if (spec.profile === null) return fail("policyRefused")
    const network = await diasporaGaNetwork(ctx)
    if (!network) return fail("notFound")
    // CH-817 E3 : la règle du catalogue tient aussi l'équipement — un acteur non proposé ici ne s'équipe pas.
    if (!(await offeredDemoActors(ctx, network)).includes(actor)) return fail("policyRefused")

    // L'extérieur au réseau : son compte ANTSIA seulement ; son adhésion DIASPORA.GA, s'il en a pris une, reste la sienne.
    if (spec.outsider) {
      await admitOutsiderToRoot(ctx, person)
      const { membership, status } = await effectiveStatusIn(ctx, network, person._id)
      return { actor, status: membership ? status : null, role: membership?.role ?? null, pageId: null, pageCreated: false }
    }

    const joined = await getMembership(ctx, network._id, person._id)
    if (!joined || joined.status === "partie") return fail("notFound")
    const now = Date.now()

    await ensureDemoCountryHubs(ctx, network, now)

    // Les faits, puis la vraie dérivation (un lien IDN posé après coup n'est pas relu pour diaspora-ga).
    if (spec.grounds.idn) await ensureDemoIdentity(ctx, actor, person, spec.grounds.idn, now)
    if (spec.grounds.consularAttestation) await ensureDemoAttestation(ctx, network, actor, person, spec.country, now)
    if (spec.grounds.foundingAdmission) await ensureDemoFoundingAdmission(ctx, network, person, spec.grounds.foundingAdmission.seniorityWaiver, now)
    if (spec.grounds.sponsored) {
      const sponsor = await personOfActor(ctx, DEMO_SPONSOR)
      if (sponsor) await ensureSponsorship(ctx, network, sponsor, person._id, now)
    }
    let membership = await rederive(ctx, network, person._id, now)
    if (!membership) return fail("notFound")

    // Le parrain : vérifié depuis plus de 30 jours ; il complète le filleul déjà équipé avant lui.
    if (spec.canSponsor && membership.status === "verifiee") {
      const seniority = now - SPONSOR_SENIORITY_DAYS * DAY_MS
      if (membership.statusChangedAt > seniority) await ctx.db.patch(membership._id, { statusChangedAt: seniority })
      for (const sponsored of DIASPORA_GA_DEMO_ACTORS) {
        if (!DIASPORA_GA_DEMO_ACTOR_SPECS[sponsored].grounds.sponsored) continue
        const filleul = await personOfActor(ctx, sponsored)
        if (!filleul || !(await getMembership(ctx, network._id, filleul._id))) continue
        await ensureSponsorship(ctx, network, person, filleul._id, now)
        await rederive(ctx, network, filleul._id, now)
        // CH-817 E4 : le filleul équipé avant son parrain, déclaré à l'instant, publie à son tour.
        await ctx.scheduler.runAfter(0, internal.modules.diaspora.demoContent.animateActor, { actor: sponsored })
      }
    }

    if (membership.role !== spec.role) await ctx.db.patch(membership._id, { role: spec.role })
    if (spec.moderationTeam) await ensureModerationTeam(ctx, network, person, now)
    const page = spec.page ? await ensureDemoPage(ctx, network, person, spec.country, spec.page, now) : null
    await ensureDemoBlocks(ctx, network, actor, person)

    // En dernier : une sanction n'est jamais dérivée, et une adhésion suspendue ne se rejoint plus.
    membership = await getMembership(ctx, network._id, person._id)
    if (!membership) return fail("notFound")
    if (spec.grounds.suspended && membership.status !== "suspendue") {
      const before = membership.status === "declaree" || membership.status === "verifiee" || membership.status === "en_attente" ? membership.status : undefined
      await setMembershipStatus(ctx, membership, "suspendue", before !== undefined ? { statusBeforeSuspension: before } : {})
    }
    if (spec.grounds.suspendedAtRoot) await ensureRootSuspension(ctx, person._id)
    // Le statut que lit l'application : une suspension de la racine vaut partout.
    const final = await effectiveStatusIn(ctx, network, person._id)
    if (!final.membership || final.status === null) return fail("notFound")
    // CH-817 E4 : ses publications d'exemple, ses réactions et son commentaire, écrits après cette transaction.
    await ctx.scheduler.runAfter(0, internal.modules.diaspora.demoContent.animateActor, { actor })
    return { actor, status: final.status, role: final.membership.role, pageId: page?.pageId ?? null, pageCreated: page?.created ?? false }
  },
})

/** Un seul inventaire paginé par mutation, dans l’ordre réactions, commentaires, publications. */
const RETIREMENT_BATCH = 32
const retirementCursor = v.object({
  collection: v.union(v.literal("reactions"), v.literal("comments"), v.literal("posts")),
  cursor: v.union(v.string(), v.null()),
})
type RetirementCursor = { collection: "reactions" | "comments" | "posts"; cursor: string | null }

async function retirementContent(ctx: MutationCtx, networkId: Id<"networks">, personId: Id<"persons">, start?: RetirementCursor) {
  const postsQuery = () => ctx.db.query("posts").withIndex("by_network_author_status_publishedAt", q =>
    q.eq("networkId", networkId).eq("authorPersonId", personId).eq("status", "published"))
  const commentsQuery = () => ctx.db.query("postComments").withIndex("by_authorPersonId", q => q.eq("authorPersonId", personId))
    .filter(q => q.and(q.eq(q.field("networkId"), networkId), q.eq(q.field("status"), "published")))
  const reactionsQuery = () => ctx.db.query("postReactions").withIndex("by_person", q => q.eq("personId", personId))
    .filter(q => q.eq(q.field("networkId"), networkId))

  let authored: Doc<"posts">[] = []
  let comments: Doc<"postComments">[] = []
  let reactions: Doc<"postReactions">[] = []
  let batch = start
  let next: RetirementCursor | null = null
  if (!batch) {
    const initial = await Promise.all([
      postsQuery().take(RETIREMENT_BATCH + 1), commentsQuery().take(RETIREMENT_BATCH + 1), reactionsQuery().take(RETIREMENT_BATCH + 1),
    ])
    authored = initial[0]
    comments = initial[1]
    reactions = initial[2]
    if (initial.some(rows => rows.length > RETIREMENT_BATCH)) {
      batch = { collection: "reactions", cursor: null }
      authored = []
      comments = []
      reactions = []
    }
  }
  if (batch) {
    const opts = { numItems: RETIREMENT_BATCH, cursor: batch.cursor }
    if (batch.collection === "reactions") {
      const page = await reactionsQuery().paginate(opts)
      reactions = page.page
      next = page.isDone ? { collection: "comments", cursor: null } : { collection: "reactions", cursor: page.continueCursor }
    } else if (batch.collection === "comments") {
      const page = await commentsQuery().paginate(opts)
      comments = page.page
      next = page.isDone ? { collection: "posts", cursor: null } : { collection: "comments", cursor: page.continueCursor }
    } else {
      const page = await postsQuery().paginate(opts)
      authored = page.page
      next = page.isDone ? null : { collection: "posts", cursor: page.continueCursor }
    }
  }
  const removableComments: Doc<"postComments">[] = []
  const retainedComments: Doc<"postComments">[] = []
  for (const comment of comments) {
    // markCommentRemoved retire une racine ET ses réponses. Une réponse tierce protège la racine.
    const selectedReplies = new Set(comments.filter(row => row.parentCommentId === comment._id).map(row => row._id))
    const replies = comment.parentCommentId ? [] : await ctx.db.query("postComments")
      .withIndex("by_post_parent_status_createdAt", q => q.eq("postId", comment.postId).eq("parentCommentId", comment._id).eq("status", "published"))
      .take(selectedReplies.size + 1)
    if (replies.some(row => !selectedReplies.has(row._id))) retainedComments.push(comment)
    else removableComments.push(comment)
  }
  const removablePosts: Doc<"posts">[] = []
  const retainedPosts: Doc<"posts">[] = []
  const threadState = []
  for (const post of authored) {
    const [commentsCount, shares, reactionsCount, otherComment, otherReaction] = await Promise.all([
      countComments(ctx, post._id), countShares(ctx, post._id), readReactionCounts(ctx, post._id),
      ctx.db.query("postComments").withIndex("by_post_parent_status_createdAt", q => q.eq("postId", post._id))
        .filter(q => q.and(q.eq(q.field("status"), "published"), q.neq(q.field("authorPersonId"), personId))).first(),
      ctx.db.query("postReactions").withIndex("by_post_and_person", q => q.eq("postId", post._id))
        .filter(q => q.neq(q.field("personId"), personId)).first(),
    ])
    threadState.push([post._id, post.updatedAt, commentsCount, shares, reactionsCount.total, otherComment?._id, otherReaction?._id])
    if (shares || otherComment || otherReaction) retainedPosts.push(post)
    else removablePosts.push(post)
  }
  const removedIds = new Set(removablePosts.map(post => post._id))
  // Le curseur peut reprendre au milieu d’un auteur : le départ dépend de TOUTES ses publications.
  const personal = await postsQuery().filter(q => q.eq(q.field("pageId"), undefined)).take(removedIds.size + 1)
  const retainsAuthor = personal.some(post => !removedIds.has(post._id))
  return { removablePosts, retainedPosts, removableComments, retainedComments, reactions, threadState, retainsAuthor, next }

}

/**
 * Retire un acteur réservé de DIASPORA. L'appel sans applyPreview est une simulation.
 * Le jeton lie la confirmation au réseau, à la personne vérifiée et aux lignes relues.
 * Le curseur suivant resimule le lot suivant. Après le passage de tous les acteurs, une nouvelle
 * passe peut retirer les fils qui n’avaient pour participants que d’autres acteurs désormais retirés.
 * Aucun message, fichier de stockage ou compte racine n’est effacé.
 */
export const retireDemoActor = internalMutation({
  args: { actor: demoActorValidator, applyPreview: v.optional(v.string()), start: v.optional(retirementCursor) },
  returns: v.object({
    preview: v.string(), applied: v.boolean(), membership: v.boolean(), posts: v.number(),
    page: v.boolean(), sharedPageRetained: v.boolean(), sessions: v.number(), moreSessions: v.boolean(),
    comments: v.number(), reactions: v.number(), retainedPosts: v.number(), retainedComments: v.number(), membershipRetained: v.boolean(), next: v.union(retirementCursor, v.null()),
  }),
  handler: async (ctx, { actor, applyPreview, start }) => {
    const network = await diasporaGaNetwork(ctx)
    if (!network) throw new Error("DIASPORA network unavailable")
    const email = diasporaGaDemoEmailOf(actor)
    const user = await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: "user", where: [{ field: "email", value: email }], select: ["_id", "email", "emailVerified"],
    }) as { _id: string; email: string; emailVerified: boolean } | null
    const verified = user?.emailVerified && user.email.trim().toLowerCase() === email ? user : null
    const person = verified ? await ctx.db.query("persons")
      .withIndex("by_authUserId", q => q.eq("authUserId", verified._id)).unique() : null
    const sessions = verified ? await ctx.runQuery(components.betterAuth.adapter.findMany, {
      model: "session", where: [{ field: "userId", value: verified._id }],
      paginationOpts: { cursor: null, numItems: DEMO_SESSIONS_PER_ACCOUNT },
    }) as { page: Array<{ _id: string }>; isDone: boolean } : null
    const membership = person ? await getMembership(ctx, network._id, person._id) : null
    const activity = person ? await retirementContent(ctx, network._id, person._id, start) : {
      removablePosts: [], retainedPosts: [], removableComments: [], retainedComments: [], reactions: [], threadState: [], retainsAuthor: false, next: null,
    }
    // Les publications personnelles d’un membre parti deviennent illisibles, avec les réponses de tiers.
    const membershipRetained = Boolean(membership && membership.status !== "partie" &&
      (activity.next !== null || activity.retainsAuthor))
    const leave = membership !== null && membership.status !== "partie" && !membershipRetained
    const privacy = person ? await privacyOf(ctx, network._id, person._id) : null
    const hideProfile = privacy !== null && (privacy.directoryVisibility !== "hidden" || privacy.guestProfile === true)
    const [sponsorCode, sponsorship, founding] = leave && person ? await Promise.all([
      sponsorCodeOf(ctx, network._id, person._id), activeSponsorshipOf(ctx, network._id, person._id), activeFoundingAdmissionOf(ctx, network._id, person._id),
    ]) : [null, null, null]
    const pageSpec = DIASPORA_GA_DEMO_ACTOR_SPECS[actor].page
    const candidate = pageSpec && person ? await ctx.db.query("pages")
      .withIndex("by_handle", q => q.eq("handle", pageSpec.handle)).unique() : null
    const page = candidate?.networkId === network._id && candidate.createdByPersonId === person?._id &&
      candidate.status === "active" ? candidate : null
    const otherManager = page && person ? await ctx.db.query("pageSignatories")
      .withIndex("by_page_person", q => q.eq("pageId", page._id)).filter(q => q.neq(q.field("personId"), person._id)).first() : null
    // Une autre signature, une publication tierce ou un service de la page exigent de garder son adresse active.
    const pageRemoved = new Set(activity.removablePosts.filter(post => post.pageId === page?._id).map(post => post._id))
    const pagePosts = page ? await ctx.db.query("posts").withIndex("by_network_page_status_publishedAt", q =>
      q.eq("networkId", network._id).eq("pageId", page._id).eq("status", "published")).take(pageRemoved.size + 1) : []
    const remainingPagePost = pagePosts.find(post => !pageRemoved.has(post._id))
    const pageUsage = page && person ? await Promise.all([
      ctx.db.query("pageFollows").withIndex("by_page_person", q => q.eq("pageId", page._id)).filter(q => q.neq(q.field("personId"), person._id)).first(),
      ctx.db.query("liveSessions").withIndex("by_page_status", q => q.eq("pageId", page._id)).first(),
      ctx.db.query("events").withIndex("by_page_idempotency", q => q.eq("organizerPageId", page._id)).first(),
      ctx.db.query("shops").withIndex("by_page", q => q.eq("pageId", page._id)).first(),
    ]) : []
    const sharedPageRetained = Boolean(page && (otherManager || remainingPagePost || pageUsage.some(Boolean)))
    const deactivate = page !== null && !sharedPageRetained
    const sessionIds = (sessions?.page ?? []).map(session => session._id).sort()
    const preview = await sha256Hex(JSON.stringify([network._id, actor, verified?._id, membership?._id, membership?.status,
      membership?.role, membership?.directoryListed, hideProfile, leave, membershipRetained, sponsorCode?._id, sponsorship?._id, founding?._id, activity.threadState,
      activity.removableComments.map(row => [row._id, row.updatedAt]), activity.retainedComments.map(row => row._id),
      activity.reactions.map(row => [row._id, row.kind]), page?._id, deactivate, otherManager?._id,
      pageUsage.map(row => row?._id), remainingPagePost?._id, sessionIds, sessions?.isDone, start, activity.next]))
    if (applyPreview !== undefined && applyPreview !== preview) throw new Error("Review a fresh DIASPORA fixture preview")
    if (applyPreview !== undefined) {
      if (membership && person && (leave || membershipRetained)) await assertLeaveKeepsNetworkAdmin(ctx, network._id, person._id)
      const now = Date.now()
      for (const reaction of activity.reactions) {
        await ctx.db.delete(reaction._id)
        await applyReactionDelta(ctx, reaction.postId, reaction.personId, reaction.kind, -1)
      }
      // Les réponses sont retirées avant leurs racines pour ne jamais décompter une réponse deux fois.
      for (const comment of activity.removableComments.filter(row => row.parentCommentId)) await markCommentRemoved(ctx, comment, now)
      for (const comment of activity.removableComments.filter(row => !row.parentCommentId)) await markCommentRemoved(ctx, comment, now)
      for (const post of activity.removablePosts) await markPostRemoved(ctx, post, now)
      if (deactivate && page) await applyPageStatus(ctx, page, "inactive", now)
      if (hideProfile && person) await writePrivacy(ctx, network._id, person._id, { directoryVisibility: "hidden", guestProfile: false })
      if (leave && membership && person) {
        if (sponsorCode) await ctx.db.delete(sponsorCode._id)
        if (sponsorship) await endSponsorshipOnDeparture(ctx, network._id, person._id, now)
        if (founding) await endFoundingAdmissionOnDeparture(ctx, network._id, person._id, now)
        await setMembershipStatus(ctx, membership, "partie", { leftAt: now, directoryListed: false, sponsorPersonId: undefined })
      }
      if (membershipRetained && membership && person) {
        if (membership.role !== "member") {
          const change = await setMembershipRole(ctx, { network, personId: person._id, role: "member" })
          if (change.changed) await appendAudit(ctx, {
            action: "membership.role_set",
            capacity: "system",
            networkId: network._id,
            subject: { table: "persons", id: change.personId },
            details: { from: change.from, to: change.to, origin: "diaspora_demo_retirement" },
            at: now,
          })
        }
        if (membership.directoryListed) await setDirectoryListed(ctx, network._id, person._id, false)
      }
      for (const sessionId of sessionIds) await ctx.runMutation(components.betterAuth.adapter.deleteOne, {
        input: { model: "session", where: [{ field: "_id", value: sessionId }] },
      })
    }
    return { preview, applied: applyPreview !== undefined, membership: leave, posts: activity.removablePosts.length,
      comments: activity.removableComments.length, reactions: activity.reactions.length, retainedPosts: activity.retainedPosts.length,
      retainedComments: activity.retainedComments.length, membershipRetained, next: activity.next,
      page: deactivate, sharedPageRetained, sessions: sessionIds.length, moreSessions: sessions?.isDone === false }
  },
})
