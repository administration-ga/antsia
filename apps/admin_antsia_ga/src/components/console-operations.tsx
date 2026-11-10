"use client"

import type { Id } from "@antsia/api/engine"
import { useTranslation } from "react-i18next"

import { AppealsPanel } from "./console-appeals"
import { AuditPanel } from "./console-audit"
import { ExportPanel } from "./console-export"
import { FederationPanel } from "./console-federation"
import { FilesPanel } from "./console-files"
import { HealthPanel } from "./console-health"
import { IncidentsPanel } from "./console-incidents"
import { NetworkRolesPanel } from "./console-network-roles"
import { OperationDraftProvider } from "./console-operation-controls"
import { PagesPanel } from "./console-pages"
import { TeamsPanel } from "./console-teams"

export type OperationsSection = "teams" | "appeals" | "federation" | "pages" | "incidents" | "audit" | "health" | "files" | "export"
/** Les sections qui couvrent toute la plateforme : elles s'ouvrent sans réseau choisi. */
const PLATFORM_SECTIONS: readonly OperationsSection[] = ["incidents", "audit", "files"]
export type OperationsPanelProps = { section: OperationsSection; networkId?: Id<"networks">; canAdmin: boolean; onDirtyChange?: (dirty: boolean) => void; onPendingChange?: (pending: boolean) => void }

/** La clé détruit curseurs et brouillons au changement de périmètre, avant toute nouvelle lecture. */
export function OperationsPanel({ section, networkId, canAdmin, onDirtyChange, onPendingChange }: OperationsPanelProps) {
  const { t } = useTranslation("operations")
  if (!PLATFORM_SECTIONS.includes(section) && networkId === undefined) return <p role="status" className="rounded-xl border border-border bg-card p-5 text-muted-foreground">{t("common.selectNetwork")}</p>
  return <OperationDraftProvider key={`${section}:${networkId ?? "global"}`} onDirtyChange={onDirtyChange} onPendingChange={onPendingChange}><OperationSection section={section} networkId={networkId} canAdmin={canAdmin} /></OperationDraftProvider>
}

function OperationSection({ section, networkId, canAdmin }: OperationsPanelProps) {
  switch (section) {
    // EX-08 : les responsables du réseau précèdent ses équipes de modération, dans la même section.
    case "teams": return networkId ? <div className="flex min-w-0 flex-col gap-5"><NetworkRolesPanel networkId={networkId} canAdmin={canAdmin} /><TeamsPanel networkId={networkId} /></div> : null
    case "appeals": return networkId ? <AppealsPanel networkId={networkId} /> : null
    case "federation": return networkId ? <FederationPanel networkId={networkId} canAdmin={canAdmin} /> : null
    case "pages": return networkId ? <PagesPanel networkId={networkId} canAdmin={canAdmin} /> : null
    case "incidents": return <IncidentsPanel networkId={networkId} />
    case "audit": return <AuditPanel networkId={networkId} />
    case "health": return networkId ? <HealthPanel networkId={networkId} /> : null
    case "files": return <FilesPanel />
    case "export": return networkId ? <ExportPanel networkId={networkId} /> : null
  }
}
