"use client"

import { api } from "@antsia/api/engine"
import { useNetwork } from "@antsia/api/network"
import { formatUtcOffset, wallTimeInstants, zonedWallTime } from "@antsia/social-domain/serviceTime"
import type { ServiceSlotsResult } from "@convex/modules/shops/serviceRules"
import { zodResolver } from "@hookform/resolvers/zod"
import { useAction } from "convex/react"
import { useCallback, useEffect, useId, useRef, useState } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"

import { Button, Field, TextInput } from "@/components/shared/controls"
import { useShopAction } from "@/components/shops/shop-ui"
import { useCheckoutClock } from "@/components/checkout/use-checkout-clock"
import { ServiceReviewNotice, useServiceReview } from "./service-intent-guard"
import {
  deviceTimeZone, displayTimeZones, jumpSchema, SERVICE_AGENDA_TIME_ZONE, serviceDateTime, serviceTime, serviceZoneName, slotsByDay, slotWindow,
  type JumpValues,
} from "./service-model"

export type PickedSlot = { startAt: number; endAt: number; resourceRef: string; resourceLabel: string | null }
const WINDOW_MS = slotWindow(0).toAt

/**
 * Créneaux libres servis par PRO.GA, fenêtre de sept jours. Les instants restent ceux de
 * PRO.GA ; le fuseau d'affichage est toujours nommé, et l'heure de l'agenda reste lisible.
 * Une heure saisie qui n'existe pas (ou existe deux fois) dans le fuseau choisi est dite.
 */
export function ServiceSlotPicker({ handle, offerRef, serviceRef, selected, onPick, disabled = false, onContextChange }: { handle: string; offerRef: string; serviceRef: string; selected: PickedSlot | null; onPick: (slot: PickedSlot) => void; disabled?: boolean; onContextChange?: () => void }) {
  const { networkId } = useNetwork()
  const { t, i18n } = useTranslation("services")
  const locale = i18n.resolvedLanguage ?? "fr"
  const id = useId()
  const load = useAction(api.modules.shops.serviceActions.slots)
  const action = useShopAction()
  const review = useServiceReview()
  const [now] = useState(() => Date.now())
  const [fromAt, setFromAt] = useState(now)
  const [zones] = useState(() => displayTimeZones(deviceTimeZone(), now))
  // Fuseau d'AFFICHAGE : celui de l'agenda au départ, puis tout fuseau IANA proposé (appareil).
  const [zone, setZone] = useState<string>(SERVICE_AGENDA_TIME_ZONE)
  const [response, setResponse] = useState<{ stamp: string; result: ServiceSlotsResult } | null>(null)
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState(false)
  const epoch = useRef(0)
  const loadedStamp = useRef<string | null>(null)
  const stamp = JSON.stringify([networkId, handle, offerRef, serviceRef, fromAt, zone, review.generation])
  const currentStamp = useRef(stamp); currentStamp.current = stamp
  const contextChanged = useRef(onContextChange); contextChanged.current = onContextChange
  const [ambiguous, setAmbiguous] = useState<number[]>([])
  const [jumpError, setJumpError] = useState<string | null>(null)
  const read = useCallback(async () => {
    if (!navigator.onLine || disabled || !action.current()) return false
    const ticket = ++epoch.current
    const window = slotWindow(fromAt)
    setPending(true); setFailure(false); setResponse(null)
    try {
      const result = await load({ networkId, handle, offerRef, serviceRef, fromAt: window.fromAt, toAt: window.toAt })
      if (ticket !== epoch.current || currentStamp.current !== stamp || !action.current() || !navigator.onLine) return false
      if (result.outcome === "ready" && (result.serviceRef !== serviceRef || result.fromAt < window.fromAt || result.toAt > window.toAt || result.fromAt >= result.toAt)) { setFailure(true); return false }
      setResponse({ stamp, result })
      if (result.outcome === "ready") loadedStamp.current = stamp
      return result.outcome === "ready"
    } catch { if (ticket === epoch.current && action.current()) setFailure(true); return false }
    finally { if (ticket === epoch.current && action.current()) setPending(false) }
  }, [action.current, disabled, fromAt, handle, load, networkId, offerRef, serviceRef, stamp])
  useEffect(() => { contextChanged.current?.() }, [stamp])
  useEffect(() => {
    if (!review.online || review.paused || disabled) { loadedStamp.current = null; setResponse(null); setPending(false) }
    else if (loadedStamp.current !== stamp) void read()
    return () => { epoch.current += 1 }
  }, [read, review.online, review.paused, disabled, stamp])
  const jump = useForm<JumpValues>({ resolver: zodResolver(jumpSchema(t)), defaultValues: { date: "", time: "" } })
  const goTo = jump.handleSubmit((values) => {
    if (disabled || pending || !review.online) return
    setAmbiguous([])
    setJumpError(null)
    const instants = wallTimeInstants(values.date, values.time, zone)
    if (instants.length === 0) { setJumpError(t("slots.nonexistent", { zone })); return }
    if (instants.length > 1) { setAmbiguous(instants); return }
    const [instant] = instants
    if (instant !== undefined) setFromAt(Math.max(instant, now))
  })
  const result = response?.stamp === stamp && !pending && !disabled && !review.paused ? response.result : null
  const ready = result?.outcome === "ready" ? result : null
  const firstFuture = ready?.slots.filter((slot) => slot.startAt > Date.now()).reduce<number | null>((next, slot) => next === null ? slot.startAt : Math.min(next, slot.startAt), null)
  const clock = useCheckoutClock(firstFuture)
  const paused = disabled || pending || !review.online || review.paused
  return <section aria-labelledby={`${id}-title`} className="grid gap-4">
    <ServiceReviewNotice review={review} onReview={read} />
    <h3 id={`${id}-title`} className="font-display text-base font-bold leading-snug">{t("slots.title")}</h3>
    {zones.length > 1 ? <fieldset className="grid gap-2"><legend className="text-sm font-medium">{t("slots.zone")}</legend>
      {zones.map((candidate) => <label key={candidate} className="flex min-h-11 items-center gap-3 text-sm"><input type="radio" name={`${id}-zone`} className="size-4" disabled={disabled || pending} checked={zone === candidate} onChange={() => setZone(candidate)} />{serviceZoneName(fromAt, candidate, locale)}</label>)}
    </fieldset> : <p className="text-sm text-muted-foreground">{t("slots.zoneOnly", { zone: serviceZoneName(fromAt, zone, locale) })}</p>}
    <form noValidate className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" onSubmit={goTo} aria-label={t("slots.jump")}>
      <Field id={`${id}-date`} label={t("slots.date")} error={jump.formState.errors.date?.message}><TextInput id={`${id}-date`} type="date" {...jump.register("date")} /></Field>
      <Field id={`${id}-time`} label={t("slots.time")} error={jump.formState.errors.time?.message}><TextInput id={`${id}-time`} type="time" {...jump.register("time")} /></Field>
      <Button type="submit" variant="outline" disabled={disabled || pending || !review.online}>{t("slots.jump")}</Button>
    </form>
    {jumpError ? <p role="alert" className="text-sm">{jumpError}</p> : null}
    {ambiguous.length > 1 ? <div role="alert" className="grid gap-2 rounded-[var(--ui2-card-radius)] border border-border p-4 text-sm"><p>{t("slots.ambiguous", { zone })}</p><div className="flex flex-wrap gap-2">{ambiguous.map((instant) => <Button key={instant} variant="outline" onClick={() => { setAmbiguous([]); setFromAt(Math.max(instant, now)) }}>{t("slots.ambiguousChoice", { time: serviceTime(instant, zone, locale), offset: formatUtcOffset(zonedWallTime(instant, zone)?.offsetMinutes ?? 0) })}</Button>)}</div></div> : null}
    <nav aria-label={t("slots.navigation")} className="flex flex-wrap gap-2">
      <Button variant="outline" disabled={paused || fromAt <= now} onClick={() => setFromAt((value) => Math.max(now, value - WINDOW_MS))}>{t("slots.previous")}</Button>
      <Button variant="outline" disabled={paused} onClick={() => setFromAt((value) => value + WINDOW_MS)}>{t("slots.next")}</Button>
    </nav>
    {pending ? <p role="status" className="text-sm text-muted-foreground">{t("slots.loading")}</p> : null}
    {!pending && result && result.outcome !== "ready" ? <p role="alert" className="text-sm">{t(result.outcome === "refused" ? "slots.refused" : "slots.unavailable")}</p> : null}
    {failure ? <p role="alert" className="text-sm">{t("slots.unavailable")}</p> : null}
    {failure || result && result.outcome !== "ready" ? <Button type="button" variant="outline" disabled={disabled || pending || !review.online} onClick={() => { void review.refresh(read) }}>{t("common.retry")}</Button> : null}
    {ready ? <div className="grid gap-3" aria-busy={pending || undefined}>
      <p className="text-sm text-muted-foreground">{t("slots.window", { from: serviceDateTime(ready.fromAt, zone, locale), to: serviceDateTime(ready.toAt, zone, locale) })}</p>
      {ready.slots.length === 0 ? <p className="rounded-[var(--ui2-card-radius)] border border-dashed border-border p-4 text-sm text-muted-foreground">{t("slots.empty")}</p> : slotsByDay(ready.slots, zone, locale).map((group) => <div key={group.day} className="grid gap-2">
        <h4 className="text-sm font-semibold">{group.day}</h4>
        <ul className="flex flex-wrap gap-2">{group.slots.map((slot) => {
          const picked = selected?.startAt === slot.startAt && selected.resourceRef === slot.resourceRef
          return <li key={`${slot.resourceRef}:${slot.startAt}`}><Button variant={picked ? "primary" : "outline"} disabled={paused || slot.startAt <= clock} aria-pressed={picked} onClick={() => { if (!paused && navigator.onLine && currentStamp.current === stamp && slot.startAt > Date.now()) onPick({ startAt: slot.startAt, endAt: slot.endAt, resourceRef: slot.resourceRef, resourceLabel: slot.resourceLabel }) }}>
            {slot.resourceLabel ? t("slots.slotWithResource", { time: serviceTime(slot.startAt, zone, locale), resource: slot.resourceLabel }) : serviceTime(slot.startAt, zone, locale)}
          </Button></li>
        })}</ul>
      </div>)}
      {ready.truncated ? <p className="text-xs text-muted-foreground">{t("slots.truncated")}</p> : null}
    </div> : null}
    {selected ? <SlotSummary slot={selected} zone={zone} /> : null}
  </section>
}

/** Le créneau choisi, dans le fuseau d'affichage ET dans celui de l'agenda s'ils diffèrent. */
export function SlotSummary({ slot, zone }: { slot: Pick<PickedSlot, "startAt" | "endAt" | "resourceLabel">; zone: string }) {
  const { t, i18n } = useTranslation("services")
  const locale = i18n.resolvedLanguage ?? "fr"
  return <div className="grid gap-1 rounded-[var(--ui2-card-radius)] border border-transparent bg-muted p-4 text-sm" role="status">
    <p className="font-medium">{t("slots.selected", { start: serviceDateTime(slot.startAt, zone, locale), end: serviceTime(slot.endAt, zone, locale) })}</p>
    <p className="text-muted-foreground">{serviceZoneName(slot.startAt, zone, locale)}</p>
    {zone !== SERVICE_AGENDA_TIME_ZONE ? <p className="text-muted-foreground">{t("slots.agendaTime", { start: serviceDateTime(slot.startAt, SERVICE_AGENDA_TIME_ZONE, locale), zone: serviceZoneName(slot.startAt, SERVICE_AGENDA_TIME_ZONE, locale) })}</p> : null}
    {slot.resourceLabel ? <p>{t("slots.resource", { resource: slot.resourceLabel })}</p> : null}
  </div>
}
