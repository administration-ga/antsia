"""Données issues de la recherche documentaire du 21 octobre 2026 (marché gabonais et benchmark).

Chaque chiffre porte sa source et sa date ; les notes de la grille sont des jugements fondés sur ces sources.
Notes complètes de recherche : hors dépôt (dossier temporaire de la session), synthétisées ici.
"""
from __future__ import annotations

# --------------------------------------------------------------------------------------------
# Constat
# --------------------------------------------------------------------------------------------
CONSTAT_CHAPO = (
    "Les Gabonais vivent déjà une partie de leur économie sur les réseaux sociaux : catalogues WhatsApp, groupes "
    "Facebook, ventes sur TikTok. Depuis le 17 février 2026, ces plateformes sont suspendues par la HAC et "
    "contournées par VPN ; une ordonnance du 26 février encadre désormais les plateformes, ANTSIA compris.")

# (indicateur, valeur, date, source)
CHIFFRES = [
    ("Population", "2,61 millions ; 91,6 % urbaine ; âge médian 21,5 ans", "oct. 2025", "DataReportal, Digital 2026"),
    ("Internautes", "1,87 million (71,9 %)", "oct. 2025", "DataReportal (Kepios)"),
    ("Identités sur les réseaux sociaux", "850 000 (32,6 % ; 55,8 % des adultes), avant la suspension",
     "oct. 2025", "DataReportal"),
    ("Connexions mobiles", "3,27 millions (126 %), dont 88,9 % en 3G, 4G ou 5G", "fin 2025",
     "GSMA Intelligence via DataReportal"),
    ("Abonnements Internet", "2,31 millions, dont 94,65 % mobiles", "T1 2025", "ARCEP via Gabonreview"),
    ("Smartphone", "59,9 % des adultes", "2025", "Global Findex via Gabon Media Time"),
    ("Mobile money", "3 921 190 comptes ; 344,6 millions de transactions ; 3 762,7 milliards FCFA", "2024",
     "BEAC, rapport 2024 (avril 2026)"),
    ("Arnaques par appel ou SMS", "40 à 50 % des adultes ciblés ; 1 ciblé sur 10 a payé", "2024",
     "Global Findex via Gabon Media Time"),
    ("Chômage", "17,4 % ; environ 34 % chez les 15-24 ans", "2024", "ENEC 2024 via la presse"),
    ("Emploi", "privé informel 46,8 % ; privé formel 25,4 % ; administration 19,6 %", "2024",
     "ENEC 2024 via Gabon Media Time"),
    ("Entreprises informelles", "62,9 % des entreprises identifiées", "fin 2023",
     "Recensement général des entreprises via GMT"),
    ("Déficit de logements", "environ 265 000, dont 53 % dans l'Estuaire", "2025", "Plan d'accélération via Le360"),
    ("Pauvreté", "34,6 % sous le seuil ; croissance 2,9 %", "2024", "Banque mondiale (juin 2025)"),
]

# (ce qui s'échange, comment aujourd'hui, douleur principale)
CIRCULATION = [
    ("Produits : mode, beauté, téléphonie, importés", "catalogues WhatsApp, groupes Facebook de revente, ventes "
     "TikTok, CoinAfrique", "achat payé d'avance livré non conforme ; comptes piratés ; aucun recours"),
    ("Location de logements", "groupes Facebook, démarcheurs, quelques portails", "frais de visite (5 000 FCFA), "
     "commission de 50 à 100 % d'un loyer, caution d'un à trois mois plus l'avance, photos trompeuses"),
    ("Terrains et maisons à vendre", "annonces, bouche-à-oreille", "doubles ventes (Akanda, Owendo, Ntoum), cadastre "
     "incomplet ; régularisation de masse lancée le 16/02/2026"),
    ("Emploi", "groupes WhatsApp et Facebook, L'Union, sites d'employeurs, PassEmploi241", "faux recrutements payants "
     "au nom de grandes entreprises et d'un ministère"),
    ("Repas et produits frais", "publicités sur les réseaux, catalogues WhatsApp, applications de livraison",
     "dépendance aux réseaux coupés ; un restaurateur y trouvait environ 40 % de ses clients"),
    ("Services et artisans", "TikTok, bouche-à-oreille, numéros partagés", "prix flous, qualité incertaine, aucune "
     "trace de l'accord"),
    ("Véhicules", "TikTok, Facebook, CoinAfrique ; occasions importées (10 ans au plus depuis 12/2023)",
     "ventes effondrées depuis la coupure ; documents difficiles à vérifier"),
    ("Cérémonies", "avis et programmes (L'Union, Necro Gabon), location de tentes et de chaises",
     "aucune billetterie locale identifiée ; aucun coût chiffré"),
    ("Rencontres", "réseaux généralistes, applications étrangères", "arnaques sentimentales, sextorsion, hypertrucages ; "
     "aucune plateforme locale"),
]

SUSPENSION = (
    "<p><b>17 février 2026</b> : la HAC suspend « jusqu'à nouvel ordre » les réseaux sociaux. OONI et l'Internet "
    "Society mesurent le blocage de Facebook, Instagram, TikTok et YouTube ; WhatsApp est perturbé de façon inégale ; "
    "X n'est pas touché. Une levée « progressive » annoncée le 1<sup>er</sup> avril reste sans effet ; le maintien est "
    "confirmé jusqu'au 23 août (Gabon Media Time). <b>Au 21 octobre, aucune levée n'est annoncée : le statut est "
    "incertain</b> et doit être vérifié avant tout lancement.</p>"
    "<p><b>Ordonnance n° 0011/PR/2026</b> du 26 février (JO n° 110), ratifiée le 5 octobre : elle vise toute plateforme "
    "de « mise en relation […] en vue de la vente d'un bien, de la fourniture d'un service » — donc ANTSIA. "
    "Identification des utilisateurs (noms, domicile, téléphone, RCCM si assujetti, NIP le cas échéant) ; majorité "
    "numérique à 16 ans avec vérification d'âge ; signalement de cyberharcèlement d'un mineur : accusé de réception en "
    "24 h, décision en 72 h ; retrait des hypertrucages en 24 h ; registre public de la HAC ; référé numérique, "
    "suspension d'une plateforme plafonnée à 72 h ; amendes de 5 à 50 millions FCFA ; 12 mois pour la vérification "
    "d'âge et le marquage des contenus d'IA.</p>")

ENSEIGNEMENTS = [
    "<b>Le besoin est réel et quotidien.</b> Vendre, louer, recruter, nourrir passent déjà par les réseaux ; la "
    "coupure a montré la dépendance des petits commerçants.",
    "<b>La douleur commune est la confiance.</b> Arnaques à la location, à l'emploi, aux achats payés d'avance, "
    "sextorsion : la vérification par l'autorité compétente est le premier service à rendre.",
    "<b>Le mobile money est partout, la protection nulle part.</b> 3,9 millions de comptes, mais aucun séquestre : "
    "la mise en relation peut ouvrir sans paiement en ligne ; le paiement protégé viendra avec un établissement agréé.",
    "<b>Le contexte de 2026 est une fenêtre et un risque.</b> ANTSIA doit gagner par l'utilité et la confiance, "
    "jamais comme réseau de remplacement d'une censure.",
    "<b>ANTSIA est lui-même visé par l'ordonnance 0011.</b> Identification proportionnée, délais de traitement, âge, "
    "marquage de l'IA et registre de la HAC se conçoivent dès maintenant.",
    "<b>62,9 % des entreprises sont informelles.</b> L'annonce de particulier puis le passage vers PRO.GA forment "
    "une porte de formalisation.",
]

# --------------------------------------------------------------------------------------------
# Sélection des univers
# --------------------------------------------------------------------------------------------
SELECTION_CHAPO = (
    "Sur douze candidats, sept univers business ressortent. Trois autres trouvent leur place ailleurs : "
    "l'administration dans le pilier Vie publique, les rencontres dans le Divertissement (fermées), la livraison "
    "comme capacité commune. Les tontines sont écartées : elles relèvent d'établissements agréés.")

METHODE_NOTATION = (
    "Douze candidats sont notés de 1 à 5. <b>V</b> : volume d'activité observé sur les réseaux ; <b>F</b> : fréquence "
    "du besoin ; <b>D</b> : intensité de la douleur ; <b>R</b> : potentiel de revenus ; <b>Risque</b> : risque "
    "réglementaire (5 = élevé). Note d'opportunité = V + F + D + R + (6 − Risque), sur 25. La colonne <b>A</b> "
    "mesure ce que le code d'ANTSIA et de PRO.GA permet déjà de réutiliser : elle ordonne les vagues, elle ne "
    "choisit pas.")

NOTATION_NOTE = (
    "Notes établies à partir des sources citées (presse gabonaise, BEAC, ENEC 2024, Journal officiel) ; elles restent "
    "qualitatives, aucune donnée de plateforme n'étant publiée pour le Gabon. Le réemploi A est établi par la lecture "
    "du code. Les notes sont à revoir après six mois de mesures réelles.")

CRITERES_CLES = ["V", "F", "D", "R", "Rr", "A"]
CRITERES_TITRES = ["V", "F", "D", "R", "Risque", "A"]


def _candidat(nom, V, F, D, R, Rr, A, verdict, couleur, groupe, court):
    return {"nom": nom, "V": V, "F": F, "D": D, "R": R, "Rr": Rr, "A": A, "score": V + F + D + R + (6 - Rr),
            "verdict": verdict, "couleur": couleur, "groupe": groupe, "court": court}


CANDIDATS = [
    _candidat("Boutiques et marketplace", 5, 5, 4, 4, 2, 5, "Retenu · V1", "vert", "retenu", "Boutiques"),
    _candidat("Immobilier : location", 4, 4, 5, 4, 3, 2, "Retenu · V2", "vert", "retenu", "Immobilier"),
    _candidat("Emploi et stages", 4, 4, 5, 3, 2, 4, "Retenu · V1", "vert", "retenu", "Emploi"),
    _candidat("Alimentation et restauration", 4, 5, 3, 3, 2, 3, "Retenu · V2", "vert", "retenu", "Restauration"),
    _candidat("Services de proximité", 3, 4, 3, 3, 2, 5, "Retenu · V1", "vert", "retenu", "Services"),
    _candidat("Cérémonies, événements et sorties", 3, 3, 3, 4, 2, 3, "Retenu · V2–V5", "vert", "retenu", "Cérémonies"),
    _candidat("Mobilité et livraison", 3, 5, 4, 3, 4, 1, "Capacité commune", "ink", "ailleurs", "Livraison"),
    _candidat("Automobile", 4, 2, 3, 4, 3, 2, "Retenu · V2", "vert", "retenu", "Auto"),
    _candidat("Terrains et vente immobilière", 3, 2, 5, 4, 4, 2, "Dans Immobilier", "vert", "retenu", "Terrains"),
    _candidat("Tontines et cagnottes", 3, 4, 4, 3, 5, 1, "Écarté · agrément", "rouge", "ecarte", "Tontines"),
    _candidat("Administration et démarches", 3, 3, 4, 2, 3, 4, "Pilier Vie publique", "bleu", "ailleurs",
              "Administration"),
    _candidat("Rencontres", 2, 3, 4, 3, 5, 3, "Divertissement · fermé", "rouge", "ecarte", "Rencontres"),
]

MATRICE_LEGENDE = (
    "Schéma 4 — Matrice de priorisation. En hauteur, la valeur pour la population (moyenne de V, F et D) ; en "
    "largeur, la faisabilité (moyenne du réemploi A et du risque réglementaire inversé) ; la taille du cercle donne le "
    "potentiel de revenus R. Lecture de l'étude à partir de la grille ci-dessus.")

# --------------------------------------------------------------------------------------------
# Fiches des sept univers
# --------------------------------------------------------------------------------------------
FICHES = [
    {
        "nom": "Boutiques", "etat": "En cours · MP05", "couleur_etat": "vert", "vague": "V1",
        "pour": "acheter vêtements, beauté, téléphonie, électroménager, produits importés",
        "existe": "marketplace, boutiques, variantes, paniers par vendeur (MP04–MP05, en source)",
        "construire": "vente en direct, avis vérifiés, paiement protégé (après contrat)",
        "resume": "Le premier besoin. Une vendeuse de poisson et de vêtements vit des réseaux (RFI, février 2026) ; un "
                  "groupe Facebook de revente compte environ 10 200 membres. ANTSIA donne une vitrine lisible, un "
                  "panier par boutique et un suivi d'achat.",
        "grille": [
            ("Aujourd'hui", "catalogues WhatsApp, groupes Facebook, ventes TikTok ; prix « en privé », paiement "
                            "d'avance, coursier"),
            ("Douleur", "produit payé d'avance livré non conforme ; comptes piratés ; aucun recours"),
            ("ANTSIA apporte", "prix visible, variantes, panier par vendeur, suivi d'achat, contact dans Messages"),
            ("Confiance", "Vérifié (IDN), Entreprise vérifiée (PRO.GA : RCCM, NIF) ; catégories interdites refusées"),
            ("PRO.GA", "pack Commerce de détail : catalogue, variantes, stock, caisse, livraison"),
            ("iAsted", "« une robe en wax taille M sous 25 000 F à Libreville » ; l'agent du vendeur répond sur les "
                       "tailles et le stock"),
            ("Revenus", "commission sur ventes encaissées (P12), mises en avant, abonnement PRO.GA"),
            ("Risques", "contrefaçon, produits interdits ; parade : modération, signalement, paiement tracé"),
        ],
    },
    {
        "nom": "Immobilier et foncier", "etat": "Nouveau", "couleur_etat": "ink", "vague": "V2",
        "pour": "louer un logement, acheter un terrain ou une maison, louer un local",
        "existe": "aucun module dédié ; agenda et devis réutilisables",
        "construire": "type d'offre bien, espace Biens, visites, gabarit agence, vérification foncière",
        "resume": "La douleur la plus forte. Démarcheurs non autorisés, frais de visite de 5 000 FCFA, commission de 50 "
                  "à 100 % d'un loyer, caution d'un à trois mois plus l'avance, photos trompeuses ; doubles ventes de "
                  "terrains. Déficit d'environ 265 000 logements.",
        "grille": [
            ("Aujourd'hui", "groupes Facebook, démarcheurs, portails peu fréquentés (ImmoDem, Gabaho, Cabalou), "
                            "CoinAfrique"),
            ("Douleur", "frais avant visite, biens déjà loués, trois mois de recherche, titres douteux"),
            ("ANTSIA apporte", "annonces structurées (quartier, loyer, caution, avance), photos datées, visites, "
                               "alertes"),
            ("Confiance", "Agent autorisé (loi 006/2017), Document contrôlé (convention foncière), Vérifié exigé pour "
                          "vendre un terrain"),
            ("PRO.GA", "verticale agence immobilière à créer : biens, mandats, visites, baux, quittances"),
            ("iAsted", "« une maison 3 chambres à Akanda sous 350 000 F » ; alerte ; aucun contact sans "
                       "confirmation"),
            ("Revenus", "abonnement des agences, mises en avant, vérification à la demande du vendeur (à décider)"),
            ("Risques", "arnaques, frais illégaux ; parade : aucun paiement hors parcours tracé, attestations"),
        ],
    },
    {
        "nom": "Emploi et talents", "etat": "En source · P15, MP09", "couleur_etat": "vert", "vague": "V1",
        "pour": "trouver un emploi, un stage, une mission ; recruter ; suivre les concours publics",
        "existe": "offres et candidatures privées (P15), réseau pro (MP09), en source",
        "construire": "univers réuni, concours publics Officiels, lien travail.ga, alertes",
        "resume": "Chômage de 17,4 %, environ 34 % chez les 15-24 ans (ENEC 2024). Faux recrutements payants à "
                  "répétition au nom de grandes entreprises et d'un ministère ; l'intermédiation publique a été jugée "
                  "peu fiable par la Présidence le 29/09/2026.",
        "grille": [
            ("Aujourd'hui", "groupes WhatsApp et Facebook, L'Union, sites d'employeurs, PassEmploi241, GoAfricaOnline"),
            ("Douleur", "frais de dossier exigés par de faux recruteurs ; CV envoyés sans suite"),
            ("ANTSIA apporte", "offres de pages employeurs vérifiées, candidature privée, suivi, concours Officiels"),
            ("Confiance", "employeur = page + mandat (PRO.GA) ; jamais de frais pour candidater"),
            ("PRO.GA", "recrutement : postes, candidatures, entretiens ; contrat PRO-COMMERCE-JOBS-V1"),
            ("iAsted", "« un stage en comptabilité à Port-Gentil » ; aide à rédiger son profil"),
            ("Revenus", "offres mises en avant et abonnement recrutement, payés par l'employeur"),
            ("Risques", "fausses offres, exploitation ; parade : employeurs vérifiés, interdiction des frais"),
        ],
    },
    {
        "nom": "Alimentation et restauration", "etat": "Nouveau gabarit", "couleur_etat": "ink", "vague": "V2",
        "pour": "commander un plat, trouver un traiteur, acheter des produits frais",
        "existe": "boutique et catalogue réutilisables ; aucun gabarit restauration",
        "construire": "gabarit restauration (menu, horaires, plat du jour) ; commande à retirer ou livrée, payée à "
                      "la remise",
        "resume": "Le besoin le plus fréquent. Un restaurateur de Libreville estimait qu'environ 40 % de ses clients "
                  "venaient de ses publicités sur les réseaux (BBC) ; les commandes passent par des catalogues "
                  "WhatsApp ; des applications de livraison existent (Yoboresto, FastBox).",
        "grille": [
            ("Aujourd'hui", "statuts « plat du jour », catalogues WhatsApp, applications de livraison"),
            ("Douleur", "dépendance aux réseaux coupés, commandes perdues, livraison informelle"),
            ("ANTSIA apporte", "menu à jour, plat du jour en Story, commande à retirer ou livrée, avis"),
            ("Confiance", "Vérifié, Entreprise vérifiée ; agréments sanitaires à intégrer plus tard"),
            ("PRO.GA", "verticales restauration et épicerie (vrac, lots, dates limites), caisse"),
            ("iAsted", "« un traiteur pour 80 personnes samedi à Owendo »"),
            ("Revenus", "mises en avant, abonnement PRO.GA ; commission une fois le paiement en ligne ouvert"),
            ("Risques", "intoxication, retards ; parade : signalement, avis liés à une commande"),
        ],
    },
    {
        "nom": "Services et artisans", "etat": "En cours · MP06", "couleur_etat": "vert", "vague": "V1",
        "pour": "trouver un artisan, une coiffeuse, une couturière, un répétiteur, un déménageur",
        "existe": "espace prestataire, devis, forfaits, rendez-vous (MP06, en source)",
        "construire": "avis vérifiés, zones d'intervention, paiement des prestations (après contrat)",
        "resume": "Très répandu, peu mesuré. Un couturier de Mont-Bouët trouve ses clients sur TikTok ; une PME "
                  "d'infographie vit des réseaux. La nomenclature de l'artisanat (décret 0242/2022) compte 12 secteurs, "
                  "43 corps de métiers et 369 métiers.",
        "grille": [
            ("Aujourd'hui", "TikTok, bouche-à-oreille, numéros partagés, CoinAfrique « Services »"),
            ("Douleur", "prix flous, qualité incertaine, retards, aucune trace de l'accord"),
            ("ANTSIA apporte", "portfolio, forfaits, devis versionnés, rendez-vous, avis après prestation"),
            ("Confiance", "Vérifié ; mention « déclaratif » pour l'artisan non déclaré ; métier de la nomenclature"),
            ("PRO.GA", "packs artisan et indépendant, déclarés ou non : agenda, devis, projets"),
            ("iAsted", "« un électricien à Owendo demain matin »"),
            ("Revenus", "abonnement PRO.GA, mises en avant ; commission plus tard"),
            ("Risques", "travail mal fait, litiges ; parade : devis accepté tracé, avis liés"),
        ],
    },
    {
        "nom": "Auto et mobilité", "etat": "Nouveau", "couleur_etat": "ink", "vague": "V2",
        "pour": "louer une voiture avec ou sans chauffeur, acheter une occasion, trouver une pièce ou un garage",
        "existe": "aucun module dédié ; boutique réutilisable pour les pièces",
        "construire": "type d'offre véhicule, location de ressources (créneau + caution), gabarit loueur",
        "resume": "Les véhicules figurent parmi les principales importations (DGDI) ; l'âge maximal des occasions "
                  "importées est passé à 10 ans fin 2023 ; une agence d'import qui vendait sur TikTok et Facebook a vu "
                  "ses ventes s'effondrer avec la coupure. Taxi, VTC et livraison restent des partenariats.",
        "grille": [
            ("Aujourd'hui", "pages Facebook et TikTok des loueurs et importateurs, CoinAfrique « Véhicules »"),
            ("Douleur", "documents invérifiables, cautions en espèces, véhicules non conformes"),
            ("ANTSIA apporte", "fiches véhicules, calendrier, réservation, état des lieux en photos, avis"),
            ("Confiance", "Carte grise contrôlée (convention), Vérifié pour louer ou vendre"),
            ("PRO.GA", "location de ressources (flotte, caution), boutique de pièces, atelier"),
            ("iAsted", "« un 4x4 avec chauffeur samedi pour un mariage à Ntoum »"),
            ("Revenus", "abonnement des loueurs et garages, mises en avant, commission sur réservations payées"),
            ("Risques", "vol, fraude documentaire, accidents ; parade : contrôles, contrats, assurance à préciser"),
        ],
    },
    {
        "nom": "Cérémonies et sorties", "etat": "Social seulement", "couleur_etat": "ink", "vague": "V2 · V5",
        "pour": "organiser un mariage, une dot, des obsèques, un retrait de deuil ; sortir, prendre un billet",
        "existe": "évènements sociaux (invitations, réponses) et directs ; aucune billetterie",
        "construire": "espace organisateur, prestataires, location de salles et de matériel ; billetterie après "
                      "paiement",
        "resume": "Les obsèques et les retraits de deuil font tourner une économie de tentes, de chaises et de "
                  "programmes sur plusieurs jours (Necro Gabon, L'Union). Aucune billetterie gabonaise n'a été "
                  "identifiée ; le coût des cérémonies n'est pas chiffré.",
        "grille": [
            ("Aujourd'hui", "avis et programmes dans L'Union ou sur Necro Gabon, affiches, bouche-à-oreille"),
            ("Douleur", "prestataires introuvables ou peu fiables, billets papier, faux évènements"),
            ("ANTSIA apporte", "page d'évènement, prestataires (salle, tentes, sono, traiteur), billets à code, "
                               "directs"),
            ("Confiance", "organisateur vérifié, jauge, annulation et remboursement tracés"),
            ("PRO.GA", "location de ressources (matériel, salles), offres « billet » à jauge"),
            ("iAsted", "« tentes et chaises pour 200 personnes samedi » ; « que faire ce week-end ? »"),
            ("Revenus", "commission de billetterie payée par l'organisateur, mises en avant"),
            ("Risques", "faux évènements, surréservation, sécurité ; parade : vérification, jauge, signalement"),
        ],
    },
]

# --------------------------------------------------------------------------------------------
# Benchmark
# --------------------------------------------------------------------------------------------
BENCHMARK_CHAPO = (
    "Aucune grande plateforme ne fait de la boutique une identité séparée de la page. Presque toutes séparent trois "
    "couches : une entité vérifiée, une ou plusieurs pages, des modules qui ont chacun leur dossier de conformité. "
    "Et elles isolent ce qui est risqué : les rencontres ont un profil à part.")

BENCHMARK_LEGENDE = (
    "Schéma 5 — Où se placent les plateformes : lecture de l'étude à partir des faits sourcés du benchmark. ANTSIA "
    "vise une identité unique, à la fois sociale et transactionnelle, comme WeChat ou Zalo, avec une vérification "
    "d'État gratuite.")

# (plateforme, unité d'identité, modules rattachés, ce qu'ANTSIA en retient)
BENCHMARK = [
    ("Facebook", "Page, détenue par un portefeuille d'entreprise", "boutique (vitrine d'un catalogue), rendez-vous ; "
     "Marketplace entre particuliers", "la boutique n'est pas une identité ; Meta a retiré l'emploi (2022), la vente "
     "en direct, les flux auto et immobilier, puis le paiement intégré (2025)"),
    ("WeChat", "l'entité juridique vérifiée", "comptes d'abonnement et de service, mini-programmes, paiement",
     "une entité, plusieurs surfaces ; comptes publics abandonnés à nettoyer"),
    ("LinkedIn", "page d'entreprise et pages de marque", "produits, emplois, services sur le profil",
     "recruteurs vérifiés depuis 2024 ; un badge n'est pas une garantie"),
    ("Google", "fiche d'établissement", "produits par un catalogue lié, services, réservation",
     "licence et assurance vérifiées pour les services locaux"),
    ("TikTok", "compte business + compte vendeur séparé", "boutique, ventes en direct",
     "le compte vendeur est un dossier de conformité, pas une identité publique"),
    ("Leboncoin, Avito", "un compte, particulier ou pro", "immobilier, véhicules, emploi, services",
     "compte pro obligatoire ; badges personne et entreprise distincts ; vérification gratuite (Avito)"),
    ("Bayut (Dubaï)", "agent autorisé", "annonces adossées à un permis officiel",
     "badge « TruCheck » après vérification sur place"),
    ("Tinder, Facebook Dating", "profil séparé", "rencontres", "vérification faciale ; jamais un module de page"),
    ("Zalo (Vietnam)", "compte officiel", "mini-apps ; plus de 16 500 comptes publics",
     "frais et conditions imposés en bloc : chute et amende (2026)"),
    ("Koo", "—", "—", "adopté par un gouvernement après une suspension de Twitter, délaissé en quelques mois"),
]

LECONS = [
    "<b>Trois niveaux</b> : une entité responsable (la personne ou la structure PRO.GA), une page publique, des "
    "espaces ; le catalogue appartient à l'entité et sert aussi à iAsted.",
    "<b>Peu d'univers à la fois</b>, avec des critères d'arrêt fixés d'avance : Meta et Google ont fermé ce qu'ils "
    "exploitaient mal.",
    "<b>Une vérification par univers</b> : agent autorisé et document foncier, carte grise, employeur vérifié, métier "
    "ou licence.",
    "<b>La confiance de base est gratuite et calculée</b>, jamais vendue ; on vend la visibilité et les outils.",
    "<b>Paiement protégé pour les catégories à risque</b> : la protection de l'acheteur ne vaut que si le paiement "
    "reste dans la plateforme (Mercado Libre, Vinted).",
    "<b>Des revenus annoncés à l'avance</b>, sans revirement brutal (Zalo, 2026).",
    "<b>États et médias</b> : badge Officiel retiré en fin de mandat ; étiquettes de médias selon des critères "
    "publiés, avec appel ; alertes à sens unique ; pas de comptes publics abandonnés.",
    "<b>Publicité</b> : registre public de toutes les annonces, annonceurs vérifiés, pas de publicité politique "
    "payante.",
    "<b>iAsted</b> : mention « IA », reprise par un humain, aucun engagement sans confirmation ni mandat plafonné, "
    "réponses limitées au catalogue vérifié (précédent Air Canada), contenu des annonces jamais pris pour une consigne.",
    "<b>Gagner par l'utilité et la confiance, pas par la contrainte</b> (échec de Koo) : transparence, recours, "
    "export, aucune migration forcée.",
]

# --------------------------------------------------------------------------------------------
# Sources
# --------------------------------------------------------------------------------------------
def _a(label: str, url: str) -> str:
    return f"{label} — <a href='{url}'>{url}</a>"


SOURCES = [
    "<b>Sources locales</b> : code d'antsia_ga et du moteur (routes, i18n, modules), ADR-0001 à 0034, cahier des "
    "charges ANTSIA, études du 18, du 20 et du 21 octobre 2026 et leur fichier EXECUTION.md ; PRO.GA (modules, "
    "documents 03, 05, 18 à 30, recherches sur le Gabon) ; doctrine de communication publique du socle ; plan iAsted "
    "2.0 (DOCUMENTATION/IASTED).",
    _a("France 24, 18/02/2026, suspension des réseaux sociaux",
       "https://www.france24.com/fr/afrique/20260218-gabon-suspension-reseaux-sociaux-jusqu-a-nouvel-ordre"),
    _a("OONI Explorer, mesures de février 2026", "https://explorer.ooni.org/findings/340845567300"),
    _a("Internet Society Pulse", "https://pulse.internetsociety.org/en/shutdowns/social-media-blocked-in-gabon-february-2026/"),
    _a("Gabon Media Time, 23/08/2026, suspension sans horizon",
       "https://gabonmediatime.com/reseaux-sociaux-dun-retour-progressif-de-germain-biahodjow-a-une-suspension-sans-horizon/"),
    _a("Journal officiel n° 110 : ordonnances 0011, 0012, 0013/PR/2026",
       "https://droit-et-politique-en-afrique.info/wp-content/uploads/2026/04/Ordonnance-du-26-fevrier-2026-reglementation-de-lusage-des-reseaux-sociaux-Journal-Officiel-n%C2%B0110-du-8-au-15-avril-2026.pdf"),
    _a("Village de la Justice, analyse des ordonnances, 16/04/2026",
       "https://www.village-justice.com/articles/gabon-dote-droit-des-reseaux-sociaux-analyse-des-ordonnances-fevrier-2026,57009.html"),
    _a("Loi n° 025/2023 (données personnelles, APDPVP)",
       "https://www.afapdp.org/wp-content/uploads/2023/12/Gabon-Loi-025-2023-du-12-juillet-2023-portant-modification-de-la-loi-001-2011-du-25-septembre-relative-a-la-protection-des-donnees-a-caractere-personnel.pdf"),
    _a("DataReportal, Digital 2026 : Gabon", "https://datareportal.com/reports/digital-2026-gabon"),
    _a("BEAC, rapport 2024 sur les services de paiement dans la CEMAC",
       "https://www.beac.int/wp-content/uploads/2026/04/RAPPORT-SUR-LES-SERVICES-DE-PAIEMENT-DANS-LA-CEMAC-2024-.pdf"),
    _a("Banque mondiale, Gabon Economic Update 2025",
       "https://www.worldbank.org/en/news/press-release/2025/06/26/gabon-economic-update-2025-developing-and-preserving-gabon-wealth-to-improve-living-standards"),
    _a("Gabonreview, abonnements Internet T1 2025 (ARCEP)",
       "https://www.gabonreview.com/gabon-legere-progression-des-abonnements-internet-au-1er-trimestre-2025/"),
    _a("Gabon Media Time, arnaques mobiles 2024",
       "https://gabonmediatime.com/gabon-pres-dun-adulte-sur-deux-cible-par-une-arnaque-mobile-en-2024/"),
    _a("Gabon Media Time, ENEC 2024", "https://gabonmediatime.com/gabon-seulement-108-733-chomeurs-en-2024/"),
    _a("Gabon Media Time, informel", "https://gabonmediatime.com/gabon-linformel-colonne-vertebrale-du-tissu-productif/"),
    _a("Le360, 21/05/2026, logement et démarcheurs",
       "https://afrique.le360.ma/societe/gabon-limpossible-quete-dun-toit-decent-a-cause-des-demarcheurs_6JAZ3OL7AVHM7JFT3RVGKE7GAU/"),
    _a("Gabon Media Time, 07/08/2025, démarcheurs et agences non déclarées",
       "https://gabonmediatime.com/gabon-demarcheurs-et-agences-immobilieres-non-declarees-le-bail-locatif-en-danger/"),
    _a("Gabonreview, 15/02/2026, régularisation foncière à 600 000 FCFA",
       "https://www.gabonreview.com/revolution-fonciere-600-000-francs-pour-devenir-proprietaire-au-gabon/"),
    _a("Le360, 05/10/2024, conflits fonciers",
       "https://afrique.le360.ma/societe/libreville-sur-la-terre-fertile-du-foncier-poussent-des-conflits-a-nen-plus-finir_LCT6CND26FGNZMTDO55IMV6N7E/"),
    _a("Gabonreview, faux recrutements (GOC)",
       "https://www.gabonreview.com/faux-recrutements-la-goc-met-en-garde-contre-une-vaste-operation-darnaque-en-ligne/"),
    _a("Infos Gabon, 30/09/2026, emploi et PNPE", "https://fr.infosgabon.com/gabon-lemploi-passe-a-lepreuve-du-concret/"),
    _a("RFI via AllAfrica, 19/02/2026, commerçants et réseaux", "https://fr.allafrica.com/stories/202602190251.html"),
    _a("Le360, 25/03/2026, retombées économiques de la coupure",
       "https://afrique.le360.ma/economie/gabon-les-retombees-economiques-de-la-censure-numerique_EHGYKPTIOZEVFHCFR7YZVJZAHY/"),
    _a("Gabon Media Time, âge des véhicules importés",
       "https://gabonmediatime.com/gabon-lage-limite-dimportation-des-vehicules-doccasion-passe-a-10-ans/"),
    _a("Gabon Media Time, Necro Gabon",
       "https://gabonmediatime.com/gabon-lancement-du-site-necro-gabon-pour-revolutionner-lactualite-mortuaire/"),
    _a("CoinAfrique Gabon (observation directe)", "https://ga.coinafrique.com/"),
    _a("Osiris, 28/09/2026, relance du NIP",
       "https://osiris.sn/le-gabon-relance-l-attribution-du-nip-via-le-systeme-iboga-numerique.html"),
    _a("PPC Land, fin du paiement dans les boutiques Meta (2025)",
       "https://ppc.land/meta-phases-out-facebook-and-instagram-shops-checkout-by-august-2025/"),
    _a("ProPublica, arnaques sur Marketplace (2021)",
       "https://www.propublica.org/article/facebook-grew-marketplace-to-1-billion-users-now-scammers-are-using-it-to-target-people-around-the-world"),
    _a("Meta, étiquetage des médias contrôlés par un État (2020)",
       "https://about.fb.com/news/2020/06/labeling-state-controlled-media/"),
    _a("Meta, transparence des publicités politiques",
       "https://transparency.meta.com/policies/ad-standards/SIEP-advertising/SIEP/"),
    _a("Springlex, DSA article 39 (registre des publicités)",
       "https://www.springlex.eu/en/packages/dsa/dsa-regulation/article-39/"),
    _a("Bayut, badge TruCheck", "https://www.bayut.com/agentportal/heres-your-guide-to-the-trucheck-badge/"),
    _a("Axios, 30/06/2025, vérification faciale de Tinder", "https://www.axios.com/2025/06/30/tinder-face-check-safety"),
    _a("Axios, 09/04/2024, recruteurs vérifiés sur LinkedIn", "https://www.axios.com/2024/04/09/linkedin-recruiters-job-scams"),
    _a("Vietcetera, 01/2026, crise de Zalo",
       "https://vietcetera.com/en/why-zalo-is-no-longer-vietnams-favorite-messaging-app"),
    _a("Business Today, 03/07/2024, fermeture de Koo",
       "https://businesstoday.in/technology/news/story/little-yellow-bird-says-final-goodbye-indias-twitter-rival-koo-shuts-down-435555-2024-07-03"),
    _a("CNBC, 24/03/2026, ChatGPT revoit l'achat intégré",
       "https://www.cnbc.com/2026/03/24/openai-revamps-shopping-experience-in-chatgpt-after-instant-checkout.html"),
    _a("Computer Weekly, protocole AP2 de Google",
       "https://www.computerweekly.com/news/366631360/Google-Cloud-unveils-open-protocol-for-agentic-payments"),
    _a("CustomerThink, affaire Air Canada",
       "https://customerthink.com/chatbots-under-fire-navigating-ai-pitfalls-with-insights-from-dpd-and-air-canada/"),
    _a("Brave, 20/08/2025, injection de consignes", "https://brave.com/blog/comet-prompt-injection/"),
    _a("Anthropic, Project Vend (2025)", "https://www.anthropic.com/news/project-vend-1"),
    "<b>Limites</b> : quota de recherche web épuisé en fin de session ; statut de la suspension au 21/10/2026 non "
    "confirmé ; audiences YouTube et TikTok, règles de publicité politique en ligne, coût des cérémonies, billetterie "
    "et pièces détachées non documentés ; PROXIGAB (plateforme publique pour entrepreneurs, 02/10/2026) à vérifier.",
]
