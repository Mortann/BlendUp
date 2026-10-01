"""Exercise save handlers, context restoration and the UV gate in real Blender."""
from pathlib import Path
import json
import sys
import tempfile
from types import SimpleNamespace
from unittest.mock import patch

import bpy

addon_root = Path(sys.argv[sys.argv.index("--") + 1]).resolve()
sys.path.insert(0, str(addon_root))
import blendup
import blendup.handlers as handlers
import blendup.blender_uv as uv_adapter
from blendup.blender_uv import analyze_scene, project_policy, report_path
from blendup.ops.export_ops import export_current


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    blendup.register()
    original_preferences = handlers.preferences
    handlers.preferences = lambda: SimpleNamespace(auto_export=True)
    try:
        with tempfile.TemporaryDirectory(prefix="uv-smoke-", dir=addon_root / "tests") as directory:
            root = Path(directory)
            (root / ".blendup").mkdir()
            (root / "Art/Plane").mkdir(parents=True)
            source = root / "Art/Plane/Plane.blend"
            config = {"schemaVersion": 2, "kind": "project", "projectId": "uv_smoke", "name": "UV smoke", "engine": "none", "paths": {"artRoot": "Art"},
                      "blender": {"applyTransformsOnSave": True, "unwrapOnSave": True, "validateUvs": True, "minimumUvScore": 90}}
            def save_config(): (root / ".blendup/project.json").write_text(json.dumps(config), encoding="utf-8")
            save_config()
            bpy.ops.mesh.primitive_plane_add()
            obj = bpy.context.object
            obj.location = (2, 3, 4)
            obj.rotation_euler.z = 0.3
            obj.scale = (2, 3, 4)
            bpy.context.view_layer.update()
            original_points = [obj.matrix_world @ v.co for v in obj.data.vertices]
            bpy.ops.wm.save_as_mainfile(filepath=str(source))
            assert all(abs(v) < 1e-6 for v in obj.location), tuple(obj.location)
            assert all(abs(v - 1) < 1e-6 for v in obj.scale), tuple(obj.scale)
            bpy.context.view_layer.update()
            assert all((obj.matrix_world @ v.co - before).length < 1e-5 for v, before in zip(obj.data.vertices, original_points))
            report = json.loads(report_path(root, source).read_text(encoding="utf-8"))
            assert report["score"] >= 99, report
            assert not report["unsavedChanges"], report
            assert report["sourceModifiedNs"] == str(source.stat().st_mtime_ns)
            assert not (root / ".blendup/export-state.json").exists()

            # Evaluation may dirty transient Blender data. Fresh saved sources
            # must keep their valid report; actual unsaved edits stay marked.
            fake_bpy = SimpleNamespace(data=SimpleNamespace(is_dirty=False))
            def dirty_analysis(*args):
                fake_bpy.data.is_dirty = True
                return report.copy()
            with patch.object(uv_adapter, "bpy", fake_bpy), patch.object(uv_adapter, "analyze_scene", dirty_analysis):
                assert not uv_adapter.check_and_record(root, source)["unsavedChanges"]
                assert uv_adapter.check_and_record(root, source)["unsavedChanges"]
                assert not uv_adapter.check_and_record(root, source, source_is_saved=True)["unsavedChanges"]

            # Saving from edit mode preserves the active object, mode and face selection.
            bpy.ops.object.mode_set(mode="EDIT")
            bpy.ops.mesh.select_all(action="DESELECT")
            bpy.ops.wm.save_as_mainfile(filepath=str(source))
            assert obj.mode == "EDIT"
            obj.update_from_editmode()
            assert not any(p.select for p in obj.data.polygons)
            bpy.ops.object.mode_set(mode="OBJECT")

            # A hidden mesh must still be prepared and its visibility restored.
            hidden = obj.copy()
            hidden.data = obj.data.copy()
            bpy.context.scene.collection.objects.link(hidden)
            hidden.name = "Hidden"
            hidden.location.x = 10
            hidden.scale = (2, 2, 2)
            hidden.hide_set(True)
            hidden.hide_viewport = True
            bpy.ops.wm.save_as_mainfile(filepath=str(source))
            assert hidden.hide_get() and hidden.hide_viewport
            assert all(abs(v - 1) < 1e-6 for v in hidden.scale)
            assert bpy.context.view_layer.objects.active == obj
            report = json.loads(report_path(root, source).read_text(encoding="utf-8"))
            assert report["score"] >= 90, report
            bpy.data.objects.remove(hidden, do_unlink=True)

            # Excluded collections and Blender 5.2 UV selection attributes survive.
            collection = bpy.data.collections.new("Excluded")
            bpy.context.scene.collection.children.link(collection)
            excluded = obj.copy()
            excluded.data = obj.data.copy()
            collection.objects.link(excluded)
            excluded.scale = (3, 3, 3)
            layer_collection = bpy.context.view_layer.layer_collection.children[collection.name]
            layer_collection.exclude = True
            bpy.context.scene.tool_settings.use_uv_select_sync = False
            attribute = obj.data.attributes.get(".uv_select_vert") or obj.data.attributes.new(".uv_select_vert", "BOOLEAN", "CORNER")
            attribute.data[0].value = True
            selection = [item.value for item in attribute.data]
            bpy.ops.wm.save_as_mainfile(filepath=str(source))
            assert all(abs(v - 1) < 1e-6 for v in excluded.scale)
            assert layer_collection.exclude
            assert [item.value for item in obj.data.attributes[".uv_select_vert"].data] == selection, (selection, [item.value for item in obj.data.attributes[".uv_select_vert"].data], bpy.context.scene.tool_settings.use_uv_select_sync)
            assert not any(c.name.startswith("BlendUp temporary") for c in bpy.data.collections)
            bpy.data.objects.remove(excluded, do_unlink=True)
            bpy.data.collections.remove(collection)

            # Add-on automatic and manual exports both refuse bad UVs.
            config["engine"] = "godot"
            config["paths"].update(engineRoot="Godot", engineAssetsRoot="Godot/Assets")
            config["blender"].update(applyTransformsOnSave=False, unwrapOnSave=False)
            (root / "Godot/Assets").mkdir(parents=True)
            save_config()
            bpy.ops.wm.save_as_mainfile(filepath=str(source))
            output = root / "Godot/Assets/Plane/Plane.glb"
            assert output.is_file()
            previous_output = output.read_bytes()
            previous_mtime = output.stat().st_mtime_ns
            for loop in obj.data.uv_layers.active.data: loop.uv = (0, 0)
            bpy.ops.wm.save_as_mainfile(filepath=str(source))
            report = json.loads(report_path(root, source).read_text(encoding="utf-8"))
            assert report["score"] == 0, report
            assert output.read_bytes() == previous_output and output.stat().st_mtime_ns == previous_mtime
            state = json.loads((root / ".blendup/export-state.json").read_text(encoding="utf-8"))
            assert any(not record["success"] for record in state["exports"].values())
            try:
                export_current()
                raise AssertionError("A manual export must reject invalid UVs")
            except ValueError as error:
                assert "UV" in str(error)
            assert bpy.ops.blendup.check_uvs() == {"FINISHED"}
            config["blender"]["validateUvs"] = False
            save_config()
            export_current()
        print("BLENDUP_UV_SMOKE_OK")
    finally:
        handlers.preferences = original_preferences
        blendup.unregister()
        assert handlers.prepare_on_save not in bpy.app.handlers.save_pre


if __name__ == "__main__": main()
