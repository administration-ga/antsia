// Dupliqué de socle/convex/modules/reseauPages/tables.ts @ ad2e7fdc2 — adaptations : pages GÉNÉRIQUES par réseau (`networkId`) à identité PROPRE (nom, sigle, description, logo et bannière sous la garde des fichiers) au lieu d'une identité dérivée d'`orgs` (`orgId` retiré) ; nature (`ownerKind`) et confiance (`trust`, posée par décision tracée, rang dénormalisé pour la découverte) ; pays et règle de visibilité de la page (`visibility`, `onRoot` dénormalisé) ; référence d'import contractuel ; créateur en personne ; AUCUN compteur sur la page (abonnés et publications dans l'agrégat `engineCounters`, D02) — d'où la découverte par confiance puis récence au lieu des plus suivies ; abonnements en personnes, portant le réseau de la page ; tables neuves des signataires (`pageSignatories`), des revendications (`pageClaims`, EXF-AN-17) et de l'historique d'identité (`pageIdentityHistory`) ; activation par superadmin (`activatedByUserId`…) retirée : une page naît d'un membre vérifié, d'un opérateur, d'un import ou de la fédération.
/**
 * Tables des PAGES — la présence d'une organisation dans un réseau.
 *
 * À QUI APPARTIENT UNE PUBLICATION DE PAGE : à la PAGE. Elle vit dans `posts`
 * (champ `pageId`), jamais dans une table parallèle — réactions, commentaires,
 * partages, signets, signalements et gardes de lecture sont ceux du réseau,
 * écrits une fois. La personne qui l'a écrite en est le SIGNATAIRE
 * (`posts.authorPersonId`, pour l'audit et l'idempotence) ; l'en-tête affiché
 * est celui de la page, et le droit d'y parler est ACTUEL : un ancien
 * signataire ne garde rien.
 */
import { defineTable } from "convex/server"
import { v } from "convex/values"

import { contentVisibilityValidator, pageOwnerKindValidator, pageTrustValidator } from "../../lib/validators"
import { pageAssociationTypeValidator, pageClaimStatusValidator, pageRoleValidator, pageSectorValidator, pageStatusValidator } from "./validators"

export const pagesTables = {
  pages: defineTable({
    networkId: v.id("networks"),
    /**
     * Adresse publique, UNIQUE dans le moteur (une page se lit dans son réseau
     * et, si elle y est, depuis la racine : un lien doit toujours mener à la
     * même). Dérivée du nom à la création (`assertPageHandle`) ; changée par
     * décision tracée seulement (console).
     */
    handle: v.string(),
    name: v.string(),
    shortName: v.optional(v.string()),
    description: v.optional(v.string()),
    /** Images de la page, ADMISES par la garde des fichiers (usage `page_logo`/`page_banner`, source `page`). */
    logoStorageId: v.optional(v.id("_storage")),
    bannerStorageId: v.optional(v.id("_storage")),
    /** Annonce choisie par un signataire vivant ; sa visibilité est relue avant chaque affichage. */
    pinnedPostId: v.optional(v.id("posts")),
    ownerKind: pageOwnerKindValidator,
    /** Posée par décision tracée (console, revendication validée, import, fédération) — jamais par un signataire. */
    trust: pageTrustValidator,
    /** Rang de `trust` (2 officiel, 1 vérifié, 0 communauté) — l'ordre de la découverte, sans compteur chaud. */
    trustRank: v.number(),
    /** Pays (ISO alpha-2) : celui des publications locales de la page (EXF-DG-23). */
    country: v.optional(v.string()),
    /** Implantation publique facultative, sans adresse ni coordonnée de contact. */
    city: v.optional(v.string()),
    /** Précisions propres à la nature de la page ; jamais une identité de personne. */
    associationType: v.optional(pageAssociationTypeValidator),
    sector: v.optional(pageSectorValidator),
    /** La RÈGLE de la page : `root` → ses communiqués sont lus aussi depuis la racine. */
    visibility: contentVisibilityValidator,
    /** Lisible depuis la racine : page de la racine, ou règle `root` (dénormalisé à chaque écriture). */
    onRoot: v.boolean(),
    status: pageStatusValidator,
    /** Référence d'un import contractuel (poste consulaire, association) — l'import est idempotent par elle. */
    importRef: v.optional(v.string()),
    /** Le membre qui l'a créée ; absent pour une page née d'une décision de console ou d'un import. */
    createdByPersonId: v.optional(v.id("persons")),
    /** Nom, sigle et adresse, originaux et repliés sans accents — ce que lit la recherche. */
    searchText: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    deactivatedAt: v.optional(v.number()),
  })
    .index("by_handle", ["handle"])
    .index("by_network_importRef", ["networkId", "importRef"])
    // La découverte d'un réseau, puis d'un pays : confiance d'abord, récence ensuite.
    .index("by_network_status_trustRank_createdAt", ["networkId", "status", "trustRank", "createdAt"])
    .index("by_network_status_country_trustRank_createdAt", ["networkId", "status", "country", "trustRank", "createdAt"])
    // Les mêmes, lues depuis la RACINE (pages de la racine et pages à la règle `root`).
    .index("by_root_status_trustRank_createdAt", ["onRoot", "status", "trustRank", "createdAt"])
    .index("by_root_status_country_trustRank_createdAt", ["onRoot", "status", "country", "trustRank", "createdAt"])
    /** VERSIONNÉ : un index de recherche ne se modifie pas en place. */
    .searchIndex("search_name_v1", { searchField: "searchText", filterFields: ["networkId", "status", "onRoot", "country"] }),

  /**
   * L'abonnement d'une PERSONNE à une PAGE — unilatéral, sans accord, et il
   * n'ouvre que la porte du fil et la note aux abonnés (`followers`). Table à
   * part des abonnements entre personnes : unir les deux cibles rendrait
   * l'identifiant polymorphe dans l'index d'unicité.
   */
  pageFollows: defineTable({
    /** Le réseau de la PAGE (celui de ses publications), pas celui d'où l'on s'est abonné. */
    networkId: v.id("networks"),
    pageId: v.id("pages"),
    personId: v.id("persons"),
    createdAt: v.number(),
  })
    .index("by_page_person", ["pageId", "personId"])
    // Les abonnés d'une page, pour la diffusion par lots de ses publications.
    .index("by_page_createdAt", ["pageId", "createdAt"])
    // Mes pages, les plus récemment suivies d'abord — dans un réseau, ou toutes (lecture depuis la racine).
    .index("by_network_person_createdAt", ["networkId", "personId", "createdAt"])
    .index("by_person_createdAt", ["personId", "createdAt"]),

  /**
   * Les SIGNATAIRES d'une page — qui parle en son nom. Une ligne par personne :
   * la retirer EST la révocation (la trace vit dans le journal des décisions).
   * Une habilitation est une INVITATION : elle ne vaut qu'acceptée — personne ne
   * se retrouve signataire d'une page sans l'avoir voulu. Vivant = la ligne
   * existe ET est acceptée, la page est active, et la personne est membre
   * active du réseau de la page, relu à chaque acte.
   */
  pageSignatories: defineTable({
    networkId: v.id("networks"),
    pageId: v.id("pages"),
    personId: v.id("persons"),
    role: pageRoleValidator,
    /** Autorité éditoriale : version du rôle/acceptation ; les lignes historiques valent zéro. */
    authorityRevision: v.optional(v.number()),
    /** Qui a habilité ; absent pour le créateur, une revendication validée ou un acte de console. */
    grantedByPersonId: v.optional(v.id("persons")),
    /** L'acceptation de l'habilitation ; absente, l'invitation attend et ne donne aucun droit. */
    acceptedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_page_person", ["pageId", "personId"])
    .index("by_page_role", ["pageId", "role"])
    // « Mes pages » dans un réseau (le composeur « publier en tant que »).
    .index("by_network_person", ["networkId", "personId"])
    // Toutes mes pages (le fil de la racine, l'effacement).
    .index("by_person", ["personId"]),

  /**
   * Une REVENDICATION (EXF-AN-17) : un membre demande la main sur une page non
   * revendiquée (une association importée), ou son administrateur demande sa
   * VÉRIFICATION. Les pièces sont admises par la garde des fichiers et lues par
   * la modération du réseau seule ; la décision est motivée et tracée.
   */
  pageClaims: defineTable({
    networkId: v.id("networks"),
    pageId: v.id("pages"),
    claimantPersonId: v.id("persons"),
    note: v.optional(v.string()),
    evidenceStorageIds: v.array(v.id("_storage")),
    status: pageClaimStatusValidator,
    decidedByPersonId: v.optional(v.id("persons")),
    decisionReason: v.optional(v.string()),
    decidedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    // La file de la modération d'un réseau.
    .index("by_network_status_createdAt", ["networkId", "status", "createdAt"])
    // Une revendication en cours par (page, demandeur).
    .index("by_page_claimant_status", ["pageId", "claimantPersonId", "status"])
    // Mes revendications.
    .index("by_network_claimant_createdAt", ["networkId", "claimantPersonId", "createdAt"]),

  /**
   * L'HISTORIQUE d'identité d'une page : chaque changement de nom, de sigle, de
   * description, d'adresse, d'images, de pays ou de règle laisse les valeurs
   * d'AVANT — une page vérifiée qui se renomme le fait au grand jour.
   */
  pageIdentityHistory: defineTable({
    networkId: v.id("networks"),
    pageId: v.id("pages"),
    /** Un administrateur de la page, ou l'opérateur de console. */
    actorPersonId: v.id("persons"),
    /** Les valeurs AVANT le changement — seulement celles qui ont changé (`null` : il n'y en avait pas). */
    previous: v.object({
      name: v.optional(v.string()),
      shortName: v.optional(v.union(v.string(), v.null())),
      description: v.optional(v.union(v.string(), v.null())),
      handle: v.optional(v.string()),
      country: v.optional(v.union(v.string(), v.null())),
      city: v.optional(v.union(v.string(), v.null())),
      associationType: v.optional(v.union(pageAssociationTypeValidator, v.null())),
      sector: v.optional(v.union(pageSectorValidator, v.null())),
      visibility: v.optional(contentVisibilityValidator),
      logoChanged: v.optional(v.boolean()),
      bannerChanged: v.optional(v.boolean()),
    }),
    at: v.number(),
  }).index("by_page_at", ["pageId", "at"]),
}
