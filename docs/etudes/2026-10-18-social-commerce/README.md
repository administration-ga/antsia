# ANTSIA — Étude de refonte sociale et commerciale

**18 octobre 2026 · Étude, architecture et vingt prompts d'implémentation · ANTSIA uniquement**

L'implémentation a commencé après cette étude. Son état actuel, les réservations des fichiers
et le relais de la session Claude se lisent dans [EXECUTION.md](EXECUTION.md). Les bilans de
l'étude ci-dessous décrivent la livraison documentaire initiale ; ils ne remplacent pas les
rapports d'implémentation et leurs limites de vérification.

**État au 19 octobre 2026 (11 h).** Les sources des lots P01–P16, P14B, P18b et CC-1 à CC-5, avec
PA9 et PA10, passent le `bun run verify` commun n° 2 (code 0 ; tests Convex 2544/2544) et sont
commitées sur `codex/pa4-identite-session`. Côté PRO.GA, les sources commerce sont commitées sur
`feat/antsia-social-commerce`, après une vérification ciblée : seule une dérive du socle installé
reste, antérieure et hors commerce. Une compilation et des tests verts ne valent pas recette : les
recettes réelles, configurations, activations et décisions du propriétaire restent ouvertes
([pilote/](pilote/), [EXECUTION.md](EXECUTION.md)).

**Reprise P14 du 20 octobre 2026.** Les corrections de reprise des intentions, d’accord sur les
services et de conservation des engagements sont décrites dans le
[bilan daté P14](rapports/P14_REPRISE_2026-10-20.md). Ces changements sont en sources,
sans nouvelles vérifications ; les résultats du 19 octobre ci-dessus ne les couvrent pas.

**Reprise P15 du 20 octobre 2026.** Les corrections des candidatures privées, de leur
reprise et de la délivrance des CV sont décrites dans le
[bilan daté P15](rapports/P15_REPRISE_2026-10-20.md). Les scénarios sont écrits seulement ;
la conservation, la recette croisée et l’activation restent ouvertes.

**Reprise P16 du 20 octobre 2026.** Le [bilan confiance et données](rapports/P16_REPRISE_2026-10-20.md)
complète l’inventaire P14/P15 et la matrice de menaces. Les corrections et verrous d’activation
restent en sources, sans nouvelles vérifications ; P16 n’est pas déclaré éprouvé.

## La proposition

**Complément UX du 20 octobre 2026 — captures et vidéos mobiles.** Le
[dossier noms et expérience responsive](../2026-10-20-experience-sociale-responsive/README.md)
analyse les références fournies et adapte les parcours à téléphone, tablette et ordinateur.
Il découpe huit lots U01–U08, sans renuméroter P00–P19. U01 est raccordé en source ANTSIA
(Direct, En live, Stories, Replays, Accueil, Explorer, Mon réseau, Enregistrés), sans contrôle
exécuté ni rendu constaté. Les autres lots sont planifiés ; les preuves historiques ci-dessous
ne les valident pas.

**Suite U02** : la [navigation responsive](../2026-10-20-experience-sociale-responsive/rapports/U02_NAVIGATION_RESPONSIVE_2026-10-20.md)
est raccordée en source Web : barre téléphone sous 768 px, rail compact jusqu'à 1199 px puis
nommé dès 1200 px, accès Boutiques et cadre Messages. Créer est conservé jusqu'au vrai Clips U04.
Scénarios écrits seulement, rendu non constaté ; U03–U08 restent planifiés.

**ANTSIA devient le lieu où l'on découvre les personnes, leurs contenus et leurs offres, où l'on discute et où l'on achète. PRO.GA demeure le système qui gère l'activité.** Le propriétaire a confirmé que le système évoqué oralement sous le nom « Pro.gram » est bien PRO.GA.

Le produit combine quatre références : présentation des publications inspirée d'Instagram, progression verticale inspirée de TikTok, conversations et appels inspirés de WhatsApp, pages et relations inspirées de Facebook. Les boutiques, services et emplois s'insèrent dans une interface commune, avec des actions adaptées : **acheter, demander un devis, réserver, candidater**.

La charte proposée conserve le **fond blanc et les cartes beige en clair**, remplace la dominante bleue par une signature **encre et prune**, et propose un sombre **charbon et rose prune**. Les médias dominent ; la décoration reste discrète. Les couleurs, dimensions et comportements sont spécifiés pour ANTSIA, pas attribués à un design-system privé.

## Lire le dossier

| Document | Ce qu'il apporte |
|---|---|
| [00 — Vision et décisions](00_VISION_ET_DECISIONS.md) | Positionnement, personas, exigences, étapes et arbitrages |
| [01 — Benchmark et sources officielles](01_BENCHMARK_SOURCES.md) | Instagram, TikTok, WhatsApp, Facebook : faits documentés, adaptations et limites |
| [02 — Audit ANTSIA](02_AUDIT_ANTSIA.md) | Briques existantes, points d'entrée du code et incompatibilités |
| [03 — Nouvelle charte](03_DESIGN_SYSTEM.md) | Palette claire/sombre, contrastes calculés, typographie, composants, jetons et responsive |
| [04 — Navigation, publications et scroll](04_PARCOURS_FIL_ET_PUBLICATIONS.md) | Schémas d'écrans, gestes, lecteur unique, retour au contenu, accessibilité |
| [05 — Messages et appels](05_MESSAGES_ET_APPELS.md) | iCom, contact commercial, états d'appel, Web/natif et confidentialité |
| [06 — Boutiques, services et emploi](06_BOUTIQUES_SERVICES_EMPLOI.md) | Modèles par activité, ouverture progressive, achat, devis, rendez-vous, candidature |
| [07 — Audit PRO.GA](07_AUDIT_PRO_GA.md) | Catalogue, stock, commandes, paiements, CRM, recrutement et raccords manquants |
| [08 — Architecture d'intégration](08_ARCHITECTURE_INTEGRATION.md) | Sources de vérité, liaison, contrats, événements, commande/stock/paiement et reprise |
| [09 — Feuille de route](09_FEUILLE_DE_ROUTE.md) | Ordre, dépendances, responsabilités, activation et couverture des exigences |
| [10 — Recette, mesures et risques](10_RECETTE_MESURES_ET_RISQUES.md) | Protocole utilisateur, matrice de tests, qualité et preuves attendues |
| [11 — Méthode et sources complémentaires](11_METHODE_ET_SOURCES_COMPLEMENTAIRES.md) | Méthode, skills, accessibilité, LiveKit et candidat de paiement |

Lecture rapide : **00 → 03 → 06 → 09**. Lecture technique : **02 → 07 → 08 → 10**. Les sources officielles sont accessibles dans 01 et 11 : **18 références primaires**, avec leur portée et leurs limites.

## Ce que l'audit change dans le plan

- ANTSIA dispose déjà des composants sociaux et d'iCom. La nouvelle présentation réutilise cette base.
- Le pager vertical existe pour les stories, mais pas encore pour le fil de publications.
- Les pages actuelles exigent une adhésion vérifiée et leur porte anonyme est réservée aux pages officielles. La boutique progressive exige des capacités et projections dédiées.
- Le contact personnel exige une relation préalable : la question acheteur–vendeur nécessite un canal commercial autorisé.
- PRO.GA possède catalogue, variantes, stocks, devis, commandes, agenda et recrutement. Le parcours d'achat ANTSIA n'est pas raccordé ; aucun adaptateur fournisseur de paiement n'est enregistré dans le code audité.
- Les échanges entre les deux systèmes demandent des producteurs, un transport adapté et des handlers métier ; un événement seulement reçu ne prouve pas un catalogue synchronisé.

Ces constats proviennent de la lecture actuelle du source, pas d'une preuve de production. Les évolutions concurrentes de PostCard/partage/routes sont conservées et devront être relues avant développement.

## Les vingt prompts

Chaque fichier contient un prompt copiable, ses dépendances, son périmètre et ses critères de recette. Appliquer le [préambule commun](prompts/PROMPT_COMMUN.md), puis **un seul lot à la fois**.

| Préparer et refondre | Construire le commerce | Compléter et vérifier |
|---|---|---|
| [P00 Cadrage](prompts/P00_CADRAGE.md) | [P06 Contrats](prompts/P06_CONTRATS.md) | [P14 Services](prompts/P14_SERVICES.md) |
| [P01 Charte](prompts/P01_CHARTE.md) | [P07 Boutiques](prompts/P07_BOUTIQUES.md) | [P15 Emploi](prompts/P15_EMPLOI.md) |
| [P02 Navigation](prompts/P02_NAVIGATION.md) | [P08 Liaison et transport](prompts/P08_LIAISON_TRANSPORT.md) | [P16 Confiance et données](prompts/P16_CONFIANCE.md) |
| [P03 Publications](prompts/P03_PUBLICATIONS.md) | [P09 Catalogue](prompts/P09_CATALOGUE.md) | [P17 Téléphone natif](prompts/P17_MOBILE_NATIF.md) |
| [P04 Scroll](prompts/P04_SCROLL.md) | [P10 Contact commercial](prompts/P10_CONTACT_COMMERCIAL.md) | [P18 Accessibilité et performance](prompts/P18_PERFORMANCE_ACCESSIBILITE.md) |
| [P05 iCom](prompts/P05_ICOM.md) | [P11 Commande et stock](prompts/P11_COMMANDE_STOCK.md) | [P19 Pilote](prompts/P19_PILOTE.md) |
| | [P12 Paiement](prompts/P12_PAIEMENT.md) | [Sources partielles, paiement fermé, vérifications différées](rapports/P12_PAIEMENT.md) |
| | [P13 Achat et suivi](prompts/P13_PARCOURS_ACHAT.md) | [Sources partielles, panier et suivi privé ; vérifications différées](rapports/P13_ACHAT_ET_SUIVI.md) |

La première tranche visible recommandée est **P01–P05 après P00**. La définition des contrats P06 peut avancer en parallèle avec des propriétaires distincts. L'activation commerciale attend la liaison, le catalogue, les autorisations et les preuves de paiement prévues.

## Ce qui est livré et ce qui reste à exécuter

Reprise native du 20 octobre : [cadrage P17](rapports/P17_PLAN_REPRISE_2026-10-20.md),
[sources P17b](rapports/P17B_REPRISE_2026-10-20.md) et
[sources P17c](rapports/P17C_REPRISE_2026-10-20.md). Le client Expo, son fil, sa messagerie
personnelle, l’hôte média et les notifications d’appel sont raccordés en source. Installation,
compilation, configuration Apple/Firebase, IDN natif et recette appareil restent ouverts.
P17c conserve les appels natifs fermés par défaut ; aucune vérification relancée.

Suite autorisée sans nouvel accord : [P17d](rapports/P17D_REPRISE_2026-10-20.md) prépare le
registre de preuves physiques et son lecteur, [P18](rapports/P18_REPRISE_2026-10-20.md)
apporte les corrections natives d’accessibilité/sobriété, puis
[P19](rapports/P19_REPRISE_2026-10-20.md) actualise le dossier pilote. Les essais, mesures,
compilations et le pilote réel restent non exécutés. Cette continuation ne vaut aucune
activation ou publication ; [réservations](rapports/P17D_P18_P19_PLAN_REPRISE_2026-10-20.md).

L'enchaînement des [correctifs P19](rapports/P19_CORRECTIFS_AUTOMATIQUES_2026-10-20.md) ajoute
les annonces accessibles d'achats/candidatures, la documentation des routes machine et une
admission durable des copies CV. La [suite DP-39](rapports/P19_AVIS_SERVICES_2026-10-20.md)
traite un avis privé de relecture des services, sous un profil distinct de PUBLIC. Les sources
et scénarios restent non exécutés ; gates P16, données, environnements et travaux de l'autre
session sont préservés. Le bilan documentaire P19 précédent reste historique.

Livré : étude sourcée, audits locaux, charte proposée avec seize calculs de contraste, parcours et schémas, architecture d'échange, plan de recette, vingt prompts et traçabilité des exigences.

Ce dossier ne modifie ni le thème actuellement servi, ni les sources applicatives, ni les sessions, ni le navigateur. Il n'exécute aucun paiement, test d'appel, entretien utilisateur ou déploiement. Les choix fournisseur, frais, politique de publication commerciale et obligations de conservation sont identifiés dans 00 ; ils ne sont pas inventés pour fermer le plan.

Références historiques conservées : [cahier ANTSIA](../../00_CAHIER_DES_CHARGES_ANTSIA.md), [plan initial](../../01_PLAN_IMPLEMENTATION_PROMPTS_ANTSIA.md), [ADR](../../adr/README.md). Les propositions de cette étude ne réécrivent pas les décisions acceptées : P00 prépare leurs compléments et les changements de périmètre.
