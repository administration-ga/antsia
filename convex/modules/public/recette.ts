/**
 * PA8 : quatre publications clairement fictives, uniquement sur backend LOCAL.
 * Sujet préexistant relations.recette, adresse vérifiée relations.recette@exemple.test.
 * Aucun compte, adhésion, facette, profil ni session créé ou rétabli ; rien de réel.
 */
import { v } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import { internalMutation, type MutationCtx } from "../../_generated/server"
import { getRootNetwork, memberHasStatus } from "../../lib/access"
import { isLocalDeployment } from "../../lib/devTools"
import { assertSeedsAllowed } from "../../seeds/foundations"
import { verifiedEmailHashOf } from "../people/identity"
import { isDiscoverablePerson } from "../people/miniProfile"
import { withdrawPostRootVisibility, writePost } from "../posts/postWrite"

const RECETTE_HANDLE = "relations.recette"
const RECETTE_EMAIL = "relations.recette@exemple.test"
const KEY_PREFIX = "antsia:pa8-public-recette:"
const SPECS = [
  { key: "native-network", body: "PA8 recette fictive — publication native réservée aux membres", source: "root", visibility: "network" },
  { key: "native-root", body: "PA8 recette fictive — publication native choisie sans compte #recettepa8", source: "root", visibility: "root" },
  { key: "child-network", body: "PA8 recette fictive — contexte DIASPORA.GA réservé à son réseau", source: "child", visibility: "network" },
  { key: "child-root", body: "PA8 recette fictive — contribution DIASPORA.GA choisie pour ANTSIA #recettepa8", source: "child", visibility: "root" },
] as const

async function target(ctx: MutationCtx, confirmation: string): Promise<{ root: Doc<"networks">; child: Doc<"networks">; person: Doc<"persons"> }> {
  assertSeedsAllowed(confirmation)
  if (!isLocalDeployment()) throw new Error("Recette refusée : backend local obligatoire")
  const root = await getRootNetwork(ctx)
  const child = await ctx.db.query("networks").withIndex("by_slug", (q) => q.eq("slug", "diaspora-ga")).unique()
  const person = await ctx.db.query("persons").withIndex("by_handle", (q) => q.eq("handle", RECETTE_HANDLE)).unique()
  if (!root || !child || child.kind !== "closed" || child.status !== "active" || child.parentId !== root._id || child.managedBy !== "diaspora") throw new Error("Recette refusée : racine et DIASPORA.GA préexistants requis")
  if (!person || !isDiscoverablePerson(person) || !await memberHasStatus(ctx, root._id, person._id, "declaree") || !await memberHasStatus(ctx, child._id, person._id, "declaree")) throw new Error("Recette refusée : profil fictif et adhésions autorisées préexistants requis")
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(RECETTE_EMAIL)))).map((byte) => byte.toString(16).padStart(2, "0")).join("")
  if (await verifiedEmailHashOf(ctx, person._id) !== digest) throw new Error("Recette refusée : adresse fictive vérifiée requise")
  return { root, child, person }
}

function matches(post: Doc<"posts">, network: Doc<"networks">, person: Doc<"persons">, spec: (typeof SPECS)[number]): boolean {
  return post.networkId === network._id && post.authorPersonId === person._id && post.body === spec.body && post.audience === "public" && post.pageId === undefined && post.groupId === undefined && post.sharedPostId === undefined && !post.media?.length
}

/** Rejeu additif : les quatre lignes existantes ne sont jamais republiées ni remises en visibilité root. */
export const prepare = internalMutation({
  args: { confirmNonProduction: v.string() },
  returns: v.object({ root: v.id("networks"), nativeNetwork: v.id("posts"), nativeRoot: v.id("posts"), childNetwork: v.id("posts"), childRoot: v.id("posts") }),
  handler: async (ctx, args) => {
    const { root, child, person } = await target(ctx, args.confirmNonProduction)
    const ids: Id<"posts">[] = []
    for (const spec of SPECS) {
      const network = spec.source === "root" ? root : child
      const idempotencyKey = KEY_PREFIX + spec.key
      const previous = await ctx.db.query("posts").withIndex("by_author_and_idempotencyKey", (q) => q.eq("authorPersonId", person._id).eq("idempotencyKey", idempotencyKey)).unique()
      if (previous) {
        if (!matches(previous, network, person, spec)) throw new Error("Recette refusée : ligne existante hors du périmètre fictif exact")
        ids.push(previous._id)
      } else {
        const result = await writePost(ctx, { network, authorPersonId: person._id, body: spec.body, audience: "public", visibility: spec.visibility, province: "estuaire", ...(spec.source === "child" ? { reach: "diaspora" } : {}), idempotencyKey })
        ids.push(result.postId)
      }
    }
    return { root: root._id, nativeNetwork: ids[0]!, nativeRoot: ids[1]!, childNetwork: ids[2]!, childRoot: ids[3]! }
  },
})

/** Retrait R4 de SEULE la contribution enfant de cette recette, tracé système et sans suppression. */
export const withdrawChildFromRoot = internalMutation({
  args: { confirmNonProduction: v.string() }, returns: v.object({ postId: v.id("posts") }),
  handler: async (ctx, args) => {
    const { child, person } = await target(ctx, args.confirmNonProduction)
    const spec = SPECS[3]
    const post = await ctx.db.query("posts").withIndex("by_author_and_idempotencyKey", (q) => q.eq("authorPersonId", person._id).eq("idempotencyKey", KEY_PREFIX + spec.key)).unique()
    if (!post || !matches(post, child, person, spec) || post.status !== "published" || (post.visibility !== "root" && post.visibility !== "network") || post.onRoot !== (post.visibility === "root")) throw new Error("Recette refusée : contribution fictive exacte requise")
    await withdrawPostRootVisibility(ctx, post, child)
    return { postId: post._id }
  },
})
