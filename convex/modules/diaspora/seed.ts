/**
 * Graine du réseau `diasporale` — hors production seulement (double garde du
 * moteur : argument de confirmation ET déploiement local ou autorisé).
 *
 * Réseau fermé, enfant de la racine, GOUVERNÉ par la tranche `diaspora`,
 * politique « déclaré ou vérifié », visibilité « réseau », pays ouverts de
 * départ (arbitrage A8 : la France), facette diaspora au format du moteur, et un
 * hub par pays ouvert, compteurs à zéro jusqu'au premier passage nocturne.
 * Idempotente : rejouée, elle ne double rien. La racine doit exister (graine des
 * fondations d'abord). En production, la console crée le réseau avec
 * `managedBy: "diaspora"`.
 */
import { normalizeHandle } from "@antsia/social-domain/content"
import { CONTEXTUAL_KINDS } from "@antsia/social-domain/contextualMessaging"
import { validateFacetSchema } from "@antsia/social-domain/facets"
import { isActiveStatus } from "@antsia/social-domain/membership"
import { isValidNetworkSlug, validateNetworkShape } from "@antsia/social-domain/network"
import { DAY_MS, DIASPORALE_DEMO_ACTOR_SPECS, DIASPORALE_DEMO_ACTORS, DIASPORALE_NETWORK_SEED, DIASPORALE_SLICE, type EngineFacetField } from "@diasporale/domain"
import { v } from "convex/values"

import type { Doc } from "../../_generated/dataModel"
import { internalMutation, type MutationCtx } from "../../_generated/server"
import { getMembership, getRootNetwork, isActiveMember } from "../../lib/access"
import { isLocalDeployment } from "../../lib/devTools"
import { membershipStatusValidator } from "../../lib/validators"
import { assertSeedsAllowed, ensureNetwork } from "../../seeds/foundations"
import { contextualPolicyEnabled } from "../contextualMessaging/access"
import { contextualKindValidator } from "../contextualMessaging/tables"
import { followerCounts } from "../graph/follows"
import { isBlockedBetween, isFollowingPerson } from "../graph/graph"
import { verifiedEmailHashOf } from "../people/identity"
import { isPublishedPerson } from "../people/miniProfile"
import { liveIdentityLinks } from "../people/persons"
import { writePost } from "../posts/postWrite"
import { sha256Hex } from "./attestation"
import { ensureDemoModerationTeam, ensureModerationTeamMember, personOfActor } from "./demoAccounts"
import { activeSponsorshipOf, applyDerivedStatus, effectiveStatusIn, facetOf, isDiasporaNetwork, membershipGrounds } from "./facts"
import { hubRow } from "./hubs"

/** Un champ de facette du domaine (listes figées) au format mutable des tables du moteur. */
function engineFacetField(field: EngineFacetField) {
  return {
    key: field.key,
    kind: field.kind,
    required: field.required,
    defaultVisibility: field.defaultVisibility,
    ...(field.maxLength !== undefined ? { maxLength: field.maxLength } : {}),
    ...(field.maxItems !== undefined ? { maxItems: field.maxItems } : {}),
    ...(field.excludedValues !== undefined ? { excludedValues: [...field.excludedValues] } : {}),
  }
}

export const run = internalMutation({
  args: { confirmNonProduction: v.string() },
  returns: v.object({ network: v.id("networks"), created: v.boolean(), hubs: v.array(v.string()) }),
  handler: async (ctx, { confirmNonProduction }) => {
    assertSeedsAllowed(confirmNonProduction)
    const root = await getRootNetwork(ctx)
    if (!root) throw new Error("Graine refusée : le réseau racine manque (graine des fondations d'abord).")

    const seed = DIASPORALE_NETWORK_SEED
    const facetSchema = { fields: seed.facetSchema.fields.map(engineFacetField) }
    const shapeErrors = validateNetworkShape({
      kind: seed.kind,
      parentId: root._id,
      membershipPolicy: seed.membershipPolicy,
      defaultVisibility: seed.defaultVisibility,
    })
    if (!isValidNetworkSlug(seed.slug) || shapeErrors.length > 0 || validateFacetSchema(facetSchema).length > 0) {
      throw new Error("Graine refusée : réglages du réseau diasporale invalides pour le moteur.")
    }

    const now = Date.now()
    const network = await ensureNetwork(ctx, seed.slug, () => ({
      slug: seed.slug,
      kind: seed.kind,
      parentId: root._id,
      managedBy: DIASPORALE_SLICE,
      name: seed.name,
      membershipPolicy: seed.membershipPolicy,
      defaultVisibility: seed.defaultVisibility,
      facetSchema,
      reachValues: [...seed.reachValues],
      openCountries: [...seed.openCountries],
      theme: seed.theme,
      status: "active",
      createdAt: now,
      updatedAt: now,
    }))

    const hubs: string[] = []
    for (const country of seed.openCountries) {
      if (await hubRow(ctx, network.id, country)) continue
      await ctx.db.insert("countryHubs", {
        networkId: network.id,
        country,
        members: 0,
        associations: 0,
        companies: 0,
        upcomingEvents: 0,
        updatedAt: now,
      })
      hubs.push(country)
    }
    return { network: network.id, created: network.created, hubs }
  },
})

/** Poste FICTIF des attestations de recette : il ne désigne aucun poste consulaire réel. */
export const RECETTE_POST_SLUG = "poste-de-recette"

/**
 * Recette locale SEULEMENT (double garde des graines) : rend « vérifié » le membre
 * désigné par son identifiant, par une attestation consulaire FICTIVE (empreinte
 * « recette-… », poste de recette), vérifié depuis `verifiedDaysAgo` jours (31 par
 * défaut), pour jouer le parcours de parrainage (R3) sans consulat.ga. Rien n'est
 * créé d'office : la personne doit déjà être membre. Jamais en production.
 */
export const verifyForRecette = internalMutation({
  args: { confirmNonProduction: v.string(), handle: v.string(), verifiedDaysAgo: v.optional(v.number()) },
  returns: v.object({ status: membershipStatusValidator }),
  handler: async (ctx, args) => {
    assertSeedsAllowed(args.confirmNonProduction)
    const network = await ctx.db
      .query("networks")
      .withIndex("by_slug", (q) => q.eq("slug", DIASPORALE_NETWORK_SEED.slug))
      .unique()
    const person = await ctx.db
      .query("persons")
      .withIndex("by_handle", (q) => q.eq("handle", normalizeHandle(args.handle).replace(/^@/, "")))
      .unique()
    const membership = network && person ? await getMembership(ctx, network._id, person._id) : null
    if (!network || !person || !membership) throw new Error("Recette refusée : aucun membre de diasporale sous cet identifiant.")

    const now = Date.now()
    const links = await liveIdentityLinks(ctx, person._id)
    if (!links.some((link) => link.provider === "consular_attestation")) {
      const facet = await facetOf(ctx, network._id, person._id)
      await ctx.db.insert("identityLinks", {
        personId: person._id,
        provider: "consular_attestation",
        subject: `recette-${person._id}`,
        ...(facet ? { country: facet.countryOfResidence } : {}),
        postSlug: RECETTE_POST_SLUG,
        linkedAt: now,
      })
    }
    const grounds = await membershipGrounds(ctx, network._id, person._id, membership)
    const sponsorship = await activeSponsorshipOf(ctx, network._id, person._id)
    const status = await applyDerivedStatus(ctx, membership, grounds, sponsorship?.sponsorPersonId ?? null, now)
    if (status === "verifiee") await ctx.db.patch(membership._id, { statusChangedAt: now - (args.verifiedDaysAgo ?? 31) * DAY_MS })
    return { status }
  },
})

/** Cible FICTIVE fermée : cette graine n'accepte aucun identifiant en argument. */
const PROFILE_POSTS_RECETTE_HANDLE = "relations.recette"
const PROFILE_POSTS_RECETTE_EMAIL = "relations.recette@exemple.test"
const PROFILE_POSTS_RECETTE_COUNT = 35
const ALBUM_DRAFTS_RECETTE_COUNT = 13
const STORY_READER_RECETTE_HANDLE = "pd4.lecture"
const STORY_READER_RECETTE_EMAIL = "pd4.recette@exemple.test"

/** La cible fermée des recettes locales, relue sans créer ni modifier d'identité. */
async function requireLocalRecetteAuthor(ctx: MutationCtx): Promise<{ network: Doc<"networks">; person: Doc<"persons"> }> {
  // Même une autorisation de graines sur un déploiement en nuage ne suffit pas.
  if (!isLocalDeployment()) throw new Error("Recette refusée : backend local obligatoire.")

  const network = await ctx.db
    .query("networks")
    .withIndex("by_slug", (q) => q.eq("slug", DIASPORALE_NETWORK_SEED.slug))
    .unique()
  const root = await getRootNetwork(ctx)
  if (!isDiasporaNetwork(network) || network.kind !== "closed" || !root || network.parentId !== root._id) {
    throw new Error("Recette refusée : réseau diasporale actif et racine préexistante requis.")
  }
  const person = await ctx.db
    .query("persons")
    .withIndex("by_handle", (q) => q.eq("handle", PROFILE_POSTS_RECETTE_HANDLE))
    .unique()
  if (!person || !isPublishedPerson(person)) throw new Error("Recette refusée : profil fictif préexistant requis.")
  const access = await effectiveStatusIn(ctx, network, person._id)
  if (!access.membership || (access.status !== "declaree" && access.status !== "verifiee") || (access.rootStatus !== "declaree" && access.rootStatus !== "verifiee")) {
    throw new Error("Recette refusée : adhésion préexistante autorisée à publier requise.")
  }
  // Le handle seul ne permet jamais d'écrire pour une autre personne : le
  // composant d'authentification doit attester CETTE adresse fictive vérifiée.
  if (await verifiedEmailHashOf(ctx, person._id) !== await sha256Hex(PROFILE_POSTS_RECETTE_EMAIL)) {
    throw new Error("Recette refusée : identité fictive vérifiée requise.")
  }
  return { network, person }
}

/**
 * Recette du mur paginé, strictement LOCALE : trente-cinq textes clairement
 * fictifs dans DIASPORALE, jamais à la racine. La personne, son adresse de
 * recette vérifiée, son profil et ses adhésions doivent déjà exister ; rien
 * de tout cela n'est créé ni modifié ici. Rejouer ne crée que les publications
 * manquantes, sans rétablir ni supprimer une publication existante.
 */
export const profilePostsForRecette = internalMutation({
  args: { confirmNonProduction: v.string() },
  returns: v.object({ handle: v.literal("relations.recette"), created: v.number(), existing: v.number() }),
  handler: async (ctx, { confirmNonProduction }) => {
    assertSeedsAllowed(confirmNonProduction)
    const { network, person } = await requireLocalRecetteAuthor(ctx)

    let created = 0
    let existing = 0
    for (let index = 1; index <= PROFILE_POSTS_RECETTE_COUNT; index += 1) {
      const number = String(index).padStart(2, "0")
      const body = `PD4 mur recette ${number}/35 — Publication fictive pour vérifier la pagination du profil.`
      const idempotencyKey = `diasporale:pd4-mur-recette:${PROFILE_POSTS_RECETTE_HANDLE}:${number}`
      const previous = await ctx.db
        .query("posts")
        .withIndex("by_author_and_idempotencyKey", (q) => q.eq("authorPersonId", person._id).eq("idempotencyKey", idempotencyKey))
        .unique()
      if (previous) {
        if (previous.networkId !== network._id || previous.body !== body || previous.audience !== "public" || previous.visibility !== "network" || previous.onRoot !== false || previous.groupId !== undefined || previous.pageId !== undefined || previous.sharedPostId !== undefined) {
          throw new Error("Recette refusée : publication existante hors du périmètre attendu.")
        }
        existing += 1
        continue
      }
      // « public » signifie ici public DANS le réseau fermé : la visibilité
      // network, portée par le helper commun, interdit toute lecture racine.
      await writePost(ctx, { network, authorPersonId: person._id, body, audience: "public", visibility: "network", reach: "diaspora", idempotencyKey })
      created += 1
    }
    return { handle: PROFILE_POSTS_RECETTE_HANDLE, created, existing } as const
  },
})

/** Treize brouillons VIDES et privés pour la recette de pagination/reprise des albums. */
export const albumDraftsForRecette = internalMutation({
  args: { confirmNonProduction: v.string() },
  returns: v.object({ handle: v.literal("relations.recette"), created: v.number(), existing: v.number() }),
  handler: async (ctx, { confirmNonProduction }) => {
    assertSeedsAllowed(confirmNonProduction)
    const { network, person } = await requireLocalRecetteAuthor(ctx)
    const now = Date.now()
    let created = 0
    let existing = 0
    for (let index = 1; index <= ALBUM_DRAFTS_RECETTE_COUNT; index += 1) {
      const number = String(index).padStart(2, "0")
      const idempotencyKey = `diasporale:pd4-album-recette:${PROFILE_POSTS_RECETTE_HANDLE}:${number}`
      const previous = await ctx.db
        .query("albums")
        .withIndex("by_owner_idempotencyKey", (q) => q.eq("ownerPersonId", person._id).eq("idempotencyKey", idempotencyKey))
        .unique()
      if (previous) {
        if (previous.networkId !== network._id || previous.deletingAt !== undefined) {
          throw new Error("Recette refusée : album existant hors du périmètre attendu.")
        }
        // La recette peut ensuite corriger, publier ou retirer cet album :
        // son rejeu ne restaure jamais le titre, l'audience ou le statut initial.
        existing += 1
        continue
      }
      const timestamp = now - ALBUM_DRAFTS_RECETTE_COUNT + index
      await ctx.db.insert("albums", {
        networkId: network._id,
        ownerPersonId: person._id,
        title: `PD4 album recette ${number}/13`,
        audience: "connections",
        status: "draft",
        itemCount: 0,
        idempotencyKey,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      created += 1
    }
    return { handle: PROFILE_POSTS_RECETTE_HANDLE, created, existing } as const
  },
})

/** Le réseau de recette : `diasporale`, actif, fermé, enfant de la racine préexistante — backend LOCAL seulement. */
async function requireLocalRecetteNetwork(ctx: MutationCtx): Promise<Doc<"networks">> {
  // Même une autorisation de graines sur un déploiement en nuage ne suffit pas.
  if (!isLocalDeployment()) throw new Error("Recette refusée : backend local obligatoire.")
  const network = await ctx.db
    .query("networks")
    .withIndex("by_slug", (q) => q.eq("slug", DIASPORALE_NETWORK_SEED.slug))
    .unique()
  const root = await getRootNetwork(ctx)
  if (!isDiasporaNetwork(network) || network.kind !== "closed" || !root || network.parentId !== root._id) {
    throw new Error("Recette refusée : réseau diasporale actif et racine préexistante requis.")
  }
  return network
}

/**
 * LX-04 — Banc de recette LOCAL de la mise en relation (plan 17 de DIASPORALE, § 5 ; décision 2
 * du § 7 retenue par le propriétaire : une graine locale seulement, gardée, sans opérateur).
 *
 * Gardes : la double garde des graines (confirmation ET déploiement autorisé), puis le backend
 * LOCAL obligatoire : une autorisation de graines posée sur un déploiement en nuage — la
 * démonstration comprise — ne suffit jamais. Le réseau `diasporale` doit déjà exister : rien
 * n'est créé d'office, ni réseau, ni personne, ni adhésion.
 *
 * Idempotente, elle pose :
 * - l'équipe de modération de démonstration du réseau, la même que celle des comptes de
 *   démonstration (`ensureDemoModerationTeam`), sans périmètre : elle reçoit les signalements
 *   d'un message de mise en relation et les contenus retenus ;
 * - la modératrice de démonstration parmi ses membres actifs, si son compte existe déjà (adresse
 *   réservée vérifiée, adhésion active) ; sinon, l'équipement de son compte l'y mettra.
 *
 * Elle ne pose PAS encore la politique des trois natures de mise en relation
 * (`CONTEXTUAL_KINDS`) : celle-ci ne s'écrit que par `contextualMessaging/operator.setPolicy`,
 * fonction de console réservée à l'administrateur de plateforme, et la table
 * `contextualPolicies` n'a pas d'autre utilitaire. La tranche ne la contourne pas : l'extraction
 * du cœur de `setPolicy` (comme `graph/connections.blockPair` pour le blocage) est demandée au
 * moteur par une issue [S1]. D'ici là, la graine RELIT et rend l'état des trois politiques.
 */
export const matchmakingBenchForRecette = internalMutation({
  args: { confirmNonProduction: v.string() },
  returns: v.object({
    network: v.id("networks"),
    team: v.object({ teamId: v.id("moderationTeams"), created: v.boolean(), moderatorsAdded: v.number() }),
    policies: v.array(v.object({ kind: contextualKindValidator, enabled: v.boolean() })),
  }),
  handler: async (ctx, { confirmNonProduction }) => {
    assertSeedsAllowed(confirmNonProduction)
    const network = await requireLocalRecetteNetwork(ctx)
    const now = Date.now()

    const team = await ensureDemoModerationTeam(ctx, network, now)
    let moderatorsAdded = 0
    for (const actor of DIASPORALE_DEMO_ACTORS) {
      if (!DIASPORALE_DEMO_ACTOR_SPECS[actor].moderationTeam) continue
      // Retenue sur son adresse réservée vérifiée, jamais sur son seul identifiant public.
      const person = await personOfActor(ctx, actor)
      if (!person || !(await isActiveMember(ctx, network._id, person._id))) continue
      if (await ensureModerationTeamMember(ctx, network, team.teamId, person._id, now)) moderatorsAdded += 1
    }

    // Lecture seule : l'ouverture attend l'extraction du cœur de `setPolicy` (issue [S1]).
    const policies: { kind: (typeof CONTEXTUAL_KINDS)[number]; enabled: boolean }[] = []
    for (const kind of CONTEXTUAL_KINDS) policies.push({ kind, enabled: await contextualPolicyEnabled(ctx, network._id, kind) })
    return { network: network._id, team: { teamId: team.teamId, created: team.created, moderatorsAdded }, policies }
  },
})

/** Une source de lecture fictive pour le membre EN ATTENTE, sans changer son admission. */
export const storyReaderForRecette = internalMutation({
  args: { confirmNonProduction: v.string() },
  returns: v.object({ created: v.boolean() }),
  handler: async (ctx, { confirmNonProduction }) => {
    assertSeedsAllowed(confirmNonProduction)
    const { network, person: author } = await requireLocalRecetteAuthor(ctx)
    const reader = await ctx.db
      .query("persons")
      .withIndex("by_handle", (q) => q.eq("handle", STORY_READER_RECETTE_HANDLE))
      .unique()
    if (!reader || !isPublishedPerson(reader)) throw new Error("Recette refusée : profil lecteur fictif préexistant requis.")
    const access = await effectiveStatusIn(ctx, network, reader._id)
    if (!access.membership || access.status !== "en_attente" || access.rootStatus === null || !isActiveStatus(access.rootStatus)) {
      throw new Error("Recette refusée : lecteur en attente et adhésion racine active requis.")
    }
    if (await verifiedEmailHashOf(ctx, reader._id) !== await sha256Hex(STORY_READER_RECETTE_EMAIL)) {
      throw new Error("Recette refusée : identité fictive vérifiée du lecteur requise.")
    }
    if (await isFollowingPerson(ctx, network._id, reader._id, author._id)) return { created: false }
    if (await isBlockedBetween(ctx, reader._id, author._id)) throw new Error("Recette refusée : paire fictive indisponible.")
    const followId = await ctx.db.insert("follows", {
      networkId: network._id,
      followerPersonId: reader._id,
      targetPersonId: author._id,
      createdAt: Date.now(),
    })
    const follow = await ctx.db.get(followId)
    if (!follow) throw new Error("Recette refusée : abonnement fictif indisponible.")
    await followerCounts.insert(ctx, follow)
    return { created: true }
  },
})
