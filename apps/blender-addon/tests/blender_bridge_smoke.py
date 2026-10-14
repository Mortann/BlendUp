"""Exercise the live bridge and Blender's native unsaved-changes dialog.

Run interactive Blender with -- <addon directory> <output directory> <case>.
Cases: dirty, unnamed, clean, same. The test closes only its own Blender process.
"""
import json
import os
from pathlib import Path
import sys
import time
import traceback

import bpy

args = sys.argv[sys.argv.index("--") + 1:]
sys.path.insert(0, str(Path(args[0]).resolve()))
root = Path(args[1]).resolve()
case = args[2]
os.environ["BLENDUP_SESSION_DIRECTORY"] = str(root / "sessions")
import blendup
from blendup import handlers
from blendup.core.bridge import session_directory

directory = session_directory() / str(os.getpid())
target = root / "Art/Target.blend"
current = root.parent / (root.name + "-outside.blend")
source_before = None


def fail():
    (root / f"{case}.failed").write_text(traceback.format_exc(), encoding="utf-8")
    print(traceback.format_exc(), flush=True)
    bpy.ops.wm.quit_blender()


def verify():
    try:
        ack = json.loads((directory / "open-ack.json").read_text(encoding="utf-8"))
        assert ack["opened"] and ack["processId"] == os.getpid(), ack
        assert not (directory / "open-request.json").exists()
        if case in {"dirty", "unnamed"}:
            # INVOKE must leave the scene loaded until the user chooses Save,
            # Don't Save or Cancel in Blender's modal confirmation.
            assert bpy.data.filepath == (str(current) if case == "dirty" else ""), bpy.data.filepath
            assert "UnsavedMarker" in bpy.data.objects
            assert current.read_bytes() == source_before if case == "dirty" else True
        else:
            assert Path(bpy.data.filepath).resolve() == target
        (root / f"{case}.ok").write_text("BLENDUP_BRIDGE_SMOKE_OK " + case, encoding="utf-8")
        print("BLENDUP_BRIDGE_SMOKE_OK", case, flush=True)
        blendup.unregister()
        bpy.ops.wm.quit_blender()
    except Exception:
        fail()


def request():
    try:
        if case in {"dirty", "unnamed"} and not bpy.data.is_dirty:
            # Python operators from a timer do not push undo automatically.
            bpy.ops.mesh.primitive_cube_add()
            bpy.context.object.name = "UnsavedMarker"
            bpy.ops.ed.undo_push(message="Bridge test unsaved edit")
            bpy.app.timers.register(request, first_interval=0.3)
            return
        assert handlers.open_requested_blend_file() == handlers._BRIDGE_INTERVAL
        metadata = json.loads((directory / "session.json").read_text(encoding="utf-8"))
        assert metadata["processId"] == os.getpid()
        # An unnamed or unrelated file still advertises an available session.
        assert metadata["projectRoot"] == (str(root) if case == "same" else "")
        (directory / "open-request.json").write_text(json.dumps({
            "id": "bridge-" + case, "projectRoot": str(root), "blendPath": "Art/Target.blend",
            "expiresAtMs": int(time.time() * 1000) + 10000,
        }), encoding="utf-8")
        handlers.open_requested_blend_file()
        bpy.app.timers.register(verify, first_interval=0.5)
    except Exception:
        fail()


def setup():
    global source_before
    try:
        assert not bpy.app.background, "Run this test without --background"
        bpy.context.preferences.filepaths.file_preview_type = "NONE"
        (root / ".blendup").mkdir(parents=True, exist_ok=True)
        (root / "Art").mkdir(exist_ok=True)
        (root / ".blendup/project.json").write_text(json.dumps({"name": "Bridge smoke", "engine": "none", "paths": {"artRoot": "Art"}}), encoding="utf-8")
        bpy.ops.wm.save_as_mainfile(filepath=str(target))
        if case == "unnamed":
            bpy.ops.wm.read_factory_settings(use_empty=True)
        elif case != "same":
            bpy.ops.wm.save_as_mainfile(filepath=str(current))
            source_before = current.read_bytes()
        blendup.register()
        bpy.app.timers.register(request, first_interval=0.5)
    except Exception:
        fail()


bpy.app.timers.register(setup, first_interval=0.5)
