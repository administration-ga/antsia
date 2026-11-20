/**
 * Modération des contenus de la vague H DIASPORA.GA (lot G9 du plan global) —
 * tranche `diaspora`, écrite par la session DIASPORA.GA. Aucune fonction Convex ici.
 *
 * Neuf natures, aux noms FIGÉS (partagés avec les écrans) et ajoutées en fin de
 * `MODERATION_SURFACES` (moteur) et de `moderationTargetValidator` :
 * `diasporaAidQuestion`, `diasporaAidAnswer`, `diasporaAidMission`,
 * `diasporaMentorProfile`, `diasporaMentoringRequest`, `diasporaKitResource`,
 * `diasporaJobOffer`, `diasporaTalentProfile`, `diasporaJobApplication`.
 *
 * Politique retenue (G9) : un contenu de la vague H est VISIBLE dès son écriture
 * et modéré APRÈS signalement. Il ne passe en relecture préalable que si le
 * réseau a posé une politique EXPLICITE pour sa surface (`moderationPolicies`,
 * `cases.setPolicy`) : la règle du moteur s'y applique alors entière (relecture
 * préalable, termes bloqués, liens, cadence). Sans politique, AUCUNE mise en
 * attente implicite — à la différence des avis DG-016, ouverts par une politique
 * avant toute publication : l'entraide, le mentorat, le kit et l'emploi étaient
 * publiés directement, leurs parcours restent intacts. L'état de modération est
 * pourtant écrit à chaque écriture : il porte le PROPRIÉTAIRE (personne, ou page
 * pour un contenu collectif — un signataire n'en devient jamais propriétaire),
 * ce qui permet au moteur de refuser à une page de trancher son propre contenu
 * (`cases.assertNoPageDecisionConflict`). Aucun texte n'y est gardé.
 *
 * Lecture (`isServedTo`) : publié pour tous ; en relecture préalable pour sa seule
 * PERSONNE propriétaire ; retiré pour personne ; masqué au déclarant (règle du
 * moteur `canReadModeratedContent`, relue sur le lien, jamais dans un cache).
 * Comme pour les avis DG-016, aucune dérogation de modérateur dans une liste ou
 * une fiche publique : les modérateurs relisent par l'aperçu borné du moteur.
 * Les vues PRIVÉES du propriétaire (« Mes … », gestion de l'équipe d'une page)
 * restent entières ; une modification d'un contenu retiré est refusée.
 */
import { contentNeedsReview, MODERATION_SCAN_LIMIT, type ModerationSurface } from "@antsia/social-domain/moderationPolicy"
import { v } from "convex/values"

import type { Id } from "../../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../../_generated/server"
import { fail } from "../../lib/errors"
import { canReadModeratedContent, contentState } from "../moderation/policy"

type ReadCtx = Pick<QueryCtx, "db">

/** Les natures de la vague H, dans l'ordre de `MODERATION_SURFACES`. */
export const DIASPORA_MODERATION_SURFACES = [
  "diasporaAidQuestion",
  "diasporaAidAnswer",
  "diasporaAidMission",
  "diasporaMentorProfile",
  "diasporaMentoringRequest",
  "diasporaKitResource",
  "diasporaJobOffer",
  "diasporaTalentProfile",
  "diasporaJobApplication",
] as const satisfies readonly ModerationSurface[]

export type DiasporaModerationSurface = (typeof DIASPORA_MODERATION_SURFACES)[number]

const DIASPORA_SURFACES: ReadonlySet<string> = new Set<string>(DIASPORA_MODERATION_SURFACES)

/** La surface est-elle une nature de la vague H (gouvernée par cette tranche) ? */
export function isDiasporaSurface(kind: ModerationSurface): kind is DiasporaModerationSurface {
  return DIASPORA_SURFACES.has(kind)
}

/** Le propriétaire d'un contenu : une personne, ou une page (contenu collectif). */
export type ContentOwner = { readonly personId: Id<"persons"> } | { readonly pageId: Id<"pages"> }

/**
 * La modération d'une ÉCRITURE de la vague H (création ou modification), appelée
 * dans la transaction de l'écriture, après l'insertion ou avant le patch :
 *  - un contenu retiré ne se modifie plus (`policyRefused`) : une modification ne
 *    le republierait jamais ;
 *  - sans politique explicite du réseau pour la surface : publié ;
 *  - avec une politique : la règle du moteur (`contentNeedsReview`), cadence
 *    comptée sur les états du même propriétaire (personne ou page).
 * Rend l'état écrit. Aucun texte n'est gardé.
 */
export async function moderateDiasporaWrite(
  ctx: Pick<MutationCtx, "db">,
  input: { readonly networkId: Id<"networks">; readonly kind: DiasporaModerationSurface; readonly id: string; readonly text: string; readonly owner: ContentOwner },
): Promise<"published" | "pending_review"> {
  const existing = await contentState(ctx, input.kind, input.id)
  if (existing && existing.networkId !== input.networkId) return fail("notFound")
  if (existing?.status === "removed") return fail("policyRefused")
  const ownerPageId = "pageId" in input.owner ? input.owner.pageId : undefined
  const ownerPersonId = "personId" in input.owner ? input.owner.personId : undefined
  const now = Date.now()
  const policy = await ctx.db
    .query("moderationPolicies")
    .withIndex("by_network_surface", (q) => q.eq("networkId", input.networkId).eq("surface", input.kind))
    .unique()
  let pending = false
  if (policy) {
    const terms = await ctx.db
      .query("blockedTerms")
      .withIndex("by_network_active", (q) => q.eq("networkId", input.networkId).eq("active", true))
      .take(MODERATION_SCAN_LIMIT + 1)
    const since = now - policy.windowMs
    const recent = ownerPageId !== undefined
      ? await ctx.db
        .query("moderationContentStates")
        .withIndex("by_network_page_updatedAt", (q) => q.eq("networkId", input.networkId).eq("ownerPageId", ownerPageId).gte("updatedAt", since))
        .take(MODERATION_SCAN_LIMIT + 1)
      : await ctx.db
        .query("moderationContentStates")
        .withIndex("by_network_owner_updatedAt", (q) => q.eq("networkId", input.networkId).eq("ownerPersonId", ownerPersonId).gte("updatedAt", since))
        .take(MODERATION_SCAN_LIMIT + 1)
    pending = terms.length > MODERATION_SCAN_LIMIT || contentNeedsReview({
      text: input.text,
      preReview: policy.preReview,
      blockedTerms: terms.map((row) => row.term),
      maxLinks: policy.maxLinks,
      recentWrites: recent.filter((row) => row._id !== existing?._id).length,
      maxWrites: policy.maxWrites,
    })
  }
  const status = pending ? ("pending_review" as const) : ("published" as const)
  if (existing) {
    // Le propriétaire est réécrit tel que l'écriture le dit ; l'autre référence s'efface (`undefined` au patch).
    await ctx.db.patch(existing._id, { status, ownerPageId, ownerPersonId, updatedAt: now })
  } else {
    await ctx.db.insert("moderationContentStates", {
      networkId: input.networkId,
      targetKind: input.kind,
      targetId: input.id,
      ...(ownerPageId !== undefined ? { ownerPageId } : ownerPersonId !== undefined ? { ownerPersonId } : {}),
      status,
      createdAt: now,
      updatedAt: now,
    })
  }
  return status
}

/**
 * Ce qu'une projection PUBLIQUE de la vague H sert à ce lecteur : publié (ou sans
 * état : contenu antérieur à G9) ; en relecture préalable pour sa seule personne
 * propriétaire ; retiré pour personne ; jamais ce qu'il a lui-même signalé.
 */
export async function isServedTo(ctx: ReadCtx, kind: DiasporaModerationSurface, id: string, readerPersonId: Id<"persons">): Promise<boolean> {
  const state = await contentState(ctx, kind, id)
  if (state?.status === "removed") return false
  if (state?.status === "pending_review" && state.ownerPersonId !== readerPersonId) return false
  return await canReadModeratedContent(ctx, kind, id, readerPersonId)
}

/** Le contenu est-il retiré par la modération (terminal tant qu'un recours ne le rétablit pas) ? */
export async function isRemovedByModeration(ctx: ReadCtx, kind: DiasporaModerationSurface, id: string): Promise<boolean> {
  return (await contentState(ctx, kind, id))?.status === "removed"
}

/** L'état de modération tel qu'on le montre à qui GÈRE le contenu : publié, en relecture préalable, ou retiré. */
export const managedModerationStateValidator = v.union(v.literal("published"), v.literal("pending_review"), v.literal("removed"))
export type ManagedModerationState = "published" | "pending_review" | "removed"

/**
 * L'état de modération d'un contenu de la vague H, pour les seules vues de GESTION : la personne
 * propriétaire (« Mes … ») ou l'équipe vivante de la page qui le porte. Sans état (contenu
 * antérieur à G9) : publié. Jamais servi à un autre lecteur, qui ne voit de toute façon ni un
 * contenu en relecture ni un contenu retiré.
 */
export async function managedModerationState(ctx: ReadCtx, kind: DiasporaModerationSurface, id: string): Promise<ManagedModerationState> {
  return (await contentState(ctx, kind, id))?.status ?? "published"
}
