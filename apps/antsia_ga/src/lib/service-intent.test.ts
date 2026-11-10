import { describe, expect, it } from "vitest"
import { parseServiceIntent, readServiceIntent, removeServiceIntent, serviceIntentKey, SERVICE_INTENT_TTL_MS, writeServiceIntent, type ServiceIntent, type ServiceIntentScope } from "./service-intent"

const now = Date.UTC(2026, 9, 20, 12)
const scope: ServiceIntentScope = { networkId: "network-a", personId: "person-a", mode: "booking", handle: "atelier", offerRef: "pro.ga:offer:offre" }
const intent = (): ServiceIntent => ({ ...scope, version: 1, clientRequestId: "stable-client-request", createdAt: now })
function storage() { const map = new Map<string, string>(); return { map, getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => { map.set(key, value) }, removeItem: (key: string) => { map.delete(key) } } }

describe("index de reprise privé P14", () => {
  it("isole personne, réseau, mode, boutique, offre et demande connue", () => {
    const raw = JSON.stringify(intent())
    for (const other of [{ ...scope, personId: "other" }, { ...scope, networkId: "other" }, { ...scope, mode: "quote" as const }, { ...scope, handle: "other" }, { ...scope, offerRef: "other" }, { ...scope, requestRowId: "request-other" }]) {
      expect(serviceIntentKey(other)).not.toBe(serviceIntentKey(scope))
      expect(parseServiceIntent(raw, other, now)).toBeNull()
    }
  })
  it("ne persiste jamais besoin, note, nom, pièce, accord ou token", () => {
    for (const field of ["need", "note", "contactName", "attachmentMessageIds", "consent", "token"]) expect(parseServiceIntent(JSON.stringify({ ...intent(), [field]: "private" }), scope, now)).toBeNull()
    const target = storage()
    expect(writeServiceIntent(target, intent(), now)).toBe(true)
    expect(JSON.parse(target.getItem(serviceIntentKey(scope))!)).toEqual(intent())
  })
  it("l'échéance 24 h interdit l'envoi mais conserve la clé pour recherche/fence, jamais absence déduite", () => {
    const target = storage()
    writeServiceIntent(target, intent(), now)
    const expiredAt = now + SERVICE_INTENT_TTL_MS
    expect(parseServiceIntent(JSON.stringify(intent()), scope, expiredAt)).toBeNull()
    expect(writeServiceIntent(target, intent(), expiredAt)).toBe(false)
    expect(readServiceIntent(target, scope, expiredAt)).toEqual(intent())
    expect(target.getItem(serviceIntentKey(scope))).not.toBeNull()
    expect(removeServiceIntent(target, scope)).toBe(true)
  })
  it("une corruption ou un stockage indisponible ne devient pas un panier vide", () => {
    const target = storage()
    target.setItem(serviceIntentKey(scope), "{broken")
    expect(() => readServiceIntent(target, scope, now)).toThrow("invalidServiceIntent")
    expect(target.getItem(serviceIntentKey(scope))).toBe("{broken")
    expect(writeServiceIntent({ ...target, setItem: () => { throw new Error("blocked") } }, intent(), now)).toBe(false)
  })
})


describe("MP06b — reprise d'un refus de devis client", () => {
  const rejection: ServiceIntentScope = { ...scope, mode: "quote_rejection", requestRowId: "private-request" }
  const acceptance: ServiceIntentScope = { ...rejection, mode: "quote_acceptance" }
  it("garde le refus distinct de l'acceptation et conserve leurs deux clés sans contenu de devis", () => {
    const target = storage()
    const value: ServiceIntent = { ...rejection, version: 1, clientRequestId: "quote-rejection-client-key", createdAt: now }
    const accept: ServiceIntent = { ...value, ...acceptance, clientRequestId: "quote-acceptance-client-key" }
    expect(writeServiceIntent(target, value, now)).toBe(true)
    expect(writeServiceIntent(target, accept, now)).toBe(true)
    expect(serviceIntentKey(rejection)).not.toBe(serviceIntentKey(acceptance))
    expect(readServiceIntent(target, rejection, now)).toEqual(value)
    expect(readServiceIntent(target, acceptance, now)).toEqual(accept)
    expect(removeServiceIntent(target, rejection)).toBe(true)
    expect(readServiceIntent(target, acceptance, now)).toEqual(accept)
  })
  it("ne requalifie pas une clé expirée ou appartenant à une autre personne en nouvel envoi", () => {
    const target = storage()
    const value: ServiceIntent = { ...rejection, version: 1, clientRequestId: "quote-rejection-client-key", createdAt: now }
    expect(writeServiceIntent(target, value, now)).toBe(true)
    expect(readServiceIntent(target, rejection, now + SERVICE_INTENT_TTL_MS)).toEqual(value)
    expect(parseServiceIntent(JSON.stringify(value), { ...rejection, personId: "other" }, now)).toBeNull()
    for (const field of ["quoteVersion", "quoteRef", "consent", "reason", "rejectionNote"]) expect(parseServiceIntent(JSON.stringify({ ...value, [field]: "private" }), rejection, now)).toBeNull()
  })
})
