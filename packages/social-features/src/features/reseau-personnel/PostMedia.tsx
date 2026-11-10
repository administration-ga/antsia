// Dupliqué de socle/packages/agent-features/src/features/reseau-personnel/PostMedia.tsx @ ad2e7fdc2 — adaptations : type `PostMediaDto` du contrat `@antsia/social-contracts/media` ; un média RETENU par la garde des fichiers (`url` nulle, `withheld` : analyse en cours ou bloqué) garde sa place et dit pourquoi (textes du code, espace `errors`) au lieu d'un lien mort — image, vidéo et carrousel ; libellés et annonces par l'i18n (clés `reseau:postMedia.*`) ; surface plein écran de `@antsia/ui/overlay` (charte de l'application) ; cadre, carrousel et gestes inchangés ; feuille de style sortie du JSX dans une constante de module (`POST_MEDIA_CSS`) — un littéral enfant de `<style>` passerait pour une chaîne d'interface — règles inchangées ; P03 (étude social-commerce) : présentation « media » déclarée par l'application (`presentation`, sinon `useOptionalNetwork().postPresentation`), rendue par `PostMediaPresentation` — ratio réel borné, galerie et visionneuse —, la présentation historique restant le défaut, à l'identique ; ADR-0028 : présentation « charte » — les mêmes cadre, galerie et visionneuse que « media », POSÉS dans la carte à l'angle des photos (`inset`), la publication elle-même désignée par `primary` (coordination vidéo, mémoire de galerie).
"use client"

/**
 * Les médias d'une publication.
 *
 * Une image reste pleine largeur ; de deux à quatre images, le fil devient un
 * carrousel à défilement natif. Une vidéo est toujours seule (règle du
 * domaine) — elle occupe le CADRE STANDARD du fil, jamais plus (cf.
 * `STANDARD_RATIO`).
 *
 * Le serveur ne rend que des URLs résolues par la garde des fichiers : ce
 * composant n'a aucun identifiant de stockage à manipuler, et c'est voulu. Un
 * média que la garde RETIENT (analyse en cours, ou bloqué) arrive sans URL et
 * avec sa raison : il garde sa place et la DIT, plutôt qu'un cadre vide.
 *
 * ── BORD À BORD (arbitrage du 2026-08-20) ────────────────────────────────
 * Dans le fil, le média TRAVERSE la gouttière de la carte : pas de marge
 * latérale, pas de coins arrondis. Une photo encadrée de vingt pixels de
 * parchemin se lit comme une pièce jointe ; à pleine largeur, elle est la
 * publication. C'est l'appelant qui le demande, par `gutter` — le média
 * ne connaît pas le rembourrage de la carte qui l'accueille, et le partage
 * IMBRIQUÉ (`SharedPostCard`) garde le sien, lui qui a son propre cadre :
 * l'en faire sortir déchirerait la carte citée.
 *
 * ⚠️ Sans valeur, `gutter` vaut zéro et rien ne change. Le débord n'a pas de
 * coin à raboter parce que le média n'est JAMAIS en bord de carte : l'en-tête
 * de l'auteur le précède, la barre de réactions le suit toujours.
 */

import { useOptionalNetwork, type EnginePostPresentation } from "@antsia/api/network"
import type { MediaWithheld, PostMediaDto } from "@antsia/social-contracts/media"
import { ImmersiveOverlay } from "@antsia/ui/overlay"
import { ChevronLeft, ChevronRight, Maximize2, X } from "lucide-react"
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react"
import { useTranslation } from "react-i18next"
import {
  carouselIndexForKey,
  carouselIndexFromScroll,
  clampCarouselIndex,
} from "./post-media-carousel"
import { PostMediaPresentation } from "./PostMediaPresentation"

/**
 * LE format du fil — un seul cadre pour tout média seul, image comme vidéo
 * (décision utilisateur du 2026-08-21 : « quel que soit le média, on reste
 * dans ce format standard et la vidéo s'adapte »). Une vidéo verticale
 * n'étire plus la carte sur tout l'écran : elle se loge dans le cadre,
 * bandes sombres de part et d'autre, et le plein écran reste à un geste
 * (les commandes natives du lecteur). C'est aussi le ratio réservé AVANT
 * chargement — le fil ne saute pas sous le curseur.
 */
const STANDARD_RATIO = "16 / 10"

/**
 * Pourquoi un média n'a pas d'URL : la retenue nommée par la garde, sinon une
 * absence (le texte dit alors « média indisponible »). Les phrases sont celles des
 * codes de la garde (espace `errors`) — l'écran ne les réécrit pas.
 */
function withheldKey(withheld: MediaWithheld | null): string {
  return withheld === null ? "reseau:postMedia.mediaUnavailable" : `errors:${withheld}`
}

export function PostMedia({
  media,
  gutter = 0,
  presentation,
  primary = false,
}: {
  media: readonly PostMediaDto[]
  /** Le rembourrage lateral de la carte hote, que le media TRAVERSE. */
  gutter?: number
  /**
   * La présentation voulue. Absente : celle que l'application déclare
   * (`NetworkProvider postPresentation`), « classic » hors de tout réseau.
   * Une surface hors réseau (la carte publique servie sans compte) la passe
   * explicitement.
   */
  presentation?: EnginePostPresentation
  /**
   * Les médias de la publication ELLE-MÊME, posés dans sa carte (présentation
   * « charte ») : ils suivent le coordinateur de lecture et la mémoire de
   * galerie, jamais ceux d'une publication citée. Ailleurs, le débord en décide.
   */
  primary?: boolean
}) {
  const { t } = useTranslation("reseau")
  const network = useOptionalNetwork()
  const mode: EnginePostPresentation = presentation ?? network?.postPresentation ?? "classic"
  if (media.length === 0) return null

  // Le debord, ecrit une fois : marges negatives et largeur rendue, plus le
  // rayon qui disparait des qu'on touche les bords.
  // ⚠️ `maxWidth: "none"` n'est pas decoratif : le preflight Tailwind pose
  // `video { max-width: 100% }`, qui PLAFONNAIT la largeur calculee — la
  // video ne traversait jamais la gouttiere, seule sa marge negative
  // s'appliquait (constate le 2026-08-21, defaut muet depuis l'arbitrage
  // bord a bord). Les images n'y echappaient que parce que le debord porte
  // sur leur GRILLE, un div sans plafond.
  const bleed =
    gutter > 0
      ? {
          marginInline: -gutter,
          width: `calc(100% + ${gutter * 2}px)`,
          maxWidth: "none",
          borderRadius: 0,
        }
      : null

  // Présentation « media » (opt-in de l'application) : son propre rendu. Tout
  // ce qui suit reste la présentation historique, intouchée.
  if (mode === "media") return <PostMediaPresentation media={media} bleed={bleed} />
  // Présentation « charte » (ADR-0028) : jamais de débord, le média est posé.
  if (mode === "charte") return <PostMediaPresentation media={media} bleed={null} primary={primary} inset />

  const video = media.find((item) => item.kind === "video")
  if (video) {
    // Retenue par la garde : la place reste, la raison se dit — jamais un
    // lecteur pointé sur rien.
    if (video.url === null) {
      return (
        <WithheldTile
          text={t(withheldKey(video.withheld))}
          ratio={STANDARD_RATIO}
          bleed={bleed}
        />
      )
    }
    return (
      <video
        src={video.url}
        controls
        preload="metadata"
        // Jamais de lecture automatique : un fil qui parle tout seul est une
        // agression, et sur mobile c'est aussi de la donnée consommée sans
        // l'avoir demandé.
        style={{
          width: "100%",
          // LE cadre standard du fil, comme les images — la vidéo S'ADAPTE
          // dedans (`contain` : on ne recadre pas une vidéo, ses commandes et
          // son contenu doivent rester entiers ; les bandes sont sombres).
          aspectRatio: STANDARD_RATIO,
          objectFit: "contain",
          borderRadius: 8,
          background: "var(--ink-900)",
          display: "block",
          ...bleed,
        }}
        aria-label={video.altText ?? t("postMedia.videoLabel")}
      />
    )
  }

  const images = media.filter((item) => item.kind === "image")
  if (images.length === 0) return null

  // Une image seule garde STRICTEMENT son rendu historique. Le carrousel ne
  // s'active qu'à partir de deux photos ; il ne touche donc ni au cadre vidéo
  // ni à la publication mono-image.
  if (images.length > 1) {
    return <ImageCarousel images={images} bleed={bleed} />
  }

  const layout = gridLayoutFor(images.length)

  return (
    <div
      style={{
        display: "grid",
        gap: 4,
        borderRadius: 8,
        overflow: "hidden",
        ...layout,
        ...bleed,
      }}
    >
      {images.map((item, index) => (
        <ImageTile
          key={item.url ?? `retenue-${index}`}
          item={item}
          span={index === 0 && images.length === 3 ? 2 : 1}
          single={images.length === 1}
        />
      ))}
    </div>
  )
}

function ImageCarousel({
  images,
  bleed,
}: {
  images: readonly PostMediaDto[]
  bleed: {
    marginInline: number
    width: string
    maxWidth: string
    borderRadius: number
  } | null
}) {
  const { t } = useTranslation("reseau")
  const viewportRef = useRef<HTMLDivElement>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [fullscreenOpen, setFullscreenOpen] = useState(false)
  const count = images.length

  useEffect(() => {
    setActiveIndex((current) => clampCarouselIndex(current, count))
  }, [count])

  const scrollToIndex = (requestedIndex: number) => {
    const index = clampCarouselIndex(requestedIndex, count)
    setActiveIndex(index)
    const viewport = viewportRef.current
    if (!viewport) return
    const reduceMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)"
    ).matches
    viewport.scrollTo({
      left: index * viewport.clientWidth,
      behavior: reduceMotion ? "auto" : "smooth",
    })
  }

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    const nextIndex = carouselIndexForKey(event.key, activeIndex, count)
    if (nextIndex === null) return
    event.preventDefault()
    scrollToIndex(nextIndex)
  }

  const handleScroll = () => {
    const viewport = viewportRef.current
    if (!viewport) return
    const nextIndex = carouselIndexFromScroll(
      viewport.scrollLeft,
      viewport.clientWidth,
      count
    )
    setActiveIndex((current) => (current === nextIndex ? current : nextIndex))
  }

  const announcement = t("postMedia.position", { position: activeIndex + 1, total: count })
  const activeImage = images[activeIndex]

  return (
    <>
      <PostMediaStyles />
      <div className="rpm-carousel" style={{ ...bleed }}>
        <div
          ref={viewportRef}
          className="rpm-carousel-viewport"
          role="region"
          aria-roledescription={t("postMedia.carouselRole")}
          aria-label={t("postMedia.carouselLabel", { total: count })}
          tabIndex={0}
          onKeyDown={handleKeyDown}
          onScroll={handleScroll}
        >
          {images.map((item, index) => (
            <div
              key={`${item.url}-${index}`}
              className="rpm-carousel-slide"
              role="group"
              aria-roledescription={t("postMedia.slideRole")}
              aria-label={t("postMedia.position", { position: index + 1, total: count })}
              aria-hidden={index !== activeIndex}
            >
              <button
                type="button"
                className="rpm-carousel-expand"
                tabIndex={index === activeIndex ? 0 : -1}
                aria-label={t("postMedia.expand", { position: index + 1, total: count })}
                onClick={() => {
                  setActiveIndex(index)
                  setFullscreenOpen(true)
                }}
              >
                <ImageTile item={item} span={1} single />
                <span className="rpm-expand-hint" aria-hidden="true">
                  <Maximize2 size={18} strokeWidth={2} />
                </span>
              </button>
            </div>
          ))}
        </div>

        <CarouselArrow
          direction="previous"
          disabled={activeIndex === 0}
          onClick={() => scrollToIndex(activeIndex - 1)}
        />
        <CarouselArrow
          direction="next"
          disabled={activeIndex === count - 1}
          onClick={() => scrollToIndex(activeIndex + 1)}
        />

        <span className="rpm-carousel-counter" aria-hidden="true">
          {activeIndex + 1}/{count}
        </span>
        <CarouselDots
          count={count}
          activeIndex={activeIndex}
          onSelect={scrollToIndex}
        />
        <p className="sr-only" aria-live="polite" aria-atomic="true">
          {announcement}
        </p>
      </div>

      <ImmersiveOverlay
        open={fullscreenOpen}
        onClose={() => setFullscreenOpen(false)}
        label={t("postMedia.fullscreenLabel", { announcement })}
      >
        <div className="rpm-lightbox" onKeyDown={handleKeyDown}>
          <div className="rpm-lightbox-header">
            <span aria-hidden="true">{announcement}</span>
            <button
              type="button"
              className="rpm-lightbox-control"
              aria-label={t("postMedia.closeFullscreen")}
              onClick={() => setFullscreenOpen(false)}
            >
              <X size={24} strokeWidth={2} aria-hidden="true" />
            </button>
          </div>

          <div
            className="rpm-lightbox-stage"
            role="group"
            aria-roledescription={t("postMedia.slideRole")}
            aria-label={announcement}
          >
            {activeImage !== undefined ? (
              <ImageTile
                key={`${activeImage.url ?? "image"}-${activeIndex}-fullscreen`}
                item={activeImage}
                span={1}
                single
                fit="contain"
              />
            ) : null}
            <button
              type="button"
              className="rpm-lightbox-nav rpm-lightbox-nav-previous"
              aria-label={t("postMedia.previous")}
              disabled={activeIndex === 0}
              onClick={() => scrollToIndex(activeIndex - 1)}
            >
              <ChevronLeft size={28} strokeWidth={2} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="rpm-lightbox-nav rpm-lightbox-nav-next"
              aria-label={t("postMedia.next")}
              disabled={activeIndex === count - 1}
              onClick={() => scrollToIndex(activeIndex + 1)}
            >
              <ChevronRight size={28} strokeWidth={2} aria-hidden="true" />
            </button>
          </div>

          <div className="rpm-lightbox-footer">
            <CarouselDots
              count={count}
              activeIndex={activeIndex}
              onSelect={scrollToIndex}
            />
            <p className="sr-only" aria-live="polite" aria-atomic="true">
              {announcement}
            </p>
          </div>
        </div>
      </ImmersiveOverlay>
    </>
  )
}

function CarouselArrow({
  direction,
  disabled,
  onClick,
}: {
  direction: "previous" | "next"
  disabled: boolean
  onClick: () => void
}) {
  const { t } = useTranslation("reseau")
  const previous = direction === "previous"
  return (
    <button
      type="button"
      className={`rpm-carousel-arrow ${previous ? "rpm-carousel-arrow-previous" : "rpm-carousel-arrow-next"}`}
      aria-label={previous ? t("postMedia.previous") : t("postMedia.next")}
      disabled={disabled}
      onClick={onClick}
    >
      {previous ? (
        <ChevronLeft size={24} strokeWidth={2} aria-hidden="true" />
      ) : (
        <ChevronRight size={24} strokeWidth={2} aria-hidden="true" />
      )}
    </button>
  )
}

function CarouselDots({
  count,
  activeIndex,
  onSelect,
}: {
  count: number
  activeIndex: number
  onSelect: (index: number) => void
}) {
  const { t } = useTranslation("reseau")
  return (
    <div
      className="rpm-carousel-dots"
      role="group"
      aria-label={t("postMedia.chooseImage")}
    >
      {Array.from({ length: count }, (_, index) => (
        <button
          key={index}
          type="button"
          className="rpm-carousel-dot"
          aria-label={t("postMedia.show", { position: index + 1, total: count })}
          aria-current={index === activeIndex ? "true" : undefined}
          onClick={() => onSelect(index)}
        >
          <span className="rpm-carousel-dot-mark" aria-hidden="true" />
        </button>
      ))}
    </div>
  )
}

/**
 * La feuille des médias, hors du JSX : un littéral enfant de `<style>`
 * passerait pour une chaîne d'interface (cliquet `no-hardcoded-strings`).
 */
const POST_MEDIA_CSS = `
      .rpm-carousel {
        position: relative;
        overflow: hidden;
        border-radius: var(--radius-lg);
        background: var(--ink-100);
      }
      .rpm-carousel-viewport {
        display: flex;
        width: 100%;
        aspect-ratio: 16 / 10;
        overflow-x: auto;
        overflow-y: hidden;
        overscroll-behavior-inline: contain;
        scroll-snap-type: x mandatory;
        scrollbar-width: none;
        outline: none;
      }
      .rpm-carousel-viewport::-webkit-scrollbar { display: none; }
      .rpm-carousel-viewport:focus-visible {
        box-shadow: inset 0 0 0 3px var(--primary-400);
      }
      .rpm-carousel-slide {
        flex: 0 0 100%;
        width: 100%;
        height: 100%;
        scroll-snap-align: center;
        scroll-snap-stop: always;
      }
      .rpm-carousel-expand {
        position: relative;
        display: grid;
        width: 100%;
        height: 100%;
        min-width: 44px;
        min-height: 44px;
        padding: 0;
        overflow: hidden;
        border: 0;
        background: var(--ink-100);
        color: var(--ink-900);
        cursor: zoom-in;
      }
      .rpm-carousel-expand:focus-visible,
      .rpm-carousel-arrow:focus-visible,
      .rpm-carousel-dot:focus-visible,
      .rpm-lightbox-control:focus-visible,
      .rpm-lightbox-nav:focus-visible {
        outline: 3px solid var(--primary-400);
        outline-offset: -3px;
      }
      .rpm-expand-hint,
      .rpm-carousel-counter {
        position: absolute;
        top: var(--sp-2);
        display: grid;
        place-items: center;
        min-width: 44px;
        min-height: 44px;
        border: 1px solid var(--ink-200);
        border-radius: var(--radius-lg);
        background: var(--ink-0);
        color: var(--ink-900);
        box-shadow: var(--shadow-sm);
        pointer-events: none;
      }
      .rpm-expand-hint { left: var(--sp-2); }
      .rpm-carousel-counter {
        right: var(--sp-2);
        padding-inline: var(--sp-3);
        font-size: 13px;
        font-weight: 700;
      }
      .rpm-carousel-arrow {
        position: absolute;
        top: 50%;
        display: none;
        place-items: center;
        width: 44px;
        height: 44px;
        padding: 0;
        transform: translateY(-50%);
        border: 1px solid var(--ink-200);
        border-radius: 999px;
        background: var(--ink-0);
        color: var(--ink-900);
        box-shadow: var(--shadow-md);
        cursor: pointer;
      }
      .rpm-carousel-arrow-previous { left: var(--sp-2); }
      .rpm-carousel-arrow-next { right: var(--sp-2); }
      .rpm-carousel-arrow:disabled,
      .rpm-lightbox-nav:disabled {
        visibility: hidden;
        pointer-events: none;
      }
      .rpm-carousel-dots {
        position: absolute;
        right: 50%;
        bottom: 0;
        display: flex;
        transform: translateX(50%);
      }
      .rpm-carousel-dot {
        display: grid;
        place-items: center;
        width: 44px;
        height: 44px;
        padding: 0;
        border: 0;
        background: transparent;
        cursor: pointer;
      }
      .rpm-carousel-dot-mark {
        width: 7px;
        height: 7px;
        border: 1px solid var(--ink-0);
        border-radius: 999px;
        background: var(--ink-300);
        box-shadow: var(--shadow-xs);
      }
      .rpm-carousel-dot[aria-current="true"] .rpm-carousel-dot-mark {
        width: 9px;
        height: 9px;
        background: var(--primary-fill);
      }
      .rpm-lightbox {
        display: grid;
        flex: 1 1 auto;
        grid-template-rows: auto minmax(0, 1fr) auto;
        min-height: 0;
        background: var(--ink-100);
        color: var(--ink-900);
      }
      .rpm-lightbox-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        min-height: 60px;
        padding: var(--sp-2) var(--sp-4);
        font-size: 14px;
        font-weight: 700;
      }
      .rpm-lightbox-control,
      .rpm-lightbox-nav {
        display: grid;
        place-items: center;
        width: 48px;
        height: 48px;
        padding: 0;
        border: 1px solid var(--ink-200);
        border-radius: 999px;
        background: var(--ink-0);
        color: var(--ink-900);
        box-shadow: var(--shadow-sm);
        cursor: pointer;
      }
      .rpm-lightbox-stage {
        position: relative;
        display: grid;
        min-width: 0;
        min-height: 0;
        place-items: center;
        overflow: hidden;
        padding: var(--sp-2);
      }
      .rpm-lightbox-stage > img,
      .rpm-lightbox-stage > div:first-child {
        width: 100%;
        height: 100%;
        max-height: 100%;
      }
      .rpm-lightbox-nav {
        position: absolute;
        top: 50%;
        transform: translateY(-50%);
      }
      .rpm-lightbox-nav-previous { left: var(--sp-3); }
      .rpm-lightbox-nav-next { right: var(--sp-3); }
      .rpm-lightbox-footer {
        position: relative;
        min-height: 52px;
      }
      .rpm-lightbox-footer .rpm-carousel-dots { bottom: var(--sp-1); }
      @media (hover: hover) and (pointer: fine) {
        .rpm-carousel-arrow { display: grid; }
      }
      @media (prefers-reduced-motion: reduce) {
        .rpm-carousel-viewport { scroll-behavior: auto; }
      }
    `

function PostMediaStyles() {
  return (
    <style href="reseau-post-media" precedence="default">{POST_MEDIA_CSS}</style>
  )
}

function gridLayoutFor(count: number) {
  if (count <= 1) return { gridTemplateColumns: "1fr" }
  if (count === 2) return { gridTemplateColumns: "1fr 1fr" }
  // Trois : la première prend toute la hauteur de la colonne de gauche.
  if (count === 3) {
    return { gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr" }
  }
  return { gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr" }
}

/**
 * La place d'un média RETENU par la garde des fichiers : même cadre que le
 * média qu'il remplace (le fil ne saute pas), et la raison dite en clair.
 */
function WithheldTile({
  text,
  ratio,
  bleed,
  span = 1,
}: {
  text: string
  ratio: string
  bleed?: {
    marginInline: number
    width: string
    maxWidth: string
    borderRadius: number
  } | null
  span?: number
}) {
  return (
    <div
      role="note"
      style={{
        display: "grid",
        placeItems: "center",
        width: "100%",
        aspectRatio: ratio,
        padding: 16,
        textAlign: "center",
        borderRadius: 8,
        background: "var(--ink-100)",
        color: "var(--ink-600)",
        fontSize: 13,
        gridRow: span > 1 ? "span 2" : undefined,
        ...bleed,
      }}
    >
      {text}
    </div>
  )
}

function ImageTile({
  item,
  span,
  single,
  fit = "cover",
}: {
  item: PostMediaDto
  span: number
  single: boolean
  fit?: "cover" | "contain"
}) {
  const { t } = useTranslation("reseau")
  const [failed, setFailed] = useState(false)

  // Retenue par la garde des fichiers : la raison, à la place de l'image.
  if (item.url === null) {
    return (
      <WithheldTile
        text={t(withheldKey(item.withheld))}
        ratio={single ? STANDARD_RATIO : "1 / 1"}
        span={span}
      />
    )
  }

  if (failed) {
    // Un média disparu ne fait pas tomber la publication qui le portait — il
    // le DIT, plutôt que de laisser un cadre vide inexplicable.
    return (
      <div
        style={{
          display: "grid",
          placeItems: "center",
          minHeight: 120,
          background: "var(--ink-100)",
          color: "var(--ink-600)",
          fontSize: 13,
          gridRow: span > 1 ? "span 2" : undefined,
        }}
      >
        {t("postMedia.unavailable")}
      </div>
    )
  }

  return (
    <img
      src={item.url}
      // Un texte alternatif absent vaut IMAGE DÉCORATIVE (`alt=""`) plutôt
      // qu'un nom de fichier lu à voix haute par un lecteur d'écran.
      alt={item.altText ?? ""}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      style={{
        width: "100%",
        height: "100%",
        objectFit: fit,
        display: "block",
        // Une image seule tient LE cadre standard ; en grille, le carré.
        aspectRatio: single ? STANDARD_RATIO : "1 / 1",
        background: "var(--ink-100)",
        gridRow: span > 1 ? "span 2" : undefined,
      }}
    />
  )
}
