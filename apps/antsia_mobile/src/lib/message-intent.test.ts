import { describe, expect, it, vi } from "vitest"
import { MESSAGE_MAX_LENGTH } from "@antsia/social-contracts/messaging"
import { admittedMessageIntent, beginMessageIntent, messageOwner, uncertainMessageIntent, type MessageIntentScope } from "./message-intent"

// P17b : tests purs écrits sans exécution ; aucune connexion ni stockage.
const scope: MessageIntentScope = { networkId: "network-a", personId: "person-a", sessionId: "session-a", epoch: 1, threadId: "thread-a" }
describe("intention native de message texte", () => {
  it("nettoie le corps une fois, puis conserve exactement corps et clé après réponse perdue", () => {
    const createKey = vi.fn().mockReturnValueOnce("key-one").mockReturnValueOnce("key-two")
    const first = beginMessageIntent(null, scope, "  Bonjour  ", createKey)!
    expect(first.text).toBe("Bonjour")
    const unknown = uncertainMessageIntent(first)
    expect(beginMessageIntent(unknown, scope, "Bonjour", createKey)).toEqual({ ...first, state: "pending" })
    expect(createKey).toHaveBeenCalledOnce()
  })
  it("un double appui ne crée aucune deuxième intention ni nouvelle clé", () => {
    const createKey = vi.fn(() => "one")
    const first = beginMessageIntent(null, scope, "Bonjour", createKey)!
    expect(beginMessageIntent(first, scope, "Bonjour", createKey)).toBeNull()
    expect(beginMessageIntent(first, scope, "Autre message", createKey)).toBeNull()
    expect(createKey).toHaveBeenCalledOnce()
  })
  it("une incertitude interdit un autre corps sous la même clé", () => {
    const createKey = vi.fn(() => "one")
    const unknown = uncertainMessageIntent(beginMessageIntent(null, scope, "Original", createKey)!)
    expect(beginMessageIntent(unknown, scope, "Modifié", createKey)).toBeNull()
    expect(unknown.text).toBe("Original")
    expect(unknown.key).toBe("one")
    expect(createKey).toHaveBeenCalledOnce()
  })
  it("personne, réseau, session, époque et fil participent tous à l'isolation", () => {
    const unknown = uncertainMessageIntent(beginMessageIntent(null, scope, "Original", () => "one")!)
    for (const change of [{ networkId: "other" }, { personId: "other" }, { sessionId: "other" }, { epoch: 2 }, { threadId: "other" }]) {
      const other = { ...scope, ...change }
      expect(messageOwner(other)).not.toBe(messageOwner(scope))
      const createKey = vi.fn(() => "new")
      expect(beginMessageIntent(unknown, other, "Original", createKey)).toBeNull()
      expect(createKey).not.toHaveBeenCalled()
    }
  })
  it("le succès prouvé est distinct de la lecture et autorise une nouvelle intention après libération explicite", () => {
    const first = beginMessageIntent(null, scope, "Même texte", () => "first")!
    const received = admittedMessageIntent(first, "message-one")
    expect(received).toMatchObject({ state: "admitted", messageId: "message-one" })
    expect(received).not.toHaveProperty("readAt")
    expect(received).not.toHaveProperty("delivered")
    // L'écran conserve ce reçu à part et libère l'intention uniquement après l'ACK.
    const second = beginMessageIntent(null, scope, "Même texte", () => "second")!
    expect(second.key).not.toBe(received.key)
  })
  it("les bornes partagées ferment texte vide et dépassement sans consommer de clé", () => {
    const createKey = vi.fn(() => "new")
    expect(() => beginMessageIntent(null, scope, "  ", createKey)).toThrow()
    expect(() => beginMessageIntent(null, scope, "a".repeat(MESSAGE_MAX_LENGTH + 1), createKey)).toThrow()
    expect(createKey).not.toHaveBeenCalled()
    expect(beginMessageIntent(null, scope, "a".repeat(MESSAGE_MAX_LENGTH), createKey)?.text).toHaveLength(MESSAGE_MAX_LENGTH)
  })
})
