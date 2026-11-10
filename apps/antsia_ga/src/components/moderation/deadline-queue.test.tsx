// @vitest-environment jsdom
import { act, type AnchorHTMLAttributes } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const HOUR = 3_600_000
const NOW = Date.UTC(2026, 9, 21, 20, 0)
const state = vi.hoisted(() => ({ data: undefined as unknown, error: null as unknown, args: [] as unknown[] }))
vi.mock("@antsia/api/engine", () => ({ api: { modules: { moderation: { cases: { deadlineQueue: "deadlineQueue" } } } } }))
vi.mock("@antsia/api/network", () => ({ useNetwork: () => ({ networkId: "network" }) }))
vi.mock("@antsia/api/viewer-preferences", () => ({ useViewerTimeZone: () => "UTC" }))
vi.mock("@antsia/api/hooks", () => ({ useAuthenticatedConvexQuery: (_query: unknown, args: unknown) => { state.args.push(args); return { data: state.data, error: state.error, refetch: vi.fn() } } }))
vi.mock("./moderation-forms", () => ({ ReportDecision: ({ reportId }: { reportId: string }) => <p data-decision={reportId} /> }))
// Traduction rendue avec ses valeurs : le test lit ce que l'écran dirait.
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string, values?: Record<string, unknown>) => values ? `${key} ${JSON.stringify(values)}` : key, i18n: { language: "fr" } }) }))
vi.mock("next/link", () => ({ default: ({ href, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a {...props} href={href}>{children}</a> }))

import { DeadlineQueue } from "./deadline-queue"

function row(id: string, reason: string, legalBasis: "art24" | "art32" | "art33", dueAt: number, acknowledgedAt: number | null) {
  return { reportId: id, networkId: "network", target: { kind: "post", id: `post-${id}` }, teamId: null, level: "network", reason, status: "open", createdAt: dueAt - 72 * HOUR, decisionReason: null, legalBasis, dueAt, acknowledgedAt }
}

let root: Root | undefined
let container: HTMLDivElement
async function mount(teamId?: string) { root = createRoot(container); await act(async () => { root?.render(<DeadlineQueue teamId={teamId as never} />) }) }

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] }); vi.setSystemTime(NOW)
  container = document.createElement("div"); document.body.append(container)
  state.data = undefined; state.error = null; state.args = []
})
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; container.remove(); vi.useRealTimers() })

describe("SU01d — file prioritaire des délais légaux", () => {
  it("présente l'échéance dépassée en retard, puis le reste de la suivante, avec fondement et accusé", async () => {
    state.data = { items: [row("late", "deepfake_of_me", "art33", NOW - (2 * HOUR + 5 * 60_000), NOW - 26 * HOUR), row("soon", "harassment", "art24", NOW + 5 * HOUR + 12 * 60_000, null)], truncated: false }
    await mount()
    const articles = [...container.querySelectorAll("article")]
    expect(articles.map((article) => article.querySelector("[data-decision]")?.getAttribute("data-decision"))).toEqual(["late", "soon"])
    const timers = [...container.querySelectorAll('[role="timer"]')].map((node) => node.textContent)
    // La durée est elle-même une phrase traduite, imbriquée (donc échappée) dans celle du chronomètre.
    expect(timers[0]).toContain("moderation.deadlines.overdue")
    expect(timers[0]).toMatch(/hours\\?":2,\\?"minutes\\?":5/)
    expect(timers[1]).toContain("moderation.deadlines.remaining")
    expect(timers[1]).toMatch(/hours\\?":5,\\?"minutes\\?":12/)
    expect(articles[0]?.textContent).toContain("moderation.deadlines.basis.art33")
    expect(articles[0]?.textContent).toContain("moderation.deadlines.acknowledged")
    expect(articles[1]?.textContent).toContain("moderation.deadlines.notAcknowledged")
    expect(container.textContent).toContain('moderation.deadlines.summary {"count":2}')
    expect(container.textContent).toContain('moderation.deadlines.overdueCount {"count":1}')
    expect(container.querySelector("a")?.getAttribute("href")).toContain("post-late")
  })

  it("fait avancer le chronomètre sans relire la base", async () => {
    state.data = { items: [row("soon", "minor_harm", "art24", NOW + 10 * 60_000, NOW)], truncated: false }
    await mount()
    expect(container.querySelector('[role="timer"]')?.textContent).toContain("moderation.deadlines.remaining")
    const reads = state.args.length
    await act(async () => { vi.advanceTimersByTime(11 * 60_000) })
    expect(container.querySelector('[role="timer"]')?.textContent).toContain("moderation.deadlines.overdue")
    expect(container.textContent).toContain('moderation.deadlines.overdueCount {"count":1}')
    // Les nouveaux rendus relisent la même requête réactive, avec les mêmes arguments.
    expect(state.args.slice(reads).every((args) => JSON.stringify(args) === JSON.stringify(state.args[0]))).toBe(true)
  })

  it("dit la file vide, la borne des 50 et transmet l'équipe choisie", async () => {
    state.data = { items: [], truncated: false }
    await mount("team-1")
    expect(container.textContent).toContain("moderation.deadlines.empty")
    expect(state.args[0]).toEqual({ networkId: "network", teamId: "team-1" })
    await act(async () => root?.unmount()); root = undefined
    state.data = { items: [row("one", "prohibited_ai_content", "art32", NOW + HOUR, NOW)], truncated: true }
    await mount()
    expect(container.textContent).toContain("moderation.deadlines.truncated")
    expect(container.textContent).toContain("moderation.deadlines.basis.art32")
  })
})
