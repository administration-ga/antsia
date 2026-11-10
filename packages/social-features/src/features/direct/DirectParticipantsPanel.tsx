// Dupliqué de socle/packages/agent-features/src/features/direct/ParticipantsPanel.tsx @ ad2e7fdc2 — adaptations : admissions historiques et non présence, curseur de page sans cache conservé, commandes d’après les permissions serveur, personne courante et hôte protégés, exclusion confirmée et i18n.
"use client"

import { themedActionStyle } from "../themed-action-style"
import { api, type Id } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import { Button } from "@antsia/ui"
import { EspaceDialog } from "@antsia/ui/espace-kit"
import { useMutation } from "convex/react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import type { DirectSession } from "./DirectPage"
import { useDirectCommand } from "./use-direct-command"

export function DirectParticipantsPanel({ session }: { session: DirectSession }) {
  const { t } = useTranslation("direct")
  const { networkId, personId } = useNetwork()
  const [cursors, setCursors] = useState<(string | null)[]>([null])
  const query = useAuthenticatedConvexQuery(api.modules.live.moderation.listAdmitted, { networkId, sessionId: session.sessionId, paginationOpts: { cursor: cursors.at(-1) ?? null, numItems: 20 } })
  const ban = useMutation(api.modules.live.moderation.ban)
  const reinstate = useMutation(api.modules.live.moderation.reinstate)
  const mute = useMutation(api.modules.live.moderation.muteChat)
  const unmute = useMutation(api.modules.live.moderation.unmuteChat)
  const demote = useMutation(api.modules.live.speakers.demote)
  const command = useDirectCommand()
  const [confirm, setConfirm] = useState<{ personId: Id<"persons">; name: string } | null>(null)
  if (query.isError) return <div role="alert"><p>{t("participants.failed")}</p><Button variant="ghost" onClick={() => void query.refetch()}>{t("retry")}</Button></div>
  if (!query.data) return <p role="status">{t("loading")}</p>
  const page = query.data
  return <div className="flex flex-col gap-3">
    <p className="text-sm text-muted-foreground">{t("participants.description")}</p>
    {page.page.length === 0 ? <p>{t(page.isDone ? "participants.empty" : "participants.emptyPage")}</p> : <ul className="flex flex-col gap-3">{page.page.map((participant) => {
      const name = participant.displayName ?? t("person")
      const protectedTarget = participant.personId === personId || session.speakers.some((speaker) => speaker.role === "host" && speaker.personId === participant.personId)
      return <li key={participant.personId} className="flex flex-col gap-2 border-b border-border pb-3">
        <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{name}</span>{participant.banned ? <span className="text-sm">{t("participants.banned")}</span> : participant.onStage ? <span className="text-sm">{t("antenna.onStage")}</span> : null}{participant.muted ? <span className="text-sm">{t("participants.muted")}</span> : null}{participant.delegation ? <span className="text-sm">{t(`delegations.kind.${participant.delegation.kind}`)}</span> : null}</div>
        {!protectedTarget ? <div className="flex flex-wrap gap-2">
          {!participant.banned && session.permissions.moderateChat ? <Button size="sm" variant="ghost" disabled={command.pending} onClick={() => void command.run(() => (participant.muted ? unmute : mute)({ networkId, sessionId: session.sessionId, targetPersonId: participant.personId }))}>{t(participant.muted ? "participants.unmute" : "participants.mute")}</Button> : null}
          {!participant.banned && participant.onStage && session.permissions.removeFromStage ? <Button size="sm" variant="ghost" disabled={command.pending} onClick={() => void command.run(() => demote({ networkId, sessionId: session.sessionId, targetPersonId: participant.personId }))}>{t("antenna.demote")}</Button> : null}
          {participant.banned ? session.permissions.reinstate ? <Button style={themedActionStyle("success", "ghost")} size="sm" variant="success" disabled={command.pending} onClick={() => void command.run(() => reinstate({ networkId, sessionId: session.sessionId, targetPersonId: participant.personId }))}>{t("participants.reinstate")}</Button> : null : session.permissions.exclude ? <Button style={themedActionStyle("danger", "ghost")} size="sm" variant="danger" disabled={command.pending} onClick={() => setConfirm({ personId: participant.personId, name })}>{t("participants.exclude")}</Button> : null}
        </div> : null}
      </li>
    })}</ul>}
    <div className="flex flex-wrap gap-2">{cursors.length > 1 ? <Button variant="ghost" onClick={() => setCursors((current) => current.slice(0, -1))}>{t("participants.previous")}</Button> : null}{!page.isDone ? <Button variant="ghost" disabled={query.isFetching} onClick={() => setCursors((current) => [...current, page.continueCursor])}>{t("more")}</Button> : null}</div>
    {command.error ? <p role="alert">{command.error}</p> : null}
    {confirm && session.permissions.exclude ? <EspaceDialog title={t("participants.excludeTitle")} description={t("participants.excludeConfirm", { name: confirm.name })} closeLabel={t("close")} onClose={() => { if (!command.pending) setConfirm(null) }}><div className="flex flex-wrap gap-3"><Button style={themedActionStyle("danger", "primary")} variant="danger" disabled={command.pending} onClick={() => { if (!session.permissions.exclude) return; void command.run(() => ban({ networkId, sessionId: session.sessionId, targetPersonId: confirm.personId })).then((success) => { if (success) setConfirm(null) }) }}>{t("participants.exclude")}</Button><Button style={themedActionStyle("cancel", "ghost")} variant="outline" disabled={command.pending} onClick={() => setConfirm(null)}>{t("participants.keep")}</Button></div>{command.error ? <p role="alert">{command.error}</p> : null}</EspaceDialog> : null}
  </div>
}
