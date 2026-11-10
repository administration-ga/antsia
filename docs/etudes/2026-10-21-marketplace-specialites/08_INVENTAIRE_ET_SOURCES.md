# 08 — Inventaire, preuves de lecture et sources

**Lecture au 21 octobre 2026 · Aucun test ni recette applicative relancé pour cette étude**

## 1. Périmètre de preuve

Arbre partagé ANTSIA : branche codex/pa4-identite-session, HEAD c4d36f345707f87f20dbd970b2850c683c8581be, contenant de nombreuses modifications de plusieurs sessions. Le HEAD ne représente pas à lui seul les sources lues.

Les lignes ci-dessous décrivent le code consulté. Elles ne prouvent ni sa compilation actuelle, ni la configuration réelle, ni son déploiement. Les repères de lignes évolueront ; se reporter aux symboles et fichiers.

## 2. Réutilisation et écarts

| Source, depuis la racine ANTSIA | Constat de lecture | Conséquence pour le plan |
|---|---|---|
| convex/modules/shops/shops.ts : startShop/updateShop ; shops/tables.ts | Brouillon et boutique reliée à une page, une boutique par page | Faire évoluer ce modèle, pas créer un second compte marchand |
| convex/modules/shops/rules.ts ; composants shops/shop-model.ts | Modèles products et quote_services, plusieurs modèles futurs non ouverts | Capacités combinables et modèles métier à introduire |
| convex/modules/shops/catalogRead.ts ; catalogValidators.ts ; apps/antsia_ga/src/lib/catalog-search.ts | Filtres type/collection/texte ; fenêtre brute puis filtrage ; variantes reflétées | Index global et facettes typées à construire, variantes PRO.GA à préserver |
| apps/antsia_ga/src/components/shops/member-storefront-screen.tsx ; public-storefront-route.tsx | Vitrines dédiées, identité et liens sociaux simples | Nouvelle composition professionnelle et contexte de retour |
| apps/antsia_ga/src/components/shops/catalog-public-route.tsx ; offer-card.tsx : OfferDetails | Un slot de contact public est préparé mais son rendu est limité à member | Corriger la visibilité des CTA publics prévus, sans ouvrir les actions privées |
| convex/modules/shops/services.ts ; composants services/member-service-directory.tsx | Annuaire borné à quelques boutiques/offres récentes | Ne pas le présenter comme catalogue exhaustif de services |
| convex/modules/shops/serviceActions.ts ; serviceFlow.ts ; serviceTables.ts | Devis, réservation, forfait et reprise d’intention | Réutilisation P14 ; recette croisée et admission réelle distinctes |
| convex/modules/federation/commerceServiceNotices.ts | Avis privés de suivi présents dans les sources ultérieures | Réutiliser, sans reprendre la limite historique « aucune notification » |
| convex/modules/shops/commerceActivation.ts | storefrontAutomatic, payments, services, applications restent ready:false | Ouverture graduelle après preuves ; pas de bascule globale |
| ../PRO_GA/convex/modules/payments/adapters.ts | PAYMENT_ADAPTERS et PAYMENT_CALLBACK_BINDINGS vides | Les moyens demandés ne sont pas des intégrations actives |
| packages/social-domain/src/badges.ts ; convex/modules/pages/{pages,tables,access}.ts | Cinq natures de page ; création générique vérifiée ; rôles admin/signatory | Politique graduée ciblée et rôles éditoriaux spécialisés |
| convex/modules/public/access.ts : publicPageEligible | Page publique générique exige official ; un média plafonne à verified | Projection éditoriale spécifique, porte institutionnelle conservée |
| convex/modules/posts/tables.ts ; pages/pages.ts | Posts publiés/retirés, texte limité, édition concurrente, pas de modèle d’article/version intégrale | Articles, circuit rédactionnel et corrections à créer |
| convex/modules/people/tables.ts ; social-domain/consent.ts | Aucun profil sentimental ni preuve de majorité dans l’identité consultée | Admission, consentements et données personnelles dédiés |
| convex/modules/diaspora/jobsTables.ts ; diaspora/jobs.ts | Profils de talents propres au réseau DIASPORALE | Référence seulement ; ne pas exposer ou modifier cette tranche |
| convex/modules/contextualMessaging/tables.ts | Registre fermé, actuellement trois objets DIASPORALE | Toute nouvelle source de contact nécessite une définition et des gardes propres |

Les composants frontend cités sans préfixe complet vivent sous apps/antsia_ga/src/components/.

## 3. Références locales

- [Architecture commerciale et autorités existantes](../2026-10-18-social-commerce/08_ARCHITECTURE_INTEGRATION.md).
- [Étude boutiques/services initiale](../2026-10-18-social-commerce/06_BOUTIQUES_SERVICES_EMPLOI.md).
- [ADR0018 : autorité commerciale](../../adr/0018-commerce-pro-ga-autorite-et-contrats.md).
- [ADR0019 : boutique progressive et canal commercial](../../adr/0019-boutique-progressive-et-canal-commercial.md).
- [ADR0022 : paiement privé et répartition](../../adr/0022-paiements-prives-et-repartition-antsia.md).
- [Prompt P07](../2026-10-18-social-commerce/prompts/P07_BOUTIQUES.md), [P09](../2026-10-18-social-commerce/prompts/P09_CATALOGUE.md), [P12](../2026-10-18-social-commerce/prompts/P12_PAIEMENT.md), [P14](../2026-10-18-social-commerce/prompts/P14_SERVICES.md).
- [Reprise P14 et ses limites](../2026-10-18-social-commerce/rapports/P14_REPRISE_2026-10-20.md).
- [Plan responsive existant](../2026-10-20-experience-sociale-responsive/04_PLAN_IMPLEMENTATION.md).

Ces documents portent leurs décisions et états historiques ; le nouvel inventaire n’en transforme pas les propositions en activations.

## 4. Références externes primaires consultées

| Source | Apport limité à cette étude |
|---|---|
| [Shopify — Storefront filtering](https://shopify.dev/docs/storefronts/themes/navigation-search/filtering/storefront-filtering) | Référence d’ergonomie pour filtres catalogue, variantes et état de recherche partageable ; aucune dépendance Shopify décidée |
| [Upwork — Project Catalog](https://support.upwork.com/hc/en-us/articles/360057397533-How-to-create-a-project-in-Project-Catalog) | Référence d’offres de services présentant livrables, prix et exigences ; pas d’import de son modèle de séquestre |
| [Airtel — portail développeur](https://developers.airtel.africa/) et [annonce API](https://www.airtel.africa/assets/pdf/press-release/Airtel-Africa-Developer-Portal_ENGLISH.pdf) | Présence du Gabon et familles d’API annoncées ; contrat et capacités locales à confirmer |
| [Moov Money Online](https://moovmoney.ga/marchand/moov-money-online-marchand/) | Offre marchande en ligne ; admission commerciale et fonctions techniques restantes à qualifier |
| [PayPal — onboarding vendeurs](https://developer.paypal.com/platforms/seller-onboarding) et [monnaies API](https://developer.paypal.com/api/codes/currency) | Restriction marchande Gabon et absence de XAF dans la liste consultée |
| [SingPay](https://singpay.ga/) et [API officielle](https://client.singpay.ga/doc/reference/index.html) | Fonctions techniques mobiles à étudier ; admission marketplace et règlement à contractualiser |
| [CinetPay — offre](https://cinetpay.com/index.php/products/payments) et [SDK officiel](https://github.com/cinetpay/cinetpay-php-sdk/blob/master/README.md) | Piste carte ; aucune éligibilité d’acquisition gabonaise établie par cette étude |
| [BEAC — règlement CEMAC04/18](https://www.beac.int/wp-content/uploads/2019/07/REGLEMENT-N-04-18-CEMAC-UMAC-COBAC-du-21-d%C3%A9cembre-2018.pdf) | Référence réglementaire pour faire qualifier collecte et reversement, pas agrément obtenu |
| [APDPVP — textes et lois](https://www.apdpvp.ga/textes-et-decisions/) | Référence locale pour cadrer finalités, information, données et obligations avant ouverture du personnel |

Les références fonctionnelles servent à étudier des comportements ; elles n’impliquent ni copie de marque, ni reprise de contenus, ni conformité acquise. Les disponibilités des prestataires devront être revérifiées au moment de signer et d’activer.

## 5. Décisions externes encore nécessaires

| Sujet | Responsable proposé | Étape bloquée |
|---|---|---|
| Entité collectrice et contrat marketplace | Propriétaire + prestataire + conseil compétent | Encaissement et reversements réels |
| Acquisition carte et rails mobiles admis | Responsable paiements + opérateurs/PSP | Chaque moyen concerné |
| Frais, commissions, remises, retours et litiges | Propriétaire + métiers | Engagement commercial correspondant |
| Admission et preuve de majorité proportionnée | Propriétaire + responsable données + fournisseur éventuel | Rencontres personnelles ouvertes |
| Durées de données et traitement des signalements | Responsable données + modération | Ouverture de la finalité correspondante |
| Responsable de publication et politique de corrections | Administrateur du média + gouvernance ANTSIA | Publication éditoriale concernée |

Ces points n’empêchent pas de valider l’architecture et de construire les lots indépendants. Ils empêchent seulement d’annoncer une activation réelle non encore justifiée.
