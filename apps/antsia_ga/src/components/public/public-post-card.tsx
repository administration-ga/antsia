import type { PublicAuthor, PublicPost, PublicSharedPost } from "@antsia/social-contracts/publicNetwork"
import type { PostMediaDto } from "@antsia/social-contracts/media"
import type { Locale } from "@antsia/social-features/i18n"
import { splitBodyRich } from "@antsia/social-domain/richText"
import { captionPreview } from "@antsia/social-features/features/reseau-personnel/post-card-caption"
import Image from "next/image"
import Link from "next/link"
import { Fragment } from "react"
import { routes } from "@/lib/routes"
import { getPublicT, publicDate } from "./public-copy"
import { PublicPostMedia } from "./public-post-media"
import { PublicOfferPostSlot } from "../shops/public-offer-post-slot"

export function PublicIdentity({ author, locale }: { author: PublicAuthor; locale: Locale }) {
  const t = getPublicT(locale)
  const label = author.displayName ?? t("post.withdrawnAuthor")
  const href = author.handle ? author.kind === "page" ? routes.officialPage(author.handle) : routes.publicProfile(author.handle) : null
  const portraitRadius = author.kind === "page" ? "rounded-[var(--esp-avatar-page-radius)]" : "rounded-full"
  return <div className="flex min-w-0 items-center gap-3">
    {author.avatarUrl ? <Image unoptimized src={author.avatarUrl} width={44} height={44} alt="" loading="lazy" className={`size-11 shrink-0 ${portraitRadius} object-cover`} /> : <span aria-hidden="true" className={`flex size-11 shrink-0 items-center justify-center ${portraitRadius} bg-muted font-semibold`}>{author.displayName?.slice(0, 1) ?? "·"}</span>}
    <div className="min-w-0"><p className="break-words font-semibold">{href ? <Link href={href} prefetch={false} className="rounded-sm hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">{label}</Link> : label}</p>
      {author.handle ? <p className="break-all text-sm text-muted-foreground">@{author.handle}</p> : null}
      {author.badges.length ? <ul aria-label={t("post.badges")} className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">{author.badges.map((badge) => <li key={badge}>{t(`badges.${badge}`)}</li>)}</ul> : null}
    </div>
  </div>
}

/**
 * P18b (A09, WCAG 1.4.1) : les mots-dièse et mentions du texte courant se
 * distinguent autrement que par la couleur — le même jeton que le fil connecté
 * (`--esp-inline-link-decoration`, souligné dans le thème ANTSIA, `RichText`).
 */
export const PUBLIC_INLINE_LINK_CLASS = "rounded-sm font-medium text-primary [text-decoration-line:var(--esp-inline-link-decoration,underline)] underline-offset-[0.16em] focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"

function PublicBody({ body }: { body: string }) {
  return <p className="whitespace-pre-wrap break-words leading-relaxed">{splitBodyRich(body).map((part, index) => <Fragment key={index}>{part.type === "text" ? part.value : <Link href={part.type === "tag" ? routes.tag(part.value) : routes.publicProfile(part.value)} prefetch={false} className={PUBLIC_INLINE_LINK_CLASS}>{part.type === "tag" ? "#" : "@"}{part.value}</Link>}</Fragment>)}</p>
}

/** Le texte intégral demeure dans le HTML ; la divulgation fonctionne sans JavaScript. */
function PublicCaption({ body, locale, full = false }: { body: string; locale: Locale; full?: boolean }) {
  const t = getPublicT(locale)
  if (!body) return null
  const preview = captionPreview(body)
  if (full || !preview.truncated) return <PublicBody body={body} />
  return <details className="group">
    <summary className="cursor-pointer rounded-[var(--esp-chip-radius)] leading-relaxed focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
      <span className="whitespace-pre-wrap break-words group-open:hidden">{preview.segments.map((part) => part.type === "text" ? part.value : `${part.type === "tag" ? "#" : "@"}${part.value}`).join("")}… </span>
      <span className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4 group-open:hidden">{t("post.readMore")}</span>
      <span className="hidden min-h-11 items-center font-semibold underline underline-offset-4 group-open:inline-flex">{t("post.readLess")}</span>
    </summary>
    <PublicBody body={body} />
  </details>
}

function PublicMedia({ media }: { media: PostMediaDto[] }) {
  return media.length > 0 ? <PublicPostMedia media={media} /> : null
}

function SharedPublicPost({ shared, locale }: { shared: PublicSharedPost; locale: Locale }) {
  const t = getPublicT(locale)
  if (!shared.available) return <p className="rounded-[var(--ui2-card-radius)] border border-transparent bg-muted p-4 text-sm text-muted-foreground">{t("post.originalUnavailable")}</p>
  return <blockquote className="flex min-w-0 flex-col gap-4 rounded-[var(--ui2-card-radius)] border border-border p-4"><PublicIdentity author={shared.author} locale={locale} /><p className="border-l-2 border-primary pl-3 text-xs text-muted-foreground">{t("post.origin", { name: shared.origin.name })}</p><PublicMedia media={shared.media} /><PublicCaption body={shared.body} locale={locale} full={shared.media.length === 0} /><Link href={routes.publication(shared.id)} prefetch={false} className="inline-flex min-h-11 items-center rounded-[var(--ui2-button-radius)] text-sm font-medium text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">{t("post.original")}</Link></blockquote>
}

/** Projection SSR allowlistée, ordre des chartes (ADR-0028) : identité, texte, média et actions. */
export function PublicPostCard({ post, locale }: { post: PublicPost; locale: Locale }) {
  const t = getPublicT(locale)
  const textOnly = post.media.length === 0 && post.shared === null
  return <article data-post-presentation="charte" className="flex min-w-0 flex-col gap-4 overflow-hidden rounded-[var(--ui2-card-radius)] border border-[color:var(--esp-surface-border)] bg-card p-4 text-card-foreground">
    <div className="flex flex-wrap items-start justify-between gap-4"><PublicIdentity author={post.author} locale={locale} /><Link href={routes.publication(post.id)} prefetch={false} className="inline-flex min-h-11 shrink-0 items-center rounded-[var(--ui2-button-radius)] px-1 py-2 text-xs text-muted-foreground hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"><time dateTime={new Date(post.publishedAt).toISOString()}>{publicDate(post.publishedAt, locale)}</time></Link></div>
    <p className="border-l-2 border-primary pl-3 text-xs font-medium text-muted-foreground">{t("post.origin", { name: post.origin.name })}</p>
    <PublicCaption body={post.body} locale={locale} full={textOnly} />
    <PublicMedia media={post.media} />
    {post.shared ? <SharedPublicPost shared={post.shared} locale={locale} /> : null}
    <div role="group" aria-label={t("post.actions")} className="flex flex-wrap items-center gap-3 border-t border-border pt-2">
      <Link href={routes.signIn(undefined, post.id)} prefetch={false} className="inline-flex min-h-11 items-center rounded-[var(--ui2-button-radius)] px-2 text-sm font-medium text-primary underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">{t("post.participate")}</Link>
      <Link href={routes.publication(post.id)} prefetch={false} className="inline-flex min-h-11 items-center rounded-[var(--ui2-button-radius)] px-2 text-sm font-medium underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">{t("post.open")}</Link>
    </div>
    {post.hasCommerceOffer ? <PublicOfferPostSlot postId={post.id} locale={locale} /> : null}
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3 text-xs text-muted-foreground">
      <span>{t("post.publicAudience")}</span>
      {post.editedAt ? <time dateTime={new Date(post.editedAt).toISOString()}>{t("post.edited", { date: publicDate(post.editedAt, locale) })}</time> : null}
    </div>
  </article>
}
