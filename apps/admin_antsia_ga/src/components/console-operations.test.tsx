// @vitest-environment jsdom
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

import { OperationsPanel, type OperationsPanelProps } from "./console-operations"

let root: Root
let container: HTMLDivElement
const networkA = "network-a" as Id<"networks">
const networkB = "network-b" as Id<"networks">
const page = (rows: unknown[], isDone = true, continueCursor = "next-window") => ({ page: rows, isDone, continueCursor })

async function render(props: OperationsPanelProps) {
  const i18n = createAppI18n({ locale: "fr", appResources: { fr: { ...appResources.fr, operations: frOperations }, en: { ...appResources.en, operations: enOperations } }, defaultNS: "admin" })
  await act(async () => root.render(<I18nextProvider i18n={i18n}><OperationsPanel {...props} /></I18nextProvider>))
}
function button(label: string) {
  const found = Array.from(container.querySelectorAll("button")).find((element) => element.textContent?.includes(label))
  if (!found) throw new Error(`Missing button ${label}`)
  return found
}
async function changeInput(name: string, value: string) {
  await act(async () => {
    const field = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`)
    if (!field) throw new Error(`Missing field ${name}`)
    const prototype = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
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
  state.data = {}
  state.queries.mockReset()
  state.mutation.mockReset()
  state.toast.mockReset()
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.useRealTimers() })

describe("raccords des opérations de console", () => {
  it("aucune lecture réseau ne démarre sans réseau choisi", async () => {
    for (const section of ["teams", "appeals", "federation", "pages", "health", "export"] as const) await render({ section, canAdmin: true })
    expect(state.queries).not.toHaveBeenCalled()
    expect(container.textContent).toContain("Choisissez un réseau")
  })
  it("la pagination utilise un vrai curseur et le réseau changé repart de zéro", async () => {
    state.data["modules/platform/console:paginateIncidents"] = (args: { networkId: string; paginationOpts: { cursor: string | null } }) => page([{ incidentId: "incident", title: args.networkId === networkA ? "Incident A" : "Incident B", severity: "info", status: "resolved", createdAt: 1000, updatedAt: 1000 }], false, "server-cursor")
    await render({ section: "incidents", networkId: networkA, canAdmin: false })
    await act(async () => button("Suivant").click())
    expect(state.queries.mock.calls.at(-1)?.[1]).toMatchObject({ networkId: networkA, paginationOpts: { cursor: "server-cursor", numItems: 20 } })
    await render({ section: "incidents", networkId: networkB, canAdmin: false })
    expect(state.queries.mock.calls.at(-1)?.[1]).toMatchObject({ networkId: networkB, paginationOpts: { cursor: null } })
    expect(container.textContent).toContain("Incident B")
    expect(container.textContent).not.toContain("Incident A")
  })
  it("un brouillon de création est signalé puis nettoyé lors du changement de réseau confirmé par le cadre", async () => {
    const dirty = vi.fn()
    state.data["modules/platform/console:listTeams"] = []
    await render({ section: "teams", networkId: networkA, canAdmin: false, onDirtyChange: dirty })
    await act(async () => {
      const field = container.querySelector<HTMLInputElement>('[name="name"]')
      if (!field) throw new Error("Missing team name")
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(field, "Équipe en préparation")
      field.dispatchEvent(new Event("input", { bubbles: true }))
      field.dispatchEvent(new Event("change", { bubbles: true }))
    })
    expect(dirty.mock.calls.at(-1)?.[0]).toBe(true)
    expect(container.textContent).toContain("saisies non enregistrées")
    await render({ section: "teams", networkId: networkB, canAdmin: false, onDirtyChange: dirty })
    expect(container.querySelector<HTMLInputElement>('[name="name"]')?.value).toBe("")
    expect(dirty.mock.calls.at(-1)?.[0]).toBe(false)
    const leave = new Event("beforeunload", { cancelable: true })
    window.dispatchEvent(leave)
    expect(leave.defaultPrevented).toBe(false)
  })
  it("la fenêtre vide poursuivable conserve une navigation honnête", async () => {
    state.data["modules/moderation/cases:paginatePlatformQueue"] = page([], false)
    await render({ section: "appeals", networkId: networkA, canAdmin: false })
    expect(container.textContent).toContain("La page suivante peut contenir")
    expect(button("Suivant").disabled).toBe(false)
    expect(state.queries.mock.calls.at(-1)?.[1]).toMatchObject({ networkId: networkA })
  })
  it("ne révèle ni clé ni enveloppe et ne monte aucune configuration pour un opérateur lecteur", async () => {
    state.data["modules/federation/emitters:paginate"] = page([{ _id: "emitter", slug: "sandbox-emitter", environment: "sandbox", enabled: true, revision: 1, updatedAt: 1000, allowedContracts: ["PAGE-V1"], keyEnvName: "ANTSIA_FEDERATION_PRIVATE_KEY", secretValue: "private-secret" }])
    state.data["modules/federation/replay:paginateReceipts"] = page([])
    state.data["modules/federation/replay:paginateDeadLetters"] = page([{ _id: "letter", contract: "PAGE-V1", reason: "unsupported_contract", environment: "sandbox", attempts: 1, lastAttemptAt: 1000, rawBody: "private-content", objectRef: "private-person" }])
    await render({ section: "federation", networkId: networkA, canAdmin: false })
    expect(container.textContent).not.toContain("PRIVATE_KEY")
    expect(container.textContent).not.toContain("private-")
    expect(container.querySelector('[name="keyEnvName"]')).toBeNull()
    expect(container.textContent).not.toContain("Demander un rejeu")
  })
  it("ne présente aucun comptage partiel comme une valeur finale", async () => {
    state.data["modules/platform/console:getMetrics"] = { status: "building", generatedAt: null, counts: { members: 777, openReports: 777, openAppeals: 777, pendingFiles: 777, deadLetters: 777 } }
    await render({ section: "health", networkId: networkA, canAdmin: false })
    expect(container.textContent).toContain("Calcul en cours")
    expect(container.textContent).not.toContain("777")
    expect(button("Actualiser").disabled).toBe(true)
  })
  it("les valeurs supprimées s'affichent comme masquées, sans faux zéro", async () => {
    state.data["modules/platform/console:aggregateExport"] = { threshold: 5, periods: [{ periodStart: 1000, periodEnd: 2000, cases: null, actioned: null, dismissed: null, suppressed: true }] }
    await render({ section: "export", networkId: networkA, canAdmin: false })
    const counters = Array.from(container.querySelectorAll("dd"))
    expect(counters).toHaveLength(3)
    expect(counters.every((element) => element.textContent === "Masqué")).toBe(true)
  })
  it("l'export dit les échéances légales comme /transparence : nombre, « moins de », masquées ou non mesurées", async () => {
    state.data["modules/platform/console:aggregateExport"] = { threshold: 5, periods: [
      { periodStart: 3000, periodEnd: 4000, cases: 20, actioned: 10, dismissed: 10, suppressed: false, legalStatus: "disclosed", legalMet: 7, legalMissed: null },
      { periodStart: 2000, periodEnd: 3000, cases: null, actioned: null, dismissed: null, suppressed: true, legalStatus: "suppressed", legalMet: null, legalMissed: null },
      { periodStart: 1000, periodEnd: 2000, cases: null, actioned: null, dismissed: null, suppressed: true, legalStatus: "unmeasured", legalMet: null, legalMissed: null },
    ] }
    await render({ section: "export", networkId: networkA, canAdmin: false })
    expect(container.textContent).toContain("ordonnance n° 0011/PR/2026")
    const cards = Array.from(container.querySelectorAll("li"))
    expect(cards).toHaveLength(3)
    expect(Array.from(cards[0]?.querySelectorAll("dt") ?? []).map((element) => element.textContent)).toEqual(["Dossiers", "Décisions appliquées", "Dossiers classés", "Dans le délai", "Hors délai"])
    expect(Array.from(cards[0]?.querySelectorAll("dd") ?? []).map((element) => element.textContent)).toEqual(["20", "10", "10", "7", "Moins de 5"])
    expect(cards[1]?.querySelectorAll("dd")).toHaveLength(3)
    expect(cards[1]?.textContent).toContain("Masquées : moins de 5 échéances ou auteurs distincts.")
    expect(cards[2]?.textContent).toContain("Non mesurées pour cette période.")
  })
  it("l'alerte des délais légaux compte les retards à l'heure de l'écran, sans dossier ni personne", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] })
    const now = Date.UTC(2026, 9, 22, 8, 0, 0)
    vi.setSystemTime(now)
    state.data["modules/platform/console:legalDeadlineAlert"] = { limit: 50, horizon: null, deadlines: [
      { dueAt: now - 2 * 3_600_000, basis: "art24" },
      { dueAt: now + 30_000, basis: "art33" },
      { dueAt: now + 30 * 3_600_000, basis: "art24" },
    ] }
    await render({ section: "health", networkId: networkA, canAdmin: false })
    expect(state.queries).toHaveBeenCalledWith("modules/platform/console:legalDeadlineAlert", { networkId: networkA })
    const section = () => {
      const found = Array.from(container.querySelectorAll("section")).find((element) => element.querySelector("h3")?.textContent === "Délais légaux des signalements")
      if (!found) throw new Error("Missing legal deadlines section")
      return found
    }
    const values = () => Array.from(section().querySelectorAll("dd")).map((element) => element.textContent)
    expect(section().querySelector('[role="alert"]')?.textContent).toContain("Délai légal dépassé : 1 dossier(s) encore ouvert(s) ou en examen.")
    expect(section().querySelector('[role="alert"] time')?.getAttribute("dateTime")).toBe(new Date(now - 2 * 3_600_000).toISOString())
    // En retard, dans les 24 h, en cours ; puis les retards par fondement (art. 24, 32, 33).
    expect(values()).toEqual(["1", "1", "3", "1", "0", "0"])
    expect(section().textContent).toContain("Art. 24 : décision sous 72 h")
    expect(section().textContent).toContain("Art. 33 : retrait sous 24 h")
    // Une minute plus tard, l'échéance de l'art. 33 est atteinte : l'écran bascule sans relire la base.
    await act(async () => { vi.advanceTimersByTime(60_000) })
    expect(section().querySelector('[role="alert"]')?.textContent).toContain("Délai légal dépassé : 2 dossier(s)")
    expect(values()).toEqual(["2", "0", "3", "1", "0", "1"])
    expect(section().textContent).not.toContain("Lecture bornée")
  })
  it("l'alerte dit « au moins » au-delà de sa borne, et se tait sans retard", async () => {
    const now = Date.now()
    state.data["modules/platform/console:legalDeadlineAlert"] = { limit: 50, horizon: now - 1_000, deadlines: Array.from({ length: 50 }, (_, n) => ({ dueAt: now - 100_000 + n, basis: "art24" })) }
    await render({ section: "health", networkId: networkA, canAdmin: false })
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Délai légal dépassé : au moins 50 dossier(s)")
    expect(container.textContent).toContain("Lecture bornée aux 50 échéances les plus proches de chaque statut")
    // Au-delà de la borne, aucun compte ne se dit zéro : ni « 0 », ni « au moins 0 », retards par fondement compris.
    const legal = Array.from(container.querySelectorAll("section")).find((element) => element.querySelector("h3")?.textContent === "Délais légaux des signalements")
    expect(Array.from(legal?.querySelectorAll("dd") ?? []).map((element) => element.textContent)).toEqual(["au moins 50", "Non déterminé", "au moins 50", "au moins 50", "Non déterminé", "Non déterminé"])
    state.data["modules/platform/console:legalDeadlineAlert"] = { limit: 50, horizon: null, deadlines: [{ dueAt: now + 48 * 3_600_000, basis: "art24" }] }
    await render({ section: "health", networkId: networkB, canAdmin: false })
    expect(container.querySelector('[role="alert"]')).toBeNull()
    expect(container.textContent).toContain("Aucun délai légal dépassé parmi les dossiers ouverts ou en examen.")
    expect(container.textContent).not.toContain("Retards par fondement")
  })
  it("une lecture des délais en échec ne retire que son bloc ; « Réessayer » la relance", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    let failing = true
    state.data["modules/platform/console:legalDeadlineAlert"] = () => {
      if (failing) throw new Error("Could not find public function for 'modules/platform/console:legalDeadlineAlert'")
      return { limit: 50, horizon: null, deadlines: [] }
    }
    state.data["modules/platform/console:getMetrics"] = { status: "ready", generatedAt: 1000, counts: { members: 12, openReports: 3, openAppeals: 0, pendingFiles: 0, deadLetters: 0 } }
    await render({ section: "health", networkId: networkA, canAdmin: false })
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Les délais légaux n’ont pas pu être lus. Les autres indicateurs de cette page restent valables.")
    // « Santé du réseau » reste lisible : ses compteurs s'affichent toujours.
    expect(Array.from(container.querySelectorAll("dd")).map((element) => element.textContent)).toContain("12")
    failing = false
    await act(async () => button("Réessayer").click())
    expect(container.querySelector('[role="alert"]')).toBeNull()
    expect(container.textContent).toContain("Aucun délai légal dépassé parmi les dossiers ouverts ou en examen.")
  })
  it("un acteur humain masqué n'est pas présenté comme le système", async () => {
    state.data["modules/platform/audit:paginateAudit"] = page([
      { auditId: "human", action: "console.access", capacity: "platform_operator", actor: null, subject: { table: "operators", id: "subject-human" }, at: 1000, details: null },
      { auditId: "system", action: "file.release", capacity: "system", actor: null, subject: { table: "fileScans", id: "subject-system" }, at: 1000, details: null },
    ])
    await render({ section: "audit", canAdmin: false })
    const entries = container.querySelectorAll("ol > li")
    expect(entries[0]?.textContent).toContain("Acteur non visible")
    expect(entries[0]?.textContent).not.toContain("Système")
    expect(entries[1]?.textContent).toContain("Système")
  })
  it("la pagination conserve un motif quand le changement est refusé", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false)
    state.data["modules/moderation/cases:paginatePlatformQueue"] = page([{ appealId: "appeal", reportId: "report", networkId: networkA, status: "open", reason: "Recours initial", createdAt: 1000 }], false)
    await render({ section: "appeals", networkId: networkA, canAdmin: false })
    await act(async () => button("Maintenir").click())
    await changeInput("reason", "Motif en préparation")
    await act(async () => button("Suivant").click())
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(container.querySelector<HTMLTextAreaElement>('[name="reason"]')?.value).toBe("Motif en préparation")
    expect(state.queries.mock.calls.at(-1)?.[1]).toMatchObject({ paginationOpts: { cursor: null } })
    confirm.mockReturnValue(true)
    await act(async () => button("Suivant").click())
    expect(state.queries.mock.calls.at(-1)?.[1]).toMatchObject({ paginationOpts: { cursor: "next-window" } })
  })
  it("le filtre des pages ne démonte pas un motif sans accord", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false)
    state.data["modules/pages/admin:paginatePages"] = page([{ pageId: "page", name: "Institution", handle: "institution", trust: "official", status: "active", createdAt: 1000 }])
    await render({ section: "pages", networkId: networkA, canAdmin: true })
    await act(async () => button("Retirer la page").click())
    await changeInput("reason", "Motif en préparation")
    await act(async () => {
      const filter = container.querySelector("select")
      if (!filter) throw new Error("Missing pages filter")
      filter.value = "inactive"
      filter.dispatchEvent(new Event("change", { bubbles: true }))
    })
    expect(container.querySelector("select")?.value).toBe("active")
    expect(container.querySelector<HTMLTextAreaElement>('[name="reason"]')?.value).toBe("Motif en préparation")
  })
  it("changer d'émetteur respecte le refus d'abandon du formulaire", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false)
    state.data["modules/federation/emitters:paginate"] = page([{ _id: "emitter", slug: "registered-emitter", environment: "sandbox", enabled: true, revision: 1, updatedAt: 1000, allowedContracts: [], keyEnvName: "ANTSIA_FEDERATION_REGISTERED_KEY" }])
    state.data["modules/federation/replay:paginateReceipts"] = page([])
    state.data["modules/federation/replay:paginateDeadLetters"] = page([])
    await render({ section: "federation", networkId: networkA, canAdmin: true })
    await changeInput("slug", "draft-emitter")
    await act(async () => button("Modifier la configuration").click())
    expect(container.querySelector<HTMLInputElement>('[name="slug"]')?.value).toBe("draft-emitter")
    confirm.mockReturnValue(true)
    await act(async () => button("Modifier la configuration").click())
    expect(container.querySelector<HTMLInputElement>('[name="slug"]')?.value).toBe("registered-emitter")
  })
  it("modifier le handle recherché n'efface pas un motif refusé", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false)
    state.data["modules/platform/console:listTeams"] = [{ teamId: "team", name: "Équipe", active: true, scope: null, members: [] }]
    state.data["modules/platform/console:findMember"] = { personId: "person", displayName: "Awa", handle: "awa.demo" }
    await render({ section: "teams", networkId: networkA, canAdmin: false })
    await changeInput("handle", "awa.demo")
    await submitForm('[name="handle"]')
    await act(async () => button("Ajouter à l’équipe").click())
    // Le formulaire de décision du membre précède celui de création de l'équipe.
    await changeInput("reason", "Motif en préparation")
    await changeInput("handle", "autre.demo")
    expect(container.querySelector<HTMLInputElement>('[name="handle"]')?.value).toBe("awa.demo")
    expect(container.querySelector<HTMLTextAreaElement>('[name="reason"]')?.value).toBe("Motif en préparation")
  })
  it("les décisions opposées et la pagination restent bloquées pendant un recours pending", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true)
    let resolve: (value: null) => void = () => undefined
    const pending = vi.fn()
    state.mutation.mockImplementation(() => new Promise((done) => { resolve = done }))
    state.data["modules/moderation/cases:paginatePlatformQueue"] = page([{ appealId: "appeal", reportId: "report", networkId: networkA, status: "open", reason: "Recours initial", createdAt: 1000 }], false)
    await render({ section: "appeals", networkId: networkA, canAdmin: false, onPendingChange: pending })
    await act(async () => button("Maintenir").click())
    await changeInput("reason", "Motif documenté du recours")
    await submitForm('form[aria-label="Maintenir la décision"]')
    expect(button("Annuler la décision").disabled).toBe(true)
    expect(pending.mock.calls.at(-1)?.[0]).toBe(true)
    await act(async () => button("Suivant").click())
    expect(confirm).not.toHaveBeenCalled()
    expect(state.mutation).toHaveBeenCalledTimes(1)
    expect(state.queries.mock.calls.at(-1)?.[1]).toMatchObject({ paginationOpts: { cursor: null } })
    await act(async () => resolve(null))
    expect(pending.mock.calls.at(-1)?.[0]).toBe(false)
  })
  it("un rejeu tardif n'affiche aucun toast dans le réseau suivant", async () => {
    let resolve: (value: { outcome: "still_failing"; eventId: string }) => void = () => undefined
    state.mutation.mockImplementation(() => new Promise((done) => { resolve = done }))
    state.data["modules/federation/emitters:paginate"] = page([])
    state.data["modules/federation/replay:paginateReceipts"] = page([])
    state.data["modules/federation/replay:paginateDeadLetters"] = page([{ _id: "letter", contract: "PAGE-V1", reason: "unsupported_contract", environment: "sandbox", attempts: 1, lastAttemptAt: 1000 }])
    await render({ section: "federation", networkId: networkA, canAdmin: true })
    await act(async () => button("Demander un rejeu").click())
    await changeInput("reason", "Motif documenté de ce rejeu")
    await submitForm('form[aria-label="Demander un rejeu"]')
    await render({ section: "health", networkId: networkB, canAdmin: true })
    state.toast.mockClear()
    await act(async () => resolve({ outcome: "still_failing", eventId: "event" }))
    expect(state.toast).not.toHaveBeenCalled()
  })
})

describe("finitions DP-37 — portes des vitrines, du catalogue et de la préparation", () => {
  const storefrontItem = { shopId: "shop", networkId: networkA, networkSlug: "antsia", storefront: "pending_review", model: "products", name: "Atelier de recette", description: "Présentation déclarée", specialty: null, serviceArea: null, hours: null, logoUrl: null, pageHandle: null, requestedAt: 1000, preparer: { displayName: "Awa", handle: "awa.demo", membership: "declaree" } }
  const hasButton = (label: string) => Array.from(container.querySelectorAll("button")).some((element) => element.textContent?.includes(label))

  it("vitrines fermées par défaut : l'admission motivée se propose, jamais l'admission d'office ; la file refuse mais n'admet pas", async () => {
    state.data["modules/shops/operator:storefrontPolicy"] = { policy: "closed", updatedAt: null }
    state.data["modules/shops/operator:storefrontQueue"] = page([storefrontItem])
    await render({ section: "pages", networkId: networkA, canAdmin: true })
    expect(container.textContent).toContain("Publication des vitrines fermée")
    expect(button("Ouvrir l’admission motivée").disabled).toBe(false)
    expect(hasButton("d’office")).toBe(false)
    expect(container.textContent).toContain("Préparée par Awa (@awa.demo)")
    expect(container.textContent).toContain("Adhésion déclarée")
    expect(button("Admettre la vitrine").disabled).toBe(true)
    expect(button("Refuser la vitrine").disabled).toBe(false)
  })

  it("un refus motivé transmet la décision de la file ; un opérateur lecteur ne règle ni la politique ni les portes d'administration", async () => {
    state.data["modules/shops/operator:storefrontPolicy"] = { policy: "review", updatedAt: 1000 }
    state.data["modules/shops/operator:storefrontQueue"] = page([storefrontItem])
    await render({ section: "pages", networkId: networkA, canAdmin: false })
    expect(hasButton("Fermer la publication des vitrines")).toBe(false)
    expect(state.queries.mock.calls.some(([name]) => name === "modules/shops/catalogControl:getPolicy" || name === "modules/shops/checkoutPolicy:getPolicy")).toBe(false)
    expect(button("Admettre la vitrine").disabled).toBe(false)
    await act(async () => button("Refuser la vitrine").click())
    await changeInput("reason", "Présentation incomplète")
    await submitForm('form[aria-label="Refuser la vitrine"]')
    expect(state.mutation).toHaveBeenCalledWith({ shopId: "shop", decision: "reject", reason: "Présentation incomplète" })
  })

  it("catalogue et préparation : fermés par défaut, ouverture motivée transmise au réseau choisi", async () => {
    state.data["modules/shops/operator:storefrontPolicy"] = { policy: "review", updatedAt: 1000 }
    state.data["modules/shops/operator:storefrontQueue"] = page([])
    state.data["modules/shops/catalogControl:getPolicy"] = { networkId: networkA, enabled: false, configured: false, updatedAt: null }
    state.data["modules/shops/checkoutPolicy:getPolicy"] = { networkId: networkA, enabled: false, configured: false, updatedAt: null }
    await render({ section: "pages", networkId: networkA, canAdmin: true })
    expect(container.textContent).toContain("Catalogues fermés")
    expect(container.textContent).toContain("Préparation des commandes fermée")
    await act(async () => button("Ouvrir les catalogues").click())
    await changeInput("reason", "Ouverture décidée pour le pilote")
    await submitForm('form[aria-label="Ouvrir les catalogues"]')
    expect(state.mutation).toHaveBeenCalledWith({ networkId: networkA, enabled: true, reason: "Ouverture décidée pour le pilote" })
  })
})
