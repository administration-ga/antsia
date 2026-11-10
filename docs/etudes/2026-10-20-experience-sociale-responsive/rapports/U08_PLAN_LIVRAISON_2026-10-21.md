# U08 — Base de livraison et procédure, reconnaissance du 21 octobre

Lecture seule des sources, manifestes et preuves historiques ; aucun test, codegen, build, serveur, appel de données, commande Git d’écriture ou déploiement exécuté. Ce rapport ne recontrôle pas l’alias distant actuel. L’autorisation de terminer, vérifier et livrer vient de la demande actuelle du propriétaire ; la présente sous-tâche reste documentaire.

## Deux bases publiées distinctes à conserver

Racine conservée : `/Users/okatech/Library/Caches/antsia-releases/20261020-connection-request/`.

| Cible | Source de référence | Inventaire et preuve |
|---|---|---|
| Front ANTSIA | `production/ECOSYSTEMES/` avec ANTSIA et ses workspaces voisins DIASPORALE | `production/manifest.json`, 2 998 fichiers, version `relations-media-20261020-c8de4d49935c` ; `production/media-stage.log`, `media-promote.log` et `docs/recette/relations-media-2026-10-20/production-frontend.json` |
| Backend de production final | `backend-production/ECOSYSTEMES/` | `backend-production/manifest.json`, 2 975 fichiers, révision de source après réparation AV ; `requeue-candidate-bundle/fullConfig.json`, `requeue-bundle-proof.json`, `requeue-hash-check.log` et preuve `production-requeue-backend.json` dans le dossier de recette |

Le front historique est `dpl_9ySFdUsUy7855qkAJSMM8xn8oz82`, cible `antsia`, READY puis promu. Le backend associé est `diligent-avocet-585` ; la preuve conservée atteste 710 modules corrélés, schéma inchangé. La dernière correction AV du backend porte seulement `modules/files/mutations.js` selon `requeue-bundle-proof.json`.

**Ne pas utiliser l’archive backend pour rebâtir le front.** Six comparaisons de source ciblées confirment que son bootstrap et son audio sont plus anciens que le front publié. Dans le checkout réel, le bootstrap/session et l’audio correspondent au manifeste front ; `convex/betterAuth/auth.ts` et `convex/modules/files/mutations.ts` correspondent au manifeste backend final. Les fichiers de demande de connexion et le sélecteur font également partie des corrections à conserver.

La branche distante de livraison `codex/sept-design-systems-20261020` s’arrête à `93df3fc`, après `3507e4a` et la base publique `3e20aad`. `3507e4a` contient déjà l’audio, mais pas le bootstrap session-reload ni les dernières corrections relations/backend. La branche réelle du checkout reste `codex/pa4-identite-session`, avec de nombreux travaux parallèles. Ni cette branche WIP entière ni la branche design seule ne représentent le snapshot actuellement documenté comme publié.

Sources d’autorité : `docs/24` à `docs/30`, particulièrement `29_SESSION_IDN_RECHARGEMENT_2026-10-20.md` et `30_CORRECTIFS_RELATIONS_ET_MEDIAS_2026-10-20.md` ; `docs/design-systems/10_PUBLICATION_2026-10-20.md` ; contexte et notes liées du vault ANTSIA, confrontés aux manifestes et à Git.

## Préparer les nouveaux candidats sans déplacer le travail applicatif

1. Éditer les vraies sources dans le checkout partagé, sans changer sa branche ni son index. Réserver les fichiers et conserver les modifications des autres sessions.
2. Créer une **copie de packaging** des deux bases ci-dessus dans un nouveau dossier de livraison. Ce n’est ni un worktree ni un emplacement d’implémentation. Les archives historiques restent immuables.
3. Reporter seulement la liste explicite de changements U01–U08 autorisés depuis les sources réelles. Sur un fichier mixte, reporter le delta approuvé par rapport à la base publiée ; ne pas remplacer aveuglément le fichier par tout son WIP. Établir un nouveau manifeste chemins/empreintes, ajouts et suppressions explicites.
4. Garder les workspaces voisins sous le même parent `ECOSYSTEMES/`. Ne copier aucun secret ni fichier d’environnement réel ; les variables nécessaires viennent du canal de configuration existant, sans affichage. Conserver le `.vercelignore` du paquet, qui exclut dépendances, sortie Next, Git, environnements et preuves privées.
5. Installer le graphe de dépendances **du candidat et de son verrou**, pas un lien global vers `node_modules` du checkout. Un tel lien pourrait résoudre les imports vers le WIP plutôt que les sources candidates. La base front n’inclut pas le workspace natif non publié ; ne pas ajouter son graphe par accident.
6. Pour tracer la livraison dans Git, partir de la branche de livraison sans la checkout. Tracer d’abord le delta public manquant depuis `3507e4a` si nécessaire, puis le delta UX. Un index temporaire ou la plomberie `git commit-tree` permet cette construction sans toucher à l’index réel ; vérifier que l’arbre commis est celui du candidat, pas celui du checkout WIP. Aucune commande de plomberie n’est exécutée ici.

## Commandes de vérification et livraison à reprendre par le coordinateur

Ce sont les commandes de scripts effectivement disponibles et les gabarits CLI correspondant au flux conservé. Les journaux historiques ne conservent pas l’argv complet du packaging/Vercel : aucun script de création du manifeste ou d’archive Vercel n’est versionné dans `scripts/`. Ne pas présenter les gabarits ci-dessous comme une retranscription de cet argv.

Depuis la racine **ANTSIA du candidat**, avec une configuration locale de vérification isolée des credentials de publication :

```sh
bun install --frozen-lockfile
bun run verify
bun --cwd apps/antsia_ga run build
```

`verify` passe par `node scripts/convex-dev.mjs codegen`, typages Convex/tests, tests Convex/cliquets/scripts puis tâches de workspace avec concurrence 1. Le wrapper choisit un Node supporté. Ne pas lancer codegen pendant un autre déploiement Convex ; ne pas relancer un serveur voisin. Les contrôles ciblés app/API/surfaces doivent porter sur le même candidat, puis le contrôle commun doit établir sa clôture ; un résultat historique ou un autre arbre ne suffit pas.

Pour une modification backend nécessaire, depuis le candidat **backend final**, vers la seule cible de production ANTSIA déjà sélectionnée par le canal sûr :

```sh
node scripts/convex-dev.mjs deploy --write-push-request "$BUNDLE_PATH" --typecheck enable
node scripts/convex-dev.mjs deploy --dry-run --typecheck enable
node scripts/convex-dev.mjs deploy --typecheck enable --yes
```

Le premier prépare le bundle et ne prouve pas sa publication. Relire le diff immédiatement avant le vrai push : aucune suppression d’index non prévue, schéma/crons et modules limités au changement autorisé ; conserver les corrections auth/relations/AV. Pas de graine, migration de données ou modification de configuration fournisseur dans ce flux. Après publication, corréler le bundle attendu au code distant comme dans les preuves historiques ; ne pas confondre `--write-push-request`, dry-run et publication.

Pour Vercel, utiliser le parent **ECOSYSTEMES du candidat front**, la liste blanche existante et les identifiants du projet déjà lié dans `.vercel/project.json` du checkout. Ce fichier contient seulement `projectId`, `orgId`, `projectName` ; ne copier que ce lien de projet dans le packaging si nécessaire, jamais un environnement. Projet `antsia`, équipe `okatechs-projects-f0102678`, identifiants déjà présents dans ce fichier. Le réglage distant de racine doit être confirmé avant la commande ; le build historique installe depuis deux niveaux au-dessus de l’application.

```sh
vercel deploy "$FRONT_ECOSYSTEMES" --prod --skip-domain --archive=tgz --yes --scope okatechs-projects-f0102678
vercel promote "$NEW_DEPLOYMENT_URL" --yes --scope okatechs-projects-f0102678
```

Les options de déploiement/archive sont présentes dans la CLI locale lue. Le build distant historique utilise Bun 1.4.2 et Next 16.2.9 ; le checkout contient une évolution Next/cache distincte. Ne pas embarquer cette évolution sans décision explicite. Avant promotion : santé/version attendues, bon backend dans la CSP, backend de démonstration absent, puis recette autorisée. Promouvoir le même build sans le reconstruire. La santé est dynamique dans `apps/antsia_ga/src/app/api/sante-fonctionnelle/route.ts` ; elle n’est pas une preuve de session, médias ou parcours métier.

`scripts/deploy-app.mjs` est un autre flux : catalogue Docker, Cloud Build et Cloud Run. **Il n’est pas la procédure Vercel employée pour ces snapshots** et ne doit pas être exécuté pour cette livraison Web.

## Catalogue API de production : présence et écarts précis

Lecture du bundle final conservé, sans requête de données :

| Surface | API présente dans le bundle |
|---|---|
| Boutiques | `shops.myShops`, `eligibleShopPages`, `storefront`, `directory` |
| Catalogue | `catalog.list`, `offer`, `postOffer` |
| Services | `services.discoverAvailability`, `discoverServices`, `quoteRequestContext`, `myRequests`, `myRequest` ; `serviceActions.options` et actions historiques |
| Emplois | `jobs.discoverAvailability`, `discover`, `job`, `listForShop` ; `jobApplications.myApplications`, `myApplication`, `apply`, `retry`, `refreshStatus`, `withdraw` |
| Préparation et suivis | `checkout.context`, `cartContext`, `findByClientRequestId`, `stopClientIntent`, `listMy`, `getAttempt` ; `purchases.get/listMy` ; `payment.context/getAttempt/listMy` |

**Absents de cette base publiée :** `services.findByClientRequestId`, `services.stopClientIntent`, `jobApplications.findByIdempotencyKey`, `jobApplications.stopClientIntent`. Les formulaires des reprises récentes qui les utilisent nécessitent une intégration backend explicite avant publication front. U04 nécessite aussi sa nouvelle lecture média. Présence d’un export ne prouve ni le DTO courant, ni une politique activée, ni une dépendance PRO.GA configurée. Le hub `/moi` actuel est une liste de routes, sans appel direct à ces API ; ses destinations doivent néanmoins être compatibles.

## Sous-tranche U08 proposée, en attente de réservation

Réutiliser les scénarios déjà écrits `packages/api/src/network-navigation-layout.test.tsx` et `apps/antsia_ga/src/components/member-chrome.test.tsx`, puis une nouvelle suite d’intégration responsive dédiée : retour de focus, chargement/vide/refus/offline, navigation 767/768 et 1199/1200, absence de double contenu/créateur. Les corrections de source seraient exclusivement dans les consommateurs que le coordinateur libère, jamais dans les primitives, auth/session, audio ou fichiers AV. Aucun de ces fichiers n’est réservé par ce rapport ; la tranche doit être confirmée avant écriture pour ne pas croiser U03–U07.

Les preuves natives P17d restent séparées ; une recette Web ne valide ni CallKit ni sonnerie/audio physique. Ce rapport prépare les opérations du coordinateur et ne déclare aucune nouvelle livraison.
