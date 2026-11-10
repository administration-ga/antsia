"use client"

import { formatViewerDate } from "@antsia/api/civil-date"
import { useViewerTimeZone } from "@antsia/api/viewer-preferences"
import { isSigningOutEverywhere } from "@antsia/api/sign-out-everywhere"
import { engineErrorCode, engineErrorRule } from "@antsia/social-contracts/errors"
import { Button, Field, TextArea } from "@antsia/ui"
import { zodResolver } from "@hookform/resolvers/zod"
import type { TFunction } from "i18next"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Component, createContext, Fragment, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { z } from "zod"

export const controlStyle = { minHeight: 44, whiteSpace: "normal" as const }
export const inputStyle = { minHeight: 44 }
export const panelClass = "min-w-0 rounded-xl border border-border bg-card p-4 sm:p-6"

/** Les erreurs Convex traversent le rendu ; une panne n'est jamais un refus métier. */
export class ConsoleQueryBoundary extends Component<{ children: ReactNode; fallback: (error: unknown, retry: () => void) => ReactNode }, { caught: boolean; error: unknown; attempt: number }> {
  override state = { caught: false, error: null as unknown, attempt: 0 }
  static getDerivedStateFromError(error: unknown) { return { caught: true, error } }
  override render() {
    return this.state.caught ? this.props.fallback(this.state.error, () => this.setState((state) => ({ caught: false, error: null, attempt: state.attempt + 1 }))) : <Fragment key={this.state.attempt}>{this.props.children}</Fragment>
  }
}

type DraftRegistry = { set: (id: string, dirty: boolean, pending?: boolean) => void; remove: (id: string) => void; isDirty: () => boolean; isPending: () => boolean }
const OperationDraftContext = createContext<DraftRegistry | null>(null)

/** Une ligne par formulaire : nettoyer un brouillon ne masque jamais ceux de ses voisins. */
export function OperationDraftProvider({ onDirtyChange, onPendingChange, children }: { onDirtyChange?: (dirty: boolean) => void; onPendingChange?: (pending: boolean) => void; children: ReactNode }) {
  const { t } = useTranslation("operations")
  const drafts = useRef(new Set<string>())
  const pendingDrafts = useRef(new Set<string>())
  const callbacks = useRef({ onDirtyChange, onPendingChange })
  const [dirty, setDirty] = useState(false)
  const [pending, setPending] = useState(false)
  const registry = useMemo<DraftRegistry>(() => ({
    set: (id, changed, pending = false) => {
      if (changed) drafts.current.add(id)
      else drafts.current.delete(id)
      if (pending) pendingDrafts.current.add(id)
      else pendingDrafts.current.delete(id)
      setDirty(drafts.current.size > 0 || pendingDrafts.current.size > 0)
      setPending(pendingDrafts.current.size > 0)
    },
    remove: (id) => {
      drafts.current.delete(id)
      pendingDrafts.current.delete(id)
      setDirty(drafts.current.size > 0 || pendingDrafts.current.size > 0)
      setPending(pendingDrafts.current.size > 0)
    },
    isDirty: () => drafts.current.size > 0,
    isPending: () => pendingDrafts.current.size > 0,
  }), [])
  useEffect(() => {
    callbacks.current = { onDirtyChange, onPendingChange }
    onDirtyChange?.(dirty)
    onPendingChange?.(pending)
  }, [dirty, pending, onDirtyChange, onPendingChange])
  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => {
      if ((drafts.current.size === 0 && pendingDrafts.current.size === 0) || isSigningOutEverywhere()) return
      event.preventDefault()
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", leave)
    return () => { window.removeEventListener("beforeunload", leave); callbacks.current.onDirtyChange?.(false); callbacks.current.onPendingChange?.(false) }
  }, [])
  return <OperationDraftContext.Provider value={registry}>
    {dirty ? <p role="status" className="mb-4 rounded-lg border border-border bg-muted p-3 text-sm">{t("common.draftNotice")}</p> : null}
    {children}
  </OperationDraftContext.Provider>
}

export function useOperationDraft(dirty: boolean, pending = false) {
  const id = useId()
  const registry = useContext(OperationDraftContext)
  useEffect(() => { registry?.set(id, dirty, pending) }, [id, dirty, pending, registry])
  useEffect(() => () => { registry?.remove(id) }, [id, registry])
}

/** Les changements internes suivent la même règle que la navigation du cadre. */
export function useOperationDraftGuard() {
  const { t } = useTranslation("operations")
  const registry = useContext(OperationDraftContext)
  return () => {
    if (registry?.isPending()) { toast.info(t("common.pendingChangeBlocked")); return false }
    return !registry?.isDirty() || window.confirm(t("common.discardDraftConfirm"))
  }
}

export function operationError(error: unknown, t: TFunction): string {
  const rule = engineErrorRule(error)
  if (rule) return t(`rules:${rule.rule}`, rule.params)
  const code = engineErrorCode(error)
  return code ? t(`errors:${code}`) : t("operations:common.failed")
}

/** Un verrou synchrone protège également le délai entre deux rendus React. */
export function useOperation() {
  const { t } = useTranslation("operations")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const locked = useRef(false)
  const live = useRef(true)
  const registry = useContext(OperationDraftContext)
  const operationId = useId()
  useEffect(() => { live.current = true; return () => { live.current = false; registry?.remove(operationId) } }, [operationId, registry])
  const run = async <Result,>(task: () => Promise<Result>, successKey: string | null = "common.saved", onSuccess?: (result: Result) => void) => {
    if (locked.current || !live.current) return false
    locked.current = true
    registry?.set(operationId, false, true)
    setPending(true)
    setError(null)
    try {
      const result = await task()
      if (!live.current) return false
      onSuccess?.(result)
      if (successKey) toast.success(t(successKey))
      return true
    } catch (failure) {
      if (live.current) {
        const message = operationError(failure, t)
        setError(message)
        toast.error(message)
      }
      return false
    } finally {
      locked.current = false
      registry?.remove(operationId)
      if (live.current) setPending(false)
    }
  }
  return { pending, error, run }
}

export function OperationFailure({ message }: { message: string | null }) {
  const ref = useRef<HTMLParagraphElement>(null)
  useEffect(() => { if (message) ref.current?.focus() }, [message])
  return message ? <p ref={ref} tabIndex={-1} role="alert" className="rounded-lg border border-destructive p-3 text-sm text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{message}</p> : null
}

export function LoadingRows() {
  const { t } = useTranslation("operations")
  return <p role="status" className="p-4 text-sm text-muted-foreground">{t("common.loading")}</p>
}

export function EmptyRows({ done = true }: { done?: boolean }) {
  const { t } = useTranslation("operations")
  return <p role="status" className="p-4 text-sm text-muted-foreground">{t(done ? "common.empty" : "common.emptyWindow")}</p>
}

export function ConsoleDate({ at }: { at: number }) {
  const { i18n } = useTranslation("operations")
  const zone = useViewerTimeZone()
  return <time dateTime={new Date(at).toISOString()}>{formatViewerDate(at, i18n.language, { dateStyle: "medium", timeStyle: "short" }, zone)}</time>
}

export function useWindowCursor() {
  const [history, setHistory] = useState<(string | null)[]>([null])
  const cursor = history[history.length - 1] ?? null
  const canChange = useOperationDraftGuard()
  return {
    cursor,
    canPrevious: history.length > 1,
    previous: () => { if (history.length > 1 && canChange()) setHistory((values) => values.length > 1 ? values.slice(0, -1) : values) },
    next: (nextCursor: string) => { if (nextCursor !== cursor && canChange()) setHistory((values) => values.at(-1) === nextCursor ? values : [...values, nextCursor]) },
  }
}

export function WindowPagination({ window, result }: { window: ReturnType<typeof useWindowCursor>; result: { isDone: boolean; continueCursor: string } | undefined }) {
  const { t } = useTranslation("operations")
  return <nav aria-label={t("common.pagination")} className="flex flex-wrap gap-2 border-t border-border pt-4">
    <Button variant="outline" style={controlStyle} disabled={!window.canPrevious || !result} onClick={window.previous}><ChevronLeft size={16} aria-hidden="true" />{t("common.previous")}</Button>
    <Button variant="outline" style={controlStyle} disabled={!result || result.isDone || result.continueCursor === window.cursor} onClick={() => { if (result && !result.isDone && result.continueCursor !== window.cursor) window.next(result.continueCursor) }}><ChevronRight size={16} aria-hidden="true" />{t("common.next")}</Button>
  </nav>
}

export function reasonSchema(message: string, min = 3) { return z.string().trim().min(min, message).max(500, message) }

/** Chaque décision est relue et motivée dans un formulaire distinct de son déclencheur. */
export function MotiveAction<Result>({ label, onDecision, onSuccess, disabled = false, minLength = 3, danger = false, successKey = "common.saved" }: { label: string; onDecision: (reason: string) => Promise<Result>; onSuccess?: (result: Result) => void; disabled?: boolean; minLength?: number; danger?: boolean; successKey?: string | null }) {
  const { t } = useTranslation("operations")
  const [open, setOpen] = useState(false)
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const notice = useRef<HTMLParagraphElement>(null)
  const reasonInput = useRef<HTMLTextAreaElement>(null)
  const focusRequested = useRef(false)
  const operation = useOperation()
  const form = useForm<{ reason: string }>({ resolver: zodResolver(z.object({ reason: reasonSchema(t("common.reasonInvalid", { min: minLength }), minLength) })), defaultValues: { reason: "" } })
  useOperationDraft(open && (form.formState.isDirty || form.formState.isSubmitting || operation.pending), form.formState.isSubmitting || operation.pending)
  const reasonField = form.register("reason")
  useEffect(() => {
    if (!open || !focusRequested.current) return
    focusRequested.current = false
    const desktop = typeof window.matchMedia === "function" ? window.matchMedia("(min-width: 960px)").matches : window.innerWidth >= 960
    if (desktop) reasonInput.current?.focus({ preventScroll: true })
    else notice.current?.focus()
  }, [open])
  const close = () => { setOpen(false); form.reset(); trigger.current?.focus() }
  const submit = async ({ reason }: { reason: string }) => {
    if (disabled) return
    if (await operation.run(() => onDecision(reason), successKey, onSuccess)) close()
  }
  return <div className="flex min-w-0 flex-col gap-3">
    <Button ref={trigger} type="button" variant={danger ? "danger" : "outline"} style={controlStyle} disabled={disabled || operation.pending} aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => { if (!open) { focusRequested.current = true; setOpen(true) } }}>{label}</Button>
    {open ? <form id={id} noValidate className="flex min-w-0 flex-col gap-3 rounded-lg border border-border p-3" aria-label={label} aria-busy={operation.pending || undefined} onSubmit={(event) => { void form.handleSubmit(submit)(event) }}>
      <p ref={notice} tabIndex={-1} className="text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{t("common.confirmAction", { action: label })}</p>
      <Field htmlFor={`${id}-reason`} label={t("common.reason")} required error={form.formState.errors.reason?.message} hint={t("common.reasonHint")}><TextArea id={`${id}-reason`} disabled={operation.pending || disabled} maxLength={500} {...reasonField} ref={(node) => { reasonField.ref(node); reasonInput.current = node }} /></Field>
      <OperationFailure message={operation.error} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant={danger ? "danger" : "primary"} style={controlStyle} disabled={operation.pending || disabled}>{t(operation.pending ? "common.saving" : "common.confirm")}</Button>
        <Button type="button" variant="ghost" style={controlStyle} disabled={operation.pending} onClick={close}>{t("common.cancel")}</Button>
      </div>
    </form> : null}
  </div>
}
