"""Install the distributed ZIP through Blender, with an isolated user profile.

Run with Python: blender_install_smoke.py --blender /path/to/blender
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile


def run_in_blender() -> None:
    import bpy
    import addon_utils

    archive = Path(sys.argv[sys.argv.index("--") + 1]).resolve()
    profile = Path(os.environ["BLENDUP_INSTALL_TEST_PROFILE"]).resolve()
    # Never let this test install into the developer's actual Blender profile.
    scripts = Path(bpy.utils.user_resource("SCRIPTS")).resolve()
    assert scripts.is_relative_to(profile), scripts
    bpy.context.preferences.filepaths.file_preview_type = "NONE"

    root = profile / "project"
    (root / ".blendup").mkdir(parents=True)
    (root / "Art").mkdir()
    (root / ".blendup/project.json").write_text(json.dumps({
        "schemaVersion": 2, "kind": "project", "projectId": "install_smoke",
        "name": "Installation smoke", "engine": "none", "paths": {"artRoot": "Art"},
    }), encoding="utf-8")
    source = root / "Art/Cube.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(source))
    bpy.ops.wm.read_factory_settings(use_empty=True)

    # This is the same legacy ZIP installer and restricted activation used by
    # Preferences > Install from Disk; calling blendup.register() misses it.
    assert bpy.ops.preferences.addon_install(
        filepath=str(archive), overwrite=True, enable_on_install=True,
    ) == {"FINISHED"}
    import blendup
    from blendup.ui import library

    assert Path(blendup.__file__).resolve().is_relative_to(scripts)
    assert addon_utils.check("blendup") == (True, True)

    def check_enabled():
        assert bpy.context.window_manager.blendup_library_link
        assert bpy.app.handlers.load_post.count(library.library_after_load) == 1
        assert bpy.app.timers.is_registered(library.library_after_load)

    def run_initial_refresh():
        # Background Blender has no UI event loop. Consume the one-shot timer
        # after activation, when Blender has restored normal data access.
        assert bpy.app.timers.is_registered(library.library_after_load)
        bpy.app.timers.unregister(library.library_after_load)
        assert library.library_after_load() is None

    def disable():
        assert bpy.ops.preferences.addon_disable(module="blendup") == {"FINISHED"}
        assert library.library_after_load not in bpy.app.handlers.load_post
        assert not bpy.app.timers.is_registered(library.library_after_load)
        assert not hasattr(bpy.types.WindowManager, "blendup_library_items")

    check_enabled()
    run_initial_refresh()
    assert not bpy.context.window_manager.blendup_library_items

    # Opening a project after installation must still populate its library.
    bpy.ops.wm.open_mainfile(filepath=str(source))
    assert [item.name for item in bpy.context.window_manager.blendup_library_items] == ["Cube"]
    # Blender retains custom ID property values when their RNA definitions are
    # removed. Clear the previous list to observe a fresh deferred refresh.
    bpy.context.window_manager.blendup_library_items.clear()
    disable()

    # Activation with a project already open must wait for registration to end.
    assert bpy.ops.preferences.addon_enable(module="blendup") == {"FINISHED"}
    check_enabled()
    assert not bpy.context.window_manager.blendup_library_items
    run_initial_refresh()
    assert [item.name for item in bpy.context.window_manager.blendup_library_items] == ["Cube"]
    disable()

    # Disabling before the pending callback runs must cancel that callback.
    assert bpy.ops.preferences.addon_enable(module="blendup") == {"FINISHED"}
    check_enabled()
    disable()
    assert bpy.ops.preferences.addon_enable(module="blendup") == {"FINISHED"}
    check_enabled()
    run_initial_refresh()
    disable()
    print("BLENDUP_INSTALL_SMOKE_OK")


def run_isolated() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--blender", default=os.environ.get("BLENDUP_TEST_BLENDER"), required=not os.environ.get("BLENDUP_TEST_BLENDER"))
    parser.add_argument("--zip", type=Path, default=Path(__file__).resolve().parents[1] / "blendup.zip")
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix="blendup-install-") as directory:
        profile = Path(directory)
        env = dict(os.environ, BLENDUP_INSTALL_TEST_PROFILE=str(profile))
        env.pop("BLENDUP_BACKGROUND_TASK", None)
        for resource in ("CONFIG", "SCRIPTS", "DATAFILES", "EXTENSIONS"):
            target = profile / resource.lower()
            target.mkdir()
            env["BLENDER_USER_" + resource] = str(target)
        env["BLENDER_USER_RESOURCES"] = str(profile)
        subprocess.run([
            args.blender, "--background", "--factory-startup", "--python-exit-code", "1",
            "--python", str(Path(__file__).resolve()), "--", str(args.zip.resolve()),
        ], env=env, check=True, timeout=120)


if __name__ == "__main__":
    if "--" in sys.argv:
        run_in_blender()
    else:
        run_isolated()
