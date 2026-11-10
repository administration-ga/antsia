// @vitest-environment jsdom
import type { api, Id } from "@antsia/api/engine"
import { createAppI18n } from "@antsia/social-features/i18n"
import type { FunctionReturnType } from "convex/server"
import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ network: { networkId: "network-a", personId: "person-a" }, authenticated: true, context: null as unknown, article: null as unknown, errors: [] as string[], fetching: [] as string[], query: vi.fn(), refetch: vi.fn(), announce: vi.fn(), discussion: vi.fn(), report: vi.fn(), reportDialog: vi.fn(), clipboard: vi.fn() }))
vi.mock("@antsia/api/engine", () => ({ api: { modules: { editorial: { social: { context: "context", announce: "announce", setDiscussion: "discussion" }, read: { article: "article", media: "media" } }, moderation: { cases: { report: "report" } } } } }))
vi.mock("@antsia/api/network", () => ({ useNetwork: () => mocks.network }))
vi.mock("@antsia/api/hooks", () => ({ useAuthenticatedConvexQuery: (reference: string, args: unknown) => {
  mocks.query(reference, args)
  return { data: args === "skip" ? undefined : reference === "context" ? mocks.context : mocks.article, isPending: false, isFetching: mocks.fetching.includes(reference), isError: mocks.errors.includes(reference), refetch: () => mocks.refetch(reference) }
} }))
vi.mock("convex/react", () => ({ useConvexAuth: () => ({ isAuthenticated: mocks.authenticated }), useMutation: (reference: "announce" | "discussion" | "report") => mocks[reference] }))
vi.mock("@antsia/api/sign-out-everywhere", () => ({ isSigningOutEverywhere: () => false }))
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }))
vi.mock("@/components/member-chrome", () => ({ MemberPage: ({ children }: { children: ReactNode }) => <main>{children}</main> }))
vi.mock("./site-content", () => ({ EditorialArticleContent: ({ article }: { article: { title: string } }) => <article><h1>{article.title}</h1></article>, EditorialMediaContent: () => null }))
vi.mock("@antsia/social-features/features/reseau-personnel/report-content-entry", () => ({ ReportContentDialog: (props: { kind: string; allowNote: boolean; onSubmit: (reason: string, note: string) => Promise<void>; onClose: () => void }) => { mocks.reportDialog(props); return <button onClick={() => { void props.onSubmit("spam", "").then(props.onClose).catch(() => {}) }}>report-submit</button> } }))

import { appResources } from "@/i18n/resources"
import { browserAppPath } from "@/lib/app-path"
import { routes } from "@/lib/routes"
import { ArticleSocialActions } from "./article-social-actions"
import { MemberArticleScreen, MemberMediaScreen } from "./member-reading"

type Context = NonNullable<FunctionReturnType<typeof api.modules.editorial.social.context>>
type MemberArticle = NonNullable<FunctionReturnType<typeof api.modules.editorial.read.article>>
const articleId = "article-a" as Id<"editorialArticles">, versionId = "version-a" as Id<"editorialVersions">, postId = "post-a" as Id<"posts">
const articleKey = `a-${"a".repeat(32)}`, handle = "le-journal"
const context = (patch: Partial<Context> = {}): Context => ({ articleId, versionId, postId: null, commentsEnabled: false, revision: 0, canAnnounce: false, canManageComments: false, discussionAvailable: false, ...patch })
const article = (): MemberArticle => ({ versionId, articleKey, mediaHandle: handle, mediaName: "Le Journal", title: "Une enquête publiée", chapeau: "Introduction", sectionKey: null, sectionLabel: null, byline: { label: "La rédaction", handle: null }, correctionNotice: null, blocks: [{ type: "paragraph", text: "Texte publié" }], versionNumber: 1, publishedAt: 100, updatedAt: 100 })
const i18n = createAppI18n({ locale: "fr", appResources, defaultNS: "editorialPublic" })
let root: Root, container: HTMLDivElement, online: boolean
const surface = () => <ArticleSocialActions handle={handle} articleKey={articleKey} versionId={versionId} />
async function render(children: ReactNode = surface(), locale: "fr" | "en" = "fr") { await act(async () => root.render(<I18nextProvider i18n={locale === "fr" ? i18n : createAppI18n({ locale, appResources, defaultNS: "editorialPublic" })}>{children}</I18nextProvider>)) }
async function click(node: Element | null | undefined) { if (!node) throw new Error("Élément de recette absent"); await act(async () => (node as HTMLElement).click()) }
const button = (key: string) => [...container.querySelectorAll("button")].find(node => node.textContent === i18n.t(key))
const confirmation = () => container.querySelector<HTMLInputElement>('[name="socialConfirmation"]')!
const writes = () => mocks.announce.mock.calls.length + mocks.discussion.mock.calls.length + mocks.report.mock.calls.length
async function confirm(key: string) { await click(button(key)); await click(confirmation()); await click(button("confirm")) }
beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  online = true; vi.spyOn(navigator, "onLine", "get").mockImplementation(() => online)
  Object.defineProperty(navigator, "clipboard", { value: { writeText: mocks.clipboard }, configurable: true })
  mocks.network = { networkId: "network-a", personId: "person-a" }; mocks.authenticated = true; mocks.context = context(); mocks.article = article(); mocks.errors = []; mocks.fetching = []
  for (const fn of [mocks.query, mocks.refetch, mocks.announce, mocks.discussion, mocks.report, mocks.reportDialog, mocks.clipboard]) fn.mockReset()
  mocks.refetch.mockImplementation(async (reference: string) => ({ data: reference === "context" ? mocks.context : mocks.article, isError: mocks.errors.includes(reference) }))
  mocks.announce.mockResolvedValue({ postId, revision: 1, commentsEnabled: false, created: true }); mocks.discussion.mockResolvedValue({ postId, revision: 4, commentsEnabled: true, changed: true }); mocks.report.mockResolvedValue({ created: true }); mocks.clipboard.mockResolvedValue(undefined)
  container = document.createElement("div"); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks() })

describe("MP13 — partage membre et contexte publié", () => {
  it("consulte les options sans annoncer ni ouvrir une discussion automatiquement", async () => {
    await render()
    expect(mocks.query).toHaveBeenCalledWith("context", { networkId: "network-a", readerScope: "person-a", handle, articleKey })
    expect(writes()).toBe(0)
    expect(button("shareInFeed")).toBeUndefined()
    expect(container.querySelector(`a[href="${routes.page(handle)}"]`)).not.toBeNull()
    expect(container.textContent).toContain(i18n.t("noDiscussion"))
  })
  it("copie exclusivement le chemin membre canonique sans supposer un droit public", async () => {
    await render(); await click(button("copy"))
    expect(mocks.clipboard).toHaveBeenCalledWith(new URL(browserAppPath(routes.memberArticle(handle, articleKey)), window.location.origin).href)
    expect(container.textContent).toContain(i18n.t("copied")); expect(writes()).toBe(0)
  })
  it("dit une copie impossible sans présumer un partage réussi", async () => {
    mocks.clipboard.mockRejectedValue(new Error("clipboard unavailable"))
    await render(); await click(button("copy"))
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(i18n.t("copyError"))
  })
  it.each(["fetching", "error", "refused", "different_version"])("retire tous les anciens liens si le contexte est %s", async state => {
    mocks.context = context({ postId, revision: 3, discussionAvailable: true })
    await render(); expect(container.querySelector(`a[href="${routes.memberPost(postId)}"]`)).not.toBeNull()
    if (state === "fetching") mocks.fetching = ["context"]
    if (state === "error") mocks.errors = ["context"]
    if (state === "refused") mocks.context = null
    if (state === "different_version") mocks.context = context({ versionId: "version-new" as Id<"editorialVersions"> })
    await render()
    expect(container.querySelector("a")).toBeNull(); expect(button("copy")).toBeUndefined(); expect(writes()).toBe(0)
  })
  it("ne réutilise pas une confirmation après changement de personne ou de réseau", async () => {
    mocks.context = context({ canAnnounce: true })
    await render(); await click(button("shareInFeed")); await click(confirmation())
    mocks.network = { networkId: "network-b", personId: "person-b" }; mocks.fetching = ["context"]
    await render()
    expect(mocks.query).toHaveBeenCalledWith("context", { networkId: "network-b", readerScope: "person-b", handle, articleKey })
    expect(confirmation()).toBeNull(); expect(container.querySelector("a")).toBeNull()
    mocks.fetching = []; await render(); await click(button("shareInFeed"))
    expect(confirmation().checked).toBe(false); expect(writes()).toBe(0)
  })
  it("monte les actions sous la version publiée relue et les retire avec cette lecture", async () => {
    await render(<MemberArticleScreen handle={handle} articleKey={articleKey} />)
    expect(mocks.query).toHaveBeenCalledWith("article", { networkId: "network-a", readerScope: "person-a", handle, articleKey })
    expect(container.querySelector("h1")?.textContent).toBe("Une enquête publiée")
    expect(button("copy")).not.toBeUndefined()
    mocks.fetching = ["article"]; await render(<MemberArticleScreen handle={handle} articleKey={articleKey} />)
    expect(container.querySelector("h1")).toBeNull(); expect(button("copy")).toBeUndefined(); expect(writes()).toBe(0)
  })
})

describe("MP13 — annonce volontaire et discussion unique", () => {
  it("n'annonce qu'après une confirmation décochée par défaut, à la révision courante", async () => {
    mocks.context = context({ canAnnounce: true })
    await render(); await click(button("shareInFeed"))
    expect(confirmation().checked).toBe(false); expect(button("confirm")?.disabled).toBe(true)
    await click(button("confirm")); expect(mocks.announce).not.toHaveBeenCalled()
    await click(confirmation()); await click(button("confirm"))
    expect(mocks.announce).toHaveBeenCalledExactlyOnceWith({ networkId: "network-a", articleId, expectedVersionId: versionId, expectedRevision: 0 })
    expect(mocks.discussion).not.toHaveBeenCalled(); expect(mocks.refetch).toHaveBeenCalledWith("context")
    expect(container.querySelector(`a[href="${routes.memberPost(postId)}"]`)).toBeNull()
    mocks.context = context({ postId, revision: 1, discussionAvailable: true, canManageComments: true })
    await render()
    expect(container.querySelectorAll(`a[href="${routes.memberPost(postId)}"]`)).toHaveLength(1)
    expect(container.textContent).toContain(i18n.t("commentsClosed")); expect(button("shareInFeed")).toBeUndefined()
  })
  it("annuler la confirmation ne publie rien et ne conserve pas son accord", async () => {
    mocks.context = context({ canAnnounce: true })
    await render(); await click(button("shareInFeed")); await click(confirmation()); await click(button("cancel"))
    expect(confirmation()).toBeNull(); await click(button("shareInFeed"))
    expect(confirmation().checked).toBe(false); expect(writes()).toBe(0)
  })
  it("ne recrée jamais une publication retirée même si son identifiant reste connu", async () => {
    mocks.context = context({ postId, revision: 3, discussionAvailable: false, canAnnounce: true, canManageComments: true })
    await render()
    expect(container.textContent).toContain(i18n.t("discussionUnavailable"))
    expect(button("shareInFeed")).toBeUndefined(); expect(button("restoreDiscussion")).toBeUndefined()
    expect(container.querySelector(`a[href="${routes.memberPost(postId)}"]`)).toBeNull(); expect(writes()).toBe(0)
  })
  it("ferme puis rouvre les commentaires du même post après des confirmations distinctes", async () => {
    mocks.context = context({ postId, revision: 3, commentsEnabled: true, discussionAvailable: true, canManageComments: true })
    await render(); await confirm("closeDiscussion")
    expect(mocks.discussion).toHaveBeenCalledWith({ networkId: "network-a", articleId, expectedVersionId: versionId, expectedRevision: 3, enabled: false })
    mocks.context = context({ postId, revision: 4, commentsEnabled: false, discussionAvailable: true, canManageComments: true })
    await render(); await click(button("restoreDiscussion"))
    expect(confirmation().checked).toBe(false); await click(confirmation()); await click(button("confirm"))
    expect(mocks.discussion).toHaveBeenLastCalledWith({ networkId: "network-a", articleId, expectedVersionId: versionId, expectedRevision: 4, enabled: true })
    expect(mocks.announce).not.toHaveBeenCalled()
  })
  it("un lecteur n'obtient pas les commandes de gestion par la présence d'une discussion", async () => {
    mocks.context = context({ postId, revision: 3, discussionAvailable: true, commentsEnabled: true })
    await render()
    expect(container.querySelector(`a[href="${routes.memberPost(postId)}"]`)).not.toBeNull()
    expect(button("closeDiscussion")).toBeUndefined(); expect(button("shareInFeed")).toBeUndefined(); expect(writes()).toBe(0)
  })
  it.each([new Error("reply lost"), { data: { code: "conflict", field: "expectedRevision" } }, { data: { code: "conflict", field: "expectedVersionId" } }])("une erreur garde les gestes fermés jusqu'à la relecture volontaire", async error => {
    mocks.context = context({ canAnnounce: true }); mocks.announce.mockRejectedValue(error)
    await render(); await confirm("shareInFeed")
    expect(container.textContent).toContain(i18n.t("socialError")); expect(button("shareInFeed")?.disabled).toBe(true)
    await render(); await click(button("shareInFeed")); expect(mocks.announce).toHaveBeenCalledOnce()
    expect(mocks.refetch).not.toHaveBeenCalled()
    await click(button("socialRefresh")); expect(mocks.refetch).toHaveBeenCalledWith("context")
    expect(mocks.announce).toHaveBeenCalledOnce()
    await click(button("shareInFeed")); expect(confirmation().checked).toBe(false)
  })
  it("un changement de révision retire l'accord avant de poursuivre", async () => {
    mocks.context = context({ postId, revision: 3, discussionAvailable: true, commentsEnabled: true, canManageComments: true })
    await render(); await click(button("closeDiscussion")); await click(confirmation())
    mocks.context = context({ postId, revision: 4, discussionAvailable: true, commentsEnabled: true, canManageComments: true })
    await render(); expect(confirmation()).toBeNull(); await click(button("closeDiscussion"))
    expect(confirmation().checked).toBe(false); expect(writes()).toBe(0)
  })
  it("une correction publiée sans changement de révision sociale exige sa nouvelle version et un nouvel accord", async () => {
    mocks.context = context({ canAnnounce: true })
    await render(); await click(button("shareInFeed")); await click(confirmation())
    const correctedVersion = "version-corrected" as Id<"editorialVersions">
    mocks.context = context({ canAnnounce: true, versionId: correctedVersion, revision: 0 })
    await render()
    expect(confirmation()).toBeNull(); expect(button("shareInFeed")).toBeUndefined(); expect(writes()).toBe(0)
    await render(<ArticleSocialActions handle={handle} articleKey={articleKey} versionId={correctedVersion} />)
    await click(button("shareInFeed")); expect(confirmation().checked).toBe(false)
    await click(confirmation()); await click(button("confirm"))
    expect(mocks.announce).toHaveBeenCalledExactlyOnceWith({ networkId: "network-a", articleId, expectedVersionId: correctedVersion, expectedRevision: 0 })
  })
  it("ignore la réponse d'une ancienne personne sans relecture ni état de succès", async () => {
    let finish!: (value: unknown) => void
    mocks.context = context({ canAnnounce: true }); mocks.announce.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
    await render(); await confirm("shareInFeed")
    mocks.network = { networkId: "network-a", personId: "person-b" }; mocks.context = context()
    await render(); await act(async () => finish({ postId, revision: 1, commentsEnabled: false, created: true }))
    expect(mocks.refetch).not.toHaveBeenCalled(); expect(container.textContent).not.toContain(i18n.t("socialError"))
    expect(container.querySelector(`a[href="${routes.memberPost(postId)}"]`)).toBeNull()
  })
})

describe("MP13 — signalement, session et ergonomie", () => {
  it("signale la version publiée corrélée sans transporter de précision libre", async () => {
    await render(); await click(button("report"))
    expect(mocks.reportDialog).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "editorialVersion", allowNote: false }))
    await click([...container.querySelectorAll("button")].find(node => node.textContent === "report-submit"))
    expect(mocks.report).toHaveBeenCalledExactlyOnceWith({ networkId: "network-a", target: { kind: "editorialVersion", id: versionId }, reason: "spam" })
    expect(button("reported")?.disabled).toBe(true)
    expect(mocks.announce).not.toHaveBeenCalled(); expect(mocks.discussion).not.toHaveBeenCalled()
  })
  it("retire un dialogue de signalement quand la version visible change", async () => {
    await render(); await click(button("report"))
    await render(<ArticleSocialActions handle={handle} articleKey={articleKey} versionId={"another-version" as Id<"editorialVersions">} />)
    expect([...container.querySelectorAll("button")].some(node => node.textContent === "report-submit")).toBe(false)
    expect(mocks.report).not.toHaveBeenCalled()
  })
  it("un aller-retour hors ligne invalide la confirmation sans aucun renvoi automatique", async () => {
    mocks.context = context({ canAnnounce: true })
    await render(); await click(button("shareInFeed")); await click(confirmation())
    await act(async () => { online = false; window.dispatchEvent(new Event("offline")) })
    expect(container.querySelector("a")).toBeNull(); expect(confirmation()).toBeNull()
    await act(async () => { online = true; window.dispatchEvent(new Event("online")) })
    await click(button("shareInFeed")); expect(confirmation().checked).toBe(false); expect(writes()).toBe(0)
  })
  it("une session déconnectée ne conserve aucun lien d'action", async () => {
    await render(); mocks.authenticated = false; await render()
    expect(container.querySelector("a")).toBeNull(); expect(button("copy")).toBeUndefined()
    expect(mocks.query.mock.calls.filter(call => call[0] === "context").at(-1)?.[1]).toBe("skip")
  })
  it("la lecture d'une une distingue le lecteur dans la clé de requête", async () => {
    mocks.article = null
    await render(<MemberMediaScreen handle={handle} />)
    expect(mocks.query).toHaveBeenCalledWith("media", expect.objectContaining({ networkId: "network-a", readerScope: "person-a", handle }))
    expect(writes()).toBe(0)
  })
  it.each([390, 820, 1440])("garde des commandes nommées et une confirmation utilisable au format %s", async width => {
    Object.defineProperty(window, "innerWidth", { value: width, configurable: true })
    mocks.context = context({ canAnnounce: true })
    await render(); await click(button("shareInFeed"))
    expect([...container.querySelectorAll("button")].every(node => node.textContent?.trim() || node.getAttribute("aria-label"))).toBe(true)
    expect(container.querySelector('[role="group"]')?.getAttribute("aria-labelledby")).toBeTruthy()
    expect(confirmation().closest("label")?.textContent).toContain(i18n.t("socialConfirmChoice")); expect(writes()).toBe(0)
  })
  it("traduit les nouveaux contrôles en anglais", async () => {
    await render(surface(), "en")
    expect(container.textContent).toContain("Copy article link"); expect(container.textContent).toContain("View the media’s social page")
    expect(container.textContent).not.toContain("editorialPublic:")
  })
})
