// Dupliqué de socle/packages/agent-features/src/features/direct/DirectAntennaPanel.tsx @ ad2e7fdc2 — adaptations : délégations dans un volet réservé au droit delegate, candidats liés à l’hôte, capacités sensibles explicites, édition sans confondre média et gestion, i18n.
"use client"

import { api, type Id } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import { defaultDelegationFlags, DIRECT_MAX_DELEGATIONS } from "@antsia/social-domain/live/permissions"
import { Button } from "@antsia/ui"
import { useMutation } from "convex/react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import type { DirectSession } from "./DirectPage"
import { useDirectCommand } from "./use-direct-command"

export function DirectDelegationsPanel({ session }: { session: DirectSession }) {
  const { t } = useTranslation("direct")
  const { networkId } = useNetwork()
  const [search, setSearch] = useState("")
  const [position, setPosition] = useState<{ side: "low" | "high"; cursor: string | null }>({ side: "low", cursor: null })
  const query = useAuthenticatedConvexQuery(api.modules.live.delegations.listForSession, { networkId, sessionId: session.sessionId })
  const candidates = useAuthenticatedConvexQuery(api.modules.live.delegations.searchCandidates, { networkId, sessionId: session.sessionId, side: position.side, search, paginationOpts: { cursor: position.cursor, numItems: 20 } })
  const grant = useMutation(api.modules.live.delegations.grant)
  const revoke = useMutation(api.modules.live.delegations.revoke)
  const command = useDirectCommand()
  const [target, setTarget] = useState("")
  const [kind, setKind] = useState<"cohost" | "moderator">("moderator")
  const [flags, setFlags] = useState(() => defaultDelegationFlags("moderator"))
  if (query.isError || candidates.isError) return <p role="alert">{t("delegations.failed")}</p>
  if (!query.data || !candidates.data) return <p role="status">{t("loading")}</p>
  const options = [...query.data, ...candidates.data.page.filter((candidate) => !query.data!.some((row) => row.personId === candidate.personId))]
  const selected = options.find((candidate) => candidate.personId === target)
  const full = query.data.length >= DIRECT_MAX_DELEGATIONS && !query.data.some((row) => row.personId === target)
  return <div className="flex flex-col gap-4">
    <p>{t("delegations.description")}</p>
    <p className="text-sm text-muted-foreground">{t("delegations.capacity", { count: query.data.length, max: DIRECT_MAX_DELEGATIONS })}</p>
    <label className="flex flex-col gap-2">{t("delegations.search")}<input value={search} maxLength={80} onChange={(event) => { setSearch(event.target.value); setPosition({ side: "low", cursor: null }); setTarget("") }} className="min-h-11 rounded-[var(--esp-input-radius,0.5rem)] border border-input bg-background px-3" /></label>
    <label className="flex flex-col gap-2">{t("delegations.person")}<select value={target} onChange={(event) => {
      setTarget(event.target.value)
      const existing = query.data!.find((row) => row.personId === event.target.value)
      if (existing) { setKind(existing.kind); setFlags({ canAdmitToStage: existing.canAdmitToStage, canExclude: existing.canExclude, canEndOrTransfer: existing.canEndOrTransfer }) }
      else { setKind("moderator"); setFlags(defaultDelegationFlags("moderator")) }
    }} className="min-h-11 rounded-[var(--esp-input-radius,0.5rem)] border border-input bg-background px-3"><option value="">{t("delegations.choose")}</option>{options.map((candidate) => <option key={candidate.personId} value={candidate.personId}>{candidate.displayName ?? t("person")}</option>)}</select></label>
    {!candidates.data.isDone || position.side === "low" ? <Button variant="ghost" disabled={candidates.isFetching} onClick={() => { setTarget(""); setPosition(candidates.data!.isDone ? { side: "high", cursor: null } : { side: position.side, cursor: candidates.data!.continueCursor }) }}>{t("delegations.moreCandidates")}</Button> : null}
    <label className="flex flex-col gap-2">{t("delegations.role")}<select value={kind} onChange={(event) => { const value = event.target.value === "cohost" ? "cohost" : "moderator"; setKind(value); setFlags(defaultDelegationFlags(value)) }} className="min-h-11 rounded-[var(--esp-input-radius,0.5rem)] border border-input bg-background px-3"><option value="moderator">{t("delegations.kind.moderator")}</option><option value="cohost">{t("delegations.kind.cohost")}</option></select></label>
    <p className="text-sm">{t("delegations.chatIncluded")}</p>
    {(["canAdmitToStage", "canExclude", "canEndOrTransfer"] as const).map((flag) => <label key={flag} className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={flags[flag]} onChange={(event) => setFlags((current) => ({ ...current, [flag]: event.target.checked }))} />{t(`delegations.flags.${flag}`)}</label>)}
    <Button disabled={command.pending || !selected || full} onClick={() => void command.run(() => grant({ networkId, sessionId: session.sessionId, targetPersonId: target as Id<"persons">, kind, ...flags }))}>{t("delegations.grant")}</Button>
    {query.data.length === 0 ? <p className="text-sm text-muted-foreground">{t("delegations.empty")}</p> : <ul className="flex flex-col gap-3">{query.data.map((row) => <li key={row.personId} className="flex flex-col gap-2 border-t border-border pt-3"><span>{row.displayName ?? t("person")}</span><span className="text-sm">{t(`delegations.kind.${row.kind}`)}</span><ul className="text-sm text-muted-foreground">{(["canAdmitToStage", "canExclude", "canEndOrTransfer"] as const).filter((flag) => row[flag]).map((flag) => <li key={flag}>{t(`delegations.flags.${flag}`)}</li>)}</ul><Button variant="ghost" disabled={command.pending} onClick={() => void command.run(() => revoke({ networkId, sessionId: session.sessionId, targetPersonId: row.personId }))}>{t("delegations.revoke")}</Button></li>)}</ul>}
    {command.error ? <p role="alert">{command.error}</p> : null}
  </div>
}
