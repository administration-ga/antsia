# Plan 02 — Fil, publications et interactions

> Constaté par lecture du code d'`origin/main` (ANTSIA `26741caa`, DIASPORALE `bead76d`), le 9 novembre 2026. Rien n'a été exécuté.
> Applications de référence : Instagram et Facebook (carte de publication), X, Threads et LinkedIn (interactions, composeur), TikTok (fil immersif). Comparaison faite de mémoire (état des produits à la mi-2026), non revérifiée en ligne. Un « ? » dans les tableaux veut dire : non affirmé.

Vocabulaire. **Fil** : la liste des publications. **Portée** : la façon de composer le fil (« Pour vous », « Récents »). **Fil matérialisé** : le fil précalculé par lecteur au lieu d'être recomposé à chaque lecture. **`root`** : visibilité qui rend une publication lisible depuis la racine ANTSIA, et sans compte. **DTO** : la forme exacte des données qu'une fonction renvoie. **Cliquet** : test d'architecture qui interdit de régresser.

## 1. L'intention du propriétaire

| Intention | Source |
|---|---|
| Le fil est le cœur du pilier **divertissement** : il fait revenir chaque jour. | Étude sept univers, § 4 ; ADR-0035 |
| « Présenté comme Instagram, défilant comme TikTok » : ordre auteur → média → actions → légende → offre ; immersion verticale au téléphone avec un mode Liste toujours disponible. | ADR-0017 ; étude 18/10, `04` § 2 et § 3 |
| Fil **sans cadre** : média bord à bord dans la carte ; au bureau, **colonne unique**, une carte par rangée. La grille de 3–4 colonnes a été refusée le jour même. | ADR-0037 ; mémoire `colonne-unique-au-bureau` |
| Publications héritées du socle : 2 000 caractères, 4 images ou 1 vidéo avec texte alternatif, partage cité, mots-dièse, mentions, audience, édition, retrait, épinglage ; réactions à 4 genres ; commentaires à **un** niveau de réponse. | Cahier, EXF-AN-10, EXF-AN-11 |
| Fil racine : natifs + `root` des réseaux enfants avec pastille d'origine ; portées « Pour vous », « Récents », « National », provinces ; fil matérialisé au-delà d'un seuil. | EXF-AN-12, EXF-AN-46 ; ADR-0020 |
| « Publier aussi sur ANTSIA » est un **geste explicite** ; l'auteur voit où sa publication est lue ; la retirer la retire partout. | EXF-AN-50 ; invariant `network` par défaut |
| Classement compréhensible, sans modèle opaque ; « Pourquoi ce contenu ? » seulement avec une raison réelle ; masquer, signaler, ne plus recommander. | Étude 18/10, `04` § 6 ; étude 20/10, `02` |
| Ne rien inventer : aucun compteur sans donnée réelle, aucune tuile vide. | Plan directeur, § 1 |
| Faible débit : au plus une vidéo active, lecture muette seulement si permise, aucun préchargement en économie de données. | `04` § 3 ; ADR-0017 |

## 2. Ce qui existe

Chemins relatifs au dépôt ANTSIA. État : celui du backend et du web ; la colonne Mobile précise l'application Expo.

| # | Capacité | État | Web | Mobile | Preuve |
|---|---|---|---|---|---|
| 1 | « Pour vous » : moi, connexions, personnes suivies (public seul), pages suivies, **par date** | Présent | oui | oui | `convex/modules/posts/posts.ts` (`myFeed`), `packages/social-domain/src/content.ts` (`feedAdmissionFor`) |
| 2 | « Récents » : tout ce que le lecteur a le droit de voir, par date | Présent | oui | oui | `posts.ts` (`myFeed`, `globalReader`) |
| 3 | Voies du réseau (portée + pays, au plus 4) | Présent | selon l'app | non | `posts.ts` (`laneReader`), `content.ts` (`normalizeFeedLanes`) |
| 4 | National et provinces (membre) | Présent | oui | public seulement | `convex/modules/discovery/discovery.ts`, `apps/antsia_ga/src/components/discovery/member-feed.tsx`, `apps/antsia_mobile/src/screens/public-entry-screen.tsx` |
| 5 | Fil matérialisé (références privées, 30 jours, bascule au-delà de 200 sources ou 50 pages) | Présent, non mesuré | oui | oui | `convex/modules/posts/feedMaterialization.ts`, `feedRead.ts`, `feedTables.ts`, `packages/social-domain/src/feedScale.ts` |
| 6 | Pastille d'origine (« Publié depuis … ») | Présent | oui | ? | `posts.ts` (`toFeedItem`, `origin`) |
| 7 | Raison d'affichage | Partiel : une phrase de contexte (audience + raison) ; pas d'entrée « Pourquoi ? » ni d'explication du fil | oui | ? | `packages/social-features/src/features/reseau-personnel/PostCard.tsx` (`postCard.context`) |
| 8 | Nouvelles publications sans saut (« N nouvelles publications ») | Présent | oui | bouton Actualiser | `reseau-personnel/FeedPages.tsx`, `feed-immersion/ImmersiveFeedReader.tsx` |
| 9 | Position conservée au retour | Présent | oui | non vérifié | `feed-immersion/feed-return-memory.ts` |
| 10 | Modes Liste et Immersion | Présent | oui | oui | `feed-immersion/feed-mode.ts`, `apps/antsia_mobile/src/screens/feed-screen.tsx` |
| 11 | Fil lacunaire ou en préparation, dit à l'écran | Présent | oui | ? | `posts.ts` (`lacunar`, `preparing`), clés `feedPages.*` |
| 12 | Coût borné : souscriptions et fenêtre DOM | Partiel : une souscription `myFeed` vivante par page, aucune fenêtre (constats F05, F06) | — | — | `FeedPages.tsx` ; `docs/etudes/2026-10-18-social-commerce/rapports/P18A_AUDIT_STATIQUE.md` |
| 13 | Portée « Abonnements » distincte | Absent | — | — | `FEED_SCOPES = ["pour_vous","recents"]` (`content.ts`) ; cherché : `abonnements`, `following`, `subscriptions` |
| 14 | Centres d'intérêt choisis (suivre un mot-dièse, une province) | Absent | — | — | cherché : `followTag`, `tagFollows`, `hashtagFollow`, `centres d'intérêt` |
| 15 | Mots masqués | Absent | — | — | cherché : `mutedWords`, `keywordFilter`, `mots masqués` |
| 16 | Texte (2 000 car.), compteur, idempotence | Présent | oui | oui (texte seul) | `content.ts` (`assertPostContent`), `apps/antsia_mobile/src/screens/compose-screen.tsx` |
| 17 | Jusqu'à 4 photos, carrousel avec index | Présent | oui | lecture seule | `content.ts` (`assertPostMedia`), `reseau-personnel/PostMedia.tsx` |
| 18 | Une vidéo seule (100 Mo) | Présent | oui | lecture seule | `content.ts` (`POST_VIDEO_MUST_BE_ALONE`) |
| 19 | Photos et vidéo mêlées | Absent (règle du domaine) | — | — | `content.ts` l. 137 |
| 20 | Texte alternatif par média (300 car.) | Présent | oui | non | `content.ts`, clés `postComposer.alt*` |
| 21 | Photos allégées et nettoyées (métadonnées, poids) | Absent : déposées telles quelles jusqu'à 20 Mo, sans retrait des métadonnées EXIF (lieu de prise de vue compris) ; l'album, lui, ré-encode | — | — | `reseau-personnel/useMediaDraft.ts` ; comparer `features/reseau-albums/AlbumComposer.tsx` ; cherché : `exif`, `gps`, `toBlob`, `compress` |
| 22 | Audience : public, connexions, abonnés, groupe | Présent | oui | figée à `connections` | `content.ts` ; `compose-screen.tsx` |
| 23 | « Publier aussi sur ANTSIA » | Présent | oui | non | `posts.ts` (`alsoOnRoot`), `PostComposer.tsx` |
| 24 | Retirer de la lecture sans compte | Présent | oui | non | `posts.ts` (`withdrawFromRoot`) |
| 25 | Province attribuée, volontaire | Présent | oui | non | `posts.ts` (`province`) |
| 26 | Publier au nom d'une page | Présent | oui | non | `convex/modules/pages/pages.ts` (`publishAsPage`) |
| 27 | Brouillons | Partiel : un brouillon par réseau, en `sessionStorage`, perdu à la fermeture du navigateur | oui | non | `reseau-personnel/post-draft-store.ts` |
| 28 | Modifier une publication | Partiel : texte seul ; `editedAt` dans le DTO mais **aucune marque « modifiée » affichée** ; aucune version gardée | oui | non | `posts.ts` (`edit`) ; `PostCard.tsx` |
| 29 | Retirer sa publication | Présent | oui | oui | `posts.ts` (`remove`) |
| 30 | Épingler sur son mur | Présent | oui | oui | `posts.ts` (`pinOnMyWall`) |
| 31 | Mentions et leur cloche | Partiel : résolues et notifiées, sans suggestions à la saisie | oui | oui | `packages/social-domain/src/richText.ts`, `posts/postWrite.ts` ; cherché : `autocomplete`, `combobox`, `mentionSuggest` |
| 32 | Mots-dièse (pages membre et publique) | Présent | oui | ? | `apps/antsia_ga/src/app/(public)/tags/[tag]/page.tsx`, `routes.memberTag` |
| 33 | Sondages | Absent | — | — | cherché : `poll`, `sondage`, `vote` (hors appels) |
| 34 | Publication programmée | Absent (seuls les articles de presse) | — | — | cherché : `scheduledAt`, `publishAt`, `programm` |
| 35 | Lieu précis | Absent | — | — | cherché : `location`, `placeName`, `geotag` |
| 36 | Personnes identifiées sur une photo | Absent | — | — | cherché : `taggedPerson`, `photoTag`, `tagPeople` |
| 37 | Sous-titres vidéo | Absent (constat A08, décision ouverte) | — | — | `packages/social-contracts/src/media.ts` ; `P18A_AUDIT_STATIQUE.md` |
| 38 | Contenu d'IA déclaré par l'auteur | Absent | — | — | SU01i (plan 12) |
| 39 | Carte sans cadre, colonne unique | Présent | oui | oui | `PostCard.tsx` (ADR-0037) |
| 40 | Publication ouverte (membre) | Présent | oui | oui | `posts.ts` (`getPost`), `routes.memberPost` |
| 41 | Publication publique lisible sans compte | Partiel : page et métadonnées présentes, **aperçu sans image** | oui | — | `convex/modules/public/projections.ts` (`getPost`), `apps/antsia_ga/src/lib/public-data.ts` (`publicMetadata`) |
| 42 | Formules d'action des boutiques sur la carte | Présent | oui | oui | `apps/antsia_ga/src/components/shops/offer-post-formula.tsx` |
| 43 | Compteurs réels (réactions par fragments, commentaires, partages) | Présent | oui | oui | `convex/modules/posts/counters.ts` |
| 44 | Vues d'une publication | Absent (les Stories seules) | — | — | cherché : `viewCount`, `impressions`, `vues` |
| 45 | Statistiques pour l'auteur | Partiel : décomptes dans « Mes publications » | oui | non | `posts.ts` (`paginateMyPosts`) |
| 46 | Réactions (J'aime, Bravo, Soutien, Instructif) | Présent | oui | oui | `convex/modules/engagement/engagement.ts` (`toggleReaction`) |
| 47 | Voir qui a réagi | Absent | — | — | cherché : `reactors`, `whoReacted`, `paginateReactions` |
| 48 | Commentaires et réponses (un niveau, paginés) | Présent | oui | oui | `engagement.ts` (`comment`, `paginateComments`, `paginateReplies`) |
| 49 | Modifier, retirer son commentaire ; l'auteur retire chez lui | Présent | oui | retirer seul | `engagement.ts` (`editComment`, `removeComment`) |
| 50 | Aimer un commentaire | Absent | — | — | cherché : `commentReaction`, `likeComment` |
| 51 | Épingler un commentaire | Absent | — | — | cherché : `pinnedComment`, `pinComment` |
| 52 | Restreindre qui commente | Partiel : fermeture seulement pour un article de presse | — | — | `convex/modules/posts/access.ts` (`editorialDiscussionOpen`) |
| 53 | Partager dans mon fil (relais, mot facultatif), publique seulement | Présent | oui | oui | `reseau-personnel/SharePostDialog.tsx`, `content.ts` (`assertShareable`) |
| 54 | Copier le lien | Partiel : toujours l'adresse membre `/fil?post=`, jamais l'adresse publique d'une publication `root` | oui | adresse canonique | `SharePostDialog.tsx`, `apps/antsia_ga/src/lib/routes.ts` |
| 55 | Feuille de partage du système | Partiel | non | oui | `apps/antsia_mobile/src/screens/post-actions.tsx` (`Share.share`) ; cherché au web : `navigator.share` |
| 56 | Envoyer une publication dans iCom | Absent | — | — | `convex/modules/messaging/tables.ts` (aucune référence de publication) |
| 57 | Signets (enregistrer) | Présent | oui | oui | `convex/modules/marks/marks.ts`, `BookmarksPanel.tsx`, `profile-screens.tsx` |
| 58 | Collections de signets | Absent | — | — | cherché : `collection`, `savedCollection` |
| 59 | Masquer, et réafficher depuis « Mon fil » | Présent | oui | masquer seul | `marks.ts`, `apps/antsia_ga/src/components/feed/feed-preferences-screen.tsx` |
| 60 | Sourdine d'un auteur | Présent | oui | oui | `marks.ts` (`muteAuthor`) |
| 61 | Signaler depuis la carte (motifs SU01d) | Présent | oui | oui | `ReportContentDialog.tsx` (plan 12) |
| 62 | Être averti des commentaires | Présent | oui | ? | `marks.ts` (`notify`) |
| 63 | Traduction | Absent | — | — | cherché : `translat`, `tradui` |
| 64 | Lecture automatique et préchargement selon l'économie de données | Présent | oui | ? | `features/media-playback/media-playback-policy.ts`, `media-playback-environment.ts` |
| 65 | Affiche (image de couverture) des vidéos | Absent | — | — | `packages/social-contracts/src/media.ts` ; constat A08 |
| 66 | Paiement depuis « Acheter » sur la carte | Fermé : porte des paiements (MP08), aucun prestataire contracté | — | — | plan 08 |

**Ce que fait vraiment « Pour vous ».** Aucun score, aucun modèle. Le serveur réunit une fenêtre par source (moi, mes connexions, les personnes que je suis, les pages que je suis, au plus 200 personnes et 50 pages), les fusionne **par date de publication**, puis repasse chaque ligne par la garde d'audience, le blocage, le masquage et la sourdine. Au-delà du seuil, il lit les références précalculées, toujours par date. L'étude SU01 le constate aussi : « le fil, les suggestions et la découverte sont chronologiques, sans score d'affinité ». Un membre sans connexion ni suivi a un « Pour vous » vide (clé `shared.emptyFeed.orphan`).

### Ce qui est écrit mais jamais recetté en réel

| Élément | État constaté | Source |
|---|---|---|
| Fil matérialisé, rattrapage, distribution | Sources et tests ; coût, latence et p95 non mesurés ; charge R8 (5 000 abonnés, 10 000 réactions) non exécutée | `docs/06_RAPPORT_LANCEMENT.md` ; dossier de reprise, § 10.1 |
| Fil complet à deux vraies identités | Jamais exercé en production | Dossier de reprise, § 10.1 (P0) |
| Partage et copie du lien | Constaté en local, Chrome émulé, compte fictif, 18/10 | `docs/recette/partage-2026-10-18/README.md` |
| Fil au téléphone | Surfaces seulement, émulation Chrome, aucun appareil ; publication, médias et réactions non recettés | `docs/recette/fil-mobile-2026-10-18/README.md` |
| Fil sans cadre et formules des boutiques | Constaté en ligne sur la démo, 22/10, avec captures | `docs/etudes/2026-10-22-fil-sans-cadre/README.md` |
| Parité web et mobile du fil | Audit inachevé le 26/10 : ne pas annoncer de parité | Dossier de reprise, § 10.3 |
| Octets consommés pour 30 publications, temps sur réseau 3G | Jamais mesurés | `P18A_AUDIT_STATIQUE.md` (protocole) |

## 3. Comparaison avec les applications de référence

| Capacité | Instagram | Facebook | X | Threads | LinkedIn | TikTok | ANTSIA | Verdict |
|---|---|---|---|---|---|---|---|---|
| Carte : auteur, média pleine largeur, actions, légende | oui | oui | oui | oui | oui | — | oui | Déjà fait |
| Carrousel de photos | oui | oui | oui | oui | oui | mode photo | 4 photos | Déjà fait |
| Photos et vidéo mêlées | oui | oui | oui | oui | ? | — | non | Écarté pour l'instant (règle du domaine) |
| Photos allégées, métadonnées retirées | oui | oui | oui | ? | ? | ? | non | **À faire (FP-01)** |
| Sous-titres, affiche vidéo | oui | oui | oui | ? | oui | oui | non | Dépend du plan 03 |
| Texte alternatif | oui | oui | oui | oui | oui | ? | oui | Déjà fait (web) |
| Brouillons conservés | oui | oui | oui | oui | oui | oui | session seule | À adapter (FP-13) |
| Publication programmée | oui | pages | oui | ? | oui | oui | non | À faire (FP-14) |
| Sondage | Stories | groupes | oui | oui | oui | ? | non | À faire (FP-15) |
| Modifier, marque « modifiée » | sans marque | historique visible | fenêtre courte, historique | fenêtre courte | « Modifié » | ? | non affichée | **À faire (FP-03)** |
| Mentions avec suggestions | oui | oui | oui | oui | oui | oui | sans suggestions | À faire (FP-08) |
| Lieu, personnes identifiées sur photo | oui | oui | non / oui | ? | non / oui | oui / ? | province seule | Reporté (vie privée) |
| Réactions, voir qui a réagi | oui | oui | non (privé) | oui | oui | non | réactions sans liste | À faire (FP-07) |
| Commentaires à plusieurs niveaux | un niveau | deux à trois | fils | fils | un niveau | un niveau | un niveau | Écarté (EXF-AN-11) |
| Aimer un commentaire | oui | oui | oui | oui | oui | oui | non | À faire (FP-06) |
| Restreindre qui commente | oui | oui | oui | oui | oui | oui | non | À faire (FP-06) |
| Épingler un commentaire | oui | ? | non | ? | oui | oui | non | À faire (FP-11) |
| Relais et citation | Stories | oui | oui | oui | oui | relais | un geste, publique seule | Déjà fait |
| Envoyer en message privé | oui | oui | oui | oui | oui | oui | non | **À faire (FP-05)** |
| Lien et feuille de partage | oui | oui | oui | oui | oui | oui | lien membre, pas de feuille au web | **À faire (FP-04)** |
| Collections de signets | oui | oui | oui | ? | non | oui | non | À faire (FP-18) |
| Fil chronologique au choix | oui | oui | oui | oui | ? | ? | **le seul mode** | Déjà fait |
| « Pas intéressé », raisons d'un contenu | oui | oui | oui | oui | oui | oui | masquer, raison en une phrase | À adapter (FP-09) |
| Recommandations hors de son réseau | oui | oui | oui | oui | oui | oui | non (« Récents » seulement) | À adapter : intérêts choisis (FP-16) |
| Mots masqués | oui | ? | oui | oui | ? | oui | non | À faire (FP-19) |
| Traduction | oui | oui | oui | ? | oui | ? | non | Reporté (plan 16, SU01i) |
| Vues, statistiques de l'auteur | oui | oui | oui | ? | oui | oui | décomptes seuls | À adapter (FP-17, FP-20) |
| Fil immersif vertical | Reels | Reels | onglet vidéo | non | ? | oui | oui | Déjà fait |
| Économie de données | oui | oui | oui | ? | ? | oui | lecture et préchargement | Déjà fait ; poids des images : FP-01 |

## 4. Ce qui manque

### 4.1 Bloquant avant l'ouverture au public

1. **Photos de publication brutes** : jusqu'à 20 Mo, sans ré-encodage, avec leurs métadonnées EXIF (le lieu de prise de vue peut s'y trouver). Fuite de vie privée et fil lourd sur 3G (FP-01).
2. **Aucune recette réelle du parcours** publier, réagir, commenter, partager, masquer, entre deux vraies identités (FP-02).

### 4.2 Attendu par les utilisateurs

3. Une publication modifiée ne le dit pas (FP-03).
4. Le lien partagé d'une publication publique mène à l'adresse membre ; l'aperçu (WhatsApp, Facebook) n'a pas d'image ; pas de feuille de partage au web (FP-04).
5. Impossible d'envoyer une publication à quelqu'un dans iCom (FP-05).
6. Commentaires : ni « J'aime », ni restriction par l'auteur, ni épingle (FP-06, FP-11).
7. Ni liste de qui a réagi, ni suggestions de mentions (FP-07, FP-08).
8. « Pourquoi je vois ceci ? » et l'explication du fil manquent ; « Mon fil » ne montre que masqués et sourdines (FP-09).
9. Le coût du fil grandit avec chaque page chargée (FP-10).
10. Le mobile publie du texte seul, en audience `connections` figée ; ni modification, ni « Mon fil », ni fil National membre (FP-12).

### 4.3 Différenciant pour ANTSIA

- **Un fil honnête** : chronologique, raison réelle sur chaque carte, explication publique de la règle. Aucune référence ne le fait aussi simplement (FP-09).
- **Des intérêts choisis plutôt qu'un profilage** : suivre un mot-dièse ou une province pour remplir « Pour vous », sans score caché ; compatible avec l'interdiction du profilage des mineurs (loi 025/2023, art. 193) (FP-16).
- **Léger par défaut** : photos allégées, métadonnées retirées, aucun préchargement en économie de données (FP-01).
- **Une seule identité vérifiée** derrière chaque carte et chaque commentaire (badges calculés, déjà en place).
- **Commerce relié sans publicité cachée** : formule d'action déduite d'une offre réelle de PRO.GA (ADR-0037, en place).

### 4.4 Écarté ou reporté, et pourquoi

| Sujet | Décision proposée | Raison |
|---|---|---|
| Commentaires à plusieurs niveaux | Écarté | EXF-AN-11 fixe un niveau ; lisibilité au téléphone |
| Photos et vidéo dans une même publication | Reporté | Règle du domaine (`assertPostMedia`) ; poids sur 3G |
| Lieu précis, personnes identifiées sur photo, coauteurs | Reporté | Consentement et vie privée à concevoir ; la province volontaire et les mentions couvrent le besoin |
| Traduction | Reporté au plan 16 | Fournisseur externe, marquage de l'IA (SU01i) |
| Sous-titres et affiches vidéo | Plan 03 | Chaîne des médias |
| Classement par score d'engagement | Écarté | Opacité refusée (`04` § 6) ; mineurs (art. 193) |
| Publicité, sponsorisé, alertes officielles en tête du fil | Plan 11 | Vie publique et annonceurs |

## 5. Lots d'implémentation

### FP-01 — Photos de publication allégées et nettoyées · priorité P0 · taille M · session S1
- **Pour l'utilisateur** : ses photos ne livrent plus le lieu de prise de vue ; le fil charge vite sur 3G.
- **Backend** : aucune table. Abaisser `POST_IMAGE_MAX_BYTES` (`packages/social-domain/src/content.ts`) au poids cible décidé (décision 1) ; adapter les tests du domaine et de `verifyDeclaredMedia`.
- **Web** : dans `useMediaDraft.ts`, ré-encoder chaque photo sur canvas avant téléversement, en réutilisant le plan d'`AlbumComposer.tsx` (`albumReencodePlan`, fail-closed : un échec refuse le fichier, jamais l'original), avec réduction au plus grand côté décidé ; GIF animé : règle à trancher (décision 1). Première image du fil en `loading="eager"` et `fetchpriority="high"`, les autres paresseuses (`PostMediaPresentation.tsx`). Message clair en cas de refus.
- **Mobile** : même règle quand le composeur natif recevra des photos (FP-12).
- **Données personnelles** : moins de données collectées ; rien à exporter de plus.
- **Tests et cliquets** : test du ré-encodage (EXIF absent, dimensions bornées, refus si canvas absent) ; tests existants d'`assertPostMedia` mis à jour.
- **Critères d'acceptation** : une photo de 12 Mo avec coordonnées GPS sort sous le poids cible, sans bloc EXIF ; un fichier illisible est refusé avec un message ; mesure des octets transférés pour « ouvrir le fil et parcourir 30 publications », avant et après, consignée dans le rapport du lot.
- **Dépend de** : décision 1 ; plan 03 pour les dérivés serveur (`srcset`) et les affiches vidéo.
- **Porte** : aucune.

### FP-02 — Recette réelle du fil et des interactions · priorité P0 · taille S · session S1
- **Pour l'utilisateur** : la preuve que le cœur du réseau marche entre deux vraies personnes.
- **Backend / Web / Mobile** : aucun code ; correctifs éventuels en lots séparés.
- **Déroulé** : `bun run verify` vert ; sur la démo puis en production, avec deux identités : publier (texte, 4 photos, vidéo, texte alternatif, audience, « Publier aussi sur ANTSIA », province), voir la publication chez l'autre (« Pour vous », « Récents », National, province), réagir, commenter, répondre, mentionner, partager, copier le lien, ouvrir le lien sans compte, masquer puis réafficher, sourdine, signaler, modifier, retirer, épingler ; vérifier chaque cloche ; Liste et Immersion ; 390, 834, 1440 px, clair et sombre.
- **Données personnelles** : comptes de recette effacés ou désignés après coup.
- **Critères d'acceptation** : rapport `docs/recette/fil-deux-identites-<date>/RAPPORT.md`, une ligne par geste, constat et capture ; écarts ouverts en lots.
- **Dépend de** : plan 06 (deux identités IDN réelles).
- **Porte** : second compte du propriétaire ; accord écrit pour toute écriture en production.

### FP-03 — Modification honnête : marque et versions · priorité P1 · taille M · session S1
- **Pour l'utilisateur** : il sait qu'un texte a changé ; la modération voit ce qui a été publié avant.
- **Backend** : table `postRevisions` (`networkId`, `postId`, `body`, `tags`, `editedAt`, index `by_post_editedAt`), écrite par `posts.edit` avant le `patch` ; bornée (décision 4) ; lecture par `operatorQuery` pour la modération et par l'auteur. Gel lors d'un signalement : coordonner avec SU01g (plan 12).
- **Web** : afficher « Modifiée » (date au survol, texte pour lecteur d'écran) dans `PostCard.tsx` et la carte publique ; versions dans un dialogue pour l'auteur.
- **Mobile** : la marque ; la modification arrive avec FP-12.
- **Données personnelles** : versions dans l'export de l'auteur et dans l'effacement (`convex/modules/people/dataPolicies.ts`, `dataInventory.ts`, `erasure.ts`) ; purgées avec la publication.
- **Tests et cliquets** : `network-scoped-functions` étendu ; test d'effacement ; `i18n-locales`.
- **Critères d'acceptation** : après modification, la carte dit « Modifiée » partout (fil, mur, publique) ; l'auteur voit ses versions ; un autre membre ne les voit pas ; l'effacement les supprime.
- **Dépend de** : décision 4 ; plan 12 (gel).
- **Porte** : aucune.

### FP-04 — Partager hors de l'application · priorité P1 · taille M · session S1
- **Pour l'utilisateur** : le lien collé dans WhatsApp s'ouvre sans compte et montre une image.
- **Backend** : aucune table. Pour l'aperçu, vérifier que l'URL servie par la garde des fichiers reste valide assez longtemps ; sinon, nouvelle projection publique **à part** (piège des projections strictes du `CLAUDE.md`) qui rend l'URL de la première image d'une publication `root` publique.
- **Web** : `SharePostDialog.tsx` propose l'adresse publique (`routes.publication`) quand la publication est `root` et d'audience publique, sinon l'adresse membre ; bouton « Partager… » par `navigator.share` quand il existe, repli sur la copie. `publicMetadata` (`apps/antsia_ga/src/lib/public-data.ts`) reçoit une image facultative (`openGraph.images`, `twitter.card = summary_large_image`).
- **Mobile** : `nativeCanonicalPostUrl` suit la même règle.
- **Données personnelles** : aucune nouvelle.
- **Tests et cliquets** : `no-hardcoded-urls`, `public-communication` ; tests du choix d'adresse et des métadonnées.
- **Critères d'acceptation** : publication `root` publique → lien public, ouvert sans compte ; publication réservée → lien membre ; les métadonnées portent une image quand la publication en a une ; aucune image pour une publication retirée.
- **Dépend de** : plan 13 (domaine et origine de production pour les URL canoniques).
- **Porte** : aucune pour le code ; publication en ligne sur accord.

### FP-05 — Envoyer une publication dans iCom · priorité P1 · taille M · session S1
- **Pour l'utilisateur** : « Envoyer à… » depuis la carte, vers une conversation existante.
- **Backend** : le plan 01 ajoute au message une référence de publication (`postId` seul, jamais de copie du corps) ; l'aperçu est relu et regardé **par lecteur** à chaque lecture (`canSeePostDoc`) : un destinataire qui n'a pas le droit voit « Publication indisponible ».
- **Web** : entrée « Envoyer dans iCom » dans `SharePostDialog.tsx`, choix de la conversation, confirmation par sonner.
- **Mobile** : après le web.
- **Données personnelles** : la référence suit l'export et l'effacement du message (plan 01).
- **Tests et cliquets** : garde par lecteur testée (publication réservée aux connexions envoyée à un tiers) ; `notification-payload-content`.
- **Critères d'acceptation** : l'aperçu s'affiche pour qui peut lire, sinon l'indisponibilité ; une publication retirée devient indisponible dans la conversation.
- **Dépend de** : plan 01 (type de message).
- **Porte** : aucune.

### FP-06 — Commentaires : aimer, restreindre, fermer · priorité P1 · taille M · session S1
- **Pour l'utilisateur** : aimer un commentaire ; l'auteur choisit qui peut commenter (tout le monde, mes connexions, personne) et peut fermer après coup.
- **Backend** : table `commentLikes` (`networkId`, `commentId`, `postId`, `personId`, `createdAt`, index `by_comment_person`, `by_person`) et décompte par l'agrégat existant (`counters.ts`) ; champ `commentPolicy` facultatif sur `posts` (défaut : tout le monde), lu par `assertPostDiscussionOpen` (`posts/access.ts`) à côté de la fermeture éditoriale ; mutations `toggleCommentLike`, `setCommentPolicy` avec débit (`convex/lib/rateLimit.ts`) ; cloche « a aimé votre commentaire » dédoublonnée, sans contenu.
- **Web** : bouton et décompte réel dans `CommentsSurface.tsx` ; choix dans le composeur et dans le menu « … » de l'auteur ; message « Les commentaires sont limités par l'auteur ».
- **Mobile** : après le web (FP-12).
- **Données personnelles** : `commentLikes` dans l'export et l'effacement (décompte rendu).
- **Tests et cliquets** : `rate-limited-writes`, `network-scoped-functions`, `notification-payload-content`, test d'effacement.
- **Critères d'acceptation** : un « J'aime » par personne et par commentaire ; politique « connexions » refuse indistinctement un tiers ; fermer n'efface rien.
- **Dépend de** : aucun.
- **Porte** : aucune.

### FP-07 — Voir qui a réagi · priorité P1 · taille S · session S1
- **Pour l'utilisateur** : toucher le décompte ouvre la liste des personnes, filtrable par réaction.
- **Backend** : `paginateReactors` (index `postReactions.by_post_and_person` insuffisant pour un tri : ajouter `by_post_createdAt`) ; garde de la publication ; personnes bloquées écartées ; profil non publié en nom neutre.
- **Web** : dialogue paginé depuis `PostReactionControl.tsx`.
- **Mobile** : après le web.
- **Données personnelles** : aucune nouvelle.
- **Tests et cliquets** : blocage et visibilité testés.
- **Critères d'acceptation** : la liste n'apparaît que pour qui voit la publication ; aucun bloqué ; décompte égal à la somme des fragments.
- **Dépend de** : décision 6.
- **Porte** : aucune.

### FP-08 — Suggestions de mentions · priorité P1 · taille M · session S1
- **Pour l'utilisateur** : taper « @ » propose des personnes.
- **Backend** : réutiliser la recherche de relations existante ; une requête bornée de profils publiés et membres du réseau, sans exposer les non publiés.
- **Web** : liste déroulante accessible (rôle `combobox`) dans `PostComposer.tsx` et `CommentsSurface.tsx`, à partir de `use-relation-search.ts`.
- **Mobile** : après le web.
- **Données personnelles** : aucune.
- **Tests et cliquets** : clavier, lecteur d'écran, `i18n-locales`.
- **Critères d'acceptation** : la suggestion insère un identifiant que `resolveMentionedPersonIds` résout ; aucune personne bloquée ou non publiée proposée.
- **Dépend de** : plan 05 (recherche de personnes).
- **Porte** : aucune.

### FP-09 — « Mon fil » et transparence du fil · priorité P1 · taille S · session S1
- **Pour l'utilisateur** : comprendre pourquoi une publication est là, et comment le fil est composé.
- **Backend** : aucun ; la raison existe déjà (`reason` du DTO).
- **Web** : entrée « Pourquoi je vois ceci ? » dans `PostOverflowMenu.tsx`, qui dit la raison réelle et renvoie à « Mon fil » ; section « Comment fonctionne votre fil » dans `feed-preferences-screen.tsx` : sources, ordre par date, absence de score, masquage, sourdine, portées ; signets et notifications de commentaires listés au même endroit.
- **Mobile** : « Mon fil » (réafficher, lever une sourdine) avec FP-12.
- **Données personnelles** : aucune.
- **Tests et cliquets** : textes fr et en ; aucune phrase qui promet une recommandation.
- **Critères d'acceptation** : chaque raison du domaine (`FEED_REASONS`) a son explication ; le texte décrit exactement le code ; il change si FP-16 change la règle.
- **Dépend de** : FP-16 pour la mise à jour du texte.
- **Porte** : relecture du texte par le propriétaire.

### FP-10 — Coût du fil borné et mesuré · priorité P1 · taille M · session S1
- **Pour l'utilisateur** : un fil qui reste fluide après 100 publications, et moins de données.
- **Backend** : aucun changement d'API prévu ; mesurer exécutions et lectures de `myFeed` par minute.
- **Web** : garder vivantes les trois dernières pages, figer les plus anciennes (constat F05, plan déjà écrit dans `P18A`) ; remplacer le contenu des cartes lointaines par un espace de même hauteur sans toucher la carte focalisée (F06).
- **Mobile** : même principe si la mesure le justifie.
- **Données personnelles** : aucune.
- **Tests et cliquets** : tests de `FeedPages` et de l'immersion (curseurs stables, frontières, rattrapage).
- **Critères d'acceptation** : mémoire et nœuds relevés à 30 puis 100 publications, avant et après ; aucune régression de position ni de « nouvelles publications ».
- **Dépend de** : plan 13 (charge R8, observabilité).
- **Porte** : aucune.

### FP-11 — Épingler un commentaire · priorité P2 · taille S · session S1
- **Pour l'utilisateur** : l'auteur met en tête une réponse utile.
- **Backend** : champ `pinnedCommentId` facultatif sur `posts`, écrit par l'auteur vivant (ou signataire de la page) ; relu à chaque lecture (commentaire retiré : plus d'épingle).
- **Web** : « Épingler » dans le menu du commentaire ; libellé « Épinglé par l'auteur ».
- **Mobile** : après le web.
- **Données personnelles** : aucune nouvelle.
- **Tests et cliquets** : retrait du commentaire, effacement de son auteur.
- **Critères d'acceptation** : un seul épinglé ; visible en tête de la première page.
- **Dépend de** : FP-06.
- **Porte** : aucune.

### FP-12 — Parité mobile du composeur et des gestes · priorité P1 · taille L · session S3
- **Pour l'utilisateur** : publier une photo depuis son téléphone, comme sur le web.
- **Mobile** : `compose-screen.tsx` : photos (jusqu'à 4, allégées et nettoyées comme FP-01), vidéo, texte alternatif, audience complète (défaut le plus restreint), « Publier aussi sur ANTSIA », province, publication au nom d'une page ; modifier sa publication et son commentaire ; « Mon fil » ; fil National membre ; nouveautés des lots FP-03 à FP-08.
- **Backend** : aucun ; S1 ajoute au catalogue la dépendance de ré-encodage natif si elle est retenue.
- **Données personnelles** : celles du web.
- **Tests et cliquets** : tests du composeur natif ; audit de parité du plan 14.
- **Critères d'acceptation** : une publication avec photos faite au téléphone apparaît identique sur le web ; aucune métadonnée EXIF ; parité constatée sur simulateur puis appareil.
- **Dépend de** : FP-01 ; plan 14.
- **Porte** : build et soumission sur accord du propriétaire.

### FP-13 — Brouillons enregistrés · priorité P2 · taille M · session S1
- **Pour l'utilisateur** : retrouver un brouillon le lendemain, sur un autre appareil.
- **Backend** : table `postDrafts` (`networkId`, `personId`, corps, audience, références de médias déjà admis, `updatedAt`, index `by_network_person_updatedAt`), au plus N par personne (décision), expiration ; médias réservés tant que le brouillon vit (garde des fichiers, `admitStoredUpload`).
- **Web** : « Enregistrer le brouillon » explicite ; liste des brouillons dans le composeur ; `sessionStorage` reste le filet automatique.
- **Mobile** : après le web.
- **Données personnelles** : export et effacement ; purge à l'expiration (cron, cliquet `crons-contract`).
- **Tests et cliquets** : `file-delivery-gate`, `fresh-upload`, `crons-contract`.
- **Critères d'acceptation** : brouillon repris ailleurs ; publié, il disparaît ; expiré, ses médias suivent le passage orphelin.
- **Dépend de** : aucun.
- **Porte** : aucune.

### FP-14 — Publications programmées · priorité P2 · taille M · session S1
- **Pour l'utilisateur** : une page ou une personne prépare une publication pour une heure donnée.
- **Backend** : table `scheduledPosts` séparée (ne pas ajouter de statut à `posts`, que tous les lecteurs filtrent) ; au moment dit, une mutation interne repasse **toutes** les gardes de `publish` (adhésion vivante, suspension, débit, signataire vivant, modération) puis appelle `writePost` ; échec dit à l'auteur.
- **Web** : choix de la date dans le composeur ; liste « Programmées » avec annulation.
- **Mobile** : après le web.
- **Données personnelles** : export et effacement.
- **Tests et cliquets** : `crons-contract`, `rate-limited-writes`, cas d'un auteur suspendu entre-temps.
- **Critères d'acceptation** : publiée à l'heure (à la minute près) avec ses médias ; jamais publiée si l'auteur a perdu le droit.
- **Dépend de** : plan 07 pour l'écran des pages.
- **Porte** : aucune.

### FP-15 — Sondages · priorité P2 · taille L · session S1
- **Pour l'utilisateur** : poser une question à 2–4 choix, avec échéance.
- **Backend** : tables `postPolls` et `postPollVotes` (une voix par personne, modifiable jusqu'à l'échéance), résultats agrégés seulement (décision 7) ; garde de la publication ; débit.
- **Web** : création dans le composeur, vote et résultats dans `PostCard.tsx`.
- **Mobile** : après le web.
- **Données personnelles** : la voix est une donnée personnelle : export et effacement (décompte rendu).
- **Tests et cliquets** : double vote, échéance, effacement.
- **Critères d'acceptation** : aucun nom de votant visible ; résultats exacts.
- **Dépend de** : décision 7.
- **Porte** : aucune.

### FP-16 — « Pour vous » par intérêts choisis, et « Abonnements » · priorité P2 · taille L · session S1
- **Pour l'utilisateur** : un nouveau membre suit #mariage ou la province de l'Estuaire et voit des publications publiques correspondantes ; il garde un fil strictement « Abonnements ».
- **Backend** : table `interestFollows` (`networkId`, `personId`, `kind` : `tag` | `province`, `value`) ; fenêtres supplémentaires dans la fusion de `myFeed` (index `by_root_province_status_publishedAt` existe ; un index par mot-dièse est à concevoir) ; raisons nouvelles `tag` et `province` dans `FEED_REASONS` ; toujours par date, sans score ; portée `abonnements` dans `FEED_SCOPES` si la décision 3 la retient.
- **Web** : « Suivre ce mot-dièse » sur la page du mot-dièse, « Suivre cette province » sur le fil provincial ; gestion dans « Mon fil ».
- **Mobile** : après le web.
- **Données personnelles** : intérêts dans l'export et l'effacement ; aucun intérêt déduit.
- **Tests et cliquets** : `feedAdmissionFor` garde l'audience en premier ; test « aucune publication non publique par un intérêt ».
- **Critères d'acceptation** : un « Pour vous » vide devient alimenté par les seuls intérêts choisis ; chaque carte dit sa raison ; FP-09 mis à jour.
- **Dépend de** : décisions 2 et 3 ; plan 12 (régime des mineurs, SU01c).
- **Porte** : décision du propriétaire ; avis du juriste sur les 16–17 ans.

### FP-17 — Statistiques réelles pour l'auteur · priorité P2 · taille M · session S1
- **Pour l'utilisateur** : par publication, réactions par genre, commentaires, partages, dans le temps.
- **Backend** : lecture des agrégats existants ; aucune donnée nouvelle tant que FP-20 n'est pas décidé.
- **Web** : panneau dans « Mes publications » et pour les signataires d'une page.
- **Mobile** : après le web.
- **Données personnelles** : aucune nouvelle.
- **Tests et cliquets** : aucun chiffre sans donnée (valeur absente plutôt que zéro inventé).
- **Critères d'acceptation** : chiffres égaux aux décomptes de la carte.
- **Dépend de** : plan 07 (pages), plan 08 pour les ventes.
- **Porte** : aucune.

### FP-18 — Collections de signets · priorité P2 · taille S · session S1
- **Backend** : table `bookmarkCollections` et champ facultatif sur `postMarks` (`kind = bookmark`) ; bornées par personne.
- **Web** : « Ajouter à une collection » dans le menu ; collections dans le panneau des signets. **Mobile** : après le web.
- **Données personnelles** : export et effacement.
- **Critères d'acceptation** : privées, invisibles de l'auteur, supprimables. **Porte** : aucune.

### FP-19 — Mots masqués · priorité P2 · taille M · session S1
- **Backend** : table `mutedWords` (au plus N par personne) ; filtre appliqué après la garde, au fil seulement, comme la sourdine (`posts.ts`, `discovery.ts`).
- **Web** : gestion dans « Mon fil ». **Mobile** : après le web.
- **Données personnelles** : export et effacement.
- **Critères d'acceptation** : un mot masqué retire les publications du fil, pas du mur ni de la recherche ; la lacune éventuelle est signalée. **Porte** : aucune.

### FP-20 — Vues des publications · priorité P3 · taille M · session S1
- **Backend** : compteur fragmenté (patron `postReactionShards`), une vue par personne et par jour, écrite par lots ; jamais sur le document chaud (EXF-AN-13).
- **Web** : visible de l'auteur seul d'abord (FP-17). **Mobile** : après le web.
- **Données personnelles** : aucune trace individuelle conservée au-delà du jour.
- **Critères d'acceptation** : coût mesuré sous charge R8 avant ouverture. **Porte** : décision 5 du propriétaire ; mesure du plan 13.

## 6. Ordre recommandé et dépendances

| Vague | Lots | Pourquoi dans cet ordre |
|---|---|---|
| 1 | FP-01, puis FP-02 | Vie privée et poids d'abord ; la recette réelle valide ensuite le parcours avec les photos nettoyées |
| 2 | FP-03, FP-04, FP-09 | Petits, sans dépendance, visibles par tous ; FP-04 sert la diffusion par WhatsApp du pilote |
| 3 | FP-06, FP-07, FP-08, FP-10 | Interactions attendues ; FP-10 avant la montée en charge |
| 4 | FP-05, FP-12 | Attendent le plan 01 et le plan 14 |
| 5 | FP-11, FP-13, FP-14, FP-15, FP-17, FP-18, FP-19 | Confort et outils des pages |
| 6 | FP-16, FP-20 | Après décisions, avis du juriste et mesures |

Dépendances vers d'autres plans : **01** (message portant une publication, FP-05) ; **03** (Stories, Clips, Découvrir, recherche, tendances, dérivés d'images, affiches et sous-titres vidéo) ; **05** (profils, recherche de personnes) ; **06** (deux identités réelles, cloche) ; **07** (pages, groupes, épinglage de groupe) ; **08** (commerce derrière les formules) ; **11** (alertes officielles et sponsorisé dans le fil) ; **12** (signalement, gel SU01g, droit de réponse SU01e, information au relais SU01f, marquage de l'IA SU01i, mineurs SU01c, mesures sur ordre SU01h) ; **13** (charge R8, domaines, mesure 3G) ; **14** (parité mobile) ; **16** (traduction).

## 7. Décisions à prendre par le propriétaire

1. **Poids et taille des photos.** Recommandation : ré-encodage systématique, plus grand côté borné (proposition : 2 048 px), poids cible à fixer après mesure, GIF animé refusé ou gardé seul. Raison : coût des données et vie privée. **Décidé par le propriétaire le 9/11/2026 :** ré-encodage systématique, plus grand côté borné à 2 048 px. Restent à fixer dans le lot : le poids cible après mesure, et le sort du GIF animé.
2. **Nature de « Pour vous ».** Recommandation : rester par date, sur les liens et les intérêts explicitement choisis, sans score d'engagement. Raison : transparence voulue (`04` § 6), mineurs (art. 193), simplicité.
3. **Portée « Abonnements ».** Recommandation : l'ajouter seulement avec FP-16, pour garder un fil strict quand « Pour vous » s'élargit ; sinon garder deux portées.
4. **Versions d'une publication modifiée.** Recommandation : marque « Modifiée » publique ; versions visibles de l'auteur et de la modération seulement ; modification sans limite de temps. Raison : honnêteté sans exposer les brouillons.
5. **Compter les vues.** Recommandation : pas avant la mesure de charge ; auteur seul ensuite.
6. **Liste de qui a réagi.** Recommandation : visible de tout lecteur autorisé, bloqués exclus. Raison : usage Facebook et LinkedIn, sans exposer plus que la publication.
7. **Sondages.** Recommandation : vote secret, résultats agrégés seuls.
8. **Retrait serveur des métadonnées.** Recommandation : ré-encodage client fail-closed maintenant ; contrôle serveur avec la chaîne des médias du plan 03. Raison : un client modifié peut contourner le navigateur.

## 8. Risques et points d'attention

- **Paquets partagés avec DIASPORALE** : `@antsia/social-features` sert les deux réseaux ; toute nouveauté passe par une capacité déclarée, DIASPORALE inchangée sans décision (ADR-0017).
- **Projections publiques strictes** : ajouter un champ à `public.getPost` casse les fronts déjà en ligne ; publier une projection à part (FP-04).
- **Gardes relues** : une publication programmée, un brouillon, un message iCom ou un intérêt ne donnent jamais un droit ; chaque lecture repasse `canSeePostDoc`.
- **Modification après signalement** : coordonner FP-03 avec le gel SU01g, sinon une preuve disparaît.
- **Coût** : chaque fenêtre de plus dans `myFeed` (FP-16) multiplie les lectures ; mesurer avec FP-10 et R8.
- **Recadrage** : les cartes du bureau sont larges (ADR-0037) ; une photo en hauteur y est recadrée ; la visionneuse garde l'image entière.
- **Cibles tactiles** : les actions compactes de 25 px sont sous 44 px (ADR-0037) ; ne pas en ajouter de plus petites.
- **Aucune promesse** : aucun texte ne doit annoncer une recommandation, une vue ou une statistique que le code ne calcule pas.

## 9. Prompts d'implémentation

### Prompt FP-01

```text
Tu exécutes le lot FP-01 du plan 02 d'ANTSIA (photos de publication allégées et nettoyées). Écris-moi en français. Opus pour tout le code, aucun sous-agent Sonnet.
Lis : CLAUDE.md ; docs/etudes/2026-11-09-finalisation/00_PLAN_DIRECTEUR.md § 1, 2, 7 ; 02_FIL_PUBLICATIONS_INTERACTIONS.md § 1, 2 (lignes 17, 21) et FP-01 ; docs/etudes/2026-10-18-social-commerce/rapports/P18A_AUDIT_STATIQUE.md (F04).
Vérifie d'abord que useMediaDraft.ts ne ré-encode toujours pas et que AlbumComposer.tsx contient albumReencodePlan et reencodeOnCanvas.
Périmètre : packages/social-features/src/features/reseau-personnel/{useMediaDraft.ts,PostMediaPresentation.tsx,PostComposer.tsx}, un module partagé de ré-encodage tiré de features/reseau-albums/ (sans dupliquer), packages/social-domain/src/content.ts, leurs tests, les clés i18n fr et en.
Livre : ré-encodage fail-closed avant téléversement, plus grand côté et poids cible selon la décision 1 (demande-la si elle n'est pas prise), métadonnées EXIF absentes, première image en eager + fetchpriority=high, message de refus traduit.
Vérifie : bun run verify ; recette 390, 834, 1440 px, clair et sombre ; une photo de test avec coordonnées GPS : prouver l'absence d'EXIF dans le fichier servi ; mesurer les octets pour 30 publications avant et après.
Arrête-toi avant toute publication en ligne et si la décision 1 manque.
```

### Prompt FP-02

```text
Tu exécutes le lot FP-02 du plan 02 d'ANTSIA (recette réelle du fil et des interactions). Écris-moi en français.
Lis : CLAUDE.md ; 00_PLAN_DIRECTEUR.md § 7 ; 02_FIL_PUBLICATIONS_INTERACTIONS.md § 2 et FP-02 ; dossier de reprise § 2.2 et § 10.
Ne modifie aucun code. Lance bun run verify sur main (verrou commun). Sur la démo, avec deux comptes de démonstration, joue chaque geste listé dans FP-02 à 390, 834 et 1440 px, clair et sombre, Liste et Immersion. Note chaque constat avec une capture dans docs/recette/fil-deux-identites-<date>/RAPPORT.md.
Pour la production : prépare la liste des gestes et demande-moi mon second compte et mon accord écrit avant toute écriture. Je saisis moi-même PIN et codes.
Chaque écart devient une proposition de lot ; ne corrige rien dans ce lot. Ne dis jamais « recetté » sans constat.
```

### Prompt FP-03

```text
Tu exécutes le lot FP-03 du plan 02 d'ANTSIA (modification honnête : marque et versions). Écris-moi en français. Opus seulement.
Lis : CLAUDE.md ; 00_PLAN_DIRECTEUR.md § 1, 2, 7 ; 02_FIL_PUBLICATIONS_INTERACTIONS.md FP-03 ; convex/modules/posts/posts.ts (edit) ; convex/modules/people/{dataPolicies,dataInventory,erasure}.ts.
Vérifie que PostCard.tsx n'affiche toujours pas editedAt. Session S1 seule pour convex/schema.ts.
Livre : table postRevisions bornée (décision 4, demande-la si elle manque), écrite avant le patch de posts.edit ; lecture auteur (networkQuery) et modération (operatorQuery avec appendAudit si écriture) ; marque « Modifiée » dans la carte membre et publique (projection publique à part si un champ est ajouté) ; export et effacement ; tests et cliquets (network-scoped-functions, operator-audit, i18n-locales, erasure.test.ts).
Vérifie : bun run verify ; recette 390, 834, 1440 px, clair et sombre. Arrête-toi avant toute publication et pour coordonner le gel SU01g avec la session du plan 12.
```

### Prompt FP-04

```text
Tu exécutes le lot FP-04 du plan 02 d'ANTSIA (partager hors de l'application). Écris-moi en français. Opus seulement.
Lis : CLAUDE.md (piège des projections publiques strictes) ; 02_FIL_PUBLICATIONS_INTERACTIONS.md FP-04 ; packages/social-features/src/features/reseau-personnel/SharePostDialog.tsx ; apps/antsia_ga/src/lib/{routes.ts,public-data.ts} ; apps/antsia_ga/src/components/public/public-routes.tsx ; convex/modules/public/projections.ts.
Établis d'abord si l'URL servie d'un média public reste stable ; si non, propose une projection publique à part avant de coder.
Livre : adresse publique pour une publication root publique, adresse membre sinon ; navigator.share avec repli ; image dans les métadonnées Open Graph ; même règle dans nativeCanonicalPostUrl côté mobile seulement si tu es S3, sinon note-le pour S3.
Vérifie : bun run verify ; ouvrir le lien copié dans une fenêtre privée ; contrôle des balises meta ; 390, 834, 1440 px. Arrête-toi avant toute publication.
```

### Prompt FP-06

```text
Tu exécutes le lot FP-06 du plan 02 d'ANTSIA (commentaires : aimer, restreindre, fermer). Écris-moi en français. Opus seulement.
Lis : CLAUDE.md ; 02_FIL_PUBLICATIONS_INTERACTIONS.md FP-06 ; convex/modules/engagement/{engagement,tables}.ts ; convex/modules/posts/{access,counters}.ts ; convex/lib/rateLimit.ts ; packages/social-features/src/features/reseau-personnel/CommentsSurface.tsx.
Session S1 seule pour convex/schema.ts. Respecte : requireMembership en tête, refus indistinct, débit sur chaque écriture, cloche sans contenu par la porte unique, décompte par l'agrégat existant, jamais sur le document chaud.
Livre : commentLikes, commentPolicy (tout le monde, connexions, personne) lu par assertPostDiscussionOpen, mutations toggleCommentLike et setCommentPolicy, écrans et textes fr/en, export et effacement, tests et cliquets (rate-limited-writes, network-scoped-functions, notification-payload-content, erasure.test.ts).
Vérifie : bun run verify ; recette à deux comptes de démonstration, 390, 834, 1440 px, clair et sombre. Arrête-toi avant toute publication.
```

## 10. Sources lues

- Brief commun ; plan directeur (`00_PLAN_DIRECTEUR.md`) ; dossier de reprise (§ 2, 7, 9, 10, 11, 12, 13.1).
- Cahier : EXF-AN-10 à 13, 46, 49, 50, 52 ; lot A4.
- ADR-0017, 0020, 0033, 0035 (par l'étude), 0037.
- Études : `2026-10-18-social-commerce/` (`01`, `04`, `09`, `EXECUTION.md`, `rapports/P18A_AUDIT_STATIQUE.md`) ; `2026-10-20-experience-sociale-responsive/` (`01`, `02`, `03`) ; `2026-10-21-sept-univers-et-vie-publique/` (`SU01_CONFORMITE_ORDONNANCE_0011.md`, `ETUDE_SEPT_UNIVERS_ANTSIA.md`) ; `2026-10-22-fil-sans-cadre/README.md`.
- Rapports : `docs/06_RAPPORT_LANCEMENT.md` ; recettes `partage-2026-10-18`, `fil-mobile-2026-10-18`.
- Mémoire : `fil-sans-cadre-adr-0037`, `colonne-unique-au-bureau`, `gouttiere-unique-bureau`, `maquettes-fideles-au-code` ; vault `decisions/2026-10-22-fil-sans-cadre.md`.
- Code : `convex/modules/{posts,engagement,marks,media,public,discovery}`, `convex/modules/people/{dataPolicies,dataInventory,erasure}.ts`, `convex/lib/rateLimit.ts`, `convex/modules/messaging/tables.ts` ; `packages/social-domain/src/{content,richText,feedScale}.ts` ; `packages/social-features/src/features/{reseau-personnel,feed-immersion,media-playback,reseau-albums}` et les locales `reseau.fil`, `reseau.immersion`, `reseau` ; `apps/antsia_ga/src/{app/(membre)/fil,app/(membre)/mon-fil,app/(public)/publications,app/(public)/tags,components/feed,components/discovery,components/public,lib/routes.ts,lib/public-data.ts}` ; `apps/antsia_mobile/src/screens/{feed-screen,compose-screen,post-actions,comments-section,profile-screens,public-entry-screen}.tsx`.
