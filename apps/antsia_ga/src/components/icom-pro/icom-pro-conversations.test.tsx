// @vitest-environment jsdom
import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
  mandated: [{ shopId: "shop-1", shopName: "Épicerie Moussavou Démo" }] as { shopId: string; shopName: string }[],
  owned: [] as { shopId: string; name: string | null; pageHandle: string | null }[],
  window: vi.fn(),
}))
vi.mock("@antsia/api/engine", () => ({ api: { modules: { commercialMessaging: { team: { myShops: "team.myShops" } }, shops: { shops: { myShops: "shops.myShops" } } } } }))
vi.mock("@antsia/api/hooks", () => ({ useAuthenticatedConvexQuery: (ref: string) => ({ data: { items: ref === "team.myShops" ? state.mandated : state.owned, truncated: false }, isError: false }) }))
vi.mock("@antsia/api/network", () => ({ useNetwork: () => ({ networkId: "network-a" }) }))
vi.mock("next/link", () => ({ default: ({ children, href, className, "aria-current": current }: { children: ReactNode; href: string; className?: string; "aria-current"?: "page" }) => <a href={href} className={className} aria-current={current}>{children}</a> }))
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string, values?: Record<string, string>) => values?.shop ? `${key}:${values.shop}` : key }) }))
vi.mock("@/components/shops/shop-ui", () => ({ SHOP_SELECT_CLASS: "champ" }))
vi.mock("@/components/shops/contact-inbox", () => ({
  ContactInvitations: () => null,
  ContactInboxWindow: (props: { shopId?: string; stateFilter?: string; query: string }) => { state.window(props); return <p>Boîte {props.shopId ?? "mes achats"} {props.stateFilter ?? "all"}</p> },
}))

import { currentIcomProActivity, IcomProConversations, icomProActivities } from "./icom-pro-conversations"

const contextual = { renderList: (query: string) => <p>Mises en relation « {query} »</p>, renderConversation: () => null }
let root: Root | undefined
let container: HTMLDivElement
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); container = document.createElement("div"); document.body.append(container) })
afterEach(async () => {
  await act(async () => { root?.unmount() }); root = undefined; container.remove()
  state.mandated = [{ shopId: "shop-1", shopName: "Épicerie Moussavou Démo" }]; state.owned = []; state.window.mockClear()
})
async function show(node: ReactNode) {
  root ??= createRoot(container)
  await act(async () => { root?.render(node) })
}
const byText = (text: string) => Array.from(container.querySelectorAll("*")).find((element) => element.textContent === text && element.children.length === 0)
const link = (name: string) => Array.from(container.querySelectorAll("a")).find((element) => element.textContent === name)
const button = (name: string) => Array.from(container.querySelectorAll("button")).find((element) => element.textContent === name)

describe("ADR-0036 — activités d'iCom Pro", () => {
  it("mes boutiques d'abord, puis mes achats et les mises en relation ; une boutique sans mandat renvoie à son équipe", () => {
    const activities = icomProActivities({
      mandated: [{ shopId: "s1", shopName: "Épicerie" }],
      owned: [{ shopId: "s1", name: "Épicerie", pageHandle: "epicerie" }, { shopId: "s2", name: "Studio", pageHandle: "studio" }, { shopId: "s3", name: "Brouillon", pageHandle: null }],
      labels: { purchases: "Mes achats", relations: "Mises en relation" },
    })
    expect(activities.map((activity) => [activity.id, activity.kind])).toEqual([["s1", "shop"], ["s2", "shopWithoutMandate"], ["achats", "purchases"], ["relations", "relations"]])
    expect(currentIcomProActivity(activities, null)?.id).toBe("s1")
    expect(currentIcomProActivity(activities, "relations")?.id).toBe("relations")
    expect(currentIcomProActivity(activities, "inconnue")?.id).toBe("s1")
  })
  it("la boîte d'une boutique se filtre par état ; les liens d'activité restent dans iCom Pro", async () => {
    await show(<IcomProConversations activity={null} contextual={contextual} />)
    expect(byText("Boîte shop-1 all")).toBeTruthy()
    await act(async () => { button("conversations.states.requested")?.click() })
    expect(byText("Boîte shop-1 requested")).toBeTruthy()
    expect(button("conversations.states.requested")?.getAttribute("aria-pressed")).toBe("true")
    expect(link("conversations.purchases")?.getAttribute("href")).toBe("/messages?espace=pro&activite=achats")
    expect(link("Épicerie Moussavou Démo")?.getAttribute("aria-current")).toBe("page")
  })
  it("mes achats sans boutique tenue, et les mises en relation avec la recherche", async () => {
    state.mandated = []
    await show(<IcomProConversations activity={null} contextual={contextual} />)
    expect(byText("Boîte mes achats all")).toBeTruthy()
    expect(container.querySelector('[role="group"]')).toBeNull()
    await show(<IcomProConversations activity="relations" contextual={contextual} />)
    const search = container.querySelector('input[type="search"]') as HTMLInputElement
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set
      setter?.call(search, "devis")
      search.dispatchEvent(new Event("input", { bubbles: true }))
    })
    expect(container.textContent).toContain("Mises en relation « devis »")
  })
  it("une boutique tenue sans mandat de lecture renvoie à l'équipe, jamais une liste vide", async () => {
    state.mandated = []
    state.owned = [{ shopId: "shop-2", name: "Atelier Tech Démo", pageHandle: "atelier-tech-demo" }]
    await show(<IcomProConversations activity="shop-2" contextual={contextual} />)
    expect(container.textContent).toContain("conversations.noShopMandate:Atelier Tech Démo")
    expect(link("conversations.openTeam")?.getAttribute("href")).toBe("/mes-boutiques/shop-2")
    expect(state.window).not.toHaveBeenCalled()
  })
})
