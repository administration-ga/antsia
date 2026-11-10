"""Extrait une fois les tracés des icônes lucide (licence ISC) utilisées par les schémas.

Usage : python3 extract_icons.py <dossier dist/esm/icons de lucide-react>
Écrit icons.json à côté de ce script ; build.py ne lit plus node_modules ensuite.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

NAMES = """shopping-bag store wrench hammer house building-2 map-pin car key briefcase graduation-cap
ticket party-popper calendar-heart heart heart-handshake landmark newspaper megaphone sparkles
shield-check badge-check users user play clapperboard message-circle search bell circle-check
circle-x ban lock eye handshake banknote smartphone wallet layout-grid layers network radio tv
music trophy hand-coins scale id-card circle-alert triangle-alert flag tag star bot
server database link arrow-right globe mic video camera clipboard-list chart-no-axes-column
trending-up target rocket compass route truck utensils file-check-corner receipt hand-heart building map shirt sun mountain""".split()

TUPLE = re.compile(r'\[\s*"(\w+)",\s*\{(.*?)\}\s*\]', re.S)
ATTR = re.compile(r'(\w+):\s*"([^"]*)"')


def main(icons_dir: str) -> None:
    out = {}
    for name in NAMES:
        source = (Path(icons_dir) / f"{name}.mjs").read_text(encoding="utf-8")
        node = source.split("const __iconNode =", 1)[1].split("];\n", 1)[0]
        parts = []
        for tag, attrs in TUPLE.findall(node):
            pairs = [(k, v) for k, v in ATTR.findall(attrs) if k != "key"]
            parts.append("<%s %s/>" % (tag, " ".join('%s="%s"' % (k, v) for k, v in pairs)))
        if not parts:
            raise SystemExit(f"icône vide : {name}")
        out[name] = "".join(parts)
    target = Path(__file__).with_name("icons.json")
    target.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(out)} icônes écrites dans {target}")


if __name__ == "__main__":
    main(sys.argv[1])
