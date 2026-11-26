// Dupliqué de socle/convex/modules/reseauPersonnel/people.ts (l. 49-195 et 840-883) @ ad2e7fdc2 — adaptations : la paire `users` + `reseauPersonnel_profiles` devient `persons` ; « joignable » = profil publié, personne non effacée, ET membre active du réseau demandé (un réseau ne voit jamais un non-membre) ; nom neutre rendu `null` (l'écran le traduit) ; avatar par la garde des fichiers (`servableUrl`) ; badges calculés joints au mini-profil ; mentions résolues dans le réseau du contenu.
/**
 * Qui est qui dans un réseau — UNE SEULE SOURCE D'IDENTITÉ : le profil PUBLIÉ.
 *
 * Le nom affiché vient de ce que la personne a publié, jamais d'un état civil
 * ni d'une adresse. Sans profil publié (jamais publié, retiré, effacé), un nom
 * NEUTRE (`displayName: null`), que l'écran traduit, plutôt qu'une devinette.
 */
import type { Badge } from "@antsia/social-domain/badges"
import { isProfileDiscoverable, isProfilePublished, normalizeHandle } from "@antsia/social-domain/content"
import { extractMentionHandles } from "@antsia/social-domain/richText"

import { canReadModeratedContent } from "../moderation/policy"
import type { Doc, Id } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
import { getMembership, isActiveMember } from "../../lib/access"
import { servableUrl } from "../files/storageGuard"
import { badgesOf } from "./persons"

type ReadCtx = Pick<QueryCtx, "db" | "storage"> & { network?: Doc<"networks"> }

export type PersonMiniProfile = {
  personId: Id<"persons">
  /** `null` = nom neutre (profil non publié) : l'écran le traduit. */
  displayName: string | null
  handle: string | null
  headline: string | null
  /** URL de la photo PUBLIÉE, servie par la garde — `null` sans photo, ou retenue. */
  avatarUrl: string | null
  badges: Badge[]
  hasPublishedProfile: boolean
  isDeleted?: boolean
}

/** Le profil est-il publié (choisi, non retiré) et la personne non effacée ? */
export function isPublishedPerson(person: Doc<"persons">): boolean {
  return person.publishedAt !== undefined && isProfilePublished(person) && person.deletionRequestedAt === undefined && person.erasedAt === undefined
}

/** Publié ET non privé : la condition pour être TROUVÉ (recherche, suggestions, nouveaux liens). */
export function isDiscoverablePerson(person: Doc<"persons">): boolean {
  return isPublishedPerson(person) && isProfileDiscoverable(person)
}

/** La personne au profil VIVANT, ou `null` (non publiée, retirée ou effacée = inexistante). */
export async function livePersonProfile(ctx: Pick<QueryCtx, "db">, personId: Id<"persons">): Promise<Doc<"persons"> | null> {
  const person = await ctx.db.get(personId)
  return person && isPublishedPerson(person) && await canReadModeratedContent(ctx, "person", person._id) ? person : null
}

/**
 * Une personne JOIGNABLE par son identifiant dans un réseau, sinon `null` :
 * profil publié, personne non effacée, membre active du réseau. Identifiant
 * inconnu, profil retiré, non-membre : un seul et même `null`, que l'appelant
 * traduit en un seul et même refus. Rien ne permet de sonder un compte.
 */
export async function findPublishedPersonByHandle(
  ctx: Pick<QueryCtx, "db">,
  networkId: Id<"networks">,
  rawHandle: string,
  options?: {
    /**
     * Exiger la DÉCOUVRABILITÉ, pas seulement la publication — sur les seuls
     * gestes qui NOUENT un lien nouveau (demander une connexion, s'abonner).
     * Ailleurs (écrire à quelqu'un qu'on connaît, ouvrir sa fiche), le mode
     * privé ne doit rien casser, sans quoi il vaudrait retrait.
     */
    requireDiscoverable?: boolean
  },
): Promise<Doc<"persons"> | null> {
  const handle = normalizeHandle(rawHandle)
  if (handle.length === 0) return null
  const person = await ctx.db
    .query("persons")
    .withIndex("by_handle", (q) => q.eq("handle", handle))
    .unique()
  if (!person) return null
  if (!(options?.requireDiscoverable ? isDiscoverablePerson(person) : isPublishedPerson(person))) return null
  if (!(await isActiveMember(ctx, networkId, person._id)) || !(await canReadModeratedContent(ctx, "person", person._id))) return null
  return person
}

/** Sur une fiche ou une publication du réseau, une adhésion consulaire vérifiée porte son badge local. */
export async function publishedProfileBadges(ctx: ReadCtx, personId: Id<"persons">): Promise<Badge[]> {
  const badges = await badgesOf(ctx, personId)
  if (ctx.network?.managedBy !== "diaspora" || badges.includes("verified")) return badges
  const membership = await getMembership(ctx, ctx.network._id, personId)
  if (membership?.verifiedBy !== "consulat" || membership.status !== "verifiee" || !await isActiveMember(ctx, ctx.network._id, personId)) return badges
  return ["verified", ...badges.filter(badge => badge !== "community")]
}

/** Le mini-profil allowlisté d'une personne, lu depuis son profil PUBLIÉ. */
export async function publishedMiniProfile(ctx: ReadCtx, personId: Id<"persons">): Promise<PersonMiniProfile> {
  const person = await livePersonProfile(ctx, personId)
  if (!person) {
    const tombstone = await ctx.db.get(personId)
    return { personId, displayName: null, handle: null, headline: null, avatarUrl: null, badges: [], hasPublishedProfile: false, ...(tombstone?.erasedAt !== undefined ? { isDeleted: true } : {}) }
  }
  return {
    personId,
    displayName: person.displayName ?? null,
    handle: person.handle ?? null,
    headline: person.headline ?? null,
    avatarUrl: person.avatarStorageId ? await servableUrl(ctx, person.avatarStorageId) : null,
    badges: await publishedProfileBadges(ctx, personId),
    hasPublishedProfile: true,
  }
}

/** Mémoïse les mini-profils d'un même appel : un fil affiche souvent plusieurs fois le même auteur. */
export function miniProfileCache(ctx: ReadCtx): (personId: Id<"persons">) => Promise<PersonMiniProfile> {
  const cache = new Map<string, PersonMiniProfile>()
  return async (personId) => {
    const hit = cache.get(personId)
    if (hit) return hit
    const resolved = await publishedMiniProfile(ctx, personId)
    cache.set(personId, resolved)
    return resolved
  }
}

/**
 * Résout les `@identifiant` d'un texte en personnes, DANS le réseau du contenu.
 *
 * QUATRE RÈGLES, toutes du même côté :
 *  1. profils publiés de MEMBRES du réseau seulement — citer ne sonde personne ;
 *  2. un identifiant inconnu est ignoré EN SILENCE, jamais une erreur ;
 *  3. plafonné et dédupliqué par le domaine (`extractMentionHandles`) ;
 *  4. se citer soi-même est conservé (c'est ce que dit le texte), mais la
 *     notification l'écarte à la source.
 *
 * ⚠️ Ce n'est PAS une garde : l'appelant vérifie que la personne citée voit
 * déjà le contenu avant de la notifier.
 */
export async function resolveMentionedPersonIds(ctx: Pick<QueryCtx, "db">, networkId: Id<"networks">, body: string): Promise<Id<"persons">[]> {
  const resolved: Id<"persons">[] = []
  for (const handle of extractMentionHandles(body)) {
    const person = await findPublishedPersonByHandle(ctx, networkId, handle)
    if (person && !resolved.includes(person._id)) resolved.push(person._id)
  }
  return resolved
}
