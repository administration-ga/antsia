# Tri de l'arbre partagé — 2 novembre 2026

**Le code qui n'existe que dans l'arbre partagé tient en une vingtaine de fichiers, et l'un de ces lots corrige un défaut en ligne.** Le reste est constitué de preuves de recette. Rien n'a été déplacé, publié ni supprimé.

Comparaison de chaque fichier de `ECOSYSTEMES/ANTSIA` (branche `codex/pa4-identite-session`, hors fichiers ignorés) à `origin/main` `d788ecf2` et à l'historique de toutes les branches. Détail fichier par fichier : `classement.json`.

| Fichiers | Nombre |
| --- | --- |
| Identiques à `main` | 3650 |
| Absents de toute branche | 1545 |
| Sur une autre branche | 102, dont 100 sur une branche distante |
| Passés dans l'historique de `main`, sans y être aujourd'hui | 5 |
| **Total** | **5302** |

Les quelque 1160 changements affichés par `git status` sont trompeurs : ils se mesurent contre un `HEAD` du 19 octobre, et presque tous sont maintenant dans `main`.

## Classement proposé

| Lot | Fichiers | Publié ? | Classement |
| --- | --- | --- | --- |
| **A. Accueil `/bienvenue`** | 2 | non | **À amener, et à publier** |
| **B. Bac à sable du catalogue, Niveau 1** | 10 de code, 3 de documentation | non | **Local à conserver**, à mettre en sûreté sur une branche |
| **C. Charte v4 de DIASPORALE** | 3 | sources embarquées, sans effet visible | Décision à part (PR dédiées) |
| **D. Journal d'exécution SU06** | 1 | sans objet | À amener |
| **E. Recettes** | 1606 | sans objet | Rapports à amener après relecture, captures à garder hors du dépôt |
| **F. Contenu de démonstration** | 23 | sans objet | À amener |
| **G. Configuration locale** | 1 | sans objet | Local à conserver |
| **H. Résidus** | 3 fichiers, 2 branches | sans objet | Obsolète |

### A. Accueil `/bienvenue` : un défaut en ligne

**Corrigé et publié le 2/11 sur accord du propriétaire** : `docs/recette/bienvenue-publication-2026-11-02/RAPPORT.md`. Le constat ci-dessous est celui d'avant le correctif.

`apps/antsia_ga/src/app/bienvenue/page.tsx` et son test. Un membre connecté au statut `welcome`, donc sans profil finalisé, est envoyé sur `/bienvenue` par `network-shell.tsx`. Or `main` et la production y montent `AccessHomeScreen`, la porte de connexion, au lieu de `WelcomeScreen`.

- **Constaté le 2/11 en lecture anonyme** : `https://antsia.vercel.app/bienvenue` et `/demo/bienvenue` ont pour titre « Entrer sur ANTSIA », et non « Bienvenue sur ANTSIA ».
- **Observé le 26/10** par la session de recette, sur une arrivée réelle : la page affichait la connexion (note `diagnostic-idn-recette-production-2026-10-26` du vault).
- **Correctif éprouvé sur `main`** : les 2 fichiers s'y appliquent tels quels, 4 tests et typage verts. `WelcomeScreen` y est déjà.

**Non vérifié** : je n'ai pas rejoué le parcours avec un vrai compte neuf. L'effet sur les nouveaux membres vient de la lecture du code et de ces deux constats. La recette du 26/10 n'attribue pas à ce défaut l'échec du PIN IDN, qui reste inexpliqué.

### B. Bac à sable du catalogue, Niveau 1

`convex/lib/localCommerceSandbox`, `convex/modules/platform/localOperatorBootstrap`, `convex/modules/federation/{access,emitters,localCatalogAccess.test}`, `convex/modules/shops/catalogControl.ts`, `packages/social-domain/src/audit.ts`, `convex/_generated/api.d.ts` (dérivé), ADR 0040 et 0041 et l'index des ADR. Autorisé par le propriétaire le 25/10 (ADR-0041) pour le seul backend local : l'exception est fermée par défaut et exige `ANTSIA_LOCAL_COMMERCE_LOA1`, des origines en boucle locale et des environnements `sandbox`.

- **Essayé sur `main`, sans le committer** : typage du moteur, 472 tests ciblés et 150 cliquets verts. Une seule entrée API s'ajoute, interne (`localOperatorBootstrap:run`).
- **Pourquoi ne pas l'amener tout de suite** : ce lot modifie des gardes d'administration que la production exécuterait (`federation/access`, `catalogControl`), pour un besoin local et encore inachevé : d'après l'ADR-0041, l'attribution réelle reste à vérifier et aucun catalogue réel n'a été reçu. Il n'existe pourtant que sur ce disque, d'où la branche de sauvegarde proposée.

### C. Charte v4 de DIASPORALE

Voir `docs/recette/charte-v4-2026-11-02/` du dépôt DIASPORALE et les deux PR dédiées.

### D. Journal d'exécution SU06

`docs/etudes/2026-10-21-sept-univers-et-vie-publique/EXECUTION.md` décrit les compléments du 24/10, en ligne et désormais dans `main`. Il mentionne encore « aucun commit » : à reprendre en l'amenant.

### E. Recettes (1606 fichiers, environ 109 Mo)

Rapports et captures de 49 dossiers, 976 images. Le balayage des fichiers texte n'y trouve **ni jeton, ni cookie de session**, mais de vraies adresses e-mail dans 6 dossiers :

`chartes-2026-10-20` (117 occurrences), `design-et-comptes-2026-10-21` (22), `demo-comptes-autonome-2026-10-21` (9), `session-switch-final-2026-10-20` (9), `configuration-native-2026-10-21` (8), `relations-media-2026-10-20` (5).

- **À garder hors du dépôt** : ces 6 dossiers et ceux qui documentent de vrais comptes (`idn-2026-10-20`, `connexions-production-2026-10-21`, `comptes-reels-aller-retour-2026-10-21`, `session-rechargement-production-2026-10-20`, `deconnexion-production-2026-10-20`). **Les images n'ont pas été regardées** : une capture peut montrer un nom ou un compte réel sans que ce balayage le voie.
- **À amener après relecture** : les 30 rapports texte des autres dossiers, utiles comme historique. Leurs liens vers des captures seront à adapter.
- **Recommandation** : une archive des captures hors de l'arbre, car elles n'existent que sur ce disque.

### F. Contenu de démonstration (23 fichiers, 0,9 Mo)

`docs/demo-content/` : fictif, sans adresse réelle dans le texte. Les 12 images restent à regarder avant de les amener.

### G et H. Configuration et résidus

- **`.claude/launch.json`** : chemins absolus de cette machine, y compris vers PRO_GA.
- **Obsolète** : `app.json` (`{ "expo": {} }`, référencé nulle part), les deux `next-env.d.ts` en variante de développement, la branche locale `verif-fusion-pr67` (une fusion de vérification), et les 5 commits d'avance de `codex/pa4-identite-session`, déjà dans `main`.

## Hors de git, à connaître

- **`.git/codex-*` (3,3 Go)** : copies publiées et preuves privées, dont `.git/codex-release-2026-10-25-navigation/source`, qui a servi à la parité. Elle contient 1,1 Go de `node_modules` régénérables ; son manifeste et ses sources ne le sont pas.
- **`.convex/` (3,9 Go)** : le backend local de développement, avec ses données. **`.env.local` et `.vercel/`** sont propres à cette machine.
- **Disque** : 97 % occupé ce soir. Aucune suppression sans décision.

## Limites

Le balayage des adresses repose sur un motif et exclut les domaines fictifs : c'est un repère, pas un audit de confidentialité. 87 fichiers ignorés sous `docs/recette/` ne sont pas comptés, et le dépôt DIASPORALE est traité à part.
