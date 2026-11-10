import { ConvexReactClient } from "convex/react"
import { describe, expect, it } from "vitest"
import { releaseOwnedClient } from "./owned-convex-client"

const CLOSED = "ConvexReactClient has already been closed."

/** Le vrai client Convex, sur une socket qui ne s'ouvre jamais : aucun réseau. Chaque test finit fermé. */
class InertSocket {
  onopen: (() => void) | null = null
  onerror: ((error: unknown) => void) | null = null
  onmessage: ((message: unknown) => void) | null = null
  onclose: ((event: { code: number; reason: string }) => void) | null = null
  readonly readyState = 0
  constructor(readonly url: string) {}
  send(): void { /* Jamais ouverte : rien n'est émis. */ }
  close(): void { queueMicrotask(() => this.onclose?.({ code: 1000, reason: "" })) }
}

function client(): ConvexReactClient {
  return new ConvexReactClient("https://inert-test-123.convex.cloud", { unsavedChangesWarning: false, webSocketConstructor: InertSocket as unknown as typeof WebSocket })
}

describe("transport-owned Convex client", () => {
  it("is the native crash when the transport closes before ConvexProviderWithAuth cleans up", () => {
    const owned = client()
    owned.clearAuth()
    void owned.close()
    // Nettoyage de ConvexAuthStateLastEffect, exécuté après celui de son parent.
    expect(() => owned.clearAuth()).toThrow(CLOSED)
  })

  it("stays open for the provider cleanup of the same unmount, then closes", async () => {
    const owned = client()
    releaseOwnedClient(owned, () => true)
    expect(() => owned.clearAuth()).not.toThrow()
    await Promise.resolve()
    expect(() => owned.clearAuth()).toThrow(CLOSED)
  })

  it("never closes a client that a replayed effect owns again", async () => {
    const owned = client()
    let generation = 1
    releaseOwnedClient(owned, () => generation === 1)
    generation = 2
    await Promise.resolve()
    expect(() => owned.clearAuth()).not.toThrow()
    // Le démontage réel qui suit ferme bien ce client.
    releaseOwnedClient(owned, () => generation === 2)
    await Promise.resolve()
    expect(() => owned.clearAuth()).toThrow(CLOSED)
  })
})
