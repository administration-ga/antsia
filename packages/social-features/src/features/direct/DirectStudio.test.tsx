// @vitest-environment jsdom
// Dupliqué de socle/packages/agent-features/src/features/direct/DirectScene.test.tsx @ ad2e7fdc2 — adaptations : scénarios de contenu et de pin sur personId ANTSIA, salle persistante simulée et commandes d’intention sans nouvelle connexion ; DL-04 : réception du spectateur (écoute seule, image, suggestion), réservée au jeton de spectateur.
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import type { Id } from "@antsia/api/engine"
import { noDirectPermissions } from "@antsia/social-domain/live/permissions"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createAppI18n } from "../../i18n"
import { directReceptionStore } from "../../stores/direct-reception-store"
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
vi.mock("@antsia/api/network", () => ({ useNetwork: () => ({ storagePrefix: "antsia:antsia:" }) }))
const PREFIX = "antsia:antsia:"
const sessionId = "session-a" as Id<"liveSessions">
const i18n = createAppI18n({ locale: "fr", appResources: { fr: {}, en: {} }, defaultNS: "direct" })
const track = (personId: string, source: "camera" | "screen_share") => ({ source, participant: { identity: `direct-s_${personId}`, attributes: { personId } } })
function session(patch: Partial<DirectSession> = {}): DirectSession {
  return { sessionId, title: "Recette", status: "live", audience: "public", chatMode: "open", stageFormat: "computer", stageLayout: "adaptive", maxViewers: 200, viewerRole: "viewer", viewerIsInvitee: false, permissions: noDirectPermissions(), host: { displayName: "Même nom", handle: "host", avatarUrl: null },
    speakers: [{ personId: "alice" as Id<"persons">, role: "host", displayName: "Même nom", handle: "alice", avatarUrl: null, isSelf: false }, { personId: "bob" as Id<"persons">, role: "speaker", displayName: "Même nom", handle: "bob", avatarUrl: null, isSelf: false }], spotlight: null, startedAt: 1, endedAt: null, maxDurationAt: 10000, endReason: null, counters: { viewers: 0, present: 0, comments: 0, reactions: 0 }, announcePostId: null, replay: null, recording: { requested: false, consentedAt: null, proposedSpeakerAwaitingConsent: false }, ...patch }
}
const tree = (value = session()) => <I18nextProvider i18n={i18n}><DirectStudio session={value} /></I18nextProvider>
beforeEach(() => { vi.clearAllMocks(); directSessionStore.__resetForTests(); directReceptionStore.__resetForTests(); window.localStorage.clear(); mocks.cameras = [track("alice", "camera"), track("bob", "camera")]; mocks.screens = []; mocks.speaking = [] })
afterEach(() => { cleanup(); directSessionStore.__resetForTests(); directReceptionStore.__resetForTests(); window.localStorage.clear() })

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

describe("DL-04 — réception du spectateur", () => {
  const asViewer = () => { directSessionStore.prepare(sessionId); directSessionStore.setCredentials({ sessionId, token: "test", wsUrl: "wss://test.invalid", role: "viewer" }); directSessionStore.setPhase("connected") }
  it("« Écouter seulement » remplace la scène par un fond sobre avec qui parle, et dit le partage d’écran coupé", () => {
    asViewer(); mocks.screens = [track("bob", "screen_share")]; mocks.speaking = [{ identity: "direct-s_bob", attributes: { personId: "bob" } }]
    render(tree())
    const toggle = screen.getByRole("button", { name: "Écouter seulement" })
    expect(toggle).toHaveAttribute("aria-pressed", "false")
    expect(screen.getByRole("radio", { name: "Automatique" })).toBeChecked()
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute("aria-pressed", "true")
    expect(directReceptionStore.getPreference(PREFIX)).toEqual({ mode: "audio", quality: "auto" })
    const stage = screen.getByRole("group", { name: "Écoute seule" })
    expect(within(stage).getByText("Même nom parle")).toBeInTheDocument()
    expect(within(stage).getByText("Un partage d’écran est en cours : il est coupé aussi en écoute seule.")).toBeInTheDocument()
    // Aucun lecteur de piste vidéo monté : ni plateau, ni vignettes, ni présentation.
    expect(screen.queryByTestId("camera-alice")).toBeNull()
    expect(screen.queryByTestId("camera-bob")).toBeNull()
    expect(screen.queryByTestId("screen_share-bob")).toBeNull()
    expect(screen.queryByLabelText("Disposition de mon écran")).toBeNull()
    expect(screen.getByRole("radio", { name: "Économie" })).toBeDisabled()
  })
  it("retour à la vidéo sans quitter la salle : les tuiles reviennent, le jeton est le même", () => {
    asViewer(); directReceptionStore.setPreference(PREFIX, { mode: "audio" })
    const credentials = directSessionStore.getState().credentials
    render(tree())
    expect(within(screen.getByRole("group", { name: "Écoute seule" })).getByText("Personne ne parle en ce moment")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Écouter seulement" }))
    expect(screen.queryByRole("group", { name: "Écoute seule" })).toBeNull()
    expect(screen.getByTestId("camera-alice")).toBeInTheDocument()
    expect(screen.getByTestId("camera-bob")).toBeInTheDocument()
    expect(directSessionStore.getState().credentials).toBe(credentials)
    expect(directSessionStore.getState().phase).toBe("connected")
  })
  it("l’économie se choisit par un bouton radio natif (groupe « Image ») et se retient sur l’appareil", () => {
    asViewer()
    render(tree())
    fireEvent.click(screen.getByRole("radio", { name: "Économie" }))
    expect(screen.getByRole("radio", { name: "Économie" })).toBeChecked()
    expect(window.localStorage.getItem(`${PREFIX}direct-reception:v1`)).toBe(JSON.stringify({ mode: "video", quality: "low" }))
    expect(screen.getByRole("group", { name: "Image" })).toBeInTheDocument()
  })
  it("à l’antenne, aucune commande de réception et le plateau reste visible même si l’écoute seule était retenue", () => {
    directReceptionStore.setPreference(PREFIX, { mode: "audio" })
    directSessionStore.prepare(sessionId); directSessionStore.setCredentials({ sessionId, token: "test", wsUrl: "wss://test.invalid", role: "speaker" }); directSessionStore.setPhase("connected")
    render(tree(session({ viewerRole: "speaker" })))
    expect(screen.queryByRole("button", { name: "Écouter seulement" })).toBeNull()
    expect(screen.queryByRole("group", { name: "Écoute seule" })).toBeNull()
    expect(screen.getByTestId("camera-alice")).toBeInTheDocument()
  })
  it("la suggestion sur connexion faible est annoncée, propose sans basculer, et ne revient pas", () => {
    asViewer()
    render(tree())
    expect(screen.queryByText(/Votre connexion semble faible/)).toBeNull()
    act(() => directReceptionStore.offerHint(sessionId))
    expect(screen.getByRole("status")).toHaveTextContent("Votre connexion semble faible. « Écouter seulement » coupe les images reçues ; le son continue.")
    expect(directReceptionStore.getPreference(PREFIX).mode).toBe("video")
    fireEvent.click(screen.getByRole("button", { name: "Fermer cette suggestion" }))
    expect(screen.queryByText(/Votre connexion semble faible/)).toBeNull()
    act(() => directReceptionStore.offerHint(sessionId))
    expect(screen.queryByText(/Votre connexion semble faible/)).toBeNull()
  })
  it("accepter la suggestion passe en écoute seule et la referme", () => {
    asViewer()
    render(tree())
    act(() => directReceptionStore.offerHint(sessionId))
    const status = screen.getByRole("status")
    fireEvent.click(within(status.parentElement!).getByRole("button", { name: "Écouter seulement" }))
    expect(directReceptionStore.getPreference(PREFIX).mode).toBe("audio")
    expect(directReceptionStore.isHintOffered(sessionId)).toBe(false)
    expect(screen.getByRole("group", { name: "Écoute seule" })).toBeInTheDocument()
  })
})
