import { Component, useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react"
import { AccessibilityInfo, ActivityIndicator, Platform, Pressable, Text, TextInput, View, type AccessibilityRole, type TextInputProps } from "react-native"
import { useNativeAppearance } from "../appearance"
import { useNativeRuntime } from "../runtime"
import { nativeControlState, nativeFieldLabel } from "../lib/accessibility"

type FocusHost = NonNullable<Parameters<typeof AccessibilityInfo.sendAccessibilityEvent>[0]>
export type NativeFocusTarget = () => FocusHost | null
let lastFocusTarget: NativeFocusTarget | null = null
export function rememberedNativeFocus(): NativeFocusTarget | null { return lastFocusTarget?.() ? lastFocusTarget : null }
export function focusNativeTarget(target: NativeFocusTarget | null): void {
  try {
    const host = target?.()
    if (host) AccessibilityInfo.sendAccessibilityEvent(host, "focus")
  } catch { /* A detached native target cannot fail the call or its session. */ }
}
/** Conservative until OS confirmation; subscribe first so an old read cannot undo a newer event. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(true)
  useEffect(() => {
    let mounted = true, revision = 0
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", value => { revision += 1; if (mounted) setReduced(value) })
    const readRevision = revision
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (mounted && revision === readRevision) setReduced(value) }).catch(() => { /* Unknown remains reduced. */ })
    return () => { mounted = false; subscription.remove() }
  }, [])
  return reduced
}

export function nativeScope(runtime: ReturnType<typeof useNativeRuntime>): string {
  return JSON.stringify([runtime.networkId, runtime.personId, runtime.sessionId, runtime.epoch])
}
/** Capture aussi un passage hors ligne/arrière-plan : une réponse ancienne ne valide pas le retour. */
export function useNativeGuard() {
  const runtime = useNativeRuntime(), owner = nativeScope(runtime)
  const latest = useRef({ runtime, generation: 0, stamp: "" })
  const stamp = JSON.stringify([owner, runtime.ready, runtime.foreground, runtime.online, runtime.canWrite])
  if (latest.current.stamp !== stamp) latest.current = { runtime, generation: latest.current.generation + 1, stamp }
  else latest.current.runtime = runtime
  const live = useRef(true), [revoked, setRevoked] = useState(false)
  useEffect(() => {
    live.current = true
    const unregister = runtime.registerCleanup(() => { live.current = false; setRevoked(true) })
    return () => { live.current = false; unregister() }
  }, [owner, runtime.registerCleanup])
  const current = useCallback(() => {
    const next = latest.current.runtime
    return live.current && nativeScope(next) === owner && next.ready && next.foreground && next.online && next.isCurrent()
  }, [owner])
  const capture = useCallback(() => {
    const generation = latest.current.generation
    return () => generation === latest.current.generation && current()
  }, [current])
  const readable = runtime.ready && !revoked && runtime.isCurrent()
  return { runtime, owner, current, capture, canRead: readable, canAct: readable && runtime.foreground && runtime.online }
}
export function Screen({ title, children }: { title: string; children: ReactNode }) {
  const { tokens } = useNativeAppearance()
  return <View style={{ flex: 1, padding: 12, gap: 12, backgroundColor: tokens.background }}><Text accessibilityRole="header" style={{ color: tokens.foreground, fontSize: 24, fontWeight: "700" }}>{title}</Text>{children}</View>
}
export function Label({ children, muted = false, strong = false, accessibilityRole, nativeID }: { children: ReactNode; muted?: boolean; strong?: boolean; accessibilityRole?: AccessibilityRole; nativeID?: string }) {
  const { tokens } = useNativeAppearance()
  return <Text nativeID={nativeID} accessibilityRole={accessibilityRole} selectable style={{ color: muted ? tokens.mutedForeground : tokens.foreground, fontSize: 15, lineHeight: 22, fontWeight: strong ? "700" : "400", flexShrink: 1 }}>{children}</Text>
}
/** Keep a named status node mounted; iOS receives changes explicitly, Android uses its live region. */
export function Status({ label, busy = false, error = false }: { label: string; busy?: boolean; error?: boolean }) {
  const { tokens } = useNativeAppearance()
  const previous = useRef("")
  useEffect(() => {
    if (Platform.OS === "ios" && label && previous.current !== label) AccessibilityInfo.announceForAccessibility(label)
    previous.current = label
  }, [label])
  return <Text accessible={label.length > 0} accessibilityLiveRegion={error ? "assertive" : "polite"} accessibilityRole={error ? "alert" : "text"} accessibilityState={{ busy }} style={{ color: error ? tokens.danger : tokens.mutedForeground, fontSize: 15, lineHeight: 22, flexShrink: 1, ...(label ? {} : { position: "absolute", width: 0, height: 0, overflow: "hidden" }) }}>{label}</Text>
}
export function Card({ children }: { children: ReactNode }) {
  const { tokens } = useNativeAppearance()
  return <View style={{ backgroundColor: tokens.card, borderRadius: tokens.radiusCard, padding: 16, gap: 12, marginBottom: 12 }}>{children}</View>
}
export function Action({ label, onPress, disabled = false, pending = false, tone = "neutral", selected, checked, accessibilityRole = "button", accessibilityHint, accessibilityLabel }: { label: string; onPress: () => void; disabled?: boolean; pending?: boolean; tone?: "neutral" | "primary" | "danger"; selected?: boolean; checked?: boolean; accessibilityRole?: "button" | "tab" | "radio"; accessibilityHint?: string; accessibilityLabel?: string }) {
  const { tokens } = useNativeAppearance()
  const target = useRef<View>(null), [focused, setFocused] = useState(false)
  const fill = tone === "primary" ? tokens.primary : tokens.muted
  const ink = tone === "primary" ? tokens.primaryOn : tone === "danger" ? tokens.danger : tokens.foreground
  return <Pressable ref={target} accessible accessibilityRole={accessibilityRole} accessibilityLabel={accessibilityLabel ?? label} accessibilityHint={accessibilityHint} accessibilityState={nativeControlState({ disabled, pending, selected, checked })} disabled={disabled || pending}
    onFocus={() => { setFocused(true); lastFocusTarget = () => target.current }} onBlur={() => setFocused(false)} onPress={() => { lastFocusTarget = () => target.current; onPress() }}
    style={({ pressed }) => ({ minHeight: 48, minWidth: 48, maxWidth: "100%", flexShrink: 1, paddingHorizontal: 16, paddingVertical: 10, borderWidth: 2, borderColor: focused ? tokens.primary : fill, borderRadius: 999, backgroundColor: fill, opacity: disabled || pending ? 0.5 : pressed ? 0.7 : 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 })}>{pending ? <ActivityIndicator accessible={false} accessibilityElementsHidden importantForAccessibility="no" color={ink} /> : null}<Text style={{ color: ink, fontSize: 15, fontWeight: "600", flexShrink: 1, textAlign: "center" }}>{label}</Text></Pressable>
}
export function Field({ label, value, onChangeText, onSubmit, returnKeyType, disabled = false, maxLength, multiline = false, error, hint, nativeID }: { label: string; value: string; onChangeText: (text: string) => void; onSubmit?: () => void; returnKeyType?: TextInputProps["returnKeyType"]; disabled?: boolean; maxLength?: number; multiline?: boolean; error?: string; hint?: string; nativeID?: string }) {
  const { tokens } = useNativeAppearance()
  const generated = useId(), id = nativeID ?? generated, target = useRef<TextInput>(null)
  return <View style={{ gap: 6, minWidth: 0 }}><Label nativeID={`${id}-label`}>{label}</Label><TextInput ref={target} nativeID={id} accessibilityLabel={nativeFieldLabel(label, error)} accessibilityLabelledBy={error ? [`${id}-label`, `${id}-error`] : `${id}-label`} accessibilityHint={hint} accessibilityState={{ disabled }} editable={!disabled} value={value} onChangeText={onChangeText} onFocus={() => { lastFocusTarget = () => target.current }} onSubmitEditing={onSubmit ? () => { if (!disabled) onSubmit() } : undefined} returnKeyType={returnKeyType} submitBehavior={onSubmit && !multiline ? "blurAndSubmit" : undefined} maxLength={maxLength} multiline={multiline} style={{ minHeight: multiline ? 88 : 48, minWidth: 48, color: tokens.foreground, backgroundColor: tokens.muted, borderColor: error ? tokens.danger : tokens.input, borderWidth: 1, borderRadius: tokens.radiusField, padding: 12, fontSize: 16, textAlignVertical: multiline ? "top" : "center" }} />{hint ? <Label muted>{hint}</Label> : null}{error ? <Label nativeID={`${id}-error`} accessibilityRole="alert">{error}</Label> : null}</View>
}
export function RuntimeNotice() {
  const runtime = useNativeRuntime(), { t } = useNativeAppearance()
  return !runtime.online ? <Label muted>{t("mobile.common.offline")}</Label> : !runtime.ready ? <Label>{t("mobile.common.privateUnavailable")}</Label> : !runtime.foreground ? <Label muted>{t("mobile.common.background")}</Label> : null
}
export class QueryBoundary extends Component<{ children: ReactNode; fallback: ReactNode; resetKey: string }, { failed: boolean }> {
  override state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  override componentDidUpdate(previous: Readonly<{ children: ReactNode; fallback: ReactNode; resetKey: string }>) {
    if (previous.resetKey !== this.props.resetKey && this.state.failed) this.setState({ failed: false })
  }
  override render() { return this.state.failed ? this.props.fallback : this.props.children }
}
