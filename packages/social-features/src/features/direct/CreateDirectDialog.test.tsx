// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { getFunctionName } from "convex/server"
import type { ReactNode } from "react"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createAppI18n } from "../../i18n"
import { directSessionStore } from "../../stores/direct-session-store"
import { CreateDirectDialog } from "./CreateDirectDialog"

const mocks = vi.hoisted(() => ({ create: vi.fn(), goLive: vi.fn(), config: vi.fn(), token: vi.fn(), tracks: vi.fn(), studio: false, push: vi.fn(), close: vi.fn(), networkId: "network-test", pages: [] as unknown[], candidates: [] as unknown[], eligible: ["person-test"] as string[] }))
vi.mock("@antsia/api/network", () => ({
  useNetwork: () => ({ networkId: mocks.networkId, charte: "antsia", liveStudioPreview: mocks.studio }),
  useRoutes: () => ({ conference: (id: string) => `/conference/${id}` }),
}))
vi.mock("@antsia/api/hooks", () => ({ useAuthenticatedConvexQuery: (ref: Parameters<typeof getFunctionName>[0], args: "skip" | { personIds?: string[] }) => ({
  data: args === "skip" ? undefined : getFunctionName(ref).endsWith(":myPages") ? mocks.pages : getFunctionName(ref).endsWith(":searchCandidates") ? { candidates: mocks.candidates } : { eligible: (args.personIds ?? []).filter((id) => mocks.eligible.includes(id)).map((personId) => ({ personId, displayName: personId === "person-test" ? "Awa" : "Autre", handle: personId, avatarUrl: null })) }, isError: false,
}) }))
vi.mock("@antsia/api/routing", () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock("convex/react", () => ({
  useMutation: (ref: Parameters<typeof getFunctionName>[0]) => getFunctionName(ref).endsWith(":create") ? mocks.create : mocks.goLive,
  useAction: (ref: Parameters<typeof getFunctionName>[0]) => getFunctionName(ref).endsWith(":checkBroadcastConfiguration") ? mocks.config : mocks.token,
}))
vi.mock("livekit-client", () => ({ createLocalTracks: mocks.tracks, Track: { Kind: { Video: "video", Audio: "audio" } } }))
vi.mock("@antsia/ui/espace-kit", () => ({ EspaceDialog: ({ children, footer }: { children: ReactNode; footer?: ReactNode }) => <div role="dialog">{children}{footer}</div> }))
const i18n = createAppI18n({ locale: "fr", appResources: { fr: {}, en: {} }, defaultNS: "direct" })
beforeEach(() => { directSessionStore.__resetForTests(); mocks.studio = false; vi.clearAllMocks(); mocks.networkId = "network-test"; mocks.pages = []; mocks.candidates = []; mocks.eligible = ["person-test"]; mocks.create.mockResolvedValue({ sessionId: "session-test", created: true }) })
afterEach(() => { cleanup(); directSessionStore.__resetForTests() })

describe("création d'un direct — confidentialité et rejeu", () => {
  it("ne coche ni enregistrement ni annonce et garde les relations par défaut", async () => {
    render(<I18nextProvider i18n={i18n}><CreateDirectDialog onClose={mocks.close} /></I18nextProvider>)
    expect(screen.getByRole("checkbox", { name: "Enregistrer cette conférence" })).not.toBeChecked()
    expect(screen.getByRole("checkbox", { name: "Publier une annonce dans le fil" })).not.toBeChecked()
    fireEvent.change(screen.getByLabelText("Titre"), { target: { value: "Conférence locale" } })
    fireEvent.click(screen.getByRole("button", { name: "Préparer la conférence" }))
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1))
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ networkId: "network-test", audience: "connections", replay: false, announce: false }))
    expect(mocks.push).toHaveBeenCalledWith("/conference/session-test")
  })

  it("conserve le fil source et ses invités sans jamais annoncer une audience nominative", async () => {
    render(<I18nextProvider i18n={i18n}><CreateDirectDialog onClose={mocks.close} prefill={{ title: "Discussion", userIds: ["person-test", "person-test"], sourceThreadId: "group-test" }} /></I18nextProvider>)
    expect(screen.queryByRole("checkbox", { name: "Publier une annonce dans le fil" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Préparer la conférence" }))
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1))
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      audience: "invitees", announce: false, sourceThreadId: "group-test",
      invitees: [{ personId: "person-test", stageRole: "speaker" }],
    }))
  })

  it("prépare un direct depuis le fil avec seulement le titre, sans enregistrer ni annoncer", async () => {
    render(<I18nextProvider i18n={i18n}><CreateDirectDialog onClose={mocks.close} prefill={{ quickSetup: true, userIds: [] }} /></I18nextProvider>)
    expect(screen.getByText("Réglages de diffusion").closest("details")).not.toHaveAttribute("open")
    expect(screen.getByLabelText("Audience")).toHaveValue("connections")
    fireEvent.change(screen.getByLabelText("Titre"), { target: { value: "Rencontre" } })
    fireEvent.click(screen.getByRole("button", { name: "Préparer la conférence" }))
    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ title: "Rencontre", audience: "connections", replay: false, announce: false })))
  })

  it("réutilise la clé du brouillon après un échec de réseau sans rejouer le démarrage", async () => {
    mocks.create.mockRejectedValueOnce(new Error("transport"))
    render(<I18nextProvider i18n={i18n}><CreateDirectDialog onClose={mocks.close} /></I18nextProvider>)
    fireEvent.change(screen.getByLabelText("Titre"), { target: { value: "Conférence locale" } })
    fireEvent.click(screen.getByRole("button", { name: "Préparer la conférence" }))
    await screen.findByRole("alert")
    expect(mocks.push).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Préparer la conférence" }))
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2))
    expect(mocks.create.mock.calls[0]?.[0].idempotencyKey).toBe(mocks.create.mock.calls[1]?.[0].idempotencyKey)
  })
})


describe("F3c — page et sélection nominative", () => {
  it("crée au nom d'une page avec une annonce réservée à ses abonnés", async () => {
    mocks.pages = [{ pageId: "page-test", name: "Page de recette", role: "admin" }]
    render(<I18nextProvider i18n={i18n}><CreateDirectDialog onClose={mocks.close} asPage={{ pageId: "page-test" as never, name: "Page de recette" }} /></I18nextProvider>)
    fireEvent.change(screen.getByLabelText("Titre"), { target: { value: "Permanence" } })
    fireEvent.click(screen.getByRole("checkbox", { name: "Publier une annonce dans le fil" }))
    fireEvent.click(screen.getByRole("button", { name: "Préparer la conférence" }))
    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ pageId: "page-test", audience: "followers", announce: true })))
  })
  it("ajoute, propose l'antenne et retire des personnes avant toute écriture", async () => {
    mocks.candidates = [{ personId: "person-test", displayName: "Awa", handle: "awa", avatarUrl: null, source: "connection" }]
    render(<I18nextProvider i18n={i18n}><CreateDirectDialog onClose={mocks.close} /></I18nextProvider>)
    fireEvent.click(screen.getByRole("button", { name: "Ajouter l’invité" }))
    fireEvent.change(screen.getByLabelText(/Rôle proposé pour Awa/), { target: { value: "speaker" } })
    expect(mocks.create).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText("Audience"), { target: { value: "invitees" } })
    expect(screen.queryByRole("checkbox", { name: "Publier une annonce dans le fil" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: /Retirer Awa/ }))
    expect(screen.queryByLabelText(/Rôle proposé pour Awa/)).toBeNull()
  })
  it("bloque un invité devenu inéligible et une page retirée", () => {
    mocks.eligible = []
    const tree = <I18nextProvider i18n={i18n}><CreateDirectDialog onClose={mocks.close} prefill={{ title: "Recette", userIds: ["person-test"] }} /></I18nextProvider>
    render(tree)
    expect(screen.getByRole("button", { name: "Préparer la conférence" })).toBeDisabled()
    expect(mocks.create).not.toHaveBeenCalled()
  })
})


it("ne ferme ni ne navigue sur la réponse d'un ancien réseau", async () => {
  let resolve!: (result: { sessionId: string; created: boolean }) => void
  mocks.create.mockReturnValue(new Promise((answer) => { resolve = answer }))
  const tree = <I18nextProvider i18n={i18n}><CreateDirectDialog onClose={mocks.close} /></I18nextProvider>
  const view = render(tree)
  fireEvent.change(screen.getByLabelText("Titre"), { target: { value: "Premier réseau" } })
  fireEvent.click(screen.getByRole("button", { name: "Préparer la conférence" }))
  await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1))
  mocks.networkId = "network-next"
  view.rerender(<I18nextProvider i18n={i18n}><CreateDirectDialog onClose={mocks.close} /></I18nextProvider>)
  await act(async () => resolve({ sessionId: "obsolete", created: true }))
  expect(mocks.close).not.toHaveBeenCalled()
  expect(mocks.push).not.toHaveBeenCalled()
  expect(screen.getByLabelText("Titre")).toHaveValue("")
})

function previewTrack(kind: "audio" | "video") {
  const mediaStreamTrack = Object.assign(new EventTarget(), { readyState: "live" })
  return { kind, mediaStreamTrack, stop: vi.fn(), detach: vi.fn(), attach: vi.fn() }
}

describe("studio avec aperçu dans le formulaire", () => {
  beforeEach(() => {
    mocks.studio = true
    mocks.config.mockResolvedValue({ ready: true })
    mocks.goLive.mockResolvedValue({ started: true })
    mocks.token.mockResolvedValue({ role: "speaker", wsUrl: "wss://test.invalid", token: "test-token" })
  })

  function showStudio() {
    return render(<I18nextProvider i18n={i18n}><CreateDirectDialog onClose={mocks.close} /></I18nextProvider>)
  }

  it("montre les périphériques avant toute écriture et diffuse une seule fois en son nom", async () => {
    const camera = previewTrack("video")
    const microphone = previewTrack("audio")
    mocks.tracks.mockResolvedValue([microphone, camera])
    showStudio()
    const start = screen.getByRole("button", { name: "Passer en direct" })
    await waitFor(() => expect(start).toBeEnabled())
    expect(camera.attach).toHaveBeenCalledTimes(1)
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.goLive).not.toHaveBeenCalled()
    expect(screen.queryByText("Diffuser depuis une page")).toBeNull()
    fireEvent.change(screen.getByLabelText("Titre"), { target: { value: "Rencontre" } })
    expect(fireEvent.keyDown(screen.getByLabelText("Titre"), { key: "Enter" })).toBe(false)
    expect(mocks.goLive).not.toHaveBeenCalled()
    fireEvent.click(start)
    fireEvent.click(start)
    await waitFor(() => expect(mocks.push).toHaveBeenCalledTimes(1))
    expect(mocks.create).toHaveBeenCalledTimes(1)
    expect(mocks.create.mock.calls[0]?.[0]).not.toHaveProperty("pageId")
    expect(mocks.config).toHaveBeenCalledBefore(mocks.goLive)
    expect(camera.stop).toHaveBeenCalledBefore(mocks.goLive)
    expect(mocks.goLive).toHaveBeenCalledTimes(1)
    expect(directSessionStore.getState().credentials?.role).toBe("speaker")
  })

  it("autorise le mode audio après un refus caméra et diffuse au nom d’une page éligible", async () => {
    mocks.pages = [{ pageId: "page-a", name: "Groupe local" }]
    mocks.tracks.mockRejectedValueOnce(new DOMException("denied", "NotAllowedError")).mockResolvedValue([previewTrack("audio")])
    showStudio()
    await screen.findByRole("alert")
    const start = screen.getByRole("button", { name: "Passer en direct" })
    expect(start).toBeDisabled()
    fireEvent.click(screen.getByRole("checkbox", { name: /udio seul/ }))
    await waitFor(() => expect(start).toBeEnabled())
    expect(mocks.tracks).toHaveBeenLastCalledWith({ audio: true, video: false })
    fireEvent.click(screen.getByText("Diffuser depuis une page", { selector: "summary" }))
    fireEvent.change(screen.getByRole("combobox", { name: "Diffuser depuis une page" }), { target: { value: "page-a" } })
    fireEvent.change(screen.getByLabelText("Audience"), { target: { value: "followers" } })
    fireEvent.change(screen.getByLabelText("Titre"), { target: { value: "Permanence" } })
    fireEvent.click(start)
    await waitFor(() => expect(mocks.push).toHaveBeenCalled())
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ pageId: "page-a", audience: "followers" }))
    expect(directSessionStore.getState().intent.audioOnly).toBe(true)
  })

  it("rend tout matériel accordé après la fermeture sans demander de jeton", async () => {
    let resolve!: (tracks: ReturnType<typeof previewTrack>[]) => void
    mocks.tracks.mockReturnValue(new Promise((done) => { resolve = done }))
    const dialog = showStudio()
    await waitFor(() => expect(mocks.tracks).toHaveBeenCalled())
    dialog.unmount()
    const camera = previewTrack("video")
    const microphone = previewTrack("audio")
    await act(async () => resolve([microphone, camera]))
    expect(camera.stop).toHaveBeenCalledTimes(1)
    expect(microphone.stop).toHaveBeenCalledTimes(1)
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.token).not.toHaveBeenCalled()
  })

  it("revient sur les réglages enregistrés d’un brouillon rejoué avant toute mise en direct", async () => {
    mocks.create.mockResolvedValueOnce({ sessionId: "saved-draft", created: false })
    mocks.tracks.mockResolvedValue([previewTrack("audio"), previewTrack("video")])
    showStudio()
    const start = screen.getByRole("button", { name: "Passer en direct" })
    await waitFor(() => expect(start).toBeEnabled())
    fireEvent.change(screen.getByLabelText("Titre"), { target: { value: "Nouveau titre" } })
    fireEvent.click(start)
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/conference/saved-draft"))
    expect(mocks.goLive).not.toHaveBeenCalled()
    expect(mocks.token).not.toHaveBeenCalled()
  })

  it("retrouve la session créée après une configuration refusée sans passer en direct", async () => {
    mocks.tracks.mockResolvedValue([previewTrack("audio"), previewTrack("video")])
    mocks.config.mockRejectedValueOnce(new Error("configuration"))
    showStudio()
    const start = screen.getByRole("button", { name: "Passer en direct" })
    await waitFor(() => expect(start).toBeEnabled())
    fireEvent.change(screen.getByLabelText("Titre"), { target: { value: "Rencontre" } })
    fireEvent.click(start)
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/conference/session-test"))
    expect(mocks.goLive).not.toHaveBeenCalled()
    expect(directSessionStore.getState().phase).toBe("error")
  })
})
