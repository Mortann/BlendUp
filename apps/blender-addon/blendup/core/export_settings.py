"""Reglages d'export FBX par defaut.

Ces valeurs servent de base aux preferences de l'add-on (configurables dans
Blender). Elles reprennent les reglages eprouves du script d'export temporaire
utilise par le backend, pour garder une sortie FBX coherente.

`build_fbx_kwargs` traduit un dict de reglages en arguments pour
`bpy.ops.export_scene.fbx`. La fonction est sans `bpy` et donc testable.
"""

from __future__ import annotations

from typing import Any, Dict

DEFAULT_FBX_SETTINGS: Dict[str, Any] = {
    "use_selection": False,
    "apply_unit_scale": True,
    "bake_space_transform": False,
    "add_leaf_bones": False,
    "mesh_smooth_type": "FACE",
    "object_types": ["EMPTY", "MESH", "ARMATURE"],
    "path_mode": "AUTO",
}

VALID_MESH_SMOOTH = ("OFF", "FACE", "EDGE")
VALID_OBJECT_TYPES = ("EMPTY", "CAMERA", "LIGHT", "ARMATURE", "MESH", "OTHER")


def normalize_settings(settings: Dict[str, Any]) -> Dict[str, Any]:
    """Complete un dict de reglages avec les valeurs par defaut manquantes."""
    merged = dict(DEFAULT_FBX_SETTINGS)
    merged.update(settings or {})
    return merged


def build_fbx_kwargs(filepath: str, settings: Dict[str, Any]) -> Dict[str, Any]:
    """Construit les arguments de `bpy.ops.export_scene.fbx`."""
    merged = normalize_settings(settings)
    return {
        "filepath": filepath,
        "use_selection": bool(merged["use_selection"]),
        "apply_unit_scale": bool(merged["apply_unit_scale"]),
        "bake_space_transform": bool(merged["bake_space_transform"]),
        "add_leaf_bones": bool(merged["add_leaf_bones"]),
        "mesh_smooth_type": merged["mesh_smooth_type"],
        "object_types": set(merged["object_types"]),
        "path_mode": merged["path_mode"],
    }
