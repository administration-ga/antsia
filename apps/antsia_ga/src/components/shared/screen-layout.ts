/**
 * Pleine largeur (décision du propriétaire du 22/10/2026) : « le design doit être uniforme, s'adapter à tous
 * les formats (responsive) et les écarts cohérents ». Les écrans de membre occupent toute la colonne entre les
 * gouttières ; en grande largeur, leurs sections et les champs de leurs formulaires se rangent en colonnes
 * responsives au lieu de s'étirer chacun sur une ligne. Entre deux colonnes, l'écart vaut la gouttière
 * (`--spacing-gutter`) ; l'écart vertical reste celui de chaque écran (`gap-y-*` à côté). Quand la place
 * manque, une seule colonne : au téléphone, rien ne change (sections et zones de texte restent empilées
 * jusqu'à 1 040 px de large ; deux champs courts tiennent côte à côte dès 528 px, comme avec `sm:grid-cols-2`).
 * Un enfant qui doit traverser toutes les colonnes (alerte, actions) prend `col-span-full`.
 */

/** Les sections d'un écran (cartes, groupes) et les champs longs (zones de texte) : 32rem au moins par colonne. */
export const SCREEN_SECTIONS = "grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,32rem),1fr))] items-start gap-x-gutter *:min-w-0"

/** Les champs courts d'un formulaire (texte d'une ligne, date, nombre, choix) : 16rem au moins par colonne. */
export const FORM_FIELDS = "grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),1fr))] items-start gap-x-gutter *:min-w-0"

/** Sur le cadre d'un écran : dès 768 px, le bouton d'envoi d'un formulaire en grille garde sa largeur au lieu de
 * traverser toute la colonne ; au téléphone, il reste pleine largeur. */
export const SCREEN_SUBMIT = "min-[768px]:[&_form_button[type=submit]]:justify-self-start"
