"""Pont entre `bpy` et le coeur logique.

Ce module est le SEUL endroit (avec ops/ui/prefs/handlers) a importer `bpy`.
Il collecte des donnees depuis la scene Blender et les transforme en structures
simples consommees par `blendup.core` (qui reste testable sans Blender).
"""

from __future__ import annotations

from typing import Optional, Tuple

import bpy

from .core import assets, project

SCENE_ASSET_ID_KEY = "blendup_asset_id"

EXPORTABLE_TYPES = {"MESH", "EMPTY", "ARMATURE"}


def current_blend_path() -> str:
    """Chemin absolu du `.blend` courant, ou chaine vide si non sauvegarde."""
    return bpy.data.filepath or ""


def get_scene_asset_id(scene) -> Optional[str]:
    value = scene.get(SCENE_ASSET_ID_KEY)
    return str(value) if value else None


def set_scene_asset_id(scene, asset_id: Optional[str]) -> None:
    if asset_id:
        scene[SCENE_ASSET_ID_KEY] = asset_id
    elif SCENE_ASSET_ID_KEY in scene:
        del scene[SCENE_ASSET_ID_KEY]


def resolve_current(
    scene, persist: bool = True
) -> Tuple[Optional[str], Optional[dict], Optional[dict], Optional[str]]:
    """Retrouve (project_root, project, asset, asset_file) pour la scene courante.

    Renvoie des None partiels si le `.blend` n'est pas sauvegarde, hors projet,
    ou pas encore lie a une fiche asset.

    `persist=False` (utilise par le panneau pendant le dessin) evite d'ecrire le
    custom property dans la scene : modifier des donnees pendant un draw est
    interdit par Blender.
    """
    blend_path = current_blend_path()
    if not blend_path:
        return None, None, None, None

    project_root = project.find_project_root(blend_path)
    if not project_root:
        return None, None, None, None

    try:
        project_data = project.load_project(project_root)
    except (OSError, ValueError):
        project_data = None

    asset_id = get_scene_asset_id(scene)
    asset, asset_file = assets.find_asset_for_blend(project_root, blend_path, asset_id)

    # Si on a retrouve l'asset par le chemin, on memorise son id dans la scene.
    if persist and asset and not asset_id:
        set_scene_asset_id(scene, asset.get("id"))

    return project_root, project_data, asset, asset_file


def gather_validation_context(scene) -> dict:
    """Construit le contexte de validation a partir de la scene Blender."""
    unit_settings = scene.unit_settings
    unit_scale = getattr(unit_settings, "scale_length", 1.0)

    objects = []
    material_names = set()
    for obj in scene.objects:
        mats = [slot.material.name for slot in obj.material_slots if slot.material]
        material_names.update(mats)
        objects.append(
            {
                "name": obj.name,
                "type": obj.type,
                "scale": tuple(obj.scale),
                "material_names": mats,
                "exportable": obj.type in EXPORTABLE_TYPES,
            }
        )

    return {
        "unit_scale": unit_scale,
        "objects": objects,
        "material_names": sorted(material_names),
    }
