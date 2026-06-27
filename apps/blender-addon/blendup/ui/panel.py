"""Panneau BlendUp dans la sidebar de la vue 3D (touche N, onglet 'BlendUp')."""

from __future__ import annotations

from bpy.types import Panel

from .. import bpy_adapter
from ..core import assets
from ..ops import validate_ops


class BLENDUP_PT_panel(Panel):
    bl_label = "BlendUp"
    bl_idname = "BLENDUP_PT_panel"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "BlendUp"

    def draw(self, context):
        layout = self.layout
        scene = context.scene

        # Resolution sans effet de bord (pas d'ecriture pendant le draw).
        project_root, project_data, asset, _asset_file = bpy_adapter.resolve_current(
            scene, persist=False
        )

        if not bpy_adapter.current_blend_path():
            layout.label(text="Sauvegarde ce .blend dans un projet.", icon="ERROR")
            return

        if not project_root:
            layout.label(text="Aucun projet BlendUp trouve.", icon="ERROR")
            return

        name = project_data.get("name") if project_data else "Projet BlendUp"
        layout.label(text=name, icon="FILE_FOLDER")

        box = layout.box()
        if not asset:
            box.label(text="Fichier non lie a un asset.", icon="UNLINKED")
            box.operator("blendup.link_to_asset", icon="LINKED")
            box.operator("blendup.detect_asset", icon="VIEWZOOM")
            self._draw_templates(layout)
            return

        box.label(text=asset.get("displayName", "?"), icon="OBJECT_DATA")
        row = box.row()
        row.label(text=f"Type: {asset.get('type', '-')}")
        row.label(text=f"Statut: {asset.get('status', '-')}")

        mode = assets.get_export_mode(asset)
        box.label(text=f"Export: {mode}")
        row = box.row(align=True)
        op = row.operator("blendup.set_export_mode", text="Auto")
        op.mode = assets.EXPORT_MODE_AUTO
        op = row.operator("blendup.set_export_mode", text="Manuel")
        op.mode = assets.EXPORT_MODE_MANUAL
        op = row.operator("blendup.set_export_mode", text="Off")
        op.mode = assets.EXPORT_MODE_DISABLED

        col = layout.column(align=True)
        col.operator("blendup.export_asset", icon="EXPORT")
        col.operator("blendup.validate", icon="CHECKMARK")
        col.operator("blendup.open_card", icon="WINDOW")

        self._draw_issues(layout, scene)
        self._draw_templates(layout)

    def _draw_issues(self, layout, scene):
        issues = validate_ops.LAST_ISSUES.get(scene.name)
        if not issues:
            return
        box = layout.box()
        box.label(text="Derniere validation", icon="INFO")
        icons = {"error": "CANCEL", "warning": "ERROR", "info": "INFO"}
        for issue in issues[:8]:
            box.label(text=issue["message"], icon=icons.get(issue["level"], "DOT"))

    def _draw_templates(self, layout):
        box = layout.box()
        box.label(text="Templates", icon="ADD")
        box.operator("blendup.new_material_basic", icon="MATERIAL")
        box.operator("blendup.add_simple_collider", icon="MESH_CUBE")
        box.operator("blendup.prepare_static_mesh", icon="MODIFIER")


classes = (BLENDUP_PT_panel,)
