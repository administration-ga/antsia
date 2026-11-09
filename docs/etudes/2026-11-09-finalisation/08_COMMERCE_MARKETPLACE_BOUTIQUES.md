# Plan 08 — Commerce : marketplace et boutiques

> Constaté par lecture du code d'`origin/main` (ANTSIA `26741caa`, DIASPORALE `bead76d`), le 9 novembre 2026. Rien n'a été exécuté.
> Applications de référence : Facebook Marketplace, Instagram Shopping, WhatsApp Business (catalogue et panier), TikTok Shop, Jumia, vitrine Shopify, Veepee, Vinted. Comparaison faite de mémoire (état des produits à la mi-2026), non revérifiée en ligne.

Petit lexique, pour la suite :
- **PRO.GA** : le logiciel de gestion des entreprises du programme. Il est l'**autorité** du commerce : catalogue, prix, stock, commandes. ANTSIA n'en garde qu'un **reflet** (une copie publique, signée, qui se met à jour).
- **Contrat** : un format d'échange signé entre ANTSIA et PRO.GA (`docs/contrats/PRO-COMMERCE-*.md`). Changer ce qui circule exige une nouvelle version du contrat, des deux côtés.
- **Préparation** : l'étape où PRO.GA relit les prix et réserve le stock pour un panier. Elle ne crée ni commande ni paiement.
- **Projection publique** : ce qu'un visiteur sans compte peut lire, contrôlé par un schéma strict.

## 1. L'intention du propriétaire

- **Formule** : « Une page pour exister, des espaces pour vendre, PRO.GA pour gérer. » La boutique est une capacité d'une page, pas une identité séparée (ADR-0019, ADR-0034 décision 1, étude des sept univers § 7.1).
- **Pour qui** : la vendeuse qui vit aujourd'hui des catalogues WhatsApp et des groupes Facebook, payée d'avance et sans recours ; l'acheteur qui veut un prix visible, une variante réelle et un suivi (étude des sept univers § 5.1).
- **Pilier** : le business « qui fait vivre » (ADR-0035). Boutiques est l'univers de la vague V1 ; la restauration (commande payée à la remise) est en V2 (étude § 15).
- **PRO.GA reste l'autorité** : ANTSIA ne ressaisit ni prix ni stock ; toute écriture est une commande vers PRO.GA (ADR-0018, ADR-0034 décision 2).
- **Trois admissions distinctes** : préparer, publier, encaisser (ADR-0019, ADR-0034 décision 3).
- **Paniers par vendeur**, une commande et un paiement par vendeur ; aucun paiement multivendeur annoncé (ADR-0034 décision 5, étude marketplace 02 § 4).
- **Paiement** : modèle P12 (ANTSIA collecte, retient 10 % ou 15 % ou un taux de contrat, reverse après réception) conservé comme cible, **fermé** tant qu'aucun prestataire n'est contracté (ADR-0022, note vault du 18/10, registre DP-10 à DP-14).
- **D04 (validée le 21/10)** : ouvrir d'abord ce qui se paie à la remise (étude § 18).
- **D08 (validée)** : 18 ans pour les transactions (étude § 18).
- **Style « ventes privées »** (22/10) : grandes cartes de boutiques, carrousels, fiche à barre basse, panier, étape de livraison ; **rien d'inventé** (ni remise, ni avis, ni total d'articles, ni transporteur, ni date de livraison) ; « Demander la préparation » reste le bouton final (mémoire `marketplace-ventes-privees`).
- **Fil sans cadre** (ADR-0037) : formules d'action collées au média (Acheter, Réserver, Obtenir un devis, Commander, Voir l'offre), panneau prix aux deux tiers dès 480 px.
- **Refusé** : la grille de publications au bureau (colonne unique, ADR-0037) ; le double maître du catalogue (ADR-0018 option A) ; un faux bouton d'achat pour une offre sur devis (étude 18/10, 00 § 4).

## 2. Ce qui existe

Chemins relatifs au dépôt ANTSIA. « Mobile » : `apps/antsia_mobile`.

| Capacité | État | Web | Mobile | Preuve |
|---|---|---|---|---|
| Accueil de la marketplace façon ventes privées (grandes cartes, carrousels) | Présent | oui | non | `apps/antsia_ga/src/components/marketplace/marketplace-home.tsx` |
| Trois vues Produits, Boutiques, Services | Présent | oui | recherche | `components/marketplace/marketplace-screen.tsx` ; `apps/antsia_mobile/src/screens/shop-directory-section.tsx` |
| Recherche multivendeur paginée sur un index | Présent (index vide faute de reflet) | oui | oui | `convex/modules/shops/marketplace.ts`, `marketplaceIndex.ts`, `marketplaceRead.ts` |
| Facettes : catégorie, marque, matière, couleur, public, prix | Présent | oui | partiel (type, collection) | `convex/modules/shops/catalogValidators.ts` (`marketplaceFilterArgs`) ; `components/marketplace/marketplace-filters.tsx` ; `apps/antsia_mobile/src/lib/native-business.ts` |
| Tri : nouveautés, prix croissant ou décroissant, pertinence | Présent | oui | oui | `catalogValidators.ts` (`sort`) |
| Rayons et collections | Présent | oui | oui | `convex/modules/shops/catalogFacetValidators.ts` ; clés `shops:catalog.collections` |
| Fiche produit, variantes aux combinaisons réelles | Présent | oui | oui | `apps/antsia_ga/src/lib/offer-variant-selection.ts` ; `apps/antsia_mobile/src/screens/offer-screen.tsx` |
| Stock visible, indicatif et daté | Présent | oui | oui | `catalogOfferValidator.availability` (`indicative`, `stale`) |
| Galerie de photos | Présent | oui | oui | `components/shops/offer-gallery.tsx`, `offer-media-carousel.tsx` ; `apps/antsia_mobile/src/components/business-media.tsx` |
| Vidéo du produit | Partiel : seule la vidéo de la publication liée ; le média d'offre n'a pas de type vidéo | oui | non | `components/shops/offer-post-formula.tsx` ; `catalogOfferValidator.media` |
| Formules d'action dans le fil (Acheter, Réserver, Devis, Commander, Voir l'offre) | Présent | oui | lecture | `components/shops/offer-post-formula.tsx` ; `convex/modules/shops/catalogPosts.ts` ; `apps/antsia_mobile/src/screens/feed-screen.tsx` |
| Plusieurs produits identifiés dans une publication | Absent : une offre par publication | — | — | `catalogPostReferenceValidator` (un seul `offerRef`) |
| Partage d'un produit | Présent : lien public seul | oui | non | clés `cart:shareOffer` ; `app/(public)/boutiques/[handle]/offres/[offerRef]/page.tsx` |
| Vitrine : bannière, logo, horaires, zone, blocs ordonnés | Présent | oui | oui | `convex/modules/shops/shops.ts` (`storefront`, `bannerUrl`) ; `components/shops/member-storefront-screen.tsx` ; `apps/antsia_mobile/src/screens/shop-screen.tsx` |
| Vitrine sans compte | Présent | oui | — | `convex/modules/public/shops.ts` ; `components/shops/public-storefront-route.tsx` |
| Conditions : retrait, livraison, frais, délai, retours, garantie | Présent (catalogue V2) | oui | non | `packages/social-domain/src/commerce/storefrontTerms.ts` ; `components/shops/storefront-terms.tsx` |
| Sélection du vendeur, boutique en vedette | Absent | — | — | motifs du § 2 bis |
| Favoris, liste d'envies | Absent | — | — | motifs du § 2 bis |
| Alerte de prix ou de retour en stock | Absent | — | — | motifs du § 2 bis |
| Produits vus récemment | Absent | — | — | motifs du § 2 bis |
| Comparaison de produits | Absent | — | — | motifs du § 2 bis |
| Avis et notes | Absent (volontaire tant qu'aucune transaction réelle) | — | — | motifs du § 2 bis |
| Questions sur un produit | Partiel : question privée au vendeur avec offre facultative, aucune question publique | oui | non | `app/(membre)/boutique/[handle]/contacter/page.tsx` ; `components/shops/contact-request-screen.tsx` |
| Ma boutique et Mon activité : éditeur en quatre étapes | Présent | oui | lien web | `components/shops/shop-editor-screen.tsx`, `my-shops-screen.tsx` ; `app/(membre)/mes-boutiques/` |
| Tableau de bord vendeur (ventes, visites, messages) | Partiel : carte de liens, aucun chiffre ni commande | oui | non | `components/shops/shop-dashboard-card.tsx` |
| Commandes côté vendeur | Partiel : dans PRO.GA ; aucune cible « commandes » depuis ANTSIA | — | — | `apps/antsia_ga/src/lib/routes.ts` (`proMerchantTargetHref` : catalogue, devis, agenda) |
| Plusieurs gérants | Présent : administrateurs de page et mandats de répondant | oui | — | `convex/modules/shops/access.ts` ; `convex/modules/commercialMessaging/team.ts` |
| Liaison PRO.GA à double preuve | Présent (code), jamais recettée en ligne | oui | — | `convex/modules/shops/commerceLinks.ts`, `commerceLinkActions.ts` ; `components/shops/shop-commerce-link.tsx` |
| Catalogue reflété (contrat V2, facettes, index, médias gardés) | Présent (code) ; aucun catalogue réel reflété | oui | oui | `convex/modules/federation/commerceCatalog.ts`, `commerceCatalogMedia.ts` ; `convex/modules/shops/catalogReconciliation.ts` |
| Créer ou modifier une offre depuis ANTSIA | Absent : la commande `catalog.draft.save` existe dans le domaine, sans appelant | — | — | `packages/social-domain/src/commerce/command.ts` |
| Panier par vendeur | Partiel : stockage de l'onglet, 24 h, 8 boutiques de 10 lignes, non synchronisé | oui | lien web | `apps/antsia_ga/src/lib/cart-draft.ts`, `cart-book.ts` ; `components/cart/use-cart-draft.ts` |
| Préparation : relecture prix et stock, réservation, mode de remise, frais | Présent ; **Fermé** par politique réseau (absence = fermé) | oui | lien web | `convex/modules/shops/checkoutFlow.ts`, `checkoutPolicy.ts` ; `components/checkout/checkout-screen.tsx` |
| Adresse et mode de remise (retrait, livraison vendeur, Gabon seul) | Présent | oui | — | clés `checkout:pickup`, `checkout:seller_delivery`, `checkout:validation.country` |
| Délai de remise après engagement | Partiel : `leadTimeDays` souvent inconnu après engagement (DP-16) | oui | — | `catalogOfferValidator.leadTimeDays` ; registre DP-16 |
| **Commande réglée à la remise (D04)** | **Absent** : aucune opération ne crée de commande sans paiement ; la préparation expire | — | — | `docs/contrats/PRO-COMMERCE-COMMAND-V1.md` § 6 (`payment.start` seul crée la commande) |
| Paiement en ligne | **Fermé** : `payments.ready=false`, politique réseau, aucun adaptateur | oui | — | `convex/modules/shops/commerceActivation.ts` ; `paymentPolicy.ts`, `paymentAccess.ts` |
| Préparation financière du vendeur (MP07) | **Fermé** : `ANTSIA_COMMERCE_PAYMENT_PREPARATION_ENABLED=false` | oui | — | `convex/modules/shops/paymentPreparation.ts` ; `components/payment/merchant-payment-preparation-panel.tsx` |
| Mes achats : suivi, historique, réception attestée | Présent (code) ; inatteignable sans commande | oui | lien web | `convex/modules/shops/purchases.ts`, `purchasesActions.ts` ; `components/purchases/purchases-screen.tsx` |
| Annulation, retour | Partiel : demandes présentes, liées à une commande | oui | — | `purchasesActions.ts` (`cancel`, `requestReturn`) |
| Remboursement | **Fermé** avec le paiement | oui | — | `convex/modules/shops/paymentActions.ts` (`requestRefund`) |
| Litige | Absent : l'état `disputed` est seulement affiché | — | — | clés `payment:orderStates.disputed` |
| Facture ou reçu | Absent | — | — | motifs du § 2 bis |
| Codes de réduction, ventes à durée limitée | Absent | — | — | motifs du § 2 bis |
| Contact commercial et consentement au suivi client (CRM) | Présent (code) ; **Fermé** par politiques réseau et boutique | oui | non | `convex/modules/commercialMessaging/` ; `components/shops/contact-*.tsx` ; `docs/21_CONTACT_COMMERCIAL_PRO_GA.md` |
| Réponses rapides, message d'absence | Absent (lot ICP-3, plan 01) | — | — | `commercialMessaging/settings.ts` (seul `acceptRequests`) |
| Boutique en pause (vacances) | Absent : seulement « accepter les demandes » ou retirer la vitrine | — | — | `commercialMessaging/settings.ts` ; `shops.ts` (`withdrawStorefront`) |
| Avis de commerce pour les produits (préparation, commande) | Absent : 14 genres pour services et emploi seulement | — | — | `packages/social-domain/src/commerceNotifications.ts` |
| Politiques de la console (vitrine, catalogue, rattachements, préparation, paiement, contact) | Présent | console | — | `apps/admin_antsia_ga/src/components/console-{storefront-policy,catalog-policy,catalog-mapping,checkout-policy,payment-policy,commercial-contact}.tsx` |
| Signalement d'une vitrine ou d'une offre | Présent | oui | — | `convex/modules/moderation/cases.ts` (`commerceStorefront`, `commerceOffer`) |
| Export et effacement des données de commerce | Présent | oui | — | `convex/modules/people/dataInventory.ts`, `erasure.ts`, `dataPolicies.ts` |
| Majorité de 18 ans pour acheter (D08) | Absent | — | — | motifs du § 2 bis |
| Catégories interdites refusées au reflet | Absent | — | — | motifs du § 2 bis |
| Marketplace lisible sans compte | Partiel : vitrine et fiche publiques, pas de recherche publique | oui | — | `app/(public)/boutiques/[handle]/` (aucune page d'index) |

**Décompte** : 25 Présent, 8 Partiel, 17 Absent, 3 Fermé (53 lignes ; les deux lignes « Présent ; Fermé » — préparation et contact commercial — sont comptées Présent, car le code existe et n'attend qu'une politique).

### 2 bis. Motifs cherchés pour les absences

Dans `convex/modules/{shops,commercialMessaging,public}`, `apps/antsia_ga/src/components/{marketplace,shops,cart,checkout,payment,purchases}`, les i18n `fr` correspondantes et `packages/social-domain/src/commerce*`, sans résultat utile :
- favoris : `wishlist|favorite|favori|envies|savedOffer` ;
- alertes : `priceAlert|alerte de prix|backInStock|retour en stock|restock` ;
- vus récemment : `recentlyViewed|vus récemment|recently` (seul `recentlyOutOfStock`, autre sens) ;
- comparaison : `compare|comparaison` (comparaisons de code seulement) ;
- avis : `review|avis vérifié|rating|stars` (seulement « en revue ») ;
- remises : `coupon|promo|discount|remise|réduction|voucher` (« remise » = mode de remise ; `offer-card.tsx` dit « ni prix barré ni remise ») ;
- durée limitée : `flash|durée limitée|countdown|limitedTime` ;
- pause : `vacation|vacances|absence|awayMessage|fermeture temporaire` ;
- reçu : `invoice|facture` (aucun usage commercial) ;
- vedette : `featured|en vedette|mis en avant|Notre sélection` ;
- majorité : `age|majorit|birth|adult` dans `checkoutFlow.ts`, `checkoutActions.ts`, `paymentFlow.ts` ;
- catégories interdites : `prohibited|interdit|forbiddenCategor|restricted`.

### Ce qui est écrit mais jamais recetté en réel

| Élément | Constat | Source |
|---|---|---|
| Marketplace, boutiques, fiches, filtres | Consultés en ligne sur la démo à 390, 834 et 1 440 px, comptes fictifs | `docs/recette/espaces-specialises-2026-10-25/RAPPORT.md` ; vault `reprise-marketplace-2026-10-25` |
| Formules du fil | En ligne le 22/10 sur 8 publications de démo, offres fictives | mémoire `fil-sans-cadre-adr-0037` |
| Liaison PRO.GA, reflet du catalogue | Jamais en ligne. Liaison réelle faite **en local** le 25/10 ; aucun rattachement, aucune tête, aucun reçu appliqué | vault `su06-catalog-reflection-2026-10-24` |
| Bac à sable « Niveau 1 » (ADR-0040, ADR-0041) | Local seulement, **absent de `main`** (les ADR s'arrêtent à 0039) | dossier de reprise § 10.1 |
| Panier positif, préparation, achats | Éprouvés par harnais ; le navigateur n'a vu que l'état vide | étude marketplace `EXECUTION.md`, MP05 |
| Parcours B-2 à B-6 et C-1 à C-13 | « non » ou « partiel » | `docs/etudes/2026-10-18-social-commerce/pilote/03_PARCOURS_DE_RECETTE.md` |
| Contact commercial deux comptes, CRM, appel | Non recetté | `docs/21_CONTACT_COMMERCIAL_PRO_GA.md`, restes 3 |
| Paiements, remboursements, reversements | Fermés, aucun prestataire | registre DP-10, `EXECUTION.md` MP08 |

## 3. Comparaison avec les applications de référence

FB : Facebook Marketplace · IG : Instagram Shopping · WA : WhatsApp Business · TT : TikTok Shop · JU : Jumia · SH : vitrine Shopify · VP : Veepee · VI : Vinted. « — » : absent ou non sûr.

| Capacité | FB | IG | WA | TT | JU | SH | VP | VI | ANTSIA | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| Recherche et filtres | oui | — | — | oui | oui | oui | oui | oui | Présent | Déjà fait |
| Favoris d'articles | oui | oui (enregistrer) | — | oui | oui | — | oui | oui | Absent | À faire (CM-09), prévu « complément P1 » (étude 02 § 1) |
| Alerte retour en stock ou baisse de prix | — | — | — | — | — | — | — | oui (favoris) | Absent | À adapter (CM-11), seulement sur données reflétées |
| Vus récemment | oui | — | — | oui | oui | — | — | — | Absent | À adapter (CM-12), local à l'appareil |
| Vidéo produit | oui | oui | — | oui | — | oui | — | — | Partiel | À faire (CM-15), contrat V2 |
| Plusieurs produits dans une publication | — | oui | — | oui | — | — | — | — | Absent | À faire (CM-14) |
| Catalogue partagé dans la conversation | — | — | oui | — | — | — | — | — | Partiel (lien) | À adapter (CM-14, carte d'offre dans iCom, plan 01) |
| Panier conservé entre appareils | — | — | oui (par conversation) | oui | oui | oui | oui | — | Partiel (onglet, 24 h) | À faire (CM-08) |
| Panier envoyé au vendeur, commande sans paiement en ligne | — | — | oui | — | — | — | — | — | Absent | À faire (CM-04), c'est D04 |
| Paiement à la livraison | — | — | — | — | oui | — | — | — | Absent | À faire (CM-04) |
| Réservation du panier à durée limitée | — | — | — | — | — | — | oui | — | Présent (préparation tenue) | Déjà fait ; prolongation : DP-15 |
| Paiement en ligne intégré | — | — | — | oui | oui | oui | oui | oui | Fermé | Reporté (MP08), porte contrat |
| Suivi de commande | — | — | — | oui | oui | oui | oui | oui | Présent, inatteignable | Débloqué par CM-04 |
| Avis vérifiés | oui (vendeur) | — | — | oui | oui | — | — | oui | Absent | À adapter (CM-16), après réception attestée |
| Codes de réduction | — | — | — | oui | oui | oui | — | — | Absent | Écarté tant que PRO.GA ne porte pas de remise réelle |
| Ventes à durée limitée | — | — | — | oui | oui | — | oui | — | Absent | Écarté tant que PRO.GA ne porte pas de remise réelle |
| Collections et mise en avant du vendeur | — | oui | oui | — | — | oui | — | — | Partiel (collections) | À faire (CM-13), libellé « Notre sélection » |
| Réponses rapides, absence | — | — | oui | — | — | — | — | — | Absent | Plan 01 (ICP-3) |
| Mise en pause de la boutique | — | — | — | — | — | oui | — | oui (mode vacances) | Absent | À faire (CM-10) |
| Statistiques du vendeur | — | oui | — | oui | oui | oui | — | — | Absent | À adapter (CM-07), sans chiffre inventé |
| Commandes reçues côté vendeur | — | — | oui | oui | oui | oui | — | oui | Dans PRO.GA | À adapter (CM-07), lien et compteur |
| Litige et protection acheteur | — | — | — | oui | oui | — | — | oui | Absent | À adapter (CM-17), sans promesse de séquestre |
| Lecture sans compte | — | — | — | — | oui | oui | — | oui | Partiel | À faire (CM-19) |
| Vente en direct | — | — | — | oui | — | — | — | — | Absent | Plan 04 et SU14 |
| Comparaison | — | — | — | — | — | — | — | — | Absent | Écarté : peu d'intérêt mesuré, coût |

## 4. Ce qui manque

### 4.1 Bloquant avant l'ouverture au public

1. **Aucun achat ne peut aboutir.** Avec le paiement fermé, la préparation réserve puis expire. Or l'interface de la restauration dit déjà « Commandez… puis réglez à la remise » (`marketplace.json`, `food.lead`). D04 n'est pas implémentée (CM-04).
2. **Aucun catalogue réel reflété** : la marketplace et l'univers alimentaire sont vides hors démo (CM-01, reprend « SU06 recette peuplée »).
3. **Pas de garde de majorité pour acheter** (D08), alors que l'ordonnance et la loi 025/2023 s'appliquent (CM-03, porte SU01c).
4. **Pas de liste de catégories interdites** au reflet du catalogue (étude § 5.1 « catégories interdites refusées » ; DP-05) (CM-02).
5. **Aucune recette transactionnelle à deux comptes** (CM-06).

### 4.2 Attendu par les utilisateurs

- Savoir que sa commande est prête ou partie : avis de commerce pour les produits (CM-05).
- Retrouver son panier sur un autre appareil ou après fermeture de l'onglet (CM-08).
- Enregistrer un article en favori (CM-09).
- Voir ses commandes reçues depuis « Ma boutique » (CM-07).
- Mettre sa boutique en pause (CM-10).

### 4.3 Différenciant pour ANTSIA

- **Commande réglée à la remise, tracée** : la parade aux paiements d'avance non conformes (étude § 5.1, « douleur »). La commande est confirmée par PRO.GA, la réception est attestée, sans aucun fonds manipulé par ANTSIA.
- **Prix et stock d'une seule autorité** : jamais deux prix pour la même variante (ADR-0018).
- **Confiance calculée** (Vérifié IDN, structure PRO.GA) et avis liés à une réception réelle (CM-16).
- **Faible débit** : panier et favoris légers, alertes sans contenu, aucune image dans les avis.
- **Lien avec l'administration** : la structure PRO.GA porte RCCM et NIF, que l'acheteur voit comme badge calculé.

### 4.4 Écarté ou reporté, et pourquoi

| Sujet | Décision | Raison |
|---|---|---|
| Codes de réduction, ventes flash, prix barré | Écarté | Aucune donnée réelle de remise dans le contrat ; « rien d'inventé ». À rouvrir si PRO.GA publie des promotions |
| Paiement multivendeur unique | Écarté | ADR-0034 décision 5 |
| Comparaison de produits | Écarté | Faible valeur pour le pilote |
| Questions publiques sous un produit | Reporté | Modération supplémentaire ; la question privée existe |
| Paiement en ligne et mobile | Reporté (MP08, P3) | Porte externe : contrat de prestataire |
| Annonces de particuliers | Plan 10 | Hors périmètre |
| Mise en avant payante | Plan 11 | Étiquetage du sponsorisé |
| Vente en direct | Plan 04, SU14 | Après paiement (V5) |

## 5. Lots d'implémentation

Chaque lot se termine par `bun run verify` vert puis une recette à 390, 834 et 1 440 px, en clair et en sombre. Chaque lot reste branché depuis l'interface.

### CM-01 — Chaîne réelle du catalogue PRO.GA vers ANTSIA · priorité P0 · taille M · session S1
- **Pour l'utilisateur** : la marketplace montre de vraies offres d'un vrai vendeur, avec photos, variantes et prix tenus par PRO.GA.
- **Backend** : aucun nouveau code attendu. Configurer l'émetteur V2, la politique et le rattachement (console), puis le consentement de structure et d'offres, la réconciliation et l'index. Intégrer ou non à `main` l'exception locale « Niveau 1 » (ADR-0040, 0041) selon la décision 9.
- **Web** : rien de neuf. Vérifier les états vides, en construction et en panne de `marketplace-screen.tsx` et de l'univers alimentaire.
- **Mobile** : recette de la consultation (boutique, offre) sur la même donnée.
- **Données personnelles** : aucune nouvelle.
- **Tests et cliquets** : rejouer `convex/modules/shops/catalog.test.ts` et `marketplace.test.ts` ; consigner la recette B-2, B-3, B-4 et B-6 dans `docs/recette/`.
- **Critères d'acceptation** : une offre publiée dans PRO.GA apparaît dans la marketplace avec son reçu `applied`, une modification de prix arrive, un retrait la fait disparaître ; une photo non analysée reste retenue.
- **Dépend de** : producteur V2 de PRO.GA déployé ; compte IDN habilité ; clés COMMAND et PUBLIC.
- **Porte** : propriétaire (clés, compte, déploiement PRO.GA, choix de l'environnement : sandbox, démo, production).

### CM-02 — Catégories interdites et réglementées · priorité P0 · taille M · session S1
- **Pour l'utilisateur** : aucun médicament, arme, espèce protégée ou document officiel en vente.
- **Backend** : liste fermée versionnée dans `packages/social-domain/src/commerce/` (clés de taxonomie V2) ; refus au reflet dans `convex/modules/federation/commerceCatalog.ts` (lettre morte motivée, sans contenu) ; secteurs réglementés soumis à la politique `review` de la vitrine (`convex/modules/shops/decisions.ts`).
- **Web** : motif lisible pour le gérant dans l'éditeur ; console : vue des refus dans `console-catalog-mapping.tsx`.
- **Mobile** : rien.
- **Données personnelles** : aucune.
- **Tests et cliquets** : test pur de la liste ; test du refus au reflet ; parité des fixtures avec PRO.GA.
- **Critères d'acceptation** : une offre d'une catégorie interdite n'entre ni dans l'index ni dans la vitrine ; le refus est audité.
- **Dépend de** : DP-05 ; contrat catalogue V2.
- **Porte** : propriétaire et conseil (liste).

### CM-03 — Majorité pour acheter · priorité P0 · taille S · session S1
- **Pour l'utilisateur** : un mineur peut consulter, pas commander.
- **Backend** : garde dans `checkoutFlow.ts` (`authorize`) et dans la future commande CM-04, lisant le signal d'âge produit par SU01c ; refus indistinct.
- **Web** : message neutre à l'étape de remise (`checkout-screen.tsx`).
- **Mobile** : rien (le parcours est sur le web).
- **Données personnelles** : aucune donnée d'âge copiée dans le commerce.
- **Tests et cliquets** : tests de garde ; aucun âge transmis à PRO.GA (cliquet de contrat existant).
- **Critères d'acceptation** : sans signal de majorité, aucune préparation ni commande n'est créée.
- **Dépend de** : SU01c (plan 12).
- **Porte** : avis du juriste (arbitrages A1 à A4 de SU01).

### CM-04 — Commande réglée à la remise (D04) · priorité P0 · taille L · session S1 (et PRO.GA)
- **Pour l'utilisateur** : « Commander, régler à la remise » transforme une préparation tenue en commande confirmée par le vendeur, sans paiement en ligne. Suivi dans Mes achats, réception attestée.
- **Backend** : nouveau contrat jumeau `PRO-COMMERCE-ORDER-PLACE-V1` (hors manifeste P06 figé, comme les contrats P10 à P13) : `order.place` avec `settlement: "on_handover"`, lié à la préparation tenue, au total accepté et à la version des conditions ; idempotent, même profil de signature que `checkout.prepare`. PRO.GA crée une commande sans intention de paiement et accepte la réception attestée sans paiement prouvé pour ce mode. ANTSIA : `convex/modules/shops/orderPlacement*.ts` (bail, octets exacts, reprise par `request.status`), politique réseau `shopOnHandoverPolicies` (absence = fermé) et capacité déclarée du vendeur dans `storefrontTerms` (`onHandover`). Plafond de montant par commande si le propriétaire le fixe.
- **Web** : dernier bouton de `checkout-screen.tsx` : « Commander, régler à la remise » quand la capacité est ouverte, sinon « Demander la préparation » ; récapitulatif « Aucun paiement en ligne. Vous réglez le vendeur à la remise. » ; `purchases-screen.tsx` affiche le mode de règlement. Console : interrupteur dans `console-checkout-policy.tsx` avec motif et audit.
- **Mobile** : après le web (plan 14).
- **Données personnelles** : commandes déjà dans l'inventaire (`shopPurchaseSnapshots`) ; ajouter les nouvelles tables à `dataInventory.ts` et `erasure.ts`.
- **Tests et cliquets** : fixtures du contrat copiées à l'octet dans les deux dépôts ; double clic, délai réseau, préparation expirée, total changé, vitrine retirée ; cliquets `rate-limited-writes`, `operator-audit`.
- **Critères d'acceptation** : une préparation tenue devient une seule commande ; un second clic ne crée rien ; une préparation expirée est refusée ; la réception attestée passe à « Réception attestée » ; aucun état « payé » n'apparaît.
- **Dépend de** : CM-01, CM-03 ; DP-14 (conditions de vente) ; décision 1.
- **Porte** : décision du propriétaire ; publication de PRO.GA ; publication ANTSIA.

### CM-05 — Avis de commerce des produits · priorité P1 · taille M · session S1
- **Pour l'utilisateur** : la cloche dit « Votre réserve expire bientôt », « Commande confirmée », « Prête pour la remise », « Expédiée », « Annulation décidée » ; l'équipe de la boutique reçoit « Nouvelle commande ».
- **Backend** : genres `commerce_order_*` et `commerce_checkout_expiring` dans `packages/social-domain/src/commerceNotifications.ts`, sans montant, nom ni contenu ; émis seulement sur un état confirmé par PRO.GA (règle P14B) ; garde `convex/modules/notifications/commerceAccess.ts` relue à l'ouverture.
- **Web** : libellés i18n fr et en ; ouverture vers `/mes-achats/[purchaseId]` ou `/mes-commandes/[attemptId]`.
- **Mobile** : la cloche native lit les mêmes genres (plan 14).
- **Données personnelles** : avis effacés avec la personne (déjà couvert par `notifications`).
- **Tests et cliquets** : cliquets `notifications-writer` et `notification-payload-content`.
- **Critères d'acceptation** : une transition s'annonce une fois ; un clic local n'annonce rien ; aucun contenu commercial dans l'avis.
- **Dépend de** : CM-04 ; transports push et e-mail (plan 06).
- **Porte** : aucune.

### CM-06 — Recette transactionnelle à deux comptes · priorité P0 · taille M · session S1
- **Pour l'utilisateur** : rien de visible ; c'est la preuve.
- **Backend et web** : aucun code ; parcours C-1, C-2, C-4, C-5, C-7, C-12 et B-5 de `pilote/03_PARCOURS_DE_RECETTE.md`, adaptés au règlement à la remise.
- **Mobile** : consultation seulement.
- **Données personnelles** : comptes de recette identifiables, effacés ensuite.
- **Critères d'acceptation** : rapport daté dans `docs/recette/`, captures aux trois formats, dernier article disputé attribué une fois.
- **Dépend de** : CM-01, CM-04.
- **Porte** : second compte réel (propriétaire).

### CM-07 — Commandes reçues dans Ma boutique · priorité P1 · taille M · session S1
- **Pour le vendeur** : la carte de sa boutique montre ses préparations et commandes en attente, ses demandes de contact non lues, et ouvre PRO.GA sur ses commandes.
- **Backend** : étendre la lecture marchande signée (MP06c, `convex/modules/shops/merchantPreparation*.ts`) aux commandes de produits ; cible `orders` dans `CommerceMerchantTarget`. Compteurs exacts seulement, sinon « à consulter ».
- **Web** : `shop-dashboard-card.tsx`, `my-shops-screen.tsx` ; lien `proMerchantTargetHref(…, "orders")` dans `lib/routes.ts`.
- **Mobile** : après le web.
- **Données personnelles** : aucune copie de l'acheteur dans ANTSIA.
- **Tests et cliquets** : garde du titulaire de liaison ; refus sans mandat ; aucun total estimé.
- **Critères d'acceptation** : un nombre affiché correspond à PRO.GA ; sans lecture, aucun chiffre.
- **Dépend de** : CM-04 ; `ANTSIA_COMMERCE_MERCHANT_READ_ENABLED`.
- **Porte** : aucune (activation de la lecture : propriétaire).

### CM-08 — Panier durable · priorité P1 · taille M · session S1
- **Pour l'utilisateur** : le panier survit à la fermeture de l'onglet et suit la personne sur un autre appareil.
- **Backend** : tables `shopCarts` et `shopCartLines` (personne, réseau, boutique, `offerRef`, `variantRef`, quantité, révision attendue), sans prix faisant foi ni adresse ; bornes actuelles (8 boutiques, 10 lignes) ; purge par cron ASCII.
- **Web** : `use-cart-draft.ts` lit le serveur ; migration une fois de l'onglet vers le serveur ; garde de sortie (`signOutEverywhere`).
- **Mobile** : après le web, avec un panier natif (plan 14).
- **Données personnelles** : export et effacement ; durée selon la décision 3.
- **Tests et cliquets** : `network-scoped-functions`, `rate-limited-writes`, `no-unbounded-collect` ; aucun panier réadopté par un autre compte.
- **Critères d'acceptation** : panier retrouvé sur un second navigateur ; changement de compte, aucun panier visible ; prix relu à la préparation.
- **Dépend de** : schéma (S1).
- **Porte** : aucune.

### CM-09 — Favoris d'offres et de boutiques · priorité P1 · taille M · session S1
- **Pour l'utilisateur** : « Enregistrer » sur une fiche ou une carte ; « Mes favoris » dans Moi ; distinct de Suivre une page (étude 02 § 1).
- **Backend** : table `savedOffers` (personne, réseau, boutique, `offerRef`), privée ; lecture qui relit l'offre et masque une offre retirée.
- **Web** : bouton dans `offer-card.tsx` et la fiche ; écran `app/(membre)/mes-favoris/page.tsx` ; entrée dans `moi/me-model.ts` ; route dans `lib/routes.ts`.
- **Mobile** : après le web.
- **Données personnelles** : export et effacement ; jamais utilisé pour un classement public.
- **Tests et cliquets** : quota, réseau, offre retirée.
- **Critères d'acceptation** : un favori retiré par le vendeur disparaît ; le nombre de favoris n'est montré à personne d'autre.
- **Porte** : aucune.

### CM-10 — Boutique en pause · priorité P1 · taille S · session S1
- **Pour le vendeur** : « Fermer temporairement jusqu'au… » : la vitrine reste lisible, les nouvelles préparations et commandes sont refusées, un bandeau le dit.
- **Backend** : champ `pausedUntil` sur `shops` ; garde dans `checkoutFlow.ts` et CM-04 ; projection publique **à part** (schéma strict : ne pas toucher `getStorefront`).
- **Web** : éditeur, étape Publier ; bandeau sur la vitrine membre et publique.
- **Mobile** : bandeau sur `shop-screen.tsx` (S3).
- **Critères d'acceptation** : à l'échéance, la boutique rouvre seule ; engagements existants intacts.
- **Porte** : aucune.

### CM-11 — Alerte de retour en stock et de baisse de prix · priorité P2 · taille M · session S1
- **Pour l'utilisateur** : sur un favori, « Prévenez-moi » quand la variante revient ou que le prix publié baisse.
- **Backend** : à la réception d'une nouvelle révision du reflet, comparer disponibilité et prix ; avis `commerce_saved_offer_updated` sans montant.
- **Dépend de** : CM-01, CM-09, CM-05.
- **Porte** : aucune.

### CM-12 — Vus récemment · priorité P2 · taille S · session S1
- **Pour l'utilisateur** : une rangée « Vus récemment » sur l'accueil de la marketplace.
- **Backend** : aucun ; liste locale bornée par personne et réseau, purgée à la sortie.
- **Critères d'acceptation** : rien n'est envoyé au serveur ; un autre compte ne voit rien.
- **Porte** : aucune.

### CM-13 — Notre sélection · priorité P2 · taille S · session S1
- **Pour le vendeur** : choisir jusqu'à six offres présentées en tête de vitrine sous « Notre sélection » (étude 02 § 1).
- **Backend** : champ de présentation sur `shops` (références seules) ; relecture de chaque offre.
- **Critères d'acceptation** : jamais « Meilleures ventes » ; une offre retirée sort de la sélection.
- **Porte** : aucune.

### CM-14 — Plusieurs offres par publication, carte d'offre dans iCom · priorité P2 · taille M · session S1
- **Pour l'utilisateur** : jusqu'à cinq produits identifiés sur une photo ; envoyer une offre dans une conversation comme une carte.
- **Backend** : `catalogPostReferenceValidator` devient une liste bornée (champ additif) ; référence d'objet dans la messagerie (plan 01).
- **Dépend de** : plans 01 et 02.
- **Porte** : aucune.

### CM-15 — Vidéo du produit · priorité P2 · taille L · session S1 (et PRO.GA)
- **Pour l'utilisateur** : une courte vidéo dans la galerie de la fiche.
- **Backend** : média typé dans le contrat catalogue (version supérieure négociée, ADR-0034 décision 9) ; analyse et délivrance par la garde des fichiers.
- **Porte** : publication de PRO.GA.

### CM-16 — Avis vérifiés · priorité P2 · taille L · session S1
- **Pour l'utilisateur** : une note et un avis possibles seulement après une réception attestée ; réponse du vendeur ; signalement.
- **Backend** : table `commerceReviews` liée à l'achat ; modération ; aucun avis importé ni de démonstration présenté comme réel.
- **Dépend de** : CM-04, CM-06 ; plan 12 (modération).
- **Porte** : décision 7.

### CM-17 — Problème sur un achat et reçu · priorité P2 · taille M · session S1 (et PRO.GA)
- **Pour l'utilisateur** : « Signaler un problème » sur un achat ouvre un dossier daté ; « Voir le reçu » affiche le document émis par PRO.GA.
- **Backend** : dossier lié à l'engagement, sans promesse de remboursement ; lecture signée du document PRO.GA.
- **Dépend de** : DP-14 ; plan 12.
- **Porte** : conseil (conditions de vente).

### CM-18 — Créer une offre simple depuis ANTSIA · priorité P2 · taille L · session S1 (et PRO.GA)
- **Pour le vendeur** : photo, titre, prix, variante, depuis l'éditeur ; l'offre part en brouillon dans PRO.GA, publiée là-bas.
- **Backend** : appelant de `catalog.draft.save` (permission `catalog_drafts`) ; médias par la garde des fichiers.
- **Porte** : PRO.GA (route de brouillon).

### CM-19 — Marketplace lisible sans compte · priorité P2 · taille M · session S1
- **Pour le visiteur** : `/boutiques` liste les vitrines publiques ; recherche dans les offres publiques admises.
- **Backend** : projection publique dédiée (consentement de diffusion relu) ; nouvelle requête à part.
- **Porte** : aucune.

### MP08 — Paiement en ligne (mobile, carte) · priorité P3 · taille L · session S1 (et PRO.GA)
- Reprend MP08b à MP08e : adaptateur réel, sandbox, rapprochement, remboursement, puis répartition P12. Airtel Money et Moov Money sont **une option**, via un agrégateur ou en direct, à qualifier (étude marketplace 06 § 2).
- **Porte** : contrat de prestataire, entité, conseil (DP-10 à DP-14) ; décision 6.

## 6. Ordre recommandé et dépendances

| Vague | Lots | Pourquoi dans cet ordre |
|---|---|---|
| 1 | CM-01, CM-02 | Sans catalogue réel ni liste d'interdits, rien à ouvrir |
| 2 | CM-04, CM-03, CM-05 | La commande à la remise donne enfin un achat réel ; garde d'âge et avis l'accompagnent |
| 3 | CM-06 | Prouver la chaîne avant toute ouverture |
| 4 | CM-07, CM-08, CM-09, CM-10 | Le confort attendu, sur une chaîne prouvée |
| 5 | CM-11 à CM-19 | Différenciants, plusieurs dépendent de PRO.GA ou d'autres plans |
| 6 | MP08 | Porte externe |

Dépendances vers les autres plans :
- **Plan 01** : ICP-3 (réponses rapides, absence), carte d'offre dans iCom, jetons de rôle de la messagerie commerciale.
- **Plan 02** : composeur pour identifier plusieurs offres.
- **Plan 04** : vente en direct.
- **Plan 06** : transports push et e-mail, réglages des avis.
- **Plan 09** : univers alimentation et restauration, plat du jour, services ; ils réutilisent CM-04.
- **Plan 10** : annonces de particuliers (sans PRO.GA).
- **Plan 11** : mise en avant étiquetée.
- **Plan 12** : SU01c (âge), modération des avis et des litiges.
- **Plan 13** : console, charge.
- **Plan 14** : panier, achats et favoris natifs.
- **Plan 16** : iAsted vendeur.

## 7. Décisions à prendre par le propriétaire

1. **Ouvrir la commande réglée à la remise aux produits**, pas seulement à la restauration. Recommandation : oui, retrait et livraison vendeur, Grand Libreville d'abord. Raison : c'est D04, et le seul moyen d'acheter sans prestataire.
2. **Plafond de montant d'une commande à la remise.** Recommandation : en fixer un pour le pilote ; le montant vous revient. Raison : limiter le risque de commandes fantaisistes.
3. **Durée de conservation du panier serveur.** Recommandation : 30 jours après la dernière modification. Raison : assez pour revenir, sans stock de données inutile.
4. **Politique de vitrine (DP-04).** Recommandation : `review`, admission motivée une à une. Raison : pas de vitrine non relue au lancement.
5. **Liste des catégories interdites et réglementées (DP-05)**, avec un conseil. Recommandation : partir de l'étude § 7.3. Raison : condition d'ouverture.
6. **Paiement mobile.** Recommandation : qualifier un agrégateur après le pilote à la remise, sans engagement avant mesure. Raison : DP-10 ; rien ne presse tant que la remise suffit.
7. **Avis vérifiés.** Recommandation : oui, après réception attestée seulement, nom public de l'auteur. Raison : la confiance sans faux avis.
8. **Prolongation d'une réserve (DP-15).** Recommandation : une prolongation par PRO.GA, une seule fois. Raison : éviter les paniers perdus en 3G.
9. **Bac à sable Niveau 1 (ADR-0040, 0041).** Recommandation : l'intégrer à `main` comme exception locale fermée, pour rejouer CM-01. Raison : la seule chaîne réelle déjà éprouvée.
10. **Accepter les ADR 0018, 0019, 0021, 0022, 0023 (DP-03)**, encore « proposés ». Recommandation : après CM-06.

## 8. Risques et points d'attention

- **Contrat avec PRO.GA** : CM-04, CM-15, CM-17 et CM-18 exigent du code PRO.GA publié. Fixtures copiées à l'octet ; aucun import croisé.
- **Projections publiques strictes** : ajouter un champ casse les fronts en ligne ; toujours une projection à part (CM-10, CM-19).
- **Ne jamais dire « payé »** pour une commande à la remise ; la réception attestée ne vaut pas reversement.
- **Réception sans paiement** : la règle actuelle de PRO.GA (indicatif) exige un paiement prouvé ; elle doit changer pour ce seul mode.
- **Données de démonstration** : les offres `demo:offer:*` n'entrent jamais dans un panier ; ne pas les prendre pour un reflet.
- **Disque et `verify`** : une seule vérification à la fois (dossier de reprise § 13.1).
- **DIASPORALE** partage le moteur : tout nouveau genre d'avis ou de surface de modération demande ses libellés (cliquet constaté au MP14).

## 9. Prompts d'implémentation

### Prompt CM-04 — Commande réglée à la remise
> Tu travailles dans ANTSIA (session S1), branche `claude/cm-04-commande-remise` depuis `origin/main`. Lis : `docs/adr/0018`, `0023`, `0034` ; `docs/contrats/PRO-COMMERCE-COMMAND-V1.md` (§ 5 à 9) ; `docs/etudes/2026-10-21-sept-univers-et-vie-publique/ETUDE_SEPT_UNIVERS_ANTSIA.md` § 15 et § 18 (D04) ; `convex/modules/shops/checkoutFlow.ts`, `checkoutActions.ts`, `purchaseFlow.ts` ; `packages/social-domain/src/commerce/command.ts`. Périmètre : nouveau contrat `docs/contrats/PRO-COMMERCE-ORDER-PLACE-V1.md`, domaine pur `packages/social-domain/src/commerce-order-place.ts` et ses fixtures, `convex/modules/shops/orderPlacement*.ts`, tables dans `convex/modules/shops/checkoutTables.ts`, politique réseau et console `console-checkout-policy.tsx`, écran `components/checkout/checkout-screen.tsx`, i18n fr et en. Livre : opération `order.place` idempotente liée à la préparation tenue et au total accepté ; politique réseau fermée par défaut ; bouton final conditionnel ; inventaire d'export et d'effacement. Ne touche ni au manifeste P06 ni à `payment.start`. Vérifie : tests du domaine et du backend (double clic, expiration, total changé), `bun run verify`, recette aux trois formats en clair et sombre. Arrête-toi et demande l'accord avant : toute modification de PRO.GA, tout changement de `convex/schema.ts` non annoncé, toute publication.

### Prompt CM-01 — Chaîne réelle du catalogue
> Tu travailles dans ANTSIA (S1). Lis : `docs/adr/0018`, `0034` ; `docs/etudes/2026-10-21-marketplace-specialites/10_CONTRATS_CATALOGUE_V2.md` ; `docs/contrats/PRO-COMMERCE-PUBLIC-V1.md` ; note vault `10-PROJETS/antsia/su06-catalog-reflection-2026-10-24.md`. Objectif : refléter un vrai catalogue PRO.GA V2 dans l'environnement que le propriétaire désigne. Aucune clé, aucun compte, aucun fichier `.env*` sans son accord écrit. Ordre : émetteur V2, politique et rattachement par la console (`console-catalog-policy.tsx`, `console-catalog-mapping.tsx`), consentement de structure puis attente du reçu `applied`, consentements d'offres, réconciliation, index. Ne confonds pas `delivered`/202 avec `applied`, ni `applied` avec un média sain. Livre un rapport daté dans `docs/recette/` (B-2, B-3, B-4, B-6) avec captures. Arrête-toi avant toute commande vers un déploiement de production.

### Prompt CM-02 — Catégories interdites
> ANTSIA (S1), branche `claude/cm-02-categories-interdites`. Lis l'étude des sept univers § 5.1 et § 7.3, le registre DP-05 (`docs/etudes/2026-10-18-social-commerce/pilote/06_REGISTRE_DES_DECISIONS.md`), `convex/modules/federation/commerceCatalog.ts`, `convex/modules/shops/catalogFacetValidators.ts`, `decisions.ts`. N'écris la liste qu'à partir de celle que le propriétaire aura validée ; sans elle, livre le mécanisme avec une liste vide et un test qui le prouve. Livre : liste versionnée pure, refus au reflet audité, motif côté gérant, vue console. Vérifie : tests, `bun run verify`, recette. Demande l'accord avant toute modification de PRO.GA.

### Prompt CM-08 — Panier durable
> ANTSIA (S1), branche `claude/cm-08-panier-durable`. Lis `docs/adr/0023`, `0034` (décision 5), `apps/antsia_ga/src/lib/cart-draft.ts`, `cart-book.ts`, `components/cart/use-cart-draft.ts`, `convex/modules/people/dataInventory.ts`. Livre : tables `shopCarts` et `shopCartLines` (références et quantités seules, bornes 8 × 10, aucune adresse ni prix faisant foi), fonctions `networkQuery`/`networkMutation` avec `requireMembership`, limite de débit, purge par cron ASCII, migration unique depuis le stockage de l'onglet, export et effacement. Vérifie : cliquets `network-scoped-functions`, `rate-limited-writes`, `no-unbounded-collect`, tests de changement de compte, `bun run verify`, recette sur deux navigateurs. Demande l'accord sur la durée de conservation avant de la coder.

### Prompt CM-09 — Favoris
> ANTSIA (S1), branche `claude/cm-09-favoris`. Lis l'étude marketplace `02_BOUTIQUES.md` § 1, `components/shops/offer-card.tsx`, `app/(membre)/moi/me-model.ts`, `lib/routes.ts`. Livre : table `savedOffers` privée, bouton « Enregistrer » (lucide-react, i18n fr et en), écran « Mes favoris » branché depuis Moi, masquage d'une offre retirée, export et effacement. Aucun compteur public. Vérifie : tests, cliquets, `bun run verify`, recette aux trois formats en clair et sombre.

## 10. Sources lues

- ADR : 0018, 0019, 0021, 0022, 0023, 0034, 0035 (via l'étude), 0037 ; index `docs/adr/` (pas de 0040 ni 0041 dans `main`).
- Rapports et contrats : `docs/21_CONTACT_COMMERCIAL_PRO_GA.md` ; `docs/contrats/PRO-COMMERCE-{COMMAND,PUBLIC,CATALOG-READ,CHECKOUT-CONTROL,LINK,SERVICE-CONTROL,JOBS}-V1.md` (sommaires, § 6 et § 9 du COMMAND).
- Étude 18/10 : `00_VISION_ET_DECISIONS.md`, `06_BOUTIQUES_SERVICES_EMPLOI.md`, `EXECUTION.md` (tableau des lots), `pilote/03_PARCOURS_DE_RECETTE.md`, `pilote/06_REGISTRE_DES_DECISIONS.md`.
- Étude marketplace 21/10 : `02_BOUTIQUES.md`, `06_PAIEMENTS.md`, `16_RAPPORT_LIVRAISON_MP00_MP14.md`, `EXECUTION.md`.
- Étude des sept univers : § 5.1, § 6, § 7, § 8, § 14, § 15, § 18.
- Recettes : `docs/recette/espaces-specialises-2026-10-25`, `parite-production-2026-11-02`, `mobile-business-ios7-2026-10-24`.
- Dossier de reprise du 9/11 : § 2, § 7, § 9, § 10, § 11, § 12, § 13.1.
- Mémoire : `marketplace-ventes-privees`, `fil-sans-cadre-adr-0037`, `etude-sept-univers-antsia`, `maquettes-fideles-au-code`.
- Vault : `plan-marketplace-quatre-specialites-2026-10-21`, `reprise-marketplace-2026-10-25`, `su06-catalog-reflection-2026-10-24`, décisions `2026-10-18-paiement-et-retenue-antsia-p12`, `2026-10-18-contact-commercial-consentement-crm-p10`, `2026-10-21-marketplace-style-de-main`, `2026-10-23-univers-et-ma-boutique`, `2026-10-25-raccord-local-niveau1`.
- Code : `convex/modules/{shops,commercialMessaging,public}`, `federation/commerce*`, `notifications/commerceAccess.ts`, `people/{dataInventory,erasure}.ts` ; `packages/social-domain/src/{commerce/,commerce-*.ts,commerceNotifications.ts,notifications.ts}` ; web `components/{marketplace,shops,cart,checkout,payment,purchases,universes}`, `lib/{cart-*,routes,offer-variant-selection}.ts`, i18n `fr/{marketplace,shops,cart,checkout,purchases,payment}.json` ; console `console-*` du commerce ; mobile `screens/{shop,offer,shop-directory-section}`, `lib/{native-business,routes}.ts`.
- PRO.GA (indicatif, branche locale) : `convex/modules/integrations/commerce*` (liste), `commerceOrderRead.ts` (règle de réception).
