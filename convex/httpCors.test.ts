// @vitest-environment edge-runtime
/**
 * EA-08 (issue #151) — le délai restant d'un refus de débit (`Retry-After`) est lisible depuis
 * une autre origine de confiance : le routeur HTTP (`convex/http.ts`) l'expose avec le cookie de
 * session du greffon crossDomain. Une origine étrangère ne reçoit aucun en-tête CORS.
 *
 * Recette par le VRAI routeur (`t.fetch`), Better Auth et limiteur de débit compris, sans
 * service externe.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { testConvex } from "./test.setup"

const PRIMARY_ORIGIN = "http://localhost:3030"
const FOREIGN_ORIGIN = "https://etranger.example.test"
const SIGN_IN_PATH = "/api/auth/sign-in/email-otp"
const EMAIL = "cors.debit@example.test"

beforeEach(() => {
  vi.stubEnv("SITE_URL", PRIMARY_ORIGIN)
  vi.stubEnv("CONVEX_SITE_URL", "http://127.0.0.1:3211")
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  vi.stubEnv("ANTSIA_DEV_TOOLS", "true")
  vi.stubEnv("BETTER_AUTH_SECRET", "fictional-cors-test-secret-at-least-thirty-two-characters")
  for (const key of ["IDN_CLIENT_ID", "IDN_CLIENT_SECRET", "IDN_ISSUER", "IDN_DISCOVERY_URL", "RESEND_API_KEY", "RESEND_FROM_ADDRESS", "SMS_PROVIDER", "SMS_ENDPOINT", "SMS_API_KEY", "TRUSTED_ORIGINS", "AUTH_DEFAULT_LOCALE"]) vi.stubEnv(key, undefined)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

/** Les en-têtes qu'un navigateur laisse lire au script de l'autre origine. */
function exposedHeaders(response: Response): string[] {
  return (response.headers.get("access-control-expose-headers") ?? "").split(",").map((name) => name.trim().toLowerCase()).filter(Boolean)
}

function signIn(t: ReturnType<typeof testConvex>, origin: string) {
  return t.fetch(SIGN_IN_PATH, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ email: EMAIL, otp: "000000" }) })
}

describe("CORS des routes d'authentification — en-têtes exposés", () => {
  it("la pré-vérification d'une origine de confiance expose le cookie de session et Retry-After ; une origine étrangère ne reçoit rien", async () => {
    const t = testConvex({ automaticSessions: false })
    const trusted = await t.fetch(SIGN_IN_PATH, { method: "OPTIONS", headers: { Origin: PRIMARY_ORIGIN, "Access-Control-Request-Method": "POST" } })
    expect(trusted.status).toBe(204)
    expect(trusted.headers.get("access-control-allow-origin")).toBe(PRIMARY_ORIGIN)
    expect(exposedHeaders(trusted)).toEqual(["set-better-auth-cookie", "retry-after"])
    const foreign = await t.fetch(SIGN_IN_PATH, { method: "OPTIONS", headers: { Origin: FOREIGN_ORIGIN, "Access-Control-Request-Method": "POST" } })
    expect(foreign.headers.get("access-control-allow-origin")).toBeNull()
    expect(foreign.headers.get("access-control-expose-headers")).toBeNull()
  })

  it("un refus de débit servi à une origine de confiance porte Retry-After et le laisse lire", async () => {
    const t = testConvex({ automaticSessions: false })
    // Seau `auth.login` : cinq essais par quinze minutes, le sixième est refusé.
    for (let attempt = 0; attempt < 5; attempt++) expect((await signIn(t, PRIMARY_ORIGIN)).status).toBe(400)
    const refusal = await signIn(t, PRIMARY_ORIGIN)
    expect(refusal.status).toBe(429)
    expect(refusal.headers.get("access-control-allow-origin")).toBe(PRIMARY_ORIGIN)
    expect(exposedHeaders(refusal)).toContain("retry-after")
    const body = await refusal.json() as { code?: unknown; retryAfterMs?: unknown }
    expect(body.code).toBe("rateLimited")
    expect(typeof body.retryAfterMs).toBe("number")
    expect(refusal.headers.get("retry-after")).toBe(String(Math.max(1, Math.ceil((body.retryAfterMs as number) / 1_000))))
  })
})
