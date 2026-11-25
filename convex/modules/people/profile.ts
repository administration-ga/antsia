// Dupliqué de socle/convex/modules/reseauPersonnel/people.ts (l. 230-330, 440-575, 650-866) @ ad2e7fdc2 — adaptations : la paire `users` + `reseauPersonnel_profiles` devient `persons` ; propositions dérivées du nom que la personne SAISIT (jamais d'état civil recopié) ; un identifiant abandonné reste réservé à son ancien titulaire (`handleHistory`) ; bornes par les règles du domaine (`checked`) ; limitation de débit ; refus à code sans phrase ; publication d'office (`ensurePublishedProfile`) et identifiant provisoire RETIRÉS (invariant 7) ; images de profil par la garde des fichiers (fraîcheur, politique `avatar`/`cover`, délivrance retenue tant que l'analyse n'a pas conclu) ; fiche publique lue DANS un réseau (membre seulement), sans fonction ni administration ; annuaire du réseau tenu à jour ; la publication efface la part d'identité du pré-remplissage IDN de l'accueil, et la disponibilité d'un identifiant vit dans `handleAvailability.ts` (ADR-0044).
/**
 * Le profil social d'une personne : son identifiant public (`@handle`), son nom
 * affiché, son accroche. Rien n'est publié d'office (invariant 7) : c'est la
 * personne qui choisit et publie.
 */
import type { MediaWithheld } from "@antsia/social-contracts/media"
import { assertDisplayName, assertHandle, assertHeadline, normalizeHandle } from "@antsia/social-domain/content"
import { handleLadder } from "@antsia/social-domain/handleSuggestion"
import { v } from "convex/values"

import { canReadModeratedContent, moderateContentWrite } from "../moderation/policy"
import type { Doc, Id } from "../../_generated/dataModel"
import type { MutationCtx } from "../../_generated/server"
import { getRootNetwork } from "../../lib/access"
import { checked, fail, notFound } from "../../lib/errors"
import { networkQuery, personMutation, personQuery } from "../../lib/functions"
import { enforceRateLimit } from "../../lib/rateLimit"
import { guardUploadUrl } from "../../lib/uploadPolicy"
import { badgeValidator, literals } from "../../lib/validators"
import { admitStoredUpload, assertFreshUpload, findScanByStorageId } from "../files/admission"
import { purgeStoredFile } from "../files/purge"
import { resolveFileDelivery, withheldCodeOf, withheldCodeValidator } from "../files/storageGuard"
import { isBlockedBetween } from "../graph/graph"
import { syncPersonDirectory } from "./directory"
import { isHandleFreeFor } from "./handleAvailability"
import { clearIdnPrefillIdentity } from "./idnPrefill"
import { revokeAdministrationForPerson } from "../federation/agentLifecycle"
import { findPublishedPersonByHandle, isPublishedPerson } from "./miniProfile"
import { badgesOf } from "./persons"

/**
 * @selfScoped La personne de la session reçoit les identifiants proposés à
 * partir du nom qu'elle saisit, avec leur disponibilité. Aucune forme n'est
 * pré-sélectionnée : l'ordre est une présentation, pas une préférence.
 */
export const suggestHandles = personQuery({
  args: { displayName: v.string() },
  returns: v.array(v.object({ handle: v.string(), available: v.boolean() })),
  handler: async (ctx, { displayName }) => {
    const ladder = handleLadder({ name: displayName.slice(0, 120) }).slice(0, 8)
    const suggestions = []
    for (const handle of ladder) suggestions.push({ handle, available: await isHandleFreeFor(ctx, handle, ctx.person._id) })
    return suggestions
  },
})

/**
 * @selfScoped La personne de la session vérifie si un identifiant de SON choix
 * est libre POUR ELLE (pris, ou porté naguère par une autre : non) — l'accueil
 * le vérifie avant les consentements. Une forme invalide lève la règle du
 * domaine (`HANDLE_LENGTH`, `HANDLE_CHARSET`), comme à la publication.
 */
export const isHandleAvailable = personQuery({
  args: { handle: v.string() },
  returns: v.object({ available: v.boolean() }),
  handler: async (ctx, { handle }) => {
    const normalized = checked(() => assertHandle(handle))
    return { available: await isHandleFreeFor(ctx, normalized, ctx.person._id) }
  },
})

/**
 * @selfScoped La personne de la session publie (ou met à jour) SON profil :
 * identifiant, nom affiché, accroche. Idempotente ; republier après un retrait
 * lève le retrait. Changer d'identifiant laisse l'ancien réservé à soi.
 */
export const publishMyProfile = personMutation({
  args: { handle: v.string(), displayName: v.string(), headline: v.optional(v.string()) },
  returns: v.object({ handle: v.string() }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "person.profile", ctx.person._id)
    const handle = checked(() => assertHandle(args.handle))
    const displayName = checked(() => assertDisplayName(args.displayName))
    const headline = checked(() => assertHeadline(args.headline))
    if (!(await isHandleFreeFor(ctx, handle, ctx.person._id))) return fail("handleUnavailable")

    const now = Date.now()
    const previous = ctx.person.handle
    if (previous && normalizeHandle(previous) !== handle) {
      // borné : une personne change rarement d'identifiant.
      const open = await ctx.db
        .query("handleHistory")
        .withIndex("by_person", (q) => q.eq("personId", ctx.person._id))
        .take(50)
      for (const row of open) if (row.handle === previous && row.until === undefined) await ctx.db.patch(row._id, { until: now })
    }
    if (previous !== handle) await ctx.db.insert("handleHistory", { personId: ctx.person._id, handle, from: now })

    await ctx.db.patch(ctx.person._id, {
      handle,
      displayName,
      headline,
      publishedAt: ctx.person.publishedAt === undefined || ctx.person.withdrawnAt !== undefined ? now : ctx.person.publishedAt,
      withdrawnAt: undefined,
      updatedAt: now,
    })
    const root = await getRootNetwork(ctx)
    if (!root) return notFound()
    await moderateContentWrite(ctx, { networkId: root._id, ownerPersonId: ctx.person._id, kind: "person", id: ctx.person._id, text: `${displayName} ${headline ?? ""}` })
    await syncPersonDirectory(ctx, ctx.person._id)
    // ADR-0044 : le profil est né du geste ; le nom civil et l'identifiant reçus d'IDN n'ont plus d'objet.
    await clearIdnPrefillIdentity(ctx, ctx.person.authUserId)
    return { handle }
  },
})

/**
 * @selfScoped Édite le nom choisi et l'accroche du profil déjà constitué de la
 * personne de la session. Le retrait et la confidentialité sont conservés :
 * seule `publishMyProfile` exprime un geste de (re)publication. Accessible comme
 * les autres réglages personnels même si les réseaux refusent la personne.
 * `expectedPersonId` corrèle l'écran à la session courante après un changement
 * de compte ; il ne choisit jamais la personne à modifier.
 */
export const updateMyProfile = personMutation({
  args: { displayName: v.string(), headline: v.optional(v.string()), expectedPersonId: v.optional(v.id("persons")) },
  returns: v.object({ updatedAt: v.number() }),
  handler: async (ctx, args) => {
    if (args.expectedPersonId !== undefined && args.expectedPersonId !== ctx.person._id) return notFound()
    await enforceRateLimit(ctx, "person.profile", ctx.person._id)
    if (!ctx.person.handle || !ctx.person.displayName || ctx.person.publishedAt === undefined || ctx.person.erasedAt !== undefined) return fail("profileRequired")
    const displayName = checked(() => assertDisplayName(args.displayName))
    const headline = checked(() => assertHeadline(args.headline))
    const root = await getRootNetwork(ctx)
    if (!root) return notFound()
    await moderateContentWrite(ctx, { networkId: root._id, ownerPersonId: ctx.person._id, kind: "person", id: ctx.person._id, text: `${displayName} ${headline ?? ""}` })
    const updatedAt = Date.now()
    await ctx.db.patch(ctx.person._id, { displayName, headline, updatedAt })
    await syncPersonDirectory(ctx, ctx.person._id)
    return { updatedAt }
  },
})

/**
 * @selfScoped La personne de la session RETIRE son profil : elle cesse d'être
 * trouvable et son nom redevient neutre partout. Rien n'est effacé — ni ses
 * publications, ni ses liens. Idempotent ; republier le rétablit.
 */
export const withdrawMyProfile = personMutation({
  args: {},
  returns: v.object({ withdrawn: v.literal(true) }),
  handler: async (ctx) => {
    await enforceRateLimit(ctx, "person.profile", ctx.person._id)
    if (ctx.person.publishedAt === undefined || ctx.person.withdrawnAt !== undefined) return { withdrawn: true as const }
    const now = Date.now()
    await ctx.db.patch(ctx.person._id, { withdrawnAt: now, updatedAt: now })
    await revokeAdministrationForPerson(ctx, ctx.person._id)
    await syncPersonDirectory(ctx, ctx.person._id)
    return { withdrawn: true as const }
  },
})

/**
 * @selfScoped Le mode privé (« hors annuaire ») : retire de la RECHERCHE et des
 * suggestions, ferme les gestes qui noueraient un lien nouveau, sans rompre
 * aucun lien ni anonymiser rien (c'est le retrait qui fait cela). Idempotent.
 */
export const setMyProfilePrivacy = personMutation({
  args: { private: v.boolean() },
  returns: v.object({ isPrivate: v.boolean() }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "person.profile", ctx.person._id)
    if (ctx.person.publishedAt === undefined) return fail("profileRequired")
    if ((ctx.person.privateAt !== undefined) === args.private) return { isPrivate: args.private }
    const now = Date.now()
    await ctx.db.patch(ctx.person._id, { privateAt: args.private ? now : undefined, updatedAt: now })
    await syncPersonDirectory(ctx, ctx.person._id)
    return { isPrivate: args.private }
  },
})

// ═══════════════════════════════════════════════════════════════
// Photo de profil et couverture
// ═══════════════════════════════════════════════════════════════

const PROFILE_IMAGE_USAGES = ["avatar", "cover"] as const

/**
 * @selfScoped URL de dépôt d'une image de profil (photo ou couverture) pour la
 * personne de la session : l'image n'existe pour personne tant que `setMyAvatar`
 * ou `setMyCover` ne l'a pas vérifiée et posée.
 */
export const generateProfileUploadUrl = personMutation({
  args: { usage: literals(PROFILE_IMAGE_USAGES) },
  returns: v.string(),
  handler: async (ctx, { usage }) => {
    await enforceRateLimit(ctx, "upload.url", ctx.person._id)
    return await guardUploadUrl(ctx, usage)
  },
})

const imageDeliveryValidator = v.object({ url: v.union(v.string(), v.null()), withheld: v.union(withheldCodeValidator, v.null()) })

/** Une image peut occuper les DEUX emplacements : relire le profil après sa modification. */
async function purgeDetachedProfileImage(ctx: MutationCtx, personId: Id<"persons">, storageId: Id<"_storage"> | undefined): Promise<void> {
  if (storageId === undefined) return
  const person = await ctx.db.get(personId)
  if (!person || person.avatarStorageId === storageId || person.coverStorageId === storageId) return
  const scan = await findScanByStorageId(ctx, storageId)
  if (scan?.source === "profile" && scan.uploadedByPersonId === personId) await purgeStoredFile(ctx, storageId)
}

/**
 * Pose (ou retire) une image de profil de la personne de la session. Elle
 * n'existe QUE sur un profil publié : une photo sans profil serait une donnée
 * personnelle déposée sans la publication qui la justifie. Une image que la
 * ligne porte déjà (photo ou couverture) se repose librement ; une nouvelle
 * doit être NEUVE, conforme à sa politique, et passe à l'analyse.
 */
async function setProfileImage(
  ctx: MutationCtx & { person: Doc<"persons"> },
  field: "avatarStorageId" | "coverStorageId",
  storageId: Id<"_storage"> | null,
  declaredMimeType: string | undefined,
): Promise<{ url: string | null; withheld: MediaWithheld | null }> {
  await enforceRateLimit(ctx, "person.profile", ctx.person._id)
  if (!isPublishedPerson(ctx.person)) return fail("profileRequired")
  const place = (value: Id<"_storage"> | undefined) => (field === "avatarStorageId" ? { avatarStorageId: value } : { coverStorageId: value })
  if (storageId === null) {
    await ctx.db.patch(ctx.person._id, { ...place(undefined), updatedAt: Date.now() })
    await purgeDetachedProfileImage(ctx, ctx.person._id, ctx.person[field])
    return { url: null, withheld: null }
  }
  if (storageId !== ctx.person.avatarStorageId && storageId !== ctx.person.coverStorageId) {
    await assertFreshUpload(ctx, ctx.person._id, storageId)
    // Les bornes de l'usage `avatar` SONT celles du domaine (formats, taille :
    // une seule source) ; le type déclaré est confronté au stockage.
    await admitStoredUpload(
      ctx,
      { storageId, usage: field === "avatarStorageId" ? "avatar" : "cover", ...(declaredMimeType ? { mimeType: declaredMimeType } : {}) },
      { source: "profile", uploadedByPersonId: ctx.person._id },
    )
  }
  await ctx.db.patch(ctx.person._id, { ...place(storageId), updatedAt: Date.now() })
  await purgeDetachedProfileImage(ctx, ctx.person._id, ctx.person[field])
  const delivery = await resolveFileDelivery(ctx, storageId)
  return { url: delivery.url, withheld: withheldCodeOf(delivery.scan) }
}

/** @selfScoped Pose ou retire la photo de profil de la personne de la session. */
export const setMyAvatar = personMutation({
  args: { storageId: v.union(v.id("_storage"), v.null()), mimeType: v.optional(v.string()) },
  returns: imageDeliveryValidator,
  handler: async (ctx, { storageId, mimeType }) => await setProfileImage(ctx, "avatarStorageId", storageId, mimeType),
})

/** @selfScoped Pose ou retire la couverture de la personne de la session. */
export const setMyCover = personMutation({
  args: { storageId: v.union(v.id("_storage"), v.null()), mimeType: v.optional(v.string()) },
  returns: imageDeliveryValidator,
  handler: async (ctx, { storageId, mimeType }) => await setProfileImage(ctx, "coverStorageId", storageId, mimeType),
})

// ═══════════════════════════════════════════════════════════════
// Fiche publique
// ═══════════════════════════════════════════════════════════════

/**
 * La fiche publique d'une personne, telle qu'on la voit depuis le réseau.
 * Refus INDISTINCT : identifiant inconnu, profil retiré, non-membre du réseau et
 * BLOCAGE (dans un sens ou dans l'autre, tous réseaux) rendent le même `null`.
 */
export const getPublicProfile = networkQuery({
  args: { handle: v.string() },
  returns: v.union(
    v.object({
      personId: v.id("persons"),
      handle: v.string(),
      displayName: v.string(),
      headline: v.union(v.string(), v.null()),
      avatar: imageDeliveryValidator,
      cover: imageDeliveryValidator,
      badges: v.array(badgeValidator),
      isMe: v.boolean(),
    }),
    v.null(),
  ),
  handler: async (ctx, { handle }) => {
    const person = await findPublishedPersonByHandle(ctx, ctx.networkId, handle)
    if (!person || !person.handle || !person.displayName || !(await canReadModeratedContent(ctx, "person", person._id, ctx.person._id))) return null
    if (person._id !== ctx.person._id && (await isBlockedBetween(ctx, ctx.person._id, person._id))) return null
    const image = async (storageId: Id<"_storage"> | undefined) => {
      if (!storageId) return { url: null, withheld: null }
      const delivery = await resolveFileDelivery(ctx, storageId)
      return { url: delivery.url, withheld: withheldCodeOf(delivery.scan) }
    }
    return {
      personId: person._id,
      handle: person.handle,
      displayName: person.displayName,
      headline: person.headline ?? null,
      avatar: await image(person.avatarStorageId),
      cover: await image(person.coverStorageId),
      badges: await badgesOf(ctx, person._id),
      isMe: person._id === ctx.person._id,
    }
  },
})
