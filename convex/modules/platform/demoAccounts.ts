/**
 * Comptes de DÉMONSTRATION — développement local et déploiement de démonstration.
 *
 * Un compte par acteur du réseau, sur une adresse réservée
 * (`<acteur>@demo.antsia.test` : le domaine `.test` n'est jamais routable). La
 * connexion passe par le VRAI parcours OTP : en développement local, le code
 * s'affiche à l'écran (`devTools.latestOtp`) et l'écran le saisit pour la
 * personne qui teste. La session reste une session Better Auth ordinaire
 * (aucune exception de développement, PA4).
 *
 * L'accueil (consentement, préférences, profil publié) passe par les vraies
 * mutations, appelées par l'application. Ce module ne pose que ce qu'un compte
 * ne peut pas se donner seul, pour la seule personne de la session et
 * seulement si son adresse vérifiée est celle de l'acteur demandé :
 * - une identité IDN FICTIVE de niveau 2 (compte IDN et preuve de démonstration,
 *   relus ensuite par la vraie synchronisation d'identité) pour les acteurs
 *   « vérifiés » ;
 * - l'entrée dans la racine par la vraie règle d'admission ;
 * - le rôle de modération ;
 * - la page (presse, entreprise, association, institution) et son niveau de
 *   confiance, la personne en étant l'administratrice ;
 * - la vitrine publiée d'une boutique ; si la racine n'a encore aucune politique
 *   des vitrines (fermée par défaut), la démonstration lui pose `review` — ouverte,
 *   les nouvelles demandes passant par l'examen — pour que la vitrine se lise ;
 *   une politique déjà décidée n'est jamais touchée.
 *
 * Garde : `demoAccountsAllowed` — la double garde du développement local
 * (variable `ANTSIA_DEV_TOOLS` ET backend local), ou le déploiement de
 * démonstration déclaré (`ANTSIA_DEMO_DEPLOYMENT` égal au nom du déploiement,
 * jamais la production). Ailleurs, le catalogue est vide et la mutation refuse :
 * aucune production ne peut s'en servir.
 */
import { normalizeFamilyName, normalizeGivenNames } from "@antsia/social-domain/civilName"
import { missingConsentsToJoin } from "@antsia/social-domain/consent"
import { entryStatusFor } from "@antsia/social-domain/membership"
import { assertPageHandle, assertPageName, normalizePageDescription, pageTrustRank } from "@antsia/social-domain/pages"
import { v } from "convex/values"

import { components } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import { type MutationCtx, query } from "../../_generated/server"
import { getMembership, getRootNetwork } from "../../lib/access"
import { DEMO_EMAIL_DOMAIN, demoAccountsAllowed } from "../../lib/devTools"
import { checked, fail } from "../../lib/errors"
import { personMutation } from "../../lib/functions"
import { literals, membershipRoleValidator, membershipStatusValidator } from "../../lib/validators"
import { moderateContentWrite } from "../moderation/policy"
import { assertPageHandleFree, isPageOnRoot, pageSearchText } from "../pages/access"
import { admitToNetwork, setMembershipStatus } from "../people/admission"
import { syncIdentityForPerson } from "../people/identity"
import { hasStrongIdentityFor } from "../people/persons"
import { refreshReaderContexts } from "../posts/feedMaterialization"
import { DEMO_FIGURANTS, demoFigurantEmailOf, demoFigurantOf } from "../../seeds/demoFigurants"

export { DEMO_EMAIL_DOMAIN }

/** Les acteurs, dans l'ordre de l'écran de connexion. */
export const DEMO_ACTORS = ["membre", "verifie", "nouveau", "presse", "commercant", "association", "administration", "moderateur"] as const
export type DemoActor = (typeof DEMO_ACTORS)[number]
export const demoActorValidator = literals(DEMO_ACTORS)

type DemoPage = {
  ownerKind: "media" | "company" | "association" | "institution"
  trust: "official" | "verified" | "community"
  name: string
  handle: string
  description: string
}

type DemoActorSpec = {
  /** `null` : le compte s'arrête à l'accueil (le nouvel arrivant le remplit lui-même). */
  profile: { handle: string; givenNames: string; familyName: string; headline: string } | null
  /** Identité IDN fictive de niveau 2 : badge « Vérifié », adhésion vérifiée, signature officielle. */
  verified: boolean
  role?: "network_moderator"
  page?: DemoPage
  /** Une vitrine publiée, portée par la page de l'acteur. */
  shop?: { model: "products" | "quote_services" }
}

/** Personnes FICTIVES : aucun nom, aucune page, aucune adresse ne désigne une entité réelle. */
const DEMO_ACTOR_SPECS: Record<DemoActor, DemoActorSpec> = {
  membre: {
    profile: { handle: "membre.demo", givenNames: "awa", familyName: "mba", headline: "Membre du réseau, à Libreville" },
    verified: false,
  },
  verifie: {
    profile: { handle: "verifie.demo", givenNames: "jean-rémy", familyName: "ndong", headline: "Membre vérifié par IDN (démonstration)" },
    verified: true,
  },
  nouveau: { profile: null, verified: false },
  presse: {
    profile: { handle: "presse.demo", givenNames: "sylvie", familyName: "oyane", headline: "Journaliste à Gabon Actu Démo" },
    verified: true,
    page: { ownerKind: "media", trust: "verified", name: "Gabon Actu Démo", handle: "gabon-actu-demo", description: "Média fictif de démonstration : actualités locales et reportages." },
  },
  commercant: {
    profile: { handle: "commercant.demo", givenNames: "patrick", familyName: "moussavou", headline: "Commerçant à Owendo" },
    verified: false,
    page: { ownerKind: "company", trust: "community", name: "Épicerie Moussavou Démo", handle: "epicerie-moussavou-demo", description: "Boutique fictive de démonstration : produits du quotidien." },
    shop: { model: "products" },
  },
  association: {
    profile: { handle: "association.demo", givenNames: "clarisse", familyName: "ella", headline: "Présidente d'une association de démonstration" },
    verified: true,
    page: { ownerKind: "association", trust: "community", name: "Jeunes de Lambaréné Démo", handle: "jeunes-lambarene-demo", description: "Association fictive de démonstration : entraide et activités pour les jeunes." },
  },
  administration: {
    profile: { handle: "administration.demo", givenNames: "paul-henri", familyName: "nze", headline: "Agent de la Mairie Démo" },
    verified: true,
    page: { ownerKind: "institution", trust: "official", name: "Mairie Démo", handle: "mairie-demo", description: "Institution fictive de démonstration : communiqués et services municipaux." },
  },
  moderateur: {
    profile: { handle: "moderation.demo", givenNames: "nadège", familyName: "koumba", headline: "Modératrice du réseau (démonstration)" },
    verified: true,
    role: "network_moderator",
  },
}

/** L'adresse réservée d'un acteur. */
export function demoEmailOf(actor: DemoActor): string {
  return `${actor}@${DEMO_EMAIL_DOMAIN}`
}

/** Le nom affiché d'un acteur : Prénom NOM, par le normaliseur partagé de l'état civil. */
function displayNameOf(profile: NonNullable<DemoActorSpec["profile"]>): string {
  return `${normalizeGivenNames(profile.givenNames)} ${normalizeFamilyName(profile.familyName)}`
}

/** Le sujet IDN fictif d'un acteur : jamais un sujet réel (préfixe réservé). */
function demoIdnSubjectOf(actor: DemoActor): string {
  return `demo-idn-${actor}`
}

const demoEntryValidator = v.object({
  actor: demoActorValidator,
  email: v.string(),
  profile: v.union(v.object({ handle: v.string(), displayName: v.string(), headline: v.string() }), v.null()),
})

/**
 * @publicProjection Développement local et démonstration déclarée seulement : le
 * catalogue des comptes de démonstration (adresse réservée et profil fictif),
 * vide partout ailleurs (production comprise).
 */
export const catalogue = query({
  args: {},
  returns: v.array(demoEntryValidator),
  handler: async () => {
    if (!demoAccountsAllowed()) return []
    return DEMO_ACTORS.map((actor) => {
      const profile = DEMO_ACTOR_SPECS[actor].profile
      return {
        actor,
        email: demoEmailOf(actor),
        profile: profile ? { handle: profile.handle, displayName: displayNameOf(profile), headline: profile.headline } : null,
      }
    })
  },
})

/** L'adresse vérifiée du compte de la session, relue dans le composant d'authentification. */
async function sessionEmail(ctx: MutationCtx, authUserId: string): Promise<string | null> {
  const user = await ctx.runQuery(components.betterAuth.adapter.findOne, {
    model: "user",
    where: [{ field: "_id", value: authUserId }],
    select: ["_id", "email", "emailVerified"],
  }) as { _id: string; email: string; emailVerified?: boolean } | null
  if (!user || user._id !== authUserId || user.emailVerified !== true) return null
  return user.email.trim().toLowerCase()
}

/** Compte IDN et preuve FICTIFS (niveau 2), puis la vraie synchronisation écrit le lien. */
async function ensureDemoIdentity(ctx: MutationCtx, actor: DemoActor, person: Doc<"persons">): Promise<void> {
  const subject = demoIdnSubjectOf(actor)
  const accounts = await ctx.runQuery(components.betterAuth.adapter.findMany, {
    model: "account",
    where: [{ field: "providerId", value: "idn" }, { field: "userId", value: person.authUserId }],
    select: ["accountId"],
    paginationOpts: { cursor: null, numItems: 2 },
  }) as { page: { accountId: string }[] }
  if (accounts.page.length === 0) {
    const now = Date.now()
    await ctx.runMutation(components.betterAuth.adapter.create, {
      input: { model: "account", data: { userId: person.authUserId, providerId: "idn", accountId: subject, createdAt: now, updatedAt: now } },
    })
  } else if (accounts.page[0]?.accountId !== subject) {
    // Un vrai compte IDN déjà lié n'est jamais remplacé par la démonstration.
    return
  }
  // La preuve que le callback IDN déposerait (niveau 2), FICTIVE et propre à la démonstration.
  const proof = await ctx.db.query("idnProofs").withIndex("by_subject", (q) => q.eq("subject", subject)).unique()
  if (proof) await ctx.db.patch(proof._id, { loa: 2, observedAt: Date.now() })
  else await ctx.db.insert("idnProofs", { subject, loa: 2, observedAt: Date.now() })
  await syncIdentityForPerson(ctx, person)
}

/** La page de l'acteur, créée une fois ; la personne en est l'administratrice acceptée. */
async function ensureDemoPage(ctx: MutationCtx, root: Doc<"networks">, person: Doc<"persons">, spec: DemoPage): Promise<Id<"pages">> {
  const handle = checked(() => assertPageHandle(spec.handle))
  const existing = await ctx.db.query("pages").withIndex("by_handle", (q) => q.eq("handle", handle)).unique()
  const now = Date.now()
  let pageId: Id<"pages">
  if (existing) {
    // Une page du même identifiant qui n'est pas celle de la démonstration n'est jamais reprise.
    if (existing.createdByPersonId !== person._id) return fail("conflict")
    pageId = existing._id
  } else {
    await assertPageHandleFree(ctx, handle)
    const name = checked(() => assertPageName(spec.name))
    const description = checked(() => normalizePageDescription(spec.description))
    const visibility = "network" as const
    pageId = await ctx.db.insert("pages", {
      networkId: root._id,
      handle,
      name,
      ...(description !== undefined ? { description } : {}),
      ownerKind: spec.ownerKind,
      trust: spec.trust,
      trustRank: pageTrustRank(spec.trust),
      country: "GA",
      visibility,
      onRoot: isPageOnRoot(root, visibility),
      status: "active",
      createdByPersonId: person._id,
      searchText: pageSearchText({ name, handle }),
      createdAt: now,
      updatedAt: now,
    })
    await moderateContentWrite(ctx, { networkId: root._id, ownerPersonId: person._id, kind: "page", id: pageId, text: `${name} ${description ?? ""}` })
  }
  const signatory = await ctx.db.query("pageSignatories").withIndex("by_page_person", (q) => q.eq("pageId", pageId).eq("personId", person._id)).unique()
  if (!signatory) await ctx.db.insert("pageSignatories", { networkId: root._id, pageId, personId: person._id, role: "admin", acceptedAt: now, createdAt: now, updatedAt: now })
  else if (signatory.role !== "admin" || signatory.acceptedAt === undefined) await ctx.db.patch(signatory._id, { role: "admin", acceptedAt: signatory.acceptedAt ?? now, updatedAt: now })
  return pageId
}

/** La vitrine publiée de la page de l'acteur, lisible dans la racine. */
async function ensureDemoShop(ctx: MutationCtx, root: Doc<"networks">, person: Doc<"persons">, pageId: Id<"pages">, model: "products" | "quote_services"): Promise<void> {
  const now = Date.now()
  // Aucune politique : fermée par défaut. La démonstration ouvre à l'examen ; une décision existante reste.
  const policy = await ctx.db.query("shopNetworkPolicies").withIndex("by_network", (q) => q.eq("networkId", root._id)).unique()
  if (!policy) await ctx.db.insert("shopNetworkPolicies", { networkId: root._id, storefront: "review", updatedAt: now, updatedByPersonId: person._id })
  const existing = await ctx.db.query("shops").withIndex("by_page", (q) => q.eq("pageId", pageId)).unique()
  if (existing) {
    if (existing.storefront !== "published") await ctx.db.patch(existing._id, { storefront: "published", publishedAt: now, decidedAt: now, updatedAt: now })
    return
  }
  await ctx.db.insert("shops", {
    networkId: root._id,
    preparedByPersonId: person._id,
    pageId,
    model,
    storefront: "published",
    requestedAt: now,
    decidedAt: now,
    publishedAt: now,
    visibility: "network",
    createdAt: now,
    updatedAt: now,
  })
}

/**
 * @selfScoped Développement local et démonstration déclarée seulement : équipe le compte de la SESSION en
 * l'acteur demandé, si son adresse vérifiée est celle de cet acteur. Exige le
 * profil publié et le consentement d'accueil (posés par les vraies mutations) ;
 * idempotente — un second appel ne recrée rien.
 */
export const equipMyDemoAccount = personMutation({
  args: { actor: demoActorValidator },
  returns: v.object({ actor: demoActorValidator, status: membershipStatusValidator, role: membershipRoleValidator }),
  handler: async (ctx, { actor }) => {
    if (!demoAccountsAllowed()) return fail("policyRefused")
    const person = ctx.person
    if ((await sessionEmail(ctx, person.authUserId)) !== demoEmailOf(actor)) return fail("policyRefused")
    const spec = DEMO_ACTOR_SPECS[actor]
    if (spec.profile === null) return fail("policyRefused")
    if (!person.handle || !person.displayName || person.publishedAt === undefined) return fail("profileRequired")
    const consents = await ctx.db.query("consents").withIndex("by_person_and_purpose", (q) => q.eq("personId", person._id)).take(100)
    if (missingConsentsToJoin(consents).length > 0) return fail("consentRequired")
    const root = await getRootNetwork(ctx)
    if (!root) return fail("notFound")

    if (spec.verified) await ensureDemoIdentity(ctx, actor, person)

    // L'entrée dans la racine par la vraie règle d'admission : vérifiée avec l'identité forte, déclarée sinon.
    const evidence = { strongIdentity: await hasStrongIdentityFor(ctx, person._id), externalVerification: false, sponsored: false }
    let membership = await getMembership(ctx, root._id, person._id)
    if (!membership || membership.status === "partie") {
      const entry = entryStatusFor(root.membershipPolicy, evidence)
      if (entry === null) return fail("policyRefused")
      await admitToNetwork(ctx, { personId: person._id, network: root, root, entry, evidence })
      await refreshReaderContexts(ctx, root._id, person._id)
      membership = await getMembership(ctx, root._id, person._id)
    } else if (evidence.strongIdentity && membership.status === "declaree") {
      await setMembershipStatus(ctx, membership, "verifiee", { verifiedBy: "idn" })
      membership = await getMembership(ctx, root._id, person._id)
    }
    if (!membership) return fail("notFound")
    if (spec.role && membership.role !== spec.role) {
      await ctx.db.patch(membership._id, { role: spec.role })
      membership = { ...membership, role: spec.role }
    }

    if (spec.page) {
      const pageId = await ensureDemoPage(ctx, root, person, spec.page)
      if (spec.shop) await ensureDemoShop(ctx, root, person, pageId, spec.shop.model)
    }
    return { actor, status: membership.status, role: membership.role }
  },
})

const figurantEntryValidator = v.object({
  slot: v.number(),
  email: v.string(),
  profile: v.object({ handle: v.string(), displayName: v.string(), headline: v.string() }),
})

/**
 * @publicProjection Développement local et démonstration déclarée seulement : les
 * figurants fictifs (adresse réservée et profil), vide partout ailleurs. L'écran de
 * connexion ne les lit pas : ils animent le fil, les suggestions et les demandes.
 */
export const figurantCatalogue = query({
  args: {},
  returns: v.array(figurantEntryValidator),
  handler: async () => {
    if (!demoAccountsAllowed()) return []
    return DEMO_FIGURANTS.map((figurant) => ({
      slot: figurant.slot,
      email: demoFigurantEmailOf(figurant.slot),
      profile: { handle: figurant.handle, displayName: displayNameOf(figurant), headline: figurant.headline },
    }))
  },
})

/**
 * @selfScoped Développement local et démonstration déclarée seulement : fait entrer le
 * figurant de la SESSION dans la racine par la vraie règle d'admission, si son adresse
 * vérifiée est celle du figurant demandé et son profil publié sous l'identifiant attendu.
 * Ni identité, ni rôle, ni page : un membre déclaré ordinaire. Idempotente.
 */
export const equipMyDemoFigurant = personMutation({
  args: { slot: v.number() },
  returns: v.object({ slot: v.number(), status: membershipStatusValidator }),
  handler: async (ctx, { slot }) => {
    if (!demoAccountsAllowed()) return fail("policyRefused")
    const figurant = demoFigurantOf(slot)
    if (!figurant) return fail("policyRefused")
    const person = ctx.person
    if ((await sessionEmail(ctx, person.authUserId)) !== demoFigurantEmailOf(slot)) return fail("policyRefused")
    if (person.handle !== figurant.handle || person.displayName !== displayNameOf(figurant) || person.publishedAt === undefined) return fail("profileRequired")
    const consents = await ctx.db.query("consents").withIndex("by_person_and_purpose", (q) => q.eq("personId", person._id)).take(100)
    if (missingConsentsToJoin(consents).length > 0) return fail("consentRequired")
    const root = await getRootNetwork(ctx)
    if (!root) return fail("notFound")
    let membership = await getMembership(ctx, root._id, person._id)
    if (!membership || membership.status === "partie") {
      const evidence = { strongIdentity: await hasStrongIdentityFor(ctx, person._id), externalVerification: false, sponsored: false }
      const entry = entryStatusFor(root.membershipPolicy, evidence)
      if (entry === null) return fail("policyRefused")
      await admitToNetwork(ctx, { personId: person._id, network: root, root, entry, evidence })
      await refreshReaderContexts(ctx, root._id, person._id)
      membership = await getMembership(ctx, root._id, person._id)
    }
    if (!membership) return fail("notFound")
    return { slot, status: membership.status }
  },
})
