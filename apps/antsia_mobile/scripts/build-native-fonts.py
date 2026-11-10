#!/usr/bin/env python3
"""Build static native faces from the same local Fontsource5.3.0 sources as the Web.

No downloads or package installation. Only assets/fonts owned by this generator are written.
Each normal-weight Unicode subset is instantiated before merging, retaining the source
character coverage, outlines and kerning. Each resulting face has its own PostScript name.
"""
from __future__ import annotations

import hashlib
import io
import json
import logging
from pathlib import Path

import fontTools
from fontTools.merge import Merger
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont


APP = Path(__file__).resolve().parents[1]
REPO = APP.parents[1]
OUTPUT = APP / "assets" / "fonts"
WEIGHT_NAMES = {400: "Regular", 500: "Medium", 600: "SemiBold", 700: "Bold", 800: "ExtraBold"}
FAMILIES = (
    ("inter", "Antsia Inter", "AntsiaInter", (400, 500, 600, 700, 800)),
    ("familjen-grotesk", "Antsia Familjen Grotesk", "AntsiaFamiljenGrotesk", (400, 500, 600, 700)),
)
SUBSET_ORDER = ("latin", "latin-ext", "vietnamese", "greek", "greek-ext", "cyrillic", "cyrillic-ext")


def digest(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def local_package(family: str) -> Path:
    package = REPO / "node_modules" / ".bun" / f"@fontsource-variable+{family}@5.3.0" / "node_modules" / "@fontsource-variable" / family
    if not (package / "LICENSE").is_file():
        raise RuntimeError(f"Local Fontsource5.3.0 package missing: {family}")
    return package


def static_subset(source: Path, weight: int) -> tuple[io.BytesIO, set[int], int, int]:
    font = TTFont(source, recalcTimestamp=False)
    source_chars = set(font.getBestCmap())
    created, modified = font["head"].created, font["head"].modified
    if "fvar" not in font or [axis.axisTag for axis in font["fvar"].axes] != ["wght"]:
        raise RuntimeError(f"Expected the canonical weight-only variable source: {source.name}")
    static = instantiateVariableFont(font, {"wght": weight}, inplace=False, optimize=True)
    static.flavor = None
    static.recalcTimestamp = False
    static["head"].created, static["head"].modified = created, modified
    buffer = io.BytesIO()
    static.save(buffer, reorderTables=True)
    buffer.seek(0)
    return buffer, source_chars, created, modified


def rename_face(font: TTFont, family: str, postscript: str, weight: int) -> None:
    variant = WEIGHT_NAMES[weight]
    full = f"{family} {variant}"
    replacements = {
        1: family,
        2: variant,
        3: f"Fontsource5.3.0:{postscript}:static-{weight}",
        4: full,
        6: postscript,
        16: family,
        17: variant,
    }
    # Remove every old localized name for these fields before defining consistent names.
    font["name"].names = [entry for entry in font["name"].names if entry.nameID not in replacements]
    for name_id, value in replacements.items():
        font["name"].setName(value, name_id, 3, 1, 0x409)
        font["name"].setName(value, name_id, 1, 0, 0)
    font["OS/2"].usWeightClass = weight
    # Static normal faces: keep style names and native bold traits consistent.
    font["OS/2"].fsSelection &= ~((1 << 0) | (1 << 5) | (1 << 6) | (1 << 9))
    if weight >= 700:
        font["OS/2"].fsSelection |= 1 << 5
    elif weight == 400:
        font["OS/2"].fsSelection |= 1 << 6
    font["head"].macStyle &= ~3
    if weight >= 700:
        font["head"].macStyle |= 1


def build() -> None:
    logging.getLogger("fontTools").setLevel(logging.ERROR)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    manifest = {
        "source": "Local @fontsource-variable packages5.3.0 also imported by packages/ui/src/styles.css",
        "generatorSha256": digest(Path(__file__).read_bytes()),
        "fontToolsVersion": fontTools.version,
        "format": "static TrueType; normal style; unique PostScript name per weight",
        "downloads": False,
        "fonts": [],
        "licenses": [],
    }
    seen_names: set[str] = set()
    for slug, family_name, postscript_prefix, weights in FAMILIES:
        package = local_package(slug)
        sources = [package / "files" / f"{slug}-{subset}-wght-normal.woff2" for subset in SUBSET_ORDER]
        sources = [source for source in sources if source.is_file()]
        expected_sources = set((package / "files").glob(f"{slug}-*-wght-normal.woff2"))
        if not sources or set(sources) != expected_sources:
            raise RuntimeError(f"Unexpected or missing canonical Unicode subsets for {slug}")
        license_name = f"LICENSE-{slug}.txt"
        license_bytes = (package / "LICENSE").read_bytes()
        (OUTPUT / license_name).write_bytes(license_bytes)
        manifest["licenses"].append({"file": license_name, "sha256": digest(license_bytes)})
        source_records = [{"path": source.relative_to(REPO).as_posix(), "sha256": digest(source.read_bytes())} for source in sources]
        for weight in weights:
            subsets = [static_subset(source, weight) for source in sources]
            buffers = [subset[0] for subset in subsets]
            expected_characters = set().union(*(subset[1] for subset in subsets))
            merged = Merger().merge(buffers)
            merged.flavor = None
            merged.recalcTimestamp = False
            merged["head"].created = subsets[0][2]
            merged["head"].modified = subsets[0][3]
            postscript = f"{postscript_prefix}-{WEIGHT_NAMES[weight]}"
            rename_face(merged, family_name, postscript, weight)
            buffer = io.BytesIO()
            merged.save(buffer, reorderTables=True)
            data = buffer.getvalue()
            checked = TTFont(io.BytesIO(data), recalcTimestamp=False)
            if "fvar" in checked or "gvar" in checked:
                raise RuntimeError(f"Variable tables remained in {postscript}")
            if checked["name"].getDebugName(6) != postscript or postscript in seen_names:
                raise RuntimeError(f"Non-unique PostScript identity: {postscript}")
            if checked["OS/2"].usWeightClass != weight or set(checked.getBestCmap()) != expected_characters:
                raise RuntimeError(f"Weight or Unicode coverage changed: {postscript}")
            if not all(ord(character) in checked.getBestCmap() for character in "Jean-Rémy Éloïse àçœÎÛ"):
                raise RuntimeError(f"French identity characters missing: {postscript}")
            seen_names.add(postscript)
            filename = postscript + ".ttf"
            (OUTPUT / filename).write_bytes(data)
            manifest["fonts"].append({"file": filename, "sha256": digest(data), "bytes": len(data), "family": family_name, "variant": WEIGHT_NAMES[weight], "weight": weight, "postScriptName": postscript, "unicodeCharacters": len(expected_characters), "sources": source_records})
    (OUTPUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(OUTPUT), "fonts": len(manifest["fonts"]), "bytes": sum(font["bytes"] for font in manifest["fonts"]), "postScriptNamesUnique": True, "downloads": False}))


if __name__ == "__main__":
    build()
