// Dupliqué de socle/convex/modules/reseauAlbums/tables.ts @ ad2e7fdc2 — adaptations : `networkId` sur l'album et la photo (un album vit dans un réseau) ; propriétaire et déposant en personnes ; index préfixés par le réseau ; index PAR PROPRIÉTAIRE sur les photos (D09 : aucun orphelin introuvable pour l'effacement) ; une photo retirée est SUPPRIMÉE et son blob purgé (plus de `removedAt` ni de tombe) ; suppression en cours (`deletingAt`) : l'album est introuvable aussitôt, la purge se poursuit par lots.
/**
 * Tables des ALBUMS — des collections durables de photos, propriété d'une
 * PERSONNE, dans un réseau.
 *
 * Pourquoi DEUX tables et non un tableau d'éléments sur l'album : un album porte
 * jusqu'à `ALBUM_ITEMS_MAX` photos qu'on légende, réordonne et retire une par
 * une ; un tableau embarqué ferait réécrire soixante lignes pour une légende.
 */
import { defineTable } from "convex/server"
import { v } from "convex/values"

import { reachAudienceValidator } from "../../lib/validators"
import { albumItemMediaValidator, albumStatusValidator } from "./validators"

export const albumsTables = {
  /**
   * L'ALBUM. `status` est la vraie porte : `draft` est privé quelle que soit
   * l'audience, l'audience ne devient une règle d'accès qu'une fois publié ;
   * `withdrawn` referme sans rien détruire.
   *
   * `itemCount` est dénormalisé, tenu par les seuls écrivains de photos (la
   * liste dit « 12 photos » sans les lire, le plafond se juge sans compter) —
   * un compteur du seul propriétaire, jamais disputé. `coverItemId` est une
   * PRÉFÉRENCE toujours valide : effacée quand la photo part ; absente, la
   * couverture est la première photo (une lecture, jamais un balayage).
   */
  albums: defineTable({
    networkId: v.id("networks"),
    ownerPersonId: v.id("persons"),
    title: v.string(),
    description: v.optional(v.string()),
    audience: reachAudienceValidator,
    status: albumStatusValidator,
    coverItemId: v.optional(v.id("albumItems")),
    itemCount: v.number(),
    /** Tirée au MONTAGE du composeur : un renvoi ne crée pas un second album. */
    idempotencyKey: v.optional(v.string()),
    /** Suppression en cours : introuvable aussitôt, purgé par lots (photos, blobs, lignes d'analyse). */
    deletingAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
    /** La PREMIÈRE publication — gardée à la republication ; la cloche des abonnés ne sonne qu'une fois. */
    publishedAt: v.optional(v.number()),
    withdrawnAt: v.optional(v.number()),
  })
    // Les albums PUBLIÉS d'une personne dans un réseau, les plus récemment complétés d'abord.
    .index("by_network_owner_status_updatedAt", ["networkId", "ownerPersonId", "status", "updatedAt"])
    // Mes albums d'un réseau, tous états confondus.
    .index("by_network_owner_updatedAt", ["networkId", "ownerPersonId", "updatedAt"])
    // Le rejeu de création : la même clé rend l'album EXISTANT.
    .index("by_owner_idempotencyKey", ["ownerPersonId", "idempotencyKey"]),

  /**
   * UNE photo d'un album. `ownerPersonId` est dénormalisé depuis l'album : la
   * garde d'une photo ne dépend pas d'une seconde lecture, et l'effacement d'une
   * personne retrouve toutes ses photos (D09). `idempotencyKey` est tirée PAR
   * FICHIER : la reprise ajoute ce qui manque, jamais un doublon.
   */
  albumItems: defineTable({
    networkId: v.id("networks"),
    albumId: v.id("albums"),
    ownerPersonId: v.id("persons"),
    media: albumItemMediaValidator,
    position: v.number(),
    caption: v.optional(v.string()),
    altText: v.optional(v.string()),
    /** Qui a déposé la photo — le propriétaire (pas d'album partagé en V1). */
    addedByPersonId: v.id("persons"),
    idempotencyKey: v.string(),
    createdAt: v.number(),
  })
    .index("by_album_position", ["albumId", "position"])
    .index("by_album_idempotencyKey", ["albumId", "idempotencyKey"])
    .index("by_owner_createdAt", ["ownerPersonId", "createdAt"])
    .index("by_addedByPersonId", ["addedByPersonId"]),
}
