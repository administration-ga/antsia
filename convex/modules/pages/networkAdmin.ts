/**
 * ADR-0042, lot A2 (CH-815) — les pages OFFICIELLES d'un réseau, par SON administrateur, depuis
 * l'application d'administration de ce réseau (fiche § 3 : décision du propriétaire du 22/11/2026,
 * « les pages officielles sont créées par le super admin » ; § 4.2, « Institutions et pages officielles »).
 *
 * Les jumeaux, bornés au réseau de l'administrateur, des pouvoirs de console sur les pages d'institution
 * et du sommeil — MÊME chemin métier, extrait de `pages/admin.ts` et de `pages/sleep.ts` :
 *
 *  · créer : `insertInstitutionPage` (mêmes règles de nom, d'adresse, de sigle, de pays), « Officiel »
 *    DANS CE RÉSEAU SEULEMENT — visibilité `network` imposée, aucune référence d'import : la page ne se
 *    lit pas depuis la racine (`onRoot` faux), n'entre dans aucune projection publique et ne porte
 *    aucune autorité fédérée (qui exigent `visibility: "root"` et `onRoot`) ;
 *  · signataire : `grantInstitutionAdmin` (l'invitation d'administrateur de la console, identité forte
 *    exigée, `PAGE_SIGNATORY_IDENTITY_REQUIRED`), réservé à un membre actif du réseau (sinon le refus
 *    indistinct) ; le remplacement retire l'ancien (`revokeInstitutionTeamMember`) ;
 *  · sommeil : `applyPageSleep` / `applyPageWake`, aucun état nouveau. L'administration du réseau est la
 *    décision humaine qui lève aussi un sommeil ÉCHU (`pages/sleep.ts`) ; une page retirée par la
 *    plateforme ou le juge ne se réveille jamais d'ici.
 *
 * Seules les pages d'INSTITUTION « Officiel » de ce réseau, natives, se gèrent ici ; toute autre page
 * (de membre, d'un autre réseau, reflétée) rend le refus indistinct. Le retrait du badge reste à la
 * plateforme (`pages/admin.setPageTrust`, console seule).
 *
 * Garde : `networkAdminQuery` / `networkAdminMutation` (adhésion, rôle relu, session IDN prouvée de
 * l'application qui administre CE réseau, accès journalisé ; refus indistinct sinon), puis la clé
 * `pages` : module fermé, rien ne se crée — les membres ne verraient d'ailleurs aucune page. Chaque
 * décision entre au journal, à titre de `network_admin`, dans la définition même de la mutation
 * (cliquet `network-admin-audit`). Aucune réponse ne porte la preuve de session (`ctx.adminSession`).
 */
import { assertDecisionReason } from "@antsia/social-domain/audit"
import { pageSleepState, pageTrustRank } from "@antsia/social-domain/pages"
import { paginationOptsValidator, paginationResultValidator } from "convex/server"
import { type Infer, v } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
import { isActiveMember } from "../../lib/access"
import { checked, fail, notFound } from "../../lib/errors"
import { networkAdminMutation, networkAdminQuery } from "../../lib/functions"
import { assertNativePageManagement } from "../federation/mirrorAccess"
import { findPublishedPersonByHandle } from "../people/miniProfile"
import { appendAudit } from "../platform/audit"
import { grantInstitutionAdmin, insertInstitutionPage, institutionSignatoryOf, revokeInstitutionTeamMember } from "./admin"
import { applyPageSleep, applyPageWake } from "./sleep"
import { pageStatusValidator } from "./validators"

/** Pages rendues par fenêtre de la liste : chacune relit son équipe (bornée par le plafond des signataires). */
export const OFFICIAL_PAGES_WINDOW_MAX = 50
/** Le motif d'une décision : dix caractères au moins, comme à la console. */
const REASON_MIN = 10
/** Longueur au-delà de laquelle un identifiant saisi ne désigne personne. */
const HANDLE_INPUT_MAX = 80

type Ctx = Pick<QueryCtx, "db"> & { networkId: Id<"networks"> }

/** L'état d'une page officielle pour l'administration : active, en sommeil, sommeil échu, ou retirée par la plateforme ou le juge. */
const officialPageStateValidator = v.union(v.literal("active"), v.literal("asleep"), v.literal("expired"), v.literal("withdrawn"))

const signatoryValidator = v.object({
  personId: v.id("persons"),
  /** Identifiant et nom PUBLIÉS ; `null` si le profil ne l'est pas (l'écran dit un nom neutre). */
  handle: v.union(v.string(), v.null()),
  displayName: v.union(v.string(), v.null()),
  /** L'invitation est-elle acceptée ? Une invitation en attente ne donne aucun droit. */
  accepted: v.boolean(),
})

const officialPageValidator = v.object({
  pageId: v.id("pages"),
  name: v.string(),
  handle: v.string(),
  country: v.union(v.string(), v.null()),
  state: officialPageStateValidator,
  /** L'échéance du sommeil ; `null` hors sommeil. */
  sleepEndsAt: v.union(v.number(), v.null()),
  signatory: v.union(signatoryValidator, v.null()),
  createdAt: v.number(),
})

const candidateValidator = v.union(v.object({ personId: v.id("persons"), handle: v.string(), displayName: v.string() }), v.null())

/** Une page d'institution « Officiel » (la confiance n'appartient qu'à une institution : défensif). */
function isOfficialInstitution(page: Doc<"pages">): boolean {
  return page.ownerKind === "institution" && page.trust === "official"
}

function stateOf(page: Doc<"pages">, now: number): Infer<typeof officialPageStateValidator> {
  if (page.status === "active") return "active"
  const sleep = pageSleepState(page, now)
  return sleep === "none" ? "withdrawn" : sleep
}

/** La page officielle native de CE réseau, quel que soit son état ; refus indistinct sinon. */
async function requireOfficialPage(ctx: Ctx, pageId: Id<"pages">): Promise<Doc<"pages">> {
  const page = await ctx.db.get(pageId)
  if (!page || page.networkId !== ctx.networkId || !isOfficialInstitution(page)) return notFound()
  await assertNativePageManagement(ctx, page._id)
  return page
}

/** Le futur signataire : une personne vivante, membre actif de CE réseau ; refus indistinct sinon (l'identité forte se juge à l'habilitation). */
async function requireSignatoryCandidate(ctx: Ctx, personId: Id<"persons">): Promise<Doc<"persons">> {
  const person = await ctx.db.get(personId)
  if (!person || person.deletionRequestedAt !== undefined || person.erasedAt !== undefined) return notFound()
  if (!(await isActiveMember(ctx, ctx.networkId, person._id))) return notFound()
  return person
}

/** Les pages officielles du réseau, par état (`active` par défaut ; `inactive` : sommeil, sommeil échu, retrait), les plus récentes d'abord. */
export const officialPages = networkAdminQuery({
  feature: "pages",
  args: { status: v.optional(pageStatusValidator), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(officialPageValidator),
  handler: async (ctx, args) => {
    const opts = { ...args.paginationOpts, numItems: Math.min(Math.max(Math.trunc(args.paginationOpts.numItems), 1), OFFICIAL_PAGES_WINDOW_MAX) }
    const status = args.status ?? "active"
    const result = await ctx.db
      .query("pages")
      .withIndex("by_network_status_trustRank_createdAt", (q) => q.eq("networkId", ctx.networkId).eq("status", status).eq("trustRank", pageTrustRank("official")))
      .order("desc")
      .paginate(opts)
    const now = Date.now()
    const page: Infer<typeof officialPageValidator>[] = []
    for (const row of result.page) {
      if (!isOfficialInstitution(row)) continue
      page.push({
        pageId: row._id,
        name: row.name,
        handle: row.handle,
        country: row.country ?? null,
        state: stateOf(row, now),
        sleepEndsAt: row.sleepEndsAt ?? null,
        signatory: await institutionSignatoryOf(ctx, row),
        createdAt: row.createdAt,
      })
    }
    return { ...result, page }
  },
})

/**
 * Le membre actif du réseau désigné par son identifiant public, pour choisir un signataire (patron de
 * `diaspora/moderationDesk.teamCandidate`) ; `null` sinon (inconnu, profil retiré, non-membre : la même réponse).
 */
export const signatoryCandidate = networkAdminQuery({
  feature: "pages",
  args: { handle: v.string() },
  returns: candidateValidator,
  handler: async (ctx, { handle }) => {
    const raw = handle.trim().replace(/^@/, "")
    if (raw.length === 0 || raw.length > HANDLE_INPUT_MAX) return null
    const person = await findPublishedPersonByHandle(ctx, ctx.networkId, raw)
    if (!person) return null
    const published = person.handle ?? raw
    return { personId: person._id, handle: published, displayName: person.displayName ?? published }
  },
})

/**
 * Créer une page d'institution « Officiel » DANS CE RÉSEAU, et inviter son signataire (administrateur de
 * la page, identité forte exigée). Deux lignes au journal : `page.create_official`, `page.signatory_grant`.
 */
export const createOfficialPage = networkAdminMutation({
  feature: "pages",
  writeBucket: "page.manage",
  args: {
    name: v.string(),
    handle: v.optional(v.string()),
    shortName: v.optional(v.string()),
    description: v.optional(v.string()),
    country: v.optional(v.string()),
    signatoryPersonId: v.id("persons"),
    reason: v.string(),
  },
  returns: v.object({ pageId: v.id("pages"), handle: v.string() }),
  handler: async (ctx, args) => {
    const motive = checked(() => assertDecisionReason(args.reason, REASON_MIN))
    const signatory = await requireSignatoryCandidate(ctx, args.signatoryPersonId)
    const now = Date.now()
    const { pageId, handle } = await insertInstitutionPage(ctx, ctx.network, {
      name: args.name,
      ...(args.handle !== undefined ? { handle: args.handle } : {}),
      ...(args.shortName !== undefined ? { shortName: args.shortName } : {}),
      ...(args.description !== undefined ? { description: args.description } : {}),
      ...(args.country !== undefined ? { country: args.country } : {}),
      // « Officiel » dans son réseau seulement : jamais la règle `root`, jamais un import contractuel.
      visibility: "network",
    }, now)
    await appendAudit(ctx, {
      action: "page.create_official",
      capacity: "network_admin",
      actorPersonId: ctx.person._id,
      networkId: ctx.networkId,
      subject: { table: "pages", id: pageId },
      details: { reason: motive, handle, importRef: null },
      at: now,
    })
    const page = await ctx.db.get(pageId)
    if (!page) return notFound()
    const { audit } = await grantInstitutionAdmin(ctx, page, signatory, { actorPersonId: ctx.person._id, capacity: "network_admin", motive, now, requireRoom: true })
    if (audit) await appendAudit(ctx, audit)
    return { pageId, handle }
  },
})

/**
 * Désigner le signataire d'une page officielle ACTIVE du réseau (invitation d'administrateur), et, s'il
 * est nommé, retirer celui qu'il remplace (`replacesPersonId`, toute ligne de l'équipe de la page). Le
 * remplacement est la décision du réseau : la page peut attendre l'acceptation sans administrateur
 * vivant ; l'administration peut désigner à nouveau. Déjà administrateur et rien à retirer : rien n'est écrit.
 */
export const designateSignatory = networkAdminMutation({
  feature: "pages",
  writeBucket: "page.manage",
  args: { pageId: v.id("pages"), personId: v.id("persons"), replacesPersonId: v.optional(v.id("persons")), reason: v.string() },
  returns: v.object({ invited: v.boolean(), replaced: v.boolean() }),
  handler: async (ctx, args) => {
    const motive = checked(() => assertDecisionReason(args.reason, REASON_MIN))
    if (args.replacesPersonId === args.personId) return fail("invalidArgument", { field: "replacesPersonId" })
    const page = await requireOfficialPage(ctx, args.pageId)
    // Une page en sommeil ou retirée garde son équipe figée : on ne la recompose pas.
    if (page.status !== "active") return notFound()
    const person = await requireSignatoryCandidate(ctx, args.personId)
    const now = Date.now()
    const decision = { actorPersonId: ctx.person._id, capacity: "network_admin" as const, motive, now }
    const granted = await grantInstitutionAdmin(ctx, page, person, { ...decision, requireRoom: true })
    if (granted.audit) await appendAudit(ctx, granted.audit)
    const revoked = args.replacesPersonId === undefined ? null : await revokeInstitutionTeamMember(ctx, page, args.replacesPersonId, decision)
    if (revoked) await appendAudit(ctx, revoked)
    return { invited: granted.invited, replaced: revoked !== null }
  },
})

/** Mettre une page officielle ACTIVE du réseau en sommeil (trente jours) : elle se ferme comme un retrait, ses directs compris. */
export const sleepOfficialPage = networkAdminMutation({
  feature: "pages",
  writeBucket: "page.manage",
  args: { pageId: v.id("pages"), reason: v.string() },
  returns: v.object({ sleepEndsAt: v.number() }),
  handler: async (ctx, args) => {
    const motive = checked(() => assertDecisionReason(args.reason, REASON_MIN))
    const page = await requireOfficialPage(ctx, args.pageId)
    if (page.status !== "active") return notFound()
    const now = Date.now()
    const sleepEndsAt = await applyPageSleep(ctx, page, now)
    await appendAudit(ctx, {
      action: "page.sleep",
      capacity: "network_admin",
      actorPersonId: ctx.person._id,
      networkId: ctx.networkId,
      subject: { table: "pages", id: page._id },
      details: { reason: motive, sleepEndsAt },
      at: now,
    })
    return { sleepEndsAt }
  },
})

/**
 * Réveiller une page officielle EN SOMMEIL du réseau, échue ou non (la décision humaine de sortie).
 * Page active, ou retirée par la plateforme ou le juge (sans échéance) : refus indistinct ; tenue par une
 * mesure du juge : `conflict`. Tout revient d'un coup.
 */
export const wakeOfficialPage = networkAdminMutation({
  feature: "pages",
  writeBucket: "page.manage",
  args: { pageId: v.id("pages"), reason: v.string() },
  returns: v.object({ status: v.literal("active") }),
  handler: async (ctx, args) => {
    const motive = checked(() => assertDecisionReason(args.reason, REASON_MIN))
    const page = await requireOfficialPage(ctx, args.pageId)
    const now = Date.now()
    if (pageSleepState(page, now) === "none" || page.sleepEndsAt === undefined) return notFound()
    const sleepEndsAt = page.sleepEndsAt
    await applyPageWake(ctx, page, now)
    await appendAudit(ctx, {
      action: "page.wake",
      capacity: "network_admin",
      actorPersonId: ctx.person._id,
      networkId: ctx.networkId,
      subject: { table: "pages", id: page._id },
      details: { reason: motive, sleepEndsAt },
      at: now,
    })
    return { status: "active" as const }
  },
})
