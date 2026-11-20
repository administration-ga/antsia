/**
 * Réseaux du moteur — règles PURES (cahier §5, §7, ADR-0001).
 *
 * Un réseau est une ligne de `networks` : la racine (`antsia`, publique) ou un
 * réseau fermé, enfant de la racine (`diaspora-ga`, `administration` en miroir).
 * Créer un réseau ne déploie aucun backend : une ligne, une politique, une
 * équipe de modération, un thème.
 */

export const NETWORK_KINDS = ["root", "closed"] as const
export type NetworkKind = (typeof NETWORK_KINDS)[number]

/**
 * Politique d'adhésion : `open` (ANTSIA : `declaree` d'emblée),
 * `declared_or_verified` (DIASPORA.GA : déclaration, vérification ou
 * parrainage), `mirror` (administration : par reflet signé seulement, jamais
 * par une adhésion directe).
 */
export const MEMBERSHIP_POLICIES = ["open", "declared_or_verified", "mirror"] as const
export type MembershipPolicy = (typeof MEMBERSHIP_POLICIES)[number]

/**
 * Visibilité d'un contenu : `network` (reste dans son réseau) ou `root` (aussi
 * lu dans la racine). Distincte de l'AUDIENCE héritée du socle (`public`,
 * `connections`, `group`, `page`).
 */
export const CONTENT_VISIBILITIES = ["network", "root"] as const
export type ContentVisibility = (typeof CONTENT_VISIBILITIES)[number]

export const NETWORK_STATUSES = ["active", "archived"] as const
export type NetworkStatus = (typeof NETWORK_STATUSES)[number]

/**
 * Tranches du moteur qui GOUVERNENT l'entrée et les facettes d'un réseau
 * (`networks.managedBy`). Une application dont l'admission a ses propres règles
 * (DIASPORA.GA : nationalité, parrainage, attestation consulaire) les applique
 * dans SA tranche `convex/modules/<tranche>` ; les chemins génériques (entrer,
 * régler sa facette) refusent alors ce réseau. Quitter reste toujours possible.
 */
export const NETWORK_SLICES = ["diaspora"] as const
export type NetworkSlice = (typeof NETWORK_SLICES)[number]

/** Nom confirmé par le propriétaire le 16/10/2026. */
export const ROOT_NETWORK_SLUG = "antsia" as const
/** Ancien identifiant : uniquement pour reprendre les données et préférences existantes. */
export const LEGACY_ROOT_NETWORK_SLUG = "antia" as const

/** Identifiant public d'un réseau : minuscules, chiffres, tirets ; 3 à 32 caractères. */
export const NETWORK_SLUG_PATTERN = /^[a-z][a-z0-9-]{1,30}[a-z0-9]$/

export function isValidNetworkSlug(slug: string): boolean {
  return NETWORK_SLUG_PATTERN.test(slug) && !slug.includes("--")
}

/** Ce qui définit la place d'un réseau dans l'arbre (racine unique, enfants directs). */
export type NetworkShape = {
  kind: NetworkKind
  parentId: string | null
  membershipPolicy: MembershipPolicy
  defaultVisibility: ContentVisibility
}

export type NetworkShapeError =
  | "root_with_parent"
  | "closed_without_parent"
  | "root_not_open"
  | "root_default_visibility"
  | "mirror_must_be_closed"

/**
 * Cohérence d'un réseau : la racine n'a pas de parent, est ouverte et sa
 * visibilité par défaut est `network` (aucune ouverture anonyme d'office) ; un réseau fermé a
 * un parent ; un miroir est fermé.
 */
export function validateNetworkShape(shape: NetworkShape): NetworkShapeError[] {
  const errors: NetworkShapeError[] = []
  if (shape.kind === "root") {
    if (shape.parentId !== null) errors.push("root_with_parent")
    if (shape.membershipPolicy !== "open") errors.push("root_not_open")
    if (shape.defaultVisibility !== "network") errors.push("root_default_visibility")
  } else if (shape.parentId === null) {
    errors.push("closed_without_parent")
  }
  if (shape.membershipPolicy === "mirror" && shape.kind !== "closed") errors.push("mirror_must_be_closed")
  return errors
}

/**
 * Visibilité effective d'un contenu publié dans un réseau (invariant 4) :
 * - dans la racine, `root` exige une audience publique ET un geste explicite ;
 *   la règle du réseau ne peut jamais ouvrir anonymement une publication native ;
 * - ailleurs, `root` exige une audience PUBLIQUE, puis soit le geste explicite
 *   de l'auteur (« publier aussi sur ANTSIA »), soit une règle (règle de page,
 *   visibilité par défaut du réseau) ; sinon le contenu reste dans son réseau.
 */
export function effectiveVisibility(input: {
  networkKind: NetworkKind
  audienceIsPublic: boolean
  authorRequestedRoot: boolean
  ruleVisibility: ContentVisibility
}): ContentVisibility {
  if (input.networkKind === "root") return input.audienceIsPublic && input.authorRequestedRoot ? "root" : "network"
  if (!input.audienceIsPublic) return "network"
  if (input.authorRequestedRoot) return "root"
  return input.ruleVisibility
}
