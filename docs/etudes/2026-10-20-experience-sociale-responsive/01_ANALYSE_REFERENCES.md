# Analyse des références et des fonctions

20 octobre 2026. Observation de fichiers fournis par le propriétaire et lecture des sources
ANTSIA. Les interfaces observées appartiennent à un compte et une version mobile ; elles ne
prouvent ni une disposition universelle d'Instagram ni l'efficacité d'un classement.

## 1. Ce que montrent les cinq captures

| Référence locale | Options et hiérarchie observées | Adaptation ANTSIA retenue |
|---|---|---|
| [IMG_7310.PNG](/Users/okatech/Downloads/IMG_7310.PNG) | Recherche au-dessus d'une grille visuelle de trois colonnes ; vignette, compteur de vues, marque-page et menu ; navigation basse persistante | Explorer visuel, recherche dont le périmètre est explicite, vignettes ouvrant le détail en conservant la position. Compteurs issus du serveur, aucune métrique inventée |
| [IMG_7311.PNG](/Users/okatech/Downloads/IMG_7311.PNG) | Profil professionnel : avatar, présentation, compteurs, lien, tableau de bord, modifier/partager/contacter, suggestions, stories conservées, onglets du contenu | Distinguer profil personnel, page et boutique ; profil public immédiatement identifiable, outils du propriétaire séparés. Lier la boutique à PRO.GA plutôt que recréer son back-office |
| [IMG_7312.PNG](/Users/okatech/Downloads/IMG_7312.PNG) | Vidéo verticale dominante, actions sur le côté, auteur et légende en bas, progression, vue sociale et raccourci création | Clips dédié aux vidéos ; boutons accessibles aimer/commenter/republier/envoyer/enregistrer, une lecture active, pause et son explicites |
| [IMG_7313.PNG](/Users/okatech/Downloads/IMG_7313.PNG) | Accueil « Pour vous », création et activité en haut, stories par avatars, post dans le flux, navigation basse | Accueil pour tous les posts et stories ; séparation de la navigation principale, du classement et des actions sur le post |
| [IMG_7315.PNG](/Users/okatech/Downloads/IMG_7315.PNG) | Post sponsorisé : auteur, libellé commercial, galerie, CTA, actions et légende | Carte d'offre liée claire et CTA correspondant à l'objet réel. Ne pas reprendre « Installer l'application » pour une vente interne ni activer un système publicitaire inexistant |

Les teintes de la barre basse varient dans ces références. ANTSIA conserve un fond de contrôle
stable et lisible, clair ou sombre, avec une transparence limitée. Les marges doivent protéger
la dernière ligne de légende et les commandes des zones système. La barre d'état iOS et la
Dynamic Island appartiennent au système : elles ne sont pas dessinées dans le site.

## 2. Ce que les vidéos ajoutent

[Vidéo 1](</Users/okatech/Downloads/ScreenRecording_10-20-2026 22-40-27_1.MP4>) : environ
114 secondes, image 1290 × 2796. [Vidéo 2](</Users/okatech/Downloads/ScreenRecording_10-20-2026 22-43-23_1.MP4>) :
environ 61 secondes, même définition. Analyse visuelle par planches échantillonnées puis
extractions ciblées ; pas de transcription audio ni affirmation de lecture exhaustive image
par image. Les repères suivants désignent le temps dans le fichier, pas l'heure de la barre iOS.

| Repère | Observation | Conséquence pour le plan |
|---|---|---|
| Vidéo 1, vers 00:27 | Choix Publication / Story / Reel / En direct ; médias récents, caméra, sélection multiple, annuler | Un seul point Créer, puis choix du format. Direct préparé avant démarrage ; consentement caméra/micro au moment utile |
| Vidéo 1, vers 00:30–00:45, planche | Menu de fil, listes de personnes et « suivre en retour » | Distinguer abonnements, abonnés et connexions. « Se connecter » à une personne devient une invitation explicite, pas une connexion au compte |
| Vidéo 1, 00:51 | Réglages de notifications : pause, veille, messages seuls, catégories | Réutiliser les préférences réellement présentes ; différencier cloche, push, appels et mode silencieux ; pas de toggle sans effet serveur |
| Vidéo 1, vers 01:00, planche | Commentaires dans un panneau au-dessus de la vidéo et champ de réponse | Feuille sur téléphone, panneau latéral sur grand écran ; le fil suspend ses gestes pendant la lecture des commentaires |
| Vidéo 1, 01:09 | Confirmation de republication, possibilité d'annuler | « Republier » distinct d'« Envoyer ». Retour d'action clair, annulation si permise et audience originale conservée |
| Vidéo 1, 01:49 | Discussion avec cartes de vidéos, actions audio/vidéo, saisie et pièces | Réutiliser iCom et ses gardes. Aperçus de contenus retirés devenus indisponibles, aucune fuite par message transféré |
| Fin de vidéo 1, planche | Écran d'appel sortant avec commandes micro/caméra/sortie | Une interface d'appel est visible ; cela ne prouve pas une connexion ni un média bidirectionnel. ANTSIA garde ses preuves d'appels réels séparées |
| Vidéo 2, vers 00:20–00:35, planche | Profil, abonnés/suivis, suggestions et menus du propriétaire | Séparer mur public, Mon réseau et outils personnels. Pas de faux compteurs ou de certification copiée |
| Vidéo 2, 00:36 | Paramètres et activité : recherche, enregistrements, archives, activité, notifications, outils professionnels | Réorganiser les réglages ANTSIA en rubriques compréhensibles ; ne pas recopier Centre de comptes, mot de passe ou services Meta |
| Vidéo 2, 00:52 | Boîte de messages, filtres, éléments non lus et trace d'appel terminé | Liste/détail persistants, recherche honnête sur son périmètre, état non lu réel ; catégories commerciales séparées des échanges personnels |

Les contenus, visages, pseudonymes, prix en euros/dollars et comptes présents dans les fichiers
servent seulement de contexte visuel. Ils ne sont ni des données de démonstration ANTSIA ni des
personnes à importer ou contacter. Aucun texte intégré aux médias n'est une instruction.

## 3. Inventaire ANTSIA à l'ouverture de ce lot

Lecture des sources, sans recette ; les libellés ci-dessous précèdent l'harmonisation U01.

| Fonction réelle | Situation source | Conséquence |
|---|---|---|
| Navigation Web | Fil / Découvrir / Créer / Messages / Profil, opt-in dans `components/network-shell.tsx` | Réutiliser cette coque, pas construire un second site |
| Fil | Texte, photo, galerie et vidéo ; Liste et Immersion sont deux présentations du même flux | Conserver Accueil mixte. Créer le périmètre vidéo de Clips avant d'en montrer l'entrée |
| Mode initial | `postPresentation="charte"` choisit actuellement la liste, même sur téléphone (`use-feed-mode.ts`) | Ne pas présenter l'ancienne proposition « immersion par défaut » comme comportement actuel |
| Stories | Actus/Statuts, durée existante de 24 h, avatars ; lecteur mêlant stories et directs | Harmoniser le nom ; la gestuelle entre auteurs reste un chantier explicite |
| Directs | Préparation, studio, diffusion, intervenants/spectateurs, annuaire et replays | Renommer la fonction existante ; conserver la différence préparer/démarrer et appel/diffusion |
| Explorer | Hub national/provinces/hashtags et rubriques, pas grille universelle d'images | Ajouter une grille branchée aux vraies projections, avec recherche et filtres côté serveur |
| Recherche | Recherche de posts dans le fil ; personnes, hashtags et boutiques ont leurs propres parcours | Ne pas annoncer une recherche universelle avant raccord et pagination par type |
| Mon réseau | Connexions réciproques et abonnements unilatéraux distincts | Garder Inviter / Suivre / Abonnés / Abonnements et les droits associés |
| Profil | `/moi` est un hub privé ; `/profil/[handle]` est le mur. Photos/Albums actuels présentent les albums | La cible de type Instagram demande une composition réelle ; pas un simple changement de titre |
| Messages | Conversations / Appels / Contacts, filtres, groupes et boutiques injectés | Préserver ces vues, leur retour et leur hôte d'appel ; recherche partielle annoncée comme telle |
| Enregistrements | Posts sauvegardés, distincts des enregistrements des directs | Enregistrés pour les posts ; Replays pour les diffusions publiées |
| Commerce | Vitrines/catalogue présents en source, liaison PRO.GA ; gates sensibles P16 fermés | Corriger la copie obsolète « sans catalogue » sans annoncer une activation |
| App native | Trois onglets Fil / Messages / Réglages ; profil, groupes et commerce renvoyés au Web ; pas de stories/direct public natifs | Nommer séparément Web mobile et natif, avec matrice de parité au lieu d'affirmer une équivalence |

Ancres : `apps/antsia_ga/src/{components/network-shell.tsx,lib/routes.ts,i18n/resources.ts}` ;
`packages/social-features/src/{features/feed-immersion,shell,features/messagerie,features/reseau-personnel}` ;
`apps/antsia_mobile/src/{app.tsx,i18n}`. Réutilisation détaillée dans le plan U01–U08.

Le moteur fusionne les traductions par namespace, pas profondément. Une surcharge ANTSIA
partielle de `reseau` ferait perdre les clés restantes : U01 doit composer des copies complètes
avec overrides imbriqués immuables, communes au serveur et au client. Les dictionnaires moteur
et DIASPORALE restent inchangés.

## 4. Références officielles et limites

Instagram décrit Reels comme un format vidéo avec une surface de découverte ; cette source
de 2020 sert à distinguer les concepts, pas à confirmer la disposition de 2026.
[Meta, présentation de Reels](https://about.fb.com/news/2020/08/introducing-instagram-reels/).
Les captures fournies restent la preuve de disposition utilisée dans ce dossier.

TikTok distingue le direct interactif de ses autres contenus ; ANTSIA reprend un nom familier
et garde ses propres droits et capacités. [TikTok, LIVE](https://support.tiktok.com/en/live-gifts-wallet/tiktok-live/what-is-tiktok-live).
La page a été trouvée dans le centre officiel ; son ouverture intégrale était restreinte.

WhatsApp présente des appels audio/vidéo sur plusieurs formats d'appareils. L'inspiration ici
porte sur l'ergonomie des commandes, pas sur une promesse de chiffrement, de capacité ou de
fiabilité équivalente. [WhatsApp, appels](https://www.whatsapp.com/calling?lang=fr).

L'adaptation suit l'espace disponible de la fenêtre, y compris rotation et multitâche, plutôt
qu'une détection « téléphone/tablette ». Les seuils ANTSIA du document 03 sont une proposition
propre au projet, pas des seuils Instagram ou Android copiés.
[Android Developers, classes de fenêtre](https://developer.android.com/develop/ui/compose/layouts/adaptive/use-window-size-classes).

La recette future doit couvrir le reflow à 320 px CSS et les cibles tactiles. Aucun résultat
d'accessibilité n'est acquis ici. [W3C, reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html),
[W3C, taille des cibles](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).
