# Accueil `/bienvenue` corrigé et publié — 2 novembre 2026

**Un nouveau membre peut de nouveau finir son inscription sur `antsia.vercel.app`.** En ligne depuis 21 h 39 (Paris), sur accord explicite du propriétaire, en principal et en démo. Le moteur Convex n'a pas été touché.

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
| Principal | `main-8ba2da363777-production` | `dpl_4zTE9154UWqLnj15Yjvqb85p5CzC` |
| Démo, sous `/demo` | `main-8ba2da363777-demo` | `dpl_7dTYDKoLNhbGneyv38nXFU93Gr5k` |

Source : `main` `8ba2da36` (PR 93) et DIASPORALE `367c2bd`, empreinte `cbadddad7875`, manifeste joint. Par rapport au front précédent, seule la route `/bienvenue` change à l'exécution : les autres écarts sont des fichiers que le Web n'embarque pas (tests, thème natif, feuilles DIASPORALE) ou que le moteur avait déjà (PR 87).

**Retour arrière** : promouvoir `dpl_ZD7mGDThdEPRTEvgpPyASzZvvhwD` (démo) puis `dpl_D93mYLT4Vp9hztfZ4TJwgYCqbwXT` (principal).

## Vérification

| Contrôle | Constat |
| --- | --- |
| `bun run verify` sur la PR | code 0 : moteur 3303, cliquets 150, scripts 92, 12 typages, 12 suites (13 311 tests, 4 ignorés), 11 lints sans erreur |
| Avant promotion, sur les URL privées | santé 200 et bonne version sur les deux sites, CSP limitée au bon moteur, 11 routes en 200 |
| Après promotion, en public | santé 200 et versions exactes ; CSP principal `diligent-avocet-585`, démo `vivid-hedgehog-655` ; 8 routes en 200 |
| Membre existant, compte fictif « Commerçant » | passe par `/demo/bienvenue` et arrive sur `/demo/fil` |
| Visiteur anonyme | `/bienvenue` et `/demo/bienvenue` renvoient vers l'entrée ; `?publication=` est conservé ; aucune exception navigateur |
| Journaux Vercel, 30 min, deux projets | aucune erreur |

## Limites

- **Parcours complet non achevé** : le formulaire n'a pas été soumis, et le parcours n'a pas été rejoué avec un vrai compte IDN en production. La recette du 26/10 n'attribuait pas à ce défaut l'échec du PIN IDN, qui reste inexpliqué.
- **Variable du projet** : `ANTSIA_DEMO_RUNTIME_ORIGIN` n'a pas été modifiée au niveau du projet Vercel ; le nouvel enfant est transmis à ce seul déploiement. Une future publication doit continuer à la passer explicitement, comme la méthode le fait.
