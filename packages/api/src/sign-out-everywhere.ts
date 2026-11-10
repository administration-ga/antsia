// Dupliqué de socle/packages/api/src/sign-out-everywhere.ts @ 25398f565 — adaptations : résultats Better Auth inspectés, requêtes bornées et annulables, état personnel du moteur actuel/ancien et deux clés de session de cette origine, nettoyage de l'atome et rappels locaux ; verrou partagé entre entrées du bundle jusqu'à la navigation complète ; aucun état d'un autre produit ni préférence de thème/langue effacé.
import { CROSS_DOMAIN_COOKIE_KEY, CROSS_DOMAIN_SESSION_DATA_KEY } from "./cross-domain-session-bootstrap"

/** `headers` : la langue affichée accompagne une demande de code (`Accept-Language`, composée par le moteur). */
export type AuthRequestOptions = { fetchOptions?: { throw?: boolean; signal?: AbortSignal; headers?: Record<string, string> } }

/** Contrat structurel satisfait par EngineAuthClient, injectable sans navigateur. */
export type SignOutCapableClient = {
  revokeSessions?: (options?: AuthRequestOptions) => Promise<unknown>
  signOut: (options?: AuthRequestOptions) => Promise<unknown>
  $store?: {
    atoms?: {
      session?: unknown
    }
  }
}

type SessionAtom = {
  get?: () => Record<string, unknown>
  value?: Record<string, unknown>
  set?: (value: Record<string, unknown>) => void
}

export type LocalPurgeStorage = Pick<Storage, "length" | "key" | "removeItem">

/** Réservés au moteur. Les anciens brouillons ne doivent pas être réadoptés après le départ. */
export const PERSONAL_STATE_STORAGE_PREFIXES = ["antsia:", "antia:"] as const
const AUTH_STORAGE_KEYS = [CROSS_DOMAIN_COOKIE_KEY, CROSS_DOMAIN_SESSION_DATA_KEY] as const
const REQUEST_TIMEOUT_MS = 4_000
const MAX_REQUEST_TIMEOUT_MS = 10_000

export type SignOutIssue = {
  stage: "revocation" | "signOut" | "storage" | "authState" | "reset"
  reason: "unsupported" | "rejected" | "timeout" | "requestFailed" | "cleanupFailed"
}

export type SignOutEverywhereResult = {
  serverRevoked: boolean
  localCleared: boolean
  errors: readonly SignOutIssue[]
  purged: readonly string[]
}

export type SignOutEverywhereOptions = {
  storages?: readonly LocalPurgeStorage[]
  /** Nettoyage nominal de caches/stores en mémoire ; ne doit pas lancer de requête. */
  resetLocalState?: () => void
  timeoutMs?: number
  /** Navigation complète après la purge ; le verrou reste acquis jusqu'au nouveau document. */
  navigate?: (result: SignOutEverywhereResult) => void
}

/** Fige les clés avant toute suppression : retirer une clé change les indices. */
export function personalStateKeys(storage: LocalPurgeStorage): string[] {
  const keys: string[] = []
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index)
    // Conserver uniquement les choix d'apparence et de thème du réseau (repli de
    // l'appareil hors session, relu avant l'affichage), jamais un brouillon voisin.
    const appearancePreference = key !== null && /^antsia:[a-z0-9-]+:(?:appearance|theme)$/.test(key)
    if (key && !appearancePreference && (AUTH_STORAGE_KEYS.some((authKey) => key === authKey) || PERSONAL_STATE_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix)))) keys.push(key)
  }
  return keys
}

function hasResponseError(value: unknown): boolean {
  return typeof value === "object" && value !== null && "error" in value && value.error != null
}

function revocationSucceeded(value: unknown): boolean {
  if (hasResponseError(value) || typeof value !== "object" || value === null) return false
  const data: unknown = "data" in value ? value.data : value
  return typeof data === "object" && data !== null && "status" in data && data.status === true
}

/** Timeout borné : le signal annule aussi la requête du client Better Auth. */
async function requestWithTimeout(run: (signal: AbortSignal) => Promise<unknown>, requestedTimeout: number | undefined): Promise<unknown> {
  const timeoutMs = requestedTimeout !== undefined && Number.isFinite(requestedTimeout) && requestedTimeout > 0 ? Math.min(requestedTimeout, MAX_REQUEST_TIMEOUT_MS) : REQUEST_TIMEOUT_MS
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      Promise.resolve().then(() => run(controller.signal)),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new DOMException("Authentication request timed out", "TimeoutError"))
          controller.abort()
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

function requestFailureReason(error: unknown): SignOutIssue["reason"] {
  return error instanceof Error && error.name === "TimeoutError" ? "timeout" : "requestFailed"
}

/**
 * Révoque AVANT signOut : /revoke-sessions exige encore la session courante.
 * Le nettoyage local continue même hors ligne, mais son succès ne prouve pas
 * la révocation des autres appareils. Le rappel de navigation reçoit le
 * résultat après la purge et remplace le document avant de libérer l'activité.
 */
type SignOutActivity = { count: number; pendingNavigations: number }
const SIGN_OUT_ACTIVITY_KEY = Symbol.for("antsia.signOutActivity")

function signOutActivity(): SignOutActivity {
  // Des entrées distinctes du bundler peuvent charger deux copies du module.
  // Le symbole et l'état du document restent communs ; ne pas mémoriser cette
  // référence au niveau du module, chaque opération consulte le même registre.
  const shared = globalThis as typeof globalThis & Record<symbol, SignOutActivity | undefined>
  return shared[SIGN_OUT_ACTIVITY_KEY] ??= { count: 0, pendingNavigations: 0 }
}

/** La garde réactive laisse notre propre purge terminer avant de recharger. */
export function isSigningOutEverywhere(): boolean {
  const activity = signOutActivity()
  return activity.count > 0 || activity.pendingNavigations > 0
}

export async function signOutEverywhere(client: SignOutCapableClient, options: SignOutEverywhereOptions = {}): Promise<SignOutEverywhereResult> {
  const navigate = options.navigate
  const activity = signOutActivity()
  activity.count += 1
  if (navigate) activity.pendingNavigations += 1
  let navigationStarted = false
  try {
    const result = await performSignOutEverywhere(client, options)
    if (navigate) {
      navigate(result)
      navigationStarted = true
    }
    return result
  } finally {
    const shared = signOutActivity()
    shared.count -= 1
    // Une navigation acceptée garde la sortie acquise : le nouveau document
    // repartira avec un registre vide. Un échec permet une nouvelle tentative.
    if (navigate && !navigationStarted) shared.pendingNavigations -= 1
  }
}

async function performSignOutEverywhere(client: SignOutCapableClient, options: SignOutEverywhereOptions): Promise<SignOutEverywhereResult> {
  const errors: SignOutIssue[] = []
  let serverRevoked = false
  const revokeSessions = client.revokeSessions
  if (typeof revokeSessions === "function") {
    try {
      const result = await requestWithTimeout((signal) => revokeSessions({ fetchOptions: { throw: false, signal } }), options.timeoutMs)
      serverRevoked = revocationSucceeded(result)
      if (!serverRevoked) errors.push({ stage: "revocation", reason: "rejected" })
    } catch (error) {
      errors.push({ stage: "revocation", reason: requestFailureReason(error) })
    }
  } else {
    errors.push({ stage: "revocation", reason: "unsupported" })
  }

  try {
    const result = await requestWithTimeout((signal) => client.signOut({ fetchOptions: { throw: false, signal } }), options.timeoutMs)
    // Un 401 après révocation est attendu ; il ne retire pas la preuve serveur.
    if (hasResponseError(result)) errors.push({ stage: "signOut", reason: "rejected" })
  } catch (error) {
    errors.push({ stage: "signOut", reason: requestFailureReason(error) })
  }

  let localCleared = true
  let storages = options.storages
  if (storages === undefined) {
    const available: LocalPurgeStorage[] = []
    for (const kind of ["localStorage", "sessionStorage"] as const) {
      try {
        if (typeof window !== "undefined") available.push(window[kind])
      } catch {
        localCleared = false
        errors.push({ stage: "storage", reason: "cleanupFailed" })
      }
    }
    storages = available
  }

  const purged: string[] = []
  for (const storage of storages) {
    let keys: string[]
    try {
      keys = personalStateKeys(storage)
    } catch {
      localCleared = false
      errors.push({ stage: "storage", reason: "cleanupFailed" })
      continue
    }
    for (const key of keys) {
      try {
        storage.removeItem(key)
        purged.push(key)
      } catch {
        localCleared = false
        errors.push({ stage: "storage", reason: "cleanupFailed" })
      }
    }
  }

  try {
    // Le client conserve son inférence de session ; la surface publique ne
    // l'élargit pas à un atome mutable de Record (variance de nanostores).
    const atom = client.$store?.atoms?.session as SessionAtom | undefined
    const current = atom?.get?.() ?? atom?.value ?? {}
    atom?.set?.({ ...current, data: null, error: null, isPending: false, isRefetching: false })
  } catch {
    localCleared = false
    errors.push({ stage: "authState", reason: "cleanupFailed" })
  }
  try {
    options.resetLocalState?.()
  } catch {
    localCleared = false
    errors.push({ stage: "reset", reason: "cleanupFailed" })
  }

  return { serverRevoked, localCleared, errors, purged }
}
