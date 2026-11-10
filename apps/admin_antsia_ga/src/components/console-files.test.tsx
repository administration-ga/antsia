// @vitest-environment jsdom
/**
 * Console « Fichiers » (EX-17) : la section se monte sans réseau, lit les
 * compteurs et la file des fichiers en échec, change de file, et relance un
 * fichier retenu avec un motif — jamais un fichier produit par la plateforme,
 * ni un fichier plus lourd que le plafond d'analyse.
 */
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

const STATS = "modules/files/queries:stats"
const LIST = "modules/files/queries:listForConsole"
const MIO = 1024 * 1024

let root: Root
let container: HTMLDivElement

const stats = (overrides: Partial<Record<string, { count: number; sampled: boolean }>> = {}) => ({
  sampleCap: 1000,
  byStatus: ["pending", "running", "clean", "suspicious", "infected", "error", "skipped"].map((status) => ({ status, count: 0, sampled: false, ...overrides[status] })),
})
const row = (overrides: Record<string, unknown> = {}) => ({ _id: "scan-1", status: "error", source: "post_media", filename: "programme.pdf", sizeBytes: 2 * MIO, findings: [], verdictReason: "AV_ERROR:provider_unconfigured", attempts: 3, createdAt: 1_000, updatedAt: 2_000, ...overrides })
const page = (rows: unknown[], isDone = true, continueCursor = "next-window") => ({ page: rows, isDone, continueCursor })

async function render() {
  const i18n = createAppI18n({ locale: "fr", appResources: { fr: { ...appResources.fr, operations: frOperations }, en: { ...appResources.en, operations: enOperations } }, defaultNS: "admin" })
  await act(async () => root.render(<I18nextProvider i18n={i18n}><OperationsPanel section="files" canAdmin={false} /></I18nextProvider>))
}
function button(label: string) {
  const found = Array.from(container.querySelectorAll("button")).find((element) => element.textContent?.includes(label))
  if (!found) throw new Error(`Missing button ${label}`)
  return found
}
function maybeButton(label: string) {
  return Array.from(container.querySelectorAll("button")).find((element) => element.textContent?.includes(label)) ?? null
}
async function typeReason(value: string) {
  await act(async () => {
    const field = container.querySelector<HTMLTextAreaElement>('[name="reason"]')
    if (!field) throw new Error("Missing reason")
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(field, value)
    field.dispatchEvent(new Event("input", { bubbles: true }))
    field.dispatchEvent(new Event("change", { bubbles: true }))
  })
}
async function submitReason() {
  await act(async () => {
    const form = container.querySelector('[name="reason"]')?.closest("form")
    if (!form) throw new Error("Missing reason form")
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
  })
}
function lastListArgs() {
  return state.queries.mock.calls.filter(([name]) => name === LIST).at(-1)?.[1]
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
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks() })

describe("console Fichiers (EX-17)", () => {
  it("s'ouvre sans réseau choisi, sur la file des fichiers en échec, avec les compteurs", async () => {
    state.data[STATS] = stats({ error: { count: 3, sampled: false }, clean: { count: 1000, sampled: true } })
    state.data[LIST] = page([row()])
    await render()
    expect(container.textContent).not.toContain("Choisissez un réseau")
    expect(state.queries).toHaveBeenCalledWith(STATS, {})
    expect(lastListArgs()).toMatchObject({ status: "error", paginationOpts: { cursor: null, numItems: 20 } })
    expect(container.textContent).toContain("Fichiers sous garde")
    expect(container.textContent).toContain("60 Mio")
    // Au-delà de l'échantillon, le chiffre est dit plancher, jamais présenté comme exact.
    expect(container.textContent).toContain("au moins")
    expect(button("Analyse en échec").getAttribute("aria-pressed")).toBe("true")
    expect(container.textContent).toContain("programme.pdf")
    expect(container.textContent).toContain("AV_ERROR:provider_unconfigured")
  })

  it("dit le chargement, puis l'absence de fichier", async () => {
    await render()
    expect(container.textContent).toContain("Chargement des données autorisées")
    state.data[STATS] = stats()
    state.data[LIST] = page([])
    await render()
    expect(container.textContent).toContain("Aucun élément dans cette liste.")
  })

  it("une lecture en panne s'annonce et se relance, sans rien décider", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    state.data[STATS] = stats()
    state.data[LIST] = () => { throw new Error("panne du moteur") }
    await render()
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Les fichiers n’ont pas pu être chargés")
    state.data[LIST] = page([row()])
    await act(async () => button("Réessayer").click())
    expect(container.textContent).toContain("programme.pdf")
    expect(state.mutation).not.toHaveBeenCalled()
  })

  it("change de file et repart de la première page", async () => {
    state.data[STATS] = stats()
    state.data[LIST] = page([row()], false, "server-cursor")
    await render()
    await act(async () => button("Suivant").click())
    expect(lastListArgs()).toMatchObject({ status: "error", paginationOpts: { cursor: "server-cursor" } })
    await act(async () => button("Infectés").click())
    expect(lastListArgs()).toMatchObject({ status: "infected", paginationOpts: { cursor: null } })
    expect(button("Infectés").getAttribute("aria-pressed")).toBe("true")
  })

  it("relance un fichier retenu avec un motif, écrit au journal par le serveur", async () => {
    state.data[STATS] = stats({ error: { count: 1, sampled: false } })
    state.data[LIST] = page([row()])
    state.mutation.mockResolvedValue(null)
    await render()
    await act(async () => button("Relancer l’analyse").click())
    // Un motif trop court est refusé avant tout appel.
    await typeReason("ok")
    await submitReason()
    expect(state.mutation).not.toHaveBeenCalled()
    await typeReason("Antivirus rétabli après panne")
    await submitReason()
    expect(state.mutation).toHaveBeenCalledWith({ scanId: "scan-1", reason: "Antivirus rétabli après panne" })
    expect(state.toast).toHaveBeenCalledWith("Analyse relancée. Le fichier ne redeviendra lisible qu’après un verdict sain.")
  })

  it("ne propose aucune relance pour un fichier produit par la plateforme, ni au-delà du plafond d'analyse", async () => {
    state.data[STATS] = stats()
    state.data[LIST] = page([
      row({ _id: "generated", status: "skipped", source: "generated", filename: "directs/rediffusion.mp4", sizeBytes: 900 * MIO, verdictReason: undefined, skipReason: "server_generated", attempts: 0 }),
      row({ _id: "legacy", status: "skipped", filename: "clip.mp4", sizeBytes: 70 * MIO, verdictReason: undefined, skipReason: "too_large", attempts: 1 }),
      row({ _id: "heavy", status: "error", filename: "ancien.mp4", sizeBytes: 70 * MIO }),
    ])
    await render()
    expect(maybeButton("Relancer l’analyse")).toBeNull()
    expect(container.textContent).toContain("Produit par la plateforme (enregistrement de direct)")
    expect(container.textContent).toContain("Il reste retenu et n’est jamais servi.")
    expect(container.textContent).toContain("une relance ne pourrait pas l’analyser")
    expect(container.textContent).toContain("70 Mio")
  })
})
