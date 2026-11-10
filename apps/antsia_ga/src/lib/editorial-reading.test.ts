import { describe, expect, it } from "vitest"
import { editorialReadingSearch } from "./editorial-reading"
import { parseSpecializedDestination } from "./specialized-navigation"
import { routes, specializedDestinationFromSearch, specializedDestinationPath, specializedEditorialRoute } from "./routes"
describe("MP12–13 : lecture et routes éditoriales", () => {
  it("conserve la rubrique et le curseur sans rejouer un acte après connexion", () => {
    const articleKey = `a-${"a".repeat(32)}`, destination = { kind: "article", handle: "journal-culture", articleKey } as const
    const url = new URL(routes.signIn(undefined, undefined, undefined, undefined, destination), "https://example.invalid")
    expect(specializedDestinationFromSearch(Object.fromEntries(url.searchParams))).toEqual(destination)
    expect(specializedDestinationPath(destination)).toBe(routes.memberArticle(destination.handle, articleKey))
    expect(parseSpecializedDestination({ ...destination, publish: true })).toBeUndefined()
    expect(parseSpecializedDestination({ ...destination, articleKey: "../redaction" })).toBeUndefined()
  })
  it("admet uniquement les sélections fermées de lecture", () => {
    expect(editorialReadingSearch({ rubrique: "culture", curseur: "cursor", ott: "handoff" })).toEqual({ section: "culture", cursor: "cursor" })
    for (const params of [{ rubrique: ["sport", "culture"] }, { curseur: ["a", "b"] }, { rubrique: "../private" }, { curseur: "\n" }, { url: "https://external.invalid" }]) expect(editorialReadingSearch(params)).toBeNull()
    expect(routes.publicMedia("journal", "culture", "a+b")).toBe("/medias/journal?rubrique=culture&curseur=a%2Bb")
  })
  it("les pages réelles changent de coque, sans admettre de chemin arbitraire", () => {
    for (const path of [routes.mediaHome(), routes.mediaDesk("page-id"), routes.mediaConfig("page-id"), routes.mediaTeam("page-id"), routes.articleEditor("article-id"), routes.memberMedia("journal"), routes.memberArticle("journal", "article-key")]) expect(specializedEditorialRoute(path)).toBe(true)
    for (const path of ["/redaction/x/autre", "/media/journal/private", "//external.invalid", "/redaction/../../secret"]) expect(specializedEditorialRoute(path)).toBe(false)
  })
})
