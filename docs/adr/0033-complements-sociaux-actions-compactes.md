# ADR-0033 : Compléments sociaux et actions compactes

- **Statut** : Accepté à la demande du propriétaire
- **Date** : 2026-10-21

## Contexte

Le propriétaire fournit onze captures Facebook montrant invitations en lignes, paires de décisions, suggestions visuelles, notifications avec portrait et aperçu commerce. Il demande de fusionner ces modèles avec les fonctions et les sept chartes ANTSIA existantes, sur téléphone, tablette et bureau, sans tout rendre en pilule.

## Décision

Les actions d’ajout, confirmation, refus, suivi, contact et catalogue utilisent un rayon spécifique `--esp-social-action-radius` de 8 px dans les sept chartes ANTSIA. Le contrat de base le laisse à `initial`, avec le repli du réseau consommateur. Les filtres, onglets et autres boutons conservent leurs rayons. Les variantes métier déterminent toujours les couleurs ; un refus d’invitation utilise une surface neutre, distincte de la suppression destructrice.

Les invitations gardent leurs mutations et états serveur, les suggestions leurs masquages persistants et leur catalogue opt-in, et les notifications leurs cibles contextualisées. Les boutons Confirmer/Refuser ont la même largeur et une cible d’au moins 44 px. Les listes se composent selon la largeur disponible du panneau.

Dans le fil des chartes, les carrousels personnes/pages complètent de nouveau les publications après le point d’insertion prévu, sans retirer Suivre/Écrire en tête. Un rail vidéo facultatif utilise exclusivement les vidéos livrables des publications de la page déjà chargée, au plus quatre, sans lecture automatique ni requête supplémentaire. Aucune relation commune, actualité, campagne publicitaire ou donnée produit n’est inventée.

Les cartes commerce utilisent les vrais médias de l’offre et conservent prix, disponibilité, variantes, gardes et destinations. Une rangée de médias reste la galerie de cette même offre ; elle ne simule pas une gamme de produits que son DTO ne porte pas.

## Conséquences

- Identité ANTSIA, couleurs des sept thèmes, contenus et parcours existants conservés.
- Les aperçus vidéos restent absents sans média autorisé ou destination injectée.
- Les boutons de la primitive globale et les jetons de couleur ne changent pas.
- Les décisions de notification résistent au double clic et gardent leurs actions sur une erreur technique non définitive.
- Depuis un profil, Invitation envoyée ouvre la gestion des invitations au lieu d’être une impasse désactivée.

## Références

- ADR-0027, ADR-0028 et ADR-0030.
- `docs/COMPLEMENTS_SOCIAUX_2026-10-21.md` : résultats et limites de vérification.
- Captures fournies par le propriétaire : IMG_7318 à IMG_7328.
