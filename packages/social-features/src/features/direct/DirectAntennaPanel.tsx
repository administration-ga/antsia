// Dupliqué de socle/packages/agent-features/src/features/direct/DirectAntennaPanel.tsx @ ad2e7fdc2 — adaptations : API typée et réseau courant, droits du DTO, invitations consenties sans ouverture automatique du matériel, horloge effective et i18n ; recherche privée réservée à l’hôte ; couleurs par fonction (ADR-0027) : Accepter en variante `social`, « Demander la parole » en participation (variante `commerce`, aplat d’identité en repli).
"use client"

import { themedActionStyle } from "../themed-action-style"
import { api } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import { DIRECT_MAX_SPEAKERS } from "@antsia/social-domain/live/domain"
import { Button } from "@antsia/ui"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation } from "convex/react"
import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { z } from "zod"
import { useDirectSessionStore } from "../../stores/direct-session-store"
import type { DirectSession } from "./DirectPage"
import { useDirectClock, useDirectCommand } from "./use-direct-command"

const handleSchema = z.object({ handle: z.string().trim().min(1).max(80) })

export function DirectMyAntenna({ session, admitted }: { session: DirectSession; admitted: boolean }) {
  const { t } = useTranslation("direct")
  const { networkId } = useNetwork()
  const now = useDirectClock()
  const query = useAuthenticatedConvexQuery(api.modules.live.antenna.myState, { networkId, sessionId: session.sessionId, now })
  const raise = useMutation(api.modules.live.antenna.raiseHand)
  const cancel = useMutation(api.modules.live.antenna.cancelHand)
  const respond = useMutation(api.modules.live.antenna.respondToInvitation)
  const leave = useMutation(api.modules.live.antenna.leaveAntenna)
  const command = useDirectCommand()
  const held = useDirectSessionStore()
  if (query.isError) return <p role="alert">{t("antenna.failed")}</p>
  if (!query.data) return <p role="status">{t("loading")}</p>
  const state = query.data
  return <div className="flex flex-col gap-3">
    <p>{t("antenna.consent")}</p>
    {session.viewerRole === "speaker" ? <>
      <p role="status">{t(held.sessionId === session.sessionId && held.credentials?.role === "speaker" && held.phase === "connected" ? "antenna.speakerConnected" : "antenna.speakerReady")}</p>
      <Button variant="ghost" disabled={command.pending} onClick={() => void command.run(() => leave({ networkId, sessionId: session.sessionId }))}>{t("antenna.leave")}</Button>
    </> : <>
      {state.invitation?.status === "pending" ? <div className="flex flex-wrap items-center gap-3"><p>{t("antenna.invited")}</p><Button style={themedActionStyle("success", "social")} variant="success" disabled={command.pending} onClick={() => void command.run(() => respond({ networkId, invitationId: state.invitation!.invitationId, response: "accepted" }))}>{t("antenna.accept")}</Button><Button style={themedActionStyle("danger", "ghost")} variant="danger" disabled={command.pending} onClick={() => void command.run(() => respond({ networkId, invitationId: state.invitation!.invitationId, response: "declined" }))}>{t("antenna.decline")}</Button></div> : null}
      {state.invitation && state.invitation.status !== "pending" ? <p role="status">{t(`antenna.invitationStatus.${state.invitation.status}`)}</p> : null}
      {state.request?.status === "pending" ? <><p role="status">{t("antenna.handPending")}</p><Button style={themedActionStyle("cancel", "ghost")} variant="outline" disabled={command.pending} onClick={() => void command.run(() => cancel({ networkId, sessionId: session.sessionId }))}>{t("antenna.cancelHand")}</Button></> : <>
        {state.request ? <p role="status">{t(`antenna.requestStatus.${state.request.status}`)}</p> : null}
        <Button variant="commerce" disabled={!admitted || command.pending} onClick={() => void command.run(() => raise({ networkId, sessionId: session.sessionId }))}>{t("antenna.raiseHand")}</Button>
        {!admitted ? <p className="text-sm text-muted-foreground">{t("antenna.joinFirst")}</p> : null}
      </>}
    </>}
    {command.error ? <p role="alert">{command.error}</p> : null}
  </div>
}

export function DirectAntennaPanel({ session }: { session: DirectSession }) {
  const { t } = useTranslation("direct")
  const { networkId, personId } = useNetwork()
  const now = useDirectClock()
  const query = useAuthenticatedConvexQuery(api.modules.live.antenna.hostState, { networkId, sessionId: session.sessionId, now })
  const respond = useMutation(api.modules.live.antenna.respondToRequest)
  const revoke = useMutation(api.modules.live.antenna.revokeInvitation)
  const demote = useMutation(api.modules.live.speakers.demote)
  const mute = useMutation(api.modules.live.speakers.muteMicrophone)
  const spotlight = useMutation(api.modules.live.sessions.setSpotlight)
  const inviteHandle = useMutation(api.modules.live.antenna.inviteByHandle)
  const command = useDirectCommand()
  const { register, handleSubmit, reset, formState: { errors } } = useForm<z.infer<typeof handleSchema>>({ resolver: zodResolver(handleSchema), defaultValues: { handle: "" } })
  if (query.isError) return <p role="alert">{t("antenna.failed")}</p>
  if (!query.data) return <p role="status">{t("loading")}</p>
  const state = query.data
  const full = state.speakers.length >= DIRECT_MAX_SPEAKERS
  return <div className="flex flex-col gap-5">
    <p>{t("antenna.capacity", { count: state.speakers.length, max: DIRECT_MAX_SPEAKERS })}</p>
    <h3 className="font-semibold" style={{ fontSize: "var(--esp-subsection-title-size, inherit)", lineHeight: "var(--esp-subsection-title-leading, inherit)", fontWeight: "var(--esp-heading-font-weight, 600)" }}>{t("antenna.onStage")}</h3>
    <ul className="flex flex-col gap-3">{state.speakers.map((speaker) => <li key={speaker.personId} className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
      <span>{speaker.profile.displayName ?? t("person")}{speaker.isHost ? <span className="ml-2 text-sm text-muted-foreground">{t("antenna.host")}</span> : null}</span>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="ghost" aria-pressed={session.spotlight?.personId === speaker.personId} disabled={command.pending} onClick={() => void command.run(() => spotlight({ networkId, sessionId: session.sessionId, targetPersonId: session.spotlight?.personId === speaker.personId ? null : speaker.personId }))}>{t(session.spotlight?.personId === speaker.personId ? "antenna.unspotlight" : "antenna.spotlight")}</Button>
        {!speaker.isHost && session.permissions.removeFromStage ? <>
          {speaker.personId !== personId ? <Button size="sm" variant="ghost" disabled={command.pending} onClick={() => void command.run(() => mute({ networkId, sessionId: session.sessionId, targetPersonId: speaker.personId }))}>{t("antenna.muteMicrophone")}</Button> : null}
          <Button size="sm" variant="ghost" disabled={command.pending} onClick={() => void command.run(() => demote({ networkId, sessionId: session.sessionId, targetPersonId: speaker.personId }))}>{t("antenna.demote")}</Button>
        </> : null}
      </div>
    </li>)}</ul>
    <h3 className="font-semibold" style={{ fontSize: "var(--esp-subsection-title-size, inherit)", lineHeight: "var(--esp-subsection-title-leading, inherit)", fontWeight: "var(--esp-heading-font-weight, 600)" }}>{t("antenna.requests")}</h3>
    {state.requests.length === 0 ? <p className="text-sm text-muted-foreground">{t("antenna.noRequests")}</p> : <ul className="flex flex-col gap-2">{state.requests.map((request) => <li key={request.requestId} className="flex flex-wrap items-center justify-between gap-2"><span>{request.profile.displayName ?? t("person")}</span><div className="flex gap-2"><Button style={themedActionStyle("success", "social")} size="sm" variant="success" disabled={command.pending || full} onClick={() => void command.run(() => respond({ networkId, requestId: request.requestId, response: "accepted" }))}>{t("antenna.accept")}</Button><Button style={themedActionStyle("danger", "ghost")} size="sm" variant="danger" disabled={command.pending} onClick={() => void command.run(() => respond({ networkId, requestId: request.requestId, response: "declined" }))}>{t("antenna.decline")}</Button></div></li>)}</ul>}
    {full ? <p role="status">{t("antenna.full")}</p> : null}
    <h3 className="font-semibold" style={{ fontSize: "var(--esp-subsection-title-size, inherit)", lineHeight: "var(--esp-subsection-title-leading, inherit)", fontWeight: "var(--esp-heading-font-weight, 600)" }}>{t("antenna.invitations")}</h3>
    {state.invitations.length === 0 ? <p className="text-sm text-muted-foreground">{t("antenna.noInvitations")}</p> : <ul className="flex flex-col gap-2">{state.invitations.map((invitation) => <li key={invitation.invitationId} className="flex flex-wrap items-center justify-between gap-2"><span>{invitation.profile.displayName ?? t("person")}<span className="ml-2 text-sm text-muted-foreground">{t(`antenna.invitationStatus.${invitation.status}`)}</span></span>{invitation.status === "pending" ? <Button size="sm" variant="ghost" disabled={command.pending} onClick={() => void command.run(() => revoke({ networkId, invitationId: invitation.invitationId }))}>{t("antenna.revokeInvitation")}</Button> : null}</li>)}</ul>}
    {session.viewerRole === "host" ? <AntennaInvitePicker session={session} full={full} /> : <form onSubmit={handleSubmit(async ({ handle }) => { if (await command.run(() => inviteHandle({ networkId, sessionId: session.sessionId, handle }))) reset() })} className="flex flex-col gap-2">
      <label className="flex flex-col gap-2">{t("antenna.handle")}<input {...register("handle")} maxLength={80} aria-invalid={!!errors.handle} style={{ fontSize: "var(--esp-field-font-size, inherit)", lineHeight: "var(--esp-field-line-height, inherit)" }} className="min-h-11 rounded-[var(--esp-input-radius,0.5rem)] border border-input bg-background px-3" /></label>{errors.handle ? <p role="alert">{t("antenna.invalidHandle")}</p> : null}<Button type="submit" disabled={full || command.pending}>{t("antenna.invite")}</Button>
    </form>}
    {command.error ? <p role="alert">{command.error}</p> : null}
  </div>
}

function AntennaInvitePicker({ session, full }: { session: DirectSession; full: boolean }) {
  const { t } = useTranslation("direct")
  const [search, setSearch] = useState("")
  const [debounced, setDebounced] = useState("")
  useEffect(() => { const timer = setTimeout(() => setDebounced(search.trim()), 250); return () => clearTimeout(timer) }, [search])
  return <div className="flex flex-col gap-3"><label className="flex flex-col gap-2">{t("antenna.search")}<input value={search} maxLength={80} onChange={(event) => setSearch(event.target.value)} style={{ fontSize: "var(--esp-field-font-size, inherit)", lineHeight: "var(--esp-field-line-height, inherit)" }} className="min-h-11 rounded-[var(--esp-input-radius,0.5rem)] border border-input bg-background px-3" /></label><CandidatePage key={`${session.sessionId}:${debounced}`} session={session} search={debounced} full={full} /></div>
}

function CandidatePage({ session, search, full }: { session: DirectSession; search: string; full: boolean }) {
  const { t } = useTranslation("direct")
  const { networkId } = useNetwork()
  const now = useDirectClock()
  const [position, setPosition] = useState<{ side: "low" | "high"; cursor: string | null }>({ side: "low", cursor: null })
  const query = useAuthenticatedConvexQuery(api.modules.live.antenna.searchInviteCandidates, { networkId, sessionId: session.sessionId, query: search, now, side: position.side, paginationOpts: { cursor: position.cursor, numItems: 12 } })
  const invite = useMutation(api.modules.live.antenna.inviteUser)
  const command = useDirectCommand()
  if (query.isError) return <div role="alert"><p>{t("antenna.failed")}</p><Button variant="ghost" onClick={() => void query.refetch()}>{t("retry")}</Button></div>
  if (!query.data) return <p role="status">{t("loading")}</p>
  const page = query.data
  return <>
    {page.page.length === 0 ? <p className="text-sm text-muted-foreground">{t(page.isDone && position.side === "high" ? "antenna.noCandidates" : "antenna.emptyPage")}</p> : <ul className="flex flex-col gap-2">{page.page.map((candidate) => <li key={candidate.personId} className="flex flex-wrap items-center justify-between gap-2"><span>{candidate.displayName ?? t("person")}</span>{candidate.state === "eligible" ? <Button size="sm" disabled={full || command.pending} onClick={() => void command.run(() => invite({ networkId, sessionId: session.sessionId, targetPersonId: candidate.personId }))}>{t("antenna.invite")}</Button> : <span className="text-sm text-muted-foreground">{t(candidate.state === "invited_pending" || candidate.state === "on_stage" || candidate.state === "hand_raised" ? `antenna.candidate.${candidate.state === "invited_pending" ? "pending" : candidate.state === "hand_raised" ? "requested" : "on_stage"}` : "antenna.candidate.unavailable")}</span>}</li>)}</ul>}
    {!page.isDone || position.side === "low" ? <Button variant="ghost" disabled={query.isFetching} onClick={() => setPosition(page.isDone ? { side: "high", cursor: null } : { side: position.side, cursor: page.continueCursor })}>{t("more")}</Button> : null}
    {command.error ? <p role="alert">{command.error}</p> : null}
  </>
}
