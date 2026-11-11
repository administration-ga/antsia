"use client"

import { api, type Id } from "@antsia/api/engine"
import { Button } from "@antsia/ui"
import { useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { ScrollText } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { ConsoleDate, controlStyle, EmptyRows, LoadingRows, panelClass, useWindowCursor, WindowPagination } from "./console-operation-controls"

type Subject = FunctionReturnType<typeof api.modules.platform.audit.paginateAudit>["page"][number]["subject"]
function AuditWindow({ networkId, subject, selectSubject }: { networkId?: Id<"networks">; subject: Subject | null; selectSubject: (subject: Subject) => void }) {
  const { t } = useTranslation("operations")
  const window = useWindowCursor()
  const options = { cursor: window.cursor, numItems: 20, maximumRowsRead: 50, maximumBytesRead: 262_144 }
  const general = useQuery(api.modules.platform.audit.paginateAudit, subject === null ? { ...(networkId === undefined ? {} : { networkId }), paginationOpts: options } : "skip")
  const subjectEntries = useQuery(api.modules.platform.audit.paginateSubjectAudit, subject ? { subjectTable: subject.table, subjectId: subject.id, paginationOpts: options } : "skip")
  const result = subject ? subjectEntries : general
  return <div className="flex min-w-0 flex-col gap-4">
    {result === undefined ? <LoadingRows /> : result.page.length === 0 ? <EmptyRows done={result.isDone} /> : <ol className="flex min-w-0 flex-col gap-4">{result.page.map((entry) => <li key={entry.auditId} className="flex min-w-0 flex-col gap-3 rounded-lg border border-border p-4">
      <p className="break-words font-mono text-sm">{entry.action}</p>
      <p className="break-words text-sm">{entry.actor?.displayName ?? t(entry.capacity === "system" ? "audit.system" : "audit.hiddenActor")} · <span className="font-mono text-xs" translate="no">{entry.capacity}</span></p>
      <p className="text-xs text-muted-foreground"><ConsoleDate at={entry.at} /></p>
      <p className="text-xs text-muted-foreground">{t("audit.subjectType", { table: entry.subject.table })}</p>
      {typeof entry.details?.reason === "string" ? <p className="whitespace-pre-wrap break-words text-sm">{entry.details.reason}</p> : null}
      {typeof entry.details?.orderReference === "string" ? <p className="break-words text-sm">{t("audit.orderReference", { reference: entry.details.orderReference })}</p> : null}
      {!subject ? <Button variant="outline" style={controlStyle} onClick={() => selectSubject(entry.subject)}>{t("audit.subjectHistory")}</Button> : null}
    </li>)}</ol>}
    <WindowPagination window={window} result={result} />
  </div>
}

export function AuditPanel({ networkId }: { networkId?: Id<"networks"> }) {
  const { t } = useTranslation("operations")
  const [subject, setSubject] = useState<Subject | null>(null)
  return <section className={`${panelClass} flex min-w-0 flex-col gap-4`}>
    <h2 className="flex items-center gap-2 text-xl font-semibold"><ScrollText size={22} aria-hidden="true" />{t("audit.title")}</h2>
    <p className="text-sm text-muted-foreground">{t(subject ? "audit.subjectLead" : networkId ? "audit.networkLead" : "audit.globalLead")}</p>
    {subject ? <Button variant="outline" style={controlStyle} onClick={() => setSubject(null)}>{t("audit.back")}</Button> : null}
    <AuditWindow key={subject ? `${subject.table}:${subject.id}` : "general"} networkId={networkId} subject={subject} selectSubject={setSubject} />
  </section>
}
