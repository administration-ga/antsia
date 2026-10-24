# Recette du build 7 iOS — comptes de démonstration

Date : 24 octobre 2026. État : **recette demandée terminée, avec trois observations ergonomiques**. Les huit profils ont été parcourus et Administration restauré après actualisation.

## Version et périmètre

- Simulateur **ANTSIA iPhone 18 Pro**, iOS 27.0, UDID `D1C99CD5-0680-4D59-88D5-1EC013CBEF01`.
- Application `ga.antsia.mobile`, version `0.1.0 (7)` ; coque native compatible et JavaScript identique à celui de l’IPA 7 signé. SHA-256 du bundle : `b522b2ed670eb99130c816f8249259f6747aff51c731612b1e7ab2f797753919`.
- Gestes effectués par l’interface native : ouverture des comptes de démonstration, changement de profil, lecture, recherche, filtres, tri et pagination.
- Aucune graine exécutée ; aucune commande, paiement, demande de devis, publication, modification de page ou modification de suivi effectuée. Aucune source applicative modifiée.
- Les captures PNG montrent le viewport réellement affiché. Les arbres d’accessibilité TXT contiennent également les cartes chargées sous la zone visible ; ils ne prouvent pas l’inspection visuelle de chaque carte.
- La validation d’un iPhone physique et des transactions reste hors de ce périmètre.

## Résultats observés dans ce chat

| Parcours | Résultat | Preuves |
| --- | --- | --- |
| Administration initiale | Mairie Démo, Institution / Officiel, administrateur, gestion proposée et publication chargée | `01-administration-page.txt` et PNG |
| Administration → Commerçant | Fermeture de session de démonstration, sélecteur puis accueil du compte Commerçant | `02` à `05` |
| Offre de riz | Détail natif, image, prix **6 500 XAF**, opérations fictives fermées | `06` et `07` |
| Vitrine Épicerie Moussavou | Identité, présentation, horaires, statut de gestionnaire, première fenêtre de 12 produits | `08`, `09b` |
| Recherche « riz » | Après fermeture du clavier, seul le produit correspondant reste dans le catalogue | `10`, `11b`, `12` |
| Prix croissant | Première fenêtre : 1 000, 1 000, 1 200, 1 500, 1 500, 2 000, 2 000, 2 500, 3 500, 4 000, 6 500, 7 500 XAF | `15`, `catalogue-checks.json` |
| Pagination | Page suivante : panier en raphia à 8 500 XAF, retour possible, aucune page suivante ; retour à la première fenêtre réussi | `16`, `17` |
| Prix décroissant | Première fenêtre : 8 500, 7 500, 6 500, 4 000, 3 500, 2 500, 2 000, 2 000, 1 500, 1 500, 1 200, 1 000 XAF | `18`, `19`, `catalogue-checks.json` |
| Filtre Services de l’épicerie | État « Aucun résultat dans cette fenêtre », sans cartes de produits ni erreur | `20` |
| Effacement des filtres | Retour au catalogue par défaut | `21` |
| Mes activités du commerçant | Page et boutique Épicerie Moussavou, aucune Mairie reprise comme activité possédée | `25` |
| Commerçant → Association | Mes activités devient Jeunes de Lambaréné ; aucune boutique Épicerie reprise | `26` à `30` |
| Page Association | Communauté, 17 abonnés, 1 publication, administratrice et gestion proposée, description et pays GA | `31` à `33` |
| Recherche d’association | « Lambaréné » retrouve Jeunes de Lambaréné dans l’annuaire | `36` à `39` |
| Recherche sans correspondance | L’annuaire n’affiche plus de résultat, tandis que Mes associations conserve la page possédée | `40` à `43` |
| Association → Presse | Fermeture de la session puis accueil ; Mes activités affiche Gabon Actu et aucune boutique | `44` à `55` |
| Page Presse | Page Gabon Actu, statut administrateur et gestion proposée, présentation ouverte | `56`, `57` |
| Annuaire Services | Cartes de services chargées, prix fixes et « Sur devis », avertissement des opérations fictives | `59`, `60` |
| Vitrine Atelier Tech depuis Presse | Image et présentation visibles ; dix services et deux publications chargés dans l’arbre d’accessibilité ; aucun statut de gestionnaire étranger | `61`, `62` |
| Recherche de service | Filtre Services et recherche « diagnostic » : seule cette offre reste au catalogue ; les publications de page restent dans leur section | `63` à `66` |
| Détail Diagnostic | Illustration, **5 000 XAF**, disponibilité à confirmer et avertissement des opérations fictives fermées | `67`, `68` |
| Presse → Modération | Accueil chargé ; Mes activités n’affiche aucune page gérée ni boutique, aucune reprise de Gabon Actu | `69` à `75` |
| Modération → Nouvel arrivant | Notice neutre « Terminez votre inscription et votre adhésion pour accéder au réseau. », lien inscription, sortie de ce compte démo ; aucun onglet membre ni erreur de session | `76` à `80` |
| Nouvel arrivant → Membre | Accueil chargé, page et boutique Atelier Tech dans Mes activités ; sa vitrine indique « Vous gérez cette boutique », filtre Tout et recherche vierge | `81` à `87` |
| Membre → Membre vérifié | Accueil chargé, page et boutique Studio Objectif dans Mes activités ; Atelier Tech n’est plus une activité possédée | `88` à `93` |
| Membre vérifié → Administration | Mes activités affiche Mairie et aucune boutique ; page Mairie rouverte sur Publications puis actualisée | `94` à `102` |
| État final conservé | **Administration / Mairie Démo / Publications sélectionné**, Institution · Officiel, 17 abonnés, 1 publication, statut administrateur et suivi existant inchangés après actualisation | `102-etat-final-administration.txt` et PNG |

## Points à corriger ou à préciser

1. **Recherche d’une boutique masquée par le clavier.** Lors de la saisie « riz », le clavier couvre le champ et son bouton situés plus bas dans la vitrine. Le bouton Retour du clavier permet de le fermer ; la recherche fonctionne ensuite. Le défaut concerne l’usage du formulaire au téléphone, pas la sélection des résultats. Observation en direct, avec arbres avant/après ; aucune capture du clavier ouverte n’a été conservée dans ce dossier.
2. **Retour vers Découvrir : l’onglet choisi se perd.** Depuis Mes activités → page Association, le retour affiche Boutiques plutôt que Mes activités (`34`). Même résultat après la page Presse (`58`).
3. **Annuaire d’associations sans message d’absence de résultat.** La recherche `zzrecetteintrouvable` laisse seulement l’en-tête Annuaire ; aucun texte « aucun résultat » ni erreur. Mes associations reste affiché séparément, ce qui est cohérent (`43`).

Ces observations portent sur le binaire testé. Aucun correctif n’a été injecté dans le build signé.

## Incidents de pilotage résolus et limites

- Le clic Membre initial n’avait pas déclenché la transition ; les coordonnées/défilements étaient refusés par l’outil (`noWindowsAvailable`). Après la reprise, les mêmes contrôles d’accessibilité ont permis la connexion Membre et Membre vérifié. Aucun défaut utilisateur de connexion n’est donc retenu sur cette seule base.
- Le Mac s’est verrouillé pendant la recette. L’utilisateur l’a déverrouillé manuellement et la recette a repris ; aucun contournement ni réinstallation. L’état intermédiaire Presse/Atelier Tech des premières notes ne décrit plus l’état final.
- Les huit profils sont maintenant constatés dans ce dossier, indépendamment des essais précédents du lot mobile (`../mobile-business-ios7-2026-10-24/`).
- Le rôle Modération est vérifié comme compte membre, avec son fil et ses activités propres ; aucune action de modération ni console externe n’a été exercée.
- Les sessions de démonstration ont été quittées par leur flux normal uniquement. Aucun geste d’inscription finale, changement de préférence, déconnexion globale ou mutation métier. Il s’agit d’une vérification UI, pas d’un audit exhaustif ni d’un recomptage complet des bases.
- Aucun essai sur iPhone physique ni achat, devis, paiement ou rendez-vous engagé. Les observations ergonomiques restent présentes dans le build 7.
- Le simulateur a été rendu au chat propriétaire après vérification et capture de l’état final. Aucun geste UI supplémentaire de ce chat après `102`.

Le journal horodaté est dans `steps.json`. Les fichiers `scope.json` et `catalogue-checks.json` contiennent le périmètre et les contrôles numériques reproductibles à partir des observations enregistrées.
