import * as Crypto from "expo-crypto"
import * as SecureStore from "expo-secure-store"
import { nativeAuthBaseURL } from "../lib/secure-storage"
import type { NativeCallAuthority } from "./types"
import type { StoredCallBinding } from "./binding-model"
export { parseStoredCallBinding } from "./binding-model"
export type { StoredCallBinding } from "./binding-model"

export type BindingStorage = {
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
  removeItem(key: string): Promise<void>
}
const storage: BindingStorage = {
  getItem: key => SecureStore.getItemAsync(key, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }),
  setItem: (key, value) => SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }),
  removeItem: key => SecureStore.deleteItemAsync(key, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }),
}
export function callBindingKey(authUrl: string): string {
  return "antsia.native.calls.v1." + Array.from(nativeAuthBaseURL(authUrl), character => character.charCodeAt(0).toString(16).padStart(4, "0")).join("")
}
/** Serial native writes: a late set cannot overtake logout removal, including across remounts. */
const queues = new Map<string, Promise<unknown>>()
const pending = new Map<string, number>()
function enqueue<T>(key: string, run: () => Promise<T>, cleanup = false): Promise<T> {
  if (!cleanup && (pending.get(key) ?? 0) >= 16) return Promise.reject(new Error("nativeBindingStorageBusy"))
  pending.set(key, (pending.get(key) ?? 0) + 1)
  const next = (queues.get(key) ?? Promise.resolve()).then(run, run)
  queues.set(key, next.then(() => { pending.set(key, (pending.get(key) ?? 1) - 1) }, () => { pending.set(key, (pending.get(key) ?? 1) - 1) }))
  return next
}
export function createDeviceBindingStore(authUrl: string, target: BindingStorage = storage) {
  const key = callBindingKey(authUrl)
  return {
    read: () => enqueue(key, () => target.getItem(key)),
    write: (value: StoredCallBinding) => enqueue(key, () => target.setItem(key, JSON.stringify(value))),
    clear: () => enqueue(key, () => target.removeItem(key), true),
    clearIf: (bindingId: string) => enqueue(key, async () => {
      const raw = await target.getItem(key)
      if (!raw) return
      let value: unknown
      try { value = JSON.parse(raw) } catch { return }
      // A storage deletion failure must reach the global exit gate, never look like a purge.
      if (value && typeof value === "object" && "bindingId" in value && value.bindingId === bindingId) await target.removeItem(key)
    }, true),
    clearRawIf: (expected: string) => enqueue(key, async () => {
      if (await target.getItem(key) === expected) await target.removeItem(key)
    }, true),
    create(owner: NativeCallAuthority, applicationId: string): StoredCallBinding {
      return { applicationId, deviceId: Crypto.randomUUID(), bindingId: Crypto.randomUUID(), sessionId: owner.sessionId, personId: String(owner.personId), networkId: String(owner.networkId), expiresAt: Math.floor(owner.expiresAt) }
    },
  }
}
