# ADR-0037 : Fil sans cadre, deux formules de relation et formules des boutiques

- **Statut** : Accepté par le propriétaire le 2026-10-22 (demande et réponses du jour).
- **Date** : 2026-10-22

## Contexte

Le 22/10/2026, le propriétaire envoie vingt captures d'un fil social de référence et demande d'en
« recopier exactement » l'architecture :

- une publication épouse le format de son média : aucun cadre sur les côtés, les cadres réservés
  aux zones d'écriture et d'information (en-tête, actions, légende) ;
- au bureau, « 3 ou 4 » (réponse à une question sur la pose du bureau) ;
- des arrondis plus discrets, des boutons de suivi deux fois moins hauts (« 25 px ») ;
- une barre de menu translucide, large et basse ;
- deux formules de relation : suivre sans être ami, ou être ami (ce qui vaut suivre) ;
- des réels et des personnes suggérés ; cinq formules de publication pour les boutiques.

Étude détaillée : `docs/etudes/2026-10-22-fil-sans-cadre/README.md`.

## Décision

Nous allons, sous la présentation « charte » d'antsia.ga (ADR-0028) :

1. faire traverser la carte au média de la publication, bord à bord, sans angle, recadré au centre
   dans son ratio borné (plus aucune bande) ; au téléphone, la carte passe pleine largeur ;
2. garder au bureau la colonne unique du fil, à sa largeur d'avant. Une grille de trois à quatre
   colonnes, livrée au lot 1 (PR 59), a été retirée le jour même à la demande du propriétaire :
   « l'affichage des posts ne change pas, il faut garder l'ancienne architecture, c'est juste qu'il
   n'y a pas de bordure sur les côtés. Prends l'exemple d'Instagram et Facebook » ;
3. réduire les angles des sept thèmes (cartes 24 → 16 px, médias 16 → 12 px, actions compactes
   8 → 6 px) et ramener les actions sociales compactes à 25 px de haut ;
4. passer la barre des destinations en verre (flou et saturation), 52 px, icônes seules ;
5. proposer partout où l'on rencontre une personne suggérée les deux formules, Suivre (ou Suivre en
   retour, d'après le champ `followsYou` du catalogue) et Ajouter ; la carte de suggestion unique de
   tête (ADR-0028) laisse place au carrousel « Personnes à découvrir », placé comme dans la référence
   (après la troisième publication, ou au-dessus de l'état vide) (lot 2) ;
6. déduire la formule d'une publication de boutique de son offre et de son média (lot 3) :
   bandeau d'action collé au média (Acheter, Réserver, Obtenir un devis, Commander, Voir l'offre),
   trois vues, fiche produit (panneau prix dès 480 px), vidéo et modèles ; l'offre se place sous le
   média et le rendu d'offre reçoit `postMedia` ; aucune image de l'offre ne double celles de la
   publication.

## Conséquences

### Positives

- Les photos et les vidéos occupent toute la largeur au téléphone, sans bandes.
- Au bureau, la publication garde sa place et sa largeur ; seul son média change : il occupe
  toute la largeur de la carte, comme chez Instagram et Facebook.
- Les boutons de relation cessent d'écraser les cartes de suggestion.

### Négatives

- Un média hors des bornes de ratio est recadré dans le fil ; la visionneuse garde l'image entière.
- Les actions compactes de 25 px passent sous la cible de 44 px voulue jusqu'ici ; elles restent
  au-dessus du minimum de 24 px des cibles (WCAG 2.2, 2.5.8).
- Au bureau, la carte est large (784 px à 1 440 px) : une photo en hauteur, plafonnée aux trois
  quarts de la hauteur visible, y est davantage recadrée qu'au téléphone.
- La carte de suggestion de tête et son bouton « Écrire » quittent le fil ; écrire reste offert sur
  le profil.
- « Suivre en retour » attend le déploiement du backend : sans lui, la carte dit « Suivre ».

### Neutres

- Les autres présentations (« media », historique) et les autres applications du moteur ne changent pas.

## Alternatives considérées

### Grille de trois à quatre colonnes au bureau

Livrée au lot 1 (`FeedMasonryGrid`, maçonnerie), puis retirée le 22/10/2026 à la demande du
propriétaire : la page garde son architecture, seule la bordure autour du média disparaît.

### Bandes de fond autour du média (`contain`)

C'est le « cadre sur les côtés » que le propriétaire demande de retirer. Écarté.

## Références

- Étude : `docs/etudes/2026-10-22-fil-sans-cadre/README.md`
- ADR-0027 (thèmes et système épuré), ADR-0028 (écran des chartes)
