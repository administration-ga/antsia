// @vitest-environment jsdom
// IC-04 — la rubrique « iCom » des Réglages : états (chargement, erreur, enregistrement), textes réels
// en français et en anglais, « Ne pas déranger » monté, et seuls les champs changés partent au moteur.
import { createAppI18n, type Locale } from "@antsia/social-features/i18n"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

type Preferences = {
  dnd: null
  ringtone: { muted: boolean; vibrate: boolean }
  callWaiting: boolean
  quickReplies: string[] | null
  voicemailEnabled: boolean
  autoMeetingDnd: null
  sharePresence: boolean
  pushIncoming: boolean
  outsideRelationsCalls: "ring" | "silent"
  readReceipts: boolean
  journalSeenAt: number | null
  saved: boolean
}

const DEFAULTS: Preferences = {
  dnd: null,
  ringtone: { muted: false, vibrate: true },
  callWaiting: true,
  quickReplies: null,
  voicemailEnabled: true,
  autoMeetingDnd: null,
  sharePresence: true,
  pushIncoming: true,
  outsideRelationsCalls: "silent",
  readReceipts: true,
  journalSeenAt: null,
  saved: false,
}

const state = vi.hoisted(() => ({
  query: { data: undefined as unknown, error: null as unknown },
  queries: [] as unknown[],
  update: vi.fn<(args: Record<string, unknown>) => Promise<{ saved: true }>>(),
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock("@antsia/api/engine", () => ({ api: { modules: { calls: { preferences: { getMine: "calls.preferences.getMine", update: "calls.preferences.update" } } } } }))
vi.mock("@antsia/api/hooks", () => ({
  useAuthenticatedConvexQuery: (query: string, args: unknown) => {
    state.queries.push([query, args])
    return state.query
  },
}))
vi.mock("convex/react", () => ({ useMutation: () => state.update }))
vi.mock("sonner", () => ({ toast: state.toast }))
// La rangée « Mon statut » du moteur (Ne pas déranger) a ses propres tests ; ici, sa place dans la rubrique.
vi.mock("@antsia/social-features/shell", () => ({ MyPresenceRow: () => <section data-testid="my-presence-row">Mon statut</section> }))

import { appResources } from "@/i18n/resources"
import { IcomSettings, icomSettingsPatch, icomSettingsValues } from "./icom-settings"

let root: Root | undefined
let container: HTMLDivElement

async function mount(locale: Locale = "fr") {
  const translations = createAppI18n({ locale, appResources, defaultNS: "antsia" })
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root!.render(<I18nextProvider i18n={translations}><IcomSettings /></I18nextProvider>)
  })
  return translations
}

async function rerender() {
  const translations = createAppI18n({ locale: "fr", appResources, defaultNS: "antsia" })
  await act(async () => {
    root!.render(<I18nextProvider i18n={translations}><IcomSettings /></I18nextProvider>)
  })
}

const byLabel = (text: string) => [...container.querySelectorAll("label")].find((label) => label.textContent?.includes(text))?.querySelector("input") ?? null
const submit = () => container.querySelector<HTMLButtonElement>('button[type="submit"]')!

async function click(element: HTMLElement) {
  await act(async () => { element.click() })
}

async function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!
  await act(async () => {
    setter.call(input, value)
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
}

beforeEach(() => {
  state.query = { data: DEFAULTS, error: null }
  state.queries.length = 0
  state.update.mockReset()
  state.update.mockResolvedValue({ saved: true })
  state.toast.success.mockReset()
  state.toast.error.mockReset()
})

afterEach(async () => {
  await act(async () => root?.unmount())
  root = undefined
  container?.remove()
})

describe("IcomSettings — la rubrique iCom des Réglages", () => {
  it("lit mes réglages à un instant arrondi à la minute, monte « Ne pas déranger », et dit l'effet réel de chaque choix", async () => {
    await mount("fr")
    expect(state.queries[0]).toEqual(["calls.preferences.getMine", { now: expect.any(Number) }])
    expect((state.queries[0] as [string, { now: number }])[1].now % 60_000).toBe(0)
    expect(container.querySelector("h2")?.textContent).toBe("iCom : appels et messages")
    expect(container.querySelector('[data-testid="my-presence-row"]')).not.toBeNull()
    expect([...container.querySelectorAll("legend")].map((legend) => legend.textContent)).toEqual(["Qui peut m’appeler", "Lecture, messagerie vocale et présence", "Réponses rapides"])
    // Le défaut de la décision du 9/11/2026, dit tel qu'il agit.
    expect(byLabel("Mes relations seulement")?.checked).toBe(true)
    expect(container.textContent).toContain("Les personnes hors de mes relations ne font pas sonner mon téléphone ; leur appel est inscrit à mon journal d’appels.")
    expect(byLabel("Tous les membres du réseau")?.checked).toBe(false)
    expect(byLabel("Accusés de lecture")?.checked).toBe(true)
    expect(container.textContent).toContain("je ne vois plus quand ils lisent les miens")
    expect(byLabel("Messagerie vocale")?.checked).toBe(true)
    expect(byLabel("Double appel")?.checked).toBe(true)
    expect(byLabel("Montrer ma présence à mes relations")?.checked).toBe(true)
    // Jamais réglées : les réponses rapides de l'écran, traduites.
    expect([...container.querySelectorAll<HTMLInputElement>("ol input")].map((input) => input.value)).toEqual(["Je vous rappelle dans 10 minutes", "En réunion, écrivez-moi", "Je ne peux pas répondre maintenant"])
    // Rien de changé : rien à enregistrer.
    expect(submit().disabled).toBe(true)
  })

  it("les libellés existent aussi en anglais", async () => {
    await mount("en")
    expect(container.querySelector("h2")?.textContent).toBe("iCom: calls and messages")
    expect([...container.querySelectorAll("legend")].map((legend) => legend.textContent)).toEqual(["Who can call me", "Read receipts, voicemail and presence", "Quick replies"])
    expect(byLabel("My connections only")?.checked).toBe(true)
  })

  it("chargement puis erreur : un statut, puis une alerte traduite, jamais de formulaire vide", async () => {
    state.query = { data: undefined, error: null }
    await mount("fr")
    expect(container.querySelector('[role="status"]')?.textContent).toBe("Chargement de vos réglages iCom…")
    expect(container.querySelector("form")).toBeNull()
    state.query = { data: undefined, error: new Error("boom") }
    await rerender()
    expect(container.querySelector('[role="alert"]')).not.toBeNull()
    expect(container.querySelector("form")).toBeNull()
  })

  it("élargir « qui peut m'appeler » et couper les accusés n'envoie QUE ces deux champs, puis confirme", async () => {
    await mount("fr")
    await click(byLabel("Tous les membres du réseau")!)
    await click(byLabel("Accusés de lecture")!)
    expect(submit().disabled).toBe(false)
    await click(submit())
    expect(state.update).toHaveBeenCalledTimes(1)
    expect(state.update).toHaveBeenCalledWith({ outsideRelationsCalls: "ring", readReceipts: false })
    expect(state.toast.success).toHaveBeenCalledWith("Réglages iCom enregistrés.")
  })

  it("une réponse rapide changée envoie la liste nettoyée ; une erreur du moteur est dite, traduite", async () => {
    await mount("fr")
    const [first] = [...container.querySelectorAll<HTMLInputElement>("ol input")]
    await type(first!, "  Je te rappelle  ")
    await click([...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.getAttribute("aria-label") === "Retirer la réponse rapide 3")!)
    state.update.mockRejectedValueOnce(new Error("panne"))
    await click(submit())
    expect(state.update).toHaveBeenCalledWith({ quickReplies: ["Je te rappelle", "En réunion, écrivez-moi"] })
    expect(state.toast.error).toHaveBeenCalledTimes(1)
    expect(state.toast.success).not.toHaveBeenCalled()
  })

  it("au plus six réponses rapides, chacune de cent vingt caractères au plus", async () => {
    await mount("fr")
    const add = [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("Ajouter une réponse"))!
    for (let index = 0; index < 5; index += 1) await click(add)
    expect(container.querySelectorAll("ol li")).toHaveLength(6)
    expect(add.disabled).toBe(true)
    expect(container.querySelector<HTMLInputElement>("ol input")?.maxLength).toBe(120)
  })
})

describe("icomSettingsPatch — seuls les champs changés partent", () => {
  const t = ((key: string) => `t:${key}`) as never
  it("rien de changé : un patch vide ; des réponses jamais réglées et intactes ne sont jamais écrites", () => {
    const shown = icomSettingsValues(DEFAULTS as never, t)
    expect(icomSettingsPatch(shown, shown)).toEqual({})
    expect(icomSettingsPatch({ ...shown, quickReplies: shown.quickReplies.map((reply) => ({ text: ` ${reply.text} ` })) }, shown)).toEqual({})
  })
  it("un champ changé, et lui seul", () => {
    const shown = icomSettingsValues({ ...DEFAULTS, quickReplies: ["A"] } as never, t)
    expect(icomSettingsPatch({ ...shown, sharePresence: false }, shown)).toEqual({ sharePresence: false })
    expect(icomSettingsPatch({ ...shown, quickReplies: [] }, shown)).toEqual({ quickReplies: [] })
  })
})
