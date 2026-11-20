/**
 * i18n du moteur — i18next, comme le socle et consulat.ga.
 *
 * Un espace de noms par paquet : `social` (ces surfaces), `errors` (codes
 * renvoyés par le serveur, `@antsia/social-contracts`), et ceux des
 * applications (`antsia`, `admin`, et `diaspora-ga` chez DIASPORA.GA). Aucune
 * chaîne d'interface hors des fichiers de locale (cliquet
 * `no-hardcoded-strings`) ; les deux langues portent les mêmes clés (cliquet
 * `i18n-locales`).
 */
import { createInstance, type i18n as I18nInstance, type Resource } from "i18next"

import { serverCodeResources } from "@antsia/social-contracts/i18n"

import enDirect from "./locales/en/direct.json"
import frDirect from "./locales/fr/direct.json"
import enIdentity from "./locales/en/identity.json"
import frIdentity from "./locales/fr/identity.json"

import enSocial from "./locales/en/social.json"
import frSocial from "./locales/fr/social.json"
import enMessagerieConversation from "./locales/en/messagerie.conversation.json"
import enMessagerieDock from "./locales/en/messagerie.dock.json"
import enMessagerieGroupes from "./locales/en/messagerie.groupes.json"
import enMessagerieContexte from "./locales/en/messagerie.contexte.json"
import enIappelCore from "./locales/en/iappel.core.json"
import enIappelSurfaces from "./locales/en/iappel.surfaces.json"
import enIappelStores from "./locales/en/iappel.stores.json"
import enStories from "./locales/en/stories.json"
import enReseau from "./locales/en/reseau.json"
import enReseauFil from "./locales/en/reseau.fil.json"
import enReseauRelations from "./locales/en/reseau.relations.json"
import enReseauGroupes from "./locales/en/reseau.groupes.json"
import enReseauProfil from "./locales/en/reseau.profil.json"
import enReseauCoque from "./locales/en/reseau.coque.json"
import enReseauPages from "./locales/en/reseau.pages.json"
import enReseauImmersion from "./locales/en/reseau.immersion.json"
import enNotifications from "./locales/en/notifications.json"
import enAlbums from "./locales/en/albums.json"
import enShell from "./locales/en/shell.json"
import frMessagerieConversation from "./locales/fr/messagerie.conversation.json"
import frMessagerieDock from "./locales/fr/messagerie.dock.json"
import frMessagerieGroupes from "./locales/fr/messagerie.groupes.json"
import frMessagerieContexte from "./locales/fr/messagerie.contexte.json"
import frIappelCore from "./locales/fr/iappel.core.json"
import frIappelSurfaces from "./locales/fr/iappel.surfaces.json"
import frIappelStores from "./locales/fr/iappel.stores.json"
import frStories from "./locales/fr/stories.json"
import frReseau from "./locales/fr/reseau.json"
import frReseauFil from "./locales/fr/reseau.fil.json"
import frReseauRelations from "./locales/fr/reseau.relations.json"
import frReseauGroupes from "./locales/fr/reseau.groupes.json"
import frReseauProfil from "./locales/fr/reseau.profil.json"
import frReseauCoque from "./locales/fr/reseau.coque.json"
import frReseauPages from "./locales/fr/reseau.pages.json"
import frReseauImmersion from "./locales/fr/reseau.immersion.json"
import frNotifications from "./locales/fr/notifications.json"
import frAlbums from "./locales/fr/albums.json"
import frShell from "./locales/fr/shell.json"

export const SUPPORTED_LOCALES = ["fr", "en"] as const
export type Locale = (typeof SUPPORTED_LOCALES)[number]
export const DEFAULT_LOCALE: Locale = "fr"

export function isSupportedLocale(value: unknown): value is Locale {
  return typeof value === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(value)
}

/**
 * Ressources du moteur (surfaces + codes serveur), par langue.
 *
 * Espaces de noms des surfaces : `messagerie`, `iappel`, `stories`, `reseau`,
 * `notifications`, `albums`, `shell`. Un espace peut être rédigé en PLUSIEURS fichiers (un par tranche de
 * duplication : `messagerie.conversation.json`, `messagerie.dock.json`…),
 * fusionnés ici ; leurs clés de premier niveau sont celles des fichiers source
 * (`messagerieDock.…`), donc disjointes par construction.
 */
export const engineResources = {
  fr: {
    social: frSocial,
    direct: frDirect,
    identity: frIdentity,
    messagerie: { ...frMessagerieConversation, ...frMessagerieDock, ...frMessagerieGroupes, ...frMessagerieContexte },
    iappel: { ...frIappelCore, ...frIappelSurfaces, ...frIappelStores },
    stories: frStories,
    reseau: { ...frReseau, ...frReseauFil, ...frReseauRelations, ...frReseauGroupes, ...frReseauProfil, ...frReseauCoque, ...frReseauPages, ...frReseauImmersion },
    notifications: frNotifications,
    albums: frAlbums,
    shell: frShell,
    ...serverCodeResources.fr,
  },
  en: {
    social: enSocial,
    direct: enDirect,
    identity: enIdentity,
    messagerie: { ...enMessagerieConversation, ...enMessagerieDock, ...enMessagerieGroupes, ...enMessagerieContexte },
    iappel: { ...enIappelCore, ...enIappelSurfaces, ...enIappelStores },
    stories: enStories,
    reseau: { ...enReseau, ...enReseauFil, ...enReseauRelations, ...enReseauGroupes, ...enReseauProfil, ...enReseauCoque, ...enReseauPages, ...enReseauImmersion },
    notifications: enNotifications,
    albums: enAlbums,
    shell: enShell,
    ...serverCodeResources.en,
  },
} as const

export type AppResources = Record<Locale, Record<string, Record<string, unknown>>>

/**
 * Instance i18next ISOLÉE : une par requête côté serveur, une par arbre côté
 * client. Les ressources sont en mémoire, l'initialisation est synchrone
 * (`initAsync: false`) — aucun clignotement de clés au premier rendu.
 */
export function createAppI18n(options: {
  locale: Locale
  appResources: AppResources
  defaultNS: string
  /** Variables interpolées par défaut dans toutes les clés (la marque de l'application, `{{brand}}`). */
  defaultVariables?: Record<string, string>
}): I18nInstance {
  const resources: Resource = {}
  for (const locale of SUPPORTED_LOCALES) {
    resources[locale] = { ...engineResources[locale], ...options.appResources[locale] }
  }
  const instance = createInstance()
  void instance.init({
    lng: options.locale,
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: [...SUPPORTED_LOCALES],
    resources,
    defaultNS: options.defaultNS,
    ns: Object.keys(resources[DEFAULT_LOCALE] ?? {}),
    interpolation: { escapeValue: false, ...(options.defaultVariables ? { defaultVariables: options.defaultVariables } : {}) },
    initAsync: false,
    returnNull: false,
  })
  return instance
}
