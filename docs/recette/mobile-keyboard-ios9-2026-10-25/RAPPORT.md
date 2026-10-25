# ANTSIA iOS9 — recherche avec clavier logiciel

Recette du 25 octobre 2026, vers 02:00–02:05 Europe/Paris. **Les huit contrôles
de cette recette sont réussis dans le simulateur.** La vérification globale
répartie est terminée avec code 0. Le build 0.1.0 (9) est
approuvé pour les tests externes et disponible dans TestFlight.

## Changement réel et version contrôlée

Les recherches de boutique, de produits/services et d’associations regroupent
désormais le champ et leur bouton Rechercher sur une même rangée. Le champ natif
s’étire à la hauteur du bouton ; son rectangle maintenu visible par iOS couvre
ainsi également l’action. Le bouton et la touche Rechercher du clavier appellent
le même traitement existant. Les libellés, gardes, requêtes et opérations métier
sont conservés. Le champ ordinaire, sans action associée, garde son rendu antérieur.

Le contrôle porte sur le JavaScript du build9 dans le simulateur **ANTSIA iPhone
18 Pro, iOS27.0**, avec clavier logiciel AZERTY et capture du clavier Mac désactivée.
L’empreinte JavaScript et celle du manifeste source sont consignées dans
[checks.json](checks.json). La capture `01-initial-administration-build8` conserve
l’état initial avant cette recette ; elle ne constitue pas une preuve du build9.

## Huit contrôles observés

| Contrôle | Observation et preuves PNG/TXT |
| --- | --- |
| Clavier logiciel ouvert | Clavier AZERTY réellement visible, notamment `05`, `06`, `08`, `11`, `13` et `15`. |
| Champ visible avec le clavier | Champ de recherche accessible au-dessus du clavier dans la vitrine et les deux annuaires : `05`, `08`, `13`, `15`. |
| Bouton écran visible avec le clavier | Rechercher est à droite du champ et reste visible : `08`, `13`, `15`. |
| Bouton écran utilisable en un appui | Le journal de recette constate un seul appui pour poisson, diagnostic et association introuvable : `08`→`09`, `13`→`14`, `15`→`16`. |
| Résultats et fermeture après le bouton écran | Poisson fumé à 3 500 XAF, diagnostic à 5 000 XAF et annuaire vide ; clavier fermé après soumission. Résultats dans les arbres natifs `09`, `14`, `16`, captures de l’état après recherche associées. |
| Touche Rechercher du clavier | Riz à 6 500 XAF et dépannage d’imprimante à 6 000 XAF, clavier fermé : `06`→`07` et `11`→`12`. |
| Rubrique conservée au retour | Page Jeunes de Lambaréné ouverte puis retour sur Associations sélectionné : `17`→`18`→`19`. |
| Message d’annuaire vide | Recherche « introuvable » : « Aucune association trouvée dans cet annuaire. » visible, sans clavier : `15`→`16`. |

Les PNG montrent le viewport réellement affiché ; les TXT incluent aussi des cartes
sous la zone visible. Les prix et résultats hors viewport sont donc attestés par
les arbres d’accessibilité, sans prétendre que chaque carte a été inspectée visuellement.
Les horodatages des étapes figurent dans [steps.json](steps.json). Les 18 empreintes
de preuves répertoriées dans `checks.json` ont été recalculées et correspondent.

## État final, préservation et limites

Administration est restauré sur **Mairie Démo**, avec statut Officiel, 17 abonnés,
une publication et droits administrateur après actualisation (`20`→`22`). Le compte
n’a pas été changé pendant cette recette. Les observations consignées ne rapportent
aucune publication, modification d’adhésion ou opération commerciale.

Cette recette est limitée au simulateur ; elle ne valide pas un iPhone physique,
Android, toutes les tailles d’écran ou le texte agrandi. Le cas particulier où
**Mes associations est déjà rempli n’a pas été recréé** : seul l’annuaire vide du
profil courant est vérifié ici. Les vérifications antérieures restent distinctes.

## Vérification et signature

La chaîne `bun run verify` a terminé avec code 0, sur 2 123 entrées source
épinglées et recontrôlées après exécution. Le codegen local en mode dry-run et le
test original des 5 000 abonnés ont réussi sur le Mac, avec son délai initial de
360 secondes ; ce seul test était déporté du contrôle distant. Typages, autres
tests, cliquets et onze lints ont terminé sans erreur. Aucune assertion ni aucun
délai affaibli. Le journal distant a été récupéré partiellement : les sorties
finales et la concordance des sources sont conservées, sans reprendre de décompte
historique de tests. Voir [verification.json](verification.json).

L’archive iPhone 0.1.0 (9) est signée et sa signature vérifiée. Son JavaScript est
identique à la recette simulateur ; exécutable natif et symboles conservés,
dépendances natives inchangées. L’identité et le profil Apple existants ont été
réutilisés ; le trousseau temporaire est nettoyé. Voir
[ipa-validation.json](ipa-validation.json).

## Audit des preuves avant publication

Les 22 captures PNG ont été inspectées et les 22 TXT ainsi que les deux JSON relus
et scannés. Aucun secret, jeton ou identifiant de session, en-tête d’authentification,
e-mail/téléphone réel ou donnée personnelle non fictive n’a été repéré. Les contenus
sont ceux de la démonstration et leurs illustrations. Aucune expurgation ou exclusion
n’est nécessaire dans ce dossier. Aucun log privé n’a été copié pour ce rapport.

## Publication TestFlight

Le 25 octobre 2026, Apple confirme `VALID`, `APPROVED` et `IN_BETA_TESTING`
pour le build 9. Le groupe public conserve 9/8/7/6/4, le build 5 reste hors
diffusion. Notification automatique active pour le build 9 ; aucune invitation
renvoyée ni aucun testeur modifié.

[TestFlight ANTSIA](https://testflight.apple.com/join/mqWat3mu) ;
[PR #85 en brouillon](https://github.com/administration-ga/antsia/pull/85).
Preuve : [publication.json](publication.json). Aucun déploiement Web/backend ni
aucune migration, graine ou modification des données métier.
