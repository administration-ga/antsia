# MP06 — Services : états et contrats

## Consultation du prestataire

La même activité publie sa page sociale et une présentation spécialisée : Présentation, Prestations, Réalisations, Disponibilités, Avis et À propos. Les routes membre `/prestataire/[handle]` et publiques `/prestataires/[handle]` relisent les gardes du catalogue ; elles ne créent aucun droit marchand. Le retrait de la capacité locale `services` ferme aussi les offres de service. Les anciennes adresses boutique restent disponibles.

PUBLIC-V2 peut porter un `serviceProfile` publié et figé : modalités explicitement déclarées (devis, rendez-vous, forfait), langues, localités GA, livrables, inclusions, exclusions et réalisations. Les indices des médias désignent le manifeste de la même version publiée. Un brouillon PRO et une modification de ses médias ne changent pas silencieusement cette version. Le profil est borné à16KiB ; aucun champ client nominatif ou calendrier privé n'est ajouté. Le texte libre n'offre pas une garantie sémantique d'absence de données personnelles.

La recherche applique catégories, modalités, langue, localité et durée avant pagination ; OU dans un filtre, ET entre filtres. Les données anciennes sans qualification ne sont pas déduites de leur prix. Les index de découverte et de catalogue local passent à la version2, avec reconstruction CAS et indication explicite d'index en préparation. Un annuaire de consultation n'ouvre aucune demande P14.

Les disponibilités sont annoncées « sur demande » tant qu'aucun agenda public admissible n'est publié. Les avis publics sont un complément P1 : leur état d'attente ne fabrique ni note ni historique client.

## Refus client de devis

SERVICE-CONTROL-V2 ajoute un refus explicite du client ; V1 reste fermé à ses opérations et conserve son parcours de lecture/acceptation. La versionV2 est autorisée par la source PRO et choisie côté ANTSIA avant toute lecture, à partir d'une demande possédée et d'une capacité serveur. L'opt-in non secret `ANTSIA_COMMERCE_SERVICE_CONTROL_V2=true` est absent/fermé par défaut. Aucun environnement réel n'a été modifié.

Les vuesV2 fournissent `rejectable` et la preuve minimale `clientRejection`. Le geste porte référence et version de devis ainsi qu'un consentement dédié. PRO relit le demandeur de la consultation, la source, le mandat, la dernière version transmise, la validité, et l'absence d'acceptation/commande. Le refus n'utilise pas les pouvoirs d'un employé pour décider à la place du client.

La confirmation est décochée après toute relecture ou modification des conditions. Acceptation et refus partagent un verrou ; une réponse perdue conduit à la consultation de l'intention existante. Une reprise éventuelle conserve les octets initiaux et ne renvoie jamais automatiquement une décision. Retirer l'opt-in ferme les nouveaux gestes ; le suivi déjà admis reste soumis aux gardes de possession et de session.

ANTSIA exporte la preuve minimale du propriétaire et l'efface avec sa demande. Aucun sujet opaque, jeton, session ou corps signé ne sort dans l'export. PRO conserve ses décisions commerciales durables ; aucun cycle général d'export/effacement de ces décisions n'a été trouvé dans le code actuel. Cette limite doit être traitée dans la qualification des données avant ouverture, sans prétendre qu'une purge de reçus techniques l'a résolue.

## Preuves et limites à ce stade

- ANTSIA : génération stricte et types app/tests verts ;25cliquets ;107tests annuaire/profil puis28tests de refus/régression ;72tests UI de refus/reprise/filtres. Les nombres correspondent à des passages qui peuvent se recouvrir.
- Consultation locale : espace prestataire membre et public observé à390/834/1440px, un main et un h1, sans débordement. Retour marketplace conservé pendant la navigation ; un remontage conserve désormais le retour pendant son TTL, et un changement de titulaire le purge.
- Refus positif : pair PRO et activation services simulés dans un harnais isolé. Le registre réel reste fermé ; ce harnais n'est pas une recette de production.
- Aucun paiement, aucune réservation réelle, aucun message et aucune publication commerciale n'ont été exécutés. Aucun contrat PSP disponible ; les rails financiers restent fermés.

## MP06c — Forfait et préparation prestataire

Le forfait présente les livrables, inclusions, exclusions et délai de la version PUBLIC-V2 exacte. PRO fige ces conditions et leur empreinte sur la demande liée à la commande ; changer le profil sans changer le prix invalide la confirmation. Les reprises ne renvoient pas automatiquement un engagement après une réponse incertaine. Le créneau concurrent et la perte de réponse sont éprouvés dans un harnais isolé ; aucun agenda fictif n'est présenté.

Le port privé MERCHANT-READ-V1 exige un opt-in serveur, un consentement PRO dédié, le titulaire exact du lien et ses droits vivants. L'interface relit au geste, affiche les capacités manquantes et propose uniquement les destinations PRO autorisées. Les liens expirent après60secondes ; la réponse est invalidée après changement d'acteur, d'activité, d'état de formulaire ou de connexion. Le panneau est monté dans la configuration réelle des prestations. Il ne fait aucune opération métier à la place du professionnel.

Contrôles finaux : ANTSIA64tests backend (préparation20, services30, marketplace14),78UI sur5fichiers,11routes/éditeur parent ; génération stricte, types app/tests,25cliquets et lint ciblé sans défaut. PRO18tests domaine,68backend,19UI et6routes ; types domaine/UI/Convex/app et génération statique verts. Ces passages se recouvrent avec les contrôles précédents ; aucun total cumulatif n'est annoncé. Les contrats jumeaux sont identiques.

La recette navigateur finale des filtres prestataire reste à reprendre sur candidat stable : pendant les changements à chaud, le pont de session SSR local est revenu à un refus. Aucun repli anonyme n'a été introduit et ce défaut n'est pas déclaré résolu. Les visites membre/publique aux trois formats ont été observées, sans valider des demandes PRO réelles.

MP06d reste conditionnel à MP07/MP08 et à la qualification des données PRO. Aucun environnement, consentement réel, compte marchand ou paiement n'a été activé.

### Recette locale complémentaire

Sur les sources MP06 gelées, recherche publique « Reportage » et recherche membre « Portrait » : résultat réduit au bon service sans rechargement manuel, à390×844,834×1112 et1440×1000. Un seul main/h1 et aucun débordement aux six vues. Parcours fil → marketplace Services → prestataire, puis rechargement volontaire : le lien de retour conserve /marketplace?vue=services. Ce rechargement éprouve le remontage ; il ne sert pas à appliquer les filtres. Captures mp06-provider-{public,member}-filter dans le cache du chantier. Les refus SSR observés pendant des changements à chaud ne se sont pas reproduits sur ce passage ; aucune cause ni correction d’authentification n’est revendiquée. La validation intégrée MP14 reste distincte.
