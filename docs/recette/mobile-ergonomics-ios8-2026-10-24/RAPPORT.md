# Corrections ergonomiques et préparation iOS8

Travail commencé le24octobre et poursuivi le25octobre2026, heure de Paris.

**État : trois corrections dans les sources, deux vérifiées dans le simulateur ; dernier essai du clavier logiciel bloqué par le pilotage puis le verrouillage du Mac. IPA0.1.0(8) signé et contrôlé localement, conservé comme candidat, sans soumission Apple.**

## Changements dans les sources réelles

- Vitrine et recherche marchande : ajustement natif du défilement à la hauteur du clavier, boutons utilisables au premier appui, touche clavier Rechercher raccordée à la même validation que le bouton, puis fermeture du clavier à la recherche valide.
- Découvrir : choix de rubrique conservé dans le membre courant pendant l’ouverture des pages/vitrines et leur retour. Cet état reste en mémoire dans la composante liée à la personne et à sa session ; il ne passe pas au compte démo suivant.
- Associations : l’état de l’annuaire dépend de ses propres résultats, y compris lorsque Mes associations est rempli. Un chargement supplémentaire garde son état d’attente ; une dernière fenêtre vide ne propose pas de poursuivre un chargement déjà terminé. Message FR/EN précisé : « Aucune association trouvée dans cet annuaire. »
- Numéro iOS8 dans `app.config.ts`. La préparation de contexte inclut explicitement la primitive de champ modifiée ; aucune dépendance ni configuration d’environnement changée.

## Vérifications réalisées

| Contrôle | Verdict | Preuve |
| --- | --- | --- |
| Codegen préalable en dry-run et typage Convex | Réussi, sortie0 | Journal de commande du chat |
| Typage mobile | Réussi, sortie0 | `tsgo --noEmit` |
| Suite mobile existante | 23 fichiers, **172 tests réussis** | Vitest, 5,06s |
| Lint mobile | Sortie0, **0 erreur**, 37 avertissements | ESLint |
| Installation0.1.0(8) | Même bytecode que le candidat IPA, conteneur de données conservé | `ipa-validation.json` et preuve privée d’installation |
| Administration : Mes activités → Mairie → Retour | **Réussi** : Mes activités toujours sélectionné et Mairie toujours présente | `04` à `07` |
| Association : recherche inexistante avec une page possédée | **Réussi** : Mes associations reste rempli et le message vide apparaît sous l’annuaire dans l’arbre d’accessibilité natif | `13` à `15` |
| Association : page → Retour | **Réussi** : Associations reste sélectionné | `20`, `21` |
| Changement de compte Association → Commerçant | **Réussi** : nouvelle session sur Boutiques, puis activités Épicerie ; aucun choix de rubrique ni mandat repris de l’ancien membre | `23` à `28` |
| Recherche vitrine avec clavier logiciel ouvert | **À terminer** : champ « riz » prêt, mais clavier logiciel non affiché ; aucun succès de ce scénario revendiqué | `29`, puis blocage Mac verrouillé à la tentative suivante |

Les PNG sont des captures du viewport. Les TXT contiennent aussi les éléments de liste sous la zone visible. Le message d’annuaire est attesté par l’arbre natif ; le défilement de l’outil était refusé et sa capture sous la zone visible n’a pas été obtenue. Les deux retours de rubrique sont également capturés.

## Candidat préparé pour TestFlight

- IPA : `/Users/okatech/Library/Caches/antsia-native-builds/antsia-0.1.0-ios-build8.ipa`.
- Bundle : `ga.antsia.mobile`, version0.1.0, build8 dans Info.plist et EXConstants.
- Signature App Store ANTSIA existante vérifiée après réextraction par `codesign --verify --deep --strict` ; aucun nouveau certificat/profil créé. Profil App Store existant, équipe5Y39TTNCM7, échéance09/07/2027. Trousseaux temporaires et copiesP12 de cette préparation retirés après signature.
- SHA-256 IPA : `d98f8dff484fc55d2728325435d2138543ad52b7c50b7e5469d1cba480f2f305`.
- SHA-256 JavaScript/Hermes, identique à celui installé dans le simulateur : `f780ec83419fa8436036eaf953c1ed6347a25d1fa5c0bcc0f14d8957d22a4349`.
- Exécutable et dépendances natives repris du7, UUID Mach-O inchangé après re-signature ; symboles7 conservés et toujours correspondants. UIScene, SDK et minimum iOS relus dans le paquet.
- **Non soumis à Apple ; recette clavier non terminée.** Le statut du7 et sa distribution ne sont pas modifiés par cette préparation.

## Préservation et reprise

Aucune publication Web/backend, graine, achat, demande de devis, publication sociale, modification de suivi, déconnexion globale, push ou fusion. Les données métier et les autres travaux sont préservés ; installation par-dessus le même identifiant, sans désinstallation ni effacement du simulateur. Le compte Administration existant a été retrouvé normalement après relance avant les bascules démo de recette.

Dernier état confirmé : **Commerçant / Épicerie Moussavou / champ de recherche contenant « riz »**, laissé prêt pour l’essai du clavier. Le Mac est ensuite devenu verrouillé. L’utilisateur a été sollicité pour le déverrouiller et afficher le clavier logiciel ; aucune tentative de contournement.

À reprendre : constater le clavier logiciel et le champ visible, soumettre par sa touche Rechercher, vérifier les résultats/fermeture, puis restaurer Administration/Mairie/Publications. Si ce scénario échoue, corriger les sources et rebundler/re-signer le candidat avant de le présenter comme accepté. Les demandes d’aide manuelle restent en attente ; le simulateur n’est pas utilisé par un autre chat pendant cette recette.

Contexte figé, sources avant/après et scripts privés de préparation : `.git/codex-snapshots/2026-10-24-ios8-ergonomics/` et cache `ios-ux-build8-20261024/`. Les artefacts7 sont intacts. Le journal des gestes est dans `steps.json`, les contrôles et empreintes dans `checks.json` et `ipa-validation.json`.
