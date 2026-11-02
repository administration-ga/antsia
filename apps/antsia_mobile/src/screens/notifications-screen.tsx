import { useCallback, useEffect, useMemo, useState } from "react"
import { FlatList, Linking, View } from "react-native"
import { useMutation, useQuery } from "convex/react"
import { api } from "@antsia/api/engine"
import type { FunctionReturnType } from "convex/server"
import { useNativeAppearance } from "../appearance"
import { Action, Card, Label, QueryBoundary, RuntimeNotice, Screen, Status, nativeScope, useNativeGuard } from "../components/ui"
import { nativeRequest } from "@antsia/social-native/request"
import { canAppendNativeCursor, mergeNativePages, nativeCursorKey } from "../lib/native-pagination"
import { nativeNotificationRoute, nativeNotificationSentence, nativeNotificationWebUrl, type NativeNotification } from "../lib/native-notifications"
import type { NativeRoute } from "../lib/routes"
import { useNativeRuntime } from "../runtime"
type Page = FunctionReturnType<typeof api.modules.notifications.bell.paginateNotifications>
function NotificationPage({ cursor, onPage }: { cursor: string | null; onPage: (key: string, page: Page | undefined) => void }) {
  const guard = useNativeGuard()
  const page = useQuery(api.modules.notifications.bell.paginateNotifications, guard.canRead ? { networkId: guard.runtime.networkId, paginationOpts: { cursor, numItems: 20 } } : "skip")
  const key = nativeCursorKey(cursor)
  useEffect(() => { if (guard.canRead) onPage(key, page) }, [guard.canRead, key, onPage, page])
  return null
}
function Body({ onNavigate, refresh }: { onNavigate: (route: NativeRoute) => void; refresh: () => void }) {
  const guard = useNativeGuard(), { t, locale } = useNativeAppearance()
  const [cursors, setCursors] = useState<(string | null)[]>([null]), [pages, setPages] = useState<Record<string, Page | undefined>>({}), [unread, setUnread] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(false)
  const mark = useMutation(api.modules.notifications.bell.markRead), markAll = useMutation(api.modules.notifications.bell.markAllRead)
  const onPage = useCallback((key: string, page: Page | undefined) => setPages(previous => previous[key] === page ? previous : { ...previous, [key]: page }), [])
  const all = useMemo(() => mergeNativePages(cursors.map(cursor => pages[nativeCursorKey(cursor)]?.page ?? []), item => item.notificationId), [cursors, pages])
  const items = unread ? all.filter(item => item.readAt === null) : all
  const tail = pages[nativeCursorKey(cursors[cursors.length - 1])], next = tail?.continueCursor
  const more = tail?.isDone === false && canAppendNativeCursor(cursors, next)
  const act = async (item?: NativeNotification, open = false) => {
    if (!guard.canAct || busy) return
    const current = guard.capture(); setBusy(true); setError(false)
    try {
      if (item) await nativeRequest(() => mark({ networkId: guard.runtime.networkId, notificationId: item.notificationId }))
      else await nativeRequest(() => markAll({ networkId: guard.runtime.networkId }))
      if (!current()) return
      if (open && item) {
        const route = nativeNotificationRoute(item), url = nativeNotificationWebUrl(item, guard.runtime.webUrl, guard.runtime.webBasePath)
        if (route) onNavigate(route)
        else if (url) await Linking.openURL(url)
      }
    } catch { if (current()) setError(true) }
    finally { if (current()) setBusy(false) }
  }
  return <View style={{ flex: 1, gap: 8 }}>
    {cursors.map(cursor => <NotificationPage key={nativeCursorKey(cursor)} cursor={cursor} onPage={onPage} />)}
    <RuntimeNotice />
    <View accessibilityRole="tablist" style={{ flexDirection: "row", gap: 8 }}>{([false, true] as const).map(value => <Action key={String(value)} label={t(`mobile.notificationUi.notificationsList.${value ? "unread" : "all"}`)} accessibilityRole="tab" selected={unread === value} tone={unread === value ? "primary" : "neutral"} onPress={() => setUnread(value)} />)}</View>
    <Action label={t("mobile.notificationUi.notificationsCenter.markAllRead")} disabled={!guard.canAct} pending={busy} onPress={() => { void act() }} />
    {unread ? <Label muted>{t("mobile.notificationUi.notificationsList.filterScope")}</Label> : null}
    <Status error={error} label={error ? t("mobile.notificationUi.notificationCenterTabs.markFailed") : ""} />
    <FlatList data={items} keyExtractor={item => item.notificationId} refreshing={false} onRefresh={refresh} initialNumToRender={10} maxToRenderPerBatch={10} windowSize={5}
      ListEmptyComponent={<Status busy={!pages.first} label={t(!pages.first ? "mobile.common.loading" : unread ? "mobile.notificationUi.notificationsList.emptyUnread" : "mobile.notificationUi.notificationsList.empty")} />}
      renderItem={({ item }) => <Card><Label strong={item.readAt === null}>{nativeNotificationSentence(item, t)}</Label><Label muted>{new Date(item.createdAt).toLocaleString(locale)}</Label>{nativeNotificationRoute(item) || nativeNotificationWebUrl(item, guard.runtime.webUrl, guard.runtime.webBasePath) ? <Action label={t(nativeNotificationRoute(item) ? "mobile.notificationUi.notificationTargets.open" : "mobile.navigation.openWeb")} pending={busy} disabled={!guard.canAct} onPress={() => { void act(item, true) }} /> : null}{item.readAt === null ? <Action label={t("mobile.notificationUi.reseauNotificationRow.markRead")} pending={busy} disabled={!guard.canAct} onPress={() => { void act(item) }} /> : null}</Card>}
      ListFooterComponent={more ? <Action label={t("mobile.common.loadMore")} disabled={!guard.canAct} onPress={() => { if (guard.current() && canAppendNativeCursor(cursors, next)) setCursors(previous => [...previous, next]) }} /> : tail?.isDone === false && cursors.length >= 10 ? <Label muted>{t("mobile.common.windowLimit")}</Label> : null} />
  </View>
}
export function NotificationsScreen({ onNavigate }: { onNavigate: (route: NativeRoute) => void }) {
  const runtime = useNativeRuntime(), { t } = useNativeAppearance(), [version, setVersion] = useState(0)
  const key = nativeScope(runtime) + ":" + version
  return <Screen title={t("mobile.notificationUi.notificationsList.heading")}><QueryBoundary key={key} resetKey={key} fallback={<Card><Status label={t("mobile.common.unavailable")} error /><Action label={t("mobile.common.retry")} onPress={() => setVersion(value => value + 1)} /></Card>}><Body onNavigate={onNavigate} refresh={() => setVersion(value => value + 1)} /></QueryBoundary></Screen>
}
