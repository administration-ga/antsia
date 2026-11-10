# AntsiaCallSystem — sources P17c

Module Expo local, écrit depuis les API Apple, Android et Expo. Aucun code ni
identifiant d'un autre produit n'est dupliqué. Aucun contrôle, build, prebuild,
simulateur ou appareil n'a été exécuté pour cette reprise.

Le pont optionnel `NativeSystemCalls` se ferme dans Expo Go et les anciens binaires.
Le plugin est fermé par défaut : `NATIVE_CALLS_ENABLED=true`, identifiants natifs et
schéma valides, `APNS_ENVIRONMENT=development|production` explicite et fichier
propriétaire existant `NATIVE_FIREBASE_CONFIG_PATH` sont requis. Aucun fichier de
fournisseur ou secret n'est généré ici. Le propriétaire garde la signature, les
capacités Apple et la configuration Firebase. Le plugin relève le minimum Android
à 26 pour Core-Telecom ; il n'ajoute aucun plein écran ou receiver de démarrage.

## Interface

`capabilities`, `configure`, `requestPermissions`, `tokens`, `showOutgoing`,
`answer`, `end`, `setConnected`, `completeAction`, `clear`, `drainEvents` et
`addListener('onCallEvent', listener)` sont exposés dans `src/index.ts`.
`clear({bindingId})` ne ferme que le binding correspondant ; un ancien nettoyage
ne touche pas une session réaffectée. L'absence d'argument garde la fermeture globale.
`requestPermissions({video:false,notifications:true,microphone:false})` demande
seulement les notifications. Micro/caméra sont demandés au geste appel/réponse.

Le payload exact est `NativeCallPushPayload` du contrat social. APNs fournit ses
champs au premier niveau avec `aps` séparé ; FCM fournit uniquement
`data.payload`, sa sérialisation JSON. UUIDv4 serveur, binding/application et
expiration sont relus nativement. Aucun nom, contenu, bearer ou jeton média.

PushKit rapporte CallKit avant JS, même si le push est invalide (rapport neutre,
puis fin). Aucun second push VoIP d'annulation. Le timer natif ferme une sonnerie
au plus après 45 s. L'action réponse reste en attente jusqu'à `setConnected` ;
`audioActivated` autorise ensuite la capture par le SDK média. Mute/hold exigent
un ACK `completeAction` après suspension réelle des pistes ; sans ACK sous 4 s,
l'appel est fermé. Android annonce CallStyle/phoneCall avant JS, puis n'ajoute
le type microphone qu'après permission, admission JS et activité visible.
La boucle de sonnerie Android est native, arrêtée au refus/réponse/expiration ;
mode silencieux, DND et canal déclassé restent silencieux. Plein écran non promis.

Les événements sont des références, bornées à 32 et 60 s, consommées par drain
atomique. Les marqueurs de rotation ne contiennent aucun token ; `tokens()` relit
les valeurs matérielles. Le binding est une lease locale non secrète, bornée par
l'expiration fournie par le contrôleur de session. Les tokens ne sont jamais mis
dans la file durable par ce module (le stockage interne des SDK OS/FCM est distinct).

## Limites

- SecureStore P17b reste `WHEN_UNLOCKED_THIS_DEVICE_ONLY` : aucune admission
  authentifiée avant déverrouillage n'est promise.
- Une file locale ne garantit pas un effet métier exactement une fois : crash
  après consommation, arrêt forcé, stockage différé ou livraison push manquante
  exigent relecture et idempotence serveur. Les données expirées sont masquées à
  la lecture ; un processus arrêté ne peut pas garantir leur suppression physique
  au même instant. Aucun bearer n'est restauré depuis ces références.
- Android expose `fullScreen:false`. FCM/FGS/permissions ou transaction Telecom
  refusés ferment l'appel ; aucun contournement des restrictions système.
- Le module ferme l'appel/session audio/service OS ; l'arrêt des pistes LiveKit
  reste effectué par l'hôte JS propriétaire des médias et ses gardes de session.
- Les API Swift/Kotlin et les dépendances sont raccordées comme sources, sans
  preuve de compilation ou de compatibilité sur appareil. Pas de promesse VoIP
  verrouillé/application fermée, d'E2EE ou de distribution.
- Les deux plugins LiveKit/WebRTC sont branchés uniquement quand les appels sont
  activés. Le tableau officiel du plugin WebRTC ne prouve pas encore la paire
  Expo57 : installation et prébuild/compilation restent nécessaires séparément.

Références : [PushKit](https://developer.apple.com/documentation/pushkit/responding-to-voip-notifications-from-pushkit),
[Core-Telecom](https://developer.android.com/develop/connectivity/telecom/voip-app/telecom),
[types FGS](https://developer.android.com/develop/background-work/services/fgs/service-types),
[Expo subscribers](https://docs.expo.dev/modules/appdelegate-subscribers/),
[Expo lifecycle](https://docs.expo.dev/modules/android-lifecycle-listeners/).
