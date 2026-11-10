// Dupliqué de socle/packages/agent-features/src/features/reseau-personnel/ReseauAgentPage.tsx @ ad2e7fdc2 — adaptations : RÉÉCRIT pour la page réseau du moteur, déplacée dans la coque (`shell/`) — l'accueil de l'application (`useRoutes().home()`, volets par `reseau-agent-nav`), sans l'espace agent : orchestration des volets, bascule téléphone/bureau, carte d'identité épinglée, onglets « chemise », outils du fil, stories, composeurs et rails GARDÉS ; volet « Conférences » et dialogue branchés au moteur `live` (F3a), rail avancé différé ; volet Pages et rail « Pages à suivre » par les composants RÉÉCRITS sur les pages du moteur ; rail droit ouvert par la carte iCom (`MessagerieDock`) ; grille sans le rail de l'hôte — le menu vertical (`ReseauMenuRail`) est la navigation dès 812 px de conteneur et les trois colonnes tiennent dès 1 108 px (paliers du socle « rail rétracté », plus aucune lecture de `[data-espace-rail]`), la porte iCom compacte s'efface au seul palier où la carte est visible ; feuille sortie du JSX dans une constante de module (`RESEAU_DESKTOP_CSS`) — un littéral enfant de `<style>` passerait pour une chaîne d'interface — avec la cadence des blocs en valeur (`--sp-4`, jeton absent du moteur, retiré) ; onglets « chemise » et feuille du kit d'espace par `@antsia/ui/espace-kit` ; identifiants de la tablist `reseau-panel` / `reseau-tab-` (plus d'iProfil) ; volet Évènements monté sans `onCreateEvent` — l'intention de composition d'iAgenda (absent du moteur) n'existe plus et le catalogue de création mène l'évènement au volet lui-même : un bouton qui y renverrait tournerait en rond ; lecteur des statuts sur `useRoutes().stories()` (paramètre `auteur`), surfaces `reseau` du plateau retirées ; ma fiche lue sur la personne du moteur (identifiant seulement PUBLIÉ, portrait servi par la garde) ; résultats de recherche clés sur `_id` ; textes par l'i18n (`reseau:reseauAgentPage.*`, volets et portées par leurs clés, `t` passé aux modules purs) ; « iRéseau » devient « réseau » ; commentaires rapportés au moteur ; P02 (18/10/2026) : le rail-menu reçoit le geste de création du lieu (`onCreate`), lu seulement sous la navigation par destinations déclarée par l'application ; P04 (18/10/2026) : quand l'application déclare le fil immersif, le fil et ses mots-clés reçoivent une bascule Liste/Immersion dans les outils du fil (Liste par défaut au bureau, choix mémorisé par réseau) et l'Immersion monte le lecteur immersif DANS la colonne de lecture, à la place de la liste, avec la même chaîne de pages — rail, volets et colonne d'iCom inchangés. Système épuré (ADR-0027) : loupe de recherche en rond gris sans filet (`--esp-header-icon-bg`, `--esp-chip-border`), cerclage d'origine en repli ; aplats d'identité et leur texte selon les chartes (`--esp-identity-fill`, `--primary-fill-on`, pastille tonale des états actifs ; ADR-0027), facture d'origine en repli.
"use client"

/**
 * **La page réseau** — le fil et ses volets, accueil de l'application.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DEUX MOUVEMENTS SUCCESSIFS, ET CE QUE CHACUN A TRANCHÉ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * **Le 2026-08-06 — la fusion des volets, qui TIENT.** « Accueil » (le fil) et
 * « Mon réseau » (les relations) étaient deux pages. Elles n'en font plus
 * qu'une : le fil, les relations, les groupes, les pages, les évènements et
 * les signets sont des VOLETS d'un même lieu.
 *
 * La fusion n'empile pas les relations sous le fil : ce qui est sous un fil
 * infini n'existe pas. Elle rend la bascule VISIBLE et adressable :
 *
 *  · la bascule est rendue à TOUS les paliers (onglets, ou menu vertical) ;
 *  · chaque volet a son adresse (`?tab=relations`), donc un lien se partage ;
 *  · aucun panneau ne s'affiche deux fois — `railPanelsFor` retire du rail ce
 *    que la colonne porte déjà.
 *
 * **Le 2026-08-12 — la séparation du NOM.** Cette page s'appelle le
 * **Réseau** ; l'identité de la personne a sa propre page (son profil), et la
 * carte épinglée y mène.
 *
 * ── Ce qui se décide ailleurs ─────────────────────────────────────────────
 * Ce qui reste dans le corps d'un composant n'est vérifiable qu'à l'œil. Les
 * volets, leurs alias, la répartition colonne/rails vivent donc dans
 * `reseau-agent-nav.ts` ; les volets SERVIS dans `reseau-menu.ts` ; les seuils
 * et l'entrelacement dans `reseau-layout.ts` ; la pagination dans
 * `reseau-feed-pages.ts`. Tous testés.
 *
 * ── Colonne de lecture + rails, mesurés sur le CONTENEUR ──────────────────
 * Un seuil mesuré sur le viewport ment dès qu'un chrome confisque une partie
 * de la largeur. Les seuils sont donc des `@container`.
 *
 * ⚠️ `container-type: inline-size` implique `contain: layout` : tout descendant
 * en `position: fixed` serait cadré sur CETTE boîte au lieu du viewport.
 * `SharePostDialog` en est un — il passe par un portail vers `document.body`,
 * et c'est un PRÉREQUIS de cette grille, pas un détail.
 *
 * ⚠️ Dans la pose HISTORIQUE, les colonnes défilent chacune pour soi : la page
 * se monte dans un conteneur de hauteur définie. U02, sous opt-in adaptatif,
 * conserve le document comme défileur des pages ordinaires ; le lecteur immersif
 * garde son défileur dédié. Les deux feuilles ne changent pas le même consommateur.
 *
 * ── Le 2026-08-19 — en-tête compacte et onglets « chemise » ───────────────
 * Les volets sont rendus par `EspaceDossierTabs` (le kit d'espace,
 * `@antsia/ui/espace-kit`) dans cette colonne — coins hauts arrondis, l'onglet actif
 * fusionne avec le panneau qui suit par un débord d'un pixel.
 * `ProfileMiniCard` ne porte que l'identité, et sa bannière disparaît
 * (`cover={showCover(...)}`, `reseau-header.ts`). Sous les onglets, une carte
 * `.rp-volet-head` titre et décrit le volet ouvert et, sur le fil UNIQUEMENT,
 * porte la recherche et la portée.
 */

import { useNetwork, useNetworkNavigationLayout, useRoutes } from "@antsia/api/network"
import { Alert, Button, Select, SkeletonCard, TextInput } from "@antsia/ui"
import { EspaceDossierTabs, EspaceKitStyles } from "@antsia/ui/espace-kit"
import { Search } from "lucide-react"
import { Suspense, useCallback } from "react"
import { useTranslation } from "react-i18next"

import { MessagerieDock } from "../features/messagerie/MessagerieDock"
import { FeedComposerPrompt } from "./FeedComposerPrompt"
import { BookmarksPanel } from "../features/reseau-personnel/BookmarksPanel"
import { EvenementsPanel } from "../features/reseau-personnel/EvenementsPanel"
import { EvenementsRail } from "../features/reseau-personnel/EvenementsRail"
import { chipsVisibleFor, FEED_SCOPE_CHIPS, feedScopeById, parseFeedScope } from "../features/reseau-personnel/feed-scopes"
import { EmptyFeed, FeedPage } from "../features/reseau-personnel/FeedPages"
import { GroupsPanel } from "../features/reseau-personnel/GroupsPanel"
import { PagesPanel } from "../features/reseau-personnel/PagesPanel"
import { PagesSuggestionsRail } from "../features/reseau-personnel/PagesSuggestionsRail"
import { PeoplePanel } from "../features/reseau-personnel/PeoplePanel"
import { PostCard } from "../features/reseau-personnel/PostCard"
import { ProfileMiniCard } from "../features/reseau-personnel/ProfileMiniCard"
import { appendPage, feedCursorKey, loadMoreAnnouncement, shouldShowLoadMore } from "../features/reseau-personnel/reseau-feed-pages"
import { emptyFeedText, formatUnreadBadge, searchStatusText } from "../features/reseau-personnel/shared"
import { SuggestionsPanel } from "../features/reseau-personnel/SuggestionsPanel"
import { DirectsLiveRail } from "../features/direct/DirectsLiveRail"
import { DirectsPanel } from "../features/direct/DirectsPanel"
import { FeedListReturn } from "../features/feed-immersion/FeedListReturn"
import { FeedModeToggle } from "../features/feed-immersion/FeedModeToggle"
import { FeedSurfaceMemoryProvider } from "../features/feed-immersion/feed-post-memory"
import { ImmersiveFeedReader } from "../features/feed-immersion/ImmersiveFeedReader"
import { useFeedImmersion } from "../features/feed-immersion/use-feed-immersion"

import { useCreationController } from "../features/reseau-personnel/use-creation-controller"
import { useReseauFeedState } from "../features/reseau-personnel/useReseauFeedState"
// Import DIRECT des symboles (et non de l'index de la tranche `stories`) : le
// lecteur plein écran, son pager et son composeur n'ont rien à faire dans le
// bundle du fil.
import { StoriesTray } from "../features/stories/StoriesTray"
import { markStoriesOpenedFromApp } from "../features/stories/stories-entry"
import { StoriesStyles } from "../features/stories/stories-styles"
import { StoryCreateSheet } from "../features/stories/StoryCreateSheet"
import { PostComposerSheet } from "./mobile/PostComposerSheet"
import { ReseauMobilePage } from "./mobile/ReseauMobilePage"
import { mainPanelFor, parseReseauAgentTab, RESEAU_AGENT_TABS, railPanelsFor, reseauAgentTabById } from "./reseau-agent-nav"
import { RESEAU_HEADER_VARIANT, showCover } from "./reseau-header"
import {
  invitationsBannerLabel,
  shouldSurfaceInvitations,
  suggestionsInterleaveIndex,
  viewHeading,
  viewNeedsReturn,
  viewReturnLabel,
} from "./reseau-layout"
import { isServedReseauTab, servedReseauTab } from "./reseau-menu"
import { ReseauDesktopIcomLink } from "./ReseauDesktopIcomLink"
import { ReseauMenuRail } from "./ReseauMenuRail"
import { RESEAU_ADAPTIVE_CSS } from "./reseau-adaptive-styles"
import { useLinkedColumnScroll } from "./use-linked-column-scroll"

/** Le paramètre du lecteur plein écran qui positionne l'entrée sur un auteur. */
const STORIES_AUTHOR_PARAM = "auteur"

/** Les identifiants de la tablist et du panneau qu'elle commande. */
const PANEL_ID = "reseau-panel"
const TAB_ID_PREFIX = "reseau-tab-"

/**
 * La feuille de la page, hors du JSX : un littéral enfant de `<style>`
 * passerait pour une chaîne d'interface (cliquet `no-hardcoded-strings`).
 * Jetons de la charte seulement, aucune couleur littérale.
 *
 * Les seuils sont redéclarés ici : une propriété personnalisée CSS est
 * illégale dans une condition `@container`. Leurs valeurs et leur
 * justification vivent dans `reseau-layout.ts`, où elles sont testées.
 *
 * (Aucun accent grave dans cette feuille : il fermerait le littéral gabarit.)
 */
export const RESEAU_DESKTOP_CSS = `
        .rp-scope {
          /* Contrat visuel du bureau : une seule cadence entre les blocs et
             un seul rayon pour toutes les surfaces de premier niveau. */
          --rp-stack-gap: 16px;
          /* Le rayon des surfaces vient de la charte (--rp-surface-radius,
             18 px par défaut, redéclarable par un thème) : il n'est plus fixé ici. */
          container-type: inline-size;
          container-name: rp-page;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          /* OBLIGATOIRE, et ce n'est pas décoratif : ce noeud est le BLOC
             CONTENEUR des scrollers de la page. Le défilement vit dans ses
             COLONNES (.rp-main-col, .rp-rail-start et .rp-rail-end défilent
             chacune pour soi, .rp-grid porte le repli une-colonne) — mais tout
             descendant en position absolue (les sr-only du fil) résout contre
             le premier ancêtre positionné : sans cette règle, il résoudrait
             contre le bloc conteneur initial, échapperait à tout rognage et
             rallongerait la hauteur du DOCUMENT (mesuré au socle : 1553 px
             pour une fenêtre de 760). container-type ne suffit PAS : le
             contain calculé reste none, il n'établit aucun bloc conteneur. */
          position: relative;
          /* Plus de respiration en bas ICI : le scope ne défile pas, ce sont
             ses colonnes qui la portent (padding-bottom: 48px chacune). */
          padding: 12px 14px 0;
        }
        /* La barre de profil coiffe la colonne centrale, ÉPINGLÉE en tête :
           elle porte le geste de publication, qui ne peut donc pas dépendre de
           la position de défilement. Trois conditions, toutes nécessaires : un
           fond OPAQUE (sans lui les publications défilent en transparence sous
           la carte), un z-index au-dessus du fil mais sous les surfaces
           flottantes (dock 55, overlays 60), et une marge haute nulle — un
           liseré de contenu passerait sinon dans l'interstice. */
        .rp-identity-region {
          position: sticky;
          top: 0;
          z-index: 3;
          display: flex;
          flex-wrap: wrap;
          align-items: flex-start;
          gap: var(--rp-stack-gap);
          width: 100%;
          margin: 0 0 var(--rp-stack-gap);
          padding-top: 0;
          background: var(--background);
        }
        .rp-identity-main { flex: 1 1 520px; min-width: 0; }
        /* Un rail sans module disponible ne doit pas laisser de colonne vide. */
        .rp-identity-aside:empty { display: none; }
        /* La colonne centrale : identité puis volet, un seul scroller. */
        .rp-main-col {
          display: flex;
          flex-direction: column;
          width: 100%;
          max-width: 792px;
          margin-inline: auto;
          min-width: 0;
          min-height: 0;
        }
        /* R-15 · une largeur de lecture par TÂCHE. 792 px est la largeur d'un
           ARTICLE. Une collection — relations, pages, groupes, signets — n'est
           pas un article. Le fil, lui, ne bouge pas. Valeur :
           COLLECTION_COLUMN_MAX (reseau-layout.ts). */
        .rp-main-col[data-volet="relations"],
        .rp-main-col[data-volet="pages"],
        .rp-main-col[data-volet="groupes"],
        .rp-main-col[data-volet="enregistrements"] {
          max-width: 1120px;
        }
        .rp-tabs {
          display: flex;
          gap: 4px;
          overflow-x: auto;
          scrollbar-width: none;
        }
        .rp-tabs::-webkit-scrollbar { display: none; }
        .rp-grid {
          display: grid;
          gap: var(--rp-stack-gap);
          grid-template-columns: minmax(0, 1fr);
          align-items: start;
          max-width: 1120px;
          margin-inline: auto;
          width: 100%;
          /* Sur une colonne, la PAGE défile ici (le scope, lui, est fermé) ;
             aux paliers à plusieurs colonnes, chaque colonne prend le sien. */
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          padding-bottom: 48px;
        }
        .rp-rail-start, .rp-rail-end {
          display: none;
          flex-direction: column;
          gap: var(--rp-stack-gap);
        }
        .rp-main {
          display: flex;
          min-width: 0;
          flex-direction: column;
          gap: var(--rp-stack-gap);
        }
        /* Petite gouttière pour la tablist du kit : .esk-tabs la pose déjà,
           mais un sélecteur à deux classes l'assure quel que soit l'ordre de
           cascade entre la feuille du kit et celle-ci. */
        .rp-main > .rp-tabs { padding: 0 8px; }
        /* La carte de tête du volet ouvert. Rayon CONSTANT : la fusion
           visuelle avec l'onglet actif se fait par le débord d'un pixel de
           l'onglet, jamais en cassant un angle ici. */
        .rp-volet-head {
          border-radius: var(--rp-surface-radius);
          padding: 18px 20px;
        }
        /* La rangée des stories réserve un peu d'air à son anneau mobile. Dans
           la pile du bureau, ce padding s'ajoutait au gap du parent. */
        .rp-scope .st-tray { padding-block: 0; }
        .rp-scope .st-card,
        .rp-scope .st-tray-tile:focus-visible {
          border-radius: var(--rp-surface-radius);
        }
        /* Le FIL a ses outils : titre, recherche et portée tiennent sur UNE
           ligne. Les autres volets gardent le régime titre + phrase. */
        .rp-volet-head[data-tools="true"] {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 10px 12px;
          padding: 10px 14px;
        }
        .rp-volet-title {
          margin: 0;
          font-size: 18px;
          font-weight: 700;
          letter-spacing: -.01em;
          color: var(--ink-900);
        }
        /* Sur la ligne d'outils, le titre n'est plus un en-tête de page mais
           l'étiquette de la rangée : l'onglet actif dit déjà où l'on est. */
        .rp-volet-head[data-tools="true"] .rp-volet-title {
          flex: 0 0 auto;
          font-size: 15px;
        }
        .rp-volet-desc {
          margin: 6px 0 0;
          font-size: 13.5px;
          line-height: 1.55;
          color: var(--ink-600);
        }
        .rp-feed-tools {
          display: flex;
          flex: 1 1 340px;
          min-width: 0;
          align-items: center;
          gap: 10px;
        }
        /* Chercher et filtrer sont le MÊME geste — décider ce qu'on regarde.
           L'enroulement les sépare quand la largeur ne suffit plus. */
        .rp-feed-tools-row {
          display: flex;
          flex: 1 1 auto;
          flex-wrap: wrap;
          align-items: center;
          min-width: 0;
          gap: 10px;
        }
        .rp-search-form {
          display: flex;
          flex: 1 1 200px;
          min-width: 0;
        }
        .rp-search-field {
          position: relative;
          flex: 1 1 auto;
          min-width: 0;
        }
        /* La loupe vit DANS le champ. La cible reste à 44 px pour le tactile,
           tandis que le champ garde assez de retrait pour que le texte ne
           passe jamais sous le bouton. */
        .rp-search-submit {
          position: absolute;
          top: 50%;
          right: 4px;
          transform: translateY(-50%);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 44px;
          min-width: 44px;
          min-height: 44px;
          padding: 0;
        }
        /* Le sélecteur de portée : un select NATIF, et c'est un choix — sa
           liste est rendue par le système, donc hors du conteneur .rp-scope,
           qui porte container-type et cadrerait tout popup positionné. */
        .rp-scope-select {
          flex: 0 0 auto;
          min-width: 0;
          max-width: 210px;
        }
        .rp-scopes {
          display: flex;
          flex: 0 1 auto;
          min-width: 0;
          gap: 8px;
          overflow-x: auto;
          padding: 2px 0;
          scrollbar-width: none;
        }
        .rp-scopes::-webkit-scrollbar { display: none; }
        .rp-scope-chip {
          flex: 0 0 auto;
          min-height: 44px;
          padding: 7px 15px;
          border: 1px solid var(--ink-300);
          border-radius: 999px;
          background: var(--ink-0);
          color: var(--ink-700);
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
        }
        .rp-scope-chip:hover { border-color: var(--ink-500); }
        /* --primary-fill et NON --primary-600 : le premier est le REMPLISSAGE
           primaire, apparié à --on-fill ; le second est une couleur de TEXTE,
           et l'échelle s'inverse en thème sombre. */
        .rp-scope-chip[aria-pressed="true"] {
          border-color: var(--primary-fill);
          background: var(--primary-fill);
          color: var(--primary-fill-on, var(--on-fill));
        }
        .rp-scope-note {
          margin: 8px 2px 0;
          font-size: 12.5px;
          line-height: 1.5;
          color: var(--ink-600);
        }
        /* Le rail droit n'apparaît que si le fil garde sa largeur de lecture.
           En dessous, les mêmes lieux restent atteignables par les onglets ou
           le menu : aucune colonne secondaire ne vient écraser la lecture. Les
           suggestions intercalées dans le fil ne servent que la coquille
           mobile (.rm-scroll .rp-feed-inline). */
        .rp-feed-inline { display: none; }
        /* À partir de ce palier, chaque colonne défile pour soi : lire le fil
           sans perdre la messagerie, dérouler les suggestions sans bouger le
           fil. Valeur : TWO_COLUMN_MIN (reseau-layout.ts). */
        @container rp-page (min-width: 1008px) {
          .rp-grid {
            grid-template-columns: minmax(680px, 792px) 312px;
            grid-template-rows: minmax(0, 1fr);
            align-items: stretch;
            height: 100%;
            overflow: hidden;
            padding-bottom: 0;
          }
          .rp-main-col {
            overflow-y: auto;
            min-height: 0;
            padding-bottom: 48px;
          }
          .rp-grid .rp-rail-end {
            display: flex;
            overflow-y: auto;
            /* Rythme constant entre iCom, découverte, pages et évènements. */
            row-gap: var(--rp-stack-gap);
            /* Le rail ne doit jamais devenir un scroller horizontal quand un
               contenu asynchrone (un nom iCom long) arrive. */
            overflow-x: hidden;
            min-height: 0;
            max-height: 100%;
            padding-bottom: 48px;
          }
        }
        /* Le menu vertical REMPLACE la tablist dès que la colonne de lecture
           garde sa largeur à côté de lui, et la grille utilise toute la
           largeur de la page — aucun rail d'hôte ne la confisque ici.
           Valeur : COLLAPSED_NAV_MIN (reseau-layout.ts). Le rail droit se
           retire jusqu'au palier suivant : navigation et lecture priment sur
           la découverte. */
        @container rp-page (min-width: 812px) {
          .rp-grid {
            grid-template-columns: minmax(176px, 224px) minmax(620px, 792px);
            max-width: 1032px;
          }
          .rp-rail-start {
            display: flex;
            overflow-y: auto;
            min-height: 0;
            padding-bottom: 48px;
          }
          .rp-grid .rp-rail-end {
            display: none;
          }
          /* Deux classes sur la tablist : la feuille du kit pose elle aussi
             display:flex et peut être hissée après cette feuille par React. */
          .rp-main .rp-tabs {
            display: none;
          }
        }
        /* Le menu, le fil et la découverte tiennent tous les trois.
           Valeur : COLLAPSED_THREE_COLUMN_MIN (reseau-layout.ts). */
        @container rp-page (min-width: 1108px) {
          .rp-grid {
            grid-template-columns: minmax(176px, 224px) minmax(620px, 792px) minmax(280px, 312px);
            max-width: 1360px;
          }
          .rp-grid .rp-rail-end {
            display: flex;
          }
          /* Le rail porte la vraie surface iCom. La porte compacte de
             l'identité reste un secours aux paliers où le rail est retiré,
             jamais un doublon au palier où la carte est visible. */
          .rp-desktop-icom-link { display: none !important; }
        }
        @media (min-width: 960px) {
          .rp-scope { padding: 14px 16px 0; }
        }
        /* Filet de sécurité sur viewport étroit : la container query mesure le
           CONTENEUR, qui peut être large alors que la fenêtre ne l'est pas. */
        @media (max-width: 959px) {
          .rp-grid {
            grid-template-columns: minmax(0, 1fr);
          }
        }
      `

/** `useSearchParams` (via `useTabQueryState`) impose la frontière Suspense. */
export function ReseauAgentPage() {
  return (
    <Suspense fallback={null}>
      <ReseauAgentPageSwitch />
    </Suspense>
  )
}

/**
 * Quelle coquille monter — et la troisième réponse compte autant que les deux
 * autres.
 *
 * ⚠️ `mobile === null` ne rend NI l'un NI l'autre arbre. Rendre celui du
 * bureau « en attendant » aurait deux prix, tous deux payés à chaque
 * chargement au téléphone : le premier écran serait la mise en page à trois
 * colonnes, remplacée un rendu plus tard ; et les abonnements de
 * `useReseauFeedState` seraient ouverts puis refermés pour rien. Une ossature
 * n'affirme rien et n'abonne rien.
 *
 * ⚠️ La bascule vit AU-DESSUS de `useReseauFeedState`, jamais dedans : les deux
 * arbres partagent le hook, ils ne le montent pas ensemble.
 */
function ReseauAgentPageSwitch() {
  const { adaptive, mobile } = useNetworkNavigationLayout()
  const creation = useCreationController()
  if (mobile === null) {
    return (
      <div style={{ display: "grid", gap: 16, padding: "12px 14px" }}>
        <SkeletonCard />
        <SkeletonCard />
      </div>
    )
  }
  return (
    <>
      {mobile ? <ReseauMobilePage /> : <ReseauAgentPageInner adaptive={adaptive} />}
      {/* Le champ de fichier doit survivre au remplacement de la coquille,
          notamment quand le sélecteur natif est encore ouvert. */}
      <PostComposerSheet open={creation.open === "publication"} onClose={creation.close} />
    </>
  )
}

function ReseauAgentPageInner({ adaptive }: { adaptive: boolean }) {
  const { centerRef, contextRef, composerRef, toolsRef } = useLinkedColumnScroll(adaptive)
  const { liveAvailable } = useNetwork()
  const { t } = useTranslation("reseau")
  const routes = useRoutes()
  const {
    now,
    router,
    tab,
    view,
    setView,
    searchDraft,
    setSearchDraft,
    groupSeed,
    scope,
    pages,
    setPages,
    announcement,
    setAnnouncement,
    reportTail,
    rebaseAfterPage,
    search,
    focused,
    connections,
    follows,
    myProfile,
    goToTab,
    goToScope,
    openTag,
    openTagFromGroups,
    openMention,
    openSearch,
    backToFeed,
    /* R-13 : la page d'un groupe est un LIEU — le volet n'ouvre ni ne ferme
       plus rien tout seul, il DEMANDE l'adresse. */
    openGroup,
    closeGroup,
    tailCursor,
    pendingCount,
    onboardingUrgent,
  } = useReseauFeedState()

  /* Le volet MONTRÉ : un volet que la page ne sert pas (« Conférences », en
     attente du module `live`) aboutit au fil plutôt qu'à un écran vide. La
     colonne, les rails, le titre et les outils du fil en dérivent. */
  const shownTab = servedReseauTab(tab)
  const main = mainPanelFor(shownTab)
  const rails = railPanelsFor(shownTab)
  const currentTab = reseauAgentTabById(shownTab)
  /* Les outils et la note de portée s'affichent ensemble ou pas du tout : une
     note de portée sans sa rangée décrirait un filtre invisible. */
  const showChips = chipsVisibleFor(shownTab, view)
  const heading = viewHeading(view, t)

  // Ma fiche : un identifiant ne sert au plateau des stories que PUBLIÉ.
  const person = myProfile.data
  const myHandle = person?.published === true ? (person.handle ?? null) : null

  /**
   * Les surfaces de CRÉATION — publication, actu — vivent dans leur propre
   * contrôleur (`use-creation-controller.ts`) : ouvrir l'une d'elles ne touche
   * à aucun état de navigation, donc le volet ouvert, la recherche en cours,
   * le mot-clic et la hauteur de défilement survivent à l'ouverture comme à
   * l'annulation (R-01). Les composeurs s'ouvrent EN PLACE (cartes
   * flottantes) : un formulaire n'a pas besoin d'une page.
   */
  const creation = useCreationController()

  /*
   * P04 — le fil IMMERSIF, quand l'application le déclare : le fil et ses
   * mots-clés seulement ; Liste par défaut au bureau, l'Immersion se choisit
   * dans les outils du fil. `null` sans déclaration : rien ne change.
   */
  const feedId = main !== "feed" ? null : view.kind === "feed" ? `fil:${scope}` : view.kind === "tag" ? `fil:${scope}:tag:${view.tag}` : null
  const immersion = useFeedImmersion({ feedId, depth: pages.cursors.length })
  const canLoadMore = shouldShowLoadMore(pages, tailCursor)
  const loadMore = useCallback(() => {
    setPages((state) => appendPage(state, tailCursor))
  }, [setPages, tailCursor])

  /* Les morceaux de la tête du fil, rendus tels quels en liste et repris en
     premier créneau du lecteur en immersion (P04) : la vue en cours et son
     retour, l'invitation reçue, la rangée des actus. */
  const feedHeading =
    heading !== null ? (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <span style={{ fontSize: 13, color: "var(--ink-700)" }}>
          {view.kind === "search" ? searchStatusText(view.query, search.data?.items.length ?? 0, search.isLoading, t) : heading}
        </span>
        {viewNeedsReturn(view) ? (
          <Button variant="ghost" size="sm" icon="arrowLeft" onClick={backToFeed}>
            {viewReturnLabel(view, t)}
          </Button>
        ) : null}
      </div>
    ) : null

  /* Une invitation reçue est une action attendue DE MOI : elle ne dort pas
     derrière un volet qu'il faut penser à ouvrir. */
  const invitationsBanner =
    view.kind === "feed" && shouldSurfaceInvitations(pendingCount) ? (
      <Alert tone="info" title={invitationsBannerLabel(pendingCount ?? 0, t)}>
        <Button variant="secondary" size="sm" icon="users" onClick={() => goToTab("relations")}>
          {t("reseauAgentPage.seeRequests")}
        </Button>
      </Alert>
    ) : null

  /* ── Les STORIES : la MÊME rangée qu'au téléphone, au même endroit
     relatif — en tête du fil. Une rangée qui n'existerait qu'au téléphone
     ferait disparaître les stories de la moitié des usages. */
  const storiesRow =
    view.kind === "feed" ? (
      <>
        <StoriesStyles />
        <StoriesTray
          myHandle={myHandle}
          myAvatarUrl={person?.avatar?.url ?? null}
          now={now}
          onOpen={(handle) => {
            markStoriesOpenedFromApp()
            const base = routes.stories()
            router.push(handle === null ? base : `${base}?${new URLSearchParams({ [STORIES_AUTHOR_PARAM]: handle }).toString()}`)
          }}
          // Au bureau, créer OUVRE la carte compacte en place —
          // naviguer plein écran pour un formulaire était le défaut
          // signalé le 2026-08-20.
          onCreate={() => creation.openCreation("actu")}
        />
      </>
    ) : null

  /*
   * Une CHAÎNE de pages montées : chacune porte son curseur et son propre
   * abonnement, donc les hooks restent hors de toute boucle conditionnelle et
   * chaque page garde le temps réel. Voir `reseau-feed-pages.ts` pour ce
   * qu'on a écarté (limite gonflée, défilement infini) et pourquoi. LA MÊME
   * chaîne en liste et en immersion.
   */
  const feedPages = pages.cursors.map((cursor, index) => (
    <FeedPage
      key={feedCursorKey(cursor)}
      cursor={cursor}
      pageIndex={index}
      pageKey={feedCursorKey(cursor)}
      nextMountedCursor={pages.cursors[index + 1]}
      tag={view.kind === "tag" ? view.tag : undefined}
      scope={scope}
      now={now}
      isFirst={index === 0}
      isLast={index === pages.cursors.length - 1}
      interleaveAfter={index === 0 ? suggestionsInterleaveIndex : null}
      onTag={openTag}
      onMention={openMention}
      onTail={reportTail}
      onBoundaryShift={rebaseAfterPage}
      emptyFallback={
        <EmptyFeed
          text={emptyFeedText(
            {
              hasConnections: (connections.data ?? []).length > 0,
              hasFollows: (follows.data ?? []).length > 0,
            },
            t,
          )}
        />
      }
    />
  ))

  return (
    <div
      className="rp-scope"
      data-navigation-layout={adaptive ? "adaptive" : undefined}
      style={adaptive ? undefined : { height: "100%" }}
    >
      {/* `href` + `precedence` : React 19 hisse la balise dans `<head>` et la
          DÉDOUBLONNE si l'écran se remonte. */}
      <style href="rp-grid" precedence="default">
        {RESEAU_DESKTOP_CSS}
      </style>
      {/* U02 : une feuille supplémentaire, strictement scoped ; l'historique
          conserve ses seuils et ses défileurs hors de l'opt-in ANTSIA. */}
      {adaptive ? <style href="rp-grid-adaptive-u02" precedence="default">{RESEAU_ADAPTIVE_CSS}</style> : null}
      {/* La feuille du kit d'espace — hissée et dédoublonnée par React 19,
          comme la feuille locale ci-dessus (même précédence "default"). */}
      <EspaceKitStyles />

      {/*
       * ⚠️ Le titre de page est ACCESSIBLE mais non VISIBLE, et c'est le
       * modèle : ni LinkedIn ni Facebook ne coiffent leur fil d'un titre et
       * d'un paragraphe d'explication. Il reste dans le DOM : une page sans
       * `<h1>` prive un lecteur d'écran de son point d'entrée. Ce qu'un
       * paragraphe dirait est repris là où il sert : la description du volet
       * actif, et celle de la portée choisie, toutes deux rendues sous les
       * onglets.
       */}
      <h1 className="sr-only">{t("reseauAgentPage.title")}</h1>

      <div className="rp-grid" data-main={main} data-urgent={onboardingUrgent ? "true" : "false"}>
        {/* Le menu vertical reprend exactement les volets de la tablist. Il
            reste monté pour préserver son état et ses données, mais le CSS ne
            l'affiche que lorsque la colonne de lecture garde sa largeur à côté
            de lui. */}
        <aside className="rp-rail-start citizen-scrollbar" tabIndex={adaptive ? 0 : undefined} aria-label={t("reseauAgentPage.railStartLabel")}>
          {/* `onCreate` ne sert que la navigation par destinations (P02) : la
              carte « Créer » du rail ouvre les MÊMES surfaces que ce lieu. */}
          <ReseauMenuRail activeTab={shownTab} counts={{ invitations: pendingCount }} onSelectTab={goToTab} onCreate={creation.openCreation} />
        </aside>

        {/* ─── Colonne centrale : l'identité PUIS le volet ouvert, dans un
             seul scroller. ─── */}
        <div ref={centerRef} className="rp-main-col citizen-scrollbar" data-volet={shownTab} tabIndex={adaptive ? 0 : undefined} role={adaptive ? "region" : undefined} aria-label={adaptive ? t(currentTab.labelKey) : undefined}>
          <div ref={composerRef} className="rp-identity-region">
            <div className="rp-identity-main">
              {/* La carte ne porte que l'identité, dans ses trois états —
                  chargement compris : elle ne doit jamais sauter quand la
                  réponse arrive. */}
              {/* U09 (épure) : sous l'opt-in adaptatif, la porte de publication
                  remplace la carte d'identité — Profil, Créer et Messages sont
                  déjà des destinations du rail. */}
              {adaptive ? <FeedComposerPrompt onPublish={() => creation.openCreation("publication")} onLive={liveAvailable ? () => creation.openCreation("conference") : null} /> : <ProfileMiniCard
                cover={showCover(RESEAU_HEADER_VARIANT, shownTab)}
                action={
                  <div className="rp-profile-actions" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {/* « Publier » EST la porte de la publication depuis que le
                        composeur permanent a quitté le fil : il vit dans la
                        carte épinglée pour rester atteignable à toute hauteur
                        de défilement. Une actu se crée depuis la rangée des
                        stories, juste en dessous — deux portes pour une seule
                        carte, à trente pixels d'écart, se liraient comme deux
                        objets différents.

                        ⚠️ PERMANENT (R-01) : ni le volet ni la vue du fil ne
                        le conditionnent — créer est un geste du LIEU, pas de
                        la vue. */}
                    <Button size="sm" icon="edit" onClick={() => creation.openCreation("publication")} style={{ borderRadius: 999 }}>
                      {t("reseauAgentPage.publish")}
                    </Button>
                    {/* iCom est une surface dédiée : cette porte permanente ne
                        réintroduit pas « Messages » dans les onglets/rail. */}
                    <Button size="sm" icon="video" onClick={() => creation.openCreation("conference")} style={{ borderRadius: 999 }}>{t("direct:create.title")}</Button>
                    <ReseauDesktopIcomLink />
                  </div>
                }
              />}
            </div>
          </div>

          <main className="rp-main">
            {/* La tablist « chemise » du kit d'espace. Une seule pastille : les
                activités non lues vivent sur la CLOCHE du chrome (R-03). */}
            <EspaceDossierTabs
              className="rp-tabs"
              aria-label={t("reseauAgentPage.tabsLabel")}
              panelId={PANEL_ID}
              idPrefix={TAB_ID_PREFIX}
              current={shownTab}
              onChange={(id) => goToTab(parseReseauAgentTab(id))}
              tabs={RESEAU_AGENT_TABS.filter((entry) => isServedReseauTab(entry.id)).map((entry) => ({
                id: entry.id,
                label: t(entry.labelKey),
                badge: entry.id === "relations" ? formatUnreadBadge(pendingCount) : null,
                badgeLabel: entry.id === "relations" && shouldSurfaceInvitations(pendingCount) ? invitationsBannerLabel(pendingCount ?? 0, t) : null,
              }))}
            />

            <div id={PANEL_ID} role="tabpanel" aria-labelledby={`${TAB_ID_PREFIX}${shownTab}`} className="flex min-w-0 flex-col gap-[var(--rp-stack-gap)]">
            {/* La carte de tête du volet ouvert : son titre, sa description, et
                — sur le fil UNIQUEMENT — la recherche et la portée. */}
            <section ref={toolsRef} className="rp-volet-head esk-card" aria-label={t(currentTab.labelKey)} data-tools={shownTab === "fil" ? "true" : undefined}>
              <h2 className="rp-volet-title">{t(currentTab.labelKey)}</h2>
              {/* La phrase du volet ne sert QUE les volets sans outils. */}
              {shownTab === "fil" ? null : <p className="rp-volet-desc">{t(currentTab.descriptionKey)}</p>}

              {shownTab === "fil" ? (
                <div className="rp-feed-tools">
                  <div className="rp-feed-tools-row">
                    <form
                      role="search"
                      aria-label={t("reseauAgentPage.searchLabel")}
                      /* Même porte qu'au téléphone : `openSearch` décide seul
                         s'il faut changer de volet et pousser l'adresse
                         (`searchNavigationFor`). Ici on est déjà sur le fil. */
                      onSubmit={(event) => {
                        event.preventDefault()
                        openSearch(searchDraft.trim())
                      }}
                      className="rp-search-form"
                    >
                      <div className="rp-search-field">
                        <TextInput
                          value={searchDraft}
                          onChange={(event) => setSearchDraft(event.target.value)}
                          placeholder={t("reseauAgentPage.searchPlaceholder")}
                          aria-label={t("reseauAgentPage.searchLabel")}
                          style={{
                            // Système épuré (ADR-0027, ADR-0030) : l'angle des champs
                            // (14 px) et le contour de contrôle à 3:1 (`--input`,
                            // gardé par décision du propriétaire) ; ailleurs, la
                            // pastille d'origine.
                            border: "1px solid var(--input)",
                            borderRadius: "var(--esp-field-radius, 999px)",
                            background: "var(--ink-100)",
                            minHeight: 52,
                            // ⚠️ Les QUATRE retraits en toutes lettres, jamais le
                            // raccourci : `TextInput` pose son propre
                            // `padding-left`, et React avertit alors d'un mélange
                            // raccourci/détaillé sur la même propriété.
                            paddingTop: 11,
                            paddingBottom: 11,
                            paddingLeft: 18,
                            paddingRight: 60,
                            fontSize: 13.5,
                          }}
                        />
                        <Button
                          type="submit"
                          variant="secondary"
                          className="rp-search-submit"
                          aria-label={t("reseauAgentPage.searchSubmit")}
                          title={t("reseauAgentPage.searchSubmit")}
                          style={{
                            // Système épuré (ADR-0027) : rond gris sans filet, comme les
                            // icônes de l'en-tête ; ailleurs, le cerclage d'origine.
                            border: "1.5px solid var(--esp-chip-border, var(--primary-500))",
                            borderRadius: 999,
                            background: "var(--esp-header-icon-bg, var(--ink-0))",
                            minHeight: 44,
                          }}
                        >
                          <Search size={17} strokeWidth={2.2} aria-hidden="true" />
                        </Button>
                      </div>
                    </form>

                    {/*
                     * La portée du fil : UN sélecteur. Ce ne sont pas des
                     * onglets — ils ne montrent pas des contenus différents,
                     * ils RECOMPOSENT le même fil —, et un `select` le dit
                     * mieux que des boutons bascules.
                     */}
                    {showChips ? (
                      <Select
                        className="rp-scope-select"
                        aria-label={t("reseauAgentPage.scopeLabel")}
                        // Ce que la portée montre, jamais deviné : en infobulle,
                        // et juste après en sr-only pour qui n'a pas de survol.
                        title={t(feedScopeById(scope).descriptionKey)}
                        value={scope}
                        onChange={(event) => goToScope(parseFeedScope(event.target.value))}
                        style={{
                          // Un filtre du fil est une PUCE des chartes (ADR-0030) :
                          // angle des puces, gris du creux, aucun filet dans les
                          // thèmes ANTSIA ; la pastille d'origine en repli.
                          border: "1px solid var(--esp-chip-border, var(--ink-300))",
                          borderRadius: "var(--esp-chip-radius, 999px)",
                          background: "var(--esp-chip-bg, var(--ink-100))",
                          paddingTop: 11,
                          paddingBottom: 11,
                          paddingLeft: 16,
                          fontSize: 13.5,
                          fontWeight: 600,
                        }}
                      >
                        {FEED_SCOPE_CHIPS.map((chip) => (
                          <option key={chip.id} value={chip.id}>
                            {t(chip.labelKey)}
                          </option>
                        ))}
                      </Select>
                    ) : null}
                    {/* P04 : le point d'entrée de l'Immersion au bureau — la
                        bascule nommée, Liste par défaut. */}
                    {immersion !== null && feedId !== null ? <FeedModeToggle state={immersion.mode} onChange={immersion.changeMode} /> : null}
                  </div>

                  {showChips ? (
                    <p className="sr-only" aria-live="polite">
                      {t(feedScopeById(scope).descriptionKey)}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </section>

            {main === "feed" ? (
              immersion !== null && immersion.immersive ? (
                /* P04 — l'Immersion au bureau : le MÊME lecteur qu'au
                   téléphone, dans la colonne de lecture dont il prend la
                   hauteur restante ; la tête du fil en est le premier créneau.
                   La bascule reste celle des outils du fil, juste au-dessus :
                   pas de seconde bascule dans la barre du lecteur. */
                <FeedSurfaceMemoryProvider value={immersion.surfaceMemory}>
                  <ImmersiveFeedReader
                    key={feedId ?? "fil"}
                    label={t("immersiveFeed.label")}
                    head={
                      <>
                        {feedHeading}
                        {invitationsBanner}
                        {storiesRow}
                      </>
                    }
                    canLoadMore={canLoadMore}
                    exhausted={pages.exhausted}
                    onLoadMore={loadMore}
                    depth={pages.cursors.length}
                    restore={immersion.restore}
                    onRestored={immersion.onRestored}
                    onAnchor={immersion.recordSlotAnchor}
                  >
                    {feedPages}
                  </ImmersiveFeedReader>
                </FeedSurfaceMemoryProvider>
              ) : (
              <FeedSurfaceMemoryProvider value={immersion?.surfaceMemory ?? null}>
                {feedHeading}

                {invitationsBanner}

                {storiesRow}

                {view.kind === "post" ? (
                  focused.isLoading ? (
                    <SkeletonCard />
                  ) : focused.data ? (
                    <PostCard post={focused.data} now={now} onTag={openTag} onMention={openMention} />
                  ) : (
                    <p style={{ margin: 0, color: "var(--ink-600)" }}>{t("reseauAgentPage.postUnavailable")}</p>
                  )
                ) : view.kind === "search" ? (
                  search.isLoading ? (
                    <SkeletonCard />
                  ) : (search.data?.items ?? []).length === 0 ? (
                    <EmptyFeed text={t("reseauAgentPage.searchEmpty")} />
                  ) : (
                    (search.data?.items ?? []).map((post) => <PostCard key={post._id} post={post} now={now} onTag={openTag} onMention={openMention} />)
                  )
                ) : (
                  <>
                    {feedPages}

                    {shouldShowLoadMore(pages, tailCursor) ? (
                      <div>
                        <Button
                          variant="secondary"
                          icon="arrowDown"
                          onClick={() => {
                            setPages((state) => appendPage(state, tailCursor))
                            setAnnouncement(loadMoreAnnouncement(20, t))
                          }}
                        >
                          {t("reseauAgentPage.loadMore")}
                        </Button>
                      </div>
                    ) : null}

                    {/* P04 : retrouver la carte lue au retour (profondeur rechargée). */}
                    {immersion !== null && feedId !== null ? (
                      <FeedListReturn
                        restore={immersion.restore}
                        onRestored={immersion.onRestored}
                        onAnchor={immersion.recordListAnchor}
                        canLoadMore={canLoadMore}
                        exhausted={pages.exhausted}
                        onLoadMore={loadMore}
                      />
                    ) : null}
                  </>
                )}
              </FeedSurfaceMemoryProvider>
              )
            ) : main === "people" ? (
              <PeoplePanel />
            ) : main === "pages" ? (
              <PagesPanel />
            ) : main === "events" ? (
              /* Sans `onCreateEvent` : le catalogue de création mène
                 l'évènement à ce volet même — un bouton qui y renverrait
                 tournerait en rond. */
              <EvenementsPanel now={now} />
            ) : main === "bookmarks" ? (
              <BookmarksPanel
                now={now}
                // L'aperçu n'est pas la publication : on l'ouvre ENTIÈRE dans le
                // fil, où elle est relue avec sa garde.
                onOpenPost={(postId) => {
                  goToTab("fil")
                  setView({ kind: "post", postId })
                }}
              />
            ) : main === "groups" ? (
              /* La graine est aussi la KEY : un nouveau groupe demandé (cloche,
                 invitation acceptée) REMONTE le volet sur sa page. */
              <GroupsPanel
                key={groupSeed ?? "annuaire"}
                groupId={groupSeed}
                now={now}
                onTag={openTagFromGroups}
                onMention={openMention}
                onOpenGroup={openGroup}
                onBack={closeGroup}
              />
            ) : main === "conferences" ? <DirectsPanel /> : /* le
                 volet « Activité » a disparu le 2026-09-06 (R-03) : le relevé
                 des notifications est le contenu de la CLOCHE. */
            null}

            {/* Un bouton qui ajoute du contenu SOUS lui ne dit rien à qui ne voit
                pas l'écran. Le focus, lui, reste sur le bouton. */}
            <p role="status" aria-live="polite" className="sr-only">
              {announcement}
            </p>
            </div>
          </main>
        </div>

        {/* Le premier emplacement est réservé à iCom. Le contenu privé reste
            une surface autonome ; les modules publics suivent dans le même
            scroller et remontent aussitôt que la carte est détachée. */}
        <aside ref={contextRef} className="rp-rail-end rp-identity-aside citizen-scrollbar" tabIndex={adaptive ? 0 : undefined} aria-label={t("reseauAgentPage.railEndLabel")}>
          {/* iCom reste en tête de la colonne droite, y compris sous la navigation adaptative
              (décision du propriétaire du 22/10, qui revient sur ce retrait d'U09). */}
          <MessagerieDock />
          {rails.suggestions ? <SuggestionsPanel /> : null}
          {rails.pagesToFollow ? <PagesSuggestionsRail /> : null}
          {rails.events ? <EvenementsRail now={now} /> : null}
          {rails.liveDirects && liveAvailable ? <DirectsLiveRail now={now} /> : null}
        </aside>
      </div>

      {/* Le composeur d'actu — carte flottante compacte au bureau. La feuille
          PORTAILLE elle-même vers body (ImmersiveOverlay) : le piège
          `container-type` de `.rp-scope` ne la concerne pas. */}
      <StoryCreateSheet open={creation.open === "actu"} onClose={creation.close} onPublished={creation.close} />

    </div>
  )
}
