// Dupliqué de socle/packages/agent-features/src/features/direct/ReplayManagementPanel.tsx @ ad2e7fdc2 — adaptations : DTO/réseau moteur, lecteur et décisions réunis, action VTT typée, confirmation en place, i18n et jetons ; aucune URL de dépôt ni seconde capture. ; PA6 : dates et jours civils dans le fuseau personnel du lecteur (repli appareil).
"use client"

import { themedActionStyle } from "../themed-action-style"
import { formatViewerDate } from "@antsia/api/civil-date"
import { useViewerTimeZone } from "@antsia/api/viewer-preferences"
import { api } from "@antsia/api/engine"
import { useNetwork } from "@antsia/api/network"
import { DIRECT_REPLAY_CAPTIONS_LANGS, DIRECT_REPLAY_FAILURE_REASONS } from "@antsia/social-domain/live/replayComposition"
import { Button } from "@antsia/ui"
import { useAction, useMutation } from "convex/react"
import { useEffect, useRef, useState, type CSSProperties } from "react"
import { useTranslation } from "react-i18next"
import type { DirectAudience } from "@antsia/social-domain/live/domain"
import type { DirectSession } from "./DirectPage"
import { replayCanDecide, replayCanRetry, replayCaptionsFileRefusal, replayDurationParts, replayRetentionIsNear, replayVisibilityOptions } from "./direct-playback"
import { useDirectClock, useDirectCommand } from "./use-direct-command"

export function DirectReplay({ session }: { session: DirectSession }) {
  const { t, i18n } = useTranslation("direct")
  const timeZone = useViewerTimeZone()
  const { networkId } = useNetwork()
  const decide = useMutation(api.modules.live.sessions.decideReplayPublication)
  const visibility = useMutation(api.modules.live.sessions.setReplayVisibility)
  const withdraw = useMutation(api.modules.live.sessions.withdrawReplay)
  const recover = useMutation(api.modules.live.sessions.retryReplay)
  const importCaptions = useAction(api.modules.live.livekitActions.importReplayCaptions)
  const command = useDirectCommand()
  const now = useDirectClock()
  const [confirmation, setConfirmation] = useState(false)
  const [lang, setLang] = useState<"fr" | "en">("fr")
  const [message, setMessage] = useState<string | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [playback, setPlayback] = useState<"idle" | "ended" | "error">("idle")
  const [playerVersion, setPlayerVersion] = useState(0)
  const withdrawButton = useRef<HTMLButtonElement>(null)
  const wasConfirming = useRef(false)
  const current = useRef(session)
  const mounted = useRef(true)
  useEffect(() => { current.current = session }, [session])
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const replay = session.replay
  const canManage = !!replay?.canManage && session.permissions.changeAudienceOrReplay && session.status === "ended"
  useEffect(() => {
    if (wasConfirming.current && !confirmation) withdrawButton.current?.focus()
    wasConfirming.current = confirmation
  }, [confirmation])
  useEffect(() => { if (!canManage) setConfirmation(false) }, [canManage])
  const duration = replayDurationParts(replay?.durationMs ?? null)
  const failure = replay?.failureReason && DIRECT_REPLAY_FAILURE_REASONS.find((reason) => reason === replay.failureReason)
  const choices = replayVisibilityOptions(session.audience)
  const servable = replay?.status === "ready" && !!replay.url
  const act = async (operation: () => Promise<unknown>, success: string) => {
    setMessage(null)
    setFileError(null)
    if (await command.run(operation)) setMessage(t(success))
  }
  const cancelWithdraw = () => { setConfirmation(false) }
  const attachFile = async (file: File) => {
    const refusal = replayCaptionsFileRefusal(file)
    setFileError(refusal ? t(`captionsRefusal.${refusal}`) : null)
    setMessage(null)
    if (refusal) return
    await command.run(async () => {
      const content = await file.text()
      if (!mounted.current || !current.current.replay?.canManage || !current.current.permissions.changeAudienceOrReplay || current.current.replay.status !== "ready") return
      const result = await importCaptions({ networkId, sessionId: session.sessionId, content, lang })
      if (!mounted.current) return
      if (result.accepted) setMessage(t("replay.importAccepted"))
      else setFileError(t(`captionsRefusal.${result.reason}`))
    })
  }
  return <section aria-label={t("replay.management")} className="flex min-w-0 flex-col gap-4 rounded-[var(--esp-primitive-card-radius,0.75rem)] border border-[var(--esp-primitive-surface-border,var(--border))] bg-card p-[var(--esp-card-padding,1.25rem)]" style={{ "--ui2-button-min-h": "44px", "--ui2-button-sm-min-h": "44px" } as CSSProperties}>
    <h2 className="font-semibold">{t("replay.management")}</h2>
    <p role="status">{t(replay ? `replay.egress.${replay.egressState}` : "replay.none")}</p>
    {duration ? <p className="text-sm">{t(duration.hours ? "replay.durationHours" : "replay.durationMinutes", { hours: duration.hours, minutes: duration.hours ? String(duration.minutes).padStart(2, "0") : duration.totalMinutes })}</p> : null}
    {replay?.retentionUntil ? <p className={`text-sm ${replayRetentionIsNear(replay.retentionUntil, now) ? "font-semibold" : "text-muted-foreground"}`}>{replay.retentionUntil <= now ? t("replay.retentionPassed") : t("replay.retention", { date: formatViewerDate(replay.retentionUntil, i18n.language, { dateStyle: "long" }, timeZone) })}</p> : null}
    {canManage && replay?.egressState === "failed" ? <p role="alert">{failure ? t(`replayFailure.${failure}`) : t("replay.failed")}</p> : null}
    {replay?.url ? <video key={`${replay.url}:${replay.captionsUrl}:${replay.captionsLang}:${playerVersion}`} src={replay.url} controls playsInline preload="metadata" aria-label={t("replay.player")} className="aspect-video w-full rounded-[var(--esp-primitive-media-radius,0.5rem)]" onPlay={() => setPlayback("idle")} onEnded={() => setPlayback("ended")} onError={() => setPlayback("error")}>
      {replay.captionsUrl ? <track kind="captions" src={replay.captionsUrl} srcLang={replay.captionsLang ?? "fr"} label={t(`captionsLang.${replay.captionsLang === "en" ? "en" : "fr"}`)} default /> : null}
    </video> : replay?.status === "ready" ? <p>{t("replay.fileUnavailable")}</p> : null}
    {playback === "ended" ? <p role="status">{t("replay.playbackEnded")}</p> : null}
    {playback === "error" ? <div role="alert"><p>{t("replay.playbackFailed")}</p><Button variant="ghost" onClick={() => { setPlayback("idle"); setPlayerVersion((value) => value + 1) }}>{t("retry")}</Button></div> : null}
    {canManage && replay ? <>
      <p>{t(`replay.publication.${replay.publication}`)}</p>
      {replayCanDecide(replay.status) ? <div className="flex flex-wrap gap-3"><Button disabled={command.pending || replay.publication === "published"} onClick={() => void act(() => decide({ networkId, sessionId: session.sessionId, decision: "published" }), "replay.published")}>{t("replay.publish")}</Button><Button variant="ghost" disabled={command.pending || replay.publication === "private"} onClick={() => void act(() => decide({ networkId, sessionId: session.sessionId, decision: "private" }), "replay.keptPrivate")}>{t("replay.keepPrivate")}</Button></div> : null}
      {replayCanRetry(replay) ? <div><p className="text-sm text-muted-foreground">{t("replay.recoverDescription")}</p><Button variant="ghost" disabled={command.pending} onClick={() => void act(() => recover({ networkId, sessionId: session.sessionId }), "replay.recoveryScheduled")}>{t("replay.recover")}</Button></div> : null}
      {replay.status !== "expired" ? <>
        {choices.length > 1 ? <label className="flex flex-col gap-2 text-sm">{t("replay.visibility")}<select value={replay.visibility} disabled={command.pending} onChange={(event) => { const value = event.target.value as DirectAudience; if (choices.includes(value)) void act(() => visibility({ networkId, sessionId: session.sessionId, visibility: value }), "replay.visibilityUpdated") }} className="min-h-11 rounded-[var(--esp-input-radius,0.5rem)] border border-input bg-background px-3">{choices.map((value) => <option key={value} value={value}>{t(`audience.${value}`)}</option>)}</select></label> : <p className="text-sm">{t("replay.fixedAudience", { audience: t(`audience.${replay.visibility}`) })}</p>}
        {servable ? <fieldset disabled={command.pending} className="flex flex-col gap-3 border-t border-border pt-3"><legend>{t("replay.captions")}</legend><p className="text-sm text-muted-foreground">{t("replay.captionsDescription")}</p><label className="flex flex-col gap-2 text-sm">{t("replay.captionsLanguage")}<select value={lang} onChange={(event) => setLang(event.target.value === "en" ? "en" : "fr")} className="min-h-11 rounded-[var(--esp-input-radius,0.5rem)] border border-input bg-background px-3">{DIRECT_REPLAY_CAPTIONS_LANGS.map((value) => <option key={value} value={value}>{t(`captionsLang.${value}`)}</option>)}</select></label><label className="flex flex-col gap-2 text-sm">{t("replay.importCaptions")}<input type="file" accept=".vtt,text/vtt,text/plain" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void attachFile(file) }} className="min-h-11 max-w-full" /></label></fieldset> : null}
        {confirmation ? <div role="group" aria-label={t("replay.withdraw")} className="flex flex-col gap-3 border-t border-border pt-3"><p>{t("replay.withdrawConfirm")}</p><div className="flex flex-wrap gap-3"><Button style={themedActionStyle("danger", "primary")} variant="danger" disabled={command.pending} onClick={() => void act(() => withdraw({ networkId, sessionId: session.sessionId }).then(() => setConfirmation(false)), "replay.withdrawn")}>{t("replay.withdraw")}</Button><Button style={themedActionStyle("cancel", "ghost")} variant="outline" disabled={command.pending} onClick={cancelWithdraw}>{t("keep")}</Button></div></div> : <Button style={themedActionStyle("danger", "ghost")} ref={withdrawButton} variant="danger" disabled={command.pending} onClick={() => setConfirmation(true)}>{t("replay.withdraw")}</Button>}
      </> : null}
    </> : null}
    {command.pending ? <p role="status">{t("pending")}</p> : null}
    {message ? <p role="status">{message}</p> : null}
    {fileError || command.error ? <p role="alert">{fileError ?? command.error}</p> : null}
  </section>
}
