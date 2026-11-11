/**
 * MC-02 — l'onglet « Réglages » n'existe que pour l'administrateur du réseau, jamais pour un modérateur.
 * AS-01 — l'onglet « Pages à vérifier » suit `pages.claims.myPageClaimReview` : rôle de réseau, ou membre
 * de l'équipe compétente pour les pages.
 */
import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
  capacity: undefined as undefined | { networkWide: boolean; canReviewAppeals: boolean; canManagePolicy: boolean; teams: { teamId: string; name: string; scope: string | null }[] },
  claimReview: undefined as undefined | { canReview: boolean },
}))
vi.mock("@antsia/api/engine", () => ({ api: { modules: { moderation: { cases: { myCapacity: "capacity", paginateQueue: "queue", paginatePending: "pending" } }, pages: { claims: { myPageClaimReview: "claimReview" } } } } }))
vi.mock("@antsia/api/network", () => ({ useNetwork: () => ({ networkId: "network" }) }))
vi.mock("@antsia/api/sign-out-everywhere", () => ({ isSigningOutEverywhere: () => false }))
vi.mock("@antsia/api/hooks", () => ({
  useAuthenticatedConvexQuery: (reference: string) => reference === "capacity" ? { data: state.capacity, error: null, refetch: vi.fn() } : reference === "claimReview" ? { data: state.claimReview, error: null, refetch: vi.fn() } : { data: undefined, error: null, refetch: vi.fn() },
}))
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
beforeEach(() => { state.capacity = undefined; state.claimReview = undefined })

describe("MC-02 — onglet des réglages de modération", () => {
  it("un modérateur sans rôle d'administrateur n'a pas l'onglet, et l'adresse directe est refusée", () => {
    state.capacity = moderator
    state.claimReview = { canReview: true }
    const tabs = renderToStaticMarkup(<ModerationScreen search={{}} />)
    expect(tabs).toContain("moderation.reports")
    expect(tabs).not.toContain("moderation.settings")
    const direct = renderToStaticMarkup(<ModerationScreen search={{ view: "settings" }} />)
    expect(direct).toContain("moderation.invalidSelection")
    expect(direct).not.toContain("ecran-des-reglages")
  })

  it("l'administrateur du réseau a l'onglet ; la vue montre les réglages sans choix d'équipe", () => {
    state.capacity = admin
    state.claimReview = { canReview: true }
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

describe("PG-01, AS-01 — onglet des revendications de pages", () => {
  it("un modérateur du réseau a l'onglet ; la vue montre la file sans choix d'équipe ni file prioritaire", () => {
    state.capacity = moderator
    state.claimReview = { canReview: true }
    expect(renderToStaticMarkup(<ModerationScreen search={{}} />)).toContain("moderation.claims")
    const claims = renderToStaticMarkup(<ModerationScreen search={{ view: "claims" }} />)
    expect(claims).toContain("file-des-revendications")
    expect(claims).not.toContain("moderation.team")
    expect(claims).not.toContain("file-prioritaire")
  })

  it("le membre de l'équipe compétente pour les pages a l'onglet et la file, sans rôle de réseau", () => {
    state.capacity = { networkWide: false, canReviewAppeals: false, canManagePolicy: false, teams: [{ teamId: "team", name: "Équipe", scope: "page" }] }
    state.claimReview = { canReview: true }
    expect(renderToStaticMarkup(<ModerationScreen search={{ team: "team" }} />)).toContain("moderation.claims")
    const claims = renderToStaticMarkup(<ModerationScreen search={{ view: "claims" }} />)
    expect(claims).toContain("file-des-revendications")
    expect(claims).not.toContain("moderation.invalidSelection")
    expect(claims).not.toContain("moderation.team")
    // Une équipe dans l'adresse ne s'applique pas aux revendications.
    expect(renderToStaticMarkup(<ModerationScreen search={{ view: "claims", team: "team" }} />)).toContain("moderation.invalidSelection")
  })

  it("le membre d'une équipe des publications n'a pas l'onglet, et l'adresse directe est refusée", () => {
    state.capacity = { networkWide: false, canReviewAppeals: false, canManagePolicy: false, teams: [{ teamId: "team", name: "Équipe", scope: "post" }] }
    state.claimReview = { canReview: false }
    const reports = renderToStaticMarkup(<ModerationScreen search={{ team: "team" }} />)
    expect(reports).toContain("moderation.reports")
    expect(reports).not.toContain("moderation.claims")
    const direct = renderToStaticMarkup(<ModerationScreen search={{ view: "claims" }} />)
    expect(direct).toContain("moderation.invalidSelection")
    expect(direct).not.toContain("file-des-revendications")
  })

  it("tant que la capacité des revendications n'est pas lue, l'écran attend", () => {
    state.capacity = moderator
    const waiting = renderToStaticMarkup(<ModerationScreen search={{ view: "claims" }} />)
    expect(waiting).toContain("common.loading")
    expect(waiting).not.toContain("moderation.claims")
    expect(waiting).not.toContain("file-des-revendications")
  })
})
