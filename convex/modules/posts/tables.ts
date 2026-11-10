// Dupliqué de socle/convex/modules/reseauPersonnel/tables.ts (l. 137-300) @ ad2e7fdc2 — adaptations : `networkId` et visibilité `network`/`root` sur chaque publication, index préfixés par le réseau ; `onRoot` dénormalisé (lisible depuis la racine) et index de la racine ; portée (`reach`) et pays (`country`) des réseaux à portées ; auteurs et réacteurs en personnes ; AUCUN compteur sur la publication (D01) : réactions par fragments (`postReactionShards`), partages par l'agrégat `engineCounters` ; index jamais lus non recopiés (`by_directSessionId`, `by_eventId`, `by_sharedPostId`, D35) ; mur de groupe préfixé par le réseau ; la PAGE de la publication (lot 13 : `pageId`, mur et fenêtres de fil d'une page, dans son réseau et depuis la racine) ; l'évènement annoncé porté par la publication (lot 12, sans index : rien ne le relit par là) ; la session de DIRECT annoncée (`directSessionId` du socle → `liveSessionId`, lot 16, sans index pour la même raison) ; recherche `search_body_v2` filtrée par réseau, statut et racine.
import { defineTable } from "convex/server"
import { v } from "convex/values"
import { PROVINCE_SLUGS } from "@antsia/social-domain/provinces"

import { contentVisibilityValidator, literals, postAudienceValidator, postStatusValidator } from "../../lib/validators"
import { storedMediaValidator } from "../media/media"

export const postsTables = {
  posts: defineTable({
    networkId: v.id("networks"),
    /** Absent pour une page fédérée ou une galerie collective ; aucune personne technique n’est créée. */
    authorPersonId: v.optional(v.id("persons")),
    federationSource: v.optional(v.object({ emitterId: v.id("federationEmitters"), objectRef: v.string() })),
    federationMedia: v.optional(v.object({
      status: v.union(v.literal("pending"), v.literal("failed")),
      items: v.array(v.object({ kind: v.union(v.literal("image"), v.literal("video")), mimeType: v.string(), width: v.optional(v.number()), height: v.optional(v.number()), durationMs: v.optional(v.number()), altText: v.optional(v.string()) })),
    })),
    /** Le corps, déjà validé (`assertPostContent`) ; vide pour un partage ou une photo sans légende. */
    body: v.string(),
    audience: postAudienceValidator,
    /** `network` : visible dans son réseau ; `root` : aussi à la racine (geste explicite ou règle). */
    visibility: contentVisibilityValidator,
    /**
     * Lisible depuis la RACINE : publication native de la racine, ou visibilité
     * `root`. Dénormalisé à l'écriture (`writePost`) pour que le fil, le mur et
     * la recherche de la racine lisent UN index, sans fusionner deux sources.
     * Facultatif dans le schéma pour les lignes d'avant le lot 7 (migration
     * `setPostsOnRoot`), toujours écrit depuis.
     */
    onRoot: v.optional(v.boolean()),
    status: postStatusValidator,
    /**
     * Médias EMBARQUÉS — au plus 4 images OU 1 vidéo seule (`assertPostMedia`).
     * Type et poids RÉELS lus du stockage à la publication ; aucun identifiant
     * de stockage ne sort d'un DTO (URL résolue par la garde des fichiers).
     */
    media: v.optional(v.array(storedMediaValidator)),
    /**
     * PARTAGE : la publication partagée. Seule une publication publique se
     * partage, et partager un partage pointe l'ORIGINAL. L'original est RELU et
     * re-gardé par lecteur à chaque lecture.
     */
    sharedPostId: v.optional(v.id("posts")),
    /** Le groupe THÉMATIQUE : présent SI ET SEULEMENT SI l'audience est `group` (tenu par `writePost`). */
    groupId: v.optional(v.id("thematicGroups")),
    /** L'ÉVÈNEMENT annoncé par cette publication (son organisateur seul l'annonce, une fois). */
    eventId: v.optional(v.id("events")),
    /** DG-023 : galerie collective après événement, distincte de son annonce. */
    pageEventGalleryId: v.optional(v.id("events")),
    /**
     * L'ANNONCE d'une conférence en DIRECT (`liveSessions`) : la carte du fil
     * relit la session à chaque lecture (statut, titre). Invariant tenu à
     * l'écriture (`live/sessions.create`) : l'annonce garde l'audience EXACTE
     * de la session, dans son réseau — et ni l'une ni l'autre n'est modifiable.
     */
    liveSessionId: v.optional(v.id("liveSessions")),
    /**
     * La PAGE au nom de laquelle la publication parle. Une ligne native ordinaire
     * garde son SIGNATAIRE dans `authorPersonId` ; la galerie collective l'omet. Audience `public`
     * ou `followers` seulement, jamais de groupe ni de partage (`writePost`).
     */
    pageId: v.optional(v.id("pages")),
    /** P09 : référence d'offre seulement ; prix, état et droits sont relus dans la projection catalogue. */
    commerceOffer: v.optional(v.object({ shopId: v.id("shops"), offerRef: v.string() })),
    /** MP13 : référence seule ; l'aperçu relit toujours la version éditoriale actuellement publiée. */
    editorialArticleId: v.optional(v.id("editorialArticles")),
    /** Portée, parmi celles que le réseau déclare (`networks.reachValues`). */
    reach: v.optional(v.string()),
    /** Pays (ISO 3166-1 alpha-2) ; exigé par la portée locale. */
    country: v.optional(v.string()),
    /** Attribution volontaire du contenu, stable ; jamais la facette courante de l'auteur. */
    province: v.optional(literals(PROVINCE_SLUGS)),
    tags: v.optional(v.array(v.string())),
    mentionedPersonIds: v.optional(v.array(v.id("persons"))),
    /** Corps et tags, repliés pour l'index plein texte (chaîne vide pour un partage sans mot). */
    searchText: v.string(),
    idempotencyKey: v.optional(v.string()),
    publishedAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
    editedAt: v.optional(v.number()),
    removedAt: v.optional(v.number()),
  })
    // Le fil « Récents » d'un réseau fermé, et la fenêtre globale de « Pour vous ».
    .index("by_network_status_publishedAt", ["networkId", "status", "publishedAt"])
    // Fenêtre PAR AUTEUR dans un réseau (fusion k-voies du fil, mur d'une personne).
    .index("by_network_author_status_publishedAt", ["networkId", "authorPersonId", "status", "publishedAt"])
    // Les mêmes, lus depuis la RACINE (natifs et `root` de tous les réseaux).
    .index("by_root_status_publishedAt", ["onRoot", "status", "publishedAt"])
    .index("by_root_province_status_publishedAt", ["onRoot", "province", "status", "publishedAt"])
    .index("by_root_author_status_publishedAt", ["onRoot", "authorPersonId", "status", "publishedAt"])
    // Le MUR d'un groupe thématique (et la cascade de sa suppression).
    .index("by_network_group_status_publishedAt", ["networkId", "groupId", "status", "publishedAt"])
    // Le MUR d'une page et sa fenêtre de fil, dans son réseau, puis depuis la racine.
    .index("by_network_page_status_publishedAt", ["networkId", "pageId", "status", "publishedAt"])
    .index("by_network_eventGallery_status_publishedAt", ["networkId", "pageEventGalleryId", "status", "publishedAt"])
    .index("by_network_eventGallery_key", ["networkId", "pageEventGalleryId", "idempotencyKey"])
    .index("by_root_page_status_publishedAt", ["onRoot", "pageId", "status", "publishedAt"])
    // Les VOIES d'un fil (le hub d'un pays, « toute la diaspora ») : une portée et un pays, ou une portée seule.
    .index("by_network_reach_country_status_publishedAt", ["networkId", "reach", "country", "status", "publishedAt"])
    .index("by_network_reach_status_publishedAt", ["networkId", "reach", "status", "publishedAt"])
    // MES publications, retirées comprises (je suis seul à voir les miennes retirées).
    .index("by_network_author_publishedAt", ["networkId", "authorPersonId", "publishedAt"])
    .index("by_author_and_idempotencyKey", ["authorPersonId", "idempotencyKey"])
    /**
     * VERSIONNÉ : un index de recherche ne se modifie pas en place. Le statut, le
     * réseau et la racine sont des facettes ; l'AUDIENCE ne l'est pas — elle se
     * juge par lecteur, d'où la recherche en deux temps.
     */
    .searchIndex("search_body_v2", { searchField: "searchText", filterFields: ["networkId", "status", "onRoot"] }),
}
