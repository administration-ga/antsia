/**
 * Fonctionnalités d'un réseau GOUVERNÉ par une tranche (ADR-0041) — règles PURES.
 *
 * Un réseau gouverné (`networks.managedBy`) sert d'emblée son socle (fil, profils,
 * relations, iCom, notifications, réglages, modération) ; chaque fonctionnalité de
 * la liste FERMÉE ci-dessous reste dans le code mais FERMÉE tant que
 * l'administrateur du réseau (ou l'opérateur de la plateforme, en secours) ne l'a
 * pas ouverte. Le moteur tient une ligne par couple (réseau, fonctionnalité) ;
 * l'absence de ligne vaut « fermé ». Fermer ne supprime rien.
 *
 * Les clés sont GELÉES une fois livrées : elles nomment des lignes en base et des
 * gardes dans le code. Ajouter une clé est un changement du moteur (elle se pose à
 * la FIN de la liste : l'ordre des clés livrées ne bouge pas) ; en retirer une, une
 * migration.
 *
 * Deux natures de clés :
 *  · un module du moteur : ses fonctions portent l'option `feature` de leur
 *    constructeur et rendent le refus indistinct tant qu'il est fermé ;
 *  · un module d'AFFICHAGE (`consulateGateway`, CH-863) : il ne garde AUCUNE fonction
 *    du moteur. Il règle une entrée que l'application du réseau monte ou retire — ici
 *    le lien sortant « consulat.ga » du menu des membres de DIASPORA.GA, une navigation
 *    vers une autre application à qui rien n'est transmis. Même ligne, même bascule
 *    motivée et journalisée (`network.feature_set`), même lecture par les membres
 *    (`features.open`) ; le cliquet `network-feature-gates` tient la liste fermée de
 *    ces clés sans garde.
 */
import type { NetworkSlice } from "./network"
import { DomainViolation } from "./violation"

/** Les neuf fonctionnalités activables, dans l'ordre où la console et l'administration du réseau les présentent. */
export const NETWORK_FEATURES = ["pages", "groupsAndEvents", "services", "jobs", "mutualAid", "mentoring", "arrivalKit", "pilotMetrics", "consulateGateway"] as const
export type NetworkFeature = (typeof NETWORK_FEATURES)[number]

/**
 * La fonctionnalité qu'une autre EXIGE ouverte : les groupes et évènements, les
 * services et l'emploi vivent sur les pages (associations, entreprises) ; les
 * autres ne dépendent de rien.
 */
export const NETWORK_FEATURE_PARENTS: Readonly<Record<NetworkFeature, NetworkFeature | null>> = {
  pages: null,
  groupsAndEvents: "pages",
  services: "pages",
  jobs: "pages",
  mutualAid: null,
  mentoring: null,
  arrivalKit: null,
  pilotMetrics: null,
  consulateGateway: null,
}

/** Les fonctionnalités que chaque tranche gouverne (`NETWORK_SLICES`) : une tranche sans fonctionnalité a une liste vide. */
export const SLICE_NETWORK_FEATURES: Readonly<Record<NetworkSlice, readonly NetworkFeature[]>> = {
  diaspora: NETWORK_FEATURES,
}

/** Le motif d'une bascule : au moins dix caractères, comme les politiques de la console. */
export const NETWORK_FEATURE_REASON_MIN = 10

export function isNetworkFeature(value: unknown): value is NetworkFeature {
  return typeof value === "string" && (NETWORK_FEATURES as readonly string[]).includes(value)
}

/** Les fonctionnalités qui exigent celle-ci, dans l'ordre des clés. */
export function networkFeatureChildren(feature: NetworkFeature): NetworkFeature[] {
  return NETWORK_FEATURES.filter((child) => NETWORK_FEATURE_PARENTS[child] === feature)
}

/**
 * La tranche gouverne-t-elle cette fonctionnalité ? Un réseau sans tranche (la
 * racine, un réseau générique) n'a aucune fonctionnalité activable : la garde ne
 * le concerne pas.
 */
export function sliceGovernsFeature(slice: NetworkSlice | undefined, feature: NetworkFeature): boolean {
  return slice !== undefined && SLICE_NETWORK_FEATURES[slice].includes(feature)
}

/**
 * Les fonctionnalités OUVERTES d'après les lignes lues, dans l'ordre des clés :
 * une clé l'est si sa ligne est ouverte ET si son parent l'est aussi (défense en
 * profondeur : la règle d'écriture tient déjà l'ordre).
 */
export function openNetworkFeatures(rows: Iterable<{ readonly feature: NetworkFeature; readonly enabled: boolean }>): NetworkFeature[] {
  const enabled = new Set<NetworkFeature>()
  for (const row of rows) if (row.enabled) enabled.add(row.feature)
  return NETWORK_FEATURES.filter((feature) => {
    const parent = NETWORK_FEATURE_PARENTS[feature]
    return enabled.has(feature) && (parent === null || enabled.has(parent))
  })
}

export type NetworkFeatureToggleRefusal = "NETWORK_FEATURE_REQUIRES_PARENT" | "NETWORK_FEATURE_HAS_OPEN_CHILDREN"

export type NetworkFeatureToggle = {
  readonly feature: NetworkFeature
  readonly enabled: boolean
  /** Les fonctionnalités ouvertes AVANT la bascule (`openNetworkFeatures`). */
  readonly open: readonly NetworkFeature[]
}

/** Le refus d'une bascule, ou `null` : ouvrir exige le parent ouvert ; fermer exige les enfants fermés. */
export function networkFeatureToggleRefusal(toggle: NetworkFeatureToggle): NetworkFeatureToggleRefusal | null {
  if (toggle.enabled) {
    const parent = NETWORK_FEATURE_PARENTS[toggle.feature]
    return parent === null || toggle.open.includes(parent) ? null : "NETWORK_FEATURE_REQUIRES_PARENT"
  }
  return networkFeatureChildren(toggle.feature).some((child) => toggle.open.includes(child)) ? "NETWORK_FEATURE_HAS_OPEN_CHILDREN" : null
}

/** La même règle, levée : le serveur la traduit en `invalidArgument` portant la règle. */
export function assertNetworkFeatureToggle(toggle: NetworkFeatureToggle): void {
  const refusal = networkFeatureToggleRefusal(toggle)
  if (refusal !== null) throw new DomainViolation(refusal)
}
