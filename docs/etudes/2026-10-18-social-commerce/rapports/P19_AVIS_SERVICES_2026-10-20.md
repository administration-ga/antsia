# P19 / DP-39 — avis privés de suivi service, 20 octobre 2026

**Sources raccordées dans les deux produits ; aucune vérification ni activation.** Suite autorisée par la demande
d'enchaînement automatique des correctifs P19. Les réservations figurent dans
[EXECUTION.md](../EXECUTION.md). Les sources partagées de session, thèmes, médias, messagerie,
DIASPORALE et les correctifs CV séparés sont préservés.

## Choix d'architecture

Un changement de rendez-vous, de devis ou de commande peut signaler au client qu'il doit relire
son suivi. Le signal est **une invalidation privée neutre**, sans snapshot ni état métier.
Il ne vaut ni confirmation de rendez-vous, acceptation de devis, paiement ou nouvelle preuve
d'authentification. Aucun job ne fabrique `authVerifiedAt`. L'avis ouvre la fiche de service
existante ; la consultation/actualisation des détails garde les portes de vraie session P14/P16.

Le contrat nouveau `PRO-COMMERCE-SERVICE-NOTICE-V1` possède un profil dédié
`antsia-commerce-service-notice-v1`. PUBLIC/JOBS/test restent distincts : aucune destination
publique n'obtient un sujet acheteur par élargissement de sa liste d'événements. La destination
privée exige son choix explicite, la source destinataire et ses références de clé/origine propres ;
aucune configuration réelle, valeur d'environnement ou clé n'est ajoutée par cette reprise.

Le corps canonique, borné à 2 Kio, conserve l'enveloppe signée FEDERATION-INBOX-V1 et porte seulement :

- genre constant `service.followup.changed` et environnement ;
- références opaques du sujet, de la structure et de la demande d'origine ;
- genre/référence de l'objet (`appointment`, `quote`, `order`), révision et date du changement.

La référence d'objet de l'enveloppe doit égaler celle de la charge. Aucun nom, montant,
contact, contenu libre, identifiant interne, session ou consentement n'entre dans ce signal.
Sa syntaxe valide ne fournit aucune autorité à elle seule : enfilement, dispatch et réception
doivent chacun corréler l'engagement et leurs autorisations courantes.

## Contrat et preuves préparées

Nouveaux fichiers jumeaux hors manifeste P06 :
`ANTSIA/packages/social-domain/src/commerce-service-notices.ts` et
`PRO_GA/packages/pro-domain/src/commerce-service-notices.ts`. Le contrat n'étend aucun ancien
schéma fermé et ne modifie pas les octets du manifeste historique. L'export PRO.GA est raccordé
à son barillet ; ANTSIA utilise son sous-chemin de paquet existant.

Scénarios contractuels écrits dans les deux produits : forme fermée, corrélation genre/référence,
sujet opaque, structure exacte, refus de champs privés ou d'état, révisions/horloges invalides,
canonisation, taille et parité des deux sources. **Aucun scénario ni calcul de parité n'est exécuté.**
Un événement ancien peut rester syntaxiquement valable pour une reprise tardive ; la signature
de transport reste fraîche et les gardes de révision/autorité ne sont jamais remplacées par sa date.

## Producteurs et transport PRO.GA

`integrations/commerceServiceNotices.ts` résout le destinataire depuis les mappings existants
de rendez-vous, commande de service, acceptation ou inquiry destinataire du devis. Tenant,
structure, source/environnement, sujet, boutique et demande d'origine doivent concorder.
Source, liaison et mandat effectif sont relus ; une ligne ambiguë n'est jamais adoptée.

Les transitions sont raccordées via un pont typé dans les `_deps` : décisions de rendez-vous,
ancien créneau remplacé, expiration, changement/annulation ; envoi, retrait lors de révision et
décision de devis ; progression de commande ; mappings P14 après persistance du premier
rendez-vous, du remplacement, de l'acceptation et de la commande liée. Les consentements et
gates ne changent pas. Les révisions `updatedAt` des transitions devis/commande concernées
deviennent strictement croissantes pour distinguer deux changements dans la même milliseconde.
Les échéances, dates d'observation et fraîcheur des snapshots ANTSIA restent intactes.

La configuration admet seulement le profil privé explicite, l'événement unique et sa source
destinataire `serviceNoticeSource`. L'index ciblé cherche les seules destinations privées du
tenant/source ; au-delà de vingt, aucune sélection partielle n'est émise. Sans destination
admissible, aucun défaut de destinataire ou passage PUBLIC n'est utilisé.

Une tête `proCommerceServiceNoticeHeads`, par destination/objet/demande d'origine, évite un
second enfilement de la même révision. Les outbox existantes persistent événement et octets
canoniques dans la transaction. Avant HTTP, l'admission relit mapping, mandat, source,
configuration et révision courants ; un signal dépassé n'est pas envoyé comme état actuel.
L'adaptateur HTTP signé existant est réutilisé avec les références de clé/origine privées.
La grammaire COMMAND exclut aussi le namespace `PRO_COMMERCE_SERVICE_NOTICE_*`.

## Réception et avis ANTSIA

`federation/commerceServiceNotices.ts` est branché à la validation avant reçu et à l'inbox.
Il exige l'émetteur `pro-ga` autorisé pour ce contrat, l'environnement et le réseau actifs,
la source locale actuelle, puis la commande exacte par index
`networkId/source/environment/requestId`. La demande, son propriétaire, sa liaison, son sujet,
sa structure et le genre/référence d'objet sont corrélés. Une collision d'identifiant dans
un autre réseau ne détourne pas le suivi.

Une référence connue différente ferme le signal. Le premier devis peut se corréler à l'inquiry
acceptée. Sans référence résultat connue, seule une commande `unknown`, de genre compatible,
sans bail actif ni lookup en cours peut recevoir une notice neutre ; elle ne reçoit aucune
référence résultat ni réussite métier par ce canal. Un signal trop précoce sur objet inconnu
est refusé : le suivi manuel reste nécessaire, sans promesse de rattrapage automatique de
chaque premier signal.

Le registre privé `commerceServiceFollowupNotices` garde personne/demande/objet/révision,
empreinte des faits et transition opaque. Même fait sous nouvel eventId : pas de nouvel avis ;
même révision sous faits divergents : refus ; ancienne révision : aucun nouvel avis. Ce contrat
est personnel : les refus d'application ne conservent pas leur corps en lettre morte.

L'avis `commerce_service_followup_updated` passe exclusivement par `notifyPerson`, avec ses
gardes et préférences habituelles, sans observateur client fictif : il est non lu. La phrase
FR/EN et la destination utilisent la cloche/route de suivi existantes. Aucun snapshot, état,
`updatedAt` métier ou action de la demande ne change par ce signal. Le registre appartient à
la personne et à sa demande pour l'effacement ; son export brut est fermé, sans nouveau TTL.

## Scénarios préparés et raccords

Nouveaux scénarios, **non exécutés**, en plus des scénarios contractuels :

- ANTSIA `convex/modules/federation/commerceServiceNotices.test.ts` : signature/allowlist,
  source/réseau/propriétaire, révisions, doublons/conflits, réponse perdue, référence contraire,
  retrait/effacement/suspension, sessions, inventaire et absence de mutation métier ;
- PRO.GA `convex/modules/integrations/commerceServiceNotices.test.ts` : profils/namespaces,
  absence/saturation de destinations, mappings, source/liaison/mandat, transitions, déduplication,
  dispatch et distinction reçu/appliqué.

Raccords PRO.GA : `lib/pro/outbox.ts`, modules `integrations` (configuration, validateurs,
tables/outbox/dispatch et services), `agenda`, `quotes`, `orders` et leurs `_deps` ciblés.
Raccords ANTSIA : fédération, `shops/serviceTables.ts`, notifications, inventaire des données,
registre pur des genres et dictionnaires/phrase de notification de `social-features`.
Le profil est documenté dans l'API machine, sans nouvelle route HTTP PRO.GA. Aucun schéma
racine ni cron supplémentaire n'est requis par les agrégats existants.

## Limites conservées

Les gates P16 de nouvelles admissions restent fermées. Les politiques de conservation générale,
la voie des membres suspendus et la continuité après révocation de liaison ne sont pas inventées.
Le suivi privé existant reste la voie de consultation ; aucune notification ne garantit sa
réception sur appareil. Un reçu technique ne prouve ni la lecture ni un effet métier.

La continuité sans liaison/source actives ou mandat courant reste hors de ce raccord. Une
configuration ajoutée après la dernière transition ne déclenche pas un rattrapage historique.
Le simple franchissement de `validUntil` d'un devis n'a pas d'écrivain/cron dédié ici : seul
un changement métier explicite émet, aucune expiration fictive n'est ajoutée. Charge, latence,
persistance/délivrance réelle, clés distinctes configurées et comportement utilisateur restent
à éprouver. Ce lot ne garantit pas un avis pour chaque transition ni un délai de réception.

Aucun test, codegen, typage, lint, build, audit automatique, recette HTTP/Convex/navigateur,
serveur, installation, configuration, donnée, environnement, Git write, publication ou activation.
