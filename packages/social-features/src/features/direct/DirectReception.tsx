/**
 * La RÉCEPTION du spectateur (DL-04) : ses commandes, la suggestion sur
 * connexion faible et la scène d'écoute seule.
 *
 * Ces écrans ne font que lire et écrire le choix (`direct-reception-store`) :
 * c'est le contrôleur de la salle (`DirectRoomMount`) qui désabonne et
 * plafonne les pistes, pour tous les lecteurs à la fois. Montés seulement
 * pour un jeton de SPECTATEUR (studio et carte flottante).
 */
"use client"

import { Button } from "@antsia/ui"
import { Headphones, X } from "lucide-react"
import { useId } from "react"
import { useTranslation } from "react-i18next"

import { directReceptionStore, useDirectReception, useDirectReceptionHint } from "../../stores/direct-reception-store"
import { DIRECT_RECEPTION_QUALITIES } from "./direct-reception"

/**
 * « Écouter seulement » (bouton à bascule, `aria-pressed`) et, hors de la
 * carte compacte, le choix d'image (boutons radio natifs : flèches du
 * clavier, état annoncé). Le choix d'image reste lisible mais inactif en
 * écoute seule : il reprend au retour de la vidéo.
 */
export function DirectReceptionControls({ sessionId, compact = false }: { sessionId: string; compact?: boolean }) {
  const { t } = useTranslation("direct")
  const { preference, setMode, setQuality } = useDirectReception()
  const listening = preference.mode === "audio"
  const listenHintId = useId()
  const qualityHintId = useId()
  const qualityName = useId()
  const toggle = () => {
    // Choisir l'écoute seule vaut réponse à la suggestion : elle ne revient pas.
    if (!listening) directReceptionStore.closeHint(sessionId)
    setMode(listening ? "video" : "audio")
  }
  return (
    <div role="group" aria-label={t("reception.controls")} className="flex min-w-0 flex-wrap items-center gap-2">
      {/* Libellé constant (bouton à bascule) ; l'état se voit au ton du bouton et s'annonce par `aria-pressed`. */}
      <Button variant={listening ? "secondary" : "ghost"} size={compact ? "sm" : "md"} aria-pressed={listening} aria-describedby={listenHintId} onClick={toggle}>
        <Headphones aria-hidden="true" className="size-4 shrink-0" />
        {t("reception.listenOnly")}
      </Button>
      <span id={listenHintId} className="sr-only">{t("reception.listenOnlyHint")}</span>
      {compact ? null : (
        <fieldset disabled={listening} aria-describedby={qualityHintId} className="m-0 flex min-w-0 flex-wrap items-center gap-x-3 border-0 p-0 disabled:opacity-60">
          <legend className="float-left mr-1 flex min-h-11 items-center text-sm">{t("reception.quality")}</legend>
          {DIRECT_RECEPTION_QUALITIES.map((value) => (
            <label key={value} className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
              <input type="radio" name={qualityName} value={value} checked={preference.quality === value} onChange={() => setQuality(value)} className="size-4 accent-primary" />
              {t(`reception.qualities.${value}`)}
            </label>
          ))}
          <span id={qualityHintId} className="sr-only">{t("reception.qualityHint")}</span>
        </fieldset>
      )}
    </div>
  )
}

/**
 * La suggestion « Écouter seulement » quand ma connexion est signalée faible :
 * non bloquante, annoncée (`role="status"`), refermable, une fois par direct
 * (`directReceptionStore.offerHint`). Elle n'agit qu'au geste.
 */
export function DirectReceptionHint({ sessionId }: { sessionId: string }) {
  const { t } = useTranslation("direct")
  const offered = useDirectReceptionHint(sessionId)
  const { preference, setMode } = useDirectReception()
  if (!offered || preference.mode === "audio") return null
  const close = () => directReceptionStore.closeHint(sessionId)
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-[var(--esp-primitive-media-radius,0.5rem)] border border-border bg-muted p-3 text-sm">
      <p role="status" className="min-w-0 flex-1">{t("reception.hint.text")}</p>
      <div className="flex shrink-0 items-center gap-2">
        <Button size="sm" onClick={() => { setMode("audio"); close() }}>{t("reception.hint.accept")}</Button>
        <Button size="sm" variant="ghost" className="min-w-11" aria-label={t("reception.hint.close")} onClick={close}><X aria-hidden="true" className="size-4" /></Button>
      </div>
    </div>
  )
}

/**
 * La scène en écoute seule : un fond sobre, la personne qui parle (ou
 * personne), et le partage d'écran coupé dit à l'écran — jamais un cadre
 * noir vide.
 */
export function DirectListeningStage({ speakerName, presentationCut, compact = false }: { speakerName: string | null; presentationCut: boolean; compact?: boolean }) {
  const { t } = useTranslation("direct")
  return (
    <div role="group" aria-label={t("reception.listening.label")} className={`flex min-w-0 flex-col items-center justify-center gap-2 rounded-[var(--esp-primitive-media-radius,0.5rem)] border border-border bg-muted text-center ${compact ? "aspect-[16/10] p-3" : "min-h-48 flex-1 p-6"}`}>
      <Headphones aria-hidden="true" className={`${compact ? "size-6" : "size-10"} text-muted-foreground`} />
      <p className="font-semibold">{speakerName ? t("reception.listening.speaking", { name: speakerName }) : t("reception.listening.nobody")}</p>
      {compact ? null : <p className="text-sm text-muted-foreground">{t("reception.listening.description")}</p>}
      {presentationCut ? <p className="text-sm text-muted-foreground">{t("reception.listening.presentationCut")}</p> : null}
    </div>
  )
}
