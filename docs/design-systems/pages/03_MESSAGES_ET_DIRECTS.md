# ANTSIA — Messages, appels et directs

Date du relevé : **20 octobre 2026**.

Source exacte : [artifact ANTSIA, page `4433752910e1`](https://claude.ai/artifact/AnLxkaqaai725ywzkrVk6b#page-4433752910e1).

**Statut : relevé DOM/CSS du canevas de référence.** Les cinq planches sont
présentées dans les vues mobile `390 × 844`, tablette `834 × 1194` et bureau
`1440 × 1024`. Les états et commandes décrits sont ceux dessinés dans le canevas.
Ce relevé ne démontre ni communication réelle ni exécution de toutes les interactions.

Les routes ci-dessous sont les repères des planches, à rapprocher des routes de
l'application. Les primitives et règles partagées figurent dans le [socle commun](../00_SOCLE_COMMUN.md).

## Inventaire des cinq planches

| N° | Fichier de planche | Route ou contexte | Composition | Actions principales |
|---|---|---|---|---|
| 1 | `Messages.dc.html` | `/messages` | Boîte de conversations, recherche, filtres ; panneau vide « Choisissez une conversation » | Toutes / Non lues / Groupes / Boutiques, nouveau message, nouveau groupe |
| 2 | `Conversation-commerciale.dc.html` | `/messages/commerce/…` | Boutique, équipe habilitée, objet et contexte ; conversation acceptée ; messages et demande PRO.GA | Bloquer, clore, paginer, joindre, envoyer, retirer son message, signaler, demande PRO.GA |
| 3 | `Appel.dc.html` | `/messages/chat/…` | Appel en communication avec durée, vidéo principale et vignette personnelle indiquée comme déplaçable | Réduire, micro, caméra, retourner, haut-parleur, sortie audio, ajouter, attente, raccrocher |
| 4 | `Direct.dc.html` | `/direct/…` | Titre, organisateur, page, audience ; salle ; présents et admissions ; discussion | Rejoindre la salle, Discussion / Antenne, envoyer un commentaire, quatre réactions |
| 5 | `Conference.dc.html` | `/conference/…` | Conférence réservée aux invités, grille de participants, présents et admissions | Auto / Grille / Orateur / Cinéma, épingler, plein écran, micro, caméra, partage d'écran, quitter, Discussion / Antenne |

## Composants et états dessinés

### Boîte de conversations

Les quatre filtres sont **Toutes**, **Non lues**, **Groupes** et **Boutiques**.
La recherche et les filtres portent sur les conversations chargées.
La planche annonce une limite aux **50 premiers groupes** ; cette limite ne doit
pas être présentée comme une recherche exhaustive de tous les groupes.

Les actions nouveau message et nouveau groupe sont distinctes.
Sans conversation sélectionnée, le panneau affiche **Choisissez une conversation**.
Ce panneau vide est un état dessiné ; il ne représente pas un échec de chargement.

### Conversation commerciale

L'identité de boutique et son équipe habilitée accompagnent l'objet de l'échange.
La conversation est montrée **acceptée** et **sans lien personnel** entre les parties.
Bloquer et clore sont deux commandes distinctes.
La pagination de la boîte et celle des messages sont représentées.

Joindre et envoyer appartiennent à la composition du message.
Le retrait de son propre message et le signalement sont relevés séparément.
Les appels audio / vidéo sont conditionnés à un **opt-in des deux côtés**.
La présence de ces commandes ne démontre pas une autorisation ni une délivrance effective.

La demande PRO.GA comporte une extraction **explicitement saisie** : texte de
**1 à 2 000 caractères**, alias facultatif et consentement coché.
**Aucun historique n'est prérempli dans cette demande.** Cette absence concerne
l'extraction PRO.GA, pas l'affichage des messages de la conversation elle-même.

### Appel individuel

La planche affiche un appel **en communication**, avec durée.
La vidéo principale et la vignette personnelle constituent deux surfaces distinctes.
La vignette est indiquée comme déplaçable ; réduire conserve une commande propre.

Le bandeau présente micro, caméra, retournement, haut-parleur, sortie audio,
ajout, attente et raccrochage. Les permissions du navigateur, les périphériques
disponibles et les effets réels de ces commandes restent à vérifier.
La durée dessinée ne constitue pas une mesure d'appel effectué.

### Direct

Le direct identifie titre, organisateur, page et audience.
**Rejoindre la salle** précède l'écoute ; micro et caméra du spectateur sont éteints.
Le nombre de présents reste distinct du nombre d'admissions.
Le libellé **Enregistrement en cours** est représenté : il ne prouve pas
qu'un enregistrement a été produit ou conservé par l'application.

Les espaces **Discussion / Antenne**, la saisie d'un commentaire, son envoi et
quatre réactions font partie des commandes relevées.
Les noms et effets des quatre réactions ne sont pas déduits de ce seul relevé.

### Conférence

La conférence est annoncée **réservée aux invités** et montre une grille de participants.
Les choix de présentation sont **Auto**, **Grille**, **Orateur** et **Cinéma**.
Épingler une personne est une préférence **pour soi**, distincte d'une modification
de la vue des autres participants.

Plein écran, micro, caméra, partage d'écran et quitter sont représentés.
Les présents et les admissions restent distincts, comme dans le direct.
La conférence propose aussi les espaces **Discussion / Antenne**.

## Adaptation aux trois formats

| Vue du canevas | Mesures partagées utiles à cette famille |
|---|---|
| Mobile `390 × 844` | Padding principal commun `4px 12px 120px` ; dock à cinq destinations, côtés `12px`, bas `16px` |
| Tablette `834 × 1194` | Contenu principal maximum `728px`, padding `8px 24px 140px` ; dock centré de `540px`, bas `26px` |
| Bureau `1440 × 1024` | Grille d'application `248px minmax(0, 1fr) 312px`, gap `24px`, largeur maximale `1400px`, padding `20px` |

La boîte Messages utilise sa propre barre de quatre entrées : **Menu, Conversations, Appels, Contacts** (classe source `dock d4`), relevée dans `Messages.dc.html`. Elle conserve le rayon, la transparence et les ancrages du dock commun ; ses quatre destinations remplacent les cinq destinations sociales sur cet écran.

Ces mesures sont celles de la coque commune du canevas ; elles ne fixent pas
la taille de chaque vidéo, participant ou panneau de conversation.
Le maintien de la saisie, des commandes d'appel et des panneaux avec le clavier
ou le plein écran doit être contrôlé lors de l'implémentation.

## Rôle des couleurs

Les messages et leurs actions lisent les jetons du thème courant.
Accepter et reprendre utilisent le rôle validation ; refuser et raccrocher le danger ;
les commandes neutres et les états sélectionnés suivent le [socle commun](../00_SOCLE_COMMUN.md).
La couleur accompagne un libellé ou une icône et ne remplace pas l'état annoncé.

Palettes : [Gaboma](../01_GABOMA.md), [Soleil](../02_SOLEIL.md),
[Forêt](../03_FORET.md), [Corail](../04_CORAIL.md), [Lagon](../05_LAGON.md),
[Électrique](../06_ELECTRIQUE.md), [Sable](../07_SABLE.md).

## Points à vérifier à l'implémentation

- Vérifier les cinq routes et la continuité entre boîte, conversation, appel, direct et conférence.
- Conserver les bornes de recherche et pagination sans suggérer une liste exhaustive.
- Vérifier l'habilitation de l'équipe commerciale et l'opt-in bilatéral des appels.
- Garantir une extraction PRO.GA explicite, bornée et consentie sans historique prérempli.
- Vérifier les droits de retrait, signalement, blocage et clôture avec les données réelles.
- Distinguer invitation, admission, présence, écoute et enregistrement effectif.
- Tester permissions, périphériques, partage d'écran et reprise après interruption.
- Contrôler clavier, annonces accessibles, focus et lisibilité des commandes dans les trois formats.
