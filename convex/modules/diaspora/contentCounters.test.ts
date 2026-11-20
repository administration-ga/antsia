// @vitest-environment edge-runtime
/**
 * Crochets d'effacement de la vague H DIASPORA.GA (G9) — `removeDiasporaCounters`,
 * appelé par `removeCounters` de `people/erasure` AVANT la suppression de chaque
 * ligne : réponse d'entraide (compte et réponse retenue), inscription bénévole
 * (compte et mission complète), signalement « périmée » du kit (version courante
 * seulement) ; toute autre table est ignorée. Données de fixture fictives.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { openNetworkFeatures, testConvex } from "../../test.setup"
import { removeDiasporaCounters } from "./contentCounters"

const NOW = Date.UTC(2026, 9, 19, 10)
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

beforeEach(() => {
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

async function fixture() {
  const t = testConvex()
  await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const { network: networkId } = await t.mutation(internal.modules.diaspora.seed.run, { confirmNonProduction: SEED_CONFIRMATION })
  await openNetworkFeatures(t, networkId)
  const ids = await t.run(async (ctx) => {
    const person = async (handle: string) => await ctx.db.insert("persons", { authUserId: `auth-${handle}`, handle, displayName: handle, createdAt: NOW, updatedAt: NOW, publishedAt: NOW })
    const asker = await person("demandeuse.effacement")
    const helper = await person("aidante.effacement")
    const other = await person("autre.effacement")
    const pageId = await ctx.db.insert("pages", {
      networkId, handle: "asso-effacement", name: "Association fictive", ownerKind: "association", trust: "community", trustRank: 0,
      visibility: "network", onRoot: false, status: "active", searchText: "asso effacement", createdAt: NOW, updatedAt: NOW,
    })
    return { asker, helper, other, pageId }
  })
  return { t, networkId, ...ids }
}

type Fixture = Awaited<ReturnType<typeof fixture>>

/** Une question résolue par la réponse `kept`, et une seconde réponse publiée. */
async function resolvedQuestion(f: Fixture) {
  return await f.t.run(async (ctx) => {
    const questionId = await ctx.db.insert("aidQuestions", {
      networkId: f.networkId, authorPersonId: f.asker, title: "Trouver une colocation à Lyon", detail: "", theme: "housing", country: "FR",
      status: "open", answerCount: 2, version: 3, createdAt: NOW, updatedAt: NOW,
    })
    const kept = await ctx.db.insert("aidAnswers", { networkId: f.networkId, questionId, authorPersonId: f.helper, body: "Les foyers étudiants de la métropole.", status: "published", version: 1, createdAt: NOW, updatedAt: NOW })
    const extra = await ctx.db.insert("aidAnswers", { networkId: f.networkId, questionId, authorPersonId: f.other, body: "Le CROUS ouvre ses demandes au printemps.", status: "published", version: 1, createdAt: NOW, updatedAt: NOW })
    await ctx.db.patch(questionId, { status: "resolved", acceptedAnswerId: kept, resolvedAt: NOW })
    return { questionId, kept, extra }
  })
}

/** Le crochet appelé sur une ligne relue, comme le fait `removeCounters` avant la suppression. */
async function erase(f: Fixture, table: "aidAnswers" | "aidMissionSignups" | "kitOutdatedFlags", id: Id<"aidAnswers"> | Id<"aidMissionSignups"> | Id<"kitOutdatedFlags">) {
  await f.t.run(async (ctx) => {
    const row = table === "aidAnswers"
      ? await ctx.db.get(id as Id<"aidAnswers">)
      : table === "aidMissionSignups" ? await ctx.db.get(id as Id<"aidMissionSignups">) : await ctx.db.get(id as Id<"kitOutdatedFlags">)
    if (!row) throw new Error("Ligne de fixture absente")
    await removeDiasporaCounters(ctx, table, { ...row })
    await ctx.db.delete(row._id)
  })
}

describe("effacement — réponses d'entraide", () => {
  it("la réponse retenue effacée : décomptée, la question redevient ouverte et sa version avance", async () => {
    const f = await fixture()
    const { questionId, kept, extra } = await resolvedQuestion(f)
    vi.setSystemTime(NOW + DAY)
    await erase(f, "aidAnswers", kept)
    const reopened = await f.t.run(async (ctx) => ctx.db.get(questionId))
    expect(reopened).toMatchObject({ status: "open", answerCount: 1, version: 4, updatedAt: NOW + DAY })
    expect(reopened?.acceptedAnswerId).toBeUndefined()
    expect(reopened?.resolvedAt).toBeUndefined()

    // Une réponse non retenue : seul le compte bouge, la version de l'auteur reste.
    await erase(f, "aidAnswers", extra)
    expect(await f.t.run(async (ctx) => ctx.db.get(questionId))).toMatchObject({ status: "open", answerCount: 0, version: 4 })
  })

  it("une question close garde son état : seule la réponse retenue s'efface", async () => {
    const f = await fixture()
    const { questionId, kept } = await resolvedQuestion(f)
    await f.t.run(async (ctx) => { await ctx.db.patch(questionId, { status: "closed", closedAt: NOW }) })
    await erase(f, "aidAnswers", kept)
    const closed = await f.t.run(async (ctx) => ctx.db.get(questionId))
    expect(closed).toMatchObject({ status: "closed", answerCount: 1, version: 4 })
    expect(closed?.acceptedAnswerId).toBeUndefined()
  })

  it("déjà décomptée — retirée par son auteur ou par la modération — : rien ne bouge", async () => {
    const f = await fixture()
    const { questionId, kept, extra } = await resolvedQuestion(f)
    await f.t.run(async (ctx) => {
      await ctx.db.patch(extra, { status: "withdrawn", withdrawnAt: NOW })
      await ctx.db.patch(questionId, { answerCount: 1 })
      // Le retrait par la modération a déjà décompté et libéré la question (`moderationTargets`).
      await ctx.db.insert("moderationContentStates", { networkId: f.networkId, targetKind: "diasporaAidAnswer", targetId: kept, ownerPersonId: f.helper, status: "removed", createdAt: NOW, updatedAt: NOW })
      await ctx.db.patch(questionId, { answerCount: 0, status: "open", acceptedAnswerId: undefined, resolvedAt: undefined, version: 4 })
    })
    await erase(f, "aidAnswers", extra)
    await erase(f, "aidAnswers", kept)
    expect(await f.t.run(async (ctx) => ctx.db.get(questionId))).toMatchObject({ status: "open", answerCount: 0, version: 4 })
  })

  it("la question déjà effacée (passe précédente) : la réponse n'a plus rien à décompter", async () => {
    const f = await fixture()
    const { questionId, extra } = await resolvedQuestion(f)
    await f.t.run(async (ctx) => { await ctx.db.delete(questionId) })
    await erase(f, "aidAnswers", extra)
    expect(await f.t.run(async (ctx) => ctx.db.get(questionId))).toBeNull()
  })
})

describe("effacement — inscriptions bénévoles", () => {
  async function mission(f: Fixture, status: "open" | "full" | "closed" | "cancelled", signupCount: number) {
    return await f.t.run(async (ctx) => {
      const missionId = await ctx.db.insert("aidMissions", {
        networkId: f.networkId, pageId: f.pageId, title: "Accueillir les nouveaux arrivants", description: "Orienter les étudiants qui arrivent le samedi matin.",
        country: "FR", city: "Lyon", cityKey: "lyon", startsAt: NOW + 2 * DAY, timeZone: "Europe/Paris", places: 2, signupCount, status, version: 1, createdAt: NOW, updatedAt: NOW,
      })
      const signups: Id<"aidMissionSignups">[] = []
      for (const personId of [f.helper, f.other]) {
        signups.push(await ctx.db.insert("aidMissionSignups", { networkId: f.networkId, missionId, personId, status: "confirmed", nameConsentAt: NOW, signedUpAt: NOW, createdAt: NOW, updatedAt: NOW }))
      }
      return { missionId, signups }
    })
  }

  it("une inscription confirmée effacée décompte et rouvre une mission complète, sans changer sa version", async () => {
    const f = await fixture()
    const { missionId, signups } = await mission(f, "full", 2)
    await erase(f, "aidMissionSignups", signups[0]!)
    expect(await f.t.run(async (ctx) => ctx.db.get(missionId))).toMatchObject({ status: "open", signupCount: 1, version: 1 })
    await erase(f, "aidMissionSignups", signups[1]!)
    expect(await f.t.run(async (ctx) => ctx.db.get(missionId))).toMatchObject({ status: "open", signupCount: 0, version: 1 })
  })

  it("une mission close ou annulée le reste ; une inscription retirée ne décompte pas", async () => {
    const f = await fixture()
    const closed = await mission(f, "closed", 2)
    await erase(f, "aidMissionSignups", closed.signups[0]!)
    expect(await f.t.run(async (ctx) => ctx.db.get(closed.missionId))).toMatchObject({ status: "closed", signupCount: 1 })
    const cancelled = await mission(f, "cancelled", 2)
    await erase(f, "aidMissionSignups", cancelled.signups[0]!)
    expect(await f.t.run(async (ctx) => ctx.db.get(cancelled.missionId))).toMatchObject({ status: "cancelled", signupCount: 1 })

    const open = await mission(f, "open", 1)
    await f.t.run(async (ctx) => { await ctx.db.patch(open.signups[1]!, { status: "withdrawn", withdrawnAt: NOW }) })
    await erase(f, "aidMissionSignups", open.signups[1]!)
    expect(await f.t.run(async (ctx) => ctx.db.get(open.missionId))).toMatchObject({ status: "open", signupCount: 1 })
  })
})

describe("effacement — signalements « périmée » du kit", () => {
  it("décompte la version COURANTE seulement ; la version de la ligne ne bouge pas", async () => {
    const f = await fixture()
    const { resourceId, current, past } = await f.t.run(async (ctx) => {
      const resourceId = await ctx.db.insert("kitResources", {
        networkId: f.networkId, authorPersonId: f.asker, proposedByPersonId: f.asker, revisedByPersonId: f.asker,
        title: "Ouvrir un compte bancaire", summary: "Les pièces demandées et les délais habituels.", body: "Prenez rendez-vous en agence avec vos justificatifs.",
        category: "banking", country: "FR", cityKey: "", sourceName: "Source fictive", sourceUrl: "https://www.exemple-public.fr/",
        lastVerifiedAt: NOW - DAY, status: "published", listed: true, revision: 2, version: 5, outdatedFlags: 2, revisedAt: NOW, createdAt: NOW, updatedAt: NOW,
      })
      const current = await ctx.db.insert("kitOutdatedFlags", { networkId: f.networkId, resourceId, revision: 2, personId: f.helper, reason: "link_broken", createdAt: NOW })
      const past = await ctx.db.insert("kitOutdatedFlags", { networkId: f.networkId, resourceId, revision: 1, personId: f.other, reason: "information_changed", createdAt: NOW })
      return { resourceId, current, past }
    })
    await erase(f, "kitOutdatedFlags", past)
    expect(await f.t.run(async (ctx) => ctx.db.get(resourceId))).toMatchObject({ outdatedFlags: 2, version: 5, revision: 2 })
    await erase(f, "kitOutdatedFlags", current)
    expect(await f.t.run(async (ctx) => ctx.db.get(resourceId))).toMatchObject({ outdatedFlags: 1, version: 5, revision: 2 })
  })
})

describe("effacement — périmètre", () => {
  it("une ligne d'une autre table est ignorée, même si elle ressemble à une des nôtres", async () => {
    const f = await fixture()
    const { questionId } = await resolvedQuestion(f)
    const before = await f.t.run(async (ctx) => ctx.db.get(questionId))
    await f.t.run(async (ctx) => {
      await removeDiasporaCounters(ctx, "postComments", { _id: "comment-fictif", _creationTime: NOW, questionId, status: "published", networkId: f.networkId })
      await removeDiasporaCounters(ctx, "serviceReviews", { _id: "avis-fictif", _creationTime: NOW, status: "active" })
    })
    expect(await f.t.run(async (ctx) => ctx.db.get(questionId))).toEqual(before)
  })
})
