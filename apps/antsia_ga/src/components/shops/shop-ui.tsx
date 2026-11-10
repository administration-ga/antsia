"use client"

import { isSigningOutEverywhere } from "@antsia/api/sign-out-everywhere"
import { useConvexAuth } from "convex/react"
import Link from "next/link"
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { MemberPage } from "@/components/member-chrome"
import { Button, buttonClassName, Card, type ButtonVariant } from "@/components/shared/controls"
import { SCREEN_SUBMIT } from "@/components/shared/screen-layout"
import { shopErrorText } from "./shop-model"

export const SHOP_LINK_CLASS = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
export const SHOP_SELECT_CLASS = "min-h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

/**
 * Tous les écrans de boutique et de prestataire occupent toute la colonne de leur espace, bords et écarts sur la
 * gouttière (décisions du propriétaire du 22/10/2026, `shared/screen-layout`) ; dès 768 px, le lien de retour
 * s'aligne sur le titre (au téléphone, inchangé).
 */
export function ShopFrame({ title, lead, header, children }: { title: string; lead?: string; header?: ReactNode; children: ReactNode }) {
  // `header` remplace l'en-tête simple ; `null` quand l'écran porte lui-même son titre (`h1`), comme la vitrine.
  return <MemberPage><div className={`flex w-full min-w-0 flex-col gap-5 pb-24 [overflow-wrap:anywhere] min-[768px]:[&>a]:self-start ${SCREEN_SUBMIT}`}>{header === undefined ? <header className="grid gap-2"><h1 className="text-2xl font-semibold tracking-tight">{title}</h1>{lead ? <p className="text-muted-foreground">{lead}</p> : null}</header> : header}{children}</div></MemberPage>
}
/** Un lien de boutique ; avec `variant`, il prend la facture d'un bouton (« Poser une question » en tonal des messages, ADR-0027),
 * à sa largeur même dans une grille. */
export function ShopLink({ href, children, variant }: { href: string; children: ReactNode; variant?: ButtonVariant }) { return <Link href={href} className={variant ? buttonClassName(variant, "justify-self-start") : SHOP_LINK_CLASS}>{children}</Link> }
export function ShopQueryFailure({ retry, href }: { retry?: () => void; href: string }) {
  const { t } = useTranslation("shops")
  return <Card><div className="grid gap-3"><h2 className="text-lg font-semibold">{t("common.unavailableTitle")}</h2><p>{t("common.unavailableBody")}</p><div className="flex flex-wrap gap-2">{retry ? <Button variant="outline" onClick={retry}>{t("common.retry")}</Button> : null}<ShopLink href={href}>{t("common.back")}</ShopLink></div></div></Card>
}
export function ShopLogo({ url, name }: { url: string | null; name: string }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  if (!url || failedUrl === url) return <span aria-hidden="true" className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-muted text-xl font-semibold">{Array.from(name).at(0) ?? ""}</span>
  // eslint-disable-next-line @next/next/no-img-element -- URL fournie par la garde du moteur, pas d'identifiant de stockage client.
  return <img key={url} src={url} alt="" className="size-16 shrink-0 rounded-xl object-cover object-center" onError={() => setFailedUrl(url)} />
}

/** Chaque surface est remontée par réseau/personne/objet. Aucun effet tardif après sortie. */
export function useShopAction() {
  const { t } = useTranslation("shops")
  const { isAuthenticated } = useConvexAuth()
  const active = useRef(isAuthenticated)
  const generation = useRef(0)
  if (active.current !== isAuthenticated) generation.current += 1
  active.current = isAuthenticated
  const version = generation.current
  const mounted = useRef(true)
  const lock = useRef(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const current = useCallback(() => mounted.current && generation.current === version && active.current && !isSigningOutEverywhere(), [version])
  const run = useCallback(async <T,>(operation: () => Promise<T>, success?: (result: T) => void): Promise<T | undefined> => {
    if (lock.current || !current()) return undefined
    lock.current = true
    setPending(true)
    setError(null)
    try {
      const result = await operation()
      if (!current()) return undefined
      success?.(result)
      return result
    } catch (reason) {
      if (current()) setError(shopErrorText(reason, t))
      return undefined
    } finally {
      lock.current = false
      if (current()) setPending(false)
    }
  }, [current, t])
  return { pending, error, run, current, setError }
}

export function useShopDirtyGuard(dirty: boolean) {
  const { t } = useTranslation("shops")
  useEffect(() => {
    if (!dirty) return
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = "" }
    const click = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank" || anchor.hasAttribute("download") || anchor.origin !== window.location.origin || anchor.href === window.location.href) return
      if (!window.confirm(t("common.discardChanges"))) { event.preventDefault(); event.stopPropagation() }
    }
    window.addEventListener("beforeunload", unload)
    document.addEventListener("click", click, true)
    return () => { window.removeEventListener("beforeunload", unload); document.removeEventListener("click", click, true) }
  }, [dirty, t])
}
