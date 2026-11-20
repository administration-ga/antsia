// @vitest-environment jsdom
import { BRAND_NAME } from "@antsia/social-contracts/brand"
import { createAppI18n } from "@antsia/social-features/i18n"
import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { appResources } from "@/i18n/resources"
import { routes } from "@/lib/routes"

type OpeningArgs = { networkId: string; reference: string; openingToken: string }
type QueryState = { data: unknown; isPending: boolean; isFetching: boolean; isError: boolean }

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  mutate: vi.fn(),
  getUserMedia: vi.fn(),
  session: { root: { _id: "network-1" }, person: { _id: "person-1" } },
  requests: [] as (OpeningArgs | "skip")[],
  responses: new Map<string, QueryState>(),
}))

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }) }))
vi.mock("@/components/network-shell", () => ({ useMemberSession: () => mocks.session }))
vi.mock("@/components/member-chrome", () => ({ MemberPage: ({ children }: { children: ReactNode }) => <main>{children}</main> }))
vi.mock("@antsia/api/hooks", () => ({
  useAuthenticatedConvexQuery: (_reference: unknown, args: OpeningArgs | "skip") => {
    mocks.requests.push(args)
    return args === "skip"
      ? { data: undefined, isPending: false, isFetching: false, isError: false }
      : mocks.responses.get(JSON.stringify(args)) ?? { data: undefined, isPending: true, isFetching: true, isError: false }
  },
  useConvexMutationQuery: () => ({ mutateAsync: mocks.mutate }),
  useConvexActionQuery: () => ({ mutateAsync: mocks.mutate }),
}))

import { NotificationOpenScreen } from "./notification-open-screen"

const REFERENCE = "notification-job-1"
const POST_ID = "jd7c7gw7f0nkf8kv8dazmw86ps8r4qgq"
const POST_TARGET = { channel: "notification", kind: "post_comment", subject: { kind: "post", id: POST_ID }, actorHandle: "awa.demo" }
let root: Root | undefined
let host: HTMLDivElement | undefined
let previousMediaDevices: PropertyDescriptor | undefined

function opening(): OpeningArgs {
  const args = mocks.requests.at(-1)
  if (!args || args === "skip") throw new Error("Aucune ouverture en cours")
  return args
}

async function mount(reference: string | undefined = REFERENCE) {
  const i18n = createAppI18n({ locale: "fr", appResources, defaultNS: "antsia", defaultVariables: { brand: BRAND_NAME } })
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
  let currentReference = reference
  const rerender = async (nextReference = currentReference) => {
    currentReference = nextReference
    await act(async () => root!.render(<I18nextProvider i18n={i18n}><NotificationOpenScreen reference={currentReference} /></I18nextProvider>))
  }
  await rerender()
  return rerender
}

function reply(data: unknown, state: Partial<Omit<QueryState, "data">> = {}) {
  mocks.responses.set(JSON.stringify(opening()), { data, isPending: false, isFetching: false, isError: false, ...state })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.session = { root: { _id: "network-1" }, person: { _id: "person-1" } }
  mocks.requests = []
  mocks.responses.clear()
  let sequence = 0
  vi.spyOn(crypto, "randomUUID").mockImplementation(() => `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`)
  previousMediaDevices = Object.getOwnPropertyDescriptor(navigator, "mediaDevices")
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: mocks.getUserMedia } })
})

afterEach(async () => {
  await act(async () => root?.unmount())
  host?.remove()
  root = undefined
  host = undefined
  vi.restoreAllMocks()
  if (previousMediaDevices) Object.defineProperty(navigator, "mediaDevices", previousMediaDevices)
  else Reflect.deleteProperty(navigator, "mediaDevices")
})

describe("porte de notification — relecture obligatoire", () => {
  it("attend le résultat de cette ouverture avant toute redirection", async () => {
    const rerender = await mount()
    expect(mocks.replace).not.toHaveBeenCalled()
    expect(host?.querySelector('[role="status"]')?.textContent).toContain("Vérification de la notification…")
    expect(opening()).toMatchObject({ networkId: "network-1", reference: REFERENCE, openingToken: expect.any(String) })

    reply(POST_TARGET)
    await rerender()
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith(routes.memberPost(POST_ID))
  })

  it("ne suit pas les anciennes données pendant isFetching", async () => {
    const rerender = await mount()
    reply(POST_TARGET, { isFetching: true })
    await rerender()
    expect(mocks.replace).not.toHaveBeenCalled()
    expect(host?.querySelector('[role="status"]')).not.toBeNull()

    const freshPostId = "fresh-post"
    reply({ ...POST_TARGET, subject: { kind: "post", id: freshPostId } })
    await rerender()
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith(routes.memberPost(freshPostId))
  })

  it("une erreur avec des données anciennes ne redirige jamais ; Réessayer renouvelle la lecture", async () => {
    const rerender = await mount()
    const previous = opening().openingToken
    reply(POST_TARGET, { isError: true })
    await rerender()
    expect(mocks.replace).not.toHaveBeenCalled()
    expect(host?.textContent).toContain("La notification n’a pas pu être vérifiée.")
    expect(host?.querySelector("a")?.getAttribute("href")).toBe(routes.notificationCenter())

    await act(async () => host?.querySelector<HTMLButtonElement>("button")?.click())
    expect(opening().openingToken).not.toBe(previous)
    expect(mocks.replace).not.toHaveBeenCalled()
    expect(host?.querySelector('[role="status"]')).not.toBeNull()
  })

  it("une cible nulle présente seulement le repli neutre vers les notifications", async () => {
    const rerender = await mount()
    reply(null)
    await rerender()
    expect(mocks.replace).not.toHaveBeenCalled()
    expect(host?.textContent).toContain("Cette notification n’est plus disponible dans votre session.")
    expect(host?.querySelector("a")?.textContent).toBe("Voir mes notifications")
    expect(host?.querySelector("a")?.getAttribute("href")).toBe(routes.notificationCenter())
    expect(host?.querySelector("button")).toBeNull()
  })

  it("une notification sans sujet ouvrable revient au centre, sans inventer de cible", async () => {
    const rerender = await mount()
    reply({ ...POST_TARGET, subject: null })
    await rerender()
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith(routes.notificationCenter())
  })

  it("ne répète pas la navigation pour un rendu supplémentaire de la même ouverture", async () => {
    const rerender = await mount()
    reply(POST_TARGET)
    await rerender()
    await rerender()
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith(routes.memberPost(POST_ID))
  })
})

describe("avis d'appel — navigation seule", () => {
  it.each([true, false])("ouvre Appels pour ringing=%s sans accepter ni demander de caméra", async (ringing) => {
    const rerender = await mount()
    reply({ channel: "call", ringing })
    await rerender()
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith(`${routes.messages()}?brique=iappel`)
    expect(mocks.mutate).not.toHaveBeenCalled()
    expect(mocks.getUserMedia).not.toHaveBeenCalled()
  })
})

describe("identité de l'ouverture", () => {
  it.each(["person", "network", "reference"] as const)("renouvelle openingToken quand %s change et n'utilise pas l'ancien résultat", async (change) => {
    const rerender = await mount()
    const previous = opening().openingToken
    reply(POST_TARGET)
    await rerender()
    mocks.replace.mockClear()

    if (change === "person") mocks.session = { ...mocks.session, person: { _id: "person-2" } }
    if (change === "network") mocks.session = { ...mocks.session, root: { _id: "network-2" } }
    await rerender(change === "reference" ? "notification-job-2" : REFERENCE)
    expect(opening().openingToken).not.toBe(previous)
    expect(mocks.replace).not.toHaveBeenCalled()
    expect(host?.querySelector('[role="status"]')).not.toBeNull()

    const nextPost = "newly-authorized-post"
    reply({ ...POST_TARGET, subject: { kind: "post", id: nextPost } })
    await rerender()
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith(routes.memberPost(nextPost))
  })

  it("garde le jeton pendant un simple rendu du même destinataire et de la même référence", async () => {
    const rerender = await mount()
    const previous = opening().openingToken
    await rerender()
    expect(opening().openingToken).toBe(previous)
    expect(mocks.replace).not.toHaveBeenCalled()
  })
})

/** P14B (écrit, non exécuté) : la destination TYPÉE relue par le serveur l'emporte sur le sujet commun. */
describe("destinations typées — services, candidatures, décisions", () => {
  const notice = (kind: string, target: unknown) => ({ channel: "notification", kind, subject: null, actorHandle: null, target })

  it.each([
    ["demande de service du client", notice("commerce_service_booking_confirmed", { kind: "serviceRequest", requestRowId: "demande-opaque-1" }), routes.serviceRequest("demande-opaque-1")],
    ["fiche de candidature", notice("commerce_job_application_updated", { kind: "jobApplication", applicationId: "candidature-1" }), routes.jobApplication("candidature-1")],
    ["conversation lue par l'équipe", notice("commerce_service_quote_accepted", { kind: "commercialThread", threadId: "fil-1" }), routes.commercialConversation("fil-1")],
    ["décisions de la page du signataire vivant", { ...notice("moderation_decision", { kind: "pageModerationDecisions", pageId: "page-1", pageHandle: "page-demo" }), subject: { kind: "report", id: "r1" } }, routes.pageModerationDecisions("page-1")],
    ["décisions personnelles", { ...notice("moderation_decision", { kind: "personalDecisions" }), subject: { kind: "report", id: "r1" } }, routes.personalControls()],
  ])("ouvre %s", async (_label, data, expected) => {
    const rerender = await mount()
    reply(data)
    await rerender()
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith(expected)
  })

  it("avis d'équipe sans destination ANTSIA (rendez-vous) ou avis DIASPORA.GA : centre des notifications, rien d'inventé", async () => {
    const rerender = await mount()
    reply(notice("commerce_service_booking_held", null))
    await rerender()
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith(routes.notificationCenter())
    mocks.replace.mockClear()
    await rerender("notification-job-diaspora")
    reply(notice("service_request_received", { kind: "diasporaServiceNotice", audience: "provider", subjectKind: "serviceRequest", subjectId: "sr-1", requestId: "sr-1", pageHandle: "salon-demo" }))
    await rerender()
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith(routes.notificationCenter())
  })
})
