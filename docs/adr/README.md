# Décisions d'architecture du moteur ANTSIA

Format Nygard allégé, gabarit [`_template.md`](_template.md) (repris du socle). Un ADR
accepté est immuable : on le remplace par un nouveau, on ne le réécrit pas. Les numéros se
réservent contre `origin/main` et les PR ouvertes de ce dépôt.

| ADR | Titre | Statut |
|---|---|---|
| [0001](0001-un-moteur-trois-reseaux-deux-depots.md) | Un moteur, trois réseaux, deux dépôts ; une clé de réseau sur tout contenu | Accepté |
| [0002](0002-identite-idn-unique-comptes-legers-badges-calcules.md) | Identité : IDN fournisseur unique, comptes légers, attestations externes, badges calculés côté serveur | Accepté |
| [0003](0003-federation-entrante-par-contrats-signes.md) | Fédération entrante par contrats signés ; aucune lecture de base externe | Proposé |
| [0004](0004-duplication-depuis-le-socle-dix-regles.md) | Duplication depuis le socle : dix règles, provenance, parité prouvée | Proposé |
| [0005](0005-studio-persistant-et-droits-d-antenne.md) | Studio persistant, identités exactes et droits d'antenne servis par le moteur | Accepté |
| [0006](0006-creation-et-rediffusion-dans-le-contexte-du-direct.md) | Création, rediffusion et fenêtre dans le contexte du direct | Accepté |
| [0007](0007-nom-canonique-antsia.md) | Nom canonique ANTSIA et reprise des données et préférences existantes | Accepté |
| [0008](0008-preuves-serveur-et-revocation-immediate-des-sessions.md) | Preuves serveur, rattachement explicite et révocation immédiate des sessions | Accepté |
| [0009](0009-gardes-et-droits-personnels-pa5.md) | Gardes et droits personnels PA5 : modération, débit, données, notifications et fédération | Accepté |
| [0010](0010-preferences-de-presentation-et-mesure-facultative.md) | Préférences de présentation, cache cohérent et mesure facultative PA6 | Accepté |
| [0011](0011-console-idn-et-archivage-a-deux-personnes.md) | Console IDN, journal préalable et archivage à deux personnes | Accepté ; garantie IDN de niveau 2 (§ 1) ramenée au niveau 1 par l'ADR-0039 |
| [0012](0012-projections-publiques-et-session-ssr-antsia.md) | Projections publiques, diffusion choisie et session SSR propre à ANTSIA | Accepté pour la recette locale |
| [0013](0013-pages-administratives-federees-et-revisions-source.md) | Pages administratives fédérées, révisions source et gestion locale fermée | Proposé ; code PA9A, vérifications différées |
| [0014](0014-publications-federees-sans-personne-technique.md) | Publications fédérées sans personne technique, retraits et import sous garde | Proposé ; code PA9B, vérifications différées |
| [0015](0015-agents-volontaires-et-accord-local-renouvelable.md) | Agents volontaires et accord local renouvelable, retrait sans tombe IDN permanente | Proposé ; code PA9C, vérifications différées |
| [0016](0016-producteur-administratif-et-transfert-de-consentement.md) | Producteur administratif, outbox signée et transfert privé du consentement | Proposé ; code PA9D, vérifications différées |
| [0017](0017-refonte-sociale-charte-navigation-immersion.md) | Refonte sociale ANTSIA : charte encre et prune, navigation opt-in, immersion avec mode liste | Proposé ; code P01–P05, vérifications différées après P01/P02 ; §1 (palette) remplacé par l'ADR-0027 |
| [0018](0018-commerce-pro-ga-autorite-et-contrats.md) | Commerce ANTSIA × PRO.GA : autorité unique, liaison à double preuve, deux contrats | Proposé ; code P06–P13, vérifications différées après P06 |
| [0019](0019-boutique-progressive-et-canal-commercial.md) | Boutique progressive, vitrine publique dédiée et canal commercial distinct | Proposé ; code P07/P10, vérifications différées |
| [0020](0020-fil-materialise-et-preuves-de-lancement.md) | Fil matérialisé, rétention et preuves de lancement distinctes des sources | Proposé ; code PA10, vérifications différées |
| [0021](0021-contact-commercial-et-consentement-crm.md) | Contact commercial distinct et consentement CRM révocable | Proposé ; code P10, vérifications différées |
| [0022](0022-paiements-prives-et-repartition-antsia.md) | Paiement privé, retenue ANTSIA paramétrable et fonds vendeur en attente | Proposé ; code P12 partiel, contrôles et activation différés |
| [0023](0023-achats-prives-et-reception-acheteur.md) | Suivi privé des engagements et réception explicite distincte du reversement | Proposé ; code P13, contrôles et recette différés |
| [0024](0024-emploi-consenti-et-candidatures-privees.md) | Emploi consenti et candidatures privées | Proposé ; code P15, tests écrits, vérifications différées |
| [0025](0025-conversation-contextuelle.md) | Conversation contextuelle ouverte et fermée par un objet déjà accepté | Accepté (validation du propriétaire du 19/10/2026 ; D7 et D13 à confirmer juridiquement) ; code CC-1/2a/2b, vérifications différées |
| [0026](0026-apparence-avant-affichage-et-theme-du-compte.md) | Apparence posée avant l'affichage, thème enregistré sur le compte | Proposé ; code et tests verts, retour du thème du compte observé ; liste des thèmes remplacée par l'ADR-0027 |
| [0027](0027-six-themes-trois-couleurs-et-systeme-epure.md) | Six thèmes à trois couleurs, Gaboma par défaut, et système épuré | Proposé ; code et tests verts, observé dans le navigateur |
| [0028](0028-ecran-des-chartes-a-la-lettre.md) | L'écran des chartes, à la lettre, dans le fil d'antsia.ga | Proposé ; code et tests verts, observé dans un banc de rendu (390, 834, 1 440 px, sept thèmes) |
| [0029](0029-deploiement-de-demonstration-declare.md) | Un déploiement de démonstration déclaré, seul à ouvrir les comptes de démonstration en ligne | Proposé ; code et tests verts, déploiement de démonstration à créer par le propriétaire |
| [0030](0030-bureau-au-systeme-des-chartes-et-theme-au-rail.md) | Le bureau d'antsia.ga au système des chartes, et le thème au rail | Proposé ; code et tests verts, observé dans l'application réelle (1 440 et 390 px, sept thèmes, clair et sombre) |
| [0034](0034-marketplace-et-espaces-specialises.md) | Marketplace et espaces spécialisés : page unique, autorité PRO.GA, navigation, admissions distinctes | Accepté par le propriétaire le21/10/2026 ; implémentation MP00–MP14 en cours |
| [0035](0035-sept-univers-et-vie-publique.md) | Sept univers et vie publique : trois piliers, une page par activité, iAsted, conformité dès la conception | Accepté par le propriétaire le 21/10/2026 pour D01–D08 (D09–D12 proposées) ; lot SU00, documentaire |
| [0036](0036-icom-et-icom-pro.md) | iCom et iCom Pro : deux espaces de messagerie, une bascule en pilule, contacts pro dérivés des échanges | Accepté par le propriétaire le 22/10/2026 ; lot ICP-1 (front) |
| [0037](0037-fil-sans-cadre-et-formules-des-boutiques.md) | Fil sans cadre, deux formules de relation et formules des boutiques | Accepté par le propriétaire le 22/10/2026 ; lots 1 (socle et publications, grille du bureau retirée) et 2 (suggestions et relations) |
| [0038](0038-comptes-de-demonstration-diasporale.md) | Les comptes de démonstration de DIASPORALE sur la démonstration déclarée | Accepté par le propriétaire le 22/10/2026 ; code et tests verts, publication sur la démonstration à suivre |
| [0039](0039-console-idn-niveau-1.md) | La console d'exploitation admet une connexion IDN de niveau 1 | Accepté par le propriétaire le 22/10/2026 ; publié le 22/10 (backend et console `3253a10`) |

- [0040 — Amorçage du seul premier administrateur local](0040-amorcage-operateur-local.md) : porte interne, vraie session IDN forte et audit atomique ; activation propriétaire encore attendue.
- [0041 — Catalogue local avec une vraie session IDN de Niveau1](0041-catalogue-local-idn-niveau1.md) : exception opt-in bornée au backend local sandbox et au seul catalogue public V2 PRO.GA ; autorisée le25/10/2026, recette en cours.
