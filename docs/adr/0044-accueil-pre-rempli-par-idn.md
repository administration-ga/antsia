# ADR-0044 : L'accueil propose le nom civil et l'identifiant venus d'IDN, par un pré-remplissage éphémère, avant le geste

- **Statut** : Proposé — décision du 25/11/2026 validée par le propriétaire (nom civil complet comme nom
  affiché par défaut, montré avant le clic et modifiable ; pré-remplissage gardé 24 h). Lot M1 implémenté sur
  la branche `chantier/accueil-idn-m1` ; sa fusion attend l'accord écrit du propriétaire. Lot M2 à venir.
- **Date** : 2026-11-25
- **Précise** : [ADR-0002](0002-identite-idn-unique-comptes-legers-badges-calcules.md) (« jamais recopié d'un état civil
  sans geste ») et [ADR-0008](0008-preuves-serveur-et-revocation-immediate-des-sessions.md) (« aucun nom civil
  ni profil ne se crée depuis une preuve externe ») : les deux règles restent vraies, ce document dit comment
  l'accueil PROPOSE ce qu'IDN sait déjà sans rien en recopier.

## Contexte

Le propriétaire a demandé, en entrant par IDN sur la démonstration, que l'accueil de DIASPORA.GA tienne en un
écran : ne pas redemander ce qu'IDN sait, proposer le nom et l'identifiant d'après IDN, créer le profil social
au bouton et demander le reste après l'entrée. La note de décision du 25/11/2026 (dossier de documentation de
DIASPORA.GA, `Accueil_un_ecran_2026-11-25`, hors de ce dépôt) découpe le travail en lots ; le moteur en porte
deux, M1 (identité) et M2 (résidence).

Le moteur écartait jusqu'ici tout champ civil, à dessein :

- la preuve IDN (`idnProfileProof`, `betterAuth/settings.ts`) ne garde que le sujet, le niveau de garantie, la
  nationalité et le type de profil ; elle est lue par les gardes de sécurité ;
- Better Auth reçoit `name: BRAND_NAME` (`betterAuth/auth.ts`, `mapProfileToUser`) ;
- la personne naît sans nom ni identifiant (`ensureMyPerson`) ; le profil naît du seul geste
  (`publishMyProfile`).

Or IDN envoie déjà `given_name` et `family_name` sous le scope `profile`, et l'adresse IDN vaut
`<identifiant>@idn.ga` par construction. Rien n'est à demander à identite.ga pour le nom et l'identifiant.

## Décision

Nous laissons la preuve, Better Auth et la personne sans nom civil, et nous ajoutons à part un pré-remplissage
éphémère que seul l'accueil lit, avant le geste.

1. **Extraction.** `idnEntryPrefill(profile)` (`betterAuth/settings.ts`, à côté de `idnProfileProof`, qui ne
   change pas) ne retient que les prénoms (`given_name`), le nom de famille (`family_name`) et l'identifiant
   IDN : la partie locale, en minuscules, d'une adresse VÉRIFIÉE du seul domaine `idn.ga`, à la forme
   qu'identite.ga impose (3 à 32 caractères). Jamais `nip`, `birthdate`, `gender`, `birth_place`, `picture`,
   `nationality` ni le sujet. Une valeur invalide est ignorée ; la fonction ne lève jamais.

2. **Table `idnPrefills`** (`modules/people/tables.ts`), rangée sous l'utilisateur Better Auth de la session
   (`authUserId`, la clé que porte `persons.authUserId`) :
   - **écrite par le seul rappel OIDC**, dans le greffon `engine-idn-session-proof`, une fois la session
     ouverte (`newSession`). Pendant le rappel, la personne n'existe pas encore : elle naît ensuite, par
     `ensureMyPerson`. Écrire au mapping, par le sujet IDN, laisserait une ligne pour une connexion refusée
     ou un simple rattachement de compte ; écrire dans le greffon n'en laisse que pour une session réelle.
     Le dépôt passe après la preuve de session et ne lève jamais : la connexion ne casse pas à cause de lui.
     Le cliquet `idn-prefill-writer` réserve l'écriture à la tranche `people/idnPrefill.ts` et l'appel de son
     écrivain à `betterAuth/auth.ts` ;
   - **gardée 24 h**, refusée à la lecture dès l'échéance, purgée chaque jour par lots de 100
     (`people-purge-expired-idn-prefills`, modèle `operatorAccess.purgeExpiredProofs`) ;
   - **aucune identité écrite** pour une personne au profil déjà publié ou en cours d'effacement ; la
     publication du profil (`publishMyProfile`) efface la part d'identité (au lot M1, la ligne entière) ;
   - **classée aux cliquets de données** : `dataPolicies.ts`, hors du parcours générique (`dataAccess.ts`,
     `dataInventory.ts`, comme `idnProofs`), exportée par la clé de compte de la personne avec une projection
     fermée (champs reçus et dates, jamais la clé de compte), effacée à la phase des comptes (`erasure.ts`).

3. **Échelle d'identifiants.** `idnHandleLadder` (`packages/social-domain/src/handleSuggestion.ts`) ne prend
   que des éléments d'IDN, dans cet ordre : le prénom qui figure dans l'identifiant IDN (comparé à ses
   segments, accents retirés, jamais à une sous-chaîne) ; l'identifiant IDN entier ; les autres prénoms ;
   l'échelle existante (`handleLadder`). Six propositions au plus, toutes passées par `isCandidateHandle`.
   L'écran présélectionne la première libre.

4. **Requête `modules/people/idnPrefill.myEntryPrefill`**, `personQuery` sans argument. Contrat :
   `null | { displayName: string | null, handles: { handle: string, available: boolean }[], residence: null }`.
   - Le nom affiché se compose au serveur par le normaliseur partagé (`normalizeCivilName`) : NOM(S) de
     famille en capitales, puis Prénom(s) (« NDONG MBA Jean-Rémy Éloïse ») ; `null` sans nom ou au-delà de
     120 caractères. Il est montré avant le clic et reste modifiable.
   - La disponibilité ne porte que sur les candidats de l'appelant, tirés de SA ligne : aucune nouvelle
     énumération d'identifiants.
   - `null` sans ligne (entrée sans IDN), pour une ligne échue ou d'autrui, et dès que le profil est publié.
   - `residence` vaut toujours `null` au lot M1.

5. **Lot M2, après la mise en production d'identite.ga** (hors de ce lot) : scope `idn:residence` et claims
   `residence_country`, `residence_locality` ; crochet `before` sur `/sign-in/oauth2` et `/oauth2/link` qui
   écrase les scopes du client et n'ajoute `idn:residence` que pour l'application des membres de DIASPORA.GA,
   derrière `IDN_RESIDENCE_SCOPE` ; `idnEntryPrefill` lit alors la résidence, qui survit à la publication et
   part après `joinDiasporaGa`. Le constat de sécurité de la note (des scopes venus du navigateur fusionnés
   par `/sign-in/oauth2`) reste ouvert jusqu'à ce lot, qui le ferme par un test rouge d'abord.

## Conséquences

### Positives

- L'accueil propose le nom et l'identifiant sans rien redemander, et le profil ne naît toujours que du geste.
- La preuve IDN, lue par les gardes de sécurité, ne reçoit aucun nom civil : l'ADR-0008 tient.
- Une ligne d'au plus 24 h, effacée à la publication : le nom civil n'est pas gardé pour les usagers du moteur
  qui ne l'utilisent pas.
- Un accueil sans pré-remplissage (moteur plus ancien, entrée par code, ligne échue) retombe sur la saisie.

### Négatives

- L'identifiant IDN proposé comme identifiant public révèle l'adresse `@idn.ga` de la personne. Il est montré
  avant le clic et reste modifiable.
- Une ligne de plus à tenir dans les cliquets de données, avec un chemin d'export et d'effacement propre,
  comme `idnProofs`.
- Un rattachement d'IDN depuis les réglages (sans nouvelle session) ne dépose rien : sans objet, la personne
  ayant déjà son profil.

### Neutres

- `isHandleFreeFor` sort de `profile.ts`, inchangé, vers `people/handleAvailability.ts`, pour que la requête
  et la publication le partagent sans import circulaire.
- Les journaux de consentement ne changent pas : seul `social_profile` est requis pour entrer, à sa version
  `2026-10-14`.

## Alternatives considérées

### Étendre `idnProofs`

Garder le nom civil dans la preuve, sans limite de durée, pour tous les usagers, dans une table lue par les
gardes de sécurité : contraire à l'ADR-0008. Rejeté.

### Relire `/userinfo` à la demande

Une action réseau fragile, avec un jeton d'accès qui expire, et un jeton gardé pour cela. Rejeté.

### Écrire au mapping, rangé par sujet IDN

La personne n'existe pas encore au rappel ; le mapping passe avant la résolution de l'utilisateur et sert
aussi au rattachement de compte : une connexion refusée laisserait une ligne. Le greffon, après l'ouverture
de la session, ne l'écrit que pour une session réelle. Rejeté.

### Ranger la ligne sous la personne

Il faudrait créer la personne au rappel, contre « rien n'est créé d'office » et le parcours d'amorçage
(`ensureMyPerson`). Rejeté.

### Entrer sans aucun écran

Il n'y aurait pas de consentement valide au profil social. Rejeté.

## Références

- Note de décision du 25/11/2026 (`Accueil_un_ecran_2026-11-25`, documentation de DIASPORA.GA, hors dépôt).
- Code : `betterAuth/settings.ts` (`idnEntryPrefill`), `betterAuth/auth.ts` (greffon
  `engine-idn-session-proof`), `modules/people/idnPrefill.ts`, `modules/people/tables.ts` (`idnPrefills`),
  `packages/social-domain/src/handleSuggestion.ts` (`idnHandleLadder`), `convex/crons.ts`.
- Tests : `packages/social-domain/src/handleSuggestion.test.ts`, `betterAuth/settings.test.ts`,
  `betterAuth/auth.test.ts`, `modules/people/idnPrefill.test.ts`, `modules/people/erasure.test.ts`,
  `tests/ratchets/idn-prefill-writer.test.ts`.
