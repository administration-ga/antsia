/**
 * Les PAGES d'un hub pays, et ce que DIASPORALE ajoute à la fiche d'une page (DG-007).
 *
 * - `listCountryPages` : les pages ACTIVES et LISIBLES d'un pays du réseau, par
 *   nature (officielles, associations, entreprises). Une fenêtre BORNÉE de
 *   l'index des pages par pays (confiance, puis récence), chaque candidate
 *   repassée par LA garde de lecture des pages (`readablePageOrNull` : active, du
 *   réseau, ni retirée ni en relecture par la modération, ni signalée par ce
 *   lecteur). Rien n'y est compté : les compteurs du hub sont MATÉRIALISÉS par le
 *   passage nocturne (`hubs.ts`).
 * - `pageStanding` : la revendicabilité d'une page pour CE lecteur, jugée par la
 *   règle du moteur (`assertPageClaimable`) et par celle de DIASPORALE (une
 *   institution ne se revendique jamais) ; et (AS-11a) si la page est SANS
 *   RESPONSABLE (`orphan`), pour le bandeau de la fiche.
 *
 * Les gardes sont IMPORTÉES du module des pages, jamais réécrites : une seule
 * définition de « cette page se lit d'ici » et de « cette personne parle en son nom ».
 */
import { parseResidenceCountry } from "@diasporale/domain"
import { type Infer, v } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
import { notFound } from "../../lib/errors"
import { networkQuery } from "../../lib/functions"
import { isFederatedPage } from "../federation/mirrorAccess"
import { countLiveAdmins, liveSignatoryRole, pageCardOf, readablePageByHandle, readablePageOrNull } from "../pages/access"
import { pagePresentationOf } from "../pages/presentation"
import { countPageFollowers } from "../posts/counters"
import { assertDiasporaNetwork } from "./facts"
import { hubPagesViewValidator, hubPageValidator, pageStandingValidator } from "./validators"

/** Pages actives d'un pays examinées par lecture : une fenêtre de l'index, bornée. */
export const HUB_PAGES_SCAN = 120

/** Pages montrées par nature dans le hub ; au-delà, l'annuaire des pages prend le relais. */
export const HUB_PAGES_PER_KIND = 12

type HubKind = "officialPages" | "associations" | "companies"
type HubPage = Infer<typeof hubPageValidator>

const HUB_KINDS: readonly HubKind[] = ["officialPages", "associations", "companies"]

/** La liste d'une page dans le hub : « Officiel » d'abord (sa confiance), sinon sa nature ; une autre nature n'en a pas. */
function hubKindOf(page: Doc<"pages">): HubKind | null {
  if (page.trust === "official") return "officialPages"
  if (page.ownerKind === "association") return "associations"
  if (page.ownerKind === "company") return "companies"
  return null
}

/**
 * Revendicable par CE lecteur — ce que `requestPageClaim` admettrait : confiance
 * « communauté » (une page vérifiée ou officielle ne se revendique pas), page
 * native (un reflet reste sous l'autorité de sa source), et soit aucun
 * administrateur vivant, soit le lecteur est cet administrateur (sa demande est
 * alors une demande de vérification). Une institution ne se revendique jamais
 * dans DIASPORALE (cahier §12.3).
 */
export async function isPageClaimableBy(ctx: Pick<QueryCtx, "db">, page: Doc<"pages">, readerPersonId: Id<"persons">): Promise<boolean> {
  if (page.status !== "active" || page.trust !== "community" || page.ownerKind === "institution") return false
  if (await isFederatedPage(ctx, page._id)) return false
  if ((await countLiveAdmins(ctx, page)) === 0) return true
  return (await liveSignatoryRole(ctx, page, readerPersonId)) === "admin"
}

/**
 * AS-11a — une page SANS RESPONSABLE : aucun administrateur vivant (`countLiveAdmins`), page
 * native (un reflet reste sous l'autorité de sa source), hors institution (reprise par la
 * console). Un booléen seulement : ni nombre ni identité de l'équipe ne sortent d'ici.
 */
export async function isPageOrphan(ctx: Pick<QueryCtx, "db">, page: Doc<"pages">): Promise<boolean> {
  if (page.ownerKind === "institution") return false
  if (await isFederatedPage(ctx, page._id)) return false
  return (await countLiveAdmins(ctx, page)) === 0
}

/** La projection d'une page du hub : carte allowlistée, description, abonnés de l'agrégat, revendicabilité. */
async function hubPageOf(ctx: QueryCtx, page: Doc<"pages">, readerPersonId: Id<"persons">): Promise<HubPage> {
  const [card, followerCount, claimable] = await Promise.all([
    pageCardOf(ctx, page),
    countPageFollowers(ctx, page._id),
    isPageClaimableBy(ctx, page, readerPersonId),
  ])
  return { ...card, ...pagePresentationOf(page), description: page.description ?? null, followerCount, claimable }
}

/**
 * Les pages publiées et lisibles d'un pays, par nature — au plus
 * `HUB_PAGES_PER_KIND` par liste, sur une fenêtre de `HUB_PAGES_SCAN` pages
 * actives. `more` dit, par liste, que la fenêtre n'a pas tout montré : une page de
 * plus a été vue, ou la fenêtre s'est arrêtée avant la fin du pays. Un pays
 * inconnu (ou le Gabon) reçoit le refus indistinct, comme le hub.
 */
export const listCountryPages = networkQuery({
  args: { country: v.string() },
  returns: hubPagesViewValidator,
  handler: async (ctx, { country }) => {
    assertDiasporaNetwork(ctx.network)
    const parsed = parseResidenceCountry(country)
    if (!parsed.ok) return notFound()
    const window = await ctx.db
      .query("pages")
      .withIndex("by_network_status_country_trustRank_createdAt", (q) =>
        q.eq("networkId", ctx.networkId).eq("status", "active").eq("country", parsed.value),
      )
      .order("desc")
      .take(HUB_PAGES_SCAN + 1)
    const lists: Record<HubKind, HubPage[]> = { officialPages: [], associations: [], companies: [] }
    const more: Record<HubKind, boolean> = { officialPages: false, associations: false, companies: false }
    for (const row of window.slice(0, HUB_PAGES_SCAN)) {
      const kind = hubKindOf(row)
      if (kind === null || more[kind]) continue
      // LA garde des pages, relue pour CE lecteur (retrait, modération, signalement).
      const page = await readablePageOrNull(ctx, ctx.network, row._id, ctx.person._id)
      if (!page) continue
      if (lists[kind].length >= HUB_PAGES_PER_KIND) {
        more[kind] = true
        continue
      }
      lists[kind].push(await hubPageOf(ctx, page, ctx.person._id))
    }
    // La fenêtre s'est arrêtée avant la fin du pays : d'autres pages peuvent exister, de toute nature.
    if (window.length > HUB_PAGES_SCAN) for (const kind of HUB_KINDS) more[kind] = true
    return { country: parsed.value, ...lists, more }
  },
})

/**
 * Ce que DIASPORALE ajoute à la fiche d'une page lisible d'ici ; inconnue, retirée, en sommeil ou
 * d'ailleurs : le même `null`. `orphan` (AS-11a) se montre à tout lecteur.
 */
export const pageStanding = networkQuery({
  args: { handle: v.string() },
  returns: v.union(pageStandingValidator, v.null()),
  handler: async (ctx, { handle }) => {
    assertDiasporaNetwork(ctx.network)
    const page = await readablePageByHandle(ctx, ctx.network, handle, ctx.person._id)
    if (!page) return null
    const [claimable, orphan] = await Promise.all([isPageClaimableBy(ctx, page, ctx.person._id), isPageOrphan(ctx, page)])
    return { claimable, orphan }
  },
})
