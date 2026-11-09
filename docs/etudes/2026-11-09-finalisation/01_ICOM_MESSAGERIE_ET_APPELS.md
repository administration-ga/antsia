# Plan 01 — iCom : messagerie et appels

> Constaté par lecture du code d'`origin/main` (ANTSIA `26741caa`, DIASPORALE `bead76d`), le 9 novembre 2026. Rien n'a été exécuté.
> Applications de référence : WhatsApp et iMessage d'abord ; Telegram, Signal et Messenger pour leurs options en plus ; WhatsApp Business et la boîte professionnelle d'Instagram et de Messenger pour iCom Pro ; FaceTime et les appels WhatsApp pour les appels. Comparaison faite de mémoire (état des produits à la mi-2026), non revérifiée en ligne. « ? » signale ce dont je ne suis pas sûr.

Lexique minimal. **Fil** : une conversation (à deux, de groupe, de boutique ou liée à un objet). **Garde** : contrôle serveur exécuté avant toute lecture ou écriture. **Seau de débit** : quota d'actions par personne et par période (`convex/lib/rateLimit.ts`). **Index de recherche** : index plein texte de Convex, déclaré dans le schéma. **LiveKit** : le serveur média des appels. **Cliquet** : test d'architecture qui interdit une régression. **Porte** : condition hors code à lever avant d'ouvrir.

## 1. L'intention du propriétaire

- iCom est le pilier **divertissement** qui fait revenir chaque jour, et le lien vers le **business** : on écrit à une relation, à une boutique, à un partenaire (ADR-0035 ; plan directeur § 2.2, étape « Entrer en relation »).
- Sa demande exacte : « t'as iCom, compare à WhatsApp et iMessage et vois ce qui manque sur iCom et complète l'implémentation » (brief du 9/11).
- **Deux espaces, une pilule** « iCom | iCom Pro » : iCom pour les relations, les groupes, les appels personnels ; iCom Pro pour tout ce qui touche une boutique ou une prestation, côté client compris ; iCom Pro n'apparaît qu'avec une activité professionnelle (ADR-0036, accepté le 22/10).
- Ordre voulu : ICP-1 et ICP-2 (faits, en ligne le 22/10), puis **ICP-3** (horaires, message d'absence, réponses rapides, assignation visible), puis iCom personnel : **demandes de message hors relations, archivage, sourdine des conversations à deux, recherche dans tout l'historique** (ADR-0036 § Lots ; vault `decisions/2026-10-22-icom-et-icom-pro.md`).
- La messagerie personnelle reste **fermée aux inconnus sans acceptation ni quota** (ADR-0019, option B rejetée ; ADR-0025 option A rejetée). Le contact commercial (ADR-0021) et la conversation contextuelle (ADR-0025) sont des familles distinctes.
- Appels : 1:1 et groupe jusqu'à 11, présence par personne, sonnerie, messagerie vocale héritée, **aucun enregistrement** (EXF-AN-23). Un appel contextuel exige l'accord des deux personnes (ADR-0025, D5 amendé).
- Le chiffrement de bout en bout **n'est pas décidé** : aucun réglage « chiffré » de façade (étude `05_MESSAGES_ET_APPELS.md` § 7).
- Statuts honnêtes : « Envoyé » et « Lu » seulement, aucun « Livré » sans preuve (rapport P05 § 2). **Jamais de publicité dans la messagerie** (brief commun § 6).
- Refusé ou borné : cinq destinations au téléphone, rien de plus ; aucune tuile pour une fonction vide ; maquettes fidèles au code (mémoire `maquettes-fideles-au-code.md`).

## 2. Ce qui existe

Chemins relatifs au dépôt ANTSIA. « Web » : antsia.ga ; « Mobile » : application Expo.

| Capacité | État | Web | Mobile | Preuve |
|---|---|---|---|---|
| Conversation à deux, entre relations seulement | Présent | oui | texte seul | `convex/modules/messaging/{inbox,messages,threads}.ts` ; `apps/antsia_mobile/src/screens/conversation-screen.tsx` |
| Groupes : titre, photo, description, 256 membres | Présent | oui | non | `convex/modules/groups/threads.ts` ; `packages/social-contracts/src/groupCapacity.ts` (`GROUP_MEMBERS_MAX = 256`) |
| Rôles (propriétaire, admin, membre), retrait, départ, suppression en cascade | Présent | oui | non | `groups/threads.ts`, `groups/cascade.ts`, `packages/social-features/src/features/messagerie/MessagerieGroupeInfos.tsx` |
| Invitation nominative acceptée par l'invité ; lien et code QR réinitialisables | Présent | oui | non | `groups/invites.ts` ; `MessagerieGroupeInvitations.tsx` |
| Réglages d'admin (seuls les admins écrivent, entrées par lien à approuver) | Absent | — | — | motifs `onlyAdmins`, `announcementOnly`, `approval`, `joinRequest`, « seuls les admin » : aucun résultat |
| Pièces jointes : 5 par message, 25 Mo, liste blanche, garde des fichiers | Présent | oui | non | `packages/social-contracts/src/attachments.ts` ; `messaging/attachmentStorage.ts` |
| Message vocal (5 min, `audio/mp4` en tête pour iOS) | Présent | oui | non | `messagerie/VoiceRecorderButton.tsx`, `messagerie/voice-note.ts` |
| Vitesse de lecture d'un vocal, lecteur dessiné | Absent | — | — | `<audio controls>` natif (`MessageAttachment.tsx`) ; motifs `playbackRate`, `vitesse de lecture` |
| Transcription d'un vocal ; message vidéo court | Absent | — | — | motifs `transcri`, `videoNote`, `message vidéo`, `circleVideo` |
| Six réactions fixes | Présent | oui | non | `packages/social-contracts/src/messageReactions.ts` ; `messaging/reactions.ts` |
| Réponse citée, aller au message cité | Présent | oui | non | `personalMessages.replyToMessageId` ; `messagerie/ReplyPreview.tsx` |
| Transfert 1:1 ↔ groupe, marqué « Transféré » | Présent | oui | non | `messaging/forward.ts` ; `ForwardMessageSheet.tsx` |
| Modifier (15 min) ; supprimer pour moi ou pour tous (15 min) | Présent | oui | non | `packages/social-contracts/src/messaging.ts` (`MESSAGE_EDIT_WINDOW_MS`) ; `messaging/messages.ts` |
| Un message épinglé par fil | Présent | oui | non | `messaging/pins.ts` ; `PinnedMessageBanner.tsx` |
| Accusés « Envoyé » / « Lu » en 1:1 | Présent | oui | lecture marquée | `messages.ts` (`markRead`) ; `messagerie-outbox.ts` |
| « Lu par » dans un groupe | Absent | — | — | curseur `groupMembers.lastRead*` stocké (`groups/tables.ts`), aucune projection ni écran |
| « écrit… » en 1:1 et en groupe | Présent | oui | non | `messaging/typing.ts`, `groups/typing.ts` ; purge chaque minute (`convex/crons.ts`) |
| Brouillons | Partiel | oui | non | texte en `sessionStorage` par réseau (`dock-store.ts`) ; pièces en mémoire, « à resélectionner » après rechargement |
| Boîte d'envoi « Envoi en cours » et idempotence | Partiel | oui | oui | `messagerie-outbox.ts`, `messagerie-send-intent.ts` ; mémoire seulement : rien ne survit à un rechargement |
| Envoi différé hors connexion | Absent | — | — | outbox en mémoire ; motifs `offline queue`, `hors connexion`, `persist` dans `messagerie/` |
| Recherche de conversations | Partiel | oui | non | filtre client sur la fenêtre chargée, groupes limités aux 50 premiers (i18n `icomViews.loadedWindow`) |
| Recherche dans les messages et dans une conversation | Absent | — | — | aucun `searchIndex` sur `personalMessages` ni `groupMessages` ; motifs `searchMessages`, `withSearchIndex`, « rechercher dans la conversation » |
| Médias, liens et documents d'une conversation | Partiel | groupe | non | `groupe-ressources.ts` (historique chargé seulement) ; rien pour le 1:1 |
| Sourdine | Partiel | non | non | groupes : `setGroupMuted` sans aucun écran ; 1:1 : aucun champ |
| Archivage par la personne | Absent | — | — | `personalThreads.status = "archived"` n'est jamais écrit (état de fermeture, pas d'archivage) |
| Verrouillage, fonds par conversation, listes de diffusion | Absent | — | — | motifs `chatLock`, `verrouill`, `wallpaper`, `fond d'écran`, `broadcastList`, `liste de diffusion` |
| Messages marqués (favoris) ; programmés ; éphémères ; vue unique | Absent | — | — | motifs `starred`, `favori`, `scheduledMessage`, `programm`, `ephemeral`, `disappearing`, `viewOnce`, `vue unique` |
| Sondages ; position ; fiche de contact | Absent | — | — | motifs `poll`, `sondage`, `shareLocation`, `geolocation`, `vcard`, `contactCard` |
| Mentions `@` dans un groupe | Absent | — | — | genre `mention` réservé aux publications (`packages/social-domain/src/notifications.ts`) |
| Aperçu des liens ; autocollants, GIF, sélecteur d'émojis | Absent | — | — | motifs `linkPreview`, `unfurl`, `og:image`, `sticker`, `giphy`, `emojiPicker` |
| Demandes de message hors relations | Absent | — | — | composeur limité aux relations (i18n `messagerieComposeView.noRelations`) |
| Présence : en ligne, occupé, ne pas déranger, hors ligne | Présent | oui | non | `calls/presence.ts` ; `iappel/presence-dot.tsx` |
| « Dernière connexion » | Absent | — | — | motifs `lastSeen`, `dernière connexion` hors du module `live` |
| Réglages d'appel et de présence (NPD, réponses rapides, vocale, hors relations, présence, double appel) | Partiel | non | non | serveur complet (`calls/preferences.ts`) ; `MyPresenceRow` exporté (`shell/index.ts`) mais **monté nulle part** ; `parametres/settings-screen.tsx` sans rubrique |
| « Qui peut m'appeler » | Partiel | non | non | `outsideRelationsCalls` vaut **`ring` par défaut** (`preferences.ts` l. 45) : tout membre déclaré peut faire sonner un membre par son identifiant (`calls/direct.ts`) |
| Accusés de lecture désactivables | Absent | — | — | motifs `readReceipts`, `accusés de lecture` hors conversation contextuelle |
| Signaler depuis une conversation | Partiel | boutique, contexte | non | cibles `commercialMessage`, `contextualMessage`, `groupMessage` (`moderation/tables.ts`) ; aucun écran pour le groupe ; **aucune cible pour un message à deux** |
| Bloquer depuis une conversation | Partiel | boutique | non | `commercialMessaging/threads.ts` (`setThreadBlock`) ; le blocage du graphe ferme le fil (`messaging/threads.ts`, `onPairBlockChanged`) mais aucun geste dans iCom |
| Cloche pour un message à deux | Absent | — | — | aucun genre dans `packages/social-domain/src/notifications.ts` (pastille seule) ; groupe : `group_message` présent |
| Compression avant envoi, économie de données | Absent | — | — | compression des Stories et albums seulement (`stories/story-create.ts`, `reseau-albums/AlbumComposer.tsx`) ; vidéos en `preload="metadata"` |
| Multi-appareils | Présent | oui | oui | par construction : messages au serveur, sessions multiples ; non recetté |
| Export d'une conversation | Absent | — | — | motifs `exportChat`, « exporter la conversation » ; l'export global relève du plan 06 |
| Bascule « iCom \| iCom Pro », capacité `icomPro` | Présent | oui | non | `messagerie/IcomSpaceSwitch.tsx`, `use-icom-pro.ts` ; `packages/api/src/network.tsx` |
| iCom Pro par activité et par état | Présent | oui | non | `apps/antsia_ga/src/components/icom-pro/icom-pro-conversations.tsx` (état filtré dans la fenêtre chargée) |
| Contacts pro dérivés des échanges | Présent | oui | non | `icom-pro/icom-pro-contacts.tsx`, `icom-pro-contacts-model.ts` |
| Journal d'appels par espace | Présent | oui | non | `messagerie/IcomAppelJournal.tsx` |
| Équipe et mandats (lire, répondre, décider, appeler) ; accepter les demandes | Présent | oui | non | `commercialMessaging/{team,settings}.ts` ; `components/shops/contact-team-panel.tsx` |
| Horaires, absence, accueil, réponses rapides de boutique | Absent | — | — | `shopContactSettings` ne porte que `acceptRequests` ; l'horaire de boutique est une ligne libre (`shops/rules.ts`, `hours`) |
| Assignation à un équipier | Partiel | non | non | `assignedRespondentPersonId` posé à l'acceptation, lu pour l'appel (`commercialMessaging/calls.ts`), jamais affiché ni modifiable |
| Étiquettes, notes internes, statistiques | Absent | — | — | motifs `threadLabel`, `étiquette`, `insights`, `statistiques` dans les modules de messagerie |
| Offre dans la conversation | Partiel | oui | non | `commercialThreads.offerRef` au premier contact ; aucun envoi d'offre depuis le fil |
| Transfert consenti d'un prospect à PRO.GA | Présent | oui | non | `commercialMessaging/crm.ts`, `crmTransport.ts` (ADR-0021 encore « Proposé ») |
| Contact commercial sans relation préalable | Présent | oui | non | `commercialMessaging/threads.ts` (`requestContact`, `decideRequest`) ; console `console-commercial-contact.tsx` |
| Conversation contextuelle (5 natures, dont `professionalCollaboration`) | Présent | oui | non | `convex/modules/contextualMessaging/` ; `ContextualConversationView.tsx` ; console `console-contextual-policy.tsx` |
| Appel audio et vidéo à deux | Présent | oui | fermé | `calls/{direct,lifecycle,livekitActions}.ts` ; `iappel/CallStage.tsx` |
| Appel de groupe (11), ajout en cours d'appel | Présent | oui | fermé | `calls/groupCalls.ts` ; `iappel/AddToCallPanel.tsx` |
| Sonnerie, extinction, refus avec message | Présent | oui | fermé | `calls/{ringing,ringExpiry}.ts` ; `iappel/IncomingCallCard.tsx` |
| Mise en attente, double appel | Présent | oui | fermé | `ringing.ts` (`hold`, `resume`) ; `CallWaitingChip.tsx`, `HeldCallChips.tsx` |
| Messagerie vocale | Partiel | dépôt seul | non | `VoicemailRecorder.tsx` dépose ; `voicemail.ts` (`listMine`, `playbackUrl`, `markRead`, `deleteMine`) **sans aucun écran** |
| Journal, rappel, « Écrire » après l'appel | Présent | oui | non | `calls/history.ts` ; `IappelJournal.tsx`, `CallEndScreen.tsx` |
| Caméra, retournement, sortie audio | Présent | oui | fermé | `CallStage.tsx`, `use-camera-flip.ts`, `SpeakerPickerPanel.tsx` |
| Qualité adaptative et indicateur | Présent | oui | fermé | `packages/social-features/src/lib/livekit/room-options.ts` (simulcast, `adaptiveStream`, `dynacast`) ; `CallConnectionQuality.tsx` |
| Continuité pendant la navigation | Présent | oui | — | `shell/communication/global-call-surface-host.tsx` ; `CallMinimizedPill.tsx` |
| Arbitrage des médias | Partiel | oui | — | l'appel suspend les vidéos du fil (`media-playback/media-playback-policy.ts`) ; le vocal n'entre pas dans le coordinateur |
| Partage d'écran ; lien d'appel ; appel programmé | Absent | — | — | `getDisplayMedia` seulement dans le studio du direct ; motifs `callLink`, `lien d'appel`, `scheduledCall` |
| Appels natifs (CallKit, ConnectionService) | Fermé | — | fermé | `NATIVE_CALLS_ENABLED` (`apps/antsia_mobile/app.config.ts`) ; ouverture : clés LiveKit, APNs, FCM (plan 14) |
| Push d'appel entrant | Partiel | — | — | `calls/push.ts` enfile ; transport non recetté (plans 06 et 14) |
| Carte iCom au bureau, détachable (440 × 956) | Présent | oui | — | `MessagerieDock.tsx`, `dock-store.ts` |
| Actus d'iCom : statuts et rappels publics | Présent | oui | non | `IcomActusPanel.tsx`, `IcomPublicReminders.tsx` ; `app/(membre)/actus/[[...chemin]]/page.tsx` |
| Pages pleines au téléphone | Présent | oui | — | `MessagesRoute.tsx` ; `app/(membre)/messages/[[...chemin]]/page.tsx` |

### Ce qui est écrit mais jamais recetté en réel

- **Tout appel réel** : aucune clé LiveKit consignée ; la recette du 15/10 s'arrête à « visioconférence non configurée » (`docs/04_RAPPORT_PARITE_FRONT.md` ; dossier de reprise § 3.6 et § 10.1, « Médias réels et transports : non recettés »).
- **P05** (envois, appels Web, ouverture des notifications) : « sources raccordées ; recette réelle ouverte » (`rapports/P05_ICOM.md` § 7). Le `verify` complet du 2/11 est vert, mais aucune recette à deux appareils n'est consignée.
- **P10** contact commercial : « configuration, politiques et recette réelle restent ouvertes » (`rapports/P10_CONTACT_COMMERCIAL.md`) ; constaté en ligne sur la démo le 22/10 avec des graines (vault `icom-et-icom-pro-2026-10-22.md`).
- **CC** conversation contextuelle : recette CC-V ouverte ; D7 et D13 à confirmer par un juriste (ADR-0025).
- **Recette à deux vraies identités en production** : jamais exercée (reprise § 10.1, P0).
- **Push** des messages et des appels, **appels natifs** : non recettés (reprise § 10.3).

## 3. Comparaison avec les applications de référence

| Capacité | WhatsApp | iMessage | Autres | ANTSIA | Verdict |
|---|---|---|---|---|---|
| Recherche dans tout l'historique | oui | oui | Telegram, Signal oui | non | À faire (IC-07), décidé par ADR-0036 |
| Archivage, sourdine par conversation | oui | sourdine oui | Telegram oui | groupe seul, sans écran | À faire (IC-06), décidé par ADR-0036 |
| Demandes de message d'inconnus | non (numéro) | filtre des inconnus | Messenger, Instagram oui | non | À adapter (IC-08) : avec acceptation et quota (ADR-0019) |
| Accusés de lecture désactivables | oui | oui, par fil | Signal oui | non | À faire (IC-04) |
| Qui peut m'appeler, me voir en ligne | oui | — | Telegram, Signal oui | serveur seul | À faire (IC-04), P0 : le défaut fait sonner tout membre |
| Signaler et bloquer depuis le fil | oui | oui | tous | partiel | À faire (IC-03) |
| Messagerie vocale d'appel | ? | FaceTime : message après appel manqué | — | dépôt sans écoute | À faire (IC-02) |
| Mentions dans un groupe | oui | oui | Telegram oui | non | À faire (IC-11) |
| Vocal : vitesse | oui | ? | Telegram oui | non | À faire (IC-12) |
| Vocal : transcription | oui | oui | Telegram oui | non | Reporté : passe par iAsted et SU01i (plan 16) |
| Médias, liens, documents | oui | oui | tous | groupe, partiel | À faire (IC-13) |
| « Lu par » en groupe | oui | non | Telegram oui | non | À faire (IC-15) |
| Messages marqués | oui | non | Telegram oui | non | À faire (IC-16) |
| Sondages | oui | oui | Telegram, Messenger oui | non | À faire (IC-17) |
| Position, fiche de contact | oui | oui | tous | non | À adapter (IC-18) : partage d'un profil, d'une offre, d'une position ponctuelle |
| Aperçu des liens | oui | oui | tous | non | À adapter (IC-19) : décision de confidentialité |
| Réglages d'admin de groupe | oui | non | Telegram oui | non | À faire (IC-14) |
| Communautés | oui | non | Telegram : forums | groupes thématiques | Plan 07 |
| Listes de diffusion | oui | non | Telegram : canaux | non | Écarté : risque de démarchage |
| Messages éphémères, vue unique | oui | non | Telegram, Signal oui | non | Reporté : décision juriste (§ 7) |
| Messages programmés | non | oui | Telegram oui | non | Reporté P3 |
| Verrouillage, fonds par fil | oui | fonds oui | Telegram oui | non | Écarté : un seul système de thèmes (ADR-0027) |
| Autocollants, GIF | oui | oui | tous | non | Écarté : fournisseurs tiers et données |
| Envoi hors connexion persistant | oui | oui | tous | non | À faire (IC-10) |
| Compression, économie de données | oui | oui | Telegram oui | non | À faire (IC-10), différenciant au Gabon |
| Chiffrement de bout en bout | oui | oui | Signal oui | non | Lot de décision (IC-23), jamais de façade |
| Multi-appareils | oui | oui | tous | oui par construction | Déjà fait, à recetter (IC-01) |
| Export d'une conversation | oui | non | Telegram oui | non | Reporté P3 (export global : plan 06) |
| Appel à deux, de groupe | oui | FaceTime oui | tous | 11 au plus | Déjà fait, à recetter (IC-01) |
| Partage d'écran en appel | oui | SharePlay | Telegram, Signal oui | non | À faire (IC-20) |
| Lien d'appel, appel programmé | oui | FaceTime : lien | Signal : lien | non | Plan 04 (conférences) |
| Mise en attente, double appel | ? | oui (téléphone) | — | oui | Déjà fait |
| Horaires, absence, accueil, réponses rapides | WhatsApp Business oui | — | boîte Meta : réponses enregistrées | non | À faire (ICP-3) |
| Étiquettes, assignation | Business : étiquettes | — | boîte Meta : assignation | assignation cachée | À faire (ICP-3, IC-21) |
| Catalogue dans le fil | Business oui | — | — | référence d'offre | À adapter (IC-21), PRO.GA fait autorité |
| Statistiques de messagerie | Business : simples | — | boîte Meta oui | non | Reporté : seulement des chiffres réels (IC-21) |
| Publicité dans la messagerie | Business : publicités menant au fil | non | Messenger : oui | non | Écarté : interdit (brief § 6) |

## 4. Ce qui manque

### 4.1 Bloquant avant l'ouverture au public

1. **Recette réelle** des messages et des appels avec deux vraies identités et deux appareils (IC-01).
2. **Messagerie vocale sans écoute** : l'écran promet « Il le retrouvera dans son journal d'appels » (`VoicemailRecorder.tsx`, i18n `voicemailRecorder.prompt`) alors qu'aucun écran ne la lit (IC-02).
3. **Aucun signalement d'un message à deux**, aucun geste « Bloquer » dans iCom : l'ordonnance 0011 exige un signalement accessible (IC-03, avec le plan 12).
4. **Tout membre peut faire sonner un autre membre** par défaut, et le réglage n'a aucun écran (IC-04).

### 4.2 Attendu par les utilisateurs

Réglages iCom (NPD, réponses rapides, accusés, présence) ; ICP-3 ; archivage et sourdine ; recherche serveur ; demandes de message ; cloche d'un message à deux ; faible débit et envoi différé ; mentions ; vitesse des vocaux ; médias d'une conversation ; parité du natif.

### 4.3 Différenciant pour ANTSIA

- **Faible débit** : compression avant envoi, vignettes, téléchargement à la demande, reprise par pièce, mode économie de données (IC-10). Les références le font mal en 3G.
- **Confiance** : demandes de message bornées aux membres identifiés, invitation de groupe toujours acceptée par l'invité (déjà vrai), badges calculés dans l'en-tête du fil.
- **Commerce relié** : offre de PRO.GA envoyée dans le fil, sans prix figé présenté comme promesse (étude `05` § 2) ; transfert de prospect consenti (déjà présent).
- **Souveraineté** : aucune donnée vers un fournisseur de GIF ou d'aperçus ; statuts honnêtes, sans « Livré » inventé.

### 4.4 Écarté ou reporté, et pourquoi

| Sujet | Décision | Raison |
|---|---|---|
| Listes de diffusion | Écarté | Démarchage de masse ; ADR-0019 |
| Publicité, messages sponsorisés | Écarté | Interdit (brief § 6) |
| Autocollants, GIF | Écarté | Fournisseurs tiers, fuite de données |
| Verrouillage, fond par conversation | Écarté | Un seul système de thèmes (ADR-0026, 0027) |
| Éphémères, vue unique | Reporté | Tension avec la preuve d'un signalement (ordonnance 0011) : avis du juriste |
| Programmés, export d'un fil, message vidéo | Reporté P3 | Peu attendu au pilote |
| Transcription | Reporté | IA : plan 16, après SU01i |
| Lien d'appel, appel programmé | Plan 04 | Relève des conférences |
| Communautés | Plan 07 | Groupes thématiques |
| Enregistrement des appels | Écarté | EXF-AN-23 |

## 5. Lots d'implémentation

### IC-01 — Recette réelle iCom et appels à deux identités · priorité P0 · taille M · session S1
- **Pour l'utilisateur** : la preuve que messages, pièces, vocaux et appels marchent entre deux personnes réelles.
- **Backend** : aucun code ; configuration LiveKit par le propriétaire.
- **Web** : scénario de l'étude `05` § 8 : texte, pièce, vocal, réaction, transfert ; appel audio et vidéo dans les deux sens ; groupe à trois comptes ; navigation fil → boutique → iCom pendant l'appel ; clair et sombre ; refus de permission ; coupure réseau.
- **Mobile** : messages texte sur iPhone réel (les appels natifs restent fermés).
- **Données personnelles** : comptes de recette effacés ensuite par le parcours d'effacement.
- **Tests et cliquets** : rapport `docs/recette/icom-reel-<date>/RAPPORT.md`, daté, preuve par capture.
- **Critères d'acceptation** : chaque ligne du § 8 de l'étude cochée ou en échec documenté ; aucune affirmation sans constat.
- **Dépend de** : clés LiveKit, second compte réel.
- **Porte** : clés du propriétaire ; accord écrit pour toute publication.

### IC-02 — Messagerie vocale : écouter, marquer lu, supprimer · priorité P0 · taille S · session S1
- **Pour l'utilisateur** : le message laissé après un appel manqué s'écoute dans le journal d'appels.
- **Backend** : fonctions existantes `calls/voicemail.ts` (`listMine`, `playbackUrl`, `markRead`, `deleteMine`) ; vérifier que `playbackUrl` passe par `servableUrl`.
- **Web** : rangée « Message vocal » dans `IappelJournal.tsx` (lecteur, durée, non lu, supprimer) ; pastille de non-lus dans l'onglet Appels ; état vide, chargement, erreur.
- **Mobile** : après le web.
- **Données personnelles** : `voicemails` déjà dans `people/dataPolicies.ts` ; vérifier export et effacement.
- **Tests et cliquets** : test d'écran du journal ; `file-delivery-gate` vert.
- **Critères d'acceptation** : un vocal déposé apparaît chez le destinataire seul, se lit, passe à « lu », se supprime ; le texte du prompt devient vrai.
- **Dépend de** : rien.
- **Porte** : aucune.

### IC-03 — Signaler et bloquer depuis la conversation · priorité P0 · taille M · session S1
- **Pour l'utilisateur** : « Signaler » sur un message, « Bloquer » et « Signaler la personne » dans l'en-tête, en 1:1 et en groupe.
- **Backend** : cible `personalMessage` dans `moderation/tables.ts` (`moderationTargetValidator`), sa résolution dans `targets.ts` et `reviewProjection.ts` (le signaleur doit être partie au fil) ; réutiliser la cible `groupMessage` et le blocage du graphe (plan 05).
- **Web** : action dans `message-actions.ts` et `MessageActionsSheet.tsx` (formulaire Zod comme `CommercialConversationView.tsx`) ; menu de `ConversationHeader.tsx`.
- **Mobile** : après le web.
- **Données personnelles** : le signalement suit la politique existante de `moderation`.
- **Tests et cliquets** : tests de garde (non-partie refusée, refus indistinct) ; `network-scoped-functions` étendu.
- **Critères d'acceptation** : un message à deux et un message de groupe se signalent ; le cas arrive dans la file du plan 12 ; bloquer ferme le fil des deux côtés.
- **Dépend de** : plan 12 (file, délais 24 h et 72 h), plan 05 (blocage).
- **Porte** : aucune.

### IC-04 — Écran « Réglages iCom » : appels, présence, accusés · priorité P0 · taille M · session S1
- **Pour l'utilisateur** : choisir qui peut m'appeler, me mettre en « Ne pas déranger », gérer mes réponses rapides, ma messagerie vocale, ma présence et mes accusés de lecture.
- **Backend** : `calls/preferences.ts` existe ; ajouter `readReceipts` (réciproque : qui les coupe ne voit plus ceux des autres) lu par `messages.ts` ; défaut de `outsideRelationsCalls` selon la décision 1 du § 7.
- **Web** : rubrique iCom dans `parametres/settings-screen.tsx` ; monter `MyPresenceRow` ; formulaire React Hook Form + Zod (`MAX_QUICK_REPLIES` de `social-contracts/src/calls.ts`).
- **Mobile** : après le web.
- **Données personnelles** : `callPreferences` déjà inventorié.
- **Tests et cliquets** : `rate-limited-writes` (seau `call.settings`) ; test de réciprocité des accusés.
- **Critères d'acceptation** : chaque réglage a un effet serveur constaté ; aucun interrupteur sans effet.
- **Dépend de** : plan 06 (place de la rubrique dans Paramètres).
- **Porte** : décision 1 du § 7.

### IC-05 — Jetons de rôle et nom « iCom » · priorité P1 · taille S · session S1
- **Pour l'utilisateur** : les mêmes couleurs par famille d'actions partout ; le titre « iCom » au lieu de « Messages ».
- **Backend** : aucun.
- **Web** : `ContextualConversationView.tsx` et `CallStage.tsx` n'ont aucun `data-role` (constaté par recherche) : les passer aux jetons de l'ADR-0027 ; clés `icomViews.title` et `messagerieListView.titlePage` (« Messages ») à « iCom ».
- **Mobile** : —
- **Données personnelles** : aucune.
- **Tests et cliquets** : `no-hardcoded-colors`, `theme-contract`, `i18n-locales`.
- **Critères d'acceptation** : recette des sept thèmes ; un seul bouton plein par zone.
- **Dépend de** : lot 1.4 du dossier de reprise.
- **Porte** : aucune.

### ICP-3 — iCom Pro : horaires, absence, accueil, réponses rapides, assignation · priorité P1 · taille L · session S1
- **Pour l'utilisateur** : la boutique annonce ses heures de réponse, répond seule hors horaires, insère une réponse enregistrée, voit et change qui suit chaque client.
- **Backend** : champs dans `shopContactSettings` (semaine structurée, fuseau Libreville, message d'absence, message d'accueil facultatif, réponses rapides bornées) ; mutations sous mandat `canDecide` ; envoi automatique **une fois par fil et par période**, marqué « Réponse automatique » ; `assignThread` sous mandat, garde de mandat vivant ; seaux `commercial.*`.
- **Web** : réglages dans `contact-team-panel.tsx` ; menu « Réponses rapides » dans le composeur de `CommercialConversationView.tsx` ; équipier assigné visible et modifiable dans `icom-pro-conversations.tsx` ; horaires affichés au client avant son premier message.
- **Mobile** : après le web.
- **Données personnelles** : réglages de boutique (pas de donnée personnelle nouvelle hors l'assignation, purgée avec le fil à 90 jours).
- **Tests et cliquets** : `operator-audit` si la console expose ces réglages ; `crons-contract` si un passage planifié est ajouté (identifiant ASCII).
- **Critères d'acceptation** : hors horaires, une seule réponse automatique ; équipier révoqué désassigné ; le client voit les horaires ; démo graine ICP-2 mise à jour.
- **Dépend de** : ADR-0036 ; plan 08 (fiche boutique, horaires).
- **Porte** : décision 6 du § 7 (message d'accueil).

### IC-06 — Archivage et sourdine par conversation · priorité P1 · taille M · session S1
- **Pour l'utilisateur** : archiver un fil (il revient à un nouveau message), couper ses alertes pour 8 h, une semaine ou toujours.
- **Backend** : table `personalThreadStates` (réseau, fil, personne, `archivedAt`, `mutedUntil`) ; ne **pas** réutiliser `personalThreads.status`, qui ferme le fil pour les deux ; `mutedUntil` pour les groupes à côté de `groupMembers.mutedAt` ; la cloche lit la sourdine.
- **Web** : action dans la liste et l'en-tête ; filtre « Archivées » ; écran pour `setGroupMuted`.
- **Mobile** : après le web.
- **Données personnelles** : nouvelle table dans `dataPolicies.ts`, effacée avec la personne.
- **Tests et cliquets** : `erasure.test.ts` (couverture du schéma), `network-scoped-functions`.
- **Critères d'acceptation** : un fil archivé quitte la liste et revient à l'arrivée d'un message ; la pastille ne compte pas un fil en sourdine selon la décision retenue.
- **Dépend de** : `convex/schema.ts` (S1).
- **Porte** : aucune.

### IC-07 — Recherche serveur dans les conversations et les messages · priorité P1 · taille L · session S1
- **Pour l'utilisateur** : retrouver un mot dans tout l'historique, et dans une conversation, puis sauter au message.
- **Backend** : index de recherche sur `personalMessages.content` et `groupMessages.content` filtrés par fil ; requête qui n'interroge **que les fils où je suis partie** (1:1 par paire, groupe depuis `joinedAt` et après `clearedThrough*`), exclut masqués, retirés et bloqués ; pagination bornée.
- **Web** : champ de recherche global dans la liste (résultats « Conversations » et « Messages ») ; loupe dans `ConversationHeader.tsx` ; saut au message comme pour une citation ; textes `icomViews.loadedWindow` mis à jour.
- **Mobile** : après le web.
- **Données personnelles** : aucune nouvelle ; l'index suit l'effacement des lignes.
- **Tests et cliquets** : tests de fuite (un tiers, un ancien membre, un bloqué ne trouvent rien) ; `no-unbounded-collect`.
- **Critères d'acceptation** : un message ancien de six mois est trouvé ; aucun résultat hors de mes fils.
- **Dépend de** : `convex/schema.ts` (S1).
- **Porte** : aucune.

### IC-08 — Demandes de message hors relations · priorité P1 · taille L · session S1
- **Pour l'utilisateur** : écrire une fois à quelqu'un qui n'est pas une relation ; il accepte, refuse ou bloque.
- **Backend** : table `messageRequests` (réseau, demandeur, destinataire, texte seul, état) ; réglage « qui peut m'écrire » ; une demande par paire, sans pièce ni appel, seau renforcé ; acceptation = fil ouvert sans créer de relation.
- **Web** : onglet « Demandes » dans iCom ; bouton « Écrire » d'un profil non relié.
- **Mobile** : après le web.
- **Données personnelles** : demandes exportées et effacées ; conservation d'une demande refusée selon la décision 7.
- **Tests et cliquets** : `rate-limited-writes` ; garde de relation de `messaging/inbox.ts` inchangée pour le fil direct.
- **Critères d'acceptation** : aucune voie d'écrire deux fois sans réponse ; refus indistinct pour un bloqué.
- **Dépend de** : ADR-0019 et ADR-0036 ; décision 2 du § 7 ; plan 05 (profil).
- **Porte** : décision du propriétaire (qui peut écrire).

### IC-09 — Cloche neutre d'un message à deux · priorité P1 · taille S · session S1
- **Pour l'utilisateur** : savoir qu'une relation m'a écrit sans ouvrir iCom (aujourd'hui, seule la pastille le dit).
- **Backend** : genre `personal_message` (sujet : le fil, aucun contenu) dans `packages/social-domain/src/notifications.ts`, émis par `appendPersonalMessage` via `notifications/notify.ts`, regroupé par fil, muet si le fil est en sourdine (IC-06).
- **Web** : ouverture vers la conversation par `convex/modules/notifications/open.ts` ; libellé neutre i18n.
- **Mobile** : la livraison push relève du plan 14.
- **Données personnelles** : cloche retirée avec le fil et à l'effacement (comme `group_message` dans `groups/cascade.ts`).
- **Tests et cliquets** : `notification-payload-content`, `notifications-writer`.
- **Critères d'acceptation** : au plus une cloche par fil non lu ; aucune cloche pour un fil en sourdine ou un expéditeur bloqué.
- **Dépend de** : plans 06 (préférences, push) et 14 ; IC-06.
- **Porte** : aucune.

### IC-10 — Faible débit : compression, téléchargement à la demande, envoi différé · priorité P1 · taille M · session S1 puis S3
- **Pour l'utilisateur** : photos compressées avant l'envoi, vidéos et vocaux chargés au toucher en mode économie, messages en attente conservés jusqu'au retour du réseau.
- **Backend** : aucun changement de garde ; la garde relit le poids réel.
- **Web** : réutiliser la compression de `story-create.ts` ; préférence « Économie de données » (plan 06) lue par `MessageAttachment.tsx` (`preload="none"`) ; outbox persistée en IndexedDB par réseau, personne et session, rejouée avec la même clé d'idempotence, purgée par `signOutEverywhere`.
- **Mobile** : même logique dans `conversation-screen.tsx` (S3).
- **Données personnelles** : l'outbox locale est purgée à la sortie (cliquet `sign-out-everywhere`).
- **Tests et cliquets** : rejeu idempotent (une clé, un message) ; purge à la sortie ; compression testée sur des formats JPEG, PNG, WebP.
- **Critères d'acceptation** : une photo de 6 Mo part nettement allégée (seuil à fixer au lot, mesuré) ; un message tapé hors ligne part une seule fois au retour ; une pièce déjà téléversée n'est pas renvoyée.
- **Dépend de** : plan 06 (préférence), plan 03 (chaîne des médias).
- **Porte** : aucune.

### IC-11 — Mentions dans les groupes · priorité P1 · taille M · session S1
- **Pour l'utilisateur** : interpeller un membre avec `@`, être averti quand on me cite.
- **Backend** : `mentionedPersonIds` borné sur `groupMessages`, validé contre les membres actifs ; cloche neutre (genre `mention` réutilisé ou genre dédié), qui passe la sourdine si la décision le retient.
- **Web** : suggestions `@` dans `MessageComposer.tsx` parmi les membres ; rendu dans `MessageBubble.tsx`.
- **Mobile** : après le web.
- **Données personnelles** : champ effacé avec le message ; un membre effacé devient « Compte supprimé ».
- **Tests et cliquets** : garde (un non-membre n'est pas mentionnable), `notification-payload-content`.
- **Critères d'acceptation** : seule la personne citée reçoit l'avis ; aucun texte du message dans l'avis.
- **Dépend de** : schéma (S1), IC-06.
- **Porte** : aucune.

### IC-12 — Vocaux : vitesse et coordination · priorité P1 · taille S · session S1
- **Pour l'utilisateur** : écouter un vocal en 1,5× ou 2× ; un vocal coupe la vidéo du fil, un appel coupe le vocal.
- **Backend** : aucun.
- **Web** : lecteur dessiné dans `MessageAttachment.tsx` (1×, 1,5×, 2×, position) ; le vocal entre dans le coordinateur `features/media-playback` (étude `05` § 5 : appel, puis vocal, puis vidéo du fil).
- **Mobile** : après le web.
- **Données personnelles** : vitesse retenue sur l'appareil seulement.
- **Tests et cliquets** : tests du coordinateur ; `no-hardcoded-colors`.
- **Critères d'acceptation** : jamais deux sons à la fois ; lecteur utilisable au clavier.
- **Dépend de** : plan 03 (lecture des médias).
- **Porte** : aucune.

### IC-13 — Médias, liens et documents servis par le serveur · priorité P1 · taille M · session S1
- **Pour l'utilisateur** : retrouver toutes les photos, documents et liens d'une conversation, à deux comme en groupe.
- **Backend** : requête paginée et bornée des pièces d'un fil (1:1 et groupe), URL par `servableUrl`, respectant masquages, retraits et `clearedThrough*`.
- **Web** : panneau « Infos » du 1:1 (profil, médias, bloquer, signaler) ; `MessagerieGroupeInfos.tsx` lit le serveur au lieu de l'historique chargé (`groupe-ressources.ts`).
- **Mobile** : après le web.
- **Données personnelles** : aucune nouvelle.
- **Tests et cliquets** : `file-delivery-gate`, `no-unbounded-collect`.
- **Critères d'acceptation** : une pièce envoyée 300 messages plus tôt apparaît ; une pièce retenue par l'antivirus reste retenue.
- **Dépend de** : IC-03.
- **Porte** : aucune.

### IC-14 — Réglages d'administration de groupe · priorité P2 · taille M · session S1
- **Backend** : `sendPolicy` (`all` \| `admins`), `joinByLinkRequiresApproval` sur `groupThreads` ; file de demandes d'entrée.
- **Web** : section dans `MessagerieGroupeInfos.tsx`. **Critères** : un membre non admin ne peut plus écrire si `admins`. **Porte** : aucune.

### IC-15 — « Lu par » dans les groupes · priorité P2 · taille M · session S1
- **Backend** : projection à partir de `groupMembers.lastReadCreationTime`, bornée aux 256 membres, respectant IC-04. **Web** : « Infos du message ». **Porte** : aucune.

### IC-16 — Messages marqués · priorité P2 · taille S · session S1
- **Backend** : table `messageMarks` (personne, message, fil) ; effacée avec la personne. **Web** : action « Marquer », liste « Messages marqués ». **Porte** : aucune.

### IC-17 — Sondages de groupe · priorité P2 · taille M · session S1
- **Backend** : type de message `poll`, options bornées, un vote par membre, résultats réels seulement. **Web** : composeur et bulle. **Porte** : aucune.

### IC-18 — Partages structurés dans le fil · priorité P2 · taille M · session S1
- **Pour l'utilisateur** : envoyer un profil, une publication, une offre ou une position ponctuelle (jamais en continu).
- **Backend** : pièce de référence (`sharedRef`) relue avec sa garde à la lecture (contenu retiré = « indisponible »). **Porte** : avis juriste pour la position.

### IC-19 — Aperçu des liens · priorité P2 · taille M · session S1
- **Backend** : liens internes d'ANTSIA d'abord (projections publiques) ; externes calculés côté serveur selon la décision 4. **Porte** : décision 4 du § 7.

### IC-20 — Partage d'écran en appel (web) · priorité P2 · taille M · session S1
- **Web** : piste d'écran LiveKit dans `CallStage.tsx` et `GroupCallGrid.tsx`, permission au geste. **Dépend de** : IC-01. **Porte** : clés LiveKit.

### IC-21 — iCom Pro : étiquettes, offre dans le fil, temps de réponse réel · priorité P2 · taille M · session S1
- **Backend** : étiquettes de boutique bornées sur `commercialThreads` ; carte d'offre relue au catalogue reflété (aucun prix figé) ; temps de réponse médian **calculé**, jamais estimé. **Dépend de** : ICP-3, plan 08. **Porte** : aucune.

### IC-22 — iCom natif : groupes, pièces, vocaux, iCom Pro · priorité P1 · taille L · session S3
- **Mobile** : `messages-screen.tsx` (groupes, demandes, archivées), `conversation-screen.tsx` (pièces, vocal, réactions, réponses), appels quand `NATIVE_CALLS_ENABLED` s'ouvre. **Dépend de** : plan 14, lots web correspondants. **Porte** : clés LiveKit, APNs, FCM.

### IC-23 — Décision sur le chiffrement de bout en bout · priorité P3 · taille S · session S1
- **Livrable** : ADR « proposé » couvrant modèle de menace, appareils, clés, récupération, pièces, signalement volontaire, conversations d'équipe (étude `05` § 7) ; texte honnête dans la confidentialité (plan 06). Aucun code. **Porte** : décision du propriétaire.

## 6. Ordre recommandé et dépendances

| Vague | Lots | Pourquoi dans cet ordre |
|---|---|---|
| 1 | IC-02, IC-03, IC-04, IC-05 | Rendre vrai ce qui est promis et protéger avant d'ouvrir ; petits lots sans clé externe |
| 2 | IC-01 | Dès les clés LiveKit et le second compte ; recette après la vague 1 |
| 3 | ICP-3, IC-06, IC-09 | Ordre de l'ADR-0036 ; la sourdine précède la cloche |
| 4 | IC-07, IC-08, IC-10, IC-11, IC-12, IC-13 | Parité attendue (jalon 2) ; IC-07 et IC-08 touchent le schéma |
| 5 | IC-22 | Le natif suit le web (S3) |
| 6 | IC-14 à IC-21, IC-23 | Différenciant et décisions |

Dépendances externes : plan 05 (blocage, profil), plan 06 (Paramètres, préférences, push, économie de données, export), plan 08 (horaires et offres de boutique), plan 12 (file des signalements), plan 14 (natif, push), plan 04 (conférences, lien d'appel), plan 07 (communautés), plan 16 (transcription). Fichiers partagés : `convex/schema.ts` pour IC-04, IC-06, IC-07, IC-08, IC-11, IC-14 à IC-18, IC-21, ICP-3 ; aucune dépendance nouvelle ; aucune entrée de `deploy/catalog.json`.

## 7. Décisions à prendre par le propriétaire

1. **Qui peut m'appeler par défaut.** Recommandation : « mes relations seulement » (`silent` hors relations), modifiable. Raison : aujourd'hui, tout membre peut faire sonner tout membre. **Décidé par le propriétaire le 9/11/2026 :** mes relations seulement (`silent` hors relations), modifiable par chacun.
2. **Demandes de message.** Recommandation : ouvertes aux membres d'adhésion `verifiee`, une demande par paire, texte seul, réglable par le destinataire. Raison : ADR-0019 exige acceptation et quota.
3. **Messages éphémères et vue unique.** Recommandation : reporter après l'avis du juriste. Raison : un contenu disparu ne peut plus appuyer un signalement.
4. **Aperçu des liens externes.** Recommandation : liens d'ANTSIA seulement au pilote. Raison : le serveur irait lire des sites tiers.
5. **Chiffrement.** Recommandation : pas avant l'ouverture ; IC-23 documente. Raison : étude `05` § 7.
6. **Message d'accueil automatique** en plus de l'ADR-0036. Recommandation : oui, désactivé par défaut. Raison : attendu de WhatsApp Business, coût faible.
7. **Durée de conservation** des messages personnels et des demandes refusées. Recommandation : avis du juriste (D7 de l'ADR-0025 en attente ; boutique : 90 jours). Raison : aucune durée n'existe.
8. **Plafond d'appel de groupe.** Recommandation : garder 11 jusqu'à la mesure de charge. Raison : EXF-AN-23 ; aucune charge réelle mesurée.

## 8. Risques et points d'attention

- **DIASPORALE consomme `@antsia/social-features`** (`apps/diasporale_com/src/components/icom.tsx`) : tout changement de la messagerie se vérifie aussi dans DIASPORALE ; la capacité `icomPro` reste fermée chez elle.
- **Transports non recettés** : LiveKit, push et appels natifs ; ne rien annoncer avant IC-01.
- **ADR-0021 encore « Proposé »** alors que le contact commercial est ouvert sur la démo.
- **Index de recherche** : coût d'écriture et fuite possible entre fils ; tests de fuite obligatoires.
- **Fil archivé du moteur** : `status = "archived"` signifie fermé pour les deux ; ne pas le confondre avec l'archivage personnel.
- **Notifications** : aucun contenu ni contact (cliquet `notification-payload-content`).
- **Disque presque plein** : une seule exécution de `verify` à la fois (reprise § 13.1).

## 9. Prompts d'implémentation

### Prompt IC-02
> Session S1. Écris en français ; Opus pour tout le code. Lis `CLAUDE.md`, `docs/etudes/2026-11-09-finalisation/00_PLAN_DIRECTEUR.md` (§ 7), ce plan (§ 2, lot IC-02), `convex/modules/calls/voicemail.ts`, `packages/social-features/src/features/iappel/{IappelJournal,VoicemailRecorder}.tsx`, `convex/modules/files/storageGuard.ts`. Vérifie d'abord qu'aucun écran ne lit encore `voicemail.listMine`. Périmètre : `features/iappel/`, i18n `iappel` fr et en, tests voisins. Livre la rangée « Message vocal » dans le journal (lecture par `playbackUrl`, non lu, marquer lu, supprimer, états vide, chargement, erreur) et la pastille de l'onglet Appels. Vérifie : `bun run verify` (verrou commun), recette à 390, 834, 1440 px, clair et sombre, avec deux comptes de démonstration. Arrête-toi avant toute publication. Mets `EXECUTION.md` du dossier à jour.

### Prompt IC-03
> Session S1. Lis `CLAUDE.md`, ce plan (lot IC-03), `convex/modules/moderation/{tables,targets,reviewProjection}.ts`, `packages/social-features/src/features/messagerie/{CommercialConversationView,MessageActionsSheet,ConversationHeader}.tsx`, `message-actions.ts`, et le plan 12 s'il est rédigé. Ajoute la cible `personalMessage` (le signaleur doit être partie au fil, refus indistinct sinon), branche « Signaler » sur les messages à deux et de groupe, « Bloquer » et « Signaler la personne » dans l'en-tête, en réutilisant la mutation de blocage du graphe. Formulaire React Hook Form + Zod, sonner, i18n fr et en. Étends `network-scoped-functions`. Vérifie : `bun run verify`, un test de garde par cible, recette navigateur trois largeurs, clair et sombre. N'invente aucun délai légal. Arrête-toi avant toute publication.

### Prompt IC-04
> Session S1. Lis `CLAUDE.md`, ce plan (lot IC-04 et décision 1), `convex/modules/calls/{preferences,evaluate}.ts`, `packages/social-features/src/shell/account/my-presence-row.tsx`, `apps/antsia_ga/src/app/(membre)/parametres/settings-screen.tsx`. **Demande-moi la décision 1 avant de changer un défaut.** Livre la rubrique « iCom » des Paramètres : NPD (monter `MyPresenceRow`), qui peut m'appeler, réponses rapides, messagerie vocale, présence, double appel, accusés de lecture réciproques (champ nouveau lu par `messaging/messages.ts`). Chaque interrupteur doit avoir un effet serveur prouvé par un test. Vérifie : `bun run verify`, recette trois largeurs, clair et sombre. Arrête-toi avant toute publication et avant de toucher au schéma si tu n'es pas S1.

### Prompt ICP-3
> Session S1. Lis `CLAUDE.md`, `docs/adr/0036-icom-et-icom-pro.md`, `docs/adr/0021-contact-commercial-et-consentement-crm.md`, ce plan (lot ICP-3), `convex/modules/commercialMessaging/{tables,settings,team,threads,messages,calls}.ts`, `apps/antsia_ga/src/components/shops/contact-team-panel.tsx`, `apps/antsia_ga/src/components/icom-pro/icom-pro-conversations.tsx`, `packages/social-features/src/features/messagerie/CommercialConversationView.tsx`, `convex/seeds/demoConversations.ts`. Livre : semaine d'horaires structurée (fuseau de Libreville), message d'absence envoyé une fois par fil et par période et marqué « Réponse automatique », message d'accueil facultatif désactivé par défaut (selon la décision 6), réponses rapides bornées insérables dans le composeur, assignation visible et modifiable sous mandat vivant. Mets à jour la graine ICP-2. Vérifie : `bun run verify`, recette avec un compte client et un compte de boutique de la démo, trois largeurs, clair et sombre. Arrête-toi avant toute publication et avant toute modification de PRO.GA.

### Prompt IC-07
> Session S1. Lis `CLAUDE.md`, ce plan (lot IC-07), `convex/modules/messaging/{tables,inbox,messages,threads}.ts`, `convex/modules/groups/{tables,messages}.ts`, `packages/social-features/src/features/messagerie/{MessagerieListView,ConversationHeader,MessagerieConversationView}.tsx`. Ajoute des index de recherche sur le contenu des messages à deux et de groupe, filtrés par fil, et une requête qui n'interroge que mes fils (1:1 par paire ; groupe depuis `joinedAt` et après `clearedThrough*`), sans masqués, retirés ni bloqués, paginée et bornée. Branche la recherche globale et la loupe d'une conversation avec saut au message. Écris d'abord les tests de fuite (tiers, ancien membre, bloqué). Vérifie : `bun run verify`, recette trois largeurs, clair et sombre. Arrête-toi avant toute publication du backend.

## 10. Sources lues

- Brief commun et dossier de reprise du 9/11 (§ 2, § 3.6, § 9, § 10, § 13) ; plan directeur (§ 2, § 4, § 7).
- ADR-0019, 0021, 0025, 0027, 0036 ; contrat `CONVERSATION-CONTEXTUELLE-V1.md` (survol, § 14 par l'ADR).
- Études : `2026-10-18-social-commerce/05_MESSAGES_ET_APPELS.md`, `01_BENCHMARK_SOURCES.md`, `09`, rapports `P05_ICOM.md`, `P10_CONTACT_COMMERCIAL.md` ; `2026-10-20-experience-sociale-responsive/01_ANALYSE_REFERENCES.md`.
- Cahier : EXF-AN-22 à 25 ; `docs/04_RAPPORT_PARITE_FRONT.md` (lot F1) ; `docs/06_RAPPORT_LANCEMENT.md` ; `docs/recette/` (index, rapports mobiles et parité).
- Programme : annexes A et D (iCom du socle).
- Vault : `icom-et-icom-pro-2026-10-22.md`, `decisions/2026-10-15-front-icom-duplication.md`, `decisions/2026-10-15-appels-par-reseau-et-participation.md`, `decisions/2026-10-19-conversation-contextuelle-cc.md`, `decisions/2026-10-22-icom-et-icom-pro.md` ; mémoire (index des goûts).
- Code : `convex/modules/{messaging,groups,calls,contextualMessaging,commercialMessaging,moderation,people}`, `convex/crons.ts`, `convex/lib/rateLimit.ts` ; `packages/social-contracts/src/{attachments,messaging,messageReactions,groupCapacity,callGroup,calls}.ts` ; `packages/social-domain/src/{notifications,contextualMessaging}.ts` ; `packages/social-features/src/features/{messagerie,iappel,media-playback}`, `shell/{communication,presence,account}`, `lib/livekit/room-options.ts` ; i18n `messagerie.*`, `iappel.*`, `icomPro.json` ; `apps/antsia_ga/src/{components/messages,components/icom-pro,components/shops,app/(membre)/{messages,actus,parametres}}` ; `apps/antsia_mobile/src/{screens,calls,lib/message-intent.ts}`, `app.config.ts` ; `tests/ratchets/` ; DIASPORALE `apps/diasporale_com/src/components/icom.tsx`.
