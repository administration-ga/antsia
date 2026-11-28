// @vitest-environment edge-runtime
/**
 * CH-817 E4 — les publications d'exemple des comptes de démonstration de DIASPORA.GA, écrites par le
 * moteur à l'équipement de chaque acteur : dans le réseau seulement, jamais à la racine ; une fois
 * (clé stable), jamais recréées après un retrait ; réactions et commentaire entre acteurs quel que
 * soit l'ordre d'équipement, jamais entre deux comptes bloqués ; rien hors d'un déploiement où les
 * comptes de démonstration sont ouverts. Horloge simulée : les passages planifiés ne s'exécutent
 * que lorsque le test les fait passer.
 */
import { engineErrorCode } from "@antsia/social-contracts/errors"
import { normalizeCivilName } from "@antsia/social-domain/civilName"
import { NETWORK_FEATURES, type NetworkFeature } from "@antsia/social-domain/networkFeatures"
import {
  DIASPORA_GA_DEMO_ACTOR_SPECS,
  DIASPORA_GA_DEMO_ACTORS,
  DIASPORA_GA_DEMO_COUNTRIES,
  DIASPORA_GA_DEMO_POSTS,
  type DiasporaGaDemoActor,
  type DiasporaGaDemoPost,
  diasporaGaDemoCanPublish,
  diasporaGaDemoDisplayName,
  diasporaGaDemoEmailOf,
  diasporaGaDemoPostsOf,
} from "@diaspora-ga/domain"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, components, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { joinDeclaredDiasporaFixture, createTestSession, openNetworkFeatures, testConvex } from "../../test.setup"
import { readReactionCounts } from "../posts/counters"

type T = ReturnType<typeof testConvex>
type As = ReturnType<T["withIdentity"]>

const NOTHING = { postsCreated: 0, reactionsCreated: 0, commentsCreated: 0 }

function idOf(row: unknown): string {
  if (!row || typeof row !== "object" || !("_id" in row) || typeof row._id !== "string") throw new Error("Document de fixture absent")
  return row._id
}

function present<Row>(row: Row | null | undefined, label: string): Row {
  if (row === null || row === undefined) throw new Error(`Document de fixture absent : ${label}`)
  return row
}

async function code(promise: Promise<unknown>) {
  try {
    await promise
    return null
  } catch (error) {
    return engineErrorCode(error)
  }
}

/** La double garde du développement local ouverte : variable posée ET backend local. */
function openDevTools() {
  vi.stubEnv("ANTSIA_DEV_TOOLS", "true")
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  vi.stubEnv("ANTSIA_DEMO_DEPLOYMENT", "")
  // Porte non armée : la variable ABSENTE (CH-817 E5, constat 10 : vide, elle rendrait la porte indisponible).
  vi.stubEnv("ANTSIA_DEMO_GATE_SECRET", undefined)
}

/** Les comptes de démonstration fermés (la production, ou un déploiement non déclaré). */
function closeDevTools() {
  vi.stubEnv("ANTSIA_DEV_TOOLS", "false")
  vi.stubEnv("ANTIA_DEV_TOOLS", "false")
  vi.stubEnv("ANTSIA_DEMO_DEPLOYMENT", "")
}

beforeEach(() => {
  vi.useFakeTimers()
  openDevTools()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

/** Le moteur semé comme en développement local, les modules donnés ouverts (tous par défaut). */
async function fixture(features: readonly NetworkFeature[] = NETWORK_FEATURES) {
  const t = testConvex({ automaticSessions: false })
  const foundations = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const seeded = await t.mutation(internal.modules.diaspora.seed.run, { confirmNonProduction: SEED_CONFIRMATION })
  if (features.length > 0) await openNetworkFeatures(t, seeded.network, features)
  await t.finishAllScheduledFunctions(vi.runAllTimers)
  return { t, diasporaGa: seeded.network, root: foundations.root }
}

/** Un acteur du catalogue sur son adresse réservée, avec l'accueil et l'entrée que l'application rejoue pour lui. */
async function joinedActor(t: T, diasporaGa: Id<"networks">, actor: DiasporaGaDemoActor) {
  const spec = DIASPORA_GA_DEMO_ACTOR_SPECS[actor]
  const displayName = present(diasporaGaDemoDisplayName(actor), `nom de ${actor}`)
  const handle = present(spec.profile, `profil de ${actor}`).handle
  const now = Date.now()
  const authUserId = idOf(await t.mutation(components.betterAuth.adapter.create, { input: { model: "user", data: { name: "ANTSIA", email: diasporaGaDemoEmailOf(actor), emailVerified: true, createdAt: now, updatedAt: now } } }))
  const sessionId = await createTestSession(t, authUserId)
  const as = t.withIdentity({ subject: authUserId, sessionId })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName })
  await joinDeclaredDiasporaFixture(as, { networkId: diasporaGa, facet: { countryOfResidence: spec.country }, directoryVisibility: "hidden" })
  return { as, personId, actor, authUserId, sessionId }
}

/** L'équipement réel, puis les passages planifiés qu'il déclenche (l'animation, puis la diffusion vers les fils). */
async function equip(t: T, as: As, actor: DiasporaGaDemoActor) {
  const equipped = await as.mutation(api.modules.diaspora.demoAccounts.equipMyDemoAccount, { actor })
  await t.finishAllScheduledFunctions(vi.runAllTimers)
  return equipped
}

async function animate(t: T, actor: DiasporaGaDemoActor) {
  return await t.mutation(internal.modules.diaspora.demoContent.animateActor, { actor })
}

function entryOf(key: string): DiasporaGaDemoPost {
  return present(DIASPORA_GA_DEMO_POSTS.find((entry) => entry.key === key), `publication ${key}`)
}

/** Les lignes de la publication d'exemple (une au plus attendue), lues par la clé que le moteur pose. */
async function demoPostRows(t: T, personId: Id<"persons">, entry: DiasporaGaDemoPost) {
  return await t.run(async (ctx) => await ctx.db.query("posts").withIndex("by_author_and_idempotencyKey", (q) => q.eq("authorPersonId", personId).eq("idempotencyKey", `diaspora-ga-demo:post:${entry.key}`)).take(5))
}

async function demoPostOf(t: T, personId: Id<"persons">, entry: DiasporaGaDemoPost) {
  const rows = await demoPostRows(t, personId, entry)
  expect(rows.length, `doublon de ${entry.key}`).toBeLessThanOrEqual(1)
  return rows[0] ?? null
}

async function postsByAuthor(t: T, personId: Id<"persons">) {
  return await t.run(async (ctx) => await ctx.db.query("posts").withIndex("by_author_and_idempotencyKey", (q) => q.eq("authorPersonId", personId)).take(50))
}

async function reactionsOf(t: T, postId: Id<"posts">) {
  return (await t.run(async (ctx) => await ctx.db.query("postReactions").withIndex("by_post_and_person", (q) => q.eq("postId", postId)).take(20))).map((row) => ({ personId: row.personId, kind: row.kind }))
}

async function rootCommentsOf(t: T, postId: Id<"posts">) {
  return (await t.run(async (ctx) => await ctx.db.query("postComments").withIndex("by_post_parent_status_createdAt", (q) => q.eq("postId", postId).eq("parentCommentId", undefined)).take(20))).map((row) => ({ authorPersonId: row.authorPersonId, body: row.body, status: row.status }))
}

async function setFeature(t: T, diasporaGa: Id<"networks">, feature: NetworkFeature, enabled: boolean) {
  await t.run(async (ctx) => {
    const row = present(await ctx.db.query("networkFeatures").withIndex("by_network_feature", (q) => q.eq("networkId", diasporaGa).eq("feature", feature)).first(), `module ${feature}`)
    await ctx.db.patch(row._id, { enabled })
  })
}

describe("publications d'exemple — dans DIASPORA.GA seulement, jamais à la racine", () => {
  it("declare : ses publications, écrites à l'équipement par le point d'écriture du moteur, portée et pays du composeur", async () => {
    const { t, diasporaGa, root } = await fixture()
    const declare = await joinedActor(t, diasporaGa, "declare")
    expect(await equip(t, declare.as, "declare")).toMatchObject({ status: "declaree" })
    const entries = diasporaGaDemoPostsOf("declare")
    expect(entries.length).toBeGreaterThanOrEqual(2)
    for (const entry of entries) {
      const post = present(await demoPostOf(t, declare.personId, entry), entry.key)
      expect(post).toMatchObject({ networkId: diasporaGa, authorPersonId: declare.personId, body: entry.body, audience: "public", visibility: "network", onRoot: false, status: "published", reach: entry.scope.reach })
      expect(post.country).toBe(entry.scope.country)
      expect(post.pageId).toBeUndefined()
      expect(post.tags?.length).toBeGreaterThan(0)
      // Lue depuis DIASPORA.GA : la carte ordinaire du moteur ; depuis la racine : le refus indistinct.
      expect(await declare.as.query(api.modules.posts.posts.getPost, { networkId: diasporaGa, postId: post._id })).toMatchObject({ body: entry.body, isMine: true, visibility: "network", reach: entry.scope.reach })
      expect(await code(declare.as.query(api.modules.posts.posts.getPost, { networkId: root, postId: post._id }))).toBe("notFound")
    }
    // Le fil « Récents » de la racine n'en montre aucune.
    const rootFeed = await declare.as.query(api.modules.posts.posts.feed, { networkId: root, paginationOpts: { cursor: null, numItems: 50 } })
    expect(rootFeed.page.filter((item) => item.body.startsWith("Démo — ") && entries.some((entry) => entry.body === item.body))).toEqual([])
  })

  it("rejouer l'équipement, ou l'animation, ne double rien", async () => {
    const { t, diasporaGa } = await fixture()
    const declare = await joinedActor(t, diasporaGa, "declare")
    const fondateur = await joinedActor(t, diasporaGa, "fondateur")
    await equip(t, declare.as, "declare")
    await equip(t, fondateur.as, "fondateur")
    const arrivee = present(await demoPostOf(t, declare.personId, entryOf("declare:arrivee")), "declare:arrivee")
    const before = { reactions: await reactionsOf(t, arrivee._id), comments: await rootCommentsOf(t, arrivee._id), declare: (await postsByAuthor(t, declare.personId)).length, fondateur: (await postsByAuthor(t, fondateur.personId)).length }
    expect(before.comments).toHaveLength(1)
    await equip(t, declare.as, "declare")
    await equip(t, fondateur.as, "fondateur")
    expect(await animate(t, "declare")).toEqual(NOTHING)
    expect(await animate(t, "fondateur")).toEqual(NOTHING)
    expect({ reactions: await reactionsOf(t, arrivee._id), comments: await rootCommentsOf(t, arrivee._id), declare: (await postsByAuthor(t, declare.personId)).length, fondateur: (await postsByAuthor(t, fondateur.personId)).length }).toEqual(before)
    for (const entry of [...diasporaGaDemoPostsOf("declare"), ...diasporaGaDemoPostsOf("fondateur")]) {
      const author = entry.actor === "declare" ? declare : fondateur
      expect(await demoPostRows(t, author.personId, entry), entry.key).toHaveLength(1)
    }
  })

  it("CH-817 E5, constat 8 : le commentaire d'exemple n'est pas doublé au-delà de deux cents commentaires de la publication", async () => {
    const { t, diasporaGa } = await fixture()
    const entry = entryOf("declare:arrivee")
    const commenterActor = present(entry.comment, "commentaire").actor
    const declare = await joinedActor(t, diasporaGa, "declare")
    await equip(t, declare.as, "declare")
    const arrivee = present(await demoPostOf(t, declare.personId, entry), "declare:arrivee")
    // Deux cents commentaires racines d'un autre compte, AVANT celui de l'acteur : la lecture d'avant
    // (les plus anciens de la publication) ne voyait plus le sien et le doublait.
    await t.run(async (ctx) => {
      for (let index = 0; index < 200; index++) {
        await ctx.db.insert("postComments", { networkId: diasporaGa, postId: arrivee._id, authorPersonId: declare.personId, body: `Commentaire de recette ${index}`, status: "published", createdAt: Date.now(), updatedAt: Date.now() })
      }
    })
    const commenter = await joinedActor(t, diasporaGa, commenterActor)
    await equip(t, commenter.as, commenterActor)
    const mine = async () => (await t.run(async (ctx) => await ctx.db.query("postComments").withIndex("by_authorPersonId", (q) => q.eq("authorPersonId", commenter.personId)).take(50))).filter((row) => row.postId === arrivee._id)
    expect(await mine()).toHaveLength(1)
    expect((await animate(t, commenterActor)).commentsCreated).toBe(0)
    expect((await animate(t, "declare")).commentsCreated).toBe(0)
    expect(await mine()).toHaveLength(1)
  })

  it("CH-817 E5, constat 8 : lecture par auteur saturée (deux cents commentaires ailleurs) → rien ne s'écrit", async () => {
    const { t, diasporaGa } = await fixture()
    const entry = entryOf("declare:arrivee")
    const commenterActor = present(entry.comment, "commentaire").actor
    const declare = await joinedActor(t, diasporaGa, "declare")
    const commenter = await joinedActor(t, diasporaGa, commenterActor)
    await equip(t, declare.as, "declare")
    const arrivee = present(await demoPostOf(t, declare.personId, entry), "declare:arrivee")
    const elsewhere = present((await postsByAuthor(t, declare.personId)).find((post) => post._id !== arrivee._id), "autre publication")
    await t.run(async (ctx) => {
      for (let index = 0; index < 200; index++) {
        await ctx.db.insert("postComments", { networkId: diasporaGa, postId: elsewhere._id, authorPersonId: commenter.personId, parentCommentId: undefined, body: `Commentaire de recette ${index}`, status: "published", createdAt: Date.now(), updatedAt: Date.now() })
      }
    })
    await equip(t, commenter.as, commenterActor)
    expect((await rootCommentsOf(t, arrivee._id)).filter((row) => row.authorPersonId === commenter.personId)).toEqual([])
  })

  it("une publication retirée par son auteur n'est jamais recréée, et ne reçoit plus rien", async () => {
    const { t, diasporaGa } = await fixture()
    const declare = await joinedActor(t, diasporaGa, "declare")
    await equip(t, declare.as, "declare")
    const arrivee = present(await demoPostOf(t, declare.personId, entryOf("declare:arrivee")), "declare:arrivee")
    expect(await declare.as.mutation(api.modules.posts.posts.remove, { networkId: diasporaGa, postId: arrivee._id })).toEqual({ removed: true })
    await equip(t, declare.as, "declare")
    expect(await animate(t, "declare")).toEqual(NOTHING)
    const rows = await demoPostRows(t, declare.personId, entryOf("declare:arrivee"))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ _id: arrivee._id, status: "removed" })
    // La fondatrice, qui y réagit et la commente au catalogue, arrive ensuite : rien sur la publication retirée.
    const fondateur = await joinedActor(t, diasporaGa, "fondateur")
    await equip(t, fondateur.as, "fondateur")
    expect(await reactionsOf(t, arrivee._id)).toEqual([])
    expect(await rootCommentsOf(t, arrivee._id)).toEqual([])
  })
})

describe("publications d'exemple — qui publie", () => {
  it("« leger » ne publie rien ; le filleul attend son parrain, puis publie dès que l'équipement du parrain le déclare", async () => {
    const { t, diasporaGa } = await fixture()
    for (const actor of ["nouveau", "leger"] as const) expect(diasporaGaDemoCanPublish(actor)).toBe(false)
    const leger = await joinedActor(t, diasporaGa, "leger")
    expect(await equip(t, leger.as, "leger")).toMatchObject({ status: "en_attente" })
    expect(await postsByAuthor(t, leger.personId)).toEqual([])
    expect(await animate(t, "leger")).toEqual(NOTHING)

    const parraine = await joinedActor(t, diasporaGa, "parraine")
    expect(await equip(t, parraine.as, "parraine")).toMatchObject({ status: "en_attente" })
    expect(await postsByAuthor(t, parraine.personId)).toEqual([])
    const verifie = await joinedActor(t, diasporaGa, "verifie")
    await equip(t, verifie.as, "verifie")
    // Déclarée par l'équipement du parrain, la filleule publie (animation planifiée par cet équipement)…
    for (const entry of diasporaGaDemoPostsOf("parraine")) expect(await demoPostOf(t, parraine.personId, entry), entry.key).not.toBeNull()
    // … et le parrain y réagit et la commente, comme le dit le catalogue.
    const merci = present(await demoPostOf(t, parraine.personId, entryOf("parraine:merci")), "parraine:merci")
    expect(await reactionsOf(t, merci._id)).toEqual([{ personId: verifie.personId, kind: "soutien" }])
    expect(await rootCommentsOf(t, merci._id)).toEqual([{ authorPersonId: verifie.personId, body: present(entryOf("parraine:merci").comment, "commentaire").body, status: "published" }])
  })

  it("rien n'est écrit quand les comptes de démonstration sont fermés (la production comprise) ; contrôle : ouverts, si", async () => {
    const { t, diasporaGa } = await fixture()
    const declare = await joinedActor(t, diasporaGa, "declare")
    await declare.as.mutation(api.modules.diaspora.demoAccounts.equipMyDemoAccount, { actor: "declare" })
    // L'animation planifiée passe sur un déploiement fermé : rien.
    closeDevTools()
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    expect(await postsByAuthor(t, declare.personId)).toEqual([])
    expect(await animate(t, "declare")).toEqual(NOTHING)
    vi.stubEnv("CONVEX_CLOUD_URL", "https://production-antsia-456.convex.cloud")
    expect(await animate(t, "declare")).toEqual(NOTHING)
    expect(await postsByAuthor(t, declare.personId)).toEqual([])
    // Contrôle : la garde seule refusait.
    openDevTools()
    expect(await animate(t, "declare")).toMatchObject({ postsCreated: diasporaGaDemoPostsOf("declare").length })
  })

  it("le nom affiché est celui du catalogue, normalisé ; un compte renommé n'écrit plus rien au nom de la démonstration", async () => {
    for (const actor of DIASPORA_GA_DEMO_ACTORS) {
      const profile = DIASPORA_GA_DEMO_ACTOR_SPECS[actor].profile
      if (profile === null || diasporaGaDemoPostsOf(actor).length === 0) continue
      const normalized = normalizeCivilName({ firstName: profile.givenNames, lastName: profile.familyName })
      expect(normalized, `nom de ${actor}`).toEqual({ firstName: profile.givenNames, lastName: profile.familyName })
      expect(diasporaGaDemoDisplayName(actor)).toBe(`${normalized.firstName} ${normalized.lastName}`)
    }
    const { t, diasporaGa } = await fixture()
    const declare = await joinedActor(t, diasporaGa, "declare")
    await declare.as.mutation(api.modules.diaspora.demoAccounts.equipMyDemoAccount, { actor: "declare" })
    await t.run(async (ctx) => {
      await ctx.db.patch(declare.personId, { displayName: "Quelqu'un D'AUTRE" })
    })
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    expect(await postsByAuthor(t, declare.personId)).toEqual([])
  })
})

describe("publications d'exemple — au nom d'une page", () => {
  it("par la page de l'acteur, seulement quand les pages sont ouvertes ; le pays de la page, aucun pour la portée diaspora", async () => {
    const { t, diasporaGa } = await fixture()
    const association = await joinedActor(t, diasporaGa, "association")
    const equipped = await association.as.mutation(api.modules.diaspora.demoAccounts.equipMyDemoAccount, { actor: "association" })
    const pageId = present(equipped.pageId, "page de l'association")
    // Les pages fermées avant que l'animation ne passe : les publications personnelles seulement.
    await setFeature(t, diasporaGa, "pages", false)
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    const personal = diasporaGaDemoPostsOf("association").filter((entry) => entry.author === "person")
    const asPage = diasporaGaDemoPostsOf("association").filter((entry) => entry.author === "page")
    expect(asPage.length).toBeGreaterThanOrEqual(2)
    for (const entry of personal) expect(await demoPostOf(t, association.personId, entry), entry.key).not.toBeNull()
    for (const entry of asPage) expect(await demoPostOf(t, association.personId, entry), entry.key).toBeNull()
    // Rouvertes : le prochain équipement écrit celles de la page, par la page.
    await setFeature(t, diasporaGa, "pages", true)
    await equip(t, association.as, "association")
    for (const entry of asPage) {
      const post = present(await demoPostOf(t, association.personId, entry), entry.key)
      expect(post).toMatchObject({ networkId: diasporaGa, pageId, authorPersonId: association.personId, audience: "public", visibility: "network", onRoot: false, status: "published", reach: "local", country: "FR" })
      expect((await association.as.query(api.modules.posts.posts.getPost, { networkId: diasporaGa, postId: post._id })).page).toMatchObject({ pageId })
    }

    // Une publication de page de portée diaspora ne porte aucun pays (`pages.publishAsPage`).
    const institution = await joinedActor(t, diasporaGa, "institution")
    await equip(t, institution.as, "institution")
    const welcome = present(await demoPostOf(t, institution.personId, entryOf("institution:page-bienvenue")), "institution:page-bienvenue")
    expect(welcome).toMatchObject({ reach: "diaspora", visibility: "network", onRoot: false })
    expect(welcome.pageId).toBeDefined()
    expect(welcome.country).toBeUndefined()
  })
})

describe("publications d'exemple — réactions et commentaire entre acteurs", () => {
  async function arriveeAfter(order: readonly DiasporaGaDemoActor[]) {
    const { t, diasporaGa } = await fixture()
    const people = new Map<DiasporaGaDemoActor, Id<"persons">>()
    for (const actor of order) {
      const member = await joinedActor(t, diasporaGa, actor)
      people.set(actor, member.personId)
      await equip(t, member.as, actor)
    }
    const post = present(await demoPostOf(t, present(people.get("declare"), "declare"), entryOf("declare:arrivee")), "declare:arrivee")
    const author = { reactions: await reactionsOf(t, post._id), comments: await rootCommentsOf(t, post._id) }
    const reader = await joinedActor(t, diasporaGa, "verifie")
    await equip(t, reader.as, "verifie")
    const card = await reader.as.query(api.modules.posts.posts.getPost, { networkId: diasporaGa, postId: post._id })
    const counts = await t.run(async (ctx) => await readReactionCounts(ctx, post._id))
    return { ...author, fondateur: present(people.get("fondateur"), "fondateur"), card, counts }
  }

  it("posés dès que les deux comptes existent, quel que soit l'ordre d'équipement ; décomptés comme une réaction et un commentaire réels", async () => {
    const authorFirst = await arriveeAfter(["declare", "fondateur"])
    const reactorFirst = await arriveeAfter(["fondateur", "declare"])
    const entry = entryOf("declare:arrivee")
    for (const outcome of [authorFirst, reactorFirst]) {
      // La fondatrice réagit (« soutien ») et commente ; le parrainé, jamais équipé ici, ne réagit pas.
      expect(outcome.reactions).toEqual([{ personId: outcome.fondateur, kind: "soutien" }])
      expect(outcome.comments).toEqual([{ authorPersonId: outcome.fondateur, body: present(entry.comment, "commentaire").body, status: "published" }])
      expect(outcome.counts.total).toBe(1)
      expect(outcome.counts.counts.soutien).toBe(1)
      expect(outcome.card).toMatchObject({ commentCount: 1, reactions: { total: 1 } })
    }
  })

  it("jamais entre deux comptes bloqués", async () => {
    // Au catalogue, le membre bloqué et celui qui le bloque n'interagissent jamais.
    for (const entry of DIASPORA_GA_DEMO_POSTS) {
      const blockedBy = DIASPORA_GA_DEMO_ACTOR_SPECS[entry.actor].blockedBy
      const blocking = DIASPORA_GA_DEMO_ACTORS.filter((actor) => DIASPORA_GA_DEMO_ACTOR_SPECS[actor].blockedBy === entry.actor)
      for (const other of [...(blockedBy ? [blockedBy] : []), ...blocking]) {
        expect(entry.reactions.map((reaction) => reaction.actor), entry.key).not.toContain(other)
        expect(entry.comment?.actor, entry.key).not.toBe(other)
      }
    }
    // Un blocage posé par une personne (le vrai geste) : ni réaction ni commentaire de démonstration entre elles.
    const { t, diasporaGa } = await fixture()
    const declare = await joinedActor(t, diasporaGa, "declare")
    const fondateur = await joinedActor(t, diasporaGa, "fondateur")
    await equip(t, declare.as, "declare")
    expect(await fondateur.as.mutation(api.modules.graph.connections.blockPerson, { networkId: diasporaGa, targetPersonId: declare.personId })).toBeNull()
    await equip(t, fondateur.as, "fondateur")
    const arrivee = present(await demoPostOf(t, declare.personId, entryOf("declare:arrivee")), "declare:arrivee")
    expect(await reactionsOf(t, arrivee._id)).toEqual([])
    expect(await rootCommentsOf(t, arrivee._id)).toEqual([])
    // Et dans l'autre sens : « declare » réagit à « fondateur:bienvenue » au catalogue, pas ici.
    const bienvenue = present(await demoPostOf(t, fondateur.personId, entryOf("fondateur:bienvenue")), "fondateur:bienvenue")
    expect((await reactionsOf(t, bienvenue._id)).map((row) => row.personId)).not.toContain(declare.personId)
  })

  it("jamais entre deux comptes bloqués, sous une publication de PAGE non plus (la page parle, mais son signataire est bloqué)", async () => {
    const { t, diasporaGa } = await fixture()
    const association = await joinedActor(t, diasporaGa, "association")
    const fondateur = await joinedActor(t, diasporaGa, "fondateur")
    const parraine = await joinedActor(t, diasporaGa, "parraine")
    const verifie = await joinedActor(t, diasporaGa, "verifie")
    await equip(t, verifie.as, "verifie")
    await equip(t, parraine.as, "parraine")
    // La fondatrice bloque la présidente de l'association, avant que l'une ou l'autre ne soit équipée.
    expect(await fondateur.as.mutation(api.modules.graph.connections.blockPerson, { networkId: diasporaGa, targetPersonId: association.personId })).toBeNull()
    await equip(t, association.as, "association")
    await equip(t, fondateur.as, "fondateur")
    const presentation = present(await demoPostOf(t, association.personId, entryOf("association:page-presentation")), "association:page-presentation")
    expect(presentation.pageId).toBeDefined()
    // La filleule (non bloquée) réagit et commente ; la fondatrice (« bravo » au catalogue), non.
    expect(await reactionsOf(t, presentation._id)).toEqual([{ personId: parraine.personId, kind: "like" }])
    expect((await rootCommentsOf(t, presentation._id)).map((row) => row.authorPersonId)).toEqual([parraine.personId])
  })
})

describe("publications d'exemple — le catalogue entier", () => {
  it("chaque acteur équipé dans l'ordre du panneau : chaque publication une fois, dans le réseau, et ses gestes entre comptes prêts", async () => {
    const { t, diasporaGa } = await fixture()
    // Tous les pays de la démonstration ouverts par l'administration du réseau.
    await t.run(async (ctx) => {
      await ctx.db.patch(diasporaGa, { openCountries: [...DIASPORA_GA_DEMO_COUNTRIES] })
    })
    const people = new Map<DiasporaGaDemoActor, Id<"persons">>()
    for (const actor of DIASPORA_GA_DEMO_ACTORS) {
      const spec = DIASPORA_GA_DEMO_ACTOR_SPECS[actor]
      if (spec.profile === null || spec.outsider) continue
      const member = await joinedActor(t, diasporaGa, actor)
      people.set(actor, member.personId)
      await equip(t, member.as, actor)
    }
    const publishing = (actor: DiasporaGaDemoActor) => diasporaGaDemoCanPublish(actor) && people.has(actor)
    for (const entry of DIASPORA_GA_DEMO_POSTS) {
      const authorId = present(people.get(entry.actor), entry.key)
      const post = present(await demoPostOf(t, authorId, entry), entry.key)
      expect(post, entry.key).toMatchObject({ networkId: diasporaGa, visibility: "network", onRoot: false, audience: "public", status: "published", body: entry.body })
      expect(post.pageId !== undefined, entry.key).toBe(entry.author === "page")
      const reactions = await reactionsOf(t, post._id)
      const expected = entry.reactions.filter((reaction) => publishing(reaction.actor)).map((reaction) => ({ personId: present(people.get(reaction.actor), reaction.actor), kind: reaction.kind }))
      expect([...reactions].sort((a, b) => a.personId.localeCompare(b.personId)), entry.key).toEqual([...expected].sort((a, b) => a.personId.localeCompare(b.personId)))
      const comments = await rootCommentsOf(t, post._id)
      expect(comments, entry.key).toEqual(entry.comment && publishing(entry.comment.actor) ? [{ authorPersonId: present(people.get(entry.comment.actor), entry.comment.actor), body: entry.comment.body, status: "published" }] : [])
    }
    // Rien d'autre n'est écrit : ni pour un compte qui ne publie pas, ni hors du catalogue.
    for (const [actor, personId] of people) {
      expect((await postsByAuthor(t, personId)).length, actor).toBe(diasporaGaDemoCanPublish(actor) ? diasporaGaDemoPostsOf(actor).length : 0)
    }
  })
})

describe("retrait ciblé des acteurs de démonstration", () => {
  const retire = internal.modules.diaspora.demoAccounts.retireDemoActor

  async function ordinaryMember(t: T, networkId: Id<"networks">) {
    const member = await joinedActor(t, networkId, "belgique")
    await t.mutation(components.betterAuth.adapter.updateOne, { input: {
      model: "user", where: [{ field: "_id", value: member.authUserId }], update: { email: "membre@example.test" },
    } })
    await t.run(async ctx => {
      const membership = await ctx.db.query("networkMemberships").withIndex("by_network_and_person",
        q => q.eq("networkId", networkId).eq("personId", member.personId)).unique()
      await ctx.db.patch(present(membership, "adhésion")._id, { status: "declaree" })
    })
    return member
  }

  it("simule, protège les discussions mixtes et supprime les seuls gestes de l’acteur dans le réseau", async () => {
    const { t, diasporaGa } = await fixture()
    const actor = await joinedActor(t, diasporaGa, "declare")
    await equip(t, actor.as, "declare")
    const member = await ordinaryMember(t, diasporaGa)
    const mixed = present(await demoPostOf(t, actor.personId, entryOf("declare:arrivee")), "publication")
    const postRead = () => member.as.query(api.modules.posts.posts.getPost, { networkId: diasporaGa, postId: mixed._id })
    const scope = { networkId: diasporaGa, postId: mixed._id }
    const original = await t.mutation(retire, { actor: "declare" })
    expect(original.posts).toBeGreaterThan(0)
    expect(original.membership).toBe(true)
    expect(await postRead()).toMatchObject({ body: mixed.body })
    await member.as.mutation(api.modules.engagement.engagement.comment, { ...scope, body: "Ma contribution réelle" })
    await expect(t.mutation(retire, { actor: "declare", applyPreview: original.preview })).rejects.toThrow("fresh")
    const { postId } = await member.as.mutation(api.modules.posts.posts.publish, { networkId: diasporaGa, body: "Actualité locale", reach: "diaspora" })
    const memberScope = { networkId: diasporaGa, postId }
    await actor.as.mutation(api.modules.engagement.engagement.toggleReaction, { ...memberScope, kind: "like" })
    const simple = await actor.as.mutation(api.modules.engagement.engagement.comment, { ...memberScope, body: "Commentaire de démo" })
    const rootComment = await actor.as.mutation(api.modules.engagement.engagement.comment, { ...memberScope, body: "Discussion engagée" })
    const reply = await member.as.mutation(api.modules.engagement.engagement.comment, { ...memberScope, parentCommentId: rootComment.commentId, body: "Réponse d’un membre" })
    await t.run(async ctx => {
      const membership = await ctx.db.query("networkMemberships").withIndex("by_network_and_person",
        q => q.eq("networkId", diasporaGa).eq("personId", actor.personId)).unique()
      await ctx.db.patch(present(membership, "adhésion")._id, { role: "network_moderator" })
    })
    const roleEntries = () => t.run(async ctx => (await ctx.db.query("engineAudit").collect())
      .filter(row => row.networkId === diasporaGa && row.action === "membership.role_set" && row.subjectId === actor.personId))
    const preview = await t.mutation(retire, { actor: "declare" })
    expect(await roleEntries()).toHaveLength(0)
    expect(preview).toMatchObject({ membership: false, membershipRetained: true, retainedPosts: 1,
      comments: 1, retainedComments: 1, reactions: 1, sessions: 1, applied: false })
    expect(await t.mutation(retire, { actor: "declare", applyPreview: preview.preview })).toMatchObject({ applied: true })
    expect(await postRead()).toMatchObject({ body: mixed.body, commentCount: 1 })
    const comments = await member.as.query(api.modules.engagement.engagement.paginateComments, { ...memberScope, paginationOpts: { cursor: null, numItems: 20 } })
    expect(comments.page).toEqual([expect.objectContaining({ commentId: rootComment.commentId, replies: [expect.objectContaining({ commentId: reply.commentId })] })])
    expect(await t.run(ctx => ctx.db.get(simple.commentId))).toMatchObject({ status: "removed" })
    expect(await t.run(ctx => readReactionCounts(ctx, postId))).toMatchObject({ total: 0 })
    expect(await t.query(components.betterAuth.adapter.findOne, { model: "session", where: [{ field: "_id", value: actor.sessionId }] })).toBeNull()
    expect(await t.query(components.betterAuth.adapter.findOne, { model: "session", where: [{ field: "_id", value: member.sessionId }] })).not.toBeNull()
    const replay = await t.mutation(retire, { actor: "declare" })
    expect(replay).toMatchObject({ posts: 0, comments: 0, reactions: 0, sessions: 0, membership: false })
    await t.mutation(retire, { actor: "declare", applyPreview: replay.preview })
    expect(await roleEntries()).toEqual([expect.objectContaining({
      capacity: "system", subjectTable: "persons",
      details: { from: "network_moderator", to: "member", origin: "diaspora_demo_retirement" },
    })])
    expect(await t.mutation(retire, { actor: "declare" })).toEqual(replay)
  })

  it("conserve une page partagée et refuse de toucher une adresse non vérifiée", async () => {
    const { t, diasporaGa } = await fixture()
    const actor = await joinedActor(t, diasporaGa, "entreprise")
    const { pageId } = await equip(t, actor.as, "entreprise")
    const page = present(pageId, "page")
    const member = await ordinaryMember(t, diasporaGa)
    const solo = await t.mutation(retire, { actor: "entreprise" })
    expect(solo.page).toBe(true)
    await t.run(ctx => ctx.db.insert("pageSignatories", { networkId: diasporaGa, pageId: page, personId: member.personId,
      role: "admin", acceptedAt: Date.now(), createdAt: Date.now(), updatedAt: Date.now() }))
    await expect(t.mutation(retire, { actor: "entreprise", applyPreview: solo.preview })).rejects.toThrow("fresh")
    await t.mutation(components.betterAuth.adapter.updateOne, { input: { model: "user", where: [{ field: "_id", value: actor.authUserId }], update: { emailVerified: false } } })
    expect(await t.mutation(retire, { actor: "entreprise" })).toMatchObject({ membership: false, posts: 0, page: false, sessions: 0 })
    await t.mutation(components.betterAuth.adapter.updateOne, { input: { model: "user", where: [{ field: "_id", value: actor.authUserId }], update: { emailVerified: true } } })
    const shared = await t.mutation(retire, { actor: "entreprise" })
    expect(shared).toMatchObject({ membership: true, page: false, sharedPageRetained: true })
    await t.mutation(retire, { actor: "entreprise", applyPreview: shared.preview })
    expect(await t.run(ctx => ctx.db.get(page))).toMatchObject({ status: "active" })
    expect(await t.mutation(retire, { actor: "entreprise" })).toMatchObject({ membership: false, posts: 0, sessions: 0 })
  })

  it("deux passes sur les acteurs retirent un fil qui ne contenait que leurs interactions", async () => {
    const { t, diasporaGa } = await fixture()
    const author = await joinedActor(t, diasporaGa, "declare")
    const other = await joinedActor(t, diasporaGa, "fondateur")
    await equip(t, author.as, "declare")
    await equip(t, other.as, "fondateur")
    const mixed = present(await demoPostOf(t, author.personId, entryOf("declare:arrivee")), "publication")
    expect(await rootCommentsOf(t, mixed._id)).toHaveLength(1)
    for (const actor of ["declare", "fondateur", "declare", "fondateur"] as const) {
      const plan = await t.mutation(retire, { actor })
      await t.mutation(retire, { actor, applyPreview: plan.preview })
    }
    expect(await t.run(ctx => ctx.db.get(mixed._id))).toMatchObject({ status: "removed" })
    for (const actor of ["declare", "fondateur"] as const) {
      expect(await t.mutation(retire, { actor })).toMatchObject({ posts: 0, reactions: 0, comments: 0, membership: false, membershipRetained: false })
    }
  })

  it("parcourt une activité supérieure au lot sans fermer prématurément la discussion d’un tiers", async () => {
    const { t, diasporaGa } = await fixture()
    const actor = await joinedActor(t, diasporaGa, "declare")
    await equip(t, actor.as, "declare")
    const member = await ordinaryMember(t, diasporaGa)
    const model = present(await demoPostOf(t, actor.personId, entryOf("declare:arrivee")), "publication")
    const { _id, _creationTime, ...fields } = model
    const recent = await t.run(async ctx => {
      let last = _id
      for (let index = 0; index < 37; index++) last = await ctx.db.insert("posts", {
        ...fields, idempotencyKey: `recette-volume-${index}`, publishedAt: fields.publishedAt + index + 1,
      })
      return last
    })
    await member.as.mutation(api.modules.engagement.engagement.comment, { networkId: diasporaGa, postId: recent, body: "Je conserve cette conversation." })
    let plan = await t.mutation(retire, { actor: "declare" })
    let previous: NonNullable<typeof plan.next> | undefined
    let removed = 0
    for (let pass = 0; pass < 10; pass++) {
      const start = pass === 0 ? undefined : previous
      const result = await t.mutation(retire, { actor: "declare", start, applyPreview: plan.preview })
      removed += result.posts
      if (!result.next) break
      previous = result.next
      plan = await t.mutation(retire, { actor: "declare", start: previous })
    }
    expect(removed).toBeGreaterThan(32)
    const read = await member.as.query(api.modules.posts.posts.getPost, { networkId: diasporaGa, postId: recent })
    expect(read).toMatchObject({ commentCount: 1 })
    expect(await t.mutation(retire, { actor: "declare" })).toMatchObject({ next: null, membershipRetained: true, posts: 0, retainedPosts: 1 })
  })

  it("ne révoque que les identifiants de session du lot confirmé", async () => {
    const { t, diasporaGa } = await fixture()
    const actor = await joinedActor(t, diasporaGa, "declare")
    for (let index = 0; index < 100; index++) await createTestSession(t, actor.authUserId)
    const preview = await t.mutation(retire, { actor: "declare" })
    expect(preview).toMatchObject({ sessions: 100, moreSessions: true })
    const latest = await createTestSession(t, actor.authUserId)
    await t.mutation(retire, { actor: "declare", applyPreview: preview.preview })
    expect(await t.query(components.betterAuth.adapter.findOne, { model: "session", where: [{ field: "_id", value: latest }] })).not.toBeNull()
    const next = await t.mutation(retire, { actor: "declare" })
    expect(next).toMatchObject({ sessions: 2, moreSessions: false })
    await t.mutation(retire, { actor: "declare", applyPreview: next.preview })
    expect(await t.mutation(retire, { actor: "declare" })).toMatchObject({ sessions: 0, moreSessions: false })
  })

  it("conserve la session et le rôle du dernier administrateur si le départ est refusé", async () => {
    const { t, diasporaGa } = await fixture()
    const admin = await joinedActor(t, diasporaGa, "administrateur")
    await equip(t, admin.as, "administrateur")
    const preview = await t.mutation(retire, { actor: "administrateur" })
    await expect(t.mutation(retire, { actor: "administrateur", applyPreview: preview.preview })).rejects.toThrow()
    expect(await t.mutation(retire, { actor: "administrateur" })).toEqual(preview)
    expect(await t.query(components.betterAuth.adapter.findOne, { model: "session", where: [{ field: "_id", value: admin.sessionId }] })).not.toBeNull()
  })
})
