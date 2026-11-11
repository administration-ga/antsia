"use client"

/**
 * Signaler depuis n'importe quel objet — la brique commune (MC-01, plan
 * directeur § 5.1). Les lots IC-03, SD-01, PF-02, DL-03, UM-03 et MB-04 s'y
 * branchent sans la réécrire.
 *
 * Deux formes, une seule logique :
 *  · `ReportTargetDialog` : la boîte, pour une entrée de menu existant (la
 *    surface garde son menu, et ouvre la boîte avec la cible) ;
 *  · `ReportTargetButton` : un bouton « Signaler » qui ouvre la boîte, pour une
 *    rangée d'actions sans menu ; il se fige en « Signalé » après l'envoi.
 *
 * Ce qu'elle garantit, partout pareil :
 *  · le même dialogue que la publication (`ReportContentDialog`) : motifs du
 *    domaine, phrase de suivi SU01d (accusé de réception puis décision, dans
 *    les notifications et « Mes données et mes recours »), dialogue accessible
 *    (titre, focus piégé, Échap, focus rendu au déclencheur) ;
 *  · un seul envoi : `moderation.cases.report` avec le réseau courant et la
 *    cible ; le moteur rejuge l'audience réelle, refuse l'auto-signalement et
 *    dédoublonne ;
 *  · l'accusé dit par un toast (annoncé aux aides techniques) : il SURVIT à la
 *    surface, que le masque du déclarant fait souvent disparaître aussitôt ;
 *    « déjà signalé » quand le moteur rejoue un dossier existant ;
 *  · un refus dit par sa règle ou son code (toast, et alerte dans la boîte),
 *    la boîte restant ouverte pour réessayer.
 *
 * ⚠️ JAMAIS POUR SOI : la surface ne monte pas la brique sur son propre
 * contenu (auteur, propriétaire, expéditeur) ; le moteur refuse de toute façon.
 */
import { api } from "@antsia/api/engine"
import { useNetwork } from "@antsia/api/network"
import { Button } from "@antsia/ui"
import { useMutation } from "convex/react"
import { useState, type CSSProperties } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { postEngineErrorText } from "./post-overflow"
import { ReportContentDialog } from "./ReportContentDialog"
import { reportAcknowledgementKey, reportAcknowledgementOf, type ReportAcknowledgement, type ReportTarget } from "./report-target"

export interface ReportTargetDialogProps {
  /** L'objet signalé, tel que le moteur le désigne. */
  target: ReportTarget
  onClose: () => void
  /** Après l'accusé (toast déjà émis), avant la fermeture. */
  onReported?: (acknowledgement: ReportAcknowledgement) => void
}

export function ReportTargetDialog({ target, onClose, onReported }: ReportTargetDialogProps) {
  const { t } = useTranslation("reseau")
  const { networkId } = useNetwork()
  const report = useMutation(api.modules.moderation.cases.report)
  return (
    <ReportContentDialog
      kind={target.kind}
      // Le port polymorphe du moteur ne transporte que le motif : aucune précision saisie puis ignorée.
      allowNote={false}
      onClose={onClose}
      onSubmit={async (reason) => {
        try {
          const acknowledgement = reportAcknowledgementOf(await report({ networkId, target, reason }))
          /*
           * ⚠️ PAS de garde de montage : le masque du déclarant retire souvent
           * l'objet de l'écran (fiche refusée, message disparu) avant que cette
           * promesse ne se résolve. Le dossier existe : l'accusé se dit.
           */
          toast.success(t(reportAcknowledgementKey(acknowledgement)))
          onReported?.(acknowledgement)
        } catch (error) {
          toast.error(postEngineErrorText(error, "reseau:postCard.toast.reportFailed", t))
          throw error
        }
      }}
    />
  )
}

export interface ReportTargetButtonProps {
  target: ReportTarget
  /** Taille du kit ; la rangée d'actions d'une carte prend `sm`. */
  size?: "sm" | "md"
  style?: CSSProperties
  onReported?: (acknowledgement: ReportAcknowledgement) => void
}

export function ReportTargetButton({ target, size = "sm", style, onReported }: ReportTargetButtonProps) {
  const { t } = useTranslation("reseau")
  const [open, setOpen] = useState(false)
  const [reported, setReported] = useState(false)
  return (
    <>
      <Button
        type="button"
        size={size}
        variant="ghost"
        icon="shieldAlert"
        style={style}
        disabled={reported}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        {t(reported ? "reportContentDialog.reported" : "reportContentDialog.open")}
      </Button>
      {open ? (
        <ReportTargetDialog
          target={target}
          onClose={() => setOpen(false)}
          onReported={(acknowledgement) => {
            setReported(true)
            onReported?.(acknowledgement)
          }}
        />
      ) : null}
    </>
  )
}
