import type { CommerceOfferEvent } from "@antsia/social-domain/commerce/projection"

/** Champs publics bornés du contrat, sans corps signé ni identifiants de ressources. */
export function commerceOfferModerationText(offer: CommerceOfferEvent): string {
  const profile = offer.serviceProfile
  return [offer.description, ...offer.tags, ...offer.variants.map(variant => variant.label),
    ...(offer.facets?.attributes.filter(attribute => typeof attribute.value === "string").map(attribute => String(attribute.value)) ?? []),
    ...(profile ? [...profile.commercialModes, ...profile.languageCodes, ...profile.zones.flatMap(zone => [zone.countryCode, zone.locality]), ...profile.deliverables, ...profile.inclusions, ...profile.exclusions, ...profile.portfolio.flatMap(item => [item.title, item.description])] : []),
  ].filter(Boolean).join(" · ")
}
