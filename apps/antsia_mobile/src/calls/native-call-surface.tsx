import { NativeText as Text } from "../components/native-text"
import { lazy, Suspense, useEffect, useRef } from "react"
import { Modal, Platform, Pressable, ScrollView, View } from "react-native"
import { useNativeAppearance } from "../appearance"
import type { NativeCalls } from "./native-call-provider"
import type { NativeCallRoom } from "./native-room"
import { focusNativeTarget, rememberedNativeFocus, Status, useReducedMotion, type NativeFocusTarget } from "../components/ui"
import { nativeCallPresentation, nativeModalOpens, type NativeCallPresentation } from "../lib/accessibility"

// This import runs only after a real Room exists, never in an unavailable binary/Expo Go.
const CallVideo = lazy(() => import("./native-call-video"))
export function NativeCallSurface({ calls, foreground, videos, dismiss }: {
  calls: NativeCalls; foreground: boolean; videos: NativeCallRoom["videos"]; dismiss: () => void
}) {
  const { t, tokens } = useNativeAppearance()
  const reducedMotion = useReducedMotion(), presentation = nativeCallPresentation({ foreground, phase: calls.phase, minimized: calls.minimized, busy: calls.busy })
  const title = useRef<Text>(null), answer = useRef<View>(null), restore = useRef<View>(null)
  const origin = useRef<NativeFocusTarget | null>(null), previous = useRef<NativeCallPresentation>("hidden")
  const revision = useRef(0), focused = useRef(false), current = useRef(presentation)
  current.current = presentation
  useEffect(() => {
    const before = previous.current
    if (nativeModalOpens(before, presentation)) {
      revision.current += 1; focused.current = false
      if (before !== "pill") origin.current = rememberedNativeFocus()
    }
    if (before === "modal" && presentation !== "modal" && foreground && Platform.OS !== "ios") {
      const at = ++revision.current
      requestAnimationFrame(() => {
        if (revision.current !== at || current.current === "modal") return
        focusNativeTarget(presentation === "pill" ? () => restore.current : origin.current)
      })
    }
    previous.current = presentation
    return () => { revision.current += 1 }
  }, [foreground, presentation])
  function initialFocus() {
    if (focused.current || current.current !== "modal") return
    focused.current = true
    const at = revision.current
    requestAnimationFrame(() => {
      if (revision.current === at && current.current === "modal") focusNativeTarget(calls.incoming && calls.phase === "ringing" && answer.current ? () => answer.current : () => title.current)
    })
  }
  function restoreFocus() {
    if (!foreground || current.current === "modal") return
    focusNativeTarget(current.current === "pill" ? () => restore.current : origin.current)
  }
  function button(key: string, onPress: () => void, disabled = false, checked?: boolean) {
    return <Pressable ref={key === "mobile.calls.answer" ? answer : key === "mobile.calls.restore" ? restore : undefined} accessible accessibilityRole="button" accessibilityLabel={t(key)} accessibilityState={{ disabled, ...(checked !== undefined ? { checked } : {}) }} disabled={disabled} onPress={onPress}
      style={{ backgroundColor: tokens.muted, borderColor: tokens.border, borderWidth: 1, borderRadius: tokens.radiusField, minHeight: 48, minWidth: 48, padding: 12, opacity: disabled ? 0.5 : 1 }}><Text style={{ color: tokens.foreground, flexShrink: 1 }}>{t(key)}</Text></Pressable>
  }
  const pill = presentation === "pill" ? <View style={{ position: "absolute", bottom: 76, left: 12, right: 12, padding: 12, backgroundColor: tokens.card, borderRadius: tokens.radiusCard, borderColor: tokens.border, borderWidth: 1 }}>
    <Status label={t(`mobile.calls.phase.${calls.phase}`)} busy={calls.phase === "connecting" || calls.phase === "reconnecting" || calls.phase === "permission"} />
    {button("mobile.calls.restore", calls.restore)}
  </View> : null
  return <>{pill}<Modal visible={presentation === "modal"} transparent animationType={reducedMotion ? "none" : "fade"} onShow={initialFocus} onDismiss={restoreFocus} onRequestClose={calls.busy ? calls.minimize : dismiss}>
    {presentation === "modal" ? <View accessible={false} accessibilityViewIsModal onAccessibilityEscape={calls.busy ? calls.minimize : dismiss} style={{ flex: 1, justifyContent: "center", backgroundColor: tokens.background, padding: 16 }}>
      <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 24 }}>
        <Text ref={title} accessible accessibilityRole="header" style={{ color: tokens.foreground, fontSize: 22, fontWeight: "700", flexShrink: 1 }}>{t(calls.media === "video" ? "mobile.calls.videoTitle" : "mobile.calls.audioTitle")}</Text>
        {calls.peer ? <Text style={{ color: tokens.foreground }}>{calls.peer}</Text> : null}
        <Status label={t(`mobile.calls.phase.${calls.phase}`)} busy={calls.phase === "connecting" || calls.phase === "reconnecting" || calls.phase === "permission"} />
        <Status label={calls.failure ? t(`mobile.calls.failure.${calls.failure}`) : ""} error />
        {calls.room && videos.length > 0 ? <Suspense fallback={<Status label={t("mobile.calls.videoLoading")} busy />}><CallVideo tracks={videos} /></Suspense> : null}
        {calls.phase === "ringing" && calls.incoming && !calls.room ? button("mobile.calls.answer", calls.answer) : null}
        {calls.room ? <View style={{ gap: 8 }}>
          {button(calls.muted ? "mobile.calls.unmute" : "mobile.calls.mute", () => { void calls.toggleMute() }, false, calls.muted)}
          {button(calls.held ? "mobile.calls.resume" : "mobile.calls.hold", () => { void calls.toggleHeld() }, false, calls.held)}
          {calls.media === "video" ? button(calls.camera ? "mobile.calls.cameraOff" : "mobile.calls.cameraOn", () => { void calls.toggleCamera() }, false, calls.camera) : null}
        </View> : null}
        {calls.busy ? <>{button("mobile.calls.end", () => { void calls.end() })}{button("mobile.calls.minimize", calls.minimize)}</> : button("mobile.calls.close", dismiss)}
      </ScrollView>
    </View> : null}
  </Modal></>
}
