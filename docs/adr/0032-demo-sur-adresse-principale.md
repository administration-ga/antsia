# ADR-0032 — Démonstration sous l’adresse principale

Date : 21 octobre 2026. Décision : acceptée à la demande du propriétaire.

## Contexte

Les comptes fictifs doivent être accessibles depuis `https://antsia.vercel.app/`, et l’adresse publique `antsia-demo.vercel.app` doit disparaître. Le compte réel, les données de démonstration et les changements de la session parallèle doivent être préservés.

## Décision

L’application principale propose une entrée `/demo`. Cette zone sert un second build Next du même source, avec `basePath=/demo`, au travers d’un relais serveur vers un déploiement Vercel protégé. Aucun iframe ni nouveau domaine public n’est nécessaire. L’ancienne adresse est retirée de la configuration Vercel et doit répondre HTTP 404. Le déploiement technique enfant reste nécessaire : supprimer ce projet casserait `/demo`.

Le backend principal reste `diligent-avocet-585` et le backend de démonstration reste `vivid-hedgehog-655`. Aucun code backend ni graine de données n’est déployé par ce changement. Seul le `SITE_URL` du backend de démonstration rejoint l’origine principale.

Le build principal fixe l’origine technique immuable de l’enfant. Il remplace les en-têtes privés entrants par ses propres valeurs et ne transmet que les cookies démo attendus. L’enfant refuse les documents et API sans enveloppe privée valide ; les protections Vercel restent actives. Les secrets du relais restent côté serveur, hors sources, paramètres publics, preuves et captures.

Les routes Next restent logiques pour `Link`, le routeur et les correspondances. Les navigations document, appels HTTP, partages et médias publics utilisent leur chemin physique préfixé. Le transport d’authentification accepte les deux formes exactes de `/api/auth`, car Next retire le `basePath` avant le Route Handler ; cette admission conserve les gardes d’origine et de session.

Les cookies HTTP de démonstration ont des noms distincts. Les sessions SDK, l’apparence, le panier et les autres stockages personnels passent par des vues nommées `antsia-demo-scope:`. Aucune migration du stockage principal n’est effectuée. Les sorties de session purgent leur propre zone. Le changement de zone est une navigation document complète. Cette séparation logique ne constitue pas une frontière de sécurité entre origines : les deux zones partagent la même origine navigateur.

Le bandeau « Mode démo » reste dans le flux. Sa hauteur réelle est mesurée au montage et par `ResizeObserver`, puis retranchée de la hauteur des espaces de travail bornés. La mesure utilise une propriété CSS ciblée, sans état React ni remontage du composeur. Le nettoyage restaure seulement cette propriété ; le build principal conserve sa géométrie précédente.

## Livraison et conséquences

La publication fige les derniers fichiers déjà publiés, puis ajoute uniquement les chemins de ce correctif. Les modifications de pagination des connexions de l’autre session sont conservées. Les branches de livraison utilisent un index Git séparé ; la branche et l’index de travail partagés ne changent pas.

Publier une nouvelle version enfant impose de republier ensuite le relais principal avec sa nouvelle origine immuable. L’activation du principal vérifie la version publique précédente afin de refuser l’écrasement silencieux d’une publication parallèle. Ne pas promouvoir l’enfant vers l’ancien domaine.

L’essai initial par iframe tierce a été abandonné après refus des cookies par Chrome. Le relais sous chemin évite cette dépendance et conserve une authentification propre à la démo.

## Preuves

Voir le [rapport de livraison et de recette](../recette/demo-adresse-principale-2026-10-21/rapport.md). Les captures restent locales et les preuves versionnées excluent les secrets, cookies et contenus de compte. Les contrôles aux trois dimensions Chrome ne constituent pas une recette sur appareils physiques.
