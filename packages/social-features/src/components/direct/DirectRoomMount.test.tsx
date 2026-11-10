// @vitest-environment jsdom

/**
 * DL-04 — la RÉCEPTION du spectateur, éprouvée sur une SALLE SIMULÉE : ce que
 * le montage de la salle demande à LiveKit quand on choisit « Écouter
 * seulement », l'économie, ou le retour à la vidéo.
 *
 * LiveKit est doublé comme dans `CallRoomPool.test.tsx` : `<LiveKitRoom>`
 * compte ses montages, `RoomAudioRenderer` aussi ; la salle expose des
 * publications distantes fidèles à `RemoteTrackPublication` (livekit-client
 * 2.22.3) sur ce qui compte ici. Aucune preuve réelle : débit reçu, reprise
 * de l'image et téléphone en 3G restent à mesurer au lot DL-01.
 */

import { act, cleanup, render } from "@testing-library/react"
import type { Id } from "@antsia/api/engine"
import { ConnectionQuality, ConnectionState, RoomEvent, Track, VideoQuality } from "livekit-client"
import type { ReactNode } from "react"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createAppI18n } from "../../i18n"
import { directReceptionStore } from "../../stores/direct-reception-store"
import { directSessionStore } from "../../stores/direct-session-store"

type Handler = (...args: unknown[]) => void

/** Une publication distante : désir d'abonnement vrai sous `autoSubscribe`, plafond refusé hors désir. */
class SimulatedPublication {
  subscribed = true
  requestedMaxQuality: VideoQuality | undefined = undefined
  readonly setSubscribed = vi.fn((subscribed: boolean) => { this.subscribed = subscribed })
  readonly setVideoQuality = vi.fn((quality: VideoQuality) => { if (this.subscribed) this.requestedMaxQuality = quality })
  constructor(readonly trackSid: string, readonly kind: Track.Kind, readonly source: Track.Source) {}
  get isDesired() { return this.subscribed }
  /** Le serveur simulé honore aussitôt le désir. */
  get isSubscribed() { return this.subscribed }
  get videoQuality() { return this.requestedMaxQuality ?? VideoQuality.HIGH }
}

class SimulatedRoom {
  readonly remoteParticipants = new Map<string, { identity: string; trackPublications: Map<string, SimulatedPublication> }>()
  readonly localParticipant = {
    identity: "direct-v_moi",
    connectionQuality: ConnectionQuality.Excellent,
    setMicrophoneEnabled: vi.fn(async () => undefined),
    setCameraEnabled: vi.fn(async () => undefined),
  }
  readonly disconnect = vi.fn(async () => undefined)
  private readonly handlers = new Map<string, Set<Handler>>()
  on(event: string, handler: Handler) { if (!this.handlers.has(event)) this.handlers.set(event, new Set()); this.handlers.get(event)!.add(handler); return this }
  off(event: string, handler: Handler) { this.handlers.get(event)?.delete(handler); return this }
  emit(event: string, ...args: unknown[]) { for (const handler of [...(this.handlers.get(event) ?? [])]) handler(...args) }
  listeners(event: string) { return this.handlers.get(event)?.size ?? 0 }
  /** Une piste publiée PENDANT le direct : `TrackPublished`, comme livekit-client une fois connecté. */
  publish(identity: string, sid: string, kind: Track.Kind, source: Track.Source, options: { silent?: boolean } = {}) {
    if (!this.remoteParticipants.has(identity)) this.remoteParticipants.set(identity, { identity, trackPublications: new Map() })
    const participant = this.remoteParticipants.get(identity)!
    const publication = new SimulatedPublication(sid, kind, source)
    participant.trackPublications.set(sid, publication)
    if (!options.silent) this.emit(RoomEvent.TrackPublished, publication, participant)
    return publication
  }
  all() { return [...this.remoteParticipants.values()].flatMap((participant) => [...participant.trackPublications.values()]) }
  videos() { return this.all().filter((publication) => publication.kind === Track.Kind.Video) }
  audios() { return this.all().filter((publication) => publication.kind === Track.Kind.Audio) }
}

const lk = vi.hoisted(() => ({
  room: null as unknown,
  roomMounts: 0,
  roomUnmounts: 0,
  audioMounts: 0,
  audioUnmounts: 0,
  options: [] as unknown[],
}))

vi.mock("@livekit/components-react", async () => {
  const React = await import("react")
  const Context = React.createContext<unknown>(null)
  function LiveKitRoom({ options, children }: { options: unknown; children?: ReactNode }) {
    lk.options.push(options)
    React.useEffect(() => {
      lk.roomMounts += 1
      return () => { lk.roomUnmounts += 1 }
    }, [])
    return React.createElement(Context.Provider, { value: lk.room }, children)
  }
  function RoomAudioRenderer() {
    React.useEffect(() => {
      lk.audioMounts += 1
      return () => { lk.audioUnmounts += 1 }
    }, [])
    return null
  }
  return {
    LiveKitRoom,
    RoomAudioRenderer,
    useRoomContext: () => React.useContext(Context),
    useConnectionState: () => "connected",
    useLocalParticipant: () => ({ localParticipant: (lk.room as SimulatedRoom).localParticipant, isMicrophoneEnabled: false, isCameraEnabled: false }),
  }
})
vi.mock("@livekit/components-styles", () => ({}))
vi.mock("@antsia/api/network", () => ({ useNetwork: () => ({ networkId: "network-a", storagePrefix: "antsia:antsia:" }) }))
vi.mock("sonner", () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() } }))

import { DirectRoomMount } from "./DirectRoomMount"

const PREFIX = "antsia:antsia:"
const SESSION = "session-a" as Id<"liveSessions">
const i18n = createAppI18n({ locale: "fr", appResources: { fr: {}, en: {} }, defaultNS: "direct" })
let room: SimulatedRoom

function enter(role: "viewer" | "speaker") {
  directSessionStore.prepare(SESSION)
  directSessionStore.setCredentials({ sessionId: SESSION, token: "jeton-fictif", wsUrl: "wss://test.invalid", role })
  return render(<I18nextProvider i18n={i18n}><DirectRoomMount sessionId={SESSION} /></I18nextProvider>)
}
const choose = (patch: Parameters<typeof directReceptionStore.setPreference>[1]) => act(() => directReceptionStore.setPreference(PREFIX, patch))

beforeEach(() => {
  window.localStorage.clear()
  directSessionStore.__resetForTests()
  directReceptionStore.__resetForTests()
  room = new SimulatedRoom()
  lk.room = room
  lk.roomMounts = 0
  lk.roomUnmounts = 0
  lk.audioMounts = 0
  lk.audioUnmounts = 0
  lk.options = []
  // Le plateau déjà là à l'entrée : deux intervenants, dont un qui partage son écran.
  room.publish("direct-s_alice", "TR_alice_cam", Track.Kind.Video, Track.Source.Camera, { silent: true })
  room.publish("direct-s_alice", "TR_alice_mic", Track.Kind.Audio, Track.Source.Microphone, { silent: true })
  room.publish("direct-s_bob", "TR_bob_cam", Track.Kind.Video, Track.Source.Camera, { silent: true })
  room.publish("direct-s_bob", "TR_bob_mic", Track.Kind.Audio, Track.Source.Microphone, { silent: true })
  room.publish("direct-s_bob", "TR_bob_screen", Track.Kind.Video, Track.Source.ScreenShare, { silent: true })
})
afterEach(() => { cleanup(); directSessionStore.__resetForTests(); directReceptionStore.__resetForTests(); window.localStorage.clear() })

/** Le son n'a JAMAIS été interrompu : pistes audio abonnées et intouchées, salle et rendu audio jamais remontés. */
function expectSoundUninterrupted() {
  for (const audio of room.audios()) {
    expect(audio.isSubscribed, audio.trackSid).toBe(true)
    expect(audio.setSubscribed, audio.trackSid).not.toHaveBeenCalled()
  }
  expect(room.disconnect).not.toHaveBeenCalled()
  expect([lk.roomMounts, lk.roomUnmounts, lk.audioMounts, lk.audioUnmounts]).toEqual([1, 0, 1, 0])
  expect(new Set(lk.options).size).toBe(1)
  expect(directSessionStore.getState()).toMatchObject({ sessionId: SESSION, phase: "connected", credentials: { token: "jeton-fictif", role: "viewer" } })
}

describe("DL-04 — écouter seulement, sur la salle simulée", () => {
  it("rien ne change tant que la personne n'a rien choisi (automatique = le direct d'avant)", () => {
    enter("viewer")
    for (const publication of room.all()) {
      expect(publication.setSubscribed).not.toHaveBeenCalled()
      expect(publication.setVideoQuality).not.toHaveBeenCalled()
    }
  })

  it("aucune piste vidéo abonnée en écoute seule — caméras et partage d'écran —, le son continue, sans reconnexion", () => {
    enter("viewer")
    choose({ mode: "audio" })
    expect(room.videos().map((publication) => [publication.trackSid, publication.isSubscribed])).toEqual([["TR_alice_cam", false], ["TR_bob_cam", false], ["TR_bob_screen", false]])
    expectSoundUninterrupted()
  })

  it("une piste publiée APRÈS le choix (nouvel intervenant, partage qui démarre, abonnement d'office) n'est jamais gardée", () => {
    enter("viewer")
    choose({ mode: "audio" })
    const carolCamera = room.publish("direct-s_carol", "TR_carol_cam", Track.Kind.Video, Track.Source.Camera)
    const carolMic = room.publish("direct-s_carol", "TR_carol_mic", Track.Kind.Audio, Track.Source.Microphone)
    const aliceScreen = room.publish("direct-s_alice", "TR_alice_screen", Track.Kind.Video, Track.Source.ScreenShare)
    expect([carolCamera.isSubscribed, aliceScreen.isSubscribed]).toEqual([false, false])
    expect(carolMic.isSubscribed).toBe(true)
    // Le serveur abonne d'office (autoSubscribe) une piste dont la publication n'est pas passée par ici.
    const late = room.publish("direct-s_dan", "TR_dan_cam", Track.Kind.Video, Track.Source.Camera, { silent: true })
    act(() => room.emit(RoomEvent.TrackSubscribed, {}, late, room.remoteParticipants.get("direct-s_dan")))
    expect(late.isSubscribed).toBe(false)
    expectSoundUninterrupted()
  })

  it("une reprise de connexion qui recrée les publications ne rallume pas l'image", () => {
    enter("viewer")
    choose({ mode: "audio" })
    // Reprise complète : de nouvelles publications, abonnées d'office, sans `TrackPublished`.
    room.remoteParticipants.clear()
    room.publish("direct-s_alice", "TR_alice_cam_2", Track.Kind.Video, Track.Source.Camera, { silent: true })
    room.publish("direct-s_alice", "TR_alice_mic_2", Track.Kind.Audio, Track.Source.Microphone, { silent: true })
    act(() => room.emit(RoomEvent.ConnectionStateChanged, ConnectionState.Connected))
    expect(room.videos().every((publication) => !publication.isSubscribed)).toBe(true)
    expectSoundUninterrupted()
  })

  it("retour à la vidéo sans quitter la salle : chaque piste vidéo est réabonnée, le son n'a pas bougé", () => {
    enter("viewer")
    choose({ mode: "audio" })
    choose({ mode: "video" })
    expect(room.videos().every((publication) => publication.isSubscribed)).toBe(true)
    for (const video of room.videos()) expect(video.setSubscribed.mock.calls).toEqual([[false], [true]])
    expectSoundUninterrupted()
  })

  it("économie : la couche la plus basse, pour toute piste vidéo, même nouvelle ; automatique lève le plafond", () => {
    enter("viewer")
    choose({ quality: "low" })
    expect(room.videos().every((publication) => publication.videoQuality === VideoQuality.LOW)).toBe(true)
    const carol = room.publish("direct-s_carol", "TR_carol_cam", Track.Kind.Video, Track.Source.Camera)
    expect(carol.videoQuality).toBe(VideoQuality.LOW)
    // Écoute seule puis retour : le plafond suit la piste réabonnée.
    choose({ mode: "audio" })
    choose({ mode: "video" })
    expect(room.videos().every((publication) => publication.isSubscribed && publication.videoQuality === VideoQuality.LOW)).toBe(true)
    choose({ quality: "auto" })
    expect(room.videos().every((publication) => publication.videoQuality === VideoQuality.HIGH)).toBe(true)
    for (const audio of room.audios()) expect(audio.setVideoQuality).not.toHaveBeenCalled()
    expectSoundUninterrupted()
  })

  it("à l'antenne, la préférence d'écoute seule ne retire aucune image : le plateau reste visible", () => {
    directReceptionStore.setPreference(PREFIX, { mode: "audio", quality: "low" })
    enter("speaker")
    room.publish("direct-s_carol", "TR_carol_cam", Track.Kind.Video, Track.Source.Camera)
    for (const publication of room.all()) {
      expect(publication.setSubscribed).not.toHaveBeenCalled()
      expect(publication.setVideoQuality).not.toHaveBeenCalled()
    }
  })

  it("se détache de la salle au démontage", () => {
    const view = enter("viewer")
    expect(room.listeners(RoomEvent.TrackPublished)).toBe(1)
    view.unmount()
    for (const event of [RoomEvent.TrackPublished, RoomEvent.TrackSubscribed, RoomEvent.ConnectionStateChanged, RoomEvent.ConnectionQualityChanged]) expect(room.listeners(event), event).toBe(0)
  })
})

describe("DL-04 — suggestion sur connexion faible", () => {
  it("MA connexion faible propose l'écoute seule une fois par direct, sans jamais basculer d'office", () => {
    enter("viewer")
    act(() => room.emit(RoomEvent.ConnectionQualityChanged, ConnectionQuality.Poor, { identity: "direct-s_alice" }))
    expect(directReceptionStore.isHintOffered(SESSION)).toBe(false)
    act(() => room.emit(RoomEvent.ConnectionQualityChanged, ConnectionQuality.Poor, room.localParticipant))
    expect(directReceptionStore.isHintOffered(SESSION)).toBe(true)
    expect(directReceptionStore.getPreference(PREFIX).mode).toBe("video")
    expect(room.videos().every((publication) => publication.isSubscribed)).toBe(true)
    act(() => directReceptionStore.closeHint(SESSION))
    act(() => room.emit(RoomEvent.ConnectionQualityChanged, ConnectionQuality.Lost, room.localParticipant))
    expect(directReceptionStore.isHintOffered(SESSION)).toBe(false)
  })

  it("une connexion déjà faible à l'entrée est proposée ; jamais à l'antenne", () => {
    room.localParticipant.connectionQuality = ConnectionQuality.Poor
    const view = enter("speaker")
    act(() => room.emit(RoomEvent.ConnectionQualityChanged, ConnectionQuality.Poor, room.localParticipant))
    expect(directReceptionStore.isHintOffered(SESSION)).toBe(false)
    view.unmount()
    directSessionStore.__resetForTests()
    enter("viewer")
    expect(directReceptionStore.isHintOffered(SESSION)).toBe(true)
  })
})
