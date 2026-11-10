/**
 * Ressources de traduction de l'application, partagées par le rendu serveur et
 * le fournisseur client (mêmes ressources des deux côtés : aucun écart
 * d'hydratation).
 */
import { engineResources, type AppResources } from "@antsia/social-features/i18n"

import { composeAntsiaEngineOverrides } from "./compose-engine-overrides"
import frEngineOverrides from "./overrides/fr.json"
import enEngineOverrides from "./overrides/en.json"
import frProfileOverrides from "./overrides/u03-fr.json"
import enProfileOverrides from "./overrides/u03-en.json"
import frMessagesOverrides from "./overrides/u06-fr.json"
import enMessagesOverrides from "./overrides/u06-en.json"
import frLexiconOverrides from "./overrides/u09-fr.json"
import enLexiconOverrides from "./overrides/u09-en.json"
import frIcomOverrides from "./overrides/adr36-fr.json"
import enIcomOverrides from "./overrides/adr36-en.json"
import frIcomPro from "./locales/fr/icomPro.json"
import enIcomPro from "./locales/en/icomPro.json"
import frCommerceExperience from "./locales/fr/commerceExperience.json"
import enCommerceExperience from "./locales/en/commerceExperience.json"
import frEditorial from "./locales/fr/editorial.json"
import enEditorial from "./locales/en/editorial.json"
import frEditorialPublic from "./locales/fr/editorialPublic.json"
import enEditorialPublic from "./locales/en/editorialPublic.json"
import frPersonalMeetings from "./locales/fr/personalMeetings.json"
import enPersonalMeetings from "./locales/en/personalMeetings.json"
import frProfessionals from "./locales/fr/professionals.json"
import enProfessionals from "./locales/en/professionals.json"
import frProfessionalPublic from "./locales/fr/professionalPublic.json"
import enProfessionalPublic from "./locales/en/professionalPublic.json"
import frPaymentPreparation from "./locales/fr/paymentPreparation.json"
import enPaymentPreparation from "./locales/en/paymentPreparation.json"
import frProviderPreparation from "./locales/fr/providerPreparation.json"
import enProviderPreparation from "./locales/en/providerPreparation.json"
import frProvider from "./locales/fr/provider.json"
import enProvider from "./locales/en/provider.json"
import frSpecializedSpaces from "./locales/fr/specializedSpaces.json"
import enSpecializedSpaces from "./locales/en/specializedSpaces.json"
import frActivityConfiguration from "./locales/fr/activityConfiguration.json"
import enActivityConfiguration from "./locales/en/activityConfiguration.json"
import frMarketplace from "./locales/fr/marketplace.json"
import enMarketplace from "./locales/en/marketplace.json"
import frSocialExperience from "./locales/fr/socialExperience.json"
import enSocialExperience from "./locales/en/socialExperience.json"

import enAntsia from "./locales/en/antsia.json"
import frAntsia from "./locales/fr/antsia.json"
import enMemberNetwork from "./locales/en/memberNetwork.json"
import frMemberNetwork from "./locales/fr/memberNetwork.json"
import enPublicNetwork from "./locales/en/publicNetwork.json"
import frPublicNetwork from "./locales/fr/publicNetwork.json"
import enShops from "./locales/en/shops.json"
import frShops from "./locales/fr/shops.json"
import enCheckout from "./locales/en/checkout.json"
import frCheckout from "./locales/fr/checkout.json"
import enPayment from "./locales/en/payment.json"
import frPayment from "./locales/fr/payment.json"
import frCart from "./locales/fr/cart.json"
import enCart from "./locales/en/cart.json"
import frPurchases from "./locales/fr/purchases.json"
import enPurchases from "./locales/en/purchases.json"
import frJobs from "./locales/fr/jobs.json"
import enJobs from "./locales/en/jobs.json"
import frServices from "./locales/fr/services.json"
import enServices from "./locales/en/services.json"

/** Espace de noms de l'application. */
export const APP_NAMESPACE = "antsia"

function adapt(base: Record<string, Record<string, unknown>>, ...changes: Record<string, Record<string, unknown>>[]) {
  return changes.reduce((current, change) => ({ ...current, ...composeAntsiaEngineOverrides(current, change) }), base)
}

// Chaque adaptation part des namespaces complets : les clés inchangées du
// moteur et de l'application restent disponibles, au serveur comme au client.
export const appResources: AppResources = {
  fr: adapt({ ...engineResources.fr, antsia: frAntsia, memberNetwork: frMemberNetwork, publicNetwork: frPublicNetwork, shops: frShops, checkout: frCheckout, payment: frPayment, cart: frCart, purchases: frPurchases, jobs: frJobs, services: frServices, socialExperience: frSocialExperience, commerceExperience: frCommerceExperience, specializedSpaces: frSpecializedSpaces, activityConfiguration: frActivityConfiguration, marketplace: frMarketplace, provider: frProvider, providerPreparation: frProviderPreparation, paymentPreparation: frPaymentPreparation, professionalPublic: frProfessionalPublic, professionals: frProfessionals, personalMeetings: frPersonalMeetings, editorialPublic: frEditorialPublic, editorial: frEditorial, icomPro: frIcomPro }, frEngineOverrides, frProfileOverrides, frMessagesOverrides, frLexiconOverrides, frIcomOverrides),
  en: adapt({ ...engineResources.en, antsia: enAntsia, memberNetwork: enMemberNetwork, publicNetwork: enPublicNetwork, shops: enShops, checkout: enCheckout, payment: enPayment, cart: enCart, purchases: enPurchases, jobs: enJobs, services: enServices, socialExperience: enSocialExperience, commerceExperience: enCommerceExperience, specializedSpaces: enSpecializedSpaces, activityConfiguration: enActivityConfiguration, marketplace: enMarketplace, provider: enProvider, providerPreparation: enProviderPreparation, paymentPreparation: enPaymentPreparation, professionalPublic: enProfessionalPublic, professionals: enProfessionals, personalMeetings: enPersonalMeetings, editorialPublic: enEditorialPublic, editorial: enEditorial, icomPro: enIcomPro }, enEngineOverrides, enProfileOverrides, enMessagesOverrides, enLexiconOverrides, enIcomOverrides),
}
