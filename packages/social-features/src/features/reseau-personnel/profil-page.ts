// Réécrit d'après socle/packages/agent-features/src/features/reseau-personnel/profil-page.ts @ ad2e7fdc2 — ce qui change : la fiche d'une page à IDENTITÉ PROPRE du moteur (plus d'administration derrière) ; refus indistinct, libellés, mur vide et compteurs traduits (`t` en DERNIER paramètre, clés qualifiées `reseau:profilPage.*`, nombres mis en forme dans la langue courante, toujours sans plafond) ; le bouton de suivi et le compteur d'abonnés reprennent les décisions du volet (`followLabel`, `formatFollowerCount` : un seul mot pour un même geste) ; le droit de publier se lit dans le RÔLE VIVANT du lecteur (`viewer.role`, signataire ou administrateur) au lieu de `canPublish` ; ajouts : note de rôle, revendication et demande de vérification (`pageClaimAction`, statut, pièces jugées par la politique de dépôt), identité modifiable jugée par les règles du domaine (`checkPageIdentity`), identifiant d'un signataire à inviter, taille de page du mur. ; PA6 : préférence de fuseau injectée, calendrier grégorien et caches langue/fuseau. ; PF-03 : `preparePageImage` — logo et bannière passent par la préparation des photos (`features/media-upload` : ré-encodés, 1 024 px pour le logo, 2 048 px pour la bannière, sans métadonnées, échec fermé) avant leur dépôt ; les pièces d'une revendication n'y passent pas (des preuves, envoyées telles quelles).
/**
 * profil-page — décisions VÉRIFIABLES de la fiche d'une page (`ProfilPagePage`,
 * montée par l'application sur `useRoutes().page(handle)`).
 *
 * Ce qui se décide à l'écran — le refus indistinct, le libellé du bouton de
 * suivi, le texte d'un mur vide, les compteurs, ce que le lecteur peut faire
 * selon son rôle VIVANT sur la page, la revendication — vit ici, où c'est
 * vérifiable, et non dans le corps du composant.
 *
 * Ce module ne connaît ni React ni Convex. Les textes passent par `t`, reçu en
 * DERNIER paramètre, avec des clés QUALIFIÉES (`reseau:profilPage.…`).
 */

import type { Badge } from "@antsia/social-domain/badges"
import { formatViewerDate } from "@antsia/api/civil-date"
import {
  assertPageClaimEvidenceCount,
  assertPageName,
  normalizePageClaimNote,
  normalizePageDescription,
  normalizePageShortName,
  type PageClaimStatus,
  type PageRole,
} from "@antsia/social-domain/pages"
import { isMimeAllowedForUsage, UPLOAD_USAGES } from "@antsia/social-domain/uploadPolicy"
import { isDomainViolation, megabytes } from "@antsia/social-domain/violation"
import type { TFunction } from "i18next"

import {
  AVATAR_UPLOAD_MAX_DIMENSION,
  IMAGE_UPLOAD_MAX_DIMENSION,
  imagePreparationRefusalText,
  prepareImageForUpload,
  type ImagePreparation,
  type PrepareImageWith,
} from "../media-upload"
import { followLabel, formatFollowerCount, PAGE_ACTION_ERROR_FALLBACK_KEY } from "./pages-panel"

// ═══════════════════════════════════════════════════════════════
// Le refus indistinct
// ═══════════════════════════════════════════════════════════════

/**
 * Le refus INDISTINCT (`pages/pages.ts:getPage`) : une page inconnue, une page
 * retirée et une page d'un autre réseau rendent `null` sans distinguer les
 * cas (anti-énumération). L'écran ne doit donc jamais prononcer les mots qui
 * trancheraient entre eux — ni « retirée », ni « désactivée », ni « n'existe
 * pas ». Une régression ici est un test qui échoue (`profil-page.test.ts`).
 */
export const PAGE_REFUSAL_TITLE_KEY = "reseau:profilPage.refusalTitle"
export const PAGE_REFUSAL_BODY_KEY = "reseau:profilPage.refusalBody"

export function pageRefusalTexts(t: TFunction): { title: string; body: string } {
  return { title: t(PAGE_REFUSAL_TITLE_KEY), body: t(PAGE_REFUSAL_BODY_KEY) }
}

// ═══════════════════════════════════════════════════════════════
// Suivre, compter
// ═══════════════════════════════════════════════════════════════

/** Le bouton de suivi — la même paire de mots que dans le volet et le rail. */
export function pageFollowButtonLabel(following: boolean, t: TFunction): string {
  return followLabel(following, t)
}

/**
 * « Aucun abonné », « 1 abonné », « 4 812 abonnés » — jamais un chiffre nu,
 * jamais un plafond.
 *
 * ⚠️ Sans plafond, et c'est voulu : un plafond (« 200+ ») n'a de sens que pour
 * un total que le serveur BORNE en le comptant, et qui n'est alors qu'un
 * plancher. Les abonnés et les publications d'une page sont comptés EXACTEMENT
 * (agrégats du moteur) : les plafonner ferait mentir l'écran là où le serveur
 * dit vrai.
 */
export function pageFollowerCountLabel(count: number, t: TFunction): string {
  return formatFollowerCount(count, t)
}

/** « Aucune publication », « 1 publication », « 12 publications ». */
export function pagePostCountLabel(count: number, t: TFunction): string {
  if (count <= 0) return t("reseau:profilPage.postsNone")
  return t("reseau:profilPage.posts", { count })
}

// ═══════════════════════════════════════════════════════════════
// Le rôle du lecteur
// ═══════════════════════════════════════════════════════════════

/**
 * Parler au nom de la page exige un rôle VIVANT (`viewer.role` : invitation
 * acceptée, adhésion active, identité forte pour une page officielle) — relu
 * par le serveur à chaque lecture. Ici on ne fait que le LIRE pour
 * l'affichage ; la garde est refaite à l'écriture par `publishAsPage`.
 */
export function canPublishAsPage(role: PageRole | null): boolean {
  return role !== null
}

/** Gérer la page (identité, images, signataires) : un administrateur vivant seulement. */
export function canManagePageAs(role: PageRole | null): boolean {
  return role === "admin"
}

/** Ce que la fiche dit au lecteur qui a un rôle sur la page — rien à qui n'en a pas. */
export function pageRoleNote(role: PageRole | null, t: TFunction): string | null {
  if (role === null) return null
  return t(`reseau:profilPage.roleNote.${role}`)
}

/**
 * Le mur vide — la raison dépend de QUI regarde : celui qui peut publier ici
 * a un geste à faire, celui qui ne le peut pas n'a que l'attente.
 */
export function pageWallEmptyText(canPublish: boolean, t: TFunction): string {
  return t(canPublish ? "reseau:profilPage.wallEmptyCanPublish" : "reseau:profilPage.wallEmpty")
}

/** Taille d'une fenêtre du mur (`pagePosts` sans `limit` : le défaut du serveur). */
export const PAGE_WALL_PAGE_SIZE = 20

// ═══════════════════════════════════════════════════════════════
// Revendiquer, faire vérifier
// ═══════════════════════════════════════════════════════════════

/**
 * `claim` : prendre la main sur une page de la communauté (pièces à l'appui) ;
 * `verify` : son administrateur en demande la VÉRIFICATION.
 */
export type PageClaimAction = "claim" | "verify"

/**
 * Le geste de revendication qu'offre la fiche — la règle du domaine
 * (`assertPageClaimable`) lue côté écran :
 *
 *  · une page « Officiel » ne se revendique jamais, une page « Vérifié » non
 *    plus (une contestation passe par la modération) ;
 *  · une page de la communauté : son administrateur en demande la
 *    vérification ; un simple signataire n'a rien à demander (la page a déjà
 *    un administrateur vivant) ; un lecteur sans rôle peut la revendiquer —
 *    le serveur refusera (`PAGE_ALREADY_CLAIMED`) si un administrateur vivant
 *    la tient déjà, ce que l'écran ne peut pas savoir.
 */
export function pageClaimAction(badge: Badge, role: PageRole | null): PageClaimAction | null {
  if (badge !== "community") return null
  if (role === "admin") return "verify"
  if (role === "signatory") return null
  return "claim"
}

export function pageClaimTitle(action: PageClaimAction, t: TFunction): string {
  return t(`reseau:profilPage.claim.${action}.title`)
}

export function pageClaimIntro(action: PageClaimAction, t: TFunction): string {
  return t(`reseau:profilPage.claim.${action}.intro`)
}

/** Ce qu'une revendication porte d'utile ici (DTO de `pages.claims.paginateMyPageClaims`). */
export interface PageClaimLike {
  page: { pageId: string }
  status: PageClaimStatus
  createdAt: number
}

/** MA dernière revendication de CETTE page, ou `null` — la plus récente fait foi. */
export function latestClaimFor<T extends PageClaimLike>(claims: readonly T[], pageId: string): T | null {
  let latest: T | null = null
  for (const claim of claims) {
    if (claim.page.pageId !== pageId) continue
    if (latest === null || claim.createdAt > latest.createdAt) latest = claim
  }
  return latest
}

/** Une demande EN ATTENTE ferme le formulaire : une seule à la fois par page. */
export function claimIsPending(claim: PageClaimLike | null): boolean {
  return claim?.status === "pending"
}

/** L'état d'une revendication, dit au demandeur. */
export function claimStatusText(status: PageClaimStatus, t: TFunction): string {
  return t(`reseau:profilPage.claim.status.${status}`)
}

/** La date d'une demande, dans la langue courante. */
export function claimSubmittedText(createdAt: number, locale: string, t: TFunction, timeZone?: string): string {
  let date: string
  try {
    date = formatViewerDate(createdAt, locale, { dateStyle: "long" }, timeZone)
  } catch {
    date = new Date(createdAt).toISOString().slice(0, 10)
  }
  return t("reseau:profilPage.claim.submittedOn", { date })
}

// ═══════════════════════════════════════════════════════════════
// Fichiers : logo, bannière, pièces
// ═══════════════════════════════════════════════════════════════

/** Les usages de dépôt d'une page (registre `UPLOAD_USAGES` du domaine). */
export type PageUploadUsage = "page_logo" | "page_banner" | "page_claim_evidence"

/**
 * Le refus d'un fichier AVANT tout dépôt, avec la règle même du serveur (type
 * dans la liste blanche de l'usage, taille dans sa borne) — `null` s'il passe.
 * Le serveur rejuge à la pose (vérité du stockage, analyse).
 */
export function pageFileRefusal(usage: PageUploadUsage, file: { type: string; size: number }, t: TFunction): string | null {
  if (!isMimeAllowedForUsage(usage, file.type)) return t("rules:UPLOAD_TYPE_NOT_ALLOWED")
  const { maxBytes } = UPLOAD_USAGES[usage]
  if (file.size <= 0 || file.size > maxBytes) {
    return t("rules:UPLOAD_SIZE_OUT_OF_RANGE", { maxMegabytes: megabytes(maxBytes) })
  }
  return null
}

/** Ce qu'un champ de fichier propose de choisir : la liste blanche même de l'usage (`accept`). */
export function pageUploadAccept(usage: PageUploadUsage): string {
  return UPLOAD_USAGES[usage].mimeTypes.join(",")
}

/**
 * Le plus grand côté d'une image de page (lot PF-03) : le LOGO comme une image
 * ronde (même plafond de 5 Mio que l'usage `avatar` : un PNG de 1 024 px y
 * tient toujours), la BANNIÈRE à la borne commune de 2 048 px.
 */
export const PAGE_IMAGE_MAX_DIMENSION: Readonly<Record<"page_logo" | "page_banner", number>> = {
  page_logo: AVATAR_UPLOAD_MAX_DIMENSION,
  page_banner: IMAGE_UPLOAD_MAX_DIMENSION,
}

/** La préparation du navigateur (décodeur et canvas réels). */
const prepareInBrowser: PrepareImageWith = (file, options) => prepareImageForUpload(file, undefined, options)

/**
 * Le logo ou la bannière d'une page prêts à l'envoi, ou le refus à dire
 * (lot PF-03 ; décision du propriétaire du 9/11/2026) : le fichier choisi est
 * jugé comme avant (`pageFileRefusal`), puis préparé — ré-encodé, réduit sous
 * `PAGE_IMAGE_MAX_DIMENSION`, sans aucune métadonnée — et l'image préparée est
 * jugée à son tour. Seule elle part ; un échec refuse, jamais l'original.
 *
 * Les pièces d'une REVENDICATION n'y passent pas : ce sont des preuves (un
 * statut, un récépissé), qui doivent rester lisibles et fidèles.
 */
export async function preparePageImage(
  usage: "page_logo" | "page_banner",
  file: File,
  t: TFunction,
  prepare: PrepareImageWith = prepareInBrowser,
): Promise<{ ok: true; file: File } | { ok: false; refus: string }> {
  const avant = pageFileRefusal(usage, file, t)
  if (avant !== null) return { ok: false, refus: avant }
  let result: ImagePreparation
  try {
    result = await prepare(file, { maxDimension: PAGE_IMAGE_MAX_DIMENSION[usage] })
  } catch {
    result = { ok: false, refusal: "unreadable" }
  }
  if (!result.ok) return { ok: false, refus: imagePreparationRefusalText(result.refusal, file.name, t) }
  const apres = pageFileRefusal(usage, result.file, t)
  return apres === null ? { ok: true, file: result.file } : { ok: false, refus: apres }
}

/** Le nombre de pièces d'une revendication (une à cinq) — `null` s'il convient. */
export function claimEvidenceRefusal(count: number, t: TFunction): string | null {
  try {
    assertPageClaimEvidenceCount(count)
    return null
  } catch (error) {
    return violationText(error, t)
  }
}

/** La note d'une revendication (facultative, bornée) — `null` si elle convient. */
export function claimNoteRefusal(note: string, t: TFunction): string | null {
  try {
    normalizePageClaimNote(note)
    return null
  } catch (error) {
    return violationText(error, t)
  }
}

// ═══════════════════════════════════════════════════════════════
// Identité de la page (administrateur)
// ═══════════════════════════════════════════════════════════════

/** Ce que la fiche montre de l'identité modifiable. */
export interface PageIdentityCurrent {
  name: string
  shortName: string | null
  description: string | null
  country: string | null
}

/** Le formulaire d'identité, tel que l'administrateur le saisit (vide = absent). */
export interface PageIdentityDraft {
  name: string
  shortName: string
  description: string
  country: string | null
}

export function identityDraftOf(current: PageIdentityCurrent): PageIdentityDraft {
  return {
    name: current.name,
    shortName: current.shortName ?? "",
    description: current.description ?? "",
    country: current.country,
  }
}

/**
 * Les champs de `pages.identity.updatePageIdentity` qui CHANGENT — et
 * seulement eux : `null` efface un champ facultatif, un champ inchangé n'est
 * pas envoyé. Un correctif vide veut dire « rien à enregistrer ».
 */
export interface PageIdentityPatch {
  name?: string
  shortName?: string | null
  description?: string | null
  country?: string | null
}

export type PageIdentityField = "name" | "shortName" | "description"

export type PageIdentityCheck = { ok: true; patch: PageIdentityPatch } | { ok: false; errors: Partial<Record<PageIdentityField, string>> }

/** Juge l'identité saisie avec les règles du domaine, puis n'en retient que ce qui change. */
export function checkPageIdentity(current: PageIdentityCurrent, draft: PageIdentityDraft, t: TFunction): PageIdentityCheck {
  const errors: Partial<Record<PageIdentityField, string>> = {}
  let name = current.name
  try {
    name = assertPageName(draft.name)
  } catch (error) {
    errors.name = violationText(error, t)
  }
  let shortName: string | null = current.shortName
  try {
    shortName = normalizePageShortName(draft.shortName) ?? null
  } catch (error) {
    errors.shortName = violationText(error, t)
  }
  let description: string | null = current.description
  try {
    description = normalizePageDescription(draft.description) ?? null
  } catch (error) {
    errors.description = violationText(error, t)
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors }

  const patch: PageIdentityPatch = {}
  if (name !== current.name) patch.name = name
  if (shortName !== current.shortName) patch.shortName = shortName
  if (description !== current.description) patch.description = description
  if (draft.country !== current.country) patch.country = draft.country
  return { ok: true, patch }
}

export function isEmptyIdentityPatch(patch: PageIdentityPatch): boolean {
  return Object.keys(patch).length === 0
}

// ═══════════════════════════════════════════════════════════════
// Signataires
// ═══════════════════════════════════════════════════════════════

/**
 * L'identifiant d'une personne à inviter, tel qu'on le saisit (« @awa.ndong »
 * ou « awa.ndong ») — `null` quand il n'y a rien. Le serveur le résout parmi
 * les profils PUBLIÉS du réseau de la page (`notFound` sinon).
 */
export function signatoryHandleOf(raw: string): string | null {
  const handle = raw.trim().replace(/^@+/, "").trim()
  return handle.length > 0 ? handle : null
}

/** Le nom d'un signataire : son nom publié, à défaut son adresse, à défaut une mention neutre. */
export function signatoryDisplayName(row: { displayName: string | null; handle: string | null }, t: TFunction): string {
  const name = row.displayName?.trim() ?? ""
  if (name.length > 0) return name
  const handle = row.handle?.trim() ?? ""
  if (handle.length > 0) return `@${handle}`
  return t("reseau:profilPage.signatories.unnamed")
}

// ═══════════════════════════════════════════════════════════════

/** Le texte d'une règle du domaine enfreinte (espace `rules`, bornes interpolées). */
function violationText(error: unknown, t: TFunction): string {
  if (isDomainViolation(error)) return t(`rules:${error.code}`, error.params)
  return t(PAGE_ACTION_ERROR_FALLBACK_KEY)
}
