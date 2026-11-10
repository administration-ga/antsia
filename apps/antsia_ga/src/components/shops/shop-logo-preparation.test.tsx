// @vitest-environment jsdom
import { createAppI18n } from "@antsia/social-features/i18n"
import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { appResources } from "@/i18n/resources"
import type { SquareImageSelection } from "@/lib/square-image"

const mocks = vi.hoisted(() => ({ generate: vi.fn(), attach: vi.fn(), update: vi.fn(), prepare: vi.fn(), fetch: vi.fn(), dirty: vi.fn() }))
vi.mock("@antsia/api/engine", () => ({ api: { modules: { shops: { shops: { updateShop: "update", generateShopLogoUploadUrl: "generate", setShopLogo: "attach" } } } } }))
vi.mock("@antsia/api/network", () => ({ useNetwork: () => ({ networkId: "network-a", personId: "person-a" }) }))
vi.mock("@antsia/api/sign-out-everywhere", () => ({ isSigningOutEverywhere: () => false }))
vi.mock("convex/react", () => ({ useConvexAuth: () => ({ isAuthenticated: true }), useMutation: (reference: string) => reference === "generate" ? mocks.generate : reference === "attach" ? mocks.attach : mocks.update }))
vi.mock("@/components/member-chrome", () => ({ MemberPage: ({ children }: { children: ReactNode }) => <main>{children}</main> }))
vi.mock("@/lib/square-image", () => ({ prepareSquareImage: mocks.prepare }))
// Le moteur de recadrage est testé séparément ; ici, la sélection simule le résultat d'un cadrage valide.
vi.mock("./square-image-editor", () => ({ SquareImageEditor: ({ file, onChange }: { file: File; onChange: (selection: SquareImageSelection | null) => void }) => <div data-square-preview>{file.name}<button type="button" onClick={() => onChange(selection)}>Valider ce carré</button></div> }))

import { editorFixture } from "./__tests__/fixtures"
import { ShopPresentationForm } from "./shop-presentation-form"

const selection: SquareImageSelection = { width: 1800, height: 1200, x: 0.5, y: 0.5, zoom: 1 }
const i18n = createAppI18n({ locale: "fr", appResources, defaultNS: "shops" })
const uploadUrl = "https://uploads.example.test/logo"
let root: Root
let container: HTMLDivElement

async function render() { await act(async () => root.render(<I18nextProvider i18n={i18n}><ShopPresentationForm shop={editorFixture()} onDirty={mocks.dirty} /></I18nextProvider>)) }
function button(label: string): HTMLButtonElement {
  const node = [...container.querySelectorAll("button")].find(element => element.textContent === label)
  if (!node) throw new Error(`Bouton absent : ${label}`)
  return node
}
const uploadButton = () => button(i18n.t("presentation.uploadLogo"))
async function click(node: HTMLButtonElement) { await act(async () => node.click()) }
async function choose(file: File) {
  await act(async () => {
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!
    Object.defineProperty(input, "files", { configurable: true, value: [file] })
    input.dispatchEvent(new Event("change", { bubbles: true }))
  })
}
async function chooseAndFrame() {
  const original = new File(["original wide JPEG"], "boutique.jpg", { type: "image/jpeg" })
  await choose(original)
  await click(button("Valider ce carré"))
  return original
}
function expectNoUpload() {
  expect(mocks.generate).not.toHaveBeenCalled()
  expect(mocks.fetch).not.toHaveBeenCalled()
  expect(mocks.attach).not.toHaveBeenCalled()
  expect(mocks.update).not.toHaveBeenCalled()
}

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  for (const mock of [mocks.generate, mocks.attach, mocks.update, mocks.prepare, mocks.fetch, mocks.dirty]) mock.mockReset()
  mocks.generate.mockResolvedValue(uploadUrl)
  mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ storageId: "storage-square" }) })
  mocks.attach.mockResolvedValue({ changed: true, withheld: null })
  vi.stubGlobal("fetch", mocks.fetch)
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals() })

describe("logo de boutique — cadrage local avant envoi", () => {
  it("attend un fichier, un cadrage valide et un clic explicite avant toute préparation ou requête", async () => {
    await render()
    expect(uploadButton().disabled).toBe(true)
    await choose(new File(["photo"], "panorama.jpg", { type: "image/jpeg" }))
    expect(container.querySelector("[data-square-preview]")?.textContent).toContain("panorama.jpg")
    expect(mocks.dirty).toHaveBeenLastCalledWith(true)
    expect(uploadButton().disabled).toBe(true)
    await click(uploadButton())
    expect(mocks.prepare).not.toHaveBeenCalled()
    expectNoUpload()
    await click(button("Valider ce carré"))
    expect(uploadButton().disabled).toBe(false)
    expect(mocks.prepare).not.toHaveBeenCalled()
    expectNoUpload()
  })

  it("prépare d'abord le carré, puis envoie le fichier produit et son MIME réel, jamais l'original", async () => {
    const prepared = new File(["square PNG bytes"], "boutique-square.png", { type: "image/png" })
    let finishPreparation!: (file: File) => void
    mocks.prepare.mockReturnValue(new Promise<File>(resolve => { finishPreparation = resolve }))
    await render()
    const original = await chooseAndFrame()
    await click(uploadButton())
    expect(mocks.prepare).toHaveBeenCalledExactlyOnceWith(original, selection)
    expectNoUpload()
    await act(async () => finishPreparation(prepared))
    expect(mocks.generate).toHaveBeenCalledExactlyOnceWith({ networkId: "network-a" })
    expect(mocks.fetch).toHaveBeenCalledExactlyOnceWith(uploadUrl, { method: "POST", headers: { "Content-Type": "image/png" }, body: prepared })
    expect(mocks.fetch.mock.calls[0]![1].body).toBe(prepared)
    expect(mocks.fetch.mock.calls[0]![1].body).not.toBe(original)
    expect(mocks.attach).toHaveBeenCalledExactlyOnceWith({ networkId: "network-a", shopId: editorFixture().shopId, storageId: "storage-square", mimeType: "image/png" })
    expect(mocks.update).not.toHaveBeenCalled()
    expect(container.textContent).toContain(i18n.t("presentation.logoSaved"))
    expect(container.querySelector("[data-square-preview]")).toBeNull()
    expect(uploadButton().disabled).toBe(true)
    expect(mocks.dirty).toHaveBeenLastCalledWith(false)
  })

  it("garde le choix et signale un échec de préparation sans demander d'URL ni envoyer l'original", async () => {
    mocks.prepare.mockRejectedValue(new Error("square_image_unavailable"))
    await render()
    await chooseAndFrame()
    await click(uploadButton())
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(i18n.t("images.invalid"))
    expect(container.querySelector("[data-square-preview]")).not.toBeNull()
    expect(mocks.dirty).toHaveBeenLastCalledWith(true)
    expectNoUpload()
  })

  it.each([
    ["format inattendu", () => new File(["not an admitted output"], "square.gif", { type: "image/gif" })],
    ["fichier vide", () => new File([], "square.webp", { type: "image/webp" })],
  ] as const)("refuse aussi un résultat préparé invalide : %s", async (_label, prepared) => {
    mocks.prepare.mockResolvedValue(prepared())
    await render()
    await chooseAndFrame()
    await click(uploadButton())
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(i18n.t("images.invalid"))
    expectNoUpload()
  })

  it("annule le choix et son état modifié, sans préparation ni requête", async () => {
    await render()
    await chooseAndFrame()
    expect(mocks.dirty).toHaveBeenLastCalledWith(true)
    await click(button(i18n.t("images.cancel")))
    expect(container.querySelector("[data-square-preview]")).toBeNull()
    expect(uploadButton().disabled).toBe(true)
    expect(container.querySelector<HTMLInputElement>('input[type="file"]')!.value).toBe("")
    expect(mocks.dirty).toHaveBeenLastCalledWith(false)
    expect(mocks.prepare).not.toHaveBeenCalled()
    expectNoUpload()
  })
})
