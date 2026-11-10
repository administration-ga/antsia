# Plan d’implémentation — expérience sociale responsive ANTSIA

Mise à jour : 21 octobre 2026. Périmètre : ANTSIA Web uniquement. **U01–U08 sont raccordés et publiés sur le Web ANTSIA ; les recettes visuelles/authentifiées et physiques restent non exécutées.** La demande explicite du propriétaire autorise désormais vérifications, corrections, commit, push et déploiement ; le gel décrit dans les prompts initiaux est levé pour cette livraison. Les versions réellement contrôlées et publiées sont consignées dans le [bilan U08](rapports/U08_LIVRAISON_2026-10-21.md). Les sources natives et les changements de l'autre session sont préservés ; aucune capacité P16 n'est ouverte par cette tranche.

## 1. Objectif et références

Rendre ANTSIA facile à lire, à publier et à utiliser sur téléphone, tablette et ordinateur : média lisible, navigation courte, conversations accessibles, profil compréhensible et boutique reliée aux vrais services de PRO.GA. Le fond clair reste **blanc**, les cartes **beige** ; les variantes sombre et contraste reposent sur les jetons existants.

Les captures et vidéos de l’utilisateur servent à relever des comportements, pas à copier des données privées ou à annoncer une parité. L’[analyse des références](01_ANALYSE_REFERENCES.md) porte les fichiers locaux et leurs limites. V1, environ 114 s, montre notamment le choix Publication/Story/Reel/En direct vers 27 s, les notifications vers 51 s, une confirmation de republication vers 69 s et un appel sortant vers 111 s ; V2, environ 60,5 s, montre un profil, les abonnés, les paramètres d’activité vers 36 s et une boîte Principal/Invitations/Général vers 52 s. Ces repères approximatifs ne prouvent aucune capacité d’ANTSIA. Le [lexique](02_NOMS_ET_MICROTEXTES.md) fixe les noms ; l’[architecture responsive](03_ARCHITECTURE_RESPONSIVE.md) décrit les compositions et schémas d’écrans.

Ce chantier UX réutilise les lots [P00–P19 de l’étude sociale et commerciale](../2026-10-18-social-commerce/README.md). Il ne les réimplémente pas. Les rapports historiques décrivent leur état daté ; leurs résultats ne valent pas preuve des changements U01–U08.

## 2. État source de départ à préserver

Inventaire de lecture avant U02, le 20 octobre, sans exécution. U02 ajoute ensuite son opt-in
à 768/1200 ; les seuils historiques ci-dessous restent le comportement des autres consommateurs :

- Web : `apps/antsia_ga/src/components/network-shell.tsx` déclare `navigation="destinations"`, `postPresentation="charte"`, `feedPresentation="immersive"` et `storiesPresentation="rings"`. La **liste reste le défaut**, y compris au téléphone, dans `features/feed-immersion/use-feed-mode.ts`. L’immersion est une option et contient des publications de plusieurs types ; elle n’est pas un fil vidéo Clips.
- La coque partagée utilise actuellement la barre basse jusqu’à 959 px et le rail à partir de 960 px. `shell/reseau-layout.ts` définit déjà des contraintes de conteneur à 600/820 px ; `shell/ReseauAgentPage.tsx` dispose de ses propres seuils 812/1008/1108, d’un fil d’environ 680–792 px et d’un volet droit de 312 px. Les cibles ci-dessous ne remplacent pas ces valeurs globalement.
- Avant U01, les cinq destinations Web sont Fil, Découvrir, Créer, Messages et Profil ; U01 renomme les deux premières Accueil et Explorer. `/moi` est un **hub personnel** ; le mur public d’une personne est `/profil/[handle]`. Les onglets existants Publications/Photos/Albums ne prouvent pas une photothèque de tous les posts : Photos repose actuellement sur les albums.
- Messages propose Conversations, Appels et Contacts ; filtres Toutes, Non lues, Groupes et Boutiques injecté. La source des groupes est bornée aux 50 groupes chargés : recherche exhaustive et boîte Instagram ne sont pas acquises.
- Le direct réutilise `/fil?tab=conferences`, `/conference/[id]` et l’alias `/direct/[id]`. Les routes et modèles internes ne changent pas avec leur libellé. Un direct terminé n’est pas nécessairement un replay disponible.
- Le natif `apps/antsia_mobile/src/app.tsx` a trois onglets Accueil/Messages/Réglages après U01 ; conversation personnelle, renvois Web pour groupes/commercial et profil. Il n’a pas encore la navigation cible à cinq destinations ni un studio de direct natif.

## 3. Lexique retenu

| Usage | Libellé ANTSIA | Sens conservé |
|---|---|---|
| Retour au fil | Accueil | Destination principale, sans confondre avec Mon fil |
| Découverte | Explorer | Personnes, contenus, boutiques et services réellement accessibles |
| Relations | Mon réseau | Connexions et suivi ; les deux actions restent distinctes |
| Invitation de connexion | Ajouter à mon réseau | Ne vaut ni suivi automatique ni statut « ami » |
| Publications vidéo dédiées | Clips | Seulement après U04 et une vraie source vidéo autorisée |
| Création et consultation éphémères | Stories | Réutilise les stories existantes et leurs règles |
| Diffusion en temps réel | Direct | Fonction ; **En live** désigne l’état actif |
| Consultation après diffusion | Replays | Seulement si un enregistrement lisible est disponible pour cette audience |
| Signets personnels | Enregistrés | Distinct des replays |
| Préférences du fil | Mon fil | Publications masquées, auteurs en sourdine et annulation de ces choix |

Ces choix sont locaux à ANTSIA, via i18n FR/EN. Ils n’imposent aucun changement de vocabulaire à DIASPORALE et ne renomment pas les tables, droits, contrats ou routes techniques. Le document 02 distingue les libellés déjà raccordés des propositions de lots ultérieurs ; les prompts utilisent ce même vocabulaire.

## 4. Présentation cible et transition

| Largeur CSS cible | Navigation | Contenu et panneaux |
|---|---|---|
| Téléphone `< 768 px` | Cible finale : Accueil, Clips, Messages, Explorer, Profil ; création par « + » nommé dans l’en-tête | Un document lisible, une colonne ; conversation ou détail remplace la liste avec retour ; marges et zones sûres |
| Tablette `768–1199 px` | Rail compact accessible, libellés disponibles ; création visible | Une ou deux colonnes selon la surface et la largeur utile ; fil et fiches ne sont pas étirés artificiellement |
| Ordinateur `≥ 1200 px` | Rail nommé ; **Boutiques** reste une entrée visible | Fil centré, largeur issue du contenu existant et des mesures futures ; panneaux contextuels, sans doublon d’iCom |

Sur téléphone, Boutiques reste atteignable par une puce clairement nommée dans Explorer ; elle ne devient pas une sixième destination basse. Les surfaces commerce historiques gardent leurs entrées personnelles.

**Transition obligatoire :** U02 pose la coque mais garde le bouton central Créer actuel tant que Clips n’a pas une route réelle, une requête autorisée, une pagination et ses états complets. U04 branche Clips puis effectue la bascule vers les cinq destinations cibles et le « + » de création. Aucune destination morte, aucun remplacement de l’immersion mixte par un simple changement de titre.

L’adaptation 768/1200 est un opt-in ANTSIA. Elle ne remplace pas le seuil partagé 959/960 pour tous les consommateurs. Redimensionner ne remonte ni la coque de session, ni l’hôte d’appel, ni son pool de salles ; le document reste le défileur principal hors lecteurs dédiés.

## 5. Lots exécutables

| Lot et prompt | Résultat concret | Dépendances et raccords |
|---|---|---|
| [U01 — Lexique](prompts/U01_LEXIQUE.md) | Libellés ANTSIA cohérents, Direct/En live, Mon fil conservé | Sources raccordées et contrôlées pour le candidat ANTSIA ; résultats et limites dans le bilan U08 |
| [U02 — Coque et navigation](prompts/U02_COQUE_NAVIGATION_RESPONSIVE.md) | Structure téléphone/tablette/ordinateur et navigation de transition réelle | Sources raccordées et contrôlées ; [bilan initial](rapports/U02_NAVIGATION_RESPONSIVE_2026-10-20.md) ; anciennes poses conservées hors opt-in |
| [U03 — Publications, stories, composeur](prompts/U03_PUBLICATIONS_STORIES_COMPOSEUR.md) | Cartes médias, actions et création lisibles ; fond blanc/cartes beige | U01, fondations U02 ; cartes P03, médias P04, stores de brouillons existants |
| [U04 — Explorer et Clips](prompts/U04_EXPLORER_CLIPS.md) | Explorer en grille et vrai fil vidéo ; bascule de navigation finale | U02 fondation + U03 ; nouvelle lecture backend vidéo bornée, garde des fichiers, lecteur unique |
| [U05 — Profils, pages et boutiques](prompts/U05_PROFILS_PAGES_BOUTIQUES.md) | Hub personnel, mur et vitrine identifiables ; onglets honnêtes | U02–U04 selon onglets ; P07–P09 et gardes des profils |
| [U06 — Messages et appels](prompts/U06_MESSAGERIE_APPELS.md) | Une colonne téléphone, liste/détail tablette/PC ; demandes et appels compréhensibles | U02 ; P05, P10 et P17b/c, sans promesse physique nouvelle |
| [U07 — Commerce contextuel](prompts/U07_COMMERCE_CONTEXTUEL.md) | CTA adaptés à l’offre, aux droits et à l’activation réelle | U03/U05/U06 ; contrats et capacités P07–P16, aucune ouverture des registres |
| [U08 — Finition et recette différée](prompts/U08_FINITION.md) | Accessibilité, états, cohérence et dossier de recette future | Tous les lots concernés ; preuves Web et natives séparées |

Séquence après U01/U02 raccordés : traiter U03, puis U04 et sa bascule de navigation ; traiter U05/U06 sur leurs fichiers réservés ; raccorder U07 ; clôturer les sources avec U08. Aucun lot n’autorise une modification simultanée d’un fichier déjà réservé par une autre session. Toute modification backend de Clips est une sous-tranche explicite de U04, pas un contournement de P16.

## 6. Contrats d’expérience transverses

- Une identité, une session vivante et un réseau explicite ; page ou boutique administrée ne devient pas un nouveau compte personnel. Les noms de personnes suivent le normaliseur partagé ; les organisations gardent leur propre nom.
- Audience, médias retenus, badges, métriques, droits d’édition, disponibilité et capacités commerciales viennent des projections serveur. Les clients ne fabriquent pas une autorité depuis un libellé, un onglet ou un compteur.
- Masquer, mettre en sourdine, annuler dans Mon fil, signaler et accéder aux paramètres restent atteignables. Ces actions ont des confirmations et erreurs adaptées à leur effet réel ; pas de copie générale du Centre de comptes Meta.
- Aucun onglet vide décoratif pour Identifié(e), Clips, Boutique ou Replays. Un onglet apparaît avec sa source et son droit ; sinon sa création constitue un travail à spécifier, sans données d’exemple substituées.
- Reprise de lecture et pagination ne réaffichent jamais un contenu retiré ni les données d’une autre personne. Chargement, vide, refus, suspension et hors ligne restent distingués.
- Les appels utilisent leur hôte persistant. Un token ou une connexion de salle ne prouve ni sonnerie physique ni audio ; un changement de thème ou de route ne doit pas déclencher une nouvelle autorisation caméra/micro.
- Pas de publicité, IA, carte géolocalisée ou abonnement payant ajouté sous prétexte de proximité avec Instagram. Pas de métrique sociale fictive, de republication factice ou de fausse permission de paiement.

## 7. Critères de clôture et niveaux de preuve

| Niveau | Preuve attendue | Ce qui ne suffit pas |
|---|---|---|
| Plan | Ce fichier, prompts, dépendances et surfaces identifiées | Ne prouve aucun changement visible |
| Source raccordée | Routes réelles, composants montés, options explicites, garde et repli décrits | Composant isolé, capture de référence ou test seulement écrit |
| Vérification automatisée | Résultat daté sur un candidat identifié, après autorisation de reprendre les vérifications | Résultat d’un lot historique ou d’un arbre différent |
| Observation Web | Parcours autorisé sur téléphone/tablette/PC, clair/sombre, clavier, erreurs et retour | HTTP 200 ou capture de mise en page seule |
| Observation native | Build identifié puis preuves iOS/Android physiques selon P17d | Présence de CallKit, simulateur ou état LiveKit connecté |
| Publication | Décision et livraison distinctes | Source raccordée ou recette locale |

**Demandes exécutées : analyse, documentation et raccords source U01/U02 seulement.** Les critères et scénarios des prompts sont destinés à la recette future, sans exécution automatique maintenant. Le rapport de chaque lot séparera modifications, scénarios écrits, contrôles exécutés, observations et limites.

## 8. Points à préciser lors de l’exécution des lots suivants

Les références locales, arbitrages de noms et compositions sont documentés dans 01–03. Réserver les fichiers avant chaque implémentation ; figer l’API, les index et les curseurs du vrai parcours Clips dans U04. Pour le natif, distinguer les écrans réellement portés des renvois Web existants et découper leurs adaptations dans les lots concernés. Aucune de ces réserves ne permet d’afficher une fonctionnalité simulée.
