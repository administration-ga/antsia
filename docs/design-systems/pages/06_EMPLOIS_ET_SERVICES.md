# ANTSIA — Pages Emplois et services

Date : **2026-10-20** · Statut : **relevé DOM/CSS de la référence**, sans recette de l’application.

Source : [Emplois et services](https://claude.ai/artifact/AnLxkaqaai725ywzkrVk6b#page-a63d81f172ca).

Cette fiche transcrit les sept planches de la famille Emplois et services.
Elle consigne les champs, états, accords et actions dessinés dans le canevas ;
elle ne confirme pas leur exécution dans l’application.

À lire avec le [socle commun](../00_SOCLE_COMMUN.md) et le
[registre des écarts entre référence et code](../08_ECARTS_REFERENCE_ET_CODE.md).

## 1. Inventaire des sept planches

Les noms de fichiers sont conservés exactement.
Les points de suspension des routes représentent les segments variables du relevé.

| Fichier de planche | Route | Composition relevée | Actions dessinées |
|---|---|---|---|
| `Emplois.dc.html` | `/boutique/…/emplois` | Cartes : titre, employeur, CDI/CDD/Stage, lieu, échéance ou absence d’échéance, fourchette salariale et période. | Consulter une offre, y compris une offre close. |
| `Offre-emploi.dc.html` | `/boutique/…/emplois/…` | Offre Ouverte, contrat, lieu, nombre de postes, date, salaire, compétences, description, formulaire de candidature. | Ajouter ou retirer une pièce PDF, donner l’accord, envoyer la candidature. |
| `Mes-candidatures.dc.html` | `/mes-candidatures` | États dont Entretien, dates de réception et mise à jour, détail transmis, accord horodaté, pièces PDF. | Voir l’offre, Actualiser, Retirer, consulter Ce qui a été transmis, Relancer l’envoi. |
| `Devis.dc.html` | `/boutique/…/devis/…` | Besoin, contraintes, date et heure Africa/Libreville, quantité, nombre de pièces choisies. | Envoyer la demande avec consentement spécifique PRO.GA ; les fichiers restent dans la conversation. |
| `Rendez-vous.dc.html` | `/boutique/…/rendez-vous/…` | Prestation de 30 minutes, calendrier, date et heure, créneaux libres nominatifs, identité et message. | Aller à cette date, semaine précédente/suivante, Demander le créneau ; changement et annulation selon délais. |
| `Prestation.dc.html` | `/boutique/…/prestation/…` | Tarif fixe illustré par 3 500 XAF, quantité, date et message facultatifs, prénom et nom, total. | Donner l’accord de commande et demander la prestation, sans paiement ; confirmation du professionnel. |
| `Mes-demandes.dc.html` | `/mes-demandes` | Devis, rendez-vous et prestations ; En attente/En cours ; mise à jour fournie par le professionnel ; 10 éléments par page. | Ouvrir une demande. |

## 2. Emplois : cartes et états dessinés

Les cartes d’emploi montrent le **titre**, l’**employeur**, le **contrat** et le
**lieu**. Le contrat est illustré par **CDI**, **CDD** ou **Stage**.
La date limite peut être présente ou indiquée comme sans échéance.
Le salaire est présenté par sa fourchette et sa période.

L’offre détaillée porte l’état **Ouverte** et ajoute le nombre de postes,
la date, les compétences et la description.
Une offre **close** reste consultable dans la référence.

| Élément dessiné | État ou information relevée |
|---|---|
| Offre d’emploi | Ouverte ; offre close encore consultable. |
| Candidature personnelle | Entretien et autres états dont les libellés ne sont pas détaillés dans le relevé. |
| Suivi de candidature | Dates de réception et de mise à jour distinctes. |
| Détail transmis | Contenu envoyé, accord horodaté, pièces PDF. |
| Demande de service | En attente ou En cours, avec mise à jour fournie par le professionnel. |

Aucun libellé supplémentaire de candidature n’est déduit des états non détaillés.

## 3. Candidature : identité, pièces et accord

| Champ ou composant | Règle visible dans la référence |
|---|---|
| Nom(s) | Saisie en **MAJUSCULES**. |
| Prénom(s) | Casse initiale : majuscule puis minuscules ; conserver accents, apostrophes et tirets. |
| Motivation | Facultative. |
| Pièce PDF | Type choisi : CV, attestation/diplôme ou lettre. |
| Liste de pièces | Retrait d’une pièce proposé avant envoi. |
| Accord | Explicite avant l’envoi de la candidature. |
| Envoi | Action distincte de l’affichage de l’offre. |

La convention des personnes s’applique aussi aux noms composés.
Le relevé ne fournit ni taille maximale de PDF ni nombre maximal de pièces :
ces limites ne sont pas inventées dans cette fiche.

Mes candidatures propose **Voir l’offre**, **Actualiser**, **Retirer** et
**Relancer l’envoi**. Le détail **Ce qui a été transmis** expose l’accord horodaté
et les pièces PDF personnelles. Relancer l’envoi reste une action affichée,
sans preuve de réception réelle par l’employeur.

## 4. Devis : besoin et consentement PRO.GA

| Champ ou information | Contrainte relevée |
|---|---|
| Besoin | Obligatoire, **1 200 caractères maximum**. |
| Contraintes | Facultatives. |
| Date et heure | Présentées dans le fuseau **Africa/Libreville**. |
| Quantité | Présente ; aucune borne chiffrée fournie dans le relevé. |
| Pièces | Nombre de pièces choisies ; les fichiers restent dans la conversation. |
| Consentement | Accord spécifique au transfert PRO.GA. |
| Coordonnées | Aucune adresse complète ni téléphone dans cette demande. |

Le nombre de pièces affiché ne signifie pas que leurs fichiers sont transmis
à PRO.GA. La référence distingue la conversation et le consentement de la demande.

## 5. Rendez-vous : créneau, délai et identité

La prestation dessinée dure **30 minutes**.
Le calendrier permet **Aller à cette date** et le déplacement d’une semaine
en arrière ou en avant. Les créneaux libres nominatifs sont présentés à côté
du choix de date et d’heure.

| Élément | Règle relevée |
|---|---|
| Retenue d’un créneau | **15 minutes maximum**, en attente de confirmation. |
| Changement | Possible jusqu’à **2 heures avant** le rendez-vous. |
| Annulation | Possible jusqu’au début du rendez-vous. |
| Acompte | Aucun acompte sur cette planche. |
| Prénom et nom | Tous les deux renseignés, ou aucun des deux. |
| Message | **500 caractères maximum**. |
| Accord | Case explicite avant **Demander le créneau**. |

Ces délais décrivent la référence ; aucun verrouillage réel du créneau n’a été
éprouvé dans le cadre de cette mission documentaire.

## 6. Prestation et suivi des demandes

La prestation illustre un **tarif fixe de 3 500 XAF** ; c’est l’exemple de la
planche, pas un tarif général imposé aux offres.

| Champ ou information | Contrainte relevée |
|---|---|
| Quantité | **1 à 10**. |
| Date | Facultative. |
| Message | Facultatif, **500 caractères maximum**. |
| Prénom et nom | Les deux ou aucun. |
| Total | Affiché avant la demande. |
| Accord | Accord de commande, sans paiement sur cette planche. |
| Confirmation | Attendue du professionnel. |

Mes demandes réunit **devis**, **rendez-vous** et **prestations**.
La liste présente **10 éléments par page**, les états **En attente / En cours**
et une date de mise à jour fournie par le professionnel.
L’action ouvre la demande concernée.

## 7. Les trois formats de la référence

Chaque planche de cette famille possède les trois vues suivantes :

| Vue | Dimensions de planche |
|---|---|
| Téléphone | **390 × 844** |
| Tablette | **834 × 1 194** |
| Ordinateur | **1 440 × 1 024** |

Ces cadres ne fixent pas de seuil responsive dans le code.
Le relevé transmis ne détaille pas la grille, l’empilement du formulaire ou
le placement du calendrier par format ; aucune adaptation supplémentaire
n’est ajoutée à la description des écrans.

## 8. Portée de la fiche

La palette, les composants transverses et leur géométrie suivent le
[socle commun](../00_SOCLE_COMMUN.md).
La vérification des formulaires, transmissions, délais et états dans l’application
reste à rapprocher du [registre des écarts](../08_ECARTS_REFERENCE_ET_CODE.md).
Le présent relevé ne constitue ni une candidature envoyée, ni un créneau confirmé,
ni une prestation commandée dans un système réel.
