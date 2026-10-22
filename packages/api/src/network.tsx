"use client"

/**
 * Le RÉSEAU courant et les ADRESSES de l'application — ce que l'espace agent
 * du socle lisait dans `OrgProvider` et dans des chemins `/espace/…` écrits en
 * dur (17 endroits, annexe A6 §7.5).
 *
 * Une application du moteur monte `NetworkProvider` une fois, sous la porte
 * d'authentification : les surfaces y lisent le réseau de toutes leurs
 * fonctions (`useNetwork().networkId`), la charte que leurs portails
 * redéclarent, le préfixe de leurs clés de stockage local, et les adresses de
 * l'application (`useRoutes()`), qui seule sait ses URL (cliquet
 * `no-hardcoded-urls` : les routes vivent dans `apps/<app>/src/lib/routes.ts`).
 *
 * Le contrat minimal d'`OrgProvider` que lisaient les surfaces (annexe A6
 * §7.5) est porté tel quel, en constantes : `personalMode = true`,
 * `personalSpaceIsElsewhere = false`, `activeOrgId = null`.
 */
import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore, type ComponentType, type ReactNode } from "react"

import type { Id } from "./engine"
import { migrateNetworkStorage } from "./network-storage-migration"

/** Les adresses de l'application, injectées : aucune surface n'écrit une URL. */
export interface EngineRoutes {
  /** Accueil du réseau (le fil). */
  home: () => string
  /** Adresse membre d'une publication, quand l'application sert ce lien direct. */
  post?: (postId: string) => string
  /** Chemin physique pour un lien copié ; le routeur conserve ses chemins logiques. */
  sharePath?: (path: string) => string
  /** Base de la messagerie en pages (iCom au téléphone, anciens liens). */
  messages: () => string
  /** Canal commercial facultatif, injecté par ANTSIA seulement. */
  commercialConversation?: (threadId: string) => string
  /** Base des statuts (stories) en plein écran. */
  stories: () => string
  /** Profil d'une personne, par son identifiant public. */
  profile: (handle: string) => string
  /** Fiche d'une page (identité propre), par son identifiant public — un espace de noms distinct des personnes. */
  page: (handle: string) => string
  /** Agenda personnel servi par l'application, si sa destination est distincte du fil. */
  agenda?: () => string
  /** Détail d'un événement associatif ; absent : lien vers sa page, sans adresse inventée. */
  associationEvent?: (handle: string, eventId: string) => string
  /** Réglages de la personne ; absent tant que l'application ne les sert pas (l'entrée de menu disparaît). */
  settings?: () => string
  /** Conférence en direct (lot `live`). */
  conference: (sessionId: string) => string
  /**
   * Les AUTRES adresses qui servent la même page de conférence (alias hérités,
   * `/direct/…` d'antsia.ga). Le moteur les reconnaît comme la page : la carte
   * flottante du direct ne s'y pose pas. Absente : seule `conference` l'est.
   */
  conferenceAliases?: (sessionId: string) => readonly string[]
  /**
   * Destination « Découvrir » des membres (navigation par destinations) : le
   * lieu qui regroupe contenus nationaux, provinces, mots-clés et volets du
   * réseau. Absente, la coque garde sa navigation par volets.
   */
  discover?: () => string
  /**
   * Destination « Profil » des membres (navigation par destinations) : l'espace
   * personnel (mon profil, mes préférences, mes réglages). Absente, la coque
   * garde sa navigation par volets.
   */
  me?: () => string
  /** Annuaire des boutiques servi par l'application ; absent : aucun raccourci de rail inventé. */
  shops?: () => string
  /** U04 : vrai lecteur vidéo ; le filtre auteur reste jugé par le serveur. */
  clips?: (handle?: string) => string
  /**
   * P14B — destinations TYPÉES d'un avis (cloche, ouverture d'une notification
   * poussée), injectées par l'application qui les sert : une demande de service
   * de la personne, la fiche d'une de ses candidatures, les décisions visant une
   * page qu'elle représente, ses décisions personnelles. Absentes : la ligne
   * n'offre que « Marquer lu », jamais une adresse inventée.
   */
  serviceRequest?: (requestRowId: string) => string
  jobApplication?: (applicationId: string) => string
  pageModerationDecisions?: (pageId: string) => string
  personalDecisions?: () => string
  /** SU01d : « Mes signalements ». */
  personalReports?: () => string
}

/**
 * La NAVIGATION que l'application déclare pour ses pages de membre — une
 * capacité de présentation, jamais un droit (lot P02 de l'étude
 * social-commerce du 18/10/2026, `docs/etudes/2026-10-18-social-commerce/`).
 *
 *  · `"volets"` (défaut) : la coque historique — barre « Menu » et volets du
 *    réseau au téléphone, rail des volets au bureau. Une application qui ne
 *    déclare rien (DIASPORALE) la garde, sans aucun changement de son côté.
 *  · `"destinations"` : cinq destinations stables — Fil · Découvrir · Créer ·
 *    Messages · Profil — au téléphone comme au bureau. N'est retenue que si
 *    l'application sert AUSSI `routes.discover` et `routes.me` : une
 *    destination sans adresse serait une route morte, la coque retombe alors
 *    sur ses volets.
 */
export type EngineNavigation = "volets" | "destinations"

/** U02 : géométrie de navigation, sur déclaration ; le moteur garde ses seuils historiques par défaut. */
export type EngineNavigationLayout = "classic" | "adaptive"

/**
 * La PRÉSENTATION des publications que l'application déclare — capacité de
 * présentation sœur de `navigation`, jamais un droit (lot P03 de l'étude
 * social-commerce du 18/10/2026, `docs/etudes/2026-10-18-social-commerce/`).
 *
 *  · `"classic"` (défaut) : la carte historique — corps avant les médias,
 *    cadre 16:10 du fil. Une application qui ne déclare rien la garde, sans
 *    aucun changement de son côté.
 *  · `"media"` : auteur → média → actions → légende → offre facultative, cadre
 *    au ratio réel du média (borné, jamais recadré ni déformé), galerie avec
 *    index et visionneuse, légende bornée avec « Lire la suite ».
 *  · `"charte"` : l'écran des chartes de la série 3 (ADR-0028), à la lettre —
 *    auteur (badges en signes), texte, média POSÉ dans la carte (angle de
 *    16 px, mêmes cadre, galerie et visionneuse que « media »), puis une
 *    rangée d'icônes : réagir, commenter, partager, enregistrer. Le fil qui
 *    la porte suit le même écran : carte de suggestion en tête du téléphone
 *    (Suivre, Écrire), évènement annoncé avec Participer et Plus tard, en-tête
 *    du téléphone en ronds (recherche, cloche, messages), liste par défaut.
 *
 * Aucune donnée, aucun droit ni aucune garde ne dépend de cette valeur : elle
 * ne choisit que la mise en page des mêmes projections du moteur.
 */
export type EnginePostPresentation = "classic" | "media" | "charte"

/**
 * La PRÉSENTATION DU FIL que l'application déclare — capacité sœur de
 * `navigation` et de `postPresentation`, jamais un droit (lot P04 de l'étude
 * social-commerce du 18/10/2026, `docs/etudes/2026-10-18-social-commerce/`).
 *
 *  · `"list"` (défaut) : le fil historique, en liste, partout. Une application
 *    qui ne déclare rien (DIASPORALE) le garde, sans aucun changement de son
 *    côté.
 *  · `"immersive"` : le fil propose AUSSI un lecteur immersif — une
 *    publication principale par hauteur disponible, défilement vertical natif
 *    accroché, coordinateur de lecture des vidéos. Il est le défaut au
 *    téléphone et une proposition au bureau ; le mode Liste reste toujours
 *    offert et mémorisé par réseau ; la réduction des mouvements et un écran
 *    trop bas ramènent à la liste.
 *
 * Aucune donnée, aucun droit ni aucune garde ne dépend de cette valeur : elle
 * ne choisit que la mise en page des mêmes pages du fil (mêmes requêtes,
 * mêmes curseurs).
 */
export type EngineFeedPresentation = "list" | "immersive"

/**
 * La PRÉSENTATION DE LA RANGÉE D'ACTUS que l'application déclare — même famille
 * que `postPresentation` et `feedPresentation`, jamais un droit :
 *
 *  · `"cards"` (défaut) : les cartes verticales où la vignette remplit le cadre
 *    (arbitrage du 20/08/2026). Une application qui ne déclare rien (DIASPORALE)
 *    la garde, sans aucun changement.
 *  · `"rings"` : des médaillons ronds dans leur anneau, le prénom dessous, la
 *    création en tête (« Vous » et son « + ») — la maquette de la série 3
 *    (ADR-0027).
 *
 * Mêmes requêtes, même ordre, mêmes noms accessibles : seule la mise en page change.
 */
export type EngineStoriesPresentation = "cards" | "rings"

/** Ce que la publication montre déjà (ADR-0037) : la formule d'offre ne double jamais ses images. */
export type EnginePostMediaSummary = { count: number; hasVideo: boolean }

/** P09 : rendu injecté par l'application, aucune dépendance du moteur vers son front.
 *  ADR-0037 : `postMedia` (facultatif) dit ce que la publication montre déjà. */
export type EnginePostOfferRenderer = ComponentType<{ networkId: Id<"networks">; postId: Id<"posts">; postMedia?: EnginePostMediaSummary }>

/** MP13 : aperçu éditorial relu par l'application ; absent, aucune surface ajoutée. */
export type EnginePostArticleRenderer = ComponentType<{ networkId: Id<"networks">; postId: Id<"posts"> }>

export interface NetworkContextValue {
  networkId: Id<"networks">
  /** Identifiant lisible du réseau (`antsia`, `diaspora`…). */
  slug: string
  /** La personne de la session : chaque surface sait de quel côté elle se tient. */
  personId: Id<"persons">
  /** La charte de l'application (`data-charte`), redéclarée par les portails. */
  charte: string
  /** Préfixe des clés de stockage local et de session : un état par réseau. */
  storagePrefix: string
  /** L'application sert réellement sa route de conférence (activation explicite F3a). */
  liveAvailable: boolean
  /** La navigation déclarée par l'application, déjà rabattue sur `"volets"` si une destination manque. */
  navigation: EngineNavigation
  /** U02 : absent dans les consommateurs historiques ; téléphone <768, rail compact <1200 sur opt-in. */
  navigationLayout?: EngineNavigationLayout
  /** Libellés d'entrées optionnelles traduits par l'application qui sert leurs routes. */
  navigationLabels?: Readonly<{ shops?: string; clips?: string }>
  /** ADR-0036 : l'application sert l'espace iCom Pro (boutiques, mises en relation) à côté d'iCom. */
  icomPro: boolean
  /** La présentation des publications déclarée par l'application, `"classic"` sauf opt-in explicite. */
  postPresentation: EnginePostPresentation
  /** La présentation du fil déclarée par l'application, `"list"` sauf opt-in explicite (P04). */
  feedPresentation: EngineFeedPresentation
  /** La présentation de la rangée d'actus, `"cards"` sauf opt-in explicite (ADR-0027). */
  storiesPresentation: EngineStoriesPresentation
  /**
   * Le nom affiché en tête de la coque du téléphone (la marque de l'application) ;
   * `null` : le libellé neutre du moteur (« Réseau »). Un libellé VISUEL, jamais un titre.
   */
  wordmark: string | null
  PostOfferRenderer?: EnginePostOfferRenderer
  PostArticleRenderer?: EnginePostArticleRenderer
  /** Contrat d'`OrgProvider` lu par les surfaces du socle : toujours l'espace personnel. */
  personalMode: true
  personalSpaceIsElsewhere: false
  activeOrgId: null
}

const NetworkContext = createContext<NetworkContextValue | null>(null)
const RoutesContext = createContext<EngineRoutes | null>(null)

/**
 * La navigation RETENUE : `"destinations"` seulement si l'application la
 * demande ET sert ses deux destinations propres. Tout le reste — rien de
 * déclaré, valeur inconnue, adresse manquante — garde la coque historique.
 */
export function resolveEngineNavigation(requested: EngineNavigation | undefined, routes: EngineRoutes): EngineNavigation {
  if (requested !== "destinations") return "volets"
  return routes.discover !== undefined && routes.me !== undefined ? "destinations" : "volets"
}

/** L'adaptation n'a de sens que si les destinations sont effectivement servies. */
export function resolveEngineNavigationLayout(requested: EngineNavigationLayout | undefined, navigation: EngineNavigation): EngineNavigationLayout {
  return navigation === "destinations" && requested === "adaptive" ? "adaptive" : "classic"
}

export function networkNavigationMobileQuery(layout: EngineNavigationLayout): string {
  return layout === "adaptive" ? "(width < 768px)" : "(max-width: 959px)"
}

/**
 * Un seul choix d'arbre pour la page réseau et les autres pages de membre.
 * Le serveur et l'hydratation rendent null : jamais un faux format connu.
 * 768→1200 reste le même arbre ; le rail se compose uniquement en CSS.
 */
export function useNetworkNavigationLayout(): { adaptive: boolean; mobile: boolean | null } {
  const { navigation, navigationLayout } = useNetwork()
  const layout = resolveEngineNavigationLayout(navigationLayout, navigation)
  const query = networkNavigationMobileQuery(layout)
  const subscribe = useCallback((notify: () => void) => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {}
    const media = window.matchMedia(query)
    media.addEventListener("change", notify)
    return () => media.removeEventListener("change", notify)
  }, [query])
  const getSnapshot = useCallback((): boolean | null => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return null
    return window.matchMedia(query).matches
  }, [query])
  const mobile = useSyncExternalStore(subscribe, getSnapshot, navigationServerSnapshot)
  return { adaptive: layout === "adaptive", mobile }
}

function navigationServerSnapshot(): null { return null }

/**
 * La présentation RETENUE : `"media"` ou `"charte"` seulement sur demande
 * explicite de l'application. Rien de déclaré ou valeur inconnue : la carte
 * historique.
 */
export function resolveEnginePostPresentation(requested: EnginePostPresentation | undefined): EnginePostPresentation {
  return requested === "media" || requested === "charte" ? requested : "classic"
}

/**
 * La présentation du fil RETENUE : `"immersive"` seulement sur demande
 * explicite de l'application. Rien de déclaré ou valeur inconnue : la liste
 * historique, à l'identique.
 */
export function resolveEngineFeedPresentation(requested: EngineFeedPresentation | undefined): EngineFeedPresentation {
  return requested === "immersive" ? "immersive" : "list"
}

/**
 * La présentation de la rangée d'actus RETENUE : `"rings"` seulement sur demande
 * explicite. Rien de déclaré ou valeur inconnue : les cartes, à l'identique.
 */
export function resolveEngineStoriesPresentation(requested: EngineStoriesPresentation | undefined): EngineStoriesPresentation {
  return requested === "rings" ? "rings" : "cards"
}

/** Le nom de tête RETENU : une chaîne non vide, sans blancs autour ; sinon le libellé neutre (`null`). */
export function resolveEngineWordmark(requested: string | undefined): string | null {
  const wordmark = requested?.trim() ?? ""
  return wordmark.length > 0 ? wordmark : null
}

export function NetworkProvider(props: {
  networkId: Id<"networks">
  slug: string
  /** Isole une application servie sur la même origine ; vide = stockage historique du réseau. */
  storageNamespace?: string
  personId: Id<"persons">
  charte: string
  routes: EngineRoutes
  liveAvailable?: boolean
  /** Opt-in de la navigation par destinations ; absent = `"volets"` (comportement historique). */
  navigation?: EngineNavigation
  /** U02 : géométrie à trois formats, seulement sous destinations ; absent = seuil historique 960. */
  navigationLayout?: EngineNavigationLayout
  navigationLabels?: Readonly<{ shops?: string; clips?: string }>
  /** ADR-0036 : opt-in de l'espace iCom Pro ; absent = messagerie unique (comportement historique). */
  icomPro?: boolean
  /** Opt-in de la présentation média ou charte des publications ; absent = `"classic"` (comportement historique). */
  postPresentation?: EnginePostPresentation
  /** Opt-in du fil immersif (P04) ; absent = `"list"` (comportement historique). */
  feedPresentation?: EngineFeedPresentation
  /** Opt-in de la rangée d'actus en médaillons (ADR-0027) ; absent = `"cards"` (comportement historique). */
  storiesPresentation?: EngineStoriesPresentation
  /** La marque affichée en tête de la coque du téléphone ; absente = le libellé neutre du moteur. */
  wordmark?: string
  PostOfferRenderer?: EnginePostOfferRenderer
  PostArticleRenderer?: EnginePostArticleRenderer
  children: ReactNode
}) {
  const storageNamespace = props.storageNamespace ?? ""
  const storageScope = `${storageNamespace}${props.slug}`
  const [initializedSlug, setInitializedSlug] = useState<string | null>(null)

  useEffect(() => {
    // La reprise précède le montage des enfants : les stores du dock, des
    // brouillons et des appels ne doivent pas hydrater le nouveau préfixe vide.
    // Chaque stockage est indépendant, y compris si son accès lui-même échoue.
    // Un espace isolé ne reprend jamais les brouillons du vrai réseau.
    if (!storageNamespace) {
      try {
        migrateNetworkStorage(window.localStorage, props.slug)
      } catch {
        // Le navigateur peut refuser l'accès à localStorage (mode privé/politique).
      }
      try {
        migrateNetworkStorage(window.sessionStorage, props.slug)
      } catch {
        // L'absence de persistance n'empêche jamais l'accès au réseau.
      }
    }
    setInitializedSlug(storageScope)
  }, [props.slug, storageNamespace, storageScope])

  if (initializedSlug !== storageScope) return null

  const value: NetworkContextValue = {
    networkId: props.networkId,
    slug: props.slug,
    personId: props.personId,
    charte: props.charte,
    storagePrefix: `${storageNamespace}antsia:${props.slug}:`,
    liveAvailable: props.liveAvailable === true,
    navigation: resolveEngineNavigation(props.navigation, props.routes),
    navigationLayout: resolveEngineNavigationLayout(props.navigationLayout, resolveEngineNavigation(props.navigation, props.routes)),
    navigationLabels: props.navigationLabels,
    icomPro: props.icomPro === true,
    postPresentation: resolveEnginePostPresentation(props.postPresentation),
    feedPresentation: resolveEngineFeedPresentation(props.feedPresentation),
    storiesPresentation: resolveEngineStoriesPresentation(props.storiesPresentation),
    wordmark: resolveEngineWordmark(props.wordmark),
    PostOfferRenderer: props.PostOfferRenderer,
    PostArticleRenderer: props.PostArticleRenderer,
    personalMode: true,
    personalSpaceIsElsewhere: false,
    activeOrgId: null,
  }
  return (
    <NetworkContext.Provider value={value}>
      <RoutesContext.Provider value={props.routes}>{props.children}</RoutesContext.Provider>
    </NetworkContext.Provider>
  )
}

/** Le réseau courant ; lève hors d'un `NetworkProvider` (une surface sociale n'existe que dans un réseau). */
export function useNetwork(): NetworkContextValue {
  const value = useContext(NetworkContext)
  if (!value) throw new Error("@antsia/api/network : aucun NetworkProvider au-dessus de cette surface.")
  return value
}

/** Le réseau courant, ou `null` hors d'un `NetworkProvider` (surfaces montées avant l'adhésion). */
export function useOptionalNetwork(): NetworkContextValue | null {
  return useContext(NetworkContext)
}

/** Les adresses de l'application ; lève hors d'un `NetworkProvider`. */
export function useRoutes(): EngineRoutes {
  const value = useContext(RoutesContext)
  if (!value) throw new Error("@antsia/api/network : aucune table de routes injectée (NetworkProvider).")
  return value
}
