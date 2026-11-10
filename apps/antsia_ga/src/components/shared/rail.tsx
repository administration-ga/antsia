"use client"

import { cn } from "@antsia/ui/lib/cn"
import { ChevronLeft, ChevronRight } from "lucide-react"
import Link from "next/link"
import { Children, useId, useRef, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

/**
 * La largeur d'une case selon ce que le carrousel présente : au téléphone, deux produits et le bord du suivant,
 * ou une grande carte et le bord de la suivante ; au bureau, une largeur fixe. Le pourcentage se lit sur la
 * largeur du carrousel lui-même.
 */
const ITEM_COLUMNS = {
  product: "auto-cols-[clamp(9.5rem,calc((100%-1.5rem)/2.3),14rem)]",
  card: "auto-cols-[clamp(15rem,86%,25rem)]",
} as const

/**
 * Un « moment » qui défile (décision du propriétaire du 22/10/2026, sur le modèle des ventes privées) : titre,
 * lien « Voir tout », cases accrochées au défilement et boutons précédent / suivant dès 768 px. Rien ne déborde
 * de la colonne : le défilement reste DANS le carrousel, jamais sur la page.
 */
export function Rail({ title, href, linkLabel, size, label, level = 2, children }: { title?: string; href?: string; linkLabel?: string; size: keyof typeof ITEM_COLUMNS; label?: string; level?: 2 | 3; children: ReactNode }) {
  const { t } = useTranslation("antsia")
  const id = useId()
  const Heading = level === 3 ? "h3" : "h2"
  const scroller = useRef<HTMLUListElement>(null)
  const move = (direction: -1 | 1) => {
    const node = scroller.current
    if (!node) return
    const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (typeof node.scrollBy === "function") node.scrollBy({ left: direction * Math.max(node.clientWidth * 0.85, 1), behavior: reduce ? "auto" : "smooth" })
  }
  const items = Children.toArray(children)
  if (!items.length) return null
  return <section aria-labelledby={title ? id : undefined} aria-label={title ? undefined : label} className="grid min-w-0 gap-3" data-rail={size}>
    {title || href ? <div className="flex min-w-0 items-center justify-between gap-3">
      {title ? <Heading id={id} className={`min-w-0 break-words ${level === 3 ? "text-base font-semibold" : "mp-subtitle"}`}>{title}</Heading> : <span />}
      <div className="flex shrink-0 items-center gap-1">
        {href && linkLabel ? <Link href={href} prefetch={false} className="inline-flex min-h-11 items-center rounded-[var(--ui2-button-radius)] px-3 text-sm font-semibold text-[color:var(--role-commerce-ink,var(--primary))] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{linkLabel}</Link> : null}
        <button type="button" aria-label={t("carousel.previous")} aria-controls={`${id}-list`} onClick={() => move(-1)} className={RAIL_BUTTON}><ChevronLeft aria-hidden className="size-5" /></button>
        <button type="button" aria-label={t("carousel.next")} aria-controls={`${id}-list`} onClick={() => move(1)} className={RAIL_BUTTON}><ChevronRight aria-hidden className="size-5" /></button>
      </div>
    </div> : null}
    <ul id={`${id}-list`} ref={scroller} className={cn("grid min-w-0 grid-flow-col gap-3 min-[768px]:gap-gutter overflow-x-auto overscroll-x-contain pb-1 snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", ITEM_COLUMNS[size])}>
      {items.map((item, index) => <li key={index} className="min-w-0 snap-start">{item}</li>)}
    </ul>
  </section>
}

const RAIL_BUTTON = "hidden size-11 items-center justify-center rounded-full bg-card text-foreground shadow-[var(--esp-shadow-float)] hover:brightness-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-[768px]:inline-flex"
