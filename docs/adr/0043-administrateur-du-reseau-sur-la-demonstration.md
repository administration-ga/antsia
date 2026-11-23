# ADR-0043 : Sur la démonstration, l'administrateur du réseau entre par un client d'identité numérique dédié, et le premier est nommé par une fonction interne journalisée

- **Statut** : Proposé
- **Date** : 2026-11-23
- **Chantier** : CH-831
- **Amende** : [ADR-0042](0042-administrateur-du-reseau-en-session-prouvee.md) (conséquence neutre : le premier
  administrateur « nommé à la console ») ; `docs/23_ENVIRONNEMENT_DE_DEMONSTRATION.md` § 1 (variables `IDN_*`).

## Contexte

L'ADR-0042 met l'administration d'un réseau gouverné derrière les constructeurs `networkAdminQuery` et
`networkAdminMutation` : rôle `network_admin` relu à chaque appel, adhésion qui permet d'exercer, preuve de
session IDN vivante scellée pour l'application qui administre CE réseau (`administers_network` au catalogue),
accès journalisé. Le bureau de l'application des membres reçoit le refus indistinct pour ces décisions.

La démonstration ne remplit aucune de ces conditions :

- elle n'a pas d'identité numérique : `docs/23` § 1 interdisait les variables `IDN_*` sur son moteur. Aucune
  session ne peut y être scellée pour l'application d'administration ;
- elle n'a pas de console : `scripts/release/targets.mjs` lie la zone de la console au moteur de production.
  Personne ne peut y nommer le premier administrateur par `platform/networkRoles.setNetworkRole` ;
- le compte de démonstration `demo.administrateur` tient le rôle (le catalogue de démonstration l'équipe), mais
  il entre par code : il n'a jamais de preuve IDN scellée, la garde d'ADR-0042 l'exclut par construction.

Publier le moteur sur la démonstration laisserait donc DIASPORA.GA sans personne pour l'administrer.

## Décision

Nous rendons la démonstration administrable sans affaiblir la garde d'ADR-0042, en trois points.

1. **Un client d'identité numérique dédié.** Le moteur de démonstration est raccordé à identite.ga par un client
   PROPRE à la démonstration, en mode bac à sable, de niveau 1, limité à ses comptes de test (confirmé par le
   propriétaire le 23/11/2026) ; jamais le client de production. Le retour IDN arrive à
   `origine(SITE_URL)/api/auth/oauth2/callback/idn` (`betterAuth/auth.ts`) : le `SITE_URL` de ce moteur doit être
   une origine dont le relais sert `/api/auth/*` À LA RACINE vers lui. Aucun code d'authentification ne change.

2. **Deux fonctions internes** (`convex/modules/platform/networkAdminBootstrap.ts`), lancées par le propriétaire
   depuis son terminal, avec la clé du déploiement de démonstration : `nameFirst` (nommer) et `withdraw`
   (retirer). Elles sont refusées hors de la démonstration déclarée et du développement local
   (`demoAccountsAllowed`, ADR-0029). Les portes, dans l'ordre du code :
   - communes : démonstration déclarée ou développement local ; phrase de confirmation exacte, construite des
     arguments tels que tapés (`NAME_FIRST_NETWORK_ADMIN <réseau> <identifiant>`,
     `WITHDRAW_NETWORK_ADMIN <réseau> <identifiant>`) ; motif de 10 à 500 caractères (la borne de la console) ;
     réseau lu par son identifiant d'adresse, actif, administré au catalogue ; personne lue par son identifiant
     public normalisé (`@` de tête retiré, minuscules), jamais par un identifiant interne ni une adresse ;
     adhésion EXISTANTE dans le réseau, jamais créée d'office ;
   - `nameFirst` seulement : effacement ni demandé ni fait ; compte d'authentification lisible, qui n'est pas un
     compte de démonstration (domaine réservé) ; lien IDN vivant ; adhésion qui permet d'exercer (« déclarée »
     au moins, sans suspension) ; aucun vrai administrateur actif déjà là. Ne comptent pas : les comptes de
     démonstration, un administrateur suspendu. Comptent (fermé par défaut) : un compte illisible, un titulaire
     sans lien IDN. Rejouée sur la personne déjà nommée, elle ne change rien et n'écrit rien ;
   - `withdraw` seulement : le rôle `network_admin` tenu, et un compte qui n'est pas un compte de démonstration.

   Les deux arbitrages, mot pour mot :
   - « `withdraw` peut retirer le dernier administrateur actif, sur la démonstration déclarée seulement (option
     `allowLastAdmin`, inerte ailleurs, réservée par cliquet) : le réseau revient à l'état d'avant l'amorçage. »
   - « Les conditions sur la cible (lien IDN vivant, compte lisible, adhésion qui permet d'exercer) ne valent que
     pour `nameFirst` ; `withdraw` exige l'adhésion et le rôle tenu, et refuse un compte de démonstration. »

   Le rôle passe par l'aide commune (`people/networkRoles.setMembershipRole`). Hors démonstration déclarée et
   développement local, l'option `allowLastAdmin` y est refusée (`policyRefused`) avant toute écriture ; sans
   l'option, la console, la tranche et le départ volontaire gardent la règle du dernier administrateur. La
   décision entre au journal dans la même fonction : action `membership.role_set`, qualité `system`, sans
   acteur, détail `{ reason, from, to, origin: "bootstrap" }` ; aucune action ni qualité nouvelle. Le résultat
   nomme la personne visée : `{ changed, from, to, personId, handle }`. Chaque refus porte un code stable
   (`appRule` `bootstrap_*`), sans donnée de personne.

3. **La garde d'ADR-0042 ne change pas.** La personne nommée n'administre qu'en session IDN prouvée de
   l'application d'administration, accès journalisé. En production, la console reste le seul chemin.

## Conséquences

### Positives

- La démonstration s'administre, sans affaiblir la garde d'ADR-0042.
- Aucune personne inconnue n'entre par IDN : le client de démonstration n'admet que ses comptes de test.
- Aucun changement de schéma ni de catalogue.

### Négatives

- De vrais administrateurs vivent sur la démonstration. Une remise à zéro les efface : l'adhésion par IDN puis
  l'amorçage se rejouent.
- Le bouton IDN est actif pour tous les visiteurs de la démonstration, mais identite.ga refuse quiconque n'est
  pas sur la liste des comptes de test du client.
- Entre la publication du moteur et l'amorçage, l'administration du réseau ne répond à personne.
- La ligne d'amorçage n'a pas d'acteur au journal : l'autorité est la clé du déploiement.

### Neutres

- Personne n'est créé d'office : l'amorçage ne nomme qu'une personne entrée par IDN et membre du réseau.
- Aucune source de production n'appelle les deux fonctions (cliquet `network-admin-bootstrap-callers`) ; tout
  appel de l'aide commune écrit son journal dans la même définition, et `allowLastAdmin` ne s'écrit que dans
  `withdraw` (cliquet `operator-audit`).

## Alternatives considérées

### Option A — une console de démonstration

Il lui faudrait son propre premier opérateur, et elle ajouterait un projet, un domaine et une cible de
publication. Rejetée.

### Option B — un import de données

Pas de ligne au journal, rien ne borne ce qui est écrit. Rejetée.

### Option C — la même fonction en production

Ce serait un second chemin sans acteur là où la console existe. Rejetée.

### Option D — une entrée pour les comptes de démonstration

Elle contredit l'ADR-0042 : une session par code vaudrait pour l'administration. Rejetée.

### Option E — le client IDN de production

Il ouvrirait la démonstration à tout titulaire d'une identité numérique. Rejetée.

### Option F — une variable d'origine du rappel distincte de `SITE_URL`

Ce serait du code pour obtenir ce qu'un réglage donne déjà. Rejetée.

## Hors périmètre, à connaître

- L'équipement des comptes de démonstration pose le rôle par une écriture directe, sans l'aide commune ni ligne
  de journal : `convex/modules/diaspora/demoAccounts.ts` et `convex/modules/platform/demoAccounts.ts`
  (`equipMyDemoAccount` dans les deux cas). Inchangés ici ; nommés dans l'en-tête du cliquet `operator-audit`.
- L'aide qui construit les sujets IDN de démonstration existe deux fois, privée, dans ces deux fichiers. Le
  moteur n'a pas d'aide partagée qui les reconnaisse : l'amorçage se fie au domaine réservé de l'adresse et au
  lien IDN vivant.

## Références

- Code : `convex/modules/platform/networkAdminBootstrap.ts`, `convex/modules/people/networkRoles.ts`,
  `convex/lib/networkAdminIdentity.ts`, `convex/lib/operatorIdentity.ts`, `convex/lib/devTools.ts`,
  `convex/betterAuth/auth.ts`, `convex/betterAuth/settings.ts`, `convex/modules/networks/adminAccess.ts`,
  `convex/modules/platform/audit.ts`, `scripts/release/targets.mjs`.
- Recettes : `convex/modules/platform/networkAdminBootstrap.test.ts`, `convex/modules/people/networkRoles.test.ts`,
  `convex/tests/network-admin-bootstrap-idn.test.ts` (vrai parcours IDN dans un environnement comme la
  démonstration) ; cliquets `tests/ratchets/operator-audit.test.ts` et
  `tests/ratchets/network-admin-bootstrap-callers.test.ts`.
- Exploitation : `docs/23_ENVIRONNEMENT_DE_DEMONSTRATION.md` § 7.
- Décisions : [ADR-0029](0029-deploiement-de-demonstration-declare.md),
  [ADR-0038](0038-comptes-de-demonstration-diasporale.md), [ADR-0039](0039-console-idn-niveau-1.md),
  [ADR-0042](0042-administrateur-du-reseau-en-session-prouvee.md).
