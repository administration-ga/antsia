// Dupliqué de socle/convex/modules/reseauPersonnel/handleSuggestion.ts @ ad2e7fdc2 — adaptations : import des bornes du handle depuis ./content (le domaine du socle est scindé) ; commentaires d'origine conservés (ils décrivent le socle : dans le moteur, aucun profil n'est publié d'office, ces fonctions servent les propositions d'identifiant) ; ajout propre au moteur : `idnHandleLadder`, l'échelle ORDONNÉE de l'accueil pré-rempli par IDN (ADR-0044, en fin de fichier).
/**
 * Propositions d'identifiant public (`@handle`) dérivées de l'état civil.
 *
 * Module PUR : aucune lecture de base, aucune dépendance Convex. Il énumère
 * des candidats ; c'est l'appelant qui sait lesquels sont libres.
 *
 * ── Pourquoi ce module existe ─────────────────────────────────────────
 * Le profil de réseau était un opt-in intégral : tant que l'agent n'avait pas
 * saisi lui-même un identifiant, il n'était pas trouvable. Un annuaire qui
 * démarre vide ne démarre pas — personne n'est trouvable, donc personne ne se
 * connecte, donc personne ne publie. Le profil est désormais publié à la
 * création du compte, et l'agent CHOISIT sa forme d'identifiant.
 *
 * ── Aucune forme n'est privilégiée ────────────────────────────────────
 * Décision utilisateur : la plateforme ne décide pas entre `prenom.nom` et
 * `nom.prenom`. L'échelle alterne donc les deux ordres à chaque palier, et
 * l'interface les présente SANS pré-sélection.
 *
 * Exception du moteur (ADR-0044) : à l'accueil pré-rempli par IDN,
 * `idnHandleLadder` met d'abord ce que la personne a déjà choisi chez IDN
 * (son prénom d'usage dans son identifiant, puis l'identifiant lui-même), et
 * l'écran présélectionne le premier libre ; les deux ordres suivent, inchangés.
 *
 * Une seule exception, assumée et bornée : le handle PROVISOIRE posé par la
 * publication d'office doit bien être une chaîne. Il suit alors l'ordre déjà
 * retenu pour les identifiants souverains du dépôt (`DEMO_IDN_ORDER =
 * "last_first"`, cf. `seeds/demo/idnIdentifier.ts`) — par cohérence avec
 * `users.idnEmailAlias`, et non par préférence sociale. Il porte le drapeau
 * `handleProvisional`, et l'agent doit trancher avant qu'il ne devienne sien.
 *
 * ── Ce que ce module ne fait PAS ──────────────────────────────────────
 * Il ne fabrique jamais un `displayName` : le nom AFFICHÉ reste ce que la
 * personne publie. Publier d'office une adresse est une chose ; publier un
 * état civil recopié depuis `users.name` en serait une autre, et la table
 * `reseauPersonnel_profiles` dit en toutes lettres pourquoi on ne le fait pas.
 */

import { HANDLE_MAX_LENGTH, HANDLE_MIN_LENGTH } from "./content"

/** Personne telle que la porte la ligne `users`. */
export interface HandleSuggestionPerson {
  firstName?: string | null
  lastName?: string | null
  /** Libellé affiché — seul recours des comptes de rôle (« Agent — DGDI »). */
  name?: string | null
}

/**
 * `Jean-Pierre` → `jeanpierre` ; `NZÉ` → `nze`.
 *
 * Même translittération que `idnToken` (identifiants souverains) et que
 * `derivePageHandle` (handles de pages) : NFD, diacritiques retirés, puis on
 * ne garde que `[a-z0-9]`. Le charset d'`assertHandle` est volontairement
 * étroit (anti-homoglyphes) — un `Ndzé` non déburré y échouerait.
 */
export function handleToken(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
}

/**
 * Découpe un état civil en composants. Espaces, apostrophes et tirets longs
 * séparent ; le trait d'union COURT ne sépare pas — « Jean-Pierre » est UN
 * prénom composé, « Jean Pierre » en fait deux. Convention déjà appliquée par
 * `seeds/demo/idnIdentifier.ts`, on ne la change pas.
 */
export function handleNameComponents(raw: string | null | undefined): string[] {
  if (!raw) return []
  return raw
    .split(/[\s’'—–_,.]+/)
    .map(handleToken)
    .filter((token) => token.length > 0)
}

/** Un candidat est-il recevable par `assertHandle` sans le lever ? */
export function isCandidateHandle(value: string): boolean {
  if (value.length < HANDLE_MIN_LENGTH || value.length > HANDLE_MAX_LENGTH) {
    return false
  }
  return /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/.test(value)
}

/** Assemble `a.b`, en laissant tomber la moitié absente. */
function join(a: string, b: string): string {
  if (!a) return b
  if (!b) return a
  return `${a}.${b}`
}

/**
 * L'échelle des identifiants proposés, du plus court au plus discriminant,
 * en ALTERNANT les deux ordres à chaque palier :
 *
 *   1. `prenom.nom`              5. `prenom.nom1nom2`
 *   2. `nom.prenom`              6. `nom1nom2.prenom`
 *   3. `prenom1prenom2.nom`      7. `prenom1prenom2.nom1nom2`
 *   4. `nom.prenom1prenom2`      8. `nom1nom2.prenom1prenom2`
 *
 * Les candidats hors bornes (trop courts, trop longs) sont écartés — un
 * identifiant de 34 caractères n'est pas une proposition, c'est un refus
 * différé. Retourne `[]` quand rien n'est dérivable : l'appelant laisse alors
 * le compte sans profil plutôt que d'en fabriquer un vide.
 */
export function handleLadder(person: HandleSuggestionPerson): string[] {
  let last = handleNameComponents(person.lastName)
  let first = handleNameComponents(person.firstName)

  // Ni nom ni prénom : compte de rôle. Le DERNIER composant du libellé tient
  // lieu de nom (« Agent — DGDI » → `dgdi.agent`), les précédents de prénom.
  if (last.length === 0 && first.length === 0) {
    const tokens = handleNameComponents(person.name)
    if (tokens.length >= 2) {
      last = [tokens[tokens.length - 1]!]
      first = tokens.slice(0, -1)
    } else {
      first = tokens
    }
  }

  const candidates: string[] = []
  const push = (value: string) => {
    if (isCandidateHandle(value) && !candidates.includes(value)) {
      candidates.push(value)
    }
  }
  /** Un palier = les deux ordres, jamais un seul. */
  const pushBothOrders = (lastPart: string, firstPart: string) => {
    push(join(firstPart, lastPart))
    push(join(lastPart, firstPart))
  }

  const l1 = last[0] ?? ""
  const f1 = first[0] ?? ""
  const l2 = last.slice(0, 2).join("")
  const f2 = first.slice(0, 2).join("")
  const lAll = last.join("")
  const fAll = first.join("")

  pushBothOrders(l1, f1)
  if (first.length >= 2) pushBothOrders(l1, f2)
  if (last.length >= 2) pushBothOrders(l2, f1)
  if (last.length >= 2 && first.length >= 2) pushBothOrders(l2, f2)
  pushBothOrders(lAll, fAll)

  return candidates
}

/**
 * Le handle PROVISOIRE de la publication d'office.
 *
 * Ordre `nom.prenom`, par cohérence avec `users.idnEmailAlias` — pas par
 * préférence sociale (cf. en-tête). Retourne `null` si rien n'est dérivable.
 */
export function provisionalHandleBase(
  person: HandleSuggestionPerson,
): string | null {
  const last = handleNameComponents(person.lastName)
  const first = handleNameComponents(person.firstName)
  const nominal = join(last[0] ?? "", first[0] ?? "")
  if (isCandidateHandle(nominal)) return nominal
  // Repli : le premier barreau recevable de l'échelle (comptes de rôle,
  // états civils d'un seul mot, noms très longs).
  return handleLadder(person)[0] ?? null
}

/**
 * L'ordre EXACT dans lequel une adresse est essayée à la publication d'office :
 * la forme nominale d'abord (cohérence `idnEmailAlias`), puis l'échelle des
 * alternatives, puis les suffixes numériques sur la nominale.
 *
 * Un seul endroit décide de cet ordre, et il est pur : l'appelant se contente
 * de demander à la base, candidat par candidat, lequel est libre.
 */
export function provisionalHandleCandidates(
  person: HandleSuggestionPerson,
  maxSuffix = 50,
): string[] {
  const ladder = handleLadder(person)
  const base = provisionalHandleBase(person)
  const ordered: string[] = []
  const push = (value: string | null) => {
    if (value && isCandidateHandle(value) && !ordered.includes(value)) {
      ordered.push(value)
    }
  }

  push(base)
  for (const candidate of ladder) push(candidate)

  const root = base ?? ladder[0]
  if (root) {
    for (let suffix = 2; suffix <= maxSuffix; suffix += 1) {
      const tail = String(suffix)
      // La troncature peut laisser un séparateur en bord, que le charset refuse.
      const trimmed = root.slice(0, HANDLE_MAX_LENGTH - tail.length)
      push(`${trimmed.replace(/[._-]+$/, "")}${tail}`)
    }
  }

  return ordered
}

/**
 * Premier candidat libre, dans l'ordre ci-dessus. `taken` contient des handles
 * NORMALISÉS (minuscules).
 *
 * Le suffixe porte sur la forme NOMINALE, pas sur la dernière de l'échelle :
 * deux homonymes stricts restent ainsi lisibles côte à côte (`ndong.paul`,
 * `ndong.paul2`).
 */
export function pickFreeHandle(
  person: HandleSuggestionPerson,
  taken: ReadonlySet<string>,
): string | null {
  for (const candidate of provisionalHandleCandidates(person)) {
    if (!taken.has(candidate)) return candidate
  }
  return null
}

// ── Accueil pré-rempli par IDN (ADR-0044 du moteur) ────────────────────────

/** Nombre de propositions au plus que l'accueil présente (ADR-0044). */
export const IDN_HANDLE_LADDER_MAX = 6

/** Forme d'un identifiant IDN (`<identifiant>@idn.ga`) : celle qu'identite.ga impose à sa création. */
const IDN_IDENTIFIER_FORM = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/
const IDN_IDENTIFIER_MAX_LENGTH = 32

/** Ce qu'IDN fournit à l'accueil — rien d'autre n'entre dans l'échelle. */
export interface IdnHandleSource {
  /** Prénom(s), tels qu'IDN les envoie (`given_name`). */
  givenNames?: string | null
  /** Nom(s) de famille (`family_name`). */
  familyName?: string | null
  /** Identifiant IDN : la partie locale de l'adresse `@idn.ga` (`moussavounze.awa`). */
  idnIdentifier?: string | null
}

/** L'identifiant IDN en minuscules, ou `null` s'il n'a pas la forme qu'IDN impose (jamais réécrit). */
function idnIdentifierOf(raw: string | null | undefined): string | null {
  if (!raw) return null
  const value = raw.trim().toLowerCase()
  return value.length >= HANDLE_MIN_LENGTH && value.length <= IDN_IDENTIFIER_MAX_LENGTH && IDN_IDENTIFIER_FORM.test(value) ? value : null
}

/**
 * L'échelle de l'accueil pré-rempli par IDN, faite des SEULS éléments d'IDN, dans cet ordre :
 *
 *   1. le(s) prénom(s) qui figure(nt) dans l'identifiant IDN (`awa`) ;
 *   2. l'identifiant IDN entier (`moussavounze.awa`) ;
 *   3. les autres prénoms ;
 *   4. l'échelle existante (`handleLadder`), prénoms et noms de famille.
 *
 * Un prénom « figure » dans l'identifiant quand il en vaut un SEGMENT (séparateurs `.`, `_`, `-`),
 * accents retirés par `handleToken` — jamais une simple sous-chaîne. Un identifiant hors de la forme
 * d'IDN est ignoré, jamais réécrit. Tout candidat passe `isCandidateHandle` ; six au plus, sans
 * doublon. Module pur : c'est l'appelant qui dit lesquels sont libres, pour SES seuls candidats.
 */
export function idnHandleLadder(source: IdnHandleSource): string[] {
  const given = handleNameComponents(source.givenNames)
  const identifier = idnIdentifierOf(source.idnIdentifier)
  const segments = identifier ? identifier.split(/[._-]+/).map(handleToken) : []
  const candidates: string[] = []
  const push = (value: string) => {
    if (candidates.length < IDN_HANDLE_LADDER_MAX && isCandidateHandle(value) && !candidates.includes(value)) candidates.push(value)
  }

  const inIdentifier = given.filter((name) => segments.includes(name))
  for (const name of inIdentifier) push(name)
  if (identifier) push(identifier)
  for (const name of given) if (!inIdentifier.includes(name)) push(name)
  for (const candidate of handleLadder({ firstName: source.givenNames, lastName: source.familyName })) push(candidate)

  return candidates
}
