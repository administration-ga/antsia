"""Petite boîte à outils SVG des schémas de l'étude « sept univers ».

Couleurs : les trois couleurs de la charte Gaboma (packages/ui/src/themes/antsia.css),
une par pilier, sur des fonds neutres ; rouge et vert de rôle réservés à Interdit / Validé.
Icônes : tracés lucide (ISC) extraits une fois dans icons.json par extract_icons.py.
"""
from __future__ import annotations

import json
from html import escape
from pathlib import Path

# Piliers : Business = vert, Divertissement = jaune (safran), Vie publique = bleu.
VERT = "#007E4D"
JAUNE = "#F4BB44"
BLEU = "#2F67B5"
INK = "#0A0A0A"
INK2 = "#616161"
RULE = "#E6E6E6"
FIELD = "#878787"
CREUX = "#EEEEEE"
PANEL = "#F6F6F6"
WHITE = "#FFFFFF"
DANGER = "#C8102E"
SUCCESS = "#00804E"

FONT = "Inter, 'Inter Variable', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"

ICONS = json.loads(Path(__file__).with_name("icons.json").read_text(encoding="utf-8"))

# Largeurs moyennes approximatives des glyphes d'Inter, en fraction de la taille.
_NARROW = set("iljtfr.,;:!'’|()[] ")
_WIDE = set("mwMW@%")


def on(color: str) -> str:
    """Texte lisible sur un aplat de la charte."""
    return INK if color in (JAUNE, WHITE, PANEL, CREUX) else WHITE


def text_width(s: str, size: float, bold: bool = False) -> float:
    w = 0.0
    for ch in s:
        if ch in _NARROW:
            w += 0.30
        elif ch in _WIDE:
            w += 0.86
        elif ch.isupper():
            w += 0.68
        elif ch.isdigit():
            w += 0.60
        else:
            w += 0.56
    return w * size * (1.06 if bold else 1.0)


def wrap(s: str, max_width: float, size: float, bold: bool = False) -> list[str]:
    """Coupe un texte en lignes qui tiennent dans max_width ; respecte les \\n explicites."""
    lines: list[str] = []
    for para in s.split("\n"):
        current = ""
        for word in para.split(" "):
            candidate = word if not current else current + " " + word
            if text_width(candidate, size, bold) <= max_width or not current:
                current = candidate
            else:
                lines.append(current)
                current = word
        lines.append(current)
    return lines


class Svg:
    """Accumulateur d'éléments SVG avec marqueurs de flèches par couleur."""

    def __init__(self, width: float, height: float, title: str, desc: str = ""):
        self.width = width
        self.height = height
        self.title = title
        self.desc = desc
        self.parts: list[str] = []
        self.markers: set[str] = set()

    # --- primitives -----------------------------------------------------------------
    def add(self, raw: str) -> None:
        self.parts.append(raw)

    def rect(self, x, y, w, h, fill=WHITE, stroke=None, rx=10, sw=1.5, dash=None, opacity=None):
        attrs = f'x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="{rx}" fill="{fill}"'
        if stroke:
            attrs += f' stroke="{stroke}" stroke-width="{sw}"'
        if dash:
            attrs += f' stroke-dasharray="{dash}"'
        if opacity is not None:
            attrs += f' opacity="{opacity}"'
        self.add(f"<rect {attrs}/>")

    def circle(self, cx, cy, r, fill=WHITE, stroke=None, sw=1.5, dash=None):
        attrs = f'cx="{cx:.1f}" cy="{cy:.1f}" r="{r:.1f}" fill="{fill}"'
        if stroke:
            attrs += f' stroke="{stroke}" stroke-width="{sw}"'
        if dash:
            attrs += f' stroke-dasharray="{dash}"'
        self.add(f"<circle {attrs}/>")

    def line(self, x1, y1, x2, y2, color=FIELD, sw=1.5, dash=None, arrow=False, arrow_start=False):
        attrs = f'x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{color}" stroke-width="{sw}"'
        if dash:
            attrs += f' stroke-dasharray="{dash}"'
        if arrow:
            attrs += f' marker-end="url(#{self._marker(color)})"'
        if arrow_start:
            attrs += f' marker-start="url(#{self._marker(color, start=True)})"'
        self.add(f'<line {attrs} stroke-linecap="round"/>')

    def path(self, d, color=FIELD, sw=1.5, fill="none", dash=None, arrow=False, arrow_start=False):
        attrs = f'd="{d}" stroke="{color}" stroke-width="{sw}" fill="{fill}"'
        if dash:
            attrs += f' stroke-dasharray="{dash}"'
        if arrow:
            attrs += f' marker-end="url(#{self._marker(color)})"'
        if arrow_start:
            attrs += f' marker-start="url(#{self._marker(color, start=True)})"'
        self.add(f'<path {attrs} stroke-linecap="round" stroke-linejoin="round"/>')

    def text(self, x, y, s, size=15, weight=400, fill=INK, anchor="start", italic=False, spacing=None):
        style = ' font-style="italic"' if italic else ""
        if spacing is not None:
            style += f' letter-spacing="{spacing}"'
        self.add(
            f'<text x="{x:.1f}" y="{y:.1f}" font-size="{size}" font-weight="{weight}" fill="{fill}" '
            f'text-anchor="{anchor}"{style}>{escape(s)}</text>'
        )

    def mtext(self, x, y, s, width, size=15, weight=400, fill=INK, anchor="start", leading=1.32, italic=False):
        """Texte multiligne coupé à la largeur ; renvoie la hauteur occupée."""
        lines = wrap(s, width, size, weight >= 600)
        for i, ln in enumerate(lines):
            self.text(x, y + i * size * leading, ln, size, weight, fill, anchor, italic)
        return len(lines) * size * leading

    def icon(self, name, x, y, size=24, color=INK, sw=2):
        scale = size / 24
        self.add(
            f'<g transform="translate({x:.1f} {y:.1f}) scale({scale:.4f})" fill="none" stroke="{color}" '
            f'stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round">{ICONS[name]}</g>'
        )

    # --- composés -------------------------------------------------------------------
    def chip(self, x, y, label, color, size=13, pad=9, h=None, weight=600, outline=False):
        """Pastille arrondie ; renvoie sa largeur."""
        h = h or size + 11
        w = text_width(label, size, True) + 2 * pad
        if outline:
            self.rect(x, y, w, h, fill=WHITE, stroke=color, rx=h / 2, sw=1.4)
            ink = INK if color == JAUNE else color
            self.text(x + w / 2, y + h / 2 + size * 0.36, label, size, weight, ink, "middle")
        else:
            self.rect(x, y, w, h, fill=color, rx=h / 2)
            self.text(x + w / 2, y + h / 2 + size * 0.36, label, size, weight, on(color), "middle")
        return w

    def icon_badge(self, name, cx, cy, r, color, icon_color=None):
        """Médaillon rond portant une icône."""
        self.circle(cx, cy, r, fill=color)
        size = r * 1.1
        self.icon(name, cx - size / 2, cy - size / 2, size, icon_color or on(color), sw=2)

    def card(self, x, y, w, h, accent, title, body="", icon=None, title_size=17, body_size=14, fill=WHITE):
        """Carte blanche à filet d'accent supérieur, titre, icône et texte."""
        self.rect(x, y, w, h, fill=fill, stroke=RULE, rx=12)
        self.add(
            f'<path d="M{x + 12:.1f} {y:.1f} H{x + w - 12:.1f} A12 12 0 0 1 {x + w:.1f} {y + 12:.1f} V{y + 6:.1f} '
            f'H{x:.1f} V{y + 12:.1f} A12 12 0 0 1 {x + 12:.1f} {y:.1f} Z" fill="{accent}"/>'
        )
        tx = x + 16
        ty = y + 32
        if icon:
            self.icon(icon, x + 16, y + 17, 22, accent if accent != JAUNE else INK)
            tx = x + 46
        used = self.mtext(tx, ty, title, w - (tx - x) - 14, title_size, 700, INK)
        if body:
            self.mtext(x + 16, ty + used + 6, body, w - 32, body_size, 400, INK2)

    def arrow(self, x1, y1, x2, y2, color=FIELD, sw=1.8, dash=None):
        self.line(x1, y1, x2, y2, color, sw, dash, arrow=True)

    # --- rendu ----------------------------------------------------------------------
    def _marker(self, color, start=False):
        key = ("s" if start else "e") + color.lstrip("#")
        self.markers.add(key)
        return f"m{key}"

    def render(self) -> str:
        defs = []
        for key in sorted(self.markers):
            color = "#" + key[1:]
            if key[0] == "e":
                defs.append(
                    f'<marker id="m{key}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" '
                    f'orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="{color}"/></marker>'
                )
            else:
                defs.append(
                    f'<marker id="m{key}" viewBox="0 0 10 10" refX="1.5" refY="5" markerWidth="7" markerHeight="7" '
                    f'orient="auto"><path d="M10 0 L0 5 L10 10 z" fill="{color}"/></marker>'
                )
        head = (
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {self.width} {self.height}" '
            f'width="{self.width}" height="{self.height}" font-family="{FONT}" role="img" '
            f'aria-labelledby="t d">'
            f'<title id="t">{escape(self.title)}</title><desc id="d">{escape(self.desc or self.title)}</desc>'
            f'<defs>{"".join(defs)}</defs>'
            f'<rect x="0" y="0" width="{self.width}" height="{self.height}" fill="{WHITE}"/>'
        )
        return head + "".join(self.parts) + "</svg>"
