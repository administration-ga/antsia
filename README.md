# ANTSIA — Le moteur social national et le réseau social public gabonais

> Renommage (2026-11-20) : DIASPORALE (diasporale.com) est devenu DIASPORA.GA (diaspora.ga). Les documents datés d'avant gardent l'ancien nom et les anciens chemins ; correspondance : docs/RENOMMAGE_DIASPORA_GA_2026-11-20.md. <!-- renommage:conserver -->

> **ANTSIA** est le nom confirmé explicitement par le propriétaire le 16/10/2026.
> Le domaine cible est `antsia.ga` ; son attribution et sa configuration restent au propriétaire.
> Le renommage local ne vaut pas renommage d’un dépôt ni d’un domaine externe historique.
> Dans le code, le nom est un jeton de marque unique (`packages/social-contracts/src/brand.ts`).

Deux objets dans un dépôt :

- **Le moteur social national** : le backend Convex et les paquets (`social-domain`,
  `social-contracts`, `social-features`, `ui`, `api`) qui servent **tous** les réseaux de
  l'écosystème — ANTSIA, DIASPORA.GA, et demain d'autres. Il est construit par **duplication** du
  réseau social de l'espace agent d'administration.ga (iRéseau, iCom, stories, albums, direct,
  notifications), selon les dix règles de duplication de PRO.GA, et rendu **multi-réseaux par
  construction** (table `networks`, clé `networkId` partout, une personne unique, identités
  externes, modération par réseau, fédération entrante par contrats signés).
- **Le réseau public ANTSIA** : réseau **racine**, ouvert à toute personne, structuré par la
  confiance (Officiel · Vérifié · Agent public · Communauté), qui **contient** les réseaux
  fermés : DIASPORA.GA (diaspora) et le miroir de l'iRéseau de l'administration (reflets des
  pages vérifiées et des publications déclarées publiques).

Édité par **NTSAGUI Digital** ; identité fédérée par **identite.ga** (IDN), fournisseur
d'identité unique du programme. Licence : voir `LICENSE` et `NOTICE` (AGPL-3.0, héritée du socle
dont le code est dupliqué — à confirmer par le propriétaire).

## État (18 octobre 2026)

La refonte commerciale P10–P12 ajoute le contact avec PRO.GA, les préparations de commandes
et le suivi privé des paiements. La retenue ANTSIA et la part vendeur sont paramétrables,
avec fonds en attente de réception et preuve de reversement distincte. **P12 reste partiel :
aucun connecteur, paiement ou reversement réel activé.** Génération et vérifications sont
différées ; [rapport P12](docs/etudes/2026-10-18-social-commerce/rapports/P12_PAIEMENT.md)
et [rapport P10](docs/21_CONTACT_COMMERCIAL_PRO_GA.md).

Les lots PA0 à PA8 disposent de rapports de réalisation et de preuves locales datées. PA9
(fédération administrative) et PA10 (échelle/préparation au lancement) sont implémentés dans
les sources partagées ; leur configuration, génération et vérification restent ouvertes.
PA10 ajoute le fil personnel matérialisé, la distribution et le rattrapage par lots, les
retraits sous garde vivante, la rétention, les accès indexés d'effacement du fil, la purge
des téléversements abandonnés et le suivi opérationnel dans la console.
**Les vérifications sont différées à la demande du propriétaire : aucune charge, restauration,
recette ni publication n'a été exécutée pour ces nouveaux lots.** DIASPORA.GA est une application
externe du même moteur (installation unique ici).
L'avancement prompt par prompt est tenu dans l'encart « État » de
[`docs/01_PLAN_IMPLEMENTATION_PROMPTS_ANTSIA.md`](docs/01_PLAN_IMPLEMENTATION_PROMPTS_ANTSIA.md).

| Document | Rôle |
|---|---|
| [`docs/00_CAHIER_DES_CHARGES_ANTSIA.md`](docs/00_CAHIER_DES_CHARGES_ANTSIA.md) | cahier des charges du moteur (partie A) et du réseau public (partie B) : exigences `EXF-AN` / `EXT-AN`, lots A0–A6, parcours R1–R10, arbitrages A1–A10 |
| [`docs/01_PLAN_IMPLEMENTATION_PROMPTS_ANTSIA.md`](docs/01_PLAN_IMPLEMENTATION_PROMPTS_ANTSIA.md) | onze prompts PA0 → PA10 et leur état ; **DIASPORA.GA PD0 → PD6 s'exécute entre PA7 et PA8** |
| [`docs/adr/`](docs/adr/) | décisions d'architecture du moteur |
| [`docs/06_RAPPORT_LANCEMENT.md`](docs/06_RAPPORT_LANCEMENT.md) | état des sources, preuves historiques, vérifications différées, risques et passation PA10 |
| [`docs/20_EXPLOITATION_ECHELLE_ET_RESTAURATION_PA10.md`](docs/20_EXPLOITATION_ECHELLE_ET_RESTAURATION_PA10.md) | procédures de charge, restauration sur cible jetable et observabilité ; aucune exécutée |
| `../../../Documentation/RESEAUX_SOCIAUX/` | plan de pilotage « réseaux dans le réseau » et annexes A–D |
| `../DIASPORA_GA/docs/00_CAHIER_DES_CHARGES_DIASPORA_GA.md` | le premier réseau servi par le moteur |

## Le dépôt

```text
ANTSIA/
├── apps/
│   ├── antsia_ga             # antsia.ga — réseau public (Next.js 16, port 3030)
│   └── admin_antsia_ga       # console du moteur (Next.js 16, port 3032)
├── packages/
│   ├── social-domain        # SSOT : règles pures (TS pur, zéro dépendance)
│   ├── social-contracts     # types, modules purs et codes serveur partagés front/back (+ leurs traductions)
│   ├── social-features      # surfaces dupliquées du front de l'espace agent, coque légère, i18n
│   ├── ui                   # charte de base (dupliquée de la charte Personnel), thèmes d'application, primitives
│   ├── api                  # accès au moteur : client, session, réseau courant, CSP, config Next commune
│   ├── tsconfig             # bases TypeScript
│   └── eslint-config        # préréglages ESLint (next, react, library)
├── convex/                  # LE MOTEUR (modules en tranches verticales, à partir de PA2)
├── tests/ratchets/          # cliquets : tests qui relisent le code
├── scripts/                 # lanceur d'espaces de travail (dupliqué du socle), publication
├── deploy/                  # catalogue des applications, Cloud Build, liste blanche du contexte
└── docs/                    # cahiers, prompts, ADR (owner map, parité, charte, contrats à venir)
```

Espaces de travail bun : `apps/*`, `packages/*`, `../DIASPORA_GA/apps/*`, `../DIASPORA_GA/packages/*`
(une seule installation, ici ; DIASPORA.GA câblé le 15/10 à la demande de son prompt PD0). Les versions
vivent une fois dans le **catalogue** du `package.json` racine (`"catalog:"`). Les tâches
transverses passent par `scripts/workspace-run.mjs` (turbo refuse les espaces de travail hors
racine).

## Commandes

```bash
bun install
bun run dev:convex         # backend Convex de développement (garder ouvert)
bun run dev:antsia          # http://localhost:3030
bun run dev:admin          # http://localhost:3032
bun run verify             # OBLIGATOIRE avant tout commit
```

`bun run verify` = `codegen` + typage du backend (tsgo) + typage des cliquets + tests convex-test +
cliquets + tests des scripts + typage, tests et lint de chaque espace de travail. Autres
commandes : `bun run test:domain`, `bun run test:ratchets`, `bun run deploy:check` (contrôle du
catalogue, sans réseau), `bun run deploy:antsia` (affiche le plan de publication ; rien ne part
sans `--execute` et la décision du propriétaire).

### Déploiement Convex de développement

Tant que le projet Convex `antsia` du propriétaire n'existe pas, le moteur tourne sur un
**déploiement local anonyme** (backend Convex sur cette machine, port 3210, aucun compte, aucun
nuage). Première fois :

```bash
CONVEX_AGENT_MODE=anonymous bun run dev:convex
```

Le CLI écrit `ANTSIA/.env.local` (non versionné) ; les applications le lisent d'elles-mêmes en
développement. Quand le projet `antsia` existera : `bunx convex dev --configure` pour s'y
rattacher, puis `bunx convex env set …` pour ses variables (voir `.env.example`).

### Tester la tranche verticale en local

Une fois par déploiement local (le propriétaire l'a autorisé pour le déploiement LOCAL seulement) :

```bash
openssl rand -base64 32 | bunx convex env set BETTER_AUTH_SECRET
bunx convex env set SITE_URL http://localhost:3030
bunx convex env set ANTSIA_DEV_TOOLS true
bunx convex run seeds/foundations:run '{"confirmNonProduction":"ANTSIA_SEEDS_HORS_PRODUCTION"}'
```

Puis `bun run dev:convex` et `bun run dev:antsia`, et ouvrir http://localhost:3030 → « Entrer ».
Sans service de courriel, le code à usage unique s'affiche sur l'écran de connexion — seulement
quand `ANTSIA_DEV_TOOLS=true` ET que le backend est local (double garde, `convex/lib/devTools.ts`) ;
ailleurs, aucun code n'est lu ni écrit.

## Invariants non négociables

- `networkId` sur toute table et toute fonction sociale (cliquet) ; une personne, un handle ;
  adhésion dérivée vers la racine ; visibilité `network` / `root` ; badges calculés côté
  serveur ; étanchéité (contrats signés seulement, jamais de lecture de base externe ni
  d'import `_generated` d'un autre dépôt) ; adhésion explicite ; refus indistinct ; toute
  écriture bornée (adhésion → éligibilité → limitation de débit → droit).
- `schemaValidation: true` ; validateurs précis ; aucun `.collect()` non borné ; aucune
  couleur littérale ; aucune chaîne hors i18n ; aucune URL codée en dur.
- Aucune publicité non étiquetée, aucun profilage commercial, aucun chiffre public non mesuré.

## Droit

Loi gabonaise n° 001/2011 modifiée par la loi n° 025/2023 (APDPVP) ; RGPD pour les résidents
de l'Union européenne ; dossier APDPVP et analyse d'impact du moteur et de chaque réseau
avant mise en ligne (lot A0).
