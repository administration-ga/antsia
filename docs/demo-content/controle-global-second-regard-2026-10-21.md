# Contrôle global complémentaire — 21 octobre 2026

## Résultat observé

`bun run verify` réussit : **sortie 0**, Node 22.22.3, durée 760,75 s. La chaîne exécute réellement la génération, les types, les tests backend, les garde-fous, les scripts, les types et tests des espaces de travail, puis le lint. Aucun contrôle n’est remplacé ou ignoré pour obtenir ce résultat.

| Étape | Résultat |
| --- | --- |
| Génération et types Convex/tests | Réussis dans le dépôt de développement configuré |
| Backend | 2 829 tests réussis |
| Garde-fous | 144 tests réussis |
| Espaces de travail | 12 typages et 12 scripts de tests réussis |
| Social-features | 4 110 tests réussis |
| ANTSIA web | 883 tests réussis |
| Application mobile | 58 tests réussis |
| Application DIASPORALE | 1 402 tests réussis |
| Lint | 11 scripts réussis, zéro erreur, 287 avertissements non bloquants |

La session parallèle traitait déjà les mêmes échecs. Sa campagne complète a été suivie jusqu’au résultat, au lieu de lancer une seconde campagne concurrente. Le catalogue natif conserve l’exhaustivité des applications et la séparation des déploiements web/natif. L’attente du test de relation conserve l’objet complet de requête, incluant `returnRateLimit: true`. Les types de retenue des images de profil/page restent des unions précises, sans `any` ni cast ajouté pour contourner les erreurs.

Le codegen refusé dans l’ancien paquet de livraison isolé relevait de son absence de configuration Convex. Il réussit dans le vrai dépôt configuré, sans ajout d’environnement ni utilisation d’un backend de production.

## Correction complémentaire appliquée

Un dernier écart a été trouvé dans `DIASPORALE/apps/diasporale_com/src/data/engine-views.ts`, fonction `toPostMediaView` : le motif `fileScanUnavailable` devenait `null`, et une URL contradictoire pouvait être conservée avec une retenue.

La conversion masque maintenant l’URL pour toute retenue et conserve le troisième motif sous `scan_unavailable`. Le contrat `PostMediaView` représente ce motif explicitement. Le composant utilise déjà son état indisponible traduit ; aucune nouvelle traduction ni modification visuelle n’est nécessaire.

Quatre fichiers réels de DIASPORALE sont modifiés par ce complément :

- `apps/diasporale_com/src/data/engine-views.ts` : conversion fermée.
- `packages/diasporale-features/src/data/types.ts` : union précise du motif.
- `apps/diasporale_com/src/data/engine.test.ts` : trois retenues avec URL contradictoire et fixtures typées.
- `packages/diasporale-features/src/components/components.test.tsx` : image et vidéo indisponibles, sans élément média ni URL dans le DOM.

Régression reproduite avant correction : 3 échecs. Après correction : **52 tests d’adaptateur et 30 tests de composants réussis**, Node 22, un seul worker. Trois anciens `as never` sont retirés des fixtures concernées. Les quatre fichiers étaient prêts à 01:26:34 Europe/Paris, avant les étapes frontend de la campagne globale ; leurs empreintes sont toujours identiques à celles du passage ciblé réussi.

## Derniers changements voisins

Le passage global est réussi. Les modifications de Stories et de défilement mobile arrivées en parallèle sont également couvertes par une reprise réussie : 144 garde-fous, typage du paquet, 4 122 tests de social-features dans 272 fichiers, et lint sans erreur. Les quatre étapes complémentaires sortent 0.

## Préservation

Aucune donnée, session, média stocké, graine, schéma ni configuration de backend n’est modifié par cette intervention. Aucune commande backend ni édition de fichier `.env*` n’est exécutée par ce second regard. Les tests ajoutés utilisent des objets fictifs et le rendu local du harnais.

La branche applicative `codex/pa4-identite-session`, son HEAD `c4d36f3` et l’index ANTSIA sont conservés. La suppression déjà indexée de `DIASPORALE/packages/diasporale-features/src/styles/fonts.css` reste à son auteur. Aucun changement concurrent n’a été remis à HEAD, stagé ou réécrit ; aucun commit de code, push ni déploiement n’est effectué dans cette tâche.

Les serveurs locaux déjà actifs sont conservés. Les corrections sont dans les sources locales ; ce contrôle ne constitue pas une nouvelle publication en ligne.

## Preuves

- [Bilan structuré](recette/controle-global-second-regard-20261021.json)
- Avant, patch étroit et tests ciblés : `.git/global-second-regard/media-fail-closed-20261020T232540Z/`.
- Contrôle global et reprises : `/Users/okatech/Library/Caches/antsia-verification-finale-cj39n4mw/`.
