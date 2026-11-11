// @vitest-environment jsdom
/**
 * PF-01 — le menu « … » de la fiche d'autrui : sourdine à bascule (état lu, jamais
 * deviné), blocage confirmé puis retour au volet Relations, clavier du menu.
 */
import type { Id } from "@antsia/api/engine"
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react"
import { getFunctionName } from "convex/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { reseauAgentHref } from "../../shell/reseau-agent-nav"
import { memoryRouter, renderWithEngine, TEST_NETWORK_ID, TEST_ROUTES } from "../../tests/engine-wrapper"

const mocks = vi.hoisted(() => ({
  muted: undefined as boolean | undefined,
  queries: [] as { name: string; args: unknown }[],
  mutations: {} as Record<string, ReturnType<typeof vi.fn>>,
  success: vi.fn(),
  error: vi.fn(),
}))

vi.mock("@antsia/api/hooks", () => ({
  useAuthenticatedConvexQuery: (ref: never, args: unknown) => {
    const name = getFunctionName(ref)
    mocks.queries.push({ name, args })
    if (name !== "modules/marks/marks:isAuthorMuted") throw new Error(`Lecture inattendue : ${name}`)
    return { data: mocks.muted, isPending: mocks.muted === undefined, isError: false, refetch: vi.fn() }
  },
}))
vi.mock("convex/react", () => ({
  useMutation: (ref: never) => {
    const name = getFunctionName(ref)
    return (mocks.mutations[name] ??= vi.fn(async () => null))
  },
}))
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }))

import { ProfileOverflowMenu } from "./ProfileOverflowMenu"

const TARGET = "persons_awa" as Id<"persons">
const trigger = () => screen.getByRole("button", { name: "Autres actions sur le profil de Awa NDONG" })

function show() {
  const router = memoryRouter()
  renderWithEngine(<ProfileOverflowMenu targetPersonId={TARGET} handle="awa" displayName="Awa NDONG" />, { router: router.implementation })
  return router
}

beforeEach(() => {
  mocks.muted = false
  mocks.queries = []
  for (const key of Object.keys(mocks.mutations)) delete mocks.mutations[key]
  mocks.success.mockReset()
  mocks.error.mockReset()
})
afterEach(cleanup)

describe("ProfileOverflowMenu — ce qu'il propose", () => {
  it("lit MA sourdine pour cette personne dans ce réseau, et rien d'autre", () => {
    show()
    expect(mocks.queries).toEqual([{ name: "modules/marks/marks:isAuthorMuted", args: { networkId: TEST_NETWORK_ID, targetPersonId: TARGET } }])
  })

  it("ouvre le menu, focus sur la première entrée : sourdine, blocage, puis le signalement en dernier", () => {
    show()
    fireEvent.click(trigger())
    const menu = screen.getByRole("menu", { name: "Actions sur le profil de Awa NDONG" })
    const items = within(menu).getAllByRole("menuitem")
    expect(items.map((item) => item.querySelector(".pp-of-label")?.textContent)).toEqual(["Mettre en sourdine", "Bloquer @awa", "Signaler le profil"])
    expect(document.activeElement).toBe(items[0])
    expect(trigger()).toHaveAttribute("aria-expanded", "true")
    fireEvent.keyDown(items[0]!, { key: "ArrowDown" })
    expect(document.activeElement).toBe(items[1])
    fireEvent.keyDown(items[1]!, { key: "Escape" })
    expect(screen.queryByRole("menu")).toBeNull()
    expect(document.activeElement).toBe(trigger())
  })

  it("propose de réactiver quand la personne est déjà en sourdine ; rien de la sourdine tant que l'état est inconnu", () => {
    mocks.muted = true
    show()
    fireEvent.click(trigger())
    expect(screen.getAllByRole("menuitem")[0]).toHaveTextContent("Réactiver ses publications")
    cleanup()
    mocks.muted = undefined
    show()
    fireEvent.click(trigger())
    expect(screen.getAllByRole("menuitem").map((item) => item.querySelector(".pp-of-label")?.textContent)).toEqual(["Bloquer @awa", "Signaler le profil"])
  })
})

describe("ProfileOverflowMenu — les gestes", () => {
  it("met en sourdine par le moteur et le dit", async () => {
    show()
    fireEvent.click(trigger())
    await act(async () => { fireEvent.click(screen.getAllByRole("menuitem")[0]!) })
    expect(mocks.mutations["modules/marks/marks:muteAuthor"]).toHaveBeenCalledExactlyOnceWith({ networkId: TEST_NETWORK_ID, targetPersonId: TARGET })
    expect(mocks.success).toHaveBeenCalledWith("Les publications de Awa NDONG ne s'affichent plus dans votre fil.")
  })

  it("réactive par le moteur", async () => {
    mocks.muted = true
    show()
    fireEvent.click(trigger())
    await act(async () => { fireEvent.click(screen.getAllByRole("menuitem")[0]!) })
    expect(mocks.mutations["modules/marks/marks:unmuteAuthor"]).toHaveBeenCalledExactlyOnceWith({ networkId: TEST_NETWORK_ID, targetPersonId: TARGET })
  })

  it("bloquer ouvre la confirmation ; rien n'est envoyé avant elle ; confirmé, retour au volet Relations", async () => {
    const router = show()
    fireEvent.click(trigger())
    fireEvent.click(screen.getByRole("menuitem", { name: /Bloquer @awa/ }))
    const dialog = screen.getByRole("dialog", { name: "Bloquer Awa NDONG ?" })
    expect(mocks.mutations["modules/graph/connections:blockPerson"]).not.toHaveBeenCalled()
    await act(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "Bloquer" })) })
    expect(mocks.mutations["modules/graph/connections:blockPerson"]).toHaveBeenCalledExactlyOnceWith({ networkId: TEST_NETWORK_ID, targetPersonId: TARGET })
    expect(mocks.success).toHaveBeenCalledWith("Vous avez bloqué Awa NDONG.")
    expect(router.calls).toContainEqual({ method: "push", href: reseauAgentHref("relations", TEST_ROUTES.home()) })
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("signaler ouvre la brique commune ; transmis, le moteur reçoit la personne et l'accusé se dit (MC-01)", async () => {
    mocks.mutations["modules/moderation/cases:report"] = vi.fn(async () => ({ reportId: "reports_1", created: true, hidden: true }))
    show()
    fireEvent.click(trigger())
    fireEvent.click(screen.getByRole("menuitem", { name: /Signaler le profil/ }))
    const dialog = screen.getByRole("dialog", { name: "Signaler ce profil" })
    await act(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "Transmettre" })) })
    expect(mocks.mutations["modules/moderation/cases:report"]).toHaveBeenCalledExactlyOnceWith({ networkId: TEST_NETWORK_ID, target: { kind: "person", id: TARGET }, reason: "harassment" })
    expect(mocks.success).toHaveBeenCalledWith("Signalement transmis. Ce contenu est masqué pour vous ; l’accusé de réception arrive dans vos notifications.")
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("renoncer au blocage n'envoie rien et ne quitte pas la fiche", () => {
    const router = show()
    fireEvent.click(trigger())
    fireEvent.click(screen.getByRole("menuitem", { name: /Bloquer @awa/ }))
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Annuler" }))
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(mocks.mutations["modules/graph/connections:blockPerson"]).not.toHaveBeenCalled()
    expect(router.calls).toEqual([])
  })
})
