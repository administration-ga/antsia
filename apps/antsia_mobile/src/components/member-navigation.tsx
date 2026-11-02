import { Pressable, View } from "react-native"
import { BRAND_NAME } from "@antsia/social-contracts/brand"
import { useNativeAppearance } from "../appearance"
import { NATIVE_MEMBER_TABS, type NativeTab } from "../lib/routes"
import { NativeText as Text } from "./native-text"
import { NativeIcon, type NativeIconName } from "./icon"

export function IconAction({ icon, label, onPress, selected = false, primary = false, disabled = false }: { icon: NativeIconName; label: string; onPress: () => void; selected?: boolean; primary?: boolean; disabled?: boolean }) {
  const { tokens } = useNativeAppearance()
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, selected }} disabled={disabled} onPress={onPress} hitSlop={2} style={({ pressed }) => ({ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: 22, backgroundColor: primary ? tokens.primary : selected ? tokens.tabActive : tokens.muted, opacity: disabled ? 0.4 : pressed ? 0.65 : 1 })}><NativeIcon name={icon} color={primary ? tokens.primaryOn : selected ? tokens.tabActiveInk : tokens.foreground} /></Pressable>
}

export function NativeMemberHeader({ onHome, onCreate, onSearch, onNotifications, unreadCount = 0, unreadCapped = false, onBack }: { onHome: () => void; onCreate: () => void; onSearch?: () => void; onNotifications: () => void; unreadCount?: number; unreadCapped?: boolean; onBack?: () => void }) {
  const { tokens, t } = useNativeAppearance()
  return <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, minHeight: 60, backgroundColor: tokens.background, borderBottomWidth: 1, borderBottomColor: tokens.border }}>
    {onBack ? <IconAction icon="back" label={t("mobile.common.back")} onPress={onBack} /> : <IconAction icon="plus" label={t("mobile.nav.create")} onPress={onCreate} />}
    <Pressable accessibilityRole="button" accessibilityLabel={t("mobile.nav.feed")} onPress={onHome} style={{ flex: 1, minHeight: 44, flexDirection: "row", alignItems: "center", gap: 5 }}><Text variant="display" style={{ color: tokens.foreground, fontSize: 23, fontWeight: "700", letterSpacing: -0.5 }}>{BRAND_NAME}</Text><View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: tokens.primary }} /></Pressable>
    {onSearch ? <IconAction icon="search" label={t("mobile.search.title")} onPress={onSearch} /> : null}
    <View><IconAction icon="bell" label={t(unreadCount ? "mobile.navigation.unreadBell" : "mobile.navigation.bell", { count: unreadCapped ? `${unreadCount}+` : unreadCount })} onPress={onNotifications} />{unreadCount > 0 ? <View pointerEvents="none" style={{ position: "absolute", top: -2, right: -2, minWidth: 17, paddingHorizontal: 4, height: 17, borderRadius: 9, backgroundColor: tokens.primary, alignItems: "center", justifyContent: "center" }}><Text style={{ color: tokens.primaryOn, fontSize: 10, fontWeight: "700" }}>{unreadCapped ? `${unreadCount}+` : unreadCount}</Text></View> : null}</View>
  </View>
}

export function NativeMemberTabBar({ activeTab, onNavigate }: { activeTab: NativeTab; onNavigate: (name: NativeTab) => void }) {
  const { tokens, t } = useNativeAppearance()
  return <View accessibilityRole="tablist" style={{ flexDirection: "row", marginHorizontal: 12, marginTop: 6, marginBottom: 4, paddingHorizontal: 6, paddingVertical: 5, minHeight: 60, borderRadius: 30, backgroundColor: tokens.card, borderWidth: 1, borderColor: tokens.border }}>
    {NATIVE_MEMBER_TABS.map(({ name, icon }) => {
      const selected = activeTab === name
      return <Pressable key={name} accessibilityRole="tab" accessibilityLabel={t(`mobile.navigation.tab.${name}`)} accessibilityState={{ selected }} onPress={() => onNavigate(name)} style={({ pressed }) => ({ flex: 1, minHeight: 48, alignItems: "center", justifyContent: "center", gap: 3, borderRadius: 24, opacity: pressed ? 0.65 : 1 })}><View style={{ minWidth: 34, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: selected ? tokens.tabActive : undefined }}><NativeIcon name={icon} size={21} color={selected ? tokens.tabActiveInk : tokens.mutedForeground} /></View><Text style={{ fontSize: 11, fontWeight: selected ? "600" : "400", color: selected ? tokens.tabActiveInk : tokens.mutedForeground }}>{t(`mobile.navigation.tab.${name}`)}</Text></Pressable>
    })}
  </View>
}
