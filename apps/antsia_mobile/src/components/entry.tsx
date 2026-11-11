import { NativeText as Text, NativeTextInput as TextInput } from "./native-text"
import { useEffect, useId, useMemo, useRef, useState } from "react"
import { ActivityIndicator, Pressable, useColorScheme, View } from "react-native"
import { useQuery } from "convex/react"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { api } from "@antsia/api/engine"
import { nativeRequest } from "@antsia/social-native/request"
import { BRAND_NAME } from "@antsia/social-contracts/brand"
import { useNativeAppearance } from "../appearance"
import { nativeFieldLabel } from "../lib/accessibility"
import { NATIVE_OTP_COOLDOWN_MS, nativeEntryChannel, nativeEntryRefusal, nativeEntryText, nativeOtpCodeHint, nativeOtpCooldownKey, nativeOtpRemaining, nativeOtpSendAccepted, nativePluralKey, type NativeEntryChannel, type NativeEntryIntent, type NativeEntryMessage, type NativePublicLegalKind } from "../lib/native-entry-model"
import type { NativeSessionController } from "../lib/session-controller"
import { NativeIcon, type NativeIconName } from "./icon"
import { Status } from "./ui"

type Destination = { channel: NativeEntryChannel; identifier: string }
export type NativeEntryProps = {
  controller: NativeSessionController; webUrl: string; scheme: string | null
  intent?: NativeEntryIntent
  onRegistrationIntent?: (intent: NativeEntryIntent) => void
  onPublicDiscover?: () => void
  onLegal?: (kind: NativePublicLegalKind) => void
}
function EntryAction({ label, onPress, disabled = false, busy = false, social = false, icon }: { label: string; onPress: () => void; disabled?: boolean; busy?: boolean; social?: boolean; icon?: NativeIconName }) {
  const { tokens } = useNativeAppearance(), ink = social ? tokens.socialOn : tokens.primaryOn
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: disabled || busy, busy }} disabled={disabled || busy} onPress={onPress} style={({ pressed }) => ({ minHeight: 48, paddingHorizontal: 14, paddingVertical: 11, borderRadius: tokens.radiusField, backgroundColor: social ? tokens.social : tokens.primary, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, opacity: disabled || busy ? 0.5 : pressed ? 0.75 : 1 })}>
    {busy ? <ActivityIndicator accessible={false} color={ink} /> : icon ? <NativeIcon name={icon} size={18} color={ink} /> : null}
    <Text style={{ color: ink, fontSize: 16, lineHeight: 22, fontWeight: "600", textAlign: "center", flexShrink: 1 }}>{label}</Text>
  </Pressable>
}
/** Same compact entry and messages as the Web app; PKCE and bearer remain native. */
export function NativeEntry({ controller, webUrl, scheme, intent, onRegistrationIntent, onPublicDiscover, onLegal }: NativeEntryProps) {
  const { t, tokens, mode, setMode, locale, setLocale } = useNativeAppearance()
  const text = (key: string, values: Record<string, string | number> = {}) => nativeEntryText(t, key, { brand: BRAND_NAME, ...values })
  const systemMode = useColorScheme(), dark = (mode === "system" ? systemMode : mode) === "dark"
  const configuration = useQuery(api.modules.platform.authentication.configuration, {})
  const [localIntent, setLocalIntent] = useState<NativeEntryIntent>(intent ?? "sign-in")
  const [method, setMethod] = useState<NativeEntryChannel>("email"), channel = nativeEntryChannel(method, configuration)
  const [destination, setDestination] = useState<Destination | null>(null)
  const [pendingKind, setPending] = useState<"send" | "verify" | "resend" | null>(null)
  const [error, setError] = useState<NativeEntryMessage | null>(null), [notice, setNotice] = useState<string | null>(null)
  const [cooldownUntil, setCooldownUntil] = useState(0), [now, setNow] = useState(Date.now)
  const cooldowns = useRef(new Map<string, number>()), pending = useRef(false), alive = useRef(true)
  const entryId = useId(), signUp = localIntent === "sign-up", busy = pendingKind !== null || controller.idnBusy
  useEffect(() => { if (intent) setLocalIntent(intent) }, [intent])
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => { if (cooldownUntil <= Date.now()) return; const timer = setInterval(() => setNow(Date.now()), 1_000); return () => clearInterval(timer) }, [cooldownUntil])
  const schema = useMemo(() => z.object({ identifier: channel === "email" ? z.string().trim().email(t("mobile.entry.identity.errors.invalidEmail")).max(254) : z.string().trim().regex(/^\+[1-9]\d{7,14}$/, t("mobile.entry.identity.errors.invalidPhone")) }), [channel, t])
  const contact = useForm<{ identifier: string }>({ resolver: zodResolver(schema), defaultValues: { identifier: "" } })
  const code = useForm<{ code: string }>({ resolver: zodResolver(z.object({ code: z.string().trim().regex(/^\d{6}$/, t("mobile.entry.identity.errors.codeFormat")) })), defaultValues: { code: "" } })
  const remaining = nativeOtpRemaining(cooldownUntil, now), channelReady = channel === "email" ? configuration?.emailOtp === true : configuration?.smsOtp === true
  // EA-08 : un message qui porte son compte (durée du code, délai d'un refus de débit) prend sa forme plurielle.
  const say = (message: NativeEntryMessage) => message.count === undefined ? text(message.key, { count: remaining }) : text(nativePluralKey(message.key, message.count, locale), { count: message.count })
  const perform = async (kind: NonNullable<typeof pendingKind>, work: () => Promise<void>) => {
    if (controller.idnBusy || pending.current) return
    pending.current = true; setPending(kind); setError(null); setNotice(null)
    try { await work() } catch (failure) { if (alive.current) setError(nativeEntryRefusal(failure)) }
    finally { pending.current = false; if (alive.current) setPending(null) }
  }
  const sendTo = async (target: Destination): Promise<boolean> => {
    if (!configuration || !(target.channel === "email" ? configuration.emailOtp : configuration.smsOtp)) return false
    const key = nativeOtpCooldownKey(target.channel, target.identifier), deadline = cooldowns.current.get(key) ?? 0
    if (deadline > Date.now()) { if (alive.current) { setCooldownUntil(deadline); setNow(Date.now()); setError({ key: "mobile.entry.identity.cooldown" }) }; return false }
    const response = target.channel === "email"
      ? await nativeRequest(signal => controller.auth.emailOtp.sendVerificationOtp({ email: target.identifier, type: "sign-in", fetchOptions: { signal, headers: { "Accept-Language": locale }, throw: false } }))
      : await nativeRequest(signal => controller.auth.phoneNumber.sendOtp({ phoneNumber: target.identifier, fetchOptions: { signal, headers: { "Accept-Language": locale }, throw: false } }))
    if (!alive.current) return false
    if (response.error) { setError(nativeEntryRefusal(response.error)); return false }
    if (!nativeOtpSendAccepted(target.channel, response)) { setError({ key: "mobile.entry.identity.errors.generic" }); return false }
    const nextDeadline = Date.now() + NATIVE_OTP_COOLDOWN_MS
    if (cooldowns.current.size >= 8 && !cooldowns.current.has(key)) cooldowns.current.delete(cooldowns.current.keys().next().value ?? "")
    cooldowns.current.set(key, nextDeadline); setCooldownUntil(nextDeadline); setNow(Date.now())
    return true
  }
  const send = () => contact.handleSubmit(({ identifier }) => perform("send", async () => { const target = { channel, identifier }; if (await sendTo(target)) { setDestination(target); code.reset() } }))()
  const verify = () => code.handleSubmit(({ code: otp }) => perform("verify", async () => {
    if (!destination) return
    const generation = controller.vault.beginLogin()
    try {
      const response = destination.channel === "email"
        ? await nativeRequest(signal => controller.auth.signIn.emailOtp({ email: destination.identifier, otp, fetchOptions: { signal, throw: false } }))
        : await nativeRequest(signal => controller.auth.phoneNumber.verify({ phoneNumber: destination.identifier, code: otp, fetchOptions: { signal, throw: false } }))
      if (!alive.current) return
      if (controller.vault.generation !== generation) { if (!controller.vault.hasCredential) setError({ key: "mobile.entry.identity.errors.generic" }); return }
      if (response.error || !controller.vault.hasCredential) { controller.vault.fence(); setError(response.error ? nativeEntryRefusal(response.error) : { key: "mobile.entry.identity.errors.generic" }); return }
      code.reset(); await controller.resume()
    } catch (failure) { if (alive.current && controller.vault.generation === generation) controller.vault.fence(); throw failure }
  }))()
  const changeIntent = () => {
    if (busy) return
    const next = signUp ? "sign-in" : "sign-up"
    setLocalIntent(next); setDestination(null); setError(null); setNotice(null); code.reset(); contact.reset(); onRegistrationIntent?.(next)
  }
  const inputStyle = { color: tokens.foreground, backgroundColor: tokens.background, borderColor: tokens.input, borderWidth: 1, borderRadius: tokens.radiusField, paddingHorizontal: 12, paddingVertical: 11, minHeight: 48, fontSize: 16 }
  const fieldError = contact.formState.errors.identifier?.message, codeError = code.formState.errors.code?.message, identifierLabel = t(channel === "email" ? "mobile.entry.identity.emailLabel" : "mobile.entry.identity.phoneLabel")
  return <View style={{ paddingHorizontal: 16, paddingTop: 32, paddingBottom: 20, gap: 24, backgroundColor: tokens.background }}>
    <Pressable accessibilityRole="button" accessibilityLabel={t("mobile.entry.appearance.darkMode")} accessibilityHint={t(dark ? "mobile.entry.appearance.toLight" : "mobile.entry.appearance.toDark")} accessibilityState={{ selected: dark }} onPress={() => setMode(dark ? "light" : "dark")} style={{ position: "absolute", right: 12, top: 0, minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: 22 }}><NativeIcon name={dark ? "sun" : "moon"} size={20} /></Pressable>
    <View style={{ alignItems: "center", gap: 12 }}>
      <Text variant="display" accessibilityRole="header" style={{ color: tokens.primaryInk, fontSize: 48, lineHeight: 52, fontWeight: "700", letterSpacing: -1.8 }}>{BRAND_NAME}</Text>
      <Text style={{ color: tokens.foreground, fontSize: 20, lineHeight: 26, fontWeight: "500", letterSpacing: -0.3, textAlign: "center", maxWidth: 320 }}>{t("mobile.entry.access.headline")}</Text>
    </View>
    <View style={{ gap: 12, width: "100%", maxWidth: 420, alignSelf: "center", padding: 20, borderWidth: 1, borderColor: tokens.border, borderRadius: tokens.radiusCard, backgroundColor: tokens.card }}>
      <Text variant="display" accessibilityRole="header" style={{ color: tokens.foreground, fontSize: 20, lineHeight: 26, fontWeight: "600" }}>{destination ? t("mobile.entry.identity.codeTitle") : text(signUp ? "mobile.entry.access.signUpTitle" : "mobile.entry.access.signInTitle")}</Text>
      {destination ? <Text style={{ color: tokens.mutedForeground, fontSize: 14, lineHeight: 20 }}>{text("mobile.entry.identity.codeLead", { identifier: destination.identifier })}</Text> : signUp ? <Text style={{ color: tokens.mutedForeground, fontSize: 14, lineHeight: 20 }}>{t("mobile.entry.access.signUpLead")}</Text> : null}
      <Status label={error ? say(error) : controller.idnError ? t("mobile.entry.identity.errors.generic") : ""} error={error !== null || controller.idnError} />
      <Status label={notice ? t(notice) : ""} />
      <Status busy={configuration === undefined} label={configuration === undefined ? t("mobile.entry.identity.loading") : configuration === null ? t("mobile.entry.identity.configurationUnavailable") : ""} error={configuration === null} />
      {!destination ? <>
        <EntryAction icon="shield" label={t(controller.idnBusy ? "mobile.entry.identity.idnConnecting" : "mobile.entry.identity.idn")} busy={controller.idnBusy} disabled={pendingKind !== null || !configuration?.idn || !scheme} onPress={() => { if (pending.current || !scheme || !configuration?.idn) return; pending.current = true; void controller.signInIdn({ scheme, webUrl }).finally(() => { pending.current = false }) }} />
        {configuration?.idn && scheme ? <Text style={{ color: tokens.mutedForeground, fontSize: 13, lineHeight: 18 }}>{t("mobile.entry.identity.idnHelp")}</Text> : null}
        {configuration !== undefined && (!configuration?.idn || !scheme) ? <Text style={{ color: tokens.mutedForeground, fontSize: 12, lineHeight: 18 }}>{t("mobile.entry.identity.idnUnavailable")}</Text> : null}
        {configuration?.emailOtp && configuration.smsOtp ? <View accessibilityRole="radiogroup" accessibilityLabel={t("mobile.entry.identity.methodLabel")} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ flex: 1, color: tokens.mutedForeground, fontSize: 12, lineHeight: 18 }}>{t("mobile.entry.identity.lightAccount")}</Text>
          {(["email", "phone"] as const).map(value => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: channel === value, disabled: busy }} disabled={busy} onPress={() => { setMethod(value); contact.reset(); setError(null) }} style={{ minWidth: 44, minHeight: 44, paddingHorizontal: 12, paddingVertical: 8, alignItems: "center", justifyContent: "center", borderRadius: tokens.radiusField, backgroundColor: channel === value ? tokens.primary : tokens.background, borderWidth: channel === value ? 0 : 1, borderColor: tokens.border }}><Text style={{ color: channel === value ? tokens.primaryOn : tokens.foreground, fontSize: 14, fontWeight: "600" }}>{t(value === "email" ? "mobile.entry.identity.email" : "mobile.entry.identity.sms")}</Text></Pressable>)}
        </View> : null}
        <Controller control={contact.control} name="identifier" render={({ field }) => <TextInput ref={field.ref} nativeID={entryId + "-identifier"} accessibilityLabel={nativeFieldLabel(identifierLabel, fieldError)} accessibilityState={{ disabled: busy || !channelReady }} value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} onSubmitEditing={() => { if (!busy && channelReady) void send() }} returnKeyType="go" editable={!busy && channelReady} autoCorrect={false} autoCapitalize="none" keyboardType={channel === "email" ? "email-address" : "phone-pad"} textContentType={channel === "email" ? "emailAddress" : "telephoneNumber"} placeholder={channel === "email" ? identifierLabel : t("mobile.entry.identity.phonePlaceholder")} placeholderTextColor={tokens.mutedForeground} style={inputStyle} />} />
        {channel === "phone" ? <Text style={{ color: tokens.mutedForeground, fontSize: 12, lineHeight: 18 }}>{t("mobile.entry.identity.phoneHint")}</Text> : null}
        {fieldError ? <Status error label={fieldError} /> : null}
        {!channelReady && configuration !== undefined ? <Text style={{ color: tokens.mutedForeground, fontSize: 13, lineHeight: 18 }}>{t("mobile.entry.identity.codeUnavailable")}</Text> : null}
        <EntryAction icon={channel === "email" ? "mail" : "phone"} label={t(pendingKind === "send" ? "mobile.entry.identity.sending" : "mobile.entry.identity.sendCode")} busy={pendingKind === "send"} disabled={busy || !channelReady} onPress={() => { void send() }} />
      </> : <>
        <Text style={{ color: tokens.foreground, fontSize: 14, fontWeight: "500" }}>{t("mobile.entry.identity.codeLabel")}</Text>
        <Controller control={code.control} name="code" render={({ field }) => <TextInput ref={field.ref} accessibilityLabel={nativeFieldLabel(t("mobile.entry.identity.codeLabel"), codeError)} accessibilityState={{ disabled: busy }} value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} editable={!busy} autoCorrect={false} keyboardType="number-pad" textContentType="oneTimeCode" maxLength={6} style={{ ...inputStyle, letterSpacing: 5, fontSize: 20 }} />} />
        <Text style={{ color: tokens.mutedForeground, fontSize: 12, lineHeight: 18 }}>{say(nativeOtpCodeHint(configuration))}</Text>
        {codeError ? <Status error label={codeError} /> : null}
        <EntryAction icon="key" label={t(pendingKind === "verify" ? "mobile.entry.identity.verifying" : "mobile.entry.identity.verify")} busy={pendingKind === "verify"} disabled={busy} onPress={() => { void verify() }} />
        <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 4 }}>
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => { controller.vault.fence(); setDestination(null); code.reset(); setError(null); setNotice(null) }} style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 4 }}><Text style={{ color: tokens.primaryInk, fontSize: 13 }}>{t("mobile.entry.identity.changeContact")}</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy || remaining > 0, busy: pendingKind === "resend" }} disabled={busy || remaining > 0} onPress={() => { void perform("resend", async () => { if (await sendTo(destination)) { code.reset(); setNotice("mobile.entry.identity.resent") } }) }} style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 4, opacity: busy || remaining > 0 ? 0.5 : 1 }}><Text style={{ color: tokens.primaryInk, fontSize: 13 }}>{remaining > 0 ? text("mobile.entry.identity.resendWait", { count: remaining }) : t("mobile.entry.identity.resend")}</Text></Pressable>
        </View>
      </>}
      <View style={{ borderTopWidth: 1, borderTopColor: tokens.border, marginTop: 8, paddingTop: 16, gap: 12 }}>
        {!signUp ? <Text style={{ color: tokens.mutedForeground, fontSize: 14, textAlign: "center" }}>{text("mobile.entry.access.newHere")}</Text> : null}
        {signUp ? <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy} onPress={changeIntent} style={{ minHeight: 48, padding: 12, borderWidth: 1, borderColor: tokens.border, borderRadius: tokens.radiusField, justifyContent: "center", alignItems: "center" }}><Text style={{ color: tokens.primaryInk, fontSize: 15, fontWeight: "600", textAlign: "center" }}>{t("mobile.entry.access.existingAccount")}</Text></Pressable> : <EntryAction social label={t("mobile.entry.access.createAccount")} disabled={busy} onPress={changeIntent} />}
        {!signUp ? <Text style={{ color: tokens.mutedForeground, fontSize: 12, lineHeight: 18, textAlign: "center" }}>{t("mobile.entry.access.accountPromise")}</Text> : null}
      </View>
    </View>
    {onPublicDiscover ? <Pressable accessibilityRole="button" onPress={onPublicDiscover} style={{ minHeight: 44, alignItems: "center", justifyContent: "center" }}><Text style={{ color: tokens.mutedForeground, fontSize: 14, textAlign: "center", textDecorationLine: "underline" }}>{t("mobile.entry.access.discover")}</Text></Pressable> : null}
    <View accessibilityLabel={t("mobile.entry.access.footer")} style={{ borderTopWidth: 1, borderTopColor: tokens.border, paddingTop: 12, gap: 4 }}>
      {onLegal ? <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 2 }}>{(["about", "legal", "privacy"] as const).map(kind => <Pressable key={kind} accessibilityRole="button" onPress={() => onLegal(kind)} style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 8 }}><Text style={{ color: tokens.mutedForeground, fontSize: 12 }}>{t(`mobile.entry.access.${kind}`)}</Text></Pressable>)}</View> : null}
      <View style={{ flexDirection: "row", justifyContent: "center", gap: 4 }}>{(["fr", "en"] as const).map(language => <Pressable key={language} accessibilityRole="button" accessibilityLabel={t(language === "fr" ? "mobile.entry.access.french" : "mobile.entry.access.english")} accessibilityState={{ selected: locale === language }} onPress={() => setLocale(language)} style={{ minHeight: 44, paddingHorizontal: 10, justifyContent: "center" }}><Text style={{ color: locale === language ? tokens.foreground : tokens.mutedForeground, fontSize: 12, fontWeight: locale === language ? "600" : "400" }}>{t(language === "fr" ? "mobile.entry.access.french" : "mobile.entry.access.english")}</Text></Pressable>)}</View>
      <Text style={{ color: tokens.mutedForeground, fontSize: 12, lineHeight: 18, textAlign: "center" }}>{text("mobile.entry.access.signature")}</Text>
    </View>
  </View>
}
