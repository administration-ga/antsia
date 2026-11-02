// @vitest-environment jsdom
import type { api, Id } from "@antsia/api/engine"
import { createAppI18n } from "@antsia/social-features/i18n"
import type { FunctionReturnType } from "convex/server"
import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ network: { networkId: "network-a", personId: "person-a" }, params: "", search: null as unknown, editor: null as unknown, memberProfile: null as unknown,
  queryError: false, queryPending: false, queryFetching: false, activities: [] as { pageId: string; name: string; handle: string }[],
  query: vi.fn(), refetch: vi.fn(), reread: vi.fn(), save: vi.fn(), state: vi.fn(), propose: vi.fn(), respond: vi.fn(), cancel: vi.fn(), open: vi.fn(), report: vi.fn(), push: vi.fn(), reportDialog: vi.fn(),
}))
vi.mock("@antsia/api/engine", () => ({ api: { modules: { professionals: { profiles: { myProfile: "editor", saveProfile: "save", setState: "state" }, read: { managedActivities: "activities", search: "search", getByHandle: "profile" }, collaborations: { propose: "propose", respond: "respond", cancel: "cancel", listMine: "mine", listIncoming: "incoming" } }, contextualMessaging: { threads: { openForObject: "open" } }, moderation: { cases: { report: "report" } } } } }))
vi.mock("@antsia/api/network", () => ({ useNetwork: () => mocks.network }))
vi.mock("@antsia/api/hooks", () => ({ useAuthenticatedConvexQuery: (reference: string, args: unknown) => {
  mocks.query(reference, args)
  const data = reference === "editor" ? mocks.editor : reference === "profile" ? mocks.memberProfile : reference === "activities" ? { page: mocks.activities, isDone: true, continueCursor: "", filteredWindow: false } : mocks.search
  return { data: args === "skip" ? undefined : data, isPending: mocks.queryPending, isError: mocks.queryError, isFetching: mocks.queryFetching, refetch: mocks.refetch }
} }))
vi.mock("convex/react", () => ({ useConvexAuth: () => ({ isAuthenticated: true }), useMutation: (reference: string) => ({ save: mocks.save, state: mocks.state, propose: mocks.propose, respond: mocks.respond, cancel: mocks.cancel, open: mocks.open, report: mocks.report })[reference] }))
vi.mock("next/navigation", () => ({ useRouter: () => router, useSearchParams: () => new URLSearchParams(mocks.params) }))
vi.mock("@antsia/api/sign-out-everywhere", () => ({ isSigningOutEverywhere: () => false }))
vi.mock("@/components/member-chrome", () => ({ MemberPage: ({ children }: { children: ReactNode }) => <main>{children}</main> }))
vi.mock("@antsia/social-features/features/reseau-personnel/report-content-entry", () => ({ ReportContentDialog: (props: { kind: string; allowNote: boolean; onSubmit: (reason: string, note: string) => Promise<void>; onClose: () => void }) => { mocks.reportDialog(props); return <button onClick={() => { void props.onSubmit("spam", "").then(props.onClose) }}>report-submit</button> } }))

import { appResources } from "@/i18n/resources"
import { routes } from "@/lib/routes"
import { MemberProfessionalDirectory } from "./directory-screen"
import { ProfessionalCollaborationCard } from "./collaborations-screen"
import { ProfessionalEditorForm, ProfessionalProfileEditor } from "./profile-editor"
import { MemberProfessionalProfile } from "./profile-screen"
import { SCREEN_SECTIONS } from "@/components/shared/screen-layout"

type Editor = NonNullable<FunctionReturnType<typeof api.modules.professionals.profiles.myProfile>>
type Profile = NonNullable<FunctionReturnType<typeof api.modules.professionals.read.getByHandle>>
type Collaboration = FunctionReturnType<typeof api.modules.professionals.collaborations.listMine>["page"][number]
const router = { push: mocks.push }
const profileId = "profile-a" as Id<"professionalProfiles">
const collaborationId = "collaboration-a" as Id<"professionalCollaborations">
const editor = (patch: Partial<Editor> = {}): Editor => ({ profileId, revision: 2, state: "draft", title: "Conseil numérique", bio: "Une présentation", skills: ["Design"], languageCodes: ["fr"], zone: "Libreville", availability: "available", collaborationTypes: ["project"], portfolio: [], activityPageIds: [], visibility: "network", publicFields: [], consentTextVersion: "2026-10-21-mp09-professional-profile-v1", consentedAt: 100, publicConsentTextVersion: null, publicConsentAt: null, publicConsentRevokedAt: null, moderationStatus: "published", ...patch })
const memberProfile = (patch: Partial<Profile> = {}): Profile => ({ profileId, revision: 2, handle: "pro.demo", displayName: "Professionnel démo", isMe: false, canPropose: true, visibility: "network", title: "Conseil numérique", bio: "Une présentation", skills: ["Design"], languageCodes: ["fr"], zone: "Libreville", availability: "available", collaborationTypes: ["project"], portfolio: [{ title: "Projet déclaré", description: "Description textuelle" }], activities: [], ...patch })
const collaboration = (patch: Partial<Collaboration> = {}): Collaboration => ({ collaborationId, revision: 7, status: "pending", collaborationType: "project", message: "Une idée de collaboration privée", direction: "received", from: { handle: "from.demo", displayName: "Auteur démo" }, to: { handle: "to.demo", displayName: "Destinataire démo" }, proposedAt: 100, respondedAt: null, cancelledAt: null, updatedAt: 100, acceptedSource: null, canRespond: true, canCancel: false, moderationStatus: "published", ...patch })
const i18n = createAppI18n({ locale: "fr", appResources, defaultNS: "professionals" })
let root: Root, container: HTMLDivElement, online: boolean
async function render(children: ReactNode, locale: "fr" | "en" = "fr") { await act(async () => root.render(<I18nextProvider i18n={locale === "fr" ? i18n : createAppI18n({ locale, appResources, defaultNS: "professionals" })}>{children}</I18nextProvider>)) }
async function click(node: Element | null | undefined) { if (!node) throw new Error("Élément de recette absent"); await act(async () => (node as HTMLElement).click()) }
const button = (key: string) => [...container.querySelectorAll("button")].find(node => node.textContent === i18n.t(key))
const check = (name: string) => container.querySelector<HTMLInputElement>(`input[name="${name}"]`)!
async function input(name: string, value: string) {
  const node = container.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`[name="${name}"]`)!
  await act(async () => { const prototype = node instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : node instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(node, value); node.dispatchEvent(new Event("input", { bubbles: true })); node.dispatchEvent(new Event("change", { bubbles: true })) })
}
async function submit() { await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))) }
beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  online = true; vi.spyOn(navigator, "onLine", "get").mockImplementation(() => online)
  vi.spyOn(window, "confirm").mockReturnValue(true)
  mocks.network = { networkId: "network-a", personId: "person-a" }; mocks.params = ""; mocks.editor = null; mocks.memberProfile = memberProfile(); mocks.activities = []
  mocks.search = { page: [], isDone: true, continueCursor: "", filteredWindow: false }; mocks.queryError = false; mocks.queryPending = false; mocks.queryFetching = false
  for (const fn of [mocks.query, mocks.refetch, mocks.reread, mocks.save, mocks.state, mocks.propose, mocks.respond, mocks.cancel, mocks.open, mocks.report, mocks.push, mocks.reportDialog]) fn.mockReset()
  mocks.reread.mockResolvedValue(editor()); mocks.refetch.mockImplementation(async () => ({ data: mocks.editor, isError: false }))
  mocks.save.mockResolvedValue({ profileId, revision: 3, state: "draft", changed: true }); mocks.state.mockResolvedValue({ profileId, revision: 4, state: "published", changed: true })
  mocks.respond.mockResolvedValue({ collaborationId, revision: 8, status: "accepted", changed: true }); mocks.cancel.mockResolvedValue({ collaborationId, revision: 8, status: "cancelled", changed: true }); mocks.open.mockResolvedValue({ threadId: "thread-live-1", created: false }); mocks.report.mockResolvedValue({ created: true, hidden: true })
  container = document.createElement("div"); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks() })

describe("MP09 — édition et consentements professionnels", () => {
  it("ne crée ni profil ni publication à la consultation, et ne préchoisit aucun champ public", async () => {
    await render(<ProfessionalProfileEditor />)
    expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.state).not.toHaveBeenCalled()
    expect(check("participationConsent").checked).toBe(false)
    await input("visibility", "public")
    expect(check("publicConsent").checked).toBe(false)
    const titleChoice = [...container.querySelectorAll("label")].find(label => label.textContent === i18n.t("publicFields.title"))!.querySelector<HTMLInputElement>("input")!
    expect(titleChoice.checked).toBe(false)
    await input("title", "Mon activité"); await click(check("participationConsent")); await submit()
    expect(mocks.save).not.toHaveBeenCalled()
    await click(check("publicConsent")); await submit()
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ expectedRevision: 0, input: expect.objectContaining({ visibility: "public", publicFields: [], consentTextVersion: "2026-10-21-mp09-professional-profile-v1", publicConsentTextVersion: "2026-10-21-mp09-professional-public-v1" }) }))
    expect(mocks.state).not.toHaveBeenCalled()
    expect(check("publicConsent").checked).toBe(false)
  })
  it("changer le contenu ou les choix publics retire les accords sans effacer le texte", async () => {
    await render(<ProfessionalEditorForm profile={editor({ visibility: "public", publicFields: ["title"] })} reread={mocks.reread} />)
    await click(check("participationConsent")); await click(check("publicConsent"))
    await input("bio", "Nouvelle présentation")
    expect(check("participationConsent").checked).toBe(false); expect(check("publicConsent").checked).toBe(false)
    expect(container.querySelector<HTMLTextAreaElement>('[name="bio"]')!.value).toBe("Nouvelle présentation")
  })
  it("un conflit CAS conserve le vrai brouillon et ne réessaie pas automatiquement", async () => {
    mocks.save.mockRejectedValue({ data: { code: "conflict", field: "expectedRevision" } })
    await render(<ProfessionalEditorForm profile={editor()} reread={mocks.reread} />)
    await input("title", "Saisie conservée"); await click(check("participationConsent")); await submit()
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ expectedRevision: 2 }))
    expect(container.querySelector<HTMLInputElement>('[name="title"]')!.value).toBe("Saisie conservée")
    expect(container.textContent).toContain(i18n.t("errors.conflict"))
    await submit(); expect(mocks.save).toHaveBeenCalledOnce(); expect(mocks.state).not.toHaveBeenCalled()
  })
  it("la relecture temps réel actualise seulement une forme intacte", async () => {
    await render(<ProfessionalEditorForm profile={editor()} reread={mocks.reread} />)
    await render(<ProfessionalEditorForm profile={editor({ revision: 3, title: "Version distante" })} reread={mocks.reread} />)
    expect(container.querySelector<HTMLInputElement>('[name="title"]')!.value).toBe("Version distante")
    await input("title", "Mon brouillon")
    await render(<ProfessionalEditorForm profile={editor({ revision: 4, title: "Encore modifié" })} reread={mocks.reread} />)
    expect(container.querySelector<HTMLInputElement>('[name="title"]')!.value).toBe("Mon brouillon")
    expect(container.textContent).toContain(i18n.t("status.incomingChange"))
  })
  it("enregistrer un profil publié affiche le retrait temporaire et attend la republication", async () => {
    await render(<ProfessionalEditorForm profile={editor({ state: "published" })} reread={mocks.reread} />)
    await input("title", "Nouvelle activité")
    expect(container.textContent).toContain(i18n.t("editor.publishedEdit"))
    await click(check("participationConsent")); await submit()
    expect(mocks.state).not.toHaveBeenCalled()
    expect(container.textContent).toContain(i18n.t("states.draft"))
    expect(button("actions.publish")?.disabled).toBe(true)
    await render(<ProfessionalEditorForm profile={editor({ revision: 3, state: "draft", title: "Nouvelle activité" })} reread={mocks.reread} />)
    await click(button("actions.publish"))
    expect(mocks.state).toHaveBeenCalledWith({ networkId: "network-a", expectedRevision: 3, state: "published" })
  })
  it("hors ligne, conserve la saisie et exige une relecture au retour sans nouvel envoi", async () => {
    await render(<ProfessionalEditorForm profile={editor()} reread={mocks.reread} />)
    await input("title", "Brouillon hors ligne"); await click(check("participationConsent"))
    await act(async () => { online = false; window.dispatchEvent(new Event("offline")) }); await submit()
    expect(mocks.save).not.toHaveBeenCalled(); expect(check("participationConsent").checked).toBe(false)
    await act(async () => { online = true; window.dispatchEvent(new Event("online")) }); await submit()
    expect(mocks.save).not.toHaveBeenCalled()
    expect(container.querySelector<HTMLInputElement>('[name="title"]')!.value).toBe("Brouillon hors ligne")
  })
  it("un changement de personne ignore le succès tardif de l'ancienne forme", async () => {
    let finish!: (value: unknown) => void
    mocks.save.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
    mocks.editor = editor(); await render(<ProfessionalProfileEditor />)
    await input("title", "Ancienne personne"); await click(check("participationConsent")); await submit()
    mocks.network = { networkId: "network-b", personId: "person-b" }; mocks.editor = null
    await render(<ProfessionalProfileEditor />)
    await act(async () => finish({ profileId, revision: 3, state: "draft", changed: true }))
    expect(container.textContent).not.toContain(i18n.t("status.saved"))
    expect(container.querySelector<HTMLInputElement>('[name="title"]')!.value).toBe("")
  })
  it.each([390, 820, 1440])("garde une seule forme et des commandes nommées au format %s", async width => {
    Object.defineProperty(window, "innerWidth", { value: width, configurable: true })
    await render(<ProfessionalProfileEditor />)
    expect(container.querySelectorAll("main")).toHaveLength(1); expect(container.querySelectorAll("h1")).toHaveLength(1); expect(container.querySelectorAll("form")).toHaveLength(1)
    expect([...container.querySelectorAll("button")].every(node => node.textContent?.trim() || node.getAttribute("aria-label"))).toBe(true)
    expect(mocks.save).not.toHaveBeenCalled()
  })
})

describe("MP09 — consultation et URL vivante", () => {
  it("conserve une fenêtre filtrée vide et sa continuation liée dans l'adresse", async () => {
    const cursor = JSON.stringify({ version: 1, scope: "a".repeat(64), cursor: "window-two" })
    mocks.params = "competence=Design&langue=fr"
    mocks.search = { page: [], isDone: false, continueCursor: cursor, filteredWindow: true }
    await render(<MemberProfessionalDirectory />)
    expect(container.textContent).toContain(i18n.t("status.filteredWindow"))
    await click(button("actions.next"))
    expect(mocks.push).toHaveBeenCalledWith(routes.professionals({ skills: ["design"], languageCodes: ["fr"] }, cursor))
    expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.propose).not.toHaveBeenCalled()
  })
  it("un tuple URL invalide ne relance pas la query ni n'affiche ses anciennes cartes", async () => {
    mocks.search = { page: [memberProfile()], isDone: true, continueCursor: "", filteredWindow: false }
    await render(<MemberProfessionalDirectory />)
    expect(container.textContent).toContain("Professionnel démo")
    mocks.params = "zone=Libreville&zone=Port-Gentil"
    await render(<MemberProfessionalDirectory />)
    expect(mocks.query).toHaveBeenLastCalledWith("search", "skip")
    expect(container.textContent).not.toContain("Professionnel démo")
    expect(container.querySelector('[role="alert"]')).not.toBeNull()
  })
  it("le retour à une URL rétablit les filtres canoniques et masque le cache en erreur", async () => {
    mocks.params = "recherche=Design&competence=Conseil&langue=fr&langue=en&collaboration=project&zone=Libreville"
    await render(<MemberProfessionalDirectory />)
    expect(container.querySelector<HTMLInputElement>('[name="query"]')!.value).toBe("design")
    expect(container.querySelector<HTMLInputElement>('[name="skills"]')!.value).toBe("conseil")
    expect(mocks.query).toHaveBeenLastCalledWith("search", expect.objectContaining({ filters: { query: "design", skills: ["conseil"], languageCodes: ["en", "fr"], collaborationTypes: ["project"], zone: "libreville" } }))
    mocks.search = { page: [memberProfile()], isDone: true, continueCursor: "", filteredWindow: false }; mocks.queryError = true
    await render(<MemberProfessionalDirectory />)
    expect(container.textContent).not.toContain("Professionnel démo")
  })
  it("la fiche n'envoie rien à la lecture et un refus serveur ferme le formulaire", async () => {
    await render(<MemberProfessionalProfile handle="pro.demo" />)
    expect(container.textContent).toContain("Projet déclaré")
    expect(container.querySelector("input[type=file],img")).toBeNull()
    expect(mocks.propose).not.toHaveBeenCalled(); expect(mocks.open).not.toHaveBeenCalled()
    mocks.memberProfile = memberProfile({ canPropose: false })
    await render(<MemberProfessionalProfile handle="pro.demo" />)
    expect(container.querySelector("form")).toBeNull()
    mocks.queryError = true; await render(<MemberProfessionalProfile handle="pro.demo" />)
    expect(container.textContent).not.toContain("Projet déclaré")
  })
})

describe("MP09 — annuaire compact", () => {
  it.each([390, 820, 1440])("replie les critères avancés et garde recherche et reset accessibles au format %s", async width => {
    Object.defineProperty(window, "innerWidth", { value: width, configurable: true })
    await render(<MemberProfessionalDirectory />)
    const details = container.querySelector("details")!
    expect(details.open).toBe(false)
    expect(details.querySelector('[name="skills"]')).not.toBeNull()
    expect(details.querySelector('[name="zone"]')).not.toBeNull()
    expect(details.querySelector('[name="availability"]')).not.toBeNull()
    expect(details.contains(container.querySelector('[name="query"]'))).toBe(false)
    expect(details.contains(button("actions.search")!)).toBe(false)
    expect(details.contains(button("actions.clear")!)).toBe(false)
    expect(details.querySelector("summary")?.textContent).toBe(i18n.t("directory.advancedFilters", { count: 0 }))
    expect(container.querySelectorAll("form")).toHaveLength(1)
    expect(mocks.push).not.toHaveBeenCalled()
  })
  it("annonce les critères sélectionnés dans le résumé et conserve le reset visible", async () => {
    mocks.params = "competence=Conseil&competence=Design&langue=fr&langue=en&zone=Libreville&disponibilite=limited&collaboration=project&collaboration=mentoring"
    await render(<MemberProfessionalDirectory />)
    expect(container.querySelector("details")!.open).toBe(false)
    expect(container.querySelector("summary")!.textContent).toBe(i18n.t("directory.advancedFilters", { count: 8 }))
    await click(button("actions.clear"))
    expect(mocks.push).toHaveBeenCalledWith(routes.professionals())
  })
  it.each([
    { label: "l'adresse sans filtre", params: "" },
    { label: "des filtres déjà présents dans l'adresse", params: "recherche=Design&competence=Conseil&langue=fr&langue=en&zone=Libreville&disponibilite=limited&collaboration=project&collaboration=mentoring" },
  ])("efface toutes les saisies non envoyées et les erreurs depuis $label sans attendre une navigation", async ({ params }) => {
    mocks.params = params
    await render(<MemberProfessionalDirectory />)
    const form = container.querySelector("form")!
    const details = container.querySelector("details")!
    await click(details.querySelector("summary"))
    await input("query", "photographie")
    await input("skills", "Design, Conseil")
    await input("zone", "Port-Gentil")
    await input("availability", "unavailable")
    const language = [...details.querySelectorAll("label")].find(label => label.textContent === i18n.t("languages.es"))!.querySelector<HTMLInputElement>("input")!
    const collaborationType = [...details.querySelectorAll("label")].find(label => label.textContent === i18n.t("collaborationTypes.partnership"))!.querySelector<HTMLInputElement>("input")!
    await click(language)
    await click(collaborationType)
    const otherLanguage = details.querySelector<HTMLInputElement>('input[id$="-other-language"]')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(otherLanguage, "fr!")
      otherLanguage.dispatchEvent(new Event("input", { bubbles: true }))
    })
    await click(button("fields.languageEntry"))
    expect(language.checked).toBe(true)
    expect(collaborationType.checked).toBe(true)
    expect(details.open).toBe(true)
    expect(otherLanguage.value).toBe("fr!")
    expect(details.querySelector('[role="alert"]')?.textContent).toBe(i18n.t("validation.language"))
    expect(mocks.push).not.toHaveBeenCalled()

    await click(button("actions.clear"))

    // Le routeur simulé ne change pas l'adresse : le reset ne dépend d'aucun remontage.
    expect(container.querySelector("form")).toBe(form)
    expect(mocks.params).toBe(params)
    for (const name of ["query", "skills", "zone", "availability"]) expect(container.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`)!.value).toBe("")
    expect([...details.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].every(node => !node.checked)).toBe(true)
    expect(otherLanguage.value).toBe("")
    expect(details.open).toBe(false)
    expect(details.querySelector("summary")!.textContent).toBe(i18n.t("directory.advancedFilters", { count: 0 }))
    expect(container.querySelector('[role="alert"]')).toBeNull()
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith(routes.professionals())
    expect(mocks.save).not.toHaveBeenCalled()
    expect(mocks.state).not.toHaveBeenCalled()
    expect(mocks.propose).not.toHaveBeenCalled()
  })
  it("ouvrir puis refermer ne perd ni saisie ni valeurs ni continuation de l'URL", async () => {
    const cursor = JSON.stringify({ version: 1, scope: "a".repeat(64), cursor: "window-two" })
    mocks.params = new URLSearchParams({ recherche: "Design", competence: "Conseil", langue: "fr", curseur: cursor }).toString()
    await render(<MemberProfessionalDirectory />)
    await input("query", "Recherche en attente")
    const details = container.querySelector("details")!
    await click(details.querySelector("summary"))
    expect(details.open).toBe(true)
    await input("skills", "Conseil, Design")
    await click(details.querySelector("summary"))
    expect(details.open).toBe(false)
    expect(container.querySelector<HTMLInputElement>('[name="query"]')!.value).toBe("Recherche en attente")
    expect(container.querySelector<HTMLInputElement>('[name="skills"]')!.value).toBe("Conseil, Design")
    expect(mocks.push).not.toHaveBeenCalled()
    expect(mocks.query).toHaveBeenLastCalledWith("search", expect.objectContaining({ paginationOpts: { cursor, numItems: 12 }, filters: { query: "design", skills: ["conseil"], languageCodes: ["fr"] } }))
    await submit()
    expect(mocks.push).toHaveBeenCalledWith(routes.professionals({ query: "recherche en attente", skills: ["conseil", "design"], languageCodes: ["fr"] }))
  })
  it("rend visible une erreur des critères avancés au lieu de la laisser dans le volet fermé", async () => {
    await render(<MemberProfessionalDirectory />)
    await input("skills", "x".repeat(366))
    expect(container.querySelector("details")!.open).toBe(false)
    await submit()
    expect(container.querySelector("details")!.open).toBe(true)
    expect(container.querySelector("details [role=alert]")).not.toBeNull()
    expect(mocks.push).not.toHaveBeenCalled()
  })
})

describe("MP09 — décisions privées et iCom contextualisé", () => {
  it("une acceptation explicite porte la révision et ne crée aucun message ni permission optimiste", async () => {
    const row = collaboration()
    await render(<ProfessionalCollaborationCard row={row} reread={mocks.reread} />)
    expect(mocks.respond).not.toHaveBeenCalled(); expect(mocks.open).not.toHaveBeenCalled()
    await click(button("actions.accept"))
    expect(mocks.respond).toHaveBeenCalledWith({ networkId: "network-a", collaborationId, expectedRevision: 7, decision: "accepted" })
    expect(button("actions.messages")).toBeUndefined(); expect(mocks.open).not.toHaveBeenCalled()
  })
  it("un conflit de décision reste visible et n'envoie pas de seconde décision", async () => {
    mocks.respond.mockRejectedValue({ data: { code: "conflict", field: "expectedRevision" } })
    await render(<ProfessionalCollaborationCard row={collaboration()} reread={mocks.reread} />)
    await click(button("actions.decline")); await click(button("actions.accept"))
    expect(mocks.respond).toHaveBeenCalledOnce()
    expect(container.textContent).toContain(i18n.t("errors.conflict")); expect(container.textContent).toContain("Une idée de collaboration privée")
    expect(button("actions.reload")).toBeDefined()
  })
  it("la source acceptée ouvre le thread retourné au clic, jamais l'identifiant de collaboration", async () => {
    await render(<ProfessionalCollaborationCard row={collaboration({ status: "accepted", canRespond: false, canCancel: true, acceptedSource: { kind: "professionalCollaboration", id: collaborationId } })} reread={mocks.reread} />)
    expect(mocks.open).not.toHaveBeenCalled()
    await click(button("actions.messages"))
    expect(mocks.open).toHaveBeenCalledWith({ networkId: "network-a", context: { kind: "professionalCollaboration", id: collaborationId } })
    expect(mocks.push).toHaveBeenCalledWith(routes.professionalConversation("thread-live-1"))
    expect(mocks.push.mock.calls[0]?.[0]).not.toContain(String(collaborationId))
  })
  it("une politique fermée ne bascule pas vers la messagerie personnelle", async () => {
    mocks.open.mockRejectedValue(new Error("policy denied"))
    await render(<ProfessionalCollaborationCard row={collaboration({ status: "accepted", canRespond: false, acceptedSource: { kind: "professionalCollaboration", id: collaborationId } })} reread={mocks.reread} />)
    await click(button("actions.messages"))
    expect(mocks.push).not.toHaveBeenCalled(); expect(container.textContent).toContain(i18n.t("collaborations.closedMessaging"))
  })
  it("chaque partie autorisée peut terminer une collaboration acceptée avec sa confirmation propre", async () => {
    await render(<ProfessionalCollaborationCard row={collaboration({ status: "accepted", canRespond: false, canCancel: true })} reread={mocks.reread} />)
    await click(button("actions.end"))
    expect(window.confirm).toHaveBeenCalledWith(i18n.t("collaborations.endConfirm"))
    expect(mocks.cancel).toHaveBeenCalledWith({ networkId: "network-a", collaborationId, expectedRevision: 7 })
  })
  it("la modération en attente n'offre aucune réponse ni source iCom et le signalement ne perd aucune note", async () => {
    await render(<ProfessionalCollaborationCard row={collaboration({ direction: "sent", moderationStatus: "pending_review", canRespond: false, canCancel: true })} reread={mocks.reread} />)
    expect(button("actions.accept")).toBeUndefined(); expect(button("actions.messages")).toBeUndefined(); expect(button("actions.cancel")).toBeDefined()
    await render(<ProfessionalCollaborationCard row={collaboration()} reread={mocks.reread} />)
    await click(button("actions.report"))
    expect(mocks.reportDialog).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "professionalCollaboration", allowNote: false }))
    expect(mocks.report).not.toHaveBeenCalled()
  })
  it("traduit l'espace professionnel en anglais sans identifiant technique affiché", async () => {
    await render(<ProfessionalProfileEditor />, "en")
    expect(container.textContent).toContain("My professional profile")
    expect(container.textContent).not.toContain("professionals:")
  })
})

describe("pleine largeur des écrans de membre (décisions du propriétaire du 22/10/2026)", () => {
  const centering = () => [...(container.querySelector("main > div")?.classList ?? [])].filter(name => name === "mx-auto" || name.startsWith("max-w-"))
  it("l'annuaire, la fiche et l'éditeur occupent toute la colonne ; l'éditeur range ses deux groupes en colonnes responsives", async () => {
    await render(<MemberProfessionalDirectory />)
    expect(container.querySelector("main > div")).not.toBeNull()
    expect(centering()).toEqual([])
    await render(<MemberProfessionalProfile handle="pro.demo" />)
    expect(centering()).toEqual([])
    await render(<ProfessionalProfileEditor />)
    expect(centering()).toEqual([])
    // Le profil d'un côté, réalisations, activités et visibilité de l'autre : deux sections de 28rem au moins.
    const fields = container.querySelector("form > fieldset")
    expect(fields?.className).toContain(SCREEN_SECTIONS)
    expect(fields?.children).toHaveLength(2)
    expect(container.querySelector(`form > fieldset > div > div[class*="16rem"]`)).not.toBeNull()
  })
})
