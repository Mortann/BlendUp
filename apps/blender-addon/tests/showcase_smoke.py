"""Run with Blender --background --python-exit-code 1 --python ... -- addon-root fixture-root."""
import hashlib
import json
from pathlib import Path
import sys

import bpy

args = sys.argv[sys.argv.index("--") + 1:]
sys.path.insert(0, str(Path(args[0]).resolve()))
root = Path(args[1]).resolve()
root.mkdir(parents=True, exist_ok=True)
(root / ".blendup").mkdir(exist_ok=True)
(root / "Godot/Assets").mkdir(parents=True, exist_ok=True)
config = {"schemaVersion": 2, "kind": "project", "projectId": "showcase-smoke", "name": "Showcase Smoke", "engine": "godot",
          "paths": {"artRoot": "Art", "engineRoot": "Godot", "engineAssetsRoot": "Godot/Assets"}}
(root / ".blendup/project.json").write_text(json.dumps(config), encoding="utf-8")
(root / "Godot/project.godot").write_text('config_version=5\n[application]\nconfig/name="Showcase Smoke"\n[rendering]\nrenderer/rendering_method="gl_compatibility"\n', encoding="utf-8")
for relative, location, scale in [("Art/Props/Small/Small.blend", (7, -3, 5), (1, 2, 0.5)),
                                  ("Art/Props/Sub/Tall/Tall.blend", (-5, 6, -2), (2, 1, 4))]:
    source = root / relative
    source.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.mesh.primitive_cube_add(location=location)
    bpy.context.object.name = "Cube"
    bpy.context.object.scale = scale
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(source))
    output = root / "Godot/Assets" / source.relative_to(root / "Art").with_suffix(".glb")
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(output), export_format="GLB")

from blendup.core.library import source_assets
from blendup.scripts.build_library import build_catalog, build_showcase
manifest = source_assets(root)
assert len(manifest["assets"]) == 2
before = {a["id"]: hashlib.sha256((root / a["sourcePath"]).read_bytes()).hexdigest() for a in manifest["assets"]}
manifest["signature"] = "smoke"
build_catalog(manifest)
library = root / ".blendup/library/blender"
assert len(list(library.glob("*.blend"))) == 2
assert len((library / "blender_assets.cats.txt").read_text().splitlines()) == 5
manifest["mode"] = "showcase"
manifest["target"] = str(root / ".blendup/showcases/smoke/Showcase.blend")
build_showcase(manifest)
layout = json.loads(Path(manifest["target"]).with_suffix(".json").read_text())
assert len(layout["placements"]) == 2, layout
assert not layout["errors"], layout
for placement in layout["placements"]:
    assert abs(placement["bounds"][0][2] + placement["offset"][2]) < 1e-5
bpy.ops.wm.open_mainfile(filepath=manifest["target"])
instances = [obj for obj in bpy.context.scene.objects if obj.instance_type == "COLLECTION"]
assert len(instances) == 2
assert all(any(obj.library is not None for obj in instance.instance_collection.objects) for instance in instances)
assert any(obj.name == "Sol Showcase" for obj in bpy.context.scene.objects)
for asset in manifest["assets"]:
    assert hashlib.sha256((root / asset["sourcePath"]).read_bytes()).hexdigest() == before[asset["id"]]

# The panel must register and place linked assets with Undo support.
import blendup
blendup.register()
from blendup.ui.library import refresh_list
refresh_list(bpy.context, root)
assert len(bpy.context.window_manager.blendup_library_items) == 2
assert bpy.context.window_manager.blendup_library_link is True
assert bpy.ops.blendup.library_place() == {"FINISHED"}
assert len([obj for obj in bpy.context.scene.objects if obj.instance_type == "COLLECTION"]) == 3
view = next(area for area in bpy.context.screen.areas if area.type == "VIEW_3D")
with bpy.context.temp_override(area=view, region=next(region for region in view.regions if region.type == "WINDOW")):
    assert bpy.ops.blendup.library_browser() == {"FINISHED"}
assert any(area.type == "VIEW_3D" for area in bpy.context.screen.areas)
assert any(area.type == "FILE_BROWSER" and area.ui_type == "ASSETS" for area in bpy.context.screen.areas)
library_preference = next(lib for lib in bpy.context.preferences.filepaths.asset_libraries if Path(lib.path).resolve() == library.resolve())
bpy.context.workspace.asset_library_reference = library_preference.name
assert bpy.context.workspace.asset_library_reference == library_preference.name
assert library_preference.import_method == "LINK"
blendup.unregister()

# Cached assets can be linked through Blender's native asset browser.
bpy.ops.wm.read_factory_settings(use_empty=True)
cached = next(library.glob("*.blend"))
with bpy.data.libraries.load(str(cached), link=True, assets_only=True) as (available, loaded):
    assert len(available.collections) == 1
    loaded.collections = available.collections
assert loaded.collections[0].asset_data is not None
assert tuple(loaded.collections[0].preview.image_size) == (96, 96)

# An asset may itself contain a collection instance without a direct mesh.
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.mesh.primitive_cube_add(location=(2, 0, 3))
cube = bpy.context.object
nested = bpy.data.collections.new("NestedGeometry")
nested.objects.link(cube)
for collection in list(cube.users_collection):
    if collection != nested:
        collection.objects.unlink(cube)
instance = bpy.data.objects.new("NestedInstance", None)
instance.instance_type = "COLLECTION"
instance.instance_collection = nested
instance.location = (4, 1, 0)
bpy.context.scene.collection.objects.link(instance)
nested_source = root / "Nested.blend"
bpy.ops.wm.save_as_mainfile(filepath=str(nested_source))
bpy.ops.wm.read_factory_settings(use_empty=True)
from blendup.scripts.build_library import load_asset
_collection, bounds = load_asset(nested_source, link=True)
assert tuple(bounds[0]) == (5.0, 0.0, 2.0), bounds
assert tuple(bounds[1]) == (7.0, 2.0, 4.0), bounds
manifest["assets"][0]["godotReady"] = True
manifest["assets"][0]["resourcePath"] = "res://Assets/Props/Small/Small.glb"
manifest["assets"][1]["godotReady"] = True
manifest["assets"][1]["resourcePath"] = "res://Assets/Props/Sub/Tall/Tall.glb"
(root / ".blendup/library/index.json").write_text(json.dumps({"assets": manifest["assets"]}), encoding="utf-8")
print("BLENDUP_SHOWCASE_SMOKE_OK", root)
