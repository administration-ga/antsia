# ANTSIA — écrans métier natifs et Nouvel arrivant, build7

Version0.1.0(7), bundle ga.antsia.mobile, iOS16.4 minimum. IPA signé, vérifié et reçu
par Apple le24/10/2026. **Approuvé et disponible pour les tests externes** à22:06Paris :
VALID, APPROVED, IN_BETA_TESTING et notification automatique active. Le groupe contient
7,6 et4 ;5 reste hors diffusion. Preuves : `apple-status.json` et `apple-release.json`.

## Changements réels

- Admission partagée entre connexion initiale et contrôle HTTP frais : un compte
  authentifié sans adhésion affiche l’inscription à terminer ; attente/suspension
  restent hors des écrans membres. Aucun profil, consentement ou adhésion créé.
- Navigation Découvrir et retour borné entre fil/publication, page, boutique et offre.
  Les liens métier restent internes ; aucune nouvelle forme de lien de session acceptée.
- Boutiques possédées/annuaire, recherche produits et services, sélection fictive du
  même moteur Web ; vitrines avec présentation, horaires, collections, filtres, tri,
  catalogue paginé et publications. Fiches avec images, prix XAF, variantes et
  disponibilité indicative ; informations de service lorsque le serveur les expose.
- Associations : recherche paginée, pages gérées, présentation, médias, compteurs,
  publications. Suivi au seul geste explicite, gardé et corrélé au sujet courant.
- Publications : page et offre relues par les API serveur existantes. Les images
  relatives ne se résolvent que dans l’espace public `/demo-media/` validé.
- Opérations fictives fermées comme sur le Web. Aucune vente, paiement, demande
  de devis ou réservation simulée. Les opérations réelles autorisées/gestion avancée
  ont une continuation explicite sur le site, sans transfert du jeton natif.

## Vérification

`checks.json` : codegen local3260 en dry-run et typage Convex réussis ; typage
mobile/contrats et du contexte épinglé réussis ; 172 tests mobiles +94 contrats.
Lint mobile sans erreur,37 avertissements préexistants ; nouveaux écrans sans
avertissement. Aucun verify global attribué à cette tranche.

`observations.json` distingue les essais réels dans le simulateur des points restants.
Le JavaScript exact de l’IPA7 final a été installé sur une coque native simulateur
compatible, sans effacer le conteneur. Il ne s’agit pas de l’IPA appareil lancé sur Mac.
La navigation finale à quatre onglets s’affiche correctement. La boutique, ses12produits
de première fenêtre, le répertoire de services, les10prestations Atelier Tech et une
fiche diagnostic avec image/5000XAF ont été constatés. L’association affiche sa
présentation, sa publication et les droits du rôle courant, sans action de suivi.

| Profil | Contrôle constaté |
|---|---|
| Nouvel arrivant | Notice neutre finale vérifiée sur le JS signé7, sans accès membre ni erreur de session ; sortie de sa seule session démo. Preuves79–81 de la recette dédiée. |
| Membre | Connexion/fil, page et boutique Atelier Tech dans Mes activités. |
| Membre vérifié | Connexion/fil, page et boutique Studio Objectif dans Mes activités. |
| Commerçant | Connexion/fil, boutique possédée, catalogue et fiche produit avec image/prix. |
| Association | Connexion/fil, page Jeunes possédée, rôle administrateur, présentation/publication. |
| Presse | Connexion/fil, page média Gabon Actu, badge Vérifié, rôle administrateur/publication. |
| Administration | Connexion/fil, page Mairie, badge Officiel, rôle administrateur/publication. |
| Modération | Connexion/fil et activités propres vérifiés sur7, aucune page/boutique héritée du profil précédent ; sortie de sa seule session démo. Preuves71–77 de la recette dédiée. |

Le Mac a été déverrouillé et la recette a repris après les premières interruptions.
La neutralité visuelle finale du Nouvel arrivant, les gestes de recherche/tri/pagination
et le rôle Modération ne sont pas annoncés comme vérifiés. Certaines commandes de
contrôle Cua ont échoué (`noWindowsAvailable`/identifiants éphémères) ; ce résultat
n’établit pas un défaut de ces fonctions dans l’application. Aucun test physique iPhone
TestFlight7 n’est annoncé.

À la demande humaine de coordination, le simulateur a été libéré pour le chat de recette
dédié : profil démo Administration ouvert sur Mairie Démo, onglet Publications. Aucune
manipulation UI supplémentaire par cette tranche après la passation ; sa session démo
courante est laissée au repreneur, les précédentes ont été fermées individuellement.

Expo doctor conserve les trois diagnostics de la base publiée : dépendances de
plugin déclarées directement, pairs Web react-dom des paquets partagés, versions
patch Expo/React. Aucune dépendance native n’a été modifiée dans ce lot. La compilation
Release et la signature finale ont réussi avec ces mêmes versions que le build6.

## Livraison et préservation

Contexte de compilation épinglé sur ANTSIA1193b087fe4206da81dcdb7d6ff0aca8214f25ee et
DIASPORALE367c2bd3ca9dfb59baaae0d32bce44dafc911d36,57 fichiers explicitement superposés.
Le manifeste décrit les ajustements de libellés avant la phase de bundle finale.
`ipa-validation.json` conserve les empreintes, l’identité, le cycle UIScene et la
vérification de signature. IPA et symboles sont conservés hors des caches retirés.

Le quota Expo distant était épuisé. Une première compilation locale a manqué
d’espace ; la reprise incrémentale signée a réussi après nettoyage de téléchargements
inactifs et régénérables. Cache compilé terminé supprimé après vérification de l’IPA
et sauvegarde des symboles ; trousseau temporaire retiré en préservant les autres.

Aucune graine ni commande backend de production dans cette tranche. Aucun contenu,
relation ou donnée métier écrit pendant la recette ; seules les connexions et sorties
normales des sessions démo de recette ont été utilisées. Package/lock racine inchangés
par cette tranche, aucun staging/commit applicatif, push ou changement de branche.
Les travaux Web/DIASPORALE parallèles sont exclus du binaire par la préparation filtrée.

Bêta publique existante : https://testflight.apple.com/join/mqWat3mu.

## Mémoire et clôture

Mémoire partagée ANTSIA actualisée : note native dédiée, sections natives du contexte
et de l’avancement, journal auto. Commit de la seule note tenté, non confirmé après
le délai local ; aucun fichier partagé déjà modifié n’a été inclus dans ce commit.
La livraison Apple et les artefacts signés sont indépendants de ce blocage du vault.
Réservation des sources natives et du simulateur libérée ; recette complémentaire
reprise dans son chat dédié. Aucun contrôle physique ou gestuel restant n’est déclaré
réussi par cette tranche.

## Clôture des contrôles demandés — 24/10/2026,22:42Paris

La reprise coordonnée s’est achevée avec un seul pilote du simulateur. Modération ouvre
son accueil et ne récupère aucune activité gérée du profil précédent. Le Nouvel arrivant
affiche la notice neutre d’inscription/adhésion à terminer, sans erreur de session ni
écran membre. Les sessions démo de ces essais ont été fermées individuellement.

**État final confirmé : Administration → Mairie Démo → Publications**, badge officiel,
rôle administrateur et publication existante chargée. La session démo Administration
reste ouverte comme demandé. Le build0.1.0(7) et le JS exact de l’IPA signé ont été relus.

Preuves et recette complémentaire : `../ios-build7-demo-acceptance-2026-10-24/`,
notamment72/74,80 et102. Les réserves antérieures sur ces trois parcours sont levées.
Les recherches/tris/pagination sont également documentés dans cette recette distincte ;
les trois gênes d’interface qu’elle relève restent consignées sans correctif source.
Aucune donnée métier ni source applicative modifiée par cette reprise. Pas de nouvel
export, build, déploiement ou changement de configuration. La preuve porte sur le
simulateur, sans essai physique d’iPhone supplémentaire.
