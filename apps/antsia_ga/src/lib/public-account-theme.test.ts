import { describe, expect, it, vi } from "vitest"

import { loadPublicAccountTheme } from "./public-account-theme"
import { BRIDGE_CLIENT_TIMEOUT_MS } from "./session-bridge"

function harness() {
  const state = { session: "origin-sdk-session" as string | null, generation: "current-generation", signingOut: false }
  const controller = new AbortController()
  const token = vi.fn(async (_signal: AbortSignal) => ({ data: { token: "private-jwt" }, error: null as unknown }))
  const readTheme = vi.fn<(token: string, signal: AbortSignal) => Promise<unknown>>().mockResolvedValue("sable")
  const apply = vi.fn()
  const load = () => loadPublicAccountTheme({ sessionKey: () => state.session, generation: () => state.generation, signingOut: () => state.signingOut, token, readTheme, apply, signal: controller.signal })
  return { state, controller, token, readTheme, apply, load }
}

describe("lecture privée du thème sur une route publique", () => {
  it("ne demande ni jeton ni fiche en l'absence de SID SDK sur cette origine", async () => {
    const h = harness()
    h.state.session = null
    await h.load()
    expect(h.token).not.toHaveBeenCalled()
    expect(h.readTheme).not.toHaveBeenCalled()
    expect(h.apply).not.toHaveBeenCalled()
  })

  it.each([["sable", "sable"], ["corail", "corail"], ["indigo", "gaboma"]])("applique la préférence privée %s après la lecture authentifiée", async (stored, expected) => {
    const h = harness()
    h.readTheme.mockResolvedValue(stored)
    await h.load()
    expect(h.token).toHaveBeenCalledOnce()
    expect(h.readTheme).toHaveBeenCalledWith("private-jwt", h.token.mock.calls[0]?.[0])
    expect(h.apply).toHaveBeenCalledExactlyOnceWith(expected)
  })

  it.each([undefined, null, "inconnu"])("conserve le thème de l'appareil si le compte n'a pas de préférence reconnue (%j)", async (theme) => {
    const h = harness()
    h.readTheme.mockResolvedValue(theme)
    await h.load()
    expect(h.apply).not.toHaveBeenCalled()
  })

  it("un refus de jeton ferme la lecture, sans repli HTTP anonyme", async () => {
    const h = harness()
    h.token.mockResolvedValue({ data: { token: "" }, error: { status: 401 } })
    await h.load()
    expect(h.readTheme).not.toHaveBeenCalled()
    expect(h.apply).not.toHaveBeenCalled()
  })

  it("une session révoquée ou une panne de lecture laisse la préférence locale", async () => {
    const h = harness()
    h.readTheme.mockRejectedValue(new Error("sessionRequired"))
    await expect(h.load()).resolves.toBeUndefined()
    expect(h.apply).not.toHaveBeenCalled()
  })

  it.each(["session", "generation", "signingOut"] as const)("ignore une réponse dont la preuve %s a changé pendant la lecture", async (changed) => {
    const h = harness()
    let finish: (theme: string) => void = () => undefined
    h.readTheme.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    const pending = h.load()
    await vi.waitFor(() => expect(h.readTheme).toHaveBeenCalledOnce())
    if (changed === "signingOut") h.state.signingOut = true
    else h.state[changed] = "replacement"
    finish("corail")
    await pending
    expect(h.apply).not.toHaveBeenCalled()
  })

  it("une navigation ferme immédiatement l'attente et une fiche tardive ne remplace pas le choix de la page membre", async () => {
    const h = harness()
    let finish: (theme: string) => void = () => undefined
    h.readTheme.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    const pending = h.load()
    await vi.waitFor(() => expect(h.readTheme).toHaveBeenCalledOnce())
    h.controller.abort()
    await pending
    finish("corail")
    await Promise.resolve()
    expect(h.apply).not.toHaveBeenCalled()
    expect(h.token.mock.calls[0]?.[0].aborted).toBe(true)
    expect(h.readTheme.mock.calls[0]?.[1]).toBe(h.token.mock.calls[0]?.[0])
  })

  it("une lecture trop longue est fermée même si le transport ne répond pas à l'annulation", async () => {
    vi.useFakeTimers()
    try {
      const h = harness()
      let finish: (theme: string) => void = () => undefined
      h.readTheme.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
      const pending = h.load()
      await vi.advanceTimersByTimeAsync(BRIDGE_CLIENT_TIMEOUT_MS)
      await pending
      expect(h.readTheme.mock.calls[0]?.[1].aborted).toBe(true)
      finish("corail")
      await Promise.resolve()
      expect(h.apply).not.toHaveBeenCalled()
    } finally { vi.useRealTimers() }
  })

  it("un stockage inaccessible et un montage immédiatement annulé n'émettent aucune requête", async () => {
    const h = harness()
    await expect(loadPublicAccountTheme({ sessionKey: () => { throw new Error("blocked") }, generation: () => null, signingOut: () => false, token: h.token, readTheme: h.readTheme, apply: h.apply, signal: h.controller.signal })).resolves.toBeUndefined()
    const pending = h.load()
    h.controller.abort()
    await pending
    expect(h.token).not.toHaveBeenCalled()
  })
})
