import { NativeText as Text } from "./native-text"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native"
import { useConvex, useMutation, useQuery } from "convex/react"
import { Controller, useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { api, type Id } from "@antsia/api/engine"
import { BRAND_NAME } from "@antsia/social-contracts/brand"
import { DISPLAY_NAME_MAX_LENGTH, HANDLE_MAX_LENGTH, HANDLE_MIN_LENGTH, normalizeHandle } from "@antsia/social-domain/content"
import { useNativeAppearance } from "../appearance"
import { completeNativeOnboarding, nativeEntryText, type NativeOnboardingValues } from "../lib/native-entry-model"
import type { NativeSessionController } from "../lib/session-controller"
import { Action, Field, Status } from "./ui"

export type NativeOnboardingProps = {
  networkId: Id<"networks">
  controller: NativeSessionController
  onComplete?: () => void
  onExit?: () => void
}
/** No mutation is mounted in an effect: only the holder's validated submission publishes and joins. */
export function NativeOnboarding({ networkId, controller, onComplete, onExit }: NativeOnboardingProps) {
  const { t, tokens, locale, setLocale } = useNativeAppearance(), client = useConvex()
  const text = useCallback((key: string, values: Record<string, string | number> = {}) => nativeEntryText(t, key, { brand: BRAND_NAME, ...values }), [t])
  const session = controller.session, generation = controller.vault.generation
  const alive = useRef(true), pending = useRef(false), [failure, setFailure] = useState(false)
  const person = useQuery(api.modules.people.persons.getMyPerson, session ? {} : "skip")
  const ensurePerson = useMutation(api.modules.people.persons.ensureMyPerson)
  const recordConsent = useMutation(api.modules.people.consents.recordConsent)
  const setPreferences = useMutation(api.modules.people.preferences.setMyPreferences)
  const publishProfile = useMutation(api.modules.people.profile.publishMyProfile)
  const joinNetwork = useMutation(api.modules.people.memberships.joinNetwork)
  const consentInForce = person?.consentsInForce.includes("social_profile") === true
  const schema = useMemo(() => z.object({
    displayName: z.string().trim().min(1, text("mobile.entry.rules.DISPLAY_NAME_LENGTH", { min: 1, max: DISPLAY_NAME_MAX_LENGTH })).max(DISPLAY_NAME_MAX_LENGTH, text("mobile.entry.rules.DISPLAY_NAME_LENGTH", { min: 1, max: DISPLAY_NAME_MAX_LENGTH })),
    handle: z.string().transform(normalizeHandle).pipe(z.string().min(HANDLE_MIN_LENGTH, text("mobile.entry.rules.HANDLE_LENGTH", { min: HANDLE_MIN_LENGTH, max: HANDLE_MAX_LENGTH })).max(HANDLE_MAX_LENGTH, text("mobile.entry.rules.HANDLE_LENGTH", { min: HANDLE_MIN_LENGTH, max: HANDLE_MAX_LENGTH })).regex(/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/, t("mobile.entry.rules.HANDLE_CHARSET"))),
    consent: z.boolean().refine(value => value || consentInForce, t("mobile.entry.welcome.consentRequired")),
    locale: z.enum(["fr", "en"]),
    timeZone: z.string().trim().min(1, t("mobile.entry.welcome.invalidTimeZone")).max(100, t("mobile.entry.welcome.invalidTimeZone")).refine(value => { try { new Intl.DateTimeFormat("en", { timeZone: value }).format(); return true } catch { return false } }, t("mobile.entry.welcome.invalidTimeZone")),
  }), [t, text, consentInForce])
  const [deviceTimeZone] = useState(() => { try { return new Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" } catch { return "UTC" } })
  const form = useForm<NativeOnboardingValues>({ resolver: zodResolver(schema), defaultValues: { displayName: "", handle: "", consent: false, locale, timeZone: deviceTimeZone } })
  const displayName = useWatch({ control: form.control, name: "displayName" }), handle = useWatch({ control: form.control, name: "handle" }), consent = useWatch({ control: form.control, name: "consent" }), chosenLocale = useWatch({ control: form.control, name: "locale" })
  const [settledName, setSettledName] = useState("")
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => { const timer = setTimeout(() => setSettledName(displayName), 350); return () => clearTimeout(timer) }, [displayName])
  useEffect(() => {
    if (!person) return
    if (person.displayName && !form.getFieldState("displayName").isDirty) form.setValue("displayName", person.displayName)
    if (person.handle && !form.getFieldState("handle").isDirty) form.setValue("handle", person.handle)
    if (person.locale && !form.getFieldState("locale").isDirty) form.setValue("locale", person.locale)
    if (!form.getFieldState("timeZone").isDirty) form.setValue("timeZone", person.timeZone ?? deviceTimeZone)
    if (consentInForce) form.setValue("consent", true)
  }, [person, consentInForce, deviceTimeZone, form])
  const suggestions = useQuery(api.modules.people.profile.suggestHandles, person && settledName.trim().length >= 2 && session && controller.sessionIsCurrent(session.id, generation) ? { displayName: settledName.slice(0, DISPLAY_NAME_MAX_LENGTH) } : "skip")
  const submit = () => form.handleSubmit(async values => {
    if (pending.current || !session || person === undefined) return
    const current = () => alive.current && controller.sessionIsCurrent(session.id, generation)
    if (!current()) return
    pending.current = true; setFailure(false)
    try {
      const result = await completeNativeOnboarding({ values, needsPerson: person === null, consentInForce, current,
        ensurePerson: () => ensurePerson({}),
        handleAvailable: () => client.query(api.modules.people.profile.isHandleAvailable, { handle: values.handle }),
        recordConsent: () => recordConsent({ purpose: "social_profile", origin: "onboarding" }),
        setPreferences: () => setPreferences({ locale: values.locale, timeZone: values.timeZone }),
        publishProfile: () => publishProfile({ handle: values.handle, displayName: values.displayName }),
        joinNetwork: () => joinNetwork({ networkId }),
      })
      if (!current()) return
      if (result === "handleUnavailable") form.setError("handle", { type: "server", message: t("mobile.entry.handleUnavailable") })
      else if (result === "consentRequired") form.setError("consent", { type: "server", message: t("mobile.entry.welcome.consentRequired") })
      else if (result === "complete") { setLocale(values.locale); onComplete?.() }
    } catch { if (current()) setFailure(true) }
    finally { pending.current = false }
  })()
  const busy = form.formState.isSubmitting, errors = form.formState.errors
  if (!session || person === undefined) return <View style={{ padding: 24 }}><Status busy label={t("mobile.session.preparing")} /></View>
  return <KeyboardAvoidingView style={{ flex: 1, backgroundColor: tokens.background }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: 32 }}>
      <View style={{ gap: 8 }}>
        <Text variant="display" accessibilityRole="header" style={{ color: tokens.foreground, fontSize: 28, lineHeight: 34, fontWeight: "700" }}>{text("mobile.entry.welcome.title")}</Text>
        <Text style={{ color: tokens.mutedForeground, fontSize: 15, lineHeight: 22 }}>{t("mobile.entry.welcome.lead")}</Text>
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => { if (onExit) onExit(); else void controller.exit() }} style={{ alignSelf: "flex-start", minHeight: 44, justifyContent: "center" }}><Text style={{ color: tokens.primaryInk }}>{t(controller.sharedDemo ? "mobile.demo.signOut" : "mobile.session.signOut")}</Text></Pressable>
      </View>
      <View style={{ backgroundColor: tokens.card, borderRadius: tokens.radiusCard, padding: 20, gap: 16 }}>
        <Controller control={form.control} name="displayName" render={({ field }) => <Field label={t("mobile.entry.welcome.displayNameLabel")} hint={t("mobile.entry.welcome.displayNameHint")} value={field.value} onChangeText={field.onChange} maxLength={DISPLAY_NAME_MAX_LENGTH} disabled={busy} error={errors.displayName?.message} />} />
        <Controller control={form.control} name="handle" render={({ field }) => <Field label={t("mobile.entry.welcome.handleLabel")} hint={t("mobile.entry.welcome.handleHint")} value={field.value} onChangeText={value => field.onChange(normalizeHandle(value))} maxLength={HANDLE_MAX_LENGTH} disabled={busy} error={errors.handle?.message} />} />
        {suggestions?.length ? <View style={{ gap: 6 }}><Text style={{ color: tokens.mutedForeground, fontSize: 13 }}>{t("mobile.entry.welcome.suggestions")}</Text><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>{suggestions.map(suggestion => suggestion.available ? <Pressable key={suggestion.handle} accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => form.setValue("handle", suggestion.handle, { shouldValidate: true, shouldDirty: true })} style={{ minHeight: 44, borderWidth: 1, borderColor: tokens.border, borderRadius: 22, paddingHorizontal: 12, justifyContent: "center" }}><Text style={{ color: tokens.foreground }}>@{suggestion.handle}</Text></Pressable> : <Text key={suggestion.handle} style={{ color: tokens.mutedForeground, fontSize: 13 }}>{text("mobile.entry.welcome.taken", { handle: `@${suggestion.handle}` })}</Text>)}</View></View> : null}
        <Text style={{ color: tokens.foreground, fontSize: 15 }}>{t("mobile.entry.welcome.localeLabel")}</Text>
        <View accessibilityRole="radiogroup" accessibilityLabel={t("mobile.entry.welcome.localeLabel")} style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{(["fr", "en"] as const).map(language => <Action key={language} accessibilityRole="radio" checked={chosenLocale === language} label={t(language === "fr" ? "mobile.entry.welcome.french" : "mobile.entry.welcome.english")} disabled={busy} tone={chosenLocale === language ? "primary" : "neutral"} onPress={() => form.setValue("locale", language, { shouldDirty: true })} />)}</View>
        <Controller control={form.control} name="timeZone" render={({ field }) => <Field label={t("mobile.entry.welcome.timeZoneLabel")} hint={t("mobile.entry.welcome.timeZoneHint")} value={field.value} onChangeText={field.onChange} maxLength={100} disabled={busy} error={errors.timeZone?.message} />} />
        {!consentInForce ? <View style={{ gap: 6 }}><Pressable accessibilityRole="checkbox" accessibilityLabel={t("mobile.entry.welcome.consentLabel")} accessibilityState={{ checked: consent, disabled: busy }} disabled={busy} onPress={() => form.setValue("consent", !consent, { shouldValidate: true, shouldDirty: true })} style={{ flexDirection: "row", gap: 12, alignItems: "flex-start", paddingVertical: 10, minHeight: 44 }}><View accessible={false} style={{ width: 22, height: 22, borderWidth: 1, borderColor: consent ? tokens.primary : tokens.input, borderRadius: 5, backgroundColor: consent ? tokens.primary : tokens.background, alignItems: "center", justifyContent: "center" }}><Text style={{ color: tokens.primaryOn, fontSize: 16 }}>{consent ? "✓" : ""}</Text></View><Text style={{ flex: 1, color: tokens.foreground, fontSize: 14, lineHeight: 21 }}>{t("mobile.entry.welcome.consentLabel")}</Text></Pressable>{errors.consent?.message ? <Status error label={errors.consent.message} /> : null}</View> : null}
        {displayName.trim() || handle.trim() ? <View style={{ gap: 6, padding: 14, borderRadius: tokens.radiusField, backgroundColor: tokens.muted }}><Text style={{ color: tokens.mutedForeground, fontSize: 12 }}>{t("mobile.entry.welcome.previewTitle")}</Text><Text style={{ color: tokens.foreground, fontWeight: "700", fontSize: 16 }}>{displayName.trim()}</Text>{handle.trim() ? <Text style={{ color: tokens.mutedForeground }}>@{normalizeHandle(handle)}</Text> : null}</View> : null}
        <Status error={failure} label={failure ? t("mobile.entry.registrationFailed") : ""} />
        <Action label={text(busy ? "mobile.entry.welcome.submitting" : "mobile.entry.welcome.submit")} tone="primary" pending={busy} disabled={!session || person === undefined} onPress={() => { void submit() }} />
      </View>
    </ScrollView>
  </KeyboardAvoidingView>
}
