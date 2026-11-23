// Dupliqué de socle/convex/modules/demoAccess/accessStore.ts @ 1379d45f9 — adaptations : numéro (empreinte HMAC) au lieu d'adresse en clair ; liste des numéros en table d'empreintes (`allowPhones`, `revokePhones`, `allowlistSummary`) au lieu d'une liste écrite dans le code ; admissions de débit dans les mutations (`admitRequest` : adresse, commun, liste, numéro ; `admitVerify` : adresse, commun) au lieu de l'action Node ; défi et session liés à une portée ; une session ne vaut que tant que sa ligne de liste est active ; journal `demo.gate_allow` / `demo.gate_revoke` / `demo.gate_access` ; aide de validation de session pour les lectures du moteur (`demoGateSessionOf`, `demoGateAdmits`) ; purge opportuniste reprise telle quelle.
/**
 * La porte des comptes de démonstration (CH-817) — le magasin transactionnel.
 *
 * Chemin d'un accès :
 * 1. `POST /demo-gate/request` (`./demoGateHttp.ts`) tire un code et un identifiant de défi, puis
 *    appelle `admitRequest` avec des EMPREINTES seulement (numéro, adresse, code). La réponse est la
 *    même pour un numéro autorisé, refusé ou limité ; seul un numéro de la liste reçoit un défi.
 * 2. Le code part par WhatsApp ; un échec invalide le défi (`markDeliveryFailed`).
 * 3. `POST /demo-gate/verify` appelle `admitVerify` (débit, défi actif), compare l'empreinte du
 *    code à temps constant, puis `completeVerify` consomme le défi et ouvre une session de trente
 *    minutes dont seule l'empreinte du jeton est gardée.
 * 4. Les lectures du moteur qui ouvrent les comptes de démonstration (catalogue, code affiché :
 *    lot E3) appellent `demoGateAdmits` avec le jeton reçu.
 *
 * Rien n'est jamais gardé en clair : ni numéro, ni code, ni jeton — en base, au journal ou dans un
 * argument planifié. La liste se remplit par `allowPhones`, que lance le propriétaire.
 */
import {
  DEMO_GATE_ALLOWLIST_MAX,
  DEMO_GATE_CHALLENGE_ID_PATTERN,
  DEMO_GATE_MAX_ATTEMPTS,
  DEMO_GATE_SESSION_TTL_SECONDS,
  DEMO_GATE_TOKEN_PATTERN,
  type DemoGateScope,
  normalizeDemoGatePhone,
} from "@antsia/social-contracts/demoGate"
import { v } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "../../_generated/server"
import { OTP_TTL_SECONDS } from "../../betterAuth/settings"
import { demoGateDigest, demoGateSecret, demoGateState } from "../../lib/demoGate"
import { rateLimiter } from "../../lib/rateLimit"
import { appendAudit } from "./audit"
import { demoGateScopeValidator } from "./tables"

type Env = Record<string, string | undefined>

/** Durée d'un défi : celle de tout code à usage unique du moteur (cinq minutes). */
export const DEMO_GATE_CHALLENGE_TTL_MS = OTP_TTL_SECONDS * 1_000
export const DEMO_GATE_SESSION_TTL_MS = DEMO_GATE_SESSION_TTL_SECONDS * 1_000
/** Purge opportuniste : lots de vingt, à chaque défi créé (aucun passage planifié). */
const CLEANUP_BATCH_SIZE = 20
/** Un défi expiré se garde un jour (lecture d'un incident), puis se purge. */
const CHALLENGE_RETENTION_MS = 24 * 60 * 60 * 1_000
/** Lignes lues au plus pour une portée de la liste (actives et retirées). */
const ALLOWLIST_SCAN_MAX = 500
/** Défis actifs relus au plus pour un numéro (un seul en principe). */
const ACTIVE_CHALLENGES_MAX = 8
const HEX_DIGEST = /^[0-9a-f]{64}$/

function isDigest(value: string): boolean {
  return HEX_DIGEST.test(value)
}

async function activeEntry(ctx: Pick<QueryCtx, "db">, scope: DemoGateScope, phoneHash: string): Promise<Doc<"demoGateAllowlist"> | null> {
  const entry = await ctx.db
    .query("demoGateAllowlist")
    .withIndex("by_scope_phoneHash", (q) => q.eq("scope", scope).eq("phoneHash", phoneHash))
    .first()
  return entry && entry.revokedAt === undefined ? entry : null
}

async function challengeById(ctx: Pick<QueryCtx, "db">, challengeId: string): Promise<Doc<"demoGateChallenges"> | null> {
  return await ctx.db
    .query("demoGateChallenges")
    .withIndex("by_challengeId", (q) => q.eq("challengeId", challengeId))
    .first()
}

/** Les défis encore actifs d'un numéro deviennent `superseded` (le nouveau remplace l'ancien, ou le numéro est retiré). */
async function supersedeActiveChallenges(ctx: MutationCtx, scope: DemoGateScope, phoneHash: string, now: number): Promise<void> {
  const active = await ctx.db
    .query("demoGateChallenges")
    .withIndex("by_scope_phoneHash_status", (q) => q.eq("scope", scope).eq("phoneHash", phoneHash).eq("status", "active"))
    .take(ACTIVE_CHALLENGES_MAX)
  for (const challenge of active) await ctx.db.patch(challenge._id, { status: "superseded", invalidatedAt: now })
}

async function cleanupExpiredGateData(ctx: MutationCtx, now: number): Promise<void> {
  const staleChallenges = await ctx.db
    .query("demoGateChallenges")
    .withIndex("by_expiresAt", (q) => q.lt("expiresAt", now - CHALLENGE_RETENTION_MS))
    .take(CLEANUP_BATCH_SIZE)
  for (const challenge of staleChallenges) await ctx.db.delete(challenge._id)
  const expiredSessions = await ctx.db
    .query("demoGateSessions")
    .withIndex("by_expiresAt", (q) => q.lt("expiresAt", now))
    .take(CLEANUP_BATCH_SIZE)
  for (const session of expiredSessions) await ctx.db.delete(session._id)
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Demande d'un code
// ─────────────────────────────────────────────────────────────────────────────

export type AdmitRequestArgs = { scope: DemoGateScope; phoneHash: string; ipKeyHash: string; challengeId: string; codeDigest: string }
export type AdmitRequestResult = { deliver: boolean }

/**
 * Admet une demande de code. Seaux consommés dans cet ordre : adresse, commun, liste, numéro (le
 * seau de l'adresse d'abord, pour qu'un seul appelant ne vide pas le seau commun de tous). Le défi
 * n'est créé que pour un numéro ACTIF de la liste, dans ses limites ; sinon rien n'est écrit et
 * l'identifiant reçu reste un leurre jamais enregistré. `deliver` ne sort jamais de l'action HTTP.
 */
export async function admitRequestImpl(ctx: MutationCtx, args: AdmitRequestArgs, now: number): Promise<AdmitRequestResult> {
  const refused: AdmitRequestResult = { deliver: false }
  if (!isDigest(args.phoneHash) || !isDigest(args.ipKeyHash) || !isDigest(args.codeDigest) || !DEMO_GATE_CHALLENGE_ID_PATTERN.test(args.challengeId)) return refused
  if (!(await rateLimiter.limit(ctx, "demoGate.request.ip", { key: args.ipKeyHash })).ok) return refused
  if (!(await rateLimiter.limit(ctx, "demoGate.request.global", { key: args.scope })).ok) return refused
  if (!(await activeEntry(ctx, args.scope, args.phoneHash))) return refused
  if (!(await rateLimiter.limit(ctx, "demoGate.request.phone", { key: args.phoneHash })).ok) return refused
  if (!(await rateLimiter.limit(ctx, "demoGate.request.phone.daily", { key: args.phoneHash })).ok) return refused
  // Un identifiant déjà connu (collision de 192 bits, ou rejeu) n'ouvre rien.
  if (await challengeById(ctx, args.challengeId)) return refused
  await supersedeActiveChallenges(ctx, args.scope, args.phoneHash, now)
  await ctx.db.insert("demoGateChallenges", {
    scope: args.scope,
    challengeId: args.challengeId,
    phoneHash: args.phoneHash,
    codeDigest: args.codeDigest,
    status: "active",
    attemptsUsed: 0,
    createdAt: now,
    expiresAt: now + DEMO_GATE_CHALLENGE_TTL_MS,
  })
  await cleanupExpiredGateData(ctx, now)
  return { deliver: true }
}

const hexArg = v.string()

export const admitRequest = internalMutation({
  args: { scope: demoGateScopeValidator, phoneHash: hexArg, ipKeyHash: hexArg, challengeId: v.string(), codeDigest: hexArg },
  returns: v.object({ deliver: v.boolean() }),
  handler: async (ctx, args) => {
    // Défense en profondeur : l'action HTTP l'a déjà vérifié.
    if (demoGateState() !== "gated") return { deliver: false }
    return await admitRequestImpl(ctx, args, Date.now())
  },
})

/** L'envoi WhatsApp a échoué : le défi devient inutilisable (personne ne peut deviner un code jamais reçu). */
export async function markDeliveryFailedImpl(ctx: MutationCtx, args: { challengeId: string }, now: number): Promise<void> {
  const challenge = await challengeById(ctx, args.challengeId)
  if (challenge?.status === "active") await ctx.db.patch(challenge._id, { status: "delivery_failed", invalidatedAt: now })
}

export const markDeliveryFailed = internalMutation({
  args: { challengeId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await markDeliveryFailedImpl(ctx, args, Date.now())
    return null
  },
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. Vérification d'un code
// ─────────────────────────────────────────────────────────────────────────────

export type AdmitVerifyArgs = { scope: DemoGateScope; challengeId: string; ipKeyHash: string }
export type AdmitVerifyResult =
  | { status: "limited"; retryAfterMs: number }
  | { status: "unknown" }
  | { status: "open"; phoneHash: string; codeDigest: string }

/**
 * Admet un essai : seaux de l'adresse puis commun, puis le défi — actif, de la portée, non
 * expiré (un défi expiré est marqué). Rend les EMPREINTES dont l'action a besoin pour comparer le
 * code ; un défi inconnu, leurre compris, rend `unknown`, que l'action dit comme un code faux.
 */
export async function admitVerifyImpl(ctx: MutationCtx, args: AdmitVerifyArgs, now: number): Promise<AdmitVerifyResult> {
  if (!isDigest(args.ipKeyHash)) return { status: "unknown" }
  const ip = await rateLimiter.limit(ctx, "demoGate.verify.ip", { key: args.ipKeyHash })
  if (!ip.ok) return { status: "limited", retryAfterMs: ip.retryAfter }
  const global = await rateLimiter.limit(ctx, "demoGate.verify.global", { key: args.scope })
  if (!global.ok) return { status: "limited", retryAfterMs: global.retryAfter }
  if (!DEMO_GATE_CHALLENGE_ID_PATTERN.test(args.challengeId)) return { status: "unknown" }
  const challenge = await challengeById(ctx, args.challengeId)
  if (!challenge || challenge.scope !== args.scope || challenge.status !== "active") return { status: "unknown" }
  if (challenge.expiresAt <= now) {
    await ctx.db.patch(challenge._id, { status: "expired", invalidatedAt: now })
    return { status: "unknown" }
  }
  return { status: "open", phoneHash: challenge.phoneHash, codeDigest: challenge.codeDigest }
}

export const admitVerify = internalMutation({
  args: { scope: demoGateScopeValidator, challengeId: v.string(), ipKeyHash: hexArg },
  returns: v.union(
    v.object({ status: v.literal("limited"), retryAfterMs: v.number() }),
    v.object({ status: v.literal("unknown") }),
    v.object({ status: v.literal("open"), phoneHash: v.string(), codeDigest: v.string() }),
  ),
  handler: async (ctx, args): Promise<AdmitVerifyResult> => {
    if (demoGateState() !== "gated") return { status: "unknown" }
    return await admitVerifyImpl(ctx, args, Date.now())
  },
})

export type CompleteVerifyArgs = { scope: DemoGateScope; challengeId: string; expectedCodeDigest: string; codeMatches: boolean; tokenDigest: string }
export type CompleteVerifyResult = { ok: true; expiresAt: number } | { ok: false }

/**
 * Consomme l'essai. Lié à la version EXACTE du défi que l'action a lue (`expectedCodeDigest`) : un
 * remplacement concurrent échoue fermé. Code faux : un essai de moins, épuisé au cinquième. Code
 * juste : le numéro doit être encore sur la liste ; le défi est consommé, la session ouverte (seule
 * l'empreinte du jeton est gardée) et l'accès journalisé (`demo.gate_access`).
 */
export async function completeVerifyImpl(ctx: MutationCtx, args: CompleteVerifyArgs, now: number): Promise<CompleteVerifyResult> {
  const refused: CompleteVerifyResult = { ok: false }
  const challenge = await challengeById(ctx, args.challengeId)
  if (!challenge || challenge.scope !== args.scope || challenge.status !== "active") return refused
  if (challenge.expiresAt <= now) {
    await ctx.db.patch(challenge._id, { status: "expired", invalidatedAt: now })
    return refused
  }
  if (challenge.codeDigest !== args.expectedCodeDigest) return refused
  if (!args.codeMatches) {
    const attemptsUsed = challenge.attemptsUsed + 1
    await ctx.db.patch(challenge._id, {
      attemptsUsed,
      ...(attemptsUsed >= DEMO_GATE_MAX_ATTEMPTS ? { status: "exhausted" as const, invalidatedAt: now } : {}),
    })
    return refused
  }
  const entry = await activeEntry(ctx, challenge.scope, challenge.phoneHash)
  if (!entry) {
    // Numéro retiré entre la demande et l'essai : le défi ne vaut plus rien.
    await ctx.db.patch(challenge._id, { status: "superseded", invalidatedAt: now })
    return refused
  }
  if (!isDigest(args.tokenDigest)) return refused
  const expiresAt = now + DEMO_GATE_SESSION_TTL_MS
  await ctx.db.patch(challenge._id, { status: "verified", verifiedAt: now })
  await ctx.db.insert("demoGateSessions", { scope: challenge.scope, tokenDigest: args.tokenDigest, allowlistId: entry._id, challengeId: challenge._id, createdAt: now, expiresAt })
  await appendAudit(ctx, { action: "demo.gate_access", capacity: "system", subject: { table: "demoGateAllowlist", id: entry._id }, details: { scope: challenge.scope }, at: now })
  return { ok: true, expiresAt }
}

export const completeVerify = internalMutation({
  args: { scope: demoGateScopeValidator, challengeId: v.string(), expectedCodeDigest: v.string(), codeMatches: v.boolean(), tokenDigest: hexArg },
  returns: v.union(v.object({ ok: v.literal(true), expiresAt: v.number() }), v.object({ ok: v.literal(false) })),
  handler: async (ctx, args): Promise<CompleteVerifyResult> => {
    if (demoGateState() !== "gated") return { ok: false }
    return await completeVerifyImpl(ctx, args, Date.now())
  },
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. Session de porte — l'aide des lectures du moteur (lot E3)
// ─────────────────────────────────────────────────────────────────────────────

export type DemoGateSessionOptions = { env?: Env; now?: number }

/**
 * La session de porte que désigne ce jeton, pour cette portée : `{ expiresAt }`, ou `null` si la
 * porte n'est pas `gated`, si le jeton est hors forme, inconnu, d'une autre portée, expiré, ou si
 * son numéro a quitté la liste. Lecture seule, deux lectures indexées ; le jeton ne quitte pas la
 * fonction (seule son empreinte est cherchée).
 */
export async function demoGateSessionOf(ctx: Pick<QueryCtx, "db">, args: { scope: DemoGateScope; token: string | null | undefined }, options: DemoGateSessionOptions = {}): Promise<{ expiresAt: number } | null> {
  const env = options.env ?? process.env
  const secret = demoGateSecret(env)
  if (secret === null || demoGateState(env) !== "gated") return null
  if (typeof args.token !== "string" || !DEMO_GATE_TOKEN_PATTERN.test(args.token)) return null
  const tokenDigest = await demoGateDigest(secret, "demo-gate-session", args.token)
  const session = await ctx.db
    .query("demoGateSessions")
    .withIndex("by_tokenDigest", (q) => q.eq("tokenDigest", tokenDigest))
    .first()
  const now = options.now ?? Date.now()
  if (!session || session.scope !== args.scope || session.expiresAt <= now) return null
  const entry = await ctx.db.get(session.allowlistId)
  if (!entry || entry.scope !== args.scope || entry.revokedAt !== undefined) return null
  return { expiresAt: session.expiresAt }
}

/**
 * LA règle des lectures qui ouvrent les comptes de démonstration (lot E3 : `catalogue`, `latestOtp`) :
 * porte `open` (non armée) → oui, comme avant la porte ; `gated` → seulement avec une session de
 * porte valide pour la portée ; `closed` et `unavailable` → non, pour tous.
 */
export async function demoGateAdmits(ctx: Pick<QueryCtx, "db">, args: { scope: DemoGateScope; token: string | null | undefined }, options: DemoGateSessionOptions = {}): Promise<boolean> {
  const state = demoGateState(options.env ?? process.env)
  if (state === "open") return true
  if (state !== "gated") return false
  return (await demoGateSessionOf(ctx, args, options)) !== null
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. La liste des numéros — fonctions internes lancées par le propriétaire
// ─────────────────────────────────────────────────────────────────────────────

/** Les empreintes des numéros donnés, sans doublon ; un numéro hors forme lève avec son RANG seul, jamais sa valeur. */
async function phoneHashesOf(secret: string, phones: readonly string[]): Promise<string[]> {
  if (phones.length === 0 || phones.length > DEMO_GATE_ALLOWLIST_MAX) throw new Error(`demoGateAllowlistBatch: 1 à ${DEMO_GATE_ALLOWLIST_MAX} numéros par appel`)
  const hashes = new Set<string>()
  for (const [index, phone] of phones.entries()) {
    const normalized = normalizeDemoGatePhone(phone)
    if (normalized === null) throw new Error(`demoGateInvalidPhone: numéro n° ${index + 1} hors forme E.164`)
    hashes.add(await demoGateDigest(secret, "demo-gate-phone", normalized))
  }
  return [...hashes]
}

/** Le secret de la porte, sur un déploiement où les comptes de démonstration sont ouverts ; sinon lève. */
function allowlistSecret(env: Env): string {
  if (demoGateState(env) === "closed") throw new Error("demoGateClosed: comptes de démonstration fermés sur ce déploiement")
  const secret = demoGateSecret(env)
  if (secret === null) throw new Error("demoGateSecretMissing: ANTSIA_DEMO_GATE_SECRET absent ou trop court")
  return secret
}

async function scopeRows(ctx: Pick<QueryCtx, "db">, scope: DemoGateScope): Promise<Doc<"demoGateAllowlist">[]> {
  // borné : une ligne par numéro jamais inscrit sur la portée, lue à ALLOWLIST_SCAN_MAX au plus.
  return await ctx.db.query("demoGateAllowlist").withIndex("by_scope_phoneHash", (q) => q.eq("scope", scope)).take(ALLOWLIST_SCAN_MAX)
}

export type AllowPhonesResult = { added: number; alreadyAllowed: number; active: number }

export async function allowPhonesImpl(ctx: MutationCtx, args: { scope: DemoGateScope; phones: readonly string[] }, now: number, env: Env = process.env): Promise<AllowPhonesResult> {
  const secret = allowlistSecret(env)
  const hashes = await phoneHashesOf(secret, args.phones)
  const rows = await scopeRows(ctx, args.scope)
  const byHash = new Map(rows.map((row) => [row.phoneHash, row]))
  const activeBefore = rows.filter((row) => row.revokedAt === undefined).length
  // Nouveaux : jamais inscrits, ou retirés (la ligne se rouvre) ; un numéro déjà actif ne change rien.
  const fresh = hashes.filter((hash) => {
    const row = byHash.get(hash)
    return !row || row.revokedAt !== undefined
  })
  if (activeBefore + fresh.length > DEMO_GATE_ALLOWLIST_MAX) throw new Error(`demoGateAllowlistFull: ${DEMO_GATE_ALLOWLIST_MAX} numéros actifs au plus par portée`)
  for (const hash of fresh) {
    const existing = byHash.get(hash)
    let entryId: Id<"demoGateAllowlist">
    if (existing) {
      await ctx.db.patch(existing._id, { addedAt: now, revokedAt: undefined })
      entryId = existing._id
    } else {
      entryId = await ctx.db.insert("demoGateAllowlist", { scope: args.scope, phoneHash: hash, addedAt: now })
    }
    await appendAudit(ctx, { action: "demo.gate_allow", capacity: "system", subject: { table: "demoGateAllowlist", id: entryId }, details: { scope: args.scope }, at: now })
  }
  return { added: fresh.length, alreadyAllowed: hashes.length - fresh.length, active: activeBefore + fresh.length }
}

/**
 * Inscrit des numéros sur la liste d'une portée (`npx convex run modules/platform/demoGate:allowPhones`
 * sur le déploiement de démonstration, par le propriétaire ; les numéros ne s'écrivent jamais dans
 * un dépôt). Rend des NOMBRES, jamais un numéro. Changer le secret invalide la liste : la rejouer.
 */
export const allowPhones = internalMutation({
  args: { scope: demoGateScopeValidator, phones: v.array(v.string()) },
  returns: v.object({ added: v.number(), alreadyAllowed: v.number(), active: v.number() }),
  handler: async (ctx, args) => await allowPhonesImpl(ctx, args, Date.now()),
})

export type RevokePhonesResult = { revoked: number; notAllowed: number; active: number }

export async function revokePhonesImpl(ctx: MutationCtx, args: { scope: DemoGateScope; phones: readonly string[] }, now: number, env: Env = process.env): Promise<RevokePhonesResult> {
  const secret = allowlistSecret(env)
  const hashes = await phoneHashesOf(secret, args.phones)
  let revoked = 0
  for (const hash of hashes) {
    const entry = await activeEntry(ctx, args.scope, hash)
    if (!entry) continue
    await ctx.db.patch(entry._id, { revokedAt: now })
    // Ses défis en cours tombent ; ses sessions cessent de valoir (`demoGateSessionOf` relit la ligne).
    await supersedeActiveChallenges(ctx, args.scope, hash, now)
    await appendAudit(ctx, { action: "demo.gate_revoke", capacity: "system", subject: { table: "demoGateAllowlist", id: entry._id }, details: { scope: args.scope }, at: now })
    revoked++
  }
  const active = (await scopeRows(ctx, args.scope)).filter((row) => row.revokedAt === undefined).length
  return { revoked, notAllowed: hashes.length - revoked, active }
}

/** Retire des numéros de la liste d'une portée. Rend des nombres, jamais un numéro. */
export const revokePhones = internalMutation({
  args: { scope: demoGateScopeValidator, phones: v.array(v.string()) },
  returns: v.object({ revoked: v.number(), notAllowed: v.number(), active: v.number() }),
  handler: async (ctx, args) => await revokePhonesImpl(ctx, args, Date.now()),
})

export type AllowlistSummary = { active: number; revoked: number; lastAddedAt: number | null; lastRevokedAt: number | null; maxActive: number }

export async function allowlistSummaryImpl(ctx: Pick<QueryCtx, "db">, args: { scope: DemoGateScope }): Promise<AllowlistSummary> {
  const rows = await scopeRows(ctx, args.scope)
  const active = rows.filter((row) => row.revokedAt === undefined)
  const revoked = rows.filter((row) => row.revokedAt !== undefined)
  const latest = (values: number[]): number | null => (values.length === 0 ? null : Math.max(...values))
  return {
    active: active.length,
    revoked: revoked.length,
    lastAddedAt: latest(active.map((row) => row.addedAt)),
    lastRevokedAt: latest(revoked.map((row) => row.revokedAt ?? 0)),
    maxActive: DEMO_GATE_ALLOWLIST_MAX,
  }
}

/** L'état de la liste d'une portée : des nombres et des dates, jamais un numéro ni une empreinte. */
export const allowlistSummary = internalQuery({
  args: { scope: demoGateScopeValidator },
  returns: v.object({ active: v.number(), revoked: v.number(), lastAddedAt: v.union(v.number(), v.null()), lastRevokedAt: v.union(v.number(), v.null()), maxActive: v.number() }),
  handler: async (ctx, args) => await allowlistSummaryImpl(ctx, args),
})
