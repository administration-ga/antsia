// Dupliqué de socle/packages/agent-features/src/features/direct/DirectFloatingCard.tsx @ ad2e7fdc2 — adaptations : registre/salle ANTSIA sans montage audio, identité personId, rôles et permissions serveur, charte et routes injectées ; déplacement existant de la coque et pose mobile/reduite.
"use client"
import { useNetwork, useRoutes } from "@antsia/api/network"
import { Link } from "@antsia/api/routing"
import { Button } from "@antsia/ui"
import { useIsReseauMobile } from "@antsia/ui/overlay"
import { ParticipantTile, RoomContext, useSpeakingParticipants, useTracks } from "@livekit/components-react"
import { Track } from "livekit-client"
import { useState } from "react"
import { createPortal } from "react-dom"
import { useTranslation } from "react-i18next"
import { useDirectRoom } from "../../stores/direct-room-registry"
import { directSessionStore, useDirectSessionStore } from "../../stores/direct-session-store"
import { useSurfaceDrag } from "../../shell/floating-surface/use-surface-drag"
import { useEscapeLayer } from "../../shell/floating-surface/use-escape-layer"
import { ESCAPE_PRIORITY } from "../../shell/floating-surface/escape-stack"
import type { DirectSession } from "./DirectPage"
import { DirectExitDialog } from "./DirectExitDialog"
import { directCardPose, type DirectCardPose } from "./direct-floating"
import { directParticipantPersonId, directRosterTracks } from "./direct-studio-model"

const FLOATING_CSS = `
 .antsia-direct-float { --ui2-button-min-h:44px; --ui2-button-sm-min-h:44px; position:fixed; left:16px; bottom:24px; z-index:45; box-sizing:border-box; width:min(360px,calc(100vw - 32px)); max-height:calc(100dvh - 32px); display:flex; flex-direction:column; gap:10px; padding: var(--esp-card-padding, 12px); border: 1px solid var(--esp-raised-border, var(--border)); border-radius: var(--esp-primitive-card-radius, 16px); background:var(--background); color:var(--foreground); box-shadow: var(--esp-surface-shadow, var(--shadow-lg)); overflow:auto; }
 .antsia-direct-float[data-pose=pill] { width:min(320px,calc(100vw - 32px)); }
 .antsia-direct-float[data-pose=mobile] { left:12px; right:12px; bottom:calc(76px + env(safe-area-inset-bottom)); width:auto; max-height:40dvh; }
 .antsia-direct-float .lk-participant-metadata { display:none; }
 .antsia-direct-float video { object-fit:contain; }
 .antsia-direct-float[data-dragging=true] { user-select:none; }
 @media(prefers-reduced-motion:reduce) { .antsia-direct-float * { transition:none !important; } }
`

export function DirectFloatingCard({ session, onLeave }: { session: DirectSession | undefined; onLeave: () => void }) {
  const state = useDirectSessionStore()
  const mobile = useIsReseauMobile()
  const pose = directCardPose({ isMobile: mobile, minimized: state.cardMinimized })
  if (!pose || typeof document === "undefined") return null
  // Une pose neuve se mesure avec SA hauteur ; la connexion reste chez l'hôte.
  return createPortal(<FloatingFrame key={pose} pose={pose} session={session} onLeave={onLeave} />, document.body)
}

function FloatingFrame({ pose, session, onLeave }: { pose: DirectCardPose; session: DirectSession | undefined; onLeave: () => void }) {
  const { t } = useTranslation("direct")
  const { charte, storagePrefix } = useNetwork()
  const routes = useRoutes()
  const state = useDirectSessionStore()
  const room = useDirectRoom(state.sessionId)
  const [exit, setExit] = useState(false)
  const draggable = pose !== "mobile"
  const { ref: surfaceRef, style: surfaceStyle, handleProps, dragging } = useSurfaceDrag({ storageKey: `${storagePrefix}direct-floating-${pose}:v1`, enabled: draggable, label: t("floating.move"), storage: "session", placementMode: "free" })
  useEscapeLayer({ id: "antsia-direct-floating", priority: ESCAPE_PRIORITY.WINDOW, enabled: pose === "card" && !exit, onEscape: () => directSessionStore.setCardMinimized(true) })
  const publisher = session?.viewerRole !== "viewer" && !!session && state.credentials?.role === "speaker" && state.phase === "connected"
  if (!state.sessionId) return null
  const title = session?.title ?? t("ongoing")
  const leave = () => { if (session && session.viewerRole !== "viewer" && session.status === "live" && state.phase === "connected") setExit(true); else onLeave() }
  return <>
    <style href="antsia-direct-floating" precedence="default">{FLOATING_CSS}</style>
    <aside ref={surfaceRef} data-charte={charte} data-pose={pose} data-dragging={dragging || undefined} aria-label={t("floating.label", { title })} className="antsia-direct-float" style={draggable ? surfaceStyle : { left: "12px", top: "auto" }}>
      <header className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        {draggable ? <div {...handleProps} className="flex min-h-11 min-w-0 flex-1 items-center"><span className="truncate text-sm font-semibold">{title}</span></div> : <span className="min-w-0 truncate text-sm font-semibold">{title}</span>}
        {pose !== "mobile" ? <Button size="sm" variant="ghost" onClick={() => directSessionStore.setCardMinimized(pose !== "pill")}>{t(pose === "pill" ? "floating.expand" : "floating.minimize")}</Button> : null}
      </header>
      {pose === "card" && room && session ? <RoomContext.Provider value={room}><MiniScene session={session} /></RoomContext.Provider> : null}
      <Link href={routes.conference(state.sessionId)} className="flex min-h-11 items-center text-sm font-semibold">{title}</Link>
      <p role="status" className="text-xs text-muted-foreground">{t(`phase.${state.phase}`)}</p>
      {state.error ? <p role="alert" className="text-sm">{state.error}</p> : null}
      {publisher && pose !== "pill" ? <div className="flex flex-wrap gap-2"><Button variant="ghost" size="sm" aria-pressed={state.intent.micEnabled} onClick={() => directSessionStore.setIntent({ micEnabled: !state.intent.micEnabled })}>{t(state.intent.micEnabled ? "microphoneOff" : "microphoneOn")}</Button><Button variant="ghost" size="sm" aria-pressed={state.intent.cameraEnabled && !state.intent.audioOnly} onClick={() => directSessionStore.setIntent({ cameraEnabled: !(state.intent.cameraEnabled && !state.intent.audioOnly), audioOnly: false })}>{t(state.intent.cameraEnabled && !state.intent.audioOnly ? "cameraOff" : "cameraOn")}</Button></div> : null}
      <Button variant="ghost" size="sm" onClick={leave}>{t("leave")}</Button>
    </aside>
    {exit && session ? <DirectExitDialog session={session} onCancel={() => setExit(false)} onLeave={onLeave} /> : null}
  </>
}

function MiniScene({ session }: { session: DirectSession }) {
  const { t } = useTranslation("direct")
  const cameras = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }], { onlySubscribed: false })
  const screens = useTracks([{ source: Track.Source.ScreenShare, withPlaceholder: false }], { onlySubscribed: false })
  const speaking = useSpeakingParticipants()
  const roster = directRosterTracks(cameras, session.speakers)
  const screen = screens.find((track) => track.participant.identity.startsWith("direct-s_") && session.speakers.some((speaker) => speaker.personId === directParticipantPersonId(track.participant)))
  const active = speaking.map(directParticipantPersonId).find((personId) => roster.some((person) => person.key === personId))
  const focus = roster.find((person) => person.key === session.spotlight?.personId && person.track) ?? roster.find((person) => person.key === active && person.track) ?? roster.find((person) => person.role === "host") ?? roster[0]
  const track = screen ?? focus?.track
  return <div aria-label={t("floating.preview")} data-lk-theme="antsia" className="relative aspect-[16/10] overflow-hidden rounded-[var(--esp-primitive-media-radius,0.5rem)] border border-border bg-muted" style={{ "--lk-bg": "var(--background)", "--lk-fg": "var(--foreground)" } as React.CSSProperties}>
    {track ? <ParticipantTile trackRef={track} className="h-full w-full" /> : <p className="p-4 text-sm">{t("studio.notConnected")}</p>}
    <span className="absolute bottom-1 left-1 rounded bg-background px-2 py-1 text-xs">{screen ? t("studio.presentation") : focus?.displayName ?? t("person")}</span>
  </div>
}
