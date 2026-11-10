# ADR-0030 : Le bureau d'antsia.ga au système des chartes, et le thème au rail

- **Statut** : Proposé — demandé par le propriétaire le 20/10/2026 (« il y a vraiment un
  problème, tu n'arrives pas à implémenter les 7 design et chartes graphiques ») ; « accepté »
  après recette.
- **Date** : 2026-10-20
- **Complète** : ADR-0027 (sept thèmes, système épuré) et ADR-0028 (l'écran des chartes dans
  le fil). Ne modifie ni les couleurs, ni les fonds, ni les angles des thèmes.
- **État d'exécution** : code et tests dans les sources. Observé dans l'application réelle
  (serveur de développement, backend local, compte de démonstration, publication avec photo) à
  1 440 et 390 px, dans les sept thèmes en clair et en sombre, le 20/10/2026.

## Contexte

Le 20/10 au matin, le propriétaire a montré le fil d'antsia.ga au bureau (1 440 px, Gaboma clair)
et constaté qu'il ne ressemblait pas aux planches des chartes : photo bord à bord dans la
publication, aucune ligne `@identifiant · date`, aucune rangée d'icônes.

Deux causes, mesurées dans l'application réelle :

1. **La capture précède la PR 14** (fusionnée le 20/10 à 9 h 44, ADR-0028) : la présentation
   « charte » des publications n'était pas dans le serveur qui tournait. Avec `main` à jour, la
   publication du bureau reprend l'écran des chartes (en-tête, texte, photo posée dans la carte,
   rangée d'icônes), comme au téléphone.
2. **Le chrome du bureau n'avait pas été repris** : l'ADR-0028 ne portait que l'écran du
   téléphone. Au bureau restaient la marque en encre d'identité et en police du texte, sans son
   point ; l'icône d'identité sans son rond gris et la sortie en bouton fantôme ; la recherche
   du fil et d'iCom en pastilles blanches à filet décoratif ; le sélecteur de portée en champ
   bordé ; « Voir mon profil » sans trait. Et le **thème** ne se choisissait que dans
   Paramètres > Affichage : depuis le fil, rien ne montrait qu'il en existe sept.

## Décision

Nous alignons le chrome du bureau sur le système des chartes, par les jetons déjà au contrat
(ADR-0027) et leurs replis d'origine — DIASPORALE et la console ne changent pas :

1. **La marque** de la barre du haut est celle du téléphone : Familjen Grotesk, 22 px,
   approche de 0,06 em, encre du texte, et son point à l'aplat d'identité.
2. **Les icônes de l'en-tête** sont toutes des ronds gris (`--esp-header-icon-*`) : clair/sombre,
   cloche et identité. **Se déconnecter** est un geste neutre : le bouton gris du système
   (variante `outline`, sans filet dans les thèmes ANTSIA), comme Annuler et Plus tard.
3. **Les champs** prennent l'angle des champs (`--esp-field-radius`, 14 px) : recherche du fil,
   recherche d'iCom, sélecteurs du rail. La recherche du fil porte le contour de contrôle à 3:1
   (`--input`), gardé par décision du propriétaire (ADR-0027 §3) ; la recherche d'iCom reste
   sans filet, son creux la distingue de la carte.
4. **Le sélecteur de portée** (« Pour vous ») est une puce des chartes : angle des puces, gris
   du creux, aucun filet (`--esp-chip-*`).
5. **« Voir mon profil »** est une action en texte des chartes : souligné
   (`--esp-inline-link-decoration`).
6. **Le thème se choisit aussi au rail**, sous l'apparence : le fournisseur d'apparence reçoit
   de l'application le NOM de chaque thème dans la langue de la personne (`themeName`), et le
   contrôle du rail (`AppearanceControl`) propose alors les sept thèmes. En session, le choix
   passe par le contexte `useThemeChoice` — désormais dans le moteur, monté par l'application
   (`PersonalTheme`) — donc s'enregistre sur le compte comme dans Préférences > Thème ; hors
   session, il reste sur l'appareil. Sans nom fourni, le rail ne propose aucun thème (DIASPORALE,
   console).

## Conséquences

### Positives

- Le bureau et le téléphone parlent le même système : une marque, des ronds, des pilules, des
  puces, des champs à 14 px, un seul trait de lien.
- Les sept thèmes sont visibles depuis le fil, en deux gestes, avec leurs noms.
- Retour arrière en une ligne par site : chaque jeton garde son repli d'origine ; retirer
  `themeName` du fournisseur retire le thème du rail.

### Négatives

- Deux sélecteurs de thème (rail, Préférences) à tenir en parité : même liste, mêmes noms.
- La recherche du fil, autrefois blanche à filet décoratif, porte un contour plus visible
  (3:1) : c'est le choix du propriétaire pour tous les champs.

### Neutres

- Les captures de recette vivent hors du dépôt (banc Playwright de la session) ; la méthode est
  dans `docs/22_THEMES_ET_OPTIONS_ANTSIA.md`.

## Alternatives considérées

### Option A — ne rien changer au bureau, renvoyer au `git pull`

La première cause suffisait à expliquer la capture, pas l'écart du chrome du bureau avec les
planches. Écartée.

### Option B — le thème au rail par une liste d'étiquettes codées dans le moteur

Le moteur ne connaît pas les noms des thèmes d'une application. Écartée : l'application nomme,
le moteur affiche.

## Références

- ADR-0026 (thème du compte), ADR-0027 (système épuré), ADR-0028 (écran des chartes).
- `apps/antsia_ga/src/components/member-chrome.tsx`, `identity-tools.tsx`, `providers.tsx`,
  `personal-theme.tsx` ; `packages/social-features/src/shell/appearance/{provider,
  AppearanceControl, theme-choice}.tsx` ; `packages/social-features/src/shell/ReseauAgentPage.tsx` ;
  `packages/social-features/src/features/reseau-personnel/ProfileMiniCard.tsx` ;
  `packages/social-features/src/features/messagerie/messagerie-styles.tsx`.
