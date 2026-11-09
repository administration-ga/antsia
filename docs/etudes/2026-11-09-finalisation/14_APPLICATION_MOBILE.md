# Plan 14 — Application mobile (iOS et Android)

> Constaté par lecture du code d'`origin/main` (ANTSIA `26741caa`, DIASPORALE `bead76d`), le 9 novembre 2026. Rien n'a été exécuté.
> Applications de référence : Instagram, WhatsApp, TikTok, Facebook (applications natives). Comparaison faite de mémoire (état des produits à la mi-2026), non revérifiée en ligne.

Mots utilisés : **natif** = l'application installée (Expo, React Native), par opposition au site ; **binaire** = le fichier installable (IPA pour iOS, APK ou AAB pour Android) ; **push** = notification envoyée au téléphone quand l'application est fermée ; **lien profond** = adresse qui ouvre un écran précis de l'application ; **parité** = le même service rendu sur le web et dans l'application.

## 1. L'intention du propriétaire

- La « Version D » de la refonte : « La continuité sur téléphone réel » — application native, appels entrants et en arrière-plan, notifications ciblées, faible connectivité, parité des parcours commerciaux. « Une fenêtre Web étroite ne la remplace pas » (`docs/etudes/2026-10-18-social-commerce/00_VISION_ET_DECISIONS.md` § Version D).
- Exigences liées : SC14 (recette faible débit, VoiceOver, **téléphone réel**), SC15 (appel reçu écran verrouillé **réellement testé** sur iOS et Android avant toute promesse de parité) (même document, § 5).
- Cahier : EXF-AN-27 (push Web, Expo, FCM, APNs pour les évènements sociaux, préférences, plafond, digest) ; EXF-AN-53 (application ANTSIA, thème ANTSIA) ; EXT-AN-06 (mobile d'abord, Expo).
- Plan directeur, jalon 1 : « Un binaire compilé depuis `main` tourne sur un iPhone et un téléphone Android réels » ; jalon 2 : parité mobile et publication dans les boutiques d'applications (`00_PLAN_DIRECTEUR.md` § 4).
- Cinq destinations au téléphone : Fil, Clips, Messages, Découvrir, Profil ; on range, on n'ajoute pas d'icône (mémoire du propriétaire ; `apps/antsia_mobile/src/lib/routes.ts`, `NATIVE_MEMBER_TABS`).
- Déjà décidé : retour IDN par code PKCE à usage unique (ADR-0031) ; aucun profil créé d'office ; appels natifs fermés par défaut (`NATIVE_CALLS_ENABLED=false`) ; aucun achat dans l'application (README de l'application) ; « ne jamais annoncer une parité complète sans preuve » (dossier de reprise § 10.3).
- Restent au propriétaire : toute compilation qui consomme du quota, toute soumission TestFlight, la soumission aux boutiques, les clés (dossier de reprise § 13.4).

## 2. Ce qui existe

Matrice construite depuis les 88 pages de `apps/antsia_ga/src/app` et les 17 routes natives de `apps/antsia_mobile/src/lib/routes.ts` (`NativeRoute`). « Web » = route du site ; « Mobile » = écran natif. Un **renvoi web** ouvre le site dans le navigateur système, sans transférer la session : la personne doit s'y reconnecter.

| Capacité | État | Web | Mobile | Preuve |
|---|---|---|---|---|
| Entrée par code e-mail ou SMS | Présent | `/entrer` | entrée native | `apps/antsia_mobile/src/components/entry.tsx` |
| Entrée IDN, retour natif PKCE | Présent | `/entrer` | navigateur système puis `antsia://auth/idn` | `src/lib/native-idn.ts`, `packages/social-native/src/idn.ts`, `convex/betterAuth/nativeIdn.ts` |
| Bienvenue : nom, identifiant, consentement, adhésion | Présent | `/bienvenue` | `NativeOnboarding` | `src/components/native-onboarding.tsx` |
| Découverte publique anonyme, publication, profil, page officielle | Présent | `(public)/decouvrir`, `publications`, `pages` | `PublicEntryScreen` | `src/screens/public-entry-screen.tsx` |
| À propos, mentions légales, confidentialité | Présent | `(public)/a-propos`… | mêmes textes | `src/screens/public-entry-screen.tsx` (`kind`) |
| Transparence, tags et provinces publics | Absent | `(public)/transparence`, `tags`, `provinces` | — | motifs `transparen`, `province`, `transparency` : aucun résultat dans `apps/antsia_mobile/src` |
| Démonstration : huit comptes fictifs | Présent | `/demo` | sélecteur, origines isolées | `src/components/demo-entry.tsx`, `src/lib/native-demo.ts`, `src/lib/destinations.ts` |
| Sortie et révocation | Présent | menu | porte de sortie unique | `packages/social-native/src/sign-out.ts`, `src/lib/session-controller.ts` |
| Suppression du compte | Partiel | `/mes-donnees` (`requestErasure`) | renvoi web seulement | `src/lib/native-profile-view.ts` (`personalData`), `apps/antsia_ga/src/components/personal-controls.tsx` |
| Export de ses données | Partiel | `/mes-donnees` | renvoi web | idem |
| Apparence : mode, sept thèmes, langue | Partiel | `/parametres` | réglage local, jamais écrit sur le compte | `src/app.tsx` (`NativeSettings`), `src/appearance.tsx` ; `setMyPreferences` n'est appelé que dans `native-onboarding.tsx` |
| Préférences de notification | Absent | `/parametres` | — | `apps/antsia_ga/src/components/notification-controls.tsx` ; motifs `preferences.update`, `notificationPreferences`, `catégorie` absents du mobile |
| Bloquer une personne | Absent | `BlockedPeopleSection` | — | `convex/modules/graph/connections.ts` (`blockPerson`) ; motifs `block`, `bloquer`, `blocked` absents du mobile |
| Fil Pour vous, Récents, mot-dièse ; Liste et Immersion | Présent | `/fil` | `FeedScreen` | `src/screens/feed-screen.tsx` |
| Composer une publication | Partiel | composeur avec médias | texte seul | `src/screens/compose-screen.tsx` (`mobile.compose.textOnly`) ; `convex/modules/media/media.ts` (`generateUploadUrl`) non appelé |
| Réactions | Présent | fil | carte de publication | `src/screens/feed-screen.tsx` (`toggleReaction`) |
| Commentaires, réponses, retrait des siens | Présent | fil | `CommentsSection` | `src/screens/comments-section.tsx` |
| Signaler un commentaire | Absent | fil | — | `convex/modules/moderation/moderation.ts` (`reportComment`) non appelé |
| Partage par lien et citation | Présent | fil | feuille de partage du système | `src/screens/post-actions.tsx` (`Share.share`, `sharedPostId`) |
| Masquer, sourdine, signaler, épingler, supprimer | Présent | menu de publication | `PostOverflowAction` | `src/screens/post-actions.tsx` |
| Modifier une publication | Absent | fil | — | `convex/modules/posts/posts.ts` (`edit`) non appelé |
| Signets | Présent | `/moi` | `BookmarksScreen` | `src/screens/profile-screens.tsx` |
| Suggestions de personnes et de pages | Présent | fil | fil vide | `src/screens/feed-screen.tsx` (`FeedSuggestions`) |
| Recherche | Partiel | recherche globale | publications seules | `src/screens/search-screen.tsx` (`posts.search`) |
| Stories : lecture, plat du jour | Partiel | `/actus` | lecture native, création par renvoi web | `src/screens/stories-section.tsx`, `nativeWebRoutes.storyCreate` |
| Clips | Présent | `/clips` | `MediaFeedScreen` vidéo | `src/screens/media-feed-screen.tsx` |
| Explorer (grille de médias) | Présent | `/explorer` | `MediaFeedScreen` médias | idem |
| Directs et conférences | Absent | `/direct/[id]`, `/conference/[id]` | — | motifs `live`, `direct`, `conference` absents de `src/screens` |
| Profil public : identité, badges calculés, publications | Présent | `/profil/[handle]`, `/@handle` | `PublicProfileScreen` | `src/screens/profile-screens.tsx` |
| Suivre, se connecter, écrire depuis un profil | Partiel | profil | suivre ou se connecter depuis les suggestions seulement | `src/screens/feed-screen.tsx` (`follow`, `requestConnection`) ; aucune action dans `profile-screens.tsx` |
| Albums | Absent | `/[publicHandle]/albums/[albumId]` | — | motif `album` absent de `src/screens` |
| Espace « Moi » | Partiel | `/moi` | 13 entrées, 10 par renvoi web | `src/lib/native-profile-view.ts` (`NATIVE_PROFILE_ENTRIES`) |
| Boîte iCom personnelle | Présent | `/messages` | `MessagesScreen` | `src/screens/messages-screen.tsx` |
| Conversation : lecture, envoi de texte | Partiel | `/messages/…` | texte seul ; ni pièce jointe, ni vocal, ni réponse, ni réaction, ni édition, ni suppression | `src/screens/conversation-screen.tsx` ; `convex/modules/messaging/messages.ts` (`generateAttachmentUploadUrl`, `editMessage`, `deleteMessage`) non appelés |
| Nouvelle conversation | Absent | profil, iCom | — | aucune action de création dans `messages-screen.tsx` ni `profile-screens.tsx` |
| Groupes iCom, iCom Pro, conversations commerciales | Absent | `/messages/commerce/…` | — | `mobile.messages.personalOnly` (`src/i18n/fr.json`) |
| Appels audio et vidéo | Fermé | iAppel | CallKit, PushKit, Core-Telecom, LiveKit écrits | `eas.json` (`NATIVE_CALLS_ENABLED=false`), `src/calls/`, `modules/antsia-call-system/` ; ouverture : clés LiveKit, APNs, FCM, `NOTIFICATION_APPLICATIONS_JSON`, recette P17d |
| Pages : lecture, suivi | Présent | `/page/[handle]` | `PageScreen` ; gestion par renvoi web | `src/screens/page-screen.tsx` |
| Annuaire des associations | Présent | Découvrir | section native | `src/screens/association-directory-section.tsx` |
| Groupes thématiques, évènements | Absent | `/groupes`, `/evenements` | — | motifs `group`, `event`, `évènement` absents de `src/screens` |
| Boutiques : annuaire, vitrine, catalogue, filtres, tri | Présent | `/boutique/[handle]`, `/marketplace` | sections natives | `src/screens/shop-directory-section.tsx`, `src/screens/shop-screen.tsx` |
| Fiche d'offre : prix XAF, variantes, disponibilité | Présent | `/boutique/…/offres/[offerRef]` | lecture ; actions par renvoi web | `src/screens/offer-screen.tsx` |
| Contact vendeur, devis, rendez-vous, panier, achats | Absent | `/boutique/…/contacter`, `devis`, `rendez-vous`, `/panier`, `/mes-achats` | renvoi web | `src/lib/routes.ts` (`accountPaths`) |
| Paiements en ligne | Fermé | `/mes-paiements` | — | porte du projet : aucun prestataire contracté |
| Mes activités (mes pages, mes boutiques) | Présent | `/mes-boutiques` | lecture native | `src/screens/explore-screen.tsx` (`MyActivities`) |
| Restauration, emploi, professionnels, presse, rédaction, mes médias | Absent | `/restauration`, `/mes-candidatures`, `/professionnels`, `/presse`, `/redaction`, `/mes-medias` | — | aucune route native correspondante dans `NativeRoute` |
| Cloche : liste, non lus, tout lire, ouverture | Présent | `/notifications/ouvrir` | `NotificationsScreen` | `src/screens/notifications-screen.tsx`, `src/lib/native-notifications.ts` |
| Push social | Absent | push Web | aucune inscription d'appareil hors appels | backend prêt : `convex/modules/notifications/transports.ts` (`sendExpo`, `sendFcm`, `sendApns`) ; aucune dépendance `expo-notifications` ; `POST_NOTIFICATIONS` bloqué dans `app.config.ts` |
| Pastille sur l'icône, catégories, réponse depuis la notification | Absent | — | — | motifs `badge`, `setBadge`, `category`, `UNNotificationCategory` absents hors module d'appel |
| Liens profonds à chaud | Partiel | — | publication, conversation, 7 destinations | `src/lib/routes.ts` (`nativeRouteFromUrl`) ; ni profil, ni page, ni boutique |
| Lien ouvert application fermée | Absent | — | — | `src/app.tsx` écoute `Linking` mais n'appelle jamais `getInitialURL` |
| Liens universels `https` | Absent | — | — | ni `associatedDomains` ni `intentFilters` dans `app.config.ts` |
| Partage vers ANTSIA depuis une autre application | Absent | — | — | aucune extension ni cible de partage déclarée |
| Appareil photo, galerie multiple, recadrage | Absent | composeur web | — | aucune dépendance `expo-image-picker` ou `expo-camera` ; `CAMERA` bloqué (`app.config.ts`) |
| Envoi en arrière-plan avec reprise | Absent | — | — | aucun dépôt de fichier natif (README) |
| Lecture hors ligne, cache d'images | Absent | — | contenu privé masqué hors ligne, par choix | README § Périmètre ; `Image` de React Native sans cache maîtrisé |
| Tirer pour actualiser | Présent | — | fil, messages, notifications | `onRefresh` dans `feed-screen.tsx`, `messages-screen.tsx`, `notifications-screen.tsx` |
| Retour haptique | Absent | — | — | motifs `Haptic`, `Vibration` absents |
| Retour Android et geste de retour iOS | Partiel | — | bouton retour Android ; pas de balayage iOS (pile maison) | `src/app.tsx` (`BackHandler`, `history`) |
| Clavier logiciel | Présent | — | champs visibles, touche Rechercher | `KeyboardAvoidingView`, `automaticallyAdjustKeyboardInsets` ; recette iOS 8 |
| Mode sombre suivant le système, sept thèmes | Présent | — | `userInterfaceStyle: automatic` | `src/appearance.tsx`, `packages/ui/src/themes/antsia-native.ts`, `scripts/sync-native-theme-tokens.mjs` |
| Taille de texte du système | Partiel | — | lue pour couper l'Immersion, sans audit d'ensemble | `fontScale` dans `feed-screen.tsx`, `media-feed-screen.tsx` |
| Lecteur d'écran, mouvements réduits | Partiel | — | annonces, cibles 44 px, `reduceMotion` ; aucun score mesuré | `src/components/ui.tsx` ; rapport P18 |
| Retour d'arrière-plan sans perte d'état | Absent | — | tout état autre que `active` ferme l'état privé ; le retour remonte tout | `src/lib/session-controller.ts` (écouteur `AppState`) |
| Déverrouillage biométrique | Absent | — | — | `faceIDPermission: false` (`app.config.ts`) ; motif `LocalAuthentication` absent |
| Mise à jour forcée, mise à jour à distance | Absent | — | — | `updates: { enabled: false }` (`app.config.ts`) ; aucune version minimale lue |
| Profils de compilation `telephone`, `simulateur`, `testflight` | Présent | — | — | `apps/antsia_mobile/eas.json`, `native-build.json`, `scripts/prepare-build.mjs` |
| Binaire compilé depuis `main` | Absent | — | — | dossier de reprise § 8.5 ; `docs/recette/integration-ios-2026-11-02/RAPPORT.md` |
| Fiches des boutiques, étiquettes de confidentialité, âge | Absent | — | — | motifs `Data safety`, `App Privacy`, `fiche App Store`, `classification d'âge` : aucun résultat dans `docs/` ni l'application |

Décompte : **Présent 27 · Partiel 13 · Absent 26 · Fermé 2** (68 capacités). Dans ce tableau, `src/…` désigne `apps/antsia_mobile/src/…`.

### Ce qui est écrit mais jamais recetté en réel

| Sujet | Dernier constat | Source |
|---|---|---|
| iOS en ligne | TestFlight 0.1.0 (13), bêta publique, version App Store en `PREPARE_FOR_SUBMISSION`, rien soumis | reprise § 2.2, § 3.4 ; `docs/recette/icone-ios-2026-11-02/RAPPORT.md` |
| Builds 10 à 13 | IPA précédent modifié puis signé, **sans compilation native** ; `main` reproduit le bytecode du build 13 à l'octet | `docs/recette/integration-ios-2026-11-02/RAPPORT.md` |
| Android | APK code 2 hébergé (21/10) ; `main` porte le code 3 ; aucun AAB | reprise § 2.2 |
| IDN sur iPhone | Retour réussi **déclaré par le propriétaire** sur le build 6 (24/10), non observé indépendamment | `docs/recette/mobile-demo-2026-10-24/idn-iphone-user-confirmation.json` |
| IDN sur Android | Confirmé par le propriétaire sur émulateur (21/10) ; téléphone physique non fait | vault `recette-idn-android-assistee-2026-10-21.md` |
| Parité | Cinq destinations ouvertes une à une et comparaison du fil membre : non confirmées (26/10) | vault `ios12-controle-simulateur-2026-10-26.md` |
| Appels natifs, push | Sources seules ; P17d : 46 cas, tous non exécutés | `docs/etudes/2026-10-18-social-commerce/rapports/P17D_REPRISE_2026-10-20.md` |
| Écran verrouillé | Trousseau `WHEN_UNLOCKED_THIS_DEVICE_ONLY` : réponse à un appel verrouillé non prouvée | `src/lib/secure-storage.ts`, README du module d'appel |
| Accessibilité | Corrections P18 sans score AA | `rapports/P18_REPRISE_2026-10-20.md` |

## 3. Comparaison avec les applications de référence

« n. a. » = je ne l'affirme pas de mémoire.

| Capacité | Instagram | WhatsApp | TikTok | Facebook | ANTSIA | Verdict |
|---|---|---|---|---|---|---|
| Push avec catégories et ouverture sur l'écran exact | oui | oui | oui | oui | absent | À faire (MB-08) |
| Répondre depuis la notification | messages | oui | n. a. | Messenger | absent | À faire, messages seulement (MB-08) |
| Pastille de non-lus sur l'icône | oui | oui | oui | oui | absent | À faire (MB-08) |
| Écran d'appel du système, appel en arrière-plan | oui | oui | n. a. | Messenger | fermé | À adapter : ouverture après recette physique (MB-17) |
| Composer avec l'appareil photo | oui | oui | oui | oui | absent | À faire (MB-09) |
| Galerie à sélection multiple, recadrage | oui | oui | oui | oui | absent | À faire, recadrage simple (MB-09) |
| Envoi en arrière-plan avec progression | oui | oui | oui | oui | absent | À faire (MB-10) |
| Mode économie de données | oui | réglage du téléchargement automatique | oui | oui | absent | À faire, différenciant au Gabon (MB-18) |
| Lecture hors ligne (derniers messages, médias en cache) | partiel | oui | partiel | partiel | absent par choix | À adapter : décision 3 (MB-18) |
| Liens universels vers publication, profil, boutique | oui | oui | oui | oui | absent | À faire (MB-13) |
| Partager vers l'application | oui | oui | oui | oui | absent | Reporté P3 (MB-23) |
| Verrou biométrique | n. a. | oui | n. a. | n. a. | absent | Reporté P3 (MB-22) |
| Plusieurs comptes sur un téléphone | oui | n. a. | oui | oui | démo seulement | Écarté : une personne, un handle (§ 4.4) |
| Nouvelle conversation depuis un profil | oui | oui | oui | oui | absent | À faire (MB-11, MB-12) |
| Photo et vocal dans les messages | oui | oui | oui | oui | absent | À faire (MB-11) |
| Bloquer et signaler (personne, commentaire, message) | oui | oui | oui | oui | signalement de publication seul | À faire, exigé par les boutiques (MB-04) |
| Supprimer son compte depuis l'application | oui | oui | oui | oui | renvoi web | À faire, exigé par Apple (MB-04) |
| Mode sombre du système, taille du texte | oui | oui | oui | oui | mode oui, texte partiel | À adapter (MB-20) |
| Geste de retour par balayage (iOS) | oui | oui | oui | oui | absent | À faire (MB-21) |
| Retour en arrière-plan sans perte d'écran | oui | oui | oui | oui | perte | À faire (MB-07) |
| Démonstration sans compte | non | non | lecture anonyme | non | huit comptes fictifs | Déjà fait, à garder (MB-24) |

## 4. Ce qui manque

### 4.1 Bloquant avant l'ouverture au public

1. Aucun binaire compilé depuis `main` (iOS 14, Android code 3) ; aucun essai sur téléphone physique observé (MB-02, MB-03, MB-06).
2. Exigences des boutiques pour les contenus d'utilisateurs : bloquer une personne, signaler commentaire, profil et message, supprimer son compte depuis l'application (MB-04).
3. Dossier des boutiques : étiquettes de confidentialité Apple, formulaire de sécurité des données Google, classification d'âge (16 ans, ordonnance 0011), notes pour la vérification, captures (MB-05).
4. Retour d'arrière-plan : tout état autre que `active` (y compris `inactive` sous iOS, centre de contrôle, invite système) ferme l'état privé et remonte l'application. À mesurer sur appareil, puis corriger (MB-07).
5. Matrice de parité tenue par le code, pour ne plus rien affirmer sans preuve (MB-01).

### 4.2 Attendu par les utilisateurs

Push social réel (MB-08) ; photos et vidéos dans le composeur (MB-09) et envoi en arrière-plan (MB-10) ; iCom : nouvelle conversation, photo, réponse, suppression pour soi, groupes (MB-11) ; actions de relation sur un profil (MB-12) ; liens profonds froids et universels (MB-13) ; recherche de personnes, pages et boutiques (MB-14) ; réglages natifs (notifications, apparence écrite sur le compte) (MB-15) ; version minimale exigée (MB-16) ; accessibilité mesurée et retour haptique (MB-20) ; geste de retour iOS et défilement conservé (MB-21).

### 4.3 Différenciant pour ANTSIA

- **Faible débit** : mode économie de données (pas de lecture automatique des vidéos sur réseau mobile, images réduites), cache d'images borné, file d'envoi qui survit à une coupure (MB-10, MB-18). Les références le font en option ; au Gabon, c'est la règle (cahier § 2, étude sept univers : 88,9 % des connexions en 3G à 5G).
- **Identité vérifiée** : entrée IDN native déjà faite ; la garder comme voie principale et l'afficher dans la fiche des boutiques.
- **Confiance** : badges calculés côté serveur, aucun contenu dans la notification (règle du moteur), aucune publicité dans la messagerie : à écrire tels quels dans la fiche de confidentialité (MB-05).
- **Démonstration intégrée** : huit comptes fictifs sans saisie de code réel (`latestOtp` du backend démo). Utile pour la vérification d'Apple et de Google, les salons et les formations (MB-24).

### 4.4 Écarté ou reporté, et pourquoi

| Sujet | Décision | Raison |
|---|---|---|
| Plusieurs comptes personnels sur un téléphone | Écarté | Invariant « une personne, un handle » ; parler au nom d'une page relève du plan 07 |
| Achat ou abonnement dans l'application | Écarté | Paiements fermés ; vente de services numériques (pages premium, sponsorisé) soumise aux règles d'achat intégré d'Apple : rester sur le web (décision 6) |
| Rencontres | Écarté | Porte fermée du projet |
| Chiffrement de bout en bout | Reporté | Exige un lot de décision (`05_MESSAGES_ET_APPELS.md` § 7) ; ne rien annoncer |
| Plein écran d'appel Android | Reporté | `fullScreen:false` volontaire (README du module) |
| Groupes, évènements, directs, univers natifs | Reporté, P3 par surface | Après le web et leur plan (MB-25) |
| Application DIASPORALE | Hors périmètre | Plan 15 ; le dossier `apps` du dépôt DIASPORALE ne contient que `diasporale_com` |

## 5. Lots d'implémentation

Toute nouvelle dépendance native passe par le catalogue du `package.json` racine et `bun.lock` : **demande à S1**. Toute compilation EAS, soumission TestFlight ou envoi d'un binaire : **accord écrit du propriétaire**, avec le commit, la commande et le coût de quota.

### MB-01 — Matrice de parité tenue par le code · priorité P0 · taille M · session S3
- **Pour l'utilisateur** : rien de visible ; le propriétaire sait enfin ce que l'application fait ou renvoie au web.
- **Backend** : aucun.
- **Web** : aucun.
- **Mobile** : `apps/antsia_mobile/src/lib/parity.ts` liste chaque route de `apps/antsia_ga/src/lib/routes.ts` avec un état (`native`, `renvoi`, `absent`, `ferme`) et l'écran natif. Test `parity.test.ts` : lit le fichier de routes web par `fs` (aucun import croisé) et échoue si une route n'a pas d'entrée. Recette au simulateur (lots 3.0 et 3.1 du dossier de reprise) : web à 402 × 874 contre simulateur, cinq destinations une à une ; rapport `docs/recette/parite-mobile-<date>/RAPPORT.md` : identique, écart, absent.
- **Données personnelles** : aucune.
- **Tests et cliquets** : `parity.test.ts` ; `bun run verify`.
- **Critères d'acceptation** : chaque route web a une entrée ; le rapport couvre les cinq destinations, le fil, l'Immersion, les Stories, iCom, le profil, les notifications, la démo ; aucune correction avant l'avis du propriétaire.
- **Dépend de** : rien. **Porte** : aucune (backend local et variables : accord du propriétaire).

### MB-02 — Premier binaire iOS depuis `main` (build 14) · priorité P0 · taille M · session S3
- **Pour l'utilisateur** : la bêta TestFlight porte le code de `main`, plus un IPA retouché.
- **Backend** : aucun.
- **Web** : aucun.
- **Mobile** : `buildNumber` 14 dans `app.config.ts` ; `prepare-build.mjs` avec les références `origin/main` d'ANTSIA et de DIASPORALE (jamais `HEAD`) ; `eas build --local --profile testflight --platform ios` (quota distant épuisé constaté le 21/10). Contrôle : démarrage UIScene, icône, entrée, IDN visible, démo connectée, sur simulateur (profil `simulateur`).
- **Données personnelles** : aucune.
- **Tests et cliquets** : `build-config.test.ts`, `native-plugin.test.ts`, `scene-plugin.test.ts`, `prepare-ios-signing.test.mjs` ; `altool --validate-app`.
- **Critères d'acceptation** : IPA 14 signé, `VERIFY SUCCEEDED` ; empreinte du bundle Hermes consignée ; démarrage et connexion démo constatés ; soumission seulement après second accord, repli `altool` si EAS reste en file (reprise § 8.5).
- **Dépend de** : MB-01 (pas bloquant). **Porte** : accord du propriétaire (compilation), second accord (TestFlight) ; disque ≥ 20 Go libres.

### MB-03 — Android depuis `main` : APK puis AAB · priorité P0 · taille M · session S3
- **Pour l'utilisateur** : une application Android à jour, puis publiable sur Google Play.
- **Backend** : aucun.
- **Web** : aucun.
- **Mobile** : APK `versionCode` 3 (ou suivant) profil `telephone` ; essai sur l'émulateur `ANTSIA_Android` : connexion, fil, arrière-plan puis retour, sans plantage (piège PR 33). Puis AAB profil `testflight` (déjà `app-bundle`) et niveau d'API cible exigé par Google, à relire au moment du lot.
- **Données personnelles** : aucune.
- **Tests et cliquets** : tests de configuration ; journal `crash` vide après arrière-plan.
- **Critères d'acceptation** : APK et AAB signés depuis `main` ; aucun plantage constaté ; empreintes consignées.
- **Dépend de** : aucune. **Porte** : accord du propriétaire ; compte Google Play (propriétaire).

### MB-04 — Exigences des boutiques : bloquer, signaler, supprimer son compte · priorité P0 · taille M · session S3
- **Pour l'utilisateur** : depuis un profil, un commentaire ou une conversation : signaler, bloquer, débloquer ; dans Profil → Compte : supprimer son compte sans quitter l'application.
- **Backend** : existant, à relire : `graph/connections.ts` (`blockPerson`, `unblockPerson`), `moderation/moderation.ts` (`reportComment`), `moderation/cases.ts` (`report`), `people/erasure.ts` (`requestErasure`). Si un signalement de message ou de profil manque : issue [S1], plan 12.
- **Web** : aucun.
- **Mobile** : actions dans `profile-screens.tsx`, `comments-section.tsx`, `conversation-screen.tsx` ; liste des personnes bloquées dans les réglages ; écran de suppression avec double confirmation et texte de conséquences, même règle que `personal-controls.tsx`. Lien de contact du réseau visible (exigence des contenus d'utilisateurs).
- **Données personnelles** : l'effacement suit l'inventaire du moteur ; le natif purge son coffre après succès (porte de sortie existante).
- **Tests et cliquets** : tests des gestes (garde de session, refus indistinct) ; `sign-out-everywhere` reste vert.
- **Critères d'acceptation** : un membre bloqué disparaît du fil et ne peut plus écrire ; un signalement de commentaire arrive dans la file du plan 12 ; la suppression aboutit sans renvoi web ; FR et EN.
- **Dépend de** : plans 05 (blocage), 06 (effacement), 12 (signalement). **Porte** : aucune.

### MB-05 — Dossier des boutiques d'applications · priorité P0 · taille M · session S3 + propriétaire
- **Pour l'utilisateur** : une fiche honnête dans l'App Store et Google Play.
- **Backend** : aucun.
- **Web** : la page `confidentialite` doit nommer les données réellement traitées par l'application (S1, plan 13).
- **Mobile** : `docs/boutiques/` : inventaire des données collectées tiré du code (session, identifiant d'appareil des appels, jetons push, médias), étiquettes Apple et formulaire Google qui en découlent, manifeste de confidentialité iOS à vérifier dans le binaire 14, textes FR et EN, captures des cinq destinations (sept thèmes, clair et sombre), classification d'âge visée 16 ans, notes pour la vérification (comptes de démonstration, IDN), adresse d'assistance.
- **Données personnelles** : c'est l'objet du lot ; aucune donnée réelle dans les captures (comptes fictifs).
- **Tests et cliquets** : relecture croisée inventaire ↔ code ; aucune promesse non prouvée (appels, chiffrement).
- **Critères d'acceptation** : chaque donnée déclarée est reliée à un fichier du code ; aucune capacité fermée n'est annoncée.
- **Dépend de** : MB-02, MB-03, MB-04. **Porte** : propriétaire (comptes des boutiques, entité éditrice, assistance) ; juriste pour l'âge (SU01b, SU01c).

### MB-06 — Essais sur appareils physiques · priorité P0 · taille S · session S3 + propriétaire
- **Pour l'utilisateur** : la preuve que l'application tient sur un vrai téléphone, en 3G.
- **Backend** : aucun. **Web** : aucun.
- **Mobile** : liste courte dans `docs/recette/appareils-<date>/` : installation, IDN réel (le propriétaire saisit lui-même), fil, Immersion, clavier, envoi de message, arrière-plan et retour, mode avion puis retour, VoiceOver ou TalkBack sur trois écrans. Le registre P17d sert de modèle d'observation (appareil, OS, build, heure).
- **Données personnelles** : comptes du propriétaire et fictifs ; aucune capture de contenu privé publiée.
- **Tests et cliquets** : aucun nouveau.
- **Critères d'acceptation** : chaque ligne porte appareil, OS, build et constat ; rien n'est déclaré réussi sans observation.
- **Dépend de** : MB-02, MB-03. **Porte** : présence du propriétaire ; disque ≥ 15 Go avant de brancher l'iPhone (piège `iOS DeviceSupport`).

### MB-07 — Retour d'arrière-plan sans perte d'état · priorité P0 · taille M · session S3
- **Pour l'utilisateur** : revenir dans l'application retrouve le même écran, le même défilement et le brouillon en cours.
- **Backend** : aucun.
- **Web** : aucun.
- **Mobile** : mesurer d'abord sur appareil (MB-06) les transitions `inactive` et `background`. Puis, dans `session-controller.ts` : ne traiter que `background` comme sortie de premier plan ; conserver la pile `history`, la portée du fil et les brouillons en mémoire de la personne et de la session ; garder les clients fermés en arrière-plan si la sécurité l'exige, mais restaurer l'écran au retour sans repasser par l'accueil.
- **Données personnelles** : aucun brouillon écrit sur disque sans décision (décision 3).
- **Tests et cliquets** : test du contrôleur (arrière-plan, `inactive`, retour) ; sur le modèle du harnais `controller-regression.json` du 24/10 (hors suite courante, `docs/recette/mobile-demo-2026-10-24/`).
- **Critères d'acceptation** : centre de contrôle ouvert puis fermé : écran inchangé ; passage de 2 minutes dans une autre application : même écran, même défilement ; sortie toujours effective.
- **Dépend de** : MB-06. **Porte** : aucune.

### MB-08 — Push social réel · priorité P1 · taille L · session S3 + S1
- **Pour l'utilisateur** : réaction, commentaire, message, demande de relation arrivent sur le téléphone fermé ; un toucher ouvre l'écran exact ; pastille sur l'icône ; réponse rapide à un message.
- **Backend** (S1) : réutiliser `pushSubscriptions.subscribe` avec `apns` et `fcm` (déjà validés) ; entrées `native` de `NOTIFICATION_APPLICATIONS_JSON` ; vérifier que le contenu neutre (`NeutralNotificationPayload`) suffit à ouvrir la cible via `open.ts` ; compteur pour la pastille sans contenu.
- **Web** : aucun.
- **Mobile** : dépendance `expo-notifications` (jeton d'appareil natif, pas le service Expo, décision 1) ; débloquer `POST_NOTIFICATIONS` ; demande d'autorisation au geste, jamais au démarrage ; inscription liée à la session (désinscription à la sortie, comme les appels) ; catégories alignées sur les six réglages du moteur ; ouverture à froid et à chaud vers `NativeRoute` ; réponse depuis la notification pour les messages, par `sendMessage` idempotent.
- **Données personnelles** : jeton d'appareil dans `pushSubscriptions` : déjà dans l'export et l'effacement (à revérifier par `erasure.test.ts`) ; aucun contenu social ni contact dans la notification (cliquet `notification-payload-content`).
- **Tests et cliquets** : tests d'inscription, d'ouverture et de sortie ; `notification-payload-content`.
- **Critères d'acceptation** : sur appareil, notification reçue application fermée, ouverture de la bonne publication ou conversation, pastille juste ; « envoyé » n'est jamais présenté comme « reçu ».
- **Dépend de** : MB-02, MB-03, plan 06 (préférences, plafond). **Porte** : clés APNs et compte Firebase du propriétaire.

### MB-09 — Photos et vidéos dans le composeur · priorité P1 · taille L · session S3
- **Pour l'utilisateur** : publier une ou plusieurs photos ou une vidéo, depuis la galerie ou l'appareil photo, avec recadrage simple et texte alternatif.
- **Backend** : existant : `media/media.ts` (`generateUploadUrl`), `posts.publish` avec médias, garde des fichiers (`assertFreshUpload`, `admitStoredUpload`) ; rien à créer si les règles du plan 02 sont tenues.
- **Web** : aucun.
- **Mobile** : dépendances `expo-image-picker`, `expo-image-manipulator` ; mentions `NSPhotoLibraryUsageDescription`, `NSCameraUsageDescription` (FR, EN) ; débloquer `CAMERA` ; compression avant envoi (faible débit) ; mêmes limites de nombre et de taille que le web ; brouillon conservé si l'envoi échoue.
- **Données personnelles** : métadonnées de localisation retirées avant envoi ; fichiers déposés suivent l'effacement existant.
- **Tests et cliquets** : `upload-policy`, `fresh-upload`, `storage-arg-freshness` restent verts ; tests du parcours d'intention idempotente.
- **Critères d'acceptation** : trois photos publiées en 3G simulée ; fichier refusé par l'antivirus affiché « retenu » ; aucune URL de fichier reconstruite côté natif.
- **Dépend de** : plans 02 (composeur) et 03 (chaîne des médias). **Porte** : aucune.

### MB-10 — Envoi en arrière-plan avec reprise · priorité P1 · taille M · session S3
- **Pour l'utilisateur** : l'envoi d'une vidéo continue si l'on change d'application et reprend après une coupure.
- **Backend** : aucun nouveau ; clé d'idempotence existante.
- **Web** : aucun.
- **Mobile** : file d'envoi bornée (5 éléments), session de transfert d'arrière-plan du système, progression visible, reprise au retour, abandon explicite.
- **Données personnelles** : la file ne contient que des fichiers choisis par la personne ; purge à la sortie du compte.
- **Tests et cliquets** : tests de la file (coupure, sortie, double envoi).
- **Critères d'acceptation** : vidéo de 30 s envoyée en passant 1 minute dans une autre application ; aucun doublon.
- **Dépend de** : MB-09, MB-07. **Porte** : décision 3 (écriture sur disque).

### MB-11 — iCom natif, premier niveau · priorité P1 · taille L · session S3
- **Pour l'utilisateur** : écrire à quelqu'un depuis son profil, envoyer une photo, répondre à un message précis, supprimer pour soi, lire et écrire dans ses groupes.
- **Backend** : existant : `messaging/messages.ts` (`generateAttachmentUploadUrl`, `sendMessage`, `deleteMessageForMe`, `editMessage`) ; création de fil et groupes selon le plan 01.
- **Web** : aucun.
- **Mobile** : bouton « Écrire » sur le profil ; pièce jointe image ; réponse citée ; menu d'un message ; groupes en lecture et écriture ; vocal après décision du plan 01.
- **Données personnelles** : pièces jointes sous la garde des fichiers ; effacement existant.
- **Tests et cliquets** : `file-delivery-gate`, `rate-limited-writes`.
- **Critères d'acceptation** : les gestes ci-dessus aboutissent entre deux comptes de démonstration ; aucune publicité, aucun contenu dans la notification.
- **Dépend de** : plan 01, MB-09. **Porte** : aucune.

### MB-12 — Relations sur le profil · priorité P1 · taille S · session S3
- **Pour l'utilisateur** : suivre, se connecter, écrire, depuis le profil d'une personne.
- **Backend** : existant : `graph/follows.ts`, `graph/connections.ts`.
- **Web** : aucun.
- **Mobile** : barre d'actions de `PublicProfileScreen`, état relu côté serveur, un seul bouton plein.
- **Données personnelles** : aucune nouvelle.
- **Tests et cliquets** : tests des gestes.
- **Critères d'acceptation** : mêmes états que le web pour un profil connecté, en attente, suivi, bloqué.
- **Dépend de** : plan 05. **Porte** : aucune.

### MB-13 — Liens profonds froids et universels · priorité P1 · taille M · session S3 + S1
- **Pour l'utilisateur** : un lien ANTSIA reçu par SMS ou sur un autre réseau ouvre la publication, le profil, la page ou la boutique dans l'application.
- **Backend** : aucun.
- **Web** (S1) : fichiers `.well-known` d'association (Apple et Android) servis par le site, sur le domaine définitif.
- **Mobile** : `getInitialURL` au démarrage, gardé par la session ; `nativeRouteFromUrl` étendu à `profil`, `page`, `boutique`, `offre` ; `associatedDomains` et `intentFilters` dans `app.config.ts` ; repli sur l'entrée publique si la personne n'est pas connectée.
- **Données personnelles** : aucun jeton ni droit dans un lien (règle existante).
- **Tests et cliquets** : `routes.test.ts` étendu ; `no-hardcoded-urls`.
- **Critères d'acceptation** : lien froid et lien chaud ouvrent le bon écran ; un lien malformé ouvre le fil.
- **Dépend de** : domaine de production (plan 13). **Porte** : domaine `antsia.ga` branché (propriétaire).

### MB-14 — Recherche complète · priorité P1 · taille S · session S3
- **Pour l'utilisateur** : chercher une personne, une page, une boutique, un mot-dièse.
- **Backend** : selon le plan 03. **Web** : aucun.
- **Mobile** : onglets de résultats dans `search-screen.tsx`, mêmes requêtes que le web.
- **Données personnelles** : aucune ; pas d'historique de recherche stocké sans décision.
- **Tests et cliquets** : tests d'écran.
- **Critères d'acceptation** : mêmes premiers résultats que le web pour trois requêtes de démonstration.
- **Dépend de** : plan 03. **Porte** : aucune.

### MB-15 — Réglages natifs · priorité P1 · taille M · session S3
- **Pour l'utilisateur** : régler ses notifications et sa confidentialité dans l'application ; le thème et la langue suivent le compte sur tous les appareils.
- **Backend** : existant : `people/preferences.ts` (`setMyPreferences`), `notifications/preferences.ts` (`update`).
- **Web** : aucun.
- **Mobile** : `NativeSettings` écrit le thème et la langue sur le compte ; section notifications par catégorie ; personnes bloquées (MB-04) ; lien direct « Mes données ».
- **Données personnelles** : préférences déjà dans l'export.
- **Tests et cliquets** : tests d'écriture idempotente.
- **Critères d'acceptation** : un thème choisi au téléphone apparaît sur le web après rechargement.
- **Dépend de** : plan 06. **Porte** : aucune.

### MB-16 — Version minimale et mises à jour · priorité P1 · taille M · session S1 + S3
- **Pour l'utilisateur** : un écran clair « Mettez ANTSIA à jour » quand une ancienne version ne peut plus fonctionner.
- **Backend** (S1) : requête publique bornée qui renvoie la version minimale par plateforme, lue dans l'environnement (aucune table).
- **Web** : aucun.
- **Mobile** : lecture au démarrage, écran bloquant avec lien vers la boutique ; décision sur la mise à jour à distance du JavaScript (`expo-updates`, décision 2).
- **Données personnelles** : aucune.
- **Tests et cliquets** : tests de comparaison de versions.
- **Critères d'acceptation** : un build sous le minimum affiche l'écran ; au-dessus, rien ne change.
- **Dépend de** : MB-02. **Porte** : décision 2.

### MB-17 — Ouverture des appels natifs · priorité P2 · taille L · session S3 + S1
- **Pour l'utilisateur** : un appel ANTSIA sonne comme un appel téléphonique, même écran verrouillé.
- **Backend** (S1) : configuration LiveKit, APNs VoIP, FCM ; `NOTIFICATION_APPLICATIONS_JSON` avec `calls: true`.
- **Web** : aucun.
- **Mobile** : binaire avec `NATIVE_CALLS_ENABLED=true`, `APNS_ENVIRONMENT`, `NATIVE_FIREBASE_CONFIG_PATH` ; recette P17d complète (46 cas) sur deux iPhone et deux Android ; décision sur la réponse écran verrouillé (trousseau).
- **Données personnelles** : liaison d'appareil déjà purgée à la sortie (`call-controller.ts`).
- **Tests et cliquets** : `native:acceptance` (dossier P17d à restaurer dans `main`, § 8).
- **Critères d'acceptation** : P17d complet sur appareils ; aucune annonce avant.
- **Dépend de** : MB-02, MB-03, MB-08, plan 01. **Porte** : clés LiveKit, APNs, FCM (propriétaire).

### MB-18 — Faible débit et lecture hors ligne · priorité P2 · taille M · session S3
- **Pour l'utilisateur** : un réglage « Économiser les données » ; les images déjà vues s'affichent sans réseau.
- **Backend** : variantes d'images réduites si le plan 03 les fournit.
- **Web** : aucun.
- **Mobile** : `expo-image` (cache disque borné, purgé à la sortie) ; pas de lecture automatique de vidéo sur réseau mobile en mode économie ; dernière fenêtre du fil lisible hors ligne **seulement si la décision 3 l'autorise**.
- **Données personnelles** : cache chiffré par le système, effacé à la sortie et à la suppression du compte.
- **Tests et cliquets** : tests de purge à la sortie.
- **Critères d'acceptation** : mode avion : images en cache visibles, aucune donnée d'un autre compte.
- **Dépend de** : MB-07, plan 03. **Porte** : décision 3.

### MB-19 — Créer une Story dans l'application · priorité P2 · taille M · session S3
- **Pour l'utilisateur** : publier une Story photo sans passer par le site.
- **Backend** : existant (`stories`), règles du plan 03. **Web** : aucun.
- **Mobile** : réutilise le sélecteur de MB-09 ; remplace le renvoi `storyCreate`.
- **Données personnelles** : expiration existante.
- **Tests et cliquets** : garde des fichiers.
- **Critères d'acceptation** : Story visible sur le web et au téléphone, expirée à l'échéance.
- **Dépend de** : MB-09, plan 03. **Porte** : aucune.

### MB-20 — Accessibilité mesurée et retour haptique · priorité P1 · taille M · session S3
- **Pour l'utilisateur** : l'application se lit au lecteur d'écran et en grand texte ; un léger retour tactile confirme les gestes importants.
- **Backend** : aucun. **Web** : aucun.
- **Mobile** : audit VoiceOver et TalkBack des cinq destinations ; texte à 200 % sans coupure ; contraste des sept thèmes ; `expo-haptics` sur réaction, envoi, erreur, respectant le réglage du système.
- **Données personnelles** : aucune.
- **Tests et cliquets** : `accessibility.test.ts` étendu.
- **Critères d'acceptation** : rapport daté par écran ; aucune action sans libellé.
- **Dépend de** : MB-06. **Porte** : aucune.

### MB-21 — Navigation native : geste de retour, défilement conservé · priorité P2 · taille M · session S3
- **Pour l'utilisateur** : balayer depuis le bord pour revenir ; retrouver sa place dans le fil.
- **Backend** : aucun. **Web** : aucun.
- **Mobile** : geste de retour sur la pile `history` existante ou pile native (décision 4) ; position de défilement mémorisée par route.
- **Données personnelles** : aucune.
- **Tests et cliquets** : tests de la pile (`routes.test.ts`).
- **Critères d'acceptation** : publication → retour : même position ; balayage iOS fonctionnel.
- **Dépend de** : MB-07. **Porte** : décision 4.

### MB-22 — Verrou biométrique facultatif · priorité P3 · taille S · session S3
- **Pour l'utilisateur** : protéger l'ouverture de l'application par Face ID ou empreinte.
- **Backend** : aucun. **Web** : aucun.
- **Mobile** : `expo-local-authentication`, réglage désactivé par défaut, `faceIDPermission` activé avec mention FR et EN.
- **Données personnelles** : aucune donnée biométrique ne quitte le système.
- **Tests et cliquets** : tests du réglage.
- **Critères d'acceptation** : verrou au retour d'arrière-plan si activé.
- **Dépend de** : MB-07. **Porte** : aucune.

### MB-23 — Partager vers ANTSIA · priorité P3 · taille M · session S3
- **Pour l'utilisateur** : depuis la galerie, « Partager → ANTSIA » ouvre le composeur.
- **Backend** : aucun. **Web** : aucun.
- **Mobile** : extension de partage iOS et cible Android, par greffon de configuration ; ouvre MB-09.
- **Données personnelles** : fichier gardé en mémoire jusqu'à l'envoi.
- **Tests et cliquets** : tests du greffon.
- **Critères d'acceptation** : photo partagée depuis la galerie publiée.
- **Dépend de** : MB-09. **Porte** : aucune.

### MB-24 — Démonstration dans l'application · priorité P1 · taille S · session S3
- **Pour l'utilisateur** : essayer ANTSIA sans compte ; le vérificateur d'Apple ou de Google entre sans code réel.
- **Backend** : existant (`platform/demoAccounts.ts`). **Web** : aucun.
- **Mobile** : contrôle des huit comptes sur le binaire 14 et l'APK ; bannière « démonstration » sur tous les écrans ; texte des notes de vérification (MB-05).
- **Données personnelles** : comptes fictifs seulement.
- **Tests et cliquets** : `native-demo.test.ts`.
- **Critères d'acceptation** : huit acteurs ouverts sur iOS et Android ; retour au compte personnel sans ressaisie.
- **Dépend de** : MB-02, MB-03. **Porte** : aucune.

### MB-25 — Portage des surfaces restantes · priorité P3 · taille L · session S3
- **Pour l'utilisateur** : groupes, évènements, directs (lecture), albums, univers et commerce au téléphone.
- **Backend** : selon chaque plan. **Web** : d'abord.
- **Mobile** : une route native par surface, ajoutée à `parity.ts` ; renvoi web en attendant.
- **Données personnelles** : selon chaque plan.
- **Tests et cliquets** : `parity.test.ts`.
- **Critères d'acceptation** : la surface passe de `renvoi` à `native` dans la matrice.
- **Dépend de** : plans 04, 05, 07, 08, 09, 10. **Porte** : portes de ces plans (paiements, nouveaux univers).

## 6. Ordre recommandé et dépendances

| Vague | Lots | Pourquoi dans cet ordre |
|---|---|---|
| 1 | MB-01, MB-02, MB-03 | Savoir où l'on est, puis prouver qu'un binaire de `main` existe |
| 2 | MB-06, MB-07, MB-24 | Appareils réels ; corriger la perte d'état avant d'ajouter des fonctions |
| 3 | MB-04, MB-05 | Ce que les boutiques exigent ; dossier rempli avec le binaire réel |
| 4 | MB-08, MB-12, MB-13, MB-15, MB-16 | Ce qui fait revenir (push, liens) et la sécurité des versions |
| 5 | MB-09, MB-10, MB-11, MB-14, MB-20 | Créer et échanger au téléphone, mesuré |
| 6 | MB-17, MB-18, MB-19, MB-21 | Appels natifs après clés et recette ; confort |
| 7 | MB-22, MB-23, MB-25 | Plus tard, à mesure que le web avance |

Dépendances vers d'autres plans : 01 (iCom, appels), 02 (composeur), 03 (médias, recherche, Stories), 05 (relations, blocage), 06 (préférences, effacement, push), 12 (signalements), 13 (domaine, confidentialité), 15 (DIASPORALE mobile, suite).

## 7. Décisions à prendre par le propriétaire

1. **Push : jeton direct APNs et FCM, ou service Expo ?** Recommandation : jeton direct. Le moteur sait déjà livrer aux deux, le module d'appel parle déjà FCM, et l'on évite un intermédiaire de plus pour des données de citoyens.
2. **Mise à jour à distance du JavaScript (`expo-updates`) ?** Recommandation : pas avant l'ouverture ; version minimale (MB-16) d'abord. Chaque mise à jour à distance serait une publication, donc soumise à votre accord.
3. **Données sur le téléphone hors ligne** (cache d'images, dernière fenêtre du fil, brouillons, file d'envoi) : le choix actuel masque tout contenu privé hors ligne. Recommandation : autoriser le cache d'images et la file d'envoi, effacés à la sortie ; garder les messages masqués hors ligne.
4. **Navigation : garder la pile maison ou adopter une pile native ?** Recommandation : garder la pile maison et y ajouter le geste de retour ; une pile native change toute la coque.
5. **Âge minimum déclaré aux boutiques : 16 ans** (ordonnance 0011). Recommandation : 16 ans, et attendre l'avis du juriste (SU01c) avant la soumission.
6. **Rien d'achetable dans l'application iOS**, y compris pour les professionnels (pages premium, sponsorisé). Recommandation : oui, tout passe par le web, pour rester hors des règles d'achat intégré.
7. **Groupe de testeurs** : garder la bêta publique TestFlight ouverte pendant le pilote ? Recommandation : oui, avec notes FR et EN à chaque build.

## 8. Risques et points d'attention

- **Le simulateur ne vaut pas un appareil** ; une notification « envoyée » ne prouve pas sa réception (`05_MESSAGES_ET_APPELS.md` § 8).
- **Premier `eas build` jamais éprouvé** : les dépendances natives (LiveKit, WebRTC, module d'appel) doivent compiler même fermées ; prévoir le repli local et le disque (reprise § 5.1).
- **Disque presque plein** : brancher l'iPhone sous Xcode copie environ 10 Go (mémoire `testflight-antsia-controle`).
- **Renvois web** : la session n'est pas transférée ; la personne se reconnecte sur le site. Apple peut juger une application qui renvoie beaucoup au web trop pauvre : réduire les renvois avant la soumission.
- **Dossiers de preuve absents de `main`** : `docs/recette/antsia-native-p17d/` (lu par `scripts/native-acceptance.mjs`), `configuration-native-2026-10-21/`, `idn-natif-builds-2026-10-21/`, `ios-parity-acceptance-2026-10-25/`, `ios11-postrelease-2026-10-25/`, `ios12-simulateur-2026-10-26/`. Les restaurer depuis le Mac (reprise, annexe C) ou corriger les liens.
- **S3 ne modifie pas `package.json`** : chaque dépendance (MB-08, 09, 13, 18, 20, 22) attend une demande à S1.
- **Règles des boutiques** : à relire au moment de la soumission ; ce plan les cite de mémoire.

## 9. Prompts d'implémentation

### Prompt MB-01 — Matrice de parité
```text
Tu es la session S3 d'ANTSIA. Écris en français. Lis le plan 14 (PLANS_FINALISATION_2026-11-09/14_APPLICATION_MOBILE.md, § 2 et MB-01), puis apps/antsia_ga/src/lib/routes.ts, apps/antsia_mobile/src/lib/routes.ts, src/app.tsx et src/lib/native-profile-view.ts. Vérifie que l'état du § 2 est toujours vrai.
Périmètre : apps/antsia_mobile/ seulement. Livre src/lib/parity.ts (chaque route web : native, renvoi, absent, ferme, avec l'écran natif) et parity.test.ts qui lit le fichier de routes web par fs et échoue si une route manque. Aucun import depuis apps/antsia_ga.
Puis recette au simulateur « ANTSIA iPhone 18 Pro » contre le web à 402×874 (demande-moi l'accord pour le backend local et ses variables) : cinq destinations une à une, fil, Immersion, Stories, iCom, profil, notifications, démo. Rapport docs/recette/parite-mobile-<date>/RAPPORT.md : identique, écart, absent.
Vérifie : tests, typage, lint du paquet antsia-mobile, puis bun run verify. Arrête-toi avant toute correction : je choisis les écarts à corriger.
```

### Prompt MB-02 — Binaire iOS 14 depuis `main`
```text
Tu es la session S3 d'ANTSIA. Écris en français. Lis le dossier de reprise (§ 3.4, § 8.5), docs/recette/integration-ios-2026-11-02/RAPPORT.md, apps/antsia_mobile/README.md, app.config.ts, eas.json, scripts/prepare-build.mjs, puis le lot MB-02 du plan 14.
Vérifie le disque (≥ 20 Go libres, sinon arrête-toi). Sur une branche claude/ios-build-14 tirée d'origin/main : buildNumber 14. Prépare le contexte propre avec les références origin/main d'ANTSIA et de DIASPORALE (jamais HEAD).
Arrête-toi et donne-moi : commit, commande exacte, coût de quota EAS ou repli eas build --local, durée et disque estimés. Après mon accord écrit : compile, altool --validate-app, consigne l'empreinte du bundle Hermes, installe le profil simulateur et constate démarrage, icône, entrée IDN et connexion démo.
Ne soumets à TestFlight qu'après un second accord écrit ; si EAS Submit reste en file, méthode altool du § 8.5. Aucun secret affiché ni écrit. Rapport docs/recette/ios-build14-<date>/RAPPORT.md : vrai, preuves, non vérifié.
```

### Prompt MB-04 — Bloquer, signaler, supprimer son compte
```text
Tu es la session S3 d'ANTSIA. Écris en français. Lis le lot MB-04 du plan 14, puis convex/modules/graph/connections.ts (blockPerson, unblockPerson), convex/modules/moderation/moderation.ts (reportComment), convex/modules/moderation/cases.ts (report), convex/modules/people/erasure.ts (requestErasure), apps/antsia_ga/src/components/personal-controls.tsx et packages/social-features/src/features/reseau-personnel/BlockedPeopleSection.tsx. Vérifie que ces fonctions existent toujours et lis leurs arguments.
Périmètre : apps/antsia_mobile/. Ajoute : signaler et bloquer depuis un profil, signaler un commentaire, signaler et bloquer depuis une conversation (si le moteur ne permet pas de signaler un message, dépose une issue [S1] et arrête cette partie), liste des personnes bloquées dans les réglages, suppression du compte avec double confirmation puis sortie et purge du coffre par la porte existante.
Textes par i18n FR et EN, React Hook Form + Zod, garde useNativeGuard, un seul bouton plein par zone. Tests de chaque geste, puis bun run verify, puis recette au simulateur en clair et en sombre avec deux comptes de démonstration (aucune suppression d'un compte réel ; demande-moi avant de supprimer un compte de démonstration).
```

### Prompt MB-07 — Retour d'arrière-plan sans perte d'état
```text
Tu es la session S3 d'ANTSIA. Écris en français. Lis le lot MB-07 du plan 14, puis apps/antsia_mobile/src/lib/session-controller.ts (écouteur AppState), src/app.tsx (ReadyMember, history), src/lib/owned-convex-client.ts et la note vault plantage-natif-confirmation-2026-10-21.md (piège du client fermé).
D'abord mesure : journalise (sans contenu) les transitions active, inactive, background au simulateur et, si MB-06 l'a permis, sur appareil. Rends-moi le constat avant de modifier.
Puis : seul background sort du premier plan ; la pile history, la portée du fil, l'Immersion et les brouillons en mémoire survivent au retour pour la même personne et la même session ; une autre personne ou une session révoquée repart de zéro. Aucune écriture sur disque.
Tests du contrôleur (inactive, background court, background long, révocation pendant l'absence), bun run verify, recette au simulateur : centre de contrôle, passage dans Réglages, retour. Ne compile aucun binaire sans mon accord.
```

### Prompt MB-08 — Push social réel
```text
Tu es la session S3 d'ANTSIA. Écris en français. Lis le lot MB-08 du plan 14, convex/modules/notifications/{pushSubscriptions,transports,configuration,open,preferences}.ts, apps/antsia_mobile/src/calls/{call-backend,call-controller,device-binding}.ts et src/lib/native-notifications.ts. Attends ma décision 1 (jeton direct ou Expo).
Si une dépendance manque (expo-notifications), dépose une issue [S1] pour le catalogue et arrête-toi jusqu'à son ajout. Périmètre : apps/antsia_mobile/ ; toute modification du moteur passe par une issue [S1].
Livre : autorisation demandée au geste, inscription liée à la session et désinscription à la sortie, ouverture à froid et à chaud vers NativeRoute, pastille, catégories alignées sur les réglages du moteur, réponse rapide aux messages par sendMessage idempotent. Aucun contenu social ni contact dans une notification.
Tests, bun run verify. La réception réelle exige les clés APNs et Firebase : je les configure moi-même ; tu ne codes rien qui suppose une clé absente. « Envoyé » n'est jamais présenté comme « reçu ».
```

## 10. Sources lues

- Code : `apps/antsia_mobile/` en entier (écrans, composants, `lib/`, `calls/`, `modules/antsia-call-system/`, greffons, scripts, `app.config.ts`, `eas.json`, `native-build.json`, README) ; `packages/social-native/src` ; `packages/social-contracts/src/native-calls.ts` ; `packages/ui/src/themes/antsia-native.ts` ; `scripts/native-acceptance.mjs` ; `deploy/catalog.json` (`antsia_mobile`) ; `convex/modules/notifications/` ; `convex/modules/graph/connections.ts`, `moderation/`, `people/erasure.ts`, `posts/posts.ts`, `messaging/messages.ts`, `media/media.ts` ; les 88 pages et `lib/routes.ts` d'`apps/antsia_ga` ; `tests/ratchets/`.
- Documents : `docs/adr/0031-retour-idn-natif-lie-a-pkce.md` ; cahier (EXF-AN-26, 27, 53, EXT-AN-06) ; `docs/etudes/2026-10-18-social-commerce/00_VISION_ET_DECISIONS.md` (Version D, SC14, SC15), `05_MESSAGES_ET_APPELS.md` § 5 à 8, `rapports/P17A_AUDIT_NATIF.md` (sommaire), `P17D_REPRISE_2026-10-20.md` ; étude sept univers (connectivité) ; `00_PLAN_DIRECTEUR.md`.
- Recettes : `docs/recette/{integration-ios-2026-11-02, icone-ios-2026-11-02, ios-build7-demo-acceptance-2026-10-24, mobile-business-ios7-2026-10-24, mobile-demo-2026-10-24, mobile-ergonomics-ios8-2026-10-24, native-production-publication-2026-10-21, fil-mobile-2026-10-18}`.
- Dossier de reprise : § 2, § 3.4, § 8.5, § 9, § 10.3, § 11, § 13.4.
- Vault : `ios-parite-fonctionnelle-2026-10-25`, `ios11-recette-postpublication-2026-10-25`, `ios12-controle-simulateur-2026-10-26`, `ios12-publication-2026-10-26`, `native-business-ios7-2026-10-24`, `plantage-natif-confirmation-2026-10-21`, `configuration-native-production-2026-10-21`, `recette-idn-android-assistee-2026-10-21`, `contexte-actif`, décision `2026-10-15-appels-par-reseau-et-participation`.
- Mémoire : `testflight-antsia-controle`, `simulateur-ios-panneau`, `MEMORY.md` (goûts du propriétaire).
