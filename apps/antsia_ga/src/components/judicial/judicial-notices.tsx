"use client"

import { api, type Id } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import { useTranslation } from "react-i18next"

import { JudicialNoticeList } from "./judicial-notice-list"

/** La cible d'un avis côté membre : une publication par son identifiant, un profil ou une page par son adresse. */
export type JudicialNoticeTarget = { kind: "post"; id: Id<"posts"> } | { kind: "person"; handle: string } | { kind: "page"; handle: string }

function useNoticeLabels() {
  const { t } = useTranslation("antsia")
  return { region: t("judicial.notices.region"), correction: t("judicial.notices.correction"), origin: t("judicial.notices.origin") }
}

/**
 * SU01h — les avis ordonnés par le juge au-dessus d'une publication, d'un profil ou d'une page que le
 * membre peut voir. Le moteur ne rend rien pour une cible illisible ; une panne n'empêche pas l'écran.
 */
export function JudicialNotices({ networkId, target }: { networkId: Id<"networks">; target: JudicialNoticeTarget }) {
  const labels = useNoticeLabels()
  const query = useAuthenticatedConvexQuery(api.modules.moderation.measures.judicialNotices, { networkId, target })
  return query.data ? <JudicialNoticeList notices={query.data} labels={labels} /> : null
}

/**
 * L'emplacement de la carte de publication du moteur (`PostNoticeRenderer`). Toutes les cartes lisent
 * la MÊME requête (mêmes arguments : un seul abonnement) et n'en gardent que leurs avis.
 */
export function PostJudicialNotice({ networkId, postId }: { networkId: Id<"networks">; postId: Id<"posts"> }) {
  const labels = useNoticeLabels()
  const query = useAuthenticatedConvexQuery(api.modules.moderation.measures.visiblePostNotices, { networkId })
  const notices = query.data?.filter((notice) => notice.postId === postId) ?? []
  return <JudicialNoticeList notices={notices} labels={labels} />
}

/** Au-dessus d'un profil ou d'une page ouverts par leur adresse, dans le réseau de la coque. */
export function HandleJudicialNotices({ kind, handle }: { kind: "person" | "page"; handle: string }) {
  const { networkId } = useNetwork()
  return <div className="pb-gutter empty:hidden"><JudicialNotices networkId={networkId} target={{ kind, handle }} /></div>
}
