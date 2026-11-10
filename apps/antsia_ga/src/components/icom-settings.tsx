"use client"

/**
 * IC-04 — la rubrique « iCom » des Réglages : « Ne pas déranger » (la rangée `MyPresenceRow` du
 * moteur), qui peut m'appeler, accusés de lecture, messagerie vocale, double appel, présence et
 * réponses rapides. Les réglages sont ceux de la PERSONNE (`calls.preferences`, fonctions sur soi,
 * valables dans tous ses réseaux) ; chaque interrupteur a un effet serveur testé
 * (`convex/modules/calls/settings.test.ts`, `convex/modules/messaging/readReceipts.test.ts`).
 *
 * Seuls les champs CHANGÉS partent au moteur : une réponse rapide jamais réglée reste celle,
 * traduite, de l'écran (`quickReplies: null`), et une autre carte qui écrit d'autres champs
 * n'est jamais écrasée.
 */
import { api } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { MAX_QUICK_REPLIES, MAX_QUICK_REPLY_LENGTH, normalizeQuickReplies, OUTSIDE_RELATIONS_CALL_POLICIES, type OutsideRelationsCallPolicy } from "@antsia/social-contracts/calls"
import { DEFAULT_QUICK_REPLY_KEYS } from "@antsia/social-features/features/iappel/quick-replies"
import { MyPresenceRow } from "@antsia/social-features/shell"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import type { TFunction } from "i18next"
import { Plus, X } from "lucide-react"
import { useEffect, useId, useMemo, useRef, useState } from "react"
import { useFieldArray, useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { z } from "zod"

import { Button, Card, TextInput } from "@/components/shared/controls"
import { engineErrorMessage } from "@/lib/engine-errors"

/** Le pas de l'instant passé à la lecture : une minute, comme `MyPresenceRow` (même abonnement). */
const PREFS_NOW_STEP_MS = 60_000

type CallPreferences = FunctionReturnType<typeof api.modules.calls.preferences.getMine>

/** Le formulaire, validé comme le serveur borne (`normalizeQuickReplies`) : le serveur reste l'arbitre. */
export function icomSettingsSchema(labels: { quickReplyTooLong: string }) {
  return z.object({
    outsideRelationsCalls: z.enum(OUTSIDE_RELATIONS_CALL_POLICIES),
    readReceipts: z.boolean(),
    voicemailEnabled: z.boolean(),
    callWaiting: z.boolean(),
    sharePresence: z.boolean(),
    quickReplies: z
      .array(z.object({ text: z.string().refine((text) => text.trim().length <= MAX_QUICK_REPLY_LENGTH, labels.quickReplyTooLong) }))
      .max(MAX_QUICK_REPLIES),
  })
}

export type IcomSettingsValues = z.infer<ReturnType<typeof icomSettingsSchema>>

export type IcomSettingsPatch = {
  outsideRelationsCalls?: OutsideRelationsCallPolicy
  readReceipts?: boolean
  voicemailEnabled?: boolean
  callWaiting?: boolean
  sharePresence?: boolean
  quickReplies?: string[]
}

/** Les réponses rapides affichées : celles de la personne, ou celles de l'écran si elle n'en a jamais réglé. */
function shownQuickReplies(preferences: Pick<CallPreferences, "quickReplies">, t: TFunction): string[] {
  return preferences.quickReplies ?? DEFAULT_QUICK_REPLY_KEYS.map((key) => t(key))
}

/** Ce que le formulaire montre des réglages lus. */
export function icomSettingsValues(preferences: CallPreferences, t: TFunction): IcomSettingsValues {
  return {
    outsideRelationsCalls: preferences.outsideRelationsCalls,
    readReceipts: preferences.readReceipts,
    voicemailEnabled: preferences.voicemailEnabled,
    callWaiting: preferences.callWaiting,
    sharePresence: preferences.sharePresence,
    quickReplies: shownQuickReplies(preferences, t).map((text) => ({ text })),
  }
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index])
}

/**
 * Le patch envoyé à `calls.preferences.update` : seulement ce qui diffère de ce qui était montré.
 * Les réponses rapides partent nettoyées par la même règle que le serveur, et seulement si leur
 * liste nettoyée a changé.
 */
export function icomSettingsPatch(values: IcomSettingsValues, shown: IcomSettingsValues): IcomSettingsPatch {
  const replies = normalizeQuickReplies(values.quickReplies.map((reply) => reply.text))
  const shownReplies = normalizeQuickReplies(shown.quickReplies.map((reply) => reply.text))
  return {
    ...(values.outsideRelationsCalls !== shown.outsideRelationsCalls ? { outsideRelationsCalls: values.outsideRelationsCalls } : {}),
    ...(values.readReceipts !== shown.readReceipts ? { readReceipts: values.readReceipts } : {}),
    ...(values.voicemailEnabled !== shown.voicemailEnabled ? { voicemailEnabled: values.voicemailEnabled } : {}),
    ...(values.callWaiting !== shown.callWaiting ? { callWaiting: values.callWaiting } : {}),
    ...(values.sharePresence !== shown.sharePresence ? { sharePresence: values.sharePresence } : {}),
    ...(!sameList(replies, shownReplies) ? { quickReplies: replies } : {}),
  }
}

const CHOICE_CLASS = "flex min-h-11 items-start gap-3 rounded-[var(--esp-field-radius,var(--radius-lg))] py-2 text-sm"
const BOX_CLASS = "mt-0.5 size-4 shrink-0 accent-primary"

type ToggleField = "readReceipts" | "voicemailEnabled" | "callWaiting" | "sharePresence"
const TOGGLES: readonly { field: ToggleField; label: string; hint: string }[] = [
  { field: "readReceipts", label: "settings.icom.readReceipts", hint: "settings.icom.readReceiptsHint" },
  { field: "voicemailEnabled", label: "settings.icom.voicemail", hint: "settings.icom.voicemailHint" },
  { field: "callWaiting", label: "settings.icom.callWaiting", hint: "settings.icom.callWaitingHint" },
  { field: "sharePresence", label: "settings.icom.sharePresence", hint: "settings.icom.sharePresenceHint" },
]

const CALLER_CHOICES: readonly { value: OutsideRelationsCallPolicy; label: string; hint: string }[] = [
  { value: "silent", label: "settings.icom.callersRelations", hint: "settings.icom.callersRelationsHint" },
  { value: "ring", label: "settings.icom.callersEveryone", hint: "settings.icom.callersEveryoneHint" },
]

export function IcomSettings() {
  const { t } = useTranslation("antsia")
  const id = useId()
  const titleId = `${id}-title`
  // L'instant de lecture, arrondi à la minute et figé au montage : même clé d'abonnement que `MyPresenceRow`.
  const [now] = useState(() => Math.floor(Date.now() / PREFS_NOW_STEP_MS) * PREFS_NOW_STEP_MS)
  const preferences = useAuthenticatedConvexQuery(api.modules.calls.preferences.getMine, { now })
  const update = useMutation(api.modules.calls.preferences.update)
  const shown = useMemo(() => (preferences.data ? icomSettingsValues(preferences.data, t) : null), [preferences.data, t])
  const form = useForm<IcomSettingsValues>({
    resolver: zodResolver(icomSettingsSchema({ quickReplyTooLong: t("settings.icom.quickReplyTooLong", { max: MAX_QUICK_REPLY_LENGTH }) })),
    defaultValues: shown ?? undefined,
  })
  const replies = useFieldArray({ control: form.control, name: "quickReplies" })
  const { errors, isDirty, isSubmitting } = form.formState
  const lastShown = useRef<IcomSettingsValues | null>(null)

  // Une nouvelle lecture ne remplace jamais un brouillon en cours.
  useEffect(() => {
    if (!shown || shown === lastShown.current || isDirty || isSubmitting) return
    lastShown.current = shown
    form.reset(shown)
  }, [shown, isDirty, isSubmitting, form])

  const save = async (values: IcomSettingsValues) => {
    if (!shown) return
    const patch = icomSettingsPatch(values, shown)
    try {
      if (Object.keys(patch).length > 0) await update(patch)
      form.reset(values)
      toast.success(t("settings.icom.saved"))
    } catch (error) {
      toast.error(engineErrorMessage(error, t))
    }
  }

  return (
    <Card className="min-w-0">
      <section aria-labelledby={titleId} className="flex min-w-0 flex-col gap-5 [overflow-wrap:anywhere]">
        <div className="flex flex-col gap-2">
          <h2 id={titleId} className="text-xl font-semibold">{t("settings.icom.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("settings.icom.lead")}</p>
        </div>
        <MyPresenceRow />
        {preferences.error ? (
          <p role="alert" className="text-sm text-destructive">{engineErrorMessage(preferences.error, t)}</p>
        ) : !shown ? (
          <p role="status" className="text-sm text-muted-foreground">{t("settings.icom.loading")}</p>
        ) : (
          <form aria-labelledby={titleId} aria-busy={isSubmitting || undefined} noValidate className="flex min-w-0 flex-col gap-5" onSubmit={(event) => { void form.handleSubmit(save)(event) }}>
            <fieldset disabled={isSubmitting} className="flex min-w-0 flex-col gap-1">
              <legend className="mb-2 text-base font-semibold">{t("settings.icom.callersLegend")}</legend>
              {CALLER_CHOICES.map((choice) => (
                <label key={choice.value} className={CHOICE_CLASS}>
                  <input type="radio" value={choice.value} className={BOX_CLASS} aria-describedby={`${id}-${choice.value}-hint`} {...form.register("outsideRelationsCalls")} />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="font-medium text-foreground">{t(choice.label)}</span>
                    <span id={`${id}-${choice.value}-hint`} className="text-muted-foreground">{t(choice.hint)}</span>
                  </span>
                </label>
              ))}
              <p className="text-xs text-muted-foreground">{t("settings.icom.callersNote")}</p>
            </fieldset>

            <fieldset disabled={isSubmitting} className="flex min-w-0 flex-col gap-1">
              <legend className="mb-2 text-base font-semibold">{t("settings.icom.optionsLegend")}</legend>
              {TOGGLES.map((toggle) => (
                <label key={toggle.field} className={CHOICE_CLASS}>
                  <input type="checkbox" className={BOX_CLASS} aria-describedby={`${id}-${toggle.field}-hint`} {...form.register(toggle.field)} />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="font-medium text-foreground">{t(toggle.label)}</span>
                    <span id={`${id}-${toggle.field}-hint`} className="text-muted-foreground">{t(toggle.hint)}</span>
                  </span>
                </label>
              ))}
            </fieldset>

            <fieldset disabled={isSubmitting} className="flex min-w-0 flex-col gap-3" aria-describedby={`${id}-replies-hint`}>
              <legend className="mb-1 text-base font-semibold">{t("settings.icom.quickRepliesLegend")}</legend>
              <p id={`${id}-replies-hint`} className="text-sm text-muted-foreground">{t("settings.icom.quickRepliesHint", { max: MAX_QUICK_REPLIES })}</p>
              {replies.fields.length === 0 ? <p className="text-sm text-muted-foreground">{t("settings.icom.quickRepliesEmpty")}</p> : null}
              <ol className="flex min-w-0 flex-col gap-2">
                {replies.fields.map((field, index) => {
                  const inputId = `${id}-reply-${field.id}`
                  const error = errors.quickReplies?.[index]?.text?.message
                  return (
                    <li key={field.id} className="flex min-w-0 flex-col gap-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <label htmlFor={inputId} className="sr-only">{t("settings.icom.quickReplyLabel", { index: index + 1 })}</label>
                        <TextInput
                          id={inputId}
                          maxLength={MAX_QUICK_REPLY_LENGTH}
                          autoComplete="off"
                          className="min-w-0 flex-1"
                          aria-invalid={error ? true : undefined}
                          aria-describedby={error ? `${inputId}-error` : undefined}
                          {...form.register(`quickReplies.${index}.text` as const)}
                        />
                        <Button type="button" variant="ghost" className="min-w-11 shrink-0 px-2" aria-label={t("settings.icom.quickReplyRemove", { index: index + 1 })} onClick={() => replies.remove(index)}>
                          <X aria-hidden="true" className="size-4" />
                        </Button>
                      </div>
                      {error ? <p id={`${inputId}-error`} role="alert" className="text-sm text-destructive">{error}</p> : null}
                    </li>
                  )
                })}
              </ol>
              <Button type="button" variant="outline" className="self-start" disabled={replies.fields.length >= MAX_QUICK_REPLIES} onClick={() => replies.append({ text: "" })}>
                <Plus aria-hidden="true" className="size-4" />
                {t("settings.icom.quickReplyAdd")}
              </Button>
            </fieldset>

            <Button type="submit" pending={isSubmitting} disabled={!isDirty} className="w-full whitespace-normal sm:w-auto sm:self-start">
              {t(isSubmitting ? "settings.icom.saving" : "settings.icom.save")}
            </Button>
          </form>
        )}
      </section>
    </Card>
  )
}
