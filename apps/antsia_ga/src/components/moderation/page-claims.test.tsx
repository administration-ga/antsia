// @vitest-environment jsdom
/**
 * PG-01 — section « Revendications de pages » : file paginée (chargement, vide, erreur), fiche
 * (pièces servies par la garde, retenues dites comme telles, pièces purgées), décision motivée
 * confirmée, et décideur écarté quand le serveur le dit (demandeur, signataire de la page).
 */
import { act, type AnchorHTMLAttributes, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Id } from "@antsia/api/engine"

type Detail = { claimId: string; status: string; decisionReason: string | null; decidedAt: number | null; evidence: { url: string | null; withheld: string | null }[]; canDecide?: boolean } & Record<string, unknown>
const state = vi.hoisted(() => ({
  queue: undefined as unknown,
  queueError: null as unknown,
  detail: undefined as Detail | undefined,
  detailError: null as unknown,
  calls: [] as [string, unknown][],
  mutation: vi.fn(),
  success: vi.fn(),
  failure: vi.fn(),
}))
vi.mock("@antsia/api/engine", () => ({ api: { modules: { pages: { claims: { paginatePageClaims: "queue", getPageClaim: "detail", decidePageClaim: "decide" } } } } }))
vi.mock("@antsia/api/network", () => ({ useNetwork: () => ({ networkId: "root" }) }))
vi.mock("@antsia/api/viewer-preferences", () => ({ useViewerTimeZone: () => "UTC" }))
vi.mock("@antsia/api/sign-out-everywhere", () => ({ isSigningOutEverywhere: () => false }))
vi.mock("@antsia/api/hooks", () => ({
  useAuthenticatedConvexQuery: (reference: string, args: unknown) => {
    state.calls.push([reference, args])
    return reference === "queue" ? { data: state.queue, error: state.queueError, refetch: vi.fn() } : { data: state.detail, error: state.detailError, refetch: vi.fn() }
  },
}))
vi.mock("convex/react", () => ({ useMutation: () => state.mutation }))
// L'aperçu des files (`moderation-preview`, chargé par `moderation-forms`) n'a pas sa place ici.
vi.mock("@antsia/social-features/reseau-personnel", () => ({ PostMedia: () => null }))
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string, params?: Record<string, unknown>) => (params && "index" in params ? `${key}#${String(params.index)}` : key), i18n: { language: "fr" } }) }))
vi.mock("sonner", () => ({ toast: { success: state.success, error: state.failure, info: vi.fn() } }))
vi.mock("next/link", () => ({ default: ({ href, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a {...props} href={href}>{children}</a> }))

import { ModerationGuard } from "./moderation-guard"
import { moderationWindow } from "./moderation-model"
import { PageClaimDetail, PageClaimRows } from "./page-claims"

const CLAIM = {
  claimId: "claim-1",
  page: { pageId: "page-1", networkId: "root", handle: "pecheurs-lambarene", name: "Association des pêcheurs", shortName: null, logoUrl: null, badge: "community", ownerKind: "association", country: null },
  claimant: { personId: "person-1", handle: "awa", displayName: "Awa", avatarUrl: null },
  status: "pending",
  note: "Je préside l'association.",
  evidenceCount: 2,
  decisionReason: null,
  createdAt: Date.UTC(2026, 10, 9, 10),
  decidedAt: null,
}

let root: Root | undefined
let container: HTMLDivElement
async function mount(node: ReactNode) { root = createRoot(container); await act(async () => { root?.render(<ModerationGuard>{node}</ModerationGuard>) }) }
async function reason(text: string) {
  await act(async () => {
    const input = container.querySelector<HTMLTextAreaElement>('textarea[name="reason"]')
    if (!input) throw new Error("Missing reason")
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(input, text)
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
}
async function choose(name: string, value: string) {
  await act(async () => {
    const select = container.querySelector<HTMLSelectElement>(`select[name="${name}"]`)
    if (!select) throw new Error(`Missing ${name}`)
    select.value = value
    select.dispatchEvent(new Event("change", { bubbles: true }))
  })
}
async function submit() { await act(async () => { container.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })) }) }
const detail = (overrides: Partial<Detail> = {}): Detail => ({ ...CLAIM, evidence: [{ url: "https://stockage.exemple.test/piece-1", withheld: null }, { url: null, withheld: "fileScanPending" }], canDecide: true, ...overrides })

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement("div"); document.body.append(container)
  state.queue = undefined; state.queueError = null; state.detail = undefined; state.detailError = null; state.calls = []
  state.mutation.mockReset().mockResolvedValue({ status: "approved" }); state.success.mockReset(); state.failure.mockReset()
})
afterEach(async () => {
  await act(async () => { root?.unmount() })
  root = undefined; container.remove(); vi.restoreAllMocks()
})

describe("PG-01 — file des revendications", () => {
  it("lit la file EN ATTENTE du réseau, vingt demandes au plus, sans équipe ni identité en argument", async () => {
    await mount(<PageClaimRows cursor="opaque" onFirst={() => undefined} onNext={() => undefined} />)
    expect(state.calls).toEqual([["queue", { networkId: "root", status: "pending", paginationOpts: { numItems: 20, cursor: "opaque", maximumRowsRead: 50, maximumBytesRead: 262_144 } }]])
    expect(container.textContent).toContain("common.loading")
  })

  it("dit l'erreur sans montrer d'ancien résultat, et la file vide comme telle", async () => {
    state.queue = { page: [], isDone: true, continueCursor: "" }; state.queueError = new Error("refus")
    await mount(<PageClaimRows cursor={null} onFirst={() => undefined} onNext={() => undefined} />)
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("common.retry")
    expect(container.textContent).not.toContain("moderation.pageClaims.empty")
    state.queueError = null
    await act(async () => { root?.render(<ModerationGuard><PageClaimRows cursor={null} onFirst={() => undefined} onNext={() => undefined} /></ModerationGuard>) })
    expect(container.textContent).toContain("moderation.pageClaims.empty")
    expect(container.textContent).toContain("common.end")
  })

  it("montre la page, son badge calculé, le demandeur, la note et le lien de la page ; la fiche s'ouvre sur demande", async () => {
    state.queue = { page: [CLAIM], isDone: false, continueCursor: "suite" }
    const onNext = vi.fn()
    await mount(<PageClaimRows cursor={null} onFirst={() => undefined} onNext={onNext} />)
    const text = container.textContent ?? ""
    for (const expected of ["Association des pêcheurs", "moderation.pageClaims.badges.community", "moderation.pageClaims.claimant", "moderation.pageClaims.note", "moderation.pageClaims.openPage"]) expect(text).toContain(expected)
    expect(container.querySelector("a")?.getAttribute("href")).toBe("/page/pecheurs-lambarene")
    expect(state.calls.some(([reference]) => reference === "detail")).toBe(false)
    const instruct = [...container.querySelectorAll("button")].find((button) => button.textContent === "moderation.pageClaims.instruct")!
    expect(instruct.getAttribute("aria-expanded")).toBe("false")
    await act(async () => { instruct.click() })
    expect(state.calls.some(([reference, args]) => reference === "detail" && JSON.stringify(args) === JSON.stringify({ networkId: "root", claimId: "claim-1" }))).toBe(true)
    const next = [...container.querySelectorAll("button")].find((button) => button.textContent === "common.next")!
    await act(async () => { next.click() })
    expect(onNext).toHaveBeenCalledWith("suite")
  })

  it("change d'état (validées, refusées) et repart de la première page", async () => {
    state.queue = { page: [], isDone: true, continueCursor: "" }
    const onFirst = vi.fn()
    await mount(<PageClaimRows cursor="page-2" onFirst={onFirst} onNext={() => undefined} />)
    await act(async () => {
      const select = container.querySelector("select")!
      select.value = "approved"
      select.dispatchEvent(new Event("change", { bubbles: true }))
    })
    expect(onFirst).toHaveBeenCalled()
    expect(state.calls.at(-1)).toEqual(["queue", { networkId: "root", status: "approved", paginationOpts: { numItems: 20, cursor: "page-2", maximumRowsRead: 50, maximumBytesRead: 262_144 } }])
  })
})

describe("PG-01 — fiche d'une revendication", () => {
  it("sert la pièce analysée par la garde et dit la pièce retenue, sans lien", async () => {
    state.detail = detail()
    await mount(<PageClaimDetail claimId={"claim-1" as Id<"pageClaims">} />)
    const links = [...container.querySelectorAll("a")]
    expect(links.map((link) => [link.getAttribute("href"), link.getAttribute("rel"), link.textContent])).toEqual([["https://stockage.exemple.test/piece-1", "noopener noreferrer", "moderation.pageClaims.evidenceOpen#1"]])
    expect(container.textContent).toContain("moderation.pageClaims.evidenceWithheld.fileScanPending#2")
    expect(container.querySelector("form")).not.toBeNull()
  })

  it("le demandeur ou un signataire de la page ne voit pas de décision : un autre modérateur tranche", async () => {
    state.detail = detail({ canDecide: false })
    await mount(<PageClaimDetail claimId={"claim-1" as Id<"pageClaims">} />)
    expect(container.querySelector("form")).toBeNull()
    expect(container.textContent).toContain("moderation.pageClaims.anotherDecider")
  })

  it("une demande tranchée se relit (décision, date, motif) ; ses pièces purgées se disent", async () => {
    state.detail = detail({ status: "rejected", decisionReason: "Le mandat présenté est échu.", decidedAt: Date.UTC(2026, 10, 10, 9), evidence: [], canDecide: false })
    await mount(<PageClaimDetail claimId={"claim-1" as Id<"pageClaims">} />)
    expect(container.querySelector("form")).toBeNull()
    for (const expected of ["moderation.pageClaims.statusLabel.rejected", "moderation.pageClaims.decidedAt", "moderation.pageClaims.decisionReason", "moderation.pageClaims.evidencePurged"]) expect(container.textContent).toContain(expected)
  })

  it("une erreur de lecture propose de réessayer", async () => {
    state.detailError = new Error("refus")
    await mount(<PageClaimDetail claimId={"claim-1" as Id<"pageClaims">} />)
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("common.retry")
  })
})

describe("PG-01 — décision motivée et confirmée", () => {
  it("refuse un motif vide sans rien envoyer", async () => {
    state.detail = detail()
    await mount(<PageClaimDetail claimId={"claim-1" as Id<"pageClaims">} />)
    await submit()
    expect(state.mutation).not.toHaveBeenCalled()
    expect(container.textContent).toContain("moderation.reasonInvalid")
  })

  it("n'envoie rien si la confirmation est déclinée", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false)
    state.detail = detail()
    await mount(<PageClaimDetail claimId={"claim-1" as Id<"pageClaims">} />)
    await reason("Statuts et procès-verbal conformes.")
    await submit()
    expect(confirm).toHaveBeenCalledWith("moderation.pageClaims.confirm.approved")
    expect(state.mutation).not.toHaveBeenCalled()
  })

  it.each(["approved", "rejected"] as const)("transmet la décision %s et son motif nettoyé, après confirmation", async decision => {
    vi.spyOn(window, "confirm").mockReturnValue(true)
    state.detail = detail()
    await mount(<PageClaimDetail claimId={"claim-1" as Id<"pageClaims">} />)
    await choose("decision", decision)
    await reason("  Statuts et procès-verbal conformes.  ")
    await submit()
    expect(state.mutation).toHaveBeenCalledWith({ networkId: "root", claimId: "claim-1", decision, reason: "Statuts et procès-verbal conformes." })
    expect(state.success).toHaveBeenCalledWith("moderation.saved")
  })
})

describe("PG-01, AS-01 — l'onglet suit la capacité serveur des revendications", () => {
  it("admis pour un rôle de réseau ou un membre de l'équipe compétente, refusé sans cette capacité et avec une équipe dans l'adresse", () => {
    const networkWide = { networkWide: true, canReviewAppeals: false, canManagePolicy: false, canReviewPageClaims: true, teams: [{ teamId: "team" }] }
    expect(moderationWindow({ view: "claims" }, networkWide)).toMatchObject({ valid: true, view: "claims" })
    expect(moderationWindow({ view: "claims", cursor: "suite" }, networkWide)).toMatchObject({ valid: true, cursor: "suite" })
    expect(moderationWindow({ view: "claims", team: "team" }, networkWide).valid).toBe(false)
    // AS-01 : le membre de l'équipe compétente, sans rôle de réseau.
    const pagesTeam = { networkWide: false, canReviewPageClaims: true, teams: [{ teamId: "team" }] }
    expect(moderationWindow({ view: "claims" }, pagesTeam)).toMatchObject({ valid: true, view: "claims", team: undefined })
    expect(moderationWindow({ view: "claims", team: "team" }, pagesTeam).valid).toBe(false)
    // Sans la capacité serveur, ni une équipe (des publications) ni la seule portée du réseau n'ouvrent la vue.
    expect(moderationWindow({ view: "claims" }, { networkWide: false, canReviewPageClaims: false, teams: [{ teamId: "team" }] }).valid).toBe(false)
    expect(moderationWindow({ view: "claims" }, { networkWide: true, teams: [] }).valid).toBe(false)
  })
})
