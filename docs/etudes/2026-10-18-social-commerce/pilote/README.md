# Dossier de pilote et d'activation maîtrisée — P19, version documentaire

> **Actualisation du 20 octobre 2026 — NO GO d’activation.** Base source ANTSIA `c4d36f3`
> complétée d’un arbre partagé non gelé. Les relevés du 19 octobre ci-dessous sont conservés
> comme historique ; leurs nombres, empreintes, états de session et défauts ne constituent pas
> un inventaire courant. La poursuite P17d → P18 → P19 est autorisée **sans vérifications**,
> sans pilote conduit et sans publication. [Bilan actuel](../rapports/P19_REPRISE_2026-10-20.md).

Le NO GO concerne l’admission d’une candidate **issue de cette reprise**. Il ne qualifie pas
la disponibilité d’une production publiée par une autre session : aucune requête de production
n’a été faite ici. Un verrou fermé en source n’est pas une observation de configuration déployée.

Suite autorisée : les [correctifs automatiques P19](../rapports/P19_CORRECTIFS_AUTOMATIQUES_2026-10-20.md)
traitent les annonces d'état, la documentation machine et la reprise des CV. Le
[signal privé de suivi service](../rapports/P19_AVIS_SERVICES_2026-10-20.md) prolonge DP-39,
sans transfert d'état métier ni authentification fabriquée. Ces sources ne lèvent pas le NO GO :
aucune vérification, configuration, activation ou publication n'est effectuée.

## État actuel et décision préparée

- P14/P15 : reprises de session, d’intention, d’accord, de retrait et de délivrance des CV
  raccordées en source, scénarios écrits seulement.
- P16 : registres source fermés pour les nouvelles admissions automatiques de vitrines,
  paiements, services et candidatures ; PRO.GA ferme aussi toute nouvelle copie de CV.
  Une ancienne politique activée ou une nouvelle valeur de console ne lève pas ces portes.
- P17b/P17c : vraie application `apps/antsia_mobile` et chaînes d’appels système présentes
  en source. Dépendances non résolues dans le lockfile, aucun binaire compilé ni appareil
  éprouvé. P17d prépare le [registre de recette physique](../../../recette/antsia-native-p17d/README.md),
  sans observation acquise ; son format et son éventuel évaluateur ne remplacent pas la recette.
- P18 : corrections natives raccordées en source dans la reprise coordonnée, sans mesure de performance
  ni constat d’accessibilité. Aucune conformité ou latence réussie n’en est déduite.

La [matrice actuelle par capacité](01_VERSIONS_CANDIDATES.md#actualisation-du-20-octobre-2026)
prépare **NO GO** pour l’admission, le pilote utilisateur ou la publication de cette candidate.
Le suivi des engagements existants, leurs retraits, annulations et remboursements gardent leurs
voies privées ; fermer une nouvelle admission n’autorise ni purge ni abandon d’une obligation.
Aucun participant, responsable nominatif, fournisseur ou seuil mesuré n’est désigné ici.

## Historique du dossier du 19 octobre

**19 octobre 2026 · ANTSIA × PRO.GA · rien n'est vérifié, rien n'est ouvert, rien n'est publié.**

Ce dossier exécute la partie documentaire du lot [P19](../prompts/P19_PILOTE.md), sous la décision
du propriétaire du 18/10/2026 : **« Continuer sans vérifier »**. Il prépare la décision ; il ne la
prend pas. La vérification officielle par dépôt, les parcours de recette et le pilote utilisateur
restent **ouverts** : ils sont décrits ici pour être exécutés dès que le propriétaire le demandera.
Bilan du lot : [rapport P19](../rapports/P19_PILOTE.md).

## État historique en une phrase (19 octobre)

Hors P00, P01, P01b, P02 et P06, qui ont des preuves du 18/10 (aujourd'hui en partie périmées par
des modifications ultérieures), **tous les lots P03 à P18b et la conversation contextuelle sont
« présents dans le code, tests écrits, jamais exécutés »** ; le paiement n'a aucun fournisseur ; le
natif n'a aucun code.

## Lire le dossier

| Document | Ce qu'il apporte |
|---|---|
| [01 — Versions candidates](01_VERSIONS_CANDIDATES.md) | A, B, C, D : capacités, cinq verdicts par lot, preuves exactes du 18/10, bloquants, recommandation |
| [02 — Gel et vérification](02_GEL_ET_VERIFICATION.md) | Préalables, inventaires, ordre des commandes ANTSIA et PRO.GA, coordination DIASPORALE, défauts connus K-01 à K-21, critères de sortie |
| [03 — Parcours de recette](03_PARCOURS_DE_RECETTE.md) | Trente-quatre parcours par version, rôles et données de recette, bloqués signalés, fiche de constat |
| [04 — Pilote utilisateur](04_PILOTE_UTILISATEUR.md) | Recrutement consentant, tâches neutres, notes minimisées, mesures ; non conduit |
| [05 — Activation et retour arrière](05_ACTIVATION_ET_RETOUR_ARRIERE.md) | Portes serveur par capacité, ouverture en console ou non, retour arrière sans perte, ordre, indicateurs et seuils |
| [06 — Registre des décisions](06_REGISTRE_DES_DECISIONS.md) | 39 décisions non closes et 7 prérequis, dédupliqués, avec ce qui en dépend et l'effet de chaque option |
| [07 — Dossier de décision](07_DOSSIER_DE_DECISION.md) | Vérifié, non vérifié, bloquants, risques, preuves, inventaires, contrats et empreintes, activation |

Guides, en français, sans promesse d'une capacité non prouvée :

| Guide | Public |
|---|---|
| [Guide du vendeur et du prestataire](guides/GUIDE_VENDEUR.md) | vendeurs, prestataires, équipes |
| [Guide de l'acheteur et du client](guides/GUIDE_ACHETEUR.md) | acheteurs, clients de services |
| [Guide du candidat et de l'employeur](guides/GUIDE_CANDIDAT_EMPLOYEUR.md) | recruteurs PRO.GA, candidats ANTSIA |
| [Procédures de support](guides/PROCEDURES_SUPPORT.md) | support, opérateurs, administrateurs |

Lecture rapide pour décider : **07 → 06 → 01**. Lecture pour exécuter : **02 → 03 → 05**.

## Ce que ce dossier n'a pas fait

Aucune commande de vérification, de génération, de build, de service ou de transaction ; aucun
navigateur ; aucune écriture git ; aucun fichier `.env*` ; aucun sous-agent. Les seules opérations
ont été des lectures : fichiers, `git status` et `git log`, dates de fichiers, empreintes SHA-256
des contrats jumeaux. Une égalité d'octets relevée ici est un inventaire, pas une vérification.

## Règle de mise en ligne

Toute mise en ligne et toute ouverture de capacité exigent une **demande humaine explicite**, puis
une preuve de révision servie et les parcours rejoués sur cette révision. Ce dossier ne vaut pas
cette demande.
