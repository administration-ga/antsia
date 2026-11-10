/**
 * La destination « Profil » des membres (P02, navigation par destinations) :
 * CE QU'ELLE REGROUPE, hors de tout composant — testé en environnement `node`.
 *
 * Profil est l'espace PERSONNEL : mon profil public, ce que j'ai mis de côté,
 * mes préférences, mes données et mes recours, la sortie. Chaque entrée mène
 * à une adresse déjà servie ; aucune n'est créée pour l'occasion.
 *
 * P07 ouvre « Ma boutique » pour préparer sa présentation et P11 ouvre les
 * préparations privées. P13 ouvre le panier et Mes achats ; P15 ouvre Mes
 * candidatures (état autorisé, retrait, pièces) ; P14 ouvre Mes demandes
 * (devis reçus, rendez-vous, prestations).
 */
import { reseauAgentHref } from "@antsia/social-features/shell/reseau-agent-nav"
import { voletsUnder } from "@antsia/social-features/shell/reseau-menu-destinations"

import { routes } from "@/lib/routes"

/** Les trois groupes de la page, dans l'ordre du rendu. */
export type MeSection = "activity" | "preferences" | "account"

export interface MeEntry {
  id: string
  section: MeSection
  href: string
  /** Clés i18n QUALIFIÉES (espace de noms compris) : libellé et phrase. */
  labelKey: string
  descriptionKey: string
}

/** Une entrée personnelle à venir — jamais rendue tant que son lot n'est pas livré. */
export interface ReservedMeEntry {
  id: string
  availability: "reserved"
  requires: readonly string[]
}

/** P15 a livré « Mes candidatures » : plus aucune entrée réservée. */
export const RESERVED_ME_ENTRIES: readonly ReservedMeEntry[] = Object.freeze([])

/**
 * Les entrées de Profil, dans l'ordre du rendu. Mon profil public n'a
 * d'adresse qu'avec un identifiant PUBLIÉ : sans lui, l'entrée n'existe pas
 * (jamais un lien vers un 404).
 */
export function meEntries(handle: string | null): MeEntry[] {
  const published = handle !== null && handle.trim().length > 0 ? handle : null
  return [
    ...(published !== null
      ? [{ id: "profile", section: "activity" as const, href: routes.profile(published), labelKey: "antsia:me.profile", descriptionKey: "antsia:me.profileHint" }]
      : []),
    // Les volets rangés sous Profil par le moteur (les signets), sur la page réseau.
    ...voletsUnder("profil").map((tab) => ({
      id: tab,
      section: "activity" as const,
      href: reseauAgentHref(tab, routes.feed()),
      labelKey: `reseau:reseauAgentNav.tabs.${tab}.label`,
      descriptionKey: `reseau:reseauAgentNav.tabs.${tab}.description`,
    })),
    { id: "stories", section: "activity", href: routes.stories(), labelKey: "reseau:reseauMobileTabs.menu.stories", descriptionKey: "antsia:me.storiesHint" },
    { id: "shop", section: "activity", href: routes.myShops(), labelKey: "memberNetwork:commerce.myShop", descriptionKey: "memberNetwork:commerce.myShopLead" },
    { id: "cart", section: "activity", href: routes.cart(), labelKey: "cart:title", descriptionKey: "cart:lead" },
    { id: "purchases", section: "activity", href: routes.purchases(), labelKey: "purchases:title", descriptionKey: "purchases:lead" },
    { id: "checkoutPreparations", section: "activity", href: routes.myOrders(), labelKey: "checkout:ordersTitle", descriptionKey: "checkout:ordersLead" },
    { id: "payments", section: "activity", href: routes.paymentList(), labelKey: "payment:listTitle", descriptionKey: "payment:listLead" },
    // P14 : mes devis, rendez-vous et prestations restent atteignables, même après retrait d'une vitrine.
    { id: "serviceRequests", section: "activity", href: routes.serviceRequests(), labelKey: "services:requests.title", descriptionKey: "services:requests.lead" },
    // P15 : mes candidatures et leur retrait restent atteignables, même sans offre en cours.
    { id: "applications", section: "activity", href: routes.myApplications(), labelKey: "jobs:applications.title", descriptionKey: "jobs:applications.lead" },
    // Les paramètres de l'application : affichage (apparence, thème, motif de fond), langue et fuseau.
    { id: "settings", section: "preferences", href: routes.settings(), labelKey: "antsia:settings.title", descriptionKey: "antsia:me.settingsHint" },
    { id: "feedPreferences", section: "preferences", href: routes.feedPreferences(), labelKey: "antsia:feedPreferences.title", descriptionKey: "antsia:me.feedPreferencesHint" },
    { id: "moderation", section: "account", href: routes.moderation(), labelKey: "memberNetwork:nav.moderation", descriptionKey: "antsia:me.moderationHint" },
    { id: "personalData", section: "account", href: routes.personalControls(), labelKey: "antsia:personal.title", descriptionKey: "antsia:me.personalDataHint" },
  ]
}

export function meEntriesIn(section: MeSection, handle: string | null): MeEntry[] {
  return meEntries(handle).filter((entry) => entry.section === section)
}

/** U05 : le profil visible a sa carte en tête ; l'activité reste privée et sans doublon. */
export function meActivityEntries(handle: string | null): MeEntry[] {
  return meEntriesIn("activity", handle).filter((entry) => entry.id !== "profile")
}
