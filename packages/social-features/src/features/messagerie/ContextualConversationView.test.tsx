// @vitest-environment jsdom
/**
 * CC-5 — la conversation contextuelle partagée (écrit le 19/10/2026, NON EXÉCUTÉ : décision du
 * propriétaire « Continuer sans vérifier »). Source FACTICE injectée (`source`), i18n réelle du
 * moteur (FR), composeur, bulles P18b et trace locale RÉELS.
 *
 * Couvre : voix de page sans nom de signataire, envoi idempotent et double appui, états fermé /
 * indisponible / bloqué / absent, refus d'adresse exacte (code de la tranche), accord d'appel et
 * démarrage (CC-4), accessibilité de base (région nommée, annonces, feuille d'actions).
 */
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const calls = vi.hoisted(() => ({ outgoing: vi.fn(), refused: vi.fn(), active: null as string | null }))
vi.mock("convex/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("convex/react")>()),
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
}))
vi.mock("@antsia/ui/overlay", () => ({ useVisualViewport: () => undefined }))
vi.mock("./messagerie-styles", () => ({ MessagerieStyles: () => null }))
vi.mock("./VoiceRecorderButton", () => ({ VoiceRecorderButton: () => null }))
vi.mock("../../stores/call-store", () => ({
  useCallStore: () => ({ openOutgoingCall: calls.outgoing, openRefusedCall: calls.refused, globalActiveMeetingId: calls.active }),
}))

import { renderWithEngine, TEST_NETWORK_ID, TEST_PERSON_ID } from "../../tests/engine-wrapper"
import { contextualDraftStore } from "./contextual-conversation-model"
import type { ContextualMessage, ContextualMessagingSource, ContextualThread, ContextualWrites } from "./contextual-messaging-source"
import { ContextualConversationView, type ContextualConversationViewProps } from "./ContextualConversationView"
import { outboxStore } from "./messagerie-outbox"

// ── Fixtures ────────────────────────────────────────────────────────────────

const PAGE_CARD = { pageId: "pages_mbolo", networkId: TEST_NETWORK_ID, handle: "atelier-mbolo", name: "Atelier Mbolo", shortName: null, logoUrl: null, badge: null, ownerKind: "association", country: null }
const AWA = { displayName: "Awa", handle: "awa", avatarUrl: null }
const CHLOE = { displayName: "Chloé", handle: "chloe", avatarUrl: null }
const BILAL = { displayName: "Bilal", handle: "bilal", avatarUrl: null }
const OPEN_CAPABILITIES = { canSend: true, canAttach: true, canClose: true, canSetCallConsent: false, canCall: false }
/** CC-4 : les réglages d'appel du LECTEUR, tels que la projection du fil les porte — aucun actif ici. */
const NO_CALL_SETTINGS = { outsideRelationsSilenceWaived: false, dndUntil: null, meetingSilence: false, callWaitingOff: false, incomingPushOff: false }

function contextThread(overrides: Record<string, unknown> = {}): ContextualThread {
  return {
    threadId: "thread-1",
    networkId: TEST_NETWORK_ID,
    kind: "diasporaServiceRequest",
    object: { kind: "diasporaServiceRequest", id: "request-1" },
    viewer: { side: "requester", voice: "person" },
    counterpart: { kind: "page", page: PAGE_CARD },
    state: { kind: "open" },
    capabilities: OPEN_CAPABILITIES,
    sendRefusal: null,
    callConsent: false,
    callTargets: [],
    callSettings: NO_CALL_SETTINGS,
    unread: false,
    revision: 2,
    lastMessageAt: 2_000,
    createdAt: 1_000,
    ...overrides,
  } as unknown as ContextualThread
}

/** Un message de la PAGE : le moteur ne donne jamais le coéquipier au demandeur — on l'y met exprès. */
function pageMessage(overrides: Record<string, unknown> = {}): ContextualMessage {
  return {
    messageId: "m-page",
    side: "responder",
    voice: "page",
    sender: { kind: "page", page: PAGE_CARD, teammate: AWA },
    isMine: false,
    content: "Bonjour, nous pouvons passer jeudi.",
    deleted: false,
    withheld: false,
    attachmentFiles: [],
    createdAt: Date.UTC(2026, 9, 19, 9, 0),
    ...overrides,
  } as unknown as ContextualMessage
}

function myMessage(messageId: string, content: string, at = Date.UTC(2026, 9, 19, 10, 0)): ContextualMessage {
  return {
    messageId,
    side: "requester",
    voice: "person",
    sender: { kind: "person", label: { displayName: "Moi", handle: "moi", avatarUrl: null } },
    isMine: true,
    content,
    deleted: false,
    withheld: false,
    attachmentFiles: [],
    createdAt: at,
  } as unknown as ContextualMessage
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

// ── Source factice : une constante par test, ses hooks appelés comme ceux du moteur ─────────

const state = {
  thread: undefined as ContextualThread | null | undefined,
  threadError: false,
  messages: [] as ContextualMessage[],
  messageCalls: [] as (string | null)[],
}
const writes = {
  openForObject: vi.fn(),
  send: vi.fn(),
  generateUploadUrl: vi.fn(),
  markRead: vi.fn(),
  close: vi.fn(),
  remove: vi.fn(),
  report: vi.fn(),
  setCallConsent: vi.fn(),
  startCall: vi.fn(),
}
const source: ContextualMessagingSource = {
  espace: "contextuel",
  useMyThreadsPage: () => {
    throw new Error("La conversation ne lit pas la liste")
  },
  usePageThreadsPage: () => {
    throw new Error("La conversation ne lit pas la liste")
  },
  useThread: () => ({ data: state.thread, isLoading: state.thread === undefined, isError: state.threadError, enabled: true, refetch: vi.fn() }),
  useThreadForObject: () => ({ data: undefined, isLoading: false, isError: false, enabled: false, refetch: vi.fn() }),
  useMessages: (threadId) => {
    state.messageCalls.push(threadId)
    return { results: state.messages, status: "Exhausted", loadMore: vi.fn(), isLoading: false }
  },
  useWrites: () => writes as unknown as ContextualWrites,
}

const onBack = vi.fn()
const OWNER = JSON.stringify([TEST_NETWORK_ID, TEST_PERSON_ID, "contextuel"])

function view(threadId: string, props: Partial<ContextualConversationViewProps> = {}) {
  return <ContextualConversationView threadId={threadId} onBack={onBack} source={source} {...props} />
}

beforeEach(() => {
  state.thread = undefined
  state.threadError = false
  state.messages = []
  state.messageCalls = []
  for (const write of Object.values(writes)) write.mockReset().mockResolvedValue(null)
  calls.outgoing.mockReset()
  calls.refused.mockReset()
  calls.active = null
  onBack.mockReset()
})
afterEach(() => {
  outboxStore.__resetForTests()
  contextualDraftStore.__resetForTests()
})

// ── Voix ────────────────────────────────────────────────────────────────────

describe("une page parle d'une seule voix (D3)", () => {
  it("le demandeur voit la page, jamais le signataire qui a écrit — même si la réponse le portait", () => {
    state.thread = contextThread({ threadId: "thread-voice" })
    state.messages = [pageMessage()]
    renderWithEngine(view("thread-voice"))
    expect(screen.getByText("Atelier Mbolo", { selector: ".msg-head-title" })).toBeInTheDocument()
    expect(screen.getByText("Vous échangez avec l'équipe de Atelier Mbolo, qui vous répond d'une seule voix.")).toBeInTheDocument()
    expect(screen.getByText("Message de Atelier Mbolo :")).toHaveClass("sr-only")
    expect(screen.getByRole("button", { name: "Actions sur le message de Atelier Mbolo" })).toBeInTheDocument()
    expect(document.body.textContent).not.toContain("Awa")
  })

  it("l'équipe voit son coéquipier ; le signataire sait que son nom n'est pas montré", () => {
    state.thread = contextThread({ threadId: "thread-team", viewer: { side: "responder", voice: "page" }, counterpart: { kind: "person", label: BILAL } })
    state.messages = [pageMessage()]
    renderWithEngine(view("thread-team"))
    expect(screen.getByText("Message de Awa pour Atelier Mbolo :")).toBeInTheDocument()
    expect(screen.getByText("Vous écrivez au nom de la page : Bilal voit la page, jamais votre nom.")).toBeInTheDocument()
    // Un signataire ne signale pas la voix de sa propre page.
    fireEvent.click(screen.getByRole("button", { name: "Actions sur le message de Awa pour Atelier Mbolo" }))
    expect(within(screen.getByRole("dialog")).queryByRole("button", { name: "Signaler ce message" })).toBeNull()
  })

  it("dit le contexte de l'objet : nature, rôle, état, et l'état de l'objet selon l'application", () => {
    state.thread = contextThread({ threadId: "thread-context" })
    const onOpenObject = vi.fn()
    renderWithEngine(view("thread-context", { describeObject: () => "Proposition à accepter", onOpenObject }))
    expect(screen.getByText("Demande de service · votre rôle : Client")).toBeInTheDocument()
    expect(screen.getByText("Où en est l'objet : Proposition à accepter")).toBeInTheDocument()
    expect(screen.getByText("Demande de service · Ouverte")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Voir la demande" }))
    expect(onOpenObject).toHaveBeenCalledWith({ kind: "diasporaServiceRequest", id: "request-1" })
  })

  it("MP09 : une collaboration professionnelle s'ouvre par le seul geste explicite, jamais par le rappel V1", () => {
    state.thread = contextThread({ threadId: "thread-pro", kind: "professionalCollaboration", object: { kind: "professionalCollaboration", id: "collaboration-1" } })
    const onOpenObject = vi.fn()
    const legacy = renderWithEngine(view("thread-pro", { onOpenObject }))
    expect(screen.queryByRole("button", { name: "Voir la collaboration" })).toBeNull()
    legacy.unmount()
    const onOpenContextualObject = vi.fn()
    renderWithEngine(view("thread-pro", { onOpenObject, onOpenContextualObject }))
    fireEvent.click(screen.getByRole("button", { name: "Voir la collaboration" }))
    expect(onOpenContextualObject).toHaveBeenCalledWith({ kind: "professionalCollaboration", id: "collaboration-1" })
    expect(onOpenObject).not.toHaveBeenCalled()
  })
})

// ── Envoi idempotent ──────────────────────────────────────────────────────────

describe("envoi idempotent, raccordé à l'admission", () => {
  it("double appui : un envoi ; réessai identique : la même clé ; trace locale jusqu'à la projection", async () => {
    state.thread = contextThread({ threadId: "thread-send" })
    const first = deferred<never>()
    writes.send.mockImplementationOnce(() => first.promise)
    const mounted = renderWithEngine(view("thread-send"))
    const field = screen.getByRole("textbox", { name: "Message à Atelier Mbolo" })
    fireEvent.change(field, { target: { value: "Bonjour" } })
    act(() => {
      fireEvent.keyDown(field, { key: "Enter" })
      fireEvent.keyDown(field, { key: "Enter" })
    })
    await waitFor(() => expect(writes.send).toHaveBeenCalledTimes(1))
    // L'identifiant local de l'envoi est sa clé d'idempotence ; « Envoi en cours », jamais « Livré ».
    expect(screen.getByText("Envoi en cours", { selector: ".msg-time" })).toBeInTheDocument()
    await act(async () => {
      first.reject(new Error("réseau coupé"))
      await first.promise.catch(() => undefined)
    })
    expect(await screen.findByRole("alert")).toHaveTextContent("L'envoi a échoué. Réessayez dans un instant.")
    expect(screen.getByRole("textbox", { name: "Message à Atelier Mbolo" })).toHaveValue("Bonjour")

    writes.send.mockResolvedValueOnce({ messageId: "m-new", deduplicated: true })
    fireEvent.click(screen.getByRole("button", { name: "Envoyer" }))
    await waitFor(() => expect(writes.send).toHaveBeenCalledTimes(2))
    const [firstArgs, secondArgs] = writes.send.mock.calls.map(([args]) => args as { threadId: string; text: string; idempotencyKey: string })
    expect(firstArgs).toMatchObject({ threadId: "thread-send", text: "Bonjour" })
    expect(firstArgs).not.toHaveProperty("attachments")
    expect(secondArgs?.idempotencyKey).toBe(firstArgs?.idempotencyKey)
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Message à Atelier Mbolo" })).toHaveValue(""))
    // Admis par le serveur, pas encore projeté : « Envoyé » (admission prouvée), jamais « Lu ».
    expect(screen.getByText("Envoyé", { selector: ".msg-time" })).toBeInTheDocument()
    expect(outboxStore.forConversation(OWNER, "contexte:thread-send")).toMatchObject([{ messageId: "m-new" }])

    state.messages = [myMessage("m-new", "Bonjour")]
    mounted.rerender(view("thread-send"))
    await waitFor(() => expect(outboxStore.forConversation(OWNER, "contexte:thread-send")).toEqual([]))
    expect(screen.queryByText("Envoyé", { selector: ".msg-time" })).toBeNull()
    expect(screen.queryByText("Lu")).toBeNull()
    expect(document.querySelector(".msg-receipt")).toBeNull()
  })

  it("la règle neutre du domaine refuse un caractère de contrôle avant tout aller-retour", async () => {
    state.thread = contextThread({ threadId: "thread-control" })
    renderWithEngine(view("thread-control"))
    fireEvent.change(screen.getByRole("textbox", { name: "Message à Atelier Mbolo" }), { target: { value: `Bonjour${String.fromCharCode(7)}` } })
    fireEvent.click(screen.getByRole("button", { name: "Envoyer" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Le message contient des caractères non pris en charge.")
    expect(writes.send).not.toHaveBeenCalled()
  })
})

// ── États ─────────────────────────────────────────────────────────────────────

describe("états visibles d'une partie (§3.4)", () => {
  it("fermée : lecture seule, refus explicite à la place du composeur, historique lisible", () => {
    state.thread = contextThread({
      threadId: "thread-closed",
      state: { kind: "read_only", reason: "closed" },
      capabilities: { canSend: false, canAttach: false, canClose: false, canSetCallConsent: false, canCall: false },
      sendRefusal: "CONTEXT_CLOSED",
    })
    state.messages = [pageMessage()]
    renderWithEngine(view("thread-closed"))
    expect(screen.getByText("Conversation fermée : l'historique reste lisible.")).toBeInTheDocument()
    expect(screen.getByText("Cette conversation est fermée. Son historique reste lisible.")).toBeInTheDocument()
    expect(screen.getByText("Bonjour, nous pouvons passer jeudi.")).toBeInTheDocument()
    expect(screen.queryByRole("textbox")).toBeNull()
    expect(screen.queryByRole("button", { name: "Clore la conversation" })).toBeNull()
  })

  it("indisponible : lecture seule, sans dire qui a retiré quoi", () => {
    state.thread = contextThread({
      threadId: "thread-unavailable",
      state: { kind: "read_only", reason: "unavailable" },
      capabilities: { canSend: false, canAttach: false, canClose: true, canSetCallConsent: false, canCall: false },
      sendRefusal: "CONTEXT_UNAVAILABLE",
    })
    renderWithEngine(view("thread-unavailable"))
    expect(screen.getByText("Conversation indisponible pour le moment : l'historique reste lisible.")).toBeInTheDocument()
    expect(screen.getByText("Cette conversation est indisponible pour le moment. Son historique reste lisible.")).toBeInTheDocument()
    expect(screen.queryByRole("textbox")).toBeNull()
    // Sortir reste possible tant que l'objet est ouvert (D12).
    expect(screen.getByRole("button", { name: "Clore la conversation" })).toBeInTheDocument()
  })

  it.each(["bloquée", "absente"])("%s : la même phrase neutre, sans cause, et aucun message demandé", (_cas) => {
    state.thread = null
    renderWithEngine(view(`thread-refused-${_cas}`))
    expect(screen.getByText("Cette conversation n'est pas disponible.")).toBeInTheDocument()
    expect(state.messageCalls).toEqual([])
    expect(screen.queryByRole("textbox")).toBeNull()
    expect(document.body.textContent).not.toMatch(/bloqu|signataire|retir|Atelier/i)
    fireEvent.click(screen.getByRole("button", { name: "Retour" }))
    expect(onBack).toHaveBeenCalledOnce()
  })

  it("premier mot attendu, pièces fermées : la phase se dit par le refus explicite", () => {
    state.thread = contextThread({ threadId: "thread-waiting", capabilities: { ...OPEN_CAPABILITIES, canSend: false, canAttach: false }, sendRefusal: "CONTEXT_WAITING_RESPONDER" })
    const waiting = renderWithEngine(view("thread-waiting"))
    expect(screen.getByText("Vous pourrez écrire dès la première réponse de l'autre partie.")).toBeInTheDocument()
    expect(screen.queryByRole("textbox")).toBeNull()
    waiting.unmount()
    state.thread = contextThread({ threadId: "thread-no-files", capabilities: { ...OPEN_CAPABILITIES, canAttach: false } })
    renderWithEngine(view("thread-no-files"))
    expect(screen.getByText("Les pièces jointes ne sont pas ouvertes à ce stade de la conversation.")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Joindre un fichier" })).toBeNull()
  })

  it("pièces ouvertes : le dépôt passe par l'URL gardée du fil, et par elle seule", () => {
    state.thread = contextThread({ threadId: "thread-files" })
    renderWithEngine(view("thread-files"))
    expect(screen.getByRole("button", { name: "Joindre un fichier" })).toBeInTheDocument()
    expect(writes.generateUploadUrl).not.toHaveBeenCalled()
  })
})

// ── Refus de la tranche ───────────────────────────────────────────────────────

describe("refus explicite d'une adresse exacte (D8, code de la tranche)", () => {
  const ADDRESS = { data: { code: "invalidArgument", appRule: "context_address_forbidden", appParams: {} } }

  it("traduit par l'application qui l'a défini ; le texte reste dans le composeur", async () => {
    state.thread = contextThread({ threadId: "thread-address" })
    writes.send.mockRejectedValueOnce(ADDRESS)
    const describeAppRule = vi.fn((code: string) => (code === "context_address_forbidden" ? "Retirez l'adresse exacte : indiquez seulement une ville ou un quartier." : null))
    renderWithEngine(view("thread-address", { describeAppRule }))
    fireEvent.change(screen.getByRole("textbox", { name: "Message à Atelier Mbolo" }), { target: { value: "Rendez-vous au 12 rue des Lilas" } })
    fireEvent.click(screen.getByRole("button", { name: "Envoyer" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Retirez l'adresse exacte : indiquez seulement une ville ou un quartier.")
    expect(describeAppRule).toHaveBeenCalledWith("context_address_forbidden", {})
    expect(screen.getByRole("textbox", { name: "Message à Atelier Mbolo" })).toHaveValue("Rendez-vous au 12 rue des Lilas")
    expect(document.body.textContent).not.toContain("context_address_forbidden")
  })

  it("sans traduction de l'application, une phrase neutre — jamais le code brut", async () => {
    state.thread = contextThread({ threadId: "thread-address-neutral" })
    writes.send.mockRejectedValueOnce(ADDRESS)
    renderWithEngine(view("thread-address-neutral"))
    fireEvent.change(screen.getByRole("textbox", { name: "Message à Atelier Mbolo" }), { target: { value: "Rendez-vous au 12 rue des Lilas" } })
    fireEvent.click(screen.getByRole("button", { name: "Envoyer" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Ce message ne respecte pas une règle de cette mise en relation. Modifiez-le avant de l'envoyer.")
    expect(document.body.textContent).not.toContain("context_address_forbidden")
  })
})

// ── Appels (CC-4) ────────────────────────────────────────────────────────────

describe("accord d'appel et démarrage (CC-4)", () => {
  it("accord jamais prérempli ; l'effet de MES réglages (projection du fil, CC-4) est dit, rien de ceux d'en face", async () => {
    state.thread = contextThread({
      threadId: "thread-consent",
      capabilities: { ...OPEN_CAPABILITIES, canSetCallConsent: true },
      callSettings: { ...NO_CALL_SETTINGS, outsideRelationsSilenceWaived: true, dndUntil: Date.now() + 3_600_000, meetingSilence: true },
    })
    renderWithEngine(view("thread-consent"))
    fireEvent.click(screen.getByRole("button", { name: "Appels" }))
    expect(screen.getByText("En donnant votre accord, vous acceptez d'appeler et d'être appelé dans cette conversation seulement.")).toBeInTheDocument()
    expect(screen.getByText("Un appel exige l'accord des deux parties dans cette conversation. Rien ne sonne automatiquement.")).toBeInTheDocument()
    expect(screen.getByText("Si vous donnez votre accord, votre réglage « hors de mes relations : silencieux » ne s'appliquera pas à cette conversation.")).toBeInTheDocument()
    expect(screen.getByText(/^« Ne pas déranger » est actif jusqu'à .+ : aucun appel ne vous fait sonner, y compris dans cette conversation\.$/)).toBeInTheDocument()
    expect(screen.getByText("Votre silence automatique pendant les réunions s'applique aussi à cette conversation.")).toBeInTheDocument()
    expect(screen.queryByText(/signal d'appel en attente|sonnerie hors de l'onglet/)).toBeNull()
    expect(screen.queryByRole("button", { name: "Appel audio" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Donner mon accord d'appel" }))
    await waitFor(() => expect(writes.setCallConsent).toHaveBeenCalledWith({ threadId: "thread-consent", allowed: true }))
    expect(await screen.findByText("Accord d'appel enregistré.")).toBeInTheDocument()
    expect(calls.outgoing).not.toHaveBeenCalled()
  })

  it("en voix de page, l'accord dit que le signataire sera NOMMÉ ; un accord donné se retire", async () => {
    state.thread = contextThread({
      threadId: "thread-consent-page",
      viewer: { side: "responder", voice: "page" },
      counterpart: { kind: "person", label: BILAL },
      callConsent: true,
      capabilities: { ...OPEN_CAPABILITIES, canSetCallConsent: true },
    })
    renderWithEngine(view("thread-consent-page"))
    fireEvent.click(screen.getByRole("button", { name: "Appels" }))
    expect(screen.getByText("En donnant votre accord, vous acceptez d'appeler et d'être appelé dans cette conversation, et d'y être nommé : Bilal verra votre nom pendant l'appel.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Retirer mon accord d'appel" }))
    await waitFor(() => expect(writes.setCallConsent).toHaveBeenCalledWith({ threadId: "thread-consent-page", allowed: false }))
  })

  it("le demandeur appelle un signataire CONSENTANT choisi, nommé dans la fenêtre d'appel", async () => {
    state.thread = contextThread({
      threadId: "thread-call",
      callConsent: true,
      capabilities: { ...OPEN_CAPABILITIES, canSetCallConsent: true, canCall: true },
      callTargets: [{ personId: "persons_awa", label: AWA }, { personId: "persons_chloe", label: CHLOE }],
    })
    writes.startCall.mockResolvedValueOnce({ admitted: true, callId: "calls_1", calleePersonId: "persons_chloe", roomName: "call-1", mediaType: "audio" })
    renderWithEngine(view("thread-call"))
    fireEvent.click(screen.getByRole("button", { name: "Appels" }))
    fireEvent.change(screen.getByRole("combobox", { name: "Personne à appeler" }), { target: { value: "persons_chloe" } })
    fireEvent.click(screen.getByRole("button", { name: "Appel audio" }))
    await waitFor(() => expect(writes.startCall).toHaveBeenCalledWith({ threadId: "thread-call", mediaType: "audio", targetPersonId: "persons_chloe" }))
    await waitFor(() => expect(calls.outgoing).toHaveBeenCalledWith(expect.objectContaining({
      meetingId: "calls_1",
      participantUserId: "persons_chloe",
      scope: "personnel",
      callee: expect.objectContaining({ name: "Chloé", userId: "persons_chloe" }),
    })))
    expect(calls.refused).not.toHaveBeenCalled()
  })

  it("un refus d'admission ouvre l'écran de fin, sans messagerie vocale", async () => {
    state.thread = contextThread({
      threadId: "thread-call-refused",
      viewer: { side: "responder", voice: "page" },
      counterpart: { kind: "person", label: BILAL },
      callConsent: true,
      capabilities: { ...OPEN_CAPABILITIES, canSetCallConsent: true, canCall: true },
    })
    writes.startCall.mockResolvedValueOnce({ admitted: false, callId: "calls_2", calleePersonId: "persons_bilal", reason: "dnd", voicemailOffered: true })
    renderWithEngine(view("thread-call-refused"))
    fireEvent.click(screen.getByRole("button", { name: "Appels" }))
    fireEvent.click(screen.getByRole("button", { name: "Appel vidéo" }))
    await waitFor(() => expect(writes.startCall).toHaveBeenCalledWith({ threadId: "thread-call-refused", mediaType: "video" }))
    await waitFor(() => expect(calls.refused).toHaveBeenCalledWith(expect.objectContaining({ meetingId: "calls_2", voicemailOffered: false, callee: expect.objectContaining({ name: "Bilal" }) })))
  })

  it("les refus de CC-4 se disent traduits : accord manquant, cible à choisir", async () => {
    state.thread = contextThread({
      threadId: "thread-call-refusals",
      callConsent: true,
      capabilities: { ...OPEN_CAPABILITIES, canSetCallConsent: true, canCall: true },
      callTargets: [{ personId: "persons_awa", label: AWA }],
    })
    writes.startCall
      .mockRejectedValueOnce({ data: { code: "invalidArgument", rule: "CONTEXT_CALL_CONSENT_REQUIRED" } })
      .mockRejectedValueOnce({ data: { code: "invalidArgument", field: "targetPersonId" } })
    renderWithEngine(view("thread-call-refusals"))
    fireEvent.click(screen.getByRole("button", { name: "Appels" }))
    // Une seule cible consentante : choisie d'office, sans liste à dérouler.
    expect(screen.queryByRole("combobox", { name: "Personne à appeler" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Appel audio" }))
    await waitFor(() => expect(writes.startCall).toHaveBeenCalledWith({ threadId: "thread-call-refusals", mediaType: "audio", targetPersonId: "persons_awa" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Un appel exige l'accord des deux parties dans cette conversation.")
    fireEvent.click(screen.getByRole("button", { name: "Appel audio" }))
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Choisissez la personne de l'équipe à appeler."))
    expect(calls.outgoing).not.toHaveBeenCalled()
  })
})

// ── Accessibilité, gestes et lecture ─────────────────────────────────────────

describe("accessibilité de base et gestes d'une bulle", () => {
  it("fil en région nommée par son titre ; une arrivée s'annonce dans la région polie", async () => {
    state.thread = contextThread({ threadId: "thread-a11y" })
    state.messages = [myMessage("m-mine", "Ma question")]
    const mounted = renderWithEngine(view("thread-a11y"))
    expect(screen.getByRole("region", { name: "Atelier Mbolo" })).toBeInTheDocument()
    state.messages = [myMessage("m-mine", "Ma question"), pageMessage({ messageId: "m-reply", content: "Oui, jeudi 10 h.", createdAt: Date.UTC(2026, 9, 19, 11, 0) })]
    mounted.rerender(view("thread-a11y"))
    await waitFor(() =>
      expect(screen.getAllByRole("status").some((node) => node.textContent?.startsWith("Nouveau message de Atelier Mbolo : Oui, jeudi 10 h.") === true)).toBe(true),
    )
  })

  it("la feuille d'actions n'offre ni réaction, ni transfert, ni épingle ; signaler passe par un motif fermé", async () => {
    state.thread = contextThread({ threadId: "thread-report" })
    state.messages = [pageMessage()]
    renderWithEngine(view("thread-report"))
    fireEvent.click(screen.getByRole("button", { name: "Actions sur le message de Atelier Mbolo" }))
    const sheet = await screen.findByRole("dialog")
    expect(within(sheet).getByRole("button", { name: "Copier le texte" })).toBeInTheDocument()
    expect(within(sheet).queryByRole("button", { name: /Retirer|Transférer|Épingler|Répondre|J'aime/ })).toBeNull()
    fireEvent.click(within(sheet).getByRole("button", { name: "Signaler ce message" }))
    fireEvent.change(within(sheet).getByRole("combobox", { name: "Motif du signalement" }), { target: { value: "hate" } })
    fireEvent.click(within(sheet).getByRole("button", { name: "Envoyer le signalement" }))
    await waitFor(() => expect(writes.report).toHaveBeenCalledWith("m-page", "hate"))
    expect(await screen.findByText("Signalement transmis à la modération.")).toBeInTheDocument()
  })

  it("mon message se retire après confirmation ; un refus se dit DANS la feuille", async () => {
    state.thread = contextThread({ threadId: "thread-remove" })
    state.messages = [myMessage("m-mine", "Ma question")]
    writes.remove.mockRejectedValueOnce({ data: { code: "rateLimited" } }).mockResolvedValueOnce(null)
    renderWithEngine(view("thread-remove"))
    fireEvent.click(screen.getByRole("button", { name: "Actions sur votre message" }))
    const sheet = await screen.findByRole("dialog")
    expect(within(sheet).queryByRole("button", { name: "Signaler ce message" })).toBeNull()
    fireEvent.click(within(sheet).getByRole("button", { name: "Retirer mon message" }))
    fireEvent.click(within(sheet).getByRole("button", { name: "Retirer le message" }))
    expect(await within(sheet).findByRole("alert")).toBeInTheDocument()
    fireEvent.click(within(sheet).getByRole("button", { name: "Retirer le message" }))
    await waitFor(() => expect(writes.remove).toHaveBeenLastCalledWith({ threadId: "thread-remove", messageId: "m-mine" }))
    expect(await screen.findByText("Message retiré.")).toBeInTheDocument()
  })

  it("la clôture est confirmée, irréversible, contre la révision lue ; le focus va à « Annuler »", async () => {
    state.thread = contextThread({ threadId: "thread-close" })
    renderWithEngine(view("thread-close"))
    fireEvent.click(screen.getByRole("button", { name: "Clore la conversation" }))
    const question = screen.getByRole("group", { name: /Clore définitivement cette conversation/ })
    expect(within(question).getByRole("button", { name: "Annuler" })).toHaveFocus()
    fireEvent.click(within(question).getByRole("button", { name: "Clore définitivement" }))
    await waitFor(() => expect(writes.close).toHaveBeenCalledWith({ threadId: "thread-close", expectedRevision: 2 }))
    expect(await screen.findByText("Conversation close.")).toBeInTheDocument()
  })

  it("acquitte la lecture une fois par dernier message, sans rien montrer à l'autre côté", async () => {
    state.thread = contextThread({ threadId: "thread-read", unread: true })
    state.messages = [pageMessage()]
    const mounted = renderWithEngine(view("thread-read"))
    await waitFor(() => expect(writes.markRead).toHaveBeenCalledWith("thread-read"))
    mounted.rerender(view("thread-read"))
    expect(writes.markRead).toHaveBeenCalledOnce()
  })

  it("une lecture en échec propose de réessayer et de revenir", () => {
    state.threadError = true
    renderWithEngine(view("thread-error"))
    expect(screen.getByRole("alert")).toHaveTextContent("La conversation n'a pas pu être chargée.")
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Retour" }))
    expect(onBack).toHaveBeenCalledOnce()
  })
})
