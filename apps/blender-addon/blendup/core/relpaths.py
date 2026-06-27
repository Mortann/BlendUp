"""Helpers de chemins relatifs au root projet.

Tous les chemins stockes dans `.blendup` sont relatifs au root projet et
utilisent des separateurs `/` (convention validee dans la doc). Ces helpers
normalisent et comparent les chemins de maniere robuste, y compris sur Windows
ou la casse n'est pas significative.
"""

from __future__ import annotations

import os


def to_posix(path: str) -> str:
    """Convertit les separateurs Windows en `/`."""
    return path.replace("\\", "/")


def rel_to_root(root: str, absolute_path: str) -> str:
    """Retourne le chemin de `absolute_path` relatif a `root`, en style POSIX."""
    rel = os.path.relpath(os.path.abspath(absolute_path), os.path.abspath(root))
    return to_posix(rel)


def same_path(a: str, b: str) -> bool:
    """Compare deux chemins relatifs sans tenir compte de la casse ni du style de separateur."""
    return to_posix(a).strip("/").lower() == to_posix(b).strip("/").lower()


def join_root(root: str, relative_path: str) -> str:
    """Joint un chemin relatif `.blendup` au root projet en chemin absolu natif."""
    parts = to_posix(relative_path).split("/")
    return os.path.abspath(os.path.join(root, *parts))
