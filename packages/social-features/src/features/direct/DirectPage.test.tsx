// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { getFunctionName } from "convex/server"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Id } from "@antsia/api/engine"
import { noDirectPermissions } from "@antsia/social-domain/live/permissions"
import type { LocalTrack } from "livekit-client"

import { createAppI18n } from "../../i18n"
import { DirectSessionHost } from "../../shell/communication/direct-session-host"
import { directSessionStore } from "../../stores/direct-session-store"
import { DirectPage, type DirectSession } from "./DirectPage"

const mocks = vi.hoisted(() => ({
  token: vi.fn(), configuration: vi.fn(), mutation: vi.fn(), preflight: vi.fn(),
  path: "/conference/session-a", networkId: "network-a", mounted: vi.fn(), unmounted: vi.fn(),
  session: null as unknown,
}))
vi.mock("@antsia/ui/overlay", () => ({ useIsReseauMobile: () => false }))
vi.mock("@antsia/api/network", () => ({
  useNetwork: () => ({ networkId: mocks.networkId, personId: "person-a", charte: "antsia" }),
  useRoutes: () => ({ home: () => "/fil", conference: (id: string) => `/conference/${id}`, conferenceAliases: (id: string) => [`/direct/${id}`] }),
}))
vi.mock("@antsia/api/hooks", () => ({ useAuthenticatedConvexQuery: () => ({ data: mocks.session, isError: false }) }))
vi.mock("@antsia/api/routing", () => ({
  usePathname: () => mocks.path,
  useRouter: () => ({ push: vi.fn() }),
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}))
vi.mock("convex/react", () => ({
  useAction: (ref: Parameters<typeof getFunctionName>[0]) => getFunctionName(ref).endsWith(":checkBroadcastConfiguration") ? mocks.configuration : mocks.token,
  useMutation: (ref: Parameters<typeof getFunctionName>[0]) => (...args: unknown[]) => mocks.mutation(getFunctionName(ref), ...args),
}))
vi.mock("livekit-client", () => ({
  createLocalTracks: mocks.preflight,
  Track: { Kind: { Video: "video" }, Source: { Camera: "camera", ScreenShare: "screen_share" } },
}))
vi.mock("@livekit/components-react", async () => {
  const { createContext } = await import("react")
  return { RoomContext: createContext(null), useTracks: () => [], ParticipantTile: () => null }
})
vi.mock("../../components/direct/DirectCallCoexistence", () => ({ DirectCallCoexistence: () => null }))
vi.mock("../../components/direct/DirectRoomMount", async () => {
  const { useEffect } = await import("react")
  return { DirectRoomMount: () => { useEffect(() => { mocks.mounted(); return () => { mocks.unmounted() } }, []); return null } }
})

const sessionId = "session-a" as Id<"liveSessions">
function session(patch: Partial<DirectSession> = {}): DirectSession {
  return {
    sessionId, title: "Conférence de recette", status: "live", audience: "public", chatMode: "open", stageFormat: "computer", stageLayout: "adaptive", maxViewers: 200,
    viewerRole: "viewer", viewerIsInvitee: false, permissions: noDirectPermissions(),
    host: { displayName: "Awa", handle: "awa", avatarUrl: null }, speakers: [], spotlight: null,
    startedAt: 1, endedAt: null, maxDurationAt: 10000, endReason: null,
    counters: { viewers: 0, present: 0, comments: 0, reactions: 0 }, announcePostId: null, replay: null,
    recording: { requested: false, consentedAt: null, proposedSpeakerAwaitingConsent: false }, ...patch,
  }
}
const i18n = createAppI18n({ locale: "fr", appResources: { fr: {}, en: {} }, defaultNS: "direct" })
function tree(showPage = true) {
  return <I18nextProvider i18n={i18n}><DirectSessionHost />{showPage ? <DirectPage sessionId={sessionId} /> : null}</I18nextProvider>
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.path = "/conference/session-a"
  mocks.networkId = "network-a"
  mocks.session = session()
  mocks.token.mockResolvedValue({ token: "test-token", wsUrl: "wss://test.invalid", role: "viewer", roomName: "test-room" })
  mocks.mutation.mockResolvedValue({})
  mocks.configuration.mockResolvedValue({ ready: true })
  directSessionStore.__resetForTests()
})
afterEach(() => { cleanup(); directSessionStore.__resetForTests() })

describe("direct F3a — entrée et durée de vie de la salle", () => {
  it("présente les périphériques d'un intervenant avant l'entrée et conserve son choix caméra éteinte", async () => {
    mocks.session = session({ viewerRole: "speaker" })
    mocks.token.mockResolvedValue({ token: "test-token", wsUrl: "wss://test.invalid", role: "speaker", roomName: "test-room" })
    render(tree())
    expect(screen.getByRole("checkbox", { name: "Allumer la caméra" })).toBeChecked()
    fireEvent.click(screen.getByRole("checkbox", { name: "Allumer la caméra" }))
    fireEvent.click(screen.getByRole("button", { name: "Rejoindre la salle" }))
    await waitFor(() => expect(directSessionStore.getState().credentials?.role).toBe("speaker"))
    expect(directSessionStore.getState().intent.cameraEnabled).toBe(false)
  })

  it("ne consomme aucun jeton ni périphérique avant le clic du spectateur", async () => {
    render(tree())
    expect(mocks.token).not.toHaveBeenCalled()
    expect(mocks.preflight).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Rejoindre la salle" }))
    await waitFor(() => expect(mocks.token).toHaveBeenCalledWith({ networkId: "network-a", sessionId }))
    expect(directSessionStore.getState().credentials?.role).toBe("viewer")
    expect(mocks.preflight).not.toHaveBeenCalled()
  })

  it("garde la même salle et son jeton lorsque la page du direct disparaît", async () => {
    const view = render(tree())
    fireEvent.click(screen.getByRole("button", { name: "Rejoindre la salle" }))
    await waitFor(() => expect(directSessionStore.getState().credentials).not.toBeNull())
    const credential = directSessionStore.getState().credentials
    mocks.path = "/fil"
    view.rerender(tree(false))
    expect(directSessionStore.getState().credentials).toBe(credential)
    expect(mocks.mounted).toHaveBeenCalledTimes(1)
    expect(mocks.unmounted).not.toHaveBeenCalled()
    expect(screen.getByRole("link", { name: "Conférence de recette" })).toHaveAttribute("href", "/conference/session-a")
  })

  // La page de la session se reconnaît à toutes ses adresses : la conférence et
  // ses alias déclarés par l'application (`/direct/:id` d'antsia.ga).
  it.each(["/conference/session-a", "/direct/session-a", "/direct/session-a/"])("aucune carte flottante ne recouvre la page de la session sur %s", async (path) => {
    mocks.path = path
    render(tree())
    fireEvent.click(screen.getByRole("button", { name: "Rejoindre la salle" }))
    await waitFor(() => expect(directSessionStore.getState().credentials).not.toBeNull())
    expect(screen.queryByRole("link", { name: "Conférence de recette" })).toBeNull()
  })

  it("ne rouvre pas une salle avec un jeton reçu après le départ volontaire", async () => {
    let answer!: (value: { token: string; wsUrl: string; role: string }) => void
    mocks.token.mockReturnValue(new Promise((resolve) => { answer = resolve }))
    const view = render(tree())
    fireEvent.click(screen.getByRole("button", { name: "Rejoindre la salle" }))
    mocks.path = "/fil"
    view.rerender(tree(false))
    fireEvent.click(screen.getByRole("button", { name: "Quitter la salle" }))
    await act(async () => { answer({ token: "late", wsUrl: "wss://test.invalid", role: "viewer" }) })
    expect(directSessionStore.getState().credentials).toBeNull()
    expect(directSessionStore.getState().sessionId).toBeNull()
    expect(mocks.mutation).toHaveBeenCalledWith("modules/live/presence:leave", { networkId: "network-a", sessionId })
  })

  it("révoque le jeton courant lorsque le réseau change", async () => {
    const view = render(tree())
    fireEvent.click(screen.getByRole("button", { name: "Rejoindre la salle" }))
    await waitFor(() => expect(directSessionStore.getState().credentials).not.toBeNull())
    mocks.networkId = "network-b"
    view.rerender(tree())
    expect(directSessionStore.getState().credentials).toBeNull()
  })

  it("ferme la connexion lorsque le serveur termine le direct", async () => {
    const view = render(tree())
    fireEvent.click(screen.getByRole("button", { name: "Rejoindre la salle" }))
    await waitFor(() => expect(directSessionStore.getState().credentials).not.toBeNull())
    mocks.session = session({ status: "ended" })
    view.rerender(tree())
    expect(directSessionStore.getState().sessionId).toBeNull()
  })

  it("rend la place admise si la configuration média refuse la connexion", async () => {
    mocks.token.mockRejectedValue({ data: { code: "mediaServerNotConfigured" } })
    render(tree())
    fireEvent.click(screen.getByRole("button", { name: "Rejoindre la salle" }))
    await waitFor(() => expect(mocks.mutation).toHaveBeenCalledWith("modules/live/presence:leave", { networkId: "network-a", sessionId }))
    expect(directSessionStore.getState().credentials).toBeNull()
    expect(directSessionStore.getState().phase).toBe("error")
  })

  it("renouvelle les droits par un nouveau geste après une promotion", async () => {
    const view = render(tree())
    fireEvent.click(screen.getByRole("button", { name: "Rejoindre la salle" }))
    await waitFor(() => expect(directSessionStore.getState().credentials).not.toBeNull())
    mocks.session = session({ viewerRole: "speaker" })
    view.rerender(tree())
    expect(directSessionStore.getState().credentials).toBeNull()
    expect(mocks.token).toHaveBeenCalledTimes(1)
  })

  it("rejette un jeton publiant reçu après une rétrogradation pendant la requête", async () => {
    mocks.session = session({ viewerRole: "speaker" })
    let answer!: (value: { token: string; wsUrl: string; role: "speaker" }) => void
    mocks.token.mockReturnValue(new Promise((resolve) => { answer = resolve }))
    const view = render(tree())
    fireEvent.click(screen.getByRole("button", { name: "Rejoindre la salle" }))
    mocks.session = session({ viewerRole: "viewer" }); view.rerender(tree())
    await act(async () => { answer({ token: "late-speaker", wsUrl: "wss://test.invalid", role: "speaker" }) })
    expect(directSessionStore.getState().credentials).toBeNull()
    expect(directSessionStore.getState().phase).toBe("ready")
    expect(mocks.token).toHaveBeenCalledTimes(1)
  })
})

describe("direct F3a — matériel avant notification de l'audience", () => {
  it("refuse un service média non configuré avant de demander des périphériques ou de démarrer", async () => {
    mocks.session = session({ status: "scheduled", viewerRole: "host" })
    mocks.configuration.mockRejectedValue({ data: { code: "mediaServerNotConfigured" } })
    render(tree())
    fireEvent.click(screen.getByRole("button", { name: "Vérifier mon matériel" }))
    await screen.findByRole("alert")
    expect(mocks.preflight).not.toHaveBeenCalled()
    expect(mocks.token).not.toHaveBeenCalled()
    expect(mocks.mutation).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "Passer en direct" })).toBeDisabled()
  })

  it("interdit le démarrage avant un préflight réussi", async () => {
    mocks.session = session({ status: "scheduled", viewerRole: "host" })
    const track = { kind: "audio", stop: vi.fn(), detach: vi.fn(), attach: vi.fn() } as unknown as LocalTrack
    mocks.preflight.mockResolvedValue([track])
    render(tree())
    expect(screen.getByRole("button", { name: "Passer en direct" })).toBeDisabled()
    fireEvent.click(screen.getByRole("button", { name: "Vérifier mon matériel" }))
    await waitFor(() => expect(screen.getByRole("button", { name: "Passer en direct" })).toBeEnabled())
    expect(mocks.mutation).not.toHaveBeenCalledWith("modules/live/sessions:goLive", expect.anything())
    fireEvent.click(screen.getByRole("button", { name: "Passer en direct" }))
    await waitFor(() => expect(mocks.token).toHaveBeenCalledTimes(1))
    expect(mocks.mutation).toHaveBeenCalledWith("modules/live/sessions:goLive", { networkId: "network-a", sessionId })
    expect(track.stop).toHaveBeenCalled()
  })

  it("arrête les pistes tardives lorsqu'une permission se résout après le démontage", async () => {
    mocks.session = session({ status: "scheduled", viewerRole: "host" })
    let answer!: (tracks: LocalTrack[]) => void
    mocks.preflight.mockReturnValue(new Promise((resolve) => { answer = resolve }))
    const track = { kind: "audio", stop: vi.fn(), detach: vi.fn() } as unknown as LocalTrack
    const view = render(tree())
    fireEvent.click(screen.getByRole("button", { name: "Vérifier mon matériel" }))
    await waitFor(() => expect(mocks.preflight).toHaveBeenCalled())
    view.unmount()
    await act(async () => { answer([track]) })
    expect(track.stop).toHaveBeenCalled()
    expect(mocks.token).not.toHaveBeenCalled()
    expect(mocks.mutation).not.toHaveBeenCalled()
  })
})

describe("DL-02 — accord à l'enregistrement et pastille de capture", () => {
  const CONSENT = "J'accepte que mon image et ma voix soient enregistrées à l'antenne de cette conférence"
  const capturing = { status: "pending" as const, egressState: "active" as const, failureReason: null, url: null, captionsUrl: null, captionsLang: null, durationMs: null, retentionUntil: null, visibility: "public" as const, publication: "undecided" as const, recoverable: false, canManage: false }
  const recorded = (patch: Partial<DirectSession["recording"]> = {}) => ({ requested: true, consentedAt: null, proposedSpeakerAwaitingConsent: false, ...patch })

  it("la pastille « REC » est là tant que la capture tourne, avec son libellé complet pour le lecteur d'écran", () => {
    mocks.session = session({ replay: capturing, recording: recorded({ consentedAt: 1 }) })
    const view = render(tree())
    const label = screen.getByText("Enregistrement en cours")
    expect(label.closest("[role='status']")).toHaveTextContent("REC")
    // Capture seulement DEMANDÉE : aucune pastille.
    mocks.session = session({ replay: { ...capturing, egressState: "requested" }, recording: recorded({ consentedAt: 1 }) })
    view.rerender(tree())
    expect(screen.queryByText("Enregistrement en cours")).toBeNull()
  })

  it("un intervenant sans accord : case DÉCOCHÉE, entrée bloquée jusqu'à la coche, accord envoyé AVANT le jeton", async () => {
    mocks.session = session({ viewerRole: "speaker", recording: recorded() })
    mocks.token.mockResolvedValue({ token: "test-token", wsUrl: "wss://test.invalid", role: "speaker", roomName: "test-room" })
    render(tree())
    const box = screen.getByRole("checkbox", { name: CONSENT })
    expect(box).not.toBeChecked()
    expect(screen.getByText(/conservée 90 jours au plus/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Rejoindre la salle" })).toBeDisabled()
    fireEvent.click(box)
    fireEvent.click(screen.getByRole("button", { name: "Rejoindre la salle" }))
    await waitFor(() => expect(mocks.token).toHaveBeenCalledTimes(1))
    expect(mocks.mutation).toHaveBeenCalledWith("modules/live/antenna:acceptRecording", { networkId: "network-a", sessionId })
    const consentCall = mocks.mutation.mock.calls.findIndex(([name]) => name === "modules/live/antenna:acceptRecording")
    expect(mocks.mutation.mock.invocationCallOrder[consentCall]).toBeLessThan(mocks.token.mock.invocationCallOrder[0]!)
  })

  it("un intervenant qui a déjà accepté, ou un direct non enregistré, n'a pas de case", () => {
    mocks.session = session({ viewerRole: "speaker", recording: recorded({ consentedAt: 1 }) })
    const view = render(tree())
    expect(screen.queryByRole("checkbox", { name: CONSENT })).toBeNull()
    mocks.session = session({ viewerRole: "speaker" })
    view.rerender(tree())
    expect(screen.queryByRole("checkbox", { name: CONSENT })).toBeNull()
    expect(screen.getByRole("button", { name: "Rejoindre la salle" })).toBeEnabled()
  })

  it("l'invité intervenant dont la place attend son accord l'accepte avant le direct, case décochée", async () => {
    mocks.session = session({ status: "scheduled", viewerRole: "viewer", viewerIsInvitee: true, recording: recorded({ proposedSpeakerAwaitingConsent: true }) })
    render(tree())
    expect(screen.getByText(/L'hôte vous propose d'intervenir/)).toBeInTheDocument()
    const box = screen.getByRole("checkbox", { name: CONSENT })
    expect(box).not.toBeChecked()
    expect(screen.getByRole("button", { name: "Accepter l'enregistrement" })).toBeDisabled()
    fireEvent.click(box)
    fireEvent.click(screen.getByRole("button", { name: "Accepter l'enregistrement" }))
    await waitFor(() => expect(mocks.mutation).toHaveBeenCalledWith("modules/live/antenna:acceptRecording", { networkId: "network-a", sessionId }))
    expect(mocks.token).not.toHaveBeenCalled()
  })
})
