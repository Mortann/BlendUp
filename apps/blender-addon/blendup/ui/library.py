from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess

import bpy
from bpy.app.handlers import persistent
from bpy.props import BoolProperty, CollectionProperty, IntProperty, StringProperty

from ..core.library import source_assets, publish_index
from ..core.project import find_project_root
from ..scripts.build_library import load_asset

_process = None
_process_root = None
_session_project = None


def associated_root():
    global _session_project
    if bpy.data.filepath:
        root = find_project_root(bpy.data.filepath)
        if root is not None:
            _session_project = root
            return root
    roots = {find_project_root(bpy.path.abspath(library.filepath)) for library in bpy.data.libraries}
    roots.discard(None)
    if len(roots) == 1:
        _session_project = next(iter(roots))
        return _session_project
    return _session_project if not bpy.data.filepath else None


def refresh_list(context, root):
    manifest = source_assets(root)
    items = context.window_manager.blendup_library_items
    items.clear()
    for asset in manifest["assets"]:
        item = items.add()
        item.name = asset["name"]
        item.source = asset["sourcePath"]
        item.folder = asset["folder"]
        item.search_text = (asset["name"] + " " + asset["folder"] + " " + " ".join(asset["tags"])).lower()
    context.window_manager.blendup_library_index = 0
    return manifest


@persistent
def library_after_load(_unused=None):
    if os.environ.get("BLENDUP_BACKGROUND_TASK") == "1":
        return
    root = associated_root()
    if root is not None:
        try:
            refresh_list(bpy.context, root)
        except (OSError, ValueError):
            pass


class BLENDUP_LibraryItem(bpy.types.PropertyGroup):
    source: StringProperty()
    folder: StringProperty()
    search_text: StringProperty()


class BLENDUP_UL_library(bpy.types.UIList):
    def draw_item(self, _context, layout, _data, item, _icon, _active_data, _active_propname, _index):
        row = layout.row()
        row.label(text=item.name, icon="OUTLINER_OB_GROUP_INSTANCE")
        row.label(text=item.folder)

    def filter_items(self, context, data, propname):
        query = context.window_manager.blendup_library_search.strip().lower()
        items = getattr(data, propname)
        return [self.bitflag_filter_item if not query or query in item.search_text else 0 for item in items], []


class BLENDUP_OT_library_refresh(bpy.types.Operator):
    bl_idname = "blendup.library_refresh"
    bl_label = "Actualiser la bibliothèque"
    bl_description = "Relit les assets du projet associé"

    def execute(self, context):
        root = associated_root()
        if root is None:
            self.report({"WARNING"}, "Ouvre un asset ou une scène Showcase du projet BlendUp.")
            return {"CANCELLED"}
        refresh_list(context, root)
        publish_index(root)
        return {"FINISHED"}


class BLENDUP_OT_library_place(bpy.types.Operator):
    bl_idname = "blendup.library_place"
    bl_label = "Placer l’asset"
    bl_description = "Place l’asset au curseur 3D, à son échelle réelle"
    bl_options = {"REGISTER", "UNDO"}

    def execute(self, context):
        root = associated_root()
        wm = context.window_manager
        if root is None or not wm.blendup_library_items or wm.blendup_library_index >= len(wm.blendup_library_items):
            return {"CANCELLED"}
        item = wm.blendup_library_items[wm.blendup_library_index]
        source = (root / item.source).resolve()
        if root not in source.parents or not source.is_file():
            self.report({"ERROR"}, "Source introuvable. Actualise la bibliothèque.")
            return {"CANCELLED"}
        if source == Path(bpy.data.filepath).resolve():
            self.report({"WARNING"}, "Place cet asset dans un autre fichier Blender.")
            return {"CANCELLED"}
        try:
            collection, _bounds = load_asset(source, link=wm.blendup_library_link)
            collection.name = item.name
            if wm.blendup_library_link:
                context.scene.collection.children.unlink(collection)
                obj = bpy.data.objects.new(item.name, None)
                obj.instance_type = "COLLECTION"
                obj.instance_collection = collection
                obj.location = context.scene.cursor.location
                context.collection.objects.link(obj)
                for selected in context.selected_objects:
                    selected.select_set(False)
                obj.select_set(True)
                context.view_layer.objects.active = obj
            else:
                # A parent preserves every object's original transform and rig hierarchy.
                parent = bpy.data.objects.new(item.name, None)
                parent.location = context.scene.cursor.location
                collection.objects.link(parent)
                for obj in list(collection.objects):
                    if obj != parent and obj.parent is None:
                        obj.parent = parent
            self.report({"INFO"}, "Instance liée placée" if wm.blendup_library_link else "Copie modifiable placée")
            return {"FINISHED"}
        except Exception as error:
            self.report({"ERROR"}, str(error))
            return {"CANCELLED"}


def library_ready():
    global _process, _process_root
    if _process is None:
        return None
    if _process.poll() is None:
        return 0.5
    _process = None
    for window in bpy.context.window_manager.windows:
        for area in window.screen.areas:
            area.tag_redraw()
    return None


class BLENDUP_OT_library_sync(bpy.types.Operator):
    bl_idname = "blendup.library_sync"
    bl_label = "Synchroniser le glisser-déposer"
    bl_description = "Construit la bibliothèque native Blender en arrière-plan"

    def execute(self, context):
        global _process, _process_root
        root = associated_root()
        if root is None or _process is not None:
            return {"CANCELLED"}
        manifest = refresh_list(context, root)
        job = root / ".blendup/temp/library-addon/job.json"
        job.parent.mkdir(parents=True, exist_ok=True)
        job.write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf-8")
        script = Path(__file__).resolve().parents[1] / "scripts/build_library.py"
        env = dict(os.environ, BLENDUP_BACKGROUND_TASK="1")
        # Suppress the Windows command window; keep a diagnostic log.
        with (job.parent / "build.log").open("wb") as log:
            _process = subprocess.Popen([bpy.app.binary_path, "--background", "--factory-startup", "--python-exit-code", "1", "--python", str(script), "--", str(job)], env=env,
                                        stdout=log, stderr=log, creationflags=0x08000000 if os.name == "nt" else 0)
        _process_root = root
        bpy.app.timers.register(library_ready, first_interval=0.5)
        self.report({"INFO"}, "Bibliothèque en cours de génération")
        return {"FINISHED"}


class BLENDUP_OT_library_browser(bpy.types.Operator):
    bl_idname = "blendup.library_browser"
    bl_label = "Navigateur d’assets · glisser-déposer"
    bl_description = "Ouvre le navigateur natif avec la bibliothèque du projet et l’import lié par défaut"

    def execute(self, context):
        root = associated_root()
        if root is None:
            return {"CANCELLED"}
        directory = root / ".blendup/library/blender"
        if not (directory / "status.json").exists():
            self.report({"WARNING"}, "Synchronise d’abord la bibliothèque (ici ou dans les paramètres BlendUp).")
            return {"CANCELLED"}
        libraries = context.preferences.filepaths.asset_libraries
        library = next((lib for lib in libraries if Path(bpy.path.abspath(lib.path)).resolve() == directory.resolve()), None)
        if library is None:
            library = libraries.new(name="BlendUp · " + root.name, directory=str(directory))
        library.import_method = "LINK" if context.window_manager.blendup_library_link else "APPEND"
        # Preserve the existing 3D view; split off an Asset Browser below it.
        existing = next((area for area in context.screen.areas if area.type == "FILE_BROWSER" and area.ui_type == "ASSETS"), None)
        if existing is None:
            original = set(context.screen.areas)
            bpy.ops.screen.area_split(direction="HORIZONTAL", factor=0.35)
            existing = next((area for area in context.screen.areas if area not in original), None)
        if existing is None:
            return {"CANCELLED"}
        existing.type = "FILE_BROWSER"
        existing.ui_type = "ASSETS"
        browser = existing.spaces.active
        # File browser params are allocated on the next UI update.
        def select_library():
            try:
                params = browser.params
                if params is None:
                    return 0.1
                params.asset_library_reference = library.name
                params.import_method = "LINK" if context.window_manager.blendup_library_link else "APPEND"
                with context.temp_override(area=existing, region=next(r for r in existing.regions if r.type == "WINDOW")):
                    bpy.ops.asset.library_refresh()
                existing.tag_redraw()
            except (ReferenceError, RuntimeError, TypeError) as error:
                print(f"[BlendUp] Sélection de la bibliothèque impossible : {error}")
            return None
        bpy.app.timers.register(select_library, first_interval=0.1)
        return {"FINISHED"}


class BLENDUP_PT_library(bpy.types.Panel):
    bl_label = "Bibliothèque du projet"
    bl_idname = "BLENDUP_PT_library"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "BlendUp"

    def draw(self, context):
        layout = self.layout
        root = associated_root()
        if root is None:
            layout.label(text="Ouvre un asset ou un Showcase BlendUp.", icon="INFO")
            return
        wm = context.window_manager
        layout.label(text=root.name, icon="FILE_FOLDER")
        layout.operator("blendup.library_refresh", icon="FILE_REFRESH")
        layout.prop(wm, "blendup_library_search", text="", icon="VIEWZOOM")
        layout.template_list("BLENDUP_UL_library", "", wm, "blendup_library_items", wm, "blendup_library_index", rows=6)
        layout.prop(wm, "blendup_library_link", text="Instance liée")
        layout.operator("blendup.library_place", icon="IMPORT")
        layout.separator()
        layout.operator("blendup.library_browser", icon="ASSET_MANAGER")
        row = layout.row()
        row.enabled = _process is None
        row.operator("blendup.library_sync", icon="FILE_REFRESH", text="Synchroniser" if _process is None else "Synchronisation…")
        layout.label(text="Glisse les vignettes dans la vue 3D.")


CLASSES = (BLENDUP_LibraryItem, BLENDUP_UL_library, BLENDUP_OT_library_refresh, BLENDUP_OT_library_place,
           BLENDUP_OT_library_sync, BLENDUP_OT_library_browser, BLENDUP_PT_library)


def register_properties():
    wm = bpy.types.WindowManager
    wm.blendup_library_items = CollectionProperty(type=BLENDUP_LibraryItem)
    wm.blendup_library_index = IntProperty(default=0)
    wm.blendup_library_search = StringProperty()
    wm.blendup_library_link = BoolProperty(default=True)
    bpy.app.handlers.load_post.append(library_after_load)
    library_after_load()


def unregister_properties():
    if library_after_load in bpy.app.handlers.load_post:
        bpy.app.handlers.load_post.remove(library_after_load)
    if bpy.app.timers.is_registered(library_ready):
        bpy.app.timers.unregister(library_ready)
    for name in ("blendup_library_items", "blendup_library_index", "blendup_library_search", "blendup_library_link"):
        if hasattr(bpy.types.WindowManager, name):
            delattr(bpy.types.WindowManager, name)
