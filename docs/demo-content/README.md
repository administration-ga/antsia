# Animation des comptes de démonstration — 20 octobre 2026

Le jeu est intégré aux vrais profils OTP de démonstration, en local et sur
`antsia-demo.vercel.app`. Le compte « nouveau » conserve son parcours d'accueil.

## Contenu

- 7 profils avec une activité décrite ; 6 pages : média, épicerie, association,
  mairie fictive, studio photo et atelier informatique.
- 21 publications, 12 commentaires, 42 réactions, relations et suivis entre les
  seuls acteurs fictifs ; compteurs alimentés par les fonctions du moteur.
- 3 vitrines, 4 produits et 4 prestations : photographie et informatique.
- 8 illustrations générées avec l'outil d'images intégré, utilisées pour
  8 publications, 6 bannières, 4 couvertures et 7 stories de 24 heures.

Les PNG originaux et le manifeste des prompts, descriptions et empreintes sont
dans `apps/antsia_ga/public/demo-media/animation-20261020/`. Les descriptions des
contenus et les textes alternatifs précisent leur nature fictive ou générée.

## Exécution et garde

`scripts/prepare-demo-content.mjs --target local|demo --apply` passe par les vrais
OTP et sessions Better Auth. Sans `--apply`, seule la lecture du catalogue est
effectuée. Aucun jeton ni code OTP n'est écrit dans les rapports.

Les fonctions internes `seeds/demoContent:run`, `seeds/demoContent:mediaTargets`,
`seeds/demoContent:attachMedia` et `seeds/demoContentMedia:runBatch` exigent la
confirmation `ANTSIA_DEMO_CONTENT_2026_10_20`. Elles acceptent les outils locaux
déclarés, ou exclusivement le déploiement `vivid-hedgehog-655` déclaré comme démo.
Une copie du drapeau sur un autre déploiement est refusée.

La graine relit les sept adresses vérifiées réservées, les profils, adhésions,
consentements et états de modération. Elle n'emprunte aucune identité réelle.
Les visuels stockés sont téléchargés côté serveur depuis l'origine configurée,
contrôlés par taille, type et SHA-256, puis admis comme fichiers générés par le
serveur. Chaque rattachement possède son propre blob, notamment les stories.

Les clés de publications sont stables. Le rejeu ne duplique ni publications ni
commentaires/réactions ; il respecte profils édités, retraits, désabonnements et
consentements révoqués. Une story retirée ou purgée n'est pas ressuscitée dans la
journée. Une nouvelle invocation un autre jour peut créer une nouvelle story ;
aucune animation récurrente automatique n'est installée.

Le catalogue démo utilise les composants et lectures de boutique existants.
Les actions d'achat, devis et contact d'offre restent fermées et les références
`demo:` sont refusées par les commandes de contact. Une vraie projection PRO.GA
lisible prend la priorité. Aucune commande, réservation ou transaction fictive
n'est insérée dans les tables métier.

Les règles ordinaires de visibilité sont conservées : les publications des
pages communautaires n'obtiennent pas une lecture anonyme par ce jeu de données.

## Vérifications

Les preuves visuelles sont dans `recette/`. Les résultats de livraison et les
contrôles en ligne sont consignés dans `livraison-2026-10-20.md`.
