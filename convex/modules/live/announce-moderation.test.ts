// @vitest-environment edge-runtime
/**
 * L'ANNONCE au fil d'un direct retiré par la modération se referme avec lui.
 *
 * Avant : le direct retiré ne s'ouvrait plus (`directSessionAccessDecision`), mais son annonce
 * restait au fil avec son titre et menait à une page introuvable. Maintenant la garde des
 * publications (`posts/access.canSeePostDoc`) relit l'état de modération du direct, comme elle
 * relit celui de la page pour une publication de page : retrait, relecture en attente et masque
 * du déclarant ferment l'annonce partout (lien, fil, partage) ; un recours admis la rouvre, sans
 * rien réécrire.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { createTestOperatorProof, testConvex } from "../../test.setup"
import { codeOf, connect, enter, type Person, seed, sessionDoc, type T, T0 } from "./fixtures.setup"

const M = api.modules.moderation.cases
const P = api.modules.posts.posts

beforeEach(() => {
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  vi.useFakeTimers()
  vi.setSystemTime(T0)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

async function moderator(t: T, root: Id<"networks">): Promise<Person> {
  const person = await enter(t, root, "modo")
  await t.run(async (ctx) => {
    const row = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", root).eq("personId", person.personId)).unique()
    if (row) await ctx.db.patch(row._id, { role: "network_moderator" })
  })
  return person
}

async function operator(t: T, root: Id<"networks">): Promise<Person> {
  const person = await enter(t, root, "operatrice")
  await t.run(async (ctx) => await ctx.db.insert("operators", { personId: person.personId, role: "platform_operator", grantedAt: Date.now() }))
  await createTestOperatorProof(t, person.as, person.personId)
  return person
}

/** Alice annonce un direct public ; Bob, relié, le voit au fil et le partage ; Carol le signale. */
async function announced() {
  const t = testConvex()
  const { root } = await seed(t)
  const alice = await enter(t, root, "alice")
  const bob = await enter(t, root, "bob")
  const carol = await enter(t, root, "carol")
  const modo = await moderator(t, root)
  await connect(t, root, alice, bob)
  const { sessionId } = await alice.as.mutation(api.modules.live.sessions.create, { networkId: root, title: "Débat du conseil", audience: "public", chatMode: "open", announce: true })
  const postId = (await sessionDoc(t, sessionId))?.announcePostId
  if (!postId) throw new Error("annonce absente")
  const { postId: shareId } = await bob.as.mutation(P.publish, { networkId: root, body: "À suivre", sharedPostId: postId })
  return { t, root, alice, bob, carol, modo, sessionId, postId, shareId }
}

const feedIds = async (person: Person, networkId: Id<"networks">) => (await person.as.query(P.myFeed, { networkId })).items.map((item) => item._id)

describe("annonce d'un direct retiré par la modération", () => {
  it("le retrait du direct ferme son annonce pour tous, l'hôte compris, et son partage le dit ; le recours admis la rend", async () => {
    const { t, root, alice, bob, carol, modo, sessionId, postId, shareId } = await announced()
    expect(await bob.as.query(P.getPost, { networkId: root, postId })).toMatchObject({ live: { sessionId, title: "Débat du conseil" } })
    expect(await feedIds(bob, root)).toContain(postId)

    const report = await carol.as.mutation(M.report, { networkId: root, target: { kind: "live", id: sessionId }, reason: "violence" })
    await modo.as.mutation(M.decide, { networkId: root, reportId: report.reportId, decision: "actioned", reason: "Direct contraire aux règles.", sanctions: [] })

    // Le direct ne s'ouvre plus ; son annonce non plus — ni par son lien, ni au fil, pour l'audience comme pour l'hôte.
    for (const person of [bob, alice]) {
      expect(await codeOf(person.as.query(api.modules.live.sessions.get, { networkId: root, sessionId }))).toBe("notFound")
      expect(await codeOf(person.as.query(P.getPost, { networkId: root, postId }))).toBe("notFound")
    }
    expect(await feedIds(bob, root)).not.toContain(postId)
    // Le partage reste celui de Bob, mais ne dit plus que l'original est indisponible : ni titre ni direct.
    expect((await bob.as.query(P.getPost, { networkId: root, postId: shareId })).share).toEqual({ available: false })
    // Rien n'est supprimé : la publication demeure, prête à revenir.
    expect(await t.run(async (ctx) => (await ctx.db.get(postId))?.status)).toBe("published")

    const { appealId } = await alice.as.mutation(M.fileAppeal, { reportId: report.reportId, reason: "Débat public, sans violence." })
    const ops = await operator(t, root)
    await ops.as.mutation(M.reviewPlatformAppeal, { appealId, overturn: true, reason: "Retrait non fondé." })
    expect(await bob.as.query(P.getPost, { networkId: root, postId })).toMatchObject({ live: { sessionId, title: "Débat du conseil" } })
    expect(await feedIds(bob, root)).toContain(postId)
    expect((await bob.as.query(P.getPost, { networkId: root, postId: shareId })).share).toMatchObject({ available: true, postId })
  })

  it("le déclarant ne voit plus l'annonce du direct qu'il a signalé, comme le direct lui-même ; les autres la gardent", async () => {
    const { root, alice, bob, carol, sessionId, postId } = await announced()
    await carol.as.mutation(M.report, { networkId: root, target: { kind: "live", id: sessionId }, reason: "violence" })
    expect(await codeOf(carol.as.query(api.modules.live.sessions.get, { networkId: root, sessionId }))).toBe("notFound")
    expect(await codeOf(carol.as.query(P.getPost, { networkId: root, postId }))).toBe("notFound")
    for (const person of [bob, alice]) expect(await person.as.query(P.getPost, { networkId: root, postId })).toMatchObject({ live: { sessionId } })
  })
})
