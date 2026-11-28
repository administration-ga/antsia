import type { Doc } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
import { isActiveMember } from "../../lib/access"
import { isJudiciallyDelisted } from "../moderation/judicialHolds"
import { contentState } from "../moderation/policy"
import { isDiscoverablePerson } from "../people/miniProfile"
import { consentInForce, privacyOf } from "./facts"

export async function guestContentVisible(ctx: QueryCtx, kind: "post" | "page" | "person", id: string) {
  const state = await contentState(ctx, kind, id)
  return (!state || state.status === "published") && !await isJudiciallyDelisted(ctx, kind, id)
}

export async function canExposeGuestProfile(ctx: QueryCtx, network: Doc<"networks">, person: Doc<"persons">) {
  if (!person.handle || !person.displayName || !isDiscoverablePerson(person)) return false
  const privacy = await privacyOf(ctx, network._id, person._id)
  return privacy?.guestProfile === true && privacy.directoryVisibility === "network" &&
    await consentInForce(ctx, network._id, person._id, "directory") &&
    await consentInForce(ctx, network._id, person._id, "social_profile") &&
    await isActiveMember(ctx, network._id, person._id) && await guestContentVisible(ctx, "person", person._id)
}
