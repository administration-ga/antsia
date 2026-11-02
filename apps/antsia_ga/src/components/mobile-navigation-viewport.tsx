"use client"

import { useEffect, useSyncExternalStore } from "react"

const PHONE_NAVIGATION = "(width < 768px)"
const KEYBOARD_ATTRIBUTE = "data-antsia-nav-keyboard"

function subscribePhoneNavigation(onChange: () => void) {
  if (typeof window.matchMedia === "function") {
    const query = window.matchMedia(PHONE_NAVIGATION)
    query.addEventListener("change", onChange)
    return () => query.removeEventListener("change", onChange)
  }
  window.addEventListener("resize", onChange)
  return () => window.removeEventListener("resize", onChange)
}

const phoneSnapshot = () => typeof window.matchMedia === "function" ? window.matchMedia(PHONE_NAVIGATION).matches : window.innerWidth < 768

/** Le repère mesuré des surfaces flottantes ne désigne jamais le rail de bureau. */
export function usePhoneNavigation(): boolean {
  return useSyncExternalStore(subscribePhoneNavigation, phoneSnapshot, () => false)
}

function editingField(): boolean {
  const node = document.activeElement
  if (!(node instanceof HTMLElement)) return false
  if (node.isContentEditable || node instanceof HTMLTextAreaElement) return true
  return node instanceof HTMLInputElement && !["button", "checkbox", "radio", "range", "file", "color", "submit", "reset", "hidden"].includes(node.type)
}

/**
 * Lecture de visualViewport propre au dock : aucune écriture dans les variables
 * --vv-height / --kb-inset partagées par les lecteurs et les feuilles immersives.
 * Le dock reste stable au défilement ; seule une saisie avec clavier ouvert le masque.
 */
export function MobileNavigationViewport() {
  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return
    const root = document.documentElement
    const prior = root.getAttribute(KEYBOARD_ATTRIBUTE)
    let width = window.innerWidth
    let referenceHeight = Math.max(window.innerHeight, viewport.height + viewport.offsetTop)
    const update = () => {
      if (Math.abs(window.innerWidth - width) > 80) {
        width = window.innerWidth
        referenceHeight = Math.max(window.innerHeight, viewport.height + viewport.offsetTop)
      }
      const editing = editingField()
      if (!editing) referenceHeight = Math.max(window.innerHeight, viewport.height + viewport.offsetTop)
      const hidden = editing && viewport.scale === 1 && referenceHeight - viewport.height - viewport.offsetTop > 160
      root.toggleAttribute(KEYBOARD_ATTRIBUTE, hidden)
    }
    update()
    viewport.addEventListener("resize", update)
    viewport.addEventListener("scroll", update)
    window.addEventListener("resize", update)
    document.addEventListener("focusin", update)
    document.addEventListener("focusout", update)
    // Une navigation peut retirer le champ actif sans émettre focusout.
    const content = typeof MutationObserver === "undefined" ? null : new MutationObserver(update)
    content?.observe(document.body, { childList: true, subtree: true })
    return () => {
      content?.disconnect()
      viewport.removeEventListener("resize", update)
      viewport.removeEventListener("scroll", update)
      window.removeEventListener("resize", update)
      document.removeEventListener("focusin", update)
      document.removeEventListener("focusout", update)
      if (prior === null) root.removeAttribute(KEYBOARD_ATTRIBUTE)
      else root.setAttribute(KEYBOARD_ATTRIBUTE, prior)
    }
  }, [])
  return null
}
