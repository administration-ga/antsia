# Plan 06 — Compte, identité, paramètres et notifications

> Constaté par lecture du code d'`origin/main` (ANTSIA `26741caa`, DIASPORALE `bead76d`), le 9 novembre 2026. Rien n'a été exécuté.
> Applications de référence : Instagram et Facebook (Centre de comptes), WhatsApp (confidentialité, appareils liés, validation en deux étapes), Telegram (sessions actives), connexion par Apple et Google (clés d'accès), notifications d'Instagram, de WhatsApp et de LinkedIn. Comparaison faite de mémoire (état des produits à la mi-2026), non revérifiée en ligne.

Vocabulaire employé une fois pour toutes :
- **IDN** : l'identité numérique nationale (identite.ga), seul fournisseur d'identité du programme. Son **niveau de garantie** (`loa`) vaut 1, 2 ou 3 ; le badge Vérifié exige 2.
- **Compte léger** : un compte ouvert avec un code à usage unique reçu par e-mail ou SMS (**OTP**), sans mot de passe.
- **Session** : la connexion d'un navigateur ou d'un téléphone, tenue par Better Auth (la bibliothèque d'authentification du moteur) ; le **JWT** est le jeton court (30 min) que Convex lit.
- **Push** : une notification envoyée au système de l'appareil (Web Push dans le navigateur, Expo, FCM pour Android, APNs pour iOS).
- **Récapitulatif** (digest) : l'e-mail qui résume l'activité non lue.

## 1. L'intention du propriétaire

- **Une personne, une identité souveraine.** IDN s'affiche en premier ; à côté, un compte léger par code, **jamais de mot de passe** (ADR-0002 ; cahier EXF-AN-09, EXF-AN-45 ; § 6.1).
- **Rien d'office.** Aucun profil, nom civil ni adhésion recopiés d'IDN ; la personne choisit son nom affiché et son identifiant, puis consent (ADR-0002 ; ADR-0008).
- **La confiance ne s'achète ni ne s'usurpe** : badges calculés côté serveur ; un compte léger reste « Communauté » et doit pouvoir **s'élever vers IDN** par un parcours soigné (ADR-0002, conséquences ; parcours R2 : « bannière d'élévation IDN »).
- **Une sortie qui sort vraiment** : la déconnexion révoque toutes les sessions serveur ; un JWT valide ne suffit jamais (ADR-0008 ; docs/29, docs/32).
- **Les droits personnels restent ouverts au suspendu** : export, effacement effectif après 30 jours, recours (ADR-0009, § 3 et 5 ; cahier EXF-AN-32).
- **Aucun contenu social ni contact dans une notification** ; une admission chez le fournisseur ne prouve pas la réception (ADR-0009, § 7 ; cliquet `notification-payload-content`).
- **Préférences qui suivent la personne** : langue, fuseau et thème enregistrés sur le compte, apparence posée avant l'affichage (ADR-0010, ADR-0026).
- **Mesure d'usage facultative**, consentie globalement, révocable (ADR-0010, § 5).
- **Refusé ou déjà tranché** : recopier le « Centre de comptes » ou le mot de passe de Meta (étude responsive, `01_ANALYSE_REFERENCES.md`, vidéo 2) ; un réglage sans effet serveur (même étude, vidéo 1) ; un bouton pour une fonction vide (mémoire du propriétaire) ; une fusion implicite par e-mail (ADR-0008).
- **Conformité** : identification de tout titulaire (art. 4) et 16 ans minimum (art. 16-17) de l'ordonnance 0011 ; attendent les arbitrages A1 à A5 d'un juriste (SU01, § 3 ; reprise § 10.1). Place dans les piliers : socle commun des trois piliers (aucun n'existe sans compte).

## 2. Ce qui existe

| Capacité | État | Web | Mobile | Preuve |
|---|---|---|---|---|
| Entrée IDN (PKCE, `/userinfo`, preuve minimale, `prompt=login`) | Présent | oui | oui | `convex/betterAuth/auth.ts`, `convex/betterAuth/settings.ts` (`idnProfileProof`), `packages/social-features/src/features/identity/IdentityEntry.tsx` |
| Retour IDN natif lié à PKCE (code 90 s) | Présent | — | oui | `convex/betterAuth/nativeIdn.ts`, `apps/antsia_mobile/src/lib/native-idn.ts`, ADR-0031 |
| Code par e-mail (6 chiffres, 5 min, 3 essais, renvoi après 60 s) | Présent, fermé en production | oui | oui | `convex/betterAuth/auth.ts` (`emailOTP`), `convex/betterAuth/delivery.ts` ; s'ouvre avec `RESEND_API_KEY` et `RESEND_FROM_ADDRESS` (`settings.ts`) |
| Code par SMS (numéro E.164, relais HTTP) | Présent, fermé en production | oui | oui | `phoneNumber` dans `auth.ts` ; s'ouvre avec `SMS_PROVIDER=webhook`, `SMS_ENDPOINT`, `SMS_API_KEY` |
| Mot de passe et réinitialisation | Fermé (définitivement) | — | — | `PASSWORD_PATHS` et `emailAndPassword: { enabled: false }` dans `auth.ts` ; décision EXF-AN-09 |
| Limitation de débit des codes | Présent | oui | oui | `convex/modules/platform/authRateLimit.ts`, greffon `rateLimitPlugin` de `auth.ts` |
| Comptes de démonstration (code affiché) | Présent, démo seulement | oui | oui | `convex/modules/platform/demoAccounts.ts`, `apps/antsia_ga/src/components/demo-accounts-panel.tsx` |
| Accueil `/bienvenue` : nom affiché, identifiant, langue, fuseau, consentement | Présent | oui | oui | `apps/antsia_ga/src/components/welcome-screen.tsx`, `apps/antsia_mobile/src/components/native-onboarding.tsx` |
| Propositions d'identifiant | Présent | oui | oui | `suggestHandles` dans `convex/modules/people/profile.ts` |
| Disponibilité de l'identifiant saisi, en direct | Partiel | non | oui | `isHandleAvailable` appelé par `native-onboarding.tsx:65` ; l'écran Web n'affiche que la disponibilité des propositions, le refus arrive à l'envoi |
| Élévation d'un compte léger vers IDN | Partiel | oui | — | `authClient.oauth2.link` dans `apps/antsia_ga/src/components/identity-tools.tsx` (menu du compte, masqué si vérifié) ; pas de bannière d'élévation (R2) |
| Parcours d'accueil guidé (photo, personnes, notifications) | Absent | — | — | cherché : `onboarding guid`, `centres d'intérêt`, `interests`, `personnes à suivre` ; l'accueil s'arrête au formulaire |
| Identification des titulaires (SU01b) | Fermé | — | — | porte A1, A2, A5 ; seule l'empreinte du canal vérifié est gardée (`convex/modules/people/identity.ts`) ; normaliseur prêt : `packages/social-domain/src/civilName.ts` |
| Déclaration d'âge (SU01c) | Fermé | — | — | porte A3, A4 ; cherché : `birthDate`, `dateOfBirth`, `ageBracket`, `minAge` (aucune occurrence hors tests d'autres modules) |
| Session 7 jours, rafraîchie chaque jour, JWT 30 min relu côté serveur | Présent | oui | oui | `session.expiresIn/updateAge` dans `auth.ts`, `convex/lib/session.ts` (`getActiveIdentity`) |
| Retour après rechargement | Présent | oui | oui | `packages/api/src/cross-domain-session-bootstrap.ts`, `apps/antsia_mobile/src/lib/session-controller.ts` |
| Se déconnecter partout | Présent | oui | oui | `packages/api/src/sign-out-everywhere.ts`, `packages/social-native/src/sign-out.ts`, cliquet `tests/ratchets/sign-out-everywhere.test.ts` |
| Coordination entre onglets (verrou Web Locks) | Présent | oui | — | `apps/antsia_ga/src/lib/session-bridge-client.ts`, note vault du 21/10 |
| Passage d'une application à l'autre (jeton 3 min) | Présent | oui | — | `packages/api/src/use-sso-navigate.ts`, `apps/antsia_ga/src/app/api/session-bridge/route.ts` |
| Liste des sessions et appareils, fermeture à distance | Absent | — | — | cherché : `listSessions`, `list-sessions`, `revokeSession`, `revoke-other`, `appareils` ; seule la liste des abonnements push existe (`listMine` dans `convex/modules/notifications/pushSubscriptions.ts`) |
| Alerte de nouvelle connexion | Absent | — | — | cherché : `nouvelle connexion`, `new sign-in`, `newDevice`, `login alert` |
| Changer d'e-mail ou de téléphone | Absent | — | — | cherché : `changeEmail`, `change-email`, `changePhone`, `updatePhone` (seule trace : purge des identifiants `change-email-otp-` dans `convex/modules/people/erasure.ts`) |
| Récupérer un compte dont le canal est perdu | Absent | — | — | aucun parcours ; seule issue : IDN si déjà rattaché |
| Clés d'accès (passkeys) | Absent | — | — | cherché : `passkey`, `webauthn`, `clé d'accès` |
| Validation en deux étapes | Absent | — | — | aucun greffon `twoFactor` dans `auth.ts` ; le PIN IDN en tient lieu pour les comptes IDN |
| Plusieurs comptes sur un appareil | Absent | — | — | cherché : `switch account`, `changer de compte`, `ajouter un compte` |
| Langue (fr, en) et fuseau, enregistrés sur le compte | Présent | oui | oui | `apps/antsia_ga/src/components/preferences-controls.tsx`, `convex/modules/people/preferences.ts` |
| Apparence système / clair / sombre, posée avant l'affichage | Présent | oui | oui | `packages/social-features/src/shell/appearance/provider.tsx` et `boot-script.ts`, ADR-0026 |
| Thème (sept) enregistré sur le compte ; motif de fond | Présent | oui | oui | `apps/antsia_ga/src/components/{theme-picker,motif-picker}.tsx`, `apps/antsia_ga/src/lib/theme-account-sync.ts` |
| Taille du texte, réduction des animations | Absent | — | — | cherché : `taille du texte`, `textSize`, `fontScale`, `font size` |
| Page Paramètres | Partiel | oui | oui | `apps/antsia_ga/src/app/(membre)/parametres/settings-screen.tsx` : affichage et langue seulement ; ni compte, ni confidentialité, ni notifications |
| Profil privé ou retiré | Présent (plan 05) | oui | — | `withdrawMyProfile`, `setMyProfilePrivacy` ; `packages/social-features/src/features/reseau-personnel/ProfilePublicationCard.tsx` |
| Personnes bloquées | Présent (plan 05) | oui | — | `packages/social-features/src/features/reseau-personnel/BlockedPeopleSection.tsx` |
| Appels des personnes hors relations ; « ne pas déranger » | Présent (plan 01) | oui | — | `outsideRelationsCalls`, `setDnd` dans `convex/modules/calls/preferences.ts` |
| Qui peut m'écrire | Partiel (plan 01) | — | — | règle fixe : relation acceptée ou fil existant (SU01, § 2.2) ; aucun réglage |
| Mesure d'usage facultative | Présent | oui | — | `apps/antsia_ga/src/components/analytics-controls.tsx`, ADR-0010 |
| Export de mes données (paginé, reçu 24 h) | Présent | oui | — | `exportMyData`, `exportMyDataPage` dans `erasure.ts` ; `apps/antsia_ga/src/components/personal-controls.tsx` |
| Effacement avec 30 jours de grâce, annulation, reçu anonyme | Présent | oui | — | `ERASURE_GRACE_MS`, `requestErasure`, `cancelErasure` dans `erasure.ts` |
| Décisions, recours, mes signalements | Présent | oui | — | `personal-controls.tsx` (`Decisions`, `Reports`, `AppealForm`) |
| `/mes-donnees` ouverte au suspendu | Présent | oui | — | `apps/antsia_ga/src/app/mes-donnees/page.tsx` (hors coque membre) |
| Liste de mes consentements | Partiel | oui | — | huit finalités (`packages/social-domain/src/consent.ts`) ; seules la mesure d'usage, le récapitulatif et le reflet administratif se révoquent à l'écran |
| Texte du consentement conservé | Partiel | — | — | `consents.textVersion` garde une chaîne de version, pas le texte ni son empreinte (SU01, § 2.5) |
| Journal personnel du compte | Absent | — | — | cherché : `activity log`, `login history`, `historique`, `connexions récentes` |
| Cloche : 72 genres (33 communs, 25 DIASPORALE, 14 commerce), dédoublonnage | Présent | oui | oui | `convex/modules/notifications/{bell,notify,tables}.ts`, `packages/social-domain/src/notifications.ts`, `apps/antsia_mobile/src/screens/notifications-screen.tsx` |
| Pastille de non-lus (« 99+ ») | Présent | oui | oui | `packages/social-features/src/features/notifications/notification-center-tabs.ts` |
| Marquer lu, tout marquer lu, filtre Non lues | Présent | oui | oui | `markRead`, `markAllRead` dans `bell.ts` ; `NotificationsList.tsx` |
| Ouverture ciblée d'une notification | Présent | oui | oui | `convex/modules/notifications/open.ts`, `apps/antsia_ga/src/app/(membre)/notifications/ouvrir/page.tsx`, `nativeNotificationRoute` |
| Regroupement (« X et 3 autres ») | Absent | — | — | la clé est `genre|sujet|acteur` (`notificationDedupKey`) : une ligne par acteur ; seules les sections « Nouveau » et « Plus tôt » |
| Préférences par catégorie (six) pour push et récapitulatif | Présent | oui | — | `apps/antsia_ga/src/components/notification-controls.tsx`, `convex/modules/notifications/preferences.ts` |
| Préférences par genre | Absent | — | — | six catégories seulement (`NOTIFICATION_CATEGORIES`) |
| Plafond hebdomadaire (35, jusqu'à 100) | Présent | oui | — | `DEFAULT_WEEKLY_NOTIFICATION_LIMIT` dans `packages/social-domain/src/notificationDelivery.ts` |
| Pause ou horaires silencieux des notifications | Absent | — | — | cherché : `quietHours`, `heures calmes`, `silencieux`, `pause` ; seul le « ne pas déranger » des appels existe |
| Push Web (VAPID), message neutre, ouverture ciblée | Présent, non configuré | oui | — | `convex/modules/notifications/transports.ts`, `apps/antsia_ga/src/app/notifications-worker/route.ts`, `apps/antsia_ga/src/lib/notification-worker.ts` |
| Push natif des notifications sociales | Partiel | — | non | adaptateurs Expo, FCM, APNs côté moteur (`transports.ts`) ; aucune dépendance `expo-notifications` dans `apps/antsia_mobile/package.json` ; appels fermés par `NATIVE_CALLS_ENABLED=false` |
| Récapitulatif par e-mail (une fois par semaine au plus, opt-in) | Présent, fermé en production | oui | — | `convex/modules/notifications/digest.ts`, `reserveDigests` dans `deliveries.ts`, cron quotidien 07:00 UTC de `convex/crons.ts` |
| Désabonnement en un geste depuis l'e-mail | Absent | — | — | l'e-mail est un texte « N notifications » et une adresse ; aucun lien ni en-tête `List-Unsubscribe` |
| Réglages de notification dans Paramètres | Partiel | oui | — | seulement dans `/mes-donnees` (`PersonalControls` monte `NotificationControls`) |
| Rétention active (180 j après lecture, 365 j non lus) | Présent | — | — | `convex/modules/notifications/retention.ts` |
| Aucun contenu ni contact dans un transport | Présent | — | — | `tests/ratchets/notification-payload-content.test.ts`, `isNeutralNotificationPayload` |

Décompte : 34 Présent (dont 3 fermés en production faute de clés, 1 non configuré, 1 réservé à la démo et 3 relevant des plans 01 et 05), 8 Partiel, 14 Absent, 3 Fermé.

### Ce qui est écrit mais jamais recetté en réel

| Sujet | Ce qui est constaté | Source |
|---|---|---|
| Connexion IDN réelle | Faite par le propriétaire le 20/10 ; maintien après rechargement constaté | `docs/25`, `docs/29` |
| Échec du PIN IDN du 26/10 | « Connexion impossible pour le moment » ; cause non établie, journaux IDN inaccessibles | vault `diagnostic-idn-recette-production-2026-10-26.md` ; reprise § 10.1 |
| `/bienvenue` avec un vrai compte neuf | Corrigé et publié le 2/11, prouvé sur comptes fictifs ; formulaire non soumis en réel | `docs/recette/bienvenue-publication-2026-11-02/RAPPORT.md` |
| Changement entre deux identités réelles | Jamais exercé en production (une seule personne réelle) ; fait sur la démo | `docs/32`, `docs/33` |
| Codes e-mail et SMS | Non activés en production | reprise § 3.6 |
| Push Web, Expo, FCM, APNs | Aucune recette réelle ; `sent` n'est qu'une admission | `docs/07` ; reprise § 3.6 |
| Récapitulatif e-mail | Jamais envoyé à une vraie boîte | `docs/07` |
| IDN natif sur iPhone physique | Jamais fait | reprise § 10.3 |
| Export et effacement | Testés sur données fictives ; aucun effacement réel | `docs/07` |

## 3. Comparaison avec les applications de référence

| Capacité | Instagram / Facebook | WhatsApp | Telegram | LinkedIn | ANTSIA | Verdict |
|---|---|---|---|---|---|---|
| Connexion sans mot de passe | non (mot de passe) | oui (numéro et code) | oui (code) | non | IDN ou code | Déjà fait |
| Clés d'accès (Apple, Google) | partiel | oui | non vérifié | oui | non | À adapter (CN-14, retour rapide, jamais à la place d'IDN) |
| Validation en deux étapes | oui | oui (PIN) | oui | oui | PIN d'IDN seulement | Écarté pour les comptes IDN ; clé d'accès pour les autres |
| Liste des appareils, fermer une session | oui | oui (appareils liés) | oui (sessions actives) | oui | « partout » seulement | À faire (CN-03) |
| Alerte de nouvelle connexion | oui | oui (nouvel appareil lié) | oui (message du service) | oui | non | À faire (CN-04) |
| Changer d'e-mail ou de numéro | oui | oui (changer de numéro) | oui | oui | non | À faire (CN-05) |
| Récupération de compte | oui (e-mail, pièce) | par numéro | par numéro | oui | non | À adapter (CN-05 : second moyen, IDN) |
| Plusieurs comptes | oui | oui (deux) | oui | non | non | Écarté : une personne, un handle (ADR-0002) |
| Désactivation temporaire | oui | non | non | oui | profil retiré (plan 05) | À adapter : ranger « Retirer mon profil » dans Compte (CN-06) |
| Suppression avec délai de grâce | oui (30 j) | immédiate | auto après inactivité | oui | 30 j, annulable | Déjà fait |
| Télécharger mes données | oui | rapport du compte | oui | oui | oui | Déjà fait |
| Historique d'activité | oui (« Votre activité ») | non | sessions | oui | non | À faire (CN-13) |
| Confidentialité par champ | oui | oui (vu à, photo, statut…) | oui | oui | profil privé, appels | À adapter : rubrique qui relie les réglages réels (CN-06) |
| Personnes bloquées | oui | oui | oui | oui | oui (plan 05) | Déjà fait ; à relier (CN-06) |
| Pause et mode silencieux | oui | sourdine par conversation | oui | non vérifié | « ne pas déranger » des appels | À faire (CN-07) |
| Réglages par genre et par canal | oui | par conversation | par conversation | oui (appli, push, e-mail) | six catégories, deux canaux | À adapter (CN-07) |
| Regroupement des avis | oui | — | — | oui | non | À faire (CN-08) |
| Récapitulatif e-mail | oui | non | non | oui | oui, hebdomadaire au plus | Déjà fait ; recette à faire (CN-09) |
| Désabonnement en un geste | oui | — | — | oui | non | À faire (CN-09) |
| Langue de l'interface | oui | oui | oui | oui | fr, en | Déjà fait |
| Taille du texte | non vérifié | oui | oui | non vérifié | non | À faire (CN-15) |
| Choix du thème | sombre seulement | sombre, fond | thèmes | sombre | sept thèmes, motif | Déjà fait (différenciant) |
| Accueil guidé (personnes, intérêts) | oui | non | non | oui | non | À adapter (CN-11), sans profilage |

## 4. Ce qui manque

### 4.1 Bloquant avant l'ouverture au public

1. **Prouver l'entrée réelle** : PIN IDN du 26/10 inexpliqué, `/bienvenue` jamais soumis en réel, deux identités jamais enchaînées en production (CN-01).
2. **Décider et ouvrir les comptes légers** : aujourd'hui, en production, seule la porte IDN fonctionne ; e-mail et SMS sont fermés faute de clés (CN-02, décision D1).
3. **Identification et déclaration d'âge** à l'inscription, dès que le juriste a tranché A1 à A5 (SU01b et SU01c, volet inscription).

### 4.2 Attendu par les utilisateurs

4. Voir et fermer ses sessions appareil par appareil (CN-03), être prévenu d'une nouvelle connexion (CN-04).
5. Changer d'e-mail ou de téléphone, garder un second moyen pour ne pas perdre son compte (CN-05).
6. Des Paramètres rangés : Compte, Confidentialité, Notifications, Affichage, Mes données (CN-06).
7. Mettre les notifications en pause, fixer des horaires silencieux (CN-07) ; une cloche regroupée (CN-08).
8. Se désabonner du récapitulatif en un geste (CN-09) ; recevoir réellement les push Web (CN-10).
9. Un accueil qui guide vers une photo, des pages et des personnes à suivre, l'activation des notifications et IDN ; un identifiant vérifié pendant la saisie (CN-11).
10. Voir ses consentements, avec leur date et leur texte (CN-12).

### 4.3 Différenciant pour ANTSIA

- **Élévation IDN mise en avant** : bannière discrète pour un compte léger, rappel dans Compte et dans l'accueil (CN-06, CN-11). Aucun concurrent n'offre un badge adossé à l'identité nationale, gratuit.
- **Faible débit et coût des données** : clés d'accès pour revenir sans payer un SMS (CN-14) ; récapitulatif en texte sans image (déjà le cas) ; push neutres, très courts (déjà le cas).
- **Journal personnel lisible** (CN-13) : connexions, changements de moyens, demandes d'export ou d'effacement, consentements ; il prouve aussi les « demandes datées » de l'article 15 (avec le plan 12).
- **Souveraineté** : aucune donnée de localisation ni adresse IP montrée ou conservée sans besoin (décision D3).

### 4.4 Écarté ou reporté, et pourquoi

| Sujet | Décision | Raison |
|---|---|---|
| Mot de passe | Écarté | EXF-AN-09 ; ADR-0002 |
| Plusieurs comptes | Écarté | Une personne, un handle (ADR-0002, invariant) ; les pages ont leurs signataires |
| Validation en deux étapes propre | Écarté | IDN porte déjà son PIN ; pour un compte léger, la clé d'accès (CN-14) et l'élévation IDN suffisent |
| Centres d'intérêt à l'accueil | Reporté | Fil chronologique sans profilage (SU01, § 2.2) ; profilage interdit pour les mineurs (A3) |
| Récupération manuelle par le support | Écarté (recommandation D6) | Risque d'usurpation (art. 51-52 de l'ordonnance) ; IDN ou second moyen |
| Push natif, réglages natifs | Reporté au plan 14 | Session S3 ; dépend des clés Expo, FCM, APNs |
| Réglage « qui peut m'écrire » | Plan 01 | Relève d'iCom |
| Identification, âge : règles juridiques | Plan 12 | Analyse et lots SU01b, SU01c ; ce plan ne porte que les écrans d'inscription |

## 5. Lots d'implémentation

### CN-01 — Recette réelle de l'entrée et des sessions · priorité P0 · taille S · session S1
- **Pour l'utilisateur** : l'entrée par IDN, l'accueil et la sortie marchent avec de vraies identités.
- **Backend** : aucun code prévu ; diagnostic du refus PIN avec le statut et l'erreur serveur de la tentative, ou les journaux IDN.
- **Web** : parcours sur la production : IDN neuf → `/bienvenue` soumis → `/fil` → rechargement ×3 → second compte IDN (A → B → A) dans deux onglets → « Se déconnecter partout ».
- **Mobile** : après le web ; IDN natif sur iPhone physique relève du plan 14.
- **Données personnelles** : aucune capture de PIN, code, jeton ou cookie ; empreintes tronquées seulement (méthode de `docs/32`).
- **Tests et cliquets** : aucun nouveau ; si un défaut est trouvé, test de régression avant correctif.
- **Critères d'acceptation** : rapport daté sous `docs/recette/entree-reelle-<date>/RAPPORT.md` ; profil publié par le formulaire réel ; zéro session restante après la sortie ; cause du refus PIN établie ou renvoyée à IDN avec preuve.
- **Dépend de** : second compte IDN réel ; accès aux journaux IDN (reprise § 3.5).
- **Porte** : propriétaire (second compte, journaux) ; publication si un correctif est nécessaire.

### CN-02 — Comptes légers en production : e-mail puis SMS · priorité P0 · taille M · session S1
- **Pour l'utilisateur** : entrer avec son e-mail ou son numéro gabonais quand on n'a pas encore d'IDN.
- **Backend** : rien à écrire pour ouvrir (portes déjà codées dans `settings.ts`, `delivery.ts`) ; relire les gabarits `otpMessage` (`packages/social-contracts/src/authentication.ts`) : marque, durée, « ne partagez pas ce code » ; vérifier que le budget de `authRateLimit.ts` borne le coût SMS par numéro et par origine.
- **Web** : aucune modification attendue ; vérifier les états « indisponible » d'`IdentityEntry` après ouverture.
- **Mobile** : vérifier `apps/antsia_mobile/src/components/entry.tsx` avec les mêmes portes.
- **Données personnelles** : l'adresse et le numéro vivent dans le composant Better Auth ; le moteur ne garde qu'une empreinte (`identityLinks.local`) ; déjà dans l'export et l'effacement.
- **Tests et cliquets** : test de configuration (porte ouverte seulement avec les variables complètes, déjà dans `settings.test.ts`) ; recette de réception réelle sur une boîte et un téléphone de test.
- **Critères d'acceptation** : code reçu en moins d'une minute sur une boîte de test et sur un numéro de test ; compte léger créé, badge Communauté ; trois essais faux bloqués ; renvoi temporisé.
- **Dépend de** : D1, D2 ; domaine d'envoi.
- **Porte** : clés Resend et passerelle SMS (propriétaire) ; publication.

### CN-03 — Appareils et sessions actives · priorité P1 · taille M · session S1
- **Pour l'utilisateur** : Paramètres > Compte > Appareils : « Cet appareil », puis chaque session (type d'appareil, navigateur ou application, dernière activité), bouton « Fermer cette session » et « Fermer les autres ».
- **Backend** : `personQuery` `people.sessions.listMine` qui lit les sessions Better Auth du sujet (bornée à 50, `// borné : sessions d'une personne`) et rend une projection : identifiant opaque, libellé d'appareil dérivé du navigateur côté serveur, application, `updatedAt`, `current` ; jamais l'IP ni le jeton. `personMutation` `revokeSession({ sessionRef })` et `revokeOtherSessions({})` par l'adaptateur du composant (ou les points `list-sessions`, `revoke-session`, `revoke-other-sessions` de Better Auth, à vérifier dans la version 1.6.25). Désactiver la souscription push liée (`pushSubscriptions.sessionId`) dans la même transaction. Débit : seau `person.session`.
- **Web** : route `routes.settingsDevices()` dans `apps/antsia_ga/src/lib/routes.ts`, écran sous `(membre)/parametres/appareils` ; états chargement, vide impossible (au moins la session courante), erreur ; confirmation avant fermeture des autres.
- **Mobile** : après le web (plan 14).
- **Données personnelles** : appliquer D3 (suivi d'IP désactivé si l'option existe dans Better Auth) ; libellé d'appareil exporté avec les sessions ; purge déjà couverte par l'effacement du composant.
- **Tests et cliquets** : vraie session du composant (`createTestSession`) ; une session fermée refuse immédiatement lecture et écriture ; impossible de fermer la session d'autrui ; projection sans IP ni jeton.
- **Critères d'acceptation** : deux navigateurs connectés, fermer l'un depuis l'autre : il revient à `/entrer` sans alerte ; « Fermer les autres » laisse la session courante.
- **Dépend de** : CN-06 (rubrique Compte) ; D3.
- **Porte** : aucune.

### CN-04 — Alerte de nouvelle connexion · priorité P1 · taille M · session S1
- **Pour l'utilisateur** : un avis « Nouvelle connexion à votre compte » avec l'appareil et la date, et un lien vers Appareils.
- **Backend** : genre `new_sign_in` dans `NOTIFICATION_KINDS` (`packages/social-domain/src/notifications.ts`) et son validateur ; avis système sans acteur, sujet absent, émis par `notify.ts` (seul écrivain, cliquet `notifications-writer`) depuis le crochet de création de session (`databaseHooks` ou greffon de `auth.ts`), sauf première session du compte ; catégorie `network`. Selon D5, un e-mail transactionnel neutre (marque, date, lien) par `delivery.ts`.
- **Web** : phrase et cible dans `notification-targets.ts`, ouverture vers Appareils.
- **Mobile** : phrase dans `apps/antsia_mobile/src/lib/native-notifications.ts` (S3, après le web).
- **Données personnelles** : aucune IP, ville ni navigateur dans la notification ; seulement le libellé grossier lu à l'ouverture.
- **Tests et cliquets** : `notification-payload-content` et `i18n-locales` verts ; pas d'avis à la première session ; pas d'avis pour un passage entre applications (jeton à usage unique).
- **Critères d'acceptation** : connexion depuis un second navigateur → avis dans la cloche du premier, ouvrant Appareils.
- **Dépend de** : CN-03 ; CN-02 pour l'e-mail.
- **Porte** : D5.

### CN-05 — Moyens de connexion et récupération · priorité P1 · taille M · session S1
- **Pour l'utilisateur** : Paramètres > Compte > Moyens de connexion : IDN (rattaché ou « Vérifier avec IDN »), e-mail, téléphone ; ajouter un second moyen, changer, retirer (jamais le dernier) ; conseil « Ajoutez un second moyen pour ne pas perdre l'accès ».
- **Backend** : changement par code envoyé au NOUVEAU canal, puis avis au canal précédent ; mise à jour de l'empreinte `identityLinks.local` par `linkLocal({})` (aucun contact en argument, ADR-0008) ; refus si le canal appartient à une autre personne (refus indistinct) ; débit `person.contact`. Vérifier le type `change-email` du greffon emailOTP et la mise à jour de numéro du greffon `phoneNumber` dans la version installée.
- **Web** : écran `(membre)/parametres/connexion`, React Hook Form + Zod, code à six chiffres avec `autocomplete="one-time-code"` comme `IdentityEntry`.
- **Mobile** : après le web.
- **Données personnelles** : export du compte déjà fourni (`exportMyData` : e-mail, téléphone, vérifications) ; journaliser le changement dans CN-13.
- **Tests et cliquets** : collision refusée ; ancien canal prévenu ; dernier moyen non retirable ; session OTP qui ne peut revendiquer IDN.
- **Critères d'acceptation** : un compte e-mail ajoute un téléphone puis se reconnecte par SMS : même personne, même identifiant.
- **Dépend de** : CN-02 ; CN-06.
- **Porte** : D6.

### CN-06 — Paramètres rangés en rubriques · priorité P1 · taille M · session S1
- **Pour l'utilisateur** : une page Paramètres lisible : **Compte** (moyens de connexion, appareils, identité IDN, retirer mon profil, supprimer mon compte), **Confidentialité** (profil privé, personnes bloquées, appels hors relations, annuaire), **Notifications**, **Affichage** (apparence, thème, motif, taille du texte), **Langue et région**, **Mes données**.
- **Backend** : aucun ; chaque ligne mène au contrôle qui a déjà un effet serveur.
- **Web** : `settings-screen.tsx` devient un sommaire ; sous-pages déclarées dans `routes.ts` ; `NotificationControls` rendu aussi sous `(membre)/parametres/notifications` en gardant `/mes-donnees` pour le suspendu ; bannière d'élévation IDN discrète pour un compte léger, fermable, avec mémoire par réseau (`demoStorageNamespace`). Pleine largeur (`SCREEN_SECTIONS`), un seul bouton plein par zone.
- **Mobile** : `NATIVE_PROFILE_ENTRIES` (profil natif) suit le même sommaire au plan 14.
- **Données personnelles** : aucune nouvelle.
- **Tests et cliquets** : `member-screens-full-width`, `no-hardcoded-strings`, `no-hardcoded-urls`, `i18n-locales` ; test de rendu de chaque rubrique ; aucune ligne pour une fonction absente.
- **Critères d'acceptation** : depuis Profil ou le rail, chaque réglage existant est atteint en deux gestes ; les liens vers les plans 01 et 05 ouvrent leur écran réel.
- **Dépend de** : plans 01 et 05 (contrôles existants).
- **Porte** : aucune.

### CN-07 — Pause et horaires silencieux des notifications · priorité P1 · taille M · session S1
- **Pour l'utilisateur** : « Suspendre les notifications » (1 h, 8 h, jusqu'à demain matin) ; horaires silencieux (par exemple 22 h – 7 h, dans son fuseau) ; les avis restent dans la cloche.
- **Backend** : champs `pausedUntil` et `quietHours: { start, end }` (minutes locales) dans `notificationPreferences` (`convex/modules/notifications/tables.ts`) ; règle pure `isQuietNow(prefs, timeZone, now)` dans `packages/social-domain/src/notificationDelivery.ts` ; relue dans `deliveries.ts` avant chaque transport (report à la fin de la plage, pas d'annulation) ; les appels gardent leur propre « ne pas déranger » ; aucune consommation du plafond pendant la pause.
- **Web** : contrôles dans la rubrique Notifications (CN-06).
- **Mobile** : après le web.
- **Données personnelles** : champs exportés avec les préférences, effacés avec elles.
- **Tests et cliquets** : passage d'heure d'été d'un fuseau étranger, plage qui chevauche minuit, pause échue ; aucun transport pendant la plage.
- **Critères d'acceptation** : avec une plage active, un avis entre dans la cloche, son push part à la fin de la plage.
- **Dépend de** : CN-06 ; D8.
- **Porte** : aucune.

### CN-08 — Cloche regroupée · priorité P1 · taille M · session S1
- **Pour l'utilisateur** : « Awa NDONG et 3 autres ont réagi à votre publication » au lieu de quatre lignes.
- **Backend** : regroupement à la lecture dans `paginateNotifications` (`bell.ts`) par `genre|sujet` pour les genres sociaux (réactions, commentaires, partages, nouveaux abonnés), sur la page lue : premier acteur visible, nombre d'autres acteurs visibles après relecture des blocages ; aucune écriture nouvelle ; marquer lu marque le groupe.
- **Web** : `ReseauNotificationRow.tsx`, phrases au pluriel dans `notifications.json` (fr, en) ; mobile après le web.
- **Données personnelles** : aucune nouvelle.
- **Tests et cliquets** : un acteur bloqué ne compte pas ; « 99+ » inchangé ; actions (accepter une connexion) jamais regroupées.
- **Critères d'acceptation** : cinq réactions de cinq membres → une ligne, le compte exact, l'ouverture vers la publication.
- **Dépend de** : aucun.
- **Porte** : aucune.

### CN-09 — Récapitulatif e-mail : désabonnement et recette · priorité P1 · taille M · session S1
- **Pour l'utilisateur** : un lien « Ne plus recevoir ce récapitulatif » qui agit sans se connecter ; un e-mail lisible.
- **Backend** : jeton signé (HMAC, réseau, personne, finalité, expiration 60 jours) vérifié par une route HTTP de `convex/http.ts` qui révoque le consentement `email_digest` et coupe `emailDigest` ; en-têtes `List-Unsubscribe` et `List-Unsubscribe-Post` (RFC 8058) dans `digest.ts` ; corps texte et HTML neutres (nombre, lien d'ouverture, lien de désabonnement, lien vers Paramètres) ; débit par adresse IP du point HTTP.
- **Web** : page de confirmation publique sans donnée personnelle, route dans `routes.ts`.
- **Mobile** : sans objet.
- **Données personnelles** : aucun jeton stocké ; le retrait est journalisé (CN-13).
- **Tests et cliquets** : jeton altéré ou expiré refusé ; second clic idempotent ; `notification-payload-content` vert.
- **Critères d'acceptation** : un récapitulatif réel reçu sur une boîte de test ; un clic coupe le suivant.
- **Dépend de** : CN-02 (Resend), CN-12.
- **Porte** : clé Resend et secret de signature (propriétaire) ; publication.

### CN-10 — Push Web réel · priorité P1 · taille S · session S1
- **Pour l'utilisateur** : activer les notifications du navigateur au moment utile (après une première réaction ou un premier message), pas au chargement.
- **Backend** : rien à écrire ; configuration `VAPID_SUBJECT`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `NOTIFICATION_APPLICATIONS_JSON` (propriétaire).
- **Web** : invitation contextuelle qui mène au contrôle existant (`enableWebNotifications`) ; mention « sur iPhone, ajoutez d'abord ANTSIA à l'écran d'accueil » quand le navigateur l'exige.
- **Mobile** : sans objet (natif au plan 14).
- **Données personnelles** : inchangées.
- **Tests et cliquets** : aucun nouveau prompt au montage (règle PA5) ; test de l'invitation.
- **Critères d'acceptation** : réception constatée sur Chrome Android, un navigateur de bureau et Safari iOS en écran d'accueil ; ouverture ciblée ; matrice consignée dans un rapport de recette.
- **Dépend de** : CN-06.
- **Porte** : clés VAPID et configuration (propriétaire) ; publication.

### CN-11 — Accueil guidé et identifiant vérifié en direct · priorité P1 · taille M · session S1
- **Pour l'utilisateur** : après « Rejoindre », trois étapes facultatives et passables : photo de profil, suivre des pages Officielles et des membres proposés, activer les notifications ; pour un compte léger, « Vérifier avec IDN ». Pendant la saisie de l'identifiant, « disponible » ou « déjà pris ».
- **Backend** : rien de nouveau : `isHandleAvailable`, `setMyAvatar`, suggestions existantes (`convex/modules/suggestions/suggestions.ts`), pages suivies (plan 07).
- **Web** : `welcome-screen.tsx` appelle `isHandleAvailable` après une pause de frappe (patron de `HandleChoiceCard.tsx`) ; étapes sous `/bienvenue` ou un panneau du fil à la première visite, mémorisé par réseau.
- **Mobile** : `native-onboarding.tsx` au plan 14.
- **Données personnelles** : aucune nouvelle ; aucune case précochée.
- **Tests et cliquets** : chaque étape passable ; mesure d'usage seulement si consentie (`useOnboardingUsage`).
- **Critères d'acceptation** : un compte neuf arrive au fil avec ou sans les étapes ; aucune liste vide affichée (pas de suggestion → étape masquée).
- **Dépend de** : plans 05 et 07 (suggestions, pages), CN-10.
- **Porte** : aucune.

### CN-12 — Mes consentements · priorité P1 · taille S · session S1
- **Pour l'utilisateur** : une liste des finalités en vigueur (profil social, annuaire, notifications, récapitulatif, mesure d'usage, talents, reflet administratif), avec date, version et texte, et « Retirer » quand le retrait est permis ; conséquence expliquée avant le retrait.
- **Backend** : `personQuery` `consents.listMine` (bornée par finalité) ; empreinte SHA-256 du texte de chaque version dans `CONSENT_TEXT_VERSIONS` (`packages/social-domain/src/consent.ts`), stockée à l'accord (`consents.textHash`) ; le retrait de `social_profile` renvoie vers « Retirer mon profil » (plan 05).
- **Web** : section de `/mes-donnees` et de Paramètres > Confidentialité.
- **Données personnelles** : exportées ; effacées avec la personne.
- **Tests et cliquets** : texte publié et empreinte cohérents (test) ; `i18n-locales`.
- **Critères d'acceptation** : chaque consentement en vigueur est visible avec sa date ; un retrait est effectif immédiatement.
- **Dépend de** : plan 12 (SU01e : textes juridiques).
- **Porte** : aucune pour l'écran ; textes relus par le juriste.

### CN-13 — Journal personnel du compte · priorité P2 · taille M · session S1
- **Pour l'utilisateur** : « Activité du compte » : connexions, sessions fermées, moyens changés, consentements, export demandé, effacement demandé ou annulé, recours déposés.
- **Backend** : table `accountEvents` (`personId`, `kind` fermé, `at`, `deviceLabel` facultatif), index `by_person_at` ; écrite par les mutations concernées ; lecture paginée `personQuery` ; rétention 12 mois (cron) ; aucun contenu, aucune IP.
- **Web** : Paramètres > Compte > Activité du compte.
- **Données personnelles** : classée dans `dataPolicies.ts`, exportée, effacée (`erasure.test.ts` vérifie la couverture du schéma).
- **Tests et cliquets** : couverture d'effacement ; pagination ; aucune écriture hors des mutations prévues.
- **Critères d'acceptation** : chaque geste listé apparaît une fois, daté dans le fuseau personnel.
- **Dépend de** : CN-03, CN-05, CN-12 ; plan 12 (SU01e, demandes datées).
- **Porte** : aucune.

### CN-14 — Clés d'accès pour revenir sans code · priorité P2 · taille M · session S1
- **Pour l'utilisateur** : sur un appareil déjà connecté, « Créer une clé d'accès » ; ensuite, entrée par Face ID, empreinte ou code de l'appareil, sans SMS.
- **Évaluation** : une clé d'accès n'est pas un mot de passe (rien à retenir ni à réinitialiser ; secret jamais transmis) : elle ne contredit pas EXF-AN-09. Elle ne remplace pas IDN : elle ne crée pas de compte, ne porte pas de niveau de garantie, ne donne aucun badge ; la console exige toujours une session scellée par IDN (ADR-0039). Gain : moins de SMS payants, entrée rapide en 3G.
- **Backend** : greffon passkey de Better Auth (paquet et API à vérifier pour 1.6.25 ; ajout au catalogue du `package.json`, S1) ; inscription seulement depuis une session vivante ; table du composant incluse dans l'effacement et l'export.
- **Web** : Moyens de connexion (CN-05) ; bouton « Entrer avec une clé d'accès » dans `IdentityEntry`, après IDN.
- **Mobile** : plan 14 (associations de domaine).
- **Tests et cliquets** : une session ouverte par clé ne revendique ni `loa` ni badge ; retrait d'une clé ; effacement.
- **Critères d'acceptation** : entrée par clé sur un navigateur de test ; console refusée avec cette session.
- **Dépend de** : CN-05 ; ADR complétant l'ADR-0002.
- **Porte** : D4.

### CN-15 — Taille du texte et animations réduites · priorité P2 · taille S · session S1
- **Pour l'utilisateur** : « Taille du texte » (normale, grande, très grande) et « Réduire les animations » (suivre le système par défaut).
- **Backend** : aucun ; préférence d'appareil comme l'apparence (ADR-0026, § 5), posée par le script d'amorçage.
- **Web** : `appearanceBootScript` et le fournisseur posent un attribut sur `<html>` ; jetons de taille dans `packages/ui/src/styles` ; contrôle dans Affichage.
- **Mobile** : plan 14 (le système règle déjà la taille).
- **Tests et cliquets** : parité script/fournisseur (comme les 300 cas d'ADR-0026) ; `no-hardcoded-colors` ; recette 390 px en « très grande ».
- **Critères d'acceptation** : aucun texte tronqué ni débordement horizontal à 390 px.
- **Dépend de** : CN-06.
- **Porte** : aucune.

### SU01b (volet inscription) — Fiche d'identification à l'inscription · priorité P0 · taille L · session S1
- **Pour l'utilisateur** : après le consentement, une étape « Vos informations d'identification » privée, jamais affichée : NOM et Prénoms (normaliseur `civilName.ts`), domicile (ville, quartier), téléphone vérifié (réutilise CN-05) ; préremplissage proposé par IDN si A1 l'admet ; comptes existants invités à la connexion suivante, avec un délai annoncé.
- **Backend** : la table et ses accès sont définis au plan 12 (`accountIdentities`) ; ce volet n'ajoute que l'étape et son état (`identificationCompletedAt`) lu par `useSessionState`.
- **Web** : étape de `/bienvenue` ; écran de régularisation ; textes expliquant pourquoi (art. 4) et qui y a accès.
- **Données personnelles** : export complet ; conservation après effacement selon A2 (plan 12).
- **Critères d'acceptation** : impossible de rejoindre le réseau sans fiche quand le réglage est actif ; rien de la fiche n'apparaît dans un profil, une recherche, une notification.
- **Dépend de** : plan 12 (SU01b), CN-05.
- **Porte** : **avis du juriste A1, A2, A5** ; qualification de l'interconnexion IDN (loi 025/2023, art. 81).

### SU01c (volet inscription) — Déclaration d'âge · priorité P0 · taille M · session S1
- **Pour l'utilisateur** : date de naissance ou tranche déclarée à l'inscription ; refus avant 16 ans avec explication ; régime 16-17 ans selon A3.
- **Backend** : stockage privé et règles au plan 12 (SU01c) ; ici l'étape et le refus sans création d'adhésion.
- **Web** : étape de `/bienvenue` ; écran de refus neutre ; mobile au plan 14.
- **Données personnelles** : seulement ce qu'A3 et A4 exigent ; aucune pièce conservée.
- **Critères d'acceptation** : une déclaration de moins de 16 ans ne crée aucune adhésion ; un compte existant déclare son âge à la connexion suivante.
- **Dépend de** : plan 12 (SU01c, MC-06).
- **Porte** : **avis du juriste A3, A4** ; référentiel de la HAC pour la vérification effective.

## 6. Ordre recommandé et dépendances

| Vague | Lots | Pourquoi dans cet ordre |
|---|---|---|
| 1 | CN-01, CN-02 | Rien ne s'ouvre au public sans entrée prouvée ; deux portes déjà codées, seules les clés et la recette manquent |
| 2 | CN-06, CN-11, CN-08 | Le sommaire range l'existant ; l'accueil et la cloche sont vus par tous dès le premier jour ; aucun fichier partagé sauf textes |
| 3 | CN-03, CN-05, CN-04, CN-12 | Sécurité du compte ; CN-04 suit CN-03 ; CN-05 suit CN-02 |
| 4 | CN-07, CN-09, CN-10 | Notifications sortantes : utiles seulement quand les transports réels existent |
| 5 | SU01b, SU01c (volets inscription) | Dès les arbitrages écrits A1 à A5 ; avant toute ouverture d'un nouvel univers |
| 6 | CN-13, CN-14, CN-15 | Différenciants ; CN-14 après décision D4 |

Dépendances vers d'autres plans : **01** (réglages d'appel, « qui peut m'écrire »), **05** (profil privé ou retiré, personnes bloquées, suggestions), **07** (pages à suivre à l'accueil), **12** (SU01b, SU01c, SU01e : tables, règles et textes juridiques), **13** (console : compteurs de sessions et de transports, santé des envois), **14** (push natif, entrée et réglages natifs, IDN sur iPhone physique), **15** (DIASPORALE : `requestCode` refuse le téléphone, expéditeur par réseau).

## 7. Décisions à prendre par le propriétaire

1. **D1 — Portes à l'ouverture.** Recommandation : IDN en premier, plus l'e-mail dès l'ouverture, le SMS ensuite avec un budget mensuel. Raison : l'e-mail coûte peu ; le SMS a un coût par envoi et attire les abus.
2. **D2 — Expéditeur et domaine des e-mails.** Recommandation : une adresse d'envoi sur le domaine de production, configurée chez Resend (SPF, DKIM). Raison : un e-mail de code venant d'un domaine provisoire finit en indésirables.
3. **D3 — Adresse IP et navigateur dans les sessions.** Recommandation : désactiver le suivi d'IP s'il est réglable, garder un libellé d'appareil grossier. Raison : minimisation (loi 025/2023, art. 70 ; SU01, § 2.6).
4. **D4 — Clés d'accès.** Recommandation : oui, en P2, pour revenir sur un appareil connu, jamais pour créer un compte ni porter un badge. Raison : économise des SMS et ne contredit pas « jamais de mot de passe ».
5. **D5 — Alerte de connexion par e-mail.** Recommandation : oui, en plus de la cloche, si l'adresse est vérifiée. Raison : la cloche n'est pas vue si l'intrus est déjà connecté.
6. **D6 — Compte dont le canal est perdu.** Recommandation : pas de récupération manuelle par le support ; IDN ou second moyen. Raison : un support qui rend des comptes devient la cible d'usurpations.
7. **D7 — Faire trancher A1 à A5 par un juriste.** Recommandation : en priorité. Raison : SU01b et SU01c précèdent toute ouverture d'un nouvel univers.
8. **D8 — Horaires silencieux par défaut.** Recommandation : désactivés par défaut, proposés à l'accueil. Raison : aucun réglage imposé sans geste.

## 8. Risques et points d'attention

- **Transports non prouvés** : e-mail, SMS et push ne sont ni activés ni recettés. Un statut `sent` est une admission par le fournisseur, pas une réception. Chaque lot qui envoie se termine par une recette sur un vrai appareil ou une vraie boîte.
- **API de Better Auth à vérifier** : liste et fermeture de sessions, changement d'e-mail, mise à jour du numéro, greffon passkey, désactivation du suivi d'IP. La copie de lecture n'a pas de `node_modules` : lire les sources de la version 1.6.25 installée avant de coder.
- **Usurpation par changement de moyen** : code au nouveau canal, avis à l'ancien, journal ; aucun contact en argument d'une fonction de liaison (ADR-0008).
- **Réglage sans effet serveur** : la pause et les horaires silencieux doivent être relus dans `deliveries.ts`, pas seulement à l'écran.
- **Contenu dans les notifications** : toute nouvelle phrase passe par la cloche ; le transport ne porte que le nombre et l'adresse d'ouverture.
- **Nouvelles données** : `accountEvents`, `textHash`, préférences de pause : classées dans `dataPolicies.ts`, exportées, effacées ; `erasure.test.ts` échoue sinon.
- **Safari iOS** : le push Web n'existe qu'après ajout à l'écran d'accueil ; ne pas promettre plus.
- **Coût des SMS** : sans plafond par numéro et par origine, une attaque par envoi en masse coûte cher.
- **Fichiers partagés** : genre `new_sign_in`, champs de `notificationPreferences`, `consents.textHash`, table `accountEvents`, dépendance passkey : S1 seule.
- **Écran `/mes-donnees`** : il reste la porte du suspendu ; ne pas y retirer les notifications ni les préférences en les déplaçant vers Paramètres.

## 9. Prompts d'implémentation

### Prompt CN-01 — Recette réelle de l'entrée

```text
Tu exécutes le lot CN-01 du plan 06 d'ANTSIA. Écris-moi toujours en français. Utilise Opus, jamais de sous-agent Sonnet.
Lis : CLAUDE.md ; docs/etudes/2026-11-09-finalisation/06_COMPTE_IDENTITE_PARAMETRES_NOTIFICATIONS.md § 2 et lot CN-01 ; docs/25, docs/29, docs/32, docs/33 ; docs/recette/bienvenue-publication-2026-11-02/RAPPORT.md ; la note vault diagnostic-idn-recette-production-2026-10-26.md.
Périmètre : aucune modification de code au départ. Tu observes la production avec moi.
Fais : (1) demande-moi de saisir moi-même le PIN IDN d'un compte neuf ; (2) constate /bienvenue, soumets le formulaire avec le nom et l'identifiant que je te donne ; (3) recharge trois fois /fil ; (4) avec mon second compte IDN, enchaîne A → B → A dans deux onglets ; (5) « Se déconnecter partout », puis vérifie zéro session par une projection bornée sans jeton.
Ne saisis jamais un PIN, ne copie aucun code, jeton ou cookie. Preuves en empreintes tronquées.
Si le PIN échoue encore, relève le statut et l'erreur de la tentative et demande-moi l'accès aux journaux IDN avant toute hypothèse.
Livre docs/recette/entree-reelle-<date>/RAPPORT.md. Si un défaut de code apparaît, écris d'abord le test de régression, corrige, bun run verify, et demande-moi l'accord écrit avant toute publication.
```

### Prompt CN-02 — Comptes légers en production

```text
Tu exécutes le lot CN-02 du plan 06 d'ANTSIA. Écris-moi toujours en français. Utilise Opus, jamais de sous-agent Sonnet.
Lis : CLAUDE.md ; le plan 06 § 1, § 2 et lot CN-02 ; docs/05_RAPPORT_IDENTITE_PA4.md ; convex/betterAuth/{auth,settings,delivery}.ts ; packages/social-contracts/src/authentication.ts ; convex/modules/platform/authRateLimit.ts.
Vérifie d'abord que les portes s'ouvrent seulement avec RESEND_API_KEY + RESEND_FROM_ADDRESS (e-mail) et SMS_PROVIDER=webhook + SMS_ENDPOINT + SMS_API_KEY (SMS). Ne touche à aucun fichier .env ni variable : tu me donnes la liste exacte, je la pose.
Relis les messages de code (fr, en) : marque, durée de validité, avertissement de non-partage. Vérifie que le débit borne les envois par adresse, par numéro et par origine ; propose un plafond si un manque existe, avec test.
Livre : corrections éventuelles et tests, bun run verify vert, puis, après ma configuration, la recette de réception sur une boîte et un numéro de test (délai mesuré, trois essais faux, renvoi temporisé), consignée dans docs/recette/.
Arrête-toi avant toute publication et à la décision D1 (portes à l'ouverture).
```

### Prompt CN-03 — Appareils et sessions actives

```text
Tu exécutes le lot CN-03 du plan 06 d'ANTSIA. Écris-moi toujours en français. Utilise Opus, jamais de sous-agent Sonnet.
Lis : CLAUDE.md (pièges PA4) ; le plan 06 lot CN-03 ; ADR-0008 ; convex/lib/session.ts ; convex/betterAuth/auth.ts ; convex/modules/notifications/{pushSubscriptions,sessionBinding}.ts ; packages/api/src/sign-out-everywhere.ts.
Vérifie dans les sources installées de Better Auth 1.6.25 comment lister et révoquer une session d'un utilisateur, et si le suivi d'IP se désactive. Dis-moi ce que tu as trouvé avant de coder.
Livre : personQuery people.sessions.listMine (bornée à 50, projection sans IP ni jeton, libellé d'appareil dérivé côté serveur, current) ; personMutation revokeSession et revokeOtherSessions avec débit et désactivation des souscriptions push liées ; écran (membre)/parametres/appareils, route dans apps/antsia_ga/src/lib/routes.ts, textes fr et en ; tests avec de vraies sessions (createTestSession) : session fermée refusée immédiatement, session d'autrui intouchable.
Vérifie : bun run verify, puis recette à deux navigateurs à 390, 834 et 1440 px, clair et sombre.
Arrête-toi : décision D3 sur l'IP ; tout fichier partagé ; toute publication.
```

### Prompt CN-06 — Paramètres rangés en rubriques

```text
Tu exécutes le lot CN-06 du plan 06 d'ANTSIA. Écris-moi toujours en français. Utilise Opus, jamais de sous-agent Sonnet.
Lis : CLAUDE.md ; le plan 06 § 2 et lot CN-06 ; la mémoire du propriétaire (maquettes fidèles au code, gouttière unique, un seul bouton plein par zone) ; apps/antsia_ga/src/app/(membre)/parametres/settings-screen.tsx ; apps/antsia_ga/src/components/{personal-controls,notification-controls,identity-tools,display-preferences,preferences-controls}.tsx ; apps/antsia_ga/src/app/(membre)/moi/me-model.ts.
Livre : un sommaire Compte, Confidentialité, Notifications, Affichage, Langue et région, Mes données ; chaque ligne mène à un contrôle qui existe déjà (profil privé et personnes bloquées du plan 05, appels hors relations du plan 01, NotificationControls, IdentityTools) ; sous-pages déclarées dans routes.ts ; bannière d'élévation IDN fermable pour un compte léger. Ne crée aucune ligne pour une fonction absente. /mes-donnees garde tous ses contrôles pour le suspendu.
Vérifie : cliquets member-screens-full-width, no-hardcoded-strings, no-hardcoded-urls, i18n-locales ; bun run verify ; recette 390, 834, 1440 px, clair et sombre, avec un compte léger et un compte vérifié de démonstration.
Arrête-toi avant toute publication.
```

### Prompt CN-07 — Pause et horaires silencieux

```text
Tu exécutes le lot CN-07 du plan 06 d'ANTSIA. Écris-moi toujours en français. Utilise Opus, jamais de sous-agent Sonnet.
Lis : CLAUDE.md ; le plan 06 lot CN-07 ; ADR-0009 § 7 et ADR-0010 § 2 ; convex/modules/notifications/{tables,preferences,deliveries,policy,nativeChannels}.ts ; packages/social-domain/src/notificationDelivery.ts.
Tu es la session S1 : tu modifies convex/modules/notifications/tables.ts. Livre : champs pausedUntil et quietHours dans notificationPreferences ; règle pure isQuietNow dans le domaine, testée (fuseau étranger, heure d'été, plage qui chevauche minuit, pause échue) ; relecture dans deliveries.ts avant chaque transport, report à la fin de la plage sans consommer le plafond ; les appels gardent leur « ne pas déranger » ; contrôles dans la rubrique Notifications, textes fr et en ; export et effacement des nouveaux champs.
Vérifie : notification-payload-content, i18n-locales, erasure.test.ts ; bun run verify ; recette avec un compte de démonstration.
Arrête-toi à la décision D8 et avant toute publication.
```

Les autres lots suivent le gabarit de prompt du plan directeur (§ 7 de `00_PLAN_DIRECTEUR.md`).

## 10. Sources lues

- Brief commun ; dossier de reprise du 9/11 (§ 2, § 3.5, § 3.6, § 9, § 10, § 11) ; plan 12 déjà rédigé (lots SU01b, SU01c, SU01e) et plan directeur (gabarit).
- Cahier : § 6, § 9 (R1, R2, R9), EXF-AN-05, 06, 08, 09, 26, 27, 32, 34, 45.
- ADR 0002, 0008, 0009, 0010, 0026, 0031, 0039.
- `docs/05`, `docs/07`, `docs/14`, `docs/25`, `docs/29`, `docs/32`, `docs/33` ; `docs/recette/bienvenue-publication-2026-11-02/RAPPORT.md`.
- `SU01_CONFORMITE_ORDONNANCE_0011.md` (§ 2.1 à § 2.6, arbitrages A1 à A12, sous-lots, ordre) ; étude responsive `01_ANALYSE_REFERENCES.md` ; étude sociale et commerciale `02_AUDIT_ANTSIA.md`, `05_MESSAGES_ET_APPELS.md` ; étude sept univers (D08, catégorie Alerte).
- Vault : `diagnostic-idn-recette-production-2026-10-26.md`, `session-idn-rechargement-2026-10-20.md` (via `docs/29`), décisions du 16/10, 17/10 (PA6) et 21/10 (inter-onglets), `avancement.md`, `contexte-actif.md` ; mémoire du propriétaire.
- Code : `convex/betterAuth/`, `convex/auth.config.ts`, `convex/lib/session.ts`, `convex/modules/people/` (identité, consentements, préférences, profil, export, effacement), `convex/modules/notifications/` (20 fichiers), `convex/modules/platform/` (authentification, débit, démonstration), `convex/modules/calls/preferences.ts`, `convex/crons.ts` ; `packages/api/src`, `packages/social-native/src`, `packages/social-features/src/features/{identity,notifications}`, `src/shell/{account,appearance}`, `packages/social-contracts/src/{authentication,appearance}.ts`, `packages/social-domain/src/{consent,notifications,notificationDelivery,civilName}.ts` ; web `apps/antsia_ga/src/app/{entrer,bienvenue,mes-donnees,parametres,notifications-worker,(membre)/parametres,(membre)/notifications,api/auth,api/session-bridge}` et composants cités ; mobile `apps/antsia_mobile/src/{components/entry,components/native-onboarding,screens/notifications-screen,screens/profile-screens,lib/native-notifications}` et `package.json` ; cliquets `tests/ratchets/`.
