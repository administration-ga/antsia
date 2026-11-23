// Dupliqué de socle/convex/modules/demoAccess/accessNode.ts (avec socle/convex/http.ts, l. 395-560) @ 1379d45f9 — adaptations : actions HTTP du moteur au lieu d'une action Node (Web Crypto, aucun `"use node"`) ; numéro E.164 au lieu d'adresse, envoi WhatsApp neutre (`lib/whatsappDelivery`) au lieu de Resend ; code « 6 chiffres + 1 lettre » tiré par réjection ; admissions nominatives `admitRequest` / `admitVerify` (cliquet `rate-limited-writes`) ; portée dans le corps ; état de la porte (404 fermée ou non armée, 503 indisponible) ; durée plancher des réponses (quatre secondes pour une demande admise, au-delà du délai d'envoi de trois secondes : CH-817 E5) ; refus de débit de l'adresse visible et immédiat (429) ; corps borné et `Content-Type` JSON exigé ; CORS des origines de confiance (`lib/httpCors`) ; refus sans détail.
/**
 * Les deux routes de la porte des comptes de démonstration (CH-817), inscrites dans `convex/http.ts`.
 *
 * `POST /demo-gate/request` `{ scope, phone, locale }` → 202 `{ ok, challengeId, expiresInSeconds }`,
 * IDENTIQUE pour un numéro autorisé, refusé ou limité (l'identifiant d'un refus est un leurre jamais
 * enregistré), après une durée plancher de QUATRE secondes : l'envoi est borné à trois
 * (`WHATSAPP_TIMEOUT_MS`), un fournisseur lent ne se voit donc pas au chronomètre (CH-817 E5,
 * constat 3). 429 `rate_limited` avec `retryAfterMs` et `Retry-After`, aussitôt et sans plancher,
 * quand l'ADRESSE a épuisé son seau : ce refus ne dépend pas du numéro (constat 5). 400 pour une
 * demande mal formée (le format est public : il n'apprend rien de la liste).
 *
 * `POST /demo-gate/verify` `{ scope, challengeId, code }` → 200 `{ ok, token, expiresAt }`, ou 401
 * `invalid_or_expired` (code faux, défi inconnu, leurre, expiré, épuisé : une seule réponse), ou 429
 * `rate_limited` avec `retryAfterMs` et `Retry-After`, aussitôt (seau de l'adresse). Durée plancher
 * d'une seconde, pour qu'un défi réel ne se distingue pas d'un leurre au temps de réponse.
 *
 * Porte `closed` ou `open` : 404 (rien à ouvrir) ; `unavailable` : 503 pour tous.
 *
 * Pourquoi des actions HTTP : une écriture publique sans session est interdite par le cliquet
 * `rate-limited-writes`, sauf action HTTP à admission NOMINATIVE (`SYSTEM_HTTP_ADMISSIONS`) : la
 * première écriture de chaque route est sa mutation d'admission. Le tirage du code et des
 * identifiants se fait ICI (aléa réel), jamais dans une mutation (aléa rejoué).
 *
 * Rien au journal que la raison d'un envoi manqué ; jamais un numéro, un code ni un jeton.
 */
import {
  DEMO_GATE_CHALLENGE_ID_PATTERN,
  type DemoGateRefusal,
  type DemoGateRequestAccepted,
  type DemoGateScope,
  type DemoGateVerified,
  generateDemoGateCode,
  isDemoGateLocale,
  isDemoGateScope,
  normalizeDemoGateCode,
  normalizeDemoGatePhone,
} from "@antsia/social-contracts/demoGate"

import { internal } from "../../_generated/api"
import { httpAction } from "../../_generated/server"
import { OTP_TTL_SECONDS } from "../../betterAuth/settings"
import { demoGateCodeMaterial, demoGateDigest, demoGateSecret, demoGateState, digestsEqual, randomOpaqueId } from "../../lib/demoGate"
import { getClientAddressKey } from "../../lib/httpAddress"
import { buildCorsHeaders, buildPreflightHeaders } from "../../lib/httpCors"
import { sendWhatsAppOtp, type WhatsAppConfiguration, whatsappConfiguration } from "../../lib/whatsappDelivery"

/**
 * Durée plancher d'une demande admise : l'envoi d'un vrai code ne se voit pas au chronomètre. Au moins
 * le délai d'envoi plus une seconde de marge (`WHATSAPP_TIMEOUT_MS + 1_000`, test statique).
 */
export const DEMO_GATE_REQUEST_FLOOR_MS = 4_000
/** Durée plancher d'une vérification (hors refus de débit) : un défi réel ne se distingue pas d'un leurre. */
export const DEMO_GATE_VERIFY_FLOOR_MS = 1_000
/** Un corps de la porte tient en quelques dizaines d'octets ; au-delà, il est refusé. */
const BODY_MAX_BYTES = 1_024

type HttpCtx = Parameters<Parameters<typeof httpAction>[0]>[0]

function reply(request: Request, status: number, body: DemoGateRequestAccepted | DemoGateVerified | DemoGateRefusal, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...buildCorsHeaders(request.headers.get("origin")), ...extraHeaders },
  })
}

function refusal(request: Request, status: 400 | 401 | 404 | 503): Response {
  const error = { 400: "invalid_request", 401: "invalid_or_expired", 404: "not_found", 503: "unavailable" } as const
  return reply(request, status, { ok: false, error: error[status] })
}

/** Le refus de débit de l'adresse : 429, le délai restant dans le corps et en `Retry-After` (secondes entières). */
function rateLimited(request: Request, retryAfterMs: number): Response {
  const delayMs = Number.isFinite(retryAfterMs) && retryAfterMs > 0 ? Math.ceil(retryAfterMs) : 0
  return reply(request, 429, { ok: false, error: "rate_limited", retryAfterMs: delayMs }, { "Retry-After": String(Math.max(1, Math.ceil(delayMs / 1_000))) })
}

/** Attend jusqu'à l'échéance (aucune attente si elle est passée). */
async function waitUntil(deadline: number): Promise<void> {
  const remaining = deadline - Date.now()
  if (remaining > 0) await new Promise<void>((resolve) => setTimeout(resolve, remaining))
}

/**
 * Le corps JSON d'une requête de la porte : un objet, lu en flux jusqu'à `BODY_MAX_BYTES` même sans
 * `Content-Length`, avec `Content-Type: application/json` exigé (un navigateur pose alors une
 * pré-vérification CORS : une page étrangère ne peut pas faire envoyer de requête « simple »). `null`
 * pour tout le reste.
 */
async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return null
  const length = request.headers.get("content-length")
  if (length && (!/^[0-9]+$/u.test(length) || Number(length) > BODY_MAX_BYTES)) return null
  if (!request.body) return null
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      size += chunk.value.byteLength
      if (size > BODY_MAX_BYTES) { await reader.cancel(); return null }
      chunks.push(chunk.value)
    }
  } catch { return null } finally { reader.releaseLock() }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  try {
    const parsed: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes))
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null
  } catch { return null }
}

/** La pré-vérification CORS des deux routes (en-têtes pour une origine de confiance seulement). */
export function demoGatePreflight(request: Request): Response {
  return new Response(null, { status: 204, headers: buildPreflightHeaders(request.headers.get("origin")) })
}

/**
 * Envoie le code ; un envoi qui n'est pas admis par le fournisseur invalide le défi. Aucune erreur
 * ne remonte : la réponse de la route ne doit pas dire qu'un numéro de la liste a été servi.
 */
async function deliverOrInvalidate(ctx: HttpCtx, message: { phone: string; code: string; locale: "fr" | "en"; challengeId: string }, whatsapp: WhatsAppConfiguration): Promise<void> {
  try {
    const delivery = await sendWhatsAppOtp({ to: message.phone, code: message.code, locale: message.locale, ttlMinutes: Math.max(1, Math.floor(OTP_TTL_SECONDS / 60)) }, whatsapp, fetch)
    if (delivery.status === "accepted") return
    // La raison seule : ni numéro, ni code, ni réponse du fournisseur.
    console.warn(`[demo-gate] envoi WhatsApp non abouti : ${delivery.reason}`)
  } catch {
    console.warn("[demo-gate] envoi WhatsApp non abouti : unreachable")
  }
  try {
    await ctx.runMutation(internal.modules.platform.demoGate.markDeliveryFailed, { challengeId: message.challengeId })
  } catch {
    // Un défi resté actif sans code reçu ne s'ouvre pas : personne ne connaît son code. Il expire seul.
  }
}

type AdmittedRequest = { status: "limited"; retryAfterMs: number } | { status: "decided"; deliver: boolean }

/** `POST /demo-gate/request` — demander un code (voir l'en-tête). */
export const requestCode = httpAction(async (ctx, request) => {
  const startedAt = Date.now()
  const state = demoGateState()
  if (state === "closed" || state === "open") return refusal(request, 404)
  const secret = demoGateSecret()
  const whatsapp = whatsappConfiguration()
  if (state !== "gated" || secret === null || whatsapp === null) return refusal(request, 503)
  const body = await readJsonObject(request)
  const phone = normalizeDemoGatePhone(body?.phone)
  const scope = body?.scope
  const locale = body?.locale
  if (phone === null || !isDemoGateScope(scope) || !isDemoGateLocale(locale)) return refusal(request, 400)
  // Tirés ici, dans tous les cas : un refus rend un identifiant de même forme, jamais enregistré.
  const challengeId = randomOpaqueId(24)
  const code = generateDemoGateCode()
  const phoneHash = await demoGateDigest(secret, "demo-gate-phone", phone)
  const ipKeyHash = await demoGateDigest(secret, "demo-gate-ip", getClientAddressKey(request))
  const codeDigest = await demoGateDigest(secret, "demo-gate-code", demoGateCodeMaterial(challengeId, phoneHash, code))
  const accepted: DemoGateRequestAccepted = { ok: true, challengeId, expiresInSeconds: OTP_TTL_SECONDS }
  try {
    const admitted: AdmittedRequest = await ctx.runMutation(internal.modules.platform.demoGate.admitRequest, { scope, phoneHash, ipKeyHash, challengeId, codeDigest })
    // Adresse limitée : refus visible, sans plancher (il ne dépend pas du numéro).
    if (admitted.status === "limited") return rateLimited(request, admitted.retryAfterMs)
    if (admitted.deliver) await deliverOrInvalidate(ctx, { phone, code, locale, challengeId }, whatsapp)
    await waitUntil(startedAt + DEMO_GATE_REQUEST_FLOOR_MS)
    return reply(request, 202, accepted)
  } catch {
    await waitUntil(startedAt + DEMO_GATE_REQUEST_FLOOR_MS)
    return refusal(request, 503)
  }
})

type AdmittedVerify = { status: "limited"; retryAfterMs: number } | { status: "unknown" } | { status: "open"; phoneHash: string; codeDigest: string }

/** Compare le code et consomme l'essai ; rend la session ouverte, ou `null`. */
async function completeAttempt(ctx: HttpCtx, secret: string, attempt: { scope: DemoGateScope; challengeId: string; code: string; phoneHash: string; codeDigest: string }): Promise<DemoGateVerified | null> {
  const candidate = await demoGateDigest(secret, "demo-gate-code", demoGateCodeMaterial(attempt.challengeId, attempt.phoneHash, attempt.code))
  // Le jeton en clair ne franchit jamais la frontière du stockage : seule son empreinte.
  const token = randomOpaqueId(32)
  const tokenDigest = await demoGateDigest(secret, "demo-gate-session", token)
  const completed: { ok: true; expiresAt: number } | { ok: false } = await ctx.runMutation(internal.modules.platform.demoGate.completeVerify, {
    scope: attempt.scope,
    challengeId: attempt.challengeId,
    expectedCodeDigest: attempt.codeDigest,
    codeMatches: digestsEqual(candidate, attempt.codeDigest),
    tokenDigest,
  })
  return completed.ok ? { ok: true, token, expiresAt: completed.expiresAt } : null
}

/** `POST /demo-gate/verify` — échanger le code contre une session (voir l'en-tête). */
export const verifyCode = httpAction(async (ctx, request) => {
  const startedAt = Date.now()
  const state = demoGateState()
  if (state === "closed" || state === "open") return refusal(request, 404)
  const secret = demoGateSecret()
  if (state !== "gated" || secret === null) return refusal(request, 503)
  const body = await readJsonObject(request)
  const scope = body?.scope
  const challengeId = body?.challengeId
  const code = normalizeDemoGateCode(body?.code)
  if (code === null || !isDemoGateScope(scope) || typeof challengeId !== "string" || !DEMO_GATE_CHALLENGE_ID_PATTERN.test(challengeId)) return refusal(request, 400)
  const ipKeyHash = await demoGateDigest(secret, "demo-gate-ip", getClientAddressKey(request))
  try {
    const admitted: AdmittedVerify = await ctx.runMutation(internal.modules.platform.demoGate.admitVerify, { scope, challengeId, ipKeyHash })
    if (admitted.status === "limited") return rateLimited(request, admitted.retryAfterMs)
    const verified = admitted.status === "open" ? await completeAttempt(ctx, secret, { scope, challengeId, code, phoneHash: admitted.phoneHash, codeDigest: admitted.codeDigest }) : null
    await waitUntil(startedAt + DEMO_GATE_VERIFY_FLOOR_MS)
    return verified ? reply(request, 200, verified) : refusal(request, 401)
  } catch {
    await waitUntil(startedAt + DEMO_GATE_VERIFY_FLOOR_MS)
    return refusal(request, 503)
  }
})
