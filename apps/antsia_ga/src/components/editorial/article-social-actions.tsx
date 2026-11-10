"use client"

import { api, type Id } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import { ReportContentDialog } from "@antsia/social-features/features/reseau-personnel/report-content-entry"
import { useConvexAuth, useMutation } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import Link from "next/link"
import { useId, useState } from "react"
import { useTranslation } from "react-i18next"
import { useCartConnectivity } from "@/components/cart/use-cart-draft"
import { Button } from "@/components/shared/controls"
import { useShopAction } from "@/components/shops/shop-ui"
import { browserAppPath } from "@/lib/app-path"
import { routes } from "@/lib/routes"

type SocialContext = NonNullable<FunctionReturnType<typeof api.modules.editorial.social.context>>
type ArticleIdentity = { handle: string; articleKey: string; versionId: Id<"editorialVersions"> }
type Decision = "announce" | "close" | "restore"
const LINK = "inline-flex min-h-11 items-center rounded-[var(--ui2-button-radius)] border border-border px-4 py-2 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

/** Les gestes portent toujours sur la version publiée effectivement lue. */
export function ArticleSocialActions(props: ArticleIdentity) {
  const { networkId, personId } = useNetwork()
  const connectivity = useCartConnectivity()
  return <ArticleSocialQuery key={JSON.stringify([networkId, personId, props.versionId, props.handle, props.articleKey, connectivity.generation])} {...props} online={connectivity.online} />
}

function ArticleSocialQuery({ handle, articleKey, versionId, online }: ArticleIdentity & { online: boolean }) {
  const { networkId, personId } = useNetwork()
  const { isAuthenticated } = useConvexAuth()
  const { t } = useTranslation("editorialPublic")
  const query = useAuthenticatedConvexQuery(api.modules.editorial.social.context, online && isAuthenticated ? { networkId, readerScope: personId, handle, articleKey } : "skip")
  const refresh = async () => {
    if (!navigator.onLine || !isAuthenticated) return false
    try {
      const result = await query.refetch()
      return !result.isError && result.data?.versionId === versionId
    } catch { return false }
  }
  if (!online || !isAuthenticated || query.isError || query.data === null) return <SocialUnavailable online={online && isAuthenticated} refresh={refresh} />
  if (query.isPending || query.isFetching || query.data === undefined) return <p role="status" className="mx-auto mt-6 max-w-[76ch]">{t("socialLoading")}</p>
  if (query.data.versionId !== versionId) return <SocialUnavailable online={online} refresh={refresh} />
  return <CurrentArticleSocialActions key={JSON.stringify([query.data.articleId, versionId, query.data.revision])} context={query.data} handle={handle} articleKey={articleKey} refresh={refresh} />
}

function SocialUnavailable({ online, refresh }: { online: boolean; refresh: () => Promise<boolean> }) {
  const { t } = useTranslation("editorialPublic")
  return <div className="mx-auto mt-6 grid max-w-[76ch] gap-3"><p role="status">{t(online ? "socialUnavailable" : "socialOffline")}</p>{online ? <Button type="button" variant="outline" className="justify-self-start" onClick={() => { void refresh() }}>{t("socialRefresh")}</Button> : null}</div>
}

function CurrentArticleSocialActions({ context, handle, articleKey, refresh }: { context: SocialContext; handle: string; articleKey: string; refresh: () => Promise<boolean> }) {
  const { networkId } = useNetwork()
  const { t } = useTranslation("editorialPublic")
  const action = useShopAction()
  const announce = useMutation(api.modules.editorial.social.announce)
  const setDiscussion = useMutation(api.modules.editorial.social.setDiscussion)
  const report = useMutation(api.modules.moderation.cases.report)
  const [decision, setDecision] = useState<Decision | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [needsReview, setNeedsReview] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [reported, setReported] = useState(false)
  const [copyStatus, setCopyStatus] = useState<"copied" | "copyError" | null>(null)
  const id = useId()
  const locked = action.pending || needsReview
  const choose = (value: Decision) => { if (!locked) { setDecision(value); setConfirmed(false) } }
  const apply = async () => {
    if (!decision || !confirmed || locked || !navigator.onLine || !action.current()) return
    if (decision === "announce" ? !context.canAnnounce || context.postId !== null : !context.canManageComments || !context.discussionAvailable || context.postId === null) return
    const selected = decision
    setNeedsReview(true); setDecision(null); setConfirmed(false)
    const result = await action.run(async () => {
      try {
        if (selected === "announce") await announce({ networkId, articleId: context.articleId, expectedVersionId: context.versionId, expectedRevision: context.revision })
        else await setDiscussion({ networkId, articleId: context.articleId, expectedVersionId: context.versionId, expectedRevision: context.revision, enabled: selected === "restore" })
        return { confirmed: true }
      } catch { return { confirmed: false } }
    })
    // Une réponse perdue n'est jamais réémise automatiquement.
    if (result?.confirmed && action.current()) await refresh()
  }
  return <section aria-label={t("socialActions")} className="mx-auto mt-6 grid max-w-[76ch] gap-4 rounded-[var(--ui2-card-radius)] border border-border bg-card p-4 text-card-foreground">
    <h2 className="mp-subtitle">{t("discussion")}</h2>
    <div className="flex flex-wrap gap-3"><Link prefetch={false} href={routes.page(handle)} className={LINK}>{t("socialPage")}</Link><Button type="button" variant="outline" disabled={action.pending} onClick={() => {
      void action.run(async () => { try { await navigator.clipboard.writeText(new URL(browserAppPath(routes.memberArticle(handle, articleKey)), window.location.origin).href); return "copied" as const } catch { return "copyError" as const } }).then(value => { if (value && action.current()) setCopyStatus(value) })
    }}>{t("copy")}</Button><Button type="button" variant="outline" disabled={locked || reported} onClick={() => setReportOpen(true)}>{t(reported ? "reported" : "report")}</Button></div>
    {copyStatus ? <p role={copyStatus === "copyError" ? "alert" : "status"}>{t(copyStatus)}</p> : null}
    {context.postId === null ? <p className="text-sm text-muted-foreground">{t("noDiscussion")}</p> : context.discussionAvailable ? <div className="grid justify-items-start gap-2"><Link prefetch={false} href={routes.memberPost(context.postId)} className={LINK}>{t("discuss")}</Link>{!context.commentsEnabled ? <p className="text-sm text-muted-foreground">{t("commentsClosed")}</p> : null}</div> : <p role="status">{t("discussionUnavailable")}</p>}
    <div className="flex flex-wrap gap-3">{context.postId === null && context.canAnnounce ? <Button type="button" disabled={locked} onClick={() => choose("announce")}>{t("shareInFeed")}</Button> : null}{context.postId !== null && context.discussionAvailable && context.canManageComments ? <Button type="button" variant="outline" disabled={locked} onClick={() => choose(context.commentsEnabled ? "close" : "restore")}>{t(context.commentsEnabled ? "closeDiscussion" : "restoreDiscussion")}</Button> : null}</div>
    {decision ? <div role="group" aria-labelledby={`${id}-confirmation`} className="grid gap-3 rounded-lg border border-border bg-muted p-4"><p id={`${id}-confirmation`}>{t(decision === "announce" ? "announceConfirm" : decision === "close" ? "closeDiscussionConfirm" : "restoreDiscussionConfirm")}</p><label className="flex min-h-11 items-center gap-3 text-sm"><input name="socialConfirmation" type="checkbox" checked={confirmed} className="size-5 accent-primary" onChange={event => setConfirmed(event.target.checked)} /><span>{t("socialConfirmChoice")}</span></label><div className="flex flex-wrap gap-3"><Button type="button" disabled={locked || !confirmed} pending={action.pending} onClick={() => { void apply() }}>{t("confirm")}</Button><Button type="button" variant="outline" disabled={action.pending} onClick={() => { setDecision(null); setConfirmed(false) }}>{t("cancel")}</Button></div></div> : null}
    {needsReview ? <div className="grid gap-3"><p role={action.pending ? "status" : "alert"}>{t(action.pending ? "socialPending" : "socialError")}</p><Button type="button" variant="outline" className="justify-self-start" pending={action.pending} onClick={() => { void refresh().then(value => { if (value && action.current()) setNeedsReview(false) }) }}>{t("socialRefresh")}</Button></div> : null}
    {reportOpen ? <ReportContentDialog kind="editorialVersion" allowNote={false} onClose={() => setReportOpen(false)} onSubmit={async reason => {
      if (!action.current() || !navigator.onLine || locked) throw new Error(t("socialUnavailable"))
      await report({ networkId, target: { kind: "editorialVersion", id: context.versionId }, reason })
      if (action.current()) setReported(true)
    }} /> : null}
  </section>
}
