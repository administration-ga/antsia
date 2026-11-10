# Recette autonome des comptes de démonstration — 21 octobre 2026

Le propriétaire précise qu’il ne dispose pas d’un deuxième compte réel et demande de réaliser les tests avec les comptes de démonstration. La recette entre deux identités réelles est remplacée par cette recette autonome sur https://antsia-demo.vercel.app. Aucun identifiant/PIN demandé au propriétaire.

Version observée : `verification-20261021-demo-070aafd886c4337a`, `dpl_J5YskviFDCg5UTz3DfBzXh6Xwqjg`, backend `vivid-hedgehog-655`. Deux onglets du navigateur intégré ; connexion par les boutons existants et leur vrai parcours OTP. Pas de lecture directe de code, de cookie ou de jeton, pas de fabrication de session ni de changement de configuration.

## Résultat — 01:50–01:53 UTC

1. Awa MBA `@membre.demo` affichée, profil conservé après rechargement puis dans l’autre onglet.
2. Sortie normale d’Awa : deux onglets anonymes ; aucune session Awa ou Jean-Rémy restante.
3. Jean-Rémy NDONG `@verifie.demo` affiché, conservé après reload et visible dans le second onglet. Sujet serveur différent d’Awa.
4. Sortie de Jean-Rémy depuis l’autre onglet : deux écrans anonymes et ses sessions révoquées.
5. Retour à Awa : même sujet qu’au premier passage, nouvelle session, même profil après reload et dans l’autre onglet.
6. Sortie finale : deux onglets anonymes, zéro session Awa/Jean-Rémy, `/fil` redirigé vers `/entrer` sans coque membre.

Les 16 états enregistrés correspondent aux profils attendus, sans avertissement d’authentification, indicateur de sortie incomplète ou warning/error console. L’invitation en attente de Jean-Rémy est une alerte métier, conservée dans les données brutes. Les quatre autres sessions de démonstration sont inchangées à chaque inventaire complet.

Preuves : `ui-summary.json`, `session-comparison.json`, captures/états UI et inventaires de sessions projetés en empreintes. Aucun contenu créé ou supprimé ; antivirus et autres contenus conservés. Aucun changement applicatif, test de code ou publication nécessaire pour cette recette. La production réelle n’est pas utilisée comme démonstration et aucun second compte réel n’y est créé.

Dossier de preuves : `docs/recette/demo-comptes-autonome-2026-10-21/`.
