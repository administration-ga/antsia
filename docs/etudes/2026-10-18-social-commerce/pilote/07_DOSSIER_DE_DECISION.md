# 07 — Dossier de décision

## Décision préparée au 20 octobre 2026 : NO GO

**NO GO pour admettre, piloter ou publier une candidate issue de cette reprise**, par capacité selon
[01 — état actuel](01_VERSIONS_CANDIDATES.md#actualisation-du-20-octobre-2026).
Ce verdict documentaire ne vaut pas décision humaine de mise en service. La poursuite P17d/P18/P19
est autorisée sans nouvelle vérification, et n’accorde aucun résultat d’exécution. Il ne s’agit
pas d’un verdict sur la production publiée par une autre session : aucune requête de production
ni observation de sa configuration n’a été effectuée ici.

| Preuve / absence de preuve | Situation de cette reprise |
|---|---|
| Base source | ANTSIA `c4d36f3` relu ; arbre partagé non gelé, modifications récentes P14–P18 ; pas de candidate immuable ni de révision servie attestée |
| P14/P15/P16 | Sources et scénarios de reprise documentés ; nouvelles admissions sensibles fermées par registres, y compris nouvelles copies CV PRO.GA |
| P17b/P17c | Client réel et appels système raccordés en source ; installation/lockfile, compatibilité native et compilation non effectués |
| P17d | [Préparation de recette physique](../../../recette/antsia-native-p17d/README.md) ; aucune observation d’appareil, sonnerie, média ou fin des captures |
| P18 | Corrections natives raccordées selon le rapport de reprise ; aucune mesure/accessibilité éprouvée dans cette reprise |
| Correctifs P19 et suite DP-39 | Annonces accessibles, documentation machine, admission durable des CV et signal privé de relecture ; [bilan complémentaire](../rapports/P19_CORRECTIFS_AUTOMATIQUES_2026-10-20.md), scénarios non exécutés |
| Vérifications / recette / pilote | Aucun test, génération, typage, lint, build, audit automatisé, recette ou séance utilisateur lancé ici ; aucun consentement pilote acquis |
| Configuration et publication | Aucune valeur, identité, fournisseur ou capacité activée ; aucun Git write ou déploiement de ce lot |

Les chiffres de tests, erreurs, espace disque, tables, crons et empreintes du 19 octobre ci-dessous
restent des relevés historiques. Ils ne sont ni renouvelés ni présentés comme conformes à l’arbre
actuel. Aucune empreinte de contrat n’est recalculée. Une éventuelle preuve Web acquise par une
autre session ne prouve pas cette candidate native ; sa révision et son périmètre doivent être
rapprochés séparément avant tout emploi dans une décision.

### Conditions de réexamen

1. Source stabilisée et périmètre choisi, coordonnés avec les sessions actives ; autorisation du
   créneau de vérification, installation/génération/contrôles et rapports sur les mêmes sources.
2. Décisions métier et conservation, configuration propriétaire et recette croisée par capacité.
   Les registres P16 ne peuvent pas être ouverts par une ancienne bascule ou un mock de test.
3. Binaire/configuration détenus et preuves physiques P17d pour toute promesse native ; corrections
   P18 effectivement mesurées. Aucune réussite, latence ou conformité n’est supposée.
4. Protocole utilisateur validé avec consentement, données minimisées, durée/accès aux notes et
   responsables réellement désignés avant recrutement ; [04](04_PILOTE_UTILISATEUR.md) reste proposé.
5. Autorisation humaine propre à l’ouverture/publication, puis preuve de révision effectivement
   servie et parcours rejoués sur cette cible. Le présent dossier n’en tient pas lieu.

Le retour arrière préparé [05](05_ACTIVATION_ET_RETOUR_ARRIERE.md) ferme les nouveaux effets sans
effacer résultats/anti-rejeux, preuves, tombes ou files de retrait. Le suivi privé, les libérations,
annulations, retraits, rapprochements et remboursements d’engagements existants gardent leurs
portes. Conservation générale PRO.GA, accès des membres suspendus et purge CV non confirmée
restent des limites explicites, sans garantie juridique ou certificat de suppression.

Références actuelles : [bilan P19](../rapports/P19_REPRISE_2026-10-20.md),
[P16](../rapports/P16_REPRISE_2026-10-20.md), [P17c](../rapports/P17C_REPRISE_2026-10-20.md),
[plan coordonné](../rapports/P17D_P18_P19_PLAN_REPRISE_2026-10-20.md),
[P17d](../rapports/P17D_REPRISE_2026-10-20.md) et [P18](../rapports/P18_REPRISE_2026-10-20.md).

## Dossier historique du 19 octobre (conservé)

19 octobre 2026, lot P19. Ce dossier permet au propriétaire de décider sur des preuves distinctes :
code, tests, navigateur, fournisseurs, appareils. Il ne contient aucune preuve nouvelle d'exécution.

**Règle de mise en ligne.** Toute mise en ligne, toute ouverture de capacité et toute publication
exigent une **demande humaine explicite**, puis une **preuve de révision servie** (identifiant du
déploiement, HEAD et empreintes du gel) et les **parcours rejoués sur la révision publiée**. Ni ce
dossier, ni le prompt P19, ni la règle générale de livraison du propriétaire ne valent cette demande
(préambule §4, prompt P19, `CLAUDE.md` ANTSIA).

## 1. Ce qui est vérifié

| Objet | Preuve | Date | Portée et réserve |
|---|---|---|---|
| Charte P01 et P01b : jetons, contrastes calculés, isolation DIASPORALE et console | tests `packages/ui` (214, puis 246 ciblés ; 302, puis 334 au paquet), 9 tests de cliquets, typage et lint ; 139 tests DIASPORALE ; détail en [01 §3](01_VERSIONS_CANDIDATES.md) | 18/10 | contrastes **calculés**, pas mesurés au rendu ; fichiers du thème modifiés le 19/10 à 01 h 15 |
| Navigation P02 | 379 tests de la coque, 438 avec i18n, 162 de l'application, 190 de `packages/api`, 28 tests de cliquets, typage 0 erreur ×3 ; DIASPORALE inchangée (254 ✓ / 5 ✗ préexistants) | 18/10 | `routes.ts`, `network.tsx`, `network-shell.tsx` modifiés depuis |
| Rendu P01, P01b, P02 (recette partielle) | [`docs/recette/refonte-vague1-2026-10-18/README.md`](../../../recette/refonte-vague1-2026-10-18/README.md), neuf captures | 18/10 | navigateur intégré à largeurs émulées ; ni appareil, ni lecteur d'écran, ni zoom réel, ni DIASPORALE, ni console |
| Contrats P06 (PUBLIC-V1, COMMAND-V1) | ANTSIA 38 tests ; PRO.GA 15 tests (85 assertions) et 736 tests du domaine pur ; contre-épreuve d'un octet | 18/10 | octets inchangés depuis ; aucune application, aucun échange réel ; `compatibility.test.ts` devenu faux (K-07) |
| Liens du dossier d'étude (P00) | 109 liens relatifs, 0 cassé | 18/10 | contrôle documentaire |

Rien d'autre n'est vérifié. Les preuves historiques PA3 à PA8 ne valident ni PA9 ni PA10, ni aucun
lot de cette étude.

## 2. Ce qui n'est pas vérifié

| Domaine | Lots | État |
|---|---|---|
| Publications, fil immersif, iCom, corrections d'accessibilité | P03, P04, P05, P18b | présents dans le code ; tests écrits, jamais exécutés |
| Boutiques, liaison, transport, catalogue, contact | P07, P08, P09, P10 | idem, dans les deux dépôts |
| Préparation, paiement, achats | P11, P12 (partiel), P13 (partiel) | idem ; aucun fournisseur |
| Services, emploi, avis et suites | P14, P15, P14B | idem ; avis client des services sans transport (DP-39) |
| Thèmes au choix du membre (non inscrit dans EXECUTION.md à 02 h 12) | — | en cours d'écriture |
| Confiance transverse | P16 (C1 à C7) | idem |
| Conversation contextuelle | CC-1, CC-2a, CC-2b, CC-3a (en cours) | contrat accepté ; code en cours d'écriture |
| Fédération, fil matérialisé | PA9, PA10 (hors étude) | sources non commitées, vérifications différées |
| Accessibilité et performance mesurées | P18b | protocole prêt (P18A §4), aucune mesure |
| Natif | P17b à P17d | non lancés |
| Toute recette réelle, tout fournisseur, tout appareil physique, toute publication | — | rien |

## 3. Bloquants

Détail par version en [01 §4–§7](01_VERSIONS_CANDIDATES.md). Les bloquants communs à toute
version :

1. **DP-01** : la vérification n'est pas autorisée.
2. **Arbre en écriture active** (CC, P14B, DIASPORALE et un travail de thèmes non inscrit, jusqu'à
   02 h 11 au moins) : aucun gel possible.
3. **Dette de compilation** : 110 erreurs de type Convex au 18/10 à 21 h 50, avant six lots
   supplémentaires ; défauts connus K-04 et K-07 à corriger avant le gel ([02 §6](02_GEL_ET_VERIFICATION.md)).
4. **Espace disque** : 4,3 Gio libres (PR-07).

Bloquants propres : B attend DP-04, DP-05, DP-37 et PR-01 ; C attend en plus DP-10 à DP-14 pour
tout ce qui touche à l'argent, et DP-17 pour l'emploi ; D attend DP-26 à DP-33 et PR-06.

## 4. Risques

**Acceptables pour un pilote A, puis B restreint, sur données de recette**, à condition d'être
annoncés :

| Risque | Condition d'acceptation |
|---|---|
| Fil borné (200 sources) et fil matérialisé PA10 non prouvé | avertissements « Fil incomplet » et « Fil en préparation » visibles ; pilote de petite taille |
| Vidéos sans sous-titres (A08) | option (b) de DP-21 choisie et la limite annoncée avant le pilote |
| Constats d'accessibilité mineurs non traités (A20 à A45 en partie) | A-10 prouve qu'aucun parcours essentiel n'est bloqué |
| Budgets de performance mesurés seulement sur appareil de référence | P18b réalisé avant toute ouverture élargie |
| Conservation non fixée (`null`) pour les candidatures et les conversations contextuelles | données de recette seulement ; aucune purge annoncée comme légale |
| Relecture des mandats PRO.GA toutes les quinze minutes, délai non mesuré | peu de vendeurs ; indicateur suivi ([05 §6](05_ACTIVATION_ET_RETOUR_ARRIERE.md)) |
| URL d'une pièce de message valable jusqu'à la purge du blob (limite partagée avec la messagerie personnelle, P16) | limite connue et annoncée |
| Révocation de liaison seulement locale (DP-19 non activée) : lettres mortes possibles | surveillance des lettres mortes |
| Jeton d'appel commercial déjà émis valable jusqu'à 60 secondes après un retrait | durée courte documentée (P10) |
| DIASPORALE garde ses comportements A07 et A11 | aucune régression chez elle |

**Non acceptables, quel que soit le pilote** : encaissement réel ; données de production ;
publication sans `verify` vert ni recette ; `auto_verified` sans liste de secteurs restreints ;
promesse native ; « payé » affiché sans preuve serveur ; ouverture d'une politique sans demande
explicite ; cliquet assoupli ou fichier généré édité pour obtenir un vert.

## 5. Preuves disponibles

| Preuve | Emplacement |
|---|---|
| Rapports de lot et leurs bilans | [`rapports/`](../rapports/) |
| Résultats chiffrés P01, P01b, P02, P06 | rapports correspondants ; EXECUTION.md (revérifications du coordinateur) ; [PRO.GA docs/18 §4](../../../../../PRO_GA/docs/18_CONTRATS_COMMERCE_ANTSIA.md) |
| Recette partielle de la vague 1 | [`docs/recette/refonte-vague1-2026-10-18/`](../../../recette/refonte-vague1-2026-10-18/README.md) |
| Contrats normatifs | [`docs/contrats/`](../../../contrats/) |
| Décisions | ADR 0017 à 0025 ([index](../../../adr/README.md), à compléter : K-21) |
| Passations PRO.GA | [docs/18 à docs/26](../../../../../PRO_GA/docs/) |

## 6. Inventaires

**Source** (relevé en lecture le 19/10/2026 à 01 h 37 ; il bouge tant que des sessions écrivent) :

| Dépôt | Branche | HEAD | Entrées `git status` | `convex/_generated` |
|---|---|---|---|---|
| ANTSIA | `codex/pa4-identite-session` | `9eaff40` | 602 (244 modifiées, 358 non suivies) ; 618 à 02 h 12 | suivi, `api.d.ts` modifié, périmé |
| PRO.GA | `feat/antsia-social-commerce` | `9497f22` | 187 | suivi, jamais régénéré pour P08–P15 |

Machine : 4,3 Gio libres sur `/System/Volumes/Data` ; Node par défaut v25.9.0 ; Node 22 présent
sous `/opt/homebrew/opt/node@22/bin`.

**Tables** : 39 tables commerciales ANTSIA et 52 PRO.GA inventoriées par P16 (§2.1, §2.5), plus
quatre tables de la conversation contextuelle (`contextualThreads`, `contextualMessages`,
`contextualPersonStates`, `contextualPolicies`), déjà agrégées par `convex/schema.ts`.

**Tâches planifiées** (identifiants relevés en lecture) : ANTSIA 34, dont sept commerciales
(`commercial-drain-crm`, `commercial-purge-closed`, `commercial-revalidate-calls`,
`checkout-purge-private-bodies`, `payment-purge-private-bodies`, `purchase-purge-private-bodies`,
`jobs-drain-applications`) et cinq DIASPORALE ; PRO.GA 26, dont quatorze `pro-commerce-*`. Aucun
identifiant non ASCII ni doublon relevé ; le cliquet `crons-contract` reste juge.

**Portes d'ouverture** : [05 §3](05_ACTIVATION_ET_RETOUR_ARRIERE.md) (quatre sans écran).
**Configuration** (noms seulement) : [05 §3](05_ACTIVATION_ET_RETOUR_ARRIERE.md).
**Routes et surfaces** : matrice S1 à S13 de [P18A §1.1](../rapports/P18A_AUDIT_STATIQUE.md),
complétée par P14 (`/mes-demandes`, `/mes-demandes/[requestId]`,
`/boutique/[handle]/{devis,rendez-vous,prestation}/[offerRef]`) et P15 (`/mes-candidatures`,
`/boutique/[handle]/emplois/…`, `/boutiques/[handle]/emplois/[jobRef]`).

## 7. Versions des contrats et empreintes

Empreintes SHA-256 relevées en lecture le 19/10 vers 01 h 40 dans les deux dépôts. L'égalité des
octets est un inventaire ; la parité est prouvée par les tests de conformité, qui n'ont tourné que
pour P06 (18/10).

| Contrat | Version | Implémentation jumelle | Empreinte documentée | Relevé ANTSIA = PRO.GA |
|---|---|---|---|---|
| PRO-COMMERCE-PUBLIC-V1 et PRO-COMMERCE-COMMAND-V1 | 1 et 1 | `commerce/` (manifeste révision 1) | `MANIFEST.json` `0ad170ac60f7e81576e38bd43273b029b4088720272fa35bfdec2e1de1d755f0` (P06, docs/18) | oui, même empreinte |
| PRO-COMMERCE-LINK-V1 | 1 | `commerce-link.ts` | — | `38cc048996707b4b15f5e5eb6e6cdb4ac2c0a23bc74cddfdf05d1e9e4bb8641c` |
| PRO-COMMERCE-CATALOG-READ-V1 | 1 | `commerce-catalogue.ts` | — | `fe005b55e6c08626d58f1b210a000f87a8e43121edfe66088e019e068dc0dc0d` |
| PRO-COMMERCE-INQUIRY-CONSENT-V1 | 1 | `commerce-inquiry.ts` | consentement `2026-10-18-p10-v1` | `46c740594e5ff23bff2f8ddf09d3f161ef51a630ade84b3836ce779b86bb095c` |
| PRO-COMMERCE-CHECKOUT-CONTROL-V1 | 1 | `commerce-checkout.ts` (modifié le 19/10 à 00 h 46, K-03) | — | `51c71154bd48f872c38aca398060fecb3d03c821d37547fd6895862d6cb8d2b7` |
| PRO-COMMERCE-PAYMENT-CONTROL-V1 | 1 | `commerce-payment.ts` | consentement `2026-10-18-p12-v1` | `90f234825e0e5bb0acefb8f79d4084f53abd67cca09d744efb286a01f32a4774` |
| PRO-COMMERCE-ORDER-CONTROL-V1 | 1 | `commerce-orders.ts` | réception `2026-10-18-p13-v1` | `50cb0950c343a3af8aa88eb3a0e6c6c134257a928699bbd4af9d126f7b46bc90` |
| PRO-COMMERCE-SERVICE-CONTROL-V1 | 1 | `commerce-services.ts` | `cb8f418ce38e262e886c4f2f6444c5281a6f53a2f9f08f1afdfdcbc1e338de6c` (contrat P14) | identique au document |
| PRO-COMMERCE-JOBS-V1, APPLICATION-CONTROL-V1, APPLICATION-FILES-V1 | 1 | `commerce-jobs.ts` | `1f63e4da…214b9` (P15) | `1f63e4da4eb4bec9d95502316d9efda3cf1e97cef5a058962fdc00bac57214b9`, conforme |
| PRO-COMMERCE-TRANSPORT-TEST-V1 | 1 | pas de module jumeau ; profil de recette `antsia-commerce-test-v1` | — | — |
| FEDERATION-INBOX-V1, RESEAU-PUBLIC-V1 | transport ; PA9 | ANTSIA | — | — |
| CONVERSATION-CONTEXTUELLE-V1 | accepté le 19/10 | `packages/social-domain/src/contextualMessaging.ts` et module moteur, en cours | — | non relevé (écriture en cours) |

`commerce-marketplace.ts` (répartition) n'existe que dans PRO.GA : ce n'est pas un jumeau.

## 8. Procédure d'activation (résumé)

1. DP-01, puis gel, `verify` vert dans les deux dépôts et inventaires « avant = après »
   ([02](02_GEL_ET_VERIFICATION.md)).
2. Recette de la version retenue ([03](03_PARCOURS_DE_RECETTE.md)) et, si le propriétaire le décide,
   pilote utilisateur ([04](04_PILOTE_UTILISATEUR.md)).
3. Demande explicite de publication ; publication de la révision gelée ; parcours rejoués sur la
   révision servie : verdict « publié et vérifié ».
4. Ouverture des capacités une à une, dans l'ordre de [05 §5](05_ACTIVATION_ET_RETOUR_ARRIERE.md),
   chacune sur demande explicite, avec ses indicateurs et ses seuils.
5. Retour arrière par fermeture de la porte serveur, jamais par purge ; suivi, libérations,
   retraits et remboursements des engagements existants maintenus.

## 9. Ce que le propriétaire peut trancher dès maintenant

Sans attendre de preuve nouvelle, dans cet ordre :

1. **DP-01** : lever « Continuer sans vérifier » pour le gel commun, dès que CC, P14B et DIASPORALE
   ont déclaré leur fin d'écriture, et **PR-07** : libérer de l'espace disque.
2. **DP-02** : retenir la version A pour le premier pilote (proposition de [01 §8](01_VERSIONS_CANDIDATES.md)),
   et **DP-38** : y accepter ou non les surfaces commerciales visibles et vides que rien ne ferme
   aujourd'hui.
3. **DP-21** : sous-titres, lot ou limite déclarée, avant tout pilote qui sert des vidéos.
4. **DP-04, DP-05, DP-37** : `review` sans `auto_verified`, et la porte d'ouverture des politiques
   sans écran, pour préparer la version B.
5. **PR-05** : désigner participants et vendeurs de recette.
6. En parallèle, sans bloquer A ni B : DP-10 à DP-14 avec les partenaires de paiement, DP-17 et
   DP-18 avec un conseil compétent.
