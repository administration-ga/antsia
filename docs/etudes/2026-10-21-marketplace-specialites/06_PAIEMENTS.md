# 06 — Paiements, vendeurs et reversements

**Spécification approuvée, implémentation en cours · Recherche documentaire du 21 octobre 2026**

## 1. Expérience souhaitée

Le vendeur configure les moyens de paiement de son activité depuis son tableau de bord ANTSIA. L’acheteur voit uniquement ceux qui sont réellement utilisables pour cette commande. L’interface ne demande jamais le PIN Mobile Money, le mot de passe PayPal ou les données complètes de carte.

PRO.GA conserve le registre commercial et le rapprochement ; le prestataire confirme les mouvements de fonds. ANTSIA présente les capacités et les états autorisés.

Une liste de logos et un écran de succès ne constituent pas une intégration de paiement.

## 2. Faisabilité par moyen

| Moyen demandé | Source officielle et constat | Décision proposée |
|---|---|---|
| Airtel Money | Le portail développeur référence le Gabon ; les API Airtel Africa annoncent collecte et décaissement. L’admission locale exacte reste à obtenir. | Connecteur direct ou agrégateur après contrat, sandbox et preuve des capacités Gabon/devise/activité |
| Moov Money | Moov Money Online annonce l’encaissement sur sites marchands au Gabon, avec souscription contractuelle. Les modalités API de remboursement et de reversement ne sont pas suffisamment documentées publiquement. | Qualification directe ou agrégateur ; ne pas déclarer ces fonctions disponibles sans preuve |
| Carte bancaire | Un PSP/acquéreur doit accepter l’entité, le pays d’établissement, le règlement local et le modèle marketplace. | Paiement hébergé ou composants tokenisés ; choisir le prestataire par preuve d’éligibilité, pas par préférence de SDK |
| PayPal | L’onboarding vendeur classe le Gabon « Send only » ; XAF n’apparaît pas dans les monnaies API consultées. | Préparer un adaptateur conditionnel ; masquer l’encaissement gabonais tant que l’entité et la devise ne sont pas admises par PayPal |

Sources primaires : [Airtel](https://developers.airtel.africa/), [API Airtel Africa](https://www.airtel.africa/assets/pdf/press-release/Airtel-Africa-Developer-Portal_ENGLISH.pdf), [Moov Money Online](https://moovmoney.ga/marchand/moov-money-online-marchand/), [éligibilité PayPal](https://developer.paypal.com/platforms/seller-onboarding), [monnaies PayPal](https://developer.paypal.com/api/codes/currency).

**Candidats à qualifier, pas choix commerciaux déjà faits :**
- [SingPay](https://singpay.ga/) et sa [référence API](https://client.singpay.ga/doc/reference/index.html) documentent Airtel/Moov, lien de paiement, consultation et distribution technique vers des portefeuilles. Leur contrat doit explicitement couvrir le montage ANTSIA, les vendeurs et les obligations financières. Aucun rail carte n’est déduit de cette seule documentation.
- [CinetPay](https://cinetpay.com/index.php/products/payments) annonce notamment des paiements carte ; son [SDK officiel](https://github.com/cinetpay/cinetpay-php-sdk/blob/master/README.md) précise que la présence d’un pays dans un référentiel ne prouve pas l’activation des opérateurs. L’acquisition et le règlement pour un marchand gabonais restent à confirmer.

Ne pas créer un compte dans un autre pays pour contourner une restriction. Une extension internationale éventuelle doit correspondre à une entité réelle, éligible et contractuellement admise.

Distinguer pays du collecteur, pays du vendeur et pays du payeur. Une entité collectrice réellement éligible ne suffit pas, à elle seule, à prouver la possibilité de reverser à tous les vendeurs de la marketplace.

## 3. Encaissement marchand et marketplace

Le modèle P12 demandé précédemment prévoit ANTSIA comme collecteur et une répartition configurable : vendeur90 %, vendeur85 % ou contrat particulier. Le présent plan le conserve comme cible, sans annoncer qu’il est activé.

Collecter une vente pour un marchand et collecter pour plusieurs vendeurs, retenir une commission puis reverser sont des montages distincts. Un endpoint de transfert ne valide pas le second montage.

Avant ouverture financière :
- identifier l’entité contractante, le titulaire des fonds et le prestataire autorisé ;
- obtenir la couverture explicite de la marketplace et de ses vendeurs ;
- définir KYC, règlement, commission, frais, remboursements, contestations et reversements ;
- arrêter conditions de vente, rôle de chaque partie et règles de conservation ;
- faire valider le montage avec les responsables compétents.

Le [règlement CEMAC publié par la BEAC](https://www.beac.int/wp-content/uploads/2019/07/REGLEMENT-N-04-18-CEMAC-UMAC-COBAC-du-21-d%C3%A9cembre-2018.pdf) encadre les services de paiement et les fonds des clients. La cible doit être portée par un dispositif contractuellement admis ; le code ne crée ni agrément, ni séquestre réglementaire.

Si ce montage n’est pas disponible, garder le règlement intégré fermé. Un encaissement direct vendeur constituerait une alternative de périmètre à décider, pas une substitution silencieuse au modèle P12.

## 4. Configuration du vendeur

Assistant « Mes paiements » :
1. choisir l’activité PRO.GA autorisée ;
2. prendre connaissance du mode de collecte, de la commission et des frais ;
3. choisir les moyens admissibles ;
4. terminer l’onboarding ou le rattachement sécurisé du prestataire ;
5. renseigner les destinations de règlement par le circuit autorisé ;
6. afficher statut, limitations, pièces manquantes, révision et dernière vérification.

Statuts proposés : Non configuré, Vérification en cours, Disponible, Action requise, Suspendu. Ils proviennent du serveur et du prestataire, pas d’une case « J’accepte les paiements ».

Distinguer un numéro de contact public et un compte marchand ou bénéficiaire. Une modification de bénéficiaire est une action sensible, relue et tracée ; elle ne réécrit jamais le bénéficiaire d’une transaction engagée.

Les secrets sont gérés côté serveur par les mécanismes autorisés, avec séparation sandbox/production ; aucun secret dans page, contrat public, stockage navigateur, dépôt ou conversation. Les pièces KYC suivent le canal prévu du prestataire ; leur collecte n’est pas lancée pendant l’étude.

## 5. Architecture d’exécution

Réutiliser les contrats privés P12 et le registre d’adaptateurs PRO.GA. Étendre explicitement les capacités de chaque adaptateur : initier, consulter, authentifier une notification, rembourser et, séparément, reverser.

À chaque intention, relire :
- personne/réseau, mandat et état vendeur ;
- offre, variante, quantité, devise, prix et frais ;
- accord acheteur et politique de répartition acceptée ;
- bénéficiaire, environnement et capacités réellement prêtes.

Les montants restent dans les unités monétaires exactes du contrat, sans flottants. La répartition en points de base, la base de calcul et l’arrondi sont figés par transaction.

La notification du prestataire est une entrée serveur dédiée : authentification et anti-rejeu, vérification référence/marchand/montant/devise et rapprochement. Si un prestataire ne signe pas suffisamment ses callbacks, une consultation serveur authentifiée doit fournir la preuve requise ; l’URL de retour et une adresse IP seules ne suffisent pas.

Idempotence par opération et événement. Après délai ou panne, consulter l’état de la même intention avant de renvoyer ; ne jamais créer automatiquement une nouvelle demande de débit pour « réessayer ».

## 6. États honnêtes et suivi

| Objet | Exemples d’états distincts |
|---|---|
| Paiement | À initier, En attente, Confirmé, Refusé, Incertain, Remboursement en cours, Remboursé |
| Commande | Préparée, Confirmée, Annulée, En litige |
| Remise ou service | À préparer, Disponible, Remis/Exécuté, Réception confirmée |
| Répartition et versement | Allocation prévue, Retenue, Éligible selon politique, Reversement demandé, Versement confirmé |

Les noms devront s’aligner sur les machines d’état existantes ; ce tableau n’est pas une migration de schéma.

Un retour navigateur ne produit pas « Payé ». Une réception ne produit pas automatiquement « Versé ». Un débit confirmé après expiration du stock impose traitement explicite de l’obligation et, si nécessaire, remboursement, pas livraison fictive.

Remboursement : circuit d’autorisation existant, transaction/bénéficiaire d’origine et preuve fournisseur. Les commissions et annulations suivent la politique figée ; aucun remboursement vers un portefeuille arbitraire fourni dans un formulaire.

Les services ont leur propre admission financière, actuellement fermée. Acompte et jalons nécessitent des contrats et tests supplémentaires avant affichage.

## 7. Portes d’activation

1. Documentation et contrat d’éligibilité exacts.
2. Adaptateur implémenté et erreurs bornées.
3. Scénarios sandbox bout en bout, dont remboursement et événements dupliqués.
4. Rapprochement et procédures de reprise observés.
5. Admission vendeur et politique de répartition validées.
6. Décision d’ouverture documentée, puis pilote limité.
7. Observation des états réels avant extension.

Ne pas passer globalement à vrai les drapeaux de commerceActivation. L’ouverture d’un rail ne débloque pas les autres ni les reversements. La fermeture d’une nouvelle vente conserve les voies de suivi et de résolution des engagements existants.

## 8. Critères d’acceptation

- Une capacité absente, un compte non admis ou une devise incompatible masque le paiement correspondant.
- Une commande affichée en XAF n’est pas convertie silencieusement pour afficher PayPal.
- Retour client, webhook contrefait, mauvais montant et événement rejoué ne confirment aucun règlement.
- Deux callbacks produisent un seul effet ; deux débits réels restent deux faits à rapprocher.
- Panne après débit : recherche et reprise sans second débit automatique.
- Vente, réception, remboursement, commission et versement restent corrélés et distincts.
- Tests sandbox par rail et tests produits/services séparés, puis recette des trois formats.
