# Connexions indisponibles sur la démo — 21 octobre 2026

## Diagnostic constaté

Sur `https://antsia-demo.vercel.app/fil?tab=relations`, Awa MBA `@membre.demo` voit « Connexions indisponibles » alors que ses suivis se chargent. Réessayer reproduit le refus. Le journal de `vivid-hedgehog-655` confirme `InvalidCursor` dans `modules/graph/connections:paginateMine`, qui compose deux paginations natives par des `runQuery` imbriqués. Le harnais Convex local ne reproduisait pas cette restriction réelle.

## Correctif

Le hook réel `packages/social-features/src/features/reseau-personnel/use-dual-connection-pagination.ts` avait déjà été corrigé dans l’arbre partagé, mais le correctif n’était pas publié. Il abonne séparément les côtés `low` et `high` de `paginateMineSide`, puis assemble la page côté client quand les deux réponses sont disponibles. Les curseurs restent propres à chaque côté ; l’état de chargement, l’erreur, la relance et l’isolation par lecteur/authentification sont couverts par les tests. Les invitations gardent un seul abonnement.

Le candidat de démonstration reprend exactement les sources de la version canonique `verification-20261021-demo-070aafd886c4337a` (`dpl_J5YskviFDCg5UTz3DfBzXh6Xwqjg`) et y remplace uniquement le hook et son test. Le backend, les comptes, les connexions, les contenus et la configuration antivirus sont conservés. Aucun déploiement Convex, modification de `.env*`, commit ou push de l’arbre partagé. La fonction serveur historique reste inchangée ; le client corrigé ne l’appelle plus.

## Vérifications effectuées

- Codegen et typage strict Convex réussis.
- 34 tests du hook et de la gestion des pages doubles ; 10 tests des contacts iCom : 44 réussis.
- Typage du paquet `social-features` et lint des deux fichiers concernés réussis.
- Aucun résultat global de `verify` revendiqué pour le travail partagé.

## Publication et recette

Candidat : `dpl_7RvC1cFdZnXo66rYGmHJDHnJH63r`, version `connections-20261021-demo-a134a7893b5dcc87`, projet Vercel `antsia-demo`. Construction et typage distants réussis, candidat READY et santé HTTP 200 avant promotion. Alias public confirmé vers ce déploiement ; santé publique HTTP 200 avec la version exacte et CSP présente.

Recette sur la session Chrome existante : Awa MBA `@membre.demo` conservée, panneau « Mes connexions » chargé sans erreur après rechargement, puis aller-retour dans Invitations. Les 3 invitations envoyées sont présentes, aucune reçue ; les 2 suivis sont conservés. Le contrôle borné des données confirme 0 connexion acceptée et 3 demandes en attente pour Awa (inventaires complets : 7 personnes et 8 lignes de connexion, aucune écriture). L’état « Aucune connexion » est donc exact. Les 6 exécutions de pagination relevées après publication se terminent sans erreur ; le client appelle bien les côtés natifs. Aucun warning/error console capturé pendant cette recette.

Les deux fichiers applicatifs publiés sont identiques aux fichiers réels de l’arbre partagé. Aucun contenu de test créé, supprimé ou accepté pour obtenir un résultat artificiel.

Preuves : `docs/recette/connexions-demo-2026-10-21/`. Manifeste exact : `~/Library/Caches/antsia-releases/20261021-connections-pagination/demo/manifest.json`.
