// Dupliqué de socle/packages/agent-features/src/features/reseau-personnel/AnnounceEventDialog.tsx @ ad2e7fdc2 — adaptations : annonce par `events.events.announce` du moteur, dans le réseau courant (`networkId` par `useNetwork()`) ; audiences de `AUDIENCE_OPTIONS` décrites par leurs clés (`labelKey`) ; voile de la boîte par le jeton de la charte (`--ui2-scrim`) au lieu d'une couleur écrite en dur ; refus du moteur lus par code (`eventActionErrorText`, la règle « évènement annulé » se dit) ; toutes les chaînes par l'i18n (espace `reseau`, clés `announceEventDialog.*`, récapitulatif `announceSummary(…, t)`).
"use client"

/**
 * Annoncer un évènement au réseau — l'audience se CHOISIT, et se prévisualise.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POURQUOI CETTE BOÎTE EXISTE (R-16, audit du 2026-09-06)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * « Annoncer au réseau » était un bouton d'UN clic qui annonçait en
 * `connections` : l'audience la plus restreinte, codée en dur, sans corps,
 * sans confirmation, sans dire à qui l'annonce partait. Le serveur, lui,
 * accepte `public | connections` et un `body` optionnel — l'écran était plus
 * pauvre que sa mutation, et publiait sans qu'on sache quoi ni pour qui.
 *
 * ⚠️ **Deux publics, jamais le même.** Les INVITÉS reçoivent l'invitation et
 * répondent (lignes de participation) ; les LECTEURS de l'annonce la voient
 * passer dans leur fil (l'audience de la publication). La ligne d'aperçu
 * (`announceSummary`, module pur) dit les deux d'un coup — c'est la confusion
 * exacte que l'audit relève.
 *
 * ⚠️ Le bouton « Annoncer » EST la confirmation (une seule confirmation,
 * jamais deux) : le récapitulatif est au-dessus de lui, dans la boîte, pas
 * dans une seconde boîte.
 *
 * ⚠️ PORTAIL vers `body`, comme `SharePostDialog` : cette boîte est montée
 * depuis le volet Évènements, donc sous `.rp-scope`, qui déclare
 * `container-type` — donc `contain: layout`, qui cadrerait un
 * `position: fixed` sur la grille au lieu du viewport.
 */

import { themedActionStyle } from "../themed-action-style"
import { api } from "@antsia/api/engine"
import { useNetwork } from "@antsia/api/network"
import { Button, Card, Field, Select, TextArea, useModalA11y } from "@antsia/ui"
import { useMutation } from "convex/react"
import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { announceSummary, eventActionErrorText, type EvenementListItem } from "./evenements-list"
import { AUDIENCE_OPTIONS, DEFAULT_AUDIENCE, POST_MAX_LENGTH, type ReachAudience } from "./shared"

export interface AnnounceEventDialogProps {
  event: EvenementListItem
  onClose: () => void
  /** Appelé après une annonce ENREGISTRÉE, jamais sur échec ni sur annulation. */
  onAnnounced?: () => void
}

export function AnnounceEventDialog(props: AnnounceEventDialogProps) {
  // `createPortal` a besoin du DOM : rien au rendu serveur, sans quoi
  // l'hydratation diverge (même précaution que `SharePostDialog`).
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null
  return createPortal(<AnnounceEventDialogContent {...props} />, document.body)
}

function AnnounceEventDialogContent({ event, onClose, onAnnounced }: AnnounceEventDialogProps) {
  const { t } = useTranslation("reseau")
  const { networkId } = useNetwork()
  const announce = useMutation(api.modules.events.events.announce)
  const [audience, setAudience] = useState<ReachAudience>(DEFAULT_AUDIENCE)
  const [body, setBody] = useState("")
  const [sending, setSending] = useState(false)
  const overlay = useRef<HTMLDivElement>(null)

  // Échap, focus initial, piège de focus, inertage, restitution du focus au
  // déclencheur — le tout par le hook partagé.
  useModalA11y({ containerRef: overlay, onClose })

  const handleAnnounce = async () => {
    setSending(true)
    try {
      const texte = body.trim()
      await announce({
        networkId,
        eventId: event.eventId,
        audience,
        // Le corps est OPTIONNEL au serveur : ne pas envoyer une chaîne vide,
        // qui deviendrait une publication sans texte au lieu d'une annonce
        // composée par le serveur.
        ...(texte.length > 0 ? { body: texte } : {}),
      })
      toast.success(t("announceEventDialog.toast.announced"))
      onAnnounced?.()
      onClose()
    } catch (error) {
      toast.error(eventActionErrorText(error, "reseau:announceEventDialog.toast.failed", t))
    } finally {
      setSending(false)
    }
  }

  return (
    <div
      ref={overlay}
      role="dialog"
      aria-modal="true"
      aria-label={t("announceEventDialog.dialogLabel", { title: event.title })}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        display: "grid",
        placeItems: "center",
        padding: 16,
        background: "var(--ui2-scrim)",
      }}
      onClick={(clic) => {
        if (clic.target === clic.currentTarget) onClose()
      }}
    >
      <div style={{ width: "min(560px, 100%)", outline: "none" }}>
        <Card>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <h2 style={{ margin: 0, fontSize: 16, color: "var(--ink-900)" }}>{t("announceEventDialog.heading", { title: event.title })}</h2>

            <Field label={t("announceEventDialog.bodyLabel")} htmlFor="annonce-mot">
              <TextArea
                id="annonce-mot"
                rows={3}
                value={body}
                maxLength={POST_MAX_LENGTH}
                onChange={(saisie) => setBody(saisie.target.value)}
                placeholder={t("announceEventDialog.bodyPlaceholder")}
              />
            </Field>

            <Field label={t("announceEventDialog.audienceLabel")} hint={t("announceEventDialog.audienceHint")} htmlFor="annonce-audience">
              <Select id="annonce-audience" value={audience} onChange={(choix) => setAudience(choix.target.value as ReachAudience)}>
                {AUDIENCE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {t(option.labelKey)}
                  </option>
                ))}
              </Select>
            </Field>

            {/* Le RÉCAPITULATIF — c'est lui qui fait du bouton une
                confirmation, et lui qui sépare invités et lecteurs. */}
            <p
              aria-live="polite"
              style={{
                margin: 0,
                padding: 12,
                borderLeft: "3px solid var(--ink-200)",
                fontSize: 13,
                color: "var(--ink-700)",
              }}
            >
              {announceSummary(event, audience, t)}
            </p>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Button style={themedActionStyle("cancel", "ghost")} variant="outline" onClick={onClose} disabled={sending}>
                {t("announceEventDialog.cancel")}
              </Button>
              <Button icon="share" disabled={sending} onClick={() => void handleAnnounce()}>
                {sending ? t("announceEventDialog.submitting") : t("announceEventDialog.submit")}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
