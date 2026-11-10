# ADR-0031 — Retour Identité.ga natif lié à PKCE

- Date :21 octobre2026.
- Statut :implémenté dans les sources ; configuration de production, signature et recette téléphone ouvertes.

## Décision

Conserver Better Auth comme émetteur unique et le callback HTTPS IDN existant. L'application native utilise le navigateur système et une tentative nonce/verifier S256 en mémoire. Les données supplémentaires vivent dans l'état OAuth vérifié de Better Auth, pas dans une session de navigateur copiée.

Le callback de réussite délivre un code natif distinct lié au challenge, valable90secondes, enregistré sous empreinte SHA256 dans les vérifications d'authentification existantes. L'échange POST consomme le code, prouve le verifier, puis relit la session vivante, son sujet et son échéance. Seul le header bearer signé est conservé dans SecureStore ; une lecture fraîche corrélée précède l'accès privé.

Le schéma exact est une configuration propriétaire `NATIVE_AUTH_REDIRECT_URI`, fermée si absente/invalide. Les origines de confiance Web ne sont pas élargies. Le retour natif ne reçoit pas l'OTT crossDomain et ne transporte ni cookie ni bearer. La tentative est annulée par sortie/démontage ; aucune récupération à froid sans verifier. Aucun profil, adhésion ou consentement créé par l'échange.

## Vérifications et limites

Tests avec vrai gestionnaire Better Auth et fournisseur simulé : usage unique même concurrent, mauvais verifier, expiration, révocation, identité divergente, maintien du flux Web. Orchestration native testée avec vrai client/coffre et transports simulés ; aucune preuve physique ou fournisseur réel revendiquée. Rapport :`../recette/idn-natif-builds-2026-10-21/README.md`.

## Références

- [ADR-0002](0002-identite-idn-unique-comptes-legers-badges-calcules.md).
- Sources Better Auth1.6.25 installées :state OAuth, oneTimeToken et bearer ; aucune nouvelle table sociale.
- [Expo : authentification](https://docs.expo.dev/guides/authentication/).
