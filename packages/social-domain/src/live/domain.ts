// Dupliqué de socle/convex/modules/direct/domain.ts @ ad2e7fdc2 — adaptations : module PUR sorti du backend vers le domaine (importable par le front sans `convex/`) ; plafonds de la salle (`DIRECT_MAX_SPEAKERS`, `DIRECT_DEFAULT_MAX_VIEWERS`, `DIRECT_MAX_VIEWERS_CAP`) posés ICI — le domaine n'importe rien du backend — et réexportés par `convex/modules/live/grants.ts` ; audience « organisation » → `followers`, les abonnés et signataires vivants de la PAGE qui signe la conférence (V40) : même verrou de rediffusion (aucune autre visibilité, on n'y entre pas par la copie) ; vocabulaires posés en listes `as const`, source unique des validateurs du backend (audiences, statuts, bail et état de l'hôte, fins, conversation, disposition, rôles, invitations, commentaires, rediffusion) et décision de l'hôte sur l'enregistrement listée ; phrases de refus remplacées par `DomainViolation` (codes `LIVE_*` et bornes, texte dans les locales de l'écran) — `DirectViolation`, `tooManyInviteesMessage` et `tooManySpeakerInviteesMessage` retirés ; invités désignés par une PERSONNE (`personId`) ; commentaires rapportés au moteur (tables `live*`, compteurs hors de la session) ; DL-02 : durée de conservation des rediffusions posée ICI en jours (`DIRECT_REPLAY_RETENTION_DAYS`, annoncée par l'écran du consentement) et dérivée par `convex/modules/live/retention.ts`.
/**
 * Le DOMAINE du direct — règles PURES, sans I/O, sans Convex.
 *
 * Même doctrine que le reste du domaine : le domaine juge, le bord traduit
 * (`checked`/`rethrowDomain` → `invalidArgument` portant le code de la règle).
 * Les grants et identités LiveKit vivent dans `convex/modules/live/grants.ts` ;
 * les PLAFONDS de la salle vivent ici, parce que les règles métier de la
 * session en ont besoin et que le domaine n'importe rien du backend.
 */
import { DomainViolation } from "../violation"

/** Plafond d'intervenants, HÔTE COMPRIS. Au-delà, la scène devient une réunion. */
export const DIRECT_MAX_SPEAKERS = 8

/** Plafond par défaut de spectateurs d'une session. */
export const DIRECT_DEFAULT_MAX_VIEWERS = 200

/** Plafond ABSOLU de spectateurs — un créateur ne peut pas demander plus. */
export const DIRECT_MAX_VIEWERS_CAP = 1000

export const DIRECT_TITLE_MAX_LENGTH = 120
export const DIRECT_COMMENT_MAX_LENGTH = 500
/**
 * La file de commentaires affichée : les 40 derniers vivants. Ici (module
 * PUR) et non dans `comments.ts` : le client aligne sa constante sur
 * celle-ci par test, et un module qui enregistre des fonctions Convex ne
 * s'importe pas d'un test client.
 */
export const DIRECT_COMMENTS_WINDOW = 40
/** Borne basse annoncée lorsque la fenêtre de recomptage est saturée. */
export const AGGREGATE_COMMENTS_SCAN = 1000
/** Une rafale de réactions ne crédite jamais plus — re-borné serveur. */
export const DIRECT_REACTION_BURST_MAX = 12

/** Une session `scheduled` jamais démarrée est récoltée au bout de 24 h. */
export const DIRECT_SCHEDULED_MAX_AGE_MS = 24 * 60 * 60_000
/**
 * Une session `live` depuis plus de 4 h est un fantôme (onglet fermé sans
 * terminer) — même plafond que les appels, dont le cron `reapStaleDirects`
 * est le miroir.
 */
export const DIRECT_LIVE_MAX_DURATION_MS = 4 * 60 * 60_000
/**
 * Conservation d'une rediffusion, en JOURS (DL-02) — posée ici parce que
 * l'écran l'ANNONCE à qui accepte d'être enregistré ; le backend en dérive
 * son échéance (`convex/modules/live/retention.ts`). Une seule valeur, sans
 * quoi la promesse affichée et la purge réelle divergeraient.
 */
export const DIRECT_REPLAY_RETENTION_DAYS = 90

/**
 * Cycle de vie d'une session :
 *  · `scheduled` — créée, pas encore commencée. AUCUNE notification n'est
 *    émise à ce stade (la cloche sonne au DÉMARRAGE, jamais à la
 *    programmation) ;
 *  · `live`      — en cours, seule phase où un jeton spectateur s'émet ;
 *  · `ended`     — terminée. Le replay, s'il existe, prend le relais.
 */
export const DIRECT_STATUSES = ["scheduled", "live", "ended"] as const
export type DirectStatus = (typeof DIRECT_STATUSES)[number]

/**
 * Le chat du direct : ouvert à l'audience, ou fermé (personne n'écrit, pas
 * même l'hôte — un direct « antenne seule »).
 */
export const DIRECT_CHAT_MODES = ["open", "closed"] as const
export type DirectChatMode = (typeof DIRECT_CHAT_MODES)[number]

/**
 * Disposition de la scène chez le LECTEUR — un choix de l'hôte, pas un ratio :
 * toujours les huit places de l'antenne (`fixed`), ou mesurée sur le conteneur
 * du lecteur (`adaptive`, le défaut). À ne pas confondre avec le FORMAT de la
 * source émise (`replayComposition.DirectStageFormat`).
 */
export const DIRECT_STAGE_LAYOUTS = ["adaptive", "fixed"] as const
export type DirectStageLayout = (typeof DIRECT_STAGE_LAYOUTS)[number]

/**
 * Rôle d'un INTERVENANT (table `liveSpeakers`). Le spectateur n'y figure
 * jamais : il n'a pas de ligne durable, seulement un jeton borné (1 h).
 */
export const DIRECT_SPEAKER_ROLES = ["host", "speaker"] as const
export type DirectSpeakerRole = (typeof DIRECT_SPEAKER_ROLES)[number]

/**
 * Statut d'un commentaire — retiré, pas supprimé (même règle que le fil).
 *
 * DL-03 : `pending_review` = RETENU par la règle de relecture du réseau
 * (`moderateContentWrite`, surface `liveComment`), comme un commentaire du fil :
 * visible de son seul auteur, absent des compteurs de la salle, jusqu'à la
 * décision (admis → `published`, refusé → `removed`).
 */
export const DIRECT_COMMENT_STATUSES = ["published", "pending_review", "removed"] as const
export type DirectCommentStatus = (typeof DIRECT_COMMENT_STATUSES)[number]

/* ═══════════════════════════════════════════════════════════════════════════
 * LE BAIL DE PRÉSENCE DE L'HÔTE (D-14)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Le direct ne savait qu'une chose : l'âge de `startedAt`. Un hôte dont
 * l'onglet meurt laissait donc « En direct » quatre heures, et un direct
 * VIVANT de 4 h 01 était coupé. Le module refusait tout battement — à raison :
 * écrire `liveSessions` toutes les 15 s réveillerait TOUTES les
 * souscriptions des spectateurs. Le bail vit donc dans SA table
 * (`liveHostPresence`, index `by_session`) : le chemin chaud n'écrit
 * jamais la session.
 *
 * ⚠️ Ces trois durées forment un contrat : le client bat plus vite que le
 * bail ne s'éteint (15 s < 30 s), et la grâce absorbe ce que le bail ne
 * pardonne pas — un onglet mobile en arrière-plan, une bascule 4G, un tunnel.
 * Réduire la grâce sans MESURER ces cas transforme une reconnexion en fin de
 * conférence. La présence des spectateurs reprend cette FORME : mêmes
 * noms (`leaseUntil`), mêmes ordres de grandeur.
 */
/** Durée de vie d'un battement : au-delà, l'hôte n'est plus « vu ». */
export const DIRECT_HOST_LEASE_MS = 30_000
/** Ce qu'on attend APRÈS le bail avant de déclarer la conférence finie. */
export const DIRECT_HOST_GRACE_MS = 120_000
/** Cadence du battement client — la moitié du bail, une perte est rattrapable. */
export const DIRECT_HOST_HEARTBEAT_MS = 15_000

/**
 * L'état du bail tel que le CLIENT le déclare (`connected`/`reconnecting`) ou
 * tel que la récolte le CONSTATE (`absent`, une fois le bail éteint).
 */
export const DIRECT_HOST_LEASE_STATES = ["connected", "reconnecting", "absent"] as const
export type DirectHostLeaseState = (typeof DIRECT_HOST_LEASE_STATES)[number]

/** Ce que le client a le droit de DÉCLARER — `absent` ne se déclare pas. */
export const DIRECT_HOST_HEARTBEAT_STATES = ["connected", "reconnecting"] as const satisfies readonly DirectHostLeaseState[]
export type DirectHostHeartbeatState = (typeof DIRECT_HOST_HEARTBEAT_STATES)[number]

/**
 * Ce que l'écran a le droit de DIRE de l'hôte. `unknown` n'est pas une panne :
 * c'est une session dont personne ne bat (client ancien, hôte jamais entré) —
 * la règle des 4 h y reste seule juge (fail-open assumé, cf. `reap.ts`).
 */
export const DIRECT_HOST_STATES = ["on_air", "reconnecting", "interrupted", "unknown"] as const
export type DirectHostState = (typeof DIRECT_HOST_STATES)[number]

/**
 * La raison pour laquelle une session s'est terminée — jamais devinée.
 *
 *  · `host`          — l'hôte a cliqué « Terminer » ;
 *  · `host_absent`   — bail éteint, grâce écoulée (la récolte a tranché) ;
 *  · `max_duration`  — limite absolue de 4 h atteinte ;
 *  · `never_started` — `scheduled` oublié plus de 24 h ;
 *  · `revoked`       — la page qui la signait a été retirée.
 */
export const DIRECT_END_REASONS = ["host", "host_absent", "max_duration", "never_started", "revoked"] as const
export type DirectEndReason = (typeof DIRECT_END_REASONS)[number]

/** La ligne de bail, réduite à ce dont la décision a besoin. */
export type DirectHostLease = {
  state: DirectHostLeaseState
  lastSeenAt: number
  leaseUntil: number
  absentSince?: number
}

/** Ce que `hostPresence.presence` rend, et que le client re-dérive à sa montre. */
export type DirectHostPresenceView = {
  hostState: DirectHostState
  since: number | null
  graceUntil: number | null
}

/**
 * L'état de l'hôte, DÉRIVÉ — règle unique, partagée par la query de présence,
 * la récolte et le client.
 *
 * ⚠️ Le serveur n'en rend qu'un INSTANTANÉ : une query Convex ne re-tourne pas
 * parce que l'horloge avance. C'est le client qui re-dérive à chaque tick, sur
 * les faits bruts du bail — sinon un hôte disparu resterait « En direct » à
 * l'écran jusqu'à la prochaine écriture.
 */
export function deriveDirectHostState(
  lease: DirectHostLease | null,
  now: number,
): DirectHostPresenceView {
  if (lease === null) {
    return { hostState: "unknown", since: null, graceUntil: null }
  }
  const graceUntil = lease.leaseUntil + DIRECT_HOST_GRACE_MS
  // Bail éteint OU absence constatée : interrompu. Le statut MÉTIER, lui,
  // reste `live` tant que la grâce court — interrompu n'est pas terminé.
  if (lease.state === "absent" || lease.leaseUntil < now) {
    return {
      hostState: "interrupted",
      since: lease.absentSince ?? lease.leaseUntil,
      graceUntil,
    }
  }
  if (lease.state === "reconnecting") {
    return { hostState: "reconnecting", since: lease.lastSeenAt, graceUntil }
  }
  return { hostState: "on_air", since: lease.lastSeenAt, graceUntil: null }
}

/**
 * La grâce est-elle ÉCOULÉE — la seule question que se pose la récolte.
 * Sans bail, la réponse est NON : on ne termine pas une session parce qu'un
 * client ancien ne sait pas battre.
 */
export function directHostGraceElapsed(
  lease: DirectHostLease | null,
  now: number,
): boolean {
  if (lease === null) return false
  return lease.leaseUntil + DIRECT_HOST_GRACE_MS < now
}

/**
 * L'échéance ABSOLUE d'une session — annoncée à l'écran, avant et pendant son
 * approche. `null` tant que rien n'a commencé : on n'annonce pas la fin de ce
 * qui n'a pas débuté.
 */
export function directMaxDurationAt(startedAt: number | null | undefined): number | null {
  if (startedAt === null || startedAt === undefined) return null
  return startedAt + DIRECT_LIVE_MAX_DURATION_MS
}

/* ═══════════════════════════════════════════════════════════════════════════
 * LA PRÉSENCE DES SPECTATEURS (D-09)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * « 200 spectateurs » voulait dire « 200 personnes admises DEPUIS LE DÉBUT » :
 * aucun départ n'était jamais décompté (pas de webhook LiveKit de participant,
 * pas de battement spectateur, pas de `leave`), et le 201ᵉ visiteur se voyait
 * refuser une salle vide.
 *
 * La correction reprend la FORME du bail de l'hôte, sur la ligne qui existait
 * déjà (`liveViewerGrants`) : un battement toutes les 30 s, valable 90 s.
 * Le rapport est le même que côté hôte (battre DEUX fois plus vite que le bail
 * ne s'éteint), avec une marge de plus : un onglet mobile en arrière-plan est
 * throttlé, et perdre sa place pour un feu rouge serait pire que la compter
 * une minute de trop.
 *
 * ⚠️ « Admis » et « en ligne » restent DEUX nombres, et les deux comptent :
 * `viewerGrantCount` (personnes distinctes admises, ne redescend jamais) et
 * `viewerPresentCount` (présents à l'instant) — tous deux dans
 * `liveSessionCounters`, hors du document de session (D28). Servir le premier
 * sous le nom du second est exactement le défaut que ce lot répare.
 */
/** Un battement vaut présence pendant 90 s — au-delà, la place se libère. */
export const DIRECT_PRESENCE_TTL_MS = 90_000
/** Cadence du battement client — le TIERS du bail : deux pertes se rattrapent. */
export const DIRECT_PRESENCE_HEARTBEAT_MS = 30_000

/** La ligne d'admission, réduite à ce que la présence demande. */
export type DirectViewerPresenceFacts = {
  lastSeenAt?: number | undefined
  leftAt?: number | undefined
}

/**
 * Cette admission vaut-elle une présence MAINTENANT ?
 *
 * Trois façons de ne pas être là, et une seule d'y être :
 *  · parti volontairement (`leftAt`) — le départ est immédiat, sans attendre ;
 *  · jamais battu (`lastSeenAt` absent) — un jeton obtenu par quelqu'un dont
 *    la salle ne s'est jamais ouverte ;
 *  · battu il y a plus de 90 s — l'onglet est mort, la place revient à la file.
 *
 * ⚠️ Règle PURE et unique : l'agrégateur, l'admission et le client s'y
 * adossent. Deux règles diverger, ce serait une salle pleine pour l'un et
 * libre pour l'autre au même instant.
 */
export function isViewerPresent(
  grant: DirectViewerPresenceFacts,
  now: number,
): boolean {
  if (grant.leftAt !== undefined) return false
  if (grant.lastSeenAt === undefined) return false
  return now - grant.lastSeenAt <= DIRECT_PRESENCE_TTL_MS
}

/* ═══════════════════════════════════════════════════════════════════════════
 * L'INVITATION À L'ANTENNE QUI RESTE SANS RÉPONSE (D-10)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Une invitation `pending` ne consomme aucune place — la capacité de
 * l'antenne se lit sur `liveSpeakers` vivants. Mais elle occupe la console
 * de l'hôte, et surtout elle PROMET encore une place à quelqu'un qui n'a rien
 * répondu depuis une heure de conférence. Passé ce délai, elle vaut `expired` :
 * un fait NEUTRE, distinct de `declined` (l'invité a dit non) et de `revoked`
 * (l'hôte a retiré son offre).
 *
 * ⚠️ L'expiration est DÉRIVÉE, jamais stockée : ces deux fonctions donnent le
 * statut effectif à chaque lecture. Deux raisons, et la seconde a été apprise
 * en écrivant le test — une mutation qui REFUSE annule ses propres écritures,
 * donc « marquer expirée puis lever » ne marque rien du tout. Et un cron de
 * plus pour un statut dérivable ferait mentir la console entre deux passages.
 * La ligne peut donc rester `pending` en base : aucune lecture ne la croit.
 */
/** Une invitation sans réponse au bout de 30 min n'engage plus le direct. */
export const DIRECT_INVITATION_TTL_MS = 30 * 60_000

/**
 * Statut d'une INVITATION à l'antenne. Les deux derniers ne disent pas la
 * même chose que `declined` : refuser est un acte de l'invité, `revoked` un
 * acte de l'hôte, `expired` un simple écoulement du temps. Aucun de ces cinq
 * statuts ne consomme une PLACE : la capacité de l'antenne se lit sur
 * `liveSpeakers` vivants, jamais sur cet historique.
 */
export const DIRECT_ANTENNA_INVITATION_STATUSES = ["pending", "accepted", "declined", "revoked", "expired"] as const
export type DirectAntennaInvitationStatus = (typeof DIRECT_ANTENNA_INVITATION_STATUSES)[number]

/** Ce que la ligne VAUT maintenant — `pending` ne survit pas à son délai. */
export function effectiveDirectInvitationStatus(
  invitation: { status: DirectAntennaInvitationStatus; updatedAt: number },
  now: number,
): DirectAntennaInvitationStatus {
  if (invitation.status !== "pending") return invitation.status
  return now - invitation.updatedAt >= DIRECT_INVITATION_TTL_MS
    ? "expired"
    : "pending"
}

/** Raccourci de lecture — une invitation encore ouverte, et rien d'autre. */
export function isDirectInvitationOpen(
  invitation: { status: DirectAntennaInvitationStatus; updatedAt: number },
  now: number,
): boolean {
  return effectiveDirectInvitationStatus(invitation, now) === "pending"
}

/** Le titre, jugé : requis, borné, épuré. */
export function assertDirectTitle(raw: string): string {
  const title = raw.trim().replace(/\s+/g, " ")
  if (title.length === 0) {
    throw new DomainViolation("LIVE_TITLE_REQUIRED")
  }
  if (title.length > DIRECT_TITLE_MAX_LENGTH) {
    throw new DomainViolation("LIVE_TITLE_TOO_LONG", { max: DIRECT_TITLE_MAX_LENGTH })
  }
  return title
}

/** Le corps d'un commentaire de direct, jugé : requis, borné. */
export function assertDirectCommentBody(raw: string): string {
  const body = raw.trim()
  if (body.length === 0) {
    throw new DomainViolation("LIVE_COMMENT_EMPTY")
  }
  if (body.length > DIRECT_COMMENT_MAX_LENGTH) {
    throw new DomainViolation("LIVE_COMMENT_TOO_LONG", { max: DIRECT_COMMENT_MAX_LENGTH })
  }
  return body
}

/**
 * Le plafond de spectateurs demandé, ramené dans les bornes. Absent →
 * défaut ; demander plus que le plafond absolu n'élargit rien (fail-closed :
 * on RÉTRÉCIT une demande hors borne, on ne la rejette pas — le créateur
 * voulait « beaucoup », il aura le maximum permis).
 */
export function clampMaxViewers(requested: number | undefined): number {
  if (requested === undefined) return DIRECT_DEFAULT_MAX_VIEWERS
  const wanted = Math.trunc(requested)
  if (!Number.isFinite(wanted) || wanted < 1) return 1
  return Math.min(wanted, DIRECT_MAX_VIEWERS_CAP)
}

/**
 * L'audience d'un direct — la source du validateur `directAudienceValidator`.
 *
 *  · `public`      — tout membre du réseau ;
 *  · `connections` — les relations acceptées de l'hôte, dans le réseau ;
 *  · `followers`   — « Abonnés de la page » (ex-« organisation », V40) : la
 *    conférence se tient AU NOM d'une page (`pageId` EXIGÉ), et ne s'ouvre
 *    qu'à ses abonnés et à ses signataires vivants — l'hôte compris : une page
 *    retirée, ou un hôte qui n'en est plus ni abonné ni signataire, et la
 *    conférence se referme sur lui aussi ;
 *  · `invitees`    — « Invités seulement » (ADR-0150) : l'hôte et les invités
 *    VIVANTS (`liveInvitees`), personne d'autre. C'est l'audience de la
 *    conférence « à un seul interlocuteur » — elle et un invité intervenant.
 *
 * ⚠️ Chaque audience arrive AVEC sa garde (`access.directSessionAccessDecision`) :
 * c'est l'audience sans garde qui est interdite, pas l'audience de plus.
 */
export const DIRECT_AUDIENCES = ["public", "connections", "followers", "invitees"] as const
export type DirectAudience = (typeof DIRECT_AUDIENCES)[number]

/**
 * L'audience est-elle « Invités seulement » ? Une seule définition, que le
 * serveur (annonce refusée, replay réservé) et l'écran (options du dialogue)
 * partagent.
 */
export function isInviteeAudience(audience: DirectAudience): boolean {
  return audience === "invitees"
}

/* ═══════════════════════════════════════════════════════════════════════════
 * LES INVITÉS NOMINATIFS (ADR-0150)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Trois axes ORTHOGONAUX : qui VOIT (l'audience, immuable), qui est INVITÉ
 * (`liveInvitees`, combinable avec toute audience), qui PARLE (`stageRole`
 * par invité). Ce module ne juge que les BORNES et la forme de la liste —
 * l'éligibilité de chaque personne (adhésion, connexion, fil, blocage, page)
 * demande la base et se juge au bord (`access.isEligibleDirectInvitee`).
 */

/** Ce qu'un invité fait à la conférence : il la regarde, ou il y intervient. */
export const DIRECT_INVITEE_STAGE_ROLES = ["viewer", "speaker"] as const
export type DirectInviteeStageRole = (typeof DIRECT_INVITEE_STAGE_ROLES)[number]

/**
 * Plafond d'invités VIVANTS par conférence. Aligné sur la cloche de démarrage
 * (200 par source) : toute la liste sonne dans UNE transaction.
 */
export const DIRECT_MAX_INVITEES = 200

/**
 * Plafond d'invités INTERVENANTS : l'antenne compte huit places, et l'hôte en
 * tient une. Promus au passage en live, ils ne doivent jamais pouvoir la
 * remplir au-delà.
 */
export const DIRECT_MAX_SPEAKER_INVITEES = DIRECT_MAX_SPEAKERS - 1

/** Une entrée de liste d'invités, telle que la création la reçoit. */
export type DirectInviteeEntry<P extends string = string> = {
  personId: P
  stageRole: DirectInviteeStageRole
}

/**
 * La liste d'invités d'une création, NORMALISÉE : dédoublonnée, sans l'hôte,
 * bornée.
 *
 * ⚠️ Un doublon n'est pas une erreur (un pré-remplissage peut citer deux fois
 * la même personne) : il fusionne, et `speaker` l'emporte — le rôle le plus
 * explicite a été demandé exprès. L'HÔTE cité est ignoré, jamais refusé : il
 * est déjà à l'antenne, et un refus apprendrait seulement que le client a
 * recopié la liste entière d'un appel.
 *
 * ⚠️ La borne se juge sur la liste BRUTE puis sur la liste fusionnée : une
 * liste de mille doublons n'est pas « deux cents invités ».
 */
export function planDirectInvitees<P extends string>(
  entries: readonly DirectInviteeEntry<P>[],
  hostPersonId: string,
): DirectInviteeEntry<P>[] {
  if (entries.length > DIRECT_MAX_INVITEES) {
    throw new DomainViolation("LIVE_INVITEES_TOO_MANY", { max: DIRECT_MAX_INVITEES })
  }
  const byPerson = new Map<string, DirectInviteeEntry<P>>()
  for (const entry of entries) {
    const key = String(entry.personId)
    if (key === String(hostPersonId)) continue
    const prior = byPerson.get(key)
    byPerson.set(key, {
      personId: entry.personId,
      stageRole:
        prior?.stageRole === "speaker" || entry.stageRole === "speaker"
          ? "speaker"
          : "viewer",
    })
  }
  const planned = [...byPerson.values()]
  assertInviteeCapacity({
    invitees: planned.length,
    speakerInvitees: planned.filter((row) => row.stageRole === "speaker")
      .length,
  })
  return planned
}

/**
 * Les bornes d'une liste d'invités VIVANTS, après l'écriture envisagée.
 * Partagée par la création et par l'ajout : deux comptes divergeraient.
 */
export function assertInviteeCapacity(counts: {
  invitees: number
  speakerInvitees: number
}): void {
  if (counts.invitees > DIRECT_MAX_INVITEES) {
    throw new DomainViolation("LIVE_INVITEES_TOO_MANY", { max: DIRECT_MAX_INVITEES })
  }
  if (counts.speakerInvitees > DIRECT_MAX_SPEAKER_INVITEES) {
    throw new DomainViolation("LIVE_SPEAKER_INVITEES_TOO_MANY", { max: DIRECT_MAX_SPEAKER_INVITEES })
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * LA PUBLICATION DE LA REDIFFUSION (ADR-0158)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Une conférence est ENREGISTRÉE d'office ; ce que l'hôte choisit, c'est le
 * sort de la copie une fois la conférence terminée — publier, garder pour
 * lui, ou supprimer. Tant qu'il n'a rien dit, la copie n'est lisible que de
 * lui. Une conférence qui se ferme ne se publie donc JAMAIS toute seule.
 */

/** Statut du replay — piloté par l'Egress LiveKit via le webhook HTTP. */
export const DIRECT_REPLAY_STATUSES = [
  /** Enregistrement demandé, Egress pas encore terminé. */
  "pending",
  /** Fichier rapatrié dans le stockage, lisible. */
  "ready",
  /** Egress en échec — le direct a eu lieu, le replay n'existera pas. */
  "failed",
  /** Politique de conservation atteinte : vidéo et sous-titres supprimés. */
  "expired",
] as const
export type DirectReplayStatus = (typeof DIRECT_REPLAY_STATUSES)[number]

/**
 * Ce que l'HÔTE a décidé de l'enregistrement une fois la conférence terminée :
 *  · `undecided` — la conférence est finie, l'hôte n'a rien dit : la copie
 *    n'est lisible que de lui (et de qui gère la rediffusion) ;
 *  · `private`   — « garder pour moi » : invisible de l'audience et de la découverte ;
 *  · `published` — l'audience de la conférence peut la revoir.
 */
export const DIRECT_REPLAY_PUBLICATIONS = ["undecided", "private", "published"] as const
export type DirectReplayPublication = (typeof DIRECT_REPLAY_PUBLICATIONS)[number]

/**
 * La publication EFFECTIVE. ABSENT = `published` : les sessions antérieures
 * publiaient leur rediffusion d'office, et la garde de lecture doit continuer
 * de les servir telles quelles — une migration silencieuse qui refermerait
 * des rediffusions déjà vues serait pire que l'ancien défaut.
 */
export function effectiveReplayPublication(session: {
  replayPublication?: DirectReplayPublication
}): DirectReplayPublication {
  return session.replayPublication ?? "published"
}

/** L'audience de la conférence a-t-elle le droit de REVOIR la copie ? */
export function isReplayPublished(session: {
  replayPublication?: DirectReplayPublication
}): boolean {
  return effectiveReplayPublication(session) === "published"
}

/**
 * Ce que l'hôte peut RÉPONDRE à « que faire de l'enregistrement ? ».
 * `discard` n'est pas un état : c'est le retrait (`withdrawReplay`), et la
 * ligne passe `expired`.
 */
export const DIRECT_REPLAY_DECISIONS = ["published", "private", "discard"] as const
export type DirectReplayDecision = (typeof DIRECT_REPLAY_DECISIONS)[number]

/**
 * La visibilité du replay peut UNIQUEMENT restreindre l'audience de la
 * session : `public` peut se refermer sur `connections`, jamais l'inverse —
 * un direct joué devant ses connexions ne devient pas public après coup.
 */
export function isReplayVisibilityAllowed(
  sessionAudience: DirectAudience,
  requested: DirectAudience,
): boolean {
  if (requested === sessionAudience) return true
  /**
   * ⚠️ Une conférence réservée aux abonnés d'une page n'admet AUCUNE autre
   * visibilité de replay. Ouvrir son enregistrement contournerait la
   * restriction par la copie durable — précisément ce qu'on voulait garder au
   * cercle de la page, et pour toujours. Même règle pour une conférence
   * « Invités seulement » : son replay reste celui de l'hôte et de ses invités
   * (ADR-0150).
   */
  if (sessionAudience === "followers" || sessionAudience === "invitees") {
    return false
  }
  /** Et l'on n'entre pas dans le cercle d'une page par la porte du replay. */
  if (requested === "followers" || requested === "invitees") return false
  return sessionAudience === "public" && requested === "connections"
}

/**
 * La visibilité EFFECTIVE du replay : la restriction si elle existe, sinon
 * l'audience de la session. Une seule définition — la garde de lecture et la
 * mutation de restriction la partagent.
 *
 * ⚠️ UNE RESTRICTION NE PEUT QUE RESTREINDRE. Une conférence réservée aux
 * abonnés d'une page garde son replay réservé, même si quelqu'un pose
 * `replayVisibility: "public"` — sinon la restriction se contournerait par
 * l'enregistrement, c'est-à-dire par la copie durable de ce qu'on voulait
 * garder au cercle de la page. C'est le seul endroit où l'on peut se tromper,
 * et il est unique.
 */
export function effectiveReplayVisibility(session: {
  audience: DirectAudience
  replayVisibility?: "public" | "connections"
}): DirectAudience {
  if (session.audience === "followers") return "followers"
  // « Invités seulement » : le replay reste réservé, quoi qu'on ait stocké.
  if (session.audience === "invitees") return "invitees"
  return session.replayVisibility ?? session.audience
}
