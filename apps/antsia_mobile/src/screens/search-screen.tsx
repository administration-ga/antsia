import { useState } from "react"
import { FlatList, Keyboard, View } from "react-native"
import { useQuery } from "convex/react"
import { api, type Id } from "@antsia/api/engine"
import { useNativeAppearance } from "../appearance"
import { Field, QueryBoundary, Status, useNativeGuard } from "../components/ui"
import { NativePostCard, type NativePostNavigation } from "./feed-screen"

function SearchResults({ query, onOpenPost, ...navigation }: { query: string; onOpenPost: (id: Id<"posts">) => void } & NativePostNavigation) {
  const guard = useNativeGuard(), { t } = useNativeAppearance()
  const result = useQuery(api.modules.posts.posts.search, guard.canRead ? { networkId: guard.runtime.networkId, query, limit: 30 } : "skip")
  if (!guard.canRead) return null
  return <FlatList data={result?.items ?? []} keyExtractor={post => String(post._id)} keyboardShouldPersistTaps="handled" ListEmptyComponent={<View style={{ padding: 20 }}><Status busy={result === undefined} label={t(result === undefined ? "mobile.common.loading" : "mobile.search.empty")} /></View>} renderItem={({ item }) => <NativePostCard post={item} active={false} onOpenPost={onOpenPost} {...navigation} />} />
}
export function SearchScreen({ onOpenPost, ...navigation }: { onOpenPost: (id: Id<"posts">) => void } & NativePostNavigation) {
  const { t } = useNativeAppearance(), guard = useNativeGuard()
  const [draft, setDraft] = useState(""), [query, setQuery] = useState("")
  const submit = () => { if (guard.current()) { setQuery(draft.trim()); Keyboard.dismiss() } }
  return <View style={{ flex: 1 }}><View style={{ padding: 16 }}><Field label={t("mobile.search.title")} value={draft} onChangeText={setDraft} maxLength={100} onSubmit={submit} submitLabel={t("mobile.search.submit")} returnKeyType="search" disabled={!guard.canAct} /></View>{query.length >= 2 ? <QueryBoundary key={`${guard.owner}:${query}`} resetKey={query} fallback={<Status error label={t("mobile.common.unavailable")} />}><SearchResults query={query} onOpenPost={onOpenPost} {...navigation} /></QueryBoundary> : <View style={{ paddingHorizontal: 16 }}><Status label={t("mobile.search.hint")} /></View>}</View>
}
