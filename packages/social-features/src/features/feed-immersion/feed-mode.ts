/**
 * feed-mode — le MODE d'affichage du fil (Liste ou Immersion), décidé hors
 * composant (lot P04 de l'étude social-commerce du 18/10/2026, 04 §3 ;
 * ADR-0017 §4).
 *
 *  · téléphone : Immersion par défaut, Liste toujours offerte — sauf sous
 *    l'écran des chartes (ADR-0028), où la Liste est le défaut et
 *    l'Immersion reste offerte ;
 *  · bureau : Liste par défaut, Immersion proposée ;
 *  · réduction des mouvements demandée, sans choix explicite : Liste ;
 *  · écran trop bas pour une publication par hauteur (paysage, zoom 200 %) :
 *    la Liste remplace l'Immersion pour ce scénario — plutôt que de tronquer
 *    le contenu —, sans effacer le choix de la personne ;
 *  · le choix est mémorisé PAR RÉSEAU et par pose (téléphone, bureau), sous le
 *    préfixe de stockage du réseau (`useNetwork().storagePrefix`) : la purge de
 *    déconnexion existante (`personalStateKeys`, `signOutEverywhere`) l'efface
 *    avec le reste de l'état personnel du moteur.
 *
 * Aucune donnée ni aucun droit ne dépend de ce mode : il choisit la mise en
 * page des mêmes pages du fil.
 */

export type FeedMode = "list" | "immersive"
export type FeedPose = "phone" | "desktop"

/** Le suffixe de la clé, sous le préfixe du réseau — versionné avec la forme stockée. */
export const FEED_MODE_STORAGE_SUFFIX = "feed-mode:v1"

/**
 * En dessous de cette hauteur de fenêtre (pixels CSS), une publication ne
 * tient pas avec ses actions : le fil reste en liste. Un téléphone en
 * portrait la dépasse (≈ 548 px pour le plus petit iPhone actuel, barres
 * comprises) ; un téléphone en paysage et un bureau zoomé à 200 % non.
 * Valeur initiale, à ajuster après recette.
 */
export const IMMERSIVE_MIN_VIEWPORT_HEIGHT = 480

export type StoredFeedModes = Readonly<Partial<Record<FeedPose, FeedMode>>>

const NO_STORED_MODES: StoredFeedModes = Object.freeze({})

/** La clé du choix de mode, dans le réseau de ce préfixe. */
export function feedModeStorageKey(storagePrefix: string): string {
  return `${storagePrefix}${FEED_MODE_STORAGE_SUFFIX}`
}

function isFeedMode(value: unknown): value is FeedMode {
  return value === "list" || value === "immersive"
}

/** La forme stockée, relue sans jamais lever : une valeur inconnue ne vaut rien. */
export function parseStoredFeedModes(raw: string | null): StoredFeedModes {
  if (raw === null || raw.length === 0 || raw.length > 256) return NO_STORED_MODES
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return NO_STORED_MODES
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return NO_STORED_MODES
  const phone: unknown = "phone" in parsed ? parsed.phone : undefined
  const desktop: unknown = "desktop" in parsed ? parsed.desktop : undefined
  const modes: Partial<Record<FeedPose, FeedMode>> = {}
  if (isFeedMode(phone)) modes.phone = phone
  if (isFeedMode(desktop)) modes.desktop = desktop
  return Object.keys(modes).length === 0 ? NO_STORED_MODES : Object.freeze(modes)
}

export function serializeStoredFeedModes(modes: StoredFeedModes): string {
  const out: Partial<Record<FeedPose, FeedMode>> = {}
  if (modes.phone !== undefined) out.phone = modes.phone
  if (modes.desktop !== undefined) out.desktop = modes.desktop
  return JSON.stringify(out)
}

export function withStoredFeedMode(current: StoredFeedModes, pose: FeedPose, mode: FeedMode): StoredFeedModes {
  if (current[pose] === mode) return current
  return Object.freeze({ ...current, [pose]: mode })
}

/**
 * Le mode sans choix explicite. `phoneDefault` : ce que l'application veut au
 * téléphone — l'Immersion (P04), ou la Liste de l'écran des chartes (ADR-0028).
 */
export function defaultFeedMode(pose: FeedPose, reducedMotion: boolean, phoneDefault: FeedMode = "immersive"): FeedMode {
  if (pose === "desktop") return "list"
  return reducedMotion ? "list" : phoneDefault
}

export interface FeedModeResolution {
  /** Ce que la personne a choisi, ou le défaut de sa pose. */
  preferred: FeedMode
  /** Ce qui s'affiche réellement. */
  effective: FeedMode
  /** Pourquoi l'Immersion préférée est remplacée par la Liste, le cas échéant. */
  fallback: "lowHeight" | null
  /** Le choix vient-il de la personne (et non d'un défaut) ? */
  explicit: boolean
}

export function resolveFeedMode(input: {
  pose: FeedPose
  stored: StoredFeedModes
  reducedMotion: boolean
  /** Le défaut du téléphone que l'application déclare ; l'Immersion sans valeur. */
  phoneDefault?: FeedMode
  /** Hauteur de la fenêtre en pixels CSS ; `null` tant qu'elle est inconnue. */
  viewportHeight: number | null
}): FeedModeResolution {
  const chosen = input.stored[input.pose]
  const preferred = chosen ?? defaultFeedMode(input.pose, input.reducedMotion, input.phoneDefault)
  const tooLow = input.viewportHeight !== null && Number.isFinite(input.viewportHeight) && input.viewportHeight > 0 && input.viewportHeight < IMMERSIVE_MIN_VIEWPORT_HEIGHT
  if (preferred === "immersive" && tooLow) return { preferred, effective: "list", fallback: "lowHeight", explicit: chosen !== undefined }
  return { preferred, effective: preferred, fallback: null, explicit: chosen !== undefined }
}
