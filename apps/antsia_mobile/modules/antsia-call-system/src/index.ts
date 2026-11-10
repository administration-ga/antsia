import { requireOptionalNativeModule } from "expo"
import { Platform } from "react-native"
import { isNativeCallPushPayload, isNativeCallUuid, type NativeCallPushPayload } from "@antsia/social-contracts/native-calls"

export type SystemCallBinding = { applicationId: string; deviceId: string; bindingId: string; expiresAt: number }
export type SystemCallEvent = {
  eventId: string
  kind: "incoming" | "answer" | "end" | "audioActivated" | "audioDeactivated" | "token" | "mute" | "hold"
  uuid?: string
  payload?: NativeCallPushPayload
  provider?: "apns_voip" | "apns" | "fcm"
  token?: string
  muted?: boolean
  held?: boolean
}
export type SystemCallsCapabilities = { enabled: boolean; platform: "ios" | "android"; fullScreen: boolean }
export type SystemCallPermissionOptions = { video: boolean; notifications: boolean; microphone?: boolean }
type Subscription = { remove(): void }
interface NativeCalls {
  capabilities(): Promise<SystemCallsCapabilities>
  configure(binding: SystemCallBinding): Promise<void>
  requestPermissions(options: SystemCallPermissionOptions): Promise<{ microphone: boolean; camera: boolean; notifications: boolean }>
  tokens(): Promise<Array<{ provider: "apns_voip" | "apns" | "fcm"; token: string }>>
  showOutgoing(options: { uuid: string; video: boolean }): Promise<void>
  answer(options: { uuid: string }): Promise<void>
  end(options: { uuid: string }): Promise<void>
  setConnected(options: { uuid: string }): Promise<void>
  completeAction(options: { eventId: string; handled: boolean }): Promise<void>
  clear(options: { bindingId?: string }): Promise<void>
  drainEvents(): Promise<SystemCallEvent[]>
  addListener(event: "onCallEvent", listener: () => void): Subscription
}

// Aucun accès au module à l'import ne doit casser Expo Go ou un binaire antérieur.
let native: NativeCalls | null = null
try { native = requireOptionalNativeModule<NativeCalls>("AntsiaCallSystem") } catch { /* capacité absente, fermée */ }
const unavailable = async (): Promise<never> => { throw new Error("nativeCallsUnavailable") }
const platform = Platform.OS === "ios" ? "ios" : "android"
const kinds = new Set(["incoming", "answer", "end", "audioActivated", "audioDeactivated", "token", "mute", "hold"])
function admitted(event: SystemCallEvent): boolean {
  return !!event && typeof event === "object" && typeof event.eventId === "string" && event.eventId.length > 0 && event.eventId.length <= 128 && kinds.has(event.kind)
    && (event.uuid === undefined || isNativeCallUuid(event.uuid))
    && (event.payload === undefined || isNativeCallPushPayload(event.payload))
    && (event.token === undefined || event.kind === "token" && typeof event.token === "string" && event.token.length <= 4096)
}
// Les événements natifs sont des signaux : drain atomique, jamais livraison en
// parallèle via listener ET replay. Le serveur doit encore dédupliquer les gestes.
const listeners = new Set<(event: SystemCallEvent) => void>()
let generation = 0
let activeBinding: SystemCallBinding | null = null
let observing: Subscription | null = null
let pumping = false
let again = false
async function pump(): Promise<void> {
  if (!native || listeners.size === 0) return
  if (pumping) { again = true; return }
  pumping = true
  try {
    do {
      again = false
      const at = generation
      const events = await native.drainEvents()
      if (at !== generation) continue
      for (const event of events.filter(admitted)) for (const listener of [...listeners]) {
        try { listener(event) } catch { /* un consommateur ne réinjecte pas le lot dans une autre session */ }
      }
    } while (again && listeners.size > 0)
  } catch { /* aucune adoption de session ni rejeu automatique d'un geste */ }
  finally { pumping = false }
}

export const NativeSystemCalls = {
  capabilities: () => native?.capabilities() ?? Promise.resolve({ enabled: false, platform, fullScreen: false }),
  configure: (binding: SystemCallBinding) => {
    if (binding.bindingId !== activeBinding?.bindingId || binding.applicationId !== activeBinding?.applicationId || binding.deviceId !== activeBinding?.deviceId) generation += 1
    // StoredCallBinding peut porter aussi des références privées : aucune ne
    // franchit ce port ni n'atterrit dans les préférences natives non secrètes.
    const lease = { applicationId: binding.applicationId, deviceId: binding.deviceId, bindingId: binding.bindingId, expiresAt: binding.expiresAt }
    activeBinding = lease
    return native?.configure(lease) ?? unavailable()
  },
  requestPermissions: (options: SystemCallPermissionOptions) => native?.requestPermissions(options) ?? Promise.resolve({ microphone: false, camera: false, notifications: false }),
  tokens: () => native?.tokens() ?? Promise.resolve([]),
  showOutgoing: (options: { uuid: string; video: boolean }) => native?.showOutgoing(options) ?? unavailable(),
  answer: (options: { uuid: string }) => native?.answer(options) ?? unavailable(),
  end: (options: { uuid: string }) => native?.end(options) ?? unavailable(),
  setConnected: (options: { uuid: string }) => native?.setConnected(options) ?? unavailable(),
  completeAction: (options: { eventId: string; handled: boolean }) => native?.completeAction(options) ?? unavailable(),
  clear: (options?: { bindingId?: string }) => {
    if (options?.bindingId === undefined || options.bindingId === activeBinding?.bindingId) { generation += 1; activeBinding = null }
    return native?.clear(options ?? {}) ?? Promise.resolve()
  },
  drainEvents: async (): Promise<SystemCallEvent[]> => {
    const at = generation
    const events = await native?.drainEvents() ?? []
    return at === generation ? events.filter(admitted) : []
  },
  addListener(event: "onCallEvent", listener: (event: SystemCallEvent) => void): Subscription {
    if (event !== "onCallEvent" || !native) return { remove() {} }
    listeners.add(listener)
    observing ??= native.addListener(event, () => { void pump() })
    void pump()
    return { remove() {
      listeners.delete(listener)
      if (listeners.size === 0) { observing?.remove(); observing = null }
    } }
  },
}

/** Module optionnel stable ; aucun montage de salle, accès média ou auto-réponse. */
export function useNativeSystemCalls() { return NativeSystemCalls }
