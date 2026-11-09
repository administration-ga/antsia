# Plan 07 — Pages, groupes et évènements

> Constaté par lecture du code d'`origin/main` (ANTSIA `26741caa`, DIASPORALE `bead76d`), le 9 novembre 2026. Rien n'a été exécuté.
> Applications de référence : Pages, Groupes et Évènements de Facebook ; Pages de LinkedIn ; Communautés et Chaînes de WhatsApp ; Discord ; Meetup ; Eventbrite. Comparaison faite de mémoire (état des produits à la mi-2026), non revérifiée en ligne.

Chemins : relatifs au dépôt ANTSIA, sauf ceux préfixés `DIASPORALE:`. Vocabulaire : une **page** est la présence publique d'une activité ; un **signataire** est une personne habilitée à parler au nom d'une page ; un **groupe thématique** est un lieu de publication autour d'un thème (distinct des discussions de groupe d'iCom) ; un **cliquet** est un test d'architecture qui casse si une règle est violée.

## 1. L'intention du propriétaire

- **Une page par activité.** Pour le public, un business, une association ou un média est UNE page qui porte l'identité (nom, logo, badge calculé, Suivre, Écrire, publications, abonnés) et active des espaces métier ; jamais deux identités concurrentes (ADR-0034 décision 1 ; ADR-0035 D02 ; étude sept univers § 7.1 et § 7.4).
- **Vocabulaire** : compte = la vie sociale d'une personne ; page = une activité et sa communication ; boutique = la vente ; page-boutique = une présentation, pas un objet (mémoire `marketplace-ventes-privees.md`).
- **Natures** : institution, association, entreprise, média, communauté ; la confiance (`official`, `verified`, `community`) se pose par décision tracée, jamais par le signataire ; une page officielle n'est pas revendicable (cahier EXF-AN-16, 17, 18, 48).
- **Groupes et évènements** font partie du pilier divertissement, celui qui fait revenir chaque jour (ADR-0035 D01). Le cahier veut des groupes découvrables avec mur, rôles, invitations, épingles, et des évènements avec agenda, invitations, réponses, iCal, annonce, plus capacité, liste d'attente et QR (EXF-AN-19, EXF-AN-20).
- **Cérémonies et sorties** (étude § 5.7) : page d'évènement, jauge, billets à code, organisateur vérifié ; la billetterie payante attend un prestataire de paiement (ADR-0035 D04).
- **Page d'entreprise premium** : « statistiques, équipe, assistance », revenu B2B étiqueté ; jamais de badge payant ni de classement payé caché (EXF-AN-52 ; étude § 14).
- **Déjà refusé ou cadré** : la lecture anonyme reste limitée aux pages officielles, sans élargir `publicPageEligible` (ADR-0034 décision 7) ; aucun avis, compteur ou chiffre inventé (mémoire) ; les avis n'existent qu'après un engagement réel (étude § 5.7, « Avis vérifiés ») ; l'administrateur de page ou de groupe répond des contenus (ordonnance 0011 art. 11, SU01 ligne 11, lot SU01f).

## 2. Ce qui existe

| Capacité | État | Web | Mobile | Preuve |
|---|---|---|---|---|
| **Pages** | | | | |
| Créer une page (association, entreprise, média, communauté), membre vérifié, premier administrateur | Présent | oui | non | `convex/modules/pages/pages.ts` (`createPage`) ; `packages/social-features/src/features/reseau-personnel/PagesPanel.tsx` |
| Page d'institution « Officiel » créée par la console, idempotente | Présent | console | — | `convex/modules/pages/admin.ts` (`createInstitutionPage`) ; `apps/admin_antsia_ga/src/components/console-pages.tsx` |
| Identité propre (nom, sigle, description, pays) avec historique des valeurs d'avant | Présent | oui | non | `convex/modules/pages/identity.ts` ; table `pageIdentityHistory` dans `convex/modules/pages/tables.ts` |
| Présentation selon la nature (ville, type d'association, secteur d'entreprise) | Partiel | non | non | serveur : `convex/modules/pages/presentation.ts`, `packages/social-domain/src/pagePresentation.ts` ; manque : aucun champ dans `PageIdentityForm` ni dans le formulaire de création (`ProfilPagePage.tsx`, `PagesPanel.tsx`) |
| Logo et bannière sous la garde des fichiers | Présent | oui | lecture | `identity.ts` (`generatePageImageUploadUrl`, `setPageImage`) |
| Rôles : `admin` (publie et gère), `signatory` (publie) ; dernier administrateur protégé ; plafond 50 | Partiel | oui | non | `packages/social-domain/src/pages.ts` (`PAGE_ROLES`) ; manque : rôles éditeur, modérateur, analyste |
| Inviter un co-administrateur (l'habilitation est une invitation à accepter) | Partiel | oui | non | `convex/modules/pages/signatories.ts` ; manque : aucune cloche (aucun genre `page_*_invite` dans `packages/social-domain/src/notifications.ts`), seulement un bandeau |
| Transfert de propriété | Partiel | oui | non | possible en nommant un autre `admin` puis en partant (`signatories.ts`) ; manque : geste guidé, et reprise d'une page dont tous les administrateurs ont disparu (`grantPageAdmin` sans écran) |
| Suivre une page, compteur d'abonnés réel (agrégat) | Présent | oui | oui | `pages.ts` (`follow`, `unfollow`, `followerCount`) ; `apps/antsia_mobile/src/screens/page-screen.tsx` |
| Publier au nom de la page : communiqué (`public`) ou note aux abonnés (`followers`) | Présent | oui | non | `pages.ts` (`publishAsPage`) ; `PostComposer.tsx` |
| Modifier une publication de page | Partiel | non | non | serveur `pages.ts` (`editPagePost`) ; seul `DIASPORALE:apps/diasporale_com/src/data/engine-page-publications.ts` l'appelle |
| Annonce épinglée en tête du mur | Partiel | non | non | serveur `pages.ts` (`setPagePinnedPost`, `pagePinnedPost`) ; écran seulement dans DIASPORALE |
| Onglets Photos et Vidéos de la page | Partiel | non | non | serveur `pages.ts` (`pageMediaPosts`) ; écran seulement dans DIASPORALE (`DIASPORALE:docs/24_PHOTOS_VIDEOS_DES_PAGES.md`) |
| Publications programmées | Absent | — | — | cherché : `scheduledAt`, `publishAt`, `programm` dans `convex/modules/posts`, `pages` (seul `editorial` en a) |
| Boîte de réception de la page | Partiel | via boutique | non | seulement le canal commercial d'une boutique (`convex/modules/commercialMessaging/tables.ts`, clé `shopId`) et la conversation contextuelle (`convex/modules/contextualMessaging/contract.ts`, répondant `pageId`) ; aucun « Écrire à la page » générique |
| Bouton d'action configurable | Absent | — | — | cherché : `callToAction`, `actionButton`, `primaryAction` (seulement dans `packages/social-domain/src/commerce/`) |
| Horaires et coordonnées | Partiel | non | non | ville seulement ; `tables.ts` interdit adresse et contact (« sans adresse ni coordonnée de contact ») ; les horaires existent pour les boutiques (`convex/modules/shops/rules.ts`, plan 08) |
| Avis sur une page | Fermé (DIASPORALE seul) | non | non | `convex/modules/diaspora/serviceReviewsTables.ts`, liés à une réservation de service, réseau DIASPORALE seulement |
| Statistiques d'audience | Absent | — | — | cherché : `insight`, `pageStats`, `statistiques`, `impression`, `viewCount` ; seuls `followerCount` et `postCount` existent |
| Vérification par revendication avec pièces | Partiel | demande oui | non | `convex/modules/pages/claims.ts` ; manque : aucune file de décision dans `apps/antsia_ga` ni dans la console (`decidePageClaim` appelé seulement par `DIASPORALE:apps/diasporale_com/src/data/engine-page-admin.ts`) |
| Console : confiance, adresse, administrateur de secours | Partiel | console | — | `admin.ts` (`setPageTrust`, `setPageHandle`, `grantPageAdmin`) ; `console-pages.tsx` n'offre que créer, lister, retirer |
| Pages liées (même entité) | Absent | — | — | cherché : `linkedPage`, `parentPageId`, `relatedPage` |
| Annuaire, recherche serveur, filtre par pays | Présent | oui | oui | `pages.ts` (`paginateDiscover`) ; `apps/antsia_mobile/src/screens/association-directory-section.tsx` |
| Filtres d'annuaire par nature, type, secteur | Partiel | non | non | serveur `paginateDiscover` accepte `ownerKind`, `associationType`, `sector` ; `PagesPanel.tsx` ne les propose pas |
| Page qui vend : présentation boutique ou page-boutique | Présent | oui | oui | `apps/antsia_ga/src/components/shops/page-commerce.tsx` ; `convex/modules/pages/shopPages.ts` (plan 08) |
| Lecture sans compte | Fermé (décision) | officielles | — | `convex/modules/public/access.ts` (`publicPageEligible` exige `trust === "official"`) ; ADR-0034 décision 7 |
| Rappels des pages suivies dans iCom | Présent | oui | — | `convex/modules/pages/followedUpdates.ts` ; `packages/social-features/src/features/messagerie/IcomPublicReminders.tsx` |
| Recours d'une page contre une décision de modération | Présent | oui | — | `apps/antsia_ga/src/components/page-moderation-decisions.tsx` |
| Page d'entreprise premium | Absent | — | — | cherché : `premium`, `subscription` hors commerce ; seul le cahier en parle |
| **Groupes thématiques** | | | | |
| Créer, rejoindre librement, quitter ; découverte par recherche et pays | Présent | oui | non | `convex/modules/thematicGroups/thematicGroups.ts` ; `GroupsPanel.tsx` |
| Confidentialité public, privé, caché | Partiel | — | — | une seule formule : fiche visible de tout le réseau, publications réservées aux membres (clé `groupsPanel.create.visibility`) |
| Demandes d'adhésion et questions | Absent | — | — | cherché : `joinQuestion`, `joinRequest`, `membershipQuestion`, « demande d'adhésion » dans `thematicGroups` |
| Rôles propriétaire, modérateur, membre | Présent | oui | non | `packages/social-domain/src/thematicGroups.ts` |
| Invitations entre relations, avec cloche | Présent | oui | non | `thematicGroups.ts` (`invite`, `respondInvite`) ; genre `thematic_group_invite` |
| Mur, une épingle, retrait d'une publication | Présent | oui | non | `thematicGroups.ts` (`groupWall`, `pinGroupPost`, `removeGroupPost`) |
| Validation des publications avant parution | Absent | — | — | cherché : `postApproval`, `pendingApproval`, `requiresApproval` |
| Règles du groupe | Absent | — | — | cherché : `groupRules`, `rulesText`, « règles du groupe » |
| Sujets, fichiers, sondages, membres mis en avant, sous-groupes | Absent | — | — | cherché : `topic`, `poll`, `sondage`, `subgroup`, `parentGroupId`, `featured` |
| Fermer, archiver, supprimer un groupe | Partiel | non | non | serveur `closeGroup`, `archiveGroup`, `deleteGroup` ; aucun appelant (`docs/04_RAPPORT_PARITE_FRONT.md` le confirme) |
| Groupe d'adhérents lié à une page | Fermé (DIASPORALE seul) | non | non | `convex/modules/diaspora/associationGroups.ts` (`assertDiasporaNetwork`) |
| Adhésions d'association (demande, décision, rôles) | Fermé (DIASPORALE seul) | non | non | `convex/modules/diaspora/associations.ts` |
| Chaînes de diffusion à sens unique | Absent | — | — | le plus proche : note aux abonnés d'une page et rappels iCom ; cherché `broadcastChannel`, `channelId`, « chaîne » |
| **Évènements** | | | | |
| Créer un évènement personnel (titre, lieu, dates, fuseau) | Présent | oui | non | `convex/modules/events/events.ts` (`create`) ; `EvenementsPanel.tsx` |
| Modifier un évènement personnel | Absent | — | — | `events.ts` n'exporte que `create`, `invite`, `respond`, `cancel`, `announce` |
| Inviter des relations | Partiel | oui | non | `events.ts` (`invite`, un identifiant par appel) ; manque : invitations en nombre |
| Répondre : j'y vais, non, peut-être | Partiel | oui | non | serveur accepte `maybe` (`packages/social-domain/src/events.ts`) ; l'écran n'a que Accepter et Refuser |
| « Intéressé » public, sans invitation | Absent | — | — | aucun évènement découvrable sans invitation |
| Annonce dans le fil, carte relue à chaque lecture | Présent | oui | — | `events.ts` (`announce`) ; `convex/modules/events/card.ts` ; `AnnounceEventDialog.tsx` |
| Annulation et résolution des invitations par lots | Présent | oui | non | `events.ts` (`cancel`, `resolveInvitationsOnCancel`) |
| Agenda personnel paginé, qui dit sa lacune | Présent | oui | non | `events.ts` (`myAgenda`, `paginateMyAgenda`) ; `AgendaPagination.tsx` |
| Évènement en ligne | Absent | — | — | cherché : `meetingUrl`, `onlineUrl`, `isOnline` dans `events` ; lieu en texte libre |
| Co-organisateurs | Absent (personnel) | — | — | `organizerPersonId` unique ; les évènements de page sont co-gérés par les signataires (DIASPORALE seul) |
| Évènements récurrents | Absent | — | — | cherché : `recurr`, `rrule`, `RRULE` dans `events` |
| Discussion de l'évènement | Absent | — | — | ni mur ni commentaires propres ; seulement ceux de la publication d'annonce |
| Évènement organisé par une page | Fermé (DIASPORALE seul) | non | non | `convex/modules/events/pageEvents.ts` (`assertDiasporaNetwork`, pages `association`) |
| Capacité, liste d'attente FIFO, date limite | Fermé (DIASPORALE seul) | non | non | `pageEvents.ts`, `pageEventRegistrations.ts` |
| Rappel J-1 facultatif | Fermé (DIASPORALE seul) | non | non | `pageEventReminders.ts` |
| Billet QR et pointage par un responsable | Fermé (DIASPORALE seul) | non | non | `pageEventAttendance.ts` |
| Galerie après l'évènement | Fermé (DIASPORALE seul) | non | non | `pageEventGallery.ts` |
| Export iCal | Fermé (DIASPORALE seul) | non | non | `pageEventCalendar.ts` ; format pur `packages/social-domain/src/icalendar.ts` ; aucun export pour l'évènement personnel |
| Inscription avec formulaire | Absent | — | — | cherché : `registrationForm`, `questions`, `customField` dans `events` |
| Découverte des évènements (cette semaine, par province) | Absent | — | — | aucune requête de découverte dans `events` |
| Modération des évènements | Présent | — | — | `moderateContentWrite` dans `events.ts`, `moderatePageContentWrite` dans `pageEvents.ts` |
| Billetterie payante | Fermé | — | — | paiements fermés (plan 10, ADR-0035 D04) |
| Groupes et évènements dans l'application mobile | Absent | — | non | aucun `thematicGroups` ni `modules.events` sous `apps/antsia_mobile/src` |

**Décompte** : 19 Présent, 16 Partiel, 19 Absent, 10 Fermé (8 fermés « DIASPORALE seul », 2 par décision ou porte).

### Ce qui est écrit mais jamais recetté en réel

- **Pages** : la création n'a jamais été éprouvée au navigateur (compte de développement à adhésion déclarée, `docs/04_RAPPORT_PARITE_FRONT.md`, 15/10) ; la recette à deux vraies identités en production n'a jamais eu lieu (dossier de reprise § 10.1, 9/11). Revendications, invitations à signer et retrait : non recettés.
- **Groupes et évènements personnels** : tests du moteur seulement ; aucun rapport de recette sous `docs/recette/` ne les couvre.
- **Évènements de page de DIASPORALE** (capacité, attente, rappels, QR, galerie, iCal) : écrits « sans test ni recette » selon `DIASPORALE:docs/21` à `29` (18/10) ; les tests existent depuis dans `convex/modules/events/*.test.ts` et le dernier `verify` complet connu est vert au 2/11 (dossier de reprise § 2.3). Écrans « évènement, groupe » jamais vus avec les couleurs, bouton « billet QR » à trancher (dossier de reprise § 10.2). Caméra et pointage multi-comptes : non recettés.

## 3. Comparaison avec les applications de référence

Légende : oui ; non ; — = non affirmé (incertain ou sans objet).

| Capacité | Facebook | LinkedIn Pages | WhatsApp | Discord | Meetup | Eventbrite | ANTSIA | Verdict |
|---|---|---|---|---|---|---|---|---|
| Rôles de page différenciés (admin, éditeur, modérateur, analyste) | oui | oui | — | oui (rôles) | oui (co-organisateurs) | oui | admin, signataire | À adapter : ajouter modérateur et éditeur, sans droits nouveaux sur les badges |
| Invitation d'un co-administrateur avec acceptation | oui | oui | — | — | oui | oui | oui, sans cloche | À faire : cloche |
| Messagerie de la page | oui | oui | oui (compte pro) | — | oui | — | boutique seulement | À adapter : plan 01 (conversation contextuelle) |
| Publications programmées | oui | oui | non | non | — | — | non | À faire (P2) |
| Bouton d'action configurable | oui | oui | — | — | — | — | non | À adapter : actions adossées à une capacité réelle seulement |
| Horaires et coordonnées publiques | oui | oui | oui (compte pro) | — | — | — | ville | À adapter : facultatif, décision n° 6 |
| Avis ou recommandations | oui | non | non | non | — | — | non | Écarté hors engagement réel (décision n° 7) |
| Statistiques d'audience | oui | oui | — | oui | — | oui | non | À faire : base gratuite, détail premium |
| Badge de vérification payant | oui (abonnement) | — | oui (abonnement) | — | — | — | non | Écarté : badge jamais payant |
| Page premium | — | oui | — | oui (abonnement de serveur) | oui (abonnement d'organisateur) | oui (formules) | non | À faire sous porte (P3) |
| Groupes publics, privés, cachés | oui | — | — | oui | oui | — | une formule | À adapter (décision n° 3) |
| Questions d'adhésion et validation | oui | — | oui (approbation) | oui (filtrage) | oui | — | non | À faire |
| Validation des publications | oui | — | oui (admins seuls) | — | — | — | non | À faire (facultative) |
| Règles affichées | oui | — | — | oui | oui | — | non | À faire (rejoint SU01f) |
| Sujets, annonces, fichiers, sondages | oui | — | annonces, sondages | salons, annonces | — | — | une épingle | À adapter : sondages au plan 02 |
| Sous-groupes ou communauté de groupes | — | — | oui (Communautés) | salons | — | — | non | Écarté au pilote |
| Chaîne de diffusion à sens unique | — | — | oui (Chaînes) | salon d'annonces | — | — | note aux abonnés | Déjà fait sous forme de page (voir § 4.4) |
| Évènement en ligne ou sur place | oui | oui | oui | oui | oui | oui | sur place | À adapter : rattacher une conférence ANTSIA (plan 04) |
| Co-organisateurs | oui | — | — | — | oui | oui | page seulement | À faire par la page |
| Évènements récurrents | oui | — | — | oui | oui | oui | non | Reporté (P3) |
| « Intéressé » et « J'y vais » | oui | — | — | oui (intéressé) | oui | — | invitation seule | À faire avec la découverte |
| Discussion d'évènement | oui | — | oui (groupe) | oui | oui | non | non | À faire |
| Invitations en nombre | oui | oui | — | — | oui | oui | une à une | À faire |
| Ajout au calendrier | oui | — | — | — | oui | oui | page seulement | À faire pour tous |
| Inscription avec questions | — | — | — | — | oui | oui | non | À faire (P2) |
| Capacité et liste d'attente | — | — | — | — | oui | oui | DIASPORALE seul | À remonter dans le moteur |
| Billet à code et contrôle d'entrée | — | — | — | — | — | oui | DIASPORALE seul | À remonter (gratuit) ; payant au plan 10 |
| Rappels avant l'évènement | oui | — | — | oui | oui | oui | DIASPORALE seul | À remonter |
| Photos après l'évènement | oui | — | — | — | oui | — | DIASPORALE seul | À remonter |
| Découverte des évènements proches | oui | — | — | — | oui | oui | non | À faire (P2) |

## 4. Ce qui manque

### 4.1 Bloquant avant l'ouverture au public

1. **Personne ne peut décider une revendication** dans ANTSIA : la demande existe, la file non. Le badge « Vérifié » d'une page est donc inatteignable hors console DIASPORALE.
2. **La console ne sait pas reprendre une page** : poser la confiance, corriger l'adresse, nommer un administrateur de secours (fonctions présentes, sans écran). Une page dont l'unique administrateur a effacé son compte reste sans gardien.
3. **Outils de l'administrateur de groupe incomplets** au regard de l'article 11 : ni fermeture, ni archivage, ni règles affichées ; la notification de l'administrateur relève de SU01f (plan 12).
4. **Cloche des invitations à signer et des décisions de revendication** absente : une personne habilitée ne le sait que si elle ouvre la page.

### 4.2 Attendu par les utilisateurs

- Évènements de page (capacité, attente, rappel, billet, galerie, iCal) **pour tous les réseaux et toutes les natures de page**, pas seulement les associations de DIASPORALE.
- Évènement personnel : modifier, « Peut-être », inviter plusieurs relations d'un coup, ajouter à son calendrier.
- Gestion de page complète sur antsia.ga : présentation selon la nature, modifier une publication, annonce épinglée, Photos et Vidéos, filtres d'annuaire. Tout existe au serveur et dans DIASPORALE.
- Groupes : demandes d'adhésion avec questions, groupe à fiche discrète, règles, validation facultative des publications, transfert du rôle de propriétaire.
- Rôles de page modérateur et éditeur.
- Mobile : groupes et évènements absents.

### 4.3 Différenciant pour ANTSIA

- **Faible débit** : billet QR lisible hors réseau une fois affiché, saisie manuelle du code en secours (déjà dans DIASPORALE) ; fichier iCal sans image ; rappels groupés.
- **Confiance** : organisateur rattaché à une page vérifiée, jauge tenue par le serveur, annulation tracée et notifiée à chaque inscrit ; aucun « faux évènement » sans page responsable au-delà d'un seuil (étude § 5.7, risques).
- **Lien avec le commerce et l'administration** : une page d'entreprise qui organise un évènement garde sa boutique (plan 08) ; une page Officielle peut annoncer une journée portes ouvertes sans billetterie (plan 11).
- **Statistiques honnêtes** : seulement des compteurs réels, agrégés, jamais une donnée individuelle d'abonné.
- **Associations pour tous les réseaux** : adhésion volontaire, demande, décision motivée, distincte de l'abonnement (déjà construite par DIASPORALE).

### 4.4 Écarté ou reporté, et pourquoi

| Sujet | Décision | Raison |
|---|---|---|
| Badge de vérification payant | Écarté | Règle du projet : badge jamais payant |
| Avis libres sur une page | Écarté | Seulement après un engagement réel (étude § 5.7) ; une règle de modération est exigée |
| Chaîne de diffusion séparée | Écarté | La page avec sa note aux abonnés et ses rappels iCom couvre le besoin sans nouvelle identité ; toute évolution dans Messages relève du plan 01 |
| Sous-groupes | Écarté au pilote | Complexité de modération sans demande exprimée |
| Lecture sans compte des pages non officielles et des évènements | Reporté | ADR-0034 décision 7 ; un ADR nouveau serait nécessaire (décision n° 8) |
| Évènements récurrents | Reporté (P3) | Utile mais non prioritaire ; complique jauge et rappels |
| Billetterie payante, cérémonies et sorties | Plan 10 | Porte des paiements |
| Groupes de conversation | Plan 01 | Hors périmètre |
| Pages Officielles reflétées, médias | Plan 11 | Hors périmètre |
| Sondages dans les publications | Plan 02 | Type de publication commun |

## 5. Lots d'implémentation

### PG-01 — Gouvernance des pages : file des revendications, console de reprise, cloches · priorité P0 · taille M · session S1
- **Pour l'utilisateur** : le demandeur d'une vérification reçoit une décision motivée ; la personne invitée à signer en est avertie ; l'équipe peut reprendre une page abandonnée.
- **Backend** : réutiliser `claims.ts` (`paginatePageClaims`, `getPageClaim`, `decidePageClaim`) et `admin.ts` (`setPageTrust`, `setPageHandle`, `grantPageAdmin`). Ajouter deux genres de cloche dans `packages/social-domain/src/notifications.ts` : invitation à signer (sujet page, résolue à la réponse) et décision de revendication ; écrits par `convex/modules/notifications/notify.ts` seul (cliquet `notifications-writer`), sans nom de page ni texte de décision dans la charge.
- **Web** : section « Revendications de pages » dans `apps/antsia_ga/src/components/moderation/` (file paginée, fiche avec pièces servies par la garde, décision motivée) ; dans la console, onglets Confiance, Adresse, Administrateur de secours sur `console-pages.tsx`, chacun avec motif et entrée au journal (`operator-audit`). États vide, chargement, erreur.
- **Mobile** : après le web (cloche seulement).
- **Données personnelles** : pièces purgées au retrait (existant) ; fixer la durée de conservation des pièces d'une revendication tranchée (écart assumé « PA5 » du rapport 03) et l'inscrire dans l'inventaire d'effacement.
- **Tests et cliquets** : décision par un modérateur du réseau seul ; signataire de la page refusé comme décideur ; cloche dédupliquée et résolue ; `operator-audit` sur chaque geste de console ; `notification-payload-content`.
- **Critères d'acceptation** : une revendication déposée apparaît dans la file, est tranchée, la page passe `verified`, le badge calculé change, le demandeur est averti ; une page sans administrateur vivant reçoit un administrateur de secours tracé.
- **Dépend de** : plan 12 (qualité de modérateur, SU01f), plan 13 (console).
- **Porte** : publication en ligne.

### PG-02 — Gestion d'un groupe : fermer, archiver, supprimer, transférer, règles · priorité P0 · taille M · session S1
- **Pour l'utilisateur** : le propriétaire ferme ou archive son groupe, transmet son rôle avant de partir, affiche des règles que chaque membre accepte en entrant.
- **Backend** : brancher `closeGroup`, `archiveGroup`, `deleteGroup` ; ajouter `transferGroupOwnership` (propriétaire vers un modérateur vivant, l'ancien devient modérateur) ; champs `rules` (texte borné, versionné `rulesVersion`) sur `thematicGroups` et `acceptedRulesVersion` sur `thematicGroupMembers` ; débit `group.manage`.
- **Web** : écran « Gérer le groupe » dans `GroupsPanel.tsx` (règles, fermeture, archivage, suppression confirmée, transfert) ; règles montrées avant « Rejoindre ».
- **Mobile** : après le web.
- **Données personnelles** : `acceptedRulesVersion` exporté avec l'appartenance.
- **Tests et cliquets** : `GROUP_OWNER_CANNOT_LEAVE` levé après transfert ; groupe fermé refuse publication et adhésion ; suppression en cascade bornée (existante) ; i18n fr et en.
- **Critères d'acceptation** : les quatre gestes sont atteignables depuis la fiche du groupe et refusés à un modérateur ; un membre ne rejoint pas sans voir les règles en vigueur.
- **Dépend de** : SU01f (plan 12) pour le texte des règles d'utilisation.
- **Porte** : aucune.

### PG-03 — Remonter les évènements de page dans le moteur, pour tous les réseaux · priorité P1 · taille L · session S1 (avec S2)
- **Pour l'utilisateur** : toute page (association, entreprise, média, communauté, institution) organise un évènement avec jauge, liste d'attente, date limite, rappel, billet QR, galerie et fichier calendrier.
- **Backend** : copier les règles pures `event-capacity`, `event-timing`, `event-attendance`, `event-gallery` de `DIASPORALE:packages/diasporale-domain/src/` vers `packages/social-domain/src/pageEvents/` avec en-tête de provenance ; `convex/modules/diaspora/associationEventRules.ts` les réexporte (fichier de S2). Remplacer `assertDiasporaNetwork` dans `convex/modules/events/pageEvent*.ts` par une politique par réseau (nouveau champ facultatif `pageEventsEnabled` sur `networks`, dans `convex/modules/networks/tables.ts` — aucun champ de ce genre n'existe encore —, posé par la console, absent = fermé ; DIASPORALE ouvert par migration explicite) et une liste des natures admises. Étendre `pageAudience` à `followers` (abonnés de la page) en plus de `network` et `association` (cette dernière réservée aux réseaux qui ont les adhésions). Ajouter les fonctions au cliquet `network-scoped-functions`. Aucune rebaptisation des champs `page*` existants (pas de migration).
- **Web** : aucun dans ce lot (PG-04).
- **Mobile** : sans objet.
- **Données personnelles** : inchangé (participations, billets, rappels déjà couverts par `convex/modules/people/erasure.test.ts`) ; vérifier l'ajout de toute nouvelle colonne.
- **Tests et cliquets** : porter les tests `pageEvent*.test.ts` sur un réseau non DIASPORALE ; réseau dont la politique est fermée = refus indistinct ; DIASPORALE inchangé (tests existants verts) ; `no-cross-product-imports` toujours vert.
- **Critères d'acceptation** : sur le réseau racine avec la politique ouverte, une page d'entreprise crée un évènement de 20 places, la 21e personne entre en attente, un retrait promeut la première, le billet se pointe, la galerie s'ouvre à la fin.
- **Dépend de** : accord de S2 sur la propriété des règles (décision n° 2).
- **Porte** : décision du propriétaire n° 1.

### PG-04 — Évènements de page sur antsia.ga · priorité P1 · taille L · session S1
- **Pour l'utilisateur** : un onglet « Évènements » sur la page, une adresse propre par évènement à partager, s'inscrire, voir sa place ou son rang d'attente, activer le rappel, télécharger le fichier calendrier, présenter son billet ; l'équipe crée, modifie, annule, pointe et publie la galerie.
- **Backend** : PG-03.
- **Web** : routes `routes.pageEvents(handle)` et `routes.pageEvent(handle, eventId)` dans `apps/antsia_ga/src/lib/routes.ts` ; composants dupliqués (copie, en-tête de provenance) depuis `DIASPORALE:apps/diasporale_com/src/components/association-event-*.tsx` vers `packages/social-features/src/features/page-events/` (jamais d'import inter-produit) ; caméra par geste explicite, saisie manuelle en secours ; un seul bouton plein par zone ; agenda personnel enrichi des inscriptions (DTO `associationItems` déjà présent).
- **Mobile** : billet et inscription après le web (PG-12).
- **Données personnelles** : le code brut du billet ne vit qu'à l'écran ; aucune liste d'inscrits montrée hors équipe.
- **Tests et cliquets** : `no-hardcoded-urls`, `no-hardcoded-strings`, `member-screens-full-width` ; tests d'écran portés ; recette à 390, 834, 1440 px, clair et sombre.
- **Critères d'acceptation** : parcours complet à deux comptes (organisateur, participant) ; l'évènement annulé avertit chaque inscrit sans titre dans la cloche.
- **Dépend de** : PG-03 ; décision DIASPORALE sur le bouton « billet QR » (dossier de reprise § 10.2).
- **Porte** : publication en ligne.

### PG-05 — Évènement personnel complet · priorité P1 · taille M · session S1
- **Pour l'utilisateur** : modifier son évènement, répondre « Peut-être », inviter plusieurs relations à la fois, ajouter l'évènement à son calendrier, rattacher une conférence ANTSIA pour un évènement en ligne.
- **Backend** : `events.update` versionné (`expectedVersion`), dates et fuseau verrouillés dès qu'une réponse existe, comme DG-010 ; `inviteMany` (au plus 50 identifiants par appel, débit `event.invite` par invité) ; `exportIcal` personnel réutilisant `serializeCalendarEvent` ; champ facultatif `liveSessionId` (une conférence du même réseau, droits relus à la lecture).
- **Web** : `EvenementsPanel.tsx` : bouton « Peut-être », sélection multiple dans `RelationPicker`, formulaire de modification (React Hook Form + Zod), « Ajouter à mon calendrier ».
- **Mobile** : après le web.
- **Données personnelles** : le fichier iCal ne contient ni participant ni coordonnée ; aucune donnée nouvelle à effacer hors `liveSessionId`.
- **Tests et cliquets** : verrou des dates, réponse `maybe` comptée à part, invitation en nombre partiellement refusée sans oracle, iCal valide (tests de `icalendar.ts`).
- **Critères d'acceptation** : les quatre gestes visibles et fonctionnels ; un invité voit l'évènement modifié et la mention de la modification.
- **Dépend de** : plan 04 pour la conférence rattachée.
- **Porte** : aucune.

### PG-06 — Gestion de page complète sur antsia.ga · priorité P1 · taille M · session S1
- **Pour l'utilisateur** : ville, type d'association ou secteur ; modifier une publication ; épingler une annonce ; onglets Publications, Photos, Vidéos partageables ; annuaire filtré par nature et secteur.
- **Backend** : existant (`updatePageIdentity`, `editPagePost`, `setPagePinnedPost`, `pageMediaPosts`, `paginateDiscover`).
- **Web** : `ProfilPagePage.tsx` et `PagesPanel.tsx`, en reprenant les décisions de `DIASPORALE:docs/20`, `22`, `23`, `24`, `25`, `28` (version lue figée, confirmation de l'épingle, panneaux démontés hors onglet, paramètre d'adresse borné).
- **Mobile** : lecture des onglets après le web (PG-12).
- **Données personnelles** : aucune nouvelle.
- **Tests et cliquets** : conflit de version, épingle remplacée, catégorie inconnue ignorée, i18n.
- **Critères d'acceptation** : chaque fonction serveur citée a un appelant dans `apps/antsia_ga` ou `packages/social-features`.
- **Dépend de** : rien.
- **Porte** : aucune.

### PG-07 — Groupes : adhésion sur demande, questions, validation des publications · priorité P1 · taille L · session S1
- **Pour l'utilisateur** : le propriétaire choisit « ouvert » (actuel) ou « sur demande » avec jusqu'à trois questions ; il peut exiger la validation des publications ; une option « fiche discrète » si la décision n° 3 l'accepte.
- **Backend** : champs `joinPolicy` (`open`, `request`), `joinQuestions`, `postApproval` sur `thematicGroups` ; table `thematicGroupJoinRequests` (`networkId`, groupe, personne, réponses bornées, statut, décideur, dates) ; statut `pending_group_review` pour une publication de groupe, lue par l'auteur et les modérateurs seuls ; cloche aux modérateurs par lots ; débit `group.join`, `group.moderate`.
- **Web** : `GroupsPanel.tsx` : formulaire de demande, file des demandes et des publications en attente.
- **Mobile** : après le web.
- **Données personnelles** : demandes et réponses exportées et effacées ; demandes refusées purgées après une durée à fixer.
- **Tests et cliquets** : `network-scoped-functions`, `rate-limited-writes`, `no-unbounded-collect`, `notification-payload-content` ; non-membre ne lit jamais une publication en attente.
- **Critères d'acceptation** : un groupe « sur demande » n'admet personne sans décision ; une publication validée paraît, refusée reste invisible.
- **Dépend de** : PG-02.
- **Porte** : décision n° 3 pour la fiche discrète.

### PG-08 — Rôles de page : modérateur et éditeur · priorité P1 · taille M · session S1
- **Pour l'utilisateur** : l'administrateur confie la modération des commentaires et signalements sans droit de publier, ou la publication sans droit de gérer.
- **Backend** : étendre `PAGE_ROLES` (`admin`, `editor` = actuel `signatory`, `moderator`) sans renommer les lignes existantes (`signatory` reste lu comme éditeur) ; matrice dans `packages/social-domain/src/pages.ts` ; `authorityRevision` incrémenté.
- **Web** : choix du rôle dans `PageSignatories`.
- **Mobile** : après le web.
- **Données personnelles** : inchangé.
- **Tests et cliquets** : un modérateur ne publie pas ; un éditeur ne gère pas ; dernier administrateur toujours protégé.
- **Critères d'acceptation** : trois rôles visibles et respectés partout où `liveSignatoryRole` est relu.
- **Dépend de** : SU01f (outils de retrait de l'administrateur, plan 12).
- **Porte** : aucune.

### PG-09 — Associations et groupe d'adhérents pour tous les réseaux · priorité P2 · taille L · session S1 (avec S2)
- **Pour l'utilisateur** : une association d'ANTSIA reçoit des demandes d'adhésion, les décide, ouvre son groupe privé d'adhérents et des évènements réservés.
- **Backend** : même méthode que PG-03 pour `associations.ts`, `associationsTables.ts`, `associationGroups.ts` : règles copiées dans `social-domain`, politique par réseau à la place de `assertDiasporaNetwork`.
- **Web** : onglet « Adhérer » de la page d'association ; gestion des adhérents.
- **Mobile** : après le web.
- **Données personnelles** : adhésions déjà dans l'effacement ; vérifier l'export hors DIASPORALE.
- **Tests et cliquets** : DIASPORALE inchangé ; refus indistinct quand la politique est fermée.
- **Critères d'acceptation** : adhérer n'est pas suivre ; une exclusion ferme groupe et évènements réservés.
- **Dépend de** : PG-03.
- **Porte** : décision n° 1.

### PG-10 — Découverte des évènements et « Intéressé » · priorité P2 · taille M · session S1
- **Pour l'utilisateur** : « Cette semaine », « Près de moi » (province), évènements des pages suivies ; marquer « Intéressé » sans s'inscrire.
- **Backend** : index `events.by_network_status_startAt` filtré aux évènements de page d'audience `network` ou `followers` lisibles ; province reprise de la page ; réponse `interested` sans place.
- **Web** : section dans Découvrir (piliers SU02) ou volet Évènements ; aucune tuile tant que la liste est vide.
- **Mobile** : après le web.
- **Données personnelles** : « Intéressé » exporté et effacé.
- **Tests et cliquets** : `no-unbounded-collect`, lacune dite.
- **Critères d'acceptation** : seuls des évènements lisibles par le lecteur apparaissent.
- **Dépend de** : PG-03 ; plan 03 (Découvrir).
- **Porte** : aucune.

### PG-11 — Statistiques de page, honnêtes · priorité P2 · taille M · session S1
- **Pour l'utilisateur** : nouveaux abonnés par semaine, publications, réactions et commentaires reçus, inscrits aux évènements.
- **Backend** : requête réservée aux administrateurs, calculée sur les agrégats existants (`engineCounters`, `pageFollows.createdAt`, compteurs des publications) ; aucune donnée d'un abonné identifiable ; aucune vue ni impression tant qu'aucun compteur réel ne les mesure.
- **Web** : onglet « Statistiques » de la gestion de page ; « non mesuré » plutôt qu'un zéro inventé.
- **Mobile** : après le web.
- **Données personnelles** : aucune donnée nouvelle par personne.
- **Tests et cliquets** : non-administrateur refusé ; chiffres égaux aux agrégats.
- **Critères d'acceptation** : chaque chiffre affiché a sa source dans le code.
- **Dépend de** : décision n° 4.
- **Porte** : aucune.

### PG-12 — Mobile : page, groupes, évènements · priorité P2 · taille L · session S3
- **Pour l'utilisateur** : sur le téléphone, rejoindre un groupe, lire son mur, répondre à un évènement, présenter son billet, gérer sa page au minimum.
- **Backend** : aucun.
- **Mobile** : écrans dans `apps/antsia_mobile/src/screens/`, rangés sous les cinq destinations existantes (Profil ou Découvrir), sans nouvel onglet.
- **Données personnelles** : billet en mémoire d'écran seulement.
- **Tests et cliquets** : simulateur iOS à deux comptes.
- **Critères d'acceptation** : parité fonctionnelle avec PG-04 et PG-05 pour le participant.
- **Dépend de** : PG-04, PG-05 ; plan 14.
- **Porte** : publication TestFlight.

### PG-13 — Publications programmées d'une page · priorité P2 · taille M · session S1
- **Pour l'utilisateur** : un éditeur prépare un communiqué pour une date.
- **Backend** : table `pageScheduledPosts` (`networkId`, page, auteur, corps, médias admis, date) ; publication par `ctx.scheduler`, droits relus à l'échéance ; annulation possible.
- **Web** : choix « Programmer » dans `PostComposer.tsx` en mode page ; liste des programmées.
- **Données personnelles** : brouillons exportés et effacés avec l'auteur ; médias sous la garde (`fresh-upload`).
- **Tests et cliquets** : signataire révoqué avant l'échéance = rien ne paraît ; `rate-limited-writes`.
- **Critères d'acceptation** : la publication paraît à l'heure, une seule fois.
- **Dépend de** : PG-08.
- **Porte** : aucune.

### PG-14 — Discussion d'évènement · priorité P2 · taille S · session S1
- **Pour l'utilisateur** : inscrits et équipe échangent avant et après l'évènement.
- **Backend** : réutiliser le mur `posts` avec un champ `eventDiscussionId` (comme `pageEventGalleryId`), audience = inscrits et équipe, garde d'évènement avant toute exception d'auteur.
- **Web** : onglet « Discussion » du détail d'évènement.
- **Données personnelles** : publications ordinaires (déjà effacées).
- **Tests et cliquets** : une personne retirée perd la lecture.
- **Critères d'acceptation** : discussion lisible des seuls ayants droit.
- **Dépend de** : PG-04.
- **Porte** : aucune.

### PG-15 — Coordonnées, horaires et bouton d'action d'une page · priorité P2 · taille S · session S1
- **Pour l'utilisateur** : une entreprise affiche ses horaires et un bouton (« Écrire », « Voir la boutique », « S'inscrire »).
- **Backend** : champs facultatifs bornés sur `pages` selon la décision n° 6 ; bouton choisi dans une liste fermée, seulement si la capacité existe (boutique admise, évènement à venir, conversation contextuelle ouverte).
- **Web** : en-tête de `ProfilPagePage.tsx`.
- **Données personnelles** : coordonnées professionnelles de la page, jamais celles d'une personne ; historique d'identité étendu.
- **Tests et cliquets** : bouton sans capacité refusé ; aucune URL externe libre.
- **Critères d'acceptation** : aucun bouton qui mène à une fonction vide.
- **Dépend de** : décision n° 6 ; plan 01 (Écrire à la page), plan 08 (horaires des boutiques à unifier).
- **Porte** : décision du propriétaire.

### PG-16 — Page d'entreprise premium · priorité P3 · taille L · session S1
- **Pour l'utilisateur** : une entreprise souscrit des statistiques détaillées, une équipe élargie et une assistance.
- **Backend** : droit `pagePremium` posé par décision tracée liée à un contrat ou un abonnement PRO.GA ; aucun effet sur le badge, le rang `trustRank`, l'annuaire ni le fil (test de non-régression du classement).
- **Web** : mention « Page premium » seulement dans la gestion ; rien de visible pour le public qui ressemble à un badge.
- **Données personnelles** : données de facturation hors ANTSIA (PRO.GA).
- **Tests et cliquets** : cliquet neuf `premium-no-ranking` (aucune lecture du droit premium dans les tris du fil, de l'annuaire et de la recherche).
- **Critères d'acceptation** : une page premium et une page gratuite de même confiance sont classées de la même façon.
- **Dépend de** : PG-11, décision n° 5, PRO.GA (facturation).
- **Porte** : décision du propriétaire et moyen de facturation.

### PG-17 — Évènements récurrents et inscription avec questions · priorité P3 · taille M · session S1
- **Pour l'utilisateur** : une réunion mensuelle ; deux ou trois questions à l'inscription (taille de tenue, régime).
- **Backend** : série = évènements frères générés à l'avance (au plus 12), chacun avec sa jauge ; questions bornées, réponses visibles de l'équipe seule.
- **Données personnelles** : réponses exportées, effacées, purgées après l'évènement.
- **Critères d'acceptation** : annuler une occurrence n'annule pas la série.
- **Dépend de** : PG-04.
- **Porte** : aucune.

## 6. Ordre recommandé et dépendances

| Vague | Lots | Pourquoi dans cet ordre |
|---|---|---|
| 1 | PG-01, PG-02 | Bloquants : gouvernance des pages et responsabilité de l'administrateur de groupe avant toute ouverture |
| 2 | PG-06, PG-05, PG-08 | Brancher ce que le serveur sait déjà faire ; rôles nécessaires à la programmation et à la modération |
| 3 | PG-03 puis PG-04 | Le plus gros gain : les évènements riches existent déjà, il faut les ouvrir à tous les réseaux puis les montrer |
| 4 | PG-07, PG-10, PG-14 | Groupes sur demande, découverte et discussion s'appuient sur les vagues 2 et 3 |
| 5 | PG-09, PG-11, PG-13, PG-15, PG-12 | Associations pour tous, statistiques, programmation, coordonnées ; mobile après le web |
| 6 | PG-16, PG-17 | Sous condition (facturation, demande réelle) |

**Dépendances vers d'autres plans** : plan 01 (Écrire à la page, boîte de réception) ; plan 02 (sondages, publication) ; plan 03 (Découvrir pour PG-10) ; plan 04 (conférence rattachée à un évènement) ; plan 08 (boutique de la page, horaires des boutiques) ; plan 10 (billetterie payante, cérémonies et sorties) ; plan 11 (pages Officielles) ; plan 12 (SU01f : règles d'utilisation, notification de l'administrateur, modérateur) ; plan 13 (console) ; plan 14 (mobile) ; plan 15 (DIASPORALE garde ses écrans, propriété des règles d'évènements et d'associations).

**Fichiers partagés demandés à S1** : `convex/schema.ts` n'est touché que par l'agrégation des tables de modules modifiées (`pages/tables.ts`, `thematicGroups/tables.ts`, `events/tables.ts`, `networks/tables.ts`, nouvelles tables `thematicGroupJoinRequests`, `pageScheduledPosts`) ; aucun changement de `package.json`, `bun.lock`, `convex/convex.config.ts` ni `deploy/catalog.json` (la dépendance `@diasporale/domain` existe déjà et disparaît même du chemin des évènements après PG-03).

## 7. Décisions à prendre par le propriétaire

1. **Ouvrir les évènements de page à tous les réseaux et à toutes les natures de page ?** Recommandation : oui, réseau par réseau par une politique fermée par défaut. Raison : le code existe et il est testé ; seul un verrou le réserve à DIASPORALE.
2. **Qui possède les règles pures des évènements et des associations ?** Recommandation : `packages/social-domain` (moteur), DIASPORALE les réexporte. Raison : un moteur ne dépend pas d'une application ; le cliquet `no-cross-product-imports` reste net.
3. **Groupes à fiche discrète (non listés) ?** Recommandation : pas de groupe caché au pilote ; seulement « ouvert » et « sur demande ». Raison : un groupe invisible échappe au regard public et à la modération du réseau, alors que l'administrateur en répond (ord. 0011 art. 11).
4. **Statistiques de base gratuites ?** Recommandation : oui pour toutes les pages (compteurs réels) ; le détail par période et par publication pour la page premium. Raison : la transparence de base aide les associations ; le premium vend de la profondeur, pas de la visibilité.
5. **Contenu et facturation de la page premium.** Recommandation : statistiques détaillées, équipe au-delà de cinq personnes, assistance, facturés par l'abonnement PRO.GA ; aucun effet sur badge ni classement. Raison : EXF-AN-52 et règle « jamais de classement payé caché ».
6. **Coordonnées publiques d'une page (adresse, téléphone professionnel, horaires) ?** Recommandation : facultatives pour entreprises et associations, jamais pour une personne, modérées comme l'identité. Raison : utile au commerce local ; l'identification des titulaires reste privée (ADR-0035 D08).
7. **Avis sur les pages ?** Recommandation : seulement après un engagement réel (service rendu, achat reçu, billet pointé), sur le modèle DG-016 de DIASPORALE, avec réponse de la page et modération. Raison : étude § 5.7 et règle « ne rien inventer ».
8. **Partage sans compte d'un évènement public ou d'une page vérifiée ?** Recommandation : pas au pilote ; si le besoin se confirme, un ADR pour une projection publique distincte, sans toucher `publicPageEligible`. Raison : ADR-0034 décision 7.
9. **Évènement en ligne par lien externe ?** Recommandation : non ; rattacher une conférence ANTSIA. Raison : aucune URL libre non modérée, et le direct existe.

## 8. Risques et points d'attention

- **Coordination S1 et S2** : PG-03 et PG-09 touchent `convex/modules/events/pageEvent*.ts` (S1) et `convex/modules/diaspora/` (S2). Annoncer chaque modification ; les tests DIASPORALE existants doivent rester verts.
- **Champs nommés `page*` sur `eventParticipants`** : les garder tels quels ; une rebaptisation imposerait une migration de données en production.
- **Agenda borné à 200 lignes** : les participations de page partagent l'index de l'agenda personnel (`DIASPORALE:docs/21`) ; ouvrir à tous les réseaux augmente la pression ; prévoir l'index séparé signalé dans ce document.
- **Faux évènements et surréservation** : jauge serveur, page responsable, signalement ; ne pas ouvrir la création d'évènements de page aux pages `community` sans débit renforcé (`*.reinforced`).
- **Caméra** : `BarcodeDetector` n'existe pas partout ; la saisie manuelle doit rester accessible.
- **Notifications** : aucun titre, lieu ou nom dans la charge ; diffusion par lots aux inscrits.
- **Premium** : risque d'avantage déguisé ; le cliquet `premium-no-ranking` est la seule preuve acceptable.
- **Schéma strict des projections publiques** : ne jamais ajouter un champ à une projection publique existante (`CLAUDE.md`, pièges) ; publier une projection à part.

## 9. Prompts d'implémentation

### Prompt PG-01
```
Tu es la session S1 d'ANTSIA. Lot PG-01 du plan 07 (PLANS_FINALISATION_2026-11-09/07_PAGES_GROUPES_EVENEMENTS.md).
Lis d'abord : CLAUDE.md du dépôt ; docs/00_CAHIER (EXF-AN-16, 17) ; docs/03_RAPPORT_PARITE_BACKEND.md (lot 13) ;
convex/modules/pages/{claims,admin,signatories}.ts ; packages/social-domain/src/notifications.ts ;
convex/modules/notifications/notify.ts ; apps/antsia_ga/src/components/moderation/ ; apps/admin_antsia_ga/src/components/console-pages.tsx.
Périmètre : ces fichiers, leurs tests, les i18n fr/en concernées, apps/antsia_ga/src/lib/routes.ts.
Livre : (1) une section « Revendications de pages » dans l'écran de modération (file paginée, fiche, pièces par la garde, décision motivée) ;
(2) dans la console, Confiance, Adresse, Administrateur de secours, chacun motivé et journalisé ;
(3) deux genres de cloche (invitation à signer, décision de revendication) sans contenu dans la charge.
Vérifie : bun run verify vert ; recette navigateur à 390, 834, 1440 px, clair et sombre, avec un compte modérateur et un demandeur.
Arrête-toi et demande l'accord avant toute publication en ligne et avant de fixer la durée de conservation des pièces.
```

### Prompt PG-02
```
Session S1 d'ANTSIA, lot PG-02 du plan 07.
Lis : convex/modules/thematicGroups/{thematicGroups,tables,access}.ts ; packages/social-domain/src/thematicGroups.ts ;
packages/social-features/src/features/reseau-personnel/GroupsPanel.tsx et groupes-thematiques.ts ; docs/etudes/2026-10-21-sept-univers-et-vie-publique/SU01_CONFORMITE_ORDONNANCE_0011.md (ligne 11, A7).
Périmètre : ces fichiers, leurs tests, i18n fr/en du groupe.
Livre : écran « Gérer le groupe » (règles versionnées, fermer, archiver, supprimer avec confirmation, transférer la propriété) ;
fonction transferGroupOwnership ; champs rules, rulesVersion, acceptedRulesVersion ; règles montrées avant de rejoindre.
Vérifie : bun run verify ; un modérateur ne voit aucun de ces gestes ; recette trois largeurs, deux thèmes.
Demande l'accord avant publication.
```

### Prompt PG-03
```
Session S1 d'ANTSIA, lot PG-03 du plan 07, en coordination avec S2 (DIASPORALE).
Préalable : décisions n° 1 et 2 du plan 07 prises par écrit par le propriétaire. Sinon, arrête-toi.
Lis : convex/modules/events/pageEvent*.ts et tests ; convex/modules/diaspora/{associationEventRules,facts}.ts ;
DIASPORALE:packages/diasporale-domain/src/event-{capacity,timing,attendance,gallery}.ts ; DIASPORALE:docs/21 à 30 ;
tests/ratchets/ (no-cross-product-imports, network-scoped-functions).
Périmètre : packages/social-domain/src/pageEvents/ (nouveau, copies avec en-tête de provenance), convex/modules/events/,
convex/modules/networks/tables.ts (champ facultatif pageEventsEnabled, absent = fermé) ; convex/modules/diaspora/associationEventRules.ts seulement après accord de S2.
Livre : règles pures dans le moteur ; politique par réseau à la place d'assertDiasporaNetwork ; audience followers ;
tests portés sur un réseau non DIASPORALE ; DIASPORALE strictement inchangé côté comportement.
Interdit : renommer les champs page* ; toucher deploy/catalog.json ou package.json.
Vérifie : bun run verify vert dans ANTSIA ET dans DIASPORALE. Demande l'accord avant toute publication du backend.
```

### Prompt PG-04
```
Session S1 d'ANTSIA, lot PG-04 du plan 07, après PG-03 fusionné.
Lis : DIASPORALE:apps/diasporale_com/src/components/association-event*.tsx et leurs tests ;
packages/social-features/src/features/reseau-personnel/{ProfilPagePage,EvenementsPanel,AssociationAgendaCard}.tsx ;
apps/antsia_ga/src/lib/routes.ts ; mémoire du propriétaire (un seul bouton plein par zone, pleine largeur, rien d'inventé).
Périmètre : packages/social-features/src/features/page-events/ (copies avec provenance, aucun import de DIASPORALE),
apps/antsia_ga/src/app/(membre)/page/[handle]/evenements/, routes.ts, i18n fr/en.
Livre : onglet Évènements de la page, détail à adresse propre, inscription, attente, rappel, iCal, billet QR, pointage, galerie,
création et modification par l'équipe ; états vide, chargement, erreur.
Vérifie : bun run verify ; recette à deux comptes, trois largeurs, deux thèmes ; caméra refusée = saisie manuelle.
Demande l'accord avant publication.
```

### Prompt PG-06
```
Session S1 d'ANTSIA, lot PG-06 du plan 07.
Lis : convex/modules/pages/{pages,identity,presentation}.ts ; packages/social-domain/src/pagePresentation.ts ;
packages/social-features/src/features/reseau-personnel/{ProfilPagePage,PagesPanel}.tsx ;
DIASPORALE:docs/20, 22, 23, 24, 25, 28 (décisions d'écran à reprendre, pas de code à importer).
Périmètre : ProfilPagePage.tsx, PagesPanel.tsx, leurs modules purs et tests, i18n fr/en.
Livre : champs ville, type, secteur à la création et en gestion ; modifier une publication (version figée) ; annonce épinglée confirmée ;
onglets Publications, Photos, Vidéos avec paramètre d'adresse borné ; filtres d'annuaire nature, type, secteur.
Critère : editPagePost, setPagePinnedPost, pageMediaPosts et les filtres de paginateDiscover ont un appelant dans ANTSIA.
Vérifie : bun run verify ; recette trois largeurs, deux thèmes. Demande l'accord avant publication.
```

## 10. Sources lues

- **Documents** : `docs/00_CAHIER_DES_CHARGES_ANTSIA.md` (EXF-AN-16 à 20, 47 à 52, lot A6) ; `docs/adr/0034`, `0035` ; `docs/etudes/2026-10-21-sept-univers-et-vie-publique/ETUDE_SEPT_UNIVERS_ANTSIA.md` (§ 5.7, 7, 14, 15) et `SU01_CONFORMITE_ORDONNANCE_0011.md` ; `docs/etudes/2026-10-20-experience-sociale-responsive/02_NOMS_ET_MICROTEXTES.md` ; `docs/03_RAPPORT_PARITE_BACKEND.md` (lots 7, 9, 12a, 13) ; `docs/04_RAPPORT_PARITE_FRONT.md` (F2) ; `docs/recette/` (liste, `refonte-vague1-2026-10-18`).
- **DIASPORALE** : `docs/20` à `29` (gestion des publications, groupes et évènements DG-010, capacités, annonces épinglées, présentation, rappels, photos et vidéos, annuaire, avis, QR, galerie, rubriques, iCal).
- **Programme** : annexes A et B de `DOCUMENTATION/RESEAUX_SOCIAUX/` (pages, groupes thématiques, évènements du socle).
- **Reprise et mémoire** : `REPRISE_ANTSIA_2026-11-09.md` § 2, 9, 10, 11 ; mémoire `marketplace-ventes-privees.md` et index `MEMORY.md` ; vault `10-PROJETS/antsia/` (`avancement.md`, `maquettes-ecarts.md`).
- **Code ANTSIA** : `convex/modules/{pages,thematicGroups,events,public,commercialMessaging,contextualMessaging,diaspora}` ; `convex/lib/rateLimit.ts` ; `packages/social-domain/src/{pages,pagePresentation,events,thematicGroups,icalendar,notifications}.ts` ; `packages/social-features/src/features/reseau-personnel/` (PagesPanel, ProfilPagePage, GroupsPanel, EvenementsPanel, AnnounceEventDialog, AssociationAgendaCard) ; `packages/social-features/src/shell/reseau-menu.ts` ; `apps/antsia_ga/src/{app/(membre)/page,app/(membre)/groupes,app/(membre)/evenements,app/(public)/pages,components/reseau,components/page-moderation-decisions.tsx,components/shops/page-commerce.tsx,lib/routes.ts}` ; `apps/admin_antsia_ga/src/components/console-pages.tsx` ; `apps/antsia_mobile/src/screens/{page-screen,association-directory-section}.tsx`, `apps/antsia_mobile/src/lib/native-pages.ts`.
- **Code DIASPORALE** : `packages/diasporale-domain/src/` (événements, associations, avis) ; `apps/diasporale_com/src/components/association-event-*.tsx`, `page-reviews-section.tsx` ; `apps/diasporale_com/src/data/engine-*.ts`.
