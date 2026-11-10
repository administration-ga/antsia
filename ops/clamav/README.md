# Antivirus ANTSIA — exploitation et déploiement

Repris de `socle/ops/clamav/` du dépôt administration.ga au commit vérifié
`4e1b625040c5f962f166ed74a691f5cee0126e27`. Le socle n'a pas été modifié.
Service : `antsia-clamav-rest`. Secret : `antsia-clamav-token`.

## Installation vérifiée le 20 octobre 2026

Après autorisation explicite du propriétaire, le projet dédié
`okatech-antsia-security` a été créé et facturé à l'usage en `europe-west1`.
Le service est prêt sur la révision `antsia-clamav-rest-00001-ws8` ; build
`2b804dad-cdb3-4d19-ab35-af7e377cc78f` réussi, tag
`manual-4cbaad8c7704e42c2b12`.

La production Convex `diligent-avocet-585` y est raccordée. Santé, refus sans
secret, détection réelle EICAR et fichier sain de33MiB ont été vérifiés. Les deux
vidéos initialement retenues ont ensuite été réanalysées par la voie interne
auditée et lues dans Chrome. Le [rapport de livraison](../../docs/30_CORRECTIFS_RELATIONS_ET_MEDIAS_2026-10-20.md)
contient les preuves et les limites de la recette. Aucun secret n'y figure.

La démo Convex `vivid-hedgehog-655` est également raccordée depuis le 20 octobre
2026. Deux envois vidéo par le navigateur ont été analysés sains puis lus
intégralement après rechargement, sans avertissement. Voir la
[recette de la démo](../../docs/31_RECETTE_ANTIVIRUS_DEMO_2026-10-20.md).

Les commandes ci-dessous restent un guide de création/reconstruction : ne pas
recréer les ressources ou le secret sur cette installation existante.

## Contrat et limites

- `POST /scan` : un seul fichier multipart, champ `FILES`, maximum **60 MiB**.
  `Authorization: Bearer …` est obligatoire ; un jeton absent ou invalide donne 401
  avant lecture du fichier. Comparaison de condensats SHA-256 par `timingSafeEqual`.
- Le démarrage refuse un `CLAMAV_TOKEN` absent ou hors contrat (32 à 512 caractères
  alphanumériques, tiret ou soulignement). Le jeton généré ci-dessous est hexadécimal.
- Réponse compatible avec `convex/modules/files/avProviders.ts` : tableau de
  `{Status:"OK"|"FOUND"|"ERROR", Description, FileName}`. Un échec n'est jamais sain.
- `GET /health` est public, sans authentification ; seul `{ok:true|false}` est rendu.
  HTTP 200 exige le `PONG` du vrai daemon ; sinon HTTP 503.
- Aucun fichier n'est écrit sur disque ni journalisé par la façade. Le fichier est
  transmis à clamd par INSTREAM. Le corps multipart est borné à 60 MiB + 1 MiB.
- Délais absolus : réception 15 s, scan 45 s, santé 5 s ; requête Cloud Run 90 s.
  Une seule analyse en vol ; les autres appels authentifiés reçoivent 503.
- Cloud Run : **1 CPU, 4 GiB, concurrence 1, minimum 0, maximum 1 instance**,
  facturation à la requête. Ce sont des limites de ressources, pas un plafond
  monétaire. Les minimum et maximum sont configurés au niveau du service et de
  la révision. Définir les alertes budgétaires avec le propriétaire.

La façade de scan écoute en HTTP/2 clair (`h2c`) sur 8080 ; `--use-http2`
préserve ce protocole depuis le frontal Cloud Run, qui termine TLS. Ce choix
évite la [limite de requête HTTP/1 de 32 MiB](https://docs.cloud.google.com/run/quotas)
et permet la borne applicative de 60 MiB. Voir la [configuration HTTP/2 officielle](https://docs.cloud.google.com/run/docs/configuring/http2).
Les sondes Cloud Run exigent HTTP/1 : une deuxième écoute sur 8081 ne sert que
`GET /health`, et refuse `/scan`. Le [contrat `HTTPGetAction.port`](https://docs.cloud.google.com/run/docs/reference/rest/v2/Container#HTTPGetAction)
permet de choisir ce port distinct du port d'entrée 8080. `/health` reste aussi
disponible sur l'entrée h2c. La publication ne déclare qu'un port d'entrée.

Le conteneur conserve le vrai `clamd` et `freshclam` de `clamav/clamav:1.4`.
Le rechargement concurrent des bases est désactivé pour réduire le pic mémoire ;
les dépassements de limites ClamAV sont signalés plutôt que considérés sains.
La façade écoute immédiatement, mais la sonde de démarrage attend `/health`.
Le chargement des signatures à froid peut dépasser le délai du client Convex et,
dans le pire cas, les 240 s de la sonde. Le fichier reste alors retenu et sera
retenté par le moteur. Avec le minimum à zéro, aucun état chaud n'est garanti.
`freshclam` est configuré pour douze contrôles quotidiens lorsqu'il dispose de CPU ;
avec la facturation à la requête il n'exécute pas un travail continu pendant l'inactivité.

La [documentation Docker officielle](https://docs.clamav.net/manual/Installing/Docker.html)
recommande 4 GiB, avec un minimum de 3 GiB : les signatures et leur mise à jour
peuvent dépasser 2 GiB. Le [script officiel de l'image 1.4](https://github.com/Cisco-Talos/clamav-docker/blob/main/clamav/1.4/alpine/scripts/docker-entrypoint.sh#L18-L24)
traduit bien `CLAMD_CONF_*` en directives de `clamd.conf` ; aucune variable d'une
image tierce n'est supposée ici.

ClamAV 1.4 est une version LTS, dont la fin de maintenance des correctifs est
prévue le **15 août 2027** selon la [politique EOL officielle](https://docs.clamav.net/faq/faq-eol.html).
Le tag `1.4` suit les correctifs de cette branche et inclut les signatures.
Il est mobile : le tag de contenu ci-dessous identifie nos sources, sans
promettre une reconstruction identique de l'image amont. Prévoir sa mise à jour
et la migration avant cette fin de maintenance.

## Vérification locale sans installer ClamAV

Depuis la racine ANTSIA, Node 22 ou supérieur :

```bash
node --test ops/clamav/server.test.mjs
node --check ops/clamav/server.mjs
sh -n ops/clamav/entrypoint.sh
node ops/clamav/source-tag.mjs
```

Les tests utilisent la vraie façade HTTP/1 et h2c, et un daemon TCP INSTREAM **synthétique**
sur loopback. Ils vérifient authentification, disponibilité, octets binaires,
limites, erreurs, concurrence et délais. Ils ne prouvent ni la détection du vrai
moteur, ni le démarrage du conteneur, ni ses besoins mémoire réels.

## Publication — seulement après décision du propriétaire

Le propriétaire choisit **un projet GCP ANTSIA explicite**, sa facturation et sa
région. Ne pas réutiliser un projet métier voisin par défaut. Aucun projet n'est
choisi implicitement par les commandes ci-dessous. Les étapes suivantes créent des ressources
facturables et ne doivent pas être lancées avant cette décision.

Depuis la racine ANTSIA, renseigner les valeurs publiques approuvées :

```bash
export ANTSIA_GCP_PROJECT='<projet ANTSIA approuvé>'
export ANTSIA_GCP_REGION='europe-west1'
export ANTSIA_CLAMAV_RUNTIME="antsia-clamav-runtime@${ANTSIA_GCP_PROJECT}.iam.gserviceaccount.com"
gcloud billing projects describe "$ANTSIA_GCP_PROJECT"
```

Arrêter si la facturation est désactivée ou si le projet n'est pas celui décidé.
Le compte de publication doit pouvoir gérer Cloud Build, Cloud Run, Artifact
Registry, les API et le compte de service. Le principal de build réellement
configuré doit pouvoir écrire dans le registre, déployer Cloud Run et utiliser
le compte runtime (`iam.serviceAccounts.actAs`) ; ne pas supposer son identité.

Création initiale, après vérification de l'absence des ressources homonymes :

```bash
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com --project="$ANTSIA_GCP_PROJECT"
gcloud artifacts repositories create antsia-services --repository-format=docker --location="$ANTSIA_GCP_REGION" --project="$ANTSIA_GCP_PROJECT"
gcloud iam service-accounts create antsia-clamav-runtime --project="$ANTSIA_GCP_PROJECT"
gcloud secrets create antsia-clamav-token --replication-policy=user-managed --locations="$ANTSIA_GCP_REGION" --project="$ANTSIA_GCP_PROJECT"
```

Créer la première version du jeton par flux direct, sans affichage, fichier,
argument de processus ni presse-papiers contenant sa valeur. Désactiver toute
trace shell (`set +x`) avant ce geste ; ne jamais imprimer ou archiver sa sortie.

```bash
set -o pipefail
node --input-type=module -e 'import {randomBytes} from "node:crypto"; process.stdout.write(randomBytes(32).toString("hex"))' | gcloud secrets versions add antsia-clamav-token --project="$ANTSIA_GCP_PROJECT" --data-file=-
gcloud secrets add-iam-policy-binding antsia-clamav-token --project="$ANTSIA_GCP_PROJECT" --member="serviceAccount:${ANTSIA_CLAMAV_RUNTIME}" --role=roles/secretmanager.secretAccessor
```

Ne pas rejouer la création du secret sur une installation existante. Une rotation
doit être coordonnée avec le moteur ; la révision Cloud Run lit la version du
secret au démarrage. Aucun secret ne doit entrer dans le contexte Cloud Build.

Publier le contexte **limité à ce dossier**, avec tag de contenu déterministe :

```bash
cd ops/clamav
export ANTSIA_CLAMAV_TAG="$(node source-tag.mjs)"
gcloud builds submit . --project="$ANTSIA_GCP_PROJECT" --region="$ANTSIA_GCP_REGION" --config=cloudbuild.yaml --ignore-file=.gcloudignore --substitutions="_APPROVED_PROJECT=${ANTSIA_GCP_PROJECT},_REGION=${ANTSIA_GCP_REGION},_RUNTIME_SERVICE_ACCOUNT=${ANTSIA_CLAMAV_RUNTIME},_IMAGE_TAG=${ANTSIA_CLAMAV_TAG}"
```

Le gabarit refuse le projet implicite ou le tag manquant ; il n'utilise pas
`SHORT_SHA`, vide lors d'un build manuel. Il rend l'URL Cloud Run invocable
extérieurement, car Convex ne présente pas d'identité IAM Google. La protection
du scan est le Bearer applicatif ; le port clamd 3310 n'est pas publié.
Si la politique d'organisation interdit cette invocation externe, arrêter et
faire décider le raccordement ; ne pas supprimer l'authentification de la façade.

## Recette et raccordement après publication autorisée

```bash
gcloud run services describe antsia-clamav-rest --project="$ANTSIA_GCP_PROJECT" --region="$ANTSIA_GCP_REGION" --format='value(status.url)'
gcloud run services describe antsia-clamav-rest --project="$ANTSIA_GCP_PROJECT" --region="$ANTSIA_GCP_REGION" --format='value(status.latestReadyRevisionName)'
```

Vérifier la révision prête, le tag/digest déployé, `/health` 200, et `/scan` 401
sans Bearer. Puis effectuer une recette autorisée avec un petit fichier synthétique
sain et le fichier de test standard EICAR, jamais un fichier de personne. Attendre
respectivement `OK` et `FOUND` du **vrai moteur**. Ne rien relâcher si la santé,
la détection EICAR ou les ressources de la révision ne sont pas prouvées.
Vérifier aussi qu'un fichier synthétique sain de plus de 32 MiB traverse
effectivement Cloud Run jusqu'au verdict : les tests locaux h2c ne prouvent pas
le protocole configuré du service publié.

Après accord sur la configuration du backend ANTSIA visé, renseigner :

| Nom | Valeur |
|---|---|
| `FILE_SCAN_PROVIDER` | `clamav-rest` |
| `FILE_SCAN_CLAMAV_URL` | URL constatée du service + `/scan` |
| `FILE_SCAN_CLAMAV_TOKEN` | même secret, transmis directement entre processus autorisés |
| `FILE_SCAN_TIMEOUT_MS` | `60000` ; mesurer le démarrage à froid |
| `FILE_SCAN_MAX_BYTES` | `62914560` au maximum |

Ne modifier aucun `.env*`. Aucun changement du schéma ou du code applicatif n'est
nécessaire pour le contrat existant. La délivrance reste fermée tant que le scan
réel n'a pas donné de verdict autorisé ; contrôler ensuite un média synthétique
depuis son admission jusqu'à sa délivrance.
