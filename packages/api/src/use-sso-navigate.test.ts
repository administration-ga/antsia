import { afterEach, describe, expect, it, vi } from "vitest"

const lifecycle = vi.hoisted(() => ({ effects: [] as Array<() => void | (() => void)>, updates: [] as unknown[] }))
vi.mock("react", async (importOriginal) => {
  const original = await importOriginal<typeof import("react")>()
  return {
    ...original,
    useCallback: (callback: unknown) => callback,
    useRef: (initial: unknown) => ({ current: initial }),
    useState: (initial: unknown) => [initial, (value: unknown) => lifecycle.updates.push(value)],
    useEffect: (effect: () => void | (() => void)) => lifecycle.effects.push(effect),
  }
})

import { signOutEverywhere } from "./sign-out-everywhere"

import { prepareSsoNavigation, useSsoNavigate, validateSsoTarget, type OttCapableClient, type SsoNavigationOptions } from "./use-sso-navigate"

const target = "https://diaspora-ga.example/fil?scope=local#post"
const allowedOrigins = ["https://diaspora-ga.example", "https://antsia.example"]
const authenticated = { isAuthenticated: true, allowedOrigins }

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); lifecycle.effects = []; lifecycle.updates = [] })

function deferred() {
  let resolve: (value: unknown) => void = () => undefined
  const promise = new Promise<unknown>((done) => { resolve = done })
  return { promise, resolve }
}

/** Harness du cycle des hooks : cleanup réel appelé au démontage, sans dépendance DOM nouvelle. */
function mountNavigation(authClient: OttCapableClient, options: Partial<SsoNavigationOptions> = {}) {
  const assign = vi.fn()
  vi.stubGlobal("window", { location: { assign } })
  // eslint-disable-next-line react-hooks/rules-of-hooks -- React est remplacé ci-dessus par le harnais de cycle ; les effets et leur cleanup sont exécutés explicitement dans ce test unitaire.
  const hook = useSsoNavigate({ authClient, ...authenticated, ...options })
  const cleanups = lifecycle.effects.map((effect) => effect()).filter((cleanup): cleanup is () => void => typeof cleanup === "function")
  return { hook, assign, unmount: () => { for (const cleanup of cleanups) cleanup() } }
}

describe("SSO — destination fermée avant génération", () => {
  it("autorise l'origine exacte et conserve route, recherche et fragment", () => {
    expect(validateSsoTarget(target, allowedOrigins)).toEqual({ kind: "allowed", href: target })
  })

  it.each(["javascript:alert(1)", "data:text/html,hello", "ftp://diaspora-ga.example/fil", "//diaspora-ga.example/fil", "/fil", "invalid", "https://user:password@diaspora-ga.example/fil"])("refuse la forme dangereuse %s avant tout jeton", async (href) => {
    const generate = vi.fn(async () => ({ data: { token: "private" } }))
    expect(await prepareSsoNavigation({ oneTimeToken: { generate } }, href, authenticated)).toEqual({ kind: "refused", reason: "invalidUrl" })
    expect(generate).not.toHaveBeenCalled()
  })

  it.each(["https://diaspora-ga.example.evil/fil", "https://evil.example/fil", "https://diaspora-ga.example:444/fil", "http://diaspora-ga.example/fil"])("refuse l'origine étrangère %s avant tout jeton", async (href) => {
    const generate = vi.fn(async () => ({ data: { token: "private" } }))
    expect(await prepareSsoNavigation({ oneTimeToken: { generate } }, href, authenticated)).toEqual({ kind: "refused", reason: "untrustedOrigin" })
    expect(generate).not.toHaveBeenCalled()
  })

  it("une allowlist vide n'autorise aucune origine", () => {
    expect(validateSsoTarget(target, [])).toEqual({ kind: "refused", reason: "untrustedOrigin" })
  })

  it("ne transforme pas une URL avec chemin/identifiants en origine autorisée", () => {
    expect(validateSsoTarget(target, ["https://diaspora-ga.example/path", "https://user@diaspora-ga.example", "https://diaspora-ga.example?redirect=1", "invalid"])).toEqual({ kind: "refused", reason: "untrustedOrigin" })
  })

  it("accepte une origine locale seulement quand son port est explicitement autorisé", () => {
    expect(validateSsoTarget("http://localhost:3031/fil", ["http://localhost:3031"])).toEqual({ kind: "allowed", href: "http://localhost:3031/fil" })
    expect(validateSsoTarget("http://localhost:3032/fil", ["http://localhost:3031"])).toEqual({ kind: "refused", reason: "untrustedOrigin" })
  })
})

describe("SSO — la session embarquée doit être prouvée", () => {
  it("sans session, part seulement vers une destination autorisée et sans ancien ott", async () => {
    const generate = vi.fn(async () => ({ data: { token: "unused" } }))
    const result = await prepareSsoNavigation({ oneTimeToken: { generate } }, "https://diaspora-ga.example/fil?ott=old&scope=local", { isAuthenticated: false, allowedOrigins })
    expect(result).toEqual({ kind: "ready", href: "https://diaspora-ga.example/fil?scope=local", session: "absent" })
    expect(generate).not.toHaveBeenCalled()
  })

  it("consomme une génération pour ce passage et place le jeton sur la cible", async () => {
    const generate = vi.fn(async () => ({ data: { token: "opaque+token" }, error: null }))
    const result = await prepareSsoNavigation({ oneTimeToken: { generate } }, target, authenticated)
    expect(result.kind).toBe("ready")
    if (result.kind !== "ready") throw new Error("ready expected")
    const url = new URL(result.href)
    expect(result.session).toBe("transported")
    expect(url.origin).toBe("https://diaspora-ga.example")
    expect(url.pathname).toBe("/fil")
    expect(url.searchParams.get("scope")).toBe("local")
    expect(url.searchParams.get("ott")).toBe("opaque+token")
    expect(url.hash).toBe("#post")
    expect(generate).toHaveBeenCalledOnce()
    expect(generate).toHaveBeenCalledWith({ fetchOptions: { throw: false, signal: expect.any(AbortSignal) } })
  })

  it("remplace tous les ott fournis par la seule session générée", async () => {
    const result = await prepareSsoNavigation({ oneTimeToken: { generate: async () => ({ data: { token: "new" } }) } }, "https://diaspora-ga.example/fil?ott=old&ott=other", authenticated)
    expect(result.kind).toBe("ready")
    if (result.kind === "ready") expect(new URL(result.href).searchParams.getAll("ott")).toEqual(["new"])
  })

  it("un connecté sans greffon ne part pas sur une session résiduelle", async () => {
    expect(await prepareSsoNavigation({}, target, authenticated)).toEqual({ kind: "refused", reason: "tokenUnavailable" })
  })

  it.each([null, {}, { error: { status: 401 } }, { data: null }, { data: { token: null } }, { data: { token: " " } }, { data: { token: "token" }, error: { status: 500 } }, { data: { token: "x".repeat(4097) } }])("un retour de génération non probant refuse le départ (%j)", async (response) => {
    expect(await prepareSsoNavigation({ oneTimeToken: { generate: async () => response } }, target, authenticated)).toEqual({ kind: "refused", reason: "tokenUnavailable" })
  })

  it("une erreur réseau ne déclenche aucune navigation nue", async () => {
    expect(await prepareSsoNavigation({ oneTimeToken: { generate: async () => { throw new Error("offline") } } }, target, authenticated)).toEqual({ kind: "refused", reason: "tokenUnavailable" })
  })

  it("borne et annule une génération muette, sans laisser de timer", async () => {
    vi.useFakeTimers()
    let signal: AbortSignal | undefined
    const authClient: OttCapableClient = { oneTimeToken: { generate: (options) => new Promise((_resolve, reject) => {
      signal = options?.fetchOptions?.signal
      signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true })
    }) } }
    const pending = prepareSsoNavigation(authClient, target, { ...authenticated, timeoutMs: 25 })
    await vi.advanceTimersByTimeAsync(25)
    expect(await pending).toEqual({ kind: "refused", reason: "timeout" })
    expect(signal?.aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe("SSO — aucune navigation tardive sous une ancienne personne", () => {
  it("une session stable permet toujours le passage", async () => {
    const authClient: OttCapableClient = { getSessionData: () => ({ session: { id: "session-A" } }), oneTimeToken: { generate: async () => ({ data: { token: "ott-A" } }) } }
    const result = await prepareSsoNavigation(authClient, target, authenticated)
    expect(result).toMatchObject({ kind: "ready", session: "transported" })
  })

  it.each(["session-B", null])("un compte remplacé ou déconnecté (%s) refuse la réponse de A", async (nextSessionId) => {
    let sessionId: string | null = "session-A"
    const response = deferred()
    const authClient: OttCapableClient = { getSessionData: () => sessionId ? { session: { id: sessionId } } : null, oneTimeToken: { generate: () => response.promise } }
    const pending = prepareSsoNavigation(authClient, target, authenticated)
    await Promise.resolve()
    sessionId = nextSessionId
    response.resolve({ data: { token: "ott-A" } })
    expect(await pending).toEqual({ kind: "refused", reason: "tokenUnavailable" })
  })

  it("un snapshot absent d'un client qui le fournit ne génère aucun jeton", async () => {
    const generate = vi.fn(async () => ({ data: { token: "ott" } }))
    expect(await prepareSsoNavigation({ getSessionData: () => null, oneTimeToken: { generate } }, target, authenticated)).toEqual({ kind: "refused", reason: "tokenUnavailable" })
    expect(generate).not.toHaveBeenCalled()
  })

  it("un snapshot illisible reste fermé sans exposer son exception", async () => {
    const generate = vi.fn(async () => ({ data: { token: "ott" } }))
    expect(await prepareSsoNavigation({ getSessionData: () => { throw new Error("private storage details") }, oneTimeToken: { generate } }, target, authenticated)).toEqual({ kind: "refused", reason: "tokenUnavailable" })
    expect(generate).not.toHaveBeenCalled()
  })

  it("un signal déjà annulé ne lance aucun générateur", async () => {
    const controller = new AbortController()
    controller.abort()
    const generate = vi.fn(async () => ({ data: { token: "ott" } }))
    expect(await prepareSsoNavigation({ oneTimeToken: { generate } }, target, { ...authenticated, signal: controller.signal })).toEqual({ kind: "refused", reason: "tokenUnavailable" })
    expect(generate).not.toHaveBeenCalled()
  })

  it("annule la requête et ignore sa réponse tardive même si le générateur ignore le signal", async () => {
    const controller = new AbortController()
    const response = deferred()
    let requestSignal: AbortSignal | undefined
    const authClient: OttCapableClient = { oneTimeToken: { generate: (options) => { requestSignal = options?.fetchOptions?.signal; return response.promise } } }
    const pending = prepareSsoNavigation(authClient, target, { ...authenticated, signal: controller.signal })
    await Promise.resolve()
    controller.abort()
    expect(await pending).toEqual({ kind: "refused", reason: "tokenUnavailable" })
    expect(requestSignal?.aborted).toBe(true)
    response.resolve({ data: { token: "late" } })
    await Promise.resolve()
  })

  it("le cleanup du hook empêche toute navigation et toute mise à jour après démontage", async () => {
    const response = deferred()
    const generate = vi.fn(() => response.promise)
    const { hook, assign, unmount } = mountNavigation({ getSessionData: () => ({ session: { id: "session-A" } }), oneTimeToken: { generate } })
    const pending = hook.navigateExternal(target)
    await Promise.resolve()
    expect(generate).toHaveBeenCalledOnce()
    unmount()
    response.resolve({ data: { token: "late-A" } })
    expect(await pending).toEqual({ kind: "refused", reason: "tokenUnavailable" })
    expect(assign).not.toHaveBeenCalled()
    expect(lifecycle.updates).toEqual([true])
  })

  it("le hook refuse lui aussi un compte devenu B sans rechargement automatique", async () => {
    let sessionId = "session-A"
    const response = deferred()
    const { hook, assign } = mountNavigation({ getSessionData: () => ({ session: { id: sessionId } }), oneTimeToken: { generate: () => response.promise } })
    const pending = hook.navigateExternal(target)
    await Promise.resolve()
    sessionId = "session-B"
    response.resolve({ data: { token: "ott-A" } })
    expect(await pending).toEqual({ kind: "refused", reason: "tokenUnavailable" })
    expect(assign).not.toHaveBeenCalled()
    expect(lifecycle.updates.at(-1)).toBe(false)
  })

  it("une seconde navigation invalide le premier passage encore en attente", async () => {
    const first = deferred()
    const generate = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValueOnce({ data: { token: "second" } })
    const { hook, assign } = mountNavigation({ oneTimeToken: { generate } })
    const old = hook.navigateExternal(target)
    await Promise.resolve()
    const latest = hook.navigateExternal("https://antsia.example/fil")
    expect(await latest).toMatchObject({ kind: "ready", session: "transported" })
    first.resolve({ data: { token: "old" } })
    expect(await old).toEqual({ kind: "refused", reason: "tokenUnavailable" })
    expect(assign).toHaveBeenCalledOnce()
    expect(new URL(assign.mock.calls[0]![0] as string).origin).toBe("https://antsia.example")
  })

  it("un hook monté garde la navigation valide vers la session courante", async () => {
    const { hook, assign } = mountNavigation({ getSessionData: () => ({ session: { id: "session-A" } }), oneTimeToken: { generate: async () => ({ data: { token: "ott-A" } }) } })
    expect(await hook.navigateExternal(target)).toMatchObject({ kind: "ready", session: "transported" })
    expect(assign).toHaveBeenCalledOnce()
    expect(lifecycle.updates).toEqual([true, false])
  })
})


describe("SSO pendant une déconnexion globale", () => {
  it("refuse la génération et sa réponse tardive jusqu'à la fin de la purge", async () => {
    let finishLogout: () => void = () => undefined
    let finishToken: () => void = () => undefined
    const logoutBarrier = new Promise<void>((resolve) => { finishLogout = resolve })
    const tokenBarrier = new Promise<void>((resolve) => { finishToken = resolve })
    const generate = vi.fn(async () => { await tokenBarrier; return { data: { token: "late-private-token" } } })
    const early = prepareSsoNavigation({ oneTimeToken: { generate } }, target, authenticated)
    await Promise.resolve()
    const logout = signOutEverywhere({
      revokeSessions: async () => { await logoutBarrier; return { data: { status: true } } },
      signOut: async () => ({ data: { success: true } }),
    }, { storages: [] })
    try {
      expect(await prepareSsoNavigation({ oneTimeToken: { generate } }, target, authenticated)).toEqual({ kind: "refused", reason: "tokenUnavailable" })
      expect(generate).toHaveBeenCalledOnce()
      finishToken()
      expect(await early).toEqual({ kind: "refused", reason: "tokenUnavailable" })
    } finally {
      finishToken()
      finishLogout()
      await logout
    }
  })
})
