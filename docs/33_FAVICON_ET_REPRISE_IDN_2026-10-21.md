# Favicon et reprise IDN — 21 octobre 2026

## Correction et publication

`/favicon.ico` renvoyait 404 sur ANTSIA, sa démo et IDN. Le fichier ANTSIA réel est ajouté à `apps/antsia_ga/src/app/favicon.ico` : monogramme de la marque, ICO décodable en 16/32/48/64 pixels. Next produit sa route statique et sa balise de métadonnées, sans changement de configuration, thème, session ou backend.

| Cible | Version publiée | Déploiement | Résultat HTTP |
| --- | --- | --- | --- |
| https://antsia.vercel.app | `favicon-20261021-da994563d25d2e11` | `dpl_HnnqfRxbwo88ui8uq12Bhawn63xJ` | favicon 200, santé 200 |
| https://antsia-demo.vercel.app | `favicon-20261021-f2be15a6cd2d90e6` | `dpl_7Mk1uddWVe8cEd7M5UquUmmt7JM5` | favicon 200, santé 200 |

Chaque candidat reprend sa dernière base canonique et ajoute exactement un fichier. Les derniers correctifs responsive de production, les sessions, l’antivirus et les contenus de démonstration sont conservés. Construction et typage distants réussis ; état READY avant promotion. Les fichiers servis ont la même empreinte SHA-256 que le source, `17d852570781ea593894532cff3ef4e5c57481d873db9eabbf911ccec3ea9149`. Les deux pages d’entrée publient la balise `/favicon.ico?...`. CSP présente, backend configuré. Aucun test global du WIP partagé ni déploiement Convex revendiqué.

Pour IDN, `apps/web/public/favicon.ico` est préparé dans son dépôt réel à partir de son `app/icon.svg` existant, sans changer le dessin. Le domaine IDN reste en 404 pour cette route : son projet n’est pas accessible avec l’équipe Vercel connectée. Aucune publication d’un autre projet à sa place. Le connecteur Vercel a été tenté ; les publications ANTSIA passent par les identifiants CLI de l’équipe exacte. Aucun secret ou fichier `.env` modifié.

## Recette des comptes réels

La sortie IDN normale est confirmée, adresse vide et nouvelle connexion exigée. ANTSIA : zéro session active, accès privé renvoyé vers l’entrée sans avertissement ni erreur console sur le nouveau déploiement. La précédente tentative de deuxième compte affichait encore Asted avant et après reload et présentait le même sujet serveur : elle ne compte pas comme bascule.

Le formulaire officiel du compte distinct est préparé avec prompt de connexion et PKCE S256 ; son authentification privée reste requise. Le Mac s’est reverrouillé avant le contrôle du premier plan. Le cycle réel A→B→A reste non vérifié. Aucun identifiant/PIN extrait ni session fabriquée.

Preuves : `docs/recette/favicon-2026-10-21/` et `docs/recette/comptes-reels-aller-retour-2026-10-21/`. Manifestes de livraison exacts : `~/Library/Caches/antsia-releases/20261021-favicon/{production,demo}/manifest.json`. Aucun commit/push applicatif dans l’arbre partagé pour cette reprise.
