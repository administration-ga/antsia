// Dupliqué de socle/packages/agent-features/src/features/messagerie/icom-dock.ts @ ad2e7fdc2 — adaptations : libellés des briques sortis du module — `IcomDockTab` porte des CLÉS qualifiées (`labelKey`, `descriptionKey`, espace `messagerie`) au lieu de phrases ; description des Statuts réécrite (le moteur n'a plus de « surface iCom » des stories) ; doc : renvois au hub `/icom` et à l'annuaire institutionnel de l'espace de poste retirés. ; CH-817 (diverge du socle) : sans appels déclarés par l'application (`useCallsAvailable()`), iAppel n'est plus un onglet (`visibleIcomDockTabs`) et un onglet iAppel demandé retombe sur iChat (`servedIcomDockTab`).
/**
 * iCom — quels onglets, et quand ils se montrent.
 *
 * La carte sert le RÉSEAU de la personne : ses conversations, les statuts de
 * son réseau, ses appels, ses relations. Le quatrième onglet lit donc ses
 * relations (le graphe du réseau) et non un annuaire : chercher ici quelqu'un
 * qu'on ne connaît pas reviendrait à ouvrir un annuaire dans une surface qui a
 * été construite pour ne pas l'exposer.
 *
 * ── Quatre onglets, quatre métiers distincts ──────────────────────────
 * L'écueil serait d'avoir deux onglets qui font la même chose sur la même
 * liste. Ils sont donc séparés par le GESTE, pas par la donnée :
 *
 *   - iChat     — mes conversations. On y lit et on y écrit.
 *   - Statuts   — les statuts (stories) de mon réseau.
 *   - iAppel    — passer un appel. On y AGIT : appeler une relation.
 *   - Relations — mes relations. On y CHERCHE : retrouver une fiche.
 *
 * ⚠️ « Relations » et non « iContact » : le mot iContact désignait au socle
 * l'annuaire INSTITUTIONNEL — le porter ici faisait croire à l'annuaire.
 * L'`id` reste `icontact` : il voyage dans les URLs (`?brique=icontact`) et
 * les préférences, le renommer casserait les liens existants.
 *
 * Les libellés sont des CLÉS de traduction qualifiées : ce module ne connaît
 * aucune langue, l'écran traduit (`t(tab.labelKey)`).
 */

export const ICOM_DOCK_TAB_IDS = [
  "ichat",
  "actus",
  "iappel",
  "icontact",
] as const
export type IcomDockTabId = (typeof ICOM_DOCK_TAB_IDS)[number]
export const ICOM_DOCK_TAB_DEFAULT: IcomDockTabId = "ichat"

export interface IcomDockTab {
  id: IcomDockTabId
  /** Clé qualifiée du nom affiché (« iChat », « Statuts »…). */
  labelKey: string
  /** Clé qualifiée de ce que l'onglet permet de faire — sert le libellé accessible. */
  descriptionKey: string
}

export const ICOM_DOCK_TABS: readonly IcomDockTab[] = Object.freeze([
  {
    id: "ichat",
    labelKey: "messagerie:icomDock.tabs.ichat.label",
    descriptionKey: "messagerie:icomDock.tabs.ichat.description",
  },
  {
    id: "actus",
    labelKey: "messagerie:icomDock.tabs.actus.label",
    descriptionKey: "messagerie:icomDock.tabs.actus.description",
  },
  {
    id: "iappel",
    labelKey: "messagerie:icomDock.tabs.iappel.label",
    descriptionKey: "messagerie:icomDock.tabs.iappel.description",
  },
  {
    id: "icontact",
    labelKey: "messagerie:icomDock.tabs.icontact.label",
    descriptionKey: "messagerie:icomDock.tabs.icontact.description",
  },
])

/** Ramène n'importe quelle entrée sur un onglet connu — jamais d'onglet vide. */
export function normalizeIcomDockTab(value: string | null | undefined): IcomDockTabId {
  return (ICOM_DOCK_TAB_IDS as readonly string[]).includes(value ?? "")
    ? (value as IcomDockTabId)
    : ICOM_DOCK_TAB_DEFAULT
}

/** Ce que l'application déclare et qui décide des onglets montrés. */
export interface IcomTabsOptions {
  /**
   * CH-817 : l'application propose-t-elle des appels (`useCallsAvailable()`) ? Non : iAppel
   * n'est pas un onglet — un onglet qui ne mène qu'à des gestes retirés serait une porte vide.
   */
  callsAvailable: boolean
  /** Navigation par destinations (ANTSIA) : les Statuts restent atteignables depuis le fil. */
  destinations?: boolean
}

/** Les onglets MONTRÉS, dans l'ordre de `ICOM_DOCK_TABS` — jamais un onglet sans objet. */
export function visibleIcomDockTabs(options: IcomTabsOptions): readonly IcomDockTab[] {
  return ICOM_DOCK_TABS.filter(
    (tab) => (options.callsAvailable || tab.id !== "iappel") && (options.destinations !== true || tab.id !== "actus"),
  )
}

/**
 * L'onglet réellement SERVI. CH-817 : appels fermés, un iAppel demandé (lien profond, état
 * repris) retombe sur iChat — jamais une brique d'appels que la barre ne montre pas.
 */
export function servedIcomDockTab(tab: IcomDockTabId, callsAvailable: boolean): IcomDockTabId {
  return tab === "iappel" && !callsAvailable ? ICOM_DOCK_TAB_DEFAULT : tab
}

/**
 * La barre d'onglets se montre-t-elle ?
 *
 * ⚠️ Non pendant une conversation, une rédaction ou un appel en cours : la
 * carte n'a qu'UNE colonne, et y laisser des onglets proposerait de quitter ce
 * qu'on est en train d'écrire sans le dire. Le retour se fait par la flèche,
 * comme avant — les onglets sont une racine, pas une échappatoire.
 */
export function icomTabsVisible(viewKind: string): boolean {
  return viewKind === "list"
}

/**
 * Le chevron de repli n'existe qu'ANCRÉ : une fenêtre flottante a une hauteur
 * fixe — la « replier » n'aurait pas de sens, et c'est la croix de sa barre de
 * titre qui la range (ré-ancrage). Garder le chevron en flottant offrirait
 * deux gestes voisins aux effets incomparables.
 */
export function dockChevronVisible(repliable: boolean, floating: boolean): boolean {
  return repliable && !floating
}

/**
 * Ce qu'affiche la carte, une fois l'onglet et la vue connus.
 *
 * L'onglet ne commande QUE la racine : dès qu'on ouvre une conversation, c'est
 * la vue qui prend la main, quel que soit l'onglet. Sans cette règle, revenir
 * d'une conversation aurait pu atterrir sur les relations.
 */
export function icomDockBody(
  tab: IcomDockTabId,
  viewKind: string,
): "messagerie" | "actus" | "appel" | "contacts" {
  if (viewKind !== "list") return "messagerie"
  if (tab === "actus") return "actus"
  if (tab === "iappel") return "appel"
  if (tab === "icontact") return "contacts"
  return "messagerie"
}
