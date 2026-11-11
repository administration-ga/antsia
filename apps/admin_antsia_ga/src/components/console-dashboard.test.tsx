// @vitest-environment jsdom
import { type Id } from "@antsia/api/engine"
import { createAppI18n } from "@antsia/social-features/i18n"
import { act, cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { getFunctionName, type FunctionReference } from "convex/server"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { appResources } from "@/i18n/resources"
import { routes } from "@/lib/routes"

const mocks = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), onCreated: vi.fn(), onDirty: vi.fn(), success: vi.fn(), error: vi.fn(), networks: [] as unknown[] }))
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }))
vi.mock("./console-operations", async () => {
  const { useState } = await import("react")
  function DraftOperation({ networkId, onDirtyChange, onPendingChange }: { networkId: string; onDirtyChange: (dirty: boolean) => void; onPendingChange?: (pending: boolean) => void }) {
    const [draft, setDraft] = useState("")
    return <div><p data-testid="operation-network">{networkId}</p><label>Operation draft<input value={draft} onChange={(event) => { setDraft(event.target.value); onDirtyChange(Boolean(event.target.value)) }} /></label><button onClick={() => onPendingChange?.(true)}>Start operation</button><button onClick={() => onPendingChange?.(false)}>Finish operation</button></div>
  }
  return { OperationsPanel: ({ networkId, onDirtyChange, onPendingChange }: { networkId?: string; onDirtyChange: (dirty: boolean) => void; onPendingChange?: (pending: boolean) => void }) => networkId ? <DraftOperation key={networkId} networkId={networkId} onDirtyChange={onDirtyChange} onPendingChange={onPendingChange} /> : <p>No admitted network</p> }
})
vi.mock("convex/react", () => ({
  useMutation: (reference: unknown) => getFunctionName(reference as FunctionReference<"mutation">).endsWith(":create") ? mocks.create : mocks.update,
  useQuery: () => mocks.networks,
}))

import { ConsoleDashboard, networkFormSchema, NetworkSettingsForm, parseConsoleFacetSchema, splitConsoleValues } from "./console-dashboard"

const network = {
  _id: "network-one" as Id<"networks">,
  slug: "gabon-network",
  name: "Réseau Gabon",
  kind: "closed" as const,
  membershipPolicy: "open" as const,
  defaultVisibility: "network" as const,
  reachValues: ["national"],
  openCountries: ["GA"],
  theme: "antsia",
  status: "active" as const,
}
function mount(existing?: typeof network, canAdmin = true) {
  const i18n = createAppI18n({ locale: "fr", appResources, defaultNS: "admin" })
  const form = (item?: typeof network) => <I18nextProvider i18n={i18n}><NetworkSettingsForm network={item} canAdmin={canAdmin} onCreated={mocks.onCreated} onDirtyChange={mocks.onDirty} /></I18nextProvider>
  return { ...render(form(existing)), updated: form }
}
async function fillNew() {
  await userEvent.type(screen.getByLabelText(/^Identifiant public/), "gabon-network")
  await userEvent.type(screen.getByLabelText(/^Nom du réseau/), "Réseau Gabon")
  await userEvent.type(screen.getByLabelText(/^Motif de la décision/), "Créer un espace national ouvert")
}

beforeEach(() => { vi.clearAllMocks(); mocks.create.mockResolvedValue("created-network"); mocks.update.mockResolvedValue(null); mocks.networks = [network, { ...network, _id: "network-two", slug: "second-network", name: "Second réseau" }]; window.history.replaceState({}, "", routes.home()) })
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe("console PA7 — validation fermée des réseaux", () => {
  const labels = { invalid: "invalid", facetInvalid: "facet", countryInvalid: "country", reasonRequired: "reason" }
  const valid = { slug: "gabon-network", name: "Réseau", membershipPolicy: "open", defaultVisibility: "network", reachValues: "", openCountries: "", theme: "antsia", managedBy: "generic", facetSchema: "", reason: "Création autorisée" }
  it("accepte un réseau générique sans facette et refuse un motif absent ou un identifiant invalide", () => {
    expect(networkFormSchema(labels).safeParse(valid).success).toBe(true)
    expect(networkFormSchema(labels).safeParse({ ...valid, reason: "" }).success).toBe(false)
    expect(networkFormSchema(labels).safeParse({ ...valid, slug: "double--tiret" }).success).toBe(false)
  })
  it("borne les pays et portées, normalise les listes et n'invente aucun code pays", () => {
    expect(splitConsoleValues("GA, FR, GA\nBE")).toEqual(["GA", "FR", "BE"])
    expect(networkFormSchema(labels).safeParse({ ...valid, openCountries: "GA, fr" }).success).toBe(false)
    expect(networkFormSchema(labels).safeParse({ ...valid, reachValues: Array.from({ length: 50 }, (_, i) => "item" + i).join(",") }).success).toBe(true)
    expect(networkFormSchema(labels).safeParse({ ...valid, reachValues: Array.from({ length: 51 }, (_, i) => "item" + i).join(",") }).success).toBe(false)
  })
  it("refuse les JSON libres, types inconnus et champs dupliqués avant le backend", () => {
    expect(parseConsoleFacetSchema("")).toBeUndefined()
    expect(parseConsoleFacetSchema('{"fields":[]}')).toEqual({ fields: [] })
    expect(parseConsoleFacetSchema('{"fields":[],"private":true}')).toBeNull()
    expect(parseConsoleFacetSchema('{"fields":[{"key":"city","kind":"unsafe","required":false,"defaultVisibility":"network"}]}')).toBeNull()
    const field = { key: "city", kind: "text", required: false, defaultVisibility: "network" }
    expect(parseConsoleFacetSchema(JSON.stringify({ fields: [field, field] }))).toBeNull()
    expect(parseConsoleFacetSchema(JSON.stringify({ fields: Array.from({ length: 25 }, (_, i) => ({ ...field, key: "city" + i })) }))).toBeNull()
  })
})

describe("console PA7 — brouillons et confirmations backend", () => {
  it.each(["success", "failure"] as const)("une réponse %s après départ ne navigue ni n'affiche de toast de l'ancien formulaire", async (result) => {
    let resolve: (value: string) => void = () => undefined
    let reject: (error: Error) => void = () => undefined
    mocks.create.mockImplementationOnce(() => new Promise<string>((done, fail) => { resolve = done; reject = fail }))
    const view = mount()
    await fillNew()
    await userEvent.click(screen.getByRole("button", { name: "Créer un réseau" }))
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1))
    view.unmount()
    await act(async () => { if (result === "success") resolve("created-network"); else reject(new Error("late failure")) })
    expect(mocks.onCreated).not.toHaveBeenCalled()
    expect(mocks.success).not.toHaveBeenCalled()
    expect(mocks.error).not.toHaveBeenCalled()
  })
  it("une création vide place l'erreur sur les champs et n'appelle pas le backend", async () => {
    mount()
    await userEvent.click(screen.getByRole("button", { name: "Créer un réseau" }))
    expect(mocks.create).not.toHaveBeenCalled()
    expect(screen.getByLabelText(/^Identifiant public/).getAttribute("aria-invalid")).toBe("true")
  })
  it("le réseau générique est soumis comme enfant sans tranche DIASPORALE et avec motif", async () => {
    mount()
    await fillNew()
    await userEvent.click(screen.getByRole("button", { name: "Créer un réseau" }))
    await waitFor(() => expect(mocks.onCreated).toHaveBeenCalledWith("created-network"))
    expect(mocks.create).toHaveBeenCalledWith({
      slug: "gabon-network", name: "Réseau Gabon", kind: "closed", membershipPolicy: "open", defaultVisibility: "network",
      reachValues: [], openCountries: [], theme: "antsia", reason: "Créer un espace national ouvert",
    })
    expect(mocks.create.mock.calls[0]?.[0]).not.toHaveProperty("managedBy")
  })
  it("la tranche DIASPORALE n'est posée qu'après un choix explicite", async () => {
    mount()
    await fillNew()
    await userEvent.selectOptions(screen.getByLabelText("Admission du réseau"), "diaspora")
    await userEvent.click(screen.getByRole("button", { name: "Créer un réseau" }))
    await waitFor(() => expect(mocks.create).toHaveBeenCalled())
    expect(mocks.create.mock.calls[0]?.[0].managedBy).toBe("diaspora")
  })
  it("un retour distant ne remplace jamais un brouillon de réglages", async () => {
    const view = mount(network)
    const name = screen.getByLabelText(/^Nom du réseau/) as HTMLInputElement
    await userEvent.clear(name)
    await userEvent.type(name, "Mon brouillon local")
    view.rerender(view.updated({ ...network, name: "Nom reçu du serveur" }))
    expect(name.value).toBe("Mon brouillon local")
    expect(screen.getByRole("status").textContent).toContain("changements non enregistrés")
    expect(mocks.onDirty).toHaveBeenCalledWith(true)
  })
  it("un échec traduit conserve la saisie et permet une nouvelle soumission", async () => {
    mocks.create.mockRejectedValueOnce({ data: { code: "conflict" }, message: "private-provider-detail" })
    mount()
    await fillNew()
    await userEvent.click(screen.getByRole("button", { name: "Créer un réseau" }))
    expect(screen.getByRole("alert").textContent).not.toContain("private-provider-detail")
    expect((screen.getByLabelText(/^Nom du réseau/) as HTMLInputElement).value).toBe("Réseau Gabon")
    expect((screen.getByLabelText(/^Motif de la décision/) as HTMLTextAreaElement).value).toBe("Créer un espace national ouvert")
    expect(mocks.onCreated).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole("button", { name: "Créer un réseau" }))
    await waitFor(() => expect(mocks.onCreated).toHaveBeenCalledTimes(1))
  })
  it("la modification transmet le réseau courant et un motif, jamais un nouveau slug ni managedBy", async () => {
    mount(network)
    await userEvent.type(screen.getByLabelText(/^Motif de la décision/), "Valider les réglages existants")
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer les réglages" }))
    await waitFor(() => expect(mocks.update).toHaveBeenCalled())
    const submitted = mocks.update.mock.calls[0]?.[0]
    expect(submitted.networkId).toBe(network._id)
    expect(submitted.reason).toBe("Valider les réglages existants")
    expect(submitted).not.toHaveProperty("slug")
    expect(submitted).not.toHaveProperty("managedBy")
    expect(screen.getByRole("status").textContent).toContain("ont été enregistrés")
  })
  it("un opérateur en lecture ne voit aucun bouton d'écriture", () => {
    mount(network, false)
    expect(screen.queryByRole("button", { name: "Enregistrer les réglages" })).toBeNull()
    expect(screen.getByLabelText(/^Nom du réseau/).closest("fieldset")?.hasAttribute("disabled")).toBe(true)
  })
})

function mountDashboard() {
  const i18n = createAppI18n({ locale: "fr", appResources, defaultNS: "admin" })
  return render(<I18nextProvider i18n={i18n}><ConsoleDashboard operator={{ personId: "operator-one" as Id<"persons">, displayName: null, role: "platform_operator" }} sessionExit={<button>Sign out mock</button>} /></I18nextProvider>)
}

describe("console PA7 — navigation adressable et brouillons protégés", () => {
  it("restaure uniquement un réseau canonique depuis l'URL et rend la section adressable", async () => {
    window.history.replaceState({}, "", routes.consoleState("teams", network._id))
    mountDashboard()
    expect((await screen.findByTestId("operation-network")).textContent).toBe(network._id)
    expect((screen.getByRole("combobox", { name: "Outils de la console" }) as HTMLSelectElement).value).toBe("teams")
  })
  it("EX-18 (A11Y-05) : une légende traduite, une seule fois en tête des outils, explique l'astérisque des champs obligatoires", async () => {
    window.history.replaceState({}, "", routes.consoleState("teams", network._id))
    mountDashboard()
    const region = await screen.findByRole("region", { name: "Modération : équipes et réglages" })
    const legend = screen.getAllByText("Les champs marqués d’un astérisque (*) sont obligatoires.")
    expect(legend).toHaveLength(1)
    expect(region.firstElementChild).toBe(legend[0])
    expect(legend[0]!.getAttribute("aria-hidden")).toBeNull()
  })
  it("un identifiant forgé ne devient jamais le réseau transmis aux outils", async () => {
    window.history.replaceState({}, "", routes.consoleState("teams", "forged-private-network"))
    mountDashboard()
    await screen.findByText("No admitted network")
    expect(screen.queryByTestId("operation-network")).toBeNull()
    expect(window.location.search).not.toContain("forged-private-network")
    expect(mocks.error).toHaveBeenCalled()
  })
  it("refuser un changement de réseau conserve le périmètre, l'URL et la saisie", async () => {
    window.history.replaceState({}, "", routes.consoleState("teams", network._id))
    mountDashboard()
    await screen.findByTestId("operation-network")
    await userEvent.type(screen.getByLabelText("Operation draft"), "Un brouillon")
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false)
    await userEvent.selectOptions(screen.getByLabelText("Réseau de travail"), "network-two")
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId("operation-network").textContent).toBe(network._id)
    expect((screen.getByLabelText("Operation draft") as HTMLInputElement).value).toBe("Un brouillon")
    expect(new URLSearchParams(window.location.search).get("network")).toBe(network._id)
    confirm.mockReturnValue(true)
    await userEvent.selectOptions(screen.getByLabelText("Réseau de travail"), "network-two")
    expect(screen.getByTestId("operation-network").textContent).toBe("network-two")
    expect((screen.getByLabelText("Operation draft") as HTMLInputElement).value).toBe("")
    expect(new URLSearchParams(window.location.search).get("network")).toBe("network-two")
  })
  it("refuser un changement de section ne démonte pas le formulaire actif", async () => {
    window.history.replaceState({}, "", routes.consoleState("teams", network._id))
    mountDashboard()
    await screen.findByTestId("operation-network")
    await userEvent.type(screen.getByLabelText("Operation draft"), "À conserver")
    vi.spyOn(window, "confirm").mockReturnValue(false)
    await userEvent.click(screen.getByRole("button", { name: "Réseaux" }))
    expect((screen.getByLabelText("Operation draft") as HTMLInputElement).value).toBe("À conserver")
    expect(new URLSearchParams(window.location.search).get("section")).toBe("teams")
  })
  it("un retour historique refusé restaure l'URL courante et conserve le brouillon", async () => {
    window.history.replaceState({}, "", routes.consoleState("teams", network._id))
    mountDashboard()
    await screen.findByTestId("operation-network")
    await userEvent.type(screen.getByLabelText("Operation draft"), "Motif local")
    vi.spyOn(window, "confirm").mockReturnValue(false)
    window.history.replaceState({}, "", routes.consoleState("appeals", "network-two"))
    window.dispatchEvent(new PopStateEvent("popstate"))
    await waitFor(() => expect(new URLSearchParams(window.location.search).get("section")).toBe("teams"))
    expect(screen.getByTestId("operation-network").textContent).toBe(network._id)
    expect((screen.getByLabelText("Operation draft") as HTMLInputElement).value).toBe("Motif local")
  })
  it("les liens vers la santé et la fermeture du document protègent la saisie", async () => {
    window.history.replaceState({}, "", routes.consoleState("teams", network._id))
    mountDashboard()
    await screen.findByTestId("operation-network")
    await userEvent.type(screen.getByLabelText("Operation draft"), "Motif local")
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false)
    const link = screen.getByRole("link", { name: "État du service" })
    const click = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 })
    expect(link.dispatchEvent(click)).toBe(false)
    expect(confirm).toHaveBeenCalled()
    const unload = new Event("beforeunload", { cancelable: true })
    expect(window.dispatchEvent(unload)).toBe(false)
    expect((screen.getByLabelText("Operation draft") as HTMLInputElement).value).toBe("Motif local")
  })
  it("une décision en cours bloque réseau, section, historique et liens même si le départ serait confirmé", async () => {
    window.history.replaceState({}, "", routes.consoleState("teams", network._id))
    mountDashboard()
    await screen.findByTestId("operation-network")
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true)
    await userEvent.click(screen.getByRole("button", { name: "Start operation" }))
    await userEvent.click(screen.getByRole("button", { name: "Recours" }))
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Réseau de travail" }), "network-two")
    expect(screen.getByTestId("operation-network").textContent).toBe(network._id)
    window.history.replaceState({}, "", routes.consoleState("appeals", "network-two"))
    window.dispatchEvent(new PopStateEvent("popstate"))
    await waitFor(() => expect(new URLSearchParams(window.location.search).get("section")).toBe("teams"))
    const click = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 })
    expect(screen.getByRole("link", { name: "État du service" }).dispatchEvent(click)).toBe(false)
    expect(confirm).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole("button", { name: "Finish operation" }))
    await userEvent.click(screen.getByRole("button", { name: "Recours" }))
    await waitFor(() => expect(new URLSearchParams(window.location.search).get("section")).toBe("appeals"))
  })
})
