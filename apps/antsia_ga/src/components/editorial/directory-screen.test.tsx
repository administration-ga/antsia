// @vitest-environment jsdom
import { createAppI18n } from "@antsia/social-features/i18n"
import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ query: vi.fn(), network: { networkId: "network-a", personId: "reader-a" } }))
vi.mock("@antsia/api/engine", () => ({ api: { modules: { editorial: { directory: { list: "editorialDirectory" } } } } }))
vi.mock("@antsia/api/network", () => ({ useNetwork: () => mocks.network }))
vi.mock("@antsia/api/hooks", () => ({ useAuthenticatedConvexQuery: (...args: unknown[]) => mocks.query(...args) }))
vi.mock("@/components/member-chrome", () => ({ MemberPage: ({ children }: { children: ReactNode }) => <main>{children}</main> }))

import { appResources } from "@/i18n/resources"
import { routes } from "@/lib/routes"
import { MemberEditorialDirectory } from "./directory-screen"

const media = { handle: "journal-recette", name: "Journal de recette", description: "Une rédaction indépendante", sections: [{ key: "culture", label: "Culture" }] }
type Page = { page: typeof media[]; isDone: boolean; continueCursor: string; filteredWindow: boolean }
const last: Page = { page: [media], isDone: true, continueCursor: "", filteredWindow: false }
const translator = createAppI18n({ locale: "fr", appResources, defaultNS: "editorial" })
const t = (key: string) => translator.t(`directory.${key}`)
function query(data: Page | undefined, options: { error?: boolean; fetching?: boolean } = {}) {
  return { data, isPending: data === undefined && !options.error, isError: options.error ?? false, isFetching: options.fetching ?? false, error: options.error ? new Error("private failure detail") : null, refetch: vi.fn() }
}
let root: Root, container: HTMLDivElement
async function render() { await act(async () => root.render(<I18nextProvider i18n={translator}><MemberEditorialDirectory /></I18nextProvider>)) }
const button = (key: string) => [...container.querySelectorAll("button")].find(item => item.textContent === t(key))
async function click(item: HTMLElement | undefined) { if (!item) throw new Error("Élément attendu absent"); await act(async () => item.click()) }
const lastArgs = () => mocks.query.mock.calls.at(-1)?.[1]

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  mocks.query.mockReset(); mocks.network = { networkId: "network-a", personId: "reader-a" }
  container = document.createElement("div"); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove() })

describe("MP13 — annuaire lecteur de presse", () => {
  it("rend une seule hiérarchie de lecture, les rubriques et les destinations réelles de lecture/gestion", async () => {
    mocks.query.mockReturnValue(query(last))
    await render()
    expect(container.querySelectorAll("h1")).toHaveLength(1)
    expect(container.querySelector("h1")?.textContent).toBe(t("title"))
    expect(container.querySelector("h2")?.textContent).toBe(media.name)
    expect(container.textContent).toContain(media.description)
    expect(container.querySelector(`ul[aria-label="${t("sections")}"]`)?.textContent).toContain("Culture")
    const links = [...container.querySelectorAll("a")]
    expect(links.find(item => item.textContent === t("view"))?.getAttribute("href")).toBe(routes.memberMedia(media.handle))
    expect(links.find(item => item.textContent === t("myMedia"))?.getAttribute("href")).toBe(routes.mediaHome())
    expect(container.querySelector("ul.grid")?.className).toContain("sm:grid-cols-2 xl:grid-cols-3")
    expect(lastArgs()).toEqual({ networkId: "network-a", readerScope: "reader-a", paginationOpts: { cursor: null, numItems: 12 } })
    expect(container.querySelector("form,input,textarea")).toBeNull()
  })

  it("occupe toute la colonne de l'espace, sans largeur maximale centrée (décision du 22/10/2026)", async () => {
    mocks.query.mockReturnValue(query(last))
    await render()
    const frame = container.querySelector("main > div")
    expect(frame).not.toBeNull()
    expect([...frame!.classList].filter(name => name === "mx-auto" || name.startsWith("max-w-"))).toEqual([])
  })

  it("conserve une continuation après une fenêtre vide filtrée puis revient à la précédente", async () => {
    mocks.query.mockReturnValue(query({ page: [], isDone: false, continueCursor: "page-2", filteredWindow: true }))
    await render()
    expect(container.querySelector('[role="status"]')?.textContent).toBe(t("filteredWindow"))
    await click(button("next"))
    expect(lastArgs().paginationOpts.cursor).toBe("page-2")
    mocks.query.mockReturnValue(query(last)); await render()
    expect(button("next")).toBeUndefined()
    await click(button("previous"))
    expect(lastArgs().paginationOpts.cursor).toBeNull()
  })

  it("distingue le chargement, le vide terminal et la panne sans exposer le cache ou l'erreur privée", async () => {
    mocks.query.mockReturnValue(query(undefined))
    await render()
    expect(container.querySelector('[role="status"]')?.textContent).toBe(t("loading"))
    expect(container.querySelector("article")).toBeNull()
    mocks.query.mockReturnValue(query({ page: [], isDone: true, continueCursor: "", filteredWindow: false })); await render()
    expect(container.querySelector('[role="status"]')?.textContent).toBe(t("empty"))
    expect(button("next")).toBeUndefined()
    const failed = query(last, { error: true })
    mocks.query.mockReturnValue(failed); await render()
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(t("error"))
    expect(container.querySelector("article")).toBeNull()
    expect(container.textContent).not.toContain("private failure detail")
    await click(button("retry")); expect(failed.refetch).toHaveBeenCalledOnce()
  })

  it("masque les anciennes cartes et les actions pendant une relecture même si le cache contient une page", async () => {
    mocks.query.mockReturnValue(query(last, { fetching: true }))
    await render()
    expect(container.querySelector('[role="status"]')?.textContent).toBe(t("loading"))
    expect(container.querySelector("article")).toBeNull()
    expect(button("next")).toBeUndefined()
    mocks.query.mockReturnValue(query({ page: [], isDone: true, continueCursor: "", filteredWindow: false })); await render()
    expect(container.querySelector('[role="status"]')?.textContent).toBe(t("empty"))
  })

  it.each(["personId", "networkId"] as const)("ne reprend ni le curseur ni la portée de cache après un changement de %s", async key => {
    mocks.query.mockReturnValue(query({ page: [], isDone: false, continueCursor: "page-2", filteredWindow: true }))
    await render(); await click(button("next"))
    mocks.network = { ...mocks.network, [key]: `${key}-new` }
    await render()
    expect(lastArgs()).toEqual({ networkId: mocks.network.networkId, readerScope: mocks.network.personId, paginationOpts: { cursor: null, numItems: 12 } })
    expect(button("previous")).toBeUndefined()
  })

  it("échappe le texte reçu et ne crée aucun contenu HTML ou contrôle de rédaction", async () => {
    mocks.query.mockReturnValue(query({ ...last, page: [{ ...media, description: "<script>non exécuté</script>" }] }))
    await render()
    expect(container.querySelector("script")).toBeNull()
    expect(container.textContent).toContain("<script>non exécuté</script>")
    expect(container.querySelector("article button,article input")).toBeNull()
  })
})
