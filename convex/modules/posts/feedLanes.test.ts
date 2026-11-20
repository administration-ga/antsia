// @vitest-environment edge-runtime
/**
 * Le fil par VOIES (portée, pays facultatif) — le hub d'un pays et « toute la
 * diaspora » que DIASPORA.GA compose selon sa règle (`isShownInHub`) — et la
 * fusion sous FRONTIÈRE des fenêtres bornées, qui ferme aussi un trou latent de
 * « Pour vous » (une fenêtre d'auteur pleine laissait filer ses lignes plus
 * anciennes quand le filtre écartait toute la fenêtre).
 */
import { engineErrorRule } from "@antsia/social-contracts/errors"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { testConvex } from "../../test.setup"

type T = ReturnType<typeof testConvex>
type Person = { as: ReturnType<T["withIdentity"]>; personId: Id<"persons">; handle: string }
type Lane = { reach: string; country?: string }
type FeedPage = { items: { _id: Id<"posts"> }[]; nextCursor: { publishedAt: number; postId: Id<"posts"> } | null; lacunar: boolean }

const T0 = Date.UTC(2026, 9, 15, 12, 0, 0)

beforeEach(() => {
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
})

afterEach(() => {
  vi.unstubAllEnvs()
})

async function seed(t: T) {
  return await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
}

async function enter(t: T, rootId: Id<"networks">, handle: string): Promise<Person> {
  const as = t.withIdentity({ subject: `auth-${handle}` })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName: handle })
  await as.mutation(api.modules.people.memberships.joinNetwork, { networkId: rootId })
  return { as, personId, handle }
}

async function joinAlso(t: T, networkId: Id<"networks">, person: Person): Promise<void> {
  await t.run(async (ctx) => ctx.db.insert("networkMemberships", { networkId, personId: person.personId, status: "declaree", role: "member", joinedAt: 1, statusChangedAt: 1 }))
}

/** Une publication insérée directement — mêmes champs que `writePost`, avec sa portée et son pays. */
async function insertPost(
  t: T,
  input: { networkId: Id<"networks">; author: Person; publishedAt: number; reach?: string; country?: string; audience?: Doc<"posts">["audience"]; onRoot?: boolean; tags?: string[] },
): Promise<Id<"posts">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("posts", {
      networkId: input.networkId,
      authorPersonId: input.author.personId,
      body: "Publication",
      audience: input.audience ?? "public",
      visibility: "network",
      onRoot: input.onRoot ?? false,
      status: "published",
      ...(input.reach !== undefined ? { reach: input.reach } : {}),
      ...(input.country !== undefined ? { country: input.country } : {}),
      ...(input.tags !== undefined ? { tags: input.tags } : {}),
      searchText: "publication",
      publishedAt: input.publishedAt,
      createdAt: input.publishedAt,
      updatedAt: input.publishedAt,
    }),
  )
}

async function feedAll(reader: Person, networkId: Id<"networks">, args: { lanes?: Lane[]; tag?: string; scope?: "pour_vous" | "recents"; limit?: number }): Promise<Id<"posts">[]> {
  const seen: Id<"posts">[] = []
  let cursor: FeedPage["nextCursor"] = null
  for (let pages = 0; pages < 40; pages += 1) {
    const page: FeedPage = await reader.as.query(api.modules.posts.posts.myFeed, { networkId, ...args, ...(cursor ? { cursor } : {}) })
    seen.push(...page.items.map((item) => item._id))
    if (page.nextCursor === null) break
    cursor = page.nextCursor
  }
  return seen
}

describe("le fil par voies", () => {
  it("le hub d'un pays : le local de CE pays et toute la diaspora, par date, sans le local d'ailleurs ; « toute la diaspora » seule", async () => {
    const t = testConvex()
    const { root, testClosed } = await seed(t)
    const author = await enter(t, root, "auteur")
    const reader = await enter(t, root, "lecteur")
    await joinAlso(t, testClosed, author)
    await joinAlso(t, testClosed, reader)
    const localFr = await insertPost(t, { networkId: testClosed, author, publishedAt: T0 + 1, reach: "local", country: "FR" })
    await insertPost(t, { networkId: testClosed, author, publishedAt: T0 + 2, reach: "local", country: "SN" })
    const diasporaFr = await insertPost(t, { networkId: testClosed, author, publishedAt: T0 + 3, reach: "diaspora", country: "FR" })
    const diasporaNowhere = await insertPost(t, { networkId: testClosed, author, publishedAt: T0 + 4, reach: "diaspora" })
    await insertPost(t, { networkId: testClosed, author, publishedAt: T0 + 5 })
    expect(await feedAll(reader, testClosed, { lanes: [{ reach: "local", country: "fr" }, { reach: "diaspora" }] })).toEqual([diasporaNowhere, diasporaFr, localFr])
    expect(await feedAll(reader, testClosed, { lanes: [{ reach: "diaspora" }] })).toEqual([diasporaNowhere, diasporaFr])
  })

  it("garde les mêmes portes que le fil : audience, blocage, masquage, sourdine", async () => {
    const t = testConvex()
    const { root, testClosed } = await seed(t)
    const reader = await enter(t, root, "lecteur")
    const stranger = await enter(t, root, "inconnu")
    const blocked = await enter(t, root, "bloque")
    const muted = await enter(t, root, "sourdine")
    for (const person of [reader, stranger, blocked, muted]) await joinAlso(t, testClosed, person)
    const visible = await insertPost(t, { networkId: testClosed, author: stranger, publishedAt: T0 + 1, reach: "diaspora" })
    await insertPost(t, { networkId: testClosed, author: stranger, publishedAt: T0 + 2, reach: "diaspora", audience: "connections" })
    await insertPost(t, { networkId: testClosed, author: blocked, publishedAt: T0 + 3, reach: "diaspora" })
    await insertPost(t, { networkId: testClosed, author: muted, publishedAt: T0 + 4, reach: "diaspora" })
    const hidden = await insertPost(t, { networkId: testClosed, author: stranger, publishedAt: T0 + 5, reach: "diaspora" })
    await reader.as.mutation(api.modules.graph.connections.blockPerson, { networkId: testClosed, targetPersonId: blocked.personId })
    await reader.as.mutation(api.modules.marks.marks.muteAuthor, { networkId: testClosed, targetPersonId: muted.personId })
    await reader.as.mutation(api.modules.marks.marks.hidePost, { networkId: testClosed, postId: hidden })
    expect(await feedAll(reader, testClosed, { lanes: [{ reach: "diaspora" }] })).toEqual([visible])
  })

  it("pagine sans trou ni doublon à travers les voies, même à milliseconde égale", async () => {
    const t = testConvex()
    const { root, testClosed } = await seed(t)
    const author = await enter(t, root, "auteur")
    const reader = await enter(t, root, "lecteur")
    await joinAlso(t, testClosed, author)
    await joinAlso(t, testClosed, reader)
    const expected: Id<"posts">[] = []
    for (let index = 0; index < 24; index += 1) {
      const lane = index % 2 === 0 ? { reach: "local", country: "FR" } : { reach: "diaspora" }
      expected.push(await insertPost(t, { networkId: testClosed, author, publishedAt: T0 + Math.floor(index / 6), ...lane }))
    }
    const read = await feedAll(reader, testClosed, { lanes: [{ reach: "local", country: "FR" }, { reach: "diaspora" }], limit: 5 })
    expect(new Set(read).size).toBe(24)
    expect(read.length).toBe(24)
    // Ordre de lecture : plus récent d'abord, l'ordre de création départageant la milliseconde.
    expect(read).toEqual([...expected].reverse())
  })

  it("refuse une portée inconnue, un pays mal formé, aucune voie ou plus de quatre", async () => {
    const t = testConvex()
    const { root, testClosed } = await seed(t)
    const reader = await enter(t, root, "lecteur")
    await joinAlso(t, testClosed, reader)
    const ruleOf = async (lanes: Lane[]) => {
      try {
        await reader.as.query(api.modules.posts.posts.myFeed, { networkId: testClosed, lanes })
      } catch (error) {
        return engineErrorRule(error)?.rule ?? null
      }
      return null
    }
    expect(await ruleOf([{ reach: "monde" }])).toBe("POST_REACH_INVALID")
    expect(await ruleOf([{ reach: "local", country: "France" }])).toBe("POST_COUNTRY_INVALID")
    expect(await ruleOf([])).toBe("FEED_LANES_INVALID")
    expect(await ruleOf(Array.from({ length: 5 }, () => ({ reach: "diaspora" })))).toBe("FEED_LANES_INVALID")
    // La racine ne déclare aucune portée : aucune voie n'y a de sens.
    expect(engineErrorRule(await reader.as.query(api.modules.posts.posts.myFeed, { networkId: root, lanes: [{ reach: "diaspora" }] }).catch((error: unknown) => error))?.rule).toBe("POST_REACH_INVALID")
  })
})

describe("« Pour vous » sous frontière", () => {
  it("une fenêtre d'auteur pleine que le filtre écarte entièrement ne fait plus perdre ses lignes plus anciennes", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const reader = await enter(t, root, "lecteur")
    const prolific = await enter(t, root, "prolixe")
    const quiet = await enter(t, root, "discret")
    await reader.as.mutation(api.modules.graph.follows.follow, { networkId: root, handle: "prolixe" })
    await reader.as.mutation(api.modules.graph.follows.follow, { networkId: root, handle: "discret" })
    const tagged: Id<"posts">[] = []
    // 60 publications du prolixe : seules les 10 plus ANCIENNES portent le mot-clé.
    for (let index = 0; index < 60; index += 1) {
      const id = await insertPost(t, { networkId: root, author: prolific, publishedAt: T0 + 1000 + index, onRoot: true, ...(index < 10 ? { tags: ["marche"] } : {}) })
      if (index < 10) tagged.push(id)
    }
    // 5 publications du discret, toutes marquées, plus anciennes que la fenêtre pleine.
    for (let index = 0; index < 5; index += 1) tagged.push(await insertPost(t, { networkId: root, author: quiet, publishedAt: T0 + 900 + index, onRoot: true, tags: ["marche"] }))
    const read = await feedAll(reader, root, { scope: "pour_vous", tag: "marche", limit: 20 })
    expect(new Set(read)).toEqual(new Set(tagged))
    expect(read.length).toBe(15)
  })
})
