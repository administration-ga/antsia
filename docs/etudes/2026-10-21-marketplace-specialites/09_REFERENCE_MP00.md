# MP00 — Référence technique et responsabilités

**21 octobre 2026 · Référence de sources · Plan A01–A10 approuvé par le propriétaire**

Ce relevé fixe le point de départ de MP00–MP14. Il distingue les sources présentes, les contrats à faire évoluer et les conditions d'ouverture. Il ne constitue ni une recette connectée ni une attestation de la version en production. Les décisions d'architecture sont consignées séparément dans l'ADR du chantier.

## 1. Référence Git et livraison

| Dépôt | Branche observée | HEAD observé | État au relevé |
|---|---|---|---|
| ANTSIA | `codex/pa4-identite-session` | `c4d36f345707f87f20dbd970b2850c683c8581be` | Arbre partagé ; 698 entrées modifiées/non suivies à l'instant du relevé |
| PRO.GA | `feat/antsia-social-commerce` | `fa349ea9326e636d40b29120735d4741d62b0e7e` | Arbre partagé ; 64 entrées modifiées/non suivies à l'instant du relevé |

Ces compteurs sont un instantané et changent avec les sessions actives. HEAD ne décrit pas à lui seul les sources servies localement. Aucun changement de branche, index, serveur, secret ou backend n'a été effectué pour ce relevé.

**Versions publiées : à rafraîchir avant toute promotion.** Les rapports antérieurs et les références de livraison stockées dans la mémoire ne prouvent pas la version actuellement servie. Le contrôle devra relever séparément l'application principale, `/demo`, chaque backend et leurs identifiants de version. Conserver le routage `/demo`, son isolation de session et de stockage, les derniers correctifs publiés et les changements simultanés.

## 2. Éléments réellement présents

Les chemins ANTSIA sont relatifs au dépôt ; `../PRO_GA/` désigne le dépôt voisin consulté en lecture seule.

| Domaine | Sources de référence | Capacité présente et limite actuelle |
|---|---|---|
| Personne et réseau | `convex/modules/people/tables.ts`, `convex/lib/access.ts` | Une personne et un handle ; adhésions et session vivante ; aucune preuve de majorité dédiée |
| Pages sociales | `convex/modules/pages/{tables,pages,access,signatories}.ts` | Natures institution/association/company/media/community ; administrateur et signataire ; création générique par membre vérifié |
| Boutique et admission | `convex/modules/shops/{tables,shops,rules,access}.ts` | Brouillon autonome puis page unique ; modèles exclusifs `products` ou `quote_services` ; admission de vitrine distincte de l'encaissement |
| Projections de catalogue | `convex/modules/federation/{tables,commerceCatalog,commerceCatalogMedia}.ts`, `convex/modules/shops/catalogRead.ts` | Têtes versionnées, retrait et disponibilité séparée ; lecture par boutique, pas encore un index exhaustif multivendeur |
| Contrats communs | `packages/social-domain/src/commerce/{primitives,projection,command,lifecycle}.ts` | `PRO-COMMERCE-PUBLIC-V1`, `PRO-COMMERCE-COMMAND-V1`, transport version 1 ; validation fermée des champs |
| Catalogue maître | `../PRO_GA/convex/modules/integrations/{commerceCatalogue,commerceCatalogueDto,commerceCatalogueRead}.ts` | Prix, collections, axes et variantes produits/services publiés par PRO.GA |
| Liaison et transport | `convex/modules/shops/commerceLinkActions.ts`, `convex/modules/federation/commerceTransport.ts`, `../PRO_GA/convex/modules/integrations/{commerceLinks,commercePublicTransport,commerceCommands}.ts` | Liaison consentie, scopes, transport signé et reprises ; pas de lecture directe de la base voisine |
| Achat et paiement | `convex/modules/shops/{checkout*,payment*,order*}.ts`, `../PRO_GA/convex/modules/integrations/{commerceCheckout*,commercePayment*,commerceOrder*}.ts` | Intentions, suivi privé, répartition et rapprochement ; checkout mono-vendeur ; activation réelle non prouvée |
| Adaptateurs PSP | `../PRO_GA/convex/modules/payments/adapters.ts` | Ports typés mais `PAYMENT_ADAPTERS` et `PAYMENT_CALLBACK_BINDINGS` vides au relevé |
| Services | `convex/modules/shops/{services,serviceFlow,serviceTables,serviceLifecycle}.ts`, `../PRO_GA/convex/modules/integrations/{commerceServiceQuotes,commerceServiceBookings,commerceServiceOrders}.ts`, `../PRO_GA/convex/modules/agenda/commerceBookings.ts` | Devis, forfait et réservation, intentions et suivi ; nouveaux effets fermés ; annuaire actuel limité à une sélection |
| Suivi de services | `convex/modules/federation/commerceServiceNotices.ts` | Avis privés corrélés existants ; leur présence ne vaut pas recette de transport sur appareil |
| Réseau professionnel | Personnes/facettes/pages existantes ; `convex/modules/diaspora/jobsTables.ts` réservé à DIASPORALE | Pas de profil professionnel ANTSIA structuré ; ne pas ouvrir les talents DIASPORALE à ANTSIA |
| Rencontres personnelles | Aucune table, route ou source spécialisée trouvée dans le relevé du plan | Admission, profil privé, réciprocité et autorisation iCom à créer ; aucune déduction depuis le graphe social |
| Presse | Pages `media` et publications de page existantes | Pas d'article structuré, rédaction, révision publiée ou circuit éditorial spécialisé |
| Public institutionnel | `convex/modules/public/access.ts` | `publicPageEligible` exige `trust === "official"` ; le nouveau média public nécessitera sa projection propre |

`convex/modules/shops/commerceActivation.ts` conserve `storefrontAutomatic`, `payments`, `services` et `applications` à `ready:false`. Une sélection de modèle, un changement de thème, une console ou l'approbation du plan ne lèvent pas ces portes. Les lectures de suivi, retraits, annulations et obligations existantes restent disponibles selon leurs droits.

## 3. Autorité des données

| Données | Maître | Projection ou rôle ANTSIA |
|---|---|---|
| Identité sociale, page, suivi, posts, modération, consentements sociaux | ANTSIA | Stockage social natif et droits réseau |
| Structure légale, établissement, mandat commercial | PRO.GA | Référence opaque et liaison consentie ; aucun mandat déduit du badge |
| Produits, services, catégories, attributs, variantes, prix, stock | PRO.GA | Projection publiée datée/révocable ; pas de catalogue commercial parallèle |
| Commandes, devis, rendez-vous, facturation et exécution | PRO.GA | Commandes privées signées et suivi minimal autorisé |
| Paiement, remboursement, allocation, reversement | Prestataire qualifié ; rapprochement PRO.GA | États prouvés et intentions ; une page de retour n'est pas preuve de fonds |
| Mise en page, blocs et navigation de l'activité | ANTSIA | Paramètres de présentation bornés, sans code vendeur arbitraire |
| Profils professionnels, rencontres privées, articles et rédaction | ANTSIA | Tables/finalités dédiées ; pas d'export commercial automatique |

Une page au plus porte la boutique d'une activité ; une personne peut gérer plusieurs activités autorisées. Les futures capacités produits/services/média sont combinables, sans deuxième personne ni nouveau réseau. Le premier achat reste mono-vendeur, même lorsque plusieurs paniers sont conservés.

## 4. Matrice de droits et admission

Chaque acte relit adhésion, réseau, état de la personne et rôle vivant. Les refus d'objets inconnus, étrangers ou interdits restent indistincts. Une capacité de présentation n'est jamais une permission serveur.

| Acteur | Préparer/configurer | Publier | Encaisser ou engager | Lire |
|---|---|---|---|---|
| Visiteur anonyme | Non | Non | Connexion et admission requises | Projections publiques explicitement consenties et toujours admissibles |
| Membre actif déclaré | Son brouillon d'activité, dans les quotas | Demande d'admission selon politique ; pas de création institutionnelle | Seulement après les droits, politiques et preuves commerciales du parcours | Contenus du réseau autorisés et projections publiques |
| Préparateur sans page | Son brouillon uniquement | Soumission selon politique | Aucun droit commercial déduit de la préparation | Son brouillon et contenu normalement accessible |
| Administrateur vivant d'une page admissible | Activité de sa page et équipe autorisée | Publication de vitrine selon politique ; consentement public explicite | Mandat PRO.GA et admission PSP distincts ; pas d'auto-admission | Gestion et projections selon droits courants |
| Signataire de page | Publications sociales selon son mandat ; pas de gestion de boutique par ce seul rôle | Actes sociaux autorisés ; rôle éditorial futur explicite | Aucun droit d'encaissement par le rôle signataire | Pas d'accès automatique aux pièces privées commerciales/rédactionnelles |
| Opérateur de plateforme | Politique et décision d'admission tracées | Admission/suspension dans son périmètre | N'invente ni contrat PSP, ni mandat, ni majorité | Vues de traitement minimales autorisées et audit |
| Rédaction future | Auteur : brouillon ; relecteur : avis ; responsable de publication : validation explicite | Publication réservée au rôle dédié, droits relus à l'exécution | Pas de pouvoir marchand ou institutionnel implicite | Brouillons privés ; public uniquement sur révision publiée |
| Participant aux rencontres | Profil spécialisé volontaire après admission dédiée | Aucune publication sociale automatique | Contact personnel seulement après réciprocité et garde iCom | Aucun annuaire public des profils ou préférences |

La porte générique `createPage` (`minStatus:"verifiee"`) et la réservation des institutions restent intactes. MP02 introduira une politique ciblée pour la préparation et l'admission d'activité, sans élargir globalement les institutions. Un média vérifié ne devient pas « Officiel ». La preuve d'identité actuelle ne prouve pas la majorité.

## 5. Compatibilité des liens et contrats

| Liens existants à conserver | Évolution autorisée |
|---|---|
| `/fil`, `/clips`, `/actus`, `/explorer`, `/page/[handle]` | Entrées sociales conservées ; `/actus` reste les Stories |
| `/boutique/[handle]`, `/boutiques/[handle]` | Même identité et liens historiques, coque spécialisée progressive |
| Sous-routes `catalogue`, `offres/[ref]`, `emplois`, `devis`, `rendez-vous`, `prestation` | Canonicalité et paramètres existants préservés ; pas de redirection qui perd l'intention |
| `/mes-boutiques`, `/mes-commandes`, `/mes-achats`, `/mes-paiements`, `/mes-demandes` | Gestion/suivi existants conservés, y compris après fermeture des nouvelles ventes |
| `/messages/commerce/[threadId]` | Source commerciale existante conservée ; aucun contact personnel créé par cette route |
| `/pages/[handle]` | Projection institutionnelle officielle inchangée |
| `/demo` | Zone de démonstration, cookies et stockage isolés ; ancien sous-domaine non réintroduit |

Toutes les nouvelles destinations seront déclarées dans `apps/antsia_ga/src/lib/routes.ts`. Les nouvelles routes cibles sont `/marketplace`, `/professionnels`, `/rencontres`, `/medias/[handle]` et leurs sous-routes spécialisées. Leur mention dans ce document ne signifie pas qu'elles sont déjà branchées.

Les parseurs V1 actuels refusent les champs étrangers : MP03 ne doit pas simplement ajouter des attributs à un message V1. Réserver une nouvelle version de projection catalogue, ses fixtures jumelles et son admission explicite des deux côtés. Conserver V1 en lecture tant que tous les émetteurs ne sont pas migrés ; une révision étrangère doit être mise en attente/rejetée explicitement, jamais interprétée comme une offre vide. La migration est additive : nouvelle donnée facultative, index construit par étapes, lecture de l'ancienne projection jusqu'à couverture complète, puis bascule tracée. Aucun effacement des anciennes têtes ou changement de prix lors de la migration.

## 6. Bornes de recherche et reprise

### Référence observée

- `listCatalog` : texte de 120 caractères au plus, 1–12 résultats demandés, fenêtre de 24 lignes au plus et 1 Mio au plus. Filtrage après lecture ; une page peut être vide avec un curseur de continuation.
- Aperçu de vitrine : douze dernières têtes, sélection explicitement non exhaustive.
- `discoverServices` : 1–8 boutiques par fenêtre, 1 Mio au plus, au plus trois services par boutique parmi douze dernières têtes. Le contrôle de présence balaie au plus 40 boutiques. Cette sélection n'est pas un moteur global.
- Variantes du DTO producteur : lecture bornée à 151 pour détecter le dépassement ; contrat public à deux axes au plus (`projection.ts`).

### Contrat de recherche cible à matérialiser en MP03

- Index portant réseau de lecture, boutique/offre, type, révision, admission courante et retrait ; prix/stock restent des projections.
- Page de 24 résultats au plus ; texte de 120 caractères au plus ; bornes explicites de lignes/octets, curseur opaque associé aux filtres et à la génération d'index. Aucun balayage exhaustif dans une seule requête.
- Catégorie/attributs/collection/zone/tri normalisés côté serveur ; liste fermée de tris. Facettes calculées sur données admissibles, sans compter les offres cachées ou privées.
- Réindexation par tranches bornées et reprise idempotente ; une génération incomplète ne prend pas la place du catalogue actif. Une continuation vide reste poursuivable jusqu'à `isDone`.
- Retrait, suspension, révocation de liaison et modération se relisent à la projection ; un index en retard ne rend pas une offre retirée. Documenter l'écart de génération, les pages et les mesures de latence sur candidat réel avant d'annoncer un budget atteint.

| Rupture | Reprise attendue |
|---|---|
| Retour social absent/expiré | Repli local sûr vers le fil, aucun droit porté par l'URL |
| Réponse d'engagement perdue | Consultation par intention idempotente, pas de nouvel engagement automatique |
| Message catalogue en double/en retard | Déduplication et révision ; aucun ancien fait qui rajeunit disponibilité ou prix |
| Conflit même révision/contenu divergent | Rejet/journal de conflit ; pas de fusion arbitraire |
| Reconnexion ou changement de compte | Isolation personne/réseau/vendeur ; aucune reprise du panier d'une autre personne |
| Rail PSP fermé après engagement | Nouvelles collectes fermées ; suivi et résolution d'obligations encore accessibles |
| Retrait du média/profil personnel | Suppression immédiate des suggestions/projections ; tâches différées relisant les droits |

## 7. Carte de responsabilités par lot

Le coordinateur ANTSIA est seul intégrateur des registres centraux, routes, schéma, locales et manifestes. Toute délégation possède une liste de fichiers fermée. Les frontières sont réévaluées avant écriture dans l'arbre partagé.

| Lot | Tranche propriétaire | Frontières à préserver |
|---|---|---|
| MP00 | Dossier du chantier, ADR et contrats/capacités de fondation | Aucun changement des portes P12–P16 sans preuves |
| MP01 | Routes/coques ANTSIA et contexte de retour | Providers persistants, session, appels, brouillons ; opt-in pour le moteur partagé |
| MP02 | `shops`, politique ciblée `pages/shopPages`, assistant réel | Institutions, badges et page unique ; pas de globalisation de `createPage` |
| MP03 | PRO.GA intégrations/catalogue et contrats jumeaux ; ANTSIA fédération/index | Versionnement coordonné ; aucune autorité prix/stock ANTSIA |
| MP04 | Découverte/marketplace ANTSIA | Recherche indexée MP03 ; anciennes entrées conservées |
| MP05 | Vitrine, fiches et panier ANTSIA ; préparation PRO.GA | Isolation par vendeur et checkout mono-vendeur |
| MP06 | Services ANTSIA ; devis/agenda/forfait PRO.GA | Intention/reprise P14 et canal commercial ; finance service toujours dédiée |
| MP07 | Configuration marchande et pipeline de paiement PRO.GA ; états ANTSIA | Séparation collecte/allocation/réception/remboursement/reversement |
| MP08 | Un adaptateur financier qualifié à la fois | Pas d'ouverture par logo ou existence d'une API publique |
| MP09 | Professionnels ANTSIA et visibilité choisie | Pas d'import direct des talents DIASPORALE |
| MP10 | Module privé de rencontres et admission adulte | Aucune ouverture avant preuve minimale de majorité validée |
| MP11 | Réciprocité privée, source fermée iCom, blocage/modération | Aucune autorisation par simple suivi social/commercial/professionnel |
| MP12 | Modèle éditorial, rôles et versions ANTSIA | Publications et habilitations sociales existantes conservées |
| MP13 | Projection publique éditoriale et site média | Porte officielle intacte ; pas de brouillon public |
| MP14 | Candidats figés, recettes et activation par capacité | Préserver dernière livraison principale/démo et comparaison des changements voisins |

Hors propriété : `convex/modules/diaspora/`, thème/locales DIASPORALE et changements voisins, notamment événements. PRO.GA est en lecture seule jusqu'à réservation explicite de sa tranche et lecture complète de ses instructions. Ne pas changer les branches partagées, restaurer les fichiers voisins, modifier `.env*`, stager globalement ou exécuter une commande de production à partir de ce document.

## 8. Conditions externes et décisions d'ouverture

| Référence | Condition manquante ou à confirmer | Conséquence avant preuve |
|---|---|---|
| EXT-PAY-01 | Entité collectrice, contrat marketplace, vendeur/bénéficiaire, pays, devise, commission et règlement identifiés | Collecte réelle fermée ; modèle P12 conservé comme contrat technique, pas comme accord PSP |
| EXT-PAY-02 | Airtel Money Gabon : produit réellement activé, sandbox, callbacks, remboursements et versements contractuels | Adaptateur non disponible au marchand tant que sa matrice n'est pas admise |
| EXT-PAY-03 | Moov Money Online : contrat local et documentation technique de l'intégration retenue | Même fermeture par rail ; ne pas inventer API ou signature |
| EXT-PAY-04 | Carte : acquisition pour l'entité gabonaise et XAF, authentification, chargeback, remboursement d'origine | Pas de collecte carte par simple sélection du fournisseur |
| EXT-PAY-05 | PayPal : éligibilité écrite de l'entité/modèle et monnaie supportée ; documentation publique du plan indique Gabon « Send only » et pas XAF | Connecteur conditionnel uniquement ; pas de faux pays/compte vendeur |
| EXT-PAY-06 | Reversement : bénéficiaires admis, conservation/allocation des fonds et mandat du PSP, rapprochement et résolution | Ne pas appeler une distribution technique « séquestre » ou admission financière |
| EXT-DATE-01 | Source de preuve minimale de majorité, autorité, validité/révocation et traitement privé validés | Inscription et découverte personnelles fermées ; aucun âge déduit du badge vérifié |
| EXT-DATA-01 | Finalités, consentements, durées de conservation et opérations de retrait/export/effacement définies pour rencontres et rédaction | Pas d'ouverture publique de données sensibles ou de brouillons |
| EXT-PILOT-01 | Scénarios fonctionnels et droits exécutés sur versions précises, trois formats, pilotes admis | Aucun lot annoncé fonctionnel ou livré sur la seule présence de ses sources |

Les sources officielles de qualification initiale et leurs limites sont consignées dans [06 — Paiements](06_PAIEMENTS.md) et [08 — Inventaire et sources](08_INVENTAIRE_ET_SOURCES.md). Elles devront être confirmées au moment du rail concerné. L'approbation du plan autorise le développement, pas la création de compte marchand, l'envoi de pièces, l'acceptation de contrats ou une transaction réelle.

## 9. Preuves de ce relevé

Lecture des fichiers et inventaire Git uniquement. Aucun codegen, test, typage, lint, build, navigation connectée ou déploiement n'a été exécuté pour ce document. Les valeurs d'activation et registres vides ont été relus dans les sources actuelles. Les contrôles applicatifs du coordinateur seront rattachés au lot exécuté, avec version et résultat propres.
