# ANTSIA — Sept univers pour le Gabon

**Étude stratégique : les besoins de la population, une page pour chaque activité, la vie publique dans le réseau national et iAsted pour orienter acheteurs et vendeurs.**

21 octobre 2026 · version 1.1 · **décisions D01 à D08 validées par le propriétaire le 21/10/2026** ([ADR-0035](../../adr/0035-sept-univers-et-vie-publique.md)) ; D09 à D12 proposées · dossier visuel : [ETUDE_SEPT_UNIVERS_ANTSIA.pdf](ETUDE_SEPT_UNIVERS_ANTSIA.pdf) · conformité : [SU01](SU01_CONFORMITE_ORDONNANCE_0011.md)

> **Portée.** Document d'étude. Il ne modifie aucun code, n'active aucune capacité, ne publie rien et ne remplace aucune recette. Il prolonge, sans les réécrire, le plan marketplace accepté le 21 octobre ([ADR-0034](../../adr/0034-marketplace-et-espaces-specialises.md), décisions A01 à A10, lots MP00 à MP14 en cours) et les études du [18 octobre](../2026-10-18-social-commerce/README.md) et du [20 octobre](../2026-10-20-experience-sociale-responsive/README.md). Le dossier `2026-10-21-marketplace-specialites` reste réservé à la session marketplace ; cette étude n'y écrit rien.

> **Règle de véracité.** L'existant est décrit tel que le code et les ADR le montrent ; « en source » ne veut pas dire « vérifié en production ». Toute proposition est nommée comme telle. Chaque chiffre externe est daté et sourcé ; aucun chiffre d'usage d'ANTSIA n'est avancé, faute de mesure.

> **Fabrication.** Ce fichier, le PDF et les schémas sont produits par `source/build.py` à partir des mêmes données (`source/donnees*.py`) ; modifier les données puis relancer `python3 source/build.py all` garde les deux documents d'accord.

---

## 0. La décision en une page

**Faut-il partir dans cette stratégie ? Oui**, en ouvrant d'abord les univers qui ne demandent ni paiement ni preuve de majorité, et en faisant d'iAsted un service d'orientation gratuit pour le membre.

1. **Trois piliers.** ANTSIA réunit le divertissement qui fait revenir chaque jour, le business qui fait vivre et la vie publique qui informe et rassure.
2. **Sept univers business**, choisis d'après ce qui circule déjà sur les réseaux au Gabon : boutiques ; immobilier et foncier ; emploi et talents ; alimentation et restauration ; services et artisans ; auto et mobilité ; cérémonies et sorties.
3. **Un business = une page.** La page porte l'identité ; l'activité y active les espaces métier dont elle a besoin ; une entité responsable se tient derrière. Quand l'activité grandit, PRO.GA la gère et ANTSIA devient un canal de vente parmi d'autres.
4. **Le particulier n'a pas besoin de page** pour vendre son frigo ou louer son studio : il publie une annonce ; s'il publie souvent, ANTSIA lui propose de « passer pro ».
5. **La vie publique a ses places réservées** : pages Officielles reflétées depuis administration.ga, agents publics volontaires, médias labellisés, annonceurs étiquetés — jamais confondus.
6. **iAsted devient l'assistant du membre** : il comprend un besoin, trouve les offres publiées, prépare le contact, la visite ou la commande ; la personne confirme toujours.
7. **On ouvre d'abord ce qui n'exige pas de paiement en ligne**, et l'on se conforme dès la conception à l'ordonnance 0011/PR/2026. Billetterie et rencontres attendent leurs conditions externes.

> **Le contexte de 2026.** Les réseaux sociaux sont suspendus par la HAC depuis le 17 février 2026 (statut au 21 octobre incertain) et l'ordonnance 0011/PR/2026 encadre désormais les plateformes, ANTSIA compris. C'est une fenêtre, et un risque : ANTSIA doit gagner par l'utilité et la confiance, jamais comme réseau de remplacement d'une censure.

**Ce que l'étude garde, ce qu'elle ajoute.** Elle garde le plan marketplace validé le 21 octobre (ADR-0034, A01 à A10, lots MP00 à MP14 en cours) : une page par activité, PRO.GA maître du commerce, préparer, publier et encaisser séparés. Elle ajoute quatre univers (immobilier et foncier, alimentation et restauration, auto et mobilité, cérémonies et sorties), l'annonce de particulier, les espaces de la vie publique, la chaîne de confiance d'État, la conformité à l'ordonnance 0011 et l'entrée d'iAsted dans ANTSIA. Les rencontres, déjà conçues (MP10–MP11), sont rangées dans le pilier Divertissement et restent fermées.

**La formule : « Une page pour exister, des espaces pour vendre, PRO.GA pour gérer. »**

Les douze décisions sont détaillées au [§ 18](#18-les-décisions-à-prendre) ; D01 à D08 sont validées et consignées dans l'[ADR-0035](../../adr/0035-sept-univers-et-vie-publique.md).

---

## 1. Méthode et sources

**Ce qui a été lu (sources locales).**
- Le code d'`apps/antsia_ga` (routes, navigation, i18n), les modules du moteur (`convex/modules/*`), les ADR 0001 à 0034, le cahier des charges ANTSIA, les études du 18, du 20 et du 21 octobre et leur fichier d'exécution.
- PRO.GA : modules (`catalog`, `agenda`, `quotes`, `orders`, `recruiting`, `payments`, `commercialAgent`, `iasted`, `needs`…), documents 03, 05, 18 à 30 et recherches sur le Gabon (`docs/recherches_gabon`).
- Le socle administration.ga : doctrine de communication publique, producteur et outbox de fédération (PA9D), iAsted du socle.
- L'inventaire d'iAsted dans tout le programme (socle, PRO.GA, DIASPORALE, plan iAsted 2.0).

**Ce qui a été cherché (sources externes, 21 octobre 2026).** Données numériques et économiques sur le Gabon ; ce qui se vend et s'échange sur les réseaux sociaux gabonais ; plateformes déjà présentes ; cadre juridique (réseaux sociaux, données personnelles, communication, foncier, emploi) ; benchmark de plateformes étrangères (identité business, places de marché verticales, États et médias sur les réseaux, agents IA d'achat, réseaux nationaux). Liste au [§ 19](#19-sources).

**Comment on a choisi.** Douze univers candidats ont été notés de 1 à 5 sur cinq critères d'opportunité et un critère de réemploi (§ 3). Les notes sont des jugements fondés sur les sources : elles ordonnent, elles ne prédisent pas. Elles doivent être revues après six mois de mesures réelles.

**Limites.** Aucune enquête de terrain. Aucun volume d'annonces n'est publié pour le Gabon : les flux sont décrits qualitativement. Le quota de recherche web de la session a été atteint en fin de travail ; restent non vérifiés : le statut de la suspension au 21 octobre, les audiences YouTube et TikTok, les règles de publicité politique en ligne, le coût des cérémonies, la billetterie et les pièces détachées, l'adressage, le prix du foncier au mètre carré, et la plateforme publique PROXIGAB (lancée le 2 octobre 2026, page inaccessible).

---

## 2. Le constat : ce que les Gabonais font déjà en ligne

![Le Gabon numérique en chiffres](schemas/02-constat-chiffres.svg)

{{SUSPENSION}}

### 2.1 Chiffres clés

{{TABLE_CHIFFRES}}

Repères complémentaires : environ 132 transactions de mobile money par habitant et par an, pour une valeur moyenne d'environ 10 900 FCFA (calcul de l'étude, BEAC et DataReportal) ; dans la CEMAC, le paiement marchand moyen est de 2 049 FCFA et l'USSD reste le canal dominant (BEAC 2024) ; le couloir Cameroun–Gabon représente 56 % des transferts intra-CEMAC en nombre. Les audiences des réseaux sociaux datent d'octobre 2025, **avant** la suspension : l'usage actuel passe par VPN et n'est pas mesuré.

### 2.2 Ce qui circule, et ce qui fait mal

{{TABLE_CIRCULATION}}

Quelques preuves datées : une vendeuse de poisson et de vêtements « nourrit sa famille » grâce aux réseaux (RFI, 19/02/2026) ; un restaurateur de Libreville y trouvait environ 40 % de ses clients (BBC, février 2026) ; une agence d'import de véhicules a vu ses ventes s'effondrer avec la coupure (Le360, 25/03/2026) ; des communiqués de GOC, Comilog, Sogara, Ceca-Gadis et d'autres mettent en garde contre de faux recrutements payants ; dans le Grand Libreville, la régularisation foncière de masse délivre depuis le 16/02/2026 un titre à 600 000 FCFA pour une parcelle de 0 à 2 000 m², avec 16 811 dossiers traités au 23/05/2026 (Gabonreview).

### 2.3 Les plateformes déjà présentes

| Secteur | Plateformes | Ce qu'il faut retenir |
|---|---|---|
| Petites annonces | **CoinAfrique Gabon** (groupe Autochek) | actif en octobre 2026 sur toutes les catégories : le concurrent direct le plus sérieux |
| Immobilier | ImmoDem, Gabaho, Cabalou (meublés), Le Visiteur Booking, Expat.com | aucun portail dominant |
| Emploi | PassEmploi241 (PNPE), GoAfricaOnline, petites annonces de L'Union, LinkedIn | intermédiation publique jugée peu fiable par la Présidence le 29/09/2026 |
| Mobilité et livraison | Gozem, Yango (pré-lancement), Taxi Gab+, Ndzéla, CNT ; Yoboresto, FastBox ; Express Courrier | terrain occupé : partenariats plutôt que service maison |
| Commerce en ligne | **Jumia absent** du Gabon ; quelques boutiques locales | pas de leader du e-commerce |
| Autres | Le Pratique du Gabon (annuaire), Necro Gabon (avis de décès), PROXIGAB (plateforme publique pour entrepreneurs, à vérifier) | à articuler, sans copie de données |
| Rencontres | aucune plateforme locale identifiée | arnaques sentimentales et sextorsion sur les réseaux généralistes |
| Paiement | Airtel Money, Moov Money, applications bancaires | 3,92 millions de comptes de mobile money (2024), aucun séquestre identifié |

### 2.4 Le cadre juridique qui s'applique à ANTSIA

| Texte | Ce qu'il impose | Conséquence pour ANTSIA |
|---|---|---|
| **Ordonnance n° 0011/PR/2026** du 26/02/2026 (JO n° 110), ratifiée le 05/10/2026 | vise toute plateforme de « mise en relation […] en vue de la vente d'un bien, de la fourniture d'un service » ; identification des utilisateurs (art. 4) ; responsabilité des administrateurs de pages et de groupes (art. 11) ; majorité numérique à 16 ans et vérification d'âge (art. 16-24) ; cyberharcèlement d'un mineur : 24 h et 72 h (art. 24) ; retrait des hypertrucages en 24 h (art. 33) ; registre de la HAC (art. 37) ; référé numérique et suspension plafonnée à 72 h (art. 39-44) ; amendes de 5 à 50 millions FCFA ; 12 mois pour la vérification d'âge et le marquage de l'IA (art. 53) | ANTSIA est visé deux fois (réseau social et plateforme de vente) : conformité à concevoir maintenant (lot SU01) |
| **Ordonnances n° 0012 et 0013/PR/2026** | communication numérique dans le Code de la communication ; statut de « professionnel de la communication numérique » et d'« assimilé » ; la HAC régule les plateformes et la publicité | vendeurs-créateurs actifs sur ANTSIA possiblement « assimilés » ; conditions des transactions à publier ; sponsorisé sous le regard de la HAC |
| **Loi n° 025/2023** (données personnelles, APDPVP) | consentement démontrable et explicite (l'acceptation des CGU ne vaut pas consentement, art. 72) ; enfant = moins de 18 ans (art. 188) ; données d'enfants : accord préalable des parents (art. 74, 190) et autorisation de l'APDPVP (art. 81) ; profilage des enfants interdit (art. 193) ; autorisation préalable pour traiter le NIP ou la biométrie (art. 81) ; suspension du traitement et amende de 1 à 100 millions FCFA, jusqu'à 300 millions en récidive (art. 204) | dossier APDPVP pour annonces, besoins et iAsted ; pas de NIP sans autorisation ; régime des 16-17 ans à arbitrer (voir SU01) |
| **Loi n° 025/2021** (transactions électroniques), **loi n° 027/2023** (cybersécurité) | commerce électronique, écrit électronique ; sécurité | conditions de vente, preuves et sécurité des parcours |
| **Loi n° 006/2017** (agents immobiliers) | autorisation d'exercer, carte professionnelle ; application jugée peu avancée | label « Agent autorisé » possible par attestation |
| Foncier : régularisation de masse (2026), guichet unique en projet | titres délivrés par l'administration ; cadastre incomplet | « Document contrôlé » seulement par convention avec le service foncier |
| Identité : NIP (2024) | délivrance suspendue depuis plusieurs mois, relance discutée le 27/09/2026 | IDN reste la porte d'identité ; le NIP ne peut pas fonder seul la vérification |
| Paiement et tontines | relèvent des établissements agréés (BEAC, COBAC) | aucun fonds porté par ANTSIA ; tontines écartées |

### 2.5 Ce que le constat implique

{{LIST_ENSEIGNEMENTS}}

---

## 3. Choisir les sept univers

{{METHODE_NOTATION}}

{{TABLE_CANDIDATS}}

{{NOTATION_NOTE}}

![Matrice de priorisation](schemas/03-matrice-priorisation.svg)

**Pourquoi ces sept, et pas les autres.**
- **Retenus** : les quatre premiers ; à égalité (17), les services et les cérémonies plutôt que la mobilité, confiée à des partenaires ; l'automobile (16), forte en revenus et demandée (location de voitures) ; les terrains rejoignent l'immobilier, avec vérification du titre.
- **Livraison et VTC** : une capacité commune assurée par des partenaires (Gozem, Yango, Taxi Gab+, coursiers), pas un univers ni un VTC maison.
- **Administration** : un pilier, la vie publique, pas un univers marchand.
- **Rencontres** : rangées dans le pilier Divertissement et fermées jusqu'à une preuve de majorité ; risque réglementaire maximal (ordonnance 0011, loi 025/2023, sextorsion), aucun revenu puisque le citoyen ne paie pas. Le choix du propriétaire (rencontres professionnelles et personnelles séparées, MP10–MP11) est conservé.
- **Tontines et cagnottes** : écartées tant qu'un établissement agréé ne porte pas les fonds ; les cagnottes de cérémonies pourront venir avec lui.

**Lecture de la matrice.** Boutiques, emploi et services s'ouvrent d'abord : le code existe en source (MP04–MP06, P15, MP09). La restauration est un gabarit sur la boutique existante. Immobilier, auto et terrains demandent plus de travail : nouveaux types d'offre, location de ressources, vérification foncière et des cartes grises par conventions.

---

## 4. ANTSIA en trois piliers

![Les trois piliers d'ANTSIA](schemas/01-trois-piliers.svg)

Un réseau social national ne réussit pas par une seule fonction : il lui faut **une raison de revenir** (le divertissement), **une raison d'y gagner sa vie** (le business) et **une raison d'y faire confiance** (la vie publique).

| Pilier | Rôle | Ce qui existe déjà | Ce que l'étude ajoute |
|---|---|---|---|
| **Divertissement** (jaune) | faire revenir chaque jour | Fil, Clips, Stories, directs et conférences, groupes, évènements, Messages et appels ; rencontres (fermées) | vente en direct (vague 5), créateurs invités au pilote |
| **Business** (vert) | vivre de son activité | Marketplace (Produits, Boutiques, Services), boutiques et prestataires, emplois, réseau pro (sources MP01 à MP09, P15) | sept univers, annonce de particulier, immobilier et foncier, restauration, auto et mobilité, cérémonies et sorties |
| **Vie publique** (bleu) | s'informer, faire confiance | pages Officielles fédérées, agents publics volontaires, presse et sites médias (sources PA9, MP12–MP13) | alertes officielles, label Presse, sponsorisé étiqueté, règle politique, liens vers demarche.ga et travail.ga |

**iAsted** traverse les trois piliers. **Le socle de confiance** les porte tous : badges calculés côté serveur (Officiel · Vérifié · Agent public · Communauté), modération nationale, données au Gabon, consentements horodatés. Les trois couleurs du drapeau servent de code dans tout le dossier ; ce sont celles du thème Gaboma (`packages/ui/src/themes/antsia.css` : `#007E4D`, `#F4BB44`, `#2F67B5`).

### La roue de croissance

![La roue de croissance](schemas/06-roue-de-croissance.svg)

Le divertissement amène le public ; le public attire les vendeurs ; les demandes et les ventes produisent des revenus professionnels ; ces revenus financent les vérifications, la modération et les créateurs ; la confiance qui en résulte fait revenir le public. La vie publique alimente directement la confiance : on vient lire un communiqué, consulter un concours, suivre une alerte.

**Démarrer la roue** : une zone pilote (Grand Libreville : Libreville, Akanda, Owendo, Ntoum) ; des contenus réels dès l'ouverture (reflets des administrations, membres de DIASPORALE déjà inclus, médias partenaires, créateurs invités) ; des vendeurs pilotes consentants dans chaque univers ouvert ; un usage fondateur du quotidien : trouver un logement sans démarcheur, un emploi sans arnaque.

**Ce qui arrête la roue** : une vague d'arnaques ; un univers ouvert mais vide (aucune tuile n'est montrée tant que l'univers n'a pas d'offres réelles, règle « aucun alias vide » de l'ADR-0034) ; la propagande ou la publicité envahissante ; la lenteur sur réseau mobile (cible indicative du cahier : moins de 1,5 s au 95e centile en 3G).

---

## 5. Les sept univers, fiche par fiche

![Les sept univers](schemas/04-sept-univers.svg)

Une action principale par univers : acheter, visiter, candidater, commander, demander un devis, louer, réserver — jamais un faux bouton d'achat pour une offre sur devis. Sont communs aux sept : une page et une entité responsable, une offre typée, le contact dans Messages, iAsted, les badges et vérifications, PRO.GA derrière, la livraison par partenaires et le paiement protégé quand un prestataire agréé sera contracté.

{{FICHES}}

**Hors des sept univers, et à leur service.**
- **Livraison et colis** : partenaires (coursiers, Gozem, Yango, Express Courrier), proposés au moment de commander ; pas de flotte ANTSIA.
- **Paiement protégé** : fonds reversés après réception (modèle P12), par un établissement agréé ; fermé tant qu'aucun contrat n'existe.
- **Avis vérifiés** : seulement après un engagement réel (achat, visite, prestation, billet).
- **Signalement** : un bouton sur chaque offre ; file prioritaire pour les arnaques et les mineurs.

---

## 6. Ce qui se fait ailleurs

![Où se placent les plateformes](schemas/05-benchmark-modeles.svg)

{{BENCHMARK_CHAPO}}

{{TABLE_BENCHMARK}}

**Dix leçons pour ANTSIA.**

{{LIST_LECONS}}

**Ce que les plateformes ont abandonné, et pourquoi.** Meta a retiré les offres d'emploi (2022, hors États-Unis et Canada), la vente en direct (2022-2023), les flux auto et immobilier de Marketplace (2021) et le paiement dans les boutiques (2025) : trop lourds à exploiter, retour à la découverte et à la publicité. Google a fermé les sites générés depuis la fiche et sa messagerie (2024), pour faible engagement. LinkedIn a remplacé son onglet produits et services (2014) par des pages de marque. ChatGPT a revu son achat intégré en mars 2026 : les marchands préfèrent leur propre parcours. Zalo a imposé frais et conditions en bloc fin 2025 : chute dans les classements et amende en 2026. **La leçon : peu d'univers, des critères d'arrêt fixés d'avance, le courage de fermer ce qu'on exploite mal.**

---

## 7. Un business, une page ? La réponse

### 7.1 Trois modèles comparés

![Trois modèles](schemas/07-trois-modeles-page-boutique.svg)

| Modèle | Principe | Avantage | Limites |
|---|---|---|---|
| **A. Page + boutique séparées** | deux objets, deux noms, deux audiences | présentation libre de la boutique | abonnés et avis dispersés ; deux identités à vérifier et à modérer ; le client ne sait pas à qui écrire |
| **B. Page configurée en boutique, un seul métier** | la page *est* la boutique | très simple à expliquer | un seul métier par page ; onglets vides pour un média ou une mairie ; vendre et recruter proprement est impossible |
| **C. Une page, des espaces, un système** | la page porte l'identité ; elle active des espaces métier ; PRO.GA gère derrière | une identité, une confiance, un seul fil ; on active ce que l'on fait vraiment ; on grandit sans changer d'adresse ; PRO.GA garde stock, prix et engagements | plus de règles à tenir côté serveur (déjà prévues : capacités, politique graduée, contrats) |

**La réponse à la question posée.** Pour le public, **c'est une page qui se configure selon son métier** : boutique, agence, loueur, restaurant. Elle porte une seule identité et active des espaces métier, chacun avec sa propre navigation (un vrai site, avec « Retour à ANTSIA ») et sa propre admission (préparer, publier, encaisser restent trois étapes, ADR-0034). Derrière, une **entité responsable** : la personne, ou la structure PRO.GA qui détient catalogue, stock et engagements. Le benchmark confirme ce découpage en trois couches — entité vérifiée, page publique, modules — : aucune grande plateforme ne fait de la boutique une identité séparée.

Ce choix a déjà été retenu le 21 octobre pour les boutiques, les services et les médias (ADR-0034, décision A01 : « Une page sociale par activité ; capacités produits, services et média combinables »). **L'étude propose de l'étendre aux sept univers** (D02) en ajoutant les espaces Biens, Location, Billetterie et les gabarits correspondants. Une entité qui mène plusieurs activités distinctes peut avoir plusieurs pages, sous la même vérification.

**Exemples.** Une couturière : Boutique (pagnes, tenues) et Prestations (retouches). Une agence : Biens, puis Emplois quand elle recrute. Un loueur : Location, puis Boutique de pièces. Un traiteur : Boutique en gabarit Restauration (menu) et Prestations (évènements). Un média : sa page et son site éditorial, jamais de panier par défaut. Une administration : une page Officielle reflétée depuis administration.ga, jamais une capacité marchande par simple choix de modèle.

### 7.2 À quel moment une page, à quel moment un système

![L'échelle de l'activité](schemas/08-echelle-activite.svg)

| Marche | Quand | Ce que l'on obtient | Ce qui reste fermé |
|---|---|---|---|
| **0 · Particulier** *(proposé)* | un besoin ponctuel | une annonce dans son univers, le contact par Messages, la visibilité choisie | encaissement, mise en avant, badge d'entreprise |
| **1 · Page d'activité** | on publie souvent pour une activité | une identité, des abonnés, des publications, des Stories, des directs | la vente tant qu'aucun espace n'est activé |
| **2 · Page + espaces** | la première offre | les espaces métier du gabarit choisi, les demandes, les devis, les rendez-vous | l'encaissement sans admission ni prestataire |
| **3 · Page + PRO.GA** | on encaisse, on gère un stock ou des salariés | stock, devis, agenda, commandes, factures, RH, encaissement ; ANTSIA devient un canal parmi d'autres | — |

Les **institutions** et les **médias** ne montent pas cette échelle : leur confiance vient d'une autorité (fédération signée depuis administration.ga) ou d'une rédaction (habilitations, corrections), pas d'un abonnement. Les déclencheurs reprennent la matrice de PRO.GA (`docs/05_PACKS_MODULES_ET_VERTICALES_PRO_GA.md` § 5) : première offre publiée → module `needs` recommandé ; vente de produits physiques → `inventory` ; vente sur rendez-vous → `agenda` ; premier salarié → `hr` et `compliance` requis. Pour PRO.GA, « la vente en ligne n'est ni un pack ni une verticale : c'est un canal » ; ANTSIA est ce canal.

### 7.3 Proposition : l'annonce de particulier (D03)

Aujourd'hui, toute offre d'ANTSIA appartient à une boutique rattachée à une page, et le commerce a pour autorité PRO.GA (ADR-0018). Or une grande part de ce qui circule vient de particuliers : un frigo à vendre, un studio à louer, une voiture d'occasion. Leur imposer une page et une structure PRO.GA serait absurde ; les laisser ailleurs serait renoncer à ces flux.

- Une **annonce** est une publication typée (univers, prix, lieu approximatif, photos, attributs), rattachée à la personne, **sans page ni PRO.GA** : ni stock, ni commande, ni encaissement, seulement une mise en relation. L'autorité commerciale de PRO.GA n'est donc pas contournée.
- **Quotas** par univers et par mois ; **catégories encadrées** : vendre un terrain exige l'identité Vérifiée ; publier une offre d'emploi exige une page employeur ; les catégories interdites (médicaments, armes, espèces protégées, documents officiels…) sont refusées.
- **Contact** par Messages en demande filtrée (patron du contact commercial P10), signalement et blocage ; **retrait automatique** à échéance.
- **« Passer pro »** : au-delà d'un seuil, ANTSIA propose de créer une page ; elle reprend les annonces actives, sans perte d'audience. Avec 62,9 % d'entreprises informelles, c'est une porte de formalisation vers PRO.GA (et son exigence de RCCM, ordonnance 0011, art. 4).
- Données : `networkId`, limitation de débit, modération, export et effacement comme toute table sociale.

### 7.4 Anatomie d'une page d'activité

![Anatomie d'une page d'activité](schemas/09-anatomie-page-activite.svg)

1. **La page sociale** : nom, logo, badge calculé, Suivre, Écrire ; Publications, Stories, Directs, À propos ; abonnés, avis, Messages.
2. **Le gabarit de spécialité** : il règle les blocs, les attributs et les actions, **jamais les droits ni les badges** (règle déjà écrite dans l'assistant d'activité : « Ce choix adapte la présentation, sans modifier vos droits ni la nature de votre page »).
3. **Les espaces métier** : Boutique, Prestations, Emplois, Média (existent en source) ; Biens immobiliers, Location, Billetterie (proposés).
4. **PRO.GA** : catalogue, variantes, prix, stock, devis, agenda, commandes, factures, recrutement, paiements. ANTSIA affiche une projection publiée (`PRO-COMMERCE-PUBLIC-V1`) et envoie des commandes privées (`PRO-COMMERCE-COMMAND-V1`) ; il ne recopie ni prix ni stock.

{{TABLE_GABARITS}}

Selon la règle de PRO.GA, **un gabarit est une donnée** (vocabulaire, champs, modèles, scénarios de l'agent), pas un module : « si deux secteurs différents en ont besoin, c'est un module ; si ce n'est que du vocabulaire, des champs et des modèles, c'est une verticale ». D'où une conséquence d'architecture : la **location de ressources** (créneau + caution) sert aux voitures, au matériel de cérémonie, aux salles et aux meublés ; c'est un module partagé, pas une particularité de l'auto.

---

## 8. Le modèle commun : l'offre, le besoin et les actions

![L'offre et le besoin](schemas/10-offre-et-besoin.svg)

**Une offre typée commune** : titre, photos, vidéo ; prix qualifié (fixe, « à partir de », sur devis — jamais un faux prix payable) ; lieu approximatif (province, ville, quartier) ; auteur (page ou particulier) ; état, révision, retrait ; confiance (badges et vérifications). Chaque type ajoute ses attributs et son action :

| Type | Attributs propres | Action |
|---|---|---|
| Produit (dont menu de restauration) | variantes, stock indicatif, retrait ou livraison | Acheter, commander |
| Prestation | zone, durée, forfait, agenda | Demander un devis, prendre rendez-vous |
| Bien immobilier *(proposé)* | type, pièces, surface, loyer ou prix, caution, avance, document foncier | Demander une visite |
| Véhicule *(proposé)* | modèle, année, kilométrage, tarif par jour, chauffeur, caution | Louer, acheter |
| Emploi | poste, contrat, lieu, date limite | Candidater |
| Billet *(proposé)* | date, lieu, catégorie de place, jauge | Réserver |

**Pourquoi un seul modèle.** Une recherche, un index et des facettes par type : c'est la base de la marketplace MP03–MP04 et du contrat catalogue V2 (taxonomie versionnée, attributs typés, facettes allowlistées). Les mêmes règles de confiance, de retrait et de modération valent partout. iAsted n'a qu'un langage à comprendre.

**Le besoin, symétrique de l'offre.** « Je cherche une maison 3 chambres à Akanda » : univers, critères, budget, zone, échéance. Privé par défaut ; publié en « avis de recherche » seulement par un geste explicite et sans coordonnées. Il crée une alerte : une offre compatible publiée plus tard prévient la personne. PRO.GA modélise déjà le besoin B2B d'une structure (module `needs` : brouillon → publié → rapprochement → discussion → devis → accepté → clos ; rang « organique » sans score payé ni signal privé) ; il manque **le besoin du particulier**, côté ANTSIA.

**Le profil de rencontre n'est jamais une offre** : il n'entre ni dans l'index, ni dans iAsted acheteur, ni dans PRO.GA (finalité séparée, MP10).

### Un parcours type : louer une maison

![Parcours type](schemas/11-parcours-louer-maison.svg)

| Étape | Ce que voit la personne | Ce qui se passe derrière |
|---|---|---|
| 1 · Demande | elle écrit ou dit son besoin à iAsted | iAsted extrait univers, critères, budget, zone |
| 2 · Résultats | cinq biens, avec badges et raisons du classement | index public des offres admissibles ; sponsorisé à part |
| 3 · Choix | « Demander une visite » sur deux biens | confirmation explicite : aucune action sans elle |
| 4 · Contact | la demande arrive à l'agence dans Messages | contact commercial filtré (P10), sans relation préalable |
| 5 · Organisation | créneau, dossier, bail | agenda et documents dans PRO.GA si l'agence l'utilise |
| 6 · Après | avis vérifié après la visite ou le bail | avis lié à un engagement réel |

Garde-fous : signaler et bloquer à chaque étape ; aucun paiement demandé sans reçu ni engagement tracé (la parade aux « frais de visite » des démarcheurs) ; « Document contrôlé » quand l'attestation foncière existe ; iAsted ne contacte personne sans confirmation.

---

## 9. La vie publique : administrations, agents, médias, annonceurs

administration.ga est le réseau **fermé** des agents publics. Les mêmes administrations doivent parler à **toute la population** : ANTSIA leur réserve une place, à côté des médias et des annonceurs, sans jamais les confondre. Le cahier d'ANTSIA l'exige déjà : « Lire l'information officielle des administrations et des postes consulaires au même endroit que la vie de la communauté, sans jamais les confondre ».

![Espaces réservés du fil](schemas/12-vie-publique-fil.svg)

{{TABLE_VIE_PUBLIQUE}}

### 9.1 Les pages Officielles et la chaîne de publication

![De administration.ga à ANTSIA](schemas/13-federation-administration.svg)

La chaîne existe en source (lots PA9A à PA9D, ADR-0013 à 0016) :
- le socle possède un producteur et une outbox ; une publication n'est diffusée que si son signataire coche « Diffuser aussi sur ANTSIA », jamais par défaut (arbitrage A7 du cahier) ;
- le contrat `RESEAU-PUBLIC-V1`, transporté par `FEDERATION-INBOX-V1`, est signé, versionné, idempotent et rejouable ; une révision ancienne ne ressuscite pas un retrait ;
- ANTSIA crée ou actualise la page institutionnelle Officielle dans le réseau `administration` (miroir, enfant de la racine) ; ses publications rejoignent le fil racine avec la pastille « Administration » et sont lisibles sans compte ;
- aucun profil, aucune identité, aucune adhésion ni aucun signataire n'est créé d'office ; la modération locale d'ANTSIA est conservée ;
- un agent public n'existe dans ANTSIA que s'il donne son accord (grant renouvelable, code à usage unique, attestation signée) ; le badge Agent public disparaît avec l'attestation.

**État** : code raccordé ; configuration réelle, preuve d'échange signé et recette croisée restent à faire (ADR-0013 à 0016, « vérifications différées »).

**Ce que l'étude ajoute** *(proposé)* :
- une catégorie **Alerte** réservée aux pages Officielles (coupures d'eau ou d'électricité, intempéries, santé publique, résultats d'examens), en tête du fil, en nombre limité, avec notification ;
- les liens **« Faire la démarche »** vers demarche.ga et **« Voir l'offre »** vers travail.ga, sans copier leurs données ;
- les **concours et recrutements publics** rejoignent l'univers Emploi, étiquetés Officiel ;
- la **neutralité** : une page Officielle informe ; elle ne fait ni campagne ni publicité. Le badge se retire quand l'attestation tombe ; les comptes publics abandonnés sont archivés (leçon des « comptes zombies » chinois et vietnamiens). La doctrine de communication publique du programme s'applique : aucun chiffre d'usage non mesuré, aucun service non ouvert présenté au présent.

### 9.2 Les médias et le label Presse *(proposé, D06)*

Les médias ont déjà leur page sociale et leur site éditorial dans ANTSIA (MP12–MP13 : une, rubriques, articles, auteurs, rédaction, versions publiées, corrections). Un média plafonne au badge Vérifié ; le badge Officiel reste réservé aux institutions (ADR-0034, décision 7). Proposition : un **label Presse calculé** à partir d'une attestation d'enregistrement du titre auprès de l'autorité compétente (à confirmer : HAC ou ministère), transmise par contrat signé, retirée avec l'attestation. Les médias de service public peuvent être signalés comme tels, selon des critères publiés et avec droit d'appel (leçon de Meta en 2020 et de l'échec de X en 2023).

### 9.3 Les annonceurs et le sponsorisé *(proposé, D06, D10)*

Le cahier prévoit une monétisation **B2B, étiquetée, jamais dans la messagerie, à densité plafonnée** (EXF-AN-52, lot A6). Règles proposées : « Sponsorisé · payé par … » sur chaque carte ; annonceur vérifié ; densité plafonnée (repère de travail : au plus une carte sur dix, à fixer après mesure) ; **bibliothèque publique de toutes les annonces** (qui, quoi, quand, pour quelle zone), au niveau du registre exigé en Europe par l'article 39 du DSA ; aucun ciblage sur des données sensibles, les Messages, les achats, les candidatures ou les rencontres ; mises en avant étiquetées « Mis en avant », sans remplacer le classement organique. La HAC régule la publicité (ordonnance 0013) : ces règles se présentent à elle.

### 9.4 La règle politique *(proposé, D07)*

ANTSIA est porté par un programme d'État ; sa crédibilité dépend de sa neutralité. Pas de **publicité politique payante** (TikTok l'interdit depuis 2019 ; Meta et Google l'ont arrêtée dans l'Union européenne en 2025) ; pages de partis et d'élus permises, étiquetées « Politique », soumises aux règles communes et renforcées en période électorale ; les pages Officielles ne font pas campagne ; un agent public s'exprime en son nom ; rapport de transparence périodique (prévu au cahier, EXF-AN-51). Aucune règle gabonaise spécifique de la publicité politique en ligne n'a été trouvée : à faire valider par le juridique et la HAC.

---

## 10. La chaîne de confiance

![La chaîne de confiance](schemas/14-chaine-de-confiance.svg)

| Ce qui est vérifié | Par qui | Ce que voit le public | État |
|---|---|---|---|
| La personne | IDN, niveau de garantie ≥ 2 | Vérifié | existe |
| Le rôle d'agent public | administration.ga, avec l'accord de l'agent | Agent public | en source |
| L'institution | fédération signée du socle | Officiel | en source |
| L'entreprise | PRO.GA : structure, RCCM, NIF | Entreprise vérifiée | proposé |
| L'agent immobilier | autorisation d'exercer (loi 006/2017) | Agent autorisé | proposé |
| Le bien ou le terrain | service foncier compétent | Document contrôlé | proposé |
| Le véhicule | service des cartes grises | Carte grise contrôlée | proposé |
| Le média | attestation d'enregistrement | Presse | proposé |
| L'avis client | achat, visite ou prestation réalisés | Avis vérifié | proposé |

**Principe** : calculé à chaque affichage côté serveur, délivré par l'autorité compétente, retirable à tout moment, **gratuit** — comme les quatre badges actuels (ADR-0002 : « aucun champ déclaratif ne les porte »). On vend la visibilité et les outils, jamais le badge (contre-exemples : badge d'identité lié à un forfait payant chez Jiji, vérification vendue par abonnement chez Meta). Un badge reste un signal, pas une garantie : il est présenté comme tel.

**Le différenciateur.** Sur un réseau étranger, n'importe qui peut prétendre vendre un terrain. Sur ANTSIA, une annonce peut afficher « Document contrôlé » parce que le service foncier l'a attesté par contrat signé. **C'est la vie publique qui rend le business sûr.** Ces attestations demandent des conventions (D09) ; elles passent par la fédération entrante (contrats signés, jamais de lecture de base).

---

## 11. iAsted : l'assistant qui oriente, trouve et prépare

![iAsted dans ANTSIA](schemas/17-iasted-architecture.svg)

### 11.1 Ce qui existe

iAsted n'est pas un produit unique : c'est **le nom de l'assistant IA transversal du programme**, porté par plusieurs implémentations (note du vault `30-TRANSVERSE/iasted.md`). La promesse est partout la même : il prépare, explique et propose ; l'humain confirme tout engagement ; il n'invente rien ; il ne lit que ce que l'utilisateur a le droit de lire.

| Où | Ce qui existe (lu dans le code, non exécuté) |
|---|---|
| **PRO.GA — agent commercial** (`convex/modules/commercialAgent`) | un agent par structure, sur son site public ; réponses à partir des seules sources approuvées ; offres d'une liste approuvée à version figée, prix issus de ces offres ; outil `create_lead` fermé par défaut, ouvert par une autorisation qui expire, idempotent et soumis à quota ; transfert à un humain ; activation impossible sans corpus approuvé |
| **PRO.GA — assistant personnel et de structure** (`convex/modules/iasted`, `itravail`) | outils fermés par défaut, aucune mutation métier (« l'assistant prépare, l'humain envoie ») ; `confirmEngagingActions: v.literal(true)` imposé par le schéma ; mémoire limitée à ce que la personne écrit ou accepte ; purges automatiques ; journal sans contenu |
| **PRO.GA — besoins** (`convex/modules/needs`) | besoin d'achat B2B d'une structure ; recherche plein texte des correspondances ; raisons affichées ; « aucun score, sponsoring ou signal privé » |
| **Socle — iAsted citoyen** (demarche.ga) | orientation vers l'administration compétente sans inventer de nom (`find_administration`), démarche lancée après confirmation (`initiate_demarche`) |
| **Programme — plan iAsted 2.0** (`DOCUMENTATION/IASTED/PLAN_IASTED_2026-09-27.md`) | une passerelle IA unique : droit d'usage, crédits, classification de la donnée (quatre classes ; la classe « Secrète » n'autorise qu'un modèle souverain), langue, choix du modèle, journal |
| **DIASPORALE** | un « concierge » prévu en V2 (recherche limitée au réseau, actions confirmées), jamais porté dans le moteur |
| **ANTSIA** | **aucune ligne d'IA** ; iAsted a été **exclu** lors de la duplication du socle (`docs/02_OWNER_MAP_DUPLICATION.md`), choix que le propriétaire peut rouvrir |

### 11.2 Ce que l'on propose (D05)

Faire entrer iAsted dans ANTSIA sous **trois rôles** :
- **iAsted du membre** *(nouveau)* : il comprend un besoin écrit ou dit, cherche dans les offres publiées et admissibles, compare, explique son classement, crée des alertes, prépare un contact, une visite, un panier ou un devis.
- **Agent du vendeur** *(existe dans PRO.GA)* : il répond dans Messages, à partir du catalogue approuvé de la structure, qualifie la demande et passe la main à un humain ; il faut le relier au contact commercial d'ANTSIA.
- **iAsted citoyen** *(existe sur demarche.ga)* : il oriente vers l'administration compétente et la démarche, et cite les publications Officielles.

**La chaîne de décision** : 1 · comprendre (intention, univers, critères, budget, zone) → 2 · chercher (offres publiées et admissibles, besoins publics, filtres de réseau, de visibilité et de retrait du moteur) → 3 · classer (pertinence, confiance, fraîcheur ; le sponsorisé reste à part et étiqueté) → 4 · proposer (cartes, raisons et sources visibles) → 5 · **confirmer** (la personne valide chaque action) → 6 · agir (par les vraies fonctions du moteur, droits relus côté serveur ; journal).

**Garde-fous** : il se présente comme une IA (ordonnance 0011, art. 53 ; AI Act, art. 50) ; il ne paie jamais seul — tout engagement passe par la confirmation, plus tard par un mandat signé et plafonné ; il ne lit ni les Messages privés, ni les Rencontres, ni les candidatures d'autrui ; aucun profilage politique ou sensible, aucune inférence à partir des achats, abonnements ou relations ; raisons et sources visibles, sponsorisé jamais mélangé ; mémoire choisie, exportable et effaçable ; quotas, coupe-circuit et journal par la passerelle iAsted 2.0 ; le contenu des annonces n'est jamais traité comme une consigne (injection) ; ses réponses se limitent au catalogue vérifié, car elles engagent l'exploitant.

### 11.3 Étapes

{{TABLE_IASTED_ETAPES}}

### 11.4 Ce que les agents d'achat ont appris (2024-2026)

- Confirmation explicite avant tout achat (Google, protocole d'OpenAI et Stripe) ; mandats d'intention et de panier, signés et plafonnés (AP2 de Google) pour aller plus loin.
- Passage à un humain et reprise par le vendeur à tout moment (agent de Meta pour les entreprises, lancé en juin 2026).
- Ce que dit l'agent engage l'exploitant : Air Canada a été tenue par une politique inventée par son robot (2024).
- Un agent a acheté sans accord (Operator, 2025) ; un navigateur-agent a été détourné par une consigne cachée dans une page (Comet, 2025) ; un agent commerçant s'est laissé arracher des remises (Project Vend d'Anthropic, 2025).
- ChatGPT a revu son achat intégré en mars 2026 : préparer, puis passer la main au parcours du vendeur.

### 11.5 Écarts relevés par l'inventaire

{{LIST_IASTED_CONSTRUIRE}}

S'y ajoutent des dettes PRO.GA : la durée de conservation des conversations de l'agent commercial n'est appliquée nulle part ; un identifiant de modèle ancien est codé en dur ; les fournisseurs divergent d'un produit à l'autre (Claude chez PRO.GA ; Gemini, Claude et OpenAI au socle). Recommandation : tout faire passer par la passerelle iAsted 2.0, avec des modèles actuels choisis par configuration.

**Coût.** iAsted est payant dans PRO.GA après 90 jours d'essai (barème provisoire du document 05 : 1 crédit = 500 FCFA). ANTSIA promet que « le citoyen ne paie jamais ». **Proposition : l'iAsted du membre est gratuit dans ANTSIA**, financé par les revenus professionnels ; l'agent du vendeur reste dans l'offre PRO.GA.

---

## 12. Réorganiser le site

![Navigation proposée](schemas/15-navigation-proposee.svg)

**Ce qui existe** (code au 21 octobre) : cinq destinations au téléphone — Fil, Clips, Messages, Découvrir, Profil — et un menu Créer (Publication, Actu, Évènement, Conférence, Album). Le reste s'atteint par Découvrir (`/explorer`) et par des routes dédiées : Marketplace, boutiques, prestataires, emplois, réseau pro, presse, rencontres (fermé), pages Officielles.

**Ce que l'on propose** — ranger, pas ajouter d'icônes (ADR-0034 : « Conserver la barre sociale à cinq destinations sur téléphone ») :
- **Découvrir** devient la porte des trois piliers : en tête la recherche « Demander à iAsted… » ; puis Business (les tuiles des univers **ouverts** seulement), Vie publique (Infos officielles, Presse, Démarches ↗, Emploi public ↗), Divertissement (Clips, Directs, Groupes, Évènements, Rencontres quand elles ouvriront).
- **Créer** accueille l'**annonce de particulier** et un accès direct à « Mon activité » (aujourd'hui dans Marketplace : « Créer ou gérer mon activité »).
- Chaque univers ouvre son **espace spécialisé** avec « Retour à ANTSIA » (contrat `specialized-navigation` v1 de MP00, raccordé en MP01).

{{TABLE_ROUTES}}

Les routes proposées ne sont créées qu'à l'ouverture de leur univers (« aucun alias vide annonçant une fonctionnalité future », ADR-0034) et passent par `apps/antsia_ga/src/lib/routes.ts` (aucune URL en dur).

---

## 13. Architecture technique

![Architecture de l'écosystème](schemas/16-architecture-ecosysteme.svg)

**Les autorités ne changent pas.** ANTSIA garde le social et la présentation ; PRO.GA garde la vérité commerciale (structure, catalogue, variantes, prix, stock, devis, agenda, engagements, rapprochement) ; les prestataires gardent l'état réel des fonds ; les administrations délivrent les attestations ; iAsted passe par une passerelle unique. Aucune base n'est lue par un autre produit, aucun client Convex croisé, aucun import de schéma : tout passe par des contrats signés, versionnés, idempotents et rejouables.

**Contrats existants** (`docs/contrats`) : `RESEAU-PUBLIC-V1`, `FEDERATION-INBOX-V1`, `PRO-COMMERCE-PUBLIC-V1`, `PRO-COMMERCE-COMMAND-V1`, `PRO-COMMERCE-LINK-V1`, `PRO-COMMERCE-CATALOG-READ-V1`, `PRO-COMMERCE-JOBS-V1`, `PRO-COMMERCE-SERVICE-CONTROL-V1`, `PRO-COMMERCE-CHECKOUT-CONTROL-V1`, `CONVERSATION-CONTEXTUELLE-V1`.

**Briques proposées** (noms définitifs à arrêter au lot SU00, comme MP00 l'a fait pour la marketplace) :

{{TABLE_BRIQUES}}

**Invariants à tenir pour chaque brique** (CLAUDE.md d'ANTSIA) : `networkId` sur toute table et `requireMembership` en tête de toute fonction ; refus indistinct ; visibilité `network` par défaut ; badges et labels calculés ; garde des fichiers fail-closed ; écriture bornée (adhésion → éligibilité → débit → droit) ; i18n FR/EN ; inventaires d'export et d'effacement ; cliquets étendus (`network-scoped-functions`, `rate-limited-writes`, `notification-payload-content`…).

### 13.1 Conformité à l'ordonnance 0011/PR/2026 (lot SU01)

| Exigence | Ce qu'ANTSIA a déjà | Ce qu'il faut ajouter |
|---|---|---|
| Identification des utilisateurs (art. 4) | IDN (identite.ga) pour l'identité vérifiée ; comptes légers par code à usage unique | identification de **tout** titulaire de compte (noms, prénoms, domicile, téléphone ; RCCM pour les commerçants), collectée au minimum, conservée à part, jamais publiée ; IDN comme preuve préférée ; pas de NIP sans autorisation de l'APDPVP |
| Majorité numérique à 16 ans, vérification d'âge (art. 16-24, 53) | aucune preuve d'âge ; rencontres fermées faute de preuve de majorité | aucun compte avant 16 ans (art. 17) ; vérification d'âge à l'inscription sous 12 mois (art. 53) ; 16-17 ans : accord parental et autorisation de l'APDPVP à arbitrer (loi 025/2023, art. 74, 81, 188, 190) ; 18 ans pour les transactions |
| Signalements : 24 h et 72 h pour un mineur, 24 h pour un hypertrucage (art. 24, 33) | modération à l'échelle, files, sanctions, recours, console (PA7) | catégories et chronomètres réglementaires, alertes de délai, rapport à l'autorité |
| Administrateurs de pages et de groupes responsables (art. 11) | rôles d'administrateur et de signataire de page, modération de groupe | outils de retrait rapides pour les administrateurs, information claire de leur responsabilité |
| Registre de la HAC (art. 37), éditeur identifié (art. 25) | mentions légales publiques | inscription au registre ; directeur de publication et hébergeur affichés |
| Marquage des contenus d'IA (art. 53) | aucune IA aujourd'hui | étiquette visible sur toute réponse et tout contenu produits par iAsted ; détection des contenus générés importés |
| Conservation des données d'identification (art. 29-31) | effacement effectif de toutes les tables sociales | durée légale de conservation à définir, en tension avec l'effacement : arbitrage juridique |
| « Assimilés » et termes des transactions (ordonnance 0012) | conditions vendeur V2 affichées (MP05) | conditions publiées pour chaque espace qui vend ; règles d'utilisation et politique de données accessibles |

---

## 14. Le modèle économique

![Modèle économique](schemas/19-modele-economique.svg)

**Toujours gratuit pour le citoyen** : s'inscrire, publier, écrire, appeler ; chercher et comparer ; l'iAsted du membre ; les annonces de particuliers (dans les quotas) ; candidater ; suivre l'information officielle ; les rencontres, une fois ouvertes ; la vérification de base.

**Payé par les professionnels (B2B, toujours étiqueté)** :

| Revenu | Détail | État |
|---|---|---|
| Abonnement PRO.GA | packs de gestion, crédits Gabaos (barème provisoire : 1 crédit = 500 FCFA) | prévu dans PRO.GA |
| Commission sur ventes encaissées | modèle P12 conservé : part vendeur 90 % ou 85 %, ou contrat (A08) | fermé tant qu'aucun prestataire n'est contracté |
| Mise en avant d'une offre | étiquetée « Mis en avant », dans son univers | proposé |
| Contenu sponsorisé | étiqueté, plafonné, jamais dans Messages, bibliothèque publique | prévu au cahier (A6), à construire |
| Page d'entreprise premium | statistiques, équipe, assistance | prévu au cahier (EXF-AN-52) |
| Billetterie | commission payée par l'organisateur | proposé, après paiement |
| Vérification à la demande du vendeur | document foncier, carte grise | à décider (D10) |

**Jamais** : vendre des données personnelles ; publicité dans Messages ; classement payé caché ; frais pour candidater ; publicité politique payante ; profilage sensible ; badge payant. Aucun taux n'est fixé ici ; les frais réels doivent être affichés avant tout paiement. Annoncer les règles à l'avance et ne jamais les changer en bloc (leçon de Zalo, 2026).

---

## 15. La feuille de route

![Feuille de route](schemas/20-feuille-de-route.svg)

**Ordonner par dépendances, pas par envie** : d'abord ce qui existe, puis ce qui ne demande pas de paiement en ligne, puis ce qui attend une condition externe.

| Vague | Contenu | Porte de sortie |
|---|---|---|
| **V0 · Décider et se conformer** | décisions D01–D12, ADR « sept univers et vie publique », analyse juridique (ordonnance 0011, loi 025/2023) | ADR accepté |
| **V1 · Consolider l'existant** | MP00–MP14 en cours : boutiques, services, presse, pros ; emploi P15 ; Découvrir par piliers | MP14 ouvre Boutiques et Services en recette réelle |
| **V2 · Univers sans paiement en ligne** | immobilier et foncier ; auto et mobilité ; restauration (commande payée à la remise) ; annonces de particuliers | pilote Grand Libreville mesuré |
| **V3 · Vie publique** | Officiel en recette (PA9), alertes, label Presse, annonceurs, règle politique | HAC consultée ; premières administrations reflétées |
| **V4 · iAsted** | a · recherche et besoins → b · agent du vendeur → c · actions confirmées | évaluation au vert : exactitude, fuite, biais, injection |
| **V5 · Paiement, cérémonies, sorties** | billetterie, réservations payées, vente en direct | contrat de paiement (porte externe) |
| **Sous condition · Rencontres** | ouverture MP10–MP11 | preuve de majorité qualifiée (porte externe) |

**Lots proposés** (préfixe SU, « sept univers », libre dans le dépôt ; tailles relatives, pas des délais) :

{{TABLE_LOTS}}

**Parallélisme possible** : après SU00 et SU01, les catalogues (SU03), les annonces (SU07), l'emploi (SU08) et iAsted (SU11) peuvent avancer en parallèle si leurs fichiers ne se recouvrent pas ; schéma, routes, i18n, registres et contrats gardent un seul responsable d'intégration à la fois, comme pour MP.

**Frontières entre sessions** : implémenter dans les vrais sources de l'application ; préserver DIASPORALE et la session marketplace ; aucun changement de branche dans l'arbre partagé ; `git add -- <chemins>` seulement ; aucun fonds réel, aucun univers sous condition externe ouvert sans ses preuves.

---

## 16. Indicateurs de réussite

{{TABLE_INDICATEURS}}

Aucune cible chiffrée n'est fixée : elles se fixent après trois mois de mesure réelle, conformément à la règle de véracité du programme. Les mesures sont consenties et minimisées : aucune conversation, candidature ou préférence de rencontre dans l'analytique (exigence SC16 de l'étude du 18 octobre).

---

## 17. Risques et parades

{{TABLE_RISQUES}}

---

## 18. Les décisions à prendre

{{TABLE_DECISIONS}}

Les décisions D01 à D08 ont été validées par le propriétaire le 21 octobre 2026 et consignées dans l'[ADR-0035](../../adr/0035-sept-univers-et-vie-publique.md) ; l'analyse de conformité est dans [SU01](SU01_CONFORMITE_ORDONNANCE_0011.md).

### Où en est-on au 21 octobre

{{TABLE_CRITERES_GO}}

**Au propriétaire** (détail dans [SU01](SU01_CONFORMITE_ORDONNANCE_0011.md), § 5) :

{{LIST_ACTIONS_PROPRIETAIRE}}

**Prochains lots** (ordre et dépendances dans SU01, § 4, et dans [EXECUTION.md](EXECUTION.md)) :

{{LIST_PROCHAINS_LOTS}}

---

## 19. Sources

{{LIST_SOURCES}}

---

## Annexe A — L'existant d'ANTSIA en un coup d'œil (21 octobre 2026)

**Routes membres** (`apps/antsia_ga/src/app/(membre)`) : fil, mon-fil, clips, actus (Stories), explorer, groupes, evenements, direct, conference, messages, notifications, moi, profil, page, parametres, moderation ; marketplace, panier, boutique/[handle] (catalogue, offres, contacter, devis, rendez-vous, prestation, preparer, emplois), prestataire/[handle], mes-boutiques, mes-achats, mes-commandes, mes-paiements, mes-demandes, mes-candidatures ; professionnels, mon-profil-pro, mes-collaborations ; presse, media/[handle], redaction, mes-medias ; rencontres.

**Routes publiques** (`(public)`) : decouvrir, boutiques/[handle], prestataires/[handle], pros/[handle], medias/[handle], pages/[handle], publications/[id], provinces/[slug], tags/[tag], a-propos, transparence, confidentialite, mentions-legales.

**Modules du moteur** (`convex/modules`) : albums, calls, commercialMessaging, contextualMessaging, diaspora, discovery, editorial, engagement, events, federation, files, graph, groups, live, marks, media, messaging, moderation, networks, notifications, pages, people, personalMeetings, platform, posts, professionals, public, shops, stories, suggestions, thematicGroups.

**États d'activation** : `shops/commerceActivation.ts` garde fermés paiements, services, candidatures et vitrine automatique (`ready: false`) ; aucun adaptateur de paiement enregistré dans PRO.GA ; rencontres personnelles fermées faute de preuve de majorité ; marketplace MP01–MP13 raccordée en source avec contrôles ciblés, MP14 en préparation (fichier `EXECUTION.md` du plan marketplace).

## Annexe B — Glossaire

- **Univers** : un des sept espaces business (boutiques, immobilier et foncier, emploi et talents, alimentation et restauration, services et artisans, auto et mobilité, cérémonies et sorties).
- **Pilier** : divertissement, business, vie publique.
- **Page d'activité** : l'identité sociale d'une activité ; une seule par activité.
- **Entité responsable** : la personne ou la structure PRO.GA qui répond de la page et détient son catalogue.
- **Espace métier** : une capacité activée sur la page (Boutique, Prestations, Biens, Location, Emplois, Billetterie, Média), avec sa navigation et son admission propres.
- **Gabarit** : un réglage de présentation par spécialité ; il ne donne aucun droit.
- **PRO.GA** : le système de gestion des activités ; maître du catalogue, des prix, du stock et des engagements.
- **Annonce de particulier** : une offre ponctuelle d'une personne, sans page ni encaissement.
- **Besoin** : ce que cherche une personne ; privé par défaut.
- **Attestation** : une preuve signée d'une autorité, qui calcule un label.
- **Porte externe** : une condition hors du code (contrat de paiement, preuve de majorité, convention).
