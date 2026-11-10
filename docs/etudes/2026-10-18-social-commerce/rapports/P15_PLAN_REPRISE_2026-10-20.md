# P15 — Reprise du 20 octobre 2026

Demande : poursuivre l’emploi ANTSIA–PRO.GA, sans relancer les vérifications, dans les sources réelles et en préservant les travaux parallèles. Les parcours P15 existent déjà : cette reprise ferme leurs écarts de confidentialité, de reprise et de retrait. Aucun autre lot n’est engagé.

## Réservations

- Coordination : ce plan, bilan daté, `shops/jobApplicationLifecycle.ts` et nouveau test dédié. Les retraits de pièces parcourent toutes les candidatures par pages bornées ; l’effacement progresse au-delà des cinquante premières lignes, sans supprimer un dossier pour simuler une confirmation distante.
- Backend ANTSIA : `shops/{jobApplications,jobApplicationTransport,jobTables}.ts`, helper d’autorité dédié, tests et raccords additifs propriété/export/quotas. Recherche privée d’une clé, clôture atomique sans candidature, séparation réseau/boutique, session réelle avant/après transport, contrôle des pièces juste avant départ. Aucune preuve d’authentification récente inventée par un cron. Résolution selon expiration et tolérance du contrat ; nouvelle intention et accord explicite seulement après absence distante prouvée.
- Interface ANTSIA : `components/jobs/`, helper local de reprise et locales Emploi FR/EN. Préserver les classes du designer et les deux formulaires distincts du dépôt de pièce et de la candidature. Index limité aux références/clé/date ; aucune donnée du dossier persistée dans le navigateur. Reprise avant lecture de l’offre, gel après incertitude, callbacks corrélés à l’acteur, lectures refusées fermées, nouvel accord après modification des conditions.
- PRO.GA : admission des candidatures et autorité de publication actuelle, délivrance des CV sous session et mandat relus avant remise, suppression de blobs avec référence conservée jusqu’au succès, unicité sans préfixe tronqué, panneau recruteur pour les réponses tardives. Tests et passation dédiés.

Le backend ANTSIA possède `jobTables.ts` ; il ajoute notamment `by_person_revoked` pour le cycle de vie. Les fichiers de charte, primitives, session/IDN/déconnexion, P14, P10 et DIASPORALE restent hors périmètre. Pas de changement de branche, commit, publication, secret ou environnement.

## Interface de reprise

`jobApplications.findByIdempotencyKey({networkId,idempotencyKey})` : candidature existante du propriétaire/réseau, absence constatée ou clé clôturée. `stopClientIntent` retrouve d’abord une candidature existante ; sinon une clôture atomique interdit son admission future. Cette clôture n’est pas un retrait PRO.GA. Une erreur n’est jamais interprétée comme une absence.

`retry` conserve les mêmes octets tant que leur issue est incertaine. Après absence distante corrélée et expiration avec tolérance contractuelle, la reconstruction exige un nouvel accord explicite et toutes les pièces d’origine encore admises. Aucune pièce perdue n’est omise silencieusement.

## Limites et preuves

Aucun codegen, test, typage, lint, build, audit automatisé, navigateur, appel HTTP/Convex de recette, installation, service ou redémarrage. Les scénarios sont écrits seulement. Les preuves antérieures ne couvrent pas ces corrections.

La conservation n’est pas décidée ; aucune durée métier ni activation n’est inventée. L’export/effacement général PRO.GA hors retrait et la recette croisée demeurent à traiter explicitement avant activation. Les retraits distants non confirmés restent distingués d’une suppression prouvée. Aucun frais, panier ou paiement candidat.
