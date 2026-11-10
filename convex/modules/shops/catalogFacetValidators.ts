/** MP03 : facettes publiques fermées, sans donnée de gestion. */
import { type Infer, v } from "convex/values"
import type { CommerceCatalogFacets } from "@antsia/social-domain/commerce/catalogFacets"

export const catalogAttributeValidator = v.union(
  v.object({ key: v.literal("brand"), type: v.literal("text"), value: v.string() }),
  v.object({ key: v.literal("material"), type: v.literal("text"), value: v.string() }),
  v.object({ key: v.literal("color"), type: v.literal("text"), value: v.string() }),
  v.object({ key: v.literal("audience"), type: v.literal("choice"), value: v.union(v.literal("women"), v.literal("men"), v.literal("kids"), v.literal("unisex")) }),
  v.object({ key: v.literal("serviceMode"), type: v.literal("choice"), value: v.union(v.literal("onsite"), v.literal("remote"), v.literal("hybrid")) }),
  v.object({ key: v.literal("durationMinutes"), type: v.literal("number"), value: v.number() }),
  v.object({ key: v.literal("ecoLabel"), type: v.literal("boolean"), value: v.boolean() }),
)
export const catalogFacetsValidator = v.object({ taxonomyVersion: v.literal(1), categoryPath: v.array(v.string()), attributes: v.array(catalogAttributeValidator) })
export type CatalogFacetsDto = Infer<typeof catalogFacetsValidator>
export function catalogFacetsDto(facets: CommerceCatalogFacets): CatalogFacetsDto {
  return { taxonomyVersion: 1, categoryPath: [...facets.categoryPath], attributes: facets.attributes.map(attribute => ({ ...attribute })) }
}
