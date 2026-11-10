import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ sdk: vi.fn(), bridge: vi.fn(), fence: vi.fn(), lock: vi.fn() }))
vi.mock("@antsia/api/sign-out-everywhere", () => ({ signOutEverywhere: mocks.sdk }))
vi.mock("./auth-client", () => ({ authClient: {} }))
vi.mock("./session-bridge-client", () => ({ requestSessionBridge: mocks.bridge, rotateSessionBridgeFence: mocks.fence, withSessionBridgeLock: mocks.lock }))
import { signOutAndRedirect } from "./sign-out"
import { routes } from "./routes"

function memoryStorage(): Storage {
  const data = new Map<string, string>()
  return { get length() { return data.size }, key: (index) => [...data.keys()][index] ?? null, getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value) }, removeItem: (key) => { data.delete(key) }, clear: () => { data.clear() } }
}

beforeEach(() => { vi.stubEnv("NEXT_PUBLIC_APP_BASE_PATH", ""); mocks.lock.mockImplementation(async (work: () => Promise<unknown>) => work()) })
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); mocks.sdk.mockReset(); mocks.bridge.mockReset(); mocks.fence.mockReset(); mocks.lock.mockReset() })
describe("sortie avec purge du pont", () => {
  it("une révocation et deux purges confirmées retournent à l'entrée sans avertissement", async () => {
    const assign = vi.fn()
    vi.stubGlobal("window", { location: { assign } })
    mocks.fence.mockReturnValue("generation")
    mocks.sdk.mockImplementation(async (_client, options) => { options.navigate({ serverRevoked: true, localCleared: true }); return {} })
    mocks.bridge.mockResolvedValue(true)
    await signOutAndRedirect()
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith(routes.signedOut(false)))
  })
  it.each([true, false])("reste dans la démo après sortie, purge confirmée : %s", async (bridgeCleared) => {
    vi.stubEnv("NEXT_PUBLIC_APP_BASE_PATH", "/demo")
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://vivid-hedgehog-655.convex.cloud")
    const assign = vi.fn()
    vi.stubGlobal("window", { location: { assign }, localStorage: memoryStorage(), sessionStorage: memoryStorage() })
    mocks.fence.mockReturnValue("generation")
    mocks.sdk.mockImplementation(async (_client, options) => { options.navigate({ serverRevoked: true, localCleared: true }); return {} })
    mocks.bridge.mockResolvedValue(bridgeCleared)
    await signOutAndRedirect()
    expect(assign).toHaveBeenCalledExactlyOnceWith(bridgeCleared ? "/demo/entrer" : "/demo/entrer?deconnexion=incomplete")
  })
  it("un stockage démo indisponible ne replie jamais la purge sur le stockage principal", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_BASE_PATH", "/demo")
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://vivid-hedgehog-655.convex.cloud")
    const assign = vi.fn()
    vi.stubGlobal("window", { location: { assign } })
    mocks.fence.mockReturnValue("generation")
    mocks.sdk.mockImplementation(async (_client, options) => { expect(options.storages).toEqual([]); options.navigate({ serverRevoked: true, localCleared: true }); return {} })
    mocks.bridge.mockResolvedValue(true)
    await signOutAndRedirect()
    expect(mocks.sdk).toHaveBeenCalledOnce()
    expect(mocks.bridge).toHaveBeenCalledWith("DELETE", { generation: "generation", anonymous: false })
    expect(assign).toHaveBeenCalledWith("/demo/entrer?deconnexion=incomplete")
  })
  it("ferme synchroniquement, attend la purge locale avant navigation et signale son échec", async () => {
    const order: string[] = [], assign = vi.fn(() => { order.push("navigate") })
    vi.stubGlobal("window", { location: { assign } })
    mocks.fence.mockImplementation(() => { order.push("fence"); return "generation" })
    mocks.sdk.mockImplementation(async (_client, options) => { order.push("sdk"); options.navigate({ serverRevoked: true, localCleared: true }); return {} })
    mocks.bridge.mockImplementation(async (_method, body) => { expect(body.anonymous).toBe(true); order.push("bridge"); return false })
    await signOutAndRedirect()
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith(routes.signedOut(true)))
    expect(order).toEqual(["fence", "sdk", "bridge", "navigate"])
  })
  it("ne marque pas anonyme une purge SDK incomplète et continue sa fermeture locale", async () => {
    const assign = vi.fn()
    vi.stubGlobal("window", { location: { assign } })
    mocks.fence.mockReturnValue("generation")
    mocks.sdk.mockImplementation(async (_client, options) => { options.navigate({ serverRevoked: false, localCleared: false }); return {} })
    mocks.bridge.mockResolvedValue(true)
    await signOutAndRedirect()
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith(routes.signedOut(true)))
    expect(mocks.bridge).toHaveBeenCalledWith("DELETE", { generation: "generation", anonymous: false })
  })

  it("garde le verrou jusqu'à la réponse de purge et à la demande de navigation", async () => {
    let held = false, finish: (value: boolean) => void = () => undefined
    const assign = vi.fn(() => expect(held).toBe(true))
    vi.stubGlobal("window", { location: { assign } })
    mocks.lock.mockImplementation(async (work: () => Promise<unknown>) => { held = true; try { return await work() } finally { held = false } })
    mocks.fence.mockReturnValue("generation")
    mocks.sdk.mockImplementation(async (_client, options) => { options.navigate({ serverRevoked: true, localCleared: true }); return {} })
    mocks.bridge.mockImplementation(() => new Promise<boolean>((resolve) => { finish = resolve }))
    const pending = signOutAndRedirect()
    await vi.waitFor(() => expect(mocks.bridge).toHaveBeenCalledOnce())
    expect(held).toBe(true)
    expect(assign).not.toHaveBeenCalled()
    finish(true); await pending
    expect(assign).toHaveBeenCalledWith(routes.signedOut(false))
    expect(held).toBe(false)
  })

  it("un verrou refusé conserve la sortie SDK sans tourner ni purger une génération étrangère", async () => {
    const assign = vi.fn()
    vi.stubGlobal("window", { location: { assign } })
    mocks.lock.mockRejectedValue(new Error("denied"))
    mocks.sdk.mockImplementation(async (_client, options) => { options.navigate({ serverRevoked: true, localCleared: true }); return {} })
    await signOutAndRedirect()
    expect(mocks.sdk).toHaveBeenCalledOnce()
    expect(mocks.fence).not.toHaveBeenCalled()
    expect(mocks.bridge).not.toHaveBeenCalled()
    expect(assign).toHaveBeenCalledWith(routes.signedOut(true))
  })
})
