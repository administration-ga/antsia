# Architecture des écrans — téléphone, tablette et ordinateur

20 octobre 2026. **Spécification cible, pas un rendu vérifié.** Les noms sont définis dans
[le lexique](02_NOMS_ET_MICROTEXTES.md) ; l'ordre de réalisation et les prompts sont dans
[le plan](04_PLAN_IMPLEMENTATION.md). La marque ANTSIA reste identique sur tous les formats.

## 1. Partir de ce qui existe

L'inventaire suivant décrit la base **avant U02**. U02 a depuis raccordé l'option ANTSIA à
768/1200 dans les sources Web, sans changer les seuils par défaut du moteur. Son
[bilan source](rapports/U02_NAVIGATION_RESPONSIVE_2026-10-20.md) précise les fichiers, le cadre
Messages et les limites ; aucune recette ne valide encore ce raccord.

| Sujet | Sources actuelles | Cible de ce dossier |
|---|---|---|
| Coque Web | Mobile jusqu'à 959 px, bureau dès 960 px ; barre Fil/Découvrir/Créer/Messages/Profil avant U01 | Trois compositions ANTSIA ; conserver les règles du moteur pour DIASPORALE |
| Accueil | Liste initiale ; immersion disponible, incluant texte, photo et vidéo | Liste confortable et immersion facultative ; Clips séparé, réservé à la vidéo |
| Largeur du fil | Conteneurs 640/680 px selon les seuils ; composition bureau autour de 680–792 px et rail contextuel 312 px selon la place | Colonne de lecture maîtrisée ; ne pas étirer une publication sur tout un écran large |
| Explorer | Hub de découverte, recherche et destinations ; pas une grille universelle de médias | Recherche identifiable, filtres, grille de médias et accès aux boutiques |
| Profil | `/moi` est un espace personnel de gestion ; le mur public est distinct | Entrée Profil cohérente, avec aperçu public et raccourcis de gestion explicites |
| App native | Trois onglets Fil/Messages/Réglages avant U01 ; plusieurs capacités renvoient au Web | Parité progressive des destinations, seulement lorsque les écrans natifs existent |

Repères : `apps/antsia_ga/src/components/network-shell.tsx`, `packages/social-features/src/shell/reseau-layout.ts`,
`packages/social-features/src/shell/ReseauAgentPage.tsx`, le module `features/feed-immersion`,
et `apps/antsia_mobile/src/app.tsx`. Cet état vient d'une lecture des sources, sans recette.

## 2. Composer selon la fenêtre disponible

Les seuils ci-dessous sont une **proposition propre à ANTSIA**, en pixels CSS. Ils ne sont
ni une norme ni une modification déjà faite du moteur. La composition dépend aussi de la
hauteur, du clavier, du zoom et des panneaux ouverts. Une tablette en écran partagé peut
utiliser la composition téléphone ; un ordinateur avec une fenêtre étroite aussi.
La [documentation Android sur les fenêtres adaptatives](https://developer.android.com/develop/ui/compose/layouts/adaptive/use-window-size-classes)
confirme ce principe de composition selon l'espace disponible ; ses seuils en dp sont distincts.

| Fenêtre cible | Navigation | Contenu | Panneaux secondaires |
|---|---|---|---|
| Téléphone : moins de 768 px | Barre basse, cinq destinations ; création « + » en haut | Une colonne ; médias sur la largeur utile | Feuilles ou écrans dédiés ; aucun panneau permanent qui écrase le fil |
| Tablette : 768–1199 px | Rail compact avec infobulles, noms accessibles et état actif | Une colonne centrée ; deux panneaux seulement si leur largeur reste suffisante | Détail, commentaires ou conversation à côté quand la place le permet |
| Ordinateur : dès 1200 px | Rail avec icônes et noms, bouton Créer et raccourci Boutiques | Fil centré ; lecteur vertical contenu dans la fenêtre | Colonne contextuelle facultative, sans trois zones concurrentes par défaut |

En paysage court ou avec clavier, revenir à une composition simple si nécessaire. Ne pas
détecter un modèle d'appareil ou un navigateur pour décider du nombre de colonnes. Employer
CSS et les requêtes de conteneur ; réserver les mesures JavaScript aux comportements qui
exigent réellement la taille, avec un premier rendu serveur stable.

## 3. Navigation proposée

**Accueil · Clips · Messages · Explorer · Profil**. Les icônes ont toujours un nom accessible.
L'état actif associe forme ou fond et nom, sans dépendre de la seule couleur. Les compteurs
de non-lus ne déplacent pas la barre. Les alertes restent accessibles dans l'en-tête.

- **Accueil** : posts et Stories ; menu « Pour vous / Abonnements » uniquement pour les
  portées réellement disponibles. « Mon fil » reste la gestion des masqués et sourdines.
- **Clips** : vidéos courtes verticales, une seule lecture à la fois. Ce bouton attend U04 :
  le mode immersif mixte actuel ne suffit pas à le créer.
- **Messages** : conversations, appels et contacts ; badge de non-lus réel.
- **Explorer** : rechercher et découvrir contenus, personnes et boutiques, avec filtres
  correspondant aux capacités de recherche effectivement raccordées.
- **Profil** : ma présence, mon réseau et mes espaces ; les professionnels accèdent aussi
  à leur boutique et à leur activité.

**Transition obligatoire** : conserver le bouton Créer actuel dans la barre tant que Clips
n'est pas raccordé. Déplacer Créer vers « + » et substituer Clips dans une même tranche
fonctionnelle ; aucune destination vide. Sur ordinateur, Créer garde un bouton nommé.

Les boutiques doivent se retrouver en un geste depuis Explorer, et par un raccourci visible
dans le rail large. Ne pas ajouter une sixième icône comprimée sur téléphone. Les liens vers
services, emplois, groupes et événements restent accessibles dans leurs espaces et le menu.

### Schémas de composition

```text
TÉLÉPHONE
[ + Créer ]       Pour vous ▾       [ Alertes ]
[ Ma story ][ Story ][ Story ]  →
[ Auteur · menu                             ]
[               Média                       ]
[ Aimer · Commenter · Envoyer      Enregistrer ]
[ Texte · lien produit si disponible         ]
[ Accueil | Clips | Messages | Explorer | Profil ]
             zone système protégée

TABLETTE
[rail] [ titre / recherche / création                       ]
[rail] [      fil ou grille          ][ détail facultatif   ]
[rail] [      une seule lecture      ][ selon espace utile  ]

ORDINATEUR
[ANTSIA + noms] [      en-tête et contenu       ][ contexte   ]
[Accueil      ] [      fil de lecture          ][ facultatif ]
[Clips        ] [      ou grille Explorer      ][            ]
[Messages     ] [      ou vue conversation     ][            ]
[Explorer     ] [                               ][            ]
[Profil       ] [                               ][            ]
[Boutiques    ] [                               ][            ]
[Créer        ] [                               ][            ]
```

## 4. Adapter chaque famille d'écrans

| Écran | Téléphone | Tablette | Ordinateur |
|---|---|---|---|
| Accueil | Stories horizontales, posts en pile, commandes proches du média | Fil centré ; suggestions en panneau seulement si utiles | Colonne de lecture, contexte discret, accès direct à la création |
| Explorer | Recherche et filtres ; grille trois colonnes par défaut | Quatre ou cinq colonnes selon la largeur des cellules | Cinq ou six colonnes si lisibles ; filtre latéral possible |
| Clips | Vidéo verticale dans la hauteur utile ; commandes latérales et texte lisible | Lecteur vertical centré ; commentaires à côté si possible | Lecteur centré, touches précédent/suivant, panneau de commentaires facultatif |
| Profil | Avatar, bio, compteurs et actions ; onglets de contenus puis gestion séparée | En-tête plus large ; mêmes onglets et ordre de lecture | En-tête contenu, grille et raccourcis de gestion ; pas de bio étirée |
| Page / Boutique | Identité, offre principale, produits/services, contact et conditions | Catalogue et filtres côte à côte si lisibles | Catalogue multi-colonnes, détails et activité marchande clairement séparés |
| Messages | Liste puis conversation ; retour qui conserve position et brouillon | Liste et conversation si leur largeur suffit | Liste, conversation ; informations du contact à la demande |
| Appel privé | Écran d'appel prioritaire, micro/son/caméra/raccrocher, retour à l'appel | Même hiérarchie ; présentation adaptée au nombre réel de participants | Fenêtre d'appel dans la coque ; commandes nommées au survol et au clavier |
| Direct public | Lecture et interactions ; identité de l'hôte ; quitter clairement | Vidéo et discussion si la place le permet | Vidéo et discussion, studio distinct pour l'hôte |
| Création | Feuille de choix puis étape adaptée au format ; brouillon conservé | Dialogue large ou page ; aperçu à côté si utile | Formulaire et aperçu ; mêmes validations et droits |
| Commentaires / partage | Feuille accessible ou écran complet avec clavier | Panneau secondaire ou dialogue | Panneau ancré ; retour au post sans perte de position |
| Réglages / Mon fil | Sections courtes, recherche seulement si réelle, annulation de masquage/sourdine | Menu et détail si espace suffisant | Navigation de sections et contenu ; actions sensibles explicites |

Une grille n'impose pas trois colonnes à 320 px avec texte agrandi : réduire le nombre de
colonnes si les cellules deviennent inutilisables. Les miniatures peuvent être recadrées
avec une règle annoncée ; la consultation doit permettre de voir l'image ou le produit entier.
Un texte seul garde une représentation lisible, sans fabriquer une vidéo.

Pour le fil bureau, viser initialement environ 640–680 px pour la lecture, puis ajuster au
contenu et à la coque existante lors d'une recette autorisée. C'est une proposition, distincte
des largeurs actuelles. Les fiches produit, messageries et grilles peuvent employer davantage
de largeur : ne pas leur appliquer le plafond du fil.

## 5. Publications, Stories, Clips et Directs

**Post** : auteur, date/audience, menu ; média ; actions ; texte et commentaires. Les carrousels
annoncent le nombre d'éléments et leur position ; des boutons complètent le balayage. Une
offre ajoute une carte contextuelle et une seule action principale adaptée à son état.

**Story** : progression, auteur, pause, précédent/suivant et fermer. Définir explicitement le
passage entre éléments puis entre auteurs ; le viewer actuel ne reçoit pas ces gestes par
simple changement de nom. Respecter la durée réelle de disponibilité et les droits existants.

**Clip** : séparation nette entre défiler verticalement entre vidéos et glisser un carrousel.
Lecture automatique éventuelle uniquement pour le contenu visible et admissible ; proposer
un contrôle audio, les sous-titres disponibles et une option de défilement moins contraignante.
Le défilement par page ne doit pas empêcher de lire un texte long ou d'utiliser le clavier.

**Direct** : « Préparer le direct », « Lancer le direct », « En live », puis « Replay » seulement
si un replay existe réellement et reste autorisé. Les appels audio/vidéo privés restent dans
Messages → Appels. Ne pas mélanger rejoindre un public et appeler une personne.

Ne pas reproduire dans ANTSIA la barre d'heure, le niveau de batterie ou la Dynamic Island
capturés sur iPhone : ils appartiennent au système. Protéger plutôt les commandes par les
zones sûres et la hauteur disponible (`dvh` lorsque pertinent), sans hauteur figée qui coupe
le contenu en orientation paysage.

## 6. Continuité technique et charte

- Une coque et un hôte d'appel persistants. Changer de largeur ne remonte pas l'appel,
  ne recrée pas sa session et ne remonte pas une conversation en cours.
- Un seul lecteur média actif ; suspendre la lecture du fil lors d'un appel, du passage
  en arrière-plan ou d'un changement de destination. La politique de reprise est explicite.
- Pas de trois arborescences masquées téléphone/tablette/bureau : elles provoqueraient des
  lecteurs, abonnements et requêtes concurrents. Adapter la même composition quand possible.
- Conserver curseur, position, sélection et brouillon au retour. La pagination Clips filtre
  les vidéos côté serveur avec autorisation ; elle ne filtre pas seulement la page mixte chargée.
- Les modales, feuilles et panneaux gèrent focus, fermeture et restitution du focus. Un resize
  ne doit pas perdre le texte saisi ni faire sauter la sélection de produit.
- Fond blanc, cartes beige en clair ; fond et surfaces sombres existants en sombre. Employer
  les jetons du contrat et les variantes ANTSIA ; aucune couleur littérale dans les composants.
  Les médias, badges d'état et actions fournissent les accents utiles, sans fond multicolore permanent.
- Ne pas forker les composants `components/ui/`. Les extensions du moteur restent facultatives
  pour ANTSIA et respectent DIASPORALE. Les traductions serveur/client restent identiques.

## 7. Accessibilité et confort

Le minimum WCAG 2.2 AA de taille des cibles est de 24 pixels CSS, avec des exceptions et
conditions d'espacement ; la cible de confort proposée ici est **44–48 pixels CSS** pour les
commandes fréquentes. Ce choix produit est plus généreux que le minimum cité.
[Référence W3C](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).

Prévoir le clavier, un focus visible, des noms accessibles et des annonces de changement
d'état utiles. Respecter la réduction des animations ; arrêter un média doit être possible
sans geste complexe. Les notifications ne doivent pas masquer les commandes d'appel.

Prévoir le réagencement à 320 pixels CSS et le zoom ; le critère W3C explique notamment
l'équivalence entre une fenêtre de 1280 pixels à 400 % et 320 pixels CSS de largeur utile.
Éviter le double défilement horizontal/vertical pour la lecture courante.
[Référence W3C](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html).

## 8. Web et natif : deux réalisations à distinguer

| Capacité | Web adaptatif | App native |
|---|---|---|
| Renommage U01 | Ressources propres à ANTSIA, composées sur le moteur | Accueil/Home sur les deux libellés existants du fil |
| Cinq destinations | Cible U02/U04, pas encore raccordée | Cible ultérieure ; trois onglets présents, pas de rail tablette ajouté |
| Profil / Boutique / Clips | Réutilisation et extension des parcours du moteur | Écrans à porter explicitement ; conserver les renvois Web actuels jusqu'à leur remplacement |
| Appels / notifications système | Capacités navigateur et état courant de l'application | Dépend du build, de la configuration et des permissions ; aucune preuve sur appareil fournie ici |

La référence WhatsApp inspire l'ergonomie des appels ; elle ne constitue aucune preuve de
parité technique, de chiffrement de bout en bout ou de réception système pour ANTSIA.

## 9. Recette prévue, différée

Après autorisation de reprendre les vérifications, observer les mêmes scénarios sur fenêtres
320, 375, 390, 430, 768, 834, 1024, 1280, 1440 et 1920 pixels, en portrait et paysage quand
pertinent ; compléter par zoom, clavier, lecteur d'écran, tactile, souris et réseau lent.
Les dimensions servent de cas de contrôle, pas de promesse de prise en charge déjà prouvée.

Scénarios critiques : ouverture du fil et retour sans réessayer ; créer puis reprendre un
brouillon ; masquer/annuler via Mon fil ; commenter avec clavier ouvert ; changer de largeur
pendant une conversation et un appel ; quitter Clips puis reprendre sa position ; consulter
une offre retirée ; mode sombre et mouvement réduit. U08 détaille les critères et les preuves
attendues. **Aucun de ces scénarios n'a été exécuté pour cette demande.**
