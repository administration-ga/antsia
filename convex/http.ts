// Dupliqué de socle/convex/http.ts (l. 120-180, 235-238, 243-385 et 1274-1444) @ ad2e7fdc2 — adaptations : routes d'authentification et webhook Egress LiveKit seulement (les autres routes du socle sont administratives) ; liste blanche CORS = origines de confiance du moteur, en-têtes exposés `Set-Better-Auth-Cookie` et `Retry-After` (EA-08, issue #151) ; contournement `mode` partagé avec `betterAuth/auth.ts` ; journalisation d'une erreur 500 sans écriture en base ; webhook Egress (`POST /webhooks/livekit-egress`) : PROPRIÉTÉ LIMITÉE AU DIRECT (`lib/livekitEgressWebhook`, seul propriétaire d'un egress dans le moteur), jeton vérifié par l'action Node du direct (`modules/live/egressActions.verifyEgressWebhook`), état de capture vers `modules/live/replay.markEgressState`, rapatriement planifié vers `modules/live/egressActions.ingestEgressFile` (ni début de capture ni taille : fusion iRéunion exclue), statut lu dans le module pur du domaine, comparaison à temps constant tirée de `lib/livekitEgressWebhook`.
/**
 * Routes HTTP du moteur.
 *
 * Better Auth est monté À LA MAIN plutôt que par `authComponent.registerRoutes`
 * pour passer l'origine de la requête à `createAuth` : le greffon `crossDomain`
 * renvoie ainsi chaque application vers elle-même.
 *
 * Le webhook Egress LiveKit (`/webhooks/livekit-egress`) ramène les
 * rediffusions des directs (module `live`).
 */
import { directEgressOutcomeFromStatus } from "@antsia/social-domain/live/replayComposition"
import { httpRouter } from "convex/server"

import { inbox as federationInbox } from "./modules/federation/http"
import { media as catalogueMedia } from "./modules/federation/commerceCatalogMediaHttp"
import { transfer as agentConsentTransfer, AGENT_CONSENT_TRANSFER_PATH } from "./modules/federation/agentConsentTransfer"
import { internal } from "./_generated/api"
import { httpAction } from "./_generated/server"
import { createAuth, trustedOrigins } from "./betterAuth/auth"
import {
  completeEgressForOwners,
  egressEndedNeedsFile,
  findEgressOwners,
  isHandledEgressEvent,
  type LiveKitEgressInfoJson,
  planEgressEnded,
  timingSafeEqual,
} from "./lib/livekitEgressWebhook"

const http = httpRouter()

// P09 : URL de copie locale, droits et scan relus à chaque lecture, sans cache public.
http.route({ pathPrefix: "/catalogue/media/", method: "GET", handler: catalogueMedia })

const AUTH_PATH = "/api/auth"

/** En-têtes CORS pour une origine de confiance seulement ; une inconnue n'en reçoit aucun. */
function buildCorsHeaders(requestOrigin: string | null): Record<string, string> {
  const origin = requestOrigin ?? ""
  if (!trustedOrigins().includes(origin)) return {}
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    // Le greffon crossDomain transporte la session dans `Set-Better-Auth-Cookie` : un
    // client hors origine ne le lit pas sans cette exposition. `Retry-After` (EA-08,
    // issue #151) : le délai restant d'un refus de débit, lisible de même.
    "Access-Control-Expose-Headers": "Set-Better-Auth-Cookie, Retry-After",
  }
}

function buildPreflightHeaders(requestOrigin: string | null): Record<string, string> {
  const cors = buildCorsHeaders(requestOrigin)
  if (!cors["Access-Control-Allow-Origin"]) return {}
  return {
    ...cors,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    // `Better-Auth-Cookie` : envoyé par le client crossDomain sur CHAQUE requête.
    "Access-Control-Allow-Headers": "Authorization, Content-Type, Better-Auth-Cookie",
    "Access-Control-Max-Age": "86400",
  }
}

/**
 * Better Auth ne pose aucun en-tête CORS : on recopie la réponse avec ceux de la
 * liste blanche (les en-têtes d'une redirection sont immuables, d'où la copie).
 */
function withCorsHeaders(response: Response, origin: string | null): Response {
  const cors = buildCorsHeaders(origin)
  if (!cors["Access-Control-Allow-Origin"]) return response
  const headers = new Headers(response.headers)
  for (const [name, value] of Object.entries(cors)) headers.set(name, value)
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

// Découverte OIDC (validation des JWT Convex).
http.route({
  path: "/.well-known/openid-configuration",
  method: "GET",
  handler: httpAction(async () => Response.redirect(`${process.env.CONVEX_SITE_URL}${AUTH_PATH}/convex/.well-known/openid-configuration`)),
})

type HttpCtx = Parameters<Parameters<typeof httpAction>[0]>[0]

async function forwardToBetterAuth(ctx: HttpCtx, request: Request): Promise<Response> {
  const origin = request.headers.get("origin")
  const auth = createAuth(ctx, origin)
  const response = await auth.handler(request)
  if (response.status === 500) {
    console.error("[BetterAuth] 500", await response.clone().text())
  }
  return withCorsHeaders(response, origin)
}

const authRequestHandler = httpAction(forwardToBetterAuth)

// Passage par one-time-token : la version du greffon crossDomain n'enregistre pas
// `/cross-domain/one-time-token/verify` ; l'endpoint natif du greffon
// oneTimeToken lit la même clé. Route exacte → prioritaire sur le préfixe.
http.route({
  path: `${AUTH_PATH}/cross-domain/one-time-token/verify`,
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url)
    url.pathname = `${AUTH_PATH}/one-time-token/verify`
    const rewritten = new Request(url.toString(), { method: "POST", headers: request.headers, body: await request.arrayBuffer() })
    return forwardToBetterAuth(ctx, rewritten)
  }),
})

http.route({ pathPrefix: `${AUTH_PATH}/`, method: "GET", handler: authRequestHandler })
http.route({ pathPrefix: `${AUTH_PATH}/`, method: "POST", handler: authRequestHandler })
http.route({
  pathPrefix: `${AUTH_PATH}/`,
  method: "OPTIONS",
  handler: httpAction(async (_ctx, request) => new Response(null, { status: 204, headers: buildPreflightHeaders(request.headers.get("origin")) })),
})

// ============================================================================
// Webhook Egress LiveKit — la rediffusion des directs
// ============================================================================
// Reçoit les callbacks de LiveKit quand un egress (la capture d'un direct)
// change d'état ou se termine. Le filepath encode le traitement
// (`lib/livekitEgressRouting.ts`).
//
// ⚠️ CORRECTIF DU 2026-09-17 (socle) — trois défauts, tous du même webhook :
//
//  · AUTHENTIFICATION. LiveKit n'envoie pas de secret fixe : il envoie un JWT
//    signé avec la clé d'API, dont le claim `sha256` est l'empreinte du corps.
//    La vérification passe par `WebhookReceiver`, dans une action Node
//    (`modules/live/egressActions.verifyEgressWebhook`) : le SDK ne se bundle
//    pas dans ce runtime (`node:crypto`). Le secret fixe d'un relais
//    (`LIVEKIT_WEBHOOK_SECRET`) reste accepté s'il est posé, sans être requis.
//  · UNE VM, PLUSIEURS DÉPLOIEMENTS. Chacun reçoit les événements des autres.
//    La propriété de l'egress est vérifiée AVANT tout effet
//    (`lib/livekitEgressWebhook.findEgressOwners`) : un egress inconnu rend
//    200, sans téléchargement, écriture ni journal.
//  · MÉMOIRE. Le fichier n'est jamais téléchargé ici (runtime à 64 MiB) : il
//    est rapatrié en flux par une action Node planifiée
//    (`modules/live/egressActions.ingestEgressFile`) — LiveKit reçoit son 200
//    sans attendre la fin du transfert.
// ============================================================================

/** Validation taille payload — protection anti-DoS. */
function isPayloadTooLarge(request: Request, maxBytes = 50_000): boolean {
  const contentLength = request.headers.get("content-length")
  return !!contentLength && parseInt(contentLength, 10) > maxBytes
}

/** Au-delà, le corps ne peut pas être un événement LiveKit (et une action Node refuse > 5 MiB d'arguments). */
const LIVEKIT_EGRESS_WEBHOOK_MAX_BYTES = 2_000_000

function livekitEgressJson(payload: Record<string, unknown>): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}

http.route({
  path: "/webhooks/livekit-egress",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (isPayloadTooLarge(request, LIVEKIT_EGRESS_WEBHOOK_MAX_BYTES)) {
      return new Response("Payload too large", { status: 413 })
    }

    const rawBody = await request.text()
    // `content-length` peut manquer (transfert fragmenté) : la borne se
    // revérifie sur ce qui a réellement été lu.
    if (rawBody.length > LIVEKIT_EGRESS_WEBHOOK_MAX_BYTES) {
      return new Response("Payload too large", { status: 413 })
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(rawBody)
    } catch {
      return new Response("Invalid JSON", { status: 400 })
    }
    if (typeof parsed !== "object" || parsed === null) {
      return new Response("Invalid JSON", { status: 400 })
    }
    const event = parsed as { event?: unknown; egressInfo?: LiveKitEgressInfoJson }

    // Salles, participants, pistes… : ce webhook n'en fait rien. Absorbés tout
    // de suite, sans authentification (rien n'en découle) — les vérifier
    // coûterait un aller-retour Node par arrivée de participant.
    if (!isHandledEgressEvent(event.event)) {
      return livekitEgressJson({ ok: true, ignored: true })
    }

    // ── Authentification, AVANT tout effet ──────────────────────────────────
    const authorization = request.headers.get("authorization") ?? ""
    const legacySecret = process.env.LIVEKIT_WEBHOOK_SECRET?.trim()
    const presented = authorization.replace(/^Bearer\s+/i, "").trim()
    // Compatibilité : un relais qui présenterait le secret fixe.
    // Comparaison à temps constant ; jamais requis.
    const legacyMatch = legacySecret !== undefined && legacySecret.length > 0 && presented.length > 0 && timingSafeEqual(presented, legacySecret)
    if (!legacyMatch) {
      const verdict = await ctx.runAction(internal.modules.live.egressActions.verifyEgressWebhook, { body: rawBody, authorization })
      if (!verdict.configured) {
        return new Response("Webhook disabled", { status: 503 })
      }
      if (!verdict.valid) {
        return new Response("Unauthorized", { status: 401 })
      }
    }

    if (event.event === "egress_started" || event.event === "egress_updated") {
      /**
       * ⚠️ D-12 / lot 10B — CES DEUX ÉVÉNEMENTS ÉTAIENT JETÉS. `egress_ended`
       * était l'unique source d'état : « LiveKit enregistre » n'existait dans
       * aucun modèle, et l'hôte d'un direct ne savait pas si sa conférence
       * était réellement captée.
       *
       * `markEgressState` résout par l'index `by_egressId` de `liveSessions`
       * et ABSORBE tout identifiant qui n'est pas à lui. Un 500 ici serait
       * rejoué en boucle par LiveKit.
       *
       * ⚠️ On n'écrit QUE sur `EGRESS_ACTIVE`. `EGRESS_STARTING` n'est pas
       * encore une capture (« demandé » le dit déjà) et `EGRESS_ENDING` n'en
       * est plus une — écrire « en cours » sur l'un ou l'autre serait affirmer
       * le faux, et réveiller au passage toutes les souscriptions de la salle.
       */
      const activeId = event.egressInfo?.egressId
      if (activeId && directEgressOutcomeFromStatus(event.egressInfo?.status).kind === "active") {
        await ctx.runMutation(internal.modules.live.replay.markEgressState, { egressId: activeId, state: "active" })
      }
      return livekitEgressJson({ ok: true, observed: true })
    }

    // ── egress_ended ─────────────────────────────────────────────────────────
    const info = event.egressInfo
    if (!info?.egressId) {
      return new Response("Missing egressId", { status: 400 })
    }
    const plan = planEgressEnded({ ...info, egressId: info.egressId })

    // À QUI est cet egress ? Vide = un autre déploiement de la VM (ou une ligne
    // purgée) : 200, et rien d'autre — ni téléchargement, ni écriture, ni journal.
    const owners = await findEgressOwners(ctx, plan.route, plan.egressId)
    if (owners.length === 0) {
      return livekitEgressJson({ ok: true, ignored: true })
    }

    if (egressEndedNeedsFile(plan)) {
      // Le fichier se rapatrie EN FLUX, hors de ce runtime à 64 MiB ; la
      // complétion suit dans l'action, avec les mêmes arguments qu'ici.
      await ctx.scheduler.runAfter(0, internal.modules.live.egressActions.ingestEgressFile, {
        route: plan.route,
        egressId: plan.egressId,
        filepath: plan.filepath,
        location: plan.location,
        ...(plan.durationMs !== undefined ? { durationMs: plan.durationMs } : {}),
      })
      return livekitEgressJson({ ok: true, ingest: "scheduled" })
    }

    // Sans fichier à rapatrier (échec déclaré, egress sans emplacement) : la
    // complétion part tout de suite, chez son propriétaire — avec le motif
    // NOMMÉ de LiveKit (`EGRESS_FAILED`, `ABORTED`, `LIMIT_REACHED`), un code.
    await completeEgressForOwners(ctx, owners, plan)
    return livekitEgressJson({ ok: true })
  }),
})

http.route({ path: "/federation/inbox", method: "POST", handler: federationInbox })
http.route({ path: AGENT_CONSENT_TRANSFER_PATH, method: "POST", handler: agentConsentTransfer })

export default http
