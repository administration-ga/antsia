/** MC-02 — l'onglet « Réglages » n'existe que pour l'administrateur du réseau, jamais pour un modérateur. */
import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({ capacity: undefined as undefined | { networkWide: boolean; canReviewAppeals: boolean; canManagePolicy: boolean; teams: { teamId: string; name: string; scope: string | null }[] } }))
vi.mock("@antsia/api/engine", () => ({ api: { modules: { moderation: { cases: { myCapacity: "capacity", paginateQueue: "queue", paginatePending: "pending" } } } } }))
vi.mock("@antsia/api/network", () => ({ useNetwork: () => ({ networkId: "network" }) }))
vi.mock("@antsia/api/sign-out-everywhere", () => ({ isSigningOutEverywhere: () => false }))
vi.mock("@antsia/api/hooks", () => ({ useAuthenticatedConvexQuery: (reference: string) => reference === "capacity" ? { data: state.capacity, error: null, refetch: vi.fn() } : { data: undefined, error: null, refetch: vi.fn() } }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a> }))
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock("sonner", () => ({ toast: { info: vi.fn() } }))
vi.mock("@/components/member-chrome", () => ({ MemberPage: ({ children }: { children: ReactNode }) => <main>{children}</main> }))
vi.mock("./deadline-queue", () => ({ DeadlineQueue: () => <p>file-prioritaire</p>, ReportArticle: () => null }))
vi.mock("./moderation-forms", () => ({ PendingDecision: () => null }))
vi.mock("./network-appeals", () => ({ NetworkAppealRows: () => <p>recours</p> }))
vi.mock("./moderation-settings", () => ({ ModerationSettings: () => <p>ecran-des-reglages</p> }))
vi.mock("./page-claims", () => ({ PageClaimRows: () => <p>file-des-revendications</p> }))

import { ModerationScreen } from "./moderation-screen"

const moderator = { networkWide: true, canReviewAppeals: false, canManagePolicy: false, teams: [] }
const admin = { networkWide: true, canReviewAppeals: true, canManagePolicy: true, teams: [{ teamId: "team", name: "Équipe", scope: null }] }
beforeEach(() => { state.capacity = undefined })

describe("MC-02 — onglet des réglages de modération", () => {
  it("un modérateur sans rôle d'administrateur n'a pas l'onglet, et l'adresse directe est refusée", () => {
    state.capacity = moderator
    const tabs = renderToStaticMarkup(<ModerationScreen search={{}} />)
    expect(tabs).toContain("moderation.reports")
    expect(tabs).not.toContain("moderation.settings")
    const direct = renderToStaticMarkup(<ModerationScreen search={{ view: "settings" }} />)
    expect(direct).toContain("moderation.invalidSelection")
    expect(direct).not.toContain("ecran-des-reglages")
  })

  it("l'administrateur du réseau a l'onglet ; la vue montre les réglages sans choix d'équipe", () => {
    state.capacity = admin
    expect(renderToStaticMarkup(<ModerationScreen search={{}} />)).toContain("moderation.settings")
    const settings = renderToStaticMarkup(<ModerationScreen search={{ view: "settings" }} />)
    expect(settings).toContain("ecran-des-reglages")
    expect(settings).toContain('aria-current="page"')
    expect(settings).not.toContain("moderation.team")
    expect(settings).not.toContain("file-prioritaire")
    // Une équipe ou un curseur dans l'adresse ne s'appliquent pas aux réglages.
    expect(renderToStaticMarkup(<ModerationScreen search={{ view: "settings", team: "team" }} />)).toContain("moderation.invalidSelection")
  })
})

describe("PG-01 — onglet des revendications de pages", () => {
  it("un modérateur du réseau a l'onglet ; la vue montre la file sans choix d'équipe ni file prioritaire", () => {
    state.capacity = moderator
    expect(renderToStaticMarkup(<ModerationScreen search={{}} />)).toContain("moderation.claims")
    const claims = renderToStaticMarkup(<ModerationScreen search={{ view: "claims" }} />)
    expect(claims).toContain("file-des-revendications")
    expect(claims).not.toContain("moderation.team")
    expect(claims).not.toContain("file-prioritaire")
  })

  it("une équipe seule n'a pas l'onglet, et l'adresse directe est refusée", () => {
    state.capacity = { networkWide: false, canReviewAppeals: false, canManagePolicy: false, teams: [{ teamId: "team", name: "Équipe", scope: null }] }
    expect(renderToStaticMarkup(<ModerationScreen search={{ team: "team" }} />)).not.toContain("moderation.claims")
    const direct = renderToStaticMarkup(<ModerationScreen search={{ view: "claims" }} />)
    expect(direct).toContain("moderation.invalidSelection")
    expect(direct).not.toContain("file-des-revendications")
  })
})
