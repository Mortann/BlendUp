"""Save from Pose Mode through UV preparation and automatic GLB/FBX export.

Run with -- <addon directory> <output directory> [character.blend].
The character is only read; all saves and exports go into the test directory.
"""
import json
import os
from pathlib import Path
import sys
from types import SimpleNamespace
from unittest.mock import patch

import bpy

args = sys.argv[sys.argv.index("--") + 1:]
sys.path.insert(0, str(Path(args[0]).resolve()))
root = Path(args[1]).resolve()
os.environ["BLENDUP_SESSION_DIRECTORY"] = str(root / "sessions")
import blendup
from blendup import handlers
from blendup.blender_export import preserved_context


def main():
    bpy.context.preferences.filepaths.file_preview_type = "NONE"
    (root / ".blendup").mkdir(parents=True, exist_ok=True)
    (root / "Art").mkdir(exist_ok=True)
    if len(args) > 2:
        bpy.ops.wm.open_mainfile(filepath=str(Path(args[2]).resolve()))
        rig = next(obj for obj in bpy.context.view_layer.objects if obj.type == "ARMATURE" and obj.data.get("rig_id"))
    else:
        bpy.ops.object.armature_add()
        rig = bpy.context.object
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="DESELECT")
    rig.hide_set(False)
    rig.hide_select = False
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="POSE")
    bone = rig.data.bones[0]
    rig.data.bones.active = bone
    selected_bone = rig.pose.bones[bone.name] if hasattr(rig.pose.bones[bone.name], "select") else bone
    selected_bone.select = True
    selection = {obj.name for obj in bpy.context.selected_objects}
    frame = bpy.context.scene.frame_current
    blendup.register()
    handlers.preferences = lambda: SimpleNamespace(auto_export=True)
    try:
        for engine, suffix in [("godot", "glb"), ("unity", "fbx")]:
            (root / ".blendup/project.json").write_text(json.dumps({
                "name": "Pose save smoke", "engine": engine, "paths": {"artRoot": "Art"},
                "blender": {"applyTransformsOnSave": True, "unwrapOnSave": len(args) <= 2, "validateUvs": len(args) <= 2, "minimumUvScore": 1},
            }), encoding="utf-8")
            bpy.ops.wm.save_as_mainfile(filepath=str(root / "Art/Character.blend"))
            assert bpy.context.mode == "POSE", bpy.context.mode
            assert bpy.context.view_layer.objects.active == rig
            assert {obj.name for obj in bpy.context.selected_objects} == selection
            assert rig.data.bones.active == bone and selected_bone.select
            assert bpy.context.scene.frame_current == frame
            output = root / ("Godot" if engine == "godot" else "Unity") / f"Assets/Character.{suffix}"
            assert output.is_file(), output
        # A failed operation that leaves Blender in Object Mode must restore Pose
        # and propagate its exception, instead of masking it during cleanup.
        try:
            with preserved_context(bpy.context):
                bpy.ops.object.mode_set(mode="OBJECT")
                bpy.ops.object.select_all(action="DESELECT")
                raise RuntimeError("expected failure")
        except RuntimeError:
            pass
        else:
            raise AssertionError("Context cleanup swallowed the exception")
        assert bpy.context.mode == "POSE" and bpy.context.object == rig
        def interrupted_export(**kwargs):
            bpy.ops.object.mode_set(mode="OBJECT")
            raise RuntimeError("interrupted export")
        with patch.object(handlers, "export_current", side_effect=interrupted_export):
            handlers.export_after_save(None)
        assert bpy.context.mode == "POSE"
        print("BLENDUP_SAVE_POSE_SMOKE_OK GLB, FBX, UV preparation, active rig, selection, bones, failures")
    finally:
        blendup.unregister()


if __name__ == "__main__":
    main()
