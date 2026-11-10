"use client"

/**
 * PG-01 (plan 07) — « Revendications de pages » : la file de la modération du réseau
 * (`pages.claims.paginatePageClaims`, la plus ancienne d'abord), la fiche d'une demande
 * (`getPageClaim` : pièces servies par la garde des fichiers, retenues dites comme telles) et la
 * décision motivée (`decidePageClaim`), confirmée avant envoi car définitive. Le serveur dit si
 * le lecteur peut trancher (`canDecide`) : jamais le demandeur ni un signataire de la page. Le
 * badge de la page est CALCULÉ par le moteur ; la décision change la confiance, le badge suit.
 */
import { api, type Id } from "@antsia/api/engine"
import { formatViewerDate } from "@antsia/api/civil-date"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import { useViewerTimeZone } from "@antsia/api/viewer-preferences"
import { DECISION_REASON_MAX } from "@antsia/social-domain/audit"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import Link from "next/link"
import { useId, useState } from "react"
import { useForm, useWatch } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { Button, Field, TextArea } from "@/components/shared/controls"
import { SCREEN_SECTIONS } from "@/components/shared/screen-layout"
import { routes } from "@/lib/routes"
import { useDecisionOperation } from "./moderation-forms"
import { useModerationDraft, useModerationGuard } from "./moderation-guard"
import { isPageClaimQueueStatus, PAGE_CLAIM_QUEUE_STATUSES, pageClaimDecisionInput, pageClaimDecisionSchema, pageClaimEvidenceView, type PageClaimDecisionForm, type PageClaimQueueStatus } from "./page-claims-model"

type ClaimRow = FunctionReturnType<typeof api.modules.pages.claims.paginatePageClaims>["page"][number]

const CARD = "flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:p-5"
const LINK = "inline-flex min-h-11 items-center self-start rounded-lg px-3 text-sm underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
const SELECT = "min-h-11 w-full rounded-[var(--esp-field-radius)] border border-input bg-muted px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

function useClaimDate() {
  const { i18n } = useTranslation("memberNetwork")
  const timeZone = useViewerTimeZone()
  return (at: number) => formatViewerDate(at, i18n.language, { dateStyle: "medium", timeStyle: "short" }, timeZone)
}

/** La file des revendications d'un réseau, paginée ; l'état choisi repart de la première page. */
export function PageClaimRows({ cursor, onFirst, onNext }: { cursor: string | null; onFirst: () => void; onNext: (cursor: string) => void }) {
  const { t } = useTranslation("memberNetwork")
  const { networkId } = useNetwork()
  const guard = useModerationGuard()
  const statusId = useId()
  const headingId = useId()
  const [status, setStatus] = useState<PageClaimQueueStatus>("pending")
  const claims = useAuthenticatedConvexQuery(api.modules.pages.claims.paginatePageClaims, { networkId, status, paginationOpts: { numItems: 20, cursor, maximumRowsRead: 50, maximumBytesRead: 262_144 } })
  const choose = (value: string) => {
    if (!isPageClaimQueueStatus(value) || value === status || !guard.canLeave()) return
    setStatus(value)
    if (cursor) onFirst()
  }
  return <section aria-labelledby={headingId} className="flex min-w-0 flex-col gap-4">
    <header className="flex flex-col gap-1">
      <h2 id={headingId} className="text-xl font-semibold">{t("moderation.pageClaims.title")}</h2>
      <p className="text-sm text-muted-foreground">{t("moderation.pageClaims.lead")}</p>
    </header>
    <Field id={statusId} label={t("moderation.pageClaims.status")}>
      <select id={statusId} value={status} disabled={guard.pending} className={SELECT} onChange={(event) => choose(event.target.value)}>
        {PAGE_CLAIM_QUEUE_STATUSES.map((value) => <option key={value} value={value}>{t(`moderation.pageClaims.statuses.${value}`)}</option>)}
      </select>
    </Field>
    {claims.error
      ? <div role="alert" className="rounded-xl border border-destructive p-4"><p>{t("common.failed")}</p><Button variant="outline" onClick={() => void claims.refetch()}>{t("common.retry")}</Button></div>
      : !claims.data
        ? <p role="status">{t("common.loading")}</p>
        : <>
          {claims.data.page.length === 0 ? <p role="status" className="rounded-xl border border-border bg-card p-5 text-muted-foreground">{t(claims.data.isDone ? "moderation.pageClaims.empty" : "moderation.emptyWindow")}</p> : null}
          {claims.data.page.map((claim) => <PageClaimArticle key={claim.claimId} claim={claim} />)}
          <nav aria-label={t("moderation.pagination")} className="flex flex-wrap items-center justify-between gap-2">
            {cursor ? <Button variant="outline" disabled={guard.pending} onClick={onFirst}>{t("common.firstPage")}</Button> : <span />}
            {!claims.data.isDone ? <Button variant="outline" disabled={guard.pending || !claims.data.continueCursor || claims.data.continueCursor === cursor} onClick={() => onNext(claims.data!.continueCursor)}>{t("common.next")}</Button> : <p role="status" className="text-sm text-muted-foreground">{t("common.end")}</p>}
          </nav>
        </>}
  </section>
}

/** Une demande de la file : la page (badge calculé), le demandeur, la date, la note ; la fiche s'ouvre sur demande. */
export function PageClaimArticle({ claim }: { claim: ClaimRow }) {
  const { t } = useTranslation("memberNetwork")
  const date = useClaimDate()
  const detailId = useId()
  const [open, setOpen] = useState(false)
  const guard = useModerationGuard()
  const claimant = claim.claimant.displayName?.trim() || claim.claimant.handle || t("moderation.pageClaims.neutralClaimant")
  return <article className={CARD}>
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <h3 className="break-words text-lg font-semibold">{claim.page.name}</h3>
      <span className="rounded-full border border-border px-2 py-0.5 text-xs font-medium">{t(`moderation.pageClaims.badges.${claim.page.badge}`, { defaultValue: t("moderation.pageClaims.badges.community") })}</span>
      <span className="text-sm text-muted-foreground">{t(`moderation.pageClaims.ownerKinds.${claim.page.ownerKind}`)}</span>
    </div>
    <p className="break-words text-sm">{t("moderation.pageClaims.claimant", { name: claimant })}</p>
    <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
      <time dateTime={new Date(claim.createdAt).toISOString()}>{t("moderation.pageClaims.submittedAt", { date: date(claim.createdAt) })}</time>
      <span>{t(`moderation.pageClaims.statusLabel.${claim.status}`)}</span>
      <span>{t("moderation.pageClaims.evidenceCount", { count: claim.evidenceCount })}</span>
    </p>
    <p className="break-words whitespace-pre-wrap text-sm">{claim.note ? t("moderation.pageClaims.note", { note: claim.note }) : t("moderation.pageClaims.noNote")}</p>
    <div className="flex flex-wrap items-center gap-2">
      <Link href={routes.page(claim.page.handle)} className={LINK}>{t("moderation.pageClaims.openPage")}</Link>
      <Button variant="outline" aria-expanded={open} aria-controls={open ? detailId : undefined} onClick={() => { if (!open || guard.canLeave()) setOpen((value) => !value) }}>{t(open ? "moderation.pageClaims.closeDetail" : "moderation.pageClaims.instruct")}</Button>
    </div>
    {open ? <div id={detailId}><PageClaimDetail claimId={claim.claimId} /></div> : null}
  </article>
}

/** La fiche : pièces par la garde (retenue dite comme telle), décision prise, ou formulaire de décision. */
export function PageClaimDetail({ claimId }: { claimId: Id<"pageClaims"> }) {
  const { t } = useTranslation("memberNetwork")
  const { networkId } = useNetwork()
  const date = useClaimDate()
  const headingId = useId()
  const detail = useAuthenticatedConvexQuery(api.modules.pages.claims.getPageClaim, { networkId, claimId })
  if (detail.error) return <div role="alert" className="rounded-xl border border-destructive p-4"><p>{t("common.failed")}</p><Button variant="outline" onClick={() => void detail.refetch()}>{t("common.retry")}</Button></div>
  if (!detail.data) return <p role="status">{t("common.loading")}</p>
  const claim = detail.data
  const decided = claim.status === "approved" || claim.status === "rejected"
  return <section aria-labelledby={headingId} className={`${SCREEN_SECTIONS} gap-y-4 border-t border-border pt-4`}>
    <h4 id={headingId} className="col-span-full font-semibold">{t("moderation.pageClaims.detailTitle")}</h4>
    <div className="flex flex-col gap-2">
      <h5 className="text-sm font-semibold">{t("moderation.pageClaims.evidenceTitle")}</h5>
      {claim.evidence.length === 0
        ? <p className="text-sm text-muted-foreground">{t(decided ? "moderation.pageClaims.evidencePurged" : "moderation.pageClaims.evidenceNone")}</p>
        : <ul className="flex flex-col gap-2">{claim.evidence.map((entry, index) => {
          const view = pageClaimEvidenceView(entry)
          return <li key={index} className="text-sm">
            {view.kind === "open"
              ? <a href={view.url} target="_blank" rel="noopener noreferrer" className={LINK}>{t("moderation.pageClaims.evidenceOpen", { index: index + 1 })}</a>
              : <p role="status" className="rounded-lg border border-border bg-muted p-3">{t(`moderation.pageClaims.evidenceWithheld.${view.code}`, { index: index + 1 })}</p>}
          </li>
        })}</ul>}
    </div>
    <div className="flex flex-col gap-2">
      {decided
        ? <>
          <p className="font-medium">{t(`moderation.pageClaims.statusLabel.${claim.status}`)}</p>
          {claim.decidedAt !== null ? <p className="text-sm text-muted-foreground"><time dateTime={new Date(claim.decidedAt).toISOString()}>{t("moderation.pageClaims.decidedAt", { date: date(claim.decidedAt) })}</time></p> : null}
          {claim.decisionReason ? <p className="break-words whitespace-pre-wrap text-sm">{t("moderation.pageClaims.decisionReason", { reason: claim.decisionReason })}</p> : null}
        </>
        : claim.status !== "pending"
          ? <p className="text-sm text-muted-foreground">{t(`moderation.pageClaims.statusLabel.${claim.status}`)}</p>
          : claim.canDecide === true
            ? <PageClaimDecision claimId={claimId} />
            : <p role="status" className="rounded-[var(--ui2-card-radius)] border border-transparent bg-muted p-4 text-sm">{t("moderation.pageClaims.anotherDecider")}</p>}
    </div>
  </section>
}

/** Valider ou refuser, motif obligatoire, confirmation avant l'envoi : la décision est définitive. */
export function PageClaimDecision({ claimId }: { claimId: Id<"pageClaims"> }) {
  const { t } = useTranslation("memberNetwork")
  const { networkId } = useNetwork()
  const decide = useMutation(api.modules.pages.claims.decidePageClaim)
  const { run, pending, error, errorRef } = useDecisionOperation()
  const id = useId()
  const form = useForm<PageClaimDecisionForm>({ resolver: zodResolver(pageClaimDecisionSchema(t("moderation.reasonInvalid", { min: 3, max: DECISION_REASON_MAX }))), defaultValues: { decision: "approved", reason: "" } })
  const decision = useWatch({ control: form.control, name: "decision" })
  useModerationDraft(form.formState.isDirty)
  return <form className="flex min-w-0 flex-col gap-3" noValidate onSubmit={form.handleSubmit((value) => run(
    () => decide({ networkId, ...pageClaimDecisionInput(claimId, value) }),
    () => form.reset(),
    () => window.confirm(t(`moderation.pageClaims.confirm.${value.decision}`)),
  ))}>
    <fieldset disabled={pending} className="flex min-w-0 flex-col gap-3">
      <Field id={`${id}-decision`} label={t("moderation.pageClaims.decision")}>
        <select id={`${id}-decision`} {...form.register("decision")} className={SELECT}>
          <option value="approved">{t("moderation.pageClaims.decisions.approved")}</option>
          <option value="rejected">{t("moderation.pageClaims.decisions.rejected")}</option>
        </select>
      </Field>
      <Field id={`${id}-reason`} label={t("moderation.reason")} error={form.formState.errors.reason?.message}>
        <TextArea id={`${id}-reason`} maxLength={DECISION_REASON_MAX} aria-invalid={!!form.formState.errors.reason} aria-describedby={form.formState.errors.reason ? `${id}-reason-error` : undefined} {...form.register("reason")} />
      </Field>
      <Button type="submit" variant={decision === "approved" ? "success" : "danger"} pending={pending}>{t(`moderation.pageClaims.submit.${decision}`)}</Button>
    </fieldset>
    {error ? <p ref={errorRef} role="alert" tabIndex={-1} className="rounded-[var(--ui2-card-radius)] border border-destructive p-4 text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{error}</p> : null}
  </form>
}
