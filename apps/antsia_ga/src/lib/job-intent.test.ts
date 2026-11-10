import { describe, expect, it } from "vitest"
import { JOB_INTENT_TTL_MS, jobIntentKey, parseJobIntent, readJobIntent, removeJobIntent, writeJobIntent, type JobIntent, type JobIntentStorage } from "./job-intent"

// Scénarios écrits, non exécutés : aucune absence serveur n'est déduite du navigateur.
const now = Date.UTC(2026, 9, 20, 12)
const scope = { networkId: "network-a", personId: "person-a", handle: "atelier", jobRef: "job-a" }
const intent: JobIntent = { ...scope, version: 1, idempotencyKey: "a".repeat(32), createdAt: now }
function storage(initial: string | null = null): JobIntentStorage {
  const values = new Map<string, string>(initial === null ? [] : [[jobIntentKey(scope), initial]])
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value) }, removeItem: (key) => { values.delete(key) } }
}
describe("index privé minimal d'intention emploi", () => {
  it("persiste seulement les références et la clé, puis vérifie leur écriture", () => {
    const target = storage()
    expect(writeJobIntent(target, intent, now)).toBe(true)
    expect(JSON.parse(target.getItem(jobIntentKey(scope))!)).toEqual(intent)
    expect(Object.keys(intent).sort()).toEqual(["createdAt", "handle", "idempotencyKey", "jobRef", "networkId", "personId", "version"])
    expect(readJobIntent(target, scope, now)).toEqual(intent)
  })
  it("isole personne, réseau, boutique et offre ; un index déplacé ne vaut jamais absence", () => {
    for (const other of [{ personId: "other" }, { networkId: "other" }, { handle: "other" }, { jobRef: "other" }]) {
      const different = { ...scope, ...other }
      expect(jobIntentKey(different)).not.toBe(jobIntentKey(scope))
      expect(parseJobIntent(JSON.stringify(intent), different, now)).toBeNull()
      expect(() => readJobIntent({ ...storage(), getItem: () => JSON.stringify(intent) }, different, now)).toThrow("invalidJobIntent")
    }
  })
  it("une clé expirée reste disponible pour recherche et clôture, jamais pour un nouvel envoi", () => {
    const target = storage(JSON.stringify(intent)), later = now + JOB_INTENT_TTL_MS
    expect(parseJobIntent(JSON.stringify(intent), scope, later)).toBeNull()
    expect(readJobIntent(target, scope, later)).toEqual(intent)
    expect(writeJobIntent(target, intent, later)).toBe(false)
    expect(target.getItem(jobIntentKey(scope))).toBe(JSON.stringify(intent))
  })
  it("ferme un index corrompu, futur ou contenant des données personnelles sans l'effacer", () => {
    for (const raw of ["{", JSON.stringify({ ...intent, firstName: "Awa" }), JSON.stringify({ ...intent, fileIds: ["cv"] }), JSON.stringify({ ...intent, consent: true }), JSON.stringify({ ...intent, createdAt: now + 1 })]) {
      const target = storage(raw)
      expect(() => readJobIntent(target, scope, now)).toThrow("invalidJobIntent")
      expect(target.getItem(jobIntentKey(scope))).toBe(raw)
    }
  })
  it("une écriture refusée ou non conservée interdit l'envoi ; la suppression doit aussi être certaine", () => {
    const target = storage()
    expect(writeJobIntent({ ...target, setItem: () => { throw new Error("quota") } }, intent, now)).toBe(false)
    expect(writeJobIntent({ ...target, setItem: () => {} }, intent, now)).toBe(false)
    const held = storage(JSON.stringify(intent))
    expect(removeJobIntent({ ...held, removeItem: () => {} }, scope)).toBe(false)
    expect(removeJobIntent(held, scope)).toBe(true)
  })
})
