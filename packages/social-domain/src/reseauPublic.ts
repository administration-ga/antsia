/** PA9A/PA9B/PA9C — contrat pur des reflets fédérés, sans effet sur les personnes ni médias. */
import { CONSENT_TEXT_VERSIONS } from "./consent"
import { assertPostContent, assertPostMedia, POST_MEDIA_ALT_MAX_LENGTH } from "./content"
import { FEDERATION_MAX_SKEW_MS, validFederationReference } from "./federationProtocol"
import { PAGE_DESCRIPTION_MAX_LENGTH, PAGE_NAME_MAX_LENGTH, PAGE_SHORT_NAME_MAX_LENGTH } from "./pages"
import { UPLOAD_USAGES } from "./uploadPolicy"

export type ReseauPublicMedia = {
  url: string
  kind: "image" | "video"
  mimeType: string
  sizeBytes: number
  sha256: string
  width?: number
  height?: number
  durationMs?: number
  altText?: string
}

export type ReseauPublicPageEvent = {
  type: "page.upserted"
  orgRef: string
  revision: number
  name: string
  shortName?: string
  description?: string
  country: string
  verifiedAt: number | null
  logoUrl?: string | null
  logo?: (ReseauPublicMedia & { kind: "image" }) | null
}

export type ReseauPublicPostPublishedEvent = {
  type: "post.published"
  postRef: string
  pageRef: string
  revision: number
  body: string
  audience: "public"
  publishToAntsia: true
  media: ReseauPublicMedia[]
  publishedAt: number
}

export type ReseauPublicPostRemovedEvent = {
  type: "post.removed"
  postRef: string
  revision: number
}

export type ReseauPublicPersonOptInEvent = {
  type: "person.optin"
  agentRef: string
  revision: number
  /** Sujet IDN opaque et privé : jamais une référence publique, un DTO ou un argument de job. */
  idnSub: string
  consentRef: string
  textVersion: string
  consentedAt: number
  displayName: string
  orgRef: string
  roleLabel: string
}

export type ReseauPublicPersonOptOutEvent = {
  type: "person.optout"
  agentRef: string
  revision: number
  idnSub: string
  consentRef: string
}

export type ReseauPublicPersonEvent = ReseauPublicPersonOptInEvent | ReseauPublicPersonOptOutEvent
export type ReseauPublicEvent = ReseauPublicPageEvent | ReseauPublicPostPublishedEvent | ReseauPublicPostRemovedEvent | ReseauPublicPersonEvent

export function isReseauPublicPersonEvent(event: ReseauPublicEvent): event is ReseauPublicPersonEvent {
  return event.type === "person.optin" || event.type === "person.optout"
}

type ParseFailure = { ok: false; reason: "invalid_payload" | "unsupported_event" | "unsupported_media" }

export type ReseauPublicPageParseResult =
  | { ok: true; event: ReseauPublicPageEvent }
  | ParseFailure

export type ReseauPublicEventParseResult = { ok: true; event: ReseauPublicEvent } | ParseFailure

const PAGE_FIELDS = new Set(["type", "orgRef", "revision", "name", "shortName", "description", "country", "verifiedAt", "logoUrl", "logo"])
const REQUIRED_PAGE_FIELDS = ["type", "orgRef", "revision", "name", "country", "verifiedAt"] as const
const RESERVED_EVENTS = new Set(["post.published", "post.removed", "person.optin", "person.optout"])
const POST_PUBLISHED_FIELDS = ["type", "postRef", "pageRef", "revision", "body", "audience", "publishToAntsia", "media", "publishedAt"] as const
const POST_REMOVED_FIELDS = ["type", "postRef", "revision"] as const
const PERSON_OPT_IN_FIELDS = ["type", "agentRef", "revision", "idnSub", "consentRef", "textVersion", "consentedAt", "displayName", "orgRef", "roleLabel"] as const
const PERSON_OPT_OUT_FIELDS = ["type", "agentRef", "revision", "idnSub", "consentRef"] as const
const MEDIA_FIELDS = new Set(["url", "kind", "mimeType", "sizeBytes", "sha256", "width", "height", "durationMs", "altText"])
const REQUIRED_MEDIA_FIELDS = ["url", "kind", "mimeType", "sizeBytes", "sha256"] as const
const REMOTE_MEDIA_MAX_BYTES = 50 * 1024 * 1024
/**
 * Images d'une publication reflétée : la borne du CONTRAT signé `RESEAU-PUBLIC-V1`
 * (quatre images ou une vidéo seule), fixée avec l'émetteur. Elle ne suit pas la
 * borne des publications des membres (`POST_MEDIA_MAX_COUNT`, dix depuis M3) :
 * l'élargir est une évolution du contrat, à décider avec l'émetteur.
 */
export const RESEAU_PUBLIC_MEDIA_MAX_COUNT = 4
const REMOTE_MEDIA_DIMENSION_MAX = 32_768
const REMOTE_MEDIA_DURATION_MAX_MS = 24 * 60 * 60 * 1000

const owns = (row: Record<string, unknown>, key: string) => Object.prototype.hasOwnProperty.call(row, key)
const positiveInteger = (value: unknown, maximum = Number.MAX_SAFE_INTEGER): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= maximum

function recordOf(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function exactFields(row: Record<string, unknown>, fields: readonly string[]): boolean {
  return fields.every((key) => owns(row, key)) && Object.keys(row).every((key) => fields.includes(key))
}

function hasControlCharacter(value: string, allowParagraphs: boolean): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index)
    if (allowParagraphs && (code === 10 || code === 13)) continue
    if (code <= 31 || code === 127) return true
  }
  return false
}

function publicText(value: unknown, minLength: number, maxLength: number, allowParagraphs = false): string | null {
  if (typeof value !== "string" || hasControlCharacter(value, allowParagraphs)) return null
  const normalized = value.trim()
  return normalized.length >= minLength && normalized.length <= maxLength ? normalized : null
}

/** Filtre syntaxique seulement : le téléchargeur doit encore épingler et vérifier le DNS public. */
function publicMediaUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048 || !/^https:\/\//iu.test(value) || value !== value.trim() || hasControlCharacter(value, false) || value.includes("#") || value.includes("\\")) return null
  try {
    const url = new URL(value)
    const authority = value.slice(value.indexOf("://") + 3).split(/[/?#]/u)[0] ?? ""
    if (url.protocol !== "https:" || url.username || url.password || authority.includes("@")) return null
    const hostname = url.hostname.toLowerCase().replace(/\.$/u, "")
    // Les littéraux IPv6 sont fermés ici ; aucune résolution locale implicite.
    if (!hostname.includes(".") || hostname.includes(":") || hostname === "localhost" || /\.(?:localhost|local|localdomain|internal|home|invalid|test|onion)$/u.test(hostname)) return null
    if (/^\d+\.\d+\.\d+\.\d+$/u.test(hostname)) {
      const [a = 0, b = 0, c = 0] = hostname.split(".").map(Number)
      if (a === 0 || a === 10 || a === 127 || a >= 224
        || a === 100 && b >= 64 && b <= 127 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31
        || a === 192 && (b === 168 || b === 0 && (c === 0 || c === 2) || b === 88 && c === 99)
        || a === 198 && (b === 18 || b === 19 || b === 51 && c === 100) || a === 203 && b === 0 && c === 113) return null
    }
    const normalized = url.toString()
    return normalized.length <= 2048 ? normalized : null
  } catch {
    return null
  }
}

function parseMedia(value: unknown, logo = false): ReseauPublicMedia | null {
  const row = recordOf(value)
  if (!row || !REQUIRED_MEDIA_FIELDS.every((key) => owns(row, key)) || Object.keys(row).some((key) => !MEDIA_FIELDS.has(key))) return null
  const url = publicMediaUrl(row.url)
  if (url === null || (row.kind !== "image" && row.kind !== "video") || typeof row.mimeType !== "string" || !positiveInteger(row.sizeBytes, REMOTE_MEDIA_MAX_BYTES) || typeof row.sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(row.sha256)) return null
  if (logo && (row.kind !== "image" || !(UPLOAD_USAGES.page_logo.mimeTypes as readonly string[]).includes(row.mimeType) || row.sizeBytes > UPLOAD_USAGES.page_logo.maxBytes)) return null
  for (const key of ["width", "height"] as const) if (owns(row, key) && !positiveInteger(row[key], REMOTE_MEDIA_DIMENSION_MAX)) return null
  if (owns(row, "durationMs") && !positiveInteger(row.durationMs, REMOTE_MEDIA_DURATION_MAX_MS)) return null
  const altText = owns(row, "altText") ? publicText(row.altText, 0, POST_MEDIA_ALT_MAX_LENGTH) : undefined
  if (altText === null) return null
  const media: ReseauPublicMedia = {
    url, kind: row.kind, mimeType: row.mimeType, sizeBytes: row.sizeBytes, sha256: row.sha256,
    ...(owns(row, "width") ? { width: row.width as number } : {}),
    ...(owns(row, "height") ? { height: row.height as number } : {}),
    ...(owns(row, "durationMs") ? { durationMs: row.durationMs as number } : {}),
    ...(altText === undefined ? {} : { altText }),
  }
  try {
    assertPostMedia([media])
    return media
  } catch {
    return null
  }
}

/** Le réseau et l'émetteur viennent du registre serveur, jamais du payload. */
export function parseReseauPublicPage(payload: unknown, objectRef: string, nowMs: number): ReseauPublicPageParseResult {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return { ok: false, reason: "invalid_payload" }
  const row = payload as Record<string, unknown>
  if (typeof row.type !== "string") return { ok: false, reason: "invalid_payload" }
  if (RESERVED_EVENTS.has(row.type)) return { ok: false, reason: "unsupported_event" }
  if (row.type !== "page.upserted" || !REQUIRED_PAGE_FIELDS.every((key) => Object.prototype.hasOwnProperty.call(row, key))) return { ok: false, reason: "invalid_payload" }
  if (Object.keys(row).some((key) => !PAGE_FIELDS.has(key))) return { ok: false, reason: "invalid_payload" }
  if (typeof row.orgRef !== "string" || !validFederationReference(row.orgRef) || row.orgRef !== objectRef) return { ok: false, reason: "invalid_payload" }
  if (typeof row.revision !== "number" || !Number.isSafeInteger(row.revision) || row.revision < 1) return { ok: false, reason: "invalid_payload" }
  const name = publicText(row.name, 2, PAGE_NAME_MAX_LENGTH)
  if (name === null) return { ok: false, reason: "invalid_payload" }
  const hasShortName = Object.prototype.hasOwnProperty.call(row, "shortName")
  const shortName = hasShortName ? publicText(row.shortName, 1, PAGE_SHORT_NAME_MAX_LENGTH) : undefined
  if (shortName === null) return { ok: false, reason: "invalid_payload" }
  const hasDescription = Object.prototype.hasOwnProperty.call(row, "description")
  const description = hasDescription ? publicText(row.description, 1, PAGE_DESCRIPTION_MAX_LENGTH, true) : undefined
  if (description === null) return { ok: false, reason: "invalid_payload" }
  if (typeof row.country !== "string" || !/^[A-Z]{2}$/u.test(row.country)) return { ok: false, reason: "invalid_payload" }
  if (!Number.isFinite(nowMs) || (row.verifiedAt !== null && (typeof row.verifiedAt !== "number" || !Number.isSafeInteger(row.verifiedAt) || row.verifiedAt <= 0 || row.verifiedAt > nowMs + FEDERATION_MAX_SKEW_MS))) return { ok: false, reason: "invalid_payload" }
  const hasLogoUrl = Object.prototype.hasOwnProperty.call(row, "logoUrl")
  if (hasLogoUrl && row.logoUrl !== null) {
    return { ok: false, reason: publicText(row.logoUrl, 1, Number.MAX_SAFE_INTEGER) === null ? "invalid_payload" : "unsupported_media" }
  }
  const hasLogo = owns(row, "logo")
  let logo: ReseauPublicPageEvent["logo"]
  if (hasLogo) {
    if (row.logo === null) logo = null
    else {
      const parsedLogo = parseMedia(row.logo, true)
      if (!parsedLogo || parsedLogo.kind !== "image") return { ok: false, reason: "invalid_payload" }
      logo = { ...parsedLogo, kind: "image" }
    }
  }
  // Ordre stable : le digest métier porte la projection normalisée, pas l'ordre reçu.
  const event: ReseauPublicPageEvent = {
    type: "page.upserted",
    orgRef: row.orgRef,
    revision: row.revision,
    name,
    ...(shortName === undefined ? {} : { shortName }),
    ...(description === undefined ? {} : { description }),
    country: row.country,
    verifiedAt: row.verifiedAt,
    ...(hasLogoUrl ? { logoUrl: null } : {}),
    ...(hasLogo ? { logo } : {}),
  }
  return { ok: true, event }
}

/** La corrélation SHA-256 du nonce et l'accord local vivant sont encore exigés côté serveur. */
function parseReseauPublicPerson(row: Record<string, unknown>, objectRef: string, nowMs: number): ReseauPublicEventParseResult {
  if (!exactFields(row, row.type === "person.optin" ? PERSON_OPT_IN_FIELDS : PERSON_OPT_OUT_FIELDS)
    || typeof row.agentRef !== "string" || !/^agent:[a-f0-9]{64}$/u.test(row.agentRef) || row.agentRef !== objectRef
    || !positiveInteger(row.revision)
    || typeof row.idnSub !== "string" || row.idnSub.length < 1 || row.idnSub.length > 512 || row.idnSub !== row.idnSub.trim() || hasControlCharacter(row.idnSub, false)
    || typeof row.consentRef !== "string" || !/^[a-f0-9]{64}$/u.test(row.consentRef)) return { ok: false, reason: "invalid_payload" }
  if (row.type === "person.optout") return { ok: true, event: { type: "person.optout", agentRef: row.agentRef, revision: row.revision, idnSub: row.idnSub, consentRef: row.consentRef } }
  const displayName = publicText(row.displayName, 2, 120)
  const roleLabel = publicText(row.roleLabel, 1, 120)
  if (row.textVersion !== CONSENT_TEXT_VERSIONS.administration_reflection
    || !positiveInteger(row.consentedAt, nowMs + FEDERATION_MAX_SKEW_MS)
    || displayName === null || roleLabel === null
    || typeof row.orgRef !== "string" || !validFederationReference(row.orgRef)) return { ok: false, reason: "invalid_payload" }
  return { ok: true, event: {
    type: "person.optin", agentRef: row.agentRef, revision: row.revision,
    idnSub: row.idnSub, consentRef: row.consentRef, textVersion: row.textVersion,
    consentedAt: row.consentedAt, displayName, orgRef: row.orgRef, roleLabel,
  } }
}

/** Le parseur ne crée aucun compte, profil ni adhésion ; l'application rejuge l'autorité locale. */
export function parseReseauPublicEvent(payload: unknown, objectRef: string, nowMs: number): ReseauPublicEventParseResult {
  const row = recordOf(payload)
  if (!row || typeof row.type !== "string" || !Number.isFinite(nowMs)) return { ok: false, reason: "invalid_payload" }
  if (row.type === "page.upserted") return parseReseauPublicPage(payload, objectRef, nowMs)
  if (row.type === "person.optin" || row.type === "person.optout") return parseReseauPublicPerson(row, objectRef, nowMs)
  if (row.type !== "post.published" && row.type !== "post.removed") return { ok: false, reason: "invalid_payload" }
  if (!exactFields(row, row.type === "post.published" ? POST_PUBLISHED_FIELDS : POST_REMOVED_FIELDS)
    || typeof row.postRef !== "string" || !validFederationReference(row.postRef) || row.postRef !== objectRef || !positiveInteger(row.revision)) return { ok: false, reason: "invalid_payload" }
  if (row.type === "post.removed") return { ok: true, event: { type: "post.removed", postRef: row.postRef, revision: row.revision } }
  if (typeof row.pageRef !== "string" || !validFederationReference(row.pageRef) || row.audience !== "public" || row.publishToAntsia !== true || !Array.isArray(row.media) || row.media.length > RESEAU_PUBLIC_MEDIA_MAX_COUNT || !positiveInteger(row.publishedAt, nowMs + FEDERATION_MAX_SKEW_MS) || typeof row.body !== "string" || hasControlCharacter(row.body, true)) return { ok: false, reason: "invalid_payload" }
  const media: ReseauPublicMedia[] = []
  for (const value of row.media) {
    const item = parseMedia(value)
    if (!item) return { ok: false, reason: "invalid_payload" }
    media.push(item)
  }
  try {
    assertPostMedia(media)
    const body = assertPostContent({ body: row.body, mediaCount: media.length, isShare: false })
    return { ok: true, event: { type: "post.published", postRef: row.postRef, pageRef: row.pageRef, revision: row.revision, body, audience: "public", publishToAntsia: true, media, publishedAt: row.publishedAt } }
  } catch {
    return { ok: false, reason: "invalid_payload" }
  }
}
