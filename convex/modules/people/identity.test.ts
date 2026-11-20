// @vitest-environment edge-runtime
/** PA4 : comptes et sessions du vrai composant, preuves serveur, collisions et statuts. */
import { afterEach, describe, expect, it, vi } from "vitest"

import { api, components, internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { createTestSession, testConvex } from "../../test.setup"
import { verifiedEmailHashOf } from "./identity"

type T = ReturnType<typeof testConvex>
type UserOptions = { email?: string; emailVerified?: boolean; phoneNumber?: string; phoneNumberVerified?: boolean }
const EMAIL_HASH = "462ca6eb415951837196183616b1ec6e1ea779a1cf66967aaaa4666460dfc36c"

function idOf(value: unknown): string {
  if (typeof value === "object" && value !== null && "_id" in value && typeof value._id === "string") return value._id
  throw new Error("Document Better Auth de fixture absent")
}

async function personFixture(t: T, options: UserOptions = {}) {
  const now = Date.now()
  const userId = idOf(await t.mutation(components.betterAuth.adapter.create, {
    input: { model: "user", data: { name: "Nom civil de fixture", email: options.email ?? "awa@example.com", emailVerified: options.emailVerified ?? true, phoneNumber: options.phoneNumber, phoneNumberVerified: options.phoneNumberVerified, createdAt: now, updatedAt: now } },
  }))
  const sessionId = await createTestSession(t, userId)
  const as = t.withIdentity({ subject: userId, sessionId, issuer: "fixture-engine", applicationOrigin: "antsia" })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  return { userId, sessionId, as, personId }
}

async function account(t: T, userId: string, subject = "idn-awa") {
  const now = Date.now()
  await t.mutation(components.betterAuth.adapter.create, { input: { model: "account", data: { userId, providerId: "idn", accountId: subject, createdAt: now, updatedAt: now } } })
}

async function linksOf(t: T, personId: Id<"persons">) {
  return await t.run(async (ctx) => await ctx.db.query("identityLinks").withIndex("by_person_and_provider", (q) => q.eq("personId", personId)).take(10))
}

async function seed(t: T) {
  return await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
}

async function member(t: T, personId: Id<"persons">, networkId: Id<"networks">, status: Doc<"networkMemberships">["status"] = "declaree", extra: Partial<Pick<Doc<"networkMemberships">, "verifiedBy" | "role" | "derivedFrom" | "statusBeforeSuspension">> = {}) {
  return await t.run(async (ctx) => await ctx.db.insert("networkMemberships", { personId, networkId, status, role: "member", joinedAt: Date.now(), statusChangedAt: Date.now(), ...extra }))
}

afterEach(() => vi.useRealTimers())

describe("preuve IDN et personne unique", () => {
  it("une preuve seule ne crée ni personne, ni adhésion, ni nom", async () => {
    const t = testConvex({ automaticSessions: false })
    await t.mutation(internal.modules.people.identity.recordIdnProof, { subject: "idn-awa", loa: 2, nationality: "GA", profileType: "citizen" })
    expect(await t.run(async (ctx) => ({ persons: await ctx.db.query("persons").take(5), memberships: await ctx.db.query("networkMemberships").take(5) }))).toEqual({ persons: [], memberships: [] })
  })

  it("upsert de preuve unique et horodatage serveur, sans état civil", async () => {
    const t = testConvex({ automaticSessions: false })
    await t.mutation(internal.modules.people.identity.recordIdnProof, { subject: "idn-awa", loa: 3, nationality: "GA", profileType: "citizen" })
    await t.mutation(internal.modules.people.identity.recordIdnProof, { subject: "idn-awa", loa: 1 })
    const proofs = await t.run(async (ctx) => await ctx.db.query("idnProofs").take(5))
    expect(proofs).toHaveLength(1)
    expect(proofs[0]).toMatchObject({ subject: "idn-awa", loa: 1, observedAt: expect.any(Number) })
    expect(proofs[0]?.nationality).toBeUndefined()
    expect(proofs[0]?.profileType).toBeUndefined()
    expect(Object.keys(proofs[0] ?? {}).sort()).toEqual(["_creationTime", "_id", "loa", "observedAt", "subject"])
  })

  it("la première session garde le profil vide et aucune adhésion malgré la preuve IDN", async () => {
    const t = testConvex({ automaticSessions: false })
    const fixture = await personFixture(t)
    await account(t, fixture.userId)
    await t.mutation(internal.modules.people.identity.recordIdnProof, { subject: "idn-awa", loa: 2, nationality: "GA" })
    expect(await fixture.as.mutation(api.modules.people.persons.ensureMyPerson, {})).toBe(fixture.personId)
    expect(await fixture.as.query(api.modules.people.persons.getMyPerson, {})).toMatchObject({ _id: fixture.personId, published: false, badges: ["verified"] })
    const person = await t.run(async (ctx) => await ctx.db.get(fixture.personId))
    expect(person?.displayName).toBeUndefined()
    expect(person?.handle).toBeUndefined()
    expect(await fixture.as.query(api.modules.people.memberships.myMemberships, {})).toEqual([])
  })

  it("deux sessions et deux applications du même émetteur rendent la même personne", async () => {
    const t = testConvex({ automaticSessions: false })
    const first = await personFixture(t)
    await account(t, first.userId)
    await t.mutation(internal.modules.people.identity.recordIdnProof, { subject: "idn-awa", loa: 2 })
    await first.as.mutation(api.modules.people.identity.linkIdn, {})
    const secondSession = await createTestSession(t, first.userId)
    const second = t.withIdentity({ subject: first.userId, sessionId: secondSession, issuer: "fixture-engine", applicationOrigin: "diaspora-ga" })
    expect(await second.mutation(api.modules.people.persons.ensureMyPerson, {})).toBe(first.personId)
    expect(await first.as.mutation(api.modules.people.persons.ensureMyPerson, {})).toBe(first.personId)
    expect(await t.run(async (ctx) => await ctx.db.query("persons").take(5))).toHaveLength(1)
    expect((await linksOf(t, first.personId)).filter((link) => link.provider === "idn")).toHaveLength(1)
  })

  it("le lien IDN est idempotent, et une mise à jour ne remplace pas le nom choisi", async () => {
    const t = testConvex({ automaticSessions: false })
    const fixture = await personFixture(t)
    await t.run(async (ctx) => await ctx.db.patch(fixture.personId, { displayName: "Awa choisie", handle: "awa.choisie" }))
    await account(t, fixture.userId)
    await t.mutation(internal.modules.people.identity.recordIdnProof, { subject: "idn-awa", loa: 2 })
    await fixture.as.mutation(api.modules.people.identity.linkIdn, {})
    const before = await linksOf(t, fixture.personId)
    await fixture.as.mutation(api.modules.people.identity.linkIdn, {})
    expect(await linksOf(t, fixture.personId)).toEqual(before)
    expect(await t.run(async (ctx) => await ctx.db.get(fixture.personId))).toMatchObject({ displayName: "Awa choisie", handle: "awa.choisie" })
  })

  it("un lien révoqué du même titulaire est réactivé dans la même ligne", async () => {
    const t = testConvex({ automaticSessions: false })
    const fixture = await personFixture(t)
    await account(t, fixture.userId)
    await t.mutation(internal.modules.people.identity.recordIdnProof, { subject: "idn-awa", loa: 2 })
    await fixture.as.mutation(api.modules.people.identity.linkIdn, {})
    const link = (await linksOf(t, fixture.personId)).find((row) => row.provider === "idn")
    if (!link) throw new Error("Lien IDN de fixture absent")
    await t.run(async (ctx) => await ctx.db.patch(link._id, { revokedAt: Date.now() }))
    await fixture.as.mutation(api.modules.people.identity.linkIdn, {})
    const restored = (await linksOf(t, fixture.personId)).filter((row) => row.provider === "idn")
    expect(restored).toHaveLength(1)
    expect(restored[0]?._id).toBe(link._id)
    expect(restored[0]?.revokedAt).toBeUndefined()
  })

  it("LoA1 reste Communauté, même avec un claim JWT LoA3 forgé", async () => {
    const t = testConvex({ automaticSessions: false })
    const fixture = await personFixture(t)
    await account(t, fixture.userId)
    await t.mutation(internal.modules.people.identity.recordIdnProof, { subject: "idn-awa", loa: 1 })
    const as = t.withIdentity({ subject: fixture.userId, sessionId: fixture.sessionId, loa: 3, nationality: "GA" })
    await as.mutation(api.modules.people.identity.linkIdn, {})
    expect((await as.query(api.modules.people.persons.getMyPerson, {}))?.badges).toEqual(["community"])
    expect((await linksOf(t, fixture.personId)).find((link) => link.provider === "idn")?.loa).toBe(1)
  })

  it("sans compte IDN ou sans preuve serveur, le lien public est refusé indistinctement", async () => {
    const t = testConvex({ automaticSessions: false })
    const fixture = await personFixture(t)
    await expect(fixture.as.mutation(api.modules.people.identity.linkIdn, {})).rejects.toMatchObject({ data: { code: "notFound" } })
    await account(t, fixture.userId)
    await expect(fixture.as.mutation(api.modules.people.identity.linkIdn, {})).rejects.toMatchObject({ data: { code: "notFound" } })
    expect((await linksOf(t, fixture.personId)).some((link) => link.provider === "idn")).toBe(false)
  })

  it("une preuve d'un autre compte n'élève pas la session courante", async () => {
    const t = testConvex({ automaticSessions: false })
    const fixture = await personFixture(t)
    await account(t, fixture.userId, "idn-current")
    await t.mutation(internal.modules.people.identity.recordIdnProof, { subject: "idn-other", loa: 3 })
    await expect(fixture.as.mutation(api.modules.people.identity.linkIdn, {})).rejects.toMatchObject({ data: { code: "notFound" } })
    expect((await fixture.as.query(api.modules.people.persons.getMyPerson, {}))?.badges).toEqual(["community"])
  })

  it("aucun sub/LoA/contact fourni par le client n'entre dans l'API", async () => {
    const t = testConvex({ automaticSessions: false })
    const fixture = await personFixture(t)
    await expect(fixture.as.mutation(api.modules.people.identity.linkIdn, { subject: "idn-forged", loa: 3 } as never)).rejects.toThrow()
    await expect(fixture.as.mutation(api.modules.people.identity.linkLocal, { email: "foreign@example.com" } as never)).rejects.toThrow()
    expect((await linksOf(t, fixture.personId)).some((link) => link.subject === "idn-forged")).toBe(false)
  })

  it("un sujet déjà rattaché à une autre personne, même révoqué, n'est jamais fusionné", async () => {
    const t = testConvex({ automaticSessions: false })
    const owner = await personFixture(t, { email: "owner@example.com" })
    await t.run(async (ctx) => await ctx.db.insert("identityLinks", { personId: owner.personId, provider: "idn", subject: "idn-awa", loa: 2, linkedAt: Date.now(), revokedAt: Date.now() }))
    const claimant = await personFixture(t)
    await account(t, claimant.userId)
    await t.mutation(internal.modules.people.identity.recordIdnProof, { subject: "idn-awa", loa: 2 })
    await expect(claimant.as.mutation(api.modules.people.identity.linkIdn, {})).rejects.toMatchObject({ data: { code: "notFound" } })
    expect(await t.run(async (ctx) => await ctx.db.query("persons").take(5))).toHaveLength(2)
    expect((await linksOf(t, owner.personId)).find((link) => link.provider === "idn")?.personId).toBe(owner.personId)
    expect((await linksOf(t, claimant.personId)).some((link) => link.provider === "idn")).toBe(false)
  })

  it("la disparition de preuve retire l'ancien badge fort à la synchronisation", async () => {
    const t = testConvex({ automaticSessions: false })
    const fixture = await personFixture(t)
    await account(t, fixture.userId)
    await t.mutation(internal.modules.people.identity.recordIdnProof, { subject: "idn-awa", loa: 2 })
    await fixture.as.mutation(api.modules.people.identity.linkIdn, {})
    await t.run(async (ctx) => {
      const proof = await ctx.db.query("idnProofs").withIndex("by_subject", (q) => q.eq("subject", "idn-awa")).unique()
      if (proof) await ctx.db.delete(proof._id)
    })
    await fixture.as.mutation(api.modules.people.persons.ensureMyPerson, {})
    expect((await fixture.as.query(api.modules.people.persons.getMyPerson, {}))?.badges).toEqual(["community"])
    expect((await linksOf(t, fixture.personId)).find((link) => link.provider === "idn")?.revokedAt).toEqual(expect.any(Number))
  })

  it("sans utilisateur prouvé l'autosync laisse un profil vide, et les liens publics refusent", async () => {
    const t = testConvex({ automaticSessions: false })
    const sessionId = await createTestSession(t, "unknown-user")
    const as = t.withIdentity({ subject: "unknown-user", sessionId })
    const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
    expect(await linksOf(t, personId)).toEqual([])
    expect((await as.query(api.modules.people.persons.getMyPerson, {}))?.badges).toEqual(["community"])
    expect(await t.run(async (ctx) => await verifiedEmailHashOf(ctx, personId))).toBeNull()
    await expect(as.mutation(api.modules.people.identity.linkLocal, {})).rejects.toMatchObject({ data: { code: "unauthenticated" } })
  })

  it("une session expirée ou appartenant à un autre utilisateur n'écrit aucun lien", async () => {
    const t = testConvex({ automaticSessions: false })
    const fixture = await personFixture(t)
    const expired = await createTestSession(t, fixture.userId, Date.now() - 1)
    const expiredAs = t.withIdentity({ subject: fixture.userId, sessionId: expired })
    const foreignSession = await createTestSession(t, "another-user")
    const foreignAs = t.withIdentity({ subject: fixture.userId, sessionId: foreignSession })
    const before = await linksOf(t, fixture.personId)
    await expect(expiredAs.mutation(api.modules.people.identity.linkLocal, {})).rejects.toMatchObject({ data: { code: "unauthenticated" } })
    await expect(foreignAs.mutation(api.modules.people.identity.linkIdn, {})).rejects.toMatchObject({ data: { code: "unauthenticated" } })
    expect(await linksOf(t, fixture.personId)).toEqual(before)
  })
})

describe("compte léger et empreinte vérifiée", () => {
  it("normalise l'adresse vérifiée, conserve seulement son SHA256 et donne un sujet consulaire identique", async () => {
    const t = testConvex({ automaticSessions: false })
    const fixture = await personFixture(t, { email: " Awa@Example.COM " })
    const links = await linksOf(t, fixture.personId)
    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({ provider: "local", channel: "email", subject: EMAIL_HASH })
    expect(JSON.stringify(links)).not.toContain("Example")
    expect(await t.run(async (ctx) => await verifiedEmailHashOf(ctx, fixture.personId))).toBe(EMAIL_HASH)
    await fixture.as.mutation(api.modules.people.identity.linkLocal, {})
    expect(await linksOf(t, fixture.personId)).toEqual(links)
  })

  it("un email non vérifié n'offre ni lien local ni empreinte consulaire", async () => {
    const t = testConvex({ automaticSessions: false })
    const fixture = await personFixture(t, { emailVerified: false })
    expect(await linksOf(t, fixture.personId)).toEqual([])
    expect(await t.run(async (ctx) => await verifiedEmailHashOf(ctx, fixture.personId))).toBeNull()
    await expect(fixture.as.mutation(api.modules.people.identity.linkLocal, {})).rejects.toMatchObject({ data: { code: "notFound" } })
  })

  it("SMS vérifié en E164 produit une empreinte téléphone, sans faux email consulaire", async () => {
    const t = testConvex({ automaticSessions: false })
    const fixture = await personFixture(t, { emailVerified: false, phoneNumber: "+241066123456", phoneNumberVerified: true })
    expect(await linksOf(t, fixture.personId)).toMatchObject([{ provider: "local", channel: "phone", subject: "11d7ac9a39af87f6313637c21a352e50053ab806761cfbb3eef27b0e1dd7bf1c" }])
    expect(await t.run(async (ctx) => await verifiedEmailHashOf(ctx, fixture.personId))).toBeNull()
  })

  it("l'email vérifié prime sur le téléphone : un seul lien local", async () => {
    const t = testConvex({ automaticSessions: false })
    const fixture = await personFixture(t, { phoneNumber: "+241066123456", phoneNumberVerified: true })
    expect(await linksOf(t, fixture.personId)).toMatchObject([{ provider: "local", channel: "email", subject: EMAIL_HASH }])
  })

  it("un téléphone non vérifié ou hors E164 ne donne aucun lien", async () => {
    for (const options of [{ phoneNumber: "+241066123456", phoneNumberVerified: false }, { phoneNumber: "066 12 34 56", phoneNumberVerified: true }]) {
      const t = testConvex({ automaticSessions: false })
      const fixture = await personFixture(t, { emailVerified: false, ...options })
      expect(await linksOf(t, fixture.personId)).toEqual([])
    }
  })

  it("la perte de vérification révoque le lien et ne rend plus l'empreinte", async () => {
    const t = testConvex({ automaticSessions: false })
    const fixture = await personFixture(t)
    await t.mutation(components.betterAuth.adapter.updateOne, { input: { model: "user", where: [{ field: "_id", value: fixture.userId }], update: { emailVerified: false } } })
    await fixture.as.mutation(api.modules.people.persons.ensureMyPerson, {})
    expect((await linksOf(t, fixture.personId))[0]?.revokedAt).toEqual(expect.any(Number))
    expect(await t.run(async (ctx) => await verifiedEmailHashOf(ctx, fixture.personId))).toBeNull()
  })

  it("une adresse réattribuée ne fusionne pas deux personnes via son ancienne empreinte", async () => {
    const t = testConvex({ automaticSessions: false })
    const owner = await personFixture(t)
    await t.mutation(components.betterAuth.adapter.updateOne, { input: { model: "user", where: [{ field: "_id", value: owner.userId }], update: { email: "former-owner@example.com" } } })
    await expect(personFixture(t)).rejects.toMatchObject({ data: { code: "notFound" } })
    expect(await t.run(async (ctx) => await ctx.db.query("persons").take(5))).toHaveLength(1)
    expect((await linksOf(t, owner.personId))[0]?.subject).toBe(EMAIL_HASH)
  })
})

describe("élévation IDN et baisse de garantie sans nouvelle adhésion", () => {
  it("élève racine ouverte et enfant générique, conserve rôles et origine, ne recrée pas les départs/sanctions", async () => {
    const t = testConvex({ automaticSessions: false })
    const { root, testClosed } = await seed(t)
    const fixture = await personFixture(t)
    const rootId = await member(t, fixture.personId, root, "declaree", { role: "network_admin", derivedFrom: testClosed })
    const childId = await member(t, fixture.personId, testClosed, "en_attente")
    await account(t, fixture.userId)
    await t.mutation(internal.modules.people.identity.recordIdnProof, { subject: "idn-awa", loa: 2 })
    await fixture.as.mutation(api.modules.people.identity.linkIdn, {})
    expect(await t.run(async (ctx) => await ctx.db.get(rootId))).toMatchObject({ status: "verifiee", role: "network_admin", derivedFrom: testClosed, verifiedBy: "idn" })
    expect(await t.run(async (ctx) => await ctx.db.get(childId))).toMatchObject({ status: "declaree" })
    expect(await t.run(async (ctx) => await ctx.db.query("networkMemberships").take(5))).toHaveLength(2)
  })

  it("LoA en baisse dégrade uniquement les vérifications IDN actives et conserve le rôle", async () => {
    const t = testConvex({ automaticSessions: false })
    const { root, testClosed } = await seed(t)
    const fixture = await personFixture(t)
    const rootId = await member(t, fixture.personId, root, "verifiee", { verifiedBy: "idn", role: "network_admin" })
    const childId = await member(t, fixture.personId, testClosed, "verifiee", { verifiedBy: "idn" })
    await account(t, fixture.userId)
    await t.mutation(internal.modules.people.identity.recordIdnProof, { subject: "idn-awa", loa: 2 })
    await fixture.as.mutation(api.modules.people.identity.linkIdn, {})
    await t.mutation(internal.modules.people.identity.recordIdnProof, { subject: "idn-awa", loa: 1 })
    await fixture.as.mutation(api.modules.people.persons.ensureMyPerson, {})
    expect(await t.run(async (ctx) => await ctx.db.get(rootId))).toMatchObject({ status: "declaree", role: "network_admin" })
    expect(await t.run(async (ctx) => await ctx.db.get(childId))).toMatchObject({ status: "en_attente" })
    expect((await fixture.as.query(api.modules.people.persons.getMyPerson, {}))?.badges).toEqual(["community"])
  })

  it("la vérification opérateur ou consulaire n'est pas dégradée par l'absence d'IDN forte", async () => {
    for (const source of ["operator", "consulat"] as const) {
      const t = testConvex({ automaticSessions: false })
      const { root } = await seed(t)
      const fixture = await personFixture(t)
      const rootId = await member(t, fixture.personId, root, "verifiee", { verifiedBy: source })
      await account(t, fixture.userId)
      await t.mutation(internal.modules.people.identity.recordIdnProof, { subject: "idn-awa", loa: 1 })
      await fixture.as.mutation(api.modules.people.identity.linkIdn, {})
      expect(await t.run(async (ctx) => await ctx.db.get(rootId))).toMatchObject({ status: "verifiee", verifiedBy: source })
    }
  })

  it("une attestation encore vivante préserve la racine même si son ancienne source était IDN", async () => {
    const t = testConvex({ automaticSessions: false })
    const { root } = await seed(t)
    const fixture = await personFixture(t)
    const rootId = await member(t, fixture.personId, root, "verifiee", { verifiedBy: "idn" })
    await t.run(async (ctx) => await ctx.db.insert("identityLinks", { personId: fixture.personId, provider: "consular_attestation", subject: "consular-proof", linkedAt: Date.now() }))
    await account(t, fixture.userId)
    await t.mutation(internal.modules.people.identity.recordIdnProof, { subject: "idn-awa", loa: 1 })
    await fixture.as.mutation(api.modules.people.identity.linkIdn, {})
    expect(await t.run(async (ctx) => await ctx.db.get(rootId))).toMatchObject({ status: "verifiee" })
  })

  it("une racine partie ou suspendue n'est pas réactivée et son enfant n'est pas élevé", async () => {
    for (const status of ["partie", "suspendue"] as const) {
      const t = testConvex({ automaticSessions: false })
      const { root, testClosed } = await seed(t)
      const fixture = await personFixture(t)
      const rootId = await member(t, fixture.personId, root, status, { statusBeforeSuspension: "declaree" })
      const childId = await member(t, fixture.personId, testClosed, "en_attente")
      await account(t, fixture.userId)
      await t.mutation(internal.modules.people.identity.recordIdnProof, { subject: "idn-awa", loa: 2 })
      await fixture.as.mutation(api.modules.people.identity.linkIdn, {})
      expect(await t.run(async (ctx) => await ctx.db.get(rootId))).toMatchObject({ status, statusBeforeSuspension: "declaree" })
      expect(await t.run(async (ctx) => await ctx.db.get(childId))).toMatchObject({ status: "en_attente" })
    }
  })

  it("la tranche gérée garde ses règles propres de nationalité et d'admission", async () => {
    const t = testConvex({ automaticSessions: false })
    const { root, testClosed } = await seed(t)
    await t.run(async (ctx) => await ctx.db.patch(testClosed, { managedBy: "diaspora" }))
    const fixture = await personFixture(t)
    await member(t, fixture.personId, root)
    const childId = await member(t, fixture.personId, testClosed, "en_attente")
    await account(t, fixture.userId)
    await t.mutation(internal.modules.people.identity.recordIdnProof, { subject: "idn-awa", loa: 2, nationality: "FR" })
    await fixture.as.mutation(api.modules.people.identity.linkIdn, {})
    expect(await t.run(async (ctx) => await ctx.db.get(childId))).toMatchObject({ status: "en_attente" })
  })

  it("plus de 100 adhésions sont traitées par passages chaînés sans limiter la suite aux 50 premières", async () => {
    vi.useFakeTimers()
    const t = testConvex({ automaticSessions: false })
    const { root } = await seed(t)
    const fixture = await personFixture(t)
    await member(t, fixture.personId, root)
    await t.run(async (ctx) => {
      for (let index = 0; index < 102; index += 1) {
        const networkId = await ctx.db.insert("networks", { slug: `identity-network-${index}`, name: "Réseau de fixture", kind: "closed", membershipPolicy: "declared_or_verified", defaultVisibility: "network", reachValues: [], theme: "vert-souverain", parentId: root, status: "active", createdAt: Date.now(), updatedAt: Date.now() })
        await ctx.db.insert("networkMemberships", { networkId, personId: fixture.personId, status: "en_attente", role: "member", joinedAt: Date.now(), statusChangedAt: Date.now() })
      }
    })
    await account(t, fixture.userId)
    await t.mutation(internal.modules.people.identity.recordIdnProof, { subject: "idn-awa", loa: 2 })
    await fixture.as.mutation(api.modules.people.identity.linkIdn, {})
    await t.finishAllScheduledFunctions(() => vi.runAllTimers())
    const memberships = await t.run(async (ctx) => await ctx.db.query("networkMemberships").withIndex("by_person_and_status", (q) => q.eq("personId", fixture.personId)).take(110))
    expect(memberships).toHaveLength(103)
    expect(memberships.filter((row) => row.networkId !== root).every((row) => row.status === "declaree")).toBe(true)
  })
})
