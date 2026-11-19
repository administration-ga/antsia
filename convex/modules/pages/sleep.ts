/**
 * AS-11a — le SOMMEIL d'une page : un administrateur la met en sommeil trente jours, tout
 * administrateur de la page peut la réactiver tant que l'échéance n'est pas passée.
 *
 * Écrit à neuf (décision du 19/11/2026, « page en sommeil trente jours, sans nouvel état ») :
 *
 *  · le sommeil n'est PAS un troisième état : c'est `inactive` (le retrait du moteur, que toutes
 *    les lectures ferment déjà) plus l'échéance `pages.sleepEndsAt` ; l'état se DÉRIVE par
 *    `pageSleepState` (`none`, `asleep`, `expired`), l'échéance se constate à la LECTURE, sans
 *    passage planifié ;
 *  · AUCUN objet de la page n'est écrit : la garde de page masque tout pendant le sommeil (fiche,
 *    annuaire, fil, offres, emplois, évènements, groupe d'association), donc le réveil rend tout ;
 *    seuls les directs se ferment, par l'écrivain partagé `applyPageStatus` ;
 *  · l'équipe est FIGÉE : aucun geste de gestion ne passe par une page `inactive`
 *    (`requireManagedPage`, `requirePageTeam`) ; seul `sleepingPageTeamRole` lit l'équipe d'une
 *    page endormie, et seulement ici (cliquet `page-authority-readers`) ;
 *  · échu, le sommeil ne se lève plus depuis la page (`PAGE_SLEEP_EXPIRED`) et rien n'est effacé :
 *    la sortie est une décision humaine (console aujourd'hui, bureau en AS-11b) ;
 *  · aucune personne n'est stockée sur la page : le journal (`page.sleep`, `page.wake`, qualité
 *    `page_admin`) dit qui ; aucun avis n'est envoyé dans ce lot.
 */
import type { PageOwnerKind } from "@antsia/social-domain/badges"
import { MEMBER_PAGE_OWNER_KINDS, PAGE_SIGNATORIES_MAX, PAGE_SLEEP_DAYS, PAGE_SLEEP_MS, pageSleepState, type PageTeamRole } from "@antsia/social-domain/pages"
import { type Infer, v } from "convex/values"

import { fail, failRule, notFound } from "../../lib/errors"
import { networkMutation, networkQuery } from "../../lib/functions"
import { enforceRateLimit } from "../../lib/rateLimit"
import { hasJudicialPageHold } from "../moderation/judicialHolds"
import { appendAudit } from "../platform/audit"
import { pageCardOf, requireManagedPage, sleepingPageTeamRole } from "./access"
import { applyPageStatus } from "./admin"
import { pageCardValidator, pageTeamRoleValidator } from "./validators"

/** Une page de l'équipe en sommeil : sa carte, MON rôle, l'échéance, l'état dérivé et si je peux la réactiver. */
const sleepingPageValidator = v.object({
  ...pageCardValidator.fields,
  teamRole: pageTeamRoleValidator,
  sleepEndsAt: v.number(),
  state: v.union(v.literal("asleep"), v.literal("expired")),
  canWake: v.boolean(),
})

type SleepingPage = Infer<typeof sleepingPageValidator>

/** Seule une page qu'un MEMBRE peut créer s'endort par son équipe ; une institution passe par la console. */
function isMemberCreatable(kind: PageOwnerKind): boolean {
  return (MEMBER_PAGE_OWNER_KINDS as readonly PageOwnerKind[]).includes(kind)
}

/**
 * Mettre MA page en sommeil — administrateur VIVANT d'une page native, active, de ce réseau, de
 * nature créable par un membre. Page inconnue, retirée, d'ailleurs ou reflétée : refus indistinct ;
 * éditeur, modérateur ou page d'institution : `pageRoleRequired`. La page se ferme comme un retrait
 * (directs fermés compris), puis l'échéance se pose à trente jours.
 */
export const putPageToSleep = networkMutation({
  minStatus: "declaree",
  args: { pageId: v.id("pages") },
  returns: v.object({ sleepEndsAt: v.number() }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "page.manage", ctx.person._id)
    const { page } = await requireManagedPage(ctx, { networkId: ctx.networkId, personId: ctx.person._id }, args.pageId, "admin")
    if (!isMemberCreatable(page.ownerKind)) return fail("pageRoleRequired")
    const now = Date.now()
    const sleepEndsAt = now + PAGE_SLEEP_MS
    // L'écrivain partagé ferme la page et ses directs, et efface toute échéance ; l'échéance se pose APRÈS.
    await applyPageStatus(ctx, page, "inactive", now)
    await ctx.db.patch(page._id, { sleepEndsAt })
    await appendAudit(ctx, {
      action: "page.sleep",
      capacity: "page_admin",
      actorPersonId: ctx.person._id,
      networkId: page.networkId,
      subject: { table: "pages", id: page._id },
      details: { sleepEndsAt },
      at: now,
    })
    return { sleepEndsAt }
  },
})

/**
 * Réactiver une page EN SOMMEIL — tout administrateur de la page, vivant hormis l'état de la page
 * (`sleepingPageTeamRole`), tant que l'échéance n'est pas passée. Page inconnue, active, retirée
 * par l'opérateur ou le juge, ou dont je ne suis pas de l'équipe : refus indistinct ; éditeur ou
 * modérateur : `pageRoleRequired` ; échue : `PAGE_SLEEP_EXPIRED` ; tenue par une mesure du juge :
 * `conflict`. Tout revient d'un coup : publications, offres, emplois, évènements, groupe.
 */
export const wakePage = networkMutation({
  minStatus: "declaree",
  args: { pageId: v.id("pages") },
  returns: v.object({ status: v.literal("active") }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "page.manage", ctx.person._id)
    const page = await ctx.db.get(args.pageId)
    if (!page || page.networkId !== ctx.networkId) return notFound()
    const now = Date.now()
    const state = pageSleepState(page, now)
    if (state === "none" || page.sleepEndsAt === undefined) return notFound()
    const role = await sleepingPageTeamRole(ctx, page, ctx.person._id, now)
    if (role === null) return notFound()
    if (role !== "admin") return fail("pageRoleRequired")
    if (state === "expired") return failRule("PAGE_SLEEP_EXPIRED", { days: PAGE_SLEEP_DAYS })
    if (await hasJudicialPageHold(ctx, page._id)) return fail("conflict")
    await applyPageStatus(ctx, page, "active", now)
    await appendAudit(ctx, {
      action: "page.wake",
      capacity: "page_admin",
      actorPersonId: ctx.person._id,
      networkId: page.networkId,
      subject: { table: "pages", id: page._id },
      details: { sleepEndsAt: page.sleepEndsAt },
      at: now,
    })
    return { status: "active" as const }
  },
})

/**
 * Les pages EN SOMMEIL dont je suis de l'équipe dans ce réseau (« Mes pages », section « En
 * sommeil »), l'échéance la plus proche d'abord — bornées comme `myPages`. Une invitation en
 * attente ne compte pas ; une page retirée par l'opérateur ou le juge n'y figure jamais.
 * `canWake` : je suis administrateur, l'échéance n'est pas passée et aucune mesure du juge ne la tient.
 */
export const mySleepingPages = networkQuery({
  args: {},
  returns: v.array(sleepingPageValidator),
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("pageSignatories")
      .withIndex("by_network_person", (q) => q.eq("networkId", ctx.networkId).eq("personId", ctx.person._id))
      .take(PAGE_SIGNATORIES_MAX)
    const now = Date.now()
    const out: SleepingPage[] = []
    for (const row of rows) {
      if (row.acceptedAt === undefined) continue
      const page = await ctx.db.get(row.pageId)
      if (!page || page.networkId !== ctx.networkId || page.sleepEndsAt === undefined) continue
      const state = pageSleepState(page, now)
      if (state === "none") continue
      const teamRole: PageTeamRole | null = await sleepingPageTeamRole(ctx, page, ctx.person._id, now)
      if (teamRole === null) continue
      const canWake = teamRole === "admin" && state === "asleep" && !(await hasJudicialPageHold(ctx, page._id))
      out.push({ ...(await pageCardOf(ctx, page)), teamRole, sleepEndsAt: page.sleepEndsAt, state, canWake })
    }
    return out.sort((a, b) => a.sleepEndsAt - b.sleepEndsAt)
  },
})
