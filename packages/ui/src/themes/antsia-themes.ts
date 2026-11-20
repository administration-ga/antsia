/**
 * Les chartes qu'un membre d'antsia.ga choisit dans ses réglages (Préférences >
 * Thème, ADR-0027) : Gaboma, la charte du réseau (`antsia.css`, premier élément,
 * choix par défaut), puis six thèmes, chacun dans `antsia-<thème>.css` — dont Sable,
 * la charte de DIASPORA.GA portée dans le réseau (19/10/2026). Chaque
 * thème a trois couleurs, chacune avec ses fonctions, sur des fonds neutres ;
 * `antsia-themes.test.ts` vérifie que cette liste et les fichiers du dossier
 * coïncident.
 */
export const ANTSIA_THEME_IDS = ["gaboma", "soleil", "foret", "corail", "lagon", "electrique", "sable"] as const
export type AntsiaThemeId = (typeof ANTSIA_THEME_IDS)[number]

/** La valeur de `data-charte` d'un thème : `antsia` pour Gaboma, la charte du réseau ; `antsia-<thème>` sinon. */
export function antsiaCharteFor(id: AntsiaThemeId): string {
  return id === "gaboma" ? "antsia" : `antsia-${id}`
}

/** Les thèmes au format attendu par le fournisseur d'apparence du moteur. */
export const ANTSIA_THEMES: readonly { id: AntsiaThemeId; charte: string }[] = ANTSIA_THEME_IDS.map((id) => ({ id, charte: antsiaCharteFor(id) }))
