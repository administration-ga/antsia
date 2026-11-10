import { api, type Id } from "@antsia/api/engine"
import { nativeCalls, type NativeIncomingCall } from "@antsia/api/native-calls"
import { isNativeCallPushPayload, isNativeCallUuid } from "@antsia/social-contracts/native-calls"
import { CALL_RING_WINDOW_MS, PRESENCE_HEARTBEAT_INTERVAL_MS } from "@antsia/social-contracts/calls"
import { nativeRequest } from "@antsia/social-native/request"
import { NativeSystemCalls, type SystemCallEvent } from "../../modules/antsia-call-system/src"
import { createCallBackend, type NativePushCredential } from "./call-backend"
import { createCallFence, incomingPayloadForBinding, type NativeCallFailure, type NativeCallMedia } from "./call-state"
import { createDeviceBindingStore, parseStoredCallBinding, type StoredCallBinding } from "./device-binding"
import { createNativeCallRoom, type NativeCallRoom } from "./native-room"
import { ownedStoredBindingId } from "./binding-model"
import { watchNativeQuery } from "./query-watch"
import { callOwner, EMPTY_CALL, type NativeCallAuthority, type NativeCallEnvironment, type NativeCallSnapshot } from "./types"

type Call = { callId: Id<"calls">; uuid: string; media: NativeCallMedia; incoming: boolean; expiresAt: number; answered: boolean; answerRequested: boolean }
type HardwareToken = NativePushCredential

/** One controller/Room owner per exact session, independent of route, theme and private screen transport. */
export function createNativeCallController(getAuthority: () => NativeCallAuthority, env: NativeCallEnvironment, applicationId: string | undefined) {
  let state: NativeCallSnapshot = { ...EMPTY_CALL }, closed = false, initialized = false, controlPending = false
  let binding: StoredCallBinding | null = null, call: Call | null = null, room: NativeCallRoom | null = null
  let callWatch: (() => void) | null = null, incomingWatch: (() => void) | null = null, sessionWatch: (() => void) | null = null
  let osWatch: { remove(): void } | null = null, ringTimer: ReturnType<typeof setTimeout> | undefined
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined, expiryTimer: ReturnType<typeof setTimeout> | undefined
  let lastHeartbeat = 0, eventQueue = Promise.resolve(), queuedEvents = 0, activatedUuid: string | null = null, pendingIncomingUuid: string | null = null
  let microphonePermission = false, cameraPermission = false, closing: Promise<void> | null = null, finishing: Promise<void> | null = null, cleanupFailed = false
  const seenEvents = new Set<string>(), pendingAnswers = new Set<string>(), subscriptions = new Map<string, { token: string; id: Id<"pushSubscriptions"> }>()
  const listeners = new Set<() => void>(), playbackStops = new Set<() => void>(), fence = createCallFence(), bindingStore = createDeviceBindingStore(env.authUrl)
  const authority = () => getAuthority()
  const descriptorOwner = getAuthority()
  // Captured before a later controller can enqueue a new descriptor. This is metadata, never bearer material.
  const descriptorRead = nativeRequest(() => bindingStore.read(), 4_000).then(raw => ({ ok: true as const, raw }), () => ({ ok: false as const, raw: null }))
  const current = () => !closed && authority().isCurrent() && authority().expiresAt > Date.now()
  const gesture = () => current() && authority().foreground
  const update = (patch: Partial<NativeCallSnapshot>) => {
    if (closed) return
    if (patch.busy === true) for (const stop of playbackStops) { try { stop() } catch { /* A released video cannot own call audio. */ } }
    state = { ...state, ...patch }; for (const listener of listeners) listener()
  }
  const backend = createCallBackend(authority, env, () => { void finish("session", false) })
  function rememberEvent(eventId: string) {
    if (seenEvents.has(eventId)) return false
    if (seenEvents.size >= 128) seenEvents.delete(seenEvents.values().next().value!)
    seenEvents.add(eventId)
    return true
  }
  const bound = () => {
    if (!binding || binding.expiresAt <= Date.now() || binding.sessionId !== authority().sessionId) throw new Error("nativeBindingMissing")
    return { networkId: authority().networkId, applicationId: binding.applicationId, deviceId: binding.deviceId, bindingId: binding.bindingId }
  }
  const opCurrent = () => { const operation = fence.capture(); return () => current() && operation() }
  async function configurationOpen() {
    const configuration = await backend.configuration()
    if (!current() || !applicationId || !configuration.enabled || !configuration.applicationIds.includes(applicationId)) throw new Error("nativeCallsUnavailable")
    return configuration
  }
  async function releaseCall(target: Call) {
    try { await nativeRequest(() => backend.client.mutation(nativeCalls.release, { ...bound(), callId: target.callId }), 3_000) }
    catch { /* A closed session never acquires a new authority to release an old claim. */ }
  }
  function finish(failure: NativeCallFailure | null, _decline: boolean): Promise<void> {
    if (finishing) return finishing
    const target = call, ownedRoom = room
    fence.stop(); call = null; room = null; activatedUuid = null; pendingIncomingUuid = null; microphonePermission = false; cameraPermission = false
    if (ringTimer) clearTimeout(ringTimer)
    ringTimer = undefined; callWatch?.(); callWatch = null
    incomingWatch?.(); incomingWatch = null
    // stop() physically stops tracks synchronously, before OS/backend awaits.
    const mediaStop = ownedRoom?.stop() ?? Promise.resolve()
    update({ busy: true, room: null, phase: failure ? "failed" : "ended", failure, camera: false, muted: true, held: false, minimized: false })
    const tasks: Promise<unknown>[] = [mediaStop]
    if (target) {
      if (target.uuid) tasks.push(nativeRequest(() => NativeSystemCalls.end({ uuid: target.uuid }), 3_000))
      tasks.push(releaseCall(target))
    }
    finishing = Promise.allSettled(tasks).then(results => {
      if (results[0]?.status === "rejected") cleanupFailed = true
      update({ busy: false, ...(cleanupFailed ? { available: false, phase: "failed", failure: "connection" } : {}) })
      if (!cleanupFailed) finishing = null
    })
    return finishing
  }
  function armRing(target: Call) {
    if (ringTimer) clearTimeout(ringTimer)
    ringTimer = setTimeout(() => { if (call === target && state.establishedAt === null) void finish("timeout", target.incoming && !target.answered) }, Math.max(0, Math.min(target.expiresAt, authority().expiresAt) - Date.now()))
  }
  function watchCall(target: Call) {
    callWatch?.()
    callWatch = watchNativeQuery(backend.client.watchQuery(api.modules.calls.lifecycle.getCall, { networkId: authority().networkId, callId: target.callId }), result => {
      if (!current() || call !== target) return
      if (!result || result.status !== "active" || ["ended", "missed", "declined"].includes(result.callStatus)) { void finish(null, false); return }
      const held = result.callStatus === "on_hold"
      update({ held, ...(held ? { phase: "held" as const } : state.held ? { phase: state.establishedAt !== null ? "active" as const : "connecting" as const } : {}) })
      void room?.media({ held }).catch(() => { if (call === target) void finish("permission", false) })
    }, () => { if (call === target) void finish("session", false) })
  }
  async function connectCall(target: Call, stillCurrent: () => boolean) {
    const http = await backend.fresh(target.callId)
    if (!stillCurrent() || call !== target) return
    const joined = await nativeRequest(() => http.mutation(nativeCalls.join, { ...bound(), callId: target.callId }))
    if (!stillCurrent() || call !== target) { await releaseCall(target); return }
    if (joined.callId !== target.callId || target.incoming && joined.uuid !== target.uuid || joined.media !== target.media) throw new Error("nativeCallMismatch")
    target.uuid = joined.uuid; target.answered = true
    if (!target.incoming) await nativeRequest(() => NativeSystemCalls.showOutgoing({ uuid: target.uuid, video: target.media === "video" }), 5_000)
    if (!stillCurrent() || call !== target) return
    const fresh = await backend.fresh(target.callId)
    if (!stillCurrent() || call !== target) return
    const token = await nativeRequest(() => fresh.action(nativeCalls.requestToken, { ...bound(), callId: target.callId }), 12_000)
    if (!stillCurrent() || call !== target) return
    if (token.media !== target.media) throw new Error("nativeCallMismatch")
    const ownedRoom: NativeCallRoom = await createNativeCallRoom({
      current: () => stillCurrent() && call === target,
      changed: () => { if (stillCurrent() && call === target) update({ room: ownedRoom.room }) },
      connected: () => {
        if (!stillCurrent() || call !== target) return
        update({ phase: state.held ? "held" : state.establishedAt === null ? target.incoming ? "connecting" : "ringing" : "active" })
        void NativeSystemCalls.setConnected({ uuid: target.uuid }).then(() => {
          if (stillCurrent() && !target.incoming) return backend.client.mutation(api.modules.calls.lifecycle.setCallRinging, { networkId: authority().networkId, callId: target.callId })
          return undefined
        }).catch(() => { if (stillCurrent()) void finish("connection", false) })
      },
      disconnected: () => { if (stillCurrent()) void finish("connection", false) },
      reconnecting: () => { if (stillCurrent()) update({ phase: "reconnecting" }) },
      established: at => { if (stillCurrent()) { if (ringTimer) clearTimeout(ringTimer); update({ phase: state.held ? "held" : "active", establishedAt: at }) } },
      mediaFailed: () => { if (stillCurrent()) void finish("permission", false) },
      revalidate: async () => { await backend.fresh(target.callId); return stillCurrent() && call === target },
    })
    if (!stillCurrent() || call !== target) { await ownedRoom.stop(); return }
    room = ownedRoom; update({ room: ownedRoom.room, phase: "connecting" })
    await ownedRoom.media({ microphone: microphonePermission, camera: cameraPermission, video: state.camera, activated: activatedUuid === target.uuid, muted: state.muted, held: state.held })
    if (!stillCurrent()) { await ownedRoom.stop(); return }
    await ownedRoom.connect(token.serverUrl, token.token)
  }
  async function acceptIncoming() {
    const target = call
    if (!target || !target.incoming || target.answered || controlPending || !current()) return
    controlPending = true
    target.answerRequested = true
    // Own claim will make resolveIncoming null. Remove only this pre-answer guard first.
    incomingWatch?.(); incomingWatch = null
    fence.begin(callOwner(authority())); const stillCurrent = opCurrent()
    update({ phase: "permission", busy: true })
    try {
      await configurationOpen()
      if (!stillCurrent()) return
      const permissions = await nativeRequest(() => NativeSystemCalls.requestPermissions({ video: target.media === "video", notifications: false }), 20_000)
      if (!stillCurrent()) return
      if (!permissions.microphone || target.media === "video" && !permissions.camera) { await finish("permission", true); return }
      microphonePermission = permissions.microphone; cameraPermission = permissions.camera
      update({ camera: target.media === "video" && authority().foreground, muted: false })
      await connectCall(target, stillCurrent)
    } catch { if (stillCurrent()) await finish("connection", true) }
    finally { controlPending = false }
  }
  async function receive(payload: unknown) {
    if (!binding || !current()) return
    const admitted = incomingPayloadForBinding(payload, binding, Date.now())
    if (!admitted) { if (isNativeCallPushPayload(payload)) await NativeSystemCalls.end({ uuid: payload.uuid }); return }
    if (call?.uuid === admitted.uuid) return
    if (state.busy) { await NativeSystemCalls.end({ uuid: admitted.uuid }); return }
    pendingIncomingUuid = admitted.uuid
    fence.begin(callOwner(authority())); const stillCurrent = opCurrent()
    update({ busy: true, phase: "connecting", failure: null, establishedAt: null, peer: null })
    try {
      await configurationOpen()
      const http = await backend.fresh()
      if (!stillCurrent()) return
      const incoming: NativeIncomingCall | null = await nativeRequest(() => http.query(nativeCalls.resolveIncoming, { ...bound(), reference: admitted.reference as Id<"notificationDeliveryJobs"> }))
      if (!stillCurrent()) return
      if (!incoming || incoming.uuid !== admitted.uuid || incoming.expiresAt <= Date.now() || incoming.expiresAt > admitted.expiresAt) throw new Error("nativeIncomingRefused")
      const target: Call = { callId: incoming.callId, uuid: incoming.uuid, media: incoming.media, expiresAt: incoming.expiresAt, incoming: true, answered: false, answerRequested: false }
      call = target
      pendingIncomingUuid = null
      update({ phase: "ringing", incoming: true, media: target.media, peer: incoming.caller?.displayName ?? incoming.caller?.handle ?? null, camera: false, muted: true, held: false })
      watchCall(target); armRing(target)
      incomingWatch?.()
      incomingWatch = watchNativeQuery(backend.client.watchQuery(nativeCalls.resolveIncoming, { ...bound(), reference: admitted.reference as Id<"notificationDeliveryJobs"> }), resolved => {
        if (call === target && !target.answered && !target.answerRequested && resolved === null) void finish(null, false)
      }, () => { if (call === target && !target.answered && !target.answerRequested) void finish("session", false) })
      if (pendingAnswers.delete(target.uuid)) await acceptIncoming()
    } catch {
      if (!stillCurrent()) return
      await NativeSystemCalls.end({ uuid: admitted.uuid }).catch(() => undefined)
      await finish("refused", false)
    }
  }
  async function registerTokens(tokens: HardwareToken[]) {
    const initial = binding
    if (!initial || !current()) return
    const providers = new Set(tokens.map(credential => credential.provider))
    for (const [provider, previous] of subscriptions) {
      if (providers.has(provider as HardwareToken["provider"])) continue
      await backend.unsubscribe(previous.id)
      if (!current() || binding !== initial) return
      subscriptions.delete(provider)
    }
    update({ systemEnabled: subscriptions.has("apns_voip") || subscriptions.has("fcm") })
    for (const credential of tokens.slice(0, 3)) {
      if (!current() || binding !== initial) return
      const previous = subscriptions.get(credential.provider)
      if (previous?.token === credential.token) continue
      const result = await backend.subscribe(initial, credential)
      if (!current() || binding !== initial) { await backend.unsubscribe(result.subscriptionId).catch(() => undefined); return }
      subscriptions.set(credential.provider, { token: credential.token, id: result.subscriptionId })
      if (credential.provider === "apns_voip" || credential.provider === "fcm") update({ systemEnabled: true })
      if (previous && previous.id !== result.subscriptionId) await backend.unsubscribe(previous.id)
    }
  }
  async function control(kind: "mute" | "hold", value: boolean) {
    const target = call, media = room
    if (!current() || !target?.answered || !media) return false
    const stillCurrent = opCurrent()
    if (kind === "mute") await media.media({ muted: value })
    else {
      // Suspend first; acknowledge the OS action only after actual media suspension.
      if (value) await media.media({ held: true })
      const http = await backend.fresh(target.callId)
      if (!stillCurrent()) return false
      if (value) await nativeRequest(() => http.mutation(api.modules.calls.ringing.hold, { networkId: authority().networkId, callId: target.callId }))
      else {
        const result = await nativeRequest(() => http.mutation(api.modules.calls.ringing.resume, { networkId: authority().networkId, callId: target.callId }))
        if (result.heldByPeer) value = true
        await media.media({ held: value })
      }
    }
    if (!stillCurrent()) return false
    update(kind === "mute" ? { muted: value } : { held: value, phase: value ? "held" : state.establishedAt === null ? "connecting" : "active" })
    return true
  }
  async function event(event: SystemCallEvent) {
    if (!current() || !rememberEvent(event.eventId)) return
    if (event.kind === "token") {
      // A token event may be only a marker; fresh hardware tokens never come from persistent JS queues.
      await registerTokens(await NativeSystemCalls.tokens())
      return
    }
    if (event.kind === "incoming") { await receive(event.payload); return }
    if (event.kind === "answer" && event.uuid && call?.uuid !== event.uuid) { if (pendingAnswers.size < 8) pendingAnswers.add(event.uuid); return }
    if (!event.uuid || event.uuid !== call?.uuid) {
      if (event.kind === "mute" || event.kind === "hold") await NativeSystemCalls.completeAction({ eventId: event.eventId, handled: false })
      return
    }
    if (event.kind === "answer") await acceptIncoming()
    else if (event.kind === "end") await finish(null, call?.incoming === true && call.answered === false)
    else if (event.kind === "audioActivated") { activatedUuid = event.uuid; await room?.media({ activated: true }) }
    else if (event.kind === "audioDeactivated") { activatedUuid = null; await room?.media({ activated: false }) }
    else if (event.kind === "mute" || event.kind === "hold") {
      const value = event.kind === "mute" ? event.muted : event.held
      let handled = false
      try { if (typeof value === "boolean") handled = await control(event.kind, value) }
      finally { await NativeSystemCalls.completeAction({ eventId: event.eventId, handled }); if (!handled) await finish("connection", false) }
    }
  }
  function observeEvents() {
    if (osWatch) return
    osWatch = NativeSystemCalls.addListener("onCallEvent", incoming => {
      // End/deactivation cannot wait behind a permission prompt, token HTTP request or SDK connect.
      if (incoming.kind === "end" && incoming.uuid && (incoming.uuid === call?.uuid || incoming.uuid === pendingIncomingUuid)) {
        if (rememberEvent(incoming.eventId)) void finish(null, call?.incoming === true && !call.answered)
        return
      }
      if (incoming.kind === "audioDeactivated" && incoming.uuid === call?.uuid) {
        if (rememberEvent(incoming.eventId)) { activatedUuid = null; void room?.media({ activated: false }).catch(() => { if (incoming.uuid === call?.uuid) void finish("permission", false) }) }
        return
      }
      if (incoming.kind === "audioActivated" && incoming.uuid === call?.uuid) {
        if (rememberEvent(incoming.eventId)) { activatedUuid = incoming.uuid ?? null; void room?.media({ activated: true }).catch(() => { if (incoming.uuid === call?.uuid) void finish("permission", false) }) }
        return
      }
      if (closed || queuedEvents >= 32) { if (incoming.uuid) void NativeSystemCalls.end({ uuid: incoming.uuid }); return }
      queuedEvents += 1
      eventQueue = eventQueue.then(() => event(incoming)).catch(() => {
        if (current() && incoming.uuid && (incoming.uuid === call?.uuid || incoming.uuid === pendingIncomingUuid)) void finish("connection", false)
      }).finally(() => { queuedEvents -= 1 })
    })
  }
  async function heartbeat() {
    if (!gesture() || Date.now() - lastHeartbeat < 20_000) return
    lastHeartbeat = Date.now()
    await backend.client.mutation(api.modules.calls.presence.heartbeat, { networkId: authority().networkId }).catch(() => undefined)
  }
  async function initialize() {
    if (initialized || closed) return
    initialized = true
    try {
      if (!applicationId) return
      const capabilities = await NativeSystemCalls.capabilities()
      if (!current() || !capabilities.enabled) return
      await configurationOpen()
      const stored = await descriptorRead
      if (!stored.ok) throw new Error("nativeBindingStorageUnavailable")
      const raw = stored.raw
      if (!current()) return
      binding = parseStoredCallBinding(raw, authority(), applicationId!, Date.now())
      if (raw && !binding) {
        let oldId: string | null = null
        try { const parsed: unknown = JSON.parse(raw); if (parsed && typeof parsed === "object" && "bindingId" in parsed && isNativeCallUuid(parsed.bindingId)) oldId = parsed.bindingId } catch { /* Unknown storage cannot authorize a global OS clear. */ }
        await Promise.all([bindingStore.clearRawIf(raw), ...(oldId ? [NativeSystemCalls.clear({ bindingId: oldId })] : [])])
      }
      if (!binding) { update({ available: true }); return }
      await NativeSystemCalls.configure(binding)
      if (!current()) return
      await registerTokens(await NativeSystemCalls.tokens())
      if (!current()) return
      update({ available: true }); observeEvents()
    } catch { if (current()) { update({ available: false, failure: "unavailable" }); if (binding) await NativeSystemCalls.clear({ bindingId: binding.bindingId }).catch(() => undefined) } }
    finally {
      if (current() && state.available) {
        sessionWatch = watchNativeQuery(backend.client.watchQuery(api.modules.platform.authentication.mySession, {}), live => { if (live !== true) void close(true).catch(() => undefined) }, () => { void close(true).catch(() => undefined) })
        heartbeatTimer = setInterval(() => { void heartbeat() }, PRESENCE_HEARTBEAT_INTERVAL_MS)
        void heartbeat()
        expiryTimer = setTimeout(() => { void close(true).catch(() => undefined) }, Math.max(0, Math.min(2_147_483_647, authority().expiresAt - Date.now())))
      }
    }
  }
  async function enableSystemCalls() {
    if (!gesture() || controlPending || finishing || state.busy || !state.available || !applicationId) return
    controlPending = true; update({ phase: "permission", busy: true, failure: null })
    fence.begin(callOwner(authority())); const stillCurrent = opCurrent()
    const session = callOwner(authority())
    let enrollment: StoredCallBinding | null = null
    try {
      await configurationOpen()
      if (!stillCurrent()) return
      // Enrollment asks notifications at this explicit gesture; no microphone or camera is acquired here.
      const permissions = await nativeRequest(() => NativeSystemCalls.requestPermissions({ video: false, notifications: true, microphone: false }), 20_000)
      if (!stillCurrent() || callOwner(authority()) !== session) return
      if (!permissions.notifications) throw new Error("nativeNotificationsRefused")
      if (binding) {
        await nativeRequest(() => backend.client.mutation(nativeCalls.unsubscribeDevice, bound()), 3_000)
        await Promise.all([NativeSystemCalls.clear({ bindingId: binding.bindingId }), bindingStore.clearIf(binding.bindingId)])
      } else await NativeSystemCalls.clear()
      if (!stillCurrent()) return
      const next = bindingStore.create(authority(), applicationId)
      enrollment = next
      await nativeRequest(() => bindingStore.write(next), 4_000)
      if (!stillCurrent()) { await bindingStore.clearIf(next.bindingId); return }
      binding = next; await NativeSystemCalls.configure(next)
      if (!stillCurrent()) return
      await registerTokens(await NativeSystemCalls.tokens())
      if (!stillCurrent()) return
      update({ busy: false, phase: "idle", failure: null }); observeEvents()
    } catch {
      if (enrollment) await Promise.allSettled([NativeSystemCalls.clear({ bindingId: enrollment.bindingId }), bindingStore.clearIf(enrollment.bindingId)])
      if (stillCurrent()) { update({ systemEnabled: false, busy: false, phase: "failed", failure: "permission" }); binding = null }
    }
    finally { controlPending = false }
  }
  async function startCall(personId: Id<"persons">, media: NativeCallMedia) {
    if (!gesture() || finishing || state.busy || controlPending || !state.available || !binding) return
    controlPending = true; fence.begin(callOwner(authority())); const stillCurrent = opCurrent()
    update({ busy: true, phase: "permission", media, incoming: false, peer: null, establishedAt: null, failure: null, muted: false, held: false, camera: false })
    try {
      await configurationOpen()
      if (!stillCurrent()) return
      const permissions = await nativeRequest(() => NativeSystemCalls.requestPermissions({ video: media === "video", notifications: false }), 20_000)
      if (!stillCurrent()) return
      if (!permissions.microphone || media === "video" && !permissions.camera) { await finish("permission", false); return }
      microphonePermission = permissions.microphone; cameraPermission = permissions.camera
      const http = await backend.fresh()
      if (!stillCurrent()) return
      update({ phase: "connecting", camera: media === "video" && authority().foreground })
      // No automatic retry: callMember has no idempotency key.
      const placement = http.mutation(api.modules.calls.direct.callMember, { networkId: authority().networkId, target: { personId }, mediaType: media })
      void placement.then(result => {
        if (!stillCurrent() && result.admitted && current() && binding) void backend.client.mutation(nativeCalls.release, { ...bound(), callId: result.callId }).catch(() => undefined)
      }).catch(() => undefined)
      const result = await nativeRequest(() => placement)
      if (!stillCurrent()) return
      if (!result.admitted) { await finish("refused", false); return }
      const target: Call = { callId: result.callId, uuid: "", media: result.mediaType, incoming: false, expiresAt: Date.now() + CALL_RING_WINDOW_MS, answered: false, answerRequested: false }
      call = target; watchCall(target); armRing(target)
      await connectCall(target, stillCurrent)
    } catch { if (stillCurrent()) await finish("connection", false) }
    finally { controlPending = false }
  }
  async function close(purge: boolean) {
    if (closing) return closing
    const initialBinding = binding
    const ending = finish(null, false)
    // Start conditional local cleanup BEFORE any query; a later owner cannot be cleared.
    const osClear = initialBinding ? NativeSystemCalls.clear({ bindingId: initialBinding.bindingId }) : Promise.resolve()
    const storeClear = purge && initialBinding ? bindingStore.clearIf(initialBinding.bindingId) : Promise.resolve()
    const descriptorClear = purge && !initialBinding ? descriptorRead.then(async stored => {
      if (!stored.ok) throw new Error("nativeBindingStorageUnavailable")
      const id = ownedStoredBindingId(stored.raw, descriptorOwner)
      if (id) await Promise.all([bindingStore.clearIf(id), NativeSystemCalls.clear({ bindingId: id })])
    }) : Promise.resolve()
    const localCleanup = Promise.allSettled([osClear, storeClear, descriptorClear])
    closed = true; fence.stop(); osWatch?.remove(); osWatch = null; sessionWatch?.(); sessionWatch = null
    if (heartbeatTimer) clearInterval(heartbeatTimer)
    if (expiryTimer) clearTimeout(expiryTimer)
    state = { ...EMPTY_CALL }; for (const listener of listeners) listener()
    closing = (async () => {
      const ids = new Set([...subscriptions.values()].map(item => item.id))
      if (purge && initialBinding) {
        try {
          const rows = await nativeRequest(() => backend.client.query(api.modules.notifications.pushSubscriptions.listMine, { networkId: authority().networkId }), 3_000)
          for (const row of rows) if (row.currentSession && row.deviceId === initialBinding.deviceId && row.applicationId === initialBinding.applicationId) ids.add(row.subscriptionId)
        } catch { /* Server revocation still invalidates all session-bound targets. */ }
      }
      await Promise.allSettled([ending, ...[...ids].map(id => backend.unsubscribe(id)),
        ...(purge && initialBinding ? [nativeRequest(() => backend.client.mutation(nativeCalls.unsubscribeDevice, { networkId: authority().networkId, applicationId: initialBinding.applicationId, deviceId: initialBinding.deviceId, bindingId: initialBinding.bindingId }), 3_000)] : []),
      ])
      const results = await localCleanup
      subscriptions.clear(); binding = null; pendingAnswers.clear(); seenEvents.clear(); backend.close()
      if (cleanupFailed || results.some(result => result.status === "rejected")) throw new Error("nativeCallsCleanupIncomplete")
    })()
    return closing
  }
  return {
    snapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    registerMediaStop(stop: () => void) { playbackStops.add(stop); return () => { playbackStops.delete(stop) } },
    initialize, enableSystemCalls, startCall, close,
    foregroundChanged() {
      if (!state.available) return
      if (authority().foreground) void heartbeat()
      else {
        const target = call
        update({ camera: false }); void room?.media({ video: false }).catch(() => { if (call === target && target) void finish("permission", false) })
        if (current()) void backend.client.mutation(api.modules.calls.presence.setOffline, { networkId: authority().networkId }).catch(() => undefined)
      }
    },
    answer() {
      if (!gesture() || !call?.incoming || call.answered || call.answerRequested || controlPending) return
      call.answerRequested = true
      const target = call
      void NativeSystemCalls.answer({ uuid: target.uuid }).catch(() => { if (call === target) void finish("connection", true) })
    },
    end() { return finish(null, call?.incoming === true && !call.answered) },
    async toggleMute() { if (!gesture() || controlPending) return; controlPending = true; try { await control("mute", !state.muted) } catch { await finish("permission", false) } finally { controlPending = false } },
    async toggleHeld() { if (!gesture() || controlPending) return; controlPending = true; try { await control("hold", !state.held) } catch { await finish("connection", false) } finally { controlPending = false } },
    async toggleCamera() {
      if (!gesture() || controlPending || !room || state.media !== "video") return
      controlPending = true; const stillCurrent = opCurrent()
      try {
        const desired = !state.camera
        if (desired) {
          const permissions = await NativeSystemCalls.requestPermissions({ video: true, notifications: false })
          if (!stillCurrent() || !authority().foreground) return
          if (!permissions.camera) { update({ camera: false, failure: "permission" }); return }
          cameraPermission = true
        }
        await room.media({ video: desired, camera: cameraPermission })
        if (stillCurrent()) update({ camera: desired })
      } catch { if (stillCurrent()) await finish("permission", false) }
      finally { controlPending = false }
    },
    minimize() { update({ minimized: true }) }, restore() { update({ minimized: false }) },
    dismiss() { if (!state.busy) update({ phase: "idle", failure: null }) },
    videos: () => room?.videos ?? [],
  }
}
export type NativeCallController = ReturnType<typeof createNativeCallController>
