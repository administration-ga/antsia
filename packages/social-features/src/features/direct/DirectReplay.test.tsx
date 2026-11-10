// @vitest-environment jsdom
// Dupliqué de socle/packages/agent-features/src/features/direct/ReplayManagementPanel.test.tsx @ ad2e7fdc2 — adaptations : API typée réseau, consentement et garde VTT du moteur.
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { getFunctionName } from "convex/server"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { noDirectPermissions } from "@antsia/social-domain/live/permissions"
import { createAppI18n } from "../../i18n"
import type { DirectSession } from "./DirectPage"
import { DirectReplay } from "./DirectReplay"

const calls = vi.hoisted(() => ({ mutation: vi.fn(), captions: vi.fn() }))
vi.mock("@antsia/api/network", () => ({ useNetwork: () => ({ networkId: "network-a" }) }))
vi.mock("convex/react", () => ({
  useMutation: (ref: Parameters<typeof getFunctionName>[0]) => (args: unknown) => calls.mutation(getFunctionName(ref), args),
  useAction: () => calls.captions,
}))
const i18n = createAppI18n({ locale: "fr", appResources: { fr: {}, en: {} }, defaultNS: "direct" })
function makeSession(patch: Partial<NonNullable<DirectSession["replay"]>> = {}): DirectSession {
  return { sessionId: "session-a" as never, title: "Recette", status: "ended", audience: "public", chatMode: "open", stageFormat: "computer", stageLayout: "adaptive", maxViewers: 200, viewerRole: "host", viewerIsInvitee: false, permissions: { ...noDirectPermissions(), changeAudienceOrReplay: true }, host: { displayName: "Awa", handle: "awa", avatarUrl: null }, speakers: [], spotlight: null, startedAt: 1, endedAt: 2, maxDurationAt: null, endReason: null, counters: { viewers: 0, present: 0, comments: 0, reactions: 0 }, announcePostId: null,
    replay: { status: "ready", egressState: "ready", failureReason: null, url: "https://media.test/replay", captionsUrl: null, captionsLang: null, durationMs: 65000, retentionUntil: null, visibility: "public", publication: "undecided", recoverable: false, canManage: true, ...patch }, recording: { requested: true, consentedAt: 1, proposedSpeakerAwaitingConsent: false } }
}
const tree = (session = makeSession()) => <I18nextProvider i18n={i18n}><DirectReplay session={session} /></I18nextProvider>
beforeEach(() => { vi.clearAllMocks(); calls.mutation.mockResolvedValue({}); calls.captions.mockResolvedValue({ accepted: true, reason: "ok" }) })
afterEach(cleanup)

describe("F3c — rediffusion", () => {
  it("décide pendant pending mais ne récupère rien sans corrélation", async () => {
    render(tree(makeSession({ status: "pending", egressState: "processing", url: null })))
    expect(screen.queryByRole("button", { name: "Récupérer l’enregistrement" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Garder pour moi" }))
    await waitFor(() => expect(calls.mutation).toHaveBeenCalledWith("modules/live/sessions:decideReplayPublication", { networkId: "network-a", sessionId: "session-a", decision: "private" }))
  })
  it("masque toutes les commandes dès le retrait de l'autorité", () => {
    const view = render(tree())
    fireEvent.click(screen.getByRole("button", { name: "Retirer l’enregistrement" }))
    view.rerender(tree(makeSession({ canManage: false })))
    expect(screen.queryByRole("button", { name: "Retirer l’enregistrement" })).toBeNull()
    expect(screen.queryByRole("combobox")).toBeNull()
    expect(calls.mutation).not.toHaveBeenCalled()
  })
  it("confirme le retrait et ne l'envoie pas lors de l'annulation", async () => {
    render(tree())
    fireEvent.click(screen.getByRole("button", { name: "Retirer l’enregistrement" }))
    fireEvent.click(screen.getByRole("button", { name: "Continuer la conférence" }))
    expect(calls.mutation).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "Retirer l’enregistrement" })).toHaveFocus()
    fireEvent.click(screen.getByRole("button", { name: "Retirer l’enregistrement" }))
    fireEvent.click(screen.getByRole("button", { name: "Retirer l’enregistrement" }))
    await waitFor(() => expect(calls.mutation).toHaveBeenCalledWith("modules/live/sessions:withdrawReplay", { networkId: "network-a", sessionId: "session-a" }))
  })
  it("refuse un film avant lecture et transmet le VTT en texte dans sa langue", async () => {
    render(tree())
    const read = vi.fn().mockResolvedValue("WEBVTT\n\n00:00.000 --> 00:01.000\nBonjour")
    fireEvent.change(screen.getByLabelText("Importer une piste WebVTT"), { target: { files: [{ type: "video/mp4", size: 100, text: read }] } })
    expect(read).not.toHaveBeenCalled()
    expect(calls.captions).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText("Langue des sous-titres"), { target: { value: "en" } })
    fireEvent.change(screen.getByLabelText("Importer une piste WebVTT"), { target: { files: [{ type: "text/vtt", size: 100, text: read }] } })
    await waitFor(() => expect(calls.captions).toHaveBeenCalledWith({ networkId: "network-a", sessionId: "session-a", content: expect.stringContaining("WEBVTT"), lang: "en" }))
    expect(await screen.findByText(/Piste reçue/)).toBeTruthy()
  })
  it("n'importe pas une lecture tardive après révocation", async () => {
    let resolve!: (text: string) => void
    const read = vi.fn(() => new Promise<string>((answer) => { resolve = answer }))
    const view = render(tree())
    fireEvent.change(screen.getByLabelText("Importer une piste WebVTT"), { target: { files: [{ type: "text/vtt", size: 100, text: read }] } })
    view.rerender(tree(makeSession({ canManage: false })))
    await act(async () => resolve("WEBVTT"))
    expect(calls.captions).not.toHaveBeenCalled()
  })
  it("conserve la langue de piste et annonce une erreur de lecteur", () => {
    const { container } = render(tree(makeSession({ captionsUrl: "https://media.test/track", captionsLang: "en", canManage: false })))
    expect(container.querySelector("track")).toHaveAttribute("srclang", "en")
    fireEvent.error(container.querySelector("video")!)
    expect(screen.getByRole("alert")).toHaveTextContent("La rediffusion n’a pas pu être lue")
  })
})
