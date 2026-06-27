"""Lecture et mise a jour des fiches assets `.blendup/assets/*.json`.

L'add-on doit ecrire l'etat d'export exactement comme le backend Rust
(`update_asset_export_status`) : champs `export.lastExportAt`,
`export.lastExportStatus`, passage du `status` a `exported` en cas de succes,
et mise a jour de `updatedAt`.
"""

from __future__ import annotations

import os
from typing import Optional, Tuple

from . import jsonio, relpaths

ASSETS_DIRNAME = os.path.join(".blendup", "assets")

EXPORT_MODE_AUTO = "auto"
EXPORT_MODE_MANUAL = "manual"
EXPORT_MODE_DISABLED = "disabled"
VALID_EXPORT_MODES = (EXPORT_MODE_AUTO, EXPORT_MODE_MANUAL, EXPORT_MODE_DISABLED)


def assets_dir(project_root: str) -> str:
    return os.path.join(project_root, ASSETS_DIRNAME)


def iter_asset_files(project_root: str):
    """Liste les chemins des fiches assets JSON, triees par nom de fichier."""
    directory = assets_dir(project_root)
    if not os.path.isdir(directory):
        return []
    files = [
        os.path.join(directory, name)
        for name in sorted(os.listdir(directory))
        if name.lower().endswith(".json")
    ]
    return files


def load_asset(asset_file: str) -> dict:
    return jsonio.read_json(asset_file)


def asset_blender_source(asset: dict) -> Optional[str]:
    paths = asset.get("paths") or {}
    source = paths.get("blenderSource")
    return source or None


def find_asset_for_blend(
    project_root: str,
    blend_absolute_path: str,
    asset_id: Optional[str] = None,
) -> Tuple[Optional[dict], Optional[str]]:
    """Retrouve la fiche asset liee au fichier `.blend` courant.

    Priorite a `asset_id` (memorise dans le `.blend`) s'il est fourni ; sinon
    on compare le chemin du `.blend` a `paths.blenderSource` de chaque fiche.
    Retourne `(asset, asset_file)` ou `(None, None)`.
    """
    files = iter_asset_files(project_root)

    if asset_id:
        for asset_file in files:
            try:
                asset = load_asset(asset_file)
            except (OSError, ValueError):
                continue
            if asset.get("id") == asset_id:
                return asset, asset_file

    if blend_absolute_path:
        wanted_rel = relpaths.rel_to_root(project_root, blend_absolute_path)
        for asset_file in files:
            try:
                asset = load_asset(asset_file)
            except (OSError, ValueError):
                continue
            source = asset_blender_source(asset)
            if source and relpaths.same_path(source, wanted_rel):
                return asset, asset_file

    return None, None


def save_asset(asset_file: str, asset: dict) -> None:
    jsonio.write_json(asset_file, asset)


def get_export_mode(asset: dict) -> str:
    """Mode d'export d'un asset : auto / manual / disabled.

    `export.exportMode` fait foi s'il est present ; sinon on derive du booleen
    historique `export.autoExport` (True => auto, False => manual).
    """
    export = asset.get("export") or {}
    mode = export.get("exportMode")
    if mode in VALID_EXPORT_MODES:
        return mode
    return EXPORT_MODE_AUTO if export.get("autoExport", True) else EXPORT_MODE_MANUAL


def set_export_mode(asset: dict, mode: str, when: Optional[str] = None) -> dict:
    """Definit le mode d'export et garde `autoExport` coherent pour le backend."""
    if mode not in VALID_EXPORT_MODES:
        raise ValueError(f"Mode d'export invalide: {mode}")
    export = asset.setdefault("export", {})
    export["exportMode"] = mode
    export["autoExport"] = mode == EXPORT_MODE_AUTO
    asset["updatedAt"] = when or jsonio.iso_now()
    return asset


def set_export_status(asset: dict, status: str, when: Optional[str] = None) -> dict:
    """Reproduit le comportement de `update_asset_export_status` du backend."""
    when = when or jsonio.iso_now()
    export = asset.setdefault("export", {})
    export["lastExportAt"] = when
    export["lastExportStatus"] = status
    if status == "success":
        asset["status"] = "exported"
    asset["updatedAt"] = when
    return asset
