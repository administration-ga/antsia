# Compléments sociaux — 21 octobre 2026

Les modèles fournis dans les onze captures Facebook sont intégrés dans les vrais composants ANTSIA : invitations, suggestions, profils, notifications, cartes d’offre et aperçus vidéo du fil. Les fonctions et contenus existants restent raccordés. Les commits de livraison sont poussés et les deux versions sont **publiées sur ANTSIA et sa zone /demo**. La recette locale initiale est conservée ci-dessous.

## Comportements intégrés

- **Invitations** : identité publique, date réelle, portrait et paire Confirmer/Refuser de même largeur ; confirmation sociale et refus neutre. Annulation des demandes envoyées et pagination indépendante des deux côtés conservées.
- **Suggestions et profils** : Ajouter, Masquer, Profil, Suivre et Écrire restent des gestes distincts. Une invitation reçue mène à sa réponse ; Invitation envoyée ouvre la gestion des invitations. Le masquage conserve son comportement persistant et son retour arrière sur erreur.
- **Notifications** : portrait avec pictogramme de type, auteur mis en évidence, état non lu et sections Nouveau/Plus tôt selon la date réelle. Confirmation directement dans la notification, verrou de double clic et relecture du statut serveur ; une erreur technique ne supprime plus les choix disponibles. Filtres, pagination, liens contextualisés, fermeture et navigation clavier conservés.
- **Boutiques** : média plus visible, vignettes de la même offre, prix et disponibilité, bandeau descriptif et accès à l’offre ou au catalogue. Variantes, contexte public/membre et garde des médias restent en place.
- **Fil** : carrousels personnes/pages réintégrés dans le fil des chartes ; les actions Suivre/Écrire existantes restent présentes. Le nouveau rail Clips utilise au plus quatre vidéos déjà livrables de la page de publications chargée, sans lecture automatique, requête supplémentaire ou média retenu. Fermer l’aperçu conserve les publications.

## Charte et adaptation

Le jeton dédié `--esp-social-action-radius` vaut 8 px dans les sept chartes ANTSIA ; les actions concernées gardent une cible d’au moins 44 px. La primitive globale des boutons, les couleurs et la géométrie des filtres/onglets ne changent pas. Les couleurs restent celles du rôle métier dans chaque charte.

Les suggestions passent d’une à deux puis trois colonnes selon la largeur du panneau. Les offres s’adaptent au conteneur : média, informations et action restent accessibles sur téléphone, tablette et bureau.

| Vue locale | Largeur | Résultat observé |
| --- | ---: | --- |
| Suggestions | 390 px | Une colonne, aucun débordement horizontal |
| Suggestions | 834 px | Deux colonnes, aucun débordement horizontal |
| Suggestions | 1 440 px | Trois colonnes, aucun débordement horizontal |
| Boutique | 390 / 834 / 1 440 px | Aucun débordement horizontal ; action de 44 px, rayon de 8 px |

Le contrôle visuel porte sur Gaboma sombre. La résolution du nouveau jeton est testée dans les sept thèmes, en clair/sombre et contexte imbriqué ; cela ne remplace pas une recette visuelle complète des sept chartes ni des appareils physiques.

## Vérifications effectuées

- Génération et typage Convex locaux réussis ; typages du paquet social et de l’application réussis.
- Suite complète `social-features` : **4 157 tests / 275 fichiers**, tous réussis.
- Suite complète ANTSIA : **1 115 tests / 121 fichiers**, tous réussis, soit **5 272 tests** pour ces deux suites.
- Géométrie des thèmes : 8 tests réussis. Six cliquets ciblés : 17 tests réussis (contrat de thème, langues, couleurs, phrases, URL et délivrance des fichiers).
- Lint ciblé : aucune erreur. Un avertissement de règle Next sur le portrait `<img>` du paquet moteur générique, indépendant de Next.
- Parcours local : compte de démonstration modération → profil presse → Ajouter → Invitation envoyée ; connexion au compte presse, notification reçue, Confirmer. La nouvelle relation est acceptée. Les 51 documents de relations/invitations préexistants sont inchangés, ainsi que les 14 suivis.
- Catalogue mobile : l’action Consulter l’offre ouvre la fiche réelle, avec titre, prix, disponibilité et image. Aucun achat ni prise de contact effectué.
- Console du dernier parcours boutique/détail : **0 erreur**, deux avertissements de développement préexistants concernant l’image principale et le défilement fluide, consignés dans les preuves.

## Limites et conservation

Aucune actualité, personne, relation commune, campagne sponsorisée ni gamme de produits n’a été inventée. Les actualités restent les vraies publications autorisées du réseau. Les vignettes commerce représentent les médias de leur offre, sans simuler des produits absents des données.

Le rail Clips est couvert par ses tests de filtrage, limites, destinations, absence d’autoplay et fermeture. La recette locale initiale ne disposait pas de vidéo livrable ; la recette publiée a ensuite observé deux aperçus décodés en production (readyState 4, aucune erreur, muets et en pause). Aucun nouveau média n’a été publié.

Les limites de la recette locale initiale sont levées pour les compilations et la publication décrites ci-dessous. Aucun backend, secret ou fichier d’environnement privé n’a été modifié. L’arbre et l’index de travail partagés restent sur leur état initial. Une seule relation de recette a été ajoutée localement ; la recette en ligne n’a effectué aucune mutation sociale, bascule de compte ou déconnexion.

## Preuves

- Décision : [ADR-0033](adr/0033-complements-sociaux-actions-compactes.md).
- [Mesures responsives](recette/complements-sociaux-2026-10-21/responsive.json), [conservation des données](recette/complements-sociaux-2026-10-21/local-after.json), [console locale](recette/complements-sociaux-2026-10-21/console-locale.json).
- [Notification avec décision](recette/complements-sociaux-2026-10-21/notifications-mobile.png), [suggestions bureau](recette/complements-sociaux-2026-10-21/suggestions-1440.png), [catalogue tablette](recette/complements-sociaux-2026-10-21/catalogue-tablette.png), [fiche mobile](recette/complements-sociaux-2026-10-21/offre-mobile.png).
- Les captures Facebook fournies servent de référence ; elles ne sont pas ajoutées aux médias de l’application.


## Publication autorisée et vérifiée

| Cible | Commit source poussé | Version | Déploiement |
| --- | --- | --- | --- |
| [ANTSIA](https://antsia.vercel.app/) | `2966feaafc0f4c86176845c3ba4c07d5a7297422` | `social-20261021-production-2966feaafc0f` | `dpl_EpqwAiwbS4BzDTec73RL2AWCbNNK` — READY |
| [Démo intégrée](https://antsia.vercel.app/demo) | `df82f10ac50a5058ef236e20ed2578bbcd9386c2` | `social-20261021-demo-df82f10ac50a` | `dpl_9d6JWNqASpK8KbdejSw2ozKpPDxX` — READY |

Les branches `codex/complements-sociaux-20261021` et `codex/complements-sociaux-demo-20261021` portent les sources. Le prérequis `05d8487` conserve exactement les trois fichiers de confidentialité publiés pendant la préparation ; trois formulations sont clarifiées ensuite sans changer leurs informations. Le test de contrat DIASPORALE ajoute une seule entrée pour le jeton de rayon : commit `aafe007`, branche `codex/contrat-actions-sociales-20261021`, poussée sans publication de l’application DIASPORALE.

La vérification complète a été reprise après un faux positif lexical dans le cliquet de communication : **15 222 tests réussis**, génération et typages Convex, typages des 12 espaces et lint des 11 espaces sans erreur. Le test partagé reconnaît explicitement le nouveau jeton ; aucun CSS ou palette DIASPORALE n’a été changé. Les avertissements de lint préexistants restent consignés dans les journaux locaux.

Le candidat figé, distinct de l’arbre de travail partagé, passe en plus ses deux typages, **4 153 tests du paquet social et 994 tests de l’application**, puis les deux compilations Vercel Next 16.4.2 (125,2 s démo ; 140,5 s principal). Ces totaux diffèrent de l’arbre partagé car les changements voisins non publiés en sont exclus.

L’enfant démo est construit en premier, sans promotion de l’ancien domaine. Le principal référence sa nouvelle origine immuable et hérite des secrets existants. Ses contrôles préparatoires vérifient versions, services et CSP. L’alias public est relu juste avant promotion pour conserver la publication concurrente. Après activation : deux santés HTTP 200 avec versions exactes, CSP des backends respectifs et aucun secret du relais dans les réponses. L’enfant direct redirige vers le SSO Vercel ; l’ancien domaine démo reste en 404.

Après rechargement, les profils réel et démo attendus sont conservés. Mes connexions se charge en production et côté presse démo. Les relevés démo des relations et invitations sont identiques avant/après : trois connexions (dont Awa), deux suivis, aucune invitation en attente. Les notifications de production s’ouvrent, les nouveaux boutons Ajouter et Consulter l’offre mesurent 44 px de haut avec un rayon de 8 px, et la fiche produit démo est atteinte. Les deux aperçus Clips chargent sans autoplay. **Console des deux onglets : zéro avertissement et zéro erreur.**

Les [preuves de publication](recette/complements-sociaux-2026-10-21/publication/publication-proof.json), [contrôles du navigateur](recette/complements-sociaux-2026-10-21/publication/browser-proof.json) et [validation complète](recette/complements-sociaux-2026-10-21/publication/validation.json) sont versionnés sans contenu privé. Les captures des sessions authentifiées restent locales et sont exclues du commit de preuves.

## Intégration dans main

Les sources de cette tranche sont entrées dans `main` par la PR 25 (`c8c6d71`, fusion `d50c5a0`) : le jeton `--esp-social-action-radius` et ses consommateurs y figurent, et la résolution du jeton dans les sept thèmes est testée par `packages/ui/src/themes/antsia-themes.test.ts`. Les publications suivantes partent de `main` ; les versions `social-20261021-*` ci-dessus sont remplacées en ligne, et les branches `codex/complements-sociaux-*` en gardent la trace.

Relevé du 21/10/2026 à 15 h 58 UTC : les deux santés répondent HTTP 200 avec `main-086cd43b8686-production` et `main-086cd43b8686-demo`.

La branche DIASPORALE `codex/contrat-actions-sociales-20261021` n'est pas fusionnée : elle porte aussi trois commits DIASPORALE antérieurs, et le `main` de DIASPORALE n'a pas encore la liste des primitives du moteur que ce test complète. Le `main` de DIASPORALE n'est donc pas mis en défaut par le nouveau jeton.
