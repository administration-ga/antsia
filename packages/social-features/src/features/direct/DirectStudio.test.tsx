// @vitest-environment jsdom
// Dupliqué de socle/packages/agent-features/src/features/direct/DirectScene.test.tsx @ ad2e7fdc2 — adaptations : scénarios de contenu et de pin sur personId ANTSIA, salle persistante simulée et commandes d’intention sans nouvelle connexion.
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { Id } from "@antsia/api/engine"
import { noDirectPermissions } from "@antsia/social-domain/live/permissions"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createAppI18n } from "../../i18n"
import { directSessionStore } from "../../stores/direct-session-store"
import { DirectStudio } from "./DirectStudio"
import type { DirectSession } from "./DirectPage"
import { DIRECT_SCENE_CELL_CLASS } from "./direct-tile-fit"

const mocks = vi.hoisted(() => ({ cameras: [] as unknown[], screens: [] as unknown[], speaking: [] as unknown[], screenShare: vi.fn() }))
vi.mock("@livekit/components-react", () => ({
  useTracks: (sources: { source: string }[]) => sources[0]!.source === "camera" ? mocks.cameras : mocks.screens,
  useSpeakingParticipants: () => mocks.speaking,
  useLocalParticipant: () => ({ localParticipant: { setScreenShareEnabled: mocks.screenShare }, isScreenShareEnabled: false }),
  ParticipantTile: ({ trackRef }: { trackRef: { source: string; participant: { attributes: { personId: string } } } }) => <div data-testid={`${trackRef.source}-${trackRef.participant.attributes.personId}`} />,
}))
const sessionId = "session-a" as Id<"liveSessions">
const i18n = createAppI18n({ locale: "fr", appResources: { fr: {}, en: {} }, defaultNS: "direct" })
const track = (personId: string, source: "camera" | "screen_share") => ({ source, participant: { identity: `direct-s_${personId}`, attributes: { personId } } })
function session(patch: Partial<DirectSession> = {}): DirectSession {
  return { sessionId, title: "Recette", status: "live", audience: "public", chatMode: "open", stageFormat: "computer", stageLayout: "adaptive", maxViewers: 200, viewerRole: "viewer", viewerIsInvitee: false, permissions: noDirectPermissions(), host: { displayName: "Même nom", handle: "host", avatarUrl: null },
    speakers: [{ personId: "alice" as Id<"persons">, role: "host", displayName: "Même nom", handle: "alice", avatarUrl: null, isSelf: false }, { personId: "bob" as Id<"persons">, role: "speaker", displayName: "Même nom", handle: "bob", avatarUrl: null, isSelf: false }], spotlight: null, startedAt: 1, endedAt: null, maxDurationAt: 10000, endReason: null, counters: { viewers: 0, present: 0, comments: 0, reactions: 0 }, announcePostId: null, replay: null, recording: { requested: false, consentedAt: null, proposedSpeakerAwaitingConsent: false }, ...patch }
}
const tree = (value = session()) => <I18nextProvider i18n={i18n}><DirectStudio session={value} /></I18nextProvider>
beforeEach(() => { vi.clearAllMocks(); directSessionStore.__resetForTests(); mocks.cameras = [track("alice", "camera"), track("bob", "camera")]; mocks.screens = []; mocks.speaking = [] })
afterEach(() => { cleanup(); directSessionStore.__resetForTests() })

describe("studio F3b — présentation et commandes", () => {
  it("un écran domine, sa caméra reste visible et un second partage n’en remplace pas le visage", () => {
    mocks.screens = [track("bob", "screen_share"), track("alice", "screen_share")]
    render(tree())
    expect(screen.getByTestId("screen_share-alice")).toBeInTheDocument()
    expect(screen.queryByTestId("screen_share-bob")).toBeNull()
    expect(screen.getByTestId("camera-alice")).toBeInTheDocument()
    expect(screen.getByTestId("camera-bob")).toBeInTheDocument()
  })
  it("spotlight distingue les homonymes et une épingle locale prime puis disparaît avec la personne", () => {
    const value = session({ spotlight: { personId: "bob" as Id<"persons"> } })
    const view = render(tree(value))
    expect(screen.getByLabelText("Scène : personne mise en avant")).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole("button", { name: "Épingler Même nom sur mon écran" })[1]!)
    expect(screen.getByRole("button", { name: "Désépingler Même nom de mon écran" })).toBeInTheDocument()
    view.rerender(tree({ ...value, speakers: value.speakers.filter((speaker) => speaker.personId === "bob") }))
    expect(screen.queryByRole("button", { name: "Désépingler Même nom de mon écran" })).toBeNull()
    expect(screen.queryByTestId("camera-alice")).toBeNull()
  })
  it("la vue cinéma compte les personnes cachées sans refaire une connexion", () => {
    render(tree()); fireEvent.change(screen.getByLabelText("Disposition de mon écran"), { target: { value: "cinema" } })
    expect(screen.getByText("1 autres intervenants non affichés")).toBeInTheDocument()
    expect(screen.queryByTestId("camera-bob")).toBeNull()
    expect(directSessionStore.getState().sessionId).toBeNull()
  })
  it("les places vides apparaissent seulement dans une grille explicitement fixe", () => {
    const view = render(tree()); expect(screen.queryByText("Place libre")).toBeNull()
    view.rerender(tree(session({ stageLayout: "fixed" }))); expect(screen.getAllByText("Place libre")).toHaveLength(6)
  })
  it("un rôle speaker avec un ancien jeton viewer ne peut pas publier", () => {
    directSessionStore.prepare(sessionId); directSessionStore.setCredentials({ sessionId, token: "test", wsUrl: "wss://test.invalid", role: "viewer" }); directSessionStore.setPhase("connected")
    render(tree(session({ viewerRole: "speaker" })))
    expect(screen.queryByRole("button", { name: "Couper le micro" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Couper la caméra" })).toBeNull()
  })
  it("une coupure de micro modifie l’intention qui survivra à la reconnexion", () => {
    directSessionStore.prepare(sessionId); directSessionStore.setCredentials({ sessionId, token: "test", wsUrl: "wss://test.invalid", role: "speaker" }); directSessionStore.setPhase("connected")
    render(tree(session({ viewerRole: "speaker" })))
    fireEvent.click(screen.getByRole("button", { name: "Couper le micro" }))
    expect(directSessionStore.getState().intent.micEnabled).toBe(false)
    expect(mocks.screenShare).not.toHaveBeenCalled()
  })
  it("le premier clic sur Caméra l’allume en quittant audio seul", () => {
    directSessionStore.prepare(sessionId); directSessionStore.setCredentials({ sessionId, token: "test", wsUrl: "wss://test.invalid", role: "speaker" }); directSessionStore.setPhase("connected"); directSessionStore.setIntent({ audioOnly: true, cameraEnabled: true })
    render(tree(session({ viewerRole: "speaker" })))
    fireEvent.click(screen.getByRole("button", { name: "Allumer la caméra" }))
    expect(directSessionStore.getState().intent).toMatchObject({ audioOnly: false, cameraEnabled: true })
  })
  // Mesuré dans Chromium (390 px) : `h-full` + `aspect-ratio` donnait des tuiles de 332 px
  // dans des colonnes de 162 px. Une tuile se borne à sa case : largeur ET hauteur
  // (la largeur en unités de conteneur, que jsdom ne retient pas, est éprouvée par `direct-tile-fit`).
  it("chaque tuile et chaque place libre restent contenues dans leur case, à la proportion de la source", () => {
    const contained = (box: HTMLElement) => {
      expect(box.parentElement).toHaveClass(...DIRECT_SCENE_CELL_CLASS.split(" "))
      expect(box).not.toHaveClass("h-full")
      expect(parseFloat(box.style.aspectRatio)).toBeCloseTo(16 / 9)
    }
    const pinned = () => screen.getAllByRole("button", { name: /^Épingler/ }).map((button) => button.parentElement!)
    const view = render(tree(session({ stageFormat: "television", stageLayout: "fixed" })))
    for (const box of [...pinned(), ...screen.getAllByText("Place libre")]) contained(box)
    view.rerender(tree(session({ stageFormat: "television" })))
    fireEvent.change(screen.getByLabelText("Disposition de mon écran"), { target: { value: "speaker" } })
    expect(screen.getByLabelText("Scène : personne qui parle en grand")).toBeInTheDocument()
    expect(pinned()).toHaveLength(2)
    for (const box of pinned()) contained(box)
  })
  it("un spotlight hors connexion ne remplace pas une présentation disponible", () => {
    mocks.cameras = [track("alice", "camera")]; mocks.screens = [track("alice", "screen_share")]
    render(tree(session({ spotlight: { personId: "bob" as Id<"persons"> } })))
    expect(screen.getByLabelText("Scène : présentation et intervenants en bandeau")).toBeInTheDocument()
  })
})
