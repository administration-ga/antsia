// @vitest-environment jsdom
/** EX-08 : le bloc « Responsables du réseau » de la section « Équipes », monté par le panneau des opérations. */
import type { Id } from "@antsia/api/engine"
import { createAppI18n } from "@antsia/social-features/i18n"
import { getFunctionName } from "convex/server"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { appResources } from "@/i18n/resources"
import enOperations from "@/i18n/locales/en/operations.json"
import frOperations from "@/i18n/locales/fr/operations.json"

const state = vi.hoisted(() => ({ data: {} as Record<string, unknown>, queries: vi.fn(), mutation: vi.fn(), toast: vi.fn() }))
vi.mock("convex/react", () => ({
  useQuery: (reference: Parameters<typeof getFunctionName>[0], args: unknown) => {
    const name = getFunctionName(reference)
    state.queries(name, args)
    if (args === "skip") return undefined
    const value = state.data[name]
    return typeof value === "function" ? value(args) : value
  },
  useMutation: () => state.mutation,
}))
vi.mock("sonner", () => ({ toast: { success: state.toast, error: state.toast, warning: state.toast, info: state.toast } }))

import { OperationsPanel } from "./console-operations"

const ROLES = "modules/platform/networkRoles:paginateNetworkRoles"
const FIND = "modules/platform/console:findMember"
const networkId = "network-a" as Id<"networks">
let root: Root
let container: HTMLDivElement

type Holder = { personId: string; handle: string | null; displayName: string | null; active: boolean }
function holders(byRole: { network_admin?: Holder[]; network_moderator?: Holder[] }, managedBy: "diaspora" | null = null) {
  return (args: { role: "network_admin" | "network_moderator" }) => ({ page: byRole[args.role] ?? [], isDone: true, continueCursor: "end", managedBy })
}

async function render(canAdmin: boolean) {
  const i18n = createAppI18n({ locale: "fr", appResources: { fr: { ...appResources.fr, operations: frOperations }, en: { ...appResources.en, operations: enOperations } }, defaultNS: "admin" })
  await act(async () => root.render(<I18nextProvider i18n={i18n}><OperationsPanel section="teams" networkId={networkId} canAdmin={canAdmin} /></I18nextProvider>))
}
function buttons(label: string) {
  return Array.from(container.querySelectorAll("button")).filter((element) => element.textContent?.includes(label))
}
function button(label: string) {
  const found = buttons(label)[0]
  if (!found) throw new Error(`Missing button ${label}`)
  return found
}
async function changeField(selector: string, value: string) {
  await act(async () => {
    const field = container.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(selector)
    if (!field) throw new Error(`Missing field ${selector}`)
    const prototype = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : field instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(field, value)
    field.dispatchEvent(new Event("input", { bubbles: true }))
    field.dispatchEvent(new Event("change", { bubbles: true }))
  })
}
async function submitForm(selector: string) {
  await act(async () => {
    const field = container.querySelector(selector)
    const form = field instanceof HTMLFormElement ? field : field?.closest("form")
    if (!form) throw new Error(`Missing form ${selector}`)
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
  })
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  state.data = { "modules/platform/console:listTeams": [] }
  state.queries.mockReset()
  state.mutation.mockReset()
  state.toast.mockReset()
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks() })

describe("EX-08 — responsables du réseau dans la console", () => {
  it("la section Équipes liste administrateurs et modérateurs, par fenêtres, sans nom pour un profil non visible", async () => {
    state.data[ROLES] = holders({
      network_admin: [{ personId: "person-awa", handle: "awa", displayName: "Awa MBA", active: true }],
      network_moderator: [{ personId: "person-hidden", handle: null, displayName: null, active: false }],
    })
    await render(false)
    expect(container.textContent).toContain("Responsables du réseau")
    expect(container.textContent).toContain("Équipes de modération")
    expect(state.queries).toHaveBeenCalledWith(ROLES, { networkId, role: "network_admin", paginationOpts: { cursor: null, numItems: 20 } })
    expect(state.queries).toHaveBeenCalledWith(ROLES, { networkId, role: "network_moderator", paginationOpts: { cursor: null, numItems: 20 } })
    expect(container.textContent).toContain("Administrateurs du réseau")
    expect(container.textContent).toContain("Awa MBA")
    expect(container.textContent).toContain("@awa")
    expect(container.textContent).toContain("Membre non visible")
    expect(container.textContent).toContain("Sans effet : adhésion suspendue, quittée ou en attente")
    expect(container.textContent).not.toContain("gouverné par sa propre application")
  })

  it("un opérateur lecteur voit la liste, sans geste de nomination ni de retrait", async () => {
    state.data[ROLES] = holders({ network_admin: [{ personId: "person-awa", handle: "awa", displayName: "Awa MBA", active: true }] })
    await render(false)
    expect(buttons("Retirer le rôle")).toHaveLength(0)
    expect(container.textContent).not.toContain("Nommer un responsable")
    expect(container.textContent).toContain("exige le rôle d’administrateur de la plateforme")
    expect(state.queries.mock.calls.some(([name]) => name === FIND)).toBe(false)
  })

  it("un administrateur de la plateforme nomme un membre trouvé par son identifiant, motif d'au moins dix caractères", async () => {
    state.data[ROLES] = holders({}, "diaspora")
    state.data[FIND] = { personId: "person-bob", handle: "bob", displayName: "Bob NZE" }
    state.mutation.mockResolvedValue({ role: "network_admin", changed: true })
    await render(true)
    expect(container.textContent).toContain("gouverné par sa propre application")
    await changeField('[name="handle"]', "@bob")
    await changeField('[name="role"]', "network_admin")
    await act(async () => button("Rechercher le membre").click())
    expect(state.queries).toHaveBeenCalledWith(FIND, { networkId, handle: "bob" })
    expect(container.textContent).toContain("Bob NZE")
    await act(async () => button("Confier le rôle : Administrateur du réseau").click())
    // Neuf caractères : sous la borne de dix, refusé avant tout envoi.
    await changeField('[name="reason"]', "Trop bref")
    await submitForm('form[aria-label="Confier le rôle : Administrateur du réseau"]')
    expect(state.mutation).not.toHaveBeenCalled()
    await changeField('[name="reason"]', "Premier administrateur du réseau, désigné par le propriétaire.")
    await submitForm('form[aria-label="Confier le rôle : Administrateur du réseau"]')
    expect(state.mutation).toHaveBeenCalledWith({ networkId, personId: "person-bob", role: "network_admin", reason: "Premier administrateur du réseau, désigné par le propriétaire." })
    expect(state.toast).toHaveBeenCalledWith("Rôle confié et inscrit au journal.")
  })

  it("un rôle déjà posé est dit sans changement", async () => {
    state.data[ROLES] = holders({})
    state.data[FIND] = { personId: "person-bob", handle: "bob", displayName: "Bob NZE" }
    state.mutation.mockResolvedValue({ role: "network_moderator", changed: false })
    await render(true)
    await changeField('[name="handle"]', "bob")
    await act(async () => button("Rechercher le membre").click())
    await act(async () => button("Confier le rôle : Modérateur du réseau").click())
    await changeField('[name="reason"]', "Renfort de la modération du réseau.")
    await submitForm('form[aria-label="Confier le rôle : Modérateur du réseau"]')
    expect(state.mutation).toHaveBeenCalledWith({ networkId, personId: "person-bob", role: "network_moderator", reason: "Renfort de la modération du réseau." })
    expect(state.toast).toHaveBeenCalledWith("Cette personne a déjà ce rôle : rien n’a changé.")
  })

  it("le retrait d'un responsable est motivé et transmis au moteur avec le rôle de membre", async () => {
    state.data[ROLES] = holders({ network_moderator: [{ personId: "person-awa", handle: "awa", displayName: "Awa MBA", active: true }] })
    state.mutation.mockResolvedValue({ role: "member", changed: true })
    await render(true)
    await act(async () => button("Retirer le rôle").click())
    await changeField('[name="reason"]', "Fin de mission de modération.")
    await submitForm('form[aria-label="Retirer le rôle"]')
    expect(state.mutation).toHaveBeenCalledWith({ networkId, personId: "person-awa", role: "member", reason: "Fin de mission de modération." })
    expect(state.toast).toHaveBeenCalledWith("Rôle retiré et inscrit au journal.")
  })

  it("le refus du dernier administrateur s'affiche par sa règle traduite", async () => {
    state.data[ROLES] = holders({ network_admin: [{ personId: "person-awa", handle: "awa", displayName: "Awa MBA", active: true }] })
    state.mutation.mockRejectedValue(Object.assign(new Error("refus"), { data: { code: "invalidArgument", rule: "NETWORK_LAST_ADMIN", params: {} } }))
    await render(true)
    await act(async () => button("Retirer le rôle").click())
    await changeField('[name="reason"]', "Retrait demandé par le réseau.")
    await submitForm('form[aria-label="Retirer le rôle"]')
    expect(container.textContent).toContain("Un réseau garde toujours au moins un administrateur actif")
  })
})
