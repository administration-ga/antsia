"use client"

/**
 * Confirmer un blocage ou un déblocage — la brique commune « Bloquer une
 * personne » (PF-01, plan directeur § 5.1).
 *
 * Toute surface web qui offre le geste monte CETTE boîte avec la personne
 * visée : la fiche (`ProfileOverflowMenu`, et « Débloquer » sur une fiche
 * refusée), le menu « … » d'une publication (`PostOverflowMenu`), et la
 * conversation iCom (lot IC-03). Elle appelle le moteur
 * (`graph.connections.blockPerson` / `unblockPerson`), dit le succès par un
 * toast et laisse la SUITE à la surface (`onDone` : retour au volet Relations,
 * fermeture d'une conversation…).
 *
 * Ce qu'elle garantit, partout pareil :
 *  · la conséquence est dite AVANT le geste, avec ce qui reste réversible ;
 *  · un seul envoi (double clic, Échap pendant l'envoi : sans effet) ;
 *  · un refus du moteur se dit par sa règle ou son code, jamais par sa trace ;
 *    la boîte reste ouverte pour réessayer ;
 *  · rien n'est annoncé à la personne bloquée (le moteur n'émet rien).
 */
import { api, type Id } from "@antsia/api/engine"
import { useNetwork } from "@antsia/api/network"
import { Button } from "@antsia/ui"
import { EspaceDialog } from "@antsia/ui/espace-kit"
import { useMutation } from "convex/react"
import { useLayoutEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { themedActionStyle } from "../themed-action-style"
import { relationErrorText } from "./people-panel"
import { personBlockCopy, type PersonBlockMode } from "./person-block"

export interface BlockPersonDialogProps {
  mode: PersonBlockMode
  targetPersonId: Id<"persons">
  /** Le nom que la surface montre déjà ; absent, la boîte dit « cette personne ». */
  name?: string | null
  onClose: () => void
  /** Après le succès (toast déjà émis), avant la fermeture. */
  onDone?: () => void
}

export function BlockPersonDialog({ mode, targetPersonId, name, onClose, onDone }: BlockPersonDialogProps) {
  const { t } = useTranslation("reseau")
  const { networkId } = useNetwork()
  const block = useMutation(api.modules.graph.connections.blockPerson)
  const unblock = useMutation(api.modules.graph.connections.unblockPerson)
  const [busy, setBusy] = useState(false)
  const running = useRef(false)
  const active = useRef(false)
  useLayoutEffect(() => {
    active.current = true
    return () => { active.current = false }
  }, [])

  const copy = personBlockCopy(mode, name, t)
  const close = () => {
    if (!running.current) onClose()
  }
  const confirm = async () => {
    if (running.current) return
    running.current = true
    setBusy(true)
    try {
      await (mode === "block" ? block : unblock)({ networkId, targetPersonId })
      /*
       * ⚠️ PAS de garde de montage ici : le blocage referme aussitôt ce qui
       * montait la boîte (la fiche devient refusée, la publication quitte le
       * fil), parfois avant que cette promesse ne se résolve. Le geste a eu
       * lieu : il se dit, et la surface fait sa suite, montée ou non.
       */
      toast.success(copy.done)
      onDone?.()
      onClose()
    } catch (error) {
      toast.error(relationErrorText(error, copy.failedKey, t))
    } finally {
      running.current = false
      if (active.current) setBusy(false)
    }
  }

  return (
    <EspaceDialog
      title={copy.title}
      description={copy.description}
      closeLabel={t("personBlock.close")}
      onClose={close}
      footer={(
        <>
          <Button style={themedActionStyle("cancel", "secondary")} variant="outline" disabled={busy} onClick={close}>
            {t("personBlock.cancel")}
          </Button>
          {/* Bloquer est un geste de suppression (ADR-0027) ; débloquer n'en est pas un. */}
          {mode === "block" ? (
            <Button style={themedActionStyle("danger", "primary")} variant="danger" disabled={busy} aria-busy={busy} onClick={() => void confirm()}>
              {copy.confirm}
            </Button>
          ) : (
            <Button disabled={busy} aria-busy={busy} onClick={() => void confirm()}>
              {copy.confirm}
            </Button>
          )}
        </>
      )}
    >
      {copy.details.map((line) => (
        <p key={line} style={{ margin: "0 0 8px" }}>{line}</p>
      ))}
    </EspaceDialog>
  )
}
