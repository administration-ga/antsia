// Dupliqué de socle/packages/agent-features/src/features/messagerie/IcomAppelJournal.tsx @ ad2e7fdc2 — adaptations : rappel par `calls.direct.callMember({ networkId, target: { personId } })` au lieu de `functions.meetings.callCitizenById` (une seule porte d'appel dans le moteur) ; l'appel est `callId` (`Id<"calls">`), l'appelé une PERSONNE (`Id<"persons">`) ; aucune phrase du serveur sur un refus (le moteur rend une raison à code, l'écran de fin la traduit) ; erreur traduite (`callErrorMessage(err, t)`) ; journal sans portée (`scope` retiré : le moteur ne connaît que des appels de personne à personne) ; réseau courant par `useNetwork()` ; CC-5 : lignes d'appel contextuel rouvertes par leur conversation (`onOpenContextualThread`), jamais rappelées par `callMember`.
"use client"

/**
 * IcomAppelJournal — le JOURNAL des appels, câblé pour rappeler.
 *
 * `IappelJournal` (tranche `iappel`) ne sait que METTRE EN FORME l'historique :
 * il ne passe aucun appel lui-même et reçoit le geste « rappeler » en prop.
 * Ce wrapper est ce geste, et il vit dans `messagerie` parce que c'est la
 * brique iAppel qui monte le journal — la tranche `iappel` n'a pas à connaître
 * la messagerie.
 *
 * ⚠️ Rappeler vise la PERSONNE (`target: { personId }`) et non un identifiant
 * public : une entrée de journal porte la personne en face, jamais un handle.
 * Le refus suit le même contrat que partout ailleurs — une VALEUR de retour
 * (`admitted: false`), pas une exception : une exception annulerait la
 * transaction qui vient d'inscrire l'appel refusé au journal.
 */

import { api } from "@antsia/api/engine"
import type { Id } from "@antsia/api/engine"
import { useNetwork } from "@antsia/api/network"
import { useConvex, useConvexAuth, useMutation } from "convex/react"
import { useRef, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { callErrorMessage } from "../iappel/call-errors"
import { useCallStore } from "../../stores/call-store"
import { IappelJournal } from "../iappel/IappelJournal"
import { refusalEndKind } from "../iappel/call-phase"
import type { IappelJournalProps } from "../iappel/IappelJournal"
import { useConversationSend } from "./use-conversation-send"

export function IcomAppelJournal({
  leadingControls,
  commercial = false,
  onOpenCommercialThread,
  onOpenContextualThread,
  family,
}: {
  /** Contrôles de niveau iAppel, rendus sur la même ligne que ses filtres. */
  leadingControls?: ReactNode
  commercial?: boolean
  onOpenCommercialThread?: IappelJournalProps["onCommercialWrite"]
  /**
   * CC-5 : ouvrir la conversation contextuelle d'une ligne d'appel (`contextualThreadId`) — c'est
   * par elle qu'on rappelle (accord et cible relus). Absent, ces lignes n'offrent aucun geste.
   */
  onOpenContextualThread?: (threadId: string) => void
  /** ADR-0036 : la famille d'appels affichée (iCom ou iCom Pro) ; absente, tout le journal. */
  family?: IappelJournalProps["family"]
} = {}) {
  const { t } = useTranslation("messagerie")
  const { networkId, personId: viewerPersonId } = useNetwork()
  const { isAuthenticated } = useConvexAuth()
  const context = useConversationSend(JSON.stringify([networkId, viewerPersonId]), "call-journal", isAuthenticated)
  const convex = useConvex()
  const call = useMutation(api.modules.calls.direct.callMember)
  const commercialCall = useMutation(api.modules.commercialMessaging.calls.startCall)
  const { openOutgoingCall, openRefusedCall } = useCallStore()
  const lock = useRef(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const callBack = async (input: {
    userId: string
    name: string
    mediaType: "audio" | "video"
    commercialThreadId?: NonNullable<Parameters<NonNullable<IappelJournalProps["onCommercialCallBack"]>>[0]["threadId"]>
  }) => {
    if (lock.current || !context.isCurrent()) return
    if (input.commercialThreadId !== undefined && !commercial) return
    lock.current = true
    setPending(true)
    setError(null)
    // L'entrée de journal porte la PERSONNE en face (nom de champ historique).
    const personId = input.userId as Id<"persons">
    try {
      const thread = input.commercialThreadId === undefined ? null : await convex.query(api.modules.commercialMessaging.threads.getThread, { networkId, threadId: input.commercialThreadId })
      if (!context.isCurrent()) return
      if (input.commercialThreadId !== undefined && (!thread || !thread.capabilities.canCall || (thread.viewerKind === "requester" && !thread.respondents.some((item) => item.personId === personId && item.callConsent)))) {
        setError(t("errors:policyRefused"))
        return
      }
      const appel = input.commercialThreadId === undefined ? await call({ networkId, target: { personId }, mediaType: input.mediaType }) : await commercialCall({ networkId, threadId: input.commercialThreadId, ...(thread?.viewerKind === "requester" ? { respondentPersonId: personId } : {}), mediaType: input.mediaType })
      if (!context.isCurrent()) return
      const callee = { userId: appel.calleePersonId, name: input.name, avatarUrl: null }

      // Le correspondant peut avoir écarté l'appel (ne pas déranger, ligne
      // occupée, hors de ses relations). L'écran de FIN plutôt qu'un toast :
      // il dit la raison, et il laisse déposer un message vocal quand la
      // raison le permet.
      if (appel.admitted === false) {
        openRefusedCall({
          meetingId: appel.callId,
          mediaType: input.mediaType,
          endKind: refusalEndKind(appel.reason),
          voicemailOffered: input.commercialThreadId === undefined && appel.voicemailOffered,
          scope: "personnel",
          callee,
        })
        return
      }

      // La fenêtre d'appel est montée par la coque dès que le store porte
      // l'appel : ce composant ne rend aucune salle.
      openOutgoingCall({
        meetingId: appel.callId,
        participantUserId: appel.calleePersonId,
        mediaType: appel.mediaType,
        startedAt: Date.now(),
        scope: "personnel",
        callee,
      })
    } catch (err) {
      if (context.isCurrent()) { const message = callErrorMessage(err, t); setError(message); toast.error(message, { duration: 8000 }) }
    } finally {
      lock.current = false
      if (context.isCurrent()) setPending(false)
    }
  }

  return (
    <>{error ? <p role="alert" className="p-3 text-sm text-destructive">{error}</p> : null}<IappelJournal
      leadingControls={leadingControls}
      callPending={pending}
      family={family}
      onCommercialWrite={commercial ? onOpenCommercialThread : undefined}
      onCommercialCallBack={commercial ? (input) => { void callBack({ userId: input.counterpartPersonId, name: input.name, mediaType: input.mediaType, commercialThreadId: input.threadId }) } : undefined}
      onContextualOpen={onOpenContextualThread === undefined ? undefined : (threadId) => onOpenContextualThread(String(threadId))}
      onCallBack={(input) => {
        void callBack(input)
      }}
    /></>
  )
}
