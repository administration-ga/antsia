# ANTSIA — Sept univers et vie publique

**21 octobre 2026 · étude stratégique, version 1.1 · décisions D01 à D08 validées par le propriétaire le 21/10/2026 ([ADR-0035](../../adr/0035-sept-univers-et-vie-publique.md)) ; D09 à D12 proposées**

Étude des besoins de la population gabonaise à porter dans le réseau social national : sept univers business, la place de l'administration, des médias et des annonceurs, la réponse à « une page + une boutique ou une page configurée en boutique ? », et l'entrée d'iAsted dans ANTSIA.

| Fichier | Contenu |
|---|---|
| [ETUDE_SEPT_UNIVERS_ANTSIA.md](ETUDE_SEPT_UNIVERS_ANTSIA.md) | l'étude complète : constat chiffré et sourcé, notation des douze candidats, fiches des sept univers, benchmark, architecture fonctionnelle et technique, conformité, iAsted, modèle économique, feuille de route, douze décisions |
| [ETUDE_SEPT_UNIVERS_ANTSIA.pdf](ETUDE_SEPT_UNIVERS_ANTSIA.pdf) | le dossier visuel de décision : 37 pages A4, 19 schémas |
| [schemas/](schemas/) | les 19 schémas en SVG, insérés dans le Markdown et dans le PDF |
| [SU01_CONFORMITE_ORDONNANCE_0011.md](SU01_CONFORMITE_ORDONNANCE_0011.md) | lot SU01 : analyse de conformité à l'ordonnance n° 0011/PR/2026 et à la loi n° 025/2023, écarts et plan |
| [EXECUTION.md](EXECUTION.md) | avancement des lots SU00 à SU16 |
| [source/](source/) | le générateur : données, gabarit Markdown, schémas, mise en page |

## En une phrase

**Une page pour exister, des espaces pour vendre, PRO.GA pour gérer** — sur trois piliers (divertissement, business, vie publique) et sept univers : boutiques ; immobilier et foncier ; emploi et talents ; alimentation et restauration ; services et artisans ; auto et mobilité ; cérémonies et sorties.

## Statut et frontières

- Étude documentaire : aucun code modifié, aucune capacité activée, aucune publication.
- Elle prolonge l'ADR-0034 et le plan marketplace MP00–MP14 sans les réécrire ; le dossier `2026-10-21-marketplace-specialites` reste celui de la session marketplace.
- Les lots portent le préfixe **SU** (SU00 à SU16). SU00 est fait (ADR-0035) ; SU01 a son analyse ; les suivants s'exécutent un à un, réservés dans la mémoire partagée.
- Recherche web du 21 octobre 2026 ; quota atteint en fin de session. Points non vérifiés listés au § 1 de l'étude, dont le statut de la suspension des réseaux sociaux au 21 octobre.

## Régénérer

```bash
python3 source/build.py all
```

`all` écrit les schémas, le Markdown et le PDF à partir des mêmes données (`source/donnees.py`, `source/donnees_etude.py`) et du gabarit `source/etude.template.md`. `svg`, `md`, `pdf` et `preview` font chaque étape séparément. Dépendances : Python 3 (bibliothèque standard), Google Chrome pour le rendu PDF, la police Inter de `@fontsource-variable/inter` (installée par `bun install`). Icônes : tracés Lucide (licence ISC), extraits une fois dans `source/icons.json`.
