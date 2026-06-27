"""Detection et lecture du projet BlendUp courant.

Strategie (validee dans docs/preproduction/04-questions-ouvertes.md) :
1. partir du dossier du fichier `.blend` courant ;
2. remonter les dossiers parents jusqu'a trouver `.blendup/project.json`.

L'add-on peut aussi memoriser un identifiant d'asset dans le `.blend`
(custom property de scene), mais la recherche par dossier parent suffit a
retrouver le projet meme si le fichier a ete deplace dans la structure standard.
"""

from __future__ import annotations

import os
from typing import Optional

from . import jsonio

BLENDUP_DIR = ".blendup"
PROJECT_FILE = "project.json"


def find_project_root(start_path: str) -> Optional[str]:
    """Remonte depuis `start_path` jusqu'a un dossier contenant `.blendup/project.json`.

    `start_path` peut etre un fichier (ex: le `.blend`) ou un dossier.
    Retourne le chemin absolu du root projet, ou None si rien n'est trouve.
    """
    if not start_path:
        return None

    current = os.path.abspath(start_path)
    if os.path.isfile(current):
        current = os.path.dirname(current)

    while True:
        candidate = os.path.join(current, BLENDUP_DIR, PROJECT_FILE)
        if os.path.isfile(candidate):
            return current
        parent = os.path.dirname(current)
        if parent == current:  # racine du systeme de fichiers atteinte
            return None
        current = parent


def load_project(project_root: str) -> dict:
    """Charge `.blendup/project.json` pour le projet donne."""
    path = os.path.join(project_root, BLENDUP_DIR, PROJECT_FILE)
    return jsonio.read_json(path)


def project_name(project: dict) -> str:
    return str(project.get("name") or "Projet BlendUp")
