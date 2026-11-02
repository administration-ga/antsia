"use client"

import { canonicalTimeZone } from "@antsia/api/civil-date"
import { useViewerTimeZone } from "@antsia/api/viewer-preferences"
import { isSigningOutEverywhere } from "@antsia/api/sign-out-everywhere"
import { isSupportedLocale } from "@antsia/social-features/i18n"
import { zodResolver } from "@hookform/resolvers/zod"
import { api } from "@convex/_generated/api"
import { useMutation, useQuery } from "convex/react"
import { useEffect, useId, useRef } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { z } from "zod"

import { DisplayPreferences } from "./display-preferences"
import { Button, Card, Field, TextInput } from "./shared/controls"
import { engineErrorMessage } from "@/lib/engine-errors"

/** La même validation et canonisation que le provider ; le serveur reste l'arbitre. */
export function personalPreferencesSchema(labels: { invalidLocale: string; invalidTimeZone: string }) {
  return z.object({
    locale: z.enum(["fr", "en"], { errorMap: () => ({ message: labels.invalidLocale }) }),
    timeZone: z.string().trim().min(1, labels.invalidTimeZone).max(100, labels.invalidTimeZone)
      .refine((value) => canonicalTimeZone(value) !== null, labels.invalidTimeZone)
      .transform((value) => canonicalTimeZone(value) ?? value),
  })
}

type PreferenceValues = z.infer<ReturnType<typeof personalPreferencesSchema>>

function samePreferences(a: PreferenceValues, b: PreferenceValues): boolean {
  return a.locale === b.locale && a.timeZone === b.timeZone
}

/**
 * Réglages personnels explicites : une nouvelle lecture ne remplace jamais un brouillon.
 * `complete` (« Mes données ») : langue, fuseau et affichage ; `language` (page
 * Paramètres, qui présente l'affichage à part) : la langue et le fuseau seuls.
 */
export function PreferencesControls({ variant = "complete" }: { variant?: "complete" | "language" }) {
  const { t, i18n } = useTranslation("antsia")
  const viewerTimeZone = useViewerTimeZone()
  const person = useQuery(api.modules.people.persons.getMyPerson, {})
  const setPreferences = useMutation(api.modules.people.preferences.setMyPreferences)
  const id = useId()
  const localeId = `${id}-locale`
  const timeZoneId = `${id}-time-zone`
  const titleId = `${id}-title`
  const errorId = `${id}-error`
  const failureRef = useRef<HTMLParagraphElement>(null)
  const localeRef = useRef<HTMLSelectElement>(null)
  const timeZoneRef = useRef<HTMLInputElement>(null)
  const saving = useRef(false)
  // Un ancien snapshot peut encore être rendu après la réponse à la mutation.
  // Attendre l'écho des valeurs enregistrées évite de réafficher ce snapshot.
  const expectedEcho = useRef<PreferenceValues | null>(null)
  const language = isSupportedLocale(i18n.language) ? i18n.language : "fr"
  const snapshotLocale = person?.locale ?? language
  const snapshotTimeZone = canonicalTimeZone(person?.timeZone) ?? viewerTimeZone
  const form = useForm<PreferenceValues>({
    resolver: zodResolver(personalPreferencesSchema({ invalidLocale: t("preferences.invalidLocale"), invalidTimeZone: t("preferences.invalidTimeZone") })),
    defaultValues: { locale: snapshotLocale, timeZone: snapshotTimeZone },
    // Les champs sont désactivés pendant la validation : le focus intervient
    // après leur réactivation, plutôt que dans la réponse du resolver.
    shouldFocusError: false,
  })
  const { errors, isDirty, isSubmitting, submitCount } = form.formState
  const { getValues, reset } = form
  const localeField = form.register("locale")
  const timeZoneField = form.register("timeZone")

  useEffect(() => {
    if (isSubmitting || submitCount === 0) return
    const invalidField = errors.locale?.message ? localeRef.current : errors.timeZone?.message ? timeZoneRef.current : null
    invalidField?.focus({ preventScroll: true })
  }, [errors.locale?.message, errors.timeZone?.message, isSubmitting, submitCount])

  useEffect(() => {
    if (!person || isDirty || isSubmitting || saving.current) return
    const snapshot: PreferenceValues = { locale: snapshotLocale, timeZone: snapshotTimeZone }
    if (expectedEcho.current && !samePreferences(expectedEcho.current, snapshot)) return
    expectedEcho.current = null
    if (!samePreferences(getValues(), snapshot)) reset(snapshot)
  }, [person?._id, snapshotLocale, snapshotTimeZone, isDirty, isSubmitting, person, getValues, reset])

  useEffect(() => {
    if (errors.root?.server) failureRef.current?.focus()
  }, [errors.root?.server])

  useEffect(() => {
    if (!isDirty) return
    const leaveDocument = (event: BeforeUnloadEvent) => {
      if (isSigningOutEverywhere()) return
      event.preventDefault()
      event.returnValue = ""
    }
    const leaveRoute = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      if (!(event.target instanceof Element)) return
      const link = event.target.closest<HTMLAnchorElement>("a[href]")
      if (!link || link.hasAttribute("download") || (link.target && link.target !== "_self")) return
      let destination: URL
      try { destination = new URL(link.href, window.location.href) }
      catch { return }
      // Les filtres, ancres et ouvertures séparées ne quittent pas ce formulaire.
      if (destination.origin !== window.location.origin || destination.pathname === window.location.pathname) return
      if (!window.confirm(t("preferences.leaveConfirm"))) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    window.addEventListener("beforeunload", leaveDocument)
    document.addEventListener("click", leaveRoute, true)
    return () => {
      window.removeEventListener("beforeunload", leaveDocument)
      document.removeEventListener("click", leaveRoute, true)
    }
  }, [isDirty, t])

  const savePreferences = async (values: PreferenceValues) => {
    if (!person || saving.current) return
    saving.current = true
    form.clearErrors("root.server")
    try {
      await setPreferences(values)
      expectedEcho.current = values
      reset(values)
      toast.success(t("preferences.saved"))
    } catch (error) {
      const message = engineErrorMessage(error, t)
      form.setError("root.server", { type: "server", message })
      toast.error(message)
    } finally {
      saving.current = false
    }
  }

  return (
    <Card className="min-w-0">
      <div className="flex min-w-0 flex-col gap-5 [overflow-wrap:anywhere]">
        <div className="flex flex-col gap-2">
          <h2 id={titleId} className="text-xl font-semibold">{t(variant === "complete" ? "preferences.title" : "preferences.languageTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("preferences.lead")}</p>
        </div>
        {isDirty ? <p role="status" className="rounded-[var(--ui2-card-radius)] border border-transparent bg-muted p-[var(--esp-card-padding,16px)] text-sm">{t("preferences.unsaved")}</p> : null}
        {!person ? <p role="status" className="text-sm text-muted-foreground">{t("preferences.loading")}</p> : null}
        <form aria-labelledby={titleId} aria-busy={isSubmitting || undefined} aria-describedby={errors.root?.server ? errorId : undefined} onSubmit={(event) => { void form.handleSubmit(savePreferences)(event) }} noValidate className="flex min-w-0 flex-col gap-4">
          <fieldset disabled={isSubmitting || !person} className="flex min-w-0 flex-col gap-4">
            <Field id={localeId} label={t("preferences.localeLabel")} hint={t("preferences.localeHint")} error={errors.locale?.message}>
              <select
                id={localeId}
                className="min-h-11 min-w-0 w-full rounded-[var(--esp-field-radius)] border border-input bg-muted px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[invalid=true]:border-destructive"
                aria-invalid={errors.locale ? true : undefined}
                aria-describedby={`${localeId}-hint${errors.locale ? ` ${localeId}-error` : ""}`}
                {...localeField}
                ref={(element) => { localeRef.current = element; localeField.ref(element) }}
              >
                <option value="fr">{t("preferences.french")}</option>
                <option value="en">{t("preferences.english")}</option>
              </select>
            </Field>
            <Field id={timeZoneId} label={t("preferences.timeZoneLabel")} hint={t("preferences.timeZoneHint")} error={errors.timeZone?.message}>
              <TextInput
                id={timeZoneId}
                maxLength={100}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                className="min-w-0"
                aria-invalid={errors.timeZone ? true : undefined}
                aria-describedby={`${timeZoneId}-hint${errors.timeZone ? ` ${timeZoneId}-error` : ""}`}
                {...timeZoneField}
                ref={(element) => { timeZoneRef.current = element; timeZoneField.ref(element) }}
              />
            </Field>
          </fieldset>
          {errors.root?.server ? <p ref={failureRef} id={errorId} role="alert" tabIndex={-1} className="rounded-[var(--ui2-card-radius)] border border-destructive p-[var(--esp-card-padding,16px)] text-sm text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{errors.root.server.message}</p> : null}
          <Button type="submit" pending={isSubmitting} disabled={!person} className="w-full whitespace-normal sm:w-auto sm:self-start">{t(isSubmitting ? "preferences.saving" : "preferences.save")}</Button>
        </form>
        {variant === "complete" ? <DisplayPreferences /> : null}
      </div>
    </Card>
  )
}
