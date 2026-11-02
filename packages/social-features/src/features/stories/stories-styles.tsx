// Dupliqué de socle/packages/agent-features/src/features/stories/stories-styles.tsx @ ad2e7fdc2 — adaptations : règles et sélecteurs inchangés (jetons de rôle seulement, aucune couleur littérale) ; feuille sortie du JSX dans une constante de module (`STORIES_CSS`) — un littéral enfant de `<style>` passerait pour une chaîne d'interface ; commentaires rapportés au cliquet `no-hardcoded-colors` et à la couche de communication de `@antsia/ui` (`communication.css` : classes `.esp-story-*`, `.esp-live-pill`, et le jeton de scène `--esp-immersive-on-ink` lu ici). ; contour des surfaces posées sur la page lu dans --esp-surface-border, filet d'origine en repli (aucun contour quand le thème distingue déjà la carte du fond) ; aplats d'identité et leur texte selon les chartes (`--esp-identity-fill`, `--primary-fill-on`, pastille tonale des états actifs ; ADR-0027), facture d'origine en repli.
"use client"

/**
 * stories-styles — la feuille des stories : la barre du fil et le lecteur
 * plein écran.
 *
 * ⚠️ Les primitives de `@antsia/ui` n'ont AUCUNE mise en page responsive : le
 * patron est un `<style href precedence>` scopé par écran, que React 19 hisse
 * dans `<head>` et DÉDOUBLONNE si l'écran se remonte. Même mécanique que la
 * feuille de la coquille mobile (`mobile-styles`).
 *
 * ⚠️ AUCUNE couleur littérale ici — que des `var()` de rôle. Le cliquet
 * `no-hardcoded-colors` refuse toute couleur littérale dans les `.tsx`,
 * commentaires compris ; toute valeur COMPOSÉE (dégradé, `color-mix`) passe
 * par une classe `.esp-*` de la couche de communication de `@antsia/ui`
 * (`communication.css`) — ici, les cinq familles `.esp-story-*` et
 * `.esp-live-pill`.
 *
 * ⚠️ AUCUN backtick dans la feuille ci-dessous : il fermerait le littéral
 * gabarit, et l'erreur de compilation qui suit ne parlerait plus de CSS du
 * tout.
 *
 * ⚠️ Le préfixe est `.st-` et non `.rp-`/`.rm-` : la barre de stories est
 * montée DANS les deux coquilles du réseau (bureau et téléphone), et un
 * sélecteur partagé avec l'une des deux se ferait départager par l'ordre
 * d'émission des feuilles — qu'on ne contrôle pas.
 */

/**
 * La feuille, en CONSTANTE de module et non en littéral posé dans le JSX : un
 * texte littéral enfant d'un élément serait lu comme une chaîne d'interface
 * (cliquet `no-hardcoded-strings`) — c'est du CSS, pas une phrase.
 */
const STORIES_CSS = `
      /* ── LA BARRE, en tête du fil ─────────────────────────────────────── */
      /* Une rangée qui défile à l'horizontale, sans barre visible : c'est la
         forme du genre, et elle dit d'elle-meme qu'il y en a plus a droite.
         Le rembourrage vertical laisse respirer l'anneau, qui deborde. */
      .st-tray {
        display: flex;
        gap: 8px;
        width: 100%;
        overflow-x: auto;
        padding: 2px 0 6px;
        scrollbar-width: none;
        scroll-snap-type: x proximity;
      }
      .st-tray::-webkit-scrollbar { display: none; }
      /* La tuile : une CARTE verticale (arbitrage du 2026-08-20), largeur
         figee pour que la rangee ne se recompose pas selon la longueur des
         prenoms. Bien au-dela des 44 px de cible tactile (WCAG 2.5.5). */
      .st-tray-tile {
        display: block;
        flex: 0 0 auto;
        width: 112px;
        padding: 0;
        border: none;
        background: transparent;
        color: var(--foreground);
        font: inherit;
        text-align: left;
        text-decoration: none;
        cursor: pointer;
        scroll-snap-align: start;
      }

      /* ── LA CARTE ────────────────────────────────────────────────────────
         Le media occupe TOUT le cadre ; l'auteur revient en medaillon dans le
         coin. Le rapport suit celui d'une actu (9:16) : la vignette n'est plus
         un apercu, c'est le contenu. */
      .st-card {
        position: relative;
        display: block;
        width: 100%;
        aspect-ratio: 9 / 16;
        overflow: hidden;
        border-radius: 12px;
        background: var(--muted);
      }
      .st-card-media {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      /* Le voile de lisibilite. Les COULEURS viennent d'esp-story-shade
         (charte de l'espace), posee a cote de cette classe : ici, seule la
         geometrie. */
      .st-card-shade {
        position: absolute;
        inset: 0;
      }
      .st-card-avatar {
        position: absolute;
        top: 8px;
        left: 8px;
      }
      /* Le medaillon reprend l'anneau de la rangee, en plus petit : c'est la
         MEME piece, donc le meme code d'etat (vu / pas vu / a moi). */
      .st-card-avatar .st-tray-ring {
        width: 38px;
        height: 38px;
        padding: 2px;
      }
      .st-card-avatar .st-tray-disc {
        border-width: 1.5px;
      }
      /* Deux lignes au plus : un nom compose deborderait sur la moitie de la
         carte, et le tronquer a une ligne coupe la plupart des patronymes. */
      .st-card-name {
        position: absolute;
        right: 8px;
        bottom: 8px;
        left: 8px;
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
        overflow: hidden;
        font-size: 12px;
        font-weight: 700;
        line-height: 1.25;
        color: var(--esp-immersive-on-ink);
      }

      /* ── LA CARTE DE CREATION ────────────────────────────────────────────
         Mon portrait en haut, un pied plein en bas, et le bouton a cheval
         entre les deux : le geste se presente comme la premiere actu de la
         rangee — la mienne. */
      .st-tray-create .st-card {
        background: var(--card);
        /* ATTENTION — LA BORDURE N'EST PAS DECORATIVE : sans elle, la
           tuile DISPARAIT en theme clair. La charte de l'espace pose --card
           ET --background sur le MEME jeton (--esp-neutral-0, blanc) : une
           carte peinte en --card sur la page n'a alors aucun contraste, et il
           ne restait que le « + » et le libelle, flottant dans le vide. En
           sombre le defaut ne se voit pas (--esp-night-card differe du fond)
           — d'ou un ecran juste sur un theme et faux sur l'autre, que seul le
           navigateur pouvait reveler.

           C'est d'ailleurs ce que dit la charte (§5) : la lecture « carte
           posee sur une page » vient de la BORDURE, pas du remplissage. Les
           autres tuiles s'en passent parce que leur fond est --muted
           (--esp-neutral-100), qui se detache du blanc.

           Meme idiome que .st-compose-frame plus bas ; box-sizing:
           border-box (preflight Tailwind) fait que le 1 px ne deplace rien.

           NB : ce fichier EST un litteral de gabarit — pas d'accent grave
           dans ces commentaires, il fermerait la chaine.

           Une charte dont la carte se distingue du fond pose
           --esp-surface-border a transparent : la tuile se lit alors par son
           remplissage, sans contour. */
        border: 1px solid var(--esp-surface-border, var(--border));
      }
      .st-tray-create .st-card-media {
        inset: 0 0 auto;
        height: 64%;
      }
      .st-card-foot {
        position: absolute;
        right: 0;
        bottom: 0;
        left: 0;
        height: 36%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: flex-end;
        gap: 2px;
        padding: 0 6px 8px;
        background: var(--card);
      }
      .st-card-plus {
        position: absolute;
        top: -15px;
        display: flex;
        width: 30px;
        height: 30px;
        align-items: center;
        justify-content: center;
        border: 3px solid var(--card);
        border-radius: 999px;
        background: var(--primary-fill);
        color: var(--primary-fill-on, var(--on-fill));
      }
      .st-card-foot-label {
        font-size: 11.5px;
        font-weight: 700;
        line-height: 1.2;
        text-align: center;
        color: var(--foreground);
      }
      .st-tray-tile:focus-visible {
        outline: 2px solid var(--ring);
        outline-offset: 3px;
        border-radius: 12px;
      }
      /* L'anneau. Il ne porte AUCUNE couleur : elle vient des classes
         .esp-story-ring / -seen / -self, posees a cote de celle-ci. */
      .st-tray-ring {
        display: flex;
        width: 64px;
        height: 64px;
        align-items: center;
        justify-content: center;
        border-radius: 999px;
        padding: 2.5px;
      }
      /* Le disque interieur. Le liseré de la couleur de PAGE separe l'anneau
         de la photo : sans lui, les deux se touchent et l'anneau se lit comme
         un bord de l'image. */
      .st-tray-disc {
        display: flex;
        width: 100%;
        height: 100%;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        border: 2px solid var(--background);
        border-radius: 999px;
        background: var(--muted);
        color: var(--muted-foreground);
      }
      .st-tray-cover {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      /* ── LES MÉDAILLONS (présentation « rings », ADR-0027) ────────────────
         Déclarés par l'application (storiesPresentation) : un rond par
         auteur dans son anneau, le prénom dessous, « Vous » et son « + » en
         tête — la maquette de la série 3. Les cartes restent le défaut. La
         tuile garde une largeur figée : la rangée ne se recompose pas selon
         la longueur des prénoms, tronqués d'une ellipse. */
      .st-tray[data-presentation="rings"] {
        gap: 10px;
        padding: 4px 2px 8px;
      }
      .st-tray[data-presentation="rings"] .st-tray-tile {
        width: 64px;
        text-align: center;
      }
      .st-ring-tile {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
      }
      /* Les mesures de la maquette des chartes (ADR-0028) : un anneau de
         2,5 px, séparé du portrait par 2,5 px de la couleur de page. */
      .st-ring-tile .st-tray-ring {
        width: 60px;
        height: 60px;
        padding: 2.5px;
      }
      .st-ring-tile .st-tray-disc {
        border-width: 2.5px;
      }
      /* « Vous » : mon portrait (ou la silhouette), et son « + » à l'aplat
         d'identité, comme le bouton Créer. Sans série en ligne, un disque
         neutre sans anneau ; avec, ma série dans son anneau. */
      .st-ring-self {
        position: relative;
        display: flex;
        width: 60px;
        height: 60px;
      }
      .st-ring-self > .st-tray-disc {
        border: none;
      }
      .st-ring-open {
        display: flex;
        width: 100%;
        height: 100%;
        padding: 0;
        border: none;
        border-radius: 999px;
        background: transparent;
        color: inherit;
        cursor: pointer;
      }
      .st-ring-open:focus-visible,
      .st-ring-plus-button:focus-visible {
        outline: 2px solid var(--ring);
        outline-offset: 3px;
      }
      .st-ring-plus {
        position: absolute;
        right: -2px;
        bottom: -2px;
        display: flex;
        width: 22px;
        height: 22px;
        box-sizing: border-box;
        align-items: center;
        justify-content: center;
        border: 2.5px solid var(--background);
        border-radius: 999px;
        background: var(--primary-fill);
        color: var(--primary-fill-on, var(--on-fill));
      }
      /* Le « + » garde sa pastille de 22 px mais possède sa propre cible de
         44 px, distincte du bouton d'ouverture de la série. Le centre de la
         pastille reste à la même place (bord visuel à -2 px du portrait). */
      .st-ring-plus-button {
        position: absolute;
        right: -13px;
        bottom: -13px;
        width: 44px;
        height: 44px;
        box-sizing: border-box;
        padding: 0;
        border: none;
        background: transparent;
        cursor: pointer;
      }
      .st-ring-plus-button .st-ring-plus {
        right: 11px;
        bottom: 11px;
        pointer-events: none;
      }
      .st-ring-name {
        max-width: 64px;
        overflow: hidden;
        font-size: 12px;
        font-weight: 500;
        line-height: 1.25;
        white-space: nowrap;
        text-overflow: ellipsis;
        color: var(--foreground);
      }

      /* ── LE LECTEUR PLEIN ÉCRAN ───────────────────────────────────────── */
      /* Le cadre. Au telephone il prend tout ; sur le bureau il devient un
         rectangle 9:16 centre — un media vertical etale sur 1600 px ne se
         regarde pas, et le noir qui l'entourerait serait la moitie de l'ecran. */
      .st-viewer {
        display: flex;
        flex: 1 1 auto;
        min-height: 0;
        width: 100%;
        align-items: center;
        justify-content: center;
      }
      .st-frame {
        position: relative;
        width: 100%;
        height: 100%;
        overflow: hidden;
      }
      @media (min-width: 768px) {
        .st-viewer { padding: 16px; }
        .st-frame {
          width: auto;
          height: min(100%, 92dvh);
          aspect-ratio: 9 / 16;
          max-width: 100%;
          border-radius: 18px;
        }
      }
      /* La scene : le fond derriere un media qui ne remplit pas le cadre. */
      .st-stage {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
      }
      /* contain, jamais cover : rogner une story coupe la moitie de ce que la
         personne a cadre — le media EST le contenu. */
      .st-media {
        width: 100%;
        height: 100%;
        object-fit: contain;
      }
      /* Le plat est une référence commerciale : sa photo remplit la scène,
         tandis que les médias personnels gardent le cadrage de leur auteur. */
      .st-media.st-daily-special-media { object-fit: cover; }
      .st-daily-special-card {
        display: grid;
        min-width: 0;
        gap: 8px;
        padding: 14px 16px;
        border-radius: var(--ui2-card-radius, 16px);
        background: var(--card);
        color: var(--card-foreground);
        box-shadow: var(--shadow-lg, none);
        overflow-wrap: anywhere;
      }
      .st-daily-special-heading {
        display: flex;
        min-width: 0;
        flex-wrap: wrap;
        align-items: center;
        gap: 4px 10px;
      }
      .st-daily-special-label {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--role-commerce-ink, var(--primary));
      }
      .st-daily-special-shop {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 12px;
        font-weight: 500;
        color: var(--muted-foreground);
      }
      .st-daily-special-title {
        display: -webkit-box;
        margin: 0;
        overflow: hidden;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
        font-size: 20px;
        font-weight: 700;
        line-height: 1.2;
      }
      .st-daily-special-footer {
        display: flex;
        min-width: 0;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 8px 12px;
      }
      .st-daily-special-price {
        margin: 0;
        font-size: 20px;
        font-weight: 700;
        line-height: 1.2;
        color: var(--role-commerce-ink, var(--foreground));
      }
      .st-daily-special-order {
        display: inline-flex;
        min-width: 44px;
        min-height: 44px;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 8px 14px;
        border-radius: var(--ui2-button-radius, 12px);
        background: var(--role-commerce-fill, var(--primary-fill));
        color: var(--role-commerce-on, var(--primary-fill-on, var(--on-fill)));
        font-size: 13px;
        font-weight: 700;
        line-height: 1.2;
        text-decoration: none;
      }
      .st-daily-special-order:focus-visible { outline: 2px solid var(--ring); outline-offset: 3px; }
      .st-daily-special-expiry {
        margin: 0;
        font-size: 11px;
        line-height: 1.3;
        color: var(--muted-foreground);
      }
      /* Le voile de lisibilite. Il ne capte AUCUN geste : les taps doivent
         atteindre la scene, qui les traduit en precedent/suivant. */
      .st-shade {
        position: absolute;
        inset: 0;
        pointer-events: none;
      }

      /* La barre de progression segmentee, tout en haut du cadre. */
      .st-progress {
        position: absolute;
        top: 0;
        right: 0;
        left: 0;
        z-index: 2;
        display: flex;
        gap: 3px;
        padding: 10px 10px 0;
      }
      .st-progress-seg {
        flex: 1 1 0;
        height: 3px;
        overflow: hidden;
        border-radius: 999px;
      }
      .st-progress-head {
        height: 100%;
        width: 0;
        border-radius: 999px;
      }

      /* Les deux bandeaux d'information. Ils vivent AU-DESSUS du voile, et
         leurs enfants interactifs seuls reprennent les evenements pointeur :
         un bandeau plein largeur qui les capterait tous rendrait le tiers
         superieur de l'ecran insensible au tap. */
      .st-overlay {
        position: absolute;
        right: 0;
        left: 0;
        z-index: 3;
        display: flex;
        pointer-events: none;
        /* Encre posée SUR le média : elle ne bascule pas avec le thème (le
           jeton de scene, cf. globals.css). var(--background) valait du navy
           en sombre, et l'auteur se lisait alors en sombre sur la photo. */
        color: var(--esp-immersive-on-ink);
      }
      .st-overlay > * { pointer-events: auto; }
      .st-overlay-top {
        top: 0;
        align-items: center;
        gap: 10px;
        padding: 22px 12px 12px;
      }
      .st-overlay-bottom {
        bottom: 0;
        flex-direction: column;
        gap: 10px;
        align-items: stretch;
        padding: 12px 14px calc(14px + env(safe-area-inset-bottom, 0px));
      }
      .st-author {
        display: flex;
        min-width: 0;
        flex: 1 1 auto;
        align-items: center;
        gap: 9px;
        text-decoration: none;
        color: inherit;
      }
      .st-author-name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 14px;
        font-weight: 700;
      }
      /* Ce qui se COMPTE se lit en chasse fixe — signature typographique de
         l'espace, tenue jusqu'ici. */
      .st-author-age {
        font-family: var(--font-mono);
        font-size: 11.5px;
        font-variant-numeric: tabular-nums;
        opacity: 0.85;
      }
      .st-caption {
        margin: 0;
        font-size: 14px;
        line-height: 1.45;
        overflow-wrap: anywhere;
      }
      /* Les commandes du bandeau. Leur FOND est translucide pour rester
         lisible sur un media clair comme sur un media sombre — valeur
         COMPOSEE, donc portee par .esp-story-chip (globals.css) et jamais
         d'ici : ce fichier ne declare aucune couleur composee. */
      .st-chip {
        display: inline-flex;
        min-height: 44px;
        min-width: 44px;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 8px 12px;
        border: none;
        border-radius: 999px;
        font: inherit;
        font-size: 12.5px;
        font-weight: 700;
        cursor: pointer;
      }
      .st-chip:focus-visible {
        outline: 2px solid var(--esp-immersive-on-ink);
        outline-offset: 2px;
      }

      /* ── LA CARTE D'UN DIRECT ─────────────────────────────────────────── */
      .st-live {
        display: flex;
        height: 100%;
        width: 100%;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 14px;
        padding: 24px;
        text-align: center;
        color: var(--esp-immersive-on-ink);
      }
      .st-live-pill {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        padding: 5px 12px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      /* Le point qui bat. Une seule propriete animee (opacity), et le battement
         s'arrete si la personne a demande moins de mouvement. */
      .st-live-dot {
        width: 7px;
        height: 7px;
        border-radius: 999px;
        background: currentColor;
        animation: st-pulse 1.6s ease-out infinite;
      }
      @keyframes st-pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.35; }
      }
      @media (prefers-reduced-motion: reduce) {
        .st-live-dot { animation: none; }
      }
      .st-live-title {
        margin: 0;
        font-size: 20px;
        font-weight: 800;
        line-height: 1.25;
        overflow-wrap: anywhere;
      }
      .st-live-host {
        margin: 0;
        font-size: 13.5px;
        opacity: 0.88;
      }
      .st-live-counter {
        margin: 0;
        font-family: var(--font-mono);
        font-size: 12px;
        font-variant-numeric: tabular-nums;
        opacity: 0.8;
      }

      /* ── L'ÉTAT VIDE ──────────────────────────────────────────────────── */
      .st-empty {
        display: flex;
        height: 100%;
        width: 100%;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 12px;
        padding: 24px;
        text-align: center;
        color: var(--foreground);
      }
      .st-empty-title {
        margin: 0;
        font-size: 17px;
        font-weight: 700;
      }
      .st-empty-text {
        margin: 0;
        max-width: 34ch;
        font-size: 13.5px;
        line-height: 1.5;
        color: var(--muted-foreground);
      }

      /* Le chip « Lire la video » — l'autoplay a ete refuse, la video attend
         un geste. Centre sur la scene, au-dessus du media, sous l'overlay. */
      .st-play {
        position: absolute;
        inset: 0;
        margin: auto;
        width: max-content;
        height: max-content;
        z-index: 2;
      }

      /* ── LE COMPOSEUR EN CARTE COMPACTE (bureau) ─────────────────────────
         Une carte LIBRE, pas un 9:16 strict : c'est un formulaire — le ratio
         pense pour du media n'achete rien ici, et l'apercu du media dans la
         carte est deja en 9:16. Jetons de :root uniquement : la surface est
         portalisee hors du noeud de charte (meme regle que les .st-*). */
      .st-compose-frame {
        display: flex;
        flex-direction: column;
        width: min(430px, 100%);
        max-height: min(760px, 92dvh);
        overflow: hidden;
        border-radius: 18px;
        border: 1px solid var(--border);
        background: var(--background);
      }
`

export function StoriesStyles() {
  return (
    <style href="stories" precedence="default">
      {STORIES_CSS}
    </style>
  )
}
