"use client"

import { api } from "@antsia/api/engine"
import { useAuthenticatedPaginatedQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import { useMutation } from "convex/react"
import { Component, type ReactNode, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { OfferQuickAdd } from "@/components/cart/offer-quick-add"
import { Button, Card } from "@/components/shared/controls"
import { routes } from "@/lib/routes"
import { OfferCard } from "./offer-card"
import { OFFER_GRID } from "./offer-grid"
import { SaveOfferButton } from "./save-offer-button"
import { splitSavedOffers } from "./saved-offer-model"
import { ShopFrame, ShopLink } from "./shop-ui"

/** Une page de « Mes favoris » : douze lignes relues, la borne du moteur (`SAVED_OFFERS_PAGE_MAX`). */
const SAVED_OFFERS_PAGE_SIZE = 12
/**
 * Passages de nettoyage au plus : le moteur relit vingt lignes par passage et garde au plus deux cents
 * favoris par réseau (`SAVED_OFFERS_PRUNE_BATCH`, `SAVED_OFFERS_MAX`) ; un passage de plus clôt la liste.
 */
const PRUNE_PASSES_MAX = 11

/**
 * « Mes favoris » (CM-09) : les offres que j'ai enregistrées dans ce réseau, relues à chaque lecture avec mes
 * droits, les plus récentes d'abord, en grille pleine largeur (deux colonnes au téléphone). Une offre qui ne
 * se lit plus (retirée, vitrine fermée, modération) n'est pas montrée ; une mention le dit et propose de les
 * retirer. Rien n'est visible d'autrui. Un visiteur sans compte est conduit à la connexion par la coque.
 */
export function SavedOffersScreen() {
  const { networkId, personId } = useNetwork()
  const { t } = useTranslation("shops")
  return <ShopFrame title={t("saved.title")} lead={t("saved.lead")}>
    <p className="text-sm text-muted-foreground">{t("saved.privacy")}</p>
    <SavedOffersBoundary key={JSON.stringify([networkId, personId])} />
  </ShopFrame>
}

/** Une lecture refusée ou en panne se dit, avec « Réessayer » ; jamais un écran blanc. */
function SavedOffersBoundary() {
  const [attempt, setAttempt] = useState(0)
  return <SavedOffersErrorBoundary key={attempt} fallback={<SavedOffersFailure retry={() => setAttempt((value) => value + 1)} />}><SavedOffersWindow /></SavedOffersErrorBoundary>
}

class SavedOffersErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  override state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  override componentDidCatch() {
    // Le détail technique reste dans la télémétrie de Convex : rien à afficher ni à journaliser ici.
  }
  override render() { return this.state.failed ? this.props.fallback : this.props.children }
}

function SavedOffersFailure({ retry }: { retry: () => void }) {
  const { t } = useTranslation("shops")
  return <Card><div className="grid gap-3"><p role="alert">{t("saved.unavailable")}</p><Button variant="outline" className="justify-self-start" onClick={retry}>{t("saved.retry")}</Button></div></Card>
}

function SavedOffersWindow() {
  const { networkId } = useNetwork()
  const { t, i18n } = useTranslation("shops")
  const saved = useAuthenticatedPaginatedQuery(api.modules.shops.savedOffers.listMine, { networkId }, { initialNumItems: SAVED_OFFERS_PAGE_SIZE })
  if (saved.status === "LoadingFirstPage") return <p role="status">{t("saved.loading")}</p>
  const { offers, unavailable } = splitSavedOffers(saved.results)
  return <div className="@container grid min-w-0 gap-4" data-saved-offers>
    {unavailable > 0 ? <UnavailableNotice /> : null}
    {offers.length ? <ul className={OFFER_GRID}>{offers.map((offer, index) => <li key={`${offer.shopHandle}:${offer.offerRef}`} className="min-w-0"><OfferCard offer={offer} audience="member" locale={i18n.resolvedLanguage ?? "fr"} t={(key, options) => t(key, options)} eager={index === 0} action={<OfferQuickAdd offer={offer} />} save={<SaveOfferButton offer={offer} />} /></li>)}</ul> : null}
    {saved.status === "Exhausted" && offers.length === 0 ? <Card><div className="grid gap-3"><p>{t("saved.empty")}</p><ShopLink href={routes.marketplace()} variant="commerce">{t("saved.browse")}</ShopLink></div></Card> : null}
    {saved.status === "CanLoadMore" ? <Button variant="outline" className="justify-self-start" onClick={() => saved.loadMore(SAVED_OFFERS_PAGE_SIZE)}>{t("saved.more")}</Button> : null}
    {saved.status === "LoadingMore" ? <p role="status" className="text-sm text-muted-foreground">{t("saved.loadingMore")}</p> : null}
  </div>
}

/** Des favoris ne se lisent plus : la mention ne dit ni lesquels ni pourquoi, et propose de les retirer. */
function UnavailableNotice() {
  const { networkId } = useNetwork()
  const { t } = useTranslation("shops")
  const prune = useMutation(api.modules.shops.savedOffers.pruneUnavailable)
  const [busy, setBusy] = useState(false)
  const run = async () => {
    if (busy) return
    setBusy(true)
    try {
      let cursor: string | null = null
      for (let pass = 0; pass < PRUNE_PASSES_MAX; pass += 1) {
        const result: { isDone: boolean; continueCursor: string } = await prune({ networkId, cursor })
        if (result.isDone) break
        cursor = result.continueCursor
      }
      toast.success(t("saved.pruned"))
    } catch {
      toast.error(t("saved.pruneFailed"))
    } finally {
      setBusy(false)
    }
  }
  return <Card><div className="grid gap-3"><p role="status" className="text-sm">{t("saved.hidden")}</p><Button variant="outline" className="justify-self-start" pending={busy} onClick={() => void run()}>{t("saved.prune")}</Button></div></Card>
}
