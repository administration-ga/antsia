import {
  PROFESSIONAL_PROFILE_CONSENT_VERSION, PROFESSIONAL_PUBLIC_CONSENT_VERSION,
} from "@antsia/social-domain/professionals"
import { describe, expect, it } from "vitest"

import {
  EMPTY_PROFESSIONAL_SEARCH, professionalErrorKey, professionalFormSchema, professionalFormValues, professionalInput,
  professionalSearchFromParams, professionalSearchInput, professionalSearchParams, professionalSearchSchema, professionalSearchValues,
} from "./professional-form"

const t = (key: string) => key
const values = () => ({ ...professionalFormValues(null), title: "Conseil numérique", participationConsent: true })
const cursor = JSON.stringify({ version: 1, scope: "a".repeat(64), cursor: "convex-next" })

describe("MP09 — saisie professionnelle volontaire", () => {
  it("démarre en visibilité réseau sans accord ni champ public sélectionné", () => {
    expect(professionalFormValues(null)).toMatchObject({ visibility: "network", publicFields: [], participationConsent: false, publicConsent: false })
    expect(professionalFormSchema(t).safeParse(professionalFormValues(null)).success).toBe(false)
    expect(professionalInput(professionalFormValues(null))).toBeNull()
  })
  it("permet un titre vide au brouillon et normalise sans inventer une identité", () => {
    const parsed = professionalFormSchema(t).parse({ ...values(), title: "", skills: [" Design  produit "], languageCodes: ["fr-ga"], bio: " Présentation\r\nSuite " })
    expect(professionalInput(parsed)).toMatchObject({ title: "", skills: ["Design produit"], languageCodes: ["fr-GA"], bio: "Présentation\nSuite", consentTextVersion: PROFESSIONAL_PROFILE_CONSENT_VERSION })
    expect(professionalInput(parsed)).not.toHaveProperty("displayName")
  })
  it("un accord public n'est ni déduit ni précoché depuis un profil enregistré", () => {
    const current = professionalInput({ ...values(), visibility: "public", publicFields: ["skills"], publicConsent: true })!
    expect(current.publicConsentTextVersion).toBe(PROFESSIONAL_PUBLIC_CONSENT_VERSION)
    const form = professionalFormValues(current)
    expect(form.publicFields).toEqual(["skills"])
    expect(form.publicConsent).toBe(false)
    expect(professionalFormSchema(t).safeParse({ ...form, participationConsent: true }).success).toBe(false)
    expect(professionalInput({ ...values(), visibility: "network", publicConsent: true })).not.toHaveProperty("publicConsentTextVersion")
  })
  it("borne les listes, refuse les doublons, les liens dans les champs fermés et les contrôles de texte", () => {
    for (const patch of [{ skills: ["Design", "désign"] }, { languageCodes: ["fr", "fr"] }, { languageCodes: ["not_a_language"] },
      { skills: Array.from({ length: 13 }, (_, index) => `Compétence ${index}`) }, { portfolio: [{ title: "Exemple", description: "Texte", href: "extra" }] },
      { activityPageIds: Array.from({ length: 7 }, (_, index) => `page-${index}`) }, { title: "Invisible\u202E" }, { title: "<script>" }, { secret: "extra" },
    ]) expect(professionalFormSchema(t).safeParse({ ...values(), ...patch }).success).toBe(false)
  })
  it("traite le conflit de révision sans exposer un message serveur arbitraire", () => {
    expect(professionalErrorKey({ data: { code: "conflict", field: "expectedRevision" } })).toBe("errors.conflict")
    expect(professionalErrorKey({ data: { code: "rateLimited" } })).toBe("errors.rateLimited")
    expect(professionalErrorKey(new Error("private backend detail"))).toBe("errors.unavailable")
  })
})

describe("MP09 — URL canonique de l'annuaire", () => {
  it("conserve filtres multivalués et continuation dans l'adresse", () => {
    const filters = { query: "Design", skills: ["Conseil", "Design"], languageCodes: ["fr-ga", "en"], collaborationTypes: ["mentoring", "project"] as const, zone: "Libreville", availability: "limited" as const }
    const params = professionalSearchParams({ ...filters, collaborationTypes: [...filters.collaborationTypes] }, cursor)
    const parsed = professionalSearchFromParams(params)!
    expect(parsed).toEqual({ filters: { query: "design", skills: ["conseil", "design"], languageCodes: ["en", "fr-GA"], collaborationTypes: ["project", "mentoring"], zone: "libreville", availability: "limited" }, cursor })
    expect(professionalSearchParams(parsed.filters, parsed.cursor).toString()).toBe(params.toString())
    expect(professionalSearchInput(professionalSearchValues(parsed.filters))).toEqual(parsed.filters)
  })
  it.each([
    "inconnu=value", "recherche=a&recherche=b", "zone=a&zone=b", "disponibilite=available&disponibilite=limited", "curseur=a&curseur=b",
    "competence=Design&competence=d%C3%A9sign", "langue=invalid_code", "collaboration=friendship", "curseur=opaque",
  ])("refuse une URL ambiguë ou non contractuelle %s", query => expect(professionalSearchFromParams(new URLSearchParams(query))).toBeNull())
  it("refuse les dépassements, dont les mots séparés par ponctuation et les curseurs ouverts", () => {
    for (const params of [new URLSearchParams({ recherche: "x".repeat(121) }), new URLSearchParams({ recherche: Array.from({ length: 17 }, () => "mot").join("-") }),
      new URLSearchParams(Array.from({ length: 7 }, (_, index) => ["competence", `skill-${index}`])),
      new URLSearchParams({ curseur: "x".repeat(8193) }), new URLSearchParams({ curseur: JSON.stringify({ version: 1, scope: "a".repeat(64), cursor: "next", extra: true }) }),
    ]) expect(professionalSearchFromParams(params)).toBeNull()
    expect(professionalSearchSchema(t).safeParse({ ...EMPTY_PROFESSIONAL_SEARCH, skills: "Design, Design" }).success).toBe(false)
  })
  it("une recherche vide reste une consultation sans écriture ni filtre inventé", () => {
    expect(professionalSearchFromParams(new URLSearchParams())).toEqual({ filters: {}, cursor: null })
    expect(professionalSearchParams().toString()).toBe("")
  })
})
