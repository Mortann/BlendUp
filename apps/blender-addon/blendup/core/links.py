"""Lien depuis Blender vers l'application BlendUp ("ouvrir la fiche dans BlendUp").

Deux mecanismes complementaires, penses pour fonctionner hors ligne :

1. Fichier de requete `.blendup/temp/open-request.json`. L'application desktop
   pourra surveiller ce fichier et, quand il change, charger le projet et
   selectionner l'asset demande. C'est le mecanisme principal cote V1.
2. Lien profond `blendup://asset/<id>` ouvert via le navigateur/OS, utile si un
   handler de protocole est enregistre cote application (amelioration future).

Cette logique est sans `bpy` : la couche operateur se charge d'ouvrir l'URL.
"""

from __future__ import annotations

import os

from . import jsonio

OPEN_REQUEST_FILE = os.path.join(".blendup", "temp", "open-request.json")


def deep_link(asset_id: str) -> str:
    return f"blendup://asset/{asset_id}"


def write_open_request(project_root: str, asset_id: str) -> str:
    """Ecrit la requete d'ouverture de fiche et retourne le chemin du fichier."""
    payload = {
        "schemaVersion": 1,
        "kind": "open_request",
        "assetId": asset_id,
        "requestedAt": jsonio.iso_now(),
        "source": "blender-addon",
    }
    path = os.path.join(project_root, OPEN_REQUEST_FILE)
    jsonio.write_json(path, payload)
    return path
