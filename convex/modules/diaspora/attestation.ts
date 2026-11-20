/**
 * Attestation consulaire `DIASPORA-ATTESTATION-V1` — côté CONSOMMATEUR (DIASPORA.GA PD3).
 *
 * consulat.ga ATTESTE, avec le consentement de la personne, qu'une inscription
 * consulaire active existe ; il ne fédère aucune identité (IDN reste l'IdP unique).
 * Rien d'autre ne circule :
 * - la requête porte quatre champs (sujet, nature, référence de consentement, date),
 *   signée HMAC par la clé de service du déploiement — jamais dans le code ;
 * - la réponse est relue en LISTE BLANCHE (`parseAttestationResponse`) : un champ
 *   en plus, et elle est refusée ;
 * - le sujet n'est jamais conservé : la ligne garde son empreinte ;
 * - un refus ou une absence d'inscription se dit « nous n'avons pas pu confirmer »,
 *   sans raison consulaire.
 *
 * Sans configuration (`DIASPORA_ATTESTATION_URL`, `DIASPORA_PARTNER_KEY_ID`,
 * `DIASPORA_PARTNER_KEY`), rien ne part : la demande aboutit en échec technique.
 * Ces variables se posent sur un déploiement par le propriétaire, après la
 * validation juridique (arbitrage A4).
 */
import { CONSENT_TEXT_VERSIONS, isConsentInForce } from "@antsia/social-domain/consent"
import {
  applyAttestationToFacet,
  ATTESTATION_HEADERS,
  ATTESTATION_PATH,
  ATTESTATION_REQUEST_INTERVAL_MS,
  attestationRequestBody,
  type AttestationResponse,
  type AttestationSubjectKind,
  canonicalAttestationString,
  canRequestAttestation,
  hasCapability,
  isResidenceCountry,
  parseAttestationResponse,
  REGISTRATION_STATUSES,
  toEngineFacet,
} from "@diaspora-ga/domain"
import { v } from "convex/values"

import { internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import { internalAction, internalMutation, internalQuery, type QueryCtx } from "../../_generated/server"
import { failAppRule, notFound } from "../../lib/errors"
import { networkMutation, networkQuery } from "../../lib/functions"
import { enforceRateLimit } from "../../lib/rateLimit"
import { literals } from "../../lib/validators"
import { notifyPerson } from "../notifications/notify"
import { writeNetworkFacet } from "../people/admission"
import { verifiedEmailHashOf } from "../people/identity"
import { liveIdentityLinks } from "../people/persons"
import { activeSponsorshipOf, applyDerivedStatus, assertDiasporaNetwork, facetOf, isDiasporaNetwork, membershipGrounds, privacyOf, writePrivacy } from "./facts"
import { ATTESTATION_RESULTS } from "./tables"
import { attestationSubjectKindValidator } from "./validators"

/** Délai de réponse accordé à consulat.ga avant de conclure à l'échec technique. */
export const ATTESTATION_TIMEOUT_MS = 10_000

/** Taille maximale d'une réponse lue (le contrat en émet quelques centaines d'octets). */
const RESPONSE_MAX_BYTES = 4096

/** Une attente bornée : au-delà, l'appel est tenu pour un échec technique. */
function withTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("attestation_timeout")), ATTESTATION_TIMEOUT_MS)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

/** Empreinte SHA-256 hexadécimale minuscule (Web Crypto). */
export async function sha256Hex(data: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data)))
}

/** Signature `v1=<hex>` d'une chaîne canonique, avec une clé de service décodée de base64. */
export async function signAttestation(secretBase64: string, canonical: string): Promise<string> {
  const binary = atob(secretBase64)
  const secret = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) secret[index] = binary.charCodeAt(index)
  const key = await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  return `v1=${toHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(canonical)))}`
}

/**
 * Le sujet présenté à consulat.ga : le subject IDN en priorité, sinon
 * l'empreinte du canal e-mail actuellement vérifié par le composant d'identité.
 * Aucune adresse brute ne quitte cette frontière.
 */
async function subjectOf(ctx: QueryCtx, personId: Id<"persons">): Promise<{ kind: AttestationSubjectKind; subject: string } | null> {
  const idn = (await liveIdentityLinks(ctx, personId)).find((link) => link.provider === "idn")
  if (idn) return { kind: "idnSub", subject: idn.subject }
  const emailHash = await verifiedEmailHashOf(ctx, personId)
  return emailHash === null ? null : { kind: "emailHash", subject: emailHash }
}

/**
 * La personne demande à consulat.ga d'attester son inscription consulaire. Le
 * geste vaut consentement (`consular_attestation`, enregistré avant l'appel) ;
 * une demande par 24 h ; inutile pour un membre déjà vérifié.
 */
export const requestConsularAttestation = networkMutation({
  minStatus: "en_attente",
  args: { consent: v.literal(true) },
  returns: v.object({ attestationId: v.id("consularAttestations") }),
  handler: async (ctx) => {
    assertDiasporaNetwork(ctx.network)
    await enforceRateLimit(ctx, "diaspora.attestation.request", ctx.person._id)
    if (!hasCapability(ctx.membership.status, "request_attestation")) return failAppRule("attestation_not_needed", {}, "conflict")
    const now = Date.now()
    const last = await ctx.db
      .query("consularAttestations")
      .withIndex("by_person_and_requestedAt", (q) => q.eq("personId", ctx.person._id))
      .order("desc")
      .first()
    if (!canRequestAttestation(last?.requestedAt ?? null, now)) {
      return failAppRule("attestation_too_soon", { availableAt: (last?.requestedAt ?? now) + ATTESTATION_REQUEST_INTERVAL_MS })
    }
    const subject = await subjectOf(ctx, ctx.person._id)
    if (!subject) return failAppRule("attestation_unavailable")

    // Le consentement AVANT l'appel : une ligne par geste, sur le texte courant.
    // borné : un consentement par finalité et par réseau.
    const consents = await ctx.db
      .query("consents")
      .withIndex("by_person_and_purpose", (q) => q.eq("personId", ctx.person._id).eq("purpose", "consular_attestation"))
      .take(100)
    const inForce = consents.find((row) => row.networkId === ctx.networkId && isConsentInForce([row], "consular_attestation"))
    const consentId =
      inForce?._id ??
      (await ctx.db.insert("consents", {
        personId: ctx.person._id,
        networkId: ctx.networkId,
        purpose: "consular_attestation",
        textVersion: CONSENT_TEXT_VERSIONS.consular_attestation,
        origin: "prompt",
        grantedAt: now,
      }))

    const attestationId = await ctx.db.insert("consularAttestations", {
      networkId: ctx.networkId,
      personId: ctx.person._id,
      subjectKind: subject.kind,
      subjectHash: await sha256Hex(subject.subject),
      consentId,
      consentRef: `consent:${crypto.randomUUID()}`,
      result: "pending",
      requestedAt: now,
    })
    await ctx.scheduler.runAfter(0, internal.modules.diaspora.attestation.callAttestation, { attestationId })
    return { attestationId }
  },
})

/**
 * L'issue de SA propre demande (l'écran attend la réponse de consulat.ga) : en
 * cours, confirmée, non confirmée ou en échec — jamais la raison consulaire.
 * La demande d'un autre membre n'existe pas pour le lecteur.
 */
export const myAttestationRequest = networkQuery({
  args: { attestationId: v.id("consularAttestations") },
  returns: v.object({ result: literals(ATTESTATION_RESULTS) }),
  handler: async (ctx, { attestationId }) => {
    assertDiasporaNetwork(ctx.network)
    const row = await ctx.db.get(attestationId)
    if (!row || row.personId !== ctx.person._id || row.networkId !== ctx.networkId) return notFound()
    return { result: row.result }
  },
})

/** Seul le consentement initial, toujours valable et lié à cette demande, autorise sa suite. */
async function requestConsentInForce(ctx: QueryCtx, request: Doc<"consularAttestations">): Promise<boolean> {
  const consent = await ctx.db.get(request.consentId)
  return consent !== null && consent.personId === request.personId && consent.networkId === request.networkId
    && consent.purpose === "consular_attestation" && isConsentInForce([consent], "consular_attestation")
}

/** La requête à envoyer, recomposée au moment de l'appel : le sujet n'est jamais stocké. */
export const attestationRequest = internalQuery({
  args: { attestationId: v.id("consularAttestations") },
  returns: v.union(
    v.null(),
    v.object({ subjectKind: attestationSubjectKindValidator, subject: v.string(), consentRef: v.string(), requestedAt: v.number() }),
  ),
  handler: async (ctx, { attestationId }) => {
    const row = await ctx.db.get(attestationId)
    if (!row || row.result !== "pending") return null
    if (!(await requestConsentInForce(ctx, row))) return null
    const subject = await subjectOf(ctx, row.personId)
    // Le lien a changé depuis la demande : on n'envoie pas un autre sujet que celui consenti.
    if (!subject || subject.kind !== row.subjectKind || (await sha256Hex(subject.subject)) !== row.subjectHash) return null
    return { subjectKind: subject.kind, subject: subject.subject, consentRef: row.consentRef, requestedAt: row.requestedAt }
  },
})

const responseValidator = v.object({
  verified: v.boolean(),
  countryOfResidence: v.optional(v.string()),
  postSlug: v.optional(v.string()),
  registrationStatus: literals(REGISTRATION_STATUSES),
  since: v.optional(v.number()),
  attestedAt: v.number(),
})

/** Appel de consulat.ga (action) : requête signée, réponse relue en liste blanche, issue enregistrée. */
export const callAttestation = internalAction({
  args: { attestationId: v.id("consularAttestations") },
  returns: v.null(),
  handler: async (ctx, { attestationId }): Promise<null> => {
    const fail = async () => {
      await ctx.runMutation(internal.modules.diaspora.attestation.recordAttestationFailure, { attestationId })
      return null
    }
    const base = process.env.DIASPORA_ATTESTATION_URL
    const keyId = process.env.DIASPORA_PARTNER_KEY_ID
    const secret = process.env.DIASPORA_PARTNER_KEY
    if (!base || !keyId || !secret) return await fail()
    const request = await ctx.runQuery(internal.modules.diaspora.attestation.attestationRequest, { attestationId })
    if (!request) return await fail()

    try {
      const body = attestationRequestBody(request)
      const timestamp = String(Date.now())
      const signature = await signAttestation(secret, canonicalAttestationString({ timestamp, bodySha256: await sha256Hex(body) }))
      const response = await withTimeout(fetch(new URL(ATTESTATION_PATH, base), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [ATTESTATION_HEADERS.keyId]: keyId,
          [ATTESTATION_HEADERS.timestamp]: timestamp,
          [ATTESTATION_HEADERS.signature]: signature,
        },
        body,
      }))
      if (!response.ok) return await fail()
      const text = await response.text()
      if (text.length > RESPONSE_MAX_BYTES) return await fail()
      const parsed = parseAttestationResponse(JSON.parse(text) as unknown)
      if (!parsed.ok) return await fail()
      await ctx.runMutation(internal.modules.diaspora.attestation.recordAttestation, { attestationId, response: toRecorded(parsed.value) })
      return null
    } catch {
      // Réseau, délai, JSON illisible : aucune raison ne remonte à l'écran.
      return await fail()
    }
  },
})

function toRecorded(response: AttestationResponse) {
  return {
    verified: response.verified,
    ...(response.countryOfResidence !== undefined ? { countryOfResidence: response.countryOfResidence } : {}),
    ...(response.postSlug !== undefined ? { postSlug: response.postSlug } : {}),
    registrationStatus: response.registrationStatus,
    ...(response.since !== undefined ? { since: response.since } : {}),
    attestedAt: response.attestedAt,
  }
}

/** Issue technique : rien de consulaire n'est su, rien n'est posé. */
export const recordAttestationFailure = internalMutation({
  args: { attestationId: v.id("consularAttestations") },
  returns: v.null(),
  handler: async (ctx, { attestationId }) => {
    const row = await ctx.db.get(attestationId)
    if (row && row.result === "pending") await ctx.db.patch(attestationId, { result: "failed", respondedAt: Date.now() })
    return null
  },
})

/**
 * Issue de consulat.ga. Confirmée : lien d'identité `consular_attestation` (empreinte
 * du sujet, pays, poste), poste posé sur la facette (et le pays s'il manquait), statut
 * relu par la règle — `verifiee`. Non confirmée : seule l'issue est notée.
 */
export const recordAttestation = internalMutation({
  args: { attestationId: v.id("consularAttestations"), response: responseValidator },
  returns: v.null(),
  handler: async (ctx, { attestationId, response }) => {
    const row = await ctx.db.get(attestationId)
    if (!row || row.result !== "pending") return null
    const now = Date.now()
    if (!(await requestConsentInForce(ctx, row))) {
      await ctx.db.patch(attestationId, { result: "failed", respondedAt: now })
      return null
    }
    const subject = await subjectOf(ctx, row.personId)
    // Le canal peut changer pendant l'appel : seule la preuve consentie peut
    // encore produire un lien, et la raison du refus ne quitte pas le moteur.
    if (!subject || subject.kind !== row.subjectKind || (await sha256Hex(subject.subject)) !== row.subjectHash) {
      await ctx.db.patch(attestationId, { result: "failed", respondedAt: now })
      return null
    }
    const country = response.countryOfResidence
    const postSlug = response.postSlug
    const confirmed = response.verified && country !== undefined && isResidenceCountry(country) && postSlug !== undefined
    await ctx.db.patch(attestationId, {
      result: confirmed ? "verified" : "not_confirmed",
      ...(confirmed ? { country, postSlug } : {}),
      ...(confirmed && response.since !== undefined ? { since: response.since } : {}),
      attestedAt: response.attestedAt,
      respondedAt: now,
    })
    if (!confirmed) {
      // « Nous n'avons pas pu confirmer » — sans aucune raison consulaire.
      await notifyPerson(ctx, { networkId: row.networkId, recipientPersonId: row.personId, kind: "attestation_not_confirmed" })
      return null
    }

    const network = await ctx.db.get(row.networkId)
    if (!isDiasporaNetwork(network)) return null
    await linkAttestation(ctx, row, country, postSlug, now)
    const facet = applyAttestationToFacet(await facetOf(ctx, network._id, row.personId), { postSlug, countryOfResidence: country })
    await writeNetworkFacet(ctx, network, row.personId, toEngineFacet(facet))
    if (!(await privacyOf(ctx, network._id, row.personId))) await writePrivacy(ctx, network._id, row.personId, { facetLevels: facet.visibility })

    const membership = await ctx.db
      .query("networkMemberships")
      .withIndex("by_network_and_person", (q) => q.eq("networkId", network._id).eq("personId", row.personId))
      .unique()
    if (membership) {
      const grounds = await membershipGrounds(ctx, network._id, row.personId, membership)
      const sponsorship = await activeSponsorshipOf(ctx, network._id, row.personId)
      await applyDerivedStatus(ctx, membership, grounds, sponsorship?.sponsorPersonId ?? null, now)
    }
    await notifyPerson(ctx, { networkId: network._id, recipientPersonId: row.personId, kind: "attestation_verified" })
    return null
  },
})

/** Le lien d'identité de l'attestation : l'empreinte du sujet, le pays et le poste — rien d'autre. */
async function linkAttestation(
  ctx: Parameters<typeof applyDerivedStatus>[0],
  row: Doc<"consularAttestations">,
  country: string,
  postSlug: string,
  now: number,
): Promise<void> {
  const existing = (await liveIdentityLinks(ctx, row.personId)).find((link) => link.provider === "consular_attestation")
  if (existing) {
    await ctx.db.patch(existing._id, { subject: row.subjectHash, country, postSlug, linkedAt: now })
    return
  }
  await ctx.db.insert("identityLinks", {
    personId: row.personId,
    provider: "consular_attestation",
    subject: row.subjectHash,
    country,
    postSlug,
    linkedAt: now,
  })
}
