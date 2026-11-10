"""Schémas de stratégie et de déploiement : roue de croissance, modèle économique, feuille de route."""
from __future__ import annotations

import math

from svgkit import (BLEU, CREUX, DANGER, FIELD, INK, INK2, JAUNE, PANEL, RULE, SUCCESS, VERT, WHITE, Svg,
                    on, text_width, wrap)

W = 900


# --------------------------------------------------------------------------------------
# 06 — La roue de croissance
# --------------------------------------------------------------------------------------
def s06_roue():
    s = Svg(W, 600, "La roue de croissance d'ANTSIA",
            "Le divertissement amène le public, le public attire les offres, les offres financent la confiance.")
    cx, cy, r = 520, 300, 210
    nodes = [
        (JAUNE, "play", "Divertissement", "contenus, créateurs, directs"),
        (INK, "users", "Audience quotidienne", "on revient chaque jour"),
        (VERT, "store", "Offres des 7 univers", "les vendeurs vont où est le public"),
        (VERT, "handshake", "Demandes et ventes", "iAsted oriente, Messages relie"),
        (VERT, "hand-coins", "Revenus professionnels", "PRO.GA, mises en avant, sponsorisé"),
        (INK, "shield-check", "Réinvestir", "vérifications, modération, créateurs"),
    ]
    pts = []
    for k in range(len(nodes)):
        a = math.radians(-90 + k * 60)
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    # Arcs
    for k in range(len(nodes)):
        a1 = math.radians(-90 + k * 60 + 17)
        a2 = math.radians(-90 + (k + 1) * 60 - 17)
        x1, y1 = cx + r * math.cos(a1), cy + r * math.sin(a1)
        x2, y2 = cx + r * math.cos(a2), cy + r * math.sin(a2)
        s.path(f"M{x1:.1f} {y1:.1f} A{r} {r} 0 0 1 {x2:.1f} {y2:.1f}", FIELD, 2.2, arrow=True)
    for (color, ic, title, sub), (x, y) in zip(nodes, pts):
        w = max(text_width(title, 14, True), text_width(sub, 12)) + 78
        s.rect(x - w / 2, y - 30, w, 60, fill=WHITE, stroke=color if color != JAUNE else JAUNE, rx=30, sw=2.2)
        s.icon_badge(ic, x - w / 2 + 28, y, 18, color)
        s.text(x - w / 2 + 54, y - 4, title, 14, 800, INK)
        s.text(x - w / 2 + 54, y + 15, sub, 12, 500, INK2)
    # Centre : confiance
    s.circle(cx, cy, 78, fill=BLEU)
    s.icon("badge-check", cx - 14, cy - 50, 28, WHITE)
    s.text(cx, cy - 2, "Confiance", 18, 800, WHITE, "middle")
    s.text(cx, cy + 20, "Officiel · Vérifié", 12, 600, WHITE, "middle")
    s.text(cx, cy + 37, "vérifications d'État", 12, 600, WHITE, "middle")
    # Vie publique en entrée
    s.rect(22, 236, 190, 128, fill=WHITE, stroke=BLEU, rx=14, sw=2)
    s.icon("landmark", 38, 252, 24, BLEU)
    s.text(70, 270, "Vie publique", 15, 800, INK)
    s.mtext(38, 296, "communiqués, concours, alertes, presse : on vient s'informer", 160, 12.5, 500, INK2)
    s.arrow(212, 300, cx - 80, cy, BLEU, 2.4)
    return "06-roue-de-croissance", s.render()


# --------------------------------------------------------------------------------------
# 19 — Qui paie quoi
# --------------------------------------------------------------------------------------
def s19_economie():
    s = Svg(W, 624, "Le modèle économique",
            "Gratuit pour le citoyen ; revenus professionnels étiquetés ; une liste de choses interdites.")
    free = ["S'inscrire, publier, écrire, appeler", "Chercher et comparer les offres", "iAsted du membre",
            "Annonces de particuliers (quota)", "Candidater à un emploi", "Suivre l'information officielle",
            "Rencontres, une fois ouvertes"]
    paid = [("Abonnement PRO.GA", "packs de gestion, crédits Gabaos (barème provisoire)"),
            ("Commission sur ventes encaissées", "modèle P12 : vendeur 90 % ou 85 %, ou contrat (A08)"),
            ("Mise en avant d'une offre", "étiquetée « Mis en avant », dans son univers"),
            ("Contenu sponsorisé", "étiqueté, plafonné, jamais dans Messages"),
            ("Page d'entreprise premium", "statistiques, équipe, assistance"),
            ("Billetterie", "commission payée par l'organisateur"),
            ("Vérification à la demande du vendeur", "à décider : document foncier, carte grise")]
    s.rect(22, 18, 330, 446, fill=WHITE, stroke=BLEU, rx=14, sw=2)
    s.icon_badge("users", 52, 52, 20, BLEU)
    s.text(84, 50, "Toujours gratuit", 18, 800, INK)
    s.text(84, 72, "pour le citoyen", 14, 600, BLEU)
    y = 112
    for f in free:
        s.icon("circle-check", 40, y - 15, 20, SUCCESS)
        y += s.mtext(70, y, f, 266, 14, 500, INK) + 16
    s.rect(370, 18, 508, 446, fill=WHITE, stroke=VERT, rx=14, sw=2)
    s.icon_badge("building-2", 400, 52, 20, VERT)
    s.text(432, 50, "Payé par les professionnels", 18, 800, INK)
    s.text(432, 72, "revenus B2B, toujours étiquetés", 14, 600, VERT)
    y = 108
    for title, note in paid:
        s.icon("banknote", 388, y - 14, 20, VERT)
        s.text(418, y, title, 14, 700, INK)
        s.text(418, y + 19, note, 12, 500, INK2)
        y += 52
    s.rect(22, 478, 856, 132, fill=WHITE, stroke=DANGER, rx=14, sw=2)
    s.icon("ban", 40, 494, 24, DANGER)
    s.text(74, 513, "Jamais", 18, 800, DANGER)
    never = ["vendre des données personnelles", "publicité dans Messages", "classement payé caché",
             "frais pour candidater", "publicité politique payante", "profilage sensible"]
    x, y = 40, 532
    for n in never:
        w = text_width(n, 13, True) + 22
        if x + w > 870:
            x, y = 40, y + 36
        s.chip(x, y, n, DANGER, 13, h=28, outline=True)
        x += w + 10
    return "19-modele-economique", s.render()


# --------------------------------------------------------------------------------------
# 20 — Feuille de route par vagues
# --------------------------------------------------------------------------------------
def s20_feuille_de_route():
    s = Svg(W, 700, "Feuille de route par vagues",
            "Six vagues ordonnées par dépendances ; les conditions externes ouvrent les branches fermées.")
    lanes = [
        ("V0", "Décider et se conformer", "12 décisions, ADR, analyse juridique", INK, 0, 1.4),
        ("V1", "Consolider l'existant", "MP00–MP14 : boutiques, services, presse, pros · emploi P15", VERT, 0.4, 3.4),
        ("V2", "Univers sans paiement en ligne", "immobilier et foncier · auto · restauration · annonces", VERT,
         1.4, 4.6),
        ("V3", "Vie publique", "Officiel en recette, alertes, label Presse, annonceurs, règle politique", BLEU,
         1.4, 4.2),
        ("V4", "iAsted", "a · recherche et besoins → b · agent vendeur → c · actions confirmées", INK, 2.2, 6.0),
        ("V5", "Paiement, cérémonies, sorties", "billetterie, réservations payées, vente en direct", JAUNE, 4.6, 6.6),
        ("C", "Rencontres", "ouverture après une preuve de majorité qualifiée", DANGER, 5.2, 6.6),
    ]
    x0, x1, top, lh = 250, 878, 60, 74
    span = 6.8
    for k in range(7):
        gx = x0 + (x1 - x0) * k / span * 1.0
        s.line(gx, top - 16, gx, top + lh * len(lanes) - 6, RULE, 1)
    s.text(x0, top - 26, "maintenant", 12, 700, INK2)
    s.text(x1, top - 26, "plus tard", 12, 700, INK2, "end")
    for k, (code, title, body, color, a, b) in enumerate(lanes):
        y = top + k * lh
        s.rect(22, y, 856, lh - 8, fill=PANEL if k % 2 == 0 else WHITE, rx=10)
        s.chip(34, y + 12, code, color if color != JAUNE else JAUNE, 12.5, h=24)
        s.text(76, y + 29, title, 14, 800, INK)
        s.mtext(34, y + 52, body, 200, 11, 500, INK2)
        bx = x0 + (x1 - x0) * a / span
        bw = (x1 - x0) * (b - a) / span
        dashed = code in ("V5", "C")
        s.rect(bx, y + 16, bw, 34, fill=WHITE if dashed else color, stroke=color, rx=17, sw=2,
               dash="6 4" if dashed else None)
        if dashed:
            s.text(bx + 24, y + 38, "sous condition", 12.5, 700, INK if color == JAUNE else DANGER)
    # Portes externes
    gates = [("contrat de paiement", 4.6, 5), ("preuve de majorité", 5.2, 6),
             ("convention foncière", 4.6, 2)]
    for label, at, lane in gates:
        gx = x0 + (x1 - x0) * at / span
        gy = top + lane * lh + 33
        s.path(f"M{gx} {gy - 14} L{gx + 14} {gy} L{gx} {gy + 14} L{gx - 14} {gy} Z", color=INK, sw=0, fill=JAUNE)
        if lane == 2:
            s.text(gx + 20, gy + 5, label, 11.5, 700, INK)
    s.rect(22, top + 7 * lh + 6, 856, 72, fill=WHITE, stroke=RULE, rx=12)
    s.path(f"M44 {top + 7 * lh + 28} L58 {top + 7 * lh + 42} L44 {top + 7 * lh + 56} L30 {top + 7 * lh + 42} Z",
           color=INK, sw=0, fill=JAUNE)
    s.mtext(70, top + 7 * lh + 34, "Porte externe : contrat avec un prestataire de paiement, service de preuve de "
                                   "majorité, convention avec le service foncier. Les tailles relatives ne sont pas "
                                   "des délais promis.", 790, 12.5, 500, INK2)
    return "20-feuille-de-route", s.render()


ALL = [s06_roue, s19_economie, s20_feuille_de_route]
