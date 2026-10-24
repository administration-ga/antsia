import { useEffect, useRef, useState } from "react"
import { View } from "react-native"
import { useConvex, useQuery } from "convex/react"
import { api } from "@antsia/api/engine"
import { useNativeAppearance } from "../appearance"
import type { NativeSessionController } from "../lib/session-controller"
import { Action, Card, Label, Status } from "./ui"

/** Accounts and content come from the same isolated demo backend as the Web app. */
export function NativeDemoEntry({ controller }: { controller: NativeSessionController }) {
  const { t } = useNativeAppearance(), client = useConvex()
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
  return <View style={{ padding: 20, gap: 12 }}>
    <Label strong accessibilityRole="header">{t("mobile.demo.accounts")}</Label>
    <Label muted>{t("mobile.demo.shared")}</Label>
    {configuration === undefined || allowed && accounts === undefined
      ? <Status busy label={t("mobile.demo.loading")} />
      : !allowed || !accounts?.length
        ? <Status error label={t("mobile.demo.unavailable")} />
        : accounts.map(account => <Card key={account.actor}>
          {account.profile ? <Label strong>{account.profile.displayName}</Label> : null}
          <Label muted>{t(`mobile.demo.actors.${account.actor}.description`)}</Label>
          {!account.profile ? <Label muted>{t("mobile.demo.newProfile")}</Label> : null}
          <Action label={t(`mobile.demo.actors.${account.actor}.title`)} tone="primary"
            disabled={controller.demoBusy} pending={controller.demoBusy && selected === account.actor}
            onPress={() => { void enter(account.actor) }} />
        </Card>)}
    <Status error={controller.demoError} busy={controller.demoBusy}
      label={controller.demoError ? t("mobile.demo.failed") : controller.demoBusy ? t("mobile.demo.signingIn") : ""} />
  </View>
}
