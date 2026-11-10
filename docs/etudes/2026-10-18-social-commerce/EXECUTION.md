# Exécution coordonnée de l'étude — journal du coordinateur

Demande du propriétaire, 18/10/2026 : « Implémente en utilisant des agents simultanés et
coordonnés ». Ce fichier est la **table de réservation** des lots en cours : qui écrit quoi,
quels fichiers sont interdits, quel est l'état prouvé. Il est tenu par le coordinateur seul.

## Correctifs P19 automatiques — 20 octobre 2026, sources raccordées

Demande : poursuivre les correctifs ouverts, puis leurs suites, sans nouvel accord et sans
relancer les vérifications. Les écritures restent dans les sources réellement utilisées ;
aucun gel, contrôle, serveur, recette, installation, activation ou publication n'est autorisé
par cette reprise. Repères relus : ANTSIA `c4d36f3`, PRO.GA `fa349ea`, arbres partagés non gelés.

| Responsable | Réservation précise | Limites |
|---|---|---|
| `etat_boutiques` | K-12/AC03 : `purchase-card.tsx`, `my-applications-screen.tsx`, petit hook d'annonce et scénarios locaux | Pas de garde métier/session modifiée ; aucun contrôle exécuté |
| `relais_claude` | CV : `commerceApplicationFiles.ts`, `commerceApplications.ts`, `commerceJobTables.ts`, nouveau staging et scénarios dans PRO.GA | Admission durable, récupération des seuls marqueurs connus ; gate CV fermée ; pas de purge réelle |
| `p03_cartes_connectees` | K-16 : `PRO_GA/docs/api/openapi.yaml` et rapport documentaire dédié | Décrire les routes existantes, sans ajouter de route ni annoncer une conformité testée |
| Coordinateur | Traductions FR/EN achats/candidatures, raccords partagés strictement nécessaires, dossier P19 et index | Préserver SSO, thèmes, médias, messagerie commerciale et DIASPORALE de l'autre session |

K-06/DP-34 et K-21 sont déjà présents dans les sources relues ; AC04 utilise déjà le rayon
de portrait selon l'auteur. K-13 conserve ses échéances bornées et ses reprises au focus.
Ces lectures ne sont pas une nouvelle validation. Les constats et chiffres historiques restent
datés ; les verdicts de cette reprise demeurent source seulement.

### Suite DP-39 — avis privé de suivi, sources raccordées

La demande d'enchaîner les suites autorise la tranche source suivante. Le choix est un **signal
neutre de relecture**, par contrat `PRO-COMMERCE-SERVICE-NOTICE-V1` et profil distinct
`antsia-commerce-service-notice-v1`. Il ne porte ni snapshot, état métier, nom, montant ou
preuve de session. L'avis ouvre le suivi existant ; seule sa relecture authentifiée fait
autorité. Aucune destination PUBLIC n'est élargie et aucune configuration réelle n'est créée.

- Coordinateur : nouveau contrat pur jumeau hors manifeste P06, tests contractuels écrits,
  export PRO.GA, rapport et documentation du pilote.
- `etat_boutiques` : PRO.GA, producteurs agenda/devis/commandes via leurs `_deps`, nouveau
  `integrations/commerceServiceNotices.ts`, profil/configuration/outbox/dispatch et ancre
  `serviceNoticeSource` dans `integrations/tables.ts`. Exclusion du namespace de clé notice
  dans `commerceConfig.ts`. `commerceServiceTables.ts` pour les seuls index nécessaires.
- `p03_cartes_connectees` : ANTSIA, admission fédérée privée, corrélation d'une demande
  existante, déduplication privée, gardes et avis générique, dictionnaires FR/EN et
  `social-features/.../notifications/notification-targets.ts`. Inventaire/export/effacement
  de la nouvelle table, sans contenu étranger.

Les fichiers CV PRO.GA restent chez `relais_claude`. Les snapshots métier, horloges de fraîcheur,
actions, politiques P16, SSO, thèmes, médias, messagerie et DIASPORALE restent hors de cette suite.

**Passation de source :** K-12/AC03, K-16/AC08 et reprise durable CV raccordés, puis DP-39
enchaîné dans les deux produits. Tous les périmètres de sous-tâches ci-dessus sont libérés.
Exception ciblée aux horloges PRO.GA : les révisions des seules transitions devis/commande
touchées deviennent strictement croissantes ; aucune échéance ni fraîcheur ANTSIA ne change.
Les scénarios sont écrits seulement. Aucun contrôle, configuration réelle, activation ou Git
write. La preuve MIME/backend, les vérifications, la conservation générale, les décisions
métier et les preuves physiques restent ouvertes : P19 n'est pas déclaré terminé ou admissible.

Passation : [correctifs automatiques P19](rapports/P19_CORRECTIFS_AUTOMATIQUES_2026-10-20.md).

## Relais Codex — 18 octobre 2026

Demande du propriétaire : continuer le plan et reprendre la session Claude ANTSIA. Archive
`b8c43fef-d43d-497e-8cf8-7e62e92a3958` confrontée aux sources : interruption sur limite de
session pendant P03, P05 et P07 ; P04/P08 non commencés. P00/P01/P02/P06 disposent déjà de
rapports. Les résultats historiques ci-dessous ne sont pas de nouvelles vérifications.

La première reprise traite **P03**, en conservant les amorces P05/P07 et le périmètre PA9A d'une autre
conversation. Réservations du relais : cartes connectées et leurs clés FR/EN ; carte publique
SSR et lecteur média ; continuation de connexion fermée sur la publication ; rapport P03.
Les cinq fichiers du pont de session restent gelés. À la demande humaine précédente,
**aucun test, codegen, typage, lint, build, recette navigateur ou déploiement n'est relancé**.
Un statut « source raccordée » ne vaut donc pas clôture de la recette P03.

### Reprise P05 — demande suivante du propriétaire

« Continue le lot iCom (P05) à partir du travail de Claude, sans relancer les vérifications. »
Sources raccordées par trois tâches coordonnées (vues/listes, envois, appels) et intégration
des notifications : trois vues, bureau liste/détail, mémoire de retour, intentions idempotentes,
états d'appel issus de la salle, porte de notification avec relecture de session et de droits.
Les extensions serveur sont limitées à l'envoi et à l'ouverture d'un avis ; aucun schéma nouveau.
Le lien Messages du rail mène désormais à la page complète. P03 et PA9B sont préservés.
Tests écrits/étendus **sans exécution** ; vérification et recette P05 ouvertes.
Rapport : [P05_ICOM.md](rapports/P05_ICOM.md). P07 est repris par la demande suivante ci-dessous ;
P04/P08 ne sont pas exécutés ici.

### Reprise P07 — demande suivante du propriétaire

« Continue le lot boutiques (P07) à partir du travail de Claude, sans relancer les vérifications. »

Sources raccordées par trois tâches coordonnées (moteur, éditeur membre, public/découverte) :
brouillons pour membres déclarés, pages admissibles relues, parcours en quatre étapes,
logo gardé, consentement versionné et révocable, demandes/annulation/retrait, vitrines membre
et publique et annuaire paginé depuis Découvrir. Profil ouvre la gestion des boutiques.
La projection SSR réutilise la décision de session existante, sans repli anonyme sur refus.
L'export d'une boutique de page se limite aux traces personnelles du demandeur ; un ancien
préparateur n'obtient plus son état commercial actuel. Le module est classé social dans le cliquet.

**Politique `closed` par défaut conservée**, aucune activation ni vente simulée. Aucun compte,
catalogue ou lien PRO.GA n'est créé ; P08/P09 et les lots de vente restent séparés. Les nouveaux
tests et les adaptations d'assertions sont écrits **sans exécution**. La génération officielle
de la nouvelle référence `modules/public/shops`, les contrôles et la recette restent ouverts.
Aucun serveur, navigateur, commande Convex, commit ou déploiement lancé pour cette reprise.
Rapport : [P07_BOUTIQUES.md](rapports/P07_BOUTIQUES.md). P03/P05 et les travaux PA9 sont préservés.

### Reprise P08 — liaison et transport

Demande du propriétaire : « Continue le lot liaison et transport (P08) entre ANTSIA et PRO.GA,
sans relancer les vérifications. » Deux sous-tranches : double preuve d'abord, transport ensuite.

La liaison est raccordée dans les deux sources : préparation signée LINK/PKCE, accord ANTSIA,
connexion réelle PRO.GA et choix de structure, tâches effectives, code unique, confirmation
COMMAND atomique et réponse idempotente ; retour fermé, lecture de session avant/après HTTP,
révocation locale et inventaire d'effacement/export. Les jumeaux P06 et leur manifeste restent
intacts ; le nouveau contrat LINK est dans un module pur distinct.

La réception ANTSIA ajoute corrélation du reçu et distinction received/applied/rejected,
validation canonique PUBLIC et preuve de recette strictement sandbox. Le catalogue PUBLIC
reste sans handler P09 ; un 202/dead_letter ne prouve aucune projection. Le raccord sortant
PRO.GA réutilise sa fondation d'outbox, avec octets figés et profil/signature distincts.

**Aucune vérification ni recette relancée** : tests écrits seulement, références API à générer
normalement, configuration et échange réel non prouvés. Aucun service, donnée de recette,
secret, environnement, commit ou déploiement manipulé. Le lot n'active ni vitrine, ni catalogue,
ni vente. Rapport : [P08_LIAISON_TRANSPORT.md](rapports/P08_LIAISON_TRANSPORT.md).

### Reprise P09 — catalogue entre produits

Demande suivante du propriétaire : « Continue le lot catalogue (P09) entre ANTSIA et PRO.GA,
sans relancer les vérifications. » Le travail suit P08 sans reconfiguration ni recette réelle.

Réservations : producteurs/snapshots/consentements et parcours PRO.GA ; réception et projections
catalogue ANTSIA ; catalogue/fiches/slots et parcours de gestion ; coordinateur pour contrat
privé jumeau hors manifeste P06, actions de réconciliation/import média, association à un post,
inventaire/modération et raccords partagés. Les cinq fichiers session-bridge restent gelés.
Les sources PA9 et les ajouts PA10 d'une autre conversation sont préservés par ancres et
coordination ; `posts/posts.ts` reste chez PA10 (seul marqueur optionnel d'offre demandé).

**État : sources raccordées dans les deux produits ; tests écrits, non exécutés.** Génération API,
configuration et recette interproduits restent ouvertes ; aucune preuve d'effet réel,
publication ou encaissement. Rapport : [P09_CATALOGUE.md](rapports/P09_CATALOGUE.md).

PRO.GA possède les snapshots commerciaux cohérents et les vrais producteurs ; les mutations
de consentement sont branchées à sa fiche d'offre. ANTSIA applique PUBLIC sous mapping fermé,
révisions/tombes, publie les DTO de catalogue/fiches et rejuge les slots des publications.
Les médias passent par un échange serveur privé, une copie admise sous FullAV et un proxy
dont les anciennes URLs se ferment au retrait. Le rattrapage manuel par pages reste distinct
de l'application distante ; la reprise des attentes PRO.GA est persistée et bornée.
Les équipes ont libéré leurs réservations P09. La demande P10 suivante est décrite ci-dessous.

### Reprise P10 — contact commercial avec PRO.GA

Demande du propriétaire dans la session moteur : « Continue l’implémentation d’ANTSIA avec P10 : le contact commercial avec PRO.GA, en laissant toujours les vérifications de côté. »

Sources raccordées : canal commercial séparé, demande initiale limitée, mandats et acceptation,
blocages indépendants, pièces sous garde après acceptation, appels consentis par le moteur existant,
Messages/Boutiques, retour fermé après connexion, réglage console et FR/EN. Le transfert CRM est
facultatif, limité au texte et alias choisis : P06 inquiry.submit, sujet acheteur commun P10/P11,
outbox et reçus distincts, retrait privé versionné hors manifeste P06 et tombe PRO préventive.
Modération ciblée, cloche sans contenu, données/effacement/rétention et Mes données raccordés.

**État : sources raccordées ; scénarios écrits uniquement, jamais exécutés.** API à générer,
compilation/recettes/appels/retraits réels non prouvés, politiques fermées et configuration intacte.
Aucun serveur, navigateur, commande Convex, commit ou publication. Rapport
[P10_CONTACT_COMMERCIAL.md](rapports/P10_CONTACT_COMMERCIAL.md) et
[docs/21](../../21_CONTACT_COMMERCIAL_PRO_GA.md), ADR-0021 proposé.

Coordination : PRO inquiry/withdraw terminé puis ancres communes rendues au propriétaire P11 ;
helper buyer commun livré et slot catalogue membre libéré pour un CTA checkout sibling.
P11 continue dans l’autre chat sur demande humaine distincte ; P10 n’implémente aucun paiement.
Les sources PA9/PA10 et DIASPORALE et les cinq fichiers du pont de session sont préservées.

### Reprise P11 — préparation privée et stock, P10 réservé

Demande du propriétaire : « Continue le lot P11 du plan ANTSIA–PRO.GA, sans relancer les
vérifications et sans empiéter sur P10 réservé à l’autre session. » Trois tâches coordonnées
ont écrit backend PRO.GA/stock, backend ANTSIA et parcours acheteur. P10 reste propriétaire
du contact/CRM et de son rapport. Après sa livraison, son coordinateur a libéré explicitement
les ancres PRO.GA partagées et le slot d'action de fiche membre pour les raccords additifs P11.

Préparations privées et réservations atomiques raccordées : politique vendeur/réseau fermée
par défaut, vrais prix/variantes/stock, récapitulatif XAF, conditions et frais à reconfirmer,
idempotence métier durable, statut après timeout, abandon et expiration à quinze minutes.
Profil ouvre « Mes préparations » ; PRO.GA affiche politique et suivi vendeur dans ses commandes.
Le sujet acheteur est le helper commun P10. Consentements/exports/effacement/rétention sont
classés ; les corps privés ANTSIA sont transitoires. Aucune capacité publique d'achat ouverte.

**État : sources raccordées dans les deux produits ; scénarios écrits, non exécutés.**
P06 reste intact, paiement et création d'ordre via P12 fermés. Aucune génération API,
vérification, recette, activation, service ou commande Convex lancé ; aucun environnement,
secret, donnée, commit ou déploiement manipulé. Le résultat n'est pas une preuve de réservation
réelle ni de livraison en production. [Rapport P11](rapports/P11_COMMANDE_STOCK.md).

### Reprise P12 — paiement, puis répartition marketplace paramétrable

Demande du propriétaire : P12 avec PRO.GA, vérifications toujours différées. Précisions :
paiements mobiles, PayPal et Stripe ; ANTSIA collecteur, part vendeur85%/90%/contrat
paramétrable après réception acheteur ; pourcentage retenu ANTSIA également paramétrable.

Le noyau financier, le pont commandes/stock et le contrat privé ont été répartis entre
trois exécutants. Le chat « Lancer l’app ANTSIA localement » a réservé et raccordé les
seules surfaces UI ANTSIA ; ce chat possède les backend, registres, rétention/données et
raccords PRO.GA. Les sources DIASPORALE DG023/agenda sont préservées, sans doublon P12.

Paiement et ordre réels sont représentés par une intention par préparation, des octets et
des reçus durables, des baux/CAS, un accord court lié au bénéficiaire et aux conditions,
une preuve fournisseur et une consommation stock idempotente. Retrait d’une vitrine,
effacement personnel, remboursement et reversement restent des gestes distincts.

**P12 partiel : sources raccordées, aucun paiement/versement activé ni vérifié.** Les
familles fournisseurs ont des contraintes documentées ; aucun adaptateur réel enregistré.
Politique de retenue/part vendeur, base et arrondi sont configurables et figés par
transaction ; le versement effectif attend preuves P13 et dispositif marchand compatible.
Tests/scénarios écrits seulement. Aucune génération, installation, recette, service,
commande Convex, configuration réelle, transaction, commit ou publication.
[Rapport global](rapports/P12_PAIEMENT.md), [interface](rapports/P12_INTERFACE_PAIEMENT.md),
ADR0022 proposé et PRO.GA docs23.

## Reprise Claude — 18 octobre 2026, 21:50

Demande du propriétaire : « j'ai continué le travail sur Codex, prends le relai ». État relevé à
21:50 : ANTSIA 228 fichiers modifiés et 270 non suivis, PRO.GA 54 et 98, aucun commit nouveau ;
dernières écritures Codex à 21:12 (P13) ; aucun serveur actif. Un premier contrôle a montré que le
backend local refusait toute poussée : neuf imports de `COMMERCE_COMMAND_CONTRACT` pointaient vers
`commerce/command` au lieu de `commerce/primitives` (corrigés dans shops/commercialMessaging), et
`events/events.ts:506-507` appelait `literals` sous forme variadique (corrigé). Il restait ensuite
110 erreurs de type Convex, avec des types générés périmés. Le propriétaire a alors tranché :
**« Continuer sans vérifier »**. Le convex dev a été arrêté ; aucune autre vérification n'est relancée.

Coordination DIASPORALE (session Claude, même consigne) : délégations additives accordées dans ses
blocs de `rateLimit.ts`, `people/dataPolicies.ts`, `crons.ts` et dans `notifications/{tables,notify,bell,policy}.ts` ;
`serviceProposals` reclassé `{owners: [], parents: ["requestId"]}` ; noms de tables DIASPORALE réservés
(`aid*`, `kit*`, `mentor*`, `job*`, `talent*`, `pilotMetrics*`, `service*`) ; DG-013 attend un contrat
ANTSIA de canal commercial générique.

| Lot | Responsable | Fichiers principaux | État |
|---|---|---|---|
| P04 | agent « fil » | `features/media-playback/**` et `features/feed-immersion/**` (nouveaux), ajouts dans `network.tsx` (capacité `feedPresentation`), `FeedPages.tsx`, `PostMediaPresentation.tsx`, `ReseauMobileFeed.tsx`, `ReseauAgentPage.tsx`, `network-shell.tsx`, `discovery/member-feed.tsx`, espace `reseau.immersion.json` | **sources raccordées ; 117 cas de test écrits, non exécutés ; recette ouverte** ; dépend des sources PA10 (`myFeed`) et P03 (`PostMediaPresentation.tsx`) non commitées ; [rapport P04](rapports/P04_SCROLL.md) |
| P17a | agent « natif » | rapport d'audit et contrats ; aucun code applicatif | **documenté, sans vérification** (audit sans code, build, simulateur ni appareil) ; décisions D1–D8 au propriétaire avant toute demande P17b ; P17b–d non lancés ; [rapport P17a](rapports/P17A_AUDIT_NATIF.md) |
| Contrat CC | agent « conversation » | `docs/contrats/CONVERSATION-CONTEXTUELLE-V1.md` (conception seulement, avant code) | **documenté, proposé** : module `contextualMessaging`, natures V1 `diasporaServiceRequest`/`diasporaMentoring`/`diasporaJobApplication`, décisions D1–D16 (recommandations appliquées au statut proposé), sous-lots CC-0…CC-8 ; ADR-0025 réservé ; transmis à DIASPORALE |
| Décisions CC | propriétaire | D1–D16 de CONVERSATION-CONTEXTUELLE-V1, amendements D5 (accord du fil = admission pour ce fil, ne pas déranger/occupation/absence maintenus) et D8 (règle de texte reçoit `{ text, kind, side, voice }`, adresse exacte refusée en voix de personne, admise en voix de page) | **validées le 19/10/2026**, citation relayée par la session DIASPORALE : « Je valide les décisions D1 à D16 du contrat CONVERSATION-CONTEXTUELLE-V1, avec les amendements D5 et D8 ; transmets-le à ANTSIA. » D7 et D13 restent à confirmer juridiquement |
| Disque | coordinateur | sur décision du propriétaire (19/10 ~02:20) : arrêt des Next :3030 (session « Lancer l'app en local ») et :3031 (DIASPORALE), suppression des caches `apps/antsia_ga/.next` et `DIASPORALE/apps/diasporale_com/.next` (fixtures fictives `pd4-recette-fixtures` préservées et remises en place) ; convex dev :3210 et `ANTSIA/.convex` intacts | **fait** : 1,4 → 14 Gio libres |
| Coordination | sessions | « Lancer l'app en local » tient convex dev :3210 (poussées manuelles, la dernière vers 08:15 le 19/10) et a ajouté les avis de vie communautaire DIASPORALE dans `notifications/**` ; règle commune : **un seul pousseur à la fois**, annoncé avant ; mes agents ne poussent jamais | en vigueur |
| CC-4 | agent « appels contextuels » | `contextualMessaging/{calls,callAccess}.ts`, `calls/{conversation,conversationAccess}.ts` (sélecteur unique de contexte d'appel : personnel, P10, contextuel), `calls.contextualThreadId` + 2 index, modifications `calls/*` et `notifications/{open,policy}.ts`, cron `contextual-revalidate-calls` (1 min) | **sources raccordées ; tests écrits, non exécutés** ; P10 inchangé dans son comportement ; cron conservé par le coordinateur : le §6.6 du contrat vise la conservation (aucune purge), pas la revalidation de sécurité des appels, modelée sur `commercial-revalidate-calls` ; [section CC-4](rapports/CC_CONVERSATION_CONTEXTUELLE.md) |
| CC-5 | agent « interface contextuelle » | `features/messagerie/{contextual-conversation-model,contextual-messaging-source,ContextualConversationView,ContextualConversationList,use-contextual-messages,contextual-entry}`, fragment `messagerie.contexte.json`, ajouts ciblés messagerie/iappel/hôte d'appel (dont prop facultative `renderActionsSheet` de `MessageBubble`) | **sources raccordées ; tests écrits, non exécutés** ; point d'injection transmis à DIASPORALE pour CC-6 ; recette CC-V après CC-6 |
| CC-6 | session DIASPORALE | dans DIASPORALE seulement : `useContextualMessages` → `MessagesRoute contextual`, `describeAppRule` (`context_address_forbidden`), adresses `mise-en-relation/<fil>`, entrées depuis les objets (`findForObject`/`openForObject`), cloche `contextual_message`/`contextual_closed` vers le fil | **fait et vérifié côté DIASPORALE (19/10)** : typage 0, tests domaine 690, surfaces 735, app 1312, lint 0 erreur ; aucun fichier ANTSIA touché ; recette CC-V ouverte |
| Finitions | agent « finitions » | `commercialMessaging/attachments.ts` (garde des pièces P10), phrase `commercialContactActor`, K-04 (`PRO_GA/convex/http.ts` sans import de module : `admitProviderCallback`, `receiveApplicationFile`), K-07 (`compatibility.test.ts`), consoles vitrines/catalogue/préparation (K-19), relance auditée des lettres mortes PRO.GA `commerceDeadLetters.ts` + écran admin (K-20) | **corrigé dans les sources ; tests écrits, non exécutés** ; DP-34 (`request.status` de fond) rédigé en deux options pour décision ; [rapport](rapports/FINITIONS_TECHNIQUES.md) |
| Corrections | agent « corrections » | 59 erreurs de typage Convex et 3 cliquets relevés par DIASPORALE (shops, federation, people, contrats jumeaux checkout/orders/payment, locales, URL, jeton `--fil-stage-h`) | **fait, vérifié par exécutions CIBLÉES (sans codegen ni poussée)** : typage Convex 59 → 0 ; cliquets 25/25 fichiers, 140/140 tests ; social-domain commerce 155/155 ; PRO.GA pro-domain 775/775 ; people 154/154 ; contextualMessaging 56/56 ; jumeaux checkout/orders/payment identiques (`cmp`) ; restes hors périmètre : shops 182/188, federation 186/190, typage `apps/antsia_ga` 20 erreurs, `tsc` PRO.GA 4 erreurs (tests), environnement de test (feuille livekit sous PostCSS, `localStorage` sous Node 25) ; [rapport](rapports/CORRECTIONS_TYPAGE.md) |
| Seconde passe | 3 agents « backend », « applications », « PRO.GA » (19/10 ~09:40) | backend : `convex/modules/{shops,federation}` (+ non-régression people, notifications, moderation, contextualMessaging, commercialMessaging) ; applications : typage `apps/antsia_ga`, environnement de test (livekit/PostCSS ; `localStorage` sous Node 25 avec le correctif DIASPORALE `vitest.setup.ts` repris) ; PRO.GA : `tsc`, codegen local éphémère PRO.GA s'il est libre (:3220), typage Convex, tests ciblés, `docs/27` | **fait, vérifié par exécutions CIBLÉES** : backend shops 188/188, federation 190/190 (relancés par le coordinateur : 378/378), people, notifications, moderation, contextualMessaging, commercialMessaging verts, une seule correction de code (`federation/replay.ts` : un rejeu dédoublonné ne compte plus de tentative) ; applications : typage `apps/antsia_ga` 20 → 0 (code 0 relancé par le coordinateur), tests 621/621, admin 81/81, `packages/api` 193/193, `social-features` 3911/3912 (rouge DG-023 corrigé ensuite par DIASPORALE), correction `MessagerieListView` (« Charger plus pour chercher ») ; PRO.GA : codegen local éphémère réussi, typage Convex 21 → 1 → 0 (ligne `Object.hasOwn` de `commerce-marketplace.ts` corrigée par le coordinateur), `pro-domain` 775/775, suite Convex 1 952/1 952, reste préexistant hors commerce : `@workspace/ui` installé sans `overlay-scope` (TS2307 ×2 dans `pro_ga`, `admin_pro_ga`, `pro-features`), `bun update` du mainteneur ; rapports : [CORRECTIONS_TYPAGE §7–8](rapports/CORRECTIONS_TYPAGE.md), PRO.GA `docs/27` |
| Verify n° 1 | DIASPORALE (gel commun, 19/10 10:05–10:10) | `bun run verify` complet d'ANTSIA | **EXIT 1** : codegen, `typecheck:convex`, `typecheck:tests` verts ; tests Convex 2538/2544 ; étapes suivantes non atteintes. Échecs : 4 tests comptant toutes les tâches planifiées, pollués par les rattrapages PA10 que planifient les fixtures (`calls/cleanup` ×2, `live/reap`, `lib/livekitEgressWebhookRoute`), test de charge PA10 à 5 000 abonnés au-delà de 120 s, `pages/signatories` (bloc EXF-DG-26) contre le contrat DG-010 V1 — réécrit par DIASPORALE avec accord du coordinateur (9/9) |
| Après verify n° 1 | agent « PA10 » ; coordinateur | tests `calls/cleanup`, `live/reap`, `lib/livekitEgressWebhookRoute`, `posts/feedMaterialization` (tests seulement) ; passe du coordinateur sur les étapes non atteintes (cliquets, scripts, typage/tests/lint des espaces de travail) | **fait** : les 5 échecs venaient des tests (aucun défaut de code) — relevé des tâches après l'amorce ou vidage des rattrapages PA10 avant l'étape testée, égalités exactes conservées ; délai explicite de 360 s pour le seul test de charge (5 000 abonnés, lots de vingt inchangés) ; 4 fichiers 53/53, non-régression calls/live/posts/lib 712/712, tsgo 0 ; passe du coordinateur sur les étapes non atteintes : cliquets 140/140, scripts, typage, tests (dont social-features 3912/3912, antsia_ga 621/621, admin 81/81) et lint (0 erreur, 38 avertissements) des espaces : tous code 0, confirmés par une passe DIASPORALE indépendante ; « PRÊT POUR VERIFY 2 » envoyé à 10:39 ; [CORRECTIONS_TYPAGE §9](rapports/CORRECTIONS_TYPAGE.md) |
| Verify n° 2 | DIASPORALE (gel commun, 19/10 10:38–10:46) | `bun run verify` complet d'ANTSIA | **VERT, code 0** (journal relu par le coordinateur) : codegen sans conflit, `typecheck:convex` et `typecheck:tests` 0 ; tests Convex 169 fichiers, 2544/2544 ; cliquets 140/140 ; scripts 33/33 ; typage de tous les espaces ; tests des espaces (dont social-features 3912, social-domain 1697, antsia_ga 621, api 193, admin 81, DIASPORALE 690/737/1314) ; lint 0 erreur partout |
| Commits PRO.GA | coordinateur | branche `feat/antsia-social-commerce` : `0dc5910` domaine (44), `343d4de` intégrations (128), `d3fe390` surfaces (36), `f57f844` docs 18–27 (10) | **commités, non poussés** : le compte gh actif (`ntsagui`) n'a aucun accès à `administration-ga/pro.ga` ; dérive préexistante du socle installé (`overlay-scope`) à régler par le mainteneur (`docs/27` §4.2) |
| Commits ANTSIA | coordinateur, par chemins (`git add` puis `git commit` avec liste), périmètre DIASPORALE exclu | branche `codex/pa4-identite-session` : `4d6c39e` verrou diasporale-com (session « Lancer l'app en local »), `7b789b1` pont de session (session de recette du 18/10), `209a797` sept thèmes (session « Lancer l'app en local »), `dbaf707` apparence ADR-0026 (session « Thème »), `e0063ba` notifications, `4f6523c` moteur, `9cdb401` paquets, `1a44c8e` antsia.ga, `dfaf09f` console, `d737a4d` outillage, puis la documentation | **commités** ; les commits isolés ne se compilent pas seuls (fichiers partagés entre lots), seul l'ensemble est vérifié ; DIASPORALE commite ensuite `convex/modules/{diaspora,events}/**` et `themes/diasporale.css` ; push à la charge du propriétaire (compte `administration-ga`) |
| CC-1/2a/2b | agent « conversation » | `packages/social-domain/src/contextualMessaging.ts`, `convex/modules/contextualMessaging/{contract,registry,tables,access,attachments,personStates,projection,hooks,threads,messages,operator,retention}.ts`, console `console-contextual-policy.tsx`, cliquets `contextual-registry`/`contextual-hooks` (voie (a) des synchronisations planifiées), ajouts partagés | **sources raccordées ; tests écrits, non exécutés** ; tranche DIASPORALE CC-3a/CC-3b branchée (`registry.ts`) ; ADR-0025 accepté ; [rapport CC](rapports/CC_CONVERSATION_CONTEXTUELLE.md) |
| P14B | agent « suites » | 13 genres `commerce_*` (`commerceNotifications.ts`, `notifyCommerceRecipient`, garde `notifications/commerceAccess.ts`), ouverture ciblée `notifications/targets.ts` + `notificationOpenTarget.ts` (services, emploi, cible générique DIASPORALE, décisions de page), fiche `/mes-candidatures/[applicationId]`, section « Prestations sans paiement en ligne » dans Mes achats | **sources raccordées ; tests écrits, non exécutés** ; avis client P14 en trace lue sans push (aucun canal PRO.GA → ANTSIA pour les états de service) ; [rapport P14B](rapports/P14B_NOTIFICATIONS_ET_SUITES.md) |
| P14 | agent « services » | ANTSIA `shops/service*`, `components/services/**`, pages `mes-demandes` et `boutique/[handle]/{devis,rendez-vous,prestation}`, `serviceTime.ts`, console `console-service-policy.tsx` ; PRO.GA `integrations/commerceService*`, `agenda/commerceBookings.ts`, adaptations `agenda`/`quotes`/`orders`, 9 routes `http.ts` ; contrat jumeau `commerce-services.ts` (sha256 `cb8f418c…38de6c`) et `docs/contrats/PRO-COMMERCE-SERVICE-CONTROL-V1.md` ; PRO.GA `docs/25` | **sources raccordées dans les deux produits ; tests écrits, non exécutés ; recette ouverte** ; politique Services fermée par défaut, acompte indisponible ; [rapport P14](rapports/P14_SERVICES.md) |
| P16 | agent « confiance » | revue transverse P07–P15 ; corrections C1–C7 : cliquet de débit (proxy média), `commercialBlocks` suit le demandeur, candidature d'un suspendu bloquée, réconciliation des mandats PRO.GA (cron 15 min, `shop.withdrawn`), avis d'effacement avec rendez-vous à venir, décision/recours des contenus de page (`pageDecisions`, `ownsCase` étendu), conflit d'intérêts au recours | **sources raccordées ; tests écrits, non exécutés** ; 39 tables ANTSIA et 52 PRO.GA inventoriées ; décisions D1–D8 au propriétaire ; [rapport P16](rapports/P16_CONFIANCE.md) |

Défauts relevés par P16, non corrigés par lui : `CommerceResult<T>` à un paramètre (`commerce-checkout.ts:47,98`,
deux copies) ; imports `./modules/…` de `PRO_GA/convex/http.ts:7,15,16` contre le test de frontière ;
`federation/agentConsentTransfer.ts#transfer` absent de `SYSTEM_HTTP_ADMISSIONS` ; consultations
`request.status` de fond (P10, P15) déclarant `authVerifiedAt: now` sans relire de session.

Traitement par le coordinateur (sans vérification) :
- **corrigé** : `CommerceResult<…, string>` aux deux signatures de `commerce-checkout.ts`, copies jumelles
  toujours identiques (`cmp`) ;
- **corrigé** : `PRO_GA/convex/http.ts` n'importe plus le type `CommerceMediaTicket` depuis un module
  (copie structurelle locale typée par `_generated/dataModel`) ;
- **corrigé** : `tests/ratchets/rate-limited-writes.test.ts` admet `agentConsentTransfer.ts#transfer` par
  `modules.federation.agentConsentTransfer.redeem`, qui consomme `federation.receive` avant tout effet ;
- **ouvert (phase de vérification)** : `http.ts` importe encore deux `httpAction` de modules
  (`payments/commercePaymentEvidence#providerCallback`, `integrations/commerceApplicationFiles#uploadApplicationFile`).
  Remède conforme à la frontière : routes génériques définies dans `http.ts` qui lisent en-têtes et octets
  bornés, puis appellent par `makeFunctionReference` une action interne du module (`receiveCallback` existe
  déjà côté paiements ; une action interne d'admission des pièces à créer) ; à faire avec tests exécutés ;
- **ouvert (décision de contrat)** : `request.status` de fond sans session vivante — soit une consultation
  machine sans sujet engageant, soit une relecture de la dernière session prouvée ; à trancher avant code.

Suites relevées par P14 : aucune notification de devis reçu ni de rendez-vous confirmé ; commandes de
service absentes de Mes achats ; l'effacement d'un compte n'annule pas les rendez-vous PRO.GA ;
`CommerceResult<T>` à un seul paramètre dans `commerce-checkout.ts` ; imports `./modules/...` de
`PRO_GA/convex/http.ts` à confronter au test de frontière des domaines.
| P15 | agent « emploi » | ANTSIA `shops/job*`, `shops/jobTables.ts`, `federation/commerceJob*`, `public/jobs` ; PRO.GA `integrations/commerceJob*`/`commerceApplication*`, adaptations `recruiting` ; contrat jumeau `commerce-jobs.ts` (sha256 `1f63e4da…214b9`) ; espace `jobs.json` ; tables `commerceJob*`/`commerceApplication*` ; `docs/contrats/PRO-COMMERCE-JOBS-V1.md`, ADR-0024, PRO.GA `docs/26` | **sources raccordées dans les deux produits ; tests écrits, non exécutés ; recette ouverte** ; politique réseau fermée par défaut, conservation non fixée (`null`) ; [rapport P15](rapports/P15_EMPLOI.md) |
| P18a | agent « qualité » | rapport seulement : audit statique accessibilité/performance des surfaces P02–P15 et protocole de mesure | **documenté, sans vérification** : 13 surfaces, 59 constats (2 bloquants, 23 majeurs, 34 mineurs), protocole P18b prêt ; P14 à auditer ; [rapport P18a](rapports/P18A_AUDIT_STATIQUE.md) |
| P18b | agent « corrections » | corrections des constats prioritaires de P18a dans les composants des lots P03, P04, P05, P07, P10, P11, P12, P15 (Edit ciblé), hors fichiers touchés par P16 | **sources corrigées ; tests écrits, non exécutés** : A01 (menu ⋯ au clavier), A02 (bulles), A03/A30, A04, A05, A06, A07 (`toast-region.tsx`), A09–A19, F03 ; ouverts : A08 sous-titres (décision), A18 partiel, F02/F04/F05 documentés ; parité DIASPORALE : toasts inertes sous modale et palette au survol chez eux ; section « Correctifs P18b » de [P18A](rapports/P18A_AUDIT_STATIQUE.md) |
| P19 | agent « pilote » | dossier `pilote/` (versions candidates, gel et vérification, 34 parcours, pilote utilisateur, activation et retour arrière, registre de 39 décisions, dossier de décision, guides vendeur/acheteur/candidat-employeur, procédures support) | **documenté ; partie exécution ouverte** (vérification officielle, parcours joués, pilote conduit) ; [rapport P19](rapports/P19_PILOTE.md) |

Relevés par P19 : travail NON inscrit d'une autre session vers 02:10–02:11 — sept thèmes au choix
`packages/ui/src/themes/antsia-<thème>.css` (atlantique, encre, forêt, hibiscus, indigo, lagon…),
`themes/index.ts`, imports dans `apps/antsia_ga/src/app/globals.css` — à inclure dans le gel ; preuves P01/P02
périmées (fichiers modifiés depuis) ; aucune console pour les politiques vitrines, catalogue, préparation ;
aucune relance d'une lettre morte de l'outbox PRO.GA ; paiement limité au `sandbox` par le code
(`paymentAccess.ts:32`). Index des ADR complété (0017–0019, 0024) par le coordinateur.
**Disque : 1,4 Gio libres (100 %) le 19/10 vers 02:15** — serveurs d'autres sessions actifs (Next :3030 et
:3031, convex dev :3210) ; caches `.next` ANTSIA 3,0 Gio et DIASPORALE 5,4 Gio, `.convex` ANTSIA 3,4 Gio.

Délégations DIASPORALE supplémentaires (additives, leurs tables seulement) : cas d'export dans
`people/dataInventory.ts` (`exportableRecord`), crochets d'effacement de compteurs, cibles de
modération préfixées `diaspora_…`. Raccord fait par le coordinateur : `notifications/deliveries.ts`
appelle `notificationRowCategory` (nouvel export de `policy.ts`) au lieu de `notificationCategory`
pour accepter les 13 genres de mise en relation DIASPORALE.

Inventaire déclaré par DIASPORALE (écritures déléguées, additives) : `rateLimit.ts` 17 seaux + 3
mappings `.reinforced` ; `crons.ts` 4 lignes (`diaspora-service-requests-expiry`, `diaspora-mentoring-requests-expiry`,
`diaspora-pilot-metrics`, `diaspora-job-offers-expiry`) ; `dataPolicies.ts` aid*/mentor*/kit*/job*/talent*/
pilotMetricsDaily ; `dataInventory.ts` cas d'export mentoringRequests, jobApplications, kitResourceReviews et
`EXPORT_PERSON_FIELDS.kitResourceReviews` (conservé : trace personnelle du relecteur) ; 13 genres de
notification ; 9 natures de modération `diaspora…` et crochets d'effacement dans `people/erasure.ts` (en cours).

Suites ANTSIA promises (non commencées) : (1) contrat de **conversation contextuelle** générique
(demande de service DIASPORALE DG-013, mentorat accepté, candidature présélectionnée) sans ouvrir la
messagerie personnelle ; (2) `notifications/open.ts` : destination ciblée revalidée pour les genres
DIASPORALE (sujet null aujourd'hui, pas de lien profond depuis un push).

Fichiers partagés entre P14/P15 (`schema.ts` des deux dépôts, `shops/tables.ts`, `dataPolicies.ts`,
`rateLimit.ts`, cliquet `network-scoped-functions`, `routes.ts`, `discover-model.ts`, `me-model.ts`,
`uploadPolicy.ts`, `federation/commerceCatalog.ts`, PRO.GA `http.ts`, `commerceDispatch.ts`,
`commerceOutbox.ts`) : uniquement par Edit à ancre unique, relu juste avant, jamais de réécriture.

## État de départ historique (relevé 18/10 13:47)

- ANTSIA : branche `codex/pa4-identite-session`, HEAD `9eaff40`, 45 commits devant `origin/main`.
  Arbre partagé : 36 fichiers modifiés et 13 non suivis appartenant à d'autres sessions.
- Sessions actives dans l'arbre (non joignables par message) :
  - **PA9 (Codex)** : `convex/modules/federation/**`, `convex/modules/pages/{access,admin,claims,signatories}.ts`,
    `packages/social-domain/src/{federationProtocol,reseauPublic}*.ts`, `apps/admin_antsia_ga/**/console-federation*`,
    `apps/admin_antsia_ga/src/i18n/locales/*/operations.json`, `docs/15_PLAN_EXECUTION_PA9.md`,
    `docs/contrats/RESEAU-PUBLIC-V1.md`, `docs/adr/{README.md,0013-*}`, `docs/01_PLAN_IMPLEMENTATION_PROMPTS_ANTSIA.md`,
    `convex/_generated/api.d.ts` (codegen).
  - **DIASPORALE** : `convex/modules/diaspora/**`, `packages/ui/src/themes/diasporale.css`, dépôt `../DIASPORALE`.
  - **Préférences « Mon fil »** (relevé 13:49, avant la vague 1) : `routes.feedPreferences` (`/mon-fil`),
    `member-chrome.tsx`, `feed/feed-screen.tsx`, `feed/feed-preferences-screen.tsx`, `app/(membre)/mon-fil/`,
    `PrivacyLists.tsx`, clés `feedPreferences.*` d'`antsia.json` — à préserver par P02/P04.
  - **Travaux non commités antérieurs, à préserver** : partage (`PostCard.tsx`, `SharePostDialog*`,
    `reseau.fil.json`, `routes.ts`, `packages/api/src/network.tsx`), pont de session (`session-bridge*`),
    accueil/inscription (`entrer/**`, `access-home-*`, `sign-in-screen.tsx`, `IdentityEntry*`, `antsia.json`),
    fond blanc/cartes beige (`packages/ui/src/themes/antsia.css`).
- Services à l'ouverture : Next ANTSIA `:3030`, backend Convex local `:3210` (`convex dev` lancé
  vers 10:08 par un processus Codex), Next DIASPORALE `:3031`. **Tous arrêtés vers 14:05** avec les
  app-servers Codex (aucune action de ce lot). Relancés à 14:10 par le coordinateur, seuls, via
  `.claude/launch.json` (`antsia-convex`, `antsia-ga`) : un backend, un Next.
- **Backend PRO.GA local** (décision du propriétaire, 18/10 ~15:20 : « backend Convex LOCAL pour PRO.GA,
  réécriture de PRO_GA/.env.local autorisée, garde une copie, sans toucher le cloud ») : ancienne
  configuration cloud copiée dans `PRO_GA/.env.local.cloud-dev.bak` (ignoré par git) ; `.env.local`
  pointe un déploiement local anonyme (`:3220`, HTTP `:3221`) dont l'état vit dans `PRO_GA/.convex/local/`
  (base distincte de celle d'ANTSIA, `ANTSIA/.convex/local/`) ; lancé par `.claude/launch.json`
  (`pro-ga-convex-local`, Node 22, `CONVEX_AGENT_MODE=anonymous`). Retour au cloud :
  `cp .env.local.cloud-dev.bak .env.local`.
- **Session Claude DIASPORALE** (message du 18/10, vague d'agents) : réserve `../DIASPORALE`,
  `convex/modules/diaspora/**`, `themes/diasporale.css`, `social-contracts/src/i18n/locales/*/diaspora.json` ;
  lit sans modifier pages/*, people/erasure, moderation/cases. Seaux de débit demandés ajoutés par le
  coordinateur dans `convex/lib/rateLimit.ts` ; classement de ses nouvelles tables dans
  `people/dataPolicies.ts` à venir (coordinateur). Verify commun piloté par le coordinateur, annoncé 15 min avant.
- PRO.GA : arbre propre, branche `feat/vitrine-catalogue-vivant` (4 commits devant `main`), aucune session active.
- Disque : 7,9 Gio libres.

## Règles de la vague (rappel du préambule, §2–§10)

1. Au plus **trois agents** simultanés, modèle Opus, sans sous-agent, sans worktree.
2. Chaque agent n'écrit **que** dans ses fichiers réservés ci-dessous ; un besoin hors réservation
   est rendu au coordinateur, qui l'arbitre.
3. Aucun agent ne commite, ne change de branche, ne lance `bun install`, `bun run verify`,
   `bun run codegen`, un serveur ou une commande Convex ; aucun `.env*`. Le coordinateur
   commite par chemins (`git commit -- <chemins>`) après `verify`.
4. Tests ciblés seulement (fichiers du lot, cliquets concernés, typage du paquet touché).
5. Le navigateur est réservé au coordinateur pendant les vagues (recette visuelle à l'intégration).

## ADR réservés par la refonte

`0017`, `0018`, `0019` (0014–0016 laissés à PA9B–D, en cours dans l'arbre).

## Réservations

| Lot | Responsable | Fichiers réservés | État |
|---|---|---|---|
| P00 | coordinateur | `docs/etudes/2026-10-18-social-commerce/{EXECUTION.md,rapports/P00_*}`, `docs/adr/0017-*`, `0018-*`, `0019-*` | **documenté** (rapport P00, ADR 0017–0019 proposés) |
| P01 | agent « charte » | `packages/ui/src/themes/antsia.css`, ajouts compatibles dans `packages/ui/src/styles/charte.css`, tests de contraste neufs dans `packages/ui/src/**`, `rapports/P01_*` | **code présent + tests** (214 + 5 cliquets revérifiés par le coordinateur) ; rendu 1280 clair/sombre observé |
| P01b | agent « charte » | `packages/ui/src/styles/{charte,theme}.css` (ajouts, défauts identiques), `themes/antsia.css`, tests ui, `apps/antsia_ga/src/app/globals.css`, `layout.tsx` (D12 seulement) | **code présent + tests** (D4, D6, D7a, D8, D11 ; 334 tests ui) ; D12 rendu à P18 ; Inter : dépendance + `bun install` au coordinateur |
| P02 → fin | coordinateur | `apps/antsia_ga/src/components/feed/feed-screen.tsx` (rangée mobile masquée en navigation par destinations, état invalide dans `MemberPage`) | **code présent** ; typage app 0 ; observé à 375 px |
| P03 | Claude puis relais Codex | `packages/api/src/network.tsx` (capacité `postPresentation`), `network-shell.tsx` (déclaration), cartes/médias/légendes/réactions connectés, carte publique et lecteur média, locales FR/EN, continuation fermée `publication` sur les portes connexion/inscription/bienvenue et routes ; compléments de styles antérieurs conservés | **sources raccordées ; tests écrits, non exécutés** ; recette et vérification toujours ouvertes ; [rapport P03](rapports/P03_PUBLICATIONS.md) |
| P05 | Claude puis relais Codex | `features/{messagerie,iappel}/**`, hôte communication et barre iCom, application Messages/notifications/continuation, gardes d'envoi ciblées et `notifications/open`, locales FR/EN ; réservations détaillées dans le rapport | **sources raccordées ; tests écrits/étendus, non exécutés** ; vérification et recette ouvertes ; [rapport P05](rapports/P05_ICOM.md) |
| P02 | agent « navigation » | `apps/antsia_ga/src/lib/routes{,.test}.ts`, `apps/antsia_ga/src/components/{network-shell,member-chrome}.tsx`, nouvelles routes `apps/antsia_ga/src/app/(membre)/**` de navigation, `packages/api/src/network.tsx` (ajout optionnel), coque `packages/social-features/src/shell/{ReseauMenuRail*,reseau-agent-nav*,reseau-menu*,reseau-header*,mobile/ReseauMobile{TabBar,Header,CreateButton,MenuSheet,Shell}*,mobile/reseau-mobile-tabs*}`, locales `antsia.json`, `memberNetwork.json`, `shell.json`, `reseau.coque.json`, `rapports/P02_*` | **code présent + tests** (379 coque, 162 app revérifiés par le coordinateur) ; observé à 375 px (barre 5 places, Créer, Échap + focus, `/explorer`, `/moi`) et 1280 px (rail) |
| P06 | agent « contrats » | `packages/social-domain/src/commerce/**` (nouveau, sans toucher `index.ts`), `docs/contrats/PRO-COMMERCE-{PUBLIC,COMMAND}-V1.md`, PRO.GA `packages/pro-domain/src/commerce/**`, `packages/pro-domain/tests/commerce*`, export dans `packages/pro-domain/src/index.ts`, `docs/18_CONTRATS_COMMERCE_ANTSIA.md` (PRO.GA), `rapports/P06_*` | **code présent + tests** (ANTSIA 38, PRO.GA 15 revérifiés ; manifeste rév. 1 `0ad170ac…`) ; aucun branchement |
| P07 | Claude puis relais Codex | `convex/modules/shops/**`, `convex/modules/public/shops.ts`, `pages/shopPages.ts`, schéma/limites/audit et politique de données amorcés par Claude, export personnel ciblé et test neuf, cliquet social, modération de la page ; routes/namespace FR/EN, éditeur et vitrines, projection SSR, profil/découverte et annuaire | **sources raccordées ; tests écrits/étendus, non exécutés** ; publication fermée par défaut, génération/contrôles/recette ouverts ; [rapport P07](rapports/P07_BOUTIQUES.md) |
| P08 | relais Codex, trois tâches coordonnées | ANTSIA liaison `shops/commerceLink*`, réception `federation/commerceTransport*` et raccords ciblés, schéma/inventaire/effacement/quotas/UI ; PRO.GA `integrations/commerce*`, outbox métier et fondation d'intégration, registres et parcours d'autorisation ; contrat LINK pur jumeau hors manifeste P06 | **sources raccordées dans les deux produits ; tests écrits, non exécutés** ; génération/configuration/recette ouvertes, aucun échange réel revendiqué ; [rapport P08](rapports/P08_LIAISON_TRANSPORT.md) |
| P09 | relais Codex, trois tâches coordonnées | PRO.GA producteurs/snapshots/consentements et parcours d'offre ; ANTSIA `shops/catalog*`, `federation/commerceCatalog*`, `public/catalog`, catalogue/fiches/slots ; contrat privé de lecture jumeau et raccords médias/modération/données/dispatch/quotas | **sources raccordées dans les deux produits ; tests écrits, non exécutés** ; génération/configuration/recette ouvertes, aucune application distante prouvée ; [rapport P09](rapports/P09_CATALOGUE.md) |
| P11 | relais Codex, trois tâches coordonnées, ancres partagées libérées par P10 | PRO.GA `integrations/commerceCheckout*`, stock atomique et panneau Commandes ; ANTSIA `shops/checkout*`, parcours privé, contrat de contrôle jumeau, politique/données/effacement et raccords additifs | **sources raccordées ; scénarios écrits, non exécutés** ; génération API et recette ouvertes, P10 préservé, paiement P12 fermé ; [rapport P11](rapports/P11_COMMANDE_STOCK.md) |

Suites relevées par P06 pour les lots suivants : **P08** — enregistrer côté PRO.GA les 5 types de
référence et les 10 scopes `commerce.*` (`MACHINE_SCOPES`, `PRO_RESOURCE_TYPES`), aligner l'OpenAPI du
profil machine sur le code (horodatage, bornes nonce/key-id), corriger `emitProEvent` (`businessId` en
majuscules refusé, `version: 0` à l'archivage d'une offre jamais publiée, charge plate), raccorder
`proOutboxEvents` ↔ `proIntegrationOutbox`. **P09** — passer le corps brut au contrôle de forme canonique
de l'inbox ; ajouter le contrat aux contrats implémentés (assertion de `compatibility.test.ts` à mettre à
jour dans le même lot) ; budget `federation.receive` (300/min) insuffisant pour un rattrapage de 100 000
offres (≈ 5,5 h). Écart à 07 §4.3 : depuis PA9A (non commité), RESEAU-PUBLIC-V1 est appliqué par l'inbox ;
seuls les autres contrats finissent en `dead_letter`.

Lots suivants, ordre et dépendances : voir le rapport P00 (`rapports/P00_CADRAGE.md`).

## Reprise P17c — 20 octobre 2026, sans vérifications

Demande explicite de poursuivre les appels natifs et notifications système en préservant l’autre
session. [Périmètre et réservations](rapports/P17C_PLAN_REPRISE_2026-10-20.md),
[bilan source et matrice non exécutée](rapports/P17C_REPRISE_2026-10-20.md).

Les sources réelles ajoutent la chaîne PushKit/CallKit et FCM/Core-Telecom, l’hôte média natif
persistant, les gestes conversation/réglages, le premier gagnant par session/appareil, l’ouverture
ciblée et le jeton relu. Export privé et cliquets sont adaptés ; les scénarios sont écrits seulement.
Le module reste désactivé par défaut. P17a/P17b ci-dessus demeurent des états historiques.

**Aucune installation, génération, vérification, compilation ou recette exécutée.** Aucun
fournisseur configuré, aucune identité native créée, aucun `.env*`, lockfile, commit, push ou
déploiement. Les autres travaux Web/DIASPORALE/PRO.GA sont préservés. P17d reste non exécuté.

## P17d puis P18/P19 — continuation autorisée le 20 octobre 2026

La demande humaine autorise l’enchaînement de ces suites sans nouvel accord et maintient
l’interdiction de relancer les vérifications. Ce cadre particulier est consigné dans
[le plan de reprise](rapports/P17D_P18_P19_PLAN_REPRISE_2026-10-20.md).

| Lot | Sources de cette reprise | État réel |
|---|---|---|
| P17d | Registre `docs/recette/antsia-native-p17d/`, évaluateur pur, commande `native:acceptance` déclarée | Préparé, aucun appel/mesure/appareil/binaire éprouvé ; [bilan](rapports/P17D_REPRISE_2026-10-20.md) |
| P18 | Corrections natives de commandes/champs, sélection, mouvements, listes et surface d’appel | Sources raccordées, scénarios écrits seulement ; aucun résultat AA/performance ; [bilan](rapports/P18_REPRISE_2026-10-20.md) |
| P19 | Addenda au dossier pilote existant, guides et décision par capacité | Dossier actualisé, pilote/gel/vérification/activation non exécutés ; [bilan](rapports/P19_REPRISE_2026-10-20.md) |

Base Git `c4d36f3`, arbre partagé non gelé, travaux voisins préservés. Aucune nouvelle dépendance,
modification du lockfile, session Web, backend partagé ou source PRO.GA/DIASPORALE. Aucun
`.env*`, secret, serveur, installation, génération, test, typage, lint, build, audit automatisé,
recette, transaction, participant, commit, push, merge, déploiement ou store lancé/créé par cette
reprise. Les preuves historiques ou publications d’autres sessions restent distinctes ; elles
ne valident pas cette candidate native. Le plan s’achève à P19, sans nouvelle activation implicite.

## Expérience sociale responsive — demande du 20 octobre 2026

Demande distincte : analyser les cinq captures et deux vidéos locales, moderniser les noms
des fonctions et préparer les adaptations téléphone/tablette/ordinateur. Voir le
[dossier UX et ses huit prompts](../2026-10-20-experience-sociale-responsive/README.md).
Les lots **U01–U08** complètent les sources P00–P19 sans reprendre leurs contrats.

**U01 raccordé en source** : surcharges i18n propres à ANTSIA, composées immuablement depuis
les namespaces moteur complets ; Direct/En live, Stories, Replays, Accueil, Explorer, Mon réseau,
Enregistrés, invitation « Ajouter à mon réseau ». Mon fil conserve masquage/sourdine et annulation.
Dans le natif, seuls les deux libellés de fil existants deviennent Accueil/Home.
Périmètre : `apps/antsia_ga/src/i18n/{resources.ts,compose-engine-overrides.ts,overrides/}`, les
locales propres `{antsia,memberNetwork,publicNetwork}` FR/EN et `apps/antsia_mobile/src/i18n/{fr,en}.json`.
Scénarios ajoutés dans `apps/antsia_ga/src/i18n/resources.test.ts`, **non exécutés**.

Les lots U02–U08 sont des plans : coque, cartes/stories/création, Explorer/Clips vidéo réel,
profils/boutiques, messagerie/appels, actions commerciales contextuelles et finition. Ils
préservent le fond blanc/cartes beige, le sombre existant, DIASPORALE et les capacités P16 fermées.
Pas de bascule fictive du fil immersif mixte vers Clips, ni de nouvel onglet natif annoncé.

Lecture source et analyse visuelle de médias locaux seulement ; aucune recette applicative,
commande de vérification, génération, installation, serveur, configuration, activation,
mutation métier, Git d’écriture ou publication. Rendu U01 non constaté. Les arbres partagés et
modifications d'autres sessions sont conservés ; leur présence n'est pas une validation de ce lot.

**Suite U02 — sources raccordées sans vérifications.** Le
[bilan de navigation responsive](../2026-10-20-experience-sociale-responsive/rapports/U02_NAVIGATION_RESPONSIVE_2026-10-20.md)
décrit l'opt-in ANTSIA sous 768 / 768–1199 / dès 1200 px, le rail commun, le raccourci Boutiques,
le cadre des pages et de Messages, et le maintien de Créer jusqu'à U04. Hôte d'appel et
sélecteur de fichier persistants conservés ; seuils historiques et dictionnaires DIASPORALE
intacts. Les scénarios sont écrits, non exécutés ; aucune recette de navigation, mesure CSS,
preuve d'appel ou publication n'est revendiquée. Client natif inchangé. Suite source : U03.
