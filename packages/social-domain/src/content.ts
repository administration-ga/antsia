// Dupliqué de socle/convex/modules/reseauPersonnel/domain.ts (l. 1-662 et 807-894) @ ad2e7fdc2 — adaptations : module scindé (texte riche, groupes thématiques, évènements, stories et fils de groupe dans leurs fichiers) ; audience « organisation », portée « mon_administration », titre « collegue » et `isPageOrgMember` retirés ; forme d'une publication de page : `public` (le communiqué) ou `followers` (la note aux abonnés, EXF-AN-18), seule audience réservée aux pages, épingle d'une publication de page refusée sur un mur personnel ; borne du nom affiché (en ligne dans `people.ts` au socle) devenue la règle `assertDisplayName` ; `ReseauPersonnelViolation` → `DomainViolation` (code de règle + bornes, texte dans les locales de l'écran).
/**
 * Domaine PUR des publications du moteur — aucune fonction Convex ici, pour
 * qu'un import client atteigne ce fichier sans embarquer le backend. C'est
 * aussi ce qui rend ces règles testables sans harnais.
 *
 * Décision structurante, héritée du socle (et de PRO.GA avant lui) :
 *
 *   · la **connexion** (statut `accepted`) est symétrique et négociée. Elle
 *     seule ouvre l'audience `connections` ;
 *   · l'**abonnement** est asymétrique et unilatéral. Il n'ouvre RIEN de plus
 *     que ce qui est déjà `public`.
 *
 * Le défaut classique du genre est d'écrire `isConnected || isFollowing`
 * quelque part : l'abonné devient alors un proche. Les deux branches sont donc
 * séparées ici, et un test les tient séparées.
 *
 * L'AUDIENCE (qui, parmi les membres, voit une publication) est orthogonale à
 * la VISIBILITÉ réseau (`network` ou `root`, `./visibility.ts`) : la seconde
 * dit dans quels réseaux une publication existe, la première qui l'y lit.
 */
import { type DomainRule, DomainViolation, megabytes } from "./violation"

export const PERSONAL_POST_MAX_LENGTH = 2000

/**
 * Plus court qu'une publication À DESSEIN : un commentaire répond, il ne
 * republie pas.
 */
export const PERSONAL_COMMENT_MAX_LENGTH = 1000

/** Message d'accroche d'une demande de connexion — pas une conversation. */
export const CONNECTION_MESSAGE_MAX_LENGTH = 500

export const HANDLE_MIN_LENGTH = 3
export const HANDLE_MAX_LENGTH = 30
export const HEADLINE_MAX_LENGTH = 160
export const DISPLAY_NAME_MAX_LENGTH = 120

/**
 * Les audiences de PORTÉE — jusqu'où un contenu rayonne parmi les membres.
 * C'est le vocabulaire du direct et des stories, qui n'ont pas de groupes :
 * l'y étendre ferait naître des directs « de groupe » qu'aucune garde ne sait
 * servir.
 */
export const PERSONAL_REACH_AUDIENCES = ["public", "connections"] as const
export type PersonalReachAudience = (typeof PERSONAL_REACH_AUDIENCES)[number]

/**
 * Les audiences d'une PUBLICATION. `group` ne RAYONNE pas : elle vit sur le mur
 * de son groupe, visible de ses seuls membres — c'est un lieu, pas une portée.
 * `followers` n'appartient qu'aux PAGES (la note aux abonnés : les abonnés de la
 * page et ses signataires vivants) — jamais à une personne, dont l'abonnement
 * n'ouvre rien de plus que le `public`.
 *
 * ⚠️ Cette liste DOIT rester le miroir exact du validateur Convex des
 * audiences (test d'alignement côté backend) : le validateur décide ce que la
 * base accepte, cette constante ce que le code sait traiter.
 */
export const PERSONAL_POST_AUDIENCES = ["public", "connections", "group", "followers"] as const
export type PersonalPostAudience = (typeof PERSONAL_POST_AUDIENCES)[number]

export const PERSONAL_POST_STATUSES = ["published", "removed"] as const
export type PersonalPostStatus = (typeof PERSONAL_POST_STATUSES)[number]

/**
 * Réactions. L'union s'étend sans migration. UNE réaction par (publication,
 * personne) — changer de genre REMPLACE, jamais n'empile.
 */
export const PERSONAL_REACTION_KINDS = ["like", "bravo", "soutien", "instructif"] as const
export type PersonalReactionKind = (typeof PERSONAL_REACTION_KINDS)[number]

const REACTION_SET: ReadonlySet<string> = new Set(PERSONAL_REACTION_KINDS)

export function isPersonalReactionKind(value: string): value is PersonalReactionKind {
  return REACTION_SET.has(value)
}

// ═══════════════════════════════════════════════════════════════
// Médias — bornes et validation d'ensemble
// ═══════════════════════════════════════════════════════════════

/** Photo de profil : une photo d'identité, pas une galerie. */
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024
export const AVATAR_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const

export const POST_IMAGE_MAX_BYTES = 20 * 1024 * 1024
/** Décision du propriétaire du 9/11/2026 (EX-17) : 60 Mio, le plafond d'analyse de la garde des fichiers — jamais au-delà. */
export const POST_VIDEO_MAX_BYTES = 60 * 1024 * 1024
export const POST_MEDIA_MAX_COUNT = 4
export const POST_MEDIA_ALT_MAX_LENGTH = 300
export const POST_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const
/**
 * Les vidéos qu'une publication peut PORTER : celles qu'on accepte aujourd'hui,
 * plus le QuickTime (.mov) des publications antérieures au lot SD-03, toujours
 * servi par sa ligne (le DTO rend le type stocké). Ce n'est PAS une liste
 * d'acceptation : une nouvelle vidéo suit `POST_VIDEO_UPLOAD_MIME_TYPES`.
 * Gardée telle quelle parce que DIASPORALE la lit encore pour reconnaître une
 * vidéo (`postMediaKindOf`) ; elle devra passer à la liste d'envoi de son côté.
 */
export const POST_VIDEO_MIME_TYPES = ["video/mp4", "video/webm", "video/quicktime"] as const
/**
 * Vidéo d'une NOUVELLE publication : MP4 ou WebM, les deux conteneurs que lisent
 * tous les navigateurs — Android, iPhone, ordinateur (lot SD-03). QuickTime
 * (.mov, l'enregistrement de l'iPhone) ne se lit que dans Safari : il n'entre
 * plus à l'envoi, le composeur le CONVERTIT quand le navigateur sait le lire et
 * guide sinon. Seule liste d'acceptation : domaine (`assertPostMedia`), dépôt
 * (`UPLOAD_USAGES.media_social`) et brouillon de médias la lisent.
 */
export const POST_VIDEO_UPLOAD_MIME_TYPES = ["video/mp4", "video/webm"] as const
/**
 * Durée maximale DÉCLARÉE d'une vidéo de publication (lot SD-03, plan 03,
 * décision 6) : cinq minutes, la borne des Stories (`STORY_VIDEO_LIMITS`), la
 * plus prudente déjà en usage pour une vidéo du moteur — à valider par le
 * propriétaire. Recopiée ici et non importée (`stories.ts` importe ce module) ;
 * un test tient les deux égales.
 */
export const POST_VIDEO_MAX_DURATION_MS = 5 * 60 * 1000

export type PostMediaKind = "image" | "video"

export type PostMediaInput = {
  kind: PostMediaKind
  mimeType: string
  sizeBytes: number
  altText?: string
}

/**
 * Les personnes citées par une NOUVELLE version d'un contenu qui ne l'étaient
 * pas dans la précédente — les seules à notifier lors d'une édition. Diff pur et
 * stable (l'ordre de `next` est gardé).
 */
export function addedMentionedIds<Id extends string>(previous: readonly Id[] | undefined, next: readonly Id[]): Id[] {
  const known = new Set<string>(previous ?? [])
  return next.filter((id) => !known.has(id))
}

export function assertAvatarUpload(input: { mimeType: string; sizeBytes: number }): void {
  if (!(AVATAR_MIME_TYPES as readonly string[]).includes(input.mimeType)) {
    throw new DomainViolation("AVATAR_MIME_INVALID")
  }
  if (input.sizeBytes <= 0 || input.sizeBytes > AVATAR_MAX_BYTES) {
    throw new DomainViolation("AVATAR_TOO_LARGE", { maxMegabytes: megabytes(AVATAR_MAX_BYTES) })
  }
}

/**
 * Les médias d'une publication, ENSEMBLE.
 *
 * Une VIDÉO est toujours SEULE dans sa publication — pas de mixage avec des
 * images, pas de deux vidéos : une grille qui mélange une vidéo et trois images
 * ne sait plus dire ce qu'on regarde, et deux vidéos feraient d'un fil un
 * téléchargement.
 */
export function assertPostMedia(media: readonly PostMediaInput[]): void {
  if (media.length === 0) return
  if (media.length > POST_MEDIA_MAX_COUNT) {
    throw new DomainViolation("POST_MEDIA_TOO_MANY", { max: POST_MEDIA_MAX_COUNT })
  }
  const videos = media.filter((item) => item.kind === "video")
  if (videos.length > 0 && media.length > 1) {
    throw new DomainViolation("POST_VIDEO_MUST_BE_ALONE")
  }
  for (const item of media) {
    const allowed: readonly string[] = item.kind === "image" ? POST_IMAGE_MIME_TYPES : POST_VIDEO_UPLOAD_MIME_TYPES
    if (!allowed.includes(item.mimeType)) {
      throw new DomainViolation("POST_MEDIA_MIME_INVALID")
    }
    const maxBytes = item.kind === "image" ? POST_IMAGE_MAX_BYTES : POST_VIDEO_MAX_BYTES
    if (item.sizeBytes <= 0 || item.sizeBytes > maxBytes) {
      throw new DomainViolation("POST_MEDIA_TOO_LARGE", { maxMegabytes: megabytes(maxBytes) })
    }
    if ((item.altText ?? "").length > POST_MEDIA_ALT_MAX_LENGTH) {
      throw new DomainViolation("POST_MEDIA_ALT_TOO_LONG", { max: POST_MEDIA_ALT_MAX_LENGTH })
    }
  }
}

/**
 * La durée DÉCLARÉE d'une vidéo de publication déposée par un membre (lot SD-03).
 *
 * Le stockage ne connaît pas la durée : le client la mesure et la déclare, et le
 * serveur ne peut que refuser celle qui s'avoue hors borne — c'est une borne
 * DÉCLARÉE, jamais une preuve ; la borne réelle reste le poids, relu au stockage.
 * Absente (front non mis à jour, navigateur qui n'a pas su la mesurer) : la vidéo
 * passe, comme avant. Négative, illisible ou au-delà de la borne : refusée par la
 * même règle, car rien ne la tient alors pour une durée dans la borne.
 *
 * Hors d'`assertPostMedia` à dessein : ce dernier juge aussi les reflets fédérés,
 * dont le contrat (`RESEAU-PUBLIC-V1`) admet une durée jusqu'à vingt-quatre heures.
 */
export function assertPostVideoDuration(media: readonly { kind: PostMediaKind; durationMs?: number | undefined }[]): void {
  for (const item of media) {
    if (item.kind !== "video" || item.durationMs === undefined) continue
    if (!(item.durationMs >= 0 && item.durationMs <= POST_VIDEO_MAX_DURATION_MS)) {
      throw new DomainViolation("POST_VIDEO_TOO_LONG", { maxMinutes: POST_VIDEO_MAX_DURATION_MS / 60_000 })
    }
  }
}

/**
 * Le contenu d'une publication, dans son ENSEMBLE.
 *
 * Le corps devient OPTIONNEL dès qu'un média ou un partage porte la
 * publication — une photo sans légende est une publication légitime. Mais un
 * partage n'embarque pas ses propres médias : il montre CEUX de l'original.
 */
export function assertPostContent(input: { body: string; mediaCount: number; isShare: boolean }): string {
  if (input.isShare && input.mediaCount > 0) {
    throw new DomainViolation("POST_SHARE_WITH_MEDIA")
  }
  const trimmed = input.body.trim()
  if (trimmed.length === 0 && input.mediaCount === 0 && !input.isShare) {
    throw new DomainViolation("POST_EMPTY")
  }
  if (trimmed.length > PERSONAL_POST_MAX_LENGTH) {
    throw new DomainViolation("POST_TOO_LONG", { max: PERSONAL_POST_MAX_LENGTH })
  }
  return trimmed
}

/**
 * Seule une publication PUBLIQUE et EN LIGNE se partage.
 *
 * Un partage RÉEXPOSE : partager une publication réservée aux connexions la
 * sortirait du cercle que son auteur a choisi, et partager une publication de
 * GROUPE la sortirait du groupe. Le serveur distingue deux refus — invisible
 * pour le lecteur : refus INDISTINCT ; visible mais réservée : cette violation.
 */
export function assertShareable(input: { audience: PersonalPostAudience; status: PersonalPostStatus }): void {
  if (input.status !== "published" || input.audience !== "public") {
    throw new DomainViolation("POST_NOT_SHAREABLE")
  }
}

// ═══════════════════════════════════════════════════════════════
// Portée et pays d'une publication (réseaux à portées, ex. DIASPORALE)
// ═══════════════════════════════════════════════════════════════

/** La portée qui restreint une publication à un PAYS : elle seule exige le pays. */
export const REACH_REQUIRING_COUNTRY = "local"

const COUNTRY_CODE = /^[A-Z]{2}$/

/** Un pays, rendu en majuscules : deux lettres (ISO alpha-2), sinon refusé. */
export function assertCountryCode(raw: string): string {
  const country = raw.trim().toUpperCase()
  if (!COUNTRY_CODE.test(country)) throw new DomainViolation("POST_COUNTRY_INVALID")
  return country
}

/**
 * La portée (`reach`) et le pays (`country`) d'une publication, jugés contre les
 * portées que le RÉSEAU déclare (`networks.reachValues`) : une portée hors de la
 * liste est refusée (un réseau sans portée n'en accepte aucune) ; le pays est un
 * code ISO 3166-1 alpha-2, rendu en majuscules ; la portée locale exige un pays.
 * Les deux restent facultatifs : le réseau ne les impose pas.
 */
export function assertPostReach(input: { reach?: string; country?: string; reachValues: readonly string[] }): { reach?: string; country?: string } {
  const country = input.country?.trim().toUpperCase()
  if (country !== undefined && !COUNTRY_CODE.test(country)) throw new DomainViolation("POST_COUNTRY_INVALID")
  if (input.reach !== undefined && !input.reachValues.includes(input.reach)) throw new DomainViolation("POST_REACH_INVALID")
  if (input.reach === REACH_REQUIRING_COUNTRY && country === undefined) throw new DomainViolation("POST_COUNTRY_REQUIRED")
  return { ...(input.reach !== undefined ? { reach: input.reach } : {}), ...(country !== undefined ? { country } : {}) }
}

/**
 * Les refus d'une RÈGLE DE PLACEMENT (HB-03, issue antsia#96) : la tranche qui
 * gouverne un réseau (`networks.managedBy`) juge où une publication peut aller
 * — une publication locale va dans le pays de son auteur ou de sa page, et
 * seulement si ce pays est ouvert et admis. Ensemble FERMÉ, sous-ensemble des
 * règles du domaine : le serveur les lève en `invalidArgument` portant
 * `{ rule }`, l'écran les traduit (`rules.<code>`, fr et en).
 */
export const POST_PLACEMENT_REFUSALS = [
  /** Le pays n'est pas celui de l'auteur (ou de la page qui publie). */
  "POST_PLACEMENT_NOT_OWN_COUNTRY",
  /** Le pays n'est pas (encore) ouvert aux publications locales. */
  "POST_PLACEMENT_COUNTRY_NOT_OPEN",
  /** Le code n'est pas un pays admis par le réseau (pays de résidence reconnu). */
  "POST_PLACEMENT_COUNTRY_NOT_ADMITTED",
] as const satisfies readonly DomainRule[]
export type PostPlacementRefusal = (typeof POST_PLACEMENT_REFUSALS)[number]

export function isPostPlacementRefusal(value: unknown): value is PostPlacementRefusal {
  return typeof value === "string" && (POST_PLACEMENT_REFUSALS as readonly string[]).includes(value)
}

/**
 * Une VOIE du fil : les publications d'une portée, et d'un pays si elle en
 * nomme un. L'application compose ses voies selon SA règle (le hub d'un pays :
 * le local de ce pays et toute la diaspora) ; le moteur les sert sans la
 * connaître. Au plus quatre, chacune jugée contre les portées du réseau.
 */
export type FeedLane = { reach: string; country?: string }

export const FEED_LANES_MAX = 4

export function normalizeFeedLanes(lanes: readonly FeedLane[], reachValues: readonly string[]): FeedLane[] {
  if (lanes.length === 0 || lanes.length > FEED_LANES_MAX) throw new DomainViolation("FEED_LANES_INVALID", { max: FEED_LANES_MAX })
  const out: FeedLane[] = []
  const keys = new Set<string>()
  for (const lane of lanes) {
    if (!reachValues.includes(lane.reach)) throw new DomainViolation("POST_REACH_INVALID")
    const country = lane.country?.trim().toUpperCase()
    if (country !== undefined && !COUNTRY_CODE.test(country)) throw new DomainViolation("POST_COUNTRY_INVALID")
    const key = `${lane.reach}|${country ?? "*"}`
    if (keys.has(key)) continue
    keys.add(key)
    out.push(country === undefined ? { reach: lane.reach } : { reach: lane.reach, country })
  }
  return out
}

/**
 * Une publication vide ou trop longue n'est pas une publication.
 *
 * ⚠️ Ne juge QUE le texte. Une publication portée par un média ou par un
 * partage passe par `assertPostContent`, qui rend le corps optionnel.
 */
export function assertPersonalPostBody(body: string): string {
  const trimmed = body.trim()
  if (trimmed.length === 0) throw new DomainViolation("POST_EMPTY")
  if (trimmed.length > PERSONAL_POST_MAX_LENGTH) {
    throw new DomainViolation("POST_TOO_LONG", { max: PERSONAL_POST_MAX_LENGTH })
  }
  return trimmed
}

/** Un commentaire vide ou trop long n'est pas un commentaire. */
export function assertPersonalCommentBody(body: string): string {
  const trimmed = body.trim()
  if (trimmed.length === 0) throw new DomainViolation("COMMENT_EMPTY")
  if (trimmed.length > PERSONAL_COMMENT_MAX_LENGTH) {
    throw new DomainViolation("COMMENT_TOO_LONG", { max: PERSONAL_COMMENT_MAX_LENGTH })
  }
  return trimmed
}

// ═══════════════════════════════════════════════════════════════
// Profil : publication, découvrabilité, handle, accroche
// ═══════════════════════════════════════════════════════════════

/** Vue structurelle d'un profil — le domaine pur ne dépend pas des types générés. */
export interface ProfileVisibilityFacets {
  withdrawnAt?: number
  privateAt?: number
}

/**
 * Le profil EXISTE-t-il encore ? Se dépublier neutralise l'affichage partout ;
 * c'est le seul état qui rend une personne anonyme aux yeux de tous.
 */
export function isProfilePublished(profile: ProfileVisibilityFacets): boolean {
  return profile.withdrawnAt === undefined
}

/**
 * Le profil est-il DÉCOUVRABLE ? Publié ET non privé.
 *
 * ⚠️ Une recherche ou une suggestion exige la DÉCOUVRABILITÉ, sinon le mode
 * privé ne cache personne ; l'affichage d'un nom déjà connu (fil, connexions,
 * conversation) n'exige que la PUBLICATION, sinon passer en privé anonymiserait
 * rétroactivement toutes ses publications — ce qui est la dépublication.
 */
export function isProfileDiscoverable(profile: ProfileVisibilityFacets): boolean {
  return isProfilePublished(profile) && profile.privateAt === undefined
}

/**
 * Le handle d'une personne : insensible à la casse et aux espaces — deux
 * graphies ne désignent pas deux personnes. Jeu de caractères volontairement
 * étroit (lettres ASCII, chiffres, point, tiret, souligné) : un handle sert
 * d'ADRESSE, et les homoglyphes Unicode fabriquent des adresses qui se
 * ressemblent sans être les mêmes.
 */
export function normalizeHandle(raw: string): string {
  return raw.trim().toLowerCase()
}

export function assertHandle(raw: string): string {
  const handle = normalizeHandle(raw)
  if (handle.length < HANDLE_MIN_LENGTH || handle.length > HANDLE_MAX_LENGTH) {
    throw new DomainViolation("HANDLE_LENGTH", { min: HANDLE_MIN_LENGTH, max: HANDLE_MAX_LENGTH })
  }
  if (!/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/.test(handle)) {
    throw new DomainViolation("HANDLE_CHARSET")
  }
  return handle
}

/**
 * Le nom AFFICHÉ : ce que la personne publie, jamais un état civil recopié.
 * La borne était écrite en ligne dans `publishMyProfile` au socle ; elle devient
 * une règle du domaine, partagée avec l'écran.
 */
export function assertDisplayName(raw: string): string {
  const name = raw.trim()
  if (name.length === 0 || name.length > DISPLAY_NAME_MAX_LENGTH) {
    throw new DomainViolation("DISPLAY_NAME_LENGTH", { min: 1, max: DISPLAY_NAME_MAX_LENGTH })
  }
  return name
}

export function assertHeadline(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined
  const trimmed = raw.trim()
  if (trimmed.length === 0) return undefined
  if (trimmed.length > HEADLINE_MAX_LENGTH) {
    throw new DomainViolation("HEADLINE_TOO_LONG", { max: HEADLINE_MAX_LENGTH })
  }
  return trimmed
}

export function assertConnectionMessage(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined
  const trimmed = raw.trim()
  if (trimmed.length === 0) return undefined
  if (trimmed.length > CONNECTION_MESSAGE_MAX_LENGTH) {
    throw new DomainViolation("CONNECTION_MESSAGE_TOO_LONG", { max: CONNECTION_MESSAGE_MAX_LENGTH })
  }
  return trimmed
}

// ═══════════════════════════════════════════════════════════════
// Visibilité d'une publication par AUDIENCE — LA règle
// ═══════════════════════════════════════════════════════════════

/**
 * Ce que le serveur sait du LIEN entre le lecteur et la publication au moment
 * de juger. Tous relus À L'ACTE — jamais mis en cache sur la ligne : rompre un
 * lien referme aussitôt ce qu'il ouvrait.
 *
 * `isFollowing` n'en fait PAS partie, et c'est le cœur de la règle : un abonné
 * ne peut rien voir de plus qu'un inconnu.
 */
export type PostReadContext = {
  isAuthor: boolean
  /** Connexion ACCEPTÉE avec l'auteur — le seul lien qui ouvre `connections`. */
  isConnected: boolean
  /**
   * Membre VIVANT du groupe de la publication. `false` pour toute publication
   * sans groupe — et quand l'appelant ne charge pas les appartenances (le fil,
   * la recherche, les murs) : le refus par défaut est le bon défaut.
   */
  isGroupMember: boolean
  /**
   * Blocage entre lecteur et auteur, dans un sens ou dans l'autre. Il ne
   * RESTREINT que l'audience `group` : une connexion bloquée n'est plus
   * `accepted` (le blocage ferme déjà `connections`), et le mur d'une personne
   * refuse plus haut. Dans un groupe, deux personnes bloquées restent côte à
   * côte : sans ce fait, l'appartenance commune contournerait le blocage.
   */
  isBlockedWithAuthor: boolean
  /**
   * Abonné à la PAGE de la publication, ou son signataire VIVANT — le seul fait
   * qui ouvre l'audience `followers`. `false` pour toute publication sans page,
   * et quand l'appelant ne le charge pas : le refus par défaut est le bon défaut.
   */
  isPageAudience: boolean
}

/**
 * Une publication est-elle visible par ce lecteur, au sein d'un réseau ? LA
 * règle d'audience, évaluée côté serveur À CHAQUE LECTURE, après la garde du
 * réseau (`isVisibleTo` dans `./visibility.ts`) :
 *
 *  1. une publication retirée ne reste lisible que par son auteur ;
 *  2. son auteur voit toujours sa publication vivante ;
 *  3. l'audience tranche : `public` pour tous les membres, `connections` pour
 *     les connexions acceptées, `group` pour les membres vivants non bloqués,
 *     `followers` pour les abonnés et signataires vivants de la page.
 */
export function isPersonalPostVisibleTo(
  input: { audience: PersonalPostAudience; status: PersonalPostStatus } & PostReadContext,
): boolean {
  if (input.status !== "published") return input.isAuthor
  if (input.isAuthor) return true
  switch (input.audience) {
    case "public":
      return true
    case "connections":
      return input.isConnected
    case "group":
      return input.isGroupMember && !input.isBlockedWithAuthor
    case "followers":
      return input.isPageAudience
  }
}

/**
 * À quel TITRE le lecteur voit-il cette publication ?
 *
 * ⚠️ `public` n'est PAS un titre d'entrée dans le fil « Pour vous » : voir une
 * publication et la recevoir dans son fil sont deux choses différentes. Le fil
 * est le produit de CHOIX (connexions, abonnements).
 */
export type FeedReason =
  | "own"
  | "connection"
  | "follow"
  | "public"
  /** Membre du groupe où la publication a été postée (mur de groupe seulement). */
  | "group"
  /**
   * La publication vient d'une PAGE que je suis. Il n'ouvre rien — les
   * publications de page sont toujours `public` — il explique une présence dans
   * le fil, comme `follow` pour une personne.
   */
  | "page"

/** Les titres, en liste — pour le validateur du DTO côté serveur. */
export const FEED_REASONS = ["own", "connection", "follow", "public", "group", "page"] as const satisfies readonly FeedReason[]

/**
 * Pourquoi cette ligne entre-t-elle dans MON fil ? Un seul ordre de priorité —
 * le plus fort gagne. `null` : la publication n'entre pas.
 */
export function feedReasonFor(input: {
  isAuthor: boolean
  isConnected: boolean
  isFollowing: boolean
  audience: PersonalPostAudience
}): Exclude<FeedReason, "public" | "group" | "page"> | null {
  if (input.isAuthor) return "own"
  if (input.isConnected) return "connection"
  if (!input.isFollowing) return null
  // ⚠️ LA garde à ne pas relâcher : un abonnement n'ouvre que le `public`.
  return input.audience === "public" ? "follow" : null
}

/**
 * À quel titre je vois CETTE publication, reçue au fil ou ouverte par un lien.
 * Ici l'absence de lien n'est pas un refus : la garde d'audience a déjà
 * tranché. Ne s'applique qu'aux audiences de PORTÉE (`public`, `connections`).
 */
export function viewingReasonFor(input: { isAuthor: boolean; isConnected: boolean; isFollowing: boolean }): FeedReason {
  if (input.isAuthor) return "own"
  if (input.isConnected) return "connection"
  if (input.isFollowing) return "follow"
  return "public"
}

/** Le titre de lecture d'une publication de GROUPE : la sienne, ou celle d'un membre. */
export function groupViewingReasonFor(input: { isAuthor: boolean }): FeedReason {
  return input.isAuthor ? "own" : "group"
}

// ═══════════════════════════════════════════════════════════════
// Portées du fil — les « chips »
// ═══════════════════════════════════════════════════════════════

/**
 * Les façons de composer le fil.
 *
 *  · `pour_vous` — ce que mes liens choisis ont publié ;
 *  · `recents` — tout ce que j'ai le DROIT de voir, du plus récent au plus
 *    ancien, sans pondération par le lien : un fil de découverte.
 */
export const FEED_SCOPES = ["pour_vous", "recents"] as const
export type FeedScope = (typeof FEED_SCOPES)[number]

/** Portée servie quand rien n'est demandé. */
export const FEED_SCOPE_DEFAULT: FeedScope = "pour_vous"

/**
 * Admission d'une ligne au fil, PAR PORTÉE.
 *
 * ⚠️ INVARIANT NON NÉGOCIABLE : la garde d'audience est évaluée EN PREMIER et
 * à l'identique dans toutes les portées. Une portée ne peut que RÉTRÉCIR ce
 * que la garde a laissé passer — jamais l'élargir. Une portée future passera
 * par ici et héritera de la même barrière.
 *
 * `pour_vous` DÉLÈGUE verbatim à `feedReasonFor` : un test compare les deux
 * sorties ligne à ligne.
 */
export function feedAdmissionFor(input: {
  scope: FeedScope
  isAuthor: boolean
  isConnected: boolean
  isFollowing: boolean
  audience: PersonalPostAudience
}): FeedReason | null {
  // 0. Une publication de GROUPE n'entre dans AUCUNE portée du fil — pour son
  // auteur comme pour les membres : elle vit sur le mur de son groupe, le seul
  // lieu qui charge l'appartenance et le blocage qu'exige sa garde.
  if (input.audience === "group") return null

  // 1. LA garde — la même règle que la lecture unitaire, jamais réécrite. Le
  // fil ne balaie que des publications vivantes, d'où le littéral.
  const visible = isPersonalPostVisibleTo({
    audience: input.audience,
    status: "published",
    isAuthor: input.isAuthor,
    isConnected: input.isConnected,
    isGroupMember: false,
    isBlockedWithAuthor: false,
    // Une publication de PAGE n'arrive jamais ici (sa règle : `pageFeedAdmissionFor`).
    isPageAudience: false,
  })
  if (!visible) return null

  // 2. La portée RESTREINT ce qui a franchi la garde.
  switch (input.scope) {
    case "pour_vous":
      return feedReasonFor(input)
    case "recents":
      return viewingReasonFor(input)
  }
}

// ═══════════════════════════════════════════════════════════════
// Forme d'une publication de groupe ou de page
// ═══════════════════════════════════════════════════════════════

/**
 * L'INVARIANT de forme d'une publication de groupe : `groupId` présent SI ET
 * SEULEMENT SI l'audience est `group`. Tenu au point d'écriture UNIQUE.
 */
export function assertGroupAudienceShape(input: { audience: PersonalPostAudience; hasGroup: boolean }): void {
  if (input.audience === "group" && !input.hasGroup) {
    throw new DomainViolation("POST_GROUP_REQUIRED")
  }
  if (input.audience !== "group" && input.hasGroup) {
    throw new DomainViolation("POST_GROUP_FORBIDDEN")
  }
}

/**
 * Un PARTAGE ne se publie pas dans un groupe : le mur d'un groupe porte des
 * contributions, et y republier le fil général n'aurait d'autre effet que de
 * l'y dupliquer.
 */
export function assertShareOutsideGroup(input: { hasGroup: boolean; hasShare: boolean }): void {
  if (input.hasGroup && input.hasShare) throw new DomainViolation("POST_SHARE_IN_GROUP")
}

/**
 * Une publication de GROUPE s'épingle dans son groupe, jamais sur un mur
 * personnel qu'elle ne peut pas habiter ; une publication de PAGE appartient à
 * la page, pas à son signataire.
 */
export function assertPinnableOnWall(input: { audience: PersonalPostAudience; hasPage: boolean }): void {
  if (input.audience === "group") throw new DomainViolation("POST_PIN_GROUP")
  if (input.hasPage) throw new DomainViolation("POST_PIN_PAGE")
}

/**
 * La FORME d'une publication de PAGE, tenue au point d'écriture unique. Quatre
 * interdits, chacun pour une raison différente :
 *  · une page publie pour tous les membres (`public`) ou pour ses abonnés
 *    (`followers`) — elle n'a pas de connexions, et `connections` se jugerait
 *    sur le signataire, donc sur une personne ;
 *  · `followers` n'existe qu'avec une page : l'abonnement à une PERSONNE
 *    n'ouvre rien de plus que le `public` ;
 *  · une publication de page n'entre pas dans un groupe thématique — le mur
 *    d'un groupe appartient à ses membres ;
 *  · une page ne PARTAGE pas — republier le propos d'un tiers sous l'identité
 *    d'une page lui prêterait un endossement que personne n'a signé.
 *
 * Appelée pour TOUTE publication.
 */
export function assertPageAudienceShape(input: {
  audience: PersonalPostAudience
  hasPage: boolean
  hasGroup: boolean
  hasShare: boolean
}): void {
  if (!input.hasPage) {
    if (input.audience === "followers") throw new DomainViolation("POST_FOLLOWERS_REQUIRES_PAGE")
    return
  }
  if (input.audience !== "public" && input.audience !== "followers") throw new DomainViolation("PAGE_POST_AUDIENCE_INVALID")
  if (input.hasGroup) throw new DomainViolation("PAGE_POST_FORBIDS_GROUP")
  if (input.hasShare) throw new DomainViolation("PAGE_POST_FORBIDS_SHARE")
}
