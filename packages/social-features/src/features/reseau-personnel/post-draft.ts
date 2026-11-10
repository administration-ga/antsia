// Dupliqué de socle/packages/agent-features/src/features/reseau-personnel/post-draft.ts @ ad2e7fdc2 — adaptations : audiences relues du stockage confrontées aux listes du DOMAINE du moteur (`PERSONAL_REACH_AUDIENCES` de `@antsia/social-domain/content`, `PAGE_POST_AUDIENCES` de `/pages`) au lieu de listes recopiées — l'audience de page « organisation » devient `followers` (note aux abonnés) ; la cible « page » vise une page du moteur ; commentaires rapportés à la garde des fichiers du moteur.
/**
 * post-draft — le BROUILLON de publication, hors de tout composant.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POURQUOI CE MODULE EXISTE (R-12, audit du 2026-09-06)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Le composeur portait son brouillon dans quatre `useState` — corps, audience,
 * audience de page, clé d'idempotence — et ses médias dans un hook local qui
 * révoquait ses aperçus AU DÉMONTAGE. Or les trois surfaces qui le montent
 * sont toutes démontables : la feuille immersive rend `null` quand elle se
 * ferme, la bascule 959→960 remplace l'arbre entier, et un montage en ligne
 * (mur de groupe, page) disparaît à la première navigation.
 * Fermer, tourner l'écran ou changer de volet effaçait donc le texte, les
 * médias, les téléversements DÉJÀ réussis et la clé d'idempotence.
 *
 * Ce fichier ne DÉCIDE rien à l'écran : il porte l'ÉTAT et ses transitions
 * PURES, testées en `node`. Le magasin voisin (`post-draft-store.ts`) les
 * applique et persiste ; le composeur ne fait plus que lire et écrire.
 *
 * ⚠️ **Ce qui n'est PAS sérialisable ne l'est pas.** Un `File` et une URL
 * `blob:` n'ont de sens que dans l'onglet qui les a créés : ils vivent dans un
 * registre RUNTIME (`post-draft-store.ts`), jamais dans ce qu'on écrit en
 * `sessionStorage`. Après un rechargement, un média dont le fichier n'a pas
 * été téléversé n'est PAS récupérable — `unrecoverableMedia` le nomme, et
 * l'écran demande de le resélectionner. Conserver son nom et prétendre l'avoir
 * sauvegardé serait un mensonge d'écran (PLAN §5 lot 04, item 3).
 *
 * ⚠️ **La clé d'idempotence ne tourne qu'au SUCCÈS.** C'est l'invariant qui
 * rend un renvoi sûr : le serveur reconnaît le rejeu (index
 * `by_author_and_idempotencyKey`) au lieu de publier deux fois. La rotation
 * n'est donc offerte que par `clearDraft` (appelé après publication) et par
 * `draftRotateKey`, jamais par une transition d'échec.
 *
 * Aucun import React ni Convex : ce module ne connaît que des données.
 */

import { PERSONAL_REACH_AUDIENCES } from "@antsia/social-domain/content"
import { PAGE_POST_AUDIENCES } from "@antsia/social-domain/pages"
import { isProvinceSlug, type ProvinceSlug } from "@antsia/social-domain/provinces"

import {
  DEFAULT_AUDIENCE,
  DEFAULT_PAGE_AUDIENCE,
  type PageAudience,
  type ReachAudience,
} from "./shared"

// ═══════════════════════════════════════════════════════════════
// La CIBLE d'un brouillon — un brouillon par lieu de publication
// ═══════════════════════════════════════════════════════════════

/**
 * Où part la publication. Trois lieux, trois brouillons distincts : le texte
 * écrit pour un groupe n'a rien à faire dans le composeur du fil, ni celui
 * d'une page — qu'on signe — dans celui de son autrice.
 */
export type PostDraftTarget =
  | { kind: "feed" }
  | { kind: "group"; groupId: string }
  | { kind: "page"; pageId: string }

/** La clé de stockage d'une cible — opaque, stable, comparable. */
export function postDraftKey(target: PostDraftTarget): string {
  switch (target.kind) {
    case "feed":
      return "feed"
    case "group":
      return `group:${target.groupId}`
    case "page":
      return `page:${target.pageId}`
  }
}

/** Une clé relue du stockage est-elle une clé de cible ? */
export function isPostDraftKey(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) return false
  if (value === "feed") return true
  const separator = value.indexOf(":")
  if (separator <= 0 || separator === value.length - 1) return false
  const prefix = value.slice(0, separator)
  return prefix === "group" || prefix === "page"
}

// ═══════════════════════════════════════════════════════════════
// Les MÉDIAS d'un brouillon — et l'état de leur téléversement
// ═══════════════════════════════════════════════════════════════

export type PostDraftMediaKind = "image" | "video"

/**
 * Le sort d'un média vis-à-vis du stockage Convex.
 *
 * ⚠️ `uploaded` est ce qui rend le RENVOI sûr : au second essai, l'octet n'est
 * pas retéléversé — sans quoi chaque tentative laissait un blob orphelin. La
 * garde des fichiers du moteur exige d'ailleurs un dépôt FRAIS : un fichier
 * déjà joint à une ligne est refusé comme un doublon.
 */
export type PostDraftUpload =
  | { status: "pending" }
  | { status: "uploaded"; storageId: string; uploadedAt: number }
  | { status: "failed" }

export interface PostDraftMedia {
  /** Identité LOCALE — jamais envoyée au serveur, clé du registre runtime. */
  localId: string
  kind: PostDraftMediaKind
  altText: string
  /** Ce qui SURVIT au rechargement : le nom, pas le fichier. */
  fileName: string
  mimeType: string
  sizeBytes: number
  /** SD-03 : la durée mesurée d'une vidéo — elle survit au rechargement, comme le nom. */
  durationMs?: number
  upload: PostDraftUpload
}

// ═══════════════════════════════════════════════════════════════
// L'ÉTAT — un brouillon, puis la collection des brouillons
// ═══════════════════════════════════════════════════════════════

export interface PostDraftState {
  body: string
  audience: ReachAudience
  pageAudience: PageAudience
  /** Choix explicite, faux pour les brouillons antérieurs à PA8. */
  alsoOnRoot?: boolean
  province?: ProvinceSlug
  /** Tirée à la NAISSANCE du brouillon, renouvelée au seul succès. */
  idempotencyKey: string
  media: readonly PostDraftMedia[]
}

export interface PostDraftsState {
  /**
   * La feuille de composition est-elle ouverte ?
   *
   * Ici et non dans le contrôleur de création : c'est ce booléen-là qui doit
   * survivre au remplacement de l'arbre à 959→960→959.
   */
  composerOpen: boolean
  drafts: Readonly<Record<string, PostDraftState>>
}

/** Une clé d'idempotence neuve — le seul point d'aléa du module. */
export function newIdempotencyKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `post-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/**
 * ⚠️ UNE seule instance, gelée : `draftFor` fabrique un brouillon vide à
 * chaque lecture d'une cible encore vierge, et un tableau neuf à chaque rendu
 * ferait boucler les `useMemo` qui en dépendent.
 */
const EMPTY_MEDIA: readonly PostDraftMedia[] = Object.freeze([])

export function emptyDraft(idempotencyKey: string): PostDraftState {
  return {
    body: "",
    audience: DEFAULT_AUDIENCE,
    pageAudience: DEFAULT_PAGE_AUDIENCE,
    alsoOnRoot: false,
    idempotencyKey,
    media: EMPTY_MEDIA,
  }
}

export function initialPostDrafts(): PostDraftsState {
  return { composerOpen: false, drafts: {} }
}

/** Le brouillon d'une cible, ou un brouillon vide portant `seedKey`. */
export function draftFor(
  state: PostDraftsState,
  key: string,
  seedKey: string,
): PostDraftState {
  return state.drafts[key] ?? emptyDraft(seedKey)
}

/**
 * Rien d'écrit : ni texte, ni média. L'audience et la clé ne comptent PAS —
 * ce sont des valeurs par défaut, pas un travail de l'usager.
 */
export function isDraftEmpty(draft: PostDraftState): boolean {
  return draft.body.trim().length === 0 && draft.media.length === 0
}

/** Aucun brouillon ne porte de travail — l'état peut être remplacé sans perte. */
export function isPristine(state: PostDraftsState): boolean {
  return Object.values(state.drafts).every(isDraftEmpty)
}

/**
 * Les médias qu'on ne peut PLUS publier : leur fichier a quitté la mémoire
 * (rechargement, onglet restauré) et ils n'ont jamais été téléversés.
 *
 * ⚠️ Un média `uploaded` n'en fait pas partie : son octet est au stockage, la
 * publication n'a plus besoin du fichier — seul son APERÇU est perdu.
 */
export function unrecoverableMedia(
  draft: Pick<PostDraftState, "media">,
  hasFile: (localId: string) => boolean,
): readonly PostDraftMedia[] {
  return draft.media.filter(
    (item) => item.upload.status !== "uploaded" && !hasFile(item.localId),
  )
}

// ═══════════════════════════════════════════════════════════════
// Les TRANSITIONS d'un brouillon — pures, une par geste
// ═══════════════════════════════════════════════════════════════

export function draftSetBody(
  draft: PostDraftState,
  body: string,
): PostDraftState {
  return draft.body === body ? draft : { ...draft, body }
}

export function draftSetAudience(
  draft: PostDraftState,
  audience: ReachAudience,
): PostDraftState {
  if (draft.audience === audience && (audience === "public" || !draft.alsoOnRoot)) return draft
  return { ...draft, audience, ...(audience !== "public" ? { alsoOnRoot: false } : {}) }
}

export function draftSetPageAudience(
  draft: PostDraftState,
  pageAudience: PageAudience,
): PostDraftState {
  if (draft.pageAudience === pageAudience && (pageAudience === "public" || !draft.alsoOnRoot)) return draft
  return { ...draft, pageAudience, ...(pageAudience !== "public" ? { alsoOnRoot: false } : {}) }
}

/** Une cible de groupe n'accepte jamais de choix public. La province reste volontaire. */
export function draftSetPublication(draft: PostDraftState, key: string, choice: { alsoOnRoot: boolean; province?: ProvinceSlug }): PostDraftState {
  const eligible = key === "feed" ? draft.audience === "public" : key.startsWith("page:") && draft.pageAudience === "public"
  const alsoOnRoot = eligible && choice.alsoOnRoot === true
  const province = key.startsWith("group:") ? undefined : isProvinceSlug(choice.province) ? choice.province : undefined
  if (draft.alsoOnRoot === alsoOnRoot && draft.province === province) return draft
  return { ...draft, alsoOnRoot, province }
}

export function draftAddMedia(
  draft: PostDraftState,
  items: readonly PostDraftMedia[],
): PostDraftState {
  if (items.length === 0) return draft
  return { ...draft, media: [...draft.media, ...items] }
}

export function draftRemoveMedia(
  draft: PostDraftState,
  localId: string,
): PostDraftState {
  const media = draft.media.filter((item) => item.localId !== localId)
  return media.length === draft.media.length ? draft : { ...draft, media }
}

export function draftSetAltText(
  draft: PostDraftState,
  localId: string,
  altText: string,
): PostDraftState {
  return {
    ...draft,
    media: draft.media.map((item) =>
      item.localId === localId ? { ...item, altText } : item,
    ),
  }
}

export function draftMarkUploaded(
  draft: PostDraftState,
  localId: string,
  storageId: string,
  uploadedAt: number,
): PostDraftState {
  return {
    ...draft,
    media: draft.media.map((item) =>
      item.localId === localId
        ? { ...item, upload: { status: "uploaded", storageId, uploadedAt } }
        : item,
    ),
  }
}

export function draftMarkUploadFailed(
  draft: PostDraftState,
  localId: string,
): PostDraftState {
  return {
    ...draft,
    media: draft.media.map((item) =>
      // ⚠️ Un média DÉJÀ téléversé ne redevient jamais « en échec » : son
      // storageId reste bon, et l'oublier ferait re-téléverser au renvoi.
      item.localId === localId && item.upload.status !== "uploaded"
        ? { ...item, upload: { status: "failed" } }
        : item,
    ),
  }
}

/**
 * Renouveler la clé d'idempotence.
 *
 * ⚠️ APRÈS UN SUCCÈS SEULEMENT. Sur échec, la clé est ce qui distingue un
 * renvoi d'une seconde publication.
 */
export function draftRotateKey(
  draft: PostDraftState,
  idempotencyKey: string,
): PostDraftState {
  return { ...draft, idempotencyKey }
}

// ═══════════════════════════════════════════════════════════════
// Les TRANSITIONS de la collection
// ═══════════════════════════════════════════════════════════════

/**
 * Appliquer une transition au brouillon d'une cible, en le CRÉANT au besoin
 * (il naît alors avec `seedKey` pour clé d'idempotence).
 */
export function updateDraft(
  state: PostDraftsState,
  key: string,
  seedKey: string,
  transition: (draft: PostDraftState) => PostDraftState,
): PostDraftsState {
  const current = draftFor(state, key, seedKey)
  const next = transition(current)
  if (next === current && state.drafts[key] !== undefined) return state
  return { ...state, drafts: { ...state.drafts, [key]: next } }
}

/**
 * Publication réussie : le brouillon repart NEUF, avec une clé neuve.
 *
 * C'est le seul chemin nominal de rotation — d'où le nom explicite du
 * paramètre : on ne vide pas un brouillon sans lui donner une clé.
 */
export function clearDraft(
  state: PostDraftsState,
  key: string,
  nextIdempotencyKey: string,
): PostDraftsState {
  return {
    ...state,
    drafts: { ...state.drafts, [key]: emptyDraft(nextIdempotencyKey) },
  }
}

/** Abandon explicite : la cible perd sa ligne, il n'en reste rien. */
export function dropDraft(
  state: PostDraftsState,
  key: string,
): PostDraftsState {
  if (state.drafts[key] === undefined) return state
  const drafts = { ...state.drafts }
  delete drafts[key]
  return { ...state, drafts }
}

export function setComposerOpen(
  state: PostDraftsState,
  open: boolean,
): PostDraftsState {
  return state.composerOpen === open ? state : { ...state, composerOpen: open }
}

// ═══════════════════════════════════════════════════════════════
// SÉRIALISATION — versionnée, refus des formes antérieures
// ═══════════════════════════════════════════════════════════════

/**
 * ⚠️ Ce numéro et le suffixe de la clé de `sessionStorage`
 * (`post-draft-store.ts`) bougent ENSEMBLE — patron `messagerie-dock.ts`.
 */
export const POST_DRAFT_SERIAL_VERSION = 1

export function serializeDrafts(state: PostDraftsState): string {
  return JSON.stringify({ v: POST_DRAFT_SERIAL_VERSION, ...state })
}

/** Les audiences du DOMAINE : une valeur relue qu'il ne connaît pas retombe au défaut. */
const AUDIENCES: readonly ReachAudience[] = PERSONAL_REACH_AUDIENCES
const PAGE_AUDIENCES: readonly PageAudience[] = PAGE_POST_AUDIENCES

function parseUpload(value: unknown): PostDraftUpload | null {
  if (typeof value !== "object" || value === null) return null
  const record = value as Record<string, unknown>
  if (record.status === "pending") return { status: "pending" }
  if (record.status === "failed") return { status: "failed" }
  if (
    record.status === "uploaded" &&
    typeof record.storageId === "string" &&
    record.storageId.length > 0 &&
    typeof record.uploadedAt === "number" &&
    Number.isFinite(record.uploadedAt)
  ) {
    return {
      status: "uploaded",
      storageId: record.storageId,
      uploadedAt: record.uploadedAt,
    }
  }
  return null
}

function parseMedia(value: unknown): PostDraftMedia | null {
  if (typeof value !== "object" || value === null) return null
  const record = value as Record<string, unknown>
  const upload = parseUpload(record.upload)
  if (upload === null) return null
  if (typeof record.localId !== "string" || record.localId.length === 0)
    return null
  if (record.kind !== "image" && record.kind !== "video") return null
  if (typeof record.fileName !== "string") return null
  if (typeof record.mimeType !== "string") return null
  if (typeof record.sizeBytes !== "number" || !Number.isFinite(record.sizeBytes))
    return null
  // SD-03 : une durée relue illisible est oubliée, jamais inventée — la vidéo
  // part alors sans durée déclarée, comme d'un front antérieur.
  const durationMs =
    record.kind === "video" &&
    typeof record.durationMs === "number" &&
    Number.isFinite(record.durationMs) &&
    record.durationMs >= 0
      ? record.durationMs
      : undefined
  return {
    localId: record.localId,
    kind: record.kind,
    altText: typeof record.altText === "string" ? record.altText : "",
    fileName: record.fileName,
    mimeType: record.mimeType,
    sizeBytes: record.sizeBytes,
    ...(durationMs !== undefined ? { durationMs } : {}),
    upload,
  }
}

function parseDraft(value: unknown, key: string): PostDraftState | null {
  if (typeof value !== "object" || value === null) return null
  const record = value as Record<string, unknown>
  if (
    typeof record.idempotencyKey !== "string" ||
    record.idempotencyKey.length === 0
  ) {
    // Sans clé, un renvoi publierait deux fois : mieux vaut perdre le
    // brouillon que le publier en double.
    return null
  }
  const audience = AUDIENCES.includes(record.audience as ReachAudience)
    ? (record.audience as ReachAudience)
    : DEFAULT_AUDIENCE
  const pageAudience = PAGE_AUDIENCES.includes(record.pageAudience as PageAudience)
    ? (record.pageAudience as PageAudience)
    : DEFAULT_PAGE_AUDIENCE
  const media: PostDraftMedia[] = []
  if (Array.isArray(record.media)) {
    for (const entry of record.media) {
      const parsed = parseMedia(entry)
      if (parsed !== null) media.push(parsed)
    }
  }
  return {
    body: typeof record.body === "string" ? record.body : "",
    audience,
    pageAudience,
    alsoOnRoot: record.alsoOnRoot === true && (key === "feed" ? audience === "public" : key.startsWith("page:") && pageAudience === "public"),
    ...(isProvinceSlug(record.province) && !key.startsWith("group:") ? { province: record.province } : {}),
    idempotencyKey: record.idempotencyKey,
    media,
  }
}

export function parseDrafts(raw: string | null | undefined): PostDraftsState {
  if (raw === null || raw === undefined || raw.length === 0) {
    return initialPostDrafts()
  }
  try {
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed !== "object" || parsed === null) return initialPostDrafts()
    const record = parsed as Record<string, unknown>
    // Une forme ANTÉRIEURE est refusée en bloc : la relire à moitié rendrait
    // un brouillon dont on ne saurait pas ce qu'il porte.
    if (record.v !== POST_DRAFT_SERIAL_VERSION) return initialPostDrafts()

    const drafts: Record<string, PostDraftState> = {}
    if (typeof record.drafts === "object" && record.drafts !== null) {
      for (const [key, value] of Object.entries(
        record.drafts as Record<string, unknown>,
      )) {
        if (!isPostDraftKey(key)) continue
        const draft = parseDraft(value, key)
        if (draft === null) continue
        drafts[key] = draft
      }
    }
    // `composerOpen` par DÉFAUT faux : rouvrir une feuille que personne n'a
    // demandée volerait le focus au retour sur la page.
    return { composerOpen: record.composerOpen === true, drafts }
  } catch {
    return initialPostDrafts()
  }
}
