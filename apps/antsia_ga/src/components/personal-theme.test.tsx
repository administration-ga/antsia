// @vitest-environment jsdom
import { memberThemeOf, type MemberThemeId } from "@antsia/social-contracts/appearance"
import { AppearanceProvider } from "@antsia/social-features/shell/appearance"
import { act, useEffect } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createMemoryStorage } from "../../../../packages/social-features/src/tests/memory-storage"

const mocks = vi.hoisted(() => ({ save: vi.fn<(args: { theme: MemberThemeId }) => Promise<unknown>>(), error: vi.fn() }))
vi.mock("convex/react", () => ({ useMutation: () => mocks.save }))
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock("sonner", () => ({ toast: { error: mocks.error } }))

import { APPEARANCE } from "@/lib/appearance"
import { PersonalTheme, useThemeChoice } from "./personal-theme"

type Props = { signedIn: boolean; accountTheme: MemberThemeId | undefined }
let root: Root | undefined
let host: HTMLDivElement
let choice: ReturnType<typeof useThemeChoice> = null

function Probe() {
  const choose = useThemeChoice()
  useEffect(() => { choice = choose }, [choose])
  return <button disabled={!choose} onClick={() => choose?.("sable")}>theme</button>
}

async function render(props: Props) {
  if (!root) {
    host = document.createElement("div")
    document.body.append(host)
    root = createRoot(host)
  }
  await act(async () => root!.render(<AppearanceProvider storagePrefix={APPEARANCE.storagePrefix} themes={APPEARANCE.themes} motifs={APPEARANCE.motifs}><PersonalTheme {...props}><Probe /></PersonalTheme></AppearanceProvider>))
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  vi.stubGlobal("matchMedia", vi.fn(() => Object.assign(new EventTarget(), { matches: false })))
  vi.stubGlobal("localStorage", createMemoryStorage())
  window.localStorage.setItem(`${APPEARANCE.storagePrefix}theme`, "sable")
  document.documentElement.dataset.charte = "antsia-sable"
  choice = null
  mocks.save.mockReset().mockResolvedValue(null)
  mocks.error.mockReset()
})

afterEach(async () => {
  await act(async () => root?.unmount())
  root = undefined
  host?.remove()
  vi.unstubAllGlobals()
})

describe("synchronisation du thème sous la session", () => {
  it("un compte anciennement Indigo reprend Gaboma et retire Sable du cache de l'appareil", async () => {
    await render({ signedIn: true, accountTheme: memberThemeOf("indigo") })
    expect(document.documentElement.dataset.charte).toBe("antsia")
    expect(window.localStorage.getItem(`${APPEARANCE.storagePrefix}theme`)).toBeNull()
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it("un compte sans thème garde Sable sans le recopier dans le compte", async () => {
    await render({ signedIn: true, accountTheme: undefined })
    expect(document.documentElement.dataset.charte).toBe("antsia-sable")
    expect(window.localStorage.getItem(`${APPEARANCE.storagePrefix}theme`)).toBe("sable")
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it("hors session, une ancienne fiche ne s'applique pas et le sélecteur n'écrit rien", async () => {
    await render({ signedIn: false, accountTheme: "corail" })
    expect(choice).toBeNull()
    expect(host.querySelector("button")?.disabled).toBe(true)
    expect(document.documentElement.dataset.charte).toBe("antsia-sable")
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it("un refus d'enregistrement rend le thème du compte dans le DOM et le cache", async () => {
    mocks.save.mockRejectedValue(new Error("hors ligne"))
    await render({ signedIn: true, accountTheme: "corail" })
    await act(async () => choice?.("sable"))
    expect(document.documentElement.dataset.charte).toBe("antsia-corail")
    expect(window.localStorage.getItem(`${APPEARANCE.storagePrefix}theme`)).toBe("corail")
    expect(mocks.error).toHaveBeenCalledOnce()
  })

  it("une sortie ferme l'ancienne fonction de choix, la file d'écriture et les retours tardifs", async () => {
    let refuse: (reason: Error) => void = () => undefined
    mocks.save.mockImplementation(() => new Promise((_resolve, reject) => { refuse = reject }))
    await render({ signedIn: true, accountTheme: "gaboma" })
    const oldChoice = choice
    await act(async () => oldChoice?.("foret"))
    await act(async () => oldChoice?.("lagon"))
    await render({ signedIn: false, accountTheme: "corail" })
    await act(async () => { oldChoice?.("sable"); refuse(new Error("ancienne session")) })
    expect(choice).toBeNull()
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith({ theme: "foret" })
    expect(document.documentElement.dataset.charte).toBe("antsia-lagon")
    expect(mocks.error).not.toHaveBeenCalled()
  })
})
