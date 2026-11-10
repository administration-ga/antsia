# P17a — Client natif ANTSIA : briques Expo, contrats et limites Web

> Historique documentaire. Les reprises source [P17b](P17B_REPRISE_2026-10-20.md) et
> [P17c du 20 octobre](P17C_REPRISE_2026-10-20.md) ajoutent le client et la chaîne d’appel native ;
> aucune preuve de compilation ou d'appareil n'est acquise. M5 est précisé ci-dessous.
> Les états « non lancé » ci-dessous décrivent l'audit des 18–19 octobre.

> Suite du 20/10 : [P17d](P17D_REPRISE_2026-10-20.md) prépare la recette sans la jouer.
> La ligne historique Android « plein écran » de §5.3 ne change pas la capacité P17c
> `fullScreen:false` ; aucune réception verrouillée ou physique n’est acquise.

18–19 octobre 2026 (la session a franchi minuit, heure de Paris). Lot **P17a seulement**, première
tranche du [prompt P17](../prompts/P17_MOBILE_NATIF.md). **P17b, P17c et P17d ne sont pas lancées.**
Références : [02 §5](../02_AUDIT_ANTSIA.md), [04](../04_PARCOURS_FIL_ET_PUBLICATIONS.md),
[05](../05_MESSAGES_ET_APPELS.md), [09](../09_FEUILLE_DE_ROUTE.md),
[10](../10_RECETTE_MESURES_ET_RISQUES.md), [11](../11_METHODE_ET_SOURCES_COMPLEMENTAIRES.md),
rapports [P04](P04_SCROLL.md) et [P05](P05_ICOM.md), [journal d'exécution](../EXECUTION.md).

**Verdict : audit documentaire ; aucun code, build, simulateur ni appareil.** La promesse native
d'ANTSIA (appel reçu écran verrouillé, application fermée, arrière-plan, parité téléphone) **reste
fermée** tant que P17b, P17c et P17d ne sont pas prouvées sur des appareils physiques identifiés.

Décision du propriétaire (18/10/2026) : « Continuer sans vérifier ». Aucune commande de
vérification, de build ou d'installation n'a été lancée : ni codegen, test, typage, lint, build,
serveur, simulateur, Expo, Xcode, Android, ni installation. Seules des lectures ont eu lieu :
fichiers, `ls`/`find`/`grep`, `git log`/`git diff`/`git ls-tree` en lecture, documentation
officielle en ligne (§8.2). **Seul ce fichier est écrit** : aucun autre fichier, aucun `.env*`,
aucune écriture git, aucun sous-agent, aucun navigateur. Aucun secret ni aucune configuration
(identifiants Apple/Expo/Firebase, noms de déploiements, liens de distribution) n'est recopié.

Base observée : ANTSIA, branche `codex/pa4-identite-session`, HEAD `9eaff40` (18/10/2026 13:06) ;
arbre partagé de 238 fichiers modifiés et 323 non suivis appartenant à d'autres sessions, préservés.

## 1. L'essentiel

1. **Aucun client natif ANTSIA.** `apps/` ne contient que `antsia_ga` et `admin_antsia_ga`. Le
   cahier prévoit l'application mobile ANTSIA « après DIASPORALE mobile, même socle Expo »
   (EXF-AN-53, `docs/00_CAHIER_DES_CHARGES_ANTSIA.md:462` ; EXT-AN-06 `:606`) ; or
   `../DIASPORALE/apps/diasporale_mobile` (lot D3) n'existe pas.
2. **Sept briques Expo/React Native** dans l'espace de travail, six dans le programme. La plus
   complète pour les appels est GABON_DIPLOMATIE `apps/citizen-mobile` (ADR-0002 de ce dépôt) ;
   la plus documentée en preuves est hors programme (setrag `packages/iappel-mobile`). **Aucune
   ne prouve** un appel reçu écran verrouillé ou application fermée sur appareil physique, et
   aucune ne se branche telle quelle sur le moteur ANTSIA.
3. **Gouvernance.** L'ADR-0004 d'ANTSIA n'autorise que le socle `origin/main` comme source de
   duplication ; le socle n'a **aucun client natif sur `origin/main`** (l'app `espace_ios` vit sur
   une branche). Toute reprise de code natif depuis gabon-diplomatie ou setrag exige une décision
   du propriétaire : source autorisée, commit de provenance, droits de reprise (aucune licence
   déclarée dans ces dépôts ; ANTSIA est AGPL-3.0-or-later).
4. **Bibliothèques.** Notifee, base Android des apps GABON_DIPLOMATIE, est **archivée depuis le
   07/04/2026** ; `react-native-voip-push-notification` n'a plus publié depuis le 30/04/2025 ;
   Expo SDK 58 est sorti le 15/10/2026 (RN 0.88, `SceneDelegate` généré) alors que toutes les
   briques du programme sont en SDK 55 ou 57.
5. **Contrats réutilisables** : `@antsia/social-contracts`, `@antsia/social-domain`,
   `@antsia/api/engine` et la logique pure P04/P05. **À adapter** : client Better Auth,
   porte de sortie, environnement de lecture, magasin d'appel, jetons de charte, toute l'UI
   `social-features` (DOM).
6. **Douze contrats manquants** (§3.5), dont l'application native dans le registre, le jeton
   VoIP, le transport VoIP et FCM « data », l'ouverture ciblée qui rend l'appel, la fin de
   sonnerie poussée, la reprise après arrêt du processus, les appareils multiples et le schéma
   natif dans les origines de confiance (`parseOriginList` n'admet que http/https).
7. **Écart moteur confirmé et précisé** : APNs `alert` pour les appels, FCM avec bloc
   `notification`, Expo sans type VoIP, push d'appel soumis au budget hebdomadaire social
   (35 par défaut), expiration 45 s, aucune annulation poussée.
8. **Prérequis du propriétaire** : comptes Apple/Google/Firebase, capacités et clés, variables
   Convex, appareils physiques — **aucun téléphone Android physique n'est attesté** dans l'espace
   de travail — et place disque (8,2 Gio libres le 19/10).

## 2. Briques Expo / React Native de l'espace de travail

Méthode : recherche des `package.json` déclarant `expo`, `react-native`, Capacitor ; des
`app.json`, `app.config.*`, `eas.json`, `metro.config.*`, projets Xcode/Gradle ; des termes
CallKit, PushKit, ConnectionService, intention plein écran ; hors `node_modules`, worktrees,
copies de publication et archives. Aucun projet `ios/` ou `android/` n'est versionné : toutes les
briques régénèrent le natif par `expo prebuild`. Les chiffres de tests et de recette sont **lus,
jamais rejoués**.

### 2.1 Synthèse

| # | Brique | Provenance | Expo / RN / React | Apport | Preuves lues | Verdict |
|---|---|---|---|---|---|---|
| B1 | `ECOSYSTEMES/GABON_DIPLOMATIE/apps/citizen-mobile` | dépôt `gabon-diplomatie` ; `origin/main` `1abb2f23` (18/10) ; fichiers d'appel identiques à `origin/main` ; pile posée les 10–11/07, dernier changement de `callkeep.ts` `9cf1f92b` (13/08) | ~57.0.4 / 0.86.3 / 19.2.3 | chaîne iOS PushKit → CallKit (rapport côté JS), Android FCM « data » → Notifee plein écran + service au premier plan, LiveKit RN, pont CallKit → session, jetons natifs par appareil, ADR-0002 (dix pièges) | 9 cas sur les sélecteurs d'appel ; aucun test des couches natives ; observations sur iPhone réel, application ouverte (commits du 11/07) ; case « TestFlight validé sur iPhone physique, notamment notifications et appels » non cochée (`APP_STORE_SUBMISSION_KIT.md:226`) | **Adapter (connaissance)** ; écarter la couche Notifee, le rapport CallKit côté JS et le couplage backend |
| B2 | `GABON_DIPLOMATIE/apps/agent-mobile` | même dépôt ; `docs/NATIVE_SETUP.md` | ~57.0.17 / 0.86.3 / 19.2.3 | portage de B1 ; greffon de cycle de scène iOS (`43170755`, 30/08) ; leçon du sujet APNs par bundle | revue du 16/09 : aucun appel lancé, pas de validation iOS ni de téléphone physique ; build Android « Pixel 7, API 36 » sans préciser émulateur ou appareil | **Écarter** (doublon de B1) ; retenir les leçons |
| B3 | `GABON_DIPLOMATIE/packages/{mobile-ui,mobile-ui-v2,mobile-updates}` | même dépôt ; derniers changements 05/09 et 29/09 | pairs RN ≥ 0.76 ; `expo-updates` ~57 | design systems de l'administration ; fournisseur EAS Update | 0 test UI ; 2 fichiers de test pour `mobile-updates` | **Écarter** (autre charte, règle 7) ; OTA à reconsidérer en P17d |
| B4 | `setrag/packages/iappel-mobile` (+ `packages/mobile-ui/src/iappel`, coques Admin et Cheminot) — **hors programme** | `okatech-org/setrag` ; `origin/main` `b8278a97` (17/10) ; paquet introduit par #166 `d2d839de` et #167 `bd3a80e7` (15/10) ; copie locale non suivie sur une autre branche | 57 / pair 0.86 / ≥ 19.2 ; LiveKit RN 3.0.0, webrtc 144.2.0, `expo-callkit-telecom` épinglé sur une archive GitHub | moteur d'appel natif indépendant de la WebView : rapport PushKit avant JS (module tiers), Core-Telecom, capacité d'appareil liée à la session, trousseau `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`, déduplication des événements système, file d'événements terminaux | tests du contrat, de la session, des médias, du moteur (SDK simulés) et de deux patchs natifs ; builds iPhone (signature Development) et APK ; **recette native audio/vidéo ouverte**, sonnerie verrouillé/app fermée non validée, aucun Android physique (`docs/preuves/iappel-mobile-2026-10-14/livraison.md`) | **Adapter (motifs)** après décision ; écarter le pont WebView et les backends écrits en dur (`src/contrat.ts`) |
| B5 | `SERVICES_TRANSVERSES/badge.administration.ga` | `administration-ga/badge.administration.ga` ; `main` `b36fb8b` (22/09) | ~57.0.24 / 0.86.3 / 19.2.3 ; Better Auth 1.6.19, `@better-auth/expo` 1.6.9, `@convex-dev/better-auth` ^0.12.5, Convex ^1.46 | pile d'authentification la plus proche d'ANTSIA : `expoClient` + SecureStore en natif, `crossDomainClient` sur le Web, IDN par `genericOAuth`, contrat Convex par `makeFunctionReference` | 4 fichiers de test (protocole, liens, enrôlement, QR) ; **jamais construite en natif** (README : Xcode, simulateur, compte EAS absents au 21/09 ; greffon serveur `expo()` à faire) | **Adapter (motif d'authentification)** ; trousseau `WHEN_UNLOCKED_THIS_DEVICE_ONLY` inadapté au réveil d'appel |
| B6 | `SERVICES_TRANSVERSES/identite.ga/apps/mobile` | `administration-ga/identite.ga` ; `main` `0e5414c` (08/08) ; app modifiée le 01/08 | ~55 / 0.83.6 / 19.2.0 | IDN, passkeys, Better Auth Expo | aucun test | **Écarter** |
| B7 | `ADMINISTRATION_GA_ESPACE_IOS_20261008/plateforme/espace/espace_ios` | `administration.ga`, branche `feat/espace-ios` `0d234973` (08/10), **absente d'`origin/main`** (`25398f565`, 15/10) | ~57.0.27 / 0.86.3 / 19.2.3 | coque WebView ; ADR-0219 du socle : app hors des espaces de travail bun, `bun.lock` propre | contrôles déclarés, envoi TestFlight documenté | **Écarter le code** ; retenir l'option d'architecture (décision D1) |

### 2.2 Détail des briques déterminantes

**B1 — GABON_DIPLOMATIE citoyen.** Entrée `index.js` qui enregistre les gestionnaires natifs
avant le montage React : `livekit-setup` (`registerGlobals({ autoConfigureAudioSession: false })`),
`incoming-call-android` (FCM « data » haute priorité → notification Notifee catégorie appel,
plein écran, boucle de sonnerie, actions Répondre/Refuser ; service au premier plan
microphone + appel), `callkeep` (PushKit → `displayIncomingCall`, dédoublonnage par
`meetingId`, annulation orpheline rapportée puis terminée, rejeu `didLoadWithEvents`).
`call-bridge.ts` (49 lignes) met une réponse en file tant que React n'est pas prêt.
Configuration : modes d'arrière-plan `voip`, `audio`, `remote-notification` ; permissions
Android larges (dont `CALL_PHONE`, `READ_PHONE_STATE`, `READ_PHONE_NUMBERS`,
`SYSTEM_ALERT_WINDOW`), à ne pas reprendre sans justification une à une. Points
incompatibles : charge push portant le nom de l'appelant, `meetingId` et `roomName` ; couplage à
`api.modules.messaging.meetings.*` et `core.pushSubscriptions` ; Better Auth 1.5.6 avec bearer
extrait du cookie ; libellés français écrits en dur. Le greffon VoIP a été écrit pour
l'`AppDelegate` du SDK 54 et demande une validation au premier `prebuild` SDK 57. L'ADR-0002
reconnaît lui-même que le rapport CallKit côté JS est une fragilité résiduelle, application tuée.
Les dix pièges P1–P10 sont la meilleure liste de contrôle disponible pour P17c (simulateur sans
sonnerie entrante, moteur audio, double sonnerie après décrochage, annulation orpheline,
présentation modale iOS, type de service Android 14, sujet APNs par bundle, clés « Topic
Specific » non extensibles, file d'appels).

**B4 — setrag.** Le moteur est piloté par une page Web (pont `postMessage`, trois backends
écrits en dur dans `src/contrat.ts`), ce qui contredit le client natif visé et le cliquet
`no-hardcoded-urls`. Ses motifs sont en revanche ceux dont P17c a besoin : rapport PushKit avant
le chargement de JavaScript, identité d'installation et secret liés à une session révocable,
trousseau lisible après le premier déverrouillage, neutralisation immédiate à la déconnexion,
déduplication des événements rejoués, lecture serveur pour clore une salle. Son README dit
lui-même que la file d'événements du SDK est en mémoire et peut perdre un refus si le processus
s'arrête, et qu'il ne prouve pas la réception sur application fermée.

**B5 — iBadge.** Unique brique avec `@convex-dev/better-auth` 0.12.5 (même version qu'ANTSIA)
et un client double `expoClient` natif / `crossDomainClient` Web, plus un contrat Convex par
`makeFunctionReference` sans dépendance au dépôt serveur. Motif utile pour P17b ; aucune
expérience d'appel ni de build natif.

### 2.3 Bibliothèques tierces (état relevé le 19/10/2026)

| Bibliothèque | Utilisée par | État | Conséquence |
|---|---|---|---|
| `@notifee/react-native` 9.1.8 | B1, B2 | dépôt archivé le 07/04/2026, déclaré non maintenu ; le README oriente vers `expo-notifications` | écarter |
| `react-native-voip-push-notification` 3.3.3 | B1, B2 | dernière version du 30/04/2025 ; le README demande de rapporter à CallKit avant `completion()` | éviter pour la chaîne critique |
| `@livekit/react-native-callkeep` 4.3.16 | B1, B2 | version du 29/04/2026, paquet modifié le 25/09/2026 | candidat |
| `react-native-callkeep` (amont) | — | versions 4.4.0 à 4.6.1 publiées les 17–18/10/2026 ; 315 tickets ouverts ; mode auto-géré Android ≥ 8 ; pas de CallKit sur simulateur | trop récent sans essai |
| `expo-callkit-telecom` | B4 (archive GitHub) | npm 0.5.0 du 09/09/2026, MIT, projet communautaire ; rapporte l'appel PushKit nativement avant JS ; Core-Telecom Android ; iOS ≥ 16, Android SDK ≥ 26. Relevé setrag du 15/10 : 0.5.0 correspond à Expo 55/RN 0.83, la branche principale déclare Expo 57/RN 0.86.3 | candidat P17c, essai obligatoire |
| `@livekit/react-native` | B1 (2.11), B4 (3.0.0) | dernière version npm 3.1.0, qui exige `@livekit/react-native-webrtc` ^150.1.0 ; incompatible avec Expo Go, build de développement requis | retenir (SDK officiel) ; aligner webrtc |
| Expo SDK | B1–B7 (55 ou 57) | SDK 57 publié le 30/06/2026 (RN 0.86 ; `expo@57.0.17` → RN 0.86.3 le 27/08) ; SDK 58 publié le 15/10/2026 (RN 0.88, `SceneDelegate` généré : le SDK iOS 27 impose le cycle de vie UIScene) | décision D2 |

### 2.4 Compatibilité avec le moteur ANTSIA

| Exigence | État ANTSIA | Briques | Écart natif |
|---|---|---|---|
| Convex | 1.45.0 (catalogue) | 1.40 (B1, B2), 1.42.3 (B4), ^1.46 (B5), ^1.38 (B6) | aligner sur le catalogue |
| Better Auth | 1.6.25 + `@convex-dev/better-auth` 0.12.5 ; greffons `convex` (JWT de 30 min portant `sessionId`), `crossDomain`, `oneTimeToken`, `bearer`, IDN, codes e-mail/SMS (`convex/betterAuth/auth.ts:209-288`) | B1 en 1.5.6 ; B5 en 1.6.19 + `expoClient` | greffon serveur `expo()` absent ; `@better-auth/expo` hors catalogue ; `parseOriginList` n'admet que http/https (`convex/betterAuth/settings.ts:7-15`) ; le crochet d'origine rejette toute origine non listée (`auth.ts:101-106`) |
| Session vivante | la garde relit la session désignée par `sessionId` (ADR-0008) ; session de 7 jours rafraîchie chaque jour (`auth.ts:213-218`) ; abonnement push lié à une session non expirée (`notifications/sessionBinding.ts:5-13`) | B1 purge locale ; B4 capacités liées à la session | lecture de session hors premier plan, constat de révocation, appels désactivés sur l'appareil |
| Déconnexion globale | porte unique `packages/api/src/sign-out-everywhere.ts` ; cliquet limité aux consommateurs Web (`tests/ratchets/sign-out-everywhere.test.ts:15-20`) | purges locales propres à chaque app | adaptateur natif (M9) |
| Garde des fichiers | URL par `servableUrl`, retenue `withheld` ; dépôt sous garde + `assertFreshUpload` | B2 : `File` + `expo/fetch` (`fetch(uri).blob()` échouait sur Android) | rendu des retenues ; `media_social` et avatar n'admettent ni HEIC ni HEIF (`packages/social-domain/src/content.ts:85-92`), la story pas le MOV (`stories.ts:56`) |
| i18n | FR/EN, mêmes clés, cliquet `i18n-locales` | B1/B2 : canaux, CallKit, notifications en français écrit en dur | toutes les phrases natives par i18n |
| Réseau | `networkId` consommé par chaque fonction (`convex/lib/functions.ts:61-88`) | sans objet | `NetworkProvider` réutilisable (§3.1) |
| Charge push neutre | référence, compte, langue (`notificationDelivery.ts:38-62`) ; cliquet `notification-payload-content` | B1 : nom de l'appelant, `meetingId`, `roomName` | affichage système neutre, relecture autorisée ensuite |

### 2.5 Les dix règles de duplication appliquées au natif

| Règle | Conséquence pour P17 |
|---|---|
| 1. Copier d'abord | aucune source native sur `origin/main` du socle : copier depuis B1 ou B4 suppose une source autorisée (D3) ; sinon, écrire depuis les exemples officiels |
| 2. Provenance | en-tête `Dupliqué de <chemin> @ <commit>` : `gabon-diplomatie@1abb2f23`, `setrag@bd3a80e7` le cas échéant |
| 3. Périmètre fermé | imports, authentification du moteur, `networkId`, i18n, jetons, gardes ; la charge push neutre n'est pas négociable |
| 4. Aucun import inter-produit | cliquet `no-cross-product-imports` : aucune dépendance au code ou au backend de gabon-diplomatie/setrag |
| 5. Les tests voyagent | B1 n'a aucun test natif à porter : ils sont à écrire ; B4 en a |
| 6. Fusion sans écrasement | sans objet (aucune base native ANTSIA) |
| 7. Jetons sans fork | couleur littérale seulement sous `packages/ui/src/{styles,themes}` (`tests/ratchets/no-hardcoded-colors.test.ts:7`) : jetons natifs générés depuis la charte |
| 8. Tranches verticales | appareil et VoIP dans `convex/modules/notifications/`, appel dans `convex/modules/calls/`, surface native dans un paquet natif |
| 9. Gardes testées | adhésion → éligibilité → débit → droit, inchangés pour chaque geste natif |
| 10. Parité prouvée | matrice P17d par OS, version et appareil |

## 3. Contrats

### 3.1 Réutilisables tels quels (à confirmer par Metro en P17b)

| Élément | Chemin | Raison |
|---|---|---|
| Contrats d'appel | `packages/social-contracts/src/{calls,callGroup,groupCapacity}.ts` | constantes et décisions pures : sonnerie 120 s, composition 30 s, plafond de 11, états de groupe |
| Messages, médias, pièces | `packages/social-contracts/src/{messaging,media,attachments,messageReactions,counterpart,errors,brand}.ts` | 4 000 caractères, 15 min d'édition, 5 pièces × 25 Mio, vocal 5 min, `PostMediaDto` avec `withheld` ; aucune dépendance DOM relevée |
| Domaine pur | `packages/social-domain/src/*` (dont `notificationDelivery`, `uploadPolicy`, `content`, `callJournal`, `consent`, `feedScale`) | aucun accès DOM, Next ou serveur relevé |
| Références du moteur | `@antsia/api/engine` | point d'entrée sanctionné vers le `_generated` du moteur seul |
| Hooks Convex/TanStack | `packages/api/src/hooks.ts` | `convex/react` et TanStack ; `"use client"` inerte hors Next |
| Réseau courant | `packages/api/src/network.tsx` | migration de stockage sous `try/catch` (`:192-206`), routes injectées |
| Lecture P04 | `features/media-playback/{media-playback-policy,media-playback-coordinator}.ts` | décisions pures et coordinateur sans React ; cible structurelle `PlaybackTarget` |
| Fil P04 | `features/feed-immersion/{feed-mode,feed-return-memory,immersive-reader-model}.ts`, `shell/mobile/gestures/swipe.ts` | mode, mémoire de retour bornée, modèle du lecteur |
| iCom P05 | `features/messagerie/{messagerie-send-intent,icom-views,messagerie-list-state,groupe-liste}.ts`, `features/iappel/call-phase.ts`, `features/notifications/notification-targets.ts` | intentions idempotentes, vues, phases d'appel, cibles sans adresse écrite |
| React seul | `features/messagerie/messagerie-outbox.ts`, `features/iappel/call-establishment.ts` | `useSyncExternalStore`, utilisable en RN |

Les chemins de `features/` sont relatifs à `packages/social-features/src/`. Leur import natif passe
aujourd'hui par `@antsia/social-features/*`, paquet dont les dépendances visent le DOM (pair
`react-dom`, radix, motion). **Recommandation P17b** : sortir cette logique pure vers un paquet
sans DOM, comme l'ADR-0004 l'a fait pour `@antsia/social-contracts`.

### 3.2 Réutilisables avec un adaptateur natif

| Élément | Dépendance Web | Adaptateur |
|---|---|---|
| `packages/api/src/auth-client.ts:13-18` | `window.location.origin`, `crossDomainClient` | `expoClient` + SecureStore + `convexClient` ; `expoClient` et `crossDomainClient` ne cohabitent pas dans une même instance [S18] |
| `stable-convex-better-auth-provider.tsx:51-55` | jeton à usage unique lu dans l'adresse | lien profond équivalent, ou pas de transfert |
| `cross-domain-session-bootstrap.ts` | `localStorage` | sans objet en natif |
| `sign-out-everywhere.ts:23,49,105` | `Storage` synchrone, navigation complète, verrou `Symbol.for` | purge SecureStore asynchrone, désinscription de l'appareil, fin d'appel, réinitialisation Convex/TanStack et pile de navigation (M9) |
| `routing/adapters/next.tsx`, `next-provider.tsx` | Next | table `apps/<app>/src/lib/routes.ts` (cliquet `no-hardcoded-urls`, `:7`) + adaptateur expo-router |
| `media-playback/media-playback-environment.ts` | `visibilitychange`, `navigator.connection` | état de l'application, état du réseau, économie de données |
| `feed-immersion/layout-measure.ts` | mesures DOM | mesures RN |
| `stores/call-store.ts:322-339` | `localStorage` (sortie audio) | stockage natif |
| `packages/ui/src/styles/charte.css`, `themes/antsia.css` | CSS | module TS généré sous `packages/ui/src/themes/` |
| `packages/social-features/**/*.tsx`, `@antsia/ui` | DOM, CSS, radix, motion | écrans natifs à écrire ; seule la logique est partagée |
| Hôte et salles d'appel (`features/iappel/*`, hôte global) | `livekit-client` Web | `@livekit/react-native` avec `registerGlobals({ autoConfigureAudioSession: false })` |
| Dépôt de médias | `fetch` navigateur | `File`/`expo/fetch` ; HEIC → JPEG pour `media_social`, avatar et story ; MOV hors story |

### 3.3 À exclure du client natif

`convex/**` (sauf les références via `@antsia/api/engine`), dont les modules `"use node"`
(`notifications/transports.ts`, `calls/livekitActions.ts`) ; modules serveur Next
(`apps/antsia_ga/src/lib/{server-session,session-bridge-server}.ts`, routes `app/**/route.ts`) ;
`@antsia/api/next-config` et `csp` ; tout `_generated` étranger ; tout code des backends
gabon-diplomatie ou setrag ; tout accès au backend Convex de PRO.GA.

### 3.4 Contrats serveur déjà disponibles

- `notifications.pushSubscriptions.{subscribe,unsubscribe,listMine,configuration}` : appareil
  (`deviceId` de 8 à 128 caractères), application du registre, identifiant `web|expo|fcm|apns`,
  lien à `sessionId`, 16 appareils actifs au plus, empreinte non réattribuable
  (`pushSubscriptions.ts:17-50`).
- `notifications.open.resolveOpenTarget` : relit session, destinataire, sujet et sonnerie ; ne
  marque rien comme lu (P05, non vérifié).
- `calls.direct.callMember`, `calls.lifecycle.{setCallRinging,join,leave,declineCall,getCall}`,
  `calls.ringing.{listRinging,hold,resume}`, `calls.groupCalls.*`, `calls.presence.*`,
  `calls.preferences.*`, `calls.livekitActions.requestToken` (jeton de 2 h, 60 s pour un appel
  commercial, identité à nonce). `declineCall` sur un appel terminé rend `{ ended: false }`
  (`lifecycle.ts:138-155`) et `join` refuse un appel terminé : base utile contre les événements
  tardifs.

### 3.5 Contrats manquants

| # | Contrat | Constat | Proposition | Lot |
|---|---|---|---|---|
| M1 | Application native au registre | une application = identifiant, réseau, origine HTTPS et chemin d'entrée (`notifications/configuration.ts:4-25`) ; sujet APNs unique `APNS_TOPIC` (`transports.ts:82`) | entrée native : plateforme, bundle ou paquet, natures de jeton admises ; sujet APNs dérivé par application (piège P9 de l'ADR-0002 GABON) | P17c |
| M2 | Jeton VoIP distinct | `apns` = un jeton de 64 hexadécimaux sans nature (`tables.ts:66-70`) ; PushKit délivre ses propres identifiants au délégué `didUpdate` | nature `apns_voip` validée, un abonnement par nature, désinscription à la sortie | P17c |
| M3 | Transport d'appel | APNs `alert` + `aps.alert` (`transports.ts:93,105`) ; FCM `notification` + `data` (`:75`) ; Expo titre/corps (`:41`) ; 45 s (`:32,41,75,93`) | iOS : type `voip`, sujet `<bundle>.voip`, priorité 10, expiration 0 ou quelques secondes, charge neutre ; Android : FCM **data seule** haute priorité ; jamais de sonnerie d'appel par Expo ; cliquet `notification-payload-content` respecté | P17c |
| M4 | Ouverture ciblée d'appel | rend `{ channel: "call", ringing }` sans identifiant d'appel ni libellé (`notifications/open.ts:41-52,95-101`) | pour le natif seulement : identifiant d'appel, nature, média et profil **publié** de l'appelant, uniquement si l'appel sonne encore pour la session ; même repli `null` | P17c |
| M5 | Fin de sonnerie | aucune annulation n'est poussée ; seule la souscription Convex retire l'appel | précision P17c du 20/10 : relecture active pendant la sonnerie et échéance native indépendante ; **aucun second push VoIP d’annulation**, ce canal Apple étant réservé au lancement d’un appel ; rapport immédiat puis fermeture si une ancienne ouverture n’est plus valide | P17c |
| M6 | Budget des appels | chaque push d'appel réserve le budget social hebdomadaire (`deliveries.ts:47-62`, 35 par défaut, `notificationDelivery.ts:10`) ; `incomingCallAllowed` exige `weeklyLimit > 0`, la catégorie `calls` et le consentement (`policy.ts:90-104`) | décision du propriétaire : appels gouvernés par les préférences d'appel et « ne pas déranger », ou plafond distinct | P17c |
| M7 | Session hors premier plan | abonnement inactif dès que la session expire (`sessionBinding.ts`) ; SecureStore lit par défaut en `WHEN_UNLOCKED`, inaccessible appareil verrouillé [S16] | jeton en `AFTER_FIRST_UNLOCK` (arbitrage sécurité, D7), rafraîchi à l'ouverture ; « appels inactifs sur cet appareil » à l'expiration ou à la révocation ; aucune exception de session | P17b–c |
| M8 | Appareils multiples | `join` marque la participation de la **personne** (`lifecycle.ts:63-103`) ; jeton LiveKit à nonce par connexion (`livekitActions.ts:49`) : deux appareils d'une même personne peuvent entrer | réponse revendiquée par appareil (premier gagnant), autres appareils terminés (M5) ; tests de double acceptation | P17c |
| M9 | Porte de sortie native | `LocalPurgeStorage` = `Storage` (`sign-out-everywhere.ts:23`), navigation complète (`:49`) ; cliquet limité au Web | variante asynchrone : révocation serveur, désinscription de l'appareil, fin d'appel et arrêt des pistes, purge SecureStore et caches, retour à l'accueil ; client natif ajouté au cliquet | P17b |
| M10 | Origine native de confiance | origines http/https seulement (`settings.ts:7-15`) ; crochet d'origine (`auth.ts:101-106`) | schéma natif explicite (joker `exp://` réservé au développement), greffon `expo()` [S17][S18] ; rappel IDN inchangé sur `SITE_URL` (ADR-0008) | P17b |
| M11 | Reprise après arrêt du processus | événements CallKit rejoués en mémoire (B1) ; file mémoire perdue si le processus s'arrête (B4) ; Android abandonne les messages d'une app arrêtée de force | intention native persistée (répondre, refuser, raccrocher ; appel ; horodatage), rejouée après relecture de session et `getCall`, bornée par la fenêtre de sonnerie, idempotente ; **aucune promesse au-delà d'un arrêt forcé** | P17c |
| M12 | Liens profonds, jetons et routes | aucun fichier d'association servi par `apps/antsia_ga` ; aucune table de routes native ; jetons en CSS seulement | `apple-app-site-association` et `assetlinks.json` (identifiants du propriétaire) ; `apps/<app>/src/lib/routes.ts` ; jetons natifs générés ; cibles toujours revalidées | P17b |

## 4. Limites Web et chaînes d'appel natives — faits datés

Les identifiants [S1]…[S29] renvoient au §8.2 (consultations des 18 et 19/10/2026). Les
documents officiels sont résumés, pas recopiés.

### 4.1 Ce que le Web et la PWA ne peuvent pas promettre

| Promesse | Web / PWA | Ce qu'exige le natif |
|---|---|---|
| Sonnerie écran verrouillé | l'API Push peut démarrer le service worker même page fermée [S11], mais il n'affiche qu'une notification : les options de `showNotification` n'offrent ni sonnerie en boucle ni interface plein écran [S10]. Sur iOS, le Web Push ne vaut que pour une web app ajoutée à l'écran d'accueil (iOS 16.4+), l'autorisation se demande sur un geste et tout push doit être affiché, faute de quoi Safari retire l'autorisation [S8][S9] | iOS : PushKit + CallKit ; Android : notification d'appel `CallStyle` + intention plein écran, ou Core-Telecom |
| Onglet fermé | même limite ; ANTSIA affiche pour un appel le même texte neutre que pour un avis, sans action, puis ouvre `/notifications/ouvrir` (`apps/antsia_ga/src/lib/notification-worker.ts`) | réveil de l'application par push VoIP ou message FCM « data » |
| Arrière-plan iOS d'un appel | aucune référence consultée n'expose CallKit ni les modes d'arrière-plan `voip` et `audio` à une page Web (inférence par absence) | modes `voip` et `audio` déclarés par l'application [S5] |
| Arrêt forcé | — | Android : messages abandonnés tant que l'application est arrêtée de force [S29] ; non promis non plus sur iOS |

### 4.2 iOS : PushKit, CallKit et APNs

- Depuis le SDK iOS 13, le délégué PushKit doit signaler chaque push VoIP à CallKit
  (`reportNewIncomingCall`). À défaut, iOS 13+ termine l'application et des manquements répétés
  peuvent arrêter toute livraison VoIP ; une application sans CallKit doit utiliser les
  notifications utilisateur et non PushKit [S1][S2].
- Le système lance ou réveille l'application pour un push VoIP et le remet au registre PushKit.
  La connexion au serveur s'établit en parallèle ; si la personne répond avant, l'action de
  réponse n'est validée qu'une fois connectée ; un échec se signale à CallKit [S1].
- L'expiration APNs d'un push VoIP doit valoir 0 ou quelques secondes [S1]. Le type `voip` impose
  un sujet égal au bundle suivi de `.voip` ; le type `alert` sert à une interaction utilisateur ;
  priorités 10, 5 et 1 ; un en-tête incohérent peut retarder ou faire rejeter le push [S3].
- Le registre PushKit se crée au lancement ; ses identifiants arrivent au délégué `didUpdate` ;
  la capacité Push pose `aps-environment` ; prévoir plusieurs jetons par personne [S4]. Modes
  d'arrière-plan `voip` et `audio` [S5].
- Le simulateur n'a pas de service CallKit [S20] ; l'ADR-0002 GABON constate aussi l'absence de
  push VoIP au simulateur : l'entrant se prouve sur appareil seulement.
- Le SDK iOS 27 impose le cycle de vie UIScene ; Expo 57 l'active par option et Expo 58 génère
  `SceneDelegate.swift` [S14][S15] : tout greffon qui modifie `AppDelegate` est à revalider.
- Revue App Store : services d'arrière-plan réservés à leur usage, dont la VoIP (2.5.4) ;
  contenus d'utilisateurs avec filtrage, signalement traité rapidement, blocage et contact publié
  (1.2) ; suppression du compte dans l'application (5.1.1(v)) ; services régulés ou données
  sensibles soumis par l'entité juridique qui fournit le service (5.1.1(ix)) ; davantage qu'un
  site reconditionné (4.2) [S26].

### 4.3 Android : FCM, Telecom, services et notifications

- En arrière-plan, un message FCM de notification est affiché par le système sans code de
  l'application ; un message de données atteint `onMessageReceived`, dont la fenêtre d'exécution
  est courte [S7]. La haute priorité peut réveiller un appareil en Doze, mais doit déboucher sur
  une interaction visible, sinon elle peut être rétrogradée [S6][S27].
- Core-Telecom (Jetpack) : `ConnectionService` jusqu'à Android 13, types de service au premier
  plan à partir d'Android 14 ; `MANAGE_OWN_CALLS` ; service `phoneCall` ; notification
  `CallStyle` dans les cinq secondes après l'ajout de l'appel ; ne pas piloter l'audio par
  `AudioManager` pendant un appel Telecom [S23]. `CallStyle` existe depuis Android 12 et se place
  en tête du volet [S24].
- `POST_NOTIFICATIONS` depuis Android 13 ; exemption pour les notifications `CallStyle` d'une
  application qui gère elle-même ses appels (`MANAGE_OWN_CALLS`, `ConnectionService`,
  `registerPhoneAccount`) [S25].
- Intention plein écran : depuis Android 14, Google Play réserve `USE_FULL_SCREEN_INTENT` aux
  applications d'appel et d'alarme ; vérifier `canUseFullScreenIntent`, sinon ouvrir le réglage ;
  déclaration Play Console exigée depuis le 31/05/2024 [S21][S22].
- Types de service au premier plan obligatoires pour une cible Android 14+ [S21]. `phoneCall` :
  permission dédiée et `MANAGE_OWN_CALLS` ou rôle de numéroteur ; usage décrit : appel en cours
  via `ConnectionService`. `microphone` et `camera` : permissions d'exécution soumises à la règle
  « pendant l'utilisation », pas de démarrage depuis l'arrière-plan sauf exceptions, dont un
  démarrage par interaction avec une notification [S12][S13]. Déclaration Play Console des types
  avec vidéo de démonstration [S22]. L'ADR-0002 GABON (P7) a payé un plantage Android 14 au
  décrochage quand les types demandés dépassaient ceux du manifeste.
- Batterie : FCM haute priorité est la voie prévue ; demander l'exemption directe est jugé non
  acceptable pour une application de messagerie ou d'appel capable d'utiliser FCM [S27].

### 4.4 Écart constaté dans le moteur ANTSIA

1. iOS : `apns-push-type: alert`, charge `aps.alert`, sujet unique (`transports.ts:82,93,105`).
   Un push `alert` relève des notifications utilisateur, pas de PushKit : il n'ouvre pas
   l'interface d'appel du système.
2. Android : le message FCM d'appel porte un bloc `notification` (`transports.ts:75`) ; en
   arrière-plan il est affiché par le système, sans code de l'application, donc sans
   `CallStyle` ni intention plein écran.
3. Expo : titre et corps neutres, priorité haute (`transports.ts:41`) ; les champs documentés de
   l'API d'envoi Expo ne comportent aucun type VoIP, et un reçu `ok` prouve seulement
   l'acceptation par APNs ou FCM [S19].
4. Expiration de 45 s pour une fenêtre de sonnerie de 120 s (`social-contracts/src/calls.ts:23`),
   à rapprocher de la consigne Apple (0 ou quelques secondes).
5. Budget social hebdomadaire appliqué aux appels (M6) ; aucune annulation poussée (M5) ;
   aucune revendication par appareil (M8) ; ouverture sans identifiant d'appel (M4).
6. Aucun client natif dans `apps/` ; fournisseurs, appareils et identifiants non configurés,
   recettes Web Push, Expo, FCM et APNs ouvertes (`docs/07_RAPPORT_GARDE_FOUS_PA5.md:129`).

## 5. Décomposition exécutable de P17b, P17c, P17d

Niveaux de preuve à séparer dans chaque tranche : **code présent**, **test automatique**,
**build local**, **simulateur ou émulateur**, **appareil physique**, **distribution**. Aucun
calendrier n'est proposé.

### 5.0 Décisions préalables

| # | Décision | Éléments | Qui |
|---|---|---|---|
| D1 | Emplacement et installation | (A) `apps/antsia_mobile` membre de l'espace de travail, versions RN dans un catalogue bun nommé (fonction documentée [S28]) ; risques : deux React (Expo 57 attend React 19.2.3 selon `bundledNativeModules.json` lu dans GABON_DIPLOMATIE, le catalogue ANTSIA impose 19.2.7), Metro sur le monorepo. (B) application hors des espaces de travail, modèle ADR-0219 du socle ; les paquets `workspace:*`/`catalog:` ne s'y installent pas : alias Metro ou copie générée. (C) dépôt séparé, contraire à l'installation unique. **Recommandation : A, avec un essai d'entrée en P17b et repli sur B** | propriétaire et coordinateur |
| D2 | SDK Expo | 57 (pile utilisée par B1, B4, B5, B7) ou 58 (15/10/2026, RN 0.88) | propriétaire |
| D3 | Source et droits | autoriser ou non la duplication native depuis `gabon-diplomatie@1abb2f23` et `setrag@bd3a80e7` (complément à l'ADR-0004) ; droits de reprise sous AGPL | propriétaire |
| D4 | Ordre avec DIASPORALE | EXF-AN-53 place ANTSIA après DIASPORALE mobile, sur le même socle Expo : proposer un paquet natif commun dans le moteur | propriétaire |
| D5 | Chaînes système | **recommandation** : iOS, rapport à CallKit **dans le natif, avant JavaScript** (règle Apple [S2]) ; Android, Core-Telecom + `CallStyle` + FCM « data » (Notifee archivé) ; module : `expo-callkit-telecom` après essai, ou module Expo local | propriétaire sur proposition P17c |
| D6 | Budget des appels | M6 | propriétaire |
| D7 | Sécurité locale | accessibilité du trousseau (`AFTER_FIRST_UNLOCK`), durée de session, biométrie éventuelle | propriétaire |
| D8 | Identités | bundle iOS, paquet Android, schéma, domaine des liens universels | propriétaire |

### 5.1 P17b — coque native, authentification, fil, messages

- **Objectif** : un client natif branché et vérifié, sans appel système ni push d'appel.
- **Chemins proposés (cibles à confirmer, aucun n'existe)** :
  - `apps/antsia_mobile/` (session ANTSIA ; ou hors espaces si D1 = B) : `app.config.ts`
    (schéma et origines par l'environnement), `src/app/` (expo-router : entrée, fil, publication,
    messages, conversation, profil, réglages), `src/lib/routes.ts`, `src/lib/auth-client.ts`,
    `src/lib/secure-storage.ts`, `src/lib/sign-out.ts`, `src/i18n/locales/{fr,en}/`.
  - `packages/social-native/` (session ANTSIA ; futur consommateur
    `../DIASPORALE/apps/diasporale_mobile`) : adaptateurs de stockage, d'environnement de lecture,
    de `PlaybackTarget` pour le lecteur vidéo natif, de routes, d'i18n et de sortie.
  - Logique pure P04/P05 extraite de `social-features` vers un paquet sans DOM (session ANTSIA).
  - Jetons natifs générés sous `packages/ui/src/themes/` (cliquets `theme-contract`,
    `no-hardcoded-colors`).
  - Serveur : `convex/betterAuth/{auth,settings}.ts` (greffon `expo()`, schéma natif) et tests.
  - Fichiers partagés à réserver par le coordinateur : `package.json` (catalogue),
    `bun.lock`, `deploy/catalog.json` si l'application y figure,
    `packages/api/src/sign-out-everywhere.ts`, `tests/ratchets/sign-out-everywhere.test.ts`.
- **Dépendances** : D1, D2, D3, D7, D8 ; P04 et P05 vérifiés (aujourd'hui « raccordés, non
  vérifiés ») ; `bun run verify` vert ; place disque (8,2 Gio libres ; un build iOS setrag a
  été interrompu par une garde de 2 Gio ; un émulateur Android avec services Google demande
  7,2 Gio au premier démarrage).
- **Tests automatiques** : adaptateurs purs ; connexion par code et par IDN ; révocation →
  purge ; porte de sortie native ; table de routes ; mêmes clés FR/EN ; normalisation des
  médias ; rendu des retenues ; envoi idempotent.
- **Preuves attendues** : build de développement local sur un iPhone et un Android physiques
  identifiés (modèle, version, build) ; connexion, redémarrage à froid avec session, déconnexion
  globale lancée depuis le Web puis purge native, fil en liste puis en immersion, média retenu,
  envoi hors ligne puis reprise ; captures minimisées.
- **Sortie** : coque vérifiée ; aucune promesse d'appel natif.

### 5.2 P17c — appels et notifications système

- **Serveur (session ANTSIA)** : `convex/modules/notifications/{tables,pushSubscriptions,configuration,transports,deliveries,policy,open}.ts`,
  `packages/social-domain/src/notificationDelivery.ts`, `convex/modules/calls/{push,lifecycle,ringing}.ts`
  (M1 à M8, M11) ; cliquets `notification-payload-content`, `notifications-writer`,
  `rate-limited-writes`, `network-scoped-functions`.
- **Natif** : `packages/social-native/src/calls/` (hôte d'appel persistant monté une fois,
  LiveKit RN, session audio pilotée par CallKit, priorité appel → vocal → vidéo par le
  coordinateur P04, arrêt réel des pistes) ; `apps/antsia_mobile/plugins/` (modes d'arrière-plan,
  service Telecom, canaux, intention plein écran) ; module système choisi en D5 ; permissions au
  moment utile (un appel audio ne demande pas la caméra).
- **Dépendances du propriétaire** : capacité Push et clé APNs, profils avec mode VoIP, projet
  Firebase et compte de service, variables Convex (`APNS_*`, `FCM_*`, application native),
  configuration LiveKit à confirmer pour le natif ; déclarations Play Console au moment d'une
  distribution.
- **Tests automatiques** : machine d'états (sonnerie, réponse, refus, fin, expiration), double
  acceptation sur deux appareils, annulation orpheline, permissions refusées (micro, caméra,
  notifications, plein écran), révocation pendant la sonnerie, jetons et réponses tardifs,
  reprise après arrêt, charge neutre.
- **Preuves attendues** : appareils physiques seulement pour l'entrant ; journal serveur des jobs
  (`sent` ou `accepted` ne valent pas réception) ; horodatages push → sonnerie → média.

### 5.3 P17d — recette physique et parité

| Scénario | iPhone physique (version relevée) | Android ≥ 14 physique, services Google | Android ≤ 13 physique (si couvert) |
|---|---|---|---|
| Audio et vidéo dans les deux sens | écoute humaine et indicateurs système | idem | idem |
| Écran verrouillé, application en arrière-plan | sonnerie CallKit, réponse, média | `CallStyle` plein écran, réponse | `ConnectionService` |
| Démarrage à froid (processus tué par le système) | réponse rejouée (M11) | idem | idem |
| Arrêt forcé | constat seulement, aucune promesse | message abandonné attendu | idem |
| Bluetooth, interruption par un appel cellulaire | routage et reprise | idem | idem |
| Wi-Fi ↔ mobile, perte et reprise du réseau | reconnexion bornée | idem | idem |
| Raccrochage distant, refus, expiration | fin cohérente des deux côtés | idem | idem |
| Micro et caméra résiduels | indicateurs système éteints | idem | idem |
| Ne pas déranger, économie de batterie, permissions refusées | refus récupérable | idem, plein écran refusé | idem |
| Deux appareils d'une même personne | une seule réponse (M8) | idem | idem |
| Révocation de session pendant la sonnerie | sonnerie close, aucune reprise | idem | idem |
| Navigation, partage, changement de thème | la salle n'est pas recréée | idem | idem |

- **Preuves** : matrice OS/version/appareil/build, horodatages, états serveur, captures sans nom
  ni contenu, journaux sans jeton ni secret, mesures (délai push → sonnerie, établissement du
  média), limites ; distinction code, build local, simulateur, appareil, distribution.
- **Parité** : fil, messages et appels face au Web ; commerce limité aux contrats livrés **et
  vérifiés** (P07 à P13 sont aujourd'hui « raccordés, non vérifiés »), sans transaction simulée
  ni accès au backend PRO.GA.
- **Distribution** : TestFlight ou tests internes Play seulement sur demande explicite ; aucune
  publication sur les stores ; aucun enregistrement d'appel ; aucun E2EE annoncé.

### 5.4 Ce qui reste au propriétaire

- Trancher D1 à D8.
- Comptes : Apple Developer Program (type de compte à apprécier au regard de la règle
  5.1.1(ix) ; les apps du programme relevées utilisent un compte individuel), App Store Connect,
  Google Play Console, Firebase, EAS si builds en nuage. Xcode, Android Studio et le SDK Android
  sont présents sur le Mac (constat de fichiers, rien n'a été lancé).
- Identifiants, capacités et clés : bundle, paquet, schéma, domaine ; capacités Push et domaines
  associés ; mode VoIP ; clé APNs couvrant toutes les apps de l'équipe (une clé limitée à un
  sujet ne s'étend pas, ADR-0002 GABON P9) ; compte de service FCM ; secrets posés dans Convex
  par le propriétaire seul.
- Appareils : au moins un iPhone (un iPhone sous iOS 26.6.1 a servi à setrag le 15/10) ; **au
  moins un Android physique avec services Google** (aucun attesté) ; idéalement un Android 13 ou
  antérieur ; un casque Bluetooth ; deux comptes de recette.
- Stores et conformité : politique de confidentialité, suppression du compte dans l'application,
  modération des contenus, droits sur le code repris, décision de publication.
- Place disque avant tout build.

### 5.5 Risques principaux

| Risque | Mesure |
|---|---|
| Rapport CallKit tardif (côté JS) : terminaison et arrêt des push VoIP | rapport natif avant JS (D5), recette app tuée |
| Notifee archivé | Core-Telecom + `CallStyle` |
| SDK 58 très récent ; greffons `AppDelegate` | D2 ; revalider chaque greffon au `prebuild` |
| Deux versions de React | D1 avec essai d'entrée |
| Budget social appliqué aux appels | D6 avant toute promesse |
| Appareils multiples | M8 et M5 testés |
| Affichage CallKit neutre avant relecture | libellé générique, mise à jour après relecture autorisée (API CallKit à confirmer en P17c) |
| Refus Play (plein écran, types de service) ou App Store (1.2, 4.2, 5.1.1) | déclarations et preuves préparées par le propriétaire |
| Ordre DIASPORALE / ANTSIA | D4 et paquet natif commun |

## 6. Bilan standard

| Champ | Contenu |
|---|---|
| Résultat | Audit documentaire : sept briques classées, contrats réutilisables, à adapter, à exclure et manquants, limites Web et chaînes natives sourcées, décomposition P17b–d. Rien n'est branché. |
| Source | ANTSIA `codex/pa4-identite-session` `9eaff40` ; GABON_DIPLOMATIE `origin/main` `1abb2f23` ; setrag `origin/main` `b8278a97` ; iBadge `b36fb8b` ; identite.ga `0e5414c` ; branche `feat/espace-ios` `0d234973`. Seul ce rapport est créé. |
| Tests | Aucun lancé (décision du propriétaire). Les nombres de tests cités sont lus dans les sources. |
| Recette | Aucune : ni simulateur, ni émulateur, ni appareil, ni navigateur. |
| Dépendances | D1 à D8 ; vérification de P04 et P05 ; comptes, clés, appareils et place disque. |
| Retour arrière | Sans objet : aucun code, schéma, configuration ni donnée modifié. |
| Limites | Aucune affirmation de compilation ou de fonctionnement ; les versions de bibliothèques évoluent (l'amont de `react-native-callkeep` a publié quatre versions les 17–18/10). |

## 7. Demandes au coordinateur

1. Mettre à jour la ligne P17a d'`EXECUTION.md` : « documenté ; audit sans vérification ; aucun
   code ». Ce rapport n'y écrit pas.
2. Soumettre D1 à D8 au propriétaire avant toute demande P17b.
3. Ne lancer ni P17b, ni P17c, ni P17d sans demande explicite ; réserver les fichiers partagés
   listés au §5.1 avant P17b.

## 8. Sources

### 8.1 Sources locales lues

- ANTSIA : `CLAUDE.md` ; étude `README.md`, `00`, `02` §5, `04`, `05`, `09`, `10`, `11`,
  `prompts/PROMPT_COMMUN.md`, `prompts/P17_MOBILE_NATIF.md`, `EXECUTION.md` ; rapports P04 et
  P05 ; `packages/social-contracts/src/{calls,callGroup,messaging,media,attachments}.ts` ;
  `convex/modules/notifications/{transports,open,pushSubscriptions,deliveries,policy,preferences,configuration,sessionBinding,push,tables}.ts` ;
  `convex/modules/calls/{push,token,livekitActions,direct,lifecycle}.ts` ;
  `convex/betterAuth/{auth,settings}.ts`, `convex/http.ts`, `convex/lib/functions.ts` ;
  `packages/api/src/*` ; `packages/social-domain/src/{notificationDelivery,uploadPolicy,content,stories}.ts` ;
  modules P04/P05 cités au §3 ; `tests/ratchets/*` cités ; `docs/00_CAHIER_DES_CHARGES_ANTSIA.md`,
  `docs/adr/0004`, `docs/adr/0008`, `docs/07_RAPPORT_GARDE_FOUS_PA5.md`.
- Programme : `PRO_GA/docs/11_PLAN_IMPLEMENTATION_PROMPTS_PRO_GA.md` §2 ;
  `DIASPORALE/docs/00_CAHIER_DES_CHARGES_DIASPORALE.md` §10.2 et lot D3 ;
  `Documentation/RESEAUX_SOCIAUX/00_PLAN_RESEAUX_DANS_LE_RESEAU_DIASPORALE_ANTSIA_2026-10-14.md` ;
  GABON_DIPLOMATIE `docs/adr/0002-appels-natifs-mobile-livekit-callkit.md`,
  `docs/agent-mobile-revue-ecrans-2026-09-16.md`, `apps/{citizen,agent}-mobile/**` (manifestes,
  `index.js`, `src/lib/*` d'appel et d'authentification, greffons) ;
  `badge.administration.ga/{README.md,package.json,src/lib/*}` ; `identite.ga/apps/mobile/*` ;
  `ADMINISTRATION_GA_ESPACE_IOS_20261008/plateforme/espace/espace_ios/README.md` et ADR-0219.
- Hors programme : `setrag/packages/iappel-mobile/**`,
  `setrag/docs/preuves/iappel-mobile-2026-10-14/{livraison.md,notifications-sdk-releve.md,etat-final-en-attente.json}`.

### 8.2 Sources externes

| ID | Source | Consultée le | Ce qu'elle étaye |
|---|---|---|---|
| S1 | Apple — [Responding to VoIP notifications from PushKit](https://developer.apple.com/documentation/pushkit/responding-to-voip-notifications-from-pushkit) | 18/10/2026 | CallKit obligatoire, réveil de l'app, connexion en parallèle, expiration courte |
| S2 | Apple — [pushRegistry(_:didReceiveIncomingPushWith:for:completion:)](https://developer.apple.com/documentation/pushkit/pkpushregistrydelegate/pushregistry(_:didreceiveincomingpushwith:for:completion:)) | 18/10/2026 | terminaison et arrêt de livraison sans rapport CallKit |
| S3 | Apple — [Sending notification requests to APNs](https://developer.apple.com/documentation/usernotifications/sending-notification-requests-to-apns) | 18/10/2026 | types `voip`/`alert`, sujet `.voip`, priorités, expiration |
| S4 | Apple — [Supporting PushKit notifications in your app](https://developer.apple.com/documentation/pushkit/supporting-pushkit-notifications-in-your-app) | 18/10/2026 | registre au lancement, identifiants, capacité Push, jetons multiples |
| S5 | Apple — [Configuring background execution modes](https://developer.apple.com/documentation/xcode/configuring-background-execution-modes) | 18/10/2026 | modes `voip` et `audio` |
| S6 | Firebase — [Android message priority](https://firebase.google.com/docs/cloud-messaging/android-message-priority) | 18/10/2026 | haute priorité, Doze, rétrogradation |
| S7 | Firebase — [Receive messages (Android)](https://firebase.google.com/docs/cloud-messaging/android/receive-messages) | 18/10/2026 | notification contre données en arrière-plan, fenêtre courte |
| S8 | Apple — [Sending web push notifications in web apps and browsers](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers) | 18/10/2026 | web apps de l'écran d'accueil iOS 16.4+, geste, push visible |
| S9 | WebKit — [Web Push for Web Apps on iOS and iPadOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/) (16/02/2023) | 18/10/2026 | Web Push limité aux web apps de l'écran d'accueil |
| S10 | MDN — [showNotification()](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/showNotification) | 18/10/2026 | options sans sonnerie en boucle ni plein écran |
| S11 | MDN — [Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API) | 19/10/2026 | service worker démarré à la réception |
| S12 | Android — [Foreground service types](https://developer.android.com/develop/background-work/services/fgs/service-types) | 18/10/2026 | `phoneCall`, `microphone`, `camera` |
| S13 | Android — [Restrictions on starting a foreground service from the background](https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start) | 19/10/2026 | exemptions, permissions « pendant l'utilisation » |
| S14 | Expo — [SDK 57](https://expo.dev/changelog/sdk-57) | 19/10/2026 | date, RN 0.86/0.86.3, UIScene iOS 27, `prebuild` |
| S15 | Expo — [SDK 58](https://expo.dev/changelog/sdk-58) | 19/10/2026 | date, RN 0.88, `SceneDelegate`, notifications |
| S16 | Expo — [SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/) | 19/10/2026 | accessibilité du trousseau, défaut `WHEN_UNLOCKED` |
| S17 | Better Auth — [Expo integration](https://www.better-auth.com/docs/integrations/expo) | 19/10/2026 | greffon `expo()`, schéma dans les origines, `exp://` en développement |
| S18 | Convex — [Better Auth : guide Expo](https://labs.convex.dev/better-auth/framework-guides/expo) | 19/10/2026 | greffons serveur et client, exclusivité `expoClient`/`crossDomainClient` |
| S19 | Expo — [Sending notifications with Expo push service](https://docs.expo.dev/push-notifications/sending-notifications/) | 19/10/2026 | champs de l'API, reçus |
| S20 | GitHub — [react-native-callkeep](https://github.com/react-native-webrtc/react-native-callkeep) et [registre npm](https://registry.npmjs.org/react-native-callkeep) | 19/10/2026 | simulateur sans CallKit, mode auto-géré, versions du 17–18/10 |
| S21 | Android — [Behavior changes: Android 14](https://developer.android.com/about/versions/14/behavior-changes-14) | 18/10/2026 | intention plein écran, types de service obligatoires |
| S22 | Google Play — [Foreground service and full-screen intent requirements](https://support.google.com/googleplay/android-developer/answer/13392821) | 19/10/2026 | déclarations, vidéo, octroi par défaut |
| S23 | Android — [Core-Telecom](https://developer.android.com/develop/connectivity/telecom/voip-app/telecom) | 18/10/2026 | `ConnectionService`/types de service, `CallStyle` sous 5 s, audio |
| S24 | Android — [Create a call style notification](https://developer.android.com/develop/ui/views/notifications/call-style) | 19/10/2026 | `CallStyle` Android 12+ |
| S25 | Android — [Notification runtime permission](https://developer.android.com/develop/ui/views/notifications/notification-permission) | 18–19/10/2026 (minuit) | `POST_NOTIFICATIONS`, exemption appels auto-gérés |
| S26 | Apple — [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) | 19/10/2026 | 1.2, 2.5.4, 4.2, 5.1.1(v), 5.1.1(ix) |
| S27 | Android — [Optimize for Doze and App Standby](https://developer.android.com/training/monitoring-device-state/doze-standby) | 18/10/2026 | FCM haute priorité, exemption non acceptable |
| S28 | Bun — [Catalogs](https://bun.com/docs/install/catalogs) | 19/10/2026 | catalogues nommés |
| S29 | Firebase Blog — [Understanding FCM Message Delivery on Android](https://firebase.blog/posts/2024/07/understand-fcm-delivery-rates/) (18/07/2024) | 19/10/2026 | abandon des messages d'une app arrêtée de force |

Sources complémentaires consultées le 19/10/2026 pour l'état des bibliothèques :
[Notifee](https://github.com/invertase/notifee) (archivé le 07/04/2026),
[react-native-voip-push-notification](https://registry.npmjs.org/react-native-voip-push-notification),
[@livekit/react-native-callkeep](https://registry.npmjs.org/@livekit/react-native-callkeep),
[expo-callkit-telecom](https://github.com/mfairley/expo-callkit-telecom) et
[son registre](https://registry.npmjs.org/expo-callkit-telecom),
[@livekit/react-native](https://registry.npmjs.org/@livekit/react-native/latest),
[LiveKit Expo](https://docs.livekit.io/transport/sdk-platforms/expo/),
[LiveKit React Native](https://docs.livekit.io/transport/sdk-platforms/react-native/),
[exemple officiel CallKit](https://github.com/livekit-examples/react-native-callkit),
[expo-notifications](https://docs.expo.dev/versions/latest/sdk/notifications/).
