/**
 * Outillage des tests du module `live` — partagé par ses fichiers de test, et
 * par ceux des lots qui suivent la fondation (sessions, audience, scène, vie
 * de la salle, médias).
 *
 * Fichier à deux points dans son nom : ignoré par le bundler de Convex et par
 * le glob du harnais (comme `convex/test.setup.ts`) — il n'est jamais déployé.
 *
 * Les réseaux, personnes, relations, blocages et fils de groupe viennent de
 * l'outillage des appels (`calls/fixtures.setup.ts`) : une seule façon
 * d'amorcer le moteur. Ce fichier ajoute ce que le direct demande, POSÉ EN
 * BASE (sans passer par les mutations des lots suivants) : une session et la
 * ligne d'antenne de son hôte, une page et son cercle, un invité, une
 * exclusion, un intervenant, une admission de spectateur.
 */
import type { DirectAudience } from "@antsia/social-domain/live/domain"

import type { Doc, Id } from "../../_generated/dataModel"
import type { Person, T } from "../calls/fixtures.setup"

export { block, caught, codeOf, connect, enter, groupThread, joinAlso, ruleOf, seed, T0, tick, type Person, type T } from "../calls/fixtures.setup"

export type SessionInput = {
  networkId: Id<"networks">
  host: Person
  audience?: DirectAudience
  status?: Doc<"liveSessions">["status"]
  pageId?: Id<"pages">
  sourceThreadId?: Id<"groupThreads">
  maxViewers?: number
  chatMode?: Doc<"liveSessions">["chatMode"]
  title?: string
  /**
   * Session ENREGISTRÉE (`replayRequested`) — faux par défaut, comme
   * `sessions.create` depuis DL-02. Vrai : l'accord de l'hôte est posé avec la
   * session, comme à la création.
   */
  replay?: boolean
}

/**
 * Une session posée en base — `live` par défaut, audience `public`, 200 places,
 * non enregistrée — et la ligne d'antenne de son hôte, comme à la création
 * (l'hôte est un intervenant dès la naissance).
 */
export async function insertSession(t: T, input: SessionInput): Promise<Id<"liveSessions">> {
  return await t.run(async (ctx) => {
    const now = Date.now()
    const status = input.status ?? "live"
    const sessionId = await ctx.db.insert("liveSessions", {
      networkId: input.networkId,
      hostPersonId: input.host.personId,
      title: input.title ?? "Conférence de test",
      roomName: `direct-test-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      status,
      audience: input.audience ?? "public",
      ...(input.pageId !== undefined ? { pageId: input.pageId } : {}),
      ...(input.sourceThreadId !== undefined ? { sourceThreadId: input.sourceThreadId } : {}),
      chatMode: input.chatMode ?? "open",
      stageFormat: "computer",
      stageLayout: "adaptive",
      maxViewers: input.maxViewers ?? 200,
      replayRequested: input.replay ?? false,
      createdAt: now,
      ...(status !== "scheduled" ? { startedAt: now } : {}),
      ...(status === "ended" ? { endedAt: now } : {}),
      updatedAt: now,
    })
    await ctx.db.insert("liveSpeakers", {
      networkId: input.networkId,
      sessionId,
      personId: input.host.personId,
      role: "host",
      grantEpoch: 1,
      addedAt: now,
    })
    if (input.replay === true) {
      await ctx.db.insert("liveRecordingConsents", { networkId: input.networkId, sessionId, personId: input.host.personId, acceptedAt: now })
    }
    return sessionId
  })
}

/** `person` accepte l'enregistrement de la session — accord posé en base (DL-02). */
export async function consentToRecording(t: T, sessionId: Id<"liveSessions">, person: Person, acceptedAt = Date.now()): Promise<Id<"liveRecordingConsents">> {
  return await t.run(async (ctx) => {
    const session = await ctx.db.get(sessionId)
    if (!session) throw new Error("session inconnue")
    return await ctx.db.insert("liveRecordingConsents", { networkId: session.networkId, sessionId, personId: person.personId, acceptedAt })
  })
}

/** Une page ACTIVE du réseau, dont `admin` est signataire VIVANT (administrateur, habilitation acceptée). */
export async function insertPage(t: T, networkId: Id<"networks">, admin: Person, handle = "page-de-test"): Promise<Id<"pages">> {
  return await t.run(async (ctx) => {
    const network = await ctx.db.get(networkId)
    const pageId = await ctx.db.insert("pages", {
      networkId,
      handle,
      name: "Page de test",
      ownerKind: "association",
      trust: "community",
      trustRank: 0,
      visibility: "network",
      onRoot: network?.kind === "root",
      status: "active",
      createdByPersonId: admin.personId,
      searchText: `page de test ${handle}`,
      createdAt: 1,
      updatedAt: 1,
    })
    await ctx.db.insert("pageSignatories", { networkId, pageId, personId: admin.personId, role: "admin", acceptedAt: 1, createdAt: 1, updatedAt: 1 })
    return pageId
  })
}

/** `person` suit la page (dans le réseau de la page). */
export async function followPage(t: T, pageId: Id<"pages">, person: Person): Promise<void> {
  await t.run(async (ctx) => {
    const page = await ctx.db.get(pageId)
    if (!page) throw new Error("page inconnue")
    await ctx.db.insert("pageFollows", { networkId: page.networkId, pageId, personId: person.personId, createdAt: Date.now() })
  })
}

/** Retire la page (statut `inactive`) : ses conférences réservées aux abonnés se referment. */
export async function deactivatePage(t: T, pageId: Id<"pages">): Promise<void> {
  await t.run(async (ctx) => ctx.db.patch(pageId, { status: "inactive", deactivatedAt: Date.now() }))
}

/** `person` est invité VIVANT de la session (par l'hôte). */
export async function invite(t: T, sessionId: Id<"liveSessions">, person: Person, stageRole: "viewer" | "speaker" = "viewer"): Promise<Id<"liveInvitees">> {
  return await t.run(async (ctx) => {
    const session = await ctx.db.get(sessionId)
    if (!session) throw new Error("session inconnue")
    return await ctx.db.insert("liveInvitees", {
      networkId: session.networkId,
      sessionId,
      personId: person.personId,
      invitedByPersonId: session.hostPersonId,
      stageRole,
      createdAt: Date.now(),
    })
  })
}

/** `person` est exclu de la session par son hôte. */
export async function ban(t: T, sessionId: Id<"liveSessions">, person: Person): Promise<Id<"liveBans">> {
  return await t.run(async (ctx) => {
    const session = await ctx.db.get(sessionId)
    if (!session) throw new Error("session inconnue")
    return await ctx.db.insert("liveBans", { networkId: session.networkId, sessionId, bannedPersonId: person.personId, byPersonId: session.hostPersonId, createdAt: Date.now() })
  })
}

/**
 * `person` est intervenant VIVANT de la session — avec son accord à
 * l'enregistrement si la session est enregistrée : c'est l'état qu'une montée
 * produit depuis DL-02 (aucune montée sans accord).
 */
export async function promote(t: T, sessionId: Id<"liveSessions">, person: Person): Promise<void> {
  await t.run(async (ctx) => {
    const session = await ctx.db.get(sessionId)
    if (!session) throw new Error("session inconnue")
    await ctx.db.insert("liveSpeakers", { networkId: session.networkId, sessionId, personId: person.personId, role: "speaker", grantEpoch: 1, addedAt: Date.now() })
    if (session.replayRequested) {
      await ctx.db.insert("liveRecordingConsents", { networkId: session.networkId, sessionId, personId: person.personId, acceptedAt: Date.now() })
    }
  })
}

/** Une admission de spectateur posée directement : bail au battement donné, départ facultatif. */
export async function grantAt(t: T, sessionId: Id<"liveSessions">, person: Person, lastSeenAt: number | undefined, leftAt?: number): Promise<Id<"liveViewerGrants">> {
  return await t.run(async (ctx) => {
    const session = await ctx.db.get(sessionId)
    if (!session) throw new Error("session inconnue")
    return await ctx.db.insert("liveViewerGrants", {
      networkId: session.networkId,
      sessionId,
      personId: person.personId,
      firstGrantedAt: lastSeenAt ?? 1,
      lastGrantedAt: lastSeenAt ?? 1,
      ...(lastSeenAt !== undefined ? { lastSeenAt } : {}),
      ...(leftAt !== undefined ? { leftAt } : {}),
    })
  })
}

/** La session telle qu'elle est en base. */
export async function sessionDoc(t: T, sessionId: Id<"liveSessions">): Promise<Doc<"liveSessions"> | null> {
  return await t.run(async (ctx) => ctx.db.get(sessionId))
}

/** Les admissions de spectateurs d'une session (bornées). */
export async function grantsOf(t: T, sessionId: Id<"liveSessions">): Promise<Doc<"liveViewerGrants">[]> {
  return await t.run(async (ctx) =>
    ctx.db
      .query("liveViewerGrants")
      .withIndex("by_session_person", (q) => q.eq("sessionId", sessionId))
      .take(100),
  )
}
