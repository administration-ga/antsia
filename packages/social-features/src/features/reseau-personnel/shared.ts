// Dupliqué de socle/packages/agent-features/src/features/reseau-personnel/shared.ts @ ad2e7fdc2 — adaptations : miroirs du serveur remplacés par la source de vérité du moteur (`@antsia/social-domain/content` : bornes, audiences, raisons du fil, réactions, photo de profil ; `/pages` : audiences d'une page ; `/notifications` : genres de la cloche) ; aucune trace d'organisation ni de poste (audience « organisation », raison « collegue » et voix « Mon administration » retirées ; la note aux abonnés d'une page devient l'audience `followers`) ; genres de la cloche aux noms du moteur (`live_*`, `event_invite`) ; libellés par l'i18n — les constantes portent des CLÉS (`labelKey`, `hintKey`), les fonctions reçoivent `t` en DERNIER paramètre (clés qualifiées `reseau:shared.*`) ; dates absolues dans la langue courante (formateur `datetime` d'i18next, plus de « fr-FR » en dur) ; pluriels par `count`. ; PA6 : préférence de fuseau injectée, calendrier grégorien et caches langue/fuseau.
/**
 * Logique DÉCIDABLE du réseau — libellés, dates, bornes, états vides.
 *
 * Tout ce qui se décide vit ici, où c'est vérifiable, et non dans le corps
 * d'un composant. Ce module ne connaît ni React ni Convex : ce sont des données
 * et des fonctions pures.
 *
 * ⚠️ Aucune phrase n'est écrite ici : les constantes portent des CLÉS i18n
 * qualifiées (`reseau:shared.…`), que le composant traduit, et les fonctions
 * reçoivent `t` en dernier paramètre. N'importe quel `t` les résout — celui de
 * l'espace `reseau` comme celui d'un autre.
 */

import { resolveViewerTimeZone } from "@antsia/api/civil-date"
import {
  AVATAR_MAX_BYTES as DOMAIN_AVATAR_MAX_BYTES,
  AVATAR_MIME_TYPES,
  CONNECTION_MESSAGE_MAX_LENGTH as DOMAIN_CONNECTION_MESSAGE_MAX_LENGTH,
  HANDLE_MAX_LENGTH as DOMAIN_HANDLE_MAX_LENGTH,
  HANDLE_MIN_LENGTH as DOMAIN_HANDLE_MIN_LENGTH,
  PERSONAL_COMMENT_MAX_LENGTH,
  PERSONAL_POST_MAX_LENGTH,
  type FeedReason as DomainFeedReason,
  type PersonalPostAudience,
  type PersonalReachAudience,
  type PersonalReactionKind,
} from "@antsia/social-domain/content"
import type { NotificationKind } from "@antsia/social-domain/notifications"
import type { PagePostAudience } from "@antsia/social-domain/pages"
import type { TFunction } from "i18next"

/** Les bornes du domaine (`@antsia/social-domain/content`), lues et non recopiées.
 *  Le client borne pour ÉVITER un aller-retour perdu ; le serveur reste seul
 *  juge — un compteur d'écran n'est pas une garde. */
export const POST_MAX_LENGTH = PERSONAL_POST_MAX_LENGTH
export const COMMENT_MAX_LENGTH = PERSONAL_COMMENT_MAX_LENGTH
export const CONNECTION_MESSAGE_MAX_LENGTH = DOMAIN_CONNECTION_MESSAGE_MAX_LENGTH
export const HANDLE_MIN_LENGTH = DOMAIN_HANDLE_MIN_LENGTH
export const HANDLE_MAX_LENGTH = DOMAIN_HANDLE_MAX_LENGTH

/**
 * Les audiences de PORTÉE — celles que le composeur et le partage proposent,
 * et les seules que le DIRECT et les stories connaissent.
 */
export type ReachAudience = PersonalReachAudience
/**
 * L'audience d'une publication TELLE QU'ELLE REVIENT DU SERVEUR : la portée,
 * `group` (le mur d'un groupe) et `followers` (la note d'une PAGE à ses
 * abonnés). Le type vient du domaine : un genre connu du serveur mais pas
 * d'ici ne peut plus exister.
 */
export type PostAudience = PersonalPostAudience
/** Pourquoi une publication est dans mon fil — le type du domaine. */
export type FeedReason = DomainFeedReason
export type ReactionKind = PersonalReactionKind

export interface AudienceOption {
  /**
   * De PORTÉE seulement : l'audience `group` ne se choisit pas dans une
   * liste — elle vient du LIEU (le composeur monté dans un groupe publie
   * dans ce groupe, et nulle part ailleurs).
   */
  value: ReachAudience
  /** Clé i18n qualifiée du libellé. */
  labelKey: string
  /** Clé i18n qualifiée de ce que ce choix OUVRE, dit en clair — l'écran ne laisse pas deviner. */
  hintKey: string
}

/**
 * Les deux audiences, dans l'ordre du moins ouvert au plus ouvert.
 *
 * `connections` en TÊTE, et c'est délibéré : le premier élément d'une liste
 * est le défaut qu'on choisit sans lire. Se tromper vers le restreint est sans
 * conséquence ; se tromper vers le public ne se rattrape pas.
 */
export const AUDIENCE_OPTIONS: readonly AudienceOption[] = Object.freeze([
  {
    value: "connections",
    labelKey: "reseau:shared.audience.connections",
    hintKey: "reseau:shared.audienceHint.connections",
  },
  {
    value: "public",
    labelKey: "reseau:shared.audience.public",
    hintKey: "reseau:shared.audienceHint.public",
  },
])

export const DEFAULT_AUDIENCE: ReachAudience = "connections"

/** Ce qu'une PAGE peut choisir comme audience : le communiqué ou la note aux abonnés. */
export type PageAudience = PagePostAudience

export interface PageAudienceOption {
  value: PageAudience
  labelKey: string
  hintKey: string
}

/**
 * Les deux voix d'une page.
 *
 * ⚠️ Une liste SÉPARÉE de `AUDIENCE_OPTIONS`, et non un ajout : une page n'a
 * pas de connexions — elle a des abonnés —, et l'audience `connections` s'y
 * jugerait sur la signataire, donc sur une personne. Les deux listes ne se
 * recoupent que sur `public`.
 *
 * ⚠️ Le défaut est `public`, à REBOURS de la doctrine du composeur personnel
 * (« le premier élément est le défaut qu'on choisit sans lire »). La raison :
 * une page EXISTE pour s'adresser au réseau, et basculer le défaut rendrait
 * restreinte, sans prévenir, une communication que son autrice croit publier.
 * Le choix restreint se prend, il ne s'hérite pas.
 */
export const PAGE_AUDIENCE_OPTIONS: readonly PageAudienceOption[] = Object.freeze([
  {
    value: "public",
    labelKey: "reseau:shared.audience.public",
    hintKey: "reseau:shared.pageAudienceHint.public",
  },
  {
    value: "followers",
    labelKey: "reseau:shared.pageAudience.followers",
    hintKey: "reseau:shared.pageAudienceHint.followers",
  },
])

export const DEFAULT_PAGE_AUDIENCE: PageAudience = "public"

export interface ReactionOption {
  kind: ReactionKind
  /** Clé i18n qualifiée du nom de la réaction. */
  labelKey: string
  /**
   * Symbole emoji de secours. La barre d'une publication rend des ICÔNES
   * monochromes — icône SEULE ADMISE à condition que le nom voyage en
   * `aria-label` + `title` : un pictogramme sans nom accessible reste
   * interdit. Le `glyph` sert les surfaces textuelles (notifications,
   * récapitulatifs) qui n'embarquent pas d'icône.
   */
  glyph: string
}

export const REACTION_OPTIONS: readonly ReactionOption[] = Object.freeze([
  { kind: "like", labelKey: "reseau:shared.reaction.like", glyph: "👍" },
  { kind: "bravo", labelKey: "reseau:shared.reaction.bravo", glyph: "👏" },
  { kind: "soutien", labelKey: "reseau:shared.reaction.soutien", glyph: "🤝" },
  { kind: "instructif", labelKey: "reseau:shared.reaction.instructif", glyph: "💡" },
])

export function reactionLabel(kind: ReactionKind, t: TFunction): string {
  const option = REACTION_OPTIONS.find((candidate) => candidate.kind === kind)
  return option ? t(option.labelKey) : kind
}

/**
 * Pourquoi cette publication est dans mon fil. L'écran le DIT — il ne laisse
 * pas croire à un fil algorithmique dont on ne comprendrait pas la composition.
 */
export function feedReasonLabel(reason: FeedReason, t: TFunction): string {
  switch (reason) {
    case "own":
      return t("reseau:shared.feedReason.own")
    case "connection":
      return t("reseau:shared.feedReason.connection")
    case "follow":
      return t("reseau:shared.feedReason.follow")
    // Lisible sans aucun lien. Le dire, plutôt que d'annoncer un suivi
    // qui n'existe pas : le fil n'a rien à maquiller.
    case "public":
      return t("reseau:shared.feedReason.public")
    // Mur d'un groupe thématique, ou publication de groupe ouverte par un
    // lien : le titre est l'appartenance au groupe, jamais un lien maquillé.
    case "group":
      return t("reseau:shared.feedReason.group")
    // Une PAGE que je suis. Le titre nomme le suivi, pas ce que la page
    // représente.
    case "page":
      return t("reseau:shared.feedReason.page")
  }
}

export function audienceLabel(audience: PostAudience, t: TFunction): string {
  switch (audience) {
    case "public":
      return t("reseau:shared.audience.public")
    case "connections":
      return t("reseau:shared.audience.connections")
    // La carte dit « Groupe » sans nommer lequel : le nom s'affiche là où le
    // mur l'affiche déjà (la page du groupe).
    case "group":
      return t("reseau:shared.audience.group")
    // La NOTE d'une page à ses abonnés. Le libellé nomme la RESTRICTION, pas
    // la page : la carte porte déjà le nom de la page qui signe.
    case "followers":
      return t("reseau:shared.audience.followers")
  }
}

/** Le format de la date absolue — le reste (langue, fuseau) est celui du lecteur. */
const ABSOLUTE_DATE_FORMAT: Readonly<Intl.DateTimeFormatOptions> = {
  day: "numeric",
  month: "short",
  year: "numeric",
}

/**
 * Date relative brève, puis date absolue au-delà d'une semaine.
 *
 * « il y a 3 j » informe ; « il y a 47 j » n'informe plus, il faut compter.
 * `now` est un PARAMÈTRE et non `Date.now()` : c'est ce qui rend la fonction
 * testable sans geler l'horloge. La date absolue est mise en forme par `Intl`
 * dans la langue de `t` (formateur `datetime` d'i18next) et le fuseau du
 * navigateur.
 */
export function formatRelativeDate(at: number, now: number, t: TFunction, timeZone?: string): string {
  const seconds = Math.max(0, Math.floor((now - at) / 1000))
  if (seconds < 60) return t("reseau:shared.relativeDate.now")
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return t("reseau:shared.relativeDate.minutes", { minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t("reseau:shared.relativeDate.hours", { hours })
  const days = Math.floor(hours / 24)
  if (days < 7) return t("reseau:shared.relativeDate.days", { days })
  return t("reseau:shared.relativeDate.absolute", {
    date: new Date(at),
    formatParams: { date: { ...ABSOLUTE_DATE_FORMAT, timeZone: resolveViewerTimeZone(timeZone) } },
  })
}

/**
 * Minuscules, sans accents ni diacritiques — pour une comparaison tolérante.
 *
 * Une recherche qui distingue « Élise » d'« elise » ne trouve rien et ne dit
 * pas pourquoi.
 *
 * ⚠️ La classe est écrite en ÉCHAPPEMENTS et non avec les marques combinantes
 * littérales : littérales, elles sont INVISIBLES dans la source, et n'importe
 * quelle normalisation d'éditeur peut les effacer en silence. La recherche
 * redeviendrait sensible aux accents sans qu'aucun test ne la voie casser.
 */
export function normalizeSearchText(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
}

/**
 * Décompte affiché. Le serveur borne son balayage (`ENGAGEMENT_SCAN` = 200) :
 * un total qui l'atteint est un PLANCHER, pas un total — l'écran doit le dire
 * plutôt que d'affirmer un chiffre faux.
 */
export const ENGAGEMENT_DISPLAY_CAP = 200

export function formatCount(count: number): string {
  return count >= ENGAGEMENT_DISPLAY_CAP ? `${ENGAGEMENT_DISPLAY_CAP}+` : String(count)
}

/** Badge de cloche : « 99+ » au-delà, comme le serveur qui plafonne son scan. */
export function formatUnreadBadge(count: number | undefined): string | null {
  if (count === undefined || count <= 0) return null
  return count >= 99 ? "99+" : String(count)
}

export function unreadBadgeLabel(count: number | undefined, t: TFunction): string | null {
  if (count === undefined || count <= 0) return null
  return t("reseau:shared.unreadBadge", { count })
}

/**
 * Les genres de la cloche qui ont une phrase ici — aux noms du moteur
 * (`@antsia/social-domain/notifications`) : un nom qui n'y existe pas ne
 * compile pas. Les genres propres au moteur (page suivie, album, garde des
 * fichiers, appels manqués, messages vocaux, tranches d'application) sont
 * phrasés par la surface des notifications.
 */
export const NOTIFICATION_SENTENCE_KINDS = [
  "post_reaction",
  "post_comment",
  "post_share",
  "mention",
  "connection_request",
  "connection_accepted",
  "new_follower",
  "group_message",
  "group_added",
  "live_started",
  "live_invite",
  "live_antenna_invite",
  "thematic_group_invite",
  "event_invite",
  "live_replay_published",
] as const satisfies readonly NotificationKind[]

export type NotificationSentenceKind = (typeof NOTIFICATION_SENTENCE_KINDS)[number]

/**
 * Ce que dit la cloche, sans jamais recopier le contenu du sujet.
 *
 * ⚠️ Une table et non un `switch` de phrases : la clé dit le genre, la phrase
 * vit dans la locale — la même pour les deux langues.
 */
const SENTENCE_KEYS: Readonly<Record<NotificationSentenceKind, string>> = Object.freeze({
  post_reaction: "reseau:shared.notification.postReaction",
  post_comment: "reseau:shared.notification.postComment",
  post_share: "reseau:shared.notification.postShare",
  // « Vous a cité » n'est pas « a commenté » : la phrase distingue les deux,
  // sinon le genre ne servirait à rien.
  mention: "reseau:shared.notification.mention",
  connection_request: "reseau:shared.notification.connectionRequest",
  connection_accepted: "reseau:shared.notification.connectionAccepted",
  new_follower: "reseau:shared.notification.newFollower",
  // Conversations de GROUPE : la cloche désigne le fil, jamais son texte.
  group_message: "reseau:shared.notification.groupMessage",
  group_added: "reseau:shared.notification.groupAdded",
  // Émise au DÉMARRAGE du direct, jamais à la programmation.
  live_started: "reseau:shared.notification.liveStarted",
  // Invitation NOMINATIVE à une conférence : la cloche ne recopie pas le titre.
  live_invite: "reseau:shared.notification.liveInvite",
  live_antenna_invite: "reseau:shared.notification.liveAntennaInvite",
  thematic_group_invite: "reseau:shared.notification.thematicGroupInvite",
  event_invite: "reseau:shared.notification.eventInvite",
  // L'ENREGISTREMENT d'une conférence est publié : la phrase ne recopie pas le titre.
  live_replay_published: "reseau:shared.notification.liveReplayPublished",
})

export function notificationSentence(kind: NotificationSentenceKind, actorName: string, t: TFunction): string {
  return t(SENTENCE_KEYS[kind], { actor: actorName })
}

/**
 * Ce que l'invitation est DEVENUE, dit en une phrase — ou `null` quand ce genre
 * n'a pas de résultat à dire, ou que la valeur est inconnue.
 *
 * La résolution est posée par le SERVEUR, dans la transaction qui tranche ;
 * l'écran ne fait que la dire. « Lu » n'a jamais voulu dire « traité ».
 *
 * `kind` et `resolution` restent des `string` : un backend en avance peut
 * servir un genre ou une valeur que ce client ne connaît pas encore — la ligne
 * se tait alors plutôt que d'inventer. Des `switch` et non une table : une clé
 * comme `toString` ne trouve ainsi rien d'hérité.
 */
export function resolutionSentence(kind: string, resolution: string, t: TFunction): string | null {
  switch (kind) {
    // Une demande de RELATION : seul son destinataire la tranche, la phrase
    // s'adresse donc à lui. Ni « peut-être » ni « terminée » n'y ont de sens.
    case "connection_request":
      switch (resolution) {
        case "accepted":
          return t("reseau:shared.resolution.connectionAccepted")
        case "declined":
          return t("reseau:shared.resolution.declined")
        case "cancelled":
          return t("reseau:shared.resolution.cancelled")
        default:
          return null
      }
    // Les invitations à REJOINDRE : conversation de groupe, groupe
    // thématique, évènement. « Peut-être » est une réponse qui peut encore
    // changer — la phrase la rapporte, sans la figer en refus ni en accord.
    case "group_added":
    case "thematic_group_invite":
    case "event_invite":
    // PG-01 : l'invitation à signer pour une page (acceptée, déclinée, retirée par la page).
    case "page_signatory_invite":
      switch (resolution) {
        case "accepted":
          return t("reseau:shared.resolution.accepted")
        case "declined":
          return t("reseau:shared.resolution.declined")
        case "maybe":
          return t("reseau:shared.resolution.maybe")
        case "cancelled":
          return t("reseau:shared.resolution.cancelled")
        default:
          return null
      }
    // Les invitations à une CONFÉRENCE : l'organisatrice RETIRE une invitation
    // (la conférence, elle, a lieu), et la fin du direct la rend sans objet.
    case "live_invite":
    case "live_antenna_invite":
      switch (resolution) {
        case "accepted":
          return t("reseau:shared.resolution.accepted")
        case "declined":
          return t("reseau:shared.resolution.declined")
        case "cancelled":
          return t("reseau:shared.resolution.withdrawn")
        case "expired":
          return t("reseau:shared.resolution.liveEnded")
        default:
          return null
      }
    default:
      return null
  }
}

/** Longueur de l'extrait cité dans la boîte de partage. */
export const SHARE_EXCERPT_MAX = 240

/**
 * L'extrait montré au moment de partager — pour savoir CE QU'ON partage.
 *
 * Une publication sans texte (une photo seule) rend une phrase explicite
 * plutôt qu'un vide : un cadre blanc laisserait croire à un défaut de
 * chargement.
 */
export function shareExcerpt(body: string, t: TFunction): string {
  const trimmed = body.trim()
  if (trimmed.length === 0) return t("reseau:shared.shareExcerptEmpty")
  return trimmed.length <= SHARE_EXCERPT_MAX ? trimmed : `${trimmed.slice(0, SHARE_EXCERPT_MAX).trimEnd()}…`
}

export interface ComposerState {
  /** Prêt à partir ? */
  canSubmit: boolean
  /** Caractères restants — négatif quand on a dépassé. */
  remaining: number
  /** Pourquoi c'est bloqué, ou `null`. Jamais un bouton grisé sans raison. */
  blockedReason: string | null
}

export function evaluateComposer(body: string, isSubmitting: boolean, t: TFunction): ComposerState {
  const trimmed = body.trim()
  const remaining = POST_MAX_LENGTH - trimmed.length
  if (isSubmitting) {
    return { canSubmit: false, remaining, blockedReason: null }
  }
  if (trimmed.length === 0) {
    return { canSubmit: false, remaining, blockedReason: null }
  }
  if (remaining < 0) {
    return {
      canSubmit: false,
      remaining,
      blockedReason: t("reseau:shared.composerTooLong", { count: -remaining }),
    }
  }
  return { canSubmit: true, remaining, blockedReason: null }
}

/**
 * Le texte d'un fil vide — et il DÉPEND de la situation.
 *
 * « Aucune publication » serait faux et décourageant pour quelqu'un dont le fil
 * est vide parce qu'il n'a encore aucun lien : le fil est le produit de choix,
 * l'écran doit dire lequel il manque.
 */
export function emptyFeedText(
  input: {
    hasConnections: boolean
    hasFollows: boolean
  },
  t: TFunction,
): string {
  if (!input.hasConnections && !input.hasFollows) return t("reseau:shared.emptyFeed.orphan")
  return t("reseau:shared.emptyFeed.linked")
}

/**
 * Le handle est-il recevable côté client ? Miroir ALLÉGÉ de `assertHandle` du
 * domaine — il évite un aller-retour, il ne remplace pas la garde.
 */
export function validateHandle(raw: string, t: TFunction): string | null {
  const handle = raw.trim().toLowerCase()
  if (handle.length === 0) return t("reseau:shared.handle.required")
  if (handle.length < HANDLE_MIN_LENGTH || handle.length > HANDLE_MAX_LENGTH) {
    return t("reseau:shared.handle.length", { min: HANDLE_MIN_LENGTH, max: HANDLE_MAX_LENGTH })
  }
  if (!/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/.test(handle)) {
    return t("reseau:shared.handle.charset")
  }
  return null
}

/**
 * Ce que dit la barre au-dessus des résultats de recherche.
 *
 * ⚠️ Un décompte affiché PENDANT le chargement dirait « 0 résultat » puis se
 * corrigerait — et « 0 résultat » se retient. On annonce donc la recherche en
 * cours, et le chiffre seulement quand il est vrai.
 */
export function searchStatusText(query: string, count: number, isLoading: boolean, t: TFunction): string {
  if (isLoading) return t("reseau:shared.searchStatus.loading", { query })
  if (count === 0) return t("reseau:shared.searchStatus.none", { query })
  return t("reseau:shared.searchStatus.results", { query, count })
}

// ─────────────────────────── Photo de profil ───────────────────────────

/** Ce que le sélecteur de photo de profil accepte — les types du domaine. */
export const AVATAR_ACCEPT = AVATAR_MIME_TYPES.join(",")
export const AVATAR_MAX_BYTES = DOMAIN_AVATAR_MAX_BYTES

/**
 * Le refus opposé à une photo de profil, ou `null`.
 *
 * Miroir ALLÉGÉ du domaine : il évite un téléversement perdu, il ne remplace
 * pas la garde — le serveur relit le type RÉEL du stockage, que le navigateur
 * peut déclarer faux.
 */
// `Blob` et non `File` : la fonction ne lit que `type` et `size`, que les deux
// portent. Un `File` reste accepté (il EST un `Blob`) ; le blob nu l'est aussi,
// ce qui permet de juger une photo relue d'une URL exactement comme une photo
// choisie dans le sélecteur de fichiers — une seule règle, un seul message.
export function avatarRejectionFor(file: Blob, t: TFunction): string | null {
  if (!AVATAR_ACCEPT.split(",").includes(file.type)) {
    return t("reseau:shared.avatar.format")
  }
  if (file.size > AVATAR_MAX_BYTES) {
    return t("reseau:shared.avatar.size", { max: Math.round(AVATAR_MAX_BYTES / (1024 * 1024)) })
  }
  return null
}
