---
title: "ANTSIA — Cahier des charges fonctionnel et technique : le moteur social national et le réseau public"
version: "1.0"
date: "2026-10-14"
statut: "Proposition de référence — à valider par le propriétaire"
projet: "ANTSIA"
reference: "NTSAGUI/ANTSIA/CDC/2026/001"
maitre_d_ouvrage: "NTSAGUI Digital (propriété intellectuelle) ; données au Gabon (cible du programme)"
dependances:
  - "Documentation/RESEAUX_SOCIAUX/00_PLAN_RESEAUX_DANS_LE_RESEAU_DIASPORALE_ANTSIA_2026-10-14.md (plan de pilotage)"
  - "ECOSYSTEMES/ANTSIA/docs/01_PLAN_IMPLEMENTATION_PROMPTS_ANTSIA.md (prompts d'exécution)"
  - "ECOSYSTEMES/DIASPORA_GA/docs/00_CAHIER_DES_CHARGES_DIASPORA_GA.md (premier réseau servi par le moteur)"
  - "Documentation/RESEAUX_SOCIAUX/annexes/{A,B,D}_*.md (audits du 14/10/2026)"
---

# ANTSIA — Cahier des charges fonctionnel et technique

> **État au 18/10/2026 — PA10.** Fil personnel matérialisé, distribution/rattrapage bornés,
> rétention, purge des dépôts non admis et observabilité complétés dans les sources.
> La préparation au lancement est consignée dans `docs/06_RAPPORT_LANCEMENT.md`.
> À la demande du propriétaire, contrôles, charge, restauration et audits sont différés.
> PA9 reste ouvert pour configuration/PR/recette croisée ; aucun lancement ni publication
> n'est déclaré par cet encart. Le cahier et ses critères de sortie restent inchangés.

> **Nom confirmé.** Le propriétaire a confirmé explicitement **ANTSIA** le 16/10/2026.
> Le domaine cible est `antsia.ga` ; son attribution et sa configuration restent à la charge
> du propriétaire. Ce renommage local ne vaut pas renommage d’un dépôt ni d’un domaine externe
> historique. Dans le code, le nom est un jeton de marque unique.

> **Deux objets dans un dépôt.** Ce cahier décrit (A) **le moteur social national** — le
> backend et les paquets qui servent tous les réseaux : ANTSIA, DIASPORA.GA, et demain d'autres
> — et (B) **le réseau public ANTSIA**, racine de tous les réseaux, avec son application
> `antsia.ga`. Les deux vivent dans `ECOSYSTEMES/ANTSIA/`, parce qu'ANTSIA est le réseau racine et
> que le moteur porte son identité. DIASPORA.GA (`ECOSYSTEMES/DIASPORA_GA/`) est une application de
> ce moteur ; son cahier dit ce qu'il y ajoute.

## 0. Décision de conception

ANTSIA est **le réseau social public gabonais** : ouvert à toute personne, structuré par la
confiance (quatre badges calculés côté serveur), et **global** — il contient les réseaux fermés
de l'écosystème. Un membre de DIASPORA.GA est membre d'ANTSIA ; une administration vérifiée de
l'espace agent y a sa page « Officiel » ; un agent qui le souhaite y existe. Mais chaque réseau
fermé garde son contexte : ce qui s'y publie n'entre dans ANTSIA que par un geste explicite.

Le **moteur** est construit par **duplication** du réseau social de l'espace agent
d'administration.ga (iRéseau, iCom, stories, albums, direct, notifications : environ 22 000
lignes de backend et 92 000 lignes de front, testées, en production), selon les dix règles de
duplication de PRO.GA, et rendu **multi-réseaux par construction** : une table `networks`, une
clé `networkId` sur tout contenu et toute adhésion, une personne unique par être humain, des
identités externes (IDN, attestations, lien administration), une modération par réseau, une
passerelle de fédération entrante par contrats signés.

Ce que le moteur **ajoute** au socle, parce que le socle ne l'a pas : la notion de réseau, le
membre hors administration, l'identité externe, la limitation de débit sur toutes les
écritures, la modération à l'échelle (tout type de contenu, sanctions, recours), l'effacement
RGPD des contenus sociaux, le push des évènements sociaux, le fil matérialisé et les compteurs
fragmentés, un contrat d'API stable pour les applications, l'internationalisation et les
fuseaux horaires.

Ce qu'ANTSIA n'est pas : une migration de l'iRéseau du socle (il reste en production, il se
**reflète**) ; un front de la base consulaire ; un réseau publicitaire (le citoyen ne paie
jamais ; la monétisation, si elle vient, est B2B, étiquetée et décidée par le propriétaire).

## 1. Contexte

- Le programme Digital GABON a fait de chacune de ses marketplaces un « réseau social où l'on
  travaille » (ADMINISTRATION.GA, PRO.GA, SANTE.GA, directives du 29/07/2026). Il n'a pas encore
  de réseau social **grand public**.
- L'espace agent porte un réseau social complet (annexes A et B du plan) : fil, publications
  riches, réactions, commentaires, relais, signalement, profils, relations, groupes, pages,
  évènements, signets, albums, stories, directs LiveKit avec rediffusion, messagerie et appels.
  Il est couplé à l'administration en quelques points d'accroche (délai de rattachement,
  catégorie agent/citoyen, collègues et administrations, pages = organisations, appels soumis à
  l'affiliation) et il lui manque les abstractions d'un réseau multi-tenant.
- consulat.ga détient les comptes de la diaspora et un Espace Communauté ; DIASPORA.GA veut
  en faire un réseau fermé (cahier DIASPORA.GA).
- identite.ga est le fournisseur d'identité unique déclaré à l'APDPVP (OIDC complet, `loa`,
  portail développeur, SDK Better Auth).
- La doctrine d'interopérabilité du programme : plateformes étanches, contrats HTTP signés,
  jamais de lecture de base à base ni de client Convex croisé.

## 2. Objectifs

### 2.1 Objectifs utilisateurs

1. Exister une fois : un handle, un profil, des relations, quel que soit le nombre de réseaux
   auxquels on appartient.
2. Savoir à qui l'on parle : Officiel, Vérifié, Agent public, Communauté — toujours visible,
   jamais déclaratif.
3. Publier, suivre, se connecter, discuter, appeler, assister à des directs, rejoindre des
   groupes et des évènements, dans un réseau national modéré.
4. Lire l'information officielle des administrations et des postes consulaires au même
   endroit que la vie de la communauté, sans jamais les confondre.
5. Garder la main sur ses données : consentements, visibilité par niveau, export, effacement.

### 2.2 Objectifs plateforme

1. Un seul moteur pour N réseaux : chaque nouveau réseau (une ville, une université, une
   profession, une communauté) est une **ligne** de `networks` et une application légère, pas
   un nouveau backend.
2. Une seule identité par personne, fédérée par IDN ; les réseaux fermés enrichissent la
   personne de facettes, ils ne la dupliquent pas.
3. Fédérer les réseaux existants du programme (l'iRéseau du socle) sans les déplacer.
4. Tenir la charge d'un réseau national : fil matérialisé, compteurs fragmentés, limitation de
   débit, modération outillée, observabilité.
5. Rester souverain et honnête : aucune publicité non étiquetée, aucun profilage commercial,
   aucun chiffre public non mesuré, données déclarées là où elles sont.

### 2.3 Indicateurs (cibles indicatives, à confirmer)

| Domaine | Indicateur | Cible an 1 |
|---|---|---|
| Moteur | temps de rendu du fil (p95) ; coût Convex par membre actif | < 1,5 s sur 3G ; dans le budget du propriétaire |
| Réseaux | nombre de réseaux servis ; aucun contenu `network` lu hors de son réseau | ≥ 3 (antsia, diaspora-ga, administration) ; 0 fuite |
| Identité | part des membres avec une identité IDN ; part des Vérifiés | > 40 % ; > 30 % |
| Confiance | pages Officiel fédérées ; signalements traités < 48 h | toutes les administrations vérifiées ; > 95 % |
| Usage | WAU/MAU ; part des contenus natifs vs reflétés | > 30 % ; > 50 % natifs à six mois |
| Qualité | parité prouvée module par module ; cliquets verts | 100 % ; 100 % |

## 3. Sources et politique de réutilisation

### 3.1 Le socle (mesuré sur `origin/main ad2e7fdc2`, annexes A et B)

| Brique | Backend (lignes hors tests) | Front (lignes) | Sort dans le moteur |
|---|---|---|---|
| Réseau personnel (profils, posts, réactions, commentaires, abonnements, cloche, signets, sourdines, stories, groupes de conversation, groupes thématiques, évènements, suggestions) | `reseauPersonnel` 18 317 | `reseau-personnel` 29 508, `stories` 4 761, `notifications` 2 933 | 41 % tel quel, 52 % à adapter, 6 % à réécrire (backend) |
| Graphe | `reseau/connections.ts` (~500 utiles sur 8 064) | — | tel quel ; le reste de `reseau` est institutionnel |
| Pages | `reseauPages` 1 645 | `PagesPanel`, `ProfilPagePage` | à adapter (autorité générique) |
| Albums | `reseauAlbums` 1 388 | `reseau-albums` 1 657 | tel quel |
| Messagerie et appels | `chats.ts` 1 840, `messagerieScope` 1 659, `iappel` 9 423, `meetings.ts` 3 103 | `messagerie` 17 812, `iappel` 14 920 | scope personnel seul ; verrous « agent » à lever (un citoyen ne peut pas appeler, l'appelé doit être affilié, un appel de groupe ad hoc exige une organisation, la présence suppose une organisation) |
| Direct | `direct` 10 595 | `direct` 16 526 | à adapter (75 % du front tel quel) |
| Canaux institutionnels | `icom` 2 395 | `IcomChannelsTab` 1 538 | patrons seulement (annonce à accusé de lecture, inscription d'office, diffusion par lots) |
| Fichiers | `fileGuard` 3 604 | — | à adapter ; garde de délivrance étendue |
| Coque | — | `shell` 19 232, `espace-personnel` 9 074 | à réécrire en coque légère ; providers et couche d'appel reprenables |

Total front audité : 91 689 lignes, environ 3 300 cas de test ; 49 % tel quel, 42 % à adapter,
9 % à réécrire (jugement fichier par fichier). Deux conditions : lever les verrous serveur
« agent » et refaire l'inventaire sur `origin/main` au moment de dupliquer (PA1).

### 3.2 PRO.GA

`pro-domain/src/social-network.ts` (492 l.), modules `social`, `relations`, `contacts`,
`moderation` : une adaptation à un contexte sans administration (audiences `public | relations
| structure`, suivi d'une personne ou d'une structure, blocages et signalements personnels).
Référence pour les points d'accroche.

### 3.3 Les dix règles de duplication

Celles de PRO.GA (`PRO_GA/docs/11` §2), reprises mot pour mot dans le cahier DIASPORA.GA §3.4 et
dans le préambule des prompts ANTSIA. Deux précisions pour le moteur : (a) la duplication se
fait **après** la pose des fondations multi-réseaux (PA2), pour que chaque module arrive avec
`networkId` ; (b) les modules purs serveur que le front importe (`domain`, `media`,
`attachments`, `groupCapacity`, schémas) sont **sortis dans un paquet de contrats** partagé,
plutôt qu'importés depuis `convex/` (abstraction manquante n° 5 de l'annexe B).

## 4. Vocabulaire

| Terme | Définition |
|---|---|
| **Moteur** | backend Convex `antsia` + paquets `social-domain`, `social-contracts`, `social-features`, `ui`, `api` |
| **Réseau** (`network`) | espace social : `root` (ANTSIA) ou `closed` (DIASPORA.GA, administration) ; `parentId` vers la racine |
| **Personne** (`person`) | identité sociale unique : handle, nom affiché, avatar, couverture, mode privé |
| **Lien d'identité** (`identityLink`) | preuve externe rattachée à la personne : `idn`, `local` (e-mail ou téléphone vérifié), `administration` (reflet du socle), `consular_attestation` (DIASPORA.GA) |
| **Adhésion** (`networkMembership`) | personne × réseau : statut, rôle, origine (`derivedFrom`), vérification |
| **Facette** (`personFacet`) | attributs d'une personne propres à un réseau |
| **Visibilité** | `network` (reste dans son réseau) ou `root` (aussi dans ANTSIA) ; distincte de l'**audience** héritée (`public`, `connections`, `group`, `page`) |
| **Reflet** | copie en lecture seule, dans ANTSIA, d'un objet publié par un réseau fédéré (page, publication, carte de personne) |
| **Badge** | Officiel · Vérifié · Agent public · Communauté |
| **Application** | un front qui parle au moteur avec un réseau courant (`NetworkProvider`) : `antsia_ga`, `diaspora_ga`, `admin_antsia_ga` |

## 5. Invariants

1. **Clé de réseau partout** : toute table sociale porte `networkId` indexé ; toute query et
   toute mutation sociale exigent un réseau courant ; un cliquet de test relit le code et
   refuse toute fonction publique sans borne de réseau.
2. **Une personne, un handle, une fois** : `persons.handle` unique dans le moteur ; les réseaux
   ajoutent des facettes, jamais une seconde personne.
3. **Adhésion dérivée** : toute adhésion à un réseau enfant crée (ou maintient) l'adhésion à la
   racine ; une suspension à la racine suspend partout ; quitter un enfant ne retire pas la
   racine.
4. **Contexte séparé** : un contenu `network` d'un réseau fermé n'est jamais servi à un lecteur
   qui n'en est pas membre ; `root` exige `audience = public` et un geste de l'auteur (ou une
   règle de page) ; le contenu `root` reste dans son réseau d'origine.
5. **Confiance calculée** : les badges se calculent côté serveur à partir des liens d'identité
   et de la nature des pages ; aucun champ déclaratif ne les porte.
6. **Étanchéité** : le moteur ne lit aucune base externe ; il reçoit des reflets et des
   attestations par contrats signés et idempotents ; il n'importe aucun `_generated` d'un
   autre dépôt.
7. **Adhésion explicite** : aucun profil ni aucune adhésion n'est créé d'office à partir
   d'une base externe ; les reflets de personnes (agents) n'existent que par opt-in.
8. **Refus indistinct** partout où l'existence d'une ressource est une information (handle
   inconnu, profil privé, blocage, hors réseau rendent la même réponse).
9. **Toute écriture est bornée** : adhésion, éligibilité, limitation de débit, puis droit sur
   la ressource — dans cet ordre, côté serveur, testé.
10. **Aucun chiffre public non mesuré** ; aucune publicité non étiquetée ; aucun profilage
    commercial.

## 6. Acteurs, comptes et confiance

### 6.1 Portes d'entrée du moteur

| Porte | Preuve | Adhésion `antsia` | Badge |
|---|---|---|---|
| **IDN** (identite.ga), affichée en premier dans toute application | identité civile, `loa`, `nationality`, `profile_type` | `declaree` ; `verifiee` si `loa ≥ 2` | **Vérifié** si `loa ≥ 2` |
| **Compte léger** (code à usage unique e-mail ou SMS) | contrôle d'une adresse ou d'un numéro | `declaree` (ANTSIA est ouvert) | **Communauté** |
| **Lien administration** (depuis l'espace agent, par IDN, opt-in) | rattachement validé reflété par le socle (`person.optin`) | `antsia` + `administration` (miroir) | **Agent public** |
| **Attestation consulaire** (depuis DIASPORA.GA) | voir cahier DIASPORA.GA | `diaspora-ga` vérifiée, `antsia` dérivée | **Vérifié** |

Ouverture d'ANTSIA : **toute personne** (recommandation ; arbitrage A7 du plan — l'alternative
« réservé aux identités IDN » reste possible par la politique du réseau racine, sans changer
le code).

### 6.2 Statuts d'adhésion (communs à tous les réseaux)

`en_attente` (admission conditionnelle, lecture seule des contenus publics du réseau) →
`declaree` → `verifiee` ; `suspendue` (sanction) ; `partie`. Les politiques par réseau
(`membershipPolicy`) décident du statut d'entrée : `open` (ANTSIA : `declaree` d'emblée),
`declared_or_verified` (DIASPORA.GA), `mirror` (administration : par reflet seulement).

### 6.3 Rôles

| Rôle | Portée | Pouvoirs |
|---|---|---|
| membre | réseau | publier, réagir, commenter, suivre, se connecter, groupes, évènements |
| signataire / administrateur de page | page | publier au nom de la page, répondre « Officiel » ou « Vérifié », gérer les signataires |
| modérateur (équipe) | réseau × périmètre (pays, thème) | file de signalements, masquer, retirer, sanctions graduées |
| modérateur réseau | réseau | recours, équipes, pages à vérifier |
| administrateur de réseau | réseau | politique d'adhésion, périmètres, import, contrats du réseau |
| opérateur plateforme | moteur (console) | réseaux, équipes, fédération, incidents, journal, badges manuels tracés |

### 6.4 Les quatre badges

| Badge | Condition |
|---|---|
| **Officiel** | page `ownerKind = institution` reçue par fédération (`RESEAU-PUBLIC-V1`) ou par import contractuel (postes consulaires), ou créée par l'opérateur plateforme avec trace |
| **Vérifié** | `identityLinks` : `idn` avec `loa ≥ 2`, ou `consular_attestation` ; pages : revendication validée |
| **Agent public** | `identityLinks.administration` vivant |
| **Communauté** | aucun des précédents |

## 7. Les réseaux dans le moteur

| Réseau | `kind` | `parentId` | `membershipPolicy` | `defaultVisibility` | Modération | Application |
|---|---|---|---|---|---|---|
| `antsia` | `root` | — | `open` | `public` | équipe nationale + thématiques | `antsia_ga` |
| `diaspora-ga` | `closed` | `antsia` | `declared_or_verified` | `network` | par pays | `diaspora_ga` (dépôt DIASPORA.GA) |
| `administration` | `closed`, `mirror` | `antsia` | `mirror` | reflets `root` seulement | aucune dans ANTSIA (reste au socle) | aucune application propre ; visible dans `antsia_ga` |

Créer un réseau = une ligne `networks` (console), une politique, une équipe de modération, un
thème (jetons) et, au besoin, une application légère construite sur `social-features`. Un
réseau peut déclarer un **schéma de facette** (JSON Schema borné) et des **portées** (`reach`)
propres ; le moteur ne connaît que `networkId`, `visibility`, `audience` et des champs
génériques `country?` et `reach?`.

## 8. Périmètre fonctionnel

Identifiants `EXF-AN-NN` (fonctionnel) et `EXT-AN-NN` (technique). **Partie A** = le moteur
(lots A1, A2, A4, A5) ; **Partie B** = le réseau public ANTSIA (lots A3, A4, A6).

### Partie A — Le moteur

#### M-A1 — Réseaux, adhésions, facettes

- **EXF-AN-01** Table `networks` (slug, kind, parentId, politique, visibilité par défaut,
  schéma de facette, portées, pays ouverts, thème, état) ; création et modification par la
  console ; aucune suppression (archivage).
- **EXF-AN-02** `joinNetwork(networkId)` : applique la politique, crée l'adhésion au statut
  d'entrée, la facette si fournie, l'adhésion dérivée à la racine ; `leaveNetwork` ;
  `suspend` (sanction) ; invariants testés.
- **EXF-AN-03** `requireMembership(networkId, minStatus)` : garde unique de toute fonction
  sociale ; refus indistinct ; cliquet de code.
- **EXF-AN-04** Facettes par réseau avec visibilités par champ ; projections allowlistées.

#### M-A2 — Personnes, identités, badges, consentements

- **EXF-AN-05** `persons` : handle unique (3 à 30 caractères, suggestions `prenom.nom`),
  nom affiché (jamais recopié d'un état civil sans geste), accroche, avatar, couverture, mode
  privé, dépublication, suppression.
- **EXF-AN-06** `identityLinks` : `idn` (sub, `loa`, `nationality`, date), `local` (e-mail ou
  téléphone vérifié), `administration` (sub IDN confirmé par le socle, orgSlug public, date),
  `consular_attestation` (empreinte, pays, poste, date) ; un lien par fournisseur et par
  personne ; révocation.
- **EXF-AN-07** Badges calculés (`computeBadges(person)`), exposés dans toutes les projections
  ; jamais stockés comme vérité.
- **EXF-AN-08** `consents` : finalité, version du texte, horodatage, origine, révocation ; lu
  avant toute action qui le requiert (attestation, annuaire, notifications, talents).
- **EXF-AN-09** Authentification : Better Auth du moteur, IDN via `@idn-ga/better-auth` (PKCE,
  `/userinfo`), codes à usage unique e-mail (Resend) et SMS, plugins `crossDomain` et jeton à
  usage unique pour passer d'une application à l'autre, `signOutEverywhere`, sessions 7 jours,
  jamais de mot de passe.

#### M-A3 — Publications et fil (hérité, étendu)

- **EXF-AN-10** Publications héritées (texte 2 000 caractères, 10 images — 4 avant le lot M3 du
  25/11/2026 — ou 1 vidéo seule, avec texte alternatif, partage cité, hashtags, mentions,
  audience, idempotence, édition, retrait, épinglage) + `networkId`, `visibility ∈ {network, root}`, `country?`, `reach?`.
- **EXF-AN-11** Réactions (4 genres), commentaires à un niveau de réponse (paginés — le socle
  rend les 100 plus anciens sans pagination : à corriger), relais, signets, masquage,
  sourdine, signalement (6 motifs puis extensibles).
- **EXF-AN-12** Fils : par réseau (« Pour vous », « Récents », portées du réseau) ; **fil
  racine** d'ANTSIA = contenus natifs d'`antsia` + contenus `root` de tous les réseaux + reflets
  fédérés, avec pastille d'origine ; **fil matérialisé** (palier 2 décidé dans le socle et
  jamais fait) dès que le réseau dépasse le seuil de sources ; fenêtre de balayage, plafonds de
  sources, connexions et abonnements rendus configurables.
- **EXF-AN-13** Compteurs fragmentés (réactions, commentaires, partages, vues de stories) ;
  aucune écriture de compteur sur le document chaud ; aucune agrégation à la lecture.

#### M-A4 — Graphe

- **EXF-AN-14** Connexions symétriques (demande, acceptation, refus, blocage silencieux dans
  les deux sens), abonnements unilatéraux, sourdines, « ne plus proposer » ; plafonds
  configurables (le socle plafonne à 200 connexions en levant une erreur : à remplacer par la
  pagination).
- **EXF-AN-15** Suggestions par réseau (facettes communes, relations communes, pages suivies)
  ; recherche de personnes bornée au réseau ; contrôle de découvrabilité sur l'API brute de
  demande de connexion (manque relevé dans le socle).

#### M-A5 — Pages

- **EXF-AN-16** `pages` : `ownerKind ∈ {institution, association, company, media, community}`,
  `trust ∈ {official, verified, community}`, `networkId`, `country?`, handle, identité
  (nom, logo, description) **propre à la page** (le socle dérive l'identité d'`orgs` : à
  découpler), signataires et administrateurs, abonnés, publications de page, découverte.
- **EXF-AN-17** `pageClaims` : revendication avec preuves (fichiers admis), instruction par un
  modérateur, décision tracée ; une page `official` n'est pas revendicable.
- **EXF-AN-18** Publication au nom d'une page : rôle de signataire vivant ; audience `public`
  ou `followers` ; visibilité `network` ou `root` selon la règle de la page.

#### M-A6 — Groupes, évènements, stories, albums (hérités)

- **EXF-AN-19** Groupes thématiques découvrables (mur `group`, rôles, invitations,
  épingles) et groupes de conversation (1 000 membres, pièces jointes, vocaux, réactions,
  liens d'invitation) ; admissibilité = adhésion au réseau et statut suffisant (plus de
  catégorie agent/citoyen) ; diffusion des notifications par lots (le socle notifie tous les
  membres dans la même transaction : à corriger).
- **EXF-AN-20** Évènements (agenda, invitations, réponses, iCal, annonce) + extension
  `eventRegistrations` (capacité, liste d'attente, QR) + `organizerKind`.
- **EXF-AN-21** Stories 24 h (surfaces `feed`, `messaging`), albums (60 photos, EXIF
  retiré) ; garde de délivrance appliquée (le socle la contourne pour stories, albums,
  avatars : à corriger).

#### M-A7 — Messagerie, appels, direct (hérités, allégés)

- **EXF-AN-22** Messagerie 1:1 entre relations (scope personnel seul ; plus d'ancrage sur les
  postes ni de fils institutionnels), groupes, pièces jointes, vocaux, 6 réactions, édition et
  suppression 15 min, accusés de lecture 1:1, « écrit… », recherche, transfert.
- **EXF-AN-23** Appels audio et vidéo LiveKit 1:1 et de groupe (≤ 11), présence des relations
  (sans organisation : battement par personne), sonnerie, push ; **verrous « agent » levés**
  côté serveur (un membre peut appeler un membre ; un appel de groupe ad hoc n'exige pas
  d'organisation) ; pas d'enregistrement des appels ; messagerie vocale héritée.
- **EXF-AN-24** Direct : sessions en direct d'une page ou d'un membre habilité par le réseau,
  antenne (8), spectateurs (200, plafond 1 000), chat, rediffusion 90 jours, consentement à
  l'enregistrement, modération d'antenne.
- **EXF-AN-25** Carte « téléphone » unique (format à trancher : 390 × 844 ou 440 × 956) ; dock
  ancré au bureau ; pages pleines sous 960 px.

#### M-A8 — Notifications

- **EXF-AN-26** Cloche héritée (16 genres, dédoublonnage, aucun contenu dans la notification,
  rétention 180/365 jours **active**), étendue aux évènements de réseau (adhésion, badge,
  décision de modération).
- **EXF-AN-27** Push Web, Expo, FCM, APNs pour les évènements sociaux (le socle ne pousse que
  les appels) ; préférences par catégorie ; plafond hebdomadaire ; digest par e-mail.

#### M-A9 — Modération à l'échelle

- **EXF-AN-28** `reports` polymorphes : publication, commentaire, message de groupe,
  évènement, page, annonce, offre, profil, direct ; motifs extensibles ; masquage pour le
  déclarant.
- **EXF-AN-29** `moderationTeams(networkId, scope?)` ; files par équipe puis par réseau puis
  plateforme (appel) ; décisions motivées ; `sanctions` graduées (avertissement, retrait,
  sourdine, suspension, exclusion) avec durée ; `appeals` ; journal d'audit ; rapport
  périodique.
- **EXF-AN-30** Relecture (`pending_review`) configurable par réseau et par surface ; mots
  bloqués ; détection simple de spam (fréquence, liens) ; **limitation de débit** sur toutes
  les écritures sociales et les URL de dépôt (composant rate-limiter ; le socle n'en a presque
  pas).

#### M-A10 — Fichiers

- **EXF-AN-31** Admission unique par blob (type et taille réels relus, fraîcheur, Sentinelle
  antivirus par adaptateur, quarantaine), **garde de délivrance fail-closed partout** (médias,
  avatars, couvertures, stories, albums, pièces jointes, logos de page), purge des
  téléversements orphelins, rétention par type.

#### M-A11 — Données personnelles

- **EXF-AN-32** Export de ses données ; **effacement effectif de toutes les tables sociales
  et des blobs** (le socle n'efface aucune table sociale) ; « compte supprimé » sur les
  citations ; délais et confirmation.
- **EXF-AN-33** Annuaire opt-in par niveau et par réseau ; aucune coordonnée exposée ; contact
  par messagerie.
- **EXF-AN-34** Journal d'accès aux fonctions sensibles (console, badges manuels,
  fédération).

#### M-A12 — Recherche et découverte

- **EXF-AN-35** Index plein texte (publications, personnes, groupes, pages) avec formes sans
  accents, bornés par réseau ; hashtags et tendances par réseau et par période ; suggestions.

#### M-A13 — Fédération entrante

- **EXF-AN-36** Passerelle `federation` : inbox HTTP signée (clé par émetteur et par
  environnement), reçus idempotents, lettres mortes, rejeu audité (patrons des tables
  `federationInboxReceipts` du socle) ; contrats versionnés dans `docs/contrats/`.
- **EXF-AN-37** Contrat `RESEAU-PUBLIC-V1` (socle → moteur) : `page.upserted` (administration
  vérifiée, page active) → page `institution/official` dans le réseau `administration` avec
  reflet `root` ; `post.published` / `post.removed` (publication de page d'audience `public`
  marquée « publier aussi sur ANTSIA ») → reflet en lecture seule ; `person.optin` /
  `person.optout` → lien `administration` + adhésions `administration` et `antsia`. Aucun flux
  retour en V1.
- **EXF-AN-38** Contrats DIASPORA.GA (`DIASPORA-ATTESTATION-V1` sortant, `DIASPORA-COMMUNAUTE-V1`
  entrant) : portés par la tranche `diaspora` (cahier DIASPORA.GA), sur la même passerelle.

#### M-A14 — Console du moteur (`admin_antsia_ga`)

- **EXF-AN-39** Réseaux (créer, politique, pays, thème, archiver), équipes de modération et
  files d'appel, fédération (émetteurs, clés, reçus, lettres mortes, rejeu), badges manuels
  tracés, incidents et journal, exports agrégés (seuils anti-réidentification), santé du
  déploiement.
- **EXF-AN-40** Comptes d'opérateur : IDN obligatoire, `loa ≥ 2`, rôles explicites, double
  validation pour les actes irréversibles.

#### M-A15 — Contrats pour les applications

- **EXF-AN-41** Paquets : `@antsia/social-domain` (TS pur : règles de visibilité, éligibilité,
  badges, validation des contenus), `@antsia/social-contracts` (types et modules purs partagés
  front/back : médias, pièces jointes, capacités, schémas), `@antsia/api` (client Convex +
  TanStack, hooks authentifiés, `NetworkProvider`, `useNetwork`, routage paramétré),
  `@antsia/social-features` (surfaces : fil, composeur, profil, relations, groupes, évènements,
  pages, albums, stories, notifications, messagerie, appels, direct, modération), `@antsia/ui`
  (primitives et jetons ; `data-charte` par application).
- **EXF-AN-42** Aucune URL codée en dur : toutes les routes passent par l'adaptateur de
  routage de l'application ; aucune clé de stockage client sans préfixe de réseau.
- **EXF-AN-43** i18n dès le départ (fr, en ; toute chaîne par clé), fuseau horaire par
  personne (facette ou préférence), formats de date et de nombre localisés.

### Partie B — Le réseau public ANTSIA (`antsia_ga`)

- **EXF-AN-44** Vitrine publique `/` : ce qu'est ANTSIA, comment on entre, les réseaux qui le
  composent, compteurs matérialisés (jamais en dur), textes légaux.
- **EXF-AN-45** Entrée : IDN affichée en premier, compte léger ; onboarding (handle, nom
  affiché, consentements, préférences) ; parcours d'élévation vers IDN.
- **EXF-AN-46** Fil racine : natifs `antsia`, `root` des réseaux enfants (pastille « Diaspora »,
  « Administration »), reflets fédérés ; portées « Pour vous », « Récents », « National »,
  par province (facette optionnelle `province`, référentiel des 9 provinces) ; tendances.
- **EXF-AN-47** Profils publics, relations, abonnements, suggestions, groupes, évènements,
  stories, albums, messagerie, appels, directs — hérités du moteur dans la charte ANTSIA.
- **EXF-AN-48** Pages : institutions (reflets « Officiel » des administrations vérifiées et des
  postes consulaires), associations, entreprises, médias ; revendication ; abonnement ;
  publication de page.
- **EXF-AN-49** Lecture anonyme : les pages `official` et leurs publications `root`, les
  profils publics en projection réduite et les contenus `root` d'audience publique sont
  lisibles sans compte (référencement, partage) ; tout le reste exige une adhésion ;
  arbitrage A4 (§20).
- **EXF-AN-50** « Publier aussi sur ANTSIA » depuis DIASPORA.GA (et, par fédération, depuis le
  socle) ; l'auteur voit où sa publication est lue ; la retirer la retire partout.
- **EXF-AN-51** Modération nationale : équipe `antsia`, équipes thématiques, files, sanctions,
  recours ; transparence (rapport public périodique, agrégé).
- **EXF-AN-52** Monétisation (lot A6, décisions) : pages d'entreprises premium, contenus
  sponsorisés **étiquetés**, jamais dans la messagerie, densité plafonnée ; le citoyen ne
  paie jamais ; Gabaos (unité de crédit du programme) si le propriétaire le retient.
- **EXF-AN-53** Application mobile ANTSIA (lot ultérieur, après DIASPORA.GA mobile) : même
  socle Expo que DIASPORA.GA, thème ANTSIA.

### Hors périmètre initial

Migration de l'iRéseau du socle sur le moteur ; flux retour ANTSIA → socle ; fédération
ActivityPub ou autres réseaux externes ; publicité programmatique ; traduction automatique ;
paiements (hors A6) ; API publique pour des tiers (une décision ultérieure, sur projections).

## 9. Parcours de référence

- **R1 — Entrée IDN.** Étant donné une personne avec une identité IDN `loa 2` ; quand elle
  se connecte sur antsia.ga, choisit son handle et consent ; alors elle est `declaree` et
  `verifiee` dans `antsia`, badge Vérifié, fil racine affiché.
- **R2 — Compte léger.** Étant donné un numéro gabonais ; quand la personne entre par SMS ;
  alors elle est `declaree` (ANTSIA est ouvert), badge Communauté, bannière d'élévation IDN.
- **R3 — Inclusion.** Étant donné un membre de DIASPORA.GA ; alors il est membre d'`antsia`
  (`derivedFrom: diaspora-ga`) sans aucun geste ; son handle et son profil sont les mêmes.
- **R4 — Contexte séparé.** Étant donné une publication `network` dans DIASPORA.GA ; alors
  aucune query d'`antsia_ga` ne la rend ; quand l'auteur la marque `root` ; alors elle apparaît
  dans le fil racine avec la pastille Diaspora et reste dans DIASPORA.GA ; quand il la retire ;
  alors elle disparaît des deux.
- **R5 — Reflet d'une administration.** Étant donné une administration vérifiée du socle dont
  la page est active ; quand le socle émet `page.upserted` ; alors ANTSIA a une page Officiel,
  non revendicable ; quand le socle émet `post.published` pour une publication publique
  marquée « aussi sur ANTSIA » ; alors elle est lue dans le fil racine en lecture seule ; une
  note de service n'arrive jamais.
- **R6 — Agent volontaire.** Étant donné un agent qui, depuis son espace, choisit d'apparaître
  dans ANTSIA ; quand le socle émet `person.optin` ; alors la personne (identifiée par son
  `idnSub`) porte le lien `administration`, le badge Agent public, et les adhésions
  `administration` et `antsia` ; quand elle se connecte sur antsia.ga par IDN ; alors c'est la
  même personne.
- **R7 — Modération.** Étant donné un contenu signalé par cinq membres ; alors il est masqué
  pour eux, entre dans la file ; quand l'équipe le retire et suspend l'auteur ; alors
  l'auteur est prévenu, peut faire recours ; l'audit est écrit ; la suspension vaut dans tous
  les réseaux.
- **R8 — Charge.** Étant donné un membre avec 5 000 abonnés et une publication à 10 000
  réactions ; alors aucun conflit d'écriture (compteurs fragmentés) et le fil des abonnés se
  met à jour depuis le fil matérialisé en moins de 1,5 s (p95).
- **R9 — Effacement.** Étant donné une demande d'effacement ; alors toutes les tables sociales
  et les blobs sont purgés ; les reflets fédérés de la personne (opt-in) sont retirés ; le
  socle est informé par un évènement de fin (V2).
- **R10 — Cliquet.** Étant donné une nouvelle fonction publique sociale sans
  `requireMembership` ou sans `networkId` ; alors le cliquet de test échoue.

## 10. Surfaces attendues

### 10.1 `apps/antsia_ga` (Next.js 16)

| Route | Contenu |
|---|---|
| `/` | vitrine publique, entrée |
| `/entrer`, `/bienvenue` | portes, onboarding |
| `/fil` | fil racine et volets (`?tab=` relations, groupes, pages, evenements, directs, tendances) |
| `/@[handle]`, `/@[handle]/albums/[id]` | profils, albums |
| `/pages/[handle]` | pages (reflets Officiel, associations, entreprises, médias) |
| `/groupes`, `/evenements`, `/actus`, `/direct/[id]`, `/messages/*` | hérités |
| `/decouvrir`, `/tags/[tag]`, `/provinces/[slug]` | découverte, tendances, provinces |
| `/parametres`, `/parametres/donnees` | profil, préférences, consentements, données |
| `/moderation` | équipes (rôle) |
| `/a-propos`, `/mentions-legales`, `/confidentialite`, `/transparence` | textes, rapport de modération agrégé |

### 10.2 `apps/admin_antsia_ga` (console)

Réseaux, équipes, files d'appel, fédération, badges manuels, incidents, journal, santé.

### 10.3 Coque légère (remplace AppShell)

Providers (Convex, TanStack, Better Auth, i18n, thème, PostHog), adaptateur de routage,
`NetworkProvider`, chrome iRéseau (rail, onglets, coquille mobile), cloche, dock iCom,
`CommunicationLayer` (hôte d'appel global, salle de direct), charte par `data-charte`.
Le cycle `espace-personnel ↔ reseau-personnel` du socle est cassé.

## 11. Modèle de données (tables du moteur)

| Domaine | Tables | Champs clés |
|---|---|---|
| Réseaux | `networks` | slug, kind, parentId, membershipPolicy, defaultVisibility, facetSchema, reachValues, openCountries, theme, status |
| Personnes | `persons`, `identityLinks`, `networkMemberships`, `personFacets`, `consents`, `handleHistory` | handle unique ; liens par fournisseur ; statut, rôle, `derivedFrom`, `verifiedBy` ; facettes par réseau ; consentements versionnés |
| Contenus | `posts`, `postReactions` (+ `postReactionShards`), `postComments`, `postMarks`, `mutes`, `stories`, `storyViews`, `albums`, `albumItems`, `postAggregates` | `networkId`, `audience`, `visibility`, `country?`, `reach?`, `pageId?`, `groupId?`, `eventId?`, `liveSessionId?` |
| Fil | `feedEntries` (fil matérialisé), `feedCursors` | personne × réseau × portée, score, `publishedAt` |
| Graphe | `connections`, `follows`, `suggestionDismissals`, `blocks` (dérivés de `connections.status`) | paire canonique, statut |
| Pages | `pages`, `pageFollows`, `pageSignatories`, `pageClaims`, `pageIdentityHistory` | ownerKind, trust, networkId, country, handle |
| Groupes | `thematicGroups`, `thematicGroupMembers`, `thematicGroupInvites`, `groupThreads`, `groupMembers`, `groupInvites`, `groupInviteLinks`, `groupMessages`, `groupMessageReactions`, `groupTyping` | `networkId`, `country?` |
| Évènements | `events`, `eventParticipants`, `eventRegistrations` | organizerKind, capacité, liste d'attente |
| Messagerie et appels | `chats` (personnel seul), `chatMessages`, `chatMessageReactions`, `chatTyping`, `unreadTotals`, `calls`, `callInvites`, `callPreferences`, `voicemails`, `presence` | plus de `posteA/posteB`, plus d'`orgId` |
| Direct | `live_*` (sessions, antenne, spectateurs, demandes, invitations, exclusions, commentaires, réactions, présence) | `networkId`, `pageId?` |
| Notifications | `notifications`, `pushSubscriptions`, `notificationPreferences` | dedupKey, rétention |
| Modération | `reports`, `moderationTeams`, `moderationTeamMembers`, `sanctions`, `appeals`, `blockedTerms`, `moderationAudit` | polymorphes, périmètre |
| Fichiers | `fileScans`, `uploadTickets`, `fileRetention` | admission, verdict, rétention |
| Fédération | `federationEmitters`, `federationInboxReceipts`, `federationDeadLetters`, `federationReplayAudit`, `mirrors` (objet reflété → objet local) | clé, version, idempotence |
| Diaspora (tranche DIASPORA.GA) | `countryHubs`, `sponsorships`, `consularAttestations`, `communityImports`, V2 : `jobPostings`, `jobApplications`, `jobAlerts`, `classifieds`, `mentorships` | voir cahier DIASPORA.GA |
| Plateforme | `operators`, `operatorAudit`, `networkSettingsHistory` | IDN `loa ≥ 2` |

Règles : `schemaValidation: true` (le socle l'a désactivée) ; validateurs précis ; index
`by_network_*` ; compteurs fragmentés ; pas de `.collect()` non borné (cliquet) ; migrations
par `@convex-dev/migrations` avec répétition sur instantané.

## 12. Autorisation et visibilité

1. Résolution : session → `person` → `networkMemberships[networkId]` → statut → limitation de
   débit → droit sur la ressource. Fonctions `authQuery`/`authMutation` du moteur ; jamais
   d'identité prise dans les arguments.
2. Visibilité d'une publication : prédicat pur hérité (`isPersonalPostVisibleTo`) étendu :
   `removed` → auteur seul ; `visibility network` → membre du réseau requis ; puis audience
   héritée (`public` pour tous les membres, `connections`, `group`, `page`) ; `root` → lisible
   par les membres de la racine selon l'audience, et par un anonyme si la page ou le réseau le
   permet (EXF-AN-49).
3. Blocage : dans les deux sens, l'emporte sur `public`.
4. Pages : signataire vivant pour publier ; `official` non revendicable ; `trust` calculé.
5. Modération : compétence = équipe du réseau et du périmètre du contenu ; appel au niveau
   supérieur ; opérateur plateforme en dernier ressort, tracé.
6. Refus indistinct partout ; aucune donnée d'identité externe dans les erreurs.

## 13. Interopérabilité

| Contrat | Sens | Mécanique |
|---|---|---|
| **IDN OIDC** | identite.ga → moteur | clients `antsia` et `diaspora-ga` au portail développeur (sandbox puis production) ; callback par application ; SDK `@idn-ga/better-auth` ; scopes `openid profile email` (+ `idn:civil_status` si retenu) ; consentement sur identite.ga |
| **`RESEAU-PUBLIC-V1`** | socle → moteur | outbox signée côté socle (déclarée dans `config/v4.4/flows.json`, package de contrat, ADR socle), inbox du moteur, idempotence, lettres mortes, rejeu ; objets : `page.upserted`, `post.published`, `post.removed`, `person.optin`, `person.optout` ; références métier publiques, jamais d'identifiant interne |
| **`DIASPORA-ATTESTATION-V1`**, **`DIASPORA-COMMUNAUTE-V1`** | moteur ↔ consulat.ga | voir cahier DIASPORA.GA §13 ; même passerelle |
| Webhooks IDN | identite.ga → moteur | révocation, changement d'adresse, suppression d'identité (V2) |
| Projections publiques | moteur → tiers | V3 : API de lecture de projections allowlistées (pages Officiel, agrégats), décision ultérieure |

Règles : contrats versionnés dans `docs/contrats/` du moteur et du socle ; types copiés chez
le consommateur ; clés par environnement ; aucun client Convex croisé ; aucune lecture de base
externe.

## 14. Exigences non fonctionnelles

- **EXT-AN-01 Performance** : p95 < 1,5 s au premier rendu du fil sur 3G ; fil matérialisé,
  compteurs fragmentés, pagination partout, index composés ; mesure continue (Convex insights,
  PostHog).
- **EXT-AN-02 Sécurité** : autorisation serveur seule, limitation de débit, admission et
  garde de délivrance fail-closed, CSP à nonce, secrets par environnement, rotation, revue
  d'autorisation avant chaque lot, `schemaValidation: true`, journal des actes sensibles.
- **EXT-AN-03 Données** : loi n° 001/2011 modifiée par la loi n° 025/2023 (APDPVP), RGPD pour
  les résidents de l'UE ; dossier APDPVP du moteur et de chaque réseau ; analyse d'impact ;
  minimisation ; export et effacement effectifs ; hébergement Convex (région UE si disponible)
  déclaré honnêtement.
- **EXT-AN-04 Accessibilité** : WCAG 2.1 AA ; `web-design-guidelines` avant livraison ;
  vérification réelle dans Chrome.
- **EXT-AN-05 Langues et formats** : i18n (fr, en) ; fuseau par personne ; aucune chaîne en
  dur (cliquet).
- **EXT-AN-06 Mobile-first** : 375 px de référence ; bascule 960 px ; Expo pour les
  applications mobiles.
- **EXT-AN-07 Observabilité** : PostHog UE, journal d'audit, tableaux de modération et de
  fédération, alertes, rapport de transparence agrégé.
- **EXT-AN-08 Qualité** : tests portés avec le code ; cliquets (réseau borné, aucun import
  inter-produit, charte, i18n, `.collect()`, `v.any()`, communication publique) ; parité
  prouvée ; `bun run verify` vert avant toute publication.
- **EXT-AN-09 Exploitation** : un projet Convex (dev, prod), publication du backend avant
  les fronts depuis une copie propre, Cloud Run (Cloud Build) ou Vercel sur décision,
  domaines, sauvegardes et exercice de restauration, budget et coupure.
- **EXT-AN-10 Évolutivité** : créer un réseau sans déployer de backend ; ajouter une
  application en déclarant un espace de travail externe et une entrée de catalogue.

## 15. Design et charte

- **Squelette hérité** : grille du fil et rails, onglets chemise, composeur en feuille,
  coquille mobile, cartes flottantes, format téléphone, dock iCom — dupliqués avec le code
  dans `social-features`.
- **Jetons par application** (`data-charte`) : `antsia`, `diaspora-ga`, `admin-antsia` ; aucune
  couleur littérale ; cliquet de charte. Les jetons d'ui-v2 arrivent **élagués** des jetons de
  l'administration (`--status-*`, `--paper-*`, `--flag-*`, `--public-*`) et des pièces de
  marque (RepublicBar, Logo « .ga », AppHeader, `Poste*`).
- **Direction artistique d'ANTSIA** : à arrêter par une passe `frontend-design` avant la
  première ligne d'interface du lot A3 ; candidates du programme : `vert-souverain` (identité
  nationale), la charte Personnel « parchemin » de l'espace agent (continuité), ou une
  déclinaison propre ; les couleurs du drapeau restent décoratives ; `tricolore` montre
  comment une charte porte plusieurs marques par `[data-theme]`. Arbitrage A8.
- **Console** : charte `papier-encre` ou `marianne` (back-offices du programme).
- **Un seul format téléphone** (A6 du cahier DIASPORA.GA) pour toutes les applications.

## 16. Lots

### Lot A0 — Cadre (propriétaire, juriste)

Nom et domaine ; validation de l'architecture ; dépôt cible `administration-ga/antsia` (attribution par le propriétaire) ; projet
Convex `antsia` (équipe, budget) ; projet d'hébergement ; clients OIDC IDN (sandbox) ; dossier
APDPVP et analyse d'impact ; arbitrages A1–A10. **Sortie :** décisions écrites dans ce cahier
(§20).

### Lot A1 — Moteur, noyau (M-A3 à M-A7 hérités, M-A10, M-A15 partiel)

Scaffold du monorepo (bun, Turborepo, Convex, Better Auth, Next 16, Expo plus tard) ;
inventaire contradictoire de duplication sur `origin/main` (owner map, iAppel compris) ;
paquets `social-domain` et `social-contracts` ; **fondations multi-réseaux d'abord**
(`networks`, `persons`, `identityLinks`, `networkMemberships`, `personFacets`,
`requireMembership`, cliquet) ; duplication du noyau backend avec `networkId` (profils,
publications, réactions, commentaires, abonnements, connexions, cloche, signets, stories,
albums, groupes, évènements, pages génériques, messagerie personnelle, appels avec verrous
levés, direct, fichiers) ; tests portés ; console minimale. **Sortie :** parité prouvée
module par module ; deux réseaux de test étanches ; typecheck, tests, lint verts ; aucun
import inter-produit.

### Lot A2 — Moteur, identité, modération, données, fédération (M-A1, M-A2, M-A8, M-A9, M-A11, M-A13, M-A14)

IDN relying party et comptes légers ; liens d'identité et badges ; consentements ; limitation
de débit ; modération à l'échelle ; effacement RGPD ; push social ; passerelle de fédération
(inbox) ; console complète ; `social-features` (front dupliqué, coque légère, i18n, charte par
jetons). **Sortie :** R1, R2, R7, R9, R10 joués ; cliquets verts ; la console crée un réseau
sans déploiement.

> DIASPORA.GA D1 s'exécute **ici** (après A2, avant A3) : c'est le premier réseau réel du moteur.

### Lot A3 — ANTSIA public V1 (Partie B, M-A12)

Direction artistique ; application `antsia_ga` : vitrine, entrée, fil racine (natifs + `root`
+ reflets), profils, pages, groupes, évènements, stories, albums, messagerie, appels, direct,
découverte ; lecture anonyme des projections décidées ; modération nationale ; textes légaux.
**Sortie :** R1 à R4, R7 joués ; mise en ligne vérifiée sur antsia.ga.

### Lot A4 — Découverte et échelle (M-A12, EXF-AN-12/13)

Fil matérialisé en production, compteurs fragmentés mesurés, tendances, suggestions
nationales, observabilité, exercice de restauration, rapport de transparence. **Sortie :**
R8 joué sous charge simulée ; p95 tenu ; files < 48 h sur quatre semaines.

### Lot A5 — Fédération de l'administration (M-A13, EXF-AN-37 ; côté socle : ADR, outbox, drapeau, opt-in)

Contrat `RESEAU-PUBLIC-V1` des deux côtés ; pages Officiel des administrations vérifiées ;
publications marquées « aussi sur ANTSIA » ; opt-in des agents. **Sortie :** R5 et R6 joués ;
une note de service ne sort jamais (test) ; ADR socle écrit et accepté.

### Lot A6 — Monétisation et gouvernance (EXF-AN-52, décisions)

B2B étiqueté ; Gabaos si retenu ; conditions d'utilisation ; gouvernance des réseaux
(conventions avec les porteurs de réseaux fermés). **Sortie :** doctrine tenue ; premiers
revenus mesurés ; conventions signées.

## 17. Critères de recette transverses et Definition of Done

- Cliquets verts : réseau borné, aucun import inter-produit, charte, i18n, `.collect()`,
  `v.any()`, communication publique, aucune URL codée en dur.
- Deux réseaux de test étanches ; adhésion dérivée ; `root` exige `public` ; retrait propagé.
- Badges calculés : aucun champ déclaratif ne les porte (test de schéma).
- Chaque module dupliqué : provenance, tests portés, parité cochée.
- Effacement : toutes les tables sociales et les blobs (test) ; reflets de personne retirés.
- Limitation de débit sur toute écriture (test de contrat) ; garde de délivrance partout.
- Accessibilité AA ; `web-design-guidelines` sans défaut bloquant ; vérification réelle.
- Mise en ligne vérifiée après coup (révision servie = commit) et rapportée ; mémoire du
  programme mise à jour.

## 18. Hors périmètre initial

Voir §8 « Hors périmètre initial ». S'y ajoutent : toute lecture des bases du socle ou de
gabon-diplomatie ; la modération des contenus du socle depuis ANTSIA ; une seconde carte
téléphone.

## 19. Risques et mesures

| Risque | Mesure |
|---|---|
| Duplication qui dérive (deux réseaux sociaux à maintenir) | provenance fichier par fichier ; rapport de parité ; portage des correctifs par décision ; le socle reste la référence de l'administration, le moteur celle du public |
| Verrous « agent » du socle oubliés dans les appels, la présence, les groupes | liste explicite dans l'owner map (PA1) ; tests « un membre appelle un membre » |
| Dette héritée (compteurs chauds, fil à la lecture, garde contournée, plafond à 200, `listComments` sans pagination, `schemaValidation` off) | corrigée dans le moteur dès A1–A2 ; signalée au socle |
| Fuite de contexte | `networkId` + cliquet + refus indistinct |
| Réseau public vide | DIASPORA.GA d'abord (membres dérivés), reflets des administrations, pages Officiel, lancement avec contenus réels |
| Modération d'un réseau national | équipes avant ouverture, relecture configurable, limitation de débit, détection de spam, rapport de transparence |
| Coût Convex | un projet pour toutes les applications ; fil matérialisé pour éviter les lectures répétées ; budget et coupure du propriétaire |
| Nom et domaine | jeton unique ; vérification du domaine avant communication |
| Dépendance au monorepo (`file:` / workspaces externes) | documentée ; paquets publiables plus tard |

## 20. Décisions à valider (arbitrages)

| # | Question | Recommandation | Appliqué par défaut à l'exécution (14/10/2026, en attente de décision) |
|---|---|---|---|
| A1 | Nom et domaine | ANTSIA, `antsia.ga` | **ANTSIA confirmé par le propriétaire le 16/10/2026** (jeton unique `BRAND_NAME`) ; `antsia.ga` cible, attribution et configuration par le propriétaire |
| A2 | Le moteur vit dans le dépôt ANTSIA ; DIASPORA.GA en est une application | oui | oui (ADR-0001 proposé) |
| A3 | Ouverture d'ANTSIA | toute personne, badges visibles ; politique modifiable sans code | politique `open` du réseau racine |
| A4 | Lecture anonyme | pages Officiel, leurs publications `root`, profils publics réduits, contenus `root` publics ; tout le reste exige une adhésion | la recommandation (PA8) |
| A5 | Équipe Convex, hébergement, budget | à décider par le propriétaire (équipe Convex du programme ; Cloud Run ou Vercel) | **non tranché** : développement sur déploiement Convex local anonyme ; aucune publication |
| A6 | Format téléphone | 440 × 956, plancher 375 | 440 × 956 (PA6) |
| A7 | Fédération du socle : qui marque « aussi sur ANTSIA » | le signataire de la page, au moment de publier ; jamais par défaut | la recommandation (PA9) |
| A8 | Direction artistique ANTSIA | passe `frontend-design` ; candidates `vert-souverain`, « parchemin », déclinaison propre | charte de base « parchemin » jusqu'à la passe `frontend-design` (PA8) |
| A9 | Monétisation | aucune en A3 ; A6 B2B étiqueté ; Gabaos à décider | aucune |
| A10 | Formalités | dossier APDPVP et analyse d'impact dès A0 ; textes légaux par un juriste | **non tranché** : aucune mise en ligne publique sans eux |

## 21. Références

- Plan de pilotage et annexes : `Documentation/RESEAUX_SOCIAUX/`.
- Cahier DIASPORA.GA : `ECOSYSTEMES/DIASPORA_GA/docs/00_CAHIER_DES_CHARGES_DIASPORA_GA.md`.
- Socle : `ADMINISTRATION_GA/socle/convex/modules/{reseauPersonnel,reseau,reseauPages,reseauAlbums,icom,direct,iappel,messagerieScope,fileGuard}`,
  `functions/{chats,meetings}.ts`, `lib/{notify,livekit*,uploadPolicy}.ts`, `actions/{push,livekit*}.ts` ;
  `socle/packages/agent-features/src/features/{reseau-personnel,reseau-albums,messagerie,iappel,direct,stories,notifications}`,
  `socle/packages/{ui,ui-v2,api,routing,livekit,chat}` ; ADR 0023, 0043, 0045, 0047, 0073, 0074,
  0079, 0080, 0082, 0083, 0087, 0094–0096, 0123, 0138, 0145, 0148, 0149, 0150, 0158, 0160, 0161,
  0162, 0165, 0167, 0177, 0180, 0191, 0217.
- Doctrine : `REORGANISATION_ADMINISTRATION_GA_RESEAU_SOCIAL_2026-07-29.md`,
  `DOCTRINE_ACCES_ACQUISITION_RESEAU_SOCIAL.md`, `DOCTRINE_COMMUNICATION_PUBLIQUE.md`,
  `07_Architecture_Plateforme_V5/05_LOGIQUE_DE_CONNEXION_ET_CONTRATS.md` (§8 esquisse iRéseau).
- PRO.GA : `docs/11` (dix règles), `docs/12` (owner map), `docs/14` (parité), `pro-domain/src/social-network.ts`.
- identite.ga : `docs/adr/0001-oidc-architecture.md`, SDK `@idn-ga/better-auth`, portail développeur.
- Contrats : `NTSAGUI_DIGITAL/CONTRATS/` (schémas EventEnvelope, Outbox/Inbox, BusinessRef ; gabarit d'application).
- Chartes : `DESIGN_SYSTEMS/{vert-souverain,gabon-connect,marianne,papier-encre,tricolore}.md`.
- Droit : loi n° 001/2011 modifiée par la loi n° 025/2023 (APDPVP) ; RGPD.

*Fin du cahier des charges ANTSIA — version 1.0 du 14 octobre 2026.*
