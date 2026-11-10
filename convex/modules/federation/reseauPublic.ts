/** PA9A/B/C : pages, publications et agents consentants reçus par transport signé, sans compte créé. */
import { COMMERCE_TRANSPORT_TEST_CONTRACT, RESEAU_PUBLIC_CONTRACT, type FederationEnvelope } from "@antsia/social-domain/federationProtocol"
import { isReseauPublicPersonEvent, parseReseauPublicEvent } from "@antsia/social-domain/reseauPublic"

import type { Doc } from "../../_generated/dataModel"
import type { MutationCtx } from "../../_generated/server"
import { pageSearchText } from "../pages/access"
import { federationBodyDigest } from "./signature"
import { reseauPublicNetwork } from "./reseauPublicAccess"
import { applyAdministrativePost } from "./reseauPublicPosts"
import { clearFederatedMedia, queueFederatedMedia, retryFederatedMedia } from "./mediaJobs"
import { queuePageWithdrawal } from "./withdrawal"
import { applyAdministrativeAgent } from "./reseauPublicAgents"
import { applyCommerceTransportProbe } from "./commerceTransport"
import { isCommercePublicContract } from "@antsia/social-domain/commerce/primitives"
import { applyCommerceCatalog } from "./commerceCatalog"
import { COMMERCE_JOBS_CONTRACT } from "@antsia/social-domain/commerce-jobs"
import { applyCommerceJobsEnvelope } from "./commerceJobs"
import { COMMERCE_SERVICE_NOTICE_CONTRACT } from "@antsia/social-domain/commerce-service-notices"
import { applyCommerceServiceNotice } from "./commerceServiceNotices"

export type FederationApplyFailure = "unsupported_contract" | "contract_not_allowed" | "invalid_payload" | "unsupported_event" | "unsupported_media" | "source_conflict" | "consent_required" | "identity_not_linked"
export type FederationApplyResult = { applied: true } | { applied: false; reason: FederationApplyFailure }

/** Une charge connue mais non gérée est refusée avant conservation d’un corps nouveau. */
export async function validImplementedFederationPayload(envelope: FederationEnvelope, now: number): Promise<boolean> {
  if (envelope.contract !== RESEAU_PUBLIC_CONTRACT) return true
  const parsed = parseReseauPublicEvent(envelope.payload, envelope.objectRef, now)
  return parsed.ok && (!isReseauPublicPersonEvent(parsed.event) || parsed.event.agentRef === `agent:${await federationBodyDigest(parsed.event.consentRef)}`)
}

/** Les corps des événements personnels ne deviennent jamais des lettres mortes. */
export function isPersonalFederationEnvelope(envelope: FederationEnvelope): boolean {
  // Même après effacement ou défaut de corrélation : aucun corps personnel en DLQ.
  if (envelope.contract === COMMERCE_SERVICE_NOTICE_CONTRACT) return true
  const payload = envelope.payload
  return envelope.contract === RESEAU_PUBLIC_CONTRACT && payload !== null && typeof payload === "object" && !Array.isArray(payload) && (payload.type === "person.optin" || payload.type === "person.optout")
}

/**
 * Même traitement pour l’admission et le rejeu. Tous les refus métier précèdent
 * les écritures ; une erreur inattendue remonte et annule la transaction entière.
 */
export async function applyFederationEnvelope(ctx: MutationCtx, emitter: Doc<"federationEmitters">, envelope: FederationEnvelope, now: number, rawBody?: string): Promise<FederationApplyResult> {
  if (envelope.contract === COMMERCE_TRANSPORT_TEST_CONTRACT) return await applyCommerceTransportProbe(ctx, emitter, rawBody, now)
  if (isCommercePublicContract(envelope.contract)) return await applyCommerceCatalog(ctx, emitter, rawBody, now)
  if (envelope.contract === COMMERCE_JOBS_CONTRACT) return await applyCommerceJobsEnvelope(ctx, emitter, rawBody, now)
  if (envelope.contract === COMMERCE_SERVICE_NOTICE_CONTRACT) return await applyCommerceServiceNotice(ctx, emitter, rawBody, now)
  if (envelope.contract !== RESEAU_PUBLIC_CONTRACT) return { applied: false, reason: "unsupported_contract" }
  const parsed = parseReseauPublicEvent(envelope.payload, envelope.objectRef, now)
  if (!parsed.ok) return { applied: false, reason: parsed.reason }
  const event = parsed.event
  const network = await reseauPublicNetwork(ctx, emitter)
  if (!network) return { applied: false, reason: "contract_not_allowed" }
  if (isReseauPublicPersonEvent(event)) return await applyAdministrativeAgent(ctx, emitter, network, event, now)
  if (event.type !== "page.upserted") return await applyAdministrativePost(ctx, emitter, network, event, now)

  const mirror = await ctx.db.query("mirrors").withIndex("by_emitter_environment_object", (q) => q.eq("emitterId", emitter._id).eq("environment", emitter.environment).eq("objectRef", envelope.objectRef)).unique()
  // Le digest métier ne dépend ni de l’eventId de transport ni de l’ordre JSON.
  const sourceDigest = await federationBodyDigest(JSON.stringify({
    type: event.type, orgRef: event.orgRef, revision: event.revision,
    name: event.name, shortName: event.shortName ?? null,
    description: event.description ?? null, country: event.country, verifiedAt: event.verifiedAt,
    ...(event.logo ? { logo: event.logo } : {}),
  }))
  if (mirror) {
    if (mirror.networkId !== network._id || mirror.contract !== RESEAU_PUBLIC_CONTRACT || mirror.localTable !== "pages"
      || mirror.sourceRevision === undefined || !Number.isSafeInteger(mirror.sourceRevision) || mirror.sourceRevision < 1
      || !mirror.sourceDigest || !mirror.sourceState) return { applied: false, reason: "source_conflict" }
    if (event.revision < mirror.sourceRevision) return { applied: true }
    if (event.revision === mirror.sourceRevision) {
      if (mirror.sourceDigest !== sourceDigest) return { applied: false, reason: "source_conflict" }
      await retryFederatedMedia(ctx, mirror)
      return { applied: true }
    }
  }

  const importRef = `${RESEAU_PUBLIC_CONTRACT}:${emitter.slug}:${emitter.environment}:${event.orgRef}`
  let page: Doc<"pages"> | null = null
  if (mirror?.localId !== undefined) {
    const pageId = ctx.db.normalizeId("pages", mirror.localId)
    page = pageId ? await ctx.db.get(pageId) : null
    if (!page || page.networkId !== network._id || page.importRef !== importRef || page.ownerKind !== "institution") return { applied: false, reason: "source_conflict" }
  }
  if (!page && await ctx.db.query("pages").withIndex("by_network_importRef", (q) => q.eq("networkId", network._id).eq("importRef", importRef)).unique()) {
    // Une page locale préexistante n’est jamais adoptée par une source distante.
    return { applied: false, reason: "source_conflict" }
  }
  const verified = event.verifiedAt !== null
  const handleDigest = await federationBodyDigest(`${emitter._id}\n${emitter.environment}\n${event.orgRef}`)
  const handle = page?.handle ?? `administration-${handleDigest.slice(0, 24)}`
  if (!page && verified && await ctx.db.query("pages").withIndex("by_handle", (q) => q.eq("handle", handle)).unique()) return { applied: false, reason: "source_conflict" }

  if (mirror) await clearFederatedMedia(ctx, mirror)

  // La réactivation d’une page inactive reste une décision locale explicite.
  const status = verified ? (page?.status ?? "active") : "inactive"
  const identity = {
    name: event.name, shortName: event.shortName, description: event.description,
    country: event.country, trust: verified ? "official" as const : "community" as const,
    trustRank: verified ? 2 : 0, visibility: verified ? "root" as const : "network" as const,
    onRoot: verified, status, updatedAt: now,
    searchText: pageSearchText({ name: event.name, shortName: event.shortName, handle }),
  }
  let localId = page?._id
  if (page) {
    await ctx.db.patch(page._id, { ...identity, ...(!verified ? { deactivatedAt: now } : {}) })
  } else if (verified) {
    // Les champs absents restent absents à l’insertion (pas de logo distant non admis).
    localId = await ctx.db.insert("pages", {
      networkId: network._id, handle, name: identity.name,
      ...(identity.shortName === undefined ? {} : { shortName: identity.shortName }),
      ...(identity.description === undefined ? {} : { description: identity.description }),
      country: identity.country, trust: "official", trustRank: 2,
      ownerKind: "institution", visibility: "root", onRoot: true, status: "active",
      importRef, searchText: identity.searchText, createdAt: now, updatedAt: now,
    })
  }
  const source = {
    sourceRevision: event.revision, sourceDigest,
    sourceVerifiedAt: event.verifiedAt ?? undefined,
    sourceState: verified ? "active" as const : "withdrawn" as const, updatedAt: now,
    ...(localId === undefined ? {} : { localId }),
  }
  let mirrorId = mirror?._id
  if (mirrorId) await ctx.db.patch(mirrorId, source)
  else mirrorId = await ctx.db.insert("mirrors", {
    networkId: network._id, emitterId: emitter._id, environment: emitter.environment,
    contract: RESEAU_PUBLIC_CONTRACT, objectRef: event.orgRef, localTable: "pages",
    ...source,
  })
  if (!verified) await queuePageWithdrawal(ctx, mirrorId, event.revision, now)
  else if (event.logo && localId) await queueFederatedMedia(ctx, mirrorId, event.revision, sourceDigest, [event.logo])
  return { applied: true }
}
