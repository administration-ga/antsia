/** P17b : bearer Better Auth déjà émis par le moteur ; aucune adoption de cookie Web. */
import { convexClient } from "@convex-dev/better-auth/client/plugins"
import { emailOTPClient, genericOAuthClient, phoneNumberClient } from "better-auth/client/plugins"
import { createAuthClient } from "better-auth/react"

import { nativeAuthBaseURL, type SessionCredentialVault } from "./secure-storage"

const VERIFY_PATHS = new Set(["/sign-in/email-otp", "/phone-number/verify", "/native-idn/exchange"])
const REQUEST_TIMEOUT_MS = 10_000

function authenticatingBody(data: unknown): boolean {
  if (!data || typeof data !== "object" || !("user" in data) || !data.user || typeof data.user !== "object") return false
  return "id" in data.user && typeof data.user.id === "string" && data.user.id.length > 0 && data.user.id.length <= 512
}

export function buildNativeAuthClient(baseURL: string, vault: SessionCredentialVault) {
  const endpoint = nativeAuthBaseURL(baseURL)
  if (endpoint !== vault.baseURL) throw new Error("nativeAuthConfigurationInvalid")
  const expected = new URL(endpoint)
  const loginRequests = new WeakMap<object, number>()

  return createAuthClient({
    baseURL: endpoint,
    disableDefaultFetchPlugins: true,
    plugins: [convexClient(), emailOTPClient(), genericOAuthClient(), phoneNumberClient()],
    fetchOptions: {
      credentials: "omit",
      redirect: "error",
      timeout: REQUEST_TIMEOUT_MS,
      retry: 0,
      async onRequest(context) {
        const url = new URL(String(context.url))
        if (url.origin !== expected.origin || !url.pathname.startsWith(`${expected.pathname}/`)) throw new Error("nativeAuthDestinationInvalid")
        const path = url.pathname.slice(expected.pathname.length)
        const generation = vault.generation
        const loginGeneration = VERIFY_PATHS.has(path) && context.method === "POST" ? vault.loginGeneration() : null
        if (VERIFY_PATHS.has(path) && loginGeneration === null) throw new Error("nativeAuthLoginRequired")
        const token = await vault.readToken()
        if (generation !== vault.generation || vault.failed) throw new Error("nativeAuthRequestCancelled")
        // Ces règles s'appliquent aussi si un appelant fournit des options locales au SDK.
        context.credentials = "omit"
        context.redirect = "error"
        context.headers.delete("cookie")
        context.headers.delete("better-auth-cookie")
        context.headers.delete("authorization")
        if (token) context.headers.set("authorization", `Bearer ${token}`)
        if (loginGeneration !== null) loginRequests.set(context, loginGeneration)
      },
      async onSuccess(context) {
        const generation = loginRequests.get(context.request)
        loginRequests.delete(context.request)
        if (generation === undefined || generation !== vault.loginGeneration() || generation !== vault.generation) return
        if (!context.response.ok || !authenticatingBody(context.data)) return
        const token = context.response.headers.get("set-auth-token")
        if (!token) { await vault.clear(); throw new Error("nativeAuthCredentialMissing") }
        await vault.captureToken(token, generation)
      },
    },
  })
}

export type NativeAuthClient = ReturnType<typeof buildNativeAuthClient>
