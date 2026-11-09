# Plan 03 — Stories, Clips, découverte et recherche

> Constaté par lecture du code d'`origin/main` (ANTSIA `26741caa`, DIASPORALE `bead76d`), le 9 novembre 2026. Rien n'a été exécuté.
> Applications de référence : Instagram (Stories, Reels, Explorer), TikTok, YouTube Shorts, Snapchat, Statuts de WhatsApp ; pour la recherche : Instagram, TikTok, X. Comparaison faite de mémoire (état des produits à la mi-2026), non revérifiée en ligne.

Lexique. **Story** : contenu qui s'efface après 24 h. **Clip** : vidéo courte verticale. **Garde de délivrance** : la fonction du moteur qui seule rend l'adresse d'un fichier, après analyse antivirus (`convex/modules/files/storageGuard.ts`). **Transcodage** : réencoder une vidéo dans un autre format ou débit. **Variantes** : plusieurs qualités d'une même vidéo. **Lecture adaptative (HLS)** : le lecteur choisit la qualité selon le débit. **Affiche** : image fixe montrée avant la lecture. **EXIF** : métadonnées cachées d'une photo (appareil, date, parfois position GPS). **Index de recherche** : table que Convex tient pour retrouver un texte.

## 1. L'intention du propriétaire

- Stories et Clips font partie du **pilier Divertissement**, « la raison de revenir chaque jour » (ADR-0035 D01 ; étude sept univers § 4).
- La référence voulue : « présenté comme Instagram, défilant comme TikTok » (ADR-0017, Contexte). Un seul média joue à la fois, jamais de son sans geste, pause hors écran et pendant un appel (ADR-0017 § 4 ; étude social-commerce `04` § 3, six règles de lecture).
- Le coût des données est central : lecture automatique muette seulement hors économie de données, préchargement d'une seule voisine, aucun en mode économie (`04` § 3, règles 2 et 4). « On doit pouvoir tout lire » : une vidéo publiée doit se jouer partout (contrat du 2026-08-20 cité dans `story-video-policy.ts`).
- Noms retenus : **Stories**, **Clips**, **Explorer** (étude responsive `02_NOMS_ET_MICROTEXTES.md`). Le menu Créer cible « Post · Story · Clip · Direct » (même document, l. 58).
- Découvrir est « la porte des trois piliers » : recherche en tête, Business (tuiles des univers **ouverts** seulement), Vie publique, Divertissement (étude sept univers § 12 ; SU02 en ligne depuis le 23/10, `EXECUTION.md`).
- Cinq destinations au téléphone : Fil, Clips, Messages, Découvrir, Profil ; on range, on n'ajoute pas d'icône (ADR-0034, rappelé § 12 de l'étude).
- « Ne pas annoncer une recherche universelle avant raccord et pagination par type » (étude responsive `01`, l. 59). Une route ou une tuile n'existe qu'à l'ouverture effective (ADR-0035 D04).
- Le plat du jour se partage en Story par un geste explicite du gérant, sans copier le catalogue (décision vault du 24/10, `2026-10-24-stories-plat-reference-et-dock-mobile.md`).
- Classement chronologique, sans score d'affinité (SU01, art. 22) ; aucune personnalisation avant protocole de mesure (DIASPORALE `docs/14`, G6 point 6).
- Refusé : grille de publications au bureau pour le fil (mémoire `colonne-unique-au-bureau`, PR 59) ; musique d'Instagram ou TikTok sans licence propre (DIASPORALE `docs/14`, G6).

## 2. Ce qui existe

Chemins relatifs au dépôt ANTSIA. « Web » = `apps/antsia_ga` et `packages/social-features` ; « Mobile » = `apps/antsia_mobile`.

| Capacité | État | Web | Mobile | Preuve |
|---|---|---|---|---|
| Publier une Story photo ou vidéo, 24 h, légende de 200 signes | Présent | oui | renvoie au web | `convex/modules/stories/stories.ts` (`publish`), `packages/social-domain/src/stories.ts`, `packages/social-features/src/features/stories/StoryCreateSheet.tsx`, `apps/antsia_mobile/src/app.tsx` (`onCreateStory` ouvre le web) |
| Bornes Story : image 20 Mio, vidéo 50 Mio et 5 min, MP4/WebM, 20 Stories vivantes par auteur et réseau | Présent | oui | — | `packages/social-domain/src/stories.ts`, `packages/social-domain/src/uploadPolicy.ts` (`story_media`) |
| Conversion d'une vidéo .mov vers MP4/WebM avant envoi | Partiel : Stories seulement, dans le navigateur (`MediaRecorder`), 3 min au plus, onglet visible, en temps réel | oui | non | `packages/social-features/src/features/stories/story-video-policy.ts`, `story-video-probe.ts` |
| Story texte seul, texte superposé | Absent (motifs : `textStory`, `background`, `fond`, `texte seul`, `overlay`) ; le serveur exige un média | non | non | `stories.ts` (`assertStoryMedia` toujours appelé) |
| Dessin, autocollants, sondage, question, musique | Absent (motifs : `sticker`, `poll`, `sondage`, `question`, `draw`, `music`, `musique`) | non | non | `features/stories/*` |
| Mentions dans une Story | Absent (motifs : `mention`, `@`, `taggedPerson`) | non | non | `convex/modules/stories/tables.ts` |
| Lien dans une Story | Partiel : seule la Story du plat du jour porte « Commander » | oui | oui | `DailySpecialStoryCard.tsx`, `apps/antsia_mobile/src/screens/stories-section.tsx` |
| Audience Public ou Relations, rejugée à chaque lecture | Présent | oui | lecture | `packages/social-domain/src/content.ts` (`PERSONAL_REACH_AUDIENCES`), `isStoryVisibleTo` |
| Amis proches | Absent (motifs : `closeFriends`, `amis proches`, `bestFriends`) | non | non | même fichier : deux audiences seulement |
| Plateau groupé par auteur, non-vues en tête | Présent | fil, iCom | fil | `stories.ts` (`tray`), `StoriesTray.tsx`, `features/messagerie/IcomActusPanel.tsx`, `stories-section.tsx` |
| Lecteur plein écran : progression, pause (appui long et bouton), flèches, glissé entre auteurs | Présent web ; Partiel mobile (feuille, Précédente/Suivante, sans minuterie ni barre) | oui | partiel | `StoryViewer.tsx`, `stories-progress.ts`, `stories-section.tsx` |
| Préchargement de la Story suivante (métadonnées) | Présent | oui | non | `StoryViewer.tsx` (`preloadTarget`) |
| « Vu par » et nombre de vues, réservés à l'auteur | Présent web ; Absent mobile | oui | non | `stories.ts` (`viewers`), `StoryViewersSheet.tsx` |
| Retrait d'une Story | Présent web ; Absent mobile | oui | non | `stories.ts` (`remove`) |
| Réponse ou réaction rapide à une Story | Absent (motifs : `reply`, `répondre`, `reaction`, `storyReply`) | non | non | `features/stories/*`, `convex/modules/messaging` |
| Signaler une Story | Partiel : le serveur accepte la cible `story` ; aucune commande dans le lecteur | non | non | `convex/modules/moderation/tables.ts` (l. 34), `moderation/targets.ts`, `cases.ts` (`report`) ; `StoryViewer.tsx` sans `report` |
| Sourdine des Stories d'un auteur | Absent (motifs : `muteStories`, `sourdine`, `hideStories`) | non | non | `convex/modules/marks/marks.ts` (`muteAuthor` vise le fil) |
| Stories à la une, archive | Absent : purge contractuelle du média et des vues | non | non | `stories.ts` (`purgeExpired`), `convex/crons.ts` (toutes les 10 min) |
| Anneau de Story sur le profil | Absent : `StoryRing` n'est employé que par le plateau | non | non | `features/stories/StoryRing.tsx` |
| Story du plat du jour (référence, expiration à minuit à Libreville) | Présent | oui | lecture | `convex/modules/stories/dailySpecialSource.ts`, `publishDailySpecial` |
| Directs en tête du lecteur de Stories | Présent (plan 04) | oui | non | `StoriesViewerPage.tsx`, `LiveDirectSlide.tsx` |
| Purge, export et effacement des Stories | Présent | — | — | `stories.ts`, `convex/modules/people/dataInventory.ts` |
| Fil Clips vertical (immersion) ou en liste, Clips d'un auteur | Présent | `/clips`, `?auteur=` | `clips` | `apps/antsia_ga/src/components/discovery/media-discovery-screen.tsx`, `apps/antsia_mobile/src/screens/media-feed-screen.tsx` |
| Source des Clips | Partiel : publications filtrées une à une dans des fenêtres de 30 lignes ; une fenêtre sans vidéo est vide | oui | oui | `convex/modules/posts/mediaFeed.ts` (`maximumRowsRead: 30`) |
| Un seul média joue, seuil de 70 % de visibilité, pause onglet masqué et appel | Présent | oui | partiel | `features/media-playback/media-playback-policy.ts`, `media-playback-coordinator.ts` |
| Lecture auto muette, économie de données lue sur l'appareil | Présent (signal du système seulement) | oui | non | `media-playback-environment.ts` (`saveData`, `prefers-reduced-data`) |
| Réglage « lecture automatique » ou « économie de données » dans ANTSIA | Absent (motifs : `autoplay`, `lecture automatique`, `dataSaver`, `économie`) | non | non | `apps/antsia_ga/src/app/(membre)/parametres/settings-screen.tsx` |
| Lecture en boucle | Absent, par règle (« aucune relance à la fin ») | non | `loop = false` | `media-playback-coordinator.ts`, `apps/antsia_mobile/src/components/guarded-media.tsx` |
| Vitesse de lecture | Absent (motifs : `playbackRate`, `vitesse`, `speed`) | non | non | `features/media-playback/*` |
| Créer un Clip (entrée dédiée, montage, brouillon) | Absent : une vidéo publiée comme publication apparaît dans Clips | non | non | `packages/social-features/src/i18n/locales/fr/reseau.fil.json` (`creationController.entries`) |
| Sons réutilisables, duo, remix | Absent (motifs : `sound`, `remix`, `duet`, `duo`) | non | non | `packages/social-domain/src/content.ts` |
| Garde de délivrance, antivirus, liste blanche par usage | Présent | — | — | `convex/modules/files/*`, `convex/modules/media/media.ts`, `packages/social-domain/src/uploadPolicy.ts` |
| Bornes vidéo des publications | Partiel : 100 Mio, QuickTime (.mov) accepté sans conversion, aucune borne de durée | — | — | `packages/social-domain/src/content.ts` (l. 87-92) |
| Compression des photos avant envoi et retrait de l'EXIF | Partiel : albums seulement (réencodage), offres (recadrage carré) ; rien pour Stories et publications | albums | non | `features/reseau-albums/AlbumComposer.tsx`, `apps/antsia_ga/src/lib/square-image.ts` |
| Transcodage serveur, variantes, lecture adaptative | Absent (motifs : `transcode`, `ffmpeg`, `hls`, `m3u8`, `rendition`) | non | non | `convex/` |
| Affiche d'une vidéo | Absent (motifs : `poster`, `thumbnail`, `vignette`) ; la grille charge les métadonnées vidéo à l'approche | non | icône | `media-discovery-screen.tsx` (`DeferredPreview`) |
| Sous-titres | Absent (motifs : `track`, `vtt`, `subtitle`, `sous-titre`) | non | non | `packages/social-contracts/src/media.ts` |
| Texte alternatif des images | Présent (publications) ; absent des Stories | oui | — | `content.ts` (`POST_MEDIA_ALT_MAX_LENGTH`) |
| `/explorer` rangé par piliers, univers ouverts seulement | Présent | oui | non | `components/discovery/discover-screen.tsx` (`DiscoverPillars`) |
| Grille de médias d'Explorer | Présent | oui | oui | `media-discovery-screen.tsx`, `media-feed-screen.tsx` |
| Piliers complets selon l'étude § 12 | Partiel : Vie publique = Presse ; Divertissement = Clips et « Rencontres · accès fermé » | oui | non | `discover-screen.tsx` |
| `/decouvrir` public : provinces, tendances, fil public | Présent | oui | entrée publique | `components/public/public-routes.tsx` (`DiscoverScreen`) |
| Provinces : pages publique et membre | Présent (index par province) | oui | — | `convex/modules/discovery/discovery.ts`, `packages/social-domain/src/provinces.ts` |
| Recherche de publications | Partiel : 100 candidats, triés par date, sans pagination | fil | `search` | `convex/modules/posts/posts.ts` (`search`), `shell/ReseauAgentPage.tsx`, `apps/antsia_mobile/src/screens/search-screen.tsx` |
| Recherche de personnes, pages, groupes, boutiques et offres | Présent, chacune dans son écran | oui | boutiques | `people/directory.ts` (`searchPeople`), `pages/pages.ts` (`paginateDiscover`), `thematicGroups/thematicGroups.ts`, `shops/marketplaceRead.ts` |
| Recherche unifiée avec filtres par type | Absent (motifs : `/recherche`, `globalSearch`, `searchAll`, `unifiedSearch`) | non | non | `apps/antsia_ga/src/lib/routes.ts` |
| Suggestions de saisie, recherches récentes | Absent (motifs : `recentSearch`, `recherches récentes`, `autocomplete`, `suggest`) | non | non | — |
| Page d'un mot-dièse | Partiel : filtre en mémoire sur des fenêtres de 30 (membre) ou 20 (public) publications ; aucun index | `/fil?tag=`, `/tags/[tag]` | `onSearchTag` | `discovery.ts` (`rootFeed`), `public/projections.ts` (`listRootPosts`) |
| Tendances | Partiel : public, racine seule, 7 jours glissants, 10 mots au plus, seuil de 5 publications et 5 auteurs | `/decouvrir` | entrée publique | `convex/modules/public/aggregate.ts`, `convex/crons.ts` (15 min) |
| Recherche par lieu | Absent dans la recherche (la province n'existe que comme portée du fil) | non | non | `posts.ts` (`search` sans province) |
| « Pas intéressé », contenus proches | Partiel : « Masquer » une publication existe ; aucun contenu proche | oui | — | `marks/marks.ts` (`hidePost`), `PostOverflowMenu.tsx` |
| Recherche publique sans compte | Absent | non | non | `public-routes.tsx` |

Décompte : 21 Présent, 11 Partiel, 20 Absent, 0 Fermé (sur 52 lignes ; l'état est celui du web quand le mobile diffère).

### Ce qui est écrit mais jamais recetté en réel

- **En ligne** : Stories, Clips et Explorer depuis U03–U08 (21/10) ; SU02 depuis le 23/10 (PR 77) ; Stories du plat du jour depuis la publication du 24/10 (dossier de reprise § 9). `main` est aligné sur la production depuis la PR 90 (2/11, reprise § 2.4).
- **Recetté** : pause d'une Story **image** en ligne à 390, 834 et 1440 px (vault `stories-pause-et-brouillon-2026-10-21.md`) ; Clips, passage au suivant au clavier et une seule vidéo en lecture (`rapports/U08_RECETTE_EN_LIGNE_2026-10-21.md`) ; SU02 sur la démo (`EXECUTION.md`) ; plat du jour en recette locale le 24/10.
- **Jamais recetté** : Story **vidéo**, conversion .mov, Stories sur appareil physique (vault, même note) ; « Vu par » avec de vrais spectateurs (aucune recette à deux identités, reprise § 10.1, P0) ; lecture sur 3G réelle ; grille d'Explorer sur réseau lent ; tendances avec données réelles (seuils jamais atteints en démo, non vérifié).

## 3. Comparaison avec les applications de référence

| Capacité | Instagram | TikTok | YouTube Shorts | Snapchat | WhatsApp Statuts | ANTSIA | Verdict |
|---|---|---|---|---|---|---|---|
| Story photo/vidéo 24 h | oui | oui | non | oui | oui | oui | Déjà fait |
| Story texte sur fond | oui | oui | — | oui | oui | non | À faire (SD-07) |
| Texte superposé, mentions | oui | oui | — | oui | texte seul | non | À faire (SD-07) |
| Sondage, question | oui | partiel | sondage | partiel | non | non | À adapter (SD-19) |
| Musique sous licence | oui | oui | oui | oui | oui | non | Écarté : aucune licence |
| Lien dans une Story | oui | — | — | oui | lien dans le texte | plat du jour | À adapter : liens internes (SD-19) |
| Amis proches | oui | non | non | oui | listes de contacts | non | À faire, P2 (SD-18) |
| Réponse et réaction rapide | oui | oui | — | oui | oui | non | À faire (SD-06) |
| Liste des vues | oui | oui | — | oui | oui | web | Déjà fait ; mobile (SD-15) |
| Sourdine d'un auteur | oui | — | — | oui | oui | non | À faire (SD-08) |
| À la une, archive | oui | non | — | Souvenirs | non | non | À décider (SD-21) |
| Signaler une Story | oui | oui | oui | oui | oui | serveur seul | À faire, P0 (SD-01) |
| Fil vidéo vertical | Reels | oui | oui | Spotlight | non | oui | Déjà fait |
| Lecture en boucle | oui | oui | oui | oui | — | non (règle) | À décider (SD-09) |
| Vitesse de lecture | partiel | oui | oui | non | — | non | À faire (SD-09) |
| Outils de montage, brouillons | oui | oui | oui | oui | rognage | non | À adapter : rognage seul (SD-14) |
| Sons réutilisables, duo, remix | oui | oui | oui | partiel | non | non | Reporté (DG-018, droits) |
| Sous-titres automatiques | oui | oui | oui | non certain | non | non | Reporté : plan 16 |
| Sous-titres fournis par l'auteur | non certain | non certain | oui (vidéos longues) | non | non | non | À faire, P2 (SD-17) |
| Économie de données dans l'app | oui | oui | oui | oui | téléchargement auto réglable | signal système seul | À faire (SD-04) |
| Qualité adaptée au débit | oui | oui | oui | oui | oui | non | Reporté (DG-018) |
| Compression avant envoi | oui | oui | oui | oui | oui | albums seuls | À faire (SD-02, SD-05) |
| Grille Explorer | oui | oui | — | Découvrir | — | oui | Déjà fait |
| Recherche avec onglets par type | oui | oui | oui | oui | — | non | À faire (SD-11) |
| Recherches récentes, suggestions | oui | oui | oui | oui | — | non | À faire (SD-11, SD-12) |
| Page d'un mot-dièse | oui | oui | oui | — | — | partielle | À faire (SD-12) |
| Tendances par période | non certain | oui | oui | — | — | 7 j public | À adapter (SD-16) |
| Recherche par lieu | oui | partiel | — | carte | — | non | À adapter : provinces (SD-16) |
| « Pas intéressé » | oui | oui | oui | oui | — | Masquer | Déjà fait côté fil ; contenus proches écartés |

Sources X : recherche avec onglets « Top, Récents, Personnes, Médias » et tendances par lieu (de mémoire, non revérifié).

## 4. Ce qui manque

### 4.1 Bloquant avant l'ouverture au public

1. **Signaler une Story** : l'ordonnance 0011 impose des signalements traités en 24 h et 72 h ; le serveur sait déjà les recevoir, l'écran non.
2. **Position GPS des photos** : les photos des Stories et des publications partent telles quelles, EXIF compris. Seuls les albums les nettoient (cahier EXF-AN-21 : « EXIF retiré » pour les albums). Une photo prise chez soi peut révéler l'adresse.
3. **Vidéos illisibles** : une publication accepte le .mov d'iPhone sans conversion ; il ne se lit pas dans Chrome sur Android, le cas le plus fréquent. Clips l'écarte ou affiche un échec. Aucune borne de durée pour les vidéos de publication.

### 4.2 Attendu par les utilisateurs

- Réglage de la lecture automatique et mode économie de données dans ANTSIA ; affiche des vidéos ; compression avant envoi.
- Réponse et réaction rapide à une Story ; Story texte ; mentions ; sourdine ; anneau sur le profil.
- Vitesse de lecture ; décision sur la boucle ; entrée « Clip » dans Créer avec rognage.
- Source des Clips qui ne rend pas de pages vides.
- Recherche unifiée avec onglets, recherches récentes, suggestions ; page de mot-dièse paginée.
- Découvrir complété : Directs, Groupes, Évènements, pages Officielles, seulement quand ils ont des données.
- Stories complètes sur mobile natif.

### 4.3 Différenciant pour ANTSIA

- **Faible débit d'abord** : un réglage simple « Économiser les données », affiches légères, aucune vidéo préchargée en économie, poids maximal dit avant l'envoi. Les références le cachent dans des sous-menus.
- **Confiance** : badges calculés visibles dans les résultats de recherche ; pages Officielles en tête de l'onglet Pages ; aucun classement payé.
- **Commerce relié** : la Story d'une offre ou d'un plat ouvre la vraie fiche ; lien interne seulement, aucun lien externe (pas d'hameçonnage).
- **Provinces** : tendances et recherche par province, données réelles du référentiel des neuf provinces.
- **Transparence** : tendances publiées seulement au-delà de 5 publications et 5 auteurs (déjà en place).

### 4.4 Écarté ou reporté, et pourquoi

| Sujet | Décision | Raison |
|---|---|---|
| Musique sous licence | Écarté (porte externe) | Aucun catalogue licencié ; DIASPORALE `docs/14` G6 |
| Sous-titres automatiques | Reporté au plan 16 | IA, marquage SU01i préalable |
| Sons réutilisables, duo, remix | Reporté après DG-018 | Exige l'extraction de piste côté serveur et un régime de droits et de consentement |
| Dessin à main levée | Reporté (P3) | Faible valeur au regard du coût sur 3G |
| Contenus proches, recommandation | Écarté pour l'instant | Classement chronologique (SU01 art. 22) ; DG-019 et plan 02 |
| Recherche en langage courant | Plan 16 | iAsted D05 étape (a) |
| Grille de publications au bureau | Écarté | Mémoire `colonne-unique-au-bureau` : la grille reste limitée à Explorer |

## 5. Lots d'implémentation

### SD-01 — Signaler une Story · priorité P0 · taille S · session S1
- **Pour l'utilisateur** : un bouton « Signaler » dans le lecteur de Story ouvre le même dialogue que pour une publication.
- **Backend** : aucun changement attendu ; `moderation.cases.report` avec `target: { kind: "story", id }`. Vérifier que `targets.ts` refuse une Story expirée ou invisible de façon indistincte, et que la Story signalée reste accessible au modérateur jusqu'à la décision même après 24 h (sinon : suspendre la purge d'une Story sous signalement ouvert, dans `purgeExpired`).
- **Web** : action dans `StoryViewer.tsx` (menu de la Story d'autrui), dialogue existant `reportContentDialog`, nouvelle clé `reportContentDialog.title.story` fr et en.
- **Mobile** : après le web (SD-15).
- **Données personnelles** : le signalement suit le régime existant des `reports`.
- **Tests et cliquets** : test du lecteur (commande présente pour autrui, absente pour l'auteur) ; test convex-test du signalement d'une Story puis de sa purge différée.
- **Critères d'acceptation** : signaler une Story crée un dossier avec accusé de réception ; l'auteur ne peut pas signaler sa propre Story ; la Story signalée reste lisible par la modération jusqu'à décision.
- **Dépend de** : plan 12 (délais légaux, déjà en place par SU01d).
- **Porte** : aucune.

### SD-02 — Photos nettoyées et allégées avant envoi · priorité P0 · taille M · session S1
- **Pour l'utilisateur** : la position GPS ne part jamais ; une photo de 8 Mo part allégée.
- **Backend** : aucun pour le nettoyage ; le serveur ne peut pas lire l'EXIF sans décoder. Documenter que la garantie est côté client et ajouter un test serveur qui refuse un JPEG dont le segment APP1 contient un bloc GPS (lecture des premiers octets dans l'action d'analyse, `files/inspect.ts`), en mode « signaler » d'abord.
- **Web** : extraire le réencodage d'`AlbumComposer.tsx` dans un module partagé (`features/media-upload/reencode-image.ts`), appliqué aux Stories (`StoryCreateSheet.tsx`) et au composeur de publication (`useMediaDraft`, plan 02). Grand côté borné (valeur à fixer par la décision 6 ; les albums réencodent sans réduire la taille, qualité `ALBUM_REENCODE_QUALITY` = 0,92), GIF exclu (animé).
- **Mobile** : sans objet tant que le natif ne téléverse pas de photo.
- **Données personnelles** : réduction de la collecte (loi 025/2023).
- **Tests et cliquets** : test pur du plan de réencodage ; test d'intégration : un JPEG avec GPS sort sans APP1.
- **Critères d'acceptation** : aucune photo de Story ou de publication n'arrive avec un bloc GPS ; poids réduit annoncé avant l'envoi.
- **Dépend de** : plan 02 (composeur).
- **Porte** : aucune.

### SD-03 — Vidéos lisibles partout et bornées · priorité P0 · taille M · session S1
- **Pour l'utilisateur** : toute vidéo publiée se lit sur Android, iPhone et ordinateur.
- **Backend** : `POST_VIDEO_MIME_TYPES` passe à MP4 et WebM pour les nouvelles publications (les anciennes restent lisibles par leur ligne) ; borne de durée déclarée pour les publications vidéo, alignée sur une valeur à décider (décision 6). Règle de domaine `POST_VIDEO_TOO_LONG`.
- **Web** : réutiliser `story-video-policy.ts` et `story-video-probe.ts` dans le composeur de publication : conversion du .mov quand le navigateur sait le lire, refus guidé sinon. Renommer le module en `video-upload-policy` avec ses paramètres de borne.
- **Mobile** : sans objet.
- **Données personnelles** : aucune nouvelle.
- **Tests et cliquets** : tests purs de la politique pour les bornes de publication ; test serveur du refus de `video/quicktime` ; cliquet `upload-policy` inchangé.
- **Critères d'acceptation** : un .mov choisi dans Safari est converti puis lu dans Chrome Android ; un .mov dans Chrome est refusé avec la marche à suivre.
- **Dépend de** : plan 02 (composeur).
- **Porte** : aucune.

### SD-04 — Économie de données et lecture automatique · priorité P1 · taille M · session S1
- **Pour l'utilisateur** : dans Paramètres, « Lecture automatique des vidéos : Suivre l'appareil · Jamais » et « Économiser les données » (aucun préchargement, affiches seules, aperçus d'Explorer sans vidéo).
- **Backend** : deux champs dans les préférences de présentation de la personne (ADR-0010) ; validateur précis ; export.
- **Web** : `media-playback-environment.ts` lit la préférence en plus du signal système ; `DeferredPreview` n'attache plus la vidéo en économie ; lecteur de Story sans préchargement.
- **Mobile** : S3 après le web, avec la détection réseau mobile (dépendance native à ajouter au catalogue par S1).
- **Données personnelles** : préférence exportée, effacée avec la personne.
- **Tests et cliquets** : tests de `autoplayDecision` et `preloadFor` avec la préférence.
- **Critères d'acceptation** : « Jamais » empêche toute lecture automatique ; en économie, aucun octet vidéo avant le geste « Lire » (vérifié dans l'onglet réseau).
- **Dépend de** : plan 06 (écran Paramètres).
- **Porte** : aucune.

### SD-05 — Affiche des vidéos et compression avant envoi · priorité P1 · taille M · session S1
- **Pour l'utilisateur** : une image fixe légère avant la lecture ; une vidéo trop lourde est recompressée avant l'envoi.
- **Backend** : champ facultatif `posterStorageId` dans `storedMediaValidator` (schéma, S1) ; usage de dépôt `media_poster` (images, petite borne) ; DTO `posterUrl` par la garde ; purge et effacement de l'affiche avec la vidéo ; export.
- **Web** : capture d'une image de la vidéo (canvas) au moment de l'envoi ; compression par `MediaRecorder` au-delà d'un seuil de débit, mêmes limites que la conversion (temps réel, onglet visible) ; `poster=` sur `<video>` dans `PostMedia`, `StoryViewer`, Explorer.
- **Mobile** : `guarded-media.tsx` montre l'affiche au lieu de l'icône (S3).
- **Données personnelles** : l'affiche suit le cycle de vie du média.
- **Tests et cliquets** : cliquets `fresh-upload`, `file-delivery-gate` ; test d'effacement de l'affiche.
- **Critères d'acceptation** : la grille d'Explorer ne télécharge plus de métadonnées vidéo quand une affiche existe ; affiche retenue par l'antivirus = aucune image.
- **Dépend de** : SD-03.
- **Porte** : aucune.

### SD-06 — Répondre et réagir à une Story · priorité P1 · taille M · session S1
- **Pour l'utilisateur** : un champ « Répondre » et une rangée de réactions au bas d'une Story d'autrui ; la réponse arrive dans iCom avec la vignette de la Story tant qu'elle vit.
- **Backend** : message iCom portant une référence `storyId` (jamais une copie du média) ; résolution par `requireVisibleStory` à chaque lecture, vignette absente après expiration. Garde : relation acceptée (règle iCom existante) ; sinon refus indistinct (décision 4). Débit `story.reply`.
- **Web** : champ dans `StoryViewer.tsx`, pause pendant la saisie ; rendu de la référence dans la conversation.
- **Mobile** : SD-15.
- **Données personnelles** : le message suit l'export et l'effacement d'iCom ; aucun contenu dans la notification (cliquet `notification-payload-content`).
- **Tests et cliquets** : réponse refusée à une Story invisible ; vignette disparue après purge.
- **Critères d'acceptation** : la réponse apparaît dans la conversation ; après 24 h, le message reste, la vignette non.
- **Dépend de** : plan 01 (iCom).
- **Porte** : décision 4.

### SD-07 — Story texte, texte superposé et mentions · priorité P1 · taille M · session S1
- **Pour l'utilisateur** : publier « un mot » sur fond de la charte ; écrire sur une photo ; mentionner une relation.
- **Backend** : média discriminé `kind: "text"` (texte borné, fond choisi parmi des jetons nommés, jamais une couleur libre) ; champ `mentions` (personnes résolues, bornées) ; notification de mention sans contenu ; mention refusée hors relation ou en cas de blocage ; modération du texte (`moderateContentWrite`).
- **Web** : onglet « Texte » dans `StoryCreateSheet.tsx` ; texte superposé positionné (coordonnées relatives) ; rendu dans `StoryViewer.tsx`. Corriger la phrase de Créer (« Une image ou un mot ») tant que le texte n'existe pas.
- **Mobile** : SD-15.
- **Données personnelles** : mentions dans l'export de l'auteur ; effacement d'une personne mentionnée = mention anonymisée.
- **Tests et cliquets** : `no-hardcoded-colors` (fonds par jetons), `i18n-locales`.
- **Critères d'acceptation** : Story texte lisible dans les sept thèmes, clair et sombre ; la personne mentionnée reçoit une notification sans le texte.
- **Dépend de** : aucun.
- **Porte** : aucune.

### SD-08 — Sourdine des Stories et anneau sur le profil · priorité P1 · taille S · session S1
- **Pour l'utilisateur** : « Ne plus voir ses Stories » sans rompre la relation ; l'avatar d'un profil porte l'anneau quand une Story est visible.
- **Backend** : table `storyMutes` (`networkId`, personne, auteur) ou nouvelle sorte de sourdine ; `tray` l'applique ; requête légère `hasLiveStory(handle, now)`.
- **Web** : action dans le lecteur ; `StoryRing` sur l'en-tête du profil (plan 05) ouvrant `/actus`.
- **Mobile** : SD-15.
- **Données personnelles** : export et effacement des sourdines.
- **Tests et cliquets** : `network-scoped-functions`, `rate-limited-writes`.
- **Critères d'acceptation** : un auteur en sourdine disparaît du plateau et réapparaît après retrait de la sourdine.
- **Dépend de** : plan 05 (en-tête du profil).
- **Porte** : aucune.

### SD-09 — Lecture des Clips : vitesse, boucle, reprise · priorité P1 · taille S · session S1
- **Pour l'utilisateur** : vitesse 0,5× à 2× dans Clips ; boucle selon la décision 1 ; retour au même Clip et à la même seconde.
- **Backend** : aucun.
- **Web** : commande de vitesse dans le lecteur de Clips (`ImmersiveFeedReader` en mode `clips`) ; boucle seulement en immersion Clips si décidée ; position mémorisée dans la mémoire de retour existante.
- **Mobile** : S3 (`expo-video` : `playbackRate`, `loop`).
- **Données personnelles** : aucune.
- **Tests et cliquets** : tests du coordinateur (la boucle ne relance pas une vidéo suspendue par un appel).
- **Critères d'acceptation** : la règle « une seule vidéo » tient avec la boucle ; la vitesse est remise à 1× à la sortie.
- **Dépend de** : décision 1.
- **Porte** : décision du propriétaire.

### SD-10 — Source des Clips indexée · priorité P1 · taille M · session S1
- **Pour l'utilisateur** : Clips ne montre plus de fenêtres vides.
- **Backend** : champ dénormalisé `hasVideo` sur `posts` (écrit par `postWrite`, retiré avec le média), index `by_root_hasVideo_status_publishedAt` et `by_network_hasVideo_status_publishedAt` ; migration par lots (skill `convex-migration-helper`) ; `mediaFeed.paginate` lit l'index pour `kind: "video"`.
- **Web** : retirer l'état « fenêtre vide » des Clips.
- **Mobile** : aucun changement d'écran.
- **Données personnelles** : aucune.
- **Tests et cliquets** : test de migration ; `no-unbounded-collect`.
- **Critères d'acceptation** : une page de Clips rend des vidéos tant qu'il en existe ; garde de délivrance toujours appliquée.
- **Dépend de** : plan 02 (écriture des publications).
- **Porte** : aucune.

### SD-11 — Recherche unifiée et recherches récentes · priorité P1 · taille L · session S1
- **Pour l'utilisateur** : une page `/recherche` avec onglets Tout · Personnes · Pages · Publications · Boutiques · Mots-dièse · Groupes ; recherches récentes effaçables.
- **Backend** : aucun nouvel index au départ ; chaque onglet appelle la requête existante (`people.directory.searchPeople`, `pages.pages.paginateDiscover`, `posts.posts.search`, `shops` marketplace, `thematicGroups`). Ajouter la pagination à `posts.search`. « Tout » rend trois résultats par type, sans score mêlé.
- **Web** : route dans `routes.ts` ; entrée par l'icône de recherche de l'en-tête et le champ en tête de Découvrir (aucune sixième destination) ; recherches récentes en stockage local par personne et réseau, purgées à la sortie (`signOutEverywhere`) ; états vide, chargement, erreur, hors ligne.
- **Mobile** : SD-15.
- **Données personnelles** : rien côté serveur (décision 7).
- **Tests et cliquets** : `no-hardcoded-urls`, `sign-out-everywhere` ; test de non-fuite d'une personne non listée.
- **Critères d'acceptation** : chaque onglet respecte le blocage et l'annuaire opt-in ; « Tout » ne promet pas l'exhaustivité (phrase de périmètre).
- **Dépend de** : SD-12 pour l'onglet Mots-dièse.
- **Porte** : aucune.

### SD-12 — Mots-dièse indexés et suggestions · priorité P1 · taille M · session S1
- **Pour l'utilisateur** : la page d'un mot-dièse se remplit vraiment ; la saisie propose des mots existants.
- **Backend** : table `postTags` (`networkId`, `onRoot`, `tag`, `publishedAt`, `postId`, statut) écrite et retirée avec la publication ; index par mot et date ; `rootFeed`, `listRootPosts` et une requête membre lisent l'index ; suggestions par préfixe sur un index du mot ; migration par lots.
- **Web** : page membre d'un mot-dièse (nombre de publications réel affiché seulement s'il est compté) ; suggestions dans le champ de `discover-screen.tsx` et dans SD-11.
- **Mobile** : `onSearchTag` lit la même source.
- **Données personnelles** : lignes effacées avec la publication (inventaire d'effacement à étendre, `erasure.test.ts`).
- **Tests et cliquets** : test de parité entre `tags` de la publication et `postTags` ; projection publique inchangée dans sa forme.
- **Critères d'acceptation** : un mot rare publié il y a six jours apparaît en tête de sa page.
- **Dépend de** : plan 02 (saisie des mots-dièse).
- **Porte** : aucune.

### SD-13 — Découvrir complété par piliers · priorité P1 · taille S · session S1
- **Pour l'utilisateur** : Vie publique : pages Officielles, Presse ; Divertissement : Clips, Directs, Groupes, Évènements — chaque tuile seulement si elle a des données.
- **Backend** : aucun ; lectures existantes (directs en cours, groupes, évènements, pages Officielles) pour décider de l'affichage.
- **Web** : `DiscoverPillars` dans `discover-screen.tsx` ; champ de recherche en tête (vers SD-11) ; retrait de la tuile Rencontres selon la décision 2.
- **Mobile** : écran Découvrir natif aligné (S3).
- **Données personnelles** : aucune.
- **Tests et cliquets** : `navigation-coverage.test.ts` ; test « aucune tuile vide ».
- **Critères d'acceptation** : sans direct en cours, pas de tuile Directs.
- **Dépend de** : plans 04 et 07.
- **Porte** : décision 2.

### SD-14 — Créer un Clip · priorité P1 · taille M · session S1
- **Pour l'utilisateur** : « Clip » dans Créer : choisir une vidéo verticale, rogner début et fin, légende, mots-dièse.
- **Backend** : aucun (une publication vidéo) ; la borne de durée de SD-03 s'applique.
- **Web** : entrée `clip` dans `creationController` ; préréglage du composeur ; rognage par conversion locale (même moteur que SD-03) ; brouillon dans le magasin de brouillons du composeur (plan 02).
- **Mobile** : après SD-15.
- **Données personnelles** : aucune nouvelle.
- **Tests et cliquets** : `i18n-locales`.
- **Critères d'acceptation** : un Clip créé apparaît dans `/clips` et dans le fil.
- **Dépend de** : SD-03, plan 02.
- **Porte** : aucune.

### SD-15 — Mobile : Stories complètes et recherche · priorité P1 · taille L · session S3
- **Pour l'utilisateur** : sur l'application, lecteur plein écran avec barre et minuterie, Vu par, retrait, signaler, répondre, créer une Story photo ; recherche à onglets.
- **Backend** : aucun.
- **Web** : aucun.
- **Mobile** : `stories-section.tsx` refait en lecteur plein écran ; création par sélecteur de photo natif (dépendance à ajouter au catalogue par S1) avec réencodage ; `search-screen.tsx` à onglets.
- **Données personnelles** : comme le web.
- **Tests et cliquets** : tests des écrans natifs ; recette simulateur et téléphone physique.
- **Critères d'acceptation** : parité constatée écran par écran (tableau identique, écart, absent).
- **Dépend de** : SD-01, SD-06, SD-07, SD-11 ; plan 14.
- **Porte** : publication TestFlight (propriétaire).

### SD-16 — Tendances par période et par province, recherche par lieu · priorité P2 · taille M · session S1
- **Pour l'utilisateur** : tendances « 24 h » et « 7 jours », nationales ou par province, dans Découvrir et `/decouvrir` ; filtre Province dans la recherche de publications.
- **Backend** : étendre `public/aggregate.ts` par période et province ; corriger le biais actuel (seuls les 50 premiers mots rencontrés, du plus récent au plus ancien, sont comptés) par un compte borné sur la table `postTags` de SD-12 ; seuils 5/5 conservés ; **nouvelle projection publique à part** (les DTO publics sont lus en schéma strict).
- **Web** : sélecteur de période et province.
- **Mobile** : entrée publique, plus tard.
- **Données personnelles** : aucune identité dans les jobs (règle PA8 existante).
- **Tests et cliquets** : `public-communication`, `crons-contract`.
- **Critères d'acceptation** : aucune tendance sous 5 publications et 5 auteurs ; les anciens fronts restent valides.
- **Dépend de** : SD-12.
- **Porte** : aucune.

### SD-17 — Sous-titres fournis par l'auteur · priorité P2 · taille M · session S1
- **Pour l'utilisateur** : joindre un fichier de sous-titres (WebVTT) à une vidéo ; activer les sous-titres au lecteur.
- **Backend** : usage de dépôt `media_caption` (texte, petite borne) ; référence sur le média ; garde ; purge et effacement.
- **Web** : `<track>` dans les lecteurs ; bouton CC.
- **Mobile** : `expo-video` après le web.
- **Données personnelles** : cycle de vie du média.
- **Tests et cliquets** : `upload-policy`, `file-delivery-gate`.
- **Critères d'acceptation** : sous-titres lisibles au lecteur d'écran ; fichier retenu par l'antivirus = aucun sous-titre.
- **Dépend de** : SD-05.
- **Porte** : aucune.

### SD-18 — Amis proches · priorité P2 · taille M · session S1
- **Pour l'utilisateur** : une liste privée ; une Story « Amis proches ».
- **Backend** : audience `close_friends` ajoutée à l'audience des Stories seulement ; table `closeFriends` bornée ; `isStoryVisibleTo` étendue ; la liste n'est jamais révélée aux autres.
- **Web** : réglage de la liste ; choix d'audience dans `StoryCreateSheet.tsx`.
- **Mobile** : après le web.
- **Données personnelles** : export et effacement.
- **Tests et cliquets** : tests de visibilité ; blocage prime.
- **Critères d'acceptation** : une personne retirée de la liste ne voit plus la Story à la lecture suivante.
- **Dépend de** : aucun.
- **Porte** : aucune.

### SD-19 — Story interactive : sondage, question, lien interne · priorité P2 · taille M · session S1
- **Pour l'utilisateur** : un sondage à deux choix, une question ouverte, un lien vers une offre, une page ou une publication d'ANTSIA.
- **Backend** : réponses dans une table bornée, purgées avec la Story ; résultats visibles de l'auteur ; liens internes résolus et regardés à chaque lecture (aucune adresse externe).
- **Web** : autocollants dans la création et le lecteur.
- **Mobile** : après le web.
- **Données personnelles** : réponses effacées à la purge ; export de l'auteur.
- **Tests et cliquets** : `rate-limited-writes`, `notification-payload-content`.
- **Critères d'acceptation** : aucun résultat chiffré inventé ; lien mort retiré à la lecture.
- **Dépend de** : SD-07 ; plan 08 (offres).
- **Porte** : aucune.

### SD-20 — Stories des pages · priorité P2 · taille M · session S1
- **Pour l'utilisateur** : une page (boutique, média, institution) publie une Story au nom de la page.
- **Backend** : `pageId` facultatif sur `stories`, droit de gérance relu, plateau des pages suivies.
- **Web** : choix « au nom de ma page ».
- **Mobile** : après le web.
- **Données personnelles** : comme les Stories.
- **Tests et cliquets** : tests de gérance (le plat du jour sert de modèle).
- **Critères d'acceptation** : un ancien gérant ne peut plus publier ni retirer.
- **Dépend de** : plan 07.
- **Porte** : aucune.

### DG-018 — Chaîne des médias côté serveur · priorité P3 · taille L · session S1
- **Pour l'utilisateur** : la vidéo s'adapte au débit (plusieurs qualités) ; affiches et sous-titres produits par le serveur.
- **Backend** : états distincts dépôt → contrôle → variantes → affiche → publication (DIASPORALE `docs/14`, G6 point 4) ; adresses de lecture protégées et révocables ; dérivés purgés avec la source.
- **Web** : lecteur HLS (bibliothèque à choisir, version exacte).
- **Mobile** : `expo-video` lit HLS.
- **Données personnelles** : dérivés dans l'export et l'effacement ; localisation de l'hébergement.
- **Tests et cliquets** : accès refusé à un dérivé retiré (critère DG-018) ; garde fail-closed.
- **Critères d'acceptation** : lecture en qualité basse sous débit faible, sans coupure.
- **Dépend de** : SD-05 ; plan 13 (exploitation).
- **Porte** : choix du fournisseur ou de l'infrastructure, clés, hébergement (propriétaire).

### SD-21 — Stories à la une et archive privée · priorité P3 · taille M · session S1
- **Pour l'utilisateur** : garder des Stories sur son profil ; retrouver ses anciennes Stories.
- **Backend** : rompt le contrat « un seul chemin de purge » : archive privée opt-in, à la une = copie de la référence au média avec son propre cycle de vie.
- **Web** : profil (plan 05).
- **Mobile** : après le web.
- **Données personnelles** : nouvelle conservation, durée à fixer, export et effacement.
- **Tests et cliquets** : effacement effectif des blobs archivés.
- **Critères d'acceptation** : désactiver l'archive purge tout sous 24 h.
- **Dépend de** : décision 3.
- **Porte** : décision du propriétaire.

## 6. Ordre recommandé et dépendances

| Vague | Lots | Pourquoi dans cet ordre |
|---|---|---|
| 1 | SD-01, SD-02, SD-03 | Bloquants : signalement, vie privée, lisibilité |
| 2 | SD-04, SD-05, SD-10, SD-13, SD-08 | Coût des données, Clips fiables, Découvrir conforme à l'étude |
| 3 | SD-12, SD-11, SD-09, SD-07, SD-06 | Recherche (index des mots-dièse d'abord), puis Stories plus riches |
| 4 | SD-14, SD-15 | Création de Clips ; mobile une fois le web stable |
| 5 | SD-16, SD-17, SD-18, SD-19, SD-20 | Différenciants |
| 6 | DG-018, SD-21 | Sous porte |

Dépendances vers d'autres plans : plan 01 (SD-06), plan 02 (SD-02, SD-03, SD-10, SD-12, SD-14), plan 04 (SD-13), plan 05 (SD-08, SD-21), plan 06 (SD-04), plan 07 (SD-13, SD-20), plan 08 (SD-19), plan 12 (SD-01), plan 13 (DG-018), plan 14 (SD-15), plan 16 (sous-titres automatiques, recherche en langage courant).

## 7. Décisions à prendre par le propriétaire

1. **Boucle des Clips.** La règle 6 de `04` § 3 interdit toute relance à la fin d'une vidéo. Recommandation : boucle dans l'immersion Clips seulement, jamais dans le fil, jamais de passage automatique au suivant. Raison : c'est l'attente de tout utilisateur de TikTok ; le fil garde la règle.
2. **Tuile « Rencontres · accès fermé »** dans le pilier Divertissement. Recommandation : la retirer jusqu'à l'ouverture. Raison : ADR-0035 D04, « une route ou une tuile n'existe qu'à l'ouverture effective ». **Décidé par le propriétaire le 9/11/2026 :** la retirer jusqu'à l'ouverture.
3. **Stories à la une et archive.** Recommandation : reporter. Raison : contredit le contrat d'éphémérité et ajoute une conservation à justifier.
4. **Répondre à une Story d'une personne non reliée.** Recommandation : réponse réservée aux relations ; sinon proposer « Se connecter ». Raison : règle iCom existante (relation acceptée).
5. **Chaîne serveur (DG-018).** Recommandation : d'abord la voie navigateur (SD-03, SD-05), puis mesurer le coût réel avant de choisir un fournisseur. Raison : le transcodage serveur engage un contrat et l'hébergement des données.
6. **Bornes chiffrées** : grand côté des photos, durée maximale d'une vidéo de publication et d'un Clip, seuil de recompression. Recommandation : partir des bornes des Stories (5 min, 50 Mio) pour les Clips. Raison : une seule règle, déjà testée. **Décidé par le propriétaire le 9/11/2026 :** plus grand côté des photos à 2 048 px ; vidéo de publication à 60 Mio au plus (décision sur l'antivirus, plan 13). Restent à fixer : la durée maximale d'une vidéo et les bornes des Clips.
7. **Recherches récentes.** Recommandation : stockage local seulement. Raison : aucune donnée personnelle de plus côté serveur.
8. **Liens dans les Stories.** Recommandation : liens internes seulement. Raison : hameçonnage, et ordonnance 0011 sur la responsabilité de la plateforme.

## 8. Risques et points d'attention

- **Conversion en temps réel** : `MediaRecorder` joue la vidéo pour la convertir ; onglet masqué = image figée. Le dire à l'écran (déjà fait pour les Stories).
- **Projections publiques strictes** : ajouter un champ aux tendances casse les fronts en ligne ; publier une projection à part (piège consigné au `CLAUDE.md`, SU01d).
- **Migrations** (SD-10, SD-12) : par lots, sans lecture non bornée ; double écriture avant bascule.
- **Purge et modération** : une Story signalée ne doit pas disparaître avant décision (SD-01).
- **Notifications** : jamais de texte de Story ni de réponse dans une notification.
- **Mineurs** : toute recommandation ou tendance doit rester compatible avec SU01c (art. 22) ; ne rien personnaliser.
- **Coût** : la grille d'Explorer charge aujourd'hui les métadonnées vidéo à l'approche ; mesurer sur 3G avant et après SD-05.
- **Nom** : les textes de base disent « Actus » (`packages/social-features/src/i18n/locales/fr/stories.json`) ; ANTSIA les surcharge en « Stories » (`apps/antsia_ga/src/i18n/overrides/fr.json`). Toute nouvelle clé doit recevoir sa surcharge, sinon « Actu » reparaît.
- **Fichiers partagés** : `convex/schema.ts` (SD-05, SD-07, SD-08, SD-10, SD-12, SD-18, SD-19, SD-20), catalogue `package.json` et `bun.lock` (dépendances natives SD-04, SD-15 ; lecteur HLS DG-018) : S1 seule.

## 9. Prompts d'implémentation

**Prompt SD-01.** Lis `CLAUDE.md`, `convex/modules/moderation/{cases,targets,tables}.ts`, `convex/modules/stories/stories.ts`, `packages/social-features/src/features/stories/StoryViewer.tsx` et le dialogue de signalement des publications. Périmètre : ces fichiers, leurs tests, locales `reseau.fil.json` et `stories.json` fr et en, surcharge ANTSIA. Livre : commande « Signaler » sur la Story d'autrui, dialogue existant, purge différée d'une Story sous signalement ouvert si `targets.ts` ne la garde pas lisible. Vérifie : `bun run codegen`, tests ciblés (`bunx vitest run --config convex/vitest.config.ts modules/stories modules/moderation`), `bun run verify`, recette 390/834/1440 clair et sombre. Arrête-toi avant toute publication.

**Prompt SD-02.** Lis `packages/social-features/src/features/reseau-albums/AlbumComposer.tsx` et `album-model.ts`, `StoryCreateSheet.tsx`, le composeur de publication (`useMediaDraft`). Périmètre : nouveau module partagé de réencodage et ses tests ; branchement dans la création de Story et de publication (coordonne avec le plan 02). Livre : aucune photo envoyée avec EXIF ; grand côté borné selon la décision 6 ; GIF intact. Vérifie avec un JPEG portant un bloc GPS : le fichier stocké n'en a plus. `bun run verify`, recette. Arrête-toi si la borne n'est pas décidée.

**Prompt SD-03.** Lis `packages/social-domain/src/{content,stories,uploadPolicy}.ts`, `features/stories/story-video-policy.ts` et `story-video-probe.ts`, le composeur de publication. Périmètre : domaine, politique vidéo généralisée, composeur, tests. Livre : MP4/WebM seuls pour les nouvelles publications, conversion du .mov quand possible, refus guidé sinon, borne de durée (décision 6). Vérifie : tests purs, test serveur du refus de `video/quicktime`, recette Safari puis Chrome Android. `bun run verify`. Arrête-toi avant publication.

**Prompt SD-11.** Lis `apps/antsia_ga/src/lib/routes.ts`, `convex/modules/{people/directory,pages/pages,posts/posts,thematicGroups/thematicGroups,shops/marketplaceRead}.ts`, `shell/ReseauAgentPage.tsx`, `components/discovery/discover-screen.tsx`. Périmètre : route `/recherche`, écran à onglets, pagination de `posts.search`, entrée d'en-tête et de Découvrir, recherches récentes locales purgées à la sortie. Livre : chaque onglet sur la requête existante, blocage et annuaire opt-in respectés, phrase de périmètre. Vérifie : cliquets `no-hardcoded-urls`, `sign-out-everywhere`, `member-screens-full-width` ; `bun run verify` ; recette 390/834/1440. Arrête-toi avant publication.

**Prompt SD-04.** Lis `features/media-playback/*`, `components/discovery/media-discovery-screen.tsx`, l'écran Paramètres et l'ADR-0010. Périmètre : préférences de présentation (schéma par S1), environnement de lecture, Explorer, lecteur de Story, locales. Livre : « Lecture automatique » et « Économiser les données » effectifs. Vérifie dans l'onglet réseau : aucun octet vidéo avant « Lire » en économie. `bun run verify`, recette. Arrête-toi avant publication.

## 10. Sources lues

- Brief commun ; `REPRISE_ANTSIA_2026-11-09.md` (§ 2, 9, 10, 11) ; `CLAUDE.md` d'ANTSIA.
- `docs/00_CAHIER_DES_CHARGES_ANTSIA.md` (EXF-AN-13, 21, 35, 46, 47 ; table des routes).
- ADR-0017, 0033, 0035.
- `docs/etudes/2026-10-21-sept-univers-et-vie-publique/ETUDE_SEPT_UNIVERS_ANTSIA.md` (§ 4, § 12), `EXECUTION.md` (SU02, SU06), `SU01_CONFORMITE_ORDONNANCE_0011.md` (art. 22).
- `docs/etudes/2026-10-18-social-commerce/01_BENCHMARK_SOURCES.md`, `04_PARCOURS_FIL_ET_PUBLICATIONS.md`.
- `docs/etudes/2026-10-20-experience-sociale-responsive/01`, `02`, `04`, `rapports/U08_RECETTE_EN_LIGNE_2026-10-21.md`.
- DIASPORALE `docs/14_PLAN_GLOBAL_IMPLEMENTATION_DIASPORALE.md` (G6, DG-017 à DG-019).
- Vault : `stories-pause-et-brouillon-2026-10-21.md`, `su06-stories-navigation-mobile-2026-10-24.md`, `decisions/2026-10-24-stories-plat-reference-et-dock-mobile.md`, `decisions/2026-10-23-univers-et-ma-boutique.md`, `chartes-images-2026-10-24.md`, `avancement.md`.
- Mémoire : `colonne-unique-au-bureau`, `maquettes-fideles-au-code`, `etude-sept-univers-antsia`.
- Code : `convex/modules/{stories,discovery,public,media,files,suggestions,marks,moderation,posts,people,pages,thematicGroups,shops,professionals,graph}`, `convex/crons.ts`, `convex/lib/rateLimit.ts` ; `packages/social-domain/src/{stories,content,uploadPolicy,searchText,provinces,moderationPolicy}.ts` ; `packages/social-features/src/features/{stories,media-playback,feed-immersion,messagerie/IcomActusPanel.tsx,reseau-albums,reseau-personnel}` et locales ; `apps/antsia_ga/src/{components/discovery,components/public,components/stories,app/(membre)/{clips,explorer,actus},app/(public)/{decouvrir,tags,provinces},lib/routes.ts,i18n}` ; `apps/antsia_mobile/src/{app.tsx,screens/{explore-screen,search-screen,media-feed-screen,stories-section,feed-screen,compose-screen}.tsx,components/guarded-media.tsx}`, `apps/antsia_mobile/package.json`.
