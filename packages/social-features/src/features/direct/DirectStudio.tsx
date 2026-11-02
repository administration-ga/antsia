// Dupliqué de socle/packages/agent-features/src/features/direct/DirectScene.tsx @ ad2e7fdc2 — adaptations : studio réécrit sur la salle persistante ANTSIA, personId au lieu des noms, géométrie pure du socle, commandes d’intention conservées dans le store et partage explicite ; i18n et jetons ; chaque tuile CONTENUE dans sa case mesurée (requête de conteneur), à la proportion de la source.
"use client"

import { Button } from "@antsia/ui"
import { ParticipantTile, useLocalParticipant, useSpeakingParticipants, useTracks } from "@livekit/components-react"
import { Track } from "livekit-client"
import { useEffect, useRef, useState, type CSSProperties } from "react"
import { useTranslation } from "react-i18next"
import { directSessionStore, useDirectSessionStore } from "../../stores/direct-session-store"
import type { DirectSession } from "./DirectPage"
import { orderDirectTiles, planDirectScene } from "./direct-scene"
import { directParticipantPersonId, directRosterTracks } from "./direct-studio-model"
import { DIRECT_SCENE_CELL_CLASS, directTileFit } from "./direct-tile-fit"
import { DIRECT_SCENE_VIEWS, type DirectSceneView } from "./direct-view"
import { useDirectCommand } from "./use-direct-command"

const studioTokens = {
  "--lk-bg": "var(--background)", "--lk-bg2": "var(--muted)",
  "--lk-fg": "var(--foreground)", "--lk-fg2": "var(--foreground)",
  "--lk-accent-bg": "var(--primary)", "--lk-border-color": "var(--border)",
  "--lk-font-family": "inherit", "--lk-font-size": "inherit",
  "--ui2-button-min-h": "44px", "--ui2-button-sm-min-h": "44px",
} as CSSProperties

export function DirectStudio({ session, onLeave, onEnd }: { session: DirectSession; onLeave?: () => void; onEnd?: () => void }) {
  const { t } = useTranslation("direct")
  const state = useDirectSessionStore()
  const cameras = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }], { onlySubscribed: false })
  const screens = useTracks([{ source: Track.Source.ScreenShare, withPlaceholder: false }], { onlySubscribed: false })
  const speaking = useSpeakingParticipants()
  const { localParticipant, isScreenShareEnabled } = useLocalParticipant()
  const command = useDirectCommand()
  const [view, setView] = useState<DirectSceneView>("auto")
  const [pinned, setPinned] = useState<string | null>(null)
  const [container, setContainer] = useState<{ width: number; height: number } | null>(null)
  const frame = useRef<HTMLDivElement>(null)
  const scene = useRef<HTMLDivElement>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const activeKey = speaking.map(directParticipantPersonId).find((id) => session.speakers.some((speaker) => speaker.personId === id)) ?? null
  const roster = directRosterTracks(cameras, session.speakers)
  const effectivePin = roster.some((speaker) => speaker.key === pinned) ? pinned : null
  const candidates = orderDirectTiles(roster, { activeSpeakerKey: activeKey, pinnedKey: effectivePin })
  const validScreens = screens.filter((track) => track.participant.identity.startsWith("direct-s_") && session.speakers.some((speaker) => speaker.personId === directParticipantPersonId(track.participant)))
  const hostId = session.speakers.find((speaker) => speaker.role === "host")?.personId
  const screen = validScreens.find((track) => directParticipantPersonId(track.participant) === hostId) ?? validScreens[0]
  const spotlight = candidates.find((candidate) => candidate.key === session.spotlight?.personId && candidate.track !== null)?.key ?? null
  const plan = planDirectScene({ tiles: candidates.length, hasPresentation: !!screen, pinnedKey: effectivePin, programFocusKey: spotlight, activeSpeakerKey: activeKey, view, container, emission: session.stageFormat, fixedGrid: session.stageLayout === "fixed" })
  const dominant = plan.focusKey ? candidates.find((candidate) => candidate.key === plan.focusKey) : plan.kind === "presentation" || (plan.kind === "cinema" && screen) ? null : candidates[0]
  const banded = plan.band !== "none" || plan.kind === "cinema"
  const rest = candidates.filter((candidate) => candidate.key !== dominant?.key)
  const canPublish = state.sessionId === session.sessionId && state.credentials?.role === "speaker" && session.viewerRole !== "viewer" && state.phase === "connected"

  useEffect(() => {
    const node = scene.current
    if (!node || typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setContainer({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    const update = () => setFullscreen(document.fullscreenElement === frame.current)
    document.addEventListener("fullscreenchange", update)
    return () => document.removeEventListener("fullscreenchange", update)
  }, [])

  const tile = (candidate: typeof candidates[number]) => <div className="relative min-h-0 min-w-0 overflow-hidden rounded-[var(--esp-primitive-media-radius,0.5rem)] border border-border bg-muted" style={directTileFit(plan.tileAspect)}>
    {candidate.track ? <><ParticipantTile trackRef={candidate.track} className="h-full w-full [&_.lk-participant-metadata]:hidden" /><span className="absolute top-1 left-1 rounded bg-background px-2 py-1 text-sm">{candidate.displayName || t("person")}</span></> : <div className="flex h-full min-h-24 flex-col items-center justify-center gap-1 p-3 text-center"><span>{candidate.displayName || t("person")}</span><span className="text-xs text-muted-foreground">{t("studio.notConnected")}</span></div>}
    <Button size="sm" variant="ghost" className="absolute bottom-1 right-1" style={{ background: "var(--background)" }} aria-label={t(effectivePin === candidate.key ? "studio.unpinPerson" : "studio.pinPerson", { name: candidate.displayName || t("person") })} aria-pressed={effectivePin === candidate.key} onClick={() => setPinned(effectivePin === candidate.key ? null : candidate.key)}>{t(effectivePin ===candidate.key ? "studio.unpin" : "studio.pin")}</Button>
  </div>
  const presentation = screen ? <div className="relative h-full w-full min-h-0 min-w-0 overflow-hidden rounded-[var(--esp-primitive-media-radius,0.5rem)] border border-border bg-muted" aria-label={t("studio.presentation")}><ParticipantTile trackRef={screen} className="h-full w-full [&_video]:object-contain [&_.lk-participant-metadata]:hidden" /><span className="absolute top-1 left-1 rounded bg-background px-2 py-1 text-sm">{t("studio.presentation")}</span></div> : null

  return <div ref={frame} data-lk-theme="antsia" className="flex min-w-0 flex-col gap-[var(--esp-card-gap,0.75rem)] rounded-[var(--esp-primitive-card-radius,0.75rem)] border border-[var(--esp-primitive-surface-border,var(--border))] bg-card p-[var(--esp-card-padding,0.75rem)]" style={{ ...studioTokens, fontSize: "var(--esp-content-font-size, inherit)", lineHeight: "var(--esp-content-line-height, inherit)", boxShadow: "var(--esp-surface-shadow, none)", ...(fullscreen ? { height: "100%", overflow: "hidden" } : {}) }}>
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
      <label className="flex min-h-11 items-center gap-2 text-sm">{t("studio.view")}<select value={view} onChange={(event) => setView(event.target.value as DirectSceneView)} className="min-h-11 rounded-[var(--esp-input-radius,0.5rem)] border border-input bg-background px-2">{DIRECT_SCENE_VIEWS.map((value) => <option key={value} value={value}>{t(`studio.views.${value}`)}</option>)}</select></label>
      {typeof document !== "undefined" && document.fullscreenEnabled ? <Button variant="ghost" disabled={command.pending} onClick={() => void command.run(() => fullscreen ? document.exitFullscreen() : frame.current!.requestFullscreen())}>{t(fullscreen ? "studio.exitFullscreen" : "studio.fullscreen")}</Button> : null}
    </div>
    <div ref={scene} aria-label={t(`studio.scene.${plan.kind}`, { count: plan.tiles })} className="flex min-h-0 min-w-0 flex-col gap-2 overflow-hidden" style={fullscreen ? { flex: "1 1 0%" } : { height: "clamp(12rem, 60vh, 38rem)" }}>
      {candidates.length === 0 && !screen ? <p className="p-6">{t("emptyStage")}</p> : banded ? <>
        <div className="grid min-h-0 flex-1 gap-2" style={{ gridTemplateColumns: plan.band === "right" ? "minmax(0, 1fr) minmax(6rem, 22%)" : "minmax(0, 1fr)", gridTemplateRows: plan.band === "bottom" ? "minmax(0, 1fr) 6rem" : "minmax(0, 1fr)" }}>
          <div className={DIRECT_SCENE_CELL_CLASS}>{dominant ? tile(dominant) : presentation}</div>
          {plan.kind !== "cinema" ? <div className={`flex min-h-0 min-w-0 gap-2 ${plan.band === "right" ? "flex-col overflow-y-auto" : "overflow-x-auto"}`}>{rest.map((candidate) => <div key={candidate.key} className={`${DIRECT_SCENE_CELL_CLASS} ${plan.band === "right" ? "h-24 shrink-0" : "w-32 shrink-0"}`}>{tile(candidate)}</div>)}{dominant && screen ? <div className={plan.band === "right" ? "h-24 shrink-0" : "w-48 shrink-0"}>{presentation}</div> : null}</div> : null}
        </div>
        {plan.hidden > 0 ? <p className="text-sm text-muted-foreground">{t("studio.hidden", { count: plan.hidden })}</p> : null}
      </> : <div className="grid min-h-0 min-w-0 flex-1 gap-2" style={{ gridTemplateColumns: `repeat(${plan.columns}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${plan.rows}, minmax(0, 1fr))` }}>
        {candidates.map((candidate) => <div key={candidate.key} className={DIRECT_SCENE_CELL_CLASS}>{tile(candidate)}</div>)}
        {plan.kind === "fixed" ? Array.from({ length: Math.max(0, plan.maxVisible - candidates.length) }, (_, index) => <div key={`open-${index}`} className={DIRECT_SCENE_CELL_CLASS}><div className="flex min-h-0 min-w-0 items-center justify-center overflow-hidden rounded-[var(--esp-primitive-media-radius,0.5rem)] border border-dashed border-border p-2 text-center text-sm text-muted-foreground" style={directTileFit(plan.tileAspect)}>{t("studio.freePlace")}</div></div>) : null}
      </div>}
    </div>
    <div className="flex min-h-14 shrink-0 flex-wrap gap-2 border-t border-border pt-3 pb-[env(safe-area-inset-bottom)]" aria-label={t("studio.controls")}>
      {canPublish ? <>
        <Button variant="ghost" aria-pressed={state.intent.micEnabled} onClick={() => directSessionStore.setIntent({ micEnabled: !state.intent.micEnabled })}>{t(state.intent.micEnabled ? "microphoneOff" : "microphoneOn")}</Button>
        <Button variant="ghost" aria-pressed={state.intent.cameraEnabled && !state.intent.audioOnly} onClick={() => directSessionStore.setIntent({ cameraEnabled: !(state.intent.cameraEnabled && !state.intent.audioOnly), audioOnly: false })}>{t(state.intent.cameraEnabled && !state.intent.audioOnly ? "cameraOff" : "cameraOn")}</Button>
        {typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getDisplayMedia === "function" ? <Button variant="ghost" disabled={command.pending} aria-pressed={isScreenShareEnabled} onClick={() => void command.run(() => localParticipant.setScreenShareEnabled(!isScreenShareEnabled, { audio: false }))}>{t(isScreenShareEnabled ? "studio.stopSharing" : "studio.shareScreen")}</Button> : null}
      </> : null}
      {onLeave ? <Button variant="ghost" onClick={onLeave}>{t("leave")}</Button> : null}
      {onEnd && session.permissions.endOrTransfer ? <Button variant="ghost" disabled={command.pending} onClick={() => void command.run(async () => { if (document.fullscreenElement === frame.current) await document.exitFullscreen(); onEnd() })}>{t("end")}</Button> : null}
    </div>
    {command.error ? <p role="alert" className="text-sm text-destructive">{command.error}</p> : null}
  </div>
}
