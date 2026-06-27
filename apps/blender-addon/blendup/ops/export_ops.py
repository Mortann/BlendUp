"""Operateur d'export FBX d'un asset depuis Blender.

La logique est exposee dans `export_asset_for_scene` pour etre reutilisee par le
handler d'auto-export au save (`blendup.handlers`).
"""

from __future__ import annotations

import os
from typing import Tuple

import bpy
from bpy.props import BoolProperty
from bpy.types import Operator

from .. import bpy_adapter, prefs
from ..core import (
    activity,
    assets,
    export_settings,
    jsonio,
    naming as naming_mod,
    relpaths,
    validation,
)


def export_asset_for_scene(context, scene, validate_first: bool = True) -> Tuple[bool, str]:
    """Exporte l'asset lie a `scene`. Retourne (succes, message)."""
    project_root, _project, asset, asset_file = bpy_adapter.resolve_current(scene)

    if not project_root:
        return False, "Aucun projet BlendUp trouve (fichier non sauvegarde ou hors projet)."
    if not asset or not asset_file:
        return False, "Cette scene n'est liee a aucune fiche asset BlendUp."

    fbx_rel = (asset.get("paths") or {}).get("fbxExport")
    if not fbx_rel:
        return False, "La fiche asset ne definit pas de chemin d'export FBX."

    if validate_first:
        ctx = bpy_adapter.gather_validation_context(scene)
        naming = naming_mod.load_naming(project_root)
        issues = validation.validate_scene(ctx, naming, asset)
        blocking = [i for i in issues if i.get("level") == "error"]
        if blocking:
            messages = "; ".join(i["message"] for i in blocking)
            return False, f"Validation bloquante: {messages}"

    fbx_abs = relpaths.join_root(project_root, fbx_rel)
    os.makedirs(os.path.dirname(fbx_abs), exist_ok=True)

    settings = prefs.get_prefs(context).to_settings_dict()
    kwargs = export_settings.build_fbx_kwargs(fbx_abs, settings)

    actor = prefs.actor_name(context)
    when = jsonio.iso_now()
    asset_id = asset.get("id")

    try:
        bpy.ops.export_scene.fbx(**kwargs)
        success = os.path.isfile(fbx_abs)
    except Exception as error:  # noqa: BLE001 - on veut journaliser toute erreur
        success = False
        export_error = str(error)
    else:
        export_error = "" if success else "Le fichier FBX n'a pas ete cree."

    status = "success" if success else "error"
    assets.set_export_status(asset, status, when)
    assets.save_asset(asset_file, asset)

    if success:
        activity.append_activity(
            project_root, actor, "asset.exported",
            f"FBX exporte vers {fbx_rel}", asset_id,
        )
        return True, f"Export FBX reussi: {fbx_rel}"

    activity.append_activity(
        project_root, actor, "asset.export_failed",
        f"Echec export FBX: {export_error}", asset_id,
    )
    return False, f"Echec de l'export FBX. {export_error}"


class BLENDUP_OT_export_asset(Operator):
    bl_idname = "blendup.export_asset"
    bl_label = "Exporter en FBX"
    bl_description = "Exporter l'asset lie vers son chemin FBX defini dans BlendUp"
    bl_options = {"REGISTER"}

    validate_first: BoolProperty(
        name="Valider avant export",
        description="Lancer la validation de base et bloquer en cas d'erreur",
        default=True,
    )

    def execute(self, context):
        success, message = export_asset_for_scene(
            context, context.scene, self.validate_first
        )
        self.report({"INFO"} if success else {"ERROR"}, message)
        return {"FINISHED"} if success else {"CANCELLED"}


classes = (BLENDUP_OT_export_asset,)
