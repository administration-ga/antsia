// @vitest-environment jsdom
import { PERSONAL_MEETINGS_CAPABILITIES } from "@antsia/social-domain/personalMeetings"
import { createAppI18n } from "@antsia/social-features/i18n"
import { act, type AnchorHTMLAttributes } from "react"
import { createRoot, type Root } from "react-dom/client"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({ query: vi.fn(), networkId: "network-personal-meetings", data: undefined as unknown, error: null as unknown }))
vi.mock("@antsia/api/engine", () => ({ api: { modules: { personalMeetings: { capabilities: { get: "personal-meetings-capabilities" } } } } }))
vi.mock("@antsia/api/network", () => ({ useNetwork: () => ({ networkId: state.networkId }) }))
vi.mock("@antsia/api/hooks", () => ({ useAuthenticatedConvexQuery: (...args: unknown[]) => { state.query(...args); return { data: state.data, error: state.error } } }))
vi.mock("next/link", () => ({ default: ({ href, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a {...props} href={href}>{children}</a> }))

import fr from "@/i18n/locales/fr/personalMeetings.json"
import en from "@/i18n/locales/en/personalMeetings.json"
import { routes } from "@/lib/routes"
import { PersonalMeetingsEntry } from "./personal-meetings-entry"

let root: Root, container: HTMLDivElement
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  state.query.mockClear(); state.data = undefined; state.error = null
  container = document.createElement("div"); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals() })
async function render(locale: "fr" | "en" = "fr") {
  const i18n = createAppI18n({ locale, appResources: { fr: { personalMeetings: fr }, en: { personalMeetings: en } }, defaultNS: "personalMeetings" })
  await act(async () => root.render(<I18nextProvider i18n={i18n}><PersonalMeetingsEntry /></I18nextProvider>))
}
function expectNoPersonalEntry() {
  expect(container.querySelector("form, input, textarea, select, button")).toBeNull()
  expect(container.querySelectorAll("a")).toHaveLength(1)
  expect(container.querySelector("a")?.getAttribute("href")).toBe(routes.professionals())
  expect(container.querySelectorAll("li")).toHaveLength(4)
}

describe("MP10–MP11 — écran personnel fermé", () => {
  it.each([390, 834, 1440])("conserve les mêmes accès fermés et le lien professionnel à %spx", async width => {
    vi.stubGlobal("innerWidth", width)
    state.data = PERSONAL_MEETINGS_CAPABILITIES
    await render()
    expect(state.query).toHaveBeenCalledWith("personal-meetings-capabilities", { networkId: state.networkId })
    expect(container.querySelector("h1")?.textContent).toBe(fr.title)
    expect(container.textContent).toContain(fr.closed.reason)
    expect(container.querySelector('[role="status"]')?.textContent).toBe(fr.status.confirmed)
    expectNoPersonalEntry()
  })

  it("reste fermé avant réponse, sur erreur ou devant une réponse qui prétend ouvrir l'accès", async () => {
    await render()
    expect(container.querySelector('[role="status"]')?.textContent).toBe(fr.status.loading)
    expectNoPersonalEntry()
    state.error = new Error("private internal detail")
    await render()
    expect(container.querySelector('[role="status"]')?.textContent).toBe(fr.status.unavailable)
    expect(container.textContent).not.toContain("private internal detail")
    expectNoPersonalEntry()
    state.error = null; state.data = { ...PERSONAL_MEETINGS_CAPABILITIES, participation: true, discovery: true, interests: true, contact: true }
    await render()
    expect(container.querySelector('[role="status"]')?.textContent).toBe(fr.status.unavailable)
    expectNoPersonalEntry()
  })

  it("explique aussi en anglais la fermeture sans proposer de collecte ou d'inscription", async () => {
    state.data = PERSONAL_MEETINGS_CAPABILITIES
    await render("en")
    expect(container.querySelector("h1")?.textContent).toBe(en.title)
    expect(container.textContent).toContain(en.closed.noCollection)
    expect(container.querySelector("a")?.textContent).toBe(en.professional.link)
    expectNoPersonalEntry()
  })
})
