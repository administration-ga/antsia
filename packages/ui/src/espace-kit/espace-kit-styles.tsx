// Dupliqué de socle/packages/agent-features/src/components/espace-kit/espace-kit-styles.tsx @ ad2e7fdc2 — adaptations : feuille sortie du JSX dans une constante de module (`ESPACE_KIT_CSS`) — un littéral enfant de `<style>` passerait pour une chaîne d'interface ; pont du Poste retiré (sélecteurs `[data-charte="espace-structure"]`, `.poste-workspace` et jetons `--poste-radius-*`, absents du moteur) ; AUCUNE couleur littérale — jetons de la charte seulement, y compris dans les commentaires ; commentaires rapportés au moteur (cliquets `no-hardcoded-colors` et `theme-contract`) ; règles, sélecteurs et paliers du kit inchangés. ; contour des surfaces posées sur la page lu dans --esp-surface-border, filet d'origine en repli (aucun contour quand le thème distingue déjà la carte du fond) ; aplats d'identité et leur texte selon les chartes (`--esp-identity-fill`, `--primary-fill-on`, pastille tonale des états actifs ; ADR-0027), facture d'origine en repli. nouveaux raccords géométrie, surfaces, onglets et boutons derrière les alias opt-in ANTSIA `--esp-primitive-*` ; rembourrage 16 px, cibles 44 px, valeurs historiques en repli.
"use client"

/**
 * Feuille de style partagée du kit de primitives d'espace (`@antsia/ui/espace-kit`).
 *
 * Un seul `<style href="espace-kit" precedence="default">` pour tout le
 * kit : React 19 le hisse et le dédoublonne dans le `<head>`, donc plusieurs
 * pages peuvent monter `<EspaceKitStyles />` sans jamais produire deux fois
 * la même feuille (même patron que `rp-people-grid` dans `PeoplePanel.tsx`).
 *
 * Zéro couleur littérale : toutes les couleurs passent par des jetons
 * `var(--…)` déclarés par la charte de base (`styles/charte.css`, familles
 * ui-v2, shadcn et `--esp-*`). Le cliquet `no-hardcoded-colors` couvre ce
 * dossier (il n'exempte que `styles/` et `themes/`) et scanne aussi les
 * COMMENTAIRES : ne jamais y citer une couleur littérale ni une classe de
 * palette, même à titre d'exemple. Le cliquet `theme-contract` exige que tout
 * jeton lu ici soit déclaré par la charte.
 *
 * La feuille vit dans une CONSTANTE de module et non en littéral enfant de
 * `<style>` : le cliquet `no-hardcoded-strings` lirait ce littéral comme un
 * texte d'interface.
 *
 * ⚠️ Aucun accent grave dans la feuille qui suit : c'est un littéral de
 * gabarit JavaScript, un backtick y terminerait la chaîne et casserait la
 * compilation avec des erreurs de typage très éloignées de la cause réelle
 * (vécu deux fois au socle le 2026-08-18).
 */
const ESPACE_KIT_CSS = `
      .esk-card {
        background: var(--esp-surface-card, var(--secondary));
        border: 1px solid var(--esp-surface-border, var(--border));
        border-radius: var(--esp-primitive-card-radius, 18px);
        box-shadow: var(--esp-surface-shadow, none);
      }
      .esk-card-head {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: var(--esp-card-gap, 12px);
      }
      .esk-card-title {
        margin: 0;
        font-family: var(--esp-heading-font-family, inherit);
        font-size: var(--esp-subsection-title-size, 14px);
        line-height: var(--esp-subsection-title-leading, normal);
        font-weight: 700;
        color: var(--ink-900);
      }
      .esk-eyebrow {
        margin: 0;
        font-size: 10.5px;
        font-weight: 700;
        letter-spacing: 0.09em;
        text-transform: uppercase;
        color: var(--ink-500);
      }
      .esk-count {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 22px;
        height: 22px;
        padding: 0 7px;
        border-radius: var(--esp-primitive-badge-radius, 999px);
        background: var(--ink-200);
        color: var(--ink-800);
        font-family: var(--font-mono);
        font-size: 11.5px;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
      }
      .esk-card-action {
        margin-left: auto;
        border: none;
        background: transparent;
        color: var(--primary-500);
        font: inherit;
        font-size: 12.5px;
        font-weight: 700;
        cursor: pointer;
      }
      .esk-card-action:hover { text-decoration: underline; }
      .esk-card-action:focus-visible {
        outline: 2px solid var(--ring);
        outline-offset: 2px;
        border-radius: 4px;
      }

      /* -- Rangee d'en-tete de page : reference du dossier, puis actions -- */
      .esk-topbar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 10px;
      }
      .esk-ref {
        font-family: var(--font-mono);
        font-size: 13px;
        letter-spacing: 0.04em;
        color: var(--ink-600);
      }
      .esk-btn {
        min-height: var(--esp-control-min-size, 38px);
        padding: 9px 13px;
        border-radius: var(--esp-primitive-button-radius, 11px);
        border: 1px solid var(--esp-primitive-neutral-border, var(--border));
        background: var(--esp-primitive-neutral-bg, var(--card));
        color: var(--muted-foreground);
        font-size: 12.5px;
        font-weight: 700;
        cursor: pointer;
      }
      .esk-btn:hover { background: var(--esp-primitive-neutral-bg, var(--ink-100)); }
      .esk-btn:focus-visible {
        outline: 2px solid var(--ring);
        outline-offset: 2px;
      }
      .esk-btn[data-primary="true"] {
        border-color: transparent;
        background: var(--primary-fill);
        color: var(--primary-fill-on, var(--on-fill));
      }
      .esk-btn[data-primary="true"]:hover { background: var(--primary-fill-hover); }

      /* -- Bandeau d'entete (identite, jauge) -- */
      .esk-strip {
        display: flex;
        align-items: center;
        gap: 14px;
        flex-wrap: wrap;
        background: var(--esp-surface-card, var(--secondary));
        border: 1px solid var(--esp-primitive-surface-border, var(--border));
        border-radius: var(--esp-primitive-card-radius, 18px);
        padding: var(--esp-card-padding, 16px 18px);
      }
      .esk-jauge {
        display: block;
        width: 170px;
        height: 5px;
        border-radius: 999px;
        background: var(--ink-200);
        overflow: hidden;
      }
      .esk-jauge > span {
        display: block;
        height: 100%;
        border-radius: 999px;
        background: var(--primary-fill);
      }

      /* -- Onglets "chemise" : l'actif fusionne avec le panneau qui suit -- */
      .esk-tabs {
        display: flex;
        gap: 4px;
        padding: 0 8px;
        overflow-x: auto;
        scrollbar-width: none;
        -ms-overflow-style: none;
      }
      .esk-tabs::-webkit-scrollbar { display: none; }
      .esk-tab {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        border: 1px solid transparent;
        border-bottom: none;
        border-radius: var(--esp-primitive-button-radius, 12px 12px 0 0);
        background: transparent;
        padding: 9px 15px 11px;
        min-height: var(--esp-control-min-size, 0px);
        font-size: 13px;
        font-weight: 700;
        color: var(--ink-600);
        cursor: pointer;
        white-space: nowrap;
      }
      .esk-tab-icon {
        display: inline-flex;
        align-items: center;
        flex-shrink: 0;
      }

      .esk-tab[aria-selected="true"] {
        background: var(--esp-primitive-tab-bg, var(--esp-surface-card, var(--secondary)));
        border-color: var(--esp-primitive-tab-border, var(--border));
        color: var(--esp-primitive-tab-fg, var(--ink-900));
        margin-bottom: -1px;
        padding-bottom: 12px;
      }
      .esk-tab:hover:not([aria-selected="true"]) { color: var(--ink-900); }
      .esk-tab:focus-visible {
        outline: 2px solid var(--ring);
        outline-offset: -2px;
      }
      .esk-tabpanel {
        background: var(--esp-surface-card, var(--secondary));
        border: 1px solid var(--esp-primitive-surface-border, var(--border));
        border-radius: var(--esp-primitive-card-radius, 18px);
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        padding: var(--esp-card-padding, 20px 24px 24px);
      }

      /* -- Etat vide -- */
      .esk-empty {
        border: 1px solid var(--esp-surface-border, var(--border));
        border-radius: var(--esp-primitive-card-radius, 18px);
        background: var(--esp-surface-card, var(--secondary));
        padding: var(--esp-card-padding, 24px);
        color: var(--ink-600);
        font-size: 13.5px;
        text-align: center;
      }
      /* -- Etat vide COMPACT (X-09) : le texte et son unique action tiennent
         sur une ligne, et le rembourrage passe de 24 a 12/14. Deux etats vides
         successifs — « Mes groupes » puis « Decouverte » — occupaient sinon
         pres de deux cents pixels pour dire deux fois « rien ici », et
         repoussaient d'autant le premier contenu utile.
         flex-wrap : sous 360 px, l'action repasse sous le texte au lieu de
         le comprimer a deux mots par ligne. -- */
      .esk-empty[data-density="compact"] {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 6px 14px;
        padding: var(--esp-card-padding, 12px 14px);
        text-align: left;
      }
      .esk-empty[data-density="compact"] > p { flex: 1 1 auto; min-width: 0; }
      .esk-empty[data-density="compact"] .esk-empty-action { flex: 0 0 auto; }
      /* L'action d'un etat vide : discrete, mais une VRAIE cible (44 px au
         doigt, cf. le regime de la pagination compacte plus bas). */
      .esk-empty-action > * {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        min-height: var(--esp-control-min-size, 32px);
        padding: 0 12px;
        border: 1px solid var(--esp-primitive-secondary-border, var(--border));
        border-radius: var(--esp-primitive-button-radius, 999px);
        background: var(--esp-primitive-secondary-bg, var(--esp-surface-card, var(--secondary)));
        color: var(--esp-primitive-secondary-fg, var(--primary));
        font-size: 13px;
        font-weight: 700;
        text-decoration: none;
        cursor: pointer;
      }
      .esk-empty-action > *:hover { border-color: var(--esp-primitive-secondary-border, var(--primary)); }
      .esk-empty-action > *:focus-visible {
        outline: 2px solid var(--ring);
        outline-offset: 2px;
      }
      @media (pointer: coarse) {
        .esk-empty-action > * { min-height: 44px; padding: 0 16px; }
      }

      /* -- Pagination -- */
      .esk-pagination {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        margin-top: 14px;
        flex-wrap: wrap;
      }
      .esk-pagination-nav,
      .esk-pagination-num {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 44px;
        min-height: 44px;
        padding: 0 10px;
        border-radius: var(--esp-primitive-button-radius, 10px);
        border: 1px solid var(--esp-primitive-neutral-border, var(--border));
        background: var(--esp-primitive-neutral-bg, var(--card));
        color: var(--ink-700);
        font-weight: 700;
        font-size: 12.5px;
        cursor: pointer;
      }
      /* Le monospace est reserve a ce qui se compte : seuls les NUMEROS de
         page le portent, jamais les mots "Precedent"/"Suivant" — d'ou une
         classe a part pour ces deux boutons, memes proportions, sans elle. */
      .esk-pagination-num {
        font-family: var(--font-mono);
        font-variant-numeric: tabular-nums;
      }
      .esk-pagination-num[aria-current="page"] {
        background: var(--primary-fill);
        color: var(--primary-fill-on, var(--on-fill));
        border-color: transparent;
      }
      .esk-pagination-nav:disabled,
      .esk-pagination-num:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
      .esk-pagination-nav:hover:not(:disabled),
      .esk-pagination-num:hover:not(:disabled) {
        background: var(--esp-primitive-neutral-bg, var(--ink-100));
      }
      .esk-pagination-num[aria-current="page"]:hover:not(:disabled) {
        background: var(--esp-primitive-identity-fill, var(--ink-100));
      }
      .esk-pagination-nav:focus-visible,
      .esk-pagination-num:focus-visible {
        outline: 2px solid var(--ring);
        outline-offset: 2px;
      }
      .esk-pagination-gap {
        color: var(--ink-500);
        padding: 0 4px;
      }

      /* -- Dialogue par portail (voir EspaceDialog.tsx) --
         Carte EN TRANCHES : en-tete fixe, corps seul defilant, pied fixe.
         Calque 100, celui des cartes flottantes du paquet : a 60, une
         boite ouverte depuis un dialogue Radix se rendait derriere lui. -- */
      .esk-dialog-veil {
        position: fixed;
        inset: 0;
        z-index: 100;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
        background: color-mix(in srgb, var(--ink-900) 45%, transparent);
      }
      .esk-dialog {
        position: relative;
        display: flex;
        flex-direction: column;
        width: min(560px, 100%);
        max-height: min(calc(100dvh - 32px), 896px);
        min-width: 0;
        overflow: hidden;
        background: var(--esp-surface-raised, var(--esp-surface-card, var(--secondary)));
        border: 1px solid var(--esp-raised-border, var(--border));
        border-radius: var(--esp-primitive-card-radius, 18px);
        box-shadow: var(--esp-floating-shadow, none);
      }
      .esk-dialog-header {
        flex-shrink: 0;
        min-width: 0;
        padding: var(--esp-card-padding, 16px) 60px 12px var(--esp-card-padding, 20px);
        border-bottom: 1px solid var(--border);
      }
      .esk-dialog-title {
        margin: 0;
        font-family: var(--esp-heading-font-family, inherit);
        font-size: var(--esp-section-title-size, 16px);
        font-weight: 700;
        line-height: var(--esp-section-title-leading, 1.35);
        color: var(--ink-900);
        overflow-wrap: anywhere;
      }
      .esk-dialog-description {
        margin: 4px 0 0;
        font-size: 13px;
        line-height: 1.45;
        color: var(--ink-600);
      }
      .esk-dialog-body {
        flex: 1 1 auto;
        min-height: 0;
        min-width: 0;
        overflow-y: auto;
        overscroll-behavior: contain;
        padding: var(--esp-card-padding, 16px 20px);
      }
      .esk-dialog-footer {
        flex-shrink: 0;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: flex-end;
        gap: 8px;
        padding: 12px var(--esp-card-padding, 20px);
        border-top: 1px solid var(--border);
      }
      .esk-dialog-close {
        position: absolute;
        top: 12px;
        right: 12px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: var(--esp-control-min-size, 32px);
        height: var(--esp-control-min-size, 32px);
        border: none;
        border-radius: 999px;
        background: var(--esp-primitive-icon-bg, transparent);
        color: var(--ink-600);
        cursor: pointer;
      }
      .esk-dialog-close:hover { background: var(--esp-primitive-icon-bg, var(--ink-100)); }
      .esk-dialog-close:focus-visible {
        outline: 2px solid var(--ring);
        outline-offset: 2px;
      }

      /* -- Pagination compacte : cibles tactiles réduites sur les rangées
         denses. Le pointeur grossier (tactile) reste sur 44px, la borne
         d'accessibilité usuelle, indépendamment de la densité choisie. -- */
      .esk-pagination[data-density="compact"] :is(.esk-pagination-nav,.esk-pagination-num) { min-height: var(--esp-control-min-size, 32px); min-width: var(--esp-control-min-size, 32px); padding: 0 8px; }
      @media (pointer: coarse) { .esk-pagination[data-density="compact"] :is(.esk-pagination-nav,.esk-pagination-num) { min-height: 44px; min-width: 44px; } }

      /* -- Cible tactile des onglets (X-10) -- L'onglet mesure 9+13x1.2+11
         ≈ 36 px de haut : lisible a la souris, sous la borne WCAG 2.5.5 au
         doigt. On ne change PAS la densite au pointeur fin — la chemise du
         dossier tient sur une ligne et l'epaissir de huit pixels partout
         deplacerait tous les ecrans du reseau. Meme regime, meme seuil et
         meme justification que la pagination compacte juste au-dessus. -- */
      @media (pointer: coarse) { .esk-tab { min-height: 44px; } }

      /* -- Les deux dernieres cibles du kit sous la borne (X-10) -- Le bouton
         generique du kit mesure 38 px de haut et la croix de fermeture d'une
         boite de dialogue 32 x 32 : au doigt, la seconde est la plus penible,
         parce qu'un rate ferme sur le contenu au lieu de la surface. Meme
         regime que ci-dessus : rien ne bouge au pointeur fin, la densite du
         bureau est inchangee. -- */
      @media (pointer: coarse) {
        .esk-btn { min-height: 44px; }
        .esk-dialog-close { width: 44px; height: 44px; }
      }
`

export function EspaceKitStyles() {
  return (
    <style href="espace-kit" precedence="default">
      {ESPACE_KIT_CSS}
    </style>
  )
}
