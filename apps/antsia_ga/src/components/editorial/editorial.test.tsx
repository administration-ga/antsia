// @vitest-environment jsdom
import type { api, Id } from "@antsia/api/engine"
import { createAppI18n } from "@antsia/social-features/i18n"
import type { FunctionReturnType } from "convex/server"
import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ network: { networkId: "network-a", personId: "person-a" }, media: null as unknown, editor: null as unknown,
  grants: [] as unknown[], assets: [] as unknown[], assetsDone: true, assetsCursor: "", resolvedAssets: [] as unknown[], history: [] as unknown[], historyDone: true, historyCursor: "", errors: [] as string[], fetching: [] as string[], query: vi.fn(), refetch: vi.fn(), reread: vi.fn(), push: vi.fn(),
  mutations: { saveConfig: vi.fn(), invite: vi.fn(), respond: vi.fn(), revoke: vi.fn(), create: vi.fn(), saveDraft: vi.fn(), submit: vi.fn(), requestChanges: vi.fn(), approve: vi.fn(), publish: vi.fn(), schedule: vi.fn(), cancelSchedule: vi.fn(), withdraw: vi.fn(), uploadUrl: vi.fn(), attach: vi.fn() },
}))
vi.mock("@antsia/api/engine", () => ({ api: { modules: { editorial: {
  media: { myMedia: "media", myManagedMedia: "managed", saveConfig: "saveConfig" }, grants: { list: "grants", myInvitations: "invitations", invite: "invite", respond: "respond", revoke: "revoke" },
  read: { editor: "editor", desk: "desk", history: "history" }, articles: { create: "create", saveDraft: "saveDraft", submit: "submit", requestChanges: "requestChanges", approve: "approve", publish: "publish", schedule: "schedule", cancelSchedule: "cancelSchedule", withdraw: "withdraw" }, assets: { list: "assets", resolve: "resolve", uploadUrl: "uploadUrl", attach: "attach" },
} } } }))
vi.mock("@antsia/api/network", () => ({ useNetwork: () => mocks.network }))
vi.mock("@antsia/api/hooks", () => ({ useAuthenticatedConvexQuery: (reference: string, args: unknown) => {
  mocks.query(reference, args)
  const page = (rows: unknown[]) => ({ page: rows, isDone: true, continueCursor: "", filteredWindow: false })
  const data = () => reference === "media" ? mocks.media : reference === "editor" ? mocks.editor : reference === "grants" || reference === "invitations" ? page(mocks.grants) : reference === "assets" ? { page: mocks.assets, isDone: mocks.assetsDone, continueCursor: mocks.assetsCursor } : reference === "resolve" ? mocks.resolvedAssets : reference === "history" ? { page: mocks.history, isDone: mocks.historyDone, continueCursor: mocks.historyCursor } : page([])
  return { data: args === "skip" ? undefined : data(), isError: mocks.errors.includes(reference), isPending: false, isFetching: mocks.fetching.includes(reference), refetch: async () => { mocks.refetch(reference); return { data: data(), isError: mocks.errors.includes(reference) } } }
} }))
vi.mock("convex/react", () => ({ useConvexAuth: () => ({ isAuthenticated: true }), useMutation: (reference: keyof typeof mocks.mutations) => mocks.mutations[reference] }))
vi.mock("next/navigation", () => ({ useRouter: () => router }))
vi.mock("@antsia/api/sign-out-everywhere", () => ({ isSigningOutEverywhere: () => false }))
vi.mock("@/components/member-chrome", () => ({ MemberPage: ({ children }: { children: ReactNode }) => <main>{children}</main> }))

import { appResources } from "@/i18n/resources"
import { routes } from "@/lib/routes"
import { EditorialArticleEditor, EditorialArticleForm, EditorialImageLibrary } from "./article-editor"
import { EditorialConfigForm, EditorialConfigScreen } from "./config-screen"
import { EditorialCreateArticle, MediaHomeScreen } from "./desk-screen"
import { EditorialGrantCard } from "./team-screen"

type Editor = NonNullable<FunctionReturnType<typeof api.modules.editorial.read.editor>>
type Media = NonNullable<FunctionReturnType<typeof api.modules.editorial.media.myMedia>>
type Grant = FunctionReturnType<typeof api.modules.editorial.grants.list>["page"][number]
const router = { push: mocks.push }
const pageId = "page-a" as Id<"pages">, articleId = "article-a" as Id<"editorialArticles">, grantId = "grant-a" as Id<"editorialGrants">
const permissions = (patch: Partial<Editor["permissions"]> = {}): Editor["permissions"] => ({ canConfigure: false, canManageGrants: false, canGrantPublisher: false, canCreate: true, canEdit: true, canSubmit: true, canRequestChanges: false, canApprove: false, canPublish: false, canSchedule: false, canCancelSchedule: false, canWithdraw: false, ...patch })
const media = (patch: Partial<Media> = {}): Media => ({ mediaId: "media-a" as Id<"editorialMedia">, pageId, handle: "le-journal", name: "Le Journal", revision: 2, description: "Une rédaction", sections: [{ key: "actualite", label: "Actualité" }], visibility: "network", publicConsentTextVersion: null, publicConsentedAt: null, permissions: permissions({ canConfigure: true, canManageGrants: true, canGrantPublisher: true }), ...patch })
const editor = (patch: Partial<Editor> = {}): Editor => ({ articleId, pageId, articleKey: `a-${"a".repeat(32)}`, revision: 2, workingState: "draft", publicationState: "unpublished", workingVersion: { versionId: "version-a" as Id<"editorialVersions">, versionNumber: 1, digest: "a".repeat(64), title: "Une enquête", chapeau: "Introduction", sectionKey: "actualite", sectionLabel: "Actualité", byline: { kind: "media" }, correctionNotice: null, blocks: [{ type: "paragraph", text: "Un article préparé." }], createdAt: 100, moderationStatus: "published" }, publishedVersion: null, scheduledAt: null, reviewNote: null, permissions: permissions(), ...patch })
const grant = (patch: Partial<Grant> = {}): Grant => ({ grantId, pageId, mediaName: "Le Journal", mediaHandle: "le-journal", handle: "auteur.demo", displayName: "Auteur démo", role: "author", state: "invited", revision: 4, invitedAt: 100, acceptedAt: null, bylineConsented: false, isMe: true, canRespond: true, canRevoke: true, authorityLive: true, ...patch })
const result = { articleId, revision: 3, workingState: "draft", publicationState: "unpublished", changed: true }
const i18n = createAppI18n({ locale: "fr", appResources, defaultNS: "editorial" })
let root: Root, container: HTMLDivElement, online: boolean
async function render(children: ReactNode, locale: "fr" | "en" = "fr") { await act(async () => root.render(<I18nextProvider i18n={locale === "fr" ? i18n : createAppI18n({ locale, appResources, defaultNS: "editorial" })}>{children}</I18nextProvider>)) }
async function click(node: Element | null | undefined) { if (!node) throw new Error("Élément de recette absent"); await act(async () => (node as HTMLElement).click()) }
const button = (key: string) => [...container.querySelectorAll("button")].find(node => node.textContent === i18n.t(key))
async function input(name: string, value: string) {
  const node = container.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`[name="${name}"]`)!
  await setInput(node, value)
}
async function setInput(node: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  await act(async () => { const prototype = node instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : node instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(node, value); node.dispatchEvent(new Event("input", { bubbles: true })); node.dispatchEvent(new Event("change", { bubbles: true })) })
}
async function submit(form = container.querySelector("form")!) { await act(async () => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))) }
const writes = () => Object.values(mocks.mutations).reduce((count, fn) => count + fn.mock.calls.length, 0)
beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  online = true; vi.spyOn(navigator, "onLine", "get").mockImplementation(() => online); vi.spyOn(window, "confirm").mockReturnValue(true)
  mocks.network = { networkId: "network-a", personId: "person-a" }; mocks.media = media(); mocks.editor = editor(); mocks.grants = []; mocks.assets = []; mocks.assetsDone = true; mocks.assetsCursor = ""; mocks.resolvedAssets = []; mocks.history = []; mocks.historyDone = true; mocks.historyCursor = ""; mocks.errors = []; mocks.fetching = []
  for (const fn of [...Object.values(mocks.mutations), mocks.query, mocks.refetch, mocks.reread, mocks.push]) fn.mockReset()
  for (const fn of Object.values(mocks.mutations)) fn.mockResolvedValue(result)
  mocks.mutations.saveConfig.mockResolvedValue({ mediaId: "media-a", revision: 3, changed: true }); mocks.mutations.respond.mockResolvedValue({ grantId, revision: 5, state: "accepted", changed: true }); mocks.mutations.revoke.mockResolvedValue({ grantId, revision: 5, state: "revoked", changed: true })
  mocks.mutations.uploadUrl.mockResolvedValue("https://upload.example/guarded"); mocks.mutations.attach.mockResolvedValue({ assetId: "asset-created" })
  mocks.reread.mockImplementation(async () => mocks.editor)
  container = document.createElement("div"); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks() })

describe("MP12 — rédaction et configuration volontaires", () => {
  it("ne crée aucune rédaction, habilitation ou publication à la consultation", async () => {
    await render(<MediaHomeScreen />)
    expect(writes()).toBe(0)
    expect(container.querySelector(`a[href="${routes.myShops()}"]`)).not.toBeNull()
  })
  it("bootstrap revision0 ne préaccorde pas la diffusion publique", async () => {
    const bootstrap = media({ mediaId: null, revision: 0, description: "", sections: [] })
    await render(<EditorialConfigForm media={bootstrap} reread={async () => bootstrap} />)
    await input("visibility", "public"); await submit()
    expect(mocks.mutations.saveConfig).not.toHaveBeenCalled()
    const consent = container.querySelector<HTMLInputElement>('[name="publicConsent"]')!
    expect(consent.checked).toBe(false)
    await click(consent); await submit()
    expect(mocks.mutations.saveConfig).toHaveBeenCalledWith(expect.objectContaining({ expectedRevision: 0, pageId, input: expect.objectContaining({ visibility: "public", publicConsentTextVersion: "2026-10-21-mp12-editorial-public-v1" }) }))
    expect(consent.checked).toBe(false)
  })
  it("modifier configuration publique retire l'accord et conserve la saisie lors d'un conflit", async () => {
    const current = media({ visibility: "public" })
    mocks.mutations.saveConfig.mockRejectedValue({ data: { code: "conflict", field: "expectedRevision" } })
    await render(<EditorialConfigForm media={current} reread={async () => current} />)
    await click(container.querySelector('[name="publicConsent"]')); await input("description", "Ma nouvelle présentation")
    expect(container.querySelector<HTMLInputElement>('[name="publicConsent"]')!.checked).toBe(false)
    await click(container.querySelector('[name="publicConsent"]')); await submit()
    expect(container.querySelector<HTMLTextAreaElement>('[name="description"]')!.value).toBe("Ma nouvelle présentation")
    expect(container.textContent).toContain(i18n.t("errors.conflict"))
    await submit(); expect(mocks.mutations.saveConfig).toHaveBeenCalledOnce()
  })
})

describe("MP12 — article structuré et brouillon réel", () => {
  it("ajoute, réordonne et enregistre les blocs sans publier", async () => {
    await render(<EditorialArticleForm head={editor()} reread={mocks.reread} />)
    await click(button("actions.addBlock")); await input("blocks.1.text", "Deuxième paragraphe")
    const move = [...container.querySelectorAll("button")].find(node => node.getAttribute("aria-label") === i18n.t("blocks.moveUp", { number: 2 }))!
    await click(move); await submit()
    expect(mocks.mutations.saveDraft).toHaveBeenCalledWith(expect.objectContaining({ expectedRevision: 2, input: expect.objectContaining({ blocks: [{ type: "paragraph", text: "Deuxième paragraphe" }, { type: "paragraph", text: "Un article préparé." }] }) }))
    expect(mocks.mutations.publish).not.toHaveBeenCalled(); expect(mocks.mutations.submit).not.toHaveBeenCalled(); expect(mocks.mutations.approve).not.toHaveBeenCalled()
  })
  it("un conflit laisse la saisie intacte et ferme les décisions suivantes", async () => {
    mocks.mutations.saveDraft.mockRejectedValue({ data: { code: "conflict", field: "expectedRevision" } })
    await render(<EditorialArticleForm head={editor()} reread={mocks.reread} />)
    await input("title", "Brouillon à conserver"); await submit()
    expect(container.querySelector<HTMLInputElement>('[name="title"]')!.value).toBe("Brouillon à conserver")
    expect(container.textContent).toContain(i18n.t("errors.conflict"))
    await click(button("actions.submit")); expect(mocks.mutations.submit).not.toHaveBeenCalled()
    await submit(); expect(mocks.mutations.saveDraft).toHaveBeenCalledOnce()
  })
  it("une version reçue en temps réel ne remplace pas les champs modifiés", async () => {
    await render(<EditorialArticleForm head={editor()} reread={mocks.reread} />)
    await input("title", "Saisie locale")
    const fresh = editor({ revision: 3, workingVersion: { ...editor().workingVersion, title: "Version distante" } })
    await render(<EditorialArticleForm head={fresh} reread={mocks.reread} />)
    expect(container.querySelector<HTMLInputElement>('[name="title"]')!.value).toBe("Saisie locale")
    expect(container.textContent).toContain(i18n.t("status.newer"))
  })
  it("l'auteur n'a aucun bouton de publication ou programmation non autorisé", async () => {
    await render(<EditorialArticleForm head={editor()} reread={mocks.reread} />)
    expect(button("actions.publish")).toBeUndefined(); expect(button("actions.approve")).toBeUndefined(); expect(button("actions.schedule")).toBeUndefined()
    expect(writes()).toBe(0)
  })
  it("une correction garde la référence publiée et exige sa notice avant publication", async () => {
    const current = editor()
    const published = { ...current.workingVersion, versionId: "published-version" as Id<"editorialVersions">, versionNumber: 1 }
    const next = editor({ publicationState: "published", publishedVersion: published, workingVersion: { ...current.workingVersion, versionNumber: 2 }, workingState: "approved", permissions: permissions({ canPublish: true, canSchedule: true, canApprove: true }) })
    await render(<EditorialArticleForm head={next} reread={mocks.reread} />)
    expect(container.textContent).toContain(i18n.t("article.publishedVersion", { version: 1 }))
    expect(container.textContent).toContain(i18n.t("workflow.missingCorrection"))
    expect(button("actions.publish")?.disabled).toBe(true)
    await click(button("actions.publish")); expect(mocks.mutations.publish).not.toHaveBeenCalled()
  })
  it("Publier reste un geste confirmé de la révision relue, jamais un effet de la lecture", async () => {
    const head = editor({ workingState: "approved", permissions: permissions({ canPublish: true, canSubmit: false }) })
    await render(<EditorialArticleForm head={head} reread={mocks.reread} />)
    expect(mocks.mutations.publish).not.toHaveBeenCalled()
    await click(button("actions.publish"))
    expect(window.confirm).toHaveBeenCalledWith(i18n.t("workflow.publishConfirm"))
    expect(mocks.mutations.publish).toHaveBeenCalledWith({ networkId: "network-a", articleId, expectedRevision: 2 })
  })
  it("une programmation montre fuseau et instant UTC puis envoie l'instant confirmé", async () => {
    const head = editor({ workingState: "approved", permissions: permissions({ canSchedule: true, canSubmit: false }) })
    await render(<EditorialArticleForm head={head} reread={mocks.reread} />)
    const date = new Date(Date.now() + 2 * 86_400_000); date.setSeconds(0, 0)
    const local = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
    await input("localTime", local)
    expect(container.textContent).toContain(date.toISOString())
    expect(container.textContent).toContain(Intl.DateTimeFormat().resolvedOptions().timeZone)
    const form = container.querySelector<HTMLInputElement>('[name="localTime"]')!.form!
    await submit(form)
    expect(mocks.mutations.schedule).toHaveBeenCalledWith({ networkId: "network-a", articleId, expectedRevision: 2, publishAt: date.getTime() })
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining(date.toISOString()))
  })
  it("seul canCancelSchedule donne accès à l'annulation de programmation", async () => {
    const head = editor({ workingState: "scheduled", scheduledAt: Date.now() + 60_000, permissions: permissions({ canSubmit: false, canSchedule: false, canCancelSchedule: false }) })
    await render(<EditorialArticleForm head={head} reread={mocks.reread} />)
    expect(button("actions.cancelSchedule")).toBeUndefined()
    await render(<EditorialArticleForm head={{ ...head, permissions: { ...head.permissions, canCancelSchedule: true } }} reread={mocks.reread} />)
    await click(button("actions.cancelSchedule"))
    expect(mocks.mutations.cancelSchedule).toHaveBeenCalledWith({ networkId: "network-a", articleId, expectedRevision: 2 })
  })
  it("hors ligne garde le brouillon et exige une relecture au retour", async () => {
    await render(<EditorialArticleForm head={editor()} reread={mocks.reread} />)
    await input("title", "Texte hors ligne")
    await act(async () => { online = false; window.dispatchEvent(new Event("offline")) }); await submit()
    await act(async () => { online = true; window.dispatchEvent(new Event("online")) }); await submit()
    expect(mocks.mutations.saveDraft).not.toHaveBeenCalled()
    expect(container.querySelector<HTMLInputElement>('[name="title"]')!.value).toBe("Texte hors ligne")
  })
  it("ignore un succès tardif après le changement d'acteur", async () => {
    let finish!: (value: unknown) => void
    mocks.mutations.saveDraft.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
    await render(<EditorialArticleEditor articleId={articleId} />)
    await input("title", "Ancienne session"); await submit()
    mocks.network = { networkId: "network-b", personId: "person-b" }; mocks.editor = editor({ workingVersion: { ...editor().workingVersion, title: "Nouvelle session" } })
    await render(<EditorialArticleEditor articleId={articleId} />)
    await act(async () => finish(result))
    expect(container.querySelector<HTMLInputElement>('[name="title"]')!.value).toBe("Nouvelle session")
    expect(container.textContent).not.toContain(i18n.t("article.saved"))
  })
  it.each([390, 820, 1440])("garde les champs structurés et leurs commandes nommées au format %s", async width => {
    Object.defineProperty(window, "innerWidth", { value: width, configurable: true })
    await render(<EditorialArticleEditor articleId={articleId} />)
    expect(container.querySelectorAll("h1")).toHaveLength(1); expect(container.querySelectorAll('[name="title"]')).toHaveLength(1)
    expect([...container.querySelectorAll("button")].every(node => node.textContent?.trim() || node.getAttribute("aria-label"))).toBe(true)
    expect(writes()).toBe(0)
  })
})

describe("MP12 — création incertaine et équipe", () => {
  it("une réponse perdue conserve la même UUID et le même payload pour la reprise volontaire", async () => {
    mocks.mutations.create.mockRejectedValueOnce(new Error("reply lost")).mockResolvedValueOnce(result)
    await render(<EditorialCreateArticle pageId={pageId} />)
    await input("title", "Titre protégé"); await submit()
    expect(container.querySelector<HTMLInputElement>('[name="title"]')!.disabled).toBe(true)
    expect(mocks.mutations.create).toHaveBeenCalledOnce()
    await click(button("desk.retrySameCreate"))
    expect(mocks.mutations.create).toHaveBeenCalledTimes(2)
    expect(mocks.mutations.create.mock.calls[1]![0]).toEqual(mocks.mutations.create.mock.calls[0]![0])
    expect(mocks.mutations.create.mock.calls[0]![0].clientRequestId).toMatch(/^[A-Za-z0-9_-]{16,128}$/u)
    expect(mocks.push).toHaveBeenCalledWith(routes.articleEditor(articleId))
    expect(mocks.mutations.publish).not.toHaveBeenCalled()
  })
  it("nomme le média invité et laisse l'accord de signature distinct et décoché", async () => {
    await render(<EditorialGrantCard grant={grant()} reread={async () => true} />)
    expect(container.textContent).toContain("Le Journal")
    expect(container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(false)
    await click(button("actions.accept"))
    expect(mocks.mutations.respond).toHaveBeenCalledWith({ networkId: "network-a", grantId, expectedRevision: 4, accept: true })
    expect(mocks.mutations.invite).not.toHaveBeenCalled()
  })
  it("l'accord nominatif n'est envoyé qu'après le choix explicite de la personne invitée", async () => {
    await render(<EditorialGrantCard grant={grant()} reread={async () => true} />)
    await click(container.querySelector('input[type="checkbox"]')); await click(button("actions.accept"))
    expect(mocks.mutations.respond).toHaveBeenCalledWith(expect.objectContaining({ bylineConsentTextVersion: "2026-10-21-mp12-editorial-byline-v1" }))
  })
  it("un conflit de réponse garde le contexte et n'exécute pas une décision concurrente", async () => {
    mocks.mutations.respond.mockRejectedValue({ data: { code: "conflict", field: "expectedRevision" } })
    await render(<EditorialGrantCard grant={grant()} reread={async () => true} />)
    await click(button("actions.decline")); await click(button("actions.accept"))
    expect(mocks.mutations.respond).toHaveBeenCalledOnce()
    expect(container.textContent).toContain(i18n.t("errors.conflict"))
    expect(container.textContent).toContain("Le Journal")
  })
})

describe("MP12 — images créditées et garde de délivrance", () => {
  it("n'affiche aucune URL retenue même si une chaîne URL existe dans le DTO", async () => {
    const asset = { assetId: "asset-a", url: "https://images.example/withheld", withheld: "fileScanPending", altText: "Description", credit: "Source" }
    await render(<EditorialImageLibrary pageId={pageId} assets={[asset]} loading={false} unavailable={false} disabled={false} canAdd onAdd={vi.fn()} refresh={async () => true} />)
    expect(container.querySelector("img")).toBeNull(); expect(writes()).toBe(0)
  })
  it("requiert description, crédit et droits avant upload, puis attend les assets relus sans blob local", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ storageId: "storage-a" }), { status: 200 }))
    await render(<EditorialImageLibrary pageId={pageId} assets={[]} loading={false} unavailable={false} disabled={false} canAdd onAdd={vi.fn()} refresh={async () => true} />)
    const file = container.querySelector<HTMLInputElement>('input[type="file"]')!
    await act(async () => { Object.defineProperty(file, "files", { value: [new File(["pixels"], "photo.png", { type: "image/png" })], configurable: true }); file.dispatchEvent(new Event("change", { bubbles: true })) })
    await input("altText", "La rédaction"); await input("credit", "Photographe autorisé"); await submit()
    expect(mocks.mutations.uploadUrl).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled()
    await click(container.querySelector('[name="rightsConsent"]')); await submit()
    expect(mocks.mutations.attach).toHaveBeenCalledWith({ networkId: "network-a", pageId, storageId: "storage-a", mimeType: "image/png", altText: "La rédaction", credit: "Photographe autorisé", rightsConsentTextVersion: "2026-10-21-mp12-editorial-image-v1" })
    expect(container.querySelector("img")).toBeNull()
    expect(container.querySelector<HTMLInputElement>('[name="rightsConsent"]')!.checked).toBe(false)
  })
  it("traduit la rédaction en anglais sans clés techniques", async () => {
    await render(<MediaHomeScreen />, "en")
    expect(container.textContent).toContain("My newsroom"); expect(container.textContent).not.toContain("editorial:")
  })
})

describe("MP12 — historique privé et revalidation par acteur", () => {
  const historyDetails = () => [...container.querySelectorAll("details")].find(node => node.querySelector("summary")?.textContent === i18n.t("history.title"))!
  async function toggleHistory() { await act(async () => { const details = historyDetails(); details.open = !details.open; details.dispatchEvent(new Event("toggle")) }) }
  async function toggleVersion() { await act(async () => { const details = historyDetails().querySelector("details")!; details.open = !details.open; details.dispatchEvent(new Event("toggle")) }) }
  const oldVersion = () => ({ ...editor().workingVersion, versionId: "old-version" as Id<"editorialVersions">, title: "Ancien brouillon privé", blocks: [{ type: "paragraph" as const, text: "Texte de la version ancienne" }] })

  it("ne lit aucune ancienne version tant que le panneau reste fermé", async () => {
    mocks.history = [oldVersion()]
    await render(<EditorialArticleForm head={editor()} reread={mocks.reread} />)
    expect(historyDetails().open).toBe(false)
    expect(mocks.query.mock.calls.filter(call => call[0] === "history").every(call => call[1] === "skip")).toBe(true)
    expect(historyDetails().textContent).not.toContain("Ancien brouillon privé")
    expect(writes()).toBe(0)
  })
  it("ouvre une consultation structurée en lecture seule sans restaurer le brouillon", async () => {
    mocks.history = [oldVersion()]
    await render(<EditorialArticleForm head={editor()} reread={mocks.reread} />)
    await input("title", "Mon brouillon en cours")
    await toggleHistory()
    expect(mocks.query).toHaveBeenCalledWith("history", { networkId: "network-a", articleId, paginationOpts: { cursor: null, numItems: 4 } })
    expect(historyDetails().textContent).not.toContain("Texte de la version ancienne")
    await toggleVersion()
    expect(historyDetails().textContent).toContain("Texte de la version ancienne")
    expect(historyDetails().querySelector("input,textarea,select,form")).toBeNull()
    expect(container.querySelector<HTMLInputElement>('[name="title"]')!.value).toBe("Mon brouillon en cours")
    expect(writes()).toBe(0)
    await toggleHistory()
    expect(mocks.query.mock.calls.filter(call => call[0] === "history").at(-1)?.[1]).toBe("skip")
    expect(historyDetails().textContent).not.toContain("Ancien brouillon privé")
  })
  it("garde la continuation d'une page historique vide et retourne aux versions récentes", async () => {
    mocks.historyDone = false; mocks.historyCursor = "closed-server-history-cursor"
    await render(<EditorialArticleForm head={editor()} reread={mocks.reread} />)
    await toggleHistory(); await click(button("history.next"))
    expect(mocks.query).toHaveBeenCalledWith("history", expect.objectContaining({ paginationOpts: { cursor: mocks.historyCursor, numItems: 4 } }))
    await click(button("history.first"))
    expect(mocks.query.mock.calls.filter(call => call[0] === "history").at(-1)?.[1]).toEqual({ networkId: "network-a", articleId, paginationOpts: { cursor: null, numItems: 4 } })
    expect(writes()).toBe(0)
  })
  it("les images d'une ancienne version gardent la délivrance fermée", async () => {
    const head = editor(), asset = { assetId: "asset-a", url: "https://images.example/retained", withheld: null, altText: "Image ancienne", credit: "Source autorisée" }
    mocks.history = [{ ...oldVersion(), blocks: [{ type: "image", assetId: "asset-a" }] }]; mocks.resolvedAssets = [asset]
    await render(<EditorialArticleForm head={head} reread={mocks.reread} />)
    await toggleHistory()
    expect(mocks.query.mock.calls.filter(call => call[0] === "resolve").every(call => call[1] === "skip")).toBe(true)
    await toggleVersion()
    expect(mocks.query).toHaveBeenCalledWith("resolve", { networkId: "network-a", pageId, assetIds: ["asset-a"] })
    expect(historyDetails().querySelector("img")?.getAttribute("src")).toBe(asset.url)
    mocks.fetching = ["resolve"]
    await render(<EditorialArticleForm head={head} reread={mocks.reread} />)
    expect(historyDetails().querySelector("img")).toBeNull()
    mocks.fetching = []; mocks.resolvedAssets = [{ ...asset, withheld: "fileScanPending" }]
    await render(<EditorialArticleForm head={head} reread={mocks.reread} />)
    expect(historyDetails().querySelector("img")).toBeNull()
    expect(historyDetails().textContent).toContain(i18n.t("images.previewUnavailable"))
    await toggleVersion()
    expect(mocks.query.mock.calls.filter(call => call[0] === "resolve").at(-1)?.[1]).toBe("skip")
  })
  it("un refus ou une revalidation retire le contenu historique mis en cache", async () => {
    mocks.history = [oldVersion()]
    await render(<EditorialArticleForm head={editor()} reread={mocks.reread} />)
    await toggleHistory(); expect(historyDetails().textContent).toContain("Ancien brouillon privé")
    mocks.fetching = ["history"]
    await render(<EditorialArticleForm head={editor()} reread={mocks.reread} />)
    expect(historyDetails().textContent).not.toContain("Ancien brouillon privé")
    mocks.fetching = []; mocks.errors = ["history"]
    await render(<EditorialArticleForm head={editor()} reread={mocks.reread} />)
    expect(historyDetails().textContent).not.toContain("Ancien brouillon privé")
    expect(historyDetails().querySelector('[role="alert"]')).not.toBeNull()
  })
  it("un autre acteur ne voit pas l'éditeur privé ancien pendant sa première revalidation", async () => {
    await render(<EditorialArticleEditor articleId={articleId} />)
    expect(container.querySelector('[name="title"]')).not.toBeNull()
    mocks.network = { networkId: "network-a", personId: "person-b" }; mocks.fetching = ["editor"]
    await render(<EditorialArticleEditor articleId={articleId} />)
    expect(container.querySelector('[name="title"]')).toBeNull()
    expect(container.textContent).not.toContain("Une enquête")
    mocks.fetching = []; mocks.editor = null
    await render(<EditorialArticleEditor articleId={articleId} />)
    expect(container.querySelector('[name="title"]')).toBeNull()
  })
  it("une configuration en cache ne devient pas un formulaire avant sa revalidation initiale", async () => {
    mocks.fetching = ["media"]
    await render(<EditorialConfigScreen pageId={pageId} />)
    expect(container.querySelector('[name="description"]')).toBeNull()
    mocks.fetching = []
    await render(<EditorialConfigScreen pageId={pageId} />)
    expect(container.querySelector('[name="description"]')).not.toBeNull()
    expect(writes()).toBe(0)
  })
})

describe("MP12 — images sélectionnées indépendantes de la bibliothèque", () => {
  const preview = () => container.querySelector(`section[aria-label="${i18n.t("article.preview")}"]`)!
  const selectedHead = () => editor({ workingVersion: { ...editor().workingVersion, blocks: [{ type: "image", assetId: "selected-asset" as Id<"editorialAssets"> }] } })
  const selectedAsset = () => ({ assetId: "selected-asset", url: "https://images.example/selected", withheld: null, altText: "Image sélectionnée", credit: "Photographe autorisé" })

  it("conserve l'image choisie hors de la page courante de la bibliothèque", async () => {
    const head = selectedHead()
    mocks.resolvedAssets = [selectedAsset()]
    mocks.assets = [{ assetId: "other-asset", url: "https://images.example/other", withheld: null, altText: "Autre image", credit: "Autre source" }]
    mocks.assetsDone = false; mocks.assetsCursor = "next-library-page"
    await render(<EditorialArticleForm head={head} reread={mocks.reread} />)
    expect(mocks.query).toHaveBeenCalledWith("resolve", { networkId: "network-a", pageId, assetIds: ["selected-asset"] })
    expect(preview().querySelector("img")?.getAttribute("src")).toBe(selectedAsset().url)
    expect(container.querySelector<HTMLSelectElement>('[name="blocks.0.assetId"]')!.value).toBe("selected-asset")
    mocks.assets = []; mocks.assetsDone = true
    await click(button("images.next"))
    expect(mocks.query).toHaveBeenCalledWith("assets", { networkId: "network-a", pageId, paginationOpts: { cursor: "next-library-page", numItems: 12 } })
    expect(preview().querySelector("img")?.getAttribute("src")).toBe(selectedAsset().url)
    expect(container.querySelector<HTMLSelectElement>('[name="blocks.0.assetId"]')!.selectedOptions[0]?.textContent).toContain("Image sélectionnée")
    expect(writes()).toBe(0)
  })
  it("retire une ancienne URL pendant revalidation, refus et quarantaine sans repli sur la bibliothèque", async () => {
    const head = selectedHead()
    mocks.resolvedAssets = [selectedAsset()]; mocks.assets = [selectedAsset()]
    await render(<EditorialArticleForm head={head} reread={mocks.reread} />)
    expect(preview().querySelector("img")).not.toBeNull()
    mocks.fetching = ["resolve"]
    await render(<EditorialArticleForm head={head} reread={mocks.reread} />)
    expect(preview().querySelector("img")).toBeNull()
    expect(preview().textContent).toContain(i18n.t("images.previewUnavailable"))
    mocks.fetching = []; mocks.errors = ["resolve"]
    await render(<EditorialArticleForm head={head} reread={mocks.reread} />)
    expect(preview().querySelector("img")).toBeNull()
    mocks.errors = []; mocks.resolvedAssets = [{ ...selectedAsset(), withheld: "fileScanPending" }]
    await render(<EditorialArticleForm head={head} reread={mocks.reread} />)
    expect(preview().querySelector("img")).toBeNull()
    expect(preview().textContent).toContain(i18n.t("images.previewUnavailable"))
    expect(writes()).toBe(0)
  })
})
