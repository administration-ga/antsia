// Dupliqué de socle/packages/agent-features/src/features/reseau-albums/album-model.ts @ ad2e7fdc2 — adaptations : bornes, audiences et états lus dans le domaine du moteur (`@antsia/social-domain/albums`) ; phrases traduites par l'i18n (`t` en DERNIER paramètre, clés qualifiées `albums:albumModel.*`) — les tables de libellés deviennent des fonctions (`albumStepLabel`, `albumAudienceLabel`, `albumAudienceHint`, `albumStatusLabel`, `albumWithdrawNotice`), « réseau des agents » devient « réseau », les accords passent par les pluriels de l'i18n ; adresses COMPOSÉES depuis la base du profil que sert l'application (`useRoutes().profile(handle)`, premier paramètre de `albumHref`, `albumBackHref` et `albumsTabHref`) au lieu de chemins de l'espace agent écrits en dur ; `moveAlbumItem` et `orderChanged` génériques sur le type d'identifiant ; ajouts : `albumEngineErrorText` (refus du moteur par sa règle ou son code, jamais le texte brut du serveur) et `albumAddBatches` (lots d'ajout bornés par `ALBUM_ADD_BATCH_MAX`, que le moteur refuse au-delà) ; SD-02 : le format de sortie de `albumReencodePlan` est typé (JPEG ou PNG), pour le module partagé de ré-encodage.
/**
 * album-model — CE QUI DÉCIDE dans le parcours d'album, hors de tout composant.
 *
 * Les étapes du composeur, la progression par fichier, le déplacement au
 * clavier, la décision de ré-encodage, les adresses et les phrases vivent ici,
 * où c'est testé en `node` sans monter d'écran.
 *
 * ⚠️ Ce module ne connaît NI React, NI le moteur, NI le DOM. Le ré-encodage
 * lui-même (canvas) est exécuté par le composeur ; ce fichier n'en porte que la
 * DÉCISION — ce qui la rend vérifiable sans navigateur.
 *
 * ⚠️ Les phrases passent par l'i18n : chaque fonction qui parle reçoit `t` en
 * DERNIER paramètre et n'emploie que des clés qualifiées
 * (`albums:albumModel.…`), que n'importe quel `t` du moteur résout. Les
 * adresses ne s'écrivent pas ici : l'application sert le profil
 * (`useRoutes().profile(handle)`), ce module n'y ajoute que le chemin de
 * l'album.
 */

import { engineErrorCode, engineErrorRule } from "@antsia/social-contracts/errors"
import {
  ALBUM_ADD_BATCH_MAX,
  ALBUM_ITEMS_MAX,
  ALBUM_TITLE_MAX,
  type AlbumAudience,
  type AlbumStatus,
} from "@antsia/social-domain/albums"
import type { TFunction } from "i18next"

// ═══════════════════════════════════════════════════════════════
// Les étapes du composeur
// ═══════════════════════════════════════════════════════════════

/**
 * Quatre étapes, dans cet ordre : titre et audience → photos → ordre et
 * couverture → aperçu.
 *
 * L'aperçu n'est pas une politesse : c'est le moment où l'on voit ce que
 * l'audience choisie donnera à voir, AVANT que quoi que ce soit ne devienne
 * visible (le plan 09D l'exige, et l'ADR-0145 §3 en fait la règle).
 */
export const ALBUM_STEPS = ["identite", "photos", "ordre", "apercu"] as const
export type AlbumStep = (typeof ALBUM_STEPS)[number]

/** Le libellé d'une étape, dans la langue courante. */
export function albumStepLabel(step: AlbumStep, t: TFunction): string {
  return t(`albums:albumModel.steps.${step}`)
}

export function nextAlbumStep(step: AlbumStep): AlbumStep {
  const index = ALBUM_STEPS.indexOf(step)
  return ALBUM_STEPS[Math.min(index + 1, ALBUM_STEPS.length - 1)]!
}

export function previousAlbumStep(step: AlbumStep): AlbumStep {
  const index = ALBUM_STEPS.indexOf(step)
  return ALBUM_STEPS[Math.max(index - 1, 0)]!
}

/**
 * Ce qui empêche d'avancer, en une phrase — ou `null`.
 *
 * Le refus est rendu comme un TEXTE et non comme un booléen : un bouton
 * désactivé sans raison est une impasse muette, et c'est ce texte que l'écran
 * annonce.
 */
export function albumStepBlocker(
  input: {
    step: AlbumStep
    title: string
    photoCount: number
  },
  t: TFunction,
): string | null {
  switch (input.step) {
    case "identite":
      if (input.title.trim().length === 0) return t("albums:albumModel.blocker.titleRequired")
      if (input.title.trim().length > ALBUM_TITLE_MAX) {
        return t("albums:albumModel.blocker.titleTooLong", { max: ALBUM_TITLE_MAX })
      }
      return null
    case "photos":
      return input.photoCount === 0 ? t("albums:albumModel.blocker.photoRequired") : null
    case "ordre":
    case "apercu":
      return input.photoCount === 0 ? t("albums:albumModel.blocker.photoRequired") : null
  }
}

// ═══════════════════════════════════════════════════════════════
// Progression PAR FICHIER
// ═══════════════════════════════════════════════════════════════

export type AlbumUploadState = "pending" | "uploaded" | "failed"

export type AlbumUploadProgress = {
  total: number
  uploaded: number
  failed: number
  pending: number
  /** Entier 0-100 — jamais une fraction à afficher. */
  percent: number
  /** La phrase annoncée en `aria-live`, seule source du texte de progression. */
  label: string
  /** Reste-t-il quelque chose à envoyer ? (la reprise se juge là-dessus) */
  hasWork: boolean
}

/**
 * Où en est le lot, fichier par fichier.
 *
 * ⚠️ Un échec ne remet PAS le compteur à zéro : les octets déjà déposés sont
 * acquis, et le renvoi ne re-téléverse que le reste (`useMediaDraft.upload`
 * saute ce qui est `uploaded`). C'est ce que « reprise après upload partiel »
 * veut dire, et le libellé doit le dire à l'usager plutôt que de le laisser
 * croire qu'il recommence tout.
 */
export function albumUploadProgress(
  items: readonly { upload: { status: AlbumUploadState } }[],
  t: TFunction,
): AlbumUploadProgress {
  const total = items.length
  const uploaded = items.filter((i) => i.upload.status === "uploaded").length
  const failed = items.filter((i) => i.upload.status === "failed").length
  const pending = total - uploaded - failed
  const percent = total === 0 ? 0 : Math.round((uploaded / total) * 100)
  const hasWork = pending + failed > 0
  let label: string
  if (total === 0) label = t("albums:albumModel.progress.none")
  else if (!hasWork) label = t("albums:albumModel.progress.done", { count: uploaded })
  else if (failed > 0) {
    label = t("albums:albumModel.progress.partial", { uploaded, total, failed })
  } else label = t("albums:albumModel.progress.running", { uploaded, total })
  return { total, uploaded, failed, pending, percent, label, hasWork }
}

// ═══════════════════════════════════════════════════════════════
// Ordre — au clavier ET au doigt, la même fonction
// ═══════════════════════════════════════════════════════════════

/**
 * Déplacer une photo d'un cran.
 *
 * Rend TOUJOURS une liste (jamais `null`) : aux extrémités, c'est la même
 * liste, et l'appelant n'a pas de cas particulier à écrire. Une liste
 * inchangée se reconnaît par égalité de contenu, pas par une valeur sentinelle.
 */
export function moveAlbumItem<T extends string>(
  order: readonly T[],
  itemId: T,
  direction: "up" | "down",
): T[] {
  const index = order.indexOf(itemId)
  if (index === -1) return [...order]
  const target = direction === "up" ? index - 1 : index + 1
  if (target < 0 || target >= order.length) return [...order]
  const next = [...order]
  const [moved] = next.splice(index, 1)
  next.splice(target, 0, moved!)
  return next
}

/** Le déplacement a-t-il changé quelque chose ? (pour n'appeler le serveur qu'alors) */
export function orderChanged<T extends string>(
  before: readonly T[],
  after: readonly T[],
): boolean {
  if (before.length !== after.length) return true
  return before.some((id, index) => id !== after[index])
}

/** Ce qu'annonce un déplacement — sinon le clavier bouge une carte en silence. */
export function moveAnnouncement(
  input: {
    position: number
    total: number
    caption?: string
  },
  t: TFunction,
): string {
  const caption = input.caption?.trim()
  return caption && caption.length > 0
    ? t("albums:albumModel.move.named", { caption, position: input.position, total: input.total })
    : t("albums:albumModel.move.unnamed", { position: input.position, total: input.total })
}

/**
 * Les LOTS d'un ajout de photos : le moteur refuse un appel `addItems` de plus
 * de `ALBUM_ADD_BATCH_MAX` photos (règle `ALBUM_BATCH_TOO_LARGE`), quand un
 * album en porte jusqu'à `ALBUM_ITEMS_MAX`. Les lots gardent l'ORDRE de la
 * sélection, et un même brouillon donne toujours les mêmes lots : la reprise
 * après coupure renvoie exactement ce qu'elle avait envoyé.
 */
export function albumAddBatches<T>(items: readonly T[], size: number = ALBUM_ADD_BATCH_MAX): T[][] {
  const step = Math.max(1, Math.trunc(size))
  const batches: T[][] = []
  for (let start = 0; start < items.length; start += step) batches.push(items.slice(start, start + step))
  return batches
}

// ═══════════════════════════════════════════════════════════════
// Métadonnées EXIF — la décision (ADR-0145 §5)
// ═══════════════════════════════════════════════════════════════

/**
 * Le format de sortie du ré-encodage.
 *
 * PNG reste PNG — la transparence est portante et JPEG la perdrait. Tout le
 * reste sort en JPEG.
 */
export const ALBUM_REENCODE_QUALITY = 0.92

export type AlbumReencodePlan =
  | { action: "reencode"; targetType: "image/jpeg" | "image/png" }
  | { action: "refuse"; reason: string }

/**
 * Que faire de ce fichier avant de le téléverser ?
 *
 * **Toute image est ré-encodée** : le décodage-réencodage sur canvas ne recopie
 * aucun bloc EXIF, donc ni date, ni modèle d'appareil, ni coordonnées GPS ne
 * partent avec la photo. Il n'y a pas de cas « on laisse passer » — ce serait
 * la seule photo dont les métadonnées voyageraient, et personne ne saurait
 * laquelle.
 *
 * ⚠️ Le GIF est REFUSÉ, et c'est le seul refus de format propre au composeur :
 * ré-encoder un GIF animé n'en garderait que la première image, silencieusement.
 * Le serveur, lui, accepte le format (il partage la liste du fil) — c'est bien
 * une règle de ce parcours, énoncée à l'usager, pas une garde de sécurité.
 */
export function albumReencodePlan(mimeType: string, t: TFunction): AlbumReencodePlan {
  if (mimeType === "image/gif") {
    return {
      action: "refuse",
      reason: t("albums:albumModel.reencode.gifRefused"),
    }
  }
  if (mimeType === "image/png") {
    return { action: "reencode", targetType: "image/png" }
  }
  return { action: "reencode", targetType: "image/jpeg" }
}

/** Le refus opposé quand le ré-encodage a échoué — fail-closed, jamais l'original. */
export function reencodeFailureMessage(fileName: string, t: TFunction): string {
  return t("albums:albumModel.reencode.failed", { name: fileName })
}

// ═══════════════════════════════════════════════════════════════
// Refus du moteur
// ═══════════════════════════════════════════════════════════════

/**
 * Le texte d'un refus du MOTEUR, traduit : la règle du domaine enfreinte
 * (espace `rules`, avec ses bornes en paramètres), sinon le code du moteur
 * (espace `errors`), sinon la phrase générique de l'écran (`fallbackKey`, clé
 * qualifiée). Jamais le texte brut du serveur : en production il est caviardé,
 * et il n'est pas traduit.
 */
export function albumEngineErrorText(error: unknown, fallbackKey: string, t: TFunction): string {
  const rule = engineErrorRule(error)
  if (rule !== null) return t(`rules:${rule.rule}`, rule.params)
  const code = engineErrorCode(error)
  if (code !== null) return t(`errors:${code}`)
  return t(fallbackKey)
}

// ═══════════════════════════════════════════════════════════════
// Libellés et adresses
// ═══════════════════════════════════════════════════════════════

/** Les deux portées d'un album — celles du réseau personnel, lues au domaine. */
export type AlbumAudienceChoice = AlbumAudience
export type AlbumStatusValue = AlbumStatus

/** Le nom d'une audience. */
export function albumAudienceLabel(audience: AlbumAudienceChoice, t: TFunction): string {
  return t(`albums:albumModel.audience.${audience}`)
}

/**
 * Ce que l'audience veut dire, en clair. « Tout le réseau » n'est PAS
 * « Internet » : le dire évite qu'on publie en croyant restreindre, ou
 * l'inverse (ADR-0145 §2).
 */
export function albumAudienceHint(audience: AlbumAudienceChoice, t: TFunction): string {
  return t(`albums:albumModel.audienceHint.${audience}`)
}

/** Le nom d'un état d'album. */
export function albumStatusLabel(status: AlbumStatusValue, t: TFunction): string {
  return t(`albums:albumModel.status.${status}`)
}

/**
 * ⚠️ La phrase que l'interface DOIT dire avant un retrait — le plan §2.1
 * l'exige, et elle vaut pour les albums comme pour les replays : une
 * restriction ultérieure ne rappelle pas une copie déjà téléchargée.
 */
export function albumWithdrawNotice(t: TFunction): string {
  return t("albums:albumModel.withdrawNotice")
}

/**
 * L'adresse d'un album — une seule construction, jamais recopiée dans un JSX.
 *
 * `profileHref` est l'adresse du profil SERVIE par l'application
 * (`useRoutes().profile(handle)`, qui échappe le handle) : ce module n'y ajoute
 * que le chemin de l'album, l'identifiant échappé.
 */
export function albumHref(profileHref: string, albumId: string): string {
  return `${profileHref}/albums/${encodeURIComponent(albumId)}`
}

/** Le retour depuis la galerie : le profil qui la porte, tel que l'application le sert. */
export function albumBackHref(profileHref: string): string {
  return profileHref
}

/**
 * L'ONGLET « Albums » du profil public — le seul endroit d'où l'on crée.
 *
 * ⚠️ Ces trois littéraux sont un CONTRAT entre deux fichiers qui ne se
 * connaissent pas : `creation-controller.ts` (réseau personnel) fabrique
 * l'adresse, `ProfilPersonnePage.tsx` la lit. Les recopier des deux côtés
 * ferait diverger la porte et la serrure au premier renommage.
 */
export const ALBUM_TAB_ID = "albums"
export const ALBUM_TAB_PARAM = "onglet"
export const ALBUM_NEW_PARAM = "nouveau"

/**
 * L'adresse de l'onglet Albums d'un profil — avec, si on le demande,
 * l'INTENTION d'ouvrir le composeur (`?nouveau=1`).
 *
 * L'intention voyage par l'URL et non par un état partagé : « Créer → Album »
 * part d'une autre page (le fil, la commande flottante du téléphone), et un
 * état de module ne survivrait pas à la navigation qui les sépare.
 *
 * `profileHref` : l'adresse du profil servie par l'application
 * (`useRoutes().profile(handle)`).
 */
export function albumsTabHref(
  profileHref: string,
  options: { create?: boolean } = {},
): string {
  const base = `${albumBackHref(profileHref)}?${ALBUM_TAB_PARAM}=${ALBUM_TAB_ID}`
  return options.create === true ? `${base}&${ALBUM_NEW_PARAM}=1` : base
}

/** Ce que dit une absence d'album — jamais la même phrase pour soi et pour autrui. */
export function albumsEmptyText(isSelf: boolean, t: TFunction): string {
  return isSelf ? t("albums:albumModel.empty.self") : t("albums:albumModel.empty.other")
}

/** Le décompte d'un album, accordé. */
export function albumCountLabel(count: number, t: TFunction): string {
  if (count === 0) return t("albums:albumModel.count.none")
  return t("albums:albumModel.count.photos", { count })
}

/** Ce qui reste de place — utile avant d'ouvrir le sélecteur de fichiers. */
export function remainingSlots(current: number): number {
  return Math.max(0, ALBUM_ITEMS_MAX - current)
}
