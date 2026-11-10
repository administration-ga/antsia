"use client"

import { api } from "@antsia/api/engine"
import { engineErrorCode } from "@antsia/social-contracts/errors"
import { FILE_GUARD_MAX_INSPECT_BYTES, FILE_SCAN_STATUSES, type FileScanStatus, isUnanalyzedUpload, isWithinInspectCeiling } from "@antsia/social-domain/filePolicy"
import { megabytes } from "@antsia/social-domain/violation"
import { Badge, Button } from "@antsia/ui"
import { useMutation, useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { FileSearch } from "lucide-react"
import { type ReactNode, useState } from "react"
import { useTranslation } from "react-i18next"

import { ConsoleDate, ConsoleQueryBoundary, controlStyle, EmptyRows, LoadingRows, MotiveAction, panelClass, useOperationDraftGuard, useWindowCursor, WindowPagination } from "./console-operation-controls"

type FileScanRow = FunctionReturnType<typeof api.modules.files.queries.listForConsole>["page"][number]
type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger"

/** Les fichiers RETENUS par un verdict ou une panne : seuls ceux-là se relancent depuis la console. */
const REQUEUEABLE_STATUSES: readonly FileScanStatus[] = ["error", "suspicious", "infected"]
/** La file ouverte par défaut : les fichiers figés après les tentatives (panne de l'antivirus). */
const DEFAULT_STATUS: FileScanStatus = "error"
const PAGE_OPTIONS = { numItems: 20, maximumRowsRead: 50, maximumBytesRead: 262_144 } as const
const MIO = 1024 * 1024

function toneOf(scan: Pick<FileScanRow, "status" | "skipReason">): BadgeTone {
  switch (scan.status) {
    case "clean": return "success"
    case "infected": return "danger"
    case "suspicious":
    case "error": return "warning"
    case "skipped": return isUnanalyzedUpload(scan) ? "warning" : "info"
    case "pending":
    case "running": return "neutral"
  }
}

/** Une lecture refusée n'est pas une panne : la session d'opérateur a pu expirer. */
function FilesFailure({ error, retry }: { error: unknown; retry: () => void }) {
  const { t } = useTranslation("operations")
  const code = engineErrorCode(error)
  const denied = code === "operatorRequired" || code === "unauthenticated"
  return <div className="flex min-w-0 flex-col gap-3 rounded-lg border border-destructive p-4">
    <p role="alert" className="text-sm">{t(denied ? "files.denied" : "files.loadFailed")}</p>
    <Button type="button" variant="outline" style={controlStyle} onClick={retry}>{t("files.retry")}</Button>
  </div>
}

function FileStats({ selected, onSelect }: { selected: FileScanStatus; onSelect: (status: FileScanStatus) => void }) {
  const { t, i18n } = useTranslation("operations")
  const stats = useQuery(api.modules.files.queries.stats, {})
  if (stats === undefined) return <LoadingRows />
  const number = new Intl.NumberFormat(i18n.language)
  const byStatus = new Map(stats.byStatus.map((row) => [row.status, row]))
  return <div className="flex min-w-0 flex-col gap-3">
    <div role="group" aria-label={t("files.filter")} className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
      {FILE_SCAN_STATUSES.map((status) => {
        const row = byStatus.get(status)
        const count = row === undefined ? t("files.countUnknown") : row.sampled ? t("files.atLeast", { count: number.format(row.count) }) : number.format(row.count)
        const active = status === selected
        return <button key={status} type="button" aria-pressed={active} onClick={() => onSelect(status)} style={{ minHeight: 44 }} className={"flex min-w-0 flex-col items-start gap-1 rounded-lg border p-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 " + (active ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted")}>
          <span className={"text-sm " + (active ? "" : "text-muted-foreground")}>{t(`files.filters.${status}`)}</span>
          <span className="text-2xl font-semibold tabular-nums">{count}</span>
        </button>
      })}
    </div>
    <p className="text-xs text-muted-foreground">{t("files.sampleHint", { cap: number.format(stats.sampleCap) })}</p>
  </div>
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return <div className="min-w-0"><dt className="text-muted-foreground">{label}</dt><dd className="break-words">{children}</dd></div>
}

function FileRow({ scan }: { scan: FileScanRow }) {
  const { t, i18n } = useTranslation("operations")
  const requeue = useMutation(api.modules.files.mutations.requeueScan)
  const number = new Intl.NumberFormat(i18n.language)
  const megabytes = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 })
  const retained = REQUEUEABLE_STATUSES.includes(scan.status)
  // Au-delà du plafond d'analyse, l'analyse sauterait le fichier : la relance n'a pas d'objet (refusée au serveur).
  const analyzable = scan.sizeBytes === undefined || isWithinInspectCeiling(scan.sizeBytes)
  const reason = scan.verdictReason ?? scan.skipReason
  return <li className="flex min-w-0 flex-col gap-3 rounded-lg border border-border p-4">
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <h3 className="min-w-0 break-all font-semibold">{scan.filename ?? t("files.unnamed")}</h3>
      <Badge tone={toneOf(scan)}>{t(`files.statuses.${scan.status}`)}</Badge>
    </div>
    <dl className="grid min-w-0 grid-cols-1 gap-2 text-sm sm:grid-cols-2 xl:grid-cols-3">
      <Fact label={t("files.fields.source")}>{t(`files.sources.${scan.source}`)}</Fact>
      <Fact label={t("files.fields.size")}>{scan.sizeBytes === undefined ? t("files.sizeUnknown") : t("files.size", { value: megabytes.format(scan.sizeBytes / MIO) })}</Fact>
      <Fact label={t("files.fields.attempts")}>{number.format(scan.attempts)}</Fact>
      <Fact label={t("files.fields.reason")}>{reason === undefined ? t("files.noReason") : <code className="break-all font-mono text-xs">{reason}</code>}</Fact>
      <Fact label={t("files.fields.created")}><ConsoleDate at={scan.createdAt} /></Fact>
      <Fact label={t("files.fields.updated")}><ConsoleDate at={scan.updatedAt} /></Fact>
    </dl>
    {scan.status === "skipped" ? <p className="text-sm text-muted-foreground">{t(isUnanalyzedUpload(scan) ? "files.skippedWithheld" : "files.skippedGenerated")}</p> : null}
    {retained && !analyzable ? <p className="text-sm text-muted-foreground">{t("files.tooLargeForAnalysis")}</p> : null}
    {retained && analyzable ? <MotiveAction label={t("files.requeue")} successKey="files.requeued" onDecision={(motive) => requeue({ scanId: scan._id, reason: motive })} /> : null}
  </li>
}

/** Une liste par statut : la changer repart de la première page (clé du composant). */
function FileList({ status }: { status: FileScanStatus }) {
  const { t } = useTranslation("operations")
  const window = useWindowCursor()
  const result = useQuery(api.modules.files.queries.listForConsole, { status, paginationOpts: { cursor: window.cursor, ...PAGE_OPTIONS } })
  const label = t(`files.filters.${status}`)
  return <section aria-label={t("files.listLabel", { status: label })} className="flex min-w-0 flex-col gap-4">
    <h3 className="text-lg font-semibold">{t("files.listTitle", { status: label })}</h3>
    {result === undefined ? <LoadingRows /> : result.page.length === 0 ? <EmptyRows done={result.isDone} /> : <ul className="flex min-w-0 flex-col gap-4">{result.page.map((scan) => <FileRow key={scan._id} scan={scan} />)}</ul>}
    <WindowPagination window={window} result={result} />
  </section>
}

/**
 * Console « Fichiers » (EX-17) : la file des fichiers sous garde, tous réseaux.
 * Compteurs par statut, liste paginée, relance MOTIVÉE d'un fichier retenu
 * (`requeueScan`, écrite au journal). La libération par un modérateur du réseau
 * relève d'un autre écran.
 */
export function FilesPanel() {
  const { t } = useTranslation("operations")
  const [status, setStatus] = useState<FileScanStatus>(DEFAULT_STATUS)
  const canChange = useOperationDraftGuard()
  const select = (next: FileScanStatus) => { if (next !== status && canChange()) setStatus(next) }
  return <section className={`${panelClass} flex min-w-0 flex-col gap-5`}>
    <h2 className="flex items-center gap-2 text-xl font-semibold"><FileSearch size={22} aria-hidden="true" />{t("files.title")}</h2>
    <p className="text-sm text-muted-foreground">{t("files.lead", { max: megabytes(FILE_GUARD_MAX_INSPECT_BYTES) })}</p>
    <ConsoleQueryBoundary fallback={(error, retry) => <FilesFailure error={error} retry={retry} />}><FileStats selected={status} onSelect={select} /></ConsoleQueryBoundary>
    <ConsoleQueryBoundary key={status} fallback={(error, retry) => <FilesFailure error={error} retry={retry} />}><FileList key={status} status={status} /></ConsoleQueryBoundary>
  </section>
}
