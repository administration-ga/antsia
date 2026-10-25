# Espaces spécialisés — recette responsive du 25 octobre 2026

Statut : **publié et contrôlé après publication** sur https://antsia.vercel.app, le 25 octobre 2026.

## Périmètre

Boutiques, catalogues, fiches produits, prestataires, prestations, espace professionnel et presse. Recette dans le navigateur sur `antsia.vercel.app/demo`, avec le compte fictif existant, à **390 × 844**, **834 × 1112** et **1440 × 1000**. Le compte réel, les messages, commandes, contrats, profils et articles ne sont pas modifiés par ces contrôles.

## Corrections

1. L’action **Effacer les filtres** de l’annuaire pro conserve une saisie non envoyée lorsque l’URL n’a pas de filtres. Le formulaire est maintenant réinitialisé, ainsi que la langue libre, les erreurs et le volet avancé. Deux cas d’interaction couvrent les URL sans filtres et avec filtres, sans remontage du formulaire.
2. L’index dérivé du catalogue marketplace est absent sur les deux moteurs. Une reconstruction bornée existante a été démarrée une fois par racine. Les deux index ont été relus en génération 1, version 2, état `ready`. Le message permanent de préparation est remplacé par l’état vide réel. Aucune offre, capacité de paiement ou donnée métier créée.

## Conservation du travail parallèle

La navigation C9 publiée pendant les premiers contrôles est la base du nouveau candidat. Les premiers déploiements préparés depuis la version du 24 octobre n’ont pas été promus. Le candidat recomposé conserve les 3 325 fichiers de cette navigation, avec seulement les deux fichiers pro corrigés. Les sources locales SU06, les modules de l’autre session, la branche, HEAD et l’index Git partagé sont préservés.

## Limites de la recette

Les données spécialisées pro et presse de la démo sont vides : annuaire, formulaires, collaborations, rédaction et pagination des états vides sont contrôlés. La publication d’un article, une collaboration réelle et une transaction ne sont pas revendiquées. Aucun contrat de paiement disponible ; capacités réelles conservées fermées.

## Ajustement de compatibilité du bandeau démo

La nouvelle navigation C9 appelle déjà la porte partagée `signOutAndRedirect`. Son gestionnaire local nommé `signOut` déclenche néanmoins le contrôle AST qui réserve ce nom aux méthodes SDK. Renommage en `handleSignOut`, sans modification du comportement ni du garde-fou. Le correctif est appliqué au vrai source et au candidat publié ; le patch exact contre C9 est joint. Les autres changements de navigation restent sous la responsabilité de leur session, sans import fragmentaire dans Git.

Le test de hauteur de la messagerie attendait encore l’ancien bandeau dans le flux. Il vérifie désormais `height:100dvh` et l’absence de l’ancien jeton de soustraction. Seul le test change ; le code de messagerie conserve le comportement C9. Patch documentaire joint, pour la même intégration propriétaire.

La vérification du contexte publié ne constitue pas une vérification globale de l’arbre Git `main + PR86`, qui diffère de la version déjà publiée. Les identités Git et de publication sont présentées séparément.

## Vérification du candidat final

`bun run verify` complet, dans un environnement isolé, sur le contexte C9 + quatre blobs. **16 819 tests réussis, 4 ignorés**, sortie 0 ; tous les typages, tests des scripts et lint des 11 espaces de travail passent. Les avertissements préexistants sont conservés. Aucun test assoupli ni désactivé. Sources inchangées avant/après, génération sans différence.

- Empreinte du contenu : `6095514b6a00b9ec3db4291c9218cbbc7885f75cfd15b5b47622565de2cac192`.
- Manifeste : `21cd9b09dfdcebd3c14d0dad75cd9ef9a590ef2a41c5b09779f8eb488daddcfe`.
- Empreinte de comparaison avant/après : `723900872ee27153cd82b10899d0620dc8a9e529093426017980ece54cca7813`.
- Journal complet privé : SHA-256 `e3a1e6681af9cd841ea873bd2027319073e7bfa63635b924ba48cf0d94115700`, 861519 octets.
- Le contrôle de charge du fil reste exécuté, sans réduire sa charge ni augmenter sa limite.

Les deux essais intermédiaires ont exposé le nom du gestionnaire de sortie puis l’attente périmée de hauteur de messagerie. Ces deux cas ont été corrigés avant la vérification complète réussie ; leurs journaux sont conservés séparément.

## Traçabilité Git

Le correctif fonctionnel pro et ses deux cas de régression sont dans le commit `e351ca440611a9701d071079cab0651457804616`, sur la branche `codex/specialized-responsive-fixes-20261025`, PR86. La nouvelle navigation déjà publiée par l’autre session diffère encore de `main`. Ses deux ajustements de compatibilité sont appliqués au vrai source et au candidat publié, avec leurs patches documentaires exacts joints pour son intégration Git. Aucune reprise partielle des autres fichiers de navigation dans la PR86.

## Publication confirmée

- Principal : `specialized-6095514b6a00-production`, déploiement `dpl_D93mYLT4Vp9hztfZ4TJwgYCqbwXT`.
- Démonstration sous `/demo` : `specialized-6095514b6a00-demo`, déploiement `dpl_ZD7mGDThdEPRTEvgpPyASzZvvhwD`.
- Les deux routes de santé publiques répondent 200 avec les nouvelles versions et les moteurs attendus ; la CSP exclut le moteur étranger dans chaque cas.
- L’origine démo persistée du projet principal a été mise à jour vers cet enfant immuable, puis relue. Aucun secret ni fichier d’environnement modifié.
- `antsia-demo.vercel.app` reste supprimé : réponse404.

## Contrôles après publication

**27 mesures et interactions supplémentaires** après une seule reprise du document pour adopter la nouvelle version. Remise à zéro pro vérifiée sans rechargement aux trois formats ; boutiques, prestations, fiches service, marketplace, profil pro, presse et rédaction sans débordement horizontal. Un seul contenu principal par page. Console : zéro erreur. Captures conservées pour la boutique390, les prestations834, le pro1440 et la presse390.

Retour vers le fil puis vers la marketplace par les liens de l’interface : compte Awa MBA toujours présent, publications démo accessibles,12notifications nonlues et3invitations affichées. Le profil pro reste noncréé. Aucun message, contrat, commande, consentement ni article envoyé. Le compte réel n’a pas été déconnecté. La marketplace est laissée ouverte à390px.

Les premières42mesures couvraient également le catalogue, les prixminimums2500/3500/4000XAF avec tri ascendant, les fiches produit, la recherche de prestation, sa réinitialisation conservant `type=service`, les vues grille/liste et les collaborations. Aucun problème de navigation produit reproductible après stabilisation des filtres.

## Préservation

HEAD partagé, branche et entrées de l’index Git inchangés après les opérations. Aucun serveur local arrêté ; SU06, natif, console, modules DIASPORALE et PRO.GA nonpubliés par cette intervention. Les index dérivés sont prêts sur les deux moteurs, sans publication de code backend. La navigation C9 publiée pendant la recette est conservée dans le candidat final.
