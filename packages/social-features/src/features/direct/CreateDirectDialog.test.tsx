// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { getFunctionName } from "convex/server"
import type { ReactNode } from "react"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createAppI18n } from "../../i18n"
import { CreateDirectDialog } from "./CreateDirectDialog"

const mocks = vi.hoisted(() => ({ create: vi.fn(), push: vi.fn(), close: vi.fn(), networkId: "network-test", pages: [] as unknown[], candidates: [] as unknown[], eligible: ["person-test"] as string[] }))
vi.mock("@antsia/api/network", () => ({
  useNetwork: () => ({ networkId: mocks.networkId, charte: "antsia" }),
  useRoutes: () => ({ conference: (id: string) => `/conference/${id}` }),
}))
vi.mock("@antsia/api/hooks", () => ({ useAuthenticatedConvexQuery: (ref: Parameters<typeof getFunctionName>[0], args: "skip" | { personIds?: string[] }) => ({
  data: args === "skip" ? undefined : getFunctionName(ref).endsWith(":myPages") ? mocks.pages : getFunctionName(ref).endsWith(":searchCandidates") ? { candidates: mocks.candidates } : { eligible: (args.personIds ?? []).filter((id) => mocks.eligible.includes(id)).map((personId) => ({ personId, displayName: personId === "person-test" ? "Awa" : "Autre", handle: personId, avatarUrl: null })) }, isError: false,
}) }))
vi.mock("@antsia/api/routing", () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock("convex/react", () => ({ useMutation: () => mocks.create }))
vi.mock("@antsia/ui/espace-kit", () => ({ EspaceDialog: ({ children }: { children: ReactNode }) => <div role="dialog">{children}</div> }))
const i18n = createAppI18n({ locale: "fr", appResources: { fr: {}, en: {} }, defaultNS: "direct" })
beforeEach(() => { vi.clearAllMocks(); mocks.networkId = "network-test"; mocks.pages = []; mocks.candidates = []; mocks.eligible = ["person-test"]; mocks.create.mockResolvedValue({ sessionId: "session-test", created: true }) })
afterEach(cleanup)

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
