# Icône iOS réelle et build 13 — 2 novembre 2026

**Le logo ANTSIA s'affiche dans la liste des apps d'App Store Connect**, relu à l'écran le 2/11 vers 17 h 36 : « iOS 0.1.0 À finaliser avant soumission ». Rien n'est soumis à la vérification de l'App Store.

## Cause

`app.config.ts` ne déclarait aucune `icon`. Expo garde alors le PNG blanc de son gabarit : `Assets.car` de l'IPA 12 porte une image en niveaux de gris, de 2 Ko, et `AppIcon60x60@2x.png` y est blanc à 100 % (120×120, moyenne 255, écart-type 0). Le défaut est donc dans le binaire : les builds 2 à 12 ont aussi l'icône blanche sur le téléphone. Ce n'est ni un rendu d'Apple, ni un format `.icon`.

## Correctif

- `assets/app-icon.png` : le monogramme du favicon publié (`apps/antsia_ga/src/app/favicon.ico`), en 1024 px, opaque, marque centrée et réduite à 86 % pour le masque iOS. Aucun nouveau dessin : l'A en Arial Bold reproduit le favicon à 3,2/255 d'écart moyen une fois réduit à 64 px. Régénérable par `scripts/build-app-icon.py`.
- `app.config.ts` déclare `icon`, y compris pour le prochain build Android. `build-config.test.ts` refuse une absence ou une image unie ; `prepare-build.mjs` emporte le fichier.

## Build 13

Assemblé comme les builds 10 à 12 : l'IPA 12 publié, avec le catalogue compilé par `actool` depuis l'appiconset qu'Expo génère (`Contents.json` identique), puis signé avec l'identité et le profil existants, relus chez EAS. Sur 111 fichiers, 7 changent : `Assets.car`, les deux PNG d'icône, `Info.plist` et `EXConstants.bundle/app.config` (numéro 13), la signature et l'exécutable qui la porte (même UUID). JavaScript identique (`469281fe…`). Détail : `assemblage-ipa13.json`.

| Étape | Constat |
| --- | --- |
| `expo prebuild` depuis cette branche | appiconset identique pixel à pixel à `assets/app-icon.png` |
| `altool --validate-app` | `VERIFY SUCCEEDED` |
| Envoi | EAS Submit `b05abe52…` resté `IN_QUEUE` 28 minutes, annulé ; envoi direct par `altool`, livraison `3a098fd9-8933-494c-b170-42bedfb09a8d` |
| Traitement Apple | `VALID` en 2 minutes ; `iconAssetToken` : écart-type 73, écart moyen au logo < 1/255 (`icone-renvoyee-par-apple-build13.png`) |
| Version App Store | `versionString` 1.0 → 0.1.0, build 13 rattaché, `PREPARE_FOR_SUBMISSION` |
| TestFlight | notes FR/EN, ajout au groupe « ANTSIA — Bêta publique », vérification bêta `APPROVED` ; groupe : 13 / 12 / 11 / 10 / 9 / 8 / 7 / 6 / 4 |

## Vérification du code

Sur cette branche : moteur 3243 tests, cliquets 150, scripts 92 ; `antsia-mobile` : typage, 173 tests, lint sans erreur (37 avertissements). `bun run verify` s'arrête au typage de `diasporale-com` : `fileScanUnavailable` manque au type de DIASPORALE `fab55ef`, dépôt que ce correctif ne touche pas. Les tests et le lint des autres espaces n'ont donc pas tourné.

## Non vérifié et restes

- Aucun essai sur iPhone physique : l'icône est contrôlée dans le paquet et chez Apple, pas sur un écran d'accueil.
- `main` reste au numéro source 8 : les sources des builds 9 à 12 ne sont pas fusionnées. Le prochain build doit porter 14.
