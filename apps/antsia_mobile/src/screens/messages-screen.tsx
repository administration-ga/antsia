import { api, type Id } from "@antsia/api/engine"
import { useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { useCallback, useEffect, useMemo, useState } from "react"
import { FlatList, Image, Pressable, View } from "react-native"
import { useNativeAppearance } from "../appearance"
import { Action, Card, Label, QueryBoundary, RuntimeNotice, Screen, Status, nativeScope, useNativeGuard } from "../components/ui"
import { canAppendNativeCursor, mergeNativePages, nativeCursorKey } from "../lib/native-pagination"
import { useNativeRuntime } from "../runtime"

type Threads = FunctionReturnType<typeof api.modules.messaging.inbox.paginateMyThreads>
type Cursor = NonNullable<Threads["nextCursor"]>
function ThreadPage({ cursor, onPage }: { cursor: Cursor | null; onPage: (key: string, page: Threads | undefined) => void }) {
  const guard = useNativeGuard()
  const page = useQuery(api.modules.messaging.inbox.paginateMyThreads, guard.canRead ? { networkId: guard.runtime.networkId, limit: 20, ...(cursor ? { cursor } : {}) } : "skip")
  const key = nativeCursorKey(cursor)
  useEffect(() => { if (guard.canRead) onPage(key, page) }, [guard.canRead, key, onPage, page])
  return null
}
function MessagesBody({ onOpenThread, refresh }: { onOpenThread: (threadId: Id<"personalThreads">) => void; refresh: () => void }) {
  const guard = useNativeGuard(), { t, tokens } = useNativeAppearance()
  const [cursors, setCursors] = useState<(Cursor | null)[]>([null]), [pages, setPages] = useState<Record<string, Threads | undefined>>({})
  const onPage = useCallback((key: string, page: Threads | undefined) => setPages(previous => previous[key] === page ? previous : { ...previous, [key]: page }), [])
  const items = useMemo(() => mergeNativePages(cursors.map(cursor => pages[nativeCursorKey(cursor)]?.items ?? []), thread => String(thread.threadId)), [cursors, pages])
  const tail = pages[nativeCursorKey(cursors[cursors.length - 1] ?? null)], next = tail?.nextCursor
  const canMore = tail?.isDone === false && canAppendNativeCursor(cursors, next)
  const loadingMore = tail === undefined && cursors.length > 1
  if (!guard.canRead) return <Label>{t("mobile.common.privateUnavailable")}</Label>
  return <View style={{ flex: 1, gap: 8 }}>
    {cursors.map(cursor => <ThreadPage key={nativeCursorKey(cursor)} cursor={cursor} onPage={onPage} />)}
    <FlatList accessibilityLabel={t("mobile.messages.title")} accessibilityState={{ busy: pages.first === undefined || loadingMore }} data={items} keyExtractor={thread => String(thread.threadId)} refreshing={false} onRefresh={() => { if (guard.current()) refresh() }} scrollEnabled={guard.canAct} initialNumToRender={8} maxToRenderPerBatch={8} windowSize={5} removeClippedSubviews={false}
      ListHeaderComponent={<View style={{ gap: 8, paddingBottom: 12 }}>
        <RuntimeNotice />
        <Label muted>{t("mobile.messages.personalOnly")}</Label>
        <Status label={pages.first === undefined ? t("mobile.common.loading") : items.length === 0 ? t("mobile.messages.empty") : ""} busy={pages.first === undefined} />
      </View>}
      renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={t("mobile.messages.open") + " · " + (item.counterpart.displayName ?? t("mobile.messages.unknownPerson"))} accessibilityHint={item.unreadCount > 0 ? t("mobile.messages.unread") + " " + item.unreadCount : undefined} disabled={!guard.canAct} onPress={() => { if (guard.current()) onOpenThread(item.threadId) }} style={({ pressed }) => ({ minHeight: 84, paddingVertical: 14, paddingHorizontal: 4, flexDirection: "row", gap: 12, alignItems: "center", opacity: pressed ? 0.65 : 1, borderBottomWidth: 1, borderBottomColor: tokens.border })}>
        {item.counterpart.avatarUrl ? <Image alt="" accessible={false} source={{ uri: item.counterpart.avatarUrl }} style={{ width: 48, height: 48, borderRadius: 24 }} /> : <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: tokens.muted, justifyContent: "center", alignItems: "center" }}><Label strong>{(item.counterpart.displayName ?? "").slice(0, 1)}</Label></View>}
        <View style={{ flex: 1, gap: 2 }}><Label strong>{item.counterpart.displayName ?? t("mobile.messages.unknownPerson")}</Label>
        {item.lastMessageDeleted ? <Label muted>{t("mobile.messages.deleted")}</Label> : item.lastMessageKind === "text" ? <Label muted>{item.lastMessageText ?? t("mobile.messages.emptyPreview")}</Label> : <Label muted>{t(item.lastMessageKind === "voice" ? "mobile.messages.voice" : item.lastMessageKind === "attachments" ? "mobile.messages.attachments" : item.lastMessageKind === "call" ? "mobile.messages.callEvent" : "mobile.messages.emptyPreview")}</Label>}
        {item.lastMessageByMe ? <Label muted>{t(item.lastMessageReadByCounterpart ? "mobile.messages.read" : "mobile.messages.sent")}</Label> : null}</View>
        {item.unreadCount > 0 ? <View style={{ minWidth: 24, minHeight: 24, borderRadius: 12, padding: 4, backgroundColor: tokens.tabActive }}><Label strong>{item.unreadCount}{item.unreadCapped ? "+" : ""}</Label></View> : null}
      </Pressable>}
      ListFooterComponent={<View style={{ gap: 8 }}>
        <Status label={loadingMore ? t("mobile.common.loading") : ""} busy={loadingMore} />
        {canMore || loadingMore ? <Action label={t("mobile.common.loadMore")} pending={loadingMore} disabled={!guard.canAct} onPress={() => { if (guard.current() && canAppendNativeCursor(cursors, next)) setCursors(previous => [...previous, next]) }} /> : null}
        {tail?.isDone === false && !canMore ? <Label muted>{t("mobile.common.windowLimit")}</Label> : null}
      </View>} />
  </View>
}
export function MessagesScreen({ onOpenThread }: { onOpenThread: (threadId: Id<"personalThreads">) => void }) {
  const runtime = useNativeRuntime(), { t } = useNativeAppearance(), [version, setVersion] = useState(0)
  const key = nativeScope(runtime) + ":" + version
  return <Screen title={t("mobile.navigation.tab.messages")}>{!runtime.ready ? <RuntimeNotice /> : <QueryBoundary key={key} resetKey={key} fallback={<Card><Status label={t("mobile.common.unavailable")} error /><Action label={t("mobile.common.refresh")} disabled={!runtime.foreground || !runtime.online} onPress={() => { if (runtime.isCurrent() && runtime.foreground && runtime.online) setVersion(value => value + 1) }} /></Card>}><MessagesBody onOpenThread={onOpenThread} refresh={() => setVersion(value => value + 1)} /></QueryBoundary>}</Screen>
}
