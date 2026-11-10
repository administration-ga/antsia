/** P17b : une seule preuve bearer par serveur, aucune session ni donnée sociale persistée. */
import * as SecureStore from "expo-secure-store"

const STORAGE_TIMEOUT_MS = 4_000
const MAX_PENDING_OPERATIONS = 16
const TOKEN_MAX_LENGTH = 1_024

/** L'origine déployée est injectée ; aucun secret, schéma OAuth ou backend voisin. */
export function nativeAuthBaseURL(baseURL: string): string {
  if (baseURL.length > 512) throw new Error("nativeAuthConfigurationInvalid")
  let url: URL
  try { url = new URL(baseURL) } catch { throw new Error("nativeAuthConfigurationInvalid") }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && local)) || url.username || url.password || url.search || url.hash ||
    !["/", "/api/auth", "/api/auth/"].includes(url.pathname)) throw new Error("nativeAuthConfigurationInvalid")
  return `${url.origin}/api/auth`
}

/** Encodage injectif du point d'entrée canonique, alphabet admis par SecureStore. */
export function nativeCredentialKey(baseURL: string): string {
  const endpoint = nativeAuthBaseURL(baseURL)
  return `antsia.native.auth.v1.${Array.from(endpoint, character => character.charCodeAt(0).toString(16).padStart(4, "0")).join("")}.token`
}

export type NativeCredentialStorage = {
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
  removeItem(key: string): Promise<void>
}

export type SessionCredentialSnapshot = Readonly<{ ready: boolean; hasCredential: boolean; generation: number; failed: boolean }>

export interface SessionCredentialVault {
  readonly baseURL: string
  readonly ready: boolean
  readonly hasCredential: boolean
  readonly generation: number
  readonly failed: boolean
  snapshot(): SessionCredentialSnapshot
  subscribe(listener: () => void): () => void
  readToken(): Promise<string | null>
  /** Appelé au geste de vérification OTP, après initialisation, jamais par un effet/cron. */
  beginLogin(): number
  loginGeneration(): number | null
  /** Ferme les réponses précédentes, conserve la preuve actuelle pour la révocation serveur. */
  fence(): void
  /** Masque immédiatement la preuve, puis attend sa suppression sérialisée. */
  clear(): Promise<void>
  /** Réservé au succès OTP du client : ni corps de réponse ni cookie ne sont une preuve. */
  captureToken(token: string, generation: number): Promise<boolean>
}

function validToken(value: unknown): value is string {
  return typeof value === "string" && value.length >= 16 && value.length <= TOKEN_MAX_LENGTH && /^[A-Za-z0-9._~%+=/-]+$/u.test(value)
}

const secureStorage: NativeCredentialStorage = {
  getItem: key => SecureStore.getItemAsync(key, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }),
  setItem: (key, value) => SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }),
  removeItem: key => SecureStore.deleteItemAsync(key, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }),
}
// Un remontage React ne crée pas une deuxième file capable de dépasser la purge précédente.
const nativeVaults = new Map<string, SessionCredentialVault>()

export function createNativeCredentialVault(baseURL: string, storage: NativeCredentialStorage = secureStorage): SessionCredentialVault {
  const endpoint = nativeAuthBaseURL(baseURL), key = nativeCredentialKey(endpoint)
  if (storage === secureStorage) {
    const existing = nativeVaults.get(endpoint)
    if (existing) return existing
    if (nativeVaults.size >= 8) throw new Error("nativeAuthConfigurationInvalid")
  }
  let state: SessionCredentialSnapshot = Object.freeze({ ready: false, hasCredential: false, generation: 0, failed: false })
  let activeLogin: number | null = null
  let clearing = false
  let clearPromise: Promise<void> | null = null
  let pending = 0
  let tail: Promise<unknown> = Promise.resolve()
  const listeners = new Set<() => void>()

  function update(patch: Partial<SessionCredentialSnapshot>): void {
    const next = { ...state, ...patch }
    if (next.ready === state.ready && next.hasCredential === state.hasCredential && next.generation === state.generation && next.failed === state.failed) return
    state = Object.freeze(next)
    for (const listener of listeners) listener()
  }
  function failClosed(): Error {
    activeLogin = null
    update({ ready: true, hasCredential: false, failed: true })
    return new Error("nativeCredentialStorageUnavailable")
  }

  /**
   * Le délai borne l'attente publique, PAS la file réelle : une écriture native tardive
   * reste devant sa suppression. Aucun Promise.race ne laisse un ancien set dépasser clear.
   */
  function queue<T>(operation: () => Promise<T>, cleanup = false): Promise<T> {
    if (!cleanup && pending >= MAX_PENDING_OPERATIONS) return Promise.reject(failClosed())
    pending += 1
    const actual = tail.then(operation)
    tail = actual.then(() => { pending -= 1 }, () => { pending -= 1 })
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => reject(failClosed()), STORAGE_TIMEOUT_MS)
      actual.then(value => { clearTimeout(timeout); resolve(value) }, () => { clearTimeout(timeout); reject(failClosed()) })
    })
  }

  const hydrationGeneration = state.generation
  const initialized = queue(async () => {
    const value = await storage.getItem(key)
    if (value !== null && !validToken(value)) await storage.removeItem(key)
    if (state.generation === hydrationGeneration && !clearing && !state.failed) update({ hasCredential: validToken(value) })
  }).then(() => update({ ready: true }), () => { /* failClosed a déjà fermé la lecture ; aucune promesse non gérée. */ })

  const vault: SessionCredentialVault = {
    baseURL: endpoint,
    get ready() { return state.ready },
    get hasCredential() { return state.hasCredential },
    get generation() { return state.generation },
    get failed() { return state.failed },
    snapshot: () => state,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener) } },
    async readToken() {
      await initialized
      if (clearing || state.failed) return null
      const generation = state.generation
      const token = await queue(async () => {
        if (clearing || state.failed || state.generation !== generation) return null
        const value = await storage.getItem(key)
        if (value !== null && !validToken(value)) { await storage.removeItem(key); return null }
        return value
      }).catch(() => null)
      if (clearing || state.failed || generation !== state.generation) return null
      update({ hasCredential: token !== null })
      return token
    },
    fence() {
      activeLogin = null
      update({ generation: state.generation + 1 })
    },
    beginLogin() {
      if (!state.ready || state.failed || clearing) throw new Error("nativeCredentialStorageUnavailable")
      vault.fence()
      activeLogin = state.generation
      return activeLogin
    },
    loginGeneration: () => state.ready && !state.failed && !clearing ? activeLogin : null,
    clear() {
      vault.fence()
      clearing = true
      update({ hasCredential: false })
      if (clearPromise) return clearPromise
      clearPromise = queue(() => storage.removeItem(key), true).then(() => {
        clearing = false
        update({ ready: true, hasCredential: false, failed: false })
      }, () => {
        clearing = false
        throw failClosed()
      }).finally(() => { clearPromise = null })
      return clearPromise
    },
    async captureToken(token, generation) {
      await initialized
      if (state.failed) throw new Error("nativeCredentialStorageUnavailable")
      if (clearing || state.generation !== generation || activeLogin !== generation) return false
      if (!validToken(token)) { await vault.clear(); throw new Error("nativeAuthCredentialInvalid") }
      return await queue(async () => {
        if (clearing || state.failed || state.generation !== generation || activeLogin !== generation) return false
        await storage.setItem(key, token)
        if (clearing || state.failed || state.generation !== generation || activeLogin !== generation) {
          await storage.removeItem(key)
          return false
        }
        activeLogin = null
        update({ hasCredential: true })
        return true
      })
    },
  }
  if (storage === secureStorage) nativeVaults.set(endpoint, vault)
  return vault
}
