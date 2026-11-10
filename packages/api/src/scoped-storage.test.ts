import { afterEach, describe, expect, it, vi } from "vitest"

import { CROSS_DOMAIN_COOKIE_KEY, CROSS_DOMAIN_SESSION_DATA_KEY, clearCrossDomainSessionResidue, refreshCrossDomainSession } from "./cross-domain-session-bootstrap"
import { personalStateKeys } from "./sign-out-everywhere"
import { scopedStorage } from "./scoped-storage"

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial))
  return {
    get length() { return map.size },
    key: (index) => [...map.keys()][index] ?? null,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => { map.set(key, value) },
    removeItem: (key) => { map.delete(key) },
    clear: () => { map.clear() },
  }
}

afterEach(() => vi.unstubAllGlobals())

describe("vue de stockage préfixée", () => {
  it("refuse une vue globale sans préfixe", () => {
    expect(() => scopedStorage(memoryStorage(), "")).toThrow(RangeError)
  })

  it("lit, écrit et retire seulement des clés physiques de son espace", () => {
    const storage = memoryStorage({ secret: "vrai compte", "demo:secret": "compte fictif" })
    const view = scopedStorage(storage, "demo:")
    expect(view.getItem("secret")).toBe("compte fictif")
    expect(view.getItem("demo:secret")).toBeNull()
    view.setItem("secret", "nouvelle valeur")
    expect(storage.getItem("demo:secret")).toBe("nouvelle valeur")
    expect(storage.getItem("secret")).toBe("vrai compte")
    view.removeItem("secret")
    expect(storage.getItem("demo:secret")).toBeNull()
    expect(storage.getItem("secret")).toBe("vrai compte")
  })

  it("énumère uniquement les clés virtuelles de cette vue, y compris une clé vide", () => {
    const storage = memoryStorage({ before: "1", "demo:a": "2", "other:b": "3", "demo:": "4", "demo:c": "5" })
    const view = scopedStorage(storage, "demo:")
    expect(view.length).toBe(3)
    expect([view.key(0), view.key(1), view.key(2)]).toEqual(["a", "", "c"])
    expect(view.key(-1)).toBeNull()
    expect(view.key(3)).toBeNull()
    expect(view.key(Number.NaN)).toBeNull()
    storage.setItem("demo:d", "6")
    expect(view.length).toBe(4)
  })

  it("clear retire les seules clés du préfixe sans appeler le clear global", () => {
    const storage = memoryStorage({ main: "conservé", "demo:a": "1", "demo:b": "2", "demo-other:c": "3" })
    const clear = vi.spyOn(storage, "clear")
    const view = scopedStorage(storage, "demo:")
    view.clear()
    expect(view.length).toBe(0)
    expect(clear).not.toHaveBeenCalled()
    expect(storage.length).toBe(2)
    expect(storage.getItem("main")).toBe("conservé")
    expect(storage.getItem("demo-other:c")).toBe("3")
  })

  it("la purge nominale voit ses clés virtuelles sans atteindre les données ANTSIA réelles", () => {
    const storage = memoryStorage({ "antsia:antsia:messagerie-dock:v6": "brouillon réel" })
    const view = scopedStorage(storage, "antsia-demo-scope:")
    view.setItem(CROSS_DOMAIN_COOKIE_KEY, "session démo")
    view.setItem("antsia:antsia:messagerie-dock:v6", "brouillon fictif")
    view.setItem("preference-externe", "conservée")
    for (const key of personalStateKeys(view)) view.removeItem(key)
    expect(view.getItem(CROSS_DOMAIN_COOKIE_KEY)).toBeNull()
    expect(view.getItem("antsia:antsia:messagerie-dock:v6")).toBeNull()
    expect(view.getItem("preference-externe")).toBe("conservée")
    expect(storage.getItem("antsia:antsia:messagerie-dock:v6")).toBe("brouillon réel")
  })

  it("le bootstrap anonyme et sa purge écrivent exclusivement dans la vue injectée", async () => {
    const storage = memoryStorage({ [CROSS_DOMAIN_COOKIE_KEY]: "cookie réel", [CROSS_DOMAIN_SESSION_DATA_KEY]: "session réelle" })
    vi.stubGlobal("localStorage", storage)
    const view = scopedStorage(storage, "antsia-demo-scope:")
    const getSession = vi.fn()
    const token = vi.fn()
    const result = await refreshCrossDomainSession({ getCookie: () => "", getSessionData: () => null, getSession, convex: { token } }, { storage: view })
    expect(result).toEqual({ kind: "signed_out", token: null })
    expect(view.getItem(CROSS_DOMAIN_COOKIE_KEY)).toBe("{}")
    expect(view.getItem(CROSS_DOMAIN_SESSION_DATA_KEY)).toBe("{}")
    expect(storage.getItem(CROSS_DOMAIN_COOKIE_KEY)).toBe("cookie réel")
    expect(storage.getItem(CROSS_DOMAIN_SESSION_DATA_KEY)).toBe("session réelle")
    expect(getSession).not.toHaveBeenCalled()
    expect(token).not.toHaveBeenCalled()
    clearCrossDomainSessionResidue(view)
    expect(storage.getItem(CROSS_DOMAIN_COOKIE_KEY)).toBe("cookie réel")
  })

  it("laisse remonter les refus de stockage, sans repli implicite vers un autre espace", () => {
    const storage = memoryStorage()
    const denied = new Error("stockage refusé")
    vi.spyOn(storage, "setItem").mockImplementation(() => { throw denied })
    expect(() => scopedStorage(storage, "demo:").setItem("key", "value")).toThrow(denied)
    expect(storage.length).toBe(0)
  })
})
