# Sources iOS 9 à 13 dans `main` — 2 novembre 2026

**`main` reproduit désormais à l'octet près le JavaScript publié dans le build 13.** Rien n'est publié par cette intégration, ni sur TestFlight, ni sur le Web, ni sur Convex.

## Pourquoi

Les builds 9 à 13 ont été assemblés depuis l'arbre partagé, où `apps/antsia_mobile` n'est pas suivi par git. `main` restait au numéro source 8 : un build tiré de `main` aurait perdu ces correctifs, et Apple aurait refusé son numéro.

## Ce qui rejoint `main`

| Lot | Fichiers | Raison |
| --- | --- | --- |
| Application | `apps/antsia_mobile/**` | les sources telles que publiées, ressources comprises |
| Dépendance | `expo-font` au catalogue, `bun.lock` | `bun.lock` identique à celui du build |
| Thème natif | `packages/ui/src/themes/antsia-native.ts`, son test, `scripts/sync-native-theme-tokens.mjs` | jetons utilisés par l'application ; le générateur `--check` passe contre les CSS de `main`, identiques à celles de l'arbre |
| Plat du jour des Stories | `convex/modules/stories/{dailySpecialSource,stories,tables}.ts`, `convex/modules/shops/{shops,tables}.ts`, `convex/modules/moderation/reviewProjection.ts`, `packages/social-domain/src/dailySpecial.ts`, leurs tests | `StoryDto.dailySpecial`, lu par l'application ; déjà en production depuis la publication du 24 octobre |

Les fichiers sont copiés sans retouche depuis l'arbre partagé, sauf `convex/modules/shops/catalog.test.ts` : il n'y prend que le bloc « SU06 — plat du jour dans les Stories du réseau », sans les blocs du lot public et de l'opérateur local ci-dessous.

## Ce qui n'en fait volontairement pas partie

- Le bac à sable local du 25 octobre : `convex/lib/localCommerceSandbox`, `convex/modules/platform/localOperatorBootstrap`, `convex/modules/federation/access.ts` et `emitters.ts`, `convex/modules/shops/catalogControl.ts`, l'audit `operator.bootstrap`.
- Le plat du jour public et le travail web : `getDailySpecial`, `packages/social-features`, `packages/ui` hors thème natif, `packages/api/src/network.tsx`. L'application n'en dépend pas.
- Les captures des recettes iOS 9 à 12 (18 Mo), qui restent dans l'arbre partagé. La recette du build 9 est aussi dans la branche de la PR 85, un brouillon dont le code est désormais couvert ici.

## Preuves

| Contrôle | Constat |
| --- | --- |
| Dérive depuis le build 12 | sur les 401 sources inventoriées avant sa publication, seul `app.config.ts` a changé dans l'arbre partagé ; `assets/app-icon.png` s'y ajoute. Le candidat en diffère aussi par `convex/_generated/api.d.ts`, `packages/api/src/network.tsx` et `packages/social-domain/src/audit.ts`, hors du bytecode d'après la ligne suivante |
| Bytecode Hermes | `main.jsbundle` reproduit depuis cette branche, mêmes commandes : `469281fe0cc9a95b47b935921a4a12084663daf0e458898b434babe4cf7e1b72`, identique à l'IPA 13 par `cmp`, 5 317 776 octets |
| Ressources | 45 fichiers embarqués, tous identiques à ceux de l'IPA 13 |
| Sans ces lots | le typage échoue (57 erreurs) et le bytecode diffère de 496 octets : ils sont bien nécessaires |
| Contenu | 122 fichiers relus : ni environnement, ni clé, ni chemin privé |

`bun run verify` complet, code 0, avec DIASPORALE à son `origin/main` (`367c2bd`) : moteur 3275 tests, cliquets 150, scripts 92, 12 typages, 12 suites d'espaces (12 992 tests réussis, 4 ignorés, dont `antsia-mobile` 240), 11 lints sans erreur. `expo prebuild` depuis cette branche réussit, avec l'icône.

## Correction d'un constat précédent

Le rapport de l'icône (`docs/recette/icone-ios-2026-11-02/RAPPORT.md`) attribuait un rouge de `verify` à `diasporale-com`. Ce rouge venait du candidat : il avait pris le `HEAD` local de DIASPORALE (`fab55ef`), en retard de 14 commits sur `origin/main` (`367c2bd`), où `fileScanUnavailable` est déjà traité. Vérifier avec `git archive origin/main`, jamais `HEAD`, tant que le clone local de DIASPORALE n'est pas à jour.

## Restes

- Aucun binaire natif n'a été compilé depuis cette branche : seul le JavaScript est prouvé. Le premier `eas build` tiré de `main` reste à éprouver, sous le numéro 14.
- `main` reste en retard sur la production pour le travail web et le plat du jour public : publier depuis `main` retirerait ces éléments. Ne pas publier depuis `main` sans les y amener.
- Aucun essai sur iPhone physique.
