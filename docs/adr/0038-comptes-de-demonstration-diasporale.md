# ADR-0038 : Les comptes de démonstration de DIASPORALE sur la démonstration déclarée

- **Statut** : Accepté par le propriétaire le 2026-10-22 (choix « Chantier backend démo » : ouvrir
  les comptes de démonstration DIASPORALE sur le déploiement de démonstration déclaré, puis y
  publier DIASPORALE branché sur le moteur).
- **Date** : 2026-10-22
- **Complète** : ADR-0029, sans élargir sa garde au-delà des adresses réservées.

## Contexte

DIASPORALE n'a jamais été en ligne. Le 22/10/2026, le propriétaire demande de le publier, d'abord
sur le backend de démonstration (`vivid-hedgehog-655`), pour une recette en ligne : la modératrice
Ruth ALLOGHO, un signalement pour harcèlement, le bureau `/moderation` et ses délais légaux.

L'ADR-0029 a ouvert les comptes de démonstration d'ANTSIA sur la démonstration déclarée, et
laissé ceux de DIASPORALE au développement local : leur catalogue et leur équipement sont fermés
par `devToolsAllowed`, et le code d'une adresse `<acteur>@demo.diasporale.test` ne s'affiche
jamais en nuage. Sur le backend de démonstration, personne ne pourrait donc entrer dans
DIASPORALE : aucun courriel n'y part, et aucun compte de démonstration n'y est équipable.

## Décision

1. **La même garde qu'ANTSIA.** Le catalogue et l'équipement des comptes de DIASPORALE
   (`modules/diaspora/demoAccounts`) passent de `devToolsAllowed` à `demoAccountsAllowed` :
   développement local, ou déploiement de démonstration déclaré par son nom même
   (`ANTSIA_DEMO_DEPLOYMENT`). La production n'est jamais ouverte.
2. **Un second domaine réservé, et lui seul.** `demo.diasporale.test` rejoint
   `demo.antsia.test` dans `DEMO_EMAIL_DOMAINS` : sur la démonstration déclarée, le code de ces
   seules adresses s'enregistre et se relit (`demoCodeReadable`). Toute autre adresse passe par le
   vrai service de courriel, et son code ne s'affiche jamais.
3. **Rien d'autre ne s'ouvre** : ni outil de développement, ni origine locale, ni cookie non
   sécurisé, ni code SMS. L'équipement reste celui du développement local : vraies mutations, faits
   fictifs dérivés par la vraie règle, rôles de réseau et équipe de démonstration, pages, blocage,
   sanctions en dernier.

## Conséquences

### Positives

- DIASPORALE se recette en ligne sous ses vingt rôles, par le vrai parcours, sans compte à créer.
- La production reste fermée par construction, comme pour ANTSIA.

### Négatives

- Les comptes de DIASPORALE sont partagés par tous les visiteurs de la démonstration, avec leurs
  pouvoirs : l'administration du réseau, la modération, une page « Officiel », une suspension à la
  racine. Ce qu'un visiteur fait sous ces comptes est vu des suivants jusqu'à la remise à zéro
  (`docs/23`, § 5).
- Les seaux de connexion du moteur restent ceux de l'ADR-0029 : trois codes par cinq minutes et
  cinq connexions par quinze minutes, par adresse.
- Le site DIASPORALE de démonstration a sa propre origine : le backend de démonstration doit la
  connaître (`TRUSTED_ORIGINS`), et le réseau `diasporale` doit y être semé (`docs/23`, § 6).

### Neutres

- `devToolsAllowed` est inchangée.
- Les noms des acteurs restent ceux du domaine DIASPORALE (`diasporaleDemoEmailOf`) ; un test de
  la tranche vérifie que le domaine réservé du moteur reste le sien.

## Alternatives considérées

### Option A — publier DIASPORALE avec son fournisseur de démonstration intégré

Données fictives dans le navigateur, sans backend. Proposée au propriétaire, qui a préféré une
recette sur le moteur.

### Option B — ouvrir toutes les adresses sur la démonstration

Écartée : une vraie adresse saisie sur la démonstration verrait son code s'afficher à l'écran.

## Références

- `convex/lib/devTools.ts`, `convex/lib/devTools.test.ts`.
- `convex/modules/diaspora/demoAccounts.ts`, `convex/modules/diaspora/demoAccounts.test.ts`.
- `convex/betterAuth/auth.test.ts` (« déploiement de démonstration déclaré »).
- `docs/23_ENVIRONNEMENT_DE_DEMONSTRATION.md`, § 6.
