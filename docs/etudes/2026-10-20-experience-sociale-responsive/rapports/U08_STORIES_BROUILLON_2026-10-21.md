# Contrôles connectés — Stories et brouillon Messages

Date : 21 octobre 2026. Publication Web effectuée ; contrôle du vrai brouillon encore en attente d’une relation existante.

## Résultat constaté en production

| Format Chrome | Dimensions | Pause mesurée | Résultat |
|---|---|---|---|
| Téléphone | 390 × 844 | 54,256 s | Même Story, progression inchangée, commande Reprendre visible |
| Tablette | 834 × 1112 | 57,760 s | Même Story, progression inchangée, commande Reprendre visible |
| Ordinateur | 1440 × 1000 | 56,252 s | Même Story, progression inchangée, commande Reprendre visible |

Le passage téléphone → tablette → ordinateur conserve la pause explicite et la progression. Le document est visible pendant les mesures. Reprendre fait revenir la commande Pause, puis la série se termine normalement et retourne au fil. Les Stories disponibles sont des images : aucune preuve de pause d’une vidéo Story ou sur appareil physique n’est annoncée.

Le compte connecté ne possède aucune relation acceptée. Nouveau message affiche le véritable état vide, sans erreur de chargement. Aucun composeur destinataire n’a donc été ouvert ; la conservation d’un vrai brouillon aux trois formats reste à mesurer après préparation d’une relation par le propriétaire. Aucun contact, profil, lien social, conversation ou message n’a été créé pour fabriquer ce contrôle. La session et Nouveau message restent ouverts.

## Corrections publiées

- Le lecteur téléphonique avait une hauteur de zéro et ses commandes se trouvaient hors écran. En navigation adaptative, le portail immersif existant reste désormais monté à toutes les largeurs. La Story et sa pause ne sont plus démontées à la bascule vers le bureau. Le comportement des consommateurs historiques sans opt-in est conservé.
- La lecture des relations utilisait deux paginations natives au sein d’une même requête composée. Convex partage leur journal de pagination. Le client abonne maintenant séparément les côtés low/high par la fonction publique gardée déjà déployée, paginateMineSide ; une page n’est assemblée qu’après les deux réponses. Les générations réseau/personne/authentification et les actions périmées sont bornées.
- Les tests du composeur utilisent le hook réel avec ses deux réponses natives, plutôt qu’une réponse agrégée impossible en production.

Le défaut de géométrie est mesuré avant/après en ligne. Le test du maintien du média échoue avec la source publiée précédente puis passe avec la correction. Le défaut de composition est établi par le moteur Convex : [journal de pagination partagé](https://github.com/get-convex/convex-backend/blob/main/crates/isolate/src/environment/udf/async_syscall.rs#L781-L790). La production n’a pas fourni de trace serveur corrélée à cette erreur : le retour correct de l’état vide est la preuve UI obtenue, pas une recette de contacts peuplés.

## Vérifications

- Codegen local et typages Convex/tests réussis ; 2 829 tests serveur passent.
- Version Web figée : 4 129 tests des fonctions sociales, 763 tests de l’application, 144 cliquets passent. Typage et lint des six paquets requis passent ; avertissements historiques conservés, aucune erreur de lint. Compilation de production locale et Vercel réussie.
- Le verify global de l’arbre partagé s’arrête au catalogue natif : trois variables Expo ajoutées par le travail parallèle ne sont pas encore déclarées au catalogue. Ce périmètre natif est préservé et ne fait pas partie de la version Web figée publiée. Ce verify n’est pas présenté comme vert.
- Console navigateur après recette connectée : zéro avertissement, zéro erreur capturés.

## Livraison et préservation

Source : `70939c53b24d43b2e86e57ccd00d54263b5abc2d`, branche `codex/stories-brouillon-20261021`, poussée.
Version : `stories-draft-20261021-86e8cb32a156d65c`.
Vercel : `dpl_AquvvpCxU58a69Q7ZDAof8Y9Fyax`, READY, production [ANTSIA](https://antsia.vercel.app).

La livraison repart de la dernière publication globale `79e02b5`/`08edc2d08cb9b596` et conserve ses changements. Les 2 431 fichiers techniques ANTSIA du paquet figé correspondent à l’arbre Git livré ; seuls cinq fichiers de ce correctif sont ajoutés au parent. Aucun backend, natif, démo, admin ou DIASPORALE déployé. Aucun fichier d’environnement édité. La branche, HEAD et l’index réels de l’arbre partagé sont conservés. Les captures de la session et du contenu restent locales, hors commit.

Santé publique : HTTP 200, status ok, version exacte, backend configured ; CSP diligent-avocet-585 vérifiée.

## Preuves

- [Mesures sans contenu privé](../../../recette/stories-brouillon-en-ligne-2026-10-21/mesures-sans-contenu-prive.json)
- [Validation](../../../recette/stories-brouillon-en-ligne-2026-10-21/validation.json)
- [Publication](../../../recette/stories-brouillon-en-ligne-2026-10-21/publication.json)

Restant : ouvrir un composeur réel depuis une relation acceptée existante, saisir un texte non envoyé, vérifier son contenu et son focus à 390/834/1440 puis au retour, et restaurer le brouillon antérieur. Ne pas assimiler le champ de recherche destinataire ou les tests automatisés à ce contrôle connecté.
