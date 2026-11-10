# P15 — Emploi et candidatures privées

Date : 18 octobre 2026. **Verdict : sources raccordées ; tests écrits, non exécutés ; recette ouverte.**

> Reprise du 20 octobre : voir le [bilan daté](P15_REPRISE_2026-10-20.md) pour les corrections
> de reprise, de session, de délivrance des CV et de progression des retraits. Le présent rapport
> conserve l’état initial du lot et ne constitue pas une validation des changements ultérieurs.

Décision du propriétaire (18/10/2026, ~22 h) : « Continuer sans vérifier ». Aucun codegen, test,
typage, lint, build, serveur, navigateur, commande Convex ni installation n'a été lancé dans les
deux dépôts. Tous les tests cités sont **écrits, non exécutés** ; aucun résultat n'est annoncé.

## Bilan standard

| Champ | Contenu |
|---|---|
| Résultat | Publication d'offres **consentie** par un mandataire PRO.GA (contrat jumeau PRO-COMMERCE-JOBS-V1), réception ANTSIA routée depuis l'inbox existante, projection par réseau/boutique, fiche membre et SSR public, section/onglet Emplois de Découvrir servi seulement avec de vraies offres, Candidater (`application.submit` signé, sujet `candidate` opaque), pièces PDF admises par la garde des fichiers et poussées en octets exacts signés, Mes candidatures depuis Profil (suivi d'état autorisé, relance, retrait), contrôle privé de retrait/révocation, effacement et export, console de politique réseau, panneaux PRO.GA (consentement par poste, lecture recruteur). |
| Source | ANTSIA `9eaff40` (`codex/pa4-identite-session`), PRO.GA `9497f22` (`feat/antsia-social-commerce`) ; changements P15 non commités dans des arbres partagés. Inventaire ci-dessous. |
| Tests | Écrits, non exécutés : `packages/social-domain/src/commerce-jobs.test.ts`, `federationProtocol.test.ts` (mis à jour), `convex/modules/shops/jobs.test.ts`, `convex/modules/shops/jobApplications.test.ts`, `apps/antsia_ga/src/components/jobs/job-model.test.ts`, tests Découvrir/Profil mis à jour ; PRO.GA `packages/pro-domain/tests/commerce-jobs.test.ts`, `convex/modules/integrations/commerceJobs.test.ts`. |
| Recette | Ouverte : publier volontairement depuis PRO.GA, candidater dans ANTSIA, suivre puis retirer ; refus d'un tiers, téléphone/bureau, clavier et lecteur d'écran. Aucune capture. |
| Dépendances | Configuration propriétaire (voir plus bas), décision de conservation, recette sandbox croisée. |
| Retour arrière | Fermer `commerceJobPolicies` (console) et retirer `PRO-COMMERCE-JOBS-V1` des émetteurs : lecture et candidatures fermées sans effacer les candidatures existantes ; côté PRO.GA, retirer les consentements par poste (tombes `withdrawn`). Ne supprimer aucune candidature ni preuve d'accord. |
| Limites | Voir « Limites ». |

## Décisions

1. **Contrat jumeau** `packages/social-domain/src/commerce-jobs.ts` = `PRO_GA/packages/pro-domain/src/commerce-jobs.ts` (octets identiques, sha256 `1f63e4da…214b9`) : PUBLIC-V1 étant gelé et sans compétences ni période, JOBS-V1 reprend sa charge et ajoute `skills` et `declaredSalary.period`. ANTSIA lit aussi PUBLIC-V1 `job.*` normalisé (aucune compétence, période inconnue). Contrôle `PRO-COMMERCE-APPLICATION-CONTROL-V1` et pièces `PRO-COMMERCE-APPLICATION-FILES-V1` dans le même module ; le nom réservé `application.withdraw` n'est pas rendu exécutable.
2. **Autorité et consentement** : statut `published` insuffisant ; consentement explicite par poste et par liaison (`publish_jobs` + mandat `recruiting.openings.manage`/`site.publish`), parent vitrine P09 avec capacité `jobs` sous mandat vivant ; ANTSIA exige en plus la politique réseau (fermée par défaut), le mapping P09, le contrat autorisé par l'émetteur et la modération `commerceJob` (prélecture faute de politique).
3. **Révisions** : clôture `closed`/`filled` définitive (lien connu affiche la clôture, découverte la quitte) ; `withdrawn` = tombe sans contenu, republiable seulement par révision supérieure ; un ancien événement ne réactive jamais.
4. **Candidature** : un formulaire RHF + Zod, nom civil saisi en deux champs et normalisé par le normaliseur partagé (`normalizeCivilName` : NOM en capitales, Prénom capitalisé, aperçu « Nom transmis »), motivation facultative, 0 à 3 PDF prêts, accord versionné `2026-10-18-p15-v1`. Octets COMMAND fixés et persistés ; même clé + même intention = même candidature, autre intention = conflit, seconde clé pendant une candidature active = refus. Délai réseau résolu par `request.status`.
5. **Pièces** : usage `job_application_document` (PDF, 5 Mio), source `job_application`, `requiresFullScan` (antivirus obligatoire), ligne d'analyse **sans réseau ni nom de fichier**, aucune URL servie (même au candidat), références `antsia:file:` dérivées par candidature (aucune corrélation entre structures), octets relus et revérifiés (taille, empreinte, `%PDF-`) avant envoi.
6. **Politique de retrait** : toujours possible ; local et immédiat avant tout envoi, contrôle privé après ; copies ANTSIA (nom civil, motivation, octets signés) effacées tout de suite ; PRO.GA efface copies et pièces, anonymise le nom, classe « retirée » une candidature encore ouverte, ne réécrit pas une décision prise ; tombe si le retrait précède la demande.
7. **Conservation** : aucune durée inventée (`COMMERCE_JOBS_RETENTION` à `null`) — à valider par le propriétaire et un conseil compétent.
8. **Placement** : surfaces dans `apps/antsia_ga/src/components/jobs/` (le prompt proposait `packages/social-features/src/features/employment/` « à confirmer » ; la consigne du coordinateur a fixé l'espace i18n `jobs` de l'app). Cible de modération `commerceJob` (préfixée, distincte des cibles `diaspora_…`, jamais `job` seul).

## Inventaire ANTSIA

Créés : `packages/social-domain/src/commerce-jobs.ts`, `commerce-jobs.test.ts` ;
`convex/modules/shops/{jobTables,jobAccess,jobRead,jobs,jobFiles,jobApplications,jobApplicationClient,jobApplicationTransport,jobApplicationLifecycle}.ts`, `jobs.test.ts`, `jobApplications.test.ts` ;
`convex/modules/public/jobs.ts` ; `convex/modules/federation/commerceJobs.ts` ;
`apps/antsia_ga/src/components/jobs/{job-model.ts,job-model.test.ts,job-card.tsx,member-job-directory.tsx,member-shop-jobs-screen.tsx,job-application-form.tsx,my-applications-screen.tsx,job-public-route.tsx}` ;
`apps/antsia_ga/src/lib/public-jobs-data.ts` ;
pages `app/(membre)/boutique/[handle]/emplois/page.tsx`, `app/(membre)/boutique/[handle]/emplois/[jobRef]/page.tsx`, `app/(membre)/mes-candidatures/page.tsx`, `app/(public)/boutiques/[handle]/emplois/[jobRef]/page.tsx` ;
`apps/antsia_ga/src/i18n/locales/{fr,en}/jobs.json` ; `apps/admin_antsia_ga/src/components/console-job-policy.tsx` ;
`docs/contrats/PRO-COMMERCE-JOBS-V1.md`, `docs/adr/0024-emploi-consenti-et-candidatures-privees.md`, ce rapport.

Modifiés par ancres ciblées : `packages/social-domain/src/{uploadPolicy,filePolicy,federationProtocol,federationProtocol.test,moderationPolicy,audit}.ts` ;
`convex/modules/shops/{tables,commerceBuyerSubjects}.ts` ; `convex/modules/people/{dataPolicies,dataInventory,erasure}.ts` (hors blocs DIASPORALE) ; `convex/lib/rateLimit.ts` (`shop.job.*`, hors bloc DIASPORALE) ;
`convex/modules/moderation/{tables,policy,reviewProjection,targets}.ts` ; `convex/modules/federation/{commerceCatalog,reseauPublic,commerceTransport}.ts` ; `convex/crons.ts` (`jobs-drain-applications`) ;
`apps/antsia_ga/src/{i18n/resources.ts,lib/routes.ts}` ; `components/discovery/{discover-model.ts,discover-model.test.ts,discover-screen.tsx,discover-screen.test.tsx}` (fusionnés avec P14) ; `app/(membre)/moi/{me-model.ts,me-model.test.ts,me-screen.test.tsx}` ; `components/shops/{member-storefront-screen.tsx,shop-member-surfaces.test.tsx}` ; `i18n/locales/{fr,en}/memberNetwork.json` ;
`apps/admin_antsia_ga/src/{components/console-pages.tsx,i18n/locales/{fr,en}/operations.json}`.

Non touchés : `convex/modules/diaspora/**`, manifeste P06 `commerce/**` et fixtures, `convex/schema.ts` (les tables passent par `shops/tables.ts`), `package.json`, `bun.lock`, `_generated`, primitives UI, pont de session, `.env*`.

## Inventaire PRO.GA

Créés : `packages/pro-domain/src/commerce-jobs.ts`, `packages/pro-domain/tests/commerce-jobs.test.ts` ;
`convex/modules/integrations/{commerceJobTables,commerceJobAccess,commerceJobs,commerceApplications,commerceApplicationFiles}.ts`, `commerceJobs.test.ts` ;
`convex/lib/pro/commerceJobEvents.ts` ; `packages/pro-features/src/features/recruiting/{antsia-jobs-i18n.ts,AntsiaJobPublication.tsx,AntsiaApplicationPanel.tsx}` ; `docs/26_P15_EMPLOI_ANTSIA.md`.

Modifiés par ancres ciblées : `packages/pro-domain/src/index.ts` (export du jumeau) ; `convex/modules/integrations/{tables,commerceCatalogue,commerceCommands,commerceCrypto,commerceOutbox,commerceDispatch}.ts` ; `convex/lib/pro/outbox.ts` ; `convex/http.ts` (deux routes) ; `convex/crons.ts` (deux tâches) ; `convex/modules/recruiting/{tables,_deps,openings}.ts` (source `antsia`, crochet planifié) ; `packages/pro-features/src/features/recruiting/{RecruitingBoard.tsx,shared.ts}`.

## Configuration propriétaire requise

ANTSIA : émetteur PRO.GA autorisant `PRO-COMMERCE-JOBS-V1` ; `jobs:setPolicy` (console) par réseau ; politique de modération `commerceJob` ; liaisons consenties avec `publish_jobs` et `receive_applications`. PRO.GA : scope `commerce.application.submit` sur la source ANTSIA ; destination admettant `job.published`/`job.closed`. Aucun secret ni configuration réelle n'a été posé.

## Limites

- Aucune exécution : la cohérence des types, du codegen (`api.modules.shops.jobs*`, `jobFiles`, `jobApplications`, `public.jobs`, `integrations.commerceApplications`) et des cliquets n'est pas prouvée.
- Le test gelé `packages/social-domain/src/commerce/compatibility.test.ts` affirme encore que PUBLIC-V1 n'est pas implémenté côté ANTSIA (assertion antérieure à P09/P15) ; il n'a pas été modifié (manifeste gelé) et reste à arbitrer par le coordinateur.
- Conservation non décidée ; aucun pipeline général d'export/effacement PRO.GA des compléments de candidature hors du retrait ANTSIA.
- Un avis de quarantaine d'une pièce (sans réseau) est adressé, comme pour un fichier de profil, au déposant et aux modérateurs de la racine — sans nom de fichier ni contenu.
- Après huit tentatives, un retrait distant non confirmé est clos localement avec la trace `remoteUnconfirmed` pour ne pas bloquer l'effacement.
- Aucune preuve visuelle, mobile, clavier ou lecteur d'écran ; aucun échange réel ANTSIA ↔ PRO.GA.

Références : [prompt P15](../prompts/P15_EMPLOI.md), [contrat](../../../contrats/PRO-COMMERCE-JOBS-V1.md), [ADR0024](../../../adr/0024-emploi-consenti-et-candidatures-privees.md), `PRO_GA/docs/26_P15_EMPLOI_ANTSIA.md`.
