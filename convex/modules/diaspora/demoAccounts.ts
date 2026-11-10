/**
 * Comptes de DÉMONSTRATION de DIASPORALE — développement local, ou déploiement
 * de démonstration déclaré (ADR-0029, ADR-0038), jamais la production.
 *
 * Sur le modèle de `convex/modules/platform/demoAccounts.ts` (comptes de
 * démonstration de la racine), pour le réseau `diasporale`. Le catalogue vient
 * du domaine (`DIASPORALE_DEMO_ACTOR_SPECS`) : un acteur par statut de membre,
 * par nature de page, par rôle et par accès restreint, sur une adresse réservée
 * (`<acteur>@demo.diasporale.test`, domaine `.test` jamais routable).
 *
 * La connexion passe par le VRAI parcours OTP (code lu par `devTools.latestOtp`),
 * l'accueil par les vraies mutations (profil publié, consentements,
 * `joinDiasporale`), appelées par l'application ; les gestes ensuite (profil de
 * mentor, de talent, offres, mission) aussi. Ce module ne pose que ce qu'un
 * compte ne peut pas se donner seul, pour la seule personne de la session, et
 * seulement si son adresse vérifiée est celle de l'acteur demandé :
 * - les FAITS fictifs dont le statut se dérive — identité IDN (niveau,
 *   nationalité), attestation consulaire, parrainage par l'acteur « verifie » —
 *   puis la vraie dérivation (`applyDerivedStatus`) : aucun statut n'est écrit ;
 * - l'ancienneté d'un parrain (vérifié depuis plus de 30 jours, comme la graine
 *   `verifyForRecette`) ;
 * - le rôle de réseau et l'équipe de modération de démonstration ;
 * - la page (association, entreprise, média, communauté, institution), sa
 *   confiance et sa présentation, la personne en étant l'administratrice ;
 * - l'ouverture des pays de la démonstration, si personne n'en a encore décidé ;
 * - le blocage d'un acteur par un autre (« bloque » par « verifie »), par le vrai
 *   mécanisme du moteur (`graph/connections.blockPair`, le corps de
 *   `blockPerson`), dès que les deux comptes existent ;
 * - EN DERNIER, les sanctions, qui ne sont jamais dérivées : la suspension de
 *   l'acteur « suspendu » dans DIASPORALE seulement (une adhésion suspendue ne se
 *   rejoint plus), et celle de « suspendu-racine » à la RACINE, par le chemin de
 *   la console (`people/memberships.suspendRootMembership`, celui de
 *   `suspendEverywhere`) : elle vaut partout, sans toucher au statut propre de
 *   son adhésion DIASPORALE.
 *
 * L'utilisateur extérieur au réseau (« exterieur ») n'a pas d'adhésion
 * DIASPORALE : l'application ne rejoue que l'accueil d'ANTSIA (consentement,
 * profil publié), l'équipement l'admet à la racine par la vraie règle
 * d'admission et n'écrit rien dans DIASPORALE.
 *
 * Idempotent : rappelé, il ne recrée rien. Garde : `demoAccountsAllowed` — la
 * double garde du développement local (variable `ANTSIA_DEV_TOOLS` ET backend
 * local), ou le déploiement de démonstration déclaré par son nom même
 * (`ANTSIA_DEMO_DEPLOYMENT`), comme les comptes d'ANTSIA. Ailleurs, le catalogue
 * est vide et la mutation refuse : aucune production ne peut s'en servir.
 */
import { CONSENT_TEXT_VERSIONS, isConsentInForce, missingConsentsToJoin } from "@antsia/social-domain/consent"
import { entryStatusFor } from "@antsia/social-domain/membership"
import { assertPageHandle, assertPageName, assertTrustAllowedForOwner, pageTrustRank } from "@antsia/social-domain/pages"
import { normalizePageAssociationType, normalizePageCity, normalizePageSector } from "@antsia/social-domain/pagePresentation"
import {
  DAY_MS,
  DIASPORALE_DEMO_ACTORS,
  DIASPORALE_DEMO_ACTOR_SPECS,
  DIASPORALE_DEMO_COUNTRIES,
  DIASPORALE_NETWORK_SLUG,
  diasporaleDemoEmailOf,
  type DiasporaleDemoActor,
  type DiasporaleDemoActorSpec,
  type DiasporaleDemoPage,
} from "@diasporale/domain"
import { v } from "convex/values"

import { components } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import { type MutationCtx, query } from "../../_generated/server"
import { getMembership, getRootNetwork, isActiveMember } from "../../lib/access"
import { demoAccountsAllowed } from "../../lib/devTools"
import { checked, fail } from "../../lib/errors"
import { personMutation } from "../../lib/functions"
import { literals, membershipRoleValidator, membershipStatusValidator } from "../../lib/validators"
import { blockPair } from "../graph/connections"
import { ownBlockIntent } from "../graph/graph"
import { moderateContentWrite } from "../moderation/policy"
import { assertPageHandleFree, isPageOnRoot, pageSearchText } from "../pages/access"
import { admitToNetwork, setMembershipStatus } from "../people/admission"
import { syncIdentityForPerson } from "../people/identity"
import { suspendRootMembership } from "../people/memberships"
import { hasStrongIdentityFor, liveIdentityLinks } from "../people/persons"
import { refreshReaderContexts } from "../posts/feedMaterialization"
import { sha256Hex } from "./attestation"
import { activeSponsorshipOf, applyDerivedStatus, effectiveStatusIn, isDiasporaNetwork, membershipGrounds } from "./facts"
import { hubRow } from "./hubs"

export const demoActorValidator = literals(DIASPORALE_DEMO_ACTORS)

/** Le parrain des acteurs parrainés : l'acteur « verifie », vérifié depuis plus de 30 jours. */
const DEMO_SPONSOR: DiasporaleDemoActor = "verifie"
/** Ancienneté posée au parrain : au-delà du délai de parrainage (30 jours, strictement). */
const SPONSOR_SENIORITY_DAYS = 31
/** L'équipe de modération de démonstration (sans périmètre : elle reçoit les nouveaux signalements). */
const DEMO_MODERATION_TEAM = "Équipe de démonstration"
/** Le poste consulaire FICTIF des attestations de démonstration. */
const DEMO_POST_SLUG = "poste-de-demonstration"

/** Sujets fictifs, propres à DIASPORALE : ceux de la racine (`demo-idn-<acteur>`) portent les mêmes noms d'acteurs. */
function demoIdnSubjectOf(actor: DiasporaleDemoActor): string {
  return `diasporale-demo-idn-${actor}`
}

function demoAttestationSubjectOf(actor: DiasporaleDemoActor): string {
  return `diasporale-demo-attestation-${actor}`
}

/**
 * @publicProjection Développement local ou démonstration déclarée seulement : le
 * catalogue des comptes de démonstration de DIASPORALE (acteur et adresse
 * réservée), vide partout ailleurs, production comprise.
 */
export const catalogue = query({
  args: {},
  returns: v.array(v.object({ actor: demoActorValidator, email: v.string() })),
  handler: async () => {
    if (!demoAccountsAllowed()) return []
    return DIASPORALE_DEMO_ACTORS.map((actor) => ({ actor, email: diasporaleDemoEmailOf(actor) }))
  },
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

async function diasporaleNetwork(ctx: MutationCtx): Promise<Doc<"networks"> | null> {
  const network = await ctx.db.query("networks").withIndex("by_slug", (q) => q.eq("slug", DIASPORALE_NETWORK_SLUG)).unique()
  return isDiasporaNetwork(network) ? network : null
}

/**
 * Un acteur déjà entré, retrouvé par l'identifiant de son profil fictif. L'identifiant
 * public ne suffit pas : une autre personne peut le porter ; seule compte celle dont
 * l'adresse vérifiée est l'adresse réservée de l'acteur.
 */
async function personOfActor(ctx: MutationCtx, actor: DiasporaleDemoActor): Promise<Doc<"persons"> | null> {
  const profile = DIASPORALE_DEMO_ACTOR_SPECS[actor].profile
  if (profile === null) return null
  const person = await ctx.db.query("persons").withIndex("by_handle", (q) => q.eq("handle", profile.handle)).unique()
  if (!person || (await verifiedEmailOf(ctx, person.authUserId)) !== diasporaleDemoEmailOf(actor)) return null
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
 * Les pays de la démonstration (France, Belgique, Canada), ouverts seulement si
 * personne n'a encore décidé des pays du réseau (aucune trace dans
 * `networkSettingsHistory`) ; une décision existante n'est jamais touchée.
 */
async function openDemoCountries(ctx: MutationCtx, network: Doc<"networks">, now: number): Promise<void> {
  const decided = await ctx.db.query("networkSettingsHistory").withIndex("by_network_and_at", (q) => q.eq("networkId", network._id)).first()
  let open = network.openCountries ?? []
  if (decided === null) {
    const next = [...open, ...DIASPORALE_DEMO_COUNTRIES.filter((country) => !open.includes(country))]
    if (next.length !== open.length) {
      await ctx.db.patch(network._id, { openCountries: next, updatedAt: now })
      open = next
    }
  }
  for (const country of DIASPORALE_DEMO_COUNTRIES) {
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
  actor: DiasporaleDemoActor,
  person: Doc<"persons">,
  idn: NonNullable<DiasporaleDemoActorSpec["grounds"]["idn"]>,
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
  actor: DiasporaleDemoActor,
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

/** Le parrainage du filleul par le parrain de la démonstration, s'il n'en a aucun en cours. */
async function ensureSponsorship(ctx: MutationCtx, network: Doc<"networks">, sponsor: Doc<"persons">, sponsoredPersonId: Id<"persons">, now: number): Promise<void> {
  if (sponsor._id === sponsoredPersonId) return
  const sponsorMembership = await getMembership(ctx, network._id, sponsor._id)
  if (sponsorMembership?.status !== "verifiee") return
  if ((await activeSponsorshipOf(ctx, network._id, sponsoredPersonId)) !== null) return
  await ctx.db.insert("sponsorships", { networkId: network._id, sponsorPersonId: sponsor._id, sponsoredPersonId, createdAt: now })
}

/** L'équipe de modération de démonstration, et la personne parmi ses membres actifs. */
async function ensureModerationTeam(ctx: MutationCtx, network: Doc<"networks">, person: Doc<"persons">, now: number): Promise<void> {
  const teams = await ctx.db.query("moderationTeams").withIndex("by_network_active", (q) => q.eq("networkId", network._id).eq("active", true)).take(101)
  const teamId = teams.find((team) => team.name === DEMO_MODERATION_TEAM)?._id
    ?? await ctx.db.insert("moderationTeams", { networkId: network._id, name: DEMO_MODERATION_TEAM, active: true, createdAt: now })
  const member = await ctx.db.query("moderationTeamMembers").withIndex("by_team_person", (q) => q.eq("teamId", teamId).eq("personId", person._id)).unique()
  if (!member) await ctx.db.insert("moderationTeamMembers", { networkId: network._id, teamId, personId: person._id, active: true, updatedAt: now })
  else if (!member.active) await ctx.db.patch(member._id, { active: true, updatedAt: now })
}

/**
 * La page de l'acteur dans DIASPORALE, créée une fois, dans le pays de l'acteur ;
 * la personne en est l'administratrice acceptée. Rend son identifiant et si elle
 * vient d'être créée (les gestes de la page ne se jouent qu'à la création).
 */
async function ensureDemoPage(
  ctx: MutationCtx,
  network: Doc<"networks">,
  person: Doc<"persons">,
  country: string,
  spec: DiasporaleDemoPage,
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
async function ensureDemoBlocks(ctx: MutationCtx, network: Doc<"networks">, actor: DiasporaleDemoActor, person: Doc<"persons">): Promise<void> {
  const blockedBy = DIASPORALE_DEMO_ACTOR_SPECS[actor].blockedBy
  if (blockedBy !== null) {
    const blocker = await personOfActor(ctx, blockedBy)
    if (blocker) await ensureDemoBlock(ctx, network, blocker, person)
  }
  for (const blocked of DIASPORALE_DEMO_ACTORS) {
    if (DIASPORALE_DEMO_ACTOR_SPECS[blocked].blockedBy !== actor) continue
    const target = await personOfActor(ctx, blocked)
    if (target) await ensureDemoBlock(ctx, network, person, target)
  }
}

/**
 * La suspension de la RACINE, par le chemin de la console (`suspendRootMembership`,
 * partagé avec `suspendEverywhere`) : elle vaut partout, DIASPORALE compris, et
 * l'adhésion DIASPORALE garde son statut propre. Déjà suspendue : rien.
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
 * s'écrit dans DIASPORALE : ni adhésion, ni fait, ni pays.
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
 * l'adhésion faite par le vrai accueil (`joinDiasporale`), sauf pour
 * l'utilisateur extérieur au réseau, qui n'en a pas ; idempotente — un second
 * appel ne recrée rien. Rend le statut EFFECTIF dans DIASPORALE (une suspension
 * de la racine vaut partout) et le rôle, `null` sans adhésion, puis la page de
 * l'acteur (avec `pageCreated` : les gestes de la page ne se jouent qu'une fois).
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
    if (!demoAccountsAllowed()) return fail("policyRefused")
    const person = ctx.person
    if ((await verifiedEmailOf(ctx, person.authUserId)) !== diasporaleDemoEmailOf(actor)) return fail("policyRefused")
    const spec = DIASPORALE_DEMO_ACTOR_SPECS[actor]
    // Le nouvel arrivant remplit l'accueil lui-même : rien à équiper.
    if (spec.profile === null) return fail("policyRefused")
    const network = await diasporaleNetwork(ctx)
    if (!network) return fail("notFound")

    // L'extérieur au réseau : son compte ANTSIA seulement ; son adhésion DIASPORALE, s'il en a pris une, reste la sienne.
    if (spec.outsider) {
      await admitOutsiderToRoot(ctx, person)
      const { membership, status } = await effectiveStatusIn(ctx, network, person._id)
      return { actor, status: membership ? status : null, role: membership?.role ?? null, pageId: null, pageCreated: false }
    }

    const joined = await getMembership(ctx, network._id, person._id)
    if (!joined || joined.status === "partie") return fail("notFound")
    const now = Date.now()

    await openDemoCountries(ctx, network, now)

    // Les faits, puis la vraie dérivation (un lien IDN posé après coup n'est pas relu pour diasporale).
    if (spec.grounds.idn) await ensureDemoIdentity(ctx, actor, person, spec.grounds.idn, now)
    if (spec.grounds.consularAttestation) await ensureDemoAttestation(ctx, network, actor, person, spec.country, now)
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
      for (const sponsored of DIASPORALE_DEMO_ACTORS) {
        if (!DIASPORALE_DEMO_ACTOR_SPECS[sponsored].grounds.sponsored) continue
        const filleul = await personOfActor(ctx, sponsored)
        if (!filleul || !(await getMembership(ctx, network._id, filleul._id))) continue
        await ensureSponsorship(ctx, network, person, filleul._id, now)
        await rederive(ctx, network, filleul._id, now)
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
    return { actor, status: final.status, role: final.membership.role, pageId: page?.pageId ?? null, pageCreated: page?.created ?? false }
  },
})
