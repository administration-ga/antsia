"use client"

/**
 * La présentation « media » des médias d'une publication (lot P03 de l'étude
 * social-commerce du 18/10/2026, `04_PARCOURS_FIL_ET_PUBLICATIONS.md` §2) —
 * servie aux applications qui la DÉCLARENT (`NetworkProvider
 * postPresentation="media"`), jamais imposée : sans déclaration, `PostMedia`
 * garde sa présentation historique à l'identique.
 *
 * Ce qui change par rapport à la présentation historique :
 *  · le cadre suit le ratio RÉEL du média, borné (`post-media-frame.ts`) — plus
 *    de 16:10 imposé ; le média ENTIER y tient (`contain`), sans recadrage ni
 *    déformation, avec des bandes de fond hors des bornes ; le cadre ne dépasse
 *    jamais les trois quarts de la hauteur visible (les actions restent à
 *    portée, le média se réduit au lieu de les masquer) ;
 *  · une photo seule s'ouvre aussi dans la visionneuse, l'original entier ;
 *  · la galerie montre son index « 2/4 », ses flèches sur TOUS les écrans (le
 *    balayage n'est jamais le seul moyen), ses points SOUS l'image (aucun ne
 *    masque le bas d'une photo, une étiquette ou un prix), le clavier (flèches,
 *    Début, Fin) et le texte alternatif de chaque image ;
 *  · une vidéo se lit en ligne (`playsInline`), jamais d'elle-même.
 * Ce qui ne change pas : les URL sont celles de la garde des fichiers, un média
 * retenu garde sa place et dit pourquoi, aucune lecture automatique, aucun
 * préchargement au-delà des métadonnées.
 *
 * P04 (18/10/2026) — deux branchements ADDITIFS, inertes sans leur contexte :
 *  · la vidéo se déclare au coordinateur de lecture de la session
 *    (`useCoordinatedVideo`) quand l'application en monte un : une seule vidéo
 *    joue, suspension hors écran, onglet masqué ou appel ; dans le créneau
 *    actif du lecteur immersif, lecture automatique MUETTE si le navigateur
 *    l'admet (sinon « Lire »), « Son » sur geste, préchargement de la seule
 *    voisine. Sans coordinateur (carte publique, autres applications), rendu
 *    et comportement ci-dessus à l'identique ;
 *  · la galerie de la publication elle-même retrouve son index au retour
 *    (`useOptionalFeedPostMemory`), jamais celle d'une publication citée.
 */

import type { PostMediaDto } from "@antsia/social-contracts/media"
import { ImmersiveOverlay } from "@antsia/ui/overlay"
import { ChevronLeft, ChevronRight, X } from "lucide-react"
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import type { TFunction } from "i18next"

import { useOptionalFeedPostMemory } from "../feed-immersion/feed-post-memory"
import { CoordinatedVideoControls } from "../media-playback/CoordinatedVideoControls"
import { useCoordinatedVideo } from "../media-playback/use-coordinated-video"
import { carouselIndexForKey, carouselIndexFromScroll, clampCarouselIndex } from "./post-media-carousel"
import {
  aspectRatioValue,
  declaredRatio,
  frameRatioFor,
  galleryFrameRatio,
  intrinsicRatio,
  isWithheldMedia,
} from "./post-media-frame"

/** Le débord bord à bord demandé par la carte hôte (`PostMedia`, `gutter`). */
export interface MediaBleed {
  marginInline: number
  width: string
  maxWidth: string
  borderRadius: number
}

/** Un média servable : une URL de la garde, aucune retenue. */
type ServableMedia = PostMediaDto & { url: string; withheld: null }

const isServable = (item: PostMediaDto): item is ServableMedia => !isWithheldMedia(item)

/** La phrase d'un média RETENU ou absent : celle des codes de la garde (espace `errors`). */
function withheldText(item: PostMediaDto, t: TFunction): string {
  return t(item.withheld === null ? "reseau:postMedia.mediaUnavailable" : `errors:${item.withheld}`)
}

/**
 * La feuille de la présentation, hors du JSX : un littéral enfant de `<style>`
 * passerait pour une chaîne d'interface (cliquet `no-hardcoded-strings`).
 * Jetons de la charte seulement ; la scène d'une vidéo et la visionneuse sont
 * sombres par construction (`--esp-immersive-*`, couche de communication).
 */
const PRESENTATION_CSS = `
      .rpm-m {
        display: flex;
        flex-direction: column;
        gap: var(--sp-2);
        min-width: 0;
      }
      .rpm-m-frame {
        position: relative;
        width: 100%;
        max-height: 75vh;
        max-height: 75svh;
        overflow: hidden;
        border-radius: var(--radius-lg);
        background: var(--ink-150);
        color: var(--ink-600);
      }
      /* Présentation « charte » (ADR-0028) : le média est POSÉ dans la carte,
         à l'angle des photos du système (16 px), plus petit que celui de la
         carte (24 px). */
      .rpm-m[data-inset] .rpm-m-frame {
        border-radius: var(--esp-media-radius, var(--radius-lg));
      }
      .rpm-m-frame[data-kind="video"] {
        background: var(--esp-immersive-ink);
        color: var(--esp-immersive-on-ink);
      }
      .rpm-m-media {
        position: absolute;
        inset: 0;
        display: block;
        width: 100%;
        height: 100%;
        max-width: none;
        object-fit: contain;
      }
      .rpm-m-open {
        position: absolute;
        inset: 0;
        display: block;
        width: 100%;
        height: 100%;
        padding: 0;
        border: 0;
        background: transparent;
        cursor: zoom-in;
      }
      .rpm-m-note {
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center;
        padding: var(--sp-4);
        text-align: center;
        font-size: 14px;
        line-height: 1.4;
      }
      .rpm-m-track {
        position: absolute;
        inset: 0;
        display: flex;
        overflow-x: auto;
        overflow-y: hidden;
        overscroll-behavior-inline: contain;
        scroll-snap-type: x mandatory;
        scrollbar-width: none;
        outline: none;
      }
      .rpm-m-track::-webkit-scrollbar { display: none; }
      .rpm-m-slide {
        position: relative;
        flex: 0 0 100%;
        width: 100%;
        height: 100%;
        scroll-snap-align: center;
        scroll-snap-stop: always;
      }
      .rpm-m-counter {
        position: absolute;
        top: var(--sp-2);
        right: var(--sp-2);
        padding: 4px var(--sp-2);
        border-radius: 999px;
        background: var(--popover);
        color: var(--popover-foreground);
        box-shadow: var(--shadow-sm);
        font-size: 13px;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
        pointer-events: none;
      }
      .rpm-m-arrow {
        position: absolute;
        top: 50%;
        display: grid;
        place-items: center;
        width: 44px;
        height: 44px;
        padding: 0;
        transform: translateY(-50%);
        border: 1px solid var(--border);
        border-radius: 999px;
        background: var(--popover);
        color: var(--popover-foreground);
        box-shadow: var(--shadow-md);
        cursor: pointer;
      }
      .rpm-m-arrow-previous { left: var(--sp-2); }
      .rpm-m-arrow-next { right: var(--sp-2); }
      .rpm-m-arrow:disabled,
      .rpm-m-viewer-nav:disabled {
        visibility: hidden;
        pointer-events: none;
      }
      .rpm-m-dots {
        display: flex;
        justify-content: center;
        gap: 4px;
        min-height: 24px;
      }
      .rpm-m-dot {
        display: grid;
        place-items: center;
        width: 24px;
        height: 24px;
        padding: 0;
        border: 0;
        border-radius: 999px;
        background: transparent;
        cursor: pointer;
      }
      .rpm-m-dot-mark {
        width: 7px;
        height: 7px;
        border-radius: 999px;
        background: var(--ink-300);
      }
      .rpm-m-dot[aria-current="true"] .rpm-m-dot-mark {
        width: 9px;
        height: 9px;
        background: var(--primary-fill);
      }
      .rpm-m-open:focus-visible,
      .rpm-m-arrow:focus-visible,
      .rpm-m-dot:focus-visible {
        outline: 3px solid var(--ring);
        outline-offset: -3px;
      }
      .rpm-m-track:focus-visible {
        box-shadow: inset 0 0 0 3px var(--ring);
      }
      .rpm-m-viewer {
        display: grid;
        flex: 1 1 auto;
        grid-template-rows: auto minmax(0, 1fr) auto;
        min-height: 0;
        background: var(--esp-immersive-ink);
        color: var(--esp-immersive-on-ink);
      }
      .rpm-m-viewer-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        min-height: 60px;
        padding: var(--sp-2) var(--sp-4);
        font-size: 14px;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
      }
      .rpm-m-viewer-stage {
        position: relative;
        display: grid;
        min-width: 0;
        min-height: 0;
        place-items: center;
        overflow: hidden;
        padding: var(--sp-2);
      }
      .rpm-m-viewer-image {
        display: block;
        width: 100%;
        height: 100%;
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
      }
      .rpm-m-viewer-control,
      .rpm-m-viewer-nav {
        display: grid;
        place-items: center;
        width: 48px;
        height: 48px;
        padding: 0;
        border: 1px solid color-mix(in srgb, var(--esp-immersive-on-ink) 35%, transparent);
        border-radius: 999px;
        background: color-mix(in srgb, var(--esp-immersive-ink) 72%, transparent);
        color: var(--esp-immersive-on-ink);
        cursor: pointer;
      }
      .rpm-m-viewer-nav {
        position: absolute;
        top: 50%;
        transform: translateY(-50%);
      }
      .rpm-m-viewer-nav-previous { left: var(--sp-3); }
      .rpm-m-viewer-nav-next { right: var(--sp-3); }
      .rpm-m-viewer-control:focus-visible,
      .rpm-m-viewer-nav:focus-visible {
        outline: 3px solid var(--esp-immersive-on-ink);
        outline-offset: 2px;
      }
      .rpm-m-viewer-note {
        max-width: 32rem;
        padding: var(--sp-4);
        text-align: center;
      }
      .rpm-m-viewer-footer { min-height: var(--sp-4); }
      @media (prefers-reduced-motion: reduce) {
        .rpm-m-track { scroll-behavior: auto; }
      }
    `

function PresentationStyles() {
  return (
    <style href="reseau-post-media-presentation" precedence="default">{PRESENTATION_CSS}</style>
  )
}

/** Le cadre d'un média : son ratio (borné), ses bandes, aucun recadrage. */
function MediaFrame({ kind, ratio, square, children }: { kind: PostMediaDto["kind"]; ratio: number; square: boolean; children: ReactNode }) {
  return (
    <div className="rpm-m-frame" data-kind={kind} style={{ aspectRatio: aspectRatioValue(ratio), borderRadius: square ? 0 : undefined }}>
      {children}
    </div>
  )
}

/** La place d'un média retenu ou disparu : même cadre, la raison dite en clair. */
function MediaNote({ text }: { text: string }) {
  return (
    <div className="rpm-m-note" role="note">
      {text}
    </div>
  )
}

/**
 * Une image servable, ENTIÈRE dans son cadre. Elle rapporte son ratio réel
 * dès qu'elle est chargée — y compris quand elle l'était avant l'hydratation
 * (`complete`), où `onLoad` ne se rejouerait pas.
 */
function MediaImage({ item, onRatio, onFailed, className = "rpm-m-media" }: { item: ServableMedia; onRatio?: (ratio: number) => void; onFailed: () => void; className?: string }) {
  const ref = useRef<HTMLImageElement>(null)
  useEffect(() => {
    const image = ref.current
    if (!image || !image.complete) return
    const ratio = intrinsicRatio(image.naturalWidth, image.naturalHeight)
    if (ratio !== null) onRatio?.(ratio)
    else onFailed()
  }, [item.url, onRatio, onFailed])
  return (
    // eslint-disable-next-line @next/next/no-img-element -- surface du moteur indépendante de next/image (adaptateur de routage) : URL délivrée par la garde des fichiers, cadre déjà dimensionné.
    <img
      ref={ref}
      className={className}
      src={item.url}
      // Un texte alternatif absent vaut IMAGE DÉCORATIVE (`alt=""`) plutôt
      // qu'un nom de fichier lu à voix haute.
      alt={item.altText ?? ""}
      loading="lazy"
      decoding="async"
      onLoad={(event) => {
        const ratio = intrinsicRatio(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)
        if (ratio !== null) onRatio?.(ratio)
      }}
      onError={onFailed}
    />
  )
}

/**
 * `primary` : les médias de la publication ELLE-MÊME (coordination vidéo,
 * mémoire de la galerie), jamais ceux d'une publication citée — par défaut,
 * ceux qui traversent la carte bord à bord. `inset` : posés dans la carte, à
 * l'angle des photos (présentation « charte », ADR-0028).
 */
export interface MediaPlacement {
  bleed: MediaBleed | null
  primary: boolean
  inset: boolean
}

export function PostMediaPresentation({ media, bleed, primary = bleed !== null, inset = false }: { media: readonly PostMediaDto[]; bleed: MediaBleed | null; primary?: boolean; inset?: boolean }) {
  const placement: MediaPlacement = { bleed, primary, inset }
  // Le DTO n'expose pas d'identifiant de stockage. Son contenu suffit à
  // délimiter l'état de présentation : index, erreurs et visionneuse ne
  // passent jamais d'une série de médias à une autre de même longueur.
  const mediaKey = JSON.stringify(media)
  const video = media.find((item) => item.kind === "video")
  if (video) return <MediaVideo key={mediaKey} item={video} placement={placement} />
  const images = media.filter((item) => item.kind === "image")
  if (images.length === 0) return null
  if (images.length === 1) return <MediaSingleImage key={mediaKey} item={images[0]!} placement={placement} />
  return <MediaGallery key={mediaKey} images={images} placement={placement} />
}

/** Une vidéo seule (règle du domaine) : en ligne, commandes natives, jamais lue d'elle-même. */
function MediaVideo({ item, placement }: { item: PostMediaDto; placement: MediaPlacement }) {
  const { bleed } = placement
  const { t } = useTranslation("reseau")
  const [measured, setMeasured] = useState<number | null>(null)
  const [failed, setFailed] = useState(false)
  const ref = useRef<HTMLVideoElement>(null)
  const servable = isServable(item) && !failed
  useEffect(() => {
    const element = ref.current
    // Métadonnées déjà là (rendu serveur, cache) : `loadedmetadata` est passé.
    if (!element || element.readyState < 1) return
    const ratio = intrinsicRatio(element.videoWidth, element.videoHeight)
    if (ratio !== null) setMeasured(ratio)
  }, [item.url])
  const ratio = frameRatioFor("video", measured ?? declaredRatio(item))
  // P04 : `null` sans coordinateur monté — alors rien ne change ci-dessous.
  // `primary` : la vidéo de la publication (bord à bord ou posée), jamais celle d'une citation.
  const playback = useCoordinatedVideo(ref, { enabled: servable, primary: placement.primary })
  return (
    <div className="rpm-m" style={bleed ?? undefined} data-inset={placement.inset ? "" : undefined}>
      <PresentationStyles />
      <MediaFrame kind="video" ratio={ratio} square={bleed !== null}>
        {servable ? (
          <video
            ref={ref}
            className="rpm-m-media"
            src={item.url ?? undefined}
            controls
            preload={playback?.preload ?? "metadata"}
            playsInline
            aria-label={item.altText ?? t("postMedia.videoLabel")}
            onLoadedMetadata={(event) => {
              const next = intrinsicRatio(event.currentTarget.videoWidth, event.currentTarget.videoHeight)
              if (next !== null) setMeasured(next)
            }}
            onError={() => setFailed(true)}
          />
        ) : (
          <MediaNote text={failed ? t("postMedia.mediaUnavailable") : withheldText(item, t)} />
        )}
        {servable && playback !== null ? <CoordinatedVideoControls video={playback} /> : null}
      </MediaFrame>
    </div>
  )
}

/** Une photo seule : son cadre, et l'original entier dans la visionneuse. */
function MediaSingleImage({ item, placement }: { item: PostMediaDto; placement: MediaPlacement }) {
  const { bleed } = placement
  const { t } = useTranslation("reseau")
  const [measured, setMeasured] = useState<number | null>(null)
  const [failed, setFailed] = useState(false)
  const [viewerOpen, setViewerOpen] = useState(false)
  const ratio = frameRatioFor("image", measured ?? declaredRatio(item))
  return (
    <div className="rpm-m" style={bleed ?? undefined} data-inset={placement.inset ? "" : undefined}>
      <PresentationStyles />
      <MediaFrame kind="image" ratio={ratio} square={bleed !== null}>
        {!isServable(item) ? (
          <MediaNote text={withheldText(item, t)} />
        ) : failed ? (
          <MediaNote text={t("postMedia.unavailable")} />
        ) : (
          <button type="button" className="rpm-m-open" onClick={() => setViewerOpen(true)}>
            <MediaImage item={item} onRatio={setMeasured} onFailed={() => setFailed(true)} />
            <span className="sr-only">{t("postMedia.expandSingle")}</span>
          </button>
        )}
      </MediaFrame>
      {viewerOpen ? (
        <MediaViewer images={[item]} index={0} onIndex={() => undefined} onClose={() => setViewerOpen(false)} />
      ) : null}
    </div>
  )
}

/** Deux à quatre photos : une à la fois, index, flèches, points, clavier, visionneuse. */
function MediaGallery({ images, placement }: { images: readonly PostMediaDto[]; placement: MediaPlacement }) {
  const { bleed } = placement
  const { t } = useTranslation("reseau")
  const trackRef = useRef<HTMLDivElement>(null)
  // P04 : la mémoire de retour de la publication — seulement pour ses propres
  // médias (bord à bord ou posés), jamais pour la galerie d'une publication citée.
  const postMemory = useOptionalFeedPostMemory()
  const memory = placement.primary ? postMemory : null
  const [activeIndex, setActiveIndex] = useState(() => memory?.initialGalleryIndex ?? 0)
  const [measuredFirst, setMeasuredFirst] = useState<number | null>(null)
  const [failed, setFailed] = useState<ReadonlySet<number>>(() => new Set())
  const [viewerOpen, setViewerOpen] = useState(false)
  const count = images.length
  const index = clampCarouselIndex(activeIndex, count)
  const indexRef = useRef(index)
  indexRef.current = index

  // P04 : l'image montrée suit la mémoire de retour (sans effet hors du fil).
  useEffect(() => {
    memory?.reportGalleryIndex(index)
  }, [memory, index])

  useEffect(() => {
    const track = trackRef.current
    if (!track) return
    const align = () => { track.scrollLeft = indexRef.current * track.clientWidth }
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", align)
      return () => window.removeEventListener("resize", align)
    }
    const observer = new ResizeObserver(align)
    observer.observe(track)
    return () => observer.disconnect()
  }, [])

  const scrollToIndex = (requested: number, behavior: ScrollBehavior = "smooth") => {
    const next = clampCarouselIndex(requested, count)
    setActiveIndex(next)
    const track = trackRef.current
    if (!track) return
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
    const left = next * track.clientWidth
    if (typeof track.scrollTo === "function") track.scrollTo({ left, behavior: reduceMotion ? "auto" : behavior })
    else track.scrollLeft = left
  }

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.defaultPrevented) return
    const next = carouselIndexForKey(event.key, index, count)
    if (next === null) return
    event.preventDefault()
    scrollToIndex(next)
  }

  const handleScroll = () => {
    const track = trackRef.current
    if (!track) return
    const next = carouselIndexFromScroll(track.scrollLeft, track.clientWidth, count)
    setActiveIndex((current) => (current === next ? current : next))
  }

  const markFailed = (position: number) =>
    setFailed((current) => (current.has(position) ? current : new Set([...current, position])))

  const announcement = t("postMedia.position", { position: index + 1, total: count })
  const ratio = galleryFrameRatio(images, measuredFirst)

  return (
    <div className="rpm-m" style={bleed ?? undefined} data-inset={placement.inset ? "" : undefined}>
      <PresentationStyles />
      <MediaFrame kind="image" ratio={ratio} square={bleed !== null}>
        <div
          ref={trackRef}
          className="rpm-m-track"
          role="region"
          aria-roledescription={t("postMedia.carouselRole")}
          aria-label={t("postMedia.carouselLabel", { total: count })}
          tabIndex={0}
          onKeyDown={handleKeyDown}
          onScroll={handleScroll}
        >
          {images.map((item, position) => (
            <div
              key={`${item.url ?? "retenue"}-${position}`}
              className="rpm-m-slide"
              role="group"
              aria-roledescription={t("postMedia.slideRole")}
              aria-label={t("postMedia.position", { position: position + 1, total: count })}
              aria-hidden={position !== index}
            >
              {!isServable(item) ? (
                <MediaNote text={withheldText(item, t)} />
              ) : failed.has(position) ? (
                <MediaNote text={t("postMedia.unavailable")} />
              ) : (
                <button
                  type="button"
                  className="rpm-m-open"
                  tabIndex={position === index ? 0 : -1}
                  onClick={() => {
                    setActiveIndex(position)
                    setViewerOpen(true)
                  }}
                >
                  <MediaImage
                    item={item}
                    onRatio={position === 0 ? setMeasuredFirst : undefined}
                    onFailed={() => markFailed(position)}
                  />
                  <span className="sr-only">{t("postMedia.expand", { position: position + 1, total: count })}</span>
                </button>
              )}
            </div>
          ))}
        </div>
        <span className="rpm-m-counter" aria-hidden="true">
          {index + 1}/{count}
        </span>
        <button type="button" className="rpm-m-arrow rpm-m-arrow-previous" aria-label={t("postMedia.previous")} disabled={index === 0} onClick={() => scrollToIndex(index - 1)}>
          <ChevronLeft size={24} strokeWidth={2} aria-hidden="true" />
        </button>
        <button type="button" className="rpm-m-arrow rpm-m-arrow-next" aria-label={t("postMedia.next")} disabled={index === count - 1} onClick={() => scrollToIndex(index + 1)}>
          <ChevronRight size={24} strokeWidth={2} aria-hidden="true" />
        </button>
      </MediaFrame>
      <div className="rpm-m-dots" role="group" aria-label={t("postMedia.chooseImage")}>
        {images.map((_, position) => (
          <button
            key={position}
            type="button"
            className="rpm-m-dot"
            aria-label={t("postMedia.show", { position: position + 1, total: count })}
            aria-current={position === index ? "true" : undefined}
            onClick={() => scrollToIndex(position)}
          >
            <span className="rpm-m-dot-mark" aria-hidden="true" />
          </button>
        ))}
      </div>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
      {viewerOpen ? (
        <MediaViewer images={images} index={index} onIndex={(next) => scrollToIndex(next, "auto")} onClose={() => setViewerOpen(false)} />
      ) : null}
    </div>
  )
}

/**
 * La visionneuse : l'ORIGINAL entier (`contain`) sur une scène sombre, la
 * position annoncée, précédent et suivant pour une galerie, le clavier
 * (flèches, Début, Fin ; Échap ferme et rend le focus au déclencheur, par
 * `ImmersiveOverlay`).
 */
function MediaViewer({ images, index, onIndex, onClose }: { images: readonly PostMediaDto[]; index: number; onIndex: (index: number) => void; onClose: () => void }) {
  const { t } = useTranslation("reseau")
  const count = images.length
  const gallery = count > 1
  const visibleIndex = clampCarouselIndex(index, count)
  const active = images[visibleIndex]
  const [failedUrls, setFailedUrls] = useState<ReadonlySet<string>>(() => new Set())
  const announcement = gallery
    ? t("postMedia.position", { position: visibleIndex + 1, total: count })
    : t("postMedia.fullscreenSingle")

  // Le clavier de la galerie, tant que la visionneuse est ouverte : un écouteur
  // du document plutôt qu'un gestionnaire sur un conteneur inerte.
  useEffect(() => {
    if (!gallery) return
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.defaultPrevented) return
      const next = carouselIndexForKey(event.key, visibleIndex, count)
      if (next === null) return
      event.preventDefault()
      onIndex(next)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [gallery, visibleIndex, count, onIndex])

  return (
    <ImmersiveOverlay open onClose={onClose} label={gallery ? t("postMedia.fullscreenLabel", { announcement }) : announcement}>
      <div className="rpm-m-viewer">
        <div className="rpm-m-viewer-bar">
          <span aria-hidden="true">{gallery ? `${visibleIndex + 1}/${count}` : null}</span>
          <button type="button" className="rpm-m-viewer-control" aria-label={t("postMedia.closeFullscreen")} onClick={onClose}>
            <X size={24} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
        <div className="rpm-m-viewer-stage" role="group" aria-roledescription={t("postMedia.slideRole")} aria-label={announcement}>
          {active === undefined ? null : !isServable(active) ? (
            <p className="rpm-m-viewer-note" role="note">{withheldText(active, t)}</p>
          ) : failedUrls.has(active.url) ? (
            <p className="rpm-m-viewer-note" role="note">{t("postMedia.unavailable")}</p>
          ) : (
            <MediaImage
              key={`${active.url}-${visibleIndex}`}
              item={active}
              className="rpm-m-viewer-image"
              onFailed={() => setFailedUrls((current) => current.has(active.url) ? current : new Set([...current, active.url]))}
            />
          )}
          {gallery ? (
            <>
              <button type="button" className="rpm-m-viewer-nav rpm-m-viewer-nav-previous" aria-label={t("postMedia.previous")} disabled={visibleIndex === 0} onClick={() => onIndex(visibleIndex - 1)}>
                <ChevronLeft size={28} strokeWidth={2} aria-hidden="true" />
              </button>
              <button type="button" className="rpm-m-viewer-nav rpm-m-viewer-nav-next" aria-label={t("postMedia.next")} disabled={visibleIndex === count - 1} onClick={() => onIndex(visibleIndex + 1)}>
                <ChevronRight size={28} strokeWidth={2} aria-hidden="true" />
              </button>
            </>
          ) : null}
        </div>
        <div className="rpm-m-viewer-footer">
          <p className="sr-only" aria-live="polite" aria-atomic="true">
            {announcement}
          </p>
        </div>
      </div>
    </ImmersiveOverlay>
  )
}
