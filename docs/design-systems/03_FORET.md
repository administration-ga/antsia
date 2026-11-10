# Design system ANTSIA — Forêt

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

Forêt associe un vert forêt, une olive et un miel. Le fond Lin est beige en clair et noir chaud en sombre ; les cartes claires sont blanc cassé. Les trois familles restent distinctes dans les actions.

| Repère | Valeur |
|---|---|
| Nom français | Forêt |
| Identifiant enregistré (`persons.theme`) | `foret` |
| Attribut sur `<html>` | `data-charte="antsia-foret"` |
| Feuille du thème | [antsia-foret.css](../../packages/ui/src/themes/antsia-foret.css) |

L’apparence claire ou sombre est un choix indépendant du thème ; la classe `.dark`
active les valeurs sombres. Le fond fait partie de la palette du thème.

## 2. Trois couleurs de signature

Ces couleurs définissent le nuancier clair et la répartition des gestes.
Les variantes sombres et les encres lisibles figurent dans les tables suivantes.

| Couleur | Signature | Gestes |
|---|---|---|
| Vert forêt | `#317A45` | Publier et créer |
| Olive | `#646E40` | Suivre et écrire |
| Miel | `#C98A2B` | Réagir, participer et acheter |

Le vert forêt porte l’identité et l’aplat de validation, mais leurs encres claires sont distinctes. L’olive des relations et celle des messages ont aussi des encres différentes ; ne pas les fusionner.

## 3. Surfaces et encre

| Surface ou usage | Jeton | Clair | Sombre |
|---|---|---|---|
| Fond de page | `--background` | `#F4EFE7` | `#141312` |
| Carte | `--card` | `#FFFDF9` | `#1E1D1B` |
| Creux : champ, puce, neutre | `--muted` | `#ECE6DB` | `#282624` |
| Texte principal | `--foreground` | `#1E1B16` | `#EFEBE4` |
| Texte secondaire | `--muted-foreground` | `#655E52` | `#ACA69C` |
| Filet décoratif | `--border` | `#E3DCCF` | `#33312D` |
| Contour de champ | `--input` | `#8C8373` | `#86817A` |

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
| Principal | `#317A45` / `#FFFFFF` / `#2D7240` | `#76BF85` / `#031C09` / `#76BF85` |
| Relations | `#646E40` / `#FFFFFF` / `#535C33` | `#9AA66A` / `#141A08` / `#B0BC80` |
| Messages | `#646E40` / `#FFFFFF` / `#4A5330` | `#9AA66A` / `#141A08` / `#BDC88F` |
| Réactions | `#C98A2B` / `#2A1A00` / `#A0670F` | `#E5B04F` / `#2A1A00` / `#EBB85E` |
| Commerce | `#C98A2B` / `#2A1A00` / `#946000` | `#E5B04F` / `#2A1A00` / `#EBB85E` |
| Validation | `#317A45` / `#FFFFFF` / `#28723D` | `#76BF85` / `#031C09` / `#76BF85` |
| Danger | `#B3261E` / `#FFFFFF` / `#A3221B` | `#F0897E` / `#2A0603` / `#F59A90` |

Les suffixes `social`, `message`, `react`, `commerce`, `success` et `danger`
correspondent aux six rôles après Principal. `--success` et `--destructive`
exposent une encre ; `--success-fill` et `--danger-fill` exposent un aplat.

## 5. Traitements et états

| Traitement | Jeton | Clair | Sombre |
|---|---|---|---|
| Écrire : fond tonal | `--role-message-soft` | `#E8E8DD` | `#313227` |
| Réaction posée : fond doux | `--role-react-soft` | `#F7EDDC` | `#3A3222` |
| Survol de l’identité | `--primary-fill-hover` | `#2C6E3E` | `#86C794` |
| Onglet actif : fond | `--esp-tab-active-bg` | `#DEE8DC` | `#2C372C` |
| Onglet actif : texte | `--esp-tab-active-fg` | `#2D7240` | `#76BF85` |
| Barre mobile : fond | `--esp-mobilebar-bg` | `rgb(255 253 249 / 0.9)` | `rgb(30 29 27 / 0.9)` |

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

- L’encre principale claire actuelle est `#2D7240` (`--primary-500`, résolu par `--primary`). L’ancienne référence donnait `#307944`.
- Le document historique relève 4,28:1 sur le creux pour `#307944`, sous les 4,5:1 exigés pour le texte. L’aplat de publication reste `#317A45` : corriger l’encre ne change pas cette signature.
- En sombre, les aplats vert et olive portent des textes foncés distincts (`#031C09` et `#141A08`). Conserver les couples de rôle complets.

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
