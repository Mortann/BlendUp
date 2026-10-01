from __future__ import annotations

import bpy

from ..core.export_state import export_status
from ..ops.export_ops import current_asset
from ..prefs import preferences


STATUS = {
    "ready": ("À exporter", "IMPORT", "Le fichier moteur n'existe pas encore."),
    "outdated": ("À réexporter", "FILE_REFRESH", "Le fichier Blender est plus récent."),
    "exported": ("À jour", "CHECKMARK", "Le fichier moteur est à jour."),
    "error": ("Erreur", "ERROR", "L'état de l'export ne peut pas être lu."),
}


class BLENDUP_PT_asset(bpy.types.Panel):
    bl_label = "BlendUp"
    bl_idname = "BLENDUP_PT_asset"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "BlendUp"

    def draw(self, context):
        layout = self.layout
        if not bpy.data.filepath:
            box = layout.box()
            box.label(text="Fichier non enregistré", icon="ERROR")
            box.label(text="Enregistre-le dans le dossier Art.")
            return
        try:
            asset = current_asset()
        except Exception as error:
            box = layout.box()
            box.label(text="Hors projet BlendUp", icon="QUESTION")
            for line in split_text(str(error), 42):
                box.label(text=line)
            return

        project = layout.box()
        row = project.row()
        row.label(text=asset.project.name, icon="FILE_FOLDER")
        row.operator("blendup.refresh", text="", icon="FILE_REFRESH")
        standalone = asset.project.engine == "none"
        project.label(text="Projet 3D · Sans moteur" if standalone else f"Moteur : {asset.project.engine.title()}")
        if not standalone:
            project.label(text=f"Format : {asset.export_format.upper()}")

        if standalone:
            layout.label(text="Gestion des assets, sans export moteur", icon="FILE_BLEND")
        else:
            status = export_status(asset)
            label, icon, help_text = STATUS[status]
            state = layout.box()
            state.label(text=label, icon=icon)
            state.label(text=help_text)
            destination = state.column(align=True)
            destination.label(text="Destination", icon="EXPORT")
            for line in split_text(asset.output_relative, 38):
                destination.label(text=line)

            button = layout.row()
            button.scale_y = 1.35
            button.operator("blendup.export_asset", text="Réexporter" if status == "exported" else "Exporter l'asset", icon="EXPORT")

        validation = layout.box()
        validation.label(text="Contrôle", icon="VIEWZOOM")
        summary = context.window_manager.blendup_validation_summary
        if summary:
            validation.label(text=summary, icon="INFO")
        validation.operator("blendup.validate_asset", icon="CHECKMARK")

        prefs = preferences(context)
        if prefs and not standalone:
            options = layout.box()
            options.prop(prefs, "auto_export", icon="RECOVER_LAST")
            options.prop(prefs, "selected_only")
        row = layout.row(align=True)
        source = row.operator("blendup.open_location", text="Art", icon="FILE_FOLDER")
        source.location = "SOURCE"
        if not standalone:
            output = row.operator("blendup.open_location", text="Assets", icon="FILE_FOLDER")
            output.location = "OUTPUT"
        layout.operator("blendup.prepare_workspace", text="Préparer les dossiers", icon="NEWFOLDER")


def split_text(value: str, width: int) -> list[str]:
    if len(value) <= width:
        return [value]
    parts: list[str] = []
    remaining = value
    while len(remaining) > width:
        split_at = remaining.rfind("/", 0, width)
        if split_at < 1:
            split_at = width
        parts.append(remaining[:split_at + (1 if remaining[split_at:split_at + 1] == "/" else 0)])
        remaining = remaining[split_at + (1 if remaining[split_at:split_at + 1] == "/" else 0):]
    if remaining:
        parts.append(remaining)
    return parts
