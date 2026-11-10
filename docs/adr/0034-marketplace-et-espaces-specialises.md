# ADR-0034 — Marketplace et espaces spécialisés

Date : 2026-10-21. Statut : **Accepté par le propriétaire** (plan MP00–MP14 et décisions A01–A10).

## Contexte

Le commerce existe en tranches P07–P16, mais les vitrines gardent la navigation sociale, les recherches filtrent une fenêtre récente et les activités média/professionnelles/personnelles n'ont pas de modèles propres. L'acceptation de ce plan ne vaut pas recette des anciens lots ni admission d'un prestataire financier.

## Décisions

1. Une page sociale par activité ; capacités produits, services et média combinables, sans nouvelle personne ni nouveau réseau. Les administrateurs et mandats actuels restent nécessaires. Les institutions et leur projection officielle ne sont pas ouvertes par cette évolution.
2. ANTSIA porte la présentation et les interactions sociales. PRO.GA conserve la vérité commerciale : structure, catalogue, variantes, attributs, prix, stock, devis, agenda, engagements et rapprochement. Échanges versionnés/signés/idempotents ; aucun client de base croisé.
3. Préparer, publier et encaisser sont trois admissions distinctes. Préparer une activité n'accorde ni badge ni paiement. La fermeture des nouveaux engagements conserve le suivi, la résolution et les retraits existants.
4. Les espaces spécialisés ont leur navigation et un retour social sûr. Les providers de session, communication, lecture et brouillons restent persistants au niveau membre. L'opt-in demeure propre à ANTSIA ; les cinq destinations sociales existantes sont conservées hors espaces spécialisés.
5. Marketplace multivendeur ; paniers conservés par personne/réseau/vendeur, un seul vendeur par préparation et débit. Aucun prix client faisant autorité.
6. Réseau professionnel volontaire et rencontres personnelles sont deux finalités séparées. L'admission personnelle exige une preuve minimale de majorité : ni un badge, ni une déclaration libre, ni un abonnement ne la remplace. Aucun export vers PRO.GA par défaut.
7. Presse : rédaction, habilitations, relecture, version publiée indépendante du brouillon, corrections et projection publique dédiées. Aucun élargissement de la garde `publicPageEligible` des pages officielles.
8. Le modèle de répartition P12 est conservé. L'activation réelle de chaque rail exige pays/devise/entité/contrat et preuves propres. Une API de transfert ne prouve ni l'admission marketplace, ni un remboursement carte, ni un reversement contractuellement autorisé.
9. Contrats additifs : DTO catalogue historique conservé jusqu'à négociation explicite d'une version supérieure par les deux produits. Aucune activation d'un champ économique inconnu à partir d'une valeur par défaut inventée.
10. Livraison par capacité et par version vérifiée. La source, les tests, la recette et la publication sont consignés séparément.

## Contrats et compatibilité arrêtés à MP00

- `specialized-navigation` v1 : origine locale autorisée, réseau/personne, date d'expiration, position bornée ; mémoire de session seulement, jamais droit serveur. La restauration du fil réutilise P04. Un contexte absent/expiré revient au fil.
- Configuration d'activité v1 : capacités `products|services|media`, modèle de présentation borné et ordre de blocs autorisés. Migration additive depuis `model=products|quote_services`, sans effet de publication implicite.
- Extension catalogue v2 prévue : taxonomie versionnée, attributs typés et champs de facettes allowlistés. Producteur et consommateur conservent v1 tant que la parité des fixtures, les retraits et les index v2 ne sont pas prouvés.
- Professionnel, personnel et rédaction : tables distinctes, `networkId`, permissions, consentements et inventaires d'export/effacement avant ouverture de leurs routes.
- Les routes `/boutique`, `/boutiques`, catalogue/offres et les suivis existants restent valides ; `/actus` conserve son sens Stories. Aucun alias vide annonçant une fonctionnalité future.

## Conséquences

Les ADR-0018/0019/0022 restent des documents historiques. Leurs responsabilités et gardes sont conservées ; le présent ADR accepte les décisions A01–A10 du nouveau plan, sans affirmer que les recettes financières anciennes sont closes. Les conditions externes sont suivies dans la référence MP00. Le travail partagé reste dans le checkout servi, sans changement de branche ni staging global.
