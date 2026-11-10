# Design system ANTSIA — Gaboma

Date du relevé : **20 octobre 2026**.

> **Référence consultée.** [ANTSIA — sept thèmes, toutes les pages](https://claude.ai/artifact/AnLxkaqaai725ywzkrVk6b#page-c71058556eba).
> Les huit rubriques et leurs 60 planches ont été inventoriées. Les surfaces
> et triplets de rôle ci-dessous concordent avec les déclarations du canevas
> et les CSS du dépôt : 392 valeurs vérifiées pour les sept thèmes.
> Les traitements supplémentaires du tableau 5 sont les constantes du code actuel ;
> les définitions du canevas et leurs différences sont précisées dans
> [le registre des écarts](08_ECARTS_REFERENCE_ET_CODE.md).
> Ce relevé documentaire ne vaut pas recette de l'application ni calcul de contraste.

[Socle commun](00_SOCLE_COMMUN.md) · [Index des sept design systems](README.md)

## 1. Intention et identifiants

Gaboma est le thème par défaut du réseau ANTSIA. Il reprend les trois couleurs du drapeau : vert de la forêt, safran de l’équateur et bleu de la mer. Son fond Onyx associe un blanc franc en clair à un noir absolu en sombre.

| Repère | Valeur |
|---|---|
| Nom français | Gaboma |
| Identifiant enregistré (`persons.theme`) | `gaboma` |
| Attribut sur `<html>` | `data-charte="antsia"` |
| Feuille du thème | [antsia.css](../../packages/ui/src/themes/antsia.css) |

L’apparence claire ou sombre est un choix indépendant du thème ; la classe `.dark`
active les valeurs sombres. Le fond fait partie de la palette du thème.

## 2. Trois couleurs de signature

Ces couleurs définissent le nuancier clair et la répartition des gestes.
Les variantes sombres et les encres lisibles figurent dans les tables suivantes.

| Couleur | Signature | Gestes |
|---|---|---|
| Vert | `#007E4D` | Suivre, créer une relation |
| Safran | `#F4BB44` | Réagir, participer et acheter |
| Bleu | `#2F67B5` | Publier et écrire |

Le bleu porte la publication et les messages ; le vert identifie la relation ; le safran porte les réactions et le commerce. Les encres des messages et de l’identité diffèrent en sombre : conserver leurs jetons respectifs.

## 3. Surfaces et encre

| Surface ou usage | Jeton | Clair | Sombre |
|---|---|---|---|
| Fond de page | `--background` | `#FFFFFF` | `#000000` |
| Carte | `--card` | `#F7F7F7` | `#141414` |
| Creux : champ, puce, neutre | `--muted` | `#EEEEEE` | `#1E1E1E` |
| Texte principal | `--foreground` | `#0A0A0A` | `#F5F5F5` |
| Texte secondaire | `--muted-foreground` | `#616161` | `#A1A1A1` |
| Filet décoratif | `--border` | `#E6E6E6` | `#262626` |
| Contour de champ | `--input` | `#878787` | `#707070` |

Le creux accueille les commandes neutres et les surfaces secondaires.
Le filet est décoratif ; le contour de champ identifie une commande.
Les cartes de ce thème se distinguent du fond par leur ton et gardent
`--esp-surface-border: transparent`.

## 4. Couleurs par rôle

Chaque cellule suit **aplat / texte sur l’aplat / encre en texte**.
Le principal lit `--primary-fill`, `--primary-fill-on`, puis `--primary`.
Les autres rôles lisent `--role-<fonction>-fill`, `-on`, puis `-ink`.

| Fonction | Clair : aplat / texte / encre | Sombre : aplat / texte / encre |
|---|---|---|
| Principal | `#2F67B5` / `#FFFFFF` / `#2A5FA8` | `#6FA2F0` / `#06142E` / `#86B2F4` |
| Relations | `#007E4D` / `#FFFFFF` / `#006B42` | `#2FCB86` / `#03210F` / `#4AD898` |
| Messages | `#2F67B5` / `#FFFFFF` / `#2A5FA8` | `#6FA2F0` / `#06142E` / `#9DC0F6` |
| Réactions | `#F4BB44` / `#1F1400` / `#AF7F00` | `#F4BB44` / `#1F1400` / `#F4BB44` |
| Commerce | `#F4BB44` / `#1F1400` / `#8A6400` | `#F4BB44` / `#1F1400` / `#F4BB44` |
| Validation | `#00804E` / `#FFFFFF` / `#006B42` | `#2FCB86` / `#03210F` / `#4AD898` |
| Danger | `#C8102E` / `#FFFFFF` / `#B50E29` | `#FF6B7A` / `#2A0509` / `#FF8592` |

Les suffixes `social`, `message`, `react`, `commerce`, `success` et `danger`
correspondent aux six rôles après Principal. `--success` et `--destructive`
exposent une encre ; `--success-fill` et `--danger-fill` exposent un aplat.

## 5. Traitements et états

| Traitement | Jeton | Clair | Sombre |
|---|---|---|---|
| Écrire : fond tonal | `--role-message-soft` | `#D9E1ED` | `#222935` |
| Réaction posée : fond doux | `--role-react-soft` | `#F7EFDE` | `#332B1B` |
| Survol de l’identité | `--primary-fill-hover` | `#2A5DA3` | `#80ADF2` |
| Onglet actif : fond | `--esp-tab-active-bg` | `#D7E0EC` | `#232B37` |
| Onglet actif : texte | `--esp-tab-active-fg` | `#2A5FA8` | `#86B2F4` |
| Barre mobile : fond | `--esp-mobilebar-bg` | `rgb(247 247 247 / 0.9)` | `rgb(20 20 20 / 0.9)` |

Le bouton Écrire associe son fond doux à `--role-message-ink`.
L’onglet courant associe les deux jetons `--esp-tab-active-*`.
La barre mobile est translucide à 90 % ; son rendu composé dépend du fond réel.
Les angles, cibles de 44 px, espacements et polices Inter/Familjen Grotesk suivent
le [socle commun](00_SOCLE_COMMUN.md), sans variante propre à ce thème.

## 6. Application aux composants

| Composant ou geste | Application du système |
|---|---|
| Publier, Créer | Aplat principal et `--primary-fill-on` ; survol de l’identité ci-dessus. |
| Suivre | Couple `--role-social-fill` / `--role-social-on`. |
| Écrire | Traitement tonal : `--role-message-soft` / `--role-message-ink`. |
| Réagir | Encre `--role-react-ink` ; fond doux pour l’état réagi. |
| Participer, Acheter | Couple `--role-commerce-fill` / `--role-commerce-on`. |
| Valider, Accepter | Couple `--role-success-fill` / `--role-success-on` ; confirmation en encre. |
| Supprimer, Refuser | Couple `--role-danger-fill` / `--role-danger-on` ; erreur en encre. |
| Annuler, Plus tard | Fond `--muted`, texte `--foreground`, sans contour. |
| Cartes et médias | Surface `--card`, sans filet de carte ; géométrie du socle commun. |
| Badges | Coche Vérifié en `--role-social-ink` ; Officiel en encre pleine ; rayon du socle. |

Les bulles de mes messages et les commandes principales suivent le couple
`--primary-fill` / `--primary-fill-on`. Une réaction et un refus conservent
leurs rôles distincts, même si leurs couleurs sont proches.

## 7. Accessibilité et écarts avec l’ancienne référence

- En sombre, le texte d’un aplat bleu est `#06142E`, celui d’un aplat vert `#03210F` : ne pas les remplacer par un blanc générique.
- Le contour de champ clair actuel est `#878787`. L’ancienne référence donnait `#8A8A8A` ; le document historique relève 2,98:1 sur le creux pour cette ancienne valeur, sous le seuil de 3:1.
- Cet écart concerne le contrôle de saisie, pas le filet décoratif `#E6E6E6`. Garder ces deux usages distincts.

- Les succès et dangers associent une icône et un texte ; la couleur seule ne suffit pas.
- Les cibles de 44 px, le focus visible et les contours de champs suivent le socle commun.
- Les rapports de contraste cités ici proviennent de la documentation historique ;
  aucune mesure de contraste ni recette écran n’a été relancée pour cette fiche.

Ces écarts sont consignés dans
[Thèmes et options d’affichage](../22_THEMES_ET_OPTIONS_ANTSIA.md#écarts-retenus-par-rapport-aux-chartes).
Ils concernent l'ancien artifact `Arc4fsUDikm3DRHuZNr35u`. Les 392 valeurs
des surfaces et rôles du nouveau canevas concordent désormais avec le code.

## 8. Couverture et contrôles pour l'implémentation

Le [dossier des huit rubriques](README.md#les-huit-rubriques-du-canevas) couvre
les 60 planches, leurs fichiers, routes, composants et états relevés.
Le nuancier montre les deux modes ; le fil mobile montre sept thèmes clairs et
sept sombres, la tablette et le bureau sept thèmes clairs chacun.

- Conserver les couples aplat / texte et les encres propres à chaque rôle.
- Consulter les différences de typographie, dimensions, effets et motifs dans
  le [registre des écarts](08_ECARTS_REFERENCE_ET_CODE.md).
- Vérifier ensuite dans l'application les trois formats, le sombre, les portails,
  les interactions, le clavier, les textes longs et la persistance du choix.
- Les preuves historiques de contraste et les maquettes ne remplacent pas
  une nouvelle recette des composants réellement servis.

Cette fiche documente le système et prépare son raccordement. Aucun fichier
applicatif n'est modifié dans cette étape.
