# MP14 — Rapport de livraison du candidat MP00–MP14

**Date : 21 octobre 2026 · Branche : `claude/marketplace-mp00-mp14-20261021` · État : candidat composé et vérifié ; mise en production soumise à l'accord du propriétaire.**

Les sessions Codex ont été interrompues à 17 h 50 pendant la composition, dans un bac à sable Vercel (`sbx_YVoF…`) que la reprise n'a pas pu utiliser : prolongation refusée (403), commandes non autorisées. Le candidat a été recomposé localement, hors de l'arbre partagé.

## Composition

| Élément | Valeur |
|---|---|
| Base | `main` `0773370` (PR 31), en production depuis le 21/10 au soir ; fusions successives de `d2ac0be` (PR 28), `5851d02` (PR 29, U03–U08) et `0773370` |
| Instantané de l'arbre partagé | `eea4f0c` (parent `c4d36f3`), construit avec un index privé |
| Fusion puis correctifs | `1994827`, `884fa37`, `6c3b0c4`, `72b0042`, `561b162`, style de main `8688e0d`, `1e6bccf` (PR 31), thèmes de main et classes `mp-*`, puis ce rapport |
| Arbre, index et HEAD partagés | Inchangés (`codex/pa4-identite-session`) |

L'instantané couvre `apps/` (hors `apps/antsia_mobile`, laissé à `main`), `packages/`, `convex/`, `tests/`, `scripts/`, `ops/`, `deploy/` et `docs/` hors recettes, contenus de démonstration, maintenance et mémoire. Il porte **trois couches non publiées** :

1. les lots commerce P03–P19 de l'étude du 18/10, restés « sources raccordées » ;
2. le responsive U03–U08 (`71c93a5` … `e2c3819`), publié dans la nuit puis **absent de `main` et de la production depuis le 21/10 à 10 h 46** ;
3. la marketplace MP01–MP13.

La marketplace dépend des deux premières couches : tables et contrats P (intentions de service, candidatures V2), classes et jetons du système U. Le candidat les publie donc ensemble et les vérifie ensemble.

### Mise à jour sur la PR 29

Pendant la vérification, une autre session a remis U03–U08 dans `main` (PR 29, `5851d02`) **dans le style des chartes**, sans la passe de design du 20/10 (« sept systèmes appliqués aux huit rubriques » : classes `antsia-*`, jetons `esp-card-*`, repli coloré des médaillons). Elle a été déployée avec l'accord du propriétaire. Fusion de `main` dans la branche (30 fichiers) : le style de `main` l'emporte sur les composants partagés ; la marketplace garde ses ajouts fonctionnels (routes et pages spécialisées, onglet Boutiques vers la marketplace, iCom professionnel, rendu d'article, gabarit et blocs de vitrine, facettes et profil de service, image prioritaire).

**Décision du propriétaire (21/10) : le style de `main` hors marketplace.** Appliquée ainsi :

- la passe du 20/10 (`3507e4a`) est annulée en trois voies sur les fichiers hors marketplace ; les fichiers qui ne diffèrent de `main` que par le style (classes, objets `style`, variantes, CSS embarqué, commentaires) reprennent la version de `main` ;
- les lots P gardent leurs fonctions (candidatures, services, achats, appels de modération, effacement) : seules leurs classes de la passe sont remplacées par les classes d'origine ;
- thèmes, charte et `communication.css` sont **identiques à `main`** : aucune couleur, taille de texte ni jeton de thème ne change ; les thèmes DIASPORALE restent ceux de `main` ;
- les écrans marketplace emploient leurs propres classes `mp-*` (titre, sous-titre, page, panneau, formulaire), définies en valeurs fixes à la fin de `globals.css` : les écrans de `main` qui portent `antsia-title` sans définition restent inchangés ;
- retirés, car devenus sans usage : l'aperçu public de l'accueil, la présentation des avatars par tons et les tests de géométrie de la passe.
- écrans partagés touchés par le chantier (accueil, coque publique, connexion, bienvenue, cadre membre) : version de `main` + le seul apport marketplace (destination spécialisée transmise, navigation spécialisée, aiguillage MP01) ; les autres écrans partagés gardent leurs blocs fonctionnels et reprennent les blocs purement stylistiques de `main`.

### Conflits (54 fichiers)

- Quand un côté inclut l'autre ligne à ligne, la version la plus complète est retenue ; les doublons créés par les déplacements auto-fusionnés ont été retirés (imports, clés JSON, déclarations).
- Démo intégrée de `main` préservée : hauteur sous le bandeau (`demoWorkspaceHeight`), espace de stockage démo, codes démo lisibles (`demoCodeReadable`), catalogue démo fermé.
- Sept thèmes et charte : jetons `esp-` de l'arbre, qui contiennent déjà les quatre jetons ajoutés par `main`.
- Traductions : aucune clé en double, mêmes clés FR/EN.
- Next 16.4.2 et `bun.lock` de l'arbre, cohérent avec `main` + DIASPORALE (`bun install --lockfile-only` ne change rien).
- Le test de hauteur démo de la messagerie (`main`) est conservé dans `messages-screen-demo.test.tsx`, à côté du test MP09 de l'arbre.

### Correctifs apportés à la vérification

- **Conversation contextuelle (MP09)** : `ContextualObjectRefView` redevient le type V1 à trois natures, que DIASPORALE rouvre de façon exhaustive. Les quatre natures passent par `ContextualAnyObjectRefView` et le geste explicite `onOpenContextualObject` ; une collaboration professionnelle ne s'ouvre jamais par le rappel historique (test ajouté).
- **Inventaire P16** : `commerceCatalogIndexes` (MP04, état collectif sans titulaire) ajouté à la revue des tables commerciales.
- **MP07b** : jeu d'essai rendu cohérent avec la règle du contrat (un bénéficiaire vérifié suppose un rail qualifié pour la vérification) ; l'analyseur n'est pas assoupli.
- **Tests de l'application** : `data-scroll-behavior="smooth"` (MP04), entrées professionnels/presse/rencontres dans Découvrir (MP09, MP10, MP13), retour au fil confié à la coque spécialisée (MP01).
- **Dépôt public** : chemins `/Users/…` remplacés par `~/…` dans les documents ajoutés.

## Vérifications du candidat exact

| Contrôle | Résultat (vérification finale, 21/10 21 h 18, sur `0c62c67`) |
|---|---|
| Génération Convex | Verte, sur un backend local propre au dossier candidat : schéma validé, composants installés. Le backend local de l'arbre partagé n'a reçu aucun déploiement. |
| `typecheck:convex`, `typecheck:tests` | 0 erreur |
| Tests du moteur (`test:convex`) | 3 197/3 197 |
| Cliquets / scripts | 146/146 (dont `theme-contract` : aucun jeton fantôme) · 70/70 |
| Typage des 12 espaces de travail | 12/12, DIASPORALE `ad898b5` compris |
| Tests des espaces ANTSIA | domaine 998 · contrats 86 · api 291 · natif 75 · ui 2 178 · social-features 4 150 · console 87 · antsia_ga 1 735 · mobile 84 |
| Tests DIASPORALE (`ad898b5`) | domaine 697 · features 877 · application 1 398/1 399 (voir ci-dessous) |
| Lint | 0 erreur (avertissements préexistants) |
| Build Next `antsia_ga` | Vert (Next 16.4.2) |

Total ANTSIA : **13 097 tests verts**.

### DIASPORALE (dépôt voisin, non modifié)

Avec son `main` actuel (`ad898b5`, qui intègre `789e9ec`), DIASPORALE type sans erreur face à ce moteur et ses thèmes restent ceux de `main`. Un seul cliquet échoue dans `diasporale-com` : il demande les libellés FR/EN de cinq nouvelles surfaces de modération (`commerceStorefront`, `professionalProfile`, `professionalCollaboration`, `editorialVersion`, `editorialMedia`) dans `settings.dataRights.decisions.surface` et `moderationDesk.surface`, soit dix clés. Ces fichiers appartiennent à DIASPORALE : les ajouter est la condition de son adoption de ce moteur. Le déploiement d'antsia.vercel.app n'en dépend pas.

### Parité des contrats jumeaux

Les tests de parité lisent `../PRO_GA` : ils sont verts contre l'arbre de travail PRO.GA (branche `feat/antsia-social-commerce`, non publiée). La publication PRO.GA reste un périmètre distinct ; tant que son producteur V2 n'est pas déployé, aucun catalogue marchand réel n'alimente la marketplace.

## Capacités

| Capacité | État dans ce candidat |
|---|---|
| Espaces spécialisés, retour social (MP01–MP02) | Raccordés, opt-in ANTSIA |
| Catalogue V2, facettes, marketplace (MP03–MP05) | Raccordés ; aucun catalogue marchand réel ; sélection démo distincte |
| Services, devis, forfaits (MP06) | Raccordés ; options serveur `ANTSIA_COMMERCE_*` fermées par défaut |
| Préparation financière (MP07) | Lecture seule, `ANTSIA_COMMERCE_PAYMENT_PREPARATION_ENABLED=false` |
| Rails de paiement (MP08) | **Fermés** : aucun contrat PSP fourni |
| Réseau professionnel (MP09) | Raccordé, volontaire |
| Rencontres personnelles (MP10–MP11) | **Fermées** : aucune preuve de majorité ; `/rencontres` informative |
| Rédaction et sites médias (MP12–MP13) | Raccordés ; aucun article réel publié par cette session |

Aucune capacité conditionnelle n'est activée par ce candidat.

## Mise en production — non effectuée

La marketplace ajoute treize tables et des fonctions Convex. Les publications précédentes n'avaient déployé que le front ; celle-ci exige, dans l'ordre :

1. trancher la passe de design (ci-dessus), fusionner la PR dans `main` et revérifier le résultat ;
2. `convex deploy` sur la démonstration, puis sur la production (`diligent-avocet-585`) ;
3. `vercel deploy --prod` de l'enfant démo, puis du principal ;
4. recette en ligne aux trois formats, comptes démo et compte réel.

Ces gestes restent soumis à la décision explicite du propriétaire (CLAUDE.md du dépôt, PA9).

Script préparé, non lancé : `scripts/convex-deploy-demo-production.sh`. Il part d'un export propre de `origin/main` et refuse de continuer si la marketplace n'y est pas. Il vérifie que chaque clé (`ANTSIA_CONVEX_DEMO_DEPLOY_KEY`, `ANTSIA_CONVEX_PROD_DEPLOY_KEY`, lues dans l'environnement, jamais affichées) désigne le bon déploiement. Il montre l'aperçu `--dry-run`, fait retaper le nom de chaque cible, et marque une pause entre démonstration et production pour les graines de démo. Le mode `verifier` ne fait que les contrôles.

```bash
ANTSIA_CONVEX_DEMO_DEPLOY_KEY='…' ANTSIA_CONVEX_PROD_DEPLOY_KEY='…' bash scripts/convex-deploy-demo-production.sh verifier
```

Schéma : sur les tables existantes, seulement des champs optionnels et des unions élargies ; les champs obligatoires appartiennent aux tables nouvelles. Si Convex refusait la validation sur les données réelles, la version en service resterait active.

## Retour arrière

- Front : promouvoir de nouveau `dpl_9Ga4gMfBVAzkh656teP4Vo2Ei8ix` (`main-5851d025af92-production`, en ligne au 21/10 au soir).
- Backend : redéployer `main` `5851d02`. Les tables nouvelles restent vides tant que les capacités sont fermées ; ce retour n'a pas été répété.
