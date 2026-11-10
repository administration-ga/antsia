# Les sept design systems ANTSIA — dossier de référence

Relevé du **20 octobre 2026**, à partir de
[ANTSIA — sept thèmes, toutes les pages](https://claude.ai/artifact/AnLxkaqaai725ywzkrVk6b#page-c71058556eba).

## Implémentation dans l’application

Les sept thèmes sont raccordés aux sources réelles des huit rubriques.
Voir le [rapport d’implémentation et de vérification locale](09_IMPLEMENTATION_ET_RECETTE.md) pour les changements, les tests, les captures et les limites de recette.
Les relevés ci-dessous décrivent la référence et l’état initial, avant ce raccord.

## Ce qui est couvert

Les **huit rubriques** du canevas ont été parcourues et leurs **60 planches**
inventoriées. Le relevé porte sur les contenus rendus, les contrôles, les vues
responsive annoncées et les styles attachés aux planches. Il ne constitue pas
une recette de l'application ni une exécution de toutes les interactions.

Le lien est devenu accessible dans le navigateur pendant le travail. Le
premier relevé limité aux CSS du dépôt a été complété par la lecture du canevas.
Les sept surfaces neutres et les sept triplets de rôle, dans les deux modes,
représentent **392 valeurs identiques** entre les déclarations du canevas et le
code actuel. D'autres détails diffèrent : ils sont consignés dans
[Écarts entre référence et code](08_ECARTS_REFERENCE_ET_CODE.md).

## Les sept fiches de thème

Un design system associe le [socle commun](00_SOCLE_COMMUN.md), la fiche de sa
palette et les fiches d'écran concernées.

| N° | Fiche | Signature | Fond clair / sombre |
|---|---|---|---|
| 1 | [Gaboma](01_GABOMA.md), défaut | Vert, safran, bleu | Blanc franc / noir absolu |
| 2 | [Soleil](02_SOLEIL.md) | Mandarine, azur, coquelicot | Craie / charbon |
| 3 | [Forêt](03_FORET.md) | Vert forêt, olive, miel | Lin / noir chaud |
| 4 | [Corail](04_CORAIL.md) | Rose corail, mandarine, lilas | Perle / graphite |
| 5 | [Lagon](05_LAGON.md) | Turquoise, Bittersweet, jaune de Naples | Greige / anthracite |
| 6 | [Électrique](06_ELECTRIQUE.md) | Bleu, rose, citron vert | Blanc / zinc |
| 7 | [Sable](07_SABLE.md) | Sarcelle, sable doré, bleu Gabon | Papier / nuit brune |

Chaque fiche sépare aplat, texte sur l'aplat et encre ; elle couvre le clair et
le sombre. Les traitements supplémentaires figés du code y restent identifiés
comme tels. Leur traduction depuis le canevas est précisée dans le socle et le
registre des écarts.

## Les huit rubriques du canevas

| Rubrique | Planches | Documentation |
|---|---:|---|
| Les sept thèmes | 4 | [Nuancier et trois présentations du fil](pages/00_LES_SEPT_THEMES.md) |
| Accueil et accès | 14 | [Entrée, découverte publique et pages d'information](pages/01_ACCUEIL_ET_ACCES.md) |
| Fil et vie sociale | 9 | [Fil, composition, commentaires, actus, groupes et évènements](pages/02_FIL_ET_VIE_SOCIALE.md) |
| Messages et directs | 5 | [Conversations, canal commercial, appel, direct et conférence](pages/03_MESSAGES_ET_DIRECTS.md) |
| Profils et pages | 4 | [Profil, espace personnel, album et page officielle](pages/04_PROFILS_ET_PAGES.md) |
| Boutiques et achats | 13 | [Catalogue, panier, commande, paiement et gestion](pages/05_BOUTIQUES_ET_ACHATS.md) |
| Emplois et services | 7 | [Offres, candidatures, devis, rendez-vous et prestations](pages/06_EMPLOIS_ET_SERVICES.md) |
| Compte et données | 4 | [Préférences, droits, modération et santé](pages/07_COMPTE_ET_DONNEES.md) |
| **Total** | **60** | Les huit rubriques sont documentées |

Les 56 planches fonctionnelles proposent chacune les formats **390 × 844**,
**834 × 1194** et **1440 × 1024**. Dans la rubrique des thèmes, le fil mobile
montre les sept thèmes en clair **et** en sombre ; les vues tablette et bureau
montrent les sept thèmes en clair. Les modes sombres tablette/bureau restent
à vérifier lors de l'implémentation.

## Correspondance avec les sources réelles

| Thème enregistré | `data-charte` de l'application | Source |
|---|---|---|
| `gaboma` | `antsia` | [antsia.css](../../packages/ui/src/themes/antsia.css) |
| `soleil` | `antsia-soleil` | [antsia-soleil.css](../../packages/ui/src/themes/antsia-soleil.css) |
| `foret` | `antsia-foret` | [antsia-foret.css](../../packages/ui/src/themes/antsia-foret.css) |
| `corail` | `antsia-corail` | [antsia-corail.css](../../packages/ui/src/themes/antsia-corail.css) |
| `lagon` | `antsia-lagon` | [antsia-lagon.css](../../packages/ui/src/themes/antsia-lagon.css) |
| `electrique` | `antsia-electrique` | [antsia-electrique.css](../../packages/ui/src/themes/antsia-electrique.css) |
| `sable` | `antsia-sable` | [antsia-sable.css](../../packages/ui/src/themes/antsia-sable.css) |

Le canevas utilise `data-theme` et `data-mode` pour composer ses vues fixes.
L'application utilise ses contrats existants ; ces attributs de maquette ne
sont pas une nouvelle API à recopier.

## Preuves et limites

- 60 noms de planche relevés avec leur fichier et leur route, dans huit rubriques.
- 392 valeurs de palette comparées aux déclarations CSS du dépôt, identiques.
- 484 valeurs des tableaux des sept fiches rapprochées des CSS du dépôt.
- Liens locaux, inventaires et cohérence des documents contrôlés.
- Les comptes, prix et compteurs dessinés sont des exemples de maquette.
- La lecture DOM/CSS ne prouve pas l'exécution de toutes les interactions ni
  une correspondance de chaque pixel. Aucun nouveau test applicatif, codegen,
  build ou déploiement n'est inclus dans cette étape documentaire.

Les documents antérieurs [22](../22_THEMES_ET_OPTIONS_ANTSIA.md),
[23](../23_APPLICATION_STRICTE_DES_CHARTES.md) et
[24](../24_PUBLICATION_ET_RECETTE_CHARTES_2026-10-20.md) restent leurs rapports
propres ; leurs preuves historiques ne sont pas réattribuées à cette livraison.

## Suites du relevé

- [Implémentation et recette locale](09_IMPLEMENTATION_ET_RECETTE.md).
- [Publication ANTSIA et preuves en ligne](10_PUBLICATION_2026-10-20.md).
