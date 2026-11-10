"""Schémas de l'étude « sept univers et vie publique » (21 octobre 2026).

Chaque fonction renvoie (slug, svg). Les libellés de l'existant reprennent l'i18n réelle
d'antsia_ga (Fil, Clips, Messages, Découvrir, Profil, Marketplace…) ; tout ce qui est
proposé est marqué comme tel dans le schéma.
"""
from __future__ import annotations

from svgkit import (BLEU, CREUX, DANGER, FIELD, INK, INK2, JAUNE, PANEL, RULE, SUCCESS, VERT, WHITE, Svg,
                    on, text_width)

W = 900

# Les sept univers retenus : (identifiant, nom, icône, action principale, état dans ANTSIA)
UNIVERS = [
    ("boutiques", "Boutiques", "shopping-bag", "Acheter", "En cours (MP05)"),
    ("immobilier", "Immobilier et foncier", "house", "Visiter, louer, acheter", "Nouveau"),
    ("emploi", "Emploi et talents", "briefcase", "Candidater", "En source (P15, MP09)"),
    ("alimentation", "Alimentation et restauration", "utensils", "Commander", "Nouveau gabarit"),
    ("services", "Services et artisans", "wrench", "Devis ou rendez-vous", "En cours (MP06)"),
    ("mobilite", "Auto et mobilité", "car", "Louer ou acheter", "Nouveau"),
    ("ceremonies", "Cérémonies et sorties", "ticket", "Réserver", "Social seulement"),
]


def legend_state(s: Svg, x: float, y: float) -> None:
    """Légende commune : existant (trait plein) / proposé (pointillé)."""
    s.rect(x, y - 11, 26, 14, fill=WHITE, stroke=INK2, rx=4, sw=1.4)
    s.text(x + 34, y, "existe dans le code", 13, 500, INK2)
    x2 = x + 34 + text_width("existe dans le code", 13) + 22
    s.rect(x2, y - 11, 26, 14, fill=WHITE, stroke=INK2, rx=4, sw=1.4, dash="4 3")
    s.text(x2 + 34, y, "proposé par l'étude", 13, 500, INK2)


# --------------------------------------------------------------------------------------
# 01 — Les trois piliers
# --------------------------------------------------------------------------------------
def s01_piliers():
    s = Svg(W, 640, "Les trois piliers d'ANTSIA",
            "Divertissement, business et vie publique sur un socle de confiance, traversés par iAsted.")
    # Fronton
    s.path("M40 108 L450 22 L860 108 Z", color=INK, sw=0, fill=INK)
    s.text(450, 72, "ANTSIA", 30, 800, WHITE, "middle", spacing=3)
    s.text(450, 97, "le réseau social national : une personne, un handle, une identité", 14, 500, WHITE, "middle")
    cols = [
        (JAUNE, "Divertissement", "Revenir chaque jour", "play",
         ["Fil", "Clips", "Stories", "Directs et conférences", "Groupes", "Évènements", "Messages et appels",
          "Rencontres (fermé)"],
         "existe"),
        (VERT, "Business", "Vivre de son activité", "store",
         ["Boutiques", "Immobilier et foncier", "Emploi et talents", "Alimentation et restauration",
          "Services et artisans", "Auto et mobilité", "Cérémonies et sorties"],
         "7 univers"),
        (BLEU, "Vie publique", "S'informer, faire confiance", "landmark",
         ["Administrations (Officiel)", "Agents publics volontaires", "Médias et presse", "Annonceurs étiquetés",
          "Alertes et communiqués", "Liens vers les démarches"],
         "espaces réservés"),
    ]
    x0, cw, gap, top = 58, 248, 18, 126
    for i, (color, name, motto, icon, items, tag) in enumerate(cols):
        x = x0 + i * (cw + gap)
        s.rect(x, top, cw, 372, fill=WHITE, stroke=RULE, rx=14)
        s.rect(x, top, cw, 74, fill=color, rx=14)
        s.rect(x, top + 50, cw, 24, fill=color, rx=0)
        s.icon(icon, x + 18, top + 18, 26, on(color))
        s.text(x + 54, top + 38, name, 21, 800, on(color))
        s.text(x + 54, top + 60, motto, 14, 500, on(color))
        for j, item in enumerate(items):
            yy = top + 102 + j * 29.5
            s.circle(x + 26, yy - 5, 4.5, fill=color if color != JAUNE else INK)
            s.text(x + 40, yy, item, 15, 500, INK)
        s.chip(x + 18, top + 330, tag, color, 13, outline=True)
    # Ruban iAsted
    s.rect(40, 512, 820, 42, fill=INK, rx=21)
    s.icon("sparkles", 62, 521, 24, JAUNE)
    s.text(96, 539, "iAsted traverse les trois piliers : il oriente, trouve et prépare ; la personne confirme.",
           15, 600, WHITE)
    # Socle
    s.rect(24, 566, 852, 62, fill=PANEL, stroke=RULE, rx=10)
    s.icon("shield-check", 42, 582, 26, INK)
    s.text(80, 591, "Socle de confiance", 16, 800, INK)
    s.text(80, 613, "badges calculés · Officiel · Vérifié · Agent public · Communauté · modération nationale · "
                    "PRO.GA gère les activités", 13, 500, INK2)
    return "01-trois-piliers", s.render()


# --------------------------------------------------------------------------------------
# 07 — Page + boutique ou page-boutique ? Trois modèles
# --------------------------------------------------------------------------------------
def s07_modeles():
    s = Svg(W, 600, "Trois façons de représenter un business",
            "Comparaison : deux identités, une page-boutique, ou une page dotée d'espaces et d'un système.")
    cw, gap, x0, top = 276, 16, 22, 20
    titles = [
        ("A", "Page + boutique séparées", "Deux identités"),
        ("B", "Page configurée en boutique", "Une page déguisée"),
        ("C", "Une page, des espaces, un système", "Recommandé"),
    ]
    for i, (letter, title, sub) in enumerate(titles):
        x = x0 + i * (cw + gap)
        good = letter == "C"
        s.rect(x, top, cw, 560, fill=WHITE, stroke=VERT if good else RULE, rx=14, sw=2.4 if good else 1.5)
        s.circle(x + 30, top + 32, 16, fill=VERT if good else INK)
        s.text(x + 30, top + 38, letter, 16, 800, WHITE, "middle")
        s.mtext(x + 56, top + 30, title, cw - 66, 16, 800, INK)
        s.text(x + 56, top + 70, sub, 13, 600, VERT if good else INK2)
    # A : deux boîtes séparées
    x = x0
    s.rect(x + 22, top + 96, 108, 130, fill=PANEL, stroke=FIELD, rx=10)
    s.icon("users", x + 64, top + 108, 24, INK)
    s.text(x + 76, top + 154, "Page", 15, 700, INK, "middle")
    s.text(x + 76, top + 176, "abonnés", 12, 500, INK2, "middle")
    s.text(x + 76, top + 194, "publications", 12, 500, INK2, "middle")
    s.rect(x + 146, top + 96, 108, 130, fill=PANEL, stroke=FIELD, rx=10)
    s.icon("shopping-bag", x + 188, top + 108, 24, INK)
    s.text(x + 200, top + 154, "Boutique", 15, 700, INK, "middle")
    s.text(x + 200, top + 176, "autre nom", 12, 500, INK2, "middle")
    s.text(x + 200, top + 194, "autres abonnés", 12, 500, INK2, "middle")
    s.line(x + 130, top + 160, x + 146, top + 160, DANGER, 2, "3 3")
    # B : une boîte surchargée
    x = x0 + cw + gap
    s.rect(x + 22, top + 96, cw - 44, 130, fill=PANEL, stroke=FIELD, rx=10)
    s.icon("store", x + cw / 2 - 12, top + 106, 24, INK)
    s.text(x + cw / 2, top + 150, "Page = Boutique", 15, 700, INK, "middle")
    for k, lab in enumerate(["Catalogue", "Panier", "Onglet vide", "Onglet vide"]):
        xx = x + 34 + k * 54
        s.rect(xx, top + 168, 48, 40, fill=WHITE, stroke=DANGER if "vide" in lab else RULE, rx=6,
               dash="3 3" if "vide" in lab else None)
        s.text(xx + 24, top + 192, "vide" if "vide" in lab else lab, 10, 600, DANGER if "vide" in lab else INK2, "middle")
    # C : page + espaces + système
    x = x0 + 2 * (cw + gap)
    s.rect(x + 22, top + 92, cw - 44, 40, fill=VERT, rx=10)
    s.icon("users", x + 36, top + 100, 22, WHITE)
    s.text(x + 66, top + 118, "Page : une identité", 14, 700, WHITE)
    spaces = [("shopping-bag", "Boutique"), ("wrench", "Services"), ("house", "Biens"),
              ("key", "Location"), ("briefcase", "Emplois"), ("newspaper", "Média")]
    for k, (ic, lab) in enumerate(spaces):
        col, row = k % 3, k // 3
        xx = x + 22 + col * 78
        yy = top + 144 + row * 44
        s.rect(xx, yy, 72, 38, fill=WHITE, stroke=VERT, rx=8)
        s.icon(ic, xx + 6, yy + 9, 18, VERT)
        s.text(xx + 27, yy + 23, lab, 10.5, 600, INK)
    s.rect(x + 22, top + 238, cw - 44, 34, fill=PANEL, stroke=FIELD, rx=8, dash="5 3")
    s.text(x + cw / 2, top + 260, "PRO.GA, quand l'activité grandit", 12.5, 700, INK, "middle")
    # Avantages / limites
    pros = {
        0: (["Boutique libre de sa présentation"],
            ["Abonnés et avis dispersés", "Deux noms à vérifier, à modérer", "Le client ne sait pas à qui écrire"]),
        1: (["Très simple à expliquer"],
            ["Un seul métier par page", "Onglets inutiles pour un média, une mairie",
             "Vendre et recruter : impossible proprement"]),
        2: (["Une identité, une confiance, un seul fil", "On active ce que l'on fait vraiment",
             "On grandit sans changer d'adresse", "PRO.GA garde stock, prix et engagements"],
            ["Plus de règles à tenir côté serveur"]),
    }
    for i in range(3):
        x = x0 + i * (cw + gap)
        yy = top + 300
        plus, minus = pros[i]
        for p in plus:
            s.icon("circle-check", x + 18, yy - 14, 18, SUCCESS)
            yy += s.mtext(x + 44, yy, p, cw - 60, 13.5, 500, INK) + 8
        for m in minus:
            s.icon("circle-x", x + 18, yy - 14, 18, DANGER)
            yy += s.mtext(x + 44, yy, m, cw - 60, 13.5, 500, INK) + 8
    x = x0 + 2 * (cw + gap)
    s.rect(x + 16, top + 500, cw - 32, 44, fill=VERT, rx=10)
    s.text(x + cw / 2, top + 518, "Déjà retenu le 21/10", 13, 700, WHITE, "middle")
    s.text(x + cw / 2, top + 536, "ADR-0034, décision A01", 12, 500, WHITE, "middle")
    return "07-trois-modeles-page-boutique", s.render()


# --------------------------------------------------------------------------------------
# 08 — L'échelle de l'activité : quand une page, quand un système
# --------------------------------------------------------------------------------------
def s08_echelle():
    s = Svg(W, 640, "L'échelle de l'activité",
            "Du particulier qui publie une annonce à l'entreprise gérée dans PRO.GA ; institutions et médias à part.")
    steps = [
        ("user", "0 · Particulier", "Je publie une annonce",
         "Vendre un frigo, louer mon studio, chercher un emploi. Profil personnel, contact par Messages, "
         "sans encaissement.", "Quand : un besoin ponctuel", True),
        ("users", "1 · Page d'activité", "Je me fais connaître",
         "Nom, logo, abonnés, publications, Stories, directs : une seule identité pour l'activité.",
         "Quand : je publie souvent pour mon activité", False),
        ("layers", "2 · Page + espaces", "Je vends en ligne",
         "J'active Boutique, Prestations, Biens, Location, Emplois ou Média selon mon métier.",
         "Quand : ma première offre", False),
        ("server", "3 · Page + PRO.GA", "Je gère mon entreprise",
         "Stock, prix, devis, agenda, commandes, factures, salariés, encaissement. ANTSIA devient un canal.",
         "Quand : j'encaisse, j'ai du stock ou des salariés", False),
    ]
    base_y, step_w, gap = 616, 200, 17
    for i, (ic, title, motto, body, when, proposed) in enumerate(steps):
        x = 24 + i * (step_w + gap)
        h = 250 + i * 70
        y = base_y - h
        color = [FIELD, VERT, VERT, INK][i]
        s.rect(x, y, step_w, h, fill=WHITE, stroke=color, rx=12, sw=2, dash="6 4" if proposed else None)
        s.rect(x, y, step_w, 50, fill=color, rx=12)
        s.rect(x, y + 30, step_w, 20, fill=color, rx=0)
        s.icon(ic, x + 14, y + 13, 24, WHITE)
        s.text(x + 46, y + 33, title, 15, 800, WHITE)
        s.text(x + 14, y + 76, motto, 15, 700, INK)
        used = s.mtext(x + 14, y + 100, body, step_w - 28, 13, 400, INK2)
        s.mtext(x + 14, y + 100 + used + 12, when, step_w - 28, 12.5, 700, VERT if i else INK2)
        if proposed:
            s.chip(x + 14, base_y - 36, "proposé par l'étude", FIELD, 11.5, outline=True)
        if i < 3:
            s.icon("arrow-right", x + step_w - 4, base_y - h - 34, 22, VERT)
    # Institutions et médias, hors échelle
    s.text(24, 34, "Hors de l'échelle commerciale : leur confiance vient d'une autorité ou d'une rédaction.",
           14, 700, BLEU)
    s.rect(24, 50, 418, 92, fill=WHITE, stroke=BLEU, rx=12, sw=2)
    s.icon("landmark", 40, 66, 24, BLEU)
    s.text(74, 84, "Page Officielle", 16, 800, INK)
    s.mtext(40, 110, "Reflet d'une administration vérifiée d'administration.ga ; jamais obtenue en choisissant "
                     "un modèle de page.", 386, 12.5, 400, INK2)
    s.rect(458, 50, 418, 92, fill=WHITE, stroke=BLEU, rx=12, sw=2)
    s.icon("newspaper", 474, 66, 24, BLEU)
    s.text(508, 84, "Page média", 16, 800, INK)
    s.mtext(474, 110, "Page sociale + site éditorial et rédaction (MP12–MP13) ; badge Officiel réservé "
                      "aux institutions.", 386, 12.5, 400, INK2)
    return "08-echelle-activite", s.render()


import schemas_etude  # noqa: E402
import schemas_fonction  # noqa: E402
import schemas_plan  # noqa: E402
import schemas_technique  # noqa: E402

ALL = [s01_piliers, s07_modeles, s08_echelle, *schemas_etude.ALL, *schemas_fonction.ALL, *schemas_technique.ALL,
       *schemas_plan.ALL]
