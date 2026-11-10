import { createElement, isValidElement, type ReactElement, type ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import type { Id } from "@antsia/api/engine"
import type { NativeAuthClient } from "../lib/auth-client"
import { NativeCallProvider, type NativeCallAuthority } from "./native-call-provider"

// Le contrôleur et la surface sont natifs ; seule la forme de l'arbre est vérifiée ici.
vi.mock("./call-controller", () => ({ createNativeCallController: vi.fn() }))
vi.mock("./native-call-surface", () => ({ NativeCallSurface: () => null }))

const env = { convexUrl: "https://inert-test-123.convex.cloud", authUrl: "https://inert-test-123.convex.site", webUrl: "https://antsia.example" }
const transport = createElement("private-transport")

function authority(sessionId: string): NativeCallAuthority {
  return {
    networkId: "network" as Id<"networks">, personId: "person" as Id<"persons">, sessionId,
    expiresAt: Date.now() + 60_000, foreground: true, auth: {} as unknown as NativeAuthClient, isCurrent: () => true,
  }
}
function tree(current: NativeCallAuthority | null): ReactElement<{ children: ReactNode[] }> {
  const node = NativeCallProvider({ authority: current, env, registerSessionCleanup: () => () => undefined, children: transport })
  if (!isValidElement<{ children: ReactNode[] }>(node)) throw new Error("NativeCallProvider must render one element")
  return node
}

describe("native call provider", () => {
  it("keeps the private transport in place when a call authority arrives, leaves or changes owner", () => {
    const anonymous = tree(null), member = tree(authority("session-1")), other = tree(authority("session-2"))
    // Même type au même rang : React ne démonte ni le transport ni son client Convex.
    expect(member.type).toBe(anonymous.type)
    expect(other.type).toBe(anonymous.type)
    for (const node of [anonymous, member, other]) expect(node.props.children[0]).toBe(transport)
    expect(anonymous.props.children[1]).toBeNull()
  })

  it("replaces only the call controller when the actual owner changes", () => {
    const first = tree(authority("session-1")).props.children[1], same = tree(authority("session-1")).props.children[1], second = tree(authority("session-2")).props.children[1]
    if (!isValidElement(first) || !isValidElement(same) || !isValidElement(second)) throw new Error("an authority must mount its call controller")
    expect(same.key).toBe(first.key)
    expect(second.type).toBe(first.type)
    expect(second.key).not.toBe(first.key)
  })
})
