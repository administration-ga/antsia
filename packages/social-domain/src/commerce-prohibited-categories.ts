/**
 * CM-02 — les CATÉGORIES INTERDITES et RÉGLEMENTÉES du commerce (plan 08 de la finalisation, décision 5 ;
 * registre DP-05 ; étude des sept univers, § 5.1 et § 7.3). Règle pure, partagée par le moteur et les écrans.
 *
 * LA LISTE N'EST PAS DÉCIDÉE : le propriétaire et un conseil la fixeront. Ce module porte le MÉCANISME — une
 * liste fermée et VERSIONNÉE de clés de la taxonomie du catalogue (`commerce/catalogFacets.ts`, fichier jumeau
 * de PRO.GA, laissé intact) et la règle qui la lit. Tant que la liste est vide, aucune offre n'est refusée ni
 * relue à cause de sa catégorie.
 *
 * - `prohibited` (interdite) : l'offre est refusée au reflet du catalogue — lettre morte motivée, sans contenu,
 *   auditée — et n'entre ni dans l'index de la marketplace ni dans la vitrine ; une offre déjà reflétée qui passe
 *   dans une catégorie interdite en sort, et toute lecture l'écarte.
 * - `regulated` (réglementée) : la vitrine qui en propose passe sous la politique `review` : son admission
 *   revient à l'équipe de la plateforme, jamais d'office.
 *
 * Une clé couvre ses descendantes : le chemin de catégorie d'une offre va de la racine à la feuille et la règle
 * lit chacun de ses maillons. L'interdiction l'emporte sur la réglementation.
 *
 * Changer la liste : `version` + 1, et `decision` cite la décision validée (propriétaire et conseil). Une liste
 * non vide sans décision citée est une faute (`commerceCategoryRulesProblems`, testé).
 */
import { COMMERCE_CATALOG_CATEGORIES, type CommerceCatalogCategoryKey } from "./commerce/catalogFacets"

export const COMMERCE_CATEGORY_RULE_KINDS = ["prohibited", "regulated"] as const
export type CommerceCategoryRuleKind = (typeof COMMERCE_CATEGORY_RULE_KINDS)[number]

export type CommerceCategoryRuleEntry = { readonly key: CommerceCatalogCategoryKey; readonly rule: CommerceCategoryRuleKind }

export type CommerceCategoryRules = {
  /** Version de la liste : entier positif, augmenté à chaque changement. */
  readonly version: number
  /** La décision qui fixe la liste (référence du registre) ; `null` tant qu'aucune n'est prise. */
  readonly decision: string | null
  readonly entries: readonly CommerceCategoryRuleEntry[]
}

/**
 * La liste EN VIGUEUR. Version 1 : vide, faute de décision (DP-05 ouverte, plan 08 décision 5). Rien n'y entre
 * sans la liste validée par le propriétaire et un conseil.
 */
export const COMMERCE_CATEGORY_RULES: CommerceCategoryRules = { version: 1, decision: null, entries: [] }

/** Ce que la liste dit d'une offre : la règle, la clé qui l'a déclenchée et la version de la liste. */
export type CommerceCategoryRuling = { readonly rule: CommerceCategoryRuleKind; readonly key: CommerceCatalogCategoryKey; readonly version: number }

/**
 * La règle qui s'applique à un chemin de catégorie, ou `null`. Le maillon interdit le plus proche de la racine
 * l'emporte ; à défaut, le maillon réglementé le plus proche de la racine. Un chemin vide ou inconnu : `null`.
 */
export function commerceCategoryRuling(categoryPath: readonly string[], rules: CommerceCategoryRules): CommerceCategoryRuling | null {
  let regulated: CommerceCategoryRuling | null = null
  for (const key of categoryPath) {
    const entry = rules.entries.find((item) => item.key === key)
    if (!entry) continue
    if (entry.rule === "prohibited") return { rule: "prohibited", key: entry.key, version: rules.version }
    regulated ??= { rule: "regulated", key: entry.key, version: rules.version }
  }
  return regulated
}

/** Interdite ? (raccourci de lecture, même règle). */
export function isCommerceCategoryProhibited(categoryPath: readonly string[], rules: CommerceCategoryRules): boolean {
  return commerceCategoryRuling(categoryPath, rules)?.rule === "prohibited"
}

function ancestorsOf(key: string): string[] {
  const ancestors: string[] = []
  let current: string | null = COMMERCE_CATALOG_CATEGORIES.find((category) => category.key === key)?.parent ?? null
  while (current !== null) {
    ancestors.push(current)
    const parent: string | null = COMMERCE_CATALOG_CATEGORIES.find((category) => category.key === current)?.parent ?? null
    current = parent
  }
  return ancestors
}

/**
 * Les défauts d'une liste (liste vide : conforme). Une liste se relit avant d'entrer dans le code : version
 * entière positive, clés de la taxonomie, sans doublon ni clé déjà couverte par un ancêtre, et une décision citée
 * dès qu'une entrée existe.
 */
export function commerceCategoryRulesProblems(rules: CommerceCategoryRules): string[] {
  const problems: string[] = []
  if (!Number.isSafeInteger(rules.version) || rules.version < 1) problems.push(`version invalide : ${rules.version}`)
  if (rules.entries.length > 0 && (rules.decision === null || rules.decision.trim().length === 0)) problems.push("liste non vide sans décision citée")
  const known = new Set<string>(COMMERCE_CATALOG_CATEGORIES.map((category) => category.key))
  const listed = new Map<string, CommerceCategoryRuleKind>()
  for (const entry of rules.entries) {
    if (!known.has(entry.key)) problems.push(`clé hors taxonomie : ${entry.key}`)
    if (!(COMMERCE_CATEGORY_RULE_KINDS as readonly string[]).includes(entry.rule)) problems.push(`règle inconnue : ${entry.rule}`)
    if (listed.has(entry.key)) problems.push(`clé en double : ${entry.key}`)
    listed.set(entry.key, entry.rule)
  }
  // Une descendante est sans effet sous un ancêtre interdit, ou sous un ancêtre de même règle. Une descendante
  // INTERDITE sous un ancêtre RÉGLEMENTÉ reste utile (tout le rayon relu, une partie refusée).
  for (const entry of rules.entries) {
    const covering = ancestorsOf(entry.key).find((ancestor) => listed.get(ancestor) === "prohibited" || listed.get(ancestor) === entry.rule)
    if (covering) problems.push(`clé déjà couverte par ${covering} : ${entry.key}`)
  }
  return problems
}
