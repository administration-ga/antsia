import type { Locale } from "@antsia/social-features/i18n"
import type { PublicPagination, PublicPost } from "@antsia/social-contracts/publicNetwork"
import Link from "next/link"
import type { PublicResult } from "@/lib/public-data"
import { getPublicT } from "./public-copy"
import { PublicPostCard } from "./public-post-card"
import { PublicStatus } from "./public-status"
import { PUBLIC_LINK } from "./public-shell"

export function publicContinuationHref(base: string, cursor: string): string {
  return `${base}?${new URLSearchParams({ cursor })}`
}

export function PublicFeed({ result, locale, base }: { result: PublicResult<PublicPagination<PublicPost>>; locale: Locale; base: string }) {
  if (result.status !== "ready") return <PublicStatus status={result.status} locale={locale} headingLevel={2} />
  const t = getPublicT(locale)
  return <div className="antsia-page min-w-0">
    {result.data.page.length ? result.data.page.map((post) => <PublicPostCard key={post.id} post={post} locale={locale} />) : <div role="status" className="rounded-[var(--ui2-card-radius)] border border-dashed border-border p-[var(--esp-card-padding,16px)]"><p className="font-medium">{t("feed.emptyTitle")}</p><p className="mt-2 text-sm text-muted-foreground">{t(result.data.isDone ? "feed.emptyBody" : "feed.filteredWindow")}</p></div>}
    {!result.data.isDone && result.data.continueCursor ? <nav aria-label={t("feed.pagination")} className="flex justify-between gap-3"><Link href={base} prefetch={false} className={PUBLIC_LINK}>{t("feed.first")}</Link><Link href={publicContinuationHref(base, result.data.continueCursor)} prefetch={false} className={PUBLIC_LINK}>{t("feed.next")}</Link></nav> : null}
  </div>
}
