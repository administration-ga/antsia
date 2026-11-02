# `main` aligné sur la production — 2 novembre 2026

**`main` contient désormais ce qui est en ligne sur `antsia.vercel.app` et sur Convex.** Sur 2646 fichiers publiés, 2614 y sont identiques à l'octet ; les 32 autres sont nommés ci-dessous. L'API de `main` est identique à celle relevée en production. Cette intégration ne publie rien.

## Ce qui est en production

| Cible | Identité | Source de la preuve |
| --- | --- | --- |
| Fronts principal et démo | `specialized-6095514b6a00`, `dpl_D93mYLT4Vp9hztfZ4TJwgYCqbwXT` et `dpl_ZD7mGDThdEPRTEvgpPyASzZvvhwD` | `/sante-fonctionnelle` et liste Vercel, relues le 2/11 ; `docs/recette/espaces-specialises-2026-10-25/manifeste-publication.json` |
| Moteur Convex, démo et production | copie du 24/10 `8b7ce0eb…` et les 4 fichiers de la PR 87 | audit de la publication du 26/10 ; rien de plus récent dans les journaux du projet |

Le moteur n'a pas été interrogé pendant ce travail, conformément à la consigne : son état vient de ces journaux.

## Ce qui rejoint `main`

204 fichiers, repris de la copie publiée (`.git/codex-release-2026-10-25-navigation/source`) et contrôlés un à un par l'empreinte du manifeste. La source n'est pas l'arbre partagé, sauf pour deux fichiers absents de cette copie, dont l'empreinte est exacte dans l'arbre.

- **`apps/antsia_ga`** (98) : navigation mobile et trois colonnes, plat du jour public et son partage en Story, recadrage carré des images, recherche de l'univers alimentation, correctifs d'écrans.
- **`packages/social-features`** (74) : direct, réseau personnel, messagerie, Stories, coque.
- **`packages/ui`** (17) : composants, charte, tests de thèmes.
- **`apps/admin_antsia_ga`** (5) : fenêtre des rattachements de catalogue.
- **`convex`** (8) : `getDailySpecial`, `paginateMappings`, tests.
- **`packages/api`**, **`tests/ratchets`** : un fichier chacun.

La PR 86 est fusionnée telle quelle : ses deux fichiers « pro » sont exactement ceux publiés, et sa recette apporte le manifeste de référence.

## Écarts assumés au publié

| Fichiers | Raison |
| --- | --- |
| `apps/antsia_mobile/**` (22) | `main` est plus récent : sources du build 13 (PR 89) ; le Web ne les embarque pas |
| `package.json`, `bun.lock` | `main` est plus récent : `expo-font` du mobile, `@antsia/social-contracts` de DIASPORALE |
| `packages/ui/src/themes/antsia-native.ts` et son test | `main` est plus récent : thème natif généré (PR 89) ; le Web ne l'importe pas |
| `apps/*/next-env.d.ts` (2) | le publié porte la variante de développement, régénérée par Next à chaque construction |
| `packages/ui/src/themes/diasporale.css`, `diasporale-gaboma.css`, `antsia-themes.test.ts` | charte v4 de DIASPORALE : sa portée est `data-charte="diasporale…"`, sans effet sur ANTSIA, et ces feuilles sont réservées à sa session (`CLAUDE.md`). Son test n'existe que dans l'arbre local de DIASPORALE : les amener casserait `origin/main` de DIASPORALE |
| `app.json` racine | `{ "expo": {} }`, référencé nulle part |

## Preuves

| Contrôle | Constat |
| --- | --- |
| Parité des fichiers | 2614 identiques sur 2646 ; `parite-fichiers.json` nomme chaque écart |
| API Convex | `function-spec` du candidat contre le relevé de production (`production-functions-after.json`, 24/10) : 1039 entrées de part et d'autre, aucune manquante, aucune en trop, aucune signature différente. L'audit du 26/10 constate que la PR 87 n'a pas changé cette API |
| `bun run verify` | code 0, avec DIASPORALE à son `origin/main` (`367c2bd`) : moteur 3303 tests, cliquets 150, scripts 92, 12 typages, 12 suites d'espaces (13 307 tests réussis, 4 ignorés), 11 lints sans erreur |
| Construction | `next build` de `apps/antsia_ga` et `apps/admin_antsia_ga`, code 0, avec les origines publiques de production ; rien n'est envoyé |
| Bytecode du mobile | hors de ce lot, inchangé depuis la PR 89 |
| Contenu | ni environnement, ni clé, ni chemin privé dans le lot |

## Limites et restes

- **Aucune recette dans un navigateur** : les sources sont celles déjà en ligne et recettées le 25/10, et rien n'a été publié pour être observé.
- **Publier depuis `main`** ne retire plus de fonctions, mais reste soumis à l'accord explicite du propriétaire. Le mode « tout » de l'ancien script rejoue des graines : ne pas l'utiliser pour une correction.
- **DIASPORALE** : 46 fichiers du dépôt voisin diffèrent de son `origin/main` dans la copie publiée, dont sa charte v4. Son travail local (26 fichiers modifiés) n'est pas intégré : c'est à sa session d'en décider.
- **Arbre partagé** : il contient encore du travail jamais publié, dont le bac à sable local du 25/10 (`localCommerceSandbox`, `localOperatorBootstrap`, droits de `federation/access`). Il n'est pas concerné par cette parité et reste à trier.
