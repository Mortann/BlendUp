"""Compact legacy bake trees; preserve geometry, visibility, exports and UI filters."""
from pathlib import Path
import sys

import bpy

args = sys.argv[sys.argv.index("--") + 1:]
sys.path.insert(0, str(Path(args[0]).resolve()))
import blendup
from blendup.blender_bake import discover_pairs, organize_pair
from blendup.blender_export import export_objects, export_scene
from blendup.core.bake import ROLE_KEY, PAIR_KEY, bake_helpers
from blendup.scene_assets import compact_asset_roots, show_asset_role
from blendup.ops.scene_asset_ops import set_asset_view

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.file_preview_type = "NONE"
blendup.register()
context = bpy.context
scene = context.scene


def legacy_pair(key):
    root = bpy.data.collections.new(key + "_BAKE")
    root["blendup_bake_root"] = key
    scene.collection.children.link(root)
    members = {}
    for role in ("LOW", "HIGH", "CAGE"):
        child = bpy.data.collections.new(key + "_" + role)
        child[ROLE_KEY], child[PAIR_KEY] = role, key
        root.children.link(child)
        if role == "CAGE":
            continue
        bpy.ops.mesh.primitive_plane_add()
        obj = context.object
        obj.name = key if role == "LOW" else key + "_High"
        for previous in list(obj.users_collection):
            previous.objects.unlink(obj)
        child.objects.link(obj)
        members[role] = obj
    context.view_layer.update()
    return root, members


root, objects = legacy_pair("Epaulière1_Droite")
low, high = objects["LOW"], objects["HIGH"]
second_layer = scene.view_layers.new("Game")
second_layer.layer_collection.children[root.name].children["Epaulière1_Droite_HIGH"].exclude = True
high.hide_set(True)
geometry = (low.data, high.data, low.matrix_world.copy(), high.matrix_world.copy())
before_export = export_objects(context, False)
assert before_export == {low}
assert compact_asset_roots(context) == 1
assert root.name == "Epaulière1_Droite" and not root.children
assert set(root.objects) == {low, high}
assert high.hide_get() and not low.hide_get()
assert high.hide_get(view_layer=second_layer)
assert (low.data, high.data, low.matrix_world, high.matrix_world) == geometry
assert high in bake_helpers(scene.objects)
assert export_objects(context, False) == before_export
assert len(discover_pairs(context)) == 1
assert compact_asset_roots(context) == 1

# LOW / HIGH changes editing visibility only; helpers stay excluded from export.
show_asset_role(context, root.name, "HIGH")
assert low.hide_get() and not high.hide_get()
assert context.view_layer.objects.active == high and set(context.selected_objects) == {high}
assert export_objects(context, False) == {low}
assert export_objects(context, True) == {low}
assert low.hide_get() and not high.hide_get()
from blendup.blender_uv import analyze_scene
from blendup.core.uv_quality import UvPolicy
report = analyze_scene(UvPolicy())
assert [o["objectName"] for o in report["objects"]] == [low.name]
assert low.hide_get() and not high.hide_get()
out = Path(args[1]).resolve()
out.mkdir(parents=True, exist_ok=True)
export_scene(out / "HighPreview.glb", "glb")
import json, struct
data = (out / "HighPreview.glb").read_bytes()
length, kind = struct.unpack_from("<II", data, 12)
gltf = json.loads(data[20:20 + length])
assert {node["name"] for node in gltf["nodes"] if "mesh" in node} == {low.name}
assert low.hide_get() and not high.hide_get()
assert context.view_layer.objects.active == high and set(context.selected_objects) == {high}
show_asset_role(context, root.name, "LOW")
assert not low.hide_get() and high.hide_get()
assert context.view_layer.objects.active == low
assert export_objects(context, False) == {low}

# No partial scene changes when a parent collection prevents displaying a HIGH.
context.view_layer.layer_collection.children[root.name].hide_viewport = True
selection = set(context.selected_objects)
flags = (low.hide_get(), high.hide_get())
try:
    show_asset_role(context, root.name, "HIGH")
    raise AssertionError("Expected hidden parent failure")
except ValueError:
    pass
assert (low.hide_get(), high.hide_get()) == flags and set(context.selected_objects) == selection
context.view_layer.layer_collection.children[root.name].hide_viewport = False

# Shared containers are refused before conversion and their meshes survive.
shared_root, shared_objects = legacy_pair("Shared")
shared_child = shared_root.children["Shared_HIGH"]
scene.collection.children.link(shared_child)
try:
    compact_asset_roots(context)
    raise AssertionError("Expected shared collection failure")
except ValueError as error:
    assert "partagée" in str(error)
assert shared_root.name == "Shared_BAKE" and shared_objects["HIGH"].name in shared_child.objects
scene.collection.children.unlink(shared_child)
assert bpy.ops.blendup.compact_assets() == {"FINISHED"}

spaces = [area.spaces.active for area in context.screen.areas if area.type == "OUTLINER"]
assert spaces
set_asset_view(spaces, False)
filters = [(space.use_filter_object, space.use_filter_collection) for space in spaces]
visibility = [(obj, obj.hide_get()) for obj in context.view_layer.objects]
set_asset_view(spaces, True)
assert all(not space.use_filter_object and space.use_filter_collection for space in spaces)
assert all(obj.hide_get() == hidden for obj, hidden in visibility)
set_asset_view(spaces, False)
assert [(space.use_filter_object, space.use_filter_collection) for space in spaces] == filters

# Organizing a fresh or existing pair uses one collection and remains idempotent.
for obj in context.view_layer.objects:
    obj.select_set(False)
low.select_set(True)
high.hide_set(False)
high.select_set(True)
context.view_layer.objects.active = low
count = len(bpy.data.collections)
assert organize_pair(context) == "Epaulière1_Droite"
assert len(bpy.data.collections) == count and not root.children

out = Path(args[1]).resolve()
out.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(out / "Compact.blend"))
blendup.unregister()
assert not hasattr(bpy.types.WindowManager, "blendup_scene_asset_search")
blendup.register()
blendup.unregister()
print("BLENDUP_SCENE_ASSETS_SMOKE_OK compact roots, roles, geometry, layer visibility, filters, exports, registration")
