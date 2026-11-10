# Noms des fonctions et textes de l'interface

20 octobre 2026. Convention proposée pour ANTSIA ; les libellés U01 sont appliqués par
surcharges propres à l'application. Les noms d'API, tables, routes historiques et droits ne
changent pas. Une nouvelle appellation ne crée pas une fonction absente.

Le ton est simple, social et chaleureux. On utilise les mots connus **Stories**, **Clips**,
**Direct**, **Replays** plutôt qu'un vocabulaire administratif ou de l'argot difficile à traduire.
Le français est la langue principale ; l'anglais conserve une terminologie équivalente.

## 1. Lexique de référence

| Actuel / référence | Nom retenu FR | EN | Règle et lot |
|---|---|---|---|
| ANTSIA | ANTSIA | ANTSIA | Marque inchangée |
| Fil dans la navigation | Accueil | Home | U01 ; le contenu reste un fil mixte |
| Découvrir | Explorer | Explore | U01 pour la destination ; la grille de découverte est U04 |
| Créer | Créer / bouton « + » | Create | U02 ; le bouton ouvre un choix de formats réels |
| Conférence(s) | Direct / Directs | Live / Live streams | U01 ; diffusion vers des spectateurs, distincte d'un appel |
| Conférence en cours | En live | Live | U01 ; état seulement quand la diffusion est réellement active |
| Créer une conférence | Préparer un direct | Prepare a live stream | U01 ; formulaire/studio, sans démarrage implicite |
| Démarrer une conférence | Lancer le direct | Start the live stream | U01 ; geste final distinct de la préparation |
| Gestion de la conférence | Studio et gestion du direct | Live studio and management | U01 ; conserver les commandes et droits existants |
| Rediffusion(s) | Replay / Replays | Replay / Replays | U01 ; uniquement un enregistrement publié et encore lisible |
| Actu(s), Statut(s) éphémères | Story / Stories | Story / Stories | U01 ; fonction actuelle de 24 h, sans changer sa conservation |
| Créer une actu | Publier une story / Créer une story | Post a story / Create a story | U01 ; caméra/fichier selon capacités présentes |
| Publications | Posts dans les futurs onglets de contenu ; Publier pour le verbe | Posts / Publish | U03/U05 ; garder Publication dans les contextes formels si utile |
| Immersion | Immersion / Plein écran | Immersive / Full screen | Mode actuel mixte, pas renommé Clips |
| Reels dans la référence | Clips | Clips | U04 ; nouveau périmètre vidéo, pas une marque tierce ni un faux alias |
| Relations, rubrique globale | Mon réseau | My network | U01 ; réunit des listes de nature distincte |
| Se connecter à une personne | Ajouter à mon réseau | Add to my network | U01 ; invitation réciproque, pas connexion au compte |
| Suivre une personne/page | Suivre | Follow | Inchangé ; abonnement unilatéral |
| Suivi(e)s / personnes suivies | Abonnements | Following | U05 ; liste des comptes suivis, distincte des achats/abonnements payants |
| Followers | Abonnés | Followers | U05 ; aucun lien d'amitié déduit |
| Connexions acceptées | Connexions | Connections | Réciprocité réelle conservée ; ne pas appeler tout le monde Amis |
| Enregistrements / signets | Enregistrés | Saved | U01 ; posts sauvegardés, pas une copie des fichiers média |
| iCom / iChat en navigation publique | Messages | Messages | U06 ; marques techniques maintenues dans le code |
| Conversations | Discussions | Chats | Proposition U06 à harmoniser avec les trois vues existantes |
| Téléphonie / iAppel | Appels | Calls | U06 ; audio et vidéo privés, pas Directs |
| Notification / cloche | Notifications | Notifications | Garder ce nom clair ; Activité peut titrer l'historique social, pas tout le suivi métier |
| Gestion du compte | Réglages | Settings | U05/U08 ; Mon activité et Données restent des rubriques distinctes |
| Pages | Pages | Pages | Ne pas transformer toute page en boutique |
| Boutique, vitrine | Boutique / Boutiques | Shop / Shops | Fonction commerciale identifiable |
| Tableau de bord professionnel | Mon activité pro | Business overview | U05/U07 si données réelles ; sinon accès aux outils disponibles de PRO.GA |
| Évènement | Événements | Events | Terme familier conservé, pas de néologisme imposé |
| Réseaux / groupes thématiques | Groupes | Groups | Garder la distinction groupe de contenu / discussion de groupe |
| National | Au Gabon, uniquement pour un vrai filtre géographique ; sinon Tout le réseau | Gabon / Network-wide | Proposition conditionnelle ; l'audience publique n'est pas une géolocalisation |

**Mon fil reste Mon fil** : gestion des posts masqués et des auteurs en sourdine, accessible
depuis le profil et les préférences. Le fil de lecture natif s'appelle Accueil pour lever
l'ambiguïté. « Pour vous », « Abonnements » et « Récents » désignent des classements/portées,
pas des destinations principales ni des promesses d'algorithme à créer par traduction.

## 2. Boutons et menus à composer

### Créer

Le menu cible contient **Post · Story · Clip · Direct**, puis **Événement · Album · Offre** selon
les capacités disponibles. Le choix Clip n'apparaît qu'après raccord U04 ; Offre ouvre les
offres réelles de sa boutique, sans créer de catalogue parallèle. Le menu actuel reste fonctionnel
pendant cette transition. Chaque format expose audience, identité d'auteur et effet de la validation.

| Situation | Texte / effet attendu |
|---|---|
| Formulaire de post prêt | Publier ; aucune publication avant ce geste |
| Média en traitement | Traitement en cours ; ne pas afficher Publié tant que ce n'est pas prouvé |
| Préparation d'un direct | Préparer un direct, puis vérifier micro/caméra dans le Studio |
| Diffusion prête à démarrer | Lancer le direct ; expliquer l'audience choisie |
| Enregistrement du direct | Enregistrer la diffusion ; consentement/indicateur distincts du signet Enregistrer le post |
| Spectateur quittant le direct | Quitter le direct ; le direct continue |
| Hôte terminant pour tous | Terminer le direct ; confirmation explicite pour tous les participants |
| Replay non publié | Replay privé ; ne pas proposer Regarder le replay à l'extérieur |

### Actions d'un post ou d'un clip

Ordre cible : **J'aime · Commenter · Republier · Envoyer · Enregistrer · Plus**. La place change
selon le format, pas la signification. Chaque icône a un nom accessible et un état explicite.

« Republier » suppose un vrai relais autorisé dans le fil ; « Envoyer » partage dans une
discussion ; « Copier le lien » ne donne aucun accès supplémentaire. Si l'action actuelle
ne fait que copier/envoyer un lien, la renommer Republier serait fausse : le raccord U03 doit
utiliser le vrai mécanisme de relais et conserver l'audience d'origine.

Le menu Plus peut proposer **Pourquoi ce post ?** si une explication réelle est disponible,
puis **Masquer ce post**, **Mettre l'auteur en sourdine**,
**Ne plus suivre**, **Signaler**, puis les actions du propriétaire si elles sont permises.
Masquer un post et mettre l'auteur en sourdine sont annulables depuis Mon fil. Bloquer et
signaler restent des décisions distinctes, avec confirmation ou explication adaptées.

### Messages, appels et commerce

| Contexte | Libellé conseillé | Limite |
|---|---|---|
| Nouveau message personnel | Écrire un message | Respecter connexion, blocage et permission de contact |
| Premier contact boutique | Poser une question | Passer par la demande commerciale, pas un DM personnel forcé |
| Appel audio | Appeler | État Appel… / Connexion… / En appel / Appel terminé selon preuve |
| Appel vidéo | Appel vidéo | Micro/caméra autorisés séparément, pas d'activation surprise |
| Produit découvert dans un post | Voir l'article | Ouvre l'offre, prix/unité et disponibilité réelle |
| Vitrine | Voir la boutique | Ne garantit pas achat disponible |
| Prestation à devis | Demander un devis | Pas de prix fixe inventé |
| Créneau de prestation | Réserver | Récapitulatif et consentement avant engagement |
| Emploi | Candidater | Envoi privé, pas publication sur le profil |
| Paiement admissible | Payer {{amount}} | Total, fournisseur et preuve réels ; reste fermé si gate P16 fermé |
| Commandes et achats | Mes achats | Afficher le vrai statut ; une commande ouverte n'est pas un paiement confirmé |
| Suivi de service | Mes demandes | Avis de mise à jour ≠ confirmation d'un nouvel état métier |
| Notification DP-39 | Votre demande a une mise à jour. Ouvrez-la pour la relire. | Garder sa formulation neutre et la relecture authentifiée |

## 3. Ce que « fun » ne doit pas rendre flou

L'interface de découverte peut dire « À découvrir » ou « Vos prochains coups de cœur ». Les
actions sensibles gardent des verbes précis : Payer, Retirer ma candidature, Supprimer, Bloquer,
Terminer le direct. Pas de « Je fonce » à la place d'un engagement financier ou d'un accord de données.

Les noms civils conservent la règle partagée NOM en capitales, Prénom capitalisé. Une marque,
un handle ou un nom d'organisation ne devient pas un nom civil par ce travail de copie.
Les badges, audiences et statistiques restent calculés côté serveur.

## 4. Migration technique U01

Construire des copies complètes des namespaces moteur depuis `engineResources`, puis y fusionner
les seuls textes ANTSIA. Conserver les placeholders, clés de pluriel et branches non modifiées.
Ni recherche/remplacement global, ni modification de routes `conference`, d'énumérations ou de
permissions. Les phrases passent de « cette conférence » à « ce direct » avec leur accord correct.

Les mêmes ressources composées alimentent rendu serveur et client. Les libellés natifs déjà
présents utilisent leurs propres dictionnaires. Aucun onglet natif absent n'est créé par simple
texte. Les dictionnaires partagés et ceux de DIASPORALE ne sont pas modifiés.

Référence : [analyse](01_ANALYSE_REFERENCES.md), [plan et prompts](04_PLAN_IMPLEMENTATION.md).
