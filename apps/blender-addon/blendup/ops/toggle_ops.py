"""Operateur de changement du mode d'export d'un asset (auto / manual / disabled)."""

from __future__ import annotations

import bpy
from bpy.props import EnumProperty
from bpy.types import Operator

from .. import bpy_adapter, prefs
from ..core import activity, assets, jsonio


class BLENDUP_OT_set_export_mode(Operator):
    bl_idname = "blendup.set_export_mode"
    bl_label = "Definir le mode d'export"
    bl_description = "Changer le mode d'export de l'asset lie (ecrit dans .blendup)"
    bl_options = {"REGISTER"}

    mode: EnumProperty(
        name="Mode",
        items=[
            (assets.EXPORT_MODE_AUTO, "Auto", "Export automatique au save"),
            (assets.EXPORT_MODE_MANUAL, "Manuel", "Export uniquement sur demande"),
            (assets.EXPORT_MODE_DISABLED, "Desactive", "Pas d'export"),
        ],
        default=assets.EXPORT_MODE_AUTO,
    )

    def execute(self, context):
        project_root, _project, asset, asset_file = bpy_adapter.resolve_current(context.scene)
        if not project_root or not asset or not asset_file:
            self.report({"ERROR"}, "Aucune fiche asset liee.")
            return {"CANCELLED"}

        when = jsonio.iso_now()
        assets.set_export_mode(asset, self.mode, when)
        assets.save_asset(asset_file, asset)
        activity.append_activity(
            project_root,
            prefs.actor_name(context),
            "asset.export_mode_changed",
            f"Mode d'export -> {self.mode}",
            asset.get("id"),
        )
        self.report({"INFO"}, f"Mode d'export: {self.mode}")
        return {"FINISHED"}


classes = (BLENDUP_OT_set_export_mode,)
