/**
 * Annuaire des membres de DIASPORA.GA (EXF-DG-19, EXF-DG-46) — opt-in, par niveau.
 *
 * La recherche générique du moteur (`searchPeople`) refuse ce réseau : le niveau
 * « pays » dépend du LECTEUR, que la projection générique `peopleDirectory` ne
 * connaît pas. Elle sert ici de PRÉ-FILTRE — `listed`, posé par la tranche au
 * choix d'un niveau visible (`syncDirectoryListing`) — et chaque candidat est
 * REJUGÉ par la règle du domaine (`isListedInDirectoryFor`) : niveau choisi,
 * consentement EN VIGUEUR (un retrait passé par le chemin générique compte
 * aussitôt), statut, pays du lecteur, blocage dans la paire. Un identifiant exact
 * passe par la même règle : masqué reste masqué, comme un identifiant inconnu.
 *
 * Le résultat ne porte que la facette PROJETÉE pour le lecteur (`projectFacet`),
 * aucune coordonnée — le contact passe par la messagerie. La recherche rend une
 * page bornée, sans curseur : on affine la recherche.
 *
 * CH-816 P3 — l'annuaire se PARCOURT aussi (`browseMembers`) : par pays ouvert,
 * par ville, « vérifiés seulement », vingt par page sur un curseur. Même
 * pré-filtre (`listed`, et le lieu posé par la tranche, `syncDirectoryPlace`),
 * même règle pour chaque candidat ; puis les filtres ne lisent que la facette
 * projetée pour le lecteur (`matchesDirectoryBrowse`) : un pays ou une ville
 * qu'un membre ne montre pas ne le font jamais trouver.
 */
import { normalizeHandle } from "@antsia/social-domain/content"
import { foldSearchQuery } from "@antsia/social-domain/searchText"
import {
  type CountryCode,
  type DiasporaFacet,
  type DirectoryBrowseFilters,
  DIRECTORY_PAGE_SIZE_MAX,
  type FacetProjection,
  isListedInDirectoryFor,
  isResidenceCountry,
  isVerifiedMember,
  matchesDirectoryBrowse,
  matchesDirectoryCountry,
  type MembershipStatus,
  normalizeCountryCode,
  parseDirectoryBrowse,
  projectFacet,
  withMembershipTrust,
} from "@diaspora-ga/domain"
import { v } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
import { networkQuery } from "../../lib/functions"
import { badgeValidator } from "../../lib/validators"
import { isBlockedBetween, isConnectedTo } from "../graph/graph"
import { isDiscoverablePerson, miniProfileCache, type PersonMiniProfile } from "../people/miniProfile"
import { assertDiasporaNetwork, consentInForce, effectiveStatusIn, facetOf, privacyOf } from "./facts"
import { facetProjectionValidator, toProjection } from "./profile"

/** Une requête plus courte ne cherche pas : « chercher sans chercher » viderait l'annuaire. */
export const DIRECTORY_QUERY_MIN_LENGTH = 2

/** Candidats lus par recherche, avant la règle : une borne de lecture, pas un parcours. */
const DIRECTORY_SCAN = 60

export const directoryEntryValidator = v.object({
  personId: v.id("persons"),
  handle: v.string(),
  displayName: v.string(),
  headline: v.union(v.string(), v.null()),
  avatarUrl: v.union(v.string(), v.null()),
  badges: v.array(badgeValidator),
  /** Les seuls champs de la facette que le lecteur a le droit de voir. */
  facet: facetProjectionValidator,
})

/** Le lecteur, tel que la règle de l'annuaire le juge. */
export interface DirectoryReader {
  readonly personId: Id<"persons">
  readonly status: MembershipStatus
  readonly facet: DiasporaFacet
}

/** Le lecteur de la session : membre actif, avec sa facette ; sinon `null`. */
export async function directoryReader(
  ctx: QueryCtx,
  network: Doc<"networks">,
  personId: Id<"persons">,
): Promise<DirectoryReader | null> {
  const [facet, { status }] = await Promise.all([facetOf(ctx, network._id, personId), effectiveStatusIn(ctx, network, personId)])
  return facet && status ? { personId, status, facet } : null
}

/** Un membre que l'annuaire montre au lecteur : sa facette entière (pour juger), ce que le lecteur en voit, et son statut. */
export interface ListedMember {
  readonly personId: Id<"persons">
  readonly facet: DiasporaFacet
  readonly projection: FacetProjection
  /** Le statut qui compte à cette lecture (suspension à la racine comprise) : il porte la confiance. */
  readonly status: MembershipStatus
}

/**
 * LA règle de l'annuaire, pour un candidat : profil découvrable, niveau choisi,
 * consentement EN VIGUEUR, statut, pays du lecteur, blocage dans la paire —
 * puis la facette projetée pour le lecteur. `null` : absent pour ce lecteur.
 */
export async function listedMemberFor(
  ctx: QueryCtx,
  network: Doc<"networks">,
  reader: DirectoryReader,
  personId: Id<"persons">,
): Promise<ListedMember | null> {
  const isSelf = personId === reader.personId
  const [person, privacy, facet] = await Promise.all([ctx.db.get(personId), privacyOf(ctx, network._id, personId), facetOf(ctx, network._id, personId)])
  if (!person || !isDiscoverablePerson(person) || !privacy || !facet) return null
  const { status } = await effectiveStatusIn(ctx, network, personId)
  if (!status) return null
  const listed = isListedInDirectoryFor(
    {
      status,
      visibility: privacy.directoryVisibility,
      consentActive: await consentInForce(ctx, network._id, personId, "directory"),
      country: facet.countryOfResidence,
    },
    {
      status: reader.status,
      country: reader.facet.countryOfResidence,
      isSelf,
      blockedWithTarget: !isSelf && (await isBlockedBetween(ctx, reader.personId, personId)),
    },
  )
  if (!listed) return null
  const projection = projectFacet(facet, {
    isSelf,
    isConnection: !isSelf && (await isConnectedTo(ctx, network._id, reader.personId, personId)),
    isSameCountryMember: reader.facet.countryOfResidence === facet.countryOfResidence,
    isActiveMember: true,
  })
  return { personId, facet, projection, status }
}

type DirectoryEntry = typeof directoryEntryValidator.type

/**
 * La carte d'un membre listé, pour la recherche comme pour le parcours : son
 * profil publié, sa facette projetée, et ses badges recalculés à la lecture —
 * ceux du moteur, plus « Vérifié » quand son statut dans le réseau l'est
 * (`withMembershipTrust`, règle de `personBadges`). `null` sans nom publié.
 */
function directoryEntry(member: ListedMember, profile: PersonMiniProfile): DirectoryEntry | null {
  if (!profile.handle || !profile.displayName) return null
  return {
    personId: member.personId,
    handle: profile.handle,
    displayName: profile.displayName,
    headline: profile.headline,
    avatarUrl: profile.avatarUrl,
    badges: withMembershipTrust(profile.badges, member.status),
    facet: toProjection(member.projection),
  }
}

/**
 * Chercher un membre par son nom ou son identifiant, parmi ceux qui ont choisi
 * d'être trouvés par ce lecteur. Réservé aux membres actifs (« déclaré » ou
 * « vérifié ») : un compte en attente lit le réseau, il ne consulte pas
 * l'annuaire. Le filtre de pays restreint, il n'ouvre jamais rien, et il se
 * juge sur la facette projetée pour le lecteur (`matchesDirectoryCountry`).
 */
export const searchMembers = networkQuery({
  minStatus: "declaree",
  args: { query: v.string(), country: v.optional(v.string()) },
  returns: v.array(directoryEntryValidator),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    const term = args.query.trim().replace(/^@/, "")
    if (term.length < DIRECTORY_QUERY_MIN_LENGTH) return []
    let only: CountryCode | null = null
    if (args.country !== undefined) {
      const code = normalizeCountryCode(args.country)
      if (!isResidenceCountry(code)) return []
      only = code
    }
    const reader = await directoryReader(ctx, ctx.network, ctx.person._id)
    if (!reader) return []

    const rows = await ctx.db
      .query("peopleDirectory")
      .withSearchIndex("search_name", (q) => q.search("searchName", foldSearchQuery(term)).eq("networkId", ctx.networkId).eq("listed", true))
      .take(DIRECTORY_SCAN)
    const candidates: Id<"persons">[] = rows.map((row) => row.personId)
    // L'identifiant est une ADRESSE : cherché exactement, en tête — et jugé par la même règle.
    const exact = await ctx.db
      .query("persons")
      .withIndex("by_handle", (q) => q.eq("handle", normalizeHandle(term)))
      .unique()
    if (exact && !candidates.includes(exact._id)) candidates.unshift(exact._id)

    const profileOf = miniProfileCache(ctx)
    const entries: DirectoryEntry[] = []
    for (const personId of candidates) {
      if (entries.length >= DIRECTORY_PAGE_SIZE_MAX) break
      const member = await listedMemberFor(ctx, ctx.network, reader, personId)
      // Le filtre de pays se juge sur ce que le lecteur VOIT, comme au parcours : un pays masqué ne se révèle pas.
      if (!member || (only !== null && !matchesDirectoryCountry(member.projection, only))) continue
      const entry = directoryEntry(member, await profileOf(personId))
      if (entry) entries.push(entry)
    }
    return entries
  },
})

// ═══════════════════════════════════════════════════════════════
// Parcourir l'annuaire (CH-816, lot P3)
// ═══════════════════════════════════════════════════════════════

/** Lignes d'annuaire lues par page du parcours, avant la règle : une borne de lecture, comme la recherche. */
const BROWSE_SCAN = DIRECTORY_SCAN

/** Version du curseur du parcours : la date de création de la dernière ligne lue (ordre décroissant). */
const BROWSE_CURSOR_PREFIX = "v1:"

export const browsePageValidator = v.object({
  page: v.array(directoryEntryValidator),
  /** Vrai quand l'index n'a plus rien à lire pour ce parcours. */
  isDone: v.boolean(),
  /** Le curseur de la page suivante ; vide à la fin. */
  continueCursor: v.string(),
})

type BrowsePage = typeof browsePageValidator.type

/** Une fin de parcours sans membre : un filtre refusé, un lecteur sans facette, un curseur illisible. */
const NOTHING_TO_BROWSE: BrowsePage = { page: [], isDone: true, continueCursor: "" }

function encodeBrowseCursor(creationTime: number): string {
  return `${BROWSE_CURSOR_PREFIX}${creationTime}`
}

/** `null` : première page ; `"invalid"` : un curseur qui n'est pas le nôtre. */
function decodeBrowseCursor(raw: string | null | undefined): number | null | "invalid" {
  if (raw === null || raw === undefined || raw === "") return null
  if (!raw.startsWith(BROWSE_CURSOR_PREFIX)) return "invalid"
  const position = Number(raw.slice(BROWSE_CURSOR_PREFIX.length))
  return Number.isFinite(position) && position > 0 ? position : "invalid"
}

/**
 * Les lignes listées d'un pays (ou d'un pays et d'une ville repliée), des plus
 * récentes, après le curseur. Sans ville, l'index ne suit pas la ville : l'ordre
 * des cartes ne trahit pas une ville masquée.
 */
function browseRows(ctx: QueryCtx, networkId: Id<"networks">, filters: DirectoryBrowseFilters, before: number | null) {
  const { country, cityKey } = filters
  if (cityKey === null) {
    return ctx.db
      .query("peopleDirectory")
      .withIndex("by_network_listed_country", (q) => {
        const range = q.eq("networkId", networkId).eq("listed", true).eq("country", country)
        return before === null ? range : range.lt("_creationTime", before)
      })
      .order("desc")
  }
  return ctx.db
    .query("peopleDirectory")
    .withIndex("by_network_listed_country_city", (q) => {
      const range = q.eq("networkId", networkId).eq("listed", true).eq("country", country).eq("cityKey", cityKey)
      return before === null ? range : range.lt("_creationTime", before)
    })
    .order("desc")
}

/**
 * Parcourir les membres d'un pays OUVERT — d'une ville, des seuls vérifiés —
 * parmi ceux qui ont choisi d'être trouvés par ce lecteur. Même réserve que la
 * recherche : membres actifs seulement. Vingt cartes au plus par page, lues sur
 * `BROWSE_SCAN` lignes au plus : une page peut être courte, voire vide, et
 * annoncer sa suite (`isDone`). Chaque candidat passe LA règle de l'annuaire
 * (`listedMemberFor`), puis les filtres sur ce que le lecteur en voit ; la
 * confiance (« vérifiés seulement ») est celle calculée à la lecture.
 */
export const browseMembers = networkQuery({
  minStatus: "declaree",
  args: {
    country: v.string(),
    city: v.optional(v.string()),
    verifiedOnly: v.optional(v.boolean()),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  returns: browsePageValidator,
  handler: async (ctx, args): Promise<BrowsePage> => {
    assertDiasporaNetwork(ctx.network)
    const filters = parseDirectoryBrowse(
      { country: args.country, city: args.city ?? null, verifiedOnly: args.verifiedOnly === true },
      ctx.network.openCountries ?? [],
    )
    if (!filters.ok) return NOTHING_TO_BROWSE
    const before = decodeBrowseCursor(args.cursor)
    if (before === "invalid") return NOTHING_TO_BROWSE
    const reader = await directoryReader(ctx, ctx.network, ctx.person._id)
    if (!reader) return NOTHING_TO_BROWSE

    const rows = await browseRows(ctx, ctx.networkId, filters.value, before).take(BROWSE_SCAN)
    const profileOf = miniProfileCache(ctx)
    const page: DirectoryEntry[] = []
    let consumed = 0
    let last: number | null = null
    for (const row of rows) {
      if (page.length >= DIRECTORY_PAGE_SIZE_MAX) break
      consumed += 1
      last = row._creationTime
      const member = await listedMemberFor(ctx, ctx.network, reader, row.personId)
      if (!member) continue
      const profile = await profileOf(row.personId)
      if (!matchesDirectoryBrowse({ projection: member.projection, verified: isVerifiedMember(member.status, profile.badges) }, filters.value)) continue
      const entry = directoryEntry(member, profile)
      if (entry) page.push(entry)
    }
    // Fini quand l'index n'a plus de ligne : moins de lignes que la borne, toutes lues.
    const isDone = rows.length < BROWSE_SCAN && consumed === rows.length
    return { page, isDone, continueCursor: isDone || last === null ? "" : encodeBrowseCursor(last) }
  },
})
