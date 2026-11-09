# Plan 15 — DIASPORALE, le réseau de la diaspora gabonaise

> Constaté par lecture du code d'`origin/main` (ANTSIA `26741caa`, DIASPORALE `bead76d`), le 9 novembre 2026. Rien n'a été exécuté.
> Applications de référence : InterNations, Nextdoor, LinkedIn (groupes et réseaux d'anciens, emploi), Groupes Facebook, Meetup, plateformes de mise en relation avec des mentors. Comparaison faite de mémoire (état des produits à la mi-2026), non revérifiée en ligne.
> Ce plan fait office de **lot G0** du plan global de DIASPORALE (`docs/14`) : il établit l'état réel par le code, ticket par ticket, et recommande la tranche suivante.

Légende des chemins : `D:` = dépôt DIASPORALE, `A:` = dépôt ANTSIA. Colonne Mobile : DIASPORALE n'a **aucune application mobile** (`D:apps/` ne contient que `diasporale_com`) ; « — » partout.

## 1. L'intention du propriétaire

- **Pour qui** : les Gabonais de l'étranger (personas P1 à P9 : établi, nouvel arrivant, responsable d'association, entrepreneur, recruteur, institution, modérateur) dont la vie communautaire est dispersée sur des groupes WhatsApp et Facebook (cahier `D:docs/00_CAHIER_DES_CHARGES_DIASPORALE.md` § 1, § 6.1).
- **Quoi** : un réseau **fermé, officiel mais ouvert, par pays et global, séparé** d'ANTSIA : ce qui se publie dans DIASPORALE y reste, sauf geste de l'auteur (cahier § 0). Entrer dans DIASPORALE crée l'adhésion ANTSIA dérivée (plan du programme, R3).
- **Trois piliers** : divertissement et lien (fil, hubs, évènements, iCom), business sans paiement (services, emploi, talents : D-G01 à D-G03 de `D:docs/17_REGISTRE_DECISIONS_DROITS_G0.md`), vie publique (postes consulaires « Officiel », attestation consulaire consentie).
- **Trois résultats prioritaires** (`D:docs/14` § 1.1) : trouver une compétence locale (« coiffeur à Paris »), faire vivre une association, découvrir et communiquer.
- **Déjà décidé** : aucune donnée consulaire dans le moteur, consulat.ga atteste par un booléen, un pays, un poste, une date (cahier § 5, A4) ; classement chronologique et explicable, pas de « Pour vous » comportemental (D-G05) ; pas de chiffrement de bout en bout annoncé (D-G06) ; groupes limités à 256 (D-G08) ; aucune publicité au pilote (D-G04) ; demande de service structurée, pas d'amitié artificielle (D-G02) ; conversations contextuelles D1 à D16 validées le 19/10 (`A:docs/contrats/CONVERSATION-CONTEXTUELLE-V1.md`) ; aucune adresse de domicile stockée (`D:docs/32` § 7).
- **Refusé** : vendre un badge, faire payer le citoyen, inscrire d'office dans un groupe d'association (le cahier EXF-DG-26 l'envisageait ; `D:docs/14` G3 et le code l'ont remplacé par une entrée volontaire).
- **Charte** : v4 adoptée le 2/11 (`D:docs/03_CHARTE_DIASPORALE.md`), couleurs par famille d'actions fusionnées le 3/11 (diasporale#31) ; six boutons restent à trancher (mémoire `couleurs-par-famille-diasporale`).
- **Production** : au propriétaire seul (hébergement A10, domaine `diasporale.com`, textes légaux relus, réseau créé par la console) ; dossier de reprise § 10.2.

## 2. Ce qui existe

| # | Capacité | État | Web | Mobile | Preuve |
|---|---|---|---|---|---|
| 1 | Porte unique, code à usage unique par e-mail | Présent | oui | — | `D:apps/diasporale_com/src/app/entrer/code/page.tsx`, `D:apps/diasporale_com/src/components/entry-door.tsx` |
| 2 | Entrée par IDN | Partiel : écran présent, recette IDN réelle jamais faite (PD2 R1) | oui | — | `D:apps/diasporale_com/src/app/entrer/idn/page.tsx` |
| 3 | Code par SMS | Fermé : l'écran propose le téléphone, le moteur refuse (`requestCode`) ; ouverture par le plan 06 | non | — | `D:apps/diasporale_com/src/screens/enter-screens.tsx` |
| 4 | Accueil : pays, handle, consentements un par un | Présent | oui | — | `D:apps/diasporale_com/src/app/bienvenue/page.tsx`, `A:convex/modules/diaspora/membership.ts` (`joinDiasporale`) |
| 5 | Statut dérivé (en attente, déclarée, vérifiée) et badges calculés | Présent | oui | — | `D:packages/diasporale-domain/src/eligibility.ts`, `D:packages/diasporale-domain/src/badges.ts` |
| 6 | Parrainage avec quotas, journal, retrait | Présent | oui | — | `D:apps/diasporale_com/src/app/parrainer/page.tsx`, `membership.ts` (`sponsor`, `revokeSponsorship`, `sponsorDashboard`) |
| 7 | Attestation consulaire `DIASPORA-ATTESTATION-V1` | Fermé : sans `DIASPORA_ATTESTATION_URL` et clés, la demande finit en échec technique ; contrat côté consulat.ga en PR brouillon | oui | — | `A:convex/modules/diaspora/attestation.ts`, `D:apps/diasporale_com/src/app/verification/page.tsx` |
| 8 | Bannières d'élévation (IDN, consulat) | Partiel : bannières présentes, retour sans perte de session non prouvé (EXF-DG-05) | oui | — | `D:packages/diasporale-features/src/components/membership-status-banner.tsx` |
| 9 | Quitter DIASPORALE, se déconnecter partout | Présent | oui | — | `membership.ts` (`leaveDiasporale`), `D:apps/diasporale_com/src/components/sign-out-settings.tsx` |
| 10 | Fil par portée (Mon pays, Toute la diaspora, Récents), mots-dièse | Présent | oui | — | `D:apps/diasporale_com/src/screens/feed-screen.tsx` |
| 11 | Fil « Pour vous » personnalisé | Absent, volontairement (D-G05) | non | — | motifs cherchés : `forYou`, `pour vous`, `personalized` |
| 12 | Découverte verticale (défilement plein écran) | Partiel : première tranche DG-017 ; chaîne vidéo adaptative DG-018 absente | oui | — | `D:packages/diasporale-features/src/components/discovery/feed-discovery.tsx` |
| 13 | « Pourquoi cette publication ? » (DG-019) | Présent | oui | — | `D:packages/diasporale-features/src/components/post-explanation.tsx` |
| 14 | Composeur : 4 photos ou 1 vidéo, partage cité, brouillon durable | Présent | oui | — | `D:packages/diasporale-features/src/components/composer.tsx` |
| 15 | Stories et albums (surfaces du moteur) | Présent | oui | — | `D:apps/diasporale_com/src/components/feed-stories.tsx`, `D:apps/diasporale_com/src/components/profile-albums.tsx` |
| 16 | Choix privés du fil : masqués, sourdines, restauration (DG-003) | Présent | oui | — | `A:convex/modules/diaspora/contentPreferences.ts` |
| 17 | Hubs par pays, compteurs nocturnes, évènements et pages du pays | Présent | oui | — | `D:apps/diasporale_com/src/screens/hub-screen.tsx`, `A:convex/modules/diaspora/hubs.ts` |
| 18 | Carte de la diaspora (EXF-DG-17) | Absent | non | — | motifs : `diasporaMap`, `carte de la diaspora`, `DiasporaMap` |
| 19 | Profil, facette, visibilité par champ, aperçu « comme les autres » | Présent | oui | — | `D:apps/diasporale_com/src/screens/profile-screens.tsx`, `A:convex/modules/diaspora/facet.ts` |
| 20 | Relations, abonnements, demandes, blocages, suggestions masquées | Présent | oui | — | `D:apps/diasporale_com/src/screens/relations-screen.tsx`, `A:convex/modules/diaspora/suggestions.ts` |
| 21 | Annuaire opt-in des membres | Présent | oui | — | `D:apps/diasporale_com/src/app/membres/page.tsx`, `A:convex/modules/diaspora/directory.ts` |
| 22 | Pages d'association et d'entreprise : création, revendication, équipe (DG-007, DG-008) | Présent | oui | — | `D:apps/diasporale_com/src/components/page-claim-form.tsx`, `page-team-panel.tsx`, `D:apps/diasporale_com/src/app/nouvelle-page/page.tsx` |
| 23 | Publications de page, épingle, rubriques partageables, photos et vidéos | Présent | oui | — | `D:apps/diasporale_com/src/components/page-publications-panel.tsx`, `page-post-pin.tsx` |
| 24 | Annuaire des pages par type et secteur | Présent | oui | — | `D:apps/diasporale_com/src/components/page-directory.tsx` |
| 25 | Pages « Officiel » des postes consulaires, import public (DG-009b) | Absent : table `communityImports` déclarée, aucune fonction ne l'écrit | non | — | `A:convex/modules/diaspora/tables.ts` |
| 26 | Adhésion associative distincte du suivi, rôles, exclusion (DG-010) | Présent | oui | — | `A:convex/modules/diaspora/associations.ts`, `D:apps/diasporale_com/src/app/pages/[handle]/adherents/page.tsx` |
| 27 | Groupe privé d'association, entrée volontaire | Présent | oui | — | `A:convex/modules/diaspora/associationGroups.ts`, `D:apps/diasporale_com/src/components/association-group.tsx` |
| 28 | Groupes thématiques ouverts par pays (EXF-DG-24) | Absent dans DIASPORALE (le moteur a `thematicGroups`, aucune route ici) | non | — | motifs : `/groupes`, `thematicGroups.create`, `groupsDirectory` dans `D:apps/diasporale_com/src/lib/routes.ts` |
| 29 | Décisions de modération d'une page et recours | Présent | oui | — | `D:apps/diasporale_com/src/components/page-decisions-panel.tsx` |
| 30 | Évènements d'association, audiences, annulation | Présent | oui | — | `A:convex/modules/events/pageEvents.ts`, `D:apps/diasporale_com/src/components/association-events.tsx` |
| 31 | Capacité, liste d'attente FIFO, date limite (DG-023) | Présent | oui | — | `A:convex/modules/events/pageEventRegistrations.ts` |
| 32 | Rappel personnel J-1 | Partiel : jobs écrits, délivrance jamais prouvée | oui | — | `A:convex/modules/events/pageEventReminders.ts` |
| 33 | Présences par billet QR | Présent | oui | — | `A:convex/modules/events/pageEventAttendance.ts`, `D:apps/diasporale_com/src/components/association-event-attendance.tsx` |
| 34 | Galerie après l'évènement | Présent | oui | — | `A:convex/modules/events/pageEventGallery.ts` |
| 35 | Export iCal et agenda personnel paginé | Présent | oui | — | `A:convex/modules/events/pageEventCalendar.ts`, `D:apps/diasporale_com/src/app/agenda/page.tsx` |
| 36 | Évènement organisé par une personne, évènement récurrent | Absent | non | — | motifs : `createPersonEvent`, `recurr`, `récurr`, `RRULE` |
| 37 | Direct d'un évènement (EXF-DG-29) | Absent : route `conference` déclarée « pas encore servie » | non | — | `D:apps/diasporale_com/src/lib/routes.ts` |
| 38 | Catalogue d'offres, recherche par pays, ville saisie, catégorie, mode (DG-011, DG-012) | Présent | oui | — | `A:convex/modules/diaspora/services.ts`, `D:apps/diasporale_com/src/app/services/page.tsx` |
| 39 | Demande, proposition versionnée, rendez-vous, annulation, absence contestée (DG-014, DG-015) | Présent | oui | — | `A:convex/modules/diaspora/serviceRequests.ts`, `D:apps/diasporale_com/src/screens/service-request-screens.tsx` |
| 40 | Avis admissibles et réponse de la page (DG-016) | Présent | oui | — | `A:convex/modules/diaspora/serviceReviews.ts` |
| 41 | Disponibilités et créneaux réservables des prestataires | Absent | non | — | motifs : `serviceAvailability`, `weeklyRule`, `créneau libre` |
| 42 | Offres ou profils enregistrés (favoris) | Absent | non | — | motifs : `favorite`, `favori`, `savedOffer`, `wishlist` |
| 43 | Emploi : offres de pages, candidature privée, décisions (DG-025) | Présent | oui | — | `A:convex/modules/diaspora/jobs.ts`, `D:apps/diasporale_com/src/app/emploi/page.tsx` |
| 44 | Talents opt-in, sans export de masse | Présent | oui | — | `D:apps/diasporale_com/src/app/talents/page.tsx` |
| 45 | Alertes emploi par filtres (EXF-DG-34) | Absent | non | — | motifs : `jobAlert`, `savedSearch`, `alerte` |
| 46 | Entraide : questions, réponse retenue, missions bénévoles (DG-024 a) | Présent | oui | — | `A:convex/modules/diaspora/mutualAid.ts`, `D:apps/diasporale_com/src/app/entraide/page.tsx` |
| 47 | Mentorat : profils opt-in, demande avec créneaux, plafond, expiration (DG-024 c) | Présent | oui | — | `A:convex/modules/diaspora/mentoring.ts`, `D:apps/diasporale_com/src/app/mentorat/page.tsx` |
| 48 | Kit d'arrivée daté, relu par un tiers, signalement « périmée » (DG-024 b) | Présent | oui | — | `A:convex/modules/diaspora/arrivalKit.ts` |
| 49 | Petites annonces (EXF-DG-36) | Absent : seule la carte de la charte existe | non | — | `D:packages/diasporale-features/src/components/cards/community-cards.tsx` (montrée par `/charte` seulement) |
| 50 | iCom du moteur : messages, groupes, appels, présence | Présent en mode moteur, fermé en démonstration locale | oui | — | `D:apps/diasporale_com/src/components/icom.tsx` |
| 51 | Conversations de mise en relation (CC-6) | Fermé : politique contextuelle fermée tant qu'un opérateur ne l'ouvre pas (`contextualMessaging/operator.setPolicy`) | oui | — | `D:apps/diasporale_com/src/components/contextual-conversations.tsx` |
| 52 | Cloche neutre (services, vie communautaire, modération, mise en relation) | Présent | oui | — | `D:packages/diasporale-features/src/components/notification-bell.tsx`, `A:convex/modules/diaspora/communityNotifications.ts` |
| 53 | Préférences fines de notification, plafond hebdomadaire | Absent : seul le consentement « notifications » existe | non | — | `D:apps/diasporale_com/src/screens/settings-screen.tsx` ; motifs `quietHours`, `plafond hebdo`, `weeklyCap` |
| 54 | Push web et digest mensuel par pays (EXF-DG-39) | Absent | non | — | motifs : `serviceWorker`, `PushManager`, `vapid`, `digest` (hors attestation) |
| 55 | Signaler partout, neuf natures `diaspora…` | Présent | oui | — | `D:apps/diasporale_com/src/components/report-content-sheet.tsx`, `A:convex/modules/diaspora/moderationTargets.ts` |
| 56 | Bureau de modération par pays, voie « Délais légaux » | Présent | oui | — | `A:convex/modules/diaspora/moderationDesk.ts`, `D:apps/diasporale_com/src/components/moderation-desk-deadlines.tsx` |
| 57 | Mesure du pilote : 13 indicateurs, seuil « moins de 5 » | Présent | oui | — | `A:convex/modules/diaspora/pilotMetrics.ts`, `D:apps/diasporale_com/src/app/pilote/page.tsx` |
| 58 | Mes données : export, effacement, décisions, recours (DG-026) | Présent | oui | — | `D:apps/diasporale_com/src/components/data-rights-settings.tsx` |
| 59 | Mentions légales et confidentialité | Partiel : charpente, marqueur « TODO JURISTE » visible et bloquant | oui | — | `D:apps/diasporale_com/src/screens/legal-screen.tsx` |
| 60 | Charte v4, thèmes Sable et Gaboma, couleurs par famille | Partiel : six boutons sans famille | oui | — | `A:packages/ui/src/themes/diasporale.css`, `A:packages/ui/src/themes/diasporale-gaboma.css`, `D:packages/diasporale-features/src/primitives/button.tsx` |
| 61 | Comptes de démonstration par acteur (20) | Présent (local et démonstration déclarée, jamais en production) | oui | — | `A:convex/modules/diaspora/demoAccounts.ts`, `A:docs/adr/0038-comptes-de-demonstration-diasporale.md` |
| 62 | Recherche transversale dans le réseau | Absent : une recherche par rubrique seulement | non | — | motifs : `globalSearch`, `/recherche`, `recherche globale` |
| 63 | iAsted concierge (EXF-DG-48) | Absent | non | — | motifs : `iasted`, `iAsted`, `concierge` |
| 64 | Application mobile DIASPORALE (PD9, G10) | Absent | — | non | `D:apps/` |

Décompte : **Présent 40 · Partiel 6 · Absent 15 · Fermé 3** (le n° 11 compte en Absent, écarté par décision). Les abréviations `D:docs/14`, `D:docs/32`, etc. désignent les documents numérotés du dossier `D:docs/`.

### Ce qui est écrit mais jamais recetté en réel

Les tests passent : `verify` vert le 3/11 dans les deux dépôts (3 084 tests DIASPORALE, rapport `D:docs/recette/couleurs-par-famille-2026-11-03/RAPPORT.md`). Mais un test n'est pas une recette.

| Recette | État | Source |
|---|---|---|
| DG-002 (deux photos), entraide, mission, mentorat, candidature, « coiffeur à Paris » jusqu'à l'avis | Jouées à deux comptes, **backend local**, 19/10 | `D:docs/recette/deux-comptes-2026-10-19/README.md` |
| Publication, signalement, bureau « Délais légaux » | Jouées **en ligne sur la démonstration**, 22/10 | `D:docs/recette/demo-en-ligne-2026-10-22/README.md` |
| CC-V (conversations de mise en relation), traitement au guichet, publication d'un avis et réponse de page | **Jamais jouées** : il faut un opérateur | `D:docs/32_EXECUTION_VAGUE_H.md` § 12 |
| Relecture du kit d'arrivée, tableau du pilote | Jamais jouées | `D:docs/32` § 5 |
| Revendication et mandats à plusieurs comptes (DG-008), adhésion et groupe (DG-010), évènements avancés (DG-023 : capacité concurrente, QR, galerie, iCal importé, rappel reçu) | Jamais jouées | `D:docs/18_EXECUTION_VAGUE_G.md`, `D:docs/14` en-tête |
| Effacement de bout en bout après service et association (R-G19) | Jamais jouée | `D:docs/14` § 6.2 |
| Évènement, groupe, « Accepter » hors relation avec les nouvelles couleurs | Jamais vus à l'écran | rapport couleurs du 3/11 |
| diasporale#19 et #20 en mode moteur | Vus en démonstration seulement | dossier de reprise § 10.2 |
| IDN réel (PD2 R1), attestation réelle (PD3 R2), appels réels, médias sur téléphone | Jamais jouées | `D:docs/01` encart, `D:docs/17` § 1 |

**En ligne** : démonstration seulement, front `bead76d` et moteur `26741caa`, relevé le 9/11 (dossier de reprise § 2.2). La production du moteur n'a aucun réseau `diasporale` ; `diasporale.com` ne répond pas.

## 3. Comparaison avec les applications de référence

| Capacité | InterNations | Nextdoor | LinkedIn | Groupes Facebook | Meetup | Mentorat | DIASPORALE | Verdict |
|---|---|---|---|---|---|---|---|---|
| Entrée contrôlée, membres vérifiés | oui (admission) | oui (adresse) | non | questions d'adhésion | non | variable | statut dérivé, parrainage, attestation fermée | À adapter : ouvrir l'attestation (DG-009a) |
| Communauté par pays ou ville | oui | quartier | non | oui | oui | non | hubs par pays | Déjà fait |
| Groupes thématiques ouverts | groupes d'activités | groupes | oui | cœur du produit | oui | non | groupes d'association seulement | À faire (DS-09) |
| Règles, épingles, rôles d'admin | oui | oui | oui | oui | oui | non | pages et associations | Déjà fait |
| Évènements : inscription, attente, rappel | oui | oui | oui | oui | oui | non | pages seulement | Déjà fait côté page ; à faire pour une personne (DS-10) |
| Présence à l'entrée (check-in) | non sûr | non | non | non | oui | non | billet QR | Déjà fait |
| Évènements récurrents | non sûr | non | non | non | oui | non | non | À faire (DS-10) |
| Photos après l'évènement | non sûr | non | non | oui | oui | non | galerie | Déjà fait |
| Cotisation ou billetterie | évènements payants | non | non | non | oui | payant | non | Écarté : paiement fermé, lot D4 |
| Annuaire de membres | oui | oui | oui | liste des membres | oui | annuaire des mentors | opt-in, `hidden` par défaut | Déjà fait, plus protecteur |
| Emploi, candidature, recherche de talents | non | non | oui | non | non | non | oui | Déjà fait |
| Alertes emploi | non | non | oui | non | non | non | non | À faire (DS-11) |
| Recommandation de prestataires locaux | oui | oui | non | oui | non | non | avis sur prestation réalisée | Déjà fait, avec preuve |
| Prise de rendez-vous dans un agenda | non | non | non | non | non | oui | demande puis proposition | À faire (DS-12) |
| Entraide, questions et réponses | forums | oui | non | oui | non | non | oui | Déjà fait |
| Guide d'installation | guides par ville | non | non | fichiers épinglés | non | non | kit d'arrivée relu et daté | Déjà fait, différenciant |
| Mentorat : profil, demande, séance, retour | non sûr | non | non | non sûr | non | oui | profil, demande, créneaux, clôture | À adapter : retour après séance (DS-13) |
| Petites annonces | non sûr | oui | non | groupes d'achat-vente | non | non | non | Reporté (DS-17), porte SU01 |
| Messagerie privée, appels | oui | oui | oui | Messenger | oui | visio | iCom du moteur | Déjà fait, à recetter |
| Notifications réglables, résumé par e-mail | oui | oui | oui | oui | oui | oui | cloche seule | À faire (DS-14) |
| Carte des membres | non sûr | carte du quartier | non | non | non | non | non | À faire avec seuil (DS-15) |
| Direct d'un évènement | non | non | oui | oui | en ligne | visio | non | Reporté (DS-18), dépend du plan 04 |
| Application mobile | oui | oui | oui | oui | oui | oui | non | Reporté (DG-028) |
| Fil personnalisé par le comportement | non sûr | oui | oui | oui | non | non | non | Écarté (D-G05) |

## 4. Ce qui manque

### 4.1 Bloquant avant l'ouverture au public

1. Recettes en mode moteur des modules jamais joués (DG-008, DG-010, DG-016, DG-023, DG-024 b, DG-026, pilote) : aucun n'a été vu sur un vrai backend avec plusieurs comptes.
2. CC-V et traitement au guichet : la politique contextuelle et l'équipe de modération n'existent sur aucun déploiement.
3. Textes légaux : charpente « TODO JURISTE » (A11).
4. Dossier de mise en production : création du réseau par la console (`managedBy: "diaspora"`, schéma de facette en JSON, pays ouverts), équipe France, origines de confiance, client OIDC, expéditeur e-mail. Aucun runbook n'existe ; la graine `A:convex/modules/diaspora/seed.ts` est refusée en production.
5. Documents périmés : `D:docs/01` (état au 18/10), `D:CLAUDE.md` (« PD0 en cours »), rapport des couleurs (« rien n'est publié »).

### 4.2 Attendu par les utilisateurs

- Groupes thématiques ouverts par pays, sans association porteuse (EXF-DG-24).
- Évènement organisé par une personne, évènement récurrent.
- Attestation consulaire réelle, donc le badge « Vérifié » sans IDN (DG-009a).
- Pages « Officiel » des postes consulaires (DG-009b) : sans elles, le hub n'a aucune voix institutionnelle.
- Alertes emploi, offres enregistrées, recherche transversale.
- Préférences de notification, push, résumé par pays.
- Six boutons cohérents avec la charte.

### 4.3 Différenciant pour DIASPORALE

- **Confiance prouvée** : attestation consulaire minimale et consentie, parrainage tracé, badges calculés. Aucune référence n'a l'équivalent.
- **Avis sur preuve** : un avis exige un rendez-vous confirmé ou réalisé (DG-016) ; l'absence se conteste (DG-015).
- **Kit d'arrivée daté et relu**, signalement « périmée » : mieux que les fichiers épinglés des groupes.
- **Aucune coordonnée exposée** : tout passe par une conversation attachée à l'objet (CC).
- **Faible débit** : budget 3G du cahier (EXT-DG-02) jamais mesuré ; à prouver (DS-08).
- **Carte agrégée avec seuil anti-réidentification** (EXF-DG-17), sans position individuelle.

### 4.4 Écarté ou reporté, et pourquoi

| Sujet | Raison |
|---|---|
| Fil « Pour vous » comportemental | D-G05 : règles explicables, chronologie |
| Chiffrement de bout en bout annoncé | D-G06 : DG-022b non décidé |
| Billetterie, cotisations, vitrines premium | Paiements fermés, lot D4 |
| Petites annonces, logement, colis | SU01a, b, c, d, h avant toute annonce de particulier ; G8 exige une analyse métier par catégorie |
| Groupes de 1 000 | D-G08 : 256 |
| Direct d'évènement | Dépend du plan 04 et d'une recette LiveKit réelle |
| Application mobile | Après le pilote web (DG-028) |
| iAsted concierge | Plan 16, marquage de l'IA (SU01i) |

## 5. Lots d'implémentation

Tous les lots S2 : dépôt DIASPORALE ; dans ANTSIA, seulement `convex/modules/diaspora/`, `packages/ui/src/themes/diasporale*.css`, `packages/social-contracts/src/i18n/locales/*/diaspora.json`. Les fichiers `A:convex/modules/events/pageEvent*.ts` sont **hors** de cette zone : toute modification passe par une issue `[S1]`.

### DS-01 — Contrôle de départ, état réel et documents · priorité P0 · taille S · session S2
- **Pour l'utilisateur** : rien de visible ; les sessions suivantes partent d'un état vrai.
- **Backend** : aucun. Backend local 3320/3321, graine `modules/diaspora/seed:run`.
- **Web** : aucun.
- **Mobile** : sans objet.
- **Données personnelles** : aucune.
- **Tests et cliquets** : `bun run --cwd ../ANTSIA verify` avec le verrou ; chiffres comparés au 3/11.
- **Critères d'acceptation** : encart de `D:docs/01` refait à partir du tableau § 2 de ce plan (PD0 à PD10, G0 à G11, DG ouverts) ; `D:CLAUDE.md` à jour ; rapport des couleurs corrigé (publié le 3/11 à 7 h 42) ; diasporale#21 lue et son contenu unique décrit ; la démo sert bien le déploiement relevé le 9/11.
- **Dépend de** : rien. Reprend les lots 2.0, 2.1 et 2.6 du dossier de reprise (§ 13.3).
- **Porte** : accord pour les variables du backend local.

### DS-02 — Six boutons à trancher · P1 · S · S2
- **Pour l'utilisateur** : chaque geste a la couleur de sa famille, partout.
- **Backend** : aucun.
- **Web** : appliquer la décision 1 du § 7 aux fichiers du rapport du 3/11 (`mentoring-request-form.tsx`, `mutual-aid-question-detail.tsx`, `sponsor-attestation-screens.tsx`, `service-request-screens.tsx`, `service-proposal-form.tsx`, `association-event-attendance.tsx`, `profile-screens.tsx`).
- **Mobile** : sans objet.
- **Données personnelles** : aucune.
- **Tests et cliquets** : un test par zone qui vérifie « un seul bouton plein » ; `engine-theme-contrast.test.ts` vert dans Sable et Gaboma.
- **Critères d'acceptation** : six variantes posées ; captures 390 et 1280 px, clair et sombre ; aucun autre bouton changé.
- **Dépend de** : décision 1.
- **Porte** : décision du propriétaire.

### DS-03 — Écrans jamais vus, refus en mode moteur, textes · P1 · S · S2
- **Pour l'utilisateur** : évènement, groupe et « Accepter » hors relation corrects ; refus d'accès dits sans « Réessayer » ; textes justes.
- **Backend** : aucun.
- **Web** : comptes de démonstration mis dans le bon état ; rejouer diasporale#19 et #20 avec `NEXT_PUBLIC_DIASPORALE_DATA_SOURCE=engine` ; corriger « de Entraide… », « l'administrateur » au masculin, apostrophes de la cloche, en fr et en.
- **Mobile** : sans objet.
- **Données personnelles** : aucune.
- **Tests et cliquets** : `i18n-keys` ; ne pas remplacer les ensembles locaux `ACCESS_ERRORS` par `ACCESS_REFUSAL_CODES` (ils purgent le cache et incluent `network_unavailable`).
- **Critères d'acceptation** : captures des trois écrans aux deux largeurs et deux modes ; refus sans reprise en mode moteur.
- **Dépend de** : DS-02 pour les couleurs.
- **Porte** : aucune.

### DS-04 — Recette CC-V et traitement au guichet · P0 · M · S2 (+ geste d'opérateur)
- **Pour l'utilisateur** : la conversation d'une demande, d'un mentorat ou d'une candidature s'ouvre ; un signalement est tranché.
- **Backend** : aucun code attendu. Sur le backend local puis la démonstration : `contextualMessaging/operator.setPolicy` pour DIASPORALE ; équipe de modération France par la console (`console-teams`).
- **Web** : corriger ce que la recette révèle dans `contextual-conversations.tsx`, `moderation-desk-*.tsx`.
- **Mobile** : sans objet.
- **Données personnelles** : vérifier que le message contextuel entre dans l'export et l'effacement (surface `contextualMessage`).
- **Tests et cliquets** : `A:tests/ratchets/contextual-hooks.test.ts` vert.
- **Critères d'acceptation** : deux comptes ; voix de page ; adresse exacte refusée en voix de personne, admise en voix de page ; fil clos quand l'objet est retiré ; décision motivée et recours au guichet ; avis publié puis réponse de la page.
- **Dépend de** : DS-01 ; plan 01 pour la messagerie contextuelle ; plan 12 pour les équipes.
- **Porte** : accord du propriétaire pour ouvrir la politique sur la démonstration ; publication éventuelle.

### DS-05 — Campagne de recettes en mode moteur · P0 · L · S2
- **Pour l'utilisateur** : les parcours associatifs, évènementiels et de données marchent pour de vrai.
- **Backend** : corrections dans `A:convex/modules/diaspora/` ; tout défaut dans `events/pageEvent*.ts` devient une issue `[S1]`.
- **Web** : corrections dans les écrans concernés.
- **Mobile** : sans objet.
- **Données personnelles** : R-G19 joué : export d'un compte après service et association, effacement, données tierces protégées.
- **Tests et cliquets** : un test par défaut trouvé.
- **Critères d'acceptation** : rapport daté `D:docs/recette/moteur-<date>/RAPPORT.md` couvrant DG-008 (revendication, retrait de rôle effectif), DG-010 (aucune inscription d'office), DG-023 (deux inscriptions sur la dernière place, attente ordonnée, QR, galerie, iCal importé dans un agenda), DG-024 b (relecture du kit), pilote (agrégats après une nuit), R-G03 (contenu `network` absent d'ANTSIA) ; chaque recette dit fait ou non fait.
- **Dépend de** : DS-01, DS-04.
- **Porte** : aucune en local ; publication de la démo après accord.

### DS-06 — Dossier de mise en production · P0 · M · S2
- **Pour l'utilisateur** : `diasporale.com` ouvre le jour voulu, sans improvisation.
- **Backend** : aucun code ; vérifier que `demoAccountsAllowed` reste fermé en production (ADR-0038).
- **Web** : aucun.
- **Mobile** : sans objet.
- **Données personnelles** : liste des sous-traitants et lieux d'hébergement à remplir par le propriétaire (G9).
- **Tests et cliquets** : un test du domaine qui produit le JSON de facette attendu par la console, pour coller sans erreur.
- **Critères d'acceptation** : `D:docs/36_MISE_EN_PRODUCTION.md` liste dans l'ordre : création du réseau par la console (slug, `closed`, parent racine, `declared_or_verified`, `network`, `managedBy: "diaspora"`, portées `local` et `diaspora`, pays ouverts, thème) ; équipe de modération France ; politique contextuelle ; origine dans `TRUSTED_ORIGINS` ; client OIDC `diasporale` ; expéditeur e-mail ; projet d'hébergement et domaine ; variables publiques du front ; contrôle de la version servie ; retour arrière. Noms de variables seulement, aucune valeur.
- **Dépend de** : DS-05 ; plan 13 pour la console.
- **Porte** : hébergement A10, domaine, secrets, création du réseau : propriétaire.

### DS-07 — Textes légaux définitifs · P0 · S · S2
- **Pour l'utilisateur** : mentions et politique de confidentialité vraies.
- **Backend** : aucun.
- **Web** : remplir les sections de `legal-screen.tsx` par l'i18n ; retirer le marqueur seulement quand le texte relu est fourni.
- **Mobile** : sans objet.
- **Données personnelles** : durées de conservation alignées sur `A:convex/modules/people/dataPolicies.ts`.
- **Tests et cliquets** : `public-communication` (aucun audit ni hébergement affirmé sans preuve).
- **Critères d'acceptation** : texte du juriste reproduit à l'identique en fr et en ; aucun « TODO JURISTE ».
- **Dépend de** : décision 3 ; plan 12 (SU01a).
- **Porte** : juriste (A11).

### DS-08 — Accessibilité AA et budget 3G · P1 · M · S2
- **Pour l'utilisateur** : utilisable au clavier, au lecteur d'écran et sur un réseau lent.
- **Backend** : aucun.
- **Web** : audit des routes `/fil`, `/pays/[iso]`, `/services`, `/entraide`, `/pages/[handle]`, `/messages` ; corrections ; mesure du premier rendu sur un profil 3G.
- **Mobile** : sans objet.
- **Données personnelles** : aucune.
- **Tests et cliquets** : `web-design-guidelines` sans défaut bloquant.
- **Critères d'acceptation** : rapport AA par route ; temps mesurés et dits tels quels, sans cible affirmée atteinte si elle ne l'est pas.
- **Dépend de** : DS-02, DS-03 ; plan 13.
- **Porte** : aucune.

### DG-009a — Attestation consulaire réelle · P1 · M · S2 + gabon-diplomatie
- **Pour l'utilisateur** : « Vérifier mon inscription consulaire » rend un résultat.
- **Backend** : rien à écrire (`attestation.ts` complet) ; poser les trois variables sur un déploiement de recette.
- **Web** : écran `/verification` éprouvé sur les trois réponses (positive, négative, indisponible).
- **Mobile** : sans objet.
- **Données personnelles** : vérifier que seule l'empreinte du sujet est gardée ; révocation du consentement.
- **Tests et cliquets** : test de minimisation (champ en trop refusé).
- **Critères d'acceptation** : recette R2 avec le producteur ; PR #184 de gabon-diplomatie fusionnée par son équipe.
- **Dépend de** : décision 4.
- **Porte** : juriste (A4), clés, équipe de consulat.ga.

### DG-009b — Import public et pages « Officiel » des postes · P1 · L · S2 (+ S1 si le schéma change)
- **Pour l'utilisateur** : chaque hub montre son poste consulaire et ses associations publiques, revendicables.
- **Backend** : écrivain idempotent de `communityImports` (contrat `DIASPORA-COMMUNAUTE-V1`), création de pages non revendiquées, retrait propagé, règle de propriété par champ après revendication.
- **Web** : mention de la source et du statut non revendiqué sur la fiche.
- **Mobile** : sans objet.
- **Données personnelles** : aucune personne ni adhésion créée ; source, version et date gardées.
- **Tests et cliquets** : rejeu sans doublon, retrait (R-G22).
- **Critères d'acceptation** : import rejoué deux fois sans doublon ; retrait amont retire la copie publique ; badge « Officiel » calculé.
- **Dépend de** : DG-009a pour la coordination ; plan 11 pour l'officiel par fédération.
- **Porte** : contrat signé par gabon-diplomatie.

### DS-09 — Groupes thématiques ouverts par pays · P1 · M · S2
- **Pour l'utilisateur** : créer ou rejoindre « Gabonais de Lyon » sans association.
- **Backend** : vérifier si `thematicGroups` du moteur accepte un groupe sans page sur un réseau gouverné ; sinon issue `[S1]`.
- **Web** : route `/groupes` déclarée dans `routes.ts`, annuaire par pays, entrée depuis Communautés (pas de nouvelle icône).
- **Mobile** : après le web.
- **Données personnelles** : membres et publications dans l'export et l'effacement (déjà couverts par le moteur, à vérifier).
- **Tests et cliquets** : `network-scoped-functions`, `member-screens-full-width`.
- **Critères d'acceptation** : création, adhésion, départ, modération ; plafond 256 ; aucun groupe vide présenté comme actif.
- **Dépend de** : plan 07.
- **Porte** : aucune.

### DS-10 — Évènements de personne et récurrents · P2 · M · S1 (plan 07) puis S2
- **Pour l'utilisateur** : un membre organise une rencontre ; une association planifie « chaque premier samedi ».
- **Backend** : `pageEvents.ts` appelle `assertDiasporaNetwork` ; l'organisateur personne et la récurrence relèvent du moteur (plan 07).
- **Web** : formulaire et agenda DIASPORALE une fois le moteur prêt.
- **Mobile** : après le web.
- **Données personnelles** : inscriptions déjà dans l'inventaire.
- **Tests et cliquets** : fuseau et changement d'heure (R-G21).
- **Critères d'acceptation** : évènement de personne avec capacité et attente ; série dont une occurrence s'annule seule.
- **Dépend de** : plan 07.
- **Porte** : aucune.

### DS-11 — Retrouver : offres enregistrées, alertes emploi, recherche transversale · P2 · M · S2
- **Pour l'utilisateur** : garder une offre, être prévenu d'un emploi qui correspond, chercher partout depuis un champ.
- **Backend** : tables `diasporaSavedItems`, `diasporaJobAlerts` dans la tranche ; job de correspondance borné ; seaux de débit ; avis neutres.
- **Web** : bouton « Enregistrer » en `outline` ; réglage des alertes dans « Mes candidatures » ; recherche dans Explorer (pas de nouvelle destination).
- **Mobile** : après le web.
- **Données personnelles** : export et effacement ; recherches jamais montrées à un professionnel.
- **Tests et cliquets** : `no-unbounded-collect`, `notification-payload-content`.
- **Critères d'acceptation** : alerte reçue dans la cloche sans contenu ; enregistrement retiré à la suppression de l'offre.
- **Dépend de** : demande `[S1]` pour le schéma.
- **Porte** : aucune.

### DS-12 — Disponibilités des prestataires et créneaux · P2 · L · S2
- **Pour l'utilisateur** : choisir un créneau libre au lieu d'attendre une proposition.
- **Backend** : règles hebdomadaires et exceptions, fuseau IANA, réservation atomique (R-G06) ; `serviceAvailability` proposé par `D:docs/14` § 3.1.
- **Web** : réglage dans la gestion des services ; choix du créneau sur l'offre.
- **Mobile** : après le web.
- **Données personnelles** : export du prestataire.
- **Tests et cliquets** : deux acceptations simultanées, une seule réservation.
- **Critères d'acceptation** : créneau pris disparaît ; annulation le libère.
- **Dépend de** : DS-05.
- **Porte** : aucune ; aucun paiement.

### DS-13 — Mentorat : retour après séance · P2 · S · S2
- **Pour l'utilisateur** : le mentoré et le mentor notent ce qui a été fait ; le mentor voit ses séances passées.
- **Backend** : champ de retour privé sur `mentoringRequests`, visible des deux parties seulement ; aucune note publique.
- **Web** : dans « Mes mentorats ».
- **Mobile** : après le web.
- **Données personnelles** : export aux deux parties, effacement.
- **Tests et cliquets** : retour refusé avant acceptation.
- **Critères d'acceptation** : aucune note publique ni classement des mentors.
- **Dépend de** : DS-05.
- **Porte** : aucune.

### DS-14 — Notifications : préférences, plafond, push, résumé · P2 · M · S2 + plan 06
- **Pour l'utilisateur** : choisir ce qui sonne ; recevoir un résumé mensuel de son pays.
- **Backend** : préférences par genre DIASPORALE, plafond hebdomadaire des avis communautaires ; résumé par pays sans contenu privé.
- **Web** : réglages dans `/parametres`.
- **Mobile** : push natif avec DG-028.
- **Données personnelles** : préférences exportées.
- **Tests et cliquets** : `notification-payload-content`.
- **Critères d'acceptation** : un genre coupé ne sonne plus ; résumé sans nom de personne.
- **Dépend de** : plan 06 (push web, transports).
- **Porte** : clés VAPID et expéditeur (propriétaire).

### DS-15 — Carte de la diaspora · P2 · M · S2
- **Pour l'utilisateur** : voir où vit la communauté, pays par pays.
- **Backend** : lecture des compteurs matérialisés des hubs ; seuil d'affichage repris de `hubs.ts`.
- **Web** : carte statique par pays dans Explorer, sans géolocalisation.
- **Mobile** : après le web.
- **Données personnelles** : agrégats seulement.
- **Tests et cliquets** : un pays sous le seuil n'affiche aucun nombre.
- **Critères d'acceptation** : aucune position individuelle ; rien plutôt qu'un zéro.
- **Dépend de** : DS-05.
- **Porte** : aucune.

### DS-16 — Remontée dans le moteur des fonctions communes · P2 · L · S1 (plans 07, 08, 09) avec S2
- **Pour l'utilisateur** : ANTSIA gagne évènements avancés, adhésions et avis sans double code.
- **Backend** : généraliser `events/pageEvent*.ts` (aujourd'hui verrouillés par `assertDiasporaNetwork`), `diaspora/associations.ts`, `diaspora/serviceReviews.ts` ; converger `diaspora/jobs.ts` et `diaspora/services.ts` avec `A:convex/modules/shops/jobApplications.ts` et les services d'ANTSIA.
- **Web** : adaptateurs DIASPORALE repointés.
- **Mobile** : sans objet.
- **Données personnelles** : inventaire d'effacement unique.
- **Tests et cliquets** : tests portés, `no-cross-product-imports`.
- **Critères d'acceptation** : mêmes chemins d'API côté DIASPORALE ou migration écrite ; aucune donnée perdue.
- **Dépend de** : plans 07, 08, 09 ; décision 6.
- **Porte** : décision du propriétaire.

### DG-029 — Pilote France · P1 · M · S2 + propriétaire
- **Pour l'utilisateur** : un premier groupe réel d'associations, de prestataires et de nouveaux arrivants.
- **Backend** : aucun.
- **Web** : aucun ; tableau `/pilote` lu chaque semaine.
- **Mobile** : sans objet.
- **Données personnelles** : contenus consentis seulement.
- **Tests et cliquets** : sans objet.
- **Critères d'acceptation** : rapport avec dénominateurs, coût par service abouti (`D:docs/31_COUTS_ALERTES_MESURE_DG027.md`).
- **Dépend de** : DS-06, DS-07, mise en production.
- **Porte** : production, recrutement, zone (décision 5).

### Lots sous condition externe (P3), décrits court

| Lot | Pour l'utilisateur | Contenu | Dépend de | Porte |
|---|---|---|---|---|
| DS-17 — Petites annonces · P3 · L · S2 | Vendre, donner, chercher un logement entre membres | Analyse métier par catégorie écrite avant tout code ; logement réservé aux vérifiés (EXF-DG-36) ; la carte de la charte existe, aucune route avant ouverture ; export et effacement à définir | Plans 10 et 12 | SU01a, b, c, d, h ; décision 7 |
| DS-18 — Direct d'un évènement d'association · P3 · M · S2 | Suivre l'assemblée générale de loin | Servir la route `conference` déjà déclarée avec les surfaces `live` du moteur ; seul un signataire vivant ouvre l'antenne ; consentement à l'enregistrement et durée de rediffusion | Plan 04 | Clés LiveKit et Egress |
| DG-028 — Application mobile DIASPORALE · P3 · L · S2 ou S3 | DIASPORALE sur téléphone, avec push | Selon la décision 8 ; sortie globale et caches purgés ; parcours R1 à R8 sur iPhone et Android physiques | Plan 14, DG-029 | Comptes des magasins d'applications |
| DS-19 — iAsted concierge · P3 · M · S2 | « Quels évènements à Lyon ce mois-ci ? » | Outils de lecture bornés au réseau courant, mêmes gardes que l'interface, étiquetés IA ; aucune action sans confirmation ; refus hors réseau testé | Plan 16 | SU01i, D05 |

## 6. Ordre recommandé et dépendances

| Vague | Lots | Pourquoi dans cet ordre |
|---|---|---|
| 1 | DS-01, DS-02, DS-03 | Partir de l'état vrai ; finir la charte, petit et visible |
| 2 | DS-04, DS-05 | **Tranche recommandée** : prouver sur le moteur ce qui est écrit avant d'ajouter quoi que ce soit (G0 § 4 de `D:docs/14`) |
| 3 | DS-06, DS-07, DS-08 | Rendre la production possible dès que le propriétaire décide |
| 4 | DG-009a, DG-009b, DS-09 | La confiance et la voix officielle, puis les groupes |
| 5 | DG-029 | Pilote réel |
| 6 | DS-10 à DS-16 | Enrichissements, après les premiers retours |
| 7 | DS-17, DS-18, DG-028, DS-19 | Sous condition externe |

Ce que ce plan attend d'autres plans : 01 (messagerie contextuelle, iCom), 04 (direct), 06 (SMS, push, expéditeur), 07 (groupes, évènements génériques), 08 et 09 (convergence services et emploi), 11 (pages officielles par fédération), 12 (équipes de modération, SU01), 13 (console, accessibilité), 14 (mobile), 16 (iAsted).

## 7. Décisions à prendre par le propriétaire

1. **Les six boutons.** Recommandation, d'après l'ADR-0027 (« publier ; suivre et écrire ; réagir et participer », Valider à part) : **Décidé par le propriétaire le 9/11/2026 :** les six recommandations ci-dessous sont adoptées.
   - **Demander un mentorat** → `commerce` : c'est une demande de participation, comme « Candidater » et « Demander ce service », déjà en `commerce`.
   - **Retenir cette réponse** → rester `outline` : il y en a un par réponse, la règle d'un seul bouton plein l'interdit ; la réponse retenue porte une pastille en encre de succès.
   - **Parrainer** → `social` : on admet une personne dans le réseau, c'est un geste de relation entre deux membres.
   - **Faire une proposition** → `commerce` : le même échange commercial des deux côtés ; « Envoyer » du formulaire reste `send`.
   - **Afficher mon billet QR** → `commerce` : suite de « M'inscrire », qui disparaît une fois inscrit, donc un seul plein.
   - **Appeler** → `message` (tonal) : même famille que « Écrire », comme le journal d'appels d'ANTSIA garde le tonal sur une carte.
2. **Tranche suivante** : vague 2 (DS-04, DS-05) avant toute nouvelle fonction. Raison : la plupart des modules de la vague G et de la vague H n'ont jamais été joués sur un vrai backend avec plusieurs comptes (§ 2).
3. **Production** : hébergement A10, domaine `diasporale.com`, juriste pour les textes (A11), création du réseau par la console. Recommandation : commencer par le juriste, c'est le plus long.
4. **Attestation consulaire** : saisir l'équipe de consulat.ga et le juriste (A4). Recommandation : lancer en parallèle de la vague 2 ; sans elle, ouvrir avec IDN et parrainage (risque du cahier § 19).
5. **Zone pilote** : Paris et Île-de-France (D-G12), à confirmer avec des volontaires.
6. **Remonter dans le moteur** les évènements avancés, les adhésions et les avis (DS-16). Recommandation : oui, après le pilote, pour ne pas déstabiliser ce qui marche.
7. **Petites annonces** : garder fermé jusqu'à SU01 et une analyse par catégorie.
8. **Mobile** : application Expo distincte dans le dépôt DIASPORALE (S2) ou réseau choisi dans `apps/antsia_mobile` (S3). Recommandation : décider après le pilote web ; la marque séparée plaide pour une application distincte qui réutilise `packages/social-native`.
9. **CC-V sur la démonstration** : ouvrir la politique contextuelle sur la démonstration déclarée seulement. Recommandation : oui, c'est la seule façon de la montrer.
10. **Juridique ouvert** : motif de non-sélection hors export ; nom public du relecteur du kit (`D:docs/32` § 5).

## 8. Risques et points d'attention

- **Fichiers hors zone** : `A:convex/modules/events/pageEvent*.ts` portent les évènements de DIASPORALE mais appartiennent à S1 ; `D:docs/32` § 10 disait qu'ils étaient commités par DIASPORALE, ce n'est plus la règle du § 13.1.
- **Fichier de zone absent** : `A:packages/social-contracts/src/i18n/locales/*/diaspora.json` n'existe pas dans `main` ; ne pas le créer sans besoin.
- **Comptes de démonstration partagés** : ce qu'un visiteur fait est vu des suivants (ADR-0038).
- **Démo à republier** quand le moteur change ce que DIASPORALE lit ; une publication du moteur par S1 précède.
- **Double implémentation** emploi et services (DIASPORALE et boutiques d'ANTSIA) : divergence à surveiller (DS-16).
- **Données sensibles** : ne jamais utiliser de dossier consulaire réel comme donnée de recette.
- **Disque** : `verify` lourd, un seul à la fois.

## 9. Prompts d'implémentation

### Prompt DS-01
```text
Tu es la session S2 (DIASPORALE). Écris en français. Opus seulement.
Lis : REPRISE_ANTSIA_2026-11-09.md (§ 2, 7, 10.2, 13), CLAUDE.md, docs/00, docs/14, docs/17, docs/18, docs/32, et ce plan (PLANS_FINALISATION_2026-11-09/15_DIASPORALE.md, § 2).
Branche claude/etat-reel depuis origin/main. Périmètre : docs/ et CLAUDE.md de DIASPORALE.
Fais : monte le backend local (ports 3320/3321, demande l'accord pour les variables), sème le réseau, lance verify avec le verrou, rapporte les chiffres. Refais l'encart de docs/01 ligne par ligne (PD0–PD10, G0–G11, DG ouverts) en trois états : fait et constaté, écrit non recetté, à faire ; chaque ligne cite un fichier. Corrige le rapport couleurs-par-famille-2026-11-03 (publié le 3/11 à 7 h 42). Mets à jour CLAUDE.md. Lis diasporale#21 et dis ce qu'elle a d'unique.
Vérifie : verify vert, liens valides. Arrête-toi avant toute publication et avant de fermer une PR.
```

### Prompt DS-02
```text
Session S2. Lis docs/recette/couleurs-par-famille-2026-11-03/RAPPORT.md, l'ADR-0027 d'ANTSIA et la décision du propriétaire sur les six boutons (§ 7 du plan 15).
Branche claude/six-boutons. Périmètre : les fichiers listés au tableau « Laissés tels quels » du rapport, et leurs tests.
Applique la variante décidée à chacun, sans toucher aux autres boutons. Ajoute ou complète un test « un seul bouton plein » par zone touchée.
Vérifie : verify vert ; captures 390 et 1280 px, clair et sombre, Sable et Gaboma, versées dans un nouveau dossier docs/recette/. Arrête-toi avant de publier la démo.
```

### Prompt DS-04
```text
Session S2. Lis docs/32 § 7, 11 et 12, ANTSIA/docs/contrats/CONVERSATION-CONTEXTUELLE-V1.md, docs/recette/deux-comptes-2026-10-19.
Sur le backend local seulement : demande l'accord, puis ouvre la politique contextuelle de DIASPORALE (contextualMessaging/operator.setPolicy) et crée une équipe de modération France par la console locale.
Joue avec deux comptes fictifs : demande de service → conversation (voix de page, adresse refusée en voix de personne, admise en voix de page), mentorat accepté, candidature présélectionnée, fil clos au retrait ; signalement → décision motivée → recours ; avis publié → réponse de page.
Corrige dans le dépôt DIASPORALE ou convex/modules/diaspora/ ; tout défaut ailleurs devient une issue [S1].
Livre : rapport daté dans docs/recette/, verify vert. Arrête-toi avant toute action sur la démonstration en ligne.
```

### Prompt DS-05
```text
Session S2. Lis le § 2 du plan 15 (« écrit mais jamais recetté »), docs/14 § 6.2 (R-G03, R-G06, R-G10 à R-G12, R-G19, R-G21), docs/21, 22, 24, 27, 28, 29, 30.
Backend local, comptes de démonstration par acteur (docs/34). Joue un parcours par ticket : DG-008, DG-010, DG-023 (concurrence sur la dernière place, QR, galerie, iCal importé), DG-024 b, pilote après un passage des agrégats, R-G03, R-G19.
Pour chaque défaut : test qui échoue, correctif, test vert. Fichiers events/pageEvent*.ts : issue [S1], pas de modification.
Livre : docs/recette/moteur-<date>/RAPPORT.md, fait ou non fait par parcours, captures sans donnée réelle. Verify vert. Arrête-toi avant toute publication.
```

### Prompt DS-06
```text
Session S2. Lis le cahier § 7 et § 20, ANTSIA/convex/modules/diaspora/seed.ts, ANTSIA/convex/modules/networks/networks.ts (create), apps/admin_antsia_ga/src/components/console-dashboard.tsx, ADR-0038, REPRISE § 3 et § 8.4.
Écris docs/36_MISE_EN_PRODUCTION.md : étapes ordonnées, du réseau créé par la console à la version servie vérifiée, avec retour arrière. Noms de variables seulement, aucune valeur, aucun identifiant de déploiement.
Ajoute dans @diasporale/domain une fonction testée qui rend le JSON de facette à coller dans la console.
Vérifie : verify vert. N'exécute aucune commande vers un déploiement. Le document se termine par la liste des décisions du propriétaire.
```

## 10. Sources lues

- Brief commun ; dossier de reprise § 2, 7, 8.4, 9, 10.2, 11, 13 (`ECOSYSTEMES/REPRISE_ANTSIA_2026-11-09.md`).
- DIASPORALE : `CLAUDE.md`, `docs/00`, `01` (encart et titres PD0 à PD10), `03`, `13` (§ 2), `14` (en entier), `17` (§ 1 à 4), `18_EXECUTION_VAGUE_G`, `32` (en entier), `33`, `docs/recette/{couleurs-par-famille-2026-11-03, charte-v4-2026-11-02, demo-en-ligne-2026-10-22}`.
- ANTSIA : `docs/adr/0027`, `docs/adr/0038`, `docs/14_COMPLEMENT_IDENTITE_DIASPORALE_PD4.md`, `docs/contrats/` (liste).
- Programme : `DOCUMENTATION/RESEAUX_SOCIAUX/00_PLAN_…` (lignes DIASPORALE), annexe C (l'essentiel, pistes).
- Vault `10-PROJETS/diasporale/` : `fiche.md` (début), `avancement.md`, `contexte-actif.md`, liste de `decisions/`. Mémoire : `couleurs-par-famille-diasporale.md`, `MEMORY.md`.
- Code : `D:apps/diasporale_com/src/{app, components, data, lib/routes.ts, screens}` ; `D:packages/diasporale-domain/src` ; `D:packages/diasporale-features/src/{components, data, demo, primitives, i18n}` ; `A:convex/modules/diaspora/` (liste des fonctions de 43 fichiers) ; `A:convex/modules/events/pageEvent*.ts` ; `A:convex/crons.ts` ; `A:convex/modules/networks/networks.ts` ; `A:packages/ui/src/themes/diasporale*.css` ; `A:apps/admin_antsia_ga/src/components/console-dashboard.tsx`.
