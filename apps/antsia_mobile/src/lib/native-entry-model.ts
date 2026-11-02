/** Native counterparts of the Web IdentityEntry presentation rules; no session authority. */
export type NativeEntryChannel = "email" | "phone"
export type NativeEntryIntent = "sign-in" | "sign-up"
export type NativePublicLegalKind = "about" | "legal" | "privacy"
export type NativeEntryConfiguration = { idn: boolean; emailOtp: boolean; smsOtp: boolean }
export const NATIVE_OTP_COOLDOWN_MS = 60_000

export function nativeEntryChannel(selected: NativeEntryChannel, configuration: NativeEntryConfiguration | null | undefined): NativeEntryChannel {
  return selected === "email" && configuration?.emailOtp === false && configuration.smsOtp ? "phone" : selected
}

export function nativeEntryError(error: unknown): string {
  if (error instanceof Error) return "mobile.entry.identity.errors.network"
  const data = typeof error === "object" && error !== null ? error as Record<string, unknown> : {}
  const code = typeof data.code === "string" ? data.code : ""
  if (data.status === 429 || code === "rateLimited" || code === "TOO_MANY_ATTEMPTS") return "mobile.entry.identity.errors.rateLimited"
  if (code === "INVALID_OTP") return "mobile.entry.identity.errors.invalidCode"
  if (code === "OTP_EXPIRED" || code === "OTP_NOT_FOUND") return "mobile.entry.identity.errors.expiredCode"
  if (code === "otpDeliveryUnavailable" || code === "smsDeliveryUnavailable" || code === "SEND_OTP_NOT_IMPLEMENTED") return "mobile.entry.identity.errors.deliveryUnavailable"
  if (code === "INVALID_PHONE_NUMBER") return "mobile.entry.identity.errors.invalidPhone"
  return "mobile.entry.identity.errors.generic"
}

/** An SDK request completing is distinct from the server confirming its delivery admission. */
export function nativeOtpSendAccepted(channel: NativeEntryChannel, response: unknown): boolean {
  if (typeof response !== "object" || response === null || !("data" in response)) return false
  if ("error" in response && response.error != null) return false
  const data = response.data
  if (typeof data !== "object" || data === null) return false
  return channel === "email" ? "success" in data && data.success === true
    : "message" in data && typeof data.message === "string" && data.message.length > 0
}

export function nativeOtpCooldownKey(channel: NativeEntryChannel, identifier: string): string {
  const value = identifier.trim()
  return `${channel}:${channel === "email" ? value.toLocaleLowerCase("en") : value}`
}
export function nativeOtpRemaining(deadline: number, now: number): number {
  if (!Number.isFinite(deadline) || !Number.isFinite(now)) return 0
  return Math.max(0, Math.ceil((deadline - now) / 1_000))
}

/** Public empty windows preserve their opaque cursor; repetition/end/bounds stop the reader. */
export function nativePublicNext(cursors: readonly (string | null)[], page: { isDone: boolean; continueCursor: string } | undefined): string | null {
  if (!page || page.isDone || !page.continueCursor || page.continueCursor.length > 8192 || cursors.length >= 10 || cursors.includes(page.continueCursor)) return null
  return page.continueCursor
}

export function nativeEntryText(t: (key: string) => string, key: string, values: Record<string, string | number> = {}): string {
  return t(key).replace(/\{\{(\w+)\}\}/g, (match: string, name: string) => Object.hasOwn(values, name) ? String(values[name]) : match)
}

export type NativeOnboardingValues = { displayName: string; handle: string; consent: boolean; locale: "fr" | "en"; timeZone: string }
/** Called by the explicit form submission only; every awaited step rechecks its original session. */
export async function completeNativeOnboarding(input: {
  values: NativeOnboardingValues
  needsPerson: boolean
  consentInForce: boolean
  current: () => boolean
  ensurePerson: () => Promise<unknown>
  handleAvailable: () => Promise<{ available: boolean }>
  recordConsent: () => Promise<unknown>
  setPreferences: () => Promise<unknown>
  publishProfile: () => Promise<unknown>
  joinNetwork: () => Promise<unknown>
}): Promise<"complete" | "stale" | "consentRequired" | "handleUnavailable"> {
  if (!input.values.consent && !input.consentInForce) return "consentRequired"
  if (!input.current()) return "stale"
  if (input.needsPerson) { await input.ensurePerson(); if (!input.current()) return "stale" }
  const handle = await input.handleAvailable()
  if (!input.current()) return "stale"
  if (!handle.available) return "handleUnavailable"
  if (!input.consentInForce) { await input.recordConsent(); if (!input.current()) return "stale" }
  await input.setPreferences()
  if (!input.current()) return "stale"
  await input.publishProfile()
  if (!input.current()) return "stale"
  await input.joinNetwork()
  return input.current() ? "complete" : "stale"
}
