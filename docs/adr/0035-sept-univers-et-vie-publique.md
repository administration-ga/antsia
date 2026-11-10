# ADR-0035 : Sept univers et vie publique — trois piliers, une page par activité, iAsted, conformité dès la conception

- **Statut** : Accepté par le propriétaire le 2026-10-21 pour les décisions D01 à D08 ; D09 à D12 restent proposées. Lot SU00.
- **Date** : 2026-10-21

## Contexte

L'étude du 21 octobre 2026 ([dossier](../etudes/2026-10-21-sept-univers-et-vie-publique/README.md)) répond à une demande du propriétaire : choisir au moins sept spécialités business adaptées à la population, dire si un business est « une page + une boutique » ou « une page configurée en boutique », donner une place à l'administration, aux médias et aux annonceurs dans le réseau public, et intégrer iAsted.

Ce qui pousse à décider maintenant :

- **Le terrain.** Au Gabon, vendre, louer, recruter et nourrir passent déjà par les réseaux (catalogues WhatsApp, groupes Facebook, ventes sur TikTok), avec une douleur commune : la confiance (frais de visite des démarcheurs, doubles ventes de terrains, faux recrutements payants, achats payés d'avance non livrés). Douze univers candidats ont été notés ; sept ressortent.
- **Le contexte de 2026.** La HAC a suspendu les réseaux sociaux le 17/02/2026 (statut au 21/10 incertain). L'ordonnance n° 0011/PR/2026 du 26/02/2026 (JO n° 110), ratifiée le 05/10/2026, vise toute plateforme de « mise en relation de plusieurs parties en vue de la vente d'un bien, de la fourniture d'un service » et tout réseau social : ANTSIA est concerné à double titre. Les ordonnances n° 0012 et 0013/PR/2026 étendent le Code de la communication aux plateformes et à leurs « assimilés », et donnent à la HAC la régulation des plateformes et de la publicité.
- **L'existant.** L'ADR-0034 a accepté, pour les boutiques, les services et les médias, une page sociale par activité avec capacités combinables (A01) et PRO.GA comme autorité commerciale (A02) ; les lots MP00–MP14 sont en cours. iAsted a été exclu d'ANTSIA lors de la duplication du socle ([owner map](../02_OWNER_MAP_DUPLICATION.md)). Le cahier des charges pose que « le citoyen ne paie jamais » et que la monétisation, si elle vient, est B2B et étiquetée (§ 0, EXF-AN-52).

## Décision

Nous allons organiser ANTSIA en **trois piliers** et **sept univers**, représenter chaque business par **une page dotée d'espaces métier**, faire entrer **iAsted** et réserver les **espaces de la vie publique**, en concevant chaque lot **conforme** à l'ordonnance n° 0011/PR/2026 et à la loi n° 025/2023.

1. **D01 — Trois piliers, sept univers.** Divertissement (fil, Clips, Stories, directs, groupes, évènements, Messages), business et vie publique. Les sept univers business sont : boutiques ; immobilier et foncier ; emploi et talents ; alimentation et restauration ; services et artisans ; auto et mobilité ; cérémonies et sorties. Les rencontres (MP10–MP11) relèvent du divertissement et restent fermées. La livraison est une capacité commune assurée par des partenaires. La liste est revue après six mois de mesures réelles ; chaque univers reçoit, à son ouverture, des critères d'arrêt.
2. **D02 — Une page par activité, des espaces, une entité responsable.** Pour le public, un business est une page qui se configure selon son métier. La page porte l'identité et active des espaces métier : Boutique, Prestations, Emplois et Média existent ; Biens, Location et Billetterie sont à créer. Chaque espace a sa navigation spécialisée (contrat `specialized-navigation` v1) et sa propre admission : préparer, publier et encaisser restent distincts (ADR-0034). Derrière la page se tient une entité responsable : la personne, ou la structure PRO.GA qui détient catalogue, stock et engagements. Une entité peut tenir plusieurs pages pour des activités distinctes, sous la même vérification. Les gabarits de spécialité (agence immobilière, loueur de véhicules, restauration, organisateur de cérémonies et sorties, employeur) règlent blocs, attributs et actions, jamais les droits ni les badges. La location de ressources (créneau + caution) est un module partagé de PRO.GA. Cette décision étend la décision A01 de l'ADR-0034 sans la remplacer.
3. **D03 — L'annonce de particulier.** Une publication typée rattachée à une personne, sans page ni PRO.GA : ni stock, ni commande, ni encaissement, seulement une mise en relation, ce qui laisse intacte l'autorité commerciale de PRO.GA (ADR-0018).
   - Quotas par univers et par période.
   - Catégories encadrées : un terrain exige l'identité Vérifiée, un emploi exige une page employeur, les catégories interdites sont refusées.
   - Contact par demande filtrée et retrait à échéance.
   - « Passer pro » transfère les annonces actives vers une page.
   - Mêmes invariants que toute table sociale : `networkId`, débit, modération, export, effacement.
4. **D04 — Ouvrir d'abord sans paiement en ligne.** Après la consolidation MP00–MP14, la vague 2 ouvre l'immobilier et le foncier, l'auto et la mobilité, et l'alimentation et la restauration, avec une commande payée à la remise. La billetterie et les réservations payées attendent un contrat avec un prestataire de paiement. Une route ou une tuile n'existe qu'à l'ouverture effective de son univers : aucun alias vide.
5. **D05 — iAsted entre dans ANTSIA.** L'exclusion décidée à la duplication est levée.
   - **Trois rôles** : l'iAsted du membre (nouveau) ; l'agent du vendeur (PRO.GA, relié au contact commercial de Messages) ; l'iAsted citoyen (orientation vers l'administration compétente).
   - **Quatre étapes** : (a) recherche en langage courant, besoins et alertes, en lecture seule ; (b) agent du vendeur dans Messages ; (c) actions confirmées ; (d) mandats d'achat, une fois les paiements ouverts.
   - **Garde-fous** :
     - il se présente comme une IA et marque ce qu'il produit ;
     - aucun engagement sans confirmation explicite ;
     - il ne lit ni les Messages privés, ni les rencontres, ni les candidatures d'autrui ;
     - aucun profilage sensible ou politique ;
     - raisons et sources visibles, sponsorisé toujours séparé ;
     - le contenu des annonces n'est jamais traité comme une consigne ;
     - ses réponses se limitent au catalogue vérifié.
   - **Passerelle** : tout passe par la passerelle unique du plan iAsted 2.0 (droits, crédits, classes de données, journal, coupe-circuit), sans fournisseur ni modèle codé en dur.
   - **Coût** : gratuit pour le membre.
6. **D06 — Les espaces réservés de la vie publique.**
   - **Officiel** : pages fédérées depuis administration.ga (ADR-0013 à 0016) ; une catégorie Alerte, bornée en nombre ; jamais sponsorisé.
   - **Agent public** : profil personnel, volontaire, badge retirable.
   - **Presse** : label calculé à partir d'une attestation d'enregistrement, retiré avec elle ; le badge Officiel reste réservé aux institutions (ADR-0034, décision 7).
   - **Sponsorisé** : mention « payé par », annonceur vérifié, densité plafonnée, jamais dans Messages, bibliothèque publique de toutes les annonces, aucun ciblage sur une donnée sensible ni sur les Messages, achats, candidatures ou rencontres.
   - Chaque étiquette est calculée côté serveur.
7. **D07 — La règle politique.**
   - Pas de publicité politique payante.
   - Les pages de partis et d'élus sont étiquetées « Politique » et soumises à des règles renforcées en période électorale.
   - Les pages Officielles informent et ne font pas campagne ; leur badge tombe avec l'attestation ; un compte public abandonné est archivé.
8. **D08 — Conforme dès la conception.** Chaque lot SU démontre sa conformité à l'ordonnance n° 0011/PR/2026 (et aux ordonnances n° 0012 et 0013) et à la loi n° 025/2023. L'analyse [SU01](../etudes/2026-10-21-sept-univers-et-vie-publique/SU01_CONFORMITE_ORDONNANCE_0011.md) fixe les exigences, les écarts, les arbitrages juridiques et le plan.
   - **Précision de lecture.** L'article 4 de l'ordonnance impose l'identification de tout titulaire de compte : noms, prénoms, domicile, téléphone, RCCM s'il y a lieu. L'« identification proportionnée » de D08 désigne donc une collecte minimale, une conservation privée et une absence d'affichage public, pas une exemption.
   - **NIP** : aucun traitement sans autorisation préalable de l'APDPVP (loi n° 025/2023, art. 81).

## Contrats et compatibilité

- **ADR-0034** : les décisions A01 à A10 restent en vigueur. D02 étend A01 aux sept univers ; la marketplace et ses lots MP00–MP14 ne changent pas.
- **ADR-0002** : l'identification de l'article 4 touche les comptes légers par code à usage unique. L'arbitrage juridique de SU01 dira s'il faut un ADR dédié pour compléter la partie « comptes légers », qui reste en vigueur d'ici là. Aucune règle de badge ne change : badges et labels restent calculés, jamais déclarés.
- **Owner map de duplication** : la ligne qui exclut iAsted du moteur est levée par D05. Le document reste un historique et n'est pas réécrit.
- **Cahier des charges** : un avenant ajoutera les exigences des sept univers, de la vie publique, d'iAsted et de la conformité (EXF-AN-54 et suivantes). D'ici là, le présent ADR et l'étude font foi.
- **Lots** : les lots SU00 à SU16 de l'étude forment la feuille de route. Chacun est exécuté seul, réservé dans la mémoire partagée, branché dans l'application réelle et vérifié selon les instructions du dépôt.
- **Décisions encore proposées** : D09 (conventions de vérification d'État), D10 (modèle économique), D11 (positionnement et pilote), D12 (rencontres fermées). Aucun lot ne les présume.

## Conséquences

### Positives

- Une seule identité par activité, quel que soit le nombre de métiers ; le public sait à qui il parle et l'activité grandit sans changer d'adresse.
- Les particuliers ont une place, ce qui ouvre une porte de formalisation vers PRO.GA.
- Le premier service rendu est la confiance : étiquettes calculées, vie publique séparée de la promotion, conformité visible.
- iAsted devient le point d'entrée commun aux sept univers, avec des garde-fous déjà éprouvés dans PRO.GA.

### Négatives

- Plus de règles à tenir côté serveur : espaces, admissions, quotas d'annonces, étiquettes, délais réglementaires.
- L'identification de l'article 4 et la vérification d'âge alourdissent l'inscription ; leur arbitrage juridique peut amender l'ADR-0002.
- La conservation réglementaire (articles 29 et 31) entre en tension avec l'effacement effectif des données sociales ; elle doit être bornée par un texte et une durée.
- Un module d'IA, une passerelle et une évaluation dédiée sont à construire et à exploiter.

### Neutres

- Les rencontres gardent leur conception (MP10–MP11) et leur fermeture.
- Les paiements restent fermés tant qu'aucun prestataire n'est contracté (MP08).
- Le préfixe SU est propre à cette feuille de route ; les préfixes P, U, MP et PA restent inchangés.

## Alternatives considérées

### Option A — Rester aux quatre familles du plan marketplace

Boutiques, services, rencontres et presse seulement. Rejetée : l'immobilier, l'emploi, la restauration et l'auto sont parmi les plus gros flux et les plus fortes douleurs observés.

### Option B — Une page et une boutique séparées, ou une application par univers

Rejetée : deux identités qui se concurrencent (abonnés, avis, vérification et modération doublés) ; aucune grande plateforme ne fait de la boutique une identité distincte de la page.

### Option C — Une page figée en boutique, un seul métier

Rejetée : onglets vides pour un média ou une administration ; impossible de vendre, de prester et de recruter sous une même identité.

### Option D — Laisser iAsted hors d'ANTSIA

Renvoyer vers PRO.GA ou demarche.ga. Rejetée : la recherche entre vendeurs, les besoins et les alertes n'existent nulle part, et la valeur d'orientation se perd.

### Option E — Ouvrir tous les univers en même temps, ou attendre les paiements

Rejetée : les univers vides font fuir, et les paiements dépendent d'un contrat externe. On ouvre d'abord ce qui fonctionne sans paiement en ligne.

## Références

- [Étude complète](../etudes/2026-10-21-sept-univers-et-vie-publique/ETUDE_SEPT_UNIVERS_ANTSIA.md) et [dossier PDF](../etudes/2026-10-21-sept-univers-et-vie-publique/ETUDE_SEPT_UNIVERS_ANTSIA.pdf).
- [SU01 — Analyse de conformité à l'ordonnance n° 0011/PR/2026](../etudes/2026-10-21-sept-univers-et-vie-publique/SU01_CONFORMITE_ORDONNANCE_0011.md).
- ADR [0002](0002-identite-idn-unique-comptes-legers-badges-calcules.md), [0013](0013-pages-administratives-federees-et-revisions-source.md) à [0016](0016-producteur-administratif-et-transfert-de-consentement.md), [0018](0018-commerce-pro-ga-autorite-et-contrats.md), [0019](0019-boutique-progressive-et-canal-commercial.md), [0024](0024-emploi-consenti-et-candidatures-privees.md), [0034](0034-marketplace-et-espaces-specialises.md).
- [Cahier des charges ANTSIA](../00_CAHIER_DES_CHARGES_ANTSIA.md) § 0, § 6.4, EXF-AN-46 à 52.
- Journal officiel de la République gabonaise n° 110 (8-15 avril 2026) : ordonnances n° 0011, 0012 et 0013/PR/2026.
- Journal officiel de la République gabonaise n° 218 bis (15 juillet 2023) : loi n° 025/2023 du 12 juillet 2023 (données personnelles).
