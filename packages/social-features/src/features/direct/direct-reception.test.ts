import { ConnectionQuality, Track, VideoQuality } from "livekit-client"
import { describe, expect, it } from "vitest"

import {
  applyReceptionToPublication,
  applyReceptionToRoom,
  DIRECT_RECEPTION_DEFAULT,
  directReceptionStorageKey,
  effectiveDirectReception,
  isWeakDirectConnection,
  parseStoredDirectReception,
  serializeDirectReception,
  type DirectReceptionPublication,
} from "./direct-reception"

/**
 * Une publication distante simulée, fidèle à `RemoteTrackPublication` de
 * livekit-client 2.22.3 sur ce qui compte ici : désir d'abonnement vrai sous
 * `autoSubscribe`, `videoQuality` = `requestedMaxQuality ?? HIGH`, et un
 * plafond REFUSÉ sur une piste non désirée (`isManualOperationAllowed`).
 */
class SimulatedPublication implements DirectReceptionPublication {
  subscribed = true
  requestedMaxQuality: VideoQuality | undefined = undefined
  readonly calls: string[] = []
  constructor(readonly kind: Track.Kind) {}
  get isDesired() { return this.subscribed }
  get videoQuality() { return this.requestedMaxQuality ?? VideoQuality.HIGH }
  setSubscribed(subscribed: boolean) { this.calls.push(`subscribed:${subscribed}`); this.subscribed = subscribed }
  setVideoQuality(quality: VideoQuality) {
    if (!this.subscribed) { this.calls.push("quality:refused"); return }
    this.calls.push(`quality:${quality === VideoQuality.LOW ? "LOW" : quality === VideoQuality.HIGH ? "HIGH" : "MEDIUM"}`)
    this.requestedMaxQuality = quality
  }
}

describe("DL-04 — préférence de réception, relue sans jamais lever", () => {
  it("retombe sur le défaut pour toute forme inconnue, abîmée ou démesurée", () => {
    for (const raw of [null, "", "{", "[]", "42", "null", JSON.stringify({ mode: "radio", quality: "4k" }), "x".repeat(300)]) {
      expect(parseStoredDirectReception(raw)).toEqual(DIRECT_RECEPTION_DEFAULT)
    }
    expect(parseStoredDirectReception(JSON.stringify({ mode: "audio" }))).toEqual({ mode: "audio", quality: "auto" })
    expect(parseStoredDirectReception(JSON.stringify({ quality: "low", extra: true }))).toEqual({ mode: "video", quality: "low" })
  })
  it("s'écrit et se relit à l'identique, sous le préfixe du réseau", () => {
    const preference = { mode: "audio", quality: "low" } as const
    expect(parseStoredDirectReception(serializeDirectReception(preference))).toEqual(preference)
    expect(directReceptionStorageKey("antsia:antsia:")).toBe("antsia:antsia:direct-reception:v1")
  })
  it("ne vaut que pour un jeton de spectateur : à l'antenne, le plateau reste visible", () => {
    const listening = { mode: "audio", quality: "low" } as const
    expect(effectiveDirectReception("viewer", listening)).toBe(listening)
    expect(effectiveDirectReception("speaker", listening)).toEqual(DIRECT_RECEPTION_DEFAULT)
    expect(effectiveDirectReception(null, listening)).toEqual(DIRECT_RECEPTION_DEFAULT)
  })
})

describe("DL-04 — application à une salle", () => {
  it("le son n'est jamais touché, quel que soit le réglage", () => {
    const audio = new SimulatedPublication(Track.Kind.Audio)
    for (const reception of [{ mode: "audio", quality: "low" }, { mode: "video", quality: "low" }, DIRECT_RECEPTION_DEFAULT] as const) applyReceptionToPublication(audio, reception)
    expect(audio.calls).toEqual([])
    expect(audio.isDesired).toBe(true)
  })
  it("écoute seule : désabonne la vidéo ; retour : réabonne PUIS plafonne, sans geste superflu", () => {
    const camera = new SimulatedPublication(Track.Kind.Video)
    applyReceptionToPublication(camera, { mode: "audio", quality: "low" })
    applyReceptionToPublication(camera, { mode: "audio", quality: "low" })
    expect(camera.calls).toEqual(["subscribed:false"])
    applyReceptionToPublication(camera, { mode: "video", quality: "low" })
    expect(camera.calls).toEqual(["subscribed:false", "subscribed:true", "quality:LOW"])
  })
  it("automatique ne pose rien sur une piste jamais plafonnée et lève le plafond de l'économie", () => {
    const fresh = new SimulatedPublication(Track.Kind.Video)
    applyReceptionToPublication(fresh, DIRECT_RECEPTION_DEFAULT)
    expect(fresh.calls).toEqual([])
    const saved = new SimulatedPublication(Track.Kind.Video)
    applyReceptionToPublication(saved, { mode: "video", quality: "low" })
    applyReceptionToPublication(saved, DIRECT_RECEPTION_DEFAULT)
    applyReceptionToPublication(saved, DIRECT_RECEPTION_DEFAULT)
    expect(saved.calls).toEqual(["quality:LOW", "quality:HIGH"])
  })
  it("parcourt toutes les publications de toutes les personnes (caméras et partage d'écran)", () => {
    const pubs = { aliceCamera: new SimulatedPublication(Track.Kind.Video), aliceMic: new SimulatedPublication(Track.Kind.Audio), bobScreen: new SimulatedPublication(Track.Kind.Video) }
    const room = { remoteParticipants: new Map([["alice", { trackPublications: new Map([["TR_a1", pubs.aliceCamera], ["TR_a2", pubs.aliceMic]]) }], ["bob", { trackPublications: new Map([["TR_b1", pubs.bobScreen]]) }]]) }
    applyReceptionToRoom(room, { mode: "audio", quality: "auto" })
    expect([pubs.aliceCamera.isDesired, pubs.aliceMic.isDesired, pubs.bobScreen.isDesired]).toEqual([false, true, false])
  })
  it("une connexion faible, c'est `poor` ou `lost` ; l'absence de mesure n'alarme pas", () => {
    expect([ConnectionQuality.Poor, ConnectionQuality.Lost].map(isWeakDirectConnection)).toEqual([true, true])
    expect([ConnectionQuality.Excellent, ConnectionQuality.Good, ConnectionQuality.Unknown, undefined].map(isWeakDirectConnection)).toEqual([false, false, false, false])
  })
})
