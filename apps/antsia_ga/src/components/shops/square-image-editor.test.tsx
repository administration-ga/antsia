// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

import { SquareImageEditor } from "./square-image-editor"

describe("préparation visuelle d'une image carrée", () => {
  const change = vi.fn()
  const createUrl = vi.fn()
  const revokeUrl = vi.fn()
  let root: Root, container: HTMLDivElement, file: File
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
    const NativeURL = URL
    vi.stubGlobal("URL", class extends NativeURL { static override createObjectURL = createUrl; static override revokeObjectURL = revokeUrl })
    createUrl.mockImplementation((item: File) => `blob:${item.name}`)
    file = new File(["photo"], "photo.jpg", { type: "image/jpeg" })
    container = document.createElement("div"); document.body.append(container); root = createRoot(container)
  })
  afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals() })
  const render = () => act(() => root.render(<SquareImageEditor file={file} onChange={change} />))
  const load = (width: number, height: number) => {
    const image = container.querySelector("img")!
    Object.defineProperty(image, "naturalWidth", { configurable: true, value: width })
    Object.defineProperty(image, "naturalHeight", { configurable: true, value: height })
    act(() => image.dispatchEvent(new Event("load", { bubbles: true })))
    return image
  }
  const slide = (index: number, value: string) => {
    const input = container.querySelectorAll<HTMLInputElement>('input[type="range"]')[index]!
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!
    act(() => { setter.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })) })
  }

  it("attend le décodage, puis montre le carré central exact d'une photo paysage sans marges", () => {
    render()
    expect(change).toHaveBeenLastCalledWith(null)
    expect(container.querySelector("fieldset")!.disabled).toBe(true)
    const image = load(1800, 1200)
    expect(change).toHaveBeenLastCalledWith({ width: 1800, height: 1200, x: 0.5, y: 0.5, zoom: 1 })
    expect(image.style.width).toBe("150%")
    expect(image.style.height).toBe("100%")
    expect(image.style.left).toBe("-25%")
    expect(image.style.top).toBe("0%")
    expect(container.querySelector("fieldset")!.disabled).toBe(false)
    expect(container.querySelector("[data-square-image-preview]")!.className).toContain("aspect-square")
    expect(container.querySelector("[data-square-image-preview]")!.className).not.toMatch(/\bborder\b|\bp-\d/)
    const ranges = [...container.querySelectorAll<HTMLInputElement>('input[type="range"]')]
    expect(ranges).toHaveLength(3)
    const labels = [...container.querySelectorAll("label")]
    expect(ranges.every(input => labels.some(label => label.htmlFor === input.id && label.textContent))).toBe(true)
  })

  it("déplace le carré et zoome avec des contrôles natifs étiquetés, puis réinitialise", () => {
    render(); load(1200, 1800)
    expect(container.querySelectorAll<HTMLInputElement>('input[type="range"]')[0]!.disabled).toBe(true)
    slide(1, "100")
    expect(change).toHaveBeenLastCalledWith({ width: 1200, height: 1800, x: 0.5, y: 1, zoom: 1 })
    expect(container.querySelector("img")!.style.top).toBe("-50%")
    slide(2, "2")
    expect(container.querySelectorAll<HTMLInputElement>('input[type="range"]')[0]!.disabled).toBe(false)
    expect(change).toHaveBeenLastCalledWith({ width: 1200, height: 1800, x: 0.5, y: 1, zoom: 2 })
    expect(container.querySelector("img")!.style.height).toBe("300%")
    expect(container.querySelector("img")!.style.top).toBe("-200%")
    act(() => container.querySelector("button")!.click())
    expect(change).toHaveBeenLastCalledWith({ width: 1200, height: 1800, x: 0.5, y: 0.5, zoom: 1 })
  })

  it("une erreur ou des dimensions excessives annulent la sélection utilisable", () => {
    render(); load(1200, 1200)
    act(() => container.querySelector("img")!.dispatchEvent(new Event("error", { bubbles: true })))
    expect(change).toHaveBeenLastCalledWith(null)
    expect(container.querySelector('[role="alert"]')!.textContent).toBe("images.invalid")
    expect(container.querySelector("fieldset")!.disabled).toBe(true)
    expect(container.querySelector("img")).toBeNull()
    file = new File(["big"], "large.jpg", { type: "image/jpeg" })
    render(); load(8000, 8000)
    expect(change).toHaveBeenLastCalledWith(null)
    expect(container.querySelector('[role="alert"]')).not.toBeNull()
  })

  it("changer de fichier invalide le cadrage et révoque chaque URL objet, démontage compris", () => {
    render(); load(1800, 1200); slide(0, "100")
    file = new File(["next"], "suivante.png", { type: "image/png" })
    render()
    expect(revokeUrl).toHaveBeenCalledWith("blob:photo.jpg")
    expect(change).toHaveBeenLastCalledWith(null)
    expect(container.querySelector("fieldset")!.disabled).toBe(true)
    load(1200, 1200)
    expect(change).toHaveBeenLastCalledWith({ width: 1200, height: 1200, x: 0.5, y: 0.5, zoom: 1 })
    act(() => root.unmount())
    expect(revokeUrl).toHaveBeenCalledWith("blob:suivante.png")
    root = createRoot(container)
  })
})
