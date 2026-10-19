from pathlib import Path

import bpy

from ..blender_bake import BakeOptions, bake_pairs, discover_pairs, organize_pair


class BLENDUP_PG_bake(bpy.types.PropertyGroup):
    resolution: bpy.props.EnumProperty(name="Résolution", items=[(str(n), f"{n} × {n}", "") for n in (256, 512, 1024, 2048, 4096)], default="2048")
    channels: bpy.props.EnumProperty(name="Cartes", options={"ENUM_FLAG"}, items=[
        ("NORMAL", "Normales", "Normales tangentes OpenGL (+Y)", 1),
        ("BASE_COLOR", "Couleur", "Couleur sans éclairage", 2),
        ("ROUGHNESS", "Rugosité", "Roughness du Principled", 4),
        ("METALLIC", "Métal", "Metallic du Principled", 8),
    ], default={"NORMAL"})
    scope: bpy.props.EnumProperty(name="Paires", items=[("SELECTED", "Sélectionnées", "Paires dont le LOW, HIGH ou CAGE est sélectionné"), ("ALL", "Toute la scène", "Toutes les paires identifiées de la scène")], default="SELECTED")
    margin: bpy.props.IntProperty(name="Marge (px)", default=16, min=0, max=128)
    extrusion: bpy.props.FloatProperty(name="Extrusion (%)", description="Pourcentage de la diagonale du LOW, départ des rayons vers le HIGH", default=1, min=0, max=50)
    max_ray_distance: bpy.props.FloatProperty(name="Distance max. des rayons", description="En unités Blender ; 0 = illimitée", default=0, min=0, subtype="DISTANCE")
    rest_pose: bpy.props.BoolProperty(name="Pose de repos", description="Évalue temporairement les armatures en pose de repos", default=True)
    outer_surface: bpy.props.BoolProperty(name="Surface externe (Solidify)", description="Ignore temporairement Solidify sur le LOW pendant le bake pour éviter que sa coque intérieure écrase les mêmes UV", default=True)
    last_result: bpy.props.StringProperty(default="", options={"SKIP_SAVE"})


class BLENDUP_OT_organize_bake(bpy.types.Operator):
    bl_idname = "blendup.organize_bake"
    bl_label = "Organiser la paire"
    bl_description = "Sélectionne HIGH puis LOW actif : crée une collection d'asset compacte et mémorise leur lien sans renommer les objets"
    bl_options = {"REGISTER", "UNDO"}

    def execute(self, context):
        try:
            name = organize_pair(context)
            from .scene_asset_ops import outliner_spaces, set_asset_view
            set_asset_view(outliner_spaces(context), True)
            self.report({"INFO"}, f"Paire {name} organisée. Les HIGH seront ignorés à l'export.")
            return {"FINISHED"}
        except Exception as error:
            self.report({"ERROR"}, str(error))
            return {"CANCELLED"}


class BLENDUP_OT_bake(bpy.types.Operator):
    bl_idname = "blendup.bake"
    bl_label = "Bake"
    bl_description = "Bake HIGH vers LOW, enregistre les PNG et branche le matériau du LOW ; les textures précédentes sont sauvegardées"
    bl_options = {"REGISTER", "UNDO"}

    @classmethod
    def poll(cls, context):
        return bool(bpy.data.filepath) and context.mode == "OBJECT"

    def execute(self, context):
        settings = context.scene.blendup_bake
        try:
            pairs = discover_pairs(context, settings.scope == "SELECTED")
            options = BakeOptions(resolution=int(settings.resolution), channels=tuple(c for c in ("NORMAL", "BASE_COLOR", "ROUGHNESS", "METALLIC") if c in settings.channels), margin=settings.margin, extrusion=settings.extrusion / 100, max_ray_distance=settings.max_ray_distance, rest_pose=settings.rest_pose, outer_surface=settings.outer_surface)
            context.window_manager.progress_begin(0, 100)
            report = bake_pairs(context, pairs, Path(bpy.data.filepath).parent / "textures" / "bakes" / Path(bpy.data.filepath).stem, options, lambda fraction, _name: context.window_manager.progress_update(fraction * 100))
            settings.last_result = f"{len(pairs)} paire(s) · {len(report['files'])} carte(s) enregistrée(s)"
            self.report({"INFO"}, settings.last_result + " · sauvegarde le .blend pour conserver le matériau")
            return {"FINISHED"}
        except Exception as error:
            settings.last_result = str(error)
            self.report({"ERROR"}, str(error))
            return {"CANCELLED"}
        finally:
            context.window_manager.progress_end()


class BLENDUP_PT_bake(bpy.types.Panel):
    bl_label = "Textures · Bake"
    bl_idname = "BLENDUP_PT_bake"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "BlendUp"

    def draw(self, context):
        layout = self.layout
        settings = context.scene.blendup_bake
        layout.label(text="HIGH → LOW · PNG + matériau", icon="TEXTURE")
        layout.operator("blendup.organize_bake", icon="OUTLINER_COLLECTION")
        layout.label(text="HIGH sélectionné, LOW actif en dernier")
        layout.prop(settings, "scope")
        pairs = discover_pairs(context, settings.scope == "SELECTED")
        if pairs:
            for pair in pairs[:6]:
                layout.label(text=f"{pair['name']} · {len(pair['HIGH'])} HIGH → {len(pair['LOW'])} LOW", icon="CHECKMARK")
            if len(pairs) > 6:
                layout.label(text=f"… et {len(pairs) - 6} autre(s)")
        else:
            layout.label(text="Aucune paire dans cette sélection", icon="INFO")
            layout.label(text="Asset_LOW + Asset_HIGH (ou Asset)")
        layout.prop(settings, "resolution")
        layout.prop(settings, "channels", expand=True)
        layout.prop(settings, "rest_pose")
        layout.prop(settings, "outer_surface")
        advanced = layout.box()
        advanced.prop(settings, "margin")
        advanced.prop(settings, "extrusion")
        advanced.prop(settings, "max_ray_distance")
        row = layout.row()
        row.scale_y = 1.4
        row.enabled = bool(pairs) and bool(settings.channels)
        row.operator("blendup.bake", text="Bake · créer et brancher", icon="RENDER_STILL")
        if settings.last_result:
            from ..ui.panel import split_text
            for line in split_text(settings.last_result, 42):
                layout.label(text=line)
        if not bpy.data.filepath:
            layout.label(text="Enregistre le .blend avant le bake", icon="ERROR")
