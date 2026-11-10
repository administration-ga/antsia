/**
 * Validateurs PRÉCIS des arguments et des projections de la tranche `diaspora`,
 * dérivés des constantes de `@diasporale/domain` (jamais le validateur permissif).
 * Les projections sont ALLOWLISTÉES : ce qui n'y figure pas ne sort pas.
 */
import {
  ATTESTATION_SUBJECT_KINDS,
  CONSENT_PURPOSES,
  MEMBER_CAPABILITIES,
  SPONSORSHIP_REFUSALS,
  TRUST_BADGES,
  WRITE_RATE_TIERS,
} from "@diasporale/domain"
import { v } from "convex/values"

import { literals } from "../../lib/validators"
import { pagePresentationFields } from "../pages/presentation"
import { pageCardValidator } from "../pages/validators"
import { directoryVisibilityValidator, facetLevelsValidator, fieldVisibilityValidator } from "./tables"

export { directoryVisibilityValidator, facetLevelsValidator }

/**
 * Ce que la personne SAISIT de sa facette (`FacetInput` du domaine) : le poste
 * consulaire n'y figure pas — il ne vient que de l'attestation.
 */
export const facetInputValidator = v.object({
  countryOfResidence: v.string(),
  city: v.optional(v.union(v.string(), v.null())),
  associationIds: v.optional(v.array(v.string())),
  arrivedAt: v.optional(v.union(v.number(), v.null())),
  helpAvailable: v.optional(v.boolean()),
  visibility: v.optional(
    v.object({
      countryOfResidence: v.optional(fieldVisibilityValidator),
      city: v.optional(fieldVisibilityValidator),
      postSlug: v.optional(fieldVisibilityValidator),
      associationIds: v.optional(fieldVisibilityValidator),
      arrivedAt: v.optional(fieldVisibilityValidator),
      helpAvailable: v.optional(fieldVisibilityValidator),
    }),
  ),
})

/** La facette complète, telle que SA titulaire la voit (et elle seule). */
export const ownFacetValidator = v.object({
  countryOfResidence: v.string(),
  city: v.optional(v.string()),
  postSlug: v.optional(v.string()),
  associationIds: v.array(v.string()),
  arrivedAt: v.optional(v.number()),
  helpAvailable: v.boolean(),
  visibility: facetLevelsValidator,
})

/** Les finalités de consentement que DIASPORALE demande (sous-ensemble de celles du moteur). */
export const consentPurposeValidator = literals(CONSENT_PURPOSES)
export const trustBadgeValidator = literals(TRUST_BADGES)
export const memberCapabilityValidator = literals(MEMBER_CAPABILITIES)
export const writeRateTierValidator = literals(WRITE_RATE_TIERS)
export const sponsorshipRefusalValidator = literals(SPONSORSHIP_REFUSALS)
export const attestationSubjectKindValidator = literals(ATTESTATION_SUBJECT_KINDS)

/** Issue de la dernière demande d'attestation, sans la raison consulaire (EXF-DG-03). */
export const attestationOutcomeValidator = literals(["verified", "not_confirmed", "none"])

/** Une personne citée (parrain, filleul) : identifiant public et nom affiché, rien d'autre. */
export const personLabelValidator = v.object({ handle: v.string(), displayName: v.string() })

/** Présentation d'un compteur de hub : le chiffre, ou « sous le seuil » (le chiffre ne sort pas). */
export const counterPresentationValidator = v.union(
  v.object({ kind: v.literal("value"), value: v.number() }),
  v.object({ kind: v.literal("below_threshold"), threshold: v.number() }),
)

export const hubCountersValidator = v.object({
  dormant: v.boolean(),
  members: counterPresentationValidator,
  associations: counterPresentationValidator,
  companies: counterPresentationValidator,
  upcomingEvents: counterPresentationValidator,
})

export const countryHubViewValidator = v.object({
  country: v.string(),
  open: v.boolean(),
  counters: hubCountersValidator,
  /** Dernier passage nocturne ; `null` tant qu'aucun n'a compté. */
  countersComputedAt: v.union(v.number(), v.null()),
})

/**
 * Le hub lu par un MEMBRE (`getCountryHub`) : la projection publique, plus la date
 * du dernier passage qui a compté les évènements à venir (HB-02). `null` : ce
 * compteur n'est pas mesuré (aucun passage ne l'a compté, ou son compte n'était
 * pas exact) et ne s'affiche pas. La vitrine publique (`listOpenCountries`) garde
 * sa projection stricte, sans ce champ.
 */
export const countryHubDetailValidator = v.object({
  ...countryHubViewValidator.fields,
  upcomingEventsComputedAt: v.union(v.number(), v.null()),
})

/**
 * Un évènement d'association dans le hub de son pays (HB-02) : OUVERT AU RÉSEAU,
 * programmé, publié par la modération, à venir. La carte seulement : ni inscrits,
 * ni capacité, ni état du lecteur, que la fiche de l'évènement dit sous sa garde.
 */
export const hubEventValidator = v.object({
  eventId: v.id("events"),
  pageId: v.id("pages"),
  title: v.string(),
  /** Lieu saisi par l'association ; vide quand elle n'en dit rien. */
  location: v.string(),
  startAt: v.number(),
  endAt: v.number(),
  timeZone: v.string(),
  organizer: v.object({ name: v.string(), handle: v.string() }),
})

/** Une fenêtre des évènements d'un pays : curseur opaque, fin, et fenêtre des pages incomplète. */
export const hubEventsPageValidator = v.object({
  country: v.string(),
  items: v.array(hubEventValidator),
  continueCursor: v.union(v.string(), v.null()),
  isDone: v.boolean(),
  /** La fenêtre des pages du pays s'est arrêtée avant la fin : des évènements d'autres associations peuvent manquer. */
  partial: v.boolean(),
})

/**
 * Une page d'un hub pays (DG-007) : la CARTE allowlistée du moteur (logo par la
 * garde des fichiers, badge calculé de la confiance), sa description, ses abonnés
 * comptés par l'agrégat et sa revendicabilité jugée pour CE lecteur. Aucun
 * signataire, aucun identifiant de stockage, aucune coordonnée.
 */
export const hubPageValidator = v.object({
  ...pageCardValidator.fields,
  ...pagePresentationFields,
  description: v.union(v.string(), v.null()),
  followerCount: v.number(),
  claimable: v.boolean(),
})

/** Par nature de page : la fenêtre bornée n'a pas tout montré (la suite se cherche dans l'annuaire). */
export const hubPagesMoreValidator = v.object({
  officialPages: v.boolean(),
  associations: v.boolean(),
  companies: v.boolean(),
})

/** Les pages publiées et lisibles d'un pays, bornées par nature — jamais un comptage. */
export const hubPagesViewValidator = v.object({
  country: v.string(),
  officialPages: v.array(hubPageValidator),
  associations: v.array(hubPageValidator),
  companies: v.array(hubPageValidator),
  more: hubPagesMoreValidator,
})

/** Ce que la tranche ajoute à la fiche d'une page : sa revendicabilité, pour CE lecteur. */
export const pageStandingValidator = v.object({ claimable: v.boolean() })
