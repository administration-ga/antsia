// @vitest-environment jsdom
/**
 * MD-07 (antsia#99) — « Mes décisions de modération » : le moteur ne rend que les mesures prises et
 * celles annulées sur recours. Une mesure se lit avec son recours ; une mesure annulée sur recours
 * (dossier repassé à « classé », recours « annulé ») se dit « Décision révisée », jamais « Sans suite ».
 */
import { createAppI18n } from "@antsia/social-features/i18n"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { appResources } from "@/i18n/resources"

type DecisionRow = { reportId: string; status: string; decisionReason: string | null; appeals: { appealId: string; level: string; status: string; decisionReason: string | null }[] }
const state = vi.hoisted(() => ({ results: [] as DecisionRow[], status: "Exhausted", loadMore: vi.fn(), appeal: vi.fn() }))

vi.mock("@convex/_generated/api", () => ({ api: { modules: { moderation: { cases: { myDecisions: "decisions", fileAppeal: "appeal" } } } } }))
vi.mock("convex/react", () => ({
  usePaginatedQuery: () => ({ results: state.results, status: state.status, loadMore: state.loadMore }),
  useMutation: () => state.appeal,
  useConvex: () => ({}),
  useQuery: () => undefined,
}))
vi.mock("@antsia/api/hooks", () => ({ useStableConvexAuth: () => ({ isAuthenticated: false, isUnauthenticated: false }) }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("@/lib/sign-out", () => ({ signOutAndRedirect: vi.fn() }))
// Les autres sections de « Mes données » ne sont pas l'objet de ce test.
vi.mock("./notification-controls", () => ({ NotificationControls: () => null }))
vi.mock("./preferences-controls", () => ({ PreferencesControls: () => null }))
vi.mock("./analytics-controls", () => ({ AnalyticsControls: () => null }))
vi.mock("./personal-commerce-controls", () => ({ PersonalCommerceControls: () => null }))
vi.mock("./erasure-commerce-notice", () => ({ ErasureCommerceNotice: () => null }))
vi.mock("./page-moderation-decisions", () => ({ PageModerationDecisions: () => null }))
vi.mock("./public-agent-controls", () => ({ PublicAgentControls: () => null }))

import { MyModerationDecisions } from "./personal-controls"

const i18n = createAppI18n({ locale: "fr", appResources, defaultNS: "antsia" })
let root: Root, container: HTMLDivElement

async function render() {
  await act(async () => root.render(<I18nextProvider i18n={i18n}><MyModerationDecisions /></I18nextProvider>))
}

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  state.results = []; state.status = "Exhausted"; state.loadMore.mockReset(); state.appeal.mockReset()
  container = document.createElement("div"); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove() })

describe("MD-07 — Mes décisions de modération", () => {
  it("une mesure se lit avec son recours ; une mesure annulée sur recours se dit « Décision révisée », jamais « Sans suite »", async () => {
    state.results = [
      { reportId: "report-a", status: "actioned", decisionReason: "Motif de la mesure", appeals: [] },
      { reportId: "report-b", status: "dismissed", decisionReason: "Motif de la mesure annulée", appeals: [{ appealId: "appeal-b", level: "platform", status: "overturned", decisionReason: "Réexamen favorable" }] },
    ]
    await render()
    const [measure, overturned] = Array.from(container.querySelectorAll("article"))
    expect(measure?.textContent).toContain(i18n.t("personal.statuses.actioned"))
    expect(measure?.textContent).toContain("Motif de la mesure")
    expect(measure?.querySelector("form")).not.toBeNull()
    expect(overturned?.textContent).toContain(i18n.t("personal.statuses.overturned"))
    expect(overturned?.textContent).not.toContain(i18n.t("personal.statuses.dismissed"))
    expect(overturned?.querySelector("form")).toBeNull()
  })

  it("sans mesure : la phrase d'absence, sans suite à charger", async () => {
    await render()
    expect(container.textContent).toContain(i18n.t("personal.noDecisions"))
    expect(container.querySelector("article")).toBeNull()
    expect(container.textContent).not.toContain(i18n.t("personal.loadMore"))
  })
})
