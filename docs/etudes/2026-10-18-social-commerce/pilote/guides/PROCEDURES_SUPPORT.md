# Procédures de support du pilote

## Addendum support du 20 octobre 2026 — non éprouvé

Le [NO GO par capacité](../01_VERSIONS_CANDIDATES.md#actualisation-du-20-octobre-2026) reste
la décision préparée. Aucun support avec participants, incident réel ou exercice n’est conduit.
Les procédures du 19 octobre qui suivent sont historiques ; les corrections ci-dessous priment
sur leurs mentions « sans porte », « retiré donc effacé » ou « aucun client natif ».

| Situation | Consigne actuelle à éprouver avant usage | Ne pas conclure |
|---|---|---|
| Capacité indisponible malgré un ancien flag actif | Garder les registres P16 fermés ; orienter vers le suivi historique existant selon les droits | Ni panne à corriger par contournement ni autorisation d’ouverture |
| Réponse inconnue sur un service ou une candidature | Rechercher l’intention exacte sous le bon acteur/réseau ; absence prouvée et clôture de clé avant nouvel accord ; ne jamais interpréter une erreur de consultation comme absence | Ni échec métier certain, ni droit de recréer une demande |
| Lettre morte PRO.GA | Les finitions ont raccordé une relance explicite auditée dans l’administration PRO.GA, en source seulement ; corriger la cause et suivre la procédure autorisée, sans transformer ce dossier en ordre de rejeu | `received`/`sent`/HTTP 202 ne signifie pas `applied` ; une relance ne donne pas de stock frais |
| Retrait de CV / suppression échouée | Accès fermé dès retrait ; conserver les références `pending/failed` de la file PRO.GA jusqu’à absence observée et la trace d’attente distante ANTSIA | Ni suppression physique ni accusé distant sur `remoteUnconfirmed` ; pas de suppression manuelle de la file |
| Interruption de copie CV avant rattachement | Le correctif P19 raccorde en source une réservation durable et un marqueur opaque de tentative ; sa reprise ne vise que les marqueurs connus. Conserver réservations, références de purge et progression ; escalader sans manipulation de données | Ni récupération rétroactive des anciens blobs non marqués, ni autorisation de purge générale, ni preuve de conservation du MIME ou de suppression physique |
| Mandat emploi seul retiré | P16 réévalue les emplois avec les gardes de publication actuelles, sans retirer une boutique autrement valide ; cadence bornée existante, propagation non mesurée | Pas de garantie instantanée de retrait des reflets |
| Fermeture boutique / politiques | Préserver reçus, tombes, anti-rejeux et engagements ; suivre/libérer/annuler/retirer/rembourser via les portes privées normales et leur preuve | Pas de purge pour revenir en arrière, pas de remboursement annoncé comme effectué sans preuve |
| Appel natif absent, verrouillé ou interrompu | Classer non éprouvé ; relever seulement plateforme/version, référence technique utile, état et moment approximatif ; utiliser le [dossier P17d](../../../../recette/antsia-native-p17d/README.md) pour la future recette | Aucun réveil après arrêt forcé, média effectif ou réponse avant déverrouillage garanti |

Pour un appel natif, ne demander ni bearer, jeton média, jeton push, fichier de service Firebase,
clé APNs, capture d’un contact ou contenu de conversation. Un événement système ou un ACK
fournisseur n’est pas une preuve de réception/média/fin des captures. La fermeture doit distinguer
OS, salle média et révocation serveur ; un échec distant ne devient pas une réussite locale.

P16 protège les lectures privées par une session réelle et maintient les portes historiques,
mais ne résout pas la voie générale des membres suspendus, le réveil asynchrone des services,
la conservation juridique ni l’export/effacement général PRO.GA. Une file de purge ne vaut pas
certificat d’effacement. Les octets déjà délivrés ne sont pas récupérables par révocation.
Les cadences/délais historiques et objectifs P18 sont des paramètres ou cibles, sans mesure de
cette reprise ; aucun niveau de service ni astreinte nominative n’est inventé.

Références : [P14](../../rapports/P14_REPRISE_2026-10-20.md),
[P15](../../rapports/P15_REPRISE_2026-10-20.md), [P16](../../rapports/P16_REPRISE_2026-10-20.md),
[P17c](../../rapports/P17C_REPRISE_2026-10-20.md),
[finitions](../../rapports/FINITIONS_TECHNIQUES.md).

## Procédures historiques du 19 octobre (conservées)

19 octobre 2026, lot P19. Document interne. **Ces procédures n'ont jamais été éprouvées** : elles
s'appuient sur des sources raccordées mais non vérifiées. Chacune est à rejouer pendant la recette
([03](../03_PARCOURS_DE_RECETTE.md)) avant d'être utilisée avec des participants. Les procédures
liées au paiement ne s'appliquent qu'une fois un prestataire admis : le paiement est fermé dans ce
pilote.

## 0. Règles communes

**Ce que le support voit, et ne voit pas.** Aucun opérateur ANTSIA ne lit les conversations, les
achats, les candidatures ni les paiements d'une personne (P16 §3.7). La file d'admission des
vitrines montre le nom, la présentation et le préparateur ; un dossier de modération ne montre que
la cible signalée. Côté PRO.GA, seul un administrateur de la plateforme (`super_admin` ou
`system_admin`) décide d'un remboursement, sous session vivante et audit.

**Ce que le support demande.** Seulement les références opaques affichées dans les écrans de la
personne (référence de paiement, de commande, de demande, de candidature) et la date approximative.
**Jamais** : mot de passe, code reçu par SMS ou e-mail, code ou PIN de paiement mobile, numéro de
carte, capture d'une conversation d'un tiers.

**Ce que le support ne fait jamais.** Fabriquer un succès (marquer « payé », « appliqué »,
« remboursé ») ; supprimer ou modifier une donnée à la main ; contourner une garde, une session ou
une suspension ; promettre un délai, un remboursement ou un effacement que le système n'a pas
confirmé.

**Trace.** Chaque intervention est consignée sans contenu privé : date, procédure, références
opaques, gestes faits, escalade, issue.

**Escalade.**

| Sujet | Qui peut agir |
|---|---|
| Politique, admission, suspension de vitrine ; rejeu d'une lettre morte de l'inbox | opérateur plateforme ANTSIA (console, motif, audit) |
| Politique de modération d'une surface | administrateur du réseau |
| Paiement, remboursement, rapprochement | administrateur plateforme PRO.GA |
| Commande, rendez-vous, devis, candidature d'une structure | le vendeur ou le recruteur, dans PRO.GA |
| Défaut technique, configuration, lettre morte de l'outbox PRO.GA | coordinateur technique |

## 1. Paiement en attente

**Situation** : la personne ne sait pas si son paiement est passé (retour du prestataire sans
confirmation, réseau coupé, état « en cours » qui dure).

1. Lui faire ouvrir **Mes paiements**. L'état affiché vient du serveur. Le retour depuis la page du
   prestataire n'est pas une preuve.
2. Lui dire de **ne pas payer une seconde fois**. Le système consulte le prestataire avant toute
   nouvelle tentative : après un délai incertain (vingt secondes), il ne relance jamais un débit sans
   preuve qu'aucun n'a eu lieu.
3. Si l'état reste incertain : relever la référence de paiement affichée et escalader à
   l'administrateur plateforme PRO.GA. Les opérations sont reprises par consultation chaque minute ;
   après dix tentatives, elles passent en rapprochement humain.
4. « Action requise » : la personne rouvre l'action du prestataire depuis Mes paiements, sur geste
   explicite ; l'adresse vient du serveur.

**Interdit** : déclarer le paiement réussi ; demander un code de paiement mobile.

## 2. Transaction tardive et double débit

**Situation** : le prestataire confirme après l'expiration de la réservation de quinze minutes, ou
deux débits réels existent pour la même commande.

1. Succès tardif : le système tente de **réacquérir le stock** de façon atomique. S'il y parvient, la
   commande suit son cours. Sinon, elle passe **en revue** avec une **demande de remboursement**
   « paiement tardif ». Le vendeur ne livre pas un article qui n'existe plus.
2. Double débit : chaque débit est comptabilisé une fois ; une seule commande et une seule
   consommation de stock existent. Le débit en trop ouvre une demande de remboursement
   « paiement en double ».
3. Escalader à l'administrateur plateforme PRO.GA, qui décide (motif, révision attendue, audit).
   Un remboursement n'est « confirmé » qu'avec la preuve du prestataire.
4. Informer la personne : « remboursement demandé », jamais « remboursé » avant la preuve.

**Interdit** : ignorer un paiement reçu ; annoncer un délai de remboursement.

## 3. Lettre morte (DLQ)

Une réception technique n'est pas une application : `received` ou un HTTP 202 ne prouvent rien ;
`rejected` (`dead_letter`, `discarded`) n'est jamais une application.

**3.1 Inbox ANTSIA (reflets PRO.GA vers ANTSIA).** Console **Fédération → Lettres mortes**.
Lire la raison fermée (par exemple contrat non autorisé, conflit de révision, forme non canonique).
Corriger la cause : contrat absent des `allowedContracts` de l'émetteur, mapping ou politique de
catalogue fermés, conflit de même révision à faire republier par le vendeur. Puis **rejouer** depuis
la console avec un motif d'au moins dix caractères ; constater l'état `applied`.

**3.2 Outbox PRO.GA (envois vers ANTSIA).** Après huit tentatives, l'envoi passe en lettre morte. Aucune
porte de relance d'une lettre morte n'a été relevée dans les sources (l'administration des
intégrations liste et désactive seulement). Corriger la cause (destination, origine, clé,
environnement), puis faire lancer par le gérant de la boutique la **réconciliation du catalogue**
depuis son éditeur : chaque clic réenfile au plus vingt instantanés courants. La copie ANTSIA ne
change qu'à l'application d'un événement signé. Escalader au coordinateur technique.

**3.3 Transfert CRM d'une question.** Huit tentatives automatiques ; la personne peut relancer depuis
Mes données (même intention). Un retrait d'accord attend le reçu de PRO.GA avant l'effacement final
des corrélations.

**3.4 Retrait de candidature.** Après huit tentatives, le retrait est clos côté ANTSIA avec la trace
« non confirmé ». Demander au recruteur de constater, dans PRO.GA, que la candidature est bien
retirée et ses pièces effacées.

## 4. Retrait d'offre

**Situation** : une offre a disparu, ou un client demande pourquoi.

- Retrait par le vendeur (pause, archivage, retrait d'accord dans PRO.GA) : l'offre quitte la
  découverte ; ses anciennes images ne sont plus servies ; une publication qui la citait ne
  l'affiche plus.
- Retrait par la modération ANTSIA : la copie locale est retirée ; une mise à jour du vendeur ne la
  restaure pas. Les signataires de la page reçoivent un avis neutre et peuvent faire recours (§9).
- Ce qui reste : les préparations en cours (libérables), les commandes passées, leur suivi.

**Interdit** : restaurer une offre en modifiant la copie ANTSIA.

## 5. Mandat révoqué

**Situation** : un membre de l'équipe ne peut plus répondre, ou une vitrine a disparu après un
changement chez PRO.GA.

- Mandat de répondant ANTSIA retiré : lecture et écriture refusées au prochain accès ; un appel en
  cours est fermé au passage suivant de la revalidation (cadence d'une minute, non mesurée).
- Administration de la page perdue : la liaison n'est plus valable ; plus de catalogue lisible ni de
  nouvelle vente.
- Mandat PRO.GA perdu (affiliation, rôle, tâche) : la relecture périodique (toutes les quinze
  minutes) retire la vitrine reflétée, puis ses offres et emplois.
- Les clients gardent leurs engagements par leurs voies privées.

Rétablir seulement par les gestes normaux : le gérant propose un mandat, le répondant l'accepte ; ou
nouvelle liaison à double preuve. **Interdit** : créer ou prolonger un mandat à la main.

## 6. Perte d'accès

| Cas | Ce qui se passe | Geste du support |
|---|---|---|
| Session expirée ou révoquée, déconnexion globale | l'état local d'ANTSIA est purgé dans le navigateur ; aucune reprise de l'ancienne session | reconnexion normale |
| Session restreinte | la personne est dirigée vers Mes données et ses recours | expliquer ; aucune exception |
| Suspension | aucune écriture ; restent Mes données, le retrait de l'accord CRM et le retrait de candidature ; annuler un rendez-vous ou une commande est refusé | pour un rendez-vous, demander au professionnel de l'annuler dans son agenda ; voie générale non décidée (DP-07) |
| Effacement demandé | actions refusées ; annulation possible pendant trente jours | §7 |
| Accès d'identité perdu | relève du fournisseur d'identité, pas d'ANTSIA | orienter |

**Interdit** : partager un compte, recréer un accès, créer une exception de session.

## 7. Demande d'effacement

1. Rappeler le délai de grâce : trente jours, pendant lesquels la personne peut annuler.
2. Ce qui s'efface : données sociales, projections privées (préparations, paiements, achats,
   demandes, candidatures), textes et alias des transferts CRM (après le reçu de retrait de PRO.GA).
3. Ce qui se passe ailleurs : réservations libérées dans les cinq minutes, sinon expirées ;
   candidatures retirées chez l'employeur (huit tentatives au plus) ; **aucune opération
   financière** ; **aucun rendez-vous annulé** chez le professionnel (§8).
4. Ce qui reste chez PRO.GA : commandes, preuves financières, acceptations de devis, rendez-vous, sous
   des durées non fixées (DP-17) ; PRO.GA n'a pas de procédure générale d'effacement du sujet (DP-18).

**Interdit** : promettre un effacement universel ; supprimer à la main un enregistrement PRO.GA.

## 8. Rendez-vous et effacement

Avant de confirmer l'effacement, la personne voit ses rendez-vous à venir (cent demandes les plus
récentes au plus). Procédure :

1. Si l'effacement est déjà demandé : l'annuler depuis Mes données.
2. Annuler ses rendez-vous depuis **Mes demandes** (accord d'annulation, session récente).
3. Redemander l'effacement.

Si la personne ne peut plus agir (suspension, accès perdu) : demander au professionnel d'annuler le
rendez-vous dans son agenda PRO.GA. L'annulation automatique à l'échéance de la grâce attend la
décision DP-18.

## 9. Recours de page et suspension de vitrine

- Un contenu porté par une page (offre ou poste reflété, réponse d'avis, évènement) retiré par la
  modération : chaque signataire vivant de la page reçoit un avis **neutre** (sans contenu, motif ni
  auteur). Il retrouve la décision dans **Mes données → Décisions visant mes pages** (pages du réseau
  racine) et peut faire recours.
- Un signataire de la page ne juge ni le dossier ni le recours. Un signataire suspendu ne reçoit pas
  d'avis et ne peut pas faire recours au nom de la page.
- Un recours déposé par un signataire ensuite effacé disparaît avec lui ; un autre signataire peut le
  redéposer (DP-09).
- Vitrine refusée : nouvelle demande de publication. Vitrine suspendue : **aucune voie de recours
  structurée** ; la décision tient jusqu'au rétablissement par un opérateur, qui relit les conditions
  (DP-06). Escalader à l'opérateur plateforme.
