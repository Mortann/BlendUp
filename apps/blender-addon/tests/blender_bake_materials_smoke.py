"""Shared material atlas: different normals, UV preservation, save/reload, GLB."""
from pathlib import Path
import json
import struct
import sys

import bpy

args = sys.argv[sys.argv.index("--") + 1:]
sys.path.insert(0, str(Path(args[0]).resolve()))
import blendup
from blendup.blender_bake import output_material
from blendup.bake_materials import ATLAS_UV, group_baked_materials, source_images
from blendup.blender_export import export_scene

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.file_preview_type = "NONE"
blendup.register()
context = bpy.context
out = Path(args[1]).resolve()
out.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(out / "Atlas.blend"))
source = bpy.data.materials.new("Armure")
source.use_nodes = True
lows, highs, originals, maps = [], [], {}, {}
for index, color in enumerate(((0.6, 0.5, 1, 1), (0.4, 0.5, 1, 1))):
    bpy.ops.mesh.primitive_plane_add(location=(index * 3, 0, 0))
    low = context.object
    low.name = "Piece" + str(index) + "_LOW"
    low.data.materials.append(source)
    original = [tuple(v.uv) for v in low.data.uv_layers.active.data]
    originals[low.name] = original
    high = low.copy()
    high.data = low.data.copy()
    high.name = "Piece" + str(index) + "_HIGH"
    context.scene.collection.objects.link(high)
    image = bpy.data.images.new(low.name + "_Normal", width=256, height=256, alpha=False)
    image.colorspace_settings.name = "Non-Color"
    image.pixels[:] = list(color) * (256 * 256)
    image.filepath_raw = str(out / (low.name + ".png"))
    image.file_format = "PNG"
    image.save()
    material = output_material(low, low.name, {"NORMAL": image})[0]
    low.material_slots[0].link, low.material_slots[0].material = "OBJECT", material
    lows.append(low)
    highs.append(high)
    maps[low.name] = image

material, size, count = group_baked_materials(context, lows, source, out)
assert size == 512 and count == 2
assert material.name == "Armure Bake" and all(o.active_material == material for o in lows)
assert all(o.active_material == source for o in highs)
assert material.node_tree.nodes["BlendUp_UV"].uv_map == ATLAS_UV
assert not source.node_tree.nodes.get("BlendUp_NORMAL")
atlas = material.node_tree.nodes["BlendUp_NORMAL"].image
for index, low in enumerate(lows):
    assert [tuple(v.uv) for v in low.data.uv_layers["UVMap"].data] == originals[low.name]
    assert low.data.uv_layers["UVMap"].active_render
    assert source_images(low)["NORMAL"] == maps[low.name]
    offset = (128 * size + index * 256 + 128) * 4
    pixel = tuple(atlas.pixels[offset:offset + 3])
    assert abs(pixel[0] - (0.6 if index == 0 else 0.4)) < 0.01, pixel

# Regrouping one member includes previous members, without nested copies or UV drift.
material, size, count = group_baked_materials(context, [lows[0]], source, out)
assert count == 2 and material.name == "Armure Bake"
assert len([m for m in bpy.data.materials if m.get("blendup_atlas_source")]) == 1
assert list((out / "backups").rglob("*.png"))
assert all(source_images(o)["NORMAL"] == maps[o.name] for o in lows)
export_scene(out / "Atlas.glb", "glb")
data = (out / "Atlas.glb").read_bytes()
length, _ = struct.unpack_from("<II", data, 12)
gltf = json.loads(data[20:20 + length])
assert len(gltf["materials"]) == 1
normal = gltf["materials"][0]["normalTexture"]
assert normal.get("texCoord", 0) == 1, normal
assert len(gltf["meshes"]) == 2

names = [o.name for o in lows]
bpy.ops.wm.save_as_mainfile(filepath=str(out / "Atlas.blend"))
bpy.ops.wm.open_mainfile(filepath=str(out / "Atlas.blend"))
lows = [bpy.data.objects[name] for name in names]
source = bpy.data.materials["Armure"]
assert all(source_images(o)["NORMAL"] is not None for o in lows)
material, size, count = group_baked_materials(bpy.context, lows, source, out)
assert count == 2 and material.name == "Armure Bake"

# The actual Bake button can rebake this shared family and rebuild one material.
settings = bpy.context.scene.blendup_bake
settings.shared_material, settings.scope, settings.resolution = source, "ALL", "256"
settings.channels = {"NORMAL"}
assert bpy.ops.blendup.bake() == {"FINISHED"}
assert lows[0].active_material == lows[1].active_material
assert lows[0].active_material.name == "Armure Bake"
assert len([m for m in bpy.data.materials if m.get("blendup_atlas_source")]) == 1

# Updating just one pair keeps the other member in the family.
for obj in bpy.context.view_layer.objects:
    obj.select_set(False)
lows[0].select_set(True)
bpy.context.view_layer.objects.active = lows[0]
settings.scope = "SELECTED"
assert bpy.ops.blendup.bake() == {"FINISHED"}
assert lows[0].active_material == lows[1].active_material
assert lows[0].active_material.name == "Armure Bake"

# Reject incompatible surfaces before modifying images, UVs or material slots.
extra = bpy.data.materials.new("Different surface")
lows[0].data.materials.append(extra)
before = (lows[0].data, lows[0].active_material, len(bpy.data.images))
try:
    group_baked_materials(bpy.context, lows, source, out)
    raise AssertionError("Expected multiple-material rejection")
except ValueError as error:
    assert "plusieurs matériaux" in str(error)
assert before == (lows[0].data, lows[0].active_material, len(bpy.data.images))
blendup.unregister()
print("BLENDUP_BAKE_MATERIALS_SMOKE_OK distinct normals, shared material, original UVs, backups, GLB UV1, reload")
