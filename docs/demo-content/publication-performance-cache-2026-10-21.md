# Publication des corrections de performance et cache — 21 octobre 2026

Les corrections sont committées, poussées et publiées sur https://antsia.vercel.app.

## Version livrée

- Sources : `2fc457a505d4bafc1909c72072d9e5b4f74fd7c6`.
- Branche poussée : `codex/cache-performance-20261021`.
- Version publique : `cache-performance-20261021-e3fab6816eb3f79f`.
- Déploiement Vercel : `dpl_6VZqPxNpTmJJvd6LU36ho5GCZ3Rk`, cible production, READY, Node 24 / Next 16.4.2.
- Ancienne production : `dpl_UxMyjdTakahwkCjfRSyy7PFF9gAL`, conservée pour retour arrière.
- Empreinte du paquet : `e3fab6816eb3f79fb3b861812c0e56a281c47c7165b1b3e45c3fdfa56785e369` (voir l’empreinte complète dans la preuve JSON).

## Périmètre et protection des travaux parallèles

La livraison repart du snapshot exact de la production `session-coordination-20261021-03548f8c8f01470e`. Ses 2 998 fichiers ont été confrontés au manifeste avant copie. Le commit `42b005139138aec4694aef67a8ecfb213ed6193d` trace les corrections déjà publiées depuis la précédente branche de livraison ; il n'introduit pas de travail encore en cours.

Le commit de correction ajoute uniquement les 15 chemins du périmètre cache/performance : versions Next et ESLint, verrouillage des dépendances, configuration du cache dev, instrumentation de diagnostic, traduction et catalogue SSR, tests et documents associés. Les schémas et médias de démonstration non publiés, le catalogue mobile et les modifications UI/commerce en cours sont exclus.

La branche de travail `codex/pa4-identite-session`, son HEAD et l’index partagé sont conservés. Les commits ont été construits par un index séparé, sans changement de branche, stash, reset ni staging global. Les sources réellement servies localement restent celles corrigées lors de la tâche précédente.

Aucun backend Convex, schéma, migration, graine, donnée utilisateur, session ou média n’est modifié par cette livraison. Aucune configuration de production du backend n’est écrite. Le backend de production reste `diligent-avocet-585` ; la démo, l’admin et DIASPORALE ne sont pas déployés. Aucun fichier `.env*` réel n’est modifié.

## Ce qui change

- Cache Turbopack persistant conservé, avec recyclage natif des racines devenues inutiles après 30 minutes, uniquement en développement et pour ANTSIA.
- Limite habituelle de pile de diagnostic restaurée en développement Node ; les piles longues restent disponibles ponctuellement. Production inchangée sur ce point.
- Une instance de traduction par langue et requête React, sans état partagé entre personnes.
- Lecture du catalogue partagée entre métadonnées et rendu, grâce à des arguments primitifs ; filtres, pagination, session et DTO fermés préservés.

Le recyclage est une politique de rétention, pas un plafond strict en Go. Après livraison, le cache local mesuré vaut 364 308 Kio, environ 356 Mio. Aucun cache n’a été supprimé pendant cette publication. Les serveurs locaux 3030 et 3210 sont restés actifs, santé locale `ok`.

## Vérifications

- 718 tests de l’application ANTSIA réussis.
- 20 tests ciblés réussis, inclus en partie dans les suites complètes : diagnostic, langues, projection catalogue et configuration Next.
- Paquets du moteur : 7 489 tests réussis, 3 ignorés, 1 échec dans un fichier inchangé.
- Typages ANTSIA, admin, paquets du moteur et Convex réussis ; lint ciblé et lint des neuf espaces de travail sans erreur.
- Construction distante de production et typage Next réussis ; installation à verrouillage figé vérifiée.
- Candidat testé avant promotion : entrée, découverte, santé en HTTP 200, CSP et origine du backend de production conservées.
- Alias canonique revérifié immédiatement avant promotion : aucune autre publication intercalée depuis la base retenue.
- Après promotion : santé/version exactes et trois pages publiques en HTTP 200 ; navigation réelle Entrer → Découvrir et écran de santé vérifiés dans le navigateur.
- Aucun log Vercel de niveau error/fatal trouvé sur ce déploiement dans la fenêtre des dix minutes contrôlée. Ce relevé ne garantit pas les parcours non exercés.

### Réserves globales conservées

`bun run verify` a été lancé mais s’arrête au codegen : le paquet isolé ne contient volontairement aucune configuration de déploiement Convex. Aucun backend de production n’a été utilisé pour lever cette limite. La suite backend supplémentaire a été interrompue et n’est pas présentée comme verte ; les sources backend sont strictement inchangées.

Le typage étendu retrouve des incompatibilités `fileScanUnavailable` dans les fichiers DIASPORALE inchangés. Le test inchangé `ProfilPersonnePage.test.tsx` attend une requête sans `returnRateLimit`, alors que la base déjà publiée transmet ce champ. Ces travaux ne sont pas repris dans cette livraison. Le contrôle global n’est donc pas annoncé vert.

Les pages membres authentifiées ne sont pas exercées en production : le propriétaire avait demandé de terminer avec les contrôles publics. Aucun compte ni accès n’a été fabriqué pour la recette.

## Preuves

- [Relevé de publication](recette/publication-cache-performance-20261021.json)
- [Entrée publique](recette/publication-cache-performance-20261021-accueil.png)
- [Version publique affichée](recette/publication-cache-performance-20261021-sante.png)
- [Mesures locales et diagnostic](performance-cache-2026-10-21.md)

Le paquet reproductible, ses manifestes et les journaux détaillés sont conservés dans `~/Library/Caches/antsia-releases/20261021-cache-performance/`.
