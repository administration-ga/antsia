# Plan 16 — iAsted, l'assistant dans ANTSIA

> Constaté par lecture du code d'`origin/main` (ANTSIA `26741caa`, DIASPORALE `bead76d`), le 9 novembre 2026. Rien n'a été exécuté.
> Applications de référence : Meta AI dans WhatsApp, Instagram et Messenger ; les assistants d'achat (ChatGPT, Google, Rufus d'Amazon) ; les agents de WhatsApp Business ; My AI de Snapchat ; l'aide à la rédaction de LinkedIn. Comparaison faite de mémoire (état des produits à la mi-2026), non revérifiée en ligne.
> PRO.GA est cité à titre indicatif : branche locale `feat/antsia-social-commerce` (`fa349ea`, 19/10/2026), arbre modifié, non autoritaire.

Termes employés :
- **passerelle** : le seul module serveur par lequel passe tout appel au modèle d'IA ; il décide du droit, du quota, du modèle et tient le journal ;
- **modèle** : le moteur d'IA d'un fournisseur (ici, proposé : la famille Claude), appelé par la passerelle ;
- **fournisseur déterministe** : un répondeur sans IA, qui suit les mêmes règles ; il sert aux tests et au repli ;
- **injection de consignes** : un texte caché dans une annonce ou une page qui tente de donner des ordres à l'assistant ;
- **coupe-circuit** : interrupteur de la console qui arrête iAsted pour un réseau ou partout, sur-le-champ.

## 1. L'intention du propriétaire

| Intention | Source |
|---|---|
| iAsted entre dans ANTSIA : l'exclusion décidée à la duplication du socle est levée. Option « laisser iAsted dehors » rejetée : la recherche entre vendeurs, les besoins et les alertes n'existent nulle part ailleurs. | ADR-0035, D05 et option D ; étude sept univers, § 11 |
| Trois rôles : **iAsted du membre** (comprendre, chercher, comparer, expliquer, alerter, préparer) ; **agent du vendeur** (répond dans iCom Pro depuis le catalogue approuvé, passe la main) ; **iAsted citoyen** (oriente vers l'administration compétente, cite les publications Officielles). | ADR-0035, D05 ; étude, § 11.2 |
| Quatre étapes dans l'ordre : a · chercher (lecture seule) → b · agent du vendeur → c · actions confirmées → d · mandats d'achat (après ouverture des paiements). Lots SU11, SU12, SU13. | ADR-0035 ; étude, § 11.3 et § 15 |
| Garde-fous fixés (repris tels quels au § 5) : il se dit IA et marque ce qu'il produit ; aucun engagement sans confirmation ; il ne lit ni les messages privés, ni les rencontres, ni les candidatures d'autrui ; aucun profilage politique ou sensible ; raisons et sources visibles ; sponsorisé jamais mélangé ; mémoire choisie, exportable, effaçable ; quotas, coupe-circuit, journal ; le contenu des annonces est une donnée, jamais une consigne ; réponses limitées au catalogue vérifié. | ADR-0035 ; étude, § 11.2 |
| Gratuit pour le membre (« le citoyen ne paie jamais ») ; l'agent du vendeur reste dans l'offre PRO.GA. | ADR-0035 ; étude, § 11.5 et § 14 |
| Aucun fournisseur ni modèle codé en dur ; tout passe par la passerelle du plan iAsted 2.0 (droits, crédits, classes de données, journal, coupe-circuit) ; la classe « Secrète » n'admet qu'un modèle souverain. | ADR-0035 ; `DOCUMENTATION/IASTED/PLAN_IASTED_2026-09-27.md`, § 11.1 et § 11.2 |
| Le marquage de l'IA (SU01i) précède l'iAsted du membre (SU11) ; marquage dès qu'iAsted produit ; détection des contenus d'IA importés vers la mi-avril 2027 (art. 53). | `SU01_CONFORMITE_ORDONNANCE_0011.md`, § 2.3 et § 4 |
| Place dans la navigation : « Demander à iAsted… » en tête de Découvrir, sans nouvelle icône (cinq destinations). | Étude, § 12 ; ADR-0034 |
| Déjà refusé : traduction automatique (hors périmètre du cahier et de DIASPORALE) ; toute IA « ajoutée sous prétexte de ressembler à Instagram ». | Cahier, § 8 « Hors périmètre » ; DIASPORALE `docs/00`, § 8.15 ; étude responsive `04_PLAN_IMPLEMENTATION.md`, l. 79 |

## 2. Ce qui existe

**Aucune ligne d'IA dans ANTSIA.** Motifs cherchés dans `convex/`, `packages/`, `apps/`, `scripts/`, `tests/` : `iasted`, `assistant`, `llm`, `anthropic`, `openai`, `gemini`, `embedding`, `vectorIndex`, `translat`, `transcri`. Les seules occurrences d'« iAsted » sont des en-têtes de provenance qui disent son **retrait** (`convex/modules/messaging/messages.ts`, `packages/social-features/src/stores/call-store.ts`, `packages/social-features/src/features/iappel/CallRoomMount.tsx`, `packages/api/src/routing/use-tab-query-state.ts`). Aucune dépendance d'IA dans `package.json`.

| Capacité | État | Web | Mobile | Preuve |
|---|---|---|---|---|
| Conversation avec iAsted (membre) | Absent | — | — | motifs ci-dessus ; `apps/antsia_ga/src/i18n/locales/fr/` sans clé d'assistant |
| Passerelle (droit, quota, modèle, journal, coupe-circuit) | Absent | — | — | aucun module ; `convex/lib/rateLimit.ts` sans seau `assistant.*` |
| Marquage des contenus d'IA (champ, étiquette, métadonnées d'origine) | Absent | — | — | aucun champ d'origine dans `convex/modules/*/tables.ts` |
| Mention « générée par IA » des images de démonstration | Partiel | oui | — | `convex/seeds/demoMediaManifest.ts` (texte alternatif seulement ; aucun marquage visible ni métadonnée) |
| Motifs de signalement des contenus d'IA (hypertrucage, contenu d'IA interdit) | Présent | oui | — | `packages/social-domain/src/moderation.ts` (`deepfake_of_me`, `prohibited_ai_content`, SU01d) |
| Recherche structurée des offres (filtres, tri, pagination) sur laquelle iAsted s'appuierait | Présent | oui | partiel | `convex/modules/shops/marketplace.ts`, `marketplaceRead.ts`, `catalogValidators.ts` (`marketplaceFilterArgs`), index `search_marketplace` dans `catalogTables.ts` |
| Repli des accents pour la recherche | Présent | oui | — | `packages/social-domain/src/searchText.ts` |
| Adresse de la marketplace avec filtres pré-remplis | Présent | oui | — | `apps/antsia_ga/src/lib/routes.ts` (`marketplace(search)`) |
| Index sémantique des offres | Absent | — | — | aucun `vectorIndex` dans `convex/` |
| Besoin du particulier (« Je cherche… ») et alertes | Absent | — | — | motifs `need`, `besoin`, `savedSearch`, `searchAlert`, `offerAlert`, `wishlist` : rien |
| Contact commercial filtré vers une boutique | Fermé | oui | — | `convex/modules/commercialMessaging/threads.ts` (`requestContact`) ; fermé tant que `commercialNetworkPolicies.enabled` n'est pas vrai (`operator.ts`) ; ADR-0021 « Proposé » |
| Message d'un agent automatique dans iCom Pro | Absent | — | — | `commercialMessaging/tables.ts` : `senderKind` = `requester` ou `shop`, `senderPersonId` obligatoire |
| Agent du vendeur (PRO.GA) | Partiel (hors ANTSIA) | — | — | PRO.GA `convex/modules/commercialAgent/tables.ts` : canal `public_site` seul ; sources approuvées, offres épinglées, outils fermés par défaut, passage à un humain (`handoffs.ts`) |
| Pages Officielles repérables (confiance calculée, index par rang) | Présent | oui | partiel | `convex/modules/pages/tables.ts` (`trust`, `trustRank`, index `by_root_status_trustRank_createdAt`) |
| Recherche plein texte limitée aux publications Officielles | Partiel | — | — | `posts/tables.ts` : `search_body_v2` filtre réseau, statut, racine ; aucun filtre « page Officielle » |
| Orientation vers l'administration (iAsted citoyen) | Absent | — | — | existe seulement au socle (demarche.ga), d'après l'étude, § 11.1 |
| Panier préparé | Présent (côté navigateur) | oui | — | `apps/antsia_ga/src/lib/cart-book.ts`, `cart-draft.ts` (stockage de session) |
| Demande de devis d'un service | Présent | oui | — | `convex/modules/shops/services.ts` (`quoteRequestContext`, `myRequests`) |
| Consentements horodatés et révocables | Présent (aucune finalité iAsted) | oui | — | `packages/social-domain/src/consent.ts` (`CONSENT_PURPOSES`) |
| Export et effacement dérivés du schéma | Présent | oui | — | `convex/modules/people/dataInventory.ts`, `dataPolicies.ts`, `erasure.ts` |
| Entrée « Demander à iAsted » dans Découvrir | Absent | — | — | `apps/antsia_ga/src/components/discovery/discover-screen.tsx` : piliers et recherche par mot-dièse seulement |
| Console : politique, quotas, consommation, journal d'iAsted | Absent | — | — | `apps/admin_antsia_ga/src/components/console-*.tsx` : aucun écran |
| Aide à la rédaction, traduction, résumé, transcription, description d'image | Absent | — | — | motifs `translat`, `transcri`, `summar`, `résumé` ; les textes alternatifs des médias sont saisis par l'auteur (`posts/tables.ts`, `altText`) |
| Mandats d'achat | Fermé | — | — | paiements fermés (MP08) ; étape d de D05 |

### Ce qui est écrit mais jamais recetté en réel

Rien à recetter pour iAsted : aucune ligne n'existe. Les briques d'appui ne sont pas recettées en réel pour cet usage :
- l'index de la marketplace est « prêt mais vide » faute de vrai catalogue PRO.GA reflété (dossier de reprise, § 10.1, 9/11/2026) ;
- le contact commercial P10 a ses sources raccordées, « vérifications et activation différées » (ADR-0021) ; « Recette à deux vraies identités en production : jamais exercée » (reprise, § 10.1) ;
- l'agent commercial de PRO.GA : aucune recette citée ; non exécuté par ce plan.

## 3. Comparaison avec les applications de référence

| Capacité | Meta AI | Assistants d'achat (ChatGPT, Google, Rufus) | Agents WhatsApp Business | My AI | Aide LinkedIn | ANTSIA | Verdict |
|---|---|---|---|---|---|---|---|
| Assistant conversationnel dans l'application | oui | oui | — | oui | — | absent | À faire (SU11b), limité au périmètre de D05 |
| Besoin dit en langage courant → résultats | oui | oui | — | partiel | — | absent | À faire (SU11b) |
| Résultats tirés d'un catalogue réel, avec raisons du classement | partiel | oui | — | — | — | absent | À faire (SU11b) : raisons calculées, sources visibles |
| Comparaison d'offres | — | oui | — | — | — | absent | À adapter (SU11b) : comparaison des seuls champs du catalogue |
| Alertes de prix ou de disponibilité | — | oui (selon le produit) | — | — | — | absent | À adapter (SU11c) : alerte sur une offre compatible nouvelle |
| Préparer un panier ou un achat, confirmé par la personne | — | oui | partiel | — | — | absent | À faire (SU13) ; achat lui-même fermé (paiements) |
| Agent qui répond pour une entreprise, puis passe la main à un humain | partiel | — | oui | — | — | absent (existe dans PRO.GA) | À faire (SU12) |
| Mention claire « IA » sur chaque réponse | oui | oui | variable | oui | partiel | absent | À faire (SU01i), obligatoire (ordonnance, art. 53) |
| Mémoire de l'utilisateur, visible et effaçable | oui | partiel | — | oui | — | absent | À adapter (IA-02) : seulement ce que la personne choisit |
| Résumé de conversations | oui | — | — | — | — | absent | Écarté : lirait les messages privés (garde-fou D05) |
| Traduction | oui | — | — | — | — | absent | Écarté : hors périmètre du cahier |
| Aide à la rédaction d'une publication | oui | — | — | — | oui | absent | Reporté (IA-08, P3) : brouillon marqué, sur demande |
| Génération d'images | oui | — | — | oui | — | absent | Écarté : risques d'hypertrucage (art. 32), aucune demande |
| IA dans les conversations entre personnes | oui | — | — | oui | — | absent | Écarté : jamais dans iCom personnel |
| Publicité dans les réponses | variable | variable | — | variable | — | absent | Écarté : sponsorisé jamais mélangé (D05, D06) |

## 4. Ce qui manque

### 4.1 Bloquant avant l'ouverture au public

Rien : iAsted ne fait pas partie du jalon « prêt à ouvrir » (plan directeur, jalon 4). En revanche, **avant d'ouvrir iAsted au membre**, sont bloquants : le marquage (SU01i), la passerelle avec coupe-circuit et quotas (SU11a), le banc d'évaluation au vert (IA-05), la déclaration du traitement à l'APDPVP (SU01, § 5) et la clé du fournisseur (propriétaire).

### 4.2 Attendu par les utilisateurs

1. Demander en langage courant et recevoir de vraies offres, avec raisons (SU11b).
2. Une étiquette « IA » nette sur chaque réponse (SU01i).
3. Créer une alerte « préviens-moi quand… » (SU11c).
4. Obtenir une réponse rapide d'une boutique, puis un humain (SU12).
5. Passer de la réponse à l'action en un geste confirmé : écrire à la boutique, ajouter au panier, demander un devis (SU13).
6. Voir et effacer ce dont l'assistant se souvient (IA-02).

### 4.3 Différenciant pour ANTSIA

- **Confiance d'État** : les badges calculés (Officiel, Vérifié) entrent dans les raisons du classement ; les publications Officielles sont citées (IA-03).
- **Aucun classement payé caché** : le sponsorisé reste à part, hors des réponses.
- **Faible débit** : réponses courtes, cartes sans image par défaut, lien vers la marketplace filtrée plutôt qu'un long texte.
- **Souveraineté graduée** : classes de données, caviardage avant envoi, modèle choisi par configuration.
- **Lien avec le commerce et l'administration** : l'agent du vendeur répond depuis le catalogue PRO.GA approuvé ; l'iAsted citoyen renvoie vers l'administration compétente.

### 4.4 Écarté ou reporté, et pourquoi

| Idée | Décision | Raison |
|---|---|---|
| Aide à la rédaction d'une publication ou d'une annonce | Reportée, P3 (IA-08) | Utile aux vendeurs ; brouillon marqué, jamais publié seul ; après SU11 et l'évaluation |
| Traduction | Écartée | « Traduction automatique » hors périmètre du cahier (§ 8) et de DIASPORALE (§ 8.15) ; à rouvrir par décision |
| Résumé d'une conversation | Écarté | Lirait les messages privés : contraire à D05 |
| Transcription d'un message vocal | Écartée pour l'instant | Enverrait un message privé au fournisseur ; à rouvrir seulement à la demande du destinataire, si le propriétaire le décide (décision 9) |
| Description automatique d'une image pour l'accessibilité | Reportée, P3 (IA-08) | Proposée à l'auteur avant publication, modifiable, marquée ; l'image publique part chez le fournisseur : classe « Publique » seulement |
| Index sémantique (vecteurs) | Reporté, P3 (IA-04) | D'abord mesurer la recherche lexicale guidée par iAsted ; coût et volume |
| Mandats d'achat (étape d) | Fermé | Paiements non contractés |
| Voix temps réel | Écartée en V1 | La voix fait l'essentiel du coût (plan iAsted 2.0, § 10.4) ; débit 3G |
| iAsted dans DIASPORALE (concierge) | Hors de ce plan | Option V2 de DIASPORALE (`docs/00`, EXF-DG-48) ; réutilisera la passerelle (plan 15) |

## 5. Lots d'implémentation

Règles communes à tous les lots :
- nouveau module `convex/modules/assistant/` ; `networkId` sur toute table ; `requireMembership` en tête de toute fonction ; refus indistinct ; module ajouté à la liste du cliquet `network-scoped-functions` ;
- toute écriture : adhésion → éligibilité → débit (seaux `assistant.*` dans `convex/lib/rateLimit.ts`) → droit ;
- le modèle ne reçoit **jamais** : messages personnels, conversations contextuelles, rencontres, candidatures, données d'identification ; il reçoit des projections publiques déjà filtrées par le moteur ;
- tout texte venu d'une annonce, d'une page ou d'une publication est encadré comme **donnée** dans le contexte du modèle ;
- textes en français et en anglais (i18n, mêmes clés) ; aucune couleur ni URL en dur ;
- chaque lot finit par `bun run verify` vert et une recette à 390, 834 et 1440 px, clair et sombre.

### IA-01 — ADR « iAsted dans ANTSIA » et avenant au cahier · priorité P2 · taille S · session S1
- **Pour l'utilisateur** : rien de visible ; fixe les règles avant le code.
- **Backend** : aucun code. ADR-0040+ (numéro libre au moment du lot) : emplacement de la passerelle, configuration du modèle, classes de données, quotas, rétention, finalité de consentement `assistant`, contrat PRO-COMMERCE-AGENT-V1 (pour SU12). Avenant au cahier : exigences `EXF-AN-54` et suivantes annoncées par ADR-0035 et jamais écrites (aucune occurrence dans `docs/00`).
- **Web / Mobile** : aucun.
- **Données personnelles** : inventaire des traitements pour le dossier APDPVP.
- **Tests et cliquets** : aucun.
- **Critères d'acceptation** : ADR accepté par le propriétaire ; décisions 1 à 6 du § 7 tranchées ; avenant inséré.
- **Dépend de** : ADR-0035.
- **Porte** : décision du propriétaire.

### SU01i — Marquage des contenus d'IA (partie iAsted) · priorité P2 · taille M · session S1
- **Pour l'utilisateur** : chaque réponse, carte, brouillon ou message produit par iAsted porte une étiquette visible et permanente « Produit par iAsted, une IA » ; impossible à retirer en copiant dans un brouillon.
- **Backend** : validateur partagé `aiOrigin` (`kind: "assistant"`, version de la passerelle, fournisseur, modèle, date) dans `packages/social-domain/src/` ; champ obligatoire sur toute ligne écrite par iAsted (tables de SU11b, SU12, IA-08) ; métadonnées d'origine conservées pour une réquisition de la HAC (transmission sous huitaine : fonction opérateur tracée par `appendAudit`) ; règles d'iAsted : refus des interdits de l'article 32.
- **Web** : composant `AiLabel` (lucide-react `Sparkles` ou équivalent neutre, jamais le logo d'un fournisseur) dans `packages/ui` ; utilisé par toutes les surfaces d'iAsted ; lecteur d'écran : texte complet.
- **Mobile** : le même libellé quand le mobile portera iAsted (IA-07).
- **Données personnelles** : métadonnées sans contenu personnel ; durée alignée sur SU01g (arbitrage A2).
- **Tests et cliquets** : nouveau cliquet `ai-origin-label` (toute table d'iAsted déclare `aiOrigin` ; tout composant qui rend une sortie d'iAsted rend `AiLabel`).
- **Critères d'acceptation** : aucune sortie d'iAsted sans étiquette (test) ; métadonnées lisibles par la console ; texte de la règle publié dans `/mentions-legales` ou les règles d'utilisation.
- **Dépend de** : IA-01 ; la **détection** des contenus d'IA publiés par les membres relève du plan 12 (échéance art. 53).
- **Porte** : aucune pour le code ; texte relu par le juriste (arbitrage A10).

### SU11a — Passerelle iAsted dans le moteur · priorité P2 · taille L · session S1
- **Pour l'utilisateur** : iAsted répond, ou dit clairement qu'il est indisponible ou que le quota du jour est atteint.
- **Backend** :
  - tables : `assistantNetworkPolicies` (par réseau, **fermé par défaut**, comme `commercialNetworkPolicies`) ; `assistantRuntimeConfig` (fournisseur, modèle, version du gabarit, coupe-circuit global, plafonds) ; `assistantUsageDaily` (par personne, réseau, jour : tours, jetons d'entrée et de sortie, erreurs) ; `assistantRuns` (journal **sans contenu** : corrélation, modèle, jetons, latence, issue, code d'erreur) ;
  - port fournisseur (sur le modèle de PRO.GA `providerPort.ts`) : un adaptateur du fournisseur choisi (SDK officiel déclaré au catalogue de `package.json`) et un fournisseur déterministe ; le modèle est lu dans la configuration (variable d'environnement Convex, réglable en console), **jamais** une constante du code ;
  - chaîne d'un tour : identité et adhésion → politique du réseau → coupe-circuit → quota (réserver, régler, rendre) → classification et caviardage (téléphones, numéros d'identité, adresses électroniques retirés avant envoi) → appel → garde de sortie (langue fr ou en, étiquette, aucune URL hors `routes.ts`) → journal ;
  - bornes de coût : historique coupé côté serveur (nombre de tours et taille fixés par la configuration), contexte limité aux N meilleures offres projetées, cache des parties fixes (consignes, outils), plafond de sortie, plafond journalier par personne, plafond global par réseau ; au-delà : refus poli, jamais d'appel ;
  - panne du compteur : ouverture bornée par session, jamais illimitée (plan iAsted 2.0, § 10.3) ;
  - classe « Secrète » : refusée d'office (ANTSIA ne traite aucune donnée de cette classe).
- **Web** : aucun écran (SU11b) ; message d'indisponibilité traduit.
- **Mobile** : aucun.
- **Données personnelles** : journal sans contenu ; `assistantUsageDaily` purgé après une durée fixée en IA-01 ; entre dans l'inventaire d'effacement.
- **Tests et cliquets** : tests convex-test avec le fournisseur déterministe (quota, coupe-circuit, politique fermée, caviardage, rejeu idempotent) ; cliquet `assistant-gateway-only` : aucun appel au SDK du fournisseur hors de l'adaptateur ; aucune chaîne `claude-`, `gpt-`, `gemini-` dans `convex/` hors des tests ; `crons-contract` étendu si une purge est planifiée.
- **Critères d'acceptation** : coupe-circuit effectif au tour suivant ; quota atteint = aucun appel sortant (test) ; changer de modèle sans redéploiement du code ; journal sans aucun texte de l'utilisateur.
- **Dépend de** : IA-01, SU01i.
- **Porte** : clé et contrat du fournisseur (propriétaire) ; variables d'environnement (propriétaire) ; fichiers partagés `convex/schema.ts`, `package.json`, `bun.lock` (S1).

### SU11b — iAsted du membre : chercher en langage courant · priorité P2 · taille L · session S1
- **Pour l'utilisateur** : en tête de Découvrir, un champ « Demander à iAsted… » ; la personne écrit « une robe wax pour un mariage à Owendo, moins de 30 000 F » ; iAsted répond par trois à cinq cartes d'offres réelles, chacune avec ses raisons (« Vendeur vérifié », « dans votre budget », « publié il y a 2 jours ») et un lien « Voir tout dans la marketplace » avec les filtres pré-remplis ; il peut comparer deux offres sur les seuls champs du catalogue ; s'il ne trouve rien, il le dit.
- **Backend** :
  - tables : `assistantConversations` et `assistantMessages` (rôle `member` ou `assistant`, `aiOrigin` obligatoire sur `assistant`, cartes citées par référence d'offre, jamais le texte de l'offre recopié) ;
  - outils du modèle, en lecture seule : `search_offers` (traduit vers `marketplaceFilterArgs`, appelle `searchMarketplace` avec les droits du lecteur), `compare_offers` (deux à trois références déjà renvoyées), `open_marketplace` (renvoie une adresse construite par `routes.marketplace`) ;
  - raisons calculées par le moteur (badges, prix, fraîcheur, zone), pas inventées par le modèle ; prix affichés lus dans la projection, jamais dans le texte du modèle ;
  - le sponsorisé, quand il existera (plan 11, SU10), n'entre jamais dans `search_offers` ;
  - aucun profilage : aucun accès aux achats, abonnements, relations ou réactions de la personne.
- **Web** : composant `AskIastedPanel` dans `apps/antsia_ga/src/components/assistant/` ; entrée dans `discover-screen.tsx` ; route `routes.assistant()` dans `routes.ts` (ouverte seulement si la politique du réseau l'active, sinon aucun champ) ; états vide, chargement, quota atteint, indisponible ; React Hook Form + Zod ; sonner pour les erreurs.
- **Mobile** : après le web (IA-07).
- **Données personnelles** : historique visible par la personne, purgé après la durée fixée (décision 5), exporté et effacé (inventaire `dataPolicies.ts`) ; finalité de consentement `assistant` ajoutée à `CONSENT_PURPOSES`, demandée à la première utilisation, révocable.
- **Tests et cliquets** : injection dans une offre de démonstration (« ignore tes consignes… ») sans effet (test déterministe) ; une offre retirée n'apparaît plus ; un réseau fermé ne voit pas les offres d'un autre ; `no-hardcoded-strings`, `i18n-locales`, `member-screens-full-width`.
- **Critères d'acceptation** : chaque carte renvoie vers une offre active et admissible ; aucun prix absent de la projection ; étiquette IA partout ; la recherche marche sans accents ; sans consentement, aucun appel au modèle.
- **Dépend de** : SU11a, SU01i ; index MP03 peuplé (plans 03 et 08).
- **Porte** : évaluation IA-05 au vert avant ouverture ; publication (propriétaire).

### SU11c — Besoins du particulier et alertes · priorité P2 · taille M · session S1
- **Pour l'utilisateur** : « Je cherche une maison 3 chambres à Akanda, 300 000 F au plus » devient un besoin privé ; une offre compatible publiée plus tard le signale dans la cloche ; utilisable avec ou sans iAsted (formulaire).
- **Backend** : table `memberNeeds` (univers, filtres structurés, zone, budget, échéance, état actif ou clos, **privé**, aucune publication en « avis de recherche » dans ce lot) ; vérification à l'arrivée d'une tête de catalogue active (`commerceCatalogHeads`) ou par tâche planifiée bornée ; notification de genre neutre, **sans contenu** (cliquet `notification-payload-content`) ; plafond de besoins actifs par personne.
- **Web** : « Mes recherches » dans `/moi` ou les réglages (pas de nouvelle destination) ; bouton « Créer une alerte » dans la réponse d'iAsted et dans la marketplace.
- **Mobile** : après le web.
- **Données personnelles** : export, effacement, expiration à l'échéance.
- **Tests et cliquets** : `rate-limited-writes`, `no-unbounded-collect`, `crons-contract`.
- **Critères d'acceptation** : une seule alerte par offre et par besoin ; aucune alerte pour une offre d'un réseau que la personne ne lit pas ; besoin clos = plus d'alerte.
- **Dépend de** : SU11a (pour la version iAsted seulement) ; plan 06 (notifications), plan 03 (recherche).
- **Porte** : aucune pour le formulaire ; publication.

### IA-02 — Mémoire choisie et journal « Ce qu'iAsted a fait pour moi » · priorité P2 · taille M · session S1
- **Pour l'utilisateur** : une page qui montre ce dont iAsted se souvient (seulement ce que la personne a demandé de retenir : ville, budget habituel, langue) et ce qu'il a fait (recherches, alertes créées, brouillons préparés) ; « Oublier » et « Tout effacer ».
- **Backend** : table `assistantMemoryNotes` (texte court saisi ou accepté par la personne, jamais inféré) ; lecture du journal par la personne seule.
- **Web** : écran dans `/parametres` (section iAsted) et lien depuis le panneau.
- **Mobile** : après le web.
- **Données personnelles** : export, effacement immédiat, purge des notes non relues (durée en IA-01).
- **Tests et cliquets** : aucune note créée sans geste de la personne (test).
- **Critères d'acceptation** : effacer vide la mémoire au tour suivant ; le journal ne montre que la personne elle-même.
- **Dépend de** : SU11b.
- **Porte** : aucune.

### IA-06 — Console iAsted : politique, coupe-circuit, consommation · priorité P2 · taille M · session S1
- **Pour l'utilisateur** : l'opérateur active iAsted par réseau, coupe tout en un geste, voit la consommation par jour (tours, jetons, erreurs, refus pour quota) et les réponses signalées comme inutiles.
- **Backend** : `operatorQuery` et `operatorMutation` sur les tables de SU11a ; motif obligatoire et `appendAudit` (cliquet `operator-audit`).
- **Web** : `apps/admin_antsia_ga/src/components/console-assistant-policy.tsx`, branché dans le tableau de bord de la console.
- **Mobile** : sans objet.
- **Données personnelles** : agrégats sans identité ni contenu.
- **Tests et cliquets** : `operator-audit`, `i18n-locales`.
- **Critères d'acceptation** : coupe-circuit visible et tracé ; coût mesuré en jetons (conversion en argent par la grille du fournisseur, non codée).
- **Dépend de** : SU11a ; plan 13 (console).
- **Porte** : aucune.

### IA-05 — Banc d'évaluation : exactitude, injection, fuite, biais · priorité P2 · taille M · session S1
- **Pour l'utilisateur** : rien de visible ; garantit qu'iAsted ne ment pas sur un prix et ne se laisse pas détourner.
- **Backend** : jeu de conversations de référence en français et en anglais dans `tests/assistant/` ; quatre familles : **exactitude** (prix, disponibilité, zone conformes à la projection) ; **injection** (consignes cachées dans des offres, pages et publications de démonstration) ; **fuite entre vendeurs** (l'agent d'une boutique ne cite jamais une autre boutique ni ses sources) ; **biais** (classement stable selon la province, la taille du vendeur, la langue). Exécution déterministe dans `verify` ; exécution réelle avec le modèle configuré, à la main, sur la démonstration, avec la clé du propriétaire.
- **Web / Mobile** : aucun.
- **Données personnelles** : comptes et offres de démonstration seulement.
- **Tests et cliquets** : une régression bloque la publication (règle du plan iAsted 2.0, § 12).
- **Critères d'acceptation** : 100 % des prix cités conformes ; aucune injection suivie ; aucune fuite ; rapport daté dans `docs/recette/`.
- **Dépend de** : SU11a ; s'étend avec SU11b, SU12, SU13, IA-03.
- **Porte** : clé du fournisseur pour l'exécution réelle.

### IA-03 — iAsted citoyen : orienter et citer l'Officiel · priorité P2 · taille M · session S1
- **Pour l'utilisateur** : « où refaire mon passeport ? » → iAsted cite les pages et publications Officielles reflétées qui en parlent, avec lien, et renvoie vers la démarche sur demarche.ga ; s'il ne sait pas, il le dit, sans inventer de nom d'administration.
- **Backend** : outil `find_official` en lecture seule sur les pages `trust = "official"` (index par rang de confiance) et leurs publications (`posts` par `pageId`) ; aucun lancement de démarche (le socle la garde) ; liens sortants par une origine déclarée dans l'environnement, jamais en dur.
- **Web** : même panneau que SU11b ; cartes « Officiel » au badge calculé.
- **Mobile** : après le web.
- **Données personnelles** : aucune nouvelle donnée.
- **Tests et cliquets** : réponse sans source = « je ne sais pas » (test) ; `no-hardcoded-urls`.
- **Critères d'acceptation** : toute affirmation cite une publication Officielle vivante ; une publication retirée n'est plus citée.
- **Dépend de** : SU11b ; plan 11 (pages Officielles et fédération PA9 en recette).
- **Porte** : PA9 en recette (propriétaire).

### SU12 — Agent du vendeur dans iCom Pro · priorité P2 · taille L · session S1 (+ session PRO.GA hors de ce dépôt)
- **Pour l'utilisateur** : l'acheteur écrit à une boutique ; si la boutique a activé son agent dans PRO.GA, une réponse arrive vite, marquée IA, tirée du catalogue approuvé ; à tout moment « Parler à une personne » ; le vendeur reprend la conversation quand il veut et voit ce que l'agent a dit.
- **Backend** :
  - contrat neuf `docs/contrats/PRO-COMMERCE-AGENT-V1.md` : requêtes HTTP signées, idempotentes, rejouables (même famille que `PRO-COMMERCE-COMMAND-V1`) ; ANTSIA envoie le message de l'acheteur d'un fil commercial **accepté** ou d'une demande initiale, sans identité civile ; PRO.GA renvoie texte, citations, intention de passage à un humain ;
  - `commercialMessages.senderKind` étendu à `agent` (sans `senderPersonId`, `aiOrigin` obligatoire) ; projection et effacement adaptés ;
  - réglage de la boutique « Agent PRO.GA actif dans iCom Pro », relu à chaque message ; politique réseau fermée par défaut ;
  - côté PRO.GA (hors de ce dépôt, constaté sur la branche locale) : ajouter le canal ANTSIA à `channels` (aujourd'hui `public_site` seul), **appliquer `retentionDays`** (aucune purge trouvée), lire le modèle dans la configuration au lieu de `DEFAULT_AGENT_MODEL` (`config.ts:18`).
- **Web** : bulle de l'agent avec étiquette IA dans la conversation commerciale ; bouton « Parler à une personne » ; côté boutique, marque « répondu par l'agent ».
- **Mobile** : après le web.
- **Données personnelles** : rétention des fils commerciaux terminaux inchangée (90 jours, ADR-0021) ; la copie PRO.GA suit sa propre rétention ; export et effacement.
- **Tests et cliquets** : `public-communication`, signature et rejeu, fuite entre vendeurs (IA-05).
- **Critères d'acceptation** : jamais de réponse d'agent sans activation par la boutique ; aucun prix hors offres épinglées ; passage à un humain en un geste ; reprise par le vendeur coupe l'agent dans ce fil.
- **Dépend de** : SU11a, SU01i ; plan 08 (contact commercial P10 activé et recetté) ; plan 01 (iCom Pro, ICP-3) ; décision 7.
- **Porte** : contrat accepté par PRO.GA ; offre PRO.GA ; publication des deux côtés.

### SU13 — Actions confirmées et journal · priorité P2 · taille M · session S1
- **Pour l'utilisateur** : depuis une réponse, « Écrire à la boutique », « Ajouter au panier », « Demander un devis » ; iAsted prépare un brouillon, la personne le relit et confirme ; rien ne part sans ce geste.
- **Backend** : iAsted ne mute **rien** ; il renvoie une proposition typée (`contact_draft`, `cart_draft`, `quote_draft`) ; la confirmation appelle la vraie fonction du moteur par l'interface (`commercialMessaging/threads.requestContact`, demande de devis de `shops/services`), avec ses gardes et ses débits ; l'action est inscrite au journal d'IA-02.
- **Web** : carte de confirmation (un seul bouton plein) ; le panier reste celui de `cart-book.ts` ; aucun paiement.
- **Mobile** : après le web.
- **Données personnelles** : brouillons non envoyés effacés à la fermeture.
- **Tests et cliquets** : aucune mutation sans action de la personne (test d'architecture : le module `assistant` n'appelle aucune mutation d'autres modules).
- **Critères d'acceptation** : brouillon modifiable avant envoi ; refus du moteur affiché tel quel ; aucune action engageante sans confirmation.
- **Dépend de** : SU11b, SU12 ; plan 08 (panier, devis, contact).
- **Porte** : aucune pour le code ; paiement fermé.

### IA-04 — Index sémantique des offres · priorité P3 · taille L · session S1
- **Pour l'utilisateur** : « quelque chose pour une dot » trouve des pagnes, des bijoux et des boissons même sans le mot exact.
- **Backend** : vecteurs des offres publiées et admissibles seulement, calculés par la passerelle, `vectorIndex` filtré par réseau ; recalcul à la révision, retrait au retrait.
- **Web / Mobile** : aucun changement d'écran.
- **Données personnelles** : aucune (offres publiques).
- **Tests et cliquets** : une offre retirée sort de l'index.
- **Critères d'acceptation** : gain mesuré sur le banc IA-05 avant ouverture.
- **Dépend de** : SU11b mesuré.
- **Porte** : décision du propriétaire sur le coût.

### IA-07 — iAsted dans l'application mobile · priorité P3 · taille M · session S3
- **Pour l'utilisateur** : le même champ en tête de Découvrir (`apps/antsia_mobile/src/screens/explore-screen.tsx`), sans nouvelle icône.
- **Backend** : aucun (fonctions de SU11b).
- **Web** : aucun.
- **Mobile** : panneau, étiquette IA, consentement, états hors ligne.
- **Données personnelles** : comme SU11b.
- **Tests et cliquets** : tests de l'écran.
- **Critères d'acceptation** : parité avec le web pour SU11b et SU13.
- **Dépend de** : SU11b, SU13 ; plan 14.
- **Porte** : build et distribution (propriétaire).

### IA-08 — Aide à la rédaction et description d'image (sur demande) · priorité P3 · taille M · session S1
- **Pour l'utilisateur** : dans le composeur d'une annonce ou d'une publication, « Proposer une description » ou « Proposer un texte alternatif » ; le brouillon arrive marqué IA, la personne le modifie ou le rejette.
- **Backend** : outil de la passerelle, classe « Publique » seulement ; aucune publication automatique ; `aiOrigin` gardé si le texte est publié tel quel.
- **Web** : bouton discret dans le composeur (plan 02) et le formulaire d'annonce (plan 10).
- **Mobile** : après le web.
- **Données personnelles** : aucune conservation du brouillon refusé.
- **Tests et cliquets** : `ai-origin-label`.
- **Critères d'acceptation** : rien n'est publié sans geste ; étiquette visible sur un texte publié non modifié.
- **Dépend de** : SU11a, SU01i, IA-05 ; plans 02 et 10.
- **Porte** : décision du propriétaire.

## 6. Ordre recommandé et dépendances

| Vague | Lots | Pourquoi dans cet ordre |
|---|---|---|
| 0 | IA-01 | Les règles (passerelle, modèle, classes, quotas, rétention) se décident avant le code |
| 1 | SU01i, SU11a, IA-05 (fournisseur déterministe) | Le marquage précède tout (SU01, § 4) ; la passerelle borne le coût ; le banc protège dès le premier tour |
| 2 | SU11b, IA-02, IA-06 | Premier service au membre, en lecture seule (étape a), avec sa mémoire et sa console ; ouverture d'abord sur la démonstration |
| 3 | SU11c, IA-03 | Alertes et orientation officielle, une fois la recherche mesurée et PA9 recetté |
| 4 | SU12, SU13 | L'agent du vendeur exige P10 activé et un contrat PRO.GA ; les actions exigent a et b (étude, § 11.3) |
| 5 | IA-04, IA-07, IA-08 | Après mesure réelle de l'usage et du coût |

Dépendances envers les autres plans : **03** (recherche, index de la marketplace peuplé) ; **08** (contact commercial P10 activé, panier, devis, liaison PRO.GA) ; **01** (iCom Pro, ICP-3, nouveau genre d'émetteur) ; **06** (cloche, consentements, Mes données) ; **11** (pages Officielles, PA9, sponsorisé séparé) ; **12** (détection des contenus d'IA importés, motifs, modération des réponses signalées) ; **13** (console, mesure du coût) ; **14** (mobile) ; **15** (concierge DIASPORALE, réutilisation de la passerelle).

## 7. Décisions à prendre par le propriétaire

1. **Emplacement de la passerelle.** Recommandation : un module dans le moteur ANTSIA, derrière un port fournisseur, conforme au plan iAsted 2.0 ; remplaçable plus tard par une passerelle transverse appelée par contrat signé. Raison : l'étanchéité interdit d'importer le socle ; aucune passerelle transverse n'a été trouvée en service (non vérifié sur le dépôt du socle).
2. **Fournisseur et modèle par défaut.** Recommandation : la famille Claude, modèle `claude-opus-5-5` par défaut, effort bas pour la compréhension des demandes, réglé par configuration ; un modèle plus léger seulement après mesure sur le banc IA-05, sur votre décision. À confirmer par vous. Règle du programme rappelée : la classe « Secrète » n'admet qu'un modèle souverain ; ANTSIA refuse ces données.
3. **Classe des données.** Recommandation : offres, pages et publications Officielles en « Publique » ; texte libre du membre en « Restreinte », caviardé avant envoi. Raison : le membre peut y écrire son téléphone ou son nom.
4. **Quotas du membre gratuit.** Recommandation : un nombre de tours par jour et par personne, et un plafond par réseau, fixés après un mois de mesure sur la démonstration ; aucune valeur fixée d'avance.
5. **Durée de conservation des conversations.** Recommandation : courte et réglable par la personne, à valider avec le juriste dans le dossier APDPVP. Raison : l'audit du socle a relevé l'absence de purge comme un défaut.
6. **Langues.** Recommandation : français par défaut, anglais sur demande (comme l'i18n) ; langues nationales hors V1 (plan iAsted 2.0, § 9.3).
7. **Agent du vendeur.** Recommandation : ouvrir le contrat PRO-COMMERCE-AGENT-V1 avec PRO.GA ; l'agent ne répond que si la boutique l'active, et l'acheteur peut toujours demander un humain.
8. **Ouverture.** Recommandation : démonstration d'abord, production ensuite, après le banc IA-05 au vert et la déclaration APDPVP.
9. **Transcription d'un vocal à la demande du destinataire.** Recommandation : non en V1 (message privé envoyé au fournisseur) ; à rouvrir si les membres le demandent.
10. **Dettes PRO.GA à corriger avant SU12.** Recommandation : appliquer `retentionDays`, retirer le modèle codé en dur, passer par la passerelle.

## 8. Risques et points d'attention

| Risque | Parade |
|---|---|
| Réponse fausse sur un prix ou une politique (l'exploitant est engagé : affaire Air Canada, 2024) | Prix lus dans la projection, jamais dans le texte du modèle ; citations ; banc d'exactitude |
| Injection de consignes dans une annonce ou une page | Contenu encadré comme donnée ; outils en lecture seule ; aucune mutation par iAsted ; banc d'injection |
| Fuite entre vendeurs ou entre réseaux | Outils appelés avec les droits du lecteur ; filtre réseau ; banc de fuite |
| Coût qui dérape | Quotas, coupe-circuit, contexte borné, cache, plafond de sortie, journal en jetons ; aucun tarif codé |
| Données personnelles chez le fournisseur | Caviardage, classes, consentement `assistant`, dossier APDPVP |
| Biais de classement (provinces, petits vendeurs) | Raisons calculées par le moteur ; banc de biais ; aucun classement payé |
| Non-conformité (ordonnance, art. 53) | SU01i avant toute ouverture ; détection au plan 12 avant la mi-avril 2027 |
| Panne du fournisseur | Fournisseur déterministe en repli : renvoi vers la marketplace filtrée, sans texte inventé |
| Piège du backend local : action `"use node"` refusée sous Node 25 | Vérifier le runtime requis par le SDK ; passer par `scripts/convex-dev.mjs` (CLAUDE.md, « Pièges ») |
| Tuile pour une fonction vide | Aucun champ iAsted tant que la politique du réseau est fermée |

## 9. Prompts d'implémentation

### Prompt — SU01i

```text
Tu exécutes le lot SU01i du plan 16 d'ANTSIA (marquage des contenus d'IA, partie iAsted). Écris-moi toujours en français. Utilise Opus pour tout le code, jamais de sous-agent Sonnet.
Lis : CLAUDE.md ; docs/etudes/2026-11-09-finalisation/00_PLAN_DIRECTEUR.md § 1, 2, 7 ; 16_IASTED_ASSISTANT.md § 1, 2 et le lot SU01i ; docs/etudes/2026-10-21-sept-univers-et-vie-publique/SU01_CONFORMITE_ORDONNANCE_0011.md § 2.3 et § 4 ; l'ADR issu d'IA-01.
Vérifie d'abord qu'aucune IA n'existe encore (grep iasted, anthropic, aiOrigin) et que l'ADR d'IA-01 est accepté ; sinon arrête-toi.
Périmètre : packages/social-domain/src/ (validateur aiOrigin et ses tests), packages/ui (composant AiLabel), tests/ratchets/ (cliquet ai-origin-label), textes fr et en.
Livre : validateur, composant, cliquet, fonction opérateur de lecture des métadonnées avec appendAudit, texte de règle pour les règles d'utilisation.
Vérifie : bun run verify avec le verrou commun ; recette du composant à 390, 834, 1440 px, clair et sombre.
Arrête-toi avant : toute modification de convex/schema.ts si tu n'es pas S1, toute publication, tout texte légal définitif (relecture du juriste).
```

### Prompt — SU11a

```text
Tu exécutes le lot SU11a du plan 16 d'ANTSIA (passerelle iAsted dans le moteur). Écris-moi toujours en français. Utilise Opus pour tout le code, jamais de sous-agent Sonnet.
Lis : CLAUDE.md ; 00_PLAN_DIRECTEUR.md § 1, 2, 7 ; 16_IASTED_ASSISTANT.md § 1, 2, 5 (règles communes, SU11a) et § 7 ; l'ADR d'IA-01 ; DOCUMENTATION/IASTED/PLAN_IASTED_2026-09-27.md § 10.3, 11.1, 11.2 ; à titre indicatif PRO_GA/convex/modules/commercialAgent/{providerPort,generate}.ts.
Vérifie que SU01i est fusionné.
Périmètre : convex/modules/assistant/ (nouveau), convex/lib/rateLimit.ts (seaux assistant.*), convex/schema.ts et package.json (session S1 seule), tests/ratchets/ (assistant-gateway-only, network-scoped-functions), convex/modules/people/dataPolicies.ts.
Livre : tables de politique, configuration, consommation et journal sans contenu ; port fournisseur avec adaptateur du fournisseur retenu et fournisseur déterministe ; chaîne complète (adhésion, politique fermée par défaut, coupe-circuit, quota réservé puis réglé, caviardage, garde de sortie, journal) ; modèle lu dans la configuration, jamais en dur.
Vérifie : tests convex-test avec le fournisseur déterministe uniquement (aucun appel réseau) ; bun run verify.
Arrête-toi avant : toute variable d'environnement, toute clé, tout appel réel au fournisseur, toute publication.
```

### Prompt — SU11b

```text
Tu exécutes le lot SU11b du plan 16 d'ANTSIA (iAsted du membre, recherche en langage courant, lecture seule). Écris-moi toujours en français. Utilise Opus pour tout le code, jamais de sous-agent Sonnet.
Lis : CLAUDE.md ; 00_PLAN_DIRECTEUR.md § 1, 2, 7 ; 16_IASTED_ASSISTANT.md § 1 à 5 ; étude sept univers § 8, § 11, § 12 ; convex/modules/shops/{marketplace,marketplaceRead,catalogValidators}.ts ; apps/antsia_ga/src/lib/routes.ts ; apps/antsia_ga/src/components/discovery/discover-screen.tsx.
Vérifie que SU11a et SU01i sont fusionnés et que l'index de la marketplace répond sur la démonstration.
Périmètre : convex/modules/assistant/ (conversations, messages, outils search_offers, compare_offers, open_marketplace), packages/social-domain/src/consent.ts (finalité assistant), apps/antsia_ga/src/components/assistant/, discover-screen.tsx, routes.ts, i18n fr et en, inventaire d'export et d'effacement.
Livre : panneau « Demander à iAsted… » en tête de Découvrir, visible seulement si la politique du réseau est ouverte ; cartes d'offres réelles avec raisons calculées par le moteur ; étiquette IA ; consentement à la première utilisation ; états vide, chargement, quota, indisponible.
Vérifie : tests d'injection et de retrait avec le fournisseur déterministe ; bun run verify ; recette 390, 834, 1440 px, clair et sombre, sur la démonstration.
Arrête-toi avant : tout appel réel au modèle, toute ouverture de politique en production, toute publication.
```

### Prompt — IA-05

```text
Tu exécutes le lot IA-05 du plan 16 d'ANTSIA (banc d'évaluation d'iAsted). Écris-moi toujours en français. Utilise Opus pour tout le code, jamais de sous-agent Sonnet.
Lis : CLAUDE.md ; 16_IASTED_ASSISTANT.md § 5 (IA-05) et § 8 ; étude sept univers § 11.4 ; PLAN_IASTED_2026-09-27.md § 11.3 et § 12.
Périmètre : tests/assistant/ (nouveau), données de démonstration dédiées (offres piégées), scripts d'exécution réelle séparés de verify.
Livre : quatre familles (exactitude, injection, fuite entre vendeurs, biais), en français et en anglais ; exécution déterministe dans verify ; exécution réelle à la main, rapport daté dans docs/recette/.
Vérifie : bun run verify ; aucun appel réseau dans verify.
Arrête-toi avant : l'exécution réelle (clé du propriétaire) et toute publication.
```

## 10. Sources lues

- ANTSIA, code : `convex/modules/{shops,commercialMessaging,contextualMessaging,federation,public,pages,posts,people,messaging,moderation,discovery,networks}`, `convex/lib/rateLimit.ts`, `convex/seeds/demoMediaManifest.ts`, `packages/social-domain/src/{searchText,consent,moderation,badges}.ts`, `apps/antsia_ga/src/{lib/routes.ts,lib/cart-book.ts,components/discovery/}`, `apps/admin_antsia_ga/src/components/`, `apps/antsia_mobile/src/screens/`, `tests/ratchets/`, `deploy/catalog.json`, `package.json`.
- ANTSIA, documents : `docs/00_CAHIER_DES_CHARGES_ANTSIA.md` (§ 8), `docs/01_PLAN_IMPLEMENTATION_PROMPTS_ANTSIA.md`, `docs/02_OWNER_MAP_DUPLICATION.md`, `docs/21_CONTACT_COMMERCIAL_PRO_GA.md`, ADR-0021, 0025, 0034, 0035, 0036 ; étude sept univers (§ 0, 8, 11 à 18), `SU01_CONFORMITE_ORDONNANCE_0011.md`, `EXECUTION.md`, schéma `17-iasted-architecture.svg` ; études social-commerce et responsive (recherche des mentions d'IA).
- DIASPORALE : `docs/00` (§ 8.14, 8.15), `docs/01` (PD8), `docs/13` (concierge).
- Programme : `DOCUMENTATION/IASTED/PLAN_IASTED_2026-09-27.md`, `AUDIT_IASTED_2026-09-27.md` (§ 8, 9), `PLAN_COMPORTEMENT_IASTED_2026-09-29.md` (§ 0) ; plan des réseaux `00_PLAN_RESEAUX_…` ; vault `30-TRANSVERSE/iasted.md`, `10-PROJETS/antsia/decisions/` (15/10 et 21/10).
- PRO.GA (indicatif) : `convex/modules/{commercialAgent,iasted,needs}`.
- Reprise : `REPRISE_ANTSIA_2026-11-09.md` (§ 2, 10, 11, 13.1) ; `PLANS_FINALISATION_2026-11-09/00_PLAN_DIRECTEUR.md`.
