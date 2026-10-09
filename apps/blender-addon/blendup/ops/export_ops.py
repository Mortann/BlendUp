from __future__ import annotations

import os
from pathlib import Path
import subprocess
import sys
import traceback

import bpy

from ..core.export_state import record_export
from ..core.project import AssetLocation, locate_asset
from ..prefs import preferences
from ..blender_uv import check_and_record, project_policy, passes_uv_gate, uv_gate_message
from ..blender_export import export_scene


def current_asset() -> AssetLocation:
    if not bpy.data.filepath:
        raise ValueError("Enregistre d'abord le fichier Blender dans le dossier Art.")
    return locate_asset(bpy.data.filepath)


def export_current(context=None, uv_report=None) -> AssetLocation:
    context = context or bpy.context
    asset = current_asset()
    if asset.project.engine == "none":
        raise ValueError("Ce projet 3D n'a pas de moteur lié. Aucun export n'est nécessaire.")
    assert asset.output is not None
    prefs = preferences(context)
    selected_only = bool(prefs and prefs.selected_only)
    apply_modifiers = prefs.apply_modifiers if prefs else True
    export_animations = prefs.export_animations if prefs else True
    try:
        policy = project_policy(asset.project.root)
        if policy.validate_uvs:
            report = uv_report if uv_report is not None else check_and_record(asset.project.root, asset.source, context)
            if not passes_uv_gate(report, policy):
                raise ValueError(uv_gate_message(report, policy))
        export_scene(asset.output, asset.export_format, context, selected_only,
                     apply_modifiers, export_animations)
        record_export(asset, True, "Export terminé.")
        return asset
    except Exception as error:
        record_export(asset, False, f"{error}\n{traceback.format_exc()}")
        raise


class BLENDUP_OT_export_asset(bpy.types.Operator):
    bl_idname = "blendup.export_asset"
    bl_label = "Exporter l'asset"
    bl_description = "Exporte le fichier courant vers le dossier Assets du moteur"
    bl_options = {"REGISTER"}

    @classmethod
    def poll(cls, _context):
        try:
            return current_asset().project.engine != "none"
        except (ValueError, OSError):
            return False

    def execute(self, context):
        try:
            asset = export_current(context)
            self.report({"INFO"}, f"Exporté vers {asset.output_relative}")
            context.area.tag_redraw() if context.area else None
            return {"FINISHED"}
        except Exception as error:
            self.report({"ERROR"}, str(error))
            return {"CANCELLED"}


class BLENDUP_OT_open_location(bpy.types.Operator):
    bl_idname = "blendup.open_location"
    bl_label = "Ouvrir le dossier"

    location: bpy.props.EnumProperty(items=(("SOURCE", "Source", ""), ("OUTPUT", "Destination", "")))

    def execute(self, _context):
        try:
            asset = current_asset()
            if self.location == "OUTPUT" and asset.output is None:
                raise ValueError("Ce projet 3D n'a pas de dossier d'export moteur.")
            path = asset.source.parent if self.location == "SOURCE" else asset.output.parent
            path.mkdir(parents=True, exist_ok=True)
            open_directory(Path(path))
            return {"FINISHED"}
        except Exception as error:
            self.report({"ERROR"}, str(error))
            return {"CANCELLED"}


def open_directory(path: Path) -> None:
    """Ouvre un dossier sans dépendre du contexte d'une fenêtre Blender."""
    if sys.platform == "win32":
        os.startfile(str(path))
    elif sys.platform == "darwin":
        subprocess.Popen(["open", str(path)])
    else:
        subprocess.Popen(["xdg-open", str(path)])
