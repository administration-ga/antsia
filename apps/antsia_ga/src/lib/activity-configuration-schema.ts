import { parseActivityConfiguration, type ActivityConfiguration } from "@antsia/social-domain/activityConfiguration"
import { z } from "zod"

/** Même contrat fermé pour les formulaires et la projection publique SSR. */
export const activityConfigurationSchema = z.custom<ActivityConfiguration>(value => parseActivityConfiguration(value) !== null)
