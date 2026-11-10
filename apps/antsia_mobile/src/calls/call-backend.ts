import { api, type Id } from "@antsia/api/engine"
import { nativeCalls } from "@antsia/api/native-calls"
import { ConvexReactClient } from "convex/react"
import { ConvexHttpClient } from "convex/browser"
import { makeFunctionReference, type FunctionReturnType } from "convex/server"
import { nativeRequest } from "@antsia/social-native/request"
import type { NativeCallAuthority, NativeCallEnvironment } from "./types"

export type NativeCallStateDto = FunctionReturnType<typeof api.modules.calls.lifecycle.getCall>
export type NativePushCredential = { provider: "apns_voip" | "apns" | "fcm"; token: string }
// Additive port before the deliberately deferred code generation; no backend runtime import.
const subscribePush = makeFunctionReference<"mutation", {
  networkId: Id<"networks">; applicationId: string; deviceId: string;
  credential: NativePushCredential; nativeBinding: { bindingId: string }
}, { subscriptionId: Id<"pushSubscriptions"> }>("modules/notifications/pushSubscriptions:subscribe")

export function createCallBackend(authority: () => NativeCallAuthority, env: NativeCallEnvironment, unavailable: () => void) {
  let closed = false
  const current = () => !closed && authority().isCurrent() && authority().expiresAt > Date.now()
  let socket: ConvexReactClient | null = null
  const token = async () => {
    if (!current()) return null
    const result = await nativeRequest(signal => authority().auth.convex.token({ fetchOptions: { signal, throw: false } }))
    if (!current() || result.error || !result.data?.token) return null
    return result.data.token
  }
  function connectedClient() {
    if (closed) throw new Error("nativeCallSessionClosed")
    if (!socket) {
      socket = new ConvexReactClient(env.convexUrl, { unsavedChangesWarning: false })
      socket.setAuth(async () => {
        try { const jwt = await token(); if (!jwt && current()) unavailable(); return jwt }
        catch { if (current()) unavailable(); return null }
      })
    }
    return socket
  }
  async function fresh(callId?: Id<"calls">) {
    if (!current()) throw new Error("nativeCallSessionClosed")
    const before = authority(), sessionId = before.sessionId
    const actual = await nativeRequest(signal => before.auth.getSession({ query: { disableCookieCache: true }, fetchOptions: { signal, throw: false } }))
    if (!current() || authority().sessionId !== sessionId || actual.error || actual.data?.session?.id !== sessionId || new Date(actual.data.session.expiresAt).getTime() <= Date.now()) throw new Error("nativeCallSessionClosed")
    const jwt = await token()
    if (!jwt || !current()) throw new Error("nativeCallSessionClosed")
    const http = new ConvexHttpClient(env.convexUrl)
    http.setAuth(jwt)
    if (await nativeRequest(() => http.query(api.modules.platform.authentication.mySession, {})) !== true || !current()) throw new Error("nativeCallSessionClosed")
    if (callId) {
      const call = await nativeRequest(() => http.query(api.modules.calls.lifecycle.getCall, { networkId: before.networkId, callId }))
      if (!current() || !call || call.status !== "active" || ["ended", "missed", "declined"].includes(call.callStatus)) throw new Error("nativeCallNoLongerLive")
    }
    return http
  }
  return {
    get client() { return connectedClient() }, fresh, current,
    configuration: async () => {
      const http = await fresh()
      return nativeRequest(() => http.query(nativeCalls.configuration, { networkId: authority().networkId }))
    },
    subscribe: async (binding: { applicationId: string; deviceId: string; bindingId: string }, credential: NativePushCredential) => {
      const http = await fresh()
      return nativeRequest(() => http.mutation(subscribePush, { networkId: authority().networkId, applicationId: binding.applicationId, deviceId: binding.deviceId, credential, nativeBinding: { bindingId: binding.bindingId } }))
    },
    unsubscribe: (subscriptionId: Id<"pushSubscriptions">) => nativeRequest(() => connectedClient().mutation(api.modules.notifications.pushSubscriptions.unsubscribe, { networkId: authority().networkId, subscriptionId }), 3_000),
    close() { closed = true; socket?.clearAuth(); if (socket) void socket.close() },
  }
}
export type NativeCallBackend = ReturnType<typeof createCallBackend>
