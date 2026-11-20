// Dupliqué de socle/packages/ui-v2/src/hooks/use-modal-a11y.ts @ ad2e7fdc2 — adaptations : lever l'inertage détenu par le hook avant de restituer le focus à la fermeture ; région des toasts marquée `data-toast-region` jamais inertée (P18b) ; en-tête de provenance.
"use client"

/**
 * Hook d'accessibilité pour modales/dialogs custom (Bloc 3 — résolution
 * findings RGAA F1/F2/F3 de l'audit accessibility-rgaa).
 *
 * Fournit en un appel :
 *   1. **Focus initial** : place le focus sur `initialFocusRef` (ou le 1er
 *      focusable de la modale si non fourni) à l'ouverture.
 *   2. **Focus trap** : `Tab`/`Shift+Tab` bouclent dans la modale (jamais
 *      d'échappement vers le contenu derrière) — sauf `trapFocus: false`, le
 *      régime NON MODAL (cf. l'option ; il retire aussi l'Escape du hook).
 *   3. **Retour focus** : à la fermeture, restaure le focus sur l'élément qui
 *      avait le focus juste avant l'ouverture (typiquement le bouton
 *      déclencheur).
 *   4. **Inert content** : marque tous les siblings de la modale en `inert`
 *      pour les retirer de l'AT et empêcher tout focus de s'y évader.
 *   5. **Escape** : ferme via le callback `onClose` fourni.
 *
 * Usage :
 * ```tsx
 * const dialogRef = useRef<HTMLDivElement>(null)
 * const firstInputRef = useRef<HTMLTextAreaElement>(null)
 * useModalA11y({
 *   containerRef: dialogRef,
 *   initialFocusRef: firstInputRef,
 *   onClose,
 * })
 * return <div role="dialog" aria-modal="true" ref={dialogRef}>…</div>
 * ```
 *
 * Implémentation volontairement compacte : pas de package externe, pas de
 * portail React (les modales actuelles vivent dans le DOM normal via
 * `position: fixed`). L'inertage cible les enfants directs de `<body>` qui
 * ne contiennent pas le container — c'est suffisant pour bloquer le tab et
 * la lecture AT sur le reste de la page.
 */

import { useEffect, type RefObject } from "react"

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",")

export interface UseModalA11yOptions {
  /** Ref vers le conteneur du dialog (typiquement `role="dialog"`). */
  containerRef: RefObject<HTMLElement | null>
  /** Ref vers l'élément qui doit recevoir le focus initial. Optionnel —
   *  défaut : 1er focusable du container. */
  initialFocusRef?: RefObject<HTMLElement | null>
  /** Callback appelé à `Escape`. */
  onClose: () => void
  /** Désactiver l'inertage du reste de la page (pour modales secondaires
   *  empilées). Défaut: false. */
  skipInert?: boolean
  /**
   * Piéger `Tab` dans le conteneur. Défaut `true` — le comportement modal
   * historique, celui d'`ImmersiveOverlay` et des modales ui-v2, inchangé.
   *
   * ⚠️ `false` déclare une surface NON MODALE : un panneau posé au-dessus de
   * quelque chose de vivant (le sélecteur « Ajouter » au-dessus d'un appel en
   * cours, IC-11). Piéger `Tab` y rendrait « Raccrocher » inatteignable au
   * clavier. Dans ce mode, le hook ne prend PAS non plus la touche `Échap` :
   * une surface non modale ne décide pas seule qui, de plusieurs couches
   * empilées, doit se fermer — c'est le rôle de la pile Échap de l'application
   * (`features/floating-surface/escape-stack.ts`). Restent acquis : le focus
   * initial et sa restitution au déclencheur.
   */
  trapFocus?: boolean
}

export function useModalA11y({
  containerRef,
  initialFocusRef,
  onClose,
  skipInert = false,
  trapFocus = true,
}: UseModalA11yOptions): void {
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // 1. Snapshot du focus actuel (élément qui a déclenché l'ouverture)
    const previousActive = document.activeElement as HTMLElement | null

    // 2. Focus initial
    const initialTarget =
      initialFocusRef?.current ??
      container.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
    initialTarget?.focus()

    // 3. Inertage du reste de la page
    const inertedSiblings: HTMLElement[] = []
    if (!skipInert && typeof document !== "undefined") {
      const bodyChildren = Array.from(document.body.children) as HTMLElement[]
      for (const child of bodyChildren) {
        // On laisse passer le wrapper du dialog (qui contient le container)
        // et les éléments qui n'ont pas vocation à être inertés
        // (Next.js dev tools, portals techniques de Next).
        if (child.contains(container)) continue
        if (child.hasAttribute("inert")) continue
        // Ignorer les portails techniques de Next.js (script, noscript, etc.)
        if (child.tagName === "SCRIPT" || child.tagName === "NOSCRIPT") continue
        // Région des toasts marquée par l'application (ANTSIA et DIASPORA.GA,
        // `data-toast-region`) : une erreur annoncée pendant la modale doit
        // rester lue par les technologies d'assistance (audit P18a, A07).
        if (child.hasAttribute("data-toast-region")) continue
        child.setAttribute("inert", "")
        inertedSiblings.push(child)
      }
    }

    // 4. Focus trap (Tab / Shift+Tab) + Escape — les deux appartiennent au
    //    régime MODAL. Une surface non modale (`trapFocus: false`) n'installe
    //    donc aucun écouteur : ni piège, ni Escape.
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== "Tab") return
      const focusables = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((el) => !el.hasAttribute("disabled") && isVisible(el))
      if (focusables.length === 0) {
        e.preventDefault()
        return
      }
      const first = focusables[0]!
      const last = focusables[focusables.length - 1]!
      const active = document.activeElement as HTMLElement | null
      if (e.shiftKey && (active === first || !container.contains(active))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }
    if (trapFocus) document.addEventListener("keydown", onKeyDown)

    return () => {
      if (trapFocus) document.removeEventListener("keydown", onKeyDown)
      // 5. Réactiver la page avant d'y restituer le focus : le navigateur
      //    natif refuse de focaliser une cible qui appartient encore à inert.
      for (const el of inertedSiblings) {
        el.removeAttribute("inert")
      }
      // 6. Restitution focus
      previousActive?.focus?.()
    }
  }, []) // 1× au mount, cleanup au démontage
}

function isVisible(el: HTMLElement): boolean {
  // Heuristique légère — un élément avec width/height nuls (clip sr-only,
  // display:none héritée) ne reçoit pas le focus en pratique. On évite de
  // bouger le focus dessus pendant le trap.
  return el.offsetWidth > 0 || el.offsetHeight > 0
}
