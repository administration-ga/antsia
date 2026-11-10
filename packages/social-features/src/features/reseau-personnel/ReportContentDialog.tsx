// Dupliqué de socle/packages/agent-features/src/features/reseau-personnel/ReportContentDialog.tsx @ ad2e7fdc2 — adaptations : motifs et borne de la précision lus dans le domaine du moteur (`CONTENT_REPORT_REASONS`, `CONTENT_REPORT_NOTE_MAX` de `@antsia/social-domain/moderation`, type `ReportReason` = `ContentReportReason`) ; libellés par l'i18n (clés `reseau:reportContentDialog.*`, le motif par sa clé) ; voile et ombre par les jetons (`--ui2-scrim`, `--shadow-xl`) au lieu de couleurs littérales ; titre accordé (« Signaler cette publication » — le socle écrivait « ce publication ») ; un échec de transmission ne laisse plus de promesse rejetée sans lecteur (l’appelant le dit, la boîte reste ouverte) ; P18b (A03, A07, A30) : accessibilité modale par le hook partagé `useModalA11y` (focus initial sur le motif, piège de Tab, Échap qui ferme hors transmission, inertage du reste de la page, focus rendu au déclencheur), dialogue nommé et décrit par son titre et sa phrase (`aria-labelledby`, `aria-describedby`), échec doublé d'une alerte dans le dialogue (`role="alert"`, hors de la vue : le toast reste le retour visible), nom accessible de la précision = son libellé visible ; rendu inchangé.
"use client"

import { themedActionStyle } from "../themed-action-style"
import { Button, TextArea, useModalA11y } from "@antsia/ui"
import { CONTENT_REPORT_NOTE_MAX, CONTENT_REPORT_REASONS, type ContentReportReason } from "@antsia/social-domain/moderation"
import { useEffect, useId, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useTranslation } from "react-i18next"

import { postEngineErrorText } from "./post-overflow"

export type ReportReason = ContentReportReason

/** Les motifs, dans l'ordre du domaine — chacun avec la clé de son libellé. */
const REASONS: readonly { value: ReportReason; labelKey: string }[] = CONTENT_REPORT_REASONS.map((value) => ({
  value,
  labelKey: `reportContentDialog.reasons.${value}`,
}))

/** Dialogue unique pour publication et commentaire : le déclarant sait ce qui
 * sera transmis et le texte complémentaire reste strictement borné. */
export function ReportContentDialog({ kind, onClose, onSubmit, allowNote = true }: {
  kind: "publication" | "commentaire" | "professionalProfile" | "professionalCollaboration" | "editorialVersion" | "editorialMedia"
  onClose: () => void
  /** Le port polymorphe ne transporte que le motif : aucune précision saisie puis ignorée. */
  allowNote?: boolean
  onSubmit: (reason: ReportReason, note: string) => Promise<void>
}) {
  const { t } = useTranslation("reseau")
  const [reason, setReason] = useState<ReportReason>("harassment")
  const [note, setNote] = useState("")
  const [pending, setPending] = useState(false)
  /** Le refus de la transmission, redit DANS le dialogue (le toast peut être hors d'atteinte). */
  const [failure, setFailure] = useState<string | null>(null)
  const title = t(`reportContentDialog.title.${kind}`)
  const titleId = useId()
  const descriptionId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const reasonRef = useRef<HTMLSelectElement>(null)
  // Le hook s'installe une fois, au montage : il lit l'état courant par des
  // références — une transmission en cours ne se ferme pas par Échap.
  const pendingRef = useRef(false)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])
  // Focus initial sur le motif, piège de Tab, Échap, inertage du reste de la
  // page et restitution du focus au déclencheur (le bouton « ⋯ » de la carte).
  useModalA11y({
    containerRef: dialogRef,
    initialFocusRef: reasonRef,
    onClose: () => {
      if (!pendingRef.current) onCloseRef.current()
    },
  })
  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "grid",
        placeItems: "center",
        padding: 20,
        background: "var(--ui2-scrim)",
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (pendingRef.current) return
          pendingRef.current = true
          setPending(true)
          setFailure(null)
          // L'échec est DIT par l'appelant (toast) et REDIT ici, dans le
          // dialogue, pour les aides techniques ; la boîte reste ouverte pour
          // un nouvel essai — la promesse rejetée est donc lue ici.
          void onSubmit(reason, allowNote ? note : "")
            .then(onClose, (error: unknown) => {
              setFailure(postEngineErrorText(error, "reseau:postCard.toast.reportFailed", t))
            })
            .finally(() => {
              pendingRef.current = false
              setPending(false)
            })
        }}
        style={{
          width: "min(520px, 100%)",
          padding: "24px",
          border: "1px solid var(--border)",
          borderRadius: "12px",
          background: "var(--esp-surface-raised, var(--card))",
          color: "var(--foreground)",
          boxShadow: "var(--shadow-xl)",
          display: "grid",
          gap: 14,
        }}
      >
        <div>
          <h2 id={titleId} style={{ margin: 0, fontSize: 20 }}>{title}</h2>
          <p
            id={descriptionId}
            style={{
              margin: "6px 0 0",
              color: "var(--muted-foreground)",
              fontSize: 14,
            }}
          >
            {t("reportContentDialog.description")}
            {/* SU01d : l'accusé de réception et la décision suivent la transmission (ordonnance 0011, art. 24). */}
            {" "}
            {t("reportContentDialog.followUp")}
          </p>
        </div>
        <label style={{ display: "grid", gap: 6, fontWeight: 600 }}>
          {t("reportContentDialog.reasonLabel")}
          <select
            ref={reasonRef}
            value={reason}
            onChange={(event) =>
              setReason(event.target.value as ReportReason)
            }
            style={{
              minHeight: "40px",
              border: "1px solid var(--input)",
              borderRadius: "8px",
              background: "var(--card)",
              color: "var(--foreground)",
              padding: "0 10px",
            }}
          >
            {REASONS.map((item) => (
              <option key={item.value} value={item.value}>
                {t(item.labelKey)}
              </option>
            ))}
          </select>
        </label>
        {allowNote ? <label style={{ display: "grid", gap: 6, fontWeight: 600 }}>
          {t("reportContentDialog.noteLabel")}
          {/* Nommée par son libellé visible, qui l'enveloppe (A30). */}
          <TextArea
            value={note}
            maxLength={CONTENT_REPORT_NOTE_MAX}
            onChange={(event) => setNote(event.target.value)}
          />
        </label> : null}
        {/* Région PERSISTANTE : le refus y est inséré, donc annoncé, même
            quand le toast de l'appelant reste hors d'atteinte de la modale. */}
        <p role="alert" className="sr-only">
          {failure ?? ""}
        </p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button style={themedActionStyle("cancel", "ghost")}
            type="button"
            variant="outline"
            disabled={pending}
            onClick={onClose}
          >
            {t("reportContentDialog.cancel")}
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? t("reportContentDialog.submitting") : t("reportContentDialog.submit")}
          </Button>
        </div>
      </form>
    </div>,
    document.body,
  )
}
