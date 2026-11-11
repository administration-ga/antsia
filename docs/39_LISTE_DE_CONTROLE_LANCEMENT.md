# Liste de contrôle du lancement et de la bascule de domaine

> Lot EX-19 du plan 13 (`docs/etudes/2026-11-09-finalisation/13_CONSOLE_EXPLOITATION_LANCEMENT.md`, § 5, § 7 et § 8), priorité P0.
> Relevé le 11 novembre 2026, sur `origin/main` = `ecca990`, par lecture du code, des documents, du registre
> `docs/etudes/2026-11-09-finalisation/EXECUTION.md` et de `git log`. **Aucune commande n'a visé un déploiement pour écrire cette liste.**
> État du lot : **en cours**. La bascule réelle attend les domaines, l'hébergement et les clés du propriétaire.

Dépôt public : ce document nomme des **rôles** (« backend de production », « projet du site principal », « adresse technique de
l'enfant de démonstration ») et des **noms de variables**, jamais une valeur, un nom de déploiement ou un identifiant d'hébergement.
Les valeurs vivent chez les fournisseurs et sur la machine qui publie (`docs/36`, § 3). Le cliquet `no-deployment-identifiers` relit ce
fichier ; le cliquet `launch-checklist` en garde la forme (§ 0).

## 0. Comment lire et tenir cette liste

Chaque ligne cochable est une ligne de tableau qui commence par `[ ]` ou `[x]`, avec sept colonnes :

| Colonne | Contenu |
|---|---|
| case | `[x]` si et seulement si l'état est `fait` |
| N° | identifiant stable (`DOM`, `VAR`, `DEM`, `REC`, `EXP`, `J1`, puis deux chiffres) ; une ligne peut renvoyer à une autre par son numéro |
| Contrôle | ce qui doit être vrai |
| Preuve attendue | ce qui le prouve (rapport daté, journal, sortie de commande, page publiée) ; jamais vide |
| État | `fait` (preuve consignée et citée), `en cours` (code fusionné ou PR ouverte, preuve réelle manquante), `à faire` |
| Qui | `agent` (session d'exécution), `coordinateur`, `propriétaire`, `juriste`, `tiers` (fournisseur d'identité, PRO.GA, autorités), joints par « + », précisés entre parenthèses |
| Référence | la preuve existante ou ce qui la porte (document, PR, fichier) ; jamais vide pour une ligne `fait` ou `en cours` |

Règles :

1. On ne coche qu'avec la preuve, citée dans la colonne Référence. **Fusionné, en ligne et recetté en réel ne se confondent jamais**
   (plan directeur, § 7.2) : un lot fusionné reste `en cours` tant que sa preuve réelle manque.
2. Un agent ne publie rien, ne pose aucune variable et ne lit aucun déploiement de production sans l'accord écrit et détaillé du
   propriétaire (commit, cibles, ordre, retour arrière). « propriétaire + agent » veut dire : le propriétaire décide ou pose, l'agent
   exécute sur cet accord.
3. Les variables se posent dans le tableau de bord du fournisseur ou dans le terminal du propriétaire ; aucune valeur n'entre dans ce
   dépôt, dans un chat ou dans une capture.
4. Quand une ligne change d'état, le bilan du § 1 change dans le même commit (le cliquet recompte).

## 1. Bilan

| Lignes | fait | en cours | à faire | attendent le propriétaire |
|---|---|---|---|---|
| 81 | 6 | 8 | 67 | 64 |

« Attendent le propriétaire » : lignes non faites dont la colonne Qui nomme le propriétaire.

## 2. Domaines et certificats

| ☐ | N° | Contrôle | Preuve attendue | État | Qui | Référence |
|---|---|---|---|---|---|---|
| [ ] | DOM-01 | Domaine du réseau (`antsia.ga`, hypothèse du cahier reprise au catalogue) confirmé, enregistré au nom de l'éditeur, zone DNS modifiable | titulaire et échéance relevés par le propriétaire (hors dépôt) ; zone accessible | à faire | propriétaire | plan 13, § 2 : les domaines de production ne répondaient pas le 9/11 |
| [ ] | DOM-02 | Domaine de la console (`admin.antsia.ga`, catalogue) confirmé, même titulaire | idem | à faire | propriétaire | `deploy/catalog.json` |
| [ ] | DOM-03 | Domaine de la page d'état choisi (sous-domaine, décision 6 du plan 13) et déclaré : le catalogue n'a aujourd'hui **aucune** entrée de page d'état | décision écrite ; entrée déclarée par EX-05 | à faire | propriétaire + agent | plan 13, décision 6 et EX-05 ; `deploy/catalog.json` |
| [ ] | DOM-04 | Forme canonique décidée (avec ou sans `www`) ; l'autre forme redirige de façon permanente vers elle | décision ; `curl -sI` des deux formes | à faire | propriétaire + agent | plan 13, EX-10 (URL canonique) |
| [ ] | DOM-05 | Domaines rattachés chez l'hébergeur : réseau au projet du site principal, console au projet de la console ; **aucun** domaine personnalisé sur le projet de l'enfant de démonstration | liste des domaines de chaque projet, relevée par le propriétaire (rôles seulement dans le dépôt) | à faire | propriétaire | ADR-0032 ; `apps/antsia_ga/src/lib/demo-proxy.ts` |
| [ ] | DOM-06 | Certificats TLS émis et valides pour le réseau, la console et la page d'état, à renouvellement automatique | `curl -vI https://<domaine>` : chaîne valide, émetteur et échéance consignés au compte rendu de bascule | à faire | propriétaire + agent | — |
| [ ] | DOM-07 | HSTS : les sites envoient `Strict-Transport-Security` d'un an avec `includeSubDomains`. Tout sous-domaine Web du domaine du réseau doit servir HTTPS avant le premier passage d'un navigateur sur ce domaine | inventaire des sous-domaines de la zone, chacun en HTTPS ou sans service Web | à faire | propriétaire | `packages/api/csp.mjs` (`securityHeaders`) |
| [ ] | DOM-08 | Domaine d'envoi des e-mails sur le domaine de production (décision D2 du plan 06) : SPF et DKIM posés et vérifiés chez le fournisseur d'envoi | domaine « vérifié » chez le fournisseur ; en-têtes d'un code reçu (SPF et DKIM `pass`) | à faire | propriétaire | plan 06, D2 et CN-02 |
| [ ] | DOM-09 | Ancienne adresse technique du site principal : décision écrite de la servir en parallèle ou de la rediriger. Les binaires mobiles distribués et les liens déjà partagés la portent | décision ; si parallèle, origine gardée dans `TRUSTED_ORIGINS` (VAR-03) jusqu'au remplacement des binaires (VAR-14) | à faire | propriétaire | `apps/antsia_mobile/eas.json` (origines injectées au build) |
| [ ] | DOM-10 | DIASPORALE : domaine (`diasporale.com`, catalogue), hébergement (arbitrage A10 du cahier) et dossier de mise en production | dossier DS-06 | à faire | agent (S2) + propriétaire | plan 15, DS-06 |

## 3. Variables, par leur nom

### 3.1 Backend de production (variables du déploiement Convex)

| ☐ | N° | Contrôle | Preuve attendue | État | Qui | Référence |
|---|---|---|---|---|---|---|
| [ ] | VAR-01 | `SITE_URL` = origine du domaine du réseau. Elle fixe le retour IDN central (`<SITE_URL>/api/auth/oauth2/callback/idn`) et le retour IDN natif (`<SITE_URL>/api/auth/native/return`) | nom présent, valeur relue par le propriétaire seul ; entrée IDN réelle après le changement (REC-04) | à faire | propriétaire | `convex/betterAuth/nativeIdn.ts` ; `docs/25` (« le callback est central et dérivé du `SITE_URL` ») |
| [ ] | VAR-02 | Retour IDN central déplacé chez le fournisseur d'identité : le client OIDC de production d'ANTSIA admet le nouveau retour **avant** le changement de `SITE_URL` ; l'ancien reste admis jusqu'à la fin de la transition (retour arrière, § 9) | inventaire des retours admis du client, sans secret, avant et après ; scopes `openid profile email` et niveau minimal 1 inchangés | à faire | propriétaire + tiers (IDN) | `docs/25`, « Cibles et paramètres préparés » ; la production IDN ne se publie pas depuis le clone local d'`identite.ga` (dossier de reprise, § 3.5) |
| [ ] | VAR-03 | `TRUSTED_ORIGINS` : origines admises en plus de `SITE_URL`. Les `site_url` du catalogue sont déjà admises par le code (VAR-17) ; la variable porte les adresses techniques gardées pendant la transition, retirées ensuite | liste des origines, par rôle, relevée avant et après ; entrée sur la console et sur DIASPORALE après le changement | à faire | propriétaire | `convex/betterAuth/settings.ts` (`trustedOrigins`) |
| [ ] | VAR-04 | `NOTIFICATION_APPLICATIONS_JSON` : origine HTTPS exacte et chemin d'entrée de chaque application, au nouveau domaine. Un abonnement push du navigateur reste lié à l'origine qui l'a créé : les membres se réabonnent sur le nouveau domaine | registre relu (forme, 32 entrées au plus) ; notification reçue depuis le nouveau domaine (REC-07) | à faire | propriétaire | `convex/modules/notifications/configuration.ts` ; plan 06, CN-10 |
| [ ] | VAR-05 | `WEB_PUSH_ALLOWED_ORIGINS` porte les origines des **services push des navigateurs**, pas celles des sites : elle ne change pas avec le domaine, mais le push Web reste fermé tant qu'elle n'est pas posée avec `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` et `VAPID_SUBJECT` | capacité `web` des notifications vraie (les quatre variables présentes) ; REC-07 | à faire | propriétaire | `convex/modules/notifications/pushSubscriptions.ts` ; plan 06, CN-10 |
| [ ] | VAR-06 | `RESEND_FROM_ADDRESS` (avec `RESEND_API_KEY`) : adresse d'envoi sur le domaine vérifié (DOM-08) | code e-mail reçu, expéditeur sur ce domaine (REC-05) | à faire | propriétaire | `convex/betterAuth/settings.ts` ; plan 06, D2 |
| [ ] | VAR-07 | `NATIVE_AUTH_REDIRECT_URI` : retour natif par le schéma de l'application, indépendant du domaine ; le chemin serveur de ce retour suit `SITE_URL` (VAR-01) | entrée IDN native avec un binaire en circulation et avec un binaire construit sur le nouveau domaine (REC-14) | à faire | agent (S3) + propriétaire | `convex/betterAuth/nativeIdn.ts` |
| [ ] | VAR-08 | `ANTSIA_COMMERCE_ORIGIN` (seulement si le lien PRO.GA est configuré, CM-01) : le retour du lien de commerce en dérive ; la changer ferme les défis en cours et exige le nouveau retour chez PRO.GA | retour déclaré chez PRO.GA ; un lien de commerce rejoué après la bascule | à faire | propriétaire + tiers (PRO.GA) | `convex/modules/shops/commerceLinkConfig.ts` ; plan 08, CM-01 |
| [ ] | VAR-09 | `ANTSIA_ENGINE_VERSION` posée à chaque publication du moteur (le commit publié, jamais un nom de déploiement) | `/sante-fonctionnelle` affiche la version du moteur ; avertissement absent de `release-check` | à faire | propriétaire | `.env.example` ; `docs/36`, § 6 et § 9 |
| [ ] | VAR-10 | Le moteur de production garde son adresse technique (`<nom>.convex.cloud`), sans domaine personnalisé : `NEXT_PUBLIC_CONVEX_URL` et `CONVEX_SITE_URL` des sites ne changent pas. Un domaine personnalisé exigerait d'adapter la CSP (elle ne dérive l'origine des actions HTTP que d'une adresse `.convex.cloud`) et `release-check` | décision écrite ; `release-check --cible moteur-production` sans défaut après la bascule | à faire | propriétaire | `packages/api/csp.mjs` (`convexOrigins`) |

### 3.2 Sites (variables des projets de l'hébergeur)

| ☐ | N° | Contrôle | Preuve attendue | État | Qui | Référence |
|---|---|---|---|---|---|---|
| [ ] | VAR-11 | `NEXT_PUBLIC_SITE_URL` du site principal = nouvelle origine. Elle est inscrite au build : la bascule demande une nouvelle construction du site (EX-01), pas seulement une variable | version `main-<sha12>-production` servie sur le nouveau domaine ; liens absolus et métadonnées de partage sur ce domaine | à faire | propriétaire + agent | `apps/antsia_ga/.env.example` ; `deploy/catalog.json` (`build_args`) ; `docs/36` |
| [ ] | VAR-12 | `NEXT_PUBLIC_SITE_URL` de la console = origine de la console, même règle | version `main-<sha12>-console` servie sur le domaine de la console | à faire | propriétaire + agent | `apps/admin_antsia_ga/.env.example` |
| [ ] | VAR-13 | Relais de la démonstration inchangé : `ANTSIA_DEMO_RUNTIME_ORIGIN` reste l'adresse technique exacte de l'enfant (le code refuse tout autre hôte et l'origine publique) ; `ANTSIA_DEMO_PROXY_TOKEN`, `ANTSIA_DEMO_HOSTING_BYPASS`, `NEXT_PUBLIC_DEMO_ENTRY_ENABLED` inchangés | contrôle privé puis public de `/demo` par `release-check --cible principal` | à faire | agent | `apps/antsia_ga/src/lib/demo-proxy.ts` ; ADR-0032 |

### 3.3 Mobile

| ☐ | N° | Contrôle | Preuve attendue | État | Qui | Référence |
|---|---|---|---|---|---|---|
| [ ] | VAR-14 | `EXPO_PUBLIC_SITE_URL` et `EXPO_PUBLIC_DEMO_SITE_URL` (égales par construction), avec `EXPO_PUBLIC_CONVEX_URL`, `EXPO_PUBLIC_CONVEX_SITE_URL` et leurs variantes de démonstration, sont injectées dans le binaire par le profil de build : un nouveau domaine exige un nouveau binaire | profil de build mis à jour (zone de la session mobile, exception nommée du cliquet) ; binaire construit et installé (REC-12, REC-13) | à faire | agent (S3) + propriétaire | `apps/antsia_mobile/app.config.ts` ; `apps/antsia_mobile/eas.json` |
| [ ] | VAR-15 | Liens universels : fichiers `.well-known` d'association (Apple, Android) servis par le site sur le domaine définitif ; `associatedDomains` et `intentFilters` dans la configuration native (MB-13) | un lien froid et un lien chaud ouvrent le bon écran | à faire | agent (S3 et S1) | plan 14, MB-13 (aucun des deux dans `app.config.ts` aujourd'hui) |

### 3.4 Machine qui publie

| ☐ | N° | Contrôle | Preuve attendue | État | Qui | Référence |
|---|---|---|---|---|---|---|
| [ ] | VAR-16 | `ANTSIA_RELEASE_SITE_ORIGIN` et `ANTSIA_RELEASE_CONSOLE_ORIGIN` passent aux nouveaux domaines ; `ANTSIA_RELEASE_DEMO_CHILD_ORIGIN` reste l'adresse technique de l'enfant | `node scripts/release.mjs plan <sha>` relu ; EXP-10 | à faire | propriétaire | `docs/36`, § 3 |

### 3.5 Catalogue et inventaire

| ☐ | N° | Contrôle | Preuve attendue | État | Qui | Référence |
|---|---|---|---|---|---|---|
| [x] | VAR-17 | Le catalogue déclare les domaines visés du réseau, de la console et de DIASPORALE, et le moteur les admet comme origines de confiance. Si le propriétaire choisit d'autres domaines, ce fichier partagé change et le moteur se republie | `deploy/catalog.json` (`site_url`) ; cliquet `deploy-catalog` | fait | agent | `deploy/catalog.json` ; `convex/betterAuth/settings.ts` (`trustedOrigins`, `applicationOfOrigin`) |
| [ ] | VAR-18 | Inventaire du § 3.6 relu pour le backend de production : chaque nom attendu est posé, ou volontairement absent (`ANTSIA_DEV_TOOLS`, `ANTSIA_SEEDS_ALLOWED`, `ANTSIA_DEMO_DEPLOYMENT` jamais en production) | liste des noms posés, relevée par le propriétaire (noms seulement) | à faire | propriétaire | `.env.example` ; dossier de reprise, § 4 |

### 3.6 Inventaire des noms (lu dans le code et les documents)

Ce tableau n'est pas cochable : il dit quelles variables bougent avec le domaine. Liste complète et commentée : `.env.example`,
`apps/*/.env.example`, `deploy/catalog.json`.

| Où | Variables | Dépend du domaine |
|---|---|---|
| Backend : authentification | `SITE_URL`, `TRUSTED_ORIGINS` | oui (VAR-01, VAR-03) |
| Backend : authentification | `BETTER_AUTH_SECRET`, `AUTH_DEFAULT_LOCALE` | non |
| Backend : IDN | `IDN_CLIENT_ID`, `IDN_CLIENT_SECRET`, `IDN_ISSUER`, `IDN_DISCOVERY_URL` | non (domaine du fournisseur) ; le retour admis chez lui, oui (VAR-02) |
| Backend : IDN natif | `NATIVE_AUTH_REDIRECT_URI` | non (VAR-07) |
| Backend : courriel et SMS | `RESEND_FROM_ADDRESS` | oui (VAR-06) |
| Backend : courriel et SMS | `RESEND_API_KEY`, `SMS_PROVIDER`, `SMS_ENDPOINT`, `SMS_API_KEY` | non |
| Backend : notifications | `NOTIFICATION_APPLICATIONS_JSON` | oui (VAR-04) |
| Backend : notifications | `WEB_PUSH_ALLOWED_ORIGINS`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `EXPO_PUSH_ENDPOINT`, `EXPO_RECEIPTS_ENDPOINT`, `EXPO_ACCESS_TOKEN`, `FCM_SEND_ENDPOINT`, `FCM_OAUTH_ENDPOINT`, `FCM_OAUTH_SCOPE`, `FCM_SERVICE_ACCOUNT_JSON`, `APNS_ENDPOINT`, `APNS_PRIVATE_KEY`, `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_TOPIC` | non (`VAPID_SUBJECT` seulement si son adresse de contact est prise sur le nouveau domaine) |
| Backend : temps réel | `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_WS_URL`, `LIVEKIT_WAKE_URL`, `LIVEKIT_WAKE_TOKEN`, `LIVEKIT_EGRESS_URL`, `LIVEKIT_WEBHOOK_SECRET` | non, sauf serveur vidéo sous un sous-domaine du réseau |
| Backend : fichiers | `FILE_SCAN_PROVIDER`, `FILE_SCAN_CLAMAV_URL`, `FILE_SCAN_CLAMAV_TOKEN` | non |
| Backend : fédération | `FEDERATION_ENVIRONMENT`, `ANTSIA_FEDERATION_<IDENTIFIANT>_KEY`, `ANTSIA_ADMINISTRATION_PUBLIC_ORIGIN`, `ANTSIA_FEDERATION_ADMINISTRATION_MEDIA_ORIGINS` | non (origines de l'administration) |
| Backend : commerce | `ANTSIA_COMMERCE_ORIGIN` | oui (VAR-08) |
| Backend : commerce | `ANTSIA_COMMERCE_ENVIRONMENT`, `ANTSIA_COMMERCE_KEY_ID`, `ANTSIA_COMMERCE_SIGNING_KEY`, `ANTSIA_COMMERCE_SOURCE`, `ANTSIA_COMMERCE_PRO_APP_ORIGIN`, `ANTSIA_COMMERCE_PRO_HTTP_ORIGIN`, `ANTSIA_COMMERCE_PRODUCTION_ENABLED`, `ANTSIA_COMMERCE_MERCHANT_READ_ENABLED`, `ANTSIA_COMMERCE_SERVICE_CONTROL_V2`, `ANTSIA_COMMERCE_PAYMENT_PREPARATION_ENABLED`, `ANTSIA_COMMERCE_PAYMENT_REDIRECT_ORIGINS`, `ANTSIA_COMMERCE_TRANSPORT_TEST_ENABLED`, `ANTSIA_CATALOG_MEDIA_ORIGIN` | non (origines de PRO.GA et du prestataire ; médias : adresse du moteur par défaut) |
| Backend : DIASPORALE | `DIASPORA_ATTESTATION_URL`, `DIASPORA_PARTNER_KEY`, `DIASPORA_PARTNER_KEY_ID` | non |
| Backend : démonstration et local | `ANTSIA_DEMO_DEPLOYMENT`, `ANTSIA_SEEDS_ALLOWED`, `ANTSIA_DEV_TOOLS` | non ; jamais en production (VAR-18) |
| Backend : version | `ANTSIA_ENGINE_VERSION` | non (VAR-09) |
| Sites | `NEXT_PUBLIC_SITE_URL` | oui (VAR-11, VAR-12, DEM-04) |
| Sites | `NEXT_PUBLIC_CONVEX_URL`, `CONVEX_SITE_URL`, `NEXT_PUBLIC_BUILD_SHA`, `LIVEKIT_WS_URL`, `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`, `NEXT_PUBLIC_DEMO_ENTRY_ENABLED`, `NEXT_PUBLIC_APP_BASE_PATH`, `ANTSIA_DEMO_RUNTIME_ORIGIN`, `ANTSIA_DEMO_PROXY_TOKEN`, `ANTSIA_DEMO_HOSTING_BYPASS` | non (VAR-10, VAR-13) |
| Sites | `NEXT_PUBLIC_POSTHOG_EU_RELAY_ORIGIN` | seulement si le relais de mesure prend un sous-domaine du réseau (EX-21) |
| Site DIASPORALE | `NEXT_PUBLIC_DIASPORALE_DATA_SOURCE`, `NEXT_PUBLIC_IDN_PORTAL_URL`, `NEXT_PUBLIC_CONSULATE_URL` | non ; dossier de sa session (DOM-10) |
| Mobile (binaire) | `EXPO_PUBLIC_SITE_URL`, `EXPO_PUBLIC_DEMO_SITE_URL` | oui (VAR-14) |
| Mobile (binaire) | `EXPO_PUBLIC_CONVEX_URL`, `EXPO_PUBLIC_CONVEX_SITE_URL`, `EXPO_PUBLIC_DEMO_CONVEX_URL`, `EXPO_PUBLIC_DEMO_CONVEX_SITE_URL`, `EXPO_PUBLIC_NATIVE_SCHEME`, `EXPO_PUBLIC_ALLOW_LOCAL_HTTP`, `EXPO_PUBLIC_NATIVE_NOTIFICATION_APPLICATION_ID` | non |
| Mobile (configuration) | `NATIVE_IOS_BUNDLE_ID`, `NATIVE_ANDROID_PACKAGE`, `NATIVE_EXPO_OWNER`, `NATIVE_EXPO_PROJECT_ID`, `NATIVE_RELEASE_BUILD`, `NATIVE_CALLS_ENABLED`, `APNS_ENVIRONMENT`, `NATIVE_FIREBASE_CONFIG_PATH` | non ; liens universels à ajouter (VAR-15) |
| Machine qui publie | `ANTSIA_RELEASE_SITE_ORIGIN`, `ANTSIA_RELEASE_CONSOLE_ORIGIN` | oui (VAR-16) |
| Machine qui publie | `ANTSIA_RELEASE_DEMO_CHILD_ORIGIN`, `ANTSIA_RELEASE_CONVEX_DEMO`, `ANTSIA_RELEASE_CONVEX_PROD`, `ANTSIA_RELEASE_VERCEL_TEAM`, `ANTSIA_RELEASE_VERCEL_PROJECT_DEMO`, `ANTSIA_RELEASE_VERCEL_PROJECT_MAIN`, `ANTSIA_RELEASE_VERCEL_PROJECT_CONSOLE`, `ANTSIA_RELEASE_HOME` | non |

## 4. Démonstration

| ☐ | N° | Contrôle | Preuve attendue | État | Qui | Référence |
|---|---|---|---|---|---|---|
| [x] | DEM-01 | Règle écrite et gardée par le code : le backend de démonstration ne prend **jamais** de domaine personnalisé (la garde ne reconnaîtrait plus son nom et fermerait la démonstration) ; l'enfant de démonstration reste sur son adresse technique, servi sous `<site principal>/demo` par le relais | garde du moteur (nom tiré de l'adresse `.convex.cloud`) ; épinglage du site ; refus d'un hôte non technique par le relais | fait | agent | `docs/23`, § 5 ; ADR-0029 ; ADR-0032 ; `convex/lib/devTools.ts` ; `apps/antsia_ga/src/lib/demo-backend.ts` ; `apps/antsia_ga/src/lib/demo-proxy.ts` |
| [ ] | DEM-02 | Constat à la bascule : aucun domaine personnalisé sur le backend de démonstration ni sur le projet de l'enfant | relevé du propriétaire (rôles seulement) ; `/demo` sans défaut (EXP-10) | à faire | propriétaire + agent | DEM-01 |
| [ ] | DEM-03 | `SITE_URL` du backend de démonstration : il porte l'origine du site principal (ADR-0032) et passe donc au nouveau domaine du réseau à la bascule | entrée d'un compte de démonstration sous `<nouveau domaine>/demo/entrer`, accueil rempli | à faire | propriétaire | ADR-0032 (« seul le `SITE_URL` du backend de démonstration rejoint l'origine principale ») ; `docs/23`, § 4 |
| [ ] | DEM-04 | `NEXT_PUBLIC_SITE_URL` de l'enfant de démonstration relevé ; s'il porte l'ancienne origine du site principal, l'enfant est reconstruit avec la nouvelle, puis le principal (le relais fixe l'adresse exacte de l'enfant à son build) | relevé par rôle, sans valeur ; version `main-<sha12>-demo` servie sous `/demo` | à faire | propriétaire + agent | `docs/23`, § 2 ; `docs/36`, § 5.1 (étapes 8 et 9) |
| [ ] | DEM-05 | Production : aucun panneau de démonstration ; le catalogue des comptes de démonstration y rend une liste vide | `modules/platform/demoAccounts:catalogue` rend `[]` sur la production (lecture d'un déploiement de production : accord du propriétaire) | à faire | propriétaire + agent | `docs/23`, § 3 |
| [ ] | DEM-06 | Protection d'accès de la démonstration et cadence de sa remise à zéro décidées | décision écrite | à faire | propriétaire | plan 13, décision 11 et EX-15 ; `docs/23`, § 2 et § 5 |

## 5. Recettes réelles

### 5.1 Identité (plan 06)

| ☐ | N° | Contrôle | Preuve attendue | État | Qui | Référence |
|---|---|---|---|---|---|---|
| [ ] | REC-01 | Deux vraies identités IDN se connectent, se déconnectent et se retrouvent (A, puis B, puis A, dans deux onglets ; « Se déconnecter partout ») : CN-01, parcours R1 | `docs/recette/entree-reelle-<date>/RAPPORT.md` ; zéro session restante après la sortie | à faire | propriétaire + agent | une seule identité réelle connectée le 20/10 (`docs/25`) ; changement de compte prouvé sur la démonstration seulement (`docs/32`) |
| [ ] | REC-02 | Inscription réelle : un nouveau membre IDN soumet `/bienvenue` et arrive sur le fil (CN-01, parcours R2) | même rapport ; profil publié par le formulaire réel | à faire | propriétaire + agent | `docs/recette/bienvenue-publication-2026-11-02/RAPPORT.md` (prouvé sur un compte fictif, formulaire non soumis) |
| [ ] | REC-03 | Cause de l'échec du PIN IDN du 26/10 établie, ou renvoyée au fournisseur d'identité avec preuve (CN-01) | statut et erreur serveur de la tentative, ou journaux du fournisseur | à faire | propriétaire + tiers (IDN) | plan 06, § 2 |
| [ ] | REC-04 | Après la bascule : entrée IDN réelle sur le nouveau domaine, sur le réseau puis sur la console (le retour IDN passe par l'origine du site principal) | parcours constaté, sans capture de PIN, de code, de jeton ni de cookie | à faire | propriétaire + agent | VAR-01 ; VAR-02 ; `docs/25` |

### 5.2 Transports

| ☐ | N° | Contrôle | Preuve attendue | État | Qui | Référence |
|---|---|---|---|---|---|---|
| [ ] | REC-05 | Code par e-mail reçu en moins d'une minute sur une vraie boîte ; trois essais faux bloqués ; renvoi temporisé (CN-02) | rapport de recette ; en-têtes SPF et DKIM | à faire | propriétaire + agent | plan 06, § 2 (codes non activés en production) |
| [ ] | REC-06 | Code par SMS reçu sur un vrai numéro, mêmes critères (CN-02) | rapport de recette | à faire | propriétaire + agent | plan 06, CN-02 |
| [ ] | REC-07 | Notification du navigateur reçue sur Chrome Android, un navigateur de bureau et Safari iOS en écran d'accueil ; ouverture ciblée (CN-10) | matrice consignée ; `sent` n'est qu'une admission, pas une réception | à faire | propriétaire + agent | plan 06, CN-10 ; `docs/07` |
| [ ] | REC-08 | Notification reçue sur un téléphone réel par APNs et par FCM (MB-08) | appareil, système, build et heure consignés | à faire | agent (S3) + propriétaire | plan 14, MB-08 |
| [ ] | REC-09 | Appel vidéo entre deux identités reçu sur deux appareils réels (IC-01) ; direct sur le vrai serveur vidéo, avec sa rediffusion (DL-01) | rapports d'IC-01 et de DL-01 | à faire | propriétaire + agent | plan 01, IC-01 ; plan 04, DL-01 |
| [x] | REC-10 | Antivirus réel : fichier sain, fichier EICAR, fichier de 33 Mio, deux vidéos analysées puis lues après rechargement | rapport de recette sur la démonstration | fait | agent | `docs/31_RECETTE_ANTIVIRUS_DEMO_2026-10-20.md` ; `ops/clamav/README.md` (20/10) |
| [ ] | REC-11 | Après publication d'EX-17 : un fichier de plus de 60 Mio est refusé à l'envoi ; la vidéo de publication est bornée à 60 Mio | recette sur la démonstration, puis `release-check` | en cours | agent + propriétaire | PR #104 (EX-17, fusionnée, non publiée) |

### 5.3 Mobile (plan 14)

| ☐ | N° | Contrôle | Preuve attendue | État | Qui | Référence |
|---|---|---|---|---|---|---|
| [ ] | REC-12 | Binaire iOS compilé depuis `main` (build 14), installé sur un iPhone réel (MB-02) | numéro de build, commit et installation constatés | à faire | agent (S3) + propriétaire | plan 14, MB-02 ; seul le JavaScript des builds 10 à 13 est prouvé (dossier de reprise, § 10.3) |
| [ ] | REC-13 | Android compilé depuis `main`, installé sur un téléphone réel (MB-03) | idem | à faire | agent (S3) + propriétaire | plan 14, MB-03 |
| [ ] | REC-14 | Essais sur appareils physiques : installation, IDN réel saisi par le propriétaire, fil, clavier, message, arrière-plan, mode avion, lecteur d'écran (MB-06) ; après la bascule, avec un binaire construit sur le nouveau domaine | `docs/recette/appareils-<date>/` : appareil, système, build et constat par ligne | à faire | agent (S3) + propriétaire | plan 14, MB-06 |
| [ ] | REC-15 | Exigences des boutiques d'applications présentes dans un binaire : bloquer, signaler, supprimer son compte (MB-04) | constat sur appareil | en cours | agent (S3) | PR #158 (MB-01, MB-04, PF-04, fusionnée) |

### 5.4 Conformité (plan 12 et dossier SU01)

| ☐ | N° | Contrôle | Preuve attendue | État | Qui | Référence |
|---|---|---|---|---|---|---|
| [ ] | REC-16 | SU01a : mentions légales complètes publiées (éditeur, directeur de publication, téléphone, hébergeurs et sous-traitants, registre de la HAC, représentant légal) | page publique ; un champ manquant laisse le lot ouvert | à faire | propriétaire + juriste + agent | plan 12, SU01a ; SU01, § 5 |
| [ ] | REC-17 | Inscription au registre de la HAC faite, ou demandée par écrit | accusé de la HAC (hors dépôt), cité aux mentions | à faire | propriétaire | SU01, § 5 et § 6 |
| [ ] | REC-18 | Représentant légal nommé, joignable « d'heure à heure » pour le référé numérique | nom publié aux mentions | à faire | propriétaire | SU01, § 5 |
| [ ] | REC-19 | Dossier déposé auprès de l'autorité de protection des données (APDPVP) | accusé de dépôt | à faire | propriétaire + juriste | SU01, § 5 |
| [ ] | REC-20 | Arbitrages A1, A2 et A3 tranchés par écrit par un juriste | avis écrit | à faire | juriste | SU01, § 3 et § 6 |
| [ ] | REC-21 | SU01h : procédure du référé numérique éprouvée sur la démonstration (suspension, déréférencement, correctif, marquage, levée à l'échéance) | rapport de recette sur la démonstration | en cours | agent + juriste + propriétaire | PR #159 ouverte, non fusionnée au 11/11 ; avis A12 attendu |
| [ ] | REC-22 | SU01f : règles d'utilisation publiées ; retrait des commentaires par les administrateurs de page et de groupe, avis neutre de chaque signalement de leur espace | route publique des règles ; tests du moteur | à faire | juriste + agent | plan 12, SU01f (porte A7) |
| [x] | REC-23 | SU01d : signalements réglementés et délais légaux en console | registre des sept univers ; recette connectée de la console | fait | agent | `docs/etudes/2026-10-21-sept-univers-et-vie-publique/EXECUTION.md` (en ligne depuis le 22/10, recette connectée le 23/10) |

## 6. Exploitation et qualité

| ☐ | N° | Contrôle | Preuve attendue | État | Qui | Référence |
|---|---|---|---|---|---|---|
| [x] | EXP-01 | `bun run verify` vert sur `main` | journal de vérification complète, code 0 | fait | coordinateur | assemblage du 11/11 : vérification complète, code 0, arbre vérifié identique à l'arbre fusionné en `ecca990` (journal du coordinateur, hors dépôt) ; dernier rapport dans le dépôt : `docs/recette/parite-production-2026-11-02/RAPPORT.md` |
| [ ] | EXP-02 | `bun run verify` vert sur le commit publié à la bascule | journal, code 0, même SHA que le commit publié | à faire | coordinateur | EXP-01 |
| [ ] | EXP-03 | Publication du `main` qui porte les lots fusionnés depuis le 9/11 : moteur de démonstration, moteur de production, puis sites, par `scripts/release.mjs` | manifeste de publication ; `release-check` public sans défaut | à faire | propriétaire + agent | registre : aucun lot n'est « en ligne » ; moteur en ligne : copie du 24/10 et PR 87 (`docs/recette/parite-production-2026-11-02/RAPPORT.md`) |
| [ ] | EXP-04 | Retour arrière des sites joué sur la démonstration et consigné (critère d'acceptation d'EX-01) | journal `retour-demo` du manifeste ; version servie revenue à celle d'avant | à faire | propriétaire + agent | `docs/36`, § 8.1 et § 11 ; PR #131 |
| [x] | EXP-05 | Retour arrière du moteur écrit : republier le commit précédent par les mêmes étapes, `--retour-de`, aucun index supprimé | procédure dans le dépôt | fait | agent | `docs/36`, § 8.2 ; PR #131 (jamais joué) |
| [ ] | EXP-06 | Sonde de santé qui joint le moteur en ligne (`/api/sante-fonctionnelle` à 503 quand le moteur ne répond pas) | `release-check` : santé sans défaut, version du moteur déclarée | en cours | agent + propriétaire | PR #103 (EX-03, fusionnée, non publiée) |
| [ ] | EXP-07 | Sauvegarde restaurée sur une cible jetable : reçus des deux cibles, empreintes, assertions vertes, cible détruite ensuite (PA10, volet cible jetable) | rapport daté sous `docs/recette/` | à faire | propriétaire + agent | `docs/20` ; registre, PA10 |
| [ ] | EXP-08 | Restauration locale et charge R8 (5 000 abonnés, 10 000 réactions, aucun conflit, p95 du fil sous 1 500 ms) mesurées sur un backend local jetable (PA10, volet local) | relevés JSON v1 passés à `scripts/pa10-evidence.mjs load` et `restore` | à faire | agent | `docs/20` ; `docs/06`, § 3 |
| [ ] | EXP-09 | Alertes : une panne provoquée sur la démonstration déclenche une alerte reçue sur un appareil réel ; destinataire principal et suppléant, horaires d'astreinte écrits (EX-04) | compte rendu de la panne provoquée ; procédure d'astreinte | à faire | propriétaire + agent | plan 13, EX-04 et décision 5 |
| [ ] | EXP-10 | `release-check` rejoué sur les nouveaux domaines : principal et `/demo`, console, moteurs (santé, version servie, CSP limitée au bon moteur, routes clés en 200) | sorties des quatre contrôles, aucun défaut | à faire | agent + propriétaire | `scripts/release-check.mjs` ; `docs/36`, § 6 |
| [ ] | EXP-11 | Contrôles que `release-check` ne fait pas, faits à la main : certificats (DOM-06), forme canonique (DOM-04), ancienne adresse (DOM-09), retour IDN (REC-04), captures à 390 et 1440 px en clair et en sombre | compte rendu de bascule | à faire | agent | `docs/36`, § 6 |
| [ ] | EXP-12 | Second administrateur de la console nommé ; nomination à deux outillée (EX-07) | journal de la console ; archivage d'un réseau de test sur la démonstration | à faire | propriétaire + agent | plan 13, EX-07 et décision 3 ; ADR-0011 |
| [ ] | EXP-13 | Accessibilité AA des parcours principaux : audit (PA10, audits) puis corrections (EX-18) | rapport daté sous `docs/recette/` ; aucun défaut bloquant restant | en cours | agent | PR #162 et #165 (EX-18) ouvertes ; audit : à faire au registre |
| [ ] | EXP-14 | Temps d'affichage du fil mesuré en 3G simulée : p95 sous 1,5 s (EX-09) | relevé consigné | à faire | agent | plan 13, EX-09 ; cahier, EXT-AN-01 |
| [ ] | EXP-15 | Page d'état publique hébergée à part, lisible quand le site principal est hors service (EX-05, priorité P1) | un incident public y apparaît en moins de 5 min | à faire | propriétaire + agent | plan 13, EX-05 ; DOM-03 |

## 7. Critères du jalon 1 « Prêt à ouvrir », un par un

Le tableau du plan directeur (§ 4, jalon 1), domaine par domaine. Une ligne n'est faite que quand toutes les lignes qu'elle cite le sont.

| ☐ | N° | Contrôle | Preuve attendue | État | Qui | Référence |
|---|---|---|---|---|---|---|
| [ ] | J1-01 | **Droit** : mentions légales complètes publiées ; registre de la HAC fait ou demandé par écrit ; représentant légal nommé ; dossier APDPVP déposé ; arbitrages A1 à A3 tranchés par un juriste | REC-16 à REC-20 faites | à faire | propriétaire + juriste | plan directeur, § 4 et § 6.1 (points 2 et 3) |
| [ ] | J1-02 | **Mesures sur ordre** : la procédure du référé numérique est éprouvée sur la démonstration | REC-21 faite | en cours | agent + juriste + propriétaire | PR #159 |
| [ ] | J1-03 | **Identité** : deux vraies identités se connectent, se déconnectent et se retrouvent ; l'inscription d'un nouveau membre aboutit en réel | REC-01 et REC-02 faites | à faire | propriétaire + agent | plan 06, CN-01 |
| [ ] | J1-04 | **Transports** : code par e-mail et par SMS, notifications sur le navigateur et sur le téléphone, appel vidéo, chacun reçu sur un appareil réel | REC-05 à REC-09 faites | à faire | propriétaire + agent | `docs/06`, § 3 |
| [ ] | J1-05 | **Exploitation** : sauvegarde restaurée sur une cible jetable ; charge R8 mesurée ; alertes reçues ; retour arrière joué ; domaines branchés | EXP-04, EXP-07, EXP-08, EXP-09, DOM-01 à DOM-08 et EXP-10 faites | à faire | propriétaire + agent | cahier, § 14 et § 17 ; `docs/06` |
| [ ] | J1-06 | **Qualité** : `bun run verify` vert sur `main` ; AA sur les parcours principaux ; temps d'affichage du fil mesuré en 3G | EXP-01, EXP-02, EXP-13 et EXP-14 faites | en cours | coordinateur + agent | EXP-01 fait sur `ecca990` ; EX-18 en PR |
| [ ] | J1-07 | **Produit** : tous les lots P0 des seize plans livrés | registre : chaque lot P0 au moins `fusionné`, puis en ligne | en cours | agent + propriétaire | `EXECUTION.md` au 11/11 : 21 lots P0 fusionnés sur 60, 39 à faire, aucun en ligne |
| [ ] | J1-08 | **Mobile** : un binaire compilé depuis `main` tourne sur un iPhone et un téléphone Android réels | REC-12 à REC-14 faites | à faire | agent (S3) + propriétaire | plan 14, MB-02, MB-03, MB-06 |
| [ ] | J1-09 | **Pilote** : zone, vendeurs pilotes et équipe de modération désignés ; délais de traitement mesurables | décision écrite ; équipe créée dans la console ; délais légaux affichés | à faire | propriétaire | étude des sept univers, § 18 (D11 encore proposée) |

## 8. Procédure de bascule de domaine

L'ordre compte : chaque étape cite les lignes qu'elle coche. Rien ne part sans l'accord écrit du propriétaire (commit, cibles, ordre,
retour arrière).

1. **Avant** : DOM-01 à DOM-08 faites, DOM-09 décidée, VAR-10 décidée. Le nouveau retour IDN est admis chez le fournisseur d'identité,
   l'ancien gardé (VAR-02). EXP-02 joué sur le commit visé.
2. **Annoncer aux membres** : les sessions sont liées à l'origine du site (cookies) ; chacun se reconnecte sur le nouveau domaine, et
   les abonnements aux notifications du navigateur se refont (VAR-04).
3. **Rattacher les domaines** aux projets du site principal et de la console (DOM-05) : le déploiement en cours y est servi, l'ancienne
   adresse continue de répondre. Certificats constatés (DOM-06).
4. **Backend de production** (le propriétaire pose, jamais un agent) : `SITE_URL` (VAR-01), `TRUSTED_ORIGINS` avec l'ancienne adresse
   gardée (VAR-03), `NOTIFICATION_APPLICATIONS_JSON` (VAR-04), `RESEND_FROM_ADDRESS` (VAR-06), puis, s'il est configuré,
   `ANTSIA_COMMERCE_ORIGIN` (VAR-08). **Backend de démonstration** : son `SITE_URL` (DEM-03).
5. **Sites** : `NEXT_PUBLIC_SITE_URL` des projets (VAR-11, VAR-12, DEM-04), variables de la machine qui publie (VAR-16), puis
   `scripts/release.mjs` : enfant de démonstration, site principal, console (`docs/36`, § 5 ; § 5.2 si le moteur ne change pas).
   Contrôle privé avant chaque promotion.
6. **Contrôler** : EXP-10, EXP-11, REC-04, DEM-02, DEM-05.
7. **Mobile** : nouveau binaire construit sur le nouveau domaine (VAR-14), essais (REC-14), puis liens universels (VAR-15).
8. **Fin de transition**, quand les binaires distribués portent le nouveau domaine (DOM-09) : retirer l'ancienne adresse de
   `TRUSTED_ORIGINS` et l'ancien retour chez le fournisseur d'identité, puis rediriger l'ancienne adresse si c'est la décision.

## 9. Retour arrière de la bascule

Tant que l'ancien retour IDN reste admis (VAR-02) et que l'ancienne adresse répond (DOM-09), la bascule se défait :

1. promouvoir les déploiements précédents des sites : `retour-demo`, `retour-principal`, `retour-console` (`docs/36`, § 8.1) ;
2. remettre `SITE_URL`, `NOTIFICATION_APPLICATIONS_JSON` et `RESEND_FROM_ADDRESS` du backend de production, et `SITE_URL` du backend de
   démonstration, à leur valeur d'avant (le propriétaire) ;
3. détacher les nouveaux domaines seulement si leur service pose problème : le moteur ne dépend pas d'eux.

Les sessions ouvertes sur le nouveau domaine sont perdues ; les membres se reconnectent sur l'ancienne adresse.

## 10. Trous relevés en écrivant cette liste

1. **Page d'état sans domaine ni entrée au catalogue** (DOM-03) : EX-05 suppose un « sous-domaine prévu au catalogue », qui n'existe pas.
2. **`WEB_PUSH_ALLOWED_ORIGINS` ne dépend pas du domaine** (VAR-05) : ce sont les services push des navigateurs. L'origine des
   applications vit dans `NOTIFICATION_APPLICATIONS_JSON` (VAR-04), que la bascule doit changer.
3. **Le mobile porte l'origine du site dans son binaire** (VAR-14) : la bascule demande un nouveau binaire, et les binaires déjà
   distribués gardent l'ancienne adresse, d'où la décision DOM-09.
4. **Le retour IDN natif dérive aussi de `SITE_URL`** (VAR-01, VAR-07), comme le retour central.
5. **Liens universels absents** (VAR-15) : rien dans la configuration native, rien de servi sous `.well-known`.
6. **`ANTSIA_COMMERCE_ORIGIN` change le retour du lien PRO.GA** (VAR-08) : une bascule ferme les défis en cours.
7. **Un domaine personnalisé du moteur n'est pas pris en charge par la CSP** (VAR-10) : garder l'adresse technique.
8. **HSTS avec `includeSubDomains`** (DOM-07) : tout sous-domaine Web doit servir HTTPS avant l'ouverture.
9. **La démonstration suit le domaine principal** (DEM-03, DEM-04) : son backend porte l'origine du site principal.
10. **`release-check` ne contrôle ni certificat, ni redirection, ni retour IDN** (EXP-11) : contrôles manuels.

## 11. Sources lues

- Plan 13 (§ 1, § 2, § 5 : EX-01, EX-03 à EX-05, EX-07, PA10, EX-09, EX-10, EX-17 à EX-19 ; § 7 ; § 8) ; plan directeur (§ 3, § 4,
  § 5, § 6.1, § 7.2) ; plans 06 (CN-01, CN-02, CN-10, D2), 12 (SU01a, SU01f, SU01h), 14 (MB-02, MB-03, MB-06, MB-08, MB-13) ;
  registre `EXECUTION.md`.
- `docs/06`, `docs/20`, `docs/23`, `docs/25`, `docs/31`, `docs/32`, `docs/36` ; ADR-0029, ADR-0032 ; dossier SU01 ; recettes
  `bienvenue-publication-2026-11-02`, `parite-production-2026-11-02`.
- Code : `deploy/catalog.json`, `.env.example`, `apps/*/.env.example`, `convex/betterAuth/{settings,auth,nativeIdn}.ts`,
  `convex/lib/devTools.ts`, `convex/modules/notifications/{configuration,pushSubscriptions,transports}.ts`,
  `convex/modules/shops/commerceLinkConfig.ts`, `packages/api/csp.mjs`, `apps/antsia_ga/src/lib/{demo-proxy,demo-backend,app-path}.ts`,
  `apps/antsia_mobile/{app.config.ts,eas.json}`, `scripts/release.mjs`, `scripts/release-check.mjs`.
- Dossier de reprise (§ 2, § 3, § 8), hors dépôt : méthode seulement, aucun identifiant recopié.
- `git log` d'`origin/main` jusqu'à `ecca990` et les PR ouvertes du dépôt au 11/11.
