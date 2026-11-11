// @vitest-environment jsdom
/**
 * SU01h — l'écran « Mesures sur ordre du juge » de la console : la cible se vérifie avant
 * l'exécution, l'article 44 exige une échéance de 72 h au plus, l'exécutant ne voit pas de bouton
 * de confirmation sur sa propre mesure, un second opérateur confirme par un motif, et une mesure non
 * confirmée hors délai s'affiche en alerte sans être levée. Références et comptes fictifs.
 */
import type { Id } from "@antsia/api/engine"
import { ARTICLE_44_MAX_MS, JUDICIAL_CONFIRMATION_DELAY_MS } from "@antsia/social-domain/judicialMeasures"
import { createAppI18n } from "@antsia/social-features/i18n"
import { getFunctionName } from "convex/server"
import { act, type ReactNode } from "react"
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
    return state.data[name]
  },
  useMutation: (reference: Parameters<typeof getFunctionName>[0]) => (args: unknown) => state.mutation(getFunctionName(reference), args),
}))
vi.mock("sonner", () => ({ toast: { success: state.toast, error: state.toast, warning: state.toast, info: state.toast } }))

import { fromLocalInput, MeasuresPanel, openMeasureSchema, OpenMeasureForm, toLocalInput } from "./console-measures"
import { OperationDraftProvider } from "./console-operation-controls"

const LIST = "modules/moderation/measures:paginateMeasures"
const CLOCK = "modules/moderation/measures:activeMeasureClock"
const PREVIEW = "modules/moderation/measures:previewTarget"
const NOW = Date.UTC(2026, 10, 11, 9, 0, 0)
const ROOT = "network-root" as Id<"networks">
const PERSON = "person-awa" as Id<"persons">
const MOTIVE = "Ordonnance relue, cible vérifiée."

function measure(extra: Record<string, unknown> = {}) {
  return {
    measureId: "measure-1" as Id<"judicialMeasures">, networkId: ROOT, networkName: "ANTSIA", kind: "suspend_account", target: { kind: "person", id: PERSON }, targetLabel: "@awa-fictive", hasSubject: true,
    orderReference: "RG FICTIF 2026/0042", feature: null, correctionText: null, originLabel: null, status: "active", startsAt: NOW - 3_600_000, endsAt: null, executedAt: NOW,
    confirmationDueAt: NOW + JUDICIAL_CONFIRMATION_DELAY_MS, lapseReminderAt: NOW + 28 * 86_400_000, createdBy: { personId: "op-1", displayName: "Opératrice Une" }, createdByMe: false,
    confirmedAt: null, confirmedBy: null, meritsActionNotedAt: null, liftedAt: null, liftCause: null, liftedBy: null, effects: { membershipSuspended: true, pageDeactivated: false, contentRemoved: false },
    ...extra,
  }
}

let root: Root
let container: HTMLDivElement

async function render(node: ReactNode) {
  const i18n = createAppI18n({ locale: "fr", appResources: { fr: { ...appResources.fr, operations: frOperations }, en: { ...appResources.en, operations: enOperations } }, defaultNS: "admin" })
  await act(async () => root.render(<I18nextProvider i18n={i18n}><OperationDraftProvider>{node}</OperationDraftProvider></I18nextProvider>))
}
function button(label: string) {
  const found = Array.from(container.querySelectorAll("button")).find((element) => element.textContent?.includes(label))
  if (!found) throw new Error(`Missing button ${label}`)
  return found
}
function hasButton(label: string) { return Array.from(container.querySelectorAll("button")).some((element) => element.textContent?.includes(label)) }
async function click(element: HTMLElement) { await act(async () => { element.click() }) }
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
async function submitForm(form: HTMLFormElement) { await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })) }) }
const fieldByLabel = (label: string) => {
  const element = Array.from(container.querySelectorAll("label")).find((item) => item.textContent?.startsWith(label))
  if (!element) throw new Error(`Missing label ${label}`)
  return `[id="${element.htmlFor}"]`
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(NOW)
  state.data = {}
  state.queries.mockReset(); state.mutation.mockReset(); state.toast.mockReset()
  state.mutation.mockResolvedValue({ measureId: "measure-2", created: true })
  container = document.createElement("div"); document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); vi.restoreAllMocks() })

describe("SU01h — règles du formulaire d'exécution", () => {
  const messages = { required: "requis", reference: "référence", startsAt: "effet", endsAt: "échéance", endsAtArt44: "art44", feature: "fonction", correction: "correctif", origin: "origine", reason: "motif" }
  const base = { kind: "suspend_account" as const, targetKind: "person", ref: "@awa-fictive", orderReference: "RG FICTIF 2026/0042", startsAt: toLocalInput(NOW - 3_600_000), endsAt: "", feature: "", correctionText: "", originLabel: "", reason: MOTIVE }
  const issues = (values: Record<string, unknown>) => {
    const parsed = openMeasureSchema(messages, () => NOW).safeParse(values)
    return parsed.success ? [] : parsed.error.issues.map((issue) => issue.message)
  }
  it("une mesure bien formée passe ; l'article 44 exige une échéance de 72 h au plus", () => {
    expect(issues(base)).toEqual([])
    const network = { ...base, kind: "restrict_feature", targetKind: "network", ref: "", feature: "live" }
    expect(issues(network)).toEqual(["art44"])
    expect(issues({ ...network, endsAt: toLocalInput(NOW - 3_600_000 + ARTICLE_44_MAX_MS) })).toEqual([])
    expect(issues({ ...network, endsAt: toLocalInput(NOW - 3_600_000 + ARTICLE_44_MAX_MS + 120_000) })).toEqual(["art44"])
    expect(issues({ ...base, kind: "pin_correction", targetKind: "post", ref: "post-1" })).toEqual(["correctif"])
    expect(issues({ ...base, kind: "delist", targetKind: "network" })).toEqual(["requis"])
    expect(fromLocalInput("2026-11-11T10:00")).toBe(new Date("2026-11-11T10:00").getTime())
    expect(fromLocalInput("hier")).toBeNull()
  })
})

describe("SU01h — exécuter une mesure", () => {
  it("le bouton d'exécution reste fermé jusqu'à la vérification de la cible, puis exécute avec la cible vérifiée", async () => {
    state.data[PREVIEW] = { target: { kind: "person", id: PERSON }, networkId: ROOT, networkName: "ANTSIA", label: "@awa-fictive", createdAt: NOW - 86_400_000, moderationStatus: null, activeMeasures: 0 }
    const done = vi.fn()
    await render(<OpenMeasureForm networkId={ROOT} onDone={done} />)
    await changeField(fieldByLabel("Cible"), "@awa-fictive")
    expect(button("Exécuter maintenant").disabled).toBe(true)
    await click(button("Vérifier la cible"))
    expect(state.queries).toHaveBeenCalledWith(PREVIEW, { kind: "person", ref: "@awa-fictive" })
    expect(container.textContent).toContain("Cible vérifiée")
    expect(button("Exécuter maintenant").disabled).toBe(false)
    await changeField(fieldByLabel("Référence de l’ordonnance"), "RG FICTIF 2026/0042")
    await changeField(fieldByLabel("Motif de la décision"), MOTIVE)
    await submitForm(container.querySelector("form") as HTMLFormElement)
    expect(state.mutation).toHaveBeenCalledWith("modules/moderation/measures:openMeasure", expect.objectContaining({ kind: "suspend_account", target: { kind: "person", id: PERSON }, orderReference: "RG FICTIF 2026/0042", reason: MOTIVE }))
    expect(done).toHaveBeenCalled()
  })

  it("une mesure de l'article 44 vise le réseau choisi, et refuse de partir sans échéance", async () => {
    state.data[PREVIEW] = { target: { kind: "network", id: ROOT }, networkId: ROOT, networkName: "ANTSIA", label: "ANTSIA", createdAt: NOW - 86_400_000, moderationStatus: null, activeMeasures: 0 }
    await render(<OpenMeasureForm networkId={ROOT} onDone={() => {}} />)
    await changeField(fieldByLabel("Genre de mesure"), "suspend_access")
    expect(state.queries).toHaveBeenCalledWith(PREVIEW, { kind: "network", ref: ROOT })
    await changeField(fieldByLabel("Référence de l’ordonnance"), "RG FICTIF 2026/0043")
    await changeField(fieldByLabel("Motif de la décision"), MOTIVE)
    await submitForm(container.querySelector("form") as HTMLFormElement)
    expect(state.mutation).not.toHaveBeenCalled()
    expect(container.textContent).toContain("Une mesure de l’article 44 exige une échéance, 72 h au plus après la date d’effet.")
  })
})

describe("SU01h — confirmer par un second opérateur", () => {
  it("l'exécutant ne confirme pas sa mesure ; un autre opérateur confirme par un motif", async () => {
    state.data[CLOCK] = { measures: [], truncated: false }
    state.data[LIST] = { page: [measure({ createdByMe: true }), measure({ measureId: "measure-2", createdByMe: false })], isDone: true, continueCursor: "" }
    await render(<MeasuresPanel networkId={ROOT} />)
    expect(container.textContent).toContain("Un autre opérateur confirme les mesures que vous exécutez.")
    const confirms = Array.from(container.querySelectorAll("button")).filter((element) => element.textContent === "Confirmer la mesure")
    expect(confirms).toHaveLength(1)
    await click(confirms[0] as HTMLButtonElement)
    await changeField("form[aria-label='Confirmer la mesure'] textarea", MOTIVE)
    await submitForm(container.querySelector("form[aria-label='Confirmer la mesure']") as HTMLFormElement)
    expect(state.mutation).toHaveBeenCalledWith("modules/moderation/measures:confirmMeasure", { measureId: "measure-2", reason: MOTIVE })
  })

  it("une mesure non confirmée hors délai s'affiche en alerte et reste en vigueur", async () => {
    vi.setSystemTime(NOW + JUDICIAL_CONFIRMATION_DELAY_MS + 60_000)
    state.data[CLOCK] = { measures: [{ measureId: "measure-1", status: "active", startsAt: NOW - 3_600_000, executedAt: NOW }], truncated: false }
    state.data[LIST] = { page: [measure()], isDone: true, continueCursor: "" }
    await render(<MeasuresPanel networkId={ROOT} />)
    expect(container.querySelector("[role='alert']")?.textContent).toContain("1 mesure sur ordre attend sa confirmation depuis plus de 24 h.")
    expect(container.textContent).toContain("Délai de confirmation dépassé : la mesure reste en vigueur")
    expect(hasButton("Lever la mesure")).toBe(true)
  })
})
