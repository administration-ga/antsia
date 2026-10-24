# Comptes démo dans ANTSIA mobile — 24 octobre 2026

L’application native possède un sélecteur des huit acteurs de la démonstration Web : membre, membre vérifié, nouvel arrivant, presse, commerçant, association, administration et modération. Les profils et contenus viennent du backend démo existant ; aucune graine ni publication métier n’est exécutée.

## Parcours et limites

- « Essayer les comptes démo » est disponible depuis le compte personnel comme depuis l’entrée anonyme. « Revenir à mon compte » attend l’arrêt des ressources privées, remonte les clients et relit la vraie session conservée.
- Les origines Convex/auth démo sont distinctes de la production ; les coffres sont cloisonnés par origine. Les liens de profil et d’inscription conservent `/demo`. Identité.ga reste réservé au compte personnel.
- La sortie d’un compte démo termine uniquement la session du téléphone ; la sortie du compte personnel conserve son comportement global existant.
- Les huit acteurs sont relus dans le catalogue serveur, avec refus fermé si la démo ou l’OTP est désactivé. Le vrai parcours OTP capture exclusivement le header bearer, puis corrèle une session fraîche et le sujet.
- Comme sur le Web, Better Auth peut créer l’utilisateur d’authentification si une adresse démo ne s’est jamais connectée. Le natif ne crée aucun profil, consentement ou contenu métier. Le nouvel arrivant reste à compléter dans la démo Web.
- Le périmètre des écrans natifs reste fil, publications, messages et réglages. Les opérations de boutique/service restent sur le Web ; ce lot ne déclare pas une parité complète des huit rubriques du site.

## Contrôles

147 tests mobiles, 94 tests des contrats natifs et 10 tests du cliquet de sortie réussis ; typages et lint sans erreur. Le lint mobile conserve 37 avertissements. Codegen en mode dry-run sur le backend local3260 correct ; aucun déploiement Convex de production. La vérification globale du dépôt n’est pas relancée pour cette livraison sans commit applicatif.

Connexions réelles au backend démo avec les clients d’authentification du mobile : membre, association et commerçant admis, profil/adhésion présents, cinq publications lues ; un média présent pour le commerçant. Sorties courantes réussies, sans révocation globale. Le même coffre a également été éprouvé sur deux acteurs successifs avec ConvexReactClient.

Sur le simulateur iOS27 : catalogue des huit acteurs, fil membre, fil association, retour au vrai compte personnel sans ressaisie constatés. Le premier essai de changement direct a révélé le défaut de réinitialisation décrit ci-dessous. Les captures initiales montrent le JavaScript du build5 sur les composants natifs UIScene du build4. Après correction, la copie simulateur utilise le JavaScript exact extrait de l’IPA6 signé (même SHA256), avec les composants natifs inchangés. La reprise Association→sortie courante→Commerçant, le fil, le libellé de sortie limité à la démo et le retour au compte personnel ont été constatés avec le correctif6. Capture : [transition corrigée](ios-build6-commerce-after-switch.png).

### Régression de changement de compte

Better Auth renvoie un proxy appelable. `setAuth(client)` le traitait comme une fonction de mise à jour React et stockait sa valeur de retour, ce qui corrompait le client après sortie/révocation/session expirée. Les trois remplacements sont désormais `setAuth(() => client)`.

Un harnais privé sur le vrai hook, sans dépendance ajoutée ni transformation du source, reproduit l’échec avant correction puis valide quatre scénarios : compte démo→sortie→autre acteur, pause/remontage avec jeton conservé, arrière-plan/reprise et sortie globale de production. Preuve : [controller-regression.json](controller-regression.json). Ce diagnostic utilise les dépendances de test Web déjà installées ; il ne fait pas partie de la suite mobile courante.

## Livraison iPhone

Le build5 a été compilé, signé, envoyé à Apple et traité VALID, mais n’est pas rattaché au groupe externe à cause de la régression découverte pendant la recette. Le build4 approuvé reste disponible et n’est pas expiré.

Le build6 corrigé est compilé et signé (version0.1.0, SDK iOS27.1, minimum iOS16.4, UIScene, identité propriétaire vérifiée). Après un échec ENOSPC, la compilation a repris sur ses propres objets existants sans nouvelle installation ; l’IPA final et ses symboles de diagnostic sont conservés. Le cache terminé, non ouvert, a été supprimé : environ2,60Go récupérés mesurés, projets et données conservés. Métadonnées : [ios-build6.json](ios-build6.json). Le quota distant Expo est épuisé ; aucun abonnement ni nouvelle signature n’a été créé. La compilation part de deux commits immuables et d’une superposition de fichiers mobiles nommés, pas du travail global en cours : [manifest](source-manifest-build6.json).

**Apple, 24/10/2026 à18h02 Europe/Paris : build6 APPROVED / IN_BETA_TESTING, notifications automatiques activées.** Le groupe externe contient6 et4 ; le build5 reste hors groupe, aucun ancien build n’est expiré. [Preuve](testflight-build6.json). Le lien public est https://testflight.apple.com/join/mqWat3mu. Soumission Expo : https://expo.dev/accounts/okatechs-organization/projects/antsia-mobile/submissions/6571c569-8770-4a1d-9b8e-c9cd0d318710.

## Préservation

Les modifications applicatives restent dans les vrais fichiers `apps/antsia_mobile` et `packages/social-native`. Aucun fichier d’environnement, schéma, catalogue métier, donnée sociale, branche, index, source DIASPORALE ou travail SU06 n’est modifié par cette tranche. Seules les sessions normales de recette démo ont été ouvertes et fermées. Pas de commit/push/déploiement Web ou backend dans ce lot ; les archives de compilation restent dans le cache natif privé.

Le serveur local3030 répond200 sur `/entrer` après livraison ; branche, HEAD et hash de l’index Git identiques au début de la tranche. Le code Android partage ces changements (versionCode3 préparé), mais aucun nouvel APK/AAB n’a été compilé ou distribué dans ce lot iPhone. La recette Identité.ga sur iPhone physique reste distincte et n’est pas déclarée réussie.

Mémoire Obsidian actualisée dans la note `demo-native-ios-build6-2026-10-24`, contexte/avancement/journal préservés par ajout ciblé. Le commit limité à cette nouvelle note a échoué sur une écriture de l’index du vault (« Operation timed out ») ; aucun commit applicatif ni commit des notes déjà modifiées par les autres sessions. Dernier contrôle Apple en lecture seule à18h08 :6 toujours APPROVED / IN_BETA_TESTING, groupe6+4.

## Recontrôle du 24/10 à18h35

Le propriétaire confirme sur son iPhone le build6 ouvert, le bouton IDN visible puis le retour automatique dans ANTSIA avec profil et fil chargés. Cette recette est une confirmation manuelle du testeur ; aucun écran physique ni correspondance avec le téléphone pairé n’a été vérifié indépendamment. La commande de lecture des apps du téléphone pairé ne retrouvait pas le bundle ; aucun appareil n’a été réinitialisé, aucun contenu exporté, aucune déconnexion globale effectuée. [Confirmation](idn-iphone-user-confirmation.json).

Le sélecteur démo est à nouveau ouvert dans le simulateur depuis le bouton de la capture. La session démo commerçant était récupérée, avec publications réelles de la démo Web. Apple relu à18h35 : build6 APPROVED / IN_BETA_TESTING, groupe6+4, notifications actives. Aucune nouvelle compilation ni publication n’était nécessaire ; les sources applicatives, l’index et les données métier restent inchangés lors de ce recontrôle.
