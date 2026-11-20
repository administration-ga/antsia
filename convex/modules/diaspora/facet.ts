/**
 * Facette diaspora et confidentialité propre au réseau (EXF-DG-08, EXF-DG-46).
 *
 * Le chemin générique du moteur (`setMyFacet`) refuse ce réseau : ici, la saisie
 * suit les règles du domaine (pays hors Gabon, ville sur une ligne, année
 * d'arrivée plausible, associations bornées), le poste consulaire n'est jamais
 * saisi (il vient de l'attestation), et chaque champ garde son niveau FIN de
 * visibilité. L'annuaire est opt-in : un niveau autre que « personne » exige le
 * consentement `directory` en vigueur, et le pré-filtre de l'annuaire du moteur
 * suit le choix (`syncDirectoryListing`).
 */
import { parseFacetInput, toEngineFacet } from "@diaspora-ga/domain"
import { v } from "convex/values"

import { failAppRule } from "../../lib/errors"
import { networkMutation } from "../../lib/functions"
import { enforceRateLimit } from "../../lib/rateLimit"
import { writeNetworkFacet } from "../people/admission"
import { assertDiasporaNetwork, consentInForce, facetOf, syncDirectoryListing, writePrivacy } from "./facts"
import { directoryVisibilityValidator, facetInputValidator } from "./validators"

/** La personne règle SA facette (membre, même en attente : elle complète son entrée). */
export const updateMyFacet = networkMutation({
  minStatus: "en_attente",
  args: { facet: facetInputValidator },
  returns: v.null(),
  handler: async (ctx, { facet: input }) => {
    assertDiasporaNetwork(ctx.network)
    await enforceRateLimit(ctx, "person.facet", ctx.person._id)
    const facet = parseFacetInput(input, Date.now(), (await facetOf(ctx, ctx.networkId, ctx.person._id)) ?? undefined)
    if (!facet.ok) return failAppRule(facet.code, {}, "invalidArgument")
    await writeNetworkFacet(ctx, ctx.network, ctx.person._id, toEngineFacet(facet.value))
    await writePrivacy(ctx, ctx.networkId, ctx.person._id, { facetLevels: facet.value.visibility })
    return null
  },
})

/** Le niveau d'annuaire de la personne : « personne » sans condition, tout autre avec le consentement en vigueur. */
export const setDirectoryVisibility = networkMutation({
  minStatus: "en_attente",
  args: { level: directoryVisibilityValidator },
  returns: v.null(),
  handler: async (ctx, { level }) => {
    assertDiasporaNetwork(ctx.network)
    await enforceRateLimit(ctx, "person.facet", ctx.person._id)
    if (level !== "hidden" && !(await consentInForce(ctx, ctx.networkId, ctx.person._id, "directory"))) {
      return failAppRule("consent_directory_required")
    }
    await writePrivacy(ctx, ctx.networkId, ctx.person._id, { directoryVisibility: level })
    await syncDirectoryListing(ctx, ctx.networkId, ctx.person._id)
    return null
  },
})
