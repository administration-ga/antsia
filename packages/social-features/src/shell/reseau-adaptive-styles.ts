/**
 * U02 — opt-in ANTSIA seulement, après RESEAU_DESKTOP_CSS.
 * U09 (épure) : MÊME cadre que les autres pages de membre (member-navigation-styles
 * d'ANTSIA), 24 px en tête : le rail ne bouge pas d'une page à l'autre.
 * Gouttière unique (décision du propriétaire du 22/10/2026) : la marge extérieure
 * vaut l'écart entre les colonnes. Un seul jeton, --rp-adaptive-gutter, lu sur le
 * jeton Tailwind de l'application (--spacing-gutter), à défaut 16 puis 24 px dès
 * 1 200 px. Plus de largeur maximale : le rail et la colonne droite gardent leur
 * largeur, la colonne centrale prend tout le reste — bornée et centrée, elle
 * creuserait de part et d'autre un écart plus large que la gouttière. Les médias
 * du fil restent bornés en hauteur (PostMediaPresentation).
 * La largeur du viewport choisit la pose ; le conteneur décide si le contexte
 * de 312 px tient réellement. Les trois colonnes défilent dans leur propre
 * compartiment ; le centre entraîne le contexte jusqu'à sa dernière carte.
 * Le lecteur immersif garde son défileur dédié et sa mesure existante.
 */
export const RESEAU_ADAPTIVE_CSS = `
  .rp-scope[data-navigation-layout="adaptive"] {
    --rp-adaptive-nav-width: 96px;
    --rp-stack-gap: 16px;
    --rp-adaptive-gutter: var(--spacing-gutter, 16px);
    flex: 1;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    padding: 24px var(--rp-adaptive-gutter) 0;
  }
  .rp-scope[data-navigation-layout="adaptive"] .rp-grid {
    grid-template-columns: var(--rp-adaptive-nav-width) minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr);
    /* L'écart entre les colonnes EST la gouttière des bords. */
    gap: var(--rp-adaptive-gutter);
    align-items: stretch;
    flex: 1;
    height: 100%;
    min-height: 0;
    width: 100%;
    max-width: none;
    margin-inline: 0;
    overflow: hidden;
    padding-bottom: 0;
  }
  .rp-scope[data-navigation-layout="adaptive"] .rp-main-col {
    --rp-composer-height: 112px;
    --rp-tools-height: 76px;
    min-width: 0;
    min-height: 0;
    width: 100%;
    /* Toute la piste : la borne de base (792 px, 1 120 px pour une collection),
       centrée, laisserait un écart plus large que la gouttière autour du fil. */
    max-width: none;
    margin-inline: 0;
    overflow-y: auto;
    overflow-x: hidden;
    overscroll-behavior-y: contain;
    scrollbar-gutter: stable;
    scroll-padding-top: calc(var(--rp-composer-height, 112px) + var(--rp-tools-height, 76px) + var(--rp-stack-gap));
    padding-bottom: 24px;
  }
  .rp-scope[data-navigation-layout="adaptive"] .rp-identity-region {
    position: sticky;
    top: 0;
    z-index: 4;
    isolation: isolate;
  }
  .rp-scope[data-navigation-layout="adaptive"] .rp-volet-head {
    position: sticky;
    top: calc(var(--rp-composer-height, 112px) + var(--rp-stack-gap));
    z-index: 3;
    background: var(--esp-surface-card, var(--card));
    box-shadow: 0 calc(-1 * var(--rp-stack-gap)) 0 var(--background);
  }
  .rp-scope[data-navigation-layout="adaptive"] :is(.rp-main-col, .rp-rail-start, .rp-rail-end):focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: -2px;
  }
  .rp-scope[data-navigation-layout="adaptive"] .rp-rail-start,
  .rp-scope[data-navigation-layout="adaptive"] .rp-rail-end {
    min-width: 0;
    min-height: 0;
    max-height: 100%;
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior-y: contain;
    padding-bottom: 24px;
  }
  .rp-scope[data-navigation-layout="adaptive"] .rp-rail-start {
    display: flex;
    position: relative;
    top: auto;
  }
  .rp-scope[data-navigation-layout="adaptive"] .rp-rail-end {
    display: none;
  }
  .rp-scope[data-navigation-layout="adaptive"] .rp-rail-end > * {
    flex-shrink: 0;
  }
  /* Le contexte se lit comme une pile : iCom ne recouvre pas les cartes
     suivantes quand son compartiment défile. Son lecteur interne reste libre. */
  .rp-scope[data-navigation-layout="adaptive"] .rp-rail-end > .msg-dock {
    position: relative;
    top: auto;
  }
  .rp-scope[data-navigation-layout="adaptive"] .rp-main .rp-tabs {
    display: none;
  }
  /* Annule aussi la règle historique !important à 1108 px de conteneur. */
  .rp-scope[data-navigation-layout="adaptive"] .rp-desktop-icom-link {
    display: inline-flex !important;
  }
  @media (min-width: 1200px) {
    .rp-scope[data-navigation-layout="adaptive"] {
      --rp-adaptive-nav-width: 248px;
      --rp-adaptive-gutter: var(--spacing-gutter, 24px);
    }
  }
  /* 248 + 24 + 672 + 24 + 312 = 1280 : le contexte n'écrase pas le fil.
     Les deux conditions sont nécessaires, même dans un hôte au viewport large. */
  @media (min-width: 1400px) {
    @container rp-page (min-width: 1280px) {
      .rp-scope[data-navigation-layout="adaptive"] .rp-grid {
        grid-template-columns: var(--rp-adaptive-nav-width) minmax(0, 1fr) 312px;
      }
      .rp-scope[data-navigation-layout="adaptive"] .rp-rail-end {
        display: flex;
      }
      .rp-scope[data-navigation-layout="adaptive"] .rp-desktop-icom-link {
        display: none !important;
      }
    }
  }
`
