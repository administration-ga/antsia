# U03–U08 reportés sur main — 21 octobre 2026

## Constat

Les lots responsive U03 à U08 ont été publiés le 21/10 depuis la lignée de livraison Codex (`71c93a5` → `2966fea`). La consolidation de `main` (PR 25) n'a repris que les compléments sociaux et leurs prérequis. La production servie depuis `main` (`main-086cd43b8686`) a donc perdu Clips et Explorer, les profils adaptatifs, la création et la pause des Stories, la messagerie en espace de travail, la demande de contact des boutiques ainsi que le rail et la barre basse adaptatifs.

L'absence de `.antsia-panel` dans la feuille servie ne relève pas de U. Elle vient du design de la lignée Codex (`3507e4a`), que `main` a remplacé par les chartes « à la lettre » (ADR-0027). Ce report ne la réintroduit pas.

## Report

Sept commits publiés ont été repris par `cherry-pick -x` sur `main` `d2ac0be` : `71c93a5`, `0c273d7`, `afd0113`, `5b89394`, `e2c3819`, `70939c5` et `4d1e07b`. Deux commits suivent : une adaptation et des tests.

- **Style de `main` conservé.** Les 26 fichiers en conflit (42 zones) gardent le style de `main`. La logique U est fusionnée mot à mot avec ce style. Les classes de l'ancienne lignée de design ne sont pas réintroduites.
- **Version des compléments sociaux.** La carte d'offre, la grille du catalogue, le lien vers le catalogue de la vitrine et les marges des offres jointes gardent la version des compléments sociaux, postérieure à U.
- **Verrou de session.** Il était déjà dans `main` (`0c273d7`) ; seuls les rapports sont repris.
- **Composeur hors des coquilles.** Le composeur de publication est monté une fois, au-dessus des coquilles téléphone et bureau. Le fichier en cours de choix survit au passage d'un seuil.
- **Bandeau de la démo.** L'espace borné de Messages retranche le bandeau de la démo.
- **Jetons.** Les jetons de l'ancienne charte absents de `main` sont remplacés par leur valeur de repli (16 px, 1 400 px) ou par la surface des entrées voisines (cliquet `theme-contract`).
- **Test non reporté.** Le cas « analyse indisponible » (`fileScanUnavailable`) n'est pas repris : `main` n'a ni ce motif de retenue ni sa présentation classique.

Aucun changement de `convex/`, `package.json`, `bun.lock` ni `deploy/`. Aucun backend n'est concerné.

## Vérification

Faite dans un candidat isolé (`main` + DIASPORALE `fab55ef`, `bun install --frozen-lockfile`), sans toucher à l'arbre de travail partagé.

| Contrôle | Résultat |
| --- | --- |
| Typages : 12 espaces de travail, tests racine, Convex | sans erreur |
| Moteur social (`@antsia/social-features`) | 4 112 tests, 271 fichiers |
| Application `antsia-ga` | 998 tests, 108 fichiers |
| `@antsia/ui`, `social-domain`, `api`, `social-contracts`, `social-native` | 2 178 + 899 (3 ignorés) + 255 + 65 + 54 |
| Console `admin-antsia-ga`, mobile `antsia-mobile` | 81 + 84 |
| DIASPORALE (domaine, fonctions, application) | 697 + 877 + 1 389 |
| Cliquets du dépôt, scripts | 144 + 44 |
| Lint des espaces | 0 erreur (257 avertissements préexistants) |

Total : 11 877 tests réussis. Une première passe a été coupée par un disque plein (ENOSPC) : elle a été rejouée.

## Publication — 21 octobre 2026

Publication autorisée par le propriétaire. `main` `5851d02` (PR 29) est en ligne depuis 17 h 08 UTC :

- production : `main-5851d025af92-production` (`dpl_9Ga4gMfBVAzkh656teP4Vo2Ei8ix`) ;
- démo sous `/demo` : `main-5851d025af92-demo` (`dpl_4Hx7Day2T2jvBbsGuEe6L53VsxVZ`).

Le contexte publié contient les seuls fichiers suivis de `main` et de DIASPORALE `fab55ef`. Les secrets serveur sont hérités des projets, sans lecture. Aucun backend Convex n'a été déployé.

- **Avant promotion.** Enfant et principal directs redirigés vers le SSO Vercel ; ancien alias démo en 404 ; version publique encore `086cd43` ; `main` inchangé.
- **Après promotion.** Santés HTTP 200 sur les versions exactes. La CSP du principal vise `diligent-avocet-585`, celle des pages démo `vivid-hedgehog-655`.
- **Recette en ligne.** Compte démo fictif Awa MBA, à 390, 834 et 1 440 px : Réseau, Explorer, Clips, Messages, Moi, Actus, profil, vitrine et fiche d'offre, ainsi que les pages publiques du principal. Aucun débordement horizontal et aucune alerte. Console vide, sans erreur ni avertissement.
- **Ce que la recette confirme.** Barre basse au téléphone (Accueil, Clips, Messages, Explorer, Profil). Rail compact à 834 px. Rail complet et colonne iCom à 1 440 px. Messages en espace borné, sans défilement du document, avec le bandeau démo retranché. Explorer en grille de médias, images chargées.

Preuve : [`publication-proof.json`](../../../recette/responsive-u03-u08-main-2026-10-21/publication-proof.json). Retour arrière possible : promouvoir `antsia-m1kry4rya` (`main-086cd43b8686`).

### Observations, sans retour arrière

- **Clé brute dans les actus.** La visionneuse affiche la clé `fileScanUnavailable` pour un média dont l'analyse est indisponible. Ce défaut existait déjà dans `main` `086cd43` : les backends renvoient ce motif, absent du contrat front de `main` (`MediaWithheld`, `errors.json`). **Corrigé et publié** le soir même : PR 31 (contrat front, écrans, garde Convex alignée sur les backends en ligne) et diasporale#22 (`789e9ec`), version `main-0773370b0a85`. Contrôle en ligne de `/demo/actus` à 390, 834 et 1 440 px : phrase traduite, aucune clé brute ([preuve](../../../recette/file-scan-unavailable-2026-10-21/publication-proof.json)).
- **Fiche d'offre à une colonne.** Le cadre boutique de `main` fait 768 px, sous le seuil de 832 px de la mise en page à deux colonnes de U07. Le cadre de 1 024 px venait de l'ancien design (`3507e4a`), pas de U.
- **Onglet coupé.** À 390 px, l'onglet « Conversations » de Messages se coupe en fin de mot.

## Limites

- Les suites Convex (`test:convex`) ne sont pas rejouées : `convex/` est identique à `main`.
- Aucune recette visuelle locale : elle demanderait les secrets d'authentification du poste.
- La recette en ligne utilise l'émulation de taille du navigateur, pas des appareils physiques. Elle n'a pas joué de conversation ni publié de contenu.
