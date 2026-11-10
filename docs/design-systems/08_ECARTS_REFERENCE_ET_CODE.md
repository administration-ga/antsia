# Écarts relevés avant le raccord à l’application

Relevé du **20 octobre 2026** depuis
[ANTSIA — sept thèmes, toutes les pages](https://claude.ai/artifact/AnLxkaqaai725ywzkrVk6b#page-c71058556eba).
[Index](README.md) · [Socle](00_SOCLE_COMMUN.md).

Ce registre distingue le contenu de la référence, les déclarations du dépôt et
les décisions déjà conservées. Il conserve le constat initial de l’étape Markdown. Le [rapport de raccord et de recette](09_IMPLEMENTATION_ET_RECETTE.md) décrit les corrections ensuite appliquées dans l’application réelle.

## Couleurs vérifiées identiques

La comparaison porte sur sept thèmes × deux modes × 28 valeurs :

- Sept surfaces : page, carte, creux, texte, texte secondaire, filet, champ.
- Sept fonctions × trois valeurs : aplat, texte sur l'aplat, encre.

**Résultat : 392 valeurs identiques.** Le relevé des styles de `Fil.dc.html`
et les CSS du dépôt ont la même représentation canonique des valeurs.
Le contrôle documentaire des tableaux des sept fiches porte en plus sur les
traitements propres au code : 484 valeurs cohérentes avec ses CSS.

Cette égalité ne porte ni sur tous les effets, ni sur la disposition de chaque
écran. Les écarts avec l'ancien artifact documentés dans le document 22 ne sont
pas des différences actuelles de ces 392 couleurs : les corrections AA sont
déjà présentes dans le nouveau canevas.

## Dimensions et typographie

| Élément | Référence : CSS rendu | Dépôt avant le raccord / décision existante | Suite |
|---|---|---|---|
| Corps et texte de publication | `15px / 1.5` | Corps de thème `16px` | Écart à prendre en compte lors du raccord des textes |
| Créer | `52 × 52px`, rayon `18px` | Carré `48px` décrit par ADR-0027 | Taille à rapprocher de la nouvelle barre |
| Barre basse | Fond carte à `88%`, flou `16px` | Fonds figés à `90%` dans les thèmes | Comparer le rendu composé |
| Boutons | Petit `32px`, normal `40px`, grand `48px` | Plancher tactile `44px` décidé précédemment | Conserver la cible accessible ; ne pas réduire automatiquement |
| Cadres d'appareil | Rayons externes `44 / 32 / 14px` | Document de l'application sans faux appareil | Décor du canevas, à exclure de la coque réelle |

Le texte de `Main.dc.html` exige lui-même des cibles mobiles de **44px**.
Il diverge donc du minimum de certains boutons de sa feuille de style.
Les trois formats dessinés ne suffisent pas à déduire tous les breakpoints.

## Ombres et filets

Le texte « Profondeur : seul ce qui flotte a une ombre » de la planche commune
réserve l'ombre à la barre et à Créer. Les styles de la référence définissent
néanmoins ces exceptions :

| Thème | Clair : `--card-shadow` | Sombre : `--card-shadow` |
|---|---|---|
| Soleil | `0 1px 2px rgba(28, 25, 23, .05)` | `inset 0 1px 0 rgba(255, 255, 255, .05)` |
| Corail | `0 1px 2px rgba(0, 0, 0, .05), 0 6px 20px rgba(0, 0, 0, .05)` | `inset 0 1px 0 rgba(255, 255, 255, .04), 0 8px 24px rgba(0, 0, 0, .4)` |

Les autres thèmes gardent une ombre de carte transparente.
Électrique utilise un anneau de `1px`, `#E4E4E7` en clair / `#27272A` en sombre.
La règle `.card` du canevas compose `--card-ring` et `--card-shadow`.

Le dépôt applique l'absence d'ombre de carte à tous les thèmes
(`--esp-surface-shadow: none`). Il faut préserver la distinction entre le
principe écrit et les exceptions effectivement définies, sans affirmer qu'ils
sont déjà identiques.

## Fonds doux, motifs et flottants

| Traitement | Référence | Dépôt avant le raccord |
|---|---|---|
| Fonds doux | `color-mix(in srgb, aplat p%, carte)` : principal/social/message 15, réaction/commerce 18, succès 14, danger 12 | Valeurs figées pour les traitements exposés dans les fiches |
| Grain | Trames radiales de `5 / 7 / 11px`, alpha `7% / 5%` | SVG de `180px`, coefficient alpha `0,09 / 0,07` |
| Projecteur | Halo `85% 55%`, alpha `7% / 12%` | Halo `90% 60%`, alpha `7% / 10%` |
| Créer : ombre | Aplat principal à `75%` et transparent à `25%`, décalage `0 10px 20px -8px` | Valeurs figées à alpha `0.55 / 0.45` selon le mode |
| État actif | Fond doux calculé dans les composants du canevas | `--esp-tab-active-bg/fg` figés |

La mention « aplat à 75% » signifie 75% d'aplat et 25% de transparent.
Certaines valeurs figées peuvent coïncider avec un mélange ; ce tableau
compare les définitions et ne prétend pas qu'elles diffèrent toutes à l'écran.

## Couverture des formats et des états

Les 56 planches fonctionnelles exposent les trois formats. La planche de fil
thématique expose 14 vues mobiles (sept clair, sept sombre), sept tablettes
claires et sept bureaux clairs. La planche de nuancier expose les deux modes.

Le sombre tablette et bureau, les erreurs réseau, chargements, focus, textes
longs et changements de compte nécessiteront une recette réelle.
Une planche dessinée n'établit pas qu'une action fonctionne dans l'application.

## Précautions conservées pendant l’implémentation

- Les liens `*.dc.html` appartiennent au prototype : utiliser les routes réelles.
- Les personnes, offres, prix et états illustratifs restent des exemples.
- Ne pas transformer une demande, une réserve ou une admission en preuve de
  paiement, de réception, de reversement ou d'écoute effective.
- Les mentions juridiques de la maquette restent explicitement des versions
  de travail, avec champs à renseigner ; elles ne prouvent pas une conformité.
- Reprendre les composants existants et leurs variantes, la séparation réseau,
  les gardes et les chartes voisines.
