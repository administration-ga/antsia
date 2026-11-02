// Dupliqué de socle/packages/agent-features/src/features/direct/DirectSidePanel.tsx @ ad2e7fdc2 — adaptations : volets opt-in par droits serveur, aucune query de gestion chez un spectateur, montage réinitialisé au changement de réseau et session, disposition responsive et i18n.
"use client"

import { useNetwork } from "@antsia/api/network"
import { Button } from "@antsia/ui"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { DirectAntennaPanel, DirectMyAntenna } from "./DirectAntennaPanel"
import { DirectDelegationsPanel } from "./DirectDelegationsPanel"
import { DirectDiscussionPanel } from "./DirectDiscussionPanel"
import { DirectInviteesPanel } from "./DirectInviteesPanel"
import type { DirectSession } from "./DirectPage"
import { DirectParticipantsPanel } from "./DirectParticipantsPanel"

type Panel = "discussion" | "antenna" | "participants" | "delegations" | "guests"

export function directManagementPanels(session: DirectSession): Panel[] {
  const panels: Panel[] = []
  if (session.status === "live") {
    panels.push("discussion", "antenna")
    if (session.permissions.exclude || session.permissions.moderateChat) panels.push("participants")
  }
  if (session.status !== "ended") {
    if (session.permissions.delegate) panels.push("delegations")
    if (session.permissions.changeAudienceOrReplay) panels.push("guests")
  }
  return panels
}

export function DirectManagement({ session, admitted }: { session: DirectSession; admitted: boolean }) {
  const { networkId } = useNetwork()
  return <ManagementPanels key={`${networkId}:${session.sessionId}`} session={session} admitted={admitted} />
}

function ManagementPanels({ session, admitted }: { session: DirectSession; admitted: boolean }) {
  const { t } = useTranslation("direct")
  const [selected, setSelected] = useState<Panel | null>(null)
  const panels = directManagementPanels(session)
  // La permission retirée ne doit pas laisser vivre la query de l'ancien volet.
  const active = selected && panels.includes(selected) ? selected : null
  if (panels.length === 0) return null
  return <aside className="flex min-w-0 flex-col gap-4 rounded-[var(--esp-primitive-card-radius,0.75rem)] border border-[var(--esp-primitive-surface-border,var(--border))] bg-card p-4" aria-label={t("management.title")}>
    <nav aria-label={t("management.panels")} className="flex flex-wrap gap-2">{panels.map((panel) => <Button key={panel} variant="ghost" aria-expanded={active === panel} onClick={() => setSelected(active === panel ? null : panel)}>{t(`management.${panel}`)}</Button>)}</nav>
    {active ? <section aria-label={t(`management.${active}`)} className="flex min-w-0 flex-col gap-4">
      <h2 className="text-lg font-semibold">{t(`management.${active}`)}</h2>
      {active === "discussion" ? <DirectDiscussionPanel session={session} /> : null}
      {active === "antenna" ? <>
        {session.viewerRole !== "host" ? <DirectMyAntenna session={session} admitted={admitted} /> : null}
        {session.permissions.admitToStage ? <DirectAntennaPanel session={session} /> : null}
      </> : null}
      {active === "participants" ? <DirectParticipantsPanel session={session} /> : null}
      {active === "delegations" ? <DirectDelegationsPanel session={session} /> : null}
      {active === "guests" ? <DirectInviteesPanel session={session} /> : null}
    </section> : null}
  </aside>
}
