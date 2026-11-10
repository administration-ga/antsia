// Dupliqué de socle/convex/modules/direct/tables.ts @ ad2e7fdc2 — adaptations : les DOUZE tables `direct_*` (l'en-tête du socle n'en listait que huit) deviennent `live*`, agrégées par `liveTables`, plus une TREIZIÈME, `liveSessionCounters` (D28) ; `networkId` sur chaque table (copié de la session) et en tête des index de lecture « dans ce réseau » (découverte en direct et des rediffusions, « mes conférences », idempotence, « où suis-je invité ») ; personnes (`Id<"persons">`, champs `…PersonId`) ; `pageId` vers la table `pages` du moteur, fil source vers `groupThreads`, annonce vers `posts` ; compteurs `viewerGrantCount`, `viewerPresentCount`, `commentCount` et `reactionCount` SORTIS du document de session — que toute la salle regarde — vers `liveSessionCounters`, écrite par le seul `reap` (D28) ; index renommés au format du moteur (`by_session_person`…) ; index globaux gardés pour les passages système (récolte et révocation `by_status`, purge et réconciliation `by_status_replayStatus_endedAt`, webhook `by_egressId`) ; index neuf `by_page_status` (les conférences d'une page, pour son retrait, V38) ; commentaires rapportés au moteur.
/**
 * Tables du DIRECT (module `convex/modules/live`), agrégées dans
 * `convex/schema.ts` par `liveTables`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LE DIRECT N'EST PAS UN APPEL — tranche à part, `calls` jamais touchée
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Un appel modélise des PARTICIPANTS conviés : un spectateur n'y a pas sa
 * place (des centaines de lignes pour une salle), et lui inventer un rôle
 * « viewer » là-bas dénaturerait toutes les gardes de l'appel. Seul le
 * TRANSPORT LiveKit est partagé (salles, jetons, Egress) — pas le modèle.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LA CONTENTION DICTE LE DÉCOUPAGE (le haut-churn ne partage pas la ligne des
 * données stables)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  · `liveSessions`           — l'état STABLE (statut, audience, replay), que
 *    toute la salle regarde (`sessions.get` est réactif). Il ne s'écrit qu'aux
 *    TRANSITIONS — jamais à l'entrée d'un spectateur, jamais pour un compteur.
 *  · `liveSessionCounters`    — les compteurs agrégés (D28), UNE ligne par
 *    session, écrite par le seul `reap` (et seulement si une valeur change).
 *  · `liveSpeakers`           — les intervenants (≤ 8), écrits à la promotion.
 *  · `liveViewerGrants`       — une ligne par spectateur admis ; une
 *    reconnexion ne consomme jamais une seconde place.
 *  · `liveAntennaRequests` / `liveAntennaInvitations` — intentions durables et
 *    peu fréquentes, séparées des rôles publiants et de la présence SFU.
 *  · `liveBans`, `liveChatMutes` — exclusions et sourdines, levables.
 *  · `liveDelegations`        — les rôles de GESTION délégués par l'hôte.
 *  · `liveInvitees`           — les invités nominatifs.
 *  · `liveComments`           — une ligne par commentaire, append-only.
 *  · `liveReactions`          — une ligne par (session, personne, genre) :
 *    chacun n'incrémente QUE SA ligne. Un compteur partagé ferait de chaque tap
 *    une écriture en conflit OCC avec tous les autres spectateurs.
 *  · `liveHostPresence`       — le bail de l'hôte, une ligne par session.
 *
 * `networkId` est sur chaque ligne (copié de la session à l'écriture) : une
 * session vit dans le réseau où elle est créée, et ses tables filles aussi.
 */
import { defineTable } from "convex/server"
import { v } from "convex/values"

import {
  directAntennaInvitationStatusValidator,
  directAntennaRequestStatusValidator,
  directAudienceValidator,
  directChatModeValidator,
  directCommentStatusValidator,
  directDelegationKindValidator,
  directEndReasonValidator,
  directHostPresenceStateValidator,
  directInviteeStageRoleValidator,
  directReactionKindValidator,
  directReplayCompositionValidator,
  directReplayCaptionsLangValidator,
  directReplayEgressStateValidator,
  directReplayFailureReasonValidator,
  directReplayPublicationValidator,
  directReplayStatusValidator,
  directReplayVisibilityValidator,
  directSpeakerRoleValidator,
  directStageFormatValidator,
  directStageLayoutValidator,
  directStatusValidator,
} from "./validators"

export const liveTables = {
  /**
   * Une session de direct — l'objet STABLE.
   *
   * `audience` est une règle d'accès évaluée à chaque acte (jeton, commentaire,
   * réaction, replay), jamais un état figé : une relation rompue referme le
   * direct qu'elle ouvrait. Elle est IMMUABLE après création — c'est ce qui
   * tient l'invariant « l'annonce garde l'audience exacte de la session » sans
   * synchronisation.
   */
  liveSessions: defineTable({
    networkId: v.id("networks"),
    hostPersonId: v.id("persons"),
    /** Le titre du direct — ce que l'annonce et la page affichent. */
    title: v.string(),
    /** Salle LiveKit (`direct-…`) — préfixe dédié, cf. `buildDirectRoomName`. */
    roomName: v.string(),
    status: directStatusValidator,
    audience: directAudienceValidator,
    /**
     * La PAGE qui signe cette conférence — absente d'un direct personnel.
     *
     * ⚠️ Elle ne remplace pas `hostPersonId` : quelqu'un tient toujours le micro,
     * et c'est lui que la modération, l'exclusion et le blocage visent. La page
     * dit AU NOM DE QUI l'on parle ; l'hôte dit QUI parle.
     *
     * ⚠️ Invariant : l'audience `followers` EXIGE ce champ — sans page, « ses
     * abonnés » ne désignent personne, et la conférence serait invisible de
     * tous, y compris de son hôte.
     */
    pageId: v.optional(v.id("pages")),
    /**
     * Le FIL DE GROUPE d'où la conférence est née (ADR-0150), s'il y en a un.
     *
     * ⚠️ Ce n'est PAS une audience : il ne donne à voir à personne. Il sert une
     * seule question, l'ÉLIGIBILITÉ d'un invité — co-membre vivant de ce fil avec
     * l'hôte, sans être sa relation. Les deux appartenances sont RELUES à chaque
     * fois, jamais héritées.
     */
    sourceThreadId: v.optional(v.id("groupThreads")),
    chatMode: directChatModeValidator,
    /** Le format de la SOURCE émise ; absent se lit `computer` (`normalizeDirectStageFormat`). */
    stageFormat: v.optional(directStageFormatValidator),
    /** La DISPOSITION voulue chez le lecteur ; absente se lit `adaptive`. */
    stageLayout: v.optional(directStageLayoutValidator),
    /**
     * Le PROGRAMME de l'hôte — la personne qu'il met en avant pour toute la
     * salle. Le lecteur suit ce choix, SAUF s'il a épinglé quelqu'un localement.
     * Absent : personne n'est mis en avant.
     */
    spotlightPersonId: v.optional(v.id("persons")),
    /** Plafond de spectateurs — borné par `DIRECT_MAX_VIEWERS_CAP` au domaine. */
    maxViewers: v.number(),
    /**
     * L'ANNONCE éventuelle sur le fil (`posts`). Une référence, jamais un
     * contenu : la carte du fil relit la publication avec sa garde.
     */
    announcePostId: v.optional(v.id("posts")),
    /**
     * ── REPLAY (Egress LiveKit) ──
     * `replayRequested` est le choix du créateur ; le reste est piloté par
     * l'Egress via le webhook (`directs/{sessionId}.mp4`).
     */
    replayRequested: v.boolean(),
    egressId: v.optional(v.string()),
    replayStatus: v.optional(directReplayStatusValidator),
    /**
     * L'état de la CAPTURE (D-12). Son absence se lit « demandé ».
     * ⚠️ N'écrire que sur TRANSITION (`replay.markEgressState`) : un champ qui se
     * réécrirait à chaque `egress_updated` réveillerait chaque spectateur pour rien.
     */
    replayEgressState: v.optional(directReplayEgressStateValidator),
    /** POURQUOI aucun fichier ne sera produit, quand LiveKit l'a dit. */
    replayFailureReason: v.optional(directReplayFailureReasonValidator),
    /** La composition demandée à l'Egress — décision photographiée. */
    replayComposition: v.optional(directReplayCompositionValidator),
    /**
     * La PUBLICATION de la rediffusion — ce que l'hôte en a décidé une fois la
     * conférence terminée (ADR-0158). Posée `undecided` au passage en direct ;
     * absente, elle se lit `published` (`effectiveReplayPublication`).
     *
     * ⚠️ Ce n'est PAS `replayVisibility` : celle-ci dit QUI, dans l'audience,
     * peut revoir ; celle-là dit SI l'audience y a droit.
     */
    replayPublication: v.optional(directReplayPublicationValidator),
    replayStorageId: v.optional(v.id("_storage")),
    /** Piste WebVTT éventuelle, soumise à la MÊME échéance que la vidéo. */
    replayCaptionsStorageId: v.optional(v.id("_storage")),
    /** La LANGUE de cette piste, déclarée par l'hôte à l'importation. */
    replayCaptionsLang: v.optional(directReplayCaptionsLangValidator),
    replayDurationMs: v.optional(v.number()),
    /** Échéance matérialisée au succès Egress ; absente = lecture refusée. */
    replayRetentionUntil: v.optional(v.number()),
    /** Audit de la suppression effective des blobs. */
    replayPurgedAt: v.optional(v.number()),
    /**
     * Visibilité du replay — absente = l'audience de la session. Ne peut QUE
     * restreindre (`public` → `connections`), jamais élargir.
     */
    replayVisibility: v.optional(directReplayVisibilityValidator),
    /**
     * Tirée AU MONTAGE du dialogue de création, jamais à l'envoi : sans elle, un
     * renvoi après expiration réseau ouvrirait deux directs identiques.
     */
    idempotencyKey: v.optional(v.string()),
    createdAt: v.number(),
    startedAt: v.optional(v.number()),
    endedAt: v.optional(v.number()),
    /** POURQUOI elle s'est terminée (D-14) — absente : terminée sans raison connue. */
    endReason: v.optional(directEndReasonValidator),
    updatedAt: v.number(),
  })
    // « Mes conférences » DANS CE RÉSEAU, par statut, les plus récentes d'abord.
    .index("by_network_host_status", ["networkId", "hostPersonId", "status"])
    // Le rejeu d'une création (idempotence), dans le réseau où elle a eu lieu.
    .index("by_network_host_idempotencyKey", ["networkId", "hostPersonId", "idempotencyKey"])
    // Les passages SYSTÈME, tous réseaux : récolte (cron), révocations.
    .index("by_status", ["status"])
    /**
     * La DÉCOUVERTE : « qu'est-ce qui se joue en ce moment dans ce réseau ? »,
     * les plus récemment commencés d'abord.
     *
     * ⚠️ L'AUDIENCE n'est pas une facette, et ne doit pas le devenir : une session
     * ouverte aux relations se juge PAR LECTEUR (relation, blocage, exclusion),
     * exactement comme une publication du fil. L'index borne la fenêtre, il ne
     * décide jamais qui voit quoi.
     */
    .index("by_network_status_startedAt", ["networkId", "status", "startedAt"])
    // Les REPLAYS servables d'un réseau, les plus récents d'abord (même règle : la visibilité se rejuge par lecteur).
    .index("by_network_status_replayStatus_endedAt", ["networkId", "status", "replayStatus", "endedAt"])
    // La purge et la réconciliation des rediffusions, tous réseaux (crons).
    .index("by_status_replayStatus_endedAt", ["status", "replayStatus", "endedAt"])
    // Corrélation du webhook Egress — le chemin du fichier porte la session, l'évènement porte l'egressId.
    .index("by_egressId", ["egressId"])
    // Les conférences d'une PAGE, par statut : son retrait les ferme sans balayer tout le direct (V38).
    .index("by_page_status", ["pageId", "status"]),

  /**
   * Les COMPTEURS d'une session (D28) — UNE ligne par session, hors du document
   * que toute la salle regarde.
   *
   * ⚠️ ÉCRIVAIN UNIQUE : `reap` (la recomposition périodique et celle des
   * transitions), et seulement si une valeur change. Aucune mutation chaude ne
   * l'écrit — ni l'admission d'un spectateur, ni un commentaire, ni une réaction.
   * Ligne absente = tout à zéro (`access.sessionCountersOf`).
   *
   *  · `viewerGrantCount`   — spectateurs DISTINCTS admis depuis le début : il ne
   *    redescend JAMAIS (source : l'agrégat `live.viewerGrants:<session>`) ;
   *  · `viewerPresentCount` — présents à la dernière recomposition (source :
   *    `access.countPresentViewers`, la même lecture que l'admission) ;
   *  · `commentCount`, `reactionCount` — recomposés des tables filles.
   */
  liveSessionCounters: defineTable({
    networkId: v.id("networks"),
    sessionId: v.id("liveSessions"),
    viewerGrantCount: v.number(),
    viewerPresentCount: v.number(),
    commentCount: v.number(),
    reactionCount: v.number(),
    updatedAt: v.number(),
  }).index("by_session", ["sessionId"]),

  /**
   * Un INTERVENANT — l'hôte et les personnes promues, HUIT au plus (hôte
   * compris, `DIRECT_MAX_SPEAKERS`). Le spectateur n'a JAMAIS de ligne ici.
   *
   * La rétrogradation est une date (`removedAt`), pas une suppression : la
   * ligne garde la trace de qui a parlé, et une re-promotion la ROUVRE.
   *
   * `grantEpoch`/`sfuAppliedAt` : la base durable décide, le SFU suit.
   * Chaque changement de rôle incrémente l'époque ; `sfuAppliedAt` n'est posé
   * que si `updateParticipant` a réussi POUR CETTE époque.
   */
  liveSpeakers: defineTable({
    networkId: v.id("networks"),
    sessionId: v.id("liveSessions"),
    personId: v.id("persons"),
    role: directSpeakerRoleValidator,
    grantEpoch: v.number(),
    /** Quand le SFU a reflété `grantEpoch` — absent si le filet TTL a dû jouer. */
    sfuAppliedAt: v.optional(v.number()),
    addedAt: v.number(),
    /** Rétrogradé : plus intervenant, mais la trace demeure. */
    removedAt: v.optional(v.number()),
  })
    .index("by_session_person", ["sessionId", "personId"])
    // Les intervenants VIVANTS d'une session, sans balayage des rétrogradés.
    .index("by_session_removedAt", ["sessionId", "removedAt"]),

  /**
   * L'ACCORD EXPLICITE et horodaté d'une personne à l'enregistrement d'un
   * direct (DL-02, décision du propriétaire du 9/11/2026) — UNE ligne par
   * (session, personne), jamais réécrite : rejouer l'accord rend la ligne
   * existante.
   *
   * Exigé, quand la session est enregistrée (`replayRequested`), avant toute
   * place à l'antenne (`speakers.promoteSpeakerRow`) et avant tout jeton
   * d'intervenant (`access.authorizeToken`). L'hôte le donne en cochant
   * « Enregistrer » à la création.
   *
   * Donnée personnelle de la personne (`personId`) : exportée et effacée avec
   * elle (`people/dataPolicies.ts`). Elle dure autant que la rediffusion :
   * purgée quand celle-ci est retirée ou expire, ou quand la session se
   * termine sans avoir jamais été enregistrée (`recordingConsent.ts`).
   */
  liveRecordingConsents: defineTable({
    networkId: v.id("networks"),
    sessionId: v.id("liveSessions"),
    personId: v.id("persons"),
    acceptedAt: v.number(),
  }).index("by_session_person", ["sessionId", "personId"]),

  /**
   * Une admission SPECTATEUR durable pour la session — ET son bail de présence.
   *
   * Le jeton LiveKit expire et peut devoir être redemandé (réseau, recharge,
   * changement d'onglet) : cette ligne idempotente évite qu'une reconnexion
   * compte une seconde personne ou prenne une seconde place.
   *
   * ⚠️ LE BAIL VIT ICI. Le battement d'un spectateur n'écrit QUE SA ligne,
   * jamais `liveSessions` (dont chaque écriture réveille toute la salle). Deux
   * onglets d'une même personne sont dédoublonnés PAR CONSTRUCTION : ils
   * écrivent la même ligne.
   */
  liveViewerGrants: defineTable({
    networkId: v.id("networks"),
    sessionId: v.id("liveSessions"),
    personId: v.id("persons"),
    firstGrantedAt: v.number(),
    lastGrantedAt: v.number(),
    /**
     * Dernier battement REÇU, posé aussi à l'admission : un jeton émis RÉSERVE
     * la place le temps d'ouvrir la salle. Absent = PAS présent (`isViewerPresent`).
     */
    lastSeenAt: v.optional(v.number()),
    /** Départ VOLONTAIRE (`presence.leave`) — absent = jamais parti, ou revenu. */
    leftAt: v.optional(v.number()),
  })
    .index("by_session_person", ["sessionId", "personId"])
    /**
     * Les présents d'une session, en une lecture BORNÉE (`lastSeenAt ≥ now − TTL`,
     * `.take(DIRECT_MAX_VIEWERS_CAP + 1)`) : `access.countPresentViewers`, que
     * l'admission ET la recomposition lisent. Les lignes sans `lastSeenAt` sont
     * HORS de toute borne `.gte(…)` : jamais comptées présentes.
     */
    .index("by_session_lastSeenAt", ["sessionId", "lastSeenAt"]),

  /** Une main levée durable par spectateur et direct. */
  liveAntennaRequests: defineTable({
    networkId: v.id("networks"),
    sessionId: v.id("liveSessions"),
    personId: v.id("persons"),
    status: directAntennaRequestStatusValidator,
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_session_person", ["sessionId", "personId"])
    .index("by_session_status_updatedAt", ["sessionId", "status", "updatedAt"]),

  /** Une invitation durable par personne et direct, sans révéler de présence SFU. */
  liveAntennaInvitations: defineTable({
    networkId: v.id("networks"),
    sessionId: v.id("liveSessions"),
    inviterPersonId: v.id("persons"),
    inviteePersonId: v.id("persons"),
    status: directAntennaInvitationStatusValidator,
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_session_invitee", ["sessionId", "inviteePersonId"])
    .index("by_session_status_updatedAt", ["sessionId", "status", "updatedAt"]),

  /**
   * Une EXCLUSION durable, LEVABLE (D-11), toujours par SESSION — un nouveau
   * direct repart sans exclus. `liftedAt` la neutralise sans l'effacer.
   *
   * ⚠️ La ligne est UNIQUE par (session, personne) — `by_session_banned` est lu
   * en `.unique()`. Réintégrer puis ré-exclure ROUVRE la même ligne.
   */
  liveBans: defineTable({
    networkId: v.id("networks"),
    sessionId: v.id("liveSessions"),
    bannedPersonId: v.id("persons"),
    /** Qui a exclu — l'hôte ou un délégué portant `exclude`, gardé pour l'audit. */
    byPersonId: v.id("persons"),
    createdAt: v.number(),
    /** Quand l'exclusion a été LEVÉE — absente = exclusion en vigueur. */
    liftedAt: v.optional(v.number()),
    /** Qui l'a levée. Même exigence d'audit que `byPersonId`. */
    liftedByPersonId: v.optional(v.id("persons")),
  }).index("by_session_banned", ["sessionId", "bannedPersonId"]),

  /**
   * Les rôles de GESTION délégués par l'hôte (D-11, ADR-0144).
   *
   * ⚠️ Table à part, et jamais une colonne de `liveSpeakers` : le rôle publiant
   * et le rôle de gestion sont deux questions. La révocation est une DATE
   * (`revokedAt`) ; ré-accorder ROUVRE la même ligne (`.unique()`).
   */
  liveDelegations: defineTable({
    networkId: v.id("networks"),
    sessionId: v.id("liveSessions"),
    personId: v.id("persons"),
    kind: directDelegationKindValidator,
    /** Accepter une main, inviter, rétrograder. */
    canAdmitToStage: v.boolean(),
    /** Exclure ET réintégrer — qui ferme la porte doit pouvoir la rouvrir. */
    canExclude: v.boolean(),
    /** Terminer la conférence. */
    canEndOrTransfer: v.boolean(),
    /** L'hôte, toujours : `delegate` ne se délègue pas. Gardé pour l'audit. */
    grantedByPersonId: v.id("persons"),
    grantedAt: v.number(),
    /** Révoquée : la ligne ne donne plus rien, la trace demeure. */
    revokedAt: v.optional(v.number()),
  })
    .index("by_session_person", ["sessionId", "personId"])
    // Les délégations VIVANTES d'une session, sans balayer les révoquées.
    .index("by_session_revokedAt", ["sessionId", "revokedAt"]),

  /**
   * Les INVITÉS NOMINATIFS d'une conférence (ADR-0150).
   *
   * ⚠️ Une TABLE, jamais un tableau sur `liveSessions` : toute la salle est
   * abonnée à la session, et réécrire une liste à chaque ajout réveillerait
   * chaque spectateur.
   *
   * Ce que la ligne DONNE : voir la conférence (elle franchit `public`,
   * `connections` et `invitees`, jamais `followers`), et, pour
   * `stageRole: speaker`, une promotion à l'antenne au passage en live. Ce
   * qu'elle ne donne JAMAIS : franchir un blocage, une exclusion, ni un départ
   * du réseau — la décision les relit à chaque acte.
   */
  liveInvitees: defineTable({
    networkId: v.id("networks"),
    sessionId: v.id("liveSessions"),
    personId: v.id("persons"),
    /** Qui a invité — l'hôte, ou qui portait `changeAudienceOrReplay`. */
    invitedByPersonId: v.id("persons"),
    stageRole: directInviteeStageRoleValidator,
    createdAt: v.number(),
    /** Quand la cloche `live_invite` a sonné pour cette ligne. Absent : pas encore sonné. */
    notifiedAt: v.optional(v.number()),
    /** Retiré : la ligne ne donne plus rien, la trace demeure. */
    revokedAt: v.optional(v.number()),
  })
    .index("by_session_person", ["sessionId", "personId"])
    // Les invités VIVANTS d'une session, sans balayer les retirés.
    .index("by_session_revokedAt", ["sessionId", "revokedAt"])
    /**
     * « Où suis-je invité DANS CE RÉSEAU ? » — un ANCRAGE sur le lecteur, pas une
     * facette d'audience : la découverte y précharge UNE fois par page les
     * sessions où le lecteur est invité vivant.
     */
    .index("by_network_person_revokedAt", ["networkId", "personId", "revokedAt"]),

  /**
   * La SOURDINE de conversation d'une personne (D-11) — à ne pas confondre avec
   * `chatMode: "closed"`, qui ferme la conversation pour TOUT LE MONDE. Même
   * forme que l'exclusion : une ligne unique par (session, personne).
   */
  liveChatMutes: defineTable({
    networkId: v.id("networks"),
    sessionId: v.id("liveSessions"),
    personId: v.id("persons"),
    /** Qui a coupé le chat — hôte ou délégué. */
    byPersonId: v.id("persons"),
    createdAt: v.number(),
    liftedAt: v.optional(v.number()),
    liftedByPersonId: v.optional(v.id("persons")),
  }).index("by_session_person", ["sessionId", "personId"]),

  /**
   * Un COMMENTAIRE du direct — PERSISTÉ (jamais un canal de données : le
   * spectateur n'en a pas, et un commentaire doit survivre pour le replay).
   * `offsetMs` le cale sur la timeline de l'enregistrement.
   */
  liveComments: defineTable({
    networkId: v.id("networks"),
    sessionId: v.id("liveSessions"),
    authorPersonId: v.id("persons"),
    body: v.string(),
    status: directCommentStatusValidator,
    /** Position dans le replay : `createdAt - session.startedAt`, calculée au serveur. */
    offsetMs: v.number(),
    createdAt: v.number(),
    removedAt: v.optional(v.number()),
  }).index("by_session_createdAt", ["sessionId", "createdAt"]),

  /**
   * Les RÉACTIONS d'une personne à une session — UNE ligne par (session,
   * personne, genre), qui porte SON compteur. Sur le chemin chaud, chacun
   * n'écrit QUE sa propre ligne ; le total est recomposé par `reap`.
   */
  liveReactions: defineTable({
    networkId: v.id("networks"),
    sessionId: v.id("liveSessions"),
    personId: v.id("persons"),
    kind: directReactionKindValidator,
    /** Le nombre de fois où CETTE personne a envoyé CE genre. */
    count: v.number(),
    updatedAt: v.number(),
  })
    // Unicité et incrément en un seul coup.
    .index("by_session_person_kind", ["sessionId", "personId", "kind"])
    // Recomposition des totaux par `reap`.
    .index("by_session", ["sessionId"]),

  /**
   * Le BAIL DE PRÉSENCE DE L'HÔTE — UNE ligne par session (D-14), réécrite,
   * jamais empilée. Il vit ici, où personne n'est abonné sauf qui demande
   * explicitement la présence : `liveSessions` n'est jamais écrite par un battement.
   */
  liveHostPresence: defineTable({
    networkId: v.id("networks"),
    sessionId: v.id("liveSessions"),
    /** L'hôte AU MOMENT du battement — redondant avec la session, et c'est voulu. */
    hostPersonId: v.id("persons"),
    state: directHostPresenceStateValidator,
    /** Dernier battement REÇU — l'instant, pas la promesse. */
    lastSeenAt: v.number(),
    /** Jusqu'à quand ce battement vaut présence (`lastSeenAt + LEASE`). */
    leaseUntil: v.number(),
    /** Quand l'absence a été CONSTATÉE — posé par la récolte, jamais par le client. */
    absentSince: v.optional(v.number()),
    updatedAt: v.number(),
  }).index("by_session", ["sessionId"]),
}
