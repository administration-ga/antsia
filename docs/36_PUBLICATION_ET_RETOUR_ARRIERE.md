# Publication et retour arrière d'ANTSIA

> Lot EX-01 du plan 13 (`docs/etudes/2026-11-09-finalisation/13_CONSOLE_EXPLOITATION_LANCEMENT.md`), 10 novembre 2026.
> Outils : `scripts/release.mjs` (publication étape par étape) et `scripts/release-check.mjs` (contrôle après coup).
> **Aucune exécution réelle n'a encore eu lieu avec ces outils.** Le premier usage réel, et en particulier le retour arrière
> des sites joué sur la démonstration, exige l'accord écrit et détaillé du propriétaire (commit, cibles, ordre, retour arrière).

Ce document ne cite **aucun** identifiant interne (déploiement, projet, équipe, adresse technique) : le dépôt est public.
Les cibles réelles vivent dans des variables de la machine qui publie (§ 3) ; les exemples ci-dessous sont fictifs.
Le cliquet `no-deployment-identifiers` relit ce document et `scripts/` à chaque `verify`.

## 1. Ce que la méthode garantit

- **Reproductible** : on publie un commit précis (SHA complet), depuis un export propre de ses seuls fichiers suivis, jamais
  depuis une copie de travail. Le plan affiché pour un SHA est exactement la liste des commandes qui partiront.
- **Vérifiée** : chaque envoi est suivi d'un contrôle — API servie par le moteur comparée à celle du commit, version servie
  par chaque site, politique de sécurité du contenu (CSP) limitée au bon moteur, routes clés en 200.
- **Réversible** : chaque étape consigne, dans un manifeste hors du dépôt, l'état d'avant (déploiement de site en production,
  API du moteur, version servie) qui sert au retour arrière.

## 2. Règles

1. **Accord écrit du propriétaire** avant toute exécution réelle : commit, cibles, ordre, retour arrière.
2. **Une étape par appel**, sur confirmation qui nomme l'étape et le commit : `--execute --confirmer <étape>@<sha12>`.
   Sans `--execute`, rien ne part ; il n'existe aucun mode « tout d'un coup ».
3. **Ordre invariable** : moteur de démonstration, moteur de production, enfant de démonstration, site principal (puis la
   console). Le moteur de production exige que la démonstration ait été publiée **et contrôlée** dans le même manifeste ;
   les sites exigent le moteur contrôlé (ou vérifié inchangé, § 5.2).
4. **Un seul publieur** : un verrou commun à toutes les publications de la machine ; avant chaque envoi et chaque promotion,
   l'état en ligne est relu et comparé à celui de l'étape précédente (un autre publieur passé entre-temps = refus).
5. **Jamais** : graine rejouée, variable de déploiement posée (`convex env set`, variables de projet de l'hébergeur),
   suppression en ligne. Les valeurs passées au build d'un site (`--build-env`, `--env`) ne valent que pour ce déploiement.
6. **Jamais de suppression d'index sans décision** : l'essai d'envoi (`--dry-run`) qui annonce une suppression d'index est refusé.
7. **Jamais de retrait de fonction plus récente** : un commit dont l'API ne contient pas une fonction servie en ligne
   (venue d'une publication plus récente) est refusé avant tout essai d'envoi. Remède : publier un commit qui la contient,
   ou composer un commit dédié.
8. **Projections publiques** : le site public lit chaque projection avec un schéma strict ; ajouter un champ à une projection
   existante casse les sites déjà en ligne dès l'envoi du moteur. Une nouvelle donnée publique passe par une projection
   **à part** (piège consigné dans `CLAUDE.md`). Les signatures changées sont listées par l'essai (`comparison.changed`) :
   les relire avant l'envoi.

## 3. Variables de la machine

Posées dans l'environnement de la machine qui publie, **jamais** dans le dépôt ni dans un fichier `.env*` du dépôt. Une
variable absente ou mal formée refuse l'étape qui en a besoin, en la nommant ; aucune n'a de valeur par défaut.

| Variable | Rôle | Exemple fictif |
| --- | --- | --- |
| `ANTSIA_RELEASE_CONVEX_DEMO` | nom du déploiement Convex de démonstration | `exemple-demo` |
| `ANTSIA_RELEASE_CONVEX_PROD` | nom du déploiement Convex de production | `exemple-production` |
| `ANTSIA_RELEASE_SITE_ORIGIN` | origine publique du site principal (la démonstration est servie sous `/demo`) | `https://site.exemple.test` |
| `ANTSIA_RELEASE_DEMO_CHILD_ORIGIN` | adresse de production du projet de l'enfant de démonstration : lue pour connaître son déploiement courant, jamais contrôlée (il répond 403 hors du relais, par conception) | `https://enfant.exemple.test` |
| `ANTSIA_RELEASE_CONSOLE_ORIGIN` | origine publique de la console | `https://console.exemple.test` |
| `ANTSIA_RELEASE_VERCEL_TEAM` | équipe de l'hébergeur des sites (identifiant ou nom court) | `exemple-equipe` |
| `ANTSIA_RELEASE_VERCEL_PROJECT_DEMO` | projet de l'enfant de démonstration | `exemple-projet-demo` |
| `ANTSIA_RELEASE_VERCEL_PROJECT_MAIN` | projet du site principal | `exemple-projet-principal` |
| `ANTSIA_RELEASE_VERCEL_PROJECT_CONSOLE` | projet de la console | `exemple-projet-console` |
| `ANTSIA_RELEASE_HOME` (facultative) | dossier des manifestes, journaux et exports, **hors des dépôts** (défaut : `~/antsia-publications`) | `/chemin/hors/depot/publications` |

Authentification : la CLI Convex et celle de l'hébergeur sont connectées sur la machine (aucune clé n'est lue ni écrite par
les scripts). Le moteur est visé par `CONVEX_DEPLOYMENT=prod:<nom>` ; les variables qui viseraient une autre cible
(`CONVEX_DEPLOY_KEY`, `CONVEX_DEPLOYMENT`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`…) sont retirées de l'environnement de chaque
commande, qui reçoit ensuite sa seule cible. Toute commande Convex passe par `scripts/convex-dev.mjs` (Node supporté en tête).

Les scripts de graines de la démonstration (`seed-demo-content.mjs`, `prepare-demo-content.mjs --target demo`) lisent les
mêmes variables `ANTSIA_RELEASE_CONVEX_DEMO` et `ANTSIA_RELEASE_SITE_ORIGIN`. La publication ne les appelle jamais.

## 4. Relevé de l'API du candidat

Avant d'envoyer un moteur, on compare l'API servie en ligne à celle du commit. Celle du commit se relève sur un **backend
local** qui sert exactement ce commit, puis se donne une fois à l'étape `moteur-demo-essai` (`--api-candidat <fichier>`) ;
elle est alors copiée dans le dossier de la publication. Un relevé dont l'adresse n'est pas locale est refusé.

```bash
# Dans une copie de travail propre, au commit à publier, avec son backend local
git status --short                    # rien : aucune modification
git switch --detach <sha>
bun install --frozen-lockfile
bun run dev:convex                    # laisser tourner : le backend local sert ce commit
# Dans un second terminal, même dossier
node scripts/convex-dev.mjs function-spec > /chemin/hors/depot/api-candidat-<sha12>.json
```

Le contrôle qui suit l'envoi du moteur de démonstration recoupe ce relevé : l'empreinte de l'API servie doit lui être
identique, sinon l'étape échoue (relevé faux ou envoi non abouti).

## 5. Les étapes, pas à pas

```bash
node scripts/release.mjs plan <sha>                  # le plan complet : rien ne part
node scripts/release.mjs <étape> <sha>               # le détail d'une étape et ses prérequis : rien ne part
node scripts/release.mjs <étape> <sha> --execute --confirmer <étape>@<sha12>
```

### 5.1 Ordre de la méthode

| N° | Étape | Cible | Ce qu'elle fait | Exige |
| --- | --- | --- | --- | --- |
| 1 | `export` | locale | vérifie le commit, relit `main` (le commit est-il dans `main` ?), DIASPORALE à son `origin/main` (jamais `HEAD`) ; archive les fichiers suivis des deux dépôts **sans aucun `.env*`** ; refuse l'export si un `.env*` s'y trouve ; écrit la liste d'exclusion de l'hébergeur ; empreinte des sources ; `bun install --frozen-lockfile` | dossier de publication neuf, 3 Gio libres |
| 2 | `moteur-demo-essai` | moteur de démonstration | relève l'API en ligne, la compare au candidat (refus d'un retrait), puis `deploy --dry-run` (refus d'une suppression d'index) | export, relevé du candidat |
| 3 | `moteur-demo` | moteur de démonstration | relit l'API en ligne (inchangée depuis l'essai), consigne le commit précédent, envoie | essai réussi |
| 4 | `controle-moteur-demo` | moteur de démonstration | API servie = candidat ; le site de démonstration **déjà en ligne** joint ce moteur (c'est l'épreuve des projections publiques) | envoi |
| 5–7 | `moteur-production-essai`, `moteur-production`, `controle-moteur-production` | moteur de production | les mêmes gestes | `controle-moteur-demo` réussi |
| 8 | `site-demo` | enfant de démonstration | relève son déploiement en production (retour arrière), déploie **sans bascule de domaine** avec la version `main-<sha12>-demo` ; un envoi coupé (EPIPE) se relance une fois | moteur prêt |
| 9 | `site-principal` | site principal | idem, version `main-<sha12>-production`, et l'adresse exacte du nouvel enfant passée au build (`ANTSIA_DEMO_RUNTIME_ORIGIN`, contrôlée comme le relais l'exige) | `site-demo` |
| 10 | `controle-prive` | principal et sa zone `/demo` | sur le déploiement **non promu** (requête privée de l'hébergeur) : santé, version exacte, CSP limitée au bon moteur, routes clés en 200 | `site-principal` |
| 11 | `promotion-demo` | enfant | vérifie que la production n'a pas changé depuis l'envoi, relève la version servie, promeut, vérifie | contrôle privé réussi |
| 12 | `promotion-principal` | principal | idem | `promotion-demo` |
| 13 | `controle-public` | principal et `/demo` | les mêmes contrôles, en public | `promotion-principal` |
| 14–17 | `site-console`, `controle-prive-console`, `promotion-console`, `controle-public-console` | console | le même chemin, version `main-<sha12>-console` | moteur prêt |

Un commit qui n'est pas dans `main` (commit composé) est étiqueté `commit-<sha12>-<cible>`, jamais `main-…`.

### 5.2 Sites seuls, moteur inchangé

Quand le commit ne change pas le moteur, `verification-moteur` remplace les étapes 2 à 7 : elle relève l'API des deux
moteurs et exige qu'elle soit exactement celle du candidat. L'empreinte ne prouve que les **signatures** : l'opérateur
affirme en plus, par `--moteur-inchange`, que le code du moteur de ce commit est celui déjà en ligne (affirmation consignée).
Dans le doute, publier le moteur.

### 5.3 Ce que montre le plan

Pour un commit fictif et les valeurs du § 3, l'étape 9 s'affiche ainsi (chemins abrégés) :

```text
9. site-principal — Déploiement du site principal, sans bascule de domaine [envoi]
     VERCEL_ORG_ID=exemple-equipe VERCEL_PROJECT_ID=exemple-projet-principal vercel inspect site.exemple.test --scope exemple-equipe --format=json
     (interne) origine technique de l'enfant (<URL_DEPLOIEMENT_ENFANT>) contrôlée comme le relais du principal l'exige
     VERCEL_ORG_ID=exemple-equipe VERCEL_PROJECT_ID=exemple-projet-principal vercel deploy …/export/ECOSYSTEMES --prod --skip-domain --archive=tgz --yes --scope exemple-equipe --build-env NEXT_PUBLIC_BUILD_SHA=main-0123456789ab-production --env NEXT_PUBLIC_BUILD_SHA=main-0123456789ab-production --build-env ANTSIA_DEMO_RUNTIME_ORIGIN=<ORIGINE_ENFANT> --env ANTSIA_DEMO_RUNTIME_ORIGIN=<ORIGINE_ENFANT> --meta antsiaReleaseCommit=0123456789abcdef0123456789abcdef01234567 --meta diasporaleReleaseCommit=<COMMIT_DIASPORALE> --meta sourceFingerprint=<EMPREINTE_SOURCES>
     VERCEL_ORG_ID=exemple-equipe VERCEL_PROJECT_ID=exemple-projet-principal vercel inspect <URL_DEPLOIEMENT> --scope exemple-equipe --format=json
```

Les marqueurs `<…>` désignent les valeurs connues seulement en cours de route ; l'exécution refuse de lancer une commande
qui en contiendrait encore un. Quand les variables sont posées, le plan affiche les vrais noms : ne jamais le recopier
dans le dépôt.

## 6. Contrôle après coup

`scripts/release-check.mjs`, en lecture seule ; sans `--execute`, il affiche les requêtes sans les lancer.

```bash
node scripts/release-check.mjs <sha> --cible principal --execute            # principal et /demo, en public
node scripts/release-check.mjs <sha> --cible principal --prive --execute    # sur le déploiement non promu (manifeste)
node scripts/release-check.mjs <sha> --cible console --execute
node scripts/release-check.mjs <sha> --cible moteur-production --execute    # API servie = relevé du candidat du manifeste
```

| Contrôle | Défaut signalé |
| --- | --- |
| Santé (`/api/sante-fonctionnelle`, sonde EX-03) | HTTP ≠ 200 (un 503 dit que le moteur ne répond pas), réponse illisible, moteur non configuré ou injoignable |
| Version servie | toute version différente de `main-<sha12>-<cible>` (ou `commit-…`, `--etiquette commit`) |
| CSP | un autre moteur ouvert, un joker `*.convex.cloud`, le moteur attendu absent de `connect-src` (HTTP et WebSocket), une CSP de développement |
| Routes clés | toute réponse autre que 200 (redirection comprise) : `/entrer`, `/a-propos`, `/confidentialite`, `/mentions-legales`, `/transparence`, `/sante-fonctionnelle`, `/api/sante-fonctionnelle` ; pour `/demo` et la console : `/entrer`, `/sante-fonctionnelle`, `/api/sante-fonctionnelle` |
| API du moteur | empreinte différente de celle du commit publié (fonctions en plus, manquantes, signatures différentes, nommées) |

Avertissements (consignés, non bloquants) : moteur lent, site antérieur à la sonde EX-03, version du moteur non déclarée
(`ANTSIA_ENGINE_VERSION` est posée par le propriétaire, jamais par les scripts). Les contrôles visuels (390 et 1440 px) et
les journaux de l'hébergeur restent à faire à la main.

## 7. Manifeste et journal

Un dossier par publication, hors des dépôts : `<ANTSIA_RELEASE_HOME>/<sha12>/` (ou `--publication <nom>`). Un dossier situé
dans un dépôt est refusé.

- `manifeste.json` : pour chaque étape, son état (`fait`, `echec`, `refusee`), ses dates, ses commandes et leurs codes, et
  ce qu'elle a relevé — commit de DIASPORALE, empreinte des sources, API en ligne avant l'envoi, commit précédent du moteur,
  déploiement de chaque site avant l'envoi et avant la promotion, version servie avant la bascule ;
- `api-candidat.json`, `api-<moteur>-avant.json`, `api-<moteur>-apres.json` : les relevés d'API ;
- `journal/<étape>.log` : chaque commande et ses sorties complètes ;
- `export/` : l'export propre, à supprimer à la main une fois la publication close (le manifeste reste).

Une étape échouée se rejoue après correction (sauf `export` : nommer une autre publication, ou vider le dossier à la main
après lecture du journal). Un verrou resté après un arrêt brutal (`<ANTSIA_RELEASE_HOME>/.verrou-publication`) se retire à
la main, après avoir vérifié qu'aucune étape ne tourne.

## 8. Retour arrière

### 8.1 Sites

On promeut le déploiement précédent, relevé par la publication. Ordre : l'enfant, puis le principal (comme à la publication) ;
la console à part.

```bash
node scripts/release.mjs retour-demo <sha> --execute --confirmer retour-demo@<sha12>
node scripts/release.mjs retour-principal <sha> --execute --confirmer retour-principal@<sha12>
node scripts/release.mjs retour-console <sha> --execute --confirmer retour-console@<sha12>
```

Chaque retour vérifie d'abord que la production sert encore le déploiement de cette publication (sinon : refus, il n'y a rien
à annuler ici), promeut le précédent, puis vérifie qu'il est servi. Le retour du principal relit en plus la version servie
du principal et de `/demo`, qui doit être celle d'avant la publication. La zone `/demo` ne revient qu'avec le principal :
il relaie vers l'adresse exacte de l'enfant fixée à son build.

### 8.2 Moteur

Il n'existe pas de « promotion du précédent » pour Convex : on **republie le commit précédent**, par les mêmes étapes,
sous un autre nom de publication.

```bash
node scripts/release.mjs export <sha précédent> --publication <sha12 précédent>-retour --execute --confirmer export@<sha12 précédent>
node scripts/release.mjs moteur-demo-essai <sha précédent> --publication <sha12 précédent>-retour \
  --api-candidat <relevé du commit précédent> --retour-de <publication annulée> \
  --execute --confirmer moteur-demo-essai@<sha12 précédent>
# puis moteur-demo, controle-moteur-demo, et les trois étapes de production, toujours avec --publication
```

- `--retour-de` n'admet le retrait **que** des fonctions que la publication annulée avait ajoutées ; tout autre retrait reste refusé.
- Une suppression d'index reste refusée : un index ajouté par la publication annulée reste en place (sans effet sur les données).
- Le commit précédent d'un moteur est consigné par l'étape d'envoi (`previousSha`) quand il a été publié avec ces outils ;
  pour une publication plus ancienne, le lire dans les rapports de publication (`docs/recette/*-publication-*`).
- Une projection publique modifiée par la publication annulée retrouve sa forme d'avant avec le commit précédent ; c'est
  pourquoi toute nouvelle donnée publique doit passer par une projection à part (§ 2, règle 8).

### 8.3 Retour complet

Sites d'abord (enfant, principal, console), puis moteur (démonstration, puis production) : aucun site ne doit appeler une
fonction que le moteur vient de retirer.

## 9. Hors de ces outils

- **DIASPORALE** (site de démonstration) : sa publication reste à sa session ; elle doit être republiée quand la
  démonstration reçoit un moteur qui change ce qu'elle lit.
- **Mobile** (iOS, Android) : hors de ces outils.
- **Variables de déploiement** (`ANTSIA_ENGINE_VERSION`, origines, clés) : posées par le propriétaire, jamais par les scripts.
- **Graines de la démonstration** : sur décision seulement, par leur propre script ; jamais dans une publication.
- **Domaines de production** : bascule et liste de contrôle au lot EX-19 (qui rejouera `release-check.mjs` sur les nouveaux
  domaines).

L'hébergeur des sites est celui d'aujourd'hui (décision 1 du plan 13 non prise). Tout ce qui lui est propre vit dans
`scripts/release/hosts/vercel.mjs` ; un autre hébergeur serait un autre module de même interface, sans réécrire le plan.

## 10. Ancien script

`scripts/convex-deploy-demo-production.sh` est **déprécié** au profit de `release.mjs`. Son mode par défaut (`tout`) ne
rejoue plus aucune graine (démonstration, pause, production) ; les graines n'ont plus qu'un mode explicite (`graines`). Il
lit les noms des déploiements dans `ANTSIA_RELEASE_CONVEX_DEMO` et `ANTSIA_RELEASE_CONVEX_PROD`.

## 11. Reste à jouer en réel

Sur accord écrit du propriétaire, par la session qui publie :

1. un premier plan réel (`plan <sha>` avec les variables posées), relu ;
2. un retour arrière des sites joué sur la démonstration, consigné (critère d'acceptation d'EX-01) ;
3. une première publication par ces outils, avec ses contrôles privé et public.
