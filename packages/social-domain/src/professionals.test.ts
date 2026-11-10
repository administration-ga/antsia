import { describe, expect, it } from "vitest"

import {
  parseProfessionalCollaborationMessage, parseProfessionalProfileInput, parseProfessionalSearchFilters, professionalProfileMatches,
  PROFESSIONAL_PROFILE_CONSENT_VERSION, PROFESSIONAL_PUBLIC_CONSENT_VERSION, type ProfessionalProfileInput,
} from "./professionals"

const input = (): ProfessionalProfileInput => ({ title: "Designer", bio: "Présentation choisie", skills: ["Design"], languageCodes: ["fr"], zone: "Libreville",
  availability: "available", collaborationTypes: ["project"], portfolio: [{ title: "Projet déclaré", description: "Une réalisation textuelle." }], activityPageIds: [],
  visibility: "network", publicFields: [], consentTextVersion: PROFESSIONAL_PROFILE_CONSENT_VERSION })

describe("MP09 — contrats professionnels volontaires", () => {
  it("normalise les textes NFC, les langues et les choix sans modifier la saisie", () => {
    const source = { ...input(), title: "  De\u0301signer  ", languageCodes: ["fr-ga"], collaborationTypes: ["mentoring", "project"] }
    expect(parseProfessionalProfileInput(source)).toEqual({ ...source, title: "Désigner", languageCodes: ["fr-GA"], collaborationTypes: ["project", "mentoring"] })
    expect(source.title).toBe("  De\u0301signer  ")
  })
  it("borne chaque élément sans inventer de média, d'identité ou de certification", () => {
    const source = { ...input(), title: "a".repeat(120), bio: "a".repeat(1600), skills: Array.from({ length: 12 }, (_, index) => `${index}${"a".repeat(58)}`),
      languageCodes: ["fr", "en", "es", "pt", "de", "it"], zone: "z".repeat(120), portfolio: Array.from({ length: 6 }, () => ({ title: "t".repeat(120), description: "d".repeat(500) })),
      activityPageIds: Array.from({ length: 6 }, (_, index) => `page-${index}`) }
    expect(parseProfessionalProfileInput(source)).not.toBeNull()
  })
  it.each([
    null, [], {}, { ...input(), title: "a".repeat(121) }, { ...input(), bio: "a".repeat(1601) }, { ...input(), zone: "a".repeat(121) },
    { ...input(), skills: ["a".repeat(61)] }, { ...input(), skills: Array.from({ length: 13 }, (_, index) => String(index)) },
    { ...input(), skills: ["Céramique", "ceramique"] }, { ...input(), languageCodes: ["fr-ga", "fr-GA"] }, { ...input(), languageCodes: ["not_a_locale"] },
    { ...input(), collaborationTypes: ["project", "project"] }, { ...input(), collaborationTypes: ["dating"] },
    { ...input(), availability: "certified" }, { ...input(), portfolio: [{ title: "Référence", description: "x", storageId: "foreign" }] },
    { ...input(), portfolio: [{ title: "", description: "x" }] }, { ...input(), portfolio: [{ title: "Référence", description: "x".repeat(501) }] },
    { ...input(), activityPageIds: ["same", "same"] }, { ...input(), activityPageIds: ["page with spaces"] },
    { ...input(), consentTextVersion: "old" }, { ...input(), title: "<script>" }, { ...input(), title: "texte\u202E" }, { ...input(), bio: "texte\u0000" },
    { ...input(), birthDate: "private" }, { ...input(), avatarStorageId: "private" }, { ...input(), version: 2 },
  ])("refuse les bornes, doublons, champs inconnus et contenus non textuels", raw => {
    expect(parseProfessionalProfileInput(raw)).toBeNull()
  })
  it("sépare le consentement professionnel et l'accord public par champs", () => {
    expect(parseProfessionalProfileInput({ ...input(), visibility: "public", publicFields: ["title"] })).toBeNull()
    expect(parseProfessionalProfileInput({ ...input(), publicConsentTextVersion: PROFESSIONAL_PUBLIC_CONSENT_VERSION })).toBeNull()
    expect(parseProfessionalProfileInput({ ...input(), visibility: "public", publicFields: ["title"], publicConsentTextVersion: PROFESSIONAL_PUBLIC_CONSENT_VERSION })).not.toBeNull()
    expect(parseProfessionalProfileInput({ ...input(), visibility: "public", publicFields: ["salary"], publicConsentTextVersion: PROFESSIONAL_PUBLIC_CONSENT_VERSION })).toBeNull()
  })
  it("n'évalue pas les accesseurs ni les tableaux troués", () => {
    const getter = Object.defineProperty({ ...input() }, "title", { get: () => { throw new Error("Ne doit pas être lu") } })
    expect(parseProfessionalProfileInput(getter)).toBeNull()
    expect(parseProfessionalProfileInput({ ...input(), skills: Array(2) })).toBeNull()
  })
  it("ferme et canonicalise les filtres OR/AND, y compris les termes séparés par ponctuation", () => {
    const filters = parseProfessionalSearchFilters({ skills: ["céramique", "Design"], languageCodes: ["fr-ga"], collaborationTypes: ["project"], zone: "Libréville" })!
    expect(filters).toEqual({ skills: ["ceramique", "design"], languageCodes: ["fr-GA"], zone: "libreville", collaborationTypes: ["project"] })
    expect(professionalProfileMatches({ ...input(), skills: ["Céramique"], languageCodes: ["fr-GA"] }, filters)).toBe(true)
    expect(professionalProfileMatches({ ...input(), skills: ["Céramique"], languageCodes: ["en"] }, filters)).toBe(false)
    for (const raw of [{ query: Array(17).fill("mot").join("-") }, { query: "x".repeat(121) }, { query: "!!!" }, { skills: [] }, { skills: ["x", "X"] }, { salary: 1000 }, { visibility: "unlisted" }]) expect(parseProfessionalSearchFilters(raw)).toBeNull()
  })
  it("borne la motivation et conserve des paragraphes textuels", () => {
    expect(parseProfessionalCollaborationMessage("  Projet\n\nEnsemble  ")).toBe("Projet\n\nEnsemble")
    expect(parseProfessionalCollaborationMessage("x".repeat(600))).toHaveLength(600)
    for (const raw of ["", " ", "x".repeat(601), "<script>", "x\u0000", { text: "x" }]) expect(parseProfessionalCollaborationMessage(raw)).toBeNull()
  })
})
