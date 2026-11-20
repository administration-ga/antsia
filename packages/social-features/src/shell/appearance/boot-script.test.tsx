// @vitest-environment jsdom
// ADR-0026 : l'amorçage pose sur <html> exactement ce que le fournisseur posera, et le fournisseur ne le défait jamais en hydratant.
// ADR-0027 : même parité pour le motif de fond (`data-motif`), absent par défaut.
import { act, cleanup, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createMemoryStorage } from "../../tests/memory-storage"
import { appearanceBootScript } from "./boot-script"
import { type AppearanceTheme, AppearanceProvider } from "./provider"

const PREFIX = "antsia:test:"
const THEMES: readonly AppearanceTheme[] = [
  { id: "origine", charte: "antsia" },
  { id: "foret", charte: "antsia-foret" },
  { id: "lagon", charte: "antsia-lagon" },
]
const SERVER_CHARTE = "antsia"
const MOTIFS = ["points", "quadrillage"] as const

type Stored = string | null
type StorageCase = "ok" | "getItem refusé" | "absent"
type SystemCase = "clair" | "sombre" | "sans API" | "API en erreur"

interface Scenario { theme: Stored; appearance: Stored; storage: StorageCase; system: SystemCase; motif?: Stored }

const THEME_VALUES: readonly Stored[] = [null, "foret", "origine", "inconnu", "__proto__"]
const APPEARANCE_VALUES: readonly Stored[] = [null, "light", "dark", "system", "inattendu"]
const STORAGES: readonly StorageCase[] = ["ok", "getItem refusé", "absent"]
const SYSTEMS: readonly SystemCase[] = ["clair", "sombre", "sans API", "API en erreur"]

const SCENARIOS: Scenario[] = THEME_VALUES.flatMap((theme) =>
  APPEARANCE_VALUES.flatMap((appearance) => STORAGES.flatMap((storage) => SYSTEMS.map((system) => ({ theme, appearance, storage, system })))),
)

/** <html> tel que le serveur le rend : la charte d'origine, ni `.dark`, ni `color-scheme`, ni motif. */
function serverHtml(charte = SERVER_CHARTE) {
  const html = document.documentElement
  html.setAttribute("data-charte", charte)
  html.removeAttribute("data-motif")
  html.classList.remove("dark")
  html.style.removeProperty("color-scheme")
}

function prepare({ theme, appearance, storage, system, motif = null }: Scenario) {
  const memory = createMemoryStorage()
  if (theme !== null) memory.setItem(`${PREFIX}theme`, theme)
  if (appearance !== null) memory.setItem(`${PREFIX}appearance`, appearance)
  if (motif !== null) memory.setItem(`${PREFIX}motif`, motif)
  if (storage === "getItem refusé") vi.spyOn(memory, "getItem").mockImplementation(() => { throw new Error("SecurityError") })
  vi.stubGlobal("localStorage", storage === "absent" ? undefined : memory)
  if (system === "sans API") vi.stubGlobal("matchMedia", undefined)
  else if (system === "API en erreur") vi.stubGlobal("matchMedia", vi.fn(() => { throw new Error("indisponible") }))
  else vi.stubGlobal("matchMedia", vi.fn(() => Object.assign(new EventTarget(), { matches: system === "sombre", media: "(prefers-color-scheme: dark)" })))
}

function htmlState() {
  const html = document.documentElement
  return { charte: html.getAttribute("data-charte"), dark: html.classList.contains("dark"), scheme: html.style.colorScheme }
}

function motifState() {
  return document.documentElement.getAttribute("data-motif")
}

function runBoot(themes: readonly AppearanceTheme[] = THEMES, prefix = PREFIX, motifs?: readonly string[]) {
  new Function(appearanceBootScript({ storagePrefix: prefix, themes, motifs }))()
}

function mountProvider(themes: readonly AppearanceTheme[] | undefined = THEMES, motifs?: readonly string[]) {
  render(<AppearanceProvider storagePrefix={PREFIX} themes={themes} motifs={motifs}><span /></AppearanceProvider>)
}

/** Toutes les valeurs prises par les attributs de <html> pendant `run`, la dernière comprise. */
function valuesTakenDuring(run: () => void) {
  const html = document.documentElement
  const observer = new MutationObserver(() => undefined)
  observer.observe(html, { attributes: true, attributeOldValue: true, attributeFilter: ["data-charte", "data-motif", "class", "style"] })
  run()
  const records = observer.takeRecords()
  observer.disconnect()
  const taken: Record<string, Set<string | null>> = {}
  for (const record of records) {
    const name = record.attributeName ?? ""
    taken[name] ??= new Set()
    taken[name].add(record.oldValue)
    taken[name].add(html.getAttribute(name))
  }
  return taken
}

beforeEach(() => serverHtml())

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("amorçage de l'apparence — parité avec le fournisseur", () => {
  it.each(SCENARIOS)("thème $theme, apparence $appearance, stockage $storage, système $system", (scenario) => {
    prepare(scenario)
    runBoot()
    const booted = htmlState()

    cleanup()
    serverHtml()
    prepare(scenario)
    act(() => mountProvider())
    expect(booted).toEqual(htmlState())
  })

  it("sans thèmes proposés, la charte posée par la page reste intacte ; le mode sombre s'applique", () => {
    serverHtml("diaspora-ga")
    prepare({ theme: "foret", appearance: "dark", storage: "ok", system: "clair" })
    runBoot([])
    expect(htmlState()).toEqual({ charte: "diaspora-ga", dark: true, scheme: "dark" })
  })

  it("lit les clés du préfixe du réseau, jamais celles d'un autre réseau", () => {
    prepare({ theme: null, appearance: null, storage: "ok", system: "clair" })
    window.localStorage.setItem("antsia:autre:theme", "lagon")
    window.localStorage.setItem("antsia:autre:appearance", "dark")
    runBoot()
    expect(htmlState()).toEqual({ charte: "antsia", dark: false, scheme: "light" })
  })
})

describe("hydratation : le fournisseur ne défait pas l'amorçage", () => {
  it.each([
    { theme: "foret", appearance: "dark", system: "clair" },
    { theme: "lagon", appearance: null, system: "sombre" },
    { theme: null, appearance: "light", system: "sombre" },
    { theme: "origine", appearance: "system", system: "sombre" },
  ] as const)("thème $theme, apparence $appearance, système $system : aucune autre valeur prise par <html>", (scenario) => {
    prepare({ ...scenario, storage: "ok" })
    runBoot()
    const booted = htmlState()
    const taken = valuesTakenDuring(() => act(() => mountProvider()))
    expect(htmlState()).toEqual(booted)
    // Chaque attribut touché n'a jamais pris que sa valeur finale : aucun cadre dans la charte ou le mode du premier rendu.
    expect(taken["data-charte"] ?? new Set([booted.charte])).toEqual(new Set([booted.charte]))
    for (const name of ["class", "style"] as const) {
      const values = taken[name]
      if (values) expect(values.size, `${name} : ${[...values].join(" → ")}`).toBe(1)
    }
  })
})

describe("amorçage du motif de fond — parité avec le fournisseur (ADR-0027)", () => {
  const MOTIF_VALUES: readonly Stored[] = [null, "points", "quadrillage", "inconnu", "__proto__", ""]
  const MOTIF_SCENARIOS = MOTIF_VALUES.flatMap((motif) => STORAGES.flatMap((storage) => [true, false].map((offered) => ({ motif, storage, offered }))))

  it.each(MOTIF_SCENARIOS)("motif $motif, stockage $storage, motifs proposés : $offered", ({ motif, storage, offered }) => {
    const motifs = offered ? MOTIFS : []
    const scenario: Scenario = { theme: null, appearance: null, storage, system: "clair", motif }
    prepare(scenario)
    runBoot(THEMES, PREFIX, motifs)
    const booted = motifState()
    // Seul un motif proposé, lu sans erreur, est posé ; tout le reste laisse le fond uni.
    expect(booted).toBe(offered && storage === "ok" && (motif === "points" || motif === "quadrillage") ? motif : null)

    cleanup()
    serverHtml()
    prepare(scenario)
    act(() => mountProvider(THEMES, motifs))
    expect(motifState()).toBe(booted)
  })

  it.each([
    { motif: "points", theme: "foret", appearance: "dark" },
    { motif: "quadrillage", theme: null, appearance: null },
  ] as const)("motif $motif : le fournisseur n'efface jamais en hydratant le motif posé avant l'affichage", (scenario) => {
    prepare({ ...scenario, storage: "ok", system: "clair" })
    runBoot(THEMES, PREFIX, MOTIFS)
    expect(motifState()).toBe(scenario.motif)
    const taken = valuesTakenDuring(() => act(() => mountProvider(THEMES, MOTIFS)))
    expect(motifState()).toBe(scenario.motif)
    expect(taken["data-motif"] ?? new Set([scenario.motif])).toEqual(new Set([scenario.motif]))
  })

  it("sans motifs proposés, la clé n'est pas lue et le `data-motif` de la page reste intact", () => {
    prepare({ theme: null, appearance: null, storage: "ok", system: "clair", motif: "points" })
    const getItem = vi.spyOn(window.localStorage, "getItem")
    document.documentElement.setAttribute("data-motif", "page")
    runBoot(THEMES, PREFIX, [])
    expect(motifState()).toBe("page")
    expect(getItem).not.toHaveBeenCalledWith(`${PREFIX}motif`)
  })

  it("lit la clé du préfixe du réseau, jamais celle d'un autre réseau", () => {
    prepare({ theme: null, appearance: null, storage: "ok", system: "clair" })
    window.localStorage.setItem("antsia:autre:motif", "points")
    runBoot(THEMES, PREFIX, MOTIFS)
    expect(motifState()).toBeNull()
  })
})

describe("texte du script", () => {
  it("stable pour une configuration donnée (empreinte CSP possible) et sans valeur de requête", () => {
    const first = appearanceBootScript({ storagePrefix: PREFIX, themes: THEMES, motifs: MOTIFS })
    expect(appearanceBootScript({ storagePrefix: PREFIX, themes: [...THEMES], motifs: [...MOTIFS] })).toBe(first)
    expect(first).not.toMatch(/nonce|cookie|location/)
  })

  it("une configuration hostile ne referme jamais l'élément script et reste lue telle quelle", () => {
    const prefix = "antsia:</script><script>alert(1)</script><!--:"
    const motifs = ["points", "</script><script>alert(2)</script>"]
    const script = appearanceBootScript({ storagePrefix: prefix, themes: THEMES, motifs })
    expect(script).not.toMatch(/<\/script|<!--/i)
    prepare({ theme: null, appearance: null, storage: "ok", system: "clair" })
    window.localStorage.setItem(`${prefix}theme`, "lagon")
    window.localStorage.setItem(`${prefix}appearance`, "dark")
    window.localStorage.setItem(`${prefix}motif`, motifs[1]!)
    runBoot(THEMES, prefix, motifs)
    expect(htmlState()).toEqual({ charte: "antsia-lagon", dark: true, scheme: "dark" })
    expect(motifState()).toBe(motifs[1])
  })
})
