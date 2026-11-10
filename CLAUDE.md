# ANTSIA — Consignes pour les agents (Claude Code, Codex)

> Moteur social national (backend Convex + paquets `@antsia/*`) et réseau public ANTSIA.
> Avant tout travail, lire dans l'ordre :
> 1. `docs/00_CAHIER_DES_CHARGES_ANTSIA.md` (le moteur et le réseau public : invariants, tables, lots) ;
> 2. `docs/01_PLAN_IMPLEMENTATION_PROMPTS_ANTSIA.md` (le prompt à exécuter, un à la fois, avec son
>    préambule commun ; l'encart « État » dit où l'on en est) ;
> 3. `../../../Documentation/RESEAUX_SOCIAUX/00_PLAN_RESEAUX_DANS_LE_RESEAU_DIASPORALE_ANTSIA_2026-10-14.md`
>    et ses annexes A (backend du socle) et B (front du socle), qui sont la carte de duplication ;
> 4. `../DIASPORALE/docs/00_CAHIER_DES_CHARGES_DIASPORALE.md` (le premier réseau servi) ;
> 5. `docs/adr/` (décisions du moteur).

## Ce qu'est ce dépôt

- **Le moteur social national** (backend Convex `antsia` + paquets) et **le réseau public
  ANTSIA** (`apps/antsia_ga`, port 3030) et sa **console** (`apps/admin_antsia_ga`, port 3032).
  DIASPORALE (`../DIASPORALE`) est une application externe de ce moteur ; sa tranche backend
  `convex/modules/diaspora/` vit ici.
- Le code vient du **socle administration.ga sur `origin/main`** (jamais de l'arbre de
  travail partagé, en retard), dupliqué selon les dix règles de PRO.GA (`PRO_GA/docs/11` §2) :
  copier d'abord, en-tête de provenance `// Dupliqué de <chemin> @ <commit> — adaptations : …`,
  périmètre d'adaptation fermé, aucun import inter-produit, tests portés et exécutés, fusion
  sans écrasement, jetons sans fork, tranches verticales, gardes testées, parité prouvée.
  Source lue au 14/10 : `origin/main` = `ad2e7fdc2` (copie propre par `git worktree add`).

## Invariants (ne jamais contourner)

- `networkId` sur toute table et toute fonction sociale ; `requireMembership(networkId,
  minStatus)` en tête de toute fonction (cliquet `network-scoped-functions`) ; refus indistinct.
- Une personne, un handle ; adhésion dérivée vers la racine ; suspension racine = partout.
- Visibilité `network` par défaut ; `root` seulement si audience publique et geste explicite
  (ou règle de page) ; le retrait se propage.
- Badges (Officiel · Vérifié · Agent public · Communauté) **calculés** côté serveur, jamais
  stockés comme vérité.
- Étanchéité : aucune lecture de base externe, aucun client Convex croisé, aucun import de
  `_generated` ou de schéma du socle ou de gabon-diplomatie ; reflets et attestations par
  contrats signés et idempotents (`convex/modules/federation`).
- Aucun profil ni adhésion créé d'office depuis une base externe (leçon des ADR-0080/0082).
- Toute écriture bornée : adhésion → éligibilité → limitation de débit → droit ; garde de
  délivrance des fichiers fail-closed partout.
- Effacement effectif de toutes les tables sociales et des blobs ; consentements horodatés,
  révocables.

## Conventions

- Code en anglais, UI en français **via i18n** (fr, en ; mêmes clés, cliquet `i18n-locales`) ;
  TypeScript strict ; `schemaValidation: true` ; validateurs précis, jamais le validateur
  permissif ; aucun `.collect()` sans `// borné : <raison>` ; aucune couleur littérale hors de
  `packages/ui/src/{styles,themes}` ; aucune URL en dur (les routes vivent dans
  `apps/*/src/lib/routes.ts`, les origines dans l'environnement) ; React Hook Form + Zod ; sonner ;
  lucide-react ; `bun run codegen` avant tout typecheck ou test.
- Versions : une seule fois, dans le **catalogue** du `package.json` racine ; chaque paquet
  déclare ce qu'il importe avec `"catalog:"` (linker isolé : une dépendance non déclarée
  n'existe pas pour le paquet).
- Thèmes : la charte de base (`packages/ui/src/styles/charte.css`, dupliquée de la charte
  Personnel du socle) déclare TOUS les jetons ; un thème (`packages/ui/src/themes/<nom>.css`,
  `[data-charte="<nom>"]`) ne redéclare que des jetons du contrat (cliquet `theme-contract`).
- Modèle : **Opus** pour tout le code (consigne du 25/09/2026), jamais de sous-agent Sonnet.
- Livraison : commits en français ; restent au propriétaire : création de dépôts, projets
  Convex, hébergement, secrets, domaines, et **toute publication du socle en production** (PA9).
  Aucune commande vers un déploiement de production sans décision explicite ; jamais de
  `--rapide` sans demande. Les agents n'éditent **aucun fichier `.env*`** (sauf `.env.example`).
- Dépôts voisins : `../../ADMINISTRATION_GA` (source de duplication, lecture seule, sauf PA9
  par PR) ; `../../SERVICES_TRANSVERSES/identite.ga` (clients OIDC par le portail).

## Arbre partagé avec la session DIASPORALE

- La session ANTSIA est propriétaire de tout le dépôt, SAUF `convex/modules/diaspora/`,
  `packages/ui/src/themes/diasporale.css` et `packages/social-contracts/src/i18n/locales/*/diaspora.json`
  (écrits par la session DIASPORALE).
- Fichiers partagés (`package.json`, `bun.lock`, `convex/schema.ts`, `convex/convex.config.ts`,
  `deploy/catalog.json`) : modifiés par la session ANTSIA seule, sur demande par message.
- Jamais `git add -A` : `git add -- <chemins>` puis `git commit -- <chemins>`. Aucun changement de
  branche dans ANTSIA tant que les deux sessions y écrivent (`main` pendant PA0 → PA3 ; à partir
  de PA4, branches dédiées + PR si une seule session écrit encore).

## Commandes

```bash
bun install                # une seule installation, ici
bun run dev:convex         # déploiement Convex de développement (local anonyme tant que le projet `antsia` n'existe pas)
bun run dev:antsia          # http://localhost:3030
bun run dev:admin          # http://localhost:3032
bun run verify             # obligatoire avant tout commit
```

`verify` = codegen + `typecheck:convex` (tsgo) + `typecheck:tests` + `test` (convex-test,
cliquets, scripts) + typage, tests et lint de chaque espace de travail
(`scripts/workspace-run.mjs`).

Cliquets en place (`tests/ratchets/`) : `no-cross-product-imports`, `no-any-validators`,
`no-unbounded-collect`, `no-hardcoded-colors`, `no-hardcoded-strings`, `no-hardcoded-urls`,
`network-scoped-functions` (liste des modules sociaux à étendre à chaque module),
`public-communication`, `i18n-locales`, `theme-contract`, `provenance-headers`,
`deploy-catalog`, et pour la garde des fichiers (PA3) `file-delivery-gate`, `upload-policy`,
`fresh-upload`, `storage-arg-freshness`, et pour la cloche `notifications-writer` (seule
`convex/modules/notifications/notify.ts` écrit dans `notifications`), et pour le journal des décisions
`operator-audit` (toute `operatorMutation` appelle `appendAudit`), `crons-contract`
(dix cadences/arguments PA3 protégés ; registre, identifiants ASCII uniques et cibles
internes contrôlés également pour les extensions PA5), `sign-out-everywhere` (PA4 : sorties SDK uniquement par la porte partagée, purge
nominale et navigation complète), `rate-limited-writes` (PA5 : admission de débit des
écritures publiques vérifiée par AST), `notification-payload-content` (PA5 : aucune copie
de contenu social ni contact dans les jobs et transports), `member-screens-full-width` (22/10 :
aucun écran de membre ne se borne puis se centre ; colonnes responsives de
`components/shared/screen-layout.ts`, exceptions nommées). La couverture de l'inventaire
d'effacement dérivé du schéma est vérifiée par `convex/modules/people/erasure.test.ts`.

## Pièges déjà payés

- **PA10 / état de livraison (18/10/2026)** : sources du fil matérialisé et de
  l'observabilité raccordées, **sans codegen, tests, typages, lint, build ni recette**
  à la demande du propriétaire. Aucun commit/publication. Passation :
  `docs/06_RAPPORT_LANCEMENT.md` ; exploitation/charge/restauration : `docs/20`.
  Ne jamais présenter les preuves historiques PA3–PA8 comme une validation PA9/PA10.
- **PA10 / fil** : seules des références vivent dans `feedEntries`, par réseau de
  lecture/lecteur/portée. Rattrapage et fan-out par étapes CAS, fenêtre30j ; le
  curseur matérialisé porte les dates du POST, la stratégie, génération et fenêtre.
  Une génération partielle ne bascule pas ; les paires et gardes se relisent
  toujours. Les groupes et portées récentes gardent leur lecture propre.
- **PA10 / données et exploitation** : les tables du fil s'effacent par index
  lecteur/post et parents suivis par `dataErasureTargets` ; aucun export du contenu
  étranger par une référence. Le passage orphelin supprime uniquement un blob
  sans admission ni réservation depuis plus de24h, après protection des stages
  historiques (`orphans.run`, pas de purge directe). La santé technique observe un stock borné de
  jobs ; elle ne couvre pas les erreurs synchrones. PostHog reste consenti/UE,
  identité mémoire seulement, donc aucune rétention multivisite annoncée.

- **PA5 / export et effacement** : une référence personnelle ou une mention ne donne pas
  la propriété du document. L'export passe par `exportableRecord` et ses projections,
  jamais par une ligne étrangère brute. Les vérifications Better Auth sont parcourues
  avant révocation des sessions ; `deleteOne(user)` ne supprime pas ses dépendances.
  Les copies transférées et aperçus de fils sont expurgés avec leur source ; les citations
  restantes utilisent le profil anonyme `erasedAt` / `isDeleted`, sans nom stocké.
- **PA5 / preuves externes** : `sent` est une admission technique, pas une réception sur
  appareil. L'inbox signée possède un registre métier fermé : un 202 `dead_letter` ne
  prouve aucun reflet appliqué. Configuration et recette réelles restent distinctes.
- **PA4 / sessions** : `sessionId` du JWT doit désigner une session Better Auth vivante du même sujet ; aucune exception de développement. Les tests construisent de vraies sessions (`testConvex`/`createTestSession`), les contextes de garde passent par `as.run`.
- **Better Auth / envoi OTP** : `emailAndPassword.enabled=false` ne ferme pas les routes de réinitialisation des plugins OTP. Les bloquer explicitement. Le SDK masque les erreurs de délivrance e-mail ; le retour middleware est fusionné dans l’endpoint, donc la preuve d’envoi partagée doit être sous `{ context: { context: … } }` pour son hook après. Cas réel de transport défaillant testé.
- **Déconnexion / SSO** : un transfert ne démarre ni ne termine pendant `signOutEverywhere`. Passer la navigation dans son callback : le registre `Symbol.for` est commun aux copies du bundle et reste verrouillé jusqu’au nouveau document. La garde attend la purge/navigation avant reload ; aucune synchronisation de personne pendant la sortie. Un transfert refusé monte Convex anonyme, sans réadoption du cookie HTTP ; un transfert admis impose bearer explicite et sujet corrélé.

- **Fichiers à plusieurs points sous `convex/`** (`*.test.ts`, `test.setup.ts`,
  `vitest.config.ts`) : ignorés par le bundler de Convex (vérifié dans le CLI 1.45). Un fichier à
  UN point y est déployé : jamais d'`import.meta.glob` ni d'import de `vitest` dedans.
- **Glob de convex-test** : la négation extglob `!(…)` ne correspond à RIEN avec le glob de Vite
  (zéro module, harnais muet). Forme tableau avec exclusions `"!…"` ; le test du harnais vérifie
  que le glob n'est jamais vide.
- **`@next/env` garde un cache partagé avec Next** : `loadEnvConfig` sur un second dossier rend
  l'environnement du premier. La config Next commune lit `ANTSIA/.env.local` par un lecteur
  minimal (`readEnvFile`), testé.
- Une modification de `packages/api/next-config.mjs` ne redémarre PAS `next dev` (seul
  `next.config.ts` est surveillé) : relancer le serveur.
- **Disque plein** : le 14/10, le disque du Mac n'avait plus que 118 Mo libres pendant le premier
  `convex dev` (binaire du backend local : ~164 Mo). Vérifier `df -h /System/Volumes/Data` avant
  une installation ou un build.
- **Actions « use node » et backend local** : le backend local refuse TOUT le déploiement dès
  qu'une action `"use node"` existe et que son Node n'est pas en 20, 22 ou 24 (le Mac a Node 25 :
  `DeploymentNotConfiguredForNodeActions`). Il prend le Node du PATH de la commande qui le démarre :
  `convex dev`, ou `convex codegen`, qui en démarre un éphémère quand aucun `convex dev` ne tourne
  (d'où l'échec de `verify` sous Node 25 au lot 15). `dev:convex` et `codegen` (donc `verify`)
  passent par `scripts/convex-dev.mjs [sous-commande]` (`dev` par défaut), qui met un Node supporté
  en tête du PATH (Homebrew `node@22` présent) : aucun préfixe de PATH à ajouter à la main. Toute
  autre sous-commande qui peut démarrer le backend local : `node scripts/convex-dev.mjs <sous-commande> …`.
  Relancer `convex dev` après tout changement de ce lanceur.
- **Identifiants de cron** : ASCII seulement (`crons.daily("purge des fichiers infectés", …)` fait
  échouer le déploiement entier à cause du `é`).
- **`codegen` et `convex dev` en même temps** : `convex codegen` pousse aussi vers le backend local ;
  lancé pendant un déploiement de `convex dev`, il rend `409 ExistingModuleHashConflict`. Attendre
  « Convex functions ready » puis relancer.
- **Tailwind 4 et les paquets** : `@source "…/packages/*/src"` (étoile à la place d'un dossier) ne fait
  balayer AUCUN fichier — mesuré au lot F1 (aucune classe des paquets dans la feuille). Chemins EXPLICITES par
  paquet dans le `globals.css` de chaque application. Et dans un commentaire CSS, `*/` (« packages/*/src »)
  ferme le commentaire : la feuille entière casse.
- **Tailwind 4, `sm:` contre `min-[…px]:`** : les seuils nommés (en rem) sont émis APRÈS les seuils arbitraires
  en px. Sur une même propriété, `sm:px-6` l'emporte donc sur `min-[768px]:px-…` à toutes les largeurs (le
  `min-[1200px]:px-8` des espaces spécialisés n'a jamais pris effet, constaté le 22/10). Borner la variante
  nommée (`sm:max-[768px]:`) ou rester en px.
- **Frontière serveur/client de Next** : une page serveur n'appelle aucune fonction exportée d'un module
  `"use client"` (« Attempted to call … from the server ») ; un analyseur d'adresse vit dans un module pur
  (`apps/antsia_ga/src/lib/messages-route.ts`).
- **Projections publiques en schéma strict** : antsia.ga lit chaque DTO public avec un schéma Zod `.strict()`
  (`apps/antsia_ga/src/lib/public-data.ts`). Ajouter un champ à une projection publique existante casse donc les
  fronts déjà en ligne dès le déploiement du backend : publier une projection À PART (SU01d : `transparencyDeadlines`
  à côté de `transparency`), que le nouveau front lit et dont l'absence ne casse pas la page.
- **Borne des auteurs distincts par lot** (transparence) : elle se calcule lot par lot, sans identité transmise entre
  lots. Un parcours statut par statut la sous-estime (six auteurs répartis sur trois statuts donnent 3). Parcourir un
  index sans le statut (`reports.by_network_dueAt`, `by_network_createdAt`).
- **Coque des pages de membre** : montée UNE fois dans le gabarit `(membre)` d'antsia.ga ; remontée à chaque
  page, elle coupait un appel en cours et faisait déborder le seau de présence (8 par minute).
- **Tests du moteur** : toujours avec `--config convex/vitest.config.ts` (depuis la racine :
  `bunx vitest run --config convex/vitest.config.ts modules/<module>`) — sans elle, `ANTSIA_SEEDS_ALLOWED` manque et
  tout test qui pose la graine des fondations échoue (« Graine refusée »).
- **Récolte des directs** (`live/reap.ts`) : par tranches de CINQ sessions chaînées par curseur — le pire cas d'une
  session lit ≈ 2,3 Mo ; une tranche plus large dépasserait la limite de lecture d'une mutation (16 Mio).
- **Kit d'espace sans i18n** (`@antsia/ui/espace-kit`) : `EspacePagination` exige ses phrases (`labels`) et
  `EspaceDialog` son `closeLabel` — dans le moteur, `useEspacePaginationLabels()` (`shell/`) les traduit une fois.
- **Page réseau de bureau** (`ReseauAgentPage`) : ses colonnes défilent chacune, elle exige un conteneur de
  hauteur DÉFINIE ; au téléphone (≤ 959 px), sa coquille laisse défiler le document — pas de hauteur figée.
- **Pages en développement local** : créer une page exige une adhésion `verifiee` ; le compte de
  développement n'a qu'une adhésion déclarée (refus traduit attendu).
- **Personnes de démonstration** (développement local) : `node scripts/convex-dev.mjs run
  seeds/devSocial:demoPerson '{"confirmNonProduction":"ANTSIA_SEEDS_HORS_PRODUCTION","networkSlug":"antsia",
  "handle":"awa.demo","displayName":"Awa","connectToHandle":"<votre identifiant>"}'` — personne publiée,
  membre, reliée, sans session : de quoi éprouver iCom sans second compte.
- **Garde des fichiers** : tout `ctx.storage.getUrl` passe par `convex/modules/files/storageGuard.ts`
  (`servableUrl`), tout `generateUploadUrl` par `guardUploadUrl`, tout rattachement par
  `assertFreshUpload` puis `admitStoredUpload` (ou `admitPosedUploads`) — quatre cliquets.

## Mémoire

Vault Obsidian : `10-PROJETS/antsia/` (fiche, contexte actif, décisions) ; ADR du dépôt dans
`docs/adr/`. Mettre à jour en fin de travail (`/memoire-maj`).
