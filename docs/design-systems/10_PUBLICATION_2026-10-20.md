# Publication des sept design systems — 20 octobre 2026

Les sept thèmes et les huit rubriques sont publiés sur [ANTSIA](https://antsia.vercel.app/).
La sonde publique renvoie HTTP 200, `status: ok` et le commit exact
`3507e4a264c0a135f0d07faa3b4c2432e814423f`.

## Version et traçabilité

| Élément | Valeur |
|---|---|
| Branche poussée | `codex/sept-design-systems-20261020` |
| Commit des designs | [3507e4a](https://github.com/administration-ga/antsia/commit/3507e4a264c0a135f0d07faa3b4c2432e814423f) |
| Base publique tracée séparément | `3e20aadfe4c4bb491cc2d1b60a3286a51a29ac96` |
| Base Git antérieure | `a29a6d81b815815f7f8aa77d2ac81f7bff134128` |
| Version publique précédente conservée | `audio-gesture-20261020-82c4108726107498` |
| Déploiement Vercel | `dpl_F2NAUaB5miGd7UeqPXv8MWjR2WRT`, READY, production |
| Build immuable | [antsia-okb7zqc3x](https://antsia-okb7zqc3x-okatechs-projects-f0102678.vercel.app/) |
| Projet | `antsia` — `prj_PjiCPA1GobnnCipPpVkaAYxFVIkB` |
| SHA-256 du paquet | `456eb830d4e413fc9dd464ae984b7b06c1b339dcd91311f4ce61a7fe2c21d4a5` |

La base publique contenait 190 fichiers front déjà publiés mais non tracés dans
main. Un premier commit les conserve à l'identique ; le second porte les designs
sur 141 chemins, documentation et preuves locales comprises. Aucun changement
de branche ni d'index réel n'a été effectué dans le checkout partagé.
La comparaison de tous les fichiers Git du paquet avec le commit des designs
ne présente aucun absent ni écart.

La livraison conserve les corrections médias et audio déjà publiques.
Les évolutions métier Emplois/Services non publiées, leurs gardes, le mobile natif
et les autres travaux parallèles ont été exclus. Pour les écrans commerce,
seule la présentation a été reportée sur la base publique. Les deux adaptations
de tests candidatures du checkout courant ne sont pas nécessaires à cette base
et ne sont pas publiées.

Aucune fonction Convex de production, configuration d'environnement, application
de démonstration, console ou application DIASPORALE n'a été déployée.

## Vérification du paquet exact

| Contrôle | Résultat |
|---|---|
| Application ANTSIA | 700 tests, 95 fichiers, réussis |
| Composants UI | 2 263 tests, 17 fichiers, réussis |
| Fonctions sociales front | 4 028 tests, 260 fichiers, réussis |
| Cliquets | 140 tests, 25 fichiers, réussis |
| Scripts | 33 tests, réussis |
| Deux fichiers moteur de comparaison | 26 tests, réussis |
| Typage application, UI et fonctions sociales | Réussi |
| Lint application, UI et fonctions sociales | 0 erreur ; 77, 6 et 106 avertissements |
| Build Next et typage Vercel | Réussis sur le paquet poussé |
| Styles construits | Sept thèmes, classes de page, Inter et nouveau contrat présents |

Cela représente **7 190 tests réussis** sur ce paquet.

`bun run verify` a également été exécuté dans le checkout partagé après codegen.
Il s'arrête avec 2 699 tests moteur réussis et trois échecs dans deux fichiers
modifiés par des travaux hors livraison : inventaire des tables de services
dans `commerce-trust-data-policy.test.ts`, et deux attentes `undefined` face à
`null` dans `shops.test.ts`. Les mêmes deux fichiers de la base retenue passent
leurs 26 tests. Le résultat global du checkout partagé n'est donc pas annoncé
vert ; il ne valide pas non plus les travaux parallèles exclus.

## Mise en ligne constatée

Le build de production a d'abord été créé sans réaffecter le domaine.
Sa sonde a renvoyé le commit attendu, et les feuilles servies contenaient les
sept thèmes. Le domaine public servait encore la version audio précédente.
Ce même build a ensuite été promu, sans reconstruction ; la sonde publique
confirme le nouveau commit.

Contrôles visuels sur `antsia.vercel.app` :

- Accueil sombre à 1 440 px : corps 15 px, titre 26 px, champ 16 px,
  présentation de connexion et aperçu du fil présents, sans débordement.
- Accueil clair à 390 px : connexion IDN et création de compte visibles,
  navigation compacte, sans débordement.
- Accueil anglais à 834 px : titre et aperçu du fil traduits, sans débordement.
- Mentions légales à 390 px : sommaire ouvrable, titres de sections 20 px,
  sans débordement.
- Français et apparence sombre initialement résolue rétablis ; dimensions
  temporaires du navigateur réinitialisées.
- Requête de logs d'erreur Vercel pour cet identifiant : aucune entrée retournée.

Le rechargement de la session de contrôle membre a demandé une nouvelle
connexion IDN. Le propriétaire a choisi de terminer avec les contrôles publics.
La recette des sept thèmes en session membre de production n'est pas revendiquée dans ce rapport. La recette locale antérieure reste
décrite dans [09_IMPLEMENTATION_ET_RECETTE.md](09_IMPLEMENTATION_ET_RECETTE.md).
Aucun message, appel, achat ou publication de contenu n'a été effectué.

## Preuves

- [Contrôles structurés](recette/publication-controles.json)
- [Accueil ordinateur sombre](recette/publication-accueil-desktop.jpg)
- [Accueil téléphone clair](recette/publication-accueil-mobile.jpg)

Paquet, manifeste, journaux et sondes conservés dans
`~/Library/Caches/antsia-releases/20261020-sept-design-systems/`.
