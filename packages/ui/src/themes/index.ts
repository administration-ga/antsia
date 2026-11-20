/**
 * Registre des thèmes d'application du moteur. Un thème = un fichier
 * `<nom>.css` dans ce dossier, qui surcharge la charte de base sur
 * `[data-charte="<nom>"]`. `diaspora-ga` appartient à la session DIASPORA.GA
 * (fichier `diaspora-ga.css`, écrit par elle).
 */
export const APPLICATION_THEMES = ["antsia", "admin-antsia", "diaspora-ga"] as const
export type ApplicationTheme = (typeof APPLICATION_THEMES)[number]

/** Les thèmes qu'un membre d'antsia.ga choisit dans ses réglages (Gaboma, la charte du réseau, et six thèmes dont Sable, la charte de DIASPORA.GA ; ADR-0027). */
export { ANTSIA_THEME_IDS, ANTSIA_THEMES, antsiaCharteFor, type AntsiaThemeId } from "./antsia-themes"
