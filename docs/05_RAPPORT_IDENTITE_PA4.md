# PA4 — Identité, connexion IDN et déconnexion partout

Date : 16 octobre 2026. État : implémentation locale ; la recette IDN sandbox reste ouverte.

## Portes et configuration

Better Auth reste le seul émetteur Convex. IDN entre par le SDK `@idn-ga/better-auth`, PKCE, découverte OIDC et `/userinfo`, avec les scopes `openid profile email`. Le callback reste celui de `SITE_URL` : `/api/auth/oauth2/callback/idn`. Les applications utilisent leurs proxys, le plugin crossDomain puis un jeton de transfert à usage unique de trois minutes. Un client technique du moteur est configuré par environnement ; les clients OIDC et callbacks autorisés restent à créer dans le portail IDN par le propriétaire.

La porte commune `social-features/identity` est branchée dans ANTSIA, la console et DIASPORALE : IDN d'abord, puis codes e-mail ou SMS. Les moyens absents sont désactivés avec une explication, les envois et vérifications sont bornés, les échecs sont visibles et le renvoi temporisé. Aucun mot de passe ni route de réinitialisation n'est accessible.

| Moyen | Variables du déploiement Convex | Comportement sans configuration |
|---|---|---|
| IDN | `IDN_CLIENT_ID`, `IDN_CLIENT_SECRET`, `IDN_ISSUER` ou `IDN_DISCOVERY_URL` HTTPS | Porte désactivée ; aucun fournisseur par défaut |
| E-mail | `RESEND_API_KEY`, `RESEND_FROM_ADDRESS` | Refus 503 hors développement local |
| SMS | `SMS_PROVIDER=webhook`, `SMS_ENDPOINT` HTTPS, `SMS_API_KEY` | Refus 503 hors développement local |
| Origines | `SITE_URL`, `TRUSTED_ORIGINS` et catalogue | Contrôle exact des origines ; ports locaux seulement sous la double garde locale |
| Langue des codes | `Accept-Language` de la requête, que les applications posent sur la langue affichée ; à défaut, `AUTH_DEFAULT_LOCALE` facultatif : `fr` ou `en` | Français |
| Marque des codes | Aucune : tirée de l'origine (application du catalogue ; DIASPORALE par le manifeste de sa tranche) | ANTSIA |

Les codes à six chiffres expirent après cinq minutes, sont consommés une fois et limités à trois essais. Les vérifications OTP sont conservées hachées. Le double local conserve temporairement le code en clair uniquement dans l'outil de développement existant, protégé par la cible loopback et le drapeau local ; aucune délivrance réelle ni exposition de code sur un backend cloud.

## Personne et preuves

`ensureMyPerson` crée uniquement la personne technique, puis synchronise ses liens depuis Better Auth. Aucun nom civil, handle, profil publié, consentement ou adhésion n'est recopié. Le nom requis dans le composant Better Auth reste la marque ; le nom social est choisi dans l'accueil. Les préférences de langue et de fuseau sont validées côté serveur.

`linkIdn({})` et `linkLocal({})` ne reçoivent aucun sujet ni contact : ils relisent la session, le compte et les preuves serveur. Le callback IDN dépose une preuve minimale (`sub`, `loa`, nationalité, type de profil, observation serveur) corrélée au compte IDN. Un même sujet ne peut appartenir à deux personnes. Les collisions sont refusées, jamais fusionnées automatiquement. Le rattachement d'un compte léger à IDN est explicite, même si l'adresse diffère ; la fusion implicite par e-mail est désactivée.

Le lien local ne garde que l'empreinte SHA-256 normalisée d'un canal vérifié. `verifiedEmailHashOf` relit l'adresse actuellement vérifiée dans Better Auth ; aucune adresse en clair n'entre dans les tables sociales. Les badges restent calculés ; LoA ≥ 2 donne la preuve forte. Les adhésions déjà choisies sont réconciliées par tranches de 50 sans réactiver les départs ou suspensions.

Le raccord DIASPORALE promeut une adhésion racine déjà active lorsqu'une vérification arrive après l'entrée dans le réseau enfant. Il préserve rôle et caractère dérivé ; il n'ouvre aucune adhésion nouvelle. L'attestation d'un compte léger utilise uniquement l'empreinte d'une adresse vérifiée et revalide son sujet au départ comme à la réception de la réponse. Les fichiers de ce raccord restent dans l'ownership DIASPORALE.

## Sessions et passage

Les sessions durent sept jours, les JWT trente minutes et portent `sessionId`. Le JWT seul n'accorde plus de droit : `getActiveIdentity` relit la session Better Auth, son sujet et son expiration. Une session supprimée ferme immédiatement lectures et écritures, même avec un JWT encore valide. La garde réactive du fournisseur démonte les contenus et recharge les onglets concernés ; le bootstrap nettoie les résidus d'une session absente. Une arrivée refusée monte un fournisseur Convex anonyme : aucun cookie HTTP résiduel ne peut rouvrir la session. Le transfert n'est adopté qu'après relecture avec son bearer explicite et corrélation du sujet ; le rejet est acquis même si le cookie synthétique ne peut pas être supprimé.

`useSsoNavigate` valide la destination avant toute génération, refuse les origines étrangères et une génération manquante ou tardive. Le snapshot de session est comparé avant et après : un changement de compte, une déconnexion ou un démontage empêchent la navigation. L'arrivée consomme le transfert avant de monter Convex et retire le paramètre de l'adresse.

`signOutEverywhere` révoque les sessions serveur avant la déconnexion locale. Il purge les deux clés Better Auth et les espaces personnels ANTSIA, actuels et anciens, des deux stockages, puis réinitialise l'atome et les rappels locaux. DIASPORALE ajoute sa purge nominale de brouillons. Les préférences de thème/langue et les clés étrangères sont conservées. La navigation complète démonte médias, singletons et caches. La garde réactive laisse terminer cette purge avant son propre rechargement. Un registre partagé entre les copies du module conserve le verrou jusqu'au remplacement du document ; la navigation est appelée dans le gestionnaire de déconnexion. Aucune synchronisation de personne ne démarre pendant cette sortie. Si la révocation ou le nettoyage échoue, l'arrivée affiche que la déconnexion complète n'est pas confirmée.

Le cliquet `sign-out-everywhere` interdit les appels directs à la déconnexion SDK hors de la porte commune. Les gardes d'exécution et les tests du gestionnaire réel complètent ce contrôle statique.

Le 20/10/2026, la recette de la démo a révélé une redirection d'accueil pendant la révocation,
qui remontait le préflight et invalidait la génération de purge. `useSessionState` et le
préflight respectent désormais le verrou de sortie jusqu'à la navigation finale. Correctif
publié sur la démo et changement de compte réel vérifié : [recette dédiée](recette/deconnexion-demo-2026-10-20/README.md).
Le même contenu est ensuite publié sur ANTSIA en production. Sa recette à deux comptes reste
bloquée par les portes de connexion désactivées et l'absence de réseau racine actif accessible :
[publication et limites de la recette production](recette/deconnexion-production-2026-10-20/README.md).

## Vérification

- `bun run verify` a terminé avec le code 0 : **5 836 tests**, typage Convex/tests et des dix espaces, neuf passages lint sans erreur. Détail : 1 302 backend, 111 cliquets, 24 scripts, 418 domaine social, 86 UI, 56 contrats, 130 API, 2 918 surfaces sociales, 5 ANTSIA, 8 console, 238 domaine DIASPORALE, 259 surfaces DIASPORALE et 281 application DIASPORALE. Trace : `/tmp/antsia-pa4-verify.log`.
- Cette passe complète précède les corrections découvertes dans le navigateur. Les modules concernés ont ensuite été revérifiés : **170 tests API**, **10 console**, **10 cliquets ciblés** et **5 tests du consommateur de déconnexion DIASPORALE** et **27 tests de la porte d’identité commune**, tous verts. Typage et lint API/ANTSIA/console sans erreur. Les travaux albums/stories de DIASPORALE, commencés ensuite dans l'arbre partagé, sont exclus de la livraison PA4 ; La tentative de passe globale finale (`/tmp/antsia-pa4-verify-final.log`) a passé codegen et typage Convex/tests, puis a été arrêtée au démarrage des tests pour libérer le créneau partagé ; elle ne vaut pas une seconde preuve globale. Aucune nouvelle passe globale n'est revendiquée sur ces travaux en cours.
- Les régressions couvrent notamment les erreurs de transport OTP, les routes de mot de passe interdites, les collisions et preuves inventées, les JWT dont la session est supprimée, la promotion tardive d'adhésion, les transferts rejetés/périmés, le cookie résiduel, les changements de compte, les nettoyages en échec et la concurrence entre révocation, rechargement et navigation.

Recette navigateur sur les sources réelles, avec des comptes fictifs du backend local :

1. E-mail : code erroné refusé avec retour français, code local accepté ; accueil avec nom/handle vierges et consentement non coché. Publication explicite du profil de recette, préférence anglaise et fuseau `Africa/Libreville` appliqués ; reconnexion vers le profil existant.
2. SMS : code local accepté ; déconnexion depuis l'accueil avant publication du profil, retour à l'entrée.
3. Passage ANTSIA → console : transfert consommé une fois, paramètre retiré, état de session ouvert sans conférer de droits administratifs.
4. « Me déconnecter partout » : révocation et sortie locales répondent 200, navigation finale vers `/entrer`. Réouverture de `/fil` sur ANTSIA renvoyée à `/entrer` ; la porte IDN indisponible reste expliquée et désactivée.

Un seul serveur Next tourne à la fois. Pour le transfert, un relais de recette temporaire sur 3030 utilisait le **vrai proxy d'authentification du dépôt**, pendant que la console était servie sur 3032. Il a été arrêté ; ANTSIA réel est rétabli sur 3030. Cela valide le passage et la révocation entre origines en séquence, sans prétendre à une recette permanente de plusieurs appareils. Aucun contact réel, code OTP ou jeton de transfert n'est conservé dans ce rapport.

[Capture de l'entrée après révocation](evidence/pa4-entree-locale.png).

## Limites externes

Le propriétaire a confirmé le 16 octobre que les clients IDN sandbox ne sont pas encore créés ou configurés. La connexion réelle chez IDN, le rattachement par son portail et les scénarios R1/R2 avec ce fournisseur ne sont donc **pas validés**. Les tests locaux exercent le gestionnaire Better Auth et les preuves serveur, avec des comptes fictifs et les doubles OTP locaux. Ils ne prouvent ni un envoi Resend/SMS réel ni la disponibilité d'un fournisseur externe.

La console reçoit seulement l'entrée, l'état de session et la déconnexion PA4 ; ses fonctions d'administration restent PA7. L'effacement complet des nouvelles preuves et la généralisation des limites d'écriture appartiennent à PA5. Aucun fichier d'environnement réel modifié, aucun push, aucune publication ni commande Convex de production.

## Provenance

Configuration et patrons du socle lus dans Git `origin/main` au commit `25398f565f3ed445786f10ead567b32fe5245bc2`, sans lecture de son arbre partagé pour duplication. En-têtes de provenance et cliquet mis à jour. ADR-0002 conservé et précisé par ADR-0008.
