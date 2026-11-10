import type { ActivityTemplate } from "@antsia/social-domain/activityConfiguration"
import { ChevronRight } from "lucide-react"
import Link from "next/link"

import { routes } from "@/lib/routes"
import { catalogPrice, catalogVariantPrice, type CatalogOffer, type CatalogTranslate } from "./catalog-model"
import { OfferMedia } from "./offer-card"

/**
 * Les formules de publication d'une boutique (étude du 22/10/2026,
 * `docs/etudes/2026-10-22-fil-sans-cadre`). La formule se déduit de l'offre
 * attachée et de la publication, sans réglage de plus pour le vendeur :
 *
 *  · le BANDEAU D'ACTION, toujours : collé au média, bord à bord, titre, prix et
 *    geste — « Réserver » (service sur rendez-vous ; « Obtenir un devis » en
 *    second quand le devis est aussi ouvert), « Obtenir un devis », « Commander »
 *    ou « Acheter » (produit à prix affiché ; « Commander » pour le menu d'une adresse
 *    « Alimentation et restauration », gabarit `food`, SU06) ;
 *  · TROIS VUES : publication sans média, offre d'au moins trois photos — une
 *    grande vue et deux petites, le prix et la boutique dessous ;
 *  · FICHE PRODUIT / PANNEAU PRIX : publication sans média, une ou deux photos —
 *    la photo dans son propre format (borné de 4:5 à 1,91:1, recadrée au centre,
 *    jamais de bandes sur les côtés), puis titre, description et prix ; dès 480 px
 *    de carte, la photo à gauche sur les deux tiers et ce panneau sur le tiers
 *    restant (décision du propriétaire du 22/10/2026) ;
 *  · VIDÉO ET MODÈLES : publication vidéo dont l'offre a des variantes — la
 *    rangée défilante des modèles, chacun avec son prix exact, sous le bandeau.
 *
 * Quand une mise en scène montre déjà le titre et le prix, le bandeau ne porte que
 * le geste. Les liens mènent aux pages réelles (fiche, réservation, devis, commande), où
 * le serveur relit tout. Couleurs : jetons de rôle du thème (`--role-commerce-*`),
 * jamais une marque. Sous la présentation des chartes, la carte du moteur porte
 * le débord bord à bord et colle la formule au média (`.rp-charte-offer`).
 */

/** Ce que la publication montre déjà : la formule ne double jamais ses images. */
export type PostMediaSummary = { count: number; hasVideo: boolean }

export type OfferPostAction = "book" | "quote" | "order" | "orderProduct" | "buy" | "view"
export type OfferPostVisual = "three_views" | "sheet" | "models" | null

/**
 * Le geste principal de l'offre, et le second quand un service ouvre aussi le devis. Le menu d'une adresse
 * « Alimentation et restauration » se commande : même fiche, même panier, payé à la remise.
 */
export function offerPostActions(offer: Pick<CatalogOffer, "kind" | "price" | "serviceProfile">, template?: ActivityTemplate): { primary: OfferPostAction; secondary: "quote" | null } {
  if (offer.kind === "service") {
    const modes = offer.serviceProfile?.commercialModes ?? []
    if (modes.includes("booking")) return { primary: "book", secondary: modes.includes("quote") ? "quote" : null }
    if (modes.includes("quote") || offer.price.mode === "quote") return { primary: "quote", secondary: null }
    if (modes.includes("fixed_order")) return { primary: "order", secondary: null }
    return { primary: "view", secondary: null }
  }
  // Un produit « sur devis » n'a pas de montant à payer : sa fiche, pas un achat.
  if (offer.price.mode === "quote") return { primary: "view", secondary: null }
  return { primary: template === "food" ? "orderProduct" : "buy", secondary: null }
}

/** La mise en scène : jamais d'images de l'offre quand la publication a déjà les siennes. */
export function offerPostVisual(offer: Pick<CatalogOffer, "media" | "variants">, post: PostMediaSummary): OfferPostVisual {
  if (post.count > 0) return post.hasVideo && offer.variants.length > 0 ? "models" : null
  const photos = offer.media.filter((media) => media.url !== null && media.withheld === null).length
  if (photos >= 3) return "three_views"
  return photos >= 1 ? "sheet" : null
}

/** Le format de la photo d'une fiche : son ratio réel, borné comme les médias du fil (4:5 à 1,91:1). */
export function offerSheetRatio(media: Pick<CatalogOffer["media"][number], "width" | "height"> | undefined): number {
  if (!media?.width || !media.height) return 1
  return Math.min(1.91, Math.max(0.8, media.width / media.height))
}

export function offerActionHref(offer: Pick<CatalogOffer, "kind" | "shopHandle" | "offerRef">, action: OfferPostAction): string {
  if (action === "book") return routes.serviceBooking(offer.shopHandle, offer.offerRef)
  if (action === "quote") return routes.serviceQuote(offer.shopHandle, offer.offerRef)
  if (action === "order") return routes.serviceOrder(offer.shopHandle, offer.offerRef)
  return offer.kind === "service" ? routes.providerOffer(offer.shopHandle, offer.offerRef) : routes.shopOffer(offer.shopHandle, offer.offerRef)
}

const FORMULA_CSS = `
[data-offer-formula] {
  --opf-pad: 12px;
  container: offer-formula / inline-size;
  display: grid;
  gap: 0;
  min-width: 0;
}
[data-offer-formula] .opf-views {
  display: grid;
  grid-template-columns: 2fr 1fr;
  grid-template-rows: 1fr 1fr;
  gap: 2px;
  aspect-ratio: 3 / 2;
  background: var(--muted);
}
[data-offer-formula] .opf-views > :first-child { grid-row: 1 / 3; }
[data-offer-formula] .opf-views img,
[data-offer-formula] .opf-sheet-media img {
  width: 100%;
  height: 100%;
  border-radius: 0;
}
[data-offer-formula] .opf-views img { object-fit: cover; }
[data-offer-formula] .opf-sheet {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  background: var(--card);
}
[data-offer-formula] .opf-sheet-media {
  display: block;
  overflow: hidden;
  background: var(--muted);
}
[data-offer-formula] .opf-sheet-media img { object-fit: cover; }
[data-offer-formula] .opf-info {
  display: grid;
  gap: 4px;
  min-width: 0;
  padding: 12px var(--opf-pad);
}
[data-offer-formula] .opf-title { margin: 0; font-size: 15px; font-weight: 700; line-height: 1.3; overflow-wrap: anywhere; }
[data-offer-formula] .opf-desc {
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: 13px;
  line-height: 1.45;
  color: var(--muted-foreground);
}
[data-offer-formula] .opf-price { margin: 0; font-size: 15px; font-weight: 700; color: var(--role-commerce-ink, var(--foreground)); }
@container offer-formula (min-width: 480px) {
  [data-offer-formula] .opf-sheet { grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); align-items: center; }
}
[data-offer-formula] .opf-cta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 44px;
  padding: 8px var(--opf-pad);
  background: var(--role-commerce-fill, var(--primary-fill));
  color: var(--role-commerce-on, var(--primary-fill-on));
  text-decoration: none;
}
[data-offer-formula] .opf-cta:focus-visible,
[data-offer-formula] .opf-second:focus-visible,
[data-offer-formula] .opf-model:focus-visible {
  outline: 3px solid var(--ring);
  outline-offset: -3px;
}
[data-offer-formula] .opf-cta-text { display: grid; min-width: 0; }
[data-offer-formula] .opf-cta-title,
[data-offer-formula] .opf-cta-price { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
[data-offer-formula] .opf-cta-title { font-size: 14px; font-weight: 700; }
[data-offer-formula] .opf-cta-price { font-size: 12.5px; font-weight: 600; }
[data-offer-formula] .opf-cta-action { display: inline-flex; flex: 0 0 auto; align-items: center; gap: 2px; font-size: 14px; font-weight: 700; }
[data-offer-formula] .opf-cta[data-compact] { justify-content: flex-end; }
[data-offer-formula] .opf-second {
  display: inline-flex;
  align-items: center;
  justify-self: start;
  min-height: 25px;
  margin: 8px var(--opf-pad) 0;
  padding: 3px 10px;
  border-radius: var(--esp-social-action-radius, 6px);
  background: var(--ui2-button-outline-bg, var(--muted));
  color: var(--foreground);
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
}
[data-offer-formula] .opf-models {
  display: flex;
  gap: 8px;
  margin: 0;
  padding: 10px var(--opf-pad) 2px;
  list-style: none;
  overflow-x: auto;
  overscroll-behavior-inline: contain;
  scroll-snap-type: x proximity;
  scrollbar-width: none;
}
[data-offer-formula] .opf-models::-webkit-scrollbar { display: none; }
[data-offer-formula] .opf-model {
  display: grid;
  gap: 2px;
  min-width: 120px;
  max-width: 180px;
  padding: 8px 10px;
  border-radius: var(--esp-media-radius, 12px);
  background: var(--muted);
  color: var(--foreground);
  text-decoration: none;
  scroll-snap-align: start;
}
[data-offer-formula] .opf-model-label { font-size: 13px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
[data-offer-formula] .opf-model-options { font-size: 12px; color: var(--muted-foreground); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
[data-offer-formula] .opf-model-price { font-size: 13px; font-weight: 700; color: var(--role-commerce-ink, var(--foreground)); }
`

export function OfferPostFormula({ offer, postMedia, locale, t, template }: { offer: CatalogOffer; postMedia: PostMediaSummary; locale: string; t: CatalogTranslate; template?: ActivityTemplate }) {
  const actions = offerPostActions(offer, template)
  const visual = offerPostVisual(offer, postMedia)
  const price = catalogPrice(offer.price, locale, t)
  const offerHref = offerActionHref(offer, "view")
  const photos = offer.media.filter((media) => media.url !== null && media.withheld === null)
  /* Titre et prix déjà montrés par la mise en scène : le bandeau ne porte que le geste,
     et son nom accessible rappelle l'offre (le libellé visible y reste en tête). */
  const compact = visual === "sheet" || visual === "three_views"
  return (
    <div data-offer-formula={visual ?? "cta"} data-offer-action={actions.primary}>
      <style>{FORMULA_CSS}</style>
      {visual === "three_views" ? (
        <>
          <Link href={offerHref} prefetch={false} className="opf-views" aria-label={t("catalog.openOfferNamed", { title: offer.title })}>
            {photos.slice(0, 3).map((media, index) => <OfferMedia key={index} media={media} title={offer.title} t={t} className="h-full" />)}
          </Link>
          <div className="opf-info">
            <p className="opf-title">{offer.title}</p>
            <p className="opf-price">{price}</p>
          </div>
        </>
      ) : visual === "sheet" ? (
        <div className="opf-sheet">
          <Link href={offerHref} prefetch={false} className="opf-sheet-media" style={{ aspectRatio: offerSheetRatio(photos[0]) }} aria-label={t("catalog.openOfferNamed", { title: offer.title })}>
            <OfferMedia media={photos[0]} title={offer.title} t={t} className="h-full" />
          </Link>
          <div className="opf-info">
            <p className="opf-title">{offer.title}</p>
            {offer.description ? <p className="opf-desc">{offer.description}</p> : null}
            <p className="opf-price">{price}</p>
          </div>
        </div>
      ) : null}
      <Link href={offerActionHref(offer, actions.primary)} prefetch={false} className="opf-cta" data-compact={compact ? "" : undefined} aria-label={compact ? t("postFormula.actionLabel", { action: t(`postFormula.actions.${actions.primary}`), title: offer.title }) : undefined}>
        {compact ? null : (
          <span className="opf-cta-text">
            <span className="opf-cta-title">{offer.title}</span>
            <span className="opf-cta-price">{price}</span>
          </span>
        )}
        <span className="opf-cta-action">
          {t(`postFormula.actions.${actions.primary}`)}
          <ChevronRight aria-hidden className="size-4" />
        </span>
      </Link>
      {actions.secondary ? (
        <Link href={offerActionHref(offer, actions.secondary)} prefetch={false} className="opf-second">
          {t(`postFormula.actions.${actions.secondary}`)}
        </Link>
      ) : null}
      {visual === "models" ? (
        <ul className="opf-models" aria-label={t("postFormula.models", { title: offer.title })}>
          {offer.variants.map((variant) => (
            <li key={variant.variantRef}>
              <Link href={routes.shopOffer(offer.shopHandle, offer.offerRef, { variantRef: variant.variantRef })} prefetch={false} className="opf-model">
                <span className="opf-model-label">{variant.label}</span>
                {/* Les options ne s'affichent que si elles disent autre chose que le libellé. */}
                {variant.options.length && !variant.label.includes(variant.options.join(" · ")) ? <span className="opf-model-options">{variant.options.join(" · ")}</span> : null}
                <span className="opf-model-price">{catalogVariantPrice(offer.price, variant, locale, t)}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
