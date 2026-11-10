# 04 — Rencontres : deux espaces distincts

**Spécification approuvée, implémentation en cours · 21 octobre 2026**

**Décision utilisateur confirmée : rencontres professionnelles ET rencontres personnelles, dans deux espaces séparés.**

Ils partagent l’identité technique ANTSIA et les protections du moteur. Ils ne partagent ni leur finalité, ni leur index de découverte, ni leurs préférences, ni les règles d’admission des contacts.

## 1. Rencontres professionnelles

### Objectif

Permettre de trouver des compétences, un partenaire, un collaborateur ou une activité avec laquelle travailler. Ce réseau est relié aux pages et aux services sans devenir une copie de la marketplace.

| Surface | Contenu |
|---|---|
| Profil professionnel volontaire | Titre, présentation, compétences déclarées, langues, zone, disponibilité |
| Portfolio | Réalisations et références publiées volontairement |
| Activités liées | Pages administrées ou mandats exposables, sans inventer une fonction |
| Découverte | Compétence, domaine, langue, zone, disponibilité, type de collaboration |
| Mise en relation | « Proposer une collaboration », invitation motivée, accepter/refuser |

Une compétence déclarée et une qualification vérifiée portent des libellés différents. Le badge Vérifié IDN ne prouve pas une compétence.

Le profil professionnel peut être limité au réseau, non listé ou public par un choix explicite. Le partage public n’expose que les champs autorisés. La zone n’exige pas la localisation exacte.

### Contact

Une proposition de collaboration n’abonne pas automatiquement les personnes et ne crée pas une relation acceptée. Réutiliser le moteur de demandes et iCom avec un motif professionnel, des quotas et une acceptation appropriée.

Les offres d’emploi et candidatures déjà conçues en P15 restent leur propre parcours PRO.GA ; elles ne deviennent ni un match sentimental ni un carnet public de candidats.

Le modèle de talents de DIASPORALE sert de référence d’inventaire seulement. Il reste réservé à son réseau : aucune lecture croisée ni exposition automatique dans ANTSIA.

## 2. Rencontres personnelles entre adultes

### Participation volontaire et privée

L’espace n’ouvre pas automatiquement un profil de rencontres à chaque membre. Le membre demande à participer, voit la finalité et les règles, choisit ses données et peut se retirer.

Recommandation produit : admission **18 ans et plus**, avec une preuve de majorité minimale à définir avant ouverture réelle. L’identité actuelle ne fournit pas cette preuve ; ni le badge IDN ni un champ libre « J’ai 18 ans » ne la remplacent. Choisir un mécanisme proportionné et documenté, privilégiant une attestation de seuil plutôt que la conservation d’un document ou de la date complète.

Ce choix est un prérequis de lancement de ce service, pas une raison de bloquer boutiques, services, presse ou réseau professionnel.

### Profil et découverte

Profil propre à cet espace : présentation, photos choisies, centres d’intérêt et préférences que la personne souhaite exprimer. Une seule personne technique ; pas de second compte ou de second handle global.

Aucun import automatique de photos, coordonnées, identité certifiée ou données sensibles du profil social. Les données nécessaires à la finalité sont définies avant collecte ; les champs sensibles éventuels ont un accord spécifique et des accès limités.

- Pas d’indexation Web ni de profil personnel partagé publiquement.
- Pas d’indication visible sur la page professionnelle de la participation aux rencontres.
- Aucun transfert de ces préférences vers PRO.GA, publicité ou classement commercial.
- Ville ou zone large ; pas d’adresse, distance précise ou localisation continue.
- Suggestions uniquement parmi les personnes admises, visibles et compatibles selon leurs choix explicites.
- Pas d’inférence de préférences à partir des achats, abonnements, relations, messages ou documents.
- Présenter un classement explicable et maîtrisable ; aucun pourcentage de compatibilité inventé.

### De la découverte à la conversation

~~~mermaid
flowchart LR
    O[Participation volontaire et admission adulte] --> P[Profil dédié et choix de visibilité]
    P --> D[Découverte autorisée]
    D --> I[Intérêt privé ou Passer]
    I --> M[Intérêt réciproque]
    M --> C[Proposition de conversation acceptée]
    C --> A[Appel seulement selon les consentements et gardes]
~~~

Libellés proposés : Découvrir, Passer, J’aimerais échanger, C’est réciproque, Discuter. Un intérêt unilatéral n’ouvre pas la messagerie. Un abonnement social ou un suivi commercial ne constitue pas un consentement personnel.

Le registre de conversations doit reconnaître ce contexte de manière fermée et vérifiée côté serveur. Ne pas contourner la garde de relation personnelle d’iCom par une route générique. Le retrait d’une correspondance ferme les nouveaux contacts de cette source ; la disponibilité d’un historique ou de preuves de signalement suit une politique annoncée.

### Protection et retrait

Blocage, signalement et quitter la conversation sont accessibles depuis chaque carte et fil concerné. Le blocage global existant reste effectif entre les contextes ; changer de page ou de spécialité ne le contourne pas.

Pause : retirer immédiatement le profil des découvertes et des files de suggestions. Suppression : traiter les données, médias, références, caches et droits de données propres au service. Définir et annoncer les durées des intérêts non réciproques, profils inactifs, conversations et preuves de modération avant lancement.

Le support voit les seules données nécessaires au signalement, avec droits et journal appropriés. Évaluer les obligations de protection des données avec le responsable désigné et les textes APDPVP ; le plan ne prétend pas constituer une autorisation administrative.

## 3. Interfaces et séparation

Professionnel : recherche et filtres, profils de compétences, portfolio et actions de collaboration. Personnel : cartes lisibles, choix explicites, boutons utilisables sans geste de balayage obligatoire et confidentialité visible.

Téléphone : cartes et détails en plein espace utile. Tablette/ordinateur : découverte et détail en colonnes lorsque lisibles. Pas d’extension du swipe sur toute la page, pas de défilement piégé. Navigation clavier complète et retour ANTSIA constant.

## 4. Critères d’acceptation

- Activer le professionnel n’inscrit pas au personnel ; se retirer du personnel conserve le professionnel.
- Une personne sans preuve de majorité admise ne consulte pas le vivier personnel.
- Un visiteur, moteur de recherche ou membre non admis ne lit ni participation ni préférences personnelles.
- Intérêt unilatéral, suivi de boutique et relation professionnelle ne donnent aucun droit de conversation personnelle.
- Deux intérêts réciproques créent au plus une correspondance, même sous concurrence.
- Blocage, pause et retrait s’appliquent avant la prochaine délivrance de carte ou nouveau contact.
- L’export ne révèle pas les préférences, refus ou données privées d’autres personnes.
- Ces parcours sont éprouvés aux trois formats avec comptes fictifs adultes ; aucun vrai profil sensible n’est créé pour une recette.
