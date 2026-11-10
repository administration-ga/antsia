# Antivirus et publication vidéo sur la démo — 20 octobre 2026

## Résultat vérifié

La démo https://antsia-demo.vercel.app est raccordée au vrai service antivirus
ANTSIA. Deux envois vidéo distincts ont été publiés par le parcours normal du
navigateur, analysés par ClamAV puis lus jusqu'au bout après un rechargement
complet. Aucun avertissement ou erreur console observé pendant cette recette.

## Configuration appliquée

- Cible exacte : `vivid-hedgehog-655` ; aucun paramètre de production modifié.
- Fournisseur : `clamav-rest`, service existant du projet dédié
  `okatech-antsia-security`, région `europe-west1`.
- Endpoint : `https://antsia-clamav-rest-4ax5cbw34q-ew.a.run.app/scan`.
- Délai : `60000` ms ; plafond : `62914560` octets.
- Secret transféré de Secret Manager au backend par mémoire/stdin, sans
  affichage, argument de processus, fichier ou presse-papiers.
- Les cinq paramètres ont été relus et comparés en mémoire. Le coupe-circuit
  n'est pas désactivé ; aucun mock ou assouplissement de la garde de délivrance.

Version publique constatée avant et après : `demo-animation-20261020-public`,
santé HTTP 200. Aucun changement de code, schéma, index ou cron, ni nouveau
déploiement frontend/backend dans cette opération. Les contenus animés et travaux
parallèles sont conservés.

## Recette réelle dans Chrome

Session démo existante `@membre.demo`, sur `/fil`. Deux publications explicitement
nommées « Recette antivirus ANTSIA — vidéo de test 1/2 » et « 2/2 » ; audience
« Mes connexions », visibilité `network`, aucune diffusion publique supplémentaire.

Les deux envois utilisent la même vidéo technique synthétique : MP4 H.264,
320 × 180 pixels, une seconde, 1939 octets. Elle ne contient aucune donnée
personnelle. Empreinte SHA-256 :
`df2e221386f582dd9adeb35973643cf8189137223f320f26250508ffae77293e`.
Chaque passage par le sélecteur et le bouton Publier a créé un stockage et une
analyse indépendants ; aucune insertion directe de publication ou verdict.

| Envoi | Publication | Analyse | Verdict réel | Durée AV |
|---|---|---|---|---|
| 1/2 | `k57xq7jw7xq7mmaj5eqa49c5y58gny6j` | `sx73z5zhyyqv7tgzn8p0be6jg98gn20j` | clean / OK / clamav-rest | 251 ms |
| 2/2 | `k57vdnszb3hx5ez4b8vvxapzc18gnwsz` | `sx75th1jnmqbdwkmr15xymgm618gngqw` | clean / OK / clamav-rest | 138 ms |

Une tentative par analyse ; empreintes des deux fichiers stockés identiques au
fichier local ; aucune libération manuelle. Après rechargement complet du fil,
les deux lecteurs ont une source, décodent 320 × 180, atteignent `currentTime=1`
pour `duration=1`, `ended=true`, `readyState=4` et `error=null`.
Les messages de blocage et d'indisponibilité sont absents. Console : zéro
avertissement et zéro erreur depuis le début de la publication jusqu'à la fin
des lectures. Les publications de recette étaient présentes à la fin de la vérification ; elles ont ensuite été retirées sur demande du propriétaire, comme décrit ci-dessous.

## Preuves et portée

Dossier `docs/recette/antivirus-demo-2026-10-20/` : configuration expurgée,
fixture et empreinte, publications et analyses, santé du frontend, métadonnées
et console navigateur, capture `videos-publiees.png`. Aucune URL de stockage ni
valeur de secret archivée.

Cette recette vérifie le parcours normal de publication et de lecture de deux
envois synthétiques sur le navigateur de bureau. La recette réelle du moteur
sain/EICAR/33 MiB et les limites du service partagé figurent dans
[le rapport de production](30_CORRECTIFS_RELATIONS_ET_MEDIAS_2026-10-20.md).
Les tests de code ne sont pas rejoués pour cette modification de configuration ;
aucun nouveau build ou verify global n'est revendiqué.

## Retrait ciblé demandé après recette

Le 20 octobre à23h24, les deux publications de test ont été retirées par leur
menu normal « Retirer ma publication » dans la démo. Leurs identifiants exacts
sont ceux du tableau ci-dessus ; les deux lignes sont en état `removed`, avec
horodatage de retrait. Il s'agit du retrait normal du réseau, sans purge des
blobs ou effacement définitif des lignes.

Le nombre de publications actives passe de23 à21. Les empreintes de la totalité
des21autres publications sont identiques avant/après ; aucun autre contenu
n'a été modifié par cette opération. Après rechargement du fil, les deux textes
de recette sont absents et les contenus animés sont toujours affichés.

Le fournisseur ClamAV, l'endpoint, le délai et le plafond sont relus conformes,
le secret est toujours configuré et les analyses restent actives. Aucune écriture
de configuration ni publication de code pendant le retrait.
Preuves : `removal-before.json`, `removal-after.json`,
`removal-antivirus-preserved.json`, `removal-browser.json` et
`fil-apres-retrait.png` dans le même dossier de recette.
