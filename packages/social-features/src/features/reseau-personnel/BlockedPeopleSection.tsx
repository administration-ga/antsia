"use client"

/** Protections personnelles : deux sources natives, aucune identité projetée. */
import { themedActionStyle } from "../themed-action-style"
import { api, type Id } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useViewerTimeZone } from "@antsia/api/viewer-preferences"
import { formatViewerDate } from "@antsia/api/civil-date"
import { useNetwork } from "@antsia/api/network"
import { Button } from "@antsia/ui"
import { EspaceDialog, EspaceKitStyles } from "@antsia/ui/espace-kit"
import { useMutation } from "convex/react"
import type { FunctionArgs, FunctionReturnType } from "convex/server"
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { ReseauQueryError } from "../../shell/ReseauQueryError"
import {
  appendCursorPage,
  initialCursorPages,
  mergedCursorRows,
  nextCursor,
  recordCursorPage,
  removeCursorRows,
  type CursorPageMount,
  type CursorPageSnapshot,
  type CursorPagesState,
} from "./cursor-pages"
import { PanelCard, PeoplePanelStyles } from "./PeoplePanel"
import { relationErrorText } from "./people-panel"

type BlockRow = FunctionReturnType<typeof api.modules.graph.blocks.paginateMine>["page"][number]
type BlockSource = FunctionArgs<typeof api.modules.graph.blocks.paginateMine>["source"]
type BlockChains = Readonly<Record<BlockSource, CursorPagesState<BlockRow>>>
type RetryPage = () => Promise<unknown>

const SOURCES = ["intents", "legacy"] as const satisfies readonly BlockSource[]
const BLOCKS_PAGE_SIZE = 12
const keyOf = (row: BlockRow) => row.targetPersonId

function initialBlockChains(): BlockChains {
  return { intents: initialCursorPages<BlockRow>(), legacy: initialCursorPages<BlockRow>() }
}

/** Le changement de lecteur démonte aussi les confirmations et mutations locales. */
export function BlockedPeopleSection() {
  const { networkId, personId } = useNetwork()
  return (
    <div className="rp-people-panel" data-collection="relations">
      <PeoplePanelStyles />
      <EspaceKitStyles />
      <BlockedPeoplePages key={JSON.stringify([networkId, personId])} />
    </div>
  )
}

function BlockedQueryPage(props: {
  source: BlockSource
  mount: CursorPageMount
  report: (source: BlockSource, mount: CursorPageMount, snapshot: CursorPageSnapshot<BlockRow>) => void
  registerRetry: (key: string, retry: RetryPage) => () => void
}) {
  const { networkId } = useNetwork()
  const { source, mount, report, registerRetry } = props
  const query = useAuthenticatedConvexQuery(api.modules.graph.blocks.paginateMine, {
    networkId,
    source,
    paginationOpts: { numItems: BLOCKS_PAGE_SIZE, cursor: mount.cursor },
  })
  useEffect(() => {
    report(source, mount, { data: query.data, isPending: query.isPending, isError: query.isError })
  }, [source, mount, query.data, query.isPending, query.isError, report])
  useEffect(() => registerRetry(JSON.stringify([source, mount.id]), query.refetch), [source, mount.id, query.refetch, registerRetry])
  return null
}

function BlockedPeoplePages() {
  const { networkId } = useNetwork()
  const { t, i18n } = useTranslation("reseau")
  const timeZone = useViewerTimeZone()
  const [chains, setChains] = useState(initialBlockChains)
  const [confirming, setConfirming] = useState<BlockRow | null>(null)
  const [busy, setBusy] = useState(false)
  const running = useRef(false)
  const active = useRef(false)
  const retries = useRef(new Map<string, RetryPage>())
  const scopeId = useId()
  useLayoutEffect(() => {
    active.current = true
    return () => { active.current = false }
  }, [])

  const report = useCallback((source: BlockSource, mount: CursorPageMount, snapshot: CursorPageSnapshot<BlockRow>) => {
    setChains((previous) => {
      const next = recordCursorPage(previous[source], mount, snapshot)
      return next === previous[source] ? previous : { ...previous, [source]: next }
    })
  }, [])
  const registerRetry = useCallback((key: string, retry: RetryPage) => {
    retries.current.set(key, retry)
    return () => {
      if (retries.current.get(key) === retry) retries.current.delete(key)
    }
  }, [])
  const retry = () => {
    for (const refetch of retries.current.values()) {
      void (async () => { try { await refetch() } catch { /* Le hook affiche la panne. */ } })()
    }
  }

  const rows = new Map<Id<"persons">, BlockRow>()
  let hasError = false
  let initialLoading = false
  let loadingMore = false
  let hasMore = false
  for (const source of SOURCES) {
    const chain = chains[source]
    for (const row of mergedCursorRows(chain, keyOf)) {
      if (!rows.has(row.targetPersonId)) rows.set(row.targetPersonId, row)
    }
    const error = chain.mounts.some((mount) => chain.pages[mount.id]?.isError)
    const current = chain.pages[chain.mounts[chain.mounts.length - 1]!.id]
    hasError ||= error
    initialLoading ||= chain.pages[0]?.data === undefined && !error
    loadingMore ||= chain.mounts.length > 1 && (!current?.data || current.isPending) && !current?.isError
    hasMore ||= nextCursor(chain) !== null
  }
  const empty = rows.size === 0 && !hasError && !initialLoading && !loadingMore && !hasMore
  const unblock = useMutation(api.modules.graph.connections.unblockPerson)
  const closeConfirmation = () => {
    if (!running.current) setConfirming(null)
  }
  const confirmUnblock = async () => {
    if (!active.current || running.current || confirming === null) return
    running.current = true
    setBusy(true)
    try {
      await unblock({ networkId, targetPersonId: confirming.targetPersonId })
      if (!active.current) return
      const target = confirming.targetPersonId
      setChains((previous) => ({
        intents: removeCursorRows(previous.intents, (row) => row.targetPersonId === target),
        legacy: removeCursorRows(previous.legacy, (row) => row.targetPersonId === target),
      }))
      setConfirming(null)
      toast.success(t("peoplePanel.blocks.unblocked"))
    } catch (error) {
      if (active.current) toast.error(relationErrorText(error, "reseau:peoplePanel.blocks.unblockFailed", t))
    } finally {
      running.current = false
      if (active.current) setBusy(false)
    }
  }

  return (
    <PanelCard title={t("peoplePanel.blocks.title")} count={rows.size} countIsFloor={hasMore || initialLoading || loadingMore || hasError}>
      {SOURCES.flatMap((source) => chains[source].mounts.map((mount) => (
        <BlockedQueryPage key={JSON.stringify([source, mount.id])} source={source} mount={mount} report={report} registerRetry={registerRetry} />
      )))}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }} aria-busy={initialLoading || loadingMore}>
        <p id={scopeId} style={{ margin: 0, fontSize: 13, color: "var(--ink-600)" }}>{t("peoplePanel.blocks.globalScope")}</p>
        {hasError ? <ReseauQueryError title={t("peoplePanel.blocks.errorTitle")} message={t("peoplePanel.blocks.errorMessage")} onRetry={retry} /> : null}
        {initialLoading ? <p role="status">{t("peoplePanel.loading")}</p> : empty ? <p>{t("peoplePanel.blocks.empty")}</p> : null}
        {rows.size > 0 ? (
          <ul className="rp-person-tiles" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {[...rows.values()].map((row) => (
              <li key={row.targetPersonId} className="rp-person-tile">
                <p style={{ margin: 0, fontSize: 14, color: "var(--ink-900)" }}>{t("peoplePanel.blocks.neutral")}</p>
                <p style={{ margin: 0, fontSize: 12, color: "var(--ink-600)" }}>
                  <time dateTime={new Date(row.at).toISOString()}>{t("peoplePanel.blocks.blockedAt", { date: formatViewerDate(row.at, i18n.language, { dateStyle: "medium" }, timeZone) })}</time>
                </p>
                <Button variant="secondary" size="sm" disabled={busy} aria-describedby={scopeId} onClick={() => {
                  if (active.current && !running.current) setConfirming(row)
                }}>{t("peoplePanel.blocks.unblock")}</Button>
              </li>
            ))}
          </ul>
        ) : null}
        {hasMore || loadingMore ? (
          <Button variant="secondary" size="sm" disabled={initialLoading || loadingMore || hasError} onClick={() => setChains((previous) => ({
            intents: appendCursorPage(previous.intents), legacy: appendCursorPage(previous.legacy),
          }))}>{t(loadingMore ? "peoplePanel.loading" : "peoplePanel.blocks.loadMore")}</Button>
        ) : null}
      </div>
      {confirming !== null ? (
        <EspaceDialog title={t("peoplePanel.blocks.confirmTitle")} description={t("peoplePanel.blocks.confirmBody")} closeLabel={t("peoplePanel.blocks.close")} onClose={closeConfirmation} footer={(
          <>
            <Button style={themedActionStyle("cancel", "secondary")} variant="outline" disabled={busy} onClick={closeConfirmation}>{t("peoplePanel.blocks.cancel")}</Button>
            <Button disabled={busy} aria-busy={busy} onClick={() => void confirmUnblock()}>{t("peoplePanel.blocks.unblock")}</Button>
          </>
        )}>
          <p>{t("peoplePanel.blocks.globalScope")}</p>
        </EspaceDialog>
      ) : null}
    </PanelCard>
  )
}
