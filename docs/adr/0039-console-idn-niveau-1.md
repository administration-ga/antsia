# ADR-0039 : La console d'exploitation admet une connexion IDN de niveau 1

- **Statut** : Accepté par le propriétaire le 2026-10-22 (choix « Abaisser au niveau 1 » pour la console).
- **Date** : 2026-10-22
- **Remplace** : la garantie IDN de niveau 2 exigée par l'ADR-0011 (§ 1) pour la console. Le reste de
  l'ADR-0011 demeure.

## Contexte

L'ADR-0011 réserve la console aux sessions IDN de niveau 2 au moins. Le 22/10/2026, la console a été
republiée avec les délais légaux de SU01d. Le premier opérateur a été posé à la demande du
propriétaire, qui a jugé que l'accès à ANTSIA ne doit pas dépendre d'un niveau IDN. Avec un compte IDN
de niveau 1, la console refusait son entrée malgré l'habilitation.

Deux faits techniques cadrent la décision :
- IDN renvoie le niveau du compte de la personne (`loa`, porté à 2 quand un contrôleur valide son
  dossier d'identité), sans plafond propre au client OIDC ;
- le retour OAuth est central (`SITE_URL/api/auth/oauth2/callback/idn`) pour antsia.ga comme pour la
  console : aucune adresse propre à la console n'est à déclarer chez IDN.

## Décision

Nous admettons dans la console toute session IDN de niveau 1 ou plus (`CONSOLE_MIN_LOA = 1`,
`@antsia/social-domain/badges`). Toutes les autres gardes restent exigées :
- une session Better Auth scellée par le callback IDN, propre à cette session et non transmissible ;
- un lien IDN vivant du même sujet et une preuve IDN portant un niveau ; sans niveau, l'accès reste fermé ;
- une habilitation d'opérateur vivante, l'accès journalisé avant toute lecture, et la fraîcheur de la session ;
- la fermeture par suspension ou départ de la racine.

Un OTP, ou un ancien lien IDN sans session scellée, demeure insuffisant. Le badge Vérifié, l'identité
forte et les agents publics gardent le niveau 2 (`VERIFIED_MIN_LOA`).

## Conséquences

### Positives

- Le propriétaire et les opérateurs entrent dans la console sans attendre la validation IDN de leur
  dossier d'identité.
- Le seuil est une constante unique du domaine ; les textes de la console l'affichent par interpolation.

### Négatives

- Un compte IDN non vérifié par un contrôleur peut administrer la plateforme s'il est habilité : la
  garantie repose désormais sur l'habilitation posée par le propriétaire plus que sur l'identité.
- Toute habilitation d'opérateur doit donc être accordée avec plus de prudence qu'avant.

### Neutres

- La première habilitation reste posée par le propriétaire (ADR-0011) ; le code n'en crée toujours aucune.

## Alternatives considérées

### Garder le niveau 2

La console resterait fermée tant que le dossier IDN du propriétaire n'est pas validé par un
contrôleur. Écartée par le propriétaire le 22/10/2026.

### Exempter le seul propriétaire

Une exception nominative compliquerait les gardes et créerait deux régimes d'accès sans gain de
sécurité réel. Non retenue.

## Références

- [ADR-0011](0011-console-idn-et-archivage-a-deux-personnes.md).
- `convex/lib/operatorIdentity.ts`, `packages/social-domain/src/badges.ts`.
- Registre de publication du 22/10/2026 : [docs/35](../35_PUBLICATION_DONNEES_DEMO_2026-10-22.md).
