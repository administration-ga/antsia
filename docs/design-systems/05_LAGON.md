# Design system ANTSIA — Lagon

Date du relevé : **20 octobre 2026**.

> **Référence consultée.** [ANTSIA — sept thèmes, toutes les pages](https://claude.ai/artifact/AnLxkaqaai725ywzkrVk6b#page-c71058556eba).
> Les huit rubriques et leurs 60 planches ont été inventoriées. Les surfaces
> et triplets de rôle ci-dessous concordent avec les déclarations du canevas
> et les CSS du dépôt : 392 valeurs vérifiées pour les sept thèmes.
> Les traitements supplémentaires du tableau 5 sont les constantes du code actuel ;
> les définitions du canevas et leurs différences sont précisées dans
> [le registre des écarts](08_ECARTS_REFERENCE_ET_CODE.md).
> Ce relevé documentaire ne vaut pas recette de l'application ni calcul de contraste.

Navigation : [Index des sept systèmes](README.md) · [Socle commun](00_SOCLE_COMMUN.md).

## 1. Intention et identifiants

Lagon repose sur le turquoise, le corail Bittersweet et le jaune de Naples. Le turquoise rassemble les gestes de publication et de relation ; le corail désigne les réactions ; le jaune réserve un repère lumineux aux gestes de participation et d’achat.

| Élément | Valeur |
|---|---|
| Nom français | Lagon |
| Nom anglais | Lagoon |
| Identifiant enregistré | `lagon` |
| Attribut racine | `data-charte="antsia-lagon"` |
| Famille de fond | Greige — greige en clair, anthracite en sombre |
| Fichier de jetons | [antsia-lagon.css](../../packages/ui/src/themes/antsia-lagon.css) |

Le thème se combine avec l’apparence système, claire ou sombre et avec le motif choisi.
Les rayons, polices, espacements, tailles de cible et comportements suivent le
[socle commun](00_SOCLE_COMMUN.md), sans variante géométrique propre à Lagon.

## 2. Les trois couleurs signature

Le nuancier correspond à `--esp-theme-swatch-1`, `-2`, `-3`, dans cet ordre.
Il identifie le thème dans le sélecteur et l’anneau des actus ; les rôles ci-dessous
précisent les adaptations de mode et les encres utilisables.

| Couleur | Valeur signature | Gestes associés |
|---|---|---|
| Turquoise | `#4ECDC4` | Publier, Créer, suivre, se connecter, écrire |
| Bittersweet | `#FF6B6B` | Réagir, pastilles de notifications |
| Jaune de Naples | `#FFE66D` | Participer, acheter |

Succès et danger restent des fonctions distinctes de ces trois signatures.
Une couleur de signature ne remplace pas un jeton sémantique dans un composant.

## 3. Surfaces et encres neutres

Valeurs résolues depuis le CSS ; le mode sombre surcharge les primitives de nuit.

| Usage | Jeton | Clair | Sombre |
|---|---|---|---|
| Fond de page | `--background` | `#EDECE8` | `#1A1A1A` |
| Carte | `--card` | `#FAFAF8` | `#242424` |
| Creux : puce, champ, Annuler | `--muted` | `#E4E2DD` | `#2E2E2E` |
| Texte principal | `--foreground` | `#1A1A18` | `#ECECEC` |
| Texte secondaire | `--muted-foreground` | `#5C5A54` | `#A8A8A8` |
| Filet décoratif | `--border` | `#DCDAD3` | `#363636` |
| Contour de champ | `--input` | `#817F77` | `#7C7C7C` |

La carte se distingue du fond par sa teinte : `--esp-surface-border` est `transparent`. Le champ et le focus conservent leurs contours fonctionnels.
Le motif reste posé sur la page, jamais sur la carte ; son contrat est commun.

## 4. Rôles sémantiques

Chaque cellule donne **aplat · texte sur l’aplat · encre** dans cet ordre.
Principal utilise `--primary-fill`, `--primary-fill-on`, `--primary`.
Les six autres lignes utilisent `--role-<rôle>-fill`, `-on`, `-ink` avec les rôles
`social`, `message`, `react`, `commerce`, `success` et `danger`.

| Rôle | Gestes | Clair | Sombre |
|---|---|---|---|
| Principal | Publier, Créer | `#4ECDC4` · `#0B2D2A` · `#0D6F6A` | `#4ECDC4` · `#0B2D2A` · `#6FE0D8` |
| Relations | Suivre, se connecter | `#4ECDC4` · `#0B2D2A` · `#0D6F6A` | `#4ECDC4` · `#0B2D2A` · `#7FE6DF` |
| Messages | Écrire, Envoyer | `#4ECDC4` · `#0B2D2A` · `#0D6F6A` | `#4ECDC4` · `#0B2D2A` · `#7FE6DF` |
| Réactions | J’aime, réactions | `#FF6B6B` · `#2B0505` · `#E04848` | `#FF6B6B` · `#2B0505` · `#FF8585` |
| Commerce | Acheter, Participer | `#FFE66D` · `#1B1600` · `#7C6A00` | `#FFE66D` · `#1B1600` · `#FFE66D` |
| Validation | Accepter, Confirmer | `#1E7A4F` · `#FFFFFF` · `#17633F` | `#5FD39A` · `#062614` · `#6FDCA6` |
| Danger | Supprimer, Signaler | `#C93030` · `#FFFFFF` · `#B82B2B` | `#FF7B72` · `#2A0505` · `#FF8F87` |

L’encre sert au texte ou à l’icône ; l’aplat sert au bloc plein avec son propre texte.
`--success` et `--destructive` suivent les encres de validation et de danger.
Annuler et Plus tard restent neutres : fond du creux, texte principal, sans filet.

## 5. Traitements doux et états

| Traitement | Jeton | Clair | Sombre |
|---|---|---|---|
| Fond tonal Écrire | `--role-message-soft` | `#E0F3F0` | `#2A3D3C` |
| Fond d’une réaction posée | `--role-react-soft` | `#FBE6E4` | `#432E2E` |
| Survol de l’identité | `--primary-fill-hover` | `#63D3CB` | `#63D3CB` |
| Fond d’onglet actif | `--esp-tab-active-bg` | `#DEF3F0` | `#2B3F3E` |
| Texte d’onglet actif | `--esp-tab-active-fg` | `#0D6F6A` | `#6FE0D8` |
| Fond de la barre mobile | `--esp-mobilebar-bg` | `rgb(250 250 248 / 0.9)` | `rgb(36 36 36 / 0.9)` |
| Contour de surface | `--esp-surface-border` | `transparent` | `transparent` |

Écrire associe le fond tonal des messages à leur encre ; Envoyer utilise l’aplat
et le texte du rôle message. Une réaction posée reçoit son fond doux et son icône
à l’encre de réaction ; son libellé garde `--foreground` (`--role-react-label`).

Le survol ci-dessus concerne l’identité. Les autres survols, focus, états désactivés
et chargements restent ceux des composants du [socle commun](00_SOCLE_COMMUN.md).
La barre mobile garde son alpha de 0,9 ; elle n’est pas une nouvelle surface opaque.
Le bouton Créer reprend l’aplat d’identité et son ombre teintée :

- Clair : `0 10px 20px -8px rgb(78 205 196 / 0.55)`.
- Sombre : `0 10px 20px -8px rgb(78 205 196 / 0.45)`.

## 6. Application aux composants

| Composant ou geste | Application du thème |
|---|---|
| Publier, Créer, interrupteur, case cochée | Aplat principal et `--primary-fill-on` ; le point de marque suit cet aplat. |
| Mes bulles de message, puce de portée du fil | Aplat d’identité et son texte dédié, selon le contrat du composant. |
| Suggestion de personne | Suivre à l’aplat social ; Écrire en tonal message ; actions de même largeur. |
| Publication | Carte du thème, texte puis média posé dans la carte ; rangée d’icônes en pied. |
| J’aime posé et pastille de décompte | Rôle réaction ; décomptes ordinaires en encre secondaire. |
| Acheter, Participer, Rejoindre, Candidater | Rôle commerce ; le droit d’afficher l’action reste fonctionnel. |
| Vérifié, Agent public, Officiel | Coche en encre sociale ; Agent public en tonal message ; Officiel en encre pleine. |
| Valider, Supprimer, En direct | Rôles validation ou danger avec icône et texte ; aucune signification par la couleur seule. |
| En-tête, puces neutres, Annuler | Creux neutre ; destination active en pastille tonale ; géométrie du socle. |

Les badges d’identité restent calculés côté serveur ; le thème n’accorde aucun statut.
Les règles de composition des cartes et les noms accessibles restent ceux du
[socle commun](00_SOCLE_COMMUN.md) et des [composants des chartes](../adr/0028-ecran-des-chartes-a-la-lettre.md).

## 7. Accessibilité et écarts historiques

Le turquoise `#4ECDC4` conserve le texte sombre `#0B2D2A` sur ses aplats dans les deux modes. En clair, l’encre `#0D6F6A` sert au texte principal d’identité, aux relations et aux messages ; le turquoise d’aplat ne doit pas devenir une couleur de texte par substitution.

Les seuils du contrat existant sont 4,5:1 pour les encres de texte et les textes sur
aplat, 3:1 pour les contrôles de champ et les icônes de réaction. docs/22 rapporte
des contrôles historiques ; ils n’ont pas été relancés pendant ce relevé.

| Élément | Ancienne planche, d’après docs/22 | CSS conservé | Motif documenté |
|---|---|---|---|
| Encre d’identité, relations et messages en clair | `#0E7570` | `#0D6F6A` | docs/22 rapporte 4,27:1 sur le creux pour la valeur de la planche. |
| Contour de champ clair | `#88857D` | `#817F77` | docs/22 rapporte 2,85:1 sur le creux pour la valeur de la planche ; le contrôle attend 3:1. |

En sombre, l’encre d’identité (`#6FE0D8`) et l’encre des relations/messages (`#7FE6DF`) diffèrent. Le champ sombre est `#7C7C7C` : aucune de ces valeurs n’est déduite du nouveau canevas.

Les cibles de 44 px et les champs à contour fonctionnel suivent le socle commun.
Le focus ne dépend pas de la seule couleur ; les erreurs et confirmations gardent
un texte et une icône. Ces règles ne constituent pas une recette de cette mission.

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
