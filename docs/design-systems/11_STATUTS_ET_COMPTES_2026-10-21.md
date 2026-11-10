# Statuts, chartes et comptes — 21 octobre 2026

## Comparaison avec la référence

Les huit rubriques de l'artifact Claude fourni ont été confrontées au code et aux versions publiées. La feuille commune relue dans l'iframe de la référence contient les sept chartes ; SHA-256 : `a3009b9e2559d2e985bf5ad00923c7354a689d86447d06d918200c93f9845839` (81 217 caractères). Les 392 valeurs fondamentales de palette contrôlées correspondent déjà aux thèmes du dépôt. Le paquet de designs antérieur est présent dans les deux versions publiques : aucun retour général à une ancienne charte n'a été constaté.

Les différences corrigées portent sur les composants communs :

- Statuts : anneaux de 62 px, espacement de 12 px, épaisseur et retrait de 3 px, noms de 11,5 px, initiales de 15 px, bouton d'ajout de 24 px et gradient à 200 degrés.
- Avatars : six variantes décoratives stables, dérivées seulement du nom public, avec tailles d'initiales conformes à la référence. Les photos publiées ont priorité ; une nouvelle adresse est réessayée après l'échec d'une ancienne photo.
- Les sept thèmes affectent ces variantes à leurs rôles existants en clair et sombre. Les autres réseaux conservent leur présentation historique.
- Marque du bandeau membre ramenée de 26 à 22 px ; titre Messages de 22 px via un jeton opt-in.

Les états non vu/vu d'un statut restent des états de lecture. Ils ne donnent aucun badge de confiance. Les badges Officiel, Vérifié, Agent public et Communauté restent calculés par le serveur. La production ne dispose actuellement d'aucun statut tiers accessible : une seule tuile personnelle est donc légitime, avec la photo réelle d'Asted. Aucun statut, compte ou badge n'a été inventé pour remplir la présentation.

## Contrôles des sources

Codegen et typage Convex strict réussis avant les contrôles. 2 184 tests ciblés distincts réussis : 2 074 UI/thèmes, 82 composants sociaux, 13 bandeau membre et 15 cliquets de thème/couleurs/déconnexion. Le dernier correctif remplace une interpolation de nom de jeton par six paires CSS explicites ; les 41 tests concernés et les 15 cliquets repassent.

Typages UI, composants sociaux et application réussis. Lint ciblé : aucune erreur ; trois avertissements existants concernant les images. Le résultat global de tout le travail parallèle n'est pas annoncé vert.

## Périmètre de livraison

Les sources réelles sont modifiées dans le checkout partagé. La démo part de `session-coordination-20261021-2243812195053c44`, avec 22 chemins strictement délimités (17 modifications et cinq ajouts). Une publication parallèle de la navigation adaptative a été détectée avant toute promotion de production : le premier candidat de production, devenu ancien, n'a pas été promu. Le candidat final reprend exactement `social-responsive-20261021-e34875c094de4b4f` et ses 2 071 empreintes publiques, avec les mêmes 22 chemins (18 modifications et quatre ajouts).

Les changements du bandeau membre et du titre Messages sont reportés par remplacement littéral unique. Les 145 autres changements adaptatifs, les 15 fichiers de performance, Next 16.4.2 et les comportements `RingImage`/nouvelle adresse déjà publiés sont conservés. Les manifestes séparent précisément ces deux bases et les candidats.

Le pont de session, la garde de présence, l'antivirus et les contenus de démonstration sont conservés. Aucune modification de backend, d'environnement, de droit ou de contenu social n'est incluse.

## Accès réels disponibles

Inventaire borné à 01:13:49 heure de Paris : une seule personne ANTSIA publiée et un seul utilisateur Better Auth, `Asted @asted`, avec une session non expirée. Le navigateur de production affiche bien ce profil. Aucun second utilisateur ANTSIA authentifié n'est disponible dans les sessions contrôlées. Le formulaire officiel IDN est vide ; aucun code, PIN, jeton ou identité tierce n'est extrait pour contourner cette limite.

La recette de démonstration entre Awa et Jean-Rémy, avec vérification après chaque bascule et révocation des sessions, est décrite dans [le rapport de déconnexion](../32_RECETTE_DECONNEXION_COMPTES_2026-10-21.md). Elle ne constitue pas une preuve de bascule entre deux personnes réelles de production.

## Publication constatée

| Cible | Version | Déploiement |
| --- | --- | --- |
| Production | `stories-design-20261021-7330c9399dbe6b9a` | `dpl_H5NAB7BgouCeb8dNG94k2HsaYqFT` |
| Démo | `stories-design-20261021-b297b082d4ea0827` | `dpl_HBwPPaaSvCHR9fnhiFNtiwHXQk89` |

Les deux builds et typages distants sont réussis ; état READY, projet correct, version exacte, santé HTTP 200 et CSP vérifiés avant promotion. Les domaines canoniques servent ces mêmes versions après promotion. Le premier candidat de production `dpl_6zDxK82stULgJ1NEggyhfwyYBdwP` a été conservé sans promotion, car sa base était devenue ancienne.

Démo : 14 combinaisons de charte et d'apparence vérifiées sur Patrick MOUSSAVOU, sans débordement ; anneaux 62 px, ajout 24 px, marque 22 px et noms 11,5 px constatés. Le lecteur a ouvert les statuts accessibles ; les trois anneaux tiers sont devenus « vus », sur fond de bordure neutre, avec initiales et contenu conservés. Les préférences Gaboma/Clair ont été rétablies.

La recette de connexion de cette nouvelle version comprend 13 états UI : sortie de Patrick, Awa avec rechargement, sortie, Jean-Rémy avec rechargement, sortie, retour à Awa dans deux onglets, puis sortie depuis le second. Chaque profil attendu correspond ; les deux onglets finissent anonymes et `/fil` revient à `/entrer`. Zéro avertissement d'authentification, zéro warning/error console et aucun indicateur de sortie incomplète.

Production authentifiée : les 14 combinaisons sont également constatées sur `Asted @asted`, avec photo décodée de 1 024 px, anneau 62 px, ajout 24 px et marque 22 px. Les échantillons de la rafale initiale qui observaient une application intermédiaire de préférence ont été conservés séparément ; la matrice finale ne retient que les thèmes effectivement appliqués et deux confirmations séparées. Les préférences Gaboma/Clair et le même profil/photo sont conservés après un rechargement complet du nouveau déploiement. Aucun avertissement d'authentification ni warning/error console pendant ces contrôles.

La sortie réelle d'Asted a ensuite été exécutée sur ce déploiement. Le navigateur revient à `/entrer`, sans profil ni outil membre, sans indicateur de sortie incomplète, alerte de session ni warning/error console. Inventaire serveur borné complet : une session non expirée avant la sortie à 23:35:16 UTC, zéro après à 23:35:39 UTC. L'empreinte de session initiale n'est plus présente. Aucun autre compte ou session n'a été supprimé directement : la révocation passe par la déconnexion normale de l'application.

L'accès direct à `/fil` après cette sortie revient aussi à `/entrer`, sans reprise du profil précédent. Les quatre phases de production sont conformes aux profils attendus ; les synthèses UI et serveur sont conservées séparément.

Une nouvelle entrée via le bouton IDN rejoint le serveur officiel et exige un nouveau PIN pour l'identité mémorisée : aucune reprise automatique de la session ANTSIA. Le bouton « Autre compte » ouvre la saisie d'adresse ; le champ a été vidé sans soumission ni lecture de sa valeur préremplie. Le formulaire indépendant est constaté sans alerte. Aucun PIN n'a été saisi. Les preuves IDN ne conservent que les états projetés et le formulaire vide, sans nom civil ni identifiant mémorisé.

La bascule entre deux personnes réelles reste non vérifiée : seul Asted était authentifié dans les accès disponibles. La réussite du cycle de démonstration ne ferme pas cette limite. Aucune tentative de lecture de code/PIN, de fabrication de session ou d'ouverture de la connexion démo en production.

Preuves : `docs/recette/design-et-comptes-2026-10-21/` (mesures, états UI, captures, synthèses, versions et santé). Aucun jeton, PIN ou code dans les preuves.

## Reprise autonome des deux comptes réels — 01:44 Paris

Nouvelle demande d'aller-retour sans participation du propriétaire. Le parcours officiel de production rejoint IDN et demande de nouveau le PIN de l'identité mémorisée. Aucun accès d'authentification utilisable pour les deux comptes n'est disponible dans cette recette. L'onglet IDN déjà ouvert appartient à la session responsive et n'a pas été repris de force. L'ouverture du gestionnaire Chrome a été refusée par la politique du navigateur (protocole interne non autorisé) ; aucun accès indirect ni contournement tenté.

Lecture bornée actuelle de `diligent-avocet-585` à 23:44:06 UTC : un utilisateur ANTSIA, zéro session non expirée, inventaires complets. La santé conserve la version `stories-design-20261021-7330c9399dbe6b9a`. Aucun compte créé, session fabriquée, PIN deviné ou protection modifiée. La recette reste bloquée avant la première nouvelle connexion ; aucun aller-retour de production n'est revendiqué. Preuve projetée : `production-real-account-retry.json`.
