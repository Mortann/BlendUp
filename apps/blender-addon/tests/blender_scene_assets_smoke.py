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
from blendup.scene_assets import compact_asset_roots, show_asset_role, organize_asset, asset_container, select_asset_role, create_high, toggle_asset_visibility, align_high_parent


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
# Organizing migrates only the chosen bake tree, with no global Outliner filters.
spaces = [area.spaces.active for area in context.screen.areas if area.type == "OUTLINER"]
filters = [(s.use_filter_object, s.use_filter_collection) for s in spaces]
for obj in context.view_layer.objects:
    obj.select_set(False)
low.select_set(True)
high.hide_set(False)
high.select_set(True)
context.view_layer.objects.active = low
assert bpy.ops.blendup.organize_bake() == {"FINISHED"}
container = asset_container(scene, "Epaulière1_Droite")
assert container and container.type == "EMPTY" and set(container.children) == {low, high}
assert bpy.data.collections.get("Epaulière1_Droite") is None
assert bpy.data.collections.get("Shared_BAKE") is not None
assert [(s.use_filter_object, s.use_filter_collection) for s in spaces] == filters
count = len(bpy.data.objects)
assert organize_pair(context) == "Epaulière1_Droite"
assert len(bpy.data.objects) == count
assert (low.data, high.data, low.matrix_world, high.matrix_world) == geometry

assert container not in export_objects(context, False)
export_scene(out / "AssetContainer.glb", "glb", selected_only=True)
data = (out / "AssetContainer.glb").read_bytes()
length, _ = struct.unpack_from("<II", data, 12)
gltf = json.loads(data[20:20 + length])
assert {n["name"] for n in gltf["nodes"] if "mesh" in n} == {low.name}
assert not any(n["name"] == container.name for n in gltf["nodes"])

# Additive selection and independent eyes allow LOW + HIGH together.
bpy.ops.object.select_all(action="DESELECT")
select_asset_role(context, "Epaulière1_Droite", "LOW")
select_asset_role(context, "Epaulière1_Droite", "HIGH")
assert set(context.selected_objects) == {low, high}
select_asset_role(context, "Epaulière1_Droite", "HIGH")
assert set(context.selected_objects) == {low} and not high.hide_get()
select_asset_role(context, "Epaulière1_Droite", "ALL")
assert set(context.selected_objects) == {low, high} and context.object == low
toggle_asset_visibility(context, "Epaulière1_Droite", "HIGH")
assert not low.hide_get() and high.hide_get() and low.select_get()
toggle_asset_visibility(context, "Epaulière1_Droite", "HIGH")
assert not high.hide_get() and not high.select_get() and low.select_get()

# A new HIGH has independent geometry and preserved animation parenting.
bpy.ops.object.empty_add(location=(3, 4, 5))
parent = context.object
bpy.ops.mesh.primitive_cube_add(location=(1, 2, 3))
fresh = context.object
fresh.name = "NewArmor"
fresh.parent = parent
fresh.location = (2, 1, 0)
fresh.keyframe_insert(data_path="location", frame=1)
fresh.location.x = 4
fresh.keyframe_insert(data_path="location", frame=10)
parent.keyframe_insert(data_path="location", frame=1)
parent.location.x = 8
parent.keyframe_insert(data_path="location", frame=10)
matrices = {}
for frame in (1, 5, 10):
    scene.frame_set(frame)
    matrices[frame] = fresh.matrix_world.copy()
scene.frame_set(1)
high_new = create_high(context)
assert high_new.data != fresh.data and high_new.parent == fresh.parent
assert high_new.animation_data.action == fresh.animation_data.action
assert fresh.hide_get() and not high_new.hide_get()
assert len(discover_pairs(context)) == 3
for frame, matrix in matrices.items():
    scene.frame_set(frame)
    assert all(abs(a-b) < 1e-5 for ra, rb in zip(fresh.matrix_world, matrix) for a,b in zip(ra,rb))
    assert all(abs(a-b) < 1e-5 for ra, rb in zip(high_new.matrix_world, matrix) for a,b in zip(ra,rb))

# An incompatible parent fails without moving objects or creating containers.
bpy.ops.mesh.primitive_cube_add()
bad_low = context.object
bad_low.name = "Bad_LOW"
bpy.ops.mesh.primitive_cube_add()
bad_high = context.object
bad_high.name = "Bad_HIGH"
bad_high.parent = parent
before = len(bpy.data.objects), len(bpy.data.collections), bad_low.parent, bad_high.parent
try:
    organize_asset(context, "Bad", bad_low, [bad_high])
    raise AssertionError("Expected incompatible parent rejection")
except ValueError:
    pass
assert before == (len(bpy.data.objects), len(bpy.data.collections), bad_low.parent, bad_high.parent)
world = bad_high.matrix_world.copy()
context.view_layer.update()
world = bad_high.matrix_world.copy()
align_high_parent(context, "Bad")
assert bad_high.parent == bad_low.parent
assert all(abs(a-b) < 1e-5 for ra, rb in zip(bad_high.matrix_world, world) for a,b in zip(ra,rb))

# Bone-parented pieces keep their transforms across animated poses too.
bpy.ops.object.armature_add()
rig = context.object
rig.name = "BoneRig"
rig.pose.bones[0].rotation_mode = "XYZ"
for frame, angle in ((1, 0), (10, 0.7)):
    rig.pose.bones[0].rotation_euler.z = angle
    rig.pose.bones[0].keyframe_insert(data_path="rotation_euler", frame=frame)
bpy.ops.mesh.primitive_cube_add()
bone_low = context.object
bone_low.name = "BoneArmor_LOW"
bone_low.parent, bone_low.parent_type, bone_low.parent_bone = rig, "BONE", rig.data.bones[0].name
bone_high = bone_low.copy()
bone_high.data = bone_low.data.copy()
bone_high.name = "BoneArmor_HIGH"
scene.collection.objects.link(bone_high)
before_matrices = {}
for frame in (1, 5, 10):
    scene.frame_set(frame)
    before_matrices[frame] = bone_low.matrix_world.copy()
organize_asset(context, "BoneArmor", bone_low, [bone_high])
for frame, matrix in before_matrices.items():
    scene.frame_set(frame)
    assert all(abs(a-b) < 1e-5 for ra, rb in zip(bone_low.matrix_world, matrix) for a,b in zip(ra,rb))
assert rig in export_objects(context, False)

out = Path(args[1]).resolve()
out.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(out / "Compact.blend"))
blendup.unregister()
assert not hasattr(bpy.types.WindowManager, "blendup_scene_asset_search")
blendup.register()
blendup.unregister()
print("BLENDUP_SCENE_ASSETS_SMOKE_OK foldable objects, independent selection, cloning, animation, filters, exports, registration")
