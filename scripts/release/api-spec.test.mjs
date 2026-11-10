import { describe, expect, test } from "bun:test"

import { apiFingerprint, blockingRemovals, canonicalJson, compareApi, extractJsonDocument, isLocalSpec, readFunctionSpec } from "./api-spec.mjs"

const fn = (identifier, extra = {}) => ({ identifier, functionType: "Query", visibility: { kind: "public" }, args: { type: "object", value: {} }, returns: { type: "any" }, ...extra })
const spec = (functions, url = "http://127.0.0.1:3210") => ({ url, functions })

describe("relevé function-spec", () => {
  test("lit le JSON après la ligne du lanceur convex-dev", () => {
    const output = "[convex-dev] Node v22.22.0 en tête du PATH de `convex function-spec` pour le backend local.\n{\n  \"url\": \"http://127.0.0.1:3210\",\n  \"functions\": []\n}\n"
    expect(extractJsonDocument(output)).toEqual({ url: "http://127.0.0.1:3210", functions: [] })
  })

  test("refuse une sortie sans document, un relevé sans liste ou une entrée en double", () => {
    expect(() => extractJsonDocument("aucune sortie")).toThrow("sans document JSON")
    expect(() => readFunctionSpec({ url: "x" })).toThrow("liste « functions » absente")
    expect(() => readFunctionSpec(spec([fn("a.js:x"), fn("a.js:x")]))).toThrow("en double")
  })

  test("une action HTTP se range par méthode et chemin", () => {
    const { entries } = readFunctionSpec(spec([{ functionType: "HttpAction", method: "POST", path: "/federation/inbox" }]))
    expect([...entries.keys()]).toEqual(["HTTP POST /federation/inbox"])
  })
})

describe("empreinte de l'API", () => {
  test("ignore l'ordre des fonctions, l'ordre des clés et l'adresse du déploiement", () => {
    const a = spec([fn("a.js:x"), fn("b.js:y")], "http://127.0.0.1:3210")
    const b = { functions: [{ ...fn("b.js:y") }, Object.fromEntries(Object.entries(fn("a.js:x")).reverse())] }
    expect(apiFingerprint(a)).toBe(apiFingerprint(b))
    expect(canonicalJson({ b: 1, a: [2, { d: 3, c: 4 }] })).toBe('{"a":[2,{"c":4,"d":3}],"b":1}')
  })

  test("change dès qu'une signature change", () => {
    const before = spec([fn("a.js:x")])
    const after = spec([fn("a.js:x", { returns: { type: "string" } })])
    expect(apiFingerprint(before)).not.toBe(apiFingerprint(after))
  })
})

describe("garde avant l'envoi : ne jamais retirer une fonction plus récente", () => {
  const online = spec([fn("a.js:x"), fn("posts.js:nouvelle"), fn("b.js:y", { returns: { type: "number" } })])
  const candidate = spec([fn("a.js:x"), fn("b.js:y"), fn("c.js:ajout")])

  test("nomme les retraits, ajouts et signatures changées", () => {
    expect(compareApi(online, candidate)).toEqual({ missing: ["posts.js:nouvelle"], added: ["c.js:ajout"], changed: ["b.js:y"] })
  })

  test("un retrait bloque ; un retour arrière n'admet que les fonctions ajoutées par la publication annulée", () => {
    const comparison = compareApi(online, candidate)
    expect(blockingRemovals(comparison)).toEqual(["posts.js:nouvelle"])
    expect(blockingRemovals(comparison, ["posts.js:nouvelle"])).toEqual([])
    expect(blockingRemovals(comparison, ["autre.js:z"])).toEqual(["posts.js:nouvelle"])
  })

  test("le relevé du candidat doit venir d'un backend local", () => {
    expect(isLocalSpec(spec([], "http://127.0.0.1:3330"))).toBe(true)
    expect(isLocalSpec(spec([], "http://localhost:3210"))).toBe(true)
    expect(isLocalSpec(spec([], "https://moteur.exemple.test"))).toBe(false)
    expect(isLocalSpec({ functions: [] })).toBe(false)
  })
})
