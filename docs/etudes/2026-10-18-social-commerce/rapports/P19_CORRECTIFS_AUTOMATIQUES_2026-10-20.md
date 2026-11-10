# P19 — Correctifs automatiques du 20 octobre 2026

**Correctifs et suite DP-39 raccordés en source, aucune vérification exécutée.** La demande autorise les
correctifs et leurs suites sans nouvel accord ; les vérifications restent différées et le
travail de l'autre session est préservé. Le [journal de réservation](../EXECUTION.md) désigne
les fichiers de cette tranche. Repères Git relus : ANTSIA `c4d36f3`, PRO.GA `fa349ea` ; aucun
gel ni inventaire de contenu prouvé. Le [bilan précédent](P19_REPRISE_2026-10-20.md) est conservé
comme historique documentaire, puis complété ici par les modifications applicatives.

## Tri des correctifs historiques

| Point | Lecture courante des sources | Traitement de cette tranche |
|---|---|---|
| K-06 / DP-34 | Les transports CRM et candidatures utilisent `row.authorizedAt`, sans fabriquer une authentification récente | Déjà présent ; aucune nouvelle vérification ni modification de session |
| K-21 | L'index ADR contient les décisions manquantes du relevé historique | Déjà présent ; ne pas redoubler les entrées |
| AC04 | La carte publique distingue portrait personne et portrait page | Déjà présent ; aucune modification de thème |
| K-13 | L'horloge de préparation conserve échéances bornées, nettoyage et reprise focus/visibilité | Source relue ; aucun test d'horloge exécuté |
| K-12 / AC03 | Achat détaillé, liste et fiche individuelle de candidature raccordés à une région d'annonce stable | Corrigé en source ; scénarios écrits, non exécutés |
| K-16 / AC08 | La description générale de l'API machine distingue désormais routes commerce inscrites et fondation générique non inscrite | Documentation corrigée en source ; validation OpenAPI et HTTP non exécutées |
| CV après interruption | Réservation durable avant stockage, marqueur exact et récupération ciblée raccordés dans PRO.GA | Corrigé en source ; MIME/backend et scénarios non éprouvés ; admission CV fermée |

Les erreurs/types générés et suites historiques (dont K-02/K-08 et la tranche DIASPORALE)
restent des éléments à reprendre au futur créneau de vérification. Aucun nombre d'erreurs ou
de tests historiques n'est présenté comme courant.

## K-12 / AC03 — changements d'état accessibles

`PurchaseCard` conserve une région polie unique dans le suivi détaillé. Elle annonce les états
de commande, paiement, stock, remboursement, remise, réception, reversement, annulation/retour,
actions et le passage à suivi périmé. La liste compacte reste muette. Une attestation de réception
ne devient pas une preuve de reversement ; aucun nom de vendeur, montant ou message privé n'est
ajouté aux annonces.

Les deux surfaces de candidature, liste et fiche individuelle ouverte depuis un avis, réutilisent
la même projection d'annonce. État autorisé, refus et suivi du retrait distant sont distingués ;
la liste annonce aussi les états de transfert des pièces par genre, sans nom de fichier. Une
évolution de `remoteUnconfirmed` ne fabrique aucun certificat de suppression chez l'employeur.

Le hook commun compare uniquement les faits métier du même dossier observé. Premier snapshot,
remontage, nouvelle page/dossier et retour d'une projection retirée restent silencieux ; un poll
identique ou une variation de date, révision, historique, nom ou langue ne rejoue pas l'annonce.
Les régions utilisent `role="status"`, `aria-live="polite"`, `aria-atomic="true"` ; les textes
FR/EN vivent dans les locales existantes. Les lectures, gestes et gardes de session sont préservés.

Sources :

- `apps/antsia_ga/src/components/purchases/purchase-card.tsx` ;
- `apps/antsia_ga/src/components/jobs/{my-applications-screen,my-application-screen}.tsx` ;
- `apps/antsia_ga/src/components/jobs/job-application-announcement.ts` ;
- `apps/antsia_ga/src/lib/use-business-announcement.ts` ;
- locales existantes FR/EN `purchases.json` et `jobs.json`.

Scénarios nouveaux, **non exécutés** : `use-business-announcement.test.tsx`,
`purchase-card.announce.test.tsx`, `my-applications-screen.announce.test.tsx`. Ils couvrent les
montages silencieux, transitions, polls identiques, dossiers/projections, pagination, refus,
réception distincte du reversement et pièces réordonnées. Le résultat vocal réel avec un lecteur
d'écran et l'absence de régression restent à éprouver ; aucune conformité AA n'est annoncée.

## K-16 / AC08 — API machine décrite selon le routeur

La spécification `PRO_GA/docs/api/openapi.yaml` décrit les portes commerce réellement inscrites
dans `convex/http.ts`. Les anciens chemins génériques `/internal/federation/v1/*`, toujours
non inscrits, sont conservés hors de `paths`. Les profils HMAC historiques, COMMAND, contrôles
privés, PUBLIC sortant et callback fournisseur sont distingués : horodatage, nonce, clé,
scopes et reçus n'ont plus une description uniforme trompeuse.

Les corps métier complets restent normatifs dans les parseurs TypeScript cités ; aucune union
fermée n'est remplacée par un schéma permissif. Le document ne constitue pas une preuve de
conformité OpenAPI, de signature, de disponibilité déployée ou d'activation. Détail :
[rapport K-16](P19_K16_API_MACHINE_2026-10-20.md). Aucune route ou configuration n'a été créée.

## CV — réservation durable et récupération après interruption

La copie commence désormais par une réservation privée durable : tentative UUID, pièce et
candidature, tenant/structure, empreinte/taille, révision de pièce et bail technique de cinq
minutes. Le stockage conserve les octets PDF et utilise un MIME portant ce marqueur opaque.
Le rattachement exige cette réservation, son bail vivant, la même pièce/candidature encore
admise et des métadonnées corrélées. Il ne peut pas transformer un fichier étranger en pièce.

La reprise existante traite une page de vingt métadonnées puis vingt purges dues au plus,
sans nouveau cron. Le scan ne retient que les marqueurs exacts de tentatives connues, avec
empreinte, taille et date de création cohérentes. Une observation pendant le bail est pointée
durablement pour être réexaminée ; une tentative expirée, retirée ou tardive ne sert qu'à
supprimer sa copie, jamais à la rattacher automatiquement.

La suppression distingue absence constatée, protection, attente et cible prouvée. Une copie
canonique encore admise reste protégée ; un blob existant dont l'appartenance n'est pas prouvée
reste en échec sans suppression. Une erreur de suppression garde sa référence. Les tombes ne
disparaissent pas après un simple délai : les fenêtres bornées sont reparcourues depuis la
première réservation afin de retrouver un stockage tardif. Le coût total croît avec le stock ;
aucun délai de récupération ou budget de charge n'est mesuré ici.

Le reçu `already_stored` relit désormais la présence, la taille, l'empreinte et le MIME exact
de la copie canonique. Une ligne « stockée » sans blob valable est refusée, sans réparation
automatique. La délivrance recruteur garde ses relectures de session/droits avant et après
chargement ; seuls le PDF historique exact ou le marqueur du stage canonique sont acceptés.

Sources PRO.GA : `commerceApplicationFiles.ts`, `commerceApplications.ts`,
`commerceJobTables.ts`, nouveau `commerceApplicationUploadStages.ts`, sous
`convex/modules/integrations/`. Les deux tables nouvelles sont exportées par l'agrégat existant ;
aucune modification du schéma racine ou de cadence n'est nécessaire. Leur inventaire est ajouté
à `docs/30_P16_REPRISE_2026-10-20.md`. Scénarios ciblés écrits dans
`commerceApplicationUploadStages.test.ts`, **sans exécution** : crash, bail, stockage tardif,
pagination, retrait, marqueur étranger, empreinte/taille divergentes, doublon, fermeture,
suppression défaillante, lecture et reçu de copie existante.

Appui documentaire : Convex expose les [métadonnées du stockage](https://docs.convex.dev/file-storage/file-metadata)
et réserve le [stockage direct aux actions](https://docs.convex.dev/api/interfaces/server.StorageActionWriter).
La persistance exacte du MIME sur le backend réel reste à prouver ; le harnais local ne le
reproduit pas et les fixtures l'indiquent. Les anciens blobs non marqués restent hors preuve
de récupération. `applicationFiles=false` est préservé, aucune purge réelle n'a été exécutée.
Conservation des traces minimales et export/effacement général PRO.GA restent ouverts.

## Suite automatique — DP-39

La tranche suivante raccorde le [signal privé de relecture des services](P19_AVIS_SERVICES_2026-10-20.md),
sans état métier ni authentification fabriquée. Elle exige un profil/destination privés
explicitement configurés ; aucune configuration n'est réalisée dans cette reprise.

Cette suite est raccordée dans les deux produits : producteurs métier, outbox/dispatch privés,
admission fédérée corrélée et avis neutre non lu. Les scénarios contractuels et d'intégration
sont écrits seulement. Les preuves et limites exactes restent dans le rapport dédié ; le signal
ne donne aucune fraîcheur nouvelle au snapshot et ne garantit pas une réception sur appareil.

## Ce qui reste ouvert après ces correctifs

- Génération officielle, typages, tests, lint, build et recettes : différés par demande ;
  aucun résultat ancien n'est transféré aux sources de cette tranche.
- Persistance réelle du marqueur CV, reprise sous charge et suppression observée ; anciens
  blobs non marqués hors preuve. Aucun nouveau CV admis.
- Configuration des nouveaux avis privés et recette croisée ; continuité hors liaison/source/
  mandat actifs, rattrapage après configuration tardive et échéance de devis sans écrivain non
  ajoutés. Le suivi authentifié manuel reste disponible selon ses droits.
- Conservation et export/effacement général PRO.GA, décisions métier et financières, voie des
  membres suspendus, fournisseurs/identités et preuves physiques natives : non inventés.
- Périmètres DIASPORALE réservés à leur session ; aucune reprise de ses anciens échecs.

Les réservations de cette tranche sont libérées. Le dossier pilote est actualisé par addenda,
avec ses historiques conservés ; aucune candidate n'est déclarée testée, admise ou publiable.

## Preuves et limites

Aucun test, codegen, typage, lint, build, audit automatisé, recette HTTP/Convex/navigateur,
serveur, installation, modification d'environnement, action sur données ou fournisseur,
commit, publication ou activation. Les scénarios ajoutés restent écrits et non exécutés.
Les registres P16 restent fermés ; aucune décision financière, durée légale de conservation,
identité d'appareil ou preuve physique n'est inventée. P19 demeure ouvert au-delà de ces sources.
