# Application stricte des sept chartes — 20 octobre 2026

## Périmètre et contrat

Toutes les routes d'`apps/antsia_ga`, leurs composants de page et les surfaces du moteur
qu'elles montent. Les sept palettes existantes, leurs corrections de contraste, les cibles
tactiles de 44 px et les gardes d'authentification restent le contrat (ADR-0026/0027,
`docs/22_THEMES_ET_OPTIONS_ANTSIA.md`). Les composants partagés adoptent les nouvelles
valeurs par jetons opt-in afin de préserver les autres chartes du moteur.

## Lots de correction

1. Préférences : distinguer ancien identifiant et absence de préférence ; restituer Gaboma
   pour les anciens identifiants même si l'appareil garde un autre thème ; relire le thème
   du compte dans un îlot privé sur les routes publiques ; écarter les réponses périmées.
2. Primitives : champs 14 px, cartes 24 px et rembourrage 16 px ; supprimer les ombres des
   surfaces ordinaires ; appliquer les contours et les minima tactiles du contrat au kit.
3. Métier : albums, réseau, messagerie, dialogues et confirmations ; raccorder les familles
   d'actions et supprimer les géométries locales qui contournent les jetons.
4. Application : cartes d'entrée, pages publiques, boutiques, catalogue, emploi, services,
   achats/paiement, modération et données ; médias 16 px, personnes rondes, pages 12 px,
   boutons pilule, puces 10 px et variantes de validation/danger/neutre explicites.
5. Vérification : codegen local unique, tests de régression, typages/lints et matrice visuelle.

## Matrice de recette

- Thèmes : Gaboma, Soleil, Forêt, Corail, Lagon, Électrique et Sable.
- Apparence : clair et sombre ; le choix Système suit le navigateur.
- Largeurs : téléphone 390 px, tablette 834 px, bureau 1440 px ; vérifier aussi 320 px.
- Surfaces : entrée/inscription, routes publiques, fil, profil/albums, groupes/pages/évènements,
  messages, boutiques/catalogue/emploi/services, achats, modération, réglages et données.
- Préférences : application immédiate, rechargement, retour du compte sur appareil vierge,
  ancien identifiant, dernier choix concurrent, refus d'enregistrement et sortie de session.
- Contrôler les styles calculés, les débordements, le focus et les dialogues ; une route
  bloquée ou vide ne vaut pas preuve de son état métier rempli.

## Résultats locaux avant publication

**Suite publiée le 20/10/2026 :** les deux sites servent désormais les corrections.
La recette distante, les identifiants des déploiements et les blocages IDN/réseau
de production sont consignés dans
[`24_PUBLICATION_ET_RECETTE_CHARTES_2026-10-20.md`](24_PUBLICATION_ET_RECETTE_CHARTES_2026-10-20.md).
Les résultats ci-dessous décrivent la validation locale qui a précédé cette publication.

Corrections appliquées dans les sources réelles et vérifiées localement le 20 octobre 2026.
Aucune publication ni aucun commit applicatif effectués. La branche partagée et les changements
authentification/DIASPORALE présents au démarrage ont été conservés.

### Pourquoi les chartes n'étaient pas appliquées partout

Les sept feuilles existaient, mais les consommateurs conservaient leurs propres angles,
rembourrages, ombres, contours et variantes de bouton. Les primitives et les écrans métier
contournaient donc une partie du contrat. Le bureau des ADR-0028/0030, déjà présent sur `main`,
n'était pas intégralement présent dans cette branche locale : les adaptations publiées ont été
reprises sans changer la branche partagée.

Le thème du compte avait également deux lacunes : un ancien identifiant était confondu avec
l'absence de préférence, et les pages publiques conservaient seulement le cache de l'appareil.

### Corrections

| Ensemble | Comportement obtenu |
|---|---|
| Sept feuilles et primitives | Cartes 24 px / intérieur 16 px, champs 14 px, médias 16 px, pages 12 px, badges 6 px, puces 10 px et boutons pilule ; contours conditionnels ; ombres ordinaires supprimées. |
| Fil et bureau | Présentation des publications des ADR-0028/0030, rail et sélecteur de thème commun ; une seule sélection de thème dans les réglages ; bouton d'actualité réellement 44 × 44 px. |
| Surfaces métier | Profil/albums, groupes/pages/évènements, messagerie, conférences, commerce, emploi/services, données et modération raccordés aux jetons ; validation verte, danger rouge et annulation grise. |
| Préférence du compte | Les six identifiants historiques donnent Gaboma ; absence/inconnu restent distincts ; dernier choix concurrent conservé, refus signalé, réponse périmée fermée après sortie ou démontage. |
| Pages publiques | Îlot privé de lecture du thème, sans données privées dans le rendu serveur ; requête sans cache, annulable et bornée ; aucune création de compte ni de session par cet îlot. |
| Autres réseaux | Nouveaux raccords opt-in avec replis historiques. Les tests d'isolation et les 42 jetons opt-in distinguent explicitement ANTSIA de DIASPORALE ; aucune charte DIASPORALE modifiée par ce travail. |

Les corrections de contraste AA déjà arbitrées et documentées dans `docs/22` restent en vigueur.

### Recette navigateur

| Périmètre | Matrice | Résultat final |
|---|---|---|
| 34 destinations, dont 7 commerciales | 7 thèmes × 2 modes × 390 / 834 / 1440 px = **1 428 combinaisons uniques** | Thème et apparence attendus, aucun débordement horizontal ni écran de compilation en erreur. |
| Connexion et inscription | 7 thèmes × 2 modes × 3 formats × 2 vues = **84 combinaisons** | Champs 14 px, cartes 24 px, boutons accessibles et aucune largeur débordante. |
| Composeur de publication | 7 thèmes × 2 modes × 3 formats = **42 combinaisons** | Ouverture/fermeture, champs et dimensions vérifiés ; aucune publication envoyée. |
| Format étroit | 27 destinations à 320 px, Corail sombre ; entrée Lagon clair et notifications Sable sombre | Aucun débordement horizontal. |
| Préférences | Choix immédiat, rechargement, passage à une page publique, mode Système | Corail conservé après rechargement ; page publique au même thème ; Système suit le navigateur sombre. |

Le fil a été contrôlé avec quatre publications locales existantes. La gestion et la vitrine membre
d'une boutique fictive ont été ouvertes ; son catalogue et ses emplois ne contenaient pas d'offre
admissible. La vitrine publique affichait « Contenu indisponible ». Ces états vides ou protégés
valident leur présentation, **pas** une commande, une offre remplie ou une autorisation métier.
Les scénarios d'appareil vierge, d'ancien identifiant, de concurrence, de refus et de sortie sont
également couverts par les tests ; aucun second appareil physique n'a été utilisé.

Les navigations complètes et connexions répétées à cadence de recette ont atteint les budgets de
présence, de thème et de code de démonstration. Leurs gardes ont été conservées ; les connexions
ont repris après renouvellement du budget. Un relevé effectué pendant le chargement d'un nouveau
document public a été repris après affichage de son titre. La synthèse retient le dernier relevé
de chaque combinaison, et les fichiers bruts conservent les essais intermédiaires.

Preuves dans [`recette/chartes-2026-10-20/`](recette/chartes-2026-10-20/) :
[`synthese.json`](recette/chartes-2026-10-20/synthese.json),
[`routes.json`](recette/chartes-2026-10-20/routes.json),
[`entree.json`](recette/chartes-2026-10-20/entree.json),
[`dialogues.json`](recette/chartes-2026-10-20/dialogues.json),
[`etroit.json`](recette/chartes-2026-10-20/etroit.json), styles calculés et captures PNG.

### Vérification du code

**14 083 tests réussis**, 12 typages réussis (moteur/tests et 10 espaces), 9 lints sans erreur
(234 avertissements), compilation Next réussie. Détail :
[`verification.json`](recette/chartes-2026-10-20/verification.json).

Les étapes de `verify` ont toutes été exécutées. Après les 2 631 tests moteur, les 140 cliquets et
les 33 tests des scripts, le typage a repéré l'appel d'une méthode Convex interne : il a été remplacé
par l'option publique `fetch` du constructeur, puis tous les contrôles d'espaces ont repris.
L'inventaire prouve que seuls les quatre nouveaux fichiers frontend concernés avaient changé.
Le contrôle de parité DIASPORALE a ensuite été adapté au contrat opt-in, en conservant ses contrôles
de palette et de contraste ; sa suite complète passe avec 962 tests.

**2 012 fichiers ANTSIA inchangés** pendant les contrôles d'espaces, puis identiques après les
compilations et le retour au développement. Le chemin de types Next généré par le build a été
rétabli automatiquement par le lancement du serveur de développement. Empreinte de l'inventaire :
`bafceffba010d2d1cb8c4bc255428364463c02b0504a3d15382544ea3b98fe02`.
Voir [`sources-verifiees.json`](recette/chartes-2026-10-20/sources-verifiees.json).

La compilation a aussi été exécutée avec les seules origines publiques du moteur local. Le rendu
navigateur reste une preuve de développement : les gardes de la version compilée exigent une origine
HTTPS configurée, et n'ont pas été assouplies pour la faire fonctionner sur HTTP local. Aucune recette
de production, transaction, délivrance média ni communication à un fournisseur externe n'est annoncée.

### Serveurs et passation

DIASPORALE a été mis en pause avec l'accord du propriétaire, puis **relancé sur 3031** : HTTP 200.
Le serveur ANTSIA 3030 est arrêté. Le moteur Convex anonyme local reste disponible sur 3210/3211 ;
aucune commande Convex de production, aucune modification de `.env*`, aucun push ni déploiement.
Les captures de cette recette montrent le code local ; la passation de la PR 17 ne constitue pas
une preuve que ces corrections supplémentaires sont en ligne.
