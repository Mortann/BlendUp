"""Preferences de l'add-on BlendUp.

C'est ici que vivent les reglages d'export FBX (decision produit : les
parametres d'export sont dans les preferences de l'add-on), ainsi que le nom
d'acteur ecrit dans le journal d'activite et les options de lien vers l'app.
"""

from __future__ import annotations

import bpy
from bpy.props import BoolProperty, EnumProperty, StringProperty
from bpy.types import AddonPreferences

from .core import export_settings

ADDON_ID = __package__


class BlendUpPreferences(AddonPreferences):
    bl_idname = ADDON_ID

    actor: StringProperty(
        name="Nom d'acteur",
        description="Nom enregistre dans le journal d'activite BlendUp",
        default="",
    )
    app_path: StringProperty(
        name="Executable BlendUp",
        description="Chemin de l'application BlendUp (optionnel, pour ouvrir une fiche)",
        subtype="FILE_PATH",
        default="",
    )
    enable_deep_link: BoolProperty(
        name="Tenter le lien blendup://",
        description="Ancienne option reservee a un futur enregistrement du protocole Windows",
        default=False,
    )

    # --- Reglages d'export FBX ---
    use_selection: BoolProperty(
        name="Objets selectionnes uniquement",
        description="Exporter seulement la selection plutot que toute la scene",
        default=export_settings.DEFAULT_FBX_SETTINGS["use_selection"],
    )
    apply_unit_scale: BoolProperty(
        name="Appliquer l'echelle d'unite",
        default=export_settings.DEFAULT_FBX_SETTINGS["apply_unit_scale"],
    )
    bake_space_transform: BoolProperty(
        name="Bake space transform",
        default=export_settings.DEFAULT_FBX_SETTINGS["bake_space_transform"],
    )
    add_leaf_bones: BoolProperty(
        name="Ajouter les leaf bones",
        default=export_settings.DEFAULT_FBX_SETTINGS["add_leaf_bones"],
    )
    mesh_smooth_type: EnumProperty(
        name="Lissage des meshes",
        items=[
            ("OFF", "Off", "Aucune information de lissage"),
            ("FACE", "Face", "Lissage par face"),
            ("EDGE", "Edge", "Lissage par arete"),
        ],
        default=export_settings.DEFAULT_FBX_SETTINGS["mesh_smooth_type"],
    )
    export_empties: BoolProperty(name="Exporter les empties", default=True)
    export_armatures: BoolProperty(name="Exporter les armatures", default=True)
    path_mode: EnumProperty(
        name="Mode des chemins",
        items=[
            ("AUTO", "Auto", "Comportement automatique"),
            ("COPY", "Copy", "Copier les fichiers lies"),
        ],
        default=export_settings.DEFAULT_FBX_SETTINGS["path_mode"],
    )

    def to_settings_dict(self) -> dict:
        object_types = ["MESH"]
        if self.export_empties:
            object_types.append("EMPTY")
        if self.export_armatures:
            object_types.append("ARMATURE")
        return {
            "use_selection": self.use_selection,
            "apply_unit_scale": self.apply_unit_scale,
            "bake_space_transform": self.bake_space_transform,
            "add_leaf_bones": self.add_leaf_bones,
            "mesh_smooth_type": self.mesh_smooth_type,
            "object_types": object_types,
            "path_mode": self.path_mode,
        }

    def draw(self, context):
        layout = self.layout

        box = layout.box()
        box.label(text="Identite et application", icon="USER")
        box.prop(self, "actor")
        box.prop(self, "app_path")

        box = layout.box()
        box.label(text="Export FBX", icon="EXPORT")
        box.prop(self, "use_selection")
        box.prop(self, "apply_unit_scale")
        box.prop(self, "bake_space_transform")
        box.prop(self, "mesh_smooth_type")
        row = box.row()
        row.prop(self, "export_empties")
        row.prop(self, "export_armatures")
        box.prop(self, "add_leaf_bones")
        box.prop(self, "path_mode")


def get_prefs(context) -> BlendUpPreferences:
    return context.preferences.addons[ADDON_ID].preferences


def actor_name(context) -> str:
    prefs = get_prefs(context)
    return (prefs.actor or "").strip() or "blender"


classes = (BlendUpPreferences,)


def register():
    for cls in classes:
        bpy.utils.register_class(cls)


def unregister():
    for cls in reversed(classes):
        bpy.utils.unregister_class(cls)
