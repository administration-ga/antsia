# Plan directeur de finalisation d'ANTSIA

> Établi le 9 novembre 2026, par lecture de tous les documents du projet et du code d'`origin/main` (ANTSIA `26741caa`, DIASPORALE `bead76d`). Rien n'a été exécuté : ni test, ni recette, ni publication.
> Les seize plans par fonctionnalité de ce dossier comparent ANTSIA à ses applications de référence, de mémoire (état des produits à la mi-2026), sans revérification en ligne.

> **Publié dans le dépôt sur décision du propriétaire, le 9 novembre 2026.** Ce dossier décrit des faiblesses encore ouvertes d'un service en ligne (§ 3.2), et le dépôt est public : les lots de la vague 1 qui les ferment passent avant tout le reste (§ 5).

## 0. L'essentiel en une page

**Le constat.** ANTSIA est large et solidement construit. D'après le décompte des seize plans, sur 881 capacités comparées aux applications de référence, 409 existent, 156 existent en partie, 271 manquent et 45 sont fermées volontairement. Pourtant le réseau n'est pas prêt à ouvrir, pour cinq raisons.

| # | Raison | Exemple vérifié dans le code |
|---|---|---|
| 1 | Des fonctions existent au serveur mais n'ont pas d'écran dans ANTSIA | On ne peut ni bloquer une personne, ni écouter un message vocal, ni signaler un message à deux |
| 2 | La boucle du commerce ne se ferme pas | Aucun achat ne peut aboutir ; devis, rendez-vous et candidatures sont fermés dans le code |
| 3 | Rien n'a été éprouvé en réel de bout en bout | Deux identités, e-mail et SMS, notifications, appels vidéo, fédération, charge, restauration |
| 4 | Quelques trous précis de vie privée et de sécurité | Photos envoyées avec leur position GPS ; fichiers de plus de 60 Mio servis sans antivirus |
| 5 | La conformité est analysée, peu codée | Les signalements réglementés sont faits ; le reste attend le juriste et vos informations |

**Le travail.** 317 lots : 60 bloquants avant l'ouverture (P0), 128 attendus par quiconque vient des grandes applications (P1), 96 différenciants (P2), 33 sous condition externe (P3). Une vingtaine de lots bloquants n'attendent ni clé ni personne. Le registre complet est dans [`EXECUTION.md`](EXECUTION.md).

**Le chemin.** Quatre jalons (§ 4) et sept vagues (§ 5). La vague 1 ferme les trous sans rien attendre. La vague 2 prouve en réel. La vague 3 met en conformité. La vague 4 ferme la boucle du commerce. Le jalon « Prêt à ouvrir » est atteint à la fin de la vague 4.

**Vos quatre prochains gestes** (détail au § 6) :
1. Libérer le disque et sauvegarder ce qui n'existe que sur ce Mac.
2. Mandater un juriste et lancer les démarches : éditeur, registre, protection des données.
3. Fournir les clés des services et un second compte réel.
4. Ouvrir les sessions (§ 7) : elles commencent par la vague 1.

Les dix décisions rapides qui débloquaient la vague 1 sont prises (§ 6.2).

## 1. L'intention du propriétaire

Voici ce que disent, ensemble, le plan du programme, le cahier des charges, les études, les décisions d'architecture et les corrections faites en cours de route.

| # | Intention | Source |
|---|---|---|
| 1 | **Trois réseaux qui s'emboîtent** : l'iRéseau de l'administration (fermé, il existe), DIASPORALE (fermé, la diaspora) et ANTSIA (public, global). « Lorsqu'on a créé son réseau social dans DIASPORALE, on est inclus aussi dans ANTSIA. » Chaque réseau garde son contexte : rien n'en sort sans un geste de l'auteur. | Plan du programme, § 0 ; cahier, § 0 |
| 2 | **Un seul moteur pour tous les réseaux.** Un nouveau réseau (une ville, une université, une profession) doit être « une ligne et une application légère, pas un nouveau backend ». | Cahier, § 2.2 |
| 3 | **Savoir à qui l'on parle.** Une identité par personne, fédérée par IDN ; quatre badges calculés (Officiel, Vérifié, Agent public, Communauté), jamais déclaratifs, jamais payants. | Cahier, § 2.1 et § 6.4 ; ADR-0002 |
| 4 | **Trois raisons de venir.** Le divertissement fait revenir chaque jour, le business fait vivre, la vie publique informe et rassure. | Étude des sept univers, § 4 ; ADR-0035 (D01) |
| 5 | **« Une page pour exister, des espaces pour vendre, PRO.GA pour gérer. »** Sept univers choisis d'après ce qui circule déjà au Gabon ; le particulier publie une annonce sans avoir besoin d'une page. | Étude, § 0 ; D02, D03 |
| 6 | **iAsted, l'assistant du membre.** Il comprend un besoin, trouve, prépare ; la personne confirme toujours. | Étude, § 11 ; D05 |
| 7 | **Le citoyen ne paie jamais.** Les revenus sont professionnels et étiquetés. Pas de publicité dans la messagerie, pas de classement payé caché, pas de publicité politique payante, pas de badge payant. | Cahier, § 0 ; étude, § 14 ; D07 |
| 8 | **Souverain et honnête.** Aucun chiffre public non mesuré, rien d'annoncé sans preuve, conformité à l'ordonnance n° 0011/PR/2026 dès la conception. | Cahier, § 2.2 ; D08 |
| 9 | **L'aisance des grandes applications, sans les copier.** Instagram pour la carte de publication, TikTok pour la progression verticale, WhatsApp pour la conversation et l'appel, Facebook pour les pages et les groupes, les ventes privées pour la marketplace. | Étude du 18/10, `00` § 2 ; consignes du 19 au 23/10 |
| 10 | **Gagner par l'utilité et la confiance**, alors que les réseaux sociaux sont suspendus au Gabon depuis février 2026 : jamais comme le réseau de remplacement d'une censure. | Étude, § 0 ; D11 (encore proposée) |

**Ce que le propriétaire a corrigé, et qui vaut règle** : ne rien inventer (ni avis, ni remise, ni compteur) ; une maquette ne montre que ce qui existe ; colonne unique au bureau ; écrans en pleine largeur ; sept thèmes à trois couleurs ; un seul bouton plein par zone ; cinq destinations au téléphone.

## 2. La logique du projet et des métiers

### 2.1 Qui vient faire quoi

| Acteur | Ce qu'il vient faire | Ce que le projet lui doit |
|---|---|---|
| Le membre | Publier, suivre, discuter, appeler, acheter, chercher un logement ou un emploi | Une identité unique, un fil agréable, une messagerie fiable, des offres sûres, la maîtrise de ses données |
| L'activité (entreprise, artisan, association) | Exister, vendre, recruter | Une page, les espaces métier dont elle a besoin, des demandes qualifiées, PRO.GA pour gérer |
| Le particulier qui vend | Vendre un bien ou louer un studio sans créer de page | Une annonce simple, encadrée par des quotas, et « Passer pro » s'il publie souvent |
| L'administration | Informer officiellement | Une page Officielle reflétée, non revendicable, et des alertes |
| L'agent public | Exister à titre volontaire | Un badge calculé, un accord qu'il peut retirer |
| Le média | Publier de l'information | Une rédaction, un label Presse calculé sur attestation |
| L'annonceur | Se faire connaître | Du contenu sponsorisé étiqueté, plafonné, jamais dans la messagerie |
| Le modérateur | Protéger le réseau | Des files, des délais légaux visibles, des décisions motivées |
| L'opérateur | Exploiter le service | Une console, un journal, des procédures éprouvées |
| Le porteur d'un réseau fermé | Animer sa communauté | Un réseau dans le réseau, avec ses règles et sa charte |
| PRO.GA | Gérer le commerce | L'autorité sur le catalogue, le stock et les commandes |
| IDN | Prouver l'identité | Une connexion unique pour tout le programme |

### 2.2 Le parcours qui crée la valeur

Chaque fonctionnalité du projet sert une étape de ce parcours. Un manque sur une étape casse la chaîne entière.

| Étape | Ce que fait la personne | Fonctionnalités | Plans |
|---|---|---|---|
| 1. Découvrir | Elle voit un contenu ou cherche | Fil, Clips, Stories, Découvrir, recherche, iAsted | 02, 03, 16 |
| 2. S'intéresser | Elle ouvre une page, une boutique, une fiche | Profils, pages, boutiques, fiches d'offre | 05, 07, 08, 09, 10 |
| 3. Entrer en relation | Elle écrit ou appelle | iCom, contact commercial, conversation liée à un objet, appels | 01 |
| 4. S'engager | Elle commande, demande un devis, prend rendez-vous, candidate, s'inscrit | Panier, devis, rendez-vous, candidature, évènement, annonce | 07, 08, 09, 10 |
| 5. Suivre | Elle est prévenue et retrouve ses engagements | Notifications, « Mes achats », « Mes demandes », « Mes candidatures » | 06, 08, 09 |
| 6. Faire confiance | Elle sait à qui elle parle et peut se plaindre | Identité, badges, modération, recours, information officielle | 06, 11, 12 |

### 2.3 La roue de croissance

Le divertissement amène le public. Le public attire les vendeurs. Les demandes et les ventes produisent des revenus professionnels. Ces revenus financent les vérifications, la modération et les créateurs. La confiance fait revenir le public. La vie publique nourrit directement la confiance : on vient lire un communiqué, un concours, une alerte. *(Étude, § 4.)*

Ce qui arrête la roue, d'après l'étude : une vague d'arnaques, un univers ouvert mais vide, une publicité envahissante, la lenteur sur réseau mobile.

### 2.4 Qui paie

| Toujours gratuit pour le citoyen | Payé par les professionnels, toujours étiqueté | Jamais |
|---|---|---|
| S'inscrire, publier, écrire, appeler, chercher, l'iAsted du membre, les annonces dans les quotas, candidater, l'information officielle | Abonnement PRO.GA, commission sur ventes encaissées, mise en avant d'une offre, contenu sponsorisé, page d'entreprise premium, billetterie | Vente de données, publicité dans la messagerie, classement payé caché, frais pour candidater, publicité politique payante, badge payant |

Aucun taux n'est fixé. Le modèle économique (D10) reste à arrêter par le propriétaire.

### 2.5 Les séparations à ne jamais franchir

- **Le contexte d'un réseau** : ce qui est publié dans DIASPORALE y reste, sauf geste explicite vers ANTSIA.
- **L'étanchéité des plateformes** : aucune lecture d'une base voisine ; seulement des contrats signés.
- **L'autorité du commerce** : PRO.GA détient les prix, le stock et les commandes ; ANTSIA ne les ressaisit pas.
- **Les portes** : pas de paiement en ligne sans prestataire contracté ; pas de rencontres sans preuve de majorité ; pas de nouvel univers ouvert avant la conformité ; pas d'assistant avant le marquage de l'IA.

## 3. Où en est le projet

### 3.1 Par fonctionnalité

Chaque plan a comparé ANTSIA à ses applications de référence, capacité par capacité. « Présent » veut dire « dans le code », pas « recetté ». Ces décomptes ne sont pas un taux d'avancement : les capacités n'ont pas toutes le même poids.

| Plan | Présent | Partiel | Absent | Fermé | Le manque qui compte le plus |
|---|---|---|---|---|---|
| [01 iCom et appels](01_ICOM_MESSAGERIE_ET_APPELS.md) | 34 | 14 | 21 | 1 | Message vocal impossible à écouter ; tout membre peut faire sonner tout membre ; un message à deux ne se signale pas |
| [02 Fil et publications](02_FIL_PUBLICATIONS_INTERACTIONS.md) | 36 | 10 | 19 | 1 | Photos publiées avec leurs métadonnées, jusqu'à 20 Mo ; une publication modifiée ne le dit pas |
| [03 Stories, Clips, recherche](03_STORIES_CLIPS_DECOUVERTE_RECHERCHE.md) | 21 | 11 | 20 | 0 | Aucune chaîne de médias (ni conversion, ni qualité adaptée au débit) ; une Story ne se signale pas |
| [04 Directs et conférences](04_DIRECT_ET_CONFERENCES.md) | 33 | 6 | 20 | 2 | Jamais éprouvé avec un vrai serveur vidéo ; pas de consentement conservé à l'enregistrement ; rien pour la 3G |
| [05 Profil et relations](05_PROFIL_RELATIONS_ALBUMS.md) | 24 | 12 | 19 | 0 | Impossible de bloquer quelqu'un dans ANTSIA ; un profil ne se signale pas |
| [06 Compte et notifications](06_COMPTE_IDENTITE_PARAMETRES_NOTIFICATIONS.md) | 34 | 8 | 14 | 3 | En production, seule l'entrée par IDN fonctionne ; aucune liste des appareils connectés |
| [07 Pages, groupes, évènements](07_PAGES_GROUPES_EVENEMENTS.md) | 19 | 16 | 19 | 10 | Le badge « Vérifié » d'une page ne peut pas s'obtenir ; les évènements avancés sont réservés à DIASPORALE |
| [08 Commerce](08_COMMERCE_MARKETPLACE_BOUTIQUES.md) | 25 | 8 | 17 | 3 | Aucun achat ne peut aboutir ; aucun vrai catalogue reflété |
| [09 Univers ouverts](09_UNIVERS_SERVICES_EMPLOI_RESTAURATION.md) | 30 | 7 | 13 | 9 | Devis, rendez-vous et candidatures fermés dans le code |
| [10 Nouveaux univers](10_NOUVEAUX_UNIVERS_ET_ANNONCES.md) | 5 | 6 | 21 | 4 | Rien n'est construit : ni bien immobilier, ni véhicule, ni annonce ; pas de motif « arnaque » |
| [11 Vie publique](11_VIE_PUBLIQUE_MEDIAS_ANNONCEURS.md) | 23 | 6 | 19 | 1 | L'émetteur côté administration.ga n'est dans aucun dépôt ; aucune alerte officielle ; rien pour les annonceurs |
| [12 Modération et conformité](12_MODERATION_CONFORMITE_SECURITE.md) | 25 | 11 | 9 | 2 | Signalement branché sur 8 types d'objets sur 20 ; aucun écran pour les mesures sur ordre du juge |
| [13 Console et exploitation](13_CONSOLE_EXPLOITATION_LANCEMENT.md) | 24 | 18 | 10 | 2 | Un seul administrateur ; ni alerte ni sauvegarde éprouvée ; publication manuelle hors du dépôt |
| [14 Application mobile](14_APPLICATION_MOBILE.md) | 27 | 13 | 26 | 2 | Publie du texte seulement ; ni notification, ni blocage, ni signalement ; aucun binaire compilé depuis `main` |
| [15 DIASPORALE](15_DIASPORALE.md) | 40 | 6 | 15 | 3 | Jamais recetté sur le vrai moteur à plusieurs comptes ; textes légaux à l'état de charpente |
| [16 iAsted](16_IASTED_ASSISTANT.md) | 9 | 4 | 9 | 2 | Aucune ligne d'IA dans ANTSIA |
| **Total** | **409** | **156** | **271** | **45** | |

### 3.2 Les constats vérifiés un par un dans le code

Les agents ont rédigé les plans ; ces dix-huit constats ont été revérifiés à la main dans le code de `main`, parce qu'ils décident des priorités.

| Constat | Preuve dans le dépôt | Lot |
|---|---|---|
| Les photos de publication, de Story et de profil partent avec leurs métadonnées, position GPS comprise. Seul l'album ré-encode | Seul `packages/social-features/src/features/reseau-albums/AlbumComposer.tsx` ré-encode | SD-02, FP-01, PF-03 |
| Un fichier de plus de 60 Mio n'est pas analysé par l'antivirus, puis il est servi. Une vidéo de publication est admise jusqu'à 100 Mio | `packages/social-domain/src/filePolicy.ts`, `convex/modules/files/scan.ts`, `packages/social-domain/src/content.ts` | EX-17 |
| Par défaut, tout membre peut faire sonner tout membre | `convex/modules/calls/preferences.ts` (`outsideRelationsCalls` vaut `ring`) | IC-04 |
| On ne peut bloquer personne dans ANTSIA | `BlockedPeopleSection` n'est monté que dans DIASPORALE | PF-01 |
| Un message à deux ne peut pas être signalé | `convex/modules/moderation/tables.ts` : aucune cible pour lui | IC-03, MC-01 |
| Un message vocal se dépose, personne ne peut l'écouter | `convex/modules/calls/voicemail.ts` : quatre fonctions sans écran | IC-02 |
| Les réglages de modération d'un réseau n'ont pas d'écran | `convex/modules/moderation/cases.ts` (`setPolicy`, `setBlockedTerm`) | MC-02 |
| La suspension générale d'un compte n'a pas d'écran | `convex/modules/people/memberships.ts` (`suspendEverywhere`) | SU01h |
| Le badge « Vérifié » d'une page ne peut pas s'obtenir | `convex/modules/pages/admin.ts` : trois fonctions sans appelant | PG-01 |
| Les évènements de page (capacité, billet à code QR, galerie) sont réservés à DIASPORALE | `convex/modules/events/pageEvents.ts` (`assertDiasporaNetwork`) | PG-03 |
| Aucun achat ne peut aboutir, alors que l'écran dit « réglez à la remise » | `packages/social-domain/src/commerce/command.ts` ; `apps/antsia_ga/src/i18n/locales/fr/marketplace.json` | CM-04 |
| Devis, rendez-vous et candidatures sont fermés | `convex/modules/shops/commerceActivation.ts` | UM-01, UM-02 |
| Une tuile « Rencontres » est affichée alors que la fonction est fermée | `apps/antsia_ga/src/components/discovery/discover-screen.tsx` | SD-13 |
| Aucun motif « arnaque » parmi les douze motifs de signalement | `packages/social-domain/src/moderation.ts` | NU-01, MC-06 |
| La sonde de santé répond « ok » sans joindre le moteur | `apps/antsia_ga/src/app/api/sante-fonctionnelle/route.ts` | EX-03 |
| L'application mobile bloque l'appareil photo, le micro et les notifications | `apps/antsia_mobile/app.config.ts` | MB-08, MB-09 |
| L'émetteur côté administration.ga n'est suivi par aucun dépôt | Dossier local du socle, fichiers non suivis par git | PA9D |
| Les textes légaux de DIASPORALE sont une charpente à compléter | `apps/diasporale_com/src/screens/legal-screen.tsx` (dépôt DIASPORALE) | DS-07 |

### 3.3 En ligne et en réel

- **En ligne** : le réseau et sa démonstration, la console, DIASPORALE sur la démonstration seulement, l'application iOS en bêta (dossier de reprise, § 2.2). Aucun domaine de production n'est branché.
- **En réel** : presque rien n'a été éprouvé avec de vrais comptes et de vrais appareils. Chaque plan liste, à la fin de son § 2, ce qui est écrit mais jamais recetté.

### 3.4 Ce qui n'existe que sur ce Mac

- **L'émetteur des pages Officielles côté administration.ga** : des fichiers non suivis par git dans le dossier local du socle, sur une branche de septembre. Sans eux, la vie publique repart de zéro.
- **Le bac à sable local du catalogue** (ADR 0040 et 0041), les rapports de recette et les instantanés : voir le dossier de reprise, annexe C.

## 4. Ce que « terminer » veut dire

Le projet ne se termine pas en une fois. Il se termine par quatre jalons, chacun avec des critères vérifiables. Ils reprennent les lots A3 à A6 du cahier et les vagues V1 à V5 de l'étude des sept univers.

### Jalon 1 — Prêt à ouvrir (le pilote du Grand Libreville)

Le réseau peut accueillir de vraies personnes, honnêtement et sans risque juridique.

| Domaine | Critère | Source |
|---|---|---|
| Droit | Mentions légales complètes publiées ; inscription au registre de la Haute Autorité de la Communication faite ou demandée par écrit ; représentant légal nommé ; dossier déposé auprès de l'autorité de protection des données ; arbitrages A1 à A3 tranchés par un juriste | SU01, § 5 et § 6 |
| Mesures sur ordre | La procédure du référé numérique est éprouvée sur la démonstration | SU01h |
| Identité | Deux vraies identités se connectent, se déconnectent et se retrouvent ; l'inscription d'un nouveau membre aboutit en réel | Parcours R1 et R2 du cahier |
| Transports | Code par e-mail et par SMS, notifications sur le navigateur et sur le téléphone, appel vidéo : chacun reçu sur un appareil réel | Rapport de lancement, § 3 |
| Exploitation | Une sauvegarde est restaurée sur une cible jetable ; la charge R8 est mesurée ; les alertes arrivent à quelqu'un ; un retour arrière est joué ; les domaines sont branchés | Cahier, § 14 et § 17 ; rapport de lancement |
| Qualité | `bun run verify` vert sur `main` ; accessibilité de niveau AA sur les parcours principaux ; temps d'affichage du fil mesuré sur réseau 3G | Cahier, § 17 |
| Produit | Tous les lots de priorité P0 des seize plans sont livrés | Ce dossier |
| Mobile | Un binaire compilé depuis `main` tourne sur un iPhone et un téléphone Android réels | Plan 14 |
| Pilote | Zone, vendeurs pilotes et équipe de modération désignés ; délais de traitement mesurables | Étude, § 18 |

### Jalon 2 — À la hauteur des références

Quelqu'un qui vient de WhatsApp, d'Instagram ou de Facebook retrouve ce qu'il attend : les lots P1 des plans 01 à 07, la parité de l'application mobile, la publication dans les boutiques d'applications.

### Jalon 3 — Le business et la vie publique vivent

- Le commerce fonctionne de bout en bout avec un vrai catalogue de PRO.GA, payé à la remise.
- Les univers ouverts (boutiques, services, emploi, restauration) sont recettés avec de vrais vendeurs.
- Les univers de la vague 2 ouvrent (immobilier, auto, annonces de particuliers), après la conformité.
- Les premières administrations sont reflétées, la presse publie, les alertes officielles arrivent.

### Jalon 4 — L'assistant, le paiement, les nouveaux réseaux

iAsted répond au membre ; le paiement en ligne ouvre quand un prestataire est contracté ; la billetterie et le sponsorisé suivent ; un nouveau réseau (une ville, une université) s'ouvre depuis la console sans nouveau backend.

**Les jalons 2 et 3 avancent en parallèle.** Le jalon 1 passe avant tout : c'est lui qui transforme un produit en ligne sur une adresse provisoire en un réseau ouvert.

## 5. La feuille de route

Sept vagues. Les quatre premières mènent au jalon 1 et contiennent les 60 lots bloquants. Le détail de chaque lot est dans son plan ; son état se suit dans [`EXECUTION.md`](EXECUTION.md).

### Vague 0 — Avant tout (vous, une journée)

Libérer le disque, sauvegarder ce qui n'existe que sur ce Mac (§ 3.4), nommer un second administrateur de la console, et lancer les démarches longues du § 6.1 : elles conditionnent les vagues 2 et 3.

### Vague 1 — Fermer les trous (aucune clé, aucun tiers)

Ces lots ne dépendent que du code. Les décisions qu'ils attendaient sont prises (§ 6.2). Ce dossier étant public, les deux premiers lots de la ligne 1, **EX-17** et **SD-02**, passent avant tout.

| Ordre | Session S1 | Pourquoi |
|---|---|---|
| 1. Vie privée et sécurité | **EX-17** antivirus fermé au-delà de 60 Mio · **SD-02** photos nettoyées avant l'envoi, puis **FP-01** (publications) et **PF-03** (profil) qui s'y branchent · **SD-03** vidéos lisibles partout · **EX-03** sonde de santé | Ce sont des fuites et des trous déjà en ligne |
| 2. Protéger les personnes | **PF-01** bloquer · **MC-01** signaler depuis chaque objet, avec ses volets **IC-03**, **SD-01**, **PF-02**, **DL-03**, **UM-03** · **IC-04** réglages iCom · **MC-02** réglages de modération | L'ordonnance 0011 exige un signalement accessible ; les boutiques d'applications exigent le blocage |
| 3. Rendre vrai ce qui est promis | **IC-02** écouter un message vocal · **PG-01** revendications de page · **PG-02** gérer un groupe · **DL-02** consentement à l'enregistrement · **DL-04** suivre un direct en 3G · retirer la tuile « Rencontres » | L'écran annonce déjà ces fonctions, ou le serveur les attend |
| 4. Se préparer à prouver | **EX-01** publication et retour arrière dans le dépôt · **PA10 · audits** puis **EX-18** corrections d'accessibilité · **PA10 · volet local** (charge et restauration en local) | Sans cela, la vague 2 ne peut pas se dérouler proprement |

| Session S2 (DIASPORALE) | Session S3 (mobile) |
|---|---|
| **DS-01** contrôle de départ · **DS-05** campagne de recettes sur le vrai moteur, en local | **MB-01** matrice de parité · **MB-04** bloquer, signaler, supprimer son compte (avec **PF-04**) · **MB-07** retour d'arrière-plan sans perte |

### Vague 2 — Prouver en réel (clés, second compte, cible jetable)

| Session | Lots | Ce qu'il vous faut fournir |
|---|---|---|
| S1 | **CN-01** entrée et sessions · **CN-02** comptes légers par e-mail puis SMS · **IC-01** iCom et appels à deux · **FP-02** fil à deux · **DL-01** direct avec un vrai serveur vidéo · **CM-01** vrai catalogue de PRO.GA · **CM-06** transaction à deux comptes · **PA10 · volet cible jetable** · **EX-04** alertes et astreinte · **EX-07** habilitations à deux · **EX-19** liste de contrôle et bascule de domaine | Clés des services, second compte IDN, cible jetable, domaines |
| S2 | **DS-04** mise en relation et guichet sur la démonstration · **DS-06** dossier de mise en production | Accord pour la démonstration ; hébergement et domaine |
| S3 | **MB-02** premier binaire iOS depuis `main` · **MB-03** Android · **MB-06** essais sur appareils réels · **MB-05** dossier des boutiques d'applications | Accords de compilation et de soumission ; votre présence pour les essais |

### Vague 3 — Se conformer (juriste, informations de l'éditeur)

**SU01a** mentions légales et registre · **SU01h** mesures sur ordre du juge · **SU01f** règles d'utilisation et outils des administrateurs · **SU01b** identification des titulaires · **SU01c** âge et mineurs · **CM-02** catégories interdites · **CM-03** majorité pour acheter · **DS-07** textes légaux de DIASPORALE.

SU01h et SU01a peuvent commencer dès la vague 1 : seul l'avis du juriste sur la double validation et vos informations d'éditeur manquent. SU01b et SU01c ne se codent qu'après les arbitrages A1 à A4.

### Vague 4 — Fermer la boucle du commerce

**CM-04** commande réglée à la remise · **UM-01** ouvrir les services · **UM-02** ouvrir les candidatures. Ces lots demandent un changement du côté de PRO.GA (§ 6.1, point 7).

**→ Jalon 1 : prêt à ouvrir.**

### Vagues 5 à 7 — Après l'ouverture

| Vague | Contenu | Lots | Jalon |
|---|---|---|---|
| 5 · À la hauteur des références | Les lots P1 des plans 01 à 07 et 14 : réglages pro d'iCom, recherche dans les messages, archivage, demandes de message, publication modifiée visible, partage, économie de données, recherche unifiée, appareils connectés, notifications sur le navigateur et le téléphone, évènements de page pour tous, photos et vidéos dans l'application | 73 lots | 2 |
| 6 · Business et vie publique | Les lots P1 des plans 08 à 13 et 15 : panier conservé, favoris, commandes reçues par le vendeur, avis après prestation, immobilier, auto, annonces de particuliers, fédération de l'administration, presse, intégration continue, référencement, pilote de DIASPORALE | 55 lots | 3 |
| 7 · Assistant, paiement, nouveaux réseaux | Les lots P2 et P3 : iAsted, paiement en ligne, billetterie, sponsorisé, sondages, statistiques, nouveaux réseaux | 129 lots | 4 |

Dans chaque plan, le § 6 donne l'ordre interne de ses lots.

### 5.1 Les mécanismes communs : un seul lot les construit

Plusieurs plans demandent la même brique. Pour ne pas la construire trois fois, un lot la porte et les autres s'y branchent.

| Brique commune | Lot qui la construit | Lots qui s'y branchent |
|---|---|---|
| Préparer une image avant l'envoi (ré-encodage, retrait des métadonnées, taille) | SD-02 | FP-01, PF-03, MB-09 |
| Signaler depuis n'importe quel objet | MC-01 | IC-03, SD-01, PF-02, DL-03, UM-03, MB-04 |
| Bloquer une personne | PF-01 | IC-03, PF-04, MB-04 |
| Référence d'un objet dans un message iCom (publication, direct, offre, Story, profil) | IC-18, à avancer avec le premier qui en a besoin | FP-05, DL-07, SD-06, CM-14, PF-06 |
| Enregistrer une offre (favoris) | CM-09 | NU-03, UM-05, DS-11 |
| Alertes de recherche et besoins | NU-04 | UM-05, NU-05, SU11c, CM-11 |
| Avis après un engagement réel | UM-07 | CM-16, UM-14 ; modèle : les avis de service de DIASPORALE |
| Évènements de page pour tous les réseaux | PG-03 | PG-04, DS-10, DS-16, SU14a |
| Sondages | FP-15 | IC-17, SD-19, DL-10 |
| Publications programmées | FP-14 | PG-13, DL-06 |
| Statistiques pour l'auteur | FP-17 | DL-12, PG-11 |
| Notifications sur l'appareil | CN-10 (navigateur) | MB-08 (téléphone), DS-14 |
| Recherche | SD-11 (écran commun) | IC-07, UM-04, NU-02, MB-14 : chacun son index |

Trois lots apparaissent dans deux plans, avec deux volets : **SU01b** et **SU01c** (règles au plan 12, écrans d'inscription au plan 06), **SU01i** (contenus importés au plan 12, réponses d'iAsted au plan 16), **SU08** (emploi privé au plan 09, emploi public au plan 11).

## 6. Vos décisions et vos démarches

### 6.1 Les démarches longues, à lancer maintenant

| # | Démarche | Ce qu'elle débloque |
|---|---|---|
| 1 | **Disque et sauvegarde** : libérer au moins 25 Go, sauvegarder ce qui n'existe que sur ce Mac | Tout |
| 2 | **Juriste** : arbitrages A1 à A5 (identification, âge), A7, A12, durées de conservation, textes légaux d'ANTSIA et de DIASPORALE | Vague 3 ; toute ouverture d'un nouvel univers |
| 3 | **Éditeur et autorités** : entité éditrice et mentions (art. 25), registre de la Haute Autorité de la Communication, représentant légal, dossier auprès de l'autorité de protection des données | Jalon 1 |
| 4 | **Clés et comptes** : e-mail et domaine d'envoi, SMS, serveur vidéo et enregistrement, notifications (navigateur, Apple, Google), second compte IDN réel, accès aux journaux d'IDN, compte Google Play | Vague 2 |
| 5 | **Second administrateur** de la console | L'archivage à deux, aujourd'hui impossible |
| 6 | **Hébergement et domaines** d'ANTSIA et de DIASPORALE | Bascule de domaine, e-mails, liens de l'application |
| 7 | **PRO.GA** : désigner qui porte les changements du côté de PRO.GA (commande à la remise, catalogue des nouveaux univers, agent du vendeur) | Vague 4, plans 08, 09, 10 et 16 |
| 8 | **Socle** : décider d'ouvrir la PR de l'émetteur côté administration.ga, et qui la relit | Toute la vie publique |

### 6.2 Les décisions rapides de la vague 1 : prises le 9 novembre 2026

| Question | Décision du propriétaire | Lot | Plan |
|---|---|---|---|
| Qui peut m'appeler par défaut | Mes relations seulement ; l'appel d'une personne non reliée ne sonne pas, il est inscrit au journal ; chacun peut l'élargir | IC-04 | 01, décision 1 |
| Fichiers de plus de 60 Mio | Refusés à l'envoi ; la vidéo de publication passe de 100 à 60 Mio | EX-17 | 13, décision 4 |
| Photos avant l'envoi | Ré-encodage systématique, métadonnées retirées, plus grand côté à 2 048 px ; poids cible et GIF animé à fixer dans le lot | SD-02, FP-01, PF-03 | 02, décision 1 ; 03, décision 6 |
| Bloquer et abonnements | Bloquer supprime les abonnements dans les deux sens | PF-01 | 05, D1 |
| Enregistrement d'un direct | Décoché par défaut, au formulaire comme au serveur ; accord explicite et horodaté de chaque intervenant | DL-02 | 04, décisions 4 et 5 |
| Réglages de modération par défaut | Défauts prudents, relâchés après mesure sur le pilote ; valeurs exactes soumises dans le lot | MC-02 | 12, décision 3 |
| Mesures sur ordre du juge | Un opérateur exécute tout de suite, un second confirme ensuite ; délai de confirmation à fixer dans le lot | SU01h | 12, décision 2 |
| Tuile « Rencontres » | Retirée jusqu'à l'ouverture | SD-13 | 03, décision 2 |
| Six boutons de DIASPORALE | Les six recommandations adoptées : mentorat, proposition et billet QR en famille commerce ; Parrainer en famille sociale ; Appeler en tonal ; Retenir cette réponse reste neutre | DS-02 | 15, décision 1 |
| Publier ce dossier | Dans le dépôt, dès maintenant (la recommandation était d'attendre la fin de la vague 1) | — | Ce plan |

Chaque décision est aussi inscrite au § 7 du plan concerné.

### 6.3 Les décisions de fond

- **Commerce** : ouvrir la commande à la remise aux produits, avec un plafond (plan 08, décisions 1 et 2) ; ouvrir services et candidatures après recette croisée (plan 09, décision 1).
- **Étude des sept univers** : D09 (vérifications d'État), D10 (modèle économique), D11 (positionnement et pilote), D12 (rencontres) restent proposées.
- **Refonte du 18 octobre** : le registre des 39 décisions du pilote reste ouvert (`docs/etudes/2026-10-18-social-commerce/pilote/06_REGISTRE_DES_DECISIONS.md`).
- **Intégration continue** : la rétablir en lecture seule, sans secret ni publication (plan 13, décision 2).
- **Chaque plan** liste ses autres décisions à son § 7, avec une recommandation.

## 7. Comment exécuter

### 7.1 Les sessions

Trois sessions travaillent en parallèle, chacune dans sa copie du dépôt (dossier de reprise, § 5 et § 13.1).

| Session | Périmètre | Plans |
|---|---|---|
| **S1** moteur et web | Tout ANTSIA, sauf les zones de S2 et S3. Seule à modifier les fichiers partagés et à publier Convex et les sites ANTSIA | 01 à 13, 16 |
| **S2** DIASPORALE | Le dépôt DIASPORALE et sa tranche dans ANTSIA | 15 |
| **S3** mobile | `apps/antsia_mobile/`, `packages/social-native/` | 14, et le volet mobile de chaque plan |

S1 porte 260 des 317 lots. Quand deux lots de S1 ne touchent pas les mêmes fichiers, on peut ouvrir une session de plus pour l'un d'eux, à condition qu'une seule session à la fois modifie les fichiers partagés (`package.json`, `bun.lock`, `convex/schema.ts`, `convex/convex.config.ts`, `deploy/catalog.json`).

Deux dépôts voisins ne sont couverts par aucune des trois sessions : **PRO.GA** (commande à la remise, catalogue des nouveaux univers, agent du vendeur) et le **socle administration.ga** (émetteur des pages Officielles). Leurs changements se font par PR dans leur dépôt, sur votre décision (§ 6.1, points 7 et 8).

### 7.2 La vie d'un lot

1. Relire le lot dans son plan, et **vérifier dans le code que l'état décrit est toujours vrai** : les plans datent du 9 novembre 2026.
2. Branche `claude/<sujet>` depuis `origin/main`.
3. Livrer le lot entier dans les vrais fichiers, branché et atteignable depuis l'interface : backend, écrans, textes en français et en anglais, export et effacement des nouvelles données, tests, cliquets.
4. `bun run verify` vert, une seule exécution à la fois sur la machine.
5. Recette au navigateur ou au simulateur à 390, 834 et 1440 px, en clair et en sombre, avec les comptes de démonstration.
6. PR en français, fusion, puis mise à jour de `EXECUTION.md` de ce dossier.
7. Publication : seulement après l'accord écrit et détaillé du propriétaire (commit, cibles, ordre, retour arrière).

Un lot est **terminé** quand il est fusionné, vérifié et recetté. Il est **en ligne** quand il est publié et que la version servie le prouve. Il est **recetté en réel** quand il a été éprouvé avec de vrais comptes et de vrais appareils. Ces trois états ne se confondent jamais.

### 7.3 Le prompt commun d'un lot

Chaque plan fournit un prompt prêt à coller pour ses lots les plus importants. Pour tout autre lot, ce gabarit suffit :

```text
Tu exécutes le lot <ID> du plan <NN> d'ANTSIA. Écris-moi toujours en français. Utilise Opus pour tout le code, jamais de sous-agent Sonnet.

Lis d'abord, dans l'ordre :
1. CLAUDE.md du dépôt ;
2. docs/etudes/2026-11-09-finalisation/00_PLAN_DIRECTEUR.md, § 1, § 2 et § 7 ;
3. docs/etudes/2026-11-09-finalisation/<fichier du plan>, § 1 et § 2, puis le lot <ID> au § 5 ;
4. les décisions (ADR) et les documents que ce lot cite.

Avant de coder, vérifie dans le code que l'état décrit par le plan est toujours vrai : le plan date du 9 novembre 2026. S'il ne l'est plus, dis-le-moi et adapte le lot.

Livre le lot entier, dans les vrais fichiers, branché et atteignable depuis l'interface : backend, écrans, textes en français et en anglais, export et effacement des nouvelles données, tests, cliquets. Respecte les invariants du moteur et les critères d'acceptation du lot.

Vérifie : bun run verify (avec le verrou commun aux sessions), puis une recette au navigateur ou au simulateur à 390, 834 et 1440 px, en clair et en sombre, avec les comptes de démonstration. Donne-moi les preuves.

Arrête-toi et demande-moi :
- avant toute publication, toute variable d'environnement, tout secret, toute suppression de données ;
- à chaque porte indiquée par le lot ;
- si le lot exige un fichier partagé et que tu n'es pas la session S1.

N'invente aucun chiffre, avis ni contenu. Ne dis jamais qu'une recette est faite si tu ne l'as pas constatée. Termine par : ce qui est vrai maintenant, les preuves, ce qui n'a pas été vérifié, la mise à jour de EXECUTION.md du dossier de finalisation, et le lot suivant.
```

### 7.4 Où vivent ces plans

Ce dossier est dans le dépôt d'ANTSIA, sous `docs/etudes/2026-11-09-finalisation/` : chaque copie de travail le reçoit avec `main`. La session S2 le lit dans sa copie d'ANTSIA voisine (`../ANTSIA/docs/etudes/2026-11-09-finalisation/`).

`EXECUTION.md` se met à jour dans la PR de chaque lot : la session change la ligne de son lot, rien d'autre. Deux sessions qui touchent deux lignes différentes ne se gênent pas.

Le dossier de reprise, lui, reste hors dépôt : il cite des identifiants internes d'hébergement.

## 8. Risques majeurs

| Risque | Parade |
|---|---|
| **Ce dossier est public** et décrit des faiblesses encore en ligne | Fermer d'abord l'antivirus (EX-17) et les métadonnées des photos (SD-02), puis les publier avec votre accord |
| **L'ampleur** : 317 lots, dont 260 pour une seule session | Tenir l'ordre des vagues ; ne commencer aucun lot P1 tant qu'un lot P0 sans porte reste à faire |
| **Ouvrir avant d'avoir prouvé** | Le jalon 1 exige des recettes réelles : un lot fusionné n'est pas un lot recetté |
| **Les arnaques** dans les univers d'annonces | Motif « arnaque », limites des comptes non vérifiés, chaîne de confiance, avant toute ouverture (plans 10 et 12) |
| **Un univers ouvert mais vide** | Aucune tuile sans offre réelle ; vendeurs pilotes désignés avant l'ouverture |
| **La lenteur sur réseau mobile** | Photos allégées, vidéos bornées, économie de données, mesure sur 3G (plans 02, 03, 13) |
| **Le droit** : identification, âge, délais, référé d'heure à heure | Juriste mandaté tôt ; rien n'est dit « conforme » sans preuve (plan 12) |
| **Tout repose sur un Mac saturé et une seule personne** | Sauvegarde, second administrateur, publication décrite dans le dépôt, intégration continue (plan 13) |
| **PRO.GA et le socle évoluent ailleurs** | Désigner qui porte leurs changements ; contrats jumeaux copiés à l'octet des deux côtés |
| **Les coûts récurrents** : vidéo, stockage, SMS, assistant | Budgets et seuils de coupure (plan 13, EX-12) ; quotas de l'assistant (plan 16) |
| **Des plans qui vieillissent** | Chaque lot commence par vérifier dans le code que l'état décrit est toujours vrai |

## 9. Les documents de ce dossier

| Fichier | Contenu |
|---|---|
| `00_PLAN_DIRECTEUR.md` | Ce document |
| [`EXECUTION.md`](EXECUTION.md) | Le registre des 317 lots et leur état |
| [`01_ICOM_MESSAGERIE_ET_APPELS.md`](01_ICOM_MESSAGERIE_ET_APPELS.md) | iCom face à WhatsApp, iMessage, Telegram, Signal, Messenger, WhatsApp Business |
| [`02_FIL_PUBLICATIONS_INTERACTIONS.md`](02_FIL_PUBLICATIONS_INTERACTIONS.md) | Le fil face à Instagram, Facebook, X, Threads, LinkedIn, TikTok |
| [`03_STORIES_CLIPS_DECOUVERTE_RECHERCHE.md`](03_STORIES_CLIPS_DECOUVERTE_RECHERCHE.md) | Stories, Clips, médias, Découvrir et recherche face à Instagram, TikTok, YouTube, Snapchat |
| [`04_DIRECT_ET_CONFERENCES.md`](04_DIRECT_ET_CONFERENCES.md) | Les directs face à TikTok, Instagram, YouTube, Twitch ; les conférences face à Zoom et Meet |
| [`05_PROFIL_RELATIONS_ALBUMS.md`](05_PROFIL_RELATIONS_ALBUMS.md) | Profil et relations face à Instagram, Facebook, LinkedIn, X |
| [`06_COMPTE_IDENTITE_PARAMETRES_NOTIFICATIONS.md`](06_COMPTE_IDENTITE_PARAMETRES_NOTIFICATIONS.md) | Compte, identité, réglages et notifications face aux réglages des grandes applications |
| [`07_PAGES_GROUPES_EVENEMENTS.md`](07_PAGES_GROUPES_EVENEMENTS.md) | Pages, groupes, évènements face à Facebook, LinkedIn, WhatsApp, Discord, Meetup, Eventbrite |
| [`08_COMMERCE_MARKETPLACE_BOUTIQUES.md`](08_COMMERCE_MARKETPLACE_BOUTIQUES.md) | Le commerce face à Facebook Marketplace, Instagram, WhatsApp Business, TikTok Shop, Jumia, Shopify, Veepee |
| [`09_UNIVERS_SERVICES_EMPLOI_RESTAURATION.md`](09_UNIVERS_SERVICES_EMPLOI_RESTAURATION.md) | Services, emploi, réseau professionnel, restauration |
| [`10_NOUVEAUX_UNIVERS_ET_ANNONCES.md`](10_NOUVEAUX_UNIVERS_ET_ANNONCES.md) | Immobilier, auto, sorties, annonces de particuliers |
| [`11_VIE_PUBLIQUE_MEDIAS_ANNONCEURS.md`](11_VIE_PUBLIQUE_MEDIAS_ANNONCEURS.md) | Pages Officielles, presse, alertes, annonceurs |
| [`12_MODERATION_CONFORMITE_SECURITE.md`](12_MODERATION_CONFORMITE_SECURITE.md) | Modération, ordonnance 0011, protection des personnes |
| [`13_CONSOLE_EXPLOITATION_LANCEMENT.md`](13_CONSOLE_EXPLOITATION_LANCEMENT.md) | Console, exploitation, lancement technique |
| [`14_APPLICATION_MOBILE.md`](14_APPLICATION_MOBILE.md) | Application iOS et Android, parité avec le web |
| [`15_DIASPORALE.md`](15_DIASPORALE.md) | Le réseau DIASPORALE |
| [`16_IASTED_ASSISTANT.md`](16_IASTED_ASSISTANT.md) | iAsted dans ANTSIA |

**Comment ces plans ont été établis.** Un agent par fonctionnalité a lu tous les documents du projet (cahier, plan du programme, études, décisions, rapports, notes) puis le code de `main`, a prouvé chaque état par un chemin de fichier ou par les motifs cherchés, et a comparé aux applications de référence. Les chemins cités ont été contrôlés par un script, et les constats du § 3.2 revérifiés à la main. Les comparaisons avec les applications de référence viennent de la connaissance de ces produits, sans revérification en ligne : chaque plan marque d'un « ? » ce dont il n'est pas sûr.
