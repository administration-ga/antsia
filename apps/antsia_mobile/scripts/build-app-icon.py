#!/usr/bin/env python3
"""Génère assets/app-icon.png, l'icône iOS et Android déclarée dans app.config.ts.

Même dessin que apps/antsia_ga/src/app/favicon.ico (monogramme de la marque : A en Arial
Bold, point bleu), en 1024 px sur fond blanc opaque, marque centrée pour le masque iOS.
Exige macOS (police système) et Pillow ; ne télécharge rien.
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUTPUT = Path(__file__).resolve().parent.parent / "assets/app-icon.png"
FONT = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
# Couleurs relevées dans le favicon publié.
INK = (14, 14, 14)
DOT = (47, 103, 181)
SIZE = 1024
OVERSAMPLING = 4
# Géométrie du favicon, en unités de sa grille de 64 : A (4,12)-(39,47), point de rayon 5,5.
FONT_SIZE = 48
LETTER_CENTER = (21.5, 29.5)
DOT_CENTER = (53.5, 15.5)
DOT_RADIUS = 5.5
MARK_CENTER = (31.5, 28.5)
# La marque couvre 86 % de sa taille dans le favicon : le masque iOS demande plus de marge.
SCALE = 0.86


def main() -> None:
    unit = SIZE / 64 * SCALE * OVERSAMPLING
    canvas = SIZE * OVERSAMPLING
    image = Image.new("RGB", (canvas, canvas), "white")
    draw = ImageDraw.Draw(image)
    origin_x = canvas / 2 - MARK_CENTER[0] * unit
    origin_y = canvas / 2 - MARK_CENTER[1] * unit
    font = ImageFont.truetype(FONT, round(FONT_SIZE * unit))
    left, top, right, bottom = font.getbbox("A")
    draw.text(
        (origin_x + LETTER_CENTER[0] * unit - (left + right) / 2, origin_y + LETTER_CENTER[1] * unit - (top + bottom) / 2),
        "A",
        font=font,
        fill=INK,
    )
    dot_x, dot_y, radius = origin_x + DOT_CENTER[0] * unit, origin_y + DOT_CENTER[1] * unit, DOT_RADIUS * unit
    draw.ellipse((dot_x - radius, dot_y - radius, dot_x + radius, dot_y + radius), fill=DOT)
    image.resize((SIZE, SIZE), Image.LANCZOS).save(OUTPUT, "PNG", optimize=True)


if __name__ == "__main__":
    main()
