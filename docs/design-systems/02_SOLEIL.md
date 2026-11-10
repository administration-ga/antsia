# Design system ANTSIA — Soleil

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

Soleil associe la mandarine, l’azur et le coquelicot. La mandarine porte la création et le commerce ; l’azur accompagne les relations et les messages. Le fond Craie devient charbon en sombre.

| Repère | Valeur |
|---|---|
| Nom français | Soleil |
| Identifiant enregistré (`persons.theme`) | `soleil` |
| Attribut sur `<html>` | `data-charte="antsia-soleil"` |
| Feuille du thème | [antsia-soleil.css](../../packages/ui/src/themes/antsia-soleil.css) |

L’apparence claire ou sombre est un choix indépendant du thème ; la classe `.dark`
active les valeurs sombres. Le fond fait partie de la palette du thème.

## 2. Trois couleurs de signature

Ces couleurs définissent le nuancier clair et la répartition des gestes.
Les variantes sombres et les encres lisibles figurent dans les tables suivantes.

| Couleur | Signature | Gestes |
|---|---|---|
| Mandarine | `#EC8B34` | Publier, participer et acheter |
| Azur | `#3F9FE8` | Suivre et écrire |
| Coquelicot | `#F1453B` | Réagir |

La mandarine sert aussi aux actions commerciales ; elle ne remplace pas le vert de validation. Le coquelicot est la couleur de réaction ; supprimer reste une action de danger avec ses propres jetons.

## 3. Surfaces et encre

| Surface ou usage | Jeton | Clair | Sombre |
|---|---|---|---|
| Fond de page | `--background` | `#F5F4F2` | `#0C0C0D` |
| Carte | `--card` | `#FFFFFF` | `#161618` |
| Creux : champ, puce, neutre | `--muted` | `#EFEEEB` | `#1F1F22` |
| Texte principal | `--foreground` | `#1C1917` | `#F2F2F3` |
| Texte secondaire | `--muted-foreground` | `#645E59` | `#A0A0A8` |
| Filet décoratif | `--border` | `#E7E5E2` | `#29292D` |
| Contour de champ | `--input` | `#8A8682` | `#75757C` |

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
| Principal | `#EC8B34` / `#1F1300` / `#A4520D` | `#F29A4A` / `#1F1300` / `#F6A660` |
| Relations | `#3F9FE8` / `#00182B` / `#006CAC` | `#54B3FD` / `#00182B` / `#54B3FD` |
| Messages | `#3F9FE8` / `#00182B` / `#006CAC` | `#54B3FD` / `#00182B` / `#54B3FD` |
| Réactions | `#F1453B` / `#290B09` / `#F1453B` | `#F1453B` / `#290B09` / `#F1453B` |
| Commerce | `#EC8B34` / `#1F1300` / `#A4520D` | `#F29A4A` / `#1F1300` / `#F6A660` |
| Validation | `#237A40` / `#FFFFFF` / `#1B6434` | `#5CC584` / `#062612` / `#6BD192` |
| Danger | `#C8331F` / `#FFFFFF` / `#B42D1B` | `#FF7B66` / `#2A0700` / `#FF8B78` |

Les suffixes `social`, `message`, `react`, `commerce`, `success` et `danger`
correspondent aux six rôles après Principal. `--success` et `--destructive`
exposent une encre ; `--success-fill` et `--danger-fill` exposent un aplat.

## 5. Traitements et états

| Traitement | Jeton | Clair | Sombre |
|---|---|---|---|
| Écrire : fond tonal | `--role-message-soft` | `#E2F1FC` | `#1F2E3A` |
| Réaction posée : fond doux | `--role-react-soft` | `#FDE5E4` | `#351D1D` |
| Survol de l’identité | `--primary-fill-hover` | `#EE994C` | `#F4A660` |
| Onglet actif : fond | `--esp-tab-active-bg` | `#FCECDF` | `#392B20` |
| Onglet actif : texte | `--esp-tab-active-fg` | `#A4520D` | `#F6A660` |
| Barre mobile : fond | `--esp-mobilebar-bg` | `rgb(255 255 255 / 0.9)` | `rgb(22 22 24 / 0.9)` |

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

Le CSS du nouveau canevas ajoute une petite ombre de carte en clair et un
filet lumineux intérieur en sombre. Le code actuel garde ses cartes sans ombre ;
voir les valeurs dans le [registre des écarts](08_ECARTS_REFERENCE_ET_CODE.md#ombres-et-filets).

## 7. Accessibilité et écarts avec l’ancienne référence

- Le texte sur l’aplat mandarine est `#1F1300` en clair comme en sombre. Le texte sur l’aplat azur est `#00182B` : ces couleurs font partie du couple de contraste.
- Le document historique relève 2,6:1 pour du blanc sur la mandarine claire utilisée comme identité. Utiliser `--primary-fill-on` évite de réintroduire ce couple insuffisant.
- Aucun écart de couleur propre à Soleil n’est recensé dans la table historique « Écarts retenus ». Cela ne constitue pas une preuve de correspondance avec le nouveau canevas.

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
