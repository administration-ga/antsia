# 05 — Pages presse et véritable espace média

**Spécification approuvée, implémentation en cours · 21 octobre 2026**

## 1. Une page sociale et un site éditorial

Une rédaction conserve sa page pour ses abonnés, posts, Stories et directs. « Lire le média » ouvre son site éditorial dans ANTSIA : marque, une, rubriques, articles et informations de rédaction.

Un article n’est pas une longue publication bricolée dans la limite actuelle de 2 000 caractères. Il possède son modèle, son URL, sa version publiée et ses règles éditoriales. Une carte sociale en est un aperçu lié, pas une deuxième vérité éditoriale.

Le média ne devient pas une boutique par défaut. Ses éventuels services ou offres commerciales sont des capacités explicites et séparées des articles.

## 2. Site média

| Surface | Expérience |
|---|---|
| Une | Informations sélectionnées par la rédaction, titres hiérarchisés et actualités datées |
| Rubriques | Exemples : actualité, économie, société, sport, culture ; choix et ordre éditables |
| Article | Titre, chapeau, auteur exposable, date de publication/mise à jour, corps structuré, médias et crédits |
| Dossier | Regroupement éditorial d’articles, distinct d’une catégorie commerciale |
| Direct et replay | Accès aux contenus réellement actifs ou enregistrés et lisibles |
| La rédaction | Présentation du média et membres dont l’exposition a été consentie |
| Contact et corrections | Contacter la rédaction, signaler une erreur et consulter les rectificatifs |
| Retour social | Suivre la page ou revenir au post d’origine |

La une ne fabrique pas d’urgence ni de classement « Les plus lus » sans mesure fiable. Les communications sponsorisées, s’il y en a ultérieurement, sont identifiées et distinctes des informations éditoriales.

## 3. Rôles et publication

Réutiliser l’administrateur de page pour l’autorité de l’activité ; ajouter des habilitations éditoriales précises.

| Habilitation | Pouvoir |
|---|---|
| Auteur | Préparer ses brouillons et proposer un article |
| Éditeur | Relire et préparer une version publiable selon périmètre |
| Responsable de publication | Valider, publier, programmer ou retirer selon mandat |
| Administrateur du média | Gérer équipe et configuration ; attribuer les habilitations admises |

Une habilitation éditoriale ne donne pas le rôle de modérateur réseau ou l’accès aux opérations commerciales. L’invitation d’équipe est acceptée ; les droits sont relus à chaque mutation.

~~~mermaid
stateDiagram-v2
    [*] --> Brouillon
    Brouillon --> ARelire
    ARelire --> ModificationsDemandees
    ModificationsDemandees --> Brouillon
    ARelire --> Valide
    Valide --> Programme
    Valide --> Publie
    Programme --> Publie
    Publie --> Retire
    Publie --> RevisionEnPreparation
    RevisionEnPreparation --> ARelire
~~~

La version actuellement publiée reste lisible pendant la préparation d’une correction, sauf retrait explicite. La tâche programmée relit droits, consentement et état du média ; elle ne publie pas avec une habilitation révoquée.

Prévoir un circuit léger configurable pour une personne seule, sans supprimer la traçabilité de la décision de publication.

## 4. Articles, versions et corrections

- Édition structurée, validée et nettoyée : paragraphes, titres, listes, liens et médias autorisés.
- Brouillons privés et sauvegarde sans publication ; protection contre écrasement concurrent.
- Révision attendue lors de chaque sauvegarde, version publiée immuable et journal de publication.
- Auteur affiché choisi et autorisé, distinct du signataire technique ; normalisation civile pour les personnes, sans transformer le nom du média.
- Lien stable d’article ; changement de titre ou de slug géré sans casser les partages.
- Notice de correction datée lorsqu’un article publié est corrigé ; historique éditorial accessible selon les droits.
- Retrait ou restriction répercutés sur aperçus sociaux, recherche, fichiers et projections publiques.
- Crédits, texte alternatif et droits de publication pour les médias ; pas d’embed ou de script arbitraire.

Réactions et commentaires réutilisent les protections sociales. Définir une seule référence d’article et une destination de discussion cohérente pour éviter deux fils de commentaires contradictoires. Le responsable peut activer ou fermer les commentaires selon politique, sans effacer silencieusement des preuves de modération.

## 5. Projection publique adaptée

La page publique actuelle /pages/[handle] exige une confiance « official ». Une page de nature media ne reçoit au maximum que « verified » : **ce chemin ne permet pas aujourd’hui le portail public demandé**.

Créer une projection éditoriale spécialisée avec consentement de diffusion, page active, publication courante, droits de médias et modération relus. Garder intactes les règles des institutions officielles.

Un média déclaré, un média vérifié et une institution officielle portent des signes distincts. Le badge IDN d’un auteur ne vaut ni carte de presse ni agrément du média.

Les articles publics peuvent fournir métadonnées, liens canoniques et données structurées exactes ; brouillons, administration et versions de travail restent hors indexation. La publication sociale d’un aperçu est un choix explicite ou une règle de diffusion consentie, pas une duplication de tout document interne.

## 6. Responsive et périmètre

Téléphone : titres lisibles, sommaire et partage accessibles, lecture sans colonnes serrées. Tablette : une à deux colonnes pour la une et une largeur de lecture maîtrisée. Ordinateur : une de média avec hiérarchie éditoriale, colonne article confortable et panneaux secondaires mesurés.

Première version : presse et contenus gratuits publiés. Abonnements payants, kiosque et paywall sont des extensions ultérieures sur les contrats financiers validés, sans les ajouter artificiellement aux premiers lots.

## 7. Critères d’acceptation

- Un auteur peut préparer sans publier ; un utilisateur non habilité ne lit pas le brouillon.
- Une publication programmée ne passe pas après révocation des droits.
- Deux sauvegardes concurrentes n’écrasent pas silencieusement le travail d’un auteur.
- Un article corrigé conserve sa version publiée précédente et affiche la mise à jour selon politique.
- Article, carte sociale et résultats publics respectent le même retrait.
- Le média public se lit sans emprunter la porte des pages officielles.
- Un article reste partageable après changement de titre ; aucune URL de brouillon n’expose son contenu.
- Lecture, édition, validation et retour au réseau sont éprouvés aux trois formats.
