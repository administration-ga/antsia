# Plan 10 — Nouveaux univers et annonces de particuliers

> Constaté par lecture du code d'`origin/main` (ANTSIA `26741caa`, DIASPORALE `bead76d`), le 9 novembre 2026. Rien n'a été exécuté.
> Applications de référence : SeLoger, Leboncoin, Zillow, Airbnb, Jiji, CoinAfrique (immobilier) ; La Centrale, Autotrader (auto) ; Getaround, Turo (location) ; Leboncoin, Facebook Marketplace, Jiji, Vinted (annonces) ; Eventbrite, Dice, Shotgun (sorties). Comparaison faite de mémoire (état des produits à la mi-2026), non revérifiée en ligne.

Lexique minimal. **Univers** : un des sept espaces business d'ANTSIA. **Gabarit** : réglage de présentation d'une page d'activité (blocs, champs, action), qui ne donne aucun droit. **Facette** : attribut typé d'une offre servant aux filtres. **Fichier jumeau** : fichier recopié octet pour octet entre ANTSIA et PRO.GA, vérifié par un manifeste d'empreintes. **Cliquet** : test d'architecture qui interdit une régression. **Porte** : condition hors code qui doit être levée avant d'ouvrir.

## 1. L'intention du propriétaire

- ANTSIA a trois piliers ; ce plan porte quatre morceaux du pilier **business** : immobilier et foncier, auto et mobilité, cérémonies et sorties, et l'annonce de particulier (ADR-0035, D01 ; étude § 4, § 5.2, § 5.6, § 5.7).
- Le besoin est réel et la douleur commune est **la confiance** : frais de visite de 5 000 FCFA, commission de 50 à 100 % d'un loyer, doubles ventes de terrains, cautions en espèces, faux évènements (étude § 2.2, § 2.5).
- Un business est **une page** qui active des espaces métier ; Biens, Location et Billetterie sont à créer ; la location de ressources (créneau + caution) est un **module partagé** voitures, matériel, salles, meublés (D02 ; étude § 7.4).
- Le particulier **n'a pas besoin de page** : il publie une annonce, sans stock, commande ni encaissement, avec quotas, catégories encadrées, contact filtré, retrait à échéance et « Passer pro » (D03 ; étude § 7.3).
- **Aucun paiement en ligne** : immobilier et auto ouvrent en vague 2 avec visite, contact, réservation sans encaissement ; billetterie et réservations payées attendent un prestataire de paiement (D04).
- Une offre et un **besoin** symétriques : « Je cherche… », privé par défaut, publié seulement par geste explicite, qui crée une **alerte** (étude § 8).
- La confiance vient de l'**État** : Agent autorisé, Document contrôlé, Carte grise contrôlée, labels calculés et gratuits, par conventions (étude § 10 ; **D09 encore proposée**).
- **Aucun alias vide** : une route ou une tuile n'existe qu'à l'ouverture effective, avec de vraies offres (ADR-0034 ; D04).
- **Portes** : SU01a, SU01b, la déclaration d'âge de SU01c, SU01d et SU01h précèdent toute ouverture d'un nouvel univers et de SU07 (`SU01_CONFORMITE_ORDONNANCE_0011.md` § 4).
- Refusé : tontines et cagnottes sans établissement agréé ; VTC ou flotte maison (partenaires) ; badge payant ; classement payé caché (étude § 3, § 10, § 14).

## 2. Ce qui existe

Presque rien n'existe pour ces univers. Le tableau distingue la **base réutilisable** (présente) de la **capacité attendue** (absente).

| Capacité | État | Web | Mobile | Preuve |
|---|---|---|---|---|
| Offre typée produit ou service, facettes fermées (taxonomie v1) | Présent (base) | oui | lecture d'offre | `packages/social-domain/src/commerce/catalogFacets.ts` ; `convex/modules/shops/catalogValidators.ts` (`catalogKindValidator` = `product` \| `service`) |
| Type d'offre « bien immobilier » | Absent | — | — | registre `COMMERCE_CATALOG_CATEGORIES` sans branche ; motifs cherchés : `realEstate`, `real_estate`, `immobilier`, `propert`, `logement` |
| Type d'offre « véhicule » | Absent | — | — | motifs : `vehicle`, `vehicule`, `véhicule`, `mileage`, `kilom` (aucun résultat dans `convex`, `packages/social-domain/src`, `apps/antsia_ga/src`) |
| Gabarits agence, loueur, organisateur | Absent | — | — | `packages/social-domain/src/activityConfiguration.ts` : `ACTIVITY_TEMPLATES` = general, fashion, food, artisan, local, expert, media |
| Routes `/immobilier`, `/auto`, `/sorties`, `/annonces` | Absent (voulu) | — | — | `apps/antsia_ga/src/lib/routes.ts` ; dossier `apps/antsia_ga/src/app/(membre)/` |
| Tuile d'univers montrée seulement avec des données réelles | Présent (patron) | oui | — | `apps/antsia_ga/src/components/discovery/discover-screen.tsx` (`DiscoverPillars`, patron de `food`) |
| Recherche plein texte, filtres prix et catégorie, tri | Présent (produits, services) | oui | — | `convex/modules/shops/catalogTables.ts` (`search_marketplace`) ; `marketplaceFilterArgs` dans `catalogValidators.ts` |
| Filtres métier : surface, pièces, meublé, marque, modèle, année, kilométrage | Absent | — | — | attributs fermés : brand, material, color, audience, serviceMode, durationMinutes, ecoLabel |
| Lieu : province, ville, quartier | Partiel | oui | — | provinces dans `packages/social-domain/src/provinces.ts` (fil) ; zone de service en texte libre (`serviceZone`) ; aucun référentiel de quartiers |
| Carte et recherche sur carte | Absent | — | — | motifs : `map`, `mapbox`, `leaflet`, `geoloc`, `latitude` (aucun résultat) |
| Favoris d'offres | Partiel | oui | — | `convex/modules/marks/marks.ts` : signets de **publications** seulement ; une offre n'est enregistrable que via sa publication |
| Alertes de recherche | Absent | — | — | motifs : `savedSearch`, `searchAlert`, `alerte de recherche`, `wanted` |
| Besoin publié (« avis de recherche ») | Absent | — | — | idem ; le module `needs` existe dans PRO.GA (B2B), pas dans ANTSIA |
| Demande de visite avec créneaux | Fermé (base) | — | — | créneaux et réservation de services via PRO.GA (`convex/modules/shops/serviceActions.ts` : `slots`, `book`) fermés par `convex/modules/shops/serviceAccess.ts` (`services: ready: false`, `commerceActivation.ts`) ; aucune nature « visite » |
| Dossier du candidat locataire | Absent | — | — | motifs : `tenant`, `locataire`, `rentalApplication` |
| Documents du bien, estimation | Absent | — | — | — |
| Badge Vérifié de la personne (IDN ≥ 2) | Présent | oui | oui | `packages/social-domain/src/badges.ts` (`computePersonBadges`) |
| Label « annonce vérifiée » | Absent | — | — | aucun label d'offre dans `badges.ts` |
| Calendrier d'une ressource, caution, état des lieux | Absent | — | — | motifs : `rental`, `deposit`, `caution`, `availability` (seule la disponibilité indicative de stock existe) |
| Annonce de particulier (dépôt, photos) | Absent | — | — | motifs : `classified`, `annonce`, `listing` ; « annonce » ne désigne que l'annonce d'un évènement ou d'un direct (`convex/modules/posts/tables.ts`) |
| Quotas par univers, expiration, renouvellement | Absent | — | — | — |
| Limites des comptes légers (non vérifiés) | Présent | oui | oui | `convex/lib/rateLimit.ts` : seaux « renforcés » pour les membres `declaree` sans badge fort |
| Catégories interdites | Absent | — | — | aucune liste dans le catalogue ni la modération |
| « Passer pro » | Absent | — | — | création de page et « Mon activité » existent (`routes.ts` : `myActivity`) |
| Messagerie sans numéro exposé | Partiel | oui | oui | `convex/modules/commercialMessaging/threads.ts` (demande filtrée vers une **boutique**) ; `convex/modules/contextualMessaging/registry.ts` (registre fermé, aucune nature « annonce ») |
| Signalement d'une offre | Présent | oui | — | `convex/modules/moderation/tables.ts` (`commerceOffer`, `commerceStorefront`) |
| Motif « arnaque ou fraude » | Absent | — | — | `packages/social-domain/src/moderation.ts` (`CONTENT_REPORT_REASONS` : 12 motifs, aucun) ; motifs : `scam`, `fraud`, `arnaque`, `escroquerie` |
| Avis liés à un engagement réel | Partiel | oui | — | `serviceReviews` (services seulement, cible signalable dans `moderation/tables.ts`) |
| Agenda des sorties par catégorie | Partiel | oui | — | `convex/modules/events/events.ts` (`myAgenda` : agenda **personnel**) ; aucune catégorie publique |
| Réservation de place avec jauge et liste d'attente | Fermé | — | — | `convex/modules/events/pageEvents.ts` (`register`, capacité DG-023) : `assertDiasporaNetwork` |
| Billet QR et contrôle d'entrée | Fermé | — | — | `convex/modules/events/pageEventAttendance.ts` (`issueTicket`, `previewTicket`, `checkIn`) : `assertDiasporaNetwork` |
| Billet payant | Fermé | — | — | `convex/modules/shops/commerceActivation.ts` (`payments: ready: false`) |
| Location de salles et de matériel | Absent | — | — | — |
| Attestations d'État (foncier, carte grise, agent immobilier) | Absent | — | — | patron réutilisable : attestation d'agent public (`convex/modules/federation/reseauPublicAgents.ts`, table `federationAgentGrants`) |
| Écrans mobiles des univers et des annonces | Absent | — | non | `apps/antsia_mobile/src/screens/` : shop, offer, shop-directory seulement |

Décompte : 5 Présent · 6 Partiel · 4 Fermé · 21 Absent (36 capacités).

### Ce qui est écrit mais jamais recetté en réel

- Rien de ce périmètre n'est en ligne : SU03, SU04, SU05, SU07, SU14, SU15 sont « À faire » (`EXECUTION.md` de l'étude ; dossier de reprise § 10.1, 9/11/2026).
- Les briques réutilisées ont leurs propres limites : services et réservations fermés (`services: ready: false`) ; billet QR et accueil écrits pour DIASPORALE (DG-023), en ligne seulement sur la démonstration de DIASPORALE (reprise § 10.2 : « billet QR » fait partie des six boutons à trancher) ; catalogue PRO.GA V2 jamais reflété en réel (reprise § 10.1, SU06 « index prêt mais vide »).
- Le patron de tuile conditionnelle (SU02) est en ligne depuis le 23/10 (PR 77) et recetté sur la démonstration, pas avec de vrais vendeurs.

## 3. Comparaison avec les applications de référence

« oui » = fonction connue de mémoire ; « ? » = non affirmé.

| Capacité | Immobilier (SeLoger, Leboncoin, Zillow, Airbnb) | Auto (La Centrale, Autotrader) | Location (Getaround, Turo) | Annonces (Leboncoin, FB Marketplace, Jiji, Vinted) | Sorties (Eventbrite, Dice, Shotgun) | ANTSIA | Verdict |
|---|---|---|---|---|---|---|---|
| Recherche par lieu et carte | oui (tous) | oui (rayon) | oui (carte) | oui (Leboncoin, Marketplace) | oui (ville) | Partiel, sans carte | À adapter : quartier d'abord, carte ensuite (3G) |
| Filtres métier | oui (prix, surface, pièces, type, meublé) | oui (marque, modèle, année, km, énergie) | oui (dates, type) | oui (catégorie, état) | oui (date, genre) | Absent | À faire |
| Alertes de recherche | oui | oui | ? | oui (Leboncoin) | oui (suivre un lieu, un artiste) | Absent | À faire |
| Favoris | oui | oui | oui | oui | oui | Partiel | À faire |
| Demande de visite, créneaux | oui (Zillow) | essai à convenir | — | — | — | Fermé | À adapter : créneaux proposés par l'annonceur, aucun frais |
| Dossier du candidat | oui (Zillow, candidature) | — | vérification du conducteur | — | — | Absent | À adapter, P2, consenti |
| Estimation, cote | oui (Zillow, SeLoger) | oui (cote, valorisation) | — | — | — | Absent | Écarté : aucune donnée de prix fiable au Gabon |
| Historique, contrôle du véhicule | — | oui (Autotrader, contrôle d'historique) | — | — | — | Absent | À adapter par SU15 (carte grise), jamais déclaré comme vérifié |
| Calendrier, caution, état des lieux photo | Airbnb (calendrier) | — | oui (photos au départ et au retour) | — | — | Absent | À faire, sans encaissement ni caution détenue |
| Dépôt en quelques étapes, photos | oui | oui | oui | oui | oui | Absent | À faire |
| Expiration, renouvellement | ? | ? | — | oui (Leboncoin) | — | Absent | À faire |
| Quotas, compte pro distinct | Leboncoin pro | pro distinct | — | oui (Leboncoin pro, Jiji forfaits) | organisateur | Absent | À faire ; quota gratuit, jamais de badge payant (Jiji : contre-exemple) |
| Messagerie sans numéro exposé | oui | oui | oui | oui | — | Partiel | À adapter : nature contextuelle « annonce » |
| Paiement protégé | Airbnb | ? | oui | oui (Leboncoin, Vinted) | oui | Fermé (D04) | Écarté jusqu'au contrat de paiement |
| Signalement d'arnaque | oui | oui | oui | oui | oui | Partiel (signalement oui, motif non) | À faire, prioritaire |
| Avis après engagement | Airbnb | ? | oui | Vinted | — | Partiel (services) | À faire après visite, location, billet |
| Billets à code, contrôle d'entrée | — | — | — | — | oui (tous) | Fermé (DIASPORALE) | À adapter : gratuit d'abord |
| Liste d'attente, revente encadrée | — | — | — | — | oui (Dice) | Partiel (attente DIASPORALE) | Revente écartée (pas de paiement) |
| Identité vérifiée par l'État | — | — | vérification du permis | badge payant (Jiji) | — | Vérifié IDN | Différenciant : labels d'État gratuits (SU15) |

## 4. Ce qui manque

### 4.1 Bloquant avant l'ouverture au public

Aucun lot de ce plan ne bloque l'ouverture d'ANTSIA lui-même : ces univers ouvrent **après**. Ce qui bloque l'ouverture de **chaque univers** :
1. Les portes de conformité SU01a, SU01b, déclaration d'âge de SU01c, SU01d, SU01h (plan 12). SU01b et SU01c attendent le juriste.
2. Le motif de signalement « arnaque ou fraude » et sa file prioritaire, l'avertissement anti-acompte et les limites des comptes non vérifiés (NU-01).
3. Des vendeurs pilotes réels dans la zone pilote ; sans eux, aucune route ni tuile (NU-07 ; D11 proposée).
4. Les catégories interdites et les catégories encadrées (terrain : Vérifié exigé) (SU07a).

### 4.2 Attendu par les utilisateurs

Types d'offre bien et véhicule ; espaces Biens et Auto avec filtres métier ; recherche par quartier ; dépôt d'annonce simple avec photos, expiration et renouvellement ; favoris ; alertes ; demande de visite ou de réservation avec créneaux ; messagerie sans numéro ; avis après engagement ; agenda des sorties et réservation de place.

### 4.3 Différenciant pour ANTSIA

- **Labels d'État gratuits** (Agent autorisé, Document contrôlé, Carte grise contrôlée), calculés et retirables, que les références étrangères ne peuvent pas offrir (étude § 10).
- **Zéro frais avant visite** affiché comme règle de l'univers et outillé (avertissement, motif dédié, aucune demande d'acompte dans la messagerie).
- **Faible débit** : listes sans carte par défaut, photos réduites, filtres côté serveur, quartier plutôt que géolocalisation.
- **Le besoin du particulier** et son alerte, privés par défaut, puis lus par iAsted (plan 16).
- **Passer pro** comme porte de formalisation vers PRO.GA (62,9 % d'entreprises informelles, étude § 2.5).

### 4.4 Écarté ou reporté, et pourquoi

| Sujet | Décision | Raison |
|---|---|---|
| Estimation automatique d'un bien ou cote d'un véhicule | Écarté | aucune donnée de prix publiée et fiable ; ce serait un chiffre inventé |
| Caution ou acompte détenus par ANTSIA | Écarté | aucun fonds porté par ANTSIA (D04, étude § 2.4) |
| Billetterie payante, revente de billets, vente en direct payée | Reporté (SU14b) | porte paiement (MP08) |
| Carte interactive | Reporté (NU-02 la prépare) | coût des données ; référentiel de quartiers d'abord |
| VTC, livraison, flotte | Écarté | partenaires (étude § 3, § 5) |
| Cagnottes de cérémonie | Écarté | agrément d'un établissement (étude § 3) |
| Mise en avant payante des annonces | Reporté | D10 proposée ; jamais pour le particulier |

## 5. Lots d'implémentation

Les noms de tables et de fonctions sont des **propositions** ; chaque lot les arrête dans son premier commit, comme MP00 l'a fait pour la marketplace. Tous les lots respectent : `networkId` et `requireMembership` en tête, refus indistinct, débit (`convex/lib/rateLimit.ts`), garde des fichiers (`servableUrl`, `guardUploadUrl`, `assertFreshUpload`), i18n fr et en, aucune couleur ni URL en dur, export et effacement (`convex/modules/people/dataInventory.ts`, couverture vérifiée par `convex/modules/people/erasure.test.ts`), `bun run verify` vert, recette à 390, 834 et 1440 px en clair et en sombre.

### NU-01 — Socle anti-arnaque des univers · priorité P1 · taille M · session S1
- **Pour l'utilisateur** : un motif « Arnaque ou fraude » (frais demandés avant visite, faux bien, faux véhicule, acompte demandé) sur toute offre, annonce, message contextuel ou commercial ; un bandeau « Ne versez rien avant d'avoir vu le bien ou le véhicule » sur les fiches et à l'ouverture d'une conversation d'annonce.
- **Backend** : ajouter `scam` à `CONTENT_REPORT_REASONS` (`packages/social-domain/src/moderation.ts`) en coordination avec le plan 12 (délai cible et priorité de file) ; seaux de débit dédiés `listing.publish` et `listing.publish.reinforced` (comptes légers), `listing.contact`, `listing.contact.reinforced` ; règle pure `listingTrustRequirements(category, badges)` dans `packages/social-domain/src/` (terrain et vente immobilière : Vérifié exigé ; location et véhicule : contact limité pour un compte léger).
- **Web** : motif traduit dans le sélecteur existant (`apps/antsia_ga/src/components/motif-picker.tsx`) ; composant d'avertissement partagé.
- **Mobile** : après le web (plan 14).
- **Données personnelles** : aucune nouvelle donnée.
- **Tests et cliquets** : `rate-limited-writes`, `i18n-locales` ; tests de la règle pure.
- **Critères d'acceptation** : un compte léger dépasse plus vite son seau ; un terrain ne se publie pas sans Vérifié ; le motif apparaît en fr et en ; la console le range dans sa file (plan 12).
- **Dépend de** : plan 12 (files et délais). **Porte** : aucune.

### SU03 — Types d'offre bien immobilier et véhicule (catalogue V2) · P1 · L · S1 (+ session PRO.GA)
- **Pour l'utilisateur** : une agence ou un loueur publie depuis PRO.GA un bien ou un véhicule avec ses vrais attributs.
- **Backend** : nouvelle **taxonomie version 2** additive (la v1 reste lue telle quelle) dans le fichier jumeau `packages/social-domain/src/commerce/catalogFacets.ts` et son manifeste `fixtures/MANIFEST.json` : branches `real_estate` (rent, sale, land, commercial) et `vehicle` (sale, rental, parts) ; attributs typés fermés : `propertyType`, `rooms`, `bedrooms`, `surfaceM2`, `furnished`, `depositMonths`, `advanceMonths` ; `vehicleMake`, `vehicleModel`, `vehicleYear`, `mileageKm`, `fuel`, `transmission`, `withDriver`. Prix : `unit` existant (par mois, par jour) ; aucune caution encaissée. Index de la marketplace étendu (`marketplaceIndexFields.ts`, `catalogFacetValidators.ts`, `catalogValidators.ts`).
- **Web** : aucune page publique ; libellés des facettes en i18n ; la marketplace ignore les nouvelles branches tant que l'univers n'est pas ouvert.
- **Mobile** : aucun.
- **Données personnelles** : aucune (offres de structures).
- **Tests et cliquets** : fixtures v2 dans les deux dépôts, cas v1 conservés ; projection publique stricte : publier une **projection à part** plutôt qu'ajouter un champ (piège « projections publiques en schéma strict »).
- **Critères d'acceptation** : une offre v2 bien et véhicule passe le lecteur des deux dépôts ; une offre v1 reste conforme à l'octet ; aucune route nouvelle.
- **Dépend de** : MP03 (fait en source), session PRO.GA pour le jumeau et l'éditeur de brouillon. **Porte** : décision 7.2 (qui modifie PRO.GA) ; publication.

### SU07a — Annonces de particuliers · P1 · L · S1
- **Pour l'utilisateur** : « Créer → Annonce » ; quatre étapes (univers et catégorie, photos, prix et lieu, détails) ; brouillon ; publication ; « Renouveler » avant échéance ; « Retirer » ; « Mes annonces » dans Profil.
- **Backend** : module `convex/modules/classifieds/` ; table `classifiedListings` (networkId, authorPersonId, universe, categoryPath, attributes (facettes v2), title, description, price {mode fixed|range|quote, XAF}, location {province, city, district}, mediaIds, status draft|published|expired|withdrawn|removed, visibility network|root, publishedAt, expiresAt, renewals) ; index `by_network_universe_status_publishedAt`, `by_author_status`, `by_status_expiresAt` ; recherche plein texte ; **quota** calculé par lecture bornée des annonces actives de l'auteur par univers ; **catégories interdites** (médicaments, armes, espèces protégées, documents officiels…) refusées par règle pure ; offre d'emploi refusée (page employeur exigée, D03) ; cron d'expiration par tranches (identifiant ASCII) ; contexte de modération `classifiedListing` ; nouvelle nature contextuelle `classifiedListing` dans `packages/social-domain/src/contextualMessaging.ts` et `convex/modules/contextualMessaging/registry.ts` (procédure fermée § 10.5 du contrat) : conversation sans numéro, bloquable, signalable.
- **Web** : composeur d'annonce (React Hook Form + Zod), « Mes annonces », fiche d'annonce interne ; aucune route publique d'univers ici (NU-07) ; états vide, chargement, erreur.
- **Mobile** : NU-08.
- **Données personnelles** : export (annonces, médias, conversations) et effacement (annonces, blobs, références) ; conservation d'une annonce expirée bornée (proposition : 30 jours puis effacement, à valider en 7.4).
- **Tests et cliquets** : `network-scoped-functions` (ajouter le module), `rate-limited-writes`, `no-unbounded-collect`, `file-delivery-gate`, `upload-policy`, `fresh-upload`, `crons-contract`, `contextual-registry`, `contextual-hooks`, `notification-payload-content` (le rappel d'expiration ne porte ni titre ni prix).
- **Critères d'acceptation** : quota dépassé = refus traduit ; terrain refusé sans Vérifié ; catégorie interdite refusée ; expiration automatique ; contact sans numéro ; effacement complet prouvé par test.
- **Dépend de** : NU-01, SU03 (facettes v2), plan 01 (messagerie contextuelle), plan 12 (SU01). **Porte** : ouverture publique après SU01a/b/c/d/h ; décisions 7.3 et 7.4.

### SU07b — « Passer pro » · P2 · M · S1
- **Pour l'utilisateur** : au-delà d'un seuil d'annonces, un encart propose de créer une page ; les annonces actives y sont rattachées sans perte de contacts.
- **Backend** : mutation de transfert idempotente (auteur → page dont la personne est signataire) ; l'annonce garde son identifiant ; aucune création de structure PRO.GA d'office (invariant « aucun profil ni adhésion créé d'office »).
- **Web** : encart dans « Mes annonces », renvoi vers « Mon activité ».
- **Mobile** : après le web.
- **Données personnelles** : journal du transfert dans l'export.
- **Tests et cliquets** : transfert refusé si la personne n'est pas signataire ; conversations ouvertes conservées.
- **Critères d'acceptation** : une annonce transférée reste lisible au même lien ; l'auteur affiché devient la page.
- **Dépend de** : SU07a, plan 07 (pages). **Porte** : seuil fixé par le propriétaire (7.3).

### NU-02 — Référentiel de lieux et recherche commune des univers · P1 · M · S1
- **Pour l'utilisateur** : choisir commune puis quartier (Libreville, Akanda, Owendo, Ntoum d'abord) ; filtrer par prix et facettes de l'univers.
- **Backend** : `packages/social-domain/src/localities.ts` (provinces existantes + communes et quartiers du pilote, **liste fournie ou validée par le propriétaire**, aucune liste inventée) ; requête commune qui lit offres de pages (catalogue) et annonces, filtres par facettes v2 **dans l'index** autant que possible (le parcours par fenêtres `filteredWindow` existe déjà pour la marketplace : en mesurer le coût).
- **Web** : barre de filtres réutilisant `apps/antsia_ga/src/components/marketplace/marketplace-filters.tsx` ; quartier en liste ; pas de carte.
- **Mobile** : après le web.
- **Données personnelles** : aucune (lieu approximatif seulement, jamais d'adresse).
- **Tests et cliquets** : `no-unbounded-collect` ; test de pagination stable sous filtres.
- **Critères d'acceptation** : résultats paginés corrects sur 3 filtres combinés ; aucune adresse précise exposée.
- **Dépend de** : SU03, SU07a. **Porte** : liste des quartiers (propriétaire).

### SU04 — Immobilier et foncier : espace Biens, visites, gabarit agence · P1 · L · S1
- **Pour l'utilisateur** : `/immobilier` (louer, acheter, terrains) ; fiche d'un bien (photos, loyer, caution et avance affichées, quartier, badges) ; « Demander une visite » parmi les créneaux proposés par l'annonceur ; suivi dans « Mes demandes » ; agence = page au gabarit `real_estate` avec son espace Biens.
- **Backend** : gabarit `real_estate` dans `ACTIVITY_TEMPLATES` et capacité `properties` dans `ACTIVITY_CAPABILITIES` (contrat MP02 fermé : version et lecteur à étendre) ; table `visitRequests` (networkId, targetRef annonce ou offre, requesterPersonId, slotStartAt, status requested|accepted|declined|cancelled|done, messageThreadRef) ; table `visitSlots` (créneaux publiés par l'annonceur, bornés) ; aucune somme demandée ni acceptée ; notifications sans contenu par `convex/modules/notifications/notify.ts`. Pour une agence liée à PRO.GA, la visite suit à terme le contrat de services quand `services` sera activé (plan 09) ; d'ici là, même table locale.
- **Web** : route `immobilier` dans `routes.ts`, espace spécialisé (`specialized-navigation-state.ts`, nouveau `SpecializedKind`), tuile dans `DiscoverPillars` conditionnée à des offres réelles ; fiche ; panneau de créneaux ; écrans pleine largeur (`member-screens-full-width`).
- **Mobile** : NU-08.
- **Données personnelles** : demandes de visite exportées et effacées des deux côtés (projection anonyme pour l'annonceur après effacement du demandeur) ; conservation proposée : 90 jours après la visite.
- **Tests et cliquets** : `network-scoped-functions`, `rate-limited-writes`, `notification-payload-content`, `member-screens-full-width`, `no-hardcoded-urls`.
- **Critères d'acceptation** : un créneau ne se réserve qu'une fois ; une demande annulée libère le créneau ; aucune tuile tant qu'aucun bien réel n'est publié ; refus indistinct hors réseau.
- **Dépend de** : SU03, SU07a, NU-02, NU-01. **Porte** : ouverture après SU01 et NU-07.

### SU05 — Location de ressources et Auto et mobilité · P2 · L · S1
- **Pour l'utilisateur** : `/auto` (vendre, louer avec ou sans chauffeur, pièces) ; fiche véhicule ; calendrier de disponibilité ; « Demander une réservation » pour des dates, réglée à la remise ; caution **affichée**, jamais détenue ; état des lieux en photos au départ et au retour, partagé entre les deux parties.
- **Backend** : module partagé `resourceRentals` (ressource = véhicule, matériel, salle, meublé) : `resourceCalendars` (plages indisponibles, bornées), `resourceBookingRequests` (dates, statut, aucun montant encaissé), `rentalConditionReports` (photos horodatées via la garde des fichiers, signature par les deux parties) ; gabarit `vehicle_rental`.
- **Web** : route `auto`, espace spécialisé, calendrier accessible au clavier ; état des lieux guidé.
- **Mobile** : prioritaire pour l'état des lieux (photo), plan 14.
- **Données personnelles** : réservations et photos exportées et effacées ; conservation proposée : durée de la location + 90 jours.
- **Tests et cliquets** : chevauchement de dates refusé ; garde des fichiers ; `crons-contract` (expiration des demandes).
- **Critères d'acceptation** : deux demandes acceptées ne se chevauchent pas ; la caution n'apparaît jamais comme « payée » ; photos inaccessibles hors des deux parties.
- **Dépend de** : SU03, SU07a, NU-02 ; plan 09 pour les loueurs liés à PRO.GA. **Porte** : SU01 ; décision 7.5.

### NU-03 — Favoris d'offres et d'annonces · P1 · S · S1
- **Pour l'utilisateur** : un cœur sur chaque fiche ; « Enregistrés » dans Profil, par univers ; mention « retiré » si l'offre disparaît.
- **Backend** : table `offerFavorites` (networkId, personId, target {classifiedListing | commerceOffer}, createdAt) ; lecture paginée ; jamais visible de l'annonceur (même règle que `marks`).
- **Web** : bouton et liste ; **Mobile** : après le web.
- **Données personnelles** : export et effacement.
- **Tests et cliquets** : `network-scoped-functions`, `rate-limited-writes`.
- **Critères d'acceptation** : un favori d'une offre retirée ne révèle rien de son contenu.
- **Dépend de** : SU07a. **Porte** : aucune.

### NU-04 — Alertes de recherche · P1 · M · S1
- **Pour l'utilisateur** : « Créer une alerte » depuis une recherche filtrée ; une cloche quand une nouvelle offre correspond ; gestion et suppression dans Paramètres.
- **Backend** : table `savedSearches` (networkId, personId, universe, critères normalisés, frequency instant|daily, lastNotifiedAt, active) ; plafond par personne ; rapprochement à la publication (programmé, par tranches) plus passage quotidien ; notification **sans titre ni prix** (cliquet) menant à la recherche ; consentement « alertes » horodaté et révocable.
- **Web** : bouton dans la barre de filtres ; liste des alertes ; **Mobile** : push après le plan 14.
- **Données personnelles** : critères = donnée personnelle (export, effacement) ; aucune utilisation pour la publicité.
- **Tests et cliquets** : `notification-payload-content`, `crons-contract`, `no-unbounded-collect`.
- **Critères d'acceptation** : une offre conforme publiée déclenche une seule notification ; une alerte désactivée n'en déclenche aucune.
- **Dépend de** : NU-02 ; plan 06 (préférences de notification). **Porte** : aucune.

### NU-05 — Besoin publié (« Je cherche… ») · P2 · M · S1
- **Pour l'utilisateur** : décrire un besoin (univers, critères, budget, quartier, échéance), privé par défaut ; le publier en « avis de recherche » par un geste explicite, sans coordonnées ; les annonceurs répondent par la messagerie contextuelle.
- **Backend** : table `searchNeeds` (privé = alerte enrichie ; publié = visibilité network, expiration) ; nature contextuelle `searchNeed` ; quota et débit ; modération.
- **Web** : composeur, liste des besoins publiés dans l'univers ; **Mobile** : après le web.
- **Données personnelles** : export, effacement ; jamais d'inférence (étude § 11.2).
- **Tests et cliquets** : visibilité `network` par défaut ; `contextual-registry`.
- **Critères d'acceptation** : un besoin privé n'est lisible que par son auteur ; un besoin publié n'expose aucun contact.
- **Dépend de** : NU-04 ; plan 16 (iAsted lira ces besoins plus tard). **Porte** : SU01.

### NU-06 — Dossier du candidat locataire · P2 · M · S1
- **Pour l'utilisateur** : préparer une fois sa situation (emploi déclaré, revenus en tranche, garant oui/non) et la partager avec une agence pour une demande de visite précise, puis la retirer.
- **Backend** : table `tenantDossiers` sans pièce d'identité ni NIP (loi 025/2023, art. 81) ; partage par demande, révocable, expirant.
- **Web** : écran dans « Mes demandes ». **Mobile** : après le web.
- **Données personnelles** : finalité unique, consentement par partage, effacement ; dossier APDPVP (propriétaire).
- **Tests et cliquets** : une agence ne lit que les dossiers partagés vers elle, refus indistinct sinon.
- **Critères d'acceptation** : retrait du partage = lecture impossible immédiate.
- **Dépend de** : SU04. **Porte** : dossier APDPVP (propriétaire).

### SU14a — Cérémonies et sorties sans paiement · P2 · L · S1
- **Pour l'utilisateur** : `/sorties` : agenda des sorties par catégorie et par date ; page d'organisateur au gabarit `events_organizer` ; prestataires (salle, tentes, sono, traiteur) via les services et la location de ressources ; réservation **gratuite** de place avec jauge, liste d'attente et billet QR ; contrôle d'entrée par l'organisateur.
- **Backend** : ouvrir à ANTSIA les évènements de page (aujourd'hui `assertDiasporaNetwork` dans `convex/modules/events/pageEvents.ts` et `pageEventAttendance.ts`) — **ce déverrouillage relève du plan 07** ; ce lot ajoute la catégorie de sortie, l'agenda public par catégorie et le rattachement des prestataires.
- **Web** : route `sorties`, agenda, fiche ; scanner de billets (caméra) ; **Mobile** : billet hors ligne (plan 14).
- **Données personnelles** : billets (empreinte seule déjà conservée), présences, export et effacement existants à étendre au réseau ANTSIA.
- **Tests et cliquets** : jauge respectée sous concurrence (FIFO existant) ; `notification-payload-content`.
- **Critères d'acceptation** : une place se réserve et s'annule ; le billet QR passe une fois ; aucun prix affiché comme payable.
- **Dépend de** : plan 07 (évènements de page dans ANTSIA), SU05 (salles et matériel), plan 09 (prestataires). **Porte** : SU01 ; décision des six boutons de DIASPORALE pour le billet QR (reprise § 10.2).

### SU14b — Billetterie payante et vente en direct · P3 · L · S1
- **Pour l'utilisateur** : billets payants par catégorie de place, remboursement tracé, vente en direct.
- **Backend** : offres « billet » à jauge (PRO.GA), encaissement par le prestataire contracté (MP08), commission payée par l'organisateur (étude § 14).
- **Web** et **Mobile** : à préciser à l'ouverture.
- **Données personnelles** : selon le prestataire.
- **Tests et cliquets** : ceux du paiement (plan 08).
- **Critères d'acceptation** : à fixer avec le contrat.
- **Dépend de** : SU14a, plan 08 (MP08), plan 04 (directs). **Porte** : contrat de paiement.

### SU15 — Attestations d'État et labels calculés · P3 · M · S1
- **Pour l'utilisateur** : « Agent autorisé » sur une page d'agence ; « Document contrôlé » sur un bien ; « Carte grise contrôlée » sur un véhicule ; chaque label dit qui l'a délivré et qu'il reste un signal, pas une garantie.
- **Backend** : contrat signé et idempotent par autorité (modèle `RESEAU-PUBLIC-V1` / attestation d'agent public, `convex/modules/federation/reseauPublicAgents.ts`) ; table `stateAttestations` (networkId, subject page|listing|offer, kind, issuerId, reference opaque, issuedAt, expiresAt, revokedAt) ; label **calculé à chaque projection**, disparu au retrait ; jamais payant.
- **Web** : pastilles dans les fiches ; page « Comment lire les labels ». **Mobile** : après le web.
- **Données personnelles** : aucune donnée de titre foncier copiée, seulement une référence opaque.
- **Tests et cliquets** : `no-cross-product-imports` ; signature refusée = aucun label ; révocation propagée.
- **Critères d'acceptation** : retrait de l'attestation = label absent à l'affichage suivant.
- **Dépend de** : SU04, SU05 ; plan 11 (fédération de la vie publique). **Porte** : D09 et conventions (propriétaire seul).

### NU-07 — Pilote et ouverture d'un univers · P1 · S · S1
- **Pour l'utilisateur** : l'univers apparaît dans Découvrir le jour où de vraies offres existent.
- **Backend** : drapeau d'ouverture par univers et par réseau dans la console (journalisé, `operator-audit`) ; critères d'arrêt écrits (D01) ; indicateurs de l'étude § 16 sans cible chiffrée.
- **Web** : route et tuile créées dans le même commit que l'ouverture ; texte « Univers pilote — Grand Libreville ».
- **Mobile** : en même temps que le web si NU-08 est fait.
- **Données personnelles** : aucune.
- **Tests et cliquets** : `discover-screen.test.tsx` : aucune tuile sans offre ; `no-hardcoded-urls`.
- **Critères d'acceptation** : liste écrite des vendeurs pilotes consentants ; SU01a/b/c/d/h faits ; accord écrit du propriétaire pour la publication.
- **Dépend de** : SU04 ou SU05 ou SU07a, plan 12, plan 13. **Porte** : D11, vendeurs pilotes, publication.

### NU-08 — Annonces et univers sur le mobile · P2 · L · S3
- **Pour l'utilisateur** : déposer une annonce depuis la galerie, recevoir une alerte en push, montrer son billet hors ligne, faire un état des lieux photo.
- **Backend** : aucun (mêmes fonctions).
- **Mobile** : écrans dans `apps/antsia_mobile/src/screens/` ; liens profonds.
- **Données personnelles** : aucune nouvelle.
- **Tests et cliquets** : ceux du plan 14.
- **Critères d'acceptation** : parité fonctionnelle prouvée écran par écran avec le web.
- **Dépend de** : SU07a, SU04, plan 14. **Porte** : publication des binaires.

## 6. Ordre recommandé et dépendances

| Vague | Lots | Pourquoi dans cet ordre |
|---|---|---|
| A | NU-01, SU03 | le socle de confiance et le modèle de données d'abord ; SU03 exige une session PRO.GA en parallèle |
| B | SU07a, NU-02, NU-03 | l'annonce de particulier est la brique la plus large et ne dépend pas de PRO.GA ; elle peuple les univers |
| C | SU04, NU-04 | l'immobilier est l'univers le plus attendu (note 20/25) ; l'alerte rend la recherche utile |
| D | SU05, SU07b, NU-05, NU-06 | location partagée, formalisation, besoin publié, dossier |
| E | NU-07 (immobilier puis auto) | ouverture pilote seulement quand SU01a/b/c/d/h sont faits |
| F | SU14a, NU-08 | dépend du déverrouillage des évènements (plan 07) et du mobile (plan 14) |
| Sous condition | SU15, SU14b | conventions d'État (D09) ; contrat de paiement |

Hors de ce plan, à attendre : plan 12 (SU01a, b, c, d, h ; files d'arnaque) ; plan 07 (évènements de page dans ANTSIA) ; plan 09 (activation `services`, gabarits, prestataires) ; plan 08 (catalogue V2 reflété, PRO.GA, paiements) ; plan 01 (messagerie contextuelle) ; plan 06 (préférences de notification, identification) ; plan 13 (console : quotas, catégories, drapeaux d'ouverture) ; plan 14 (mobile) ; plan 11 (fédération des attestations) ; plan 16 (iAsted lira offres, annonces et besoins).

## 7. Décisions à prendre par le propriétaire

1. **D09 — conventions de vérification d'État.** Recommandation : oui, en commençant par la liste des agents immobiliers autorisés (loi 006/2017), la plus simple à transmettre, puis les cartes grises, puis le foncier. Raison : c'est le différenciant principal et rien n'avance sans lui.
2. **Qui modifie PRO.GA pour SU03.** Le catalogue est un fichier jumeau : une session PRO.GA doit porter la taxonomie v2 et l'éditeur de brouillon. Recommandation : désigner cette session avant la vague A. Raison : S1 ne peut pas livrer SU03 seule.
3. **Quotas et seuil de « Passer pro ».** Recommandation de travail, à confirmer : par univers, 5 annonces actives pour un compte Vérifié et 2 pour un compte léger ; « Passer pro » proposé à partir de 10 annonces publiées en 90 jours. Raison : assez pour un particulier, trop peu pour un revendeur déguisé. Ces chiffres sont des propositions, pas des mesures.
4. **Durée de vie d'une annonce.** Recommandation : 30 jours, renouvelable gratuitement, puis effacement 30 jours après expiration. Raison : annonces fraîches, données minimisées.
5. **Caution affichée dans les univers.** Recommandation : afficher le montant de caution et d'avance, avec l'avertissement « ne versez rien avant la visite ou la remise » ; ANTSIA ne détient jamais rien. Raison : c'est l'information que cherchent les locataires, sans risque de fonds.
6. **Agences sans PRO.GA pendant le pilote.** Option A (étude) : les biens d'agence viennent seulement de PRO.GA. Option B : une page d'agence publie aussi des annonces ANTSIA tant que la verticale PRO.GA n'existe pas. Recommandation : A pour la cible, B autorisée pendant le pilote, étiquetée, sans stock ni commande. Raison : sans B, l'univers reste vide jusqu'à la verticale PRO.GA.
7. **Billet QR gratuit dans ANTSIA.** Recommandation : oui, avec SU14a, après la décision du bouton « billet QR » de DIASPORALE. Raison : la brique existe et la jauge sert dès les cérémonies gratuites.
8. **Liste des quartiers du pilote.** Recommandation : fournir ou valider la liste des communes et quartiers du Grand Libreville. Raison : aucun référentiel ne doit être inventé.

## 8. Risques et points d'attention

- **Arnaques** (faux loyers, faux véhicules, acompte demandé) : premier risque. Parade : NU-01, Vérifié exigé pour les catégories sensibles, aucune somme dans les parcours, labels d'État (SU15), file prioritaire (plan 12).
- **Univers vides** : aucune route ni tuile avant des offres réelles ; vendeurs pilotes ; option 7.6.
- **Fichier jumeau** : toute modification de `catalogFacets.ts` sans PRO.GA casse le manifeste et les tests des deux dépôts.
- **Projections publiques strictes** : un champ ajouté à une projection existante casse les fronts en ligne ; publier une projection à part.
- **Coût des filtres** : les facettes riches lues par fenêtres peuvent dépasser les budgets de lecture ; mesurer avant d'ouvrir.
- **Données personnelles** : visites, dossiers et alertes sont des données nouvelles ; chacune entre dans l'inventaire, l'export et l'effacement ; dossier APDPVP (propriétaire).
- **Ordonnance 0012** : un particulier très actif peut devenir « assimilé » ; « Passer pro » et SU01j (transparence des espaces qui vendent) y répondent.
- **Faux labels** : un label ne se déclare jamais ; il se calcule depuis une attestation signée.
- **Session partagée** : `convex/schema.ts` et `package.json` sont modifiés par S1 seule.

## 9. Prompts d'implémentation

### Prompt SU03
> Tu es la session S1 d'ANTSIA. Lis `CLAUDE.md`, l'étude `docs/etudes/2026-10-21-sept-univers-et-vie-publique/ETUDE_SEPT_UNIVERS_ANTSIA.md` (§ 7.4, § 8, § 13), l'ADR-0035, `docs/etudes/2026-10-21-marketplace-specialites/10_CONTRATS_CATALOGUE_V2.md` et ce plan (lot SU03). Périmètre : `packages/social-domain/src/commerce/catalogFacets.ts`, `fixtures/catalog-facets.json`, `fixtures/MANIFEST.json`, `convex/modules/shops/{catalogFacetValidators,catalogValidators,marketplaceIndexFields}.ts`, leurs tests, l'i18n des facettes. Livre une taxonomie version 2 additive (branches `real_estate` et `vehicle`, attributs typés listés au plan), la v1 restant conforme à l'octet. N'ouvre aucune route. Vérifie : `bun run verify` vert, cas v1 et v2. Arrête-toi et demande avant : toute modification du dépôt PRO.GA (le fichier est jumeau), toute publication. Mets `EXECUTION.md` de l'étude à jour.

### Prompt NU-01
> Session S1. Lis `CLAUDE.md`, `SU01_CONFORMITE_ORDONNANCE_0011.md` (§ 2.2, SU01d), ce plan (NU-01) et `packages/social-domain/src/moderation.ts`. Ajoute le motif `scam` (fr : « Arnaque ou fraude ») et sa phrase d'aide, les seaux `listing.*` et leurs variantes renforcées dans `convex/lib/rateLimit.ts`, la règle pure `listingTrustRequirements` et ses tests, le composant d'avertissement anti-acompte. Coordonne-toi avec le plan 12 pour la file et le délai : n'invente pas de délai légal. Vérifie : `bun run verify`, recette du sélecteur de motif à 390, 834, 1440 px, clair et sombre. Aucune publication sans accord écrit.

### Prompt SU07a
> Session S1. Lis `CLAUDE.md`, l'étude (§ 7.3, § 8), l'ADR-0035 (D03), `docs/contrats/CONVERSATION-CONTEXTUELLE-V1.md` (§ 10.5), ce plan (SU07a). Crée `convex/modules/classifieds/` (tables au schéma, fonctions bornées, cron d'expiration ASCII), la nature contextuelle `classifiedListing`, le composeur web en quatre étapes (React Hook Form + Zod) et « Mes annonces ». Applique quotas, catégories interdites et encadrées, garde des fichiers, export et effacement. Aucune route d'univers publique : elle viendra avec NU-07. Étends `network-scoped-functions`. Vérifie : `bun run verify`, recette navigateur à 390, 834, 1440 px, clair et sombre, avec un compte léger et un compte Vérifié de développement. Demande avant : valeurs de quotas et de durée (décisions 7.3, 7.4), toute publication.

### Prompt SU04
> Session S1. Lis `CLAUDE.md`, l'étude (§ 5.2, § 7.4, § 8 « louer une maison », § 12), ce plan (SU04), `apps/antsia_ga/src/components/discovery/discover-screen.tsx` et `apps/antsia_ga/src/components/universes/food-universe-screen.tsx` (patron d'univers). Ajoute le gabarit `real_estate` et la capacité `properties` (contrat MP02), les tables `visitSlots` et `visitRequests`, l'espace `/immobilier` (route dans `routes.ts`, navigation spécialisée, fiche, panneau de créneaux), la tuile conditionnelle. Aucune somme demandée. Garde le drapeau d'ouverture fermé (NU-07). Vérifie : `bun run verify`, recette à 390, 834, 1440 px, clair et sombre, avec des biens de démonstration étiquetés « Démo ». Demande avant : ouverture, publication.

### Prompt NU-04
> Session S1. Lis `CLAUDE.md`, ce plan (NU-04), `convex/modules/notifications/notify.ts` et le cliquet `notification-payload-content`. Crée `savedSearches`, le rapprochement à la publication et le passage quotidien (cron ASCII, tranches bornées), le consentement « alertes », l'écran de gestion. La notification ne porte ni titre, ni prix, ni lieu. Vérifie : `bun run verify`, un test de bout en bout « offre publiée → une notification ». Aucune publication sans accord écrit.

## 10. Sources lues

- `docs/etudes/2026-10-21-sept-univers-et-vie-publique/ETUDE_SEPT_UNIVERS_ANTSIA.md` (en entier), `SU01_CONFORMITE_ORDONNANCE_0011.md` (§ 2 à § 6), `EXECUTION.md` (SU01d, SU02, SU06, conditions externes).
- `docs/adr/0035-sept-univers-et-vie-publique.md` ; `docs/adr/0034-marketplace-et-espaces-specialises.md` (aucun alias vide).
- `docs/etudes/2026-10-21-marketplace-specialites/` : `01_ARCHITECTURE.md`, `10_CONTRATS_CATALOGUE_V2.md`, `15_ADMISSION_MP14.md`.
- `docs/00_CAHIER_DES_CHARGES_ANTSIA.md` (EXF-AN-50 à 53) ; `docs/contrats/` (liste, `PRO-COMMERCE-CATALOG-READ-V1.md`).
- Dossier de reprise du 9/11/2026 (§ 10, § 11, lots 1.0 à 1.7).
- Mémoire : `etude-sept-univers-antsia.md`, `marketplace-ventes-privees.md` ; vault `10-PROJETS/antsia/` (note et décision du 21/10).
- Code : `convex/modules/{shops,events,contextualMessaging,commercialMessaging,moderation,marks,federation}`, `convex/lib/rateLimit.ts`, `packages/social-domain/src/{activityConfiguration,badges,moderation,contextualMessaging,provinces}.ts`, `packages/social-domain/src/commerce/{catalogFacets,primitives}.ts`, `apps/antsia_ga/src/{lib/routes.ts,components/discovery,components/universes,components/marketplace,components/specialized-navigation-state.ts}`, `apps/antsia_mobile/src/screens/`, `tests/ratchets/`.
- PRO.GA (indicatif, branche locale) : liste des modules, aucun module de location ni d'immobilier.
