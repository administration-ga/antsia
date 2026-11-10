import { afterEach, describe, expect, it, vi } from "vitest"

import { register } from "./instrumentation"

const initialStackLimit = Error.stackTraceLimit

afterEach(() => {
  Error.stackTraceLimit = initialStackLimit
  vi.unstubAllEnvs()
})

describe("diagnostics du serveur de développement", () => {
  it("garde des erreurs avec leurs sources au budget usuel de Node", () => {
    vi.stubEnv("NODE_ENV", "development")
    vi.stubEnv("NEXT_RUNTIME", "nodejs")
    vi.stubEnv("ANTSIA_DEV_EXTENDED_STACKS", "")
    Error.stackTraceLimit = 50

    register()

    expect(Error.stackTraceLimit).toBe(10)
    const stack = new Error("diagnostic-test").stack
    expect(stack).toContain("diagnostic-test")
    expect(stack).toContain("instrumentation.test.ts")
  })

  it("permet de demander les traces longues pour un diagnostic ponctuel", () => {
    vi.stubEnv("NODE_ENV", "development")
    vi.stubEnv("NEXT_RUNTIME", "nodejs")
    vi.stubEnv("ANTSIA_DEV_EXTENDED_STACKS", "1")

    register()

    expect(Error.stackTraceLimit).toBe(50)
  })

  it.each([
    ["production", "nodejs"],
    ["development", "edge"],
    ["test", "nodejs"],
  ])("préserve le réglage existant hors serveur Node de développement : %s/%s", (environment, runtime) => {
    vi.stubEnv("NODE_ENV", environment)
    vi.stubEnv("NEXT_RUNTIME", runtime)
    vi.stubEnv("ANTSIA_DEV_EXTENDED_STACKS", "1")
    Error.stackTraceLimit = 27

    register()

    expect(Error.stackTraceLimit).toBe(27)
  })
})
