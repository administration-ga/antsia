"use client"

import { browserAppPath } from "@/lib/app-path"
import { demoStorageNamespace } from "@/lib/demo-storage"

/** PA5 — les réglages et les consentements sont des gestes ; aucun prompt navigateur au montage. */
import { api, type Id } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { MAX_WEEKLY_NOTIFICATION_LIMIT, NOTIFICATION_CATEGORIES, type NotificationCategory } from "@antsia/social-domain/notificationDelivery"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation } from "convex/react"
import { useEffect, useId, useRef, useState } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { z } from "zod"

import { Button, Card, Field, TextInput } from "@/components/shared/controls"
import { engineErrorMessage } from "@/lib/engine-errors"
import { routes } from "@/lib/routes"

const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  social: "personal.categories.social", messages: "personal.categories.messages", calls: "personal.categories.calls",
  network: "personal.categories.network", moderation: "personal.categories.moderation", files: "personal.categories.files",
}
const categorySchema = z.object({ social: z.boolean(), messages: z.boolean(), calls: z.boolean(), network: z.boolean(), moderation: z.boolean(), files: z.boolean() })
export function notificationPreferencesSchema(error: string) {
  return z.object({ pushCategories: categorySchema, digestCategories: categorySchema, emailDigest: z.boolean(), weeklyLimit: z.number({ invalid_type_error: error, required_error: error }).int(error).min(0, error).max(MAX_WEEKLY_NOTIFICATION_LIMIT, error) })
}
export type NotificationPreferenceValues = z.infer<ReturnType<typeof notificationPreferencesSchema>>
const defaults: NotificationPreferenceValues = { pushCategories: { social: true, messages: true, calls: true, network: true, moderation: true, files: true }, digestCategories: { social: true, messages: true, calls: true, network: true, moderation: true, files: true }, emailDigest: false, weeklyLimit: 35 }

type DeviceSubscription = { subscriptionId: Id<"pushSubscriptions">; applicationId: string; deviceId: string; provider: string; credentialHash?: string; currentSession?: boolean; active: boolean }
type WebCredential = { provider: "web"; endpoint: string; keys: { p256dh: string; auth: string } }
type PushResult = { ok: true; credentialHash: string } | { ok: false; reason: "denied" | "unavailable" | "cancelled" }

const browserSubscriptionSchema = z.object({ endpoint: z.string().url().max(4096).refine((value) => new URL(value).protocol === "https:"), keys: z.object({ p256dh: z.string().regex(/^[A-Za-z0-9_-]{80,100}$/u), auth: z.string().regex(/^[A-Za-z0-9_-]{20,30}$/u) }) })
export function webPushKey(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replace(/-/gu, "+").replace(/_/gu, "/")
  const bytes = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4))
  return Uint8Array.from(bytes, (letter) => letter.charCodeAt(0))
}
export async function browserCredentialHash(endpoint: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`web|${endpoint}`))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

export function currentDeviceSubscriptions(rows: readonly DeviceSubscription[], hash: string | null, deviceId: string | null): DeviceSubscription[] {
  return rows.filter((row) => row.provider === "web" && row.applicationId === "antsia_ga" && row.active && (row.credentialHash && hash ? row.credentialHash === hash : !!deviceId && row.deviceId === deviceId))
}

/** Une nouvelle souscription refusée par le serveur est annulée dans le navigateur. */
export async function enableWebNotifications(operations: {
  register: () => Promise<ServiceWorkerRegistration>
  requestPermission: () => Promise<NotificationPermission>
  recordConsent: () => Promise<unknown>
  subscribe: (input: { applicationId: string; deviceId: string; credential: WebCredential }) => Promise<{ subscriptionId: Id<"pushSubscriptions"> }>
  unsubscribe: (subscriptionId: Id<"pushSubscriptions">) => Promise<unknown>
  deviceId: () => string
  current: () => boolean
}, publicKey: string): Promise<PushResult> {
  if (!publicKey) return { ok: false, reason: "unavailable" }
  const registration = await operations.register()
  if (!operations.current()) return { ok: false, reason: "cancelled" }
  const permission = await operations.requestPermission()
  if (permission !== "granted") return { ok: false, reason: permission === "denied" ? "denied" : "cancelled" }
  if (!operations.current()) return { ok: false, reason: "cancelled" }
  const previous = await registration.pushManager.getSubscription()
  let subscription: PushSubscription | null = null, created = false, serverId: Id<"pushSubscriptions"> | null = null
  try {
    subscription = previous ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: webPushKey(publicKey) })
    created = previous === null
    const parsed = browserSubscriptionSchema.parse(subscription.toJSON())
    const hash = await browserCredentialHash(parsed.endpoint)
    if (!operations.current()) { if (created) await subscription.unsubscribe(); return { ok: false, reason: "cancelled" } }
    await operations.recordConsent()
    if (!operations.current()) { if (created) await subscription.unsubscribe(); return { ok: false, reason: "cancelled" } }
    const written = await operations.subscribe({ applicationId: "antsia_ga", deviceId: operations.deviceId(), credential: { provider: "web", ...parsed } })
    serverId = written.subscriptionId
    if (!operations.current()) { await operations.unsubscribe(serverId); if (created) await subscription.unsubscribe(); return { ok: false, reason: "cancelled" } }
    return { ok: true, credentialHash: hash }
  } catch (error) {
    if (serverId) await operations.unsubscribe(serverId).catch(() => undefined)
    if (created && subscription) await subscription.unsubscribe().catch(() => undefined)
    throw error
  }
}

/** Désactive les seules lignes du navigateur courant ; le navigateur se ferme même si le réseau échoue. */
export async function disableWebNotifications(operations: {
  subscription: PushSubscription | null
  subscriptions: readonly DeviceSubscription[]
  deviceId: string | null
  unsubscribe: (subscriptionId: Id<"pushSubscriptions">) => Promise<unknown>
}): Promise<void> {
  try {
    const hash = operations.subscription ? await browserCredentialHash(operations.subscription.endpoint) : null
    const rows = currentDeviceSubscriptions(operations.subscriptions, hash, operations.deviceId)
    for (const row of rows) await operations.unsubscribe(row.subscriptionId)
  } finally {
    if (operations.subscription) await operations.subscription.unsubscribe()
  }
}

export async function saveNotificationPreferences(values: NotificationPreferenceValues, previous: NotificationPreferenceValues, explicitDigestOptIn: boolean, operations: {
  recordDigestConsent: () => Promise<unknown>
  revokeDigestConsent: () => Promise<unknown>
  update: (values: NotificationPreferenceValues) => Promise<unknown>
}): Promise<void> {
  const newlyGranted = values.emailDigest && (!previous.emailDigest || explicitDigestOptIn)
  if (newlyGranted) await operations.recordDigestConsent()
  // Révoquer AVANT de mettre à jour la préférence : un digest réservé se ferme immédiatement.
  if (!values.emailDigest) await operations.revokeDigestConsent()
  try { await operations.update(values) }
  catch (error) { if (newlyGranted && !previous.emailDigest) await operations.revokeDigestConsent().catch(() => undefined); throw error }
}

function storedDeviceId(): string | null {
  try { const value = window.localStorage.getItem(`${demoStorageNamespace()}antsia:push-device`); return value && /^[A-Za-z0-9_-]{8,128}$/u.test(value) ? value : null } catch { return null }
}
function ensureDeviceId(): string {
  const existing = storedDeviceId()
  if (existing) return existing
  const value = crypto.randomUUID()
  window.localStorage.setItem(`${demoStorageNamespace()}antsia:push-device`, value)
  return value
}
async function activeRegistration(): Promise<ServiceWorkerRegistration> {
  const registered = await navigator.serviceWorker.register(browserAppPath(routes.pushWorker()), { scope: `${browserAppPath(routes.home()).replace(/\/$/u, "")}/` })
  if (registered.active) return registered
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const ready = await Promise.race([navigator.serviceWorker.ready, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("pushWorkerUnavailable")), 10_000) })])
    if (ready.scope !== registered.scope) throw new Error("pushWorkerScopeMismatch")
    return ready
  } finally { if (timer) clearTimeout(timer) }
}

export function NotificationControls({ networkId, frozen = false, canActivate = true }: { networkId: Id<"networks">; frozen?: boolean; canActivate?: boolean }) {
  const { t } = useTranslation("antsia")
  const preferences = useAuthenticatedConvexQuery(api.modules.notifications.preferences.getMine, { networkId })
  const configuration = useAuthenticatedConvexQuery(api.modules.notifications.pushSubscriptions.configuration, canActivate ? { networkId } : "skip")
  const subscriptions = useAuthenticatedConvexQuery(api.modules.notifications.pushSubscriptions.listMine, { networkId })
  const update = useMutation(api.modules.notifications.preferences.update)
  const subscribe = useMutation(api.modules.notifications.pushSubscriptions.subscribe)
  const unsubscribe = useMutation(api.modules.notifications.pushSubscriptions.unsubscribe)
  const recordConsent = useMutation(api.modules.people.consents.recordConsent)
  const revokeConsent = useMutation(api.modules.people.consents.revokeConsent)
  const [busy, setBusy] = useState<"enable" | "disable" | "save" | null>(null)
  const [browser, setBrowser] = useState<{ supported: boolean; permission: NotificationPermission; hash: string | null; subscribed: boolean }>({ supported: false, permission: "default", hash: null, subscribed: false })
  const [feedback, setFeedback] = useState<{ text: string; error: boolean } | null>(null)
  const feedbackRef = useRef<HTMLParagraphElement>(null), alive = useRef(true), locked = useRef(false), explicitDigest = useRef(false)
  const permissions = useRef({ frozen, canActivate })
  const lastSnapshot = useRef<NotificationPreferenceValues | null>(null)
  const prefix = useId()
  const form = useForm<NotificationPreferenceValues>({ resolver: zodResolver(notificationPreferencesSchema(t("personal.weeklyLimitError"))), defaultValues: preferences.data ?? defaults })
  const digest = form.watch("emailDigest")
  const pushCategories = form.watch("pushCategories"), digestCategories = form.watch("digestCategories")
  const isDirty = form.formState.isDirty

  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => { permissions.current = { frozen, canActivate } }, [frozen, canActivate])
  useEffect(() => {
    if (preferences.data && preferences.data !== lastSnapshot.current && !isDirty && !busy) { lastSnapshot.current = preferences.data; form.reset(preferences.data) }
  }, [preferences.data, isDirty, busy, form])
  useEffect(() => {
    let current = true
    const supported = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window
    if (!supported) return
    setBrowser((previous) => ({ ...previous, supported: true, permission: Notification.permission }))
    void navigator.serviceWorker.getRegistration(routes.home()).then(async (registration) => {
      const subscription = await registration?.pushManager.getSubscription()
      const hash = subscription ? await browserCredentialHash(subscription.endpoint) : null
      if (current) setBrowser({ supported: true, permission: Notification.permission, hash, subscribed: !!subscription })
    }).catch(() => { if (current) setBrowser((previous) => ({ ...previous, subscribed: false, hash: null })) })
    return () => { current = false }
  }, [subscriptions.data])
  useEffect(() => { if (feedback?.error) feedbackRef.current?.focus() }, [feedback])

  const available = configuration.data?.available.web && configuration.data.applications.some((application) => application.applicationId === "antsia_ga") && !!configuration.data.vapidPublicKey
  const currentSubscriptions = currentDeviceSubscriptions(subscriptions.data ?? [], browser.hash, typeof window === "undefined" ? null : storedDeviceId())
  const enabled = browser.subscribed && currentSubscriptions.some((subscription) => subscription.currentSession !== false)
  const loading = !preferences.data || (canActivate && !configuration.data) || !subscriptions.data
  const queryError = preferences.error || configuration.error || subscriptions.error
  const run = async (kind: "enable" | "disable" | "save", operation: () => Promise<string>) => {
    if (locked.current || frozen) return
    locked.current = true; setBusy(kind); setFeedback(null)
    try { const text = await operation(); if (alive.current) setFeedback({ text, error: false }) }
    catch (error) { if (alive.current) setFeedback({ text: engineErrorMessage(error, t), error: true }) }
    finally { locked.current = false; if (alive.current) setBusy(null) }
  }
  const enable = () => {
    if (!canActivate || !available || !browser.supported || browser.permission === "denied") return
    void run("enable", async () => {
      const result = await enableWebNotifications({ register: activeRegistration, requestPermission: () => Notification.requestPermission(), deviceId: ensureDeviceId, current: () => alive.current && !permissions.current.frozen && permissions.current.canActivate, recordConsent: () => recordConsent({ networkId, purpose: "notifications", origin: "settings" }), subscribe: (input) => subscribe({ networkId, ...input }), unsubscribe: (subscriptionId) => unsubscribe({ networkId, subscriptionId }) }, configuration.data!.vapidPublicKey!)
      if (!result.ok) { if (alive.current) setBrowser((previous) => ({ ...previous, permission: Notification.permission })); return t(result.reason === "denied" ? "personal.pushDenied" : result.reason === "unavailable" ? "personal.pushUnavailable" : "personal.error") }
      setBrowser({ supported: true, permission: Notification.permission, subscribed: true, hash: result.credentialHash })
      return t("personal.pushEnabled")
    })
  }
  const disable = () => { void run("disable", async () => {
    const registration = browser.supported ? await navigator.serviceWorker.getRegistration(routes.home()) : undefined
    const subscription = await registration?.pushManager.getSubscription() ?? null
    try { await disableWebNotifications({ subscription, subscriptions: subscriptions.data ?? [], deviceId: storedDeviceId(), unsubscribe: (subscriptionId) => unsubscribe({ networkId, subscriptionId }) }) }
    finally { if (alive.current) setBrowser((previous) => ({ ...previous, hash: null, subscribed: false })) }
    return t("personal.saved")
  }) }
  const save = form.handleSubmit((values) => { void run("save", async () => {
    const previous = preferences.data ?? defaults
    if (!canActivate && (values.emailDigest && !previous.emailDigest || values.weeklyLimit > previous.weeklyLimit || NOTIFICATION_CATEGORIES.some((category) => values.pushCategories[category] && !previous.pushCategories[category] || values.digestCategories[category] && !previous.digestCategories[category]))) throw new Error("notificationActivationUnavailable")
    await saveNotificationPreferences(values, previous, explicitDigest.current, { recordDigestConsent: () => recordConsent({ networkId, purpose: "email_digest", origin: "settings" }), revokeDigestConsent: () => revokeConsent({ networkId, purpose: "email_digest" }), update: (fields) => update({ networkId, ...fields }) })
    explicitDigest.current = false; form.reset(values)
    return t("personal.saved")
  }) })

  return <Card>
    <div className="flex flex-col gap-6" aria-busy={busy !== null || loading}>
      <div className="flex flex-col gap-3">
        <h2 className="text-xl">{t("personal.pushTitle")}</h2>
        {queryError ? <p role="alert" className="text-sm text-destructive">{engineErrorMessage(queryError, t)}</p> : loading ? <p role="status" className="text-sm text-muted-foreground">{t("personal.loading")}</p> : !available || !browser.supported ? <p className="text-sm text-muted-foreground">{t("personal.pushUnavailable")}</p> : browser.permission === "denied" ? <p className="text-sm text-muted-foreground">{t("personal.pushDenied")}</p> : enabled ? <p className="text-sm text-muted-foreground">{t("personal.pushEnabled")}</p> : null}
        <div className="flex flex-wrap gap-3">
          <Button type="button" onClick={enable} pending={busy === "enable"} disabled={frozen || !!busy || loading || !canActivate || !available || !browser.supported || browser.permission === "denied" || enabled}>{t("personal.pushEnable")}</Button>
          {browser.subscribed || currentSubscriptions.length > 0 ? <Button type="button" variant="outline" onClick={disable} pending={busy === "disable"} disabled={frozen || !!busy || loading}>{t("personal.pushDisable")}</Button> : null}
        </div>
      </div>
      <form onSubmit={save} noValidate className="flex flex-col gap-5">
        <h3 className="text-lg">{t("personal.categoriesTitle")}</h3>
        <fieldset disabled={frozen || !!busy || loading} className="flex flex-col gap-3">
          <legend className="mb-2 text-sm font-medium">{t("personal.pushTitle")}</legend>
          <div className="grid gap-2 sm:grid-cols-2">{NOTIFICATION_CATEGORIES.map((category) => <label key={category} className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" className="size-4 accent-primary" disabled={!canActivate && !pushCategories[category]} {...form.register(`pushCategories.${category}`)} />{t(CATEGORY_LABELS[category])}</label>)}</div>
        </fieldset>
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input type="checkbox" className="size-4 accent-primary" disabled={frozen || !!busy || loading || !canActivate && !digest || !configuration.data?.available.digest && !digest} {...form.register("emailDigest", { onChange: (event: { target: { checked: boolean } }) => { explicitDigest.current = event.target.checked } })} />
          {t("personal.digest")}
        </label>
        {digest ? <fieldset disabled={frozen || !!busy || loading} className="flex flex-col gap-3">
          <legend className="mb-2 text-sm font-medium">{t("personal.digest")}</legend>
          <div className="grid gap-2 sm:grid-cols-2">{NOTIFICATION_CATEGORIES.map((category) => <label key={category} className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" className="size-4 accent-primary" disabled={!canActivate && !digestCategories[category]} {...form.register(`digestCategories.${category}`)} />{t(CATEGORY_LABELS[category])}</label>)}</div>
        </fieldset> : null}
        <Field id={`${prefix}-limit`} label={t("personal.weeklyLimit")} error={form.formState.errors.weeklyLimit?.message}>
          <TextInput id={`${prefix}-limit`} type="number" inputMode="numeric" min={0} max={canActivate ? MAX_WEEKLY_NOTIFICATION_LIMIT : preferences.data?.weeklyLimit ?? 0} step={1} disabled={frozen || !!busy || loading} aria-invalid={!!form.formState.errors.weeklyLimit || undefined} aria-describedby={form.formState.errors.weeklyLimit ? `${prefix}-limit-error` : undefined} {...form.register("weeklyLimit", { valueAsNumber: true })} />
        </Field>
        <Button type="submit" pending={busy === "save"} disabled={frozen || !!busy || loading || !!queryError} className="self-start">{t("personal.save")}</Button>
      </form>
      {feedback ? <p ref={feedbackRef} tabIndex={feedback.error ? -1 : undefined} role={feedback.error ? "alert" : "status"} aria-live={feedback.error ? "assertive" : "polite"} className={feedback.error ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>{feedback.text}</p> : null}
    </div>
  </Card>
}
