"use client"

/**
 * FeedListReturn — le retour à la même publication en mode LISTE (lot P04,
 * 04 §4). Composant sans rendu visible, posé APRÈS les pages du fil dans le
 * même parent : il lit les enveloppes `[data-feed-anchor]` que `FeedPage` pose
 * autour de chaque carte quand l'application a déclaré le fil immersif.
 *
 *  · suivi : au défilement (une mesure par image), la première carte encore
 *    visible et la position de son bord haut sous la zone lisible du défileur
 *    (après les outils épinglés quand le fil adaptatif les mesure) ;
 *  · retour : la profondeur retenue est rechargée page par page (« Charger la
 *    suite » rejoué, borné) jusqu'à retrouver la carte, puis le défileur est
 *    recalé pour qu'elle revienne exactement où elle était.
 *
 * Aucune adresse n'est retenue ; la mémoire est celle de l'onglet
 * (`feed-return-memory.ts`).
 */
import { useEffect, useRef } from "react"

import { FEED_RETURN_MAX_DEPTH } from "./feed-return-memory"
import type { FeedAnchor, FeedRestoreTarget } from "./ImmersiveFeedReader"
import { restoreStep } from "./immersive-reader-model"
import { findScrollContainer, scheduleFrame, scrollContainerBy, scrollContainerTop } from "./layout-measure"

/** La boîte mesurable d'une enveloppe `display: contents` : sa carte. */
function boxOf(wrapper: HTMLElement): HTMLElement {
  const first = wrapper.firstElementChild
  return first instanceof HTMLElement ? first : wrapper
}

function anchorWrappers(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>("[data-feed-anchor]"))
}

/** La première carte dont le bas est encore sous le haut du défileur. */
export function listAnchorOf(root: HTMLElement, containerTop: number): FeedAnchor | null {
  for (const wrapper of anchorWrappers(root)) {
    const postId = wrapper.getAttribute("data-feed-anchor")
    if (postId === null || postId.length === 0) continue
    const rect = boxOf(wrapper).getBoundingClientRect()
    if (rect.bottom > containerTop + 1) return { postId, offset: Math.round(rect.top - containerTop) }
  }
  return null
}

function findAnchor(root: HTMLElement, postId: string): HTMLElement | null {
  for (const wrapper of anchorWrappers(root)) if (wrapper.getAttribute("data-feed-anchor") === postId) return wrapper
  return null
}

export function FeedListReturn({
  restore,
  onRestored,
  onAnchor,
  canLoadMore,
  exhausted,
  onLoadMore,
}: {
  restore: FeedRestoreTarget | null
  onRestored: (outcome: "found" | "missing") => void
  onAnchor: (anchor: FeedAnchor) => void
  /** La dernière page a répondu avec une suite. */
  canLoadMore: boolean
  /** La chaîne est close. */
  exhausted: boolean
  onLoadMore: () => void
}) {
  const sentinel = useRef<HTMLSpanElement>(null)
  const appended = useRef(0)
  const done = useRef(restore === null)
  const onAnchorRef = useRef(onAnchor)

  useEffect(() => {
    onAnchorRef.current = onAnchor
  }, [onAnchor])

  useEffect(() => {
    appended.current = 0
    done.current = restore === null
  }, [restore])

  // Suivi de la carte lue.
  useEffect(() => {
    const marker = sentinel.current
    const root = marker?.parentElement ?? null
    if (marker === null || root === null) return
    const container = findScrollContainer(marker)
    const target: EventTarget = container ?? window
    let cancel: (() => void) | null = null
    const onScroll = () => {
      if (cancel !== null) return
      cancel = scheduleFrame(() => {
        cancel = null
        const anchor = listAnchorOf(root, scrollContainerTop(container))
        if (anchor !== null) onAnchorRef.current(anchor)
      })
    }
    target.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      cancel?.()
      target.removeEventListener("scroll", onScroll)
    }
  }, [])

  // Retour : recharger la profondeur, puis recaler la carte. Sans liste de
  // dépendances : une page qui arrive rend ses cartes sans qu'aucune prop de ce
  // composant change — la recherche se refait après chaque rendu, tant qu'elle
  // n'a pas conclu (une requête du DOM, rien de plus).
  useEffect(() => {
    if (restore === null || done.current) return
    const marker = sentinel.current
    const root = marker?.parentElement ?? null
    if (marker === null || root === null) return
    const wrapper = findAnchor(root, restore.anchorPostId)
    const step = restoreStep({
      present: wrapper !== null,
      canLoadMore,
      exhausted,
      appended: appended.current,
      maxAppends: Math.min(FEED_RETURN_MAX_DEPTH, restore.depth + 1),
    })
    if (step === "found" && wrapper !== null) {
      done.current = true
      const container = findScrollContainer(wrapper)
      const delta = boxOf(wrapper).getBoundingClientRect().top - (scrollContainerTop(container) + restore.offset)
      scrollContainerBy(container, Math.round(delta))
      onRestored("found")
    } else if (step === "append") {
      appended.current += 1
      onLoadMore()
    } else if (step === "missing") {
      done.current = true
      onRestored("missing")
    }
  })

  return <span ref={sentinel} hidden data-feed-return="" />
}
