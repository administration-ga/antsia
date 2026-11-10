# Mes connexions — production ANTSIA, 21 octobre 2026

## Version publiée et version vérifiée

`https://antsia.vercel.app` sert `stories-draft-20261021-86e8cb32a156d65c`, déploiement `dpl_AquvvpCxU58a69Q7ZDAof8Y9Fyax`. Le hook de pagination et son test sont déjà strictement identiques au correctif vérifié et livré sur la démo. Les 3 184 empreintes du manifeste source de cette version ont été vérifiées. Aucune reconstruction identique du frontend ni retour à la base de démonstration. Pendant la recette finale, la publication parallèle de la démo sous /demo a fait évoluer le frontend canonique vers `demo-path-20261021-production-282e26b0a9e64f29` / `dpl_FdLMA2wAQfQRx5PKcFRRUv4ncooM`. Santé publique HTTP 200, manifeste de publication et deux empreintes exactes du hook/test de connexions vérifiés sur cette version ; publication parallèle conservée.

## Conservation des relations

Inventaire complet et borné de `connections` sur `diligent-avocet-585` : table vide, donc 0 connexion acceptée et 0 invitation. Lectures complètes avant et après publication : même empreinte canonique `4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945`. Aucune relation, invitation, personne ou adhésion modifiée/créée ; aucune graine, donnée de démonstration ni session fabriquée en production.

## Blocage découvert pendant la recette

La session Chrome réelle est déconnectée. Le bouton IDN renvoie un message générique : HTTP 200, mais corps réduit à `{ headers: … }` au lieu de la redirection OAuth. La vraie requête du navigateur porte `Better-Auth-Cookie`, même vide ; sans cet en-tête, le démarrage HTTP semblait valide. Aucun cookie, code ou secret conservé dans les preuves.

Le raccord natif réenveloppait les handlers crossDomain déjà décorés par Better Call. La correction source délègue leur enveloppe intacte et conserve un middleware vide correctement enveloppé pour le cas natif à exclure. Le contrôle du retour natif, du code S256 et des sessions reste actif. L’endpoint natif est déjà présent sur le backend de production (validation HTTP avant cette intervention), contrairement à l’ancien état de la mémoire.

Tests : régression OAuth navigateur rouge avant correction ; 69 tests auth/OTP/natif verts après, dans l’arbre réel et dans le candidat isolé ; codegen/typages stricts verts. La simulation de publication cible `diligent-avocet-585`, valide le schéma et ne supprime aucun index. Publication backend terminée sur la cible exacte, typage strict et schéma validés, aucun index supprimé. Comparaison exhaustive avant/après : les 949 fonctions et routes sont inchangées (signatures et visibilité). Le transport avec `Better-Auth-Cookie` vide renvoie désormais HTTP 200 avec `url`, `redirect: true`, client ID, état et PKCE S256 présents ; cookie navigateur transmis, aucune valeur sensible conservée.

Preuves : `docs/recette/connexions-production-2026-10-21/`. Candidat backend et manifeste : `~/Library/Caches/antsia-releases/20261021-connections-production-auth/`. Aucun `.env*` ni paramètre d’hébergement modifié.

## Recette connectée terminée

Après déverrouillage du Mac, le bouton IDN normal ouvre le formulaire privé correctement. Le propriétaire termine sa saisie du PIN ; retour normal à ANTSIA, profil public **Asted @asted** affiché. Aucun code, cookie, PIN ou secret n’est conservé dans les preuves.

- « Mon réseau » puis « Mes relations » : **Mes connexions / Aucune connexion.**, sans bandeau d’erreur.
- « Invitations » : aucune invitation reçue en attente, aucune demande envoyée en attente de réponse.
- Retour à Mes relations puis navigation complète et rechargement complet : même profil Asted, panneau chargé sans erreur, session conservée.
- Console de l’onglet : **0 avertissement, 0 erreur**.
- Inventaire `connections` relu après la recette : toujours 0 document, empreinte strictement identique à l’état initial. Rien créé, modifié ou supprimé dans les relations/invitations. Aucune donnée de démonstration injectée en production.

Captures : `docs/recette/connexions-production-2026-10-21/apres.png` et `invitations.png`. États complets et résultat structuré dans le même dossier. Onglet conservé sur le panneau vérifié et session réelle laissée connectée. La production ne contenait pas de relation/invitation à cette date ; la recette de listes non vides reste celle du compte de démonstration, déjà vérifiée sans altérer son contenu.
