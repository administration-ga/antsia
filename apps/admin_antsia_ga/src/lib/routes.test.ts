import { describe, expect, it } from "vitest"

import { readConsoleState, routes } from "./routes"

describe("état adressable de la console", () => {
  it("n'accepte que des sections fermées et garde un paramètre réseau comme texte à résoudre", () => {
    expect(readConsoleState("?section=teams&network=network-one")).toEqual({ section: "teams", networkId: "network-one" })
    expect(readConsoleState("?section=unsafe&network=forged")).toEqual({ section: "networks", networkId: "forged" })
  })
  it("déclare la section Fichiers (EX-17) et l'encode comme les autres", () => {
    expect(readConsoleState("?section=files")).toEqual({ section: "files", networkId: "" })
    expect(routes.consoleState("files")).toBe(routes.home() + "?section=files")
  })
  it("encode le contexte sans modifier le chemin ni admettre une nouvelle URL", () => {
    const encoded = routes.consoleState("appeals", "/elsewhere?section=unsafe")
    expect(encoded.startsWith(routes.home() + "?")).toBe(true)
    expect(new URLSearchParams(encoded.slice(encoded.indexOf("?"))).get("section")).toBe("appeals")
    expect(new URLSearchParams(encoded.slice(encoded.indexOf("?"))).get("network")).toBe("/elsewhere?section=unsafe")
  })
})
