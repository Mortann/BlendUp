from __future__ import annotations

from dataclasses import dataclass

import bmesh
import bpy

from ..core.validation import validate_meshes
from ..blender_uv import check_and_record, project_policy, passes_uv_gate
from .export_ops import current_asset


@dataclass
class BlenderMeshInfo:
    name: str
    scale: tuple[float, float, float]
    has_uv: bool
    material_count: int
    non_manifold_edges: int


def mesh_info(obj) -> BlenderMeshInfo:
    mesh = obj.data
    bm = bmesh.new()
    try:
        bm.from_mesh(mesh)
        non_manifold = sum(1 for edge in bm.edges if not edge.is_manifold)
    finally:
        bm.free()
    return BlenderMeshInfo(
        name=obj.name,
        scale=tuple(obj.scale),
        has_uv=bool(mesh.uv_layers),
        material_count=len(obj.material_slots),
        non_manifold_edges=non_manifold,
    )


class BLENDUP_OT_validate_asset(bpy.types.Operator):
    bl_idname = "blendup.validate_asset"
    bl_label = "Valider l'asset"
    bl_description = "Vérifie les problèmes fréquents avant export"
    bl_options = {"REGISTER"}

    def execute(self, context):
        meshes = [obj for obj in context.scene.objects if obj.type == "MESH"]
        if not meshes:
            context.window_manager.blendup_validation_summary = "Aucun maillage dans la scène"
            self.report({"WARNING"}, "Aucun maillage dans la scène")
            return {"FINISHED"}
        issues = validate_meshes(mesh_info(obj) for obj in meshes)
        if not issues:
            context.window_manager.blendup_validation_summary = f"{len(meshes)} maillage(s) · aucun problème"
            self.report({"INFO"}, "Validation réussie")
            return {"FINISHED"}
        warnings = sum(issue.severity == "warning" for issue in issues)
        context.window_manager.blendup_validation_summary = f"{len(issues)} point(s), dont {warnings} avertissement(s)"
        for issue in issues[:8]:
            self.report({"WARNING" if issue.severity == "warning" else "INFO"}, f"{issue.object_name} : {issue.message}")
        return {"FINISHED"}


class BLENDUP_OT_check_uvs(bpy.types.Operator):
    bl_idname = "blendup.check_uvs"
    bl_label = "Vérifier les UV"
    bl_description = "Mesure la qualité UV et les coutures, sans modifier le maillage"

    def execute(self, context):
        try:
            asset = current_asset()
            from ..core.asset_policy import uv_validation_ignored
            if uv_validation_ignored(asset.project.root, asset.source):
                context.window_manager.blendup_validation_summary = "Asset ignoré pour la vérification UV"
                self.report({"INFO"}, context.window_manager.blendup_validation_summary)
                return {"FINISHED"}
            report = check_and_record(asset.project.root, asset.source, context)
            context.window_manager.blendup_validation_summary = f"Score UV : {report['score']:.1f}/100"
            passed = passes_uv_gate(report, project_policy(asset.project.root))
            self.report({"INFO" if passed else "WARNING"}, context.window_manager.blendup_validation_summary)
            return {"FINISHED"}
        except Exception as error:
            self.report({"ERROR"}, str(error))
            return {"CANCELLED"}
