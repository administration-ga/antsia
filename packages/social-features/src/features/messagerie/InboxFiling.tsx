"use client"

import { api, type Id } from "@antsia/api/engine"
import { useAuthenticatedPaginatedQuery, useConvexMutationQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import { MoreHorizontal } from "lucide-react"
import { useRef, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import type { MessagerieGroupThread, MessagerieThread } from "./messagerie-source"
import { messageErreurLisible } from "./messagerie-erreur"

type Shelf = "pinned" | "archived"
type Change = { shelf: Shelf | null } | { muted: boolean }
type Target = { kind: "chat"; id: Id<"personalThreads"> } | { kind: "groupe"; id: Id<"groupThreads"> }

const PAGE = 20

export interface InboxFiling {
  archived: boolean
  setArchived: (value: boolean) => void
  direct: readonly MessagerieThread[]
  groups: readonly MessagerieGroupThread[]
  loading: boolean
  hasMore: boolean
  loadMore: () => void
  loadingMore: boolean
  change: (target: Target, change: Change) => Promise<void>
}

/** Load the member's own indexed shelves, including conversations beyond the first inbox page. */
export function InboxFilingProvider({ children }: { children: (filing: InboxFiling) => ReactNode }) {
  const { networkId } = useNetwork()
  const [archived, setArchived] = useState(false)
  const shelf = archived ? "archived" : "pinned"
  const args = { networkId, shelf } as const
  const options = { initialNumItems: PAGE }
  const low = useAuthenticatedPaginatedQuery(api.modules.messaging.inbox.paginateMyFiledThreads, { ...args, side: "low" }, options)
  const high = useAuthenticatedPaginatedQuery(api.modules.messaging.inbox.paginateMyFiledThreads, { ...args, side: "high" }, options)
  const groups = useAuthenticatedPaginatedQuery(api.modules.groups.threads.paginateMyGroupThreads, args, options)
  const regular = archived ? "skip" : { networkId } as const
  const lowInbox = useAuthenticatedPaginatedQuery(api.modules.messaging.inbox.paginateMyFiledThreads, regular === "skip" ? "skip" : { ...regular, side: "low" }, options)
  const highInbox = useAuthenticatedPaginatedQuery(api.modules.messaging.inbox.paginateMyFiledThreads, regular === "skip" ? "skip" : { ...regular, side: "high" }, options)
  const groupInbox = useAuthenticatedPaginatedQuery(api.modules.groups.threads.paginateMyGroupThreads, regular === "skip" ? "skip" : { ...regular, shelf: "inbox" }, options)
  const pages = archived ? [low, high, groups] : [low, high, groups, lowInbox, highInbox, groupInbox]
  const writePersonal = useConvexMutationQuery(api.modules.messaging.inbox.setMyThreadPreference)
  const writeGroup = useConvexMutationQuery(api.modules.groups.threads.setMyGroupShelf)
  const muteGroup = useConvexMutationQuery(api.modules.groups.threads.setGroupMuted)

  async function change(target: Target, update: Change) {
    if (target.kind === "chat") {
      await writePersonal.mutateAsync({ networkId, threadId: target.id, change: update })
    } else if ("muted" in update) {
      await muteGroup.mutateAsync({ networkId, threadId: target.id, muted: update.muted })
    } else {
      await writeGroup.mutateAsync({ networkId, threadId: target.id, shelf: update.shelf })
    }
  }

  return children({
    archived, setArchived,
    direct: archived ? [...low.results, ...high.results] : [...low.results, ...high.results, ...lowInbox.results, ...highInbox.results],
    groups: archived ? groups.results : [...groups.results, ...groupInbox.results],
    loading: pages.some(page => page.status === "LoadingFirstPage"),
    hasMore: pages.some(page => page.status === "CanLoadMore" || page.status === "LoadingMore"),
    loadMore: () => pages.forEach(page => { if (page.status === "CanLoadMore") page.loadMore(PAGE) }),
    loadingMore: pages.some(page => page.status === "LoadingMore"), change,
  })
}

export function ThreadOptions({ filing, target, name, shelf, muted }: {
  filing: InboxFiling; target: Target; name: string; shelf?: Shelf; muted?: boolean
}) {
  const { t } = useTranslation("messagerie")
  const details = useRef<HTMLDetailsElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  async function apply(change: Change) {
    setBusy(true)
    setError("")
    try {
      await filing.change(target, change)
      if (details.current) details.current.open = false
    } catch (cause) {
      setError(messageErreurLisible(cause, t))
    } finally {
      setBusy(false)
    }
  }
  return (
    <details className="msg-thread-options" ref={details} onKeyDown={event => {
      if (event.key === "Escape" && details.current?.open) {
        details.current.open = false
        details.current.querySelector("summary")?.focus()
      }
    }}>
      <summary aria-label={t("inboxFiling.options", { name })}><MoreHorizontal aria-hidden="true" size={18} /></summary>
      <div className="msg-thread-menu">
        <button type="button" disabled={busy} onClick={() => void apply({ shelf: shelf === "pinned" ? null : "pinned" })}>{t(shelf === "pinned" ? "inboxFiling.unpin" : "inboxFiling.pin")}</button>
        <button type="button" disabled={busy} onClick={() => void apply({ muted: !muted })}>{t(muted ? "inboxFiling.unmute" : "inboxFiling.mute")}</button>
        <button type="button" disabled={busy} onClick={() => void apply({ shelf: shelf === "archived" ? null : "archived" })}>{t(shelf === "archived" ? "inboxFiling.restore" : "inboxFiling.archive")}</button>
        {error && <p role="alert">{error}</p>}
      </div>
    </details>
  )
}
