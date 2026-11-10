import { ConnectionState, Room, RoomEvent, Track } from "livekit-client"
import { Platform } from "react-native"
import { nativeRequest } from "@antsia/social-native/request"
import { CALL_RECONNECT_MAX_MS, callMediaEstablished, callReconnectDelay, createCallResourceLease, mayPublishCallMedia } from "./call-state"

let globalsRegistered = false
const mediaOwnership = createCallResourceLease()
export async function createNativeCallRoom(options: {
  current: () => boolean
  changed: () => void
  connected: () => void
  disconnected: () => void
  reconnecting: () => void
  established: (at: number) => void
  mediaFailed: () => void
  revalidate: () => Promise<boolean>
}) {
  // Optional native code is evaluated only after native capability + server configuration.
  const lease = await mediaOwnership.acquire(options.current)
  const { AudioSession, registerGlobals } = await import("@livekit/react-native")
  if (!lease.current()) throw new Error("nativeCallRoomSuperseded")
  if (!globalsRegistered) { registerGlobals({ autoConfigureAudioSession: false }); globalsRegistered = true }
  let stopped = false, activated = false, microphone = false, camera = false, video = false, held = false, muted = false, validated = true
  let serial = 0, establishedAt: number | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined
  let stopping: Promise<void> | null = null
  let hardwareFailure = false
  const mediaOperations = new Set<Promise<unknown>>()
  function mediaOperation<T>(run: () => Promise<T>): Promise<T> {
    // Register before starting: an OS interruption can otherwise arrive inside SDK setup.
    const operation = Promise.resolve().then(run)
    mediaOperations.add(operation)
    void operation.then(() => { mediaOperations.delete(operation) }, () => { mediaOperations.delete(operation) })
    return operation
  }
  const current = () => !stopped && lease.current()
  const room = new Room({ adaptiveStream: { pixelDensity: "screen" }, dynacast: true,
    reconnectPolicy: { nextRetryDelayInMs: context => callReconnectDelay(context, current()) } })
  const stopLocalTracks = () => {
    for (const publication of room.localParticipant.trackPublications.values()) {
      try { publication.track?.stop() } catch { hardwareFailure = true }
    }
  }
  const detachStoppedTracks = async () => {
    const tracks = [...room.localParticipant.trackPublications.values()].flatMap(publication => publication.track ? [publication.track] : [])
    for (const track of tracks) { try { track.stop() } catch { hardwareFailure = true } }
    await Promise.allSettled(tracks.map(track => room.localParticipant.unpublishTrack(track, true)))
  }
  const stopDisallowedTracks = async () => {
    if (!current() || !activated || held || !validated) { stopLocalTracks(); await detachStoppedTracks(); return }
    const tracks = [...room.localParticipant.trackPublications.values()].filter(publication =>
      publication.source === Track.Source.Camera ? !video || !camera : publication.source === Track.Source.Microphone && (!microphone || muted),
    ).flatMap(publication => publication.track ? [publication.track] : [])
    for (const track of tracks) { try { track.stop() } catch { hardwareFailure = true } }
    await Promise.allSettled(tracks.map(track => room.localParticipant.unpublishTrack(track, true)))
  }
  const observe = () => {
    if (!current() || !validated) return
    if (establishedAt === null && callMediaEstablished(room.state === ConnectionState.Connected, room.remoteParticipants.size)) {
      establishedAt = Date.now(); options.established(establishedAt)
    }
    options.changed()
  }
  const remoteSubscriptions = () => {
    if (!current()) return
    for (const participant of room.remoteParticipants.values()) for (const publication of participant.trackPublications.values()) publication.setSubscribed(validated && activated && !held)
  }
  const publish = async () => {
    if (!current()) return
    const at = ++serial
    const desired = mayPublishCallMedia({ current: current() && validated, connected: room.state === ConnectionState.Connected, activated, held, microphone: microphone && !muted, camera, video })
    if (!activated || held || !validated) {
      stopLocalTracks()
      await detachStoppedTracks()
      await AudioSession.stopAudioSession()
    } else if (current()) await AudioSession.startAudioSession()
    if (!current() || serial !== at) return
    // These APIs manipulate actual tracks, not just the labels of the surface.
    await room.localParticipant.setMicrophoneEnabled(desired.audio)
    if (!current() || serial !== at) { await stopDisallowedTracks(); return }
    await room.localParticipant.setCameraEnabled(desired.video)
    if (!current() || serial !== at) { await stopDisallowedTracks(); return }
    remoteSubscriptions()
    observe()
  }
  const publishTracked = () => mediaOperation(publish)
  room.on(RoomEvent.Connected, () => { if (current()) { options.connected(); observe(); void publishTracked().catch(options.mediaFailed) } })
  room.on(RoomEvent.Reconnecting, () => {
    if (!current()) return
    validated = false; stopLocalTracks(); remoteSubscriptions()
    void mediaOperation(detachStoppedTracks).catch(options.mediaFailed)
    options.reconnecting()
    if (!reconnectTimer) reconnectTimer = setTimeout(() => { if (current()) options.disconnected() }, CALL_RECONNECT_MAX_MS)
  })
  room.on(RoomEvent.Reconnected, () => {
    if (!current()) return
    void nativeRequest(options.revalidate, 10_000).then(accepted => {
      if (!current()) return
      if (!accepted) { options.disconnected(); return }
      validated = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      reconnectTimer = undefined
      options.connected(); observe(); void publishTracked().catch(options.mediaFailed)
    }).catch(() => { if (current()) options.disconnected() })
  })
  room.on(RoomEvent.Disconnected, () => { if (current()) options.disconnected() })
  room.on(RoomEvent.ParticipantConnected, () => { remoteSubscriptions(); observe() }).on(RoomEvent.ParticipantDisconnected, observe)
  room.on(RoomEvent.TrackPublished, remoteSubscriptions)
  room.on(RoomEvent.TrackSubscribed, () => { remoteSubscriptions(); observe() }).on(RoomEvent.TrackUnsubscribed, observe)
  room.on(RoomEvent.LocalTrackPublished, () => {
    if (!current() || !validated || !activated || held) { stopLocalTracks(); void mediaOperation(detachStoppedTracks).catch(options.mediaFailed); return }
    observe()
  }).on(RoomEvent.LocalTrackUnpublished, observe)
  room.on(RoomEvent.MediaDevicesError, () => { if (current()) options.mediaFailed() })
  const stop = () => {
    if (stopping) return stopping
    stopped = true; serial += 1; activated = false
    if (reconnectTimer) clearTimeout(reconnectTimer)
    stopLocalTracks(); room.removeAllListeners()
    const pending = [...mediaOperations]
    stopping = (async () => {
      // Disconnect cancels connection work. Never grant a successor the audio lease while
      // an older startAudioSession/publish can still settle and reactivate global audio.
      const disconnect = Promise.allSettled([room.disconnect(true)])
      await Promise.allSettled(pending)
      stopLocalTracks()
      const results = [...await disconnect, ...await Promise.allSettled([room.disconnect(true)])]
      await AudioSession.stopAudioSession()
      if (hardwareFailure || results.some(result => result.status === "rejected")) throw new Error("nativeCallMediaCleanupFailed")
    })()
    return stopping
  }
  if (!lease.install(stop)) { await stop(); throw new Error("nativeCallRoomSuperseded") }
  return {
    room,
    connect(serverUrl: string, token: string) { return mediaOperation(async () => {
      if (!current()) return
      // CallKit owns activation on iOS; connecting must not activate AVAudioSession first.
      if (Platform.OS !== "ios") await nativeRequest(() => AudioSession.startAudioSession(), 5_000)
      if (!current()) return
      const connecting = mediaOperation(() => room.connect(serverUrl, token, { maxRetries: 0, autoSubscribe: false }))
      void connecting.then(() => {
        if (!current()) { stopLocalTracks(); void room.disconnect(true).catch(() => undefined) }
      }).catch(() => undefined)
      await nativeRequest(() => connecting, 12_000)
      if (!current()) { stopLocalTracks(); await room.disconnect(true) }
    }) },
    async media(next: { activated?: boolean; microphone?: boolean; camera?: boolean; video?: boolean; held?: boolean; muted?: boolean }) {
      if (next.activated !== undefined) activated = next.activated
      if (next.microphone !== undefined) microphone = next.microphone
      if (next.camera !== undefined) camera = next.camera
      if (next.video !== undefined) video = next.video
      if (next.held !== undefined) held = next.held
      if (next.muted !== undefined) muted = next.muted
      if (!current()) return
      // Stop is synchronous even if an older SDK operation is still draining.
      if (!activated || held) stopLocalTracks()
      await publishTracked()
    },
    stop,
    get videos() {
      const participants = [room.localParticipant, ...room.remoteParticipants.values()]
      return participants.flatMap(participant => [...participant.videoTrackPublications.values()].filter(publication => publication.source === Track.Source.Camera && publication.track !== undefined && !publication.isMuted).map(publication => ({ participant, publication, source: Track.Source.Camera })))
    },
  }
}
export type NativeCallRoom = Awaited<ReturnType<typeof createNativeCallRoom>>
