// @vitest-environment edge-runtime
// Dupliqué de socle/convex/tests/reseauConnections.test.ts (avec reseauPersonnel/connections.test.ts et les cas `follows.*`/`connections.*` de reseauPersonnel.test.ts) @ ad2e7fdc2 — adaptations : personnes et réseaux ; une seule façade ; la fuite du blocage (D12) est désormais AFFIRMÉE fermée (au socle, le test qui devait l'empêcher n'affirmait rien) ; blocage sur toute la paire, tous réseaux ; listes historiques plafonnées remplacées par la pagination (D04) ; cas d'organisation, de poste et de cloche retirés (la cloche arrive avec le module notifications) ; cas AJOUTÉS le 25/10/2026 (correctif du socle repris) : les deux côtés de `paginateMine` dans UNE exécution, témoin du harnais, boucle de pagination bornée.
/**
 * Le graphe : connexions symétriques par réseau, blocage unilatéral et muet
 * sur toute la paire, abonnements unilatéraux comptés par agrégat.
 */
import { engineErrorCode, engineErrorRule } from "@antsia/social-contracts/errors"
import { describe, expect, it } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { testConvex } from "../../test.setup"
import { acceptedSidePage } from "./connections"

type T = ReturnType<typeof testConvex>
type Person = { as: ReturnType<T["withIdentity"]>; personId: Id<"persons"> }

async function seed(t: T) {
  return await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
}

async function enter(t: T, rootId: Id<"networks">, subject: string, displayName = subject): Promise<Person> {
  const as = t.withIdentity({ subject })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle: subject, displayName })
  await as.mutation(api.modules.people.memberships.joinNetwork, { networkId: rootId })
  return { as, personId }
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  return null
}

async function connectionRows(t: T) {
  return await t.run(async (ctx) => ctx.db.query("connections").take(50))
}

/** Une connexion acceptée entre deux personnes, dans le réseau. */
async function connect(networkId: Id<"networks">, from: Person, to: Person) {
  await from.as.mutation(api.modules.graph.connections.requestConnection, { networkId, targetPersonId: to.personId })
  const view = await to.as.query(api.modules.graph.connections.connectionWith, { networkId, otherPersonId: from.personId })
  if (view.state !== "requested_by_them") throw new Error(`état inattendu : ${view.state}`)
  await to.as.mutation(api.modules.graph.connections.respondToConnection, { networkId, connectionId: view.connectionId, accept: true })
  return view.connectionId
}

describe("demande de connexion", () => {
  it("crée la relation une seule fois ; une demande en sens inverse retrouve la MÊME relation", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    expect(await alice.as.mutation(api.modules.graph.connections.requestConnection, { networkId: root, handle: "bob", message: "  Bonjour  " })).toEqual({ status: "requested" })
    expect(await alice.as.mutation(api.modules.graph.connections.requestConnection, { networkId: root, targetPersonId: bob.personId })).toEqual({ status: "requested" })
    expect(await bob.as.mutation(api.modules.graph.connections.requestConnection, { networkId: root, targetPersonId: alice.personId })).toEqual({ status: "requested" })
    const rows = await connectionRows(t)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ requestedByPersonId: alice.personId, recipientPersonId: bob.personId, status: "requested", message: "Bonjour", networkId: root })
  })

  it("refuse la connexion à soi-même, sans rien écrire ; un message trop long nomme sa règle", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    expect(engineErrorCode(await caught(alice.as.mutation(api.modules.graph.connections.requestConnection, { networkId: root, targetPersonId: alice.personId })))).toBe("invalidArgument")
    await enter(t, root, "bob")
    expect(engineErrorRule(await caught(alice.as.mutation(api.modules.graph.connections.requestConnection, { networkId: root, handle: "bob", message: "x".repeat(501) })))?.rule).toBe(
      "CONNECTION_MESSAGE_TOO_LONG",
    )
    expect(await connectionRows(t)).toEqual([])
  })

  it("profil privé, retiré, inconnu ou non-membre du réseau : le refus d'une personne inconnue, mot pour mot", async () => {
    const t = testConvex()
    const { root, testClosed } = await seed(t)
    const alice = await enter(t, root, "alice")
    const priv = await enter(t, root, "prive")
    const gone = await enter(t, root, "parti")
    await priv.as.mutation(api.modules.people.profile.setMyProfilePrivacy, { private: true })
    await gone.as.mutation(api.modules.people.profile.withdrawMyProfile, {})
    for (const handle of ["prive", "parti", "inconnu"]) {
      expect(engineErrorCode(await caught(alice.as.mutation(api.modules.graph.connections.requestConnection, { networkId: root, handle })))).toBe("notFound")
    }
    expect(engineErrorCode(await caught(alice.as.mutation(api.modules.graph.connections.requestConnection, { networkId: root, targetPersonId: priv.personId })))).toBe("notFound")
    // Une demande dans un réseau dont la cible n'est pas membre (et l'appelant non plus) : refus d'adhésion.
    expect(engineErrorCode(await caught(alice.as.mutation(api.modules.graph.connections.requestConnection, { networkId: testClosed, handle: "prive" })))).toBe("notFound")
  })
})

describe("réponse à une demande", () => {
  it("le destinataire accepte ; la relation acceptée ne repasse pas en attente sur une nouvelle demande", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    await connect(root, alice, bob)
    expect(await alice.as.query(api.modules.graph.connections.connectionWith, { networkId: root, otherPersonId: bob.personId })).toMatchObject({ state: "connected" })
    expect(await alice.as.mutation(api.modules.graph.connections.requestConnection, { networkId: root, targetPersonId: bob.personId })).toEqual({ status: "accepted" })
  })

  it("le DEMANDEUR ne s'accepte pas lui-même ; un tiers reçoit le refus d'une ligne inexistante ; une demande close ne se rejoue pas", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    const carol = await enter(t, root, "carol")
    await alice.as.mutation(api.modules.graph.connections.requestConnection, { networkId: root, targetPersonId: bob.personId })
    const view = await bob.as.query(api.modules.graph.connections.connectionWith, { networkId: root, otherPersonId: alice.personId })
    if (view.state !== "requested_by_them") throw new Error("demande attendue")
    const respond = (who: Person, accept: boolean) => who.as.mutation(api.modules.graph.connections.respondToConnection, { networkId: root, connectionId: view.connectionId, accept })
    expect(engineErrorCode(await caught(respond(alice, true)))).toBe("invalidArgument")
    expect(engineErrorCode(await caught(respond(carol, true)))).toBe("notFound")
    expect(await respond(bob, false)).toEqual({ status: "declined" })
    expect(engineErrorCode(await caught(respond(bob, true)))).toBe("conflict")
  })

  it("après un refus, une nouvelle demande est recevable (rouverte, même ligne)", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    await alice.as.mutation(api.modules.graph.connections.requestConnection, { networkId: root, targetPersonId: bob.personId })
    const view = await bob.as.query(api.modules.graph.connections.connectionWith, { networkId: root, otherPersonId: alice.personId })
    if (view.state !== "requested_by_them") throw new Error("demande attendue")
    await bob.as.mutation(api.modules.graph.connections.respondToConnection, { networkId: root, connectionId: view.connectionId, accept: false })
    expect(await alice.as.query(api.modules.graph.connections.connectionWith, { networkId: root, otherPersonId: bob.personId })).toMatchObject({ state: "declined" })
    await bob.as.mutation(api.modules.graph.connections.requestConnection, { networkId: root, targetPersonId: alice.personId })
    const rows = await connectionRows(t)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ status: "requested", requestedByPersonId: bob.personId, recipientPersonId: alice.personId })
  })

  it("pendingState relit l'état : destinataire puis accepté ; `missing` pour une ligne disparue ; un tiers ne lit rien", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    const carol = await enter(t, root, "carol")
    await alice.as.mutation(api.modules.graph.connections.requestConnection, { networkId: root, targetPersonId: bob.personId })
    const [row] = await connectionRows(t)
    if (!row) throw new Error("ligne attendue")
    expect(await bob.as.query(api.modules.graph.connections.pendingState, { networkId: root, connectionId: row._id })).toEqual({ status: "requested", iAmRecipient: true })
    expect(await alice.as.query(api.modules.graph.connections.pendingState, { networkId: root, connectionId: row._id })).toEqual({ status: "requested", iAmRecipient: false })
    expect(engineErrorCode(await caught(carol.as.query(api.modules.graph.connections.pendingState, { networkId: root, connectionId: row._id })))).toBe("notFound")
    await t.run(async (ctx) => ctx.db.delete(row._id))
    expect(await bob.as.query(api.modules.graph.connections.pendingState, { networkId: root, connectionId: row._id })).toEqual({ status: "missing", iAmRecipient: false })
  })
})

describe("blocage — unilatéral, muet, sur toute la paire", () => {
  it("le bloqué voit `none` ; son auteur `blocked_by_me` ; possible sans relation préalable", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    await bob.as.mutation(api.modules.graph.connections.blockPerson, { networkId: root, targetPersonId: alice.personId })
    expect(await alice.as.query(api.modules.graph.connections.connectionWith, { networkId: root, otherPersonId: bob.personId })).toEqual({ state: "none" })
    expect(await bob.as.query(api.modules.graph.connections.connectionWith, { networkId: root, otherPersonId: alice.personId })).toMatchObject({ state: "blocked_by_me" })
  })

  it("D12 — une demande du bloqué rend la réponse d'une demande envoyée, ne crée rien et ne révèle rien", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    await bob.as.mutation(api.modules.graph.connections.blockPerson, { networkId: root, targetPersonId: alice.personId })
    const before = await connectionRows(t)
    const answer = await alice.as.mutation(api.modules.graph.connections.requestConnection, { networkId: root, targetPersonId: bob.personId })
    // La réponse est EXACTEMENT celle d'une demande ordinaire : `blocked` n'apparaît nulle part.
    expect(answer).toEqual({ status: "requested" })
    expect(JSON.stringify(answer)).not.toContain("blocked")
    expect(await connectionRows(t)).toEqual(before)
  })

  it("un blocage posé dans un réseau vaut dans tous les autres", async () => {
    const t = testConvex()
    const { root, testClosed } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    for (const person of [alice, bob]) {
      await person.as.mutation(api.modules.people.memberships.joinNetwork, { networkId: testClosed, facet: { values: { countryOfResidence: "FR" }, visibilities: {} } })
    }
    await bob.as.mutation(api.modules.graph.connections.blockPerson, { networkId: testClosed, targetPersonId: alice.personId })
    expect(await bob.as.query(api.modules.graph.connections.connectionWith, { networkId: root, otherPersonId: alice.personId })).toMatchObject({ state: "blocked_by_me" })
    expect(await alice.as.mutation(api.modules.graph.connections.requestConnection, { networkId: root, targetPersonId: bob.personId })).toEqual({ status: "requested" })
    expect(await connectionRows(t)).toHaveLength(1)
    // Et la fiche, l'annuaire, l'abonnement se ferment aussi.
    expect(await alice.as.query(api.modules.people.profile.getPublicProfile, { networkId: root, handle: "bob" })).toBeNull()
    expect(await alice.as.query(api.modules.people.directory.searchPeople, { networkId: root, query: "bob" })).toEqual([])
    expect(engineErrorCode(await caught(alice.as.mutation(api.modules.graph.follows.follow, { networkId: root, handle: "bob" })))).toBe("notFound")
  })

  it("bloquer rompt une connexion acceptée ; seul l'auteur lève le blocage, vers « refusée »", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    await connect(root, alice, bob)
    await bob.as.mutation(api.modules.graph.connections.blockPerson, { networkId: root, targetPersonId: alice.personId })
    expect((await connectionRows(t))[0]).toMatchObject({ status: "blocked", blockedByPersonId: bob.personId })
    expect(engineErrorCode(await caught(alice.as.mutation(api.modules.graph.connections.unblockPerson, { networkId: root, targetPersonId: bob.personId })))).toBe("notFound")
    await bob.as.mutation(api.modules.graph.connections.unblockPerson, { networkId: root, targetPersonId: alice.personId })
    expect(await bob.as.query(api.modules.graph.connections.connectionWith, { networkId: root, otherPersonId: alice.personId })).toMatchObject({ state: "declined" })
  })
})

describe("listes paginées et recherche parmi mes relations", () => {
  it("parcourt les deux côtés canoniques sans doublon ni troncature ; les demandes reçues excluent les sortantes", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const me = await enter(t, root, "moi", "Moi Même")
    const others: Person[] = []
    for (let i = 0; i < 6; i += 1) others.push(await enter(t, root, `ami${i}`, `Ami Numéro ${i}`))
    for (const other of others.slice(0, 4)) await connect(root, other, me)
    await me.as.mutation(api.modules.graph.connections.requestConnection, { networkId: root, targetPersonId: others[4]!.personId })
    await others[5]!.as.mutation(api.modules.graph.connections.requestConnection, { networkId: root, targetPersonId: me.personId, message: "Salut" })

    const seen: string[] = []
    let low: { cursor: string | null; done: boolean } = { cursor: null, done: false }
    let high: { cursor: string | null; done: boolean } = { cursor: null, done: false }
    // Borné : un côté épuisé qui repartirait du début bouclerait sans fin, et
    // convex-test ne rend jamais la main au minuteur de vitest.
    for (let round = 0; round < 20 && (!low.done || !high.done); round += 1) {
      const page = await me.as.query(api.modules.graph.connections.paginateMine, {
        networkId: root,
        lowPaginationOpts: { numItems: 1, cursor: low.cursor },
        highPaginationOpts: { numItems: 1, cursor: high.cursor },
      })
      if (!low.done) seen.push(...page.low.page.map((row) => row.otherPersonId))
      if (!high.done) seen.push(...page.high.page.map((row) => row.otherPersonId))
      low = { cursor: page.low.continueCursor, done: page.low.isDone }
      high = { cursor: page.high.continueCursor, done: page.high.isDone }
    }
    expect(low.done && high.done).toBe(true)
    expect(new Set(seen).size).toBe(4)
    expect(seen.sort()).toEqual(others.slice(0, 4).map((other) => other.personId).sort())

    const pending = await me.as.query(api.modules.graph.connections.paginatePendingForMe, { networkId: root, paginationOpts: { numItems: 10, cursor: null } })
    expect(pending.page.map((row) => [row.otherPersonId, row.message])).toEqual([[others[5]!.personId, "Salut"]])
  })

  /**
   * `paginateMine` composait les deux côtés par deux sous-requêtes à pagination
   * native : une sous-requête `ctx.runQuery` PARTAGE l'exécution — et l'unique
   * `.paginate()` natif — de la requête qui l'appelle, et le moteur déployé
   * levait « This query function ran multiple paginated queries ». convex-test
   * ouvre un contexte neuf par sous-requête : `t.query` passait. On rejoue donc
   * la contrainte du moteur dans UN contexte : la pagination native consommée
   * d'entrée, puis les deux côtés. Un seul `.paginate()` natif de plus lève.
   */
  it("témoin : le harnais refuse une seconde pagination native dans un même contexte", async () => {
    const t = testConvex()
    const consume = async (ctx: Parameters<Parameters<T["run"]>[0]>[0]) => {
      await ctx.db.query("connections").paginate({ cursor: null, numItems: 1 })
    }
    await expect(
      t.run(async (ctx) => {
        await consume(ctx)
        await consume(ctx)
      }),
    ).rejects.toThrow(/Only a single paginated query/)
  })

  it("lit les deux côtés dans UNE exécution ; un côté épuisé, rejoué, ne repart pas du début", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const me = await enter(t, root, "moi", "Moi Même")
    const others: Person[] = []
    for (let i = 0; i < 6; i += 1) others.push(await enter(t, root, `ami${i}`, `Ami Numéro ${i}`))
    for (const other of others) await connect(root, other, me)

    const read = await t.run(async (ctx) => {
      await ctx.db.query("connections").paginate({ cursor: null, numItems: 1 })
      const opts = { cursor: null, numItems: 50 }
      const [low, high] = await Promise.all([acceptedSidePage(ctx, root, me.personId, "low", opts), acceptedSidePage(ctx, root, me.personId, "high", opts)])
      // Le client rejoue le curseur d'un côté FINI tant que l'autre continue :
      // il doit rendre une page vide, pas repartir du début.
      const replayed = await Promise.all([
        acceptedSidePage(ctx, root, me.personId, "low", { ...opts, cursor: low.continueCursor }),
        acceptedSidePage(ctx, root, me.personId, "high", { ...opts, cursor: high.continueCursor }),
      ])
      return {
        seen: [...low.page, ...high.page].map((row) => row.otherPersonId),
        done: low.isDone && high.isDone,
        replayed: replayed.map((page) => ({ rows: page.page.length, isDone: page.isDone })),
      }
    })

    expect(read.done).toBe(true)
    expect([...read.seen].sort()).toEqual(others.map((other) => other.personId).sort())
    expect(read.replayed).toEqual([
      { rows: 0, isDone: true },
      { rows: 0, isDone: true },
    ])
  })

  it("searchMine : par le nom (sans accents), par l'identifiant exact, jamais hors relations ; le mode privé ne retire rien", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const me = await enter(t, root, "moi", "Moi Même")
    const helene = await enter(t, root, "helene", "Hélène Ondo")
    await enter(t, root, "helene2", "Hélène Inconnue")
    await connect(root, helene, me)
    await helene.as.mutation(api.modules.people.profile.setMyProfilePrivacy, { private: true })
    const search = (query: string) => me.as.query(api.modules.graph.connections.searchMine, { networkId: root, query })
    expect((await search("helene")).map((hit) => hit.handle)).toEqual(["helene"])
    expect((await search("@HELENE")).map((hit) => hit.handle)).toEqual(["helene"])
    expect((await search("ond")).map((hit) => hit.handle)).toEqual(["helene"])
    expect(await search("inconnue")).toEqual([])
    expect(await search(" ")).toEqual([])
  })
})

describe("abonnements", () => {
  it("s'abonner est idempotent, compté par l'agrégat ; on ne s'abonne pas à soi-même ; se désabonner décompte", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    const carol = await enter(t, root, "carol")
    expect(await alice.as.mutation(api.modules.graph.follows.follow, { networkId: root, handle: "bob" })).toEqual({ targetPersonId: bob.personId, following: true })
    await alice.as.mutation(api.modules.graph.follows.follow, { networkId: root, handle: "bob" })
    await carol.as.mutation(api.modules.graph.follows.follow, { networkId: root, handle: "bob" })
    expect(await bob.as.query(api.modules.graph.follows.myFollowerCount, { networkId: root })).toBe(2)
    expect(await alice.as.query(api.modules.graph.follows.isFollowing, { networkId: root, targetPersonId: bob.personId })).toBe(true)
    expect(engineErrorCode(await caught(alice.as.mutation(api.modules.graph.follows.follow, { networkId: root, handle: "alice" })))).toBe("invalidArgument")
    await alice.as.mutation(api.modules.graph.follows.unfollow, { networkId: root, targetPersonId: bob.personId })
    await alice.as.mutation(api.modules.graph.follows.unfollow, { networkId: root, targetPersonId: bob.personId })
    expect(await bob.as.query(api.modules.graph.follows.myFollowerCount, { networkId: root })).toBe(1)
    const mine = await carol.as.query(api.modules.graph.follows.paginateMyFollows, { networkId: root, paginationOpts: { numItems: 10, cursor: null } })
    expect(mine.page.map((row) => row.handle)).toEqual(["bob"])
  })

  it("un profil privé ne se suit pas (refus indistinct) ; les suggestions écartent soi, les suivis, les connexions et les privés", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    await enter(t, root, "carol")
    const dan = await enter(t, root, "dan")
    const eve = await enter(t, root, "eve")
    await eve.as.mutation(api.modules.people.profile.setMyProfilePrivacy, { private: true })
    expect(engineErrorCode(await caught(alice.as.mutation(api.modules.graph.follows.follow, { networkId: root, handle: "eve" })))).toBe("notFound")
    await alice.as.mutation(api.modules.graph.follows.follow, { networkId: root, handle: "bob" })
    await connect(root, alice, dan)
    const suggestions = await alice.as.query(api.modules.graph.follows.suggestions, { networkId: root })
    expect(suggestions.map((row) => row.handle)).toEqual(["carol"])
  })
})
