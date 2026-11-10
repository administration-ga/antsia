# Design system ANTSIA — Sable

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

Sable porte dans ANTSIA les couleurs du thème Sable de DIASPORALE : bleu Gabon, sarcelle et sable doré. Le papier presque blanc et les cartes sable reçoivent une encre brune. Les polices et la géométrie restent celles du système commun d’ANTSIA.

| Élément | Valeur |
|---|---|
| Nom français | Sable |
| Nom anglais | Sand |
| Identifiant enregistré | `sable` |
| Attribut racine | `data-charte="antsia-sable"` |
| Famille de fond | Sable — papier et sable en clair, nuit brune en sombre |
| Fichier de jetons | [antsia-sable.css](../../packages/ui/src/themes/antsia-sable.css) |

Le thème se combine avec l’apparence système, claire ou sombre et avec le motif choisi.
Les rayons, polices, espacements, tailles de cible et comportements suivent le
[socle commun](00_SOCLE_COMMUN.md), sans variante géométrique propre à Sable.

## 2. Les trois couleurs signature

Le nuancier correspond à `--esp-theme-swatch-1`, `-2`, `-3`, dans cet ordre.
Il identifie le thème dans le sélecteur et l’anneau des actus ; les rôles ci-dessous
précisent les adaptations de mode et les encres utilisables.

| Couleur | Valeur signature | Gestes associés |
|---|---|---|
| Sarcelle | `#238090` | Suivre, se connecter |
| Sable doré | `#D7AD63` | Réagir, participer, acheter |
| Bleu Gabon | `#0167A8` | Publier, Créer, écrire |

Succès et danger restent des fonctions distinctes de ces trois signatures.
Une couleur de signature ne remplace pas un jeton sémantique dans un composant.

## 3. Surfaces et encres neutres

Valeurs résolues depuis le CSS ; le mode sombre surcharge les primitives de nuit.

| Usage | Jeton | Clair | Sombre |
|---|---|---|---|
| Fond de page | `--background` | `#FDFDFB` | `#151311` |
| Carte | `--card` | `#F1EFEB` | `#24221F` |
| Creux : puce, champ, Annuler | `--muted` | `#E7E4DE` | `#302E2A` |
| Texte principal | `--foreground` | `#25211E` | `#E7E4DE` |
| Texte secondaire | `--muted-foreground` | `#595550` | `#B8B4AC` |
| Filet décoratif | `--border` | `#DDDAD4` | `#3C3935` |
| Contour de champ | `--input` | `#84817B` | `#7C7872` |

La carte se distingue du fond par sa teinte : `--esp-surface-border` est `transparent`. Le champ et le focus conservent leurs contours fonctionnels.
Le motif reste posé sur la page, jamais sur la carte ; son contrat est commun.

## 4. Rôles sémantiques

Chaque cellule donne **aplat · texte sur l’aplat · encre** dans cet ordre.
Principal utilise `--primary-fill`, `--primary-fill-on`, `--primary`.
Les six autres lignes utilisent `--role-<rôle>-fill`, `-on`, `-ink` avec les rôles
`social`, `message`, `react`, `commerce`, `success` et `danger`.

| Rôle | Gestes | Clair | Sombre |
|---|---|---|---|
| Principal | Publier, Créer | `#0167A8` · `#FFFFFF` · `#01609C` | `#5BA5E5` · `#151311` · `#7EC2FF` |
| Relations | Suivre, se connecter | `#238090` · `#FFFFFF` · `#1B6874` | `#4FB3C2` · `#151311` · `#6CC6D3` |
| Messages | Écrire, Envoyer | `#0167A8` · `#FFFFFF` · `#01619E` | `#5BA5E5` · `#151311` · `#7EC2FF` |
| Réactions | J’aime, réactions | `#D7AD63` · `#25211E` · `#A1782D` | `#D7AD63` · `#151311` · `#D7AD63` |
| Commerce | Acheter, Participer | `#D7AD63` · `#25211E` · `#7A5A22` | `#D7AD63` · `#151311` · `#D7AD63` |
| Validation | Accepter, Confirmer | `#14743A` · `#FFFFFF` · `#0F5F2F` | `#6EBE85` · `#151311` · `#6EBE85` |
| Danger | Supprimer, Signaler | `#B3261E` · `#FFFFFF` · `#B3261E` | `#E18C85` · `#151311` · `#E18C85` |

L’encre sert au texte ou à l’icône ; l’aplat sert au bloc plein avec son propre texte.
`--success` et `--destructive` suivent les encres de validation et de danger.
Annuler et Plus tard restent neutres : fond du creux, texte principal, sans filet.

## 5. Traitements doux et états

| Traitement | Jeton | Clair | Sombre |
|---|---|---|---|
| Fond tonal Écrire | `--role-message-soft` | `#CDDBE1` | `#2C363D` |
| Fond d’une réaction posée | `--role-react-soft` | `#EDE6D8` | `#3D3529` |
| Survol de l’identité | `--primary-fill-hover` | `#015D97` | `#6FB0E8` |
| Fond d’onglet actif | `--esp-tab-active-bg` | `#CBD9E0` | `#2D373F` |
| Texte d’onglet actif | `--esp-tab-active-fg` | `#01609C` | `#7EC2FF` |
| Fond de la barre mobile | `--esp-mobilebar-bg` | `rgb(241 239 235 / 0.9)` | `rgb(36 34 31 / 0.9)` |
| Contour de surface | `--esp-surface-border` | `transparent` | `transparent` |

Écrire associe le fond tonal des messages à leur encre ; Envoyer utilise l’aplat
et le texte du rôle message. Une réaction posée reçoit son fond doux et son icône
à l’encre de réaction ; son libellé garde `--foreground` (`--role-react-label`).

Le survol ci-dessus concerne l’identité. Les autres survols, focus, états désactivés
et chargements restent ceux des composants du [socle commun](00_SOCLE_COMMUN.md).
La barre mobile garde son alpha de 0,9 ; elle n’est pas une nouvelle surface opaque.
Le bouton Créer reprend l’aplat d’identité et son ombre teintée :

- Clair : `0 10px 20px -8px rgb(1 103 168 / 0.55)`.
- Sombre : `0 10px 20px -8px rgb(91 165 229 / 0.45)`.

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

Le bleu des messages en clair utilise l’encre `#01619E`, distincte de l’encre d’identité `#01609C`. Le bouton secondaire générique garde `--ui2-button-secondary-fg: #01609C` en clair ; cette nuance ne remplace pas automatiquement le rôle message.

Les seuils du contrat existant sont 4,5:1 pour les encres de texte et les textes sur
aplat, 3:1 pour les contrôles de champ et les icônes de réaction. docs/22 rapporte
des contrôles historiques ; ils n’ont pas été relancés pendant ce relevé.

| Élément | Ancienne planche, d’après docs/22 | CSS conservé | Motif documenté |
|---|---|---|---|
| Badge de danger sombre (`--danger-600`) | `#E18C85` | `#F39D95` | docs/22 et le commentaire CSS rapportent 4,4:1 pour l’ancienne encre sur `--danger-50` (`#4A3733`). |

`#E18C85` reste l’aplat et l’encre du rôle danger sombre, ainsi que `--danger-500`. `#F39D95` est réservé au jeton `--danger-600` utilisé pour ce badge et le survol du danger ; ne pas remplacer globalement les erreurs par la couleur du badge.

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
