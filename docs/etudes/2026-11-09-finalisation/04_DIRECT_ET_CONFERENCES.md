# Plan 04 — Directs et conférences

> Constaté par lecture du code d'`origin/main` (ANTSIA `26741caa`, DIASPORALE `bead76d`), le 9 novembre 2026. Rien n'a été exécuté.
> Applications de référence : TikTok Live, Instagram Live, YouTube Live, Facebook Live, Twitch, les Espaces de X ; pour les conférences : Zoom, Google Meet, appels de groupe de WhatsApp. Comparaison faite de mémoire (état des produits à la mi-2026), non revérifiée en ligne.

Lexique utilisé dans ce plan :
- **Direct** : diffusion en temps réel d'une personne ou d'une page vers des spectateurs. Dans le code, l'objet s'appelle `liveSessions` ; les écrans du paquet disent encore « conférence », l'application web les renomme « direct » par surcharge (`apps/antsia_ga/src/i18n/overrides/fr.json`).
- **Antenne** : les personnes qui parlent à l'écran (8 au plus, hôte compris). **Spectateur** : celui qui regarde.
- **LiveKit** : le serveur vidéo temps réel (SFU, « relais » qui redistribue les flux). **Egress** : le service LiveKit qui enregistre la salle en fichier.
- **Rediffusion (replay)** : le fichier enregistré, relu après la fin.
- **Conférence** : dans ANTSIA, c'est le même objet que le direct, avec l'audience « Invités seulement ». Les appels de groupe (11 personnes, `convex/modules/calls/groupCalls.ts`) relèvent du plan 01. Le module `personalMeetings` n'a rien à voir : ce sont les rencontres, fermées.

## 1. L'intention du propriétaire

- Le direct fait partie du pilier **divertissement**, « faire revenir chaque jour » (étude sept univers § 4 ; ADR-0035). La vente en direct y est notée comme ajout de la **vague 5**, derrière le contrat de paiement (§ 4, § 15 « V5 »).
- Exigence du cahier **EXF-AN-24** : directs d'une page ou d'un membre habilité, antenne de 8, spectateurs 200 (plafond 1 000), discussion, rediffusion 90 jours, **consentement à l'enregistrement**, modération d'antenne.
- ADR-0005 : le studio réutilise une seule salle persistante, les droits viennent du serveur, aucune caméra ne s'ouvre sans geste.
- ADR-0006 : l'hôte décide seul du sort de la copie (publier, garder, retirer) ; une annonce garde l'audience exacte du direct ; jamais d'annonce nominative.
- Notes du vault F3a, F3b, F3c (16/10) : l'enregistrement est un **choix explicite** du formulaire (décoché), la publication un second choix après la fin.
- Lexique U01 (`docs/etudes/2026-10-20-experience-sociale-responsive/02_NOMS_ET_MICROTEXTES.md`) : « Préparer un direct », « Lancer le direct », « En live », « Replays » ; direct et appel restent deux objets distincts.
- Dans les directs aussi : visibilité `network` (le direct ne sort pas de son réseau), le citoyen ne paie jamais (étude § 14), rien d'inventé (aucun compteur sans donnée).
- Refusé ou fermé : paiement en ligne (pas de prestataire), toute publication sans accord écrit, le direct dans DIASPORALE tant que le réseau ne l'active pas (`liveAvailable`).

## 2. Ce qui existe

| Capacité | État | Web | Mobile | Preuve |
|---|---|---|---|---|
| Préparer un direct (titre, audience, capacité, format, grille, annonce) | Présent | oui | non | `convex/modules/live/sessions.ts` (`create`), `packages/social-features/src/features/direct/CreateDirectDialog.tsx` |
| Audiences : réseau, relations, abonnés d'une page, invités | Présent | oui | non | `packages/social-domain/src/live/domain.ts` (`DIRECT_AUDIENCES`) |
| Direct au nom d'une page (signataire vivant) | Présent | oui | non | `sessions.ts` (`requireManagedPage`), `packages/social-features/src/features/reseau-personnel/ProfilPagePage.tsx` |
| Audience « mes abonnés » d'une personne, ou d'un groupe thématique | Absent | — | — | `followers` exige une page (`LIVE_FOLLOWERS_REQUIRES_PAGE`) ; cherché `thematicGroup`, `groupe`, `subscribers` dans `convex/modules/live` |
| Lancer depuis un fil de groupe iCom | Présent | oui | non | `packages/social-features/src/features/iappel/use-launch-conference.ts`, champ `sourceThreadId` |
| Programmer à une date et une heure, avec rappel | Absent | — | — | aucun champ de date prévue dans `convex/modules/live/tables.ts` ; `scheduled` veut dire « préparé », fermé après 24 h (`DIRECT_SCHEDULED_MAX_AGE_MS`) ; cherché `scheduledFor`, `startsAt`, `reminder`, `rappel` |
| Annonce au fil, carte « À venir / En direct » | Présent | oui | — | `sessions.ts` (`writePost`, `liveSessionId`), `convex/modules/posts/posts.ts` (`liveAnnounceValidator`) |
| Cloche au démarrage (relations, abonnés de l'hôte, cercle de la page) | Présent | oui | libellé seul | `convex/modules/notifications/fanout.ts` (`liveSessionAudiencePhases`), `apps/antsia_mobile/src/lib/native-notifications.ts` |
| Préparation du matériel, audio seul pour l'hôte | Présent | oui | non | `packages/social-features/src/features/direct/DirectPage.tsx` (préflight, `audioOnly`) |
| Contrôle de configuration média avant démarrage | Présent | oui | non | `convex/modules/live/livekitActions.ts` (`checkBroadcastConfiguration`) |
| Studio : solo, duo, grille, orateur, cinéma, épingle locale, mise en avant | Présent | oui | non | `packages/social-features/src/features/direct/DirectStudio.tsx`, `direct-scene.ts` |
| Antenne à plusieurs (8, hôte compris) | Présent | oui | non | `convex/modules/live/speakers.ts`, `DIRECT_MAX_SPEAKERS` |
| Demande de parole (main levée) | Présent | oui | non | `convex/modules/live/antenna.ts` (`raiseHand`, `respondToRequest`) |
| Inviter un spectateur à l'antenne | Présent | oui | non | `antenna.ts` (`inviteUser`, `inviteByHandle`), expiration 30 min |
| Co-animation et modérateurs délégués | Présent | oui | non | `convex/modules/live/delegations.ts`, `DirectDelegationsPanel.tsx` |
| Partage d'écran (sans le son de l'ordinateur) | Présent | oui | non | `DirectStudio.tsx` (`shareScreen`) |
| Admission des spectateurs, plafond, présence | Présent | oui | non | `convex/modules/live/access.ts`, `presence.ts` |
| Compteur de spectateurs (présents, admissions) | Présent | oui | non | `DirectPage.tsx` (clé `counters`), `liveSessionCounters` |
| Discussion en direct (500 caractères, 40 derniers) | Présent | oui | non | `convex/modules/live/comments.ts`, `DirectDiscussionPanel.tsx` |
| Réactions (quatre genres du fil) | Présent | oui | non | `convex/modules/live/reactions.ts` |
| Fermer la discussion, couper le chat d'une personne | Présent | oui | non | `sessions.ts` (`setChatMode`), `moderation.ts` (`muteChat`) |
| Exclure et réintégrer un spectateur | Présent | oui | non | `moderation.ts` (`ban`, `reinstate`) |
| Un blocage ou un départ du réseau coupe l'accès | Présent | — | — | `convex/modules/live/revocation.ts` |
| Commentaire épinglé | Absent | — | — | cherché `pinComment`, `pinnedComment`, `commentaire épinglé` |
| Mode lent de la discussion | Absent | — | — | cherché `slowMode`, `cooldown`, `mode lent` ; seul existe le débit par personne `live.comment` (`convex/lib/rateLimit.ts`) |
| Filtre de mots, contrôle automatique des commentaires | Absent | — | — | `comments.send` n'appelle pas `moderateContentWrite` (seul le titre y passe, `sessions.create`) ; cherché `wordFilter`, `bannedWords`, `mots interdits` |
| Signaler un direct depuis la salle | Partiel | non | non | la cible `live` existe (`convex/modules/moderation/targets.ts`, le retrait ferme la salle) ; aucun bouton dans `packages/social-features/src/features/direct` |
| Signaler un commentaire de direct | Absent | — | — | pas de surface `liveComment` dans `packages/social-domain/src/moderationPolicy.ts` |
| Questions et réponses | Absent | — | — | cherché `question`, `askQuestion`, `Q&A` |
| Sondage en direct | Absent | — | — | cherché `poll`, `sondage` |
| Spectateur en audio seul, économie de données | Absent | — | — | le spectateur n'a aucun réglage vidéo (`DirectStudio.tsx` : commandes réservées à `canPublish`) |
| Qualité adaptée au débit | Partiel | oui | — | `packages/social-features/src/lib/livekit/room-options.ts` (couches 180p, 360p, 720p ; `adaptiveStream`, `dynacast`) ; pas de choix manuel, rien de mesuré en 3G |
| Consentement à l'enregistrement | Partiel | oui | — | bannière `recording` (`DirectPage.tsx`) ; le texte `antenna.consent` ne parle pas de l'enregistrement ; aucun consentement stocké |
| Enregistrement (Egress) et suivi de son état | Présent (non recetté) | oui | — | `livekitActions.ts` (`startDirectEgress`), `convex/http.ts` (`/webhooks/livekit-egress`), `replay.ts` |
| Décider de la copie : publier, garder, retirer, récupérer | Présent | oui | non | `sessions.ts` (`decideReplayPublication`, `withdrawReplay`, `retryReplay`), `DirectReplay.tsx` |
| Restreindre l'audience de la rediffusion | Présent | oui | non | `sessions.ts` (`setReplayVisibility`) |
| Conservation 90 jours et purge | Présent | — | — | `packages/social-domain/src/live/domain.ts` (`DIRECT_REPLAY_RETENTION_MS`), cron `live-purge-expired-replays` (`convex/crons.ts`) |
| Sous-titres importés (WebVTT, fr ou en) | Présent | oui | non | `livekitActions.ts` (`importReplayCaptions`) |
| Sous-titres automatiques | Absent | — | — | cherché `transcri`, `autoCaption`, `speech` |
| Commentaires rejoués avec la rediffusion | Partiel | non | — | `offsetMs` stocké (`tables.ts`, `liveComments`) ; le lecteur `DirectReplay.tsx` ne les affiche pas |
| Chapitres, extraits, téléchargement par l'auteur | Absent | — | — | cherché `chapter`, `chapitre`, `clip`, `extrait`, `download`, `télécharg` (seuls hits : transfert interne Egress) |
| Rediffusion légère (basse définition, audio seul) | Absent | — | — | un seul MP4 : 1920×1080 à 4 500 kbps, 1440×1080 ou 1080×1920 à 3 500 kbps (`packages/social-domain/src/live/replayComposition.ts`) |
| « Mes directs » (état, publication, échéance) | Présent | oui | non | `sessions.ts` (`listMinePage`), `DirectsPanel.tsx` |
| Découverte : en direct, replays, rail du bureau | Présent | oui | non | `sessions.ts` (`listLive`, `listReplays`), `DirectsLiveRail.tsx` |
| Statistiques pour l'auteur | Partiel | oui | non | quatre compteurs seulement (admissions, présents, commentaires, réactions) ; ni pic, ni durée vue |
| Partager le lien d'un direct | Partiel | oui | — | partage possible de l'annonce au fil ; aucune action de partage sur la page du direct (cherché `navigator.share`, `clipboard`, `copyLink`) |
| Carte flottante, continuité entre pages | Présent | oui | non | `DirectFloatingCard.tsx`, `packages/social-features/src/shell/communication/direct-session-host.tsx` |
| Cohabitation avec un appel | Présent | oui | non | `direct-call-coexistence.ts` |
| Fin automatique (hôte absent, 4 h, jamais lancé) | Présent | — | — | `convex/modules/live/reap.ts`, cron `live-reap-stale` |
| Direct dans l'application native | Absent | — | non | `apps/antsia_mobile/src` ne contient que les libellés de cloche |
| Lecture anonyme hors réseau | Fermé | — | — | invariant : visibilité `network`, aucune projection publique (`convex/modules/public`) ; ouverture = décision du propriétaire |
| Direct dans DIASPORALE | Fermé | — | — | `liveAvailable` posé seulement par `apps/antsia_ga/src/components/network-shell.tsx` ; ouverture = plan 15 |
| Conférence : invités nommés (200, dont 7 intervenants) | Présent | oui | non | `convex/modules/live/invitees.ts`, `DirectInviteesPanel.tsx` |
| Conférence : lever la main | Présent | oui | non | même mécanique que la demande de parole |
| Conférence : lien d'invitation | Absent | — | — | cherché `inviteLink`, `joinToken`, `lien d'invitation` |
| Conférence : salle d'attente avec admission | Absent | — | — | `waiting` signifie seulement « pas commencé » (`direct.json`) ; cherché `lobby`, `waitingRoom`, `knock` |
| Conférence : flou ou image d'arrière-plan | Absent | — | — | cherché `background`, `blur`, `BackgroundBlur` |
| Vente en direct | Absent | — | — | aucun lien `shops` ↔ `liveSessions` ; porte : paiement |
| Cadeaux virtuels, monnaie de créateur | Absent | — | — | aucun motif `gift`, `cadeau`, `coins` dans `convex/modules/live` |

Décompte : **33 Présent · 6 Partiel · 20 Absent · 2 Fermé** (61 capacités).
Tests existants : 23 fichiers de tests dans `convex/modules/live`, 15 dans `packages/social-features/src/features/direct`, 3 dans `packages/social-domain/src/live`.

### Ce qui est écrit mais jamais recetté en réel

| Sujet | Source | État |
|---|---|---|
| Image, son, partage d'écran, plein écran avec un vrai serveur LiveKit | ADR-0005, ADR-0006, `docs/04_RAPPORT_PARITE_FRONT.md` (F3a à F3c) | non recetté : tests avec salle simulée seulement |
| Enregistrement Egress, webhook, rapatriement, purge à 90 jours | idem ; dossier de reprise § 10.1 (« LiveKit, Egress : non recettés ») | non recetté |
| Plusieurs appareils sur la même scène | F3b « Reste » | non recetté |
| Direct au nom d'une vraie page Officielle | F3c « Limites de preuve » | tests seulement |
| « Mes directs » en production connectée | vault `recette-production-mes-directs-2026-10-26.md` | interrompue à la connexion IDN, jamais terminée |
| Cloche `live_started` jusqu'au téléphone (push) | dossier de reprise § 3.6 | non recetté |
| Passe sombre complète et audit AA | F3a à F3c | non fait |
| Les clés LiveKit (`LIVEKIT_*`) | dossier de reprise § 4 | noms prévus ; aucune recette consignée |

Seul fait constaté en navigateur (16/10, serveur local, comptes fictifs) : création d'un direct, invités, délégations, format, brouillon conservé à 320, 375 et 1 280 px, refus traduit quand le service média manque.

## 3. Comparaison avec les applications de référence

« oui » : capacité connue de l'application. « — » : non affirmé ici (incertain ou absent).

| Capacité | TikTok | Instagram | YouTube | Facebook | Twitch | Espaces X | ANTSIA | Verdict |
|---|---|---|---|---|---|---|---|---|
| Direct programmé avec rappel | oui | oui | oui | oui | — | oui | non | **À faire** (DL-06) |
| Cloche au démarrage | oui | oui | oui | oui | oui | oui | oui | Déjà fait (push à recetter, plan 06) |
| Invités à l'antenne, demande de parole | oui | oui | — | — | — | oui | oui | Déjà fait |
| Co-animation, modérateurs | oui | — | oui | oui | oui | oui | oui | Déjà fait |
| Commentaire épinglé | oui | oui | oui | oui | oui | oui | non | **À faire** (DL-08) |
| Mode lent | — | — | oui | oui | oui | — | non | **À faire** (DL-08) |
| Filtre de mots | oui | oui | oui | — | oui | — | non | **À adapter** (DL-03, DL-08) |
| Exclure, bloquer | oui | oui | oui | oui | oui | oui | oui | Déjà fait |
| Signaler le direct et un commentaire | oui | oui | oui | oui | oui | oui | non | **À faire** (DL-03) |
| Questions et réponses | — | oui | oui | — | — | — | non | **À faire** (DL-09) |
| Sondage | — | — | oui | — | oui | — | non | À faire, P2 (DL-10) |
| Audio seul (salle parlée) | — | — | — | — | — | oui | hôte seulement | **À adapter** (DL-04) |
| Qualité choisie par le spectateur | — | — | oui | — | oui | — | non | **À faire** (DL-04) |
| Compteur de spectateurs | oui | oui | oui | oui | oui | oui | oui | Déjà fait |
| Rediffusion | oui | oui | oui | oui | oui | oui | oui (non recettée) | Déjà fait, à recetter (DL-01) |
| Chat rejoué avec la rediffusion | — | — | oui | — | oui | — | non | À faire, P2 (DL-11) |
| Chapitres, extraits | — | — | oui | — | oui | — | non | Reporté P3 (DL-17) |
| Téléchargement par l'auteur | — | oui | oui | oui | oui | — | non | À faire, P2 (DL-12) |
| Sous-titres automatiques | — | — | oui | — | — | — | non | Reporté P3 (DL-18) |
| Statistiques de l'auteur | oui | oui | oui | oui | oui | — | 4 compteurs | À faire, P2 (DL-12) |
| Direct depuis l'application | oui | oui | oui | oui | oui | oui | web mobile seulement | **À faire** (DL-15) |
| Partager le lien | oui | oui | oui | oui | oui | oui | via l'annonce | **À faire** (DL-07) |
| Cadeaux, pourboires | oui | oui | oui | oui | oui | — | non | **Écarté** : le citoyen ne paie jamais, paiement fermé |
| Vente en direct | oui | — | oui | — | — | — | non | **Reporté** (V5, porte paiement) |

| Capacité (conférences) | Zoom | Meet | Appels de groupe WhatsApp | ANTSIA | Verdict |
|---|---|---|---|---|---|
| Invitation nominative | oui | oui | oui | oui (200) | Déjà fait |
| Lien d'invitation | oui | oui | oui | non | **À adapter** (DL-13), lien réservé aux membres |
| Salle d'attente, admission | oui | oui | — | non | **À faire** (DL-13) |
| Lever la main | oui | oui | — | oui | Déjà fait |
| Partage d'écran | oui | oui | oui | oui | Déjà fait (non recetté) |
| Discussion | oui | oui | — | oui | Déjà fait |
| Avertissement d'enregistrement à tous | oui | oui | — | bannière | **À compléter** (DL-02) |
| Flou d'arrière-plan | oui | oui | oui | non | Reporté P3 (DL-19) |
| Sous-salles | oui | oui | — | non | **Écarté** : hors du besoin d'un réseau social |

## 4. Ce qui manque

### 4.1 Bloquant avant l'ouverture au public
1. **Aucune recette média réelle** : image, son, partage, enregistrement, purge. Tout dépend des clés LiveKit et Egress (DL-01).
2. **Consentement à l'enregistrement** exigé par EXF-AN-24 : seule une bannière informe ; l'intervenant ne consent pas explicitement à apparaître dans la copie (DL-02).
3. **Signalement et contrôle de la discussion** : impossible de signaler un direct ou un commentaire depuis la salle ; les commentaires échappent au contrôle de contenu. L'ordonnance exige des signalements traités en 24 h et 72 h (DL-03, plan 12).
4. **Faible débit** : un spectateur en 3G ne peut pas couper la vidéo ni choisir une qualité basse (DL-04).

### 4.2 Attendu par les utilisateurs
5. Programmer un direct à une date, avec « Me le rappeler » (DL-06).
6. Partager un direct : lien, iCom, feuille de partage du téléphone (DL-07).
7. Commentaire épinglé, mode lent, mots filtrés par l'hôte (DL-08).
8. Questions et réponses (DL-09).
9. Rediffusion lisible en 3G : profil allégé et piste audio (DL-05).
10. Regarder un direct depuis l'application iOS et Android (DL-15).

### 4.3 Différenciant pour ANTSIA
- **Direct suivable en 3G** : audio seul côté spectateur, qualité plafonnée, rediffusion légère. Les références supposent un bon débit.
- **Confiance** : badge calculé de l'hôte et de la page visibles sur la salle, consentement à l'enregistrement tracé, signalement relié aux délais de l'ordonnance.
- **Vie publique** : direct d'une page Officielle (point presse, conseil municipal) avec questions et réponses modérées et rediffusion conservée.
- **Aucune monétisation du spectateur** : pas de cadeaux, pas de classement payé ; message de confiance.

### 4.4 Écarté ou reporté, et pourquoi
| Sujet | Décision proposée | Raison |
|---|---|---|
| Cadeaux virtuels, monnaie de créateur | Écarté | Le citoyen ne paie jamais (étude § 14) ; paiement fermé ; risque de jeu d'argent et de pression sur les mineurs. À rediscuter seulement après un contrat de paiement et un avis juridique |
| Vente en direct | Reporté P3 (DL-20) | Vague 5 de l'étude ; exige paiement (MP08) et liaison PRO.GA (plan 08) |
| Sous-titres automatiques | Reporté P3 (DL-18) | Marquage de l'IA (SU01i), choix d'un service hébergé conforme à la souveraineté |
| Chapitres et extraits vers Clips | Reporté P3 (DL-17) | Dépend de la chaîne des médias (plan 03) |
| Flou d'arrière-plan | Reporté P3 (DL-19) | Coût processeur sur téléphones d'entrée de gamme ; nouvelle dépendance |
| Diffusion au-delà de 1 000 spectateurs (flux HLS) | Reporté, décision 6 | Le pilote tient dans le plafond actuel ; HLS = Egress permanent et coût |
| Sous-salles | Écarté | Hors du besoin d'un réseau social |
| Lecture anonyme hors réseau | Écarté | Invariant de visibilité `network` |

## 5. Lots d'implémentation

### DL-01 — Recette média réelle LiveKit et Egress · priorité P0 · taille M · session S1
- **Pour l'utilisateur** : un direct qui marche vraiment, son, image, partage, rediffusion.
- **Backend** : aucun changement attendu. Contrôler `requestDirectToken`, `startDirectEgress`, le webhook `/webhooks/livekit-egress`, `ingestEgressFile`, les crons `live-reap-stale`, `live-reconcile-replays`, `live-purge-expired-replays`. Corriger seulement ce que la recette révèle.
- **Web** : recette du studio à deux et trois appareils ; partage d'écran ; plein écran ; carte flottante ; coupure réseau puis reprise.
- **Mobile** : recette du web mobile (Safari iOS, Chrome Android) ; le natif est DL-15.
- **Données personnelles** : vérifier que la rediffusion entre à la garde des fichiers et que sa purge emporte vidéo et sous-titres.
- **Tests et cliquets** : consigner un rapport `docs/recette/direct-media-<date>/RAPPORT.md` ; ajouter un test pour chaque défaut corrigé.
- **Critères d'acceptation** : un direct de 10 minutes à deux intervenants est vu par un troisième appareil ; la rediffusion devient « prête » puis se lit ; un retrait supprime le fichier ; une échéance de conservation avancée sur un déploiement de recette provoque la purge ; mesure du débit réellement reçu par un spectateur avec un réseau bridé en 3G (outil du navigateur).
- **Dépend de** : clés `LIVEKIT_*` posées par le propriétaire sur un déploiement de développement.
- **Porte** : clé externe ; aucune commande vers la production sans accord écrit.

### DL-02 — Consentement explicite à l'enregistrement · priorité P0 · taille M · session S1
- **Pour l'utilisateur** : avant de prendre l'antenne d'un direct enregistré, je sais que je serai enregistré et j'accepte, ou je reste spectateur. Le point « REC » reste visible tant que la capture tourne.
- **Backend** : nouvelle table `liveRecordingConsents` (`networkId`, `sessionId`, `personId`, `acceptedAt`), index `by_session_person`. Exiger ce consentement dans `antenna.respondToInvitation` (acceptation), `antenna.respondToRequest` (au moment où la personne monte) et la promotion d'un invité intervenant (`invitees.ts`, `promoteSpeakerRow`) quand `replayRequested` est vrai ; nouvelle règle `LIVE_RECORDING_CONSENT_REQUIRED`. L'hôte consent en cochant « Enregistrer ». Mutation `antenna.acceptRecording` avec débit.
- **Web** : case explicite dans `DirectAntennaPanel.tsx` et dans l'entrée à l'antenne ; texte `antenna.consent` complété ; pastille d'enregistrement permanente pendant `replayEgressState = active`.
- **Mobile** : après le web (DL-15).
- **Données personnelles** : la ligne de consentement entre à l'export et à l'effacement (`convex/modules/people/dataPolicies.ts`, propriétaire `personId`) ; elle dure autant que la rediffusion, puis est purgée avec elle.
- **Tests et cliquets** : refus sans consentement ; consentement inutile si pas d'enregistrement ; invité intervenant non promu sans consentement ; cliquets `i18n-locales`, `rate-limited-writes`.
- **Critères d'acceptation** : impossible de parler dans un direct enregistré sans consentement horodaté ; la pastille est visible à 390, 834 et 1 440 px, clair et sombre.
- **Dépend de** : décision 4.
- **Porte** : décision du propriétaire (décision 4).

### DL-03 — Signaler et contrôler la discussion · priorité P0 · taille M · session S1
- **Pour l'utilisateur** : un bouton « Signaler » sur le direct et sur chaque commentaire ; les commentaires injurieux sont retenus comme ailleurs sur ANTSIA.
- **Backend** : faire passer `comments.send` par `moderateContentWrite` (comme le titre dans `sessions.create`) ; ajouter la surface `liveComment` (`packages/social-domain/src/moderationPolicy.ts`, `convex/modules/moderation/tables.ts`, `targets.ts`, `reviewProjection.ts`) ; le retrait par décision passe le commentaire en `removed`. Vérifier qu'une décision sur `live` retire aussi la rediffusion.
- **Web** : entrée « Signaler » dans l'en-tête de `DirectPage.tsx` et dans `DirectDiscussionPanel.tsx`, par le dialogue de signalement existant (celui de `PostCard.tsx`).
- **Mobile** : après le web.
- **Données personnelles** : aucune donnée nouvelle hors des dossiers de modération déjà couverts.
- **Tests et cliquets** : signalement indistinct pour un direct invisible ; commentaire retenu non affiché ; cliquet de signalement du plan 12 si présent.
- **Critères d'acceptation** : un signalement de commentaire arrive dans `/moderation` avec ses délais SU01d ; un commentaire retenu ne s'affiche qu'à son auteur ou disparaît selon la règle du fil.
- **Dépend de** : plan 12 (files, délais, motifs).
- **Porte** : aucune.

### DL-04 — Spectateur en 3G : audio seul et qualité basse · priorité P0 · taille M · session S1
- **Pour l'utilisateur** : « Écouter seulement » coupe la vidéo reçue ; « Qualité : automatique, économie, haute » plafonne l'image. Le choix est retenu sur l'appareil.
- **Backend** : aucun.
- **Web** : dans `DirectStudio.tsx` et la carte flottante, désabonner les pistes vidéo distantes (`setSubscribed(false)`) en mode audio, et plafonner la couche (`setVideoQuality` de livekit-client) en mode économie. Préférence locale, stockage protégé par `try/catch`. Proposer « Écouter seulement » quand la connexion signale une qualité faible.
- **Mobile** : après le web (DL-15).
- **Données personnelles** : aucune (préférence locale).
- **Tests et cliquets** : tests de surface avec salle simulée (désabonnement, retour à la vidéo) ; cliquet `no-hardcoded-strings`.
- **Critères d'acceptation** : en mode audio, aucune piste vidéo n'est abonnée (vérifié par l'état de la salle simulée puis en DL-01) ; le son continue ; retour à la vidéo sans quitter la salle.
- **Dépend de** : DL-01 pour la preuve réelle.
- **Porte** : aucune pour le code ; clé LiveKit pour la preuve.

### DL-05 — Rediffusion légère · priorité P1 · taille M · session S1
- **Pour l'utilisateur** : relire un replay en 3G sans épuiser son forfait.
- **Backend** : abaisser ou dédoubler le profil d'encodage de `replayComposition.ts` (une seule définition plus sobre, ou une seconde sortie audio) ; si deux fichiers, champ `replayAudioStorageId` sous la même garde, la même échéance et la même purge (`replay.ts`, `retention.ts`).
- **Web** : choix « Vidéo / Audio seul » dans `DirectReplay.tsx`, sans lecture automatique.
- **Mobile** : après le web.
- **Données personnelles** : le second fichier suit exactement le premier (export de l'hôte, effacement, 90 jours).
- **Tests et cliquets** : purge des deux fichiers ; cliquets `file-delivery-gate`, `storage-arg-freshness`.
- **Critères d'acceptation** : poids mesuré d'une heure de rediffusion, consigné ; lecture audio possible ; purge vérifiée.
- **Dépend de** : DL-01, décision 1.
- **Porte** : décision du propriétaire (profil, coût de stockage).

### DL-06 — Programmer un direct et me le rappeler · priorité P1 · taille M · session S1
- **Pour l'utilisateur** : l'hôte fixe une date ; l'annonce montre « Prévu le … » ; le spectateur touche « Me le rappeler » et reçoit une cloche au lancement.
- **Backend** : champ `liveSessions.plannedStartAt` (facultatif) ; la récolte des `scheduled` juge l'âge à partir de cette date au lieu de `createdAt` (`reap.ts`), avec une borne maximale de programmation ; table `liveReminders` (`networkId`, `sessionId`, `personId`, `createdAt`), index `by_session_person` et `by_session` ; mutations `reminders.set` et `reminders.clear` (adhésion, visibilité, débit) ; au `goLive`, diffusion `live_started` aux personnes rappelées (nouvelle phase de `fanout.ts`, sans doublon avec l'audience).
- **Web** : champ date et heure dans `CreateDirectDialog.tsx` (fuseau du lecteur, RHF + Zod) ; carte du fil et page d'attente avec la date ; bouton « Me le rappeler » ; un seul bouton plein.
- **Mobile** : libellé de cloche déjà présent ; écran après le web.
- **Données personnelles** : `liveReminders` à l'export et à l'effacement ; purge à la fin du direct.
- **Tests et cliquets** : rappel refusé hors audience ; un exclu n'est pas sonné ; pas de double cloche ; `crons-contract` si une cadence est ajoutée ; `notifications-writer`.
- **Critères d'acceptation** : un direct programmé à J+3 n'est pas fermé au bout de 24 h ; le rappel sonne une fois au lancement ; aucun contenu du direct dans la cloche.
- **Dépend de** : plan 06 pour le push ; plan 07 si l'on relie un évènement.
- **Porte** : aucune.

### DL-07 — Partager un direct · priorité P1 · taille S · session S1
- **Pour l'utilisateur** : « Partager » sur la page du direct : copier le lien, envoyer dans iCom, feuille de partage du téléphone.
- **Backend** : aucun ; le lien mène à `/direct/[id]`, l'accès reste jugé par l'audience.
- **Web** : action dans l'en-tête de `DirectPage.tsx` ; Web Share API avec repli « Copier » ; route par `apps/antsia_ga/src/lib/routes.ts` ; envoi iCom par la porte du plan 01.
- **Mobile** : après le web.
- **Données personnelles** : aucune.
- **Tests et cliquets** : `no-hardcoded-urls` ; un direct « Invités seulement » propose le lien mais n'ouvre rien à un non-invité (refus indistinct).
- **Critères d'acceptation** : lien copié, ouvert par un membre de l'audience ; refusé indistinctement sinon.
- **Dépend de** : plan 01 (envoi dans iCom).
- **Porte** : aucune.

### DL-08 — Discussion tenue : épingle, mode lent, mots filtrés · priorité P1 · taille M · session S1
- **Pour l'utilisateur** : l'hôte épingle un commentaire ; il règle un délai entre deux messages ; il ajoute des mots masqués.
- **Backend** : `liveSessions.pinnedCommentId` et `liveSessions.chatSlowModeMs` (écrits rarement, vus par toute la salle) ; table `liveChatTerms` (`networkId`, `sessionId`, `term`) bornée ; `comments.send` vérifie le délai par personne (dernier commentaire de l'auteur) et masque les termes ; permission `moderateChat` (hôte, délégués).
- **Web** : réglages dans `DirectDiscussionPanel.tsx` ; épingle en tête ; message clair quand le délai n'est pas écoulé.
- **Mobile** : après le web.
- **Données personnelles** : termes rattachés à la session, purgés avec elle.
- **Tests et cliquets** : délai respecté, épingle retirée si le commentaire est retiré, `no-unbounded-collect`.
- **Critères d'acceptation** : les trois réglages marchent pour l'hôte et un modérateur délégué, jamais pour un spectateur.
- **Dépend de** : DL-03.
- **Porte** : aucune.

### DL-09 — Questions et réponses · priorité P1 · taille M · session S1
- **Pour l'utilisateur** : le spectateur pose une question ; les autres la soutiennent ; l'hôte la met à l'écran puis la marque « répondue ».
- **Backend** : tables `liveQuestions` (`networkId`, `sessionId`, `authorPersonId`, `body`, `status`, `createdAt`) et `liveQuestionVotes` (une ligne par personne et question, comme `liveReactions`) ; tri par soutiens recomposé par `reap` (écrivain unique, D28) ; contrôle de contenu ; débit dédié.
- **Web** : onglet « Questions » dans les volets de `DirectManagement.tsx` ; question en avant sur la scène.
- **Mobile** : après le web.
- **Données personnelles** : questions et votes à l'export (auteur) et à l'effacement ; purge avec la session.
- **Tests et cliquets** : `network-scoped-functions`, `rate-limited-writes`, `no-unbounded-collect`.
- **Critères d'acceptation** : 50 questions soutenues par plusieurs comptes restent triées sans conflit d'écriture.
- **Dépend de** : DL-03.
- **Porte** : aucune.

### DL-10 — Sondage en direct · priorité P2 · taille M · session S1
- **Pour l'utilisateur** : l'hôte pose une question à choix ; les résultats s'affichent pour tous.
- **Backend** : `livePolls`, `livePollVotes` ; un vote par personne ; totaux par `reap`.
- **Web** : volet de l'hôte, carte de vote pour le spectateur.
- **Mobile** : après le web.
- **Données personnelles** : votes à l'effacement ; résultats agrégés seulement.
- **Tests et cliquets** : vote unique, refus hors audience.
- **Critères d'acceptation** : résultats exacts après 100 votes simulés.
- **Dépend de** : DL-09 (même patron).
- **Porte** : aucune.

### DL-11 — Commentaires rejoués avec la rediffusion · priorité P2 · taille S · session S1
- **Pour l'utilisateur** : en relisant, je vois les commentaires au moment où ils ont été écrits.
- **Backend** : requête paginée par `offsetMs` (nouvel index `by_session_offsetMs`), gardée par `directReplayAccessDecision`.
- **Web** : panneau synchronisé dans `DirectReplay.tsx`, masquable.
- **Mobile** : après le web.
- **Données personnelles** : un commentaire effacé ou retiré ne réapparaît pas.
- **Tests et cliquets** : refus quand la rediffusion est privée.
- **Critères d'acceptation** : les commentaires suivent la lecture et le déplacement dans la vidéo.
- **Dépend de** : DL-01.
- **Porte** : aucune.

### DL-12 — Statistiques et téléchargement pour l'auteur · priorité P2 · taille M · session S1
- **Pour l'utilisateur** : dans « Mes directs », pic de spectateurs, admissions, commentaires, réactions, durée ; télécharger sa propre rediffusion.
- **Backend** : `liveSessionCounters.viewerPeakCount` tenu par `reap` (valeur réellement mesurée, jamais estimée) ; URL de téléchargement par `servableUrl`, réservée à l'hôte.
- **Web** : ligne de statistiques dans `DirectsPanel.tsx` ; bouton « Télécharger » dans `DirectReplay.tsx`.
- **Mobile** : après le web.
- **Données personnelles** : la rediffusion entre à l'export de l'hôte (« Mes données »), à coordonner avec le plan 06.
- **Tests et cliquets** : téléchargement refusé à un délégué ; `file-delivery-gate`.
- **Critères d'acceptation** : chiffres identiques aux compteurs ; aucun chiffre affiché sans donnée.
- **Dépend de** : DL-01, plan 06.
- **Porte** : aucune.

### DL-13 — Conférence : lien d'invitation et salle d'attente · priorité P2 · taille M · session S1
- **Pour l'utilisateur** : l'hôte partage un lien ; un membre qui l'ouvre attend dans une salle d'attente ; l'hôte l'admet ou le refuse.
- **Backend** : champ `liveSessions.lobbyEnabled` ; table `liveLobbyRequests` (`networkId`, `sessionId`, `personId`, `status`) ; jeton spectateur refusé tant que la demande n'est pas admise (`access.authorizeToken`). Le lien n'ouvre rien à un non-membre (aucune adhésion créée d'office) ; jeton de lien révocable si décision 7 l'exige.
- **Web** : écran d'attente dans `DirectPage.tsx` ; liste d'admission dans les volets.
- **Mobile** : après le web.
- **Données personnelles** : demandes purgées à la fin ; à l'export et à l'effacement.
- **Tests et cliquets** : un exclu reste exclu ; un bloqué reste refusé indistinctement.
- **Critères d'acceptation** : sans admission, aucun jeton LiveKit n'est délivré.
- **Dépend de** : DL-07, décision 7.
- **Porte** : décision du propriétaire.

### DL-14 — Audience « mes abonnés » et audience d'un groupe · priorité P2 · taille M · session S1
- **Pour l'utilisateur** : une personne réserve son direct à ses abonnés ; un groupe thématique tient un direct pour ses membres.
- **Backend** : nouvelles valeurs d'audience dans `DIRECT_AUDIENCES` et la décision d'accès (`access.ts`) ; phases de cloche correspondantes (`fanout.ts`) ; annonce interdite pour l'audience de groupe si la publication ne sait pas la porter (même règle que « Invités seulement »).
- **Web** : options dans `CreateDirectDialog.tsx` ; entrée depuis la page du groupe.
- **Mobile** : après le web.
- **Données personnelles** : aucune donnée nouvelle.
- **Tests et cliquets** : un désabonnement ou un départ du groupe coupe la salle (`revocation.ts`).
- **Critères d'acceptation** : un non-abonné ne voit ni la carte ni la salle.
- **Dépend de** : plan 05 (abonnements), plan 07 (groupes).
- **Porte** : aucune.

### DL-15 — Regarder un direct dans l'application · priorité P1 · taille L · session S3
- **Pour l'utilisateur** : toucher une cloche ou une annonce ouvre le direct dans l'application ; écouter seulement en 3G.
- **Backend** : aucun (les fonctions existent).
- **Web** : aucun.
- **Mobile** : écran spectateur (scène, discussion, réactions, main levée), ouverture depuis la cloche `live_*` ; SDK LiveKit natif, dans la même porte que les appels natifs (`NATIVE_CALLS_ENABLED`). Le studio de l'hôte natif reste P3.
- **Données personnelles** : aucune donnée nouvelle.
- **Tests et cliquets** : tests de l'écran ; recette sur iPhone physique.
- **Critères d'acceptation** : un direct lancé du web est vu et entendu sur un iPhone et un Android physiques.
- **Dépend de** : DL-01, DL-04, plan 14.
- **Porte** : clés LiveKit ; publication TestFlight par accord écrit.

### DL-16 — Lexique « direct » partout · priorité P2 · taille S · session S1 et S3
- **Pour l'utilisateur** : le même mot partout.
- **Backend** : aucun.
- **Web** : reporter le lexique U01 dans les textes du paquet encore en « conférence » (cloches de `reseau.json`, carte flottante) sans changer les clés.
- **Mobile** : `apps/antsia_mobile/src/i18n/navigation.{fr,en}.json` (libellés `liveStarted` et suivants), par S3.
- **Données personnelles** : aucune.
- **Tests et cliquets** : `i18n-locales`.
- **Critères d'acceptation** : aucune occurrence de « conférence » visible dans ANTSIA pour un direct, hors l'audience « Invités seulement ».
- **Dépend de** : rien.
- **Porte** : aucune.

### DL-17 — Chapitres et extraits vers Clips · priorité P3 · taille L · session S1
- **Pour l'utilisateur** : l'hôte découpe un moment et le publie en Clip.
- **Backend** : chapitres saisis par l'hôte ; extrait produit par la chaîne des médias.
- **Web, Mobile** : après le plan 03.
- **Données personnelles** : l'extrait devient une publication de l'hôte.
- **Tests et cliquets** : à définir avec le plan 03.
- **Critères d'acceptation** : à définir.
- **Dépend de** : plan 03.
- **Porte** : aucune.

### DL-18 — Sous-titres automatiques · priorité P3 · taille L · session S1
- **Pour l'utilisateur** : sous-titres générés, relus par l'hôte avant publication.
- **Backend** : production d'une piste WebVTT qui entre par `attachCaptions` ; marquage « généré par IA ».
- **Web, Mobile** : affichage existant.
- **Données personnelles** : traitement de la voix : à déclarer (APDPVP).
- **Tests et cliquets** : marquage visible.
- **Critères d'acceptation** : la piste n'est publiée qu'après validation de l'hôte.
- **Dépend de** : SU01i (plan 12), plan 16, décision 8.
- **Porte** : avis juridique, choix du service.

### DL-19 — Flou d'arrière-plan · priorité P3 · taille M · session S1
- **Pour l'utilisateur** : flouter sa pièce avant de parler.
- **Backend** : aucun.
- **Web** : processeur de piste LiveKit dans le préflight et le studio.
- **Mobile** : après le web.
- **Données personnelles** : traitement local seulement.
- **Tests et cliquets** : dépendance déclarée au catalogue (`"catalog:"`).
- **Critères d'acceptation** : mesure du coût processeur sur un téléphone d'entrée de gamme.
- **Dépend de** : DL-01.
- **Porte** : ajout d'une dépendance (`package.json`, S1).

### DL-20 — Vente en direct · priorité P3 · taille L · session S1
- **Pour l'utilisateur** : un vendeur montre ses produits en direct, avec la fiche de l'offre à l'écran.
- **Backend** : lien d'une session vers des offres reflétées de PRO.GA ; commande par le parcours existant.
- **Web, Mobile** : à concevoir avec le plan 08.
- **Données personnelles** : celles du commerce.
- **Tests et cliquets** : aucun encaissement tant que le paiement est fermé.
- **Critères d'acceptation** : à fixer avec le plan 08.
- **Dépend de** : MP08, plan 08, SU14.
- **Porte** : contrat de paiement, décision du propriétaire.

## 6. Ordre recommandé et dépendances

| Vague | Lots | Pourquoi dans cet ordre |
|---|---|---|
| 1 | DL-02, DL-03, DL-04, DL-07, DL-16 | Code seul, sans clé ; lève les manques bloquants de conformité et de débit |
| 2 | DL-01 | Dès que le propriétaire pose les clés LiveKit ; prouve les vagues 1 et le socle existant |
| 3 | DL-06, DL-08, DL-09, DL-05 | Attendus des utilisateurs ; DL-05 après mesure réelle en DL-01 |
| 4 | DL-15 | Après DL-01 et DL-04 ; porte des appels natifs (plan 14) |
| 5 | DL-10, DL-11, DL-12, DL-13, DL-14 | Confort et différenciation |
| 6 | DL-17 à DL-20 | Sous conditions externes |

Dépendances vers les autres plans :
- **Plan 01** : envoi d'un lien de direct dans iCom (DL-07) ; frontière direct / appel de groupe.
- **Plan 03** : extraits vers Clips (DL-17).
- **Plan 05** : abonnements d'une personne (DL-14).
- **Plan 06** : push de `live_started` et des rappels ; export de la rediffusion dans « Mes données » (DL-06, DL-12).
- **Plan 07** : audience de groupe, lien éventuel entre évènement et direct (DL-06, DL-14).
- **Plan 08** : vente en direct (DL-20).
- **Plan 12** : surface `liveComment`, délais de traitement, âge minimum, marquage de l'IA (DL-03, DL-18).
- **Plan 13** : supervision des directs dans la console, charge, coûts de stockage des rediffusions.
- **Plan 14** : SDK LiveKit natif (DL-15).
- **Plan 15** : activer `liveAvailable` dans DIASPORALE.
- **Plan 16** : sous-titres par iAsted (DL-18).

## 7. Décisions à prendre par le propriétaire

1. **Profil des rediffusions.** Aujourd'hui un MP4 jusqu'à 1920×1080 à 4 500 kbps. Recommandation : un profil plus sobre et une piste audio, après mesure en DL-01. Raison : 3G, coût des données, stockage.
2. **Cadeaux virtuels et monnaie de créateur.** Recommandation : non. Raison : le citoyen ne paie jamais, le paiement est fermé, risque de pression financière sur un public jeune.
3. **Vente en direct.** Recommandation : la garder en vague 5, après le contrat de paiement. Raison : étude sept univers § 15.
4. **Consentement à l'enregistrement.** Recommandation : consentement explicite et horodaté de chaque intervenant (DL-02). Raison : EXF-AN-24, droit à l'image. **Décidé par le propriétaire le 9/11/2026 :** accord explicite et horodaté de chaque intervenant avant tout enregistrement.
5. **Enregistrement par défaut.** Le formulaire le décoche, le serveur le coche par défaut (`replay ?? true`). Recommandation : garder le formulaire décoché et aligner le serveur sur `false`. Raison : un seul défaut, celui qui protège. **Décidé par le propriétaire le 9/11/2026 :** enregistrement décoché par défaut, serveur aligné sur `false`.
6. **Audience au-delà de 1 000 spectateurs.** Recommandation : garder le plafond pour le pilote ; étudier un flux HLS seulement sur besoin constaté. Raison : coût et complexité.
7. **Lien d'invitation.** Recommandation : réservé aux membres du réseau, révocable, salle d'attente activable. Raison : aucun profil créé d'office, refus indistinct.
8. **Sous-titres automatiques.** Recommandation : après SU01i, avec un service hébergé conforme. Raison : marquage de l'IA, données vocales.
9. **Durées.** Confirmer 4 h au plus par direct et 90 jours de conservation. Raison : coût Egress et stockage.

## 8. Risques et points d'attention

- **Tout le média dépend de clés absentes.** Rien de ce qui touche à l'image, au son, au partage ou à l'enregistrement n'est prouvé en réel.
- **Poids des rediffusions** : au profil actuel, une heure en 1080p à 4 500 kbps fait environ 2 Go ; l'analyse antivirus ne couvre que jusqu'à 60 Mo (inscription au-delà, `docs/03`, lot 16).
- **Plafond de 1 000 spectateurs** en WebRTC : au-delà, refus d'admission. À expliquer à l'écran.
- **Conflits d'écriture** : toute nouvelle donnée vue par la salle doit suivre D28 (compteurs écrits par `reap` seul), sinon chaque geste réveille tous les spectateurs.
- **Récolte par tranches de cinq sessions** (`reap.ts`) : ne pas alourdir une session au point de dépasser la limite de lecture d'une mutation.
- **Navigateur masqué** : le studio mesure par `ResizeObserver`, arrêté quand le volet est masqué ; utiliser le banc décrit dans la mémoire `banc-mesure-navigateur-masque`.
- **Backend local** : les actions `"use node"` du direct refusent Node 25 ; passer par `scripts/convex-dev.mjs`.
- **Âge** : tout direct public expose des mineurs potentiels (16 ans minimum). Les règles propres aux mineurs relèvent de SU01c (plan 12), bloqué par l'avis du juriste.
- **Mots** : le paquet dit « conférence », l'application « direct ». Un texte nouveau doit suivre le lexique U01.

## 9. Prompts d'implémentation

### Prompt DL-02 — Consentement à l'enregistrement
```text
Tu travailles dans ANTSIA (session S1), branche claude/dl-02-consentement-enregistrement depuis origin/main.
Lis : CLAUDE.md, docs/adr/0005 et 0006, convex/modules/live/{antenna,speakers,invitees,sessions,tables}.ts,
packages/social-features/src/features/direct/{DirectAntennaPanel,DirectPage}.tsx, convex/modules/people/dataPolicies.ts,
et le plan PLANS_FINALISATION_2026-11-09/04_DIRECT_ET_CONFERENCES.md (§ 5 DL-02).
But : aucune personne ne monte à l'antenne d'un direct enregistré sans consentement horodaté.
Livre : table liveRecordingConsents (convex/schema.ts par liveTables), mutation acceptRecording (adhésion, visibilité,
débit, droit), règle LIVE_RECORDING_CONSENT_REQUIRED exigée à l'acceptation d'une invitation, d'une main levée et à la
promotion d'un invité intervenant quand replayRequested ; case de consentement et pastille d'enregistrement permanente
(i18n fr et en, mêmes clés) ; classement dans dataPolicies ; tests convex et de surface.
Vérifie : bun run verify vert ; recette au navigateur à 390, 834, 1440 px, clair et sombre, avec le service média absent.
Arrête-toi et demande avant : toute publication, tout changement du défaut serveur de replay (décision 5).
```

### Prompt DL-03 — Signaler et contrôler la discussion
```text
Session S1, branche claude/dl-03-signalement-direct depuis origin/main.
Lis : convex/modules/live/comments.ts, convex/modules/moderation/{policy,tables,targets,reviewProjection}.ts,
packages/social-domain/src/moderationPolicy.ts, packages/social-features/src/features/reseau-personnel/PostCard.tsx
(dialogue de signalement), DirectPage.tsx et DirectDiscussionPanel.tsx ; le plan 12 s'il existe.
But : signaler un direct et un commentaire depuis la salle ; contrôler chaque commentaire comme un commentaire du fil.
Livre : comments.send passe par moderateContentWrite ; surface liveComment ajoutée partout où les surfaces sont
énumérées ; décision de retrait qui passe le commentaire en removed ; vérifier qu'un retrait du direct retire aussi
sa rediffusion ; boutons « Signaler » par le dialogue existant ; tests (refus indistinct, commentaire retenu).
Vérifie : bun run verify vert, cliquets compris ; recette au navigateur aux trois largeurs, clair et sombre.
Arrête-toi et demande si une décision de modération du plan 12 contredit ce périmètre.
```

### Prompt DL-04 — Spectateur en 3G
```text
Session S1, branche claude/dl-04-direct-faible-debit depuis origin/main.
Lis : packages/social-features/src/lib/livekit/room-options.ts, components/direct/DirectRoomMount.tsx,
features/direct/{DirectStudio,DirectFloatingCard,DirectPage}.tsx, stores/direct-session-store.ts, et la mémoire
banc-mesure-navigateur-masque.
But : un spectateur peut écouter seulement (aucune piste vidéo abonnée) ou plafonner la qualité.
Livre : préférence locale (try/catch) « Automatique / Économie / Écouter seulement » ; désabonnement des pistes vidéo
distantes et plafond de couche ; suggestion quand la qualité de connexion est faible ; i18n fr et en ; tests avec salle
simulée (désabonnement, retour à la vidéo sans quitter la salle). Aucune nouvelle connexion ni nouveau rendu audio.
Vérifie : bun run verify vert ; banc du studio ; recette aux trois largeurs.
Ne prétends aucune preuve réelle : elle viendra du lot DL-01.
```

### Prompt DL-06 — Programmer et rappeler
```text
Session S1, branche claude/dl-06-direct-programme depuis origin/main.
Lis : convex/modules/live/{sessions,reap,tables}.ts, packages/social-domain/src/live/domain.ts,
convex/modules/notifications/fanout.ts, CreateDirectDialog.tsx, convex/modules/posts/posts.ts (carte live).
But : un direct prévu à une date, avec « Me le rappeler » et une cloche au lancement.
Livre : liveSessions.plannedStartAt ; récolte des scheduled jugée sur cette date, avec borne maximale ; table
liveReminders et mutations set/clear (adhésion, visibilité, débit) ; phase de diffusion des rappels sans doublon ;
champ date et heure (fuseau du lecteur, RHF + Zod) ; date sur la carte du fil et la page d'attente ; export et
effacement ; tests (pas de fermeture à 24 h, pas de double cloche, exclu non sonné).
Vérifie : bun run verify vert, cliquets crons-contract et notifications-writer ; recette aux trois largeurs.
Arrête-toi avant d'ajouter un nouveau genre de notification si le plan 06 en gère la liste.
```

### Prompt DL-01 — Recette média réelle
```text
Session S1. Prérequis : le propriétaire a posé les clés LIVEKIT_* sur un déploiement de DÉVELOPPEMENT. Sinon, arrête-toi
et liste les clés manquantes sans rien coder.
Lis : docs/04_RAPPORT_PARITE_FRONT.md (F3a à F3c), docs/adr/0005 et 0006, convex/modules/live/{livekitActions,
egressActions,replay,reap,retention}.ts, convex/http.ts (webhook), convex/crons.ts.
But : prouver en réel le direct à plusieurs, le partage d'écran, l'enregistrement, la rediffusion et la purge.
Fais : un direct de 10 minutes à deux intervenants vu par un troisième appareil ; partage d'écran ; coupure réseau ;
rediffusion prête puis lue ; retrait ; purge sur échéance avancée en recette ; débit reçu en 3G simulée.
Livre : docs/recette/direct-media-<date>/RAPPORT.md (ce qui a été vu, daté), un test par défaut corrigé, verify vert.
Interdit : toute commande vers la production, toute clé écrite dans le dépôt.
```

## 10. Sources lues

- Brief commun et dossier de reprise (`REPRISE_ANTSIA_2026-11-09.md`, § 2, § 3.6, § 4, § 7, § 9, § 10, § 11).
- `docs/00_CAHIER_DES_CHARGES_ANTSIA.md` (EXF-AN-24, § 10), `docs/01_PLAN_IMPLEMENTATION_PROMPTS_ANTSIA.md` (PA3, PA6, PA8).
- `docs/03_RAPPORT_PARITE_BACKEND.md` (lot 16), `docs/04_RAPPORT_PARITE_FRONT.md` (F3a, F3b, F3c, PA6).
- `docs/adr/0005`, `0006`, `0035` ; `docs/22_THEMES_ET_OPTIONS_ANTSIA.md`.
- Études : sept univers (§ 4, § 5.7, § 14, § 15) et `SU01_CONFORMITE_ORDONNANCE_0011.md` ; social et commerce (`01`, `02`) ; responsive (`01`, `02`, `03`, `04`, prompt U01).
- Plan du programme `RESEAUX_SOCIAUX/00_…` et annexe A.
- Vault : `decisions/2026-10-16-conferences-personnelles-f3a.md`, `…-studio-antenne-f3b.md`, `…-creation-rediffusion-f3c.md`, `recette-production-mes-directs-2026-10-26.md`, `avancement.md`.
- Mémoire : `banc-mesure-navigateur-masque.md`.
- Code : `convex/modules/live` (25 fichiers), `convex/modules/calls/groupCalls.ts`, `convex/modules/personalMeetings`, `convex/modules/moderation/targets.ts`, `convex/modules/notifications/fanout.ts`, `convex/modules/people/dataPolicies.ts`, `convex/http.ts`, `convex/crons.ts`, `convex/lib/rateLimit.ts`, `packages/social-domain/src/live`, `packages/social-features/src/{features/direct,components/direct,lib/livekit,shell}`, `packages/social-features/src/i18n/locales/fr/direct.json`, `apps/antsia_ga/src/{app/(membre)/direct,app/(membre)/conference,components/direct,lib/routes.ts,i18n/overrides}`, `apps/antsia_mobile/src`.
