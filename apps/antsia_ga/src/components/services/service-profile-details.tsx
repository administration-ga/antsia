import { parseCommerceServiceProfile } from "@antsia/social-domain/commerce/serviceProfile"

import type { CatalogOffer, CatalogTranslate } from "@/components/shops/catalog-model"

/** Le manifeste reste celui de l'offre publiée, y compris ses médias retenus. */
export function serviceProfileOf(offer: CatalogOffer) {
  return offer.kind === "service" ? parseCommerceServiceProfile(offer.serviceProfile, offer.media.length) : null
}

export function serviceLanguageName(code: string, locale: string): string {
  try { return new Intl.DisplayNames([locale], { type: "language" }).of(code) ?? code } catch { return code }
}

/** Projection SSR pure : aucune modalité n'est déduite d'un prix ou d'une disponibilité. */
export function ServiceProfileDetails({ offer, locale, t }: { offer: CatalogOffer; locale: string; t: CatalogTranslate }) {
  if (offer.kind !== "service") return null
  const profile = serviceProfileOf(offer)
  const duration = offer.facets?.attributes.find(attribute => attribute.key === "durationMinutes")
  return <section className="offer-detail-full grid min-w-0 gap-4 rounded-[var(--ui2-card-radius)] border border-border p-4" data-service-profile>
    <h2 className="mp-subtitle">{t("profile.title")}</h2>
    {!profile ? <p className="text-sm text-muted-foreground">{t("profile.unknown")}</p> : <>
      <p className="text-xs text-muted-foreground">{t("profile.declared")}</p>
      <dl className="grid min-w-0 gap-4 sm:grid-cols-2">
        <div><dt className="font-semibold">{t("profile.commercialModes")}</dt><dd><ul className="mt-1 grid gap-1">{profile.commercialModes.map(mode => <li key={mode}>{t(`commercialModes.${mode}`)}</li>)}</ul></dd></div>
        {profile.languageCodes.length ? <div><dt className="font-semibold">{t("profile.languages")}</dt><dd className="mt-1 break-words">{profile.languageCodes.map(code => serviceLanguageName(code, locale)).join(" · ")}</dd></div> : null}
        {profile.zones.length ? <div><dt className="font-semibold">{t("profile.zones")}</dt><dd><ul className="mt-1 grid gap-1">{profile.zones.map(zone => <li key={zone.locality} className="break-words">{zone.locality}</li>)}</ul></dd></div> : null}
        {duration?.type === "number" ? <div><dt className="font-semibold">{t("profile.duration")}</dt><dd className="mt-1">{t("profile.minutes", { count: duration.value })}</dd></div> : null}
      </dl>
      {(["deliverables", "inclusions", "exclusions"] as const).map(field => profile[field].length ? <div key={field}><h3 className="font-semibold">{t(`profile.${field}`)}</h3><ul className="mt-2 list-inside list-disc space-y-1">{profile[field].map(value => <li key={value} className="whitespace-pre-wrap break-words">{value}</li>)}</ul></div> : null)}
    </>}
    <p className="text-sm text-muted-foreground">{t("availability.onRequest")}</p>
  </section>
}
