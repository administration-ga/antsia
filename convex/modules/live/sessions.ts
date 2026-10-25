// Dupliqué de socle/convex/modules/direct/sessions.ts @ ad2e7fdc2 — adaptations : PERSONNES ET RÉSEAUX — constructeurs bornés `networkMutation`/`networkQuery` (adhésion par le constructeur) au lieu d'`authMutation`/`authQuery`, `networkId` posé sur la session et sur ses lignes d'hôte et d'invités, toute session lue DANS le réseau de la fonction (inconnue ou d'un autre réseau : `notFound` indistinct ; garde `assertVisibleDirectSession(ctx, directCaller(ctx), …)`), personnes (`Id<"persons">`, `hostPersonId`, `targetPersonId`, `spotlight.personId`, `speakers[].personId`), noms du profil PUBLIÉ (`miniProfileCache` du moteur : nom neutre `null` au lieu d'un nom de repli) ; V36/V37 — l'audience `organisation` devient `followers` : page du moteur EXIGÉE (`LIVE_FOLLOWERS_REQUIRES_PAGE`), parler au nom d'une page exige d'en être SIGNATAIRE VIVANT (`pages/access.requireManagedPage`, refus `notFound` ou `pageRoleRequired`) au lieu de `getMembership` + `assertCanDoTask("communication.publish")`, un invité ne franchit jamais ce cercle (`followersPage`), la découverte précharge les PAGES SUIVIES d'ici (`followedPageIds`) au lieu de `validatedOrgIds` ; DÉCOUVERTE préfixée par le réseau (fenêtres et curseurs relus dans le réseau de la fonction), liens du lecteur préchargés par une aide commune (`discoveryFacts`) et chacun OMIS quand l'ensemble borné est tronqué (la décision relit alors la source par candidat, au lieu d'un ensemble tronqué en silence) ; fil source = fil de GROUPE du moteur (`groups/access.requireLiveMembership` dans le réseau ; la portée « personnel »/« poste » n'existe plus) ; D14 — débit `live.create` sur `create`, APRÈS le rejeu idempotent ; D28 — aucun compteur sur la session : `get` et les vignettes lisent `liveSessionCounters` (`access.sessionCountersOf`), la fin recompose par l'écrivain unique (`reap.recomputeAggregates`) ; CLOCHE — `notifyPersonal` en boucle bornée (200 par source) remplacé par la diffusion par lots chaînés (`notifications/fanout`, source `liveSessionAudience`) : démarrage `live_started`, publication de l'enregistrement `live_replay_published`, l'audience rejugée par destinataire au moment de sonner (abonnés et signataires vivants de la page pour `followers`, relations puis abonnés de l'hôte, invités vivants à la publication), les invités vivants sautés au démarrage (ils ont `live_invite`) ; ANNONCE — identité de page transmise à writePost pour public/followers (F3c) ; `writePersonalPost` → `posts/postWrite.writePost` (session portée par `liveSessionId`, visibilité `network` : la session ne se lit que dans son réseau), corps jugé par `assertPersonalPostBody` du domaine ; ERREURS — phrases → règles `LIVE_*` (`failRule`, `checked`) et `directNotFound()`, `rethrowDirectDomain` retiré ; DÉLIVRANCE — URLs de rediffusion et de sous-titres par la garde des fichiers (`servableUrl`, D05) ; références du moteur (`internal.modules.live.livekitActions.*`, `internal.modules.live.invitationSettle.*`) et index du moteur (`by_network_host_status`, `by_network_host_idempotencyKey`, `by_network_status_startedAt`, `by_network_status_replayStatus_endedAt`) ; décision sur l'enregistrement par `directReplayDecisionValidator` (mêmes littéraux) ; commentaires rapportés au moteur ; « Mes conférences » (`listMinePage`) lit ses trois statuts par le flux de convex-helpers dans UNE exécution (`mineStatusPage`, `mineActivityPage`), jamais par sous-requête : correctif du socle du 25/10/2026 (PR 778) repris.
/**
 * Le CYCLE DE VIE d'un direct — créer, démarrer, terminer, lire.
 * API publique : `api.modules.live.sessions.*`
 *
 * Un direct appartient à la PERSONNE qui tient le micro, dans UN réseau : il
 * peut parler au nom d'une PAGE dont elle est signataire vivante, l'audience se
 * juge avec les liens du réseau, comme une publication.
 *
 * TROIS règles portent ce fichier :
 *
 * 1. **L'annonce est une publication NORMALE.** Elle passe par `writePost` (le
 *    geste commun des publications) avec l'audience EXACTE de la session — et
 *    ni l'une ni l'autre n'étant modifiable, l'invariant tient sans
 *    synchronisation.
 * 2. **La cloche sonne au DÉMARRAGE, jamais à la programmation.** Créer une
 *    session n'émet rien ; `goLive` diffuse vers l'audience (relations, et
 *    abonnés si public ; cercle de la page pour `followers`) — un direct
 *    annoncé qu'on ne peut pas encore regarder n'apprend rien.
 * 3. **Le statut décide, l'horloge récolte.** `end` est le geste de l'hôte ;
 *    la récolte (`reap.reapStaleDirects`) ferme ce que l'hôte n'a pas fermé.
 */
import { assertPersonalPostBody } from "@antsia/social-domain/content"
import { stream } from "convex-helpers/server/stream"
import { v } from "convex/values"

import { internal } from "../../_generated/api"
import { contentState, moderateContentWrite } from "../moderation/policy"
import type { Doc, Id } from "../../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../../_generated/server"
import { checked, fail, failRule } from "../../lib/errors"
import { networkMutation, networkQuery } from "../../lib/functions"
import { enforceRateLimit } from "../../lib/rateLimit"
import schema from "../../schema"
import { servableUrl } from "../files/storageGuard"
import { acceptedCounterpartIds, blockedCounterpartIds } from "../graph/graph"
import { requireLiveMembership } from "../groups/access"
import { enqueueFanout, liveSessionAudiencePhases } from "../notifications/fanout"
import { pageCardOf, readablePageOrNull, requireManagedPage } from "../pages/access"
import { followedPageIds } from "../pages/follows"
import { miniProfileCache } from "../people/miniProfile"
import { writePost } from "../posts/postWrite"
import {
  assertVisibleDirectSession,
  directCaller,
  directNotFound,
  directPermissionsOf,
  directReplayAccessDecision,
  directSessionAccessDecision,
  isEligibleDirectInvitee,
  liveSpeakerRow,
  readerInviteeSessionIds,
  readerIsLiveInvitee,
  requireDirectPermission,
  sessionCountersOf,
  type DirectAccessFacts,
  type DirectReader,
} from "./access"
import {
  assertDirectTitle,
  clampMaxViewers,
  directMaxDurationAt,
  effectiveReplayPublication,
  effectiveReplayVisibility,
  isInviteeAudience,
  isReplayVisibilityAllowed,
  planDirectInvitees,
  type DirectAudience,
  type DirectEndReason,
  type DirectReplayPublication,
} from "./domain"
import { buildDirectRoomName, DIRECT_MAX_SPEAKERS } from "./grants"
import { openConferenceToInviteesAtGoLive } from "./invitees"
import type { DirectPermissions } from "./permissions"
import { recomputeAggregates } from "./reap"
import { purgeReplayBlobs } from "./replay"
// Module PUR partagé avec l'action Egress, la mutation de replay et le webhook.
import { DIRECT_REPLAY_CAPTIONS_MAX_BYTES, directReplayEgressView, type DirectReplayEgressView } from "./replayComposition"
import { isDirectReplayRetained } from "./retention"
import {
  directAudienceValidator,
  directChatModeValidator,
  directInviteeInputValidator,
  directReplayDecisionValidator,
  directReplayPublicationValidator,
  directReplayStatusValidator,
  directStageFormatValidator,
  directStageLayoutValidator,
} from "./validators"

/**
 * Créer un direct — statut `scheduled`, AUCUNE cloche.
 *
 * L'annonce éventuelle est publiée dans la MÊME transaction, par le même
 * helper que `posts.publish` : mêmes tags, même texte indexé, mêmes
 * citations. Son audience est celle de la session, à l'identique.
 */
export const create = networkMutation({
  args: {
    title: v.string(),
    audience: directAudienceValidator,
    /**
     * Tenir la conférence AU NOM d'une page du réseau.
     *
     * Le droit se re-vérifie ici : il faut être SIGNATAIRE VIVANT de la page —
     * le même droit que pour publier en son nom. Parler au nom d'une page et
     * écrire en son nom sont le même acte, et se gardent donc pareil.
     *
     * Absent : conférence PERSONNELLE, comportement inchangé.
     */
    pageId: v.optional(v.id("pages")),
    chatMode: directChatModeValidator,
    stageFormat: v.optional(directStageFormatValidator),
    /**
     * La grille de HUIT PLACES, si l'hôte la demande explicitement (D-04).
     *
     * Absent : `adaptive` — la scène du lecteur se mesure sur son conteneur.
     * ⚠️ Ce champ ne dit RIEN de la source émise (`stageFormat`) : les huit
     * places sont une composition, pas un ratio.
     */
    stageLayout: v.optional(directStageLayoutValidator),
    maxViewers: v.optional(v.number()),
    /**
     * Enregistrer la conférence (Egress démarré au passage en live).
     *
     * ⚠️ ADR-0158 — VRAI PAR DÉFAUT : une conférence est enregistrée d'office,
     * et c'est à la FIN que l'hôte décide du sort de la copie (publier, garder
     * pour lui, supprimer). Sans capture, ce choix n'existerait pas. `false`
     * reste un opt-out EXPLICITE pour un appelant qui ne veut aucune copie.
     */
    replay: v.optional(v.boolean()),
    /** Publier une annonce sur le fil — audience IDENTIQUE à la session. */
    announce: v.optional(v.boolean()),
    /** Corps de l'annonce — à défaut, le titre du direct. */
    announceText: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
    /**
     * Les INVITÉS NOMINATIFS (ADR-0150) — combinables avec toute audience.
     * Chacun VOIT la conférence (sauf à ne pas être du cercle de la page de
     * l'audience `followers`) ; un `speaker` sera promu au passage en live,
     * jamais ici. Au plus 200, dont 7 intervenants.
     */
    invitees: v.optional(v.array(directInviteeInputValidator)),
    /**
     * Le FIL DE GROUPE d'où la conférence est lancée : ses co-membres vivants
     * deviennent conviables sans être des relations de l'hôte. L'hôte doit en
     * être membre vivant — sinon, refus du fil.
     */
    sourceThreadId: v.optional(v.id("groupThreads")),
  },
  handler: async (ctx, args): Promise<{ sessionId: Id<"liveSessions">; created: boolean }> => {
    const me = ctx.person._id

    // Rejeu AVANT toute validation : la session existante est la réponse.
    if (args.idempotencyKey !== undefined) {
      const idempotencyKey = args.idempotencyKey
      const replay = await ctx.db
        .query("liveSessions")
        .withIndex("by_network_host_idempotencyKey", (q) => q.eq("networkId", ctx.networkId).eq("hostPersonId", me).eq("idempotencyKey", idempotencyKey))
        .unique()
      if (replay) return { sessionId: replay._id, created: false }
    }

    // D14 — un seau par type d'écriture ; un rejeu ne le consomme pas.
    await enforceRateLimit(ctx, "live.create", me)

    /**
     * ⚠️ L'INVARIANT DE FORME avant tout le reste : `followers` EXIGE une page.
     * Sans page, « ses abonnés » ne désignent personne et la conférence serait
     * invisible de tous — une salle qui se croit ouverte.
     */
    if (args.audience === "followers" && args.pageId === undefined) {
      return failRule("LIVE_FOLLOWERS_REQUIRES_PAGE")
    }

    /**
     * ⚠️ « Invités seulement » ne s'ANNONCE pas (ADR-0150, E). L'annonce est une
     * publication dont l'audience est celle de la session — et aucune audience
     * de publication ne dit « ces personnes-là ». La carte du fil exposerait en
     * plus le titre sans rejouer la garde de session.
     */
    if (args.announce === true && isInviteeAudience(args.audience)) {
      return failRule("LIVE_INVITEES_NOT_ANNOUNCED")
    }

    /**
     * LE DROIT de parler au nom d'une page — le même que pour publier en son
     * nom : signataire VIVANT (habilitation acceptée, page active du réseau,
     * adhésion active). Page inconnue, retirée ou d'ailleurs : refus indistinct.
     */
    let page: Doc<"pages"> | null = null
    if (args.pageId !== undefined) {
      page = (await requireManagedPage(ctx, { networkId: ctx.networkId, personId: me }, args.pageId, "signatory")).page
    }

    const title = checked(() => assertDirectTitle(args.title))

    /**
     * LE FIL SOURCE se prouve d'abord pour l'HÔTE : on ne tire pas des
     * co-membres d'une conversation dont on n'est pas (refus du fil).
     */
    const sourceThreadId = args.sourceThreadId ?? null
    if (sourceThreadId !== null) {
      await requireLiveMembership(ctx, ctx.networkId, sourceThreadId, me)
    }

    /**
     * LES INVITÉS — bornes d'abord (liste normalisée), puis l'éligibilité de
     * CHACUN, relue en base. Le refus est INDISTINCT et porte sur la liste :
     * nommer la personne refusée dirait pourquoi.
     */
    const invitees = checked(() => planDirectInvitees(args.invitees ?? [], me))
    for (const invitee of invitees) {
      if (
        !(await isEligibleDirectInvitee(ctx, {
          networkId: ctx.networkId,
          hostPersonId: me,
          targetPersonId: invitee.personId,
          sourceThreadId,
          // Un invité ne franchit JAMAIS l'audience `followers`.
          followersPage: args.audience === "followers" ? page : null,
        }))
      ) {
        return failRule("LIVE_INVITEE_LIST_NOT_ELIGIBLE")
      }
    }

    const now = Date.now()
    // Préfixe dédié, reconnaissable dans LiveKit. L'entropie vient d'ici
    // (module pur = pas d'aléatoire).
    const roomName = buildDirectRoomName(now, crypto.randomUUID().replace(/-/g, "").substring(0, 8))

    const sessionId = await ctx.db.insert("liveSessions", {
      networkId: ctx.networkId,
      hostPersonId: me,
      title,
      roomName,
      status: "scheduled",
      audience: args.audience,
      ...(args.pageId === undefined ? {} : { pageId: args.pageId }),
      ...(sourceThreadId === null ? {} : { sourceThreadId }),
      chatMode: args.chatMode,
      stageFormat: args.stageFormat ?? "computer",
      stageLayout: args.stageLayout ?? "adaptive",
      maxViewers: clampMaxViewers(args.maxViewers),
      replayRequested: args.replay ?? true,
      ...(args.idempotencyKey === undefined ? {} : { idempotencyKey: args.idempotencyKey }),
      createdAt: now,
      updatedAt: now,
    })

    await moderateContentWrite(ctx, { networkId: ctx.networkId, ownerPersonId: me, kind: "live", id: sessionId, text: title })

    // L'hôte est un INTERVENANT dès la naissance — sa ligne durable existe
    // avant tout jeton, et compte dans le plafond de 8.
    await ctx.db.insert("liveSpeakers", {
      networkId: ctx.networkId,
      sessionId,
      personId: me,
      role: "host",
      grantEpoch: 1,
      addedAt: now,
    })

    // ⚠️ AUCUNE ligne `liveSpeakers` pour un invité intervenant : la promotion
    // attend le passage en live, où ses gardes sont rejouées. Aucune cloche non
    // plus.
    for (const invitee of invitees) {
      await ctx.db.insert("liveInvitees", {
        networkId: ctx.networkId,
        sessionId,
        personId: invitee.personId,
        invitedByPersonId: me,
        stageRole: invitee.stageRole,
        createdAt: now,
      })
    }

    if (args.announce === true && args.audience !== "invitees") {
      const body = checked(() => assertPersonalPostBody(args.announceText?.trim() || title))
      const { postId } = await writePost(ctx, {
        network: ctx.network,
        authorPersonId: me,
        body,
        // L'INVARIANT : l'audience de l'annonce EST celle de la session.
        audience: args.audience,
        // La session ne se lit que DANS son réseau : son annonce n'en sort pas.
        visibility: "network",
        liveSessionId: sessionId,
        ...(args.pageId === undefined ? {} : { pageId: args.pageId }),
      })
      await ctx.db.patch(sessionId, { announcePostId: postId, updatedAt: now })
    }

    return { sessionId, created: true }
  },
})

/**
 * Passer EN DIRECT. Hôte seul, idempotent.
 *
 * C'est ICI que tout part : l'Egress de replay (s'il est demandé) et la
 * cloche `live_started` — jamais à la création.
 */
export const goLive = networkMutation({
  writeBucket: "live.manage",
  args: { sessionId: v.id("liveSessions") },
  handler: async (ctx, args): Promise<{ started: boolean }> => {
    const session = await ctx.db.get(args.sessionId)
    // Refus indistinct : le direct d'autrui, celui d'un autre réseau et la
    // référence inventée donnent la même réponse.
    if (!session || session.networkId !== ctx.networkId || session.hostPersonId !== ctx.person._id) return directNotFound()
    // Une page retirée, ou une signature perdue, ferme aussi la porte à
    // l'ancien hôte : on ne démarre pas au nom d'une page que l'on ne
    // représente plus.
    if ((await directSessionAccessDecision(ctx, ctx.person._id, session, { readerIsMember: true })) !== "allowed") {
      return directNotFound()
    }
    if ((await contentState(ctx, "live", session._id))?.status === "pending_review") return fail("policyRefused")
    if (session.status === "live") return { started: false }
    if (session.status === "ended") return failRule("LIVE_ENDED")

    const now = Date.now()
    await ctx.db.patch(session._id, {
      status: "live",
      startedAt: now,
      updatedAt: now,
      // ADR-0158 — la copie naît NON DÉCIDÉE : l'hôte dira à la fin si elle
      // se publie, se garde ou se supprime. Rien ne se publie tout seul.
      ...(session.replayRequested ? { replayStatus: "pending" as const, replayPublication: "undecided" as const } : {}),
    })

    // L'Egress démarre APRÈS la transaction (runAfter) : un `goLive` annulé
    // n'enregistre rien. Le FORMAT voyage (D-12) : même repli que le DTO,
    // `computer` à défaut.
    if (session.replayRequested) {
      await ctx.scheduler.runAfter(0, internal.modules.live.livekitActions.startDirectEgress, {
        sessionId: session._id,
        roomName: session.roomName,
        stageFormat: session.stageFormat ?? "computer",
      })
    }

    // Les INVITÉS d'abord (ADR-0150, F) : promotion des intervenants, gardes
    // rejouées, et cloche `live_invite` — puis l'audience, dont la diffusion
    // saute les invités vivants (une personne, une cloche). `session` est la
    // ligne d'AVANT le passage en live : aucun invité ne peut encore être
    // connecté, aucune connexion SFU n'est donc à faire rejoindre.
    await openConferenceToInviteesAtGoLive(ctx, session)
    await notifyDirectAudience(ctx, session, { kind: "live_started", gate: "session" })
    return { started: true }
  },
})

/**
 * Les deux cloches d'AUDIENCE d'une conférence : son DÉMARRAGE
 * (`live_started`), puis la PUBLICATION de son enregistrement
 * (`live_replay_published`, CH-094). Même audience, même sujet — la SESSION —,
 * même diffusion : seule change la porte que la cloche annonce.
 */
type DirectAudienceBell = {
  kind: "live_started" | "live_replay_published"
  /**
   * La porte rejugée par destinataire, AU MOMENT DE SONNER. `session` : la page
   * du direct (audience, blocage, exclusion), pour une conférence encore en
   * direct. `replay` : la REDIFFUSION (`directReplayAccessDecision` —
   * publication, visibilité restreinte, blocage et exclusion compris) : la
   * cloche n'annonce jamais une copie que la page refuserait de servir.
   */
  gate: "session" | "replay"
}

/**
 * La sonnerie d'audience — par lots chaînés, et JAMAIS vers un lien qui refuse.
 *
 * Elle ne sonne plus dans la transaction du geste (le socle bornait chaque
 * source à 200 pour la protéger) : UN job de diffusion (`notifications/fanout`,
 * source `liveSessionAudience`) parcourt l'audience par phases — relations puis
 * abonnés de l'hôte si le direct est public ; abonnés et signataires vivants de
 * la page pour `followers` ; d'abord les invités vivants à la PUBLICATION (la
 * rediffusion leur reste ouverte, ADR-0150, D) — et rejuge la porte pour chaque
 * destinataire. Au DÉMARRAGE, les invités vivants sont sautés : ils ont
 * `live_invite`. Une conférence « Invités seulement » ne sonne donc personne
 * par ici à son démarrage.
 */
async function notifyDirectAudience(ctx: Pick<MutationCtx, "scheduler">, session: Doc<"liveSessions">, bell: DirectAudienceBell): Promise<void> {
  if (liveSessionAudiencePhases(session.audience, bell.gate).length === 0) return
  await enqueueFanout(ctx, {
    networkId: session.networkId,
    actorPersonId: session.hostPersonId,
    kind: bell.kind,
    subject: { liveSession: session._id },
    source: { kind: "liveSessionAudience", sessionId: session._id, gate: bell.gate },
  })
}

/**
 * Terminer. Permission `endOrTransfer` (D-11), idempotent. Vaut aussi
 * ANNULATION d'un `scheduled` jamais démarré — même état final, même garde.
 *
 * ⚠️ LE CHEMIN DE L'HÔTE EST INCHANGÉ, ET CE N'EST PAS UNE ÉCONOMIE : il ne
 * passe PAS par `assertVisibleDirectSession`, parce qu'un hôte dont la
 * signature de page vient d'être retirée ne voit plus sa propre conférence
 * réservée aux abonnés — et doit pourtant pouvoir la fermer, sans quoi la
 * salle LiveKit resterait ouverte derrière lui. C'est un invariant TESTÉ,
 * qu'une réécriture « propre » de cette garde casse en silence.
 *
 * Le DÉLÉGUÉ, lui, doit voir la session avant de la fermer : rien ne justifie
 * de lui ouvrir une porte que l'audience a refermée.
 */
export const end = networkMutation({
  writeBucket: "live.end",
  args: { sessionId: v.id("liveSessions") },
  handler: async (ctx, args): Promise<{ ended: boolean }> => {
    const session = await ctx.db.get(args.sessionId)
    if (!session || session.networkId !== ctx.networkId) return directNotFound()
    if (session.hostPersonId !== ctx.person._id) {
      const visible = await assertVisibleDirectSession(ctx, directCaller(ctx), args.sessionId)
      await requireDirectPermission(ctx, visible, ctx.person._id, "endOrTransfer")
    }
    if (session.status === "ended") return { ended: false }

    const now = Date.now()
    await ctx.db.patch(session._id, {
      status: "ended",
      endedAt: now,
      // La fin EXPLICITE de l'hôte, distinguée des trois fins subies
      // (`host_absent`, `max_duration`, `never_started`) et de la révocation :
      // l'écran ne dit pas la même chose d'une conférence close et d'une
      // conférence interrompue.
      endReason: "host",
      updatedAt: now,
    })
    // Les compteurs définitifs — l'écrivain unique, au bord de transition (D28).
    await recomputeAggregates(ctx, session._id)

    if (session.egressId !== undefined) {
      await ctx.scheduler.runAfter(0, internal.modules.live.livekitActions.stopDirectEgress, { egressId: session.egressId })
    }
    // CH-094 — les invitations n'ont plus d'objet : leurs cloches se soldent
    // en JOB, jamais inline. Annuler un direct PROGRAMMÉ ne planifie rien :
    // aucune cloche d'invitation ne sonne avant le live.
    if (session.status === "live") {
      await ctx.scheduler.runAfter(0, internal.modules.live.invitationSettle.expireSessionInvitations, { sessionId: session._id, endedAt: now })
    }
    return { ended: true }
  },
})

export type DirectSessionDto = {
  sessionId: Id<"liveSessions">
  title: string
  /** Identité de signature lisible, jamais une permission. */
  page?: { pageId: Id<"pages">; name: string; handle: string } | null
  status: "scheduled" | "live" | "ended"
  // Le TYPE du domaine, jamais une union recopiée.
  audience: DirectAudience
  chatMode: "open" | "closed"
  stageFormat: "television" | "computer" | "mobile"
  /**
   * La DISPOSITION voulue chez le lecteur (D-04). `adaptive` : la scène se
   * mesure sur son conteneur. `fixed` : elle rend les huit places.
   *
   * ⚠️ Servi ici et PAS sur les cartes de découverte : une vignette de fil ne
   * compose aucune scène, l'y ajouter n'aurait fait qu'élargir une allowliste.
   */
  stageLayout: "adaptive" | "fixed"
  maxViewers: number
  /**
   * MON rôle PUBLIANT sur cette session — qui parle, pas qui gère.
   *
   * ⚠️ L'union n'a PAS été élargie pour y loger « cohôte » ou « modérateur »
   * (D-11) : un modérateur muet passerait pour un micro ouvert. Ce qu'on a le
   * droit de GÉRER se lit sur `permissions`, juste en dessous.
   */
  viewerRole: "host" | "speaker" | "viewer"
  /**
   * Suis-je INVITÉ nommément à cette conférence (ADR-0150) ? `false` pour
   * l'hôte. Une invitation retirée rend `false` — l'écran ne promet pas une
   * place qui n'existe plus.
   */
  viewerIsInvitee: boolean
  /**
   * CE QUE JE PEUX GÉRER ici (ADR-0144) — calculé au SERVEUR, jamais déduit
   * d'un rôle côté écran. Le serveur refait le calcul à chaque acte
   * (`requireDirectPermission`).
   */
  permissions: DirectPermissions
  /** `displayName: null` = nom neutre (profil non publié) : l'écran le traduit. */
  host: { displayName: string | null; handle: string | null; avatarUrl: string | null }
  speakers: {
    personId: Id<"persons">
    role: "host" | "speaker"
    displayName: string | null
    handle: string | null
    avatarUrl: string | null
    isSelf: boolean
  }[]
  /**
   * LE PROGRAMME DE L'HÔTE — qui il met en avant pour toute la salle.
   *
   * `null` quand personne n'est mis en avant, ET quand la personne mise en
   * avant n'est plus à l'antenne : une mise en avant ne survit pas à sa
   * personne, et servir un identifiant qui ne figure plus dans `speakers`
   * ferait chercher à l'écran une vignette qui n'existe pas.
   *
   * ⚠️ C'est une PROPOSITION, pas une contrainte : le lecteur qui a épinglé
   * quelqu'un localement garde son épingle. La décision vit à l'écran.
   */
  spotlight: { personId: Id<"persons"> } | null
  startedAt: number | null
  endedAt: number | null
  /**
   * L'échéance ABSOLUE (`startedAt + 4 h`), ANNONCÉE (D-14). `null` tant que
   * rien n'a commencé.
   */
  maxDurationAt: number | null
  /**
   * POURQUOI c'est terminé, quand on le sait. `null` sur une session vivante
   * ET sur une session close sans raison connue — l'écran dit alors
   * « Terminée », sans broder.
   */
  endReason: DirectEndReason | null
  /**
   * ⚠️ DEUX nombres de spectateurs, et ils ne disent pas la même chose (D-09) :
   *  · `viewers`  — les personnes DISTINCTES admises depuis le début. Il ne
   *    redescend jamais ; c'est l'audience cumulée, pas la salle.
   *  · `present`  — les personnes EN LIGNE à la dernière recomposition (bail
   *    de 90 s, `presence.heartbeat`). C'est lui que la capacité juge.
   * Tous recomposés par la récolte, hors du document de session (D28).
   */
  counters: {
    viewers: number
    present: number
    comments: number
    reactions: number
  }
  /** L'annonce sur le fil — une référence, relue là-bas avec sa garde. */
  announcePostId: Id<"posts"> | null
  /**
   * Le replay, SI le lecteur y a droit MAINTENANT (`replayVisibility` ne
   * peut que restreindre). `null` = pas de replay pour ce lecteur — sans
   * distinguer « jamais demandé » de « hors visibilité ».
   *
   * ⚠️ D-12 / lot 10 — CE BLOC EST AUSSI SERVI PENDANT LE DIRECT : l'hôte doit
   * savoir si sa conférence est réellement enregistrée. `url` reste
   * évidemment `null` tant qu'il n'y a rien à lire.
   */
  replay: {
    /** Le statut DURABLE — les quatre littéraux, inchangés (index + client). */
    status: "pending" | "ready" | "failed" | "expired"
    /**
     * L'état OBSERVABLE de la production, dérivé du statut et de l'état de
     * capture (`replayComposition.directReplayEgressView`).
     */
    egressState: DirectReplayEgressView
    /**
     * POURQUOI aucun fichier ne sera produit. ⚠️ HÔTE SEUL : un motif de panne
     * de service ne regarde pas la salle.
     */
    failureReason: string | null
    url: string | null
    captionsUrl: string | null
    /** La langue DÉCLARÉE de la piste. */
    captionsLang: string | null
    durationMs: number | null
    /** L'ÉCHÉANCE de conservation (90 j). */
    retentionUntil: number | null
    /** La visibilité EFFECTIVE — la restriction si elle existe, sinon l'audience. */
    visibility: DirectAudience
    /**
     * Ce que l'hôte a DÉCIDÉ de la copie (ADR-0158) — `undecided` tant qu'il
     * n'a rien dit, et la salle ne voit alors pas ce bloc du tout après la
     * fin. Une session sans décision posée se lit `published`.
     */
    publication: DirectReplayPublication
    /**
     * Y a-t-il quelque chose à RÉCUPÉRER chez LiveKit ? Vrai seulement si une
     * capture a été corrélée (`egressId`) et n'a pas abouti.
     */
    recoverable: boolean
    /** Puis-je la GÉRER (visibilité, retrait, relance, sous-titres) ? */
    canManage: boolean
  } | null
}

/**
 * UNE session, telle que JE peux la voir MAINTENANT, depuis ce réseau.
 *
 * La garde est `assertVisibleDirectSession` (adhésion → audience → blocage →
 * exclusion, refus indistinct). Le DTO est ALLOWLISTÉ : ni `roomName` (c'est
 * le jeton qui la donne, après SA garde), ni identifiant de stockage.
 */
export const get = networkQuery({
  args: { sessionId: v.id("liveSessions") },
  handler: async (ctx, args): Promise<DirectSessionDto> => {
    const me = ctx.person._id
    const session = await assertVisibleDirectSession(ctx, directCaller(ctx), args.sessionId)

    const profileOf = miniProfileCache(ctx)
    const host = await profileOf(session.hostPersonId)
    const signedPage = session.pageId === undefined ? null : await readablePageOrNull(ctx, ctx.network, session.pageId)
    const page = signedPage === null ? null : await pageCardOf(ctx, signedPage)

    const speakerRows = await ctx.db
      .query("liveSpeakers")
      .withIndex("by_session_removedAt", (q) => q.eq("sessionId", session._id).eq("removedAt", undefined))
      .take(DIRECT_MAX_SPEAKERS)
    const speakers: DirectSessionDto["speakers"] = []
    const visibleSpeakerRows: typeof speakerRows = []
    for (const row of speakerRows) {
      if ((await directSessionAccessDecision(ctx, row.personId, session)) !== "allowed") continue
      visibleSpeakerRows.push(row)
      const profile = await profileOf(row.personId)
      speakers.push({
        personId: row.personId,
        role: row.role,
        displayName: profile.displayName,
        handle: profile.handle,
        avatarUrl: profile.avatarUrl,
        isSelf: row.personId === me,
      })
    }

    // ⚠️ La mise en avant se SERT sur la liste déjà construite, jamais sur le
    // seul champ de la session : une personne rétrogradée, exclue ou sortie de
    // l'audience a quitté `speakers` sans que `spotlightPersonId` ait bougé.
    const spotlightPersonId = session.spotlightPersonId
    const spotlight: DirectSessionDto["spotlight"] =
      spotlightPersonId !== undefined && speakers.some((row) => row.personId === spotlightPersonId) ? { personId: spotlightPersonId } : null

    const isHost = session.hostPersonId === me
    const viewerRole: DirectSessionDto["viewerRole"] = isHost ? "host" : visibleSpeakerRows.some((row) => row.personId === me) ? "speaker" : "viewer"
    // ⚠️ HISSÉE : le bloc `replay` en a besoin (`canManage`), et deux appels sur
    // le chemin chaud d'une query réactive seraient deux lectures pour un même fait.
    const permissions = await directPermissionsOf(ctx, session, me)
    // UNE lecture indexée, et aucune pour l'hôte — la même définition que la
    // décision d'accès : une ligne qu'un compte ne peut plus franchir ne
    // l'étiquette pas « invité ».
    const viewerIsInvitee = !isHost && (await readerIsLiveInvitee(ctx, me, session))

    // ── Replay : le droit se juge PAR LECTEUR, à la lecture.
    //
    // ⚠️ DEUX GARDES, parce que ce sont deux questions. Après la fin, la
    // question est « ai-je le droit de LIRE cette copie durable ? » —
    // `directReplayAccessDecision`, et c'est elle qui laisse sortir une URL.
    // PENDANT le direct, il n'existe aucun fichier : la seule chose qu'on dise
    // est « la salle est enregistrée », et cela se dit à TOUTE la salle.
    let replay: DirectSessionDto["replay"] = null
    if (session.status !== "scheduled" && session.replayRequested && session.replayStatus !== undefined) {
      const allowed = session.status !== "ended" || (await directReplayAccessDecision(ctx, me, session)) === "allowed"
      // `ready` sans échéance est une ligne historique non migrée : aucune URL
      // ne sort avant que le cron ait matérialisé sa conservation.
      if (allowed && (session.replayStatus !== "ready" || isDirectReplayRetained(session))) {
        const servable = session.status === "ended" && session.replayStatus === "ready"
        replay = {
          status: session.replayStatus,
          egressState: directReplayEgressView({ replayStatus: session.replayStatus, replayEgressState: session.replayEgressState }),
          // Un motif de panne de service ne se dit qu'à qui peut agir.
          failureReason: isHost ? (session.replayFailureReason ?? null) : null,
          // Les octets sortent par la garde des fichiers, jamais par le stockage brut.
          url: servable && session.replayStorageId !== undefined ? await servableUrl(ctx, session.replayStorageId) : null,
          captionsUrl: servable && session.replayCaptionsStorageId !== undefined ? await servableUrl(ctx, session.replayCaptionsStorageId) : null,
          captionsLang: servable ? (session.replayCaptionsLang ?? null) : null,
          durationMs: session.replayDurationMs ?? null,
          retentionUntil: session.replayRetentionUntil ?? null,
          visibility: effectiveReplayVisibility(session),
          publication: effectiveReplayPublication(session),
          recoverable: session.egressId !== undefined && (session.replayStatus === "pending" || session.replayStatus === "failed"),
          /**
           * ⚠️ `canManage` DÉRIVE de la matrice de permissions, jamais du rôle :
           * `changeAudienceOrReplay` est la clé qui garde déjà
           * `setReplayVisibility`, et elle ne se délègue pas — l'écran et le
           * serveur lisent donc la même règle.
           */
          canManage: permissions.changeAudienceOrReplay,
        }
      }
    }

    // D28 — les compteurs vivent hors de la session, recomposés par la récolte.
    const counts = await sessionCountersOf(ctx, session._id)

    return {
      sessionId: session._id,
      title: session.title,
      page: page === null ? null : { pageId: page.pageId, name: page.name, handle: page.handle },
      status: session.status,
      audience: session.audience,
      chatMode: session.chatMode,
      stageFormat: session.stageFormat ?? "computer",
      // Absent (session antérieure à la disposition) = scène MESURÉE : le repli
      // ne peut pas être `fixed`, qui ramènerait les six cases vides de D-04.
      stageLayout: session.stageLayout ?? "adaptive",
      maxViewers: session.maxViewers,
      viewerRole,
      viewerIsInvitee,
      permissions,
      host: { displayName: host.displayName, handle: host.handle, avatarUrl: host.avatarUrl },
      speakers,
      spotlight,
      startedAt: session.startedAt ?? null,
      endedAt: session.endedAt ?? null,
      maxDurationAt: directMaxDurationAt(session.startedAt),
      endReason: session.endReason ?? null,
      counters: {
        viewers: counts.viewerGrantCount,
        // Ligne absente, ou aucun présent recomposé : `0` est la réponse
        // honnête, et l'écran retombe alors sur le cumulé.
        present: counts.viewerPresentCount,
        comments: counts.commentCount,
        reactions: counts.reactionCount,
      },
      announcePostId: isHost ? (session.announcePostId ?? null) : null,
      replay,
    }
  },
})

/**
 * FERMER (ou rouvrir) la conversation. Permission `closeChat` (D-11).
 *
 * ⚠️ LIVE seulement : fermer la conversation d'un direct terminé ne ferme rien
 * (plus personne n'écrit) et réécrirait un état historique. Idempotente.
 */
export const setChatMode = networkMutation({
  writeBucket: "live.manage",
  args: {
    sessionId: v.id("liveSessions"),
    chatMode: directChatModeValidator,
  },
  handler: async (ctx, args): Promise<{ updated: boolean }> => {
    const session = await assertVisibleDirectSession(ctx, directCaller(ctx), args.sessionId)
    await requireDirectPermission(ctx, session, ctx.person._id, "closeChat")
    if (session.status !== "live") return failRule("LIVE_NOT_LIVE")
    if (session.chatMode === args.chatMode) return { updated: false }
    await ctx.db.patch(session._id, { chatMode: args.chatMode, updatedAt: Date.now() })
    return { updated: true }
  },
})

/**
 * METTRE EN AVANT pour toute la salle (`targetPersonId: null` retire).
 * Permission `admitToStage` — qui décide QUI parle décide qui l'on regarde.
 *
 * ⚠️ C'est une PROPOSITION, jamais une contrainte : le DTO la sert, et le
 * lecteur qui a épinglé quelqu'un localement garde son épingle.
 *
 * ⚠️ LIVE seulement, et la cible doit être À L'ANTENNE : mettre en avant un
 * spectateur ne désignerait aucune vignette. Idempotente.
 */
export const setSpotlight = networkMutation({
  writeBucket: "live.stage",
  args: {
    sessionId: v.id("liveSessions"),
    /** `null` = plus personne en avant — le retrait est le même geste. */
    targetPersonId: v.union(v.id("persons"), v.null()),
  },
  handler: async (ctx, args): Promise<{ updated: boolean }> => {
    const session = await assertVisibleDirectSession(ctx, directCaller(ctx), args.sessionId)
    await requireDirectPermission(ctx, session, ctx.person._id, "admitToStage")
    if (session.status !== "live") return failRule("LIVE_NOT_LIVE")
    if (args.targetPersonId !== null) {
      // L'hôte a sa propre ligne `liveSpeakers` : la tester en premier ne fait
      // que s'épargner une lecture, jamais ouvrir un cas de plus.
      const onStage = args.targetPersonId === session.hostPersonId || (await liveSpeakerRow(ctx, session._id, args.targetPersonId)) !== null
      if (!onStage) return failRule("LIVE_TARGET_NOT_ON_STAGE")
    }
    if ((session.spotlightPersonId ?? null) === args.targetPersonId) return { updated: false }
    await ctx.db.patch(session._id, {
      // `undefined` EFFACE le champ — `null` n'est pas une valeur Convex.
      spotlightPersonId: args.targetPersonId ?? undefined,
      updatedAt: Date.now(),
    })
    return { updated: true }
  },
})

/**
 * Restreindre la visibilité du REPLAY. Permission `changeAudienceOrReplay`,
 * restriction SEULE : `public` → `connections` passe, l'inverse est refusé (le
 * domaine juge).
 *
 * ⚠️ Cette permission ne se DÉLÈGUE pas : elle vaut donc « hôte seul ». Elle
 * passe malgré tout par la garde commune — la matrice doit être le SEUL
 * endroit où l'on lit qui peut quoi.
 */
export const setReplayVisibility = networkMutation({
  writeBucket: "live.manage",
  args: {
    sessionId: v.id("liveSessions"),
    visibility: directAudienceValidator,
  },
  handler: async (ctx, args): Promise<{ updated: boolean }> => {
    const session = await assertVisibleDirectSession(ctx, directCaller(ctx), args.sessionId)
    await requireDirectPermission(ctx, session, ctx.person._id, "changeAudienceOrReplay")

    if (!isReplayVisibilityAllowed(session.audience, args.visibility)) {
      return failRule("LIVE_REPLAY_VISIBILITY_WIDENS")
    }
    if (effectiveReplayVisibility(session) === args.visibility) return { updated: false }
    /**
     * ⚠️ Le champ STOCKÉ ne connaît que `public` et `connections`, et c'est
     * volontaire : la restriction d'une conférence réservée aux abonnés d'une
     * page se DÉRIVE de la session (`effectiveReplayVisibility`) au lieu
     * d'être recopiée. Une valeur dupliquée est une valeur qui peut diverger.
     *
     * `isReplayVisibilityAllowed` a déjà refusé `followers` ci-dessus ; cette
     * garde-ci ne fait que le dire au compilateur.
     */
    if (args.visibility === "followers") return failRule("LIVE_REPLAY_VISIBILITY_FOLLOWERS")
    // Même raison pour « Invités seulement » (ADR-0150) : la réserve se DÉRIVE
    // de l'audience, elle ne se recopie pas.
    if (args.visibility === "invitees") return failRule("LIVE_REPLAY_VISIBILITY_INVITEES")
    await ctx.db.patch(session._id, { replayVisibility: args.visibility, updatedAt: Date.now() })
    return { updated: true }
  },
})

/**
 * RETIRER la rediffusion — le geste qui manquait (D-12, lot 10C).
 *
 * ⚠️ On réutilise EXACTEMENT la forme de l'expiration — même purge de blobs,
 * même statut `expired`, même `replayPurgedAt`. C'est ce qui referme la lecture
 * (`isDirectReplayRetained`) ET la découverte (facette `ready` de
 * `listReplays`) sans une garde de plus.
 *
 * ⚠️ CE QU'ON NE PROMET PAS : une URL de stockage déjà copiée hors de la
 * session reste valable jusqu'à la suppression du blob — laquelle a lieu ici,
 * dans la même transaction. C'est un retrait, pas une révocation de ce qui a
 * déjà été téléchargé.
 *
 * Idempotente : rejouée, elle rend `{ withdrawn: false }`.
 */
export const withdrawReplay = networkMutation({
  writeBucket: "live.manage",
  args: { sessionId: v.id("liveSessions") },
  handler: async (ctx, args): Promise<{ withdrawn: boolean }> => {
    const session = await assertVisibleDirectSession(ctx, directCaller(ctx), args.sessionId)
    await requireDirectPermission(ctx, session, ctx.person._id, "changeAudienceOrReplay")
    return { withdrawn: await withdrawReplayRow(ctx, session) }
  },
})

/**
 * Le RETRAIT lui-même — partagé par `withdrawReplay` et par le choix
 * « Ne pas conserver » de `decideReplayPublication` : deux définitions de
 * « retirer » finiraient par diverger, et diverger ici veut dire laisser une
 * vidéo derrière une ligne qui se dit retirée.
 */
async function withdrawReplayRow(ctx: MutationCtx, session: Doc<"liveSessions">): Promise<boolean> {
  if (session.replayStatus === undefined || session.replayStatus === "expired") return false
  const now = Date.now()
  await purgeReplayBlobs(ctx, session.replayStorageId, session.replayCaptionsStorageId)
  await ctx.db.patch(session._id, {
    replayStatus: "expired",
    replayStorageId: undefined,
    replayCaptionsStorageId: undefined,
    replayCaptionsLang: undefined,
    replayPurgedAt: now,
    updatedAt: now,
  })
  return true
}

/**
 * DÉCIDER du sort de l'enregistrement (ADR-0158) — publier, garder pour soi,
 * ou supprimer. Permission `changeAudienceOrReplay` (l'hôte, non délégable).
 *
 * Trois choses que cette mutation NE FAIT PAS :
 *  · elle ne refait aucun Egress — la copie existe ou n'existera pas ;
 *  · elle ne touche pas à `replayVisibility` : publier rend la copie à
 *    l'AUDIENCE de la conférence, restreinte si l'hôte l'a restreinte ;
 *  · elle ne décide rien PENDANT le direct.
 *
 * `discard` est un retrait (`withdrawReplayRow`). Idempotente : rejouer la
 * même décision rend `{ updated: false }`.
 *
 * PUBLIER se dit à l'audience (CH-094) : cloche `live_replay_published`, même
 * audience et même diffusion que `live_started`, rejugée à la porte de la
 * rediffusion. Seule une publication EFFECTIVE sonne.
 */
export const decideReplayPublication = networkMutation({
  writeBucket: "live.manage",
  args: {
    sessionId: v.id("liveSessions"),
    decision: directReplayDecisionValidator,
  },
  handler: async (ctx, args): Promise<{ updated: boolean; publication: DirectReplayPublication; discarded: boolean }> => {
    const session = await assertVisibleDirectSession(ctx, directCaller(ctx), args.sessionId)
    await requireDirectPermission(ctx, session, ctx.person._id, "changeAudienceOrReplay")
    if (session.status !== "ended") return failRule("LIVE_REPLAY_DECISION_AFTER_END")
    if (session.replayStatus === undefined) return failRule("LIVE_NO_RECORDING")
    if (args.decision === "discard") {
      const withdrawn = await withdrawReplayRow(ctx, session)
      return { updated: withdrawn, publication: effectiveReplayPublication(session), discarded: true }
    }
    if (session.replayStatus === "expired") return failRule("LIVE_REPLAY_WITHDRAWN")
    if (effectiveReplayPublication(session) === args.decision) {
      return { updated: false, publication: args.decision, discarded: false }
    }
    await ctx.db.patch(session._id, { replayPublication: args.decision, updatedAt: Date.now() })
    if (args.decision === "published") {
      // La diffusion relit la ligne ÉCRITE : la porte de la rediffusion lit la
      // publication, et l'hôte n'est jamais sonné (la porte écarte l'acteur).
      await notifyDirectAudience(ctx, session, { kind: "live_replay_published", gate: "replay" })
    }
    return { updated: true, publication: args.decision, discarded: false }
  },
})

/**
 * RELANCER une rediffusion restée en attente ou en échec (lot 10B).
 *
 * Elle ne refait pas l'Egress — la conférence est finie, la salle n'existe
 * plus. Elle va DEMANDER à LiveKit ce qu'il est advenu de la capture, comme le
 * cron de réconciliation, mais quand l'hôte le décide.
 *
 * Refus EXPLICITES plutôt qu'un succès qui ne fait rien : « rien à relancer »
 * est une information, pas une erreur à masquer.
 */
export const retryReplay = networkMutation({
  writeBucket: "live.manage",
  args: { sessionId: v.id("liveSessions") },
  handler: async (ctx, args): Promise<{ scheduled: boolean }> => {
    const session = await assertVisibleDirectSession(ctx, directCaller(ctx), args.sessionId)
    await requireDirectPermission(ctx, session, ctx.person._id, "changeAudienceOrReplay")
    if (session.status !== "ended") return failRule("LIVE_REPLAY_RETRY_AFTER_END")
    if (session.replayStatus !== "pending" && session.replayStatus !== "failed") return failRule("LIVE_REPLAY_NOTHING_TO_RETRY")
    if (session.egressId === undefined) return failRule("LIVE_REPLAY_NOT_STARTED")
    await ctx.scheduler.runAfter(0, internal.modules.live.livekitActions.reconcileDirectEgress, { sessionId: session._id, egressId: session.egressId })
    return { scheduled: true }
  },
})

/**
 * LA PORTE d'une importation de sous-titres (lot 10D) — elle ne stocke rien.
 *
 * ⚠️ AUCUNE URL DE DÉPÔT N'EST DÉLIVRÉE ICI, et c'est une décision, pas un
 * détour : le contenu voyage en TEXTE, dans l'argument d'une action
 * (`livekitActions.importReplayCaptions`), qui le vérifie AVANT de l'écrire —
 * il n'existe alors aucun blob non rattaché.
 *
 * Cette query est la première des deux barrières : l'autorité et la
 * servabilité. La seconde est `replay.attachCaptions`, qui les rejuge.
 */
export const replayCaptionsIntake = networkQuery({
  args: { sessionId: v.id("liveSessions") },
  returns: v.object({ maxBytes: v.number() }),
  handler: async (ctx, args): Promise<{ maxBytes: number }> => {
    const session = await assertVisibleDirectSession(ctx, directCaller(ctx), args.sessionId)
    await requireDirectPermission(ctx, session, ctx.person._id, "changeAudienceOrReplay")
    assertReplayServable(session)
    return { maxBytes: DIRECT_REPLAY_CAPTIONS_MAX_BYTES }
  },
})

/**
 * Une rediffusion SERVABLE : terminée, prête, et encore dans sa fenêtre de
 * conservation. Les deux portes de sous-titres l'exigent.
 */
function assertReplayServable(session: Doc<"liveSessions">): void {
  if (session.status !== "ended" || !isDirectReplayRetained(session)) failRule("LIVE_REPLAY_UNAVAILABLE")
}

/**
 * MES directs DANS CE RÉSEAU — l'hôte retrouve ce qu'il a ouvert (un live à
 * reprendre, un programmé à démarrer, les terminés récents). Bornés, les plus
 * utiles d'abord.
 */
export const listMine = networkQuery({
  args: {},
  handler: async (ctx): Promise<DirectMineCardDto[]> => {
    const me = ctx.person._id
    const byStatus = async (status: "scheduled" | "live" | "ended", n: number) =>
      await ctx.db
        .query("liveSessions")
        .withIndex("by_network_host_status", (q) => q.eq("networkId", ctx.networkId).eq("hostPersonId", me).eq("status", status))
        .order("desc")
        .take(n)
    const [live, scheduled, ended] = await Promise.all([byStatus("live", 5), byStatus("scheduled", 10), byStatus("ended", 10)])
    const visible: Doc<"liveSessions">[] = []
    for (const session of [...live, ...scheduled, ...ended]) {
      if ((await directSessionAccessDecision(ctx, me, session, { readerIsMember: true })) === "allowed") visible.push(session)
    }
    return visible.map(toDirectMineCard)
  },
})

type DirectMineStatus = "live" | "scheduled" | "ended"
const DIRECT_MINE_STATUS_ORDER: readonly DirectMineStatus[] = ["live", "scheduled", "ended"]
const mineStatusValidator = v.union(v.literal("live"), v.literal("scheduled"), v.literal("ended"))
const mineCursorValidator = v.object({
  status: mineStatusValidator,
  cursor: v.union(v.string(), v.null()),
})
export type DirectMineCursor = {
  status: DirectMineStatus
  cursor: string | null
}
export type DirectMineCardDto = {
  sessionId: Id<"liveSessions">
  title: string
  status: "scheduled" | "live" | "ended"
  audience: DirectAudience
  createdAt: number
  startedAt: number | null
  /**
   * L'ÉTAT de la rediffusion, pour l'hôte et pour lui seul (lot 10B).
   *
   * ⚠️ `null` = aucune rediffusion demandée. Aucune URL ici — une liste ne
   * distribue pas d'octets (même allowlist que les cartes de découverte).
   */
  replay: {
    status: "pending" | "ready" | "failed" | "expired"
    egressState: DirectReplayEgressView
    retentionUntil: number | null
    /** ADR-0158 — « Mes conférences » dit ce qui reste À DÉCIDER. */
    publication: DirectReplayPublication
  } | null
}
const directMineCardValidator = v.object({
  sessionId: v.id("liveSessions"),
  title: v.string(),
  status: v.union(v.literal("scheduled"), v.literal("live"), v.literal("ended")),
  audience: directAudienceValidator,
  createdAt: v.number(),
  startedAt: v.union(v.number(), v.null()),
  replay: v.union(
    v.object({
      status: directReplayStatusValidator,
      egressState: v.union(v.literal("requested"), v.literal("active"), v.literal("processing"), v.literal("ready"), v.literal("failed"), v.literal("expired")),
      retentionUntil: v.union(v.number(), v.null()),
      publication: directReplayPublicationValidator,
    }),
    v.null(),
  ),
})

/** Une page d'UN statut : ce que rend `listMineStatusPage`. */
export type DirectMineStatusPage = {
  items: DirectMineCardDto[]
  isDone: boolean
  continueCursor: string
}

/** La ligne « Mes conférences » — une seule projection pour les deux queries. */
function toDirectMineCard(session: Doc<"liveSessions">): DirectMineCardDto {
  return {
    sessionId: session._id,
    title: session.title,
    status: session.status,
    audience: session.audience,
    createdAt: session.createdAt,
    startedAt: session.startedAt ?? null,
    replay: mineReplayState(session),
  }
}

/**
 * L'état de rediffusion servi dans « Mes conférences ».
 *
 * ⚠️ Ces queries sont déjà scopées à l'hôte (index `by_network_host_status`) :
 * il n'y a donc pas de second lecteur à garder ici. Le MOTIF d'échec, lui,
 * n'est pas servi — il vit sur la page de la conférence.
 */
function mineReplayState(session: Doc<"liveSessions">): DirectMineCardDto["replay"] {
  if (!session.replayRequested || session.replayStatus === undefined) return null
  return {
    status: session.replayStatus,
    egressState: directReplayEgressView({ replayStatus: session.replayStatus, replayEgressState: session.replayEgressState }),
    retentionUntil: session.replayRetentionUntil ?? null,
    publication: effectiveReplayPublication(session),
  }
}

/**
 * UN statut de l'hôte dans ce réseau, en flux ordonné du plus récent au plus ancien.
 *
 * ⚠️ PAS de `.paginate()` natif ici. Le moteur n'en admet qu'UN par exécution,
 * et une sous-requête `ctx.runQuery` PARTAGE l'exécution de la requête qui
 * l'appelle : composer les statuts par sous-requêtes natives lève en production
 * — « This query function ran multiple paginated queries » — dès qu'un statut
 * est vide, cas NOMINAL (aucun direct `live`). convex-test, qui ouvre un
 * contexte par sous-requête, l'acceptait. Le flux de convex-helpers pagine sans
 * ce verrou : les trois statuts vivent dans la MÊME exécution.
 *
 * Ses curseurs sont la clé d'index en clair ; `paginate` les recoupe avec la
 * plage de la requête (`narrow`) : un curseur forgé ne sort pas de MES lignes,
 * ni de ce réseau.
 */
function mineStatusStream(ctx: Pick<QueryCtx, "db">, networkId: Id<"networks">, hostPersonId: Id<"persons">, status: DirectMineStatus) {
  return stream(ctx.db, schema)
    .query("liveSessions")
    .withIndex("by_network_host_status", (q) => q.eq("networkId", networkId).eq("hostPersonId", hostPersonId).eq("status", status))
    .order("desc")
}

/**
 * Le curseur d'un statut ÉPUISÉ. Le flux rend `"[]"` quand il n'a plus rien —
 * mais, rejoué, ce curseur vide ne borne RIEN (`splitRange` lit une clé vide
 * comme « sans limite ») et le statut repartirait du début.
 */
const EXHAUSTED_MINE_STATUS_CURSOR = "[]"

/**
 * Une page d'UN statut de l'hôte. La garde d'audience se juge ici, ligne par
 * ligne : une page peut revenir VIDE sans être la dernière (`isDone: false`),
 * et c'est au client de continuer, jamais de conclure.
 */
export async function mineStatusPage(
  ctx: Pick<QueryCtx, "db">,
  networkId: Id<"networks">,
  hostPersonId: Id<"persons">,
  status: DirectMineStatus,
  cursor: string | null,
  limit: number,
): Promise<DirectMineStatusPage> {
  if (cursor === EXHAUSTED_MINE_STATUS_CURSOR) return { items: [], isDone: true, continueCursor: EXHAUSTED_MINE_STATUS_CURSOR }
  const page = await mineStatusStream(ctx, networkId, hostPersonId, status).paginate({ cursor, numItems: limit })
  const items: DirectMineCardDto[] = []
  for (const session of page.page) {
    if ((await directSessionAccessDecision(ctx, hostPersonId, session, { readerIsMember: true })) !== "allowed") continue
    items.push(toDirectMineCard(session))
  }
  return { items, isDone: page.isDone, continueCursor: page.isDone ? EXHAUSTED_MINE_STATUS_CURSOR : page.continueCursor }
}

/** UN statut de l'hôte, seul — sur la même aide que `listMinePage`. */
export const listMineStatusPage = networkQuery({
  args: {
    status: mineStatusValidator,
    cursor: v.union(v.string(), v.null()),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    items: v.array(directMineCardValidator),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, args): Promise<DirectMineStatusPage> =>
    await mineStatusPage(ctx, ctx.networkId, ctx.person._id, args.status, args.cursor, clampDiscoveryLimit(args.limit)),
})

/**
 * Activité exhaustive de l'hôte dans ce réseau. On épuise successivement live,
 * programmé, terminé — l'ordre utile historique de `listMine` — sur l'index
 * `by_network_host_status`. Une page ne lit qu'un statut et 50 lignes au plus ;
 * un statut entièrement filtré reste traversable par son curseur.
 *
 * ⚠️ Les statuts sont lus par `mineStatusPage`, DANS cette exécution — jamais
 * par sous-requête (voir `mineStatusStream`). Un statut vide fait passer au
 * suivant ; au pire trois lectures, chacune bornée à `limit` lignes.
 */
export async function mineActivityPage(
  ctx: Pick<QueryCtx, "db">,
  networkId: Id<"networks">,
  hostPersonId: Id<"persons">,
  from: DirectMineCursor | undefined,
  limit: number,
): Promise<{ items: DirectMineCardDto[]; nextCursor: DirectMineCursor | null }> {
  let statusIndex = from ? DIRECT_MINE_STATUS_ORDER.indexOf(from.status) : 0
  let cursor: string | null = from?.cursor ?? null

  while (statusIndex < DIRECT_MINE_STATUS_ORDER.length) {
    const status = DIRECT_MINE_STATUS_ORDER[statusIndex]
    if (status === undefined) break
    const page = await mineStatusPage(ctx, networkId, hostPersonId, status, cursor, limit)

    if (!page.isDone) {
      return { items: page.items, nextCursor: { status, cursor: page.continueCursor } }
    }
    statusIndex += 1
    cursor = null
    const nextStatus = DIRECT_MINE_STATUS_ORDER[statusIndex]
    if (page.items.length > 0 || nextStatus === undefined) {
      return { items: page.items, nextCursor: nextStatus === undefined ? null : { status: nextStatus, cursor: null } }
    }
    // Ce statut était vide : passe au suivant, dans la même exécution.
  }
  return { items: [], nextCursor: null }
}

export const listMinePage = networkQuery({
  args: {
    cursor: v.optional(mineCursorValidator),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    items: v.array(directMineCardValidator),
    nextCursor: v.union(mineCursorValidator, v.null()),
  }),
  handler: async (ctx, args) => await mineActivityPage(ctx, ctx.networkId, ctx.person._id, args.cursor, clampDiscoveryLimit(args.limit)),
})

/* ═══════════════════════════════════════════════════════════════════════════
 * LA DÉCOUVERTE — « qu'est-ce qui se joue EN CE MOMENT dans ce réseau ? »
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ L'AUDIENCE N'EST PAS UNE FACETTE D'INDEX, et ne doit pas le devenir : elle
 * se juge PAR LECTEUR, comme une publication du fil. Les deux index de
 * découverte (`by_network_status_startedAt`,
 * `by_network_status_replayStatus_endedAt`) bornent la FENÊTRE au réseau ; ils
 * ne décident jamais qui voit quoi. Le patron est celui de `posts.myFeed`, en
 * trois règles :
 *
 *  1. **SÉLECTION à froid, ENRICHISSEMENT sur la page seulement.** La garde se
 *     juge sur la ligne brute ; profils et compteurs ne sont résolus que pour
 *     les entrées réellement servies.
 *  2. **Les liens sont lus UNE FOIS PAR PAGE**, jamais par candidat : relations,
 *     blocages, pages suivies, invitations — chacun préchargé seulement s'il
 *     n'est pas TRONQUÉ (sinon la décision relit la source par candidat : plus
 *     cher, jamais faux). Seuls l'exclusion et le cercle d'une page signataire
 *     restent par candidat, lus sur les SURVIVANTS des gardes précédentes.
 *  3. **Le curseur s'ancre sur la dernière ligne EXAMINÉE** — jamais sur la
 *     dernière SERVIE, jamais sur la fin de la fenêtre.
 */

/**
 * Fenêtre BRUTE balayée pour composer une page de directs EN COURS. Plus large
 * que la page rendue parce que la sélection (audience, blocage, exclusion)
 * écarte des lignes.
 *
 * ⚠️ Borne ASSUMÉE, au même titre que `FEED_SCAN` : au-delà de 100 directs
 * simultanés, la découverte devient LACUNAIRE pour qui n'a droit qu'à peu
 * d'entre eux. Le jour où ce volume est atteint, la réponse est un index de
 * plus, pas une constante plus haute.
 */
export const LIVE_SCAN = 100
/** Même borne, même raisonnement, pour les replays servables. */
export const REPLAY_SCAN = 100
/** Page par défaut / plafond — mêmes ordres de grandeur que le fil. */
const DISCOVERY_LIMIT_DEFAULT = 20
const DISCOVERY_LIMIT_MAX = 50

/** Le curseur public de `listLive` : la clé d'ordre + la ligne frontière. */
export type DirectLiveCursor = {
  startedAt: number
  sessionId: Id<"liveSessions">
}
/** Le curseur public de `listReplays` — même forme, autre clé d'ordre. */
export type DirectReplayCursor = {
  endedAt: number
  sessionId: Id<"liveSessions">
}

const liveCursorValidator = v.object({
  startedAt: v.number(),
  sessionId: v.id("liveSessions"),
})
const replayCursorValidator = v.object({
  endedAt: v.number(),
  sessionId: v.id("liveSessions"),
})

/**
 * La CARTE de découverte — ce qu'une vignette a besoin d'afficher, et rien de
 * plus.
 *
 * ⚠️ Ni `roomName` (c'est une ADRESSE de salle LiveKit : elle se donne avec le
 * jeton, après SA garde) ni aucun `storageId` — même allowlist que
 * `DirectSessionDto`. Une liste ne distribue pas d'octets.
 */
export type DirectDiscoveryCardDto = {
  sessionId: Id<"liveSessions">
  title: string
  // Le TYPE du domaine, jamais une union recopiée.
  audience: DirectAudience
  stageFormat: "television" | "computer" | "mobile"
  startedAt: number
  /** `displayName: null` = nom neutre (profil non publié) : l'écran le traduit. */
  host: { displayName: string | null; handle: string | null; avatarUrl: string | null }
  counters: {
    /**
     * ⚠️ Les spectateurs ADMIS DEPUIS LE DÉBUT, pas les présents à l'instant —
     * et le nom du champ le dit, délibérément.
     */
    viewerGrantCount: number
    comments: number
    reactions: number
  }
  isHost: boolean
}

export type DirectLiveCardDto = DirectDiscoveryCardDto

/**
 * La carte d'un REPLAY : celle du direct, plus sa fin et sa durée.
 *
 * ⚠️ L'ÉCHÉANCE de conservation N'EST PAS servie ici : la liste EXACTE des clés
 * de cette carte est verrouillée par `discovery.test.ts`. L'échéance est servie
 * là où elle est agissable : `sessions.get` et « Mes conférences ».
 */
export type DirectReplayCardDto = DirectDiscoveryCardDto & {
  endedAt: number
  durationMs: number | null
}

const discoveryCardFields = {
  sessionId: v.id("liveSessions"),
  title: v.string(),
  audience: directAudienceValidator,
  stageFormat: directStageFormatValidator,
  startedAt: v.number(),
  host: v.object({
    displayName: v.union(v.string(), v.null()),
    handle: v.union(v.string(), v.null()),
    avatarUrl: v.union(v.string(), v.null()),
  }),
  counters: v.object({
    viewerGrantCount: v.number(),
    comments: v.number(),
    reactions: v.number(),
  }),
  isHost: v.boolean(),
}
const liveCardValidator = v.object(discoveryCardFields)
const replayCardValidator = v.object({
  ...discoveryCardFields,
  endedAt: v.number(),
  durationMs: v.union(v.number(), v.null()),
})

/** Une page demandée hors bornes est RAMENÉE dedans, jamais rejetée. */
function clampDiscoveryLimit(requested: number | undefined): number {
  return Math.min(Math.max(Math.trunc(requested ?? DISCOVERY_LIMIT_DEFAULT), 1), DISCOVERY_LIMIT_MAX)
}

/**
 * Une session EN COURS dont l'horloge existe.
 *
 * `goLive` écrit `status: "live"` et `startedAt` dans le MÊME patch : un direct
 * live sans heure de début est un état impossible sous le chemin nominal. On
 * l'écarte quand même, et de la fenêtre elle-même (pas de la page) — une ligne
 * sans clé d'ordre ne peut pas porter de curseur.
 */
type StartedSession = Doc<"liveSessions"> & { startedAt: number }
function hasStarted(session: Doc<"liveSessions">): session is StartedSession {
  return session.startedAt !== undefined
}

/** Un replay servable : la session a commencé ET s'est terminée. */
type ReplayableSession = StartedSession & { endedAt: number }
function isReplayable(session: Doc<"liveSessions">): session is ReplayableSession {
  return session.startedAt !== undefined && session.endedAt !== undefined
}

type DiscoveryWindow<S> = { rows: S[]; wasFull: boolean }

/**
 * Une ligne est-elle STRICTEMENT derrière le curseur composite ?
 *
 * Repli du chemin nominal (curseur forgé, ou ligne frontière qui a changé de
 * statut entre deux pages) : la fenêtre est alors prise en `lte` et découpée
 * ici. Même règle de départage que le fil — la clé, puis `_creationTime` (le
 * tie-breaker RÉEL de l'index), puis l'identifiant.
 */
function isAfterDiscoveryCursor(
  row: { _id: Id<"liveSessions">; _creationTime: number },
  rowKey: number,
  cursorKey: number,
  cursorSessionId: Id<"liveSessions">,
  cursorCreationTime: number | undefined,
): boolean {
  if (rowKey !== cursorKey) return rowKey < cursorKey
  if (cursorCreationTime !== undefined && row._creationTime !== cursorCreationTime) {
    return row._creationTime < cursorCreationTime
  }
  return String(row._id) < String(cursorSessionId)
}

/**
 * `_creationTime` de la ligne frontière — le vrai tie-breaker de l'index, que
 * le curseur public ne porte pas.
 *
 * La relecture ne vaut que si la ligne porte TOUJOURS la clé annoncée, DANS CE
 * RÉSEAU : une session passée de `live` à `ended` entre deux pages (ou un
 * curseur forgé vers ailleurs) n'est plus un point de repère valide sur son
 * index, et le repli `lte` reprend la main.
 */
async function resolveCursorCreationTime(
  ctx: Pick<QueryCtx, "db">,
  networkId: Id<"networks">,
  sessionId: Id<"liveSessions">,
  expectedKey: number,
  keyOf: (session: Doc<"liveSessions">) => number | undefined,
): Promise<number | undefined> {
  const session = await ctx.db.get(sessionId)
  if (session === null || session.networkId !== networkId || keyOf(session) !== expectedKey) return undefined
  return session._creationTime
}

/**
 * La fenêtre des directs EN COURS du réseau, du plus récemment commencé au plus
 * ancien.
 *
 * L'index est ordonné par `(networkId, status, startedAt, _creationTime)` : une
 * borne au MILIEU d'un timestamp exige donc deux plages disjointes — la suite
 * du timestamp courant, puis les timestamps plus anciens.
 */
async function liveWindow(
  ctx: Pick<QueryCtx, "db">,
  networkId: Id<"networks">,
  cursor: DirectLiveCursor | undefined,
  cursorCreationTime: number | undefined,
): Promise<DiscoveryWindow<StartedSession>> {
  if (cursor === undefined) {
    const raw = await ctx.db
      .query("liveSessions")
      .withIndex("by_network_status_startedAt", (q) => q.eq("networkId", networkId).eq("status", "live"))
      .order("desc")
      .take(LIVE_SCAN)
    return { rows: raw.filter(hasStarted), wasFull: raw.length === LIVE_SCAN }
  }

  if (cursorCreationTime !== undefined) {
    const tied = await ctx.db
      .query("liveSessions")
      .withIndex("by_network_status_startedAt", (q) =>
        q.eq("networkId", networkId).eq("status", "live").eq("startedAt", cursor.startedAt).lt("_creationTime", cursorCreationTime),
      )
      .order("desc")
      .take(LIVE_SCAN)
    const remaining = LIVE_SCAN - tied.length
    const older =
      remaining === 0
        ? []
        : await ctx.db
            .query("liveSessions")
            .withIndex("by_network_status_startedAt", (q) => q.eq("networkId", networkId).eq("status", "live").lt("startedAt", cursor.startedAt))
            .order("desc")
            .take(remaining)
    const raw = [...tied, ...older]
    return { rows: raw.filter(hasStarted), wasFull: raw.length === LIVE_SCAN }
  }

  const raw = await ctx.db
    .query("liveSessions")
    .withIndex("by_network_status_startedAt", (q) => q.eq("networkId", networkId).eq("status", "live").lte("startedAt", cursor.startedAt))
    .order("desc")
    .take(LIVE_SCAN)
  return {
    rows: raw.filter(hasStarted).filter((session) => isAfterDiscoveryCursor(session, session.startedAt, cursor.startedAt, cursor.sessionId, undefined)),
    wasFull: raw.length === LIVE_SCAN,
  }
}

/**
 * La fenêtre des REPLAYS SERVABLES du réseau — session terminée dont
 * l'enregistrement est prêt, les plus récents d'abord. Même découpe exacte que
 * `liveWindow`, sur `(networkId, status, replayStatus, endedAt, _creationTime)`.
 *
 * `replayStatus: "ready"` est une FACETTE de l'index et non une garde : un
 * replay `pending` ou `failed` n'a rien à servir, ce qui est vrai pour tout le
 * monde — l'hôte compris. Le droit, lui, se juge plus bas, par lecteur.
 */
async function replayWindow(
  ctx: Pick<QueryCtx, "db">,
  networkId: Id<"networks">,
  cursor: DirectReplayCursor | undefined,
  cursorCreationTime: number | undefined,
): Promise<DiscoveryWindow<ReplayableSession>> {
  if (cursor === undefined) {
    const raw = await ctx.db
      .query("liveSessions")
      .withIndex("by_network_status_replayStatus_endedAt", (q) => q.eq("networkId", networkId).eq("status", "ended").eq("replayStatus", "ready"))
      .order("desc")
      .take(REPLAY_SCAN)
    return { rows: raw.filter(isReplayable), wasFull: raw.length === REPLAY_SCAN }
  }

  if (cursorCreationTime !== undefined) {
    const tied = await ctx.db
      .query("liveSessions")
      .withIndex("by_network_status_replayStatus_endedAt", (q) =>
        q.eq("networkId", networkId).eq("status", "ended").eq("replayStatus", "ready").eq("endedAt", cursor.endedAt).lt("_creationTime", cursorCreationTime),
      )
      .order("desc")
      .take(REPLAY_SCAN)
    const remaining = REPLAY_SCAN - tied.length
    const older =
      remaining === 0
        ? []
        : await ctx.db
            .query("liveSessions")
            .withIndex("by_network_status_replayStatus_endedAt", (q) =>
              q.eq("networkId", networkId).eq("status", "ended").eq("replayStatus", "ready").lt("endedAt", cursor.endedAt),
            )
            .order("desc")
            .take(remaining)
    const raw = [...tied, ...older]
    return { rows: raw.filter(isReplayable), wasFull: raw.length === REPLAY_SCAN }
  }

  const raw = await ctx.db
    .query("liveSessions")
    .withIndex("by_network_status_replayStatus_endedAt", (q) =>
      q.eq("networkId", networkId).eq("status", "ended").eq("replayStatus", "ready").lte("endedAt", cursor.endedAt),
    )
    .order("desc")
    .take(REPLAY_SCAN)
  return {
    rows: raw.filter(isReplayable).filter((session) => isAfterDiscoveryCursor(session, session.endedAt, cursor.endedAt, cursor.sessionId, undefined)),
    wasFull: raw.length === REPLAY_SCAN,
  }
}

/**
 * Les liens du lecteur, lus UNE fois par page de découverte (règle 2). Chaque
 * ensemble n'est passé que s'il est COMPLET : tronqué, il est omis, et la
 * décision relit la source par candidat.
 */
async function discoveryFacts(
  ctx: Pick<QueryCtx, "db">,
  network: Doc<"networks">,
  reader: DirectReader,
): Promise<DirectAccessFacts> {
  const [connections, blocked, followedPages, inviteeSessionIds] = await Promise.all([
    acceptedCounterpartIds(ctx, network._id, reader.personId),
    blockedCounterpartIds(ctx, reader.personId),
    followedPageIds(ctx, network, reader.personId),
    readerInviteeSessionIds(ctx, reader),
  ])
  return {
    // L'adhésion du lecteur à CE réseau est prouvée par le constructeur.
    readerIsMember: true,
    ...(connections.truncated ? {} : { connectedHostIds: connections.ids }),
    ...(blocked.truncated ? {} : { blockedHostIds: blocked.ids }),
    ...(followedPages.truncated ? {} : { followedPageIds: followedPages.ids }),
    // `undefined` si l'ensemble aurait été tronqué : la ligne se relit alors par candidat.
    ...(inviteeSessionIds === undefined ? {} : { inviteeSessionIds }),
  }
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LE CURSEUR — rendu dans DEUX cas qui ne se recouvrent pas
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * La fenêtre était PLEINE (il reste peut-être des candidats derrière), ou la
 * boucle est sortie à `limit` (il reste des candidats DEVANT, dans la fenêtre
 * déjà lue mais non parcourue). Une fenêtre partielle ENTIÈREMENT parcourue est
 * le seul cas où l'on peut affirmer qu'il n'y a plus rien : une page COURTE, en
 * revanche, ne prouve rien — la sélection a pu écarter beaucoup.
 *
 * ⚠️ L'ancre est la dernière ligne EXAMINÉE, jamais la dernière SERVIE ni la
 * fin de la fenêtre :
 *
 *  · ancrer sur la fin de la FENÊTRE ferait repartir la page suivante après des
 *    candidats jamais jugés : un trou, silencieux ;
 *  · ancrer sur la dernière ligne SERVIE ferait rendre `null` à une page dont
 *    TOUT a été filtré — et le défilement se refermerait alors qu'il reste des
 *    directs derrière. C'est le cas NORMAL pour qui n'a droit qu'à peu de directs.
 */

/**
 * Les directs EN COURS du réseau que JE peux voir maintenant, les plus
 * récemment commencés d'abord.
 *
 * Tout échec de garde est le même retrait SILENCIEUX de la liste, jamais une
 * erreur : une liste qui refuserait apprendrait l'existence d'un direct réservé.
 */
export const listLive = networkQuery({
  args: {
    cursor: v.optional(liveCursorValidator),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    items: v.array(liveCardValidator),
    nextCursor: v.union(liveCursorValidator, v.null()),
  }),
  handler: async (ctx, args): Promise<{ items: DirectLiveCardDto[]; nextCursor: DirectLiveCursor | null }> => {
    const me = ctx.person._id
    const limit = clampDiscoveryLimit(args.limit)
    const cursor = args.cursor

    // Les liens du lecteur : UNE fois par page (cf. règle 2 de l'en-tête).
    // Ses invitations aussi (ADR-0150, H) — un ancrage sur LUI, jamais une
    // facette d'audience de l'index de découverte.
    const [accessFacts, cursorCreationTime] = await Promise.all([
      discoveryFacts(ctx, ctx.network, directCaller(ctx)),
      cursor === undefined
        ? Promise.resolve(undefined)
        : resolveCursorCreationTime(ctx, ctx.networkId, cursor.sessionId, cursor.startedAt, (session) => (session.status === "live" ? session.startedAt : undefined)),
    ])

    const window = await liveWindow(ctx, ctx.networkId, cursor, cursorCreationTime)

    // ═══ Phase 1 — SÉLECTION, à froid.
    const selected: StartedSession[] = []
    let lastExamined: StartedSession | null = null
    for (const session of window.rows) {
      lastExamined = session
      if ((await directSessionAccessDecision(ctx, me, session, accessFacts)) !== "allowed") continue
      selected.push(session)
      if (selected.length >= limit) break
    }

    // ═══ Phase 2 — ENRICHISSEMENT, sur la PAGE seulement.
    const profileOf = miniProfileCache(ctx)
    const items: DirectLiveCardDto[] = []
    for (const session of selected) {
      items.push(await toDiscoveryCard(ctx, session, me, profileOf))
    }

    const stoppedEarly = selected.length >= limit
    return {
      items,
      nextCursor: (window.wasFull || stoppedEarly) && lastExamined !== null ? { startedAt: lastExamined.startedAt, sessionId: lastExamined._id } : null,
    }
  },
})

/**
 * Les REPLAYS du réseau que JE peux voir maintenant, les plus récemment
 * terminés d'abord.
 *
 * La visibilité effective (`effectiveReplayVisibility`, partagée avec `get` et
 * `setReplayVisibility`) ne peut que RESTREINDRE l'audience de la session : un
 * direct joué devant ses relations ne devient pas public après coup, et un
 * direct public peut s'être refermé après coup.
 *
 * ⚠️ AUCUNE URL de replay ici. Elle sort de `sessions.get`, derrière sa garde :
 * une liste ne distribue pas d'octets — elle dit ce qui existe, la page dit où.
 */
export const listReplays = networkQuery({
  args: {
    cursor: v.optional(replayCursorValidator),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    items: v.array(replayCardValidator),
    nextCursor: v.union(replayCursorValidator, v.null()),
  }),
  handler: async (ctx, args): Promise<{ items: DirectReplayCardDto[]; nextCursor: DirectReplayCursor | null }> => {
    const me = ctx.person._id
    const limit = clampDiscoveryLimit(args.limit)
    const cursor = args.cursor

    const [accessFacts, cursorCreationTime] = await Promise.all([
      discoveryFacts(ctx, ctx.network, directCaller(ctx)),
      cursor === undefined
        ? Promise.resolve(undefined)
        : resolveCursorCreationTime(ctx, ctx.networkId, cursor.sessionId, cursor.endedAt, (session) =>
            session.status === "ended" && session.replayStatus === "ready" ? session.endedAt : undefined,
          ),
    ])

    const window = await replayWindow(ctx, ctx.networkId, cursor, cursorCreationTime)

    const selected: ReplayableSession[] = []
    let lastExamined: ReplayableSession | null = null
    for (const session of window.rows) {
      lastExamined = session
      // Une ancienne ligne `ready` sans échéance est volontairement fermée :
      // le cron la migrera avant qu'une vignette ne révèle son existence.
      if (!isDirectReplayRetained(session)) continue
      if ((await directReplayAccessDecision(ctx, me, session, accessFacts)) !== "allowed") continue
      selected.push(session)
      if (selected.length >= limit) break
    }

    const profileOf = miniProfileCache(ctx)
    const items: DirectReplayCardDto[] = []
    for (const session of selected) {
      items.push({
        ...(await toDiscoveryCard(ctx, session, me, profileOf)),
        endedAt: session.endedAt,
        durationMs: session.replayDurationMs ?? null,
      })
    }

    const stoppedEarly = selected.length >= limit
    return {
      items,
      nextCursor: (window.wasFull || stoppedEarly) && lastExamined !== null ? { endedAt: lastExamined.endedAt, sessionId: lastExamined._id } : null,
    }
  },
})

/**
 * La vignette, composée. ALLOWLISTE stricte — on ÉNUMÈRE les champs servis, on
 * ne retire pas ceux qui gênent : un `...session` amputé laisserait passer le
 * prochain champ sensible ajouté à la table. Les compteurs viennent de
 * `liveSessionCounters` (D28), lus pour les seules lignes servies.
 */
async function toDiscoveryCard(
  ctx: Pick<QueryCtx, "db">,
  session: StartedSession,
  readerPersonId: Id<"persons">,
  profileOf: ReturnType<typeof miniProfileCache>,
): Promise<DirectDiscoveryCardDto> {
  const [host, counts] = await Promise.all([profileOf(session.hostPersonId), sessionCountersOf(ctx, session._id)])
  return {
    sessionId: session._id,
    title: session.title,
    audience: session.audience,
    stageFormat: session.stageFormat ?? "computer",
    startedAt: session.startedAt,
    host: { displayName: host.displayName, handle: host.handle, avatarUrl: host.avatarUrl },
    counters: {
      viewerGrantCount: counts.viewerGrantCount,
      comments: counts.commentCount,
      reactions: counts.reactionCount,
    },
    isHost: session.hostPersonId === readerPersonId,
  }
}
