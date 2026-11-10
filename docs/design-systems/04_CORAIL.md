# Design system ANTSIA — Corail

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

Corail associe le rose corail, la mandarine et le lilas, dans la direction d’un coucher de soleil. Le rose porte la publication et les réactions ; le lilas distingue les liens entre personnes ; la mandarine réserve sa chaleur à la participation et au commerce.

| Élément | Valeur |
|---|---|
| Nom français | Corail |
| Nom anglais | Coral |
| Identifiant enregistré | `corail` |
| Attribut racine | `data-charte="antsia-corail"` |
| Famille de fond | Perle — gris perle en clair, graphite en sombre |
| Fichier de jetons | [antsia-corail.css](../../packages/ui/src/themes/antsia-corail.css) |

Le thème se combine avec l’apparence système, claire ou sombre et avec le motif choisi.
Les rayons, polices, espacements, tailles de cible et comportements suivent le
[socle commun](00_SOCLE_COMMUN.md), sans variante géométrique propre à Corail.

## 2. Les trois couleurs signature

Le nuancier correspond à `--esp-theme-swatch-1`, `-2`, `-3`, dans cet ordre.
Il identifie le thème dans le sélecteur et l’anneau des actus ; les rôles ci-dessous
précisent les adaptations de mode et les encres utilisables.

| Couleur | Valeur signature | Gestes associés |
|---|---|---|
| Rose corail | `#E25F78` | Publier, Créer, réagir |
| Mandarine | `#E69545` | Participer, acheter |
| Lilas | `#AA84D4` | Suivre, se connecter, écrire |

Succès et danger restent des fonctions distinctes de ces trois signatures.
Une couleur de signature ne remplace pas un jeton sémantique dans un composant.

## 3. Surfaces et encres neutres

Valeurs résolues depuis le CSS ; le mode sombre surcharge les primitives de nuit.

| Usage | Jeton | Clair | Sombre |
|---|---|---|---|
| Fond de page | `--background` | `#F1F1F2` | `#121212` |
| Carte | `--card` | `#FFFFFF` | `#1B1B1D` |
| Creux : puce, champ, Annuler | `--muted` | `#EAEAEC` | `#252527` |
| Texte principal | `--foreground` | `#0A0A0B` | `#EDEDEE` |
| Texte secondaire | `--muted-foreground` | `#5F5F67` | `#A0A0A6` |
| Filet décoratif | `--border` | `#E2E2E5` | `#2C2C2F` |
| Contour de champ | `--input` | `#83838B` | `#76767D` |

La carte se distingue du fond par sa teinte : `--esp-surface-border` est `transparent`. Le champ et le focus conservent leurs contours fonctionnels.
Le motif reste posé sur la page, jamais sur la carte ; son contrat est commun.

## 4. Rôles sémantiques

Chaque cellule donne **aplat · texte sur l’aplat · encre** dans cet ordre.
Principal utilise `--primary-fill`, `--primary-fill-on`, `--primary`.
Les six autres lignes utilisent `--role-<rôle>-fill`, `-on`, `-ink` avec les rôles
`social`, `message`, `react`, `commerce`, `success` et `danger`.

| Rôle | Gestes | Clair | Sombre |
|---|---|---|---|
| Principal | Publier, Créer | `#E25F78` · `#2B0711` · `#BA3354` | `#F07A90` · `#2B0711` · `#F58DA0` |
| Relations | Suivre, se connecter | `#AA84D4` · `#1B0F28` · `#7D58A4` | `#BD97E8` · `#1B0F28` · `#BD97E8` |
| Messages | Écrire, Envoyer | `#AA84D4` · `#1B0F28` · `#7D58A4` | `#BD97E8` · `#1B0F28` · `#BD97E8` |
| Réactions | J’aime, réactions | `#E25F78` · `#2B0711` · `#D04565` | `#F58DA0` · `#2B0711` · `#F79BAC` |
| Commerce | Acheter, Participer | `#E69545` · `#2A1300` · `#9C520C` | `#F0A55C` · `#2A1300` · `#F2AE6C` |
| Validation | Accepter, Confirmer | `#2E7D4F` · `#FFFFFF` · `#22603C` | `#6FCF97` · `#062614` · `#7DD8A3` |
| Danger | Supprimer, Signaler | `#B42335` · `#FFFFFF` · `#A81F31` | `#FF8A8A` · `#2A0505` · `#FF9A9A` |

L’encre sert au texte ou à l’icône ; l’aplat sert au bloc plein avec son propre texte.
`--success` et `--destructive` suivent les encres de validation et de danger.
Annuler et Plus tard restent neutres : fond du creux, texte principal, sans filet.

## 5. Traitements doux et états

| Traitement | Jeton | Clair | Sombre |
|---|---|---|---|
| Fond tonal Écrire | `--role-message-soft` | `#F2EDF9` | `#332E3B` |
| Fond d’une réaction posée | `--role-react-soft` | `#FBE9EC` | `#3A2B2F` |
| Survol de l’identité | `--primary-fill-hover` | `#E57288` | `#F28A9D` |
| Fond d’onglet actif | `--esp-tab-active-bg` | `#FAE5E9` | `#3D2A2F` |
| Texte d’onglet actif | `--esp-tab-active-fg` | `#BA3354` | `#F58DA0` |
| Fond de la barre mobile | `--esp-mobilebar-bg` | `rgb(255 255 255 / 0.9)` | `rgb(27 27 29 / 0.9)` |
| Contour de surface | `--esp-surface-border` | `transparent` | `transparent` |

Écrire associe le fond tonal des messages à leur encre ; Envoyer utilise l’aplat
et le texte du rôle message. Une réaction posée reçoit son fond doux et son icône
à l’encre de réaction ; son libellé garde `--foreground` (`--role-react-label`).

Le survol ci-dessus concerne l’identité. Les autres survols, focus, états désactivés
et chargements restent ceux des composants du [socle commun](00_SOCLE_COMMUN.md).
La barre mobile garde son alpha de 0,9 ; elle n’est pas une nouvelle surface opaque.
Le bouton Créer reprend l’aplat d’identité et son ombre teintée :

- Clair : `0 10px 20px -8px rgb(226 95 120 / 0.55)`.
- Sombre : `0 10px 20px -8px rgb(240 122 144 / 0.45)`.

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

Le CSS du nouveau canevas donne aux cartes Corail une ombre en clair et en
sombre. Cette exception diverge du principe écrit « seul ce qui flotte a une ombre »
et de l'absence d'ombre du code actuel ; elle est consignée dans
[le registre des écarts](08_ECARTS_REFERENCE_ET_CODE.md#ombres-et-filets).

## 7. Accessibilité et écarts historiques

Le corail d’identité reçoit une encre sombre sur l’aplat : `#2B0711` en clair comme en sombre. Son encre de texte (`--primary`) est distincte du rose de réaction : ne pas substituer `--role-react-ink` à une couleur de lien.

Les seuils du contrat existant sont 4,5:1 pour les encres de texte et les textes sur
aplat, 3:1 pour les contrôles de champ et les icônes de réaction. docs/22 rapporte
des contrôles historiques ; ils n’ont pas été relancés pendant ce relevé.

| Élément | Ancienne planche, d’après docs/22 | CSS conservé | Motif documenté |
|---|---|---|---|
| Contour de champ clair | `#87878F` | `#83838B` | docs/22 rapporte 2,97:1 sur le creux pour la valeur de la planche ; le contrôle attend 3:1. |

Le champ sombre reste `#76767D`. Le filet décoratif plus discret (`#E2E2E5` / `#2C2C2F`) ne remplace pas le contour fonctionnel d’un champ.

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
