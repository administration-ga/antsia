// Dupliqué de socle/packages/agent-features/src/features/direct/DirectInviteesPanel.tsx @ ad2e7fdc2 — adaptations : API moteur, réseau, sélection nominative par personne, canManage relu et fail-closed, rôle proposé distinct de l’antenne réelle et i18n.
"use client"

import { api } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import { DIRECT_MAX_INVITEES, DIRECT_MAX_SPEAKER_INVITEES } from "@antsia/social-domain/live/domain"
import { Button } from "@antsia/ui"
import { useMutation } from "convex/react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import type { DirectSession } from "./DirectPage"
import { useDirectCommand } from "./use-direct-command"

export function DirectInviteesPanel({ session }: { session: DirectSession }) {
  const { t } = useTranslation("direct")
  const { networkId } = useNetwork()
  const query = useAuthenticatedConvexQuery(api.modules.live.invitees.listForSession, { networkId, sessionId: session.sessionId })
  const [search, setSearch] = useState("")
  const [needle, setNeedle] = useState("")
  const [role, setRole] = useState<"viewer" | "speaker">("viewer")
  useEffect(() => { const timer = setTimeout(() => setNeedle(search.trim()), 250); return () => clearTimeout(timer) }, [search])
  const canManage = !!query.data?.canManage && !query.isError && session.permissions.changeAudienceOrReplay
  const candidates = useAuthenticatedConvexQuery(api.modules.live.invitees.searchCandidates, canManage ? { networkId, sessionId: session.sessionId, search: needle } : "skip")
  const add = useMutation(api.modules.live.invitees.add)
  const revoke = useMutation(api.modules.live.invitees.revoke)
  const command = useDirectCommand()
  if (query.isError) return <p role="alert">{t("guests.failed")}</p>
  if (!query.data) return <p role="status">{t("loading")}</p>
  if (!canManage) return <p>{t("guests.unavailable")}</p>
  const guests = query.data.invitees
  const full = guests.length >= DIRECT_MAX_INVITEES
  const speakersFull = guests.filter((guest) => guest.stageRole === "speaker").length >= DIRECT_MAX_SPEAKER_INVITEES
  return <div className="flex flex-col gap-4">
    <p>{t("guests.description")}</p>
    <p className="text-sm text-muted-foreground">{t("guests.capacity", { count: guests.length, max: DIRECT_MAX_INVITEES })}</p>
    <label className="flex flex-col gap-2">{t("guests.search")}<input value={search} maxLength={80} onChange={(event) => setSearch(event.target.value)} className="min-h-11 rounded-[var(--esp-input-radius,0.5rem)] border border-input bg-background px-3" /></label>
    <label className="flex flex-col gap-2">{t("guests.role")}<select value={role} onChange={(event) => setRole(event.target.value === "speaker" ? "speaker" : "viewer")} className="min-h-11 rounded-[var(--esp-input-radius,0.5rem)] border border-input bg-background px-3"><option value="viewer">{t("guests.viewer")}</option><option value="speaker">{t("guests.speaker")}</option></select></label>
    {candidates.isError ? <p role="alert">{t("guests.failed")}</p> : !candidates.data ? <p role="status">{t("loading")}</p> : candidates.data.candidates.length === 0 ? <p className="text-sm text-muted-foreground">{t("guests.noCandidates")}</p> : <ul className="flex flex-col gap-2">{candidates.data.candidates.map((candidate) => <li key={candidate.personId} className="flex flex-wrap items-center justify-between gap-2"><span>{candidate.displayName ?? t("person")}</span><Button size="sm" disabled={full || command.pending || (role === "speaker" && speakersFull)} onClick={() => void command.run(() => add({ networkId, sessionId: session.sessionId, personId: candidate.personId, stageRole: role }))}>{t("guests.add")}</Button></li>)}</ul>}
    <h3 className="font-semibold">{t("guests.list")}</h3>
    {guests.length === 0 ? <p className="text-sm">{t("guests.empty")}</p> : <ul className="flex flex-col gap-3">{guests.map((guest) => <li key={guest.personId} className="flex flex-col gap-2 border-t border-border pt-3"><span>{guest.displayName ?? t("person")}</span><span className="text-sm text-muted-foreground">{t(guest.onStage ? "antenna.onStage" : guest.stageRole === "speaker" ? "guests.proposedSpeaker" : "guests.viewer")}</span><div className="flex flex-wrap gap-2"><Button size="sm" variant="ghost" disabled={command.pending || (guest.stageRole === "viewer" && speakersFull)} onClick={() => void command.run(() => add({ networkId, sessionId: session.sessionId, personId: guest.personId, stageRole: guest.stageRole === "speaker" ? "viewer" : "speaker" }))}>{t(guest.stageRole === "speaker" ? "guests.asViewer" : "guests.asSpeaker")}</Button>{session.status === "live" && guest.stageRole === "speaker" && !guest.onStage ? <Button size="sm" variant="ghost" disabled={command.pending} onClick={() => void command.run(() => add({ networkId, sessionId: session.sessionId, personId: guest.personId, stageRole: "speaker" }))}>{t("guests.restoreStage")}</Button> : null}<Button size="sm" variant="ghost" disabled={command.pending} onClick={() => void command.run(() => revoke({ networkId, sessionId: session.sessionId, personId: guest.personId }))}>{t("guests.revoke")}</Button></div></li>)}</ul>}
    {command.error ? <p role="alert">{command.error}</p> : null}
  </div>
}
