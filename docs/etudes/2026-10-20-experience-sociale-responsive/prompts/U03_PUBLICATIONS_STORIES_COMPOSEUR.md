# U03 — Publications, stories et composeur

## Préambule

Appliquer le [plan responsive](../04_PLAN_IMPLEMENTATION.md), U01 et les fondations U02 dans ANTSIA uniquement. Réutiliser P03/P04 et les formats existants, préserver les autres sessions et DIASPORALE. Pas de test, codegen, typage, lint, build, navigateur, serveur, Git d’écriture, installation ou environnement pendant ce lot gelé.

## Périmètre et fichiers réutilisés

- Cartes : `packages/social-features/src/features/reseau-personnel/{PostCard,PostMediaPresentation,FeedPages}.tsx`.
- Stories : `features/stories/{StoriesTray,StoryRing,StoryViewer,StoriesViewerPage,StoryCreateSheet}.tsx` et leurs helpers de visibilité/progression existants.
- Création : `shell/mobile/PostComposerSheet.tsx`, contrôleur de création existant et surfaces de création raccordées par `ReseauAgentPage.tsx` / `mobile/ReseauMobilePage.tsx`.
- Application : `apps/antsia_ga/src/components/network-shell.tsx`, surfaces de fil et `components/feed/feed-preferences-screen.tsx`.
- Charte : consommer `packages/ui/src/styles/charte.css` et les thèmes existants ; ne pas éditer les primitives `components/ui/` ni disséminer de couleurs littérales.

Le réseau utilise actuellement `postPresentation="charte"`, `storiesPresentation="rings"` et un mode Liste par défaut. Ne pas réactiver une ancienne variante « media » au seul motif qu’un rapport historique la cite.

## Actions et contrat de présentation

1. Organiser la carte autour du média quand il existe : auteur et audience lisibles, média sans déformation, actions, légende repliable, commentaires et offre éventuelle. Une publication textuelle conserve une vraie carte lisible.
2. Garder le **fond blanc et les cartes beige** en clair. En sombre, utiliser les surfaces et contrastes des thèmes existants ; l’état de sélection ne repose pas sur la couleur seule.
3. Respecter photo, galerie et vidéo réelles, leur ratio, les états retenu/indisponible et la garde des fichiers. Réutiliser le lecteur et la visionneuse ; un média retenu n’a pas d’URL de repli échappant à la garde.
4. Aligner les actions réellement présentes. Masquer, mettre un auteur en sourdine, signaler, enregistrer et annuler depuis Mon fil restent disponibles selon les droits. Ne pas fabriquer une action de republication parce qu’une confirmation apparaît dans V1.
5. Garder les stories dans leur modèle actuel : progression, auteurs, durée et droits existants. `StoriesViewerPage` possède notamment une navigation verticale entre auteurs et des surfaces live ; ne pas annoncer une gestuelle Instagram identique sans changement spécifié et observé.
6. Ouvrir depuis Créer ou « + » le catalogue réel publication/story/évènement/album/direct, filtré par ses capacités. Le format Clips n’existe dans ce catalogue que si U04 le raccorde réellement.
7. Montrer l’audience choisie et sa portée serveur, l’état du dépôt et les erreurs d’envoi. Conserver la protection contre double appui, la reprise exacte et le brouillon propre au réseau/auteur ; ne pas persister de nouveaux contenus privés hors des politiques existantes.
8. Rendre les légendes longues, grands caractères, photos multiples et contrôles accessibles sur téléphone, tablette et ordinateur. Ouvrir puis fermer un détail rend le focus au bon élément.

## Dépendances et critères d’acceptation

- U01 fournit les termes Stories, Direct et En live ; U02 fournit la navigation et les surfaces de création de transition.
- Les mêmes données et droits alimentent les poses ; absence de média, compteur ou badge ne produit pas de contenu simulé.
- Aucun badge officiel/vérifié ni total de vues/likes n’est déduit du style. Le client affiche seulement la projection serveur disponible.
- Une publication masquée disparaît du fil concerné ; Mon fil permet son rétablissement et celui des auteurs en sourdine selon le contrat existant.
- Une erreur conserve l’intention de création sans fausse confirmation de publication ; changement de personne/réseau ne restitue pas son brouillon à un tiers.
- Le défilement et les interactions galerie ne cassent ni le retour à la publication, ni le lecteur média unique défini en U04.

## Exclusions et preuve attendue

Pas de nouveau type de contenu métier, de copie de contenu privé des vidéos, de filtre beauté/IA, de métrique fictive ou de modification de visibilité serveur. Pas de nouvelle duplication de la visionneuse ou du composeur. Rapporter les composants réellement montés et les scénarios seulement écrits ; recette médias, contraste, dépôt et reprise reste différée. Une capture de référence ne prouve ni un envoi réel ni une délivrance de fichier.
