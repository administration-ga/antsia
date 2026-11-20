# Renommage : DIASPORALE devient DIASPORA.GA — 20/11/2026

Décision du propriétaire du 20/11/2026 (chantier CH-800) : le réseau fermé de la diaspora s'appelle
désormais **DIASPORA.GA**, sur le domaine `diaspora.ga` (démonstration : `demo.diaspora.ga` ; l'apex et
`www` sont réservés à la future production). `diasporale.com` n'a jamais été acheté. Le renommage est
complet, clés techniques comprises, et se fait en un lot couplé : le moteur ANTSIA d'abord, puis
l'application. La décision du moteur est l'ADR « renommage DIASPORA.GA » de `ANTSIA/docs/adr/`.

Le renommage est produit par un script rejouable (`renommer.mjs`, rangé avec son plan dans
`ECOSYSTEMES/DOCUMENTATION/DIASPORA_GA/Renommage_2026-11-20/`, hors des dépôts) : chemins d'abord
(`git mv`), puis contenus (arbre syntaxique TypeScript pour le code, règles de texte ordonnées
ailleurs), puis règles ciblées nommées. Aucune retouche à la main hors du script.

## Correspondance

| Contexte | Ancien | Nouveau |
|---|---|---|
| Marque affichée (interface, textes, courriels, console) | `DIASPORALE`, `DIASPORALE.COM` | `DIASPORA.GA` |
| Domaine | `diasporale.com` | `diaspora.ga` |
| Dossier du projet | `ECOSYSTEMES/DIASPORALE` | `ECOSYSTEMES/DIASPORA_GA` (lien masqué laissé à l'ancien chemin) |
| Dépôt GitHub (renommé après la fusion) | `administration-ga/diasporale` | `administration-ga/diaspora.ga` |
| Application, son paquet, sa clé au catalogue | `apps/diasporale_com`, `diasporale-com`, `diasporale_com` | `apps/diaspora_ga`, `diaspora-ga`, `diaspora_ga` |
| Paquets | `@diasporale/domain`, `@diasporale/features`, `diasporale-workspace` | `@diaspora-ga/domain`, `@diaspora-ga/features`, `diaspora-ga-workspace` |
| Dossiers des paquets | `packages/diasporale-domain`, `packages/diasporale-features` | `packages/diaspora-ga-domain`, `packages/diaspora-ga-features` |
| Clé de réseau, charte, espace de textes | `diasporale`, `diasporale-gaboma` | `diaspora-ga`, `diaspora-ga-gaboma` |
| Thèmes du moteur | `packages/ui/src/themes/diasporale.css`, `diasporale-gaboma.css` | `packages/ui/src/themes/diaspora-ga.css`, `diaspora-ga-gaboma.css` |
| Fichiers de langue | `locales/*/diasporale.json` | `locales/*/diaspora-ga.json` |
| Clés du navigateur, cookie, libellé de version | `antsia:diasporale:…`, `diasporale:brouillon:…`, `diasporale-langue`, `diasporale-hors-ligne-v…`, `diasporale-<sha>-antsia-<sha>-<cible>` | `antsia:diaspora-ga:…`, `diaspora-ga:brouillon:…`, `diaspora-ga-langue`, `diaspora-ga-hors-ligne-v…`, `diaspora-ga-<sha>-antsia-<sha>-<cible>` |
| Constantes, variables d'environnement | `DIASPORALE_*`, `NEXT_PUBLIC_DIASPORALE_DATA_SOURCE`, `DIASPORALE_VERCEL_*`, `DIASPORALE_DEMO_*`, `DIASPORALE_PRODUCTION_*`, `DIASPORALE_RELEASE_WORKDIR` | mêmes noms avec `DIASPORA_GA` |
| Types, composants, fonctions | `DiasporaleDataSource`, `useDiasporaleT`, `joinDiasporale`, `leaveDiasporale` | `DiasporaGaDataSource`, `useDiasporaGaT`, `joinDiasporaGa`, `leaveDiasporaGa` |
| Variables, propriétés | `diasporaleCommit`, `plan.diasporale`, `diasporale` | `diasporaGaCommit`, `plan.diasporaGa`, `diasporaGa` |
| Scripts et options du moteur | `dev:diasporale`, `build:diasporale`, `deploy:diasporale`, `--filter=diasporale-com`, `--diasporale` | `dev:diaspora-ga`, `build:diaspora-ga`, `deploy:diaspora-ga`, `--filter=diaspora-ga`, `--diaspora-ga` |
| Espaces de travail du moteur | `../DIASPORALE/apps/*`, `../DIASPORALE/packages/*` | `../DIASPORA_GA/apps/*`, `../DIASPORA_GA/packages/*` |
| Comptes de démonstration | `<acteur>@demo.diasporale.test`, `diasporale-demo-idn-*`, `diasporale-demo-attestation-*` | `<acteur>@demo.diaspora-ga.test`, `diaspora-ga-demo-idn-*`, `diaspora-ga-demo-attestation-*` |
| Projet de l'hébergeur (renommé par le propriétaire) | `diasporale-demo` | `diaspora-ga-demo` |
| Documents vivants de l'application | `docs/00_CAHIER_DES_CHARGES_DIASPORALE.md`, `docs/01_PLAN_IMPLEMENTATION_PROMPTS_DIASPORALE.md`, `docs/03_CHARTE_DIASPORALE.md` | `…_DIASPORA_GA.md` |
| Skill, mémoire | `design-diasporale`, fiche `diasporale` | `design-diaspora-ga`, fiche `diaspora-ga` |

Là où le point est interdit : `DiasporaGa` (types, composants), `diasporaGa` (variables, propriétés),
`DIASPORA_GA` (constantes, variables, dossiers), `diaspora-ga` (clés, paquets, chartes), `diaspora_ga`
(dossier d'application, clé du catalogue).

## Ce qui ne change pas

- La tranche du moteur : `convex/modules/diaspora/`, `managedBy: "diaspora"`, `DIASPORA_SLICE_MANIFEST`,
  `diaspora.json`, les contrats `DIASPORA-ATTESTATION-V1` et `DIASPORA-COMMUNAUTE-V1`.
- Les thèmes du compte `sable` et `gaboma`.
- Les versions des dépendances et `bun.lock` (réécrit seulement par `bun install`, au jour J).
- `convex/_generated/` (régénéré par le `codegen` de la vérification, au jour J).

## Ce qui ne se réécrit pas

Tout `docs/**` est figé, contenu et nom, sauf une liste blanche de documents vivants :

- DIASPORA.GA : `docs/00`, `docs/01`, `docs/03`, `docs/34`, `docs/36`, `docs/37`, `docs/38`, `docs/39` ;
- ANTSIA : `docs/00`, `docs/01`, `docs/22`, `docs/23`, `docs/36`, `docs/39`, `docs/contrats/*`,
  `docs/adr/README.md`, `docs/design-systems/**`.

Les documents datés d'avant le 20/11/2026 gardent l'ancien nom et les anciens chemins. Dans les
fichiers vivants restent aussi tels quels : les références `diasporale#N` ; le nom de base de tout
fichier figé portant l'ancien nom ; tout chemin contenant une date `AAAA-MM-JJ`, à partir de son
segment daté ; toute ligne marquée `renommage:conserver`.

## Données et exécution

- **Backend de démonstration** : remise à zéro documentée, puis graine, dans la fenêtre de
  publication ; sans elle, la graine (qui cherche par clé) créerait un second réseau et recréerait les
  acteurs en double. Suppression de données : accord du propriétaire.
- **Fonctions** : `joinDiasporaGa`, `leaveDiasporaGa` ; backend et site se publient ensemble.
- **Navigateur** : clés renommées sans migration ; la langue, le thème de l'appareil et les brouillons
  de la démonstration sont perdus. Accepté.
- **Variables** : aucun alias ; les nouveaux noms existent chez l'hébergeur avant la première
  construction. `TRUSTED_ORIGINS` reçoit `https://demo.diaspora.ga` ; `networkSlug` passe à
  `diaspora-ga` dans `NOTIFICATION_APPLICATIONS_JSON`. Variables : accord du propriétaire.
- **Mesure d'audience** : rupture de série (propriété `network`).
- **Retour arrière** : le libellé de version change ; aucun retour outillé vers un déploiement d'avant.
- **Textes légaux et de consentement** : la marque y change ; leurs versions et leurs dates ne sont pas
  montées par le script (décision du propriétaire, avec le juriste).

## Vérification

L'aperçu du 20/11/2026 n'a reçu que des contrôles sans installation (analyse syntaxique, `node --check`,
`JSON.parse`, recherches de résidus, second passage du script sans effet). La vérification commune
(`bun run --cwd ../ANTSIA verify`), la recette au navigateur et `engine-compat.json` se consignent dans
la PR du lot couplé, au jour J, après `bun install`.
