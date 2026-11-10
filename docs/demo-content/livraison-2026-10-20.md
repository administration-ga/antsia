# Livraison des contenus et visuels démo — 20/10/2026

Livré en local sur localhost:3030 et dans la démo https://antsia-demo.vercel.app.
Version publique : `demo-animation-20261020-public`, déploiement Vercel
`dpl_2756bmnMEFauoaG7yTUhMYTa5MVr` (READY, alias promu, santé exacte).
Backend de démo : `vivid-hedgehog-655`, 944 fonctions dont quatre nouvelles
fonctions internes d'animation. Le déploiement annonce zéro index supprimé.
Aucune commande de cette livraison ne cible le backend ANTSIA principal.

## Résultats constatés dans les deux environnements

- Sept comptes OTP préparés par les vrais parcours de connexion, noms normalisés.
- Première graine : 7 biographies, 6 pages, 21 publications, 12 commentaires,
  42 réactions ; trois activités commerciales illustrées.
- Rejeu : zéro publication, commentaire ou réaction ajoutés, 21 publications
  existantes reconnues. Le compte nouveau n'est pas animé.
- 25 rattachements média : 8 publications, 6 bannières, 4 couvertures, 7 stories
  de 24 heures. Les lots se terminent avec `remaining: 0`.
- Catalogue anonyme : 4 produits + 2 prestations photo + 2 prestations
  informatiques ; images présentes et actions d'offre fermées.
- Les huit assets statiques correspondent à leurs empreintes SHA-256, en local
  et sur l'alias en ligne. Les prompts et l'outil de génération intégré figurent
  dans le manifeste livré avec les PNG originaux.

## Validation

- Codegen local, typage Convex et typage des tests réussis dans le vrai dépôt.
- Paquet de livraison isolé : typages backend et frontend réussis, lint ciblé
  sans erreur ni avertissement ; build Vercel complet réussi.
- 59 tests backend, 140 cliquets, 45 tests frontend SSR/filtres et 26 tests du
  préparateur OTP réussis (270 contrôles ciblés au total).
- Source SSR : le contrat PRO.GA reste strict ; les références/collections/images
  démo possèdent une branche allowlistée réservée aux origines locales connues
  et au backend de démo exact. Un autre cloud, un hôte ressemblant, une boutique
  ou image incohérente, une variante ou une action commerciale sont refusés.
- Navigateur : fil membre local et en ligne, images de publications, catalogue
  local, prestations photo et fiche de prestation, lecteur de story photo,
  catalogue public en ligne, recherche « raphia » et filtre de collection constatés.
- Cinq requêtes HTTP SSR sans cookie en ligne réussies : vitrine, catalogue,
  fiche produit, studio photo et atelier informatique. JSON de preuve joints.

Les captures sont dans `recette/`, dont `demo-catalogue-public.jpg` et
`demo-story.jpg`. Les huit PNG et leurs prompts sont dans
`apps/antsia_ga/public/demo-media/animation-20261020/manifest.json`.

## Périmètre de livraison et limites

La copie de livraison part du frontend publié session-reload et du backend démo
stable audio-gesture ; seuls les ajouts d'animation, le raccord catalogue et la
validation SSR sont superposés. Le WIP de services.ts, les schémas et autres
travaux voisins sont exclus. Aucun .env n'est modifié. Les modifications réelles
restent dans le répertoire servi, sans changement de branche ni staging global.
Aucun commit applicatif ni push supplémentaire n'a été effectué pour cette animation.

Le verify global de l'arbre partagé n'est pas annoncé vert : la suite élargie
locale a rencontré un échec d'appel commercial voisin et le cliquet du catalogue
de déploiement trouve une application mobile WIP absente de son catalogue.
Les mêmes suites ciblées du paquet de livraison passent sur sa base stable.
Les preuves historiques des design systems ne servent pas de validation à ces ajouts.

Les stories expirent ; aucune récurrence n'est programmée. Les règles normales
sur les pages communautaires restent en place. Aucun paiement, commande,
réservation ou envoi à une personne réelle n'est simulé.
