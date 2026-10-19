"""Real Cycles bake, state restoration, shader isolation and failure safety.

blender -b --factory-startup --python-exit-code 1 --python ... -- <addon-dir> <output-dir>
"""
from pathlib import Path
import sys

import bpy

args = sys.argv[sys.argv.index("--") + 1:]
sys.path.insert(0, str(Path(args[0]).resolve()))
from blendup.blender_bake import BakeOptions, bake_pairs, discover_pairs, organize_pair
from blendup.blender_export import export_objects

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.file_preview_type = "NONE"
root = Path(args[1]).resolve()
root.mkdir(parents=True, exist_ok=True)

def plane(name, height):
    bpy.ops.mesh.primitive_plane_add(size=2, location=(0, 0, height))
    obj = bpy.context.object
    obj.name = name
    return obj

low = plane("Étagère", 0)
high = plane("Étagère_High", 0.01)
shared = bpy.data.materials.new("SharedArmor")
shared.use_nodes = True
shader = shared.node_tree.nodes.get("Principled BSDF")
shader.inputs["Base Color"].default_value = (0.8, 0.2, 0.1, 1)
shader.inputs["Roughness"].default_value = 0.35
shader.inputs["Metallic"].default_value = 0.75
low.data.materials.append(shared)
high.data.materials.append(shared)
other = plane("Helmet", 4)
other.data.materials.append(shared)
bpy.ops.object.select_all(action="DESELECT")
low.select_set(True)
high.select_set(True)
bpy.context.view_layer.objects.active = low
assert organize_pair(bpy.context) == "Étagère"
collection_count = len(bpy.data.collections)
assert organize_pair(bpy.context) == "Étagère"
assert len(bpy.data.collections) == collection_count
assert {o.name for o in export_objects(bpy.context, False)} == {"Étagère", "Helmet"}
settings = (bpy.context.scene.render.engine, bpy.context.view_layer.objects.active, set(bpy.context.selected_objects))
counts = (len(bpy.data.scenes), len(bpy.data.objects), len(bpy.data.meshes))
links = len(shared.node_tree.links)
bpy.ops.wm.save_as_mainfile(filepath=str(root / "Étagère.blend"))
options = BakeOptions(resolution=256, channels=("NORMAL", "BASE_COLOR", "ROUGHNESS", "METALLIC"), samples=1)
# Hidden HIGH and a LOW with Solidify must bake the outer normals correctly.
solidify = low.modifiers.new("Armor thickness", "SOLIDIFY")
solidify.thickness = 0.05
high.hide_set(True)
settings = (bpy.context.scene.render.engine, bpy.context.view_layer.objects.active, set(bpy.context.selected_objects))
report = bake_pairs(bpy.context, discover_pairs(bpy.context, True), root / "textures", options)
assert high.hide_get() and solidify.show_viewport
assert len(report["files"]) == 4
assert all(Path(f["path"]).is_file() and Path(f["path"]).stat().st_size > 100 for f in report["files"])
assert (bpy.context.scene.render.engine, bpy.context.view_layer.objects.active, set(bpy.context.selected_objects)) == settings
high.hide_set(False)
assert (len(bpy.data.scenes), len(bpy.data.objects), len(bpy.data.meshes)) == counts
assert len(shared.node_tree.links) == links
assert high.active_material == other.active_material == shared
assert low.active_material != shared
tree = low.active_material.node_tree
assert tree.nodes["BlendUp_NormalMap"].outputs["Normal"].links[0].to_socket.name == "Normal"
for channel in options.channels:
    node = tree.nodes[f"BlendUp_{channel}"]
    assert node.image.colorspace_settings.name == ("sRGB" if channel == "BASE_COLOR" else "Non-Color")
    image = bpy.data.images.load(bpy.path.abspath(node.image.filepath), check_existing=False)
    pixel = tuple(image.pixels[(128 * 256 + 128) * 4: (128 * 256 + 128) * 4 + 3])
    if channel == "NORMAL":
        assert abs(pixel[0] - 0.5) < 0.02 and abs(pixel[1] - 0.5) < 0.02 and pixel[2] > 0.98, pixel
    elif channel == "ROUGHNESS":
        assert abs(pixel[0] - 0.35) < 0.02, pixel
    elif channel == "METALLIC":
        assert abs(pixel[0] - 0.75) < 0.02, pixel
    elif channel == "BASE_COLOR":
        assert pixel[0] > pixel[1] > pixel[2] > 0.05, pixel
    bpy.data.images.remove(image)

# Re-bake backs up previous files rather than silently destroying them.
prior = Path(report["files"][0]["path"]).read_bytes()
# A HIGH excluded from the source View Layer must still evaluate for baking.
group_layer = bpy.context.view_layer.layer_collection.children["Étagère_BAKE"]
high_layer = group_layer.children["Étagère_HIGH"]
high_layer.exclude = True
high.hide_viewport = True
bake_pairs(bpy.context, discover_pairs(bpy.context), root / "textures", BakeOptions(resolution=256, samples=1))
assert high_layer.exclude and high.hide_viewport
high_layer.exclude = False
high.hide_viewport = False
bpy.context.view_layer.update()
assert any(p.read_bytes() == prior for p in (root / "textures/backups").rglob("*.png"))

from blendup.blender_uv import prepare_before_save
from blendup.core.uv_quality import UvPolicy
uv_before = [tuple(v.uv) for v in low.data.uv_layers.active.data]
matrix_before = low.matrix_world.copy()
warnings = prepare_before_save(UvPolicy.from_dict({"unwrapOnSave": True, "applyTransformsOnSave": True}))
assert any("bakés" in warning for warning in warnings)
assert [tuple(v.uv) for v in low.data.uv_layers.active.data] == uv_before
assert low.matrix_world == matrix_before

# Failure after NORMAL has already baked: no destination or LOW changes.
high_material = high.active_material
high.data.materials.clear()
non_principled = bpy.data.materials.new("EmissionOnly")
non_principled.use_nodes = True
nt = non_principled.node_tree
emission = nt.nodes.new("ShaderNodeEmission")
nt.links.new(emission.outputs[0], nt.nodes.get("Material Output").inputs["Surface"])
high.data.materials.append(non_principled)
before = low.active_material
image_count, material_count = len(bpy.data.images), len(bpy.data.materials)
try:
    bake_pairs(bpy.context, discover_pairs(bpy.context), root / "failed", options)
    raise AssertionError("Expected unsupported material error")
except ValueError as error:
    assert "Principled" in str(error)
assert low.active_material == before
assert not list((root / "failed").glob("*.png"))
assert (len(bpy.data.images), len(bpy.data.materials)) == (image_count, material_count)
assert (len(bpy.data.scenes), len(bpy.data.objects), len(bpy.data.meshes)) == counts

print("BLENDUP_BAKE_SMOKE_OK")
