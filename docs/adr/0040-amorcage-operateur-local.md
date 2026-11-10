# ADR-0040 : Amorçage du seul premier administrateur local

- **Statut** : Implémentation locale testée, attribution réelle encore à vérifier. Client sandbox au Niveau1 et testeur connecté autorisés ; extension locale bornée de l’amorçage décidée dans [ADR-0041](0041-catalogue-local-idn-niveau1.md), sans changement des garanties publiques ou de production.
- **Date** : 2026-10-24
- **Portée** : développement local uniquement ; aucun changement des habilitations de production ou de la garantie IDN.

## Contexte

Le raccord SU06 du catalogue requiert un administrateur de plateforme et une vraie identité IDN forte. Le backend local ne contient aucun opérateur ni client IDN. Les API opérateur existantes supposent déjà une première habilitation ; la créer avec une fixture de session ou en contournant la garde n’est pas admissible.

Le propriétaire a désigné le compte humain à utiliser. L’ADR-0011 lui réserve les clients sandbox et la première attribution réelle. L’ADR-0039 admet le niveau1 pour l’entrée de console ; le niveau2 reste exigé par la fédération.

## Dispositif préparé

`modules/platform/localOperatorBootstrap:run` est une mutation **interne**, accessible à la seule administration du backend. Aucune page ni mutation publique ne l’appelle. Elle exige :

1. Les outils de développement activés, le backend HTTP loopback reconnu par la garde commune et un `CONVEX_SITE_URL` HTTP loopback exact ; la confirmation `ANTSIA_INITIAL_OPERATOR_HORS_PRODUCTION`.
2. Un compte BetterAuth unique à l’adresse explicitement choisie, vérifiée ; une personne existante non effacée et une adhésion racine active. Elle ne crée aucun compte, profil ou adhésion.
3. Une vraie preuve de session IDN du candidat, niveau2 au moins par défaut, ou niveau1 sous toutes les bornes locales explicites de l’ADR-0041 ; observée depuis moins de15minutes, lien et preuve d’identité actuels, session BetterAuth vivante du même sujet. Aucun `actingAsIdentity`, aucune nouvelle preuve et aucun niveau fabriqué.
4. L’absence totale d’opérateurs. Seul le singleton correspondant exactement au même administrateur actif autorise un rejeu sans écriture ; rôle différent, opérateur révoqué, autre personne ou doublon sont refusés.
5. Création du rôle et audit `operator.bootstrap` dans la même transaction. Capacité système pour cet amorçage administratif, sujet référencé, motif borné sans adresse ni secret ; aucune copie de données IDN.

Le registre d’audit est étendu d’une seule action. Les gardes ordinaires de console et de fédération restent en place après l’amorçage.

## Limites et activation

Le client IDN sandbox distinct, sa configuration locale et la première habilitation ne sont pas activés par cette décision technique seule. Le titulaire doit réellement se connecter, consentir et achever l’accueil ANTSIA. La garantie demandée par le client ne modifie pas le niveau réel de son compte.

Le propriétaire a explicitement autorisé le client sandbox, les variables locales, le rôle initial après connexion IDN vérifiée, l’antivirus existant et la console temporaire. Les clés signées et l’antivirus locaux sont configurés ; le lien commerçant réel est actif. Le compte du portail a été explicitement confirmé et le nouveau client sandbox créé/configuré. L’entrée ANTSIA demande une réauthentification réelle du titulaire avant l’accueil et l’attribution. Aucun client de production n’est réutilisé ou modifié ; aucun déploiement de code distant n’est nécessaire pour la recette locale.

## Preuves

37 tests de sécurité, audit et cliquets ciblés, puis vérification complète16 869tests/typechecks/lint sortie0. Fonction synchronisée sur le vrai moteur local, refus sans confirmation observé et zéro rôle créé.

[État du paramétrage local](../recette/su06-catalog-reflection-2026-10-24/activation-locale.md).
