"use client"

import { formatViewerDate } from "@antsia/api/civil-date"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useViewerTimeZone } from "@antsia/api/viewer-preferences"
import { zodResolver } from "@hookform/resolvers/zod"
import { api } from "@convex/_generated/api"
import { useMutation } from "convex/react"
import Link from "next/link"
import { useCallback, useEffect, useId, useRef, useState } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { z } from "zod"

import { Button, Card } from "./shared/controls"
import { engineErrorMessage } from "@/lib/engine-errors"
import { routes } from "@/lib/routes"

/** L'accord porte sur le texte présenté, jamais sur une identité saisie par le client. */
export function publicAgentConsentSchema(requiredMessage: string) {
  return z.object({ accepted: z.boolean().refine((accepted) => accepted, requiredMessage) })
}

type ConsentValues = z.infer<ReturnType<typeof publicAgentConsentSchema>>
type ConsentOperation = "grant" | "withdraw"
type Operation = ConsentOperation | "prepare"
type PreparedTransfer = { url: string; expiresAt: number; scope: string }
const MAX_TRANSFER_LIFETIME_MS = 10 * 60_000

/** Défense de présentation ; la destination est déjà filtrée par le serveur. */
function safePreparedTransfer(input: { url: string; expiresAt: number }): { url: string; expiresAt: number } | null {
  const now = Date.now()
  if (!Number.isSafeInteger(input.expiresAt) || input.expiresAt <= now) return null
  try {
    const url = new URL(input.url)
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    if (url.username || url.password || (url.protocol !== "https:" && !(url.protocol === "http:" && loopback))) return null
    return { url: url.href, expiresAt: input.expiresAt }
  } catch { return null }
}

/** Hors coque membre : retirer cet accord reste possible après suspension. */
export function PublicAgentControls() {
  const { t, i18n } = useTranslation("antsia")
  const timeZone = useViewerTimeZone()
  const consent = useAuthenticatedConvexQuery(api.modules.federation.agents.getMyAgentConsent, {})
  const person = useAuthenticatedConvexQuery(api.modules.people.persons.getMyPerson, {})
  const grant = useMutation(api.modules.federation.agents.grant)
  const withdraw = useMutation(api.modules.federation.agents.withdraw)
  const prepareTransfer = useMutation(api.modules.federation.agents.prepareTransfer)
  const state = consent.data
  const id = useId()
  const failureRef = useRef<HTMLParagraphElement>(null)
  const busy = useRef(false)
  const operationRef = useRef<Operation | null>(null)
  const transferAttempt = useRef(0)
  const acceptedVersion = useRef<string | null>(null)
  const [operation, setOperation] = useState<Operation | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [preparedTransfer, setPreparedTransfer] = useState<PreparedTransfer | null>(null)
  const [transferExpired, setTransferExpired] = useState(false)
  const form = useForm<ConsentValues>({
    resolver: zodResolver(publicAgentConsentSchema(t("publicAgent.consentRequired"))),
    defaultValues: { accepted: false },
  })
  const { reset } = form
  const hasCurrentConsent = state?.status === "active" || state?.status === "waiting"
  const transferScope = state && person.data ? `${person.data._id}:${state.version}:${state.grantedAt}:${state.revokedAt}` : null
  const transferScopeRef = useRef(transferScope)
  transferScopeRef.current = transferScope
  const canPrepareTransfer = Boolean(state?.available && state.eligible && hasCurrentConsent && person.data && !person.isError && !consent.isError)
  const clearTransfer = useCallback(() => {
    transferAttempt.current += 1
    setPreparedTransfer(null)
    setTransferExpired(false)
    // Une préparation retardée ne doit jamais empêcher le retrait de l'accord.
    if (operationRef.current === "prepare") {
      busy.current = false
      operationRef.current = null
      setOperation(null)
    }
  }, [])

  useEffect(() => {
    acceptedVersion.current = null
    reset({ accepted: false })
  }, [state?.version, reset])

  useEffect(() => { clearTransfer() }, [transferScope, canPrepareTransfer, clearTransfer])
  useEffect(() => () => { transferAttempt.current += 1 }, [])
  useEffect(() => {
    if (!preparedTransfer) return
    const timer = setTimeout(() => {
      setPreparedTransfer(null)
      setTransferExpired(true)
    }, Math.max(0, Math.min(preparedTransfer.expiresAt - Date.now(), MAX_TRANSFER_LIFETIME_MS)))
    return () => clearTimeout(timer)
  }, [preparedTransfer])

  useEffect(() => {
    if (failure) failureRef.current?.focus()
  }, [failure])

  // Ni l'indisponibilité de la source ni l'éligibilité ne ferment le retrait.
  const canWithdraw = Boolean(state && state.grantedAt !== null && state.revokedAt === null)
  const canGrant = Boolean(state?.eligible && state.available && !hasCurrentConsent && !canWithdraw && !consent.isError)
  const pending = operation !== null || form.formState.isSubmitting
  const consentPending = operation === "grant" || operation === "withdraw" || form.formState.isSubmitting
  const visibleTransfer = preparedTransfer && preparedTransfer.scope === transferScope && canPrepareTransfer && preparedTransfer.expiresAt > Date.now() ? preparedTransfer : null

  async function changeConsent(kind: ConsentOperation) {
    if (kind === "withdraw" && canWithdraw && operationRef.current === "prepare") clearTransfer()
    if (busy.current || !state) return
    if (kind === "withdraw" && !canWithdraw) return
    if (kind === "grant") {
      if (!canGrant) return
      if (acceptedVersion.current !== state.version) {
        acceptedVersion.current = null
        reset({ accepted: false })
        setFailure(t("publicAgent.versionChanged"))
        return
      }
    }
    clearTransfer()
    busy.current = true
    operationRef.current = kind
    setOperation(kind)
    setFailure(null)
    try {
      if (kind === "grant") await grant({ accepted: true, textVersion: state.version })
      else await withdraw({})
      acceptedVersion.current = null
      reset({ accepted: false })
      toast.success(t(kind === "grant" ? "publicAgent.granted" : "publicAgent.withdrawn"))
    } catch (error) {
      const message = engineErrorMessage(error, t)
      setFailure(message)
      toast.error(message)
    } finally {
      busy.current = false
      operationRef.current = null
      setOperation(null)
    }
  }

  async function prepareContinuation() {
    if (busy.current || !canPrepareTransfer || !transferScope) return
    clearTransfer()
    const attempt = ++transferAttempt.current
    const scope = transferScope
    busy.current = true
    operationRef.current = "prepare"
    setOperation("prepare")
    setFailure(null)
    try {
      const result = await prepareTransfer({})
      if (attempt !== transferAttempt.current || scope !== transferScopeRef.current) return
      const safe = safePreparedTransfer(result)
      if (!safe) { setFailure(t("publicAgent.transferFailed")); return }
      // Le lien reste en mémoire et n'est ouvert que par un nouveau clic explicite.
      setPreparedTransfer({ ...safe, scope })
    } catch (error) {
      if (attempt !== transferAttempt.current || scope !== transferScopeRef.current) return
      setFailure(engineErrorMessage(error, t))
    } finally {
      if (attempt === transferAttempt.current && operationRef.current === "prepare") {
        busy.current = false
        operationRef.current = null
        setOperation(null)
      }
    }
  }

  const date = (timestamp: number) => formatViewerDate(timestamp, i18n.language, { dateStyle: "long", timeStyle: "short" }, timeZone)

  return (
    <Card className="min-w-0">
      <div className="flex min-w-0 flex-col gap-4 [overflow-wrap:anywhere]">
        <div className="flex flex-col gap-2">
          <h2 id={`${id}-title`} className="text-xl font-semibold">{t("publicAgent.title")}</h2>
          <p id={`${id}-lead`} className="text-sm text-muted-foreground">{t("publicAgent.lead")}</p>
          <p className="text-sm text-muted-foreground">{t("publicAgent.independent")}</p>
        </div>
        {consent.isError ? (
          <div className="flex flex-col items-start gap-2">
            <p role="alert" className="text-sm text-destructive">{t("publicAgent.loadFailed")}</p>
            <Button variant="outline" pending={consent.isFetching} disabled={pending} onClick={() => { void consent.refetch() }}>{t("publicAgent.retry")}</Button>
          </div>
        ) : null}
        {!state && !consent.isError ? <p role="status" className="text-sm text-muted-foreground">{t("publicAgent.loading")}</p> : null}
        {state ? (
          <>
            <p role="status" className="text-sm">{t(`publicAgent.statuses.${state.status}`)}</p>
            {state.available && !state.eligible ? <p className="text-sm text-muted-foreground">{t("publicAgent.idnRequired")}</p> : null}
            {!state.available ? <p className="text-sm text-muted-foreground">{t("publicAgent.sourceUnavailable")}</p> : null}
            <dl className="grid min-w-0 gap-2 text-sm">
              <div><dt className="font-medium">{t("publicAgent.versionLabel")}</dt><dd>{state.version}</dd></div>
              {state.grantedAt !== null ? <div><dt className="font-medium">{t("publicAgent.grantedAtLabel")}</dt><dd>{date(state.grantedAt)}</dd></div> : null}
              {state.revokedAt !== null ? <div><dt className="font-medium">{t("publicAgent.revokedAtLabel")}</dt><dd>{date(state.revokedAt)}</dd></div> : null}
            </dl>
            {state.status === "active" && state.affiliation ? (
              <dl className="grid min-w-0 gap-2 rounded-[var(--ui2-card-radius)] border border-border p-[var(--esp-card-padding,16px)] text-sm">
                <div><dt className="font-medium">{t("publicAgent.administrationLabel")}</dt><dd><Link href={routes.officialPage(state.affiliation.administrationHandle)} prefetch={false} className="inline-flex min-h-11 items-center font-medium text-primary underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">{state.affiliation.administrationName}</Link></dd></div>
                <div><dt className="font-medium">{t("publicAgent.roleLabel")}</dt><dd>{state.affiliation.roleLabel}</dd></div>
              </dl>
            ) : null}
            {!hasCurrentConsent && !canWithdraw ? (
              <form aria-labelledby={`${id}-title`} aria-describedby={`${id}-lead`} aria-busy={pending || undefined} className="flex flex-col items-start gap-3" noValidate onSubmit={form.handleSubmit(() => changeConsent("grant"))}>
                <label htmlFor={`${id}-accepted`} className="flex min-h-11 items-start gap-3 text-sm">
                  <input
                    id={`${id}-accepted`}
                    type="checkbox"
                    className="mt-0.5 size-5 shrink-0 accent-primary"
                    disabled={pending || !canGrant}
                    aria-invalid={form.formState.errors.accepted ? true : undefined}
                    aria-describedby={`${id}-lead${form.formState.errors.accepted ? ` ${id}-accepted-error` : ""}`}
                    {...form.register("accepted", { onChange: (event: { target: { checked: boolean } }) => { acceptedVersion.current = event.target.checked ? state.version : null } })}
                  />
                  <span>{t("publicAgent.consentLabel")}</span>
                </label>
                {form.formState.errors.accepted ? <p id={`${id}-accepted-error`} role="alert" className="text-sm text-destructive">{form.formState.errors.accepted.message}</p> : null}
                <Button type="submit" pending={pending} disabled={!canGrant}>{t("publicAgent.grant")}</Button>
              </form>
            ) : null}
            {hasCurrentConsent ? <div className="flex flex-col items-start gap-3 rounded-[var(--ui2-card-radius)] border border-border p-[var(--esp-card-padding,16px)]">
              <p className="text-sm text-muted-foreground">{t("publicAgent.transferLead")}</p>
              <Button variant="outline" pending={operation === "prepare"} disabled={pending || !canPrepareTransfer} onClick={() => { void prepareContinuation() }}>{t("publicAgent.prepareTransfer")}</Button>
              {visibleTransfer ? <>
                <p role="status" className="text-sm text-muted-foreground">{t("publicAgent.transferExpires", { date: date(visibleTransfer.expiresAt) })}</p>
                <a href={visibleTransfer.url} target="_self" className="inline-flex min-h-11 items-center font-medium text-primary underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring" onClick={(event) => {
                  if (visibleTransfer.scope !== transferScopeRef.current || visibleTransfer.expiresAt <= Date.now()) {
                    event.preventDefault()
                    clearTransfer()
                    setTransferExpired(true)
                  }
                }}>{t("publicAgent.openTransfer")}</a>
              </> : null}
              {transferExpired ? <p role="status" className="text-sm text-muted-foreground">{t("publicAgent.transferExpired")}</p> : null}
            </div> : null}
            {canWithdraw ? <Button className="self-start" variant="outline" pending={operation === "withdraw"} disabled={consentPending} onClick={() => { void changeConsent("withdraw") }}>{t("publicAgent.withdraw")}</Button> : null}
          </>
        ) : null}
        {failure ? <p ref={failureRef} tabIndex={-1} role="alert" className="text-sm text-destructive focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">{failure}</p> : null}
      </div>
    </Card>
  )
}
