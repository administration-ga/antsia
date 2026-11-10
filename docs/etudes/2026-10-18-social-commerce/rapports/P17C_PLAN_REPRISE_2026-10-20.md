# P17c — Périmètre de la reprise du 20 octobre 2026

Demande : poursuivre les appels natifs et notifications système, préserver les autres sessions,
ne relancer aucune vérification. Base Git : `c4d36f3`, arbre partagé incluant P14–P17b non
commités. [P17a](P17A_AUDIT_NATIF.md), [P17b](P17B_REPRISE_2026-10-20.md),
[prompt P17](../prompts/P17_MOBILE_NATIF.md).

## Découpage et propriété

| Exécutant | Sources réservées |
|---|---|
| Backend | `convex/modules/calls/`, `convex/modules/notifications/` : arbitrage par appareil/session, ouverture ciblée, jeton natif, registre et transport ; ajout `apns_voip` au contrat de fournisseur du domaine |
| Module OS | `apps/antsia_mobile/modules/antsia-call-system/`, `plugins/with-native-calls.cjs`, adaptation conditionnelle `app.config.ts` : Swift PushKit/CallKit et Kotlin Firebase/Core-Telecom/notification/service |
| Hôte média | `apps/antsia_mobile/src/calls/`, gestes audio/vidéo dans la conversation, suspension des vidéos de publication pendant les appels |
| Coordination | Contrat pur partagé et références API typées, cycle de session et montage racine, dépendances/catalogue, langues, export des données, cliquets et rapports |

Aucun fichier de session Web, `persons.ts`, `memberships.ts`, charte CSS ou tranche DIASPORALE
n'est réservé. Le manifeste, le lockfile et le schéma ne sont pas réinitialisés. Aucun changement
de branche, installation, génération, test, typage, lint, build, serveur ou recette n'est lancé.

## Choix fermés pour cette candidate source

- Module Expo local, propre à ANTSIA, sans reprise de code d'un autre produit. Interfaces fondées
  sur les SDK officiels ; aucune clé, configuration Firebase ou identité d'app copiée.
- Un vrai UUID aléatoire par appel système ; push ne contenant que références, liaison opaque
  et échéance. Noms et médias se relisent uniquement après session/destinataire/appareil admis.
- iOS : PushKit déclenche immédiatement le rapport CallKit natif avant JavaScript ; pas de
  second push VoIP d'annulation. La fin se relit sur le canal d'appel, avec expiration native
  indépendante de JavaScript comme filet. La contrainte M5 historique de P17a est précisée.
- Android : FCM data seule haute priorité, traitement natif, notification d'appel et Core-Telecom.
  Aucune permission microphone/caméra demandée à la seule arrivée d'une sonnerie ; pas de
  capture micro par le service de sonnerie. Plein écran soumis à l'autorisation réelle.
- Un seul appareil/session gagne l'entrée ; les portes et jetons Web existants respectent
  aussi cette propriété. Une simple porte native supplémentaire ne suffit pas à fermer un bypass.
- Le cycle d'appel demeure distinct du cycle d'écran. Écrans masqués en arrière-plan ; un appel
  admis conserve une autorité mémoire bornée à sa vraie session, relue côté serveur. Toute
  révocation, sortie ou échéance ferme les pistes avant les transports de nettoyage.
- SecureStore reste `WHEN_UNLOCKED_THIS_DEVICE_ONLY`. Aucune ouverture implicite du trousseau
  verrouillé, exception de session, capacité d'accès avant déverrouillage ou choix AFU ajouté.
- Budget et préférences sociales d'appel conservés. Le choix D6 de plafond séparé reste ouvert.
- Appels natifs désactivés en l'absence de capacités/registre/identités/configuration propriétaire.
  Les nouvelles opérations commerciales demeurent sous les fermetures P16.

## Limites et preuves

Les changements sont produits en sources et les scénarios automatiques sont écrits seulement.
La compatibilité Expo57/LiveKit/plugins, les compilations Swift/Kotlin, la livraison push, le
plein écran, le réveil et la réponse appareil verrouillé ne sont pas prouvés. Aucun paramètre
du propriétaire ni identifiant Apple/Google/EAS/Firebase n'est créé. P17d n'est pas exécuté.

Documentation consultée : [Apple PushKit](https://developer.apple.com/documentation/pushkit/responding-to-voip-notifications-from-pushkit),
[Core-Telecom](https://developer.android.com/develop/connectivity/telecom/voip-app/telecom),
[FGS Android](https://developer.android.com/develop/background-work/services/fgs/service-types),
[FCM priorité](https://firebase.google.com/docs/cloud-messaging/android-message-priority),
[Expo Modules](https://docs.expo.dev/modules/module-api/),
[LiveKit Expo](https://docs.livekit.io/transport/sdk-platforms/expo/).
