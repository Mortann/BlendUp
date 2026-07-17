from __future__ import annotations

import bpy


class BLENDUP_AddonPreferences(bpy.types.AddonPreferences):
    bl_idname = __package__

    auto_export: bpy.props.BoolProperty(
        name="Exporter à chaque sauvegarde",
        description="Met automatiquement à jour le GLB ou le FBX après avoir sauvegardé le fichier Blender",
        default=False,
    )
    selected_only: bpy.props.BoolProperty(
        name="Objets sélectionnés uniquement",
        description="N'exporte que les objets actuellement sélectionnés",
        default=False,
    )
    apply_modifiers: bpy.props.BoolProperty(
        name="Appliquer les modificateurs à l'export",
        default=True,
    )
    export_animations: bpy.props.BoolProperty(
        name="Exporter les animations",
        default=True,
    )

    def draw(self, _context):
        layout = self.layout
        layout.label(text="Export", icon="EXPORT")
        layout.prop(self, "auto_export")
        layout.prop(self, "selected_only")
        layout.prop(self, "apply_modifiers")
        layout.prop(self, "export_animations")
        box = layout.box()
        box.label(text="La destination et le format viennent du projet BlendUp.", icon="INFO")


def preferences(context=None) -> BLENDUP_AddonPreferences | None:
    context = context or bpy.context
    addon = context.preferences.addons.get(__package__)
    return addon.preferences if addon else None
