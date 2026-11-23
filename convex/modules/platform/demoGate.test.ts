// @vitest-environment edge-runtime
// Dupliqué de socle/convex/modules/demoAccess/accessStore.test.ts @ 1379d45f9 — adaptations : empreintes de numéro au lieu d'adresses ; liste en table (`allowPhones`, `revokePhones`, `allowlistSummary`) ; seaux de débit des admissions (adresse avant commun, numéro, quota du jour) ; portée ; session relue contre la liste ; journal de la porte ; aide `demoGateSessionOf` / `demoGateAdmits` des lectures du moteur ; garde d'état des mutations internes ; rien en clair.
/** CH-817 — le magasin transactionnel de la porte des comptes de démonstration. */
import { afterEach, describe, expect, it, vi } from "vitest"

import { internal } from "../../_generated/api"
import { demoGateDigest } from "../../lib/demoGate"
import { rateLimiter } from "../../lib/rateLimit"
import { testConvex } from "../../test.setup"
import {
  admitRequestImpl,
  admitVerifyImpl,
  allowlistSummaryImpl,
  allowPhonesImpl,
  completeVerifyImpl,
  DEMO_GATE_CHALLENGE_TTL_MS,
  DEMO_GATE_SESSION_TTL_MS,
  demoGateAdmits,
  demoGateSessionOf,
  markDeliveryFailedImpl,
  revokePhonesImpl,
} from "./demoGate"

// Valeurs FICTIVES : numéros de la plage réservée à la fiction (Ofcom, 07700 900xxx), domaine `.test`.
const SECRET = "fictional-demo-gate-secret-0123456789abcdef"
const WHATSAPP = {
  WHATSAPP_PROVIDER: "bird",
  WHATSAPP_ENDPOINT: "https://whatsapp.example.test/messages",
  WHATSAPP_API_KEY: "fictional-access-key-0123456789",
  WHATSAPP_TEMPLATE: "fictional-project:fictional-version",
}
const LOCAL = { CONVEX_CLOUD_URL: "http://127.0.0.1:3210", ANTSIA_DEV_TOOLS: "true" }
const GATED = { ...LOCAL, ANTSIA_DEMO_GATE_SECRET: SECRET, ...WHATSAPP }
const PHONE = "+447700900123"
const OTHER_PHONE = "+447700900456"
const SCOPE = "diaspora-ga" as const
const NOW = 2_000_000_000_000
const IP = "1".repeat(64)
const TOKEN = "fictional_session_token_0123456789abcdefABC"

type T = ReturnType<typeof testConvex>

const hashOf = (phone: string) => demoGateDigest(SECRET, "demo-gate-phone", phone)
const challengeIdOf = (suffix: string) => suffix.padEnd(32, "x")

async function requestArgs(suffix: string, phone = PHONE, overrides: Partial<{ ipKeyHash: string; codeDigest: string }> = {}) {
  return { scope: SCOPE, phoneHash: await hashOf(phone), ipKeyHash: IP, challengeId: challengeIdOf(suffix), codeDigest: await demoGateDigest(SECRET, "demo-gate-code", suffix), ...overrides }
}

async function allow(t: T, phones: string[] = [PHONE]) {
  return await t.run((ctx) => allowPhonesImpl(ctx, { scope: SCOPE, phones }, NOW, GATED))
}

async function challenge(t: T, suffix: string) {
  return await t.run((ctx) => ctx.db.query("demoGateChallenges").withIndex("by_challengeId", (q) => q.eq("challengeId", challengeIdOf(suffix))).first())
}

async function open(t: T, suffix: string, now = NOW) {
  const args = await requestArgs(suffix)
  expect(await t.run((ctx) => admitRequestImpl(ctx, args, now))).toEqual({ deliver: true })
  return args
}

function complete(t: T, args: { challengeId: string; codeDigest: string }, codeMatches: boolean, now = NOW + 1, tokenDigest = "f".repeat(64)) {
  return t.run((ctx) => completeVerifyImpl(ctx, { scope: SCOPE, challengeId: args.challengeId, expectedCodeDigest: args.codeDigest, codeMatches, tokenDigest }, now))
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("demande — un défi pour un numéro de la liste seulement", () => {
  it("un numéro hors liste n'écrit rien : l'identifiant reçu reste un leurre jamais enregistré", async () => {
    const t = testConvex()
    await allow(t)
    const decoy = await requestArgs("decoy", OTHER_PHONE)
    expect(await t.run((ctx) => admitRequestImpl(ctx, decoy, NOW))).toEqual({ deliver: false })
    expect(await t.run((ctx) => ctx.db.query("demoGateChallenges").take(10))).toEqual([])
  })

  it("invalide l'ancien défi actif à chaque nouvelle demande", async () => {
    const t = testConvex()
    await allow(t)
    await open(t, "first")
    await open(t, "second", NOW + 1)
    expect((await challenge(t, "first"))?.status).toBe("superseded")
    expect((await challenge(t, "second"))?.status).toBe("active")
  })

  it("trois demandes par quart d'heure pour un numéro, puis rien ; quota du jour épuisé : rien", async () => {
    const t = testConvex()
    await allow(t)
    for (const suffix of ["one", "two", "three"]) await open(t, suffix)
    expect(await t.run(async (ctx) => admitRequestImpl(ctx, await requestArgs("four"), NOW))).toEqual({ deliver: false })
    expect(await challenge(t, "four")).toBeNull()

    const daily = testConvex()
    await allow(daily)
    await daily.run(async (ctx) => { await rateLimiter.limit(ctx, "demoGate.request.phone.daily", { key: await hashOf(PHONE), count: 10 }) })
    expect(await daily.run(async (ctx) => admitRequestImpl(ctx, await requestArgs("daily"), NOW))).toEqual({ deliver: false })
  })

  it("seau de l'adresse AVANT le seau commun : un appelant limité ne vide pas le seau de tous", async () => {
    const t = testConvex()
    await allow(t)
    // Dix demandes de numéros hors liste épuisent le seau de cette adresse (10 par heure).
    for (let index = 0; index < 10; index++) {
      expect(await t.run(async (ctx) => admitRequestImpl(ctx, await requestArgs(`stranger${index}`, `+4477009002${index.toString().padStart(2, "0")}`), NOW))).toEqual({ deliver: false })
    }
    const before = await t.run((ctx) => rateLimiter.getValue(ctx, "demoGate.request.global", { key: SCOPE }))
    // Un numéro de la liste, depuis la même adresse : refusé, sans consommer le seau commun.
    expect(await t.run(async (ctx) => admitRequestImpl(ctx, await requestArgs("listed"), NOW))).toEqual({ deliver: false })
    const after = await t.run((ctx) => rateLimiter.getValue(ctx, "demoGate.request.global", { key: SCOPE }))
    expect(after.value).toBeGreaterThanOrEqual(before.value)
    // Depuis une autre adresse, il passe.
    expect(await t.run(async (ctx) => admitRequestImpl(ctx, await requestArgs("elsewhere", PHONE, { ipKeyHash: "2".repeat(64) }), NOW))).toEqual({ deliver: true })
  })

  it("arguments hors forme : refusés sans rien écrire", async () => {
    const t = testConvex()
    await allow(t)
    for (const overrides of [{ ipKeyHash: "pas-une-empreinte" }, { codeDigest: "court" }]) {
      expect(await t.run(async (ctx) => admitRequestImpl(ctx, await requestArgs("bad", PHONE, overrides), NOW))).toEqual({ deliver: false })
    }
    expect(await t.run(async (ctx) => admitRequestImpl(ctx, { ...(await requestArgs("bad")), challengeId: "court" }, NOW))).toEqual({ deliver: false })
    expect(await t.run((ctx) => ctx.db.query("demoGateChallenges").take(10))).toEqual([])
  })

  it("un envoi échoué invalide le défi", async () => {
    const t = testConvex()
    await allow(t)
    const args = await open(t, "undelivered")
    await t.run((ctx) => markDeliveryFailedImpl(ctx, { challengeId: args.challengeId }, NOW + 1))
    expect((await challenge(t, "undelivered"))?.status).toBe("delivery_failed")
    expect(await t.run((ctx) => admitVerifyImpl(ctx, { scope: SCOPE, challengeId: args.challengeId, ipKeyHash: IP }, NOW + 2))).toEqual({ status: "unknown" })
    expect(await complete(t, args, true)).toEqual({ ok: false })
  })
})

describe("vérification — cinq essais, cinq minutes, une seule fois", () => {
  it("bloque après exactement cinq codes erronés", async () => {
    const t = testConvex()
    await allow(t)
    const args = await open(t, "attempts")
    for (let attempt = 1; attempt <= 5; attempt++) expect(await complete(t, args, false, NOW + attempt)).toEqual({ ok: false })
    const row = await challenge(t, "attempts")
    expect(row?.attemptsUsed).toBe(5)
    expect(row?.status).toBe("exhausted")
    // Même le bon code n'ouvre plus rien.
    expect(await complete(t, args, true, NOW + 6)).toEqual({ ok: false })
    expect(await t.run((ctx) => ctx.db.query("demoGateSessions").take(10))).toEqual([])
  })

  it("refuse et marque un défi expiré", async () => {
    const t = testConvex()
    await allow(t)
    const args = await open(t, "expired")
    expect(await t.run((ctx) => admitVerifyImpl(ctx, { scope: SCOPE, challengeId: args.challengeId, ipKeyHash: IP }, NOW + DEMO_GATE_CHALLENGE_TTL_MS))).toEqual({ status: "unknown" })
    expect((await challenge(t, "expired"))?.status).toBe("expired")

    const late = testConvex()
    await allow(late)
    const lateArgs = await open(late, "late")
    expect(await complete(late, lateArgs, true, NOW + DEMO_GATE_CHALLENGE_TTL_MS)).toEqual({ ok: false })
    expect((await challenge(late, "late"))?.status).toBe("expired")
  })

  it("un défi actif rend ses empreintes ; un défi inconnu, d'une autre forme ou leurre rend « unknown »", async () => {
    const t = testConvex()
    await allow(t)
    const args = await open(t, "known")
    expect(await t.run((ctx) => admitVerifyImpl(ctx, { scope: SCOPE, challengeId: args.challengeId, ipKeyHash: IP }, NOW + 1))).toEqual({ status: "open", phoneHash: args.phoneHash, codeDigest: args.codeDigest })
    for (const challengeId of [challengeIdOf("decoy"), "court"]) {
      expect(await t.run((ctx) => admitVerifyImpl(ctx, { scope: SCOPE, challengeId, ipKeyHash: IP }, NOW + 1))).toEqual({ status: "unknown" })
    }
  })

  it("lié à la version exacte du défi lue par l'action : un remplacement concurrent échoue fermé", async () => {
    const t = testConvex()
    await allow(t)
    const args = await open(t, "bound")
    expect(await complete(t, { ...args, codeDigest: "e".repeat(64) }, true)).toEqual({ ok: false })
    expect((await challenge(t, "bound"))?.attemptsUsed).toBe(0)
    expect((await challenge(t, "bound"))?.status).toBe("active")
  })

  it("vingt essais par quart d'heure et par adresse, six cents par heure en tout : au-delà, « limited » avec un délai", async () => {
    const t = testConvex()
    await t.run(async (ctx) => { await rateLimiter.limit(ctx, "demoGate.verify.ip", { key: IP, count: 20 }) })
    const limited = await t.run((ctx) => admitVerifyImpl(ctx, { scope: SCOPE, challengeId: challengeIdOf("any"), ipKeyHash: IP }, NOW))
    expect(limited.status).toBe("limited")
    expect(limited.status === "limited" && limited.retryAfterMs > 0).toBe(true)

    const global = testConvex()
    await global.run(async (ctx) => { await rateLimiter.limit(ctx, "demoGate.verify.global", { key: SCOPE, count: 600 }) })
    expect((await global.run((ctx) => admitVerifyImpl(ctx, { scope: SCOPE, challengeId: challengeIdOf("any"), ipKeyHash: IP }, NOW))).status).toBe("limited")
  })

  it("consomme le défi une fois, ne garde que l'empreinte du jeton et journalise l'accès", async () => {
    const t = testConvex()
    await allow(t)
    const args = await open(t, "once")
    const tokenDigest = await demoGateDigest(SECRET, "demo-gate-session", TOKEN)
    expect(await complete(t, args, true, NOW + 1, tokenDigest)).toEqual({ ok: true, expiresAt: NOW + 1 + DEMO_GATE_SESSION_TTL_MS })
    expect(await complete(t, args, true, NOW + 2, "a".repeat(64))).toEqual({ ok: false })
    const sessions = await t.run((ctx) => ctx.db.query("demoGateSessions").take(10))
    expect(sessions).toHaveLength(1)
    expect(sessions[0]?.tokenDigest).toBe(tokenDigest)
    expect(JSON.stringify(sessions)).not.toContain(TOKEN)
    expect((await challenge(t, "once"))?.status).toBe("verified")
    const audit = await t.run((ctx) => ctx.db.query("engineAudit").take(20))
    const access = audit.filter((row) => row.action === "demo.gate_access")
    expect(access).toHaveLength(1)
    expect(access[0]).toMatchObject({ capacity: "system", subjectTable: "demoGateAllowlist", subjectId: sessions[0]?.allowlistId, details: { scope: SCOPE } })
    expect(access[0]?.networkId).toBeUndefined()
    expect(access[0]?.actorPersonId).toBeUndefined()
  })

  it("un numéro retiré entre la demande et l'essai n'ouvre rien", async () => {
    const t = testConvex()
    await allow(t)
    const args = await open(t, "revoked")
    // Retrait à la main, sans passer par `revokePhones` (qui invaliderait déjà le défi).
    await t.run(async (ctx) => {
      const entry = await ctx.db.query("demoGateAllowlist").first()
      if (entry) await ctx.db.patch(entry._id, { revokedAt: NOW })
    })
    expect(await complete(t, args, true)).toEqual({ ok: false })
    expect((await challenge(t, "revoked"))?.status).toBe("superseded")
  })
})

describe("session de porte — l'aide des lectures du moteur (lot E3)", () => {
  async function verified(t: T) {
    await allow(t)
    const args = await open(t, "session")
    const result = await complete(t, args, true, NOW, await demoGateDigest(SECRET, "demo-gate-session", TOKEN))
    if (!result.ok) throw new Error("session de test non ouverte")
    return result.expiresAt
  }

  it("valide avant trente minutes, refusée à l'échéance, d'une autre forme ou sur une porte non armée", async () => {
    const t = testConvex()
    const expiresAt = await verified(t)
    expect(expiresAt).toBe(NOW + DEMO_GATE_SESSION_TTL_MS)
    expect(await t.run((ctx) => demoGateSessionOf(ctx, { scope: SCOPE, token: TOKEN }, { env: GATED, now: expiresAt - 1 }))).toEqual({ expiresAt })
    expect(await t.run((ctx) => demoGateSessionOf(ctx, { scope: SCOPE, token: TOKEN }, { env: GATED, now: expiresAt }))).toBeNull()
    for (const token of [undefined, null, "", `${TOKEN}x`, TOKEN.replace("_", "+")]) {
      expect(await t.run((ctx) => demoGateSessionOf(ctx, { scope: SCOPE, token }, { env: GATED, now: NOW + 1 }))).toBeNull()
    }
    // Un autre secret (liste rejouée) ou une porte qui n'est plus armée : la session ne vaut plus.
    expect(await t.run((ctx) => demoGateSessionOf(ctx, { scope: SCOPE, token: TOKEN }, { env: { ...GATED, ANTSIA_DEMO_GATE_SECRET: `${SECRET}-autre` }, now: NOW + 1 }))).toBeNull()
    expect(await t.run((ctx) => demoGateSessionOf(ctx, { scope: SCOPE, token: TOKEN }, { env: LOCAL, now: NOW + 1 }))).toBeNull()
  })

  it("un numéro retiré de la liste ferme ses sessions et ses défis", async () => {
    const t = testConvex()
    await verified(t)
    const pending = await open(t, "pending", NOW + 1)
    expect(await t.run((ctx) => revokePhonesImpl(ctx, { scope: SCOPE, phones: [PHONE] }, NOW + 2, GATED))).toEqual({ revoked: 1, notAllowed: 0, active: 0 })
    expect(await t.run((ctx) => demoGateSessionOf(ctx, { scope: SCOPE, token: TOKEN }, { env: GATED, now: NOW + 3 }))).toBeNull()
    expect((await challenge(t, "pending"))?.status).toBe("superseded")
    expect(await complete(t, pending, true, NOW + 3)).toEqual({ ok: false })
  })

  it("demoGateAdmits : porte non armée → oui ; armée → session valide seulement ; fermée ou indisponible → non", async () => {
    const t = testConvex()
    await verified(t)
    const admits = (env: Record<string, string | undefined>, token?: string) => t.run((ctx) => demoGateAdmits(ctx, { scope: SCOPE, token }, { env, now: NOW + 1 }))
    expect(await admits(LOCAL)).toBe(true)
    expect(await admits(GATED)).toBe(false)
    expect(await admits(GATED, "x".repeat(43))).toBe(false)
    expect(await admits(GATED, TOKEN)).toBe(true)
    expect(await admits({ ...LOCAL, ANTSIA_DEMO_GATE_SECRET: SECRET }, TOKEN)).toBe(false)
    expect(await admits({ ...GATED, CONVEX_CLOUD_URL: "https://production-antsia-456.convex.cloud", ANTSIA_DEV_TOOLS: undefined }, TOKEN)).toBe(false)
  })
})

describe("liste des numéros — fonctions internes du propriétaire", () => {
  it("inscrit, ne double pas, rouvre un numéro retiré ; journal à chaque inscription ou retrait", async () => {
    const t = testConvex()
    expect(await allow(t, [PHONE, "0044 7700 900123", OTHER_PHONE])).toEqual({ added: 2, alreadyAllowed: 0, active: 2 })
    expect(await allow(t, [PHONE])).toEqual({ added: 0, alreadyAllowed: 1, active: 2 })
    expect(await t.run((ctx) => revokePhonesImpl(ctx, { scope: SCOPE, phones: [PHONE, "+447700900999"] }, NOW + 1, GATED))).toEqual({ revoked: 1, notAllowed: 1, active: 1 })
    expect(await allow(t, [PHONE])).toEqual({ added: 1, alreadyAllowed: 0, active: 2 })
    expect(await t.run((ctx) => ctx.db.query("demoGateAllowlist").take(10))).toHaveLength(2)
    const audit = await t.run((ctx) => ctx.db.query("engineAudit").take(20))
    expect(audit.map((row) => row.action).sort()).toEqual(["demo.gate_allow", "demo.gate_allow", "demo.gate_allow", "demo.gate_revoke"])
    for (const row of audit) expect(row).toMatchObject({ capacity: "system", subjectTable: "demoGateAllowlist", details: { scope: SCOPE } })
    expect(await t.run((ctx) => allowlistSummaryImpl(ctx, { scope: SCOPE }))).toEqual({ active: 2, revoked: 0, lastAddedAt: NOW, lastRevokedAt: null, maxActive: 20 })
  })

  it("vingt numéros actifs au plus ; un lot vide ou trop long est refusé ; rien n'est écrit sur un refus", async () => {
    const t = testConvex()
    const phones = Array.from({ length: 21 }, (_, index) => `+447700900${(100 + index).toString()}`)
    await expect(allow(t, phones)).rejects.toThrow("demoGateAllowlistBatch")
    await expect(allow(t, [])).rejects.toThrow("demoGateAllowlistBatch")
    expect(await allow(t, phones.slice(0, 20))).toEqual({ added: 20, alreadyAllowed: 0, active: 20 })
    await expect(allow(t, [phones[20]!])).rejects.toThrow("demoGateAllowlistFull")
    expect((await t.run((ctx) => allowlistSummaryImpl(ctx, { scope: SCOPE }))).active).toBe(20)
  })

  it("un numéro hors forme est désigné par son rang, jamais par sa valeur", async () => {
    const t = testConvex()
    const error = await allow(t, [PHONE, "07700 900456"]).catch((caught: unknown) => caught)
    expect(String(error)).toContain("n° 2")
    expect(String(error)).not.toContain("900456")
    expect(await t.run((ctx) => ctx.db.query("demoGateAllowlist").take(10))).toEqual([])
  })

  it("refusée sur un déploiement fermé (la production comprise) ou sans secret", async () => {
    const t = testConvex()
    const production = { CONVEX_CLOUD_URL: "https://production-antsia-456.convex.cloud", ANTSIA_DEMO_GATE_SECRET: SECRET, ...WHATSAPP }
    await expect(t.run((ctx) => allowPhonesImpl(ctx, { scope: SCOPE, phones: [PHONE] }, NOW, production))).rejects.toThrow("demoGateClosed")
    await expect(t.run((ctx) => allowPhonesImpl(ctx, { scope: SCOPE, phones: [PHONE] }, NOW, LOCAL))).rejects.toThrow("demoGateSecretMissing")
    await expect(t.run((ctx) => revokePhonesImpl(ctx, { scope: SCOPE, phones: [PHONE] }, NOW, production))).rejects.toThrow("demoGateClosed")
  })

  it("rien en clair : aucun numéro dans la liste, les défis, les sessions ni le journal", async () => {
    const t = testConvex()
    await allow(t, [PHONE, OTHER_PHONE])
    const args = await open(t, "clear")
    await complete(t, args, true, NOW + 1, await demoGateDigest(SECRET, "demo-gate-session", TOKEN))
    const dump = JSON.stringify(await t.run(async (ctx) => ({
      allowlist: await ctx.db.query("demoGateAllowlist").take(50),
      challenges: await ctx.db.query("demoGateChallenges").take(50),
      sessions: await ctx.db.query("demoGateSessions").take(50),
      audit: await ctx.db.query("engineAudit").take(50),
    })))
    for (const secret of ["447700900123", "447700900456", "7700 900", TOKEN, SECRET]) expect(dump).not.toContain(secret)
  })
})

describe("mutations internes — fermées hors d'une porte armée", () => {
  it("admitRequest, admitVerify et completeVerify ne font rien si la porte n'est pas `gated`", async () => {
    const t = testConvex()
    await allow(t)
    const args = await requestArgs("guarded")
    for (const [key, value] of Object.entries(LOCAL)) vi.stubEnv(key, value)
    vi.stubEnv("ANTSIA_DEMO_GATE_SECRET", undefined)
    expect(await t.mutation(internal.modules.platform.demoGate.admitRequest, args)).toEqual({ deliver: false })
    expect(await t.mutation(internal.modules.platform.demoGate.admitVerify, { scope: SCOPE, challengeId: args.challengeId, ipKeyHash: IP })).toEqual({ status: "unknown" })
    expect(await t.mutation(internal.modules.platform.demoGate.completeVerify, { scope: SCOPE, challengeId: args.challengeId, expectedCodeDigest: args.codeDigest, codeMatches: true, tokenDigest: "f".repeat(64) })).toEqual({ ok: false })
    expect(await t.run((ctx) => ctx.db.query("demoGateChallenges").take(10))).toEqual([])
    // Armée : la même demande ouvre un défi.
    for (const [key, value] of Object.entries(GATED)) vi.stubEnv(key, value)
    expect(await t.mutation(internal.modules.platform.demoGate.admitRequest, args)).toEqual({ deliver: true })
    expect(await t.query(internal.modules.platform.demoGate.allowlistSummary, { scope: SCOPE })).toMatchObject({ active: 1, revoked: 0 })
  })
})
