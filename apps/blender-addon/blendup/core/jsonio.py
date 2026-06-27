"""Lecture/ecriture JSON au meme format que le backend Rust de BlendUp.

Le backend ecrit ses fichiers `.blendup` avec `serde_json::to_string_pretty`
(BTreeMap => cles triees, indentation de 2 espaces) suivi d'un retour ligne
final. On reproduit exactement ce format pour eviter des diffs Git parasites
quand l'add-on et l'application ecrivent tour a tour les memes fiches.
"""

from __future__ import annotations

import datetime
import json
import os
from typing import Any


def read_json(path: str) -> Any:
    """Charge un fichier JSON. Leve FileNotFoundError / ValueError si invalide."""
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def dumps_blendup(data: Any) -> str:
    """Serialise `data` exactement comme le backend (cles triees, indent 2, \\n final)."""
    return json.dumps(data, indent=2, sort_keys=True, ensure_ascii=False) + "\n"


def write_json(path: str, data: Any) -> None:
    """Ecrit `data` au format BlendUp, en creant les dossiers parents si besoin."""
    parent = os.path.dirname(path)
    if parent:
        os.makedirs(parent, exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(dumps_blendup(data))


def append_jsonl(path: str, entry: Any) -> None:
    """Ajoute une ligne JSON a un fichier `.jsonl` (journal d'activite)."""
    parent = os.path.dirname(path)
    if parent:
        os.makedirs(parent, exist_ok=True)
    line = json.dumps(entry, ensure_ascii=False, sort_keys=True)
    with open(path, "a", encoding="utf-8", newline="\n") as handle:
        handle.write(line + "\n")


def iso_now() -> str:
    """Horodatage ISO 8601 UTC en millisecondes, ex: 2026-06-27T13:07:21.377Z.

    Aligne sur le format produit cote application (Date.toISOString en JS).
    """
    now = datetime.datetime.now(datetime.timezone.utc)
    return now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z"
