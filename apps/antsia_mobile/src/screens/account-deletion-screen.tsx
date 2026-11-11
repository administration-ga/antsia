/**
 * MB-04 — supprimer son compte sans quitter l'application (exigence des
 * boutiques), même règle que « Mes données » du site
 * (`apps/antsia_ga/src/components/personal-controls.tsx`) :
 *  1. les conséquences d'abord — délai d'annulation de 30 jours, citations
 *     anonymisées, engagements chez les professionnels traités à part,
 *     rendez-vous à venir lus comme sur le site — puis « J'ai lu, continuer » ;
 *  2. le mot de confirmation saisi (React Hook Form + Zod), puis l'envoi :
 *     `people.erasure.requestErasure({ confirmation: "DELETE_MY_ANTSIA_ACCOUNT" })`.
 * Après l'accord du moteur, la sortie passe par la porte existante
 * (`controller.exit()` : révocation de toutes les sessions et purge du
 * coffre), et l'écran d'entrée dit la date prévue (`onErased`).
 *
 * Une demande déjà faite (ici ou sur le site) se lit et s'annule pendant la
 * grâce (`myErasure`, `cancelErasure`). Les comptes de la démonstration sont
 * partagés : leur suppression n'est pas proposée.
 */
import { useMemo, useRef, useState } from "react"
import { ScrollView, View } from "react-native"
import { Controller, useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQuery } from "convex/react"
import { api } from "@antsia/api/engine"
import { useNativeAppearance } from "../appearance"
import { useNativeNotice } from "../components/notice"
import { Action, Card, Field, Label, QueryBoundary, RuntimeNotice, Status, nativeScope, useNativeGuard } from "../components/ui"
import { NATIVE_ERASURE_CONFIRMATION, nativeErasureAllowed, nativeErasureBookingsKey, nativeErasureSchema, nativeSafetyErrorKey, type NativeErasureStage } from "../lib/native-safety"

export type AccountDeletionScreenProps = {
  sharedDemo: boolean
  /** Après l'accord du moteur : avis de l'écran d'entrée, puis sortie par la porte existante. */
  onErased: (dueAt: number) => void
  onOpenRequests?: () => void
}

function formatDate(locale: "fr" | "en", at: number): string {
  return new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-GB", { dateStyle: "long" }).format(at)
}

function CommerceNotice({ onOpenRequests }: { onOpenRequests?: () => void }) {
  const guard = useNativeGuard(), { t } = useNativeAppearance()
  const bookings = useQuery(api.modules.shops.serviceLifecycle.myUpcomingBookings, guard.canRead ? {} : "skip")
  return <View accessibilityRole="summary" style={{ gap: 8 }}>
    <Label>{t("mobile.safety.erasure.commerce")}</Label>
    <Status label={t(nativeErasureBookingsKey(bookings), { count: bookings?.count ?? 0 })} />
    {onOpenRequests ? <Action label={t("mobile.safety.erasure.openRequests")} disabled={!guard.canAct} onPress={() => { if (guard.current()) onOpenRequests() }} /> : null}
  </View>
}

function ErasureForm({ sharedDemo, onErased, onOpenRequests }: AccountDeletionScreenProps) {
  const guard = useNativeGuard(), { t, locale } = useNativeAppearance(), { notify } = useNativeNotice()
  const job = useQuery(api.modules.people.erasure.myErasure, guard.canRead ? {} : "skip")
  const erase = useMutation(api.modules.people.erasure.requestErasure), cancel = useMutation(api.modules.people.erasure.cancelErasure)
  const [stage, setStage] = useState<NativeErasureStage>("consequences")
  const [pending, setPending] = useState(false), [failure, setFailure] = useState("")
  const lock = useRef(false)
  const word = t("mobile.safety.erasure.confirmWord")
  const schema = useMemo(() => nativeErasureSchema(word, t("mobile.safety.erasure.confirmError")), [word, t])
  const form = useForm<{ confirmation: string }>({ resolver: zodResolver(schema), defaultValues: { confirmation: "" } })
  const typed = useWatch({ control: form.control, name: "confirmation" })
  const submit = () => form.handleSubmit(async ({ confirmation }) => {
    if (lock.current || !guard.current() || !nativeErasureAllowed({ stage, typed: confirmation, word, sharedDemo, existing: Boolean(job) })) return
    lock.current = true; setPending(true); setFailure("")
    const current = guard.capture()
    try {
      const result = await erase({ confirmation: NATIVE_ERASURE_CONFIRMATION })
      // La demande est faite : la sortie part même si l'écran a changé entre-temps (aucune session ne doit survivre).
      onErased(result.dueAt)
    } catch (error) {
      if (current()) setFailure(`${t("mobile.safety.erasure.failed")} ${t(nativeSafetyErrorKey(error))}`)
    } finally { lock.current = false; setPending(false) }
  })()
  const cancelRequest = async () => {
    if (lock.current || !guard.current()) return
    lock.current = true; setPending(true); setFailure("")
    const current = guard.capture()
    try { await cancel({}); notify(t("mobile.safety.erasure.cancelled")); if (current()) { setStage("consequences"); form.reset() } }
    catch (error) { if (current()) setFailure(`${t("mobile.safety.erasure.failed")} ${t(nativeSafetyErrorKey(error))}`) }
    finally { lock.current = false; setPending(false) }
  }
  if (job === undefined) return <Status busy label={t("mobile.common.loading")} />
  if (job) return <Card>
    <Label strong>{t("mobile.safety.erasure.requested", { date: formatDate(locale, job.dueAt) })}</Label>
    <Label muted>{t(job.canCancel ? "mobile.safety.erasure.requestedLead" : "mobile.safety.erasure.cannotCancel")}</Label>
    {job.canCancel ? <Action label={t("mobile.safety.erasure.cancelRequest")} pending={pending} disabled={!guard.canAct} onPress={() => { void cancelRequest() }} /> : null}
    <Status error label={failure} />
  </Card>
  return <Card>
    <Label muted>{t("mobile.safety.erasure.step", { step: stage === "consequences" ? 1 : 2 })}</Label>
    <Label>{t("mobile.safety.erasure.lead")}</Label>
    <Label>{t("mobile.safety.erasure.sessions")}</Label>
    <Label>{t("mobile.safety.erasure.cancelWindow")}</Label>
    <CommerceNotice {...(onOpenRequests ? { onOpenRequests } : {})} />
    {sharedDemo ? <Status label={t("mobile.safety.erasure.demo")} /> : stage === "consequences" ? <Action label={t("mobile.safety.erasure.continue")} disabled={!guard.canAct} onPress={() => { if (guard.current()) setStage("confirm") }} /> : <View style={{ gap: 12 }}>
      <Controller control={form.control} name="confirmation" render={({ field }) => <Field label={t("mobile.safety.erasure.confirmLabel", { word })} value={field.value} onChangeText={field.onChange} disabled={pending} error={form.formState.errors.confirmation?.message} autoCapitalize="characters" autoCorrect={false} />} />
      <Action label={t("mobile.safety.erasure.submit")} tone="danger" pending={pending} disabled={!guard.canAct || !nativeErasureAllowed({ stage, typed, word, sharedDemo, existing: false })} onPress={() => { void submit() }} />
      <Action label={t("mobile.safety.erasure.back")} disabled={pending} onPress={() => { form.reset(); setStage("consequences") }} />
    </View>}
    <Status error label={failure} />
  </Card>
}

export function AccountDeletionScreen(props: AccountDeletionScreenProps) {
  const guard = useNativeGuard(), { t, tokens } = useNativeAppearance(), [version, setVersion] = useState(0)
  const key = `${nativeScope(guard.runtime)}:erasure:${version}`
  return <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentContainerStyle={{ padding: 16, gap: 12, backgroundColor: tokens.background }}>
    <RuntimeNotice />
    <Label strong accessibilityRole="header">{t("mobile.safety.erasure.title")}</Label>
    {guard.canRead ? <QueryBoundary key={key} resetKey={key} fallback={<Card><Status error label={t("mobile.common.unavailable")} /><Action label={t("mobile.common.refresh")} disabled={!guard.canAct} onPress={() => { if (guard.current()) setVersion(value => value + 1) }} /></Card>}><ErasureForm {...props} /></QueryBoundary> : null}
  </ScrollView>
}
