"""Construit les schémas SVG, le dossier HTML et le PDF de l'étude.

    python3 build.py svg                 # écrit ../schemas/*.svg
    python3 build.py preview [slug…]     # captures PNG des schémas (dossier temporaire)
    python3 build.py pdf                 # écrit ../ETUDE_SEPT_UNIVERS_ANTSIA.pdf
    python3 build.py md                  # écrit ../ETUDE_SEPT_UNIVERS_ANTSIA.md depuis etude.template.md
    python3 build.py all                 # schémas, Markdown et PDF

Dépendances : Python 3 (bibliothèque standard), Google Chrome pour le rendu,
la police Inter de @fontsource-variable/inter (node_modules du dépôt) si présente.
"""
from __future__ import annotations

import glob
import os
import subprocess
import sys
import tempfile
from pathlib import Path

import schemas

HERE = Path(__file__).resolve().parent
STUDY = HERE.parent
REPO = STUDY.parents[2]
SCHEMAS = STUDY / "schemas"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PDF_NAME = "ETUDE_SEPT_UNIVERS_ANTSIA.pdf"
MD_NAME = "ETUDE_SEPT_UNIVERS_ANTSIA.md"


def inter_font() -> str | None:
    found = glob.glob(str(REPO / "node_modules/.bun/@fontsource-variable+inter@*/node_modules/@fontsource-variable/"
                                 "inter/files/inter-latin-wght-normal.woff2"))
    return found[0] if found else None


def font_face() -> str:
    path = inter_font()
    if not path:
        return ""
    return ("@font-face{font-family:'Inter';src:url('file://%s') format('woff2');font-weight:100 900;"
            "font-style:normal;font-display:block;}" % path)


def write_svgs() -> list[tuple[str, str]]:
    SCHEMAS.mkdir(exist_ok=True)
    out = []
    for make in schemas.ALL:
        slug, svg = make()
        (SCHEMAS / f"{slug}.svg").write_text('<?xml version="1.0" encoding="UTF-8"?>\n' + svg, encoding="utf-8")
        out.append((slug, svg))
    print(f"{len(out)} schémas écrits dans {SCHEMAS}")
    return out


def chrome(args: list[str], attempts: int = 3) -> None:
    """Chrome sans tête, profil jetable par appel (un profil partagé se verrouille)."""
    for attempt in range(attempts):
        with tempfile.TemporaryDirectory(prefix="chrome-sept-univers-") as profile:
            result = subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run",
                                     "--no-default-browser-check", "--allow-file-access-from-files",
                                     f"--user-data-dir={profile}", *args],
                                    stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        if result.returncode == 0:
            return
    raise SystemExit("Chrome a échoué : " + result.stderr.decode(errors="replace")[-800:])


def preview(slugs: list[str]) -> None:
    built = write_svgs()
    target = Path(os.environ.get("PREVIEW_DIR", tempfile.mkdtemp(prefix="sept-univers-")))
    target.mkdir(parents=True, exist_ok=True)
    for slug, svg in built:
        if slugs and slug not in slugs and not any(slug.startswith(p) for p in slugs):
            continue
        width = int(float(svg.split('width="', 1)[1].split('"', 1)[0]))
        height = int(float(svg.split('height="', 1)[1].split('"', 1)[0]))
        html = target / f"{slug}.html"
        html.write_text(f"<!doctype html><meta charset='utf-8'><style>{font_face()}html,body{{margin:0;"
                        f"background:#fff}}</style>{svg}", encoding="utf-8")
        png = target / f"{slug}.png"
        chrome([f"--screenshot={png}", f"--window-size={width},{height}", "--virtual-time-budget=3000",
                f"file://{html}"])
        print(png)


if __name__ == "__main__":
    command = sys.argv[1] if len(sys.argv) > 1 else "svg"
    if command == "svg":
        write_svgs()
    elif command == "preview":
        preview(sys.argv[2:])
    elif command in ("pdf", "md", "all"):
        import dossier
        import markdown
        built = write_svgs()
        if command in ("md", "all"):
            markdown.build(STUDY / MD_NAME)
        if command in ("pdf", "all"):
            dossier.build(built, font_face(), chrome, STUDY / PDF_NAME)
    else:
        raise SystemExit(__doc__)
