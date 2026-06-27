"""Operateurs de creation depuis templates simples (V1).

Volontairement minimalistes (cf. limites V1) : creer un materiau de base
correctement nomme, ajouter un collider simple, et preparer un static mesh
pour l'export. Pas de logique gameplay ni de generation avancee.
"""

from __future__ import annotations

import bpy
from bpy.props import StringProperty
from bpy.types import Operator


class BLENDUP_OT_new_material_basic(Operator):
    bl_idname = "blendup.new_material_basic"
    bl_label = "Materiau de base"
    bl_description = "Creer un materiau Principled correctement nomme et l'assigner a l'objet actif"
    bl_options = {"REGISTER", "UNDO"}

    name: StringProperty(name="Nom", default="MAT_NewMaterial_01")

    def invoke(self, context, event):
        return context.window_manager.invoke_props_dialog(self)

    def execute(self, context):
        name = (self.name or "").strip() or "MAT_NewMaterial_01"
        material = bpy.data.materials.new(name=name)
        material.use_nodes = True  # cree un Principled BSDF par defaut

        obj = context.active_object
        if obj and hasattr(obj.data, "materials"):
            obj.data.materials.append(material)

        self.report({"INFO"}, f"Materiau cree: {material.name}")
        return {"FINISHED"}


class BLENDUP_OT_add_simple_collider(Operator):
    bl_idname = "blendup.add_simple_collider"
    bl_label = "Collider simple"
    bl_description = "Ajouter une boite collider (_COL) ajustee a l'objet actif"
    bl_options = {"REGISTER", "UNDO"}

    @classmethod
    def poll(cls, context):
        return context.active_object is not None and context.active_object.type == "MESH"

    def execute(self, context):
        source = context.active_object
        base = source.name

        bpy.ops.mesh.primitive_cube_add(location=source.location)
        collider = context.active_object
        collider.name = f"{base}_COL"
        collider.dimensions = source.dimensions
        collider.display_type = "WIRE"
        collider.hide_render = True
        collider.parent = source

        self.report({"INFO"}, f"Collider ajoute: {collider.name}")
        return {"FINISHED"}


class BLENDUP_OT_prepare_static_mesh(Operator):
    bl_idname = "blendup.prepare_static_mesh"
    bl_label = "Preparer le static mesh"
    bl_description = "Appliquer l'echelle des meshes selectionnes pour un export propre"
    bl_options = {"REGISTER", "UNDO"}

    @classmethod
    def poll(cls, context):
        return any(obj.type == "MESH" for obj in context.selected_objects)

    def execute(self, context):
        meshes = [obj for obj in context.selected_objects if obj.type == "MESH"]
        if not meshes:
            self.report({"WARNING"}, "Aucun mesh selectionne.")
            return {"CANCELLED"}

        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        self.report({"INFO"}, f"Echelle appliquee sur {len(meshes)} mesh(es).")
        return {"FINISHED"}


classes = (
    BLENDUP_OT_new_material_basic,
    BLENDUP_OT_add_simple_collider,
    BLENDUP_OT_prepare_static_mesh,
)
