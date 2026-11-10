"""Schémas issus de la recherche : constat chiffré, matrice de priorisation, carte du benchmark."""
from __future__ import annotations

from donnees_etude import CANDIDATS
from svgkit import (BLEU, CREUX, DANGER, FIELD, INK, INK2, JAUNE, PANEL, RULE, SUCCESS, VERT, WHITE, Svg,
                    on, text_width)

W = 900


# --------------------------------------------------------------------------------------
# 02 — Le constat en chiffres
# --------------------------------------------------------------------------------------
def s02_constat():
    s = Svg(W, 610, "Le Gabon numérique en chiffres",
            "Neuf chiffres datés et sourcés, et le contexte de 2026 : suspension des réseaux, nouvelle ordonnance.")
    s.rect(22, 16, 856, 92, fill=WHITE, stroke=DANGER, rx=14, sw=2)
    s.icon("triangle-alert", 40, 34, 26, DANGER)
    s.text(78, 50, "Depuis le 17 février 2026, les réseaux sociaux sont suspendus par la HAC", 16, 800, INK)
    s.text(78, 74, "Facebook, Instagram, TikTok, YouTube bloqués ; WhatsApp perturbé ; contournement par VPN ; "
                   "statut au 21/10 incertain.", 13, 500, INK2)
    s.text(78, 96, "Ordonnance 0011/PR/2026 (ratifiée le 05/10/2026) : ANTSIA est une « plateforme » au sens du texte.",
           13, 700, DANGER)
    tiles = [
        ("users", "2,61 M", "habitants ; âge médian 21,5 ans", "DataReportal, oct. 2025", INK),
        ("globe", "1,87 M", "internautes, soit 71,9 %", "DataReportal, oct. 2025", INK),
        ("smartphone", "3,27 M", "connexions mobiles, 88,9 % en 3G ou plus", "GSMA, fin 2025", INK),
        ("wallet", "3,92 M", "comptes mobile money ; 344,6 M de transactions", "BEAC, 2024", VERT),
        ("message-circle", "850 000", "identités sur les réseaux, avant la suspension", "DataReportal, oct. 2025", JAUNE),
        ("triangle-alert", "40 à 50 %", "des adultes ciblés par une arnaque mobile", "Findex, 2024", DANGER),
        ("briefcase", "17,4 %", "de chômage ; environ 34 % des 15-24 ans", "ENEC 2024", BLEU),
        ("store", "62,9 %", "des entreprises sont informelles", "Recensement, fin 2023", VERT),
        ("house", "265 000", "logements manquent, 53 % dans l'Estuaire", "Plan d'accélération, 2025", VERT),
    ]
    tw, th = 276, 148
    for k, (ic, big, label, src, color) in enumerate(tiles):
        col, row = k % 3, k // 3
        x = 22 + col * (tw + 14)
        y = 126 + row * (th + 12)
        s.rect(x, y, tw, th, fill=WHITE, stroke=RULE, rx=14)
        s.icon_badge(ic, x + 32, y + 34, 18, color)
        s.text(x + 62, y + 44, big, 28, 800, INK)
        s.mtext(x + 18, y + 84, label, tw - 36, 14, 600, INK)
        s.text(x + 18, y + th - 16, src, 11.5, 500, INK2)
    return "02-constat-chiffres", s.render()


# --------------------------------------------------------------------------------------
# 03 — Matrice de priorisation
# --------------------------------------------------------------------------------------
def s03_matrice():
    s = Svg(W, 640, "Matrice de priorisation des univers",
            "Valeur pour la population en hauteur, faisabilité en largeur, revenus en taille de cercle.")
    x0, x1, y0, y1 = 96, 868, 40, 556
    xmin, xmax, ymin, ymax = 0.5, 5.2, 2.6, 5.0

    def px(v):
        return x0 + (v - xmin) / (xmax - xmin) * (x1 - x0)

    def py(v):
        return y1 - (v - ymin) / (ymax - ymin) * (y1 - y0)

    s.rect(x0, y0, x1 - x0, y1 - y0, fill=WHITE, stroke=RULE, rx=8)
    qx, qy = px(3.0), py(3.8)
    s.line(qx, y0, qx, y1, FIELD, 1.2, "5 5")
    s.line(x0, qy, x1, qy, FIELD, 1.2, "5 5")
    s.text(x1 - 12, y0 + 22, "Ouvrir d'abord", 14, 800, VERT, "end")
    s.text(x0 + 12, y0 + 22, "Forte valeur, plus de travail", 14, 800, INK2)
    s.text(x1 - 12, y1 - 12, "Faisable, valeur moindre", 13, 700, INK2, "end")
    s.text(x0 + 12, y1 - 12, "Plus tard ou ailleurs", 13, 700, INK2)
    for v in (1, 2, 3, 4, 5):
        s.text(px(v), y1 + 18, str(v), 11.5, 600, INK2, "middle")
    for v in (3, 4, 5):
        s.text(x0 - 10, py(v) + 4, str(v), 11.5, 600, INK2, "end")
    s.text((x0 + x1) / 2, y1 + 40, "Faisabilité : réemploi du code (A) et risque réglementaire inversé →", 13, 700, INK,
           "middle")
    s.add(f'<text x="30" y="{(y0 + y1) / 2:.1f}" font-size="13" font-weight="700" fill="{INK}" text-anchor="middle" '
          f'transform="rotate(-90 30 {(y0 + y1) / 2:.1f})">Valeur pour la population : volume, fréquence, douleur →'
          f'</text>')
    order = sorted(CANDIDATS, key=lambda c: -c["R"])
    for c in order:
        fx = (c["A"] + 6 - c["Rr"]) / 2
        vy = (c["V"] + c["F"] + c["D"]) / 3
        cx, cy = px(fx), py(vy)
        r = 8 + c["R"] * 5
        if c["groupe"] == "retenu":
            s.circle(cx, cy, r, fill=VERT, stroke=WHITE, sw=2)
        elif c["groupe"] == "ailleurs":
            s.circle(cx, cy, r, fill=BLEU if c["couleur"] == "bleu" else INK, stroke=WHITE, sw=2)
        else:
            s.circle(cx, cy, r, fill=WHITE, stroke=DANGER, sw=2.2)
        s.text(cx, cy + 4.5, str(c["score"]), 12, 800, WHITE if c["groupe"] != "ecarte" else DANGER, "middle")
        label = c["court"]
        lx = cx + r + 6
        anchor = "start"
        if lx + text_width(label, 13, True) > x1 - 4 or c["court"] == "Rencontres":
            lx, anchor = cx - r - 6, "end"
        s.text(lx, cy + 4.5, label, 13, 700, INK, anchor)
    # Légende
    ly = 612
    s.circle(110, ly - 4, 8, fill=VERT)
    s.text(124, ly, "univers retenu", 12, 600, INK2)
    s.circle(250, ly - 4, 8, fill=BLEU)
    s.text(264, ly, "autre pilier ou capacité", 12, 600, INK2)
    s.circle(440, ly - 4, 8, fill=WHITE, stroke=DANGER, sw=2)
    s.text(454, ly, "écarté ou fermé", 12, 600, INK2)
    s.text(590, ly, "chiffre = note sur 25 ; taille = revenus", 12, 600, INK2)
    return "03-matrice-priorisation", s.render()


# --------------------------------------------------------------------------------------
# 05 — Carte du benchmark
# --------------------------------------------------------------------------------------
def s05_benchmark():
    s = Svg(W, 620, "Où se placent les plateformes",
            "Une identité ou des comptes séparés ; le social d'abord ou la transaction d'abord. ANTSIA vise une "
            "identité unique, sociale et transactionnelle.")
    x0, x1, y0, y1 = 110, 868, 46, 540
    s.rect(x0, y0, x1 - x0, y1 - y0, fill=WHITE, stroke=RULE, rx=8)
    mx, my = (x0 + x1) / 2, (y0 + y1) / 2
    s.line(mx, y0, mx, y1, FIELD, 1.2, "5 5")
    s.line(x0, my, x1, my, FIELD, 1.2, "5 5")
    s.text(x0, y1 + 24, "← Une identité, des modules", 13, 700, INK)
    s.text(x1, y1 + 24, "Comptes ou applications séparés →", 13, 700, INK, "end")
    s.add(f'<text x="44" y="{y0 + 80}" font-size="13" font-weight="700" fill="{INK}" text-anchor="middle" '
          f'transform="rotate(-90 44 {y0 + 80})">Social d\'abord</text>')
    s.add(f'<text x="44" y="{y1 - 80}" font-size="13" font-weight="700" fill="{INK}" text-anchor="middle" '
          f'transform="rotate(-90 44 {y1 - 80})">Transaction d\'abord</text>')
    pts = [("WeChat", 0.12, 0.47), ("Zalo", 0.22, 0.38), ("Facebook", 0.22, 0.2), ("Instagram", 0.36, 0.1),
           ("LinkedIn", 0.33, 0.3), ("WhatsApp Business", 0.44, 0.44), ("Google (fiche)", 0.3, 0.74),
           ("TikTok + compte vendeur", 0.6, 0.3), ("Leboncoin, Avito", 0.5, 0.78), ("Jiji, CoinAfrique", 0.62, 0.88),
           ("Bayut", 0.78, 0.78), ("Facebook Dating", 0.64, 0.14), ("Tinder", 0.88, 0.22),
           ("Yango, Grab", 0.85, 0.92)]
    for name, fx, fy in pts:
        cx = x0 + fx * (x1 - x0)
        cy = y0 + fy * (y1 - y0)
        s.circle(cx, cy, 7, fill=INK)
        anchor = "start" if fx < 0.8 else "end"
        s.text(cx + (12 if anchor == "start" else -12), cy + 4.5, name, 13, 600, INK, anchor)
    ax, ay = x0 + 0.12 * (x1 - x0), y0 + 0.6 * (y1 - y0)
    s.circle(ax, ay, 22, fill=VERT, stroke=WHITE, sw=3)
    s.icon("star", ax - 11, ay - 11, 22, WHITE)
    s.text(ax + 30, ay - 2, "ANTSIA (cible)", 15, 800, VERT)
    s.text(ax + 30, ay + 17, "une page, des espaces, l'État vérifie", 12.5, 600, INK2)
    s.text(x1, 606, "Lecture de l'étude à partir des faits sourcés du benchmark ; positions indicatives.", 12, 500,
           INK2, "end")
    return "05-benchmark-modeles", s.render()


ALL = [s02_constat, s03_matrice, s05_benchmark]
