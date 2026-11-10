# Accueil `/bienvenue` corrigé et publié — 2 novembre 2026

> Dépôt public : les identifiants internes d'hébergement (déploiements, projets, équipes, adresses techniques) sont tenus hors du dépôt ; ce document les désigne par leur rôle (EX-20, 10/11/2026).

**Un nouveau membre peut de nouveau finir son inscription sur le site principal.** En ligne depuis 21 h 39 (Paris), sur accord explicite du propriétaire, en principal et en démo. Le moteur Convex n'a pas été touché.

## Le défaut

Un membre au statut `welcome` est envoyé sur `/bienvenue` par `network-shell.tsx`. Cette route montait `AccessHomeScreen`, qui le renvoie vers elle-même. Le correctif, `WelcomeScreen`, n'existait que dans l'arbre partagé depuis le 25/10.

| Parcours réel, navigateur vierge, compte fictif « Nouvel arrivant » | Avant | Après |
| --- | --- | --- |
| Arrivée | `/demo/bienvenue` | `/demo/bienvenue` |
| Titre | « Entrer sur ANTSIA » | « Bienvenue sur ANTSIA » |
| Écran | « Vérification de votre session… », encore là après 40 s | le formulaire d'accueil |
| Champs | aucun | nom affiché, identifiant, langue, fuseau, consentement |

Captures : `avant-nouvel-arrivant.jpg`, `apres-nouvel-arrivant.jpg`. Le formulaire n'a pas été soumis.

## Ce qui est en ligne

| Cible | Version | Déploiement |
| --- | --- | --- |
| Principal | `main-8ba2da363777-production` | tenu hors du dépôt |
| Démo, sous `/demo` | `main-8ba2da363777-demo` | tenu hors du dépôt |

Source : `main` `8ba2da36` (PR 93) et DIASPORALE `367c2bd`, empreinte `cbadddad7875`, manifeste joint. Par rapport au front précédent, seule la route `/bienvenue` change à l'exécution : les autres écarts sont des fichiers que le Web n'embarque pas (tests, thème natif, feuilles DIASPORALE) ou que le moteur avait déjà (PR 87).

**Retour arrière** : promouvoir les déploiements précédents, version `specialized-6095514b6a00`, démo puis principal (identifiants tenus hors du dépôt).

## Vérification

| Contrôle | Constat |
| --- | --- |
| `bun run verify` sur la PR | code 0 : moteur 3303, cliquets 150, scripts 92, 12 typages, 12 suites (13 311 tests, 4 ignorés), 11 lints sans erreur |
| Avant promotion, sur les URL privées | santé 200 et bonne version sur les deux sites, CSP limitée au bon moteur, 11 routes en 200 |
| Après promotion, en public | santé 200 et versions exactes ; CSP principal sur le déploiement Convex de production, démo sur celui de démonstration ; 8 routes en 200 |
| Membre existant, compte fictif « Commerçant » | passe par `/demo/bienvenue` et arrive sur `/demo/fil` |
| Visiteur anonyme | `/bienvenue` et `/demo/bienvenue` renvoient vers l'entrée ; `?publication=` est conservé ; aucune exception navigateur |
| Journaux Vercel, 30 min, deux projets | aucune erreur |

## Limites

- **Parcours complet non achevé** : le formulaire n'a pas été soumis, et le parcours n'a pas été rejoué avec un vrai compte IDN en production. La recette du 26/10 n'attribuait pas à ce défaut l'échec du PIN IDN, qui reste inexpliqué.
- **Variable du projet** : `ANTSIA_DEMO_RUNTIME_ORIGIN` n'a pas été modifiée au niveau du projet Vercel ; le nouvel enfant est transmis à ce seul déploiement. Une future publication doit continuer à la passer explicitement, comme la méthode le fait.
