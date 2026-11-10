"use client"

import { api } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import { isShopPaused } from "@antsia/social-domain/commerce/shopPause"
import { CalendarClock } from "lucide-react"
import { type ReactNode, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { useCheckoutClock } from "@/components/checkout/use-checkout-clock"

/**
 * CM-10 — la BOUTIQUE EN PAUSE vue par l'acheteur : un bandeau sur la vitrine, la fiche d'offre, le panier, la
 * préparation, les demandes de service et l'emploi, pour qu'il le sache AVANT d'essayer. Le serveur refuse de
 * toute façon un nouvel engagement (`SHOP_PAUSED`) ; ce bandeau est une information : en lecture ou en panne, il
 * ne montre rien.
 */

/**
 * Le pas de l'instant passé à la lecture : une minute. Le moteur ne lit pas l'horloge dans une requête (Convex la
 * garde en cache tant que rien ne change en base) ; un instant arrondi reste le même d'un rendu à l'autre.
 */
const PAUSE_NOW_STEP_MS = 60_000
const minuteFloor = (ms: number) => Math.floor(ms / PAUSE_NOW_STEP_MS) * PAUSE_NOW_STEP_MS
const minuteCeil = (ms: number) => Math.ceil(ms / PAUSE_NOW_STEP_MS) * PAUSE_NOW_STEP_MS

/**
 * L'instant de réouverture de cette boutique si elle est en pause, sinon `null`. Le bandeau s'éteint seul à
 * l'échéance : l'horloge locale se réveille à `pausedUntil` (et au retour de veille), puis la lecture est relancée
 * avec un instant postérieur, que le serveur confirme. Aucune interrogation à la minute.
 */
export function useShopPause(handle: string): number | null {
  const { networkId } = useNetwork()
  const [now, setNow] = useState(() => minuteFloor(Date.now()))
  const query = useAuthenticatedConvexQuery(api.modules.shops.shops.storefrontPause, { networkId, handle, now })
  const pausedUntil = query.isError ? undefined : query.data?.pausedUntil
  const clock = useCheckoutClock(pausedUntil)
  const paused = isShopPaused(pausedUntil, clock)
  useEffect(() => {
    if (pausedUntil !== undefined && !paused) setNow((current) => Math.max(current, minuteCeil(pausedUntil)))
  }, [pausedUntil, paused])
  return paused ? pausedUntil : null
}

/** Le bandeau, sans lecture : un titre et une phrase déjà traduits (aussi rendu côté serveur sur la vitrine publique). */
export function ShopPauseNoticeView({ title, body, children }: { title: string; body: string; children?: ReactNode }) {
  return <div role="status" data-shop-pause className="col-span-full flex min-w-0 items-start gap-3 rounded-[var(--ui2-card-radius)] bg-muted p-4 text-foreground [overflow-wrap:anywhere]">
    <CalendarClock aria-hidden className="mt-0.5 size-5 shrink-0 text-[color:var(--role-commerce-ink,var(--primary))]" />
    <div className="grid min-w-0 gap-1"><p className="font-semibold">{title}</p><p className="text-sm">{body}</p>{children}</div>
  </div>
}

/** Le bandeau traduit, pour une réouverture connue. */
export function ShopPauseNotice({ until }: { until: number }) {
  const { t } = useTranslation("shops")
  return <ShopPauseNoticeView title={t("pause.bannerTitle")} body={t("pause.bannerBody", { until })} />
}

/** Le bandeau d'une boutique par l'adresse de sa page : rien tant qu'elle est ouverte. */
export function ShopPauseBanner({ handle }: { handle: string }) {
  const until = useShopPause(handle)
  return until === null ? null : <ShopPauseNotice until={until} />
}

/**
 * Vitrine publique : le bandeau est admis et rendu côté serveur ; cette frontière le retire seulement à l'échéance,
 * même sans nouvelle requête (même principe que le plat du jour public).
 */
export function PublicShopPauseBoundary({ pausedUntil, children }: { pausedUntil: number; children: ReactNode }) {
  return isShopPaused(pausedUntil, useCheckoutClock(pausedUntil)) ? children : null
}
