/**
 * Traductions des codes renvoyés par le serveur du moteur. Un espace de noms par
 * famille : `errors` (codes d'erreur du moteur), `rules` (règles du domaine
 * enfreintes, avec leurs bornes en paramètres d'interpolation) ; `diaspora` est
 * réservé à la tranche `convex/modules/diaspora` (propriété de la session
 * DIASPORA.GA). Les applications chargent ces ressources dans leur instance
 * i18next, à côté de leurs propres espaces de noms.
 */
import enErrors from "./locales/en/errors.json"
import enRules from "./locales/en/rules.json"
import frErrors from "./locales/fr/errors.json"
import frRules from "./locales/fr/rules.json"

export const SERVER_CODE_NAMESPACES = ["errors", "rules"] as const
export type ServerCodeNamespace = (typeof SERVER_CODE_NAMESPACES)[number]

export const serverCodeResources = {
  fr: { errors: frErrors, rules: frRules },
  en: { errors: enErrors, rules: enRules },
} as const
