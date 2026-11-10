"use client"

import { isSigningOutEverywhere } from "@antsia/api/sign-out-everywhere"
import { usePathname } from "next/navigation"
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react"
import { logicalAppPath } from "@/lib/app-path"
import { isSocialReturnPath, routes, isSpecializedMemberPath } from "@/lib/routes"
import { readSpecializedReturn, removeSpecializedReturn, writeSpecializedReturn, SPECIALIZED_RETURN_TTL_MS, type ReturnOwner, type SpecializedReturn } from "@/lib/specialized-navigation"

type ReturnPosition = { href: string; top: number; anchor: string | null; focusHref: string }
type NavigationContext = { href: string; prepareReturn: () => void }
const Navigation = createContext<NavigationContext>({ href: "", prepareReturn: () => undefined })
export function useSpecializedNavigation(): NavigationContext {
  const context = useContext(Navigation)
  return { ...context, href: context.href || routes.feed() }
}

/** MP01 : une frontière par titulaire, sans déplacer les hôtes de session/appels. */
export function SpecializedNavigationBoundary({ owner, children }: { owner: ReturnOwner; children: ReactNode }) {
  const previous = useRef(owner)
  useEffect(() => {
    if (previous.current.networkId !== owner.networkId || previous.current.personId !== owner.personId) {
      try { removeSpecializedReturn(window.sessionStorage, previous.current) } catch { /* Titulaire suivant isolé par sa clé. */ }
    }
    previous.current = { networkId: owner.networkId, personId: owner.personId }
  }, [owner.networkId, owner.personId])
  return <OwnedNavigation key={JSON.stringify([owner.networkId, owner.personId])} owner={owner}>{children}</OwnedNavigation>
}

function OwnedNavigation({ owner, children }: { owner: ReturnOwner; children: ReactNode }) {
  const pathname = usePathname()
  const [origin, setOrigin] = useState<SpecializedReturn | null>(null)
  const position = useRef<ReturnPosition | null>(null)
  const returning = useRef(false)
  const { networkId, personId } = owner
  useEffect(() => {
    try { setOrigin(readSpecializedReturn(window.sessionStorage, { networkId, personId }, Date.now(), isSocialReturnPath)) } catch { /* Repli sûr sans Storage. */ }
    const capture = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || isSigningOutEverywhere()) return
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null
      if (!(link instanceof HTMLAnchorElement) || link.hasAttribute("download") || (link.target && link.target !== "_self") || link.origin !== window.location.origin) return
      try {
        const target = logicalAppPath(`${link.pathname}${link.search}${link.hash}`)
        if (!isSpecializedMemberPath(target.split(/[?#]/u)[0]!)) return
        const href = logicalAppPath(`${window.location.pathname}${window.location.search}${window.location.hash}`)
        if (!isSocialReturnPath(href)) return
        position.current = { href, top: window.scrollY, anchor: link.closest("[data-feed-anchor]")?.getAttribute("data-feed-anchor") ?? null, focusHref: target }
        const recordedAt = Date.now()
        setOrigin({ version: 1, networkId, personId, href, recordedAt })
        try { writeSpecializedReturn(window.sessionStorage, { networkId, personId }, href, recordedAt, isSocialReturnPath) } catch { /* Mémoire seule. */ }
      } catch { /* Adresse malformée ignorée. */ }
    }
    document.addEventListener("click", capture, true)
    return () => {
      document.removeEventListener("click", capture, true)
      // Un remount/HMR ou une navigation documentaire conserve le retour pendant son TTL.
      // La sortie nominale purge aussi ce préfixe ; le changement de titulaire est traité au-dessus.
      if (isSigningOutEverywhere()) try { removeSpecializedReturn(window.sessionStorage, { networkId, personId }) } catch { /* Rien à purger. */ }
    }
  }, [networkId, personId])
  useEffect(() => {
    if (!origin) return
    const expires = window.setTimeout(() => { setOrigin(null); position.current = null }, Math.max(0, origin.recordedAt + SPECIALIZED_RETURN_TTL_MS - Date.now()))
    return () => window.clearTimeout(expires)
  }, [origin])
  useEffect(() => {
    if (!returning.current || !origin || pathname !== origin.href.split(/[?#]/u)[0]) return
    returning.current = false
    const saved = position.current
    let done = false
    const restore = () => {
      if (done || isSigningOutEverywhere()) return
      const root = document.getElementById("contenu")
      if (!root) return
      const target = saved?.anchor ? Array.from(root.querySelectorAll<HTMLElement>("[data-feed-anchor]")).find(node => node.getAttribute("data-feed-anchor") === saved.anchor) : null
      if (saved?.anchor && !target) return
      // P04 restaure lui-même post/profondeur/galerie dans le fil.
      if (saved && !saved.anchor) {
        if (document.documentElement.scrollHeight < saved.top + window.innerHeight) return
        window.scrollTo({ top: saved.top, behavior: "instant" })
      }
      const focus = saved ? Array.from((target ?? root).querySelectorAll<HTMLAnchorElement>("a[href]")).find(link => {
        try { return logicalAppPath(`${link.pathname}${link.search}${link.hash}`) === saved?.focusHref } catch { return false }
      }) : null
      const focusTarget = focus ?? root
      focusTarget.focus({ preventScroll: true })
      done = true
    }
    const frame = requestAnimationFrame(restore)
    const observer = new MutationObserver(restore)
    observer.observe(document.body, { childList: true, subtree: true })
    const timeout = window.setTimeout(() => { observer.disconnect(); if (!done) document.getElementById("contenu")?.focus({ preventScroll: true }); done = true }, 10_000)
    return () => { done = true; cancelAnimationFrame(frame); observer.disconnect(); window.clearTimeout(timeout) }
  }, [pathname, origin])
  return <Navigation.Provider value={{ href: origin && isSocialReturnPath(origin.href) ? origin.href : routes.feed(), prepareReturn: () => { returning.current = true } }}>{children}</Navigation.Provider>
}
