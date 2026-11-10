# Guide de l'acheteur et du client — pilote ANTSIA

> **Mise à jour du 20 octobre 2026.** Aucun pilote n’est conduit ni capacité ouverte dans cette
> reprise. Paiements et nouveaux engagements de services restent fermés par P16 dans les sources ; une ancienne
> politique activée ne les rend pas disponibles. Les étapes historiques qui suivent décrivent
> un parcours cible, sans autoriser un achat ou une transaction.

Cet état concerne la candidate de cette reprise, sans observation de production publiée ailleurs.

### Reprise d’une demande et suivi existant

Après une panne ou une réponse inconnue, ouvrir le suivi existant plutôt que recréer l’engagement.
La reprise P14 retrouve l’intention ou exige une absence et sa clôture certaine avant un nouvel
accord. Une indisponibilité de la consultation ne signifie pas que la demande n’existe pas.
Une nouvelle version de devis, un créneau ou une révision différente exigent un nouvel accord ;
un statut « accepté » choisi par un employé ne remplace pas votre preuve d’accord.

Le retrait de boutique et la fermeture de nouvelles admissions doivent préserver le suivi privé,
les libérations, annulations et demandes de remboursement déjà admissibles. Cela ne prouve
ni un paiement ni un remboursement effectué. Les avis de service restent connus après ouverture
de **Mes demandes**, sans nouveau canal asynchrone acquis par cette reprise.

Un client téléphone natif est écrit, mais aucun binaire ni appareil n’est validé. Le commerce
natif complet et la réponse d’appel authentifiée avant déverrouillage ne sont pas promis.
L’effacement social ne certifie aucune suppression financière ou générale dans PRO.GA ; ne pas
effacer une référence pour tenter de faire disparaître une réponse encore incertaine.

[État actuel des capacités](../01_VERSIONS_CANDIDATES.md#actualisation-du-20-octobre-2026),
[support](PROCEDURES_SUPPORT.md), [P14](../../rapports/P14_REPRISE_2026-10-20.md),
[P16](../../rapports/P16_REPRISE_2026-10-20.md).

### Guide historique du 19 octobre (conservé)

> **Avant de lire.** Ce guide décrit le fonctionnement prévu par le code livré les 18 et 19 octobre
> 2026. Rien n'est encore vérifié ni ouvert. Chaque partie indique sa **disponibilité**. **Le
> paiement n'est pas disponible dans ce pilote** : aucun argent réel ne doit être engagé.

## 1. Lire une offre

- Le prix peut être **fixe**, **à l'unité**, une **fourchette** ou **« Sur devis »**. Une fourchette
  ou « Sur devis » ne se paie pas : il faut une demande de devis.
- La disponibilité est indicative (« en stock », « rupture » ou « inconnue ») et datée. Après quinze
  minutes sans nouvelle information, elle est signalée comme périmée. Le stock réel n'est confirmé
  qu'au moment de préparer la commande.
- Le vendeur, la zone, le mode de remise et les frais sont affichés avant tout engagement.

## 2. Poser une question au vendeur

**Disponibilité** : si le réseau et la boutique ont ouvert le contact.

- Depuis la vitrine ou l'offre, **« Poser une question »**. Vous envoyez **un seul message** (1 à
  2 000 caractères), sans pièce jointe ni appel, jusqu'à ce que la boutique accepte.
- La réponse vient **au nom de la boutique**, avec l'alias publié de la personne qui répond.
- Vous pouvez à tout moment bloquer, signaler ou clore la conversation. Elle reste liée au réseau où
  vous l'avez ouverte.
- Un appel n'a lieu qu'avec votre accord et celui du répondant. Une question ne fait jamais sonner
  la boutique d'elle-même.
- **Option** : transmettre votre demande au vendeur comme prospect dans PRO.GA. Vous choisissez le
  texte et l'alias transmis ; ni la conversation entière, ni votre e-mail, ni votre téléphone ne
  partent. Vous retirez cet accord depuis **Mes données**, même si vous n'êtes plus membre.

## 3. Préparer une commande

**Disponibilité** : si le réseau et le vendeur ont ouvert les préparations.

1. Choisissez la variante exacte et la quantité. Le panier ne contient qu'**un seul vendeur** (dix
   lignes au plus).
2. Choisissez le retrait dans un établissement du vendeur ou la livraison (Gabon seulement, localités
   desservies). **Saisissez votre adresse** : elle n'est jamais reprise de votre profil, et vous la
   ressaisissez après une recharge de la page.
3. Lisez le récapitulatif : lignes, frais, total en XAF, échéance. Cochez vous-même l'accord.
4. L'article vous est **réservé quinze minutes**. Un avertissement apparaît deux minutes avant la fin.
   Aucune prolongation n'existe : à l'échéance, la réservation est libérée.
5. Si le prix ou l'offre ont changé, l'ancien et le nouveau récapitulatif s'affichent et un nouvel
   accord est demandé. Rien n'est accepté à votre place.
6. Vous pouvez abandonner : la réservation est libérée.

Hors connexion, votre brouillon de panier reste dans le navigateur et rien n'est envoyé. Ce
brouillon dure vingt-quatre heures au plus et s'efface à la déconnexion. Préparer une commande **ne
déclenche aucun paiement**.

## 4. Payer

**Disponibilité : non disponible dans ce pilote.**

Quand un prestataire sera admis, les règles prévues seront les suivantes, et seulement en
environnement de test pendant le pilote :

- « Payé » ne s'affiche que lorsque le serveur a reçu la preuve du prestataire. Revenir de la page du
  prestataire **ne prouve pas** le paiement : l'écran indique « vérification en cours ».
- Si vous ne savez pas si un paiement est passé, **ne recommencez pas** : ouvrez **Mes paiements**.
  Le système consulte le prestataire avant toute nouvelle tentative.
- Payer, recevoir et être remboursé sont des étapes distinctes.

## 5. Suivre vos engagements

| Écran (Profil) | Ce qu'il montre |
|---|---|
| Mes préparations | réservations en cours, libérées, expirées, à reconfirmer |
| Mes paiements | états de paiement, sans aucune donnée bancaire |
| Mes achats | commande, paiement, stock, remise, réception et remboursement, chacun avec son propre état |
| Mes demandes | devis, rendez-vous et prestations de service |

Une valeur inconnue reste affichée comme inconnue : elle n'est jamais remplacée par « payé » ou par
une date inventée.

## 6. Réception, annulation, retour, remboursement

**Disponibilité** : seulement pour une commande payée, donc pas dans ce pilote.

- **Réception** : c'est votre déclaration explicite que vous avez reçu la commande. Elle est distincte
  du paiement et de l'étape du vendeur.
- **Annulation** et **retour** sont des **demandes**. Selon l'état de la commande, l'annulation est
  immédiate ou examinée.
- Un **remboursement demandé** n'est pas un remboursement effectué. Il est décidé par un
  administrateur de la plateforme et confirmé seulement par la preuve du prestataire.
- Le contact avec le vendeur au sujet d'une commande reste possible même si sa vitrine a été retirée.

## 7. Services : devis, rendez-vous, prestation

**Disponibilité** : si le réseau a ouvert les services. Aucun acompte dans ce pilote.

- **Devis** : depuis une conversation acceptée par la boutique, décrivez votre besoin, vos contraintes
  et la date souhaitée. Vous recevez un devis numéroté. Vous acceptez **une version précise et son
  total** ; une nouvelle version demande un nouvel accord.
- **Rendez-vous** : choisissez un créneau. Il est d'abord **retenu**, puis **confirmé** par le
  professionnel ; aucun paiement n'est lié. L'heure est affichée avec son fuseau (et celui de votre
  appareil s'il diffère). Les conséquences d'un changement ou d'une annulation sont affichées avant
  votre accord. Vous pouvez annuler jusqu'au début du rendez-vous.
- **Prestation à tarif fixe** : une commande au prix publié, sans créneau ni paiement en ligne.
- Aucun avis ne vous prévient encore d'un devis reçu ou d'un rendez-vous confirmé : l'état se met à
  jour quand vous ouvrez **Mes demandes**. Pensez à y revenir.
- **Mes achats** renvoie vers Mes demandes pour les prestations sans paiement en ligne.

## 8. Vos données

- **Mes données** : export de vos informations, retrait de l'accord CRM, demande d'effacement.
- L'effacement prend effet après un délai de grâce de trente jours, pendant lequel vous pouvez
  l'annuler. Si vous avez des rendez-vous à venir, un avertissement s'affiche : **annulez-les
  d'abord** depuis Mes demandes, car l'effacement ne les annule pas chez le professionnel.
- Ce que le vendeur doit conserver pour ses obligations (commandes, preuves) reste chez lui, sous
  des durées qui ne sont pas encore fixées. L'effacement n'efface pas ces engagements.

## 9. Limites connues du pilote

- Fonctions non vérifiées : signalez tout comportement inattendu.
- Pas de paiement, donc pas d'achat payé, de réception ni de remboursement dans ce pilote.
- Livraison au Gabon seulement ; XAF seulement ; un vendeur par panier.
