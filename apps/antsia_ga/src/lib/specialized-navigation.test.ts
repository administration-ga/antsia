import { beforeEach, describe, expect, it, vi } from "vitest"

const harness = vi.hoisted(() => ({ namespace: "" }))
vi.mock("./demo-storage", () => ({ demoStorageNamespace: () => harness.namespace }))

import {
  parseSpecializedDestination,
  readSpecializedReturn,
  removeSpecializedReturn,
  SPECIALIZED_RETURN_TTL_MS,
  specializedReturnKey,
  writeSpecializedReturn,
  type SpecializedReturnStorage,
} from "./specialized-navigation"

const owner = { networkId: "network-a", personId: "person-a" }
const now = Date.UTC(2026, 9, 21, 12)
const path = "/fil?post=post-a"
const allowed = (href: string) => href === path

function storage() {
  const values = new Map<string, string>()
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
  }
}

beforeEach(() => { harness.namespace = "" })

describe("mémoire du retour social spécialisé", () => {
  it("retrouve seulement l'origine du même réseau et de la même personne", () => {
    const target = storage()
    expect(writeSpecializedReturn(target, owner, path, now, allowed)).toBe(true)
    expect(readSpecializedReturn(target, owner, now + 1, allowed)).toEqual({ version: 1, ...owner, href: path, recordedAt: now })
    expect(readSpecializedReturn(target, { ...owner, personId: "person-b" }, now, allowed)).toBeNull()
    expect(readSpecializedReturn(target, { ...owner, networkId: "network-b" }, now, allowed)).toBeNull()
    const original = target.values.get(specializedReturnKey(owner))!
    target.setItem(specializedReturnKey(owner), original.replace("person-a", "person-b"))
    expect(readSpecializedReturn(target, owner, now, allowed)).toBeNull()
    expect(target.values.size).toBe(0)
  })

  it("isole démo et réel, y compris l'effacement", () => {
    const target = storage()
    expect(writeSpecializedReturn(target, owner, path, now, allowed)).toBe(true)
    const main = new Map(target.values)
    harness.namespace = "antsia-demo-scope:"
    expect(specializedReturnKey(owner)).toBe("antsia-demo-scope:antsia:specialized-return:network-a:person-a")
    expect(readSpecializedReturn(target, owner, now, allowed)).toBeNull()
    expect(writeSpecializedReturn(target, owner, path, now, allowed)).toBe(true)
    expect(removeSpecializedReturn(target, owner)).toBe(true)
    expect(target.values).toEqual(main)
  })

  it("encode les composantes de la clé sans les confondre", () => {
    expect(specializedReturnKey({ networkId: "a/b", personId: "c:d" })).toBe("antsia:specialized-return:a%2Fb:c%3Ad")
  })

  it("expire à trente minutes exactement et refuse une date future", () => {
    const target = storage()
    writeSpecializedReturn(target, owner, path, now, allowed)
    expect(readSpecializedReturn(target, owner, now + SPECIALIZED_RETURN_TTL_MS - 1, allowed)?.href).toBe(path)
    expect(readSpecializedReturn(target, owner, now + SPECIALIZED_RETURN_TTL_MS, allowed)).toBeNull()
    expect(target.values.size).toBe(0)
    writeSpecializedReturn(target, owner, path, now + 1, allowed)
    expect(readSpecializedReturn(target, owner, now, allowed)).toBeNull()
  })

  it("refuse les routes non admises et retire un ancien retour devenu inadmissible", () => {
    const target = storage()
    expect(writeSpecializedReturn(target, owner, "https://example.test", now, allowed)).toBe(false)
    writeSpecializedReturn(target, owner, path, now, allowed)
    expect(readSpecializedReturn(target, owner, now, () => false)).toBeNull()
    expect(target.values.size).toBe(0)
  })

  it.each([
    "{broken",
    "x".repeat(8193),
    JSON.stringify({ version: 1, ...owner, href: path, recordedAt: now, extra: true }),
    JSON.stringify({ version: 2, ...owner, href: path, recordedAt: now }),
    JSON.stringify({ version: 1, ...owner, href: path, recordedAt: 0 }),
    JSON.stringify({ version: 1, ...owner, href: path, recordedAt: now + 0.5 }),
    JSON.stringify({ version: 1, ...owner, href: "a".repeat(4097), recordedAt: now }),
  ])("supprime une donnée malformée ou hors borne", (raw) => {
    const target = storage()
    target.setItem(specializedReturnKey(owner), raw)
    expect(readSpecializedReturn(target, owner, now, allowed)).toBeNull()
    expect(target.values.size).toBe(0)
  })

  it("ne laisse sortir aucune exception de stockage ou d'admission", () => {
    const throws = () => { throw new Error("unavailable") }
    const target: SpecializedReturnStorage = { getItem: throws, setItem: throws, removeItem: throws }
    expect(readSpecializedReturn(target, owner, now, allowed)).toBeNull()
    expect(writeSpecializedReturn(target, owner, path, now, allowed)).toBe(false)
    expect(removeSpecializedReturn(target, owner)).toBe(false)
    const current = storage()
    writeSpecializedReturn(current, owner, path, now, allowed)
    expect(readSpecializedReturn(current, owner, now, throws)).toBeNull()
    expect(current.values.size).toBe(0)
    expect(writeSpecializedReturn(current, owner, path, now, throws)).toBe(false)
  })

  it("refuse une horloge invalide et une sérialisation trop grande", () => {
    const target = storage()
    expect(writeSpecializedReturn(target, owner, path, NaN, allowed)).toBe(false)
    expect(writeSpecializedReturn(target, owner, path, 0, allowed)).toBe(false)
    expect(writeSpecializedReturn(target, owner, "\u0000".repeat(4096), now, () => true)).toBe(false)
    expect(target.values.size).toBe(0)
  })
})

describe("destination spécialisée fermée", () => {
  it("admet boutique, catalogue et offre avec seulement leurs références", () => {
    for (const kind of ["storefront", "catalog"] as const) expect(parseSpecializedDestination({ kind, handle: "atelier.ndong" })).toEqual({ kind, handle: "atelier.ndong" })
    const offer = { kind: "offer", handle: "Élégance", offerRef: "pro.ga:offer:ABC_123-abc" }
    expect(parseSpecializedDestination(offer)).toEqual(offer)
  })

  it.each([
    null, [], "storefront",
    { kind: "unknown", handle: "atelier" },
    { kind: "storefront", handle: "" },
    { kind: "storefront", handle: "a".repeat(81) },
    { kind: "storefront", handle: "../atelier" },
    { kind: "storefront", handle: "atelier", href: "/fil" },
    { kind: "catalog", handle: "atelier", offerRef: "pro.ga:offer:abc" },
    { kind: "offer", handle: "atelier" },
    { kind: "offer", handle: "atelier", offerRef: "other:abc" },
    { kind: "offer", handle: "atelier", offerRef: "pro.ga:offer:" },
    { kind: "offer", handle: "atelier", offerRef: "pro.ga:offer:a/b" },
    { kind: "offer", handle: "atelier", offerRef: `pro.ga:offer:${"a".repeat(200)}` },
    Object.create({ kind: "storefront", handle: "atelier" }) as unknown,
  ])("refuse un contrat inconnu ou malformé", (raw) => {
    expect(parseSpecializedDestination(raw)).toBeUndefined()
  })

  it("refuse les propriétés symboliques et les getters défaillants", () => {
    expect(parseSpecializedDestination({ kind: "storefront", handle: "atelier", [Symbol("extra")]: true })).toBeUndefined()
    expect(parseSpecializedDestination({ kind: "storefront", get handle(): string { throw new Error("invalid") } })).toBeUndefined()
  })
})
