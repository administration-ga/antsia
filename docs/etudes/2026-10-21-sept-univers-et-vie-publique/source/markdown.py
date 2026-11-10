"""Rend l'étude Markdown à partir de etude.template.md et des mêmes données que le PDF."""
from __future__ import annotations

import re
from pathlib import Path

import donnees as D


def md(s: str) -> str:
    """Convertit le petit HTML des données (gras, pastilles, liens, paragraphes) en Markdown."""
    s = re.sub(r"<span class='pastille [a-z ]+'>([^<]*)</span>", r"*(\1)*", s)
    s = re.sub(r"<b>(.*?)</b>", r"**\1**", s)
    s = re.sub(r"<sup>(.*?)</sup>", r"\1", s)
    s = re.sub(r"<a href='([^']+)'>[^<]*</a>", r"<\1>", s)
    s = s.replace("<p>", "").replace("</p>", "\n\n")
    return s.strip()


def cell(s: str) -> str:
    return md(s).replace("|", "\\|").replace("\n", " ")


def table(headers: list[str], rows: list[list[str]]) -> str:
    head = "| " + " | ".join(headers) + " |\n|" + "|".join("---" for _ in headers) + "|\n"
    return head + "\n".join("| " + " | ".join(cell(c) for c in r) + " |" for r in rows)


def bullets(items: list[str]) -> str:
    return "\n".join(f"- {md(i)}" for i in items)


def numbered(items: list[str]) -> str:
    return "\n".join(f"{k + 1}. {md(i)}" for k, i in enumerate(items))


def routes(s: str) -> str:
    return re.sub(r"(/[\w\-\[\]/]+)", r"`\1`", s)


def fiches() -> str:
    out = []
    for k, u in enumerate(D.FICHES):
        rows = [["On y vient pour", u["pour"]], ["Ce qui existe", u["existe"]],
                ["Ce qu'il faut construire", u["construire"]]] + [[a, b] for a, b in u["grille"]]
        out.append(f"### 5.{k + 1} {u['nom']} — {u['etat']} · vague {u['vague']}\n\n{md(u['resume'])}\n\n"
                   + table(["Rubrique", "Contenu"], rows))
    return "\n\n".join(out)


def sources() -> str:
    items = []
    for s in D.SOURCES:
        m = re.match(r"^(.*) — <a href='([^']+)'>[^<]*</a>$", s)
        items.append(f"[{m.group(1)}]({m.group(2)})" if m else md(s))
    return "\n".join(f"{k + 1}. {i}" for k, i in enumerate(items))


def blocs() -> dict[str, str]:
    return {
        "SUSPENSION": "\n>\n".join("> " + p for p in md(D.SUSPENSION).split("\n\n")),
        "TABLE_CHIFFRES": table(["Indicateur", "Valeur", "Date", "Source"], [list(c) for c in D.CHIFFRES]),
        "TABLE_CIRCULATION": table(["Ce qui s'échange", "Comment aujourd'hui", "Douleur principale"],
                                   [list(c) for c in D.CIRCULATION]),
        "LIST_ENSEIGNEMENTS": bullets(D.ENSEIGNEMENTS),
        "METHODE_NOTATION": md(D.METHODE_NOTATION),
        "NOTATION_NOTE": "*" + md(D.NOTATION_NOTE) + "*",
        "TABLE_CANDIDATS": table(["Candidat"] + D.CRITERES_TITRES + ["/25", "Verdict"],
                                 [[f"**{c['nom']}**"] + [str(c[k]) for k in D.CRITERES_CLES]
                                  + [f"**{c['score']}**", c["verdict"]] for c in D.CANDIDATS]),
        "FICHES": fiches(),
        "BENCHMARK_CHAPO": md(D.BENCHMARK_CHAPO),
        "TABLE_BENCHMARK": table(["Plateforme", "Unité d'identité", "Modules", "Ce qu'ANTSIA en retient"],
                                 [list(b) for b in D.BENCHMARK]),
        "LIST_LECONS": numbered(D.LECONS),
        "TABLE_GABARITS": table(["Gabarit", "Espaces par défaut", "Champs métier", "Action principale"], D.GABARITS),
        "TABLE_VIE_PUBLIQUE": table(["Acteur", "Où il parle", "Ce qui le distingue", "Ce qui lui est interdit"],
                                    D.VIE_PUBLIQUE),
        "TABLE_ROUTES": table(["Destination", "Route", "État"], [[a, routes(b), c] for a, b, c in D.ROUTES]),
        "TABLE_BRIQUES": table(["Brique", "Où", "Rôle", "Règle tenue"], D.BRIQUES),
        "LIST_IASTED_CONSTRUIRE": bullets(D.IASTED_CONSTRUIRE),
        "TABLE_IASTED_ETAPES": table(["Étape", "Contenu", "Pré-requis"], D.IASTED_ETAPES),
        "TABLE_LOTS": table(["Lot", "Contenu", "Dépend de", "Taille"], D.LOTS),
        "TABLE_INDICATEURS": table(["Domaine", "Indicateur", "Pourquoi"], D.INDICATEURS),
        "TABLE_RISQUES": table(["Risque", "Effet", "Parade"], D.RISQUES),
        "TABLE_DECISIONS": table(["", "Décision", "Recommandation", "Si non", "Statut"],
                                 [[f"**{d[0]}**", f"**{d[1]}**", d[2], d[3], d[4]] for d in D.DECISIONS]),
        "TABLE_CRITERES_GO": table(["Critère pour dire « on part »", "État", "Preuve ou responsable"],
                                   [[c, f"**{e}**", p] for c, e, p in D.CRITERES_GO]),
        "LIST_ACTIONS_PROPRIETAIRE": bullets(D.ACTIONS_PROPRIETAIRE),
        "LIST_PROCHAINS_LOTS": bullets(D.PROCHAINS_LOTS),
        "LIST_SOURCES": sources(),
    }


def build(out: Path) -> None:
    template = Path(__file__).with_name("etude.template.md").read_text(encoding="utf-8")
    values = blocs()
    missing = sorted(set(re.findall(r"\{\{([A-Z_]+)\}\}", template)) - set(values))
    if missing:
        raise SystemExit(f"blocs inconnus dans le gabarit : {missing}")
    text = re.sub(r"\{\{([A-Z_]+)\}\}", lambda m: values[m.group(1)], template)
    out.write_text(text, encoding="utf-8")
    print(out, f"({len(text.splitlines())} lignes)")
