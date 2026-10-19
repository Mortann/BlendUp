import bpy
from bpy.app.handlers import persistent

from ..core.bake import bake_groups
from ..scene_assets import create_high, select_asset_role, show_asset_role, toggle_asset_visibility, align_high_parent, parent_signature


class BLENDUP_OT_create_high(bpy.types.Operator):
    bl_idname = "blendup.create_high"
    bl_label = "Créer le HIGH"
    bl_description = "Duplique le LOW actif avec un maillage indépendant, nomme le HIGH et organise la paire. Aucun niveau de subdivision n'est ajouté"
    bl_options = {"REGISTER", "UNDO"}

    @classmethod
    def poll(cls, context):
        return context.mode == "OBJECT" and context.object is not None and context.object.type == "MESH"

    def execute(self, context):
        try:
            high = create_high(context)
            self.report({"INFO"}, f"{high.name} créé et sélectionné. Ajoute les détails ou une subdivision selon tes besoins.")
            return {"FINISHED"}
        except Exception as error:
            self.report({"ERROR"}, str(error))
            return {"CANCELLED"}


class BLENDUP_OT_align_high_parent(bpy.types.Operator):
    bl_idname = "blendup.align_high_parent"
    bl_label = "Rattacher HIGH au parent du LOW"
    bl_description = "Le HIGH suivra le même parent ou os que le LOW. Conserve sa position actuelle et organise la paire. Refuse les HIGH animés ou avec contraintes"
    bl_options = {"REGISTER", "UNDO"}
    asset_key: bpy.props.StringProperty()

    @classmethod
    def poll(cls, context):
        return context.mode == "OBJECT"

    def execute(self, context):
        try:
            align_high_parent(context, self.asset_key)
            self.report({"INFO"}, "HIGH rattaché au parent du LOW, position conservée et paire organisée.")
            return {"FINISHED"}
        except Exception as error:
            self.report({"ERROR"}, str(error))
            return {"CANCELLED"}


class BLENDUP_OT_show_asset_role(bpy.types.Operator):
    bl_idname = "blendup.show_asset_role"
    bl_label = "Composants de l'asset"
    bl_description = "Sélection : ajoute ou retire cette version sans désélectionner les autres. Œil : change seulement sa visibilité. Voir seul : isole la version"
    bl_options = {"REGISTER", "UNDO"}
    asset_key: bpy.props.StringProperty()
    role: bpy.props.EnumProperty(items=[("ALL", "Tous", "Sélectionner LOW et HIGH"), ("LOW", "LOW", "Version de jeu"), ("HIGH", "HIGH", "Source détaillée"), ("CAGE", "Cage", "Cage de projection")], default="LOW")
    action: bpy.props.EnumProperty(items=[("SELECT", "Sélection", "Ajouter ou retirer de la sélection"), ("VISIBILITY", "Visibilité", "Afficher ou masquer cette version"), ("SOLO", "Voir seul", "Afficher seulement cette version de la paire")], default="SELECT")

    @classmethod
    def poll(cls, context):
        return context.mode == "OBJECT"

    def execute(self, context):
        try:
            if self.action == "VISIBILITY":
                toggle_asset_visibility(context, self.asset_key, self.role)
            elif self.action == "SOLO":
                show_asset_role(context, self.asset_key, self.role)
            else:
                select_asset_role(context, self.asset_key, self.role)
            return {"FINISHED"}
        except Exception as error:
            self.report({"ERROR"}, str(error))
            return {"CANCELLED"}


class BLENDUP_PT_scene_assets(bpy.types.Panel):
    bl_label = "Assets de bake"
    bl_idname = "BLENDUP_PT_scene_assets"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "BlendUp"

    def draw(self, context):
        layout = self.layout
        layout.operator("blendup.create_high", icon="DUPLICATE")
        layout.prop(context.window_manager, "blendup_scene_asset_search", text="", icon="VIEWZOOM")
        query = context.window_manager.blendup_scene_asset_search.casefold().strip()
        groups = sorted((g for g in bake_groups(context.scene.objects).values() if g["LOW"]), key=lambda g: g["name"].casefold())
        for group in groups:
            if query and query not in group["name"].casefold():
                continue
            box = layout.box()
            row = box.row(align=True)
            row.label(text=group["name"], icon="EMPTY_AXIS")
            button = row.operator("blendup.show_asset_role", text="Tous", icon="RESTRICT_SELECT_OFF")
            button.asset_key, button.role = group["name"], "ALL"
            for role in ("LOW", "HIGH", "CAGE"):
                if not group[role]:
                    continue
                targets = [o for o in group[role] if o.name in context.view_layer.objects]
                row = box.row(align=True)
                selected = bool(targets) and all(o.select_get() for o in targets)
                button = row.operator("blendup.show_asset_role", text=role, depress=selected)
                button.asset_key, button.role = group["name"], role
                visible = any(o.visible_get() for o in targets)
                button = row.operator("blendup.show_asset_role", text="", icon="HIDE_OFF" if visible else "HIDE_ON")
                button.asset_key, button.role, button.action = group["name"], role, "VISIBILITY"
                button = row.operator("blendup.show_asset_role", text="Voir seul")
                button.asset_key, button.role, button.action = group["name"], role, "SOLO"
            if len(group["LOW"]) == 1 and any(parent_signature(o) != parent_signature(group["LOW"][0]) for o in group["HIGH"] + group["CAGE"]):
                button = box.operator("blendup.align_high_parent", icon="CONSTRAINT_BONE")
                button.asset_key = group["name"]
        if not groups:
            layout.label(text="Sélectionne un LOW puis crée son HIGH.", icon="INFO")
        layout.label(text="Déplie l'objet · Asset dans l'Outliner.")


@persistent
def restore_legacy_outliner_filters(_unused=None):
    if any(c.get("blendup_bake_root") for c in bpy.data.collections):
        for screen in bpy.data.screens:
            for area in screen.areas:
                for space in area.spaces:
                    if space.type == "OUTLINER" and space.display_mode == "VIEW_LAYER" and not space.use_filter_object:
                        space.use_filter_object = True


def register_scene_assets():
    bpy.types.WindowManager.blendup_scene_asset_search = bpy.props.StringProperty(name="Rechercher un asset", default="", options={"SKIP_SAVE"})
    # Blender restricts bpy.data while enabling an add-on from Preferences.
    bpy.app.timers.register(restore_legacy_outliner_filters, first_interval=0.1)
    bpy.app.handlers.load_post.append(restore_legacy_outliner_filters)


def unregister_scene_assets():
    if bpy.app.timers.is_registered(restore_legacy_outliner_filters):
        bpy.app.timers.unregister(restore_legacy_outliner_filters)
    if restore_legacy_outliner_filters in bpy.app.handlers.load_post:
        bpy.app.handlers.load_post.remove(restore_legacy_outliner_filters)
    if hasattr(bpy.types.WindowManager, "blendup_scene_asset_search"):
        del bpy.types.WindowManager.blendup_scene_asset_search
