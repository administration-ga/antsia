# Déverrouillage audio — 20 octobre 2026

## Diagnostic

La trace `q` du fichier `3n1zmqtxn6o36.js` du déploiement démo
`dpl_3CErPZo6GoRfugUvZQWRxxWvEfGj` correspond à
`resumeSharedAudioContext()`, appelé par l'écouteur global de déverrouillage.
L'écouteur traitait `pointerdown` et `keydown` sans vérifier la confiance de
l'événement ni l'activation navigateur. Le début d'un pointeur tactile ne
constitue pas encore l'activation audio attendue ; certains événements
synthétiques ou touches ne l'accordent pas non plus. Capturer le rejet de la
promesse ne supprime pas l'avertissement natif de Chrome.

Le message « WebSocket reconnected » décrit une reconnexion réussie ; il n'a
pas été masqué. Les deux messages ne démontrent pas une défaillance des aperçus.
La recette photo/vidéo est détaillée dans [le rapport média](26_SELECTEUR_MEDIAS_RESPONSIVE_2026-10-20.md).

## Correction

`audio-unlock.ts` attend maintenant `click` ou `keydown`, refuse les événements
non fiables (`isTrusted=false`) et ne crée/reprend aucun contexte tant que
`navigator.userActivation.isActive` vaut false. Les navigateurs dépourvus de
cette API gardent le contrôle par événement de confiance. Le contexte reste
partagé, jamais fermé ; les écouteurs restent comptés par référence et
permettent une nouvelle reprise après interruption.

Deux fichiers modifiés : le module et son test. Aucun fournisseur audio,
réglage Chrome, transport WebSocket ou garde de publication n'est changé.

## Validation locale

- Cas de régression observés en échec avant correction : début de pointeur,
  événement synthétique, reprise sans activation. Après correction : **30 tests
  passent dans trois fichiers**, dont le déverrouillage et les deux suites de
  l'hôte d'appels ; codegen local préalable terminé.
- Typage du paquet social-features passé ; lint des deux fichiers sans erreur
  ni avertissement ; différences sans défaut d'espacement.
- Pas de nouveau verify global, de commit applicatif, de push, de modification
  d'environnement ni de publication Convex.

## Livraison

Version publiée : `audio-gesture-20261020-82c4108726107498`.
Base publique : `media-picker-20261020-74d5cac88d25892d`.
Paquet de 2 969 fichiers, deux seules substitutions vérifiées par SHA-256 ;
aucun travail parallèle ajouté. Archive et manifeste :
`~/Library/Caches/antsia-releases/20261020-audio-gesture/`.

| Cible | Déploiement | État |
|---|---|---|
| antsia | `dpl_3mKcBfqz71UrTM6JLJhBkWrJ6mZd` | READY, alias public vérifié |
| antsia-demo | `dpl_BWsD5xMuCHLHNdVwMuXAefvDjLPh` | READY, alias public vérifié |

Les deux constructions Next/TypeScript ont réussi. Avant promotion, version,
santé `ok` et CSP vers le backend propre à chaque cible contrôlées ; les alias
publics répondent ensuite 200 avec la version exacte. Scan Vercel des erreurs
sur ces deux seuls déploiements et les dix dernières minutes : zéro entrée.
Aucun journal brut ni secret conservé dans la preuve.

## Recette sur la version publique finale

Sur la démo, dans un onglet dédié Chrome/Asted : zéro avertissement ou erreur
avant le premier geste et après clics/clavier. Aucun avertissement AudioContext
ni message Node. Nouvelle sélection photo en clair à 390×844 et vidéo en sombre
à 1440×1000 : aperçus décodés 320×180, vidéo de 1 seconde, un seul champ fichier,
aucun débordement. Les fichiers techniques sont retirés ; brouillon vide,
Publier désactivé, fenêtre fermée, apparence Clair initiale et dimensions
normales rétablies. L'agent n'a effectué aucune publication ni upload serveur.

Les 12 contrôles photo/vidéo × deux modes × trois tailles du rapport précédent
portent sur la version média ; ces deux nouveaux contrôles confirment les
aperçus après la correction audio, dont aucun composant média n'est changé.
Preuves : [publication audio](recette/idn-2026-10-20/selecteur-apres-correctif/audio-publication.json)
et [recette navigateur](recette/idn-2026-10-20/selecteur-apres-correctif/audio-publication-smoke.json).

Limites : aucun appel réel initié ni écran tactile physique testé. La réserve
sur les aperçus en session membre de production est levée par la recette
complémentaire : [12 contrôles réussis](28_APERCUS_MEDIAS_PRODUCTION_2026-10-20.md). Les refus d'autoplay réels
restent signalés par l'indicateur existant ; aucune politique Chrome affaiblie.

## Référence

[Politique Chrome pour Web Audio](https://developer.chrome.com/blog/autoplay/#web_audio) :
création ou reprise du contexte après un geste utilisateur.
