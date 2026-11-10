"use client"

import { api, type Id } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation } from "convex/react"
import { useEffect, useRef, useState } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { z } from "zod"

import { pageDecisionsAnchor } from "@/lib/routes"
import { Button, Card, Field, TextArea } from "./shared/controls"
import { useShopAction } from "./shops/shop-ui"

/**
 * P16 : recours d'un signataire VIVANT au nom de la page qui porte le contenu retiré. Même porte
 * que le recours personnel (`fileAppeal`, signature inchangée) : le serveur relit le droit.
 */
function PageAppealForm({ reportId, actorKey }: { reportId: Id<"reports">; actorKey: string }) {
  const { t } = useTranslation("antsia")
  const appeal = useMutation(api.modules.moderation.cases.fileAppeal)
  const action = useShopAction()
  const actor = useRef({ key: actorKey, epoch: 0 })
  if (actor.current.key !== actorKey) actor.current = { key: actorKey, epoch: actor.current.epoch + 1 }
  const epoch = actor.current.epoch
  const current = () => action.current() && actor.current.epoch === epoch
  const form = useForm<{ reason: string }>({ resolver: zodResolver(z.object({ reason: z.string().trim().min(10, t("personal.appealHint")).max(500, t("personal.appealHint")) })), defaultValues: { reason: "" } })
  const id = `page-appeal-${reportId}`
  return <form className="flex flex-col gap-3" noValidate onSubmit={form.handleSubmit(async ({ reason }) => {
    if (!current()) return
    await action.run(() => appeal({ reportId, reason }), () => {
      if (current()) { form.reset(); toast.success(t("personal.appealSent")) }
    })
  })}>
    <Field id={id} label={t("personal.appealLabel")} hint={t("personal.appealHint")} error={form.formState.errors.reason?.message}>
      <TextArea id={id} aria-invalid={Boolean(form.formState.errors.reason)} aria-describedby={`${id}-hint${form.formState.errors.reason ? ` ${id}-error` : ""}`} maxLength={500} {...form.register("reason")} disabled={form.formState.isSubmitting} />
    </Field>
    <Button variant="outline" pending={form.formState.isSubmitting || action.pending} type="submit">{t("personal.appeal")}</Button>
    {action.error ? <p role="alert">{t("personal.error")}</p> : null}
  </form>
}

/** Les décisions d'UNE page, par fenêtres serveur ; un refus de lecture ferme la liste sans détail. */
function PageDecisionList({ networkId, pageId, actorKey }: { networkId: Id<"networks">; pageId: Id<"pages">; actorKey: string }) {
  const { t } = useTranslation("antsia")
  const [cursors, setCursors] = useState<(string | null)[]>([null])
  const decisions = useAuthenticatedConvexQuery(api.modules.moderation.cases.pageDecisions, { networkId, pageId, paginationOpts: { cursor: cursors.at(-1) ?? null, numItems: 10 } })
  if (decisions.isError) return <p role="alert" className="text-sm">{t("personal.pageDecisionsUnavailable")}</p>
  if (decisions.isPending || decisions.data === undefined) return <p role="status">{t("personal.loading")}</p>
  const data = decisions.data
  return <div className="flex flex-col gap-3">
    {data.page.length === 0 ? <p className="text-sm text-muted-foreground">{t("personal.pageDecisionsEmpty")}</p> : null}
    {data.page.map((decision) => <article key={decision.reportId} className="rounded-[var(--ui2-card-radius)] border border-border p-4">
      <p className="font-medium">{t(`personal.statuses.${decision.status}`)}</p>
      {decision.decisionReason ? <p className="my-3 break-words text-sm">{decision.decisionReason}</p> : null}
      {decision.status === "actioned" && decision.appeals.length < 2 ? <PageAppealForm reportId={decision.reportId} actorKey={actorKey} /> : null}
    </article>)}
    <div className="flex flex-wrap gap-2">
      <Button variant="ghost" disabled={cursors.length <= 1} onClick={() => setCursors((value) => value.slice(0, -1))}>{t("personal.commercePrevious")}</Button>
      <Button variant="ghost" disabled={data.isDone} onClick={() => { if (!data.isDone) setCursors((value) => [...value, data.continueCursor]) }}>{t("personal.commerceNext")}</Button>
    </div>
  </div>
}

/**
 * P16 : décisions qui ont retiré un contenu porté par une page que je représente (offre, poste,
 * réponse d'avis, évènement…), dans le réseau donné. Rien n'est rendu sans page vivante : un
 * suspendu ne parle pour aucune page, et sa propre porte de recours personnel reste plus haut.
 */
export function PageModerationDecisions({ networkId, personId }: { networkId: Id<"networks">; personId: Id<"persons"> }) {
  const actorKey = JSON.stringify([networkId, personId])
  return <PageDecisionsScope key={actorKey} networkId={networkId} actorKey={actorKey} />
}
function PageDecisionsScope({ networkId, actorKey }: { networkId: Id<"networks">; actorKey: string }) {
  const { t } = useTranslation("antsia")
  const pages = useAuthenticatedConvexQuery(api.modules.pages.pages.myPages, { networkId })
  const loadedPages = !pages.isError && !pages.isPending ? pages.data?.map((page) => page.pageId).join(",") ?? "" : ""
  // P14B : l'ouverture ciblée d'un avis mène à `#decisions-page-…` ; la section n'existe qu'après chargement.
  useEffect(() => {
    const anchor = window.location.hash.slice(1)
    if (loadedPages.length === 0 || !anchor.startsWith(pageDecisionsAnchor(""))) return
    const section = document.getElementById(anchor)
    if (!section) return
    section.scrollIntoView({ block: "start" })
    section.focus({ preventScroll: true })
  }, [loadedPages])
  if (pages.isError || pages.isPending || !pages.data || pages.data.length === 0) return null
  return <Card><div className="grid gap-4">
    <h2 className="text-xl font-semibold">{t("personal.pageDecisionsTitle")}</h2>
    <p className="text-sm text-muted-foreground">{t("personal.pageDecisionsLead")}</p>
    {pages.data.map((page) => <section key={page.pageId} id={pageDecisionsAnchor(page.pageId)} tabIndex={-1} aria-label={page.name} className="grid scroll-mt-24 gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <h3 className="font-semibold">{page.name}</h3>
      <PageDecisionList networkId={networkId} pageId={page.pageId} actorKey={actorKey} />
    </section>)}
  </div></Card>
}
