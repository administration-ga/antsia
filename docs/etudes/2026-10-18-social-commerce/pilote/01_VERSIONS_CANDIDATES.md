# 01 — Versions candidates A, B, C, D : capacités, état réel et bloquants

## Actualisation du 20 octobre 2026

**Décision préparée : NO GO pour admettre une candidate issue de cette reprise.** Ce constat
documentaire ne prend aucune décision à la place du propriétaire. Le repère ANTSIA `c4d36f3`
ne fige pas les modifications non commitées ; aucun identifiant de binaire ni de déploiement
servi n’est attesté. Les tableaux du 19 octobre qui suivent sont historiques. La production
éventuellement publiée ailleurs n’est pas observée : aucun appel n’y a été fait, et la fermeture
des registres en source ne décrit pas sa configuration courante.

| Capacité candidate | État courant connu par les sources / rapports | Décision préparée et condition manquante |
|---|---|---|
| A — UI Web, fil, publications, iCom | Sources raccordées ; les reprises et corrections postérieures ne sont pas validées par les preuves du 18/10 | **NO GO** : gel coordonné, vérification et recette actuelle, accessibilité/performance à constater |
| B — Vitrines en revue, liaison, catalogue, contact | Sources et consoles de finitions décrites ; aucune nouvelle recette croisée ; admission automatique fermée par P16 | **NO GO** : décisions d’admission/secteurs, configuration propriétaire et recette ; ne pas rouvrir l’automatique via une ancienne politique |
| C — Préparation sans paiement | Réservation et voies historiques en source ; pas de nouvelle preuve d’exécution | **NO GO** : configuration vendeur/versionnée, autorité, concurrence et libération à éprouver |
| C — Paiement, achat payé, remboursement nouveau | Registre d’activation P16 fermé ; aucun fournisseur admis ou prouvé par cette reprise | **NO GO** : décisions financières, connecteur/configuration sandbox et preuves serveur ; aucune transaction réelle autorisée |
| C — Nouveaux services, devis acceptés et rendez-vous | Reprise P14 en source, nouveaux effets fermés par P16 dans les deux produits | **NO GO** : dépendances de conservation et recette P14 résolues, décision documentée puis évolution du registre ; une bascule de console seule ne suffit pas |
| C — Nouvelles candidatures et copies de CV | Reprise P15 en source, candidatures et nouvelles copies fermées par P16 ; fenêtre crash stockage/rattachement encore ouverte | **NO GO** : conservation et admission durable des CV, recette P15, décision puis évolution du registre |
| D — Client et appels natifs | P17b/c raccordés, Expo 57 déclaré ; P17d physique non effectué ; P18 natif raccordé sans mesures | **NO GO** : installation/compatibilité, contrôles et binaires, identités/configuration détenues, [recette iOS/Android](../../../recette/antsia-native-p17d/README.md) |
| Toutes versions — pilote utilisateur | Protocole seulement ; aucun consentement, participant, séance ou résultat de cette reprise | **NO GO** : périmètre candidat admis, consentement et conservation des notes décidés, recrutement effectif |

Les libérations, suivis, annulations, retraits et résolutions financières déjà engagés restent
distincts de ces nouvelles admissions. Aucun résultat historique n’est effacé pour fermer une
capacité. Aucun versement n’est déduit d’une réception acheteur.

Preuves de cette actualisation : [P14](../rapports/P14_REPRISE_2026-10-20.md),
[P15](../rapports/P15_REPRISE_2026-10-20.md), [P16](../rapports/P16_REPRISE_2026-10-20.md),
[P17b](../rapports/P17B_REPRISE_2026-10-20.md), [P17c](../rapports/P17C_REPRISE_2026-10-20.md)
et [plan P17d/P18/P19](../rapports/P17D_P18_P19_PLAN_REPRISE_2026-10-20.md), complétés par
[P17d](../rapports/P17D_REPRISE_2026-10-20.md) et [P18](../rapports/P18_REPRISE_2026-10-20.md).
Les registres [ANTSIA](../../../../convex/modules/shops/commerceActivation.ts) et
[PRO.GA](../../../../../PRO_GA/convex/modules/integrations/commerceActivation.ts) ont été lus,
sans les exécuter. Les hypothèses « aucun client natif », « P17b/c non lancées » et « ouvrir les
services/emplois après simple configuration » du texte historique sont dépassées.

## Relevé historique du 19 octobre (conservé)

19 octobre 2026, lot P19 (version documentaire). Références : [00 §4](../00_VISION_ET_DECISIONS.md),
[09 §4](../09_FEUILLE_DE_ROUTE.md), [10 §7](../10_RECETTE_MESURES_ET_RISQUES.md),
[EXECUTION.md](../EXECUTION.md), rapports du dossier [`rapports/`](../rapports/).

**Décision du propriétaire en vigueur (18/10/2026, vers 22 h) : « Continuer sans vérifier ».**
Ce document ne lance aucune commande de vérification. Il relit les rapports et l'arbre de travail
(lectures de fichiers, `git status`/`git log`, dates de fichiers et empreintes SHA-256 en lecture).
Une égalité d'octets relevée ici est un inventaire, pas une vérification.

## 1. Les cinq verdicts (10 §7)

| Verdict | Ce qu'il exige |
|---|---|
| **Documenté** | Rapport, contrat ou ADR décrivant le comportement |
| **Présent dans le code** | Sources raccordées aux vraies routes et fonctions, constat de lecture |
| **Testé automatiquement** | Tests exécutés et verts, commande et résultat consignés |
| **Observé en recette** | Parcours joué, environnement, rôle, largeur ou appareil consignés |
| **Publié et vérifié** | Révision servie identifiée, parcours rejoués sur la cible publiée |

Un verdict n'en implique aucun autre. « Tests écrits » ne vaut pas « testé automatiquement ».

## 2. État réel par lot (relevé du 19/10/2026, 01 h 40, complété à 02 h 12)

Légende : **oui**, **non**, **partiel** (portée précisée), **s.o.** (sans objet), **en cours**
(une session écrit encore).

| Lot | Documenté | Présent dans le code | Testé automatiquement | Observé en recette | Publié et vérifié |
|---|---|---|---|---|---|
| P00 Cadrage | oui ([rapport](../rapports/P00_CADRAGE.md), ADR 0017–0019 proposés) | s.o. | s.o. (contrôle statique : liens, voir §3) | s.o. | non |
| P01 / P01b Charte | oui ([rapport](../rapports/P01_CHARTE.md)) | oui | **oui le 18/10** (§3) ; fichiers modifiés depuis | **partiel** (§3) | non |
| P02 Navigation | oui ([rapport](../rapports/P02_NAVIGATION.md)) | oui | **oui le 18/10** (§3) ; fichiers modifiés depuis | **partiel** (§3) | non |
| P03 Publications | oui | oui | non : tests écrits, jamais exécutés | non | non |
| P04 Fil immersif | oui | oui | non : 117 cas écrits, jamais exécutés | non | non |
| P05 iCom | oui | oui | non : tests écrits, jamais exécutés | non | non |
| P06 Contrats | oui ([rapport](../rapports/P06_CONTRATS.md)) | oui (contrats purs, non branchés au bilan P06) | **oui le 18/10** (§3) ; octets inchangés depuis | s.o. (aucune surface) | non |
| P07 Boutiques | oui | oui | non : tests écrits, jamais exécutés | non | non |
| P08 Liaison et transport | oui | oui (deux dépôts) | non : tests écrits, jamais exécutés | non | non |
| P09 Catalogue | oui | oui (deux dépôts) | non : tests écrits, jamais exécutés | non | non |
| P10 Contact commercial | oui ([rapport](../rapports/P10_CONTACT_COMMERCIAL.md), [docs/21](../../../21_CONTACT_COMMERCIAL_PRO_GA.md)) | oui (deux dépôts) | non : tests écrits, jamais exécutés | non | non |
| P11 Préparation et stock | oui | oui (deux dépôts) | non : tests écrits, jamais exécutés | non | non |
| P12 Paiement | oui | **partiel** : aucun adaptateur (`PAYMENT_ADAPTERS = []`), « payer » fermé | non : tests écrits, jamais exécutés | non | non |
| P13 Achats et suivi | oui | **partiel** : reversement et litige complet non livrés | non : tests écrits, jamais exécutés | non | non |
| P14 Services | oui | oui (deux dépôts) | non : tests écrits, jamais exécutés | non | non |
| P14B Avis et suites services/emploi | oui ([rapport](../rapports/P14B_NOTIFICATIONS_ET_SUITES.md), 19/10 01 h 44) | oui | non : tests écrits, jamais exécutés | non | non |
| P15 Emploi | oui | oui (deux dépôts) | non : tests écrits, jamais exécutés | non | non |
| P16 Confiance (C1–C7) | oui | oui (sept corrections) | non : tests écrits, jamais exécutés | non | non |
| P17a Audit natif | oui | s.o. (aucun code) | s.o. | non | non |
| P17b, P17c, P17d | non (décomposés dans P17a §5) | non lancés | non | non | non |
| P18a Audit statique | oui | s.o. (aucun code) | s.o. | non | non |
| P18b Corrections | oui (section « Correctifs P18b » de [P18A](../rapports/P18A_AUDIT_STATIQUE.md)) | oui | non : tests écrits, jamais exécutés | non | non |
| CC Conversation contextuelle | oui ([contrat](../../../contrats/CONVERSATION-CONTEXTUELLE-V1.md) accepté le 19/10 ; D7 et D13 à confirmer juridiquement) | **en cours** (CC-1, CC-2a, CC-2b ; tranche CC-3a commencée côté DIASPORALE) | non : tests écrits, jamais exécutés | non | non |
| PA9 Fédération (hors étude, dépendance) | oui (docs/15–18, ADR 0013–0016 proposés) | oui | non (vérifications différées) | non | non |
| PA10 Fil matérialisé (hors étude, dépendance) | oui (docs/19–20, ADR-0020 proposé) | oui | non (vérifications différées) | non | non |
| Thèmes au choix du membre (non inscrit dans EXECUTION.md à 02 h 12) | non relevé | **en cours** (sept `packages/ui/src/themes/antsia-<thème>.css`, `antsia-themes.ts` et son test, imports dans `apps/antsia_ga/src/app/globals.css`) | non | non | non |

Constats de lecture qui précisent ce tableau :

- **P14B** (rapport du 19/10, 01 h 44) : treize genres d'avis commerce émis à partir d'un état
  confirmé par PRO.GA, destination typée à l'ouverture, fiche `/mes-candidatures/[applicationId]`,
  section « Prestations sans paiement en ligne » dans Mes achats. Limite : les avis destinés au
  client d'un service sont des **traces déjà lues, sans transport** ; aucun canal PRO.GA → ANTSIA ne
  pousse les états de service (DP-39).
- **Thèmes au choix** : à 02 h 10–02 h 11, sept thèmes que le membre choisirait dans ses préférences
  sont apparus dans `packages/ui/src/themes/` et sont importés par `globals.css`. Ce travail n'est pas
  inscrit dans EXECUTION.md à 02 h 12 ; il touche les fichiers prouvés par P01.
- **CC** : à 01 h 35, `convex/modules/contextualMessaging/` compte douze fichiers et quatre tables
  (`contextualThreads`, `contextualMessages`, `contextualPersonStates`, `contextualPolicies`),
  déjà agrégées par `convex/schema.ts`. Aucun fichier `*.test.ts` n'y était présent à ce moment ;
  à 02 h 15, `contextualMessaging.test.ts` existe dans le module et dans
  `packages/social-domain/src/`, et les cliquets `contextual-registry` et `contextual-hooks` sont
  apparus. Côté tranche, `diaspora/conversationContexts.ts` et
  `DIASPORALE/packages/diasporale-domain/src/conversation-contexts.ts` (avec tests) datent de
  01 h 30–01 h 33. Le rapport `rapports/CC_CONVERSATION_CONTEXTUELLE.md` cité par ADR-0025
  n'existe pas encore. CC-4 (appels), CC-5 et CC-6 (interfaces) ne sont pas commencés à ma lecture.
- **PA9 / PA10** : leurs sources ne sont ni commitées ni vérifiées. P04 dépend des champs PA10 de
  `myFeed` (`lacunar`, `preparing`, `materializedSince`) ; P03 dépend de
  `PostMediaPresentation.tsx`, non suivi. Les preuves historiques PA3–PA8 ne valident ni PA9 ni
  PA10 (consigne du `CLAUDE.md` ANTSIA).

## 3. Preuves exactes du 18/10 (P00, P01, P01b, P02, P06)

Ce sont les seules exécutions de vérification attachées à l'étude. Elles sont citées telles
qu'elles figurent dans les rapports et dans EXECUTION.md.

**P00** ([rapport §9](../rapports/P00_CADRAGE.md)) : « Liens relatifs du dossier : **109 vérifiés,
0 cassé** (script Python sur `docs/etudes/2026-10-18-social-commerce/**/*.md`) » ; couverture
SC01–SC16 présente dans 09 §5. Contrôle documentaire, pas une vérification applicative.

**P01** ([rapport §5](../rapports/P01_CHARTE.md)) :

| Commande | Résultat consigné |
|---|---|
| `bun run --cwd packages/ui test -- antsia-palette themes-isolation` | 2 fichiers, **214 tests verts** |
| `bun run --cwd packages/ui test` | 13 fichiers, **302 tests verts** |
| `bunx vitest run --config tests/vitest.config.ts tests/ratchets/{theme-contract,no-hardcoded-colors,provenance-headers,no-hardcoded-urls}.test.ts` | 4 fichiers, **9 tests verts** |
| `bunx tsgo --noEmit -p packages/ui/tsconfig.json` | sortie 0 |
| `bun run --cwd packages/ui lint` | 0 erreur ; 6 avertissements préexistants |

**P01b** ([rapport §P5](../rapports/P01_CHARTE.md)) :

| Commande | Résultat consigné |
|---|---|
| `bun run --cwd packages/ui test -- antsia-palette themes-isolation antsia-toasts` | 3 fichiers, **246 tests verts** |
| `bun run --cwd packages/ui test` | 14 fichiers, **334 tests verts** |
| Cliquets `theme-contract`, `no-hardcoded-colors`, `no-hardcoded-urls`, `provenance-headers` | 4 fichiers, **9 tests verts** |
| `tsgo` sur `packages/ui` puis `apps/antsia_ga` | sortie 0 ; sortie 0 |
| `eslint` `packages/ui` ; `eslint .` `apps/antsia_ga` | 0 erreur (6 avertissements préexistants) ; 0 erreur (8 préexistants) |
| DIASPORALE `bunx vitest run src/styles/engine-theme-contrast.test.ts` (lecture seule) | **139 tests verts** |

EXECUTION.md : P01 « **code présent + tests** (214 + 5 cliquets revérifiés par le coordinateur) ;
rendu 1280 clair/sombre observé » ; P01b « **code présent + tests** (D4, D6, D7a, D8, D11 ; 334
tests ui) ».

**P02** ([rapport §4](../rapports/P02_NAVIGATION.md)) :

| Commande | Résultat consigné |
|---|---|
| `bunx tsgo --noEmit -p tsconfig.json` dans `packages/api`, `packages/social-features`, `apps/antsia_ga` | 0 erreur ×3 |
| `bunx vitest run src/shell` (`packages/social-features`) | 33 fichiers, **379 tests verts** |
| `bunx vitest run src/shell src/i18n …/creation-controller.test.ts …/messagerie-source.test.ts` | 38 fichiers, **438 tests verts** |
| `bunx vitest run` (`apps/antsia_ga`) | 29 fichiers, **162 tests verts** |
| `bunx vitest run` (`packages/api`) | 11 fichiers, **190 tests verts** |
| Huit cliquets (`--config tests/vitest.config.ts`) | 8 fichiers, **28 tests verts** |
| `bun run lint` | `api` 0 ; `social-features` 0 erreur (73 avertissements préexistants) ; `antsia_ga` 0 erreur (8 préexistants) |
| DIASPORALE `apps/diasporale_com`, 17 fichiers consommateurs | 254 ✓ / 5 ✗ avant **et** après (5 échecs préexistants dans `settings-screen.test.tsx`) |

EXECUTION.md : P02 « **code présent + tests** (379 coque, 162 app revérifiés par le coordinateur) ;
observé à 375 px (barre 5 places, Créer, Échap + focus, `/explorer`, `/moi`) et 1280 px (rail) » ;
« P02 → fin » (rangée mobile de `feed-screen.tsx`) : « **code présent** ; typage app 0 ; observé à 375 px ».

**Recette partielle P01/P01b/P02** :
[`docs/recette/refonte-vague1-2026-10-18/README.md`](../../../recette/refonte-vague1-2026-10-18/README.md).
Navigateur intégré, largeurs et `prefers-color-scheme` émulés, `http://localhost:3030`, compte local
fictif `@recette.refonte` (adhésion déclarée), neuf captures. Observé : jetons rendus en sombre à
1280 px, clair 1280 px, téléphone 375 × 812, Créer et Échap, `/explorer` et `/moi`, absence de
défilement horizontal à 320 px, corps 16 px, titres « Familjen Grotesk Variable », Inter non
installée, anneau `--outline-ring` plein. **Hors de cette recette** : contrastes mesurés au rendu,
lecteur d'écran, zoom 200 % réel, appareils physiques, DIASPORALE (:3031), console.

**P06** ([rapport](../rapports/P06_CONTRATS.md), bilan) : ANTSIA
`bun run --cwd packages/social-domain test -- commerce` → 3 fichiers, **38 tests verts** ;
`tsgo` du paquet → 0 erreur ; lint propre ; cliquets `no-cross-product-imports`,
`provenance-headers`, `no-hardcoded-urls` → 10 tests verts, `no-hardcoded-colors`,
`no-unbounded-collect` → 4 verts. PRO.GA
`bun test packages/pro-domain/tests/commerce-conformance.test.ts packages/pro-domain/tests/commerce-parity.test.ts`
→ **15 verts, 85 assertions** ; `typecheck` du paquet → 0 erreur ;
`bun run --cwd packages/pro-domain test` → **736 verts / 55 fichiers** ; contre-épreuve d'un octet
ajouté (les deux suites rougissent). Manifeste révision 1, SHA-256
`0ad170ac60f7e81576e38bd43273b029b4088720272fa35bfdec2e1de1d755f0`. EXECUTION.md : « ANTSIA 38,
PRO.GA 15 revérifiés ».

**Portée actuelle de ces preuves** (dates de modification relevées le 19/10) :

| Lot | Fichiers prouvés | Modifiés depuis la preuve ? | Conséquence |
|---|---|---|---|
| P06 | `packages/social-domain/src/commerce/*` (18/10 14 h 26–14 h 55), `packages/pro-domain/src/commerce/*` (18/10 14 h 50) | **Non** ; manifeste identique dans les deux dépôts | La preuve reste attachée à ces octets. Le paquet autour, lui, a changé (contrats jumeaux P08–P15) : la suite complète est à rejouer |
| P01 / P01b | `packages/ui/src/themes/antsia.css`, `styles/charte.css`, `apps/antsia_ga/src/app/globals.css` | **Oui**, 19/10 01 h 15 (jeton `--esp-sticky-header-inset`, P18b A13), puis `globals.css` à 02 h 10 (imports des thèmes au choix) | Preuve historique : elle décrit l'état du 18/10, pas les fichiers actuels |
| P02 | `apps/antsia_ga/src/lib/routes.ts`, `packages/api/src/network.tsx`, `apps/antsia_ga/src/components/network-shell.tsx` | **Oui** (19/10 01 h 26, 19/10 01 h 24, 18/10 23 h 13) par P04, P05, P07 et suivants | Preuve historique, à rejouer au gel |

Un défaut est déjà connu pour P06 : `packages/social-domain/src/commerce/compatibility.test.ts`
affirme qu'aucun contrat commercial n'est appliqué par l'inbox. P09 et P15 l'ont rendu faux. Ce test
est hors du manifeste (la liste `files` du manifeste ne le contient pas). Sa mise à jour ne demande
donc aucune nouvelle révision jumelle. Voir [02 §6](02_GEL_ET_VERIFICATION.md).

## 4. Version A — le nouveau réseau agréable à consulter

**Capacités** (00 §4, 09 §4) : charte encre, ivoire et prune en clair et sombre (P01) ; navigation
Fil · Découvrir · Créer · Messages · Profil (P02) ; carte média et carte publique SSR (P03) ; fil
immersif avec lecture unique et retour au contenu (P04) ; Messages en trois vues, envois
idempotents, appels persistants, ouverture ciblée des notifications Web (P05) ; corrections
d'accessibilité P18b sur ces surfaces. Toutes les capacités commerciales restent fermées. Si le
travail de thèmes au choix en cours est retenu, il entre dans A et suit le même gel et la même
recette (A-2).

**Ce qui doit rester honnête** (09 §4) : aucun bouton d'achat opérationnel ; le fil reste borné
(« Fil incomplet », « Fil en préparation ») ; aucune promesse de sonnerie native ni de chiffrement
de bout en bout ; les vidéos n'ont pas de sous-titres (A08).

**Bloquants**

1. Vérification interdite tant que « Continuer sans vérifier » n'est pas levé (DP-01).
2. Arbre en écriture active : CC, P14B, DIASPORALE et le travail de thèmes non inscrit écrivaient
   encore entre 01 h 24 et 02 h 11 le 19/10 (618 entrées `git status` à 02 h 12). Aucun gel n'est
   possible avant leur fin d'écriture déclarée.
3. Dette de compilation connue : 110 erreurs de type Convex relevées le 18/10 à 21 h 50, avec des
   types générés périmés, avant P14, P15, P16, P18b, CC et P14B (EXECUTION.md).
4. Dépendance à PA10 et PA9 : sources non commitées et non vérifiées. Le fil (P04) lit des champs
   PA10.
5. Bloquants d'accessibilité A01 (menu « ⋯ ») et A02 (bulles) corrigés en P18b, jamais prouvés.
6. Sous-titres : décision A08 avant tout pilote qui sert des vidéos avec son (DP-21).
7. Recette physique : aucun téléphone Android physique attesté ; appels réels conditionnés à
   LiveKit configuré (PR-03) ; notification Web conditionnée à VAPID (PR-04).
8. Espace disque : 4,3 Gio libres sur `/System/Volumes/Data` le 19/10 à 01 h 37 (98 % occupés).

**Dépendances** : P18b mesuré (protocole prêt dans P18A §4) ; parité DIASPORALE prouvée (aucune
régression visuelle ni comportementale chez elle) ; ADR-0017 accepté après recette (DP-03).

**Limite structurelle** : l'arbre mêle A et les lots commerciaux dans les mêmes fichiers partagés
(`network.tsx`, `routes.ts`, `network-shell.tsx`, locales). La version A ne peut donc pas être
vérifiée seule : le gel et le `verify` portent sur l'arbre entier, lots commerciaux compris, ces
derniers restant fermés par leurs politiques.

**Surfaces commerciales non gardées** : publier A depuis cet arbre expose aussi ce qu'aucune
politique ne ferme. `app/(membre)/moi/me-model.ts` rend sans condition sept entrées de Profil
(Ma boutique, Panier, Mes achats, Mes préparations, Mes paiements, Mes demandes, Mes
candidatures) ; `components/discovery/discover-model.ts` sert l'onglet Boutiques de Découvrir sans
condition (vide tant qu'aucune vitrine n'est publiée) ; la création d'un brouillon de boutique ne
dépend d'aucune politique (P07). Rien ne permet d'acheter, mais ce n'est pas une « UI seule » :
décision DP-38.

## 5. Version B — la vitrine commerciale et la conversation

**Capacités** : brouillon de boutique pour un membre déclaré, demande de publication et admission,
vitrines membre et publique (P07) ; liaison PRO.GA à double preuve et transport signé (P08) ;
catalogue PRO.GA reflété, retraits et tombes, médias copiés sous analyse complète (P09) ; question à
la boutique, mandats de réponse, appels consentis, transfert CRM facultatif (P10) ; confiance
transverse (P16) ; corrections P18b sur ces surfaces.

**Ce qui doit rester honnête** : prix et disponibilité indicatifs et datés ; « Sur devis » jamais
chiffré ; aucune action d'achat ; une réception (`received`) n'est pas une application (`applied`).

**Bloquants** (en plus de A)

1. Publication d'une vitrine déclarée non décidée (ADR-0019, DP-04) ; secteurs restreints non
   listés (DP-05).
2. Configuration commerce absente des deux côtés : sources, destinations, clés, origines,
   environnement (PR-01). Sans elle, la liaison et le transport rendent « indisponible ».
3. Aucun écran de console pour la politique des vitrines (`shops/operator.setStorefrontPolicy`,
   `decideStorefront`, `setStorefrontSuspension`) ni pour la politique et le mapping du catalogue
   (`shops/catalogControl.setPolicy`, `configureMapping`). Ces fonctions opérateur existent sans
   interface ; leur appel doit être autorisé (voir [05](05_ACTIVATION_ET_RETOUR_ARRIERE.md)).
4. Vérification PRO.GA jamais lancée pour P08–P10 ; deux `httpAction` encore importés de modules par
   `PRO_GA/convex/http.ts` contre le test de frontière des domaines.
5. Recette croisée ANTSIA × PRO.GA dans un créneau coordonné (backend PRO.GA local `:3220`).

## 6. Version C — l'achat et le service réellement exécutés

**Capacités** : panier mono-vendeur et préparation avec réservation atomique de quinze minutes
(P11) ; intention de paiement, preuve fournisseur, rapprochement, répartition paramétrable (P12,
partiel) ; Mes achats, réception explicite, annulation et retour demandés, support privé (P13,
partiel) ; devis versionnés, rendez-vous, prestation à tarif fixe (P14) ; offres d'emploi
consenties et candidatures privées (P15) ; avis commerce et ouverture ciblée (P14B).

Trois sous-ensembles n'ont pas les mêmes bloquants :

| Sous-ensemble | Dépend du fournisseur de paiement ? | Peut être recetté avant DP-10 ? |
|---|---|---|
| Services (devis, rendez-vous, prestation sans paiement) et emploi | non (acompte indisponible) | oui, après vérification et configuration |
| Préparation de commande et réservation (sans paiement) | non | oui, jusqu'à la libération ou l'expiration |
| Paiement, exécution payée, remboursement, réception, transaction tardive | **oui** | **non** |

**Ce qui doit rester honnête** : « payer » fermé tant qu'aucun fournisseur n'est admis, configuré et
prouvé en sandbox ; un retour du prestataire n'est jamais une preuve ; un remboursement demandé
n'est pas un remboursement effectué ; une part vendeur prévue n'est ni acquise ni versée.

**Bloquants** (en plus de B)

1. **Aucun fournisseur** : `PRO_GA/convex/modules/payments/adapters.ts:67` et `:69`
   (`PAYMENT_ADAPTERS = []`, `PAYMENT_CALLBACK_BINDINGS = []`). Contraintes documentées : PayPal
   sans XAF et Gabon « Send only » ; Stripe avec XAF mais Gabon absent des pays d'ouverture ;
   spécifications Airtel Money et Moov Money à obtenir (DP-10 à DP-14).
2. Paiement ANTSIA limité au sandbox **par le code** : `paymentAuthority` refuse toute configuration
   dont l'environnement n'est pas `sandbox` (`convex/modules/shops/paymentAccess.ts:32`). Un
   paiement de production exigerait un changement de code.
3. Aucun écran de console pour la politique de préparation (`shops/checkoutPolicy.setPolicy`).
4. Conservation non fixée (candidatures `null`, preuves financières, suivis privés : DP-17) ;
   effacement sans relais vers PRO.GA (DP-18) ; litige complet et reversement non livrés.
5. Avis de service au client sans transport (P14B : traces lues ; DP-39) ; aucun avis à
   l'expiration d'un créneau retenu.

## 7. Version D — la continuité sur téléphone réel

**Capacités visées** : application native ANTSIA, appels entrants écran verrouillé et application
fermée, notifications ciblées, faible connectivité, parité des parcours.

**État** : audit documentaire seulement (P17a). Aucun client natif dans `apps/`. Écarts moteur
confirmés : push d'appel APNs `alert`, FCM avec bloc `notification`, budget social appliqué aux
appels, aucune annulation poussée (P17a §4.4). Douze contrats manquants (M1–M12).

**Bloquants** : décisions D1–D8 de P17a (DP-26 à DP-33) ; comptes Apple, Google, Firebase ; au moins
un iPhone et un Android physique avec services Google (PR-06) ; P04 et P05 vérifiés ; place disque.
Aucune promesse native ne peut figurer dans le pilote.

## 8. Recommandation pour la version du premier pilote

Proposition soumise au propriétaire (DP-02), fondée sur l'état ci-dessus :

1. **Premier pilote : version A**, sur le réseau racine ANTSIA, après gel, `verify` vert et recette
   des parcours A ([03](03_PARCOURS_DE_RECETTE.md)). Toutes les politiques commerciales restent
   fermées ; les surfaces commerciales que rien ne ferme sont tranchées par DP-38.
2. **Ensuite : version B restreinte** à des vitrines admises une par une (`review`), une fois DP-04,
   DP-05 et PR-01 tranchés et la recette croisée jouée.
3. **Puis C sans paiement** : services, emploi et préparation avec libération, chacun derrière sa
   politique fermée par défaut.
4. **Paiement** : seulement après DP-10 à DP-14, un adaptateur réel écrit et prouvé en sandbox, puis
   une demande explicite. Aucun encaissement réel dans le pilote.
5. **D** : hors du pilote tant que P17b à P17d ne sont pas prouvées sur appareils physiques.

La conversation contextuelle ne concerne pas le réseau racine en V1 : ses trois natures sont
DIASPORALE (`diasporaServiceRequest`, `diasporaMentoring`, `diasporaJobApplication`). Sa recette
appartient au pilote DIASPORALE, avec la session DIASPORALE.
