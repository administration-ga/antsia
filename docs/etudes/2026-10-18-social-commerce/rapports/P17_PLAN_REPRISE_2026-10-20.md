# P17 — Périmètre de la reprise du 20 octobre 2026

Demande : continuer le lot téléphone natif, préserver l'autre session, ne pas relancer les
vérifications. Base Git observée : ANTSIA `c4d36f3`, avec les travaux non commités P14–P16,
auth/session, thèmes et autres lots. Aucun changement de branche ni commit applicatif.

L'audit [P17a](P17A_AUDIT_NATIF.md) est déjà présent. La tranche choisie pour cette reprise est
**P17b : première implantation source de la coque, authentification par code, fil et messages**.
Cette reprise n'achève pas les critères de sortie P17b : installation, parité P04/P05 et preuves
physiques restent différées à la demande. P17c/P17d et PRO.GA ne sont pas modifiés.

## Décisions de travail et réservations

| Surface | Choix et propriété de cette reprise |
|---|---|
| Application | `apps/antsia_mobile/`, véritable membre `apps/*`, entrée Expo enregistrée ; pas de maquette Web ou seconde page du site |
| Dépendances | SDK Expo 57 existant dans l'écosystème, React 19.2.7 commun ; ajouts isolés au catalogue racine, aucune installation ni lockfile réécrit |
| Code partagé natif | `packages/social-native/`, contrats purs de configuration, époques, requêtes bornées et sortie ; futur consommateur DIASPORALE possible, aucune application DIASPORALE créée |
| Auth native | Adaptateur du `bearer()` déjà monté, code e-mail/SMS et SecureStore. Aucun cookie copié, greffon Expo serveur ajouté, origine native autorisée ni garde de session détendue |
| Auth parallèle | Aucun changement des fichiers existants auth/settings/session-bridge, `persons.ts` ou `memberships.ts`. IDN natif reste incomplet, expliqué dans l'interface |
| Graphisme | Nouvel export pur `@antsia/ui/themes/antsia-native`, projection des sept CSS actuels. Pas de modification des thèmes/primitives Web voisins |
| Écrans | API typée du moteur : fil, publication, conversations 1:1 existantes, réponse texte ; intentions bornées en mémoire, sans nouveau paiement/service/emploi |
| Sortie | Nouvelle porte native asynchrone dans le paquet partagé ; extension écrite du cliquet existant, porte Web préservée |
| Passation | Présent cadrage, bilan P17b, README du client et liens dans le dossier d'étude |

Trois sous-tâches d'exécution ont été réparties : adaptateur auth/coffre ; écrans et intentions ;
configuration Expo/projection des jetons. Coordination : cycle de session, navigation, intégration,
langues, catalogue et rapports. Aucun sous-agent n'a exécuté de contrôle ou installé de dépendances.

## Choix de l'audit qui restent ouverts

- D1/D2 : emplacement et SDK retenus pour cette candidate source, sans preuve Metro, React
  ou appareil. Pas de migration Expo 58 ni deuxième React ajoutés.
- D3 : aucune duplication de code natif d'un autre produit ; lectures des versions seulement.
  Les adaptateurs sont propres au moteur et au protocole SDK documenté. Aucune autorisation
  de licence d'un autre dépôt n'est déduite.
- D4 : le paquet pur prépare la mutualisation ; aucun ordre de livraison DIASPORALE/mobile
  ni parité avec ce futur client n'est déclaré acquis.
- D5/D6 : intégrations CallKit/PushKit/Core-Telecom et budget des appels restent P17c.
- D7 : stockage limité à l'appareil déverrouillé pour cette tranche sans appels en arrière-plan.
  Aucune décision `AFTER_FIRST_UNLOCK`, biométrie ou réveil n'est prise.
- D8 : schéma et identifiants restent des entrées propriétaire sans valeur par défaut.

Les critères de recette et les commandes historiques ne sont pas rejoués pour clore ce lot.
