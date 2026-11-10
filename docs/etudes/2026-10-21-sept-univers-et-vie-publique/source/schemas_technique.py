"""Schémas techniques : architecture de l'écosystème et architecture d'iAsted."""
from __future__ import annotations

from svgkit import (BLEU, CREUX, DANGER, FIELD, INK, INK2, JAUNE, PANEL, RULE, SUCCESS, VERT, WHITE, Svg,
                    on, text_width)

W = 900


def node(s: Svg, x, y, w, h, icon, title, lines, color, dashed=False, title_size=15):
    s.rect(x, y, w, h, fill=WHITE, stroke=color, rx=12, sw=2, dash="6 4" if dashed else None)
    s.icon(icon, x + 14, y + 13, 22, color if color != JAUNE else INK)
    s.text(x + 44, y + 30, title, title_size, 800, INK)
    yy = y + 54
    for ln in lines:
        yy += s.mtext(x + 14, yy, ln, w - 28, 12, 500, INK2) + 2


def edge_label(s: Svg, x, y, label, color=INK, size=11):
    w = text_width(label, size, True) + 12
    s.rect(x - w / 2, y - size - 3, w, size + 9, fill=WHITE, stroke=color, rx=6, sw=1)
    s.text(x, y + 1, label, size, 700, color, "middle")


# --------------------------------------------------------------------------------------
# 16 — Architecture de l'écosystème
# --------------------------------------------------------------------------------------
def s16_ecosysteme():
    s = Svg(W, 720, "Architecture de l'écosystème",
            "ANTSIA au centre, relié par contrats signés à IDN, administration.ga, PRO.GA, aux plateformes "
            "publiques, aux paiements et à iAsted.")
    # Centre ANTSIA
    cx, cy, cw, ch = 300, 236, 300, 248
    s.rect(cx, cy, cw, ch, fill=INK, rx=16)
    s.text(cx + 20, cy + 36, "ANTSIA", 22, 800, WHITE)
    s.text(cx + 20, cy + 58, "moteur social national (Convex)", 13, 500, WHITE)
    nets = [("antsia · racine publique", JAUNE), ("diasporale · fermé", WHITE), ("administration · miroir", WHITE)]
    y = cy + 76
    for lab, color in nets:
        s.rect(cx + 20, y, cw - 40, 26, fill=color if color == JAUNE else INK, stroke=WHITE if color != JAUNE else None,
               rx=13, sw=1)
        s.text(cx + cw / 2, y + 17.5, lab, 12.5, 700, INK if color == JAUNE else WHITE, "middle")
        y += 32
    s.mtext(cx + 20, y + 16, "antsia.ga (Web) · application mobile · console d'exploitation", cw - 40, 12.5, 600,
            WHITE)
    s.mtext(cx + 20, y + 52, "personnes, pages, publications, Messages, projections commerciales", cw - 40, 12,
            400, CREUX)
    # Nœuds
    node(s, 22, 30, 236, 118, "id-card", "identite.ga (IDN)",
         ["Fournisseur d'identité unique", "OIDC + PKCE, niveau de garantie → badge Vérifié"], BLEU)
    node(s, 22, 322, 236, 120, "landmark", "administration.ga",
         ["iRéseau des agents (réseau fermé)", "pages et publications des administrations"], BLEU)
    node(s, 22, 560, 236, 118, "globe", "DIASPORALE",
         ["application du même moteur", "ses membres sont inclus dans ANTSIA"], INK)
    node(s, 642, 30, 236, 136, "server", "PRO.GA",
         ["système des activités : catalogue, stock, devis, agenda, commandes, recrutement",
          "agent commercial (iAsted)"], VERT)
    node(s, 642, 300, 236, 120, "wallet", "Paiements",
         ["Airtel Money · Moov Money · carte", "fermé : aucun contrat de prestataire"], DANGER, dashed=True)
    node(s, 642, 560, 236, 118, "sparkles", "Passerelle iAsted",
         ["droits, crédits, classes de données, journal (plan iAsted 2.0)"], INK, dashed=True)
    node(s, 300, 30, 300, 118, "briefcase", "travail.ga · demarche.ga",
         ["emploi public (PNPE) et démarches citoyennes", "liens et projections publiques à convenir"], BLEU,
         dashed=True)
    node(s, 300, 560, 300, 118, "file-check-corner", "Attestations à venir",
         ["foncier · cartes grises · enregistrement des médias", "par contrats signés, jamais de lecture de base"],
         VERT, dashed=True)
    # Arêtes
    s.line(258, 89, cx, cy + 30, BLEU, 2, arrow=True)
    edge_label(s, 262, 176, "connexion IDN", BLEU)
    s.line(258, 382, cx, 382, BLEU, 2, arrow=True)
    edge_label(s, 140, 306, "RESEAU-PUBLIC-V1 (fédération signée)", BLEU)
    s.line(258, 600, cx + 30, cy + ch, INK, 2)
    edge_label(s, 250, 530, "même backend", INK)
    s.line(642, 98, cx + cw, cy + 40, VERT, 2, arrow=True)
    s.line(cx + cw, cy + 70, 642, 128, VERT, 2, "5 4", arrow=True)
    edge_label(s, 640, 186, "PRO-COMMERCE-PUBLIC-V1", VERT)
    edge_label(s, 640, 212, "PRO-COMMERCE-COMMAND-V1", VERT)
    s.line(760, 166, 760, 300, DANGER, 2, "5 4", arrow=True)
    edge_label(s, 760, 240, "via PRO.GA", DANGER)
    s.line(642, 620, cx + cw, cy + ch - 30, INK, 2, "5 4", arrow=True)
    edge_label(s, 650, 540, "proposé", INK)
    s.line(450, 148, 450, cy, BLEU, 2, "5 4")
    s.line(450, 560, 450, cy + ch, VERT, 2, "5 4", arrow=True)
    # Légende
    s.line(320, 704, 352, 704, INK2, 2)
    s.text(360, 708, "existe ou en source", 12, 500, INK2)
    s.line(500, 704, 532, 704, INK2, 2, "5 4")
    s.text(540, 708, "proposé ou fermé", 12, 500, INK2)
    return "16-architecture-ecosysteme", s.render()


# --------------------------------------------------------------------------------------
# 17 — iAsted : rôles, chaîne de décision et garde-fous
# --------------------------------------------------------------------------------------
def s17_iasted():
    s = Svg(W, 684, "iAsted dans ANTSIA",
            "Trois rôles, six étapes de la demande à l'action, la personne confirme ; huit garde-fous.")
    roles = [
        (BLEU, "user", "iAsted du membre", "Cherche, compare, prépare, crée des alertes", "proposé dans ANTSIA"),
        (VERT, "store", "Agent du vendeur", "Répond à partir du catalogue approuvé, qualifie, passe la main",
         "existe dans PRO.GA"),
        (BLEU, "landmark", "iAsted citoyen", "Oriente vers l'administration compétente et la démarche",
         "existe sur demarche.ga"),
    ]
    for k, (color, ic, title, body, state) in enumerate(roles):
        x = 22 + k * 292
        s.rect(x, 18, 272, 130, fill=WHITE, stroke=color, rx=14, sw=2, dash="6 4" if "proposé" in state else None)
        s.icon_badge(ic, x + 34, 52, 20, color)
        s.text(x + 64, 58, title, 16, 800, INK)
        s.mtext(x + 18, 96, body, 236, 13, 500, INK2)
        s.text(x + 18, 136, state, 12, 700, color)
    steps = [("Comprendre", "intention, univers, critères, budget, zone"),
             ("Chercher", "offres publiées et admissibles, besoins publics"),
             ("Classer", "pertinence, confiance, fraîcheur ; sponsorisé à part"),
             ("Proposer", "cartes d'offres, raisons et sources visibles"),
             ("Confirmer", "la personne valide chaque action"),
             ("Agir", "les vraies fonctions, droits relus, journal")]
    sw_ = 140
    for k, (title, body) in enumerate(steps):
        x = 22 + k * (sw_ + 4)
        y = 176
        color = INK if k != 4 else VERT
        s.path(f"M{x} {y} H{x + sw_ - 14} L{x + sw_} {y + 36} L{x + sw_ - 14} {y + 72} H{x} "
               f"L{x + 14 if k else x} {y + 36} Z", color=color, sw=0, fill=color)
        s.text(x + (26 if k else 14), y + 33, f"{k + 1}", 13, 800, JAUNE if k != 4 else WHITE)
        s.text(x + (42 if k else 30), y + 33, title, 14, 800, WHITE)
        s.mtext(x + 6, y + 98, body, sw_ - 12, 12, 500, INK)
    # Garde-fous
    s.text(22, 342, "Garde-fous", 18, 800, INK)
    rails = [("bot", "Se présente comme une IA"), ("wallet", "Ne paie jamais seul"),
             ("lock", "Ne lit ni les Messages privés ni les Rencontres"),
             ("ban", "Aucun profilage politique ou sensible"), ("eye", "Raisons et sources visibles"),
             ("megaphone", "Sponsorisé jamais mélangé aux résultats"),
             ("database", "Mémoire choisie par la personne, effaçable"),
             ("shield-check", "Quotas, coupe-circuit et journal par la passerelle")]
    for k, (ic, lab) in enumerate(rails):
        col, row = k % 2, k // 2
        x = 22 + col * 436
        y = 358 + row * 50
        s.rect(x, y, 420, 42, fill=PANEL, rx=10)
        s.icon(ic, x + 12, y + 10, 22, DANGER if ic in ("ban", "lock", "wallet") else INK)
        s.text(x + 44, y + 26, lab, 13.5, 600, INK)
    # Réemploi
    s.rect(22, 572, 856, 96, fill=WHITE, stroke=VERT, rx=14, sw=1.6)
    s.icon("layers", 40, 588, 24, VERT)
    s.text(74, 606, "Déjà éprouvé dans PRO.GA, à réutiliser", 15, 800, INK)
    s.mtext(40, 632, "outils exécutés par le serveur avant l'appel au modèle · sorties JSON strictes · offres "
                     "approuvées à version figée · autorisations qui expirent · transfert à un humain · quotas "
                     "réservés avant l'appel · confirmation humaine imposée par le schéma", 820, 12.5, 500, INK2)
    return "17-iasted-architecture", s.render()


ALL = [s16_ecosysteme, s17_iasted]
