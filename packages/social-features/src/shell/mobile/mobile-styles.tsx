// Dupliqué de socle/packages/agent-features/src/features/reseau-personnel/mobile/mobile-styles.tsx @ ad2e7fdc2 — adaptations : feuille sortie du JSX dans une constante de module exportée (`RESEAU_MOBILE_CSS`) — un littéral enfant de `<style>` passerait pour une chaîne d'interface ; AUCUNE couleur littérale — le masque du débordement des sous-menus lit un jeton opaque de la charte (`--foreground`) au lieu d'un mot-clé de couleur, la valeur hexadécimale citée en commentaire est retirée ; commentaires rapportés à la coque légère du moteur (scroller de l'hôte, cliquets `no-hardcoded-colors` et `theme-contract`, classes `.esp-*` fournies par `@antsia/ui`) ; règles, sélecteurs et paliers inchangés ; déplacé dans la coque (`shell/mobile/`) ; système épuré (ADR-0027) : déclencheur du composeur et puces de portée sans filet (`--esp-chip-*`), onglet actif en pastille tonale (`--esp-tab-active-*`), pastille de décompte aux couleurs des réactions (`--role-react-*`), motif de fond de page en option, valeurs d'origine en repli ; ADR-0028 : en-tête des chartes (`.rm-header[data-presentation="charte"]`) — sans filet, la marque en Familjen Grotesk, pastilles de la cloche et des messages posées au coin du rond et cerclées du fond.
"use client"

/**
 * mobile-styles — la feuille de la coquille mobile du réseau.
 *
 * ⚠️ `@antsia/ui` n'a AUCUNE primitive de mise en page responsive : le patron
 * est un `<style href precedence>` scopé par écran, que React 19 hisse dans
 * `<head>` et DÉDOUBLONNE si l'écran se remonte. Même mécanique que `rp-grid`
 * (page de bureau) et `rp-composer` (composeur).
 *
 * ⚠️ AUCUNE couleur littérale ici — que des `var()` de rôle, tous déclarés par
 * la charte (cliquets `no-hardcoded-colors` et `theme-contract`). Une valeur
 * composée (dégradé, `color-mix`) passe par une classe `.esp-*` de la feuille
 * de `@antsia/ui`, jamais par ce fichier.
 *
 * ⚠️ Le préfixe est `.rm-` et non `.rp-` : les deux coquilles peuvent être
 * montées l'une après l'autre dans la même page (rotation d'écran), et deux
 * feuilles qui se disputent le même sélecteur ne se départagent que par
 * l'ordre d'émission — qu'on ne contrôle pas.
 */

/**
 * La feuille elle-même, en constante de MODULE : un littéral enfant de
 * `<style>` passerait pour une chaîne d'interface (cliquet
 * `no-hardcoded-strings`), et la constante se relit telle quelle dans les tests
 * (`reseau-layout.test.ts` confronte ses paliers à ceux du module).
 */
export const RESEAU_MOBILE_CSS = `
      /* La colonne entière — hauteur figée, un seul nœud qui défile.
         ⚠️ PAS de container-type ici : ce nœud est l'ANCÊTRE de la barre
         d'onglets en position fixed, qui s'y trouverait cadrée et défilerait
         avec le fil. Le conteneur nommé vit un cran plus bas, sur le
         scroller, qui n'a aucun descendant fixe (les trois surfaces
         flottantes du réseau passent toutes par un portail). */
      .rm-shell {
        display: flex;
        min-height: 0;
        flex: 1 1 auto;
        flex-direction: column;
        background: var(--background);
        /* Motif de fond, en option (ADR-0027) : aucun par défaut ; fixé à la
           fenêtre pour se raccorder à celui du corps de la page. */
        background-image: var(--esp-motif-image, none);
        background-size: var(--esp-motif-size, auto);
        background-attachment: fixed;
      }
      /* Le contenu. Il porte le conteneur nommé « rp-page » pour que les
         requêtes @container déjà écrites par les panneaux du réseau
         (composeur, cartes) continuent de s'appliquer au téléphone.
         ⚠️ Ce nœud ne DÉFILE PAS lui-même : le défilement appartient au
         scroller principal de l'application hôte, l'unique scroller.
         Il a porté overflow-y:auto + overscroll-behavior-y:contain SANS être
         borné en hauteur : un conteneur de défilement sans débord propre est
         TOUJOURS à sa frontière, et « contain » y avale molette et geste
         tactile au lieu de les chaîner au parent — l'écran entier refusait de
         défiler partout où le fil s'étendait. Le constat était trompeur :
         scrollTop programmatique marchait, seul le GESTE mourait. */
      .rm-scroll {
        container-type: inline-size;
        /* DEUX noms, et non un renommage : « rp-page » sert les requêtes déjà
           écrites par les panneaux du réseau (composeur, cartes, tuiles), et
           « rm-scroll » porte les paliers de composition propres à la coquille
           mobile (R-15). Renommer aurait éteint les premières sans un bruit. */
        container-name: rp-page rm-scroll;
        /* ⚠️ position:relative reste OBLIGATOIRE : un descendant en position
           absolue — un sr-only en est un — résoudrait sinon contre le bloc
           conteneur initial et RALLONGERAIT la hauteur du document. Même
           piège que .rp-scope, corrigé le 2026-08-12. */
        position: relative;
        flex: 1 1 auto;
        min-height: 0;
        padding: 10px 12px 12px;
      }
      /* L'en-tête collant : identité, recherche, retour. Il reste au-dessus du
         contenu sans jamais le recouvrir — d'où le fond opaque. */
      .rm-header {
        position: sticky;
        top: 0;
        z-index: 30;
        display: block;
        padding: 6px 12px;
        background: var(--background);
        border-bottom: 1px solid var(--border);
      }
      .rm-header-row {
        display: flex;
        width: 100%;
        min-width: 0;
        align-items: center;
        gap: 6px;
      }
      /* Le nom du réseau — un libellé VISUEL, jamais un second h1 : la page en a
         déjà un, en sr-only, et deux titres de niveau 1 donnent deux points
         d'entrée à un lecteur d'écran. */
      .rm-wordmark {
        margin: 0;
        flex: 1 1 auto;
        min-width: 0;
        font-size: 19px;
        font-weight: 800;
        letter-spacing: -0.01em;
        color: var(--foreground);
      }
      /* La MARQUE déclarée par l'application (ADR-0027) : le nom en capitales
         espacées et son point à l'aplat d'identité, comme la maquette. */
      .rm-wordmark[data-brand] {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-size: 21px;
        letter-spacing: 0.06em;
      }
      .rm-wordmark-dot {
        display: inline-block;
        flex: 0 0 auto;
        width: 7px;
        height: 7px;
        border-radius: 999px;
        background: var(--primary-fill);
      }
      /* Les boutons icônes de l'EN-TÊTE (recherche, cloche) : un rond gris dans
         les thèmes à trois couleurs (ADR-0027), comme la maquette et la loupe du
         bureau ; replis : l'angle et le fond transparent de l'onglet. */
      .rm-header .rm-tab {
        border-radius: var(--esp-header-icon-radius, 12px);
        background: var(--esp-header-icon-bg, transparent);
      }
      /* L'en-tête des chartes (ADR-0028) : aucun filet (l'en-tête a la couleur
         du fond), la marque en Familjen Grotesk, la marge de la maquette à
         gauche ; la pastille de décompte se pose au coin du ROND et se cercle
         du fond, comme sur la maquette. */
      .rm-header[data-presentation="charte"] {
        padding: 6px 12px 8px 20px;
        border-bottom-color: transparent;
      }
      .rm-header[data-presentation="charte"] .rm-wordmark[data-brand] {
        font-family: var(--font-display, inherit);
        font-size: 22px;
        font-weight: 700;
      }
      .rm-header[data-presentation="charte"] .rm-tab {
        position: relative;
        color: var(--foreground);
      }
      .rm-header[data-presentation="charte"] .rm-tab-icon { position: static; }
      .rm-header[data-presentation="charte"] .rm-tab-badge {
        top: -3px;
        right: -4px;
        min-width: 18px;
        height: 18px;
        padding: 0 5px;
        font-family: inherit;
        font-size: 10.5px;
        box-shadow: 0 0 0 2px var(--background);
      }
      .rm-avatar-link {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 44px;
        min-height: 44px;
        border-radius: 999px;
        text-decoration: none;
      }
      .rm-avatar-link:focus-visible {
        outline: 2px solid var(--ring);
        outline-offset: 2px;
      }
      .rm-search {
        display: flex;
        flex: 1 1 auto;
        width: auto;
        min-width: 0;
        align-items: center;
        gap: 2px;
      }
      /* Le déclencheur de publication — la ligne « Quoi de neuf ». Une cible
         pleine largeur : au pouce, un bouton étroit se rate. */
      .rm-composer-trigger {
        display: flex;
        width: 100%;
        min-height: 48px;
        align-items: center;
        gap: 10px;
        padding: 10px 14px;
        border: 1px solid var(--esp-chip-border, var(--border));
        border-radius: 999px;
        background: var(--esp-chip-bg, var(--card));
        color: var(--muted-foreground);
        font: inherit;
        font-size: 14px;
        text-align: start;
        cursor: pointer;
      }
      .rm-composer-trigger:focus-visible {
        outline: 2px solid var(--ring);
        outline-offset: 2px;
      }
      /* La rangée des portées — elle défile, sans barre visible. */
      .rm-scopes {
        display: flex;
        gap: 8px;
        overflow-x: auto;
        padding: 2px 0;
        scrollbar-width: none;
      }
      .rm-scopes::-webkit-scrollbar { display: none; }
      .rm-scope-chip {
        flex: 0 0 auto;
        min-height: 44px;
        padding: 7px 15px;
        border: 1px solid var(--esp-chip-border, var(--border));
        border-radius: var(--esp-chip-radius, 999px);
        background: var(--esp-chip-bg, var(--card));
        color: var(--muted-foreground);
        font: inherit;
        font-size: 13px;
        font-weight: 600;
        white-space: nowrap;
        cursor: pointer;
      }
      .rm-scope-chip[aria-pressed="true"] {
        border-color: var(--primary-fill);
        background: var(--primary-fill);
        color: var(--primary-fill-on, var(--primary-foreground));
      }
      .rm-scope-note {
        margin: 6px 2px 0;
        font-size: 12.5px;
        line-height: 1.5;
        color: var(--muted-foreground);
      }
      /* La colonne du contenu : une pile, jamais une grille. Les rails du
         bureau n'existent pas ici — ce qu'ils portaient est au Menu ou
         intercalé dans le fil. */
      .rm-column {
        display: flex;
        flex-direction: column;
        gap: 12px;
        width: 100%;
        min-width: 0;
      }
      /* ── R-15 · LE PALIER TABLETTE ────────────────────────────────────
         Sans borne, la pile occupait tout : 744 px d'article à 768 px de
         large, 935 px à 959 — puis 646 px au premier pixel du bureau. Ce
         n'était pas un palier, c'était une chute. Les largeurs vivent dans
         reseau-layout.ts (TABLET_*), redéclarées ici parce qu'une
         propriété personnalisée ne s'utilise pas dans une condition
         @container ; reseau-layout.test.ts confronte les deux. */
      @container rm-scroll (min-width: 600px) {
        .rm-column {
          max-width: 640px;
          margin-inline: auto;
        }
        /* Une COLLECTION n'est pas un article : relations, pages et groupes
           gagnent à s'étaler en grille. Elles se DÉSIGNENT (data-collection),
           la colonne les laisse courir. */
        .rm-column:has([data-collection]) {
          max-width: none;
        }
      }
      @container rm-scroll (min-width: 820px) {
        /* 680 px = le PLANCHER de lecture du bureau (FEED_COLUMN_MIN) : c'est
           ce qui rend 959 → 960 continu (680 → 646) au lieu de 935 → 646. */
        .rm-column {
          max-width: 680px;
        }
      }
      /* La carte de découverte intercalée dans le fil : au téléphone elle
         n'est plus masquée par le rail droit, qui n'existe pas. */
      .rm-scroll .rp-feed-inline { display: flex; }
      /* Une barre, deux niveaux : Menu reste fixe à gauche ; les vrais volets
         du réseau défilent à droite. Le séparateur et les rôles ARIA rendent
         la distinction perceptible sans ajouter une seconde carte. */
      .rm-tabbar-row {
        display: flex;
        width: 100%;
        min-width: 0;
        height: 4rem;
        align-items: center;
      }
      .rm-subtabs {
        display: flex;
        min-width: 0;
        flex: 1 1 auto;
        align-items: center;
        gap: 2px;
        overflow-x: auto;
        overscroll-behavior-inline: contain;
        padding: 0 6px;
        scroll-padding-inline: 6px;
        scroll-snap-type: x proximity;
        scrollbar-width: none;
        -webkit-overflow-scrolling: touch;
      }
      .rm-subtabs::-webkit-scrollbar { display: none; }
      /* Le débordement se VOIT (R-15). Sept sous-menus de 72 px tiennent en
         602 px : sous ~705 px de fenêtre, la rangée déborde et la dernière
         destination était coupée net, sans rien pour le dire. Le dégradé
         n'est posé QUE là où le débordement est certain — au-delà, il
         atténuerait le premier onglet pour rien. L'onglet actif, lui, est
         ramené dans le champ par scrollIntoView (barre d'onglets).
         ⚠️ --foreground n'est pas une couleur ici : un masque ne lit que le
         canal ALPHA, et ce jeton est OPAQUE dans toutes les chartes. Aucune
         encre n'est peinte — le jeton ne sert qu'à dire « plein ». */
      @media (max-width: 705px) {
        .rm-subtabs {
          /* Le préfixe reste : « mask-image » nu n'est servi qu'à partir de
             Safari 15.4, et cette surface est d'abord un téléphone. */
          -webkit-mask-image: linear-gradient(
            to right,
            transparent 0,
            var(--foreground) 14px,
            var(--foreground) calc(100% - 14px),
            transparent 100%
          );
          mask-image: linear-gradient(
            to right,
            transparent 0,
            var(--foreground) 14px,
            var(--foreground) calc(100% - 14px),
            transparent 100%
          );
        }
      }
      .rm-tab,
      .rm-menu-tab {
        display: flex;
        min-width: 44px;
        min-height: 44px;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 2px;
        padding: 6px 2px;
        border: none;
        border-radius: 12px;
        background: transparent;
        color: var(--muted-foreground);
        font: inherit;
        text-decoration: none;
        cursor: pointer;
      }
      .rm-tab {
        flex: 0 0 72px;
        scroll-snap-align: center;
      }
      .rm-menu-tab {
        position: relative;
        flex: 0 0 68px;
        margin-left: 4px;
        color: var(--foreground);
      }
      .rm-menu-tab::after {
        position: absolute;
        top: 8px;
        right: -3px;
        bottom: 8px;
        width: 1px;
        background: var(--border);
        content: "";
      }
      .rm-tab[aria-current="page"] { color: var(--primary); }
      .rm-tab:focus-visible,
      .rm-menu-tab:focus-visible {
        outline: 2px solid var(--ring);
        outline-offset: 2px;
      }
      .rm-tab-icon {
        position: relative;
        display: flex;
        width: 28px;
        height: 28px;
        align-items: center;
        justify-content: center;
        border-radius: var(--esp-chip-radius, 10px);
      }
      /* ⚠️ La pastille de l'onglet actif porte --accent en FOND : son premier
         plan doit donc être --accent-foreground, jamais la couleur héritée du
         libellé. Sous la charte de base, --accent et --primary valent la MÊME
         encre : l'icône se rendait en carré plein, bleu sur bleu, et seul le
         libellé disait quel onglet était actif. Une paire de rôles s'utilise
         entière, ou pas du tout.
         (Aucun accent grave dans ce bloc : il vit dans un template literal.) */
      .rm-tab[aria-current="page"] .rm-tab-icon {
        background: var(--esp-tab-active-bg, var(--accent));
        color: var(--esp-tab-active-fg, var(--accent-foreground));
      }
      .rm-tab-label {
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 10px;
        font-weight: 600;
      }
      /* La pastille de décompte — chiffre en chasse fixe, comme partout dans
         le réseau : ce qui se COMPTE se lit en monospace. */
      .rm-tab-badge {
        position: absolute;
        top: -6px;
        right: -8px;
        display: flex;
        min-width: 16px;
        height: 16px;
        align-items: center;
        justify-content: center;
        padding: 0 4px;
        border-radius: 999px;
        background: var(--role-react-fill, var(--primary));
        color: var(--role-react-on, var(--primary-foreground));
        font-family: var(--font-mono);
        font-size: 9px;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
      }
      @media (prefers-reduced-motion: reduce) {
        .rm-tab,
        .rm-menu-tab,
        .rm-subtabs,
        .rm-scope-chip,
        .rm-composer-trigger,
        .rm-search input {
          scroll-behavior: auto;
          transition: none !important;
        }
      }
`

export function ReseauMobileStyles() {
  return (
    <style href="rp-mobile" precedence="default">
      {RESEAU_MOBILE_CSS}
    </style>
  )
}
