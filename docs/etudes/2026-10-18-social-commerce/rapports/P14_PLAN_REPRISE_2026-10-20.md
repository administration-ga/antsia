# P14 — Reprise du 20 octobre 2026

Demande : continuer les services ANTSIA–PRO.GA sans relancer les vérifications et préserver l’autre session. Le P14 initial et P14B existent déjà : cette reprise corrige leurs engagements et leurs reprises, sans reconstruire les trois parcours.

## Périmètre et réservations

- Coordination : ce plan, bilan daté, cycle de vie `shops/serviceLifecycle.ts` et tests dédiés. Conservation d’un engagement tant que PRO.GA n’en a pas prouvé la terminaison ; un âge local ou une absence de transport ne prouve pas l’absence d’effet.
- Backend ANTSIA : `shops/{serviceAccess,serviceFlow,serviceTables,serviceRules,serviceActions,services}.ts`, clôture d’intention sans effet et raccords strictement additifs de données/quotas. Recherche privée par `clientRequestId`, reprise des mêmes octets sous un bail lié à la session courante, relecture P10 et pièces avant émission. Tests écrits seulement.
- Interface ANTSIA : `components/services/`, helper de reprise et locales Services. Aucune remise à zéro de la charte ; conserver les classes actuelles du designer. Intentions isolées par personne/réseau, jamais de besoin, nom, note ou pièces en stockage persistant. Panne → formulaire figé/recherche ; recharge → retrouver l’intention ; absence certaine → clôture serveur de l’ancienne clé avant une nouvelle demande. Accord rattaché à la révision et au créneau, horloge du devis et invalidation des fenêtres de créneaux.
- PRO.GA : garde des paiements de services et devis ANTSIA, projection de l’acceptation authentifiée et présentation dans les vraies surfaces devis/commandes. Les tables d’acceptation existantes restent l’autorité ; une validation employé n’est pas une preuve client. Confirmation d’un rendez-vous sous retenue encore vivante, révisions strictement croissantes et recherche de la version courante par têtes indexées.

Les autres travaux (chartes/primitives, pont de session, IDN et déconnexion, DIASPORALE, P10, P12/P13 et P15) sont préservés. Aucun changement de branche, nettoyage, commit ou publication. Les services locaux déjà lancés restent sous leur contrôle habituel : aucun redémarrage ni nouvel appel de recette.

## Contrats d’interface de la reprise

`services.findByClientRequestId({networkId,clientRequestId})` renvoie une demande du même propriétaire/réseau, une absence constatée ou une clé clôturée. `services.stopClientIntent({networkId,clientRequestId})` retrouve d’abord une commande existante ; sinon sa clôture atomique interdit toute admission ultérieure sous cette clé. Cette opération ne supprime aucune commande et n’appelle pas PRO.GA. Une indisponibilité ne vaut jamais absence.

Le renvoi utilise `serviceActions.retry` après consultation corrélée. Le corps, la clé, le consentement d’origine et l’expiration restent inchangés ; seule la session du bail courant est recapturée et relue avant/après transport. Les droits catalogue et P10 requis pour un nouvel envoi restent vérifiés. Après expiration ou purge du corps : suivi seulement, aucun corps recomposé arbitrairement.

Les pièces choisies restent dans la conversation sous leurs gardes d’accès/modération/délivrance ; aucune extension de P10 ni envoi de fichier à PRO.GA. Les références temporaires nécessaires à leur relecture s’expurgent avec les corps et à l’effacement.

## Limites conservées

Pas d’acompte ni de paiement de service activé, pas d’état payé fabriqué. Les avis client P14B restent des traces après lecture ; aucun job ne fabrique une authentification fraîche. Un véritable réveil asynchrone demande un contrat de suivi dédié et une recette croisée, hors de ces corrections des engagements.

Aucun codegen, test, typage, lint, audit automatisé, build, navigateur, transaction, appel HTTP de recette, installation, secret ou fichier `.env*` modifié. La compilation normale des processus déjà actifs n’est pas présentée comme une vérification. Bilan final en sources, preuves et recette différées.
