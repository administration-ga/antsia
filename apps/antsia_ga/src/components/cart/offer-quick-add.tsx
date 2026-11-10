"use client"

import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@antsia/ui/sheet"
import type { CatalogOffer } from "@convex/modules/shops/catalogValidators"
import { ShoppingBag } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { Button } from "@/components/shared/controls"
import { useMinWidth } from "@/components/shared/use-min-width"
import { addCartItem } from "@/lib/cart-draft"
import { routes } from "@/lib/routes"
import { isDemoCartOffer, OfferCartActions } from "./offer-cart-actions"
import { useCartDraft } from "./use-cart-draft"

export type QuickAddMode = "add" | "choose" | "view" | "none"

/**
 * Ce que la carte d'une offre propose au membre (l'« achat express » des ventes privées, 22/10/2026) : ajouter
 * d'un geste une offre au prix exact sans variante ; choisir d'abord la variante réelle ; ou consulter la fiche
 * (devis, fourchette de prix, prestation). Une offre de démonstration n'entre jamais dans un panier : rien.
 */
export function quickAddMode(offer: CatalogOffer): QuickAddMode {
  if (offer.kind === "service") return "view"
  if (isDemoCartOffer(offer)) return "none"
  if (offer.variants.length) return "choose"
  return offer.price.mode === "fixed" || offer.price.mode === "unit" ? "add" : "view"
}

/**
 * L'action de la carte : le panier reste un brouillon ; la préparation et l'accord viennent après. Un libellé
 * court tient dans la carte la plus étroite (deux colonnes au téléphone) ; le nom accessible nomme l'offre. Une
 * offre à consulter n'a pas de bouton : la carte entière mène déjà à sa fiche.
 */
export function OfferQuickAdd({ offer }: { offer: CatalogOffer }) {
  const mode = quickAddMode(offer)
  if (mode === "add") return <DirectAdd offer={offer} />
  if (mode === "choose") return <ChooseThenAdd offer={offer} />
  return null
}

function useAddedNotice() {
  const { t } = useTranslation("cart")
  const router = useRouter()
  return () => toast.success(t("added"), { action: { label: t("open"), onClick: () => router.push(routes.cart()) } })
}

/** Une ligne de quantité 1, au prix exact affiché ; un refus (panier préparé, plein, autre onglet) se dit. */
function DirectAdd({ offer }: { offer: CatalogOffer }) {
  const { t } = useTranslation("cart")
  const cart = useCartDraft(offer.shopHandle)
  const added = useAddedNotice()
  const add = () => {
    if (!cart.ready) return
    const result = addCartItem(cart.draft, { networkId: String(cart.networkId), personId: String(cart.personId) }, offer.shopHandle, { offerRef: offer.offerRef, quantity: 1 }, Date.now())
    const outcome = result.ok ? cart.save(result.draft) ? "added" : cart.getSaveError() === "drafts_full" ? "drafts_full" : "draftUnavailable" : result.reason
    if (outcome === "added") added()
    else toast.error(t(outcome))
  }
  // Ajouter au panier : couleur du commerce (ADR-0027).
  return <Button type="button" variant="commerce" className="w-full px-3" aria-label={t("quickAdd.addNamed", { title: offer.title })} disabled={!cart.ready || !!cart.draft?.submitted} onClick={add}><ShoppingBag aria-hidden className="size-4 shrink-0" />{t("quickAdd.add")}</Button>
}

/** La variante se choisit dans une feuille (en bas au téléphone, à droite dès 768 px), avec la sélection réelle. */
function ChooseThenAdd({ offer }: { offer: CatalogOffer }) {
  const { t } = useTranslation("cart")
  const [open, setOpen] = useState(false)
  const wide = useMinWidth(768)
  const added = useAddedNotice()
  return <Sheet open={open} onOpenChange={setOpen}>
    <Button type="button" variant="commerce" className="w-full px-3" aria-haspopup="dialog" aria-label={t("quickAdd.chooseNamed", { title: offer.title })} onClick={() => setOpen(true)}><ShoppingBag aria-hidden className="size-4 shrink-0" />{t("quickAdd.choose")}</Button>
    <SheetContent side={wide ? "right" : "bottom"} closeLabel={t("quickAdd.close")} className="sm:max-w-md">
      <SheetHeader><SheetTitle>{offer.title}</SheetTitle><SheetDescription>{t("quickAdd.chooseLead")}</SheetDescription></SheetHeader>
      <SheetBody><OfferCartActions offer={offer} onAdded={() => { setOpen(false); added() }} /></SheetBody>
    </SheetContent>
  </Sheet>
}
