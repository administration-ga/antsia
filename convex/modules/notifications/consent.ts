/** Consentement réseau exact ; partagé sans importer les gardes des conversations. */
import { isConsentInForce, type ConsentPurpose } from "@antsia/social-domain/consent"
import type { Id } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
type ReadCtx = Pick<QueryCtx, "db">

export async function notificationConsent(ctx: ReadCtx, networkId: Id<"networks">, personId: Id<"persons">, purpose: ConsentPurpose): Promise<boolean> {
  const rows = await ctx.db.query("consents").withIndex("by_person_and_purpose", (q) => q.eq("personId", personId).eq("purpose", purpose)).take(101)
  // Une troncature ne devient jamais un accord ; portée EXACTE du réseau.
  return rows.length <= 100 && isConsentInForce(rows.filter((row) => row.networkId === networkId), purpose)
}

