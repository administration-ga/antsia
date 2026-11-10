import type { Doc, Id } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
import { notFound } from "../../lib/errors"
import { localCommerceLoa1Allowed } from "../../lib/localCommerceSandbox"
import { isLiveOperatorSession } from "../../lib/operatorIdentity"
import { hasStrongIdentityFor } from "../people/persons"

/** Configurer ou rejouer : administrateur explicite et IDN ≥ 2 vivant. */
export async function requireFederationAdmin(ctx: Pick<QueryCtx, "db">, actor: { person: Doc<"persons">; operator: Doc<"operators"> }): Promise<void> {
  if (actor.operator.role !== "platform_admin" || !await hasStrongIdentityFor(ctx, actor.person._id)) return notFound()
}

/** Exception opt-in du seul catalogue local ; les autres administrations gardent IDN2. */
export async function requireCatalogAdmin(
  ctx: Pick<QueryCtx, "db" | "runQuery">,
  actor: { person: Doc<"persons">; operator: Doc<"operators">; operatorSessionProof: Doc<"operatorSessionProofs"> },
  networkId: Id<"networks">,
): Promise<"strong" | "local"> {
  if (actor.operator.role !== "platform_admin") return notFound()
  if (await hasStrongIdentityFor(ctx, actor.person._id)) return "strong"
  const network = await ctx.db.get(networkId)
  const proof = actor.operatorSessionProof
  if (!localCommerceLoa1Allowed() || network?.kind !== "root" || network.status !== "active" || !proof ||
    proof.personId !== actor.person._id || proof.loa < 1 || !await isLiveOperatorSession(ctx, actor.person, proof)) return notFound()
  return "local"
}

/** Périmètre fermé de la recette locale : aucune attestation, aucun paiement ni emploi. */
export function isLocalCatalogEmitter(emitter: { slug: string; environment: string; keyEnvName: string; allowedContracts: string[] } | null): boolean {
  return emitter !== null && emitter.slug === "pro-ga" && emitter.environment === "sandbox" &&
    emitter.keyEnvName === "ANTSIA_FEDERATION_PRO_GA_LOCAL_SU06_KEY" &&
    emitter.allowedContracts.length === 1 && emitter.allowedContracts[0] === "PRO-COMMERCE-PUBLIC-V2"
}
