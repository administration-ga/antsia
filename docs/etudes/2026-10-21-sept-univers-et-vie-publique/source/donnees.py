"""Données du dossier : décisions, tableaux, fiches. Les données du constat et du benchmark sont dans
donnees_etude.py (sources externes datées)."""
from __future__ import annotations

from donnees_etude import (BENCHMARK, BENCHMARK_CHAPO, BENCHMARK_LEGENDE, CANDIDATS, CHIFFRES, CIRCULATION,  # noqa
                           CONSTAT_CHAPO, CRITERES_CLES, CRITERES_TITRES, ENSEIGNEMENTS, FICHES, LECONS,
                           MATRICE_LEGENDE, METHODE_NOTATION, NOTATION_NOTE, SELECTION_CHAPO, SOURCES, SUSPENSION)

UNIVERS_NOMS = [f["nom"] for f in FICHES]

# (code, décision, recommandation, si non)
_DECISIONS = [
    ("D01", "Adopter les trois piliers et les sept univers",
     "Oui : boutiques, immobilier et foncier, emploi, alimentation et restauration, services, auto et mobilité, "
     "cérémonies et sorties ; revoir la liste après six mois de mesures", "on reste aux quatre familles du plan "
                                                                        "marketplace"),
    ("D02", "Étendre « une page + des espaces + PRO.GA » aux sept univers",
     "Oui ; une entité responsable derrière chaque page ; gabarits immobilier, location, restauration, cérémonies, "
     "employeur", "chaque univers invente son propre modèle d'identité"),
    ("D03", "Créer l'annonce de particulier",
     "Oui, sans encaissement, avec quotas, catégories encadrées et « Passer pro »",
     "les particuliers restent sur des plateformes étrangères"),
    ("D04", "Ouvrir d'abord les univers sans paiement en ligne",
     "Immobilier et foncier, Auto et mobilité, Restauration (commande payée à la remise), en vague 2",
     "les grands flux d'annonces restent dehors"),
    ("D05", "Faire entrer iAsted dans ANTSIA",
     "Oui : recherche d'abord, actions confirmées ensuite ; gratuit pour le membre ; marqué comme IA",
     "recherche par filtres seulement"),
    ("D06", "Réserver les espaces de la vie publique",
     "Officiel, Agent public, Presse (label calculé sur attestation), Sponsorisé ; chacun étiqueté et borné",
     "l'information et la promotion se mélangent"),
    ("D07", "Fixer la règle politique",
     "Pas de publicité politique payante ; pages politiques étiquetées ; règles de période électorale",
     "le réseau d'État perd sa crédibilité"),
    ("D08", "Se conformer dès la conception",
     "Ordonnance 0011/PR/2026 et loi 025/2023 : registre de la HAC, identification de tout titulaire de compte "
     "(art. 4) collectée au minimum et jamais publiée, délais de 24 h et 72 h, 16 ans au moins, 18 ans pour les "
     "transactions, marquage de l'IA", "sanctions, référé numérique, suspension"),
    ("D09", "Engager les vérifications d'État",
     "Conventions : foncier, cartes grises, autorisation des agents immobiliers, enregistrement des médias",
     "la confiance repose sur l'identité seule"),
    ("D10", "Arrêter le modèle économique",
     "Liste des revenus professionnels et liste « Jamais » ; barèmes plus tard",
     "pas de revenus, ou des revenus qui détruisent la confiance"),
    ("D11", "Choisir le positionnement et le pilote",
     "Gagner par l'utilité et la confiance, jamais par la contrainte ; Grand Libreville ; rapport de transparence",
     "être perçu comme le réseau de remplacement d'une censure"),
    ("D12", "Rencontres : garder fermé",
     "Rangées dans le Divertissement, fermées jusqu'à une preuve de majorité qualifiée",
     "risque juridique et de réputation"),
]

# Statut de chaque décision : D01 à D08 validées par le propriétaire le 21/10/2026 (ADR-0035).
DECISIONS = [d + (("validée" if int(d[0][1:]) <= 8 else "proposée"),) for d in _DECISIONS]

# (gabarit, espaces par défaut, champs métier, action principale)
GABARITS = [
    ["Boutique généraliste <span class='pastille gris'>existe</span>", "Boutique",
     "catégories, variantes, retrait ou livraison", "Acheter"],
    ["Mode et accessoires <span class='pastille gris'>existe</span>", "Boutique, Prestations",
     "tailles, couleurs, matières ; retouches", "Acheter"],
    ["Artisanat et créations <span class='pastille gris'>existe</span>", "Boutique, Prestations",
     "sur-mesure, délais", "Demander un devis"],
    ["Prestataire local <span class='pastille gris'>existe</span>", "Prestations", "zone, durée, forfait, agenda",
     "Prendre rendez-vous"],
    ["Expert à distance <span class='pastille gris'>existe</span>", "Prestations", "livrables, délai, révisions",
     "Présenter mon besoin"],
    ["Média et rédaction <span class='pastille gris'>existe</span>", "Média", "rubriques, articles, auteurs",
     "Lire"],
    ["Agence immobilière <span class='pastille vert'>proposé</span>", "Biens, Emplois",
     "type, pièces, surface, loyer ou prix, caution, quartier, document foncier", "Demander une visite"],
    ["Loueur de véhicules <span class='pastille vert'>proposé</span>", "Location, Boutique",
     "modèle, année, kilométrage, tarif par jour, chauffeur, caution", "Réserver"],
    ["Restauration <span class='pastille vert'>proposé</span>", "Boutique (menu)",
     "plats, horaires, retrait ou livraison", "Commander"],
    ["Organisateur de cérémonies et sorties <span class='pastille vert'>proposé</span>", "Billetterie, Location",
     "date, lieu, catégories de place, jauge ; matériel", "Réserver sa place"],
    ["Employeur <span class='pastille vert'>proposé</span>", "Emplois", "poste, contrat, lieu, date limite",
     "Candidater"],
]

# (acteur, où il parle, ce qui le distingue, ce qui lui est interdit)
VIE_PUBLIQUE = [
    ["<b>Administration</b>", "sa page Officielle, reflétée depuis administration.ga",
     "badge Officiel ; communiqués, alertes, concours", "le sponsorisé ; la campagne politique"],
    ["<b>Agent public</b>", "son profil personnel, s'il le veut", "badge Agent public, retirable",
     "parler au nom de l'institution"],
    ["<b>Média</b>", "sa page et son site éditorial", "label Presse (proposé) ; corrections publiques",
     "le badge Officiel ; le sponsorisé non étiqueté"],
    ["<b>Annonceur</b>", "cartes Sponsorisé dans le fil, mises en avant dans les univers",
     "« payé par… » visible ; bibliothèque publique des annonces (proposé)",
     "Messages ; le ciblage sensible ; la publicité politique"],
    ["<b>Parti ou élu</b>", "sa page étiquetée Politique (proposé)", "règles renforcées en période électorale",
     "la publicité politique payante (proposé)"],
]

# (destination, route, état)
ROUTES = [
    ["Fil · Clips · Messages · Profil", "/fil · /clips · /messages · /moi", "existe"],
    ["Découvrir", "/explorer (membre) · /decouvrir (public)", "existe ; à ranger par pilier"],
    ["Marketplace : Produits, Boutiques, Services", "/marketplace", "existe (MP04)"],
    ["Boutique et prestataire d'une activité", "/boutique/[handle] · /prestataire/[handle]", "existe (MP05–MP06)"],
    ["Emplois d'une activité · réseau pro", "/boutique/[handle]/emplois · /professionnels", "existe (P15, MP09)"],
    ["Presse et sites médias", "/presse · /media/[handle] · /medias/[handle]", "existe (MP12–MP13)"],
    ["Rencontres", "/rencontres", "existe, fermé (MP10)"],
    ["Pages Officielles", "/pages/[handle]", "existe"],
    ["Immobilier · Auto · Restauration · Emploi · Sorties", "/immobilier · /auto · /restauration · /emploi · /sorties",
     "proposé, créé à l'ouverture"],
    ["Annonces de particuliers", "/annonces · /annonces/[id]", "proposé"],
    ["Vie publique (officiel, alertes)", "/officiel", "proposé"],
]

# (brique, où, rôle, règle tenue)
BRIQUES = [
    ["Types d'offre bien immobilier et véhicule", "PRO.GA (catalogue V2) + projections ANTSIA",
     "facettes immobilier et auto", "PRO.GA maître ; contrat additif"],
    ["Location de ressources (créneau + caution)", "PRO.GA (agenda étendu)",
     "voitures, matériel, salles", "un besoin de deux secteurs = un module"],
    ["Annonces de particuliers", "ANTSIA, module dédié", "annonces sans encaissement, quotas",
     "networkId, débit, modération, effacement"],
    ["Besoins du particulier et alertes", "ANTSIA", "« Je cherche… », privé par défaut",
     "consentement, export, effacement"],
    ["Alertes officielles", "ANTSIA (fédération)", "catégorie Alerte des pages Officielles",
     "contrat signé ; densité bornée"],
    ["Placements sponsorisés + bibliothèque", "ANTSIA", "sponsorisé étiqueté et public",
     "jamais dans Messages ; densité plafonnée"],
    ["Attestations (foncier, cartes grises, presse, entreprise)", "ANTSIA (fédération)", "labels calculés",
     "retrait de l'attestation = disparition du label"],
    ["Passerelle iAsted", "transverse (plan iAsted 2.0)", "droits, crédits, classes de données, journal",
     "aucun modèle codé en dur ; coupe-circuit"],
    ["Conversations iAsted du membre", "ANTSIA", "historique et mémoire choisie", "purge, export, effacement"],
    ["Index sémantique des offres", "ANTSIA (index vectoriel)", "recherche en langage naturel",
     "offres publiées et admissibles seulement"],
]

IASTED_EXISTE = [
    "PRO.GA : agent commercial par structure, sur son site public ; sources et offres approuvées, transfert à un "
    "humain, quotas.",
    "PRO.GA : assistant personnel et de structure ; confirmation humaine imposée par le schéma.",
    "Socle : iAsted citoyen sur demarche.ga ; orientation vers l'administration compétente.",
    "Plan iAsted 2.0 : une passerelle unique (droits, crédits, classes de données, journal).",
    "ANTSIA : aucune ligne d'IA ; iAsted exclu lors de la duplication du socle.",
]

IASTED_CONSTRUIRE = [
    "Rouvrir l'exclusion (D05) et brancher la passerelle iAsted 2.0, sans modèle codé en dur.",
    "Recherche en langage courant sur l'index des offres publiées (MP03), plus un index sémantique.",
    "Besoin du particulier, privé par défaut, avec alertes.",
    "Agent du vendeur relié au contact commercial dans Messages (P10).",
    "Actions confirmées et journal ; évaluation : injection de consignes, fuite entre vendeurs, biais.",
]

IASTED_ETAPES = [
    ["a · Chercher", "langage courant → recherche ; résultats expliqués ; besoins et alertes ; lecture seule",
     "index MP03, passerelle, D05"],
    ["b · Répondre pour le vendeur", "l'agent PRO.GA répond dans Messages depuis le catalogue approuvé, passe la main",
     "contact commercial P10, corpus approuvé"],
    ["c · Agir avec confirmation", "écrire, demander une visite, préparer un panier ou un devis",
     "a et b, journal, quotas"],
    ["d · Mandats d'achat", "achat préparé et signé par la personne, avec plafonds",
     "paiements ouverts (porte externe)"],
]

# (lot, contenu, dépend de, taille relative)
LOTS = [
    ["SU00", "Décisions D01–D12 et ADR « sept univers et vie publique »", "cette étude", "S"],
    ["SU01", "Conformité : registre HAC, identification des titulaires de compte, délais 24 h et 72 h, âge, marquage "
     "de l'IA (analyse livrée le 21/10)", "D08, analyse juridique", "L"],
    ["SU02", "Découvrir par piliers ; tuiles des seuls univers ouverts", "SU00, MP01", "M"],
    ["SU03", "Types d'offre bien immobilier et véhicule (catalogue V2)", "SU00, MP03", "L"],
    ["SU04", "Immobilier et foncier : espace Biens, filtres, visites, gabarit agence", "SU03, MP04", "L"],
    ["SU05", "Location de ressources (créneau + caution) ; Auto et mobilité", "SU03, MP06", "L"],
    ["SU06", "Alimentation et restauration : gabarit, menu, commande payée à la remise", "SU00, MP05", "M"],
    ["SU07", "Annonces de particuliers : quotas, catégories, « Passer pro »", "SU00, SU01, MP04", "M"],
    ["SU08", "Emploi et talents réunis : P15, MP09, concours publics, lien travail.ga", "SU00, PA9", "M"],
    ["SU09", "Vie publique : alertes officielles, label Presse, règle politique", "PA9 en recette, D06, D07", "M"],
    ["SU10", "Annonceurs : sponsorisé étiqueté, densité, bibliothèque publique", "SU09, D10", "M"],
    ["SU11", "iAsted a : passerelle, recherche en langage courant, besoins, alertes", "D05, MP03, SU01", "L"],
    ["SU12", "iAsted b : agent du vendeur dans Messages", "SU11, P10", "M"],
    ["SU13", "iAsted c : actions confirmées et journal", "SU11, SU12", "M"],
    ["SU14", "Cérémonies et sorties : prestataires, matériel et salles, puis billetterie et vente en direct",
     "SU05 ; MP08 pour payer", "L"],
    ["SU15", "Attestations d'État : foncier, cartes grises, agents immobiliers, presse, entreprise",
     "D09, conventions", "M"],
    ["SU16", "Rencontres : ouverture conditionnelle (MP10–MP11)", "preuve de majorité", "L"],
]

INDICATEURS = [
    ["Usage", "membres actifs par semaine et par mois", "la roue tourne-t-elle ?"],
    ["Univers", "offres actives et vendeurs actifs, par univers et par province", "l'univers vit-il ?"],
    ["Confiance", "part des offres d'acteurs vérifiés ; signalements d'arnaque pour 1 000 offres ; délai de "
                  "traitement", "l'univers est-il sûr ?"],
    ["Mise en relation", "part des demandes qui reçoivent une réponse sous 24 h", "les vendeurs répondent-ils ?"],
    ["Engagements", "visites, rendez-vous, candidatures, commandes menés à terme", "y a-t-il une valeur réelle ?"],
    ["iAsted", "recherches suivies d'un contact ; réponses signalées comme inutiles", "l'assistant aide-t-il ?"],
    ["Vie publique", "pages Officielles actives ; délai entre la publication source et son reflet",
     "l'État est-il présent ?"],
    ["Conformité", "part des signalements traités en 24 h et en 72 h ; contenus d'IA marqués",
     "l'ordonnance 0011 est-elle tenue ?"],
    ["Performance", "temps de rendu du fil sur réseau 3G (p95)", "le réseau reste-t-il utilisable ?"],
]

RISQUES = [
    ["Arnaques : faux biens, faux emplois, frais demandés avant visite", "perte de confiance d'un univers",
     "identité vérifiée pour les catégories sensibles, attestations, signalement rapide, aucun paiement hors "
     "parcours tracé"],
    ["Univers vides au lancement", "les premiers visiteurs repartent",
     "tuiles des seuls univers ouverts, vendeurs pilotes, zone pilote"],
    ["Charge de modération", "délais trop longs", "files par univers, équipes thématiques, console (PA7)"],
    ["Perception de propagande", "rejet du réseau", "étiquettes strictes, pas de publicité politique, rapport de "
                                                    "transparence"],
    ["Cadre juridique : données, communication, foncier, emploi", "blocage ou sanction",
     "dossier APDPVP, consultation de la HAC, conventions, conseil juridique avant chaque ouverture"],
    ["Paiements non contractés", "ventes bloquées", "univers sans paiement d'abord ; aucun fonds réel sans preuves"],
    ["Erreurs d'iAsted", "mauvaise orientation, fuite de données", "passerelle, sources visibles, confirmation, "
                                                                     "évaluation, coupe-circuit"],
    ["Coût d'exploitation : Convex, IA, médias", "budget dépassé", "quotas, fil matérialisé, crédits, coût par "
                                                                    "membre actif mesuré"],
    ["Rencontres : mineurs, extorsion, réputation", "atteinte grave", "fermé tant que la preuve de majorité n'est "
                                                                       "pas qualifiée"],
    ["Non-conformité à l'ordonnance 0011", "amendes, référé numérique, suspension de 72 h",
     "registre HAC, délais 24 h et 72 h outillés, vérification d'âge, marquage de l'IA (lot SU01)"],
    ["Image de « réseau de remplacement » d'une censure", "défiance, rejet", "utilité d'abord, transparence, recours, "
                                                                            "export, aucune migration forcée"],
]

# (critère, état, preuve ou responsable) — état : « fait », « livrée » ou « à faire »
CRITERES_GO = [
    ("Les décisions D01 à D08 sont validées et l'ADR « sept univers et vie publique » est accepté.", "fait",
     "ADR-0035, 21/10/2026"),
    ("MP14 a ouvert au moins Boutiques et Services en recette réelle.", "à faire", "session marketplace, lot MP14"),
    ("Une zone pilote et au moins trois vendeurs pilotes par univers ouvert sont identifiés.", "à faire",
     "propriétaire ; dépend de D11, encore proposée"),
    ("Le dossier APDPVP couvre annonces, besoins et iAsted ; la HAC a été consultée pour la vie publique.", "à faire",
     "propriétaire (SU01, § 5)"),
    ("La modération dispose d'une file par univers et d'un délai cible mesurable.", "à faire",
     "SU01d, puis chaque lot d'univers"),
    ("L'analyse de conformité à l'ordonnance 0011 est faite : registre de la HAC, identification, délais, âge.",
     "livrée", "SU01, 21/10/2026 ; à valider par un juriste"),
]

# Ce que demande la suite, d'après SU01 (§ 4 et § 5)
ACTIONS_PROPRIETAIRE = [
    "Compléter l'identité publique de l'éditeur : téléphone, directeur de publication, hébergeurs (art. 25).",
    "Demander à la HAC l'inscription au registre des plateformes (art. 37) et ouvrir le dialogue (art. 35 et 36).",
    "Nommer un représentant légal joignable : le référé numérique se juge « d'heure à heure » (art. 41).",
    "Déposer le dossier APDPVP : inscription, identification, signalements, iAsted, annonces, besoins.",
    "Faire trancher par un juriste les arbitrages A1 à A12 de SU01, en commençant par A1 à A3.",
    "Obtenir le texte de la loi de ratification du 05/10/2026.",
]
PROCHAINS_LOTS = [
    "SU01a : mentions légales complètes, dès que les informations du propriétaire sont là.",
    "SU01d : signalements réglementés, accusé de réception sous 24 h et décision sous 72 h.",
    "SU01h : runbook du référé numérique, éprouvé sur la démo.",
    "SU01b et SU01c : identification et âge, après les arbitrages A1 à A4.",
    "SU02 : Découvrir par piliers, après MP01.",
]
