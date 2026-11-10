/**
 * CM-09 — les FAVORIS d'offres : une offre de boutique (produit ou prestation du
 * catalogue reflété, ou offre fictive de démonstration) mise de côté par un membre,
 * dans le réseau où il l'a enregistrée.
 *
 * Privée par construction : seule la personne lit ses lignes. Aucun compteur n'en
 * est tiré pour le vendeur, le public, un classement ou une recommandation ; aucun
 * avis n'en part vers la boutique. Distincte de « Suivre » une page (`pageFollows`)
 * et des publications enregistrées (`postMarks`, genre `bookmark`).
 *
 * Seulement des RÉFÉRENCES (boutique, `offerRef`) : ni titre, ni prix, ni image.
 * Chaque lecture relit l'offre avec les droits du lecteur ; une offre devenue
 * invisible (retirée, vitrine fermée, modération, politique) n'est plus montrée,
 * et sa ligne reste jusqu'au retrait par la personne ou à la purge de la boutique.
 */
import { defineTable } from "convex/server"
import { v } from "convex/values"

export const savedOfferTables = {
  savedOffers: defineTable({
    networkId: v.id("networks"),
    personId: v.id("persons"),
    shopId: v.id("shops"),
    offerRef: v.string(),
    createdAt: v.number(),
  })
    // Unicité (une ligne par personne, réseau et offre) et « est-ce enregistré ? » en un seul accès.
    .index("by_network_person_shop_offer", ["networkId", "personId", "shopId", "offerRef"])
    // Mes favoris, les plus récents d'abord ; le quota se compte sur le même index.
    .index("by_network_person_createdAt", ["networkId", "personId", "createdAt"])
    // Purge par lots quand la boutique est défaite (et, plus tard, les alertes CM-11 d'une offre).
    .index("by_shop_offer", ["shopId", "offerRef"]),
}
