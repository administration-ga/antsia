# 02 — Vraies boutiques et marketplace de produits

**Spécification approuvée, implémentation en cours · 21 octobre 2026**

## 1. Expérience acheteur

La marketplace générale permet de découvrir des produits et des boutiques. Une boutique possède une devanture, des rayons, ses conditions et son identité. Les fiches ne ressemblent plus à une simple liste de publications.

Exemple : depuis une publication d’une boutique de mode, ouvrir le vêtement, choisir une taille et une couleur réellement disponibles, consulter les autres articles du rayon, puis revenir à la publication d’origine.

### Marketplace générale

Onglets Produits / Boutiques / Services. Recherche, catégorie, localisation approximative si pertinente, prix, disponibilité, remise et tri. Les favoris de produit, prévus en complément P1, et le suivi d’une page restent deux gestes distincts.

Les filtres de la marketplace traversent les vendeurs ; ceux d’une boutique sont limités à son catalogue. L’interface indique toujours le périmètre de recherche. Les suggestions ne mélangent pas un média d’actualité avec un vendeur sans annonce explicite.

### Boutique professionnelle

- Accueil : marque, bannière, présentation courte, collections et sélection du vendeur.
- Catalogue : rayons, recherche locale, filtres et tri.
- Services : seulement si cette activité en propose.
- À propos : activité, zone, horaires, modalités de contact et garanties réellement applicables.
- Livraison et retours : coûts, zones, délais, retrait et politique de retour avant achat.
- Page sociale : publications, Stories et directs accessibles par un lien clair.
- Panier et commandes : accessibles sans retourner dans les réglages du réseau.

Une sélection du vendeur porte le libellé « Notre sélection ». Ne pas inventer « Meilleures ventes » ou des ventes récentes à partir de simples vues ou de données de démonstration.

## 2. Taxonomie et filtres selon le métier

Séparer catégorie normalisée, collection commerciale et attribut technique.

| Exemple d’activité | Rayons ou catégories | Attributs utiles |
|---|---|---|
| Mode | Femme, Homme, Mixte, Enfant ; vêtements, chaussures, sacs, accessoires | Taille, pointure, couleur, matière, marque, coupe |
| Artisanat | Sacs, décoration, bijoux, textile | Matière, fabrication, dimensions, personnalisation |
| Épicerie | Boissons, alimentation, entretien | Quantité/unité, conditionnement, caractéristiques pertinentes |
| Informatique | Ordinateurs, téléphones, accessoires | Marque, capacité, compatibilité, état, garantie |

Ces exemples constituent des modèles éditables. Les catégories Femme/Homme servent au rangement des articles et n’infèrent aucune donnée personnelle sur l’acheteur.

Le vendeur sélectionne un métier, adapte ses collections et publie les attributs autorisés depuis PRO.GA. Les clés restent stables, traduisibles FR/EN et indépendantes du libellé affiché.

### Comportement précis

- Recherche dans toute la sélection admissible, pas seulement les cartes actuellement chargées.
- Plusieurs valeurs d’une facette : OU ; facettes différentes : ET.
- Filtres actifs visibles, suppression individuelle et Réinitialiser.
- Tris : sélection pertinente définie, nouveautés, prix croissant/décroissant ; popularité seulement si mesure fiable.
- Prix comparables dans une même devise ; « Sur devis » et « À partir de » gardent leur qualification.
- Filtrage côté serveur et curseur lié au vendeur, réseau, requête, tri et révision.
- Réinitialiser le curseur lors d’un changement de filtre ; conserver ces choix lors du retour d’une fiche.
- Pas de total calculé sur une fenêtre tronquée ; omettre les compteurs si leur exactitude n’est pas établie.
- Gérer zéro résultat, attribut retiré et offre révoquée, sans masquer la possibilité de modifier les filtres.

L’index multiboutique doit couvrir les offres éligibles avec pagination stable. Ne pas construire cette marketplace par huit boutiques et quelques offres récentes : ce serait une sélection, pas le catalogue général demandé.

## 3. Fiche produit et variantes

Galerie accessible, titre, vendeur, prix qualifié, options, stock indicatif daté, description, remise, frais et conditions. Le panier n’est possible qu’après sélection d’une variante complète, payable et disponible selon les règles.

Pour un vêtement : sélection progressive Couleur → Taille, avec combinaisons indisponibles désactivées et nommées. Un changement met à jour la photo, le prix exact, la référence et la disponibilité de la variante. Le front ne fabrique pas une variante absente de PRO.GA.

Les quantités, réservations, prix, frais et droits sont relus à la préparation de commande. Un montant corrigé doit être accepté explicitement ; une mise à jour de prix ne modifie pas une commande déjà engagée.

## 4. Paniers et achat

Recommandation : un panier conservé par boutique, regroupé dans « Mes paniers », avec **une commande et un paiement par vendeur** dans la première version. Le backend conserve son invariant mono-vendeur ; le changement de boutique ne détruit pas silencieusement le panier précédent.

Le panier reste limité aux bornes contractuelles existantes, sauf évolution explicitement testée. Aucun paiement multivendeur unique n’est annoncé. Une phase ultérieure pourra le traiter avec un prestataire compatible et une séparation complète des commandes/remboursements.

~~~mermaid
flowchart LR
    P[Post ou marketplace] --> F[Fiche produit]
    F --> V[Variante et quantité]
    V --> C[Panier de la boutique]
    C --> R[Prix, stock, remise et frais relus par PRO.GA]
    R --> A[Accord sur le total et les conditions]
    A --> Y[Paiement disponible et suivi]
    Y --> S[Commande puis remise et réception]
~~~

L’anonyme peut découvrir les offres explicitement publiques. Au geste nécessitant un compte, la connexion restaure la fiche et la variante ; elle ne commande pas automatiquement. La fiche publique doit rendre réellement son appel à l’action : le slot actuellement préparé mais non rendu est un correctif prévu.

## 5. Création et gestion côté vendeur

Assistant unique depuis « Créer mon espace professionnel » :

1. Choisir Boutique, Services ou les deux ; créer un brouillon.
2. Choisir une page existante admissible ou préparer une nouvelle page d’activité.
3. Configurer identité, métier, rayons, présentation et conditions ; prévisualiser aux trois formats.
4. Lier ou créer son activité via le parcours PRO.GA autorisé, avec preuve et consentement réels.
5. Synchroniser catalogue, variantes, prix et collections ; afficher état et date de synchronisation.
6. Configurer livraison, retrait, retours et moyens de paiement admissibles.
7. Publier les capacités éligibles après contrôle ; afficher celles restant à terminer.

Tout membre admis peut préparer un brouillon. La création/publication graduée d’une page commerciale requiert une politique dédiée à valider : ne pas desserrer la garde générique des pages institutionnelles. « Boutique publiée » et « Boutique pouvant encaisser » sont deux états.

Le tableau de bord ANTSIA propose présentation, rayons/collections, catalogue, demandes, commandes et paiements. Les écritures commerciales sont transmises à PRO.GA. Le lien vers la gestion complète PRO.GA reste disponible sans imposer cette interface au client.

## 6. Critères d’acceptation

- Depuis le fil, une fiche s’ouvre puis Retour à ANTSIA restitue le contenu et la position.
- Mode : Femme → Robes → Taille M → Beige filtre les résultats admissibles au-delà de la première page ; la requête partagée garde ses paramètres.
- Le choix d’options n’admet aucune combinaison inventée ; le panier utilise le prix de cette variante.
- Le dernier exemplaire demandé simultanément par deux acheteurs n’est attribué qu’une fois.
- Les paniers de deux boutiques restent distincts ; leurs checkouts restent mono-vendeur.
- Une offre retirée disparaît de la découverte et refuse une nouvelle vente, tout en conservant le suivi autorisé d’une ancienne commande.
- Téléphone, tablette, ordinateur, clavier, clair et sombre couvrent catalogue, fiche, filtres et panier.
- En déconnexion ou changement de personne, aucun panier ou brouillon privé n’est réadopté par un autre compte.
