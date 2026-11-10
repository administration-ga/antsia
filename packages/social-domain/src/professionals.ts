/** MP09 : profil et collaboration professionnels volontaires, sans droit personnel implicite. */
export const PROFESSIONAL_PROFILE_STATES = ["draft", "published", "paused"] as const
export const PROFESSIONAL_VISIBILITIES = ["network", "unlisted", "public"] as const
export const PROFESSIONAL_AVAILABILITIES = ["available", "limited", "unavailable"] as const
export const PROFESSIONAL_COLLABORATION_TYPES = ["project", "partnership", "mentoring"] as const
export const PROFESSIONAL_COLLABORATION_STATUSES = ["pending", "accepted", "declined", "cancelled"] as const
export const PROFESSIONAL_PUBLIC_FIELDS = ["title", "bio", "skills", "languages", "zone", "availability", "portfolio", "activities"] as const
export const PROFESSIONAL_PROFILE_CONSENT_VERSION = "2026-10-21-mp09-professional-profile-v1"
export const PROFESSIONAL_PUBLIC_CONSENT_VERSION = "2026-10-21-mp09-professional-public-v1"
export const PROFESSIONAL_COLLABORATION_COOLDOWN_MS = 24 * 60 * 60 * 1000
export const PROFESSIONAL_PAGE_MAX = 12
export type ProfessionalProfileState = typeof PROFESSIONAL_PROFILE_STATES[number]
export type ProfessionalVisibility = typeof PROFESSIONAL_VISIBILITIES[number]
export type ProfessionalAvailability = typeof PROFESSIONAL_AVAILABILITIES[number]
export type ProfessionalCollaborationType = typeof PROFESSIONAL_COLLABORATION_TYPES[number]
export type ProfessionalCollaborationStatus = typeof PROFESSIONAL_COLLABORATION_STATUSES[number]
export type ProfessionalPublicField = typeof PROFESSIONAL_PUBLIC_FIELDS[number]
export type ProfessionalPortfolioItem = { title: string; description: string }
export type ProfessionalProfileInput = {
  title: string; bio: string; skills: string[]; languageCodes: string[]; zone: string
  availability: ProfessionalAvailability; collaborationTypes: ProfessionalCollaborationType[]
  portfolio: ProfessionalPortfolioItem[]; activityPageIds: string[]
  visibility: ProfessionalVisibility; publicFields: ProfessionalPublicField[]
  consentTextVersion: typeof PROFESSIONAL_PROFILE_CONSENT_VERSION
  publicConsentTextVersion?: typeof PROFESSIONAL_PUBLIC_CONSENT_VERSION
}
export type ProfessionalSearchFilters = {
  query?: string; skills?: string[]; languageCodes?: string[]; zone?: string
  availability?: ProfessionalAvailability; collaborationTypes?: ProfessionalCollaborationType[]
}

function record(raw: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const prototype: unknown = Object.getPrototypeOf(raw)
  if (prototype !== Object.prototype && prototype !== null) return null
  for (const key of Reflect.ownKeys(raw)) {
    if (typeof key !== "string" || !required.includes(key) && !optional.includes(key)) return null
    const descriptor = Object.getOwnPropertyDescriptor(raw, key)
    if (!descriptor || descriptor.get !== undefined || descriptor.set !== undefined) return null
  }
  return required.every(key => Object.prototype.hasOwnProperty.call(raw, key)) ? raw as Record<string, unknown> : null
}
function array(raw: unknown, max: number): unknown[] | null {
  if (!Array.isArray(raw) || raw.length > max || Object.getPrototypeOf(raw) !== Array.prototype) return null
  if (Reflect.ownKeys(raw).some(key => key !== "length" && (typeof key !== "string" || !/^(0|[1-9][0-9]*)$/u.test(key) || Number(key) >= raw.length))) return null
  for (let index = 0; index < raw.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(raw, String(index))
    if (!descriptor || descriptor.get !== undefined || descriptor.set !== undefined) return null
  }
  return raw
}
function text(raw: unknown, max: number, multiline = false): string | null {
  if (typeof raw !== "string" || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069\uD800-\uDFFF<>]/u.test(raw) || !multiline && /[\r\n\t]/u.test(raw)) return null
  const normalized = raw.normalize("NFC").replace(/\r\n?/gu, "\n").trim()
  const value = multiline ? normalized : normalized.replace(/\s+/gu, " ")
  return value.length <= max ? value : null
}
export function professionalTextKey(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/gu, " ").trim()
}
export function normalizeProfessionalLanguageCode(raw: string): string | null {
  if (!raw || raw.length > 35 || raw !== raw.trim() || /[\p{Cc}\p{Cf}]/u.test(raw)) return null
  try { const values = Intl.getCanonicalLocales(raw); return values.length === 1 && values[0]!.length <= 35 ? values[0]! : null } catch { return null }
}
function texts(raw: unknown, max: number, length: number, language = false): string[] | null {
  const entries = array(raw, max)
  if (!entries) return null
  const values: string[] = []
  for (const entry of entries) {
    const value = text(entry, length)
    const normalized = value && language ? normalizeProfessionalLanguageCode(value) : value
    if (!normalized || values.some(item => professionalTextKey(item) === professionalTextKey(normalized))) return null
    values.push(normalized)
  }
  return values
}
function choices<T extends string>(raw: unknown, allowed: readonly T[]): T[] | null {
  const values = array(raw, allowed.length)
  if (!values || values.some(item => typeof item !== "string" || !allowed.includes(item as T)) || new Set(values).size !== values.length) return null
  return allowed.filter(item => values.includes(item))
}
function choice<T extends string>(raw: unknown, allowed: readonly T[]): T | null {
  return typeof raw === "string" && allowed.includes(raw as T) ? raw as T : null
}

/** Contrat exact et normalisé ; aucune identité, pièce jointe ou autorité ne vient de cette saisie. */
export function parseProfessionalProfileInput(raw: unknown): ProfessionalProfileInput | null {
  const row = record(raw, ["title", "bio", "skills", "languageCodes", "zone", "availability", "collaborationTypes", "portfolio", "activityPageIds", "visibility", "publicFields", "consentTextVersion"], ["publicConsentTextVersion"])
  if (!row || row.consentTextVersion !== PROFESSIONAL_PROFILE_CONSENT_VERSION) return null
  const title = text(row.title, 120), bio = text(row.bio, 1600, true), zone = text(row.zone, 120)
  const skills = texts(row.skills, 12, 60), languageCodes = texts(row.languageCodes, 6, 35, true)
  const availability = choice(row.availability, PROFESSIONAL_AVAILABILITIES), visibility = choice(row.visibility, PROFESSIONAL_VISIBILITIES)
  const collaborationTypes = choices(row.collaborationTypes, PROFESSIONAL_COLLABORATION_TYPES), publicFields = choices(row.publicFields, PROFESSIONAL_PUBLIC_FIELDS)
  const portfolioRows = array(row.portfolio, 6), activityRows = array(row.activityPageIds, 6)
  const activityPageIds = activityRows?.every((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 128 && !/[\s\p{Cc}\p{Cf}<>]/u.test(id)) ? activityRows : null
  if (title === null || bio === null || zone === null || !skills || !languageCodes || !availability || !visibility || !collaborationTypes || !publicFields || !portfolioRows || !activityPageIds) return null
  if (new Set(activityPageIds).size !== activityPageIds.length) return null
  if (visibility === "public" ? row.publicConsentTextVersion !== PROFESSIONAL_PUBLIC_CONSENT_VERSION : row.publicConsentTextVersion !== undefined) return null
  const portfolio: ProfessionalPortfolioItem[] = []
  for (const entry of portfolioRows) {
    const item = record(entry, ["title", "description"])
    if (!item) return null
    const title = text(item.title, 120), description = text(item.description, 500, true)
    if (!title || description === null) return null
    portfolio.push({ title, description })
  }
  return { title, bio, skills, languageCodes, zone, availability, collaborationTypes, portfolio, activityPageIds, visibility, publicFields,
    consentTextVersion: PROFESSIONAL_PROFILE_CONSENT_VERSION, ...(visibility === "public" ? { publicConsentTextVersion: PROFESSIONAL_PUBLIC_CONSENT_VERSION } : {}) }
}

/** Filtres canoniques : OU dans chaque liste, ET entre les facettes. */
export function parseProfessionalSearchFilters(raw: unknown): ProfessionalSearchFilters | null {
  const row = record(raw, [], ["query", "skills", "languageCodes", "zone", "availability", "collaborationTypes"])
  if (!row) return null
  const result: ProfessionalSearchFilters = {}
  if (row.query !== undefined) {
    const value = text(row.query, 120)
    const terms = value?.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
    if (!value || !terms?.length || terms.length > 16) return null
    result.query = professionalTextKey(value)
  }
  for (const key of ["skills", "languageCodes"] as const) if (row[key] !== undefined) {
    const value = texts(row[key], 6, key === "skills" ? 60 : 35, key === "languageCodes")
    if (!value || value.length === 0) return null
    result[key] = (key === "skills" ? value.map(professionalTextKey) : value).sort()
  }
  if (row.zone !== undefined) {
    const value = text(row.zone, 120)
    if (!value) return null
    result.zone = professionalTextKey(value)
  }
  if (row.availability !== undefined) {
    const value = choice(row.availability, PROFESSIONAL_AVAILABILITIES)
    if (!value) return null
    result.availability = value
  }
  if (row.collaborationTypes !== undefined) {
    const value = choices(row.collaborationTypes, PROFESSIONAL_COLLABORATION_TYPES)
    if (!value || value.length === 0) return null
    result.collaborationTypes = value
  }
  return result
}

export function professionalProfileMatches(profile: Pick<ProfessionalProfileInput, "skills" | "languageCodes" | "zone" | "availability" | "collaborationTypes">, filters: ProfessionalSearchFilters): boolean {
  return (!filters.skills || filters.skills.some(skill => profile.skills.some(item => professionalTextKey(item) === skill)))
    && (!filters.languageCodes || filters.languageCodes.some(language => profile.languageCodes.includes(language)))
    && (!filters.zone || professionalTextKey(profile.zone) === filters.zone)
    && (!filters.availability || profile.availability === filters.availability)
    && (!filters.collaborationTypes || filters.collaborationTypes.some(type => profile.collaborationTypes.includes(type)))
}
export function parseProfessionalCollaborationMessage(raw: unknown): string | null {
  const value = text(raw, 600, true)
  return value || null
}
