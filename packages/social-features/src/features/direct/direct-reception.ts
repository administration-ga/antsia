/**
 * direct-reception — ce que JE reçois d'un direct en tant que spectateur
 * (DL-04, plan 04 « Directs et conférences »), décidé hors de tout composant.
 *
 * Deux réglages, retenus sur l'appareil, PAR RÉSEAU (préfixe de stockage du
 * réseau, purgé par la porte de déconnexion comme le reste de l'état
 * personnel du moteur) :
 *
 *  · « Écouter seulement » : aucune piste VIDÉO distante n'est abonnée —
 *    caméras, partage d'écran, nouvelles pistes publiées après le choix.
 *    Le son n'est JAMAIS touché : aucune piste audio n'est désabonnée, aucune
 *    reconnexion, le rendu audio unique de la salle reste monté ;
 *  · « Image » : `auto` (le comportement d'avant ce lot, inchangé : la taille
 *    de l'image à l'écran et le réseau décident — `adaptiveStream`) ou `low`
 *    (« Économie » : la couche reçue est plafonnée à la plus basse,
 *    `setVideoQuality(VideoQuality.LOW)` de livekit-client).
 *
 * Pourquoi PAS de « haute » : avec livekit-client 2.22.3 et `adaptiveStream`
 * (option de la salle, figée — la changer recrée la salle, donc reconnecte),
 * `RemoteTrackPublication.emitTrackUpdate` demande toujours le PLUS PETIT des
 * deux : la taille affichée et le plafond. Un plafond « haut » produit donc
 * exactement la même demande au serveur que l'automatique : un bouton
 * « Haute » ne changerait rien à l'image reçue. Écart au plan signalé.
 *
 * Réservé aux SPECTATEURS (jeton `viewer`) : à l'antenne, on voit toujours le
 * plateau sur lequel on parle — aucun retour image n'est retiré à un
 * intervenant ni à l'hôte. La préférence est conservée et reprend quand on
 * redevient spectateur.
 *
 * Aucune donnée personnelle, aucun envoi au serveur du moteur : un choix
 * d'affichage local, appliqué à la salle LiveKit déjà ouverte.
 */

import { ConnectionQuality, Track, VideoQuality } from "livekit-client"

export type DirectReceptionMode = "video" | "audio"
export type DirectReceptionQuality = "auto" | "low"

export interface DirectReceptionPreference {
  readonly mode: DirectReceptionMode
  readonly quality: DirectReceptionQuality
}

/** Le défaut : la vidéo, en automatique — exactement le direct d'avant ce lot. */
export const DIRECT_RECEPTION_DEFAULT: DirectReceptionPreference = Object.freeze({ mode: "video", quality: "auto" })

export const DIRECT_RECEPTION_QUALITIES: readonly DirectReceptionQuality[] = ["auto", "low"]

/** Le suffixe de la clé, sous le préfixe du réseau — versionné avec la forme stockée. */
export const DIRECT_RECEPTION_STORAGE_SUFFIX = "direct-reception:v1"

/** La clé du choix de réception, dans le réseau de ce préfixe. */
export function directReceptionStorageKey(storagePrefix: string): string {
  return `${storagePrefix}${DIRECT_RECEPTION_STORAGE_SUFFIX}`
}

function isMode(value: unknown): value is DirectReceptionMode {
  return value === "video" || value === "audio"
}

function isQuality(value: unknown): value is DirectReceptionQuality {
  return value === "auto" || value === "low"
}

/** La forme stockée, relue sans jamais lever : une valeur inconnue retombe sur le défaut. */
export function parseStoredDirectReception(raw: string | null): DirectReceptionPreference {
  if (raw === null || raw.length === 0 || raw.length > 256) return DIRECT_RECEPTION_DEFAULT
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return DIRECT_RECEPTION_DEFAULT
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return DIRECT_RECEPTION_DEFAULT
  const mode: unknown = "mode" in parsed ? parsed.mode : undefined
  const quality: unknown = "quality" in parsed ? parsed.quality : undefined
  return Object.freeze({
    mode: isMode(mode) ? mode : DIRECT_RECEPTION_DEFAULT.mode,
    quality: isQuality(quality) ? quality : DIRECT_RECEPTION_DEFAULT.quality,
  })
}

export function serializeDirectReception(preference: DirectReceptionPreference): string {
  return JSON.stringify({ mode: preference.mode, quality: preference.quality })
}

/**
 * Le réglage EFFECTIF pour ce jeton : la préférence du spectateur, le défaut
 * à l'antenne (le plateau reste visible à qui y parle).
 */
export function effectiveDirectReception(
  role: "viewer" | "speaker" | null,
  preference: DirectReceptionPreference,
): DirectReceptionPreference {
  return role === "viewer" ? preference : DIRECT_RECEPTION_DEFAULT
}

/**
 * Ce qu'une publication distante expose de LiveKit et dont la réception a
 * besoin. `RemoteTrackPublication` (livekit-client 2.22.3) le satisfait tel
 * quel : `kind`, `isDesired` (désir d'abonnement, vrai sous `autoSubscribe`),
 * `videoQuality` (`requestedMaxQuality ?? HIGH`), `setSubscribed`,
 * `setVideoQuality`.
 */
export interface DirectReceptionPublication {
  readonly kind: Track.Kind
  readonly isDesired: boolean
  readonly videoQuality: VideoQuality | undefined
  setSubscribed(subscribed: boolean): void
  setVideoQuality(quality: VideoQuality): void
}

export interface DirectReceptionParticipant {
  readonly trackPublications: ReadonlyMap<string, DirectReceptionPublication>
}

export interface DirectReceptionRoom {
  readonly remoteParticipants: ReadonlyMap<string, DirectReceptionParticipant>
}

/**
 * Applique le réglage à UNE publication distante, sans geste inutile (aucun
 * message au serveur quand l'état voulu est déjà là).
 *
 *  · une piste AUDIO n'est jamais touchée : le son continue ;
 *  · en écoute seule, toute piste vidéo est désabonnée ;
 *  · en vidéo, elle est réabonnée PUIS plafonnée (livekit-client refuse un
 *    plafond sur une piste non désirée) ; « automatique » ne pose aucun
 *    plafond sur une piste jamais plafonnée, et lève celui de l'économie
 *    par `HIGH` — la seule levée qu'offre l'API, équivalente à l'absence de
 *    plafond sous `adaptiveStream`.
 */
export function applyReceptionToPublication(
  publication: DirectReceptionPublication,
  reception: DirectReceptionPreference,
): void {
  if (publication.kind !== Track.Kind.Video) return
  const wanted = reception.mode === "video"
  if (publication.isDesired !== wanted) publication.setSubscribed(wanted)
  if (!wanted) return
  if (reception.quality === "low") {
    if (publication.videoQuality !== VideoQuality.LOW) publication.setVideoQuality(VideoQuality.LOW)
  } else if (publication.videoQuality === VideoQuality.LOW) {
    publication.setVideoQuality(VideoQuality.HIGH)
  }
}

/** Applique le réglage à TOUTES les publications distantes de la salle. */
export function applyReceptionToRoom(room: DirectReceptionRoom, reception: DirectReceptionPreference): void {
  for (const participant of room.remoteParticipants.values()) {
    for (const publication of participant.trackPublications.values()) applyReceptionToPublication(publication, reception)
  }
}

/**
 * La connexion est-elle signalée faible ? `poor` et `lost` seulement :
 * l'absence de mesure (`unknown`) n'alarme pas — même règle que la puce de
 * qualité des appels (`call-controls.ts`).
 */
export function isWeakDirectConnection(quality: ConnectionQuality | undefined): boolean {
  return quality === ConnectionQuality.Poor || quality === ConnectionQuality.Lost
}
