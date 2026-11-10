// Dupliqué de socle/packages/agent-features/src/features/reseau-personnel/useMediaDraft.ts @ ad2e7fdc2 — adaptations : bornes et types lus dans le domaine du moteur (`@antsia/social-domain/content`) ; refus et erreurs par l'i18n — `rejectionFor(file, existing, limits, t)` reçoit `t` en DERNIER paramètre (clés qualifiées `reseau:useMediaDraft.*`, `limits` devient un paramètre explicite, éventuellement `undefined`), le poids maximal se dit depuis la borne du domaine, les erreurs levées par `upload` sont traduites par la langue de l'écran ; identifiant de stockage TYPÉ (`UploadedMedia.storageId: Id<"_storage">`) au lieu d'une chaîne ; API du hook inchangée ; FP-01 : une image qui ne sort pas du module de préparation (`features/media-upload`, `isPreparedImage`) est refusée à l'ajout comme à l'envoi — aucune photo ne part avec ses métadonnées.
"use client"

/**
 * Le brouillon de médias d'un composeur — sélection, téléversement, texte
 * alternatif, retrait.
 *
 * Extrait du composeur DÉLIBÉRÉMENT : ce qui reste dans le corps d'un
 * composant n'est vérifiable qu'à l'œil. Ce hook n'expose que des transitions
 * d'état ; les règles de fond (4 images OU 1 vidéo, poids, types) restent au
 * SERVEUR, qui les relit sur les métadonnées réelles du stockage.
 *
 * L'aperçu utilise `URL.createObjectURL` sur le fichier LOCAL : on ne demande
 * jamais au serveur de servir un octet pour montrer ce que l'usager vient de
 * choisir.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DEUX MODES, ET LE SECOND EST LE NOMINAL (R-12, 2026-09-06)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * · `useMediaDraft()` — sans cible : état LOCAL, comme avant. Conservé pour
 *   ne casser aucun appelant (le hook est exporté par `index.ts`).
 * · `useMediaDraft(target)` — avec cible : l'état vit dans
 *   `post-draft-store.ts`. C'est ce que fait le composeur, et c'est ce qui
 *   rend le brouillon DURABLE : fermer la feuille, basculer 959→960→959 ou
 *   naviguer démonte le composant, plus son brouillon.
 *
 * Trois conséquences que l'on ne peut pas défaire sans rouvrir le défaut :
 *  · **Aucune révocation d'aperçu au démontage** en mode magasin — c'est le
 *    démontage qui effaçait les médias. Les URLs sont révoquées au RETRAIT,
 *    au vidage (succès) et à l'abandon, par le magasin lui-même.
 *  · **`upload()` saute ce qui est déjà `uploaded`** et marque chaque
 *    téléversement dès qu'il réussit : un renvoi après une publication en
 *    échec ne recrée pas de blob orphelin, et la garde des fichiers du moteur
 *    n'accepte d'ailleurs qu'un dépôt frais par média.
 *  · **Un média sans fichier ET sans téléversement n'est pas publiable** :
 *    `unrecoverable` le nomme, l'écran demande de le resélectionner.
 *
 * ⚠️ UNE IMAGE BRUTE NE PASSE PAS (lot FP-01). Toute image ajoutée doit sortir
 * du module de préparation (`features/media-upload` : ré-encodée, 2 048 px au
 * plus, sans métadonnées) ; une autre est refusée à `add`, et `upload` refuse
 * encore d'envoyer une image qui n'en sortirait pas. Le composeur prépare les
 * photos AVANT `add` ; l'album aussi, par son propre plan.
 */

import type { Id } from "@antsia/api/engine"
import {
  POST_IMAGE_MAX_BYTES,
  POST_IMAGE_MIME_TYPES,
  POST_MEDIA_MAX_COUNT,
  POST_VIDEO_MAX_BYTES,
  POST_VIDEO_MIME_TYPES,
} from "@antsia/social-domain/content"
import type { TFunction } from "i18next"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { isPreparedImage } from "../media-upload"
import {
  postDraftKey,
  unrecoverableMedia,
  type PostDraftMedia,
  type PostDraftTarget,
  type PostDraftUpload,
} from "./post-draft"
import {
  hasRuntimeMedia,
  postDraftStore,
  runtimeMediaFile,
  runtimeMediaPreview,
  usePostDraft,
} from "./post-draft-store"

export type DraftMediaKind = "image" | "video"

/**
 * Un média du brouillon, tel que l'écran le rend.
 *
 * ⚠️ `file` et `previewUrl` sont NULLABLES depuis R-12 : après un
 * rechargement, il ne reste du média que ses métadonnées (le nom, le type, le
 * poids) et, s'il a été téléversé, son `storageId`. Les rendre non nullables
 * obligerait l'écran à mentir.
 */
export interface DraftMedia {
  /** Identité locale du brouillon — jamais envoyée au serveur. */
  localId: string
  file: File | null
  kind: DraftMediaKind
  previewUrl: string | null
  altText: string
  /** Ce qui SURVIT au rechargement, quand le fichier ne survit pas. */
  fileName: string
  mimeType: string
  sizeBytes: number
  upload: PostDraftUpload
}

/** Ce que le composeur ACCEPTE dans son sélecteur de fichiers. */
export const MEDIA_ACCEPT = [
  ...POST_IMAGE_MIME_TYPES,
  ...POST_VIDEO_MIME_TYPES,
].join(",")

/** Ce qu'un sélecteur d'IMAGES SEULES accepte — les albums (ADR-0145). */
export const IMAGE_ONLY_ACCEPT = POST_IMAGE_MIME_TYPES.join(",")

/**
 * Ce qui change d'un composeur à l'autre. Deux réglages, et deux seulement :
 * la publication porte 4 médias dont au plus une vidéo, l'album en porte 60 et
 * n'accepte que des images. Le reste — poids, types, refus — est commun.
 */
export interface MediaDraftLimits {
  /** Plafond de médias. Défaut : `POST_MEDIA_MAX_COUNT` (4). */
  maxCount?: number
  /** Refuser toute vidéo, y compris seule. Défaut : `false`. */
  imagesOnly?: boolean
  /** Ce que la borne de nombre DIT quand elle refuse — un plafond se nomme. */
  tooManyMessage?: (max: number) => string
}

/** Un poids en mégaoctets entiers, tel que le refus le dit (« 20 Mo »). */
function megabytes(bytes: number): number {
  return Math.round(bytes / (1024 * 1024))
}

/**
 * Le refus opposé à un fichier, ou `null`. Miroir ALLÉGÉ du domaine serveur :
 * il évite un téléversement perdu, il ne remplace pas la garde.
 *
 * ⚠️ `limits` peut valoir `undefined`, et son absence rend le comportement
 * d'origine à l'identique : les appelants du fil n'ont pas à connaître ce
 * paramètre. `t` est reçu en dernier : la phrase est celle de l'écran.
 */
export function rejectionFor(
  file: File,
  existing: readonly { kind: DraftMediaKind }[],
  limits: MediaDraftLimits | undefined,
  t: TFunction,
): string | null {
  const maxCount = limits?.maxCount ?? POST_MEDIA_MAX_COUNT
  const isImage = (POST_IMAGE_MIME_TYPES as readonly string[]).includes(file.type)
  const isVideo = (POST_VIDEO_MIME_TYPES as readonly string[]).includes(file.type)

  if (limits?.imagesOnly === true) {
    if (!isImage) return t("reseau:useMediaDraft.rejection.notImage", { name: file.name })
  } else if (!isImage && !isVideo) {
    return t("reseau:useMediaDraft.rejection.notMedia", { name: file.name })
  }
  if (isVideo && existing.length > 0) {
    return t("reseau:useMediaDraft.rejection.videoAlone")
  }
  if (isImage && existing.some((item) => item.kind === "video")) {
    return t("reseau:useMediaDraft.rejection.videoAlone")
  }
  if (existing.length >= maxCount) {
    return limits?.tooManyMessage
      ? limits.tooManyMessage(maxCount)
      : t("reseau:useMediaDraft.rejection.tooMany", { max: maxCount })
  }
  const maxBytes = isImage ? POST_IMAGE_MAX_BYTES : POST_VIDEO_MAX_BYTES
  if (file.size > maxBytes) {
    return t("reseau:useMediaDraft.rejection.tooBig", { name: file.name, max: megabytes(maxBytes) })
  }
  return null
}

/**
 * Le refus d'une IMAGE qui n'est pas sortie du module de préparation, ou
 * `null` (une vidéo, ou une image préparée). Le type déclaré suffit à dire
 * « image » : c'est la lecture que fait `kindOf`.
 */
function unpreparedRefusal(file: File, t: TFunction): string | null {
  if (!(POST_IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) return null
  return isPreparedImage(file) ? null : t("reseau:mediaPreparation.notPrepared", { name: file.name })
}

export interface UploadedMedia {
  /** L'identifiant rendu par le STOCKAGE à son dépôt — jamais fabriqué ici. */
  storageId: Id<"_storage">
  kind: DraftMediaKind
  mimeType: string
  sizeBytes: number
  altText?: string
}

/** Le genre d'un fichier accepté — la seule lecture de son type MIME. */
function kindOf(file: File): DraftMediaKind {
  return (POST_IMAGE_MIME_TYPES as readonly string[]).includes(file.type)
    ? "image"
    : "video"
}

function metaOf(file: File, localId: string): PostDraftMedia {
  return {
    localId,
    kind: kindOf(file),
    altText: "",
    fileName: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
    upload: { status: "pending" },
  }
}

export interface MediaDraft {
  items: readonly DraftMedia[]
  rejection: string | null
  /** Les médias dont il ne reste QUE le nom — à resélectionner. */
  unrecoverable: readonly DraftMedia[]
  add: (files: readonly File[]) => void
  remove: (localId: string) => void
  setAltText: (localId: string, altText: string) => void
  clear: () => void
  upload: (generateUrl: () => Promise<string>) => Promise<UploadedMedia[]>
}

export function useMediaDraft(
  target?: PostDraftTarget,
  limits?: MediaDraftLimits,
): MediaDraft {
  const { t } = useTranslation("reseau")
  const key = target === undefined ? null : postDraftKey(target)

  // ── Les deux sources, toutes deux appelées à CHAQUE rendu (règle des hooks) ──
  const [localItems, setLocalItems] = useState<DraftMedia[]>([])
  const [rejection, setRejection] = useState<string | null>(null)
  // ⚠️ `key ?? "feed"` n'est PAS un repli fonctionnel : quand `key` est nul,
  // la valeur lue est ignorée (mode local). Un appel de hook ne se conditionne
  // pas, une lecture se jette.
  const storedMedia = usePostDraft(key ?? "feed", "").media

  // Les URLs vivantes du mode LOCAL, pour les révoquer au démontage. En mode
  // magasin, c'est le magasin qui révoque — jamais le démontage (R-12).
  const liveUrls = useRef(new Set<string>())
  useEffect(() => {
    const urls = liveUrls.current
    return () => {
      for (const url of urls) URL.revokeObjectURL(url)
      urls.clear()
    }
  }, [])

  const items: readonly DraftMedia[] = useMemo(() => {
    if (key === null) return localItems
    return storedMedia.map((item) => ({
      localId: item.localId,
      file: runtimeMediaFile(item.localId),
      kind: item.kind,
      previewUrl: runtimeMediaPreview(item.localId),
      altText: item.altText,
      fileName: item.fileName,
      mimeType: item.mimeType,
      sizeBytes: item.sizeBytes,
      upload: item.upload,
    }))
  }, [key, localItems, storedMedia])

  const unrecoverable = useMemo(() => {
    if (key === null) return []
    const perdus = new Set(
      unrecoverableMedia({ media: storedMedia }, hasRuntimeMedia).map(
        (item) => item.localId,
      ),
    )
    return items.filter((item) => perdus.has(item.localId))
  }, [key, storedMedia, items])

  const add = useCallback(
    (files: readonly File[]) => {
      setRejection(null)
      if (key === null) {
        setLocalItems((current) => {
          const next = [...current]
          for (const file of files) {
            const refusal = rejectionFor(file, next, limits, t) ?? unpreparedRefusal(file, t)
            if (refusal) {
              setRejection(refusal)
              continue
            }
            const previewUrl = URL.createObjectURL(file)
            liveUrls.current.add(previewUrl)
            next.push({
              // ⚠️ L'aléa vaut aussi en mode local : sans lui, choisir deux
              // fois le MÊME fichier après un retrait rendrait deux entrées de
              // même identité, et le marquage de téléversement en toucherait
              // deux d'un coup.
              ...metaOf(
                file,
                `${file.name}-${file.size}-${next.length}-${Math.random()
                  .toString(36)
                  .slice(2, 8)}`,
              ),
              file,
              previewUrl,
            })
          }
          return next
        })
        return
      }

      const existing = [...storedMedia]
      const accepted: { meta: PostDraftMedia; file: File; previewUrl: string }[] = []
      for (const file of files) {
        const refusal = rejectionFor(file, existing, limits, t) ?? unpreparedRefusal(file, t)
        if (refusal) {
          setRejection(refusal)
          continue
        }
        // ⚠️ L'identité locale porte un aléa : deux sélections du MÊME fichier
        // dans deux brouillons ne doivent pas partager une entrée du registre
        // runtime — retirer l'une révoquerait l'aperçu de l'autre.
        const localId = `${file.name}-${file.size}-${existing.length}-${Math.random()
          .toString(36)
          .slice(2, 8)}`
        const meta = metaOf(file, localId)
        existing.push(meta)
        accepted.push({ meta, file, previewUrl: URL.createObjectURL(file) })
      }
      if (accepted.length > 0) postDraftStore.addMedia(key, accepted)
    },
    [key, storedMedia, limits, t],
  )

  const remove = useCallback(
    (localId: string) => {
      setRejection(null)
      if (key === null) {
        setLocalItems((current) => {
          const target = current.find((item) => item.localId === localId)
          if (target?.previewUrl) {
            URL.revokeObjectURL(target.previewUrl)
            liveUrls.current.delete(target.previewUrl)
          }
          return current.filter((item) => item.localId !== localId)
        })
        return
      }
      postDraftStore.removeMedia(key, localId)
    },
    [key],
  )

  const setAltText = useCallback(
    (localId: string, altText: string) => {
      if (key === null) {
        setLocalItems((current) =>
          current.map((item) =>
            item.localId === localId ? { ...item, altText } : item,
          ),
        )
        return
      }
      postDraftStore.setAltText(key, localId, altText)
    },
    [key],
  )

  const clear = useCallback(() => {
    setRejection(null)
    if (key === null) {
      setLocalItems((current) => {
        for (const item of current) {
          if (item.previewUrl) {
            URL.revokeObjectURL(item.previewUrl)
            liveUrls.current.delete(item.previewUrl)
          }
        }
        return []
      })
      return
    }
    postDraftStore.clear(key)
  }, [key])

  /**
   * Téléverse ce qui ne l'est pas encore et rend ce que la mutation attend.
   *
   * `generateUrl` est injecté (la mutation Convex) pour que ce hook reste sans
   * dépendance au backend — c'est ce qui le rend lisible et remplaçable.
   *
   * ⚠️ Un média DÉJÀ téléversé est repris tel quel : c'est la reprise sans
   * doublon. Son texte alternatif, lui, est relu à l'instant de l'envoi — il
   * peut avoir été corrigé après le téléversement.
   *
   * ⚠️ Le sort de CHAQUE fichier est mémorisé dès qu'il est connu, dans les
   * DEUX modes (R-09, 2026-09-07). Le mode local ne marquait rien : la
   * progression par fichier était invisible, et un renvoi après un envoi
   * partiel re-téléversait tout — un blob orphelin par tentative, que rien ne
   * purge. Le composeur d'album vit de ce marquage.
   */
  const upload = useCallback(
    async (generateUrl: () => Promise<string>): Promise<UploadedMedia[]> => {
      const uploaded: UploadedMedia[] = []
      /** Le marquage, dans le mode qui convient — un seul point de décision. */
      const markUploaded = (localId: string, storageId: Id<"_storage">) => {
        if (key !== null) {
          postDraftStore.markUploaded(key, localId, storageId)
          return
        }
        setLocalItems((current) =>
          current.map((entry) =>
            entry.localId === localId
              ? {
                  ...entry,
                  upload: { status: "uploaded", storageId, uploadedAt: Date.now() },
                }
              : entry,
          ),
        )
      }
      const markFailed = (localId: string) => {
        if (key !== null) {
          postDraftStore.markUploadFailed(key, localId)
          return
        }
        setLocalItems((current) =>
          current.map((entry) =>
            entry.localId === localId
              ? { ...entry, upload: { status: "failed" } }
              : entry,
          ),
        )
      }
      for (const item of items) {
        const commun = {
          kind: item.kind,
          // Déclarés, puis ÉCRASÉS par le serveur avec les métadonnées réelles
          // du stockage. On les envoie parce que la mutation les attend, pas
          // parce qu'ils font foi.
          mimeType: item.mimeType,
          sizeBytes: item.sizeBytes,
          ...(item.altText.trim().length > 0
            ? { altText: item.altText.trim() }
            : {}),
        }
        if (item.upload.status === "uploaded") {
          // Relu du brouillon persisté (une chaîne) : c'est l'identifiant que le
          // stockage a lui-même rendu au dépôt, d'où la conversion de type.
          uploaded.push({ storageId: item.upload.storageId as Id<"_storage">, ...commun })
          continue
        }
        if (item.file === null) {
          throw new Error(t("reseau:useMediaDraft.error.reselect", { name: item.fileName }))
        }
        // ÉCHEC FERMÉ : une image qui ne sort pas du module de préparation ne
        // part pas, même si elle est entrée par un chemin qui l'aurait oubliée.
        const unprepared = item.kind === "image" ? unpreparedRefusal(item.file, t) : null
        if (unprepared !== null) {
          markFailed(item.localId)
          throw new Error(unprepared)
        }
        const url = await generateUrl()
        let response: Response
        try {
          response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": item.mimeType },
            body: item.file,
          })
        } catch (error) {
          markFailed(item.localId)
          throw error
        }
        if (!response.ok) {
          markFailed(item.localId)
          throw new Error(t("reseau:useMediaDraft.error.uploadRefused", { name: item.fileName }))
        }
        const { storageId } = (await response.json()) as { storageId: Id<"_storage"> }
        // Mémorisé TOUT DE SUITE : si la publication échoue juste après, le
        // renvoi ne re-téléversera pas cet octet.
        markUploaded(item.localId, storageId)
        uploaded.push({ storageId, ...commun })
      }
      return uploaded
    },
    [items, key, t],
  )

  return { items, rejection, unrecoverable, add, remove, setAltText, clear, upload }
}
