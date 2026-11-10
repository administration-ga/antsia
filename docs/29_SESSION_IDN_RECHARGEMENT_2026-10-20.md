# Session IDN et rechargements — 20 octobre 2026

**Résultat en production : cinq rechargements complets et une nouvelle ouverture conservent le compte @asted sur /fil, sans nouvelle demande IDN et sans contenu publié.**

## Diagnostic constaté

Les journaux Vercel de la production ANTSIA montrent deux appels explicites
réussis sur la version audio déjà en ligne :

- `POST /api/auth/revoke-sessions` : 18:50:15.700 UTC (20:50:15 à Paris), HTTP200 ;
- `POST /api/auth/sign-out` : 18:50:17.216 UTC, HTTP200 ;
- la recette d’aperçus a constaté l’entrée IDN après rechargement à18:51:26.016 UTC.

La révocation précède donc le symptôme d’environ69secondes. La recette de
changement de compte menée dans un autre chat décrit cette révocation volontaire.
La projection administrative en lecture seule, bornée à25sessions et sans
sélection des jetons, confirme zéro session côté ANTSIA à19:02:15 UTC.
Le rechargement ne peut pas rétablir une session révoquée. Aucun identifiant de
session n’avait été relevé lors de l’échec historique : la corrélation avec ce
navigateur précis ne peut pas être prouvée par un identifiant.

Le précontrôle `DELETE /api/session-bridge` ne révoque aucune session Better Auth :
il ferme le reçu local avant de vérifier à nouveau le SDK, le JWT et la session
serveur. La durée configurée des sessions est sept jours ; le JWT dure30minutes.
Ces durées ne neutralisent pas une déconnexion explicite.

## Correction apportée

Dans `packages/api/src/cross-domain-session-bootstrap.ts`, une réponse de session
contenant une erreur sans statut HTTP était assimilée à une absence de session.
Cela effaçait le matériau local et renvoyait `signed_out`. Cette réponse est
maintenant retentée dans la limite existante ; si elle reste en erreur, la porte
reste fermée et propose une reprise sans effacer les identifiants du SDK.

L’absence confirmée sans erreur et le refus401 purgent toujours la session locale.
Les barrières OTT, corrélation de sujet/session/JWT, révocation et expiration sont
conservées. Aucune session n’est admise depuis le seul cache.

Ce défaut défensif n’est pas présenté comme la cause prouvée du symptôme initial :
le vrai SDK installé rejette directement les coupures réseau, sans produire une
enveloppe d’erreur sans statut. Les réponsesHTTP503/status0 conservent déjà le
stockage ; seule une réponse200/null le purge dans le plugin.

## Validation et livraison

- Régression avant correction :47tests réussis,2échecs reproduits sur49tests.
- Après correction :204tests du paquet API réussis, typage et lint des deux
  fichiers modifiés réussis ;89tests ciblés bootstrap/provider/déconnexion verts.
- Version préparée : `session-reload-20261020-7512840237b38401`.
- Base publique conservée : `3507e4a264c0a135f0d07faa3b4c2432e814423f` ; seuls
  le bootstrap et son test changent dans le manifeste de2994fichiers.
- Vercel `antsia`, équipe `okatechs-projects-f0102678`, production :
  `dpl_6coT1M8U4HnyMtqAAS5Kh8nhHr4K`, build et typage complets réussis.
- Promotion terminée : https://antsia.vercel.app sert la nouvelle version ; santé200 et version confirmées à19:07:42 UTC.
- Contrôle du build préparé et public : santé200, version attendue, backend
  `diligent-avocet-585` dans la CSP ; backend de démonstration absent.
- Aucun déploiement Convex, secret, fichier d’environnement ou contenu social
  modifié par cette correction.
- Échantillon de journaux du nouveau déploiement : aucune erreur remontée sur la
  fenêtre bornée à15minutes (30résultats maximum), sans preuve membre induite.

## Recette connectée validée

Le propriétaire a terminé la connexion IDN officielle. Le fil de production
`https://antsia.vercel.app/fil` affiche le profil public @asted et le bouton de
sortie. Les scripts rendus identifient bien `dpl_6coT1M8U4HnyMtqAAS5Kh8nhHr4K`.

Cinq rechargements complets du navigateur ont été effectués, avec attente de la
fin des gardes de session à chaque fois :

| Rechargement | Heure UTC | Page | Même profil | Nouvelle demande IDN |
| --- | --- | --- | --- | --- |
| 1 | 20:19:10.519 | /fil | @asted | Non |
| 2 | 20:19:13.592 | /fil | @asted | Non |
| 3 | 20:19:16.353 | /fil | @asted | Non |
| 4 | 20:19:27.274 | /fil | @asted | Non |
| 5 | 20:19:30.174 | /fil | @asted | Non |

Un onglet neuf ouvert ensuite sur /fil restitue lui aussi @asted, sans
reconnexion. Il a été fermé après enregistrement des preuves ; l’onglet membre
principal reste ouvert pour le propriétaire. Aucun clic de publication, envoi de
média, message, réaction, changement de préférence ou déconnexion par l’agent.

La projection administrative bornée, sans sélection des jetons, relève les mêmes
empreintes de sessions et de sujets avant/après les cinq rechargements et la
nouvelle ouverture. Les sessions restent non expirées : aucun nouveau login n’a
été nécessaire à chaque rechargement. Les identifiants bruts ne sont pas conservés.

## Limite du constat

Cette recette prouve la persistance immédiate après plusieurs rechargements et
une ouverture supplémentaire dans Chrome, profil Asted. Elle ne mesure pas une
attente de sept jours ni un redémarrage complet du système.

## Reprise de la connexion

La première confirmation du propriétaire correspondait à la fenêtre active de
`antsia-demo.vercel.app`. La production n’avait alors aucune session : les deux
origines disposent de stockages distincts. Un parcours IDN neuf de production a
été mis au premier plan ; le propriétaire a ensuite terminé la connexion réelle.
La phase d’attente a été résolue avant la recette ci-dessus.

Preuves : `docs/recette/session-rechargement-production-2026-10-20/`, notamment
`rechargements-connectes.json`, `nouvel-onglet-connecte.json`,
`comparaison-session-apres-reloads.json`, les cinq captures `rechargement-*.png`
et `nouvel-onglet-connecte.png`. Les journaux historiques, le manifeste de
livraison et les validations locales sont conservés dans le même dossier.
