// @vitest-environment edge-runtime
import { describe, expect, it } from "vitest"

import { api, components } from "../_generated/api"
import { getActiveIdentity } from "../lib/session"
import schema from "../schema"
import { modules, testConvex } from "../test.setup"

describe("harnais convex-test du moteur", () => {
  it("appelle une fonction réelle contre le schéma réel", async () => {
    const t = testConvex()
    expect(await t.query(api.health.ping, { requestedAt: 0 })).toMatchObject({ status: "ok" })
  })

  it("le glob des modules n'est jamais vide (une négation mal écrite le rend muet)", () => {
    const keys = Object.keys(modules)
    expect(keys).toContain("./health.ts")
    expect(keys.some((key) => key.includes("/_generated/"))).toBe(true)
    expect(keys.some((key) => key.endsWith(".test.ts"))).toBe(false)
  })

  it("garde la validation des tables ACTIVE (invariant du moteur)", () => {
    expect(schema.schemaValidation).toBe(true)
  })

  it("provisionne une vraie session une fois et ne la recrée pas après révocation", async () => {
    const t = testConvex()
    const as = t.withIdentity({ subject: "alice" })
    const first = await as.run((ctx) => ctx.auth.getUserIdentity())
    expect(first?.sessionId).toEqual(expect.any(String))
    expect(await as.run((ctx) => getActiveIdentity(ctx))).toMatchObject({ subject: "alice", sessionId: first?.sessionId })
    const sameSubject = t.withIdentity({ subject: "alice" })
    expect((await sameSubject.run((ctx) => ctx.auth.getUserIdentity()))?.sessionId).toBe(first?.sessionId)

    await t.mutation(components.betterAuth.adapter.deleteOne, {
      input: { model: "session", where: [{ field: "_id", value: String(first?.sessionId) }] },
    })

    expect(await as.run((ctx) => getActiveIdentity(ctx))).toBeNull()
    expect(await t.withIdentity({ subject: "alice" }).run((ctx) => getActiveIdentity(ctx))).toBeNull()
  })

  it("n'ajoute aucun claim à un test explicitement brut, ni à l'anonyme", async () => {
    const t = testConvex({ automaticSessions: false })
    expect((await t.withIdentity({ subject: "alice" }).run((ctx) => ctx.auth.getUserIdentity()))?.sessionId).toBeUndefined()
    expect(await t.run((ctx) => ctx.auth.getUserIdentity())).toBeNull()
  })

  it("ne répare jamais un claim explicite invalide dans les fixtures automatiques", async () => {
    const t = testConvex()
    const as = t.withIdentity({ subject: "alice", sessionId: "not-an-id" })
    expect((await as.run((ctx) => ctx.auth.getUserIdentity()))?.sessionId).toBe("not-an-id")
    expect(await as.run((ctx) => getActiveIdentity(ctx))).toBeNull()
  })
})
