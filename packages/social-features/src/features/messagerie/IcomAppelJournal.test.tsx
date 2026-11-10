// Dupliqué de socle/packages/agent-features/src/features/messagerie/IcomAppelJournal.test.tsx @ ad2e7fdc2 — adaptations : fonctions du moteur moquées (`calls.direct.callMember`, `calls.history.listCallHistory`, `calls.preferences.markJournalSeen`) et ligne de journal au DTO du moteur (correspondant nommé par `counterpartLabel`) ; rendu dans l'enveloppe du moteur (`renderWithEngine` : i18n français, réseau de test) ; le refus « d'affiliation » du socle (règle administrative absente du moteur) devient un refus à CODE du moteur, dit par sa phrase traduite ; cas neufs : l'appel admis ouvre la fenêtre sortante, l'appel refusé l'écran de fin, tous deux sur l'appel (`callId`) et la personne visée ; P10/CC : `convex/react` doublé aussi de `useConvexAuth` (porte d'envoi liée à la session) et `useConvex` (lecture du fil commercial), porte `commercialMessaging` déclarée, réponse de `callMember` complète (`calleePersonId`, contrat du serveur) ; IC-02 : porte `calls.voicemail` déclarée (le journal lit la messagerie vocale reçue).
// @vitest-environment jsdom

import { act, cleanup, fireEvent, screen } from "@testing-library/react"
import { ConvexError } from "convex/values"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { renderWithEngine, TEST_NETWORK_ID } from "../../tests/engine-wrapper"

const mocks = vi.hoisted(() => ({
  call: vi.fn(),
  commercialCall: vi.fn(),
  markJournalSeen: vi.fn(),
  toastError: vi.fn(),
  openOutgoingCall: vi.fn(),
  openRefusedCall: vi.fn(),
  mediaType: "audio" as "audio" | "video",
}))

vi.mock("@antsia/api/engine", () => ({
  api: {
    modules: {
      calls: {
        direct: { callMember: "call" },
        history: { listCallHistory: "history" },
        preferences: { markJournalSeen: "seen" },
        voicemail: { listMine: "voicemails", playbackUrl: "playbackUrl", markRead: "markRead", deleteMine: "deleteMine" },
      },
      commercialMessaging: {
        calls: { startCall: "commercialCall" },
        threads: { getThread: "getThread" },
      },
    },
  },
}))
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
  useConvex: () => ({ query: vi.fn() }),
  useMutation: (name: string) => name === "call" ? mocks.call : name === "commercialCall" ? mocks.commercialCall : mocks.markJournalSeen,
}))
vi.mock("@antsia/api/hooks", () => ({
  useAuthenticatedConvexQuery: () => ({
    isLoading: false,
    isError: false,
    data: {
      truncated: false,
      calls: [{
        callId: "previous-call",
        kind: "direct",
        category: "outgoing",
        reason: null,
        mediaType: mocks.mediaType,
        startedAt: Date.now(),
        durationMs: null,
        declineNote: null,
        counterpart: {
          personId: "recipient",
          label: { displayName: "Aline Minko", handle: "aline.minko", headline: null, avatarUrl: null, source: "published" },
        },
        group: null,
        createdByMe: true,
      }],
    },
  }),
}))
vi.mock("sonner", () => ({ toast: { error: mocks.toastError } }))
vi.mock("../../stores/call-store", () => ({
  useCallStore: () => ({
    openOutgoingCall: mocks.openOutgoingCall,
    openRefusedCall: mocks.openRefusedCall,
  }),
}))

import { IcomAppelJournal } from "./IcomAppelJournal"

beforeEach(() => { vi.resetAllMocks() })
afterEach(cleanup)

function rappeler() {
  renderWithEngine(<IcomAppelJournal />)
  return screen.getByRole<HTMLButtonElement>("button", { name: "Rappeler Aline Minko" })
}

describe("IcomAppelJournal — refus du serveur", () => {
  it.each(["audio", "video"] as const)(
    "affiche le refus serveur après le clic de rappel %s",
    async (mediaType) => {
      // Le moteur refuse par un CODE (jamais une phrase) : l'écran le traduit.
      const error = new ConvexError({ code: "statusInsufficient" })
      error.message = "Server Error"
      mocks.mediaType = mediaType
      mocks.call.mockRejectedValue(error)
      const button = rappeler()

      await act(async () => { fireEvent.click(button) })

      expect(mocks.call).toHaveBeenCalledExactlyOnceWith({
        networkId: TEST_NETWORK_ID,
        target: { personId: "recipient" },
        mediaType,
      })
      expect(mocks.toastError).toHaveBeenCalledExactlyOnceWith(
        "Votre adhésion ne permet pas encore cette action.",
        { duration: 8000 },
      )
      expect(mocks.openOutgoingCall).not.toHaveBeenCalled()
      expect(mocks.openRefusedCall).not.toHaveBeenCalled()
      expect(button.disabled).toBe(false)
    },
  )
})

describe("IcomAppelJournal — rappeler ouvre l'écran qui convient", () => {
  it("un appel admis ouvre la fenêtre sortante, sur l'appel et la personne visée", async () => {
    mocks.mediaType = "video"
    mocks.call.mockResolvedValue({ admitted: true, callId: "calls_42", calleePersonId: "recipient", roomName: "call-1", mediaType: "video" })
    const button = rappeler()

    await act(async () => { fireEvent.click(button) })

    expect(mocks.openOutgoingCall).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        meetingId: "calls_42",
        participantUserId: "recipient",
        mediaType: "video",
        callee: { userId: "recipient", name: "Aline Minko", avatarUrl: null },
      }),
    )
    expect(mocks.openRefusedCall).not.toHaveBeenCalled()
    expect(mocks.toastError).not.toHaveBeenCalled()
  })

  it("un appel refusé à l'admission ouvre l'écran de fin, avec sa raison et la messagerie vocale", async () => {
    mocks.mediaType = "audio"
    mocks.call.mockResolvedValue({ admitted: false, callId: "calls_7", calleePersonId: "recipient", reason: "dnd", voicemailOffered: true })
    const button = rappeler()

    await act(async () => { fireEvent.click(button) })

    expect(mocks.openRefusedCall).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        meetingId: "calls_7",
        mediaType: "audio",
        endKind: "dnd",
        voicemailOffered: true,
        callee: { userId: "recipient", name: "Aline Minko", avatarUrl: null },
      }),
    )
    expect(mocks.openOutgoingCall).not.toHaveBeenCalled()
  })
})
