/**
 * ADR-0042, lot A3 (CH-815) — les réglages et le tableau de bord du réseau, pour SON administration
 * (application d'administration, fiche § 4.2).
 *
 * `overview` : les compteurs que le moteur TIENT pour le tableau de bord, en une lecture bornée —
 *  · modules : les clés ouvertes de la tranche (une ligne au plus par clé, `openFeaturesOf`) ;
 *  · fondateurs : les admissions en vigueur, bornées par le plafond de la cohorte ;
 *  · pays : les pays ouverts du réseau (`networks.openCountries`, réglage du réseau).
 * Les autres comptes de la fiche (membres par statut, admissions en attente, signalements et recours
 * ouverts, pages à vérifier) ne sont tenus par aucun compteur ni agrégat du moteur : ils ne sont PAS
 * rendus — jamais estimés ni comptés par balayage. Les files se lisent par leurs fenêtres
 * (`moderationDesk.queue`, `appealQueue`, `pageClaimQueue`), le journal par
 * `platform/audit.paginateNetworkAdminAudit`.
 *
 * Garde : `networkAdminQuery` (adhésion, rôle relu, session IDN prouvée de l'application qui
 * administre CE réseau, accès journalisé ; refus indistinct sinon). Aucune réponse ne porte la
 * preuve de session.
 */
import { FOUNDING_COHORT_MAX } from "@diaspora-ga/domain"
import { SLICE_NETWORK_FEATURES } from "@antsia/social-domain/networkFeatures"
import { v } from "convex/values"

import { networkAdminQuery } from "../../lib/functions"
import { openFeaturesOf } from "../../lib/networkFeatures"
import { assertDiasporaNetwork } from "./facts"

/** Borne des pays d'un réseau (ISO 3166-1 : 249 codes). */
const COUNTRIES_MAX = 249

/** Le tableau de bord : les compteurs tenus, rien d'autre. */
export const overview = networkAdminQuery({
  args: {},
  returns: v.object({
    modules: v.object({ open: v.number(), total: v.number() }),
    founders: v.object({ active: v.number(), cap: v.number() }),
    countries: v.object({ open: v.number() }),
  }),
  handler: async (ctx) => {
    assertDiasporaNetwork(ctx.network)
    const slice = ctx.network.managedBy
    const total = slice === undefined ? 0 : SLICE_NETWORK_FEATURES[slice].length
    const open = (await openFeaturesOf(ctx, ctx.network)).length
    const founders = await ctx.db
      .query("foundingAdmissions")
      .withIndex("by_network_and_withdrawnAt", (q) => q.eq("networkId", ctx.networkId).eq("withdrawnAt", undefined))
      .take(FOUNDING_COHORT_MAX)
    const countries = new Set((ctx.network.openCountries ?? []).slice(0, COUNTRIES_MAX))
    return {
      modules: { open, total },
      founders: { active: founders.length, cap: FOUNDING_COHORT_MAX },
      countries: { open: countries.size },
    }
  },
})
