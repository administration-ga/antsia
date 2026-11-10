"use client"

import { api } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import { cn } from "@antsia/ui/lib/cn"
import { useMutation } from "convex/react"
import { Heart } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { buttonClassName } from "@/components/shared/button-class"
import { routes } from "@/lib/routes"
import type { CatalogOffer } from "./catalog-model"
import { savedOfferErrorText } from "./saved-offer-model"

/** Le cœur rempli d'une offre enregistrée : l'encre des réactions (ADR-0027), l'identité en repli. */
const SAVED_ICON = "fill-current text-[color:var(--role-react-ink,var(--primary))]"
/** Sur la photo d'une carte : une pastille de 44 px, lisible sur toute image, dans le coin haut droit. */
const OVERLAY_CLASS = "inline-flex size-11 items-center justify-center rounded-full bg-card/90 text-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"

/**
 * « Enregistrer » une offre dans Mes favoris (CM-09), à bascule : `aria-pressed` dit l'état, le nom change
 * avec lui. `overlay` : la pastille-cœur posée sur la photo d'une carte (nom accessible qui nomme l'offre) ;
 * `inline` : le bouton de la fiche, texte visible « Enregistrer » / « Enregistré ». Geste privé : aucun
 * compteur, rien n'est dit à la boutique. Un état encore inconnu laisse le bouton inactif, jamais faux ;
 * pendant l'envoi, il garde le focus et ignore un second appui.
 */
export function SaveOfferButton({ offer, layout = "overlay" }: { offer: Pick<CatalogOffer, "shopHandle" | "offerRef" | "title">; layout?: "overlay" | "inline" }) {
  const { networkId } = useNetwork()
  const { t } = useTranslation("shops")
  const router = useRouter()
  const args = { networkId, handle: offer.shopHandle, offerRef: offer.offerRef }
  const state = useAuthenticatedConvexQuery(api.modules.shops.savedOffers.isSaved, args)
  const save = useMutation(api.modules.shops.savedOffers.save)
  const remove = useMutation(api.modules.shops.savedOffers.remove)
  // L'état visé pendant l'envoi : le bouton bascule tout de suite et revient si le moteur refuse.
  const [target, setTarget] = useState<boolean | null>(null)
  const known = typeof state.data === "boolean"
  const saved = target ?? state.data === true
  const toggle = async () => {
    if (!known || target !== null) return
    const next = !saved
    setTarget(next)
    try {
      if (next) {
        await save(args)
        toast.success(t("saved.added"), { action: { label: t("saved.open"), onClick: () => router.push(routes.savedOffers()) } })
      } else {
        await remove(args)
        toast.success(t("saved.removed"))
      }
    } catch (error) {
      toast.error(savedOfferErrorText(error, (key, options) => t(key, options)))
    } finally {
      setTarget(null)
    }
  }
  const icon = <Heart aria-hidden className={cn("size-5 shrink-0", saved && SAVED_ICON)} />
  if (layout === "inline") {
    return <button type="button" data-save-offer aria-pressed={saved} aria-busy={target !== null || undefined} disabled={!known} onClick={() => void toggle()} className={buttonClassName("outline", "justify-self-start")}>
      {icon}{t(saved ? "saved.savedState" : "saved.save")}
    </button>
  }
  return <button type="button" data-save-offer aria-pressed={saved} aria-busy={target !== null || undefined} disabled={!known} aria-label={t(saved ? "saved.savedNamed" : "saved.saveNamed", { title: offer.title })} title={t(saved ? "saved.savedState" : "saved.save")} onClick={() => void toggle()} className={OVERLAY_CLASS}>
    {icon}
  </button>
}
