"use client"

import { useRoutes } from "@antsia/api/network"
import { Link } from "@antsia/api/routing"
import type { PostMediaDto } from "@antsia/social-contracts/media"
import { Card } from "@antsia/ui"
import { Clapperboard, Play, X } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { POST_SURFACE_STYLE } from "../../shell/design-styles"
import type { PostCardPost } from "./PostCard"

type ClipPost = Pick<PostCardPost, "_id" | "media" | "author" | "page">

/** Seulement des vidéos déjà livrables dans la page courante du fil. Aucune
 * requête supplémentaire, aucun média retenu ni contenu extérieur au réseau. */
export function feedClipPreviews(posts: readonly ClipPost[]) {
  const seen = new Set<string>()
  return posts.flatMap((post) => {
    if (seen.has(post._id)) return []
    seen.add(post._id)
    const media = post.media.find((item): item is PostMediaDto & { url: string } => item.kind === "video" && item.url !== null && item.withheld === null)
    return media ? [{ post, media }] : []
  }).slice(0, 4)
}

/**
 * La rangée des clips, à la référence des captures du 22/10/2026 (ADR-0037) :
 * des cartes verticales en 9:16 à l'angle des médias, serrées de 4 px, le titre
 * et « Voir tous les clips » en tête ; au téléphone (coquille de moins de 600 px),
 * la rangée passe d'un bord à l'autre de l'écran, comme les publications.
 * ⚠️ `!important` sur ce seul angle : la surface partagée le pose en style en ligne.
 */
const CLIPS_CSS = `
.rp-clips-preview { display: grid; gap: 10px; padding: 12px 0; min-width: 0; }
.rp-clips-preview header { display: flex; gap: 12px; justify-content: space-between; align-items: center; padding-inline: 16px; }
.rp-clips-preview h2 { display: flex; gap: 8px; align-items: center; margin: 0; font-size: 15px; font-weight: 700; }
.rp-clips-preview-tools { display: inline-flex; flex: 0 0 auto; align-items: center; gap: 4px; }
.rp-clips-preview-all { display: inline-flex; align-items: center; min-height: 32px; color: var(--primary-600, var(--primary)); font-size: 13px; font-weight: 700; text-decoration: none; }
.rp-clips-preview-close { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border: 0; color: var(--muted-foreground); background: transparent; cursor: pointer; border-radius: 999px; }
.rp-clips-preview ul { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(136px, 40%); overflow-x: auto; overscroll-behavior-inline: contain; scroll-snap-type: x proximity; scroll-padding-inline: 16px; gap: 4px; list-style: none; margin: 0; padding: 0 16px; scrollbar-width: none; }
.rp-clips-preview ul::-webkit-scrollbar { display: none; }
.rp-clips-preview li { min-width: 0; scroll-snap-align: start; }
.rp-clips-preview-card { position: relative; display: flex; flex-direction: column; gap: 6px; color: var(--foreground); text-decoration: none; }
.rp-clips-preview-media { position: relative; display: grid; place-items: center; aspect-ratio: 9 / 16; overflow: hidden; border-radius: var(--esp-media-radius, 12px); background: var(--muted); color: var(--foreground); }
.rp-clips-preview video { width: 100%; height: 100%; object-fit: cover; }
.rp-clips-preview-play { position: absolute; inset: 0; display: grid; place-items: center; pointer-events: none; }
.rp-clips-preview-play svg { padding: 10px; box-sizing: content-box; border-radius: 50%; color: var(--primary-fill-on, var(--on-fill)); background: var(--primary-fill); }
.rp-clips-preview-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; font-weight: 600; }
.rp-clips-preview a:focus-visible, .rp-clips-preview button:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
@media (min-width: 600px) { .rp-clips-preview ul { grid-auto-columns: minmax(150px, 28%); } }
@media (min-width: 1100px) { .rp-clips-preview ul { grid-auto-columns: minmax(150px, 18%); } }
@container rm-scroll (max-width: 599px) {
  .rp-clips-card { margin-inline: -12px; border-radius: 0 !important; }
}
`

export function FeedClipsRail({ posts }: { posts: readonly ClipPost[] }) {
  const { t } = useTranslation("reseau")
  const routes = useRoutes()
  const [dismissed, setDismissed] = useState(false)
  const clips = feedClipPreviews(posts)
  // Sans destination déclarée, aucun lien fabriqué. Les posts restent dans le fil.
  const postHref = routes.post
  const clipsHref = routes.clips
  if (dismissed || clips.length === 0 || clipsHref === undefined || postHref === undefined) return null
  return <Card padded={false} style={POST_SURFACE_STYLE} className="rp-clips-card">
    <section className="rp-clips-preview" aria-label={t("feedClips.title")}>
      <header>
        <h2><Clapperboard aria-hidden="true" size={18} />{t("feedClips.title")}</h2>
        <span className="rp-clips-preview-tools">
          <Link href={clipsHref()} className="rp-clips-preview-all">{t("feedClips.seeAll")}</Link>
          <button type="button" className="rp-clips-preview-close" aria-label={t("feedClips.hide")} onClick={() => setDismissed(true)}><X size={18} aria-hidden="true" /></button>
        </span>
      </header>
      <ul>{clips.map(({ post, media }) => {
        const name = post.page?.name ?? post.author.displayName ?? t("postCard.unknownAuthor")
        return <li key={post._id}><Link href={postHref(post._id)} className="rp-clips-preview-card" aria-label={t("feedClips.open", { name })}>
          <span className="rp-clips-preview-media"><video src={media.url} preload="metadata" muted playsInline tabIndex={-1} aria-hidden="true" /><span className="rp-clips-preview-play"><Play size={20} aria-hidden="true" /></span></span>
          <span className="rp-clips-preview-name">{name}</span>
        </Link></li>
      })}</ul>
    </section>
    <style href="rp-clips-preview" precedence="default">{CLIPS_CSS}</style>
  </Card>
}
