import { describe, expect, it } from "vitest"

import { chooseModerationTeam, isModerationTeamEligible, routesByCountry } from "./moderationRouting"

type Team = { readonly name: string; readonly scope?: string; readonly country?: string }

/** Des équipes ACTIVES, de la plus ancienne à la plus récente (l'ordre de l'index du moteur). */
const FR_POSTS: Team = { name: "France, publications", scope: "post", country: "FR" }
const FR_ALL: Team = { name: "France, tout", country: "FR" }
const ES_ALL: Team = { name: "Espagne, tout", country: "ES" }
const POSTS: Team = { name: "Publications, sans pays", scope: "post" }
const ALL: Team = { name: "Générale, sans pays" }

const pick = (teams: readonly Team[], kind: string, country: string | null) => chooseModerationTeam(teams, kind, country)?.name ?? null

describe("CH-815 — routage d'un dossier : le pays du contenu, puis sa nature", () => {
  it("un contenu d'un pays va d'abord à l'équipe de ce pays et de sa nature, puis à l'équipe généraliste de ce pays", () => {
    const teams = [ALL, POSTS, ES_ALL, FR_ALL, FR_POSTS]
    expect(pick(teams, "post", "FR")).toBe(FR_POSTS.name)
    expect(pick(teams, "comment", "FR")).toBe(FR_ALL.name)
    expect(pick(teams, "post", "ES")).toBe(ES_ALL.name)
  })

  it("sans équipe de son pays, il va aux équipes sans pays (nature, puis généraliste), puis au réseau", () => {
    const teams = [ALL, ES_ALL, POSTS]
    expect(pick(teams, "post", "BE")).toBe(POSTS.name)
    expect(pick(teams, "comment", "BE")).toBe(ALL.name)
    expect(pick([ES_ALL], "post", "BE")).toBeNull()
  })

  it("un contenu sans pays ne va jamais à une équipe d'un pays", () => {
    expect(pick([FR_POSTS, FR_ALL, POSTS, ALL], "post", null)).toBe(POSTS.name)
    expect(pick([FR_POSTS, FR_ALL, ALL], "post", null)).toBe(ALL.name)
    expect(pick([FR_POSTS, FR_ALL, ES_ALL], "post", null)).toBeNull()
  })

  it("une équipe d'une autre nature n'est jamais choisie, même de son pays", () => {
    expect(pick([{ name: "France, pages", scope: "page", country: "FR" }, ALL], "post", "FR")).toBe(ALL.name)
  })

  it("entre deux équipes de même rang, la plus ancienne l'emporte : le choix ne dépend que de l'ordre donné", () => {
    const older: Team = { name: "France A", country: "FR" }
    const newer: Team = { name: "France B", country: "FR" }
    expect(pick([older, newer], "post", "FR")).toBe("France A")
    expect(pick([POSTS, { name: "Publications B", scope: "post" }], "post", "FR")).toBe(POSTS.name)
  })

  it("sans aucune équipe d'un pays, le choix est celui d'avant (nature, puis généraliste), quel que soit le pays", () => {
    const teams = [ALL, POSTS]
    const before = (kind: string) => (teams.find((team) => team.scope === kind) ?? teams.find((team) => team.scope === undefined))?.name ?? null
    expect(routesByCountry(teams)).toBe(false)
    for (const country of ["FR", "ES", null]) {
      expect(pick(teams, "post", country)).toBe(before("post"))
      expect(pick(teams, "page", country)).toBe(before("page"))
    }
    expect(routesByCountry([ALL, FR_ALL])).toBe(true)
  })

  it("l'éligibilité dit qui peut tenir un contenu : nature compatible, et pays égal ou absent", () => {
    expect(isModerationTeamEligible(FR_POSTS, "post", "FR")).toBe(true)
    expect(isModerationTeamEligible(FR_POSTS, "post", "ES")).toBe(false)
    expect(isModerationTeamEligible(FR_POSTS, "post", null)).toBe(false)
    expect(isModerationTeamEligible(FR_POSTS, "comment", "FR")).toBe(false)
    expect(isModerationTeamEligible(ALL, "comment", "FR")).toBe(true)
    expect(isModerationTeamEligible(ALL, "comment", null)).toBe(true)
  })
})
