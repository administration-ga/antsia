# 06 — Registre consolidé des décisions du propriétaire

## Addendum du 20 octobre 2026 — état des décisions, sans nouvel arbitrage

La poursuite P17d/P18/P19 sans vérifications est autorisée dans le
[plan de reprise](../rapports/P17D_P18_P19_PLAN_REPRISE_2026-10-20.md). Elle n’autorise ni
activation, ni collecte utilisateur, ni publication. Le total de 39 décisions/7 prérequis
ci-dessous décrit le registre du 19 octobre, sans recomptage ni fermeture artificielle.

| Référence historique | État ou choix de source désormais documenté | Ce qui n’est toujours pas acquis |
|---|---|---|
| DP-01 / DP-02 | L’enchaînement des lots documentaires est autorisé ; la suspension des vérifications reste en vigueur | Gel, tests, recette, choix du périmètre d’un pilote réel et décision GO |
| DP-04 / DP-05 | P16 ferme l’automatisation ; une ancienne valeur `auto_verified` se lit en revue | Politique de secteurs/admission validée ; aucune ouverture par ancienne configuration |
| DP-17 / DP-18 | Conservation et export/effacement général PRO.GA toujours dépendances ; les obligations historiques et les purges en attente sont préservées | Pas de durée légale ou protocole interproduits décidé par cette reprise |
| DP-26 / DP-27 | `apps/antsia_mobile` et paquet `social-native` réalisés en source ; Expo 57.0.17 / RN 0.86.3 / React 19.2.7 déclarés dans P17b | Installation/lockfile, compatibilité et binaires non prouvés ; pas de migration Expo 58 décidée ici |
| DP-28 | P17b/c écrits à partir des API/contrats et documents officiels, sans duplication native d’un autre produit | Aucune autorisation générale de copier un autre produit ou ses identifiants |
| DP-29 / DP-33 | Préservation DIASPORALE et identités configurables prévues | Ni priorité de livraison DIASPORALE ni bundle/package/schéma propriétaire fournis ou validés par ce dossier |
| DP-30 | Chaîne source CallKit avant JS ; Android Core-Telecom/CallStyle/FCM data ; aucune annulation par second push VoIP | Compilation, réception et fin réelle des captures à éprouver dans P17d |
| DP-31 | Budget social hebdomadaire historique conservé | Plafond d’appels distinct toujours non tranché ; aucun budget mesuré |
| DP-32 | SecureStore reste `WHEN_UNLOCKED_THIS_DEVICE_ONLY` ; pas de passage à `AFTER_FIRST_UNLOCK` | Réponse authentifiée verrouillée, froid et arrêt forcé non prouvés ; aucune exception de session |
| DP-34 | Reprises P14/P15/P16 relisent la vraie preuve de session ; les transports relus utilisent leur date d'autorisation, aucun job ne fabrique une authentification récente | Scénarios et transport toujours non exécutés dans cette reprise |
| DP-39 | La suite P19 choisit un signal privé neutre de relecture, contrat/profil dédiés, corrélé à un engagement existant ; aucun état métier importé | Raccords source décrits dans le [rapport dédié](../rapports/P19_AVIS_SERVICES_2026-10-20.md), pas de configuration ni recette ; réception sur appareil non prouvée |
| DP-37 / K-19 / K-20 | Consoles et relance auditée de lettre morte décrites par les finitions en source | Ces portes ne sont ni testées ni autorisées à activer un registre P16 fermé |
| PR-01 à PR-07 | Prérequis repris dans le [bilan actuel](../rapports/P19_REPRISE_2026-10-20.md) | Configuration, appareils, participants, responsabilités et moyens non fournis par cette reprise ; mesures machine anciennes non renouvelées |

Les gates de services, candidatures et copie CV ajoutés par P16 restent fermés. Aucun participant,
responsable nominatif, fournisseur, taux financier ou seuil de performance n’est choisi ici.
Le [dossier P17d](../../../recette/antsia-native-p17d/README.md) est la référence de préparation
physique ; sa présence seule ne clôt aucune décision de cette table.

La demande d'enchaîner les correctifs autorise ce choix technique de signal privé. Elle ne vaut
ni validation juridique d'une conservation, ni ouverture commerciale, ni autorisation d'exécuter
la procédure de vérification. K-12/AC03 et K-16/AC08 ont leur correctif source dans le
[bilan P19 complémentaire](../rapports/P19_CORRECTIFS_AUTOMATIQUES_2026-10-20.md) ; la reprise
CV ajoute son admission durable en conservant le gate fermé. Les anciennes lignes DP/K restent
historiques et les décisions qui dépendent de preuves réelles ne sont pas déclarées closes.

## Registre historique du 19 octobre (conservé)

19 octobre 2026, lot P19. Registre dédupliqué à partir de 00 §8, des rapports P00 à P18A et P14B, de
EXECUTION.md, du contrat CONVERSATION-CONTEXTUELLE-V1, des ADR 0017 à 0025 et des passations PRO.GA
docs/18 à 26. Quand plusieurs rapports posent la même question, elle n'a qu'une ligne, avec toutes
ses sources. Une proposition déjà documentée est signalée « proposé » ; elle ne vaut pas décision.

**Bilan : 39 décisions non closes** (32 ouvertes, 2 partiellement prises, 1 à confirmer
juridiquement, 2 à trancher après recette, 1 après mesure, 1 reportable) **et 7 prérequis** à
fournir par le propriétaire. Les numéros DP et PR sont repris dans tout le dossier `pilote/`.

## 1. Cadre, version et ADR

| N° | Décision | Sources | Ce qui en dépend | Options et effet | Qui · état |
|---|---|---|---|---|---|
| DP-01 | Lever « Continuer sans vérifier » : autoriser gel, génération, tests, `verify`, serveurs locaux et recettes en sandbox | EXECUTION.md (18/10, 21 h 50) ; rapports P03 à P18b ; contrat CC | tout verdict au-delà de « présent dans le code » | Oui : procédure [02](02_GEL_ET_VERIFICATION.md), puis recettes [03](03_PARCOURS_DE_RECETTE.md). Non : aucun lot testé, recetté ni publiable | propriétaire · ouverte |
| DP-02 | Version candidate du premier pilote et son périmètre (réseau, boutiques, vendeurs, durée) | prompt P19, 00 §4, 09 §4 | toutes les étapes de [05](05_ACTIVATION_ET_RETOUR_ARRIERE.md) | Proposé : A, puis B restreinte, puis C sans paiement ([01 §8](01_VERSIONS_CANDIDATES.md)) | propriétaire · ouverte |
| DP-03 | Accepter ou amender les ADR proposés 0017 à 0024 | ADR 0017–0024 ; P00 §2 | caractère immuable des décisions de la refonte | Accepter après recette fige palette, navigation, autorité PRO.GA, boutique progressive, contact, paiement, achats, emploi | propriétaire · après recette |

## 2. Vitrines, admission et modération

| N° | Décision | Sources | Ce qui en dépend | Options et effet | Qui · état |
|---|---|---|---|---|---|
| DP-04 | Publication d'une vitrine déclarée non vérifiée, et politique de vitrine du réseau | ADR-0019 ; 00 §8 ; P00 §2 ; P07 ; P16 §3.1 | publication P07 ; P09, P10 et toute la version C en dépendent | `closed` : brouillons seulement (état actuel). `review` : admission motivée une à une (proposé par P16). `auto_verified` : admission d'office des seules adhésions `verifiee` | propriétaire · ouverte |
| DP-05 | Secteurs restreints : liste et grille d'admission | P16 D2 ; 06 §1 | `auto_verified` | Sans liste validée : ne pas activer `auto_verified` (proposé) ; en `review`, refus motivé de toute activité réglementée. Le code ne bloque pas `auto_verified` | propriétaire, conseil · ouverte |
| DP-06 | Recours contre la suspension d'une vitrine | P16 D3 | P07, P16 | Voie structurée (motif, délai, second regard), ou décision tenue jusqu'au rétablissement opérateur (état actuel) | propriétaire · ouverte |
| DP-07 | Voie du membre suspendu pour SES engagements (annuler un rendez-vous, demander une annulation ou un remboursement) | P16 D4 | P13, P14 | Voie habilitée, comme le retrait CRM et le retrait de candidature ; ou support seul (aujourd'hui : refus) | propriétaire · ouverte |
| DP-08 | Survie du consentement de diffusion publique d'une vitrine au départ ou à l'effacement de son signataire | P16 D6 | P07, P09 | Aujourd'hui il survit, au nom de la boutique ; sinon, retrait public à l'effacement | propriétaire · ouverte |
| DP-09 | Recours de page déposé par un signataire ensuite effacé | P16 D7 | P16 C6 | Aujourd'hui la ligne suit la personne et disparaît, un autre signataire peut redéposer ; sinon, rattacher le recours à la page | propriétaire · ouverte |

## 3. Paiement, fonds et conditions

| N° | Décision | Sources | Ce qui en dépend | Options et effet | Qui · état |
|---|---|---|---|---|---|
| DP-10 | Fournisseur(s), connecteur concret, accès sandbox, admission marchand | 00 §8 ; P00 §6 ; P06 §5 ; P12 ; ADR-0018 ; ADR-0022 ; PRO.GA docs/23 | parcours C-3 à C-6 ; étapes 6 et 7 | Familles retenues le 18/10 : mobiles, PayPal, Stripe. Contraintes : PayPal sans XAF, Gabon « Send only » ; Stripe avec XAF, Gabon absent des pays d'ouverture ; Airtel et Moov : spécifications à obtenir. Tant que rien n'est choisi : `PAYMENT_ADAPTERS = []`, payer fermé | propriétaire, partenaire · partielle |
| DP-11 | Bénéficiaire, juridiction, dispositif marketplace (collecte plateforme, reversement), portée de la « protection commerciale » | P12 ; ADR-0022 ; docs/23 | étape 7 | Décidé le 18/10 : ANTSIA collecte puis reverse après réception acheteur. Reste : contrats, habilitations, compatibilité des produits fournisseurs (reversement différé PayPal libéré automatiquement après 28 jours ; frais et contestations à la charge de la plateforme chez Stripe). Ce n'est pas un séquestre agréé | propriétaire, partenaire, conseil · partielle |
| DP-12 | Politique de répartition active et acceptation des vendeurs | P12 ; docs/23 | étape 6 | Modes 90/10, 85/15, contrat individuel, retenue personnalisée ; base `gross_checkout_total` ; arrondi `exact_only`, `seller_floor` ou `seller_ceil`. Paramétrable dans PRO.GA (`/commerce-payments`), sauvegardée désactivée ; rien d'actif | propriétaire, vendeurs · ouverte |
| DP-13 | Frais et commission présentés avant paiement | 00 §8 ; 06 §8 | étape 6 | Aucun taux inventé ; le total complet s'affiche dès qu'un modèle est décidé | propriétaire · ouverte |
| DP-14 | Conditions de vente, remboursement, litige, déclencheur du reversement, pays servis | 00 §8 ; P12 ; P13 ; ADR-0023 | étapes 6 et 7 | Litige complet et reversement non livrés ; V1 limitée à la livraison au Gabon | propriétaire, conseil · ouverte |
| DP-15 | Échéance de réservation : prolongation côté PRO.GA, ou exception « essentielle » motivée (A17) | P18A ; P18b ; P11 ; P12 | étape 5 | P18b avertit deux minutes avant ; aucune prolongation n'existe | propriétaire (produit) · ouverte |
| DP-16 | Délai de remise figé avant engagement, par une politique versionnée | PRO.GA docs/24 ; P13 | étape 5 | Aujourd'hui le suivi affiche un délai inconnu (`leadTimeDays: null`) ; le délai n'est visible qu'avant engagement | propriétaire (produit) · ouverte |

## 4. Données, conservation et effacement

| N° | Décision | Sources | Ce qui en dépend | Options et effet | Qui · état |
|---|---|---|---|---|---|
| DP-17 | Durées de conservation, avec un conseil compétent : preuves financières et anti-rejeu PRO.GA ; suivis privés ANTSIA (préparations, paiements, achats) ; candidatures, motivations et pièces (`COMMERCE_JOBS_RETENTION = null`) ; preuves d'acceptation et décisions durables (P14) ; conversations contextuelles (`CONTEXTUAL_RETENTION = null`, confirmation juridique de CC D7) ; durées techniques des lots (90 j P10, 7 j P11, 90 j P13, 30 min pour les corps) à confirmer ou remplacer | P16 D5 ; P11 ; P13 ; P14 ; P15 ; ADR-0022, 0024, 0025 ; contrat CC §14 | étapes 4 à 7 | En attendant : aucune purge temporelle là où la valeur est `null` ; durées techniques déclarées comme telles, jamais présentées comme légales | propriétaire, conseil · ouverte |
| DP-18 | Effacement relayé vers PRO.GA : `subject.erasure.request` par contrat jumeau (annulation des rendez-vous futurs à l'échéance de grâce, expurgation des copies non financières) et pipeline général d'export et d'effacement du sujet opaque | P16 D1 ; P10 (docs/21) ; docs/24 ; docs/26 ; P14 | parcours C-12 ; étapes 4 à 7 | Sinon : avertissement avant effacement (C5) et voie de support (annuler l'effacement, annuler ses rendez-vous, redemander) | propriétaire · ouverte |
| DP-19 | Révocation de liaison initiée par ANTSIA (`link.revoke`, nom réservé) | P16 D8 ; P06 §5 ; COMMAND §12 | P08 | Sinon : révocation locale ; PRO.GA garde la liaison et peut émettre des reflets refusés (lettres mortes à surveiller) | propriétaire · ouverte |
| DP-20 | Export d'un message écrit en voix de page pour son signataire : trace sans contenu (CC D13) | ADR-0025 ; contrat CC §14 | CC | Validée le 19/10 ; confirmation juridique attendue | conseil · à confirmer |

## 5. Présentation, accessibilité et mesure

| N° | Décision | Sources | Ce qui en dépend | Options et effet | Qui · état |
|---|---|---|---|---|---|
| DP-21 | Sous-titres vidéo (A08) | P18A ; P18b | pilote avec vidéos (version A) | (a) lot contrat `captions` (WebVTT, téléversement sous analyse complète, `<track>`, composeur, modération, export, effacement) ; (b) limite déclarée avant le pilote, WCAG 1.2.2 non satisfait | propriétaire · ouverte |
| DP-22 | Police Inter : l'adopter ou non ; si oui, dépendance dans `apps/antsia_ga/package.json` puis `bun install` (fichiers réservés, installation) | P01 D7 ; P01b §P2 ; recette du 18/10 | P01 | Aujourd'hui Inter n'est pas installée : repli système pour le corps | propriétaire · ouverte |
| DP-23 | Couleur du bouton « Créer un compte » : aplat vert `--esp-green-strong` ou action prune | P01 D9 | P01 | Aujourd'hui vert dans la variante compacte de l'entrée | propriétaire (produit) · ouverte |
| DP-24 | Outils de mesure au catalogue (`@playwright/test`, `@axe-core/playwright`, `lighthouse`) et leur installation | P18A §4.1 | P18b | Sans eux : mesures manuelles, budgets de 10 §4 difficilement mesurables | propriétaire · ouverte |
| DP-25 | Chargement automatique de trois pages au plus en immersion, face à la doctrine « pas de défilement infini » | P04 décision 4 | P04 | À confirmer après recette ; la liste garde la doctrine | propriétaire (produit) · après recette |

## 6. Natif (P17a, décisions D1 à D8)

| N° | Décision | Ce qui en dépend | Options et effet | Qui · état |
|---|---|---|---|---|
| DP-26 | D1 Emplacement et installation de l'application native | P17b | Proposé : `apps/antsia_mobile` dans l'espace de travail avec un catalogue nommé, essai d'entrée, repli hors des espaces de travail | propriétaire, coordinateur · ouverte |
| DP-27 | D2 SDK Expo 57 ou 58 | P17b | 57 : pile des briques du programme ; 58 (15/10/2026) : RN 0.88, `SceneDelegate` | propriétaire · ouverte |
| DP-28 | D3 Source et droits de duplication native (`gabon-diplomatie@1abb2f23`, `setrag@bd3a80e7` ; ANTSIA est AGPL-3.0-or-later) | P17b, P17c | Sans autorisation : écrire depuis les exemples officiels | propriétaire · ouverte |
| DP-29 | D4 Ordre avec DIASPORALE mobile, paquet natif commun | P17b | Le cahier place ANTSIA après DIASPORALE mobile (EXF-AN-53) | propriétaire · ouverte |
| DP-30 | D5 Chaînes système | P17c | Proposé : rapport CallKit en natif avant JavaScript ; Android Core-Telecom, `CallStyle`, FCM « data » | propriétaire · ouverte |
| DP-31 | D6 Budget des appels (M6) | P17c | Appels gouvernés par les préférences d'appel et « ne pas déranger », ou plafond distinct du budget social (35 par semaine par défaut) | propriétaire · ouverte |
| DP-32 | D7 Sécurité locale | P17b, P17c | Trousseau `AFTER_FIRST_UNLOCK`, durée de session, biométrie éventuelle | propriétaire · ouverte |
| DP-33 | D8 Identités : bundle iOS, paquet Android, schéma, domaine des liens universels | P17b | — | propriétaire · ouverte |

Source unique : [P17a §5.0](../rapports/P17A_AUDIT_NATIF.md).

## 7. Contrats, portes d'ouverture et exploitation

| N° | Décision | Sources | Ce qui en dépend | Options et effet | Qui · état |
|---|---|---|---|---|---|
| DP-34 | `request.status` de fond sans session vivante : consultation machine sans sujet engageant, ou relecture de la dernière session prouvée | EXECUTION.md ; P16 §9.4 | P10, P15 (K-06) | À trancher avant tout code ; sans effet métier aujourd'hui, mais `authVerifiedAt: now` ne décrit pas ce que COMMAND §5 promet | propriétaire, coordinateur · ouverte |
| DP-35 | Signature des réponses COMMAND et canal poussé d'états privés | P06 §5 ; COMMAND §12 | une V2 | V1 : réponses non signées, états privés par consultation | propriétaire · reportable |
| DP-36 | Valeurs des quotas et budget de rattrapage du catalogue (`federation.receive` 300/min, environ 5,5 h pour 100 000 offres) | P06 ; P08 ; P09 ; P10 ; P14 ; contrat CC D14 | exploitation | Valeurs de départ posées ; à mesurer pendant le pilote | propriétaire, coordinateur · après mesure |
| DP-37 | Porte d'ouverture des quatre politiques sans écran (vitrines, catalogue, préparation, conversation contextuelle) | relevé P19 (K-19) | étapes 2, 3, 5 ; CC | Lot d'écrans de console (motif, audit, révision), ou procédure opérateur écrite appelée sur le déploiement autorisé | propriétaire · ouverte |
| DP-38 | Version A avec ou sans surfaces commerciales : sept entrées de Profil, onglet Boutiques et brouillon de boutique ne sont gardés par aucune capacité | relevé P19 (`me-model.ts`, `discover-model.ts`, P07) | étape 1 | (a) les accepter, visibles et vides, brouillon permis (capacité « préparer » d'ADR-0019) ; (b) lot de code : capacité d'application `commerce` et porte serveur des brouillons | propriétaire · ouverte |
| DP-39 | Canal asynchrone des états de service vers le client : événement PRO.GA signé vers l'inbox, ou suivi de fond conforme au contrat (lié à DP-34) | P14B (limites) ; P14 | avis client des services (C-15) | Sans canal : les avis client sont des traces déjà lues ; le client apprend l'état en relisant « Mes demandes » ; aucun avis ne le prévient | propriétaire, avec PRO.GA · ouverte |

## 8. Prérequis à fournir par le propriétaire

| N° | Prérequis | Sources | Ce qui en dépend |
|---|---|---|---|
| PR-01 | Configuration commerce par environnement : sources, destinations, clés distinctes, origines, émetteurs (`allowedContracts`), flags de recette (noms dans [05 §3](05_ACTIVATION_ET_RETOUR_ARRIERE.md)) | P08 §4 ; PRO.GA docs/19 ; P09 ; P10 ; P14 ; P15 | B-2 et tous les parcours commerciaux suivants |
| PR-02 | Hébergement : projet Convex `antsia` (déploiement local anonyme aujourd'hui), déploiements, domaines | `CLAUDE.md` ANTSIA ; P08 | toute publication |
| PR-03 | LiveKit configuré, deux sessions consenties | P00 §6 ; P05 | A-7, A-8, appels P10, CC-4 |
| PR-04 | VAPID, FCM, APNs | P00 §6 ; P05 ; P17a | A-9, natif |
| PR-05 | Participants consentants, vendeurs pilotes, contenus et stocks de recette identifiables | 00 §8 ; P00 §6 ; 10 §1 | pilote utilisateur, recettes B et C |
| PR-06 | Appareils physiques (au moins un iPhone, un Android avec services Google, idéalement un Android ≤ 13, un casque Bluetooth) ; comptes Apple Developer, App Store Connect, Google Play Console, Firebase, EAS | P17a §5.4 ; P18A §4.2 ; P04 §6 | A-5 et A-10 sur appareil, version D |
| PR-07 | Espace disque libéré (4,3 Gio libres le 19/10) et passes une à une sur la machine de 16 Go | [02](02_GEL_ET_VERIFICATION.md) G-4 | gel, `verify`, build |

## 9. Décisions déjà prises (pour mémoire)

- « Pro.gram » désigne PRO.GA ; refonte réservée à ANTSIA ; fond blanc et cartes beige en clair
  (P00 §2).
- Implémentation par agents coordonnés (18/10) ; « Continuer sans vérifier » (18/10, vers 22 h).
- Backend PRO.GA local, `.env.local` réécrit avec copie, sans toucher le cloud (18/10, vers 15 h 20).
- Paiement : familles mobiles, PayPal et Stripe ; ANTSIA collecteur ; modes de répartition et
  retenue paramétrables ; reversement après réception acheteur (18/10, P12).
- Conversation contextuelle : D1 à D16 validées le 19/10, D5 et D8 amendées, §6.3 corrigé ;
  ADR-0025 accepté ; D7 et D13 restent à confirmer juridiquement (DP-17, DP-20).
- Chiffrement de bout en bout : hors périmètre, aucune promesse (P00, ADR-0017).
- Résolues dans le code depuis leur ouverture, non vérifiées : raccord unique des deux outboxes
  (P08) ; période des salaires (JOBS-V1) ; équipe vendeur par mandats (P10) ; surface élevée
  `--esp-surface-raised` et rayon des cartes (P01 D3 et D1).

## 10. Arbitrages techniques du coordinateur (hors registre du propriétaire)

| N° | Arbitrage | Référence |
|---|---|---|
| AC-01 | Remède des deux `httpAction` importés de modules par `PRO_GA/convex/http.ts` | K-04 |
| AC-02 | Mise à jour de `compatibility.test.ts` (hors manifeste P06) | K-07 |
| AC-03 | A18 pour `purchases/purchase-card.tsx` et `jobs/my-applications-screen.tsx` | K-12 |
| AC-04 | Avatar rond de la carte publique (`public-post-card.tsx:19`, `rounded-xl` aujourd'hui ; P01 D10) | P01 §7 |
| AC-05 | Index `docs/adr/README.md` à compléter (0017, 0018, 0019, 0024) | K-21 |
| AC-06 | Relance d'une lettre morte de l'outbox PRO.GA : porte à créer ou procédure par réconciliation | K-20 |
| AC-07 | Routage des callbacks et choix simultané de plusieurs connecteurs, après DP-10 | P12, docs/23 |
| AC-08 | Constat de l'alignement OpenAPI du profil machine PRO.GA | K-16 |
| AC-09 | Relecture du diff de `use-checkout-clock.ts` | K-13 |
