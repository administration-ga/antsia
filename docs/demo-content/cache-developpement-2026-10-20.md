# Cache de développement ANTSIA — 20 octobre 2026

> Historique du réglage initial. Le ralentissement observé ci-dessous est traité
> dans [la correction du 21 octobre](performance-cache-2026-10-21.md), avec cache
> persistant et GC conservés. Les mesures du 20 octobre restent des preuves historiques.

## Réglage appliqué

Next et son preset ESLint passent de 16.2.9 à 16.4.2 dans le catalogue commun.
Cette version fournit le ramasse-miettes natif de Turbopack, absent de 16.2.9.
L'application ANTSIA active `developmentCacheGc` dans son vrai `next.config.ts`.
La configuration partagée garde le cache de compilation persistant et configure :

```js
turbopackFileSystemCacheForDev: true,
turbopackGc: { minProgressMs: 100, rootTtlMs: 30 * 60 * 1000 }
```

Le délai concerne les racines de calcul devenues inaccessibles ; les calculs encore
utiles restent conservés. Ce réglage est expérimental, limité au développement et
sur option explicite. Les autres applications n'activent pas ce GC. Le cache des
builds reste désactivé, comme avant la mise à jour ; `agentRules: false` évite la
création automatique de nouvelles consignes AGENTS par Next.

Ce mécanisme réduit l'accumulation d'anciens calculs ; **ce n'est pas un quota en Go**.
Il ne permet pas de garantir que le cache ne dépassera jamais 6,6 Go. Aucun effacement
manuel des fichiers de la base Turbopack active ni purge périodique intégrale n'est ajouté.
Le premier cycle complet de collecte après 30 minutes n'a pas été observé dans cette recette.

## Périmètre et sécurité des données

- Next sur le port 3030 a été relancé avec la configuration finale ; Convex 3210 conservé.
- Après validation du nouveau serveur, seule l'ancienne génération de cache
  `.next/dev/cache/turbopack/f37fad94` a été retirée : 894 064 Kio, chemin réel contrôlé,
  aucun fichier suivi par Git, aucun fichier ouvert au dernier contrôle `lsof`.
- Cache actif conservé : 391 104 Kio au dernier relevé, soit environ 0,40 Go décimal.
- Aucun contenu, compte, média, base Convex, fichier `.env*` ni session supprimé.
- Aucun commit applicatif, push ou déploiement en ligne réalisé pour ce réglage.

## Vérifications

- Génération des types et typage Convex de développement : réussis.
- API : 207 tests réussis, dont trois nouveaux contrôles de portée du réglage.
- Typages API, application ANTSIA et console : réussis ; lint des configurations modifiées : réussi.
- Application : 816 tests réussis, 10 échecs dans les travaux partagés de navigation :
  neuf mocks sans `useNetworkNavigationLayout`, une attente « Découvrir » face au texte « Explorer ».
  Ces fichiers n'ont pas été modifiés par le chantier cache.
- Typage DIASPORALE : six erreurs existantes de contrats média (`fileScanUnavailable`),
  hors configuration/cache ; sources DIASPORALE conservées.
- Navigateur : session démo conservée, fil et images chargés, navigation vers boutiques
  et prestations réussie. Capture : `recette/cache-gc-20261020.png`.
- Actualisation à chaud éprouvée avec une propriété CSS temporaire : ajout constaté dans
  le style calculé, puis retrait constaté ; compilations 285 ms et 175 ms.
  La propriété de contrôle a été supprimée sans écraser les changements voisins.
- Serveur final : Next 16.4.2 prêt en 357 ms, `turbopackGc` reconnu, aucun AGENTS généré.

## Mesures HTTP et limite de la comparaison

Médianes en millisecondes, requêtes séquentielles sans cookie après échauffement :

| Route | 16.2.9 (9 mesures) | 16.4.2 GC actif (9 mesures) | 16.4.2 GC inactif (9 mesures) |
| --- | ---: | ---: | ---: |
| `/entrer` | 23,10 | 55,30 | 53,36 |
| `/decouvrir` | 71,08 | 197,80 | 233,08 |
| Catalogue épicerie démo | 71,25 | 152,56 | 165,53 |
| Vitrine studio démo | 62,45 | 134,81 | 145,92 |

Les réponses sont plus lentes dans cette comparaison. Des tests voisins occupaient
un cœur et le watcher Convex recompilait à la suite des installations ; d'autres
sources changeaient en parallèle. Ces mesures ne démontrent donc pas une causalité
de Next ou du GC, et **ne prouvent pas l'absence de ralentissement global**.
Le dernier passage avec GC donne 49,80 / 178,62 / 129,42 / 121,85 ms, HTTP 200 partout.
Un dernier A/B après fin des tests et des compilations de fond donne 19,60 / 63,32 /
65,11 / 52,48 ms sous 16.2.9, contre 25,71 / 114,83 / 85,60 / 76,24 ms sous 16.4.2.
Le surcoût SSR persiste : aucune garantie « sans ralentissement » ne peut être donnée.
La compilation incrémentale rapide et la persistance du cache sont bien conservées.
La génération 16.2.9 recréée par ce dernier A/B (392 860 Kio) a aussi été retirée
après les mêmes contrôles de chemin, Git et fichiers ouverts.

## Installation et reproduction

L'installation globale de l'arbre partagé est bloquée indépendamment par
`@config-plugins/react-native-webrtc@15.0.3`, version introuvable du chantier mobile.
L'installation a été bornée temporairement aux espaces web déjà présents dans le
verrou initial, dans le vrai dépôt ; la liste originale d'espaces a été restaurée
exactement. Le manifeste mobile n'a pas été corrigé ni installé par ce chantier.
Par rapport au manifeste relevé au début de ce chantier, seules les deux versions
Next et ESLint Next ont changé. Le verrou a été régénéré par Bun.

Les relevés locaux détaillés et journaux de comparaison sont dans
`.git/antsia-cache-policy/`. Ils ne sont pas nécessaires au démarrage normal.
Une modification de `packages/api/next-config.mjs` exige une relance de Next.

## Références primaires

- [GC Turbopack, introduit en 16.4](https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopackGc)
- [Cache persistant de Turbopack](https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopackFileSystemCache)
