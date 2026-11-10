"""Schémas fonctionnels : univers, page d'activité, offre, parcours, vie publique, confiance, navigation."""
from __future__ import annotations

from svgkit import (BLEU, CREUX, DANGER, FIELD, INK, INK2, JAUNE, PANEL, RULE, SUCCESS, VERT, WHITE, Svg,
                    on, text_width)

W = 900

# (nom, icône, à quoi il sert, action principale, état dans ANTSIA, vague)
UNIVERS_FICHES = [
    ("Boutiques", "shopping-bag", "Mode, beauté, téléphonie, électroménager, produits importés",
     "Acheter", "En cours · MP05", "V1"),
    ("Immobilier et foncier", "house", "Location d'abord ; vente et terrains vérifiés",
     "Visiter, louer, acheter", "Nouveau", "V2"),
    ("Emploi et talents", "briefcase", "Offres vérifiées, stages, missions, concours publics",
     "Candidater", "En source · P15, MP09", "V1"),
    ("Alimentation et restauration", "utensils", "Restaurants, traiteurs, plats du jour, produits frais",
     "Commander", "Nouveau gabarit", "V2"),
    ("Services et artisans", "wrench", "Coiffure, couture, réparation, bâtiment, cours, déménagement",
     "Devis ou rendez-vous", "En cours · MP06", "V1"),
    ("Auto et mobilité", "car", "Location avec ou sans chauffeur, occasion importée, pièces",
     "Louer ou acheter", "Nouveau", "V2"),
    ("Cérémonies et sorties", "ticket", "Mariages, deuils, salles, sono ; concerts",
     "Réserver", "Social seulement", "V2 · V5"),
]

STATE_COLOR = {"En cours": VERT, "En source": VERT, "Nouveau": INK, "Social": JAUNE, "Fermé": DANGER}


def state_color(state: str) -> str:
    for key, color in STATE_COLOR.items():
        if state.startswith(key):
            return color
    return FIELD


# --------------------------------------------------------------------------------------
# 04 — Les sept univers
# --------------------------------------------------------------------------------------
def s04_univers():
    s = Svg(W, 560, "Les sept univers business retenus",
            "Sept espaces spécialisés avec leur action principale, leur état actuel et leur vague.")
    cw, ch, gx, gy = 204, 250, 14, 18
    for i, (name, icon, what, action, state, wave) in enumerate(UNIVERS_FICHES):
        col, row = i % 4, i // 4
        x = 22 + col * (cw + gx)
        y = 20 + row * (ch + gy)
        s.rect(x, y, cw, ch, fill=WHITE, stroke=RULE, rx=14)
        s.icon_badge(icon, x + 34, y + 36, 22, VERT)
        s.chip(x + cw - 16 - text_width(wave, 12, True) - 16, y + 24, wave, INK, 12)
        used = s.mtext(x + 16, y + 86, name, cw - 32, 17, 800, INK)
        s.mtext(x + 16, y + 86 + used + 4, what, cw - 32, 13, 400, INK2)
        s.text(x + 16, y + ch - 66, "Action principale", 11.5, 600, INK2)
        s.text(x + 16, y + ch - 46, action, 14, 700, VERT)
        s.chip(x + 16, y + ch - 34, state, state_color(state), 11.5, outline=True, h=22)
    # Huitième case : le socle commun
    x, y = 22 + 3 * (cw + gx), 20 + (ch + gy)
    s.rect(x, y, cw, ch, fill=INK, rx=14)
    s.text(x + 16, y + 34, "Commun aux sept", 17, 800, WHITE)
    items = ["une page, une identité", "une offre typée", "Messages et appels", "iAsted", "badges et vérifications",
             "PRO.GA derrière"]
    for k, it in enumerate(items):
        s.circle(x + 22, y + 64 + k * 29 - 5, 4, fill=JAUNE)
        s.text(x + 34, y + 64 + k * 29, it, 13.5, 500, WHITE)
    return "04-sept-univers", s.render()


# --------------------------------------------------------------------------------------
# 09 — Anatomie d'une page d'activité
# --------------------------------------------------------------------------------------
def s09_anatomie():
    s = Svg(W, 640, "Anatomie d'une page d'activité",
            "Une page sociale, des espaces métier activables, un gabarit de spécialité et PRO.GA derrière.")
    # Page sociale
    s.rect(22, 18, 856, 150, fill=WHITE, stroke=INK, rx=14, sw=2)
    s.text(40, 46, "1 · La page sociale : l'identité de l'activité", 15, 800, INK)
    s.circle(74, 104, 30, fill=CREUX, stroke=FIELD)
    s.icon("store", 62, 92, 24, INK)
    s.text(118, 96, "Nom de l'activité", 18, 800, INK)
    s.chip(118, 108, "Vérifié", VERT, 12)
    s.chip(186, 108, "Boutique", INK, 12, outline=True)
    s.chip(268, 108, "Services", INK, 12, outline=True)
    bx = 560
    for lab, filled in [("Suivre", True), ("Écrire", False)]:
        w = s.chip(bx, 78, lab, VERT if filled else INK, 14, h=34, outline=not filled)
        bx += w + 12
    tabs = ["Publications", "Stories", "Directs", "À propos"]
    tx = 118
    for t in tabs:
        s.text(tx, 156, t, 13.5, 600, INK2)
        tx += text_width(t, 13.5, True) + 26
    s.text(560, 156, "abonnés · avis · Messages", 13, 500, INK2)
    # Gabarits
    s.text(40, 204, "2 · Le gabarit de spécialité : il règle blocs, attributs et actions, jamais les droits ni "
                    "les badges", 15, 800, INK)
    existing = ["Boutique généraliste", "Mode et accessoires", "Artisanat et créations", "Prestataire local",
                "Expert à distance", "Média et rédaction"]
    proposed = ["Agence immobilière", "Loueur de véhicules", "Restauration", "Organisateur d'évènements",
                "Employeur"]
    x, y = 40, 222
    for lab in existing:
        w = text_width(lab, 12.5, True) + 18
        if x + w > 870:
            x, y = 40, y + 34
        s.chip(x, y, lab, INK, 12.5, outline=True, h=26)
        x += w + 8
    for lab in proposed:
        w = text_width(lab, 12.5, True) + 18
        if x + w > 870:
            x, y = 40, y + 34
        s.rect(x, y, w, 26, fill=WHITE, stroke=VERT, rx=13, sw=1.4, dash="4 3")
        s.text(x + w / 2, y + 17.5, lab, 12.5, 600, VERT, "middle")
        x += w + 8
    # Espaces métier
    s.text(40, 322, "3 · Les espaces métier : on active ce que l'on fait vraiment", 15, 800, INK)
    spaces = [
        ("shopping-bag", "Boutique", "Acheter", True),
        ("wrench", "Prestations", "Devis, rendez-vous", True),
        ("briefcase", "Emplois", "Candidater", True),
        ("newspaper", "Média", "Lire, s'abonner", True),
        ("house", "Biens immobiliers", "Visiter, louer", False),
        ("key", "Location", "Réserver", False),
    ]
    tw = 132
    for k, (ic, name, action, exists) in enumerate(spaces):
        x = 22 + k * (tw + 12.8)
        y = 338
        s.rect(x, y, tw, 112, fill=WHITE, stroke=VERT, rx=12, sw=1.8, dash=None if exists else "6 4")
        s.icon(ic, x + 14, y + 14, 24, VERT)
        s.mtext(x + 14, y + 62, name, tw - 24, 14, 700, INK)
        s.text(x + 14, y + 98, action, 12, 600, VERT)
    # PRO.GA
    s.rect(22, 500, 856, 116, fill=PANEL, stroke=FIELD, rx=14, sw=1.6)
    s.icon("server", 40, 518, 26, INK)
    s.text(76, 538, "4 · PRO.GA, le système derrière la page (quand l'activité grandit)", 15, 800, INK)
    s.mtext(40, 566, "Catalogue, variantes, prix, stock, devis, agenda, commandes, factures, recrutement, paiements. "
                     "ANTSIA affiche une projection publiée et envoie des commandes privées ; il ne recopie ni prix "
                     "ni stock.", 820, 13, 400, INK2)
    s.line(300, 498, 300, 454, VERT, 1.8, arrow=True)
    s.text(310, 482, "projection publiée", 12, 600, VERT)
    s.line(600, 454, 600, 498, INK, 1.8, arrow=True)
    s.text(610, 482, "commande privée", 12, 600, INK)
    # Légende
    s.rect(560, 304, 22, 12, fill=WHITE, stroke=VERT, rx=3, sw=1.4)
    s.text(588, 315, "existe", 12, 500, INK2)
    s.rect(640, 304, 22, 12, fill=WHITE, stroke=VERT, rx=3, sw=1.4, dash="4 3")
    s.text(668, 315, "proposé par l'étude", 12, 500, INK2)
    return "09-anatomie-page-activite", s.render()


# --------------------------------------------------------------------------------------
# 10 — Un modèle commun : l'Offre et le Besoin
# --------------------------------------------------------------------------------------
def s10_offre_besoin():
    s = Svg(W, 640, "Un modèle commun : l'offre et le besoin",
            "Une offre typée partagée par les univers, un besoin exprimé par l'acheteur, iAsted rapproche les deux.")
    # Noyau
    cx, cy, cw, chh = 330, 150, 240, 250
    s.rect(cx, cy, cw, chh, fill=INK, rx=16)
    s.icon("tag", cx + 18, cy + 18, 26, JAUNE)
    s.text(cx + 54, cy + 40, "Offre", 22, 800, WHITE)
    core = ["titre, photos, vidéo", "prix : fixe, à partir de, sur devis", "lieu approximatif : province, ville,"
            " quartier", "auteur : page ou particulier", "état, révision, retrait", "confiance : badges et "
            "vérifications"]
    y = cy + 74
    for c in core:
        s.circle(cx + 22, y - 5, 3.5, fill=JAUNE)
        y += s.mtext(cx + 34, y, c, cw - 50, 13, 500, WHITE) + 6
    types = [
        ("shopping-bag", "Produit", "variantes · stock indicatif · retrait ou livraison", "Acheter", 22, 20),
        ("wrench", "Prestation", "zone · durée · forfait · agenda", "Devis, rendez-vous", 22, 170),
        ("house", "Bien immobilier", "type · pièces · loyer ou prix · caution · document foncier",
         "Visiter", 22, 320),
        ("car", "Véhicule", "modèle · année · kilométrage · par jour · chauffeur · caution", "Louer, acheter",
         608, 20),
        ("briefcase", "Emploi", "poste · contrat · lieu · date limite", "Candidater", 608, 170),
        ("ticket", "Billet", "date · lieu · catégorie de place · jauge", "Réserver", 608, 320),
    ]
    for ic, name, attrs, action, x, y in types:
        s.rect(x, y, 270, 130, fill=WHITE, stroke=VERT, rx=12, sw=1.6)
        s.icon(ic, x + 14, y + 14, 22, VERT)
        s.text(x + 44, y + 32, name, 16, 800, INK)
        s.mtext(x + 14, y + 60, attrs, 242, 12.5, 400, INK2)
        s.chip(x + 14, y + 96, action, VERT, 12, h=24)
        if x < 300:
            s.line(x + 270, y + 65, cx, cy + 40 + (y // 150) * 80, FIELD, 1.4, "4 3")
        else:
            s.line(x, y + 65, cx + cw, cy + 40 + (y // 150) * 80, FIELD, 1.4, "4 3")
    # Besoin
    s.rect(22, 474, 556, 146, fill=WHITE, stroke=BLEU, rx=14, sw=2)
    s.icon("search", 40, 492, 24, BLEU)
    s.text(74, 511, "Besoin : « Je cherche… »", 17, 800, INK)
    s.mtext(40, 540, "Exprimé par écrit ou à la voix : univers, critères, budget, zone, échéance. Privé par défaut ; "
                     "publié seulement par un geste explicite (avis de recherche).", 520, 13, 400, INK2)
    s.chip(40, 584, "iAsted rapproche", INK, 12.5, h=24)
    s.chip(176, 584, "alerte quand une offre arrive", BLEU, 12.5, h=24, outline=True)
    s.line(450, 474, 450, 402, BLEU, 2, arrow=True)
    s.line(470, 402, 470, 474, INK, 2, arrow=True)
    # Rencontres, hors marché
    s.rect(596, 474, 282, 146, fill=PANEL, stroke=FIELD, rx=14, dash="6 4")
    s.icon("lock", 612, 492, 22, INK)
    s.text(644, 510, "Profil de rencontre", 16, 800, INK)
    s.mtext(612, 538, "Hors marché : jamais une offre, jamais dans l'index, ni dans iAsted acheteur. Finalité "
                      "séparée (MP10).", 250, 12.5, 400, INK2)
    return "10-offre-et-besoin", s.render()


# --------------------------------------------------------------------------------------
# 11 — Parcours type : louer une maison à Akanda
# --------------------------------------------------------------------------------------
def s11_parcours():
    s = Svg(W, 600, "Parcours type : louer une maison",
            "Du besoin exprimé à iAsted jusqu'à la visite, au bail et à l'avis vérifié.")
    lanes = [("user", "Locataire", BLEU), ("sparkles", "iAsted", INK), ("house", "Agence", VERT),
             ("server", "PRO.GA", FIELD)]
    lx, top, lh = 22, 20, 112
    for k, (ic, name, color) in enumerate(lanes):
        y = top + k * lh
        s.rect(lx, y, 856, lh - 8, fill=PANEL if k % 2 == 0 else WHITE, stroke=RULE, rx=10)
        s.icon(ic, lx + 14, y + 22, 22, color)
        s.text(lx + 14, y + 66, name, 14, 800, INK)
    steps = [
        (0, "1", "Maison 3 chambres à Akanda, moins de 350 000 F"),
        (1, "2", "Trouve et classe les biens publiés"),
        (0, "3", "Choisit deux biens, confirme la visite"),
        (2, "4", "Reçoit la demande, propose un créneau"),
        (3, "5", "Agenda, bail, quittances, s'il l'utilise"),
        (0, "6", "Visite, signe, laisse un avis vérifié"),
    ]
    sx, step, cwid, chh = 124, 118, 160, lh - 24
    prev = None
    for i, (lane, num, label) in enumerate(steps):
        x = sx + i * step
        y = top + lane * lh + 8
        color = lanes[lane][2]
        s.rect(x, y, cwid, chh, fill=WHITE, stroke=color, rx=10, sw=1.8)
        s.circle(x + 18, y + 18, 11, fill=color)
        s.text(x + 18, y + 22.5, num, 12, 800, on(color), "middle")
        s.mtext(x + 38, y + 23, label, cwid - 48, 12.5, 600, INK)
        if prev:
            px, py, plane = prev
            mid = px + cwid / 2
            if lane == plane:
                s.arrow(px + cwid, py + chh / 2, x, y + chh / 2, FIELD)
            else:
                start_y = py + chh if lane > plane else py
                s.path(f"M{mid:.1f} {start_y:.1f} L{mid:.1f} {y + chh / 2:.1f} L{x:.1f} {y + chh / 2:.1f}", FIELD,
                       1.6, arrow=True)
        prev = (x, y, lane)
    # Garde-fous
    s.rect(22, 474, 856, 110, fill=WHITE, stroke=DANGER, rx=12, sw=1.6)
    s.icon("shield-check", 40, 490, 24, DANGER)
    s.text(74, 508, "Garde-fous tout au long du parcours", 15, 800, INK)
    rules = ["Signaler et bloquer à chaque étape", "Aucun paiement demandé sans reçu ni engagement tracé",
             "Document foncier contrôlé quand l'attestation existe (proposé)",
             "iAsted ne contacte personne sans votre confirmation"]
    for k, r in enumerate(rules):
        col, row = k % 2, k // 2
        s.icon("circle-check", 40 + col * 424, 524 + row * 28, 16, SUCCESS)
        s.text(62 + col * 424, 537 + row * 28, r, 13, 500, INK)
    return "11-parcours-louer-maison", s.render()


# --------------------------------------------------------------------------------------
# 12 — Vie publique : espaces réservés dans le fil
# --------------------------------------------------------------------------------------
def s12_vie_publique():
    s = Svg(W, 660, "Vie publique : les espaces réservés du fil",
            "Officiel, presse, contenus des membres, offres et sponsorisé : chacun à sa place et étiqueté.")
    # Téléphone
    px, py, pw, ph = 30, 16, 320, 628
    s.rect(px, py, pw, ph, fill=WHITE, stroke=INK, rx=34, sw=3)
    s.rect(px + 120, py + 12, 80, 8, fill=INK, rx=4)
    cards = [
        (BLEU, "landmark", "Officiel · Communiqué", "Concours : inscriptions ouvertes",
         "réservé, jamais payé"),
        (FIELD, "user", "Membre", "Photo, vidéo, Clip, Story", "le cœur du fil"),
        (BLEU, "newspaper", "Presse · Article", "Média : la une du jour", "label calculé"),
        (VERT, "house", "Offre · Immobilier", "Appartement 2 chambres, Owendo", "carte d'offre"),
        (INK, "megaphone", "Sponsorisé · payé par…", "Entreprise : nouvelle collection", "étiqueté, plafonné"),
    ]
    y = py + 40
    for color, ic, head, body, note in cards:
        h = 98
        s.rect(px + 16, y, pw - 32, h, fill=WHITE, stroke=color, rx=12, sw=2,
               dash="5 4" if head.startswith("Sponsorisé") else None)
        s.rect(px + 16, y, pw - 32, 30, fill=color, rx=12)
        s.rect(px + 16, y + 18, pw - 32, 12, fill=color, rx=0)
        s.icon(ic, px + 28, y + 5, 20, on(color))
        s.text(px + 56, y + 21, head, 13, 700, on(color))
        s.text(px + 30, y + 56, body, 13, 600, INK)
        s.text(px + 30, y + 80, note, 12, 500, INK2, italic=True)
        y += h + 12
    s.rect(px + 16, py + ph - 52, pw - 32, 36, fill=CREUX, rx=18)
    for k, lab in enumerate(["Fil", "Clips", "Messages", "Découvrir", "Profil"]):
        s.text(px + 44 + k * 58, py + ph - 29, lab, 11, 700 if k == 0 else 500, INK, "middle")
    # Règles
    rx_ = 384
    s.text(rx_, 48, "Règles proposées", 20, 800, INK)
    rules = [
        (BLEU, "landmark", "Officiel", "Seules les pages d'administrations reflétées depuis administration.ga ; "
                                       "communiqués et alertes en tête, densité limitée ; jamais sponsorisé."),
        (BLEU, "id-card", "Agents publics", "Badge Agent public pour un agent volontaire ; il parle en son nom, "
                                            "l'institution parle par sa page."),
        (BLEU, "newspaper", "Presse", "Label calculé à partir d'une attestation ; rédaction, corrections "
                                       "publiques ; distinct du badge Officiel."),
        (INK, "megaphone", "Annonceurs", "« Sponsorisé · payé par… », au plus une carte sur dix (à fixer), "
                                         "jamais dans Messages, bibliothèque publique des annonces."),
        (DANGER, "ban", "Politique", "Pas de publicité politique payante ; pages de partis et d'élus "
                                     "étiquetées ; règles renforcées en période électorale."),
        (VERT, "shield-check", "Membres", "Contenus classés sans profilage commercial ; aucune donnée de "
                                          "Messages ou d'achat pour le classement public."),
    ]
    y = 76
    for color, ic, title, body in rules:
        s.icon_badge(ic, rx_ + 20, y + 14, 18, color)
        s.text(rx_ + 50, y + 18, title, 15, 800, INK)
        used = s.mtext(rx_ + 50, y + 40, body, 440, 13, 400, INK2)
        y += 40 + used + 16
    s.rect(rx_, 606, 22, 12, fill=WHITE, stroke=INK2, rx=3, sw=1.4, dash="4 3")
    s.text(rx_ + 30, 617, "Sponsorisé : n'existe pas encore ; Officiel, Presse et badges existent en source.",
           12, 500, INK2)
    return "12-vie-publique-fil", s.render()


# --------------------------------------------------------------------------------------
# 13 — De administration.ga à ANTSIA : la chaîne de publication
# --------------------------------------------------------------------------------------
def s13_federation():
    s = Svg(W, 520, "De administration.ga à ANTSIA",
            "Une publication d'administration n'arrive dans ANTSIA que par un geste explicite et un contrat signé.")
    s.rect(22, 18, 250, 300, fill=PANEL, stroke=FIELD, rx=14)
    s.icon("landmark", 40, 34, 24, BLEU)
    s.text(74, 52, "administration.ga", 16, 800, INK)
    s.text(40, 76, "réseau fermé des agents", 13, 500, INK2)
    s.rect(628, 18, 250, 300, fill=WHITE, stroke=BLEU, rx=14, sw=2)
    s.text(646, 52, "ANTSIA", 16, 800, INK)
    s.text(646, 76, "réseau public", 13, 500, INK2)
    left = [("Agent signataire de la page", "user"), ("Publication + « Diffuser aussi sur ANTSIA »", "megaphone"),
            ("Outbox : révisions, retraits", "database")]
    for k, (lab, ic) in enumerate(left):
        y = 96 + k * 72
        s.rect(40, y, 214, 56, fill=WHITE, stroke=RULE, rx=10)
        s.icon(ic, 52, y + 16, 22, INK)
        s.mtext(84, y + 24, lab, 160, 12.5, 600, INK)
        if k < 2:
            s.arrow(147, y + 56, 147, y + 72, FIELD)
    right = [("Reflet Officiel de la page", "badge-check"), ("Fil racine : pastille Administration", "layout-grid"),
             ("Lecture sans compte, partage", "globe")]
    for k, (lab, ic) in enumerate(right):
        y = 96 + k * 72
        s.rect(646, y, 214, 56, fill=WHITE, stroke=RULE, rx=10)
        s.icon(ic, 658, y + 16, 22, BLEU)
        s.mtext(690, y + 24, lab, 160, 12.5, 600, INK)
        if k < 2:
            s.arrow(753, y + 56, 753, y + 72, FIELD)
    # Contrat
    s.rect(300, 150, 300, 110, fill=INK, rx=14)
    s.icon("lock", 318, 166, 22, JAUNE)
    s.text(350, 184, "Contrat signé et rejouable", 14, 700, WHITE)
    s.text(318, 212, "RESEAU-PUBLIC-V1", 14, 800, JAUNE)
    s.text(318, 236, "via FEDERATION-INBOX-V1", 13, 500, WHITE)
    s.arrow(256, 236, 300, 210, INK, 2)
    s.arrow(600, 210, 644, 140, INK, 2)
    # Agents volontaires
    s.rect(22, 340, 856, 104, fill=WHITE, stroke=BLEU, rx=14, sw=1.6)
    s.icon("id-card", 40, 358, 24, BLEU)
    s.text(74, 376, "Agent public volontaire", 15, 800, INK)
    flow = ["accord donné dans ANTSIA", "code à usage unique", "attestation signée", "badge Agent public"]
    x = 40
    for k, f in enumerate(flow):
        w = text_width(f, 12.5, True) + 22
        s.chip(x, 396, f, BLEU if k == 3 else INK, 12.5, h=28, outline=k != 3)
        x += w + 10
        if k < 3:
            s.icon("arrow-right", x - 10, 400, 18, FIELD)
            x += 14
    s.mtext(22, 474, "Retrait à la source = retrait partout ; la modération locale d'ANTSIA est conservée ; aucun "
                     "profil ni adhésion créés d'office. État : code PA9 raccordé, configuration et recette croisée "
                     "encore à faire (ADR-0013 à 0016).", 856, 12.5, 500, INK2)
    return "13-federation-administration", s.render()


# --------------------------------------------------------------------------------------
# 14 — La chaîne de confiance
# --------------------------------------------------------------------------------------
def s14_confiance():
    s = Svg(W, 690, "La chaîne de confiance",
            "Ce qui est vérifié, par qui, ce que voit le public ; calculé côté serveur, jamais déclaré.")
    head_y = 34
    cols = [(40, "Ce qui est vérifié"), (300, "Par qui"), (560, "Ce que voit le public"), (780, "État")]
    for x, lab in cols:
        s.text(x, head_y, lab, 13, 800, INK2)
    rows = [
        ("user", "La personne", "IDN (niveau de garantie ≥ 2)", ("Vérifié", VERT), "existe"),
        ("id-card", "Le rôle d'agent public", "administration.ga, accord de l'agent", ("Agent public", BLEU),
         "en source"),
        ("landmark", "L'institution", "fédération signée du socle", ("Officiel", BLEU), "en source"),
        ("building-2", "L'entreprise", "PRO.GA : structure, RCCM, NIF", ("Entreprise vérifiée", VERT), "proposé"),
        ("key", "L'agent immobilier", "autorisation d'exercer (loi 006/2017)", ("Agent autorisé", VERT), "proposé"),
        ("house", "Le bien ou le terrain", "service foncier compétent", ("Document contrôlé", VERT), "proposé"),
        ("car", "Le véhicule", "service des cartes grises", ("Carte grise contrôlée", VERT), "proposé"),
        ("newspaper", "Le média", "attestation d'enregistrement", ("Presse", BLEU), "proposé"),
        ("receipt", "L'avis client", "achat, visite ou prestation réalisés", ("Avis vérifié", VERT), "proposé"),
    ]
    y = 56
    for ic, what, who, (label, color), state in rows:
        s.rect(22, y, 856, 56, fill=PANEL if rows.index((ic, what, who, (label, color), state)) % 2 == 0 else WHITE,
               rx=8)
        s.icon(ic, 40, y + 16, 22, INK)
        s.text(72, y + 33, what, 14, 700, INK)
        s.text(300, y + 33, who, 13, 500, INK2)
        s.chip(560, y + 15, label, color, 12.5, h=26)
        dashed = state == "proposé"
        s.rect(780, y + 15, 84, 26, fill=WHITE, stroke=INK2, rx=13, sw=1.3, dash="4 3" if dashed else None)
        s.text(822, y + 32.5, state, 12, 600, INK2, "middle")
        y += 62
    s.rect(22, y + 8, 856, 44, fill=INK, rx=12)
    s.text(450, y + 36, "Principe : calculé à chaque affichage, délivré par l'autorité compétente, retirable à tout "
                        "moment.", 14, 700, WHITE, "middle")
    return "14-chaine-de-confiance", s.render()


# --------------------------------------------------------------------------------------
# 15 — Navigation proposée
# --------------------------------------------------------------------------------------
def s15_navigation():
    s = Svg(W, 680, "Navigation proposée",
            "Cinq destinations conservées ; Découvrir devient la porte des trois piliers ; Créer accueille l'annonce.")

    def phone(x, y, title):
        s.rect(x, y, 300, 640, fill=WHITE, stroke=INK, rx=34, sw=3)
        s.rect(x + 110, y + 12, 80, 8, fill=INK, rx=4)
        s.text(x + 24, y + 58, title, 20, 800, INK)

    # Écran Découvrir
    x0, y0 = 26, 20
    phone(x0, y0, "Découvrir")
    s.rect(x0 + 20, y0 + 74, 260, 40, fill=CREUX, rx=20)
    s.icon("sparkles", x0 + 32, y0 + 82, 22, INK)
    s.text(x0 + 62, y0 + 99, "Demander à iAsted…", 13.5, 500, INK2)
    s.text(x0 + 22, y0 + 142, "Business", 13, 800, VERT)
    tiles = [("shopping-bag", "Boutiques"), ("house", "Immobilier"), ("briefcase", "Emploi"),
             ("utensils", "Restaurants"), ("wrench", "Services"), ("car", "Auto"), ("ticket", "Sorties")]
    for k, (ic, lab) in enumerate(tiles):
        col, row = k % 4, k // 4
        tx, ty = x0 + 20 + col * 66, y0 + 154 + row * 74
        s.rect(tx, ty, 60, 64, fill=WHITE, stroke=VERT, rx=12, sw=1.6)
        s.icon(ic, tx + 18, ty + 10, 24, VERT)
        s.text(tx + 30, ty + 52, lab, 9, 600, INK, "middle")
    s.text(x0 + 22, y0 + 326, "Vie publique", 13, 800, BLEU)
    for k, lab in enumerate(["Infos officielles", "Presse", "Démarches ↗", "Emploi public ↗"]):
        col, row = k % 2, k // 2
        tx, ty = x0 + 20 + col * 132, y0 + 338 + row * 40
        s.rect(tx, ty, 126, 32, fill=WHITE, stroke=BLEU, rx=10, sw=1.5)
        s.text(tx + 63, ty + 21, lab, 11.5, 600, INK, "middle")
    s.text(x0 + 22, y0 + 444, "Divertissement", 13, 800, INK)
    for k, lab in enumerate(["Clips", "Directs", "Groupes", "Évènements", "Rencontres · fermé"]):
        col, row = k % 2, k // 2
        tx, ty = x0 + 20 + col * 132, y0 + 456 + row * 40
        closed = "fermé" in lab
        s.rect(tx, ty, 126, 32, fill=WHITE if closed else JAUNE, stroke=FIELD if closed else None, rx=10,
               dash="4 3" if closed else None)
        s.text(tx + 63, ty + 21, lab, 11.5, 700, INK2 if closed else INK, "middle")
    s.rect(x0 + 16, y0 + 588, 268, 36, fill=CREUX, rx=18)
    for k, lab in enumerate(["Fil", "Clips", "Messages", "Découvrir", "Profil"]):
        s.text(x0 + 42 + k * 54, y0 + 611, lab, 9.5, 800 if lab == "Découvrir" else 500, INK, "middle")
    # Écran Créer
    x1 = 360
    phone(x1, y0, "Créer")
    entries = [("Publication", "existe", "layout-grid"), ("Actu", "existe", "camera"),
               ("Évènement", "existe", "calendar-heart"), ("Conférence", "existe", "radio"),
               ("Annonce de particulier", "proposé", "tag"),
               ("Mon activité", "proposé ici · existe dans Marketplace", "store")]
    for k, (lab, st, ic) in enumerate(entries):
        ty = y0 + 84 + k * 70
        dashed = st.startswith("proposé")
        s.rect(x1 + 20, ty, 260, 58, fill=WHITE, stroke=VERT if dashed else RULE, rx=12, sw=1.6,
               dash="5 4" if dashed else None)
        s.icon(ic, x1 + 34, ty + 17, 24, VERT if dashed else INK)
        s.mtext(x1 + 70, ty + 26, lab, 190, 13, 700, INK)
        s.text(x1 + 70, ty + 46, st, 11, 500, INK2)
    # Notes
    nx = 690
    s.text(nx, 60, "Ce qui change", 18, 800, INK)
    notes = ["La barre garde ses cinq destinations (ADR-0034).",
             "Découvrir range les univers par pilier ; une tuile n'apparaît que si son univers est ouvert.",
             "La recherche iAsted est en tête de Découvrir.",
             "Créer accueille l'annonce de particulier, en plus de « Mon activité ».",
             "Chaque univers ouvre son espace spécialisé, avec « Retour à ANTSIA »."]
    y = 96
    for n in notes:
        s.circle(nx + 6, y - 5, 4, fill=VERT)
        y += s.mtext(nx + 18, y, n, 180, 13, 500, INK) + 12
    s.rect(nx, 600, 22, 12, fill=WHITE, stroke=VERT, rx=3, sw=1.4, dash="4 3")
    s.mtext(nx + 30, 611, "proposé par l'étude ; le reste existe", 160, 12, 500, INK2)
    return "15-navigation-proposee", s.render()


ALL = [s04_univers, s09_anatomie, s10_offre_besoin, s11_parcours, s12_vie_publique, s13_federation, s14_confiance,
       s15_navigation]
