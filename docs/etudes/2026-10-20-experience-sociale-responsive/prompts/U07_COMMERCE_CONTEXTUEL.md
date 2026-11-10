# U07 — Commerce et actions contextuelles réelles

## Préambule

Appliquer le [plan responsive](../04_PLAN_IMPLEMENTATION.md), U03/U05/U06 et les capacités existantes P07–P16. Ce lot améliore la compréhension des portes commerciales ; **il n’active aucune capacité fermée**. Préserver PRO.GA, contrats privés, sessions, autres travaux et DIASPORALE. Aucun test, codegen, typage, lint, build, navigateur, serveur, appel réel, Git d’écriture, installation ou environnement.

## Périmètre et sources réutilisées

- `apps/antsia_ga/src/components/shops/{offer-card,offer-post-slot,public-offer-post-slot,member-storefront-screen,catalog-grid,shop-commerce-link}.tsx` et leurs DTO existants.
- Écrans checkout, achats, paiement, services et candidatures déjà branchés dans `apps/antsia_ga/src/components/` ; identifier leur fichier exact depuis la route réelle avant de réserver une édition.
- Autorités backend existantes : `convex/modules/shops/{catalog,checkout,purchases,payment,services,jobs}.ts`, politiques associées et registre `commerceActivation` ; commercial via `convex/modules/commercialMessaging/`.
- Routes de `apps/antsia_ga/src/lib/routes.ts`, liaisons PRO.GA et projections publiques/membres existantes. Aucun accès Convex interproduits ajouté.

## Actions et contrat de CTA

| Contexte réel | Action envisageable | Condition indispensable |
|---|---|---|
| Vitrine accessible | Voir la boutique | Route et projection courante autorisées |
| Produit préparable | Préparer une commande | Contexte checkout et options privées serveur disponibles ; ne vaut pas achat/paiement |
| Service sur devis | Demander un devis | Type d’offre, mandat, politique et admission serveur ouverts |
| Service sur réservation | Réserver | Créneau/options/capacité réels et confirmation applicable |
| Emploi ouvert | Candidater | Publication accessible et admission actuelle autorisée |
| Engagement payable | Payer | Intention privée, autorité et capacité de paiement effectivement ouvertes |
| Question commerciale | Poser une question / Contacter | Destination, acceptation et droits de conversation commerciale réels |

1. Choisir le CTA depuis le contexte/capacité serveur courant, jamais depuis le seul modèle visuel, une ancienne politique `enabled=true` ou une catégorie d’offre.
2. Garder un appel principal par contexte et des actions secondaires lisibles ; pas de catalogue de boutons identiques sur chaque publication. Le bouton ouvre le vrai parcours et transmet seulement ses références validées.
3. Revalider au clic et côté serveur. Si la capacité se ferme entre affichage et action, montrer le refus et la sortie utile ; aucune réparation implicite, nouvelle clé d’intention ou reprise d’un paiement inconnu.
4. Présenter prix, devise, variante, frais, disponibilité indicative et fraîcheur avec leurs vraies valeurs. Une disponibilité stale n’est pas du stock garanti ; un devis n’est pas un prix confirmé.
5. Conserver la confirmation explicite des changements de prix/frais/options et les reprises exactes après timeout. Les suivis/retraits/annulations historiques gardent leurs portes même quand une nouvelle admission est fermée.
6. Rendre le consentement demandé au bon moment, avec texte/version réels. Les champs sensibles restent dans les formulaires privés existants ; ne pas préremplir adresse, identité ou dossier d’un autre contexte.
7. Relier l’administration d’entreprise à PRO.GA selon les mandats existants. ANTSIA affiche vitrine, échanges et suivi autorisé ; aucun bouton « Gérer » ne crée une nouvelle identité ou un privilège d’entreprise.

## Dépendances et critères d’acceptation

- P16 reste fermé par défaut : aucune modification du registre, variable, seed ou bascule de console pour rendre la démonstration plus complète.
- Une publication/offre retirée perd son slot et son CTA selon les lectures courantes ; ancienne URL ou carte mémorisée ne suffit pas.
- Le public ne reçoit aucune donnée privée d’acheteur, commande, candidature ou message. Les commandes mutantes restent sous leurs portes authentifiées existantes.
- Les états indisponible, suspendu, en attente, inconnu et expiré ne sont pas annoncés comme succès ; la reprise d’un geste incertain réutilise les API et clés existantes.
- Aucun bouton Payer, Réserver ou Candidater fonctionnel n’est affiché sous une capacité serveur fermée ; l’explication de disponibilité reste sobre et honnête.

## Exclusions et preuve attendue

Pas de nouvelle comptabilité, nouvelle caisse, activation de paiement, publicité ciblée, abonnement payant ou contenu sponsorisé fictif. Ne pas dupliquer P08–P15, ni changer les contrats P06 pour une présentation. Rapporter la correspondance contexte→API→CTA et les capacités restées fermées. Les scénarios d’achat, paiement, réservation et candidature sont une recette future ; aucun engagement ni transaction réelle n’est exécuté par ce prompt.
