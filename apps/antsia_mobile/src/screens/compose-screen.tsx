import { NativeText as Text } from "../components/native-text"
import { useEffect, useMemo, useRef, useState } from "react"
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, View } from "react-native"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { randomUUID } from "expo-crypto"
import { useMutation } from "convex/react"
import { api, type Id } from "@antsia/api/engine"
import { PERSONAL_POST_MAX_LENGTH } from "@antsia/social-domain/content"
import { useNativeAppearance } from "../appearance"
import { Action, Field, Label, RuntimeNotice, Status, useNativeGuard } from "../components/ui"
import { nativePostIntent, type NativePostIntent } from "../lib/post-intent"

export function ComposeScreen({ displayName, onPublished }: { displayName: string; onPublished: (postId: Id<"posts">) => void }) {
  const { tokens, t } = useNativeAppearance(), guard = useNativeGuard()
  const publish = useMutation(api.modules.posts.posts.publish)
  const schema = useMemo(() => z.object({ body: z.string().trim().min(1, t("mobile.compose.invalid")).max(PERSONAL_POST_MAX_LENGTH, t("mobile.compose.invalid")) }), [t])
  const form = useForm<{ body: string }>({ resolver: zodResolver(schema), defaultValues: { body: "" } })
  const intent = useRef<NativePostIntent | null>(null), lock = useRef(false)
  const [pending, setPending] = useState(false), [uncertain, setUncertain] = useState(false), [hasIntent, setHasIntent] = useState(false)
  const { registerCleanup } = guard.runtime
  useEffect(() => registerCleanup(() => { intent.current = null; form.reset(); setUncertain(false); setHasIntent(false) }), [registerCleanup, form])
  const submit = form.handleSubmit(async ({ body }) => {
    if (lock.current || !guard.current() || !guard.runtime.canWrite) return
    const next = nativePostIntent(intent.current, guard.owner, body, randomUUID)
    if (!next) return
    intent.current = next; setHasIntent(true); lock.current = true; setPending(true); setUncertain(false)
    const current = guard.capture()
    try {
      const result = await publish({ networkId: guard.runtime.networkId, body: next.body, audience: "connections", idempotencyKey: next.key })
      if (!current()) return
      intent.current = null; setHasIntent(false); form.reset(); Keyboard.dismiss(); onPublished(result.postId)
    } catch { if (current()) setUncertain(true) }
    finally { lock.current = false; setPending(false) }
  })
  return <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 18 }}>
    <Text variant="display" accessibilityRole="header" style={{ color: tokens.foreground, fontSize: 24, fontWeight: "700" }}>{t("mobile.compose.title")}</Text>
    <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}><View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: tokens.tabActive, alignItems: "center", justifyContent: "center" }}><Text style={{ color: tokens.tabActiveInk, fontSize: 20, fontWeight: "700" }}>{displayName.slice(0, 1)}</Text></View><View style={{ flex: 1 }}><Label strong>{displayName}</Label><Label muted>{t("mobile.compose.audience")}</Label></View></View>
    <RuntimeNotice />
    <Controller control={form.control} name="body" render={({ field }) => <Field label={t("mobile.feed.composePrompt")} value={field.value} onChangeText={field.onChange} multiline maxLength={PERSONAL_POST_MAX_LENGTH} disabled={pending || hasIntent} error={form.formState.errors.body?.message} />} />
    <Label muted>{t("mobile.compose.textOnly")}</Label>
    <Status error label={uncertain ? t("mobile.compose.uncertain") : ""} />
    <Action label={t(uncertain ? "mobile.compose.retry" : "mobile.compose.publish")} tone="primary" pending={pending} disabled={!guard.canAct || !guard.runtime.canWrite} onPress={() => { void submit() }} />
  </ScrollView></KeyboardAvoidingView>
}
