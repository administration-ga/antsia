# Sélecteur photo et vidéo — 20 octobre 2026

Le correctif complet est publié sur [ANTSIA](https://antsia.vercel.app) et
[la démonstration](https://antsia-demo.vercel.app).

## Défaut corrigé

Le passage téléphone/bureau remplaçait deux niveaux de l'arbre React : la
coquille du fil, puis les parents du composeur dans sa fenêtre. Le champ de
fichier disparaissait alors qu'un sélecteur natif pouvait encore le référencer.
Le message signalé était « Node cannot be found in the current page » lors de
l'ajout d'une photo ou d'une vidéo. Aucun message identique n'a été trouvé dans
les sources applicatives ni les consoles contrôlées ; les tests reproduisent
précisément la disparition du champ dans les deux sens de bascule.

Le composeur de publication est maintenant monté une seule fois au-dessus de
la bascule de coquille. Sa fenêtre conserve les mêmes parents et change
seulement de style selon la largeur. Le fichier et le focus gardent ainsi leur
nœud. Fermer conserve toujours le brouillon ; abandonner demande toujours sa
confirmation. Aucune garde de média, de publication ou d'authentification n'est
modifiée.

## Vérifications

- Deux tests de fenêtre et deux tests de fil complet échouaient sur la perte
  du champ avant leurs corrections respectives ; ils passent après correction.
- **76 tests passés dans six fichiers** : fil complet, fenêtre, composeur,
  médias du brouillon, disposition et contrôleur de création.
- Lint des cinq fichiers : zéro erreur, trois avertissements préexistants du
  simulateur de bouton de test.
- Codegen local terminé. Le typage global du répertoire partagé rencontre une
  erreur étrangère au correctif dans `convex/modules/shops/jobApplications.ts:89`
  (`shop.job.intent.stop`). Elle n'a pas été modifiée.
- Une installation de contrôle de la dernière archive a échoué faute de place.
  Les deux constructions Vercel finales ont ensuite réussi, TypeScript compris,
  depuis le paquet filtré ci-dessous. Aucun `verify` global nouveau n'est revendiqué.
- Après publication : **six contrôles navigateur sur la démo**, en clair et
  sombre à 390/834/1440 px. Une seule entrée fichier, dialogue et bouton d'envoi
  contenus dans l'écran, aucune largeur de document débordante. Apparence
  Système rétablie et taille du navigateur remise à son défaut.
- Les sept fichiers de thèmes restent identiques à la livraison précédente.
  Les 126 contrôles membre de production antérieurs et leurs limites sont
  détaillés dans [le rapport IDN](25_RACCORDEMENT_IDN_PRODUCTION.md).

## Version publiée

| Cible | Déploiement Vercel | État |
|---|---|---|
| antsia | `dpl_EZQNzXLvaLmbzNaWDBs3ip6DnE6S` | READY, alias public vérifié |
| antsia-demo | `dpl_3CErPZo6GoRfugUvZQWRxxWvEfGj` | READY, alias public vérifié |

Version de contenu : `media-picker-20261020-74d5cac88d25892d`.
Base Git du paquet : `a29a6d8` ; cet identifiant de contenu n'est pas un commit.
Les 2 969 fichiers de la livraison `logout-20261020-c52b73ee37effd0c` sont repris,
avec seulement trois fichiers de source et deux tests de ce correctif.
Leurs empreintes ont été comparées aux sources réelles avant envoi.

Les sondes protégées ont été contrôlées avant promotion : version attendue,
santé `ok`, bon backend dans la CSP et absence de celui de l'autre cible.
Les deux alias canoniques servent ensuite cette même version et répondent 200.
Le relevé Vercel filtré sur chaque déploiement et les vingt dernières minutes ne
trouve aucun journal au niveau erreur ; il ne remplace pas la recette du fichier.

Archive, manifeste et logs :
`~/Library/Caches/antsia-releases/20261020-media-picker-complet/`.
Preuves navigateur :
[`recette/idn-2026-10-20/selecteur-apres-correctif/`](recette/idn-2026-10-20/selecteur-apres-correctif/).

Les sources sont modifiées dans le dépôt réel. Aucun commit applicatif, push,
publication Convex de production/démo ni fichier `.env*` modifié pour ce correctif.
Les travaux parallèles et les chartes DIASPORALE sont préservés.

## Recette des fichiers terminée le 20/10 à 18:27 UTC

Après activation de l'accès fichiers par le propriétaire dans Chrome/Asted,
la sélection réelle et les aperçus sont validés sur **antsia-demo** :

- **12 contrôles réussis** : photo PNG et vidéo H.264 × clair/sombre ×
  390×844, 834×1112 et 1440×1000. Dans chaque cas, un aperçu décodé
  de 320×180, un seul champ fichier et aucun débordement horizontal.
  La vidéo charge sa première image et sa durée de 1 seconde.
- Deux sélecteurs ouverts avant une bascule gardent leur cible : vidéo
  390→1440, puis photo 1440→390. La sélection et le décodage réussissent.
- Fermer et rouvrir conserve les deux types de média ; les aperçus restent
  présents après les changements de taille et de mode.
- Après retrait des fichiers techniques : zéro aperçu, zéro bouton Retirer,
  texte vide, aucun abandon proposé et bouton Publier désactivé.
- Zéro erreur de console dans l'onglet dédié, aucun message Node signalé.
  Apparence Clair initiale conservée, fenêtre de publication fermée,
  dimension du navigateur remise à son défaut.

Preuve structurée :
[`selection-photo-video.json`](recette/idn-2026-10-20/selecteur-apres-correctif/selection-photo-video.json).
Douze captures associées et une capture de la bascule inverse sont conservées.
Les fichiers sont des fixtures techniques non personnelles ; aucune action de
publication ni de téléversement serveur n'a été effectuée par l'agent.
Le premier onglet a été exclu des mesures après constat d'une utilisation
concurrente ; son contenu a été préservé. La recette finale utilise un onglet dédié.

Cette première vérification des aperçus portait sur la démo. La recette membre
de production est maintenant terminée : 12 contrôles sur le compte IDN du
propriétaire, détaillés dans [le rapport production](28_APERCUS_MEDIAS_PRODUCTION_2026-10-20.md).
Le transport, l'analyse de sécurité et l'affichage d'un média publié restent
hors de cette recette sans publication. Les anciens blocages d'autorisation
Chrome sont historiques, dont la capture du réglage désactivé.

## Suite audio

Le correctif audio suivant est publié sur les deux sites ; deux aperçus ont
été recontrôlés sur cette version. Voir [le rapport audio](27_DEVERROUILLAGE_AUDIO_2026-10-20.md).
