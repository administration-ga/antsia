// @vitest-environment jsdom
import { createAppI18n } from "@antsia/social-features/i18n"
import type { ServiceOptionsResult } from "@convex/modules/shops/serviceRules"
import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { catalogOfferFixture } from "@/components/shops/__tests__/catalog-fixtures"
import type { CatalogOffer } from "@/components/shops/catalog-model"
import { appResources } from "@/i18n/resources"
import { serviceIntentKey, type ServiceIntentScope } from "@/lib/service-intent"

const mocks = vi.hoisted(() => ({ person: "person-a", offer: null as CatalogOffer | null | undefined, catalogError: false, catalogPending: false, lookup: { outcome: "absent" } as unknown, refetch: vi.fn(), options: vi.fn(), order: vi.fn(), push: vi.fn(), stop: vi.fn() }))
vi.mock("@antsia/api/engine", () => ({ api: { modules: { shops: { catalog: { offer: "catalog" }, services: { findByClientRequestId: "lookup", stopClientIntent: "stop" }, serviceActions: { options: "options", orderService: "order" } } } } }))
vi.mock("@antsia/api/network", () => ({ useNetwork: () => ({ networkId: "network-a", personId: mocks.person }) }))
vi.mock("@antsia/api/hooks", () => ({ useAuthenticatedConvexQuery: (reference: string, args: unknown) => reference === "catalog" ? { data: mocks.offer, isPending: mocks.catalogPending, isError: mocks.catalogError, isFetching: false, refetch: mocks.refetch } : { data: args === "skip" ? undefined : mocks.lookup, isPending: false, isError: false, isFetching: false, refetch: vi.fn() } }))
vi.mock("convex/react", () => ({ useConvexAuth: () => ({ isAuthenticated: true }), useAction: (reference: string) => reference === "options" ? mocks.options : mocks.order, useMutation: () => mocks.stop }))
vi.mock("next/navigation", () => ({ useRouter: () => router }))
vi.mock("@antsia/api/sign-out-everywhere", () => ({ isSigningOutEverywhere: () => false }))
vi.mock("@/components/member-chrome", () => ({ MemberPage: ({ children }: { children: ReactNode }) => <main>{children}</main> }))
import { ServiceInitialIntentBoundary } from "./service-intent-guard"
import { publishedPackageQualification, ServiceOrderForm } from "./service-order-screen"

type FixedOrder = NonNullable<Extract<ServiceOptionsResult, { outcome: "ready" }>["fixedOrder"]>
const router = { push: mocks.push }
const now = Date.UTC(2026, 9, 21, 12)
const scope: ServiceIntentScope = { networkId: "network-a", personId: "person-a", mode: "fixed_order", handle: "atelier", offerRef: "pro.ga:offer:package" }
const fixed: FixedOrder = { unitAmount: { amount: 15_000, currency: "XAF" }, unit: null, catalogRevision: 3, quantityMax: 10, leadTimeDays: 2 }
const profile: NonNullable<CatalogOffer["serviceProfile"]> = { version: 1, commercialModes: ["fixed_order"], languageCodes: ["fr"], zones: [{ countryCode: "GA", locality: "Libreville" }], deliverables: ["Dix photos retouchées"], inclusions: ["Une révision"], exclusions: ["Déplacement"], portfolio: [] }
function published(changes: Partial<CatalogOffer> = {}): CatalogOffer { return catalogOfferFixture({ kind: "service", offerRef: scope.offerRef, revision: fixed.catalogRevision, variants: [], price: { mode: "fixed", currency: "XAF", amount: fixed.unitAmount.amount }, leadTimeDays: fixed.leadTimeDays, serviceProfile: profile, ...changes }) }
function ready(fixedOrder: FixedOrder = fixed): ServiceOptionsResult { return { outcome: "ready", offerRef: scope.offerRef, fixedOrder, quote: { available: false }, booking: null, timeZone: "Africa/Libreville" } }
const i18n = createAppI18n({ locale: "fr", appResources, defaultNS: "services" })
let root: Root, container: HTMLDivElement, online: boolean
const button = (key: string) => [...container.querySelectorAll("button")].find(node => node.textContent === i18n.t(key))
const consent = () => container.querySelector<HTMLInputElement>('input[name="consent"]')!
const fields = () => container.querySelector<HTMLFieldSetElement>("fieldset")!
async function click(node: Element | undefined | null) { if (!node) throw new Error("Élément de recette absent"); await act(async () => (node as HTMLElement).click()) }
async function input(name: string, value: string) {
  const node = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`)!
  await act(async () => { const prototype = node instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(node, value); node.dispatchEvent(new Event("input", { bubbles: true })); node.dispatchEvent(new Event("change", { bubbles: true })) })
}
async function render(value: FixedOrder = fixed, existingRequestRowId?: string) {
  const form = <ServiceOrderForm key={mocks.person} handle={scope.handle} offerRef={scope.offerRef} fixedOrder={value} existingRequestRowId={existingRequestRowId} />
  await act(async () => root.render(<I18nextProvider i18n={i18n}>{existingRequestRowId ? form : <ServiceInitialIntentBoundary key={mocks.person} mode="fixed_order" handle={scope.handle} offerRef={scope.offerRef}>{form}</ServiceInitialIntentBoundary>}</I18nextProvider>))
}
async function submit() { await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))) }
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(now)
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  online = true; vi.spyOn(navigator, "onLine", "get").mockImplementation(() => online)
  sessionStorage.clear(); mocks.person = "person-a"; mocks.offer = published(); mocks.catalogError = false; mocks.catalogPending = false; mocks.lookup = { outcome: "absent" }
  mocks.options.mockReset().mockResolvedValue(ready()); mocks.refetch.mockReset().mockImplementation(async () => ({ data: mocks.offer, isError: false })); mocks.order.mockReset().mockRejectedValue(new Error("lost")); mocks.stop.mockReset(); mocks.push.mockReset()
  container = document.createElement("div"); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove(); sessionStorage.clear(); vi.restoreAllMocks(); vi.useRealTimers() })

describe("MP06c — conditions du forfait liées à la publication", () => {
  it("affiche les conditions et la version qualifiées avant l'accord, puis envoie le marqueur public", async () => {
    await render()
    expect(fields().disabled).toBe(false)
    expect(container.textContent).toContain("Version publique 3")
    expect(container.textContent).toContain("Dix photos retouchées")
    expect(container.textContent).toContain("Une révision")
    expect(container.textContent).toContain("Déplacement")
    expect(container.textContent).toContain("2 jours")
    await submit(); expect(mocks.order).not.toHaveBeenCalled()
    await click(consent()); await submit()
    expect(mocks.order).toHaveBeenCalledWith(expect.objectContaining({ networkId: "network-a", handle: scope.handle, offerRef: scope.offerRef, expectedCatalogRevision: 3, expectedUnitAmount: fixed.unitAmount, publishedPackage: true }))
    expect(sessionStorage.getItem(serviceIntentKey(scope))).not.toBeNull()
  })
  it.each([
    { revision: 4 }, { shopHandle: "other" }, { offerRef: "pro.ga:offer:other" }, { kind: "product" as const }, { serviceProfile: undefined },
    { serviceProfile: { ...profile, commercialModes: ["quote" as const] } }, { serviceProfile: { ...profile, deliverables: [] } },
    { price: { mode: "quote" as const, currency: "XAF" as const } }, { price: { mode: "fixed" as const, currency: "XAF" as const, amount: 16_000 } }, { leadTimeDays: 3 }, { variants: catalogOfferFixture().variants },
  ])("ferme la confirmation d'une publication absente, différente ou non qualifiée : %j", async changes => {
    mocks.offer = published(changes)
    await render()
    expect(fields().disabled).toBe(true)
    expect(mocks.order).not.toHaveBeenCalled()
    expect(container.querySelector("[data-service-profile]")).toBeNull()
  })
  it("qualifie uniquement le tarif unitaire et l'unité réellement publiés", () => {
    const unit = { ...fixed, unit: "séance" }
    const offer = published({ price: { mode: "unit", currency: "XAF", amount: fixed.unitAmount.amount, unit: "séance" } })
    expect(publishedPackageQualification(offer, unit, scope.handle, scope.offerRef)).toBeNull()
    expect(publishedPackageQualification(offer, fixed, scope.handle, scope.offerRef)).toBe("mismatch")
  })
  it("la relecture garde la saisie mais retire l'accord même si les conditions sont identiques", async () => {
    await render(); await input("note", "Prévoir un fond clair"); await input("desiredDate", "2026-10-25"); await input("quantity", "2"); await click(consent())
    await click(button("order.rereadConditions"))
    expect(mocks.options).toHaveBeenCalledOnce(); expect(mocks.refetch).toHaveBeenCalledOnce()
    expect(consent().checked).toBe(false)
    expect(container.querySelector<HTMLTextAreaElement>('[name="note"]')?.value).toBe("Prévoir un fond clair")
    expect(container.querySelector<HTMLInputElement>('[name="quantity"]')?.value).toBe("2")
    expect(container.querySelector<HTMLInputElement>('[name="desiredDate"]')?.value).toBe("2026-10-25")
    await submit(); expect(mocks.order).not.toHaveBeenCalled()
  })
  it("une révision publique différente bloque avant relecture, puis exige l'accord sur le nouvel instantané", async () => {
    await render(); await input("note", "Garder cette saisie"); await click(consent())
    mocks.offer = published({ revision: 4, price: { mode: "fixed", currency: "XAF", amount: 16_000 }, serviceProfile: { ...profile, inclusions: ["Deux révisions"] } })
    await render(); expect(fields().disabled).toBe(true); expect(consent().checked).toBe(false)
    mocks.options.mockResolvedValue(ready({ ...fixed, catalogRevision: 4, unitAmount: { amount: 16_000, currency: "XAF" } }))
    await click(button("order.rereadConditions"))
    expect(fields().disabled).toBe(false)
    expect(container.textContent).toContain("Version publique 4")
    expect(container.textContent).toContain("Deux révisions")
    expect(container.querySelector<HTMLTextAreaElement>('[name="note"]')?.value).toBe("Garder cette saisie")
    await submit(); expect(mocks.order).not.toHaveBeenCalled()
    await click(consent()); await submit()
    expect(mocks.order).toHaveBeenCalledWith(expect.objectContaining({ expectedCatalogRevision: 4, expectedUnitAmount: { amount: 16_000, currency: "XAF" }, publishedPackage: true }))
  })
  it("une panne de relecture ferme l'ancien accord et conserve les champs jusqu'à une lecture réussie", async () => {
    await render(); await input("note", "Conserver"); await click(consent())
    mocks.options.mockRejectedValueOnce(new Error("unavailable"))
    await click(button("order.rereadConditions"))
    expect(fields().disabled).toBe(true); expect(consent().checked).toBe(false)
    expect(container.querySelector<HTMLTextAreaElement>('[name="note"]')?.value).toBe("Conserver")
    await submit(); expect(mocks.order).not.toHaveBeenCalled()
  })
  it("un retrait confirmé par la relecture bloque même si un ancien cache de l'offre subsiste", async () => {
    await render(); await click(consent())
    mocks.refetch.mockResolvedValue({ data: null, isError: false })
    await click(button("order.rereadConditions"))
    expect(fields().disabled).toBe(true)
    expect(container.querySelector("[data-service-profile]")).toBeNull()
    await submit(); expect(mocks.order).not.toHaveBeenCalled()
  })
  it("la réponse perdue ne permet ni relecture d'une nouvelle intention ni commande en double", async () => {
    await render(); await click(consent()); await submit()
    expect(fields().disabled).toBe(true)
    expect(button("order.rereadConditions")?.disabled).toBe(true)
    await submit(); expect(mocks.order).toHaveBeenCalledOnce()
  })
  it("la reconfirmation garde la demande d'origine et exige les mêmes conditions publiques", async () => {
    await render(fixed, "request-existing"); await click(consent()); await submit()
    expect(mocks.order).toHaveBeenCalledWith(expect.objectContaining({ existingRequestRowId: "request-existing", publishedPackage: true, expectedCatalogRevision: 3 }))
  })
  it("hors ligne puis revenu en ligne, aucun engagement ne part avant relecture et nouvel accord", async () => {
    await render(); await click(consent())
    await act(async () => { online = false; window.dispatchEvent(new Event("offline")) }); await submit()
    expect(mocks.order).not.toHaveBeenCalled()
    await act(async () => { online = true; window.dispatchEvent(new Event("online")) })
    expect(fields().disabled).toBe(true); expect(consent().checked).toBe(false)
    await click(button("order.rereadConditions"))
    expect(fields().disabled).toBe(false)
    expect(mocks.order).not.toHaveBeenCalled()
  })
})
