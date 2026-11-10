# P16 — Candidate et plan de reprise du 20 octobre 2026

Demande : poursuivre P16 sans relancer les vérifications et préserver les travaux parallèles. Ce plan précède les corrections de cette reprise. Candidate : ANTSIA `c4d36f3` et PRO.GA `fa349ea`, avec leurs changements non commités, notamment les reprises P14/P15 du 20 octobre. Ces références situent les sources ; aucun nouveau résultat de test, génération, recette ou publication n’est acquis.

## Lots applicables et exclusions

| Lot | Sources et bilan utilisés | Preuve de cette reprise |
|---|---|---|
| P07 Boutiques | `rapports/P07_BOUTIQUES.md`, politique et admission des vitrines | Lecture source seulement |
| P08 Liaison/transport | `rapports/P08_LIAISON_TRANSPORT.md`, mandats, consentements, reflets | Lecture source seulement |
| P09 Catalogue | `rapports/P09_CATALOGUE.md`, projections et retraits | Lecture source seulement |
| P10 Contact | `rapports/P10_CONTACT_COMMERCIAL.md`, transfert/retrait CRM | Lecture source seulement ; corrections de garde/cycle de données ciblées, pas de refonte du lot |
| P11 Préparation | `rapports/P11_COMMANDE_STOCK.md`, préparation et clôture | Lecture source ; aucune recette stock relancée |
| P12 Paiement | `rapports/P12_PAIEMENT.md`, gardes et suivi historique | Lecture source ; aucun encaissement ni fournisseur activé |
| P13 Achats | `rapports/P13_ACHAT_ET_SUIVI.md`, suivi et support privés | Lecture source ; aucune transaction ni retour réel |
| P14 Services | `rapports/P14_REPRISE_2026-10-20.md`, preuves, fences et cycle de vie | Changements en sources, scénarios écrits non exécutés |
| P15 Emploi | `rapports/P15_REPRISE_2026-10-20.md`, sessions, CV et reprise des suppressions | Changements en sources, scénarios écrits non exécutés |

P14B est couvert comme complément de suivi, sans inventer de réception appareil. P17 natif, les recettes P18/P19, les publications et les décisions juridiques sont exclus de cette reprise. Les résultats historiques du 19 octobre ne valident pas les changements actuels. Aucun audit automatisé ni inventaire calculé n’est lancé.

## Réservations et corrections décidées

- Coordination : politique automatique des vitrines (`shops/{access,decisions,rules}.ts` et tests ciblés), ce plan, inventaire/matrice et bilan datés. Le mode automatique non validé est fermé côté serveur, y compris pour les anciennes valeurs stockées ; les vitrines admises et la file de revue sont conservées.
- Backend ANTSIA : export des contenus partagés limité à l’activité personnelle, inventaire P16 des nouvelles fences/champs ; transfert CRM lié à l’autorité et à la liaison d’origine, preuve récente provenant d’un geste réel, portes avant/après transport. Le retrait privé reste possible ; après épuisement technique, il conserve sa référence et reprend sans se déclarer confirmé. Pas de protocole interproduits nouveau.
- Interface ANTSIA/console : avertissement d’effacement permanent et état de lecture indisponible explicite, texte distinguant copies sociales et obligations PRO.GA ; accord public attaché à la version affichée ; callbacks des recours corrélés à l’acteur. Raccord serveur mécanique des politiques paiement/services/candidatures à un registre de décisions fermé tant que recette/conservation requise manque ; les nouvelles opérations sont bloquées, les voies historiques conservées. Les classes de charte et les composants partagés sont conservés.
- PRO.GA : sessions vivantes pour les lectures privées identifiées, révocation du seul mandat de publication d’emploi provoquant aussi le retrait de ses reflets, inventaire de la file de purge CV et des preuves/index P14/P15. Fermeture des nouveaux engagements de services/candidatures et des nouvelles copies de CV tant que leurs dépendances ne sont pas validées ; rejeux et suivi historique conservés. La fenêtre d’un crash entre stockage et rattachement d’un nouveau CV reste à traiter avant réactivation, sans introduire de purge globale. Les fonds, factures et obligations antérieures ne sont ni détruits ni réécrits.

Tous les intervenants préservent les changements P14/P15, DIASPORALE et les fichiers d’identité/session, `persons.ts`, `memberships.ts`, chartes et primitives des autres sessions. Les ajustements de données/export et des anciennes surfaces se font par ancres ciblées. Aucun changement de branche, staging, commit ou publication.

## Décisions restant ouvertes

La liste des secteurs et la politique d’admission automatique ne sont pas validées : revue humaine conservée. Aucune durée légale, purge générale PRO.GA, permission de membre suspendu, mécanisme de recours contre suspension de vitrine ou nouveau contrat d’effacement n’est inventé. Un retrait distant encore inconnu ne prouve aucune suppression. Les configurations/capacités restent à faire valider avant activation.

Aucun codegen, test, typage, lint, build, audit automatisé, navigateur, HTTP/Convex de recette, installation, serveur/redémarrage, suppression de données réelle, nettoyage, environnement ou secret. Les scénarios de correction seront écrits seulement ; P16 ne pourra pas être annoncé éprouvé sans les vérifications différées.
