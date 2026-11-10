// @vitest-environment jsdom
/** P16 : registre réel fermé, aucun mock d'activation. Tests écrits seulement. */
import type { Id } from "@antsia/api/engine"
import { createAppI18n } from "@antsia/social-features/i18n"
import { getFunctionName } from "convex/server"
import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { appResources } from "@/i18n/resources"
const state = vi.hoisted(() => ({ data: undefined as unknown, mutation: vi.fn() }))
vi.mock("convex/react", () => ({
  useQuery: (_ref: Parameters<typeof getFunctionName>[0]) => state.data,
  useMutation: () => state.mutation,
}))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))
import { PaymentPolicy } from "./console-payment-policy"
import { ServicePolicy } from "./console-service-policy"
import { JobPolicy } from "./console-job-policy"
const i18n = createAppI18n({ locale: "fr", appResources, defaultNS: "operations" })
const networkId = "network-a" as Id<"networks">
let root: Root, container: HTMLDivElement
async function render(children: ReactNode) { await act(async () => root.render(<I18nextProvider i18n={i18n}>{children}</I18nextProvider>)) }
function button(key: string) { return [...container.querySelectorAll<HTMLButtonElement>("button")].find(entry => entry.textContent === i18n.t(key))! }
async function confirm(key: string) {
  await act(async () => button(key).click())
  const input = container.querySelector("textarea")!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, "Décision motivée pour cette politique.")
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
  await act(async () => button("common.confirm").click())
}
beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  state.data = { enabled: false, configured: true, updatedAt: null }; state.mutation.mockReset(); state.mutation.mockResolvedValue(null)
  container = document.createElement("div"); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove() })
describe("console : décisions manquantes", () => {
  it.each(["payment", "service"] as const)("ferme l'ouverture %s et explique la validation manquante", async (kind) => {
    const component = kind === "payment" ? <PaymentPolicy networkId={networkId} /> : <ServicePolicy networkId={networkId} />
    const prefix = kind === "payment" ? "paymentPolicy" : "servicePolicy"
    await render(component)
    expect(button(`${prefix}.enable`).disabled).toBe(true)
    expect(container.textContent).toContain(i18n.t(`${prefix}.validationMissing`))
    expect(container.textContent).toContain(i18n.t(`${prefix}.validationBlocked`))
    await act(async () => button(`${prefix}.enable`).click())
    expect(state.mutation).not.toHaveBeenCalled()
  })
  it.each(["payment", "service"] as const)("un ancien flag %s reste fermable par une décision motivée", async (kind) => {
    state.data = { enabled: true, configured: true, updatedAt: null }
    const prefix = kind === "payment" ? "paymentPolicy" : "servicePolicy"
    await render(kind === "payment" ? <PaymentPolicy networkId={networkId} /> : <ServicePolicy networkId={networkId} />)
    expect(button(`${prefix}.disable`).disabled).toBe(false)
    await confirm(`${prefix}.disable`)
    expect(state.mutation).toHaveBeenCalledWith({ networkId, enabled: false, reason: "Décision motivée pour cette politique." })
  })
  it("peut ouvrir la découverte des emplois tout en laissant les candidatures fermées", async () => {
    state.data = { jobs: false, applications: false, configured: true, updatedAt: null }
    await render(<JobPolicy networkId={networkId} />)
    expect(button("jobPolicy.enableJobs").disabled).toBe(false)
    await confirm("jobPolicy.enableJobs")
    expect(state.mutation).toHaveBeenCalledWith({ networkId, jobsEnabled: true, applicationsEnabled: false, reason: "Décision motivée pour cette politique." })
    state.data = { jobs: true, applications: false, configured: true, updatedAt: null }
    await render(<JobPolicy networkId={networkId} />)
    expect(button("jobPolicy.enableApplications").disabled).toBe(true)
    expect(container.textContent).toContain(i18n.t("jobPolicy.validationMissing"))
  })
  it("n'offre aucune décision avant lecture de la politique", async () => {
    state.data = undefined; await render(<PaymentPolicy networkId={networkId} />)
    expect(container.querySelector("button")).toBeNull()
    expect(state.mutation).not.toHaveBeenCalled()
  })
})
