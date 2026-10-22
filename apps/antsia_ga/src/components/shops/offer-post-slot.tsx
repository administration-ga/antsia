"use client"

import { api, type Id } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork, type EnginePostMediaSummary } from "@antsia/api/network"
import { useTranslation } from "react-i18next"
import { OfferPostFormula } from "./offer-post-formula"

/** Sans résumé du média (moteur antérieur), la publication est tenue pour illustrée : la formule
 *  ne double alors aucune image et se réduit au bandeau d'action. */
const UNKNOWN_POST_MEDIA: EnginePostMediaSummary = { count: 1, hasVideo: false }

/** Le serveur relit le post, son auteur, sa page et la diffusion de l'offre. ADR-0037 : la formule
 *  de la boutique (bandeau d'action, trois vues, fiche, modèles) se déduit de l'offre et du média. */
export function OfferPostSlot({ networkId, postId, postMedia }: { networkId: Id<"networks">; postId: Id<"posts">; postMedia?: EnginePostMediaSummary }) {
  const { personId } = useNetwork()
  return <OfferPostQuery key={JSON.stringify([networkId, personId, postId])} networkId={networkId} postId={postId} postMedia={postMedia ?? UNKNOWN_POST_MEDIA} />
}
function OfferPostQuery({ networkId, postId, postMedia }: { networkId: Id<"networks">; postId: Id<"posts">; postMedia: EnginePostMediaSummary }) {
  const { t, i18n } = useTranslation("shops")
  const query = useAuthenticatedConvexQuery(api.modules.shops.catalog.postOffer, { networkId, postId })
  if (query.isError) return <p role="status" className="px-4 py-3 text-sm text-muted-foreground">{t("catalog.offerUnavailable")}</p>
  if (query.isPending || !query.data) return null
  return <aside aria-label={t("catalog.attachedOffer")} className="min-w-0"><OfferPostFormula offer={query.data} postMedia={postMedia} locale={i18n.resolvedLanguage ?? "fr"} t={(key, options) => t(key, options)} /></aside>
}
