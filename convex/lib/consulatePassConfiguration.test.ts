import { afterEach, describe, expect, it, vi } from "vitest"
import { api } from "../_generated/api"
import { testConvex } from "../test.setup"
import { consulatePassConfiguration } from "./consulatePassConfiguration"

const valid = {
  DIASPORA_PASS_SECRET: "x".repeat(32),
  CONSULAT_PASS_ISSUER: "https://issuer.example",
  DIASPORA_PASS_APP_ORIGIN: "https://diaspora.example",
}

describe("configuration de la passerelle consulaire", () => {
  afterEach(() => vi.unstubAllEnvs())

  it("annonce à un visiteur l’origine seule et retire la capacité si le secret manque", async () => {
    for (const [key, value] of Object.entries(valid)) vi.stubEnv(key, value)
    const engine = testConvex({ automaticSessions: false })
    const config = await engine.query(api.modules.platform.authentication.configuration, {})
    expect(config.consulatePassOrigin).toBe(valid.DIASPORA_PASS_APP_ORIGIN)
    expect(JSON.stringify(config)).not.toContain(valid.DIASPORA_PASS_SECRET)
    expect(JSON.stringify(config)).not.toContain(valid.CONSULAT_PASS_ISSUER)
    vi.stubEnv("DIASPORA_PASS_SECRET", undefined)
    expect(await engine.query(api.modules.platform.authentication.configuration, {})).not.toHaveProperty("consulatePassOrigin")
  })

  it("exige les trois paramètres de l’échange", () => {
    expect(consulatePassConfiguration(valid)).toEqual({
      secret: valid.DIASPORA_PASS_SECRET, issuer: valid.CONSULAT_PASS_ISSUER, origin: valid.DIASPORA_PASS_APP_ORIGIN,
    })
    for (const key of Object.keys(valid)) expect(consulatePassConfiguration({ ...valid, [key]: undefined })).toBeNull()
  })

  it("écarte les secrets trop courts, les chemins et les origines non HTTPS", () => {
    expect(consulatePassConfiguration({ ...valid, DIASPORA_PASS_SECRET: " ".repeat(32) })).toBeNull()
    expect(consulatePassConfiguration({ ...valid, CONSULAT_PASS_ISSUER: "https://issuer.example/path" })).toBeNull()
    expect(consulatePassConfiguration({ ...valid, DIASPORA_PASS_APP_ORIGIN: "http://diaspora.example" })).toBeNull()
  })
})
