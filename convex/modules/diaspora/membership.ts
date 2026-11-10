/**
 * Adhésion à DIASPORALE — entrer, parrainer, retirer un parrainage, quitter
 * (DIASPORALE PD1, cahier DIASPORALE §6.2, EXF-DG-04, arbitrage A3) ; nommer les
 * responsables du réseau (MD-01, LX-03 : le rôle vit sur l'adhésion).
 *
 * Le réseau est GOUVERNÉ par cette tranche (`managedBy = "diaspora"`) : les
 * chemins génériques du moteur le refusent, car ils ignorent la nationalité
 * IDN, le parrainage et l'attestation consulaire. Ici, le statut se DÉRIVE des
 * faits par la règle du domaine (`@diasporale/domain`), dans l'ordre du moteur :
 * adhésion → éligibilité → limitation de débit → droit. L'adhésion ANTSIA dérivée
 * naît avec l'entrée (invariant 3) ; aucune adhésion n'est créée sans geste.
 */
import { CONSENT_TEXT_VERSIONS as ENGINE_CONSENT_TEXT_VERSIONS, isConsentInForce, missingConsentsToJoin } from "@antsia/social-domain/consent"
import { assertDecisionReason } from "@antsia/social-domain/audit"
import { isActiveStatus } from "@antsia/social-domain/membership"
import {
  capabilitiesOf,
  checkSponsorship,
  CONSENT_PURPOSES as DIASPORALE_CONSENT_PURPOSES,
  checkSponsorshipRevocation,
  DEFAULT_DIRECTORY_VISIBILITY,
  deriveMembershipStatus,
  type DiasporaFacet,
  engineVerificationSource,
  idnGroundFromLink,
  membershipStatusDrift,
  parseFacetInput,
  personBadges,
  type SponsorFacts,
  type SponsorshipRefusal,
  sponsorSeniorityReachedAt,
  SPONSORSHIP_WINDOW_DAYS,
  sponsorshipWindowStart,
  SPONSORSHIPS_PER_WINDOW,
  sponsorStanding,
  toEngineFacet,
  writeRateTier,
} from "@diasporale/domain"
import { v } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import { query, type QueryCtx } from "../../_generated/server"
import { getCurrentPerson, getMembership, getRootNetwork } from "../../lib/access"
import { checked, fail, failAppRule, notFound } from "../../lib/errors"
import { networkMutation, networkQuery, personMutation } from "../../lib/functions"
import { enforceRateLimit } from "../../lib/rateLimit"
import { membershipRoleValidator, membershipStatusValidator } from "../../lib/validators"
import { isBlockedBetween } from "../graph/graph"
import { admitToNetwork, setMembershipStatus, writeNetworkFacet } from "../people/admission"
import { notifyPerson } from "../notifications/notify"
import { appendAudit, networkRoleCapacity } from "../platform/audit"
import { findPublishedPersonByHandle } from "../people/miniProfile"
import { networkRoleAuditEntry, setMembershipRole } from "../people/networkRoles"
import { hasStrongIdentityFor, liveIdentityLinks } from "../people/persons"
import {
  activeFoundingAdmissionOf,
  activeSponsorshipOf,
  applyDerivedStatus,
  assertDiasporaNetwork,
  consentCountsForNetwork,
  consentInForce,
  effectiveStatusIn,
  endFoundingAdmissionOnDeparture,
  endSponsorshipOnDeparture,
  facetOf,
  groundsFrom,
  isDiasporaNetwork,
  membershipGrounds,
  privacyOf,
  rederiveMembership,
  syncDirectoryListing,
  writePrivacy,
} from "./facts"
import {
  attestationOutcomeValidator,
  consentPurposeValidator,
  directoryVisibilityValidator,
  facetInputValidator,
  memberCapabilityValidator,
  ownFacetValidator,
  personLabelValidator,
  sponsorshipRefusalValidator,
  trustBadgeValidator,
  writeRateTierValidator,
} from "./validators"

/** Le journal des parrainages donnés, tel que l'écran « Parrainer » l'affiche : les plus récents. */
export const SPONSORSHIP_LOG_MAX = 50

/** La facette de la personne pour elle-même : copie (aucune liste du domaine ne sort par référence). */
function ownFacetView(facet: DiasporaFacet | null) {
  return facet ? { ...facet, associationIds: [...facet.associationIds], visibility: { ...facet.visibility } } : null
}

/** Une personne citée par son identifiant public et son nom affiché — seulement si son profil est publié. */
function labelOf(person: Doc<"persons"> | null): { handle: string; displayName: string } {
  if (!person || person.publishedAt === undefined || person.withdrawnAt !== undefined) return { handle: "", displayName: "" }
  return { handle: person.handle ?? "", displayName: person.displayName ?? "" }
}

/**
 * @selfScoped La personne de la session entre dans DIASPORALE par la tranche qui
 * le gouverne : son statut se dérive de SES faits (IDN et sa garantie, parrainage,
 * attestation consulaire) ; sa facette suit les règles du domaine (pays hors
 * Gabon, ville, année d'arrivée) et le poste consulaire n'est jamais saisi.
 */
export const joinDiasporale = personMutation({
  args: {
    networkId: v.id("networks"),
    facet: facetInputValidator,
    directoryVisibility: v.optional(directoryVisibilityValidator),
  },
  returns: v.object({ status: membershipStatusValidator, rootStatus: membershipStatusValidator }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "network.join", ctx.person._id)
    const network = await ctx.db.get(args.networkId)
    if (!isDiasporaNetwork(network)) return notFound()
    const root = await getRootNetwork(ctx)
    if (!root) return notFound()
    if (!ctx.person.handle || !ctx.person.displayName || ctx.person.publishedAt === undefined) return fail("profileRequired")
    // borné : un consentement par finalité et par réseau.
    const consents = await ctx.db
      .query("consents")
      .withIndex("by_person_and_purpose", (q) => q.eq("personId", ctx.person._id))
      .take(100)
    if (missingConsentsToJoin(consents).length > 0) return fail("consentRequired")

    const now = Date.now()
    const facet = parseFacetInput(args.facet, now, (await facetOf(ctx, network._id, ctx.person._id)) ?? undefined)
    if (!facet.ok) return failAppRule(facet.code, {}, "invalidArgument")
    const directoryVisibility =
      args.directoryVisibility ?? (await privacyOf(ctx, network._id, ctx.person._id))?.directoryVisibility ?? DEFAULT_DIRECTORY_VISIBILITY
    if (directoryVisibility !== "hidden" && !(await consentInForce(ctx, network._id, ctx.person._id, "directory"))) {
      return failAppRule("consent_directory_required")
    }

    // Un retour après un départ : le parrainage et l'admission fondatrice se sont éteints avec le départ.
    const existing = await getMembership(ctx, network._id, ctx.person._id)
    if (existing?.status === "partie") {
      await endSponsorshipOnDeparture(ctx, network._id, ctx.person._id, now)
      await endFoundingAdmissionOnDeparture(ctx, network._id, ctx.person._id, now)
    }
    const grounds = await membershipGrounds(ctx, network._id, ctx.person._id, null)
    const entry = deriveMembershipStatus(grounds, now)
    // Défensif : sans départ ni sanction dans les faits relus, l'entrée est toujours active.
    if (!isActiveStatus(entry)) return notFound()
    const sponsorship = await activeSponsorshipOf(ctx, network._id, ctx.person._id)
    const source = engineVerificationSource(grounds, now)
    const admitted = await admitToNetwork(ctx, {
      personId: ctx.person._id,
      network,
      root,
      entry,
      evidence: {
        strongIdentity: await hasStrongIdentityFor(ctx, ctx.person._id),
        externalVerification: grounds.consularAttestation,
        sponsored: grounds.sponsored,
      },
      ...(source ? { verifiedBy: source } : {}),
      ...(sponsorship ? { sponsorPersonId: sponsorship.sponsorPersonId } : {}),
    })
    // Déjà membre actif : les faits ont pu changer depuis l'entrée (IDN liée…), la règle est relue.
    const status =
      existing && isActiveStatus(existing.status)
        ? await applyDerivedStatus(ctx, existing, grounds, sponsorship?.sponsorPersonId ?? null, now)
        : admitted.status

    await writeNetworkFacet(ctx, network, ctx.person._id, toEngineFacet(facet.value))
    await writePrivacy(ctx, network._id, ctx.person._id, { facetLevels: facet.value.visibility, directoryVisibility })
    // Annuaire opt-in : masqué par défaut, listé au seul choix d'un niveau visible.
    await syncDirectoryListing(ctx, network._id, ctx.person._id)
    return { status, rootStatus: admitted.rootStatus }
  },
})

/**
 * Ce que la règle du parrainage sait du PARRAIN : son statut, son ancienneté (ou sa
 * dispense, accordée avec une admission fondatrice en vigueur, EA-01), son quota glissant.
 */
async function sponsorFactsOf(
  ctx: QueryCtx & { networkId: Id<"networks">; person: Doc<"persons">; membership: Doc<"networkMemberships"> },
  now: number,
): Promise<SponsorFacts> {
  // borné : au-delà du quota, le refus est acquis ; inutile de compter plus loin.
  const recent = await ctx.db
    .query("sponsorships")
    .withIndex("by_network_and_sponsor_and_createdAt", (q) =>
      q.eq("networkId", ctx.networkId).eq("sponsorPersonId", ctx.person._id).gt("createdAt", sponsorshipWindowStart(now)),
    )
    .take(SPONSORSHIPS_PER_WINDOW)
  const status = ctx.membership.status
  const founding = status === "verifiee" ? await activeFoundingAdmissionOf(ctx, ctx.networkId, ctx.person._id) : null
  return {
    status,
    ...(status === "verifiee" ? { verifiedSince: ctx.membership.statusChangedAt } : {}),
    ...(founding?.seniorityWaiver === true ? { seniorityWaived: true } : {}),
    sponsorshipsInWindow: recent.length,
  }
}

/** Les bornes d'un refus, pour que l'écran dise « à partir du … » ou « dix par trente jours ». */
function sponsorRefusalParams(code: SponsorshipRefusal, facts: SponsorFacts): Record<string, number> {
  if (code === "sponsor_too_recent" && facts.verifiedSince !== undefined) {
    return { availableAt: sponsorSeniorityReachedAt(facts.verifiedSince) }
  }
  if (code === "sponsor_quota_reached") return { limit: SPONSORSHIPS_PER_WINDOW, windowDays: SPONSORSHIP_WINDOW_DAYS }
  return {}
}

/**
 * Un membre parraine un compte de DIASPORALE, désigné par son identifiant public.
 * Le parrain d'abord (vérifié depuis plus de 30 jours, dix par fenêtre glissante
 * de 30 jours), la cible ensuite, en un refus INDISTINCT (`target_not_eligible`) :
 * parrainer n'apprend rien du statut d'autrui, ni de son existence, ni d'un blocage.
 */
export const sponsor = networkMutation({
  minStatus: "en_attente",
  args: { handle: v.string() },
  returns: v.object({ sponsorshipId: v.id("sponsorships") }),
  handler: async (ctx, { handle }) => {
    assertDiasporaNetwork(ctx.network)
    await enforceRateLimit(ctx, "diaspora.sponsor", ctx.person._id)
    const now = Date.now()
    const facts = await sponsorFactsOf(ctx, now)
    // Une personne joignable (profil publié, membre active du réseau), et sans blocage
    // dans la paire, dans un sens ou dans l'autre : sinon, le même refus indistinct.
    const target = await findPublishedPersonByHandle(ctx, ctx.networkId, handle.trim().replace(/^@/, ""))
    const blocked = target !== null && (await isBlockedBetween(ctx, ctx.person._id, target._id))
    const targetAccess = target && !blocked ? await effectiveStatusIn(ctx, ctx.network, target._id) : null
    const check = checkSponsorship(
      facts,
      {
        isSelf: target?._id === ctx.person._id,
        status: targetAccess?.status ?? "partie",
        alreadySponsored: target ? (await activeSponsorshipOf(ctx, ctx.networkId, target._id)) !== null : false,
      },
      now,
    )
    if (!check.ok) return failAppRule(check.code, sponsorRefusalParams(check.code, facts))
    // Inatteignable : la règle a déjà refusé une cible absente ou non membre.
    if (!target || blocked || !targetAccess?.membership) return notFound()

    const sponsorshipId = await ctx.db.insert("sponsorships", {
      networkId: ctx.networkId,
      sponsorPersonId: ctx.person._id,
      sponsoredPersonId: target._id,
      createdAt: now,
    })
    const grounds = await membershipGrounds(ctx, ctx.networkId, target._id, targetAccess.membership)
    await applyDerivedStatus(ctx, targetAccess.membership, grounds, ctx.person._id, now)
    // La cloche de la personne parrainée : qui l'a admise (mini-profil publié du parrain).
    await notifyPerson(ctx, { networkId: ctx.networkId, recipientPersonId: target._id, actorPersonId: ctx.person._id, kind: "sponsorship_received" })
    return { sponsorshipId }
  },
})

/** Plancher du motif d'un retrait par la modération (règle `DECISION_REASON_LENGTH`). */
export const MODERATION_REASON_MIN = 10

/**
 * Retirer un parrainage : le parrain (un geste), ou la modération du réseau (une
 * DÉCISION : motif exigé, inscrite au journal du moteur). Le journal des
 * parrainages garde l'acte et son retrait ; le statut de la personne parrainée
 * retombe selon ses faits restants. Pour tout autre membre, le parrainage n'existe pas.
 */
export const revokeSponsorship = networkMutation({
  minStatus: "en_attente",
  args: { sponsorshipId: v.id("sponsorships"), reason: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { sponsorshipId, reason: rawReason }) => {
    assertDiasporaNetwork(ctx.network)
    await enforceRateLimit(ctx, "diaspora.sponsor.revoke", ctx.person._id)
    const sponsorship = await ctx.db.get(sponsorshipId)
    if (!sponsorship || sponsorship.networkId !== ctx.networkId) return notFound()
    const actor =
      sponsorship.sponsorPersonId === ctx.person._id
        ? "sponsor"
        : ctx.membership.role === "network_moderator" || ctx.membership.role === "network_admin"
          ? "moderator"
          : "other"
    if (actor === "other") return notFound()
    const check = checkSponsorshipRevocation({ actor, revokedAt: sponsorship.revokedAt ?? null })
    if (!check.ok) return failAppRule(check.code, {}, "conflict")
    const reason = actor === "moderator" ? checked(() => assertDecisionReason(rawReason ?? "", MODERATION_REASON_MIN)) : null

    const now = Date.now()
    await ctx.db.patch(sponsorship._id, { revokedAt: now, revokedBy: actor })
    const target = await getMembership(ctx, ctx.networkId, sponsorship.sponsoredPersonId)
    if (target) {
      const grounds = await membershipGrounds(ctx, ctx.networkId, sponsorship.sponsoredPersonId, target)
      await applyDerivedStatus(ctx, target, grounds, null, now)
    }
    // La décision de la modération entre au journal du moteur, dans la même transaction.
    const capacity = networkRoleCapacity(ctx.membership.role)
    if (reason !== null && capacity !== null) {
      await appendAudit(ctx, {
        action: "diaspora.sponsorship_revoke",
        capacity,
        actorPersonId: ctx.person._id,
        networkId: ctx.networkId,
        subject: { table: "persons", id: sponsorship.sponsoredPersonId },
        details: { sponsorPersonId: sponsorship.sponsorPersonId, reason },
      })
    }
    // La cloche de la personne parrainée ; une modération ne se désigne pas.
    await notifyPerson(ctx, {
      networkId: ctx.networkId,
      recipientPersonId: sponsorship.sponsoredPersonId,
      ...(actor === "sponsor" ? { actorPersonId: ctx.person._id } : {}),
      kind: "sponsorship_withdrawn",
    })
    return null
  },
})

/**
 * MD-01 et LX-03 — l'administration du réseau nomme (`network_admin`,
 * `network_moderator`), change ou retire (`member`) le rôle de réseau d'un
 * membre, motif à l'appui. La décision passe par l'aide du moteur
 * (`people/networkRoles.setMembershipRole`, EX-08, issue 98), qui tient pour
 * tous les chemins : jamais d'adhésion créée, adhésion active « déclarée » au
 * moins pour nommer, dernier administrateur actif gardé (`NETWORK_LAST_ADMIN`),
 * au plus cent titulaires d'un rôle (`policyRefused`). Elle entre au journal du
 * moteur dans la même transaction (`membership.role_set`, qualité
 * `network_admin`) ; un rôle déjà posé n'écrit rien. Les gardes du moteur
 * relisent le rôle à chaque appel : la file, les recours et `/pilote` s'ouvrent
 * ou se ferment au geste suivant de la personne.
 * Tout autre membre (modération du réseau comprise) : le refus indistinct, avant
 * tout jugement des arguments. Le premier administrateur est posé par un
 * opérateur de plateforme, à la console (`platform/networkRoles.setNetworkRole`).
 */
export const setResponsibleRole = networkMutation({
  minStatus: "declaree",
  writeBucket: "diaspora.moderation.decide",
  args: { personId: v.id("persons"), role: membershipRoleValidator, reason: v.string() },
  returns: v.object({ role: membershipRoleValidator, changed: v.boolean() }),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    if (ctx.membership.role !== "network_admin") return notFound()
    const reason = checked(() => assertDecisionReason(args.reason, MODERATION_REASON_MIN))
    const change = await setMembershipRole(ctx, { network: ctx.network, personId: args.personId, role: args.role })
    // La décision entre au journal du moteur, dans la même transaction (rien si le rôle était déjà le sien).
    if (change.changed) {
      await appendAudit(ctx, networkRoleAuditEntry({ networkId: ctx.networkId, change, actor: { personId: ctx.person._id, capacity: "network_admin" }, reason }))
    }
    return { role: change.to, changed: change.changed }
  },
})

/**
 * Quitter DIASPORALE (l'adhésion ANTSIA reste) ; le parrainage reçu et l'admission
 * fondatrice s'éteignent avec le départ (leur journal reste), et le rôle de réseau
 * avec lui (moteur, EX-08).
 */
export const leaveDiasporale = networkMutation({
  minStatus: "en_attente",
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    assertDiasporaNetwork(ctx.network)
    await enforceRateLimit(ctx, "network.leave", ctx.person._id)
    const now = Date.now()
    await endSponsorshipOnDeparture(ctx, ctx.networkId, ctx.person._id, now)
    await endFoundingAdmissionOnDeparture(ctx, ctx.networkId, ctx.person._id, now)
    await setMembershipStatus(ctx, ctx.membership, "partie", { leftAt: now, sponsorPersonId: undefined })
    return null
  },
})

/**
 * @selfScoped EA-03 — la personne de la session fait relire SON statut quand ses
 * faits ont changé hors de la tranche (IDN liée, niveau relevé, lien révoqué) :
 * les faits sont relus et LA règle appliquée, sans rien saisir. Seulement si un
 * écart existe (`myMembership.statusOutdated`) ; sinon rien n'est écrit. Un départ
 * et une sanction (ici ou à la racine) restent inchangés : refus indistinct.
 */
export const refreshMyMembership = personMutation({
  args: { networkId: v.id("networks") },
  returns: v.object({ status: membershipStatusValidator, changed: v.boolean() }),
  handler: async (ctx, { networkId }) => {
    await enforceRateLimit(ctx, "network.join", ctx.person._id)
    const network = await ctx.db.get(networkId)
    if (!isDiasporaNetwork(network)) return notFound()
    const access = await effectiveStatusIn(ctx, network, ctx.person._id)
    if (!access.membership || access.status === null || !isActiveStatus(access.status)) return notFound()
    const before = access.membership.status
    const now = Date.now()
    const grounds = await membershipGrounds(ctx, network._id, ctx.person._id, access.membership)
    if (membershipStatusDrift(before, grounds, now) === null) return { status: before, changed: false }
    const status = await rederiveMembership(ctx, access.membership, now)
    return { status, changed: status !== before }
  },
})

/**
 * @selfScoped La personne de la session lit SON adhésion à DIASPORALE : statut
 * effectif (une suspension ANTSIA vaut ici), facette complète avec ses niveaux,
 * badges calculés, parrain en vigueur, dernière demande d'attestation (sans la
 * raison consulaire), capacités, et si son statut enregistré n'est plus celui
 * que ses faits justifient (`statusOutdated`, EA-03). `null` sans personne, sans
 * réseau ou sans adhésion.
 */
export const myMembership = query({
  args: { networkId: v.id("networks") },
  returns: v.union(
    v.null(),
    v.object({
      status: membershipStatusValidator,
      role: membershipRoleValidator,
      joinedAt: v.number(),
      verifiedSince: v.union(v.number(), v.null()),
      facet: v.union(ownFacetValidator, v.null()),
      directoryVisibility: directoryVisibilityValidator,
      sponsoredBy: v.union(personLabelValidator, v.null()),
      attestation: v.object({
        outcome: attestationOutcomeValidator,
        postSlug: v.union(v.string(), v.null()),
        requestedAt: v.union(v.number(), v.null()),
      }),
      root: v.object({ status: v.union(membershipStatusValidator, v.null()) }),
      badges: v.array(trustBadgeValidator),
      capabilities: v.array(memberCapabilityValidator),
      rateTier: writeRateTierValidator,
      /** EA-03 : le statut enregistré diffère de celui que les faits justifient (à relire). Jamais pour un départ ou une sanction. */
      statusOutdated: v.boolean(),
    }),
  ),
  handler: async (ctx, { networkId }) => {
    const person = await getCurrentPerson(ctx)
    if (!person) return null
    const network = await ctx.db.get(networkId)
    if (!isDiasporaNetwork(network)) return null
    const access = await effectiveStatusIn(ctx, network, person._id)
    if (!access.membership || access.status === null) return null
    const { membership, status } = access

    const links = await liveIdentityLinks(ctx, person._id)
    const idn = links.find((link) => link.provider === "idn")
    const consular = links.find((link) => link.provider === "consular_attestation")
    const badges = personBadges({
      ...(idn?.loa !== undefined ? { idnLoa: idn.loa } : {}),
      consularAttestation: consular !== undefined,
      administrationLink: links.some((link) => link.provider === "administration"),
      membershipStatus: status,
    })
    const sponsorship = await activeSponsorshipOf(ctx, network._id, person._id)
    // EA-03 : les mêmes faits que l'acte (`groundsFrom`), relus contre le statut enregistré.
    const grounds = groundsFrom({ links, sponsorship, foundingAdmission: await activeFoundingAdmissionOf(ctx, network._id, person._id), membership })
    const statusOutdated = isActiveStatus(status) && membershipStatusDrift(membership.status, grounds, Date.now()) !== null
    // borné : une demande d'attestation par 24 h ; les dix dernières suffisent à trouver celle du réseau.
    const requests = await ctx.db
      .query("consularAttestations")
      .withIndex("by_person_and_requestedAt", (q) => q.eq("personId", person._id))
      .order("desc")
      .take(10)
    const latest = requests.find((request) => request.networkId === network._id)

    return {
      status,
      role: membership.role,
      joinedAt: membership.joinedAt,
      verifiedSince: status === "verifiee" ? membership.statusChangedAt : null,
      facet: ownFacetView(await facetOf(ctx, network._id, person._id)),
      directoryVisibility: (await privacyOf(ctx, network._id, person._id))?.directoryVisibility ?? DEFAULT_DIRECTORY_VISIBILITY,
      sponsoredBy: sponsorship ? labelOf(await ctx.db.get(sponsorship.sponsorPersonId)) : null,
      attestation: {
        outcome: latest?.result === "verified" ? ("verified" as const) : latest?.result === "not_confirmed" ? ("not_confirmed" as const) : ("none" as const),
        postSlug: consular?.postSlug ?? null,
        requestedAt: latest?.requestedAt ?? null,
      },
      root: { status: access.rootStatus },
      badges,
      capabilities: [...capabilitiesOf(status)],
      rateTier: writeRateTier(status, badges),
      statusOutdated,
    }
  },
})

/**
 * Ce que voit le parrain avant tout geste (écran « Parrainer ») : peut-il
 * parrainer, sinon pourquoi et jusqu'à quand, ce qui reste dans la fenêtre, et le
 * journal des parrainages qu'il a donnés (les filleuls cités seulement si leur
 * profil est publié).
 */
export const sponsorDashboard = networkQuery({
  args: {},
  returns: v.object({
    eligible: v.boolean(),
    refusal: v.union(sponsorshipRefusalValidator, v.null()),
    remaining: v.number(),
    windowDays: v.number(),
    seniorityReachedAt: v.union(v.number(), v.null()),
    given: v.array(
      v.object({
        _id: v.id("sponsorships"),
        sponsored: personLabelValidator,
        createdAt: v.number(),
        revokedAt: v.union(v.number(), v.null()),
      }),
    ),
  }),
  handler: async (ctx) => {
    assertDiasporaNetwork(ctx.network)
    const now = Date.now()
    const standing = sponsorStanding(await sponsorFactsOf(ctx, now), now)
    const rows = await ctx.db
      .query("sponsorships")
      .withIndex("by_network_and_sponsor_and_createdAt", (q) => q.eq("networkId", ctx.networkId).eq("sponsorPersonId", ctx.person._id))
      .order("desc")
      .take(SPONSORSHIP_LOG_MAX)
    const given = []
    for (const row of rows) {
      given.push({
        _id: row._id,
        sponsored: labelOf(await ctx.db.get(row.sponsoredPersonId)),
        createdAt: row.createdAt,
        revokedAt: row.revokedAt ?? null,
      })
    }
    return { ...standing, given }
  },
})

/**
 * @selfScoped La personne de la session lit l'état de SES consentements pour
 * DIASPORALE (les finalités du réseau) : en vigueur ou non, date du dernier geste,
 * version du texte. Rien n'est présumé : sans geste, une finalité n'est pas accordée.
 * Chaque finalité se lit à SA portée (NP-01, `consentCountsForNetwork`) : le réseau exact
 * pour l'annuaire, les notifications, l'attestation et les talents — ce que le moteur relit
 * avant d'agir —, la personne pour le profil social. Une ancienne ligne sans réseau n'est ni
 * comptée ni réécrite : la personne redonne son accord, à la bonne portée.
 */
export const myConsents = query({
  args: { networkId: v.id("networks") },
  returns: v.array(
    v.object({
      purpose: consentPurposeValidator,
      granted: v.boolean(),
      recordedAt: v.union(v.number(), v.null()),
      textVersion: v.string(),
    }),
  ),
  handler: async (ctx, { networkId }) => {
    const person = await getCurrentPerson(ctx)
    const network = await ctx.db.get(networkId)
    if (!person || !isDiasporaNetwork(network)) return []
    // borné : un consentement par finalité et par réseau.
    const rows = await ctx.db
      .query("consents")
      .withIndex("by_person_and_purpose", (q) => q.eq("personId", person._id))
      .take(100)
    const scoped = rows.filter((row) => consentCountsForNetwork(row, network._id))
    return DIASPORALE_CONSENT_PURPOSES.map((purpose) => {
      const mine = scoped.filter((row) => row.purpose === purpose)
      const moment = (row: Doc<"consents">) => row.revokedAt ?? row.grantedAt
      const latest = mine.reduce<Doc<"consents"> | null>((best, row) => (best === null || moment(row) > moment(best) ? row : best), null)
      return {
        purpose,
        granted: isConsentInForce(mine, purpose),
        recordedAt: latest ? moment(latest) : null,
        textVersion: latest?.textVersion ?? ENGINE_CONSENT_TEXT_VERSIONS[purpose],
      }
    })
  },
})

/**
 * @selfScoped La personne de la session lit ce que DIASPORALE sait de SES liens
 * d'identité : un lien IDN et son niveau de garantie, une attestation consulaire
 * vivante — ni sujet, ni nationalité, ni aucune donnée consulaire. `null` sans personne.
 */
export const myIdentity = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({ idn: v.union(v.object({ loa: v.number() }), v.null()), consularAttestation: v.boolean() }),
  ),
  handler: async (ctx) => {
    const person = await getCurrentPerson(ctx)
    if (!person) return null
    const links = await liveIdentityLinks(ctx, person._id)
    const idn = links.find((link) => link.provider === "idn")
    return {
      idn: idn ? { loa: idnGroundFromLink(idn).loa } : null,
      consularAttestation: links.some((link) => link.provider === "consular_attestation"),
    }
  },
})
