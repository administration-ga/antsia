/** P15 : preuve courte d'un geste candidat et relecture de SA session, sans modifier l'auth partagée. */
import { COMMERCE_COMMAND_LIMITS } from "@antsia/social-domain/commerce/command"

import { components } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import type { MutationCtx } from "../../_generated/server"
import { memberHasStatus, getRootNetwork } from "../../lib/access"
import { getActiveIdentity } from "../../lib/session"
import { readCommerceLinkConfig } from "./commerceLinkConfig"
import { resolveShopJob } from "./jobRead"

type Application = Doc<"commerceApplications">
export type JobAuthorization = {
  authorizationSessionId: string; authorizationAuthUserId: string; authorizedAt: number; authorizationUntil: number;
}

/** Refus fermé, y compris identifiant legacy illisible ; aucune preuve par le seul JWT stocké. */
async function liveSession(ctx: MutationCtx, sessionId: string, authUserId: string): Promise<number | null> {
  let session: unknown
  try {
    session = await ctx.runQuery(components.betterAuth.adapter.findOne, { model: "session", where: [{ field: "_id", value: sessionId }] })
  } catch { return null }
  if (typeof session !== "object" || session === null || !("_id" in session) || session._id !== sessionId ||
    !("userId" in session) || session.userId !== authUserId || !("expiresAt" in session) || typeof session.expiresAt !== "number" ||
    !Number.isFinite(session.expiresAt) || session.expiresAt <= Date.now()) return null
  return session.expiresAt
}

export async function captureJobAuthorization(ctx: MutationCtx, personId: Id<"persons">): Promise<JobAuthorization | null> {
  const person = await ctx.db.get(personId), identity = await getActiveIdentity(ctx)
  if (!person || person.deletionRequestedAt !== undefined || person.erasedAt !== undefined || !identity || typeof identity.sessionId !== "string" || person.authUserId !== identity.subject) return null
  const sessionUntil = await liveSession(ctx, identity.sessionId, identity.subject), now = Date.now()
  return sessionUntil === null ? null : {
    authorizationSessionId: identity.sessionId, authorizationAuthUserId: identity.subject,
    authorizedAt: now, authorizationUntil: Math.min(sessionUntil, now + COMMERCE_COMMAND_LIMITS.authMaxAgeMs),
  }
}

/** Lecture historique : personne/session/configuration. Nouvel effet : offre, parent, lien et adhésion relus en plus. */
export async function jobAuthorizationLive(ctx: MutationCtx, row: Application, strict: boolean): Promise<boolean> {
  const now = Date.now(), person = await ctx.db.get(row.personId)
  if (!person || person.deletionRequestedAt !== undefined || person.erasedAt !== undefined || !row.authorizationSessionId || !row.authorizationAuthUserId ||
    person.authUserId !== row.authorizationAuthUserId || row.authorizedAt === undefined || row.authorizedAt > now ||
    now - row.authorizedAt > COMMERCE_COMMAND_LIMITS.authMaxAgeMs || (row.authorizationUntil ?? 0) <= now ||
    await liveSession(ctx, row.authorizationSessionId, row.authorizationAuthUserId) === null || !await memberHasStatus(ctx, row.networkId, row.personId, "declaree")) return false
  const config = await readCommerceLinkConfig()
  if (!config || config.fingerprint !== row.configFingerprint || config.source !== row.source || config.environment !== row.environment) return false
  if (!strict) return true
  const root = await getRootNetwork(ctx), network = await ctx.db.get(row.networkId)
  if (!root || !network) return false
  const resolved = await resolveShopJob(ctx, { root, network, readerPersonId: row.personId }, row.shopId, row.jobRef)
  return !!resolved && resolved.job.actions.apply && resolved.live.mapping._id === row.mappingId && resolved.live.link.linkRef === row.linkRef &&
    resolved.live.link.shopRef === row.shopRef && resolved.live.link.permissions.includes("receive_applications")
}
