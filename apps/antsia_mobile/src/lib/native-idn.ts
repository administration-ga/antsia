import { createNativeIdnAttempt, nativeIdnReturn } from "@antsia/social-native/idn"
import { nativeRequest } from "@antsia/social-native/request"
import type { NativeAuthClient } from "./auth-client"
import type { SessionCredentialVault } from "./secure-storage"

/** Orchestration sans état React ; le propriétaire ferme le coffre en cas d'échec. */
export async function runNativeIdn(input: {
  scheme: string
  webUrl: string
  auth: NativeAuthClient
  vault: SessionCredentialVault
  isCurrent: () => boolean
  isForeground: () => boolean
  randomToken: () => Promise<string>
  sha256: (value: string) => Promise<string>
  openSession: (url: string, redirectUri: string) => Promise<{ type: string; url?: string }>
}): Promise<boolean> {
  const { auth, vault, isCurrent, isForeground } = input
  let generation: number | undefined
  const current = () => isCurrent() && (generation === undefined || vault.generation === generation)
  try {
    if (!current()) return false
    const web = new URL(input.webUrl)
    if (web.protocol !== "https:" || web.username || web.password || web.pathname !== "/" || web.search || web.hash) {
      throw new Error("nativeIdnDestinationInvalid")
    }
    const attempt = await createNativeIdnAttempt({ scheme: input.scheme, randomToken: input.randomToken, sha256: input.sha256 })
    if (!current()) return false
    const callbackURL = new URL("/api/auth/native/return", web).href
    const start = await nativeRequest(signal => auth.signIn.oauth2({
      providerId: "idn", disableRedirect: true, callbackURL, newUserCallbackURL: callbackURL, errorCallbackURL: callbackURL,
      additionalData: { antsiaNative: { challenge: attempt.challenge, state: attempt.state, redirectUri: attempt.redirectUri } },
      fetchOptions: { signal, throw: false },
    }))
    if (!current()) return false
    if (start.error || !start.data?.url) throw new Error("nativeIdnUnavailable")
    const authorization = new URL(start.data.url)
    if (authorization.protocol !== "https:" || authorization.username || authorization.password || authorization.hash) throw new Error("nativeIdnDestinationInvalid")
    const result = await input.openSession(authorization.href, attempt.redirectUri)
    if (!current() || result.type !== "success") return false
    const returned = result.url ? nativeIdnReturn(result.url, attempt) : null
    if (!returned) throw new Error("nativeIdnReturnInvalid")
    // Certains systèmes rendent le callback avant le changement d'état de l'app.
    const deadline = Date.now() + 5_000
    for (let poll = 0; !isForeground() && current() && poll < 200 && Date.now() < deadline; poll += 1) {
      await new Promise<void>(resolve => setTimeout(resolve, 25))
    }
    if (!current()) return false
    if (!isForeground()) throw new Error("nativeIdnForegroundRequired")
    generation = vault.beginLogin()
    const exchanged = await nativeRequest(signal => auth.$fetch<{ session: { id: string; userId: string }; user: { id: string } }>("/native-idn/exchange", {
      method: "POST", body: { code: returned.code, verifier: attempt.verifier }, signal, throw: false,
    }))
    if (!current()) return false
    const proof = exchanged.data
    if (exchanged.error || typeof proof?.session?.id !== "string" || !proof.session.id
      || typeof proof.user?.id !== "string" || !proof.user.id || proof.session.userId !== proof.user.id || !vault.hasCredential) {
      throw new Error("nativeIdnExchangeInvalid")
    }
    if (!isForeground()) throw new Error("nativeIdnForegroundRequired")
    const fresh = await nativeRequest(signal => auth.getSession({ query: { disableCookieCache: true }, fetchOptions: { signal, throw: false } }))
    if (!current()) return false
    if (!isForeground()) throw new Error("nativeIdnForegroundRequired")
    const session = fresh.data?.session
    const expiresAt = session ? new Date(session.expiresAt).getTime() : NaN
    if (fresh.error || session?.id !== proof.session.id || fresh.data?.user.id !== proof.user.id
      || session.userId !== proof.user.id || !Number.isFinite(expiresAt) || expiresAt <= Date.now() || !vault.hasCredential) {
      throw new Error("nativeIdnSessionMismatch")
    }
    return true
  } catch (error) {
    if (!isCurrent()) return false
    // Le SDK purge lui-même une preuve absente/invalide : ce changement de
    // génération est un échec d'authentification, pas une annulation utilisateur.
    if (error instanceof Error && ["nativeAuthCredentialMissing", "nativeAuthCredentialInvalid", "nativeCredentialStorageUnavailable"].includes(error.message)) throw error
    if (!current()) return false
    throw error
  }
}
