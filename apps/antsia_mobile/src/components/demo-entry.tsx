import { NativeText as Text } from "./native-text"
import { useEffect, useRef, useState } from "react"
import { ActivityIndicator, Pressable, View } from "react-native"
import { useConvex, useQuery } from "convex/react"
import { api } from "@antsia/api/engine"
import { BRAND_NAME } from "@antsia/social-contracts/brand"
import { useNativeAppearance } from "../appearance"
import { nativeEntryText } from "../lib/native-entry-model"
import type { NativeSessionController } from "../lib/session-controller"
import { Status } from "./ui"

/** Accounts and content come from the same isolated demo backend as the Web app. */
export function NativeDemoEntry({ controller }: { controller: NativeSessionController }) {
  const { t, tokens } = useNativeAppearance(), client = useConvex()
  const text = (key: string) => nativeEntryText(t, key, { brand: BRAND_NAME })
  const configuration = useQuery(api.modules.platform.authentication.configuration, {})
  const allowed = configuration?.demoAccounts === true && configuration.emailOtp === true
  const accounts = useQuery(api.modules.platform.demoAccounts.catalogue, allowed ? {} : "skip")
  const [selected, setSelected] = useState<string | null>(null)
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const enter = async (actor: string) => {
    if (controller.demoBusy || !allowed) return
    setSelected(actor)
    try {
      await controller.signInDemo(actor, {
        configuration: () => client.query(api.modules.platform.authentication.configuration, {}),
        catalogue: () => client.query(api.modules.platform.demoAccounts.catalogue, {}),
        latestOtp: email => client.query(api.modules.platform.devTools.latestOtp, { email }),
      })
    } finally { if (alive.current) setSelected(null) }
  }
  return <View style={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 28, gap: 20 }}>
    <View style={{ alignItems: "center", gap: 10 }}>
      <Text variant="display" accessibilityRole="header" style={{ color: tokens.primaryInk, fontSize: 48, lineHeight: 52, fontWeight: "700", letterSpacing: -1.8 }}>{BRAND_NAME}</Text>
      <Text style={{ color: tokens.foreground, fontSize: 20, lineHeight: 26, fontWeight: "500", textAlign: "center", maxWidth: 320 }}>{t("mobile.entry.access.headline")}</Text>
      <Text style={{ color: tokens.mutedForeground, fontSize: 14, lineHeight: 21, textAlign: "center", maxWidth: 360 }}>{text("mobile.entry.demo.leadShared")}</Text>
    </View>
    <View style={{ width: "100%", maxWidth: 420, alignSelf: "center", gap: 10 }}>
      <Text variant="display" accessibilityRole="header" style={{ color: tokens.foreground, fontSize: 17, fontWeight: "700", paddingBottom: 4 }}>{text("mobile.entry.demo.title")}</Text>
      {configuration === undefined || allowed && accounts === undefined
        ? <Status busy label={t("mobile.demo.loading")} />
        : !allowed || !accounts?.length
          ? <Status error label={t("mobile.demo.unavailable")} />
          : accounts.map(account => {
            const title = t(`mobile.entry.demo.actors.${account.actor}.title`)
            const name = account.profile?.displayName ?? title
            const active = controller.demoBusy && selected === account.actor
            return <Pressable key={account.actor} accessibilityRole="button" accessibilityLabel={`${title}${account.profile ? ` · ${name}` : ""}`} accessibilityState={{ disabled: controller.demoBusy, busy: active }} disabled={controller.demoBusy} onPress={() => { void enter(account.actor) }} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: active ? 1 : 0, borderColor: tokens.primary, backgroundColor: tokens.muted, opacity: controller.demoBusy && !active ? 0.5 : pressed ? 0.75 : 1 })}>
              <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                <Text style={{ color: tokens.foreground, fontSize: 14, lineHeight: 20, fontWeight: "600" }}>{active ? t("mobile.entry.demo.signingIn") : title}</Text>
                <Text style={{ color: tokens.mutedForeground, fontSize: 12, lineHeight: 18 }}>{account.profile ? `${name} · ` : ""}{t(`mobile.entry.demo.actors.${account.actor}.description`)}</Text>
              </View>
              {active ? <ActivityIndicator accessible={false} color={tokens.primaryInk} /> : null}
            </Pressable>
          })}
      <Status error={controller.demoError} busy={controller.demoBusy}
        label={controller.demoError ? t("mobile.entry.demo.failed") : controller.demoBusy ? t("mobile.entry.demo.signingIn") : ""} />
    </View>
  </View>
}
