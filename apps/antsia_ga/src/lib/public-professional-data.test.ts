import { describe, expect, it } from "vitest"
import { professionalPublicProfileSchema } from "./public-professional-data"
const identity = { handle: "awa.demo", displayName: "Awa NDONG" }
describe("MP09 : projection professionnelle publique fermée", () => {
  it("accepte seulement l'identité publiée si aucun autre champ n'est partagé", () => {
    expect(professionalPublicProfileSchema.parse(identity)).toEqual(identity)
  })
  it("refuse un consentement interne, une invitation ou un champ social ajouté", () => {
    for (const field of ["personId", "profileId", "publicFields", "consentedAt", "publicConsentAt", "revision", "message", "acceptedSource", "avatarUrl", "searchText"]) expect(professionalPublicProfileSchema.safeParse({...identity,[field]:"private"}).success).toBe(false)
  })
  it("borne les réalisations et refuse des champs supplémentaires dans les activités", () => {
    expect(professionalPublicProfileSchema.safeParse({...identity,portfolio:Array.from({length:7},()=>({title:"Projet",description:"Texte"}))}).success).toBe(false)
    expect(professionalPublicProfileSchema.safeParse({...identity,activities:[{kind:"shop",handle:"atelier",name:"Atelier",mandate:"private"}]}).success).toBe(false)
    expect(professionalPublicProfileSchema.safeParse({...identity,languageCodes:["fr-GA","en"]}).success).toBe(true)
    expect(professionalPublicProfileSchema.safeParse({...identity,languageCodes:["fr_ga"]}).success).toBe(false)
  })
})
