// @vitest-environment jsdom
/** U03 : scénarios soumis au coordinateur, non exécutés dans cette sous-tâche. */
import { describe, expect, it, vi } from "vitest"
import { retainStorySubmissionIntent } from "./story-submission-intent"

describe("story — intention précise et reprise du dépôt", () => {
  it("réutilise clé et stockage pour le même contenu après une réponse perdue", () => {
    const file = new File(["image"], "moment.jpg", { type: "image/jpeg" })
    const mint = vi.fn(() => "intent-0001")
    const first = retainStorySubmissionIntent<string>(null, { file, caption: " Un moment ", audience: "connections" }, mint)
    first.storageId = "fixture-storage"
    const retry = retainStorySubmissionIntent(first, { file, caption: "Un moment", audience: "connections" }, mint)
    expect(retry).toBe(first)
    expect(retry.storageId).toBe("fixture-storage")
    expect(mint).toHaveBeenCalledTimes(1)
  })

  it("un autre texte, une autre audience ou un autre fichier repart avec une clé propre", () => {
    const file = new File(["image"], "moment.jpg", { type: "image/jpeg" })
    let sequence = 0
    const mint = () => `intent-${++sequence}`
    const first = retainStorySubmissionIntent<string>(null, { file, caption: "A", audience: "connections" }, mint)
    first.storageId = "fixture-storage"
    for (const patch of [{ caption: "B" }, { audience: "public" as const }, { file: new File(["other"], "moment.jpg", { type: "image/jpeg" }) }]) {
      const next = retainStorySubmissionIntent(first, { file, caption: "A", audience: "connections", ...patch }, mint)
      expect(next.key).not.toBe(first.key)
      expect(next.storageId).toBeNull()
    }
    expect(first.storageId).toBe("fixture-storage")
  })
})
