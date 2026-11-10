// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, type AnchorHTMLAttributes } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { Id } from "@antsia/api/engine"
import { ArticlePostSlot } from "./article-post-slot"

const state = vi.hoisted(() => ({ personId: "reader-a", result: { data: null as null | { handle: string; articleKey: string; title: string; excerpt: string; sectionLabel: string | null; publishedAt: number }, isPending: false, isFetching: false, isError: false }, calls: [] as unknown[] }))
vi.mock("@antsia/api/engine", () => ({ api: { modules: { editorial: { social: { card: "card" } } } } }))
vi.mock("@antsia/api/network", () => ({ useNetwork: () => ({ personId: state.personId }) }))
vi.mock("@antsia/api/hooks", () => ({ useAuthenticatedConvexQuery: (_ref: unknown, args: unknown) => { state.calls.push(args); return state.result } }))
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { resolvedLanguage: "fr" } }) }))
vi.mock("next/link", () => ({ default: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} /> }))
const props = { networkId: "network" as Id<"networks">, postId: "post" as Id<"posts"> }
beforeEach(() => { state.personId = "reader-a"; state.calls = []; state.result = { data: { handle: "journal", articleKey: "a-article", title: "Titre publié", excerpt: "Chapeau actuel", sectionLabel: "Culture", publishedAt: 1 }, isPending: false, isFetching: false, isError: false } })
let host: HTMLDivElement
let root: Root
beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement("div"); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove() })
async function paint() { await act(async () => { root.render(<ArticlePostSlot {...props} />) }) }
function link(name: string) { return [...host.querySelectorAll("a")].find(element => element.textContent?.trim() === name) }

describe("MP13 aperçu de la version publiée", () => {
  it("ouvre l'article et sa seule discussion, avec une clé de lecture personnelle", async () => {
    await paint()
    expect(link("Titre publié")?.getAttribute("href")).toBe("/media/journal/articles/a-article")
    expect(link("discuss")?.getAttribute("href")).toContain("post=post")
    expect(state.calls.at(-1)).toEqual({ ...props, readerScope: "reader-a" })
  })
  it("retire l'ancien titre pendant revalidation, refus et retrait", async () => {
    await paint()
    state.result.isFetching = true
    await paint()
    expect(host.textContent).not.toContain("Titre publié")
    expect(host.querySelector("a")).toBeNull()
    state.result.isFetching = false; state.result.isError = true
    await paint()
    expect(host.querySelector("a")).toBeNull()
    expect(host.textContent?.includes("previewUnavailable")).toBeTruthy()
    state.result.isError = false; state.result.data = null
    await paint()
    expect(host.querySelector("a")).toBeNull()
  })
  it("change le périmètre de cache avec le lecteur et ne garde aucun lien en attente", async () => {
    await paint()
    state.personId = "reader-b"; state.result.isPending = true
    await paint()
    expect(state.calls.at(-1)).toEqual({ ...props, readerScope: "reader-b" })
    expect(host.textContent).not.toContain("Titre publié")
    expect(host.querySelector("a")).toBeNull()
  })
})
