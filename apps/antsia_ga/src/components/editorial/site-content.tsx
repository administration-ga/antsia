import type { EditorialPublishedArticle, EditorialPublishedMedia } from "@convex/modules/editorial/validators"
import Image from "next/image"
import Link from "next/link"
import { routes } from "@/lib/routes"

export type EditorialReadingLabels = { all: string; read: string; empty: string; filtered: string; next: string; first: string; corrected: string; correction: string; byline: string; contents: string; imagePending: string; imageUnavailable: string; credit: string; back: string; about: string; publicNotice: string }
const LINK = "inline-flex min-h-11 items-center rounded-[var(--ui2-button-radius)] px-3 py-2 text-sm font-medium underline-offset-4 hover:bg-muted hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
const date = (at: number, locale: string) => new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "Africa/Libreville" }).format(at)

/** La une ne classe que les versions réellement publiées, dans l'ordre du serveur. Côté membre, elle occupe toute
 * la colonne de l'espace (`shared/screen-layout`) ; la page publique garde sa largeur. */
export function EditorialMediaContent({ media, locale, labels, section, cursor, publicView = false }: { media: EditorialPublishedMedia; locale: string; labels: EditorialReadingLabels; section?: string; cursor?: string | null; publicView?: boolean }) {
  const home = (nextSection?: string, nextCursor?: string | null) => publicView ? routes.publicMedia(media.handle, nextSection, nextCursor) : routes.memberMedia(media.handle, nextSection, nextCursor)
  return <div className={`grid min-w-0 gap-7 [overflow-wrap:anywhere]${publicView ? " mx-auto max-w-6xl" : ""}`}>
    <header className="grid gap-3 border-b border-border pb-6"><p className="text-sm font-medium text-muted-foreground">{labels.publicNotice}</p><h1 className="mp-title">{media.name}</h1>{media.description ? <p className="max-w-3xl whitespace-pre-wrap text-base leading-relaxed text-muted-foreground">{media.description}</p> : null}</header>
    <nav aria-label={labels.contents} className="flex min-w-0 flex-wrap gap-2"><Link prefetch={false} href={home()} aria-current={!section ? "page" : undefined} className={`${LINK} border border-border aria-[current=page]:bg-muted`}>{labels.all}</Link>{media.sections.map(item => <Link key={item.key} prefetch={false} href={home(item.key)} aria-current={section === item.key ? "page" : undefined} className={`${LINK} border border-border aria-[current=page]:bg-muted`}>{item.label}</Link>)}</nav>
    <section className="grid min-w-0 gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-label={labels.all}>
      {media.articles.page.map((article, index) => <article key={article.articleKey} className={`mp-panel grid min-w-0 content-start gap-4 ${index === 0 && !cursor ? "sm:col-span-2 lg:col-span-2" : ""}`}>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">{article.sectionLabel ? <span>{article.sectionLabel}</span> : null}<time dateTime={new Date(article.publishedAt).toISOString()}>{date(article.publishedAt, locale)}</time>{article.correctionNotice ? <span>{labels.corrected}</span> : null}</div>
        <h2 className={index === 0 && !cursor ? "text-2xl font-bold leading-snug sm:text-3xl" : "text-xl font-semibold leading-snug"}><Link href={publicView ? routes.publicArticle(media.handle, article.articleKey) : routes.memberArticle(media.handle, article.articleKey)} className="rounded-sm hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">{article.title}</Link></h2>
        {article.chapeau ? <p className="whitespace-pre-wrap leading-relaxed text-muted-foreground">{article.chapeau}</p> : null}
        <Link className={`${LINK} justify-self-start`} href={publicView ? routes.publicArticle(media.handle, article.articleKey) : routes.memberArticle(media.handle, article.articleKey)}>{labels.read}<span className="sr-only"> : {article.title}</span></Link>
      </article>)}
    </section>
    {!media.articles.page.length ? <p role="status">{media.articles.filteredWindow && !media.articles.isDone ? labels.filtered : labels.empty}</p> : null}
    <div className="flex flex-wrap gap-3">{!media.articles.isDone && media.articles.continueCursor ? <Link prefetch={false} className={`${LINK} border border-border`} href={home(section, media.articles.continueCursor)}>{labels.next}</Link> : null}{cursor ? <Link prefetch={false} href={home(section)} className={LINK}>{labels.first}</Link> : null}</div>
    <section className="grid gap-2 border-t border-border pt-5"><h2 className="mp-subtitle">{labels.about}</h2><p className="text-sm text-muted-foreground">{media.name} · @{media.handle}</p>{media.description ? <p className="max-w-3xl whitespace-pre-wrap leading-relaxed">{media.description}</p> : null}</section>
  </div>
}

/** Rendu structuré seulement : aucun HTML, script ou embed provenant de la rédaction. */
export function EditorialArticleContent({ article, locale, labels, publicView = false }: { article: EditorialPublishedArticle; locale: string; labels: EditorialReadingLabels; publicView?: boolean }) {
  const contents = article.blocks.flatMap((block, index) => block.type === "heading" ? [{ index, text: block.text }] : [])
  return <article className="mx-auto grid min-w-0 max-w-[76ch] gap-7 [overflow-wrap:anywhere]">
    <header className="grid gap-4"><Link href={publicView ? routes.publicMedia(article.mediaHandle) : routes.memberMedia(article.mediaHandle)} className={`${LINK} justify-self-start`}>{article.mediaName}</Link>{article.sectionLabel ? <p className="text-sm font-semibold text-muted-foreground">{article.sectionLabel}</p> : null}<h1 className="text-3xl font-bold leading-tight sm:text-4xl lg:text-5xl">{article.title}</h1>{article.chapeau ? <p className="whitespace-pre-wrap text-lg leading-relaxed text-muted-foreground sm:text-xl">{article.chapeau}</p> : null}<div className="grid gap-2 text-sm text-muted-foreground"><p>{labels.byline} {article.byline.label}</p><time dateTime={new Date(article.publishedAt).toISOString()}>{date(article.publishedAt, locale)}</time></div></header>
    {article.correctionNotice ? <aside className="grid gap-2 rounded-[var(--ui2-card-radius)] border border-border bg-card p-4"><h2 className="font-semibold">{labels.correction}</h2><time className="text-xs text-muted-foreground" dateTime={new Date(article.updatedAt).toISOString()}>{date(article.updatedAt, locale)}</time><p className="whitespace-pre-wrap leading-relaxed">{article.correctionNotice}</p></aside> : null}
    {contents.length > 1 ? <nav aria-label={labels.contents} className="grid gap-2 border-y border-border py-4"><h2 className="font-semibold">{labels.contents}</h2>{contents.map(item => <a key={item.index} className={`${LINK} justify-self-start`} href={`#article-section-${item.index}`}>{item.text}</a>)}</nav> : null}
    <div className="grid min-w-0 gap-6 text-base leading-[1.8] sm:text-lg">{article.blocks.map((block, index) => {
      if (block.type === "paragraph") return <p key={index} className="whitespace-pre-wrap">{block.text}</p>
      if (block.type === "heading") return block.level === 2 ? <h2 id={`article-section-${index}`} key={index} className="scroll-mt-24 text-2xl font-bold leading-snug">{block.text}</h2> : <h3 id={`article-section-${index}`} key={index} className="scroll-mt-24 text-xl font-semibold leading-snug">{block.text}</h3>
      if (block.type === "list") { const List = block.ordered ? "ol" : "ul"; return <List key={index} className={`${block.ordered ? "list-decimal" : "list-disc"} grid gap-2 pl-6`}>{block.items.map((item, itemIndex) => <li className="whitespace-pre-wrap" key={itemIndex}>{item}</li>)}</List> }
      if (block.type === "link") return <p key={index}><a href={block.href} target="_blank" rel="noopener noreferrer" className="rounded-sm font-medium underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">{block.label}</a></p>
      return <figure key={index} className="grid gap-2">{block.url && block.withheld === null ? <Image unoptimized src={block.url} alt={block.altText} width={1200} height={800} className="h-auto max-h-[75dvh] w-full rounded-[var(--ui2-card-radius)] object-contain" /> : <div role="status" className="grid min-h-40 place-items-center rounded-[var(--ui2-card-radius)] bg-muted p-5 text-sm text-muted-foreground">{block.withheld === "fileScanPending" ? labels.imagePending : labels.imageUnavailable}</div>}<figcaption className="text-xs leading-relaxed text-muted-foreground">{labels.credit} {block.credit}</figcaption></figure>
    })}</div>
    <Link href={publicView ? routes.publicMedia(article.mediaHandle) : routes.memberMedia(article.mediaHandle)} className={`${LINK} justify-self-start border border-border`}>{labels.back}</Link>
  </article>
}
