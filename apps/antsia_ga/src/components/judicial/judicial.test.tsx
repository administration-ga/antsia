// @vitest-environment jsdom
/**
 * SU01h — ce qu'antsia.ga montre d'une mesure sur ordre du juge : le correctif et l'étiquette d'origine
 * au-dessus du contenu ou du profil, et, dans « Mes données », les mesures qui visent la personne et les
 * mesures générales en vigueur — sans la référence de l'ordonnance ni l'identité d'un opérateur.
 */
import type { Id } from "@antsia/api/engine"
import { createAppI18n } from "@antsia/social-features/i18n"
import { getFunctionName } from "convex/server"
import { act, type ReactElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { appResources } from "@/i18n/resources"

const state = vi.hoisted(() => ({ data: {} as Record<string, unknown>, notices: undefined as unknown, args: vi.fn() }))
vi.mock("convex/react", () => ({ useQuery: (reference: Parameters<typeof getFunctionName>[0]) => state.data[getFunctionName(reference)] }))
vi.mock("@antsia/api/hooks", () => ({ useAuthenticatedConvexQuery: (_reference: unknown, args: unknown) => { state.args(args); return { data: state.notices, isError: false, isPending: false } } }))
vi.mock("@antsia/api/network", () => ({ useNetwork: () => ({ networkId: "network-root" }) }))
vi.mock("@antsia/api/viewer-preferences", () => ({ useViewerTimeZone: () => "Africa/Libreville" }))

import { HandleJudicialNotices, PostJudicialNotice } from "./judicial-notices"
import { MyJudicialMeasures } from "./my-judicial-measures"

const MINE = "modules/moderation/measures:myJudicialMeasures"
const START = Date.UTC(2026, 10, 11, 8, 0, 0)
const i18n = createAppI18n({ locale: "fr", appResources, defaultNS: "antsia" })
let root: Root
let container: HTMLDivElement

function personal(extra: Record<string, unknown> = {}) {
  return { measureId: "measure-1", kind: "suspend_account", targetKind: "person", status: "active", startsAt: START, endsAt: START + 48 * 3_600_000, liftedAt: null, liftCause: null, feature: null, correctionText: null, originLabel: null, networkName: null, ...extra }
}
async function render(node: ReactElement) { await act(async () => root.render(<I18nextProvider i18n={i18n}>{node}</I18nextProvider>)) }

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  state.data = {}; state.notices = undefined; state.args.mockReset()
  container = document.createElement("div"); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove() })

describe("SU01h — avis au-dessus du contenu et du profil", () => {
  it("affiche le correctif puis l'étiquette d'origine, et rien sans avis", async () => {
    state.notices = [{ postId: "post-1", kind: "pin_correction", text: "Correctif ordonné : l'information est inexacte.", startsAt: START }, { postId: "post-1", kind: "origin_label", text: "Compte relayant un tiers", startsAt: START }, { postId: "post-2", kind: "origin_label", text: "Autre publication", startsAt: START }]
    await render(<PostJudicialNotice networkId={"network-root" as Id<"networks">} postId={"post-1" as Id<"posts">} />)
    // Une seule requête, mêmes arguments pour toutes les cartes du fil ; chaque carte garde ses avis.
    expect(state.args).toHaveBeenCalledWith({ networkId: "network-root" })
    expect(container.textContent).not.toContain("Autre publication")
    const region = container.querySelector("aside[aria-label='Avis ordonnés par la justice']")
    expect(region?.textContent).toContain("Correctif publié sur décision de justice")
    expect(region?.textContent).toContain("Correctif ordonné : l'information est inexacte.")
    expect(region?.textContent).toContain("Origine signalée sur décision de justice : Compte relayant un tiers")
    state.notices = []
    await render(<HandleJudicialNotices kind="person" handle="awa-fictive" />)
    expect(state.args).toHaveBeenLastCalledWith({ networkId: "network-root", target: { kind: "person", handle: "awa-fictive" } })
    expect(container.querySelector("aside")).toBeNull()
  })
})

describe("SU01h — « Mes données »", () => {
  it("rien sans mesure ; la mesure qui vise la personne et la mesure générale, sans référence d'ordonnance", async () => {
    state.data[MINE] = { personal: [], general: [] }
    await render(<MyJudicialMeasures />)
    expect(container.textContent).toBe("")
    state.data[MINE] = {
      personal: [personal(), personal({ measureId: "measure-2", kind: "pin_correction", targetKind: "post", status: "lifted", endsAt: null, liftedAt: START + 3_600_000, liftCause: "operator", correctionText: "Correctif ordonné : l'information est inexacte." })],
      general: [personal({ measureId: "measure-3", kind: "restrict_feature", targetKind: "network", feature: "live", networkName: "ANTSIA" })],
    }
    await render(<MyJudicialMeasures />)
    const text = container.textContent ?? ""
    expect(text).toContain("Mesures sur décision de justice")
    expect(text).toContain("Compte suspendu")
    expect(text).toContain("Votre compte")
    expect(text).toContain("En vigueur")
    expect(text).toContain("Correctif affiché")
    expect(text).toContain("Une de vos publications")
    expect(text).toContain("Terminée")
    expect(text).toContain("Texte affiché : Correctif ordonné : l'information est inexacte.")
    expect(text).toContain("Mesures générales en vigueur")
    expect(text).toContain("Le réseau ANTSIA · lancer un direct")
    expect(text).not.toContain("RG")
  })
})
