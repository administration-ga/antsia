# U06 — Messagerie, demandes et appels

## Préambule

Lire le [plan responsive](../04_PLAN_IMPLEMENTATION.md), U02, P05/P10 et les reprises P17b/c/d pertinentes. Préserver l’hôte d’appel et les autorités actuelles ; ANTSIA seul. Aucun test, codegen, typage, lint, build, navigateur, serveur, appel de recette, Git d’écriture, installation ou environnement.

## Périmètre et composants réutilisés

- `packages/social-features/src/features/messagerie/{IcomMessagesPage.tsx,icom-views.ts}` et les composants de liste, conversation, groupes et création déjà appelés.
- `shell/communication/global-call-surface-host.tsx`, `features/iappel/{CallRoomMount,CallStage,CallSurface,IncomingCallCard}.tsx` et leurs stores/actions existants ; `CallRoomPool` est exporté par `CallRoomMount.tsx`.
- `apps/antsia_ga/src/components/shops/{contact-inbox,contact-request-screen,contact-messages,contact-team-panel}.tsx` et backend `convex/modules/commercialMessaging/` : réutiliser sans fusionner leurs droits avec la conversation personnelle.
- `apps/antsia_mobile/src/app.tsx`, surfaces natives P17 et `docs/recette/antsia-native-p17d/` pour distinguer le code natif des preuves physiques.

État de départ : Conversations/Appels/Contacts ; filtres Toutes/Non lues/Groupes et Boutiques injecté ; groupes bornés à 50 chargés. Conversation personnelle native disponible en source ; groupes et commercial y renvoient actuellement au Web.

## Actions et contrats

1. Téléphone : liste puis détail plein écran avec retour clair. Tablette/ordinateur : liste et détail ensemble si largeur utile suffisante ; sinon repli sur une colonne sans perte du fil sélectionné.
2. Réutiliser recherche, filtres, compteurs et états de lecture serveur. Dire la portée des groupes chargés ; ne pas transformer une recherche locale bornée en résultat exhaustif.
3. Rendre les demandes/invitations compréhensibles à partir de leurs vrais statuts. Ne pas recopier Principal/Invitations/Général si aucune projection ne les matérialise. Une création de conversation, invitation ou demande commerciale conserve ses gardes anti-spam, son destinataire et son consentement.
4. Garder distincts personnel 1:1, groupe et commercial : appartenance, participants, mandats d’équipe, acceptation et blocage ne se transfèrent pas d’une catégorie à une autre. Le compte personnel de l’agent ne devient pas la boutique.
5. Conserver l’idempotence d’envoi et les brouillons selon la personne/réseau/cible. Une erreur ou reconnexion ne confirme ni livraison sur appareil ni lecture ; n’afficher ces statuts que sur une preuve existante.
6. Montrer les états d’appel entrant, sortant, connexion, connecté, reconnexion et terminé depuis le moteur actuel. Conserver boutons accepter/refuser/fin, sortie individuelle d’un groupe, appel audio sans caméra, permissions et erreurs explicites.
7. Ne pas remonter l’hôte/pool au changement de route, pose ou thème. Le dock et la page sont des surfaces du même appel ; la navigation ne recrée ni salle ni token. Fin d’appel libère effectivement les médias selon les sources existantes.
8. Pour le natif : préserver les claims premier appareil/session gagnant, références push neutres, TTL, déconnexion et gardes P17c. Les écrans système CallKit/Android ne deviennent pas une preuve de réception ou d’audio ; consigner séparément les scénarios physiques encore NOT RUN.

## Contrat d’acceptation

- Chaque conversation conserve son autorité propre ; refus/invitation/bloqué n’est pas une conversation active simulée.
- Liste/détail fonctionne dans les trois poses, avec focus et retour ; compteur absent ou fenêtre partielle ne produit aucun total inventé.
- Un seul hôte/pool pendant navigation/thème ; aucune réacceptation ou réactivation caméra depuis une réponse ancienne.
- Tous les états d’erreur/offline/permission refusée/terminé donnent un choix réel ; une session révoquée ne réadopte pas le jeton d’une autre.
- Le natif ne prétend pas offrir groupes/commercial/studio live tant que ces parcours n’y sont pas réellement raccordés ; ses renvois Web sont explicites.

## Exclusions et preuve attendue

Pas de nouveau chiffrement de bout en bout annoncé, de copie des contacts privés, de création d’invitations en masse, de nouveau protocole d’appel ou de relâchement des budgets/préférences serveur. Réutiliser les portes P05/P10/P17 sans les réécrire. Rapport attendu : surfaces raccordées, droits préservés, limites de recherche et renvois ; preuve source seulement. Audibilité, Bluetooth, écran verrouillé, application fermée et réception native restent des recettes physiques séparées, sans exécution maintenant.
