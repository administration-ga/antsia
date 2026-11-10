/**
 * CM-09 — FAVORIS d'offres : « Enregistrer » sur une carte ou une fiche, « Mes favoris » dans Profil.
 *
 * Brique commune du plan directeur (§ 5.1) : NU-03 (annonces), UM-05 (emploi) et DS-11 (DIASPORALE)
 * s'y branchent. Ses fonctions publiques — `save`, `remove`, `isSaved`, `listMine`, `pruneUnavailable` —
 * portent toutes `networkId` (constructeurs `networkQuery`/`networkMutation`, `requireMembership` en tête) ;
 * une offre se désigne comme sur sa fiche : `handle` de la boutique et `offerRef`.
 *
 * Règles tenues ici :
 * - privée : une personne ne lit que SES lignes ; aucun compteur n'est rendu à quiconque (vendeur,
 *   public, classement, recommandation) et aucun avis ne part vers la boutique ;
 * - enregistrer exige de VOIR l'offre (même relecture que la fiche, `resolveCatalogOffer`) : sinon le
 *   refus indistinct `notFound`, jamais un oracle d'existence ;
 * - idempotente : une ligne par personne, réseau et offre ; un second « Enregistrer » ne crée rien,
 *   un second « Retirer » ne fait rien ;
 * - bornée : seau de débit `shop.offer.save` (en plus de la porte commune), quota par personne et
 *   par réseau, pages de douze, nettoyage par tranches ;
 * - références seules : la liste relit chaque offre à chaque lecture ; une offre qui ne se lit plus
 *   n'est plus montrée (seule la mention « indisponible », sans contenu, permet de la retirer).
 */
import { paginationOptsValidator, paginationResultValidator } from "convex/server"
import { v } from "convex/values"

import { internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import { internalMutation, type MutationCtx, type QueryCtx } from "../../_generated/server"
import { failAppRule, notFound } from "../../lib/errors"
import { networkMutation, networkQuery } from "../../lib/functions"
import { enforceRateLimit } from "../../lib/rateLimit"
import { findPageByHandle } from "../pages/access"
import { shopOfPage } from "./access"
import { type CatalogReadContext, resolveCatalogOffer } from "./catalogRead"
import { catalogOfferValidator } from "./catalogValidators"

/**
 * Au plus 200 favoris par personne et par réseau — à valider par le propriétaire. Même borne que la
 * relecture des sourdines (`MUTES_SCAN` du module des marques) : la liste entière se compte en une
 * lecture bornée et se nettoie en dix tranches de `PRUNE_BATCH`.
 */
export const SAVED_OFFERS_MAX = 200
/** Une page de « Mes favoris » : douze offres relues, comme une page du catalogue. */
export const SAVED_OFFERS_PAGE_MAX = 12
/** Lignes relues par appel de nettoyage : chaque relecture rejoue toutes les gardes de la fiche. */
export const SAVED_OFFERS_PRUNE_BATCH = 20
/** Lignes supprimées par passage de purge d'une boutique défaite. */
export const SAVED_OFFERS_PURGE_BATCH = 100

type ReadCtx = Pick<QueryCtx, "db" | "runQuery">
type Reader = { networkId: Id<"networks">; personId: Id<"persons">; context: CatalogReadContext }

const offerArgs = { handle: v.string(), offerRef: v.string() }

/** Une ligne de « Mes favoris » : l'offre relue avec les droits du lecteur, ou la seule mention qu'elle ne se lit plus. */
export const savedOfferEntryValidator = v.union(
  v.object({ kind: v.literal("offer"), savedAt: v.number(), offer: catalogOfferValidator }),
  v.object({ kind: v.literal("unavailable"), savedAt: v.number() }),
)

function readerOf(ctx: { networkId: Id<"networks">; person: Doc<"persons">; network: Doc<"networks">; rootNetwork: Doc<"networks"> }): Reader {
  return { networkId: ctx.networkId, personId: ctx.person._id, context: { root: ctx.rootNetwork, readerPersonId: ctx.person._id, network: ctx.network } }
}

/** La boutique désignée par son `handle`, ou `null` — sans dire pourquoi. */
async function shopByHandle(ctx: Pick<QueryCtx, "db">, handle: string): Promise<Doc<"shops"> | null> {
  const page = await findPageByHandle(ctx, handle)
  return page ? await shopOfPage(ctx, page._id) : null
}

async function findSaved(ctx: Pick<QueryCtx, "db">, reader: Pick<Reader, "networkId" | "personId">, shopId: Id<"shops">, offerRef: string) {
  return await ctx.db
    .query("savedOffers")
    .withIndex("by_network_person_shop_offer", (q) => q.eq("networkId", reader.networkId).eq("personId", reader.personId).eq("shopId", shopId).eq("offerRef", offerRef))
    .unique()
}

/** L'offre d'une ligne, relue comme sur sa fiche ; `null` dès qu'une garde la referme. */
async function readSavedOffer(ctx: ReadCtx, reader: Reader, row: Doc<"savedOffers">) {
  return await resolveCatalogOffer(ctx, reader.context, row.shopId, row.offerRef)
}

/**
 * Enregistrer une offre VISIBLE du lecteur. Idempotente : déjà enregistrée, rien ne change.
 * Au quota, refus `saved_offer_quota` (borne rendue, aucune ligne lue d'autrui).
 */
export const save = networkMutation({
  minStatus: "en_attente",
  args: offerArgs,
  returns: v.object({ saved: v.literal(true) }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "shop.offer.save", ctx.person._id)
    const reader = readerOf(ctx)
    // La garde de visibilité EN PREMIER : enregistrer ne doit pas devenir un oracle d'existence.
    const shop = await shopByHandle(ctx, args.handle)
    const offer = shop ? await resolveCatalogOffer(ctx, reader.context, shop._id, args.offerRef) : null
    if (!shop || !offer) return notFound()
    if (await findSaved(ctx, reader, shop._id, offer.offerRef)) return { saved: true as const }
    // borné : au plus SAVED_OFFERS_MAX lignes de cette personne dans ce réseau.
    const mine = await ctx.db
      .query("savedOffers")
      .withIndex("by_network_person_createdAt", (q) => q.eq("networkId", reader.networkId).eq("personId", reader.personId))
      .take(SAVED_OFFERS_MAX)
    if (mine.length >= SAVED_OFFERS_MAX) return failAppRule("saved_offer_quota", { max: SAVED_OFFERS_MAX })
    await ctx.db.insert("savedOffers", { networkId: reader.networkId, personId: reader.personId, shopId: shop._id, offerRef: offer.offerRef, createdAt: Date.now() })
    return { saved: true as const }
  },
})

/**
 * Retirer une offre de mes favoris. Idempotente, et sans relecture de l'offre : retirer sa propre
 * ligne n'apprend rien sur l'offre et reste possible quand elle ne se lit plus.
 */
export const remove = networkMutation({
  minStatus: "en_attente",
  args: offerArgs,
  returns: v.object({ saved: v.literal(false) }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "shop.offer.save", ctx.person._id)
    const reader = readerOf(ctx)
    const shop = await shopByHandle(ctx, args.handle)
    const existing = shop ? await findSaved(ctx, reader, shop._id, args.offerRef) : null
    if (existing) await ctx.db.delete(existing._id)
    return { saved: false as const }
  },
})

/**
 * L'état du bouton « Enregistrer » pour UNE offre : ma ligne existe-t-elle ? Ne dit rien de l'offre
 * elle-même (la carte qui l'affiche l'a déjà lue avec ses gardes) ni des autres personnes.
 */
export const isSaved = networkQuery({
  args: offerArgs,
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const shop = await shopByHandle(ctx, args.handle)
    return shop ? (await findSaved(ctx, { networkId: ctx.networkId, personId: ctx.person._id }, shop._id, args.offerRef)) !== null : false
  },
})

/**
 * Mes favoris, les plus récents d'abord, par pages de douze au plus. Chaque offre est RELUE avec mes
 * droits : une offre retirée, une vitrine fermée ou masquée par la modération ne rend que la mention
 * `unavailable` (sa date d'enregistrement, rien d'autre), que l'écran compte sans l'afficher.
 */
export const listMine = networkQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(savedOfferEntryValidator),
  handler: async (ctx, args) => {
    const reader = readerOf(ctx)
    const numItems = Math.max(1, Math.min(SAVED_OFFERS_PAGE_MAX, Math.floor(args.paginationOpts.numItems)))
    const result = await ctx.db
      .query("savedOffers")
      .withIndex("by_network_person_createdAt", (q) => q.eq("networkId", reader.networkId).eq("personId", reader.personId))
      .order("desc")
      .paginate({ ...args.paginationOpts, numItems, maximumRowsRead: numItems * 2, maximumBytesRead: 256 * 1024 })
    const page = []
    for (const row of result.page) {
      const offer = await readSavedOffer(ctx, reader, row)
      page.push(offer ? { kind: "offer" as const, savedAt: row.createdAt, offer } : { kind: "unavailable" as const, savedAt: row.createdAt })
    }
    return { ...result, page }
  },
})

/**
 * Retirer de mes favoris les offres qui ne se lisent plus, par tranches de vingt lignes (l'écran
 * enchaîne les appels jusqu'à `isDone`). Ce que la relecture referme est supprimé ; le reste demeure.
 */
export const pruneUnavailable = networkMutation({
  minStatus: "en_attente",
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.object({ removed: v.number(), isDone: v.boolean(), continueCursor: v.string() }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "shop.offer.save", ctx.person._id)
    const reader = readerOf(ctx)
    const window = await ctx.db
      .query("savedOffers")
      .withIndex("by_network_person_createdAt", (q) => q.eq("networkId", reader.networkId).eq("personId", reader.personId))
      .order("desc")
      .paginate({ cursor: args.cursor, numItems: SAVED_OFFERS_PRUNE_BATCH, maximumRowsRead: SAVED_OFFERS_PRUNE_BATCH * 2 })
    let removed = 0
    for (const row of window.page) {
      if (await readSavedOffer(ctx, reader, row)) continue
      await ctx.db.delete(row._id)
      removed += 1
    }
    return { removed, isDone: window.isDone, continueCursor: window.continueCursor }
  },
})

/**
 * Purge des favoris d'une boutique DÉFAITE (`discardShop`), par lots bornés : le premier lot dans la
 * mutation qui défait, les suivants planifiés. Les favoris des autres boutiques ne sont pas touchés.
 */
export async function purgeSavedOffersForShop(ctx: MutationCtx, shopId: Id<"shops">): Promise<void> {
  const rows = await ctx.db
    .query("savedOffers")
    .withIndex("by_shop_offer", (q) => q.eq("shopId", shopId))
    .take(SAVED_OFFERS_PURGE_BATCH + 1)
  for (const row of rows.slice(0, SAVED_OFFERS_PURGE_BATCH)) await ctx.db.delete(row._id)
  if (rows.length > SAVED_OFFERS_PURGE_BATCH) await ctx.scheduler.runAfter(0, internal.modules.shops.savedOffers.purgeForShop, { shopId })
}

export const purgeForShop = internalMutation({
  args: { shopId: v.id("shops") },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Une boutique encore présente n'est pas défaite : rien à purger (aucune boutique vivante ne perd ses favoris).
    if (await ctx.db.get(args.shopId)) return null
    await purgeSavedOffersForShop(ctx, args.shopId)
    return null
  },
})
