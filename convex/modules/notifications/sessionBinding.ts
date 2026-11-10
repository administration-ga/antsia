/** Une permission d'appareil est liée à la session qui l'a accordée, jamais réadoptée après logout. */
import { components } from "../../_generated/api"
import type { Doc } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
export async function subscriptionIsLive(ctx: Pick<QueryCtx, "db" | "runQuery">, subscription: Doc<"pushSubscriptions">): Promise<boolean> {
  if (!subscription.active || !subscription.sessionId) return false
  const person = await ctx.db.get(subscription.personId)
  if (!person || person.deletionRequestedAt !== undefined || person.erasedAt !== undefined) return false
  const session: unknown = await ctx.runQuery(components.betterAuth.adapter.findOne, { model: "session", where: [{ field: "_id", value: subscription.sessionId }] })
  return typeof session === "object" && session !== null && "_id" in session && session._id === subscription.sessionId
    && "userId" in session && session.userId === person.authUserId && "expiresAt" in session
    && typeof session.expiresAt === "number" && session.expiresAt > Date.now()
}

/** L'incarnation ne contient aucun identifiant de session exportable et change lors d'une nouvelle autorisation ; le réabonnement identique la conserve. */
export async function subscriptionSessionGeneration(fields: { sessionId: string; applicationId: string; deviceId: string; bindingId: string; incarnation: string }): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify([fields.sessionId, fields.applicationId, fields.deviceId, fields.bindingId, fields.incarnation]))
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("")
}
