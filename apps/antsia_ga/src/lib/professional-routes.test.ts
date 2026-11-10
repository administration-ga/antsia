import { describe, expect, it } from "vitest"
import { parseSpecializedDestination } from "./specialized-navigation"
import { isSpecializedMemberPath, routes, specializedDestinationFromLocation, specializedDestinationFromSearch, specializedDestinationPath, specializedProfessionalRoute } from "./routes"

describe("MP09 : routes professionnelles et reprise de consultation", () => {
  it.each([
    [{ kind: "professionals" }, "/professionnels", "directory"],
    [{ kind: "professional_editor" }, "/mon-profil-pro", "editor"],
    [{ kind: "professional_collaborations" }, "/mes-collaborations", "collaborations"],
    [{ kind: "professional", handle: "awa.demo" }, "/professionnels/awa.demo", "profile"],
  ] as const)("conserve uniquement la destination %j après connexion", (destination, path, section) => {
    expect(specializedDestinationPath(destination)).toBe(path)
    expect(specializedProfessionalRoute(path)).toBe(section)
    expect(isSpecializedMemberPath(path)).toBe(true)
    expect(specializedDestinationFromLocation(path)).toEqual(destination)
    const url = new URL(routes.signIn(undefined,undefined,undefined,undefined,destination), "https://antsia.invalid")
    expect(specializedDestinationFromSearch(Object.fromEntries(url.searchParams))).toEqual(destination)
  })
  it("ne transporte aucun acte d'acceptation ou proposition dans la connexion", () => {
    for (const payload of [{kind:"professional",handle:"awa.demo",action:"accept"},{kind:"professionals",handle:"awa.demo"},{kind:"professional_editor",href:"https://evil.test"},{kind:"professional",handle:"../private"}]) expect(parseSpecializedDestination(payload)).toBeUndefined()
    for (const path of ["/professionnels/../private","/professionnels/awa%2Fdemo","/professionnels/%","/professionnels/awa.demo/accept"]) expect(specializedProfessionalRoute(path)).toBeNull()
  })
  it("utilise l'identifiant du fil iCom sans confondre l'objet source", () => {
    expect(routes.professionalConversation("thread_123")).toBe("/messages/mise-en-relation/thread_123")
    for (const id of ["", "../other", "x?token=secret", "x".repeat(129)]) expect(routes.professionalConversation(id)).toBeNull()
    expect(routes.publicProfessional("awa.demo")).toBe("/pros/awa.demo")
  })
})
