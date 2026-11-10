"""Assemble le dossier HTML imprimable (A4) et le rend en PDF avec Chrome sans tête.

Le texte vit dans contenu.py ; les schémas sont insérés depuis leurs SVG générés.
"""
from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path

import contenu

CSS = r"""
@page { size: A4; margin: 15mm 15mm 17mm 15mm;
  @bottom-left { content: "ANTSIA · Sept univers pour le Gabon · étude du 21 octobre 2026";
                 font: 500 7.5pt Inter, sans-serif; color: #616161; }
  @bottom-right { content: counter(page) " / " counter(pages); font: 600 7.5pt Inter, sans-serif; color: #616161; }
}
@page couverture { margin: 0; @bottom-left { content: none; } @bottom-right { content: none; } }
:root { --vert: #007E4D; --jaune: #F4BB44; --bleu: #2F67B5; --ink: #0A0A0A; --ink2: #616161; --rule: #E6E6E6;
        --panel: #F6F6F6; --danger: #C8102E; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; font-family: Inter, system-ui, sans-serif; font-size: 9.4pt; line-height: 1.45; color: var(--ink);
       font-feature-settings: "cv11", "ss01"; background: #fff; }
.couverture { page: couverture; height: 297mm; position: relative; padding: 0; overflow: hidden; }
.couverture .bandes { display: flex; height: 9mm; }
.couverture .bandes span { flex: 1; }
.couverture .corps { padding: 26mm 20mm 0 20mm; }
.couverture .programme { font-size: 9pt; font-weight: 700; letter-spacing: .18em; text-transform: uppercase;
                         color: var(--ink2); }
.couverture h1 { font-size: 34pt; line-height: 1.06; font-weight: 800; margin: 7mm 0 4mm; letter-spacing: -.01em; }
.couverture .sous-titre { font-size: 13.5pt; line-height: 1.35; color: var(--ink2); font-weight: 500;
                          max-width: 150mm; }
.cover-piliers { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5mm; margin: 16mm 0 8mm; }
.cover-piliers div { padding-top: 3mm; }
.cover-piliers b { display: block; font-size: 15pt; font-weight: 800; }
.cover-piliers span { display: block; font-size: 10pt; color: var(--ink2); margin-top: 1mm; }
.couverture .formule { margin-top: 6mm; font-size: 16pt; }
.couverture .figure { margin: 12mm 0 0; }
.couverture .figure svg { width: 100%; height: auto; }
.couverture .meta { position: absolute; left: 20mm; right: 20mm; bottom: 18mm; display: grid;
                    grid-template-columns: repeat(4, 1fr); gap: 6mm; border-top: 1.5px solid var(--ink);
                    padding-top: 4mm; font-size: 8.4pt; }
.couverture .meta b { display: block; font-size: 7.4pt; letter-spacing: .12em; text-transform: uppercase;
                      color: var(--ink2); margin-bottom: 1mm; }
section { break-before: page; }
section.suite { break-before: auto; margin-top: 8mm; }
.kicker { font-size: 7.6pt; font-weight: 800; letter-spacing: .16em; text-transform: uppercase; margin: 0 0 1.5mm; }
.kicker.vert { color: var(--vert); } .kicker.bleu { color: var(--bleu); } .kicker.ink { color: var(--ink); }
.kicker.jaune { color: #8A6100; }
h2 { font-size: 19pt; line-height: 1.12; font-weight: 800; margin: 0 0 3mm; letter-spacing: -.005em; }
h3 { font-size: 11.5pt; font-weight: 800; margin: 5mm 0 1.6mm; }
h4 { font-size: 9.8pt; font-weight: 800; margin: 3.5mm 0 1mm; }
p { margin: 0 0 2.4mm; }
.chapo { font-size: 11pt; line-height: 1.42; color: #222; margin-bottom: 4mm; }
.figure { margin: 3mm 0 2mm; break-inside: avoid; }
.figure svg { width: 100%; height: auto; display: block; }
.legende { font-size: 7.8pt; color: var(--ink2); margin: 1.5mm 0 3mm; }
.cols { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; }
.cols3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 5mm; }
.encadre { border-left: 3px solid var(--ink); background: var(--panel); padding: 3mm 4mm; margin: 3mm 0;
           break-inside: avoid; border-radius: 0 6px 6px 0; }
.encadre.vert { border-color: var(--vert); } .encadre.bleu { border-color: var(--bleu); }
.encadre.jaune { border-color: var(--jaune); } .encadre.rouge { border-color: var(--danger); }
.encadre h4 { margin-top: 0; }
.formule { font-size: 15pt; font-weight: 800; line-height: 1.25; padding: 5mm 6mm; border: 2px solid var(--ink);
           border-radius: 10px; margin: 4mm 0; text-align: center; }
.formule span { color: var(--vert); }
ul, ol { margin: 0 0 2.4mm; padding-left: 5mm; }
li { margin: 0 0 1mm; }
table { width: 100%; border-collapse: collapse; font-size: 8.2pt; margin: 2mm 0 3mm; break-inside: auto; }
th { text-align: left; font-weight: 800; font-size: 7.6pt; letter-spacing: .04em; text-transform: uppercase;
     color: var(--ink2); border-bottom: 1.5px solid var(--ink); padding: 1.6mm 1.6mm; vertical-align: bottom; }
td { border-bottom: 1px solid var(--rule); padding: 1.6mm 1.6mm; vertical-align: top; }
tr { break-inside: avoid; }
td.num, th.num { text-align: center; }
.pastille { display: inline-block; padding: .3mm 2mm; border-radius: 99px; font-size: 7.4pt; font-weight: 700;
            border: 1.2px solid currentColor; white-space: nowrap; }
.pastille.vert { color: var(--vert); } .pastille.bleu { color: var(--bleu); } .pastille.rouge { color: var(--danger); }
.pastille.ink { color: var(--ink); } .pastille.gris { color: var(--ink2); }
.pastille.plein { color: #fff; background: var(--ink); border-color: var(--ink); }
.pastille.plein.vert { background: var(--vert); border-color: var(--vert); }
.fiche { border: 1px solid var(--rule); border-radius: 10px; padding: 4mm 4.5mm; margin: 0 0 4mm;
         break-inside: avoid; }
.fiche h3 { margin-top: 0; display: flex; align-items: center; gap: 2.5mm; }
.fiche .grille { display: grid; grid-template-columns: 1fr 1fr; gap: 1mm 6mm; }
.fiche .grille div { font-size: 8.5pt; }
.fiche .grille b { display: block; font-size: 7.2pt; letter-spacing: .08em; text-transform: uppercase;
                   color: var(--ink2); margin-top: 1.6mm; }
.sommaire { columns: 2; column-gap: 8mm; font-size: 9pt; }
.sommaire div { break-inside: avoid; display: flex; gap: 2mm; margin-bottom: 1.4mm; }
.sommaire div span:first-child { font-weight: 800; min-width: 7mm; }
.decision { display: grid; grid-template-columns: 13mm 1fr; gap: 1mm 3mm; border-bottom: 1px solid var(--rule);
            padding: 1.8mm 0; break-inside: avoid; }
.decision .code { font-weight: 800; }
.decision .reco { color: var(--ink2); font-size: 8.4pt; }
.petit { font-size: 8pt; color: var(--ink2); }
.sources li { font-size: 7.6pt; margin-bottom: .7mm; word-break: break-word; }
table.compact { font-size: 7.7pt; }
table.compact td, table.compact th { padding: 1.2mm 1.4mm; }
.decisions-grille { display: grid; grid-template-columns: 1fr 1fr; gap: 1.2mm 6mm; font-size: 8.6pt; }
.decisions-grille .dec { border-bottom: 1px solid var(--rule); padding: 1.1mm 0; }
.decisions-grille .dec b { display: inline-block; min-width: 9mm; }
.cover-univers { font-size: 10pt; color: var(--ink2); line-height: 1.5; margin-top: 5mm; max-width: 165mm; }
.cols > div > .encadre, .cols3 > div > .encadre { height: calc(100% - 6mm); }
a { color: var(--bleu); text-decoration: none; }
"""


def inline_svg(svgs: dict[str, str], slug: str) -> str:
    if slug not in svgs:
        raise SystemExit(f"schéma inconnu : {slug}")
    return svgs[slug]


def build(built: list[tuple[str, str]], font_face: str, chrome, out_pdf: Path) -> None:
    svgs = dict(built)
    html = contenu.document(lambda slug: inline_svg(svgs, slug))
    page = f"<!doctype html><html lang='fr'><head><meta charset='utf-8'><title>ANTSIA — Sept univers pour le Gabon" \
           f"</title><style>{font_face}{CSS}</style></head><body>{html}</body></html>"
    with tempfile.TemporaryDirectory(prefix="sept-univers-pdf-") as tmp:
        source = Path(tmp) / "dossier.html"
        source.write_text(page, encoding="utf-8")
        chrome(["--no-pdf-header-footer", "--virtual-time-budget=6000", "--run-all-compositor-stages-before-draw",
                f"--print-to-pdf={out_pdf}", f"file://{source}"])
    pages = subprocess.run(["pdfinfo", str(out_pdf)], capture_output=True, text=True).stdout
    print(out_pdf)
    print("\n".join(line for line in pages.splitlines() if line.startswith(("Pages", "Page size", "Title"))))
