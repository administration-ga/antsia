# 03 — Marketplace de services et espaces prestataires

**Spécification approuvée, implémentation en cours · 21 octobre 2026**

## 1. Une expérience de prestation

Un prestataire présente ses spécialités, réalisations, offres et modalités d’intervention. L’acheteur peut comparer, poser une question, réserver ou demander un devis selon le service.

Une boutique de produits peut activer des services complémentaires, comme une retouche ou une installation. Le prestataire conserve la même page sociale et la même identité d’activité.

| Offre | Action principale | Informations obligatoires |
|---|---|---|
| Service sur devis | Demander un devis | Besoin, périmètre, éléments nécessaires à l’estimation, zone |
| Rendez-vous | Choisir un créneau | Durée, lieu ou distance, ressource, disponibilité, conditions |
| Forfait défini | Choisir ce forfait | Livrables, prix fixe, délai, inclusions, exclusions, modalités d’accord |

Un service affiché « À partir de » ou « Sur devis » ne devient pas payable pour un montant arbitraire. Le devis accepté et ses conditions constituent l’engagement, selon le contrat PRO.GA.

## 2. Annuaire général de services

Créer un index de toutes les offres publiées admissibles, paginé. L’actuelle sélection de quelques offres de quelques boutiques ne constitue pas cet annuaire.

Recherche par prestation et spécialité ; filtres :
- catégorie : entretien, artisanat, numérique, création, accompagnement, etc., selon taxonomie validée ;
- intervention sur place, chez le prestataire ou à distance ;
- zone approximative, langues et modalités ;
- forfait, rendez-vous ou devis ;
- budget et durée seulement lorsqu’ils sont comparables ;
- disponibilité confirmée selon les informations réellement exposables.

Une offre sans calendrier public porte « Disponibilités sur demande ». Les créneaux privés et emplois du temps détaillés d’un prestataire ne deviennent pas des données de recherche publique.

Tri : pertinence définie, nouveauté, prix comparable ; avis et popularité uniquement sur preuves. Les avis ne sont pas une copie des réactions sociales.

## 3. Espace professionnel

Navigation : Présentation, Prestations, Réalisations, Disponibilités, À propos et Page sociale ; Avis sera ajouté avec le complément P1 réellement ouvert.

Chaque fiche précise :
- ce que le client reçoit et ce qui est exclu ;
- prix et unité, délai, durée, zone et langue si utiles ;
- prérequis et pièces strictement nécessaires ;
- nombre de révisions pour une prestation créative, lorsque prévu ;
- conditions de changement, annulation, report et remboursement ;
- informations de contact de l’activité publiées volontairement.

Les réalisations ont des médias admis et des droits d’exposition ; le portfolio n’expose ni noms de clients ni documents privés sans accord. Les qualifications professionnelles restent déclarées ou attestées selon une preuve distincte du badge IDN.

## 4. Demande et suivi

~~~mermaid
flowchart LR
    D[Découvrir une prestation] --> Q[Question commerciale facultative]
    D --> C[Choisir devis, créneau ou forfait]
    Q --> C
    C --> A[PRO.GA relit offre, mandat et disponibilité]
    A --> V[Accord explicite et versionné]
    V --> S[Suivi de la demande]
    S --> E[Exécution et réception]
    V --> P[Paiement seulement après admission du lot financier services]
~~~

La messagerie utilise le canal commercial de P10 : le client peut contacter un prestataire sans devenir une connexion personnelle. Une demande commerciale n’accorde pas un droit d’appel ou d’accès au profil privé.

Pour le devis : besoin → réponse professionnelle versionnée → lecture du montant et des conditions → acceptation/refus explicite → suivi. Un devis modifié ne réutilise pas l’accord précédent.

Pour le rendez-vous : disponibilité → sélection → retenue limitée → confirmation serveur → rendez-vous confirmé. Deux demandes simultanées sur une même ressource ne reçoivent pas le même créneau. Afficher heure locale et fuseau de l’activité ; conserver les instants UTC et le fuseau contractuel existant.

Pour le forfait : reprise du parcours P14 sans stock produit fictif. Le livrable, le délai et le prix final sont figés dans le snapshot contractuel.

## 5. Paiement et exécution restent distincts

Les sources P14 refusent actuellement de nouvelles admissions financières de services. **Ne pas réutiliser le paiement produit pour contourner cette garde.**

Prévoir un sous-lot dédié :
1. définir les obligations, le fait générateur du paiement et les conditions de réception ;
2. étendre les contrats et la readiness de PRO.GA pour les services ;
3. tester acompte, solde, prestation annulée et litige, si ces modalités sont retenues ;
4. ouvrir uniquement les modalités validées et réellement prises en charge par le prestataire.

Acompte, jalons, paiement horaire et abonnement sont des extensions, pas des boutons disponibles par défaut. La première version peut rendre devis et réservation utiles avant leur activation financière.

## 6. Gestion et confiance

Le prestataire gère offres, demandes, devis et agenda dans l’interface légère ANTSIA, sous mandat relu par PRO.GA. Un état « Accepté » n’est ni « Payé » ni « Terminé ».

Les notifications privées de suivi déjà présentes sont réutilisées avec leur contrat et leur état réel de configuration. Leur admission technique ne prouve pas une réception sur téléphone.

Complément P1 — avis de prestation : seulement après engagement et exécution attestés, un avis par engagement selon politique définie ; réponses et signalement possibles. Ne pas transformer le vendeur en modérateur exclusif de ses avis.

## 7. Critères d’acceptation

- Un service ancien mais admissible reste trouvable au-delà des dernières offres chargées.
- La recherche locale dans un espace prestataire ne retourne pas les offres d’un autre.
- La demande de contact respecte le blocage et n’ouvre pas une conversation personnelle.
- Un devis expiré ou remplacé refuse l’accord et présente la version courante.
- Deux clients sur un créneau conduisent à une seule confirmation.
- Après coupure de connexion, retrouver la demande ou son absence certaine avant tout nouvel envoi ; jamais dupliquer un engagement.
- Retirer l’offre ferme les nouvelles demandes mais conserve les droits de suivi des engagements existants.
- Prix, frais et moyens de paiement non prêts ne donnent aucun faux bouton de règlement.
- Devis, créneaux et suivi fonctionnent aux trois formats, au clavier et avec les langues/fuseaux prévus.
