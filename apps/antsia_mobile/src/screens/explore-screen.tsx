import { api } from "@antsia/api/engine"
import { useQuery } from "convex/react"
import { useState } from "react"
import { ScrollView, View } from "react-native"
import { useNativeAppearance } from "../appearance"
import { Action, Card, Label, QueryBoundary, RuntimeNotice, Screen, Status, nativeScope, useNativeGuard } from "../components/ui"
import { AssociationDirectorySection } from "./association-directory-section"
import { ShopDirectorySection } from "./shop-directory-section"

type ExploreSection = "shops" | "services" | "associations" | "myActivities"
type Props = { onOpenShop: (handle: string) => void; onOpenPage: (handle: string) => void }

function MyActivities({ onOpenShop, onOpenPage }: Props) {
  const guard = useNativeGuard(), { t } = useNativeAppearance()
  const pages = useQuery(api.modules.pages.pages.myPages, guard.canRead ? { networkId: guard.runtime.networkId } : "skip")
  const shops = useQuery(api.modules.shops.shops.myShops, guard.canRead ? { networkId: guard.runtime.networkId } : "skip")
  if (!guard.canRead) return <RuntimeNotice />
  return <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 12 }}>
    <Label strong accessibilityRole="header">{t("mobile.explore.myPages")}</Label>
    <Status label={pages === undefined ? t("mobile.common.loading") : pages.length === 0 ? t("mobile.explore.emptyPages") : ""} busy={pages === undefined} />
    {pages?.map(page => <Card key={String(page.pageId)}><Label strong>{page.name}</Label><Action label={t("mobile.pages.openPage")} disabled={!guard.canAct} onPress={() => { if (guard.current()) onOpenPage(page.handle) }} /></Card>)}
    <Label strong accessibilityRole="header">{t("mobile.explore.myShops")}</Label>
    <Status label={shops === undefined ? t("mobile.common.loading") : ""} busy={shops === undefined} />
    {shops?.items.map(shop => <Card key={String(shop.shopId)}><Label strong>{shop.name ?? shop.pageHandle ?? t("mobile.business.openShop")}</Label>{shop.pageHandle ? <Action label={t("mobile.business.openShop")} disabled={!guard.canAct || shop.storefront !== "published"} onPress={() => { if (guard.current() && shop.pageHandle && shop.storefront === "published") onOpenShop(shop.pageHandle) }} /> : null}</Card>)}
    {shops?.truncated ? <Label muted>{t("mobile.common.windowLimit")}</Label> : null}
  </ScrollView>
}

export function ExploreScreen(props: Props) {
  const guard = useNativeGuard(), { t } = useNativeAppearance()
  const [section, setSection] = useState<ExploreSection>("shops"), [version, setVersion] = useState(0)
  const scope = nativeScope(guard.runtime) + ":" + section + ":" + version
  return <Screen title={t("mobile.explore.title")}>
    <RuntimeNotice />
    <View accessibilityRole="tablist" style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {(["shops", "services", "associations", "myActivities"] as const).map(item => <Action key={item} accessibilityRole="tab" selected={section === item} label={t(`mobile.explore.${item}`)} tone={section === item ? "primary" : "neutral"} disabled={!guard.canAct} onPress={() => { if (guard.current()) setSection(item) }} />)}
    </View>
    {!guard.runtime.ready ? null : <QueryBoundary key={scope} resetKey={scope} fallback={<Card><Status label={t("mobile.common.unavailable")} error /><Action label={t("mobile.common.refresh")} disabled={!guard.canAct} onPress={() => { if (guard.current()) setVersion(value => value + 1) }} /></Card>}>
      {section === "myActivities" ? <MyActivities {...props} /> : section === "associations" ? <AssociationDirectorySection onOpenPage={props.onOpenPage} /> : <ShopDirectorySection mode={section} {...props} />}
    </QueryBoundary>}
  </Screen>
}
