import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const harness = vi.hoisted(() => ({ namespace: "" }))
vi.mock("./demo-storage", () => ({ demoStorageNamespace: () => harness.namespace }))

const networkId = "network-a", personId = "person-a", now = Date.UTC(2026, 9, 21, 12)

async function modules() {
  const [appearance, accounts, cart] = await Promise.all([
    import("./appearance"), import("./demo-accounts"), import("./cart-draft"),
  ])
  return { appearance, accounts, cart }
}
function storage() {
  const values = new Map<string, string>()
  return {
    values, getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => { values.delete(key) },
  }
}

beforeEach(() => { harness.namespace = ""; vi.resetModules() })
afterEach(() => { harness.namespace = ""; vi.unstubAllGlobals() })

describe("clés personnelles de l'application démo", () => {
  it("conserve exactement les clés de l'application principale par défaut", async () => {
    const { appearance, accounts, cart } = await modules()
    expect(appearance.APPEARANCE.storagePrefix).toBe("antsia:antsia:")
    expect(accounts.DEMO_ACCOUNT_KEY).toBe("antsia:antsia:demo-account")
    expect(cart.cartDraftKey("a/b", "c:d")).toBe("antsia:cart:a%2Fb:c%3Ad")
  })

  it("préfixe apparence, compte, panier et intentions hors des clés purgées du vrai compte", async () => {
    harness.namespace = "antsia-demo-scope:"
    const { appearance, accounts, cart } = await modules()
    const keys = [appearance.APPEARANCE.storagePrefix, accounts.DEMO_ACCOUNT_KEY, cart.cartDraftKey(networkId, personId)]
    for (const key of keys) {
      expect(key.startsWith(harness.namespace)).toBe(true)
      expect(key.startsWith("antsia:") || key.startsWith("antia:")).toBe(false)
    }
    expect(appearance.APPEARANCE.storagePrefix).toBe("antsia-demo-scope:antsia:antsia:")
  })

  it("lit, écrit et efface ses propres données sans adopter ni effacer celles du vrai compte", async () => {
    const main = await modules(), target = storage()
    const cartDraft = { version: 1 as const, networkId, personId, handle: "atelier", updatedAt: now, items: [{ offerRef: "pro.ga:offer:offre", quantity: 1 }], submitted: null }
    const mainKeys = [main.cart.cartDraftKey(networkId, personId), main.accounts.DEMO_ACCOUNT_KEY]
    const demoAccount = { actor: "membre", email: "demo@example.test", profile: null }
    for (const [index, value] of [cartDraft, demoAccount].entries()) target.setItem(mainKeys[index]!, JSON.stringify(value))
    const original = new Map(target.values)

    harness.namespace = "antsia-demo-scope:"
    vi.resetModules()
    const demo = await modules()
    vi.stubGlobal("window", { sessionStorage: target })
    expect(demo.cart.readCartDraft(target, networkId, personId, now)).toBeNull()
    expect(demo.accounts.pendingDemoAccount()).toBeNull()
    expect(demo.cart.writeCartDraft(target, cartDraft, now)).toBe(true)
    expect(demo.cart.removeCartDraft(target, networkId, personId)).toBe(true)
    target.setItem(demo.accounts.DEMO_ACCOUNT_KEY, JSON.stringify(demoAccount))
    expect(demo.accounts.pendingDemoAccount()).toEqual(demoAccount)
    demo.accounts.forgetDemoAccount()
    expect(target.values).toEqual(original)
  })
})
