"""Validation de base avant export (pure, sans `bpy`).

`validate_scene` recoit un contexte simple (un dict decrivant la scene, produit
par `blendup.bpy_adapter`) et retourne une liste d'issues. Cette separation rend
les regles testables hors de Blender.

Chaque issue est un dict : {level, code, message, target} ou level vaut
'error', 'warning' ou 'info'. Une erreur signale un export probablement casse ;
un warning laisse continuer (principe "avertir avant bloquer").

Forme attendue du contexte :
    {
      "unit_scale": 1.0,
      "objects": [
        {"name": str, "type": "MESH"|"EMPTY"|"ARMATURE"|...,
         "scale": (x, y, z), "material_names": [str, ...], "exportable": bool},
        ...
      ],
      "material_names": [str, ...],
    }
"""

from __future__ import annotations

from typing import List, Optional

from . import naming as naming_mod

SCALE_TOLERANCE = 1e-4
GENERIC_MATERIAL_PREFIXES = ("Material", "Matiere", "Mat.")


def _scale_is_applied(scale) -> bool:
    return all(abs(component - 1.0) <= SCALE_TOLERANCE for component in scale)


def validate_scene(
    ctx: dict,
    naming: Optional[dict] = None,
    asset: Optional[dict] = None,
) -> List[dict]:
    issues: List[dict] = []
    objects = ctx.get("objects") or []

    if not objects:
        issues.append(
            {
                "level": "error",
                "code": "scene.empty",
                "message": "La scene ne contient aucun objet a exporter.",
                "target": "",
            }
        )
        return issues

    exportable = [obj for obj in objects if obj.get("exportable")]
    if not exportable:
        issues.append(
            {
                "level": "error",
                "code": "scene.no_exportable",
                "message": "Aucun objet exportable (mesh, empty ou armature) trouve.",
                "target": "",
            }
        )

    unit_scale = ctx.get("unit_scale", 1.0)
    if abs(unit_scale - 1.0) > SCALE_TOLERANCE:
        issues.append(
            {
                "level": "warning",
                "code": "scene.unit_scale",
                "message": f"L'echelle d'unite de la scene est {unit_scale}, attendu 1.0.",
                "target": "",
            }
        )

    for obj in exportable:
        name = obj.get("name", "")

        if not _scale_is_applied(obj.get("scale", (1.0, 1.0, 1.0))):
            issues.append(
                {
                    "level": "warning",
                    "code": "object.scale",
                    "message": f"L'echelle de '{name}' n'est pas appliquee (non egale a 1).",
                    "target": name,
                }
            )

        if naming:
            issues.extend(naming_mod.check_name(name, naming))

        if obj.get("type") == "MESH" and not obj.get("material_names"):
            issues.append(
                {
                    "level": "info",
                    "code": "object.no_material",
                    "message": f"Le mesh '{name}' n'a aucun materiau assigne.",
                    "target": name,
                }
            )

    for material_name in ctx.get("material_names") or []:
        if material_name.startswith(GENERIC_MATERIAL_PREFIXES):
            issues.append(
                {
                    "level": "warning",
                    "code": "material.generic_name",
                    "message": f"Le materiau '{material_name}' garde un nom generique.",
                    "target": material_name,
                }
            )

    if asset:
        display_name = (asset.get("displayName") or "").strip()
        if display_name:
            bases = {
                naming_mod.split_suffix(obj.get("name", ""), naming or {})[0]
                for obj in exportable
            }
            if display_name not in bases:
                issues.append(
                    {
                        "level": "info",
                        "code": "asset.name_mismatch",
                        "message": (
                            f"Aucun objet exportable ne porte le nom de l'asset "
                            f"'{display_name}'."
                        ),
                        "target": display_name,
                    }
                )

    return issues


def has_blocking(issues: List[dict]) -> bool:
    return any(issue.get("level") == "error" for issue in issues)


def summarize(issues: List[dict]) -> str:
    errors = sum(1 for i in issues if i.get("level") == "error")
    warnings = sum(1 for i in issues if i.get("level") == "warning")
    infos = sum(1 for i in issues if i.get("level") == "info")
    return f"{errors} erreur(s), {warnings} warning(s), {infos} info(s)"
