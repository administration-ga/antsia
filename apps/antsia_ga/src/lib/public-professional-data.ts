import { api } from "@convex/_generated/api"
import { PROFESSIONAL_AVAILABILITIES, normalizeProfessionalLanguageCode } from "@antsia/social-domain/professionals"
import type { ProfessionalPublicProfile } from "@convex/modules/professionals/validators"
import { cache } from "react"
import { z } from "zod"
import { projected } from "./public-data"

const handle = z.string().min(1).max(80).regex(/^[\p{L}\p{N}](?:[\p{L}\p{N}._-]*[\p{L}\p{N}])?$/u)
/** La validation refuse les champs internes même si le backend venait à les ajouter. */
export const professionalPublicProfileSchema: z.ZodType<ProfessionalPublicProfile> = z.object({
  handle, displayName: z.string().min(1).max(200),
  title: z.string().min(1).max(120).optional(), bio: z.string().max(1600).optional(),
  skills: z.array(z.string().min(1).max(60)).max(12).optional(),
  languageCodes: z.array(z.string().max(35).refine(value => normalizeProfessionalLanguageCode(value) === value)).max(6).optional(),
  zone: z.string().max(120).optional(), availability: z.enum(PROFESSIONAL_AVAILABILITIES).optional(),
  portfolio: z.array(z.object({ title: z.string().min(1).max(120), description: z.string().max(500) }).strict()).max(6).optional(),
  activities: z.array(z.object({ kind: z.enum(["page", "shop"]), handle, name: z.string().min(1).max(200) }).strict()).max(6).optional(),
}).strict()

export const loadPublicProfessional = cache((handle: string, handoff = false) =>
  projected(api.modules.public.professionals.profile, { handle }, professionalPublicProfileSchema.nullable(), handoff),
)
