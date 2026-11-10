# ANTSIA — Profils et pages

Date du relevé : **20 octobre 2026**.

Source exacte : [artifact ANTSIA, page `141bfccdd938`](https://claude.ai/artifact/AnLxkaqaai725ywzkrVk6b#page-141bfccdd938).

**Statut : relevé DOM/CSS du canevas de référence.** Les quatre planches sont
présentées sur mobile `390 × 844`, tablette `834 × 1194` et bureau `1440 × 1024`.
Les identités, compteurs, statuts et commandes décrits sont ceux du dessin.
Ils ne prouvent ni données réelles ni validation de toutes les interactions de l'application.

Les routes servent de repères du canevas ; leur correspondance avec le code
reste à vérifier. Les règles partagées sont définies dans le [socle commun](../00_SOCLE_COMMUN.md).

## Inventaire des quatre planches

| N° | Fichier de planche | Route ou contexte | Composition | Actions principales |
|---|---|---|---|---|
| 1 | `Profil.dc.html` | `/profil/clarisse.obame` | Couverture, avatar, nom, handle, accroche ; relation ; onglets ; cartes de publications | Connecté / Suivre, Écrire, Appeler, Publications / Photos / Albums |
| 2 | `Moi.dc.html` | `/moi` | Mon activité ; Préférences ; Compte et données ; sortie | Profil public, enregistrements, actus, boutique, panier, achats, préférences, compte et données, déconnexion |
| 3 | `Album.dc.html` | `/profil/…/albums/…` | Retour au profil, titre d'album, auteur et handle, indication « 24 photos », description, grille | Revenir au profil, consulter les photos |
| 4 | `Page.dc.html` | `/page/mairie-libreville` | Avatar carré arrondi, Officiel, handle, type Institution, bio, abonnés et publications ; fil de page | Suivre, consulter le fil et l'agent qui publie |

## Composants et états dessinés

### Profil d'une personne

La couverture et l'avatar précèdent l'identité, le handle et l'accroche.
La planche distingue le libellé de relation **Connecté** de l'action **Suivre**.
Écrire et Appeler sont des actions propres ; leur présence ne prouve pas
la disponibilité réelle du destinataire ni l'admission d'un appel.

Les trois rubriques sont **Publications**, **Photos** et **Albums**.
Les publications sont représentées par des cartes dans le profil.
Le relevé ne fixe pas de limite de pagination ni de comportement de chargement supplémentaire.

L'identité de personne et celle de page ne doivent pas être confondues.
Le [socle commun](../00_SOCLE_COMMUN.md) conserve l'avatar de personne rond et
l'avatar de page carré arrondi ; les noms suivent la convention d'identité du projet.

### Espace personnel « Moi »

La planche regroupe les accès sous **Mon activité**, **Préférences** et
**Compte et données**, avec une commande de déconnexion.
Mon activité donne accès au profil public, aux enregistrements, aux actus,
à la boutique, au panier et aux achats.

Ces entrées sont des destinations, pas des indicateurs de possession de données.
Une entrée boutique ne prouve pas qu'une boutique existe pour la personne ;
une entrée achats ne prouve pas qu'une transaction a été effectuée.
Le raccordement doit conserver les états réels et les gardes de chaque destination.

### Album

L'album présente un retour au profil, un titre, l'auteur avec son handle,
une description et une grille de photos.
L'indication **24 photos** appartient à la planche relevée ; elle n'est pas
une limite de produit ni un nombre de fichiers vérifiés dans l'application.

La grille est un composant de consultation. Les modalités de lecture d'une photo,
de navigation entre médias et de retour à la grille ne sont pas établies par ce relevé.
Elles restent à confronter au lecteur réel avant d'être déclarées conformes.

### Page institutionnelle

La page `/page/mairie-libreville` montre un avatar carré arrondi, le badge
**Officiel**, un handle, le type **Institution**, une bio et les compteurs
d'abonnés et de publications. Suivre reste une action explicite.

Le fil identifie l'agent qui publie pour la page.
Cette attribution doit rester visible et distincte de l'identité institutionnelle.
Le badge dessiné ne remplace pas le calcul serveur du statut officiel.
Les compteurs sont des éléments du canevas, sans preuve de leur valeur dans la base réelle.

## Adaptation aux trois formats

| Vue du canevas | Mesures communes attestées |
|---|---|
| Mobile `390 × 844` | Padding principal `4px 12px 120px` ; dock à cinq destinations, côtés `12px`, bas `16px` |
| Tablette `834 × 1194` | Contenu principal maximum `728px`, padding `8px 24px 140px` ; dock centré de `540px`, bas `26px` |
| Bureau `1440 × 1024` | Grille commune `248px minmax(0, 1fr) 312px`, gap `24px`, largeur maximale `1400px`, padding `20px` |

Ces mesures ne définissent pas les dimensions propres de la couverture,
de l'avatar ou des cellules de l'album : ces dimensions restent à relever si nécessaires.
Les noms, handles, descriptions et actions doivent conserver leur lisibilité
dans les trois compositions sans attribuer au relevé des états non observés.

## Rôle des couleurs

Suivre utilise le rôle social et Écrire le message tonal du thème courant.
Les états sélectionnés des rubriques utilisent le traitement tonal partagé.
Badges de confiance, identité de page et actions suivent le [socle commun](../00_SOCLE_COMMUN.md) ;
changer de palette ne modifie aucun droit ni statut de confiance.

Palettes : [Gaboma](../01_GABOMA.md), [Soleil](../02_SOLEIL.md),
[Forêt](../03_FORET.md), [Corail](../04_CORAIL.md), [Lagon](../05_LAGON.md),
[Électrique](../06_ELECTRIQUE.md), [Sable](../07_SABLE.md).

## Points à vérifier à l'implémentation

- Raccorder les quatre planches aux profils, pages et albums réels.
- Vérifier les états Connecté / Suivre et les conditions d'accès à Écrire et Appeler.
- Conserver le nom de personne normalisé, le handle et l'identité de page sans les confondre.
- Vérifier droits de lecture, médias admis, pagination, alternatives d'images et erreurs de chargement.
- Calculer les badges côté serveur et préserver l'attribution de l'agent publiant pour une page.
- Distinguer compteurs réels et valeurs de démonstration, notamment les « 24 photos » de l'album.
- Vérifier les destinations de Moi, leurs états vides et la déconnexion réelle.
- Contrôler navigation clavier, focus, libellés longs et rendu dans les trois formats et sept thèmes.
