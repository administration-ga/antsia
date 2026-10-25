# ANTSIA — client natif et builds téléphone

Application Expo iOS/Android du moteur ANTSIA, entrée réelle `index.ts` → `src/app.tsx`.
Elle n'est pas servie par Next sur le port 3030. Aucun navigateur embarqué n'affiche le fil.
Le paquet est découvert par `apps/*` dans l'installation Bun unique du dépôt.

État au 21 octobre 2026 : projet Expo créé, identifiants approuvés et APK Android release
ARM64 signé, version 0.1.0 (code 1), Android 8/API26 minimum. Le retour IDN natif est publié
et configuré en production. L'IPA iOS16.4 minimum est également signé ; son envoi TestFlight et la recette physique sont suivis dans
`docs/recette/configuration-native-2026-10-21/` à la racine du dépôt.

## Builds de test — production ANTSIA

`eas.json` définit `telephone` (APK Android et iOS interne sur appareil enregistré) et
`testflight` (distribution store, sans soumission automatique). Ces binaires intègrent leur
JavaScript : aucun serveur Metro n'est requis. Les appels système restent désactivés dans
ces profils ; leurs dépendances natives restent présentes et doivent compiler.

Les origines publiques observées sur le site publié le 21 octobre sont :

```sh
export EXPO_PUBLIC_CONVEX_URL=https://diligent-avocet-585.convex.cloud
export EXPO_PUBLIC_CONVEX_SITE_URL=https://diligent-avocet-585.convex.site
export EXPO_PUBLIC_SITE_URL=https://antsia.vercel.app
```

Configuration approuvée le 21 octobre, conservée dans `native-build.json` :
Expo `@okatechs-organization/antsia-mobile`, projet `74b5e1bc-0685-440d-8562-da878b191d86`,
iOS/Android `ga.antsia.mobile`, schéma `antsia`. Les variables `NATIVE_*` permettent une
surcharge explicite ; aucun identifiant d'un autre produit n'est réutilisé. Le profil EAS
injecte les origines publiques de production et le schéma dans le JavaScript embarqué.
Aucun fichier `.env` n'est utilisé pour la compilation. Le mode release exige les identités
complètes, les origines HTTPS et le refus de HTTP local.

Pour préserver les autres travaux, la préparation utilise deux commits explicites et
superpose uniquement les fichiers mobiles/contrats IDN explicitement nommés de cette reprise. Depuis la racine ANTSIA :

```sh
ANTSIA_BUILD_REF=1193b087fe4206da81dcdb7d6ff0aca8214f25ee \
DIASPORALE_BUILD_REF=367c2bd3ca9dfb59baaae0d32bce44dafc911d36 \
node apps/antsia_mobile/scripts/prepare-build.mjs
```

La préparation résout le verrou dans le contexte propre, avec la seule dépendance
`expo-web-browser` ajoutée au catalogue de base. Le résultat donne `root` et `app`, dans `~/Library/Caches/antsia-native-builds/`.
Dans `root/ANTSIA`, lancer `bun install --frozen-lockfile`. Dans `app`, après vérification
des variables et de la signature propriétaire :

```sh
export EAS_NO_VCS=1
export EAS_PROJECT_ROOT="<root retourné par la préparation>"
bunx --package eas-cli@25.3.0 eas build --local --profile telephone --platform android --non-interactive
bunx --package eas-cli@25.3.0 eas build --local --profile testflight --platform ios --non-interactive
```

La compilation doit partir de ce contexte propre, jamais directement de l'arbre partagé.
Le quota de compilation Expo distante était épuisé le 21 octobre ; les compilations
locales utilisent `eas build --local` avec les mêmes profils, sans changement d'abonnement.
La configuration iOS déclare `usesNonExemptEncryption: false` pour SecureStore et les
transports standards, selon [la documentation Expo](https://docs.expo.dev/versions/latest/sdk/securestore/).
Aucun `--auto-submit`. Le profil iOS interne exige un compte Apple Developer et l'appareil
préenregistré ; choisir `testflight` uniquement pour un test via App Store Connect, avec une
soumission distincte. Le réglage local de signature App Store est réservé à `testflight`
par `NATIVE_IOS_APP_STORE_BUILD=true` ; le profil interne conserve la sélection EAS.
Cette configuration prépare `0.1.0`, build iOS `8`, Android `3` inchangé. Le build iOS7 a été approuvé et rendu disponible aux tests externes le24/10/2026 ; les builds6 et4 ont été conservés dans le groupe public. Le candidat iOS8 est signé localement ; son dernier essai avec le clavier logiciel reste en attente du déverrouillage du Mac. Aucun nouvel APK Android n’est distribué par ce lot.
Ils embarquent le correctif du plantage
qui suivait la confirmation de connexion (PR33), présent dans les builds iOS `2` et Android `1`.
Le build iOS `4` adopte aussi le cycle de vie UIScene, sans lequel le build `3` ne démarre pas sous iOS 27.
Incrémenter ces numéros explicitement avant toute nouvelle distribution qui l'exige.

Le [rapport de livraison mobile](../../docs/recette/mobile-demo-2026-10-24/RAPPORT.md) détaille le correctif du changement de compte et la recette du build6. Bêta publique : https://testflight.apple.com/join/mqWat3mu.

## Comptes de démonstration

L’entrée et la bannière proposent une démonstration explicitement séparée du compte
personnel. Les trois origines `EXPO_PUBLIC_DEMO_CONVEX_URL`,
`EXPO_PUBLIC_DEMO_CONVEX_SITE_URL` et `EXPO_PUBLIC_DEMO_SITE_URL` sont déclarées dans
le profil EAS ; l’authentification et les lecteurs de données basculent ensemble.
Le catalogue n’apparaît que si le backend déclare `demoAccounts` et `emailOtp`.
La connexion emploie le vrai parcours OTP et les comptes fictifs existants du Web,
sans bootstrap, consentement automatique, équipement, publication ou graine métier.
Comme sur le Web, un utilisateur d’authentification peut être créé si l’adresse démo
choisie ne s’est jamais connectée ; aucun profil ni contenu n’est créé par le natif.

Les coffres restent isolés par origine. Une bascule attend la fermeture des lecteurs
et appels, conserve le jeton du compte personnel et relit la session au retour.
La sortie d’un compte démo révoque uniquement la session du téléphone, pour préserver
les visiteurs Web. Le nouvel arrivant sans profil ou sans adhésion reste soumis à la préparation de
son compte dans la démo Web ; les liens externes gardent le préfixe `/demo`.

Depuis iOS 27, UIKit refuse de lancer une app compilée avec le SDK iOS 27 sans cycle de vie UIScene
(« UIScene life cycle is required for apps built with this SDK », arrêt SIGTRAP au démarrage).
Le gabarit Expo SDK 57 crée encore sa fenêtre dans l'AppDelegate.
`plugins/with-scene-lifecycle.cjs` déclare donc une scène unique dans l'`Info.plist`, retire la fenêtre
du lancement et génère `SceneDelegate.swift`. Ce délégué démarre React Native dans la scène et renvoie
les liens à l'AppDelegate. Si le gabarit change, le plugin échoue au prebuild : il ne produit jamais
une app sans fenêtre.

## Exécution dans le simulateur iOS

Le profil `simulateur` reprend les origines de production du profil `telephone`
et produit un `.app` iOS Simulator autonome, sans Metro. Il ne demande pas de
signature App Store et n'est pas envoyé à TestFlight. Le hook de signature ignore
explicitement ce profil via `NATIVE_IOS_SIMULATOR_BUILD=true`.
Les compilations suivantes ciblent Apple Silicon (`arm64`) avec deux tâches Xcode,
pour limiter le pic de mémoire et les fichiers temporaires sur ce Mac.

Dans le contexte propre retourné par la préparation, lancer
`eas build --local --profile simulateur --platform ios --non-interactive`, puis
installer le `.app` obtenu dans le simulateur choisi. Les données du service et
les sessions des autres appareils ne sont pas modifiées par la compilation.

## Retour Identité.ga natif

Le client utilise le navigateur système pour IDN puis un retour exact du schéma détenu par
ANTSIA. Il génère nonce et verifier S256 distincts, conservés en mémoire dix minutes au plus.
Le callback HTTPS IDN central existant reste inchangé. Le moteur délivre un code éphémère
90 secondes, lié au challenge et consommé une seule fois. Le retour ne contient ni session,
ni bearer, ni OTT Web. L'échange POST relit la session et le sujet ; seul le header signé
`set-auth-token` est conservé dans SecureStore, puis la session fraîche est corrélée.

Le plugin serveur `convex/betterAuth/nativeIdn.ts` est raccordé par `auth.ts`. Il exige la
configuration serveur publique **`NATIVE_AUTH_REDIRECT_URI=<schéma détenu>://auth/idn`**.
Elle doit correspondre au schéma du binaire. Sans cette configuration, le parcours reste
fermé. Aucun schéma personnalisé n'est ajouté aux origines Web de confiance.

La fermeture du navigateur annule la tentative. Une sortie/démontage invalide le retour ;
un démarrage à froid sans verifier ne récupère pas une tentative perdue. Aucun profil ni
adhésion n'est créé par l'échange ; une inscription incomplète passe toujours par le site.
La production n'a que IDN actif ; le raccord y est publié avec
`NATIVE_AUTH_REDIRECT_URI=antsia://auth/idn`. La page publique répond200 et un échange vide
est refusé400 avant toute lecture/écriture de session. La recette IDN sur téléphone reste
à effectuer par le propriétaire.

## Configuration explicite

| Nom | Sens |
|---|---|
| `EXPO_PUBLIC_CONVEX_URL` | Origine du moteur Convex ANTSIA explicitement choisi |
| `EXPO_PUBLIC_CONVEX_SITE_URL` | Origine HTTP du même moteur, qui sert Better Auth |
| `EXPO_PUBLIC_SITE_URL` | Origine du site ANTSIA correspondant, pour les parcours Web restants |
| `EXPO_PUBLIC_NATIVE_SCHEME` | Schéma détenu par le propriétaire, requis pour IDN et les builds téléphone |
| `NATIVE_IOS_BUNDLE_ID` | Identifiant iOS détenu par le propriétaire, requis avant génération autonome |
| `NATIVE_ANDROID_PACKAGE` | Identifiant Android détenu par le propriétaire, requis avant génération autonome |
| `EXPO_PUBLIC_ALLOW_LOCAL_HTTP` | `true` en développement seulement pour une origine de boucle locale |
| `NATIVE_CALLS_ENABLED` | `true` uniquement pour configurer explicitement un binaire avec appels système ; désactivé par défaut |
| `EXPO_PUBLIC_NATIVE_NOTIFICATION_APPLICATION_ID` | Entrée native correspondant à la plateforme dans le registre ANTSIA |
| `APNS_ENVIRONMENT` | `development` ou `production`, requis par le plugin activé ; ne lance aucun déploiement |
| `NATIVE_FIREBASE_CONFIG_PATH` | Fichier Firebase propriétaire existant, requis par le plugin activé |

Aucune valeur n'est inventée, copiée d'un autre produit ou écrite dans un fichier `.env*`.
Les variables `EXPO_PUBLIC_*` sont publiques dans le binaire. Elles ne doivent contenir aucun
secret. HTTPS est requis, à l'exception de la boucle locale explicitement admise en mode
développement. Sur un appareil physique, `localhost` désigne l'appareil ; aucun tunnel, IP LAN
en HTTP n'est admis par les profils téléphone. Le projet Expo et les identifiants ci-dessus
ont été créés/configurés après approbation explicite du propriétaire.

Les scripts Expo sont déclarés dans le paquet. Ne pas démarrer un deuxième serveur à côté du serveur
déjà utilisé par une autre session. Les projets natifs générés et les signatures restent dans le contexte privé de compilation,
hors du dépôt. Aucune donnée applicative ni session existante n'est modifiée.

## Périmètre actuel

- Authentification par code e-mail/SMS, uniquement si le moteur expose ce transport. Le
  greffon `bearer()` existe déjà côté serveur : le client conserve son header `set-auth-token`
  dans SecureStore ; il ne copie pas le cookie d'un navigateur. Le JWT Convex reste en mémoire.
- Retour Identité.ga natif raccordé par code PKCE à usage unique, sous configuration serveur
  explicite. Les sessions du navigateur ne sont pas copiées. Recette physique encore à effectuer.
- Résolution du réseau, session Better Auth vivante, personne et adhésion relues. Aucun
  profil, accord ni adhésion créé automatiquement. Une inscription incomplète revient au site.
- Fil liste/défilement vertical, publication, boîte et conversations personnelles existantes.
  Fenêtres de 200 éléments au plus. Envoi texte seul, corps/clé figés pour une reprise manuelle.
- Hors ligne : contenu privé masqué ; l'intention d'envoi reste en mémoire tant que la
  conversation reste montée. Navigation, arrière-plan, sortie ou arrêt du processus peuvent
  la supprimer. Aucune boîte d'envoi durable ni garantie de reprise après arrêt n'est annoncée.
- Les liens reçus pendant la session n'acceptent que des références de publication/conversation
  et trois destinations fermées. Ils ne contiennent aucun jeton et ne donnent aucun droit.
  Les liens de démarrage à froid et associations universelles restent à raccorder. Le retour
  IDN est traité uniquement par la tentative système corrélée, séparément des liens de contenu.
- Les DTO de médias et leurs retenues serveur font autorité. Pas de dépôt natif de fichiers,
  de reconstruction d'URL ni d'ouverture de fichier privé hors de cette garde.
- Sept chartes du dépôt, clair/sombre ; Sable donne les cartes beige. Les choix locaux sont
  limités à cette ouverture, sans écriture de la préférence de compte. Polices système.
- Sortie native par une porte asynchrone : fermeture des gestes, arrêt des lecteurs, tentative
  de révocation globale, sortie SDK, purge de la seule clé de ce moteur, remplacement du client
  SDK et démontage des clients Convex/caches. Révocation et purge ont des résultats distincts.

## Appels et notifications d’appel — P17c

Les sources ajoutent un module Expo local Swift PushKit/CallKit et Kotlin FCM/Core-Telecom,
un hôte LiveKit persistant, les gestes audio/vidéo dans les conversations et l’activation
sur geste dans les réglages. Microphone au geste d’appel/réponse, caméra pour la vidéo seulement ;
l’inscription aux notifications ne demande pas le micro. La capacité reste indisponible sans
module compilé, identités natives explicites et configuration serveur correspondante.

Une session réelle et la liaison exacte de cet appareil sont relues avant réponse/jeton. Un seul
appareil gagne. Le push ne contient que des références opaques et une échéance. La sonnerie
native expire en 45 secondes au plus ; les événements de reprise sont bornés à 32/60 secondes.
Pas de push VoIP d’annulation : canal actif et expiration native ferment la sonnerie. Les
notifications sociales ordinaires gardent leurs limites de réception/ouverture mobile.

La salle vit au-dessus des écrans. Révocation, expiration et déconnexion arrêtent les pistes ;
le nettoyage est lié à son ancien appareil/UUID. Le stockage bearer reste
`WHEN_UNLOCKED_THIS_DEVICE_ONLY` : la réponse depuis un écran verrouillé n’est pas prouvée.
Le plein écran Android n’est pas présumé. Aucun enregistrement ni E2EE annoncé.

Les dépendances sont installées ; compilations natives, livraison APNs/FCM et essais physiques
restent à vérifier séparément. Expo Go ne prouve pas la chaîne native.
Aucun achat ni candidature native. Les fermetures P16 du moteur sont conservées ; P17d reste
une recette séparée, non exécutée.

## Préparation P17d et suite P18/P19

Le [dossier P17d](../../docs/recette/antsia-native-p17d/README.md) contient le protocole et
le registre initial non exécuté. Le script racine `native:acceptance` est déclaré pour lire ce
dossier ; il ne remplace pas la recette physique. Une
complétude déclarée ne prouve pas une observation et n’active aucune capacité.

Les [corrections P18](../../docs/etudes/2026-10-18-social-commerce/rapports/P18_REPRISE_2026-10-20.md)
concernent commandes et champs accessibles, états sélectionnés, grandes tailles, mouvements
réduits et présentation des listes/appels. Aucun score AA ou gain de performance mesuré.
Le [dossier P19](../../docs/etudes/2026-10-18-social-commerce/rapports/P19_REPRISE_2026-10-20.md)
est actualisé sans lancement de pilote ou publication. La configuration propriétaire, les
compilations et les essais physiques restent nécessaires et non effectués.

## Écrans métier natifs — préparation iOS7

L’onglet Découvrir donne accès aux boutiques, services, associations et activités gérées.
Les pages et boutiques s’ouvrent depuis le fil ; une publication commerciale renvoie à
sa référence d’offre relue par le serveur. Les vitrines présentent leurs informations,
collections, catalogue paginé et publications. Les fiches distinguent produits et
services, prix fixes/unitaires/fourchettes/devis, disponibilité indicative et variantes.
Les pages d’association affichent présentation, publications et suivi au geste explicite.
Les offres fictives gardent leurs actions commerciales fermées ; aucun achat ou devis
n’est simulé. Les médias publics de démo sont résolus uniquement depuis les URL admises
par le DTO, sous l’origine Web configurée.

Un nouvel arrivant déjà authentifié dont la personne existe sans adhésion affiche
l’inscription à terminer, sans accès membre ni création automatique de données.
Les contrôles de reconnexion utilisent la même admission que l’entrée initiale.
La recette et le statut de distribution du build7 sont consignés dans
`docs/recette/mobile-business-ios7-2026-10-24/` à la racine du dépôt.

Livraison confirmée le24/10/2026 à22:06Paris : **0.1.0(7) APPROVED et IN_BETA_TESTING**,
groupe public7+6+4 conservé, notification automatique active. La recette complémentaire
des huit profils est terminée dans le simulateur, avec réserves ergonomiques consignées ;
Administration est restauré sur Mairie Démo/Publications. Voir le rapport et ses limites. Cette note
de livraison est postérieure au manifeste de compilation et ne change pas le binaire.

La [publication Git et sa vérification globale répartie](../../docs/recette/mobile-business-ios7-2026-10-24/PUBLICATION_GIT.md) documentent le lot iOS7 et les reprises ciblées des contrôles.

## Corrections ergonomiques — candidat iOS8

Les vitrines et annuaires marchands ajustent leur défilement au clavier iOS ; la touche
de recherche du clavier et le bouton lancent la même recherche puis ferment le clavier.
Le choix Boutiques/Services/Associations/Mes activités appartient désormais à la session
membre et reste sélectionné au retour d’une page. L’annuaire d’associations affiche
son état vide même si le membre possède une association, avec des messages FR/EN.

Le [rapport iOS8](../../docs/recette/mobile-ergonomics-ios8-2026-10-24/RAPPORT.md) distingue
les contrôles réussis, les observations natives et le dernier essai clavier encore
bloqué. L’IPA0.1.0(8) porte le même bytecode que le simulateur ; il n’a pas été soumis
à Apple. Les binaires/symboles7 sont conservés, les dépendances natives inchangées.

Le build iOS0.1.0(8) est approuvé et disponible pour les tests externes le25/10/2026. Le [rapport de publication et de recette](../../docs/recette/mobile-ergonomics-ios8-2026-10-24/RAPPORT.md) distingue les deux scénarios constatés de l’essai du clavier logiciel restant à terminer.
