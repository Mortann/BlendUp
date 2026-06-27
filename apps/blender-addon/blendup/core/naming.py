"""Nomenclature : chargement des regles et verifications.

Regles lues dans `.blendup/naming/asset-naming.json` :
- `prefixes` : prefixes autorises (PROP, ENV, CHR, MAT, TEX, UI, FX...) ;
- `blenderSuffixes` : suffixes Blender autorises (_MESH, _COL, _LOD0...) ;
- `forbiddenNameFragments` : fragments interdits (final, new, copy, test...).

La nomenclature est assistee, pas bloquante : ces fonctions produisent des
avertissements, pas des erreurs (cf. principe "avertir avant bloquer").
"""

from __future__ import annotations

import os
from typing import List, Optional, Tuple

from . import jsonio

NAMING_FILE = os.path.join(".blendup", "naming", "asset-naming.json")

DEFAULT_PREFIXES = ["PROP", "ENV", "CHR", "MAT", "TEX", "UI", "FX"]
DEFAULT_SUFFIXES = ["_MESH", "_COL", "_LOD0", "_LOD1", "_ARM", "_RIG", "_EMPTY", "_SOCKET"]
DEFAULT_FORBIDDEN = ["final", "new", "copy", "test"]


def load_naming(project_root: str) -> dict:
    """Charge les regles de nomenclature, avec valeurs par defaut si absent."""
    path = os.path.join(project_root, NAMING_FILE)
    try:
        data = jsonio.read_json(path)
    except (OSError, ValueError):
        data = {}
    data.setdefault("prefixes", DEFAULT_PREFIXES)
    data.setdefault("blenderSuffixes", DEFAULT_SUFFIXES)
    data.setdefault("forbiddenNameFragments", DEFAULT_FORBIDDEN)
    return data


def split_suffix(name: str, naming: dict) -> Tuple[str, Optional[str]]:
    """Separe un suffixe Blender connu du reste du nom : 'PROP_X_01_COL' -> ('PROP_X_01', '_COL')."""
    for suffix in naming.get("blenderSuffixes", []):
        if name.endswith(suffix):
            return name[: -len(suffix)], suffix
    return name, None


def has_known_prefix(name: str, naming: dict) -> bool:
    for prefix in naming.get("prefixes", []):
        if name.startswith(prefix + "_"):
            return True
    return False


def forbidden_fragments_in(name: str, naming: dict) -> List[str]:
    lowered = name.lower()
    return [
        fragment
        for fragment in naming.get("forbiddenNameFragments", [])
        if fragment.lower() in lowered
    ]


def check_name(name: str, naming: dict) -> List[dict]:
    """Verifie un nom (objet, collection ou material). Retourne une liste d'avertissements."""
    issues: List[dict] = []
    base, _suffix = split_suffix(name, naming)

    if not has_known_prefix(base, naming):
        prefixes = ", ".join(naming.get("prefixes", []))
        issues.append(
            {
                "level": "warning",
                "code": "naming.prefix",
                "message": f"'{name}' ne commence pas par un prefixe connu ({prefixes}).",
                "target": name,
            }
        )

    for fragment in forbidden_fragments_in(name, naming):
        issues.append(
            {
                "level": "warning",
                "code": "naming.forbidden",
                "message": f"'{name}' contient un fragment interdit: '{fragment}'.",
                "target": name,
            }
        )

    return issues
