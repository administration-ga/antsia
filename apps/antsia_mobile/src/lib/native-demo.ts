import { nativeRequest } from "@antsia/social-native/request"
import type { NativeAuthClient } from "./auth-client"
import type { SessionCredentialVault } from "./secure-storage"

export type NativeDemoAccount = {
  actor: string
  email: string
  profile: { displayName: string; handle: string; headline: string } | null
}
export type NativeDemoQueries = {
  configuration: () => Promise<{ demoAccounts: boolean; emailOtp: boolean }>
  catalogue: () => Promise<readonly NativeDemoAccount[]>
  latestOtp: (email: string) => Promise<{ code: string; expiresAt: number } | null>
}

/** Same OTP admission as the Web demo. No bootstrap, consent, profile or content mutation. */
export async function runNativeDemo(input: {
  enabled: boolean
  actor: string
  auth: NativeAuthClient
  vault: SessionCredentialVault
  queries: NativeDemoQueries
  isCurrent: () => boolean
  isForeground: () => boolean
  now?: () => number
}): Promise<boolean> {
  const { auth, vault, queries } = input
  const now = input.now ?? Date.now
  let generation: number | undefined
  const current = () => input.isCurrent() && input.isForeground()
    && (generation === undefined || vault.generation === generation)
  if (!current()) return false
  if (!input.enabled || !vault.ready || vault.failed || vault.hasCredential) throw new Error("nativeDemoUnavailable")
  try {
    const configuration = await nativeRequest(() => queries.configuration())
    if (!current()) return false
    if (!configuration.demoAccounts || !configuration.emailOtp) throw new Error("nativeDemoUnavailable")
    const catalogue = await nativeRequest(() => queries.catalogue())
    if (!current()) return false
    const account = catalogue.find(item => item.actor === input.actor)
    if (!account || !/^[a-z][a-z0-9_-]*$/u.test(account.actor)
      || account.email !== `${account.actor}@demo.antsia.test`) throw new Error("nativeDemoAccountUnavailable")
    const sent = await nativeRequest(signal => auth.emailOtp.sendVerificationOtp({
      email: account.email, type: "sign-in", fetchOptions: { signal, throw: false },
    }))
    if (!current()) return false
    if (sent.error) throw new Error("nativeDemoUnavailable")
    let code: string | null = null
    for (let read = 0; read < 8 && code === null; read += 1) {
      const latest = await nativeRequest(() => queries.latestOtp(account.email))
      if (!current()) return false
      if (latest && /^\d{6}$/u.test(latest.code) && latest.expiresAt > now()) code = latest.code
      else if (read < 7) await new Promise<void>(resolve => setTimeout(resolve, 250))
      if (!current()) return false
    }
    if (code === null) throw new Error("nativeDemoUnavailable")
    generation = vault.beginLogin()
    const verified = await nativeRequest(signal => auth.signIn.emailOtp({
      email: account.email, otp: code, fetchOptions: { signal, throw: false },
    }))
    if (!current()) return false
    const verifiedUser = verified.data?.user
    if (verified.error || !verifiedUser?.id || !vault.hasCredential) throw new Error("nativeDemoSessionInvalid")
    const fresh = await nativeRequest(signal => auth.getSession({
      query: { disableCookieCache: true }, fetchOptions: { signal, throw: false },
    }))
    if (!current()) return false
    const session = fresh.data?.session, user = fresh.data?.user
    const expiry = session ? new Date(session.expiresAt).getTime() : NaN
    if (fresh.error || !session || !user || session.userId !== user.id || user.id !== verifiedUser.id
      || user.email.toLowerCase() !== account.email || !Number.isFinite(expiry)
      || expiry <= now() || !vault.hasCredential) throw new Error("nativeDemoSessionInvalid")
    return true
  } catch (error) {
    // An unrelated newer login or another environment never loses its credential.
    if (generation !== undefined && generation === vault.generation) {
      vault.fence()
      if (vault.hasCredential) await vault.clear()
    }
    throw error
  }
}
