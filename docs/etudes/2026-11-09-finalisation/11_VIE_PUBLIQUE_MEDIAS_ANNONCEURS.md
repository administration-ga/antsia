# Plan 11 — Vie publique, médias et annonceurs

> Constaté par lecture du code d'`origin/main` (ANTSIA `26741caa`, DIASPORALE `bead76d`), le 9 novembre 2026. Rien n'a été exécuté.
> Applications de référence : comptes gouvernementaux de X et de Facebook (étiquettes), agences publiques sur Nextdoor, alertes publiques de Google et de Facebook, Apple News, Google Actualités, Substack, Medium, Bibliothèque publicitaire de Meta, bibliothèque de contenus commerciaux de TikTok, étiquettes « sponsorisé » d'Instagram et de LinkedIn. Comparaison faite de mémoire (état des produits à la mi-2026), non revérifiée en ligne.

Lexique minimal :
- **Reflet** : copie en lecture seule, dans ANTSIA, d'une page ou d'une publication émise par administration.ga.
- **Contrat signé** : message HTTP authentifié par une clé partagée, versionné et rejouable sans doublon (`RESEAU-PUBLIC-V1`, porté par le transport `FEDERATION-INBOX-V1`).
- **Outbox** : file d'envoi persistante côté émetteur, qui garantit qu'un événement part une fois et dans l'ordre.
- **Lettre morte** : message reçu mais refusé, conservé pour examen et rejeu par la console.
- **Socle** : le dépôt `administration-ga/administration.ga` (dossier local `ADMINISTRATION_GA`), d'où ANTSIA a été dupliqué.

## 1. L'intention du propriétaire

- La vie publique est le troisième pilier : elle « informe et rassure », à côté du divertissement et du business (ADR-0035, D01, D06).
- Les administrations parlent à toute la population par des pages **Officielles reflétées** d'administration.ga, sans jamais être confondues avec la communauté (étude sept univers § 9 ; cahier EXF-AN-37, EXF-AN-48).
- Une publication ne sort du socle que si son signataire coche « Diffuser aussi sur ANTSIA », jamais par défaut (cahier § 20, arbitrage A7 ; ADR-0016).
- Aucun profil, aucune personne technique, aucune adhésion n'est créé d'office ; la modération locale d'ANTSIA prime (ADR-0013, ADR-0014).
- L'agent public n'existe que par son accord, renouvelable et retirable ; son badge tombe avec l'attestation (ADR-0015).
- Les médias ont leur page et leur site éditorial (MP12–MP13) ; un média plafonne à Vérifié ; le **label Presse** est calculé sur une attestation, jamais déclaratif ni payant (ADR-0034 décision 7 ; ADR-0035 D06).
- Les alertes officielles sont « bornées en nombre » et jamais sponsorisées (D06) ; liens « Faire la démarche » et « Voir l'offre » sans copier les données (étude § 9.1).
- Règle politique : pas de publicité politique payante, pages de partis étiquetées « Politique », règles renforcées en période électorale, compte public abandonné archivé (D07).
- Annonceurs : B2B seulement, « payé par » visible, annonceur vérifié, densité plafonnée, jamais dans Messages, bibliothèque publique de toutes les annonces, aucun ciblage sensible (EXF-AN-52, D06, étude § 9.3, § 14).
- Le modèle économique (D10) reste **proposé** : aucun lot ne peut le présumer (ADR-0035). La HAC contrôle la publicité (ordonnance 0013) : les règles du sponsorisé lui sont présentées avant ouverture (SU01, arbitrage A11).
- Vague V3 de l'étude : « Officiel en recette (PA9), alertes, label Presse, annonceurs, règle politique », porte de sortie « HAC consultée ; premières administrations reflétées » (étude § 15).

## 2. Ce qui existe

| Capacité | État | Web | Mobile | Preuve |
|---|---|---|---|---|
| Réception signée des messages fédérés | Présent | — | — | `convex/http.ts` (route `/federation/inbox`), `convex/modules/federation/http.ts`, `inbox.ts` |
| Page Officielle reflétée (`page.upserted`), révisions monotones, tombe de retrait | Présent | Oui | — | `convex/modules/federation/reseauPublic.ts`, `packages/social-domain/src/reseauPublic.ts` |
| Logo et médias importés sous garde (origines HTTPS déclarées, empreinte, analyse) | Présent | Oui | — | `convex/modules/federation/mediaActions.ts`, `mediaDownload.ts`, `mediaJobs.ts` |
| Publications reflétées (`post.published`) sans personne technique | Présent | Oui | — | `convex/modules/federation/reseauPublicPosts.ts`, `convex/modules/posts/nativeAuthor.ts` |
| Retrait propagé (publication, puis cascade de page bornée) | Présent | Oui | — | `convex/modules/federation/withdrawal.ts`, `reseauPublicPosts.ts` |
| Étiquette d'origine sur un reflet | Partiel | Oui | — | `apps/antsia_ga/src/components/public/public-post-card.tsx` affiche « Origine : {réseau} » ; aucune mention « reflété d'administration.ga » ni lien vers la source |
| Page Officielle non revendicable, gestion native fermée | Présent | Oui | — | `packages/social-domain/src/badges.ts` (`isPageClaimable`), `convex/modules/federation/mirrorAccess.ts` (`assertNativePageManagement`) |
| Lecture sans compte d'une page Officielle et de ses publications | Présent | Oui | Oui | `convex/modules/public/projections.ts` (`getOfficialPage`, `pagePosts`), `apps/antsia_ga/src/app/(public)/pages/[handle]/page.tsx`, `apps/antsia_mobile/src/screens/public-entry-screen.tsx` |
| Suivre une administration ; notification « page_post » à chaque reflet | Présent | Oui | — | `convex/modules/pages/pages.ts` (`follow`), `reseauPublicPosts.ts` (`enqueueFanout` « page_post ») |
| Rappels des communiqués des pages suivies | Présent | Oui | — | `convex/modules/pages/followedUpdates.ts` |
| Console : émetteurs, reçus, lettres mortes, rejeu, transferts de médias | Présent | Console | — | `apps/admin_antsia_ga/src/components/console-federation.tsx`, `convex/modules/federation/{emitters,replay,mediaOperations}.ts` |
| Console : pages institutionnelles natives, confiance et statut | Présent | Console | — | `apps/admin_antsia_ga/src/components/console-pages.tsx`, `convex/modules/pages/admin.ts` |
| Producteur et outbox côté socle (PA9D) | Partiel | — | — | Écrits dans le dossier local du socle, **non suivis par git** (`socle/convex/modules/reseauPublicFederation/` « ?? »), sur une branche locale de septembre ; absents d'`origin/main` du socle |
| Activation réelle (émetteur, clés, origines des médias, antivirus) | Fermé | — | — | Refus sans émetteur `administration-ga` enregistré ni réseau `administration` miroir actif (`convex/modules/federation/reseauPublicAccess.ts`) ; variables `FEDERATION_ENVIRONMENT`, `ANTSIA_FEDERATION_ADMINISTRATION_MEDIA_ORIGINS`, `ANTSIA_ADMINISTRATION_PUBLIC_ORIGIN`. S'ouvre par la configuration du propriétaire |
| Annuaire public des pages Officielles, hub « Infos officielles » | Absent | — | — | Cherché : `officiel`, `officialDirectory`, `listOfficialPages`, `pages Officiel` ; seul un compteur `officialPages` dans `public/projections.ts` (`snapshot`) |
| Alerte officielle (catégorie, épinglée, poussée, zone) | Absent | — | — | Cherché : `alert`, `alerte`, `officialAlert`, `urgent`, `alertCategory` ; seuls `role="alert"` et alertes de console |
| Épinglage d'une publication d'administration | Partiel | — | — | `convex/modules/pages/pages.ts` (`setPagePinnedPost`) pour les pages natives ; aucun champ dans le contrat, fermé aux reflets |
| Zone géographique d'un reflet | Absent | — | — | `posts.province` existe pour les natifs (`convex/modules/posts/tables.ts`) ; le contrat `post.published` n'a ni `province` ni zone |
| Agenda public d'une administration | Absent | — | — | Cherché : `event.upserted`, `agenda`, `schedule` dans `reseauPublic.ts` ; les évènements de page natifs relèvent du plan 07 |
| Liens vers demarche.ga et travail.ga | Absent | — | — | Cherché : `demarche`, `travail.ga`, `Faire la démarche`, `Voir l'offre` |
| Concours et recrutements publics étiquetés Officiel | Absent | — | — | `convex/modules/shops/tables.ts` : « emploi public » P15 = offres publiques de PRO.GA, pas de l'État |
| Archivage d'un compte public abandonné | Absent | — | — | Cherché : `abandoned`, `inactive`, `archiv` dans `pages/` et `federation/` |
| Accord local d'agent public (Mes données) | Présent | Oui | — | `convex/modules/federation/agents.ts`, `apps/antsia_ga/src/components/public-agent-controls.tsx` (monté par `personal-controls.tsx`) |
| Transfert d'accord vers le socle (code 10 min, usage unique) | Présent | Oui | — | `convex/modules/federation/agentConsentTransfer.ts`, `packages/social-domain/src/agentConsentTransfer.ts` |
| Badge Agent public calculé, retrait, export, effacement | Présent | Oui | Badge | `badges.ts`, `convex/modules/federation/{agentAuthority,agentLifecycle}.ts`, `convex/modules/people/dataInventory.ts` |
| Affiliation (administration, fonction) affichée | Partiel | Public | — | `apps/antsia_ga/src/components/public/public-routes.tsx` (profil public seulement) ; pas sur le profil membre |
| Configuration du média (12 rubriques, visibilité, accord public) | Présent | Oui | — | `convex/modules/editorial/media.ts`, `apps/antsia_ga/src/components/editorial/config-screen.tsx` |
| Équipe : auteur, éditeur, responsable de publication, administrateur | Présent | Oui | — | `convex/modules/editorial/grants.ts`, `team-screen.tsx` |
| Brouillon, relecture, modifications demandées, validation | Présent | Oui | — | `convex/modules/editorial/articles.ts`, `article-editor.tsx` |
| Publication programmée qui relit les droits | Présent | Oui | — | `articles.ts` (`schedule`), `convex/modules/editorial/jobs.ts` (`publishScheduled`) |
| Correction visible | Partiel | Oui | — | Notice obligatoire, version précédente conservée (`articles.ts`, `editorialPublic.json` « Rectificatif ») ; pas de liste publique des rectificatifs |
| Signature (média ou contributeur consentant) | Présent | Oui | — | `packages/social-domain/src/editorial.ts` (`byline`), `grants.ts` |
| Illustrations sous garde (texte alternatif, crédit, droits) | Présent | Oui | — | `convex/modules/editorial/assets.ts`, `packages/social-domain/src/editorialAssets.ts` |
| Site média lisible sans compte (une, rubriques, article) | Présent | Oui | — | `convex/modules/public/editorial.ts`, `apps/antsia_ga/src/app/(public)/medias/[handle]/` |
| Partage, discussion, signalement d'un article | Présent | Oui | — | `convex/modules/editorial/social.ts`, `components/editorial/article-social-actions.tsx` |
| Annuaire Presse et entrée « Vie publique » de Découvrir | Présent | Oui | — | `convex/modules/editorial/directory.ts`, `app/(membre)/presse/page.tsx`, `components/discovery/discover-screen.tsx` (pilier `public`, entrée Presse seule) |
| Abonnement à un média | Partiel | Oui | — | Suivre la page existe ; l'annonce d'un article (`social.ts`, `writePost`) ne déclenche pas « page_post » : aucune notification « nouvel article » |
| Signe de confiance du média sur son site ; label Presse | Absent | — | — | Aucun champ `trust`/`badge` dans `editorialPublishedMediaValidator` (`editorial/validators.ts`) ; `press` absent de `badges.ts` |
| Contact de la rédaction | Absent | — | — | Cherché : `contactNewsroom`, `contact`, `rédaction` dans `editorial*.json` |
| Recherche d'articles, flux RSS, données structurées | Absent | — | — | Cherché : `rss`, `atom+xml`, `ld+json`, `NewsArticle`, `searchArticles` |
| Presse dans l'application mobile | Absent | — | — | Aucune occurrence `editorial`/`article` dans `apps/antsia_mobile/src/screens/` |
| Étiquette « Politique », période électorale, refus de publicité politique | Absent | — | — | `PAGE_OWNER_KINDS` = institution, association, company, media, community (`badges.ts`) ; cherché `politi`, `electoral`, `élection` |
| Compte annonceur, campagne, ciblage, budget | Absent | — | — | Cherché : `annonceur`, `advertiser`, `campaign`, `adAccount`, `budget` |
| Étiquette « Sponsorisé · payé par » | Absent | — | — | Cherché : `sponsored`, `Sponsoris`, `payé par`, `paidBy` ; les tests imposent l'absence (`components/marketplace/marketplace-screen.test.tsx`, `components/shops/shop-experience.test.tsx`) |
| Densité plafonnée dans le fil | Absent | — | — | Aucune insertion payée dans `convex/modules/posts/feedRead.ts`, `feedPolicy.ts` |
| Bibliothèque publique des annonces | Absent | — | — | Cherché : `adLibrary`, `bibliothèque`, `library` |
| Signalement d'une annonce, « Pourquoi cette annonce » | Absent | — | — | Pas d'objet annonce à signaler |
| Statistiques annonceur | Absent | — | — | Pas d'objet annonce ; aucune mesure d'impression |
| Mise en avant payée d'une offre | Absent | — | — | Seule mise en avant : le plat du jour, gratuite et organique (`convex/modules/public/shops.ts`, `getDailySpecial`) |

Décompte : **23 Présent, 6 Partiel, 19 Absent, 1 Fermé** (49 capacités).

### Ce qui est écrit mais jamais recetté en réel

| Élément | Niveau atteint | Source |
|---|---|---|
| PA9A à PA9C (consommateur ANTSIA) | Dans le code de `main` (commis le 19/10) ; jamais configuré ni éprouvé avec un vrai émetteur | Dossier de reprise § 2.4 et § 10.1 (« PA9 configuration, PR du socle, recette croisée : sources seulement ») |
| Scénarios PA9 | Écrits ; les rapports `docs/15` à `docs/18` disent « non exécutés ». Ils sont dans le périmètre de `convex/vitest.config.ts`, donc probablement joués par le `verify` du 2/11 (non vérifié fichier par fichier) | `docs/15_PLAN_EXECUTION_PA9.md`, dossier de reprise § 2.3 |
| PA9D (producteur, outbox, transfert d'accord côté socle) | Fichiers non suivis par git dans un dossier local du socle en retard ; jamais commis, jamais en PR | `docs/18_PRODUCTEUR_ET_OUTBOX_ADMINISTRATION_PA9D.md` ; constat `git status` du 9/11 |
| Rédaction et sites médias (MP12–MP13) | En ligne ; états vides contrôlés à trois largeurs le 25/10 ; **aucun article réel publié** | `docs/recette/espaces-specialises-2026-10-25/rapport.md` |
| Agent volontaire | Carte en ligne ; jamais un accord réel (pas d'émetteur) | non recetté |

## 3. Comparaison avec les applications de référence

| Capacité | Réf. (qui le fait) | ANTSIA | Verdict |
|---|---|---|---|
| Étiquette d'institution distincte | X (coche grise « gouvernement »), Facebook (pages gouvernementales vérifiées) | Badge Officiel calculé, réservé aux institutions | Déjà fait |
| Étiquette d'agent public | Aucune référence ne l'offre de façon calculée et retirable | Badge Agent public par accord + attestation | Déjà fait (différenciant) |
| Origine visible d'un contenu repris | Google Actualités (source nommée sur chaque article) | « Origine : réseau » sans renvoi vers la source | À adapter |
| Alerte d'une administration, poussée et ciblée par zone | Nextdoor (alertes urgentes des agences, par quartier), Facebook (alertes locales des pages publiques), Google (alertes publiques dans la recherche et les cartes) | Rien | À faire (SU09) |
| Agenda public d'une institution | Facebook (évènements de page) | Évènements natifs seulement | À faire plus tard (VP-08) |
| Renvoi vers le service en ligne | Pages gouvernementales (lien d'action) | Rien | À faire (VP-03) |
| Rédaction : brouillon, relecture, programmation | Medium (publications avec rédacteurs), Substack (brouillon, programmation) | Circuit complet en quatre rôles | Déjà fait |
| Correction publique | Google Actualités valorise les rectificatifs ; pratique de presse | Notice par article, pas de page des rectificatifs | À adapter (VP-06) |
| Suivre un média et être prévenu | Apple News et Google Actualités (suivre une source), Substack (abonnement) | Suivre la page, sans avis « nouvel article » | À faire (VP-07) |
| Lettre d'information par e-mail | Substack | Rien | Écarté : un e-mail porterait du contenu social (invariant « aucun contenu dans une notification ») |
| Lecture sans compte et partage | Les quatre références d'édition | Site public, copie du lien, aperçu dans le fil | Déjà fait |
| Abonnement payant, mur de paiement | Substack, Medium, Apple News+ | Rien | Écarté : paiements fermés, « contenus gratuits d'abord » (`05_PRESSE.md` § 6) |
| Label de presse attesté | Google Actualités (critères éditeurs) ; étiquettes « média d'État » de Facebook | Rien | À faire (VP-04), sur attestation et non sur critères internes |
| Étiquette « Sponsorisé » | Instagram (« Sponsorisé », « Partenariat rémunéré »), LinkedIn (« Promu ») | Rien | À faire (SU10) avec « payé par » |
| Bibliothèque publique des annonces | Meta (toutes les annonces actives ; archive des annonces politiques), TikTok (bibliothèque des contenus commerciaux en Europe) | Rien | À faire (SU10), pour toutes les annonces |
| « Pourquoi cette annonce », masquer, signaler | Meta, Instagram, LinkedIn | Rien | À faire (SU10) |
| Gestionnaire de campagnes (budget, ciblage, statistiques) | Meta, TikTok, LinkedIn | Rien | À adapter (SU10) : ciblage par univers et province seulement, aucun profilage |
| Publicité politique | Meta et Google l'ont arrêtée dans l'UE en 2025 ; TikTok l'interdit | Rien | Interdite par D07 (garde serveur à écrire) |

## 4. Ce qui manque

### 4.1 Bloquant avant l'ouverture au public

Aucun manque de ce périmètre n'empêche d'ouvrir le réseau ANTSIA lui-même : la fédération est fermée par défaut et aucun écran n'annonce une fonction vide. En revanche, **la vie publique ne peut pas être présentée comme ouverte** tant que :
1. le producteur PA9D n'est pas livré par PR dans le socle (aujourd'hui hors git) ;
2. la recette croisée R5 et R6 du cahier n'a pas été jouée (cahier § 16, lot A5) ;
3. la HAC n'a pas été consultée (étude § 15, porte de V3) et SU01a (mentions légales) n'est pas fait (plan 12).

### 4.2 Attendu par les utilisateurs

- Une page qui rassemble les administrations reflétées et leurs communiqués (`/officiel` proposé, étude § 12).
- Des alertes officielles visibles en tête, bornées, avec avis et zone (SU09).
- Un avis « nouvel article » quand on suit un média ; une page des rectificatifs ; un contact de la rédaction.
- Le signe de confiance du média sur son site (Vérifié ou non, puis Presse) : exigence de `05_PRESSE.md` § 5 non tenue.
- L'affiliation d'agent public visible aussi pour les membres connectés.
- Plus tard : un sponsorisé honnête, étiqueté et transparent (SU10), et la mise en avant d'une offre.

### 4.3 Différenciant pour ANTSIA

- **Chaîne de confiance** : Officiel, Agent public et Presse viennent d'une autorité par contrat signé, retirables, gratuits (étude § 10). Aucune référence ne combine les trois.
- **Bibliothèque de toutes les annonces**, pas seulement politiques, dès la première annonce, lisible sans compte (étude § 9.3).
- **Faible débit** : alertes en texte court, sans média obligatoire, lisibles en 3G ; site média en lecture sans compte déjà servi côté serveur.
- **Souveraineté** : aucune URL distante servie ; médias importés et analysés en local (ADR-0014).
- **Lien avec l'administration** : « Faire la démarche » vers demarche.ga, concours publics vers travail.ga, sans copier leurs données.

### 4.4 Écarté ou reporté, et pourquoi

| Élément | Raison |
|---|---|
| Lettre d'information par e-mail | Invariant : aucun contenu social dans une notification |
| Abonnement payant, kiosque | Paiements fermés ; `05_PRESSE.md` § 6 |
| « Les plus lus » | Interdit sans mesure fiable (`05_PRESSE.md` § 2) |
| Publicité dans Messages, publicité politique, ciblage sensible, badge payant | Liste « Jamais » (étude § 14, D06, D07) |
| Page d'entreprise premium (EXF-AN-52) | Dépend de D10 ; relève du plan 08 |
| Flux retour ANTSIA vers le socle (réactions, commentaires) | « Aucun flux retour en V1 » (EXF-AN-37) |
| iAsted citoyen (orientation vers l'administration) | Plan 16 |
| Attestations d'État hors presse (foncier, cartes grises) | Plan 10 (SU15) |

## 5. Lots d'implémentation

### PA9A·B·C (reprise) — vérifier le consommateur ANTSIA et remettre les rapports d'aplomb · priorité P1 · taille S · session S1
- **Pour l'utilisateur** : rien de visible ; on sait enfin ce qui est prouvé.
- **Backend** : rejouer les fichiers `convex/modules/federation/{reseauPublic,reseauPublicPosts,reseauPublicAgents,agentConsentTransfer,mediaDownload,federation}.test.ts` ; ajouter les cas manquants s'il y en a : publication sans `publishToAntsia` refusée, page non officielle refusée, émetteur désactivé, retrait avant création.
- **Web** : aucun.
- **Mobile** : aucun.
- **Données personnelles** : vérifier que `federationAgentGrants` reste dans `convex/modules/people/dataInventory.ts` et que `convex/modules/people/erasure.test.ts` le couvre.
- **Tests et cliquets** : `bunx vitest run --config convex/vitest.config.ts modules/federation` ; `bun run verify`.
- **Critères d'acceptation** : sortie des tests citée ; `docs/15`, `16`, `17`, `18` et l'encart « État » de `docs/01` disent ce qui est exécuté et ce qui ne l'est pas.
- **Dépend de** : rien.
- **Porte** : aucune.

### PA9D — livrer le producteur et l'outbox par une PR dans le socle · P1 · L · S1 (PR dans `ADMINISTRATION_GA`)
- **Pour l'utilisateur** : l'agent d'une administration peut cocher « Diffuser aussi sur ANTSIA » ; la page de son administration apparaît dans ANTSIA.
- **Backend (socle)** : partir d'`origin/main` à jour du socle, sur une branche dédiée ; reprendre depuis le dossier local, **fichier par fichier**, `socle/convex/modules/reseauPublicFederation/` (20 fichiers), `socle/packages/federation-contracts/src/reseau-public-v1/` et son test, les points de raccordement (`reseauPages/pages.ts`, `reseauPersonnel/posts.ts` et `tables.ts`, `PostComposer.tsx`, retrait commun, `schema.ts`, `crons.ts`) et la déclaration des flux `config/v4.4/flows.json` (`productionEvidence:false`). Confronter chaque raccordement au code actuel : le dossier local date de septembre et porte plus de 2 400 modifications étrangères à ne pas embarquer.
- **Web (socle)** : case « Diffuser aussi sur ANTSIA » décochée par défaut, interdite aux notes internes ; écran d'accord d'agent sur le portail administratif.
- **Mobile** : aucun.
- **Données personnelles** : sujet IDN et nonce seulement dans la table de consentement ; purge au plus 7 jours après retrait, immédiate à l'effacement (ADR-0016).
- **Tests et cliquets** : tests du producteur, de l'outbox, du transfert et du contrat ; contrôles du socle (sa propre commande de vérification) ; copie typée du contrat identique à `packages/social-domain/src/reseauPublic.ts` (test de parité).
- **Critères d'acceptation** : PR ouverte et relue, contrôles verts, aucun fichier étranger à PA9D dans le diff ; une note de service ne sort jamais (test) ; ADR du socle accepté (cahier, lot A5).
- **Dépend de** : PA9A·B·C (reprise).
- **Porte** : décision du propriétaire d'ouvrir la PR ; toute publication du socle exige son accord explicite (consigne PA9 du `CLAUDE.md`).

### VP-01 — configurer le développement et jouer la recette croisée R5 et R6 · P1 · M · S1
- **Pour l'utilisateur** : preuve qu'une administration de test apparaît, publie, retire, et qu'un agent volontaire porte son badge puis le perd.
- **Backend** : sur des déploiements de développement des deux côtés : réseau `administration` (fermé, politique miroir, enfant de la racine) créé par la console ; émetteur `administration-ga` enregistré ; une origine HTTPS de médias de test ; antivirus de développement.
- **Web** : parcours dans la console (`console-federation.tsx`) : reçus, lettres mortes, rejeu, transferts de médias.
- **Mobile** : lecture de la page Officielle dans `public-entry-screen.tsx`.
- **Données personnelles** : un compte de test, jamais une identité réelle d'agent ; effacement du compte de test en fin de recette.
- **Tests et cliquets** : scénario écrit dans `docs/recette/vie-publique-pa9-<date>/RAPPORT.md` : page créée, révision ancienne ignorée, publication avec image, retrait, retrait de page en cascade, rejeu d'une lettre morte, accord, retrait d'accord, effacement.
- **Critères d'acceptation** : R5 et R6 du cahier constatés avec captures à 390, 834 et 1440 px, clair et sombre ; aucun profil créé d'office ; l'image n'est servie qu'après analyse propre.
- **Dépend de** : PA9D.
- **Porte** : clés et environnements du propriétaire (secrets jamais édités par un agent).

### VP-02 — réserver « Officiel » aux pages attestées · P1 · S · S1
- **Pour l'utilisateur** : une page Officielle est toujours une vraie institution.
- **Backend** : aujourd'hui `pages/admin.ts` (`createInstitutionPage`, `setPageTrust`) permet à un opérateur de poser `official` à la main, avec motif. Selon la décision 3 (§ 7) : soit refuser `official` hors reflet fédéré, soit l'exiger avec deux opérateurs (modèle de l'ADR-0011) et une échéance de revue.
- **Web** : console : libellé explicite « Officiel manuel » et motif obligatoire visibles dans `console-pages.tsx`.
- **Mobile** : aucun.
- **Données personnelles** : aucune.
- **Tests et cliquets** : test de refus ; journal `operator-audit` vérifié.
- **Critères d'acceptation** : aucune page `official` sans reflet ni décision tracée ; les pages existantes sont listées dans le rapport.
- **Dépend de** : décision 3.
- **Porte** : décision du propriétaire.

### VP-03 — hub « Infos officielles », annuaire et « Faire la démarche » · P2 · M · S1
- **Pour l'utilisateur** : une page qui liste les administrations reflétées et leurs derniers communiqués ; un bouton « Faire la démarche » renvoie vers demarche.ga.
- **Backend** : requête publique bornée des pages `official` actives (nouvel index si besoin, par `trust` et `status`) ; champ facultatif `serviceLink` (origine allowlistée demarche.ga) dans un **ajout** au contrat (voir décision 1).
- **Web** : route `/officiel` (publique) et entrée dans le pilier « Vie publique » de `discover-screen.tsx` ; routes dans `apps/antsia_ga/src/lib/routes.ts` ; origines dans l'environnement, jamais en dur ; états vide, chargement, erreur. **La route n'est créée qu'à la première administration reflétée** (ADR-0034 : aucun alias vide).
- **Mobile** : après le web.
- **Données personnelles** : aucune.
- **Tests et cliquets** : nouvelle projection publique **à part** (piège des schémas Zod stricts du `CLAUDE.md`) ; cliquets `no-hardcoded-urls`, `i18n-locales`.
- **Critères d'acceptation** : lisible sans compte ; aucune page non officielle ; lien sortant étiqueté comme externe.
- **Dépend de** : VP-01.
- **Porte** : au moins une administration reflétée.

### SU09 — alertes officielles · P2 · M · S1 (volet alertes de SU09 ; label Presse en VP-04, règle politique en VP-05)
- **Pour l'utilisateur** : coupure d'eau, intempérie, santé publique, résultats d'examen : l'alerte de l'administration apparaît en tête du fil de sa zone, avec un avis, et disparaît à échéance.
- **Backend** : champs facultatifs dans `post.published` : `category: "alert"`, `expiresAt` borné, `provinces` (liste de `PROVINCE_SLUGS`) ; quota par page et par jour ; refus d'une alerte sur une page non officielle ; nouvelle sorte de notification `official_alert` sans contenu (le sujet est la publication) ; bandeau en tête du fil limité à une alerte active par zone ; index `posts` par catégorie et échéance. Jamais sponsorisable.
- **Web** : étiquette « Alerte officielle » distincte de « Sponsorisé » ; bandeau repliable ; filtre « Alertes » dans `/officiel`.
- **Mobile** : après le web ; push natif quand le plan 14 l'ouvre.
- **Données personnelles** : la province de l'abonné, si utilisée, reste un choix explicite du membre (plan 06).
- **Tests et cliquets** : parseur fermé, quota, échéance, zone, refus hors Officiel ; cliquet `notification-payload-content`.
- **Critères d'acceptation** : une alerte expirée ne s'affiche plus ; au plus N alertes par jour (N fixé par la décision 2) ; le retrait source retire l'alerte et son bandeau.
- **Dépend de** : PA9D (le producteur doit émettre ces champs), décision 1, décision 2.
- **Porte** : décision du propriétaire ; PR du socle.

### SU08 (volet public) — concours et recrutements publics, « Voir l'offre » · P2 · M · S1
- **Pour l'utilisateur** : les concours de la fonction publique apparaissent dans l'univers Emploi, étiquetés Officiel, avec un lien vers travail.ga.
- **Backend** : publication reflétée de catégorie `recruitment` avec lien travail.ga allowlisté ; aucune copie des données de travail.ga.
- **Web** : entrée dans l'annuaire des emplois (`routes.jobDirectory`) ; détail du volet commerce de SU08 dans le plan 09.
- **Mobile** : après le web.
- **Données personnelles** : aucune candidature dans ANTSIA pour un concours.
- **Tests et cliquets** : origine allowlistée ; étiquette calculée.
- **Critères d'acceptation** : un concours retiré à la source disparaît ; aucun frais de candidature.
- **Dépend de** : SU09 (même extension de contrat), plan 09.
- **Porte** : convention avec travail.ga (propriétaire).

### VP-04 — label Presse calculé sur attestation · P2 · M · S1
- **Pour l'utilisateur** : un titre enregistré auprès de l'autorité porte « Presse » ; le label tombe avec l'attestation.
- **Backend** : contrat entrant `PRESSE-ATTESTATION-V1` (autorité → moteur), même passerelle signée ; table d'attestations par page média ; label calculé à la lecture, jamais stocké comme vérité ; console : lecture des attestations, aucune saisie manuelle du label.
- **Web** : label sur la page, le site média et les cartes d'article.
- **Mobile** : après le web.
- **Données personnelles** : aucune donnée personnelle dans l'attestation (numéro d'enregistrement du titre seulement).
- **Tests et cliquets** : retrait d'attestation ; refus d'un label sur une page non média ; aucun badge Officiel pour un média (`isTrustAllowedForOwner`).
- **Critères d'acceptation** : aucun chemin déclaratif ou payant vers le label.
- **Dépend de** : décision 4 (autorité émettrice), SU15 (plan 10), D09 (proposée).
- **Porte** : convention avec l'autorité (HAC ou ministère, à confirmer).

### VP-05 — règle politique (D07) · P2 · S · S1
- **Pour l'utilisateur** : une page de parti ou d'élu porte « Politique » ; aucune annonce politique payante n'est possible.
- **Backend** : attribut calculé « Politique » (nature de page ou décision d'opérateur tracée, selon la décision 5) ; garde serveur qui refuse toute annonce ou mise en avant sur une page « Politique » ou une page Officielle ; drapeau « période électorale » par réseau, posé par un opérateur avec motif et dates, qui durcit les règles (décision 5).
- **Web** : étiquette sur page et cartes ; texte de règles dans `/a-propos`.
- **Mobile** : après le web.
- **Données personnelles** : aucune opinion politique de membre n'est déduite ni stockée.
- **Tests et cliquets** : nouveau cliquet `no-political-ads` (aucune annonce sur page Politique ou Officielle).
- **Critères d'acceptation** : refus testé ; étiquette retirable seulement par décision tracée.
- **Dépend de** : décision 5, avis juridique (aucune règle gabonaise trouvée, étude § 9.4).
- **Porte** : avis du juriste et de la HAC.

### VP-06 — confiance et transparence des sites médias · P1 · S · S1
- **Pour l'utilisateur** : sur le site d'un média, on voit s'il est Vérifié ou non ; on peut écrire à la rédaction et lire ses rectificatifs.
- **Backend** : projection publique **séparée** `mediaTrust` (confiance de la page, puis label Presse de VP-04) ; liste paginée des articles corrigés (versions publiées avec notice) ; contact de la rédaction par une demande filtrée vers la page (réutiliser la messagerie contextuelle si son plan l'admet, plan 01).
- **Web** : bloc « La rédaction » de `site-content.tsx` ; route `/medias/[handle]/rectificatifs` ; clés i18n fr et en.
- **Mobile** : après le web.
- **Données personnelles** : la demande de contact entre dans l'export et l'effacement du demandeur.
- **Tests et cliquets** : schéma strict du front inchangé pour l'ancienne projection ; cliquets i18n.
- **Critères d'acceptation** : un média `community` n'affiche jamais un signe de confiance ; un rectificatif reste daté et lié.
- **Dépend de** : plan 01 pour le contact.
- **Porte** : aucune.

### VP-07 — suivre un média : avis « nouvel article » · P1 · S · S1
- **Pour l'utilisateur** : quand je suis un média, je suis prévenu d'un nouvel article, sans contenu dans l'avis.
- **Backend** : à la publication (immédiate ou programmée) d'un article public, `enqueueFanout` « page_post » ou nouvelle sorte `editorial_article` vers les abonnés de la page ; débit et dédoublonnage avec l'annonce dans le fil (`editorial/social.ts`).
- **Web** : réglage dans les préférences de notification (plan 06).
- **Mobile** : la cloche mobile reprend la sorte (plan 14).
- **Données personnelles** : aucune nouvelle donnée.
- **Tests et cliquets** : `notifications-writer`, `notification-payload-content` ; une correction ne renotifie pas.
- **Critères d'acceptation** : un avis par article ; aucun avis pour un brouillon ou une correction.
- **Dépend de** : rien.
- **Porte** : aucune.

### VP-08 — agenda public des administrations · P3 · M · S1
- **Pour l'utilisateur** : les évènements publics d'une administration (réunion publique, campagne de vaccination) sur sa page.
- **Backend** : événement `event.upserted` / `event.removed` dans une extension du contrat ; réutilise la table des évènements de page (plan 07).
- **Web / Mobile** : onglet Agenda de la page Officielle.
- **Données personnelles** : aucune.
- **Tests et cliquets** : mêmes règles de révision et de retrait que les publications.
- **Critères d'acceptation** : un évènement retiré à la source disparaît.
- **Dépend de** : PA9D, plan 07.
- **Porte** : PR du socle.

### VP-09 — épinglage et archivage des comptes publics abandonnés · P2 · S · S1
- **Pour l'utilisateur** : l'administration épingle un communiqué ; une page sans activité ni attestation depuis longtemps est archivée, pas laissée « zombie ».
- **Backend** : champ `pinned` dans `page.upserted` (référence d'une publication reflétée) ; passe planifiée bornée qui marque « archivée » une page Officielle dont la preuve n'a pas été renouvelée depuis la durée fixée (décision 6) ; aucune suppression.
- **Web** : mention « Page archivée » ; plus de place dans `/officiel`.
- **Mobile** : après le web.
- **Données personnelles** : aucune.
- **Tests et cliquets** : `crons-contract` (identifiant ASCII) ; passe bornée.
- **Critères d'acceptation** : l'archivage est réversible par une nouvelle preuve ; épinglage limité à une publication.
- **Dépend de** : PA9D, décision 6.
- **Porte** : décision du propriétaire.

### VP-10 — agent public visible pour les membres · P2 · S · S1 (puis S3)
- **Pour l'utilisateur** : sur le profil d'un agent, un membre connecté voit l'administration et la fonction, comme le visiteur anonyme.
- **Backend** : réutiliser `publicAgentAffiliation` (`federation/agentAuthority.ts`) dans la projection membre du profil.
- **Web** : bloc d'affiliation sur le profil membre (plan 05 pour la mise en page).
- **Mobile** : carte d'accord et affiliation après le web (S3).
- **Données personnelles** : déjà couvertes par PA9C.
- **Tests et cliquets** : affiliation absente après retrait.
- **Critères d'acceptation** : même information pour membre et visiteur, mêmes gardes de confidentialité.
- **Dépend de** : plan 05.
- **Porte** : aucune.

### SU10 — annonces sponsorisées et bibliothèque publique · P3 · L · S1
- **Pour l'utilisateur** : une structure vérifiée peut payer pour montrer une publication ; chaque carte dit « Sponsorisé · payé par … » ; tout le monde peut consulter toutes les annonces.
- **Backend** :
  - tables `adAccounts` (structure vérifiée par PRO.GA, jamais une personne seule), `adCampaigns` (publication de page existante, dates, zone par province, univers, budget en XAF **déclaré** et facturé hors ligne), `adDeliveries` (compteurs agrégés par jour) ;
  - garde : refus sur page Officielle ou Politique (VP-05), refus de tout ciblage autre que province, univers et langue, jamais d'insertion dans Messages, iCom, groupes privés, candidatures, achats ou rencontres ;
  - insertion dans le fil par `feedRead.ts` sous plafond de densité (décision 7) et jamais deux de suite ; étiquette calculée au serveur ;
  - bibliothèque publique : toutes les annonces, actives et passées (annonceur, contenu, dates, zone, fourchette de diffusion), conservées selon la décision 8 ;
  - « Pourquoi cette annonce » (raisons réelles : zone, univers), masquer, signaler (file de modération du plan 12) ;
  - statistiques agrégées pour l'annonceur, sans donnée individuelle.
- **Web** : console annonceur dans l'espace de l'activité (`/mes-boutiques` ou « Mon activité ») ; validation par la modération avant diffusion ; route publique `/transparence/annonces` créée à la première annonce.
- **Mobile** : affichage de l'étiquette et de « Pourquoi » après le web.
- **Données personnelles** : aucune donnée de membre n'entre dans le ciblage ; les signalements suivent l'export et l'effacement du plan 12.
- **Tests et cliquets** : nouveaux cliquets `sponsored-never-in-messaging` (aucune table ou requête de messagerie ne lit `adCampaigns`) et `sponsored-label-computed` ; test de densité ; test de refus politique.
- **Critères d'acceptation** : aucune annonce sans étiquette ; aucune annonce dans Messages ; bibliothèque lisible sans compte ; arrêt immédiat d'une campagne signalée et retirée.
- **Dépend de** : D10 (proposée), VP-05, plan 12 (modération des annonces), plan 08 (vérification de la structure par PRO.GA).
- **Porte** : D10 ; présentation des règles à la HAC (A11) ; aucun encaissement en ligne (facturation hors ligne par contrat B2B).

### VP-11 — mise en avant étiquetée d'une offre · P3 · M · S1
- **Pour l'utilisateur** : un vendeur paie pour qu'une offre apparaisse, marquée « Mis en avant », dans son univers, sans remplacer le classement organique.
- **Backend** : emplacement réservé et plafonné dans les listes d'univers (`convex/modules/shops/`), étiquette calculée, entrée dans la bibliothèque de SU10.
- **Web** : mention « Mis en avant » sur la carte d'offre ; les tests qui interdisent « Sponsoris » restent vrais pour les offres non payées.
- **Mobile** : après le web.
- **Données personnelles** : aucune.
- **Tests et cliquets** : le classement organique ne change pas (test comparatif).
- **Critères d'acceptation** : jamais plus d'un emplacement par écran de liste ; aucune mise en avant cachée.
- **Dépend de** : SU10, plan 08.
- **Porte** : D10, HAC.

### VP-12 — Presse dans l'application mobile · P3 · M · S3
- **Pour l'utilisateur** : lire un média et un article dans l'application.
- **Backend** : aucun (requêtes `public/editorial.ts` existantes).
- **Web** : aucun.
- **Mobile** : écrans de lecture seulement ; la rédaction reste sur le web.
- **Données personnelles** : aucune.
- **Tests et cliquets** : parité des clés i18n mobile.
- **Critères d'acceptation** : lecture sans compte dans l'application.
- **Dépend de** : plan 14.
- **Porte** : aucune.

## 6. Ordre recommandé et dépendances

| Vague | Lots | Pourquoi dans cet ordre |
|---|---|---|
| 1 | PA9A·B·C (reprise), VP-06, VP-07 | Petits, sans porte ; prouvent l'existant et comblent les manques visibles de la presse |
| 2 | PA9D, VP-02 | PA9D est le goulot de toute la vie publique ; VP-02 évite un Officiel non attesté |
| 3 | VP-01 | Recette croisée, une fois le producteur en PR et les clés posées |
| 4 | Décision 1 puis SU09, VP-03, VP-09, SU08 (volet public) | Une seule extension du contrat, livrée côté socle et côté ANTSIA ensemble |
| 5 | VP-04, VP-05, VP-10 | Dépendent de conventions et d'avis externes |
| 6 | SU10, VP-11 | Après D10, la HAC et la modération des annonces |
| 7 | VP-08, VP-12 | Confort |

Dépendances vers d'autres plans : plan 01 (contact de la rédaction), plan 05 (profil membre), plan 06 (préférences de notification, province du membre), plan 07 (pages ordinaires, évènements), plan 08 (vérification de la structure annonceuse, offres), plan 09 (volet commerce de SU08), plan 10 (SU15 attestations), plan 12 (SU01a, signalement des annonces, transparence), plan 13 (création du réseau `administration` par la console, référencement, sitemap), plan 14 (push, mobile), plan 16 (iAsted citoyen).

## 7. Décisions à prendre par le propriétaire

1. **Étendre `RESEAU-PUBLIC-V1` ou créer une V2 ?** Recommandation : comme aucun émetteur n'est encore en service, ajouter les champs facultatifs (`category`, `expiresAt`, `provinces`, `serviceLink`, `pinned`) à la V1 **avant** la première mise en service, en une seule PR des deux côtés. Raison : éviter de maintenir deux versions dès le départ.
2. **Plafond des alertes** par page et par jour, et durée maximale. Recommandation : 3 par jour, 72 heures au plus. Raison : D06 exige des alertes « bornées » ; chiffre de départ à revoir après mesure.
3. **« Officiel » posé à la main par la console** : interdire hors reflet, ou garder à deux opérateurs ? Recommandation : garder à deux opérateurs, avec échéance de revue, pour les postes consulaires non encore fédérés (EXF-AN-48). Raison : D07 veut un badge qui « tombe avec l'attestation ».
4. **Autorité du label Presse** : HAC ou ministère. Recommandation : la poser à la HAC lors de la consultation. Raison : l'étude la laisse « à confirmer ».
5. **Règle politique** : qui pose « Politique » (nature déclarée à la création de page, ou décision d'opérateur) et ce que change la période électorale. Recommandation : nature déclarée obligatoire pour partis et élus, contrôlée par un opérateur ; en période électorale, pas de mise en avant ni de sponsorisé, même non politique, sur ces pages.
6. **Durée avant archivage** d'une page Officielle sans preuve renouvelée. Recommandation : 12 mois.
7. **Densité du sponsorisé** : au plus une carte sur dix (repère de l'étude). Recommandation : partir d'une sur quinze et mesurer.
8. **Durée de conservation de la bibliothèque** des annonces. Recommandation : au moins un an après la fin de chaque annonce ; à valider par le juriste.
9. **Ouvrir la PR PA9D dans le socle** : oui ou non, et qui la relit.

## 8. Risques et points d'attention

- **PA9D hors git** : le producteur existe seulement dans un dossier local, sur une branche de septembre chargée de milliers de modifications étrangères. Une perte de disque l'effacerait. À sauvegarder avant toute autre action, sans commit dans ce dossier (consigne du propriétaire : PR depuis `origin/main` à jour).
- **Contrat strict des deux côtés** : tout champ ajouté d'un seul côté est refusé (`invalid_payload`). Livrer le contrat et sa copie typée ensemble, avec un test de parité.
- **Projections publiques strictes** : ajouter un champ à une projection existante casse les fronts déjà en ligne ; publier une projection à part (`CLAUDE.md`, pièges).
- **Blob orphelin** possible entre stockage et inscription lors d'un import de média (ADR-0014) : à suivre dans l'entretien des blobs (plan 13).
- **Neutralité** : une page Officielle qui ferait campagne ruinerait la crédibilité du réseau d'État (D07). La règle doit être écrite avant d'ouvrir.
- **HAC** : la suspension des réseaux sociaux du 17/02/2026 et le registre des plateformes conditionnent l'ouverture de la vie publique ; démarche du propriétaire.
- **Ne rien inventer** : aucune tuile `/officiel` ni bibliothèque vide avant la première administration ou la première annonce.
- **Rapports périmés** : `docs/15` à `docs/18` et les ADR-0013 à 0016 disent encore « non vérifié » ; ne pas les présenter comme preuve, ni comme preuve d'absence.

## 9. Prompts d'implémentation

### Prompt — PA9A·B·C (reprise)
```
Tu travailles dans ANTSIA (session S1), sur une branche dédiée tirée d'origin/main.
Lis : CLAUDE.md, docs/15 à 18, ADR-0013 à 0016, docs/contrats/RESEAU-PUBLIC-V1.md.
Périmètre : convex/modules/federation/*.test.ts, docs/15 à 18, encart « État » de docs/01.
1. Lance bunx vitest run --config convex/vitest.config.ts modules/federation et cite la sortie.
2. Vérifie la présence des cas : publication sans publishToAntsia, page non officielle,
   émetteur désactivé, retrait avant création, corps personnel absent des lettres mortes.
   Ajoute ceux qui manquent, sans toucher au code de production sauf défaut prouvé.
3. Mets à jour les rapports : ce qui est exécuté, avec la date et la sortie.
4. bun run verify vert. Commits en français, git add -- <chemins>.
Arrête-toi et demande avant toute modification de code de production ou de convex/schema.ts.
```

### Prompt — PA9D (PR dans le socle)
```
Tu prépares une PR dans administration-ga/administration.ga (le socle). Rien n'est publié.
Lis : ANTSIA docs/18_PRODUCTEUR_ET_OUTBOX_ADMINISTRATION_PA9D.md, ADR-0016, RESEAU-PUBLIC-V1,
socle/AGENTS.md. Source : dossier local ADMINISTRATION_GA, fichiers non suivis
socle/convex/modules/reseauPublicFederation/ et socle/packages/federation-contracts/src/reseau-public-v1/.
1. Copie d'abord ces fichiers hors du dépôt, en lecture seule, pour les sauvegarder.
2. Crée une copie de travail propre du socle depuis origin/main à jour, branche dédiée.
3. Reporte les fichiers PA9D un par un ; pour chaque raccordement (reseauPages/pages.ts,
   reseauPersonnel/posts.ts et tables.ts, PostComposer.tsx, retrait commun, schema.ts,
   crons.ts, config/v4.4/flows.json), compare au code actuel et n'apporte que le diff PA9D.
4. Ajoute un test de parité entre la copie typée du contrat et celle d'ANTSIA.
5. Lance la vérification du socle ; cite la sortie.
Livrable : branche poussée et PR ouverte en brouillon, description en français.
Arrête-toi avant de pousser : demande l'accord du propriétaire (décision 9 du plan 11).
Ne modifie aucun .env, aucune variable de déploiement, aucun environnement réel.
```

### Prompt — VP-01 (recette croisée)
```
Recette de développement de la fédération administration.ga → ANTSIA (session S1).
Prérequis : PR PA9D disponible, clés de développement posées par le propriétaire.
Lis : cahier § 16 lot A5 (R5, R6), docs/16, docs/17, console-federation.tsx.
1. Vérifie dans la console : réseau administration fermé, miroir, enfant de la racine ;
   émetteur administration-ga actif. Ne crée rien en production.
2. Joue : page créée, révision ancienne ignorée, publication avec image (analyse propre),
   retrait, cascade de page, lettre morte puis rejeu, accord d'agent, retrait, effacement.
3. Captures à 390, 834 et 1440 px, clair et sombre ; rapport dans
   docs/recette/vie-publique-pa9-<date>/RAPPORT.md (texte seul, sans identifiant interne).
Arrête-toi à tout écart et décris-le ; aucune commande vers la production.
```

### Prompt — VP-06 (confiance des sites médias)
```
Session S1, branche dédiée. Lis : 05_PRESSE.md § 5, 14_PRESSE_MP12_MP13.md,
convex/modules/public/editorial.ts, convex/modules/editorial/validators.ts,
apps/antsia_ga/src/components/editorial/site-content.tsx, apps/antsia_ga/src/lib/public-data.ts.
1. Ajoute une projection publique SÉPARÉE mediaTrust (confiance de la page) ; ne modifie pas
   editorialPublishedMediaValidator (schéma Zod strict du front en ligne).
2. Ajoute la liste paginée des articles corrigés et la route /medias/[handle]/rectificatifs
   (routes.ts, i18n fr et en).
3. Affiche le signe de confiance dans le bloc « La rédaction » ; rien pour community.
4. bun run verify ; recette à 390, 834, 1440 px, clair et sombre, sur un média de démo.
Le contact de la rédaction attend le plan 01 : ne le code pas ici.
```

### Prompt — VP-07 (avis « nouvel article »)
```
Session S1, branche dédiée. Lis : convex/modules/editorial/{articles,jobs,social}.ts,
convex/modules/pages/pages.ts (enqueueFanout page_post), packages/social-domain/src/notifications.ts.
1. À la publication publique d'un article (immédiate ou programmée), envoie un avis
   aux abonnés de la page, sans contenu ; dédoublonne avec l'annonce dans le fil.
2. Aucune renotification pour une correction.
3. Tests : notifications-writer, notification-payload-content, correction sans avis.
4. bun run verify. Demande avant d'ajouter une sorte à NOTIFICATION_KINDS (fichier partagé
   avec la cloche mobile, plan 14).
```

## 10. Sources lues

- Brief commun ; dossier de reprise du 9/11 (§ 2, § 10, § 11).
- ADR 0003, 0012, 0013, 0014, 0015, 0016, 0035.
- `docs/13_RAPPORT_RESEAU_PUBLIC_PA8.md` (titres), `docs/15` à `docs/18`.
- Contrats `RESEAU-PUBLIC-V1.md` (structure et événements), `FEDERATION-INBOX-V1.md` (mention).
- Cahier : M-A13, EXF-AN-36, 37, 44, 48, 49, 50, 51, 52, § 13, lots A5 et A6, R5, R6, § 20 (A4, A7).
- Étude sept univers § 9, 10, 12, 14, 15, 18 ; `SU01_CONFORMITE_ORDONNANCE_0011.md` (art. 25 à 29, A6, A7, A8, A11) ; `EXECUTION.md` (aucun lot SU08–SU10 exécuté).
- Marketplace : `05_PRESSE.md`, `14_PRESSE_MP12_MP13.md`, `16_RAPPORT_LIVRAISON_MP00_MP14.md`.
- Refonte sociale `04_PARCOURS_FIL_ET_PUBLICATIONS.md` (sponsorisé non activé) ; `COMPLEMENTS_SOCIAUX_2026-10-21.md` ; plan du programme (D4, sponsoring étiqueté).
- Recette `docs/recette/espaces-specialises-2026-10-25/rapport.md`.
- Vault : décisions PA9 (pages et médias), PA9C, PA9D.
- Code : `convex/modules/{federation,editorial,public,pages,posts,notifications,shops}`, `convex/http.ts`, `convex/vitest.config.ts`, `packages/social-domain/src/{reseauPublic,federationProtocol,agentConsentTransfer,editorial,editorialAssets,badges,notifications}.ts`, `apps/antsia_ga/src/{components/editorial,components/public,components/discovery,lib/routes.ts,i18n}`, `apps/admin_antsia_ga/src/components/console-{federation,pages}.tsx`, `apps/antsia_mobile/src/screens`.
- Socle local (lecture seule, `git status`) : `socle/convex/modules/reseauPublicFederation/`, `socle/packages/federation-contracts/`.
