/**
 * Tables du chantier « mesure du pilote » (DG-027 · G11) de la session DIASPORALE —
 * PROPRIÉTAIRE : ce chantier ; agrégées par `tables.ts`, donc par `convex/schema.ts`.
 *
 * `pilotMetricsDaily` : UNE ligne par réseau, portée et jour UTC — la portée est
 * un pays (ISO 3166-1 alpha-2, jamais le Gabon) ou `null` pour tout le réseau.
 * Elle ne porte que des COMPTES (cohortes du jour, offres actives et ressources du kit
 * relevées) et
 * des réponses rangées par classe de délai : aucun identifiant de personne, de
 * demande ou de page, aucun texte. Seul le passage nocturne
 * (`pilotMetrics.refreshPilotMetrics`) l'écrit, une fois par jour et par portée
 * à chaque passage ; la lecture ne compte jamais rien. Agrégat partagé : il ne
 * s'exporte ni ne s'efface par personne, il se recalcule.
 */
import { PILOT_AID_DAILY_COUNTERS, PILOT_DAILY_COUNTERS, type PilotAidDailyCounter, type PilotDailyCounter } from "@diasporale/domain"
import { defineTable } from "convex/server"
import { v } from "convex/values"

type CountValidator = ReturnType<typeof v.number>
type OptionalCountValidator = ReturnType<typeof v.optional<CountValidator>>

/**
 * Un champ numérique par compteur du domaine : le stockage suit exactement la liste fermée.
 * Les compteurs de l'entraide (ET-10), ajoutés après coup, sont FACULTATIFS : une ligne
 * écrite avant eux reste valide et s'y lit zéro, jusqu'à ce que le passage suivant la réécrive.
 */
function countFields(): Record<Exclude<PilotDailyCounter, PilotAidDailyCounter>, CountValidator> & Record<PilotAidDailyCounter, OptionalCountValidator> {
  const base = {} as Record<Exclude<PilotDailyCounter, PilotAidDailyCounter>, CountValidator>
  for (const counter of PILOT_DAILY_COUNTERS) {
    if (!(PILOT_AID_DAILY_COUNTERS as readonly string[]).includes(counter)) base[counter as Exclude<PilotDailyCounter, PilotAidDailyCounter>] = v.number()
  }
  const aid = {} as Record<PilotAidDailyCounter, OptionalCountValidator>
  for (const counter of PILOT_AID_DAILY_COUNTERS) aid[counter] = v.optional(v.number())
  return { ...base, ...aid }
}

/** Les compteurs d'un jour et d'une portée (`PILOT_DAILY_COUNTERS` du domaine). */
export const pilotDailyCountsValidator = v.object(countFields())

export const pilotMetricsTables = {
  pilotMetricsDaily: defineTable({
    networkId: v.id("networks"),
    /** Le pays mesuré, ou `null` : tout le réseau (y compris les lignes sans pays). */
    country: v.union(v.string(), v.null()),
    /** Minuit UTC du jour mesuré. */
    dayStartAt: v.number(),
    /** Cohortes du jour : demandes, adhésions et avis créés ce jour ; inscriptions aux évènements de ce jour. */
    counts: pilotDailyCountsValidator,
    /** Délais de première réponse des demandes du jour, par classe (`PILOT_FIRST_RESPONSE_BUCKET_HOURS`). */
    firstResponse: v.array(v.number()),
    /** ET-10 — délais de première réponse des questions d'entraide du jour, mêmes classes ; absent d'une ligne d'avant. */
    aidFirstAnswer: v.optional(v.array(v.number())),
    /** Offres actives relevées par le passage qui a écrit ce jour comme dernier jour complet ; absent sinon. */
    offersActive: v.optional(v.number()),
    /** ET-10 — ressources du kit listées, et « à revoir », relevées par ce même passage ; absentes sinon. */
    kitListed: v.optional(v.number()),
    kitToReview: v.optional(v.number()),
    /** L'instant du passage qui a écrit la ligne. */
    computedAt: v.number(),
  })
    // La période d'une portée (lecture), et le dernier jour mesuré du réseau.
    .index("by_network_and_country_and_dayStartAt", ["networkId", "country", "dayStartAt"])
    // Toutes les portées d'un jour (écriture du passage, une ligne par portée).
    .index("by_network_and_dayStartAt", ["networkId", "dayStartAt"]),
}
