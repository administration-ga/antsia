// Dupliqué de socle/convex/modules/fileGuard/avProviders.ts @ ad2e7fdc2 — adaptations : FAIL-CLOSED — fournisseur absent, inconnu ou incomplet → fournisseur INDISPONIBLE (verdict `error`, fichier retenu) hors déploiement local, au lieu d'un repli silencieux sur le mock ; le mock n'est admis qu'en développement local ; commentaire « documents de l'État » ramené au moteur ; exemple d'adresse du service antivirus remplacé par son rôle (dépôt public, EX-20).
/**
 * Sentinelle fichiers — adaptateurs ANTIVIRUS (ADR-0160, D4b).
 *
 * Une interface, un adaptateur par fournisseur, la sélection par variable
 * d'environnement. Le fournisseur retenu au socle est ClamAV AUTO-HÉBERGÉ
 * derrière une petite API REST : les octets des fichiers des personnes ne
 * quittent pas l'infrastructure. Aucun service SaaS ici.
 *
 * Configuration (variables du déploiement, posées par le propriétaire) :
 *   FILE_SCAN_PROVIDER      : "clamav-rest" | "mock" (développement local seulement)
 *   FILE_SCAN_CLAMAV_URL    : URL COMPLÈTE de l'endpoint de scan
 *                             (adresse du service antivirus suivie de `/scan`)
 *   FILE_SCAN_CLAMAV_TOKEN  : secret partagé, envoyé en `Authorization: Bearer`
 *   FILE_SCAN_TIMEOUT_MS    : défaut 60 000
 *   FILE_SCAN_MAX_BYTES     : défaut 60 Mo — au-delà, `skipped`, que le
 *                             verdict rend `error` (fichier retenu, EX-17)
 *
 * Le mock n'est pas un « toujours sain » : il reconnaît la chaîne de test
 * EICAR, ce qui rend le chemin `infected` recettable sans moteur — mais il ne
 * protège de rien : il n'est servi QU'EN DÉVELOPPEMENT LOCAL. Partout ailleurs,
 * un fournisseur absent, inconnu ou incomplet est INDISPONIBLE : son verdict
 * est `error`, le fichier reste retenu, et c'est dit (`console.warn`).
 *
 * ⚠️ Le verdict d'un fournisseur en ERREUR n'est pas « sain » : il devient
 * `error` dans `decideVerdict` (fail-closed), retenté par le sweeper.
 */
import { isLocalDeployment } from "../../lib/devTools"
import { FILE_GUARD_MAX_INSPECT_BYTES } from "./policy"
import type { AvResult, AvVerdict } from "./verdict"

export interface FileScanRequest {
  bytes: Uint8Array
  filename: string
  mimeType: string
}

export interface FileScanProvider {
  readonly id: string
  scan(req: FileScanRequest): Promise<AvResult>
}

type Env = Record<string, string | undefined>

/** Chaîne de test standard de l'industrie antivirus — inoffensive. */
export const EICAR_SIGNATURE =
  "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"

function containsEicar(bytes: Uint8Array): boolean {
  const needle = Array.from(EICAR_SIGNATURE, (c) => c.charCodeAt(0))
  const end = bytes.length - needle.length
  outer: for (let i = 0; i <= end; i += 1) {
    for (let j = 0; j < needle.length; j += 1) {
      if (bytes[i + j] !== needle[j]) continue outer
    }
    return true
  }
  return false
}

export class MockFileScanProvider implements FileScanProvider {
  readonly id = "mock"
  async scan(req: FileScanRequest): Promise<AvResult> {
    const startedAt = Date.now()
    if (containsEicar(req.bytes)) {
      return {
        provider: this.id,
        verdict: "infected",
        signature: "Eicar-Test-Signature",
        durationMs: Date.now() - startedAt,
      }
    }
    return { provider: this.id, verdict: "clean", durationMs: Date.now() - startedAt }
  }
}

export interface ClamAvRestOptions {
  url: string
  token?: string
  timeoutMs: number
  maxBytes: number
  /** Injectable pour les tests. */
  fetchImpl?: typeof fetch
}

/**
 * Lit la réponse d'une API REST ClamAV. Deux dialectes courants sont
 * reconnus : `[{ Status: "OK" | "FOUND", Description }]` (clamav-rest) et
 * `{ data: { result: [{ is_infected, viruses }] } }` (clamav-rest-api). Une
 * réponse texte est jugée sur les mots `FOUND` / `OK` de clamdscan.
 */
export function parseClamAvResponse(
  body: string
): { verdict: AvVerdict; signature?: string; detail?: string } {
  const trimmed = body.trim()
  if (trimmed.length === 0) return { verdict: "error", detail: "réponse vide" }
  try {
    const parsed: unknown = JSON.parse(trimmed)
    const found = findVerdict(parsed)
    if (found) return found
    return { verdict: "error", detail: "réponse JSON sans verdict" }
  } catch {
    if (/\bFOUND\b/.test(trimmed)) {
      const signature = /:\s*([^\s:]+)\s+FOUND/.exec(trimmed)?.[1]
      return { verdict: "infected", signature }
    }
    if (/\bOK\b/.test(trimmed)) return { verdict: "clean" }
    return { verdict: "error", detail: trimmed.slice(0, 120) }
  }
}

function findVerdict(
  node: unknown
): { verdict: AvVerdict; signature?: string } | null {
  if (Array.isArray(node)) {
    let sawClean = false
    for (const item of node) {
      const inner = findVerdict(item)
      if (inner?.verdict === "infected") return inner
      if (inner?.verdict === "clean") sawClean = true
    }
    return sawClean ? { verdict: "clean" } : null
  }
  if (!node || typeof node !== "object") return null
  const record = node as Record<string, unknown>
  if (typeof record.Status === "string") {
    if (/^FOUND$/i.test(record.Status)) {
      const description =
        typeof record.Description === "string" ? record.Description : undefined
      return { verdict: "infected", signature: description }
    }
    if (/^OK$/i.test(record.Status)) return { verdict: "clean" }
    return { verdict: "error" }
  }
  if (typeof record.is_infected === "boolean") {
    if (record.is_infected) {
      const viruses = Array.isArray(record.viruses)
        ? record.viruses.filter((x): x is string => typeof x === "string")
        : []
      return { verdict: "infected", signature: viruses[0] }
    }
    return { verdict: "clean" }
  }
  for (const value of Object.values(record)) {
    const inner = findVerdict(value)
    if (inner) return inner
  }
  return null
}

export class ClamAvRestProvider implements FileScanProvider {
  readonly id = "clamav-rest"
  constructor(private readonly options: ClamAvRestOptions) {}

  async scan(req: FileScanRequest): Promise<AvResult> {
    const startedAt = Date.now()
    if (req.bytes.length > this.options.maxBytes) {
      return {
        provider: this.id,
        verdict: "skipped",
        detail: "too_large",
        durationMs: 0,
      }
    }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs)
    try {
      const form = new FormData()
      form.append(
        "FILES",
        new Blob([req.bytes as BlobPart], { type: req.mimeType || "application/octet-stream" }),
        req.filename || "fichier"
      )
      const headers: Record<string, string> = {}
      if (this.options.token) headers.Authorization = `Bearer ${this.options.token}`
      const doFetch = this.options.fetchImpl ?? fetch
      const response = await doFetch(this.options.url, {
        method: "POST",
        headers,
        body: form,
        signal: controller.signal,
      })
      const body = await response.text()
      if (!response.ok) {
        return {
          provider: this.id,
          verdict: "error",
          detail: `HTTP ${response.status}`,
          durationMs: Date.now() - startedAt,
        }
      }
      const parsed = parseClamAvResponse(body)
      return {
        provider: this.id,
        verdict: parsed.verdict,
        signature: parsed.signature,
        detail: parsed.detail,
        durationMs: Date.now() - startedAt,
      }
    } catch (err) {
      return {
        provider: this.id,
        verdict: "error",
        detail: err instanceof Error ? err.message.slice(0, 160) : String(err),
        durationMs: Date.now() - startedAt,
      }
    } finally {
      clearTimeout(timer)
    }
  }
}

/**
 * Fournisseur INDISPONIBLE : aucun antivirus configuré hors développement.
 * Son verdict est `error` — jamais `clean` : un fichier que personne n'a
 * analysé reste retenu (fail-closed), puis retenté par le balayeur.
 */
export class UnavailableFileScanProvider implements FileScanProvider {
  readonly id = "unavailable"
  constructor(private readonly reason: string) {}
  async scan(): Promise<AvResult> {
    return { provider: this.id, verdict: "error", detail: this.reason, durationMs: 0 }
  }
}

function positiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback
}

export function getFileScanProvider(env: Env = process.env): FileScanProvider {
  const local = isLocalDeployment(env)
  const providerId = (env.FILE_SCAN_PROVIDER ?? (local ? "mock" : "")).trim().toLowerCase()
  switch (providerId) {
    case "mock":
      if (local) return new MockFileScanProvider()
      console.warn("[files] FILE_SCAN_PROVIDER=mock hors développement local — fournisseur indisponible.")
      return new UnavailableFileScanProvider("provider_mock_outside_local")
    case "": {
      console.warn("[files] Aucun antivirus configuré (FILE_SCAN_PROVIDER) — fournisseur indisponible.")
      return new UnavailableFileScanProvider("provider_unconfigured")
    }
    case "clamav-rest": {
      const url = env.FILE_SCAN_CLAMAV_URL?.trim()
      if (!url) {
        console.warn("[files] FILE_SCAN_PROVIDER=clamav-rest sans FILE_SCAN_CLAMAV_URL — fournisseur indisponible.")
        return new UnavailableFileScanProvider("provider_incomplete")
      }
      return new ClamAvRestProvider({
        url,
        token: env.FILE_SCAN_CLAMAV_TOKEN?.trim() || undefined,
        timeoutMs: positiveInt(env.FILE_SCAN_TIMEOUT_MS, 60_000),
        maxBytes: positiveInt(env.FILE_SCAN_MAX_BYTES, FILE_GUARD_MAX_INSPECT_BYTES),
      })
    }
    default:
      console.warn(`[files] Fournisseur inconnu "${providerId}" — fournisseur indisponible.`)
      return new UnavailableFileScanProvider("provider_unknown")
  }
}
