import type { Id } from "@antsia/api/engine"
import type { ReactNode } from "react"
import type { Room } from "livekit-client"
import type { NativeAuthClient } from "../lib/auth-client"
import type { NativeCallFailure, NativeCallMedia, NativeCallPhase } from "./call-state"

export type NativeCallAuthority = {
  networkId: Id<"networks">
  personId: Id<"persons">
  sessionId: string
  expiresAt: number
  foreground: boolean
  auth: NativeAuthClient
  isCurrent: () => boolean
}
export type NativeCallEnvironment = { convexUrl: string; authUrl: string; webUrl: string }
export type NativeCallProviderProps = {
  authority: NativeCallAuthority | null
  env: NativeCallEnvironment
  registerSessionCleanup: (cleanup: () => void | Promise<void>) => () => void
  children: ReactNode
}
export type NativeCallSnapshot = {
  available: boolean
  systemEnabled: boolean
  busy: boolean
  phase: NativeCallPhase
  media: NativeCallMedia
  incoming: boolean
  peer: string | null
  muted: boolean
  held: boolean
  camera: boolean
  minimized: boolean
  establishedAt: number | null
  failure: NativeCallFailure | null
  room: Room | null
}
export const EMPTY_CALL: NativeCallSnapshot = {
  available: false, systemEnabled: false, busy: false, phase: "idle", media: "audio", incoming: false, peer: null,
  muted: false, held: false, camera: false, minimized: false, establishedAt: null, failure: null, room: null,
}
export function callOwner(authority: NativeCallAuthority): string {
  return JSON.stringify([authority.networkId, authority.personId, authority.sessionId])
}
