# Invitation démo acceptée et visible des deux côtés — 21/10/2026

La recette est terminée sur https://antsia.vercel.app/demo : Sylvie OYANE @presse.demo a envoyé une invitation à Awa MBA @membre.demo, qui l’a acceptée dans l’interface normale. Après un rechargement complet de chaque compte, la connexion apparaît des deux côtés sans erreur de chargement ni avertissement ou erreur console capturé.

## Résultats observés

| Compte connecté et confirmé | Avant | Après acceptation et rechargement |
|---|---|---|
| Awa MBA @membre.demo | Aucune connexion acceptée | Sylvie OYANE, une connexion |
| Sylvie OYANE @presse.demo | Patrick MOUSSAVOU et Jean-Rémy NDONG | Awa MBA, Patrick MOUSSAVOU et Jean-Rémy NDONG, trois connexions |

L’invitation reçue disparaît après acceptation. Les trois invitations sortantes préexistantes d’Awa restent présentes. Le contrôle final Sylvie a été effectué à 08:26 UTC, après rechargement explicite.

## Conservation des données

Inventaire complet borné à 100 lignes sur le backend de démonstration `vivid-hedgehog-655` :

- Avant : huit documents de connexion, soit cinq acceptés et trois invitations en attente.
- Après : neuf documents, soit six acceptés et les trois invitations toujours en attente.
- Les huit documents préexistants ont exactement la même empreinte SHA-256 canonique, sans modification ni suppression.
- Les quatorze abonnements de personnes sont inchangés, document par document.
- Une seule nouvelle relation existe : `pd70jbet8ae3n0gwbj6gk97qs18gpy11`, entre Sylvie et Awa, passée de `requested` à `accepted`. Elle est conservée.

Les écritures ont été faites uniquement par les boutons normaux d’envoi et d’acceptation. Les commandes d’inventaire étaient en lecture seule. Aucun autre contenu ni relation n’a été supprimé, aucune graine exécutée, aucun code applicatif, paramètre ou déploiement modifié pour cette recette.

## Preuves

- [Profil et réseau de Sylvie après rechargement](recette/invitation-demo-2026-10-21/sylvie-after-reload.png)
- [Réseau d’Awa après rechargement](recette/invitation-demo-2026-10-21/awa-after-reload.png)
- [Invitation envoyée](recette/invitation-demo-2026-10-21/sylvie-sent.png) et [invitation reçue](recette/invitation-demo-2026-10-21/awa-received.png)
- [Bilan et conservation](recette/invitation-demo-2026-10-21/summary.json), [inventaire final](recette/invitation-demo-2026-10-21/after-final-reload.json)
- [Console Sylvie](recette/invitation-demo-2026-10-21/console-sylvie.json) et [console Awa](recette/invitation-demo-2026-10-21/console-awa.json)

## Conditions de reprise

Le profil Chrome partagé a changé d’identité démo pendant la reprise. Le contrôle Sylvie a été achevé dans une fenêtre privée, par connexion démo normale puis rechargement. Aucune cause précise de défaut applicatif d’authentification n’a été établie ; aucune correction de code n’est revendiquée par cette recette. Les vérifications de transport n’ont enregistré ni cookie, ni jeton, ni code de connexion.
