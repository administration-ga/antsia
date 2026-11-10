// Dupliqué de socle/packages/agent-features/src/features/direct/DirectExitDialog.tsx @ ad2e7fdc2 — adaptations : droits moteur, réseau, dialogue partagé avec focus/Échap, sorties explicites et i18n.
"use client"
import { themedActionStyle } from "../themed-action-style"
import { api } from "@antsia/api/engine"
import { useNetwork } from "@antsia/api/network"
import { Button } from "@antsia/ui"
import { EspaceDialog } from "@antsia/ui/espace-kit"
import { useMutation } from "convex/react"
import { useTranslation } from "react-i18next"
import type { DirectSession } from "./DirectPage"
import { useDirectCommand } from "./use-direct-command"

export function DirectExitDialog({ session, onLeave, onCancel }: { session: DirectSession; onLeave: () => void; onCancel: () => void }) {
  const { t } = useTranslation("direct")
  const { networkId } = useNetwork()
  const end = useMutation(api.modules.live.sessions.end)
  const command = useDirectCommand()
  return <EspaceDialog title={t("floating.leaveTitle")} description={t(session.viewerRole === "host" ? "floating.hostLeaveDescription" : "floating.speakerLeaveDescription")} closeLabel={t("keep")} onClose={command.pending ? () => undefined : onCancel}>
    <div className="flex flex-wrap gap-3">
      {session.permissions.endOrTransfer ? <Button style={themedActionStyle("danger", "primary")} variant="danger" disabled={command.pending} onClick={() => void (async () => { if (await command.run(() => end({ networkId, sessionId: session.sessionId }))) onLeave() })()}>{t("floating.endForAll")}</Button> : null}
      <Button variant="ghost" disabled={command.pending} onClick={onLeave}>{t(session.viewerRole === "host" ? "floating.leaveKeepLive" : "floating.leaveStage")}</Button>
      <Button style={themedActionStyle("cancel", "ghost")} variant="outline" disabled={command.pending} onClick={onCancel}>{t("keep")}</Button>
    </div>
    {command.error ? <p role="alert">{command.error}</p> : null}
  </EspaceDialog>
}
