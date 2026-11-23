// @vitest-environment edge-runtime
/**
 * Revue CH-815, constat F3 — la console du moteur est LIÉE à son application.
 *
 * Avant ce durcissement, la console n'était bornée que par exclusion : toute preuve de session IDN
 * vivante l'ouvrait, sauf une preuve scellée pour une application qui administre un réseau. Une
 * session IDN ouverte par un opérateur sur une application des membres (diaspora.ga, antsia.ga)
 * ouvrait donc aussi la console : un script de ces sites pouvait agir en opérateur.
 *
 * Désormais, seule une preuve scellée pour l'application que le catalogue déclare console
 * (`operator_console`, `betterAuth/settings.isOperatorConsoleApplication`) vaut session de console.
 * Recette d'acceptation, écrite avant le code : une session IDN scellée pour l'application des
 * membres, pour le site public, pour l'administration d'un réseau ou sans application (preuve d'avant
 * ADR-0042) reçoit le refus de la console (`operatorRequired`), même si son accès avait été
 * journalisé avant ce durcissement ; la session de console journalisée de la MÊME personne passe.
 * Les portes de personne qui reconnaissent aussi l'opérateur (fichiers retenus) et la seconde
 * décision d'archivage, qui relit la preuve du demandeur, suivent la même règle.
 */
import { engineErrorCode } from "@antsia/social-contracts/errors"
import { afterEach, describe, expect, it, vi } from "vitest"

import { api, components, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { createTestSession, OPERATOR_CONSOLE_APPLICATION, testConvex } from "../../test.setup"

type T = ReturnType<typeof testConvex>
type As = ReturnType<T["withIdentity"]>
type Operator = { authUserId: string; idnSubject: string; personId: Id<"persons"> }
type Session = { sessionId: string; as: As }

const SETTINGS = { name: "Réseau de recette F3", membershipPolicy: "open" as const, defaultVisibility: "network" as const, reachValues: [], theme: "antsia" }
const REASON = "Décision prise après examen de la situation."
/** Les applications du catalogue qui ne sont PAS la console, et la preuve d'avant ADR-0042 (`null`). */
const NOT_THE_CONSOLE = [["l'application des membres de DIASPORA.GA", "diaspora_ga"], ["le site public antsia.ga", "antsia_ga"], ["l'administration de DIASPORA.GA", "admin_diaspora_ga"], ["une preuve sans application (d'avant ADR-0042)", null]] as const

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

function idOf(row: unknown): string {
  if (!row || typeof row !== "object" || !("_id" in row) || typeof row._id !== "string") throw new Error("Document de fixture absent")
  return row._id
}

async function code(promise: Promise<unknown>): Promise<string | null> {
  try { await promise; return null } catch (error) { return engineErrorCode(error) }
}

/** Un administrateur de plateforme habilité, compte IDN de garantie 2 ; aucune session IDN encore scellée. */
async function platformAdmin(t: T, tag: string): Promise<Operator> {
  const now = Date.now()
  const authUserId = idOf(await t.mutation(components.betterAuth.adapter.create, { input: { model: "user", data: { name: "Nom civil non recopié", email: `${tag}@example.test`, emailVerified: true, createdAt: now, updatedAt: now } } }))
  const idnSubject = `idn-f3-${tag}`
  await t.mutation(components.betterAuth.adapter.create, { input: { model: "account", data: { userId: authUserId, providerId: "idn", accountId: idnSubject, createdAt: now, updatedAt: now } } })
  await t.mutation(internal.modules.people.identity.recordIdnProof, { subject: idnSubject, loa: 2 })
  const first = t.withIdentity({ subject: authUserId, sessionId: await createTestSession(t, authUserId) })
  const personId = await first.mutation(api.modules.people.persons.ensureMyPerson, {})
  await t.run(async (ctx) => { await ctx.db.insert("operators", { personId, role: "platform_admin", grantedAt: now }) })
  return { authUserId, idnSubject, personId }
}

/** Le retour IDN scelle une NOUVELLE session de l'opérateur, pour `application` (`null` : aucune). */
async function idnSession(t: T, who: Operator, application: string | null): Promise<Session> {
  const sessionId = await createTestSession(t, who.authUserId)
  await t.mutation(internal.modules.people.identity.recordIdnProof, { subject: who.idnSubject, loa: 2 })
  await t.mutation(internal.modules.platform.operatorAccess.recordIdnSession, { sessionId, authUserId: who.authUserId, idnSubject: who.idnSubject, loa: 2, ...(application ? { application } : {}) })
  return { sessionId, as: t.withIdentity({ subject: who.authUserId, sessionId }) }
}

/** La session de console de l'opérateur, accès journalisé. */
async function consoleSession(t: T, who: Operator): Promise<Session> {
  const session = await idnSession(t, who, OPERATOR_CONSOLE_APPLICATION)
  await session.as.mutation(api.modules.platform.operatorAccess.recordAccess, {})
  return session
}

/**
 * Ce qu'A1 et A1b permettaient : l'accès à la console journalisé sur la preuve d'une session d'une
 * autre application (`recordAccess` l'acceptait). Posé directement : la recette prouve que ce journal
 * ancien n'ouvre plus rien.
 */
async function logConsoleAccessOn(t: T, sessionId: string): Promise<void> {
  await t.run(async (ctx) => {
    const proof = await ctx.db.query("operatorSessionProofs").withIndex("by_session", (q) => q.eq("sessionId", sessionId)).unique()
    if (!proof) throw new Error("Preuve de fixture absente")
    await ctx.db.patch(proof._id, { accessLoggedAt: Date.now() })
  })
}

async function consoleAccessLines(t: T): Promise<number> {
  return (await t.run(async (ctx) => ctx.db.query("engineAudit").take(50))).filter((row) => row.action === "console.access").length
}

async function seeded(): Promise<{ t: T; root: Id<"networks"> }> {
  const t = testConvex({ automaticSessions: false })
  const { root } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  return { t, root }
}

describe("revue CH-815 F3 — seule une session scellée pour la console ouvre la console", () => {
  it.each(NOT_THE_CONSOLE)("une session IDN scellée pour %s est refusée par les portes de la console", async (_label, application) => {
    const { t } = await seeded()
    const operator = await platformAdmin(t, `refus-${application ?? "aucune"}`)
    const session = await idnSession(t, operator, application)
    // Les deux portes d'entrée : qui suis-je, et le journal d'accès.
    expect(await code(session.as.query(api.modules.platform.operatorAccess.myOperator, {}))).toBe("operatorRequired")
    expect(await code(session.as.mutation(api.modules.platform.operatorAccess.recordAccess, {}))).toBe("operatorRequired")
    expect(await consoleAccessLines(t)).toBe(0)
    // Même journalisé avant ce durcissement, l'accès reste fermé : lecture (`operatorQuery`) et décision (`operatorMutation`).
    await logConsoleAccessOn(t, session.sessionId)
    expect(await code(session.as.query(api.modules.platform.operatorAccess.myOperator, {}))).toBe("operatorRequired")
    expect(await code(session.as.query(api.modules.networks.networks.listForConsole, {}))).toBe("operatorRequired")
    expect(await code(session.as.mutation(api.modules.networks.networks.create, { slug: "f3-usurpation", kind: "closed", ...SETTINGS, reason: REASON }))).toBe("operatorRequired")
    expect(await t.query(api.modules.networks.networks.getBySlug, { slug: "f3-usurpation" })).toBeNull()
  })

  it("la session de console journalisée de la MÊME personne ouvre la console, à côté d'une session des membres refusée", async () => {
    const { t } = await seeded()
    const operator = await platformAdmin(t, "deux-sessions")
    const members = await idnSession(t, operator, "diaspora_ga")
    const onConsole = await idnSession(t, operator, OPERATOR_CONSOLE_APPLICATION)
    // Avant le journal, la console ne livre que l'entrée : la preuve est reconnue, l'accès pas encore journalisé.
    expect((await onConsole.as.query(api.modules.platform.operatorAccess.myOperator, {})).role).toBe("platform_admin")
    expect(await code(onConsole.as.query(api.modules.networks.networks.listForConsole, {}))).toBe("operatorRequired")
    await onConsole.as.mutation(api.modules.platform.operatorAccess.recordAccess, {})
    expect(await consoleAccessLines(t)).toBe(1)
    const networkId = await onConsole.as.mutation(api.modules.networks.networks.create, { slug: "f3-console", kind: "closed", ...SETTINGS, reason: REASON })
    expect((await onConsole.as.query(api.modules.networks.networks.listForConsole, {})).some((row) => row._id === networkId)).toBe(true)
    // La session des membres, elle, reste refusée, et le journal de la console ne lui vaut rien.
    expect(await code(members.as.query(api.modules.networks.networks.listForConsole, {}))).toBe("operatorRequired")
    expect(await code(members.as.mutation(api.modules.platform.operatorAccess.recordAccess, {}))).toBe("operatorRequired")
    expect(await consoleAccessLines(t)).toBe(1)
  })
})

describe("revue CH-815 F3 — les portes qui reconnaissent aussi l'opérateur suivent la même règle", () => {
  /** Un fichier de profil retenu (sans réseau) : seul un opérateur, en session de console, le libère ou lit son rapport. */
  async function heldProfileFile(t: T): Promise<Id<"fileScans">> {
    return await t.run(async (ctx) => {
      const now = Date.now()
      const uploader = await ctx.db.insert("persons", { authUserId: "f3-deposant", createdAt: now, updatedAt: now })
      const storageId = await ctx.storage.store(new Blob(["contenu de recette"], { type: "application/pdf" }))
      return await ctx.db.insert("fileScans", { storageId, status: "suspicious", source: "profile", uploadedByPersonId: uploader, findings: [], attempts: 1, createdAt: now, updatedAt: now })
    })
  }

  it("un fichier retenu ne se lit ni ne se libère depuis une session des membres, même journalisée ; la session de console le fait", async () => {
    const { t } = await seeded()
    const operator = await platformAdmin(t, "fichiers")
    const scanId = await heldProfileFile(t)
    const members = await idnSession(t, operator, "diaspora_ga")
    await logConsoleAccessOn(t, members.sessionId)
    expect(await code(members.as.query(api.modules.files.queries.getScan, { scanId }))).toBe("notFound")
    expect(await code(members.as.mutation(api.modules.files.mutations.releaseScan, { scanId, reason: "Faux positif vérifié" }))).toBe("notFound")
    expect((await t.run(async (ctx) => ctx.db.get(scanId)))?.status).toBe("suspicious")
    const onConsole = await consoleSession(t, operator)
    expect((await onConsole.as.query(api.modules.files.queries.getScan, { scanId }))._id).toBe(scanId)
    expect(await onConsole.as.mutation(api.modules.files.mutations.releaseScan, { scanId, reason: "Faux positif vérifié" })).toEqual({ status: "clean" })
    const release = (await t.run(async (ctx) => ctx.db.query("engineAudit").take(50))).find((row) => row.action === "file.release")
    expect(release).toMatchObject({ capacity: "platform_admin", actorPersonId: operator.personId })
  })

  it("la seconde décision d'archivage relit la preuve du demandeur : une preuve qui n'est plus celle de la console ne vaut plus", async () => {
    const { t } = await seeded()
    const first = await platformAdmin(t, "demandeur"), second = await platformAdmin(t, "approbateur")
    const requester = await consoleSession(t, first), approver = await consoleSession(t, second)
    const networkId = await requester.as.mutation(api.modules.networks.networks.create, { slug: "f3-archivage", kind: "closed", ...SETTINGS, reason: REASON })
    const request = await requester.as.mutation(api.modules.networks.networks.requestArchive, { networkId, reason: REASON })
    await t.run(async (ctx) => {
      const proof = await ctx.db.query("operatorSessionProofs").withIndex("by_session", (q) => q.eq("sessionId", requester.sessionId)).unique()
      if (proof) await ctx.db.patch(proof._id, { application: "diaspora_ga" })
    })
    expect(await code(approver.as.mutation(api.modules.networks.networks.archive, { networkId, reason: REASON, ...request }))).toBe("policyRefused")
    expect((await t.run(async (ctx) => ctx.db.get(networkId)))?.status).toBe("active")
  })
})
