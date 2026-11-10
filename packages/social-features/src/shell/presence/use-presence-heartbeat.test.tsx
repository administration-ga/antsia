// @vitest-environment jsdom
import { renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const calls: { name: "heartbeat" | "setOffline"; args: unknown }[] = []
const activity = vi.hoisted(() => ({ signingOut: false }))

vi.mock("@antsia/api/engine", () => ({
  api: { modules: { calls: { presence: { heartbeat: "heartbeat", setOffline: "setOffline" } } } },
}))
vi.mock("@antsia/api/network", () => ({ useNetwork: () => ({ networkId: "networks_test" }) }))
vi.mock("@antsia/api/sign-out-everywhere", () => ({ isSigningOutEverywhere: () => activity.signingOut }))
vi.mock("convex/react", () => ({
  useMutation: (ref: "heartbeat" | "setOffline") => (args: unknown) => {
    calls.push({ name: ref, args })
    return Promise.resolve(null)
  },
}))

import { PRESENCE_MIN_BEAT_GAP_MS, PRESENCE_OFFLINE_DELAY_MS, shouldBeat, usePresenceHeartbeat } from "./use-presence-heartbeat"

const count = (name: "heartbeat" | "setOffline") => calls.filter((call) => call.name === name).length

beforeEach(() => {
  vi.useFakeTimers()
  calls.length = 0
  activity.signingOut = false
})

afterEach(() => {
  vi.runOnlyPendingTimers()
  activity.signingOut = false
  vi.useRealTimers()
})

describe("shouldBeat — pas de battement redoublé", () => {
  it("bat sans battement connu, ou passé l'écart minimal", () => {
    expect(shouldBeat(1_000, undefined)).toBe(true)
    expect(shouldBeat(PRESENCE_MIN_BEAT_GAP_MS, 0)).toBe(true)
    expect(shouldBeat(PRESENCE_MIN_BEAT_GAP_MS - 1, 0)).toBe(false)
  })
})

describe("usePresenceHeartbeat — le battement de présence du réseau", () => {
  it("bat au montage dans le réseau courant, puis toutes les 30 s", () => {
    const view = renderHook(() => usePresenceHeartbeat())
    expect(count("heartbeat")).toBe(1)
    expect(calls[0]?.args).toEqual({ networkId: "networks_test" })
    vi.advanceTimersByTime(30_000)
    expect(count("heartbeat")).toBe(2)
    view.unmount()
  })

  it("un remontage immédiat (navigation, double montage) n'envoie ni « hors ligne » ni second battement", () => {
    renderHook(() => usePresenceHeartbeat()).unmount()
    renderHook(() => usePresenceHeartbeat())
    vi.advanceTimersByTime(PRESENCE_OFFLINE_DELAY_MS + 10)
    expect(count("setOffline")).toBe(0)
    expect(count("heartbeat")).toBe(1)
  })

  it("dit « hors ligne » après le délai quand la coque se démonte pour de bon", () => {
    const view = renderHook(() => usePresenceHeartbeat())
    view.unmount()
    expect(count("setOffline")).toBe(0)
    vi.advanceTimersByTime(PRESENCE_OFFLINE_DELAY_MS)
    expect(count("setOffline")).toBe(1)
  })

  it("dit « hors ligne » tout de suite à la fermeture de l'onglet", () => {
    const view = renderHook(() => usePresenceHeartbeat())
    window.dispatchEvent(new Event("beforeunload"))
    expect(count("setOffline")).toBe(1)
    view.unmount()
  })

  it("arrête les battements dès le début de sortie et les reprend si le verrou est libéré", () => {
    const view = renderHook(() => usePresenceHeartbeat())
    expect(count("heartbeat")).toBe(1)
    activity.signingOut = true
    vi.advanceTimersByTime(60_000)
    expect(count("heartbeat")).toBe(1)
    activity.signingOut = false
    vi.advanceTimersByTime(30_000)
    expect(count("heartbeat")).toBe(2)
    view.unmount()
  })

  it("ne dit pas « hors ligne » au déchargement pendant la sortie, mais conserve le geste normal", () => {
    const view = renderHook(() => usePresenceHeartbeat())
    activity.signingOut = true
    window.dispatchEvent(new Event("beforeunload"))
    expect(count("setOffline")).toBe(0)
    activity.signingOut = false
    window.dispatchEvent(new Event("beforeunload"))
    expect(count("setOffline")).toBe(1)
    view.unmount()
  })

  it.each(["avant", "après"] as const)("refuse le nettoyage serveur différé si la sortie commence %s le démontage, sans retenir l'état mémoire", (start) => {
    const view = renderHook(() => usePresenceHeartbeat())
    if (start === "avant") activity.signingOut = true
    view.unmount()
    if (start === "après") activity.signingOut = true
    vi.advanceTimersByTime(PRESENCE_OFFLINE_DELAY_MS)
    expect(count("setOffline")).toBe(0)
    activity.signingOut = false
    const resumed = renderHook(() => usePresenceHeartbeat())
    expect(count("heartbeat")).toBe(2)
    resumed.unmount()
  })

  it("un montage pendant la sortie ne bat pas et ne marque pas le réseau comme récemment actif", () => {
    activity.signingOut = true
    const view = renderHook(() => usePresenceHeartbeat())
    expect(count("heartbeat")).toBe(0)
    window.dispatchEvent(new Event("beforeunload"))
    view.unmount()
    vi.advanceTimersByTime(PRESENCE_OFFLINE_DELAY_MS)
    expect(count("setOffline")).toBe(0)
    activity.signingOut = false
    const resumed = renderHook(() => usePresenceHeartbeat())
    expect(count("heartbeat")).toBe(1)
    resumed.unmount()
  })
})
