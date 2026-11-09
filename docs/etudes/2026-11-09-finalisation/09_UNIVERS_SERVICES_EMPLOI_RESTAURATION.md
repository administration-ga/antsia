# Plan 09 — Univers ouverts : services, emploi, réseau professionnel, restauration

> Constaté par lecture du code d'`origin/main` (ANTSIA `26741caa`, DIASPORALE `bead76d`), le 9 novembre 2026. Rien n'a été exécuté.
> Applications de référence : Fiverr, TaskRabbit, Thumbtack (services) ; LinkedIn, Indeed, Welcome to the Jungle (emploi et réseau professionnel) ; Uber Eats, Glovo, fiches de restaurants de Google Maps, menus sur Instagram et WhatsApp Business (restauration). Comparaison faite de mémoire (état des produits à la mi-2026), non revérifiée en ligne.

Vocabulaire employé une fois pour toutes :
- **PRO.GA** : l'application de gestion des professionnels. Elle détient catalogue, prix, agenda, devis, postes et candidatures. ANTSIA n'en montre qu'un **reflet** (une copie publique signée et datée).
- **Contrat signé** : un échange HTTP entre ANTSIA et PRO.GA, signé, versionné et rejouable sans double effet (idempotent).
- **Registre d'activation** : la constante `COMMERCE_ACTIVATION_DECISIONS` du code. Tant qu'une ligne vaut `ready: false`, aucune console ne peut ouvrir la capacité.
- **Recette** : l'essai constaté dans un vrai navigateur ou un vrai téléphone. « Recetté en réel » veut dire avec de vrais comptes et de vrais vendeurs.

## 1. L'intention du propriétaire

- Ces quatre univers forment, avec les boutiques, le pilier **business** : « Une page pour exister, des espaces pour vendre, PRO.GA pour gérer » (ADR-0035, D01 et D02).
- **Services et artisans** : trouver un artisan, une coiffeuse, un répétiteur ; douleur visée : « prix flous, qualité incertaine, aucune trace de l'accord ». Réponse attendue : portfolio, forfaits, devis versionnés, rendez-vous, **avis après prestation**, zones d'intervention (étude sept univers, § 5.5).
- **Emploi et talents** : 17,4 % de chômage, faux recrutements payants. Réponse : offres de pages employeurs mandatées, candidature privée, suivi, **jamais de frais pour candidater**, concours publics Officiels, lien avec travail.ga, alertes (§ 5.3 ; ADR-0024).
- **Réseau professionnel** : volontaire, séparé de la vie personnelle et des rencontres ; aucune donnée exportée vers PRO.GA par défaut (ADR-0034, décision 6 ; `13_PROFESSIONNELS_MP09.md`).
- **Alimentation et restauration** : « le besoin le plus fréquent » ; menu à jour, horaires, plat du jour en Story, commande à retirer ou livrée **payée à la remise**, avis liés à une commande (§ 5.4 ; D04).
- **Déjà décidé** : une marketplace à trois onglets, l'alimentation en univers à part (`decisions/2026-10-23-univers-et-ma-boutique.md`) ; index alimentaire tiré du registre canonique, sans classement inventé (`decisions/2026-10-24-index-alimentaire-canonique.md`).
- **Déjà refusé** : une route ou une tuile pour un univers vide (ADR-0034, D04) ; un faux avis, une fausse note, un faux reflet (mémoire « maquettes fidèles au code ») ; le paiement produit réutilisé pour payer une prestation (`03_SERVICES.md`, § 5) ; la popularité sociale pour classer des candidats (`06_BOUTIQUES_SERVICES_EMPLOI.md`, § 6).
- **Feuille de route** : SU06 (restauration, en ligne le 23/10), SU08 (emploi réuni, à faire, dépend de PA9) ; reste de SU06 : la recette peuplée de l'index, qui attend un vrai catalogue PRO.GA (dossier de reprise, § 10.1).

## 2. Ce qui existe

Chemins relatifs au dépôt ANTSIA. « Fermé (registre) » : `convex/modules/shops/commerceActivation.ts` met `services` et `applications` à `ready: false` ; les consoles ne peuvent donc pas ouvrir ces gestes.

| Capacité | État | Web | Mobile | Preuve |
|---|---|---|---|---|
| **Services** | | | | |
| Espace prestataire (Présentation, Prestations, Réalisations, Disponibilités, À propos) | Présent | oui | non | `apps/antsia_ga/src/components/services/provider-content.tsx`, `app/(membre)/prestataire/[handle]`, `app/(public)/prestataires/[handle]` |
| Catégories de services | Partiel : 6 sous-catégories (numérique, création, domicile, bien-être, évènementiel, conseil) ; aucun métier de l'artisanat (couture, coiffure, électricité, réparation, cours) | oui | non | `packages/social-domain/src/commerce/catalogFacets.ts` |
| Recherche et filtres (catégorie, mode sur place/à distance, modalité, langue, localité, durée) | Présent | oui | recherche texte seule | `convex/modules/shops/catalogValidators.ts` (`serviceDiscoveryFilterArgs`), `apps/antsia_mobile/src/screens/shop-directory-section.tsx` |
| Zone d'intervention | Présent : texte libre de la vitrine et localités du profil de service | oui | oui (texte) | `convex/modules/shops/rules.ts` (`serviceAreaMax`), `components/services/service-profile-details.tsx` |
| Modalités (livrables, inclus, exclus, durée, langues) | Présent | oui | non | `components/services/service-profile-details.tsx` |
| Portfolio de réalisations | Présent (déclaré, médias de la version publiée) | oui | non | `components/services/provider-portfolio.tsx` |
| Disponibilités publiques | Partiel : « Disponibilités sur demande » ; créneaux seulement par offre | oui | non | `i18n/locales/fr/provider.json` (`availability.*`) |
| Demande de devis (besoin, contraintes, date, 3 pièces, conversation commerciale) | Fermé (registre) | oui | renvoi web | `convex/modules/shops/serviceActions.ts` (`requestQuote`), `components/services/service-quote-request-screen.tsx` |
| Devis chiffré : lire, accepter, refuser | Fermé (registre ; refus derrière l'option `ANTSIA_COMMERCE_SERVICE_CONTROL_V2`) | oui | non | `serviceActions.ts` (`quote`, `acceptQuote`, `rejectQuote`), `components/services/quote-rejection.test.tsx` |
| Rendez-vous sur créneaux (14 jours, 60 créneaux, retenue limitée) | Fermé (registre) | oui | non | `components/services/service-slot-picker.tsx`, `serviceActions.ts` (`book`), `packages/social-domain/src/serviceTime.ts` |
| Report et annulation | Fermé (registre) | oui | non | `serviceActions.ts` (`reschedule`, `cancel`) |
| Prestation à tarif fixe | Fermé (registre) | oui | non | `components/services/service-order-screen.tsx`, `serviceActions.ts` (`orderService`) |
| Acompte | Fermé : `deposit: "unavailable"` ; paiements fermés | « aucun acompte » affiché | non | `convex/modules/shops/serviceRules.ts` (`servicePolicyValidator`) |
| « Mes demandes » et états servis par PRO.GA | Présent | oui | non | `components/services/service-requests-screen.tsx`, `convex/modules/shops/services.ts` (`myRequests`) |
| Cloche de suivi (devis reçu, révisé ; rendez-vous retenu, confirmé, refusé, déplacé ; commande acceptée) | Présent | oui | push générique | `packages/social-domain/src/commerce-service-notices.ts`, `convex/modules/federation/commerceServiceNotices.ts` |
| Rappel avant le rendez-vous | Absent (cherché : `reminder`, `rappel du rendez`, `upcoming` hors `myUpcomingBookings`) | — | — | modèle réutilisable : `convex/modules/events/pageEventReminders.ts` |
| Avis après prestation | Absent côté ANTSIA : la section « Avis » dit « pas encore disponibles » ; il existe des avis dans DIASPORALE seulement | — | — | `provider.json` (`reviews.unavailable`), `convex/modules/diaspora/serviceReviews.ts` |
| Délai de réponse du prestataire | Absent (cherché : `responseTime`, `temps de réponse`, `répond en`) | — | — | — |
| Prestataire vérifié | Présent : badge calculé sur la vitrine | oui | oui | `provider-content.tsx` (`storefront.badge`) |
| Gestion par le prestataire | Fermé : renvoi vers PRO.GA derrière une option serveur | panneau | non | `components/services/provider-preparation-panel.tsx`, `convex/modules/shops/merchantPreparation.ts` |
| Politique Services par réseau (console) | Présent, mais ouvrir est refusé par le registre | console | — | `apps/admin_antsia_ga/src/components/console-service-policy.tsx`, `convex/modules/shops/servicePolicy.ts` |
| **Emploi** | | | | |
| Fiche d'offre (contrat, lieu, rémunération déclarée, compétences, échéance, « aucun frais ») | Présent, membre et public | oui | non | `components/jobs/job-public-route.tsx`, `app/(public)/boutiques/[handle]/emplois/[jobRef]` |
| Liste des offres | Présent : section `#emplois` d'Explorer, sans filtre | oui | non | `components/jobs/member-job-directory.tsx`, `convex/modules/shops/jobs.ts` (`discover`) |
| Recherche et filtres d'offres | Absent : `discover` ne prend que la pagination (cherché : `query`, `contractType` en argument, `filtre`) | — | — | `convex/modules/shops/jobs.ts` |
| Page employeur | Partiel : liste membre seulement ; aucune liste publique ; pas de présentation de l'employeur | oui | non | `components/jobs/member-shop-jobs-screen.tsx` |
| Candidature privée avec CV (3 PDF, antivirus, accord versionné) | Fermé (registre) | oui | non | `components/jobs/job-application-form.tsx`, `convex/modules/shops/jobApplications.ts` (`apply`) |
| Pièces réutilisables (« Mes pièces ») | Présent | oui | non | `convex/modules/shops/jobFiles.ts` (`myFiles`, `retireFile`) |
| Mes candidatures, étapes (reçue, en examen, entretien, proposition, retenue, non retenue) | Présent (écran) ; vide tant que fermé | oui | non | `components/jobs/my-applications-screen.tsx`, `i18n/locales/fr/jobs.json` (`candidateState.*`) |
| Retrait d'une candidature et de ses pièces | Présent | oui | non | `jobApplications.ts` (`withdraw`), `jobApplicationTransport.ts` |
| Message du recruteur | Fermé : nature contextuelle `commerceJobApplication` réservée | — | — | `packages/social-domain/src/contextualMessaging.ts` (`CONTEXTUAL_RESERVED_KINDS`) |
| Offres enregistrées | Absent (cherché : `savedJob`, `bookmarkJob`, `offres enregistr`) | — | — | — |
| Alertes d'offres | Absent (cherché : `jobAlert`, `alerte d'offre`, `job_alert`) | — | — | — |
| Signaler une offre frauduleuse | Partiel : cible `commerceJob` prête côté moteur, aucun bouton sur la fiche | — | — | `convex/modules/moderation/tables.ts`, `convex/modules/moderation/cases.ts` (`report`) |
| Modération des offres reflétées | Présent | — | — | `convex/modules/moderation/policy.ts` (`moderatePageContentWrite`, `commerceJob`) |
| Politique Emploi par réseau (console) | Présent : offres ouvrables, candidatures bloquées par le registre | console | — | `apps/admin_antsia_ga/src/components/console-job-policy.tsx` |
| Univers Emploi réuni (`/emploi`, tuile Découvrir) | Absent (SU08) | — | — | `components/discovery/discover-screen.tsx` (aucune tuile emploi) |
| Concours publics, lien travail.ga | Absent (cherché : `concours`, `travail.ga`, `publicCompetition`) | — | — | — |
| **Réseau professionnel** | | | | |
| Profil pro (titre, présentation, 12 compétences, 6 langues, zone, disponibilité, 6 réalisations textuelles, activités liées, visibilité, champs publics) | Présent | oui | non | `packages/social-domain/src/professionals.ts`, `components/professionals/profile-editor.tsx` |
| Annuaire filtré (compétences, langue, zone, disponibilité, type) | Présent | oui | non | `components/professionals/directory-screen.tsx`, `convex/modules/professionals/read.ts` |
| Profil public consenti `/pros/[handle]` | Présent | oui | non | `components/professionals/public-profile-route.tsx` |
| Collaborations (proposer, accepter, refuser, annuler, terminer) | Présent | oui | non | `convex/modules/professionals/collaborations.ts`, `components/professionals/collaborations-screen.tsx` |
| Conversation iCom d'une collaboration acceptée | Présent, sous politique de communication | oui | non | `convex/modules/professionals/conversationContexts.ts` |
| Signaler un profil pro | Présent | oui | non | `components/professionals/profile-fields.tsx` |
| Parcours (expériences, formations) | Absent (cherché : `experience`, `workHistory`, `formation`) | — | — | — |
| Recommandations | Absent (cherché : `recommendation`, `recommandation`, `endorse`) | — | — | — |
| « Ouvert aux opportunités » | Partiel : disponibilité du profil, sans lien avec les offres | oui | non | `professionals.ts` (`PROFESSIONAL_AVAILABILITIES`) |
| **Restauration** | | | | |
| Gabarit d'activité `food` | Présent | oui | — | `packages/social-domain/src/activityConfiguration.ts` |
| Espace `/restauration` (adresses, plats du jour, horaires) | Partiel : adresses filtrées côté écran dans la **première page de 12 vitrines** ; une adresse au-delà n'apparaît ni dans l'univers ni dans la tuile | oui | non | `components/universes/food-universe-screen.tsx` (`useFoodStorefronts`), `lib/marketplace-search.ts` |
| Index par catégorie (alimentation, épicerie, boissons, plats préparés) | Présent, **vide** : aucun catalogue PRO.GA reflété | oui | non | `lib/food-universe-search.ts`, `convex/modules/shops/marketplace.ts` |
| Menu sur la vitrine (« Menu », « Voir le menu », sections par collections PRO.GA) | Présent | oui | catalogue générique | `components/shops/catalog-member-screen.tsx`, `components/shops/catalog-public-route.tsx` |
| Photos des plats | Présent (images du catalogue PRO.GA) | oui | oui | `components/shops/offer-card.tsx` |
| Allergènes et régimes | Absent (cherché : `allerg`, `régime`, `halal`, `végé`) | — | — | `catalogFacets.ts` (aucun attribut) |
| Horaires | Partiel : texte libre de 200 caractères, sans « ouvert maintenant » | oui | non | `convex/modules/shops/rules.ts` (`hoursMax`) |
| Fermeture exceptionnelle | Absent (cherché : `exceptionalClosure`, `fermeture exceptionnelle`, `closedToday`) | — | — | — |
| Plat du jour (vitrine membre et publique, univers, Story) | Présent | oui | Story | `packages/social-domain/src/dailySpecial.ts`, `components/shops/daily-special-panel.tsx`, `components/shops/public-daily-special.tsx`, `convex/modules/stories/dailySpecialSource.ts`, `apps/antsia_mobile/src/screens/stories-section.tsx` |
| « Commander » → panier → préparation, réglé à la remise | Présent (parcours du plan 08) | oui | renvoi web | `components/shops/offer-post-formula.tsx`, `app/(membre)/boutique/[handle]/preparer/[offerRef]` |
| Retrait ou livraison par le vendeur, localités desservies et frais | Présent (plan 08) | oui | non | `convex/modules/shops/storefrontTerms.ts`, `convex/modules/shops/checkoutRules.ts` |
| Réservation de table | Absent (cherché : `tableReservation`, `réservation de table`, `reserveTable`) | — | — | — |
| **Découvrir** | | | | |
| Tuiles Services et Alimentation, présentes seulement avec des données réelles | Présent | oui | onglet Services | `components/discovery/discover-screen.tsx`, `apps/antsia_mobile/src/screens/explore-screen.tsx` |

Décompte : **Présent 30 · Partiel 7 · Absent 13 · Fermé 9** (59 lignes, intertitres exclus).

### Ce qui est écrit mais jamais recetté en réel

| Sujet | Dernier constat | Source |
|---|---|---|
| Devis, rendez-vous, prestation fixe, refus de devis | Harnais isolé seulement ; aucun échange réel avec PRO.GA | `11_SERVICES_MP06.md` ; `P14_SERVICES.md` |
| Candidature, suivi, retrait, pièces | Aucun échange réel ; décision de conservation ouverte | ADR-0024 ; `P15_EMPLOI.md` |
| Profil pro publié, collaboration, conversation | Écrans vides et éditeur contrôlés en ligne le 25/10 ; cas positifs par harnais | vault `recette-espaces-specialises-2026-10-25.md` |
| Index alimentaire peuplé | Parcours vides recettés ; cartes peuplées sur données d'essai seulement | vault `su06-food-index-2026-10-24.md` |
| Plat du jour, horaires, « Commander » | En ligne sur la démo le 23/10, avec l'épicerie de démonstration ; aucun vrai restaurant | `EXECUTION.md` (SU06, second volet) |
| Application mobile pour ces univers | Lecture des services et Story du plat du jour seulement | `docs/recette/mobile-business-ios7-2026-10-24/` |

## 3. Comparaison avec les applications de référence

**Services**

| Capacité | Fiverr | TaskRabbit | Thumbtack | ANTSIA | Verdict |
|---|---|---|---|---|---|
| Forfaits à prix fixe | oui (paliers) | tarif horaire | non | prestation fixe (fermée) | Déjà fait, à ouvrir (UM-01) |
| Demande de devis | offre sur mesure | non | oui, plusieurs pros | un pro, versionné (fermé) | Déjà fait, à ouvrir (UM-01) |
| Créneau réservé | non | oui | selon le pro | oui (fermé) | Déjà fait, à ouvrir (UM-01) |
| Rappel avant intervention | oui (notifications) | oui | oui | non | À faire (UM-06) |
| Avis après prestation | oui | oui | oui | non | À adapter : lié à un engagement honoré (UM-07) |
| Délai de réponse affiché | oui | non affirmé | oui | non | À adapter : calcul réel, seuil (UM-12) |
| Métiers du quotidien (bricolage, ménage, déménagement) | partiel | oui | oui | 6 catégories génériques | À faire : taxonomie des métiers (UM-08) |
| Vérification du prestataire | niveaux de vendeur | contrôle d'antécédents (selon pays) | contrôle (selon pays) | badge calculé gratuit | Déjà fait |
| Paiement retenu jusqu'à la fin | oui | oui | non | fermé | Écarté tant qu'aucun prestataire de paiement (MP06d) |

**Emploi et réseau professionnel**

| Capacité | LinkedIn | Indeed | Welcome to the Jungle | ANTSIA | Verdict |
|---|---|---|---|---|---|
| Recherche et filtres | oui | oui | oui | aucune | À faire (UM-04) |
| Alertes et offres enregistrées | oui | oui | oui | non | À faire (UM-05) |
| Candidature avec CV | oui | oui | oui | oui, privée (fermée) | Déjà fait, à ouvrir (UM-02) |
| Suivi des étapes | partiel | partiel | partiel | états autorisés de PRO.GA | Déjà fait, plus précis que les références |
| Message du recruteur | oui | oui | oui | réservé | À faire après UM-02 (UM-10) |
| Page employeur riche | oui | oui | oui (culture, médias) | liste d'offres | À adapter : page publique (UM-11) |
| Signaler une offre | oui | oui | non affirmé | moteur prêt, pas de bouton | À faire, bloquant (UM-03) |
| Parcours et compétences | oui | CV | oui | compétences seules | À faire (UM-13) |
| Recommandations | oui | non | non | non | À adapter : après collaboration acceptée (UM-13) |
| « Ouvert aux opportunités » | oui | non affirmé | non affirmé | disponibilité du profil | À adapter (UM-13) |
| Classement par popularité sociale | oui (signaux) | — | — | interdit | Écarté (décision du 18/10) |

**Restauration**

| Capacité | Uber Eats / Glovo | Google Maps (fiche) | Instagram / WhatsApp Business | ANTSIA | Verdict |
|---|---|---|---|---|---|
| Menu par sections, photos | oui | menu, photos | catalogue, publications | collections PRO.GA, photos | Déjà fait |
| Horaires et « ouvert maintenant » | oui | oui | horaires (WhatsApp) | texte libre | À faire (UM-09) |
| Horaires exceptionnels | fermé temporairement | oui | message d'absence | non | À faire (UM-09) |
| Plat du jour en Story | non | non | oui (Stories, statuts) | oui | Déjà fait, différenciant |
| À emporter ou livré, zone et frais | oui | liens de commande | à la main | oui, réglé à la remise | Déjà fait (plan 08) |
| Suivi de commande | temps réel | non | à la main | états PRO.GA | Déjà fait (plan 08) ; temps réel écarté |
| Avis | oui | oui | non | non | À adapter : lié à une commande remise (UM-14) |
| Allergènes | non affirmé | non | non | non | À faire, attribut PRO.GA (UM-15) |
| Réservation de table | non | via partenaires | à la main | non | Reporté (UM-17, après SU05) |

## 4. Ce qui manque

### 4.1 Bloquant avant l'ouverture au public
1. **Les gestes sont fermés dans le code** : devis, rendez-vous, prestation fixe et candidature attendent la recette croisée avec PRO.GA et une décision documentée (registre d'activation).
2. **Aucune durée de conservation** pour les candidatures (`COMMERCE_JOBS_RETENTION` à `null`) ni pour les décisions durables des services côté PRO.GA (ADR-0024, § 6 ; `P14_SERVICES.md`).
3. **Signaler une offre d'emploi** est impossible depuis l'écran, alors que les faux recrutements sont la première douleur de l'univers et que l'ordonnance 0011 impose les signalements (art. 24).
4. **Un univers sans vrai catalogue** : le producteur PRO.GA V2 n'est pas déployé ; la recette peuplée de SU06 et de la marketplace des services l'attend (dossier de reprise, § 10.1).

### 4.2 Attendu par les utilisateurs
- Recherche et filtres des offres d'emploi ; offres enregistrées ; alertes.
- Rappel avant un rendez-vous.
- Avis après une prestation réellement honorée, puis après une commande remise.
- Horaires structurés, « ouvert maintenant », fermeture exceptionnelle.
- Adresses de l'univers lues côté serveur, sans limite de 12 vitrines.
- Métiers de l'artisanat dans la taxonomie des services.
- Message du recruteur dans iCom.
- Écrans mobiles : offres, « Mes demandes », « Mes candidatures », univers restauration.

### 4.3 Différenciant pour ANTSIA
- **Confiance** : employeur = page + mandat PRO.GA ; « aucun frais pour candidater » affiché ; avis seulement après un engagement prouvé par PRO.GA (`honored`, `completed`), jamais un avis libre.
- **Faible débit** : alertes regroupées une fois par jour ; plat du jour en Story légère ; horaires lisibles hors ligne.
- **Souveraineté et administration** : concours publics Officiels reflétés de l'administration, passerelle vers travail.ga (plan 11).
- **Réactivité mesurée sur données réelles** : part des demandes de devis qui reçoivent une réponse, sans chiffre inventé (étude, § 16).

### 4.4 Écarté ou reporté, et pourquoi
| Sujet | Décision | Raison |
|---|---|---|
| Acompte, paiement des prestations (MP06d) | Reporté (P3) | Aucun prestataire de paiement contracté |
| Suivi de livraison en temps réel | Écarté | Livraison par le vendeur ou un partenaire, sans flotte ni géolocalisation |
| Réservation de table | Reporté (P3) | Dépend du module de location de ressources de PRO.GA (SU05, plan 10) |
| Classement des candidats par signaux sociaux | Écarté | Décision du 18/10 (`06_BOUTIQUES_SERVICES_EMPLOI.md`) |
| Mise en avant payée d'offres d'emploi | Reporté | Modèle économique D10 non décidé ; toujours étiquetée si elle vient |
| Tuile « Emploi public » vers travail.ga sans contrat | Écarté | Aucune route vide (ADR-0034) ; attend la fédération (plan 11) |

## 5. Lots d'implémentation

### UM-01 — Ouvrir les services après recette croisée P14 · priorité P0 · taille M · session S1
- **Pour l'utilisateur** : demander un devis, réserver un créneau, commander une prestation fixe, déplacer ou annuler, accepter ou refuser un devis.
- **Backend** : aucune nouvelle table. Recette croisée avec un PRO.GA de test (scopes de `P14_SERVICES.md`, prestations d'agenda publiées) ; décision écrite (nouvel ADR) puis `services.ready` à `true` dans `convex/modules/shops/commerceActivation.ts` ; durées de conservation des demandes closes revues (`SERVICE_CLOSED_RETENTION_MS` dans `serviceRules.ts`) ; décision sur l'option `ANTSIA_COMMERCE_SERVICE_CONTROL_V2` (refus de devis).
- **Web** : relire les écrans existants (`service-quote-request-screen.tsx`, `service-booking-screen.tsx`, `service-order-screen.tsx`, `service-requests-screen.tsx`) aux trois largeurs ; aucun nouvel écran.
- **Mobile** : renvoi web conservé ; écrans natifs dans UM-16.
- **Données personnelles** : déjà dans l'inventaire (`commerceServiceRequests`, `dataInventory.ts`) ; vérifier l'effacement des commandes privées et de `commerceServiceFollowupNotices`.
- **Tests et cliquets** : `services.test.ts`, `serviceQuoteRejection.test.ts`, `serviceLifecycleContinuation.test.ts` verts ; test du registre ouvert ; `operator-audit` sur `setPolicy`.
- **Critères d'acceptation** : deux clients sur un créneau → une seule confirmation ; devis révisé → nouvelle acceptation exigée ; réponse perdue → aucune double commande ; fermer la politique ne coupe pas le suivi ; aucun bouton de paiement.
- **Dépend de** : PRO.GA déployé avec le contrat SERVICE-CONTROL ; plan 08 (CM, liaison PRO.GA et catalogue reflété).
- **Porte** : décision du propriétaire, configuration PRO.GA, durée de conservation, publication.

### UM-02 — Ouvrir les candidatures après recette croisée P15 · priorité P0 · taille M · session S1
- **Pour l'utilisateur** : candidater avec son nom, sa motivation et jusqu'à trois PDF, suivre et retirer.
- **Backend** : recette croisée (émetteur autorisant `PRO-COMMERCE-JOBS-V1`, scope `commerce.application.submit`, liaisons `publish_jobs` et `receive_applications`) ; valeurs de `COMMERCE_JOBS_RETENTION` (`packages/social-domain/src/commerce-jobs.ts`) et purge bornée par cron ; `applications.ready` à `true` après ADR.
- **Web** : écrans existants ; ajouter sur la fiche une mention lisible « Un recruteur ne vous demandera jamais d'argent » si elle manque (clé `details.noFees` existe déjà).
- **Mobile** : après le web (UM-16).
- **Données personnelles** : nom civil, motivation, pièces déjà exportées et effacées ; purge temporelle à ajouter, testée.
- **Tests et cliquets** : `jobApplications.test.ts`, `jobApplicationLifecycleContinuation.test.ts` ; `crons-contract` si un cron est ajouté ; `no-unbounded-collect`.
- **Critères d'acceptation** : candidature reçue dans PRO.GA ; état « En examen » relu ; retrait efface les copies des deux côtés ou trace `remoteUnconfirmed` ; pièce en quarantaine refusée.
- **Dépend de** : PRO.GA déployé (JOBS-V1 et APPLICATION-CONTROL-V1).
- **Porte** : avis du juriste sur la conservation, décision du propriétaire, publication.

### UM-03 — Signaler une offre d'emploi · priorité P0 · taille S · session S1
- **Pour l'utilisateur** : « Signaler cette offre » sur la fiche (frais demandés, fausse entreprise, offre trompeuse).
- **Backend** : aucune table ; `moderation.cases.report` accepte déjà la cible `commerceJob`. Ajouter, si absents, les motifs `job_fee_requested` et `job_impersonation` au registre des motifs, avec leur délai (art. 24, 72 h).
- **Web** : bouton et dialogue sur `job-public-route.tsx` (membre) ; invitation à se connecter sur la version publique ; réutiliser le dialogue de signalement du plan 12 ; textes fr et en.
- **Mobile** : après le web.
- **Données personnelles** : signalement déjà couvert par l'inventaire `reports`.
- **Tests et cliquets** : test de rendu du bouton ; test moteur « signaler sa propre offre » refusé ; `i18n-locales`.
- **Critères d'acceptation** : signalement créé avec accusé de réception ; second signalement idempotent ; aucun bouton pour l'auteur.
- **Dépend de** : plan 12 (MC, motifs et file) ; signaler une vitrine ou une prestation relève du plan 08.
- **Porte** : aucune.

### UM-04 — Recherche et filtres des offres d'emploi · priorité P1 · taille M · session S1
- **Pour l'utilisateur** : chercher « comptable Port-Gentil », filtrer par contrat, lieu, compétence, échéance proche.
- **Backend** : champ `searchText` et index de recherche sur `commerceJobHeads` (contrat, réseau, état en filtres) ; arguments fermés `query`, `contractType[]`, `location`, `skill` dans `jobs.discover` ; pagination conservée après filtrage, fenêtre vide signalée.
- **Web** : barre de recherche et pastilles dans `member-job-directory.tsx`, paramètres d'URL déclarés dans `lib/routes.ts`.
- **Mobile** : UM-16.
- **Données personnelles** : aucune.
- **Tests et cliquets** : tests moteur des filtres (OU dans un filtre, ET entre filtres) ; `no-unbounded-collect`.
- **Critères d'acceptation** : une offre ancienne reste trouvable ; une offre close quitte les résultats ; état vide traduit.
- **Dépend de** : schéma (S1).
- **Porte** : aucune.

### SU08 — Emploi et talents réunis · priorité P1 · taille M · session S1
- **Pour l'utilisateur** : un espace `/emploi` : offres (avec UM-04), pros disponibles, « Mes candidatures », lien vers son profil pro.
- **Backend** : rien de neuf ; disponibilité calculée comme `jobs.discoverAvailability`.
- **Web** : route `emploi` dans `lib/routes.ts`, écran dans la coque membre, tuile « Emploi et talents » dans le pilier Business de `discover-screen.tsx`, **seulement** quand des offres réelles existent ; Explorer `#emplois` renvoie vers `/emploi`.
- **Mobile** : UM-16.
- **Données personnelles** : aucune.
- **Tests et cliquets** : test de la tuile absente sans offre ; `member-screens-full-width`.
- **Critères d'acceptation** : aucune tuile ni route visible sans offre ; retour à ANTSIA conservé.
- **Dépend de** : UM-04.
- **Porte** : aucune ; les concours publics restent dans UM-18.

### UM-05 — Offres enregistrées et alertes d'emploi · priorité P1 · taille M · session S1
- **Pour l'utilisateur** : enregistrer une offre ; créer une alerte (mots, contrat, lieu) prévenue une fois par jour.
- **Backend** : tables `commerceJobSaves` et `commerceJobAlerts` (`networkId`, `personId`, critères bornés, au plus un nombre décidé d'alertes) ; cron quotidien qui compare les offres nouvelles ; une notification sans titre d'offre (« De nouvelles offres correspondent à votre alerte »), lien vers les résultats ; débit `rate-limited-writes`.
- **Web** : bouton « Enregistrer » sur la fiche et la carte ; onglet « Enregistrées » et gestion des alertes dans `/emploi`.
- **Mobile** : UM-16.
- **Données personnelles** : export et effacement des deux tables ; une offre close disparaît des enregistrées.
- **Tests et cliquets** : `crons-contract`, `notification-payload-content`, `notifications-writer`, `network-scoped-functions`.
- **Critères d'acceptation** : aucune alerte ne cite une offre close ou retirée ; aucune notification si rien de neuf.
- **Dépend de** : UM-04, SU08 ; plan 06 (CN, catégories de notification).
- **Porte** : décision 4 (fréquence).

### UM-06 — Rappel avant un rendez-vous · priorité P1 · taille S · session S1
- **Pour l'utilisateur** : un rappel dans la cloche et en push avant un rendez-vous confirmé.
- **Backend** : planification à l'admission d'un rendez-vous `confirmed` (snapshot `booking`), annulée au report ou à l'annulation ; nouveau type de notification sans nom de prestataire ; modèle `convex/modules/events/pageEventReminders.ts`.
- **Web** : réglage dans les préférences de notification (plan 06).
- **Mobile** : push reçu par l'application existante.
- **Données personnelles** : aucune donnée nouvelle ; la tâche planifiée tombe à l'effacement.
- **Tests et cliquets** : `notification-payload-content`, `crons-contract` si cron ; test du rappel annulé au report.
- **Critères d'acceptation** : pas de rappel pour un rendez-vous annulé, déplacé ou passé.
- **Dépend de** : UM-01 ; plan 06.
- **Porte** : décision 3 (moment du rappel).

### UM-07 — Avis vérifiés après une prestation · priorité P1 · taille L · session S1
- **Pour l'utilisateur** : après un rendez-vous honoré ou une commande de service terminée, laisser un avis ; le prestataire répond ; tout le monde peut signaler.
- **Backend** : tables `commerceServiceReviews` et `commerceServiceReviewReplies` (`networkId`, `shopId`, `requestRowId` unique, note et texte bornés, révision) ; éligibilité : demande possédée dont l'état PRO.GA relu est `honored` ou `completed` ; une seule par engagement ; nouvelles cibles de modération `commerceServiceReview` et `commerceServiceReviewReply` (les noms `serviceReview*` appartiennent à DIASPORALE) ; règles pures dans `packages/social-domain/src/` (pas d'import de `@diasporale/domain`, cliquet `no-cross-product-imports`) ; projection publique **à part** de la vitrine (projections strictes) ; moyenne seulement à partir d'un seuil décidé.
- **Web** : section « Avis » de `provider-content.tsx` remplie ; invitation dans « Mes demandes » ; formulaire React Hook Form + Zod.
- **Mobile** : lecture après le web.
- **Données personnelles** : export et effacement (texte anonymisé « profil effacé » s'il reste une réponse) ; inventaire `dataPolicies.ts`.
- **Tests et cliquets** : éligibilité (refus sans engagement honoré), double avis, modération, effacement ; `public-communication`, `rate-limited-writes`.
- **Critères d'acceptation** : aucun avis sans engagement prouvé ; aucune note affichée sous le seuil ; le prestataire ne peut ni supprimer ni masquer un avis.
- **Dépend de** : UM-01 ; plan 12 (modération).
- **Porte** : décision 2 (forme et seuil).

### UM-08 — Taxonomie des métiers de services · priorité P1 · taille M · session S1
- **Pour l'utilisateur** : trouver une couturière, un électricien, un répétiteur, un déménageur par catégorie.
- **Backend** : nouvelles clés `services.*` dans `packages/social-domain/src/commerce/catalogFacets.ts`, fichier jumeau côté PRO.GA à l'octet ; reconstruction de l'index de découverte.
- **Web** : libellés fr et en (`shops.json`, `catalog.facets.categories.*`) ; pastilles de la marketplace Services.
- **Mobile** : filtres repris dans UM-16.
- **Données personnelles** : aucune.
- **Tests et cliquets** : test de parité du registre avec PRO.GA ; `i18n-locales`.
- **Critères d'acceptation** : une offre classée dans une clé enfant se trouve par son parent ; aucune offre reclassée d'après son titre.
- **Dépend de** : contrat catalogue V2 (plan 08) ; PRO.GA.
- **Porte** : décision 5 (nomenclature), version de contrat négociée avec PRO.GA.

### UM-09 — Horaires structurés et fermetures exceptionnelles · priorité P1 · taille M · session S1
- **Pour l'utilisateur** : voir « Ouvert, ferme à 20 h » ou « Fermé aujourd'hui », et les jours fériés annoncés.
- **Backend** : champs facultatifs `openingHours` (jours, plages, fuseau `Africa/Libreville`) et `closures` (dates, motif court) sur `shops` ; règle pure `isOpenAt` dans `social-domain` ; le texte libre `hours` reste pour l'existant ; modération de la présentation inchangée.
- **Web** : éditeur dans l'étape « Ma présentation » (`shop-presentation-form.tsx`) ; pastille d'état dans `member-storefront-screen.tsx`, la vitrine publique et `food-universe-screen.tsx`, recalculée au passage des heures comme `use-daily-special-clock.ts`.
- **Mobile** : `shop-screen.tsx` dans UM-16.
- **Données personnelles** : aucune (donnée d'activité).
- **Tests et cliquets** : bornes de minuit, plages qui chevauchent minuit, fermeture prioritaire ; projection publique séparée.
- **Critères d'acceptation** : aucune pastille si aucun horaire structuré ; texte libre toujours lu.
- **Dépend de** : plan 08 (éditeur de vitrine, fichiers communs : coordonner).
- **Porte** : aucune.

### UM-19 — Adresses de l'univers alimentaire lues côté serveur · priorité P1 · taille S · session S1
- **Pour l'utilisateur** : toutes les adresses `food` apparaissent, pas seulement celles de la première page.
- **Backend** : filtre `template` dans `shops.marketplaceShops.search` (champ dénormalisé et index sur la vitrine, ou filtre dans l'index existant) ; disponibilité dédiée pour la tuile Découvrir.
- **Web** : `useFoodStorefronts` passe au filtre serveur et pagine ; `discover-screen.tsx` lit la disponibilité.
- **Mobile** : aucune.
- **Données personnelles** : aucune.
- **Tests et cliquets** : test avec 13 vitrines dont la treizième `food` ; `no-unbounded-collect`.
- **Critères d'acceptation** : la treizième adresse s'affiche ; la tuile reste absente sans adresse.
- **Dépend de** : schéma (S1).
- **Porte** : aucune.

### SU06 (reste) — Recette peuplée de l'univers alimentaire · priorité P1 · taille S · session S1
- **Pour l'utilisateur** : de vrais plats classés dans les quatre catégories.
- **Backend** : aucun code ; recevoir un catalogue PRO-COMMERCE-PUBLIC-V2 autorisé, reçu `applied` vérifié.
- **Web** : recette de `/restauration` peuplée aux trois largeurs, clair et sombre.
- **Mobile** : aucune.
- **Données personnelles** : aucune.
- **Tests et cliquets** : aucun nouveau.
- **Critères d'acceptation** : catégories peuplées, pagination, retour navigateur ; aucune offre fictive injectée.
- **Dépend de** : PRO.GA déployé et un vrai restaurant consentant ; plan 08.
- **Porte** : décision du propriétaire, vendeur réel.

### UM-10 — Message du recruteur · priorité P2 · taille L · session S1
- **Pour l'utilisateur** : le recruteur écrit au candidat dans iCom, sur cette candidature seulement.
- **Backend** : ouvrir la nature contextuelle `commerceJobApplication` (`contextualMessaging.ts`, `registry.ts`) : le recruteur parle d'abord, le candidat répond, fermeture au retrait ou à la clôture ; transport des messages du recruteur depuis PRO.GA par un nouveau contrat signé.
- **Web** : lien « Échanger avec le recruteur » dans `my-application-screen.tsx`.
- **Mobile** : via iCom (plan 01).
- **Données personnelles** : messages dans l'export et l'effacement de la messagerie contextuelle.
- **Tests et cliquets** : `contextual-registry`, `contextual-hooks`.
- **Critères d'acceptation** : aucun message possible sans candidature transmise ; le recruteur ne voit aucun profil privé.
- **Dépend de** : UM-02 ; plan 01 (IC) ; contrat PRO.GA.
- **Porte** : contrat PRO.GA, décision 6.

### UM-11 — Page employeur publique · priorité P2 · taille S · session S1
- **Pour l'utilisateur** : une liste publique des offres d'une activité, lisible sans compte et partageable.
- **Backend** : `public.jobs.listForShop` existe ; vérifier la projection.
- **Web** : route `(public)/boutiques/[handle]/emplois`, bloc « Emplois » sur la vitrine publique et l'espace prestataire quand la capacité `jobs` est active.
- **Mobile** : aucune.
- **Données personnelles** : aucune.
- **Tests et cliquets** : rendu serveur, `no-hardcoded-urls`.
- **Critères d'acceptation** : aucune offre close listée ; une page sans offre n'affiche pas le bloc.
- **Dépend de** : aucun.
- **Porte** : aucune.

### UM-12 — Délai de réponse des prestataires · priorité P2 · taille S · session S1
- **Pour l'utilisateur** : « Répond en général sous un jour », seulement quand assez de demandes réelles existent.
- **Backend** : calcul périodique entre la demande de devis et la première notification `commerce_service_quote_received` ; agrégat par vitrine, sans donnée personnelle ; seuil minimal décidé.
- **Web** : mention sur l'espace prestataire.
- **Mobile** : aucune.
- **Données personnelles** : agrégat anonyme.
- **Tests et cliquets** : aucun affichage sous le seuil.
- **Critères d'acceptation** : aucun chiffre sans données réelles.
- **Dépend de** : UM-01.
- **Porte** : décision 8.

### UM-13 — Parcours, recommandations et « ouvert aux opportunités » · priorité P2 · taille M · session S1
- **Pour l'utilisateur** : décrire ses expériences et formations ; recevoir une recommandation d'une personne avec qui on a collaboré ; signaler qu'on cherche un emploi.
- **Backend** : champ borné `experiences` (intitulé, structure en texte, années) sur `professionalProfiles` ; table `professionalRecommendations` liée à une collaboration `accepted` ; modération ; drapeau `openToJobs` filtrable dans l'annuaire.
- **Web** : `profile-editor.tsx`, `profile-screen.tsx`, `directory-screen.tsx`.
- **Mobile** : après le web.
- **Données personnelles** : export, effacement, retrait par la personne recommandée.
- **Tests et cliquets** : recommandation refusée sans collaboration acceptée ; champs publics consentis.
- **Critères d'acceptation** : rien n'est public sans accord ; aucune entreprise « vérifiée » déduite d'un texte.
- **Dépend de** : aucun.
- **Porte** : aucune.

### UM-14 — Avis liés à une commande de restauration · priorité P2 · taille M · session S1
- **Pour l'utilisateur** : noter une commande remise.
- **Backend** : même modèle qu'UM-07, éligibilité sur une commande `delivered` ou `completed` relue (plan 08).
- **Web** : invitation dans « Mes achats », section « Avis » sur la vitrine `food`.
- **Mobile** : après le web.
- **Données personnelles** : comme UM-07.
- **Tests et cliquets** : comme UM-07.
- **Critères d'acceptation** : aucun avis sans commande remise.
- **Dépend de** : UM-07 ; plan 08 (états de commande).
- **Porte** : décision 2.

### UM-15 — Allergènes et régimes au menu · priorité P2 · taille M · session S1
- **Pour l'utilisateur** : voir « contient arachides », « sans porc » sur un plat.
- **Backend** : attribut typé allowlisté dans `catalogFacets.ts` et le contrat catalogue V2, jumeau PRO.GA.
- **Web** : mention sur la fiche et la carte ; filtre dans l'univers.
- **Mobile** : `offer-screen.tsx`.
- **Données personnelles** : aucune.
- **Tests et cliquets** : parité du registre ; attribut absent = rien d'affiché (jamais « sans allergène » par défaut).
- **Critères d'acceptation** : la mention vient toujours de PRO.GA.
- **Dépend de** : plan 08 ; PRO.GA.
- **Porte** : contrat PRO.GA.

### UM-16 — Univers ouverts dans l'application mobile · priorité P1 · taille L · session S3
- **Pour l'utilisateur** : offres d'emploi et recherche, « Mes demandes », « Mes candidatures », univers restauration, espace prestataire en lecture.
- **Backend** : aucun (mêmes fonctions).
- **Web** : aucun.
- **Mobile** : écrans dans `apps/antsia_mobile/src/screens/` rangés sous Découvrir (aucune nouvelle icône) ; gestes engageants renvoyés au web tant que la parité n'est pas recettée.
- **Données personnelles** : aucune nouvelle.
- **Tests et cliquets** : tests de rendu ; textes fr et en.
- **Critères d'acceptation** : cinq destinations inchangées ; états vide, chargement et erreur.
- **Dépend de** : UM-04, SU08, UM-19 ; plan 14.
- **Porte** : publication TestFlight.

### UM-17 — Réservation de table · priorité P3 · taille L · session S1
- **Pour l'utilisateur** : réserver une table pour un nombre de couverts.
- **Backend** : réutiliser le module de ressources et créneaux de PRO.GA (SU05).
- **Web**, **Mobile**, **Données personnelles**, **Tests** : à préciser à l'ouverture de SU05.
- **Critères d'acceptation** : deux clients ne réservent pas la même table.
- **Dépend de** : SU05 (plan 10).
- **Porte** : module PRO.GA.

### UM-18 — Concours publics et passerelle travail.ga · priorité P3 · taille M · session S1
- **Pour l'utilisateur** : voir les concours de la fonction publique publiés par les pages Officielles, et continuer vers travail.ga.
- **Backend** : type de publication officielle reflétée (plan 11) ; aucune lecture de base externe.
- **Web** : rubrique « Concours » dans `/emploi`.
- **Mobile** : après le web.
- **Données personnelles** : aucune.
- **Tests et cliquets** : étanchéité.
- **Critères d'acceptation** : aucun concours sans source Officielle signée.
- **Dépend de** : PA9 en recette, plan 11, SU08.
- **Porte** : contrat avec l'administration.

### MP06d — Acompte et paiement des prestations · priorité P3 · taille L · session S1
- Lot existant de l'étude marketplace, conditionnel. **Porte** : prestataire de paiement contracté (plan 08).

## 6. Ordre recommandé et dépendances

| Vague | Lots | Pourquoi dans cet ordre |
|---|---|---|
| 1 | UM-03, UM-19, UM-04 | Sans porte externe ; corrigent un risque (fraude) et un défaut (adresses invisibles) ; préparent l'univers Emploi |
| 2 | SU08, UM-09, UM-11 | Espace Emploi et vitrines plus fiables, toujours sans PRO.GA réel |
| 3 | UM-01, UM-02, SU06 (reste) | Attendent PRO.GA déployé, la recette croisée et les durées de conservation |
| 4 | UM-05, UM-06, UM-07, UM-08 | S'appuient sur des gestes ouverts et des engagements réels |
| 5 | UM-16 (S3, en parallèle dès la vague 2), UM-10, UM-12, UM-13, UM-14, UM-15 | Parité mobile, puis compléments |
| Sous condition | UM-17, UM-18, MP06d | SU05, fédération de l'administration, prestataire de paiement |

Fichiers partagés demandés à S1 : `convex/schema.ts` (UM-04, UM-05, UM-07, UM-09, UM-13, UM-19), `convex/crons.ts` (UM-02, UM-05, UM-12). Aucune nouvelle dépendance ; aucun changement de `deploy/catalog.json` prévu.

## 7. Décisions à prendre par le propriétaire

1. **Ouvrir services et candidatures.** Recommandation : ouvrir seulement après une recette croisée avec un PRO.GA de test et un ADR, réseau par réseau, en commençant par le pilote du Grand Libreville.
2. **Forme des avis.** Recommandation : note de 1 à 5 avec texte obligatoire, moyenne affichée seulement au-delà d'un seuil que vous fixez ; sinon, la liste des avis seule. Raison : éviter une moyenne trompeuse sur deux avis.
3. **Rappel de rendez-vous.** Recommandation : la veille en fin d'après-midi, heure de Libreville, une seule fois. Raison : coût des données et pas de sollicitation la nuit.
4. **Fréquence des alertes d'emploi.** Recommandation : un résumé quotidien. Raison : faible débit et sobriété des notifications.
5. **Taxonomie des métiers.** Recommandation : reprendre comme premier niveau les 12 secteurs de la nomenclature de l'artisanat (décret 0242/2022, cité par l'étude, § 5.5). Raison : vocabulaire connu des artisans et de l'administration.
6. **Message du recruteur.** Recommandation : seulement après UM-02, le recruteur parlant le premier. Raison : protéger le candidat des sollicitations.
7. **Conservation des candidatures.** Recommandation : demander au juriste une durée après décision et après retrait. Raison : ADR-0024 refuse toute durée inventée.
8. **Délai de réponse affiché.** Recommandation : l'afficher, à partir d'un nombre minimal de demandes que vous fixez. Raison : signal utile, jamais un chiffre sans données.

## 8. Risques et points d'attention

- **PRO.GA n'émet pas encore de catalogue réel** : sans lui, services, emploi et restauration restent vides. Ne jamais injecter de faux reflet pour « remplir ».
- **Le registre d'activation est du code** : l'ouvrir exige une publication du backend, donc l'accord écrit du propriétaire.
- **Faux recruteurs** : UM-03 avant toute promotion de l'univers Emploi ; rappeler « aucun frais » sur chaque fiche.
- **Fichiers communs avec le plan 08** : `shops/tables.ts`, éditeur de vitrine, vitrines membre et publique. Réserver les fichiers avant UM-09 et UM-19.
- **Collision de noms** : `serviceReviews` et la cible `serviceReview` appartiennent à DIASPORALE ; les avis ANTSIA prennent le préfixe `commerceService*`.
- **Projections publiques strictes** : un champ ajouté à une projection existante casse les fronts en ligne ; publier les avis et les horaires structurés dans des projections à part (CLAUDE.md, pièges).
- **Plat du jour de démonstration** : il expire chaque soir à minuit, heure de Libreville ; le reposer avant toute démonstration.
- **Mobile** : ne pas annoncer de parité tant qu'UM-16 n'est pas recetté sur un vrai téléphone.

## 9. Prompts d'implémentation

### Prompt UM-03
```text
Tu exécutes le lot UM-03 du plan 09 d'ANTSIA. Écris-moi toujours en français. Utilise Opus pour tout le code, jamais de sous-agent Sonnet.
Lis : CLAUDE.md ; docs/etudes/2026-11-09-finalisation/00_PLAN_DIRECTEUR.md § 1, 2, 7 ; le plan 09 § 1, 2 et le lot UM-03 ; docs/etudes/2026-10-21-sept-univers-et-vie-publique/EXECUTION.md (SU01d).
Vérifie d'abord que la fiche d'offre (apps/antsia_ga/src/components/jobs/job-public-route.tsx) n'a toujours pas de bouton de signalement et que moderation.cases.report accepte la cible commerceJob.
Périmètre : job-public-route.tsx et son test, le dialogue de signalement existant (réutilise-le, ne le recopie pas), les motifs de signalement si deux motifs « frais demandés » et « usurpation d'une entreprise » manquent, jobs.json fr et en.
Livre : bouton « Signaler cette offre » pour un membre qui n'est pas l'auteur, invitation à se connecter en public, accusé de réception, idempotence.
Vérifie : bun run verify, puis recette à 390, 834 et 1440 px, clair et sombre, avec une offre de démonstration si elle existe ; sinon dis-le.
Arrête-toi avant toute publication et si tu dois toucher un fichier partagé.
```

### Prompt UM-19
```text
Tu exécutes le lot UM-19 du plan 09 d'ANTSIA (session S1). Écris-moi toujours en français. Opus seulement.
Lis : CLAUDE.md ; le plan directeur § 7 ; le plan 09 § 2 (ligne « Espace /restauration ») et le lot UM-19 ; vault decisions/2026-10-24-index-alimentaire-canonique.md.
Vérifie que useFoodStorefronts (apps/antsia_ga/src/components/universes/food-universe-screen.tsx) filtre toujours côté écran la première page de shops.marketplaceShops.search.
Périmètre : convex/modules/shops/marketplaceShops*.ts, convex/schema.ts si un index est nécessaire, food-universe-screen.tsx, discover-screen.tsx, leurs tests.
Livre : un filtre serveur par gabarit, paginé, et une disponibilité pour la tuile Découvrir. Aucune adresse inventée.
Vérifie : test moteur avec treize vitrines dont la treizième est food ; bun run verify ; recette de /restauration et de Découvrir aux trois largeurs.
Arrête-toi avant toute publication.
```

### Prompt UM-04
```text
Tu exécutes le lot UM-04 du plan 09 d'ANTSIA (session S1). Écris-moi toujours en français. Opus seulement.
Lis : CLAUDE.md ; le plan directeur § 7 ; le plan 09 § 1, 2 et le lot UM-04 ; docs/adr/0024-emploi-consenti-et-candidatures-privees.md ; docs/contrats/PRO-COMMERCE-JOBS-V1.md.
Vérifie que jobs.discover (convex/modules/shops/jobs.ts) ne prend toujours que la pagination.
Périmètre : convex/modules/shops/jobRead.ts, jobs.ts, jobTables.ts, convex/schema.ts, la réception des offres dans federation/commerceJobs.ts pour remplir le texte de recherche, member-job-directory.tsx, lib/routes.ts, jobs.json fr et en, tests.
Livre : recherche texte et filtres fermés (contrat, lieu, compétence), pagination conservée après filtrage, état vide, URL partageable. Aucun classement par popularité sociale.
Vérifie : tests moteur (OU dans un filtre, ET entre filtres, offre close exclue), bun run verify, recette aux trois largeurs.
Arrête-toi avant toute publication.
```

### Prompt UM-01
```text
Tu prépares le lot UM-01 du plan 09 d'ANTSIA (session S1). Écris-moi toujours en français. Opus seulement.
Lis : CLAUDE.md ; le plan 09 § 1, 2, 4.1 et le lot UM-01 ; docs/etudes/2026-10-18-social-commerce/rapports/P14_SERVICES.md ; docs/etudes/2026-10-21-marketplace-specialites/03_SERVICES.md et 11_SERVICES_MP06.md ; docs/contrats/PRO-COMMERCE-SERVICE-CONTROL-V1.md.
Vérifie que convex/modules/shops/commerceActivation.ts garde services à ready: false.
Étape 1, sans rien ouvrir : écris la procédure de recette croisée avec un PRO.GA de test (scopes, prestations d'agenda, cas de rupture de 03_SERVICES.md § 7) et la liste des durées de conservation à décider. Donne-la-moi et attends mon accord.
Étape 2, après mon accord et la recette constatée : ADR, passage de services à ready: true, tests, bun run verify.
Ne modifie aucune variable d'environnement, aucun secret, aucune politique de console en production. Arrête-toi avant toute publication.
```

### Prompt UM-02
```text
Tu prépares le lot UM-02 du plan 09 d'ANTSIA (session S1). Écris-moi toujours en français. Opus seulement.
Lis : CLAUDE.md ; le plan 09 § 1, 2, 4.1 et le lot UM-02 ; docs/adr/0024-emploi-consenti-et-candidatures-privees.md ; docs/etudes/2026-10-18-social-commerce/rapports/P15_EMPLOI.md ; docs/contrats/PRO-COMMERCE-JOBS-V1.md.
Vérifie que COMMERCE_JOBS_RETENTION (packages/social-domain/src/commerce-jobs.ts) vaut toujours null et que applications est à ready: false.
Étape 1 : rédige la procédure de recette croisée (publier, candidater, suivre, retirer, refus d'un tiers) et la question de conservation à poser au juriste. Attends mon accord.
Étape 2, après décision : valeurs de conservation, purge bornée par cron (cliquet crons-contract), ADR, ouverture du registre, tests, bun run verify.
Aucune durée inventée. Arrête-toi avant toute publication.
```

Les autres lots suivent le gabarit de prompt du plan directeur (§ 7.3).

## 10. Sources lues

- Brief commun ; plan directeur `00_PLAN_DIRECTEUR.md` ; dossier de reprise `REPRISE_ANTSIA_2026-11-09.md` (§ 2, 9, 10, 11).
- ADR 0024, 0034, 0035.
- Étude sept univers : § 5.3 à 5.5, § 6, § 8, § 12, § 15, § 16 ; `EXECUTION.md` (SU02, SU06).
- Étude marketplace : `03_SERVICES.md`, `11_SERVICES_MP06.md`, `13_PROFESSIONNELS_MP09.md`, `15_ADMISSION_MP14.md`, `16_RAPPORT_LIVRAISON_MP00_MP14.md`.
- Étude social-commerce : `06_BOUTIQUES_SERVICES_EMPLOI.md`, rapports `P14_SERVICES.md`, `P15_EMPLOI.md`, `pilote/03_PARCOURS_DE_RECETTE.md`.
- Contrats `PRO-COMMERCE-JOBS-V1.md`, `PRO-COMMERCE-SERVICE-CONTROL-V1.md`.
- Vault : `su06-food-index`, `su06-public-menu-expiration`, `su06-catalog-reflection`, `recette-espaces-specialises-2026-10-25`, `decisions/2026-10-23-univers-et-ma-boutique`, `decisions/2026-10-24-index-alimentaire-canonique`.
- Mémoire : `etude-sept-univers-antsia.md`, `marketplace-ventes-privees.md`.
- Code : `convex/modules/{shops (service*, job*, commerceActivation, marketplace*, catalogValidators, storefrontTerms, checkoutRules, rules), professionals, public, federation (commerceJobs, commerceServiceNotices), contextualMessaging, moderation, notifications, people (dataInventory, dataPolicies), stories, events, diaspora (serviceReviews)}` ; `packages/social-domain/src/{activityConfiguration, dailySpecial, serviceTime, professionals, commerce-services, commerce-jobs, commerce-service-notices, contextualMessaging, commerce/catalogFacets, commerce/lifecycle}.ts` ; `apps/antsia_ga/src/{components/{services, jobs, professionals, universes, discovery, shops}, app/(membre), app/(public), lib/{routes, food-universe-search, marketplace-search}.ts, i18n/locales/fr}` ; `apps/admin_antsia_ga/src/components/console-{service,job}-policy.tsx` ; `apps/antsia_mobile/src/{screens, lib/native-business.ts}`.
