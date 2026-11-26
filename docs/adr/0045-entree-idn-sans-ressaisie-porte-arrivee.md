# ADR-0045 : Sur la porte d'arrivée, l'entrée IDN accepte la session identite.ga tant qu'elle vit, par une intention fermée

- **Statut** : Proposé — décision du propriétaire du 26/11/2026 (« toute la session »). Lot M1 du CH-863
  implémenté sur la branche `chantier/ch-863-entree-idn-session` ; sa fusion attend l'accord écrit du
  propriétaire. Lot D2 (DIASPORA.GA : la porte d'arrivée envoie l'intention) après M1 fusionné et publié
  sur la démonstration.
- **Date** : 2026-11-26
- **Précise** : le `prompt=login` du départ IDN (`betterAuth/auth.ts`), posé à dessein et recetté le
  21/10/2026 ([docs/32](../32_RECETTE_DECONNEXION_COMPTES_2026-10-21.md)) ; il reste la règle partout
  ailleurs.

## Contexte

Le moteur demande `prompt=login` à chaque départ vers IDN, à dessein : une nouvelle entrée doit permettre
une autre identité, même si IDN garde sa session unique, et après « Me déconnecter partout » aucune reprise
silencieuse du compte précédent n'est admise (promesse recettée dans docs/32).

Le CH-863 relie consulat.ga et DIASPORA.GA par une bascule dans les deux sens, simple navigation, sans
aucune donnée d'une base à l'autre. Un citoyen connecté à consulat.ga par identite.ga clique l'onglet
« Diaspora », arrive sur la porte d'arrivée de DIASPORA.GA (`/entrer?depuis=consulat`) et clique
« Continuer avec mon identité numérique ». Avec `prompt=login`, il retape ses identifiants alors qu'il vient
de s'authentifier chez identite.ga.

Le 26/11/2026, le propriétaire a décidé : sur cette porte, accepter la session identite.ga **tant qu'elle
vit** — ni `prompt`, ni `max_age`. Partout ailleurs, rien ne change.

## Décision

Nous remplaçons le `prompt` statique du fournisseur IDN par des paramètres d'autorisation **fonction de la
requête**, décidés par une règle pure (`idnSignInStartParams` et `idnAuthorizationParams`,
`betterAuth/settings.ts`) :

1. **Par défaut, `prompt=login`**, sur chaque route qui lit ces paramètres (`/sign-in/oauth2`,
   `/oauth2/link`). Le lien de compte ne lit jamais l'intention.
2. **Une seule intention**, `additionalData: { antsiaEntry: "sso" }` au départ `/sign-in/oauth2` :
   l'adresse d'autorisation ne porte alors ni `prompt` ni `max_age`.
3. **Lecture stricte** : schéma `.strict()` à littéral unique, sur le modèle du parcours natif
   (`nativeIdn.ts`). Toute autre valeur, forme ou clé de plus est **refusée** (400, code fermé
   `idnEntryInvalid`, sans détail), jamais ignorée.
4. **Fournisseur `idn` seul, application des membres seule.** L'application où la session serait livrée est
   lue des adresses de retour du départ, comme le sceau de l'ADR-0042 (toutes les adresses données doivent
   mener à la même application). Elle doit être une application web des membres du catalogue. Refus pour
   l'administration d'un réseau et pour la console (applications dont la session ouvre une autorité,
   `requiresExactEntry`), pour une origine qui ne nomme aucune application (fermé par défaut : sur la
   démonstration, l'origine de DIASPORA.GA doit être déclarée dans `APPLICATION_EXTRA_ORIGINS_JSON`, comme
   le demande déjà [docs/23](../23_ENVIRONNEMENT_DE_DEMONSTRATION.md)), et à côté du parcours natif
   (`antsiaNative` et `antsiaEntry` ensemble : refus).
5. **Une règle, deux points d'application** : le crochet de départ `engine-idn-entry-intent` refuse avant
   la découverte d'IDN et avant l'enregistrement de l'état ; la fonction `authorizationUrlParams` du
   fournisseur, que Better Auth appelle avec le contexte de la route (corps validé) avant d'enregistrer
   l'état, décide des paramètres et refuse d'elle-même.
6. **Rien d'autre ne change** : scopes, PKCE, rappel central, sceau de la session (ADR-0042), retour natif,
   retour d'un refus.

**Partage des responsabilités.** Le moteur garantit l'intention fermée, ses refus et le défaut inchangé. Il
ne peut pas savoir qu'un navigateur est sorti : il ne garde rien d'une session révoquée et ignore l'état de
la session identite.ga. La promesse de sortie de docs/32 est donc tenue **par l'application** (lot D2) :
l'intention part de la seule porte d'arrivée, après un clic explicite (jamais de départ automatique vers
identite.ga), et **jamais après une sortie explicite** dans ce navigateur (marqueur local posé par
« Me déconnecter partout ») ; la carte d'arrivée nomme le compte, avec « Ce n'est pas moi ».

## Conséquences

### Positives

- Venu de consulat.ga, le citoyen entre dans le réseau en un clic, sans ressaisie.
- La porte ordinaire, l'administration du réseau, la console et l'application native gardent `prompt=login`.
- Ni route, ni table, ni variable nouvelle ; l'API générée ne change pas.

### Négatives

- Risque résiduel accepté : sur un navigateur partagé où une session identite.ga est restée ouverte, une
  autre personne peut entrer dans le réseau en un clic depuis la porte d'arrivée, comme sur consulat.ga
  aujourd'hui ; le vrai remède est la sortie chez identite.ga.
- La promesse « pas de reprise silencieuse après la sortie » dépend, sur cette porte, du marqueur de
  l'application (D2) : une application qui l'oublierait l'enfreindrait.

### Neutres

- Le filtre des scopes venus du navigateur (lot M2) suit, dans le même crochet, jamais en parallèle.

## Alternatives considérées

### Fenêtre `max_age`

Accepter la session IDN seulement si l'authentification date de moins de N minutes. Écartée : le
propriétaire a choisi « toute la session » ; une fenêtre ajoute une ressaisie imprévisible et ne protège
pas vraiment un navigateur partagé.

### Sonde `prompt=none`, puis repli

Écartée : deux allers-retours, des erreurs `login_required` à traiter, un passage visible, et un
comportement d'IDN de plus à garantir.

### Second identifiant de fournisseur

Un fournisseur `idn-sso` sans `prompt`. Écarté : il double le rappel central, les routes fermées, le retour
d'un refus et le sceau de la session, et élargit la surface d'authentification.

### Jeton signé émis par consulat.ga

Écarté : un contrat et un secret entre deux backends pour une simple navigation, contraire au principe
« aucune donnée ne passe d'une base à l'autre ».

### Départ automatique vers identite.ga à l'arrivée

Écarté : le clic est la protection (geste, choix du compte, « Ce n'est pas moi »).

## Références

- Plan du CH-863 (lots D1, M1, D2, C0, C1, P1), décisions du 26/11/2026.
- [ADR-0042](0042-administrateur-du-reseau-en-session-prouvee.md) (application où la session est livrée) ;
  [ADR-0039](0039-console-idn-niveau-1.md) (console).
- Better Auth 1.6.25, greffon `generic-oauth` : `authorizationUrlParams` accepte une fonction du contexte,
  appelée avant l'enregistrement de l'état, son résultat posé en dernier sur l'adresse d'autorisation.
- Tests : `convex/betterAuth/settings.test.ts`, `auth.test.ts`, `authSurface.test.ts` ;
  `idn-account-switch.test.ts` inchangé.
