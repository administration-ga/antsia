# Design system ANTSIA — Électrique

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

Électrique associe le bleu 21st, le rose et le citron vert. Le bleu rassemble les gestes de publication et de relation ; le rose porte les réactions ; le citron vert signale participation et commerce. C’est le seul thème dont la carte et la page partagent exactement le même fond.

| Élément | Valeur |
|---|---|
| Nom français | Électrique |
| Nom anglais | Electric |
| Identifiant enregistré | `electrique` |
| Attribut racine | `data-charte="antsia-electrique"` |
| Famille de fond | Zinc — blanc pur en clair, noir zinc en sombre |
| Fichier de jetons | [antsia-electrique.css](../../packages/ui/src/themes/antsia-electrique.css) |

Le thème se combine avec l’apparence système, claire ou sombre et avec le motif choisi.
Les rayons, polices, espacements, tailles de cible et comportements suivent le
[socle commun](00_SOCLE_COMMUN.md), sans variante géométrique propre à Électrique.

## 2. Les trois couleurs signature

Le nuancier correspond à `--esp-theme-swatch-1`, `-2`, `-3`, dans cet ordre.
Il identifie le thème dans le sélecteur et l’anneau des actus ; les rôles ci-dessous
précisent les adaptations de mode et les encres utilisables.

| Couleur | Valeur signature | Gestes associés |
|---|---|---|
| Bleu 21st | `#0033FF` | Publier, Créer, suivre, se connecter, écrire |
| Rose | `#F43F5E` | Réagir |
| Citron vert | `#84CC16` | Participer, acheter |

Succès et danger restent des fonctions distinctes de ces trois signatures.
Une couleur de signature ne remplace pas un jeton sémantique dans un composant.

## 3. Surfaces et encres neutres

Valeurs résolues depuis le CSS ; le mode sombre surcharge les primitives de nuit.

| Usage | Jeton | Clair | Sombre |
|---|---|---|---|
| Fond de page | `--background` | `#FFFFFF` | `#09090B` |
| Carte | `--card` | `#FFFFFF` | `#09090B` |
| Creux : puce, champ, Annuler | `--muted` | `#F4F4F5` | `#18181B` |
| Texte principal | `--foreground` | `#09090B` | `#FAFAFA` |
| Texte secondaire | `--muted-foreground` | `#67676F` | `#A1A1AA` |
| Filet décoratif | `--border` | `#E4E4E7` | `#27272A` |
| Contour de champ | `--input` | `#8B8B94` | `#71717A` |

Une carte conserve le filet de 1 px décrit dans le socle : `--esp-surface-border` suit `--border`. Le filet distingue deux couches de même couleur.
Le motif reste posé sur la page, jamais sur la carte ; son contrat est commun.

## 4. Rôles sémantiques

Chaque cellule donne **aplat · texte sur l’aplat · encre** dans cet ordre.
Principal utilise `--primary-fill`, `--primary-fill-on`, `--primary`.
Les six autres lignes utilisent `--role-<rôle>-fill`, `-on`, `-ink` avec les rôles
`social`, `message`, `react`, `commerce`, `success` et `danger`.

| Rôle | Gestes | Clair | Sombre |
|---|---|---|---|
| Principal | Publier, Créer | `#0033FF` · `#FFFFFF` · `#0033FF` | `#4060FF` · `#FFFFFF` · `#93A8FF` |
| Relations | Suivre, se connecter | `#0033FF` · `#FFFFFF` · `#0033FF` | `#4060FF` · `#FFFFFF` · `#93A8FF` |
| Messages | Écrire, Envoyer | `#0033FF` · `#FFFFFF` · `#0033FF` | `#4060FF` · `#FFFFFF` · `#93A8FF` |
| Réactions | J’aime, réactions | `#F43F5E` · `#2A0510` · `#E11D48` | `#FB7185` · `#2A0510` · `#FB7185` |
| Commerce | Acheter, Participer | `#84CC16` · `#0E1A02` · `#4A7700` | `#84CC16` · `#0E1A02` · `#84CC16` |
| Validation | Accepter, Confirmer | `#15803D` · `#FFFFFF` · `#126E35` | `#34D399` · `#001C10` · `#34D399` |
| Danger | Supprimer, Signaler | `#DC2626` · `#FFFFFF` · `#C81E1E` | `#F87171` · `#2A0505` · `#FC9595` |

L’encre sert au texte ou à l’icône ; l’aplat sert au bloc plein avec son propre texte.
`--success` et `--destructive` suivent les encres de validation et de danger.
Annuler et Plus tard restent neutres : fond du creux, texte principal, sans filet.

## 5. Traitements doux et états

| Traitement | Jeton | Clair | Sombre |
|---|---|---|---|
| Fond tonal Écrire | `--role-message-soft` | `#D9E0FF` | `#111630` |
| Fond d’une réaction posée | `--role-react-soft` | `#FDE4E8` | `#2B181C` |
| Survol de l’identité | `--primary-fill-hover` | `#002EE6` | `#3A56E6` |
| Fond d’onglet actif | `--esp-tab-active-bg` | `#D6DEFF` | `#121732` |
| Texte d’onglet actif | `--esp-tab-active-fg` | `#0033FF` | `#93A8FF` |
| Fond de la barre mobile | `--esp-mobilebar-bg` | `rgb(255 255 255 / 0.9)` | `rgb(9 9 11 / 0.9)` |
| Contour de surface | `--esp-surface-border` | `#E4E4E7` | `#27272A` |

Écrire associe le fond tonal des messages à leur encre ; Envoyer utilise l’aplat
et le texte du rôle message. Une réaction posée reçoit son fond doux et son icône
à l’encre de réaction ; son libellé garde `--foreground` (`--role-react-label`).

Le survol ci-dessus concerne l’identité. Les autres survols, focus, états désactivés
et chargements restent ceux des composants du [socle commun](00_SOCLE_COMMUN.md).
La barre mobile garde son alpha de 0,9 ; elle n’est pas une nouvelle surface opaque.
Le bouton Créer reprend l’aplat d’identité et son ombre teintée :

- Clair : `0 10px 20px -8px rgb(0 51 255 / 0.55)`.
- Sombre : `0 10px 20px -8px rgb(64 96 255 / 0.45)`.

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

Le bleu sombre sépare l’aplat `#4060FF`, toujours accompagné de blanc `#FFFFFF`, de l’encre de texte `#93A8FF`. Le citron vert reste `#84CC16` dans les deux modes et reçoit une encre sombre `#0E1A02` sur son aplat.

Les seuils du contrat existant sont 4,5:1 pour les encres de texte et les textes sur
aplat, 3:1 pour les contrôles de champ et les icônes de réaction. docs/22 rapporte
des contrôles historiques ; ils n’ont pas été relancés pendant ce relevé.

| Élément | Ancienne planche, d’après docs/22 | CSS conservé | Motif documenté |
|---|---|---|---|
| Couleurs d’Électrique | Aucun écart spécifique listé | Valeurs CSS des tableaux ci-dessus | docs/22 ne recense aucun écart colorimétrique propre à ce thème face à l’ancienne planche ; cela ne vaut pas comparaison avec le nouveau lien. |

La carte et la page sont toutes deux `#FFFFFF` en clair et `#09090B` en sombre. Le filet de surface de 1 px (`#E4E4E7` / `#27272A`) est donc une partie obligatoire de cette variante, sans ajout d’ombre à la carte.

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
