import type { Locale } from "@antsia/social-features/i18n"

import { JudicialNoticeList } from "@/components/judicial/judicial-notice-list"
import { loadPublicJudicialNotices, type PublicJudicialNoticeTarget } from "@/lib/public-data"
import { getPublicT } from "./public-copy"

/**
 * SU01h — les avis ordonnés par le juge au-dessus d'une publication, d'un profil ou d'une page publics.
 * La projection est à part : si elle manque ou échoue, rien ne s'affiche et la page reste lisible.
 */
export async function PublicJudicialNotices({ target, locale, handoff = false }: { target: PublicJudicialNoticeTarget; locale: Locale; handoff?: boolean }) {
  const result = await loadPublicJudicialNotices(target.kind, target.kind === "post" ? target.id : target.handle, handoff)
  if (result.status !== "ready" || result.data.length === 0) return null
  const t = getPublicT(locale)
  return <div className="mb-5"><JudicialNoticeList notices={result.data} labels={{ region: t("judicial.region"), correction: t("judicial.correction"), origin: t("judicial.origin") }} /></div>
}
