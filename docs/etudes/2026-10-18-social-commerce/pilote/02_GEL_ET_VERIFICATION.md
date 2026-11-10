# 02 — Procédure de gel et de vérification (à exécuter après levée de la décision)

> **20 octobre 2026 — procédure différée, aucune commande exécutée.** La poursuite des lots
> P17d/P18/P19 n’autorise pas les vérifications. `c4d36f3` est un repère de source, avec un
> arbre partagé non gelé ; aucun inventaire avant/après ni nouvelle empreinte n’est produit.
> Les commandes, chiffres et listes ci-dessous restent la procédure et les constats historiques
> du 19 octobre, à relire sur les instructions et scripts courants avant une future passe autorisée.

### Correctifs P19 poursuivis automatiquement le 20 octobre

Le [rapport des correctifs](../rapports/P19_CORRECTIFS_AUTOMATIQUES_2026-10-20.md) complète les
relevés historiques ci-dessous : il ne remplace aucun résultat de vérification par une lecture.

| Point historique | État source de cette reprise | Preuve encore attendue |
|---|---|---|
| K-06 / DP-34 | `authVerifiedAt` fondé sur `authorizedAt` déjà présent dans les deux transports relus | Scénarios/session/transport sur source identifiée |
| K-12 / AC03 | Annonces stables achats détaillés et candidatures, liste et fiche individuelle, FR/EN | Tests écrits non exécutés ; lecteur d'écran réel non essayé |
| K-13 / AC04 / K-21 | Horloge relue ; rayon de portrait déjà adapté au type d'auteur ; index ADR déjà complété | Pas de nouvelle recette ni de conformité supposée |
| K-16 / AC08 | Routes machine réellement inscrites distinguées des propositions génériques dans OpenAPI | Validation documentaire et recette HTTP différées |
| CV après interruption | Réservation durable, marqueur exact, bail et reprise ciblée raccordés, gate fermé | MIME réel, concurrence, interruption, pagination et reprise à éprouver ; historique non marqué hors preuve |
| DP-39 | Suite source par contrat/profil privé de signal de relecture ; [rapport dédié](../rapports/P19_AVIS_SERVICES_2026-10-20.md) | Configuration explicite et preuves de transport/avis non acquises |

Les chiffres K-02, K-08 et K-15 restent historiques ; aucune génération ou suite n'a été
relancée pour les actualiser. Les sources de DIASPORALE restent à sa session. L'enchaînement
des corrections n'autorise ni gel effectif, ni activation, ni publication.

### Complément de périmètre pour le futur gel

Inclure les reprises P14/P15/P16, le client `apps/antsia_mobile`, `packages/social-native`,
les jetons natifs et la chaîne d’appels P17c, puis les corrections P18 natives raccordées.
Le gel doit être coordonné avec les sessions effectivement actives à ce moment-là, dont
DIASPORALE ; la liste de sessions du 19 octobre n’en tient pas lieu. Ne pas arrêter un service
ni reprendre une installation sur la seule foi de cette procédure historique.

- Le lockfile natif n’a pas été actualisé dans P17b/c ; l’installation unique, la compatibilité
  Expo/React Native/LiveKit et les étapes natives demandent leur propre autorisation et résultat.
- La liste historique des huit jumeaux et les anciens totaux de tests, tables ou crons ne sont
  pas réaffirmés comme complets. Aucun hash ni audit de parité n’a été relancé ici.
- Les corrections K-04/K-07/K-19/K-20 sont décrites en source par les
  [finitions du 19 octobre](../rapports/FINITIONS_TECHNIQUES.md) ; cela ne les rend pas testées.
  P14/P15/P16 modifient depuis les gardes et la reprise ; une ligne historique K ne donne
  ni échec actuel observé ni succès actuel.
- Les registres fermés P16 font partie de la candidate. Un test métier utilisant un double
  contrôlé n’autorise pas à les ouvrir dans le runtime pour faciliter la recette.
- P17d est une [recette physique séparée](../../../recette/antsia-native-p17d/README.md).
  Un registre déclaré complet, une compilation ou un simulateur ne prouve pas le rendu sur
  iPhone/Android, la réception verrouillée, la fin des captures ou les budgets P18.

La [reprise P19](../rapports/P19_REPRISE_2026-10-20.md) ne constate ni l’état disque/Node actuel,
ni des erreurs de typage actuelles, ni l’absence de processus actifs. Ces points restent à
relever au futur créneau autorisé, sans réutiliser les mesures anciennes comme seuils acquis.

## Procédure historique du 19 octobre (conservée)

19 octobre 2026, lot P19. **Rien de ce document n'a été exécuté.** La procédure s'applique dès que
le propriétaire lève, par une demande explicite, sa décision du 18/10 « Continuer sans vérifier »
(DP-01). Elle est conduite par le coordinateur seul, selon les règles de la table de réservation
([EXECUTION.md](../EXECUTION.md)) et du préambule ([PROMPT_COMMUN §9–§10](../prompts/PROMPT_COMMUN.md)).

Ordre général : **corriger les défauts connus → annoncer → geler → générer → typer → tester ciblé →
suites → cliquets → espaces de travail → `verify` → PRO.GA → contrôle croisé → inventaire après**.
Un seul `verify` à la fois, aucune passe concurrente, aucun serveur pendant la passe.

## 1. Préalables

| # | Préalable | Constat au 19/10, 01 h 37 | Responsable |
|---|---|---|---|
| G-1 | Demande explicite levant « Continuer sans vérifier », citée mot pour mot dans EXECUTION.md, avec son périmètre (ANTSIA, PRO.GA, DIASPORALE par le `verify` ANTSIA) | absente | propriétaire |
| G-2 | Fin d'écriture déclarée par chaque session de l'arbre : CC, P14B, DIASPORALE, travail de thèmes au choix, PA9/PA10 si actives, P19 | écritures relevées jusqu'à 02 h 11, dont sept thèmes `antsia-<thème>.css` non inscrits dans EXECUTION.md | coordinateur |
| G-3 | Défauts connus « à corriger d'abord » traités par leurs propriétaires (§6, K-01 à K-08) | K-04 et K-07 corrigés dans les sources (non exécuté) ; K-06 en décision (DP-34) | propriétaires de lots, coordinateur |
| G-4 | Espace disque suffisant, seuil fixé par le coordinateur | **4,3 Gio libres, 98 % occupés** ; 118 Mo avaient bloqué le 14/10 ; le binaire du backend local pèse environ 164 Mo | propriétaire (machine) |
| G-5 | Node accepté par le backend local pour les actions `"use node"` | Node par défaut **v25.9.0** (refusé) ; `/opt/homebrew/opt/node@22/bin` présent ; `node@24` et `node@20` absents | coordinateur |
| G-6 | Aucun `convex dev` ni serveur Next en cours (ports 3210, 3220/3221, 3022, 3030, 3031, 3032) | `convex dev` arrêté le 18/10 à 21 h 50 (EXECUTION.md) ; à reconstater | coordinateur |
| G-7 | Annonce du gel quinze minutes avant à toutes les sessions (règle « verify commun piloté par le coordinateur, annoncé 15 min avant ») | — | coordinateur |

## 2. Gel et inventaire « avant »

Depuis chaque racine (les chemins contiennent des espaces : guillemets obligatoires).

```bash
cd "/Users/okatech/okatech-projects/Digital GABON/DIGITAL_GOUV/NTSAGUI_DIGITAL/ECOSYSTEMES/ANTSIA"
git rev-parse HEAD
git branch --show-current
git status --porcelain=v1 | wc -l
git status --porcelain=v1 -z | shasum -a 256                                  # liste des entrées
git diff --binary HEAD -- . ':(exclude)convex/_generated' | shasum -a 256     # contenu suivi
git ls-files -o --exclude-standard -z | sort -z | xargs -0 shasum -a 256 | shasum -a 256   # contenu non suivi
```

Répéter dans `../PRO_GA` et `../DIASPORALE`. `git status --porcelain | shasum` (proposé par P18A §4.6)
ne voit pas une nouvelle modification d'un fichier déjà modifié : les deux empreintes de contenu
ci-dessus la voient. `convex/_generated/**` est suivi dans les deux dépôts et réécrit par la
génération ; il est exclu de l'empreinte de contenu et constaté à part après `codegen`.

Relevé de référence pris en lecture pour ce dossier (il bouge tant que des sessions écrivent) :

| Dépôt | Branche | HEAD | Entrées `git status` |
|---|---|---|---|
| ANTSIA | `codex/pa4-identite-session` | `9eaff40` (18/10/2026 13:06) | 602 à 01 h 37 (244 modifiées, 358 non suivies) ; 618 à 02 h 12 |
| PRO.GA | `feat/antsia-social-commerce` | `9497f22` (19/09/2026) | 187 |

Les empreintes des contrats jumeaux sont relevées au même moment
([07 §7](07_DOSSIER_DE_DECISION.md)). Le gel interdit toute écriture dans les trois arbres jusqu'à
l'inventaire « après ».

## 3. ANTSIA — ordre des commandes

Depuis la racine ANTSIA. Le lanceur `scripts/convex-dev.mjs` met lui-même un Node accepté en tête
du PATH : aucun préfixe à ajouter.

```bash
# 3.1 Génération (lanceur officiel ; démarre un backend local éphémère si aucun convex dev ne tourne)
bun run codegen
git status --porcelain=v1 -- convex/_generated            # constater ce que la génération a réécrit

# 3.2 Typage : moteur, puis tests
bun run typecheck:convex
bun run typecheck:tests

# 3.3 Domaine pur et contrats jumeaux (P06 à P15)
bun run test:domain

# 3.4 Tests Convex ciblés, dans l'ordre des dépendances (toujours avec la configuration Convex)
bunx vitest run --config convex/vitest.config.ts modules/shops/shops modules/people/shop-data-policy
bunx vitest run --config convex/vitest.config.ts modules/shops/commerceLinks modules/federation/commerceTransport modules/people/commerce-link-data-policy
bunx vitest run --config convex/vitest.config.ts modules/shops/catalog modules/federation/commerceCatalogClient
bunx vitest run --config convex/vitest.config.ts modules/commercialMessaging
bunx vitest run --config convex/vitest.config.ts modules/shops/checkout modules/people/checkout-data-policy
bunx vitest run --config convex/vitest.config.ts modules/shops/paymentFlow modules/shops/paymentClient modules/shops/paymentPolicy modules/people/paymentErasure
bunx vitest run --config convex/vitest.config.ts modules/shops/purchase
bunx vitest run --config convex/vitest.config.ts modules/shops/services modules/shops/serviceErasureNotice
bunx vitest run --config convex/vitest.config.ts modules/shops/jobs modules/shops/jobApplications
bunx vitest run --config convex/vitest.config.ts modules/people modules/moderation modules/notifications
bunx vitest run --config convex/vitest.config.ts modules/messaging modules/groups modules/calls modules/posts modules/public modules/pages modules/federation
bunx vitest run --config convex/vitest.config.ts modules/contextualMessaging modules/diaspora

# 3.5 Suites complètes du moteur, cliquets, scripts
bun run test:convex
bun run test:ratchets
bun run test:scripts

# 3.6 Espaces de travail (ANTSIA et DIASPORALE), une tâche à la fois
node scripts/workspace-run.mjs typecheck --concurrency=1
node scripts/workspace-run.mjs test --concurrency=1
node scripts/workspace-run.mjs lint --concurrency=1

# 3.7 Vérification officielle unique, sur la même source gelée : c'est elle qui fait preuve
bun run verify
```

Ce qu'il faut savoir avant de lancer :

- **Échecs attendus au premier passage.** Le 18/10 à 21 h 50, le backend local refusait toute
  poussée ; après deux corrections, il restait **110 erreurs de type Convex**, avec des types
  générés périmés. P14, P15, P16, P18b, CC et P14B ont écrit depuis. Le premier passage est une
  boucle de corrections (§5), pas une formalité.
- `codegen` et un `convex dev` simultanés rendent `409 ExistingModuleHashConflict` : attendre
  « Convex functions ready » puis relancer (`CLAUDE.md` ANTSIA).
- Identifiants de cron : ASCII seulement, sinon tout le déploiement échoue. Relevé en lecture :
  34 identifiants dans `convex/crons.ts`, aucun caractère non ASCII, aucun doublon ; le cliquet
  `crons-contract` en reste juge.
- Cliquets les plus exposés : `network-scoped-functions` (modules `shops`, `commercialMessaging`,
  `contextualMessaging`), `rate-limited-writes` (proxy média P09 et admission
  `agentConsentTransfer` modifiés par P16 et le coordinateur), `operator-audit`, `crons-contract`,
  `notification-payload-content`, `notifications-writer`, `i18n-locales`, `provenance-headers`,
  `theme-contract` (jeton `--esp-sticky-header-inset` ajouté par P18b), `contextual-registry`,
  `contextual-hooks`.
- `bun run build:antsia` n'appartient pas à `verify`. Il n'est lancé que si P18b mesure les budgets,
  sans publication, et seulement si l'espace disque le permet.

## 4. PRO.GA — ses propres scripts

PRO.GA suit ses instructions (`../PRO_GA/AGENTS.md` : « `bun run codegen` AVANT tout typecheck ou
test » ; « `bun run verify` doit être vert avant tout commit »). Son `codegen` est
`bunx convex codegen`, **sans lanceur** : le dépôt contient sept fichiers `"use node"`
(`convex/lib/pro/livekit.ts`, `modules/idirect/livekit.ts`, `modules/icom/livekit.ts`,
`modules/network/livekit.ts`, `modules/iasted/personalRealtime.ts`,
`modules/iasted/structureRealtime.ts`, `modules/imemoire/embeddings.ts`) et son `.env.local` pointe
le déploiement local anonyme (`:3220`). Reprendre l'environnement de la configuration
`pro-ga-convex-local` de `.claude/launch.json` : Node 22 en tête du PATH et
`CONVEX_AGENT_MODE=anonymous`. Effet exact sur `codegen` à confirmer au premier passage.

```bash
cd "/Users/okatech/okatech-projects/Digital GABON/DIGITAL_GOUV/NTSAGUI_DIGITAL/ECOSYSTEMES/PRO_GA"
export PATH="/opt/homebrew/opt/node@22/bin:$HOME/.bun/bin:$PATH" CONVEX_AGENT_MODE=anonymous
node --version                                  # 22.x attendu

bun run codegen
bun run typecheck:convex
bun run test:domain                             # conformance P06 (lit aussi la copie ../ANTSIA), parité, LINK, registres, services, emploi, marketplace

bunx vitest run --config convex/vitest.config.ts modules/integrations/commerceLinks modules/integrations/commerceOutbox modules/integrations/commercePublicTransport
bunx vitest run --config convex/vitest.config.ts modules/integrations/commerceCatalogue modules/catalog
bunx vitest run --config convex/vitest.config.ts modules/integrations/commerceInquiry
bunx vitest run --config convex/vitest.config.ts modules/integrations/commerceCheckout modules/inventory
bunx vitest run --config convex/vitest.config.ts modules/integrations/commercePayment modules/payments
bunx vitest run --config convex/vitest.config.ts modules/integrations/commerceOrder modules/orders
bunx vitest run --config convex/vitest.config.ts modules/integrations/commerceServices modules/agenda modules/quotes
bunx vitest run --config convex/vitest.config.ts modules/integrations/commerceJobs modules/recruiting
bunx vitest run --config convex/vitest.config.ts tests/domainBoundary tests/vAnyRatchet tests/chaineCommerciale

bun run test
bun run verify                                   # codegen + typecheck:convex + test + turbo typecheck/test/lint
```

Attendus connus : `tests/domainBoundary` devrait échouer tant que K-04 est ouvert (P16 §9.2) ; les
références `convex/_generated` de PRO.GA n'ont jamais été régénérées pour P08–P15.

## 5. Contrôle croisé, classement des échecs, inventaire « après »

**Contrats jumeaux** (depuis `ECOSYSTEMES/`) :

```bash
for f in commerce-link.ts commerce-catalogue.ts commerce-inquiry.ts commerce-checkout.ts commerce-payment.ts commerce-orders.ts commerce-services.ts commerce-jobs.ts; do
  cmp "ANTSIA/packages/social-domain/src/$f" "PRO_GA/packages/pro-domain/src/$f" || echo "ÉCART $f"
done
cmp ANTSIA/packages/social-domain/src/commerce/fixtures/MANIFEST.json PRO_GA/packages/pro-domain/src/commerce/fixtures/MANIFEST.json
```

La preuve de parité reste celle des tests de conformité des deux dépôts, pas `cmp`.

**Boucle de corrections.** Chaque échec est classé (génération, typage, test, cliquet, lint) et
attribué au propriétaire du lot selon EXECUTION.md. Le gel est levé **pour les seuls fichiers de
ce lot**, la correction faite, puis l'étape ciblée rejouée avant le `verify` complet. Un défaut
dans un fichier d'une autre session lui est rendu, jamais corrigé à sa place. Aucun test n'est
désactivé et aucun cliquet n'est assoupli sans décision consignée.

**Source qui bouge pendant la passe.** Comparer les empreintes « avant » et « après ». Si elles
diffèrent hors de `convex/_generated/**`, la passe est requalifiée (« source modifiée pendant la
vérification ») et relancée une fois la source stabilisée. Aucune passe concurrente.

## 6. Défauts déjà connus

Sources : coordinateur (EXECUTION.md), P14, P16 §9, P18A, P15, P02, P06, P04 et relevés de
lecture P19. « Corrigé » signifie corrigé dans les sources, **jamais compilé**.

| N° | Défaut | Source | État | À faire et quand |
|---|---|---|---|---|
| K-01 | Neuf imports de `COMMERCE_COMMAND_CONTRACT` vers `commerce/command` au lieu de `commerce/primitives` (`shops`, `commercialMessaging`) ; appel variadique de `literals` (`events/events.ts:506-507`) | coordinateur, 18/10 21 h 50 | corrigé | constater au `codegen` (3.1) |
| K-02 | 110 erreurs de type Convex, types générés périmés | coordinateur, 18/10 21 h 50 | ouvert | attendu à 3.2 ; correction par lot |
| K-03 | `CommerceResult<T>` à un paramètre, `commerce-checkout.ts:47` et `:98`, deux copies | P16 §9.1, P14 | corrigé (`CommerceResult<…, string>`) ; copies identiques (empreinte `51c71154…`) | constater au typage des deux dépôts |
| K-04 | `PRO_GA/convex/http.ts` importe des modules : le type `CommerceMediaTicket` (corrigé) et deux `httpAction` (`payments/commercePaymentEvidence#providerCallback`, `integrations/commerceApplicationFiles#uploadApplicationFile`) | P16 §9.2, coordinateur | **ouvert** pour les deux `httpAction` | **avant le gel** : routes génériques dans `http.ts`, lecture bornée des en-têtes et des octets, appel par `makeFunctionReference` d'une action interne (`receiveCallback` existe ; action d'admission des pièces à créer) ; test de frontière exécuté au gel — **corrigé dans les sources, non exécuté** (lot finitions, 19/10, [rapport](../rapports/FINITIONS_TECHNIQUES.md)) |
| K-05 | `federation/agentConsentTransfer.ts#transfer` absent de `SYSTEM_HTTP_ADMISSIONS` | P16 §9.3 | corrigé dans `tests/ratchets/rate-limited-writes.test.ts` (admis par `agentConsentTransfer.redeem`) | constater aux cliquets |
| K-06 | Consultations `request.status` de fond (P10 `crmTransport.ts`, P15 `statusJob`) déclarant `authVerifiedAt: now` sans relire de session | P16 §9.4, coordinateur | **décision de contrat** | DP-34 avant tout code |
| K-07 | `packages/social-domain/src/commerce/compatibility.test.ts` affirme qu'aucun contrat commercial n'est appliqué, alors que P09 et P15 l'appliquent | P06 §6.3, P15, P16 §9.5 | **ouvert** | **avant le gel** : mettre l'assertion à jour (fichier hors manifeste, aucune révision jumelle) — **corrigé dans les sources, non exécuté** (lot finitions, 19/10, [rapport](../rapports/FINITIONS_TECHNIQUES.md)) |
| K-08 | Nouvelles références d'API (P07–P16, CC) jamais générées ; aucun `_generated` édité à la main | P07–P16 | ouvert | `codegen` (3.1 et §4) |
| K-09 | Aucune cloche pour un devis reçu ou un rendez-vous confirmé ; commandes de service absentes de Mes achats | P14 | traité par P14B (non vérifié) : treize genres d'avis, section « Prestations sans paiement en ligne ». Reste : avis client en trace lue sans transport, aucun avis à l'expiration d'un créneau | DP-39 ; tests P14B au gel |
| K-10 | L'effacement n'annule pas les rendez-vous chez PRO.GA | P14, P16 §4 | avertissement C5 écrit | DP-18 ; procédure support |
| K-11 | Bloquants A01 (menu « ⋯ ») et A02 (bulles) | P18A, P18b | corrigés, non prouvés | tests P18b en priorité, puis recette clavier et lecteur d'écran |
| K-12 | A18 (annonce des changements d'état) ouvert pour `purchases/purchase-card.tsx` et `jobs/my-applications-screen.tsx` | P18b | ouvert | avant la recette C |
| K-13 | `use-checkout-clock.ts` réécrit en entier au lieu d'une édition ancrée | P18b (écart déclaré) | à relire | relecture du diff au gel |
| K-14 | Côté DIASPORALE : région des toasts sous modale (A07) et palette au survol (A11) | P18b | ouvert | session DIASPORALE |
| K-15 | DIASPORALE : cinq échecs préexistants (`settings-screen.test.tsx`) et trois au cliquet `i18n-keys` | P02 §4 (18/10) | à reconfirmer | attribuer à la session DIASPORALE ; acceptation explicite si maintenus |
| K-16 | OpenAPI du profil machine PRO.GA (`docs/api/openapi.yaml`) non aligné sur le code ; correction prévue « en P08 », non mentionnée par le rapport P08 | P06, PRO.GA docs/18 §3.3 | inconnu | constater |
| K-17 | P04 dépend de `PostMediaPresentation.tsx` (P03, non suivi) et des champs PA10 de `myFeed` | P04 §7, §9 | dépendance | geler et livrer ensemble |
| K-18 | CC : aucun fichier de test dans `convex/modules/contextualMessaging/` au relevé de 01 h 35, alors qu'ADR-0025 annonce des tests écrits | relevé P19 | levé à 02 h 15 : `contextualMessaging.test.ts` présent (moteur et domaine), non exécuté | inclure ces tests à 3.4 |
| K-19 | Aucune interface de console pour les politiques P07 (vitrines), P09 (catalogue, mapping), P11 (préparation) et CC | relevé P19 | ouvert | écran de console (lot) ou procédure opérateur autorisée ([05](05_ACTIVATION_ET_RETOUR_ARRIERE.md)) — **corrigé dans les sources, non exécuté** (lot finitions, 19/10, [rapport](../rapports/FINITIONS_TECHNIQUES.md)) |
| K-20 | Aucune porte de relance d'une lettre morte de l'outbox d'intégration PRO.GA relevée ; l'administration liste et désactive seulement | relevé P19 | à confirmer | voie actuelle : réconciliation par pages P09 ([support](guides/PROCEDURES_SUPPORT.md)) — **corrigé dans les sources, non exécuté** (lot finitions, 19/10, [rapport](../rapports/FINITIONS_TECHNIQUES.md)) |
| K-21 | Index `docs/adr/README.md` sans 0017, 0018, 0019 ni 0024 | relevé P19 | ouvert | coordinateur (documentaire) |

## 7. Coordination avec la session DIASPORALE

- **Un seul `verify`.** DIASPORALE n'a pas de vérification propre : son `CLAUDE.md` prescrit
  `bun run --cwd ../ANTSIA verify`. Ses applications et paquets sont des espaces de travail du
  moteur (`../DIASPORALE/apps/*`, `../DIASPORALE/packages/*`) et sa tranche backend vit dans
  `convex/modules/diaspora/`. Le `verify` ANTSIA couvre donc les deux produits ; une seule
  installation (`bun install` dans ANTSIA, jamais dans DIASPORALE).
- **Gel commun.** La session DIASPORALE déclare sa fin d'écriture dans `../DIASPORALE`,
  `convex/modules/diaspora/**`, `packages/ui/src/themes/diasporale.css` et ses locales
  `diaspora.json`, ainsi que ses écritures déléguées (`rateLimit.ts`, `crons.ts`, `dataPolicies.ts`,
  `dataInventory.ts`, `notifications/*`, `people/erasure.ts`). Elle ne lance aucun `verify` pendant
  la passe commune.
- **Échecs DIASPORALE.** Rendus à sa session ; le coordinateur ne les corrige pas. Les échecs
  préexistants (K-15) sont reconfirmés puis acceptés explicitement ou corrigés.
- **Parité.** La refonte ne doit rien changer chez DIASPORALE : la passe vérifie ses suites
  (consommateurs de la coque, du thème, des contrats de communication) et, en recette, son rendu
  clair et sombre sur `:3031`.
- **Conversation contextuelle.** Les sous-lots CC-3a et CC-3b (tranche DIASPORALE) entrent dans le
  même gel que CC-1/2a/2b (moteur).

## 8. Critères de sortie

| # | Critère |
|---|---|
| S-1 | `bun run verify` ANTSIA terminé en succès sur source gelée ; empreintes « avant » = « après » hors `convex/_generated/**` |
| S-2 | `bun run verify` PRO.GA terminé en succès dans les mêmes conditions |
| S-3 | Huit modules jumeaux et manifeste P06 identiques octet pour octet ; tests de conformité verts dans les deux dépôts |
| S-4 | Aucun test désactivé (`.skip`, `.only`, `todo`) ni cliquet assoupli depuis `9eaff40` et `9497f22` sans décision consignée |
| S-5 | Zéro échec préexistant, ou chacun attribué et accepté explicitement par le propriétaire |
| S-6 | Fichiers générés produits par `codegen` seulement |
| S-7 | Rapport de passe : commandes, nombres de fichiers et de tests, durées, Node et Bun, disque, HEAD et empreintes ; verdict « testé automatiquement » accordé seulement aux lots dont les tests ont tourné en vert |
| S-8 | Aucun verdict « observé en recette » tiré de la passe : il exige les parcours de [03](03_PARCOURS_DE_RECETTE.md) |

Après la sortie : commits par chemins (`git commit -- <chemins>`) par le coordinateur, sans
`git add -A`, sans changement de branche tant que plusieurs sessions écrivent. **Aucun push, merge,
déploiement ni commande vers une production sans demande humaine explicite** (préambule §4, prompt
P19, `CLAUDE.md` ANTSIA).
