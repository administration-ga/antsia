# Déconnexion et changement de compte — 20–21 octobre 2026

## Périmètre

Demande explicite : reprendre la recette de la démo et de la production sans participation du propriétaire, corriger les défauts et publier les corrections nécessaires. Les comptes de démonstration passent par leur véritable parcours OTP. Aucun profil, rôle, secret ou session de production n'a été fabriqué. Aucune configuration `.env` n'a été modifiée.

## Défauts constatés

1. Production : la sortie réelle de `@asted` a révoqué ses deux sessions, mais le nettoyage tardif de présence a encore appelé `setOffline`. Le journal serveur confirme `unauthenticated` pour la requête `ab675d478225f2ae` à 22:02:51 UTC. Le hook de présence respecte désormais le verrou de sortie avant heartbeat et passage hors ligne.
2. Démo : une sortie dans un seul onglet est propre. Avec Awa connectée dans deux onglets IAB, une sortie a produit `/entrer?deconnexion=incomplete` et l'alerte réelle. L'autre onglet était revenu à `/entrer`, toutes les sessions Awa avaient disparu. La reproduction indépendante confirme que le défaut dépasse l'instrumentation Chrome. Preuve : `recette/session-switch-final-2026-10-20/demo-multitab-before-fix.json` et PNG.

Le cookie de génération est commun aux onglets, tandis que le verrou `Symbol.for` protège seulement le document. Le rechargement après révocation distante pouvait donc tourner cette génération pendant la purge de l'onglet initiateur. Le statut HTTP exact de ce DELETE n'a pas été capturé ; le scénario et l'échec utilisateur sont reproduits.

## Correction et garde-fous

Un verrou exclusif d'origine coordonne préparation, synchronisation du pont, entrée et sortie, jusqu'à la réponse de purge et à l'appel de navigation. La génération et le SID sont relus après acquisition. Le mécanisme suit [Web Locks du W3C](https://www.w3.org/TR/web-locks/).

- Attente annulable de 30 s ; transports actifs bornés séparément. Aucun verrou imbriqué ni attente du nouveau document sous verrou.
- Les contrôles SID/JWT/session vivante/génération/origine restent actifs. Une ancienne réponse A n'est pas réadmise après B.
- Une branche anonyme ancienne refuse d'effacer un nouveau compte apparu pendant l'attente.
- Sans verrou disponible, l'entrée reste fermée ; la sortie poursuit révocation et purge SDK, conserve l'avertissement, et ne modifie aucun reçu étranger.
- La présence ne tente plus d'écriture pendant sa propre déconnexion.

## Validation des sources

`bun run codegen` et typage Convex strict réussis. 171 tests ciblés passent : 106 API/session/bootstrap, 10 présence, 30 client/serveur/purge, 15 composant pont, 10 cliquets de déconnexion. Typage ANTSIA et lint des sept fichiers ciblés réussis. Le contrôle global de tout le WIP partagé n'est pas annoncé vert.

Les candidats reprennent exactement les précédentes bases publiées, avec seulement sept fichiers supplémentaires : les trois modules de pont/sortie, leurs tests et `identity-tools.tsx`. Le correctif présence et les huit images/manifeste de démo sont conservés. Les empreintes complètes et les deltas sont dans les manifestes de livraison sous `Library/Caches/antsia-releases/20261021-session-coordination/`.

## Livraison et recette finale

| Cible | Version publiée | Déploiement |
| --- | --- | --- |
| Production `antsia.vercel.app` | `session-coordination-20261021-03548f8c8f01470e` | `dpl_UxMyjdTakahwkCjfRSyy7PFF9gAL` |
| Démo `antsia-demo.vercel.app` | `session-coordination-20261021-2243812195053c44` | `dpl_BzEYA98dUM5NAvx6Du2fpT1oB9n3` |

Deux builds Next 16.2.9 et typages distants réussis, candidats READY et santé/CSP validés avant promotion. Deux domaines canoniques relus : HTTP 200, version exacte, backend configuré et CSP présente (22:35:36–37 UTC).

Recette finale après publication, 22:36–22:39 UTC :

1. Awa MBA `@membre.demo` visible dans deux onglets de la version publiée.
2. Sortie depuis le premier : les deux onglets reviennent à `/entrer`, sans queryflag incomplet ni alerte de session ; toutes les sessions Awa supprimées.
3. Jean-Rémy NDONG `@verifie.demo` visible, conservé au rechargement, puis affiché dans le second onglet. Aucune ancienne session Awa restante.
4. Sortie depuis le second onglet : les deux écrans deviennent anonymes ; toutes les sessions Jean-Rémy supprimées. L'accès direct à `/fil` retourne à l'entrée.
5. Retour à Awa, rechargement complet réussi ; nouvelle empreinte de session distincte du premier passage, Jean-Rémy toujours déconnecté.
6. Sortie finale : zéro session Awa/Jean-Rémy, autres empreintes de sessions démo inchangées pendant ce cycle. Deux onglets laissés anonymes.

Les 16 états UI enregistrés correspondent aux profils attendus et aux nouveaux déploiements : zéro avertissement d'authentification, zéro warning/error console, zéro URL `deconnexion=incomplete`. Une notification métier d'invitation est conservée dans les alertes brutes ; elle n'est pas une erreur de session. Preuves : `final-ui-summary.json`, `final-session-comparison.json`, captures et JSON de chaque phase.

Production après publication : accès direct à `/fil` redirigé vers `/entrer`, aucune coque membre ni alerte de session, console vide ; ouverture normale IDN vers son formulaire d'adresse vide, bouton Continuer désactivé, sans reprise silencieuse du compte précédent. La production reste à zéro session pendant toute cette recette finale. Ces vérifications anonymes ne prouvent pas une nouvelle sortie authentifiée après le correctif ni une bascule entre deux personnes réelles.

## Limite de la production

Une seule personne ANTSIA réelle, `@asted`, est présente dans l'inventaire borné. Les deux sessions initiales étaient du même sujet et ont été révoquées par la sortie réelle. Le formulaire IDN officiel présente ensuite une adresse vide, sans reprise silencieuse, et le nouveau flux OAuth demande `prompt=login`, avec client/callback corrélés et PKCE S256. Aucun deuxième compte authentifié n'est disponible dans les navigateurs contrôlés. Le cycle entre deux identités réelles de production reste donc non vérifié. Aucun PIN/OTP n'a été extrait des données et aucun mode de démonstration n'a été activé en production.

## Preuves

Dossier `docs/recette/session-switch-final-2026-10-20/` : états UI, captures, journaux et inventaires de sessions projetés en empreintes SHA-256 tronquées. Aucun jeton, cookie de session, PIN ou OTP dans les preuves. `demo-a-return-reload.json` est explicitement marqué invalide : capture native initiale dans le mauvais onglet ; il n'est pas utilisé comme preuve.

Aucun commit/push applicatif dans l'arbre partagé pendant cette recette. Les sources réelles sont modifiées en place ; les manifestes tracent précisément les versions publiées.

## Complément après livraison des statuts — 21 octobre

Le rapport [Statuts, chartes et comptes](design-systems/11_STATUTS_ET_COMPTES_2026-10-21.md) trace les versions `stories-design-20261021-*`, les 28 combinaisons thème/apparence, un nouveau cycle démo Awa → Jean-Rémy → Awa avec rechargements et deux onglets, ainsi qu'une sortie réelle d'Asted après publication du correctif. La production passe d'une session non expirée à zéro, sans avertissement de déconnexion ni erreur console. La limite portant sur deux personnes réelles distinctes reste ouverte.

## Nouvelle tentative entre comptes réels — 21 octobre, 00:04 UTC

Après l’annonce de connexion du deuxième compte, l’observation montre encore Asted `@asted` avant et après rechargement. Le serveur contient un seul utilisateur ANTSIA et un seul compte IDN lié ; les deux sessions sont du même sujet que le premier compte. Cette tentative ne prouve donc pas un deuxième compte distinct. Le déploiement observé est `dpl_H7tUFizo4AroUJ9XFgCUuCq4AdQH` (publication parallèle).

La sortie normale ANTSIA révoque ces deux sessions : zéro session active à 00:06:22 UTC, `/entrer` sans profil, bouton membre, indicateur incomplet ou alerte à 00:06:42 UTC. Aucun warning/error console au contrôle du profil et après reload. La sortie du portail IDN reste non confirmée : instabilité de chargement puis Mac verrouillé, déverrouillage automatique indisponible. Le cycle réel A→B→A reste ouvert. Dossier : `docs/recette/comptes-reels-aller-retour-2026-10-21/`. Aucun contournement de connexion, secret lu ou changement applicatif dans cette reprise.
