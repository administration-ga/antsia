# ANTSIA — Socle commun des sept design systems

Relevé DOM et CSS du **20 octobre 2026**, depuis
[la référence demandée](https://claude.ai/artifact/AnLxkaqaai725ywzkrVk6b#page-c71058556eba).
[Index du dossier](README.md) · [Écarts avec le code](08_ECARTS_REFERENCE_ET_CODE.md).

## 1. Sources et niveaux de preuve

Les huit rubriques et leurs 60 planches ont été parcourues. Les mesures
ci-dessous proviennent des styles rendus, notamment ceux de `Fil.dc.html`.
La planche `Main.dc.html` énonce aussi les principes communs. Certaines de ses
règles écrites et certains détails CSS divergent ; le registre des écarts les
conserve explicitement.

La présente documentation décrit la référence et son raccord au code actuel.
Elle ne certifie ni le rendu de l'application ni toutes les interactions.
L'inventaire écran par écran se trouve dans les [huit fiches de pages](README.md#les-huit-rubriques-du-canevas).

## 2. Principes énoncés par la planche

- Trois couleurs de signature par thème, affectées à des familles d'actions.
- Fonds neutres ; carte distinguée par le ton ou un filet si les couleurs sont égales.
- Rayon du média inférieur à celui de la carte qui l'accueille.
- Rythme de quatre : `4 / 8 / 12 / 16 / 24 / 32px`.
- Motifs facultatifs, réservés au fond de page ; Aucun par défaut.
- Statuts compréhensibles avec du texte et des icônes, pas seulement une couleur.
- Personne en rond, page en carré arrondi ; les badges sont fournis par le service.

Le texte de la planche annonce des cibles tactiles de `44px` et réserve les
ombres à la barre et au bouton flottants. Les écarts CSS sont exposés au §8.

## 3. Palettes et rôles

Les sept thèmes sont **Gaboma, Soleil, Forêt, Corail, Lagon, Électrique et Sable**.
Les sept surfaces et les sept triplets de rôle × deux modes × sept thèmes
donnent 392 valeurs, vérifiées identiques aux CSS actuels.

| Rôle | Jetons du canevas | Contrat applicatif correspondant |
|---|---|---|
| Page | `--bg` | `--background` |
| Carte | `--card` | `--card` |
| Creux | `--sunken` | `--muted` |
| Texte | `--text` | `--foreground` |
| Secondaire | `--muted` | `--muted-foreground` |
| Filet décoratif | `--rule` | `--border` |
| Contour de champ | `--field-line` | `--input` |
| Principal | `--primary-{fill,on,ink}` | `--primary-fill`, `--primary-fill-on`, `--primary` |
| Relation | `--social-{fill,on,ink}` | `--role-social-{fill,on,ink}` |
| Message | `--message-{fill,on,ink}` | `--role-message-{fill,on,ink}` |
| Réaction | `--react-{fill,on,ink}` | `--role-react-{fill,on,ink}` |
| Commerce | `--commerce-{fill,on,ink}` | `--role-commerce-{fill,on,ink}` |
| Validation | `--success-{fill,on,ink}` | `--role-success-{fill,on,ink}` |
| Danger | `--danger-{fill,on,ink}` | `--role-danger-{fill,on,ink}` |

L'encre sert au texte ; un bloc plein utilise son aplat et son texte associé.
Écrire est tonal ; Envoyer peut employer le couple plein des messages.
Annuler et Plus tard utilisent le creux et le texte principal.

Les fonds doux du canevas sont calculés en sRGB à partir de la carte :
principal, relation et message à `15%` de leur aplat ; réaction et commerce à
`18%` ; validation à `14%` ; danger à `12%`. Le reste du mélange est la carte.
Les tables de traitements des fiches décrivent les valeurs figées du code ;
les proportions du canevas ne doivent pas être confondues avec ces constantes.

## 4. Typographie mesurée dans les styles

| Élément du canevas | Police et mesure |
|---|---|
| Corps `.ant`, texte de publication `.post-t` | Inter, `15px / 1.5` |
| Titre `.h1` | Familjen Grotesk, `26px / 1.1`, graisse `700`, approche `-0.015em` |
| Sous-titre `.h2` | Familjen Grotesk, `20px / 1.2`, graisse `700`, approche `-0.01em` |
| Titre `.h3` | `16px / 1.3`, graisse `700` |
| Métadonnées de publication | `12.5px`, encre secondaire, ellipse si nécessaire |
| Champ | Inter, `16px / 1.4` |
| Bouton normal `.b` | Inter, `14px / 1`, graisse `600` |
| Petit bouton `.b-sm` | `13px` |
| Grand bouton `.b-lg` | `15px` |

L'application actuelle définit un corps de **16px** et des polices embarquées.
Cette différence est documentée, pas modifiée dans cette étape.
Ne pas reprendre les polices distantes ou les scripts de l'éditeur de maquette.

## 5. Géométrie et composants de base

| Élément | Rayon du canevas | Contrat du dépôt |
|---|---|---|
| Badge | `6px` | `--ui2-badge-radius` |
| Puce | `10px` | `--esp-chip-radius` |
| Avatar de page | `12px` | `--esp-avatar-page-radius` |
| Champ | `14px` | `--esp-field-radius` |
| Média | `16px` | `--esp-media-radius` |
| Créer | `18px` | `--esp-fab-radius` |
| Carte | `24px` | `--ui2-card-radius`, `--rp-surface-radius` |
| Barre basse | `28px` | `--esp-mobilebar-radius` |
| Bouton | `999px`, pilule | `--ui2-button-radius` |

La carte standard a `16px` de rembourrage ; les variantes dessinées en ont
`20px` ou `24px`. Le filet d'Électrique vaut `1px`.
Les avatars du canevas existent en `24 / 32 / 40 / 48 / 64 / 104px` ; l'avatar
de page de `104px` prend un rayon de `24px`.

Les champs ont une hauteur minimale de `44px`, un rembourrage horizontal de
`12px`, un trait de `1px` et un anneau actif de `2px`. Une zone de texte a
une hauteur minimale de `104px`. L'état erreur prend l'encre danger.

Le CSS de bouton dessine des minimums `32 / 40 / 48px` pour petit / normal /
grand. Le texte de la planche exige `44px` au téléphone et le dépôt maintient
ce plancher : cette contradiction est signalée, sans diminuer les cibles.

## 6. Grilles et navigation responsive

| Format dessiné | Mesure | Composition |
|---|---|---|
| Mobile | `390 × 844` | En-tête, contenu principal, barre basse cinq destinations |
| Tablette | `834 × 1194` | Contenu centré, barre basse plus large ; variantes de page |
| Bureau | `1440 × 1024` | Barre supérieure, rail, contenu, panneaux contextuels |

Ces trois vues fixes sont dessinées dans chacune des 56 planches fonctionnelles.
Elles ne définissent pas à elles seules les points de rupture de production.
La coque applicative actuelle utilise son seuil de `960px`.

Mesures de l'espace membre dans la référence :

- Bureau : grille `248px minmax(0, 1fr) 312px`, gouttière `24px`, largeur
  maximale `1400px`, rembourrage horizontal `20px`.
- Variante large : deux colonnes `248px minmax(0, 1fr)` ; variantes solo et
  plein écran pour les parcours qui le demandent.
- Mobile : contenu avec `4px 12px 120px` de rembourrage.
- Tablette : contenu maximal `728px`, rembourrage `8px 24px 140px` ; variante
  large maximale `834px` avec rembourrage horizontal `28px`.
- iCom bureau : liste / conversation en `minmax(300px, 35%) minmax(0, 1fr)`.

La barre basse affiche **Fil, Découvrir, Créer, Messages, Profil**. Mobile :
bords `12px`, bas `16px`. Tablette : largeur `540px`, centrée, bas `26px`.
Son fond est un mélange de carte à `88%`, flou de `16px`. Le bouton Créer du
CSS est un carré de `52px`, rayon `18px`.

Les arrondis `44 / 32 / 14px` du cadre externe mobile / tablette / bureau
appartiennent à la présentation des appareils dans le canevas. Ce ne sont pas
des rayons à appliquer au document de l'application.

## 7. Catalogue partagé et états dessinés

| Composant | Structure et variantes |
|---|---|
| Action | Principal, social, message tonal ou plein, réaction, commerce, succès, danger, neutre, fantôme |
| Suggestion | Avatar, nom et titre, Suivre / Écrire de même largeur |
| Publication | Auteur, badge, contexte, texte, média intérieur, réactions, commentaires, partage, enregistrement |
| Actus | Médaillons en anneau, ajout personnel, lecteur plein écran |
| Évènement | Dates, lieu, organisateur, compteurs et participation distincts |
| Formulaire | Libellé, aide, contrôle, consentement explicite, action et erreur |
| Dialogue / panneau | Titre, fermeture, contenu, actions ; composition et commentaires notamment |
| Liste privée | Pagination, date d'état, action de détail ; aucune conclusion d'absence sur une seule page vide |
| Communication | Conversations, messages, appel, direct et conférence ; surface persistante |
| Préférences | Apparence, thème, motif ; langue et fuseau sauvegardés séparément |

La référence montre des champs au repos / actifs, des erreurs, sélections,
brouillons, invitations, contenus suivis, consentements actifs / révocables et
états de parcours. Les fiches de pages précisent les états réellement relevés.
Focus, clavier, chargement, échecs réseau et données longues restent à éprouver
dans l'application, même lorsqu'un état visuel est dessiné.

## 8. Profondeur et motifs : valeurs de la référence

Le texte du système réserve l'ombre à ce qui flotte. Les styles ajoutent pourtant
une ombre à certaines cartes Soleil et Corail ; leurs valeurs figurent dans
[le registre des écarts](08_ECARTS_REFERENCE_ET_CODE.md#ombres-et-filets).

L'ombre flottante claire est `0 14px 30px -12px rgb(0 0 0 / .25), 0 2px 6px rgb(0 0 0 / .06)`.
En sombre : `0 14px 30px -10px rgb(0 0 0 / .8), 0 2px 6px rgb(0 0 0 / .45)`.
Créer utilise `0 10px 20px -8px` avec l'aplat principal à `75%`.

| Motif | Dessin du canevas |
|---|---|
| Aucun | Fond uni |
| Points | Point de `1px`, transparent à `1.5px`, pas `16px` |
| Quadrillage | Traits de `1px`, pas `24px` |
| Grain | Trois trames radiales de `5 / 7 / 11px`, points de `.7 / .6 / .5px` |
| Projecteur | Halo `85% 55%` depuis `50% 0%`, transparent à `72%` |

Encre Points / Quadrillage : `12%` noire en clair, `10%` blanche en sombre.
Grain : `7%` / `5%`. Projecteur : `7%` / `12%`.
Le dépôt utilise un grain SVG et un autre halo ; voir les différences.

## 9. Raccordement et règles produit à préserver

L'application conserve son contrat de jetons dans
[charte.css](../../packages/ui/src/styles/charte.css), ses
[primitives](../../packages/ui/src/components/button.tsx), sa
[coque](../../packages/social-features/src/shell/ReseauAgentPage.tsx) et ses
[routes](../../apps/antsia_ga/src/lib/routes.ts). Les adaptations restent dans
les vrais composants et n'écrasent pas les chartes des autres réseaux.

- Gaboma par défaut ; apparence Système par défaut ; motif Aucun par défaut.
- Thème sur le compte connecté ; apparence et motif sur l'appareil.
- Les portails suivent le thème et le mode ; éviter l'éclair d'une autre charte.
- UI via i18n français / anglais ; dates, nombres et fuseaux localisés.
- Noms de famille en MAJUSCULES, prénoms en casse initiale, signes conservés.
- Badges, droits, audiences, états de commande et consentements restent des
  faits du service. Une couleur ou un dessin ne leur donne pas autorité.
- Aucun compte, prix, stock, compteur ou statut d'exemple n'est une donnée réelle.
- Les exigences de clavier, cible tactile, contraste et mouvement réduit
  accompagnent l'implémentation ; aucune nouvelle conformité AA n'est revendiquée ici.
