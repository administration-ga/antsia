"use client"

import { useRef, useState } from "react"

import type { CatalogOffer } from "./catalog-model"
import { OfferMedia } from "./offer-media"

/** Les libellés sont sérialisables et ne dépendent d'aucun fournisseur côté public. */
export type OfferGalleryLabels = {
  photos: string
  choosePhoto: string
  showPhotos: readonly string[]
  noPhoto: string
  mediaWithheld: string
}

/**
 * La galerie de la fiche d'une offre (modèle des ventes privées, 22/10/2026) : les photos défilent au doigt avec
 * leurs points au téléphone ; dès 768 px, des vignettes choisissent la photo affichée. Chaque photo remplit son carré
 * par recadrage centré ; une photo retenue par la garde n'a ni source ni vignette. Rendue aussi au serveur (fiche
 * publique) : sans fournisseur ni compte.
 */
export function OfferGallery({ media, title, labels }: { media: CatalogOffer["media"]; title: string; labels: OfferGalleryLabels }) {
  const [active, setActive] = useState(0)
  const list = useRef<HTMLUListElement>(null)
  const slides = media.length ? media : [undefined]
  const mediaText = (key: string) => key === "catalog.mediaWithheld" ? labels.mediaWithheld : labels.noPhoto
  const show = (index: number) => {
    const node = list.current
    if (!node) return
    const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (typeof node.scrollTo === "function") node.scrollTo({ left: index * node.clientWidth, behavior: reduce ? "auto" : "smooth" })
    setActive(index)
  }
  return <div className="grid min-w-0 gap-3" data-offer-gallery>
    <ul ref={list} aria-label={labels.photos} onScroll={event => { const node = event.currentTarget; setActive(Math.round(node.scrollLeft / Math.max(node.clientWidth, 1))) }} className="flex min-w-0 snap-x snap-mandatory overflow-x-auto overscroll-x-contain rounded-[var(--esp-media-radius)] bg-background [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {slides.map((item, index) => <li key={index} className="w-full shrink-0 snap-start"><OfferMedia media={item} title={title} t={mediaText} eager={index === 0} className="aspect-square bg-background" /></li>)}
    </ul>
    {slides.length > 1 ? <>
      <div aria-hidden="true" className="flex justify-center gap-1.5 min-[768px]:hidden" data-offer-dots>{slides.map((_, index) => <span key={index} className={`size-1.5 rounded-full ${index === active ? "bg-foreground" : "bg-muted-foreground/40"}`} />)}</div>
      <ul aria-label={labels.choosePhoto} className="hidden min-w-0 flex-wrap gap-2 min-[768px]:flex">{slides.map((item, index) => item && item.withheld === null && item.url ? <li key={index}><button type="button" aria-label={labels.showPhotos[index]} aria-pressed={index === active} onClick={() => show(index)} className="block size-16 overflow-hidden rounded-[var(--esp-media-radius)] bg-background ring-offset-2 ring-offset-card hover:brightness-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-pressed:ring-2 aria-pressed:ring-[var(--role-commerce-fill,var(--primary-fill))]"><OfferMedia media={item} title={title} t={mediaText} className="aspect-square bg-background" /></button></li> : null)}</ul>
    </> : null}
  </div>
}
