import { afterEach, describe, expect, it, vi } from "vitest"

import { localCommerceLoa1Allowed } from "./localCommerceSandbox"

const LOCAL = {
  ANTSIA_LOCAL_COMMERCE_LOA1: "true",
  ANTSIA_DEV_TOOLS: "true",
  CONVEX_CLOUD_URL: "http://127.0.0.1:3260",
  CONVEX_SITE_URL: "http://127.0.0.1:3261",
  FEDERATION_ENVIRONMENT: "sandbox",
  ANTSIA_COMMERCE_ENVIRONMENT: "sandbox",
  ANTSIA_COMMERCE_SOURCE: "antsia-local",
  ANTSIA_COMMERCE_ORIGIN: "http://localhost:3030",
  ANTSIA_COMMERCE_PRO_HTTP_ORIGIN: "http://127.0.0.1:3221",
  ANTSIA_COMMERCE_PRO_APP_ORIGIN: "http://localhost:3022",
  IDN_CLIENT_ID: "antsia-local_sbx_fixture",
}
const ORIGINS = ["CONVEX_SITE_URL", "ANTSIA_COMMERCE_ORIGIN", "ANTSIA_COMMERCE_PRO_HTTP_ORIGIN", "ANTSIA_COMMERCE_PRO_APP_ORIGIN"] as const

afterEach(() => vi.unstubAllEnvs())

describe("localCommerceLoa1Allowed — raccord commerce sandbox local seulement", () => {
  it("reste fermé sans configuration explicite", () => {
    expect(localCommerceLoa1Allowed({})).toBe(false)
    expect(localCommerceLoa1Allowed({ ...LOCAL, ANTSIA_LOCAL_COMMERCE_LOA1: undefined })).toBe(false)
  })

  it("admet la configuration locale complète et lit aussi l'environnement courant", () => {
    expect(localCommerceLoa1Allowed(LOCAL)).toBe(true)
    for (const [name, value] of Object.entries(LOCAL)) vi.stubEnv(name, value)
    expect(localCommerceLoa1Allowed()).toBe(true)
  })

  it.each([
    ["ANTSIA_LOCAL_COMMERCE_LOA1", "1"], ["ANTSIA_LOCAL_COMMERCE_LOA1", "false"],
    ["ANTSIA_DEV_TOOLS", "false"], ["ANTSIA_DEV_TOOLS", undefined],
    ["CONVEX_CLOUD_URL", "https://demo.example.convex.cloud"],
    ["CONVEX_CLOUD_URL", "http://127.0.0.1:3260/path"],
    ["FEDERATION_ENVIRONMENT", "production"], ["FEDERATION_ENVIRONMENT", undefined],
    ["ANTSIA_COMMERCE_ENVIRONMENT", "production"], ["ANTSIA_COMMERCE_ENVIRONMENT", undefined],
    ["ANTSIA_COMMERCE_SOURCE", "antsia"], ["ANTSIA_COMMERCE_SOURCE", undefined],
    ["IDN_CLIENT_ID", "antsia-local_prd_fixture"], ["IDN_CLIENT_ID", undefined],
  ] as const)("refuse %s=%s", (name, value) => {
    expect(localCommerceLoa1Allowed({ ...LOCAL, [name]: value })).toBe(false)
  })

  describe.each(ORIGINS)("origine exacte %s", name => {
    it.each([
      undefined, "", "pas une origine", "https://localhost:3030", "http://remote.example:3030",
      "http://127.0.0.1.example.test:3030", "http://localhost:3030/", "http://localhost:3030/path",
      "http://localhost:3030?query=1", "http://localhost:3030#fragment", "http://user:pass@localhost:3030",
    ])("refuse %s", value => {
      expect(localCommerceLoa1Allowed({ ...LOCAL, [name]: value })).toBe(false)
    })

    it("accepte les deux hôtes loopback exacts", () => {
      expect(localCommerceLoa1Allowed({ ...LOCAL, [name]: "http://localhost:3030" })).toBe(true)
      expect(localCommerceLoa1Allowed({ ...LOCAL, [name]: "http://127.0.0.1:3030" })).toBe(true)
    })
  })
})
