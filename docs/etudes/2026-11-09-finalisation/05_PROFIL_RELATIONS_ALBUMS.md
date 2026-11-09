# Plan 05 — Profil, relations et albums

> Constaté par lecture du code d'`origin/main` (ANTSIA `26741caa`, DIASPORALE `bead76d`), le 9 novembre 2026. Rien n'a été exécuté.
> Applications de référence : Instagram, Facebook, LinkedIn, X, TikTok, Snapchat (code QR). Comparaison faite de mémoire (état des produits à la mi-2026), non revérifiée en ligne.

Chemins relatifs au dépôt ANTSIA, sauf mention contraire. Vocabulaire : une **mutation** est une fonction serveur qui écrit ; une **query** est une fonction serveur qui lit ; un **DTO** est la forme des données renvoyées à l'écran ; un **cliquet** est un test d'architecture qui empêche un retour en arrière.

## 1. L'intention du propriétaire

- **Une personne, une identité, une confiance calculée.** Le profil est celui d'une personne unique, avec un identifiant choisi, un nom affiché « jamais recopié d'un état civil sans geste », une accroche, une photo, une couverture, un mode privé et un retrait (cahier EXF-AN-05 ; ADR-0002). Les quatre badges (Officiel, Vérifié, Agent public, Communauté) sont calculés à chaque lecture, jamais stockés ni payants (cahier § 6.4, EXF-AN-07).
- **Deux formules de relation, jamais confondues.** Suivre sans être ami, ou être relié (ce qui vaut suivre) ; « Suivre en retour » quand l'autre nous suit déjà (ADR-0037, décision 5). Un abonnement n'ouvre que le public ; seule la connexion ouvre l'audience « relations » (`packages/social-domain/src/content.ts`, en-tête).
- **Se protéger sans bruit.** Blocage silencieux dans les deux sens, valable dans tous les réseaux ; sourdine ; « ne plus proposer » (EXF-AN-14 ; `docs/08_CONTRAT_DEMANDES_ET_DEBLOCAGES.md` ; décision du vault du 16/10).
- **Trouver des gens sans les exposer.** Suggestions par facettes communes, relations communes et pages suivies (EXF-AN-15) ; annuaire opt-in, sans coordonnées, contact par la messagerie (EXF-AN-33).
- **Le profil sert le pilier divertissement** (ADR-0035) : c'est la porte de chaque relation, de chaque mur et des albums ; il mène aussi vers la page d'activité et la boutique (étude des sept univers, § « page sociale »).
- **Déjà décidé ou refusé** : aucun compteur d'abonnés sur la fiche d'autrui (`ProfilPersonnePage.tsx`, en-tête : « Ne pas l'ajouter pour faire comme LinkedIn ») ; aucun faux multicompte ni vérification payante (prompt U05) ; aucune relation commune, actualité ou produit inventé (ADR-0033) ; onglets montrés seulement s'ils ont une vraie source (rapport U03/U05 : « Aucun onglet Identifié ni fausse grille Clips ») ; maquettes fidèles au code (mémoire du 19/10).

## 2. Ce qui existe

| Capacité | État | Web | Mobile | Preuve |
|---|---|---|---|---|
| Publier son profil (identifiant, nom affiché, accroche) | Présent | Oui | Non | `convex/modules/people/profile.ts` (`publishMyProfile`) ; `packages/social-features/src/features/reseau-personnel/ProfilePublicationCard.tsx` |
| Modifier nom et accroche | Présent | Oui | Non | `profile.ts` (`updateMyProfile`, modération du texte, annuaire resynchronisé) |
| Changer d'identifiant, l'ancien restant réservé à son titulaire | Présent | Oui | Non | `profile.ts` (`isHandleFreeFor`, table `handleHistory`) ; aucune redirection de l'ancienne adresse |
| Liens, centres d'intérêt | Absent | — | — | cherché `website`, `link`, `interests`, `centres d'intérêt`, `bio` dans `convex/modules/people/tables.ts` et l'i18n `reseau.profil.json` |
| Lieu (province) | Partiel | Non | Non | facette `province` déclarée, masquée par défaut (`convex/seeds/foundations.ts`) ; `setMyFacet`/`myFacet` (`convex/modules/people/facets.ts`) sans aucun écran |
| Photo de profil | Présent | Oui | Lecture | `profile.ts` (`setMyAvatar`, garde des fichiers, analyse antivirus) |
| Couverture | Présent | Oui | Lecture | `profile.ts` (`setMyCover`) ; `profil-personne.ts` (repli en dégradé) |
| Recadrage et retrait des métadonnées (EXIF : lieu GPS, appareil) des images de profil | Absent | — | — | `ProfilePublicationCard.tsx` envoie le fichier brut ; `exif` n'apparaît que dans `reseau-albums/AlbumComposer.tsx` et `album-model.ts` ; rien côté serveur |
| Badges calculés visibles | Présent | Oui | Oui | `packages/social-domain/src/badges.ts` ; `ProfilPersonnePage.tsx` (`signalBadges`) ; `apps/antsia_mobile/src/screens/profile-screens.tsx` |
| Mur et publication épinglée | Présent | Oui | Oui | `convex/modules/posts/posts.ts` (`personPosts`, `pinOnMyWall`, `unpinMyWall`) ; `PinnedWallPost` |
| Onglets Publications · Photos · Albums | Partiel | Oui | Non | `ProfilPersonnePage.tsx` (`PROFIL_TABS`) : « Photos » ne montre que les couvertures d'albums, pas les photos des publications |
| Onglets Relais et Identifié | Absent | — | — | rapport U03/U05 ; cherché `shares`, `relais`, `tagged`, `identifié` dans `PROFIL_TABS` |
| Lien vers les Clips de l'auteur | Présent | Oui | Non | `ProfilPersonnePage.tsx` (`clipsHref`) |
| Stories à la une | Absent | — | — | cherché `highlight`, `à la une`, `storyHighlights` dans `convex/modules/stories` et `features/stories` |
| Mode privé | Partiel | Oui | Non | `profile.ts` (`setMyProfilePrivacy`) : retire de l'annuaire, des suggestions et ferme tout lien nouveau ; ce n'est pas un compte privé à demandes d'abonnement |
| Retirer son profil, le republier | Présent | Oui | Non | `profile.ts` (`withdrawMyProfile`) ; `ProfilReseauSection.tsx` |
| Aperçu « vu par les membres » | Présent | Oui | Non | `ProfilPersonnePage.tsx` (`?apercu=1`, mêmes queries) |
| Profil public sans compte (`/@identifiant`) | Partiel | Oui | — | `convex/modules/public/access.ts` (`publicProfileByHandle`) ; `apps/antsia_ga/src/components/public/public-routes.tsx` : nom, photo, accroche, badges, affiliation d'agent ; ni couverture, ni publications, ni albums |
| Hub « Moi » | Présent | Oui | Oui | `apps/antsia_ga/src/app/(membre)/moi/me-screen.tsx`, `me-model.ts` ; `profile-screens.tsx` (`ProfileHubScreen`) |
| Code QR du profil | Absent | — | — | générateur prêt (`packages/social-features/src/features/qr/OpaqueQrCode.tsx`, utilisé par les invitations de groupe) ; aucun appel depuis le profil |
| Lien de partage du profil | Absent | — | — | cherché `share`, `clipboard`, `partager` dans `ProfilPersonnePage.tsx` ; seul `SharePostDialog.tsx` copie un lien |
| Compteurs d'abonnés, d'abonnements, de relations | Partiel | Oui | Non | `convex/modules/graph/follows.ts` (`myFollowerCount`, agrégat `followerCounts`) affiché dans `PeoplePanel.tsx` seulement ; aucun décompte d'abonnements ni de relations |
| Statistiques du profil | Absent | — | — | cherché `profileViews`, `statistiques`, `insights` |
| Signaler un profil | Partiel | Non | Non | serveur prêt : `convex/modules/moderation/cases.ts` (`report`, cible `person`, `targets.ts`) ; aucun bouton (`ReportContentDialog.tsx` ne connaît pas la cible profil) |
| Plusieurs comptes, bascule | Absent | — | — | cherché `switchAccount`, `multiSession`, `changer de compte` ; écarté (§ 4.4) |
| Demander une connexion (message facultatif) | Présent | Oui | Oui | `convex/modules/graph/connections.ts` (`requestConnection`, débit, découvrabilité) ; `use-connection-request.ts` ; carrousel mobile `feed-screen.tsx` |
| Accepter, refuser | Présent | Oui | Non | `respondToConnection` ; fiche, cloche, volet Relations |
| Annuler une demande envoyée | Présent | Oui | Non | `cancelSentRequest` (versionnée, doc 08) ; `PeoplePanel.tsx` |
| Rompre une relation acceptée | Absent | — | — | aucune mutation dans `convex/modules/graph/` ; le bouton « Connecté » est désactivé (`ConnectionButton`) |
| Suivre, ne plus suivre | Présent | Oui | Oui | `follows.ts` (`follow`, `unfollow`, cloche `new_follower`) |
| Suivre en retour | Partiel | Oui | Oui | champ `followsYou` du catalogue (`convex/modules/suggestions/suggestions.ts`, `SuggestionRelationActions.tsx`, `feed-screen.tsx`) ; absent de la fiche et de la cloche |
| Liste de mes abonnements | Présent | Oui | Non | `paginateMyFollows` ; `PeoplePanel.tsx` |
| Liste de mes abonnés, retirer un abonné | Absent | — | — | refusé dans `follows.ts` (« La LISTE de mes abonnés n'est pas exposée ») ; aucune mutation de retrait |
| Liste de mes relations et recherche | Présent | Oui | Non | `connections.ts` (`paginateMine`, `paginateMineSide`, `searchMine`) ; `use-dual-connection-pagination.ts` |
| Relations en commun | Absent | — | — | cherché `mutual`, `en commun`, `commonConnections` dans le moteur social ; seul `convex/modules/diaspora/suggestions.ts` les compte, pour DIASPORALE |
| Amis proches | Absent | — | — | cherché `closeFriends`, `amis proches`, `close_friends` |
| Bloquer | Partiel | Non | Non | serveur complet (`blockPerson`, `blockPair`, table `personBlocks`) ; **aucun bouton dans ANTSIA**, web ou mobile ; seul DIASPORALE l'appelle (`apps/diasporale_com/src/data/engine-source.ts`, dépôt DIASPORALE) |
| Liste des bloqués, débloquer | Partiel | Non | Non | `convex/modules/graph/blocks.ts` (`paginateMine`), `unblockPerson` ; composant `BlockedPeopleSection.tsx` monté seulement dans `apps/diasporale_com/src/screens/relations-screen.tsx` |
| Effets du blocage partout | Présent | — | — | `isBlockedBetween` ou `blockedCounterpartIds` lus par 54 fichiers du moteur (fil, recherche, mur, annuaire, iCom, appels, directs, groupes, albums, cloche…) ; les abonnements existants restent en place (décision du 16/10) |
| Sourdine | Présent | Oui | Oui | `convex/modules/marks/marks.ts` (`muteAuthor`, `paginateMyMutes`) ; menu de publication ; `PrivacyLists.tsx` ; absente de la fiche |
| Restreindre | Absent | — | — | cherché `restrict`, `restreindre`, `limited` dans `graph`, `marks`, `engagement` |
| Ne plus proposer, restaurer | Présent | Oui | Oui | `suggestions.ts` (`dismiss`, `restore`, `paginateDismissed`) |
| Suggestions (rail de cinq, catalogue paginé) | Présent | Oui | Oui | `follows.ts` (`suggestions`) ; `suggestions.ts` (`paginate`) : arrivées les plus récentes, sans score |
| Suggestions expliquées | Absent | — | — | aucune raison dans le DTO de `suggestions.paginate` |
| Recherche de personnes (nom, identifiant exact) | Présent | Oui | Non | `convex/modules/people/directory.ts` (`searchPeople`, index `search_name`) |
| Annuaire par province ou centre d'intérêt | Absent | — | — | `peopleDirectory` ne porte que `searchName` et `listed` |
| Trouver ses relations par le carnet de contacts | Absent | — | — | cherché `importContacts`, `addressBook`, `carnet`, `expo-contacts` |
| Composer et publier un album (titre, audience, photos, ordre, couverture, légendes, texte alternatif, EXIF retiré) | Présent | Oui | Non | `convex/modules/albums/albums.ts` ; `reseau-albums/AlbumComposer.tsx` |
| Retirer un album | Présent | Oui | Non | `albums.ts` (`withdraw`) ; `AlbumPage.tsx` |
| Supprimer un album, retirer une photo | Partiel | Non | Non | serveur prêt (`remove`, `removeItem`, purge par lots) ; aucun appel dans `reseau-albums/*.tsx` |
| Modifier un album depuis sa galerie | Partiel | Non | Non | `AlbumPage.tsx` accepte `onEdit`, que `apps/antsia_ga/src/components/reseau/reseau-screens.tsx` ne fournit pas |
| Signaler un album | Partiel | Non | Non | cible `album` prête dans `moderation/cases.ts` ; aucun bouton dans `AlbumPage.tsx` |
| Réactions et commentaires sur un album | Absent | — | — | cherché `album` dans `convex/modules/engagement` |
| Albums partagés | Absent | — | — | `convex/modules/albums/tables.ts` : « pas d'album partagé en V1 » |
| Identifier des personnes sur les photos | Absent | — | — | cherché `photoTag`, `personTag`, `identification` dans `albums` et `posts` |

**Décompte** : 55 capacités — 24 Présent, 12 Partiel, 19 Absent, 0 Fermé.

**Règle des noms (NOM en majuscules, Prénoms capitalisés).** Le normaliseur partagé existe et il est testé : `packages/social-domain/src/civilName.ts` (`normalizeCivilName`, `civilName.test.ts`). Il sert aux champs civils structurés (candidatures, comptes de démonstration). Il ne s'applique pas au nom affiché du profil, et c'est voulu : ce nom est libre et choisi par la personne (ADR-0002), et le fichier refuse explicitement de « découper un nom social libre ». Voir la décision D5.

### Ce qui est écrit mais jamais recetté en réel

| Sujet | État connu | Source |
|---|---|---|
| Invitation envoyée puis confirmée dans la cloche | Recetté entre deux comptes de démonstration, en local ; en ligne, seules des lectures (« Mes connexions » se charge) | `docs/COMPLEMENTS_SOCIAUX_2026-10-21.md` |
| Relations entre deux vraies identités | Jamais exercé | Dossier de reprise, § 10.1 (P0) |
| Blocage et déblocage | Prouvé par les suites automatiques (6 364 tests, 16/10) ; interface recettée seulement dans DIASPORALE ; jamais dans ANTSIA | `docs/08`, décision du vault du 16/10 |
| Profil public `/@identifiant` | Réponse HTTP 200 sur un profil fictif, en local | `docs/13_RAPPORT_RESEAU_PUBLIC_PA8.md` |
| Albums (composer, publier, retirer) | Non recetté | aucun rapport trouvé dans `docs/recette/` |
| Photo et couverture retenues par l'antivirus | Analyse réelle prouvée sur des vidéos de publication, pas sur des images de profil | vault `relations-analyses-medias-2026-10-20.md` |

## 3. Comparaison avec les applications de référence

Légende : Oui, Non, Part. (partiel), ? (non sûr, donc non affirmé).

| Capacité | Instagram | Facebook | LinkedIn | X | TikTok | Snapchat | ANTSIA | Verdict |
|---|---|---|---|---|---|---|---|---|
| Nom, accroche, photo, couverture | Oui (sans couverture) | Oui | Oui | Oui | Oui (sans couverture) | Part. | Oui | Déjà fait |
| Liens, lieu, centres d'intérêt | Oui | Oui | Oui | Oui | Part. | ? | Non | À faire (PF-09) |
| Recadrage de la photo | Oui | Oui | Oui | Oui | Oui | ? | Non | À faire (PF-03) |
| Changement d'identifiant | Oui | Oui | Oui | Oui | Oui | Part. | Oui | Déjà fait |
| Badge de vérification | Oui, payant possible | Oui, payant possible | Oui | Oui, payant | Oui | ? | Oui, calculé, jamais payant | Déjà fait, différenciant |
| Publication épinglée | Oui | Oui | Oui | Oui | Oui | — | Oui (une) | Déjà fait |
| Onglets médias, relais, identifié | Oui | Oui | Part. | Oui | Oui | — | Part. | À adapter (PF-14, PF-16) |
| Stories à la une | Oui | Oui | Non | Non | Non | Non | Non | À faire, après plan 03 (PF-15) |
| Compte privé à demandes d'abonnement | Oui | Part. | Non | Oui | Oui | — | Non (connexion à la place) | Écarté (§ 4.4, D11) |
| Code QR du profil | Oui | Oui | Oui | ? | Oui | Oui (Snapcode) | Non | À faire (PF-06) |
| Lien de partage | Oui | Oui | Oui | Oui | Oui | Oui | Non | À faire (PF-06) |
| Compteurs publics d'abonnés | Oui | Oui | Oui | Oui | Oui | Non | Non | Écarté pour autrui ; à soi seul (PF-07, D3) |
| Statistiques du profil | Pro | Pro | Oui | Pro | Pro | Pro | Non | Écarté pour les personnes (§ 4.4) |
| Signaler un profil | Oui | Oui | Oui | Oui | Oui | Oui | Non | À faire, P0 (PF-02) |
| Plusieurs comptes | Oui | Oui | Non | Oui | Oui | Non | Non | Écarté (une personne, un identifiant) |
| Relation symétrique (ami, connexion) | Non | Oui | Oui | Non | Part. (amis mutuels) | Oui | Oui | Déjà fait |
| Rompre une relation | — | Oui | Oui | — | — | Oui | Non | À faire (PF-05) |
| Suivre en retour | Oui | Oui | Oui | Oui | Oui | — | Part. | À faire (PF-07) |
| Voir et retirer ses abonnés | Oui | Oui | Oui | Oui | Oui | — | Non | À faire, à soi seul (PF-07, D2) |
| Relations en commun | Oui | Oui | Oui | Oui | ? | Oui | Non | À faire (PF-10) |
| Amis proches | Oui | Oui (listes) | Non | Non | Non | Part. | Non | Reporté (PF-17) |
| Bloquer, liste des bloqués | Oui | Oui | Oui | Oui | Oui | Oui | Serveur seul | À faire, P0 (PF-01, PF-04) |
| Sourdine | Oui | Oui | Oui | Oui | ? | ? | Oui | Déjà fait ; à offrir depuis la fiche (PF-01) |
| Restreindre | Oui | Part. | Non | Non | ? | Non | Non | Reporté (§ 4.4) |
| Suggestions expliquées | Part. | Oui | Oui | Part. | Part. | Oui | Non | À faire (PF-10) |
| Import du carnet de contacts | Oui | Oui | Oui | Oui | Oui | Oui | Non | Décision (D7), puis PF-18 |
| Annuaire par lieu ou intérêt | Non | Part. | Oui (recherche filtrée) | Non | Non | Non | Non | À faire, différenciant (PF-13) |
| Albums de photos | Non | Oui | Non | Non | Non | Non | Oui | Déjà fait ; à terminer (PF-11) |
| Albums partagés | Non | Oui | Non | Non | Non | Non | Non | Reporté (§ 4.4) |
| Identifier des personnes | Oui | Oui | Oui | Non | Oui | Non | Non | À faire, avec approbation (PF-16) |

## 4. Ce qui manque

### 4.1 Bloquant avant l'ouverture au public

1. **Aucun moyen de bloquer quelqu'un dans ANTSIA**, ni sur le web ni sur le mobile, et aucune liste des personnes bloquées. Le serveur est prêt et éprouvé. Un réseau ouvert sans blocage expose au harcèlement ; les règles de l'App Store pour les contenus d'utilisateurs exigent, de mémoire, un moyen de bloquer et de signaler (guideline 1.2, à revérifier).
2. **Impossible de signaler un profil ou un album**, alors que le serveur accepte ces cibles et applique les délais légaux de SU01d. L'ordonnance 0011 impose de traiter les signalements ; encore faut-il pouvoir les faire.
3. **Les images de profil partent avec leurs métadonnées EXIF** (souvent la position GPS du domicile). Les albums les retirent déjà ; la photo de profil, visible de tout le réseau, non.
4. **Le mobile n'a ni blocage ni signalement de profil** (le signalement de publication existe dans `post-actions.tsx`).

### 4.2 Attendu par les utilisateurs

- Rompre une relation acceptée.
- Voir ses propres abonnés, en retirer un, « Suivre en retour » partout où l'on rencontre la personne (fiche, cloche, listes).
- Partager son profil : lien et code QR.
- Recadrer sa photo et sa couverture.
- Un lien, une province et des centres d'intérêt sur le profil.
- Relations en commun, et la raison d'une suggestion.
- Profil public sans compte plus complet (couverture, publications déjà publiques).
- Albums : supprimer, retirer une photo, modifier depuis la galerie.
- Sur le mobile : Suivre, Ajouter, Accepter et Écrire depuis une fiche ; voir les albums et ses relations.
- Onglets Médias et Relais ; Stories à la une ; identification sur les photos.

### 4.3 Différenciant pour ANTSIA

- **Confiance calculée et gratuite** : la fiche dit pourquoi un badge est là (« Vérifié par Identité.ga », « Agent public de <administration> ») au lieu d'un macaron opaque. Les références vendent la vérification ; ANTSIA ne le fera jamais.
- **Annuaire national par province** (les neuf provinces sont déjà au référentiel) et par centre d'intérêt, opt-in, sans coordonnées : un usage que les références ne servent pas au Gabon.
- **Code QR hors ligne** : affiché sans réseau, imprimable sur une carte de visite ou une affiche de boutique, et menant au profil public lisible sans compte. Utile sur un réseau 3G cher.
- **Suggestions expliquées et sobres** : de vraies raisons, comptées sur des lectures bornées, sans profilage sensible ni score caché.
- **Le profil comme porte du business** : de la fiche d'une personne vers sa page d'activité et sa boutique, sans second compte (dépend des plans 07 et 08).

### 4.4 Écarté ou reporté, et pourquoi

| Sujet | Décision | Raison |
|---|---|---|
| Plusieurs comptes, bascule | Écarté | Invariant « une personne, un identifiant » ; prompt U05 : « Aucun bouton de faux multicompte ». Les pages couvrent les identités d'activité (plan 07) |
| Compteurs sur la fiche d'autrui | Écarté | Décision écrite dans `ProfilPersonnePage.tsx` ; reconstituer « qui suit qui » une fiche à la fois |
| Statistiques d'un profil personnel | Écarté | Aucune mesure d'audience personnelle n'existe ; pas de chiffre sans donnée. Les statistiques de page relèvent du plan 07 |
| Compte privé à demandes d'abonnement | Écarté (D11) | Dans ANTSIA, la connexion EST l'audience privée ; l'abonnement n'ouvre que le public. Un second mécanisme dupliquerait la connexion |
| Restreindre | Reporté (P3) | Proche de la sourdine et du filtrage des commentaires (plan 02) ; à reconsidérer après le pilote |
| Albums partagés | Reporté (P3) | Droits de dépôt, retrait et effacement à plusieurs ; aucun besoin exprimé |
| Redirection d'un ancien identifiant | Écarté | Révélerait le lien entre ancien et nouvel identifiant ; l'ancien reste réservé, ce qui suffit |
| Recommandations et compétences | Hors périmètre | Profil professionnel, plan 09 |

## 5. Lots d'implémentation

### PF-01 — Bloquer, débloquer et liste des bloqués · priorité P0 · taille M · session S1
- **Pour l'utilisateur** : depuis une fiche ou le menu « … » d'une publication, « Bloquer @identifiant » ; une confirmation dit ce que cela fait ; la liste de mes blocages permet de débloquer.
- **Backend** : rien de neuf pour bloquer (`connections.blockPerson`, `unblockPerson`, `blocks.paginateMine`). Sous D1 : `blockPair` supprime aussi les abonnements dans les deux sens, tous réseaux. Il faut pour cela un index `by_follower_target` (`followerPersonId`, `targetPersonId`) sur `follows` dans `convex/modules/graph/tables.ts`, la mise à jour de l'agrégat `followerCounts` et `refreshReaderFeed`. Ajouter `marks.isAuthorMuted({ networkId, targetPersonId })`, une query de lecture seule, pour le geste de sourdine sur la fiche.
- **Web** : nouveau `packages/social-features/src/features/reseau-personnel/ProfileOverflowMenu.tsx` sur la fiche d'autrui : Bloquer, Signaler (PF-02), Mettre en sourdine / Réactiver, Copier le lien (PF-06). Le dialogue de confirmation réutilise le texte `bloquer` de `profile-visibility-copy.ts`. Après le blocage, retour au volet Relations avec un toast. Dans l'état `blocked_by_me`, le bouton désactivé « Bloqué » de `ConnectionButton` devient « Débloquer ». Entrée « Bloquer » ajoutée dans `post-overflow.ts` et `PostOverflowMenu.tsx` (auteur personne seulement), à coordonner avec le plan 02. `BlockedPeopleSection` monté dans `ProfilReseauSection.tsx` à côté de `PrivacyLists` ; le plan 06 pourra le déplacer sous Confidentialité.
- **Mobile** : PF-04.
- **Données personnelles** : `personBlocks` déjà exporté (intentions émises seulement) et effacé (doc 08). La suppression des abonnements doit être prouvée par le test d'effacement.
- **Tests et cliquets** : `graph.test.ts` (abonnements supprimés dans les deux sens, décompte de l'agrégat juste, rejeu idempotent, paire de plus de 100 lignes refusée sans effet) ; tests de `ProfileOverflowMenu`, `post-overflow.test.ts`, `ProfilPersonnePage.test.tsx` (état `blocked_by_me`) ; cliquets `rate-limited-writes`, `no-hardcoded-strings`, `i18n-locales`.
- **Critères d'acceptation** : bloquer depuis la fiche et depuis une publication ; la fiche de la personne bloquée rend le refus indistinct pour les deux ; la personne bloquée disparaît du fil, de la recherche et des suggestions ; la liste montre le blocage et le lève ; aucune notification n'est émise ; contrôlé à 390, 834 et 1440 px, en clair et en sombre.
- **Dépend de** : D1 (abonnements) ; plan 02 pour le menu de publication.
- **Porte** : D1 seulement pour la suppression des abonnements ; le reste n'a aucune porte.

### PF-02 — Signaler un profil et un album · priorité P0 · taille S · session S1
- **Pour l'utilisateur** : « Signaler » dans le menu de la fiche et dans celui d'un album, avec les motifs habituels et l'accusé de réception légal.
- **Backend** : aucun changement ; `moderation.cases.report({ networkId, target: { kind: "person" | "album", id }, reason })` existe, avec rejeu idempotent, délais SU01d et accusé de réception.
- **Web** : étendre le type `kind` de `ReportContentDialog.tsx` à `profile` et `album` (titres `reportContentDialog.title.profile` et `.album`, en fr et en) ; brancher dans `ProfileOverflowMenu` (PF-01) et dans `AlbumPage.tsx` pour un album d'autrui. Le bouton se fige une fois signalé, comme dans `apps/antsia_ga/src/components/professionals/profile-fields.tsx`.
- **Mobile** : PF-04.
- **Données personnelles** : signalements déjà couverts par le module de modération.
- **Tests et cliquets** : tests du dialogue (nouvelles cibles) ; vérifier que la file de modération et la console savent afficher une cible `person` et `album` (`convex/modules/moderation/targets.ts`) ; cliquet `i18n-locales`.
- **Critères d'acceptation** : un signalement de profil et un d'album apparaissent dans la file de l'équipe de modération ; signaler sa propre fiche est impossible ; un second signalement ne crée pas de doublon.
- **Dépend de** : PF-01 (menu) ; plan 12 pour le traitement.
- **Porte** : aucune.

### PF-03 — Images de profil : recadrage et retrait des métadonnées · priorité P0 · taille M · session S1
- **Pour l'utilisateur** : choisir une photo, la recadrer (cercle pour la photo, bandeau pour la couverture), voir l'aperçu, envoyer une image sans position GPS.
- **Backend** : aucun changement ; la politique d'usage `avatar`/`cover` et la garde des fichiers restent l'autorité.
- **Web** : un recadreur sur `<canvas>`, sans nouvelle dépendance, dans `packages/social-features/src/features/reseau-personnel/` (`ProfileImageCropper.tsx` et un module pur `profile-image-crop.ts`). Il réutilise la logique de ré-encodage fail-closed des albums (`albumReencodePlan` dans `reseau-albums/album-model.ts`, à extraire dans un module commun). Il est appelé par `ProfilePublicationCard.tsx` avant `generateProfileUploadUrl`. Clavier : flèches pour déplacer, plus et moins pour zoomer. États : chargement, refus du format, échec du ré-encodage (refus, jamais l'original).
- **Mobile** : après le web (le mobile ne modifie pas encore le profil).
- **Données personnelles** : moins de données envoyées ; rien de neuf à exporter.
- **Tests et cliquets** : tests purs du cadrage (bornes, ratio, sortie) et de la décision de ré-encodage ; `upload-policy`, `fresh-upload`.
- **Critères d'acceptation** : une image test porteuse de coordonnées GPS ressort sans EXIF (vérifié sur le blob stocké en local) ; le recadrage est fidèle à l'aperçu ; un ré-encodage impossible refuse le fichier.
- **Dépend de** : rien.
- **Porte** : aucune.

### PF-04 — Mobile : bloquer et signaler · priorité P0 · taille S · session S3
- **Pour l'utilisateur** : sur l'iPhone et l'Android, « Bloquer » et « Signaler » depuis une fiche et depuis le menu d'une publication.
- **Backend** : aucun.
- **Web** : aucun.
- **Mobile** : `apps/antsia_mobile/src/screens/profile-screens.tsx` (menu de la fiche) et `post-actions.tsx` (entrée Bloquer l'auteur) ; appels à `graph.connections.blockPerson` et `moderation.cases.report` ; confirmation native ; textes dans l'i18n du mobile, en fr et en.
- **Données personnelles** : celles de PF-01 et PF-02.
- **Tests et cliquets** : tests des écrans (garde `useNativeGuard`, double appui) ; recette sur le simulateur iPhone.
- **Critères d'acceptation** : bloquer et signaler depuis les deux surfaces ; la fiche bloquée rend le refus indistinct ; accessibilité VoiceOver des deux actions.
- **Dépend de** : aucun lot serveur ; mêmes textes que PF-01 et PF-02.
- **Porte** : publication sur TestFlight sur accord écrit du propriétaire.

### PF-05 — Rompre une relation · priorité P1 · taille M · session S1
- **Pour l'utilisateur** : sur une relation, le bouton « Connecté » ouvre « Retirer de mes relations » ; l'autre n'est pas prévenu ; on peut se reconnecter plus tard.
- **Backend** : `connections.removeConnection({ networkId, connectionId })`, `networkMutation`, nouveau seau de débit `connection.remove` dans `convex/lib/rateLimit.ts`. Seule une des deux parties d'une ligne `accepted` du réseau courant peut l'appeler ; un tiers reçoit le refus indistinct. La ligne passe à `declined` avec `respondedAt`. Puis `refreshReaderFeed` des deux côtés et `live.revocation.revokeConnectionDirects`. Les abonnements restent en place : être relié valait suivre, et l'on garde l'abonnement explicite. Effet sur les conversations iCom selon D4 et le plan 01.
- **Web** : `ConnectionButton` (`ProfilPersonnePage.tsx`) et les cartes de relation de `PeoplePanel.tsx` : menu avec confirmation, toast, retour à l'état « Ajouter ».
- **Mobile** : dans PF-12.
- **Données personnelles** : aucune nouvelle donnée ; l'export des connexions reflète l'état.
- **Tests et cliquets** : `graph.test.ts` (parties, tiers, autre réseau, rejeu, blocage concurrent, demande rouverte ensuite, audience « relations » refermée) ; `rate-limited-writes`, `network-scoped-functions`.
- **Critères d'acceptation** : après le retrait, les publications « relations » de l'un ne sont plus lues par l'autre ; aucune notification ; une nouvelle demande est possible.
- **Dépend de** : D4 ; plan 01.
- **Porte** : D4.

### PF-06 — Partager mon profil : lien et code QR · priorité P1 · taille S · session S1
- **Pour l'utilisateur** : « Partager mon profil » sur ma fiche et dans « Moi » ; copier le lien public, partage natif du téléphone, code QR plein écran, téléchargeable en PNG pour l'imprimer. Sur la fiche d'autrui, « Copier le lien ».
- **Backend** : aucun ; le lien est l'adresse publique `routes.publicProfile(handle)`.
- **Web** : `ProfileShareDialog.tsx` (dans `reseau-personnel`) avec `OpaqueQrCode` (déjà au catalogue : `react-qr-code`). L'origine du lien vient de l'environnement, jamais en dur. `navigator.share` quand il existe, sinon copie. Entrée dans `me-screen.tsx`. Un profil retiré ou privé ne propose pas de lien public : le profil public le refuserait.
- **Mobile** : après le web (feuille de partage native dans PF-12).
- **Données personnelles** : aucune.
- **Tests et cliquets** : `no-hardcoded-urls`, `no-hardcoded-colors` (le QR hérite de l'encre) ; tests du dialogue.
- **Critères d'acceptation** : le QR scanné par l'appareil photo d'un téléphone ouvre `/@identifiant` ; sans réseau, le QR déjà ouvert reste affiché ; mode privé ou retrait : aucune offre de partage public.
- **Dépend de** : PF-08 conseillé, pour que le lien mène à un profil public utile.
- **Porte** : aucune.

### PF-07 — Mes abonnés, Suivre en retour, compteurs à soi · priorité P1 · taille M · session S1
- **Pour l'utilisateur** : dans Relations, un onglet « Abonnés » visible de moi seul, avec « Suivre en retour » et « Retirer cet abonné » ; sur la fiche d'une personne qui me suit, « Suivre en retour » ; sur ma fiche, mes trois décomptes réels.
- **Backend** : `follows.paginateMyFollowers` (moi seul, index `by_network_target_createdAt`, page bornée à 50, profils par `miniProfileCache`, blocages écartés) ; `follows.removeFollower({ networkId, followerPersonId })` (seau `follow.toggle`, agrégat mis à jour, aucune notification) ; `follows.followsMe({ networkId, otherPersonId })`. Décomptes : agrégats `followingCounts` et `connectionCounts` déclarés dans `convex/convex.config.ts` (fichier partagé) et tenus par les écrivains de `follows` et `connections`, plus une migration de remplissage.
- **Web** : vue `followers` ajoutée à `PEOPLE_VIEW_IDS` (`people-panel.ts`) et à `PeoplePanel.tsx` ; `FollowButton` de la fiche lit `followsMe` et dit « Suivre en retour » ; la cloche `new_follower` (`notification-targets.ts`) mène à la fiche, où le bouton existe. Décomptes sur ma fiche seulement, chacun menant à sa liste.
- **Mobile** : dans PF-12.
- **Données personnelles** : la liste des abonnés entre dans l'export de la personne suivie (les abonnés sont des personnes : seulement leur identifiant public au moment de l'export).
- **Tests et cliquets** : moi seul (un tiers ne lit jamais la liste), retrait idempotent, agrégats justes après suivre, retirer, bloquer, effacer ; `no-unbounded-collect`.
- **Critères d'acceptation** : aucune liste ni décompte d'autrui n'est lisible par un tiers, même par l'API ; les décomptes égalent les lignes réelles sur la démonstration.
- **Dépend de** : D2, D3 ; PF-01 (agrégat après blocage).
- **Porte** : D2 et D3 ; fichier partagé `convex/convex.config.ts` (S1).

### PF-08 — Profil public enrichi sans compte · priorité P1 · taille M · session S1
- **Pour l'utilisateur** : un visiteur sans compte voit la couverture et les publications déjà publiques (`root`) de la personne, avec une invitation à entrer.
- **Backend** : une projection SÉPARÉE `public.projections.profileExtras({ networkId, handle, paginationOpts })`. Elle rend la couverture et les publications `onRoot` publiées dont la personne est l'auteur. Elle exige un nouvel index `by_root_author_status_publishedAt` sur `posts`, avec les mêmes gardes que `publicProfileByHandle` : découvrable, membre actif, contenu public autorisé, blocage du lecteur connu. On ne touche pas `publicProfileValidator` : le front lit chaque DTO public en schéma strict, et un champ ajouté casserait les fronts en ligne (piège consigné dans `CLAUDE.md`).
- **Web** : `ProfileScreen` de `public-routes.tsx` et `apps/antsia_ga/src/lib/public-data.ts` (lecteur Zod `.strict()` de la nouvelle projection, absence tolérée) ; métadonnées de partage (image de couverture) ; `noindex` pour un profil privé ou retiré, qui reste fermé.
- **Mobile** : sans objet.
- **Données personnelles** : rien de neuf ; seul ce qui est déjà public est servi.
- **Tests et cliquets** : `convex/modules/public/projections.test.ts` (privé, retiré, suspendu, publication `network` jamais servie) ; `public-communication`.
- **Critères d'acceptation** : sans cookie, une publication `network` n'apparaît jamais ; l'ancien front reste fonctionnel face au nouveau backend.
- **Dépend de** : D10 ; plan 13 pour le référencement.
- **Porte** : D10.

### PF-09 — Champs du profil : lien, province, centres d'intérêt · priorité P1 · taille M · session S1
- **Pour l'utilisateur** : ajouter un lien (site, boutique), choisir sa province et jusqu'à cinq centres d'intérêt, chacun avec sa visibilité (membres du réseau, ou masqué).
- **Backend** : `persons.website` (validé par une règle du domaine : https seulement, longueur bornée, modéré avec le nom). Province et centres d'intérêt dans la facette du réseau racine (`personFacets`, `setMyFacet`) : on ajoute au `facetSchema` d'`antsia` (`convex/seeds/foundations.ts`, plus une migration pour la base existante) un champ `interests` à liste fermée, dont le référentiel vit dans `packages/social-domain`. `getPublicProfile` rend les champs visibles par la projection `projectFacets`.
- **Web** : champs dans `ProfilePublicationCard.tsx` (React Hook Form et Zod) ; affichage sous l'accroche dans `ProfilPersonnePage.tsx` (lien en `rel="nofollow ugc noopener"`).
- **Mobile** : lecture dans PF-12.
- **Données personnelles** : export et effacement de `website` (table `persons`) et de la facette (déjà inventoriée) ; visibilité par défaut : masquée.
- **Tests et cliquets** : règle du lien (schémas refusés : `javascript:`, `data:`, http) ; projection des visibilités ; `erasure.test.ts` ; `i18n-locales`.
- **Critères d'acceptation** : un champ masqué n'apparaît dans aucune projection d'autrui ; le lien est modéré comme le nom.
- **Dépend de** : D6.
- **Porte** : D6 (référentiel des centres d'intérêt).

### PF-10 — Relations en commun et suggestions expliquées · priorité P1 · taille M · session S1
- **Pour l'utilisateur** : « 3 relations en commun », « Vous suit », « Même province » sur une carte de suggestion et sur la fiche ; la liste des relations communes que j'ai le droit de voir.
- **Backend** : dupliquer le comptage borné de `convex/modules/diaspora/suggestions.ts` (`mutualConnections`, `MUTUAL_SCAN`) dans le moteur générique, avec l'en-tête de provenance et sans import de `@diasporale/domain` (cliquet `no-cross-product-imports`) : règle pure dans `packages/social-domain/src/suggestionReasons.ts`, lecture dans `convex/modules/suggestions/suggestions.ts`. Le DTO de `paginate` gagne `reasons: { mutualConnections, followsYou, sameProvince }`. La province n'est comparée que si les deux facettes la rendent visible. Nouvelle query `graph.connections.paginateMutual({ networkId, otherPersonId, paginationOpts })`, bornée. Classement : les raisons d'abord, puis la fraîcheur, sans score caché.
- **Web** : `SuggestionsPanel.tsx`, `PeoplePanel.tsx`, fiche (ligne « relations en commun », qui mène à la liste).
- **Mobile** : carrousel de `feed-screen.tsx` dans PF-12.
- **Données personnelles** : rien de stocké ; calcul à la lecture.
- **Tests et cliquets** : décompte exact sur un graphe connu ; lecture tronquée annoncée (« au moins N ») ; blocages exclus ; profils privés exclus.
- **Critères d'acceptation** : aucune raison sans donnée réelle (ADR-0033) ; une suggestion sans raison n'affiche rien d'inventé.
- **Dépend de** : PF-09 (province).
- **Porte** : aucune.

### PF-11 — Albums : terminer la gestion · priorité P1 · taille S · session S1
- **Pour l'utilisateur** : supprimer un album, retirer une photo, ouvrir « Modifier » depuis la galerie.
- **Backend** : aucun (`albums.remove`, `albums.removeItem` existent, purge par lots).
- **Web** : `AlbumPage.tsx` : « Supprimer l'album » (dialogue : irréversible, photos et fichiers purgés) et retrait d'une photo ; `reseau-screens.tsx` fournit `onEdit`, qui ouvre `AlbumComposer` sur l'album (onglet Albums du profil avec l'identifiant). Ajouter `remove` et `removeItem` aux usages de `albums-api.ts`.
- **Mobile** : après le web.
- **Données personnelles** : déjà couvertes (`albumItems` dans `convex/modules/people/dataPolicies.ts`).
- **Tests et cliquets** : tests de `AlbumPage` (propriétaire seulement, confirmation, état après purge).
- **Critères d'acceptation** : un album supprimé disparaît aussitôt de toutes les listes ; ses fichiers ne sont plus servis.
- **Dépend de** : rien.
- **Porte** : aucune (suppression voulue par la personne sur son contenu).

### PF-12 — Profil mobile complet · priorité P1 · taille L · session S3
- **Pour l'utilisateur** : sur le téléphone, depuis une fiche : Suivre, Suivre en retour, Ajouter, Accepter ou Refuser, Écrire, Retirer la relation ; voir les albums ; ouvrir ses relations, ses abonnements et ses abonnés ; partager son profil.
- **Backend** : ceux de PF-05, PF-07, PF-10.
- **Web** : aucun.
- **Mobile** : `profile-screens.tsx`, nouvel écran de relations, lecture d'albums ; `native-profile-view.ts` ; feuille de partage native. Navigation dans les cinq destinations existantes, sans nouvel onglet.
- **Données personnelles** : aucune nouvelle.
- **Tests et cliquets** : tests des modèles purs (`native-profile-view.test.ts`), garde réseau.
- **Critères d'acceptation** : chaque geste du web a son équivalent ou un renvoi web explicite ; aucune parité annoncée sans audit (plan 14).
- **Dépend de** : PF-05, PF-07 ; plan 14.
- **Porte** : publication TestFlight sur accord.

### PF-13 — Annuaire par province et centres d'intérêt · priorité P2 · taille M · session S1
- **Pour l'utilisateur** : dans Relations, filtrer les personnes par province et par centre d'intérêt ; seules celles qui l'ont choisi apparaissent.
- **Backend** : `peopleDirectory` gagne `province` et `interests` (dénormalisés par `syncPersonDirectory` depuis la facette, seulement si leur visibilité est « réseau ») ; index `by_network_listed_province` ; pagination native ; `searchPeople` accepte un filtre `province`.
- **Web** : filtres dans `PeoplePanel.tsx` ; états vides honnêtes.
- **Mobile** : après le web.
- **Données personnelles** : projection dérivée, effacée avec la personne (déjà inventoriée).
- **Tests et cliquets** : opt-in strict, réseau gouverné refusé, `no-unbounded-collect`.
- **Critères d'acceptation** : une personne qui masque sa province n'apparaît sous aucun filtre de province.
- **Dépend de** : PF-09.
- **Porte** : aucune.

### PF-14 — Onglets Médias et Relais · priorité P2 · taille M · session S1
- **Pour l'utilisateur** : sur une fiche, la grille des photos et vidéos de ses publications, et ses relais.
- **Backend** : `posts.personMedia` et `posts.personShares`, paginées, avec la même garde que `personPosts` (audience, blocage, modération) ; index par auteur à vérifier dans `convex/modules/posts/tables.ts`.
- **Web** : deux onglets dans `PROFIL_TABS`, rendus seulement si la source existe ; « Photos » renommé « Albums photo » si l'on garde les deux.
- **Mobile** : après le web.
- **Données personnelles** : aucune nouvelle.
- **Tests et cliquets** : audience « relations » jamais servie à un abonné.
- **Critères d'acceptation** : aucun onglet vide décoratif.
- **Dépend de** : plan 02 (publications, relais).
- **Porte** : aucune.

### PF-15 — Stories à la une · priorité P2 · taille M · session S1
- **Pour l'utilisateur** : garder des Stories expirées dans des collections affichées sous l'identité.
- **Backend** : table `storyHighlights` (`networkId`, propriétaire, titre, couverture, références de stories conservées, audience) ; conservation des médias au-delà de 24 h seulement pour une story mise à la une ; effacement.
- **Web** : rangée sous l'identité ; gestion depuis le lecteur de Stories.
- **Mobile** : après le web.
- **Données personnelles** : export, effacement, durée de conservation choisie.
- **Tests et cliquets** : `file-delivery-gate`, audience, blocage.
- **Critères d'acceptation** : une story retirée ou modérée disparaît aussi de la une.
- **Dépend de** : plan 03.
- **Porte** : fichier partagé `convex/schema.ts` si un nouveau module de tables est créé (S1).

### PF-16 — Identifier des personnes sur les photos · priorité P2 · taille L · session S1
- **Pour l'utilisateur** : identifier une relation sur une photo d'album ou de publication ; elle approuve ou refuse ; elle peut se retirer à tout moment ; onglet « Identifié(e) » sur sa fiche.
- **Backend** : table `photoTags` (`networkId`, média, personne identifiée, auteur, statut `pending|approved|removed`) ; relations seulement ; approbation préalable (D8) ; cloche sans contenu (cliquet `notification-payload-content`) ; débit.
- **Web** : sélecteur sur la photo dans `AlbumComposer.tsx` et le composeur (plan 02) ; liste des identifications à approuver.
- **Mobile** : après le web.
- **Données personnelles** : export pour les deux parties, effacement, retrait immédiat.
- **Tests et cliquets** : blocage, retrait, effacement, modération.
- **Critères d'acceptation** : rien n'est visible avant l'approbation.
- **Dépend de** : D8 ; plan 02.
- **Porte** : D8.

### PF-17 — Amis proches · priorité P3 · taille M · session S1
- **Pour l'utilisateur** : une liste privée de proches, puis une audience « Proches » pour une publication ou une story.
- **Backend** : table `closeFriends` ; nouvelle audience dans `PERSONAL_REACH_AUDIENCES` (impact large : fil, gardes, export).
- **Web** : gestion dans Relations ; choix d'audience (plans 02 et 03).
- **Mobile** : après le web.
- **Données personnelles** : liste privée, exportée, effacée.
- **Tests et cliquets** : garde d'audience (`isConnected || isFollowing` jamais écrit).
- **Critères d'acceptation** : la liste n'est jamais révélée aux personnes listées.
- **Dépend de** : D9 ; plans 02 et 03.
- **Porte** : D9.

### PF-18 — Trouver ses relations par le carnet de contacts · priorité P3 · taille L · session S1 et S3
- **Pour l'utilisateur** : sur le mobile, « Trouver mes contacts sur ANTSIA », avec un consentement explicite.
- **Backend** : correspondance d'empreintes salées calculées sur l'appareil, contre les seuls numéros vérifiés des personnes ayant consenti à « être trouvées par mon numéro » (nouveau consentement) ; aucun numéro de tiers stocké ; débit strict.
- **Web** : réglage « Être trouvé par mon numéro » (plan 06).
- **Mobile** : permission Contacts (nouvelle dépendance `expo-contacts`, au catalogue racine, S1) ; écran de résultats.
- **Données personnelles** : données de tiers : analyse d'impact, mention dans la politique de confidentialité, avis de l'autorité de protection des données.
- **Tests et cliquets** : aucune persistance des empreintes envoyées ; `notification-payload-content`.
- **Critères d'acceptation** : un non-consentant n'est jamais trouvé ; rien n'est conservé après la réponse.
- **Dépend de** : D7 ; plans 06 et 14.
- **Porte** : avis du juriste et de l'autorité de protection des données ; décision D7 ; fichier partagé `package.json`.

## 6. Ordre recommandé et dépendances

| Vague | Lots | Pourquoi dans cet ordre |
|---|---|---|
| 1 | PF-01, PF-02, PF-03 (S1) ; PF-04 (S3, en parallèle) | Sécurité et vie privée avant l'ouverture ; serveur déjà prêt, risque faible |
| 2 | PF-05, PF-07, PF-11, PF-06 | Gestes attendus de quiconque vient des références ; PF-07 touche `convex.config.ts` : un seul passage S1 |
| 3 | PF-09, PF-10, PF-08 ; PF-12 (S3) | PF-10 utilise la province de PF-09 ; le mobile suit les backends des vagues 2 et 3 |
| 4 | PF-13, PF-14, PF-15, PF-16 | Différenciation ; dépendent des plans 02 et 03 |
| 5 | PF-17, PF-18 | Sous condition (décisions, juriste) |

**Dépendances vers les autres plans** : plan 01 (effet du retrait d'une relation sur iCom, blocage depuis une conversation) ; plan 02 (menu de publication, audiences, relais, identification dans le composeur) ; plan 03 (Stories à la une, recherche globale de personnes, Clips de l'auteur) ; plan 06 (place de la liste des bloqués sous Confidentialité, consentement « être trouvé », écran Mes données) ; plan 07 (lien du profil vers la page d'activité, statistiques de page) ; plan 09 (profil professionnel, compétences, recommandations) ; plan 12 (traitement des signalements de profil et d'album, délais légaux) ; plan 13 (référencement et image de partage du profil public) ; plan 14 (parité mobile).

## 7. Décisions à prendre par le propriétaire

1. **D1 — Bloquer supprime-t-il les abonnements dans les deux sens ?** Aujourd'hui ils restent (décision du 16/10) et le décompte d'abonnés compte la personne bloquée. *Recommandation* : oui, comme les références ; c'est ce que la personne attend en bloquant. **Décidé par le propriétaire le 9/11/2026 :** oui, bloquer supprime les abonnements dans les deux sens.
2. **D2 — Voir la liste de ses propres abonnés et en retirer un ?** Le code la refuse à tous, y compris à soi. *Recommandation* : oui pour soi seul, jamais pour un tiers ; sans elle, ni « Suivre en retour » depuis une liste, ni défense contre un suiveur indésirable autre que le blocage.
3. **D3 — Décomptes sur sa propre fiche ?** *Recommandation* : oui, abonnés, abonnements et relations, visibles de soi seul ; jamais sur la fiche d'autrui (décision en vigueur).
4. **D4 — Rompre une relation : que devient la conversation iCom ?** *Recommandation* : elle reste lisible ; un nouvel envoi suit la règle d'une conversation entre non-relations (plan 01).
5. **D5 — Nom affiché et règle « NOM en majuscules ».** Le nom du profil est libre (ADR-0002, `civilName.ts`). *Recommandation* : le garder libre ; appliquer `normalizeCivilName` seulement aux champs civils structurés, et à un nom repris d'Identité.ga si un jour on en propose un, par un geste de la personne.
6. **D6 — Quels champs de profil ?** *Recommandation* : un seul lien https, la province (référentiel existant), jusqu'à cinq centres d'intérêt pris dans une liste fermée d'une trentaine d'entrées, rédigée par le propriétaire ; pas de texte libre d'intérêts (modération, profilage).
7. **D7 — Import du carnet de contacts.** Il touche des données de tiers qui n'ont pas consenti. *Recommandation* : ne pas le faire avant l'avis de l'autorité de protection des données ; si oui, seulement par empreintes calculées sur l'appareil, contre des personnes ayant consenti à être trouvées, sans rien conserver.
8. **D8 — Identification sur les photos : approbation préalable ?** *Recommandation* : oui, rien n'est visible avant l'accord de la personne identifiée ; relations seulement.
9. **D9 — Amis proches, albums partagés, restreindre.** *Recommandation* : reporter après le pilote ; aucune demande exprimée.
10. **D10 — Profil public sans compte : montrer la couverture et les publications déjà publiques ?** *Recommandation* : oui, seulement le contenu `root` publié, jamais `network`.
11. **D11 — Compte privé à demandes d'abonnement.** *Recommandation* : ne pas le faire ; renommer le « mode privé » actuel de façon explicite (« Hors annuaire ») pour qu'on ne le confonde pas avec le compte privé des références.

## 8. Risques et points d'attention

- **Contrat des projections publiques strictes** : aucun champ ajouté à `publicProfileValidator` ; publier une projection à part (PF-08).
- **Blocage hérité** : deux sources (intentions `personBlocks` et marqueurs `connections`), paires de plus de 100 lignes refusées sans effet partiel (doc 08). Ne pas simplifier sans migration.
- **DIASPORALE consomme le même graphe** : `BlockedPeopleSection`, `blockPerson` et ses tests (`engine.test.ts` du dépôt DIASPORALE). Tout changement de `blockPair` (D1) doit être annoncé à S2.
- **Agrégats** : un compteur mal tenu ment. Chaque écrivain (`follow`, `unfollow`, `removeFollower`, `blockPair`, effacement) doit mettre à jour l'agrégat dans la même transaction ; prévoir une migration de remplissage et un test de cohérence.
- **Fichiers partagés** : `convex/convex.config.ts` (PF-07), `convex/schema.ts` si un nouveau module de tables (PF-15, PF-16, PF-17), `package.json` (PF-18). S1 seulement, un passage à la fois.
- **Réutiliser, ne pas recréer** : `OpaqueQrCode`, `BlockedPeopleSection`, `ReportContentDialog`, le ré-encodage des albums, le comptage des relations communes de DIASPORALE (par duplication avec en-tête de provenance).
- **Cinq destinations au téléphone** : aucun nouvel onglet ; Relations reste un volet de la page réseau (`?tab=relations`).
- **Actions compactes de 25 px** (ADR-0037) : les nouveaux boutons de la fiche suivent `COMPACT_SOCIAL_ACTION_STYLE` et les couleurs par famille (Suivre et Ajouter en `social`, Bloquer et Supprimer en couleur de suppression, à part).
- **Ne rien inventer** : relations communes, raisons et décomptes viennent de lectures réelles ; une lecture tronquée se dit (« au moins »).

## 9. Prompts d'implémentation

### Prompt PF-01 — Bloquer, débloquer et liste des bloqués

```text
Tu exécutes le lot PF-01 du plan 05 d'ANTSIA. Écris-moi toujours en français. Utilise Opus pour tout le code, jamais de sous-agent Sonnet.
Lis d'abord : CLAUDE.md ; docs/etudes/2026-11-09-finalisation/00_PLAN_DIRECTEUR.md § 1, 2, 7 ; docs/etudes/2026-11-09-finalisation/05_PROFIL_RELATIONS_ALBUMS.md § 1, 2 et le lot PF-01 ; docs/08_CONTRAT_DEMANDES_ET_DEBLOCAGES.md ; ADR-0027, 0033, 0037.
Vérifie d'abord que l'état décrit est vrai : aucun appel à graph.connections.blockPerson dans apps/antsia_ga ni packages/social-features ; BlockedPeopleSection monté seulement par DIASPORALE.
Périmètre : packages/social-features/src/features/reseau-personnel/{ProfilPersonnePage.tsx, ProfileOverflowMenu.tsx (nouveau), ProfilReseauSection.tsx, PostOverflowMenu.tsx, post-overflow.ts, profile-visibility-copy.ts} et leurs tests ; i18n reseau.profil.json et reseau.fil.json (fr, en) ; convex/modules/marks/marks.ts (query isAuthorMuted). Si le propriétaire a accepté D1 : convex/modules/graph/{tables.ts, connections.ts} et graph.test.ts (abonnements supprimés dans les deux sens, agrégat followerCounts tenu, index by_follower_target) — sinon ne touche pas au serveur du blocage.
Livre : menu « … » de la fiche (Bloquer avec confirmation, Mettre en sourdine/Réactiver), « Débloquer » dans l'état blocked_by_me, « Bloquer l'auteur » dans le menu de publication, liste des blocages dans la gestion de mon profil.
Vérifie : bun run verify ; recette à 390, 834 et 1440 px, en clair et en sombre, avec deux comptes de démonstration (bloquer, vérifier fil, recherche, suggestions et fiche, débloquer).
Arrête-toi et demande-moi : avant de supprimer des abonnements si D1 n'est pas tranchée ; avant toute publication ; si un fichier partagé est nécessaire.
```

### Prompt PF-02 — Signaler un profil et un album

```text
Tu exécutes le lot PF-02 du plan 05 d'ANTSIA. Écris-moi toujours en français. Opus seulement.
Lis : CLAUDE.md ; 05_PROFIL_RELATIONS_ALBUMS.md § 2 et lot PF-02 ; convex/modules/moderation/{cases.ts, targets.ts} ; docs/etudes/2026-10-21-sept-univers-et-vie-publique/SU01_CONFORMITE_ORDONNANCE_0011.md (SU01d).
Vérifie que moderation.cases.report accepte toujours les cibles person et album, et que PF-01 a livré ProfileOverflowMenu (sinon, livre le menu minimal).
Périmètre : packages/social-features/src/features/reseau-personnel/ReportContentDialog.tsx, ProfileOverflowMenu.tsx, reseau-albums/AlbumPage.tsx, leurs tests, i18n fr et en. Aucun changement serveur.
Livre : « Signaler » sur la fiche d'autrui et sur l'album d'autrui, bouton figé une fois signalé, refus de signaler son propre contenu.
Vérifie : bun run verify ; recette avec un compte membre et un compte modérateur de la démonstration : le signalement apparaît dans la file, avec son délai légal.
Arrête-toi avant toute publication.
```

### Prompt PF-03 — Images de profil sans métadonnées, recadrées

```text
Tu exécutes le lot PF-03 du plan 05 d'ANTSIA. Écris-moi toujours en français. Opus seulement.
Lis : CLAUDE.md ; 05_PROFIL_RELATIONS_ALBUMS.md lot PF-03 ; packages/social-features/src/features/reseau-albums/{AlbumComposer.tsx, album-model.ts} (albumReencodePlan, ré-encodage fail-closed) ; ProfilePublicationCard.tsx.
Vérifie qu'aucun retrait d'EXIF n'existe encore pour les images de profil (client et serveur).
Périmètre : extraire le ré-encodage dans un module commun de packages/social-features (sans changer le comportement des albums, tests compris) ; nouveaux ProfileImageCropper.tsx et profile-image-crop.ts ; ProfilePublicationCard.tsx ; i18n fr et en. Aucune nouvelle dépendance, aucun changement serveur.
Livre : recadrage au clavier et à la souris (cercle pour la photo, bandeau pour la couverture), aperçu, envoi d'une image ré-encodée sans EXIF, refus si le ré-encodage échoue.
Vérifie : bun run verify ; en local, envoie une image test avec coordonnées GPS et prouve que le blob stocké n'en a plus ; recette à 390, 834 et 1440 px.
Arrête-toi avant toute publication.
```

### Prompt PF-04 — Mobile : bloquer et signaler

```text
Tu exécutes le lot PF-04 du plan 05 d'ANTSIA, en session S3 (apps/antsia_mobile seulement). Écris-moi toujours en français. Opus seulement.
Lis : CLAUDE.md ; 05_PROFIL_RELATIONS_ALBUMS.md § 2 et lot PF-04 ; apps/antsia_mobile/src/screens/{profile-screens.tsx, post-actions.tsx} ; les textes de PF-01 et PF-02 s'ils sont livrés.
Vérifie que le mobile n'appelle toujours ni graph.connections.blockPerson ni moderation.cases.report.
Périmètre : profile-screens.tsx, post-actions.tsx, i18n du mobile (fr, en), tests. Aucun fichier hors apps/antsia_mobile et packages/social-native.
Livre : Bloquer et Signaler depuis une fiche, Bloquer l'auteur depuis le menu d'une publication, confirmations natives, garde useNativeGuard, VoiceOver.
Vérifie : bun run verify ; recette sur le simulateur iPhone du panneau avec deux comptes de démonstration.
Arrête-toi avant tout build EAS ou envoi sur TestFlight.
```

### Prompt PF-05 — Rompre une relation

```text
Tu exécutes le lot PF-05 du plan 05 d'ANTSIA. Écris-moi toujours en français. Opus seulement.
Lis : CLAUDE.md ; 05_PROFIL_RELATIONS_ALBUMS.md lot PF-05 et décision D4 ; convex/modules/graph/{connections.ts, graph.ts, tables.ts} ; convex/lib/rateLimit.ts ; le plan 01 pour l'effet sur iCom.
Vérifie qu'aucune mutation ne rompt encore une relation acceptée et que D4 est tranchée ; sinon, demande-la-moi avant de coder.
Périmètre : convex/modules/graph/connections.ts (removeConnection), convex/lib/rateLimit.ts (seau connection.remove), graph.test.ts ; ProfilPersonnePage.tsx (ConnectionButton), PeoplePanel.tsx, leurs tests ; i18n fr et en.
Livre : retrait silencieux par l'une des deux parties, fil des deux côtés rafraîchi, directs révoqués, nouvelle demande possible, aucune notification.
Vérifie : bun run verify (cliquets network-scoped-functions et rate-limited-writes compris) ; recette à deux comptes de démonstration : publication « relations » lisible avant, plus après.
Arrête-toi avant toute publication.
```

## 10. Sources lues

- Brief commun ; plan directeur (`00_PLAN_DIRECTEUR.md`, § 4 et § 7) ; dossier de reprise du 9/11 (§ 2, § 9, § 10, § 11).
- Cahier : § 6 (portes, statuts, rôles, badges), § 7, EXF-AN-04, 05, 07, 14, 15, 33, 47.
- ADR-0002, 0033, 0037 ; `docs/08_CONTRAT_DEMANDES_ET_DEBLOCAGES.md` ; `docs/COMPLEMENTS_SOCIAUX_2026-10-21.md` ; `docs/13_RAPPORT_RESEAU_PUBLIC_PA8.md` ; `docs/03_RAPPORT_PARITE_BACKEND.md` (lot 4) ; `docs/04_RAPPORT_PARITE_FRONT.md` (blocage).
- Études : `2026-10-20-experience-sociale-responsive` (`01`, `04`, prompt U05, rapport U03/U05) ; `2026-10-18-social-commerce` (`00`, `01`, `02`, `04`) ; étude des sept univers (page sociale).
- Vault : décisions du 15/10 (front F2), 16/10 (demandes et blocages), 21/10 (compléments sociaux, avatars décoratifs) ; `relations-analyses-medias-2026-10-20.md`. Mémoire : `maquettes-fideles-au-code`, `fil-sans-cadre-adr-0037`.
- Code backend : `convex/modules/{people (profile, tables, directory, facets, dataPolicies, dataInventory), graph (connections, follows, blocks, tables), suggestions, albums, public (access, projections, validators), marks, moderation (cases, tables, targets), posts (posts.ts, épingle), diaspora/suggestions.ts}` ; `convex/lib/rateLimit.ts` ; `convex/convex.config.ts` ; `convex/seeds/foundations.ts`.
- Règles : `packages/social-domain/src/{badges, civilName, content, albums}.ts`.
- Surfaces : `packages/social-features/src/features/{reseau-personnel (ProfilPersonnePage, ProfilReseauSection, ProfilePublicationCard, PeoplePanel, people-panel, SuggestionsPanel, SuggestionRelationActions, BlockedPeopleSection, PrivacyLists, PostOverflowMenu, ReportContentDialog, SharePostDialog), reseau-albums, qr, notifications/notification-targets.ts}` ; `apps/antsia_ga/src/{app/(membre)/moi, app/(membre)/profil, app/(public)/[publicHandle], components/public/public-routes.tsx, components/reseau/reseau-screens.tsx, lib/routes.ts}`.
- Mobile : `apps/antsia_mobile/src/screens/{profile-screens, feed-screen, post-actions}.tsx`, `lib/native-profile-view.ts`. DIASPORALE : `apps/diasporale_com/src/screens/relations-screen.tsx`, `src/data/engine-source.ts`.
- Cliquets : `tests/ratchets/` (liste des 26 fichiers).
