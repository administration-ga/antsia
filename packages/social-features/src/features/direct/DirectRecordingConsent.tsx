/**
 * L'ACCORD À L'ENREGISTREMENT d'un direct, et la PASTILLE de capture (DL-02).
 *
 * Décision du propriétaire du 9/11/2026 : dans un direct enregistré, chaque
 * personne qui prend l'antenne donne un accord explicite et horodaté ; sinon,
 * elle reste spectatrice. Le serveur l'exige à toute montée et à tout jeton
 * d'intervenant (`antenna.acceptRecording`, règle
 * `LIVE_RECORDING_CONSENT_REQUIRED`) : ces écrans ne font que le DEMANDER.
 *
 * La case n'est JAMAIS cochée par défaut, et son libellé dit ce qui est
 * enregistré, où la rediffusion pourra être vue, combien de temps, et ce que
 * vaut « rendre l'antenne » (la suite n'est plus captée ; le déjà-enregistré
 * reste). Aucun retrait d'accord n'est promis : il n'en existe pas.
 */
"use client"

import { themedActionStyle } from "../themed-action-style"
import { api } from "@antsia/api/engine"
import { useNetwork } from "@antsia/api/network"
import { DIRECT_REPLAY_RETENTION_DAYS } from "@antsia/social-domain/live/domain"
import { Button } from "@antsia/ui"
import { useMutation } from "convex/react"
import { useId, useState } from "react"
import { useTranslation } from "react-i18next"
import type { DirectSession } from "./DirectPage"
import { useDirectCommand } from "./use-direct-command"

/** La capture tourne-t-elle EN CE MOMENT ? (l'état observable `active` du direct en cours) */
export function isDirectRecordingActive(session: Pick<DirectSession, "status" | "replay">): boolean {
  return session.status === "live" && session.replay?.egressState === "active"
}

/** Faut-il MON accord avant de prendre l'antenne ? Jamais hors enregistrement. */
export function needsMyRecordingConsent(session: Pick<DirectSession, "recording">): boolean {
  return session.recording.requested && session.recording.consentedAt === null
}

/**
 * La PASTILLE « REC » — présente tant que la capture tourne.
 *
 * Lisible sans la couleur (le mot, et un point), annoncée une fois au lecteur
 * d'écran (`role="status"`, libellé complet), jetons de couleur seulement.
 */
export function DirectRecordingBadge({ session, className = "" }: { session: Pick<DirectSession, "status" | "replay">; className?: string }) {
  const { t } = useTranslation("direct")
  if (!isDirectRecordingActive(session)) return null
  return (
    <span role="status" className={`inline-flex min-h-8 shrink-0 items-center gap-2 rounded-full border border-destructive bg-background px-3 py-1 text-sm font-semibold text-destructive ${className}`}>
      <span aria-hidden="true" className="inline-block size-2.5 rounded-full bg-destructive" />
      <span aria-hidden="true">{t("recordingBadge.short")}</span>
      <span className="sr-only">{t("recordingBadge.label")}</span>
    </span>
  )
}

/**
 * La CASE d'accord, avec ce qu'elle engage. Contrôlée par l'appelant, qui
 * envoie l'accord au geste qui fait monter (accepter, demander la parole,
 * entrer à l'antenne) — jamais à la simple coche.
 */
export function RecordingConsentField({ checked, onChange, disabled }: { checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }) {
  const { t } = useTranslation("direct")
  const detailsId = useId()
  return (
    <div className="flex flex-col gap-2 rounded-[var(--esp-primitive-card-radius,0.75rem)] border border-[var(--esp-primitive-surface-border,var(--border))] p-3">
      <div id={detailsId} className="flex flex-col gap-1 text-sm">
        <p>{t("recordingConsent.notice")}</p>
        <p className="text-muted-foreground">{t("recordingConsent.where", { days: DIRECT_REPLAY_RETENTION_DAYS })}</p>
        <p className="text-muted-foreground">{t("recordingConsent.withdraw")}</p>
      </div>
      <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
        <input type="checkbox" checked={checked} disabled={disabled} aria-describedby={detailsId} onChange={(event) => onChange(event.target.checked)} />
        {t("recordingConsent.accept")}
      </label>
    </div>
  )
}

/** L'accord déjà donné — dit, pour qu'on sache ce qui a été accepté. */
export function RecordingConsentGiven() {
  const { t } = useTranslation("direct")
  return <p role="status" className="text-sm text-muted-foreground">{t("recordingConsent.given")}</p>
}

/**
 * L'INVITÉ INTERVENANT dont la place n'attend que son accord : avant le live,
 * il accepte pour monter dès le démarrage ; pendant le live, accepter le fait
 * monter (le serveur le promeut dans la même transaction).
 */
export function DirectProposedSpeakerConsent({ session }: { session: DirectSession }) {
  const { t } = useTranslation("direct")
  const { networkId } = useNetwork()
  const accept = useMutation(api.modules.live.antenna.acceptRecording)
  const command = useDirectCommand()
  const [checked, setChecked] = useState(false)
  const [waitingForPlace, setWaitingForPlace] = useState(false)
  if (session.status === "ended") return null
  // L'accord donné, la place peut manquer (antenne pleine) : on le DIT, au lieu
  // de laisser disparaître le bloc sans que rien ne change à l'écran.
  if (waitingForPlace && session.viewerRole === "viewer") return <p role="status" className="text-sm">{t("recordingConsent.promotedLater")}</p>
  if (!session.recording.proposedSpeakerAwaitingConsent) return null
  const live = session.status === "live"
  return (
    <div className="flex flex-col gap-3 rounded-[var(--esp-primitive-card-radius,0.75rem)] border border-[var(--esp-primitive-surface-border,var(--border))] bg-card p-[var(--esp-card-padding,1.25rem)]">
      <p>{t(live ? "recordingConsent.proposedSpeakerLive" : "recordingConsent.proposedSpeaker")}</p>
      <RecordingConsentField checked={checked} onChange={setChecked} disabled={command.pending} />
      <Button
        style={themedActionStyle("success", "social")}
        variant="success"
        disabled={!checked || command.pending}
        onClick={() =>
          void command.run(async () => {
            const result = await accept({ networkId, sessionId: session.sessionId })
            setWaitingForPlace(live && !result.promoted)
          })
        }
      >
        {t(live ? "recordingConsent.takeStage" : "recordingConsent.confirm")}
      </Button>
      {command.error ? <p role="alert" className="text-sm text-destructive">{command.error}</p> : null}
    </div>
  )
}
