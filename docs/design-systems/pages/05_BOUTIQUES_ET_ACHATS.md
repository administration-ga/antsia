# ANTSIA — Pages Boutiques et achats

Date : **2026-10-20** · Statut : **relevé DOM/CSS de la référence**, sans recette de l’application.

Source : [Boutiques et achats](https://claude.ai/artifact/AnLxkaqaai725ywzkrVk6b#page-524c6e6c308c).

Cette fiche transcrit le relevé des planches du canevas demandé.
Elle décrit les écrans dessinés et leurs règles visibles ; elle ne confirme pas
leur présence ou leur fonctionnement dans l’application du dépôt.

À lire avec le [socle commun](../00_SOCLE_COMMUN.md) et le
[registre des écarts entre référence et code](../08_ECARTS_REFERENCE_ET_CODE.md).

## 1. Inventaire des 13 planches

Les noms de fichiers sont ceux de la référence. Les points de suspension des routes
conservent les segments variables indiqués par le relevé.

| Fichier de planche | Route | Composition relevée | Actions dessinées |
|---|---|---|---|
| `Boutique.dc.html` | `/boutique/nzeng-couture` | Nom, handle, libellés Communauté et Produits ; catalogue avec prix, variantes et disponibilité ; emplois, activité et publications. | Suivre la page, Poser une question, ouvrir la vitrine publique. |
| `Catalogue.dc.html` | `/boutique/…/catalogue` | Recherche, type produit/service, collections, grille de 12 offres. | Afficher les offres. |
| `Offre.dc.html` | `/boutique/…/offres/…` | Média du produit, description, prix XAF, choix S/M/L/XL, quantité. | Ajouter au panier, Ouvrir le panier, Question, Préparer la commande, Partager l’offre publique. |
| `Contacter.dc.html` | `/boutique/…/contacter` | Question de 1 à 2 000 caractères ; acceptation préalable par la boutique. | Poser la question ; message, fichier et appel après acceptation. |
| `Panier.dc.html` | `/panier` | Brouillon d’un seul vendeur, 10 lignes au maximum, prix et frais à relire. | Changer la quantité, Mettre à jour, Retirer la ligne, Vider. |
| `Preparer.dc.html` | `/boutique/…/preparer/…` | Variante explicite, quantité, retrait/livraison, coordonnées conditionnelles, accord au vendeur, totaux à confirmer. | Préparer la commande, sans paiement sur cette planche. |
| `Paiement.dc.html` | `/mes-paiements/…` | Action nécessaire ; états distincts de paiement, commande, réserve et remboursement ; date observée. | Continuer chez le fournisseur, Rechercher le statut. |
| `Mes-achats.dc.html` | `/mes-achats` | Achats privés, états distincts, 10 éléments par page ; une page vide n’indique pas la fin des données. | Consulter le suivi ; accéder à Mes demandes pour les prestations hors paiement. |
| `Achat.dc.html` | `/mes-achats/…` | Référence, lignes avec prix exact et variantes, frais acceptés, remise, réception, reversement et historique. | Actualiser, Attester la réception avec accord, demander l’annulation avec motif, écrire au vendeur en privé. |
| `Mes-commandes.dc.html` | `/mes-commandes` | Préparations réservées/libérées, date, échéance, total, 10 éléments au maximum par page. | Ouvrir le suivi. |
| `Mes-paiements.dc.html` | `/mes-paiements` | Tentatives privées : Action nécessaire, En attente, Confirmée par le serveur ; date, total, 10 éléments au maximum par page. | Consulter la tentative. |
| `Mes-boutiques.dc.html` | `/mes-boutiques` | Liste de brouillons ; formulaire Produits/Services sur devis ; page admissible facultative et nom commercial. | Créer un brouillon, sans publication. |
| `Editeur-boutique.dc.html` | `/mes-boutiques/…` | Mon activité, Ma présentation, Mes offres, Publier ; aperçu, logo, demandes, signataire et mandats. | Enregistrer la présentation, choisir l’aperçu téléphone/ordinateur, traiter les demandes selon mandat. |

## 2. Catalogue, offre et disponibilités

La boutique présente les informations commerciales avec leur contexte temporel :
**Disponibilité indicative**, **Information ancienne** et date de mise à jour.
Ces libellés ne constituent pas une confirmation de stock au moment de commander.

La grille du catalogue dessine **12 offres**. Le relevé ne donne pas de limite
technique de catalogue à déduire de ce nombre.

L’offre sépare le média, la description, le prix en XAF, les variantes et la quantité.
La variante **S / M / L / XL** fait l’objet d’un choix explicite.
Le geste de partage porte sur **l’offre publique** ; paniers et adresses n’en font
pas partie.

| Composant dessiné | État ou information visible |
|---|---|
| Carte de produit | Prix, variantes et disponibilité indicative. |
| Information de disponibilité | Ancienneté signalée avec sa date de mise à jour. |
| Offre détaillée | Variante à choisir explicitement et quantité à renseigner. |
| Préparation | Totaux restant à confirmer ; aucun paiement établi par ce geste. |
| Tentative de paiement | Action nécessaire, En attente ou confirmation par le serveur. |

## 3. Formulaires et accords commerciaux

| Écran | Champs ou choix relevés | Contraintes et consentements |
|---|---|---|
| Contacter | Question. | De 1 à 2 000 caractères ; acceptation de la boutique requise avant message, fichier ou appel ; aucun transfert à PRO.GA. |
| Panier | Quantité par ligne. | Un vendeur et 10 lignes maximum ; relire prix et frais avant de poursuivre. |
| Préparer | Variante, quantité, remise par retrait ou livraison. | Variante explicite ; quantité de 1 à 999. |
| Préparer : coordonnées | Pays, ville, adresse, complément, instructions selon le mode de remise. | Champs conditionnels ; accord explicite de transmission au vendeur. |
| Achat : réception | Case d’accord pour attester la réception. | L’attestation est un geste distinct du paiement et du reversement. |
| Achat : annulation | Motif choisi. | Motifs : changement d’avis, retard, article incorrect, autre. |
| Mes boutiques | Produits ou Services sur devis, page admissible facultative, nom commercial. | Créer un brouillon ne publie pas la boutique. |
| Éditeur : présentation | Nom commercial, bio, spécialité, zone approximative, horaires, logo. | Bio d’au moins 10 caractères pour publier. |

Le brouillon du panier dure **24 h** dans l’onglet, pour le compte et le réseau
concernés. Après rechargement, l’adresse et l’accord doivent être saisis de nouveau.
Cette contrainte visible ne décrit pas un stockage réel vérifié dans l’application.

La préparation demande un accord de transmission **au vendeur**.
La page de contact indique séparément qu’aucun transfert à **PRO.GA** n’est réalisé.
Ces deux indications ne sont pas interchangeables.

## 4. Commande, paiement et réception : états distincts

La planche de paiement ne fusionne pas l’état du paiement, de la commande, de la
réserve et du remboursement. Elle affiche la date de l’observation.

**Continuer chez le fournisseur** et **Rechercher le statut** sont des actions ;
le geste lui-même ne confirme ni paiement, ni reversement, ni remise.

Le détail d’un achat conserve :

- La référence, les lignes, les variantes et le prix exact de chaque ligne.
- Les frais acceptés et les informations de remise.
- La réception, le reversement et leur historique.
- L’actualisation, l’attestation de réception avec case d’accord et l’annulation motivée.
- Le message privé au vendeur.

Les listes Mes achats, Mes commandes et Mes paiements conservent leurs états
propres. La pagination est dessinée avec **10 éléments par page**.
Pour Mes achats, une page vide ne signifie pas qu’aucune donnée ne suit.

## 5. Éditeur de boutique et boîte de demandes

Le parcours d’édition est ordonné en quatre étapes :

1. **Mon activité**.
2. **Ma présentation**.
3. **Mes offres**.
4. **Publier**.

L’enregistrement de la présentation est distinct de la publication.
L’aperçu propose **téléphone** et **ordinateur**.
Le formulaire montre la zone approximative et les horaires, ainsi que le logo.

La gestion expose l’acceptation des demandes et le signataire habilité.
Les mandats dessinés sont **Lire**, **Répondre**,
**Accepter / refuser / bloquer / clore**, puis **Appels consentis**.
La boîte de demandes comporte recherche et pagination.
Le relevé ne permet pas d’en déduire des droits supplémentaires.

## 6. Les trois formats de la référence

Chaque planche de cette famille possède les trois vues suivantes :

| Vue | Dimensions de planche |
|---|---|
| Téléphone | **390 × 844** |
| Tablette | **834 × 1 194** |
| Ordinateur | **1 440 × 1 024** |

Ces dimensions décrivent les cadres fournis ; elles ne sont pas des seuils CSS.
Le relevé transmis ne détaille pas le nombre de colonnes ou les réordonnancements
propres à chacun des trois formats. Aucun comportement responsive supplémentaire
n’est prescrit ici.

## 7. Portée de la fiche

Les composants et états ci-dessus proviennent du canevas, selon le relevé DOM/CSS
du 20 octobre 2026. Les couleurs et la géométrie communes se lisent dans le
[socle](../00_SOCLE_COMMUN.md).

La correspondance avec les routes et composants réellement servis, les états
non dessinés et les écarts d’implémentation doivent être consignés dans le
[registre des écarts](../08_ECARTS_REFERENCE_ET_CODE.md). Cette fiche ne vaut pas
recette d’achat, preuve de paiement ou confirmation de reversement.
