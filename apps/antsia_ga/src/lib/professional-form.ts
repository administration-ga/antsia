import { engineErrorCode } from "@antsia/social-contracts/errors"
import {
  normalizeProfessionalLanguageCode, parseProfessionalProfileInput, parseProfessionalSearchFilters,
  PROFESSIONAL_AVAILABILITIES, PROFESSIONAL_COLLABORATION_TYPES, PROFESSIONAL_PROFILE_CONSENT_VERSION,
  PROFESSIONAL_PUBLIC_CONSENT_VERSION, PROFESSIONAL_PUBLIC_FIELDS, PROFESSIONAL_VISIBILITIES,
  professionalTextKey, type ProfessionalProfileInput, type ProfessionalSearchFilters,
} from "@antsia/social-domain/professionals"
import { z } from "zod"

type Translate = (key: string) => string
const normalize = (value: string) => value.normalize("NFC").trim().replace(/\s+/gu, " ")
const invalidText = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069\uD800-\uDFFF<>]/u

export function professionalFormSchema(t: Translate) {
  const text = (max: number, multiline = false) => z.string().max(max, t("validation.length"))
    .refine(value => !invalidText.test(value) && (multiline || !/[\r\n\t]/u.test(value)), t("validation.text"))
    .transform(value => multiline ? value.normalize("NFC").replace(/\r\n?/gu, "\n").trim() : normalize(value))
  const unique = (values: string[]) => new Set(values.map(professionalTextKey)).size === values.length
  return z.object({
    title: text(120), bio: text(1600, true), zone: text(120),
    skills: z.array(text(60).refine(Boolean, t("validation.required"))).max(12, t("validation.limit")).refine(unique, t("validation.duplicates")),
    languageCodes: z.array(z.string().refine(value => normalizeProfessionalLanguageCode(value) !== null, t("validation.language"))
      .transform(value => normalizeProfessionalLanguageCode(value)!)).max(6, t("validation.limit")).refine(unique, t("validation.duplicates")),
    availability: z.enum(PROFESSIONAL_AVAILABILITIES),
    collaborationTypes: z.array(z.enum(PROFESSIONAL_COLLABORATION_TYPES)).max(3).refine(unique, t("validation.duplicates")),
    portfolio: z.array(z.object({ title: text(120).refine(Boolean, t("validation.required")), description: text(500, true) }).strict()).max(6, t("validation.limit")),
    activityPageIds: z.array(z.string().min(1).max(128).regex(/^[^\s\p{Cc}\p{Cf}<>]+$/u)).max(6, t("validation.limit")).refine(values => new Set(values).size === values.length, t("validation.duplicates")),
    visibility: z.enum(PROFESSIONAL_VISIBILITIES), publicFields: z.array(z.enum(PROFESSIONAL_PUBLIC_FIELDS)).refine(unique, t("validation.duplicates")),
    participationConsent: z.boolean().refine(value => value, t("validation.participation")),
    publicConsent: z.boolean(),
  }).strict().superRefine((value, ctx) => {
    if (value.visibility === "public" && !value.publicConsent) ctx.addIssue({ code: "custom", path: ["publicConsent"], message: t("validation.publicConsent") })
    if (value.participationConsent && (value.visibility !== "public" || value.publicConsent) && !professionalInput(value)) ctx.addIssue({ code: "custom", path: ["title"], message: t("validation.text") })
  })
}

export type ProfessionalFormValues = z.input<ReturnType<typeof professionalFormSchema>>
export const EMPTY_PROFESSIONAL_FORM: ProfessionalFormValues = {
  title: "", bio: "", skills: [], languageCodes: [], zone: "", availability: "available", collaborationTypes: [],
  portfolio: [], activityPageIds: [], visibility: "network", publicFields: [], participationConsent: false, publicConsent: false,
}

export function professionalFormValues(profile: Omit<ProfessionalProfileInput, "consentTextVersion" | "publicConsentTextVersion"> | null): ProfessionalFormValues {
  if (!profile) return { ...EMPTY_PROFESSIONAL_FORM, skills: [], languageCodes: [], collaborationTypes: [], portfolio: [], activityPageIds: [], publicFields: [] }
  return {
    title: profile.title, bio: profile.bio, zone: profile.zone, availability: profile.availability,
    skills: [...profile.skills], languageCodes: [...profile.languageCodes], collaborationTypes: [...profile.collaborationTypes],
    portfolio: profile.portfolio.map(item => ({ ...item })), activityPageIds: [...profile.activityPageIds], visibility: profile.visibility,
    publicFields: [...profile.publicFields], participationConsent: false, publicConsent: false,
  }
}

/** Les accords locaux n'accordent aucun droit : seules les versions relues par le serveur sont envoyées. */
export function professionalInput(value: ProfessionalFormValues): ProfessionalProfileInput | null {
  if (!value.participationConsent || value.visibility === "public" && !value.publicConsent) return null
  const fields = { title: value.title, bio: value.bio, skills: value.skills, languageCodes: value.languageCodes, zone: value.zone,
    availability: value.availability, collaborationTypes: value.collaborationTypes, portfolio: value.portfolio,
    activityPageIds: value.activityPageIds, visibility: value.visibility, publicFields: value.publicFields }
  return parseProfessionalProfileInput({ ...fields, consentTextVersion: PROFESSIONAL_PROFILE_CONSENT_VERSION,
    ...(value.visibility === "public" ? { publicConsentTextVersion: PROFESSIONAL_PUBLIC_CONSENT_VERSION } : {}) })
}

export const EMPTY_PROFESSIONAL_SEARCH = { query: "", skills: "", languageCodes: [] as string[], zone: "", availability: "" as "" | ProfessionalFormValues["availability"], collaborationTypes: [] as ProfessionalFormValues["collaborationTypes"] }
export type ProfessionalSearchValues = typeof EMPTY_PROFESSIONAL_SEARCH
export function professionalSearchInput(value: ProfessionalSearchValues): ProfessionalSearchFilters | null {
  return parseProfessionalSearchFilters({
    ...(value.query.trim() ? { query: value.query.trim() } : {}),
    ...(value.skills.trim() ? { skills: value.skills.split(",").map(item => item.trim()) } : {}),
    ...(value.languageCodes.length ? { languageCodes: value.languageCodes } : {}),
    ...(value.zone.trim() ? { zone: value.zone.trim() } : {}),
    ...(value.availability ? { availability: value.availability } : {}),
    ...(value.collaborationTypes.length ? { collaborationTypes: value.collaborationTypes } : {}),
  })
}
export function professionalSearchSchema(t: Translate) {
  return z.object({ query: z.string().max(120, t("validation.search")), skills: z.string().max(365, t("validation.search")),
    languageCodes: z.array(z.string().max(35)).max(6), zone: z.string().max(120, t("validation.search")),
    availability: z.union([z.literal(""), z.enum(PROFESSIONAL_AVAILABILITIES)]),
    collaborationTypes: z.array(z.enum(PROFESSIONAL_COLLABORATION_TYPES)).max(3),
  }).strict().refine(value => professionalSearchInput(value) !== null, { path: ["query"], message: t("validation.search") })
}

export type ProfessionalSearch = { filters: ProfessionalSearchFilters; cursor: string | null }
const SEARCH_PARAMS = { skills: "competence", languageCodes: "langue", collaborationTypes: "collaboration" } as const
const SEARCH_SCALARS = ["recherche", "zone", "disponibilite", "curseur"] as const
const SEARCH_KEYS: readonly string[] = [...SEARCH_SCALARS, ...Object.values(SEARCH_PARAMS)]

/** Paramètres fermés : même sélection après un profil, retour navigateur ou partage d'adresse. */
export function professionalSearchRecord(params: Record<string, string | string[] | undefined>): ProfessionalSearch | null {
  if ((Object.getPrototypeOf(params) !== Object.prototype && Object.getPrototypeOf(params) !== null) || Reflect.ownKeys(params).some(key => typeof key !== "string" || !SEARCH_KEYS.includes(key))) return null
  for (const key of SEARCH_SCALARS) if (params[key] !== undefined && typeof params[key] !== "string") return null
  const raw: Record<string, unknown> = {}
  for (const [field, key] of [["query", "recherche"], ["zone", "zone"], ["availability", "disponibilite"]] as const) if (params[key] !== undefined && params[key] !== "") raw[field] = params[key]
  for (const [field, key] of Object.entries(SEARCH_PARAMS)) if (params[key] !== undefined) raw[field] = typeof params[key] === "string" ? [params[key]] : params[key]
  const filters = parseProfessionalSearchFilters(raw)
  if (!filters) return null
  const cursor = params.curseur ?? null
  if (cursor !== null) {
    if (typeof cursor !== "string" || !cursor || cursor.length > 8192) return null
    try {
      const value: unknown = JSON.parse(cursor)
      if (!value || typeof value !== "object" || Array.isArray(value)) return null
      const row = value as Record<string, unknown>
      if (Object.keys(row).length !== 3 || row.version !== 1 || typeof row.scope !== "string" || !/^[a-f0-9]{64}$/u.test(row.scope) || typeof row.cursor !== "string" || !row.cursor || row.cursor.length > 8192) return null
    } catch { return null }
  }
  return { filters, cursor }
}
export function professionalSearchFromParams(params: Pick<URLSearchParams, "keys" | "getAll">): ProfessionalSearch | null {
  const record: Record<string, string | string[]> = Object.create(null) as Record<string, string | string[]>
  for (const key of new Set(params.keys())) { const values = params.getAll(key); record[key] = values.length === 1 ? values[0]! : values }
  return professionalSearchRecord(record)
}
export function professionalSearchParams(filters: ProfessionalSearchFilters = {}, cursor: string | null = null): URLSearchParams {
  const params = new URLSearchParams()
  const parsed = parseProfessionalSearchFilters(filters)
  if (!parsed) return params
  if (parsed.query) params.set("recherche", parsed.query)
  for (const [field, key] of Object.entries(SEARCH_PARAMS) as [keyof typeof SEARCH_PARAMS, string][]) for (const value of parsed[field] ?? []) params.append(key, value)
  if (parsed.zone) params.set("zone", parsed.zone)
  if (parsed.availability) params.set("disponibilite", parsed.availability)
  if (cursor) params.set("curseur", cursor)
  return params
}
export function professionalSearchValues(filters: ProfessionalSearchFilters): ProfessionalSearchValues {
  return { query: filters.query ?? "", skills: filters.skills?.join(", ") ?? "", languageCodes: [...(filters.languageCodes ?? [])], zone: filters.zone ?? "",
    availability: filters.availability ?? "", collaborationTypes: [...(filters.collaborationTypes ?? [])] }
}

export function professionalErrorKey(error: unknown): string {
  switch (engineErrorCode(error)) {
    case "conflict": return "errors.conflict"
    case "rateLimited": return "errors.rateLimited"
    case "consentRequired": return "errors.consent"
    default: return "errors.unavailable"
  }
}
