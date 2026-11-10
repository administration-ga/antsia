// Dupliqué de socle/packages/agent-features/src/features/messagerie/messagerie-styles.tsx @ ad2e7fdc2 — adaptations : fenêtre détachée au format téléphone UNIQUE du moteur, 440 × 956 (largeur suivant la hauteur disponible — formule de la fenêtre d'appel flottante —, hauteur dérivée ; l'iCom flottant du socle était en 390 × 844) ; plus aucune couleur littérale : ombre de déplacement et contraste obligé du code QR par jetons (`--icom-float-drag-shadow`, `--qr-code-surface`, `--qr-code-ink`) ; règles du sur-titre de fonction des fils de poste (`.msg-row-eyebrow`) retirées avec la branche poste ; feuille portée par la constante exportée `MESSAGERIE_STYLES_CSS` (le gabarit n'est plus un texte enfant du JSX) ; doc : cliquet de couleur du moteur, pile z sans iAsted. ; contour des surfaces posées sur la page lu dans --esp-surface-border, filet d'origine en repli (aucun contour quand le thème distingue déjà la carte du fond). ; système épuré (ADR-0027) : filtres en puces grises sans filet (`--esp-chip-*`), filtre actif et onglet actif en pastille tonale (`--esp-tab-active-*`), décompte des non-lus aux couleurs des réactions (`--role-react-*`), facture d'origine en repli. ; réactions de message (`data-mine`) à la teinte des réactions (`--role-react-soft`) ; couleurs par fonction (ADR-0027) : « Écrire » d'une relation (`data-role="message"`) et bouton d'envoi du composeur aux couleurs des messages (`--role-message-*`), pastille de non-lus `.msg-badge` aux couleurs des réactions (`--role-react-*`), facture d'origine en repli. ; « Écrire à » du journal d'appels (`.icom-relations-action[data-role="message"]`) en tonal des messages (`--role-message-soft`, `--role-message-ink`), facture d'origine en repli ; aplats d'identité et leur texte selon les chartes (`--esp-identity-fill`, `--primary-fill-on`, pastille tonale des états actifs ; ADR-0027), facture d'origine en repli.
"use client"

/**
 * messagerie-styles — la feuille UNIQUE des trois vues de la messagerie.
 *
 * Elle vivait dans le corps de `MessagerieDock` ; elle en sort parce que les
 * MÊMES vues se rendent maintenant dans deux surfaces (la carte du bureau et
 * la page du téléphone). Deux copies auraient dérivé au premier ajustement, et
 * la page aurait fini par ne plus ressembler à la carte.
 *
 * `<style href precedence>` (React 19) : la feuille est HISSÉE dans le
 * document et DÉDOUBLONNÉE par son `href`. Elle peut donc être montée par la
 * liste, la conversation et le composeur en même temps sans se répéter — c'est
 * ce qui permet à chaque vue de la déclarer pour elle-même, sans dépendre d'un
 * ancêtre qui l'aurait posée.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DEUX POSES, UN SEUL JEU DE RÈGLES
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Tout ce qui diffère entre la carte et la page passe par
 * [data-variant="page"] — jamais par une seconde classe. Sur la page :
 *
 *  · la colonne prend la HAUTEUR VISIBLE (var(--vv-height), clavier compris)
 *    au lieu d'une hauteur fixe de carte ;
 *  · aucune bordure ni rayon : une page n'est pas une carte posée sur un fond ;
 *  · les cibles tactiles montent à 44 px, les corps de texte à 16 px — sous
 *    16 px, iOS ZOOME sur le champ au focus et ne dézoome jamais ;
 *  · la réserve basse suit env(safe-area-inset-bottom) : la barre gestuelle
 *    mangerait sinon le composeur.
 *
 * ⚠️ AUCUNE couleur littérale ici — ni hexadécimal, ni fonction de couleur,
 * ni classe Tailwind de palette, commentaires compris : le cliquet
 * `no-hardcoded-colors` du moteur les refuse. Tout passe par des JETONS DE
 * RÔLE, qui suivent la charte du réseau (`data-charte`).
 *
 * La feuille est une CONSTANTE de module (`MESSAGERIE_STYLES_CSS`) : un
 * gabarit posé en texte enfant du JSX serait lu comme une chaîne d'interface.
 *
 * ⚠️ Aucun accent grave dans ce bloc : il refermerait le litéral de gabarit et
 * casserait la compilation sans message utile.
 */

/** La feuille partagée des vues de la messagerie — dédoublonnée par son `href`. */
export const MESSAGERIE_STYLES_CSS = `
        /* ── iCom : la barre d'onglets et le panneau des relations ──────
           Aucune couleur littérale : uniquement des jetons de la charte.
           Aucun accent grave non plus — ce bloc est un littéral gabarit. */
        /* La barre des briques, en BAS du panneau — le modèle WhatsApp :
           icône au-dessus du libellé, pilule sur la brique active. */
        .icom-tabs {
          display: flex;
          justify-content: space-around;
          gap: 2px;
          padding: 5px 8px 7px;
          border-top: 1px solid var(--ink-200);
          flex: 0 0 auto;
        }
        .icom-tab {
          appearance: none;
          min-height: 44px;
          border: none;
          background: transparent;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
          padding: 2px 10px 3px;
          font-size: 11px;
          font-weight: 600;
          color: var(--ink-500);
          cursor: pointer;
        }
        .icom-tab:hover { color: var(--ink-900); }
        .icom-tab-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 44px;
          height: 26px;
          border-radius: 999px;
        }
        .icom-tab[aria-selected="true"] {
          color: var(--ink-900);
          font-weight: 700;
        }
        .icom-tab[aria-selected="true"] .icom-tab-icon {
          background: var(--esp-tab-active-bg, var(--primary-100));
          color: var(--esp-tab-active-fg, var(--primary-700));
        }
        .icom-tab:focus-visible {
          outline: 2px solid var(--ring);
          outline-offset: -2px;
        }
        .icom-relations-list {
          list-style: none;
          margin: 0;
          padding: 4px 0;
        }
        .icom-relations-row {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 12px;
        }
        .icom-relations-row:hover { background: var(--ink-100); }
        .icom-relations-ident {
          display: flex;
          flex-direction: column;
          min-width: 0;
          flex: 1 1 auto;
        }
        .icom-relations-name {
          /* Même hiérarchie que le rail « Agents à découvrir ». */
          font-size: 12.5px;
          font-weight: 700;
          color: var(--ink-900);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .icom-relations-handle {
          font-size: 10.5px;
          line-height: 1.4;
          color: var(--ink-500);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .icom-relations-actions {
          display: inline-flex;
          gap: 6px;
          flex: 0 0 auto;
        }
        .icom-relations-action {
          appearance: none;
          border: 1px solid var(--border);
          background: var(--card);
          border-radius: 8px;
          padding: 5px 9px;
          font-size: 12px;
          font-weight: 700;
          color: var(--ink-900);
          cursor: pointer;
        }
        .icom-relations-action[data-primary="true"] {
          border-color: var(--primary-600);
          color: var(--primary-600);
        }
        /* Écrire depuis le journal d'appels : tonal des messages (ADR-0027),
           comme le bouton Écrire ; le filet prend le fond, donc s'efface. Repli :
           la facture d'origine du bouton. */
        .icom-relations-action[data-role="message"] {
          border-color: var(--role-message-soft, var(--border));
          background: var(--role-message-soft, var(--card));
          color: var(--role-message-ink, var(--ink-900));
        }
        /* Variante à icône seule (appel vidéo) : carrée, et surtout au
           PLANCHER TACTILE. Un bouton de 24 px se rate une fois sur trois au
           doigt, et celui-ci déclenche un appel — la cible prime sur la
           compacité de la rangée. */
        .icom-relations-action[data-icon="true"] {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 44px;
          min-height: 44px;
          padding: 5px 8px;
        }
        .icom-relations-action:disabled { opacity: 0.6; cursor: default; }
        .icom-relations-action:focus-visible {
          outline: 2px solid var(--ring);
          outline-offset: 1px;
        }
        /* Les gestes liés à une même personne forment UNE commande segmentée :
           message, vidéo, audio. La bordure extérieure porte le bloc ; les
           séparateurs internes suffisent à distinguer les trois cibles. */
        .icom-action-group {
          position: relative;
          z-index: 0;
          isolation: isolate;
          display: inline-flex;
          align-items: stretch;
          flex: 0 0 auto;
          border: 0;
          background: transparent;
        }
        /* Même règle que les filtres : 44 px pour le doigt, 34 px seulement
           pour la pilule visible. */
        .icom-action-group::before {
          content: "";
          position: absolute;
          z-index: -2;
          inset: 5px 0;
          border: 1px solid var(--border);
          border-radius: 999px;
          background: var(--card);
        }
        .icom-action-group-btn {
          appearance: none;
          position: relative;
          z-index: 0;
          display: grid;
          place-items: center;
          width: 44px;
          height: 44px;
          padding: 0;
          border: 0;
          border-radius: 0;
          background: transparent;
          color: var(--ink-600);
          cursor: pointer;
        }
        .icom-action-group-btn svg { stroke-width: 1.6; }
        .icom-action-group-btn::before {
          content: "";
          position: absolute;
          z-index: -1;
          inset: 6px 1px;
          background: transparent;
        }
        .icom-action-group-btn:first-child::before {
          border-radius: 999px 0 0 999px;
        }
        .icom-action-group-btn:last-child::before {
          border-radius: 0 999px 999px 0;
        }
        .icom-action-group-btn + .icom-action-group-btn::after {
          content: "";
          position: absolute;
          inset-block: 10px;
          inset-inline-start: 0;
          width: 1px;
          background: var(--border);
        }
        .icom-action-group-btn:hover {
          color: var(--ink-900);
        }
        .icom-action-group-btn:hover::before { background: var(--ink-100); }
        .icom-action-group-btn[data-primary="true"]::before {
          background: var(--primary-100);
        }
        .icom-action-group-btn[data-primary="true"] {
          color: var(--primary-800);
        }
        /* Écrire : couleur des messages (ADR-0027), tonal d'identité en repli. */
        .icom-action-group-btn[data-role="message"][data-primary="true"]::before {
          background: var(--role-message-soft, var(--primary-100));
        }
        .icom-action-group-btn[data-role="message"][data-primary="true"] {
          color: var(--role-message-ink, var(--primary-800));
        }
        .icom-action-group-btn[data-live="true"] {
          color: var(--success);
        }
        .icom-action-group-btn:disabled { opacity: .45; cursor: default; }
        .icom-action-group-btn:disabled:hover { color: var(--ink-600); }
        .icom-action-group-btn:disabled:hover::before { background: transparent; }
        .icom-action-group-btn:focus-visible {
          outline: 2px solid var(--ring);
          outline-offset: -6px;
          border-radius: 999px;
        }
        .icom-relations-empty {
          margin: 0;
          padding: 16px 14px;
          font-size: 13px;
          color: var(--ink-500);
        }
        .msg-dock {
          display: block;
          position: sticky;
          /* Le rail a déjà sa propre origine. Un top de 16 px décalait le
             sticky et absorbait exactement la gouttière de 16 px suivante. */
          top: 0;
          /* La hauteur suit la forme réelle : 420 px en moyen, deux rangées
             en rétracté. Le z-index est indispensable à un enfant sticky :
             sans lui, les cartes suivantes (peintes après dans le DOM)
             traversent visuellement iCom pendant le défilement du rail. */
          --icom-anchored-height: min(52vh, 420px);
          z-index: 2;
          isolation: isolate;
          background: var(--background);
          border-radius: var(--rp-surface-radius, 14px);
          /* Dans le rail (flex-column), align-self: start donnait au dock
             une largeur max-content : un nom long élargissait iCom au-delà
             des 312 px disponibles et masquait deux onglets. */
          align-self: stretch;
          width: 100%;
          min-width: 0;
          max-width: 100%;
        }
        .msg-panel {
          display: flex;
          flex-direction: column;
          width: 100%;
          border: 1px solid var(--esp-surface-border, var(--ink-200));
          border-radius: var(--rp-surface-radius, 14px);
          /* La surface de carte unifiée de l'espace (globals.css) : le dock
             est une carte du rail comme les autres — en dur sur --ink-0, il
             restait la seule carte blanche de la colonne. */
          background: var(--esp-surface-card, var(--ink-0));
          overflow: hidden;
        }
        /* Barre GLOBALE de la surface iCom. Elle porte uniquement le nom de
           la fenêtre et sa géométrie ; l'en-tête juste dessous nomme la
           brique active et conserve ses actions métier. Cette séparation
           évite la rangée hybride iChat / Groupe / Rétracter / Détacher. */
        .icom-surface-bar {
          display: flex;
          align-items: center;
          gap: 8px;
          min-height: 56px;
          padding: 4px 6px 4px 8px;
          border-bottom: 1px solid var(--ink-200);
          background: var(--esp-surface-card, var(--ink-0));
          flex: 0 0 auto;
        }
        .icom-surface-heading {
          display: flex;
          align-items: center;
          gap: 9px;
          flex: 1 1 auto;
          min-width: 0;
          min-height: 44px;
          padding: 6px 8px;
          color: var(--ink-500);
        }
        .icom-surface-title {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 13.5px;
          font-weight: 800;
          color: var(--ink-900);
        }
        .icom-surface-actions {
          display: flex;
          align-items: center;
          gap: 2px;
          flex: 0 0 auto;
        }
        /* Hauteur FIXE une fois depliee : sans elle, passer d'une vue a
           l'autre ferait sauter la cellule d'en-tete, et le fil dessous. */
        .msg-panel[data-open="true"] {
          height: var(--icom-anchored-height, min(52vh, 420px));
        }
        /* Un appel qui COUVRE la carte ancrée la grandit. Recette réelle du
           14/09, onze personnes dans le rail de 312 px : sur 420 px, barre,
           en-tête d'appel, bande de dix vignettes, ligne « Appel complet »
           et commandes laissaient 23 px à la scène — le nom de l'orateur
           sans son visage. 640 px au plus, jamais au-delà de la hauteur
           visible (le rail est collant, en haut de colonne), jamais sous la
           hauteur de repos : la carte ne rétrécit pas en décrochant. */
        .msg-panel[data-variant="dock"][data-open="true"][data-call="cover"] {
          height: max(
            var(--icom-anchored-height, min(52vh, 420px)),
            min(640px, calc(100dvh - 96px))
          );
        }
        /* Replié, l'en-tête ET les quatre briques restent visibles. Le corps
           seul disparaît dans chaque vue React ; aucune règle CSS ne masque
           donc la ligne de titre. */

        /* La PAGE : plein ecran, hauteur VISIBLE (clavier compris), aucune
           bordure. Le composeur est le dernier enfant STATIQUE de cette
           colonne — jamais un position:fixed, qui saute avec le clavier iOS. */
        .msg-panel[data-variant="page"] {
          height: var(--vv-height, 100dvh);
          border: none;
          border-radius: 0;
          background: var(--background);
          padding-top: env(safe-area-inset-top, 0px);
        }
        .msg-panel[data-variant="page"][data-open="true"] {
          height: var(--vv-height, 100dvh);
        }
        /* La LISTE, elle, ne prend pas la hauteur visible : elle vit SOUS la
           barre d'onglets d'iReseau (regime « reseau » de personalChromeFor),
           et c'est la colonne de l'espace qui defile. Lui imposer 100dvh
           poserait sa derniere ligne sous la barre, hors d'atteinte. */
        .msg-panel[data-variant="page"][data-fill="auto"],
        .msg-panel[data-variant="page"][data-fill="auto"][data-open="true"] {
          height: auto;
          min-height: 0;
        }
        .msg-panel[data-variant="page"][data-fill="auto"] .msg-body {
          overflow-y: visible;
        }

        /* L'ossature du premier passage : la largeur n'est pas encore connue
           (useIsReseauMobile rend null), et choisir un arbre a l'aveugle
           ferait clignoter l'ecran d'une pose a l'autre.
           ⚠️ AUCUN accent grave dans ce bloc : il refermerait le litéral de
           gabarit, et la seule trace serait une pluie de « } expected » sur
           les 500 lignes suivantes. Ce commentaire-ci en portait un. */
        .msg-skeleton {
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding: 12px;
        }
        .msg-skeleton-row {
          height: 56px;
          border-radius: 12px;
          background: var(--ink-100);
        }

        .msg-head-row {
          display: flex;
          align-items: center;
          gap: 2px;
          min-height: 56px;
          padding: 4px 6px 4px 8px;
          flex: 0 0 auto;
          border-bottom: 1px solid var(--ink-200);
          background: var(--esp-surface-card, var(--ink-0));
        }
        .msg-panel[data-variant="page"] .msg-head-row {
          gap: 2px;
          padding: 2px 4px;
          background: var(--ink-0);
        }
        .msg-head {
          display: flex;
          align-items: center;
          gap: 8px;
          flex: 1;
          min-width: 0;
          min-height: 46px;
          padding: 8px 10px;
          border: none;
          background: var(--ink-0);
          color: var(--ink-900);
          font: inherit;
          text-align: left;
          cursor: pointer;
        }
        .msg-head:hover { background: var(--ink-100); }
        /* En-tête de BRIQUE : identité stable à gauche, commandes WhatsApp à
           droite. Contrairement à .msg-head (retour de conversation), cette
           zone n'est pas cliquable en bloc. */
        .msg-head-identity {
          display: flex;
          align-items: center;
          gap: 8px;
          flex: 1 1 auto;
          min-width: 0;
          color: var(--ink-900);
        }
        .msg-head-emblem {
          display: grid;
          place-items: center;
          flex: 0 0 auto;
          width: 34px;
          height: 34px;
          border-radius: 999px;
          background: var(--primary-100);
          color: var(--primary-700);
        }
        .msg-head-actions {
          display: flex;
          align-items: center;
          gap: 0;
          flex: 0 0 auto;
        }
        .msg-panel[data-variant="page"] .msg-head {
          min-height: 52px;
          background: transparent;
          cursor: default;
        }
        .msg-panel[data-variant="page"] .msg-head:hover { background: transparent; }
        .msg-head-title {
          flex: 1;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 13.5px;
          font-weight: 700;
        }
        .msg-panel[data-variant="page"] .msg-head-title { font-size: 16px; }

        .msg-icon-btn {
          display: grid;
          place-items: center;
          flex: 0 0 auto;
          width: 44px;
          height: 44px;
          border: none;
          border-radius: 8px;
          background: transparent;
          color: var(--ink-600);
          cursor: pointer;
        }
        .msg-icon-btn:hover { background: var(--ink-200); color: var(--ink-900); }
        .msg-icon-btn:focus-visible {
          outline: 2px solid var(--ring);
          outline-offset: -2px;
        }
        .msg-icon-btn:disabled { opacity: .45; cursor: default; }
        .msg-icon-btn:disabled:hover { background: transparent; color: var(--ink-600); }
        .msg-group-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          min-width: 78px;
          height: 44px;
          padding: 0 9px;
          border: none;
          border-radius: 8px;
          background: transparent;
          color: var(--ink-700);
          font: inherit;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
        }
        .msg-group-btn:hover { background: var(--ink-200); color: var(--ink-900); }
        .msg-group-btn:focus-visible {
          outline: 2px solid var(--ring);
          outline-offset: -2px;
        }
        /* 44 px : la cible minimale dans TOUTES les poses. En dessous, un
           pointeur imprécis et un pouce confondent deux commandes voisines. */
        .msg-panel[data-variant="page"] .msg-icon-btn {
          width: 44px;
          height: 44px;
          border-radius: 999px;
        }
        .msg-collapse-icon { transition: transform 160ms ease; }
        .msg-collapse-btn[aria-expanded="true"] .msg-collapse-icon {
          transform: rotate(180deg);
        }

        .msg-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 20px;
          height: 20px;
          padding: 0 6px;
          border-radius: 999px;
          /* Décompte des non-lus aux couleurs des réactions (ADR-0027), danger en repli. */
          background: var(--role-react-fill, var(--danger-fill));
          color: var(--role-react-on, var(--on-fill));
          font-family: var(--font-mono);
          font-size: 11px;
          font-weight: 700;
        }

        /* Filtres de DISCUSSIONS, pas nouveaux onglets iCom : la rangée reste
           dans iChat et se parcourt horizontalement sur les petits écrans. */
        .msg-filter-row {
          display: flex;
          flex: 0 0 auto;
          flex-wrap: nowrap;
          gap: 7px;
          margin: 7px 0 0;
          padding: 0 8px 1px;
          overflow-x: auto;
          overscroll-behavior-inline: contain;
          scrollbar-width: none;
          -webkit-overflow-scrolling: touch;
          white-space: nowrap;
        }
        .msg-filter-row::-webkit-scrollbar { display: none; }
        .msg-filter-btn {
          position: relative;
          z-index: 0;
          isolation: isolate;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex: 0 0 auto;
          gap: 6px;
          min-height: 44px;
          padding: 0 13px;
          border: 0;
          background: transparent;
          color: var(--ink-700);
          font: inherit;
          font-size: 12px;
          font-weight: 650;
          cursor: pointer;
        }
        /* La cible reste à 44 px pour le doigt, mais la pilule peinte est
           affinée à 34 px dans toutes les poses grâce à 5 px de retrait. */
        .msg-filter-btn::before {
          content: "";
          position: absolute;
          z-index: -1;
          inset: 5px 0;
          /* Système épuré (ADR-0027) : puce grise sans filet, à l'angle des puces,
             dans les thèmes qui les déclarent ; ailleurs, la pilule cerclée. */
          border: 1px solid var(--esp-chip-border, var(--ink-300));
          border-radius: var(--esp-chip-radius, 999px);
          background: var(--esp-chip-bg, var(--ink-0));
        }
        .msg-filter-btn:hover { color: var(--ink-900); }
        .msg-filter-btn:hover::before { background: var(--ink-100); }
        .msg-filter-btn[aria-pressed="true"] {
          color: var(--esp-tab-active-fg, var(--primary-800));
        }
        .msg-filter-btn[aria-pressed="true"]::before {
          border-color: var(--esp-chip-border, var(--primary-300));
          background: var(--esp-tab-active-bg, var(--primary-100));
        }
        .msg-filter-btn:focus-visible {
          outline: 2px solid var(--ring);
          outline-offset: 2px;
        }
        .msg-filter-count {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 19px;
          height: 19px;
          padding: 0 5px;
          border-radius: 999px;
          /* Décompte des non-lus aux couleurs des réactions (ADR-0027), danger en repli. */
          background: var(--role-react-fill, var(--danger-fill));
          color: var(--role-react-on, var(--on-fill));
          font-family: var(--font-mono);
          font-size: 10px;
          font-weight: 750;
        }
        .msg-panel[data-variant="page"] .msg-filter-row {
          gap: 8px;
          padding-inline: 14px;
        }
        .msg-panel[data-variant="page"] .msg-filter-btn { font-size: 14px; }

        .msg-search-row {
          display: flex;
          align-items: center;
          gap: 7px;
          flex: 0 0 auto;
          margin: 8px 8px 0;
          padding: 7px 11px;
          /* L'angle des champs du système épuré (ADR-0030) ; la pastille d'origine en repli. */
          border-radius: var(--esp-field-radius, 999px);
          background: var(--ink-100);
          color: var(--ink-600);
        }
        .msg-search-row input {
          flex: 1;
          min-width: 0;
          border: none;
          background: transparent;
          color: var(--ink-900);
          font: inherit;
          font-size: 13px;
          outline: none;
        }
        /* 16 px : sous ce seuil, iOS ZOOME sur le champ au focus et ne
           revient jamais en arriere. C'est la regle anti-zoom, pas un gout. */
        .msg-panel[data-variant="page"] .msg-search-row { padding: 10px 14px; }
        .msg-panel[data-variant="page"] .msg-search-row input { font-size: 16px; }

        .msg-body { flex: 1; min-height: 0; overflow-y: auto; padding: 8px; }
        .msg-panel[data-variant="page"] .msg-body {
          padding: 8px 10px 12px;
          overscroll-behavior: contain;
        }
        .msg-list { list-style: none; margin: 0; padding: 0; }
        .msg-row {
          display: flex;
          align-items: center;
          gap: 9px;
          width: 100%;
          padding: 9px 8px;
          border: none;
          border-radius: 10px;
          background: transparent;
          color: inherit;
          font: inherit;
          text-align: left;
          cursor: pointer;
        }
        .msg-row:hover { background: var(--ink-100); }
        .msg-row[aria-current="true"] { background: var(--primary-50); }
        .msg-panel[data-variant="page"] .msg-row {
          gap: 12px;
          padding: 11px 8px;
          min-height: 64px;
        }
        .msg-row-emblem {
          display: grid;
          place-items: center;
          flex: 0 0 auto;
          width: 32px;
          height: 32px;
          border-radius: 999px;
          background: var(--primary-50);
          color: var(--primary-fill, var(--ink-900));
        }
        .msg-panel[data-variant="page"] .msg-row-emblem { width: 44px; height: 44px; }
        .msg-row-main { flex: 1; min-width: 0; }
        .msg-row-name {
          display: block;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 13px;
          font-weight: 650;
          color: var(--ink-900);
        }
        .msg-row-preview {
          display: block;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 12px;
          color: var(--ink-600);
        }
        .msg-panel[data-variant="page"] .msg-row-name { font-size: 15px; }
        .msg-panel[data-variant="page"] .msg-row-preview { font-size: 13.5px; }
        /* Non lu : le NOM s'epaissit et l'apercu se fonce. C'est le signal des
           messageries, et il vaut sans la couleur — la pastille, elle, se perd
           pour qui ne distingue pas le rouge. */
        .msg-row[data-unread="true"] .msg-row-name { font-weight: 800; }
        .msg-row[data-unread="true"] .msg-row-preview {
          color: var(--ink-900);
          font-weight: 600;
        }
        .msg-row-time {
          flex: 0 0 auto;
          align-self: flex-start;
          padding-top: 2px;
          font-family: var(--font-mono);
          font-size: 10.5px;
          color: var(--ink-600);
          white-space: nowrap;
        }

        /* ── LE FIL ──────────────────────────────────────────────────────── */

        .msg-thread {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        /* Un separateur de jour : une ligne centree, discrete, non cliquable. */
        .msg-day {
          align-self: center;
          margin: 10px 0 6px;
          padding: 3px 12px;
          border-radius: 999px;
          background: var(--ink-100);
          color: var(--ink-600);
          font-size: 11px;
          font-weight: 600;
        }
        /* Une SALVE : les bulles d'une meme prise de parole se serrent. */
        .msg-line {
          display: flex;
          flex-direction: column;
          max-width: 84%;
        }
        .msg-line[data-mine="true"] { align-self: flex-end; align-items: flex-end; }
        .msg-line[data-mine="false"] { align-self: flex-start; align-items: flex-start; }
        .msg-line[data-first="false"] { margin-top: 2px; }
        .msg-line[data-first="true"] { margin-top: 8px; }
        .msg-panel[data-variant="page"] .msg-line { max-width: 88%; }

        .msg-sender {
          display: block;
          margin: 0 0 2px 2px;
          font-size: 10.5px;
          font-weight: 650;
          color: var(--ink-600);
        }

        /* ⚠️ display:block OBLIGATOIRE. La bulle est un <span> — elle l'etait
           deja dans le dock, ou elle etait ENFANT DIRECT d'un conteneur flex,
           ce qui la blockifiait. Depuis qu'elle vit dans le bouton d'actions,
           elle redevient INLINE : le fond se fragmente alors en une boite par
           ligne, le rembourrage ne s'applique qu'au debut et a la fin du flux
           entier, et le texte deborde du bleu sur toutes les lignes sauf la
           premiere. Constate a l'ecran le 2026-08-18, pas au typecheck. */
        .msg-bubble {
          display: block;
          max-width: 100%;
          padding: 7px 11px;
          border-radius: 13px;
          font-size: 13px;
          line-height: 1.45;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
        }
        .msg-bubble[data-mine="false"] {
          align-self: flex-start;
          background: var(--ink-100);
          color: var(--ink-900);
        }
        .msg-bubble[data-mine="true"] {
          align-self: flex-end;
          background: var(--primary-fill);
          color: var(--primary-fill-on, var(--on-fill));
        }
        /* Les coins de SALVE : seule la premiere bulle est ronde en haut du
           cote de son auteur, seule la derniere l'est en bas. C'est ce qui
           fait lire cinq bulles comme un seul bloc. */
        .msg-bubble[data-mine="true"][data-first="false"] { border-top-right-radius: 5px; }
        .msg-bubble[data-mine="true"][data-last="false"] { border-bottom-right-radius: 5px; }
        .msg-bubble[data-mine="false"][data-first="false"] { border-top-left-radius: 5px; }
        .msg-bubble[data-mine="false"][data-last="false"] { border-bottom-left-radius: 5px; }
        .msg-bubble[data-deleted="true"] { font-style: italic; opacity: .7; }
        .msg-panel[data-variant="page"] .msg-bubble {
          padding: 8px 12px;
          font-size: 15px;
          border-radius: 16px;
        }
        /* Le bloc qui PORTE la bulle. Ce n'est plus un bouton (P18b, A02) : un
           bouton ne peut contenir ni lien, ni lecteur, ni citation. Les memes
           declarations gardent la meme boite ; le clavier passe par le bouton
           d'actions distinct (.msg-actions-btn). */
        .msg-bubble-btn {
          display: block;
          max-width: 100%;
          padding: 0;
          border: none;
          background: none;
          color: inherit;
          font: inherit;
          text-align: inherit;
          cursor: pointer;
          touch-action: pan-y;
        }
        .msg-bubble-btn:focus-visible {
          outline: 2px solid var(--primary-fill);
          outline-offset: 2px;
          border-radius: 14px;
        }
        /* Le bouton d'actions d'une bulle (P18b, A02) : hors de la vue au repos
           — la souris et le doigt passent par la bulle (clic, appui long, menu
           contextuel) —, il apparait au focus clavier, a cote de la bulle, du
           cote oppose a son auteur. Aucun pixel ne change sans focus. */
        .msg-actions-btn {
          position: absolute;
          top: 50%;
          width: 1px;
          height: 1px;
          margin: -1px;
          padding: 0;
          overflow: hidden;
          clip: rect(0 0 0 0);
          clip-path: inset(50%);
          white-space: nowrap;
          border: 0;
          background: transparent;
          color: var(--ink-900);
          cursor: pointer;
        }
        .msg-actions-btn:focus-visible {
          width: 28px;
          height: 28px;
          margin: 0;
          overflow: visible;
          clip: auto;
          clip-path: none;
          transform: translateY(-50%);
          display: grid;
          place-items: center;
          border-radius: 999px;
          background: var(--ink-100);
          outline: 2px solid var(--primary-fill);
          outline-offset: 2px;
        }
        .msg-line[data-mine="true"] .msg-actions-btn { right: calc(100% + 4px); }
        .msg-line[data-mine="false"] .msg-actions-btn { left: calc(100% + 4px); }

        /* Les gestes du canal commercial (P18b, A15) : Accepter, Refuser,
           Bloquer, Fermer, Signaler, Retirer, appels, pages. La classe n'etait
           definie nulle part : boutons natifs d'une ligne, hors charte. Un
           bouton secondaire de la charte : 44 px au moins (03 §3), contour de
           controle, anneau de focus, survol et desactive lisibles, clair et
           sombre par les jetons. */
        .msg-tool-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          min-height: 44px;
          min-width: 44px;
          padding: 8px 14px;
          border: 1px solid var(--input);
          border-radius: 10px;
          background: var(--card);
          color: var(--card-foreground);
          font: inherit;
          font-size: 14px;
          font-weight: 600;
          line-height: 1.25;
          text-align: center;
          overflow-wrap: anywhere;
          cursor: pointer;
        }
        .msg-tool-btn:hover:not(:disabled) { background: var(--muted); }
        .msg-tool-btn:focus-visible {
          outline: 2px solid var(--ring);
          outline-offset: 2px;
        }
        .msg-tool-btn:disabled { opacity: .6; cursor: not-allowed; }

        .msg-time {
          margin-top: 2px;
          padding: 0 4px;
          font-family: var(--font-mono);
          font-size: 10px;
          color: var(--ink-600);
          white-space: nowrap;
        }
        /* La double coche voyage avec l'heure — meme ligne, meme discretion. */
        .msg-time-row {
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .msg-receipt { display: inline-flex; color: var(--ink-600); }
        .msg-receipt[data-read="true"] { color: var(--primary-fill); }

        /* ── CITATION ────────────────────────────────────────────────────── */

        .msg-quote {
          display: block;
          width: 100%;
          margin-bottom: 3px;
          padding: 5px 9px;
          border: none;
          border-left: 3px solid var(--primary-fill);
          border-radius: 8px;
          background: var(--ink-100);
          color: var(--ink-900);
          font: inherit;
          font-size: 12px;
          line-height: 1.35;
          text-align: left;
          cursor: pointer;
        }
        .msg-quote-author {
          display: block;
          font-weight: 700;
          font-size: 11px;
          color: var(--ink-600);
        }
        .msg-quote-text {
          display: -webkit-box;
          overflow: hidden;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 2;
          line-clamp: 2;
        }
        .msg-quote[data-deleted="true"] { font-style: italic; opacity: .75; }
        /* L'apercu de reponse AU-DESSUS du composeur : meme filet, une croix. */
        .msg-reply-preview {
          display: flex;
          align-items: center;
          gap: 8px;
          flex: 0 0 auto;
          margin: 0 8px;
          padding: 6px 9px;
          border-left: 3px solid var(--primary-fill);
          border-radius: 8px;
          background: var(--ink-100);
          font-size: 12px;
        }

        /* ── REACTIONS ───────────────────────────────────────────────────── */

        .msg-reactions {
          display: flex;
          flex-wrap: wrap;
          gap: 3px;
          margin-top: 3px;
        }
        .msg-reaction-chip {
          display: inline-flex;
          align-items: center;
          gap: 3px;
          padding: 1px 7px;
          border: 1px solid var(--ink-200);
          border-radius: 999px;
          background: var(--ink-0);
          color: var(--ink-900);
          font: inherit;
          font-size: 11px;
          line-height: 1.6;
          cursor: pointer;
        }
        .msg-reaction-chip[data-mine="true"] {
          /* Ma réaction : teinte des réactions sans filet (ADR-0027), l'identité en repli. */
          border-color: var(--esp-chip-border, var(--primary-fill));
          background: var(--role-react-soft, var(--primary-50));
        }
        .msg-reaction-count { font-family: var(--font-mono); font-size: 10px; }
        /* La barre d'emojis de la feuille d'actions. */
        .msg-reaction-bar {
          display: flex;
          justify-content: space-between;
          gap: 4px;
          padding: 4px 0 12px;
        }
        .msg-reaction-key {
          display: grid;
          place-items: center;
          width: 46px;
          height: 46px;
          border: none;
          border-radius: 999px;
          background: var(--ink-100);
          font-size: 24px;
          line-height: 1;
          cursor: pointer;
        }
        .msg-reaction-key[data-mine="true"] { background: var(--role-react-soft, var(--primary-50)); }

        /* ── PIECES JOINTES ──────────────────────────────────────────────── */

        .msg-attachments {
          display: flex;
          flex-direction: column;
          gap: 4px;
          margin-bottom: 3px;
        }
        .msg-media {
          display: block;
          max-width: 100%;
          max-height: 320px;
          border-radius: 10px;
          object-fit: cover;
        }
        .msg-audio { width: 100%; min-width: 190px; }
        .msg-file {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 7px 10px;
          border: 1px solid var(--ink-200);
          border-radius: 10px;
          background: var(--ink-0);
          color: var(--ink-900);
          font-size: 12px;
          text-decoration: none;
        }
        .msg-file-meta {
          font-family: var(--font-mono);
          font-size: 10.5px;
          color: var(--ink-600);
        }
        /* Le marqueur « Transfere » (ADR-0143) : une mention, pas un corps. */
        .msg-forwarded {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          margin-bottom: 2px;
          font-family: var(--font-mono);
          font-size: 10.5px;
          color: var(--ink-600);
        }
        /* La puce d epingle sur la bulle epinglee. */
        .msg-bubble-pin {
          display: inline-flex;
          align-items: center;
          margin-left: 6px;
          color: var(--ink-600);
          vertical-align: middle;
        }
        /* La bande d epingle, au sommet de la conversation. */
        .msg-pinned-banner {
          display: flex;
          align-items: center;
          flex: 0 0 auto;
          width: 100%;
          border-bottom: 1px solid var(--ink-200);
          background: var(--ink-100);
          color: var(--ink-900);
          font-size: 12px;
        }
        .msg-pinned-jump {
          display: flex;
          align-items: center;
          gap: 8px;
          flex: 1 1 auto;
          min-width: 0;
          min-height: 44px;
          padding: 6px 10px;
          border: none;
          background: transparent;
          color: inherit;
          font: inherit;
          text-align: left;
          cursor: pointer;
        }
        .msg-pinned-jump:hover {
          background: var(--ink-150, var(--ink-200));
        }
        .msg-pinned-icon {
          flex: 0 0 auto;
          color: var(--ink-600);
        }
        .msg-pinned-body {
          flex: 1 1 auto;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .msg-pinned-author {
          font-weight: 650;
        }
        .msg-pinned-excerpt {
          color: var(--ink-600);
        }
        .msg-pinned-unpin {
          flex: 0 0 auto;
          display: grid;
          place-items: center;
          min-width: 44px;
          min-height: 44px;
          border: none;
          background: transparent;
          color: var(--ink-600);
          cursor: pointer;
        }
        /* La note de pied de la feuille de transfert. */
        .msg-forward-note {
          margin: 10px 2px 0;
          font-size: 11px;
          color: var(--ink-600);
        }
        /* Les pieces EN ATTENTE, dans le composeur. */
        .msg-pending {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          flex: 0 0 auto;
          padding: 6px 8px 0;
        }
        .msg-pending-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          max-width: 100%;
          padding: 4px 6px 4px 10px;
          border: 1px solid var(--ink-200);
          border-radius: 999px;
          background: var(--ink-100);
          font-size: 11.5px;
        }
        .msg-pending-name {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          max-width: 150px;
        }

        /* ── COMPOSEUR ───────────────────────────────────────────────────── */

        .msg-composer {
          display: flex;
          align-items: flex-end;
          flex: 0 0 auto;
          gap: 7px;
          padding: 8px;
          border-top: 1px solid var(--ink-200);
        }
        .msg-composer textarea {
          flex: 1;
          max-height: 96px;
          padding: 8px 10px;
          border: 1px solid var(--ink-300);
          border-radius: 11px;
          background: var(--ink-0);
          color: var(--ink-900);
          font: inherit;
          font-size: 13px;
          resize: none;
        }
        .msg-panel[data-variant="page"] .msg-composer {
          gap: 6px;
          padding: 8px 8px calc(8px + env(safe-area-inset-bottom, 0px));
          background: var(--ink-0);
        }
        /* 16 px OBLIGATOIRE : iOS zoome sur tout champ dont la police est plus
           petite, et ne dezoome jamais. Le composeur deviendrait inatteignable. */
        .msg-panel[data-variant="page"] .msg-composer textarea {
          max-height: 132px;
          padding: 10px 14px;
          border-radius: 20px;
          font-size: 16px;
        }
        /* Le bouton d'envoi, plein, distinct des boutons discrets. */
        .msg-send-btn {
          display: grid;
          place-items: center;
          flex: 0 0 auto;
          width: 30px;
          height: 30px;
          border: none;
          border-radius: 999px;
          /* Envoyer : couleur des messages (ADR-0027), aplat d'identité en repli. */
          background: var(--role-message-fill, var(--primary-fill));
          color: var(--role-message-on, var(--on-fill));
          cursor: pointer;
        }
        .msg-send-btn:disabled { opacity: .45; cursor: default; }
        .msg-panel[data-variant="page"] .msg-send-btn { width: 44px; height: 44px; }
        /* L'enregistreur EN COURS : le bouton se teinte, la duree se compte. */
        .msg-rec-btn[data-recording="true"] {
          background: var(--danger-fill);
          color: var(--role-danger-on, var(--on-fill));
        }
        .msg-rec-row {
          display: flex;
          align-items: center;
          gap: 8px;
          flex: 1;
          min-width: 0;
          padding: 0 4px;
          font-size: 13px;
          color: var(--ink-900);
        }
        .msg-rec-dot {
          flex: 0 0 auto;
          width: 9px;
          height: 9px;
          border-radius: 999px;
          background: var(--danger-fill);
          animation: msg-rec-pulse 1.4s ease-out infinite;
        }
        .msg-rec-time { font-family: var(--font-mono); font-size: 13px; }
        @keyframes msg-rec-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: .35; }
        }

        /* ── DIVERS ──────────────────────────────────────────────────────── */

        .msg-empty { padding: 14px 10px; font-size: 12.5px; color: var(--ink-600); }
        .msg-panel[data-variant="page"] .msg-empty { font-size: 14.5px; padding: 20px 12px; }
        .msg-error {
          margin: 0 8px 8px;
          padding: 8px 10px;
          border-radius: 10px;
          background: var(--danger-50, var(--ink-100));
          color: var(--danger-700, var(--ink-900));
          font-size: 12.5px;
        }
        .msg-typing {
          margin: 0;
          flex: 0 0 auto;
          padding: 0 12px 6px;
          font-size: 12px;
          color: var(--ink-600);
        }
        .msg-system {
          align-self: center;
          padding: 2px 10px;
          font-size: 11px;
          color: var(--ink-600);
          text-align: center;
        }
        /* La pastille « nouveaux messages » : FLOTTANTE dans la colonne, donc
           position:absolute sur un parent relatif — jamais fixed, qui serait
           cadre par le conteneur de requete de .rp-scope. */
        .msg-scroller { position: relative; display: flex; flex: 1; min-height: 0; }
        .msg-pill {
          position: absolute;
          left: 50%;
          bottom: 12px;
          transform: translateX(-50%);
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 14px;
          border: none;
          border-radius: 999px;
          background: var(--primary-fill);
          color: var(--primary-fill-on, var(--on-fill));
          font: inherit;
          font-size: 12.5px;
          font-weight: 600;
          cursor: pointer;
          z-index: 2;
        }

        /* ─── iCom DÉTACHÉ : la fenêtre flottante format smartphone ─────────
           Portalisée vers body (le container-type de .rp-scope piège tout
           fixed descendant) et re-scopée par data-charte (cf. MessagerieDock).
           Pile z : barres mobiles 40 < CETTE fenêtre 55 < overlays et
           dialogues 60 < vignette d'appel 80. La position est écrite par la
           primitive partagée de déplacement, jamais par CSS. */
        .icom-float {
          position: fixed;
          z-index: 55;
          display: flex;
          flex-direction: column;
          /* Smartphone reel dans le bureau, format UNIQUE du moteur :
             440 × 956, la meme regle que la fenetre d'appel flottante. La
             LARGEUR suit la hauteur disponible (× 0,46) et la hauteur en
             decoule : la fenetre garde les proportions du telephone a toute
             taille d'ecran. Plancher 300 px ; 64 px = les deux marges de
             deplacement et une barre haute ; 16 px de respiration de chaque
             cote sur un petit viewport. */
          width: clamp(300px, min(440px, calc((100dvh - 64px) * .46), calc(100vw - 32px)), 440px);
          height: min(
            calc(clamp(300px, min(440px, calc((100dvh - 64px) * .46), calc(100vw - 32px)), 440px) / .46),
            calc(100dvh - 64px)
          );
          border: 1px solid var(--ink-200);
          border-radius: 20px;
          background: var(--esp-surface-card, var(--ink-0));
          box-shadow: var(--shadow-xl);
          overflow: hidden;
          outline: none;
          transition: box-shadow 160ms ease, opacity 160ms ease;
        }
        .icom-float[data-dragging="true"] {
          user-select: none;
          box-shadow: var(--icom-float-drag-shadow);
        }
        .icom-float-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          min-height: 52px;
          padding: 4px 6px 4px 8px;
          border-bottom: 1px solid var(--ink-200);
          flex: 0 0 auto;
        }
        .icom-float-handle {
          display: flex;
          align-items: center;
          gap: 8px;
          flex: 1 1 auto;
          min-width: 0;
          min-height: 44px;
          padding: 8px;
          border-radius: 10px;
          color: var(--ink-500);
        }
        .icom-float-handle:hover { background: var(--ink-100); }
        .icom-float-handle:focus-visible,
        .icom-float .msg-icon-btn:focus-visible {
          outline: 3px solid var(--primary-300, var(--primary-500));
          outline-offset: 1px;
        }
        .icom-float-title {
          font-size: 13px;
          font-weight: 800;
          color: var(--ink-900);
        }
        /* Le panneau REMPLIT la fenêtre : l'attribut gagne la spécificité sur
           la règle de hauteur de .msg-panel[data-open="true"]. */
        .icom-float .msg-panel[data-open] {
          height: 100%;
          flex: 1 1 auto;
          min-height: 0;
          border: none;
          border-radius: 0;
        }

        /* ─── L'APPEL DANS LA CARTE (IC-01/IC-02/IC-06) ─────────────────────
           .icom-call-host est le corps que la carte DÉCLARE à la couche
           d'appel (registerCallHost) ; CallSurface y portaille l'appel.
           Vide, il n'existe pas. data-call sur le panneau est le MODE que
           l'hôte d'appel a publié (useCallHostMode) — la carte ne décide
           rien, elle se met en forme :
             · cover — l'appel COUVRE le corps : tout ce qui n'est ni la barre
               iCom ni l'hôte disparaît (display:none — donc aussi hors de
               l'ordre de tabulation, pas seulement invisible) ;
             · strip — l'appel réduit est une BANDE en tête du corps ; les
               conversations restent accessibles dessous. */
        .icom-call-host { display: none; }
        .msg-panel[data-call="cover"] > .icom-call-host {
          display: flex;
          flex-direction: column;
          flex: 1 1 auto;
          min-height: 0;
          position: relative;
          overflow: hidden;
        }
        .msg-panel[data-call="cover"] > :not(.icom-call-host):not(.icom-surface-bar) {
          display: none;
        }
        .msg-panel[data-call="strip"] > .icom-call-host {
          display: flex;
          flex-direction: column;
          flex: 0 0 auto;
        }

        /* P05 : destination Messages. Toutes les règles restent sous son hôte. */
        .icom-messages-page {
          display: flex;
          flex-direction: column;
          min-width: 0;
          height: 100%;
          background: var(--background);
          color: var(--foreground);
        }
        .icom-page-heading {
          display: flex;
          flex: 0 0 auto;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          min-height: 64px;
          padding: 8px 20px;
          border-bottom: 1px solid var(--border);
        }
        .icom-page-heading h1 { margin: 0; font-size: 22px; font-weight: 700; }
        .icom-page-heading-links { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
        .icom-page-heading a { display: flex; align-items: center; min-height: 44px; color: var(--primary); }
        .icom-page-columns { display: grid; grid-template-columns: minmax(300px, 35%) minmax(0, 1fr); flex: 1 1 auto; min-height: 0; }
        .icom-page-list { display: flex; flex-direction: column; min-width: 0; min-height: 0; border-right: 1px solid var(--border); }
        .icom-page-navigation { display: flex; gap: 4px; flex: 0 0 auto; padding: 8px; border-bottom: 1px solid var(--border); }
        .icom-page-navigation a { display: flex; flex: 1; align-items: center; justify-content: center; min-height: 44px; padding: 4px 8px; border-radius: var(--radius-lg); font-size: 14px; color: var(--muted-foreground); }
        .icom-page-navigation a[aria-current="page"] { background: var(--esp-tab-active-bg, var(--accent)); color: var(--esp-tab-active-fg, var(--accent-foreground)); font-weight: 700; }
        .icom-page-navigation a:focus-visible, .icom-page-heading a:focus-visible { outline: 2px solid var(--ring); outline-offset: -2px; }
        /* ADR-0036 : la pilule interrupteur iCom | iCom Pro, aux jetons des chartes. */
        .icom-space-switch { display: inline-flex; flex: 0 0 auto; align-items: center; gap: 2px; padding: 3px; border: 1px solid var(--border); border-radius: 999px; background: var(--muted); }
        .icom-space-switch > a, .icom-space-switch > span { display: inline-flex; align-items: center; justify-content: center; min-height: 38px; padding: 0 14px; border-radius: 999px; font-size: 14px; font-weight: 600; line-height: 1; white-space: nowrap; color: var(--muted-foreground); text-decoration: none; transition: background-color 160ms ease, color 160ms ease; }
        .icom-space-switch > [aria-current="page"] { background: var(--primary-fill, var(--primary)); color: var(--primary-fill-on, var(--primary-foreground)); }
        .icom-space-switch > a:hover { color: var(--foreground); }
        .icom-space-switch > a:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
        .icom-space-switch[data-compact="true"] > a, .icom-space-switch[data-compact="true"] > span { min-height: 32px; padding: 0 11px; font-size: 13px; }
        .icom-page-heading .icom-space-switch a { min-height: 38px; color: var(--muted-foreground); }
        @media (prefers-reduced-motion: reduce) { .icom-space-switch > a, .icom-space-switch > span { transition: none; } }
        .icom-messages-page .msg-panel[data-variant="page"][data-open="true"] { flex: 1 1 auto; min-height: 0; height: auto; padding-top: 0; }
        .icom-messages-page .msg-body { min-height: 0; overflow-y: auto; }
        .icom-messages-page .icom-page-detail { min-width: 0; }
        .icom-page-empty { display: flex; flex: 1; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 24px; text-align: center; color: var(--muted-foreground); }
        .icom-page-empty h2, .icom-page-empty p { margin: 0; max-width: 36rem; }
        .msg-list-scope { margin: 0; flex: 0 0 auto; padding: 8px 14px; color: var(--muted-foreground); font-size: 12px; line-height: 1.45; }
        .icom-messages-page[data-mobile="true"] { height: calc(100% - 96px - env(safe-area-inset-bottom, 0px)); }
        .icom-messages-page[data-mobile="true"] .icom-page-columns { display: flex; flex-direction: column; }
        .icom-messages-page[data-mobile="true"] .icom-page-list { flex: 1; border-right: 0; }
        .icom-messages-page[data-mobile="true"] .icom-page-navigation { display: none; }

        @media (prefers-reduced-motion: reduce) {
          .icom-float { transition: none; }
        }

        /* ── Les invitations a des groupes, en tete de liste ───────────
           Le bloc n'existe QUE s'il a quelque chose a repondre : aucune
           reserve, aucun titre vide. */
        .msg-invites {
          display: flex;
          flex-direction: column;
          gap: 4px;
          flex: 0 0 auto;
          padding: 8px 8px 10px;
          border-bottom: 1px solid var(--ink-200);
          background: var(--primary-50);
        }
        .msg-invites-titre {
          margin: 0;
          padding: 0 4px;
          font-size: 11.5px;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: var(--ink-700);
        }

        /* ── Le panneau d'informations d'un groupe ─────────────────────
           Le fil de messages fait defiler son enfant .msg-body. Cette fiche
           est directement dans .msg-scroller : elle a donc BESOIN de son
           propre overflow, sinon .msg-panel coupe silencieusement sa fin. */
        .msg-infos-scroller {
          display: block;
          min-height: 0;
          overflow-x: hidden;
          overflow-y: auto;
          overscroll-behavior-y: contain;
          scrollbar-gutter: stable;
          -webkit-overflow-scrolling: touch;
          touch-action: pan-y;
        }
        .msg-infos-scroller:focus-visible {
          outline: 2px solid var(--ring);
          outline-offset: -2px;
        }
        /* ── Le pied du selecteur « qui appeler » (ADR-0149) ────────────
           Hors du defilement : compteur, carte Conference T2 et boutons
           Appeler / Video restent visibles quelle que soit la longueur de
           la liste. Sans lui, .msg-panel (overflow hidden) coupait la fin
           d'un fil de vingt-cinq membres, boutons compris. */
        /* ⚠️ Le pied est BORNE, et c'est lui qui defile. Dans la carte
           ancree (min(52vh, 420px) moins la barre iCom et l'en-tete), le
           compteur, la carte T2 (~264 px) et les boutons faisaient ~370 px
           pour ~306 disponibles : la liste tombait a 0 px (plus moyen de
           decocher) et les boutons Appeler / Video etaient coupes par
           l'overflow hidden du panneau. Borne a 72 % du panneau, le pied
           laisse toujours une ligne de membre, et les gestes d'appel
           restent colles en bas (sticky). En page, rien a borner. */
        .msg-picker-footer {
          flex: 0 0 auto;
          max-height: 72%;
          overflow-y: auto;
          overscroll-behavior-y: contain;
          border-top: 1px solid var(--ink-200);
          background: var(--esp-surface-card, var(--ink-0));
          padding: 8px 10px 10px;
        }
        .msg-picker-footer[data-variant="page"] {
          max-height: none;
          padding: 10px 12px max(12px, env(safe-area-inset-bottom, 0px));
          background: var(--ink-0);
        }
        .msg-picker-footer .msg-picker-actions {
          position: sticky;
          bottom: 0;
          z-index: 1;
          padding-top: 4px;
          background: var(--esp-surface-card, var(--ink-0));
        }
        .msg-picker-footer[data-variant="page"] .msg-picker-actions {
          background: var(--ink-0);
        }
        .msg-picker-footer-inner {
          display: flex;
          flex-direction: column;
          gap: 8px;
          width: 100%;
          max-width: 660px;
          margin-inline: auto;
        }
        /* Le compteur se COMPTE : monospace, signature de la charte.
           Deux classes au selecteur : .msg-infos-meta, de meme poids et
           declaree plus bas, imposait sa teinte discrete au compteur. */
        .msg-infos-meta.msg-picker-counter {
          font-family: var(--font-mono);
          color: var(--ink-700);
        }
        /* Deux boutons, deux colonnes : la grille a quatre pistes pour la
           fiche du groupe, et deux cibles d'un quart de largeur se visent mal. */
        .msg-picker-actions {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .msg-infos {
          display: flex;
          flex-direction: column;
          gap: 10px;
          width: 100%;
          max-width: 660px;
          margin-inline: auto;
          padding: 12px 10px 28px;
        }
        .msg-infos[data-variant="page"] { padding: 14px 12px 32px; }
        .msg-infos-hero {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          padding: 16px 12px;
          border: 1px solid var(--ink-200);
          border-radius: 14px;
          background: var(--ink-0);
          text-align: center;
        }
        .msg-infos-avatar {
          position: relative;
          display: inline-grid;
          place-items: center;
        }
        .msg-infos-avatar-edit {
          position: absolute;
          right: -5px;
          bottom: -5px;
          display: grid;
          place-items: center;
          width: 44px;
          height: 44px;
          border: 3px solid var(--ink-0);
          border-radius: 999px;
          background: var(--esp-identity-fill, var(--primary-600));
          color: var(--primary-fill-on, var(--on-fill));
          cursor: pointer;
        }
        .msg-infos-avatar-edit:hover { background: var(--esp-identity-fill-hover, var(--primary-700)); }
        .msg-infos-avatar-edit:disabled { opacity: .55; cursor: default; }
        .msg-infos-block {
          display: flex;
          flex-direction: column;
          gap: 6px;
          padding: 10px;
          border: 1px solid var(--ink-200);
          border-radius: 12px;
          background: var(--ink-0);
        }
        /* ⚠️ --danger-100 et --danger-500 : les SEULS paliers rouges definis par
           ui-v2 (50, 100, 500, 600, 700). --danger-200 et --danger-300
           n'existent pas — ecrits avec un repli sur l'encre, ils auraient
           rendu la zone dangereuse RIGOUREUSEMENT identique aux autres, sans
           la moindre erreur. */
        .msg-infos-block[data-danger="true"] { border-color: var(--danger-100); }
        .msg-infos-titre-row {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          width: 100%;
        }
        .msg-infos-titre {
          min-width: 0;
          margin: 0;
          font-size: 18px;
          font-weight: 750;
          color: var(--ink-900);
          overflow-wrap: anywhere;
        }
        .msg-infos-titre-edit {
          display: flex;
          align-items: center;
          gap: 4px;
          width: 100%;
        }
        .msg-infos-created {
          margin: 0;
          font-size: 11.5px;
          line-height: 1.45;
          color: var(--ink-500);
        }
        .msg-infos-description {
          display: inline-flex;
          align-items: flex-start;
          justify-content: center;
          gap: 5px;
          max-width: 520px;
          min-height: 32px;
          padding: 5px 8px;
          border: none;
          border-radius: 8px;
          background: transparent;
          color: var(--primary-700);
          font: inherit;
          font-size: 13px;
          line-height: 1.4;
          text-align: center;
          cursor: pointer;
        }
        .msg-infos-description:disabled {
          color: var(--ink-600);
          cursor: default;
        }
        .msg-infos-description:not(:disabled):hover { background: var(--primary-50); }
        .msg-infos-description-edit {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          width: min(100%, 520px);
        }
        .msg-infos-description-input {
          min-height: 72px;
          resize: vertical;
          line-height: 1.4;
        }
        .msg-infos-soustitre {
          margin: 0;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: var(--ink-500);
        }
        .msg-infos-meta {
          margin: 0;
          font-size: 12.5px;
          line-height: 1.45;
          color: var(--ink-500);
        }
        .msg-infos-input {
          width: 100%;
          min-height: 44px;
          padding: 8px 10px;
          border: 1px solid var(--ink-300);
          border-radius: 9px;
          background: var(--ink-0);
          color: var(--ink-900);
          font: inherit;
          /* 16 px sur la page : sous ce seuil, iOS zoome au focus. */
          font-size: 16px;
        }
        .msg-infos-quick-actions {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 6px;
        }
        .msg-infos-quick {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 4px;
          min-width: 0;
          min-height: 54px;
          padding: 6px 3px;
          border: 1px solid var(--ink-200);
          border-radius: 12px;
          background: var(--ink-0);
          color: var(--ink-800);
          font: inherit;
          font-size: 11.5px;
          font-weight: 600;
          cursor: pointer;
        }
        .msg-infos-quick:hover { background: var(--ink-100); }
        .msg-infos-quick:disabled { opacity: .45; cursor: default; }
        .msg-infos-quick:focus-visible,
        .msg-infos-setting-row:focus-visible {
          outline: 2px solid var(--ring);
          outline-offset: 2px;
        }
        .msg-infos-settings { padding-block: 2px; }
        .msg-infos-setting-row {
          display: grid;
          grid-template-columns: 32px minmax(0, 1fr) 18px;
          align-items: center;
          gap: 8px;
          width: 100%;
          min-height: 48px;
          padding: 6px 2px;
          border: none;
          border-bottom: 1px solid var(--ink-100);
          background: transparent;
          color: var(--ink-900);
          font: inherit;
          text-align: left;
          cursor: pointer;
        }
        .msg-infos-setting-row:last-child { border-bottom: none; }
        .msg-infos-setting-row:hover { background: var(--ink-50); }
        .msg-infos-setting-row:disabled { opacity: .5; cursor: default; }
        .msg-infos-setting-icon {
          display: grid;
          place-items: center;
          width: 32px;
          height: 32px;
          border-radius: 999px;
          background: var(--ink-100);
          color: var(--ink-700);
        }
        .msg-infos-setting-copy {
          display: flex;
          flex-direction: column;
          min-width: 0;
          gap: 1px;
        }
        .msg-infos-setting-copy strong {
          overflow: hidden;
          font-size: 12.5px;
          font-weight: 600;
          line-height: 1.25;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .msg-infos-setting-copy small {
          overflow: hidden;
          color: var(--ink-500);
          font-size: 10.5px;
          font-weight: 400;
          line-height: 1.3;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .msg-infos-permission-help {
          margin: 2px 6px 7px 40px;
          color: var(--ink-600);
          font-size: 12px;
          line-height: 1.45;
        }
        .msg-infos-input:focus-visible {
          outline: 2px solid var(--primary-500, var(--ink-900));
          outline-offset: 1px;
        }
        .msg-infos-liste {
          display: flex;
          flex-direction: column;
          gap: 2px;
          margin: 0;
          padding: 0;
          list-style: none;
        }
        .msg-infos-section-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }
        .msg-infos-search {
          display: flex;
          align-items: center;
          gap: 8px;
          min-height: 44px;
          padding: 0 11px;
          border: 1px solid var(--ink-300);
          border-radius: 999px;
          background: var(--ink-50);
          color: var(--ink-500);
        }
        .msg-infos-search input {
          min-width: 0;
          width: 100%;
          border: none;
          outline: none;
          background: transparent;
          color: var(--ink-900);
          font: inherit;
          font-size: 16px;
        }
        .msg-infos-search:focus-within {
          outline: 2px solid var(--primary-500, var(--ink-900));
          outline-offset: 1px;
        }
        .msg-infos-subsection {
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding: 10px;
          border-radius: 10px;
          background: var(--ink-50);
        }
        .msg-infos-member {
          border-bottom: 1px solid var(--ink-100);
        }
        .msg-infos-member:last-child { border-bottom: none; }
        .msg-infos-member-actions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          flex-wrap: wrap;
          gap: 4px;
          max-width: 48%;
        }
        .msg-infos-member-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          min-width: 0;
          min-height: 44px;
        }
        .msg-infos-member-footer .msg-row-handle {
          flex: 1 1 auto;
          min-width: 0;
        }
        .msg-infos-member-footer .msg-infos-member-actions {
          flex: 0 0 auto;
          flex-wrap: nowrap;
          justify-content: flex-end;
          max-width: none;
        }
        .msg-infos-member .msg-row { align-items: flex-start; }
        .msg-infos .msg-row {
          min-height: 52px;
          padding-block: 6px;
        }
        /* La variante page agrandit les lignes génériques. Ces sélecteurs plus
           précis maintiennent volontairement la densité de la fiche groupe. */
        .msg-panel .msg-infos .msg-row-name {
          font-size: 12.5px;
          font-weight: 600;
          line-height: 1.25;
        }
        .msg-panel .msg-infos .msg-row-preview {
          color: var(--ink-500);
          font-size: 10.5px;
          font-weight: 400;
          line-height: 1.3;
        }
        .msg-panel .msg-infos .msg-row-handle {
          display: block;
          overflow: hidden;
          color: var(--ink-500);
          font-size: 10px;
          font-weight: 400;
          line-height: 1.25;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .msg-infos-member .msg-row-preview {
          display: -webkit-box;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: normal;
          line-height: 1.3;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 2;
        }
        .msg-infos-confirm {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin: 0 8px 10px 56px;
          padding: 10px;
          border: 1px solid var(--danger-100);
          border-radius: 10px;
          background: var(--danger-50, var(--ink-50));
          color: var(--danger-700);
        }
        .msg-infos-confirm p {
          margin: 0;
          font-size: 12.5px;
          line-height: 1.45;
        }
        .msg-infos-confirm-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .msg-infos-action {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
          min-height: 44px;
          padding: 8px 10px;
          border: 1px solid var(--ink-200);
          border-radius: 10px;
          background: var(--ink-0);
          color: var(--ink-900);
          font: inherit;
          font-size: 13px;
          font-weight: 600;
          text-align: left;
          cursor: pointer;
        }
        .msg-infos-action:hover { background: var(--ink-100); }
        .msg-infos-action:focus-visible,
        .msg-infos-mini:focus-visible,
        .msg-infos-avatar-edit:focus-visible {
          outline: 2px solid var(--ring);
          outline-offset: 2px;
        }
        .msg-infos-action[data-danger="true"] {
          border-color: var(--danger-500);
          color: var(--danger-700);
        }
        .msg-infos-action:disabled { opacity: 0.55; cursor: default; }
        .msg-infos-sensitive {
          display: flex;
          flex-direction: column;
          gap: 8px;
          min-width: 0;
        }
        .msg-infos-sensitive-actions {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          align-items: center;
          gap: 6px;
          width: 100%;
          min-width: 0;
        }
        .msg-infos-sensitive-actions[data-count="2"] {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .msg-infos-sensitive-actions .msg-infos-action {
          justify-content: center;
          min-width: 0;
          min-height: 44px;
          padding: 4px 0;
          border: none;
          border-radius: 0;
          background: transparent;
          font-size: 11px;
          font-weight: 550;
          line-height: 1.15;
          white-space: nowrap;
        }
        .msg-infos-sensitive-actions .msg-infos-action:hover { background: transparent; }
        .msg-infos-action-pill {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          width: 100%;
          min-width: 0;
          min-height: 36px;
          padding: 4px 7px;
          border: 1px solid var(--ink-300);
          border-radius: 999px;
          background: var(--ink-0);
        }
        .msg-infos-sensitive-actions .msg-infos-action:hover .msg-infos-action-pill,
        .msg-infos-sensitive-actions .msg-infos-action[aria-pressed="true"] .msg-infos-action-pill {
          background: var(--ink-100);
        }
        .msg-infos-sensitive-actions .msg-infos-action[data-danger="true"] .msg-infos-action-pill {
          border-color: var(--danger-500);
        }
        .msg-infos-action-pill > span {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .msg-infos-sensitive-confirm { margin: 0; }
        .msg-infos-mini {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          align-self: flex-start;
          min-height: 44px;
          padding: 6px 9px;
          border: 1px solid var(--ink-200);
          border-radius: 8px;
          background: transparent;
          color: var(--ink-700);
          font: inherit;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          white-space: nowrap;
        }
        .msg-infos-mini:hover { background: var(--ink-100); }
        .msg-infos-mini[data-danger="true"] {
          border-color: var(--danger-500);
          color: var(--danger-700);
        }
        .msg-infos-mini:disabled { opacity: 0.55; cursor: default; }
        .msg-panel[data-variant="page"] .msg-infos-mini {
          min-height: 44px;
          padding: 6px 10px;
          font-size: 12.5px;
        }
        .msg-success {
          margin: 0 8px;
          padding: 8px 10px;
          border-radius: 10px;
          background: var(--success-50, var(--ink-100));
          color: var(--success-600);
          font-size: 12.5px;
        }

        .msg-infos-qr,
        .msg-infos-resources {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .msg-infos-qr-card,
        .msg-infos-resource-block {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          padding: 16px 12px;
          border: 1px solid var(--ink-200);
          border-radius: 14px;
          background: var(--ink-0);
          text-align: center;
        }
        .msg-infos-qr-code {
          display: grid;
          place-items: center;
          width: min(100%, 260px);
          margin-top: 8px;
          padding: 16px;
          border-radius: 12px;
          /* Contraste OBLIGÉ d'un code QR, quel que soit le thème : clair
             derrière, sombre devant — des jetons constants, pas ceux de la
             charte (un thème sombre inverserait le code). */
          background: var(--qr-code-surface);
          color: var(--qr-code-ink);
        }
        .msg-infos-qr-code svg { width: 100%; height: auto; }
        .msg-infos-qr-help {
          margin: 0;
          padding-inline: 8px;
          color: var(--ink-600);
          font-size: 12.5px;
          line-height: 1.5;
          text-align: center;
        }
        .msg-infos-qr-actions {
          display: flex;
          align-items: stretch;
          justify-content: center;
          flex-wrap: wrap;
          gap: 6px;
        }
        .msg-infos-resource-block { align-items: stretch; text-align: left; }
        .msg-infos-resource-list,
        .msg-infos-link-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin: 0;
          padding: 0;
          list-style: none;
        }
        .msg-infos-resource-list li,
        .msg-infos-link-list li {
          min-width: 0;
          padding-bottom: 8px;
          border-bottom: 1px solid var(--ink-100);
        }
        .msg-infos-resource-list li:last-child,
        .msg-infos-link-list li:last-child { padding-bottom: 0; border-bottom: none; }
        .msg-infos-link-list li {
          display: flex;
          align-items: center;
          gap: 7px;
          font-size: 12.5px;
        }
        .msg-infos-link-list a {
          min-width: 0;
          overflow: hidden;
          color: var(--primary-700);
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        /* La page immersive reprend les BLOCS courts du modèle mobile : une
           seule couche de cartes, séparée par le fond de surface. */
        .msg-panel[data-fill="screen"] .msg-infos {
          gap: 10px;
          max-width: none;
          padding: 10px 10px calc(28px + env(safe-area-inset-bottom));
          background: var(--ink-50);
        }
        .msg-panel[data-fill="screen"] .msg-infos-hero,
        .msg-panel[data-fill="screen"] .msg-infos-block {
          border: 1px solid var(--ink-200);
          border-radius: 14px;
          background: var(--ink-0);
        }
        .msg-panel[data-fill="screen"] .msg-infos-hero { padding: 16px 12px 14px; }
        .msg-panel[data-fill="screen"] .msg-infos-block { padding: 8px 10px; }
        .msg-panel[data-fill="screen"] .msg-infos-member .msg-row {
          display: grid;
          grid-template-columns: 40px minmax(0, 1fr);
          align-items: center;
          column-gap: 12px;
          row-gap: 4px;
        }
        .msg-panel[data-fill="screen"] .msg-infos-member-actions {
          max-width: none;
        }
        .msg-panel[data-fill="screen"] .msg-infos-member-footer .msg-infos-member-actions {
          justify-content: flex-end;
        }
        .msg-panel[data-fill="screen"] .msg-infos-member-actions .msg-infos-mini {
          border-color: transparent;
          border-radius: 999px;
          background: var(--primary-50);
          color: var(--primary-700);
          padding-inline: 10px;
        }
        .msg-panel .msg-infos .msg-infos-role-action,
        .msg-panel[data-fill="screen"] .msg-infos-member-actions .msg-infos-role-action {
          min-height: 44px;
          padding: 0 4px;
          border: none;
          border-radius: 0;
          background: transparent;
          color: var(--primary-700);
          font-size: 10.5px;
          font-weight: 550;
        }
        .msg-panel .msg-infos .msg-infos-role-action:hover,
        .msg-panel[data-fill="screen"] .msg-infos-member-actions .msg-infos-role-action:hover {
          background: transparent;
          text-decoration: underline;
        }

        @media (max-width: 520px) {
          .msg-infos-member-actions { max-width: 44%; }
          .msg-infos-confirm { margin-left: 8px; }
          .msg-infos-sensitive-actions .msg-infos-action {
            font-size: 10.5px;
          }
          .msg-infos-action-pill {
            gap: 4px;
            padding-inline: 5px;
          }
          .msg-infos-sensitive-confirm { margin-left: 0; }
        }

        @media (prefers-reduced-motion: reduce) {
          .msg-panel, .msg-head, .msg-row, .msg-collapse-icon {
            transition: none;
          }
          .msg-rec-dot { animation: none; }
        }
      `

export function MessagerieStyles() {
	return (
		<style href="msg-shared-v11" precedence="default">
			{MESSAGERIE_STYLES_CSS}
		</style>
	)
}
