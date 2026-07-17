import bpy

from .export_ops import current_asset


ASSET_DIRECTORIES = ("textures", "references", "renders")


class BLENDUP_OT_refresh(bpy.types.Operator):
    bl_idname = "blendup.refresh"
    bl_label = "Actualiser"
    bl_description = "Relit le projet BlendUp et l'état de l'export"

    def execute(self, context):
        for area in context.screen.areas if context.screen else []:
            area.tag_redraw()
        return {"FINISHED"}


class BLENDUP_OT_prepare_workspace(bpy.types.Operator):
    bl_idname = "blendup.prepare_workspace"
    bl_label = "Préparer les dossiers"
    bl_description = "Crée les dossiers textures, references et renders autour du fichier Blender"

    @classmethod
    def poll(cls, _context):
        return bool(bpy.data.filepath)

    def execute(self, _context):
        try:
            asset = current_asset()
            for name in ASSET_DIRECTORIES:
                (asset.source.parent / name).mkdir(parents=True, exist_ok=True)
            self.report({"INFO"}, "Dossiers de l'asset prêts")
            return {"FINISHED"}
        except Exception as error:
            self.report({"ERROR"}, str(error))
            return {"CANCELLED"}
