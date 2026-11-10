/** P17c — références publiques typées, utilisables avant la prochaine génération différée. */
import { makeFunctionReference } from "convex/server"
import type { Id } from "./engine"
import type { NativeCallBinding } from "@antsia/social-contracts/native-calls"

type Network = { networkId: Id<"networks"> }
type Bound = Network & NativeCallBinding
type Target = Bound & { callId: Id<"calls"> }
export type NativeIncomingCall = {
  callId: Id<"calls">; uuid: string; media: "audio" | "video"; expiresAt: number
  caller: { displayName: string | null; handle: string | null } | null
}
export const nativeCalls = {
  configuration: makeFunctionReference<"query", Network, { enabled: boolean; applicationIds: string[] }>("modules/calls/native:configuration"),
  resolveIncoming: makeFunctionReference<"query", Bound & { reference: Id<"notificationDeliveryJobs"> }, NativeIncomingCall | null>("modules/calls/native:resolveIncoming"),
  join: makeFunctionReference<"mutation", Target, { callId: Id<"calls">; uuid: string; media: "audio" | "video" }>("modules/calls/native:join"),
  release: makeFunctionReference<"mutation", Target, { ended: boolean }>("modules/calls/native:release"),
  requestToken: makeFunctionReference<"action", Target, { token: string; serverUrl: string; media: "audio" | "video" }>("modules/calls/livekitActions:requestNativeToken"),
  unsubscribeDevice: makeFunctionReference<"mutation", Bound, null>("modules/notifications/pushSubscriptions:unsubscribeNativeDevice"),
}
