# ADR-0040 : DIASPORALE devient DIASPORA.GA, clés techniques comprises

- **Statut** : Proposé (décision du propriétaire du 2026-11-20 ; aperçu en brouillon, vérification
  commune et fusion couplée au jour J)
- **Date** : 2026-11-20
- **Amende** : ADR-0038, point 2 (domaine réservé des comptes de démonstration).
- **Précédent** : ADR-0007 (nom canonique ANTSIA, renommage ANTIA → ANTSIA du 16/10/2026).

## Contexte

Le propriétaire a retenu le domaine `diaspora.ga` le 20/11/2026 pour le réseau fermé de la diaspora.
`diasporale.com` n'a jamais été acheté. Aucun backend de production ne porte de réseau : seuls des
backends de démonstration et de développement, semés par la graine, portent la clé `diasporale`.
L'ancien nom est partout : marque, dossier, application, paquets, clé de réseau et charte, variables,
dépôt.

## Décision

Nous renommons DIASPORALE en **DIASPORA.GA**, clés techniques comprises : marque `DIASPORA.GA`,
domaine `diaspora.ga`, dossier `ECOSYSTEMES/DIASPORA_GA`, application `apps/diaspora_ga`, paquets
`@diaspora-ga/*`, clé de réseau et charte `diaspora-ga`, variables `DIASPORA_GA_*`, dépôt
`administration-ga/diaspora.ga`.

1. La tranche `diaspora` du moteur garde son nom (`convex/modules/diaspora/`, `managedBy: "diaspora"`,
   `DIASPORA_SLICE_MANIFEST`, contrats `DIASPORA-*-V1`), comme les thèmes du compte `sable` et `gaboma`.
2. Aucun alias : ni ancienne clé de réseau, ni ancienne variable, ni ancienne clé du navigateur.
3. La démonstration est remise à zéro puis resemée ; les adresses réservées deviennent
   `<acteur>@demo.diaspora-ga.test` (amende le point 2 de l'ADR-0038).
4. Le renommage est produit par un script rejouable, depuis un `main` frais, le jour de la fusion ;
   les documents datés sont figés (nom et contenu) ; la correspondance est tenue dans
   `docs/RENOMMAGE_DIASPORA_GA_2026-11-20.md`.

## Conséquences

### Positives

- Un seul nom, celui du domaine retenu, du code à l'écran.
- Un renommage reproductible et contrôlable : le même script produit l'aperçu et le lot du jour J ;
  un second passage ne change rien.

### Négatives

- Lot couplé : le moteur d'abord, puis l'application, tant que le dépôt GitHub s'appelle encore
  `diasporale`.
- Préférences et brouillons de la démonstration perdus (clés du navigateur renommées sans migration) ;
  rupture de série de la mesure d'audience.
- Aucun retour arrière outillé vers un déploiement d'avant (libellé de version changé).
- Suppression des données de la démonstration et changement de variables : gestes du propriétaire.

### Neutres

- Le lien masqué `ECOSYSTEMES/DIASPORALE` → `ECOSYSTEMES/DIASPORA_GA` reste, à ne jamais retirer.
- Les versions des textes légaux et de consentement ne bougent pas sans décision du propriétaire.

## Alternatives considérées

### Option A — marque seule, clés techniques inchangées

Moins de risque immédiat, mais deux noms à vie entre l'écran et le code. Écartée par le propriétaire.

### Option B — alias pendant une période de transition

Utile s'il existait des données de production ; il n'y en a pas. Écartée : complexité sans bénéfice.

## Références

- Plan de renommage : `ECOSYSTEMES/DOCUMENTATION/DIASPORA_GA/Renommage_2026-11-20/Plan_renommage_DIASPORA_GA_2026-11-20.md`.
- Chantier CH-800 ; ADR-0007, ADR-0038.
