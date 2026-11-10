// Dupliqué de socle/packages/agent-features/src/features/direct/DirectPage.tsx @ ad2e7fdc2 — adaptations : DTO moteur, préflight avant démarrage, studio consommant la salle persistante et gestion d’antenne par permissions serveur, i18n et routes injectées ; couleurs par fonction (ADR-0027) : « Rejoindre la salle » en participation (variante `commerce`, aplat d’identité en repli).
"use client"

import { themedActionStyle } from "../themed-action-style"
import { api, type Id } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork, useRoutes } from "@antsia/api/network"
import { Link } from "@antsia/api/routing"
import { Button } from "@antsia/ui"
import { RoomContext } from "@livekit/components-react"
import { useAction, useMutation } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { createLocalTracks, Track, type LocalTrack } from "livekit-client"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { useDirectRoom } from "../../stores/direct-room-registry"
import { directSessionStore, useDirectSessionStore } from "../../stores/direct-session-store"
import { postEngineErrorText } from "../reseau-personnel/post-overflow"
import { describeCallMediaError } from "../iappel/media-errors"
import { DirectStudio } from "./DirectStudio"
import { DirectManagement } from "./DirectManagement"
import { DirectExitDialog } from "./DirectExitDialog"
import { DirectReplay } from "./DirectReplay"

export type DirectSession = FunctionReturnType<typeof api.modules.live.sessions.get>

export function DirectPage({ sessionId }: { sessionId: Id<"liveSessions"> }) {
  const { t } = useTranslation("direct")
  const { networkId } = useNetwork()
  const routes = useRoutes()
  const query = useAuthenticatedConvexQuery(api.modules.live.sessions.get, { networkId, sessionId })
  if (query.isError) return <div role="alert" className="flex flex-col gap-3"><p>{postEngineErrorText(query.error, "direct:failed", t)}</p><Link href={routes.home()}>{t("back")}</Link></div>
  if (!query.data) return <p role="status">{t("loading")}</p>
  return <DirectSessionView key={`${networkId}:${sessionId}`} session={query.data} />
}

function DirectSessionView({ session }: { session: DirectSession }) {
  const { t } = useTranslation("direct")
  const { networkId } = useNetwork()
  const routes = useRoutes()
  const requestToken = useAction(api.modules.live.livekitActions.requestDirectToken)
  const checkConfiguration = useAction(api.modules.live.livekitActions.checkBroadcastConfiguration)
  const goLive = useMutation(api.modules.live.sessions.goLive)
  const end = useMutation(api.modules.live.sessions.end)
  const leaveViewer = useMutation(api.modules.live.presence.leave)
  const leaveStage = useMutation(api.modules.live.antenna.leaveAntenna)
  const state = useDirectSessionStore()
  const room = useDirectRoom(session.sessionId)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [leaving, setLeaving] = useState(false)
  const [exit, setExit] = useState(false)
  const [localTracks, setLocalTracks] = useState<LocalTrack[]>([])
  const [checked, setChecked] = useState(false)
  const preview = useRef<HTMLVideoElement>(null)
  const preflightVersion = useRef(0)
  const currentSession = useRef(session)
  useEffect(() => { currentSession.current = session }, [session])
  const held = state.sessionId === session.sessionId
  const anotherRoom = state.sessionId !== null && !held && state.credentials !== null

  useEffect(() => () => { preflightVersion.current += 1 }, [])

  useEffect(() => {
    const video = preview.current
    const camera = localTracks.find((track) => track.kind === Track.Kind.Video)
    if (camera && video) camera.attach(video)
    return () => { localTracks.forEach((track) => { track.detach(); track.stop() }) }
  }, [localTracks])

  const attempt = async (operation: () => Promise<void>) => {
    setPending(true)
    setError(null)
    try { await operation() } catch (failure) { setError(postEngineErrorText(failure, "direct:failed", t)) } finally { setPending(false) }
  }
  const join = async () => {
    if (anotherRoom) return
    directSessionStore.prepare(session.sessionId)
    directSessionStore.setPhase("connecting")
    try {
      const credentials = await requestToken({ networkId, sessionId: session.sessionId })
      // Un rôle peut être retiré pendant la requête : aucune piste ne doit
      // démarrer avec un jeton reçu avant cette décision du serveur.
      if (directSessionStore.getState().sessionId !== session.sessionId || currentSession.current.status === "ended") {
        if (credentials.role === "viewer") void leaveViewer({ networkId, sessionId: session.sessionId }).catch(() => undefined)
        return
      }
      if (credentials.role !== (currentSession.current.viewerRole === "viewer" ? "viewer" : "speaker")) {
        directSessionStore.setPhase("ready")
        setError(t("antenna.roleChanged"))
        if (credentials.role === "viewer") void leaveViewer({ networkId, sessionId: session.sessionId }).catch(() => undefined)
        return
      }
      directSessionStore.setCredentials({ sessionId: session.sessionId, ...credentials })
    } catch (failure) {
      // Le jeton peut avoir admis un spectateur avant un refus de configuration.
      // Lui rendre sa place couvre aussi une réponse tardive après un départ.
      if (directSessionStore.getState().sessionId === session.sessionId) directSessionStore.setPhase("error", postEngineErrorText(failure, "direct:failed", t))
      if (session.viewerRole === "viewer") void leaveViewer({ networkId, sessionId: session.sessionId }).catch(() => undefined)
      throw failure
    }
  }
  const preflight = () => attempt(async () => {
    const version = ++preflightVersion.current
    localTracks.forEach((track) => track.stop())
    setLocalTracks([])
    setChecked(false)
    await checkConfiguration({ networkId, sessionId: session.sessionId })
    if (version !== preflightVersion.current) return
    let tracks: LocalTrack[]
    try { tracks = await createLocalTracks({ audio: true, video: !state.intent.audioOnly }) } catch (failure) {
      setError(describeCallMediaError(failure, { video: !state.intent.audioOnly }, t) ?? t("preflight.failed"))
      return
    }
    // Une permission peut se résoudre après la fermeture de la page.
    if (version !== preflightVersion.current) { tracks.forEach((track) => track.stop()); return }
    setLocalTracks(tracks)
    setChecked(true)
  })
  const start = () => attempt(async () => {
    if (!checked || anotherRoom) return
    localTracks.forEach((track) => track.stop())
    setLocalTracks([])
    setChecked(false)
    await goLive({ networkId, sessionId: session.sessionId })
    await join()
  })
  const quit = () => {
    if (directSessionStore.getState().sessionId === session.sessionId) directSessionStore.leave()
    if (session.viewerRole === "speaker") void leaveStage({ networkId, sessionId: session.sessionId }).catch(() => undefined)
    void leaveViewer({ networkId, sessionId: session.sessionId }).catch(() => undefined)
  }
  return (
    <section className="flex min-w-0 flex-col gap-5" style={{ fontSize: "var(--esp-content-font-size, inherit)", lineHeight: "var(--esp-content-line-height, inherit)" }} aria-label={session.title}>
      <Link href={routes.home()} className="inline-flex min-h-11 items-center text-sm">{t("back")}</Link>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-sm text-muted-foreground">{t(`status.${session.status}`)}</p><h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--esp-heading-font-family, inherit)", fontSize: "var(--esp-page-title-size, 1.5rem)", fontWeight: "var(--esp-heading-font-weight, 600)", lineHeight: "var(--esp-page-title-leading, 2rem)", letterSpacing: "var(--esp-page-title-tracking, normal)" }}>{session.title}</h1><p className="text-sm text-muted-foreground">{session.host.displayName ?? t("person")}</p>{session.page ? <Link href={routes.page(session.page.handle)} className="text-sm">{t("create.signedPage", { name: session.page.name })}</Link> : null}</div>
        <span className="rounded-full border border-border px-3 py-1 text-sm">{t(`audience.${session.audience}`)}</span>
      </header>
      {anotherRoom ? <p role="alert">{t("anotherRoom")} <Link href={routes.conference(state.sessionId!)}>{t("returnToRoom")}</Link></p> : null}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {held && state.error && state.error !== error ? <p role="alert" className="text-sm text-destructive">{state.error}</p> : null}
      <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)]">
      <div className="flex min-w-0 flex-col gap-4">
      {session.status === "scheduled" && session.viewerRole === "host" ? <div className="flex flex-col gap-4 rounded-[var(--esp-primitive-card-radius,0.75rem)] border border-[var(--esp-primitive-surface-border,var(--border))] bg-card p-[var(--esp-card-padding,1.25rem)]">
        <p>{t("preflight.description")}</p>
        <label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={state.intent.audioOnly} disabled={pending} onChange={(event) => { preflightVersion.current += 1; directSessionStore.setIntent({ audioOnly: event.target.checked }); setChecked(false); setLocalTracks([]) }} />{t("preflight.audioOnly")}</label>
        {localTracks.some((track) => track.kind === Track.Kind.Video) ? <video ref={preview} autoPlay muted playsInline aria-label={t("preflight.preview")} className="aspect-video w-full max-w-xl rounded-[var(--esp-primitive-media-radius,0.5rem)] bg-muted" /> : null}
        <div className="flex flex-wrap gap-3"><Button variant="ghost" disabled={pending || anotherRoom} onClick={preflight}>{t("preflight.check")}</Button><Button disabled={!checked || pending || anotherRoom} style={{ opacity: !checked || pending || anotherRoom ? 0.45 : 1 }} onClick={start}>{pending ? t("pending") : t("start")}</Button></div>
        {checked ? <p role="status">{t("preflight.ready")}</p> : null}
      </div> : null}
      {session.status === "scheduled" && session.viewerRole !== "host" ? <p>{t("waiting")}</p> : null}
      {session.status === "live" ? <>
        {held && room ? (
          <RoomContext.Provider value={room}><DirectStudio session={session} onLeave={() => session.viewerRole === "viewer" || state.phase !== "connected" ? quit() : setLeaving(true)} onEnd={session.permissions.endOrTransfer ? () => setExit(true) : undefined} /></RoomContext.Provider>
        ) : (
          <div className="flex flex-col gap-[var(--esp-card-gap,0.75rem)] rounded-[var(--esp-primitive-card-radius,0.75rem)] border border-[var(--esp-primitive-surface-border,var(--border))] bg-card p-[var(--esp-card-padding,1.5rem)]">
            <p>{t(session.viewerRole === "viewer" ? "joinDescription" : "joinPublisherDescription")}</p>
            {session.viewerRole !== "viewer" ? <>
              <label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={state.intent.micEnabled} disabled={pending || anotherRoom} onChange={(event) => directSessionStore.setIntent({ micEnabled: event.target.checked })} />{t("microphoneOn")}</label>
              <label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={state.intent.cameraEnabled && !state.intent.audioOnly} disabled={pending || anotherRoom} onChange={(event) => directSessionStore.setIntent({ cameraEnabled: event.target.checked, audioOnly: false })} />{t("cameraOn")}</label>
            </> : null}
            <Button variant="commerce" disabled={pending || anotherRoom || (held && (state.phase === "connecting" || state.phase === "reconnecting"))} onClick={() => void attempt(join)}>{pending || (held && state.phase === "connecting") ? t("pending") : t("join")}</Button>
          </div>
        )}
        {held && state.credentials ? <div className="flex flex-wrap items-center gap-3">
          <p role="status" className="text-sm">{t(`phase.${state.phase}`)}</p>
          {!room ? <Button variant="ghost" onClick={quit}>{t("leave")}</Button> : null}
        </div> : null}
        <p className="text-sm text-muted-foreground">{t("counters", { present: session.counters.present, admitted: session.counters.viewers })}</p>
        {session.replay ? <p className="text-sm">{t(`replay.egress.${session.replay.egressState}`)}</p> : null}
      </> : null}
      </div>
      {session.status !== "ended" ? <DirectManagement session={session} admitted={held && state.credentials?.role === "viewer" && state.phase === "connected"} /> : null}
      </div>
      {session.status === "ended" ? <DirectReplay session={session} /> : null}
      {leaving && session.status !== "ended" ? <DirectExitDialog session={session} onCancel={() => setLeaving(false)} onLeave={() => { quit(); setLeaving(false) }} /> : null}
      {session.status !== "ended" && session.permissions.endOrTransfer ? <>
        <Button style={themedActionStyle("danger", "ghost")} variant="danger" disabled={pending} onClick={() => setExit(true)}>{t(session.status === "scheduled" ? "cancel" : "end")}</Button>
        {exit ? <div role="group" aria-label={t("endConfirm")} className="flex flex-col gap-[var(--esp-card-gap,0.75rem)] rounded-[var(--esp-primitive-card-radius,0.75rem)] border border-border p-4"><p>{t("endConfirm")}</p><div className="flex gap-3"><Button style={themedActionStyle("danger", "primary")} variant="danger" disabled={pending} onClick={() => void attempt(async () => { await end({ networkId, sessionId: session.sessionId }); quit(); setExit(false) })}>{t("confirm")}</Button><Button style={themedActionStyle("cancel", "ghost")} variant="outline" onClick={() => setExit(false)}>{t("keep")}</Button></div></div> : null}
      </> : null}
    </section>
  )
}
