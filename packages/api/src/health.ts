import { ConvexHttpClient } from "convex/browser"

import { api } from "./engine"

/**
 * Santé FONCTIONNELLE d'une application (EX-03) : une sonde qui répond « ok » à
 * une application incapable de servir ne supervise rien (doctrine du socle).
 * « En service » veut donc dire que le moteur a VRAIMENT répondu : la sonde
 * appelle `health.ping` avec un délai borné, et ne se contente plus de savoir
 * que l'adresse du moteur est configurée.
 *
 * Le rapport ne porte aucune donnée personnelle, aucun identifiant de
 * déploiement ni aucune adresse : jamais l'URL du moteur, jamais un message
 * d'erreur (celui du client Convex peut citer l'adresse).
 */

/** Au-delà, le moteur est tenu pour muet : la sonde abandonne l'appel (plan 13, EX-03). */
export const ENGINE_PROBE_TIMEOUT_MS = 2_000
/**
 * Au-delà, le moteur a répondu, mais lentement : état dégradé, HTTP 200. `ping`
 * ne lit aucune table ; une réponse au-delà de la moitié du délai signale un
 * moteur saturé ou un réseau en difficulté. Valeur à valider par le propriétaire.
 */
export const ENGINE_SLOW_MS = 1_000
/**
 * Un résultat récent est réutilisé : une route publique ne doit pas multiplier
 * les appels au moteur (au plus une sonde toutes les cinq secondes par instance
 * du site, les requêtes simultanées partageant la même). Valeur à valider par le
 * propriétaire.
 */
export const HEALTH_REUSE_MS = 5_000

/**
 * - `reachable` : réponse valide dans le seuil de lenteur ;
 * - `slow` : réponse valide au-delà du seuil, dans le délai ;
 * - `error` : le moteur a répondu, mais pas une sonde valide (fonction en échec,
 *   moteur d'une version qui ne connaît pas la sonde, réponse hors contrat) ;
 * - `timeout` : aucune réponse dans le délai ;
 * - `unreachable` : aucune réponse (connexion refusée, nom inconnu…) ;
 * - `missing` : adresse du moteur absente de la configuration.
 */
export type EngineState = "reachable" | "slow" | "error" | "timeout" | "unreachable" | "missing"

export type EngineHealth = {
  state: EngineState
  /** Version déclarée par le moteur (`ANTSIA_ENGINE_VERSION`) ; `null` : non déclarée ou inconnue. */
  version: string | null
  /** Date du serveur du moteur (ISO 8601) au moment de la sonde. */
  serverTime: string | null
  /** Temps de réponse mesuré, en millisecondes. */
  latencyMs: number | null
}

/**
 * Rapport de CONFIGURATION, sans appel au moteur : la forme d'avant EX-03.
 * Conservé, avec `computeHealth`, pour les applications qui composent leur
 * propre sonde par-dessus (diasporale.com y ajoute sa source de données et son
 * propre état du moteur).
 */
export type HealthReport = {
  status: "ok" | "degraded"
  application: string
  /** Version du site : le commit construit (`NEXT_PUBLIC_BUILD_SHA`), ou « dev ». */
  version: string
  /** Champ conservé tel quel : les contrôles de publication le lisent (« configured »). */
  backend: "configured" | "missing"
}

/** Rapport de la sonde qui JOINT le moteur (EX-03) : la configuration, plus l'état réel du moteur. */
export type HealthProbeReport = HealthReport & { engine: EngineHealth }

export type HealthEnv = {
  NEXT_PUBLIC_CONVEX_URL?: string
  NEXT_PUBLIC_BUILD_SHA?: string
}

export type HealthProbeOptions = {
  fetch?: typeof globalThis.fetch
  now?: () => number
  timeoutMs?: number
  slowMs?: number
}

/** Même forme que la version déclarée côté moteur (`convex/health.ts`). */
const DECLARED_VERSION = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/
const LATEST_DATE_MS = 8_640_000_000_000_000

class ProbeTimeout extends Error {}

const silent = (state: EngineState): EngineHealth => ({ state, version: null, serverTime: null, latencyMs: null })

/** La réponse de `health.ping`, lue sans confiance ; `null` hors contrat. */
function readPing(value: unknown): Pick<EngineHealth, "version" | "serverTime"> | null {
  if (typeof value !== "object" || value === null) return null
  const answer = value as { status?: unknown; serverTime?: unknown; engineVersion?: unknown }
  if (answer.status !== "ok") return null
  const serverTime = typeof answer.serverTime === "number" && Number.isFinite(answer.serverTime) && Math.abs(answer.serverTime) <= LATEST_DATE_MS
    ? new Date(answer.serverTime).toISOString()
    : null
  const version = typeof answer.engineVersion === "string" && DECLARED_VERSION.test(answer.engineVersion) ? answer.engineVersion : null
  return { version, serverTime }
}

/** Un appel à `health.ping`, borné, qui ne lève jamais. */
export async function probeEngine(url: string, options: HealthProbeOptions = {}): Promise<EngineHealth> {
  const now = options.now ?? Date.now
  const baseFetch = options.fetch ?? globalThis.fetch
  const timeoutMs = options.timeoutMs ?? ENGINE_PROBE_TIMEOUT_MS
  const slowMs = options.slowMs ?? ENGINE_SLOW_MS
  const controller = new AbortController()
  let answered = false
  const boundedFetch: typeof globalThis.fetch = async (input, init) => {
    const response = await baseFetch(input, { ...init, cache: "no-store", redirect: "manual", signal: controller.signal })
    answered = true
    return response
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  const startedAt = now()
  try {
    const client = new ConvexHttpClient(url, { fetch: boundedFetch, logger: false })
    const value: unknown = await Promise.race([
      // `requestedAt` rend chaque appel unique : sans lui, Convex servirait un résultat en cache.
      client.query(api.health.ping, { requestedAt: startedAt }),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort()
          reject(new ProbeTimeout())
        }, timeoutMs)
      }),
    ])
    const latencyMs = Math.max(0, Math.round(now() - startedAt))
    const answer = readPing(value)
    if (!answer) return { ...silent("error"), latencyMs }
    return { state: latencyMs > slowMs ? "slow" : "reachable", ...answer, latencyMs }
  } catch (error) {
    if (error instanceof ProbeTimeout) return silent("timeout")
    return silent(answered ? "error" : "unreachable")
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

/** Le moteur a-t-il répondu à la sonde (vite ou lentement) ? */
export function engineAnswered(engine: EngineHealth): boolean {
  return engine.state === "reachable" || engine.state === "slow"
}

/**
 * Rapport de configuration seule : « ok » dès que l'adresse du moteur est connue.
 * Il ne prouve PAS que le moteur répond : une sonde le complète par `probeEngine`
 * (c'est ce que fait `probeHealth`) ou par son propre appel à `health.ping`.
 */
export function computeHealth(env: HealthEnv, application: string): HealthReport {
  const backend = env.NEXT_PUBLIC_CONVEX_URL ? "configured" : "missing"
  return {
    status: backend === "configured" ? "ok" : "degraded",
    application,
    version: env.NEXT_PUBLIC_BUILD_SHA ?? "dev",
    backend,
  }
}

/** Le rapport de santé d'une application : sa version, et l'état réel de son moteur. */
export async function probeHealth(env: HealthEnv, application: string, options: HealthProbeOptions = {}): Promise<HealthProbeReport> {
  const url = env.NEXT_PUBLIC_CONVEX_URL
  const engine = url ? await probeEngine(url, options) : silent("missing")
  return { ...computeHealth(env, application), status: engine.state === "reachable" ? "ok" : "degraded", engine }
}

/** 503 quand le moteur ne répond pas ; 200 quand il répond, même lentement (état `degraded`). */
export function healthHttpStatus(report: HealthProbeReport): 200 | 503 {
  return engineAnswered(report.engine) ? 200 : 503
}

/**
 * La sonde d'une application, à instancier une fois par module : un résultat de
 * moins de `reuseMs` est réutilisé, et les requêtes simultanées partagent la
 * même sonde en cours.
 */
export function createHealthProbe(application: string, options: HealthProbeOptions & { reuseMs?: number } = {}) {
  const now = options.now ?? Date.now
  const reuseMs = options.reuseMs ?? HEALTH_REUSE_MS
  let last: { key: string; at: number; report: Promise<HealthProbeReport> } | null = null
  return (env: HealthEnv): Promise<HealthProbeReport> => {
    const key = `${env.NEXT_PUBLIC_CONVEX_URL ?? ""}\n${env.NEXT_PUBLIC_BUILD_SHA ?? ""}`
    const at = now()
    if (last && last.key === key && at - last.at < reuseMs) return last.report
    const report = probeHealth(env, application, options)
    last = { key, at, report }
    return report
  }
}
