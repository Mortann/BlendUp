import bpy


class BLENDUP_OT_refresh(bpy.types.Operator):
    bl_idname = "blendup.refresh"
    bl_label = "Actualiser"
    bl_description = "Relit le projet BlendUp et l'état de l'export"

    def execute(self, context):
        for area in context.screen.areas if context.screen else []:
            area.tag_redraw()
        return {"FINISHED"}
