// Réécrit d'après socle/packages/agent-features/src/features/reseau-personnel/pages-panel.ts @ ad2e7fdc2 — ce qui change : miroir du DTO du moteur (`pages.pages.paginateMyPageFollows`, `discover`, `paginateDiscover` : carte de page à identité propre, badge CALCULÉ, nature, pays ; plus d'organisation ni de compteur de publications) ; identifiants génériques (`PageSummary<TPageId>`, le type exact traverse sans conversion) ; sections désignées par leur NATURE (`kind`) et titrées par l'i18n (`pagesSectionTitle`) ; recherche locale aussi sur le sigle, comme le serveur ; filtre par PAYS (codes ISO 3166-1, noms par `Intl.DisplayNames` dans la langue courante) ; libellés, compteurs et états vides traduits (`t` en DERNIER paramètre, clés qualifiées `reseau:pagesPanel.*`, nombres par le formateur `number` d'i18next) ; refus lus dans le CODE du moteur (`engineErrorRule`, `engineErrorCode`), plus jamais dans une phrase du serveur ; ajouts : vue du badge de confiance, natures et rôles nommés, invitation à signer, brouillon de création d'une page jugé par les règles du domaine (`checkPageDraft`).
/**
 * pages-panel — ce que le volet PAGES décide, hors de tout composant.
 *
 * Filtrage, sectionnement, libellés, états vides et jugement du brouillon de
 * création vivent ici, où c'est vérifiable — `PagesPanel`,
 * `PagesSuggestionsRail` et `PageFollowButton` ne font que monter des
 * requêtes et poser des gestes.
 *
 * Une PAGE du moteur a une identité PROPRE (nom, sigle, logo, description,
 * pays), une NATURE (institution, association, entreprise, média, collectif)
 * et une CONFIANCE calculée par le serveur (Officiel, Vérifié, Communauté) :
 * ce module ne la devine jamais, il la NOMME.
 *
 * Miroir CLIENT du DTO serveur (`convex/modules/pages/pages.ts`,
 * `pageSummaryValidator` — `paginateMyPageFollows`, `discover` et
 * `paginateDiscover` en partagent la forme). L'identifiant est GÉNÉRIQUE
 * (`PageSummary<TPageId>`) : un composant y fait passer `Id<"pages">` tel
 * quel, un test des chaînes nues, sans conversion ni l'un ni l'autre.
 *
 * Aucun import React ni Convex : ce module ne connaît que des données. Les
 * textes passent par `t`, reçu en DERNIER paramètre, avec des clés
 * QUALIFIÉES (`reseau:pagesPanel.…`) : n'importe quelle instance les résout.
 */

import { engineErrorCode, engineErrorRule } from "@antsia/social-contracts/errors"
import type { Badge, PageOwnerKind } from "@antsia/social-domain/badges"
import {
  assertPageHandle,
  assertPageName,
  derivePageHandle,
  isPageSignatoryRole,
  MEMBER_PAGE_OWNER_KINDS,
  normalizePageDescription,
  normalizePageShortName,
  type PageTeamRole,
} from "@antsia/social-domain/pages"
import { isDomainViolation } from "@antsia/social-domain/violation"
import type { IconName, Tone } from "@antsia/ui"
import type { TFunction } from "i18next"

import { badgeLabelKey } from "../../components/identity/post-identity"

// ═══════════════════════════════════════════════════════════════
// Le DTO, côté client
// ═══════════════════════════════════════════════════════════════

/**
 * Miroir de `pageSummaryValidator` (`convex/modules/pages/pages.ts`) — une
 * ligne d'ANNUAIRE : ce que rendent les pages suivies et la découverte.
 */
export interface PageSummary<TPageId extends string = string> {
  pageId: TPageId
  handle: string
  name: string
  shortName: string | null
  logoUrl: string | null
  description: string | null
  /** La confiance CALCULÉE par le serveur — jamais déclarée par la page. */
  badge: Badge
  ownerKind: PageOwnerKind
  /** Code ISO 3166-1 alpha-2, ou `null` : une page n'est pas tenue d'en déclarer un. */
  country: string | null
  followerCount: number
  following: boolean
}

/** La nature d'une section du volet — c'est elle qui décide, jamais son titre (traduit). */
export type PagesSectionKind = "followed" | "discover" | "results"

/** Une section du volet : sa nature, les pages qu'elle porte. */
export interface PagesSection<T extends PageSummary<string> = PageSummary> {
  kind: PagesSectionKind
  pages: readonly T[]
}

/** Les sections que le volet titre — celles de `sectionsFor`, plus « Mes pages » et les invitations. */
export type PagesPanelSectionKind = PagesSectionKind | "mine" | "invitations"

export function pagesSectionTitle(kind: PagesPanelSectionKind, t: TFunction): string {
  return t(`reseau:pagesPanel.sections.${kind}`)
}

// ═══════════════════════════════════════════════════════════════
// Recherche et filtres
// ═══════════════════════════════════════════════════════════════

/**
 * Minuscules, sans accents ni diacritiques, pour une comparaison tolérante.
 *
 * Écrit en ÉCHAPPEMENTS (`̀-ͯ`) : des marques combinantes
 * LITTÉRALES sont invisibles dans la source, et n'importe quelle
 * normalisation d'éditeur peut les effacer en silence — la recherche
 * deviendrait alors sensible aux accents sans qu'aucun test ne le voie casser.
 */
export function normalizeQuery(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
}

/**
 * Miroir CLIENT de `DISCOVER_QUERY_MIN_LENGTH` (`convex/modules/pages/
 * pages.ts`) : en deçà, le serveur ne cherche pas et sert son annuaire dans
 * l'ordre (confiance, puis récence) — on ne lui envoie donc rien, le catalogue
 * chargé se filtre sur place.
 */
export const PAGES_SEARCH_MIN_LENGTH = 2

/**
 * Le terme à TRANSMETTRE au serveur (`paginateDiscover({ query })`), ou `null`
 * quand la saisie ne mérite pas un aller-retour. Le terme part tel quel
 * (accents compris) : c'est le serveur qui replie (`foldSearchQuery`).
 */
export function pagesServerSearchTerm(raw: string): string | null {
  const term = raw.trim()
  return term.length >= PAGES_SEARCH_MIN_LENGTH ? term : null
}

/** Ce que la recherche locale lit d'une page — le texte que le serveur indexe aussi. */
export interface PageSearchable {
  name: string
  handle: string
  shortName?: string | null
}

/**
 * Filtre sur le nom, le SIGLE et l'adresse publique — par MOTS : chaque mot de
 * la requête doit se retrouver quelque part (« direction impots » trouve
 * « Direction des Impôts »), comme le fait le serveur, mot à mot, sur le même
 * texte (`pageSearchText` : nom, sigle, adresse).
 *
 * `query` vide rend la liste INCHANGÉE (même référence) : un filtre neutre ne
 * doit pas provoquer de re-rendu.
 */
export function filterPages<T extends PageSearchable>(pages: readonly T[], query: string): readonly T[] {
  const q = normalizeQuery(query)
  if (q.length === 0) return pages
  const tokens = q.split(/\s+/).filter((token) => token.length > 0)
  return pages.filter((page) => {
    const haystack = [page.name, page.shortName ?? "", page.handle].map(normalizeQuery).join(" ")
    return tokens.every((token) => haystack.includes(token))
  })
}

/**
 * Les pages d'un PAYS — `country` nul rend la liste INCHANGÉE (même
 * référence). Une page sans pays déclaré n'est d'aucun pays : un filtre posé
 * l'écarte, comme le fait le serveur (`eq("country", …)`).
 */
export function filterPagesByCountry<T extends { country: string | null }>(pages: readonly T[], country: string | null): readonly T[] {
  if (country === null) return pages
  return pages.filter((page) => page.country === country)
}

/**
 * Les sections à afficher : « Pages suivies » puis « Pages à découvrir »,
 * jamais la même page dans les deux — une suggestion déjà suivie n'a rien de
 * plus à proposer (la découverte n'exclut pas les pages suivies côté serveur,
 * c'est ici que ça se décide).
 *
 * Une recherche active REMPLACE les deux sections nommées par une section
 * UNIQUE de résultats : chercher une page ne pose pas la question « suivie ou
 * pas », seulement « est-ce la bonne ? ». Une page qui correspond à la fois
 * dans `followed` et dans `discovered` n'apparaît qu'UNE fois.
 *
 * `serverSearched` : `discovered` EST déjà la réponse du serveur à cette
 * recherche (`paginateDiscover({ query })`). Le serveur cherche sur un texte
 * replié que ce module n'a pas : le re-filtrer ici retirerait des résultats
 * justes. Il n'est alors que DÉDOUBLONNÉ contre les suivies ; seules les pages
 * suivies — un catalogue chargé une fois — se filtrent sur place.
 *
 * `country` : le serveur filtre déjà la découverte par pays ; ici, seules les
 * pages SUIVIES se filtrent (le dédoublonnage, lui, vaut contre TOUTES les
 * suivies : une page suivie d'un autre pays reste suivie).
 *
 * Une section VIDE n'est jamais rendue — `[]` en retour quand il n'y a rien à
 * montrer nulle part ; à l'appelant de rendre `emptyPagesText` dans ce cas —
 * et seulement quand le serveur a fini de répondre (`etatDePagination`).
 */
export function sectionsFor<T extends PageSummary<string>>(
  followed: readonly T[],
  discovered: readonly T[],
  query: string,
  options: { serverSearched?: boolean; country?: string | null } = {},
): PagesSection<T>[] {
  const isSearching = normalizeQuery(query).length > 0
  const followedHere = filterPagesByCountry(followed, options.country ?? null)
  const matchedFollowed = filterPages(followedHere, query)

  if (isSearching) {
    const alreadyListed = new Set<string>(matchedFollowed.map((page) => page.pageId))
    const candidates = options.serverSearched ? discovered : filterPages(discovered, query)
    const matchedDiscovered = candidates.filter((page) => !alreadyListed.has(page.pageId))
    const results = [...matchedFollowed, ...matchedDiscovered]
    return results.length > 0 ? [{ kind: "results", pages: results }] : []
  }

  const followedIds = new Set<string>(followed.map((page) => page.pageId))
  const suggestions = discovered.filter((page) => !followedIds.has(page.pageId))

  const sections: PagesSection<T>[] = []
  if (followedHere.length > 0) sections.push({ kind: "followed", pages: followedHere })
  if (suggestions.length > 0) sections.push({ kind: "discover", pages: suggestions })
  return sections
}

/** Le rail droit ne propose jamais plus de trois pages. */
export const PAGES_SUGGESTIONS_RAIL_LIMIT = 3

/**
 * Les pages du rail « Pages à suivre » : jamais une déjà suivie (le rail
 * PROPOSE, il ne rappelle pas un suivi acquis), au plus trois.
 */
export function suggestionsForRail<T extends { following: boolean }>(discovered: readonly T[]): T[] {
  return discovered.filter((page) => !page.following).slice(0, PAGES_SUGGESTIONS_RAIL_LIMIT)
}

// ═══════════════════════════════════════════════════════════════
// Libellés
// ═══════════════════════════════════════════════════════════════

/**
 * Le libellé du bouton de suivi — le MÊME mot sur tous les écrans qui
 * proposent ce geste (volet, rail, fiche de la page).
 *
 * Rien d'autre ne doit décider ce texte : `PageFollowButton` n'a pas d'état
 * optimiste, le libellé ne change qu'après la réponse du serveur (`following`
 * y est un prop contrôlé, jamais une copie locale avancée par anticipation).
 */
export function followLabel(following: boolean, t: TFunction): string {
  return t(following ? "reseau:pagesPanel.following" : "reseau:pagesPanel.follow")
}

/**
 * « Aucun abonné », « 1 abonné », « 4 812 abonnés » — le nombre EXACT, mis en
 * forme dans la langue courante. Zéro se dit en toutes lettres : un compteur
 * nu à zéro sonne comme une panne.
 */
export function formatFollowerCount(count: number, t: TFunction): string {
  if (count <= 0) return t("reseau:pagesPanel.followersNone")
  return t("reseau:pagesPanel.followers", { count })
}

/** La nature d'une page, nommée (institution, association, entreprise, média, collectif). */
export function ownerKindLabel(kind: PageOwnerKind, t: TFunction): string {
  return t(`reseau:pagesPanel.ownerKind.${kind}`)
}

/** Le rôle d'un membre de l'équipe : administrateur (publie et gère), signataire (publie) ou modérateur (AS-10 : retire les commentaires). */
export function pageRoleLabel(role: PageTeamRole, t: TFunction): string {
  return t(`reseau:pagesPanel.role.${role}`)
}

/** Ce qu'une invitation propose — le rôle offert, nommé ; un modérateur ne publiera pas au nom de la page, le texte le dit. */
export function pageInvitationText(role: PageTeamRole, t: TFunction): string {
  if (!isPageSignatoryRole(role)) return t("reseau:pagesPanel.invitation.moderatorText")
  return t("reseau:pagesPanel.invitation.text", { role: pageRoleLabel(role, t) })
}

/** Ce que dit l'acceptation d'une invitation : publier au nom de la page, ou en modérer les commentaires. */
export function pageInvitationAcceptedText(role: PageTeamRole, t: TFunction): string {
  return t(isPageSignatoryRole(role) ? "reseau:pagesPanel.invitation.accepted" : "reseau:pagesPanel.invitation.acceptedModerator")
}

/** Ce qu'un badge de page MONTRE — son libellé (espace `social`), son ton et son pictogramme. */
export interface PageBadgeView {
  labelKey: string
  tone: Tone
  icon: IconName
}

const PAGE_BADGE_LOOKS: Readonly<Record<Badge, { tone: Tone; icon: IconName }>> = Object.freeze({
  official: { tone: "primary", icon: "shieldCheck" },
  verified: { tone: "primary", icon: "checkCircle" },
  public_agent: { tone: "info", icon: "userCheck" },
  community: { tone: "neutral", icon: "users" },
})

/**
 * Le badge d'une page tel que le serveur l'a CALCULÉ. Une page de la
 * communauté le DIT (« Communauté ») : face à une page qui emprunterait le nom
 * d'une institution, l'absence d'« Officiel » ne suffit pas, il faut voir ce
 * qu'elle est.
 */
export function pageBadgeView(badge: Badge): PageBadgeView {
  return { labelKey: badgeLabelKey(badge), ...PAGE_BADGE_LOOKS[badge] }
}

// ═══════════════════════════════════════════════════════════════
// Pays
// ═══════════════════════════════════════════════════════════════

/**
 * Les codes ISO 3166-1 alpha-2 attribués (249) — la forme que le domaine
 * accepte (`assertCountryCode` : deux lettres capitales). Des CODES, pas des
 * libellés : le nom de chaque pays vient d'`Intl.DisplayNames`, dans la langue
 * courante.
 */
export const PAGE_COUNTRY_CODES: readonly string[] = Object.freeze(
  (
    "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ " +
    "CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR " +
    "GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT " +
    "JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY " +
    "MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM " +
    "PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ " +
    "TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW"
  ).split(" "),
)

const regionNamesByLocale = new Map<string, Intl.DisplayNames | null>()

function regionNames(locale: string): Intl.DisplayNames | null {
  const cached = regionNamesByLocale.get(locale)
  if (cached !== undefined) return cached
  let names: Intl.DisplayNames | null
  try {
    names = new Intl.DisplayNames([locale], { type: "region" })
  } catch {
    names = null
  }
  regionNamesByLocale.set(locale, names)
  return names
}

/** Le nom d'un pays dans la langue courante ; à défaut, son code (jamais une case vide). */
export function countryName(code: string, locale: string): string {
  try {
    return regionNames(locale)?.of(code) ?? code
  } catch {
    return code
  }
}

export interface CountryOption {
  code: string
  label: string
}

const countryOptionsByLocale = new Map<string, readonly CountryOption[]>()

/** Les pays à proposer, NOMMÉS et TRIÉS dans la langue courante (mémorisé par langue). */
export function countryOptions(locale: string): readonly CountryOption[] {
  const cached = countryOptionsByLocale.get(locale)
  if (cached !== undefined) return cached
  let collator: Intl.Collator
  try {
    collator = new Intl.Collator(locale)
  } catch {
    collator = new Intl.Collator()
  }
  const options = Object.freeze(
    PAGE_COUNTRY_CODES.map((code) => ({ code, label: countryName(code, locale) })).sort((a, b) => collator.compare(a.label, b.label)),
  )
  countryOptionsByLocale.set(locale, options)
  return options
}

/**
 * La ligne discrète sous le nom d'une page : sa nature, son pays s'il en
 * déclare un, ses abonnés — « Association · Gabon · 12 abonnés ».
 */
export function pageMetaLine(
  page: { ownerKind: PageOwnerKind; country: string | null; followerCount: number },
  locale: string,
  t: TFunction,
): string {
  const parts = [ownerKindLabel(page.ownerKind, t)]
  if (page.country !== null) parts.push(countryName(page.country, locale))
  parts.push(formatFollowerCount(page.followerCount, t))
  return parts.join(" · ")
}

// ═══════════════════════════════════════════════════════════════
// États vides, pannes, refus
// ═══════════════════════════════════════════════════════════════

/**
 * Le texte d'état vide — distinct selon qu'on cherche, qu'on filtre par pays
 * ou non.
 *
 * Une recherche sans résultat n'est pas la même situation qu'un volet
 * simplement neuf : la première invite à corriger la requête, la seconde à
 * découvrir des pages. L'état vide DIT ce qui manque plutôt que d'affirmer
 * platement « rien ici ».
 */
export function emptyPagesText(query: string, hasFollowed: boolean, countryLabel: string | null, t: TFunction): string {
  if (normalizeQuery(query).length > 0) {
    return t("reseau:pagesPanel.empty.search", { query: query.trim() })
  }
  if (countryLabel !== null) return t("reseau:pagesPanel.empty.country", { country: countryLabel })
  return t(hasFollowed ? "reseau:pagesPanel.empty.nothingNew" : "reseau:pagesPanel.empty.firstTime")
}

/** Taille d'une page de découverte servie par `paginateDiscover` — et le pas de « Afficher plus ». */
export const PAGES_DISCOVER_PAGE_SIZE = 12

/**
 * Les pages SUIVIES : un catalogue chargé UNE fois (la première page de
 * `paginateMyPageFollows`, plafonnée à 50 par le serveur), filtré sur place
 * par la recherche et le pays, paginé sur place par douze (pagination du kit
 * d'espace).
 */
export const PAGES_FOLLOWED_CATALOG_SIZE = 50
export const PAGES_FOLLOWED_PAGE_SIZE = 12

/** Le catalogue des suivies est tronqué : on le DIT, au lieu de laisser croire qu'il est complet. */
export function followedTruncatedText(t: TFunction): string {
  return t("reseau:pagesPanel.followedTruncated", { limit: PAGES_FOLLOWED_CATALOG_SIZE })
}

/** Les sources que le volet lit — chacune sa panne, dite par sa propre phrase. */
export type PagesSource = "followed" | "discover" | "mine" | "invitations"

/**
 * Ce qu'une PANNE dit — jamais l'état vide. Quatre sources, quatre phrases :
 * les pages suivies, mes pages et mes invitations (des requêtes, dont l'échec
 * se pose en bandeau sans vider ce qu'elles tiennent), et la découverte (une
 * pagination, dont l'échec lève et se tient dans
 * `ReseauPaginatedErrorBoundary`).
 */
export function pagesErrorText(source: PagesSource, t: TFunction): { title: string; message: string } {
  return {
    title: t(`reseau:pagesPanel.errors.${source}.title`),
    message: t(`reseau:pagesPanel.errors.${source}.message`),
  }
}

/** Refus générique — quand le serveur n'a nommé ni règle ni code reconnu. */
export const PAGE_ACTION_ERROR_FALLBACK_KEY = "reseau:pagesPanel.actionFailed"

/**
 * Le texte d'un refus, tel qu'on peut le MONTRER.
 *
 * Le moteur ne compose pas de phrase : il lève une `ConvexError` dont la
 * charge porte un CODE (`notFound`, `rateLimited`, `statusInsufficient`…) et,
 * pour une règle du domaine, son nom et ses bornes. On lit l'un ou l'autre et
 * on le fait traduire ; faute de charge reconnue, la phrase neutre du volet.
 * Jamais `error.message` (trace serveur en développement, « Server Error » en
 * production), jamais une chaîne arrivée telle quelle dans `data`.
 */
export function pageActionErrorMessage(err: unknown, t: TFunction): string {
  const rule = engineErrorRule(err)
  if (rule !== null) return t(`rules:${rule.rule}`, rule.params)
  const code = engineErrorCode(err)
  if (code !== null) return t(`errors:${code}`)
  return t(PAGE_ACTION_ERROR_FALLBACK_KEY)
}

/** Le refus d'un abonnement — le même lecteur que tout geste sur une page. */
export const followActionErrorMessage = pageActionErrorMessage

// ═══════════════════════════════════════════════════════════════
// Créer une page
// ═══════════════════════════════════════════════════════════════

/** Les natures qu'un MEMBRE crée (une institution naît d'une décision tracée). */
export type MemberPageOwnerKind = (typeof MEMBER_PAGE_OWNER_KINDS)[number]

export const MEMBER_OWNER_KINDS: readonly MemberPageOwnerKind[] = MEMBER_PAGE_OWNER_KINDS

/** Le brouillon du formulaire de création, tel que la personne le saisit. */
export interface PageDraft {
  name: string
  ownerKind: MemberPageOwnerKind
  /** L'adresse proposée ; vide, elle se déduit du nom. */
  handle: string
  shortName: string
  description: string
  /** Code de pays, ou `null` : aucun pays. */
  country: string | null
}

export function emptyPageDraft(): PageDraft {
  return { name: "", ownerKind: "association", handle: "", shortName: "", description: "", country: null }
}

/** Les arguments de `pages.pages.createPage` (hors réseau), déjà jugés. */
export interface CreatePageArgs {
  name: string
  ownerKind: MemberPageOwnerKind
  handle: string
  shortName?: string
  description?: string
  country?: string
}

export type PageDraftField = "name" | "handle" | "shortName" | "description"

export type PageDraftCheck = { ok: true; args: CreatePageArgs } | { ok: false; errors: Partial<Record<PageDraftField, string>> }

/** Le texte d'une règle du domaine enfreinte (espace `rules`, bornes interpolées). */
function violationText(error: unknown, t: TFunction): string {
  if (isDomainViolation(error)) return t(`rules:${error.code}`, error.params)
  return t(PAGE_ACTION_ERROR_FALLBACK_KEY)
}

/**
 * L'adresse que la page PRENDRA : celle saisie, sinon celle que le nom donne
 * (`derivePageHandle`, le même repli que le serveur) — `null` tant qu'il n'y a
 * rien à montrer.
 */
export function pageHandlePreview(draft: Pick<PageDraft, "name" | "handle">): string | null {
  const source = draft.handle.trim().length > 0 ? draft.handle : draft.name
  const handle = derivePageHandle(source)
  return handle.length > 0 ? handle : null
}

/**
 * Juge le brouillon AVANT l'envoi, avec les règles mêmes du serveur
 * (`@antsia/social-domain/pages`) : un refus se dit sous son champ, dans la
 * langue de l'écran, sans aller-retour. Le serveur rejuge tout de toute façon
 * (adresse prise, statut d'adhésion, débit).
 *
 * L'adresse n'est jugée sur le NOM que si le nom est valable : un nom vide
 * dirait deux fois la même faute.
 */
export function checkPageDraft(draft: PageDraft, t: TFunction): PageDraftCheck {
  const errors: Partial<Record<PageDraftField, string>> = {}

  let name: string | null = null
  try {
    name = assertPageName(draft.name)
  } catch (error) {
    errors.name = violationText(error, t)
  }

  let handle: string | null = null
  const typedHandle = draft.handle.trim()
  if (typedHandle.length > 0 || name !== null) {
    try {
      handle = assertPageHandle(typedHandle.length > 0 ? typedHandle : (name ?? ""))
    } catch (error) {
      errors.handle = violationText(error, t)
    }
  }

  let shortName: string | undefined
  try {
    shortName = normalizePageShortName(draft.shortName)
  } catch (error) {
    errors.shortName = violationText(error, t)
  }

  let description: string | undefined
  try {
    description = normalizePageDescription(draft.description)
  } catch (error) {
    errors.description = violationText(error, t)
  }

  if (name === null || handle === null || Object.keys(errors).length > 0) return { ok: false, errors }
  return {
    ok: true,
    args: {
      name,
      ownerKind: draft.ownerKind,
      handle,
      ...(shortName !== undefined ? { shortName } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(draft.country !== null ? { country: draft.country } : {}),
    },
  }
}
