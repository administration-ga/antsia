# Publication Git de la livraison iOS7 — 24/10/2026

Le lot contient les comptes démo natifs, la correction du Nouvel arrivant et les
écrans boutiques, offres, services et associations, ainsi que leurs preuves de recette.
Le catalogue de livraison déclare les trois origines publiques de la démo déjà
présentes dans les sources locales. Aucun changement du catalogue de dépendances
ou du verrou racine n’est inclus.

## Contexte et vérification

Base ANTSIA : `1193b087fe4206da81dcdb7d6ff0aca8214f25ee` ; dépôt externe DIASPORALE
épinglé sur `367c2bd3ca9dfb59baaae0d32bce44dafc911d36`. Les travaux Web, moteurs et
PRO.GA parallèles de l’arbre partagé sont exclus. Le répertoire et l’index partagés
restent sur leur branche initiale ; publication par un arbre Git et une branche dédiés.

- Génération Convex en lecture locale3260 (`codegen --dry-run`) et typage strict
  réussis.2123 entrées source identiques contrôlées avant les étapes distantes.
- `bun run verify` a été lancé sur l’arbre figé. Sur Linux,3237 tests backend passent
  et le seul scénario à5000 abonnés dépasse son délai initial de360000ms.
  Rejoué seul sur le Mac, il passe en160132ms avec les mêmes sources, assertions
  et limite ; aucun délai ni volume n’a été réduit ou augmenté.
- Le contrôle du catalogue a ensuite signalé trois noms de variables démo absents
  de l’arbre Git préparé. Leur inclusion seule corrige cet écart ; les150cliquets
  passent après cette inclusion. Ce sont des déclarations, sans valeur secrète.
- Toutes les étapes restantes de la chaîne initialement interrompue ont été
  exécutées : scripts,12typages de paquets,12suites de paquets et11lints, sortie0.
  Bilan cumulé sans compter deux fois les reprises : **16 402 tests réussis**,
  quatre tests déjà ignorés. Les172tests mobiles et94contrats sont inclus.
  Les avertissements de lint hérités restent consignés, aucune erreur.

Cette preuve est une vérification répartie avec reprises ciblées, pas l’affirmation
d’un unique processus `verify` terminé à0. L’ancienne tentative et ses erreurs sont
conservées avec les journaux privés. Après les contrôles, seuls les comptes rendus
et le README ont été complétés ; les sources exécutables n’ont pas changé.
La résolution du verrou dans le contexte externe DIASPORALE ne change que les
métadonnées d’une dépendance de workspace ; aucun nouveau paquet n’est résolu.
La machine de test distante a été arrêtée après récupération des journaux.

## Déploiement iOS et préservation

Apple relu le24/10 à22:45Paris : version0.1.0(7), build
`3b39c62d-523c-4d6c-bf2b-a4bb577cf70c`, `VALID`, `APPROVED`, `IN_BETA_TESTING`,
non expiré. Groupe public7+6+4, notification automatique active ;5hors diffusion.
Les sources exécutables correspondent à l’IPA signé déjà diffusé : aucun nouvel
upload identique ou numéro de build n’est nécessaire pour ces seuls ajouts Git.

[Tester ANTSIA sur TestFlight](https://testflight.apple.com/join/mqWat3mu).

La recette des huit profils est terminée dans le simulateur ; Administration reste
sur Mairie Démo/Publications. Les trois observations ergonomiques et la limite
iPhone physique restent décrites dans le rapport complémentaire voisin.
Aucune donnée métier, graine, configuration backend ou invitation n’est modifiée.
Les routes Web publiques relues répondent200 et conservent leurs identifiants de
déploiement existants : aucun remplacement du Web par la base Git ancienne.
