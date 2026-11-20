---
title: "ANTSIA — Plan d'implémentation en prompts : le moteur social national, puis le réseau public"
version: "1.0"
date: "2026-10-14"
statut: "Plan d'exécution — prompts Claude Code (Opus) ; PA0 → PA7 sont le préalable de DIASPORA.GA"
projet: "ANTSIA"
reference: "NTSAGUI/ANTSIA/PI/2026/001"
dependances:
  - "ECOSYSTEMES/ANTSIA/docs/00_CAHIER_DES_CHARGES_ANTSIA.md (exigences EXF-AN / EXT-AN)"
  - "ECOSYSTEMES/DIASPORA_GA/docs/01_PLAN_IMPLEMENTATION_PROMPTS_DIASPORA_GA.md (s'exécute entre PA7 et PA8)"
  - "Documentation/RESEAUX_SOCIAUX/00_PLAN_RESEAUX_DANS_LE_RESEAU_DIASPORALE_ANTSIA_2026-10-14.md"
  - "PRO_GA/docs/11_PLAN_IMPLEMENTATION_PROMPTS_PRO_GA.md (le protocole de duplication, éprouvé)"
---

# ANTSIA — Plan d'implémentation en prompts

---

> ## État d'exécution (tenu à jour à chaque prompt)
>
> Ce document reste **l'énoncé du plan** tel qu'il a été écrit le 14/10/2026. Ce qui a été
> exécuté, et ce que l'exécution a corrigé, se lit ici et dans le rapport de chaque prompt.
>
> | Prompt | Clos le | Commit(s) |
> |---|---|---|
> | PA0 — scaffold du monorepo | 2026-10-14 | `9367243` |
> | PA1 — owner map | 2026-10-14 | `9a8fbb3` |
> | PA2 — fondations multi-réseaux | 2026-10-14 | `f1851fd` |
> | ↳ tranche verticale testable (priorité du propriétaire : entrer, identifiant, publier, fil, réagir) | 2026-10-15 | `5021401` |
> | ↳ câblage de DIASPORA.GA (sa demande PD0 : espaces de travail, catalogue, port 3031) | 2026-10-15 | `5535a63` |
> | PA3 — duplication du backend | 2026-10-16 : lots 2 → 17 achevés ; noyau social, appels et direct, crons bornés et chaînés, cliquets du §8 renforcés ; parité et preuves dans `docs/03` ; `verify` complet vert (1 124 backend, 102 cliquets) | commits des lots dans `docs/03` ; lot 17 `feat(maintenance)` |
> | PA4 — identité | 2026-10-16 : portes IDN/e-mail/SMS, preuves serveur, liens, préférences, passage et déconnexion partout implémentés ; recette et vérification dans `docs/05`. Critère IDN sandbox **ouvert** : clients non créés/configurés (confirmation du propriétaire). | noyau `8589702`, raccord DIASPORA.GA `91029ac`, surfaces `feat(identity)` sur `codex/pa4-identite-session` |
> | PA5 — modération, débit, données, notifications, fédération | 2026-10-16 : implémentation locale achevée ; R7/R9/R10 et verify code 0 (6 223 tests), droits/recours hors coque membre, transports et inbox fermés sans configuration ; preuves et limites dans `docs/07`, ADR-0009. Recettes fournisseurs/appareils et navigateur restent ouvertes. | `639d987` sur `codex/pa4-identite-session` (commit local) |
> | PA6 — frontend `social-features` | sept tranches montées et consolidation locale vérifiée : préférences langue/fuseau/apparence, cache Convex/TanStack cohérent, écritures de messagerie par source, états honnêtes du fil et mesure facultative consentie ; verify code0,6 506 tests ; entrée/réglages/fil HEAD200 après nettoyage Bun autorisé et reprise3030/3210 sous Node22, puis nouvel ENOSPC et services de cette session suspendus ; disponibilité durable bloquée par le disque ; recette Chrome320/375/1280, sombre/AA et médias LiveKit/Egress réels restent ouverts ; preuves dans `docs/04` | F1/F2/F3a/F3b/F3c, `263d7df`, `aebd48b` |
> | PA7 — console | neuf surfaces raccordées ; IDN forte et rôle vivant, journal préalable, archivage à deux personnes, équipes/recours/fédération/Officiel/incidents/santé/export ; verify code0,6 786 tests,10 espaces typés/9 lint0erreur ; console78tests/lint0warning ; trois routes3032 HEAD200, backend3210 prêt ; recette IDN réelle et Chrome/AA ouvertes, clients sandbox non configurés ; rapport `docs/11`, ADR-0011 ; correctif civil DIASPORA.GA coordonné inclus dans la preuve de l’arbre partagé | `e47df16` |
> | PA8 — antsia.ga public | 2026-10-17 : réseau public SSR, projections fermées, geste/retrait publics volontaires, National/province/tag, modération/recours réseau et transparence ; verify code0,7018tests,10typages/9lints0erreur ; recette API/HTML3030 confirme natif/DIASnetwork fermés, rootavecorigine et retrait404/noindex, session/OTT failclosed ; reprise après ENOSPC avec seuls caches déjà autorisés ; IDN réel/Chrome/AA/juriste/A5 ouverts ; rapport docs/13, ADR-0012, aucun push ni publication | commit local PA8 sur codex/pa4-identite-session |
> | PA9 — fédération de l'administration | 2026-10-18 : PA9A/PA9B/PA9C/PA9D implémentés dans les sources — pages et publications sans personne technique, révisions/retraits, médias sous garde, agents sous accord local versionné et nonce renouvelable, rattachement IDN existant, retrait, export/effacement et carte Mes données. Scénarios écrits sans exécution à la demande du propriétaire. PA9D ajoute le producteur/outbox du socle, les gestes publics, le transfert privé de consentement et les retraits. PA9 reste ouvert : configuration, PR du socle et recette croisée ; rapports `docs/15` à `docs/18`, contrat `RESEAU-PUBLIC-V1`. | non commis ; vérifications différées |
> | PA10 — échelle et lancement | 2026-10-18 : sources du fil matérialisé, distribution/rattrapage/retraits, seuil et fenêtre30j, purge orphelins24h, droits de données indexés, santé technique et mesure consentie UE complétées. Outils inertes d'exploitation des preuves et assertion de restauration locale ; rapport `docs/06`, procédures `docs/20`, ADR-0020 proposé. Charge R8, restauration, audits, codegen/tests/typages/lint/build et recettes **non exécutés** à la demande du propriétaire ; critères de lancement ouverts. | non commis ; aucune publication |
>
> **Demandes de DIASPORA.GA reçues pour PA4** (15/10) : remonter une vérification arrivée APRÈS l'entrée
> (attestation) jusqu'à l'adhésion racine dérivée, qui reste « déclarée » ; une aide serveur qui rende
> l'empreinte SHA-256 de l'adresse VÉRIFIÉE d'une personne (normalisée : espaces retirés, minuscules), jamais
> l'adresse elle-même (attestation d'un compte léger, sujet `emailHash`).
>
> **Préalables externes manquants au 14/10/2026** (aucun ne bloque le code, tous bloquent une
> mise en ligne) : projet Convex `antsia` (le développement tourne sur un déploiement Convex
> **local anonyme**, sans compte ni nuage) ; clients OIDC IDN `antsia` et `diaspora-ga` en sandbox ;
> hébergement (A5) ; clés Resend, SMS, LiveKit, VAPID ; dossier APDPVP et analyse d'impact ;
> décisions A1–A10 (les recommandations du cahier sont appliquées **par défaut**, cahier §20).
>
> **Écarts au plan assumés à l'exécution de PA0** :
> - turbo est remplacé par le lanceur `scripts/workspace-run.mjs` dupliqué du socle (ADR-0165 du
>   socle) : turbo refuse tout le graphe dès qu'un espace de travail sort de la racine, ce que
>   seront les applications de DIASPORA.GA ; `turbo.json` n'est donc pas posé ;
> - `convex/auth.config.ts` déclare Better Auth comme émetteur UNIQUE ; IDN y entre par Better
>   Auth (PA4), configuré par variables — un second émetteur donnerait deux identités pour une
>   même personne (ADR-0002) ;
> - le domaine pur et les paquets testent avec vitest (tests portés du socle sans réécriture de
>   leurs imports) ; `bun test` sert aux scripts ;
> - licence AGPL-3.0 héritée du socle (le code dupliqué l'impose dans un dépôt public), à
>   confirmer par le propriétaire.
>
> **Ce que PA1 corrige du plan** (détail : `docs/02_OWNER_MAP_DUPLICATION.md` §1 et §9 ; socle lu :
> `origin/main` = `ad2e7fdc2`, inchangé au 14/10 au soir) :
> - la table du §3 ci-dessous est **remplacée par le document 02** là où elle diffère : domaine pur réduit
>   à cinq modules (`validators`, `counters`, `contentRemoval` restent côté backend) ; `reseau/connections`
>   et `reseauAlbums` ne sont pas « tel quel » (à réécrire, à adapter) ; la garde des fichiers du socle est
>   fail-open et doit être inversée ;
> - la liste fermée des corrections de dette de PA3 s'allonge des dettes qui touchent un invariant (D05,
>   D06, D12 à D17 du document 02 : délivrance, refus indistinct, blocage, débit, adhésion, isolation) ;
> - décisions par défaut : pages génériques réécrites (backend en PA3, écrans en PA6/PA8, non copiés) ;
>   iCal différé ; format téléphone unique 440×956 ; branches « poste » élaguées à la copie ; une seule
>   table de notifications sociales ; iRéunion, Standard, iAsted, centre d'appels, priorité et routage de
>   poste exclus.
>
> **Écarts assumés à l'exécution de PA2** :
> - le domaine du socle est **scindé** en modules (`content`, `richText`, `thematicGroups`, `events`,
>   `stories`, `groupThreads`) ; `visibility.ts` ajoute la garde du réseau avant la règle d'audience ;
> - les violations de règle portent un **code et des bornes**, plus de phrase : le texte vit dans l'espace de
>   noms i18n `rules` de `social-contracts` (fr, en), et le serveur les rend en `invalidArgument` ;
> - stories : une seule borne vidéo, la plus stricte du socle (50 Mo, 5 minutes) ; les surfaces
>   `reseau`/`icom` disparaissent ;
> - `validators`, `counters`, `contentRemoval` du socle restent côté backend (PA3), `searchText` et
>   `connectionState` reçoivent les tests qu'ils n'avaient pas au socle.

---

## 0. Objet et mode d'emploi

Ce plan construit **le moteur social national** (PA0 → PA7), puis **le réseau public ANTSIA**
(PA8), **la fédération de l'administration** (PA9) et **l'échelle** (PA10). Chaque prompt se
colle **tel quel, un à la fois**, dans Claude Code ouvert à la racine
`Digital GABON/DIGITAL_GOUV/`, précédé du **préambule commun** (§2). Chaque prompt se termine
par un état **vert** (typecheck, tests, lint du périmètre), un commit et un rapport de fin.
L'ordre est obligatoire ; **DIASPORA.GA PD0 → PD6 s'exécute après PA7 et avant PA8** (le
premier réseau réel du moteur est la diaspora).

Règles d'exécution héritées du programme :

- **Modèle** : Opus, jamais Sonnet, pour tout le code (consigne du 25/09/2026).
- **Livraison** : une fois vérifié, le travail est poussé, proposé en PR et fusionné sans
  redemander l'accord (décision du 23/09/2026) ; **sauf** la création de dépôts, de projets
  Convex, d'hébergement, de secrets, de domaines et toute publication en production du
  **socle**, qui restent au propriétaire ou à une décision explicite.
- **Jamais** : secret dans le dépôt ; donnée réelle du socle ou de consulat.ga ; lecture de
  base à base ; `--rapide` sans demande ; force-push ; commande qui écrit sur un déploiement de
  production.
- **Dépôts touchés** : `ECOSYSTEMES/ANTSIA` (tout le moteur) ; `ADMINISTRATION_GA` (PA9
  seulement, par PR : outbox, drapeau, opt-in, ADR) ; `SERVICES_TRANSVERSES/identite.ga`
  (clients OIDC, par le portail développeur).
- **Source de duplication** : le socle **sur `origin/main`**, jamais l'arbre de travail
  partagé (il est en retard et modifié). Travailler depuis une copie propre (`git worktree
  add` sur `origin/main`, installation fraîche) pour lire ; écrire dans `ECOSYSTEMES/ANTSIA`.

## 1. Préalables vérifiables (avant PA0)

- [ ] Décisions A1 à A10 du cahier `docs/00` §20 rendues (au moins A1, A2, A3, A5, A6).
- [ ] Dépôt cible `administration-ga/antsia` créé (vide) par le propriétaire ; `ECOSYSTEMES/ANTSIA`
      initialisé dessus.
- [ ] Projet Convex `antsia` créé par le propriétaire (déploiement dev ; prod plus tard) ;
      équipe et budget décidés ; variables d'environnement posées par lui.
- [ ] Clients OIDC `antsia` (et `diaspora-ga`) créés au portail développeur d'identite.ga en
      sandbox.
- [ ] Dossier APDPVP et analyse d'impact lancés.
- [ ] LiveKit du programme accessible en dev (clés posées par le propriétaire) ; Resend et
      fournisseur SMS en mode test.

## 2. Préambule commun (à coller en tête de chaque prompt)

```text
[PRÉAMBULE COMMUN — ANTSIA]
Tu travailles dans « Digital GABON/DIGITAL_GOUV/ ». Lis d'abord ECOSYSTEMES/ANTSIA/docs/00_CAHIER_DES_CHARGES_ANTSIA.md,
ECOSYSTEMES/ANTSIA/CLAUDE.md et, pour la duplication, Documentation/RESEAUX_SOCIAUX/annexes/A_*.md et B_*.md.
Le moteur social national vit dans ECOSYSTEMES/ANTSIA : backend Convex `antsia`, paquets social-domain,
social-contracts, social-features, ui, api ; applications antsia_ga et admin_antsia_ga ; DIASPORA.GA en est
une application (espace de travail externe). Règles non négociables :
- dix règles de duplication (copier d'abord depuis le socle sur origin/main, en-tête de provenance
  « // Dupliqué de <chemin> @ <commit> — adaptations : … », périmètre d'adaptation fermé, aucun import
  de _generated/schéma/table du socle ou de gabon-diplomatie, tests portés et exécutés, fusion sans
  écrasement, jetons sans fork, tranches verticales, gardes testées, parité prouvée) ;
- invariants du moteur : networkId sur toute table sociale et toute fonction (cliquet), une personne
  un handle, adhésion dérivée vers la racine, visibilité network/root, badges calculés côté serveur,
  étanchéité (contrats signés seulement), adhésion explicite, refus indistinct, toute écriture bornée
  (adhésion → éligibilité → limitation de débit → droit) ;
- code en anglais, UI en français via i18n (fr, en), TypeScript strict, validateurs précis (jamais v.any()),
  schemaValidation: true, aucune couleur littérale, aucune URL codée en dur, React Hook Form + Zod, sonner,
  lucide-react ; aucun .collect() non borné ;
- aucune commande qui écrit sur un déploiement de production ; aucune donnée réelle ; aucun secret ;
- branche dédiée, commits en français, PR, fusion après vérification ; création de dépôts, projets,
  secrets et toute publication du socle réservées au propriétaire ;
- fin de prompt : typecheck 0, tests et lint verts sur le périmètre ; rapport de fin (vérifié / non vérifié /
  reste). Si un préalable manque, arrête-toi et dis-le.
```

## 3. Table de correspondance source → cible (duplication)

| Source (socle `origin/main`) | Cible (moteur) | Sort | Prompt |
|---|---|---|---|
| `socle/convex/modules/reseauPersonnel/{domain,validators,searchText,feedScale,handleSuggestion,counters,connectionState,contentRemoval}.ts` | `packages/social-domain/src/*` | tel quel | PA2 |
| `reseauPersonnel/{tables,posts,postWrite,access,graph,people,engagement,follows,marks,notifications,stories,suggestions,moderation,media}.ts` | `convex/modules/{people,posts,engagement,graph,marks,notifications,stories,suggestions,moderation,media}` | à adapter (+ `networkId`, éligibilité, facettes) | PA3 |
| `reseauPersonnel/{groupes,groupesThematiques,evenements}.ts` | `convex/modules/{groups,thematicGroups,events}` | à adapter (scope poste retiré, admissibilité = adhésion) | PA3 |
| `reseau/connections.ts` | `convex/modules/graph/connections.ts` | tel quel + découvrabilité | PA3 |
| `reseauPages/*` | `convex/modules/pages` | à adapter (identité propre, autorité générique, claims) | PA3 |
| `reseauAlbums/*` | `convex/modules/albums` | tel quel | PA3 |
| `functions/chats.ts` (scope personnel), `modules/messagerieScope` (patron `openOrContinueThread`), `reseauPersonnel/messagerie.ts` | `convex/modules/messaging` | à réécrire sur le patron (fil personnel seul) | PA3 |
| `modules/iappel` (appels personnels, présence des relations, préférences, messagerie vocale), `functions/meetings.ts` (join/leave/end, jeton), `actions/livekit.ts`, `lib/livekit*.ts` | `convex/modules/calls` | à simplifier ; verrous « agent » levés | PA3 |
| `modules/direct/*`, `actions/livekitDirect.ts` | `convex/modules/live` | à adapter | PA3 |
| `modules/fileGuard/*`, `lib/uploadPolicy.ts` | `convex/modules/files` | à adapter ; garde partout | PA3 |
| `lib/notify.ts`, `actions/push.ts`, `schemas/pushSubscriptions.ts`, `crons/notificationsRetention.ts` | `convex/modules/notifications` | à adapter ; push social ; rétention active | PA5 |
| `modules/icom/{notifyFanout,autoEnroll}.ts` | patrons de diffusion par lots dans `notifications` et `groups` | patrons | PA3, PA5 |
| `modules/reseau/federationTables.ts`, `federation.ts` (inbox, lettres mortes, rejeu) | `convex/modules/federation` | patron | PA5, PA9 |
| `socle/packages/agent-features/src/features/{reseau-personnel,reseau-albums,stories,notifications,messagerie,iappel,direct}` | `packages/social-features/src/features/*` | 49 % tel quel, 42 % à adapter, 9 % retiré | PA6 |
| `socle/packages/{ui-v2 (tokens, fonts, charpente élagués), ui (bloc espace-personnel, mobile.css), api (hooks), routing, livekit, chat}` | `packages/{ui,api}` | à élaguer, consommés par copie versionnée | PA6 |
| `AF/components/{espace-kit,floating-surface,EspaceFloatingCard,ImmersiveOverlay}`, `shell/global-call-surface-host`, `direct-session-host`, providers de l'app espace | coque légère `packages/social-features/src/shell` | reprenables ; AppShell réécrit | PA6 |
| Spécifications : annexes A et B, cahier ANTSIA, cahier DIASPORA.GA | — | — | tous |

## 4. Les prompts

---

### PROMPT PA0 — Décisions, dépôt et scaffold du monorepo (lot A0 → A1)

**Objectif.** Un monorepo `ANTSIA` qui compile, avec son backend Convex vide, ses deux
applications squelettes, ses paquets vides, ses scripts de vérification et ses règles.

**Contexte.** Modèles : `ECOSYSTEMES/PRO_GA` (monorepo autonome : `apps/`, `packages/`,
`convex/`, `verify`, seeds gardés) et `CONTRATS/gabarit-application` (Next 16, `auth.config.ts`
IDN, Dockerfile autoportant, `bunfig.toml` à linker isolé, `verifier-autonomie`). Pièges
connus : quatre câblages invisibles en local (workspace absent, `ARG` manquants, IAM, domain
mapping).

> Vérifie les préalables du §1 ; si l'un manque, arrête-toi et liste.
> 1. Dans `ECOSYSTEMES/ANTSIA/` (déjà ouvert : README, CLAUDE.md, docs/) : `package.json`
>    racine `antsia-platform` (bun, workspaces `apps/*`, `packages/*`, et déjà
>    `../DIASPORA_GA/apps/*`, `../DIASPORA_GA/packages/*` en commentaire documenté, activés par
>    DIASPORA.GA PD0), `turbo.json`, `convex/` (`schema.ts` vide avec `schemaValidation: true`,
>    `convex.config.ts` avec better-auth, rate-limiter, migrations, aggregate, resend ;
>    `auth.config.ts` IDN par variables), `apps/antsia_ga` (Next 16, port 3030, `/` et
>    `/sante-fonctionnelle`), `apps/admin_antsia_ga` (port 3032), `packages/{social-domain,
>    social-contracts, social-features, ui, api, tsconfig, eslint-config}` vides mais câblés.
> 2. Scripts : `codegen`, `typecheck:convex` (tsgo), `test` (vitest convex-test), `test:domain`,
>    `typecheck`, `lint`, `verify` (= codegen + typecheck:convex + test + turbo typecheck test
>    lint), `dev:convex`, `dev:antsia`, `dev:admin`, `deploy:*` (catalogue : service, Dockerfile
>    en contexte `ECOSYSTEMES`, `site_url`, `ARG NEXT_PUBLIC_*`).
> 3. Cliquets de départ (tests qui relisent le code) : `no-cross-product-imports`
>    (aucun `_generated`, `@workspace/*` du socle, `gabon-diplomatie`), `no-any-validators`,
>    `no-unbounded-collect`, `no-hardcoded-colors`, `no-hardcoded-strings` (i18n),
>    `network-scoped-functions` (vide pour l'instant, activé en PA2), `public-communication`
>    (aucun pourcentage, audit, hébergement affirmé dans les pages publiques).
> 4. `docs/adr/` avec `_template.md` (gabarit du socle) et les ADR 0001 (un moteur, trois
>    réseaux, deux dépôts), 0002 (identité : IDN unique, comptes légers, attestations, badges
>    calculés), 0003 (fédération entrante par contrats signés), 0004 (duplication : dix
>    règles) au statut « Proposé », remplis à partir des cahiers.
> 5. `.env.example` (noms seulement), `.gitignore`, `bunfig.toml`, `README` et `CLAUDE.md`
>    mis à jour avec les commandes réelles.
> Interdits : aucune table, aucun métier. Critère de sortie : `bun install` et `bun run
> verify` verts ; `bunx convex dev` démarre sur le déploiement dev fourni ; deux apps servies.

**Critères de done.** Monorepo vert, cliquets en place, ADR proposés.
**Vérification.** `bun run verify` ; `curl` des deux apps ; `git log`.
**Couvre.** EXT-AN-08, EXT-AN-09 (base), EXF-AN-41 (paquets).

---

### PROMPT PA1 — Inventaire contradictoire et owner map de duplication (lot A1)

**Objectif.** La liste exhaustive et vérifiée des fichiers à dupliquer, module par module,
avec leur sort, leurs dépendances et les points d'accroche à remplacer — sur `origin/main`.

**Contexte.** Les annexes A et B donnent l'inventaire du 14/10 ; le socle avance (PR 772 le
09/10). Méthode de PRO.GA (`docs/12` §0.2) : `wc -l` par la ligne `total`, remontée des imports
par `grep`, attribution d'un écran à son backend par `grep -rhoE "api\.[a-zA-Z0-9_.]+"`.
L'audit iAppel/LiveKit et la coque sont dans l'annexe B (versions finales).

> Lecture seule sur une copie propre du socle (`git worktree add` sur `origin/main`).
> 1. Pour chaque module cible du §3 (people, posts, engagement, graph, marks, notifications,
>    stories, suggestions, moderation, media, groups, thematicGroups, events, pages, albums,
>    messaging, calls, live, files, federation) et pour chaque tranche front
>    (reseau-personnel, reseau-albums, stories, notifications, messagerie, iappel, direct,
>    espace-kit, floating-surface, hôtes d'appel et de direct, providers), liste TOUS les
>    fichiers source et de test, leurs imports (`@convex/*`, `@workspace/*`), et les **points
>    d'accroche administration** à remplacer : `assertNotSuspended`, `isPublicUser`,
>    `validatedOrgIds`, `colleagueUserIds`, `resolvePostIdentities`, `pageId/orgId`,
>    `communication.publish`, `posteA/posteB`, `scope poste`, `orgId` des appels et de la
>    présence, `callCitizenById` et `agentAccess`, `isKeptApartStorage`, `/espace`, libellés
>    « agents / administrations », fuseau `Africa/Libreville`.
> 2. Mesure ce qui a changé depuis le 14/10 (annexes A et B) : nouveaux fichiers, ADR,
>    migrations.
> 3. Écris `ANTSIA/docs/02_OWNER_MAP_DUPLICATION.md` : par module, la table source → cible
>    fichier par fichier, le sort (tel quel / à adapter / à réécrire / patron / exclu), les
>    dépendances communes, les tests à porter, les corrections de dette à faire au passage
>    (compteurs chauds, `listComments` sans pagination, plafond 200 connexions, garde de
>    délivrance contournée, `sendGroupMessage` sans lots, `schemaValidation`), et l'ordre de
>    duplication (dépendances d'abord : people → graph → posts → engagement → …).
> Interdits : aucune modification de code. Critère de sortie : le document 02 est complet ;
> chaque module a sa liste EXHAUSTIVE ; le commit du socle lu est noté en tête.

**Critères de done.** Owner map exhaustive et datée.
**Vérification.** Chaque module du §3 a une section ; les comptes de lignes sont ceux de `wc -l`.
**Couvre.** règle 1 et 10 de la duplication ; EXF-AN-23 (verrous listés).

---

### PROMPT PA2 — Fondations multi-réseaux et domaine pur (lot A1)

**Objectif.** Avant toute duplication : `networks`, `persons`, `identityLinks`,
`networkMemberships`, `personFacets`, `consents`, `requireMembership`, badges, et le paquet
`social-domain` avec les modules purs du socle.

**Contexte.** Cahier §5 (invariants), §7 (réseaux), §11 (tables), §12 (autorisation). Les
modules purs du socle (`domain.ts`, `validators.ts`, `searchText.ts`, `feedScale.ts`,
`handleSuggestion.ts`, `counters.ts`, `connectionState.ts`, `contentRemoval.ts`) passent tels
quels avec leurs tests.

> 1. `packages/social-domain` : copie textuelle des modules purs listés (en-tête de provenance),
>    tests portés (`bun test`) ; ajoute `network.ts` (kinds, politiques, visibilités,
>    `derivedRootMembership`), `membership.ts` (statuts et transitions communes),
>    `badges.ts` (`computeBadges(links, pages)`), `visibility.ts` (prédicat étendu
>    `isVisibleTo(post, viewer, membership)` avec `network | root`). 100 % des transitions
>    testées.
> 2. `packages/social-contracts` : types et modules purs partagés front/back (médias,
>    pièces jointes, capacités, schémas de validation) — ce que le front du socle importait
>    depuis `convex/`.
> 3. `convex/modules/networks` (tables `networks`, `networkSettingsHistory` ; fonctions console
>    `create`, `update`, `archive` ; lecture publique `getBySlug`), `convex/modules/people`
>    (tables `persons`, `identityLinks`, `networkMemberships`, `personFacets`, `consents`,
>    `handleHistory` ; `ensurePerson` à la première session, `joinNetwork`, `leaveNetwork`,
>    `suspendEverywhere`, `setFacet`, `recordConsent`, `revokeConsent`), `convex/lib/access.ts`
>    (`requireMembership(ctx, networkId, minStatus)`, refus indistinct) et `convex/lib/rateLimit.ts`
>    (seaux par type d'écriture, composant rate-limiter).
> 4. Seeds gardés hors production : réseaux `antsia` (root, open) et `test-closed` (closed,
>    enfant) pour les tests.
> 5. Cliquet `network-scoped-functions` activé : toute fonction publique exportée d'un module
>    social (liste de dossiers) doit appeler `requireMembership` ou être marquée `publicProjection`
>    avec justification.
> 6. Tests convex-test : adhésion dérivée ; suspension à la racine suspend partout ; un
>    membre de `test-closed` lit `root` mais pas `network` d'un autre réseau ; refus indistinct ;
>    `schemaValidation: true` tient.
> Critère de sortie : `verify` vert ; cliquet actif ; ADR 0001 et 0002 passés « Accepté ».

**Critères de done.** Fondations testées ; domaine pur porté.
**Vérification.** `bun run verify` ; cliquet rouge si l'on retire une garde (test du test).
**Couvre.** EXF-AN-01 à 08 ; EXT-AN-02 (limitation de débit prête).

---

### PROMPT PA3 — Duplication du noyau backend avec `networkId` (lot A1)

**Objectif.** Tous les modules sociaux du socle vivent dans le moteur, bornés par réseau,
avec leurs tests, et la dette connue corrigée.

**Contexte.** `docs/02_OWNER_MAP_DUPLICATION.md` (PA1) ; annexe A §4 (points d'accroche) et
§7 (dette) ; PRO.GA `docs/14` pour la forme du rapport de parité.

> Procède **module par module**, dans l'ordre de l'owner map, un commit par module :
> 1. Copie textuelle des fichiers source et de test du socle (en-tête de provenance), dans
>    `convex/modules/<module>/` (tranche : `tables.ts`, fonctions, `manifest.ts`, tests).
> 2. Adaptations autorisées, et seulement elles : imports ; `networkId` sur chaque table
>    (index `by_network_*`) et chaque fonction (`requireMembership`) ; `assertNotSuspended` →
>    éligibilité par statut d'adhésion ; `isPublicUser` → statut ; `validatedOrgIds`,
>    `colleagueUserIds`, `resolvePostIdentities` → facettes du réseau (`personFacets`) ;
>    `pageId/orgId` → `pages` à identité propre, autorité = signataires ;
>    `communication.publish` → rôle de signataire ; messagerie : patron `openOrContinueThread`
>    au scope personnel seul, plus de `posteA/posteB` ; appels : verrous « agent » levés (un
>    membre appelle un membre ; groupe ad hoc sans organisation ; présence par personne),
>    `callCitizenById` et `agentAccess` retirés ; fichiers : `isKeptApartStorage` remplacé par
>    une politique du moteur, **garde de délivrance partout** ; libellés et erreurs via
>    `social-contracts`.
> 3. Corrections de dette (liste fermée, chacune testée) : compteurs fragmentés
>    (`postReactionShards`, agrégats), `listComments` paginé, plafond de connexions → pagination,
>    `sendGroupMessage` diffuse par lots chaînés, `albums.remove` nettoie ses éléments, purge
>    de la story retire sa ligne d'analyse, aucun `.collect()` non borné.
> 4. Tests : tous les tests du socle portés ET exécutés (vérifier la config vitest), plus un
>    test par module « hors réseau → refus indistinct ».
> 5. `docs/03_RAPPORT_PARITE_BACKEND.md` : par module, la liste de parité cochée, les
>    adaptations (liste fermée), les corrections, les écarts assumés.
> Critère de sortie : `verify` vert ; cliquets verts ; parité cochée pour les 20 modules ;
> aucun import inter-produit.

**Critères de done.** Noyau dupliqué, borné, testé, dette corrigée.
**Vérification.** Suite complète ; `grep` des points d'accroche (zéro reste) ; rapport 03.
**Couvre.** EXF-AN-10, 11, 13 (compteurs), 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 31.

---

### PROMPT PA4 — Identité : IDN, comptes légers, liens, badges, passage entre applications (lot A2)

**Objectif.** Une personne entre par IDN ou par un code à usage unique, existe une fois,
porte ses liens d'identité et ses badges, et passe d'une application à l'autre sans perdre sa
session.

**Contexte.** Better Auth via `@convex-dev/better-auth` ; SDK `@idn-ga/better-auth` (PKCE,
`/userinfo` : `loa`, `nationality`, `profile_type`) ; plugins `crossDomain`, `oneTimeToken`
(patron `@workspace/sso` du socle : jeton 3 min, `signOutEverywhere`) ; `TRUSTED_ORIGINS` par
variable ; sessions en localStorage par origine (mémoire du programme). Leçons du socle :
l'identité IDN prime sur l'e-mail ; ne jamais créer de profil d'office.

> 1. `convex/betterAuth/auth.ts` : IDN (`idn({ clientId, clientSecret })`, scopes
>    `openid profile email`), e-mail OTP (Resend), SMS OTP (fournisseur par variable), jamais
>    de mot de passe ; `trustedOrigins` = `SITE_URL` + `TRUSTED_ORIGINS` + origines du
>    catalogue ; `crossDomain`, `oneTimeToken`, `bearer` (mobile) ; `accountLinking` avec IDN
>    de confiance ; sessions 7 jours, JWT 30 min avec claim `sessionId`.
> 2. `convex/modules/people/identity.ts` : à la première session, `ensurePerson` (aucun nom
>    recopié : la personne choisit son nom affiché) ; `linkIdn` (sub, `loa`, `nationality`),
>    `linkLocal` (e-mail ou téléphone vérifié) ; badges recalculés ; `signOutEverywhere`
>    (révocation serveur puis purge locale) ; cliquet « aucune déconnexion partielle ».
> 3. `packages/api` : client Convex + TanStack, `useAuthenticatedQuery`, `usePaginated`,
>    `NetworkProvider` / `useNetwork`, `useSsoNavigate` (jeton à usage unique entre
>    `antsia.ga`, `diaspora.ga`, console), `signOutEverywhere`.
> 4. Onboarding dans `social-features` : portes (IDN en premier), handle (suggestions,
>    aucun présélectionné), nom affiché, consentements non précochés, préférences ; bannière
>    d'élévation IDN.
> 5. Tests : lien IDN idempotent ; badge Vérifié si `loa ≥ 2` ; un même `idnSub` depuis deux
>    applications = une personne ; jeton à usage unique consommé une fois ; déconnexion
>    partout.
> Critère de sortie : connexion IDN réelle en **sandbox** et par OTP e-mail en dev ; R1 et R2
> du cahier joués ; `verify` vert.

**Critères de done.** Identité fédérée ; passage entre applications ; onboarding.
**Vérification.** Recette sandbox IDN ; tests ; cliquet de déconnexion.
**Couvre.** EXF-AN-05, 06, 07, 08, 09, 45 ; EXT-AN-02.

---

### PROMPT PA5 — Modération à l'échelle, limitation de débit, données personnelles, notifications, passerelle de fédération (lot A2)

**Objectif.** Le moteur sait modérer tout type de contenu dans tout réseau, borner toute
écriture, effacer une personne pour de bon, pousser des notifications et recevoir des
reflets signés.

**Contexte.** Le socle n'a ni sanctions, ni recours, ni limitation de débit généralisée, ni
effacement des tables sociales, ni push social ; sa rétention des notifications tourne à
blanc. Patrons : `notifyFanout` (lots de 150), `federationInboxReceipts` / lettres mortes /
rejeu, `crons/notificationsRetention.ts`, `dataSubjectErasure.ts`.

> 1. `convex/modules/moderation` : `reports` polymorphes (toutes cibles du cahier),
>    `moderationTeams` et membres (réseau × périmètre), files (équipe → réseau → plateforme),
>    `decide` motivé, `sanctions` graduées avec durée, `appeals`, `blockedTerms`, détection
>    simple de spam, relecture `pending_review` configurable par réseau et par surface,
>    `moderationAudit`, rapport agrégé périodique (cron).
> 2. Limitation de débit : seaux par type d'écriture et par statut (renforcés pour
>    `declaree` sans badge) sur **toutes** les mutations sociales et les URL de dépôt ;
>    cliquet « toute mutation d'écriture appelle `rateLimit` ».
> 3. `convex/modules/people/erasure.ts` : effacement de toutes les tables sociales et des
>    blobs (liste générée depuis le schéma, test qui échoue si une table sociale n'est pas
>    couverte), « compte supprimé » sur les citations, délai et confirmation ; export de ses
>    données (`exportMyData`).
> 4. `convex/modules/notifications` : cloche héritée + genres de réseau, dédoublonnage,
>    rétention **active** (180/365 jours), push Web (VAPID), Expo, FCM, APNs pour les
>    évènements sociaux, préférences par catégorie, plafond hebdomadaire, digest e-mail par
>    réseau (cron), aucun contenu dans la notification (cliquet).
> 5. `convex/modules/federation` : `federationEmitters` (clé par émetteur et environnement),
>    inbox HTTP signée (`httpAction`), reçus idempotents, lettres mortes, rejeu audité,
>    `mirrors` (objet distant → objet local) ; aucun contrat branché encore (PA9, DIASPORA.GA
>    PD3/PD5).
> 6. Tests : chaque sanction ; recours ; relecture ; limitation (refus au-delà du seuil) ;
>    effacement complet ; rétention ; signature invalide refusée ; idempotence de l'inbox.
> Critère de sortie : R7, R9, R10 du cahier joués ; cliquets verts ; `verify` vert.

**Critères de done.** Modération, débit, effacement, push, inbox.
**Vérification.** Tests ; `grep` des mutations sans `rateLimit` (zéro).
**Couvre.** EXF-AN-26, 27, 28, 29, 30, 32, 33, 34, 36 ; EXT-AN-02, 03.

---

### PROMPT PA6 — Frontend : `social-features`, coque légère, i18n, charte par jetons (lot A2)

**Objectif.** Les écrans du réseau social de l'espace agent vivent dans
`packages/social-features`, sans coque de l'administration, paramétrés par réseau, traduits,
thémés par jetons.

**Contexte.** Annexe B : 91 689 lignes dans sept tranches ; 49 % tel quel, 42 % à adapter,
9 % à retirer ; coque (`shell` 19 232 l., `espace-personnel` 9 074 l.) à réécrire ; `/espace`
codé en dur ; libellés en dur ; `@convex/*` importés par le front ; `makeFunctionReference`
provisoires ; deux formats téléphone ; cycle `espace-personnel ↔ reseau-personnel`.

> Procède tranche par tranche (reseau-personnel, reseau-albums, stories, notifications,
> messagerie, iappel, direct), un commit par tranche :
> 1. Copie textuelle dans `packages/social-features/src/features/<tranche>/` avec en-têtes de
>    provenance ; tests portés et exécutés (jsdom là où le socle le fait).
> 2. Adaptations autorisées : imports (`@antsia/api`, `@antsia/ui`, `@antsia/social-contracts`
>    à la place de `@convex/*`), routage par l'adaptateur (`useRoutes()` : plus aucune URL
>    `/espace` ; cliquet), réseau courant (`useNetwork()` passé à toutes les queries et
>    mutations ; clés de stockage préfixées par réseau), vocabulaire par i18n (`fr.json`,
>    `en.json` ; cliquet « aucune chaîne hors locale »), fuseau par personne, suppression des
>    morceaux administration (iProfil, Pages = organisations, portée « Mon administration »,
>    onglet « Administration » des notifications, iCom Pro, canaux, coffre iDocument), un seul
>    format téléphone (décision A6), références `makeFunctionReference` remplacées par `api`
>    typée, `MessagerieSource` étendue aux écritures.
> 3. Coque légère `packages/social-features/src/shell` : providers (Convex, TanStack, Better
>    Auth, i18n, thème, PostHog), `NetworkProvider`, chrome iRéseau (rail, onglets chemise,
>    coquille mobile avec bascule 960 px), cloche, dock iCom, `CommunicationLayer` (hôte
>    d'appel global, salle de direct), `data-charte` posé par l'application ; le cycle
>    `espace-personnel ↔ reseau-personnel` est cassé (test d'import).
> 4. `packages/ui` : jetons et polices d'ui-v2 **élagués** des jetons de l'administration et
>    des pièces de marque ; bloc `[data-charte]` générique dérivé de la charte Personnel
>    (surfaces, rayons, états, sombre) ; `mobile.css` ; espace-kit ; `EspaceFloatingCard`,
>    `ImmersiveOverlay`, `floating-surface` ; aucune couleur littérale hors des fichiers de
>    jetons (cliquet) ; thèmes `antsia`, `diaspora-ga`, `admin` comme fichiers de jetons vides à
>    remplir par les passes `frontend-design`.
> 5. Une application de démonstration interne (`apps/antsia_ga` en mode `test-closed`) monte
>    le fil, un profil, les relations, un groupe, la messagerie et un appel, pour la recette.
> 6. `docs/04_RAPPORT_PARITE_FRONTEND.md` : par tranche, parité cochée, adaptations,
>    retraits.
> Critère de sortie : les sept tranches montées ; `verify` vert ; cliquets (`/espace`, i18n,
> couleurs, imports) verts ; recette réelle dans Chrome (320, 375, 1 280 px, sombre) ;
> accessibilité AA sur les écrans principaux.

**Critères de done.** Paquet `social-features` complet ; coque légère ; parité.
**Vérification.** Rapport 04 ; cliquets ; recette Chrome.
**Couvre.** EXF-AN-41, 42, 43, 47 (hérités) ; EXT-AN-04, 05, 06.

---

### PROMPT PA7 — Console du moteur `admin_antsia_ga` (lot A2)

**Objectif.** Un opérateur crée un réseau, nomme une équipe de modération, suit les files,
gère la fédération et lit le journal — sans déploiement.

**Contexte.** Charte `papier-encre` ou `marianne` (back-offices du programme) ; opérateurs
IDN `loa ≥ 2` ; double validation des actes irréversibles ; patrons de la console du socle
(files, journal).

> 1. `apps/admin_antsia_ga` : connexion IDN seule (`loa ≥ 2`), rôles d'opérateur
>    (`operators`), journal `operatorAudit`.
> 2. Écrans : réseaux (créer, politique, visibilité par défaut, schéma de facette, pays
>    ouverts, thème, archiver — jamais supprimer), équipes de modération et membres, files
>    d'appel (recours), fédération (émetteurs et clés par environnement — valeurs jamais
>    affichées —, reçus, lettres mortes, rejeu), badges manuels tracés (page Officiel créée à
>    la main), incidents, santé (compteurs matérialisés), exports agrégés avec seuil
>    anti-réidentification.
> 3. Tests : un opérateur sans `loa 2` est refusé ; archiver un réseau exige une double
>    validation ; créer un réseau le rend joignable par une application sans déploiement
>    (test d'intégration avec `antsia_ga` en mode test).
> Critère de sortie : la console crée `diaspora-ga` en recette sans aucune ligne de code ;
> `verify` vert.

**Critères de done.** Console opérationnelle.
**Vérification.** Création d'un réseau de bout en bout ; tests.
**Couvre.** EXF-AN-39, 40 ; EXT-AN-10.

> **Ici s'exécute DIASPORA.GA PD0 → PD6** (premier réseau réel). PA8 reprend ensuite.

---

### PROMPT PA8 — Le réseau public ANTSIA : application `antsia_ga` (lot A3)

**Objectif.** antsia.ga : vitrine, entrée, fil racine, profils, pages, découverte, directs,
modération nationale, textes légaux ; lecture anonyme des projections décidées.

**Contexte.** Décisions A3 (ouverture), A4 (lecture anonyme), A8 (direction artistique).
`social-features` et la coque légère (PA6) ; DIASPORA.GA fournit déjà des membres dérivés et
des contenus `root`.

> 0. Passe `frontend-design` : `ANTSIA/docs/05_CHARTE_ANTSIA.md` et `packages/ui/src/themes/antsia.css`
>    (jetons seulement ; couleurs du drapeau décoratives).
> 1. Routes du cahier §10.1 ; `NetworkProvider` = `antsia` ; fil racine (natifs + `root` des
>    enfants avec pastille d'origine + reflets fédérés), portées « Pour vous », « Récents »,
>    « National », provinces (référentiel des 9 provinces, facette optionnelle) ; tendances et
>    hashtags (`convex/modules/discovery`, bornés par réseau).
> 2. Lecture anonyme : projections allowlistées (`publicProjection`) pour les pages Officiel,
>    leurs publications `root`, les profils publics réduits et les contenus `root` publics ;
>    rendu serveur, métadonnées de partage ; tout le reste exige une adhésion ; test « un
>    anonyme ne lit jamais un contenu `network` ni un profil privé ».
> 3. « Publier aussi sur ANTSIA » : lecture des contenus `root` venus de DIASPORA.GA ; retrait
>    propagé ; l'auteur voit « lu dans ANTSIA » depuis son réseau.
> 4. Modération nationale : équipe `antsia`, équipes thématiques, `/moderation`, rapport de
>    transparence agrégé `/transparence`.
> 5. Vitrine, textes légaux (loi n° 001/2011 modifiée par la loi n° 025/2023, APDPVP, RGPD
>    pour les résidents de l'UE ; `TODO JURISTE` bloquant), cliquet de communication publique.
> 6. Recette : R1 à R4, R7 du cahier ; `web-design-guidelines` ; accessibilité AA ; Chrome
>    réel.
> 7. Mise en ligne seulement si A5 et les textes légaux sont validés : backend puis front ;
>    preuve par révision servie et parcours réel ; sinon recette seule, et le dire.
> Critère de sortie : antsia.ga servi (recette ou production), fil racine qui montre un
> contenu DIASPORA.GA marqué `root` et jamais un contenu `network`.

**Critères de done.** Application publique livrée ; lecture anonyme bornée ; modération.
**Vérification.** Recette ; tests d'anonymat ; révision servie.
**Couvre.** EXF-AN-12, 35, 44, 45, 46, 47, 48, 49, 50, 51 ; EXT-AN-04, 07.

---

### PROMPT PA9 — Fédération de l'administration `RESEAU-PUBLIC-V1` (lot A5, deux dépôts)

**Objectif.** Les administrations vérifiées du socle ont leur page Officiel dans ANTSIA, leurs
publications marquées « aussi sur ANTSIA » y sont reflétées, et les agents volontaires y
existent — sans que le moteur lise jamais la base du socle.

**Contexte.** Côté socle : `reseauPages` (pages = organisations vérifiées), `publishAsPage`,
`federation-contracts` (signature, enveloppes), `config/v4.4/flows.json` (contrats déclarés,
cliquet de décompte `dataFlowMatrix.length`), outbox par lots, ADR suivant ≥ 0221 (réserver
contre `origin/main` et les PR ouvertes). Côté moteur : inbox (PA5). Toute modification du
socle est une PR relue ; la publication du socle en production est une décision du
propriétaire (backend avant fronts, copie propre).

> **Contrat** (`ANTSIA/docs/contrats/RESEAU-PUBLIC-V1.md` et copie typée côté socle) :
> enveloppe signée, idempotente, versionnée ; évènements `page.upserted` {orgRef publique,
> nom, sigle, description, logoUrl publique, pays, verifiedAt}, `post.published` {postRef,
> pageRef, body, media publics, publishedAt}, `post.removed` {postRef}, `person.optin`
> {idnSub, displayName choisi, orgRef, roleLabel public}, `person.optout` {idnSub} ; jamais
> d'identifiant interne, jamais de note de service (`organisation`), jamais d'e-mail.
> **Côté socle** (branche `chantier/reseau-public-v1`, PR) :
> 1. ADR `socle/docs/adr/<n>-l-ireseau-se-reflete-dans-antsia-par-contrat.md` (numéro
>    réservé contre `origin/main` et les PR ouvertes).
> 2. `reseauPages.publishAsPage` : drapeau `publishToAntsia?: boolean` (seulement si
>    `audience = public`), posé par le signataire au moment de publier, jamais par défaut ;
>    `removePagePost` émet le retrait.
> 3. Module `modules/reseauPublicFederation/` : outbox (table + cron par lots de 150,
>    signature avec la clé du moteur par environnement en variable), émission à l'activation
>    d'une page d'administration **vérifiée**, à la publication marquée, au retrait ; opt-in
>    des agents depuis `/espace/parametres` (« Apparaître dans ANTSIA », explication, retrait
>    en un geste) ; déclaration du contrat dans `config/v4.4/flows.json` et package de
>    contrat ; cliquet de décompte mis à jour ; tests.
> **Côté moteur** :
> 4. `convex/modules/federation/reseauPublic.ts` : traitement des cinq évènements → réseau
>    `administration` (miroir) : pages `institution/official` non revendicables avec reflet
>    `root`, publications en lecture seule (`mirrors`), personnes par `idnSub` (lien
>    `administration`, badge Agent public, adhésions `administration` + `antsia`) ; `optout`
>    retire le lien, les adhésions miroir et les reflets ; rejeu idempotent.
> 5. Tests : une note de service n'arrive jamais (test du contrat côté socle et refus côté
>    moteur) ; un reflet n'est pas éditable ; `optout` efface ; signature invalide refusée.
> Critère de sortie : recette croisée **en dev** (déploiement dev du socle
> ou une copie, et dev du moteur) : R5 et R6 joués ; PR socle verte (suite
> Convex complète, cliquets) ; publication du socle en production **sur décision du
> propriétaire seulement**.

**Critères de done.** Contrat écrit des deux côtés ; PR socle ; reflets en dev.
**Vérification.** Recette croisée ; tests ; aucune lecture de base.
**Couvre.** EXF-AN-36, 37, 48 (pages Officiel), 50.

---

### PROMPT PA10 — Échelle, observabilité, préparation au lancement, passation (lot A4, puis chaque fin de lot)

**Objectif.** Tenir la charge d'un réseau national et prouver que tout est prêt.

> 1. Fil matérialisé : `feedEntries` alimenté à la publication (fan-out par lots pour les
>    auteurs très suivis, rattrapage pour les nouveaux abonnements), portées, curseurs ;
>    bascule par seuil de sources ; test R8 sous charge simulée (5 000 abonnés, 10 000
>    réactions) : aucun conflit d'écriture, p95 < 1,5 s.
> 2. Compteurs fragmentés mesurés ; purge des téléversements orphelins ; rétentions ;
>    exercice de restauration (sauvegarde Convex, restauration sur un déploiement jetable,
>    assertion).
> 3. Observabilité : PostHog UE (funnels d'entrée, rétention par réseau), tableaux de
>    modération et de fédération, alertes sur les erreurs Convex, rapport de transparence.
> 4. Audits : `convex-authz` (impersonation, propriété, fuites), `convex-launch-readiness`,
>    `web-design-guidelines` sur toutes les routes, accessibilité AA.
> 5. `docs/06_RAPPORT_LANCEMENT.md` : parité backend et frontend, cliquets, résultats des
>    audits, charge, risques ouverts, comptes et clés qui restent au propriétaire, passation.
> 6. Mise à jour de `docs/00` (encart d'état), `README`, `CLAUDE.md`, ADR acceptés ; mémoire
>    du programme (vault).
> Critère de sortie : rapport complet ; aucune publication sans vérification après coup.

**Couvre.** EXF-AN-12, 13 (échelle) ; EXT-AN-01, 07, 08, 09 ; Definition of Done du cahier §17.

## 5. Traçabilité des exigences

| Exigence | Prompts | Exigence | Prompts |
|---|---|---|---|
| EXF-AN-01 à 04 | PA2 | EXF-AN-28 à 30 | PA5 |
| EXF-AN-05 à 09 | PA2, PA4 | EXF-AN-31 | PA3 |
| EXF-AN-10, 11 | PA3 | EXF-AN-32 à 34 | PA5 |
| EXF-AN-12, 13 | PA3, PA8, PA10 | EXF-AN-35 | PA8 |
| EXF-AN-14, 15 | PA3 | EXF-AN-36, 37 | PA5, PA9 |
| EXF-AN-16 à 18 | PA3 | EXF-AN-38 | DIASPORA.GA PD3, PD5 |
| EXF-AN-19 à 21 | PA3 | EXF-AN-39, 40 | PA7 |
| EXF-AN-22 à 25 | PA3, PA6 | EXF-AN-41 à 43 | PA0, PA6 |
| EXF-AN-26, 27 | PA5 | EXF-AN-44 à 51 | PA8 |
| EXF-AN-52, 53 | lot A6 et lot mobile (prompts à écrire après décision) | EXT-AN-01 à 10 | PA0, PA2, PA4, PA5, PA6, PA8, PA10 |

## 6. Critères d'acceptation du plan

- [ ] Les 20 modules backend et les 7 tranches front portent leur provenance, leurs tests et
      leur parité cochée (rapports 03 et 04).
- [ ] Le cliquet « toute fonction sociale est bornée par le réseau » est actif depuis PA2 et
      vert ; deux réseaux de test sont étanches ; l'adhésion dérivée est testée.
- [ ] Aucun import inter-produit ; aucune URL codée en dur ; aucune chaîne hors i18n ; aucune
      couleur littérale ; aucun `.collect()` non borné ; aucun `v.any()` ; `schemaValidation`
      active.
- [ ] Les verrous « agent » du socle (appels, présence, groupes ad hoc) sont levés et testés
      dans le moteur.
- [ ] DIASPORA.GA D1 a tourné sur le moteur avant PA8 ; ANTSIA public lit un contenu `root` de
      DIASPORA.GA et jamais un contenu `network`.
- [ ] La fédération du socle n'a transporté ni note de service, ni e-mail, ni identifiant
      interne ; la publication du socle en production a été décidée par le propriétaire.
- [ ] Textes légaux validés ; dossier APDPVP déposé ; aucun chiffre public non mesuré.
- [ ] `bun run verify` vert ; mises en ligne vérifiées après coup ; mémoire du programme à jour.
