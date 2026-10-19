import bpy

from ..core.bake import bake_groups
from ..scene_assets import compact_asset_roots, show_asset_role


_outliner_filters = {}


def outliner_spaces(context):
    if context.area and context.area.type == "OUTLINER":
        return [context.area.spaces.active] if context.area.spaces.active.display_mode == "VIEW_LAYER" else []
    return [area.spaces.active for area in context.screen.areas if area.type == "OUTLINER"
            and area.spaces.active.display_mode == "VIEW_LAYER"] if context.screen else []


def set_asset_view(spaces, compact):
    for space in spaces:
        key = space.as_pointer()
        if compact:
            _outliner_filters.setdefault(key, (space.use_filter_object, space.use_filter_collection))
            space.use_filter_collection = True
            space.use_filter_object = False
        else:
            space.use_filter_object, space.use_filter_collection = _outliner_filters.pop(key, (True, True))


class BLENDUP_OT_outliner_assets(bpy.types.Operator):
    bl_idname = "blendup.outliner_assets"
    bl_label = "Vue Assets / Détails"
    bl_description = "Affiche une entrée par collection d'asset dans l'Outliner ; ne masque aucun objet dans la vue 3D"

    def execute(self, context):
        spaces = outliner_spaces(context)
        if not spaces:
            self.report({"WARNING"}, "Aucun Outliner dans cet espace de travail.")
            return {"CANCELLED"}
        set_asset_view(spaces, any(space.use_filter_object for space in spaces))
        return {"FINISHED"}


class BLENDUP_OT_compact_assets(bpy.types.Operator):
    bl_idname = "blendup.compact_assets"
    bl_label = "Simplifier les assets existants"
    bl_description = "Remplace les niveaux BAKE / LOW / HIGH / CAGE créés par BlendUp par une collection par asset. Les objets, matériaux et liens de bake sont conservés"
    bl_options = {"REGISTER", "UNDO"}

    def execute(self, context):
        try:
            count = compact_asset_roots(context)
            if not count:
                self.report({"INFO"}, "Aucune collection de bake BlendUp à simplifier.")
                return {"CANCELLED"}
            set_asset_view(outliner_spaces(context), True)
            self.report({"INFO"}, f"{count} asset(s) simplifié(s). Le bouton Détails réaffiche les objets.")
            return {"FINISHED"}
        except Exception as error:
            self.report({"ERROR"}, str(error))
            return {"CANCELLED"}


class BLENDUP_OT_show_asset_role(bpy.types.Operator):
    bl_idname = "blendup.show_asset_role"
    bl_label = "Afficher la version"
    bl_description = "Affiche et sélectionne la version de cet asset ; masque ses autres versions dans le View Layer courant"
    bl_options = {"REGISTER", "UNDO"}

    asset_key: bpy.props.StringProperty()
    role: bpy.props.EnumProperty(items=[("LOW", "LOW", "Version de jeu"), ("HIGH", "HIGH", "Source détaillée"), ("CAGE", "Cage", "Cage de projection")], default="LOW")

    @classmethod
    def poll(cls, context):
        if context.mode != "OBJECT":
            cls.poll_message_set("Passe en mode Objet pour changer de version")
            return False
        return True

    def execute(self, context):
        try:
            show_asset_role(context, self.asset_key, self.role)
            return {"FINISHED"}
        except Exception as error:
            self.report({"ERROR"}, str(error))
            return {"CANCELLED"}


class BLENDUP_PT_scene_assets(bpy.types.Panel):
    bl_label = "Assets dans la scène"
    bl_idname = "BLENDUP_PT_scene_assets"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "BlendUp"

    def draw(self, context):
        layout = self.layout
        row = layout.row(align=True)
        spaces = outliner_spaces(context)
        compact = bool(spaces) and all(not space.use_filter_object for space in spaces)
        row.operator("blendup.outliner_assets", text="Détails" if compact else "Vue Assets", icon="OUTLINER")
        row.operator("blendup.compact_assets", text="Simplifier", icon="OUTLINER_COLLECTION")
        layout.prop(context.window_manager, "blendup_scene_asset_search", text="", icon="VIEWZOOM")
        query = context.window_manager.blendup_scene_asset_search.casefold().strip()
        groups = sorted((g for g in bake_groups(context.scene.objects).values() if g["LOW"]), key=lambda g: g["name"].casefold())
        selected = set(context.selected_objects)
        for group in groups:
            if query and query not in group["name"].casefold():
                continue
            row = layout.row(align=True)
            active = bool(selected.intersection(group["LOW"] + group["HIGH"] + group["CAGE"]))
            button = row.operator("blendup.show_asset_role", text=group["name"], icon="OUTLINER_OB_MESH", depress=active)
            button.asset_key, button.role = group["name"], "LOW"
            for role in ("LOW", "HIGH", "CAGE"):
                if not group[role]:
                    continue
                visible = any(obj.name in context.view_layer.objects and obj.visible_get(view_layer=context.view_layer) for obj in group[role])
                button = row.operator("blendup.show_asset_role", text="Cage" if role == "CAGE" else role, depress=visible)
                button.asset_key, button.role = group["name"], role
        if not groups:
            layout.label(text="Organise une paire LOW / HIGH pour commencer.", icon="INFO")
        layout.label(text="Vue Assets : collections seules dans l'Outliner")


def draw_outliner_assets(self, context):
    if context.space_data.display_mode != "VIEW_LAYER":
        return
    compact = not context.space_data.use_filter_object
    self.layout.operator("blendup.outliner_assets", text="Détails" if compact else "Assets", icon="OUTLINER_COLLECTION", depress=compact)


def register_scene_assets():
    bpy.types.WindowManager.blendup_scene_asset_search = bpy.props.StringProperty(name="Rechercher un asset", default="", options={"SKIP_SAVE"})
    bpy.types.OUTLINER_HT_header.append(draw_outliner_assets)


def unregister_scene_assets():
    bpy.types.OUTLINER_HT_header.remove(draw_outliner_assets)
    if hasattr(bpy.types.WindowManager, "blendup_scene_asset_search"):
        del bpy.types.WindowManager.blendup_scene_asset_search
    for screen in bpy.data.screens:
        spaces = [space for area in screen.areas for space in area.spaces
                  if space.type == "OUTLINER" and space.as_pointer() in _outliner_filters]
        set_asset_view(spaces, False)
    _outliner_filters.clear()
