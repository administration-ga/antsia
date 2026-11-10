"use client"

import type { AuthRequestOptions } from "@antsia/api/sign-out-everywhere"
import { Button, Card, Field, TextInput } from "@antsia/ui"
import { zodResolver } from "@hookform/resolvers/zod"
import { KeyRound, LoaderCircle, Mail, ShieldCheck, Smartphone } from "lucide-react"
import { type ReactNode, useEffect, useId, useRef, useState } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { z } from "zod"

export type IdentityConfiguration = { idn: boolean; emailOtp: boolean; smsOtp: boolean; localCodes: boolean }
export type IdentityAuthClient = {
  signIn: {
    oauth2: (args: { providerId: string; callbackURL: string } & AuthRequestOptions) => Promise<unknown>
    emailOtp: (args: { email: string; otp: string } & AuthRequestOptions) => Promise<unknown>
  }
  emailOtp: { sendVerificationOtp: (args: { email: string; type: "sign-in" } & AuthRequestOptions) => Promise<unknown> }
  phoneNumber: {
    sendOtp: (args: { phoneNumber: string } & AuthRequestOptions) => Promise<unknown>
    verify: (args: { phoneNumber: string; code: string; disableSession: false } & AuthRequestOptions) => Promise<unknown>
  }
}

export type IdentityEntryProps = {
  authClient: IdentityAuthClient
  callbackURL: string
  onAuthenticated: () => void
  /** undefined : chargement ; null : configuration indisponible. */
  configuration: IdentityConfiguration | null | undefined
  renderLocalCode?: (identifier: string) => ReactNode
  /** Une carte d'accès peut fournir sa propre hiérarchie, sans changer les portes. */
  presentation?: "default" | "compact"
  headingLevel?: 1 | 2
  title?: string
  lead?: string
}

type Method = "email" | "sms"
type Destination = { method: Method; identifier: string }
const RESEND_COOLDOWN_MS = 60_000

function responseData(response: unknown): unknown {
  return typeof response === "object" && response !== null && "data" in response ? response.data : null
}

function responseError(response: unknown): unknown {
  return typeof response === "object" && response !== null && "error" in response ? response.error : null
}

/** Les détails d'un fournisseur ne sortent pas dans l'interface. */
export function identityErrorKey(error: unknown): string {
  if (error instanceof Error) return "errors.network"
  const data = typeof error === "object" && error !== null ? error as Record<string, unknown> : {}
  const code = typeof data.code === "string" ? data.code : typeof data.message === "string" ? data.message : null
  if (data.status === 429 || code === "rateLimited" || code === "TOO_MANY_ATTEMPTS") return "errors.rateLimited"
  if (code === "INVALID_OTP") return "errors.invalidCode"
  if (code === "OTP_EXPIRED" || code === "OTP_NOT_FOUND") return "errors.expiredCode"
  if (code === "otpDeliveryUnavailable" || code === "smsDeliveryUnavailable" || code === "SEND_OTP_NOT_IMPLEMENTED") return "errors.deliveryUnavailable"
  if (code === "INVALID_PHONE_NUMBER") return "errors.invalidPhone"
  return "errors.generic"
}

async function authRequest(run: (options: AuthRequestOptions) => Promise<unknown>, headers?: Record<string, string>): Promise<unknown> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      Promise.resolve().then(() => run({ fetchOptions: { throw: false, signal: controller.signal, ...(headers ? { headers } : {}) } })),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => { reject(new DOMException("Authentication request timed out", "TimeoutError")); controller.abort() }, 10_000)
      }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

/** Porte commune, sans route ni origine propre à une application. */
export function IdentityEntry({ authClient, callbackURL, onAuthenticated, configuration, renderLocalCode, presentation = "default", headingLevel = 1, title, lead }: IdentityEntryProps) {
  const { t, i18n } = useTranslation("identity")
  const fieldId = useId()
  const [method, setMethod] = useState<Method>("email")
  const [destination, setDestination] = useState<Destination | null>(null)
  const [pending, setPending] = useState<"idn" | "send" | "verify" | "resend" | null>(null)
  const pendingRef = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [cooldownUntil, setCooldownUntil] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const cooldowns = useRef(new Map<string, number>())
  const selectedMethod = method === "email" && configuration?.emailOtp === false && configuration.smsOtp ? "sms" : method
  const available = selectedMethod === "email" ? configuration?.emailOtp === true : configuration?.smsOtp === true
  const identifierSchema = selectedMethod === "email" ? z.string().trim().email(t("errors.invalidEmail")) : z.string().trim().regex(/^\+[1-9]\d{7,14}$/, t("errors.invalidPhone"))
  const destinationForm = useForm<{ identifier: string }>({ resolver: zodResolver(z.object({ identifier: identifierSchema })), defaultValues: { identifier: "" } })
  const codeForm = useForm<{ code: string }>({ resolver: zodResolver(z.object({ code: z.string().trim().regex(/^\d{6}$/, t("errors.codeFormat")) })), defaultValues: { code: "" } })
  const remaining = Math.max(0, Math.ceil((cooldownUntil - now) / 1_000))

  useEffect(() => {
    if (cooldownUntil <= Date.now()) return
    const timer = setInterval(() => setNow(Date.now()), 1_000)
    return () => clearInterval(timer)
  }, [cooldownUntil])

  async function perform(kind: NonNullable<typeof pending>, run: () => Promise<void>) {
    if (pendingRef.current) return
    pendingRef.current = true
    setPending(kind)
    setError(null)
    setNotice(null)
    try { await run() } catch (failure) { setError(t(identityErrorKey(failure))) } finally { pendingRef.current = false; setPending(null) }
  }

  async function send(target: Destination) {
    const key = `${target.method}:${target.identifier}`
    const deadline = cooldowns.current.get(key) ?? 0
    if (deadline > Date.now()) { setError(t("cooldown", { count: Math.ceil((deadline - Date.now()) / 1_000) })); return false }
    // La langue affichée accompagne la demande : le moteur compose le code dans cette langue.
    const language = i18n.resolvedLanguage ?? i18n.language
    const result = await authRequest((options) => target.method === "email" ? authClient.emailOtp.sendVerificationOtp({ email: target.identifier, type: "sign-in", ...options }) : authClient.phoneNumber.sendOtp({ phoneNumber: target.identifier, ...options }), language ? { "Accept-Language": language } : undefined)
    if (responseError(result)) { setError(t(identityErrorKey(responseError(result)))); return false }
    const data = responseData(result)
    const sent = typeof data === "object" && data !== null && (target.method === "email" ? "success" in data && data.success === true : "message" in data && typeof data.message === "string" && data.message.length > 0)
    if (!sent) { setError(t("errors.generic")); return false }
    const nextDeadline = Date.now() + RESEND_COOLDOWN_MS
    cooldowns.current.set(key, nextDeadline)
    setCooldownUntil(nextDeadline)
    setNow(Date.now())
    return true
  }

  const onDestination = destinationForm.handleSubmit(async ({ identifier }) => {
    if (!available) return
    await perform("send", async () => {
      const target: Destination = { method: selectedMethod, identifier: selectedMethod === "email" ? identifier.trim().toLowerCase() : identifier.trim() }
      if (await send(target)) { codeForm.reset(); setDestination(target) }
    })
  })

  const onCode = codeForm.handleSubmit(async ({ code }) => {
    if (!destination) return
    await perform("verify", async () => {
      const result = await authRequest((options) => destination.method === "email" ? authClient.signIn.emailOtp({ email: destination.identifier, otp: code, ...options }) : authClient.phoneNumber.verify({ phoneNumber: destination.identifier, code, disableSession: false, ...options }))
      if (responseError(result)) { setError(t(identityErrorKey(responseError(result)))); return }
      const data = responseData(result)
      if (typeof data !== "object" || data === null || !("token" in data) || typeof data.token !== "string" || data.token.length === 0) { setError(t("errors.generic")); return }
      onAuthenticated()
    })
  })

  const busy = pending !== null
  const identifierId = `${fieldId}-identifier`
  const codeId = `${fieldId}-code`
  const compact = presentation === "compact"
  const Heading = headingLevel === 2 ? "h2" : "h1"
  const Panel = compact ? "div" : Card
  const headingLead = destination ? t("codeLead", { identifier: destination.identifier }) : lead ?? t("lead")
  const identifierLabel = selectedMethod === "email" ? t("emailLabel") : t("phoneLabel")
  return (
    <section className={`flex w-full min-w-0 flex-col ${compact ? "gap-3" : "gap-6"}`}>
      <header className="flex flex-col gap-2">
        <Heading className={compact ? "text-xl font-semibold" : "text-3xl"}>{destination ? t("codeTitle") : title ?? t("title")}</Heading>
        {headingLead ? <p className={`break-words text-muted-foreground ${compact ? "text-sm" : ""}`}>{headingLead}</p> : null}
      </header>
      {error ? <p role="alert" className="rounded-lg border border-destructive/40 bg-card px-4 py-3 text-sm text-destructive">{error}</p> : null}
      {notice ? <p role="status" className="rounded-lg bg-muted px-4 py-3 text-sm">{notice}</p> : null}
      {configuration === undefined ? <p role="status" className="text-sm text-muted-foreground">{t("loading")}</p> : null}
      {configuration === null ? <p role="alert" className="text-sm text-muted-foreground">{t("configurationUnavailable")}</p> : null}
      {!destination ? (
        <Panel>
          <div className={`flex flex-col ${compact ? "gap-2" : "gap-3"}`}>
            <Button size="lg" disabled={busy || configuration?.idn !== true} aria-busy={pending === "idn" || undefined} aria-describedby={`${fieldId}-idn-help`} style={{ whiteSpace: "normal" }} onClick={() => void perform("idn", async () => {
              if (!configuration?.idn) return
              const result = await authRequest((options) => authClient.signIn.oauth2({ providerId: "idn", callbackURL, ...options }))
              const data = responseData(result)
              if (responseError(result)) setError(t(identityErrorKey(responseError(result))))
              else if (typeof data !== "object" || data === null || !("url" in data) || typeof data.url !== "string" || !("redirect" in data) || data.redirect !== true) setError(t("errors.generic"))
            })}>
              {pending === "idn" ? <LoaderCircle aria-hidden="true" className="size-4 shrink-0 animate-spin" /> : <ShieldCheck aria-hidden="true" className="size-4 shrink-0" />}
              {pending === "idn" ? t("idnConnecting") : t("idn")}
            </Button>
            <p id={`${fieldId}-idn-help`} className={compact && (configuration?.idn || configuration === undefined) ? "sr-only" : compact ? "text-xs text-muted-foreground" : "text-sm text-muted-foreground"}>{configuration === undefined ? t("loading") : configuration?.idn ? t("idnHelp") : t("idnUnavailable")}</p>
          </div>
        </Panel>
      ) : null}
      <Panel>
        {destination ? (
          <form onSubmit={onCode} noValidate className="flex flex-col gap-4">
            <Field htmlFor={codeId} label={t("codeLabel")} hint={t("codeHint")} error={codeForm.formState.errors.code?.message}>
              <TextInput id={codeId} inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus disabled={busy} className="font-mono text-lg tracking-widest" {...codeForm.register("code")} />
            </Field>
            {configuration?.localCodes && renderLocalCode ? renderLocalCode(destination.identifier) : null}
            <Button size="lg" type="submit" disabled={busy} aria-busy={pending === "verify" || undefined}>
              {pending === "verify" ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <KeyRound aria-hidden="true" className="size-4" />}
              {pending === "verify" ? t("verifying") : t("verify")}
            </Button>
            <div className="flex flex-wrap justify-between gap-2">
              <Button type="button" variant="ghost" disabled={busy} onClick={() => { setDestination(null); codeForm.reset(); setError(null); setNotice(null) }}>{t("changeContact")}</Button>
              <Button type="button" variant="ghost" disabled={busy || remaining > 0} aria-busy={pending === "resend" || undefined} onClick={() => void perform("resend", async () => { if (await send(destination)) { codeForm.reset(); setNotice(t("resent")) } })}>{remaining > 0 ? t("resendWait", { count: remaining }) : t("resend")}</Button>
            </div>
          </form>
        ) : (
          <form onSubmit={onDestination} noValidate className={`flex flex-col ${compact ? "gap-3" : "gap-4"}`}>
            {compact ? null : <p className="text-sm font-medium">{t("lightAccount")}</p>}
            {configuration?.emailOtp && configuration.smsOtp ? (
              <div role="group" aria-label={t("methodLabel")} className="flex items-center gap-2">
                {compact ? <p className="mr-auto text-xs text-muted-foreground">{t("lightAccount")}</p> : null}
                {(["email", "sms"] as const).map((choice) => <Button key={choice} type="button" variant={selectedMethod === choice ? "primary" : "outline"} disabled={busy} aria-pressed={selectedMethod === choice} style={compact ? { minHeight: 44, padding: "8px 12px" } : undefined} onClick={() => { setMethod(choice); destinationForm.reset(); setError(null) }}>{choice === "email" ? t("email") : t("sms")}</Button>)}
              </div>
            ) : null}
            <Field htmlFor={identifierId} label={compact ? undefined : identifierLabel} hint={selectedMethod === "sms" ? t("phoneHint") : undefined} error={destinationForm.formState.errors.identifier?.message}>
              <TextInput id={identifierId} aria-label={compact ? identifierLabel : undefined} type={selectedMethod === "email" ? "email" : "tel"} inputMode={selectedMethod === "email" ? "email" : "tel"} autoComplete={selectedMethod === "email" ? "email" : "tel"} placeholder={compact && selectedMethod === "email" ? identifierLabel : selectedMethod === "email" ? t("emailPlaceholder") : t("phonePlaceholder")} style={compact ? { minHeight: 48, fontSize: 16 } : undefined} disabled={busy || !available} {...destinationForm.register("identifier")} />
            </Field>
            {!available && configuration !== undefined ? <p className="text-sm text-muted-foreground">{t("codeUnavailable")}</p> : null}
            <Button type="submit" size="lg" disabled={busy || !available} aria-busy={pending === "send" || undefined}>
              {pending === "send" ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : selectedMethod === "email" ? <Mail aria-hidden="true" className="size-4" /> : <Smartphone aria-hidden="true" className="size-4" />}
              {pending === "send" ? t("sending") : t("sendCode")}
            </Button>
          </form>
        )}
      </Panel>
    </section>
  )
}
