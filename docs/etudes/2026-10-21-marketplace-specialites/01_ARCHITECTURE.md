# 01 — Architecture et expérience commune

**Spécification approuvée, implémentation en cours · 21 octobre 2026**

## 1. Une identité, des espaces adaptés à l’usage

Réutiliser la personne, la page et les mandats existants. Une boutique reste une capacité d’une page ; elle ne devient ni une seconde personne ni un nouveau réseau.

| Objet | Fonction |
|---|---|
| Personne | Session, identité sociale, administration autorisée de ses activités |
| Page sociale | Abonnés, publications, Stories, directs, informations et lien vers l’espace spécialisé |
| Espace Boutique | Catalogue marchand, rayons, variantes, panier et commandes |
| Espace Services | Prestations, portfolio, devis, agenda et suivi |
| Espace Média | Une, rubriques, articles et rédaction |
| Profil professionnel personnel | Compétences, présentation, portfolio et recherche de collaborations |
| Facette Rencontres personnelles | Participation et profil privés dédiés, sans publication automatique sur le profil social |

Les natures existantes de page (entreprise, association, média, communauté, institution) restent distinctes des capacités. Une page peut activer produits et services ensemble. Une institution ne reçoit pas une capacité marchande ou un badge par une simple sélection de modèle.

L’identité commerciale légale et les mandats viennent de PRO.GA. La marque, la présentation et les blocs sociaux restent dans ANTSIA, avec un propriétaire explicite pour chaque champ.

## 2. Carte des espaces

~~~mermaid
flowchart TD
    A[ANTSIA : fil, Clips, Stories, Explorer] --> P[Page sociale de l'activité]
    A --> M[Marketplace générale]
    M --> B[Boutique professionnelle]
    M --> S[Espace de services]
    P <--> B
    P <--> S
    P <--> E[Site du média]
    A --> RP[Rencontres professionnelles]
    A --> RA[Rencontres personnelles : participation dédiée]
    B --> C[Checkout et suivi ANTSIA]
    S --> D[Devis, rendez-vous et suivi ANTSIA]
    C --> G[Commandes privées vers PRO.GA]
    D --> G
    B --> R[Retour au contenu social d'origine]
    S --> R
    E --> R
~~~

### Destinations proposées

Conserver la barre sociale à cinq destinations sur téléphone. Marketplace, Services, Médias et Rencontres sont accessibles par Explorer et les raccourcis pertinents ; ils ne deviennent pas neuf icônes concurrentes.

Routes ci-dessous : **cibles de conception**, à enregistrer dans les helpers de routes après validation.

| Destination | Stratégie de route |
|---|---|
| Hub marchand | Ajouter /marketplace avec onglets Produits, Boutiques, Services |
| Boutique | Faire évoluer /boutique/[handle] et sa projection publique /boutiques/[handle] |
| Services d’une activité | Sous-route de son espace existant, liée à la même page ; éviter une seconde identité |
| Profil et réseau professionnels | Ajouter /professionnels et un profil spécialisé lié à la personne |
| Rencontres personnelles | Ajouter /rencontres, réservé à l’admission spécifique |
| Portail et article média | Ajouter /medias/[handle] et ses articles, avec projections éditoriales propres |
| Gestion | Garder /moi et /mes-boutiques ; ajouter un tableau de bord d’activité selon les droits |

Ne pas réutiliser /actus pour les actualités : cette route désigne déjà les Stories. Les anciens liens de catalogue et d’offres continuent de fonctionner. Choisir une URL canonique par ressource et rediriger les alias après inventaire.

## 3. Entrer dans une boutique et revenir au bon endroit

Parcours attendu : publication → fiche produit → boutique → Retour à ANTSIA → publication initiale et position de lecture.

Le contexte contient uniquement ce qui est nécessaire :
- origine autorisée : fil, publication, Clip, Story, résultat de recherche ou marketplace ;
- référence du contenu, filtres et position de lecture ;
- durée de validité et repli sûr vers le fil si le contenu disparaît.

Le contexte n’accorde aucun droit. Ne pas accepter une URL de retour libre vers n’importe quelle origine. Après connexion ou retour PSP, restaurer le parcours autorisé sans rejouer automatiquement un achat.

La fiche, les filtres et la position utilisent l’historique normal du navigateur. Le bouton Retour ferme d’abord une fenêtre de détail ou les filtres, puis remonte le parcours. Ouvrir un lien direct sans origine affiche simplement « Retour à ANTSIA ».

Paniers, brouillons et intentions restent isolés par personne, réseau et boutique ; leur restauration ne transmet pas de coordonnées privées dans une URL. L’état de recherche public peut être partageable ; les préférences de rencontres restent privées.

## 4. Une coque professionnelle, sans casser la session

L’espace spécialisé remplace la composition du fil :
- en-tête de marque, recherche propre et menu métier ;
- retour social visible ;
- largeur et grilles adaptées à la consultation de produits ou d’articles ;
- pas de colonne de suggestions sociales ni d’iCom en double ;
- contact commercial accessible sans envahir le catalogue.

Conserver les providers de session, la passerelle d’identité, les notifications et les appels à un niveau persistant. Une navigation boutique → réseau ne remonte pas le moteur d’appel et ne perd pas un brouillon. Aucun iframe ou site parallèle non raccordé.

| Format | Navigation et composition |
|---|---|
| Téléphone, moins de 768 px | Une colonne ; produits sur deux colonnes si leur contenu tient ; filtres en panneau, tris nommés, actions proches du pouce et zones sûres ; une seule barre basse contextuelle |
| Tablette, 768–1199 px | Rail compact ; grille selon largeur utile ; filtres en panneau ou colonne lorsque l’espace le permet ; détails sans réduire excessivement les images |
| Ordinateur, dès 1200 px | En-tête et navigation nommée ; filtres latéraux ; catalogue sur trois ou quatre colonnes selon largeur ; contenu éditorial de largeur de lecture limitée |

Tester aussi 320 px, les orientations paysage et le clavier mobile. Les seuils existants d’ANTSIA sont réutilisés par opt-in ; ne pas modifier globalement DIASPORALE.

## 5. Personnalisation maîtrisée

Modèles configurables : Mode, Artisanat/Produits, Prestataire local, Expert à distance, Média. Chaque modèle règle les blocs, catégories, attributs et actions proposées, pas les droits.

Options : logo, bannière, sélection de couverture, collections, offres mises en avant, horaires, zone, équipe et liens sociaux. Utiliser les sept chartes et les jetons actuels avec un rendu professionnel cohérent en clair et sombre. Pas de CSS/JavaScript arbitraire injecté par un vendeur.

Les catégories doivent refléter l’activité réelle. Une boutique mixte active plusieurs capacités ; elle n’affiche pas un agenda vide ou des tailles de vêtements pour un service informatique.

## 6. Autorités des données

| Domaine | Autorité | Ce qu’ANTSIA conserve |
|---|---|---|
| Identité, pages, abonnements, posts, modération sociale | ANTSIA | Données sociales |
| Structure, mandats et établissements vendeurs | PRO.GA | Références opaques et preuve de liaison consentie |
| Offres, prix, attributs commerciaux, variantes, stock, collections | PRO.GA | Projections publiées versionnées, datées et révocables |
| Commandes, devis, rendez-vous, facture, exécution | PRO.GA | Suivi privé minimal autorisé |
| Paiements et reversements | Prestataire, rapprochés par PRO.GA | État confirmé ; aucune comptabilité doublée dans le front |
| Mise en page de vitrine et blocs sociaux | ANTSIA | Configuration de présentation |
| Réseau professionnel, rencontres, articles et rédaction | ANTSIA | Données dédiées et accès adaptés ; pas d’export vers PRO.GA par défaut |

Toute modification commerciale depuis l’interface ANTSIA est une commande vers PRO.GA, pas une écriture locale suivie d’une réconciliation hypothétique. La liaison conserve sa double preuve ; un e-mail commun ou un badge n’autorise pas une entreprise.

Échanges signés, bornés, idempotents et versionnés ; aucune lecture de base externe, aucun import de schéma ni client Convex croisé.

## 7. Modèles proposés — à confronter au schéma avant création

| Besoin | Évolution proposée |
|---|---|
| Capacités et composition d’une page | Étendre les paramètres de vitrine ou créer un réglage par page/version ; conserver une boutique au plus par page |
| Rayons et facettes | Étendre le contrat catalogue PRO.GA puis ses projections ANTSIA ; index public multiboutique rétractable |
| Paniers de boutiques | Conteneur client par vendeur ; chaque checkout garde l’invariant mono-vendeur |
| Professionnels | Profil volontaire structuré : compétences, portfolio, disponibilité et visibilité |
| Rencontres personnelles | Participation, preuve minimale de majorité, profil dédié, choix explicites, intérêts et correspondances privés |
| Presse | Articles, révisions, rubriques, habilitations éditoriales, circuit de validation et corrections |
| Exploitation | Événements techniques minimaux, files de reprise et journal des actions sensibles |

Les noms de tables et DTO seront arrêtés au lot MP00. Aucun nouveau registre de prix, stock ou finance ANTSIA n’est proposé.

## 8. Invariants communs et ouverture

Réutiliser networkId, gardes d’adhésion et de rôle, refus indistinct, garde des fichiers, débit, consentements versionnés, export et effacement. Ajouter les nouvelles tables aux inventaires de données, cliquets et cibles de modération.

Les surfaces publiques exigent une projection dédiée, un consentement explicite et un état courant admissible. Les articles, boutiques ou services publics ne doivent pas généraliser l’actuelle porte « page officielle ». Suspension, retrait et révocation de liaison doivent retirer aussi la découverte et les médias concernés.

Distinguer préparer, publier, accepter un engagement et encaisser. Les fonctions de suivi et de résolution d’un engagement existant survivent à la fermeture des nouvelles ventes. Un succès technique ou une page de retour PSP ne prouve pas le paiement.

La démo demeure sous /demo avec backend, session et stockage dédiés. Les recettes ultérieures emploient des comptes fictifs séparés sans déconnecter le compte réel ni envoyer de messages non autorisés.
