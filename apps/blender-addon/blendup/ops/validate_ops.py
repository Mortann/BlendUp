"""Operateur de validation de base avant export."""

from __future__ import annotations

import bpy
from bpy.types import Operator

from .. import bpy_adapter
from ..core import naming as naming_mod, validation

# Dernier resultat de validation par scene, pour affichage dans le panneau.
LAST_ISSUES: dict = {}


class BLENDUP_OT_validate(Operator):
    bl_idname = "blendup.validate"
    bl_label = "Valider la scene"
    bl_description = "Lancer la validation de base de l'asset lie"
    bl_options = {"REGISTER"}

    def execute(self, context):
        scene = context.scene
        project_root, _project, asset, _asset_file = bpy_adapter.resolve_current(scene)

        if not project_root:
            self.report({"ERROR"}, "Aucun projet BlendUp trouve.")
            return {"CANCELLED"}

        ctx = bpy_adapter.gather_validation_context(scene)
        naming = naming_mod.load_naming(project_root)
        issues = validation.validate_scene(ctx, naming, asset)
        LAST_ISSUES[scene.name] = issues

        for issue in issues:
            print(f"[BlendUp][{issue['level']}] {issue['code']}: {issue['message']}")

        summary = validation.summarize(issues)
        level = "ERROR" if validation.has_blocking(issues) else "INFO"
        self.report({level}, f"Validation: {summary}")
        return {"FINISHED"}


classes = (BLENDUP_OT_validate,)
