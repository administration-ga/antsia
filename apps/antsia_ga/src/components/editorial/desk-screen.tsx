"use client"

import { api, type Id } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import { EDITORIAL_WORKING_STATES, type EditorialDraftInput, type EditorialWorkingState } from "@antsia/social-domain/editorial"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation } from "convex/react"
import { useRouter } from "next/navigation"
import { useId, useState } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { z } from "zod"

import { Button, Card, Field, TextInput } from "@/components/shared/controls"
import { SHOP_SELECT_CLASS, ShopLink, useShopDirtyGuard } from "@/components/shops/shop-ui"
import { editorialDraftInput, editorialDraftValues, editorialWriteInput } from "@/lib/editorial-form"
import { routes } from "@/lib/routes"
import { EditorialFrame, EditorialLinks, EditorialOperationStatus, EditorialUnavailable, useEditorialOperation } from "./editorial-fields"
import { EditorialGrantCard } from "./team-screen"

export function MediaHomeScreen() {
  const { networkId, personId } = useNetwork()
  const { t } = useTranslation("editorial")
  return <EditorialFrame title={t("home.title")} lead={t("home.lead")}><MediaHome key={JSON.stringify([networkId, personId])} /></EditorialFrame>
}
function MediaHome() {
  const { networkId } = useNetwork()
  const { t } = useTranslation("editorial")
  const [cursor, setCursor] = useState<string | null>(null)
  const [invitationCursor, setInvitationCursor] = useState<string | null>(null)
  const media = useAuthenticatedConvexQuery(api.modules.editorial.media.myManagedMedia, { networkId, paginationOpts: { cursor, numItems: 12 } })
  const invitations = useAuthenticatedConvexQuery(api.modules.editorial.grants.myInvitations, { networkId, paginationOpts: { cursor: invitationCursor, numItems: 12 } })
  return <><ShopLink href={routes.myShops()}>{t("actions.createActivity")}</ShopLink>{media.isError ? <EditorialUnavailable retry={() => { void media.refetch() }} /> : media.isPending || media.data === undefined ? <p role="status">{t("status.loading")}</p> : <section className="grid gap-4" aria-label={t("home.title")}>{media.isFetching ? <p role="status">{t("status.refreshing")}</p> : null}{media.data.page.length ? <div className="grid min-w-0 gap-4 md:grid-cols-2">{media.data.page.map(item => <Card key={item.pageId}><div className="grid min-w-0 gap-3"><h2 className="mp-subtitle">{item.name}</h2><p className="text-sm text-muted-foreground">@{item.handle}</p>{!item.mediaId ? <p className="text-sm">{t("config.required")}</p> : null}<EditorialLinks pageId={item.pageId} handle={item.mediaId ? item.handle : undefined} canConfigure={item.permissions.canConfigure} canManageGrants={item.permissions.canManageGrants} /></div></Card>)}</div> : <p role="status">{t(media.data.filteredWindow && !media.data.isDone ? "desk.filteredWindow" : "home.empty")}</p>}<div className="flex flex-wrap gap-2">{!media.data.isDone && media.data.continueCursor ? <Button variant="outline" disabled={media.isFetching} onClick={() => setCursor(media.data!.continueCursor)}>{t("actions.next")}</Button> : null}{cursor ? <Button variant="outline" disabled={media.isFetching} onClick={() => setCursor(null)}>{t("actions.first")}</Button> : null}</div></section>}
    <section className="grid min-w-0 gap-4"><h2 className="mp-subtitle">{t("home.invitations")}</h2>{invitations.isError ? <EditorialUnavailable retry={() => { void invitations.refetch() }} /> : invitations.isPending || invitations.data === undefined ? <p role="status">{t("status.loading")}</p> : <>{invitations.data.page.length ? invitations.data.page.map(grant => <EditorialGrantCard key={grant.grantId} grant={grant} refreshing={invitations.isFetching} reread={async () => { const value = await invitations.refetch(); return !value.isError && value.data !== undefined }} />) : <p role="status">{t(invitations.data.filteredWindow && !invitations.data.isDone ? "desk.filteredWindow" : "home.noInvitations")}</p>}<div className="flex flex-wrap gap-2">{!invitations.data.isDone && invitations.data.continueCursor ? <Button variant="outline" disabled={invitations.isFetching} onClick={() => setInvitationCursor(invitations.data!.continueCursor)}>{t("actions.next")}</Button> : null}{invitationCursor ? <Button variant="outline" disabled={invitations.isFetching} onClick={() => setInvitationCursor(null)}>{t("actions.first")}</Button> : null}</div></>}</section>
  </>
}

export function EditorialDeskScreen({ pageId }: { pageId: Id<"pages"> }) {
  const { networkId, personId } = useNetwork()
  const { t } = useTranslation("editorial")
  return <EditorialFrame title={t("desk.title")} lead={t("desk.lead")}><Desk key={JSON.stringify([networkId, personId, pageId])} pageId={pageId} /></EditorialFrame>
}
function Desk({ pageId }: { pageId: Id<"pages"> }) {
  const { networkId } = useNetwork()
  const { t } = useTranslation("editorial")
  const id = useId()
  const [cursor, setCursor] = useState<string | null>(null)
  const [status, setStatus] = useState<EditorialWorkingState | "">("")
  const media = useAuthenticatedConvexQuery(api.modules.editorial.media.myMedia, { networkId, pageId })
  const articles = useAuthenticatedConvexQuery(api.modules.editorial.read.desk, media.data?.mediaId ? { networkId, pageId, paginationOpts: { cursor, numItems: 12 }, ...(status ? { status } : {}) } : "skip")
  if (media.isPending || media.data === undefined) return media.isError ? <EditorialUnavailable retry={() => { void media.refetch() }} /> : <p role="status">{t("status.loading")}</p>
  if (!media.data) return <EditorialUnavailable retry={() => { void media.refetch() }} />
  return <div className="grid min-w-0 gap-5"><EditorialLinks pageId={pageId} handle={media.data.mediaId ? media.data.handle : undefined} canConfigure={!media.isError && media.data.permissions.canConfigure} canManageGrants={!media.isError && media.data.permissions.canManageGrants} /><h2 className="mp-subtitle">{media.data.name}</h2>{media.isError ? <EditorialUnavailable retry={() => { void media.refetch() }} /> : null}{!media.data.mediaId ? <p role="status">{t("desk.unconfigured")}</p> : <>{media.data.permissions.canCreate ? <EditorialCreateArticle pageId={pageId} unavailable={media.isError || media.isFetching} /> : null}<Field id={`${id}-status`} label={t("desk.filter")}><select id={`${id}-status`} className={SHOP_SELECT_CLASS} value={status} onChange={event => { setStatus(event.target.value as typeof status); setCursor(null) }}><option value="">{t("desk.all")}</option>{EDITORIAL_WORKING_STATES.map(value => <option key={value} value={value}>{t(`workingStates.${value}`)}</option>)}</select></Field>{media.isError || articles.isError ? <EditorialUnavailable retry={() => { void media.refetch(); void articles.refetch() }} /> : articles.isPending || articles.isFetching || articles.data === undefined ? <p role="status">{t("status.loading")}</p> : <>{articles.data.page.length ? <div className="grid min-w-0 gap-4 md:grid-cols-2">{articles.data.page.map(article => <Card key={article.articleId}><article className="grid min-w-0 gap-3"><h3 className="text-lg font-semibold">{article.title}</h3><p className="whitespace-pre-wrap text-sm">{article.chapeau}</p><div className="flex flex-wrap gap-2 text-sm text-muted-foreground"><p>{t(`workingStates.${article.workingState}`)}</p><p>{t(`publicationStates.${article.publicationState}`)}</p><p>{t("article.revision", { revision: article.revision })}</p></div><ShopLink href={routes.articleEditor(article.articleId)}>{t("actions.edit")}</ShopLink></article></Card>)}</div> : <p role="status">{t(articles.data.filteredWindow && !articles.data.isDone ? "desk.filteredWindow" : "desk.empty")}</p>}<div className="flex flex-wrap gap-2">{!articles.data.isDone && articles.data.continueCursor ? <Button variant="outline" onClick={() => setCursor(articles.data!.continueCursor)}>{t("actions.next")}</Button> : null}{cursor ? <Button variant="outline" onClick={() => setCursor(null)}>{t("actions.first")}</Button> : null}</div></>}</>}</div>
}

/** Une création incertaine conserve sa clé et son contenu exact jusqu'à une répétition volontaire. */
export function EditorialCreateArticle({ pageId, unavailable = false }: { pageId: Id<"pages">; unavailable?: boolean }) {
  const { networkId } = useNetwork()
  const { t } = useTranslation("editorial")
  const router = useRouter()
  const id = useId()
  const create = useMutation(api.modules.editorial.articles.create)
  const operation = useEditorialOperation()
  const [clientRequestId] = useState(() => crypto.randomUUID())
  const [submitted, setSubmitted] = useState<EditorialDraftInput | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const schema = z.object({ title: z.string().trim().min(1, t("validation.required")).max(180, t("validation.length")) }).strict()
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { title: "" } })
  useShopDirtyGuard(!confirmed && (form.formState.isDirty || submitted !== null))
  const attempt = async (input: EditorialDraftInput) => {
    if (unavailable || operation.pending || !navigator.onLine || confirmed) return
    const result = await operation.run(() => create({ networkId, pageId, clientRequestId, input: editorialWriteInput(input) }))
    if (result) { setConfirmed(true); router.push(routes.articleEditor(result.articleId)) }
  }
  return <Card><form className="grid min-w-0 gap-3" noValidate onSubmit={event => { void form.handleSubmit(async values => {
    if (submitted || unavailable || operation.pending || operation.needsReview) return
    const input = editorialDraftInput({ ...editorialDraftValues(), title: values.title })
    if (!input) { form.setError("title", { type: "validate", message: t("validation.text") }); return }
    setSubmitted(input); await attempt(input)
  })(event) }}><h3 className="font-semibold">{t("desk.newArticle")}</h3><p className="text-sm text-muted-foreground">{t("desk.newArticleHint")}</p><Field id={`${id}-title`} label={t("article.headline")} error={form.formState.errors.title?.message}><TextInput id={`${id}-title`} maxLength={180} disabled={submitted !== null || operation.pending || confirmed} {...form.register("title")} /></Field><EditorialOperationStatus operation={operation} />{submitted && !confirmed && !operation.pending ? <p role="status">{t("desk.uncertainCreate")}</p> : null}{submitted ? <Button type="button" variant="outline" pending={operation.pending} disabled={!operation.online || unavailable || confirmed} onClick={() => { void attempt(submitted) }}>{t("desk.retrySameCreate")}</Button> : <Button type="submit" pending={operation.pending} disabled={!operation.online || operation.needsReview || unavailable}>{t("actions.create")}</Button>}</form></Card>
}
