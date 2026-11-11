/**
 * MB-01 (plan 14) — la matrice de parité entre le site et l'application, tenue
 * par le code.
 *
 * Chaque route de `apps/antsia_ga/src/lib/routes.ts` (l'objet `routes`) a ici
 * UNE entrée, et une seule : `parity.test.ts` lit ce fichier du site par `fs`
 * (aucun import croisé) et échoue dès qu'une route du site n'a pas d'entrée,
 * ou qu'une entrée nomme une route qui n'existe plus. Aucune parité ne
 * s'affirme donc sans être écrite, et aucune ligne ne survit à sa route.
 *
 * Les quatre états :
 *  · `native` : l'application rend ce service elle-même, par l'écran nommé ;
 *  · `renvoi` : l'application ouvre le site dans le navigateur du système,
 *    SANS transférer la session (la personne s'y reconnecte) — `via` nomme le
 *    constructeur d'adresse de `routes.ts` (natif) qui l'ouvre ;
 *  · `absent` : rien dans l'application alors que le service est attendu au
 *    téléphone (un écart, à prioriser par le propriétaire) ;
 *  · `ferme` : volontairement hors de l'application — porte du projet,
 *    décision, ou surface technique propre au site.
 *
 * La surface dit ce qu'est la route : un `ecran` pour une personne, une
 * adresse `technique` (API, retour de prestataire, travailleur) ou une
 * référence `externe` (texte de loi). Une route technique rendue autrement
 * par le natif (son propre transport d'authentification) est `native` sans
 * écran.
 *
 * ⚠️ Cette matrice décrit le CODE, pas une recette : un état `native` dit
 * qu'un écran existe et lit le moteur, jamais qu'il a été éprouvé au
 * simulateur ou sur un téléphone (recette MB-01, à faire). Les écarts de
 * présentation entre le site et l'application ne sont pas notés ici.
 * Aucune correction d'écart dans ce lot : le propriétaire choisit.
 */
import type { NativeAccountSection, NativeRoute, nativeWebRoutes } from "./routes"

export const NATIVE_PARITY_STATES = ["native", "renvoi", "absent", "ferme"] as const
export type NativeParityState = (typeof NATIVE_PARITY_STATES)[number]
export type NativeParitySurface = "ecran" | "technique" | "externe"

/** Les écrans de l'application : la pile du membre, puis les écrans hors session. */
export type NativeParityScreen = NativeRoute["name"] | "entry" | "onboarding" | "demoEntry" | "publicEntry"

/** L'adresse du site ouverte par l'application : un constructeur de `nativeWebRoutes`, ou une section du hub. */
export type NativeParityVia = Exclude<keyof typeof nativeWebRoutes, "accountSection"> | `accountSection:${NativeAccountSection}`

export type NativeRouteParity = Readonly<{
  state: NativeParityState
  surface: NativeParitySurface
  /** L'écran natif qui rend le service (`native`) ou qui offre le renvoi (`renvoi`) ; `null` sinon. */
  screen: NativeParityScreen | null
  via?: NativeParityVia
  /** Ce que la ligne veut dire, en une phrase ; les manques connus y sont dits. */
  note: string
}>

const screen = (name: NativeParityScreen, note: string): NativeRouteParity => ({ state: "native", surface: "ecran", screen: name, note })
const renvoi = (from: NativeParityScreen, via: NativeParityVia, note: string): NativeRouteParity => ({ state: "renvoi", surface: "ecran", screen: from, via, note })
const absent = (note: string, surface: NativeParitySurface = "ecran"): NativeRouteParity => ({ state: "absent", surface, screen: null, note })
const ferme = (note: string, surface: NativeParitySurface = "ecran"): NativeRouteParity => ({ state: "ferme", surface, screen: null, note })

/** Une ligne par route du site, dans l'ordre de `apps/antsia_ga/src/lib/routes.ts`. */
export const WEB_ROUTE_PARITY: Readonly<Record<string, NativeRouteParity>> = {
  // ── Entrée, session, bienvenue ─────────────────────────────────────────
  home: screen("entry", "L'ouverture de l'application tient lieu d'accueil : entrée sans session, fil avec session."),
  demo: screen("demoEntry", "Sélecteur des comptes fictifs de la démonstration, origines isolées."),
  signIn: screen("entry", "Entrée par code e-mail ou SMS, et IDN par le navigateur du système (retour PKCE)."),
  signedOut: screen("entry", "Une sortie incomplète est dite sur l'écran d'entrée (`mobile.session.exitIncomplete`)."),
  application: ferme("Passage vers une autre application du programme par transfert de session : le natif ne transfère jamais sa session."),
  welcome: screen("onboarding", "Nom, identifiant, consentement et adhésion (`NativeOnboarding`)."),

  // ── Fil, découverte, univers ───────────────────────────────────────────
  feed: screen("feed", "Pour vous et Récents, en liste ou en immersion."),
  feedPreferences: renvoi("me", "accountSection:feedPreferences", "Préférences du fil, sur le site depuis le hub Profil."),
  memberPost: screen("post", "Publication et sa discussion ; lien profond `publication/<id>`."),
  discover: screen("publicEntry", "Découverte publique sans compte, filtres par province et mot-dièse."),
  memberDiscover: screen("explore", "Grille de médias ; boutiques, services, associations et activités sous « business »."),
  marketplaceHome: screen("business", "Annuaire natif des boutiques ; la mise en page « ventes privées » du site n'est pas reprise."),
  foodUniverse: absent("Univers « Alimentation et restauration » : aucun écran natif."),
  marketplace: absent("Résultats transverses de la marketplace (vue produits, filtres) : seule la recherche d'offres par nature existe sous « business »."),
  professionals: absent("Annuaire des professionnels : aucun écran natif."),
  professionalProfile: absent("Fiche d'un professionnel : aucun écran natif."),
  personalMeetings: ferme("Rencontres : porte fermée du projet (D12)."),
  press: absent("Presse : aucun écran natif."),
  mediaHome: absent("Mes médias : aucun écran natif."),
  mediaDesk: absent("Rédaction d'un média : aucun écran natif."),
  mediaConfig: absent("Configuration d'une rédaction : aucun écran natif."),
  mediaTeam: absent("Équipe d'une rédaction : aucun écran natif."),
  articleEditor: absent("Éditeur d'article : aucun écran natif."),
  memberMedia: absent("Média vu par un membre : aucun écran natif."),
  memberArticle: absent("Article vu par un membre : aucun écran natif."),
  publicMedia: absent("Média public : aucun écran natif sans compte."),
  publicArticle: absent("Article public : aucun écran natif sans compte."),
  professionalEditor: absent("Mon profil professionnel : aucun écran natif."),
  professionalCollaborations: absent("Mes collaborations professionnelles : aucun écran natif."),
  publicProfessional: absent("Profil professionnel public : aucun écran natif."),
  publicProfile: screen("publicEntry", "Profil public sans compte ; le membre lit la fiche native (`profile`)."),
  officialPage: screen("publicEntry", "Page officielle sans compte ; le membre lit la page native (`page`)."),
  publication: screen("publicEntry", "Publication publique sans compte ; le membre lit la publication native (`post`)."),
  tag: screen("publicEntry", "Mot-dièse public sans compte ; le membre filtre son fil par mot-dièse."),
  province: screen("publicEntry", "Filtre par province de la découverte publique sans compte."),
  nationalFeed: absent("Portée nationale du fil membre : le fil natif n'offre que Pour vous et Récents."),
  memberProvince: absent("Portée par province du fil membre : absente du fil natif."),
  memberTag: screen("feed", "Mot-dièse dans le fil membre, sans la portée nationale du site."),
  memberFeedWindow: absent("Fenêtre paginée par portée nationale ou provinciale : absente du fil natif."),
  groups: absent("Groupes thématiques : aucun écran natif."),
  events: absent("Évènements : aucun écran natif."),
  memberTab: absent("Onglets Groupes et Évènements du fil : absents du natif."),
  direct: absent("Directs : aucun écran natif."),
  publicAlbum: absent("Albums : aucun écran natif."),

  // ── Textes publics, modération, réglages ───────────────────────────────
  about: screen("legal", "À propos, mêmes textes que le site : sans compte sur l'écran public, pour le membre dans Réglages › Aide, contact et règles."),
  legal: screen("legal", "Mentions légales et contact de l'éditeur : sans compte sur l'écran public, pour le membre dans Réglages (MB-04, exigence des boutiques)."),
  privacy: screen("legal", "Confidentialité : sans compte sur l'écran public, pour le membre dans Réglages."),
  transparency: absent("Rapport de transparence : aucun écran natif."),
  moderation: renvoi("me", "accountSection:moderation", "Files de modération, sur le site depuis le hub Profil."),
  moderationView: renvoi("me", "accountSection:moderation", "Le renvoi ouvre l'accueil de la modération ; les vues ciblées se choisissent sur le site."),
  settings: screen("settings", "Apparence de l'appareil, appels, personnes bloquées, contact de l'éditeur et suppression du compte ; notifications par catégorie absentes (MB-15)."),
  dataSettings: renvoi("me", "accountSection:personalData", "Ancienne adresse redirigée vers « Mes données » ; le hub ouvre directement celle-ci."),
  authSession: { state: "native", surface: "technique", screen: null, note: "Session lue par le client Better Auth natif sur l'origine du moteur, jamais par l'API du site." },
  authBase: { state: "native", surface: "technique", screen: null, note: "Transport d'authentification propre au natif (Better Auth sur l'origine du moteur)." },
  authToken: { state: "native", surface: "technique", screen: null, note: "Jeton Convex demandé par le client natif, gardé en mémoire seulement." },
  publicSessionBridge: ferme("Pont de session du site public : le natif ne transfère jamais sa session.", "technique"),
  apdpvp: { state: "native", surface: "externe", screen: "publicEntry", note: "Référence ouverte dans le navigateur depuis les textes légaux natifs." },
  officialJournal: { state: "native", surface: "externe", screen: "publicEntry", note: "Référence ouverte dans le navigateur depuis les textes légaux natifs." },
  gdpr: { state: "native", surface: "externe", screen: "publicEntry", note: "Référence ouverte dans le navigateur depuis les textes légaux natifs." },

  // ── Messagerie, Stories, profil ────────────────────────────────────────
  messages: screen("messages", "Boîte iCom personnelle ; groupes et iCom Pro absents."),
  professionalConversation: absent("Conversation professionnelle (iCom Pro) : aucun écran natif."),
  commercialConversation: absent("Conversation commerciale : aucun écran natif."),
  stories: screen("feed", "Lecture native des Stories dans le fil ; l'entrée « Stories » du hub ouvre le site."),
  storiesNew: renvoi("feed", "storyCreate", "Créer une Story : sur le site (MB-19)."),
  profile: screen("profile", "Fiche native : identité, badges calculés, publications."),
  me: screen("me", "Hub Profil : entrées natives et renvois au site."),
  page: screen("page", "Lecture et suivi d'une page ; sa gestion s'ouvre sur le site."),

  // ── Commerce ───────────────────────────────────────────────────────────
  myShops: screen("business", "« Mes activités » : mes pages et mes boutiques, en lecture native."),
  myOrders: renvoi("me", "accountSection:orders", "Mes commandes, sur le site."),
  cart: renvoi("me", "accountSection:cart", "Panier, sur le site."),
  purchases: renvoi("me", "accountSection:purchases", "Mes achats, sur le site."),
  purchase: renvoi("me", "accountSection:purchases", "Le renvoi ouvre la liste ; la fiche d'un achat se choisit sur le site."),
  savedOffers: absent("Offres enregistrées (favoris) : aucune entrée native."),
  checkoutPrepare: renvoi("offer", "offer", "Le parcours d'achat se poursuit sur le site depuis la fiche d'offre ; aucun achat dans l'application."),
  checkoutAttempt: renvoi("me", "accountSection:orders", "Le renvoi ouvre « Mes commandes » ; la tentative se choisit sur le site."),
  paymentList: renvoi("me", "accountSection:payments", "Mes paiements, sur le site ; le paiement en ligne reste fermé (aucun prestataire contracté)."),
  paymentAttempt: renvoi("me", "accountSection:payments", "Le renvoi ouvre « Mes paiements » ; le paiement en ligne reste fermé."),
  paymentReturn: ferme("Retour d'un prestataire de paiement : aucun prestataire contracté, et jamais dans l'application.", "technique"),
  shopDirectory: screen("business", "Annuaire des boutiques sous « business »."),
  clips: screen("clips", "Clips en vidéo verticale ; le filtre par auteur du site n'est pas repris."),
  mediaWindow: screen("explore", "Fenêtres paginées natives d'Explorer et des Clips ; la recherche `q` et l'auteur ne sont pas repris."),
  shopLinkCallback: ferme("Retour de liaison d'une boutique à PRO.GA, propre au site : la gestion des boutiques se fait sur le site.", "technique"),
  shopEditor: renvoi("me", "accountSection:shop", "Gestion d'une boutique, sur le site."),
  storefront: screen("shop", "Vitrine native d'une boutique."),
  shopContact: renvoi("offer", "offer", "Le contact autorisé se poursuit sur le site depuis la fiche d'offre."),
  publicStorefront: absent("Vitrine publique sans compte : absente ; le membre lit la vitrine native (`shop`)."),
  shopCatalog: screen("shop", "Catalogue natif, filtres et tri."),
  publicShopCatalog: absent("Catalogue public sans compte : absent ; le membre lit le catalogue natif."),
  shopOffer: screen("offer", "Fiche d'offre native : prix XAF, variantes, disponibilité ; les actions se poursuivent sur le site."),
  publicShopOffer: absent("Fiche d'offre publique sans compte : absente ; le membre lit la fiche native."),
  provider: screen("shop", "Même vitrine native que les boutiques pour un prestataire."),
  publicProvider: absent("Prestataire public sans compte : absent."),
  providerCatalog: screen("shop", "Catalogue natif du prestataire, par la vitrine commune."),
  publicProviderCatalog: absent("Catalogue public d'un prestataire sans compte : absent."),
  providerOffer: screen("offer", "Fiche native d'une prestation ; les actions se poursuivent sur le site."),
  publicProviderOffer: absent("Prestation publique sans compte : absente."),
  jobDirectory: absent("Offres d'emploi : aucun écran natif."),
  shopJobs: absent("Emplois d'une boutique : aucun écran natif."),
  shopJob: absent("Offre d'emploi : aucun écran natif."),
  publicShopJob: absent("Offre d'emploi publique : aucun écran natif."),
  myApplications: renvoi("me", "accountSection:applications", "Mes candidatures, sur le site."),
  jobApplication: renvoi("me", "accountSection:applications", "Le renvoi ouvre « Mes candidatures » ; la fiche se choisit sur le site."),
  serviceQuote: renvoi("offer", "offer", "Demande de devis : se poursuit sur le site depuis la fiche de la prestation."),
  serviceBooking: renvoi("offer", "offer", "Rendez-vous : se poursuit sur le site depuis la fiche de la prestation."),
  serviceOrder: renvoi("offer", "offer", "Commande de prestation : se poursuit sur le site depuis la fiche de la prestation."),
  serviceRequests: renvoi("me", "accountSection:serviceRequests", "Mes demandes, sur le site."),
  serviceRequest: renvoi("me", "accountSection:serviceRequests", "Le renvoi ouvre « Mes demandes » ; la fiche se choisit sur le site."),
  serviceDirectory: screen("business", "Recherche native des prestations sous « business », section Services."),
  conference: absent("Conférences : aucun écran natif."),

  // ── Mes données, notifications, exploitation ───────────────────────────
  personalControls: renvoi("me", "accountSection:personalData", "Mes données et mes recours : export, décisions et recours sur le site ; la suppression du compte est native (`accountDeletion`, MB-04)."),
  pageModerationDecisions: renvoi("me", "accountSection:personalData", "Décisions visant une page représentée, dans « Mes données » sur le site."),
  personalReports: renvoi("me", "accountSection:personalData", "Suivi de mes signalements (accusé, échéance, issue), dans « Mes données » sur le site."),
  notificationCenter: screen("notifications", "Cloche native : liste, non lus, tout lire."),
  openNotification: screen("notifications", "Ouverture native d'une publication ou d'un profil ; les autres cibles rouvrent la cloche du site."),
  pushWorker: absent("Push : le natif n'inscrit aucun appareil hors appels (MB-08).", "technique"),
  health: ferme("Santé fonctionnelle : page d'exploitation, sans objet dans l'application.", "technique"),
  healthApi: ferme("Sonde de santé : adresse d'exploitation, sans objet dans l'application.", "technique"),
}

/**
 * Les gestes qui ne sont pas des routes : signaler, bloquer, supprimer son
 * compte (MB-04, PF-04 — exigences des boutiques pour les contenus
 * d'utilisateurs), et leurs voisins. Une ligne `native` porte sa PREUVE : le
 * fichier et l'appel au moteur qu'il contient (`parity.test.ts` les relit) ;
 * elle ne dit rien d'une recette.
 */
export type NativeGestureParity = Readonly<{
  state: NativeParityState
  /** Les écrans natifs où le geste est offert. */
  screens: readonly NativeParityScreen[]
  via?: NativeParityVia
  /** Le fichier de l'application (relatif à `apps/antsia_mobile`) et l'appel au moteur qu'il doit contenir. */
  evidence: readonly Readonly<{ file: string; call: string }>[]
  note: string
}>

export const NATIVE_GESTURE_PARITY: Readonly<Record<string, NativeGestureParity>> = {
  reportPost: { state: "native", screens: ["feed", "post", "profile", "page", "search", "shop"], evidence: [{ file: "src/screens/post-actions.tsx", call: "api.modules.moderation.moderation.reportPost" }], note: "Menu « … » de toute carte de publication (aussi les Clips et Explorer en liste ; pas l'immersion des Clips) : motif, précision, et « Bloquer aussi l'auteur »." },
  reportComment: { state: "native", screens: ["post"], evidence: [{ file: "src/screens/comments-section.tsx", call: "api.modules.moderation.moderation.reportComment" }], note: "Menu « … » d'un commentaire d'autrui : motif, précision, et « Bloquer aussi »." },
  reportPerson: { state: "native", screens: ["profile", "conversation"], evidence: [{ file: "src/screens/profile-screens.tsx", call: "api.modules.moderation.cases.report" }, { file: "src/screens/conversation-screen.tsx", call: "api.modules.moderation.cases.report" }], note: "Cible `person` : depuis la fiche d'autrui et l'en-tête d'une conversation, motif seul." },
  reportPersonalMessage: { state: "native", screens: ["conversation"], evidence: [{ file: "src/screens/conversation-screen.tsx", call: "api.modules.moderation.cases.report" }], note: "Cible `personalMessage` : un message texte reçu, motif seul." },
  blockPerson: { state: "native", screens: ["profile", "post", "feed", "conversation"], evidence: [{ file: "src/screens/safety-actions.tsx", call: "api.modules.graph.connections.blockPerson" }, { file: "src/screens/post-actions.tsx", call: "api.modules.graph.connections.blockPerson" }], note: "Fiche, publication, commentaire, conversation et message ; confirmation native avec « Signaler, puis bloquer »." },
  unblockPerson: { state: "native", screens: ["profile", "conversation", "settings"], evidence: [{ file: "src/screens/safety-actions.tsx", call: "api.modules.graph.connections.unblockPerson" }, { file: "src/screens/profile-screens.tsx", call: "api.modules.graph.blocks.myBlockByHandle" }], note: "Fiche refusée de la personne que j'ai bloquée, conversation fermée par mon blocage, liste des réglages." },
  blockedPeople: { state: "native", screens: ["settings"], evidence: [{ file: "src/screens/safety-actions.tsx", call: "api.modules.graph.blocks.paginateMine" }], note: "Réglages › Personnes bloquées : deux sources fusionnées, lignes neutres, Débloquer confirmé." },
  deleteAccount: { state: "native", screens: ["accountDeletion"], evidence: [{ file: "src/screens/account-deletion-screen.tsx", call: "api.modules.people.erasure.requestErasure" }, { file: "src/app.tsx", call: "onErased={onErasureRequested}" }], note: "Double confirmation (conséquences, puis mot saisi), puis sortie par la porte existante ; annulation pendant la grâce. Non proposée dans la démonstration partagée." },
  networkContact: { state: "native", screens: ["settings", "legal"], evidence: [{ file: "src/app.tsx", call: "onOpenLegal(\"legal\")" }], note: "Réglages › Aide, contact et règles : mentions légales (contact de l'éditeur) et confidentialité, natives." },
  exportData: { state: "renvoi", screens: ["me"], via: "accountSection:personalData", evidence: [], note: "Export de ses données : sur le site, depuis « Mes données et mes recours »." },
  reportFollowUp: { state: "renvoi", screens: ["me"], via: "accountSection:personalData", evidence: [], note: "Suivi de mes signalements (accusé, échéance, issue) et recours : sur le site." },
  muteAuthor: { state: "native", screens: ["feed", "post"], evidence: [{ file: "src/screens/post-actions.tsx", call: "api.modules.marks.marks.muteAuthor" }], note: "Sourdine depuis le menu d'une publication ; absente de la fiche." },
  reportPage: { state: "absent", screens: [], evidence: [], note: "Signaler une page : aucun bouton dans la page native." },
  reportStory: { state: "absent", screens: [], evidence: [], note: "Signaler une Story : aucun bouton dans le lecteur natif." },
  reportGroupMessage: { state: "absent", screens: [], evidence: [], note: "Messages de groupe : aucune conversation de groupe native." },
}

/** Le décompte par état, pour le compte rendu de l'état de la parité. */
export function nativeParityCounts(table: Readonly<Record<string, NativeRouteParity>> = WEB_ROUTE_PARITY): Record<NativeParityState, number> {
  const counts: Record<NativeParityState, number> = { native: 0, renvoi: 0, absent: 0, ferme: 0 }
  for (const entry of Object.values(table)) counts[entry.state] += 1
  return counts
}

/** Les incohérences d'une ligne (vide si elle est bien formée). */
export function nativeParityProblems(name: string, entry: NativeRouteParity): string[] {
  const problems: string[] = []
  if (entry.note.trim().length === 0) problems.push(`${name} : note vide`)
  if (entry.state === "native" && entry.surface === "ecran" && entry.screen === null) problems.push(`${name} : écran natif manquant`)
  if (entry.state === "renvoi" && (entry.via === undefined || entry.screen === null)) problems.push(`${name} : renvoi sans adresse ni écran d'origine`)
  if (entry.state !== "renvoi" && entry.via !== undefined) problems.push(`${name} : adresse de renvoi hors renvoi`)
  if ((entry.state === "absent" || entry.state === "ferme") && entry.screen !== null) problems.push(`${name} : écran nommé pour un état ${entry.state}`)
  return problems
}
