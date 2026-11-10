/**
 * Faits et gardes de la tranche `diaspora` — aucune fonction Convex ici.
 *
 * - Le réseau servi est CELUI que la tranche gouverne (`managedBy = "diaspora"`) :
 *   tout autre réseau, archivé ou absent, reçoit le refus indistinct.
 * - Le statut d'adhésion ne se saisit pas : il se DÉRIVE de faits relus à chaque
 *   acte (lien IDN et sa garantie, parrainage en vigueur, attestation consulaire,
 *   départ) par LA règle du domaine (`deriveMembershipStatus`), jamais mise en cache.
 * - Les niveaux fins de la facette et le niveau d'annuaire vivent dans
 *   `memberPrivacy` ; les valeurs de la facette, dans `personFacets` du moteur.
 */
import { type ConsentPurpose, isConsentInForce } from "@antsia/social-domain/consent"
import { effectiveAccessStatus, isActiveStatus, type MembershipStatus, type VerificationSource } from "@antsia/social-domain/membership"
import {
  DEFAULT_DIRECTORY_VISIBILITY,
  DEFAULT_FACET_VISIBILITY,
  deriveMembershipStatus,
  DIASPORALE_SLICE,
  type DiasporaFacet,
  type DirectoryVisibility,
  engineVerificationSource,
  type FacetVisibility,
  facetFromEngine,
  idnGroundFromLink,
  type MembershipGrounds,
} from "@diasporale/domain"

import type { Doc, Id } from "../../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../../_generated/server"
import { getMembership } from "../../lib/access"
import { notFound } from "../../lib/errors"
import { promoteDerivedRootMembership, setDirectoryListed, setMembershipStatus } from "../people/admission"
import { liveIdentityLinks } from "../people/persons"

/** Le réseau est-il celui que la tranche gouverne, et actif ? */
export function isDiasporaNetwork(network: Doc<"networks"> | null): network is Doc<"networks"> {
  return network !== null && network.status === "active" && network.managedBy === DIASPORALE_SLICE
}

/** Garde des fonctions bornées par le réseau : tout autre réseau reçoit le refus indistinct. */
export function assertDiasporaNetwork(network: Doc<"networks">): void {
  if (!isDiasporaNetwork(network)) notFound()
}

/**
 * Le parrainage EN VIGUEUR d'une personne dans le réseau. Un nouveau parrainage
 * n'est admis que si aucun n'est en vigueur : c'est donc toujours le dernier.
 */
export async function activeSponsorshipOf(
  ctx: QueryCtx,
  networkId: Id<"networks">,
  personId: Id<"persons">,
): Promise<Doc<"sponsorships"> | null> {
  const latest = await ctx.db
    .query("sponsorships")
    .withIndex("by_network_and_sponsored", (q) => q.eq("networkId", networkId).eq("sponsoredPersonId", personId))
    .order("desc")
    .first()
  return latest && latest.revokedAt === undefined ? latest : null
}

/** Le parrainage s'éteint avec le départ de la personne parrainée ; le journal reste. */
export async function endSponsorshipOnDeparture(
  ctx: MutationCtx,
  networkId: Id<"networks">,
  personId: Id<"persons">,
  now: number,
): Promise<void> {
  const active = await activeSponsorshipOf(ctx, networkId, personId)
  if (active) await ctx.db.patch(active._id, { revokedAt: now, revokedBy: "departure" })
}

/** Les faits d'éligibilité d'une personne, relus à l'acte. */
export async function membershipGrounds(
  ctx: QueryCtx,
  networkId: Id<"networks">,
  personId: Id<"persons">,
  membership: Doc<"networkMemberships"> | null,
): Promise<MembershipGrounds> {
  const links = await liveIdentityLinks(ctx, personId)
  const idn = links.find((link) => link.provider === "idn")
  return {
    idn: idn ? idnGroundFromLink(idn) : null,
    sponsored: (await activeSponsorshipOf(ctx, networkId, personId)) !== null,
    consularAttestation: links.some((link) => link.provider === "consular_attestation"),
    // Une sanction vit dans le statut du moteur (ici ou à la racine) : la garde la lit à chaque appel.
    suspension: null,
    leftAt: membership?.status === "partie" ? (membership.leftAt ?? membership.statusChangedAt) : null,
  }
}

/**
 * Relit LA règle du statut après un fait nouveau et l'applique. Un départ reste
 * un départ (il ne se rejoue qu'au retour) ; une sanction garde la main, mais le
 * statut à rendre à sa levée suit les faits. Le parrain en vigueur et la source
 * de vérification sont tenus à jour avec le statut.
 */
export async function applyDerivedStatus(
  ctx: MutationCtx,
  membership: Doc<"networkMemberships">,
  grounds: MembershipGrounds,
  sponsorPersonId: Id<"persons"> | null,
  now: number,
): Promise<MembershipStatus> {
  if (membership.status === "partie") return "partie"
  const derived = deriveMembershipStatus(grounds, now)
  const sponsor = sponsorPersonId ?? undefined
  if (membership.status === "suspendue") {
    await ctx.db.patch(membership._id, {
      ...(isActiveStatus(derived) ? { statusBeforeSuspension: derived } : {}),
      sponsorPersonId: sponsor,
    })
    return "suspendue"
  }
  const verifiedBy: VerificationSource | undefined = derived === "verifiee" ? (engineVerificationSource(grounds, now) ?? undefined) : undefined
  const extra = {
    verifiedBy,
    sponsorPersonId: sponsor,
  }
  if (derived === membership.status) await ctx.db.patch(membership._id, extra)
  else await setMembershipStatus(ctx, membership, derived, extra)
  if (derived === "verifiee" && verifiedBy !== undefined) {
    await promoteDerivedRootMembership(ctx, membership.personId, membership.networkId, verifiedBy)
  }
  return derived
}

/** Le statut qui compte pour lire et agir : une suspension à la racine vaut partout. */
export async function effectiveStatusIn(
  ctx: QueryCtx,
  network: Doc<"networks">,
  personId: Id<"persons">,
): Promise<{ membership: Doc<"networkMemberships"> | null; status: MembershipStatus | null; rootStatus: MembershipStatus | null }> {
  const membership = await getMembership(ctx, network._id, personId)
  const rootMembership = network.parentId ? await getMembership(ctx, network.parentId, personId) : null
  const rootStatus = rootMembership?.status ?? null
  return {
    membership,
    status: effectiveAccessStatus({ networkStatus: membership?.status ?? null, rootStatus, isRoot: false }),
    rootStatus,
  }
}

/**
 * Pose le pré-filtre de l'annuaire du moteur (`directoryListed`) selon LA règle
 * de la tranche : listé si la personne a choisi un niveau visible ET que son
 * consentement `directory` est en vigueur. La recherche rejuge chaque candidat
 * (`directory.searchMembers`) : ce drapeau n'ouvre rien à lui seul. À appeler
 * après tout réglage du niveau ou du consentement d'annuaire.
 */
export async function syncDirectoryListing(ctx: MutationCtx, networkId: Id<"networks">, personId: Id<"persons">): Promise<void> {
  const privacy = await privacyOf(ctx, networkId, personId)
  const visible = privacy !== null && privacy.directoryVisibility !== "hidden"
  await setDirectoryListed(ctx, networkId, personId, visible && (await consentInForce(ctx, networkId, personId, "directory")))
}

/**
 * NP-01 — la ligne de consentement compte-t-elle pour ce réseau ? Le profil social vaut pour la
 * personne entière (sa ligne n'a pas de réseau ; une ligne posée pour ce réseau compte aussi).
 * Toute autre finalité vaut pour le RÉSEAU EXACT, comme le moteur la relit avant d'agir (accord
 * aux notifications avant un envoi, `notificationConsent` ; consentement d'une demande
 * d'attestation) : une ancienne ligne sans réseau ne compte plus, et elle n'est jamais réécrite en
 * accord du réseau — la personne redonne son accord, à la bonne portée.
 */
export function consentCountsForNetwork(row: Pick<Doc<"consents">, "purpose" | "networkId">, networkId: Id<"networks">): boolean {
  if (row.purpose === "social_profile") return row.networkId === undefined || row.networkId === networkId
  return row.networkId === networkId
}

/** Un consentement est-il en vigueur pour ce réseau, à la portée de sa finalité (`consentCountsForNetwork`) ? */
export async function consentInForce(
  ctx: QueryCtx,
  networkId: Id<"networks">,
  personId: Id<"persons">,
  purpose: ConsentPurpose,
): Promise<boolean> {
  // borné : un consentement par finalité et par réseau.
  const rows = await ctx.db
    .query("consents")
    .withIndex("by_person_and_purpose", (q) => q.eq("personId", personId).eq("purpose", purpose))
    .take(100)
  return isConsentInForce(
    rows.filter((row) => consentCountsForNetwork(row, networkId)),
    purpose,
  )
}

export async function privacyOf(
  ctx: QueryCtx,
  networkId: Id<"networks">,
  personId: Id<"persons">,
): Promise<Doc<"memberPrivacy"> | null> {
  return await ctx.db
    .query("memberPrivacy")
    .withIndex("by_network_and_person", (q) => q.eq("networkId", networkId).eq("personId", personId))
    .unique()
}

/** Écrit les réglages de confidentialité propres au réseau ; un champ absent garde sa valeur (ou la protection par défaut). */
export async function writePrivacy(
  ctx: MutationCtx,
  networkId: Id<"networks">,
  personId: Id<"persons">,
  patch: { facetLevels?: FacetVisibility; directoryVisibility?: DirectoryVisibility },
): Promise<void> {
  const existing = await privacyOf(ctx, networkId, personId)
  const now = Date.now()
  const facetLevels = patch.facetLevels ? { ...patch.facetLevels } : undefined
  if (existing) {
    await ctx.db.patch(existing._id, {
      ...(facetLevels ? { facetLevels } : {}),
      ...(patch.directoryVisibility ? { directoryVisibility: patch.directoryVisibility } : {}),
      updatedAt: now,
    })
    return
  }
  await ctx.db.insert("memberPrivacy", {
    networkId,
    personId,
    facetLevels: facetLevels ?? { ...DEFAULT_FACET_VISIBILITY },
    directoryVisibility: patch.directoryVisibility ?? DEFAULT_DIRECTORY_VISIBILITY,
    updatedAt: now,
  })
}

/** La facette diaspora d'une personne : valeurs du moteur et niveaux fins de la tranche. */
export async function facetOf(
  ctx: QueryCtx,
  networkId: Id<"networks">,
  personId: Id<"persons">,
): Promise<DiasporaFacet | null> {
  const row = await ctx.db
    .query("personFacets")
    .withIndex("by_network_and_person", (q) => q.eq("networkId", networkId).eq("personId", personId))
    .unique()
  if (!row) return null
  const privacy = await privacyOf(ctx, networkId, personId)
  return facetFromEngine(row.values, privacy?.facetLevels ?? null)
}
