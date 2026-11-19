// Dupliqué de socle/convex/modules/reseauPages/access.ts @ ad2e7fdc2 — adaptations : réécrit (owner map §6.15) — identité lue sur la PAGE au lieu d'être dérivée d'une organisation, images servies par la garde des fichiers (`servableUrl`, D05 : plus de `getUrl` brut, aucun identifiant de stockage hors d'ici) ; page lisible DEPUIS son réseau, ou depuis la racine si elle y est (`onRoot`) ; autorité = SIGNATAIRE VIVANT (habilitation acceptée, page active, adhésion active au réseau de la page, identité forte pour une page officielle) relue à chaque acte, au lieu de `communication.publish` sur une organisation ; badge CALCULÉ de la confiance ; refus indistinct à code (`notFound`), rôle manquant `pageRoleRequired` ; adresse prise refusée par `handleUnavailable` ; `pageForOrg` retiré (plus d'organisation). ; AS-10 / PG-08 : ÉQUIPE à trois rôles — `livePageTeamRole` et `requirePageTeam` voient le modérateur, `liveSignatoryRole` et `requireManagedPage` jamais ; `signatoryRowsOf` lit les trois rôles.
/**
 * Les gardes des pages — le point de passage unique.
 *
 * Aucune fonction Convex ici. Une seule définition de « cette page est
 * servable », de « elle se lit d'ici » et de « cette personne parle en son
 * nom » : deux définitions divergeraient au premier oubli, et c'est sur cette
 * différence que reposerait une fuite depuis une page retirée.
 */
import { computePageBadge } from "@antsia/social-domain/badges"
import { derivePageHandle, isPageSignatoryRole, PAGE_SIGNATORIES_MAX, PAGE_TEAM_ROLES, type PageRole, type PageTeamRole } from "@antsia/social-domain/pages"
import { buildSearchableText } from "@antsia/social-domain/searchText"

import { canReadModeratedContent } from "../moderation/policy"
import type { Doc, Id } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
import { isActiveMember } from "../../lib/access"
import { fail, notFound } from "../../lib/errors"
import { assertNativePageManagement, isFederatedPage, isFederatedContentAvailable } from "../federation/mirrorAccess"
import { servableUrl } from "../files/storageGuard"
import { hasStrongIdentityFor } from "../people/persons"
import type { PageCard } from "./validators"

type ReadCtx = Pick<QueryCtx, "db">
type UrlCtx = Pick<QueryCtx, "db" | "storage">

// ═══════════════════════════════════════════════════════════════
// Lire une page
// ═══════════════════════════════════════════════════════════════

/** Lisible depuis la racine : page de la racine, ou page à la règle `root` — dénormalisé à chaque écriture. */
export function isPageOnRoot(network: Pick<Doc<"networks">, "kind">, visibility: Doc<"pages">["visibility"]): boolean {
  return network.kind === "root" || visibility === "root"
}

/** La page se lit-elle DEPUIS ce réseau ? Le sien, ou la racine si elle y est (`onRoot`). */
export function isPageInReadingContext(page: Doc<"pages">, network: Doc<"networks">): boolean {
  if (page.networkId === network._id) return true
  return network.kind === "root" && page.onRoot
}

/**
 * La page SERVABLE (active) et lisible d'ici, ou `null` — jamais d'exception.
 * Page inconnue, retirée, ou d'un autre réseau : le même `null`. Distinguer
 * dirait à qui cherche qu'une organisation a « déjà eu » une page.
 */
export async function readablePageOrNull(ctx: ReadCtx, network: Doc<"networks">, pageId: Id<"pages">, readerPersonId?: Id<"persons">): Promise<Doc<"pages"> | null> {
  const page = await ctx.db.get(pageId)
  if (!page || page.status !== "active" || !isPageInReadingContext(page, network) || !(await canReadModeratedContent(ctx, "page", page._id, readerPersonId))) return null
  if (!(await isFederatedContentAvailable(ctx, "pages", page._id))) return null
  return page
}

export async function requireReadablePage(ctx: ReadCtx, network: Doc<"networks">, pageId: Id<"pages">): Promise<Doc<"pages">> {
  return (await readablePageOrNull(ctx, network, pageId)) ?? notFound()
}

/** La page désignée par son adresse, QUEL QUE SOIT son état — l'adresse saisie est repliée comme à la création. */
export async function findPageByHandle(ctx: ReadCtx, rawHandle: string): Promise<Doc<"pages"> | null> {
  const handle = derivePageHandle(rawHandle)
  if (handle.length === 0) return null
  return await ctx.db
    .query("pages")
    .withIndex("by_handle", (q) => q.eq("handle", handle))
    .unique()
}

export async function readablePageByHandle(ctx: ReadCtx, network: Doc<"networks">, rawHandle: string, readerPersonId?: Id<"persons">): Promise<Doc<"pages"> | null> {
  const page = await findPageByHandle(ctx, rawHandle)
  if (!page || page.status !== "active" || !isPageInReadingContext(page, network) || !(await canReadModeratedContent(ctx, "page", page._id, readerPersonId))) return null
  if (!(await isFederatedContentAvailable(ctx, "pages", page._id))) return null
  return page
}

export async function requireReadablePageByHandle(ctx: ReadCtx, network: Doc<"networks">, rawHandle: string): Promise<Doc<"pages">> {
  return (await readablePageByHandle(ctx, network, rawHandle)) ?? notFound()
}

/**
 * L'adresse est-elle libre ? Refus EXPLICITE (`handleUnavailable`), comme pour
 * l'identifiant d'une personne : qui crée ou renomme doit savoir pourquoi.
 */
export async function assertPageHandleFree(ctx: ReadCtx, handle: string, exceptPageId?: Id<"pages">): Promise<void> {
  const taken = await ctx.db
    .query("pages")
    .withIndex("by_handle", (q) => q.eq("handle", handle))
    .unique()
  if (taken && taken._id !== exceptPageId) fail("handleUnavailable")
}

/** Le texte indexé d'une page — recalculé à chaque changement de nom, de sigle ou d'adresse. */
export function pageSearchText(page: { name: string; shortName?: string; handle: string }): string {
  return buildSearchableText(page.name, page.shortName, page.handle)
}

// ═══════════════════════════════════════════════════════════════
// Signataires — l'autorité ACTUELLE
// ═══════════════════════════════════════════════════════════════

/** La ligne de signataire d'une personne pour une page, ou `null`. */
export async function signatoryRowOf(ctx: ReadCtx, pageId: Id<"pages">, personId: Id<"persons">): Promise<Doc<"pageSignatories"> | null> {
  return await ctx.db
    .query("pageSignatories")
    .withIndex("by_page_person", (q) => q.eq("pageId", pageId).eq("personId", personId))
    .unique()
}

/**
 * Le rôle VIVANT d'une personne dans l'ÉQUIPE d'une page (AS-10 / PG-08), modérateur compris,
 * ou `null` : la ligne existe et est ACCEPTÉE, la page est active et native, et la personne est
 * membre active du réseau de la page. Un membre parti du réseau, ou suspendu, ne tient plus aucun
 * rôle ; une invitation en attente ne donne rien. Pour une page OFFICIELLE, l'identité forte
 * (IDN `loa ≥ 2`) se relit aussi : un lien IDN révoqué referme le rôle.
 *
 * ⚠️ Ce lecteur rend un MODÉRATEUR : il n'ouvre que les droits de toute l'équipe (voir l'équipe,
 * se retirer, lire les notes aux abonnés, retirer un commentaire, conflit d'intérêts en
 * modération). Ses appelants sont une liste blanche, gardée par le cliquet
 * `tests/ratchets/page-authority-readers.test.ts`. Parler ou agir au nom de la page passe
 * TOUJOURS par `liveSignatoryRole`.
 */
export async function livePageTeamRole(ctx: ReadCtx, page: Doc<"pages">, personId: Id<"persons">): Promise<PageTeamRole | null> {
  if (page.status !== "active") return null
  if (await isFederatedPage(ctx, page._id)) return null
  const row = await signatoryRowOf(ctx, page._id, personId)
  if (!row || row.acceptedAt === undefined) return null
  if (!(await isActiveMember(ctx, page.networkId, personId))) return null
  if (page.trust === "official" && !(await hasStrongIdentityFor(ctx, personId))) return null
  return row.role
}

/**
 * Le rôle VIVANT de SIGNATAIRE d'une personne sur une page — qui PARLE en son nom —, ou `null`.
 * Mêmes conditions que `livePageTeamRole` ; un MODÉRATEUR y rend `null` (AS-10 : défaut fermé,
 * aucun des appelants existants ne lui ouvre un droit par mégarde).
 */
export async function liveSignatoryRole(ctx: ReadCtx, page: Doc<"pages">, personId: Id<"persons">): Promise<PageRole | null> {
  const role = await livePageTeamRole(ctx, page, personId)
  return role !== null && isPageSignatoryRole(role) ? role : null
}

/** Exige un rôle vivant (`signatory` : tout signataire ; `admin` : un administrateur). */
export async function requirePageRole(ctx: ReadCtx, page: Doc<"pages">, personId: Id<"persons">, min: PageRole): Promise<PageRole> {
  await assertNativePageManagement(ctx, page._id)
  const role = await liveSignatoryRole(ctx, page, personId)
  if (role === null || (min === "admin" && role !== "admin")) return fail("pageRoleRequired")
  return role
}

/**
 * Une page GÉRÉE depuis ce réseau : la sienne (on ne publie ni ne gère une page
 * d'un autre réseau depuis la racine), active, et l'appelant y a le rôle
 * demandé. Page inconnue, retirée ou d'ailleurs : refus indistinct.
 */
export async function requireManagedPage(
  ctx: ReadCtx,
  caller: { networkId: Id<"networks">; personId: Id<"persons"> },
  pageId: Id<"pages">,
  min: PageRole,
): Promise<{ page: Doc<"pages">; role: PageRole }> {
  const page = await ctx.db.get(pageId)
  if (!page || page.networkId !== caller.networkId || page.status !== "active") return notFound()
  return { page, role: await requirePageRole(ctx, page, caller.personId, min) }
}

/**
 * Une page de l'ÉQUIPE de cette page, quel que soit son rôle (modérateur compris) : la sienne
 * dans ce réseau, active, et l'appelant y tient un rôle vivant (`livePageTeamRole`). Page
 * inconnue, retirée ou d'ailleurs : refus indistinct ; hors de l'équipe : `pageRoleRequired`.
 * Réservé aux droits de toute l'équipe (liste de l'équipe, se retirer) — liste blanche du cliquet.
 */
export async function requirePageTeam(
  ctx: ReadCtx,
  caller: { networkId: Id<"networks">; personId: Id<"persons"> },
  pageId: Id<"pages">,
): Promise<{ page: Doc<"pages">; role: PageTeamRole }> {
  const page = await ctx.db.get(pageId)
  if (!page || page.networkId !== caller.networkId || page.status !== "active") return notFound()
  await assertNativePageManagement(ctx, page._id)
  const role = await livePageTeamRole(ctx, page, caller.personId)
  if (role === null) return fail("pageRoleRequired")
  return { page, role }
}

/**
 * Les membres de l'équipe d'une page, lignes brutes (invitations comprises), dans l'ordre
 * administrateurs, signataires, modérateurs — bornés : au plus `PAGE_SIGNATORIES_MAX + 1` par
 * rôle. AS-10 : les TROIS rôles sont lus, pour que le plafond de l'équipe compte les modérateurs
 * et que la liste les montre.
 */
export async function signatoryRowsOf(ctx: ReadCtx, pageId: Id<"pages">): Promise<Doc<"pageSignatories">[]> {
  const byRole = await Promise.all(
    PAGE_TEAM_ROLES.map(
      async (role) =>
        await ctx.db
          .query("pageSignatories")
          .withIndex("by_page_role", (q) => q.eq("pageId", pageId).eq("role", role))
          .take(PAGE_SIGNATORIES_MAX + 1),
    ),
  )
  return byRole.flat()
}

/** Combien d'administrateurs VIVANTS (acceptés, membres actifs du réseau de la page) — le garde-fou du dernier. */
export async function countLiveAdmins(ctx: ReadCtx, page: Doc<"pages">): Promise<number> {
  const admins = await ctx.db
    .query("pageSignatories")
    .withIndex("by_page_role", (q) => q.eq("pageId", page._id).eq("role", "admin"))
    .take(PAGE_SIGNATORIES_MAX + 1)
  let live = 0
  for (const row of admins) if (row.acceptedAt !== undefined && (await isActiveMember(ctx, page.networkId, row.personId))) live += 1
  return live
}

// ═══════════════════════════════════════════════════════════════
// Identité affichée
// ═══════════════════════════════════════════════════════════════

/** La CARTE d'une page (`pageCardValidator`) : le logo par la garde des fichiers (`null` sans logo, ou retenu). */
export async function pageCardOf(ctx: UrlCtx, page: Doc<"pages">): Promise<PageCard> {
  return {
    pageId: page._id,
    networkId: page.networkId,
    handle: page.handle,
    name: page.name,
    shortName: page.shortName ?? null,
    logoUrl: page.logoStorageId ? await servableUrl(ctx, page.logoStorageId) : null,
    badge: computePageBadge(page.trust),
    ownerKind: page.ownerKind,
    country: page.country ?? null,
  }
}

/**
 * Un CACHE de cartes pour une lecture de fil : dix publications d'une même page
 * ne résolvent qu'une fois sa ligne et son logo. Une page retirée rend `null` —
 * sa publication n'est alors servie par personne (jamais rabattue sur
 * l'identité de son signataire).
 */
export function pageCardCache(ctx: UrlCtx): (pageId: Id<"pages">) => Promise<PageCard | null> {
  const cache = new Map<string, PageCard | null>()
  return async (pageId) => {
    const hit = cache.get(pageId)
    if (hit !== undefined) return hit
    const page = await ctx.db.get(pageId)
    const card = page && page.status === "active" && await isFederatedContentAvailable(ctx, "pages", page._id) ? await pageCardOf(ctx, page) : null
    cache.set(pageId, card)
    return card
  }
}
