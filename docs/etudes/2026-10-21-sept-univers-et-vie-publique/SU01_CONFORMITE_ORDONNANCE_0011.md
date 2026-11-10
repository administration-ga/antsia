# SU01 — Conformité d'ANTSIA à l'ordonnance n° 0011/PR/2026

**Analyse du 21 octobre 2026 · lot SU01 de l'[ADR-0035](../../adr/0035-sept-univers-et-vie-publique.md) (décision D08) · à faire valider par un conseil juridique avant toute mise en œuvre de l'identification et de l'âge**

> **Portée.** Analyse technique et produit, pas un avis juridique (le cahier des charges réserve les textes légaux à un juriste, arbitrage A10). Elle met en regard chaque obligation du texte, ce que le code d'ANTSIA fait déjà, l'écart, et le sous-lot qui le comble. Aucun code n'est modifié par ce document.

## 0. Sources et limites

**Lues dans le texte**
- Journal officiel de la République gabonaise n° 110 (8-15 avril 2026), 16 pages, extrait et lu en entier le 21/10/2026 :
  - ordonnance n° 0011/PR/2026 du 26 février 2026 portant réglementation de l'usage des réseaux sociaux via les plateformes numériques (articles 1 à 55) ;
  - ordonnance n° 0012/PR/2026 modifiant le Code de la communication (articles 2 bis, 51 à 54, 179 à 191 nouveaux) ;
  - ordonnance n° 0013/PR/2026 réorganisant la HAC (articles 3 et 5 nouveaux).
- Loi n° 025/2023 du 12 juillet 2023 (JO n° 218 bis) sur les données personnelles : articles 70 à 74, 81, 85 et 188 à 194.

**Non lus**
- La loi de ratification promulguée le 05/10/2026 (décret n° 0436/PR selon la presse ; numéro et modifications éventuelles à vérifier).
- Le référentiel de la HAC sur la vérification de l'âge (article 20, à paraître).
- Les textes d'application (article 54).
- Les durées de conservation renvoyées aux « textes en vigueur » (articles 29 et 31).

**Réserves de lecture**
- Le JO est composé sur deux colonnes : l'ordre de quelques alinéas des articles 31 à 37 a été reconstitué à la lecture.
- Plusieurs renvois internes de la loi n° 025/2023 sont fautifs. L'article 81 exclut « ceux qui sont mentionnés aux articles 81 et 82 », c'est-à-dire lui-même. L'article 76 parle d'une « interdiction prévue par l'article 74 », alors que l'article 74 traite des enfants. Et l'article 74 déclare licite le traitement des données d'un enfant « âgé d'au moins dix-huit ans », sous réserve du consentement parental. Le juriste doit lire ces renvois.

**Code** : lu, pas exécuté. « En source » ne veut pas dire « vérifié en production ».
- Arbre partagé `codex/pa4-identite-session` : HEAD `c4d36f3` et ses modifications non commitées.
- `origin/main` `7ffab29` : il contient les mêmes mentions légales, les mêmes motifs de signalement et la même preuve IDN.

## 1. Ce qu'est ANTSIA au sens du texte

| Notion (article 3) | Pour ANTSIA |
|---|---|
| **Réseau social** : service permettant de créer un profil, de se connecter et d'échanger des contenus ou des biens avec une communauté | oui : profils, relations, fil, groupes, Messages |
| **Plateforme numérique** : classement algorithmique de contenus, de biens ou de services de tiers, ou mise en relation en vue de la vente d'un bien ou de la fourniture d'un service | oui, deux fois : fil classé et marketplace (boutiques, prestations, emplois, puis les sept univers) |
| **Éditeur** : personne qui, par son rôle actif et son pouvoir de modération, contrôle et met en œuvre la diffusion | l'exploitant d'ANTSIA (modération nationale, classement, retraits) |
| **Hébergeur** : personne qui met à disposition, directement ou indirectement, les moyens de stocker et de rendre public des contenus de tiers | l'exploitant aussi, indirectement (Convex, Vercel, stockage des fichiers) |
| **Utilisateur** : personne inscrite ou connectée, disposant notamment d'un compte ou d'un profil | tout titulaire de compte, y compris les membres de DIASPORALE, application du même moteur ; le visiteur anonyme des pages publiques n'a pas de compte |
| **Administrateur de groupe ou page** : utilisateur qui détient les droits de gestion technique | administrateurs et signataires de pages, administrateurs de groupes |
| **Assimilé** au professionnel de la communication numérique (ordonnance 0012, art. 51 nouveau) : personne qui crée, produit, édite, diffuse ou modère des contenus destinés au public | pages actives, créateurs, vendeurs qui publient : obligations éthiques et de transparence (art. 54 nouveau) |
| **Communication numérique** : contenus qui n'ont pas le caractère d'une correspondance privée | fil, pages, groupes, boutiques ; les messages privés sont une correspondance privée, mais l'article 22 encadre le contact direct des mineurs |
| **Représentant légal désigné** : personne résidant ou établie au Gabon ou dans un État de la CEMAC, mandatée pour recevoir les notifications judiciaires et administratives et pour assurer la conformité réglementaire | l'exploitant gabonais, qui doit nommer un point de contact joignable |

**Champ** (article 2) : tout utilisateur, éditeur ou hébergeur dont les contenus sont accessibles ou produisent leurs effets au Gabon. L'ordonnance « englobe également » toute offre de biens ou de services de communication accessible au public en ligne, gratuite ou payante.

**Calendrier** :
- les obligations s'appliquent depuis la publication de l'ordonnance (JO n° 110, 8-15 avril 2026) ;
- l'article 53 laisse douze mois à compter de cette publication pour trois chantiers : la vérification de l'âge à l'inscription, la détection et le marquage des contenus d'IA, la transmission de leurs métadonnées. L'échéance tombe vers la mi-avril 2027, date exacte à confirmer par le juriste.

## 2. Les exigences, article par article

Légende de la colonne « Écart » : **majeur** = l'obligation n'est pas couverte ; **partiel** = une partie existe ; **couvert** = le code y répond, sous réserve de recette.

### 2.1 Utilisateurs, administrateurs et droits (chapitres II et III)

| Art. | Obligation | Échéance | Ce que fait ANTSIA aujourd'hui | Écart | Sous-lot |
|---|---|---|---|---|---|
| 4 | Tout titulaire de compte s'identifie. Personne physique : noms, prénoms, domicile, téléphone, n° RCCM si elle y est assujettie. Personne morale : dénomination, siège, téléphone, RCCM, capital. « Le cas échéant » : identité numérique confirmée, notamment le NIP | immédiat | **Compte léger** : code à usage unique par e-mail ou SMS ; le moteur ne garde qu'une empreinte du canal vérifié (`people/identity.ts`, `localProofOf`). **Compte IDN** : scopes `openid profile email` ; `idnProfileProof` ne retient que le sujet, le niveau de garantie, la nationalité et le type de profil, et écarte volontairement nom, prénoms, date de naissance et NIP (`betterAuth/settings.ts`, test associé). Aucun nom légal, domicile ni RCCM n'est demandé à l'inscription (`/bienvenue` : nom affiché, identifiant, langue, fuseau, consentement). Ces données n'apparaissent qu'ailleurs, pour un autre usage : nom civil d'une candidature à un emploi, adresse de livraison, province facultative du profil | **majeur** | SU01b (A1, A5) |
| 5-10 | Usage licite et loyal ; l'utilisateur répond du contenu de son compte et doit le modérer ; élaborer, diffuser, partager ou amplifier un contenu illicite engage, solidairement pour l'amplification | immédiat | Un membre peut retirer tout commentaire laissé sous sa publication (`engagement.removeComment`), masquer, mettre en sourdine, bloquer. Ni règles d'utilisation, ni conditions générales publiées ; aucune acceptation de conditions | **partiel** | SU01f (A7) |
| 11 | L'administrateur de pages ou de groupes répond des contenus illicites qui y circulent | immédiat | **Groupe thématique** : le propriétaire ou un modérateur retire la publication d'un membre et peut l'exclure, mais ne retire pas les commentaires d'autrui. **Page** : tout signataire retire les publications de la page ; sous une publication, seul le signataire qui l'a publiée retire les commentaires. **Discussion de groupe** : chacun ne supprime que ses propres messages. L'administrateur n'est pas prévenu d'un signalement dans son espace | **partiel** | SU01f (A7) |
| 12, 13, 15 | Rectifier, compléter, mettre à jour, effacer, restituer ; demande authentifiée et datée | immédiat | `/mes-donnees` : export journalisé, disponible 24 h ; effacement avec confirmation, 30 jours de grâce, annulation, journal et reçu anonyme ; profil modifiable et horodaté mais non journalisé ; le reste par e-mail | **couvert** pour l'export et l'effacement ; journal de rectification et datation des demandes par e-mail à ajouter | SU01e |
| 14 | Le parent peut faire effacer les données d'un mineur de moins de 16 ans | immédiat | aucune voie dédiée | **majeur** | SU01c |

### 2.2 Mineurs (chapitre IV)

| Art. | Obligation | Échéance | Ce que fait ANTSIA aujourd'hui | Écart | Sous-lot |
|---|---|---|---|---|---|
| 16, 17 | Majorité numérique à 16 ans ; création d'un compte interdite avant | immédiat | ni date de naissance, ni tranche d'âge, ni contrôle d'âge, nulle part ; les rencontres sont fermées faute de preuve de majorité | **majeur** | SU01c (A3, A4) |
| 19, 21 | Pornographie interdite aux moins de 18 ans ; écran neutre tant que l'âge n'est pas vérifié, si la plateforme en propose | immédiat | aucune interdiction écrite ; seul le motif de signalement « contenu sexuel inapproprié » ; les fichiers passent un antivirus, sans classification | **partiel** : interdire la pornographie dans les règles dispense de l'écran | SU01c, SU01f |
| 20, 23 | Référentiel de la HAC pour la vérification d'âge ; audit des systèmes | à paraître | sans objet tant qu'aucun système n'existe | — | SU01c |
| 22 | Pour les mineurs : bloquer publication, partage et interaction avant 16 ans sauf accord parental enregistré ; désactiver par défaut le contact par des personnes non identifiées ; filtrer la recommandation de contenus d'IA violents, sexuels ou préjudiciables ; rapport trimestriel ; vigilance raisonnable, la fausse déclaration ne décharge pas la plateforme | immédiat | le message personnel exige déjà une relation acceptée ou un fil existant ; le contact commercial passe par une demande acceptée ; le fil, les suggestions et la découverte sont chronologiques, sans score d'affinité ; aucun réglage propre aux mineurs ; aucun rapport : `/transparence` ne publie que le total quotidien des dossiers des douze derniers jours, à partir de cinq dossiers et cinq auteurs distincts | **majeur** | SU01c (A3, A9) |
| 24 | Signalement de cyberharcèlement ou de contenu préjudiciable impliquant un mineur : accusé de réception sous 24 h, traitement et décision notifiée à l'utilisateur sous 72 h ; le non-respect engage la responsabilité | immédiat | motifs : harcèlement, haine, violence, contenu sexuel, désinformation, autre ; le serveur accepte déjà tout code de motif bien formé (`cases.report`), seuls la liste et les libellés changent ; le déclarant ne voit qu'un message à l'écran, sans notification ni suivi ; la décision n'est notifiée qu'à l'auteur ou aux signataires de la page ; files chronologiques, sans délai, priorité ni chronomètre | **majeur** | SU01d |

### 2.3 Éditeur, hébergeur et contenus d'IA (chapitres V à VII)

| Art. | Obligation | Échéance | Ce que fait ANTSIA aujourd'hui | Écart | Sous-lot |
|---|---|---|---|---|---|
| 25 | Publier l'identité de l'éditeur : dénomination, siège, téléphone, RCCM, capital ; directeur de publication et, le cas échéant, responsable de la rédaction ; hébergeur (nom, adresse, téléphone) ; personnes qui traitent les données | immédiat | mentions légales : NTSAGUI DIGITAL, SARL au capital de 5 000 000 FCFA, siège Batterie IV, rue des Résidences, BP 638 Libreville, RCCM, NIF, e-mail de contact. Manquent le téléphone, le directeur de publication et les hébergeurs. La confidentialité nomme Vercel, Convex et Identité.ga, mais pas Resend, LiveKit, PostHog, Expo, FCM, APNs, la passerelle SMS ni ClamAV | **partiel** | SU01a |
| 26, 27, 47 | Droit de réponse de toute personne citée : demande dans les trois mois, insertion sous 48 h (amende de 2 à 20 millions FCFA) | immédiat | absent | **majeur** | SU01e (A8) |
| 28 | L'éditeur répond de tout dommage, y compris par négligence ou défaut de diligence | permanent | modération par réseau et par équipe ; sanctions (avertissement, retrait, mise en sourdine, suspension, exclusion, 365 jours au plus) ; recours à deux niveaux ; journal des actions d'opérateur (cliquet `operator-audit`) | **partiel** : la diligence se prouve par des délais tenus | SU01d, SU01h |
| 29 | L'hébergeur fournit les moyens d'identification et conserve les données d'identification de l'éditeur selon les textes | immédiat | l'effacement supprime les liens d'identité et les preuves IDN ; pendant les 30 jours de grâce, e-mail et téléphone restent en clair dans la file d'effacement ; aucune conservation réglementaire | **majeur** | SU01b, SU01g (A2) |
| 30 | Informer les autorités des activités illicites dont il a connaissance | immédiat | aucune procédure | **majeur** | SU01g (A10) |
| 31 | Conserver temporairement les contenus signalés et les mettre à disposition des juridictions | immédiat | aucune copie du contenu signalé : la ligne retirée reste en base, sans durée ni gel, jusqu'à l'effacement du compte de son auteur ; dossiers conservés sans purge ; à l'effacement, la note du déclarant et le motif de décision sont supprimés | **partiel** | SU01g (A2) |
| 32 | Interdits : hypertrucages sexuels d'une personne sans son accord ; hypertrucages attribuant de faux propos ou comportements de nature à causer un préjudice grave ; représentations sexuelles de mineurs, quelle que soit la technique ; imitation de l'identité visuelle ou sonore d'une institution de l'État à des fins de désinformation | immédiat | aucune règle écrite, aucun motif dédié | **majeur** | SU01d, SU01f, SU01i |
| 33 | Une personne représentée sans son accord dans un contenu d'IA le signale ; retrait sous 24 h, sinon saisine de la HAC ou du juge | immédiat | aucun motif ni délai | **majeur** | SU01d |
| 34, 53 | Dans les douze mois : vérification d'âge à toute inscription ; détection automatique des contenus d'IA ; marquage visible, clair et permanent ; métadonnées d'origine préservées et transmises à la HAC sous huitaine ; audit possible | mi-avril 2027 ; marquage dès qu'iAsted produit | aucune IA, aucune notion de contenu généré par IA dans le modèle de données ; seuls les médias de démonstration, générés par IA, le signalent dans leur texte alternatif et leur manifeste | **majeur** | SU01c, SU01i |

### 2.4 Régulation, recours et mesures (chapitres VIII à XI)

| Art. | Obligation | Échéance | Ce que fait ANTSIA aujourd'hui | Écart | Sous-lot |
|---|---|---|---|---|---|
| 35-37 | Dialogue permanent de la HAC avec les éditeurs et les hébergeurs ; registre national public des réseaux sociaux et plateformes opérant au Gabon, tenu par la HAC. L'ordonnance ne fixe aucune formalité d'inscription : la demander à la HAC | immédiat | hors code | à faire par le propriétaire | SU01a |
| 38 | Réclamation de toute personne lésée auprès de la HAC | — | aucune information au public | **majeur** (information) | SU01e |
| 39-44 | Référé numérique « d'heure à heure » : suspension d'un compte ou d'un contenu, déréférencement ciblé, publication d'un correctif, marquage d'origine forcé ; en cas de troubles graves, ralentissement, restriction de fonctions, suspension d'accès, 72 h au plus ; mesure caduque sans action au fond dans le mois | sur ordre | suspension d'un compte partout (`suspendEverywhere`, journalisée) et décision d'opérateur sur un dossier (`decideAsOperator`), mais ni l'une ni l'autre n'est proposée dans la console ; ces gestes sont réservés aux opérateurs de plateforme, avec une session IDN de niveau 2 au moins ; suspension d'une page et d'une vitrine ; retrait de la projection publique réservé à l'auteur ; pas de déréférencement ni de correctif épinglé par un opérateur ; restrictions de fonctions partielles (réglages commerce et messageries ; registre d'activation en constantes) | **partiel** | SU01h (A12) |
| 45-52 | Peines : défaut d'identité de l'éditeur ou de l'hébergeur, défaut de moyens d'identification, défaut de lutte contre les contenus illicites (1 an et 5 à 50 millions FCFA) ; défaut de droit de réponse (2 à 20 millions) ; entrave à la HAC ; usage des éléments d'identification d'autrui pour obtenir des données confidentielles (art. 51) ; usurpation d'identité, aggravée par l'IA (art. 52) | — | — | information | — |

### 2.5 Ordonnances 0012 et 0013, loi 025/2023

| Texte | Obligation | Ce que fait ANTSIA aujourd'hui | Écart | Sous-lot |
|---|---|---|---|---|
| Ord. 0012, art. 2 bis, 51 et 54 nouveaux | Le Code de la communication régit les plateformes. Les « assimilés » (créateurs, pages actives, vendeurs qui publient) respectent les obligations éthiques du journaliste, identifient le site (responsable, responsable éditorial, hébergeur) et font connaître leur politique de données, leurs règles d'utilisation et les termes de leurs transactions | conditions vendeur V2 affichées sous conditions (MP05) ; mentions légales partielles ; pas de règles d'utilisation | **partiel** | SU01a, SU01f, SU01j |
| Ord. 0012, art. 53 nouveau | L'hébergeur coopère avec les autorités dans une enquête, accès aux données compris, dans le respect de la vie privée | aucune procédure | **majeur** | SU01g (A10) |
| Ord. 0013, art. 3 nouveau | La HAC régule les plateformes et contrôle la publicité | sponsorisé non construit | à anticiper | SU10 (A11) |
| Loi 025/2023, art. 70 | Données loyales, adéquates, pertinentes et non excessives ; conservées pas plus longtemps que la finalité ne l'exige | minimisation déjà forte (empreinte du canal vérifié, preuve IDN réduite) ; trois points à confirmer (§ 2.6) ; l'identification de l'article 4 devra respecter ces principes | **partiel** | SU01b, SU01g (A1, A2) |
| Loi 025/2023, art. 72, 73 | Consentement démontrable ; en transaction électronique, acte de volonté univoque, une case à cocher par exemple ; l'acceptation des conditions générales d'utilisation ou de vente n'en est pas un ; retrait à tout moment, droit annoncé avant le consentement | consentements par finalité (huit), versionnés par date, horodatés, révocables ; seule la chaîne de version est conservée, pas le texte accepté | **partiel** : garder le texte ou l'empreinte de chaque version | SU01e |
| Loi 025/2023, art. 74, 81, 188, 190, 193, 194 | Enfant : moins de 18 ans, sauf majorité acquise plus tôt. Accord préalable des parents ; autorisation de l'APDPVP ; profilage interdit ; contrat préjudiciable nul | aucune notion d'âge ; fil chronologique sans profilage | **majeur** | SU01c (A3) |
| Loi 025/2023, art. 81 | NIP (numéro d'un fichier national d'identification) et biométrie de contrôle d'identité : autorisation préalable de l'APDPVP | le NIP est volontairement écarté des preuves IDN | **couvert** tant qu'il n'est pas collecté | A5 |
| Loi 025/2023, art. 81 | Interconnexion de fichiers dont les finalités principales diffèrent : autorisation préalable | la fédération IDN ne transmet que le sujet, le niveau de garantie, la nationalité et le type de profil ; préremplir l'identité par IDN (SU01b) pourrait relever de ce régime | à qualifier | SU01b (A1) |
| Loi 025/2023, art. 204 | Sanctions de l'APDPVP après mise en demeure : suspension de la collecte et du traitement (trois mois, puis définitive) ; amende de 1 à 100 millions FCFA, jusqu'à 300 millions en récidive (5 % du chiffre d'affaires dans la limite de 196 millions pour une entreprise) | — | information : une suspension arrêterait le réseau | — |

### 2.6 Points de minimisation relevés en passant

L'inventaire du 21/10 relève trois points sans les avoir vérifiés. Ils sont à confirmer dans SU01b et SU01g, et à inscrire dans l'inventaire des données :
- la table `session` de Better Auth prévoit l'adresse IP et le navigateur, et rien ne les désactive ;
- la table `account` prévoit les jetons d'accès, de rafraîchissement et l'`id_token` d'IDN, qui peut porter des données d'état civil ; rien ne les écarte ;
- pendant la grâce de 30 jours, l'e-mail et le téléphone restent en clair dans `dataErasureJobs`.

## 3. Les arbitrages juridiques à trancher avant de coder

Chaque arbitrage porte une **proposition de travail** : elle permet de concevoir. Seul le juriste la confirme.

| | Question | Ce que disent les textes | Proposition de travail |
|---|---|---|---|
| **A1** | Identification de tout titulaire de compte et comptes légers | art. 4 : toute personne qui veut agir comme utilisateur « doit obligatoirement s'identifier » (noms, prénoms, domicile, téléphone ; RCCM si assujettie ; pour une personne morale, dénomination, siège, RCCM, capital ; « le cas échéant », identité numérique confirmée, notamment le NIP). L'ADR-0002 permet un compte léger par code à usage unique | identification à l'inscription. IDN préremplit noms et prénoms ; téléphone vérifié par code ; domicile déclaré (ville et quartier, adresse complète si le juriste l'exige) ; RCCM demandé aux comptes qui vendent ; personnes morales identifiées par leur structure PRO.GA. Données séparées du profil, jamais affichées, accès restreint et journalisé ; comptes existants régularisés à la connexion suivante, dans un délai annoncé |
| **A2** | Conservation et effacement effectif | art. 29 : l'hébergeur conserve les données d'identification « dans les conditions fixées par les textes en vigueur » ; art. 31 : il conserve temporairement les contenus signalés et les met à disposition des juridictions ; ordonnance 0012, art. 53 nouveau : coopération avec les autorités | un dossier de conservation séparé, borné par une durée légale, ouvert seulement sur réquisition, avec double validation et journal (patron de l'ADR-0011), purgé à l'échéance. L'effacement du compte efface tout le reste, comme aujourd'hui |
| **A3** | Le régime des 16-17 ans | ordonnance : majorité numérique à 16 ans, compte interdit avant (art. 16, 17). Loi 025/2023 : l'enfant a moins de 18 ans « sauf si la majorité est atteinte plus tôt en vertu de la législation qui lui est applicable » (art. 188) ; collecte et traitement des données d'un enfant licites seulement avec l'accord préalable des parents (art. 74 et 190) et soumis à l'autorisation de l'APDPVP (art. 81, qui renvoie à l'article 74 ; renvois à vérifier, § 0) ; profilage des enfants interdit (art. 193) ; contrat préjudiciable nul (art. 194) | concevoir pour le cas le plus strict : comptes de 16-17 ans avec accord parental enregistré, fil non profilé, aucun contact par une personne non identifiée, ni transaction ni rencontre. Ces règles se relâchent par réglage si le juriste admet que la majorité numérique vaut « majorité atteinte plus tôt » |
| **A4** | La vérification de l'âge avant le référentiel de la HAC | art. 17 applicable aujourd'hui ; art. 20 : référentiel de la HAC à paraître ; art. 22 : vigilance raisonnable, la fausse déclaration ne décharge pas la plateforme ; art. 23 : audit ; art. 53 : mécanisme effectif dans les douze mois | dès maintenant : date de naissance ou tranche déclarée à l'inscription, refus avant 16 ans, signalement « compte d'un mineur ». L'article 22 admet un « consentement parental formellement enregistré » pour un compte de moins de 16 ans, mais l'article 17 n'excepte qu'encyclopédies, répertoires éducatifs, logiciels libres et contenus scolaires : ANTSIA n'en est pas, donc un compte détecté de moins de 16 ans est bloqué, puis supprimé, et le parent peut en obtenir l'effacement (art. 14). Avant l'échéance : mécanisme effectif conforme au référentiel, de préférence une attestation de seuil fournie par IDN, sans conserver de document |
| **A5** | Le NIP | art. 4 : « le cas échéant » ; loi 025/2023, art. 81 : autorisation préalable de l'APDPVP ; délivrance du NIP suspendue | ne pas collecter le NIP ; l'identité IDN tient lieu d'identité numérique confirmée si le juriste l'admet |
| **A6** | La qualité de l'exploitant, des pages et des créateurs | éditeur (art. 25 à 28) et hébergeur (art. 29 à 31) ; manquements punis (art. 45 à 48). L'article 25 vise l'éditeur « professionnel ou non » ; l'article 27 envisage une « personne éditant à titre non professionnel » restée anonyme, dont l'hébergeur relaie le droit de réponse | l'exploitant assume les deux qualités et publie l'identité des deux rôles. Une page ou un créateur peut être éditeur à son échelle : son identification reste privée (art. 4, D08), et ANTSIA relaie les demandes de droit de réponse qui le visent (SU01e) |
| **A7** | Les administrateurs de pages et de groupes, et les utilisateurs | art. 6 : l'utilisateur répond du contenu de son compte et doit le modérer ; art. 7 à 9 : diffusion, amplification et responsabilité solidaire ; art. 11 : l'administrateur répond des contenus illicites de son groupe ou de sa page. Un délai de 24 h après notification, cité par la presse, n'apparaît pas dans l'ordonnance (peut-être dans la loi de ratification) | outils de retrait rapides pour l'administrateur et pour l'auteur sous sa publication ; notification à l'administrateur de tout signalement dans son espace ; règles d'utilisation qui expliquent ces responsabilités |
| **A8** | Le droit de réponse | art. 26 : toute personne citée nommément ; art. 27 : demande dans les trois mois, transmise par l'hébergeur si l'éditeur est anonyme ; art. 47 : insertion sous 48 h, amende de 2 à 20 millions FCFA | formulaire de demande, file opérateur, réponse insérée et liée au contenu avec la même visibilité, chronomètre de 48 h, journal |
| **A9** | Le rapport trimestriel | art. 22 : nombre de comptes de mineurs détectés, bloqués ou supprimés, et méthodes de vérification, à l'« Autorité compétente » | rapport agrégé produit par la console ; destinataire à confirmer (HAC) |
| **A10** | L'information des autorités | art. 30 : informer les autorités compétentes des activités illicites connues ; ordonnance 0012, art. 53 nouveau : coopération, accès aux données dans le respect de la vie privée | procédure écrite : seuils, autorité destinataire, double validation, journal, information de la personne quand la loi le permet |
| **A11** | Le sponsorisé | ordonnance 0013 : la HAC contrôle le contenu des publicités et régule les plateformes | présenter à la HAC les règles du sponsorisé et de la bibliothèque publique (lot SU10) avant ouverture |
| **A12** | Les mesures sur ordre du juge | art. 41 : décision « d'heure à heure » ; art. 42 : suspension, déréférencement, correctif, marquage forcé ; art. 43 : mesure temporaire, caduque sans action au fond dans le mois ; art. 44 : ralentissement, restriction de fonctions, suspension d'accès, 72 h au plus | runbook, canal de notification permanent, preuve d'exécution horodatée, levée automatique à l'échéance |

## 4. Plan de mise en conformité

| Sous-lot | Contenu | Articles | Échéance | Dépend de | Taille |
|---|---|---|---|---|---|
| **SU01a** · Identité et registre | mentions légales complètes (éditeur, directeur de publication, hébergeurs, sous-traitants) ; inscription au registre de la HAC ; contact du représentant légal | 3, 25, 37 ; ord. 0012 art. 54 nouveau | immédiat | informations du propriétaire | S |
| **SU01b** · Identification des titulaires de compte | fiche d'identification privée : NOM en majuscules et Prénoms avec initiale majuscule, par le normaliseur partagé et testé du programme ; domicile ; téléphone vérifié ; RCCM pour les comptes qui vendent ; préremplissage par IDN ; stockage séparé, accès journalisé ; régularisation des comptes existants | 4, 29 | immédiat, après A1 et A2 | A1, A2 ; ADR complétant l'ADR-0002 si besoin | L |
| **SU01c** · Âge et mineurs | âge déclaré à l'inscription et refus avant 16 ans ; régime des 16-17 ans selon A3 ; signalement « compte d'un mineur » ; effacement à la demande du parent ; filtres de recommandation ; rapport trimestriel ; puis vérification effective à l'inscription selon le référentiel de la HAC, et audit | 14, 16-24, 53 | immédiat, puis mi-avril 2027 | A3, A4, A9 ; IDN pour une attestation de seuil | L |
| **SU01d** · Signalements réglementés | nouveaux motifs : cyberharcèlement, contenu préjudiciable impliquant un mineur, hypertrucage me représentant sans mon accord, contenu d'IA interdit, imitation d'une institution, atteinte à la vie privée ou à l'honneur (art. 3, contenu illicite), usurpation d'identité (art. 52) ; accusé de réception automatique sous 24 h et décision notifiée au déclarant sous 72 h, appliqués à tout signalement de harcèlement, puisque le texte ne dit pas si « impliquant un mineur » vise aussi le cyberharcèlement ; retrait sous 24 h pour l'article 33 ; chronomètres, files prioritaires et alertes en console ; indicateurs publiés | 24, 32, 33 | immédiat | modération existante | M |
| **SU01e** · Droits et droit de réponse | demandes datées et authentifiées de rectification, complétion, mise à jour, effacement, restitution ; formulaire et file du droit de réponse, insertion sous 48 h ; information sur la réclamation auprès de la HAC | 12-15, 26, 27, 38, 47 | immédiat | A8 | M |
| **SU01f** · Responsabilités et outils | règles d'utilisation mises à jour ; retrait d'un commentaire sous sa propre publication ; retrait par l'administrateur dans son groupe ou sa page ; notification de l'administrateur ; information au moment d'un relais | 5-11 | immédiat | A7 | M |
| **SU01g** · Conservation et coopération | gel d'un contenu signalé et de ses métadonnées ; conservation bornée des données d'identification ; réquisitions et information des autorités avec double validation et journal ; exceptions à l'effacement documentées dans l'inventaire des données | 29-31 ; ord. 0012 art. 53 nouveau | immédiat, après A2 | A2, A10 | M |
| **SU01h** · Mesures sur ordre | runbook du référé numérique : suspendre un compte ou un contenu, déréférencer (recherche, découverte, projection publique), épingler un correctif, apposer un marquage d'origine, restreindre une fonction pour un réseau, suspendre temporairement ; preuve horodatée ; levée automatique | 39-44 | immédiat | A12 ; console d'exploitation | M |
| **SU01i** · Contenus d'IA | marquage visible, clair et permanent de tout ce que produit iAsted dès SU11 ; métadonnées d'origine conservées, transmises à la HAC sous huitaine sur réquisition ; détection automatique des contenus d'IA publiés par les membres selon le standard à paraître ; interdits de l'article 32 dans les règles | 32-34, 53 | dès SU11, et mi-avril 2027 | standard technique (art. 53) | L |
| **SU01j** · Transparence des espaces qui vendent | chaque page qui vend affiche son responsable, ses règles, les termes de ses transactions et sa politique de données ; appui sur les conditions vendeur V2 (MP05) | ord. 0012 art. 54 nouveau | avec SU04 et SU06 | MP05 | S |

**Ordre** :
- SU01a, SU01b, la déclaration d'âge de SU01c, SU01d et SU01h précèdent toute ouverture publique d'un nouvel univers (vague 2) et l'annonce de particulier (SU07) ;
- SU01i précède l'iAsted du membre (SU11) ;
- la vérification effective de l'âge et la détection des contenus d'IA tiennent l'échéance de l'article 53.

## 5. Ce qui relève du propriétaire (hors code)

- Désigner l'entité éditrice et publier ses informations (art. 25) : dénomination, siège, téléphone, RCCM, capital, directeur de publication, responsable de la rédaction s'il y en a un, hébergeurs et sous-traitants avec leurs coordonnées.
- Faire inscrire ANTSIA au registre national des réseaux sociaux et plateformes que tient la HAC (art. 37) : l'ordonnance n'en fixe pas la formalité, il faut la demander à la HAC. Ouvrir le dialogue prévu aux articles 35 et 36.
- Nommer un représentant légal joignable pour les notifications judiciaires et administratives : le référé numérique se juge « d'heure à heure » (art. 41).
- Dossier APDPVP : déclarations des traitements (inscription, identification, signalements, iAsted, annonces, besoins). S'y ajoutent, si l'arbitrage A3 l'exige, une demande d'autorisation pour les données des 16-17 ans (loi 025/2023, art. 81) ; aucune demande pour le NIP tant qu'il n'est pas retenu.
- Faire trancher par écrit les arbitrages A1 à A12 par un conseil juridique.
- Obtenir le texte de la loi de ratification du 05/10/2026 et suivre la publication du référentiel de la HAC (art. 20) et des textes d'application (art. 54).

## 6. Critères de sortie de SU01

- Chaque ligne du § 2 a un sous-lot, une preuve attendue (test, procédure ou page publiée) et un responsable.
- Les arbitrages A1, A2 et A3 sont tranchés par écrit avant que SU01b et SU01c ne modifient l'inscription.
- Les mentions légales complètes sont publiées et l'inscription au registre de la HAC est faite, ou demandée par écrit si la HAC n'a pas encore ouvert le registre (SU01a).
- Les délais de 24 h et 72 h sont mesurés de bout en bout sur des comptes fictifs, signalement compris, accusé de réception et décision notifiée (SU01d).
- Le runbook du référé numérique est éprouvé sur la démo : suspension, déréférencement, correctif, marquage, levée à l'échéance (SU01h).
- Rien n'est annoncé comme conforme sans sa preuve : la règle de véracité du programme s'applique aux pages publiques de conformité.
