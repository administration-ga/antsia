# ADR-0041 : Raccord catalogue local avec une vraie session IDN de Niveau1

- **Statut** : Autorisé explicitement par le propriétaire le25/10/2026 ;277cas ciblés et première chaîne complète16 976tests/typages/lint sortie0, puis4tests de route accueil. Relances complètes après correction perturbées par mises en veille du Mac ; dernière chaîne ininterrompue à reprendre. Opt-in configuré, vraie preuveIDN1 reçue ; nom/identifiant d’accueil encore attendus avant attribution et réception catalogue.
- **Portée** : moteur de développement local et seul catalogue public V2 PRO.GA. Aucun changement de production ou de la garantie d’identité.

## Décision

Le propriétaire demande d’autoriser le compte actuellement connecté sur le client IDN sandbox et de poursuivre SU06 au Niveau1. Le compte a été ajouté comme testeur du seul client local. L’entrée de console admet déjà le Niveau1 (ADR-0039) ; l’exception ci-dessous permet son emploi pour le raccord catalogue local sans fabriquer une preuve de Niveau2.

`localCommerceLoa1Allowed` est fermé par défaut. Il exige simultanément :

- `ANTSIA_LOCAL_COMMERCE_LOA1=true` et les outils de développement ouverts sur le backend HTTP loopback ;
- environnements commerce et fédération explicitement `sandbox`, source `antsia-local` ;
- origines système site, ANTSIA et PRO.GA HTTP loopback exactes, sans chemins, identifiants ou paramètres ;
- client IDN sandbox dédié.

La première attribution conserve le compte unique vérifié, la personne existante, l’adhésion racine active, la vraie session IDN scellée et vivante, sa preuve actuelle de moins de15minutes, la confirmation interne et l’audit atomique. Son seuil est1 uniquement sous toutes ces bornes,2 ailleurs. Aucune preuve, personne ou adhésion n’est créée par l’amorçage.

## Administration bornée

La garde générique `requireFederationAdmin` reste inchangée. Une garde dédiée au catalogue admet un administrateur de Niveau1 seulement sous l’exception locale, avec preuve de session corrélée et vivante et réseau racine actif.

- Politiques et fenêtre des mappings catalogue : garde dédiée.
- Émetteur : uniquement `pro-ga`, `sandbox`, contrat unique `PRO-COMMERCE-PUBLIC-V2` et référence `ANTSIA_FEDERATION_PRO_GA_LOCAL_SU06_KEY` ; aucun remplacement d’un émetteur existant portant d’autres contrats.
- Mapping : même émetteur borné ; liaison commerciale, environnement, génération, droits et audit ordinaires conservés.
- Paiements, emplois, attestations, rejeu générique et autres émetteurs conservent les gardes antérieures.

Le badge Vérifié et les garanties publiques restent au Niveau2. Désactiver le drapeau ou sortir d’une seule borne referme immédiatement l’exception pour les opérations catalogue de Niveau1.

## Vérification et activation

Les tests du helper et de l’amorçage couvrent chaque borne, les sessions/preuves/liens révoqués, l’absence de véritable IDN, l’unicité et l’audit atomique. Les scénarios catalogue couvrent le périmètre V2 autorisé, les environnements distants/production, les autres contrats, les réglages de paiement et l’absence de badge Vérifié. La recette exige ensuite le vrai callback humain, la décision initiale, les opérations console auditables, puis les consentements, reçus `applied` et médias réellement analysés.

Configuration runtime locale seulement, aucun `.env*` édité ; aucune publication distante. Preuves : `.git/codex-snapshots/2026-10-25-su06-level1/`.
