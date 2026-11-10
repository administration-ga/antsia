# ANTSIA — Marketplace et espaces spécialisés

**Date : 21 octobre 2026 · Version : 1 approuvée · Statut : IMPLÉMENTATION AUTORISÉE**

Ce dossier répond à la demande de véritables boutiques, d’une marketplace de services, de rencontres et de pages presse professionnelles. Le propriétaire a validé le plan le 21 octobre 2026 et demandé l'exécution automatique de MP00 puis des lots suivants dans l'ordre, en préservant l'autre session. L'avancement réel et les preuves sont consignés dans [EXECUTION.md](EXECUTION.md).

## Recommandation principale

**Une activité possède une page sociale et un espace professionnel relié, sous une même identité.** La page permet de suivre, publier et discuter. L’espace spécialisé possède sa navigation, ses fiches et ses outils métier, comme un véritable site. Le passage entre les deux est explicite et conserve le contexte.

Une entreprise vendant des vêtements et proposant des retouches conserve une seule page : sa boutique présente ses produits et son espace services propose les retouches. Le commerçant ne recrée pas un compte par fonction. Une personne peut administrer plusieurs activités distinctes si ses droits le permettent.

| Famille | Expérience proposée |
|---|---|
| **Boutiques** | Marketplace générale ; boutiques professionnelles, rayons, collections, recherche, filtres métier, variantes, paniers et suivi d’achat |
| **Services** | Marketplace de prestataires ; portfolios, forfaits, demandes de devis et rendez-vous, avec suivi de prestation |
| **Rencontres** | Deux espaces distincts, **confirmés par le propriétaire** : réseau professionnel et rencontres personnelles entre adultes |
| **Presse** | Page sociale du média et véritable site éditorial : une, rubriques, articles, auteurs et rédaction |

Le visiteur entre dans un univers spécialisé, avec un bouton permanent **Retour à ANTSIA**. Il conserve sa session. Le site ne l’envoie pas dans l’interface de gestion PRO.GA pour consulter une offre.

## Objectifs et périmètre de la première version

1. Créer une activité et comprendre ce qui lui manque pour publier ou encaisser.
2. Trouver une offre dans tout le catalogue admissible, avec des filtres adaptés à son métier.
3. Réaliser un achat ou une demande de prestation avec un état commercial fiable.
4. Entrer dans chaque espace et revenir au contenu social d’origine sans perdre le contexte.
5. Séparer les habilitations de rédaction et les finalités de rencontres, avec des droits vérifiés côté serveur.

| Priorité | Contenu |
|---|---|
| **P0 — version cible** | Espaces professionnels, catalogues et filtres, variantes et commandes mono-vendeur, devis/rendez-vous/forfaits, paiements des rails admis, profils professionnels, rencontres personnelles sous admission, presse avec circuit éditorial |
| **P1 — compléments** | Favoris de produits et avis de prestation vérifiés, après leurs modèles et leur recette propres ; pas de bouton vide dans la première livraison |
| **P2 — extensions distinctes** | Paiement multivendeur unique, acomptes/jalons avancés, paywall de presse et intégration native complète |

La progression peut rendre un catalogue ou un rendez-vous utilisable avant le paiement. Cette ouverture partielle ne constitue pas la livraison du parcours commercial complet. Les critères et cibles de recette sont détaillés dans le document des lots.

## Documents à lire

1. [Architecture et parcours communs](01_ARCHITECTURE.md) : séparation des espaces, navigation, données, gestion et responsive.
2. [Boutiques et marketplace de produits](02_BOUTIQUES.md) : exemple mode, filtres, variantes et parcours d’achat.
3. [Marketplace de services](03_SERVICES.md) : devis, rendez-vous, forfaits et espace prestataire.
4. [Rencontres professionnelles et personnelles](04_RENCONTRES.md) : deux finalités et deux admissions distinctes.
5. [Presse et rédaction](05_PRESSE.md) : portail média, articles et circuit éditorial.
6. [Paiements et configuration des vendeurs](06_PAIEMENTS.md) : Airtel Money, Moov Money, carte, PayPal et reversements.
7. [Lots d’implémentation et prompts](07_LOTS_ET_PROMPTS.md) : ordre, dépendances, responsabilités et critères de sortie.
8. [Inventaire et sources](08_INVENTAIRE_ET_SOURCES.md) : code consulté, lacunes et références officielles.

Suivi de réalisation : [exécution et preuves](EXECUTION.md), [rapport de livraison MP14](16_RAPPORT_LIVRAISON_MP00_MP14.md), [contrats catalogue V2](10_CONTRATS_CATALOGUE_V2.md), [services](11_SERVICES_MP06.md), [préparation financière](12_PREPARATION_FINANCIERE_MP07_MP08.md), [tranche professionnelle](13_PROFESSIONNELS_MP09.md), [presse](14_PRESSE_MP12_MP13.md), [admission des candidats](15_ADMISSION_MP14.md).

## Ce que l’existant permet de réutiliser

Les sources contiennent déjà pages sociales, boutiques rattachées aux pages, catalogue reflété depuis PRO.GA, collections, variantes, panier mono-vendeur, conversations commerciales, devis et réservations. Ces briques ne constituent pas encore l’expérience professionnelle demandée.

L’inventaire relève notamment :
- filtres actuels limités à type, collection et texte ;
- absence de marketplace produits générale et catalogue services non exhaustif ;
- absence de retour social conservant le contexte ;
- absence de module de rencontres et de rédaction d’articles ;
- capacités commerciales encore fermées dans le registre d’activation ;
- aucun adaptateur de paiement enregistré dans le registre PRO.GA consulté.

**Présence de sources, fonctionnement vérifié et activation en production restent trois états distincts.** Les anciens résultats de tests ne valident pas les fonctions nouvelles de ce plan.

## Décisions A01–A10 approuvées

| Référence | Proposition |
|---|---|
| A01 | Une page sociale par activité, avec capacités Boutique, Services et/ou Média ; plusieurs vues professionnelles possibles |
| A02 | ANTSIA porte les expériences et le social ; PRO.GA reste maître du catalogue, stock, devis, commandes, agenda et registre de paiement |
| A03 | Tout membre admis peut préparer son espace ; publication graduée selon une politique dédiée, et encaissement soumis aux droits et à l’admission du prestataire |
| A04 | Navigation spécialisée avec retour au contexte social, sur téléphone, tablette et ordinateur |
| A05 | Catalogue global multivendeur ; premier checkout mono-vendeur, paniers conservés par boutique et achats séparés |
| A06 | Rencontres professionnelles et personnelles séparées — **choix déjà confirmé** ; participation personnelle volontaire et réservée aux adultes selon une preuve à définir |
| A07 | Médias : circuit rédactionnel avec validation, versions et corrections publiques ; badge officiel réservé aux institutions |
| A08 | Conserver le modèle de répartition P12 (90 %/85 % vendeur ou contrat) ; contractualiser la collecte et les reversements avant activation réelle |
| A09 | Implémenter des connecteurs séparés ; ouvrir seulement les moyens effectivement compatibles avec pays, devise, entité et contrat |
| A10 | Livraison progressive par capacité ; chaque spécialité doit passer sa recette avant ouverture |

Les dix décisions sont approuvées. La preuve de majorité, les contrats des prestataires, les frais, délais et règles de retour restent des conditions de mise en service à documenter ; la validation du plan ne constitue pas leur preuve.

## Paiements : point de faisabilité

Airtel Money et Moov Money sont à qualifier avec leurs contrats locaux ; la carte nécessite un prestataire d’acquisition accepté pour l’entité. PayPal indique actuellement le Gabon comme « Send only » dans sa documentation d’onboarding vendeur et ne liste pas XAF dans ses monnaies API : le plan prévoit son connecteur conditionnel, sans le présenter comme encaissement gabonais disponible. [Sources et matrice](06_PAIEMENTS.md).

## Périmètre et validation

Première cible : **ANTSIA Web responsive**, avec contrats réutilisables pour le natif. L’intégration native complète est un sous-lot explicite, pas une capacité annoncée à partir du seul Web. Les réseaux voisins conservent leur comportement.

L'exécution des lots est autorisée. La création de comptes marchands, la transmission de pièces, les contrats et l’activation de fonds réels gardent leurs étapes propres. Voir [ADR-0034](../../adr/0034-marketplace-et-espaces-specialises.md) et [référence MP00](09_REFERENCE_MP00.md).

- [Rédaction et sites médias MP12–MP13](14_PRESSE_MP12_MP13.md)
