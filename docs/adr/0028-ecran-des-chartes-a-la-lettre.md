# ADR-0028 : L'écran des chartes, à la lettre, dans le fil d'antsia.ga

- **Statut** : Proposé — demandé par le propriétaire le 19/10/2026 (« Je refais ces composants
  d'après l'écran des chartes ? » — « Oui, à la lettre ») ; « accepté » après recette.
- **Date** : 2026-10-19
- **Complète** : ADR-0027 (couleurs, fonds et système des sept thèmes, inchangés). **Remplace**
  pour antsia.ga la présentation « media » des publications (ADR-0017 §3, lot P03) et le fil
  immersif par défaut au téléphone (lot P04) ; les deux restent servis par le moteur.
- **État d'exécution** : code et tests dans les sources (`@antsia/api`, `@antsia/social-features`,
  `antsia_ga`, `convex/modules/events`). Observé dans un banc de rendu (vrais composants, données
  simulées) à 390, 834 et 1 440 px, dans les sept thèmes en clair et en sombre, le 19/10/2026.

## Contexte

Le 19/10, l'ADR-0027 a porté dans le code les couleurs, les fonds et le système des sept chartes
(385 couleurs sur 392 exactes). La comparaison de l'application avec l'écran de démonstration des
chartes a montré que ses **composants** n'avaient pas été repris :

1. la publication : photo bord à bord et sans angle, au lieu d'un texte suivi d'une photo posée
   dans la carte à l'angle de 16 px ;
2. les actions : un bouton « J'aime 200+ » qui ouvre le choix de réaction, au lieu d'une rangée
   d'icônes (cœur, commentaire, partage avec leurs décomptes, Enregistrer à droite) ;
3. les cartes du fil : aucune carte de suggestion « Suivre / Écrire » ni de publication de page
   « Participer / Plus tard » ;
4. l'en-tête du téléphone : recherche, bouton clair/sombre et cloche, au lieu de recherche, cloche
   et messages.

S'y ajoutait le fil immersif, défaut du téléphone depuis P04 : une publication par hauteur
d'écran, loin de la liste de cartes de la maquette. Le propriétaire demande de refaire ces
composants à la lettre.

Contraintes : DIASPORALE n'utilise ni la carte de publication, ni le fil, ni la coque du téléphone
du moteur, mais le moteur sert ses présentations sur déclaration (`NetworkProvider`) et garde
chaque fois un retour arrière en une ligne ; le moteur ne calcule aucun compte de relations en
commun (pas de score d'affinité) ; dans ANTSIA, un évènement n'admet de réponse que d'un invité
(`events.respond`, sur l'identifiant de sa ligne), les inscriptions à un évènement de page restant
propres à DIASPORALE (`pageEvents`).

## Décision

Nous ajoutons au moteur une présentation **`postPresentation="charte"`**, déclarée par antsia.ga
à la place de `"media"`. Elle reprend l'écran des chartes :

1. **Publication.** En-tête : avatar de 40 px (rond pour une personne, carré arrondi pour une
   page), nom en gras, badges en signes (coche « Vérifié » à l'encre des relations et nom lu,
   étiquettes « Officiel » en encre pleine et « Agent public » en tonal des messages,
   « Communauté » jamais), ligne d'appoint `@identifiant · date` ou `Page · date`, menu « … » en
   rond. Puis le texte (entier s'il est seul, borné par « Lire la suite » au-dessus d'un média),
   le média **posé dans la carte** à l'angle des photos (16 px) avec le ratio réel, la galerie et
   la visionneuse de P03, le direct, l'évènement, la citation. Carte à 24 px, 16 px dedans, 12 px
   entre les blocs.
2. **Actions.** Une rangée d'icônes de 44 px de cible : cœur (J'aime ; icône pleine à l'encre des
   réactions une fois posé), commentaire, partage (avion), chacun avec son décompte, et
   Enregistrer à droite (icône pleine une fois enregistré). Aucun libellé visible ; chaque bouton
   garde son nom accessible. Les quatre réactions restent atteignables : appui long au doigt,
   bouton explicite au clavier, aux lecteurs d'écran et aux pointeurs fins (masqué à l'écran sur
   un pointeur tactile tant qu'il n'a pas le focus).
3. **Carte de suggestion.** En tête du fil au téléphone et à la tablette (le rail droit du bureau
   garde les siennes) : une personne de `graph.follows.suggestions`, sa ligne `@identifiant ·
   titre`, « Suivre » à l'aplat des relations (`graph.follows.follow`) et « Écrire » en tonal des
   messages (brouillon de conversation). Elle remplace les deux carrousels intercalés. Sans
   suggestion, politique du réseau ou panne : aucune carte.
4. **Évènement annoncé.** Titre en gras et dates en une phrase ; pour un invité, tant que la
   question a un sens (prévu, pas révolu, pas encore « je participe ») : « Participer » à l'aplat du
   commerce (`events.respond`, réponse `accepted`) et « Plus tard » en gris, qui ne répond rien et
   retire la question de la carte pour cette lecture. La carte d'évènement du moteur expose pour
   cela `myParticipationId`, l'identifiant de la ligne du lecteur, `null` pour un évènement de page
   ou un non-invité.
5. **En-tête du téléphone.** La marque (Familjen Grotesk) et son point, puis trois ronds : recherche,
   cloche (pastille aux couleurs des réactions, cerclée du fond), messages (pastille des non-lus),
   sans filet. Le bouton clair/sombre quitte cet en-tête : il reste dans la barre des autres
   pages et dans Paramètres > Affichage.
6. **Fil du téléphone.** En liste par défaut ; l'Immersion reste offerte par sa bascule et un choix
   explicite l'emporte. Les actus ouvrent la tête du fil, juste sous l'en-tête ; le déclencheur
   « Partager une information » s'efface devant le bouton « + » de la barre, qui ouvre la même
   surface.
7. **Carte publique** (pages sans compte) : même ordre (texte, média posé, actions), avatars rond ou
   carré arrondi, carte à l'angle des surfaces.
8. **Actus** (ajout du 20/10/2026, après recette du propriétaire : « Vous » apparaissait deux fois et
   ma série portait un anneau gris pâle). Une seule tuile « Vous » en tête : sans actu en ligne, mon
   portrait (ou la silhouette) et son « + » ; avec, ma série dans le dégradé du thème — le médaillon
   l'ouvre, le « + », bouton frère à zone de toucher élargie, en publie une autre. Mesures de la
   maquette : anneau de 60 px, 2,5 px d'anneau et 2,5 px de la couleur de page, « + » de 22 px,
   prénom en 12 px. Les cartes (présentation par défaut, DIASPORALE) ne changent pas.

## Conséquences

### Positives

- L'écran du fil d'antsia.ga reproduit celui des chartes, dans les sept thèmes, en clair et en
  sombre ; chaque famille d'actions garde sa couleur.
- Suivre, Écrire et Participer deviennent des gestes du fil, sans quitter la carte.
- Retour arrière en une ligne : `postPresentation="media"` rend P03 et P04 à l'identique, et sans
  déclaration le moteur garde sa carte historique (DIASPORALE inchangée).

### Négatives

- La ligne d'appoint d'une suggestion dit l'adresse et le titre, pas « 12 relations en commun » :
  le moteur refuse de calculer qui fréquente qui. Celle d'une publication ne dit pas de lieu : le
  moteur n'en porte pas.
- Les décomptes restent plafonnés à « 200+ » (balayage borné du serveur) là où la maquette écrit
  « 248 ».
- Une page d'ANTSIA ne peut pas encore annoncer d'évènement ouvert à tous : « Participer »
  n'apparaît que pour un invité. Ouvrir les inscriptions aux pages d'ANTSIA est une décision à
  part.
- Au bureau, le rail des suggestions garde « Se connecter » (relation réciproque) alors que la
  carte du téléphone propose « Suivre ».

### Neutres

- Les puces de portée (Pour vous, Récents) et leur phrase restent sous les actus : la planche de
  composants des chartes les montre, l'écran du téléphone non.
- Les tailles de texte suivent l'application (15 px pour la publication) plutôt que la maquette
  réduite (13 px pour un téléphone dessiné à 342 px).

## Alternatives considérées

### Option A — réécrire la présentation « media »

Une seule présentation à tenir, mais l'ordre de P03 (média avant le texte) disparaîtrait pour de
bon et le retour arrière avec lui. Écartée.

### Option B — compter les relations en commun pour la carte de suggestion

Fidèle à la maquette, mais contraire à la règle du moteur (aucun score d'affinité, aucune mesure de
qui fréquente qui). Écartée.

### Option C — « Plus tard » répond « peut-être »

Une réponse que la personne n'a pas donnée. Écartée : « Plus tard » ne répond rien.

## Références

- ADR-0017 §3 et §4 (présentation « media », fil immersif) ; ADR-0027 (sept thèmes et système).
- Maquette « Chartes ANTSIA » (<https://claude.ai/artifact/Arc4fsUDikm3DRHuZNr35u>), écran du
  téléphone de chaque palette.
- `packages/api/src/network.tsx` (`EnginePostPresentation`),
  `packages/social-features/src/features/reseau-personnel/PostCard.tsx`, `FeedSuggestionCard.tsx`,
  `FeedPages.tsx`, `PostReactionControl.tsx`, `PostMedia*.tsx`,
  `packages/social-features/src/shell/mobile/ReseauMobileHeader.tsx`, `ReseauMobileFeed.tsx`,
  `mobile-styles.tsx`, `packages/social-features/src/features/feed-immersion/feed-mode.ts`,
  `packages/social-features/src/features/stories/{StoriesTray.tsx,stories-tray.ts,stories-styles.tsx}`,
  `convex/modules/events/card.ts`, `apps/antsia_ga/src/components/network-shell.tsx`,
  `apps/antsia_ga/src/components/public/public-post-card.tsx`.
