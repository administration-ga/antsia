# Thèmes et options d'affichage d'ANTSIA

> Référence des **sept thèmes** que le membre choisit dans antsia.ga et des **options d'affichage**
> qui les accompagnent. État au 19/10/2026, d'après le code livré.
>
> - Source de vérité : les fichiers `packages/ui/src/themes/antsia*.css` ; toutes les couleurs de ce
>   document en sont extraites automatiquement. Contrastes vérifiés par
>   `packages/ui/src/themes/antsia-themes.test.ts` (niveau AA).
> - Décisions : [ADR-0027](adr/0027-six-themes-trois-couleurs-et-systeme-epure.md) (thèmes, système
>   épuré, motifs) ; [ADR-0028](adr/0028-ecran-des-chartes-a-la-lettre.md) (composants de l'écran des
>   chartes : publication, actions, cartes du fil, en-tête du téléphone) ;
>   [ADR-0030](adr/0030-bureau-au-systeme-des-chartes-et-theme-au-rail.md) (chrome du bureau, thème
>   au rail) ; ADR-0026 (thème du compte, apparence posée avant l'affichage).
> - Maquettes : artifact privé « Chartes ANTSIA », version 7
>   (<https://claude.ai/artifact/Arc4fsUDikm3DRHuZNr35u>). Depuis le 19/10/2026 au soir, le code
>   reprend ses valeurs EXACTES partout où le contrôle AA les accepte : 385 couleurs sur 392 ; les
>   sept autres sont listées dans « Écarts retenus » ci-dessous.

## En bref

- **Sept thèmes** : Gaboma (par défaut), Soleil, Forêt, Corail, Lagon, Électrique et Sable.
- **Trois couleurs vives par thème**, une par famille d'actions : publier ; suivre et écrire ;
  réagir et participer. Valider (vert) et Supprimer (rouge) restent hors de ces trois couleurs,
  chacun avec son aplat, son texte sur l'aplat et son encre ; Annuler est un bouton gris.
- **Chaque thème a son fond**, neutre, en clair et en sombre : le membre choisit le thème, pas le fond.
- **Trois options d'affichage** : l'apparence (système, clair, sombre), le thème et le motif de fond.

## Les options d'affichage

Réglées dans **Paramètres > Affichage** (route `/parametres`, atteignable depuis le rail et le
Profil) et reprises dans « Mes données », qui reste ouverte à une personne suspendue. Les trois
choix sont immédiats, sans bouton d'enregistrement.

| Option | Valeurs | Par défaut | Où le choix est gardé |
|---|---|---|---|
| **Apparence** | Système, Clair, Sombre | Système | Sur l'appareil, pour ce réseau (préfixe `antsia:antsia:`), partagé entre onglets |
| **Thème** | Les sept thèmes ci-dessous (Paramètres > Affichage, et le rail du fil au bureau) | Gaboma | Sur le **compte** pour un membre connecté (`persons.theme`) : il le retrouve sur ses autres appareils ; sur l'appareil sinon |
| **Motif de fond** | Aucun, Points, Quadrillage, Grain, Projecteur | Aucun (fond uni) | Sur l'appareil, comme le mode sombre |

### Apparence

- **Système** suit le réglage clair ou sombre de l'appareil ; **Clair** et **Sombre** l'imposent.
- Le **bouton rond clair/sombre** de l'en-tête (lune en clair, soleil en sombre) bascule en un
  appui entre clair et sombre et pose un choix explicite ; « Système » reste offert dans les
  préférences.
- Le script d'amorçage pose la classe `.dark`, le thème et le motif sur `<html>` **avant
  l'affichage** : aucun éclair de la mauvaise apparence au chargement.

### Thème

- Posé par `data-charte` sur `<html>` : `antsia` pour Gaboma, `antsia-<thème>` pour les autres.
- Le sélecteur montre, pour chaque thème, son nom, sa phrase et ses trois couleurs (le nuancier
  `--esp-theme-swatch-1…3`, repris par l'anneau « à voir » des actus).
- Anciens identifiants **retirés le 19/10/2026** : `antsia`, `atlantique`, `indigo`,
  `hibiscus`, `encre`, `mandarine`. Ils restent acceptés en base (validation du schéma) mais
  ne sont plus proposés ni écrits, et **se lisent comme Gaboma**.

### Motif de fond

Désactivé par défaut. Posé par `data-motif` sur `<html>` et peint **sur le fond de la page
seulement, jamais sur les cartes** (`packages/ui/src/styles/communication.css`). Encre du motif :
noir à 12 % en clair, blanc à 10 % en sombre.

| Motif | Dessin |
|---|---|
| Aucun | Fond uni (défaut) |
| Points | Trame de points de 1 px, pas de 16 px |
| Quadrillage | Filets de 1 px, pas de 24 px |
| Grain | Bruit fin (180 px), un peu plus léger en sombre |
| Projecteur | Halo radial venu du haut de l'écran |

## Le système commun aux sept thèmes

Identique dans tous les thèmes ; seules les couleurs changent.

**Couleurs par fonction.** Chaque thème déclare un aplat, un texte posé sur l'aplat et une encre
lisible en texte pour chaque fonction : Principal (`--primary-fill`, `--primary-fill-on`,
`--primary`), Relations, Messages, Réactions et Commerce (`--role-<fonction>-fill`, `-on`,
`-ink`), Validation et Danger (`--role-success-*` et `--role-danger-*` : Valider, Décrocher,
Reprendre ; Supprimer, Raccrocher, Refuser, pastille « En direct »). Le succès (`--success`) et
le danger (`--destructive`) se lisent en ENCRE (texte de confirmation, message d'erreur),
distincte de leur aplat (`--success-fill`, `--danger-fill`). Écrire est un bouton **tonal**
(`--role-message-soft`), l'action réagie a son fond doux (`--role-react-soft`).

**Aplat d'identité et son texte.** Publier, Créer, l'interrupteur, la case cochée, les bulles de
mes messages, les puces de portée du fil, le bouton principal et la page courante d'une
pagination du kit, « Nouvelles publications » du fil en immersion, « Appeler » du lanceur
d'appel : aplat `--primary-fill` (`--esp-identity-fill` aux sites qui peignaient l'encre) et
son texte `--primary-fill-on`, foncé sur une identité claire (mandarine, rose corail,
turquoise). Jusqu'au 19/10/2026, une douzaine de ces sites portaient le texte commun
`--on-fill`, blanc en clair : 1,9:1 sur le turquoise de Lagon, 2,6:1 sur la mandarine de
Soleil. `antsia-themes.test.ts` refuse désormais ce couple. Les états actifs (onglet courant,
ligne choisie) sont en pastille tonale (`--esp-tab-active-*`), jamais en encre pleine.

**Angles : un par élément.**

| Élément | Angle | Jeton |
|---|---|---|
| Badge | 6 px | `--ui2-badge-radius` |
| Puce, filtre | 10 px | `--esp-chip-radius` |
| Avatar de page | 12 px | `--esp-avatar-page-radius` |
| Champ | 14 px | `--esp-field-radius` |
| Photo, média dans une carte | 16 px | `--esp-media-radius` |
| Bouton Créer | 18 px | `--esp-fab-radius` |
| Carte | 24 px | `--ui2-card-radius`, `--rp-surface-radius` |
| Barre d'onglets | 28 px | `--esp-mobilebar-radius` |
| Bouton d'action | pilule | `--ui2-button-radius` |
| Personne, icône de l'en-tête | rond | — |

**Contours : seulement à couleur égale.** Un élément n'a de contour que s'il a la couleur de la
couche sous lui. Les cartes se distinguent du fond par leur ton, sans trait — sauf dans
**Électrique**, où carte et fond sont du même blanc (ou du même noir) : un filet de 1 px. Les
boutons colorés et gris n'en ont jamais. Seuls l'anneau de focus et le champ actif font exception.

**Profondeur.** Seuls la barre d'onglets (flottante, translucide) et le bouton Créer portent une
ombre ; celle du bouton prend sa couleur. Les ombres sont teintées de l'encre du thème.

**Espaces et typographie.** Échelle de 4 (16 px dans une carte, 12 px entre deux cartes, 24 px
entre deux blocs). Au téléphone, boutons, puces et ronds de l'en-tête ont des cibles de 44 px
(les chartes dessinent 40 et 32 px) : choix d'accessibilité gardé par le propriétaire le
19/10/2026. Titres en Familjen Grotesk, texte en Inter, corps de 16 px ; les deux polices sont
embarquées (`@fontsource-variable`, importées par `packages/ui/src/styles.css`) : jusqu'au
19/10/2026, Inter n'était qu'un nom sans fichier et le texte s'affichait dans la police du système.

**Retours visuels.** Succès et danger s'affichent toujours avec une icône et un texte, jamais la
couleur seule. Les toasts (sonner) suivent les jetons du thème
(`apps/antsia_ga/src/app/globals.css`).

## Les composants de l'écran des chartes (ADR-0028)

Depuis le 19/10/2026 au soir, antsia.ga déclare `postPresentation="charte"` : le fil reprend
**à la lettre** l'écran du téléphone des chartes, dans les sept thèmes.

| Composant | Rendu | Couleurs et angles |
|---|---|---|
| En-tête du téléphone | Marque ANTSIA et son point, puis recherche, cloche, messages | Ronds `--esp-header-icon-*` (cible 44 px) ; pastilles `--role-react-*` cerclées du fond ; aucun filet |
| Actus | Médaillons dans leur anneau, « Vous » et son « + » en tête, juste sous l'en-tête | Anneau `--esp-theme-swatch-*` |
| Carte de suggestion | Une personne, `@identifiant · titre`, « Suivre » et « Écrire » de même largeur | Suivre `--role-social-fill` ; Écrire tonal `--role-message-soft` / `-ink` ; carte 24 px |
| Publication | Auteur (coche Vérifié, étiquettes Officiel et Agent public), texte, média posé dans la carte, rangée d'icônes | Média `--esp-media-radius` (16 px) ; coche `--role-social-ink` ; Officiel en encre pleine |
| Rangée d'actions | Cœur, commentaire, partage avec leurs décomptes ; Enregistrer à droite | Cœur plein `--role-react-ink` une fois posé ; décomptes en encre atténuée |
| Évènement annoncé | Titre et dates en une phrase ; Participer et Plus tard pour un invité | Participer `--role-commerce-fill` ; Plus tard gris (`outline`) |

Le fil du téléphone s'ouvre **en liste** (l'Immersion reste offerte) et la publication passe par le
bouton « + » de la barre. Retour arrière : `postPresentation="media"` dans `network-shell.tsx`.

## Le bureau au même système (ADR-0030)

Depuis le 20/10/2026, le chrome du bureau d'antsia.ga reprend le système des chartes, par les
jetons de l'ADR-0027 et leurs replis d'origine (DIASPORALE et la console inchangées) :

| Élément du bureau | Rendu | Jetons |
|---|---|---|
| Marque de la barre du haut | Familjen Grotesk, 22 px, encre du texte, point à l'aplat d'identité | `--font-display`, `--primary-fill` |
| Icônes de l'en-tête (clair/sombre, cloche, identité) | Ronds gris, sans filet | `--esp-header-icon-bg`, `--esp-header-icon-radius` |
| Se déconnecter | Bouton neutre gris (pilule sans filet) | `--ui2-button-outline-*`, `--ui2-button-radius` |
| Recherche du fil | Champ à 14 px, contour de contrôle à 3:1 | `--esp-field-radius`, `--input` |
| Recherche d'iCom, sélecteurs du rail | Champ à 14 px | `--esp-field-radius` |
| Sélecteur de portée « Pour vous » | Puce : 10 px, gris du creux, sans filet | `--esp-chip-radius`, `--esp-chip-bg`, `--esp-chip-border` |
| « Voir mon profil » | Action en texte, soulignée | `--esp-inline-link-decoration` |
| Rail, sous « Apparence » | Sélecteur **Thème** : les sept thèmes, sous leurs noms | `AppearanceProvider themeName`, `useThemeChoice` |

Le sélecteur du rail enregistre le thème sur le compte en session (même contexte que
Préférences > Thème, `useThemeChoice`, désormais dans le moteur) et sur l'appareil sinon.

**Recette.** Le rendu se vérifie dans l'application réelle, pas dans un banc : backend local
anonyme (`CONVEX_AGENT_MODE=anonymous bun run dev:convex`, variables et graine du README),
`bun run dev:antsia` avec `NEXT_PUBLIC_CONVEX_URL` et `CONVEX_SITE_URL` exportés quand le
dossier du moteur ne s'appelle pas `ANTSIA`, connexion par un compte de démonstration, une
publication avec photo, puis une capture par thème et par mode en posant
`antsia:antsia:theme` et `antsia:antsia:appearance` dans `localStorage` avant de recharger
(Playwright, 1 440 × 900 et 390 × 844). Le 20/10/2026 : 28 captures, sept thèmes × clair et
sombre × bureau et téléphone, conformes aux planches de la maquette.

## Écarts retenus par rapport aux chartes

Mesurés dans l'application le 19/10/2026 (couleurs calculées sur la page, 7 thèmes × clair et
sombre, 392 valeurs) : 385 sont exactement celles des chartes. Les sept autres sont refusées
par le contrôle AA d'`antsia-themes.test.ts` et gardent la valeur du code :

| Thème | Couleur | Chartes | Code | Raison |
|---|---|---|---|---|
| Forêt | encre d'identité (clair) | `#307944` | `#2D7240` | 4,28:1 sur le creux, 4,5 exigé |
| Lagon | encre d'identité, des relations et des messages (clair) | `#0E7570` | `#0D6F6A` | 4,27:1 sur le creux |
| Gaboma | contour de champ (clair) | `#8A8A8A` | `#878787` | 2,98:1 sur le creux, 3 exigé |
| Corail | contour de champ (clair) | `#87878F` | `#83838B` | 2,97:1 sur le creux |
| Lagon | contour de champ (clair) | `#88857D` | `#817F77` | 2,85:1 sur le creux |

Hors des couleurs mesurées, le badge de danger de Sable en sombre (`--danger-600` sur
`--danger-50`) garde `#F39D95` : l'encre des chartes (`#E18C85`) n'y tient que 4,4:1 ; elle reste
celle des messages d'erreur. Gardés aussi par décision du propriétaire (19/10/2026) : les cibles
de 44 px, le contour des champs (WCAG 1.4.11) et le motif de fond commun aux sept thèmes (les
chartes donnaient à chaque fond sa propre texture).

## Vue d'ensemble des sept thèmes

Dans l'ordre du sélecteur de l'application (les maquettes numérotent Gaboma 6 et Sable 7).

| N° | Thème | Les trois couleurs | Fond (clair · sombre) | Identifiant |
|---|---|---|---|---|
| 1 | **Gaboma** (défaut) | Vert `#007E4D`, Safran `#F4BB44`, Bleu `#2F67B5` | Onyx — blanc franc · noir absolu | `gaboma` |
| 2 | **Soleil** | Mandarine `#EC8B34`, Azur `#3F9FE8`, Coquelicot `#F1453B` | Craie — craie · charbon | `soleil` |
| 3 | **Forêt** | Vert forêt `#317A45`, Olive `#646E40`, Miel `#C98A2B` | Lin — beige lin · noir chaud | `foret` |
| 4 | **Corail** | Rose corail `#E25F78`, Mandarine `#E69545`, Lilas `#AA84D4` | Perle — gris perle · graphite | `corail` |
| 5 | **Lagon** | Turquoise `#4ECDC4`, Bittersweet `#FF6B6B`, Jaune de Naples `#FFE66D` | Greige — greige · anthracite | `lagon` |
| 6 | **Électrique** | Bleu 21st `#0033FF`, Rose `#F43F5E`, Citron vert `#84CC16` | Zinc — blanc pur · noir zinc | `electrique` |
| 7 | **Sable** | Sarcelle `#238090`, Sable `#D7AD63`, Bleu Gabon `#0167A8` | Sable — papier et sable · nuit brune | `sable` |

## Fiche de chaque thème

### 1. Gaboma — thème par défaut

Le thème du réseau et le **choix par défaut** (l'ancien « Tricolore » des maquettes). Les trois couleurs du drapeau dans leur ordre : le vert de la forêt, le jaune de l'équateur en safran, le bleu de la mer. Fond blanc franc, noir absolu en sombre (le meilleur rendu sur écran OLED).

- Nom affiché : **Gaboma** (anglais : Gaboma) — « Vert, jaune et bleu du drapeau. Le thème du réseau. »
- Identifiant enregistré : `gaboma` · charte : `data-charte="antsia"` · fichier : `packages/ui/src/themes/antsia.css`
- Fond : **Onyx** (blanc franc · noir absolu)

**Les trois couleurs et leurs gestes**

- **Vert** `#007E4D` : suivre
- **Safran** `#F4BB44` : réagir, participer et acheter
- **Bleu** `#2F67B5` : publier et écrire

**Fonds**

| Surface | Clair | Sombre |
|---|---|---|
| Fond de page | `#FFFFFF` | `#000000` |
| Carte | `#F7F7F7` | `#141414` |
| Creux (puce, champ, bouton Annuler) | `#EEEEEE` | `#1E1E1E` |
| Texte | `#0A0A0A` | `#F5F5F5` |
| Texte secondaire | `#616161` | `#A1A1A1` |
| Filet décoratif | `#E6E6E6` | `#262626` |
| Contour de champ | `#878787` | `#707070` |

**Couleur de chaque fonction** (aplat · texte sur l'aplat · encre en texte)

| Fonction | Gestes | Clair | Sombre |
|---|---|---|---|
| Principal | Publier, Créer | `#2F67B5` · `#FFFFFF` · `#2A5FA8` | `#6FA2F0` · `#06142E` · `#86B2F4` |
| Relations | Suivre, se connecter | `#007E4D` · `#FFFFFF` · `#006B42` | `#2FCB86` · `#03210F` · `#4AD898` |
| Messages | Écrire | `#2F67B5` · `#FFFFFF` · `#2A5FA8` | `#6FA2F0` · `#06142E` · `#9DC0F6` |
| Réactions | J'aime, réactions | `#F4BB44` · `#1F1400` · `#AF7F00` | `#F4BB44` · `#1F1400` · `#F4BB44` |
| Commerce | Acheter, Participer | `#F4BB44` · `#1F1400` · `#8A6400` | `#F4BB44` · `#1F1400` · `#F4BB44` |
| Validation | Accepter, Confirmer | `#00804E` · `#FFFFFF` · `#006B42` | `#2FCB86` · `#03210F` · `#4AD898` |
| Danger | Supprimer, Signaler | `#C8102E` · `#FFFFFF` · `#B50E29` | `#FF6B7A` · `#2A0509` · `#FF8592` |
| Neutre | Annuler, Plus tard | gris du creux, sans contour | gris du creux, sans contour |

### 2. Soleil

La mandarine, l'azur d'un ciel d'été (à l'opposé de la mandarine sur le cercle chromatique) et un rouge coquelicot réservé aux cœurs. Fond craie, charbon en sombre.

- Nom affiché : **Soleil** (anglais : Sun) — « Mandarine, azur et coquelicot. »
- Identifiant enregistré : `soleil` · charte : `data-charte="antsia-soleil"` · fichier : `packages/ui/src/themes/antsia-soleil.css`
- Fond : **Craie** (craie · charbon)

**Les trois couleurs et leurs gestes**

- **Mandarine** `#EC8B34` : publier, participer et acheter
- **Azur** `#3F9FE8` : suivre et écrire
- **Coquelicot** `#F1453B` : réagir

**Fonds**

| Surface | Clair | Sombre |
|---|---|---|
| Fond de page | `#F5F4F2` | `#0C0C0D` |
| Carte | `#FFFFFF` | `#161618` |
| Creux (puce, champ, bouton Annuler) | `#EFEEEB` | `#1F1F22` |
| Texte | `#1C1917` | `#F2F2F3` |
| Texte secondaire | `#645E59` | `#A0A0A8` |
| Filet décoratif | `#E7E5E2` | `#29292D` |
| Contour de champ | `#8A8682` | `#75757C` |

**Couleur de chaque fonction** (aplat · texte sur l'aplat · encre en texte)

| Fonction | Gestes | Clair | Sombre |
|---|---|---|---|
| Principal | Publier, Créer | `#EC8B34` · `#1F1300` · `#A4520D` | `#F29A4A` · `#1F1300` · `#F6A660` |
| Relations | Suivre, se connecter | `#3F9FE8` · `#00182B` · `#006CAC` | `#54B3FD` · `#00182B` · `#54B3FD` |
| Messages | Écrire | `#3F9FE8` · `#00182B` · `#006CAC` | `#54B3FD` · `#00182B` · `#54B3FD` |
| Réactions | J'aime, réactions | `#F1453B` · `#290B09` · `#F1453B` | `#F1453B` · `#290B09` · `#F1453B` |
| Commerce | Acheter, Participer | `#EC8B34` · `#1F1300` · `#A4520D` | `#F29A4A` · `#1F1300` · `#F6A660` |
| Validation | Accepter, Confirmer | `#237A40` · `#FFFFFF` · `#1B6434` | `#5CC584` · `#062612` · `#6BD192` |
| Danger | Supprimer, Signaler | `#C8331F` · `#FFFFFF` · `#B42D1B` | `#FF7B66` · `#2A0700` · `#FF8B78` |
| Neutre | Annuler, Plus tard | gris du creux, sans contour | gris du creux, sans contour |

### 3. Forêt

Un vert forêt vif, l'olive et le miel. Fond beige lin, noir légèrement chaud en sombre ; cartes blanc cassé.

- Nom affiché : **Forêt** (anglais : Forest) — « Vert forêt, olive et miel. »
- Identifiant enregistré : `foret` · charte : `data-charte="antsia-foret"` · fichier : `packages/ui/src/themes/antsia-foret.css`
- Fond : **Lin** (beige lin · noir chaud)

**Les trois couleurs et leurs gestes**

- **Vert forêt** `#317A45` : publier
- **Olive** `#646E40` : suivre et écrire
- **Miel** `#C98A2B` : réagir, participer et acheter

**Fonds**

| Surface | Clair | Sombre |
|---|---|---|
| Fond de page | `#F4EFE7` | `#141312` |
| Carte | `#FFFDF9` | `#1E1D1B` |
| Creux (puce, champ, bouton Annuler) | `#ECE6DB` | `#282624` |
| Texte | `#1E1B16` | `#EFEBE4` |
| Texte secondaire | `#655E52` | `#ACA69C` |
| Filet décoratif | `#E3DCCF` | `#33312D` |
| Contour de champ | `#8C8373` | `#86817A` |

**Couleur de chaque fonction** (aplat · texte sur l'aplat · encre en texte)

| Fonction | Gestes | Clair | Sombre |
|---|---|---|---|
| Principal | Publier, Créer | `#317A45` · `#FFFFFF` · `#2D7240` | `#76BF85` · `#031C09` · `#76BF85` |
| Relations | Suivre, se connecter | `#646E40` · `#FFFFFF` · `#535C33` | `#9AA66A` · `#141A08` · `#B0BC80` |
| Messages | Écrire | `#646E40` · `#FFFFFF` · `#4A5330` | `#9AA66A` · `#141A08` · `#BDC88F` |
| Réactions | J'aime, réactions | `#C98A2B` · `#2A1A00` · `#A0670F` | `#E5B04F` · `#2A1A00` · `#EBB85E` |
| Commerce | Acheter, Participer | `#C98A2B` · `#2A1A00` · `#946000` | `#E5B04F` · `#2A1A00` · `#EBB85E` |
| Validation | Accepter, Confirmer | `#317A45` · `#FFFFFF` · `#28723D` | `#76BF85` · `#031C09` · `#76BF85` |
| Danger | Supprimer, Signaler | `#B3261E` · `#FFFFFF` · `#A3221B` | `#F0897E` · `#2A0603` · `#F59A90` |
| Neutre | Annuler, Plus tard | gris du creux, sans contour | gris du creux, sans contour |

### 4. Corail

Le rose corail, la mandarine et le lilas, les trois couleurs d'un coucher de soleil. Fond gris perle, graphite en sombre.

- Nom affiché : **Corail** (anglais : Coral) — « Rose corail, mandarine et lilas. »
- Identifiant enregistré : `corail` · charte : `data-charte="antsia-corail"` · fichier : `packages/ui/src/themes/antsia-corail.css`
- Fond : **Perle** (gris perle · graphite)

**Les trois couleurs et leurs gestes**

- **Rose corail** `#E25F78` : publier et réagir
- **Mandarine** `#E69545` : participer et acheter
- **Lilas** `#AA84D4` : suivre et écrire

**Fonds**

| Surface | Clair | Sombre |
|---|---|---|
| Fond de page | `#F1F1F2` | `#121212` |
| Carte | `#FFFFFF` | `#1B1B1D` |
| Creux (puce, champ, bouton Annuler) | `#EAEAEC` | `#252527` |
| Texte | `#0A0A0B` | `#EDEDEE` |
| Texte secondaire | `#5F5F67` | `#A0A0A6` |
| Filet décoratif | `#E2E2E5` | `#2C2C2F` |
| Contour de champ | `#83838B` | `#76767D` |

**Couleur de chaque fonction** (aplat · texte sur l'aplat · encre en texte)

| Fonction | Gestes | Clair | Sombre |
|---|---|---|---|
| Principal | Publier, Créer | `#E25F78` · `#2B0711` · `#BA3354` | `#F07A90` · `#2B0711` · `#F58DA0` |
| Relations | Suivre, se connecter | `#AA84D4` · `#1B0F28` · `#7D58A4` | `#BD97E8` · `#1B0F28` · `#BD97E8` |
| Messages | Écrire | `#AA84D4` · `#1B0F28` · `#7D58A4` | `#BD97E8` · `#1B0F28` · `#BD97E8` |
| Réactions | J'aime, réactions | `#E25F78` · `#2B0711` · `#D04565` | `#F58DA0` · `#2B0711` · `#F79BAC` |
| Commerce | Acheter, Participer | `#E69545` · `#2A1300` · `#9C520C` | `#F0A55C` · `#2A1300` · `#F2AE6C` |
| Validation | Accepter, Confirmer | `#2E7D4F` · `#FFFFFF` · `#22603C` | `#6FCF97` · `#062614` · `#7DD8A3` |
| Danger | Supprimer, Signaler | `#B42335` · `#FFFFFF` · `#A81F31` | `#FF8A8A` · `#2A0505` · `#FF9A9A` |
| Neutre | Annuler, Plus tard | gris du creux, sans contour | gris du creux, sans contour |

### 5. Lagon

Le turquoise, le corail Bittersweet (réservé aux réactions et aux notifications) et un jaune de Naples pâle et lumineux. Fond greige, anthracite en sombre.

- Nom affiché : **Lagon** (anglais : Lagoon) — « Turquoise, corail et jaune de Naples. »
- Identifiant enregistré : `lagon` · charte : `data-charte="antsia-lagon"` · fichier : `packages/ui/src/themes/antsia-lagon.css`
- Fond : **Greige** (greige · anthracite)

**Les trois couleurs et leurs gestes**

- **Turquoise** `#4ECDC4` : publier, suivre et écrire
- **Bittersweet** `#FF6B6B` : réagir
- **Jaune de Naples** `#FFE66D` : participer et acheter

**Fonds**

| Surface | Clair | Sombre |
|---|---|---|
| Fond de page | `#EDECE8` | `#1A1A1A` |
| Carte | `#FAFAF8` | `#242424` |
| Creux (puce, champ, bouton Annuler) | `#E4E2DD` | `#2E2E2E` |
| Texte | `#1A1A18` | `#ECECEC` |
| Texte secondaire | `#5C5A54` | `#A8A8A8` |
| Filet décoratif | `#DCDAD3` | `#363636` |
| Contour de champ | `#817F77` | `#7C7C7C` |

**Couleur de chaque fonction** (aplat · texte sur l'aplat · encre en texte)

| Fonction | Gestes | Clair | Sombre |
|---|---|---|---|
| Principal | Publier, Créer | `#4ECDC4` · `#0B2D2A` · `#0D6F6A` | `#4ECDC4` · `#0B2D2A` · `#6FE0D8` |
| Relations | Suivre, se connecter | `#4ECDC4` · `#0B2D2A` · `#0D6F6A` | `#4ECDC4` · `#0B2D2A` · `#7FE6DF` |
| Messages | Écrire | `#4ECDC4` · `#0B2D2A` · `#0D6F6A` | `#4ECDC4` · `#0B2D2A` · `#7FE6DF` |
| Réactions | J'aime, réactions | `#FF6B6B` · `#2B0505` · `#E04848` | `#FF6B6B` · `#2B0505` · `#FF8585` |
| Commerce | Acheter, Participer | `#FFE66D` · `#1B1600` · `#7C6A00` | `#FFE66D` · `#1B1600` · `#FFE66D` |
| Validation | Accepter, Confirmer | `#1E7A4F` · `#FFFFFF` · `#17633F` | `#5FD39A` · `#062614` · `#6FDCA6` |
| Danger | Supprimer, Signaler | `#C93030` · `#FFFFFF` · `#B82B2B` | `#FF7B72` · `#2A0505` · `#FF8F87` |
| Neutre | Annuler, Plus tard | gris du creux, sans contour | gris du creux, sans contour |

### 6. Électrique

Le bleu de 21st.dev, le rose et le citron vert, presque à égale distance sur le cercle chromatique. Fond blanc pur, noir zinc en sombre. Seul thème dont la carte a la couleur du fond : elle porte donc un filet de 1 px.

- Nom affiché : **Électrique** (anglais : Electric) — « Bleu, rose et citron vert. »
- Identifiant enregistré : `electrique` · charte : `data-charte="antsia-electrique"` · fichier : `packages/ui/src/themes/antsia-electrique.css`
- Fond : **Zinc** (blanc pur · noir zinc)

**Les trois couleurs et leurs gestes**

- **Bleu 21st** `#0033FF` : publier, suivre et écrire
- **Rose** `#F43F5E` : réagir
- **Citron vert** `#84CC16` : participer et acheter

**Fonds**

| Surface | Clair | Sombre |
|---|---|---|
| Fond de page | `#FFFFFF` | `#09090B` |
| Carte | `#FFFFFF` | `#09090B` |
| Creux (puce, champ, bouton Annuler) | `#F4F4F5` | `#18181B` |
| Texte | `#09090B` | `#FAFAFA` |
| Texte secondaire | `#67676F` | `#A1A1AA` |
| Filet décoratif | `#E4E4E7` | `#27272A` |
| Contour de champ | `#8B8B94` | `#71717A` |

**Couleur de chaque fonction** (aplat · texte sur l'aplat · encre en texte)

| Fonction | Gestes | Clair | Sombre |
|---|---|---|---|
| Principal | Publier, Créer | `#0033FF` · `#FFFFFF` · `#0033FF` | `#4060FF` · `#FFFFFF` · `#93A8FF` |
| Relations | Suivre, se connecter | `#0033FF` · `#FFFFFF` · `#0033FF` | `#4060FF` · `#FFFFFF` · `#93A8FF` |
| Messages | Écrire | `#0033FF` · `#FFFFFF` · `#0033FF` | `#4060FF` · `#FFFFFF` · `#93A8FF` |
| Réactions | J'aime, réactions | `#F43F5E` · `#2A0510` · `#E11D48` | `#FB7185` · `#2A0510` · `#FB7185` |
| Commerce | Acheter, Participer | `#84CC16` · `#0E1A02` · `#4A7700` | `#84CC16` · `#0E1A02` · `#84CC16` |
| Validation | Accepter, Confirmer | `#15803D` · `#FFFFFF` · `#126E35` | `#34D399` · `#001C10` · `#34D399` |
| Danger | Supprimer, Signaler | `#DC2626` · `#FFFFFF` · `#C81E1E` | `#F87171` · `#2A0505` · `#FC9595` |
| Neutre | Annuler, Plus tard | gris du creux, sans contour | gris du creux, sans contour |

### 7. Sable

**La charte de DIASPORALE**, portée dans le réseau le 19/10/2026 avec les couleurs du thème Sable de diasporale.com (géométrie et polices du réseau). Fond papier presque blanc, cartes couleur sable, encre brune ; nuit brune en sombre.

- Nom affiché : **Sable** (anglais : Sand) — « Bleu Gabon, sarcelle et sable doré. Le thème de DIASPORALE. »
- Identifiant enregistré : `sable` · charte : `data-charte="antsia-sable"` · fichier : `packages/ui/src/themes/antsia-sable.css`
- Fond : **Sable** (papier et sable · nuit brune)

**Les trois couleurs et leurs gestes**

- **Sarcelle** `#238090` : suivre
- **Sable** `#D7AD63` : réagir, participer et acheter
- **Bleu Gabon** `#0167A8` : publier et écrire

**Fonds**

| Surface | Clair | Sombre |
|---|---|---|
| Fond de page | `#FDFDFB` | `#151311` |
| Carte | `#F1EFEB` | `#24221F` |
| Creux (puce, champ, bouton Annuler) | `#E7E4DE` | `#302E2A` |
| Texte | `#25211E` | `#E7E4DE` |
| Texte secondaire | `#595550` | `#B8B4AC` |
| Filet décoratif | `#DDDAD4` | `#3C3935` |
| Contour de champ | `#84817B` | `#7C7872` |

**Couleur de chaque fonction** (aplat · texte sur l'aplat · encre en texte)

| Fonction | Gestes | Clair | Sombre |
|---|---|---|---|
| Principal | Publier, Créer | `#0167A8` · `#FFFFFF` · `#01609C` | `#5BA5E5` · `#151311` · `#7EC2FF` |
| Relations | Suivre, se connecter | `#238090` · `#FFFFFF` · `#1B6874` | `#4FB3C2` · `#151311` · `#6CC6D3` |
| Messages | Écrire | `#0167A8` · `#FFFFFF` · `#01619E` | `#5BA5E5` · `#151311` · `#7EC2FF` |
| Réactions | J'aime, réactions | `#D7AD63` · `#25211E` · `#A1782D` | `#D7AD63` · `#151311` · `#D7AD63` |
| Commerce | Acheter, Participer | `#D7AD63` · `#25211E` · `#7A5A22` | `#D7AD63` · `#151311` · `#D7AD63` |
| Validation | Accepter, Confirmer | `#14743A` · `#FFFFFF` · `#0F5F2F` | `#6EBE85` · `#151311` · `#6EBE85` |
| Danger | Supprimer, Signaler | `#B3261E` · `#FFFFFF` · `#B3261E` | `#E18C85` · `#151311` · `#E18C85` |
| Neutre | Annuler, Plus tard | gris du creux, sans contour | gris du creux, sans contour |

## Ajouter ou modifier un thème

Un thème touche sept endroits ; les tests en vérifient la cohérence.

1. `packages/ui/src/themes/antsia-<thème>.css` : même structure que les autres (cliquet
   `theme-contract` : un thème ne redéclare que des jetons du contrat).
2. `packages/ui/src/themes/antsia-themes.ts` : `ANTSIA_THEME_IDS`.
3. `packages/social-contracts/src/appearance.ts` : `MEMBER_THEME_IDS` (validateur de
   `persons.theme` dans `convex/lib/validators.ts`).
4. `apps/antsia_ga/src/app/globals.css` : import du fichier et règle des toasts.
5. `apps/antsia_ga/src/i18n/locales/{fr,en}/antsia.json` :
   `preferences.theme.options.<thème>` (nom et phrase, mêmes clés dans les deux langues).
6. Tests : `antsia-themes.test.ts` (valeurs figées, contrastes à travers la cascade complète)
   et `apps/antsia_ga/src/components/theme-picker.test.tsx` (ordre et noms affichés).
7. Ce document et l'artifact des maquettes.

Ne pas confondre avec les chartes de DIASPORALE (`diasporale.css`, `diasporale-gaboma.css`) :
elles habillent diasporale.com et ne font pas partie de ce sélecteur.
