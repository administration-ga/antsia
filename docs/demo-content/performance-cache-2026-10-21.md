# Développement rapide et cache ANTSIA — 21 octobre 2026

## Résultat local

Le serveur conserve Next 16.4.2, le cache de compilation persistant, Fast Refresh
et le GC natif des calculs devenus inutiles après 30 minutes. Le démarrage habituel
`bun run dev:antsia` charge maintenant le réglage de diagnostic rapide.
Aucune installation supplémentaire, modification de `.env*`, migration,
suppression de données, graine ou publication en ligne n'a été effectuée ici.

## Cause mesurée et correction

Le profil CPU du serveur situe environ 2,5 secondes sur 5,76 secondes enregistrées
dans la collecte des piles et le suivi des promesses React. Ce mécanisme existait
déjà avant Next 16.4 ; le profil ne démontre pas qu'il s'agit d'un hook nouvellement
activé. En développement, Next porte la profondeur des piles V8 à 50 niveaux.
Le retour aux 10 niveaux habituels de Node réduit ce coût dans l'application.

`apps/antsia_ga/src/instrumentation.ts` applique le réglage seulement au serveur
Node en développement. Les messages d'erreur, sources, cartes de sources et HMR
restent disponibles ; les piles ont désormais dix niveaux au lieu de cinquante.
Le fichier est un point d'entrée natif de Next, exécuté au démarrage du serveur.
Le réglage effectivement chargé a été relu dans le processus : `10`.
La production, les tests et Edge ne sont pas modifiés par ce hook.

Pour retrouver ponctuellement les piles longues pendant un diagnostic :

```sh
ANTSIA_DEV_EXTENDED_STACKS=1 bun run dev:antsia
```

Ce paramètre de commande ne nécessite aucune modification d'un fichier `.env`.
Les essais Node 22 n'ont pas suffi à résoudre l'écart ; le lancement final utilise
la commande habituelle et son Node existant. Aucun changement de runtime imposé.

Deux répétitions du rendu ont aussi été supprimées :

- `getAppT` réutilise une instance par langue **dans la requête React seulement**.
  Le défaut est normalisé avant le cache ; aucun singleton partagé entre utilisateurs.
- Le catalogue utilise des arguments primitifs pour son cache de requête. Les
  objets de filtres distincts des métadonnées et du rendu partagent donc une lecture.
  Les règles de session, OTT, bearer, filtrage et validation des DTO sont conservées.

## Mesures

Temps complets de réponse HTTP en développement, sans cookie, après échauffement.
Les chiffres varient avec la charge des autres sessions de développement.

| Route | Début de cette intervention, médiane 9 | Après relance normale, médiane 21 | P90 final |
| --- | ---: | ---: | ---: |
| `/entrer` | 43,12 ms | 24,46 ms | 31,69 ms |
| `/decouvrir` | 209,22 ms | 84,02 ms | 113,35 ms |
| Catalogue épicerie | 114,31 ms | 71,39 ms | 102,75 ms |
| Vitrine studio | 119,95 ms | 69,26 ms | 100,07 ms |

Un passage après HMR, avant la dernière relance, donnait également
18,91 / 65,22 / 54,87 / 51,82 ms (neuf valeurs par route). Le dernier passage
de 21 valeurs a subi des typages/tests concurrents ; ce ne sont pas des garanties
de latence à toute charge ni une comparaison à contenu métier strictement figé.
Le dernier contrôle vérifie HTTP 200 **et du contenu réel**, pas seulement le statut.

Le test de profondeur dans le même processus, à code et cache identiques, confirme
un gain lorsque les piles passent de 50 à 10 niveaux. Les relevés bruts sont dans
`.git/antsia-cache-policy/{matched-stack50,matched-stack10}.json` ; les mesures
finales et profils CPU sont dans `.git/antsia-cache-performance/`.

## Cache et données

Le GC expérimental reste actif avec le délai de 30 minutes et son budget de
100 ms ; aucun cache utile n'a été désactivé pour obtenir les gains.
Le cache disque a été relevé à 439 576 Kio pendant les investigations, puis à
238 296–244 752 Kio et enfin à 308 804 Kio (environ **0,32 Go**) après les dernières
compilations. Le moteur a réorganisé son cache ; aucune purge manuelle de cache
n'a été exécutée pendant cette intervention du 21 octobre.

Le délai du GC concerne les racines de calcul devenues inaccessibles. Ce mécanisme
limite leur accumulation ; il ne définit toujours pas de quota absolu en Go pour
tout le travail encore utile. Les caches de requête ajoutés ne persistent aucun
profil, jeton ou contenu d'un utilisateur entre requêtes.

## Vérifications et périmètre

- Codegen et typage Convex initiaux : réussis, avant les validations ciblées.
- Trois suites ciblées : **24 tests réussis**, notamment français/anglais,
  interpolation, portée du diagnostic, filtres, refus de session/OTT et DTO privés.
- Typage ANTSIA et lint des six fichiers : réussis ; diff sans erreur d'espacement.
- Preuve RSC réelle : trois requêtes catalogue successives français/anglais/français,
  chacune avec **une création de traduction et une lecture du catalogue**, langue
  HTML correcte. Les compteurs temporaires ont ensuite été retirés des sources.
- Session démo et fil conservés ; deux images décodées dans la vue contrôlée.
- HMR réel : ajout puis retrait d'une propriété CSS constatés dans le navigateur,
  compilations **378 et 345 ms**, sans rechargement manuel ni reste du contrôle.
- Capture : `recette/performance-cache-20261021.png`.
- Serveur final relancé normalement, débogueur fermé ; backend local conservé.
- Suite applicative élargie : **825 tests réussis, 14 échecs** dans trois fichiers
  de travaux voisins : texte Explorer/Découvrir, mocks de navigation sans
  `ReseauCreateAction`, et mock commercial sans `threads`. Aucun de ces fichiers
  n'a été corrigé ni remplacé pour le chantier performance.
- Plus tard, le watcher Convex a aussi signalé une erreur de statut dans le test
  voisin `modules/posts/mediaFeed.test.ts`. Aucun fichier Convex modifié ici.
- Aucun commit applicatif, push ou déploiement. Les autres modifications de l'arbre
  partagé, ainsi que les données, comptes, médias et sessions, sont conservés.

## Références

- [Node : profondeur des piles, valeur habituelle 10](https://nodejs.org/api/errors.html#errstacktracelimit)
- [Next : initialisation du serveur par instrumentation](https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation)
- [React : cache invalidé à chaque requête serveur](https://react.dev/reference/react/cache)
- [Turbopack : collecte des calculs inaccessibles](https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopackGc)
