// Dupliqué de socle/packages/agent-features/src/features/reseau-personnel/index.ts @ ad2e7fdc2 — adaptations : RÉÉCRIT — barrel de la feature du moteur : la page réseau, sa coque et ses modules purs (déplacés dans `shell/`), les volets, le fil, le profil et les pages réécrites sur le moteur ; RETIRÉS avec leur source : dossier administratif (`MonProfilPage`, `ProfilProfessionnelSection`, `iprofil-*`, `anchor-settle`, `parcours-model`), orphelins (`MonReseauCard`, `NotificationsPanel`), conférences (`DirectsPanel`, `DirectsLiveRail`, `directs-panel`, module `live`) ; primitives mobiles (`ImmersiveOverlay`, verrou de défilement, hauteur visible, seuil de la coquille) plus réexportées — elles vivent dans `@antsia/ui/overlay` ; volets servis (`RESEAU_SERVED_TAB_IDS`, `isServedReseauTab`, `servedReseauTab`), adresses des raccourcis (`ShortcutLinks`), feuille du bureau (`RESEAU_DESKTOP_CSS`) et porte iCom (`desktopIcomLabel`, `icomUnreadTotal`) ajoutés ; historique des routes de l'espace retiré des commentaires.
//
// La page réseau est l'ACCUEIL de l'application (`useRoutes().home()`) : le
// fil et ses volets (`?tab=…`, `reseau-agent-nav`). L'application monte
// `ReseauAgentPage`, qui choisit elle-même entre l'arbre du bureau et
// `ReseauMobilePage` (≤ 959 px) ; le profil d'une personne est
// `ProfilPersonnePage`, la fiche d'une page `ProfilPagePage`.

// ── La page réseau et sa coque (`shell/`) ──────────────────────────────────
export { ReseauAgentPage, RESEAU_DESKTOP_CSS } from "../../shell/ReseauAgentPage"
export { ReseauMenuRail } from "../../shell/ReseauMenuRail"
export { ReseauCreateAction } from "../../shell/ReseauCreateAction"
export { ReseauDesktopIcomLink, desktopIcomLabel, icomUnreadTotal } from "../../shell/ReseauDesktopIcomLink"
// ⚠️ Ré-export NOMMÉ, et non `export *` : `mobile/reseau-mobile-tabs` publie
// déjà un `ReseauMenuItem` — la feuille « Menu » du téléphone et le rail-menu
// du bureau décrivent chacun leur propre entrée (l'une porte une `url`,
// l'autre un `href` et une pastille). Deux types homonymes exportés
// en vrac rendent le barrel ambigu et cassent la compilation.
export {
  RESEAU_SERVED_TAB_IDS,
  SHORTCUTS_MAX,
  isServedReseauTab,
  menuBadgeLabel,
  menuItemsFor,
  servedReseauTab,
  shortcutsFor,
} from "../../shell/reseau-menu"
export type {
  ReseauMenuCounts,
  ReseauMenuItem as ReseauRailMenuItem,
  ReseauShortcut,
  ShortcutGroupInput,
  ShortcutLinks,
  ShortcutPageInput,
} from "../../shell/reseau-menu"
export * from "../../shell/reseau-agent-nav"
export * from "../../shell/reseau-layout"

// ── Coquille mobile ─────────────────────────────────────────────────────────
// Les modules PURS d'abord : ce sont eux qui décident, et ce sont eux qu'un
// écran extérieur a besoin de lire (un chrome, un test).
export * from "../../shell/mobile/reseau-mobile-tabs"
export { ReseauMobilePage } from "../../shell/mobile/ReseauMobilePage"
export { ReseauMobileShell } from "../../shell/mobile/ReseauMobileShell"
export { ReseauMobileTabBar } from "../../shell/mobile/ReseauMobileTabBar"
export { ReseauMobileMenuSheet } from "../../shell/mobile/ReseauMobileMenuSheet"
export { ReseauMobileHeader } from "../../shell/mobile/ReseauMobileHeader"
export { ReseauMobileFeed } from "../../shell/mobile/ReseauMobileFeed"
export { PostComposerSheet } from "../../shell/mobile/PostComposerSheet"

// ── Profil ──────────────────────────────────────────────────────────────────
export { ProfilReseauSection } from "./ProfilReseauSection"
// Ce que le réseau montre de vous : les faits et les gestes de retrait,
// écrits UNE fois. Toute surface qui parle de visibilité les lit — des phrases
// écrites à plusieurs dates finissent toujours par se contredire.
export * from "./profile-visibility-copy"
export { ProfilPersonnePage } from "./ProfilPersonnePage"
export { ProfilFrame } from "./ProfilFrame"
export { ProfileMiniCard } from "./ProfileMiniCard"
export { ProfilePublicationCard } from "./ProfilePublicationCard"
export { PrivacyLists } from "./PrivacyLists"

// ── Pages (réécrites sur les pages du moteur) ──────────────────────────────
// La fiche d'UNE page (`useRoutes().page(handle)`).
export { ProfilPagePage, type PageCommerce } from "./ProfilPagePage"
export { PagesPanel } from "./PagesPanel"
export { PageFollowButton } from "./PageFollowButton"
export { PagesSuggestionsRail } from "./PagesSuggestionsRail"
export * from "./pages-panel"

// ── Volets de bureau ────────────────────────────────────────────────────────
export { EvenementsPanel } from "./EvenementsPanel"
export { EvenementsRail } from "./EvenementsRail"
export { BookmarksPanel } from "./BookmarksPanel"
export { ContactsRail } from "./ContactsRail"
export * from "./evenements-list"
export * from "./bookmarks-panel"
export * from "./contacts-rail"

// ── Le fil ──────────────────────────────────────────────────────────────────
export * from "./reseau-feed-pages"
// L'état du fil et sa chaîne de pages, partagés par le bureau et le téléphone :
// deux copies auraient divergé au premier correctif.
export { useReseauFeedState } from "./useReseauFeedState"
export type { ReseauFeedCursor, ReseauFeedState, FeedTail } from "./useReseauFeedState"
export { EmptyFeed, FeedPage } from "./FeedPages"
// Le fil immersif et le mode Liste (P04) : ce qu'une surface d'application
// monte autour d'une source de publications qui n'est pas `FeedPage` (le fil
// national), et la mémoire de retour de l'onglet.
export {
  FeedListReturn,
  FeedModeToggle,
  FeedPostMemoryScope,
  FeedReturnSessionBoundary,
  FeedSurfaceMemoryProvider,
  ImmersiveFeedReader,
  ImmersiveFeedSlot,
  ImmersiveStatusSlot,
  useFeedImmersion,
  useFeedMode,
  useImmersiveFrozenHead,
  useImmersivePageReport,
} from "../feed-immersion"
export type { FeedImmersion, FeedModeState, FeedRestoreTarget, ImmersivePageReport } from "../feed-immersion"
export { PostCard } from "./PostCard"
export { PostComposer } from "./PostComposer"
export { PostMedia } from "./PostMedia"
export { RichText } from "./RichText"
export { Avatar, initialsOf } from "./Avatar"
export { SharePostDialog } from "./SharePostDialog"

// ── Relations et groupes ────────────────────────────────────────────────────
export { PeoplePanel, PeopleSearchPanel, FollowsSection, SentInvitationsSection } from "./PeoplePanel"
export { BlockedPeopleSection } from "./BlockedPeopleSection"
// Chaînes natives partagées avec les applications : pas de copie du réducteur.
export {
  appendCursorPage,
  initialCursorPages,
  mergedCursorRows,
  nextCursor,
  recordCursorPage,
  removeCursorRows,
} from "./cursor-pages"
export type { CursorPage, CursorPageMount, CursorPageSnapshot, CursorPagesState } from "./cursor-pages"
export type { FollowsSectionProps, SentInvitationsSectionProps } from "./PeoplePanel"
// Les décisions PURES du volet Relations : sous-vues et leur adresse, ligne de
// titre d'une carte, droit d'affichage de la présence. Exportées pour qu'un
// chrome et les tests les lisent sans monter l'écran.
export * from "./people-panel"
export * from "./suggestions-actions"
export { GroupsPanel } from "./GroupsPanel"
export * from "./groupes-thematiques"
/* Le sélecteur de relations — conçu avec l'interface d'`AddToCallPanel` pour
   y être rabattu : exporté pour que la fusion se fasse par import, sans
   recopier une seconde liste à cocher. */
export { RelationPicker } from "./RelationPicker"
export type { RelationPickerProps } from "./RelationPicker"
export * from "./relation-picker"
export { SuggestionsPanel } from "./SuggestionsPanel"

// ── Composition ─────────────────────────────────────────────────────────────
export { useMediaDraft, rejectionFor, MEDIA_ACCEPT } from "./useMediaDraft"
export type { DraftMedia, DraftMediaKind, MediaDraft, UploadedMedia } from "./useMediaDraft"
/* Le brouillon de publication DURABLE — module pur + magasin de session, à
   réutiliser plutôt que de refaire un état local de composeur. */
export * from "./post-draft"
export {
  POST_DRAFT_STORAGE_SEGMENT,
  configurePostDraftStorage,
  hasRuntimeMedia,
  postDraftStorageKey,
  postDraftStore,
  runtimeMediaFile,
  runtimeMediaPreview,
  usePostComposerOpen,
  usePostDraft,
  usePostDrafts,
} from "./post-draft-store"
export { AnnounceEventDialog } from "./AnnounceEventDialog"
export * from "./shared"
