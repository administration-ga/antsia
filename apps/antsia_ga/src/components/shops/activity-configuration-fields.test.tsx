// @vitest-environment jsdom
import { createAppI18n } from "@antsia/social-features/i18n"
import { effectiveActivityConfiguration, type ActivityConfiguration } from "@antsia/social-domain/activityConfiguration"
import { act, useState, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import frActivity from "@/i18n/locales/fr/activityConfiguration.json"
import frShops from "@/i18n/locales/fr/shops.json"
import type { ShopEditorData } from "./shop-model"

const state = vi.hoisted(() => ({ update: vi.fn(), changed: vi.fn(), onDirty: vi.fn(), onNext: vi.fn() }))
vi.mock("@antsia/api/engine", () => ({ api: { modules: { shops: { shops: { updateShop: "updateShop" } } } } }))
vi.mock("@antsia/api/network", () => ({ useNetwork: () => ({ networkId: "network-a", personId: "person-a" }) }))
vi.mock("convex/react", () => ({ useMutation: () => state.update }))
vi.mock("./shop-ui", () => ({
  SHOP_SELECT_CLASS: "",
  useShopAction: () => {
    const [error, setError] = useState<string | null>(null)
    return {
      pending: false,
      error,
      run: async (operation: () => Promise<unknown>, success?: (value: unknown) => void) => {
        setError(null)
        try { const value = await operation(); success?.(value); return value } catch { setError("Enregistrement impossible. Réessayez."); return undefined }
      },
    }
  },
}))

import { ActivityConfigurationFields } from "./activity-configuration-fields"
import { ShopActivityForm } from "./shop-activity-form"

let host: HTMLDivElement
let root: Root | undefined
const i18n = createAppI18n({ locale: "fr", appResources: { fr: { activityConfiguration: frActivity, shops: frShops }, en: { activityConfiguration: frActivity, shops: frShops } }, defaultNS: "activityConfiguration" })
const initial = effectiveActivityConfiguration(undefined, "products")
const shop = { shopId: "shop-a", model: "products", page: null } as unknown as ShopEditorData

async function render(content: ReactNode) {
  if (!root) {
    host = document.createElement("div")
    document.body.append(host)
    root = createRoot(host)
  }
  await act(async () => { root?.render(<I18nextProvider i18n={i18n}>{content}</I18nextProvider>) })
}
function checkbox(name: string) {
  return Array.from(host.querySelectorAll<HTMLLabelElement>("label")).find(label => label.textContent?.startsWith(name))?.querySelector<HTMLInputElement>('input[type="checkbox"]')
}
function button(name: string) {
  return Array.from(host.querySelectorAll<HTMLButtonElement>("button")).find(node => node.getAttribute("aria-label") === name || node.textContent === name)
}
function labels() { return Array.from(host.querySelectorAll("ol li > span")).map(node => node.textContent) }
function FieldHarness({ value = initial, disabled = false }: { value?: ActivityConfiguration; disabled?: boolean }) {
  const [configuration, setConfiguration] = useState(value)
  return <ActivityConfigurationFields value={configuration} disabled={disabled} onChange={next => { state.changed(next); setConfiguration(next) }} />
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  state.update.mockResolvedValue(undefined)
})
afterEach(async () => {
  await act(async () => { root?.unmount() })
  host?.remove()
  root = undefined
  vi.unstubAllGlobals()
})

describe("MP02 — composition de l'activité", () => {
  it("compose produits et services sans perdre la page ni permettre une activité vide", async () => {
    await render(<FieldHarness />)
    expect(checkbox("Produits")?.checked).toBe(true)
    expect(checkbox("Produits")?.disabled).toBe(true)
    await act(async () => { checkbox("Services")?.click() })
    expect(state.changed).toHaveBeenLastCalledWith({ ...initial, capabilities: ["products", "services"], blocks: ["services", "catalog", "publications", "about"] })
    expect(checkbox("Produits")?.disabled).toBe(false)
    await act(async () => { checkbox("Produits")?.click() })
    expect(labels()).toEqual(["Services", "Publications", "À propos"])
    expect(checkbox("Services")?.disabled).toBe(true)
    expect(host.querySelector('button[aria-label="Rétablir Catalogue"]')).toBeNull()
  })

  it("conserve un ordre choisi et permet de masquer puis rétablir un bloc", async () => {
    await render(<FieldHarness />)
    await act(async () => { button("Monter À propos")?.click() })
    expect(labels()).toEqual(["Catalogue", "À propos", "Publications"])
    button("Masquer Catalogue")?.focus()
    await act(async () => { button("Masquer Catalogue")?.click() })
    expect(labels()).toEqual(["À propos", "Publications"])
    expect(document.activeElement?.textContent).toBe(frActivity.blocks.label)
    await act(async () => { button("Rétablir Catalogue")?.click() })
    expect(labels()).toEqual(["À propos", "Publications", "Catalogue"])
    await act(async () => { button("Masquer Publications")?.click() })
    await act(async () => { button("Masquer Catalogue")?.click() })
    expect(labels()).toEqual(["À propos"])
    expect(button("Masquer À propos")?.disabled).toBe(true)
  })

  it("annonce la préparation média sans inventer une rédaction ou des permissions", async () => {
    await render(<FieldHarness />)
    await act(async () => { checkbox("Média")?.click() })
    expect(host.querySelector('[role="note"]')?.textContent).toBe(frActivity.mediaPreparation)
    expect(labels()).not.toContain("Articles")
    const select = host.querySelector<HTMLSelectElement>("select")!
    await act(async () => { select.value = "fashion"; select.dispatchEvent(new Event("change", { bubbles: true })) })
    expect(state.changed).toHaveBeenLastCalledWith(expect.objectContaining({ template: "fashion", capabilities: ["products", "media"] }))
    expect(host.querySelectorAll("a")).toHaveLength(0)
  })

  it("désactive toutes les modifications pendant une sauvegarde", async () => {
    await render(<FieldHarness disabled />)
    expect(Array.from(host.querySelectorAll<HTMLInputElement>("input")).every(node => node.disabled)).toBe(true)
    expect(host.querySelector<HTMLSelectElement>("select")?.disabled).toBe(true)
    expect(Array.from(host.querySelectorAll<HTMLButtonElement>("button")).every(node => node.disabled)).toBe(true)
    await act(async () => { checkbox("Services")?.click(); button("Monter À propos")?.click() })
    expect(state.changed).not.toHaveBeenCalled()
  })
})

describe("MP02 — sauvegarde et reprise du brouillon d'activité", () => {
  it("reprend les anciennes boutiques et suit un retour serveur seulement lorsque la saisie est propre", async () => {
    await render(<ShopActivityForm shop={shop} onDirty={state.onDirty} onNext={state.onNext} />)
    expect(checkbox("Produits")?.checked).toBe(true)
    const configuration: ActivityConfiguration = { ...initial, capabilities: ["services"], template: "expert", blocks: ["services", "about"] }
    await render(<ShopActivityForm shop={{ ...shop, activityConfiguration: configuration } as ShopEditorData} onDirty={state.onDirty} onNext={state.onNext} />)
    expect(checkbox("Services")?.checked).toBe(true)
    expect(host.querySelector<HTMLSelectElement>("select")?.value).toBe("expert")
    expect(state.update).not.toHaveBeenCalled()
    expect(state.onDirty).toHaveBeenLastCalledWith(false)
  })

  it("garde le vrai brouillon pendant une mise à jour distante et un échec, puis sauvegarde et continue", async () => {
    await render(<ShopActivityForm shop={shop} onDirty={state.onDirty} onNext={state.onNext} />)
    await act(async () => { checkbox("Services")?.click() })
    expect(state.onDirty).toHaveBeenLastCalledWith(true)
    expect(host.textContent).toContain(frActivity.unsaved)
    await render(<ShopActivityForm shop={{ ...shop, activityConfiguration: { ...initial, template: "fashion" } } as ShopEditorData} onDirty={state.onDirty} onNext={state.onNext} />)
    expect(checkbox("Services")?.checked).toBe(true)
    expect(host.querySelector<HTMLSelectElement>("select")?.value).toBe("general")
    state.update.mockRejectedValueOnce(new Error("offline"))
    await act(async () => { button(frActivity.saveAndContinue)?.click() })
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Enregistrement impossible")
    expect(checkbox("Services")?.checked).toBe(true)
    expect(state.onNext).not.toHaveBeenCalled()
    expect(state.onDirty).toHaveBeenLastCalledWith(true)
    await act(async () => { button(frActivity.saveAndContinue)?.click() })
    expect(state.update).toHaveBeenLastCalledWith({ networkId: "network-a", shopId: "shop-a", activityConfiguration: { ...initial, capabilities: ["products", "services"], blocks: ["services", "catalog", "publications", "about"] } })
    expect(state.onDirty).toHaveBeenLastCalledWith(false)
    expect(state.onNext).toHaveBeenCalledOnce()
    expect(host.textContent).toContain(frActivity.saved)
    expect(button(frActivity.save)?.disabled).toBe(true)
  })

  it("continue une configuration déjà enregistrée sans écriture supplémentaire", async () => {
    await render(<ShopActivityForm shop={shop} onDirty={state.onDirty} onNext={state.onNext} />)
    await act(async () => { button(frShops.steps.presentation)?.click() })
    expect(state.onNext).toHaveBeenCalledOnce()
    expect(state.update).not.toHaveBeenCalled()
  })
})
