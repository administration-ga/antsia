# Aperçus photo et vidéo en production — 20 octobre 2026

**Recette terminée le 20/10/2026 à 20:46 (Europe/Paris)** sur
[ANTSIA en production](https://antsia.vercel.app/fil), dans un onglet dédié du
profil Chrome Asted, avec la session membre existante du propriétaire issue
du raccordement IDN. Aucun nouveau parcours de connexion, consentement ou
changement de compte n'a été déclenché. L'action « Vérifier avec IDN » de
renforcement de l'identité n'a pas été utilisée : elle est distincte de la
session de connexion demandée ici.

Version de santé : `audio-gesture-20261020-82c4108726107498` ; les scripts
réellement chargés portent `dpl_3mKcBfqz71UrTM6JLJhBkWrJ6mZd`.

## Résultats

**12 contrôles réussis**, sur la charte Gaboma existante :

| Média | Mode | Mobile 390×844 | Tablette 834×1112 | Bureau 1440×1000 |
|---|---|---|---|---|
| Photo PNG | Clair | Aperçu décodé | Aperçu décodé | Aperçu décodé |
| Photo PNG | Sombre | Aperçu décodé | Aperçu décodé | Aperçu décodé |
| Vidéo H.264 | Clair | Première image décodée | Première image décodée | Première image décodée |
| Vidéo H.264 | Sombre | Première image décodée | Première image décodée | Première image décodée |

Dans chaque cas : aperçu 320×180 chargé depuis une URL blob locale, entièrement
contenu dans le viewport, un dialogue et un seul champ fichier, nom du fichier
technique présent, aucun débordement horizontal. La vidéo charge sa durée de
1 seconde. Les deux modes sont constatés dans la classe `dark` rendue et les
captures, au-delà du seul choix dans le menu.

- Fermer et rouvrir conserve la photo puis la vidéo ; les aperçus restent
  disponibles après les changements de taille et de mode.
- Sélecteur vidéo ouvert à 390 px, largeur passée à 1440 avant sélection :
  fichier accepté et aperçu décodé. Même contrôle inverse photo 1440→390 :
  sélection et aperçu réussis.
- Console de cet onglet : zéro avertissement/erreur, aucun message AudioContext
  ou « Node cannot be found in the current page » pendant les essais.

## État final conservé

Fichiers techniques non personnels retirés un par un ; zéro média, texte vide,
aucun abandon proposé et bouton Publier désactivé. Composeur fermé. Apparence
**Système** rétablie, thème **Gaboma** préservé, dimensions du navigateur remises
à leur défaut. Les autres onglets, brouillons et publications ont été conservés.

**Aucune action de publication ni de téléversement serveur effectuée par l'agent.**
L'aperçu utilise un blob local ; le bouton d'envoi n'a jamais été actionné.
Aucun fichier source applicatif, environnement, backend ou déploiement changé
pour cette recette.

## Preuves et portée

[Mesures structurées](recette/idn-2026-10-20/apercus-production/mesures.json),
12 captures de viewport, une capture de sélection à travers la bascule et une
capture du brouillon vide dans le même dossier. Fixtures techniques et
empreintes : [inventaire](recette/idn-2026-10-20/selecteur-apres-correctif/fixtures.json).
Aucun identifiant interne de compte, jeton ou donnée d'authentification enregistré.

Les tailles sont simulées dans Chrome ; aucun appareil physique distinct.
La lecture d'un média publié, son transport et l'analyse de sécurité ne sont
pas testés par cette recette sans envoi. Cette passe complète la réserve
« aperçu membre de production non retesté » des rapports
[média](26_SELECTEUR_MEDIAS_RESPONSIVE_2026-10-20.md) et
[audio](27_DEVERROUILLAGE_AUDIO_2026-10-20.md).

## Contrôle supplémentaire après rechargement

Après la matrice réussie, le retrait des médias et la restauration visible des
préférences, un rechargement a ramené cet onglet sur l'écran de connexion IDN.
Aucune action de déconnexion n'a été effectuée par l'agent. La cause de cette
fin de session n'est pas établie par ce contrôle ; les essais de déconnexion
des autres sessions ont déjà été observés dans ce projet, sans preuve de
corrélation à cet instant. Les préférences Système/Gaboma avaient été
constatées rétablies avant le rechargement ; leur persistance après celui-ci
n'a pas pu être confirmée sans nouvelle connexion. Les 12 mesures et captures
membre précédentes restent valides. Une capture de cet état est conservée dans
`session-apres-rechargement.png` ; la dimension du navigateur est rétablie.
