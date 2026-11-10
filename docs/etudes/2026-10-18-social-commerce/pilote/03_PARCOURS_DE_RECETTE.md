# 03 — Parcours de recette à jouer, par version

> **20 octobre 2026 — tous parcours toujours non joués dans cette reprise.** La base source
> `c4d36f3` n’est pas gelée. Les mentions « jouable après gel » du tableau historique ne valent
> ni autorisation d’exécution ni ouverture de capacité. Les nouvelles admissions de paiement,
> services et candidatures restent fermées par P16, y compris après simple configuration.

## Compléments de recette issus des reprises (non exécutés)

Ces compléments prolongent les parcours existants ; ils n’en créent pas une seconde procédure.
Ils sont préparés pour le futur créneau autorisé et une candidate identifiée. Le registre P16
réellement fermé doit être observé comme fermé ; aucun contournement runtime n’est proposé.

| Parcours existant | Complément requis | État / dépendance |
|---|---|---|
| A-1, A-6 | Vraie session révoquée/recréée, réponse d’un ancien acteur, panne et recharge ; ancien contenu masqué pendant relecture fraîche | Non joué ; versions actuelles des gardes à vérifier |
| C-8 à C-10 | Intention retrouvée avant nouvelle demande, absence distante corrélée et clôture de clé sans effet ; devis courant au-delà de cinquante versions ; expiration de retenue refusée au geste avant cron ; ancien rendez-vous conservé en échec | Non joué ; nouveaux engagements P14 fermés par P16 |
| C-8, C-10 | Statut employé « accepté » distinct de l’accord client version/total/date ; tentative de paiement manuel ou par facture descendante d’un service ANTSIA refusée sans nouvelle écriture | Non joué ; aucun paiement de service ou acompte |
| C-11, C-14 | Perte du seul mandat de publication d’emploi ; recruteur/session révoqués pendant lecture du PDF ; changement d’acteur avant réponse UI ; unicité après anciennes candidatures et fenêtre saturée | Non joué ; candidature/copie nouvelle fermées par P16 |
| C-11, C-12 | Retrait d’une pièce au-delà de cinquante candidatures, suppression distante échouée puis reprise ; accès fermé immédiatement, référence de purge gardée jusqu’à absence observée | Non joué ; ne pas annoncer de suppression distante sur `remoteUnconfirmed` |
| C-11, C-12, C-14 | Interrompre un transfert entre stockage et rattachement ; retrouver uniquement le marqueur exact de la tentative durable. Éprouver bail actif, expiration, retrait, stockage tardif, doublon et suppression échouée ; conserver les références incertaines. Un fichier étranger ou ancien sans marqueur reste intact | Préparé pour le correctif P19 ; non joué ; conservation du MIME par le backend à prouver, gate CV fermée |
| A-10, C-7, C-11, C-14 | Région d'annonce stable sur achat détaillé, liste et fiche de candidature : silence initial et liste d'achats compacte, annonce d'une transition métier, silence sur date/historique/poll identique ; passage à suivi périmé annoncé une fois | Scénarios K-12/AC03 écrits seulement ; lecture d'écran FR/EN non effectuée |
| C-15 | Signal DP-39 par profil/destination privés explicites ; refus d'un profil PUBLIC, mauvaise source/réseau/sujet/structure/demande, référence contradictoire, doublon ou conflit de révision. Avis neutre non lu, sans contenu privé ; ouverture puis actualisation sous vraie session ; aucune mise à jour du snapshot par le signal | Non joué ; nouveaux contrat/profil non configurés. Éprouver expiration des mandats, réponse perdue, avis ancien/supplanté, effacement et absence de corps privé en lettre morte |
| C-7, C-12, C-14 | Registres fermés sans disparition des résultats déjà décidés ; statut, libération, annulation, retrait et résolution d’obligations selon leurs portes historiques ; aucune preuve fraîche fabriquée par un job | Non joué ; conservation/export général PRO.GA encore dépendance |
| A-2, A-5, A-10 et D-R | Sept chartes clair/sombre, taille de texte, focus et annonces natifs, réduction du mouvement et vidéo unique ; mesurer les corrections P18 au rendu | Non joué ; corrections en source, aucun seuil ou conformité acquis |
| D-R | Utiliser le [dossier P17d](../../../recette/antsia-native-p17d/README.md) pour le protocole/parité et les preuves physiques iOS/Android ; l’application et les appels P17b/c existent désormais en source | Non exécuté ; installation/compatibilité, binaires et configuration propriétaire manquants |

Pour D-R, distinguer rapport système natif, réponse autorisée et média effectif : écran verrouillé,
arrière-plan, démarrage à froid, expiration/refus/fin distante, réponse ailleurs, rotation de
liaison, déconnexion, permissions refusées, Bluetooth et changement de réseau. Vérifier l’arrêt
réel du micro/caméra. SecureStore reste `WHEN_UNLOCKED_THIS_DEVICE_ONLY` : aucune réponse
authentifiée avant déverrouillage ni réveil après arrêt forcé n’est promis. Android utilise
notification/actions sans promesse de plein écran. Un push admis chez le fournisseur ne prouve
pas sa réception. Aucune de ces observations n’a été faite dans cette reprise.

Références : [P14](../rapports/P14_REPRISE_2026-10-20.md),
[P15](../rapports/P15_REPRISE_2026-10-20.md), [P16](../rapports/P16_REPRISE_2026-10-20.md),
[P17c](../rapports/P17C_REPRISE_2026-10-20.md).

## Parcours historiques du 19 octobre (conservés)

19 octobre 2026, lot P19. **Aucun de ces parcours n'a été joué.** Chaque fiche porte l'état
« non joué ». Les parcours reprennent la matrice de [10 §1–§2](../10_RECETTE_MESURES_ET_RISQUES.md),
les recettes demandées par chaque prompt et les points ouverts des rapports. Ils ne se jouent
qu'après le gel et un `verify` vert ([02](02_GEL_ET_VERIFICATION.md)).

## 1. Règles communes

1. **Environnement** : backend local ou déploiement de recette jetable, jamais la production.
   Paiement en sandbox seulement. Un seul serveur de chaque sorte ; la recette croisée
   ANTSIA × PRO.GA se joue dans un créneau coordonné (ANTSIA `:3210`/`:3030`, PRO.GA
   `:3220`/`:3221` et son application `:3022`).
2. **Comptes** : comptes de recette fictifs, créés par le parcours normal d'inscription (comme
   `@recette.refonte` le 18/10), tenus par des membres de l'équipe qui y consentent. Aucune donnée
   réelle, aucun contact réel. Les noms civils saisis sont fictifs et passent par le normaliseur
   partagé (NOM en capitales, Prénom capitalisé).
3. **Données** : noms commerciaux et offres identifiables comme recette. Les graines existantes ne
   suffisent pas (ANTSIA : `seeds/foundations:run`, `seeds/devSocial:demoPerson`). Les jeux de
   P18A §4.3 sont à écrire : trente publications mixtes, une boutique liée de douze offres dont une
   à **une seule unité en stock**, un fil commercial accepté, trois offres d'emploi dont une close.
   Côté PRO.GA : graines `seed:referentiels`, `seed:admin`, `seed:natures`, `seed:demos-natures`
   (confirmation `SEEDS_PRO_GA_HORS_PRODUCTION`), puis structure vérifiée et publiée, module
   commerce effectif, site publié, établissements de retrait, prestation d'agenda rattachée à une
   offre, poste publié.
4. **Piège connu** : créer une page exige une adhésion `verifiee`, et le compte de développement
   n'en a qu'une déclarée. Une boutique portée par une page (exigée pour la liaison P08) passe donc
   par l'admission opérateur, qui crée la page native.
5. **Preuves** : date, HEAD et empreintes du gel, environnement, rôle, largeur ou appareil, étapes,
   résultat, captures minimisées. Jamais de cookie, jeton, secret, contact, numéro de paiement ni
   corps signé dans une capture ou un journal (10 §7).
6. **Verdict** : un parcours joué donne « observé en recette » à la capacité qu'il couvre, et à elle
   seule. Un HTTP 200, un reçu `received`, un job `sent` ou un test simulé ne prouvent ni
   l'application d'un événement, ni l'encaissement, ni le média chez un autre lecteur.

## 2. Index

| Id | Parcours | Version | Lots | Jouable après gel et `verify` ? | Bloqué par |
|---|---|---|---|---|---|
| A-1 | Session et ouverture | A | PA4, P02, P03, P05 | oui | — |
| A-2 | Thèmes, largeurs, zoom | A | P01, P02 | oui | — |
| A-3 | Navigation et création | A | P02 | oui | — |
| A-4 | Publications et carte publique | A | P03 | oui | — |
| A-5 | Fil immersif et retour | A | P04, PA10 | oui (téléphones physiques pour les gestes) | PR-06 pour la partie physique |
| A-6 | Messages | A | P05 | oui | — |
| A-7 | Appel 1:1 sur deux appareils | A | P05 | non | PR-03 (LiveKit) |
| A-8 | Appel de groupe à trois comptes | A | P05 | non | PR-03 |
| A-9 | Notification Web | A | P05 | non | PR-04 (VAPID) |
| A-10 | Accessibilité des bloquants | A | P18b | oui | lecteurs d'écran et téléphones (PR-06) |
| A-11 | Parité DIASPORALE | A | P01–P05 | oui | — |
| B-1 | Boutique : brouillon, admission, vitrines | B | P07 | oui | DP-04, interface de politique (K-19) |
| B-2 | Liaison PRO.GA à double preuve | B | P08 | non | PR-01 (configuration, clés) |
| B-3 | Transport de recette | B | P08 | non | PR-01 |
| B-4 | Catalogue : publication, révision, retrait | B | P09 | non | PR-01, K-19 |
| B-5 | Contact commercial | B | P10 | partiel (sans CRM ni appel) | PR-01 (CRM), PR-03 (appel) |
| B-6 | Panne de synchronisation | B | P08, P09 | non | PR-01 |
| C-1 | Préparation et réservation | C | P11, P13 | non | PR-01, K-19 |
| C-2 | Dernier article disputé | C | P11 | non | PR-01 |
| C-3 | Paiement sandbox | C | P12, P13 | **non** | **DP-10 à DP-14, adaptateur réel** |
| C-4 | Exécution et réception | C | P13 | **non** | C-3 |
| C-5 | Annulation et remboursement | C | P12, P13 | partiel (libération d'une réservation) | C-3 pour le remboursement |
| C-6 | Transaction tardive | C | P12 | **non** | C-3 |
| C-7 | Retrait de vitrine pendant un engagement | C | P07, P11, P13 | partiel | PR-01 |
| C-8 | Devis | C | P10, P14 | non | PR-01 |
| C-9 | Rendez-vous | C | P14 | non | PR-01 |
| C-10 | Prestation à tarif fixe | C | P14 | non | PR-01 |
| C-11 | Emploi et candidature | C | P15 | non | PR-01 |
| C-12 | Effacement avec engagements | C | P10–P16 | partiel | PR-01 |
| C-13 | Modération et recours de page | B/C | P16 | partiel | PR-01 pour les contenus reflétés |
| C-14 | Révocation pendant un parcours | B/C | P10, P11, P15, P16 | non | PR-01 |
| C-15 | Avis commerce et ouverture ciblée | C | P14B | non | PR-01 ; PR-04 pour les avis transportés |
| CC-R | Conversation contextuelle | DIASPORALE | CC | **non** | CC-3b à CC-6, PR-03 |
| D-R | Natif | D | P17b–d | **non** | P17b–d, DP-26 à DP-33, PR-06 |

## 3. Version A

**A-1 — Session et ouverture.** Rôles : membre M1 ; second appareil de M1. Étapes : ouverture
directe de `/fil` à froid, recharge, ouverture d'un lien profond (`/fil?post=…`, `/messages/…`),
session remplacée sur un autre appareil, déconnexion globale pendant une requête, retour depuis
`/entrer?publication=<id>`. Attendu : aucune action de reprise manuelle ; une réponse tardive ne
réinjecte rien ; `signOutEverywhere` seul point de sortie ; aucune régression du pont de session
(cinq fichiers gelés). État : non joué.

**A-2 — Thèmes, largeurs, zoom.** Rôle : M1. Thèmes Système, Clair, Sombre ; largeurs 320, 375, 393,
440, 768, 960, 1280, 1440 px ; paysage 812 × 375 ; zoom 200 % à 1280 px ; libellés longs FR et EN ;
portails (dock iCom, appel, commentaires). Attendu : fond blanc et cartes beige en clair, charbon
en sombre ; aucun défilement horizontal ; anneau de focus visible et non masqué par les barres
(`scroll-padding`, A13) ; mesure des contrastes au rendu. Reprend P01 §8, P01b §P8 et la matrice
P18A §1.3. Déjà observé partiellement le 18/10 (§3 de [01](01_VERSIONS_CANDIDATES.md)) ; à rejouer
sur les fichiers actuels, et pour chacun des thèmes au choix s'ils sont retenus. État : non joué.

**A-3 — Navigation et création.** Rôle : M1. Les cinq destinations au téléphone et au bureau ;
Créer (carte de choix, Échap rend le focus) ; brouillon de publication tapé, navigation Profil →
Découvrir → Fil, brouillon retrouvé, y compris à cheval sur 959/960 px ; liens profonds et anciens
alias (`/fil?tab=reseau`). Attendu : P02 §6, points 1 à 9. État : non joué.

**A-4 — Publications et carte publique.** Rôles : auteur M1, lecteur M2, visiteur anonyme V0.
Créer un texte seul, une photo, quatre photos, une vidéo, un partage, une publication de page.
Lire depuis M2 ; mettre un média en retenue puis le retirer ; ouvrir la carte publique SSR
(`/publications/<id>`) et la continuation « Entrer pour participer ». Attendu : média exact chez
le second lecteur ; aucune URL d'un média retenu ; légende longue lisible sans JavaScript ;
galerie au clavier ; visionneuse qui rend le focus. Cas limites : faible débit, ratio paysage,
publication devenue inaccessible pendant la connexion. État : non joué.

**A-5 — Fil immersif et retour.** Rôles : M1, M2 qui publie pendant la lecture. Trente médias
mixtes sur iPhone (Safari) et Android (Chrome) physiques : une publication par hauteur,
accrochage, défilement intérieur d'un créneau haut, galerie horizontale contre geste vertical,
zoom à deux doigts, sélection de texte. Retour depuis une offre, des commentaires et un profil
en page 3 ou plus : même publication, même image de galerie, même décalage. Réduction des
mouvements (liste par défaut), hauteur < 480 px (liste, raison affichée), `Save-Data` (aucune vidéo
anticipée), appel entrant (pause et motif), nouvelles publications retenues en tête, publication
retirée pendant la lecture. Attendu : une seule vidéo en lecture à tout instant (`paused` relevé) ;
avertissement « Fil incomplet » ou « Fil en préparation » tant que la couverture n'est pas prouvée.
Reprend P04 §6. État : non joué.

**A-6 — Messages.** Rôles : M1, M2 (relations acceptées), groupe de trois. Vues Conversations,
Appels, Contacts ; double appui sur Envoyer ; réponse perdue puis réessai (même clé) ; pièces et
vocal ; refus d'envoi (texte et pièces conservés) ; retour à la liste à la même position.
Attendu : un seul message par intention ; aucun statut « Livré » ; lecture fondée sur `readAt`.
État : non joué.

**A-7 — Appel 1:1 sur deux appareils.** Préalable : LiveKit configuré, deux sessions consenties
(PR-03). Audio et vidéo dans les deux sens ; navigation fil → boutique → messages et changement de
thème pendant l'appel ; raccrocher (micro et caméra réellement libérés) ; permission refusée puis
récupérée ; perte et reprise réseau ; appel occupé ; double acceptation. Attendu : 05 §8. Un appel
audio ne demande jamais la caméra. État : non joué.

**A-8 — Appel de groupe.** Trois comptes ; rejoindre, quitter sans terminer pour les autres,
identités et états micro/caméra. Le plafond de onze n'est pas éprouvé en charge. État : non joué.

**A-9 — Notification Web.** Préalable : VAPID configuré (PR-04). Inscription, réception, clic,
`/notifications/ouvrir`, session à rétablir, référence expirée ou refusée (même repli neutre),
mise à jour du worker. Attendu : texte neutre ; aucune adresse suivie depuis la charge ; un avis
d'appel ouvre Appels sans décrocher. Un job `sent` n'est pas une réception. État : non joué.

**A-10 — Accessibilité des bloquants.** Clavier, VoiceOver (iOS, macOS), TalkBack, NVDA. Ouvrir le
menu « ⋯ » d'une carte et atteindre « Signaler » au clavier (A01) ; lire une bulle entière et
atteindre ses pièces sans ouvrir la feuille d'actions (A02) ; dialogue de signalement modal (A03) ;
toast d'erreur annoncé pendant une modale (A07) ; appel entrant annoncé, carte modale au téléphone
(A05) ; arrivées de messages annoncées (A04). Attendu : aucun parcours essentiel bloqué (P18 :
acceptation). État : non joué.

**A-11 — Parité DIASPORALE.** DIASPORALE sur `:3031`, clair et sombre : coque historique, thème
inchangé, toasts et palette de réactions selon son comportement actuel (K-14). État : non joué.

## 4. Version B

**B-1 — Boutique : brouillon, admission, vitrines.** Rôles : membre déclaré G (gérant), opérateur O,
tiers T d'un autre réseau, visiteur V0. Préalable : politique de vitrine du réseau réglée par O
(`review` recommandé, DP-04), porte opérateur sans écran à ce jour (K-19). Étapes : Profil → Ma
boutique → brouillon en quatre étapes (activité, présentation, offres, publier) → consentement de
diffusion versionné → demande → admission motivée par O (création de la page native) → vitrine
membre `/boutique/<handle>` et publique `/boutiques/<handle>` → suspension → rétablissement (relit
les conditions) → retrait. Cas limites : institution ou page « Officiel » refusée ; usurpation de
nom ; préparateur historique sans mandat ; consentement retiré ; lecture racine d'un réseau enfant
sans geste `root` ; logo interdit ; T et V0 ne voient ni brouillon ni signataires. Attendu : trois
autorisations distinctes (préparer, publier, encaisser) ; aucun badge ni droit d'encaissement
déduit. État : non joué.

**B-2 — Liaison PRO.GA à double preuve.** Rôles : G (session ANTSIA vivante, administrateur de la page)
et son compte PRO.GA réel avec mandat (`site.publish` et tâches des permissions demandées).
Préalable : configuration commerce des deux côtés (PR-01). Étapes : Mes boutiques → Mes offres →
permissions et accord décoché → autorisation PRO.GA (`/commerce/autoriser?defi=…`) → choix explicite
de structure → retour `/mes-boutiques/liaison/retour` → lien actif → désactivation locale. Cas
limites : code rejoué ; défi expiré (5 min) ; autre session ou autre personne ; mandat retiré
pendant l'échange ; paramètres répétés au retour ; retour libre refusé. Attendu : aucune liaison par
e-mail, téléphone ou badge ; preuves retirées de la barre d'adresse. État : non joué.

**B-3 — Transport de recette.** Préalable : sandbox explicite des deux côtés
(`FEDERATION_ENVIRONMENT=sandbox`, `ANTSIA_COMMERCE_TRANSPORT_TEST_ENABLED=true`,
`PRO_COMMERCE_TRANSPORT_RECIPE_ENABLED=true`, émetteur autorisé, destination de profil
`antsia-commerce-test-v1`). Émettre `transport.probe` par `commerceRecipe:probe` (chemin réel
`emitProEvent` → outbox → worker), corréler `eventId`, `bodySha256`, reçu PRO.GA et preuve
`federationCommerceProbes`. Interrompre avant puis après le reçu ; reprendre avec les mêmes octets.
Attendu : `received` distinct de `applied` ; refus en production même flag activé. Cette preuve ne
porte aucun catalogue. État : non joué.

**B-4 — Catalogue.** Rôles : G dans PRO.GA (deux accords : entreprise puis offre), O (politique et
mapping catalogue, sans écran : K-19 ; politique de modération `commerceOffer`), membre M,
visiteur V0. Étapes : publication consentie d'une offre → application constatée (`applied`) →
catalogue et fiche avec variantes → modification du prix, d'une variante, d'une photo (nouvelle
révision complète) → pause → retrait (tombe) → association à une publication de la page puis
retrait (le slot rejuge l'offre) → réconciliation par pages (≤ 20 instantanés par clic). Cas
limites : doublon exact, événement ancien, trou de révision, conflit de même révision (lettre
morte), ancienne URL média fermée au retrait, offre « Sur devis » jamais chiffrée, disponibilité
périmée au-delà de quinze minutes. Attendu : 09 §5 « événement réellement appliqué, mise à jour et
retrait ». État : non joué.

**B-5 — Contact commercial.** Rôles : acheteur A1 (inconnu de la boutique), G, répondant R mandaté,
tiers T. Préalable : politique de contact du réseau ouverte en console (écran
`CommercialContactPolicy`) et accueil de la boutique réglé. Étapes : fiche → « Poser une question »
(un texte de 1 à 2 000 caractères, sans pièce ni appel) → acceptation par R (ou refus) → échanges,
pièces après acceptation → appel consenti (si PR-03) → blocage par chaque côté → mandat de R retiré
(lecture et écriture refusées au passage suivant) → transfert CRM consenti (si PR-01) → retrait de
l'accord depuis Mes données. Cas limites : quotas ; autre réseau ; double clic ; pièce retenue ;
retrait avant et après la réponse distante. Attendu : aucune relation personnelle créée ; aucun
droit CRM déduit du droit de répondre. État : non joué.

**B-6 — Panne de synchronisation.** Fermer la destination PRO.GA, puis arrêter le backend ANTSIA
pendant des éditions d'offres. Attendu : PRO.GA garde ses éditions et les drapeaux d'attente ;
reprise par `requeuePending` ; huit tentatives par défaut puis lettre morte ; affichage d'une
fraîcheur périmée côté ANTSIA ; aucun achat autorisé par un miroir périmé (P11 relit prix et stock
chez PRO.GA) ; rejeu d'une lettre morte de l'inbox depuis la console Fédération (motif d'au moins
dix caractères). État : non joué.

## 5. Version C

**C-1 — Préparation et réservation.** Rôles : A1, G (politique vendeur PRO.GA ouverte : retrait
publié ou livraison GA, frais configurés, accord vendeur `2026-10-18-p11-seller-v1`), O (politique
de préparation du réseau, sans écran : K-19). Étapes : panier mono-vendeur (dix lignes au plus) →
variante et quantité → retrait ou livraison → adresse saisie (jamais reprise du profil) → accord
décoché → récapitulatif XAF → réservation de quinze minutes → avertissement deux minutes avant
l'échéance → expiration, ou libération explicite. Cas limites : prix ou révision modifiés
(`reconfirm_required`, ancien et nouveau récapitulatif) ; réponse perdue puis `request.status` ;
autre session du même acheteur (lecture sans réémission) ; hors ligne (brouillon conservé,
écritures suspendues) ; livraison hors GA refusée. Attendu : aucun paiement déclenché ; Mes
préparations exact. État : non joué.

**C-2 — Dernier article disputé.** Deux acheteurs, une unité, préparations simultanées, vingt
répétitions ; panier multi-lignes dont la dernière ligne manque. Attendu : un seul hold ; rupture
refusée sans réduction silencieuse ; aucune première ligne restée réservée. État : non joué.

**C-3 — Paiement sandbox.** **Bloqué** : aucun adaptateur (`PAYMENT_ADAPTERS = []`), aucun binding
de callback ; le parcours rend aujourd'hui l'indisponibilité. À jouer seulement après DP-10 à
DP-14 et un adaptateur réel écrit, vérifié et configuré en sandbox. Étapes prévues : options →
readiness → consentement versionné → `payment.start` → action prestataire explicite → retour
(« vérification en cours », aucun statut lu dans l'URL) → callback → preuve → `succeeded` → stock
consommé une fois. Cas limites : callback double, hors ordre, falsifié ; montant, devise ou
bénéficiaire erronés ; réponse perdue (consultation avant toute nouvelle tentative) ; deux débits
réels (`duplicate_payment`). Attendu : 0 débit ni commande supplémentaire. État : non joué.

**C-4 — Exécution et réception.** **Bloqué par C-3.** Vendeur prépare et remet dans PRO.GA
(`OrdersBoard`) ; acheteur déclare la réception (texte `2026-10-18-p13-v1`). Attendu : réception
refusée sans paiement prouvé, stock consommé et absence de revue ; aucune allocation `eligible` ni
`paid`, aucun reversement. État : non joué.

**C-5 — Annulation et remboursement.** Jouable avant C-3 : annulation d'une préparation tenue
(libération unique). **Bloqué par C-3** : demande d'annulation après paiement (`pending_review`),
demande de remboursement, décision de l'administrateur plateforme PRO.GA (session vivante, motif,
audit), preuve fournisseur `confirmed`. Attendu : une demande n'est jamais affichée comme
remboursement effectué. État : non joué.

**C-6 — Transaction tardive.** **Bloqué par C-3.** Succès fournisseur après expiration du hold :
réacquisition atomique si le stock le permet, sinon revue et demande `late_payment` ; aucune
livraison d'un article inexistant ; aucun paiement ignoré. Les tests écrits
(`commercePayments.test.ts`, `commercePayment.test.ts`) ne remplacent pas ce parcours. État : non joué.

**C-7 — Retrait de vitrine pendant un engagement.** Une préparation tenue, puis retrait ou
suspension de la vitrine. Attendu : nouvelles ventes fermées ; la préparation reste lisible et
libérable par l'acheteur ; le support d'une commande (P13) reste accessible quand C-3 sera
jouable. État : non joué.

**C-8 — Devis.** Rôles : A1 (conversation P10 acceptée), G dans PRO.GA (`quotes.send`). Demande
(besoin, contraintes, date souhaitée, quantité, nombre de pièces choisies) → devis versionné envoyé
→ acceptation authentifiée (version et total exacts) → nouvelle version → nouvelle acceptation
exigée → une seule commande. Cas limites : devis expiré ; employé qui marque « accepté » (ne vaut
pas preuve) ; mauvais client ; réponse perdue. État : non joué.

**C-9 — Rendez-vous.** Rôles : A1, A2, G (prestation d'agenda rattachée à l'offre et publiée).
Créneaux libres (quatorze jours, soixante au plus) → créneau retenu (`requested`,
`holdExpiresAt`) → confirmation humaine → changement (un échec conserve l'ancien ; un rendez-vous
confirmé tient jusqu'à la confirmation de son remplaçant) → annulation jusqu'au début. Cas limites :
A1 et A2 sur le même créneau ; heure inexistante ou répétée (changement d'heure) ; fuseau affiché
(`Africa/Libreville` et celui de l'appareil) ; mandat révoqué ; politique fermée (l'annulation reste
possible) ; réponse perdue (`action.status`). Attendu : agenda canonique sans double réservation ;
acompte indisponible. État : non joué.

**C-10 — Prestation à tarif fixe.** Commande `commerce_service` au prix et à la révision attendus,
sans stock ni paiement ; `reconfirm_required` si le prix change. État : non joué.

**C-11 — Emploi et candidature.** Rôles : recruteur E dans PRO.GA (`recruiting.openings.manage` et
`site.publish` pour publier, `recruiting.view` pour lire), candidat K, tiers T. Préalable : émetteur
autorisant `PRO-COMMERCE-JOBS-V1`, politique emploi ouverte en console (écran `JobPolicy`),
modération `commerceJob`. Étapes : consentement de publication par poste (lieu, compétences,
période) → offre visible (membre et SSR) → Candidater (nom civil en deux champs, motivation
facultative, zéro à trois PDF de 5 Mio au plus, analyse antivirus complète, accord
`2026-10-18-p15-v1`) → suivi des états autorisés → retrait. Cas limites : un dépôt de pièce
n'envoie pas la candidature (A19) ; clôture `closed` ou `filled` définitive ; `withdrawn` sans
contenu ; T ne voit rien ; recruteur révoqué (accès refusé à la lecture suivante) ; pièce infectée
ou retirée ; lecture recruteur journalisée. Attendu : aucun CV dans un événement public ni par URL.
État : non joué.

**C-12 — Effacement avec engagements.** Un compte avec préparation tenue, rendez-vous à venir,
candidature et transfert CRM. Attendu : avertissement des rendez-vous avant confirmation (C5) ;
libération tentée dans les cinq minutes, sinon expiration ; retrait distant de la candidature (huit
tentatives, puis trace `remoteUnconfirmed`) ; retrait CRM attendu avant effacement des
corrélations ; aucune opération financière ; annulation de l'effacement pendant trente jours.
État : non joué.

**C-13 — Modération et recours de page.** Offre ou poste reflété retiré par la modération. Attendu :
avis neutre aux signataires vivants (aucun contenu, motif ni acteur dans la cloche) ; « Décisions
visant mes pages » dans Mes données (pages du réseau racine) ; recours ; un signataire de la page
ne juge ni le dossier ni le recours (C7) ; signataire suspendu sans avis ni recours. État : non joué.

**C-14 — Révocation pendant un parcours.** Mandat ANTSIA retiré pendant une conversation ; mandat
PRO.GA perdu (relecture toutes les quinze minutes, puis `shop.withdrawn`) ; suspension racine
entre le clic et l'envoi d'une candidature ; retrait pendant une préparation. Attendu : nouvelles
opérations refusées côté autorité ; réponses tardives non appliquées ; engagements antérieurs
servis à leur sujet. État : non joué.

**C-15 — Avis commerce et ouverture ciblée.** Rôles : client A1, mandataires P10 de la boutique,
candidat K, signataire de page, ancien signataire. Étapes : rendez-vous retenu (avis non lu à
l'équipe) puis confirmé, refusé ou annulé dans PRO.GA et relu par le client (avis écrit comme trace
déjà lue, sans transport) ; devis accepté (avis à l'équipe, ouverture vers la conversation) ;
candidature passée en entretien (avis transporté au candidat, ouverture vers
`/mes-candidatures/[applicationId]`) ; mandat retiré (avis absent de la cloche, ouverture nulle) ;
décision de modération d'une page ouverte par un signataire puis par un ancien signataire ; Mes achats
→ section « Prestations sans paiement en ligne » → Mes demandes. Attendu : aucun contenu, montant,
nom ni état dans les avis et les jobs ; une transition annoncée une seule fois ; un refus distinct
d'une expiration. Reprend la recette du [rapport P14B](../rapports/P14B_NOTIFICATIONS_ET_SUITES.md).
État : non joué.

## 6. Conversation contextuelle (pilote DIASPORALE)

**CC-R.** Aucune nature V1 dans le réseau racine ANTSIA. Préalables : CC-3a et CC-3b (tranche),
CC-4 (appels), CC-5 et CC-6 (interfaces) livrés et vérifiés ; politique par réseau et par nature
ouverte (fermée par défaut, motif d'au moins dix caractères, audit `contextual.policy_set`) ;
LiveKit pour les appels. Deux comptes DIASPORALE. Étapes : demande de service envoyée (phase
`open`, premier mot au répondant, D4) → proposition (`proposed`) → messages et deux pièces au plus
→ accords d'appel des deux côtés, dans le fil (D5 amendé) → appel → objet `completed` (lecture
seule) ; mentorat accepté ; candidature présélectionnée ; clôture irréversible par un côté (D12).
Cas limites : politique fermée (historique en lecture seule, D10) ; signataire retiré (plus rien) ;
blocage ; objet retiré par la modération ; effacement (cascade). Responsables : session DIASPORALE
et coordinateur. État : non joué.

## 7. Version D (natif)

**D-R.** Non jouable : P17b à P17d ne sont pas lancées. La matrice à jouer est celle de
[P17a §5.3](../rapports/P17A_AUDIT_NATIF.md) (iPhone physique, Android ≥ 14 avec services Google,
Android ≤ 13 si couvert ; écran verrouillé, démarrage à froid, arrêt forcé, Bluetooth, réseau
changé, deux appareils d'une même personne, révocation pendant la sonnerie). Aucune promesse native
dans le pilote. État : non joué.

## 8. Fiche de constat (à remplir pour chaque parcours joué)

| Champ | Valeur |
|---|---|
| Parcours, version | |
| Date, heure, opérateur de recette | |
| HEAD ANTSIA et PRO.GA, empreintes du gel | |
| Environnement (local, sandbox), services et ports | |
| Rôles et comptes de recette (identifiants fictifs) | |
| Appareil, navigateur, largeur, thème, lecteur d'écran | |
| Étapes jouées et écarts | |
| Résultat (conforme, non conforme, bloqué) | |
| Preuves (captures minimisées, références de recette non sensibles) | |
| Défauts ouverts et propriétaire | |
| Verdict accordé et capacité couverte | |
