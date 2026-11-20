/**
 * L'IDENTITÉ d'une page — nom, sigle, description, pays, ville, classification, règle de visibilité,
 * logo et bannière — tenue par ses ADMINISTRATEURS vivants.
 *
 * Écrit à neuf (owner map §6.15) : le socle DÉRIVAIT l'identité d'une page de
 * son organisation (`orgs`) et ne la modifiait jamais ; une page du moteur a la
 * sienne. Chaque changement laisse les valeurs d'AVANT dans
 * `pageIdentityHistory` — une page vérifiée qui se renomme le fait au grand
 * jour. L'ADRESSE ne change pas ici : un lien partagé cesserait d'aboutir, c'est
 * une décision de console (`admin.setPageHandle`).
 *
 * Les images passent par la garde des fichiers : URL de dépôt d'un usage nommé
 * (`page_logo`, `page_banner`), dépôt NEUF du même administrateur, admission à
 * l'analyse, délivrance par `resolveFileDelivery` ; l'image remplacée ou retirée
 * est PURGÉE (elle n'appartient qu'à cette page).
 */
import { assertCountryCode } from "@antsia/social-domain/content"
import { assertPageName, normalizePageDescription, normalizePageShortName } from "@antsia/social-domain/pages"
import { normalizePageAssociationType, normalizePageCity, normalizePageSector } from "@antsia/social-domain/pagePresentation"
import { v } from "convex/values"

import { moderateContentWrite } from "../moderation/policy"
import type { Doc, Id } from "../../_generated/dataModel"
import type { MutationCtx } from "../../_generated/server"
import { checked } from "../../lib/errors"
import { networkMutation } from "../../lib/functions"
import { enforceRateLimit } from "../../lib/rateLimit"
import { guardUploadUrl } from "../../lib/uploadPolicy"
import { contentVisibilityValidator } from "../../lib/validators"
import { admitStoredUpload, assertFreshUpload, findScanByStorageId } from "../files/admission"
import { purgeStoredFile } from "../files/purge"
import { resolveFileDelivery, withheldCodeOf, withheldCodeValidator } from "../files/storageGuard"
import { isPageOnRoot, pageSearchText, requireManagedPage } from "./access"
import { pageAssociationTypeValidator, pageSectorValidator } from "./validators"

const imageSlotValidator = v.union(v.literal("logo"), v.literal("banner"))

type PageWrite = Partial<Omit<Doc<"pages">, "_id" | "_creationTime">>
type IdentityPrevious = Doc<"pageIdentityHistory">["previous"]

/**
 * Modifier l'identité de MA page — un administrateur vivant. Seuls les champs
 * fournis changent (`null` efface un champ facultatif) ; un appel qui ne change
 * rien n'écrit rien, historique compris. La règle `root` est sans objet dans la
 * racine (tout y est lu de la racine).
 */
export const updatePageIdentity = networkMutation({
  feature: "pages",
  minStatus: "declaree",
  args: {
    pageId: v.id("pages"),
    name: v.optional(v.string()),
    shortName: v.optional(v.union(v.string(), v.null())),
    description: v.optional(v.union(v.string(), v.null())),
    country: v.optional(v.union(v.string(), v.null())),
    city: v.optional(v.union(v.string(), v.null())),
    associationType: v.optional(v.union(pageAssociationTypeValidator, v.literal(""), v.null())),
    sector: v.optional(v.union(pageSectorValidator, v.literal(""), v.null())),
    visibility: v.optional(contentVisibilityValidator),
  },
  returns: v.object({ changed: v.boolean() }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "page.manage", ctx.person._id)
    const { page } = await requireManagedPage(ctx, { networkId: ctx.networkId, personId: ctx.person._id }, args.pageId, "admin")
    const patch: PageWrite = {}
    const previous: IdentityPrevious = {}
    if (args.name !== undefined) {
      const name = checked(() => assertPageName(args.name ?? ""))
      if (name !== page.name) {
        patch.name = name
        previous.name = page.name
      }
    }
    if (args.shortName !== undefined) {
      const shortName = args.shortName === null ? undefined : checked(() => normalizePageShortName(args.shortName ?? undefined))
      if (shortName !== page.shortName) {
        patch.shortName = shortName
        previous.shortName = page.shortName ?? null
      }
    }
    if (args.description !== undefined) {
      const description = args.description === null ? undefined : checked(() => normalizePageDescription(args.description ?? undefined))
      if (description !== page.description) {
        patch.description = description
        previous.description = page.description ?? null
      }
    }
    if (args.country !== undefined) {
      const country = args.country === null ? undefined : checked(() => assertCountryCode(args.country ?? ""))
      if (country !== page.country) {
        patch.country = country
        previous.country = page.country ?? null
      }
    }
    if (args.city !== undefined) {
      const city = checked(() => normalizePageCity(args.city))
      if (city !== page.city) {
        patch.city = city
        previous.city = page.city ?? null
      }
    }
    if (args.associationType !== undefined) {
      const associationType = checked(() => normalizePageAssociationType(page.ownerKind, args.associationType))
      if (associationType !== page.associationType) {
        patch.associationType = associationType
        previous.associationType = page.associationType ?? null
      }
    }
    if (args.sector !== undefined) {
      const sector = checked(() => normalizePageSector(page.ownerKind, args.sector))
      if (sector !== page.sector) {
        patch.sector = sector
        previous.sector = page.sector ?? null
      }
    }
    if (args.visibility !== undefined && ctx.network.kind !== "root" && args.visibility !== page.visibility) {
      patch.visibility = args.visibility
      patch.onRoot = isPageOnRoot(ctx.network, args.visibility)
      previous.visibility = page.visibility
    }
    if (Object.keys(previous).length === 0) return { changed: false }
    const now = Date.now()
    const name = patch.name ?? page.name
    const shortName = "shortName" in patch ? patch.shortName : page.shortName
    const description = "description" in patch ? patch.description : page.description
    const city = "city" in patch ? patch.city : page.city
    const associationType = "associationType" in patch ? patch.associationType : page.associationType
    const sector = "sector" in patch ? patch.sector : page.sector
    await moderateContentWrite(ctx, { networkId: ctx.networkId, ownerPersonId: ctx.person._id, kind: "page", id: page._id, text: `${name} ${description ?? ""} ${city ?? ""} ${associationType ?? ""} ${sector ?? ""}` })
    await ctx.db.patch(page._id, { ...patch, searchText: pageSearchText({ name, ...(shortName !== undefined ? { shortName } : {}), handle: page.handle }), updatedAt: now })
    await ctx.db.insert("pageIdentityHistory", { networkId: page.networkId, pageId: page._id, actorPersonId: ctx.person._id, previous, at: now })
    return { changed: true }
  },
})

/** URL de dépôt d'une image de page (temps 1 de la politique ; le temps 2 est à la pose). */
export const generatePageImageUploadUrl = networkMutation({
  feature: "pages",
  minStatus: "declaree",
  args: { slot: imageSlotValidator },
  returns: v.string(),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "upload.url", ctx.person._id)
    return await guardUploadUrl(ctx, args.slot === "logo" ? "page_logo" : "page_banner")
  },
})

/** Purger une image de page — seulement si le registre dit qu'elle a été admise pour une page. */
export async function purgePageImage(ctx: MutationCtx, storageId: Id<"_storage">): Promise<void> {
  const scan = await findScanByStorageId(ctx, storageId)
  if (scan?.source === "page") await purgeStoredFile(ctx, storageId)
}

/**
 * Poser, remplacer ou retirer (`null`) le logo ou la bannière — un administrateur
 * vivant. Reposer la même image ne fait rien ; l'ancienne est purgée. L'URL rendue
 * est celle de la garde : `null` avec la retenue tant que l'analyse n'a pas parlé.
 */
export const setPageImage = networkMutation({
  feature: "pages",
  minStatus: "declaree",
  args: { pageId: v.id("pages"), slot: imageSlotValidator, storageId: v.union(v.id("_storage"), v.null()), mimeType: v.optional(v.string()) },
  returns: v.object({ url: v.union(v.string(), v.null()), withheld: v.union(withheldCodeValidator, v.null()) }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "page.manage", ctx.person._id)
    const { page } = await requireManagedPage(ctx, { networkId: ctx.networkId, personId: ctx.person._id }, args.pageId, "admin")
    const current = args.slot === "logo" ? page.logoStorageId : page.bannerStorageId
    if (args.storageId !== null && args.storageId === current) {
      const delivery = await resolveFileDelivery(ctx, args.storageId)
      return { url: delivery.url, withheld: withheldCodeOf(delivery.scan) }
    }
    if (args.storageId === null && current === undefined) return { url: null, withheld: null }
    if (args.storageId !== null) {
      await assertFreshUpload(ctx, ctx.person._id, args.storageId)
      await admitStoredUpload(
        ctx,
        { storageId: args.storageId, usage: args.slot === "logo" ? "page_logo" : "page_banner", ...(args.mimeType ? { mimeType: args.mimeType } : {}) },
        { source: "page", networkId: ctx.networkId, uploadedByPersonId: ctx.person._id },
      )
    }
    const now = Date.now()
    const next = args.storageId ?? undefined
    await ctx.db.patch(page._id, { ...(args.slot === "logo" ? { logoStorageId: next } : { bannerStorageId: next }), updatedAt: now })
    if (current !== undefined) await purgePageImage(ctx, current)
    await ctx.db.insert("pageIdentityHistory", {
      networkId: page.networkId,
      pageId: page._id,
      actorPersonId: ctx.person._id,
      previous: args.slot === "logo" ? { logoChanged: true } : { bannerChanged: true },
      at: now,
    })
    if (args.storageId === null) return { url: null, withheld: null }
    const delivery = await resolveFileDelivery(ctx, args.storageId)
    return { url: delivery.url, withheld: withheldCodeOf(delivery.scan) }
  },
})
