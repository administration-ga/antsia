/**
 * Catalogue FICTIF des seules boutiques de démonstration, sans fédération ni mandat PRO.GA.
 * Les illustrations sont des assets générés du build ; aucun dépôt client ni stockage n'est
 * exposé ici. Toute lecture rejuge l'environnement, l'identité et la vitrine consentie.
 */
import type { PaginationOptions } from "convex/server"
import { effectiveActivityConfiguration } from "@antsia/social-domain/activityConfiguration"

import { components } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
import { fail } from "../../lib/errors"
import { demoContentAllowed } from "../../seeds/demoContentConfig"
import { demoMediaAsset } from "../../seeds/demoMediaManifest"
import { canReadModeratedContent, contentState } from "../moderation/policy"
import { findPageByHandle, liveSignatoryRole } from "../pages/access"
import { publicStorefrontPage, shopOfPage } from "./access"
import { readableCatalogMapping } from "./catalogAccess"
import type { CatalogList, CatalogOffer } from "./catalogValidators"

type ReadCtx = Pick<QueryCtx, "db"> & Partial<Pick<QueryCtx, "runQuery">>
export type DemoCatalogContext = { root: Doc<"networks">; readerPersonId?: Id<"persons">; network?: Doc<"networks"> }
type DemoOffer = { slug: string; title: string; description: string; image: string; amount: number | null; tags: string[] }
type DemoShop = { handle: string; model: Doc<"shops">["model"]; ownerHandle: string; ownerEmail: string; collection: string; offers: DemoOffer[] }

const DEMO_SHOPS: readonly DemoShop[] = [
  {
    handle: "epicerie-moussavou-demo", model: "products", ownerHandle: "commercant.demo", ownerEmail: "commercant@demo.antsia.test", collection: "Produits de démonstration",
    offers: [
      { slug: "epicerie-produits", title: "Panier du marché — Démo", description: "Assortiment fictif de produits du quotidien pour découvrir le catalogue. Aucune vente réelle.", image: "epicerie-produits", amount: 1500, tags: ["démo", "épicerie", "marché"] },
      { slug: "riz-parfume", title: "Riz parfumé, sac de 5 kg — Démo", description: "Riz fictif présenté pour la démonstration du catalogue. Aucune vente réelle.", image: "produit-riz", amount: 6500, tags: ["démo", "riz", "féculents"] },
      { slug: "banane-plantain", title: "Régime de bananes plantain — Démo", description: "Bananes plantain fictives, pour illustrer une fiche de produit frais. Aucune commande réelle.", image: "produit-plantains", amount: 4000, tags: ["démo", "plantain", "produits frais"] },
      { slug: "manioc-frais", title: "Manioc frais, le tas — Démo", description: "Racines de manioc fictives présentées au détail. Cette fiche ne propose aucune vente réelle.", image: "produit-manioc", amount: 1500, tags: ["démo", "manioc", "produits frais"] },
      { slug: "huile-vegetale", title: "Huile végétale, bidon de 5 L — Démo", description: "Huile de cuisson fictive pour explorer les produits du quotidien. Aucune transaction réelle.", image: "produit-huile", amount: 7500, tags: ["démo", "huile", "cuisine"] },
      { slug: "poisson-fume", title: "Poisson fumé au feu de bois — Démo", description: "Lot fictif de poisson fumé selon la tradition, présenté pour la démonstration. Aucune vente réelle.", image: "produit-poisson-fume", amount: 3500, tags: ["démo", "poisson", "fumé"] },
      { slug: "arachides", title: "Arachides, sachet de 1 kg — Démo", description: "Arachides fictives pour les sauces et les en-cas. Aucune commande réelle.", image: "produit-arachides", amount: 2000, tags: ["démo", "arachide", "sauce"] },
      { slug: "tomates-fraiches", title: "Tomates fraîches, le tas — Démo", description: "Tomates fictives du marché, pour illustrer un arrivage du jour. Aucune vente réelle.", image: "produit-tomates", amount: 1000, tags: ["démo", "tomate", "produits frais"] },
      { slug: "oignons-rouges", title: "Oignons rouges, 1 kg — Démo", description: "Oignons fictifs présentés au poids. Cette fiche ne déclenche aucune commande.", image: "produit-oignons", amount: 1200, tags: ["démo", "oignon", "cuisine"] },
      { slug: "farine-de-ble", title: "Farine de blé, 2 kg — Démo", description: "Farine fictive pour les beignets et la pâtisserie maison. Aucune vente réelle.", image: "produit-farine", amount: 2000, tags: ["démo", "farine", "pâtisserie"] },
      { slug: "ananas", title: "Ananas, la pièce — Démo", description: "Ananas fictif, sucré et juteux, présenté pour la démonstration. Aucune commande réelle.", image: "produit-ananas", amount: 1000, tags: ["démo", "ananas", "fruits"] },
      { slug: "savon-artisanal", title: "Savon artisanal — Démo", description: "Produit fictif illustrant une fiche de catalogue. Cette présentation ne propose aucune vente réelle.", image: "savon-artisanal", amount: 2500, tags: ["démo", "artisanat", "savon"] },
      { slug: "panier-raphia", title: "Panier en raphia — Démo", description: "Panier artisanal fictif présenté pour la démonstration. Aucune commande réelle.", image: "panier-raphia", amount: 8500, tags: ["démo", "artisanat", "raphia"] },
    ],
  },
  {
    handle: "studio-objectif-demo", model: "quote_services", ownerHandle: "verifie.demo", ownerEmail: "verifie@demo.antsia.test", collection: "Photographie de démonstration",
    offers: [
      { slug: "photo-portrait", title: "Portrait photo — Démo", description: "Séance photo fictive pour découvrir une prestation à tarif fixe. Aucune réservation réelle.", image: "photo-portrait-studio", amount: 15000, tags: ["démo", "photo", "portrait"] },
      { slug: "reportage-photo", title: "Reportage photo — Démo", description: "Prestation fictive de reportage présentée sur devis pour la démonstration. Aucun devis ne sera envoyé.", image: "photo-evenement", amount: null, tags: ["démo", "photo", "reportage"] },
      { slug: "reportage-mariage", title: "Reportage de mariage — Démo", description: "Couverture fictive d'un mariage, de la cérémonie à la soirée, sur devis. Aucune réservation réelle.", image: "photo-mariage", amount: null, tags: ["démo", "photo", "mariage"] },
      { slug: "photos-produits", title: "Photos de produits — Démo", description: "Série fictive de photos sur fond neutre pour un catalogue en ligne. Aucune prestation réelle.", image: "photo-packshot", amount: 25000, tags: ["démo", "photo", "produits"] },
      { slug: "photo-identite", title: "Photo d'identité — Démo", description: "Prise de vue fictive au format officiel, pour découvrir une prestation rapide. Aucune réservation réelle.", image: "photo-identite", amount: 3000, tags: ["démo", "photo", "identité"] },
      { slug: "seance-famille", title: "Séance photo en famille — Démo", description: "Séance fictive en extérieur pour la famille, à tarif fixe. Aucun rendez-vous réel.", image: "photo-famille", amount: 30000, tags: ["démo", "photo", "famille"] },
      { slug: "prises-de-vue-drone", title: "Prises de vue par drone — Démo", description: "Prestation fictive de vues aériennes, présentée sur devis. Aucun vol réel n'est organisé.", image: "photo-drone", amount: null, tags: ["démo", "photo", "drone"] },
      { slug: "retouche-photo", title: "Retouche photo, par image — Démo", description: "Retouche fictive de la lumière et des couleurs, facturée à l'image. Aucune commande réelle.", image: "photo-retouche", amount: 2000, tags: ["démo", "photo", "retouche"] },
      { slug: "location-studio", title: "Location du studio, l'heure — Démo", description: "Location fictive du studio équipé, éclairage compris. Aucune réservation réelle.", image: "photo-location-studio", amount: 10000, tags: ["démo", "photo", "studio"] },
      { slug: "tirages-photo", title: "Tirages photo, l'unité — Démo", description: "Tirages fictifs sur papier mat ou brillant. Cette fiche ne déclenche aucune commande.", image: "photo-tirages", amount: 500, tags: ["démo", "photo", "tirage"] },
    ],
  },
  {
    handle: "atelier-tech-demo", model: "quote_services", ownerHandle: "membre.demo", ownerEmail: "membre@demo.antsia.test", collection: "Informatique de démonstration",
    offers: [
      { slug: "diagnostic-informatique", title: "Diagnostic informatique — Démo", description: "Diagnostic fictif pour explorer une offre de service. Aucune intervention réelle.", image: "info-reparation-portable", amount: 5000, tags: ["démo", "informatique", "diagnostic"] },
      { slug: "maintenance-informatique", title: "Maintenance informatique — Démo", description: "Prestation fictive de maintenance destinée à la démonstration. Aucun rendez-vous ni paiement réel.", image: "info-montage-pc", amount: 10000, tags: ["démo", "informatique", "maintenance"] },
      { slug: "ecran-smartphone", title: "Remplacement d'écran de smartphone — Démo", description: "Remplacement fictif d'un écran, chiffré sur devis selon le modèle. Aucune intervention réelle.", image: "info-ecran-smartphone", amount: null, tags: ["démo", "téléphone", "réparation"] },
      { slug: "installation-reseau", title: "Installation réseau — Démo", description: "Câblage et configuration fictifs d'un réseau de bureau, sur devis. Aucune intervention réelle.", image: "info-reseau", amount: null, tags: ["démo", "informatique", "réseau"] },
      { slug: "installation-logiciels", title: "Installation de logiciels — Démo", description: "Installation fictive des logiciels essentiels et des mises à jour. Aucun rendez-vous réel.", image: "info-logiciels", amount: 7500, tags: ["démo", "informatique", "logiciels"] },
      { slug: "recuperation-donnees", title: "Récupération de données — Démo", description: "Tentative fictive de récupération sur un disque endommagé, sur devis. Aucune intervention réelle.", image: "info-recuperation-donnees", amount: null, tags: ["démo", "informatique", "données"] },
      { slug: "depannage-imprimante", title: "Dépannage d'imprimante — Démo", description: "Dépannage fictif d'une imprimante de bureau. Aucune intervention ni paiement réel.", image: "info-imprimante", amount: 6000, tags: ["démo", "informatique", "imprimante"] },
      { slug: "formation-bureautique", title: "Formation bureautique — Démo", description: "Session fictive de formation au traitement de texte et au tableur. Aucune inscription réelle.", image: "info-formation", amount: 20000, tags: ["démo", "informatique", "formation"] },
      { slug: "maintenance-serveurs", title: "Maintenance de serveurs — Démo", description: "Contrat fictif de suivi pour une petite entreprise, sur devis. Aucune intervention réelle.", image: "info-maintenance-serveurs", amount: null, tags: ["démo", "informatique", "serveurs"] },
      { slug: "bilan-securite", title: "Bilan de sécurité informatique — Démo", description: "Bilan fictif des mots de passe, sauvegardes et accès, sur devis. Aucune intervention réelle.", image: "info-securite", amount: null, tags: ["démo", "informatique", "sécurité"] },
    ],
  },
]

const normalized = (value: string) => value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
export const isDemoOfferRef = (value: string): boolean => value.startsWith("demo:offer:")
export const isDemoCollectionRef = (value: string): boolean => value.startsWith("demo:collection:")

/** L'image d'une offre : un asset du catalogue fermé, servi depuis les fichiers publics du site. */
function demoOfferMedia(offer: DemoOffer): CatalogOffer["media"][number] {
  const asset = demoMediaAsset(offer.image)
  if (!asset) throw new Error("Illustration de démonstration inconnue.")
  const label = asset.mimeType === "image/png" ? "Illustration générée pour la démonstration" : "Photo d'illustration pour la démonstration"
  return { url: `/demo-media/${asset.collection}/${asset.filename}`, altText: `${label} : ${offer.title}`, width: asset.width, height: asset.height, withheld: null }
}

/** Une vraie projection commerciale gagne toujours sur les illustrations de démonstration. */
export async function demoCatalogForShop(ctx: ReadCtx, context: DemoCatalogContext, shopId: Id<"shops">): Promise<{ offers: CatalogOffer[]; collections: CatalogList["collections"] } | null> {
  if (!demoContentAllowed() || !ctx.runQuery) return null
  const root = await ctx.db.get(context.root._id)
  if (!root || root.kind !== "root" || root.slug !== "antsia" || root.status !== "active") return null
  if (context.network && (context.network._id !== root._id || context.network.kind !== "root")) return null
  const shop = await ctx.db.get(shopId)
  if (!shop || shop.networkId !== root._id || !shop.pageId || !shop.preparedByPersonId) return null
  const page = await ctx.db.get(shop.pageId)
  const spec = page ? DEMO_SHOPS.find((candidate) => candidate.handle === page.handle && candidate.model === shop.model) : undefined
  if (!page || !spec || page.createdByPersonId !== shop.preparedByPersonId || shop.publicConsentByPersonId !== shop.preparedByPersonId) return null
  if (spec.model === "quote_services" && !effectiveActivityConfiguration(shop.activityConfiguration, shop.model).capabilities.includes("services")) return null
  const owner = await ctx.db.get(shop.preparedByPersonId)
  if (!owner || owner.handle !== spec.ownerHandle || owner.publishedAt === undefined || owner.withdrawnAt !== undefined || owner.erasedAt !== undefined || owner.deletionRequestedAt !== undefined) return null
  const user = await ctx.runQuery(components.betterAuth.adapter.findOne, {
    model: "user", where: [{ field: "_id", value: owner.authUserId }], select: ["_id", "email", "emailVerified"],
  }) as { _id: string; email: string; emailVerified?: boolean } | null
  if (!user || user._id !== owner.authUserId || user.emailVerified !== true || user.email.trim().toLowerCase() !== spec.ownerEmail) return null
  if (await liveSignatoryRole(ctx, page, owner._id) !== "admin") return null
  if ((await contentState(ctx, "person", owner._id))?.status !== "published" || !await canReadModeratedContent(ctx, "person", owner._id, context.readerPersonId)) return null
  if ((await contentState(ctx, "page", page._id))?.status !== "published" || !await publicStorefrontPage(ctx, root, shop, context.readerPersonId)) return null
  if (await readableCatalogMapping(ctx, root, shop._id, context.readerPersonId)) return null
  const collectionRef = `demo:collection:${spec.handle}`
  const collections = [{ collectionRef, label: spec.collection }]
  const offers: CatalogOffer[] = spec.offers.map((offer): CatalogOffer => ({
    offerRef: `demo:offer:${offer.slug}`, shopHandle: spec.handle, kind: spec.model === "products" ? "product" : "service",
    title: offer.title, description: offer.description,
    price: offer.amount === null ? { mode: "quote", currency: "XAF" } : { mode: "fixed", currency: "XAF", amount: offer.amount },
    revision: 1, changedAt: shop.publishedAt ?? shop.createdAt, collections,
    tags: [...offer.tags], variantAxes: [], variants: [],
    media: [demoOfferMedia(offer)],
    availability: { state: "unknown", indicative: true, updatedAt: null, stale: false },
    leadTimeDays: null, zone: shop.serviceArea ?? null, actions: { contact: false, quote: false, purchase: false },
  }))
  return { offers, collections }
}

export async function resolveDemoCatalogOffer(ctx: ReadCtx, context: DemoCatalogContext, shopId: Id<"shops">, offerRef: string): Promise<CatalogOffer | null> {
  if (!isDemoOfferRef(offerRef)) return null
  return (await demoCatalogForShop(ctx, context, shopId))?.offers.find((offer) => offer.offerRef === offerRef) ?? null
}

/** Toutes les offres fictives des trois activités (13 + 10 + 10), jamais davantage. */
export const DEMO_MARKETPLACE_MAX = 40

/** Sélection explicite des trois activités fictives déjà déclarées ; jamais un index global. */
export async function demoMarketplaceOffers(ctx: ReadCtx, context: DemoCatalogContext): Promise<CatalogOffer[]> {
  if (!demoContentAllowed() || !ctx.runQuery || context.network && context.network._id !== context.root._id) return []
  const offers: CatalogOffer[] = []
  // borné : trois handles fixes du registre démo, au plus DEMO_MARKETPLACE_MAX offres. Chaque activité rejuge toutes ses gardes.
  for (const spec of DEMO_SHOPS.slice(0, 3)) {
    const page = await findPageByHandle(ctx, spec.handle)
    const shop = page ? await shopOfPage(ctx, page._id) : null
    if (!shop) continue
    const catalog = await demoCatalogForShop(ctx, context, shop._id)
    for (const offer of catalog?.offers ?? []) if (offers.length < DEMO_MARKETPLACE_MAX) offers.push(offer)
  }
  return offers
}

/** Curseur borné lié au filtre : il ne peut pas devenir un curseur Convex de production. */
export function paginateDemoCatalog(catalog: { offers: CatalogOffer[]; collections: CatalogList["collections"] }, args: { handle: string; kind?: "product" | "service"; collectionRef?: string; query?: string; paginationOpts: PaginationOptions }): CatalogList {
  const query = args.query?.normalize("NFC").trim() ?? ""
  if (query.length > 120) return fail("invalidArgument", { field: "query" })
  const filtered = catalog.offers.filter((offer) => (!args.kind || offer.kind === args.kind) && (!args.collectionRef || offer.collections.some((collection) => collection.collectionRef === args.collectionRef)) && (!query || normalized([offer.title, offer.description, ...offer.tags].join(" ")).includes(normalized(query))))
  const signature = JSON.stringify([args.handle, args.kind ?? null, args.collectionRef ?? null, query])
  let offset = 0
  if (args.paginationOpts.cursor) {
    if (args.paginationOpts.cursor.length > 2048) return fail("invalidArgument", { field: "cursor" })
    let cursor: unknown
    try { cursor = JSON.parse(args.paginationOpts.cursor) } catch { return fail("invalidArgument", { field: "cursor" }) }
    if (!Array.isArray(cursor) || cursor.length !== 3 || cursor[0] !== "demo-catalog-v1" || cursor[1] !== signature || !Number.isInteger(cursor[2]) || cursor[2] < 0 || cursor[2] > filtered.length) return fail("invalidArgument", { field: "cursor" })
    offset = cursor[2] as number
  }
  const requested = args.paginationOpts.numItems
  const size = Number.isFinite(requested) ? Math.min(12, Math.max(1, Math.trunc(requested))) : 12
  const page = filtered.slice(offset, offset + size), next = offset + page.length, isDone = next >= filtered.length
  return { page, isDone, continueCursor: isDone ? "" : JSON.stringify(["demo-catalog-v1", signature, next]), collections: catalog.collections, filteredWindow: false }
}
