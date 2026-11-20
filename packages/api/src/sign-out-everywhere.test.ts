// Dupliqué de socle/packages/api/src/sign-out-everywhere.test.ts @ 25398f565 — adaptations : vitest, contrat de résultat explicite, erreurs Better Auth résolues et requêtes annulables, périmètres moteur actuel/ancien, clés de session, rappels de nettoyage et verrou partagé jusqu'à la navigation.
import { afterEach, describe, expect, it, vi } from "vitest"

import { isSigningOutEverywhere, personalStateKeys, signOutEverywhere, type AuthRequestOptions, type LocalPurgeStorage, type SignOutCapableClient, type SignOutEverywhereResult } from "./sign-out-everywhere"

function storage(entries: Record<string, string> = {}): LocalPurgeStorage & { map: Map<string, string> } {
  const map = new Map(Object.entries(entries))
  return {
    map,
    get length() { return map.size },
    key: (index) => [...map.keys()][index] ?? null,
    removeItem: (key) => { map.delete(key) },
  }
}

function client(overrides: Partial<SignOutCapableClient> = {}) {
  const calls: string[] = []
  const atom = vi.fn()
  const authClient: SignOutCapableClient = {
    revokeSessions: async () => { calls.push("revokeSessions"); return { data: { status: true }, error: null } },
    signOut: async () => { calls.push("signOut"); return { data: { success: true }, error: null } },
    $store: { atoms: { session: { set: atom } } },
    ...overrides,
  }
  return { authClient, calls, atom }
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  // Les tests gardent le même document ; une navigation réelle le remplacerait.
  delete (globalThis as typeof globalThis & Record<symbol, unknown>)[Symbol.for("antsia.signOutActivity")]
  vi.resetModules()
})

describe("signOutEverywhere — révocation prouvée avant nettoyage", () => {
  it("révoque avant signOut puis purge l'état, sans changer d'adresse", async () => {
    const { authClient, calls, atom } = client()
    const store = storage({ "antsia:antsia:post-drafts:v1:p1": "private" })
    const remove = store.removeItem
    store.removeItem = (key) => { calls.push("purge"); remove(key) }
    const result = await signOutEverywhere(authClient, { storages: [store], resetLocalState: () => { calls.push("reset") } })
    expect(calls).toEqual(["revokeSessions", "signOut", "purge", "reset"])
    expect(result).toEqual({ serverRevoked: true, localCleared: true, errors: [], purged: ["antsia:antsia:post-drafts:v1:p1"] })
    expect(atom).toHaveBeenCalledWith({ data: null, error: null, isPending: false, isRefetching: false })
  })

  it("ne confond pas une réponse {error} avec une révocation réussie", async () => {
    const { authClient } = client({ revokeSessions: async () => ({ data: null, error: { status: 503 } }) })
    const result = await signOutEverywhere(authClient, { storages: [] })
    expect(result).toMatchObject({ serverRevoked: false, localCleared: true, errors: [{ stage: "revocation", reason: "rejected" }] })
  })

  it.each([undefined, null, {}, { data: {} }, { data: { status: false } }, { data: { status: true }, error: { status: 500 } }])("une réponse de révocation non probante reste un échec (%j)", async (value) => {
    const { authClient } = client({ revokeSessions: async () => value })
    expect((await signOutEverywhere(authClient, { storages: [] })).serverRevoked).toBe(false)
  })

  it("accepte la réponse serveur directe avec statut vrai", async () => {
    const { authClient } = client({ revokeSessions: async () => ({ status: true }) })
    expect((await signOutEverywhere(authClient, { storages: [] })).serverRevoked).toBe(true)
  })

  it("le 401 attendu de signOut ne retire pas la preuve de révocation", async () => {
    const { authClient } = client({ signOut: async () => ({ error: { status: 401 } }) })
    const result = await signOutEverywhere(authClient, { storages: [] })
    expect(result).toMatchObject({ serverRevoked: true, localCleared: true, errors: [{ stage: "signOut", reason: "rejected" }] })
  })

  it("sans révocation disponible, ferme localement et indique la limite", async () => {
    const { authClient, calls } = client({ revokeSessions: undefined })
    expect(await signOutEverywhere(authClient, { storages: [] })).toMatchObject({ serverRevoked: false, localCleared: true, errors: [{ stage: "revocation", reason: "unsupported" }] })
    expect(calls).toEqual(["signOut"])
  })

  it("les deux erreurs réseau n'arrêtent pas les nettoyages", async () => {
    const { authClient, atom } = client({ revokeSessions: async () => { throw new Error("offline") }, signOut: async () => { throw new Error("offline") } })
    const store = storage({ better_auth_cookie: "foreign", "better-auth_cookie": "private" })
    const reset = vi.fn()
    const result = await signOutEverywhere(authClient, { storages: [store], resetLocalState: reset })
    expect(result).toMatchObject({ serverRevoked: false, localCleared: true })
    expect(result.errors).toEqual([{ stage: "revocation", reason: "requestFailed" }, { stage: "signOut", reason: "requestFailed" }])
    expect(store.map.has("better-auth_cookie")).toBe(false)
    expect(store.map.get("better_auth_cookie")).toBe("foreign")
    expect(atom).toHaveBeenCalledOnce()
    expect(reset).toHaveBeenCalledOnce()
  })

  it("borne une révocation muette, annule sa requête et poursuit signOut", async () => {
    vi.useFakeTimers()
    let signal: AbortSignal | undefined
    const { authClient, calls } = client({ revokeSessions: (options) => new Promise((_resolve, reject) => {
      signal = options?.fetchOptions?.signal
      signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true })
    }) })
    const pending = signOutEverywhere(authClient, { storages: [], timeoutMs: 25 })
    await vi.advanceTimersByTimeAsync(25)
    expect(await pending).toMatchObject({ serverRevoked: false, localCleared: true, errors: [{ stage: "revocation", reason: "timeout" }] })
    expect(signal?.aborted).toBe(true)
    expect(calls).toEqual(["signOut"])
    expect(vi.getTimerCount()).toBe(0)
  })

  it("borne aussi signOut et libère l'atome même sans réponse", async () => {
    vi.useFakeTimers()
    let signal: AbortSignal | undefined
    const { authClient, atom } = client({ signOut: (options) => new Promise((_resolve, reject) => {
      signal = options?.fetchOptions?.signal
      signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true })
    }) })
    const pending = signOutEverywhere(authClient, { storages: [], timeoutMs: 25 })
    await vi.advanceTimersByTimeAsync(25)
    expect(await pending).toMatchObject({ serverRevoked: true, localCleared: true, errors: [{ stage: "signOut", reason: "timeout" }] })
    expect(signal?.aborted).toBe(true)
    expect(atom).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it("envoie throw:false et un signal aux deux opérations", async () => {
    const requests: AuthRequestOptions[] = []
    const { authClient } = client({
      revokeSessions: async (options) => { requests.push(options!); return { data: { status: true } } },
      signOut: async (options) => { requests.push(options!); return {} },
    })
    await signOutEverywhere(authClient, { storages: [] })
    expect(requests).toHaveLength(2)
    for (const request of requests) { expect(request.fetchOptions?.throw).toBe(false); expect(request.fetchOptions?.signal).toBeInstanceOf(AbortSignal) }
  })
})

describe("signOutEverywhere — état moteur et aucune purge étrangère", () => {
  it("conserve l'apparence non personnelle mais purge les brouillons et les clés voisines", async () => {
    const store = storage({ "antsia:antsia:appearance": "dark", "antsia:diaspora-ga:appearance": "light", "antsia:antsia:appearance:draft": "private", "antsia:antsia:post-drafts:v1:p1": "private" })
    const { authClient } = client()
    const result = await signOutEverywhere(authClient, { storages: [store] })
    expect([...store.map.keys()]).toEqual(["antsia:antsia:appearance", "antsia:diaspora-ga:appearance"])
    expect(result.purged).toEqual(["antsia:antsia:appearance:draft", "antsia:antsia:post-drafts:v1:p1"])
  })
  it("conserve le thème de l'appareil, repli hors session, sans élargir la règle à ses voisines", async () => {
    const store = storage({ "antsia:antsia:theme": "foret", "antsia:diaspora-ga:theme": "lagon", "antsia:antsia:theme:draft": "private", "antsia:antsia:themes": "private", "antsia:antsia:sub:theme": "private" })
    const { authClient } = client()
    const result = await signOutEverywhere(authClient, { storages: [store] })
    expect([...store.map.keys()]).toEqual(["antsia:antsia:theme", "antsia:diaspora-ga:theme"])
    expect(result.purged).toEqual(["antsia:antsia:theme:draft", "antsia:antsia:themes", "antsia:antsia:sub:theme"])
  })
  it("purge les deux noms du moteur et les deux clés auth dans les deux storages", async () => {
    const local = storage({ "antsia:antsia:ringtone-muted": "1", "antia:antia:ringtone-muted": "1", "better-auth_cookie": "secret", theme: "dark", i18nextLng: "fr", "diaspora-ga:demonstration:v1": "demo", "other-product:profile": "other" })
    const session = storage({ "antsia:diaspora-ga:messagerie-dock:v6": "private", "antia:diaspora-ga:post-drafts:v1:p1": "private", "better-auth_session_data": "private", "better-auth_cookie_extra": "other", "citizen-reduce-motion": "1" })
    const { authClient } = client()
    const result = await signOutEverywhere(authClient, { storages: [local, session] })
    expect(result.purged).toHaveLength(6)
    expect([...local.map.keys()]).toEqual(["theme", "i18nextLng", "diaspora-ga:demonstration:v1", "other-product:profile"])
    expect([...session.map.keys()]).toEqual(["better-auth_cookie_extra", "citizen-reduce-motion"])
  })

  it("fige les indices pour supprimer toutes les clés consécutives", () => {
    const store = storage({ "antsia:antsia:a": "1", "antsia:antsia:b": "2", "antia:antia:c": "3", theme: "dark" })
    expect(personalStateKeys(store)).toEqual(["antsia:antsia:a", "antsia:antsia:b", "antia:antia:c"])
  })

  it("ne transforme pas un stockage indisponible en réussite locale", async () => {
    const unavailable: LocalPurgeStorage = { get length(): number { throw new Error("SecurityError") }, key: () => null, removeItem: () => undefined }
    const available = storage({ "antsia:antsia:private": "secret" })
    const { authClient, atom } = client()
    const result = await signOutEverywhere(authClient, { storages: [unavailable, available] })
    expect(result).toMatchObject({ serverRevoked: true, localCleared: false, errors: [{ stage: "storage", reason: "cleanupFailed" }] })
    expect(available.map.size).toBe(0)
    expect(atom).toHaveBeenCalledOnce()
  })

  it("une clé non supprimable ne conserve pas les autres clés privées", async () => {
    const store = storage({ "antsia:antsia:a": "secret", "antsia:antsia:b": "secret" })
    const remove = store.removeItem
    store.removeItem = (key) => { if (key.endsWith(":a")) throw new Error("SecurityError"); remove(key) }
    const { authClient } = client()
    const result = await signOutEverywhere(authClient, { storages: [store] })
    expect(result.localCleared).toBe(false)
    expect(result.purged).toEqual(["antsia:antsia:b"])
  })

  it("le navigateur peut refuser un storage sans bloquer le second", async () => {
    const session = storage({ "antsia:antsia:private": "secret" })
    vi.stubGlobal("window", { get localStorage() { throw new Error("SecurityError") }, sessionStorage: session })
    const { authClient } = client()
    const result = await signOutEverywhere(authClient)
    expect(result.localCleared).toBe(false)
    expect(session.map.size).toBe(0)
  })

  it("préserve les fonctions de l'atome et efface ses données personnelles", async () => {
    const refetch = () => undefined
    const set = vi.fn()
    const { authClient } = client({ $store: { atoms: { session: { get: () => ({ refetch, data: { private: true } }), set } } } })
    await signOutEverywhere(authClient, { storages: [] })
    expect(set).toHaveBeenCalledWith({ refetch, data: null, error: null, isPending: false, isRefetching: false })
  })

  it("signale une remise à zéro défaillante sans perdre la preuve serveur", async () => {
    const { authClient } = client()
    const result = await signOutEverywhere(authClient, { storages: [], resetLocalState: () => { throw new Error("reset") } })
    expect(result).toMatchObject({ serverRevoked: true, localCleared: false, errors: [{ stage: "reset", reason: "cleanupFailed" }] })
  })

  it("signale un atome défaillant et exécute quand même le rappel", async () => {
    const reset = vi.fn()
    const { authClient } = client({ $store: { atoms: { session: { set: () => { throw new Error("atom") } } } } })
    expect(await signOutEverywhere(authClient, { storages: [], resetLocalState: reset })).toMatchObject({ localCleared: false, errors: [{ stage: "authState", reason: "cleanupFailed" }] })
    expect(reset).toHaveBeenCalledOnce()
  })
})


describe("déconnexion locale et rechargement réactif", () => {
  it("garde l'activité jusqu'à la purge, même si les requêtes échouent", async () => {
    let finish: () => void = () => undefined
    const barrier = new Promise<void>((resolve) => { finish = resolve })
    const { authClient } = client({ revokeSessions: async () => { await barrier; throw new Error("offline") } })
    const reset = vi.fn(() => expect(isSigningOutEverywhere()).toBe(true))
    expect(isSigningOutEverywhere()).toBe(false)
    const pending = signOutEverywhere(authClient, { storages: [], resetLocalState: reset })
    expect(isSigningOutEverywhere()).toBe(true)
    finish()
    expect(await pending).toMatchObject({ serverRevoked: false, localCleared: true })
    expect(reset).toHaveBeenCalledOnce()
    expect(isSigningOutEverywhere()).toBe(false)
  })

  it("ne libère pas la garde pendant un deuxième nettoyage simultané", async () => {
    let finish: () => void = () => undefined
    const barrier = new Promise<void>((resolve) => { finish = resolve })
    const first = client()
    const second = client({ revokeSessions: async () => { await barrier; return { data: { status: true } } } })
    const pending = signOutEverywhere(second.authClient, { storages: [] })
    await signOutEverywhere(first.authClient, { storages: [] })
    expect(isSigningOutEverywhere()).toBe(true)
    finish()
    await pending
    expect(isSigningOutEverywhere()).toBe(false)
  })

  it("partage le compteur entre deux copies du module dans le même document", async () => {
    vi.resetModules()
    const otherEntry = await import("./sign-out-everywhere")
    expect(otherEntry.isSigningOutEverywhere).not.toBe(isSigningOutEverywhere)
    expect(otherEntry.isSigningOutEverywhere()).toBe(false)
    let finish: () => void = () => undefined
    const barrier = new Promise<void>((resolve) => { finish = resolve })
    const { authClient } = client({ revokeSessions: async () => { await barrier; return { data: { status: true } } } })
    const pending = signOutEverywhere(authClient, { storages: [] })
    expect(otherEntry.isSigningOutEverywhere()).toBe(true)
    finish()
    await pending
    expect(otherEntry.isSigningOutEverywhere()).toBe(false)
  })

  it("la navigation intervient après tous les nettoyages et garde le verrou après résolution", async () => {
    const { authClient, calls, atom } = client()
    const store = storage({ "antsia:antsia:private": "secret" })
    const remove = store.removeItem
    store.removeItem = (key) => { calls.push("purge"); remove(key) }
    const navigate = vi.fn((result: SignOutEverywhereResult) => {
      expect(store.map.size).toBe(0)
      expect(atom).toHaveBeenCalledOnce()
      expect(isSigningOutEverywhere()).toBe(true)
      expect(result).toMatchObject({ serverRevoked: true, localCleared: true })
      calls.push("navigate")
    })
    const result = await signOutEverywhere(authClient, { storages: [store], resetLocalState: () => { calls.push("reset") }, navigate })
    expect(calls).toEqual(["revokeSessions", "signOut", "purge", "reset", "navigate"])
    expect(navigate).toHaveBeenCalledWith(result)
    expect(isSigningOutEverywhere()).toBe(true)
    expect((globalThis as typeof globalThis & Record<symbol, unknown>)[Symbol.for("antsia.signOutActivity")]).toEqual({ count: 0, pendingNavigations: 1 })
  })

  it("une copie différente observe aussi la navigation acquise après la fin du helper", async () => {
    vi.resetModules()
    const otherEntry = await import("./sign-out-everywhere")
    const { authClient } = client()
    await otherEntry.signOutEverywhere(authClient, { storages: [], navigate: () => undefined })
    expect(isSigningOutEverywhere()).toBe(true)
    expect(otherEntry.isSigningOutEverywhere()).toBe(true)
  })

  it("un rappel de navigation défaillant libère son verrou après la purge", async () => {
    const { authClient, atom } = client()
    const store = storage({ "antsia:antsia:private": "secret" })
    const failure = new Error("navigation refusée")
    await expect(signOutEverywhere(authClient, {
      storages: [store],
      navigate: () => { expect(isSigningOutEverywhere()).toBe(true); throw failure },
    })).rejects.toBe(failure)
    expect(store.map.size).toBe(0)
    expect(atom).toHaveBeenCalledOnce()
    expect(isSigningOutEverywhere()).toBe(false)
  })

  it("un échec avant le rappel ne laisse aucun verrou de navigation", async () => {
    const { authClient } = client()
    const failure = new Error("options indisponibles")
    const navigate = vi.fn()
    await expect(signOutEverywhere(authClient, {
      get storages(): readonly LocalPurgeStorage[] { throw failure },
      navigate,
    })).rejects.toBe(failure)
    expect(navigate).not.toHaveBeenCalled()
    expect(isSigningOutEverywhere()).toBe(false)
  })

  it("une révocation échouée transmet le résultat incomplet après la purge et conserve la navigation", async () => {
    const { authClient } = client({ revokeSessions: async () => ({ error: { status: 503 } }) })
    const store = storage({ "antsia:antsia:private": "secret" })
    const navigate = vi.fn((result: SignOutEverywhereResult) => {
      expect(store.map.size).toBe(0)
      expect(result).toMatchObject({ serverRevoked: false, localCleared: true })
    })
    await signOutEverywhere(authClient, { storages: [store], navigate })
    expect(navigate).toHaveBeenCalledOnce()
    expect(isSigningOutEverywhere()).toBe(true)
  })

  it("la fin d'une autre opération ne libère pas une navigation déjà acquise", async () => {
    const first = client()
    await signOutEverywhere(first.authClient, { storages: [], navigate: () => undefined })
    const second = client()
    await signOutEverywhere(second.authClient, { storages: [] })
    expect(isSigningOutEverywhere()).toBe(true)
    expect((globalThis as typeof globalThis & Record<symbol, unknown>)[Symbol.for("antsia.signOutActivity")]).toEqual({ count: 0, pendingNavigations: 1 })
  })
})
