// Dupliqué de socle/convex/modules/direct/invitees.ts @ ad2e7fdc2 — adaptations : contexte de brouillon followers gardé avant recherche et vérification (F3c) ; personnes et réseaux — constructeurs bornés (`networkQuery`/`networkMutation`, lecteur `directCaller`), tables `live*`, invité désigné par une PERSONNE (`personId`, liste `personIds` de `checkEligibility`, DTO compris) ; audience « organisation » retirée (V39) : une conférence réservée aux abonnés d'une page (`followers`) ne convie que le CERCLE de la page — abonnés et signataires vivants (`inviteePageRequirement`, `followsOrSignsPage`) — au lieu des agents rattachés (`validatedOrgIds`) ; « compte citoyen ou inactif » → personne effacée ou non membre active du réseau (`isInviteeAccountEligible(ctx, networkId, personId)`) ; fil source = fil de GROUPE du moteur (`groupThreads`, garde `requireLiveMembership` du réseau) — la portée « personnel » / « poste » n'existe plus, et son refus `THREAD_NOT_FOUND` devient le `notFound` indistinct de la garde ; relations et blocages lus par le graphe du moteur (`acceptedCounterpartIds` dans le réseau, `blockedCounterpartIds`) ; profils PUBLIÉS (`miniProfileCache` du moteur : nom `null` sans profil publié, liste triée sur le nom publié, à défaut l'identifiant) ; recherche repliée par `foldDiacritics` du domaine (même repli des accents) ; cloche par la porte unique (`notifyPerson`, `resolveNotifications` dans le réseau de la session, genre `live_invite`, sujet `liveSession`) ; refus à CODE : `LIVE_INVITEE_NOT_ELIGIBLE` (le refus indistinct d'un ajout), `LIVE_ENDED`, `LIVE_INVITEE_CHECK_TOO_MANY{max}`, bornes de la liste par `checked` (`LIVE_INVITEES_TOO_MANY`, `LIVE_SPEAKER_INVITEES_TOO_MANY`), `notFound` et `liveRoleRequired` des gardes ; débit `live.inviteesAdd` sur `add` (D14, ordre du moteur : adhésion → visibilité → débit → droit) ; coupure SFU par le sujet d'authentification de la personne (`persons.authUserId`) vers `livekitActions.applyDirectSfuState` ; DL-02 : un invité intervenant ne monte, dans un direct enregistré, qu'avec son accord (`promoteInviteeSpeaker`, jamais un refus) et monte quand il l'accorde (`promoteConsentingSpeakerInvitee`).
/**
 * Les INVITÉS NOMINATIFS d'une conférence (ADR-0150).
 * API publique : `api.modules.live.invitees.*`
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * TROIS AXES, ET CE FICHIER N'EN TIENT QU'UN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  1. QUI VOIT — l'audience de la session, immuable (`sessions.create`).
 *  2. QUI EST INVITÉ — ici : une ligne `liveInvitees` par personne,
 *     combinable avec toute audience. L'invité VOIT la conférence (il franchit
 *     `public`, `connections`, `invitees`), sauf `followers`, dont il doit
 *     être lui-même du cercle (abonné ou signataire vivant de la page) ; il ne
 *     franchit JAMAIS blocage, exclusion, effacement ni départ du réseau. Toute
 *     la règle vit dans `access.directSessionAccessDecision` — ce fichier
 *     écrit, il ne décide pas de la visibilité.
 *  3. QUI PARLE — `stageRole` par invité. Un invité `speaker` est PROMU au
 *     passage en live (ou à l'ajout pendant le live), par `promoteSpeakerRow`,
 *     APRÈS que ses gardes ont été rejouées : décision d'accès (blocage et
 *     exclusion compris) et éligibilité. `promoteSpeakerRow` ne contrôle rien —
 *     c'est pourquoi aucune ligne `liveSpeakers` n'est écrite à la création.
 *     Dans un direct ENREGISTRÉ, il faut en plus son accord (DL-02) : sans
 *     lui, il reste spectateur et monte quand il accepte l'enregistrement.
 *
 * ⚠️ GÉRER la liste = `changeAudienceOrReplay` (matrice de `permissions.ts`),
 * qui ne se délègue pas : c'est la PORTÉE de la conférence, pas sa police.
 *
 * ⚠️ Les refus d'éligibilité sont INDISTINCTS : dire lequel a manqué
 * (connexion, fil, blocage, adhésion, cercle de la page) apprendrait quelque
 * chose sur le lien entre deux personnes.
 */
import { foldDiacritics } from "@antsia/social-domain/searchText"
import { v } from "convex/values"

import { internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import type { MutationCtx } from "../../_generated/server"
import { checked, failRule } from "../../lib/errors"
import { networkMutation, networkQuery } from "../../lib/functions"
import { enforceRateLimit } from "../../lib/rateLimit"
import { acceptedCounterpartIds, blockedCounterpartIds } from "../graph/graph"
import { liveMembers, requireLiveMembership } from "../groups/access"
import { notifyPerson, resolveNotifications } from "../notifications/notify"
import { miniProfileCache } from "../people/miniProfile"
import { requireManagedPage } from "../pages/access"
import {
  assertVisibleDirectSession,
  banRow,
  directCaller,
  directPermissionsOf,
  directSessionAccessDecision,
  followsOrSignsPage,
  inviteePageRequirement,
  inviteeRecord,
  isEligibleDirectInvitee,
  isInviteeAccountEligible,
  liveInviteeRow,
  liveSpeakerRow,
  requireDirectPermission,
} from "./access"
import { assertInviteeCapacity, DIRECT_MAX_INVITEES } from "./domain"
import { hasRecordingConsent } from "./recordingConsent"
import { demoteSpeakerRow, promoteSpeakerRow } from "./speakers"
import { directInviteeStageRoleValidator } from "./validators"

type InviteeWriteCtx = Pick<MutationCtx, "db" | "scheduler">

/** Au plus cinquante candidats rendus — un sélecteur, pas un annuaire. */
const CANDIDATES_LIMIT = 50
/**
 * Personnes EXAMINÉES au plus par recherche, parmi celles qui CORRESPONDENT au
 * terme. La borne porte sur les lectures coûteuses (adhésion, cercle de la
 * page), pas sur celle du profil : taper un nom ou un @identifiant fait donc
 * avancer la fenêtre jusqu'au bout du graphe, lui-même borné
 * (`CONNECTIONS_SCAN` par sens, et les membres du fil). Sans terme, tout le
 * monde correspond : la borne reste celle d'avant.
 */
const CANDIDATES_SCAN = 250

/** Le refus d'un ajout impossible — UNE seule règle, exprès. */
function cannotInvite(): never {
  return failRule("LIVE_INVITEE_NOT_ELIGIBLE")
}

/**
 * Les invités VIVANTS d'une session — bornés par construction au plafond.
 * Une ligne de plus que le plafond est lue pour que l'ajout sache le dépasser.
 */
async function liveInviteeRows(ctx: Pick<MutationCtx, "db">, sessionId: Id<"liveSessions">): Promise<Doc<"liveInvitees">[]> {
  return await ctx.db
    .query("liveInvitees")
    .withIndex("by_session_revokedAt", (q) => q.eq("sessionId", sessionId).eq("revokedAt", undefined))
    .take(DIRECT_MAX_INVITEES + 1)
}

/**
 * OUVRIR la conférence à UN invité : le faire monter s'il intervient, puis le
 * sonner s'il ne l'a pas encore été.
 *
 * ⚠️ La décision d'accès est RELUE d'abord : un invité bloqué, exclu, sorti du
 * cercle de la page, du réseau, ou effacé n'est ni promu ni sonné — une cloche
 * ne révèle jamais une session qu'il ne peut pas voir.
 *
 * ⚠️ La promotion rejoue en plus l'ÉLIGIBILITÉ (connexion ou fil) : c'est un
 * micro qui s'ouvre, la règle d'ADR-0061 amendée s'applique à cet instant, pas
 * seulement le jour de l'invitation.
 *
 * `stageFullIsFatal` : au passage en live, une antenne déjà pleine (l'hôte a pu
 * promouvoir d'autres personnes avant) ne doit pas empêcher la conférence de
 * commencer — l'invité est alors sonné en spectateur. À l'ajout, le refus
 * remonte : l'hôte demande un intervenant, il doit apprendre qu'il n'y a plus
 * de place.
 */
export async function openConferenceToInvitee(
  ctx: InviteeWriteCtx,
  session: Doc<"liveSessions">,
  row: Doc<"liveInvitees">,
  opts: { stageFullIsFatal: boolean },
): Promise<void> {
  if ((await directSessionAccessDecision(ctx, row.personId, session)) !== "allowed") {
    return
  }

  if (row.stageRole === "speaker") {
    await promoteInviteeSpeaker(ctx, session, row, opts)
  }

  if (row.notifiedAt === undefined) {
    await notifyPerson(ctx, {
      networkId: session.networkId,
      recipientPersonId: row.personId,
      // L'invitation est celle de la CONFÉRENCE : son hôte la signe.
      actorPersonId: session.hostPersonId,
      kind: "live_invite",
      subject: { liveSession: session._id },
    })
    await ctx.db.patch(row._id, { notifiedAt: Date.now() })
  }
}

/**
 * FAIRE MONTER un invité intervenant — gardes rejouées (éligibilité, accord à
 * l'enregistrement), puis `promoteSpeakerRow`. Rend `true` s'il est monté.
 *
 * ⚠️ DL-02 — SANS ACCORD dans un direct enregistré, l'invité ne monte PAS, et ce
 * n'est jamais un refus : il reste spectateur, sonné comme les autres, et monte
 * de lui-même quand il accepte l'enregistrement (`antenna.acceptRecording`).
 * Faire échouer ici annulerait l'ajout de l'hôte, ou le passage en live entier,
 * faute d'un geste qui n'appartient qu'à l'invité.
 */
async function promoteInviteeSpeaker(
  ctx: InviteeWriteCtx,
  session: Doc<"liveSessions">,
  row: Doc<"liveInvitees">,
  opts: { stageFullIsFatal: boolean },
): Promise<boolean> {
  const followersPage = await inviteePageRequirement(ctx, session)
  const eligible =
    followersPage !== undefined &&
    (await isEligibleDirectInvitee(ctx, {
      networkId: session.networkId,
      hostPersonId: session.hostPersonId,
      targetPersonId: row.personId,
      sourceThreadId: session.sourceThreadId ?? null,
      followersPage,
    }))
  if (!eligible) return false
  if (!(await hasRecordingConsent(ctx, session, row.personId))) return false
  try {
    return await promoteSpeakerRow(ctx, session, row.personId)
  } catch (err) {
    // `promoteSpeakerRow` refuse AVANT toute écriture : rien n'est à défaire.
    if (opts.stageFullIsFatal) throw err
    return false
  }
}

/**
 * L'invité intervenant qui vient d'ACCEPTER l'enregistrement monte — s'il est
 * invité VIVANT au rôle `speaker`, dans un direct EN COURS, pas déjà à
 * l'antenne. Appelé par `antenna.acceptRecording`, après la garde de
 * visibilité de la personne. Une antenne pleine ne fait pas échouer l'accord :
 * il est gardé, la montée attend une place (l'hôte peut la relancer).
 */
export async function promoteConsentingSpeakerInvitee(ctx: InviteeWriteCtx, session: Doc<"liveSessions">, personId: Id<"persons">): Promise<boolean> {
  if (session.status !== "live") return false
  const row = await liveInviteeRow(ctx, session._id, personId)
  if (row === null || row.stageRole !== "speaker") return false
  if ((await liveSpeakerRow(ctx, session._id, personId)) !== null) return false
  return await promoteInviteeSpeaker(ctx, session, row, { stageFullIsFatal: false })
}

/**
 * Au PASSAGE EN LIVE (`sessions.goLive`) : chaque invité vivant est promu s'il
 * intervient et sonné (`live_invite`). Rend l'ensemble des invités vivants (en
 * identifiants de personnes), que la cloche d'audience saute ensuite — jamais
 * deux cloches pour une personne.
 *
 * ⚠️ `session` est la ligne AVANT le passage en live, et c'est voulu : aucun
 * invité ne peut encore être connecté (un jeton exige `live`, et ce passage est
 * sérialisé par la transaction), il n'y a donc aucune connexion SFU à faire
 * rejoindre — `promoteSpeakerRow` ne planifie rien sur une session `scheduled`.
 */
export async function openConferenceToInviteesAtGoLive(ctx: InviteeWriteCtx, session: Doc<"liveSessions">): Promise<ReadonlySet<string>> {
  const rows = await ctx.db
    .query("liveInvitees")
    .withIndex("by_session_revokedAt", (q) => q.eq("sessionId", session._id).eq("revokedAt", undefined))
    .take(DIRECT_MAX_INVITEES)
  const inviteeIds = new Set<string>()
  for (const row of rows) {
    inviteeIds.add(row.personId)
    await openConferenceToInvitee(ctx, session, row, {
      stageFullIsFatal: false,
    })
  }
  return inviteeIds
}

export type DirectInviteeCandidateDto = {
  personId: Id<"persons">
  /** `null` : profil non publié — l'écran dit un nom neutre. */
  displayName: string | null
  handle: string | null
  avatarUrl: string | null
  /** D'où vient le lien avec l'hôte — la connexion l'emporte sur le fil. */
  source: "connection" | "thread"
}

const candidateValidator = v.object({
  personId: v.id("persons"),
  displayName: v.union(v.string(), v.null()),
  handle: v.union(v.string(), v.null()),
  avatarUrl: v.union(v.string(), v.null()),
  source: v.union(v.literal("connection"), v.literal("thread")),
})

/** Minuscules, sans accents, sans `@` initial — la recherche d'un nom. */
function normalizeNeedle(raw: string): string {
  return foldDiacritics(raw.trim().replace(/^@/, ""))
}

/**
 * QUI puis-je convier ? Mes connexions acceptées dans ce réseau, et les
 * membres vivants du fil source dont je suis moi-même membre vivant.
 *
 * ⚠️ Au plus cinquante, sans moi, sans personne effacée ni non membre du
 * réseau, sans personne bloquée — et, pour une conférence réservée aux abonnés
 * d'une page, sans personne hors du cercle de la page ; pour une conférence
 * existante, sans ses exclus ni ses invités déjà vivants : le sélecteur ne
 * propose que ce que `add` acceptera.
 *
 * ⚠️ Un fil fourni doit être le MIEN, dans ce réseau, et vivant : sinon le
 * refus indistinct de la garde des fils (`notFound`).
 *
 * ⚠️ Avec `sessionId`, la recherche exige `changeAudienceOrReplay` — qui ne se
 * délègue pas : la liste des relations de quelqu'un est un fait social, elle
 * n'est servie qu'à la personne elle-même (même règle que la console
 * d'antenne). Le fil de la session est repris si aucun n'est fourni.
 */
export const searchCandidates = networkQuery({
  args: {
    sourceThreadId: v.optional(v.id("groupThreads")),
    search: v.optional(v.string()),
    sessionId: v.optional(v.id("liveSessions")),
    followersPageId: v.optional(v.id("pages")),
  },
  returns: v.object({ candidates: v.array(candidateValidator) }),
  handler: async (ctx, args): Promise<{ candidates: DirectInviteeCandidateDto[] }> => {
    const me = ctx.person._id
    let threadId: Id<"groupThreads"> | null = null
    let followersPage: Doc<"pages"> | null = null
    let sessionForFilter: Id<"liveSessions"> | null = null
    if (args.sessionId === undefined && args.followersPageId !== undefined) {
      followersPage = (await requireManagedPage(ctx, { networkId: ctx.networkId, personId: me }, args.followersPageId, "signatory")).page
    }

    if (args.sessionId !== undefined) {
      const session = await assertVisibleDirectSession(ctx, directCaller(ctx), args.sessionId)
      await requireDirectPermission(ctx, session, me, "changeAudienceOrReplay")
      const requirement = await inviteePageRequirement(ctx, session)
      // Une conférence réservée aux abonnés d'une page retirée ne convie plus
      // personne : rien à proposer.
      if (requirement === undefined) return { candidates: [] }
      followersPage = requirement
      threadId = session.sourceThreadId ?? null
      sessionForFilter = session._id
    }

    if (args.sourceThreadId !== undefined) {
      // Le fil fourni doit être le MIEN, dans ce réseau : sinon, refus indistinct du fil.
      await requireLiveMembership(ctx, ctx.networkId, args.sourceThreadId, me)
      threadId = args.sourceThreadId
    } else if (threadId !== null) {
      // Le fil de la session : j'ai pu le quitter depuis (ou il est en
      // suppression) — il ne propose alors plus personne, sans refuser la
      // recherche.
      try {
        await requireLiveMembership(ctx, ctx.networkId, threadId, me)
      } catch {
        threadId = null
      }
    }

    const [connections, blocked, threadRows] = await Promise.all([
      acceptedCounterpartIds(ctx, ctx.networkId, me),
      blockedCounterpartIds(ctx, me),
      threadId === null ? Promise.resolve([]) : liveMembers(ctx, threadId),
    ])

    // Le fil d'abord (le contexte d'où l'on vient), puis les connexions.
    const ordered: Id<"persons">[] = []
    const seen = new Set<string>([me])
    for (const member of threadRows) {
      if (seen.has(member.personId)) continue
      seen.add(member.personId)
      ordered.push(member.personId)
    }
    for (const key of connections.ids) {
      if (seen.has(key)) continue
      seen.add(key)
      // Les ensembles du graphe portent des identifiants en chaînes ; la
      // valeur EST un identifiant de `persons`, l'assertion ne fait que le redire.
      ordered.push(key as Id<"persons">)
    }

    const needle = normalizeNeedle(args.search ?? "")
    const profileOf = miniProfileCache(ctx)
    const candidates: DirectInviteeCandidateDto[] = []
    let examined = 0
    for (const personId of ordered) {
      if (candidates.length >= CANDIDATES_LIMIT) break
      if (blocked.ids.has(personId)) continue
      if (sessionForFilter !== null) {
        // L'exclu (que `add` refuse toujours) et l'invité déjà vivant ne se
        // reproposent pas.
        if ((await banRow(ctx, sessionForFilter, personId)) !== null) continue
        if ((await liveInviteeRow(ctx, sessionForFilter, personId)) !== null) {
          continue
        }
      }

      const profile = await profileOf(personId)
      if (needle.length > 0 && !normalizeNeedle(profile.displayName ?? "").includes(needle) && !normalizeNeedle(profile.handle ?? "").includes(needle)) {
        continue
      }
      // Le budget borne les lectures d'ADHÉSION et de CERCLE, pas celle du
      // profil : une recherche ne s'épuise pas sur qui ne correspond pas.
      if (examined >= CANDIDATES_SCAN) break
      examined += 1
      if (!(await isInviteeAccountEligible(ctx, ctx.networkId, personId))) continue
      if (followersPage !== null && !(await followsOrSignsPage(ctx, followersPage, personId))) {
        continue
      }
      candidates.push({
        personId,
        displayName: profile.displayName,
        handle: profile.handle,
        avatarUrl: profile.avatarUrl,
        source: connections.ids.has(personId) ? "connection" : "thread",
      })
    }
    return { candidates }
  },
})

export type DirectEligibleInviteeDto = {
  personId: Id<"persons">
  displayName: string | null
  handle: string | null
  avatarUrl: string | null
}

const eligibleInviteeValidator = v.object({
  personId: v.id("persons"),
  displayName: v.union(v.string(), v.null()),
  handle: v.union(v.string(), v.null()),
  avatarUrl: v.union(v.string(), v.null()),
})

/**
 * PARMI ces personnes, lesquelles puis-je convier à MA conférence ? Sert au
 * pré-remplissage depuis un appel ou un fil : la liste part en bloc, et un
 * seul invité inéligible ferait refuser toute la création sans dire lequel.
 *
 * ⚠️ Rend les SEULS éligibles, avec leur profil publié — rien sur les autres,
 * ni raison ni profil. Ce n'est pas un oracle : l'éligibilité se juge avec
 * MOI (connexion dans ce réseau, ou fil de groupe dont je suis membre vivant),
 * et le sélecteur `searchCandidates` apprend déjà la même chose, personne par
 * personne. Le refus de `sessions.create` reste indistinct.
 */
export const checkEligibility = networkQuery({
  args: {
    personIds: v.array(v.id("persons")),
    sourceThreadId: v.optional(v.id("groupThreads")),
    followersPageId: v.optional(v.id("pages")),
  },
  returns: v.object({ eligible: v.array(eligibleInviteeValidator) }),
  handler: async (ctx, args): Promise<{ eligible: DirectEligibleInviteeDto[] }> => {
    const me = ctx.person._id
    const followersPage = args.followersPageId === undefined ? null : (await requireManagedPage(ctx, { networkId: ctx.networkId, personId: me }, args.followersPageId, "signatory")).page
    let sourceThreadId: Id<"groupThreads"> | null = null
    if (args.sourceThreadId !== undefined) {
      // Le fil fourni doit être le MIEN, dans ce réseau : même refus que le fil absent.
      await requireLiveMembership(ctx, ctx.networkId, args.sourceThreadId, me)
      sourceThreadId = args.sourceThreadId
    }

    const seen = new Set<string>()
    const personIds: Id<"persons">[] = []
    for (const personId of args.personIds) {
      if (personId === me || seen.has(personId)) continue
      seen.add(personId)
      personIds.push(personId)
    }
    if (personIds.length > DIRECT_MAX_INVITEES) {
      return failRule("LIVE_INVITEE_CHECK_TOO_MANY", { max: DIRECT_MAX_INVITEES })
    }

    const profileOf = miniProfileCache(ctx)
    const eligible: DirectEligibleInviteeDto[] = []
    for (const personId of personIds) {
      if (
        !(await isEligibleDirectInvitee(ctx, {
          networkId: ctx.networkId,
          hostPersonId: me,
          targetPersonId: personId,
          sourceThreadId,
          followersPage,
        }))
      ) {
        continue
      }
      const profile = await profileOf(personId)
      eligible.push({
        personId,
        displayName: profile.displayName,
        handle: profile.handle,
        avatarUrl: profile.avatarUrl,
      })
    }
    return { eligible }
  },
})

export type DirectInviteeDto = {
  personId: Id<"persons">
  displayName: string | null
  handle: string | null
  avatarUrl: string | null
  stageRole: "viewer" | "speaker"
  notifiedAt: number | null
  /**
   * Est-il À L'ANTENNE en ce moment ? Un invité `speaker` peut ne pas l'être
   * (antenne pleine au démarrage, micro rendu, rétrogradé par la console) :
   * l'écran ne doit pas affirmer « Intervenant » sans le dire.
   */
  onStage: boolean
}

const inviteeDtoValidator = v.object({
  personId: v.id("persons"),
  displayName: v.union(v.string(), v.null()),
  handle: v.union(v.string(), v.null()),
  avatarUrl: v.union(v.string(), v.null()),
  stageRole: directInviteeStageRoleValidator,
  notifiedAt: v.union(v.number(), v.null()),
  onStage: v.boolean(),
})

/** La clé de tri d'une ligne : le nom publié, à défaut l'identifiant. */
function sortName(dto: Pick<DirectInviteeDto, "displayName" | "handle">): string {
  return dto.displayName ?? dto.handle ?? ""
}

/**
 * La liste des invités d'une conférence.
 *
 * ⚠️ Qui peut la GÉRER (`changeAudienceOrReplay`) la lit entière ; tout autre
 * lecteur reçoit `canManage: false` et, au plus, SA propre ligne — savoir qui
 * d'autre est convié ne regarde pas la salle.
 *
 * Une personne qui ne voit plus la conférence (bloquée, exclue, sortie du
 * cercle de la page ou du réseau) sort silencieusement de la liste : sa ligne
 * survit en base, mais la console ne prétend pas qu'elle est encore conviée.
 */
export const listForSession = networkQuery({
  args: { sessionId: v.id("liveSessions") },
  returns: v.object({
    canManage: v.boolean(),
    invitees: v.array(inviteeDtoValidator),
  }),
  handler: async (ctx, args): Promise<{ canManage: boolean; invitees: DirectInviteeDto[] }> => {
    const me = ctx.person._id
    const session = await assertVisibleDirectSession(ctx, directCaller(ctx), args.sessionId)
    const permissions = await directPermissionsOf(ctx, session, me)
    const canManage = permissions.changeAudienceOrReplay
    const profileOf = miniProfileCache(ctx)

    const toDto = async (row: Doc<"liveInvitees">): Promise<DirectInviteeDto> => {
      const profile = await profileOf(row.personId)
      return {
        personId: row.personId,
        displayName: profile.displayName,
        handle: profile.handle,
        avatarUrl: profile.avatarUrl,
        stageRole: row.stageRole,
        notifiedAt: row.notifiedAt ?? null,
        onStage: session.status === "live" && (await liveSpeakerRow(ctx, session._id, row.personId)) !== null,
      }
    }

    if (!canManage) {
      const mine = await liveInviteeRow(ctx, session._id, me)
      return { canManage, invitees: mine === null ? [] : [await toDto(mine)] }
    }

    const rows = await ctx.db
      .query("liveInvitees")
      .withIndex("by_session_revokedAt", (q) => q.eq("sessionId", session._id).eq("revokedAt", undefined))
      .take(DIRECT_MAX_INVITEES)
    const invitees: DirectInviteeDto[] = []
    for (const row of rows) {
      if ((await directSessionAccessDecision(ctx, row.personId, session)) !== "allowed") {
        continue
      }
      invitees.push(await toDto(row))
    }
    invitees.sort((a, b) => sortName(a).localeCompare(sortName(b), "fr"))
    return { canManage, invitees }
  },
})

/**
 * INVITER une personne, ou changer son rôle. Idempotent.
 *
 * Ré-inviter une personne retirée ROUVRE sa ligne (et la re-sonne pendant le
 * live) ; changer le rôle d'un invité vivant le met à jour. Pendant le live, un
 * passage à `speaker` promeut aussitôt (gardes rejouées), un passage à
 * `viewer` fait redescendre de l'antenne.
 *
 * ⚠️ Redemander `speaker` pour un invité `speaker` qui n'est PAS à l'antenne
 * (antenne pleine au démarrage, micro rendu, rétrogradé) RELANCE la promotion —
 * sans re-sonner personne. Sans cela, l'écran afficherait « Intervenant » sans
 * aucun moyen de le rendre vrai.
 */
export const add = networkMutation({
  args: {
    sessionId: v.id("liveSessions"),
    personId: v.id("persons"),
    stageRole: directInviteeStageRoleValidator,
  },
  returns: v.object({ added: v.boolean(), updated: v.boolean() }),
  handler: async (ctx, args): Promise<{ added: boolean; updated: boolean }> => {
    const me = ctx.person._id
    const session = await assertVisibleDirectSession(ctx, directCaller(ctx), args.sessionId)
    // DÉBIT (D14) — après la visibilité, avant le droit : un ajout fait sonner
    // une cloche pendant le live.
    await enforceRateLimit(ctx, "live.inviteesAdd", me)
    await requireDirectPermission(ctx, session, me, "changeAudienceOrReplay")
    if (session.status === "ended") {
      return failRule("LIVE_ENDED")
    }

    const followersPage = await inviteePageRequirement(ctx, session)
    if (followersPage === undefined) cannotInvite()
    if (
      !(await isEligibleDirectInvitee(ctx, {
        networkId: session.networkId,
        hostPersonId: session.hostPersonId,
        targetPersonId: args.personId,
        sourceThreadId: session.sourceThreadId ?? null,
        followersPage,
      }))
    ) {
      cannotInvite()
    }
    if ((await banRow(ctx, session._id, args.personId)) !== null) cannotInvite()

    const existing = await inviteeRecord(ctx, session._id, args.personId)
    const wasLive = existing !== null && existing.revokedAt === undefined
    if (wasLive && existing.stageRole === args.stageRole) {
      const retryPromotion = session.status === "live" && args.stageRole === "speaker" && (await liveSpeakerRow(ctx, session._id, args.personId)) === null
      if (!retryPromotion) return { added: false, updated: false }
    }

    // Les bornes se jugent sur la liste APRÈS l'écriture envisagée.
    const others = (await liveInviteeRows(ctx, session._id)).filter((row) => row.personId !== args.personId)
    checked(() =>
      assertInviteeCapacity({
        invitees: others.length + 1,
        speakerInvitees: others.filter((row) => row.stageRole === "speaker").length + (args.stageRole === "speaker" ? 1 : 0),
      }),
    )

    const now = Date.now()
    let rowId: Id<"liveInvitees">
    if (existing !== null) {
      rowId = existing._id
      await ctx.db.patch(existing._id, {
        stageRole: args.stageRole,
        invitedByPersonId: me,
        // Rouvrir une ligne retirée repart de zéro : nouvelle date, nouvelle
        // cloche. Changer le rôle d'une ligne vivante ne re-sonne personne.
        ...(wasLive ? {} : { createdAt: now, revokedAt: undefined, notifiedAt: undefined }),
      })
    } else {
      rowId = await ctx.db.insert("liveInvitees", {
        networkId: session.networkId,
        sessionId: session._id,
        personId: args.personId,
        invitedByPersonId: me,
        stageRole: args.stageRole,
        createdAt: now,
      })
    }

    if (session.status === "live") {
      if (wasLive && existing.stageRole === "speaker" && args.stageRole === "viewer" && (await liveSpeakerRow(ctx, session._id, args.personId)) !== null) {
        await demoteSpeakerRow(ctx, session, args.personId)
      }
      const row = await ctx.db.get(rowId)
      if (row !== null) {
        await openConferenceToInvitee(ctx, session, row, {
          stageFullIsFatal: true,
        })
      }
    }

    return { added: !wasLive, updated: wasLive }
  },
})

/**
 * RETIRER une invitation. Idempotent.
 *
 * ⚠️ Pendant le live, l'invité qui ne voit plus la conférence sans son
 * invitation est COUPÉ (patron d'expulsion SFU de `moderation.ban`) — et
 * descend de l'antenne s'il y était. S'il la voit par ailleurs (connexion d'une
 * conférence `connections`, conférence publique), il reste dans la salle ; mais
 * s'il intervenait AU TITRE de l'invitation, il redescend en spectateur : le
 * micro venait de la ligne qu'on retire.
 *
 * Sa cloche `live_invite` se résout `cancelled` dans la même transaction
 * (CH-094), quel que soit le statut de la conférence : c'est le seul endroit
 * qui la solde pour un invité retiré — la fin du direct
 * (`invitationSettle.expireSessionInvitations`) ne relit que les invités
 * VIVANTS.
 */
export const revoke = networkMutation({
  writeBucket: "live.manage",
  args: {
    sessionId: v.id("liveSessions"),
    personId: v.id("persons"),
  },
  returns: v.object({ revoked: v.boolean() }),
  handler: async (ctx, args): Promise<{ revoked: boolean }> => {
    const me = ctx.person._id
    const session = await assertVisibleDirectSession(ctx, directCaller(ctx), args.sessionId)
    await requireDirectPermission(ctx, session, me, "changeAudienceOrReplay")

    const existing = await inviteeRecord(ctx, session._id, args.personId)
    if (existing === null || existing.revokedAt !== undefined) {
      return { revoked: false }
    }
    const now = Date.now()
    await ctx.db.patch(existing._id, { revokedAt: now })
    await resolveNotifications(ctx, {
      networkId: session.networkId,
      recipientPersonId: args.personId,
      kind: "live_invite",
      subject: { liveSession: session._id },
      resolution: "cancelled",
      at: now,
    })

    if (session.status === "ended") return { revoked: true }

    // La décision relit la ligne qu'on vient de retirer (même transaction).
    const stillAllowed = (await directSessionAccessDecision(ctx, args.personId, session)) === "allowed"
    const speaker = await liveSpeakerRow(ctx, session._id, args.personId)

    if (!stillAllowed) {
      if (speaker !== null) {
        // Même écriture durable que l'exclusion : l'époque avance, la place
        // d'antenne se libère, la mise en avant ne survit pas à sa personne.
        await ctx.db.patch(speaker._id, {
          grantEpoch: speaker.grantEpoch + 1,
          sfuAppliedAt: undefined,
          removedAt: now,
        })
        if (session.spotlightPersonId === args.personId) {
          await ctx.db.patch(session._id, {
            spotlightPersonId: undefined,
            updatedAt: now,
          })
        }
      }
      if (session.status === "live") {
        const target = await ctx.db.get(args.personId)
        if (target !== null) {
          await ctx.scheduler.runAfter(0, internal.modules.live.livekitActions.applyDirectSfuState, {
            roomName: session.roomName,
            subject: target.authUserId,
            mode: "kick" as const,
          })
        }
      }
    } else if (speaker !== null && existing.stageRole === "speaker") {
      await demoteSpeakerRow(ctx, session, args.personId)
    }
    return { revoked: true }
  },
})
