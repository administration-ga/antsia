// @vitest-environment jsdom
import { api, type Id } from "@antsia/api/engine"
import { createAppI18n } from "@antsia/social-features/i18n"
import { COMMERCE_PUBLIC_CONTRACT, COMMERCE_PUBLIC_CONTRACT_V2 } from "@antsia/social-domain/commerce/primitives"
import { getFunctionName, type FunctionReturnType } from "convex/server"
import { ConvexError } from "convex/values"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { appResources } from "@/i18n/resources"

const state = vi.hoisted(() => ({ data: {} as Record<string, unknown>, queries: vi.fn(), mutation: vi.fn(), dirty: vi.fn(), pending: vi.fn(), toast: vi.fn() }))
vi.mock("convex/react", () => ({
  useQuery: (reference: Parameters<typeof getFunctionName>[0], args: unknown) => {
    const name = getFunctionName(reference)
    state.queries(name, args)
    if (args === "skip") return undefined
    const value = state.data[name]
    return typeof value === "function" ? value(args) : value
  },
  useMutation: (reference: Parameters<typeof getFunctionName>[0]) => (args: unknown) => state.mutation(getFunctionName(reference), args),
}))
vi.mock("sonner", () => ({ toast: { success: state.toast, error: state.toast, info: state.toast } }))

import { CatalogPolicy } from "./console-catalog-policy"
import { OperationDraftProvider } from "./console-operation-controls"

type CatalogShop = FunctionReturnType<typeof api.modules.shops.catalogControl.paginateMappings>["page"][number]
type Emitter = FunctionReturnType<typeof api.modules.federation.emitters.paginate>["page"][number]
const NETWORK = "network-a" as Id<"networks">
const OTHER_NETWORK = "network-b" as Id<"networks">
const MAPPINGS = "modules/shops/catalogControl:paginateMappings"
const EMITTERS = "modules/federation/emitters:paginate"
const CONFIGURE = "modules/shops/catalogControl:configureMapping"
const RULINGS = "modules/shops/catalogControl:paginateCategoryRulings"
type Ruling = FunctionReturnType<typeof api.modules.shops.catalogControl.paginateCategoryRulings>["page"][number]
const i18n = createAppI18n({ locale: "fr", appResources, defaultNS: "operations" })
const page = <T,>(rows: T[], isDone = true, continueCursor = "next-window") => ({ page: rows, isDone, continueCursor })
function shop(overrides: Partial<CatalogShop> = {}): CatalogShop {
  return { shopId: "opaque-shop-001" as Id<"shops">, name: "Épicerie du quartier", handle: "epicerie-du-quartier", link: { environment: "sandbox", publishCatalog: true }, mapping: null, ...overrides }
}
function emitter(overrides: Partial<Emitter> = {}): Emitter {
  return { _id: "opaque-emitter-001" as Id<"federationEmitters">, _creationTime: 1, networkId: NETWORK, slug: "pro-ga-local", environment: "sandbox", enabled: true, keyEnvName: "ANTSIA_FEDERATION_HIDDEN_KEY", allowedContracts: [COMMERCE_PUBLIC_CONTRACT_V2], revision: 1, createdAt: 1, updatedAt: 1, ...overrides }
}
let root: Root, container: HTMLDivElement
async function render(networkId = NETWORK) {
  await act(async () => root.render(<I18nextProvider i18n={i18n}><OperationDraftProvider onDirtyChange={state.dirty} onPendingChange={state.pending}><CatalogPolicy key={networkId} networkId={networkId} /></OperationDraftProvider></I18nextProvider>))
}
function button(label: string, within: ParentNode = container) {
  const found = [...within.querySelectorAll<HTMLButtonElement>("button")].find(element => element.textContent === label)
  if (!found) throw new Error(`Missing button ${label}`)
  return found
}
function section(label: string) {
  const found = [...container.querySelectorAll<HTMLElement>("[aria-label]")].find(element => element.getAttribute("aria-label") === label)
  if (!found) throw new Error(`Missing section ${label}`)
  return found
}
async function click(label: string, within: ParentNode = container) { await act(async () => button(label, within).click()) }
async function chooseShop(name = "Épicerie du quartier") { await click(i18n.t("catalogMapping.chooseShop", { name })) }
async function chooseEmitter(id = "opaque-emitter-001") {
  await act(async () => {
    const input = container.querySelector("select")!
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(input, id)
    input.dispatchEvent(new Event("change", { bubbles: true }))
  })
}
async function reason(value: string) {
  await act(async () => {
    const input = container.querySelector("textarea")!
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, value)
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
}
const enableLabel = (slug = "pro-ga-local") => i18n.t("catalogMapping.enable", { name: "Épicerie du quartier", emitter: slug })

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  state.data = { "modules/shops/catalogControl:getPolicy": { networkId: NETWORK, enabled: true, configured: true, updatedAt: null }, [MAPPINGS]: page([shop()]), [EMITTERS]: page([emitter()]) }
  state.queries.mockReset(); state.mutation.mockReset(); state.mutation.mockResolvedValue(null)
  state.dirty.mockReset(); state.pending.mockReset(); state.toast.mockReset()
  container = document.createElement("div"); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks() })

describe("rattachement des catalogues depuis la vraie politique console", () => {
  it("monte les boutiques nommées sans saisie d'identifiant ni prétendre avoir reçu un catalogue", async () => {
    await render()
    expect(container.textContent).toContain("Épicerie du quartier")
    expect(container.textContent).toContain("@epicerie-du-quartier")
    expect(container.textContent).not.toContain("opaque-shop-001")
    expect(container.querySelector("input")).toBeNull()
    await chooseShop()
    expect(container.textContent).toContain(i18n.t("catalogMapping.categoriesHint"))
    expect(container.textContent).not.toContain("HIDDEN_KEY")
    expect(container.textContent).not.toContain("opaque-emitter-001")
    expect(state.queries).toHaveBeenCalledWith(MAPPINGS, expect.objectContaining({ networkId: NETWORK, paginationOpts: expect.objectContaining({ cursor: null, numItems: 20 }) }))
    expect(state.queries).toHaveBeenCalledWith(EMITTERS, expect.objectContaining({ networkId: NETWORK, paginationOpts: expect.objectContaining({ cursor: null, numItems: 25 }) }))
    expect(state.mutation).not.toHaveBeenCalled()
  })

  it("exige le choix humain et un motif de dix caractères avant de confirmer le rattachement", async () => {
    await render(); await chooseShop()
    expect(button(i18n.t("catalogMapping.enableUnselected")).disabled).toBe(true)
    expect(container.querySelector<HTMLSelectElement>("select")?.value).toBe("")
    await chooseEmitter(); await click(enableLabel())
    expect(state.mutation).not.toHaveBeenCalled()
    await reason("court"); await click(i18n.t("common.confirm"))
    expect(state.mutation).not.toHaveBeenCalled()
    expect(container.querySelector('[aria-invalid="true"]')).not.toBeNull()
    await reason("  Rattachement vérifié avec le gestionnaire.  "); await click(i18n.t("common.confirm"))
    expect(state.mutation).toHaveBeenCalledExactlyOnceWith(CONFIGURE, { networkId: NETWORK, shopId: shop().shopId, emitterId: emitter()._id, enabled: true, reason: "Rattachement vérifié avec le gestionnaire." })
    expect(container.querySelector("textarea")).toBeNull()
    expect(state.dirty.mock.calls.at(-1)?.[0]).toBe(false)
  })

  it("conserve la motivation après un refus serveur sans exposer ses détails privés", async () => {
    state.mutation.mockRejectedValue(new ConvexError({ code: "policyRefused", privateDetail: "fixture-private-detail" }))
    await render(); await chooseShop(); await chooseEmitter(); await click(enableLabel())
    await reason("Rattachement soumis à la garde serveur."); await click(i18n.t("common.confirm"))
    expect(container.querySelector('[role="alert"]')).not.toBeNull()
    expect(container.textContent).not.toContain("fixture-private-detail")
    expect(container.querySelector("textarea")?.value).toBe("Rattachement soumis à la garde serveur.")
    expect(container.querySelector<HTMLSelectElement>("select")?.value).toBe(emitter()._id)
    expect(state.pending.mock.calls.at(-1)?.[0]).toBe(false)
  })

  it("écarte les émetteurs inactifs, étrangers ou sans contrat et conserve PUBLIC V1", async () => {
    state.data[EMITTERS] = page([
      emitter({ _id: "disabled" as Id<"federationEmitters">, slug: "pro-disabled", enabled: false }),
      emitter({ _id: "production" as Id<"federationEmitters">, slug: "pro-production", environment: "production" }),
      emitter({ _id: "unrelated" as Id<"federationEmitters">, slug: "pro-unrelated", allowedContracts: ["RESEAU-PUBLIC-V1"] }),
      emitter({ allowedContracts: [COMMERCE_PUBLIC_CONTRACT] }),
    ])
    await render(); await chooseShop()
    const options = [...container.querySelectorAll<HTMLOptionElement>("option")]
    expect(options.filter(option => option.disabled).map(option => option.value)).toEqual(["disabled", "production", "unrelated"])
    expect(options.find(option => option.value === emitter()._id)?.textContent).toContain(i18n.t("catalogMapping.v1"))
    await chooseEmitter(); await click(enableLabel()); await reason("Catalogue V1 autorisé pour cette boutique."); await click(i18n.t("common.confirm"))
    expect(state.mutation).toHaveBeenCalledWith(CONFIGURE, expect.objectContaining({ emitterId: emitter()._id, enabled: true }))
  })

  it.each([null, { environment: "sandbox" as const, publishCatalog: false }])("ferme l'activation sans liaison vivante autorisée : %j", async link => {
    state.data[MAPPINGS] = page([shop({ link })])
    await render(); await chooseShop()
    expect(container.querySelector<HTMLSelectElement>("select")?.disabled).toBe(true)
    expect(button(i18n.t("catalogMapping.enableUnselected")).disabled).toBe(true)
    expect(container.textContent).toContain(i18n.t("catalogMapping.linkRequired"))
    expect(state.mutation).not.toHaveBeenCalled()
  })

  it("permet le retrait du mapping courant même après perte du lien et sans émetteur disponible", async () => {
    const current = { emitterId: "previous-emitter" as Id<"federationEmitters">, emitterSlug: "pro-ga-precedent", enabled: true, generation: 7 }
    state.data[MAPPINGS] = page([shop({ link: null, mapping: current })]); state.data[EMITTERS] = page([])
    await render(); await chooseShop()
    expect(container.textContent).toContain("pro-ga-precedent")
    expect(container.textContent).toContain(i18n.t("catalogMapping.currentEmitter", { emitter: current.emitterSlug, generation: 7 }))
    await click(i18n.t("catalogMapping.disable", { name: shop().name })); await reason("Retrait demandé par le gestionnaire."); await click(i18n.t("common.confirm"))
    expect(state.mutation).toHaveBeenCalledExactlyOnceWith(CONFIGURE, { networkId: NETWORK, shopId: shop().shopId, emitterId: current.emitterId, enabled: false, reason: "Retrait demandé par le gestionnaire." })
  })

  it("préserve la génération d'un rattachement déjà actif avec le même émetteur", async () => {
    state.data[MAPPINGS] = page([shop({ mapping: { emitterId: emitter()._id, emitterSlug: emitter().slug, enabled: true, generation: 3 } })])
    await render(); await chooseShop(); await chooseEmitter()
    expect(button(enableLabel()).disabled).toBe(true)
    expect(container.textContent).toContain(i18n.t("catalogMapping.unchanged"))
    expect(state.mutation).not.toHaveBeenCalled()
  })

  it("pagine les boutiques et les émetteurs séparément, y compris une fenêtre vide poursuivable", async () => {
    state.data[MAPPINGS] = (args: { paginationOpts: { cursor: string | null } }) => args.paginationOpts.cursor ? page([shop()]) : page([], false, "shops-next")
    state.data[EMITTERS] = (args: { paginationOpts: { cursor: string | null } }) => args.paginationOpts.cursor ? page([emitter()]) : page([], false, "emitters-next")
    await render()
    expect(container.textContent).toContain(i18n.t("common.emptyWindow"))
    await click(i18n.t("common.next"), section(i18n.t("catalogMapping.shops")))
    expect(state.queries).toHaveBeenCalledWith(MAPPINGS, expect.objectContaining({ paginationOpts: expect.objectContaining({ cursor: "shops-next" }) }))
    await chooseShop()
    expect(container.textContent).toContain(i18n.t("catalogMapping.noCompatibleOnPage"))
    await click(i18n.t("common.next"), section(i18n.t("catalogMapping.emitters")))
    expect(state.queries).toHaveBeenCalledWith(EMITTERS, expect.objectContaining({ paginationOpts: expect.objectContaining({ cursor: "emitters-next" }) }))
    await chooseEmitter()
    expect(button(enableLabel()).disabled).toBe(false)
    await render(OTHER_NETWORK)
    expect(state.queries).toHaveBeenCalledWith(MAPPINGS, expect.objectContaining({ networkId: OTHER_NETWORK, paginationOpts: expect.objectContaining({ cursor: null }) }))
    expect(container.querySelector("select")).toBeNull()
  })

  it("préserve le motif et le choix lorsque le changement de page ou de boutique est refusé", async () => {
    state.data[MAPPINGS] = page([shop(), shop({ shopId: "other-shop" as Id<"shops">, name: "Restaurant voisin" })], false, "shops-next")
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false)
    await render(); await chooseShop(); await chooseEmitter(); await click(enableLabel()); await reason("Motif en cours de rédaction.")
    await chooseShop("Restaurant voisin")
    await click(i18n.t("common.next"), section(i18n.t("catalogMapping.shops")))
    expect(confirm).toHaveBeenCalledTimes(2)
    expect(container.querySelector("textarea")?.value).toBe("Motif en cours de rédaction.")
    expect(container.querySelector<HTMLSelectElement>("select")?.value).toBe(emitter()._id)
    expect(state.queries.mock.calls.filter(([name, args]) => name === MAPPINGS && args.paginationOpts.cursor === "shops-next")).toHaveLength(0)
    confirm.mockReturnValue(true)
    await chooseShop("Restaurant voisin")
    expect(container.querySelector("textarea")).toBeNull()
    expect(container.querySelector<HTMLSelectElement>("select")?.value).toBe("")
  })

  it("verrouille les choix, les pages et les doubles confirmations pendant la mutation", async () => {
    state.data[MAPPINGS] = page([shop(), shop({ shopId: "other-shop" as Id<"shops">, name: "Restaurant voisin" })], false, "shops-next")
    let resolve: (value: null) => void = () => undefined
    state.mutation.mockImplementation(() => new Promise<null>(done => { resolve = done }))
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true)
    await render(); await chooseShop(); await chooseEmitter(); await click(enableLabel()); await reason("Décision documentée avec le vendeur."); await click(i18n.t("common.confirm"))
    expect(container.querySelector<HTMLSelectElement>("select")?.matches(":disabled")).toBe(true)
    expect(button(i18n.t("catalogMapping.chooseShop", { name: "Restaurant voisin" })).matches(":disabled")).toBe(true)
    expect(button(i18n.t("common.next"), section(i18n.t("catalogMapping.shops"))).matches(":disabled")).toBe(true)
    await click(i18n.t("common.saving"))
    expect(state.mutation).toHaveBeenCalledTimes(1)
    expect(state.pending.mock.calls.at(-1)?.[0]).toBe(true)
    expect(confirm).not.toHaveBeenCalled()
    await act(async () => resolve(null))
    expect(state.pending.mock.calls.at(-1)?.[0]).toBe(false)
  })
})

describe("CM-02 — vue console des catégories encadrées", () => {
  function ruling(overrides: Partial<Ruling> = {}): Ruling {
    return { rulingId: "opaque-ruling-001" as Ruling["rulingId"], shopId: "opaque-shop-001" as Id<"shops">, shopName: "Épicerie du quartier", shopHandle: "epicerie-du-quartier", offerRef: "pro.ga:offer:01JA00000000000000000000P2", rule: "prohibited", categoryKey: "electronics.phones", listVersion: 2, revision: 3, withdrewReflection: true, firstAt: 1_000, updatedAt: 2_000, ...overrides }
  }

  it("dit qu'aucune ligne n'existe tant que la liste est vide, sans rien inventer", async () => {
    state.data[RULINGS] = page([])
    await render()
    const view = section(i18n.t("categoryRulings.title"))
    expect(view.textContent).toContain(i18n.t("categoryRulings.lead"))
    expect(view.textContent).toContain(i18n.t("common.empty"))
    expect(state.queries).toHaveBeenCalledWith(RULINGS, expect.objectContaining({ networkId: NETWORK, paginationOpts: expect.objectContaining({ cursor: null, numItems: 20 }) }))
  })

  it("montre refus et relectures par boutique, catégorie, référence et version, sans identifiant interne ni contenu d'offre", async () => {
    state.data[RULINGS] = page([ruling(), ruling({ rulingId: "opaque-ruling-002" as Ruling["rulingId"], rule: "regulated", categoryKey: "beauty", withdrewReflection: false, shopName: null, shopHandle: null })])
    await render()
    const view = section(i18n.t("categoryRulings.title"))
    const rows = [...view.querySelectorAll("li")]
    expect(rows.map(row => row.getAttribute("data-category-ruling"))).toEqual(["prohibited", "regulated"])
    expect(rows[0]!.textContent).toContain("Épicerie du quartier")
    expect(rows[0]!.textContent).toContain("@epicerie-du-quartier")
    expect(rows[0]!.textContent).toContain(i18n.t("categoryRulings.rule.prohibited"))
    expect(rows[0]!.textContent).toContain("electronics.phones")
    expect(rows[0]!.textContent).toContain(i18n.t("categoryRulings.reference", { reference: "pro.ga:offer:01JA00000000000000000000P2", revision: 3, version: 2 }))
    expect(rows[0]!.textContent).toContain(i18n.t("categoryRulings.withdrew"))
    expect(rows[1]!.textContent).toContain(i18n.t("catalogMapping.unnamedShop"))
    expect(rows[1]!.textContent).toContain(i18n.t("categoryRulings.rule.regulated"))
    expect(rows[1]!.textContent).not.toContain(i18n.t("categoryRulings.withdrew"))
    expect(view.textContent).not.toContain("opaque-ruling")
    expect(view.textContent).not.toContain("opaque-shop")
    expect(state.mutation).not.toHaveBeenCalled()
  })

  it("traduit le motif de lettre morte d'une offre interdite", () => {
    expect(i18n.t("federation.failure.prohibited_category")).not.toBe("federation.failure.prohibited_category")
  })
})
