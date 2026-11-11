// @vitest-environment jsdom
// Dupliqué de socle/packages/agent-features/src/features/direct/ParticipantsPanel.test.tsx @ ad2e7fdc2 — adaptations : matrice serveur et API réseau ANTSIA, volets opt-in, consentement et curseurs ; scénarios regroupés sur la surface branchée.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import type { Id } from "@antsia/api/engine"
import { directPermissionsFor, noDirectPermissions } from "@antsia/social-domain/live/permissions"
import { getFunctionName } from "convex/server"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createAppI18n } from "../../i18n"
import { DirectManagement } from "./DirectManagement"
import type { DirectSession } from "./DirectPage"

const mocks = vi.hoisted(() => ({ network: "network-a", query: vi.fn(), mutation: vi.fn(), data: {} as Record<string, unknown>, errors: new Set<string>(), refetch: vi.fn() }))
vi.mock("@antsia/api/network", () => ({ useNetwork: () => ({ networkId: mocks.network, personId: "person-self", charte: "antsia" }) }))
vi.mock("@antsia/api/hooks", () => ({ useAuthenticatedConvexQuery: (ref: Parameters<typeof getFunctionName>[0], args: unknown) => {
  const name = getFunctionName(ref)
  mocks.query(name, args)
  return { data: args === "skip" ? undefined : mocks.data[name], isError: mocks.errors.has(name), isFetching: false, refetch: mocks.refetch }
} }))
vi.mock("convex/react", () => ({ useMutation: (ref: Parameters<typeof getFunctionName>[0]) => (...args: unknown[]) => mocks.mutation(getFunctionName(ref), ...args) }))
vi.mock("@antsia/ui/espace-kit", () => ({ EspaceDialog: ({ title, description, children }: { title: string; description: string; children: React.ReactNode }) => <div role="dialog" aria-label={title}><p>{description}</p>{children}</div> }))

const i18n = createAppI18n({ locale: "fr", appResources: { fr: {}, en: {} }, defaultNS: "direct" })
function session(patch: Partial<DirectSession> = {}): DirectSession {
  return { sessionId: "session-a" as Id<"liveSessions">, title: "Recette", status: "live", audience: "public", chatMode: "open", stageFormat: "computer", stageLayout: "adaptive", maxViewers: 200, viewerRole: "viewer", viewerIsInvitee: false, permissions: noDirectPermissions(), host: { displayName: "Hôte", handle: "host", avatarUrl: null }, speakers: [], spotlight: null, startedAt: 1, endedAt: null, maxDurationAt: 10000, endReason: null, counters: { viewers: 0, present: 0, comments: 0, reactions: 0 }, announcePostId: null, replay: null, recording: { requested: false, consentedAt: null, proposedSpeakerAwaitingConsent: false }, ...patch }
}
const host = () => session({ viewerRole: "host", permissions: directPermissionsFor({ isHost: true, delegation: null }) })
const profile = { displayName: "Awa", handle: "awa", avatarUrl: null }
function tree(value: DirectSession, admitted = false) { return <I18nextProvider i18n={i18n}><DirectManagement session={value} admitted={admitted} /></I18nextProvider> }
beforeEach(() => {
  vi.clearAllMocks(); mocks.network = "network-a"; mocks.errors.clear(); mocks.mutation.mockResolvedValue({})
  mocks.data = {
    "modules/live/antenna:myState": { live: true, request: null, invitation: null, shouldJoinAsSpeaker: false },
    "modules/live/antenna:hostState": { status: "live", speakers: [], requests: [], invitations: [] },
    "modules/live/antenna:searchInviteCandidates": { page: [], isDone: true, continueCursor: "" },
    "modules/live/moderation:listAdmitted": { page: [{ personId: "awa", ...profile, onStage: false, banned: false, muted: false, delegation: null, firstGrantedAt: 1 }], isDone: true, continueCursor: "" },
    "modules/live/delegations:listForSession": [],
    "modules/live/delegations:searchCandidates": { page: [{ personId: "awa", ...profile }], isDone: true, continueCursor: "" },
    "modules/live/invitees:searchCandidates": { candidates: [{ personId: "awa", ...profile, source: "connection" }] },
    "modules/live/invitees:listForSession": { canManage: true, invitees: [] },
    "modules/live/comments:list": [],
    "modules/live/reactions:summary": { total: 0, byKind: [], mine: [] },
  }
})
afterEach(cleanup)

describe("F3b — volets et permissions, fail-closed", () => {
  it("ne souscrit aucun volet fermé et n’offre aucun annuaire au spectateur", () => {
    render(tree(session()))
    expect(mocks.query).not.toHaveBeenCalled()
    expect(screen.queryByRole("button", { name: "Admissions" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Délégations" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Antenne" }))
    expect(screen.getByRole("button", { name: "Demander la parole" })).toBeDisabled()
    expect(mocks.query.mock.calls.every(([name]) => name === "modules/live/antenna:myState")).toBe(true)
  })
  it("offre une main uniquement après admission et n’allume aucun matériel à l’acceptation", async () => {
    mocks.data["modules/live/antenna:myState"] = { live: true, request: null, invitation: { invitationId: "invite-a", status: "pending" }, shouldJoinAsSpeaker: false }
    render(tree(session(), true)); fireEvent.click(screen.getByRole("button", { name: "Antenne" }))
    expect(screen.getByRole("button", { name: "Demander la parole" })).toBeEnabled()
    fireEvent.click(screen.getByRole("button", { name: "Accepter" }))
    await waitFor(() => expect(mocks.mutation).toHaveBeenCalledWith("modules/live/antenna:respondToInvitation", { networkId: "network-a", invitationId: "invite-a", response: "accepted" }))
    expect(mocks.mutation).toHaveBeenCalledTimes(1)
  })
  it("une invitation expirée ne propose plus Accepter", () => {
    mocks.data["modules/live/antenna:myState"] = { live: true, request: null, invitation: { invitationId: "invite-a", status: "expired" }, shouldJoinAsSpeaker: false }
    render(tree(session())); fireEvent.click(screen.getByRole("button", { name: "Antenne" }))
    expect(screen.getByText("Proposition expirée")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Accepter" })).toBeNull()
  })
  it("un délégué d’antenne n’accède pas au sélecteur privé des relations de l’hôte", () => {
    const permissions = directPermissionsFor({ isHost: false, delegation: { kind: "cohost", canAdmitToStage: true, canExclude: false, canEndOrTransfer: false } })
    render(tree(session({ permissions }))); fireEvent.click(screen.getByRole("button", { name: "Antenne" }))
    expect(screen.getByLabelText("Identifiant de la personne liée à l’hôte")).toBeInTheDocument()
    expect(mocks.query.mock.calls.some(([name]) => name === "modules/live/antenna:searchInviteCandidates")).toBe(false)
    expect(screen.queryByRole("button", { name: "Délégations" })).toBeNull()
  })
  it("un modérateur coupe le chat d’une personne silencieuse sans proposer l’exclusion", async () => {
    const permissions = directPermissionsFor({ isHost: false, delegation: { kind: "moderator", canAdmitToStage: false, canExclude: false, canEndOrTransfer: false } })
    render(tree(session({ permissions }))); fireEvent.click(screen.getByRole("button", { name: "Admissions" }))
    fireEvent.click(screen.getByRole("button", { name: "Couper le chat" }))
    await waitFor(() => expect(mocks.mutation).toHaveBeenCalledWith("modules/live/moderation:muteChat", { networkId: "network-a", sessionId: "session-a", targetPersonId: "awa" }))
    expect(screen.queryByRole("button", { name: "Exclure de la conférence" })).toBeNull()
  })
  it("confirme l’exclusion, puis réintègre sans réattribuer de rôle", async () => {
    const view = render(tree(host())); fireEvent.click(screen.getByRole("button", { name: "Admissions" }))
    fireEvent.click(screen.getByRole("button", { name: "Exclure de la conférence" }))
    expect(mocks.mutation).not.toHaveBeenCalled()
    fireEvent.click(screen.getAllByRole("button", { name: "Exclure de la conférence" })[1]!)
    await waitFor(() => expect(mocks.mutation).toHaveBeenCalledWith("modules/live/moderation:ban", expect.objectContaining({ targetPersonId: "awa" })))
    mocks.data["modules/live/moderation:listAdmitted"] = { page: [{ personId: "awa", ...profile, banned: true, onStage: false, muted: false, delegation: null, firstGrantedAt: 1 }], isDone: true, continueCursor: "" }
    view.rerender(tree(host())); fireEvent.click(screen.getByRole("button", { name: "Lever l’exclusion" }))
    await waitFor(() => expect(mocks.mutation).toHaveBeenCalledWith("modules/live/moderation:reinstate", expect.objectContaining({ targetPersonId: "awa" })))
    expect(mocks.mutation.mock.calls.some(([name]) => name === "modules/live/speakers:promote")).toBe(false)
  })
  it("poursuit un curseur après une page vide, puis masque les données conservées sur erreur", () => {
    mocks.data["modules/live/moderation:listAdmitted"] = { page: [], isDone: false, continueCursor: "next" }
    const view = render(tree(host())); fireEvent.click(screen.getByRole("button", { name: "Admissions" })); fireEvent.click(screen.getByRole("button", { name: "Voir plus" }))
    expect(mocks.query).toHaveBeenLastCalledWith("modules/live/moderation:listAdmitted", expect.objectContaining({ paginationOpts: { cursor: "next", numItems: 20 } }))
    mocks.errors.add("modules/live/moderation:listAdmitted")
    mocks.data["modules/live/moderation:listAdmitted"] = { page: [{ personId: "awa", ...profile }], isDone: true }
    view.rerender(tree(host())); expect(screen.queryByText("Awa")).toBeNull()
  })
  it("démonte le panneau d’admissions immédiatement quand le droit est retiré", () => {
    const view = render(tree(host())); fireEvent.click(screen.getByRole("button", { name: "Admissions" }))
    expect(screen.getByText("Awa")).toBeInTheDocument()
    mocks.query.mockClear(); view.rerender(tree(session()))
    expect(screen.queryByText("Awa")).toBeNull(); expect(mocks.query).not.toHaveBeenCalled()
  })
  it("ferme la confirmation d’exclusion dès que ce droit tombe, même si le chat reste modérable", () => {
    const view = render(tree(host())); fireEvent.click(screen.getByRole("button", { name: "Admissions" })); fireEvent.click(screen.getByRole("button", { name: "Exclure de la conférence" }))
    const permissions = directPermissionsFor({ isHost: false, delegation: { kind: "moderator", canAdmitToStage: false, canExclude: false, canEndOrTransfer: false } })
    view.rerender(tree(session({ permissions })))
    expect(screen.queryByRole("dialog")).toBeNull(); expect(mocks.mutation).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "Couper le chat" })).toBeInTheDocument()
  })
  it("n’accepte aucune nouvelle main si les huit places sont accordées", () => {
    mocks.data["modules/live/antenna:hostState"] = { status: "live", speakers: Array.from({ length: 8 }, (_, i) => ({ personId: `p${i}`, isHost: i === 0, profile })), requests: [{ requestId: "hand-a", personId: "awa", profile }], invitations: [] }
    render(tree(host())); fireEvent.click(screen.getByRole("button", { name: "Antenne" }))
    expect(screen.getByRole("button", { name: "Accepter" })).toBeDisabled()
  })
  it("traverse aussi le second côté du graphe après une page vide terminée", () => {
    render(tree(host())); fireEvent.click(screen.getByRole("button", { name: "Antenne" })); fireEvent.click(screen.getByRole("button", { name: "Voir plus" }))
    expect(mocks.query).toHaveBeenLastCalledWith("modules/live/antenna:searchInviteCandidates", expect.objectContaining({ side: "high", paginationOpts: { cursor: null, numItems: 12 } }))
    const args = mocks.query.mock.calls.at(-1)![1]
    expect(args).not.toHaveProperty("cursor")
  })
  it("délègue les capacités explicites sans ouvrir une antenne ou un jeton", async () => {
    render(tree(host())); fireEvent.click(screen.getByRole("button", { name: "Délégations" }))
    fireEvent.change(screen.getByLabelText("Personne liée à l’hôte"), { target: { value: "awa" } })
    fireEvent.change(screen.getByLabelText("Rôle de gestion"), { target: { value: "cohost" } })
    expect(screen.getByRole("checkbox", { name: "Exclure et lever les exclusions" })).not.toBeChecked()
    fireEvent.click(screen.getByRole("checkbox", { name: "Exclure et lever les exclusions" }))
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer la délégation" }))
    await waitFor(() => expect(mocks.mutation).toHaveBeenCalledWith("modules/live/delegations:grant", { networkId: "network-a", sessionId: "session-a", targetPersonId: "awa", kind: "cohost", canAdmitToStage: true, canExclude: true, canEndOrTransfer: false }))
    expect(mocks.mutation).toHaveBeenCalledTimes(1)
  })
  it("respecte canManage:false même avec un DTO de permissions ancien", () => {
    mocks.data["modules/live/invitees:listForSession"] = { canManage: false, invitees: [{ personId: "awa", ...profile }] }
    render(tree(host())); fireEvent.click(screen.getByRole("button", { name: "Invités" }))
    expect(screen.queryByText("Awa")).toBeNull()
    expect(mocks.query).toHaveBeenLastCalledWith("modules/live/invitees:searchCandidates", "skip")
  })
  it("offre la gestion nominative avant démarrage sans monter une console live", () => {
    render(tree({ ...host(), status: "scheduled" })); expect(screen.queryByRole("button", { name: "Antenne" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Invités" }))
    expect(screen.getByText("Awa")).toBeInTheDocument()
    expect(mocks.query.mock.calls.every(([name]) => name.startsWith("modules/live/invitees:"))).toBe(true)
  })
  it("fermer la discussion retire le formulaire sans masquer les commentaires et réactions", () => {
    render(tree({ ...host(), chatMode: "closed" })); fireEvent.click(screen.getByRole("button", { name: "Discussion" }))
    expect(screen.queryByRole("textbox")).toBeNull(); expect(screen.getByRole("button", { name: "Rouvrir la discussion" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "J’aime · 0" })).toBeInTheDocument()
  })
  it("le changement de réseau referme tous les volets et leurs données", () => {
    const view = render(tree(host())); fireEvent.click(screen.getByRole("button", { name: "Admissions" }))
    mocks.network = "network-b"; mocks.query.mockClear(); view.rerender(tree(host()))
    expect(screen.queryByText("Awa")).toBeNull(); expect(mocks.query).not.toHaveBeenCalled()
  })
})

describe("DL-02 — l'antenne d'un direct enregistré exige mon accord", () => {
  const CONSENT = "J'accepte que mon image et ma voix soient enregistrées à l'antenne de cette conférence"
  const recorded = { requested: true, consentedAt: null, proposedSpeakerAwaitingConsent: false }

  it("accepter une invitation : case décochée, Accepter bloqué jusqu'à la coche, accord envoyé AVANT la réponse ; refuser reste libre", async () => {
    mocks.data["modules/live/antenna:myState"] = { live: true, request: null, invitation: { invitationId: "invite-a", status: "pending" }, shouldJoinAsSpeaker: false }
    render(tree(session({ recording: recorded }), true)); fireEvent.click(screen.getByRole("button", { name: "Antenne" }))
    expect(screen.getByText(/Si la conférence est enregistrée, vous devrez d’abord accepter l’enregistrement/)).toBeInTheDocument()
    const box = screen.getByRole("checkbox", { name: CONSENT })
    expect(box).not.toBeChecked()
    expect(screen.getByRole("button", { name: "Accepter" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Demander la parole" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Refuser" })).toBeEnabled()
    fireEvent.click(box)
    fireEvent.click(screen.getByRole("button", { name: "Accepter" }))
    await waitFor(() => expect(mocks.mutation).toHaveBeenCalledWith("modules/live/antenna:respondToInvitation", { networkId: "network-a", invitationId: "invite-a", response: "accepted" }))
    expect(mocks.mutation.mock.calls.map(([name]) => name)).toEqual(["modules/live/antenna:acceptRecording", "modules/live/antenna:respondToInvitation"])
  })

  it("demander la parole : l'accord part d'abord ; sans enregistrement, aucune case ni accord", async () => {
    const view = render(tree(session({ recording: recorded }), true)); fireEvent.click(screen.getByRole("button", { name: "Antenne" }))
    fireEvent.click(screen.getByRole("checkbox", { name: CONSENT }))
    fireEvent.click(screen.getByRole("button", { name: "Demander la parole" }))
    await waitFor(() => expect(mocks.mutation).toHaveBeenCalledWith("modules/live/antenna:raiseHand", { networkId: "network-a", sessionId: "session-a" }))
    expect(mocks.mutation.mock.calls.map(([name]) => name)).toEqual(["modules/live/antenna:acceptRecording", "modules/live/antenna:raiseHand"])
    view.unmount(); mocks.mutation.mockClear()
    render(tree(session(), true)); fireEvent.click(screen.getByRole("button", { name: "Antenne" }))
    expect(screen.queryByRole("checkbox", { name: CONSENT })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Demander la parole" }))
    await waitFor(() => expect(mocks.mutation).toHaveBeenCalledWith("modules/live/antenna:raiseHand", { networkId: "network-a", sessionId: "session-a" }))
    expect(mocks.mutation).toHaveBeenCalledTimes(1)
  })

  it("l'accord déjà donné est dit ; la console de l'hôte rappelle la règle", () => {
    const view = render(tree(session({ recording: { ...recorded, consentedAt: 1 } }), true)); fireEvent.click(screen.getByRole("button", { name: "Antenne" }))
    expect(screen.getByText("Vous avez accepté l'enregistrement de cette conférence.")).toBeInTheDocument()
    expect(screen.queryByRole("checkbox", { name: CONSENT })).toBeNull()
    view.unmount()
    render(tree({ ...host(), recording: { ...recorded, consentedAt: 1 } })); fireEvent.click(screen.getByRole("button", { name: "Antenne" }))
    expect(screen.getByText("Cette conférence est enregistrée : une personne ne monte à l'antenne qu'après avoir accepté l'enregistrement.")).toBeInTheDocument()
  })
})

describe("DL-03 — signaler un commentaire de la discussion", () => {
  const PENDING = "En attente de relecture : personne d’autre ne le voit pour l’instant."
  const comment = (patch: Record<string, unknown>) => ({ commentId: "comment-autrui", authorPersonId: "awa", author: profile, body: "Propos d’Awa", offsetMs: 0, createdAt: 1, isMine: false, mutedForChat: false, pendingReview: false, ...patch })

  it("« Signaler » sur le commentaire d'autrui seulement ; mon commentaire retenu dit qu'il attend une relecture", async () => {
    mocks.data["modules/live/comments:list"] = [comment({}), comment({ commentId: "comment-moi", authorPersonId: "person-self", body: "Mon commentaire", isMine: true, pendingReview: true })]
    render(tree(session())); fireEvent.click(screen.getByRole("button", { name: "Discussion" }))
    const [autrui, moi] = screen.getAllByRole("listitem")
    expect(within(autrui!).getByRole("button", { name: "Signaler" })).toBeInTheDocument()
    expect(within(autrui!).queryByText(PENDING)).toBeNull()
    expect(within(moi!).queryByRole("button", { name: "Signaler" })).toBeNull()
    expect(within(moi!).getByText(PENDING)).toBeInTheDocument()
    expect(within(moi!).getByRole("button", { name: "Retirer le commentaire" })).toBeInTheDocument()

    fireEvent.click(within(autrui!).getByRole("button", { name: "Signaler" }))
    const dialog = screen.getByRole("dialog", { name: "Signaler ce commentaire" })
    await act(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "Transmettre" })) })
    expect(mocks.mutation).toHaveBeenCalledWith("modules/moderation/cases:report", { networkId: "network-a", target: { kind: "liveComment", id: "comment-autrui" }, reason: "harassment" })
  })

  it("l'hôte qui modère retire ET signale le commentaire d'autrui", () => {
    mocks.data["modules/live/comments:list"] = [comment({})]
    render(tree(host())); fireEvent.click(screen.getByRole("button", { name: "Discussion" }))
    const [autrui] = screen.getAllByRole("listitem")
    expect(within(autrui!).getByRole("button", { name: "Retirer le commentaire" })).toBeInTheDocument()
    expect(within(autrui!).getByRole("button", { name: "Signaler" })).toBeInTheDocument()
  })
})
