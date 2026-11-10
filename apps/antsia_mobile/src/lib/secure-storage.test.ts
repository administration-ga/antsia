/** P17b : scénarios écrits seulement ; aucun stockage d'appareil ni contrôle exécuté. */
import * as SecureStore from "expo-secure-store"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createNativeCredentialVault, nativeCredentialKey, type NativeCredentialStorage } from "./secure-storage"

vi.mock("expo-secure-store", () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 7,
  getItemAsync: vi.fn(async () => null), setItemAsync: vi.fn(async () => {}), deleteItemAsync: vi.fn(async () => {}),
}))

const SERVER = "https://antsia-backend.example.test"
const TOKEN = "server-issued-token.signed-session-proof"

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
function memoryStorage() {
  const items = new Map<string, string>()
  const storage: NativeCredentialStorage = {
    getItem: vi.fn(async key => items.get(key) ?? null),
    setItem: vi.fn(async (key, value) => { items.set(key, value) }),
    removeItem: vi.fn(async key => { items.delete(key) }),
  }
  return { items, storage }
}

beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks() })
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers() })

describe("P17b — coffre bearer natif", () => {
  it("hydrate dès la fabrique et expose un snapshot stable, sans copier la preuve dans le snapshot", async () => {
    const { items, storage } = memoryStorage()
    items.set(nativeCredentialKey(SERVER), TOKEN)
    const vault = createNativeCredentialVault(SERVER, storage), initial = vault.snapshot()
    expect(initial).toEqual({ ready: false, hasCredential: false, generation: 0, failed: false })
    expect(vault.snapshot()).toBe(initial)
    expect(await vault.readToken()).toBe(TOKEN)
    expect(vault.snapshot()).toEqual({ ready: true, hasCredential: true, generation: 0, failed: false })
    expect(JSON.stringify(vault.snapshot())).not.toContain(TOKEN)
    expect(vault.snapshot()).toBe(vault.snapshot())
  })

  it("isole exactement deux déploiements et ne supprime aucune clé étrangère", async () => {
    const { items, storage } = memoryStorage(), other = "https://other-backend.example.test"
    const key = nativeCredentialKey(SERVER), foreignKey = nativeCredentialKey(other)
    expect(key).toMatch(/^[A-Za-z0-9._-]+$/u)
    expect(key).not.toBe(foreignKey)
    items.set(key, TOKEN); items.set(foreignKey, "foreign-server-token.other-signature"); items.set("unrelated.preference", "preserved")
    const vault = createNativeCredentialVault(SERVER, storage)
    await vault.clear()
    expect(await vault.readToken()).toBeNull()
    expect(items.has(key)).toBe(false)
    expect(items.get(foreignKey)).toBe("foreign-server-token.other-signature")
    expect(items.get("unrelated.preference")).toBe("preserved")
    expect(vi.mocked(storage.removeItem).mock.calls.every(([deleted]) => deleted === key)).toBe(true)
  })

  it("fence ferme les anciens retours mais garde le bearer admis pour sa révocation serveur", async () => {
    const { items, storage } = memoryStorage(), vault = createNativeCredentialVault(SERVER, storage)
    await vault.readToken()
    const first = vault.beginLogin()
    expect(await vault.captureToken(TOKEN, first)).toBe(true)
    const stale = vault.beginLogin()
    vault.fence()
    expect(await vault.captureToken("late-server-token.other-signature", stale)).toBe(false)
    expect(vault.loginGeneration()).toBeNull()
    expect(await vault.readToken()).toBe(TOKEN)
    expect(items.get(nativeCredentialKey(SERVER))).toBe(TOKEN)
  })

  it("clear masque immédiatement puis supprime aussi une écriture déjà en vol", async () => {
    const { items, storage } = memoryStorage(), started = deferred<void>(), finishWrite = deferred<void>()
    storage.setItem = vi.fn(async (key, token) => { started.resolve(); await finishWrite.promise; items.set(key, token) })
    const vault = createNativeCredentialVault(SERVER, storage)
    await vault.readToken()
    const write = vault.captureToken(TOKEN, vault.beginLogin())
    await started.promise
    const clear = vault.clear()
    expect(vault.hasCredential).toBe(false)
    expect(await vault.readToken()).toBeNull()
    finishWrite.resolve()
    expect(await write).toBe(false)
    await clear
    expect(items.has(nativeCredentialKey(SERVER))).toBe(false)
    expect(await vault.readToken()).toBeNull()
  })

  it("un délai de stockage ferme la lecture et conserve la suppression derrière l'écriture native tardive", async () => {
    const { items, storage } = memoryStorage(), started = deferred<void>(), finishWrite = deferred<void>()
    storage.setItem = vi.fn(async (key, token) => { started.resolve(); await finishWrite.promise; items.set(key, token) })
    const vault = createNativeCredentialVault(SERVER, storage)
    await vault.readToken()
    const write = vault.captureToken(TOKEN, vault.beginLogin())
    const failedWrite = expect(write).rejects.toThrow("nativeCredentialStorageUnavailable")
    await started.promise
    await vi.advanceTimersByTimeAsync(4_001)
    await failedWrite
    expect(vault.snapshot()).toMatchObject({ ready: true, failed: true, hasCredential: false })
    expect(await vault.readToken()).toBeNull()
    const clear = vault.clear()
    finishWrite.resolve()
    await clear
    expect(items.has(nativeCredentialKey(SERVER))).toBe(false)
    expect(vault.snapshot()).toMatchObject({ failed: false, hasCredential: false })
  })

  it("une lecture initiale rejetée est traitée sans promesse non gérée ni adoption de session", async () => {
    const { storage } = memoryStorage()
    storage.getItem = vi.fn(async () => { throw new Error("SecureStore unavailable") })
    const vault = createNativeCredentialVault(SERVER, storage)
    expect(await vault.readToken()).toBeNull()
    expect(vault.snapshot()).toMatchObject({ ready: true, failed: true, hasCredential: false })
    expect(() => vault.beginLogin()).toThrow("nativeCredentialStorageUnavailable")
  })

  it("un échec de suppression reste visible et ne réouvre aucune lecture", async () => {
    const { items, storage } = memoryStorage()
    items.set(nativeCredentialKey(SERVER), TOKEN)
    const vault = createNativeCredentialVault(SERVER, storage)
    await vault.readToken()
    storage.removeItem = vi.fn(async () => { throw new Error("SecureStore deletion unavailable") })
    await expect(vault.clear()).rejects.toThrow("nativeCredentialStorageUnavailable")
    expect(vault.snapshot()).toMatchObject({ hasCredential: false, failed: true })
    expect(await vault.readToken()).toBeNull()
  })

  it("utilise WHEN_UNLOCKED_THIS_DEVICE_ONLY pour les trois opérations SecureStore", async () => {
    const vault = createNativeCredentialVault(SERVER)
    expect(createNativeCredentialVault(SERVER)).toBe(vault)
    await vault.readToken()
    expect(await vault.captureToken(TOKEN, vault.beginLogin())).toBe(true)
    await vault.clear()
    const key = nativeCredentialKey(SERVER), options = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }
    expect(SecureStore.getItemAsync).toHaveBeenCalledWith(key, options)
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(key, TOKEN, options)
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(key, options)
  })
})
