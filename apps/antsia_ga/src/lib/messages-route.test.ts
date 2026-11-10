import { describe, expect, it } from "vitest"

import { parseMessagesSegments } from "./messages-route"

describe("parseMessagesSegments — l'adresse de la messagerie vers son aiguillage", () => {
  it("la liste, les deux composeurs et une conversation", () => {
    expect(parseMessagesSegments([])).toEqual({})
    expect(parseMessagesSegments(["nouveau"])).toEqual({ compose: "personne" })
    expect(parseMessagesSegments(["nouveau-groupe"])).toEqual({ compose: "groupe" })
    expect(parseMessagesSegments(["chat", "abc123"])).toEqual({ kind: "chat", id: "abc123" })
    expect(parseMessagesSegments(["a", "awa.demo"])).toEqual({ kind: "a", id: "awa.demo" })
  })

  it("décode les segments une fois", () => {
    expect(parseMessagesSegments(["groupe", "x%20y"])).toEqual({ kind: "groupe", id: "x y" })
  })

  it("admet le seul segment contextuel fermé avec un identifiant de fil", () => {
    expect(parseMessagesSegments(["mise-en-relation", "thread_123"])).toEqual({ kind: "mise-en-relation", id: "thread_123" })
    for (const id of ["", "..", "x%2Fy", "x%5Cy", "%00", "%", "x".repeat(129)]) expect(parseMessagesSegments(["mise-en-relation", id])).toBeNull()
    expect(parseMessagesSegments(["professionalCollaboration", "thread_123"])).toBeNull()
    expect(parseMessagesSegments(["%", "thread_123"])).toBeNull()
  })

  it("refuse toute autre forme (introuvable)", () => {
    expect(parseMessagesSegments(["inconnu"])).toBeNull()
    expect(parseMessagesSegments(["poste", "x"])).toBeNull()
    expect(parseMessagesSegments(["chat", "x", "y"])).toBeNull()
  })
})
