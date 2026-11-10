/** P17c : un seul appareil gagnant PAR personne ; aucun identifiant client ne remplace la session. */
import { isNativeCallUuid, type NativeCallBinding } from "@antsia/social-contracts/native-calls"
import { v } from "convex/values"

import type { Doc } from "../../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../../_generated/server"
import { notFound } from "../../lib/errors"
import { getActiveIdentity } from "../../lib/session"

export const nativeBindingFields = { applicationId: v.string(), deviceId: v.string(), bindingId: v.string() }
type Participant = Doc<"callParticipants">

export function validNativeBinding(binding: NativeCallBinding): boolean {
  return /^[a-z][a-z0-9_-]{1,63}$/u.test(binding.applicationId) && /^[A-Za-z0-9_-]{8,128}$/u.test(binding.deviceId) && isNativeCallUuid(binding.bindingId)
}
export async function activeCallSession(ctx: QueryCtx | MutationCtx): Promise<string> {
  const identity = await getActiveIdentity(ctx)
  return typeof identity?.sessionId === "string" ? identity.sessionId : notFound()
}
export function isNativeOwner(row: Participant, sessionId: string, binding: NativeCallBinding): boolean {
  return row.ownerKind === "native" && row.ownerSessionId === sessionId && row.ownerApplicationId === binding.applicationId && row.ownerDeviceId === binding.deviceId && row.ownerBindingId === binding.bindingId
}
export function isWebOwner(row: Participant, sessionId: string, allowUnclaimed = false): boolean {
  return row.ownerKind !== "native" && row.ownerApplicationId === undefined && row.ownerDeviceId === undefined && row.ownerBindingId === undefined &&
    (row.ownerKind === "web" || allowUnclaimed) && (row.ownerSessionId === sessionId || allowUnclaimed && row.ownerSessionId === undefined)
}
export async function claimWebParticipant(ctx: MutationCtx, row: Participant): Promise<void> {
  const sessionId = await activeCallSession(ctx)
  if (!isWebOwner(row, sessionId, true)) return notFound()
  if (row.ownerKind !== "web" || row.ownerSessionId === undefined) await ctx.db.patch(row._id, { ownerSessionId: sessionId, ownerKind: "web" })
}
export async function claimNativeParticipant(ctx: MutationCtx, row: Participant, binding: NativeCallBinding): Promise<void> {
  const sessionId = await activeCallSession(ctx)
  if (!validNativeBinding(binding)) return notFound()
  if (isNativeOwner(row, sessionId, binding)) return
  // Le créateur a déjà été lié à SA session par la porte de lancement ; son hôte natif précise son appareil.
  const unclaimedHost = row.role === "host" && row.ownerSessionId === sessionId && row.ownerKind === undefined && isWebOwner(row, sessionId, true)
  // Une ancienne participation déjà entrée, sans preuve de gagnant, ne se convertit pas en appareil natif.
  if (row.joinedAt !== undefined && row.ownerSessionId === undefined) return notFound()
  if (row.ownerSessionId !== undefined && !unclaimedHost) return notFound()
  if (row.ownerSessionId === undefined && (row.ownerKind !== undefined || row.ownerApplicationId !== undefined || row.ownerDeviceId !== undefined || row.ownerBindingId !== undefined)) return notFound()
  await ctx.db.patch(row._id, { ownerSessionId: sessionId, ownerKind: "native", ownerApplicationId: binding.applicationId, ownerDeviceId: binding.deviceId, ownerBindingId: binding.bindingId })
}
export async function systemUuid(ctx: Pick<MutationCtx, "db">, call: Doc<"calls">): Promise<string> {
  if (call.systemCallUuid !== undefined) return isNativeCallUuid(call.systemCallUuid) ? call.systemCallUuid : notFound()
  const uuid = crypto.randomUUID()
  await ctx.db.patch(call._id, { systemCallUuid: uuid })
  return uuid
}
