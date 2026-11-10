import { isNativeCallPushPayload, type NativeCallPushPayload } from "@antsia/social-contracts/native-calls"

export type NativeCallPhase = "idle" | "permission" | "ringing" | "connecting" | "active" | "held" | "reconnecting" | "ended" | "failed"
export type NativeCallFailure = "permission" | "unavailable" | "refused" | "timeout" | "connection" | "session"
export type NativeCallMedia = "audio" | "video"

/** A response belongs to one operation of one owner, never merely the same call id. */
export function createCallFence() {
  let epoch = 0
  let owner: string | null = null
  let live = false
  return {
    begin(nextOwner: string) { owner = nextOwner; live = true; epoch += 1; return epoch },
    capture() { const captured = epoch, capturedOwner = owner; return () => live && captured === epoch && capturedOwner === owner },
    stop() { live = false; epoch += 1 },
  }
}

/** Shared physical audio ownership: UI timeout cannot release a still-draining native resource. */
export function createCallResourceLease() {
  let generation = 0
  let stopPrevious: (() => Promise<void>) | null = null
  return {
    async acquire(currentOwner: () => boolean) {
      const captured = ++generation
      await stopPrevious?.()
      const current = () => captured === generation && currentOwner()
      if (!current()) throw new Error("nativeCallRoomSuperseded")
      return {
        current,
        install(stop: () => Promise<void>) {
          if (!current()) return false
          stopPrevious = stop
          return true
        },
      }
    },
  }
}

export const CALL_RECONNECT_MAX_MS = 20_000
export const CALL_RECONNECT_MAX_ATTEMPTS = 3
export function callReconnectDelay(context: { retryCount: number; elapsedMs: number }, current: boolean): number | null {
  if (!current || !Number.isFinite(context.elapsedMs) || context.elapsedMs < 0 || !Number.isInteger(context.retryCount) || context.retryCount < 0 || context.retryCount >= CALL_RECONNECT_MAX_ATTEMPTS) return null
  const delay = [500, 1_500, 3_000][context.retryCount]!
  return context.elapsedMs + delay < CALL_RECONNECT_MAX_MS ? delay : null
}

export function incomingPayloadForBinding(raw: unknown, binding: { applicationId: string; networkId: string; bindingId: string; expiresAt: number }, now: number): NativeCallPushPayload | null {
  if (!isNativeCallPushPayload(raw, now) || binding.expiresAt <= now || raw.applicationId !== binding.applicationId || raw.networkId !== binding.networkId || raw.bindingId !== binding.bindingId) return null
  return raw
}

/** Permission is necessary but cannot replace iOS' actual audio activation. */
export function mayPublishCallMedia(input: { current: boolean; connected: boolean; activated: boolean; held: boolean; microphone: boolean; camera: boolean; video: boolean }) {
  const live = input.current && input.connected && input.activated && !input.held
  return { audio: live && input.microphone, video: live && input.video && input.camera }
}

export function callMediaEstablished(connected: boolean, remoteParticipants: number): boolean {
  return connected && remoteParticipants > 0
}
