// @vitest-environment jsdom
// Dupliqué de socle/packages/agent-features/src/features/direct/direct-floating.test.ts @ ad2e7fdc2 — adaptations : présentation sans salle/audio supplémentaires et gestes explicites du moteur ; DL-04 : réception du spectateur dans la carte (écoute seule, suggestion), LiveKit simulé comme au studio.
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import type { ReactNode } from "react"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { noDirectPermissions } from "@antsia/social-domain/live/permissions"
import { createAppI18n } from "../../i18n"
import { directReceptionStore } from "../../stores/direct-reception-store"
import { directSessionStore } from "../../stores/direct-session-store"
import type { DirectSession } from "./DirectPage"
import { DirectFloatingCard } from "./DirectFloatingCard"

const mocks = vi.hoisted(() => ({ mobile: false as boolean | null, room: null as unknown, leave: vi.fn(), mutation: vi.fn() }))
vi.mock("@antsia/api/network", () => ({ useNetwork: () => ({ networkId: "network-a", charte: "antsia", storagePrefix: "antsia:a:" }), useRoutes: () => ({ conference: (id: string) => `/room/${id}` }) }))
vi.mock("@antsia/api/routing", () => ({ Link: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a> }))
vi.mock("@antsia/ui/overlay", () => ({ useIsReseauMobile: () => mocks.mobile }))
vi.mock("../../stores/direct-room-registry", () => ({ useDirectRoom: () => mocks.room }))
vi.mock("@antsia/ui/espace-kit", () => ({ EspaceDialog: ({ children, title }: { children: ReactNode; title: string }) => <div role="dialog" aria-label={title}>{children}</div> }))
vi.mock("convex/react", () => ({ useMutation: () => mocks.mutation }))
vi.mock("@livekit/components-react", async () => {
  const { createContext } = await import("react")
  return {
    RoomContext: createContext(null),
    useTracks: (sources: { source: string }[]) => sources[0]!.source === "camera" ? [{ source: "camera", participant: { identity: "direct-s_alice", attributes: { personId: "alice" } } }] : [],
    useSpeakingParticipants: () => [],
    ParticipantTile: ({ trackRef }: { trackRef: { source: string } }) => <div data-testid={`tile-${trackRef.source}`} />,
  }
})
const i18n = createAppI18n({ locale: "fr", appResources: { fr: {}, en: {} }, defaultNS: "direct" })
const session = { sessionId: "session-a", title: "Recette", status: "live", viewerRole: "host", permissions: noDirectPermissions(), speakers: [], spotlight: null } as unknown as DirectSession
const tree = (value = session) => <I18nextProvider i18n={i18n}><DirectFloatingCard session={value} onLeave={mocks.leave} /></I18nextProvider>
beforeEach(() => { vi.clearAllMocks(); mocks.mobile = false; mocks.room = null; directReceptionStore.__resetForTests(); window.localStorage.clear(); directSessionStore.__resetForTests(); directSessionStore.prepare("session-a" as never); directSessionStore.setCredentials({ sessionId: "session-a" as never, token: "fictitious", wsUrl: "wss://test.invalid", role: "speaker" }); directSessionStore.setPhase("connected") })
afterEach(() => { cleanup(); directSessionStore.__resetForTests(); directReceptionStore.__resetForTests(); window.localStorage.clear() })
describe("carte flottante F3c", () => {
  it("réduit la présentation sans quitter ni remplacer les credentials", () => {
    const credentials = directSessionStore.getState().credentials
    render(tree())
    fireEvent.click(screen.getByRole("button", { name: "Réduire" }))
    expect(screen.getByRole("button", { name: "Déplier" })).toBeTruthy()
    expect(directSessionStore.getState().credentials).toBe(credentials)
    expect(mocks.leave).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Déplier" }))
    fireEvent.keyDown(window, { key: "Escape" })
    expect(directSessionStore.getState().cardMinimized).toBe(true)
  })
  it("bascule la caméra sur sa valeur effective et protège la sortie de l'hôte", () => {
    directSessionStore.setIntent({ audioOnly: true, cameraEnabled: true })
    render(tree())
    fireEvent.click(screen.getByRole("button", { name: "Allumer la caméra" }))
    expect(directSessionStore.getState().intent).toMatchObject({ audioOnly: false, cameraEnabled: true })
    fireEvent.click(screen.getByRole("button", { name: "Quitter la salle" }))
    expect(screen.getByRole("dialog")).toBeTruthy()
    expect(mocks.leave).not.toHaveBeenCalled()
    expect(screen.queryByRole("button", { name: "Terminer pour tous" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Quitter sans terminer" }))
    expect(mocks.leave).toHaveBeenCalledTimes(1)
  })
  it("garde une bande mobile avec retour et sortie immédiate du spectateur", () => {
    mocks.mobile = true
    render(tree({ ...session, viewerRole: "viewer" }))
    expect(screen.getByRole("complementary")).toHaveAttribute("data-pose", "mobile")
    expect(screen.queryByRole("button", { name: "Allumer la caméra" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Quitter la salle" }))
    expect(mocks.leave).toHaveBeenCalledTimes(1)
  })
})


it("ne quitte pas une nouvelle salle après la réponse tardive de fin", async () => {
  let resolve!: (value: unknown) => void
  mocks.mutation.mockReturnValue(new Promise((answer) => { resolve = answer }))
  const view = render(tree({ ...session, permissions: { ...noDirectPermissions(), endOrTransfer: true } }))
  fireEvent.click(screen.getByRole("button", { name: "Quitter la salle" }))
  fireEvent.click(screen.getByRole("button", { name: "Terminer pour tous" }))
  view.unmount()
  directSessionStore.prepare("session-next" as never)
  await act(async () => resolve({ ended: true }))
  expect(mocks.leave).not.toHaveBeenCalled()
  expect(directSessionStore.getState().sessionId).toBe("session-next")
})

describe("DL-04 — réception du spectateur dans la carte", () => {
  const viewerSession = { ...session, viewerRole: "viewer", speakers: [{ personId: "alice", role: "host", displayName: "Awa", handle: "awa", avatarUrl: null, isSelf: false }] } as unknown as DirectSession
  const asViewer = () => { directSessionStore.setCredentials({ sessionId: "session-a" as never, token: "fictitious", wsUrl: "wss://test.invalid", role: "viewer" }); directSessionStore.setPhase("connected") }
  it("« Écouter seulement » remplace l’aperçu par un fond sobre, sans quitter la salle", () => {
    asViewer(); mocks.room = {}
    const credentials = directSessionStore.getState().credentials
    render(tree(viewerSession))
    expect(screen.getByTestId("tile-camera")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Écouter seulement" }))
    expect(screen.getByRole("button", { name: "Écouter seulement" })).toHaveAttribute("aria-pressed", "true")
    expect(within(screen.getByRole("group", { name: "Écoute seule" })).getByText("Personne ne parle en ce moment")).toBeInTheDocument()
    expect(screen.queryByTestId("tile-camera")).toBeNull()
    expect(directSessionStore.getState().credentials).toBe(credentials)
    expect(mocks.leave).not.toHaveBeenCalled()
  })
  it("la bande du téléphone garde la commande ; la pilule et l’antenne n’en ont pas", () => {
    asViewer(); mocks.mobile = true
    const view = render(tree(viewerSession))
    expect(screen.getByRole("button", { name: "Écouter seulement" })).toBeInTheDocument()
    view.unmount()
    mocks.mobile = false; directSessionStore.setCardMinimized(true)
    render(tree(viewerSession))
    expect(screen.queryByRole("button", { name: "Écouter seulement" })).toBeNull()
  })
  it("l’hôte à l’antenne n’a aucune commande de réception", () => {
    render(tree())
    expect(screen.queryByRole("button", { name: "Écouter seulement" })).toBeNull()
  })
  it("la suggestion sur connexion faible apparaît aussi dans la carte du spectateur", () => {
    asViewer()
    render(tree(viewerSession))
    act(() => directReceptionStore.offerHint("session-a"))
    expect(screen.getByText("Votre connexion semble faible. « Écouter seulement » coupe les images reçues ; le son continue.")).toBeInTheDocument()
  })
})
