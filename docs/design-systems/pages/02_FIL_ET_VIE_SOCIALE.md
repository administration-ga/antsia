# ANTSIA — Fil et vie sociale

Date du relevé : **20 octobre 2026**.

Source exacte : [artifact ANTSIA, page `5bdd874f13a4`](https://claude.ai/artifact/AnLxkaqaai725ywzkrVk6b#page-5bdd874f13a4).

**Statut : relevé DOM/CSS du canevas de référence.** Les neuf planches ci-dessous
ont été relevées dans les trois vues affichées : mobile `390 × 844`, tablette
`834 × 1194` et bureau `1440 × 1024`. Il s'agit d'une spécification du canevas,
sans recette de l'application ni validation de toutes les interactions.

Les routes sont les repères montrés par les planches ; leur raccordement au code
reste à contrôler. Typographie, géométrie et primitives : [socle commun](../00_SOCLE_COMMUN.md).

## Inventaire des neuf planches

| N° | Fichier de planche | Route ou contexte | Composition | Actions principales |
|---|---|---|---|---|
| 1 | `Fil.dc.html` | `/fil` | Actus « Vous » + neuf personnes ; portées et modes ; suggestion ; publications ; produit et évènement ; rail et dock iCom au bureau | Pour vous / Récents, Liste / Immersion, Suivre, Écrire, réagir, commenter, partager, enregistrer |
| 2 | `Creer.dc.html` | Rédaction d'une publication | Texte, photo / vidéo, média retirable, audience, accès sans compte et province facultative | Fermer, abandonner le brouillon, joindre / retirer un média, choisir l'audience, Publier |
| 3 | `Publication.dc.html` | `/fil?post=…` | Publication ouverte et panneau Commentaires | Retour au fil, répondre, signaler, voir trois réponses, modifier / retirer son commentaire, Publier |
| 4 | `Actus.dc.html` | `/actus` | Média plein écran, auteur, date et province | Autres actions, J'aime, partager |
| 5 | `Explorer.dc.html` | `/explorer` | Tout découvrir / Boutiques / Services / Emplois ; fil national ; provinces ; mot-clé | Changer de rubrique, choisir une province, saisir un mot-clé, Vue publique |
| 6 | `Groupes.dc.html` | `/fil?tab=groupes` | Invitation ; mes groupes avec rôle ; recherche et découverte | Accepter / Décliner, Créer, Découvrir, Rejoindre |
| 7 | `Evenements.dc.html` | `/fil?tab=evenements` | À venir ; dates, lieu, organisateur ; inscription confirmée ; invitations en attente | Créer, participer, décliner, voir les invités |
| 8 | `Notifications.dc.html` | `/fil?notifications=1` | Notifications en superposition au fil, dont invitation | Fermer, tout marquer lu, accepter / refuser l'invitation |
| 9 | `Mon-fil.dc.html` | `/mon-fil` | Personnes en sourdine et publications masquées, en deux ensembles | Réafficher une personne, Restaurer une publication |

## Composants et états dessinés

### Fil, publication et composition

- L'entrée des actus présente « Vous » avant les neuf autres personnes.
- Le fil montre les choix **Pour vous / Récents** et **Liste / Immersion**.
- La suggestion associe une personne aux deux actions distinctes Suivre et Écrire.
- Une publication porte Vérifié ; une publication de page porte Officiel et
  identifie l'agent qui publie. Ces deux contextes restent distincts.
- Le média se trouve à l'intérieur de la carte. Les actions comprennent réactions,
  commentaires, partage et enregistrement ; produit et évènement figurent aussi au fil.

Le composeur montre un champ de texte, les entrées photo / vidéo et un média
retirable. « Qui peut voir » propose **Mes connexions** et **Tout le réseau**.
La case **Accessible sans compte** est distincte de ce choix d'audience.
La province est facultative et son sélecteur présente neuf choix.
Fermer, abandonner le brouillon et Publier sont des actions représentées.

La publication ouverte conserve un retour au fil et un panneau de commentaires.
Le dessin distingue réponse et signalement, l'ouverture de **trois réponses**,
ainsi que modification et retrait de son propre commentaire. Le bouton Publier
appartient ici à la saisie du commentaire ; il ne désigne pas une seconde publication du fil.

### Actus et découverte

L'actualité ouverte utilise un média plein écran avec auteur, date et province.
Les actions relevées sont autres actions, J'aime et partager.
Le relevé ne démontre ni lecture automatique ni durée d'affichage.

Explorer propose quatre rubriques : **Tout découvrir**, **Boutiques**, **Services**
et **Emplois**. La découverte comprend le fil national et les neuf provinces.
Le mot-clé est annoncé entre **2 et 30 caractères, sans espace**.
**Vue publique** est un accès explicite figurant dans cette planche.

### Groupes, évènements et notifications

Les groupes montrent une invitation avec Accepter / Décliner, un accès Créer,
les groupes de la personne avec les rôles **Membre** ou **Propriétaire**, puis
la recherche, la découverte et Rejoindre. Le rôle affiché ne vaut pas preuve d'autorisation réelle.

Les évènements montrent dates, lieu et organisateur, un ensemble à venir,
un état **inscription confirmée** et des **invitations en attente**.
Participer, décliner et voir les invités sont les actions relevées.

Les notifications se superposent au fil. Fermer et Tout marquer lu agissent
sur cette surface ; accepter / refuser concerne l'invitation présentée.
Les états lu / non lu et les effets serveur restent à éprouver dans l'application.

### Préférences du fil

Mon fil sépare **personnes en sourdine** et **publications masquées**.
Réafficher une personne et Restaurer une publication sont deux actions indépendantes.
La planche indique que les auteurs ne sont pas notifiés ; ce comportement devra
être conservé et vérifié lors du raccordement.

## Adaptation aux trois formats

| Vue du canevas | Composition et mesures attestées |
|---|---|
| Mobile `390 × 844` | Contenu principal avec padding commun `4px 12px 120px` ; dock à cinq destinations, marges latérales `12px`, bas `16px` |
| Tablette `834 × 1194` | Contenu principal de largeur maximale `728px`, padding commun `8px 24px 140px` ; dock centré de `540px`, bas `26px` |
| Bureau `1440 × 1024` | Grille commune `248px minmax(0, 1fr) 312px`, écart `24px`, maximum `1400px`, padding `20px` ; le fil montre le rail et le dock iCom |

Ces dimensions décrivent le canevas. Le passage des commentaires, notifications
et composeurs entre formats devra préserver les commandes et le contenu utile.
Les débordements, la hauteur avec clavier et la navigation arrière restent à vérifier.

## Rôle des couleurs

Publier suit le rôle principal ; Suivre le social ; Écrire le message tonal.
Réagir utilise le rôle réaction ; participer et acheter le commerce.
Les validations, refus et actions neutres conservent les rôles du
[socle commun](../00_SOCLE_COMMUN.md), indépendamment du statut d'une personne ou d'une page.

Palettes : [Gaboma](../01_GABOMA.md), [Soleil](../02_SOLEIL.md),
[Forêt](../03_FORET.md), [Corail](../04_CORAIL.md), [Lagon](../05_LAGON.md),
[Électrique](../06_ELECTRIQUE.md), [Sable](../07_SABLE.md).

## Points à vérifier à l'implémentation

- Raccorder les neuf planches aux routes et composants réels sans créer de parcours parallèles.
- Vérifier audience, accès sans compte et province indépendamment de leur présentation.
- Conserver le brouillon selon le comportement retenu, et expliciter l'abandon avant perte de saisie.
- Vérifier les droits sur ses commentaires, les signalements et les invitations.
- Distinguer les badges calculés par le serveur des étiquettes de démonstration du canevas.
- Vérifier pagination, états vides, erreurs et reprises avec de vraies données.
- Contrôler au clavier les superpositions, le focus et le retour au déclencheur.
- Éprouver les trois formats et les sept thèmes dans l'application ; le présent relevé ne vaut pas recette.
