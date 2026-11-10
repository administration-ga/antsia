# ADR-0029 : Un déploiement de démonstration déclaré, seul à ouvrir les comptes de démonstration en ligne

- **Statut** : Proposé — demandé par le propriétaire le 20/10/2026 (« implémente en prod le bouton
  d'accès direct aux comptes démo et déploie » ; option retenue : « Environnement démo séparé ») ;
  « accepté » après recette sur le déploiement de démonstration.
- **Date** : 2026-10-20
- **Complète** : la double garde des outils de développement (`convex/lib/devTools.ts`), sans
  l'élargir.
- **Complété par** : ADR-0038 (22/10/2026) — les comptes de démonstration de DIASPORALE et leur
  domaine réservé `demo.diasporale.test` s'ouvrent aussi sur la démonstration déclarée.
- **État d'exécution** : code et tests dans les sources (`convex/lib/devTools.ts`,
  `convex/modules/platform/{demoAccounts,devTools,authentication}.ts`,
  `convex/betterAuth/{delivery,settings}.ts`, `apps/antsia_ga`). Aucun déploiement de démonstration
  n'existe encore : sa création (projet Convex, projet d'hébergement, secrets) reste au
  propriétaire (`docs/23`).

## Contexte

Les huit comptes de démonstration (membre, vérifié, nouvel arrivant, presse, commerçant,
association, administration, modération) n'existent qu'en développement local : le catalogue,
l'équipement d'un compte et la lecture de son code à usage unique sont fermés par
`devToolsAllowed` (variable `ANTSIA_DEV_TOOLS` ET backend local). Le propriétaire veut un accès
direct à ces comptes en ligne, pour montrer le réseau.

Ouvrir ces comptes sur la production y créerait une modératrice, une page « Officiel » et des
identités IDN fictives que n'importe quel visiteur pourrait endosser, au milieu des vrais membres.
`devToolsAllowed` commande aussi des règles d'authentification (origines `localhost`, cookies non
sécurisés, affichage de TOUS les codes) : l'élargir à un déploiement en nuage affaiblirait la
connexion elle-même.

## Décision

1. **Un déploiement distinct.** La démonstration vit dans son propre projet Convex et son propre
   site, avec ses données, son secret de session et ses comptes ; la production n'en reçoit rien.
2. **Une déclaration par le nom même du déploiement.** Le déploiement de démonstration porte
   `ANTSIA_DEMO_DEPLOYMENT=<nom>`, où `<nom>` est celui de son `CONVEX_CLOUD_URL`
   (`https://<nom>.convex.cloud`). Une variable recopiée sur un autre déploiement — la production
   comprise — ne correspond pas à son nom et n'ouvre rien (`demoDeploymentDeclared`).
3. **Une garde étroite, distincte de `devToolsAllowed`.** La démonstration déclarée ouvre :
   - le catalogue et l'équipement des comptes (`demoAccountsAllowed`) ;
   - l'enregistrement et la lecture du code des seules adresses réservées
     `<acteur>@demo.antsia.test` (`demoCodeReadable`) — toute autre adresse passe par le vrai
     service de courriel, et son code ne s'affiche jamais ;
   - la porte e-mail de l'écran de connexion, même sans service de courriel
     (`authenticationConfiguration().emailOtp`), et l'annonce `demoAccounts`.

   Elle n'ouvre ni les origines locales, ni les cookies non sécurisés, ni les codes SMS, ni aucun
   autre outil de développement.
4. **Le même bouton.** antsia.ga affiche le panneau des comptes de démonstration quand le serveur
   annonce `localCodes` ou `demoAccounts` ; sur la démonstration, il dit que les comptes et
   contenus sont fictifs et partagés par tous les visiteurs. Un appui suit le vrai parcours : code
   à usage unique, vraie session Better Auth, vrai accueil, équipement par `equipMyDemoAccount`.

## Conséquences

### Positives

- Un lien public montre le réseau sous les huit rôles, sans compte à créer.
- La production reste fermée par construction : ni variable oubliée, ni variable recopiée ne
  l'ouvrent ; les invariants (aucun profil d'office, badges calculés, refus indistinct) restent
  ceux du moteur, puisque les comptes passent par les vraies mutations.

### Négatives

- Les comptes sont partagés : ce qu'un visiteur publie sous « Mairie Démo » ou sous la modératrice
  est vu des suivants. La démonstration exige donc une remise à zéro périodique (nouveau
  déploiement ou effacement des données) et, au besoin, une protection d'accès du site.
- Les seaux de connexion restent ceux du moteur, par adresse : trois codes par cinq minutes et
  cinq connexions par quinze minutes. Plusieurs visiteurs sur le même compte au même moment
  peuvent donc voir « La connexion de démonstration n'a pas abouti » quelques minutes ; ces bornes
  ne sont pas desserrées pour la démonstration. De même, « Se déconnecter partout » ou une
  suspension par la modératrice de démonstration touche tous les visiteurs de ce compte jusqu'à la
  remise à zéro.
- Un second déploiement à tenir à jour : chaque mise en production du moteur doit aussi être
  poussée sur la démonstration.
- Seuls les comptes d'ANTSIA sont ouverts ; ceux de DIASPORALE (`demo.diasporale.test`) restent
  au développement local (tranche tenue par la session DIASPORALE).

### Neutres

- `devToolsAllowed` est inchangée ; le développement local garde tous ses outils.

## Alternatives considérées

### Option A — ouvrir les comptes sur la production

Écartée : des comptes à pouvoirs (modération, page officielle) endossables par tout visiteur, au
milieu des vrais membres.

### Option B — élargir `devToolsAllowed` aux déploiements en nuage

Écartée : la garde commande aussi les origines `localhost`, les cookies non sécurisés et l'affichage
de tous les codes ; l'élargir affaiblirait la connexion.

### Option C — une variable booléenne `ANTSIA_DEMO=true`

Écartée : recopiée par erreur avec les autres variables, elle ouvrirait la production. Le nom du
déploiement ne se recopie pas sans le vouloir.

## Références

- `docs/23_ENVIRONNEMENT_DE_DEMONSTRATION.md` (création et exploitation).
- `convex/lib/devTools.ts`, `convex/lib/devTools.test.ts`, `convex/betterAuth/auth.test.ts`
  (« déploiement de démonstration déclaré »), `convex/modules/platform/demoAccounts.test.ts`.
- `apps/antsia_ga/src/components/sign-in-screen.tsx`, `demo-accounts-panel.tsx`.
