import { DEFAULT_FACET_VISIBILITY } from "@diaspora-ga/domain"
import type { FunctionArgs } from "convex/server"
import { api } from "../../../_generated/api"
import type { testConvex } from "../../../test.setup"

/** Enrôle un acteur métier dont la déclaration de nationalité est une donnée de fixture.
 * Les tests de la frontière d'inscription appellent directement checkRegistration/joinDiasporaGa.
 */
export async function joinDeclaredDiasporaFixture(
  as: ReturnType<ReturnType<typeof testConvex>["withIdentity"]>,
  args: FunctionArgs<typeof api.modules.diaspora.membership.joinDiasporaGa>,
) {
  await as.run(async ctx => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return
    const person = await ctx.db.query("persons").withIndex("by_authUserId", q => q.eq("authUserId", identity.subject)).unique()
    const network = await ctx.db.get(args.networkId)
    if (!person || network?.managedBy !== "diaspora") return
    const existing = await ctx.db.query("memberPrivacy").withIndex("by_network_and_person", q => q.eq("networkId", args.networkId).eq("personId", person._id)).unique()
    const phoneRegistration = { firstName: "Marie", lastName: "NDONG", nationality: "GA" as const, declaredAt: Date.now() }
    if (existing && !existing.phoneRegistration) await ctx.db.patch(existing._id, { phoneRegistration })
    if (!existing) await ctx.db.insert("memberPrivacy", {
      networkId: args.networkId, personId: person._id, facetLevels: { ...DEFAULT_FACET_VISIBILITY },
      directoryVisibility: "hidden", phoneRegistration, updatedAt: Date.now(),
    })
  })
  return await as.mutation(api.modules.diaspora.membership.joinDiasporaGa, args)
}
