# Plan 12 — Modération, conformité et sécurité des personnes

> Constaté par lecture du code d'`origin/main` (ANTSIA `26741caa`, DIASPORALE `bead76d`), le 9 novembre 2026. Rien n'a été exécuté.
> Applications de référence : Facebook et Instagram (signalement, recours, état du compte, supervision parentale, étiquettes d'IA), TikTok (sécurité des mineurs, liaison familiale), YouTube (avertissements gradués), X (notes de la communauté), Discord (modération automatique). Repère de bonne pratique : les obligations de transparence de type européen (rapports, motifs de décision), qui ne sont pas du droit gabonais. Comparaison faite de mémoire (état des produits à la mi-2026), non revérifiée en ligne.
> Ce plan n'est pas un avis juridique. Les articles sont cités tels que l'analyse SU01 les lit. Chaque point marqué **[A1]** à **[A12]** attend l'arbitrage écrit d'un juriste (SU01, § 3).

## 1. L'intention du propriétaire

- **Le premier service rendu est la confiance** : étiquettes calculées, vie publique séparée de la promotion, conformité visible (ADR-0035, conséquences). La modération est une condition du pilier « vie publique » et du pilier « business » (arnaques, faux emplois, faux biens : étude des sept univers § 2.2 et § 17).
- **Conforme dès la conception** (décision D08, ADR-0035) : chaque lot démontre sa conformité à l'ordonnance n° 0011/PR/2026, aux ordonnances 0012 et 0013, et à la loi n° 025/2023. L'analyse `SU01_CONFORMITE_ORDONNANCE_0011.md` fixe les exigences, les arbitrages A1 à A12 et les sous-lots SU01a à SU01j.
- **Modération nationale à l'échelle** dès le cahier : signalements polymorphes avec masquage pour le déclarant, équipes, décisions motivées, sanctions graduées avec durée, recours, journal, rapport périodique, relecture configurable, mots bloqués, détection simple de spam, limitation de débit (EXF-AN-28 à 30, EXF-AN-51). Le risque « modération d'un réseau national » se traite par des équipes avant l'ouverture (cahier § 19).
- **Ordre d'ouverture fixé** : SU01a, SU01b, la déclaration d'âge de SU01c, SU01d et SU01h précèdent toute ouverture publique d'un nouvel univers et l'annonce de particulier ; SU01i précède l'iAsted du membre (SU01, § 4).
- **Déjà décidé** : délais posés à la transmission, 72 h pour tout harcèlement, 24 h pour l'hypertrucage et les contenus d'IA interdits ; le déclarant n'apprend que l'effet sur le contenu, jamais la sanction ni le motif écrit (vault, décision du 21/10/2026). La transparence ne publie aucune cohorte sous 5 et jamais la base ; « 100 % tenus » ne s'affiche jamais (décision du 22/10/2026). La console admet une session IDN de niveau 1 (ADR-0039, qui remplace le niveau 2 de l'ADR-0011).
- **Refusé ou fermé** : aucun corps de contenu copié dans un dossier (ADR-0009, § 1) ; rencontres fermées sans preuve de majorité ; NIP non collecté [A5] ; SU01b et SU01c attendent les arbitrages A1 à A4.

## 2. Ce qui existe

Chemins relatifs au dépôt ANTSIA. « Web » = antsia.ga ou la console ; « Mobile » = `apps/antsia_mobile`.

| Capacité | État | Web | Mobile | Preuve |
|---|---|---|---|---|
| Signaler une publication | Présent | oui | oui | `packages/social-features/src/features/reseau-personnel/PostCard.tsx`, `apps/antsia_mobile/src/screens/post-actions.tsx` |
| Signaler un commentaire | Présent | oui | non | `PostCard.tsx` (`reportComment`) |
| Signaler un article ou un média de presse | Présent | oui | non | `apps/antsia_ga/src/components/editorial/article-social-actions.tsx` |
| Signaler un profil professionnel ou une demande de collaboration | Présent | oui | non | `apps/antsia_ga/src/components/professionals/profile-fields.tsx` |
| Signaler un message commercial ou contextuel | Présent | oui | non | `packages/social-features/src/features/messagerie/{commercial,contextual}-messaging-source.ts` |
| Signaler un profil, une page, un évènement, un direct, une Story, un album, une offre, une vitrine, un poste, un avis, un message de groupe | Partiel | non | non | Le serveur accepte ces cibles (`convex/modules/moderation/tables.ts`, `moderationTargetValidator`) ; aucun appel à `cases.report` hors des cinq surfaces ci-dessus ; aucune clé « Signaler » dans `stories.json`, `direct.json`, `reseau.profil.json`, `reseau.pages.json`, `reseau.groupes.json` |
| Signaler un groupe thématique ou un message personnel d'iCom | Absent | non | non | Ni `thematicGroup` ni `personalMessage` dans `moderationTargetValidator` ; cherché : `thematicGroup`, `personalMessage`, `reportMessage` dans `convex/modules/{moderation,messaging,thematicGroups}` |
| Masquage immédiat pour le déclarant, sur le lien direct aussi | Présent | oui | oui | `convex/modules/moderation/policy.ts` (`canReadModeratedContent`) |
| Dédoublonnage, auto-signalement refusé, débit | Présent | — | — | `convex/modules/moderation/cases.ts` (`report`), seau `report.create` de `convex/lib/rateLimit.ts` |
| Motifs de signalement | Partiel | oui | oui | 12 motifs dont 6 de l'ordonnance (`packages/social-domain/src/moderation.ts`) ; manquent spam, arnaque ou fraude, compte d'un mineur, vente interdite |
| Accusé de réception et avis de décision au déclarant (SU01d) | Présent | oui | non | `convex/modules/moderation/reporterNotices.ts` |
| Suivi « Mes signalements » | Présent | oui | non | `apps/antsia_ga/src/components/personal-controls.tsx` (`myReports`), route `personalReports` |
| Délais légaux 24 h et 72 h, file prioritaire, chronomètre | Présent | oui | — | `cases.deadlineQueue`, `apps/antsia_ga/src/components/moderation/deadline-queue.tsx` |
| Alerte de retard et export agrégé en console | Présent | oui | — | `convex/modules/platform/console.ts` (`legalDeadlineAlert`, `aggregateExport`), `console-health.tsx`, `console-export.tsx` |
| Équipes par réseau et par surface, compétence relue à l'acte | Présent | oui | — | `cases.ts` (`teamCapacity`), `apps/admin_antsia_ga/src/components/console-teams.tsx` |
| Décision motivée et journalisée | Présent | oui | — | `cases.ts` (`applyDecision`, `appendAudit`) |
| Sanctions graduées avec durée (365 jours au plus) | Partiel | partiel | — | Cinq genres au serveur (`moderationPolicy.ts`, `SANCTION_KINDS`) ; le bureau n'offre que classer, retirer, avertir, suspendre (`moderation-model.ts`, `MODERATION_ACTIONS`) : ni sourdine ni exclusion |
| Récidive (historique visible, barème) | Absent | — | — | Cherché : `récidiv`, `recidiv`, `strike`, `repeatOffen`, `escalat` dans `convex/modules/moderation` et `packages/social-domain/src` |
| Recours à deux niveaux (réseau, puis plateforme) | Présent | oui | non | `cases.fileAppeal`, `network-appeals.tsx`, `console-appeals.tsx` |
| Motifs communiqués à la personne sanctionnée | Partiel | oui | non | `cases.myDecisions` rend le texte libre du modérateur ; ni règle enfreinte normalisée, ni délai de recours, ni « état du compte » |
| Décisions sur les contenus d'une page, lues par ses signataires | Présent | oui | non | `apps/antsia_ga/src/components/page-moderation-decisions.tsx`, `cases.pageDecisions` |
| Relecture préalable, mots bloqués, plafond de liens, cadence | Partiel | non | — | Règles et gardes : `policy.ts`, `contentNeedsReview` ; `cases.setPolicy` et `cases.setBlockedTerm` n'ont aucun écran ; sans réglage, 20 liens et 100 écritures par minute |
| File de relecture | Présent | oui | — | `cases.paginatePending`, `moderation-forms.tsx` (`PendingDecision`) |
| Débit de toutes les écritures, seaux renforcés pour les comptes légers | Présent | — | — | `convex/lib/rateLimit.ts`, cliquet `tests/ratchets/rate-limited-writes.test.ts` |
| Limitation selon l'ancienneté du compte | Absent | — | — | Cherché : `accountAge`, `newAccount`, `recentAccount`, `compte récent` |
| Bloquer, mettre en sourdine, masquer | Présent | oui | partiel | `convex/modules/graph/connections.ts`, `convex/modules/marks/marks.ts` (plan 05) |
| Messages personnels réservés aux relations | Présent | oui | oui | `convex/modules/messaging/inbox.ts` (`startThreadWithHandle`) |
| Modération d'un direct (exclure, couper le chat) | Présent | oui | — | `convex/modules/live/moderation.ts` (plan 04) |
| Outils des administrateurs de groupe et de page (art. 11) | Partiel | oui | — | `thematicGroups.ts` (`removeGroupPost`, `removeMember`) ; pas les commentaires d'autrui ; aucun avis à l'administrateur (SU01, § 2.1) |
| Retirer un commentaire sous sa publication | Présent | oui | — | `convex/modules/engagement/engagement.ts` (`removeComment`) |
| Vérification renforcée des vendeurs | Partiel | — | — | Créer une page exige une adhésion `verifiee` (`convex/modules/pages/pages.ts`) ; aucune règle par catégorie sensible |
| Antivirus des fichiers | Présent | — | — | `convex/modules/files/avProviders.ts` (plan 13) |
| Détection des contenus sexuels impliquant des mineurs par empreintes | Absent | — | — | Cherché : `csam`, `PhotoDNA`, `perceptual`, `phash`, `NCMEC` |
| Flou ou étiquette « contenu sensible » | Absent | — | — | Cherché : `sensitive`, `contentWarning`, `nsfw`, `blur` dans `convex` et `packages/social-domain` |
| Transparence publique quotidienne et délais tenus | Présent | oui | — | `convex/modules/moderation/maintenance.ts`, `convex/modules/public/projections.ts` (`transparency`, `transparencyDeadlines`) |
| Rapport périodique (motifs, surfaces, recours, mesures) | Partiel | — | — | Seulement des totaux quotidiens sur douze jours (`moderationTransparency`) |
| Journal des décisions | Présent | oui | — | `convex/modules/platform/audit.ts`, `console-audit.tsx` ; `paginateNetworkAudit` sans écran côté réseau |
| Mentions légales (SU01a) | Partiel | oui | — | `apps/antsia_ga/src/i18n/locales/fr/publicNetwork.json` (`legal.legal`) : ni téléphone, ni directeur de publication, ni hébergeurs, ni registre de la HAC |
| Règles d'utilisation publiées (SU01f) | Absent | — | — | Aucune route dans `apps/antsia_ga/src/lib/routes.ts` ; cherché : `rules`, `terms`, `conditions`, `regles` |
| Identification des titulaires (SU01b) | Fermé | — | — | Porte A1, A2 ; seule une empreinte du canal vérifié est gardée (`convex/modules/people/identity.ts`) |
| Âge, mineurs, contrôle parental (SU01c) | Fermé | — | — | Porte A3, A4 ; cherché : `birthDate`, `ageRange`, `parental`, `guardian`, `mineur` |
| Droit de réponse (SU01e) | Absent | — | — | Cherché : `rightOfReply`, `droit de réponse`, `replyRight` (seule occurrence : réponses d'avis de DIASPORALE) |
| Export, effacement, consentements | Présent | oui | — | `convex/modules/people/{erasure,consents}.ts` (plan 06) ; ni journal de rectification ni texte accepté conservé |
| Gel d'un contenu signalé, conservation, réquisitions (SU01g) | Absent | — | — | Cherché : `legalHold`, `requisition`, `preservation`, `freeze` |
| Mesures sur ordre du juge (SU01h) | Partiel | partiel | — | `people/memberships.ts` (`suspendEverywhere`, `liftSuspension`) sans écran ; `pages/admin.ts` (`setPageStatus`) et vitrines en console ; ni déréférencement, ni correctif, ni marquage, ni levée à l'échéance |
| Étiquette des contenus d'IA (SU01i) | Absent | — | — | Aucun champ ; seul le texte alternatif des médias de démo le dit (`convex/seeds/demoMediaManifest.ts`) |
| Transparence des espaces qui vendent (SU01j) | Partiel | oui | — | Conditions de vitrine (`convex/modules/shops/storefrontTerms.ts`, MP05) ; ni responsable ni politique de données par page |

Décompte : 25 Présent, 11 Partiel, 9 Absent, 2 Fermé (47 capacités).

### Ce qui est écrit mais jamais recetté en réel

- **SU01d** : en ligne depuis le 22/10/2026 ; recette navigateur sur backend local isolé avec des comptes fictifs, et recette connectée de la console en lecture seule le 23/10 (`EXECUTION.md` de l'étude). Aucun signalement réel n'a encore échu : les chiffres publiés de `/transparence` n'ont jamais été vus sur une vraie journée.
- **Recours, sanctions, relecture, débit** : prouvés par les tests du moteur (rapport PA5, `docs/07`) ; jamais exercés par deux vraies identités en production (dossier de reprise, § 10.1, P0 « recette à deux vraies identités »).
- **Mobile** : signalement de publication présent dans le code ; non recetté.

## 3. Comparaison avec les applications de référence

| Capacité | Facebook / Instagram | TikTok | YouTube | X | Discord | ANTSIA | Verdict |
|---|---|---|---|---|---|---|---|
| Signaler tout objet (profil, message, Story, direct) | oui | oui | oui | oui | oui | 8 genres de cible branchés sur les 20 hors DIASPORALE | **À faire** (MC-01) |
| Signalement de message privé | oui | oui | — | oui | oui | non | **À faire** (MC-01) |
| Suivi du signalement par le déclarant | oui (boîte d'assistance) | oui | partiel | partiel | non | oui | Déjà fait |
| Avis motivé à l'auteur : règle, sanction, recours | oui (« état du compte ») | oui | oui | oui | partiel | texte libre | **À adapter** (MC-04) |
| Avertissements gradués et récidive visible | oui | oui | oui (trois avertissements, expiration) | oui | oui | sanctions sans historique | **À adapter** (MC-03) |
| Recours | oui, avec organe externe | oui | oui | oui | oui | deux niveaux | Déjà fait ; organe externe écarté |
| Modération automatique par mots, liens, spam | oui | oui | oui | oui | oui (règles par serveur) | règles sans écran | **À faire** (MC-02) |
| Restrictions des comptes neufs | oui | oui | oui | oui | oui (niveau de vérification) | seaux renforcés par badge | **À adapter** (MC-07) |
| Détection par empreintes des abus sexuels sur mineurs | oui | oui | oui | oui | oui | non | **À faire sous condition externe** (MC-08) |
| Écran sur contenu sensible | oui | oui | oui | oui | oui | non | **À faire** (MC-08) |
| Supervision parentale, liaison familiale | oui | oui | oui | non | oui | non | **À adapter** après A3 (SU01c) |
| Messages d'inconnus fermés aux mineurs | oui | oui | — | — | partiel | relation exigée pour tous | Déjà fait en partie ; à régler pour les mineurs (SU01c) |
| Étiquette « fait avec l'IA » (auteur et détection) | oui | oui | oui | partiel | non | non | **À faire** (SU01i) |
| Notes de contexte apportées par la communauté | non | non | partiel | oui | non | non | **Écarté** pour l'ouverture (§ 4.4) |
| Rapport de transparence périodique | oui | oui | oui | oui | oui | totaux quotidiens | **À faire** (MC-05) |
| Motifs de décision publics et anonymisés | partiel | partiel | partiel | partiel | non | non | **À adapter** dans MC-05 |
| Signalement prioritaire pour les autorités | oui | oui | oui | oui | oui | non | **À faire** (SU01g, SU01h) |

## 4. Ce qui manque

### 4.1 Bloquant avant l'ouverture au public

1. **Mesures sur ordre du juge** (art. 39 à 44) : aucun écran pour suspendre, déréférencer, épingler un correctif, marquer l'origine, restreindre, lever à l'échéance. Critère du jalon 1. → SU01h.
2. **Signaler depuis chaque objet** : profils, pages, groupes, évènements, Stories, directs, offres, messages personnels ne sont pas signalables ; un contenu préjudiciable à un mineur (art. 24) peut se trouver partout. → MC-01.
3. **Réglages de modération du réseau** sans écran : relecture, mots bloqués et plafonds existent mais restent inaccessibles ; défauts lâches. → MC-02.
4. **Mentions légales incomplètes** (art. 25) et inscription au registre de la HAC (art. 37). → SU01a et propriétaire.
5. **Règles d'utilisation absentes** (art. 5 à 11, art. 21, art. 32) ; administrateurs non prévenus d'un signalement dans leur espace. → SU01f.
6. **Identification et déclaration d'âge** [A1 à A4]. → SU01b, SU01c (déclaration).

### 4.2 Attendu par les utilisateurs

- Sanctions complètes dans le bureau (sourdine, exclusion) et historique de récidive (MC-03).
- Avis motivé : règle enfreinte, durée, voie et délai de recours, « état du compte » (MC-04).
- Motifs spam, arnaque, compte d'un mineur (MC-06).
- Restrictions des comptes récents (MC-07).
- Rapport de transparence périodique (MC-05).
- Parité mobile : signaler, « Mes signalements », recours (MC-09).

### 4.3 Différenciant pour ANTSIA

- **Identité vérifiée comme levier de confiance** : priorité de traitement et vérification renforcée pour les catégories sensibles (emploi, immobilier, véhicules), appuyées sur IDN et PRO.GA, jamais payantes (étude § 10). → MC-06.
- **Protection des pages Officielles contre l'imitation** (art. 32) : noms et identifiants proches des pages Officielles signalés à la création et mis en relecture. → MC-06.
- **Délais légaux tenus et publiés** : déjà rare ; à étendre au rapport périodique avec les mesures sur ordre. → MC-05.
- **Faible débit** : écrans de modération et d'avis en texte d'abord, sans média chargé par défaut dans un aperçu de dossier.
- **Correctif épinglé par une page Officielle** sur décision du juge (art. 42), lié à la vie publique. → SU01h.

### 4.4 Écarté ou reporté, et pourquoi

| Sujet | Décision | Raison |
|---|---|---|
| Notes de contexte par la communauté | Reporté (P3) | Demande une masse critique de contributeurs et une modération de second rang ; risque de manipulation avant le pilote |
| Organe de recours externe | Écarté | Le recours de plateforme suffit ; la voie externe est la HAC (art. 38) ou le juge, à annoncer (SU01e) |
| Classement de modération par IA | Reporté | Aucune ligne d'IA dans ANTSIA ; dépend du plan 16 et de SU01i |
| Copie du contenu signalé dans le dossier | Écarté par défaut | ADR-0009, § 1 ; le gel de SU01g conserve la ligne d'origine au lieu de la copier [A2] |
| Écran d'âge pour la pornographie (art. 21) | Écarté | Interdire la pornographie dans les règles en dispense (SU01, § 2.2) |
| Rencontres | Fermé | Pas de preuve de majorité qualifiée |

## 5. Lots d'implémentation

### SU01h — Mesures sur ordre du juge (référé numérique) · priorité P0 · taille M · session S1
- **Pour l'utilisateur** : l'exploitant exécute une décision « d'heure à heure » (art. 41) et en garde la preuve ; la personne visée sait qu'une mesure s'applique et jusqu'à quand.
- **Backend** : table `judicialMeasures` (`networkId`, `kind` : `suspend_account`, `suspend_content`, `delist`, `pin_correction`, `origin_label`, `restrict_feature`, `suspend_access` ; `target` typé comme `moderationTargetValidator` ou réseau ; `orderReference` borné, sans pièce jointe ; `startsAt`, `endsAt`, `executedAt`, `liftedAt`, `liftReason`, `createdByPersonId`, `confirmedByPersonId`) ; index `by_status_endsAt`, `by_target`, `by_network_createdAt`. Mutations opérateur `openMeasure`, `confirmMeasure`, `liftMeasure` (motif, débit, `appendAudit`). Effets : réutiliser `suspendEverywhere`, `removeTarget` et `setPageStatus` ; `delist` retire de la recherche, de Découvrir et des projections publiques (`convex/modules/public/projections.ts`) sans supprimer ; `pin_correction` porte un texte du juge affiché au-dessus du contenu ou du profil ; `origin_label` pose une étiquette d'origine ; `restrict_feature` coupe une fonction pour un réseau (registre fermé de fonctions). Cron de levée à l'échéance (identifiant ASCII) ; plafond de 72 h pour les mesures de l'art. 44 ; rappel de caducité à un mois (art. 43).
- **Web** : console, écran « Mesures sur ordre » (liste, ouverture, confirmation, levée, preuve horodatée) ; sur antsia.ga, bandeau du correctif et étiquette d'origine ; la personne visée voit la mesure dans `/mes-donnees`.
- **Mobile** : afficher correctif et étiquette (après le web, plan 14).
- **Données personnelles** : mesures conservées selon [A12] ; exportées pour la personne visée sans `orderReference` si la loi l'exige ; inventaire `dataPolicies.ts` mis à jour.
- **Tests et cliquets** : moteur avec horloge simulée (ouverture, effet, levée automatique, plafond de 72 h) ; `operator-audit`, `crons-contract`, `public-communication`.
- **Critères d'acceptation** : sur backend local et comptes fictifs, chaque genre de mesure s'exécute, s'affiche et se lève seul à l'échéance ; le journal montre qui, quand, quelle référence ; aucun contenu supprimé par un déréférencement.
- **Dépend de** : plan 13 (coquille de la console) ; plan 03 (recherche et Découvrir pour `delist`).
- **Porte** : avis du juriste conseillé [A12] ; décision 2 du § 7 (double validation) ; publication.

### MC-01 — Signaler depuis chaque objet · priorité P0 · taille L · session S1
- **Pour l'utilisateur** : « Signaler » dans le menu de chaque objet visible : profil, page, groupe, évènement, Story, direct, album, offre, vitrine, poste, avis, message de groupe, message personnel.
- **Backend** : ajouter `thematicGroup` et `personalMessage` à `moderationTargetValidator` et `MODERATION_SURFACES` ; résolution de visibilité dans `convex/modules/moderation/targets.ts` (un message personnel n'est signalable que par une partie au fil ; aucune copie du texte) ; retrait et restauration pour ces deux cibles.
- **Web** : généraliser `ReportContentDialog` (genres et titres par i18n) et l'ouvrir depuis les menus existants ; même accusé et même suivi que SU01d.
- **Mobile** : après le web (MC-09).
- **Données personnelles** : `myReports` couvre les nouvelles cibles ; effacement déjà dérivé du schéma (`erasure.test.ts`).
- **Tests et cliquets** : un test moteur par cible (visibilité, auto-signalement refusé, masque) ; `network-scoped-functions`, `i18n-locales`, `no-hardcoded-strings`.
- **Critères d'acceptation** : chaque surface de la liste propose « Signaler » à 390 et 1440 px ; le contenu disparaît pour le déclarant ; le dossier arrive dans la bonne file.
- **Dépend de** : plans 01 (iCom), 03 (Stories), 04 (direct), 05 (profil), 07 (pages, groupes, évènements), 08 (offres) pour l'emplacement des menus. Fichier partagé : `convex/schema.ts` (validateur).
- **Porte** : aucune.

### MC-02 — Réglages de modération du réseau · priorité P0 · taille M · session S1
- **Pour l'utilisateur** : l'administrateur d'un réseau règle, par surface, la relecture préalable, le plafond de liens, la cadence et la liste des mots bloqués ; les comptes récents passent en relecture quand ils publient des liens.
- **Backend** : requêtes `policies` et `blockedTermsPage` (bornées) à côté de `cases.setPolicy` et `cases.setBlockedTerm` ; valeurs par défaut prudentes posées par une constante du domaine (décision 3 du § 7) ; aucun texte conservé.
- **Web** : onglet « Réglages » de `/moderation` pour `network_admin` ; même écran en console pour un opérateur (plan 13). React Hook Form et Zod ; motif obligatoire.
- **Mobile** : sans objet.
- **Données personnelles** : aucune.
- **Tests et cliquets** : domaine (`contentNeedsReview` avec les nouveaux défauts) ; moteur (refus d'un non-administrateur) ; `operator-audit`.
- **Critères d'acceptation** : un mot bloqué ajouté met en relecture la publication suivante qui le contient ; le réglage est journalisé ; un modérateur sans rôle d'administrateur ne voit pas l'onglet.
- **Dépend de** : rien.
- **Porte** : décision 3 du § 7.

### MC-03 — Sanctions complètes et récidive · priorité P1 · taille M · session S1
- **Pour l'utilisateur** : le modérateur choisit parmi les cinq sanctions, voit l'historique de la personne (décisions et sanctions passées, sans contenu) et un barème proposé ; les avertissements expirent.
- **Backend** : requête `personHistory` bornée (sanctions par `by_person_status`, décisions par `by_owner_createdAt`), lue seulement par une compétence vivante ; durée par défaut des avertissements (règle du domaine) ; barème indicatif, jamais automatique.
- **Web** : `MODERATION_ACTIONS` étendu (sourdine, exclusion) ; encart d'historique dans le dossier.
- **Données personnelles** : historique déjà effacé avec la personne ; durée de conservation des sanctions échues selon [A2].
- **Tests et cliquets** : moteur (compétence, borne) ; écran (choix, durée, confirmation).
- **Critères d'acceptation** : une exclusion se prononce depuis le bureau ; l'historique ne montre ni déclarant ni contenu.
- **Dépend de** : MC-04 pour la règle enfreinte.
- **Porte** : aucune.

### MC-04 — Avis motivé et état du compte · priorité P1 · taille M · session S1
- **Pour l'utilisateur** : la personne sanctionnée lit la règle enfreinte, la mesure, sa durée, la date limite de recours et ses recours ; une page « État du compte » résume ses mesures en cours.
- **Backend** : catalogue fermé de règles (`packages/social-domain`, aligné sur les règles d'utilisation de SU01f) ; champ `ruleCode` sur `reports` et `sanctions` ; délai de recours en constante du domaine ; `myDecisions` l'expose.
- **Web** : section « État du compte » dans `/mes-donnees` ; phrase de la cloche inchangée (aucun contenu dans l'avis).
- **Mobile** : après le web.
- **Données personnelles** : export de `ruleCode` ; effacement inchangé.
- **Tests et cliquets** : `notification-payload-content`, `i18n-locales`.
- **Critères d'acceptation** : chaque décision porte une règle ; l'avis donne la date limite de recours.
- **Dépend de** : SU01f (texte des règles).
- **Porte** : texte des règles validé par le juriste.

### MC-05 — Rapport de transparence périodique · priorité P1 · taille M · session S1
- **Pour l'utilisateur** : une page publique par période : dossiers par motif et par surface, décisions, recours et renversements, délais tenus, mesures sur ordre, comptes de mineurs détectés [A9], méthodes de vérification.
- **Backend** : agrégat périodique (cron), mêmes règles de petites cohortes (`legalDeadlineDisclosure`, seuil 5, base jamais publiée) ; **projection publique à part** (les projections existantes sont lues en schéma strict).
- **Web** : `/transparence` gagne une section « Rapports » ; console : export du rapport trimestriel destiné à l'autorité [A9].
- **Données personnelles** : aucune donnée personnelle.
- **Tests et cliquets** : `public-communication`, test de projection, test des masques.
- **Critères d'acceptation** : aucune catégorie sous 5 n'apparaît ; une période non mesurée le dit.
- **Dépend de** : SU01h, SU01c (comptes de mineurs).
- **Porte** : décision 6 du § 7.

### MC-06 — Arnaques et usurpation · priorité P1 · taille M · session S1
- **Pour l'utilisateur** : motifs « spam », « arnaque ou fraude », « compte d'un mineur » ; avertissement avant d'ouvrir un lien d'un domaine marqué par le réseau ; une page dont le nom imite une page Officielle passe en relecture.
- **Backend** : motifs ajoutés à `CONTENT_REPORT_REASONS` (fondement légal : aucun, sauf « compte d'un mineur », relié à SU01c) ; table `riskyDomains` par réseau ; contrôle de similarité à la création ou au renommage d'une page ; priorité de file pour les catégories sensibles.
- **Web** : libellés des motifs ; avertissement de lien dans le fil et iCom.
- **Mobile** : libellés après le web.
- **Données personnelles** : aucune nouvelle.
- **Tests et cliquets** : domaine (motifs, similarité) ; S2 reprend les libellés dans DIASPORALE (`REPORT_REASONS` suit le moteur).
- **Critères d'acceptation** : une page « Ministère de … » créée par un particulier est en relecture ; les nouveaux motifs apparaissent dans les deux langues.
- **Dépend de** : plan 11 (pages Officielles), plan 15 (libellés DIASPORALE).
- **Porte** : aucune.

### MC-07 — Restrictions des comptes récents · priorité P1 · taille S · session S1
- **Pour l'utilisateur** : un compte neuf publie, mais avec des plafonds plus serrés (liens, messages, signalements) pendant une période fixée ; les comptes vérifiés en sont dispensés.
- **Backend** : seau renforcé étendu à l'ancienneté (`convex/lib/rateLimit.ts`) en plus du badge ; durée en constante du domaine.
- **Tests et cliquets** : `rate-limited-writes` ; test moteur avec horloge simulée.
- **Critères d'acceptation** : la limite tombe à l'échéance ; un compte Vérifié n'est jamais concerné.
- **Dépend de** : MC-02 ; **Porte** : décision 3 du § 7.

### MC-08 — Contenus sensibles et empreintes · priorité P3 · taille M · session S1
- **Pour l'utilisateur** : un média marqué « sensible » s'affiche flouté avec un geste pour le voir ; les médias d'abus sexuels sur mineurs connus sont bloqués à l'admission.
- **Backend** : étiquette `sensitive` posée par le modérateur ou l'auteur ; adaptateur d'empreintes dans la chaîne d'admission des fichiers (comme l'antivirus), bloquant et fail-closed ; signalement à l'autorité par la procédure de SU01g.
- **Web** : voile sur la carte et la visionneuse.
- **Données personnelles** : aucune empreinte ne sort sans procédure SU01g.
- **Critères d'acceptation** : un média marqué est flouté partout ; l'adaptateur refuse en cas de panne.
- **Dépend de** : plan 13 (chaîne des fichiers), SU01g.
- **Porte** : contrat avec un organisme habilité (clé externe) pour les empreintes ; le flou n'en dépend pas.

### MC-09 — Parité mobile de la sécurité · priorité P1 · taille M · session S3
- **Pour l'utilisateur** : sur le téléphone, signaler tout objet, lire « Mes signalements », ses décisions et faire recours.
- **Mobile** : écrans et menus dans `apps/antsia_mobile/src/screens/` ; motifs lus dans le domaine.
- **Dépend de** : MC-01, MC-04 ; plan 14.
- **Porte** : publication de l'application.

### SU01a — Mentions légales et registre · priorité P0 · taille S · session S1
- **Pour l'utilisateur** : la page des mentions donne l'éditeur complet, le directeur de publication, le téléphone, les hébergeurs et sous-traitants, le registre de la HAC et le contact du représentant légal (art. 25, 37 ; ord. 0012, art. 54 nouveau).
- **Web** : textes i18n de `publicNetwork.json` (`legal.legal`, `legal.privacy.recipients`) ; liste des sous-traitants alignée sur l'inventaire (SU01, § 2.3 : Vercel, Convex, Identité.ga, Resend, LiveKit, PostHog, Expo, FCM, APNs, passerelle SMS, ClamAV, à confirmer).
- **Tests et cliquets** : `public-communication` ; aucune valeur inventée : un champ manquant bloque le lot.
- **Critères d'acceptation** : chaque mention exigée par l'art. 25 est présente ou le lot reste ouvert.
- **Porte** : informations du propriétaire (§ 7, décision 1).

### SU01b — Identification des titulaires · priorité P0 · taille L · session S1
- **Pour l'utilisateur** : identification privée, jamais affichée : NOM en majuscules et Prénoms par le normaliseur partagé du programme, domicile, téléphone vérifié, RCCM pour qui vend ; préremplissage par IDN ; comptes existants régularisés à la connexion suivante.
- **Backend** : table séparée `accountIdentities`, accès journalisé, lecture limitée à une procédure (SU01g) ; aucune donnée d'état civil dans le profil ni dans une notification.
- **Données personnelles** : export complet ; conservation après effacement selon [A2].
- **Dépend de** : plan 06 (écrans d'inscription), ADR complétant l'ADR-0002 si le juriste l'exige.
- **Porte** : **[A1] [A2] [A5]** ; la qualification de l'interconnexion IDN (loi 025/2023, art. 81).

### SU01c — Âge et mineurs · priorité P0 (déclaration) puis P1 (vérification) · taille L · session S1
- **Pour l'utilisateur** : âge déclaré à l'inscription, refus avant 16 ans ; régime renforcé des 16-17 ans (accord parental enregistré, fil non profilé, aucun contact par une personne non identifiée, ni transaction ni rencontre) ; signalement « compte d'un mineur » ; effacement à la demande d'un parent (art. 14) ; rapport trimestriel [A9] ; puis vérification effective conforme au référentiel de la HAC (art. 20, 53).
- **Backend** : tranche d'âge ou date déclarée dans une table privée ; règles du domaine qui relâchent ou serrent par réglage selon [A3] ; filtre de recommandation des contenus d'IA (art. 22).
- **Dépend de** : plan 06 (inscription), MC-06 (motif), MC-05 (rapport), IDN pour une attestation de seuil.
- **Porte** : **[A3] [A4] [A9]** ; référentiel de la HAC ; autorisation de l'APDPVP si A3 l'exige.

### SU01e — Droits et droit de réponse · priorité P1 · taille M · session S1
- **Pour l'utilisateur** : demandes datées de rectification, complétion, effacement, restitution ; formulaire de droit de réponse (art. 26, 27), réponse insérée sous 48 h avec la même visibilité (art. 47) ; information sur la réclamation auprès de la HAC (art. 38).
- **Backend** : tables `dataRightsRequests` et `rightOfReplyRequests`, chronomètre de 48 h dans la file des délais légaux ; journal de rectification du profil ; empreinte du texte de chaque version de consentement (`packages/social-domain/src/consent.ts`).
- **Dépend de** : plan 06 (Mes données) ; MC-01 (cible citée).
- **Porte** : **[A8]**.

### SU01f — Règles d'utilisation et outils des administrateurs · priorité P0 · taille M · session S1
- **Pour l'utilisateur** : règles publiées (responsabilités, interdits de l'art. 32, pornographie interdite) ; l'administrateur de page ou de groupe retire tout commentaire dans son espace et reçoit un avis neutre de chaque signalement qui le concerne ; rappel au moment d'un relais (art. 7 à 9).
- **Backend** : droits de retrait dans `thematicGroups.ts`, `engagement.ts` et les messages de groupe ; avis `space_report` sans contenu (nouveau genre de notification, voir la liste des couches dans la mémoire SU01d).
- **Web** : route publique des règles dans `routes.ts`, lien depuis le pied de page et l'inscription.
- **Dépend de** : plan 07 (espaces) ; MC-04 (catalogue de règles).
- **Porte** : **[A7]** et relecture du texte par le juriste (arbitrage A10 du cahier).

### SU01g — Conservation et coopération · priorité P1 · taille M · session S1
- **Pour l'utilisateur** : invisible ; il garantit qu'un contenu signalé et ses métadonnées restent disponibles pour la justice, puis disparaissent.
- **Backend** : table `legalHolds` qui suspend l'effacement d'une cible et de ses métadonnées (sans copie) ; registre `lawfulRequests` (réquisitions) avec double validation, journal et purge à l'échéance (patron de l'ADR-0011) ; exceptions documentées dans l'inventaire des données ; correction des points du § 2.6 de SU01 (IP de session, jetons IDN, e-mail en clair pendant la grâce).
- **Web** : console, écran « Réquisitions » (plan 13).
- **Données personnelles** : durée légale [A2].
- **Porte** : **[A2] [A10]**.

### SU01i — Contenus d'IA · priorité P1 · taille L · session S1
- **Pour l'utilisateur** : étiquette visible, claire et permanente « Généré par IA » sur tout ce que produit iAsted ; déclaration par l'auteur dans le composeur ; détection des contenus importés selon le standard à paraître (art. 53) ; métadonnées d'origine conservées et transmises sur réquisition.
- **Backend** : champ `aiOrigin` sur publications, commentaires, médias, Stories, messages ; manifeste d'origine conservé avec le média ; interdits de l'art. 32 dans les règles.
- **Dépend de** : plan 16 (iAsted), plan 02 (composeur), SU01g.
- **Porte** : standard technique de l'art. 53 pour la détection ; le marquage n'attend rien.

### SU01j — Transparence des espaces qui vendent · priorité P1 · taille S · session S1
- **Pour l'utilisateur** : chaque page qui vend affiche son responsable, ses règles, les termes de ses transactions et sa politique de données (ord. 0012, art. 54 nouveau).
- **Backend** : extension de `storefrontTerms` (MP05).
- **Dépend de** : plan 08, SU04 et SU06.
- **Porte** : aucune pour le code.

## 6. Ordre recommandé et dépendances

| Vague | Lots | Pourquoi dans cet ordre |
|---|---|---|
| 1 | SU01h, MC-02, MC-01 | Codables sans juriste ; SU01h est un critère du jalon 1 ; MC-01 et MC-02 rendent la modération utilisable avant l'ouverture |
| 2 | SU01a, SU01f, MC-04, MC-03 | Dès que le propriétaire fournit les mentions et que le juriste relit les règles ; MC-04 s'appuie sur le catalogue de règles |
| 3 | SU01b, SU01c (déclaration), SU01g, SU01e | Après les arbitrages A1 à A4, A2, A8, A10 |
| 4 | MC-05, MC-06, MC-07, MC-09 | Rapport et anti-arnaque avant les univers de la vague 2 ; parité mobile |
| 5 | SU01i, SU01j, SU01c (vérification), MC-08 | SU01i avant SU11 ; SU01j avec SU04 et SU06 ; échéance de l'art. 53 vers la mi-avril 2027, date à confirmer par le juriste |

Dépendances vers d'autres plans : **01** (menu des messages personnels, MC-01), **02** (composeur, SU01i), **03** (recherche et Découvrir pour `delist`), **04** (menu du direct), **05** (profil et blocage), **06** (inscription pour SU01b et SU01c, Mes données pour SU01e), **07** (pages, groupes, évènements, SU01f), **08** (offres, SU01j), **11** (pages Officielles et sponsorisé, MC-06 ; A11), **13** (coquille de la console, chaîne des fichiers), **14** (MC-09), **15** (libellés et bureau DIASPORALE), **16** (iAsted, SU01i).

## 7. Décisions à prendre par le propriétaire

1. **Gestes hors code** (SU01, § 5) : désigner l'entité éditrice et fournir téléphone, directeur de publication, hébergeurs ; demander l'inscription au registre de la HAC ; nommer un représentant légal joignable « d'heure à heure » ; déposer le dossier APDPVP ; faire trancher A1 à A12 par écrit ; obtenir la loi de ratification du 05/10/2026. *Recommandation* : commencer par A1, A2, A3 et A12, qui débloquent le jalon 1.
2. **Double validation des mesures sur ordre** : un opérateur exécute seul, un second confirme ensuite, ou deux personnes avant exécution. *Recommandation* : exécution immédiate par un opérateur, confirmation par un second dans un délai à fixer, car le texte exige l'exécution « d'heure à heure ». **Décidé par le propriétaire le 9/11/2026 :** un opérateur exécute tout de suite, un second confirme ensuite ; le délai de confirmation reste à fixer dans le lot SU01h.
3. **Réglages par défaut à l'ouverture** (relecture des liens pour les comptes récents, plafonds, durée de la période « compte récent »). *Recommandation* : des défauts plus prudents que les valeurs actuelles, relâchés après mesure sur le pilote. **Décidé par le propriétaire le 9/11/2026 :** des défauts prudents, relâchés après mesure sur le pilote ; les valeurs exactes sont soumises au propriétaire dans le lot MC-02.
4. **Texte des règles d'utilisation** : rédaction par l'équipe, relecture par le juriste. *Recommandation* : un texte court, lisible, aligné sur le catalogue de règles de MC-04.
5. **Équipe de modération du pilote** : qui, combien, quelles heures, pour tenir 24 h et 72 h (critère du jalon 1). *Recommandation* : une permanence couvrant les week-ends, car les délais courent en continu.
6. **Rythme du rapport de transparence** : *recommandation* : semestriel public, trimestriel pour l'autorité [A9].
7. **Organisme habilité pour les empreintes** (MC-08) : *recommandation* : ouvrir la démarche avant l'ouverture des médias au public large.

## 8. Risques et points d'attention

- **Effacement contre conservation** : l'effacement effectif (EXF-AN-32) et la conservation légale (art. 29, 31) se contredisent tant que A2 n'est pas tranché. Aucun gel ne doit être codé avant.
- **Petites cohortes** : chaque nouveau chiffre public (MC-05) suit la règle du seuil 5 et ne publie jamais la base ; distinguer 24 h et 72 h révélerait les hypertrucages (décision du 22/10/2026).
- **Schémas publics stricts** : ajouter un champ à une projection publique casse les fronts en ligne ; toujours une projection à part.
- **Fichiers partagés** : `moderationTargetValidator` et les tables nouvelles passent par `convex/schema.ts`, réservé à S1 ; DIASPORALE suit les motifs du moteur, S2 doit ajouter les libellés.
- **Recette** : aucune échéance réelle ne tombe en recette navigateur ; la preuve de bout en bout reste le test moteur à horloge simulée. La console exige une vraie session IDN.
- **Véracité** : aucune page publique ne dit « conforme » sans preuve (SU01, § 6).
- **Suspension des réseaux par la HAC** : statut non confirmé au 21/10/2026 (`EXECUTION.md`) ; à vérifier avant tout lancement.

## 9. Prompts d'implémentation

Chaque prompt commence par le gabarit du plan directeur (§ 7.3), dont il reprend les règles d'arrêt.

**SU01h**
```text
Tu exécutes le lot SU01h du plan 12 d'ANTSIA. Lis CLAUDE.md, le plan directeur § 7, le plan 12 (§ 1, § 2, lot SU01h), SU01_CONFORMITE_ORDONNANCE_0011.md (§ 2.4, A12), ADR-0009, ADR-0011, ADR-0039.
Périmètre : convex/modules/moderation (nouveau fichier measures.ts), convex/modules/people/memberships.ts (réutiliser suspendEverywhere), convex/modules/pages/admin.ts, convex/modules/public/projections.ts, convex/crons.ts, convex/schema.ts, apps/admin_antsia_ga (écran « Mesures sur ordre »), apps/antsia_ga (bandeau du correctif, étiquette d'origine, mesure visible dans /mes-donnees).
Livre la table judicialMeasures, les mutations opérateur journalisées, les effets des sept genres, la levée automatique par cron et le plafond de 72 h.
Vérifie par des tests moteur à horloge simulée, puis par une recette sur backend local avec des comptes fictifs.
Arrête-toi : avant de choisir la règle de double validation (décision 2 du plan), et liste ce qui demande l'avis du juriste.
```

**MC-01**
```text
Tu exécutes le lot MC-01 du plan 12 d'ANTSIA. Lis CLAUDE.md, le plan 12 (§ 2, lot MC-01), convex/modules/moderation/{tables,targets,cases,policy}.ts, packages/social-features/src/features/reseau-personnel/ReportContentDialog.tsx.
Ajoute les cibles thematicGroup et personalMessage, puis branche « Signaler » sur profil, page, groupe, évènement, Story, direct, album, offre, vitrine, poste, avis, message de groupe et message personnel, avec l'accusé et le suivi de SU01d.
Un test moteur par cible : visibilité, auto-signalement refusé, masque pour le déclarant. Recette à 390, 834 et 1440 px.
Arrête-toi si un menu relève d'un écran qu'une autre session modifie en même temps.
```

**MC-02**
```text
Tu exécutes le lot MC-02 du plan 12 d'ANTSIA. Lis le plan 12 (lot MC-02), convex/modules/moderation/{cases,policy}.ts, packages/social-domain/src/moderationPolicy.ts, apps/antsia_ga/src/components/moderation/.
Ajoute les lectures bornées des réglages et des mots bloqués, et l'onglet « Réglages » de /moderation pour l'administrateur du réseau (React Hook Form, Zod, motif obligatoire).
Prouve qu'un mot bloqué met en relecture la publication suivante, et qu'un modérateur non administrateur ne voit pas l'onglet.
Arrête-toi avant de changer les valeurs par défaut : c'est la décision 3 du plan.
```

**SU01a**
```text
Tu exécutes le lot SU01a du plan 12 d'ANTSIA. Lis SU01_CONFORMITE_ORDONNANCE_0011.md (§ 2.3, art. 25 ; § 5) et apps/antsia_ga/src/i18n/locales/{fr,en}/publicNetwork.json.
Demande-moi d'abord, en une liste, chaque information manquante : téléphone, directeur de publication, hébergeurs et sous-traitants avec leurs coordonnées, état de l'inscription à la HAC, représentant légal. N'invente aucune valeur.
Mets ensuite à jour les mentions légales et la liste des destinataires de la confidentialité, en français et en anglais, sous le cliquet public-communication.
Recette de /mentions-legales et /confidentialite à 390 et 1440 px.
```

**SU01f**
```text
Tu exécutes le lot SU01f du plan 12 d'ANTSIA. Lis SU01 (§ 2.1, art. 5 à 11 ; A7), le plan 12 (lots SU01f et MC-04), convex/modules/thematicGroups/thematicGroups.ts, convex/modules/engagement/engagement.ts, convex/modules/groups/messages.ts, et la liste des couches d'un nouveau genre d'avis dans la mémoire SU01d.
Livre : le retrait de tout commentaire par l'administrateur dans sa page ou son groupe, l'avis neutre à l'administrateur de chaque signalement dans son espace, et la route publique des règles d'utilisation, avec un texte en brouillon clairement marqué.
Arrête-toi avant toute publication du texte des règles : il attend la relecture du juriste.
```

## 10. Sources lues

- Brief commun ; dossier de reprise du 9/11/2026 (§ 2, § 10, § 11) ; plan directeur (§ 4, § 7).
- `docs/etudes/2026-10-21-sept-univers-et-vie-publique/` : `SU01_CONFORMITE_ORDONNANCE_0011.md` en entier, `EXECUTION.md` (SU01d, conditions externes), étude § 2.2, § 2.4, § 10, § 13.1, § 17.
- `docs/00_CAHIER_DES_CHARGES_ANTSIA.md` : EXF-AN-28 à 34, 51, § 19, § 20 ; `docs/07_RAPPORT_GARDE_FOUS_PA5.md`.
- ADR-0009, 0011, 0035, 0039.
- Vault `10-PROJETS/antsia/decisions/` : 2026-10-16 (gardes PA5), 2026-10-21 (délais SU01d), 2026-10-22 (délais publiés, console des délais).
- Mémoire : `su01d-signalements-reglementes.md`, `etude-sept-univers-antsia.md`.
- Code : `convex/modules/{moderation,people,public,platform,files,graph,marks,messaging,live,thematicGroups,engagement,pages,shops}`, `convex/lib/rateLimit.ts`, `convex/crons.ts`, `packages/social-domain/src/{moderation,moderationPolicy,consent}.ts`, `packages/social-features/src/features/{reseau-personnel,messagerie}`, `apps/antsia_ga/src/components/{moderation,personal-controls.tsx,page-moderation-decisions.tsx}`, `apps/antsia_ga/src/lib/routes.ts`, locales fr d'antsia.ga et de `social-features`, `apps/admin_antsia_ga/src/components/console-*.tsx`, `apps/antsia_mobile/src/screens/post-actions.tsx`, `tests/ratchets/`.
- DIASPORALE : liste des documents qui traitent de la modération (`docs/14`, `docs/34` et suivants), non lus en détail.
