"use client"

/**
 * useFeedImmersion — ce dont une SURFACE de fil a besoin pour le lot P04 :
 * le mode (Liste / Immersion), la mémoire de retour de l'onglet et la mémoire
 * de galerie. Un seul appel par surface (fil du téléphone, du bureau, fil
 * national) ; `null` quand l'application n'a pas déclaré le fil immersif —
 * la surface garde alors son rendu historique, à l'identique.
 *
 *  · `feedId` identifie le fil (portée, mot-clé, fenêtre) SANS adresse ni
 *    recherche ; `null` pour une vue qui n'est pas un fil (recherche,
 *    publication ouverte) : ni immersion ni mémoire ;
 *  · la position retenue au montage est rétablie UNE fois (retour depuis une
 *    offre, des commentaires, un profil) ; changer de portée repart du haut ;
 *  · changer de mode — par la bascule, ou parce que l'écran devient trop bas —
 *    rétablit la publication lue dans l'autre mode.
 */

import { useNetwork } from "@antsia/api/network"
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"

import type { FeedMode } from "./feed-mode"
import type { FeedSurfaceMemory } from "./feed-post-memory"
import { feedReturnOwner, feedReturnScope, readFeedReturn, writeFeedReturn, type FeedOffsetKind, type FeedReturnEntry } from "./feed-return-memory"
import type { FeedAnchor, FeedRestoreTarget } from "./ImmersiveFeedReader"
import { useFeedMode, type FeedModeState } from "./use-feed-mode"

/** Index de galerie retenus au plus (une carte par entrée). */
const GALLERY_MEMORY_MAX = 200

export interface FeedImmersion {
  mode: FeedModeState
  /** Le lecteur immersif est-il monté pour cette vue ? */
  immersive: boolean
  /** La publication à retrouver, son décalage exprimé pour le mode affiché. */
  restore: FeedRestoreTarget | null
  onRestored: (outcome: "found" | "missing") => void
  /** Suivi en immersion : décalage intérieur du créneau. */
  recordSlotAnchor: (anchor: FeedAnchor) => void
  /** Suivi en liste : bord haut de la carte sous le haut du défileur. */
  recordListAnchor: (anchor: FeedAnchor) => void
  surfaceMemory: FeedSurfaceMemory
  changeMode: (mode: FeedMode) => void
}

export function useFeedImmersion(options: { feedId: string | null; depth: number; surface?: "clips" }): FeedImmersion | null {
  const { networkId, personId } = useNetwork()
  const mode = useFeedMode(options.surface === "clips" ? { surface: "clips", phoneDefault: "immersive" } : {})
  const feedId = options.feedId
  const enabled = mode !== null && feedId !== null
  const scope = mode !== null && feedId !== null ? feedReturnScope(feedReturnOwner(networkId, personId), feedId) : null
  const immersive = mode !== null && feedId !== null && mode.effective === "immersive"

  const [restoreEntry, setRestoreEntry] = useState<FeedReturnEntry | null>(() => (scope === null ? null : readFeedReturn(scope, Date.now())))
  const gallery = useRef(new Map<string, number>())
  const lastAnchor = useRef<{ postId: string; offset: number; kind: FeedOffsetKind } | null>(null)
  const depthRef = useRef(options.depth)
  useLayoutEffect(() => { depthRef.current = options.depth }, [options.depth])
  const scopeRef = useRef(scope)

  const write = useCallback((anchor: { postId: string; offset: number; kind: FeedOffsetKind }) => {
    const current = scopeRef.current
    if (current === null) return
    writeFeedReturn(
      current,
      {
        anchorPostId: anchor.postId,
        offset: anchor.offset,
        offsetKind: anchor.kind,
        galleryIndex: gallery.current.get(anchor.postId) ?? null,
        depth: depthRef.current,
      },
      Date.now(),
    )
  }, [])

  // Une autre portée : la mémoire suivra la nouvelle, sans rétablir l'ancienne lecture.
  useEffect(() => {
    if (scopeRef.current === scope) return
    scopeRef.current = scope
    lastAnchor.current = null
    gallery.current.clear()
    setRestoreEntry(null)
  }, [scope])

  // Le mode affiché change (bascule, écran trop bas) : la publication lue suit.
  const previousImmersive = useRef(immersive)
  useEffect(() => {
    if (previousImmersive.current === immersive) return
    previousImmersive.current = immersive
    const anchor = lastAnchor.current
    if (anchor === null) return
    setRestoreEntry({
      anchorPostId: anchor.postId,
      offset: anchor.offset,
      offsetKind: anchor.kind,
      galleryIndex: gallery.current.get(anchor.postId) ?? null,
      depth: depthRef.current,
      savedAt: Date.now(),
    })
  }, [immersive])

  const recordSlotAnchor = useCallback(
    (anchor: FeedAnchor) => {
      lastAnchor.current = { postId: anchor.postId, offset: anchor.offset, kind: "slot" }
      write(lastAnchor.current)
    },
    [write],
  )

  const recordListAnchor = useCallback(
    (anchor: FeedAnchor) => {
      lastAnchor.current = { postId: anchor.postId, offset: anchor.offset, kind: "list" }
      write(lastAnchor.current)
    },
    [write],
  )

  const onRestored = useCallback(() => setRestoreEntry(null), [])

  const surfaceMemory = useMemo<FeedSurfaceMemory>(
    () => ({
      initialGalleryIndex: (postId: string) => (restoreEntry !== null && restoreEntry.anchorPostId === postId ? restoreEntry.galleryIndex : null),
      reportGalleryIndex: (postId: string, index: number) => {
        if (gallery.current.get(postId) === index) return
        gallery.current.delete(postId)
        gallery.current.set(postId, index)
        while (gallery.current.size > GALLERY_MEMORY_MAX) {
          const oldest = gallery.current.keys().next()
          if (oldest.done === true) break
          gallery.current.delete(oldest.value)
        }
        // La galerie de la publication lue : la mémoire de retour suit l'image.
        if (lastAnchor.current !== null && lastAnchor.current.postId === postId) write(lastAnchor.current)
      },
    }),
    [restoreEntry, write],
  )

  const restore = useMemo<FeedRestoreTarget | null>(() => {
    if (restoreEntry === null) return null
    const kind: FeedOffsetKind = immersive ? "slot" : "list"
    return {
      anchorPostId: restoreEntry.anchorPostId,
      // Un décalage ne se lit que dans le mode qui l'a mesuré.
      offset: restoreEntry.offsetKind === kind ? restoreEntry.offset : 0,
      galleryIndex: restoreEntry.galleryIndex,
      depth: restoreEntry.depth,
    }
  }, [restoreEntry, immersive])

  const setMode = mode?.setMode
  const changeMode = useCallback((next: FeedMode) => setMode?.(next), [setMode])

  if (mode === null) return null
  return {
    mode,
    immersive,
    restore: enabled ? restore : null,
    onRestored,
    recordSlotAnchor,
    recordListAnchor,
    surfaceMemory,
    changeMode,
  }
}
