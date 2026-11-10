import { parseCommerceStorefrontTerms } from "@antsia/social-domain/commerce/storefrontTerms"
import type { PublicStorefront } from "@convex/modules/shops/validators"
import { api } from "@convex/_generated/api"
import { BADGES } from "@antsia/social-domain/badges"
import { cache } from "react"
import { z } from "zod"

import { projected } from "./public-data"
import { activityConfigurationSchema } from "./activity-configuration-schema"
import { catalogOfferSchema } from "./public-catalog-data"

/** Projection allowlistée ; aucune session, signature ou donnée commerciale privée. */
const assetUrl = z.string().url().max(8192).refine((value) => {
  try {
    const url = new URL(value)
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password
  } catch {
    return false
  }
})
const shortText = z.string().max(500)

export const publicStorefrontSchema: z.ZodType<PublicStorefront> = z.object({
  storefrontTerms: z.custom<NonNullable<PublicStorefront["storefrontTerms"]>>(value => parseCommerceStorefrontTerms(value) !== null).optional(),
  handle: shortText.min(1),
  name: z.string().min(2).max(120),
  description: z.string().max(1000).nullable(),
  logoUrl: assetUrl.nullable(),
  bannerUrl: assetUrl.nullable(),
  model: z.enum(["products", "quote_services"]),
  activityConfiguration: activityConfigurationSchema.optional(),
  specialty: z.string().max(80).nullable(),
  serviceArea: z.string().max(120).nullable(),
  hours: z.string().max(200).nullable(),
  badge: z.enum(BADGES),
  blocks: z.array(z.enum(["catalog", "services", "publications", "about"])).max(4),
  publishedAt: z.number().finite().nonnegative().max(8_640_000_000_000_000),
  origin: z.object({ slug: shortText.min(1), name: shortText.min(1) }).strict(),
}).strict()

export type { PublicStorefront }

/** SU06 : projection séparée, afin de préserver le DTO historique strict des vitrines. */
export const publicDailySpecialSchema = z.object({
  version: z.literal(1),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
    const date = new Date(`${value}T00:00:00.000Z`)
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  }),
  offer: catalogOfferSchema,
}).strict().refine(value => value.offer.kind === "product")

export type PublicDailySpecial = z.infer<typeof publicDailySpecialSchema>

/** La porte partagée conserve OTT, sujet et refus de session ; aucun repli anonyme. */
export const loadPublicStorefront = cache((handle: string, handoff = false) =>
  projected(api.modules.public.shops.getStorefront, { handle }, publicStorefrontSchema.nullable(), handoff),
)

/** Même porte de session ; un ancien backend peut ne pas encore connaître cette projection facultative. */
export const loadPublicDailySpecial = cache(async (handle: string, handoff = false) => {
  const result = await projected(api.modules.public.shops.getDailySpecial, { handle }, publicDailySpecialSchema.nullable(), handoff)
  if (result.status === "ready" && result.data && result.data.offer.shopHandle !== handle) return { status: "unavailable" } as const
  return result
})

/** CM-10 : projection séparée de la boutique en pause ; le DTO strict de la vitrine reste inchangé. */
export const publicStorefrontPauseSchema = z.object({
  version: z.literal(1),
  pausedUntil: z.number().int().nonnegative().max(8_640_000_000_000_000),
}).strict()

export type PublicStorefrontPause = z.infer<typeof publicStorefrontPauseSchema>

/** Le pas de l'instant passé à la lecture : la minute (la frontière cliente retire le bandeau à l'échéance exacte). */
const PAUSE_NOW_STEP_MS = 60_000

/**
 * Même porte de session. Un ancien backend ne connaît pas cette projection : la lecture échoue sans casser la vitrine
 * (l'écran ne montre alors aucun bandeau, et le serveur refuse quand même un nouvel engagement).
 */
export const loadPublicStorefrontPause = cache((handle: string, handoff = false) =>
  projected(api.modules.public.shops.getStorefrontPause, { handle, now: Math.floor(Date.now() / PAUSE_NOW_STEP_MS) * PAUSE_NOW_STEP_MS }, publicStorefrontPauseSchema.nullable(), handoff),
)
