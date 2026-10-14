"""Validate addon updates in an isolated Blender profile, including rollback.

Run with Blender --background --factory-startup --python-exit-code 1 --python
this-file -- <archive.zip> <updater.py> <test directory>.
The caller must set BLENDER_USER_CONFIG and BLENDER_USER_SCRIPTS to this directory.
"""
from pathlib import Path
import runpy
import sys
import zipfile

import bpy
import addon_utils


def main():
    archive, script, root = map(lambda value: Path(value).resolve(), sys.argv[sys.argv.index("--") + 1:])
    assert Path(bpy.utils.user_resource("SCRIPTS")).resolve().is_relative_to(root)
    assert Path(bpy.utils.user_resource("CONFIG")).resolve().is_relative_to(root)
    bpy.context.preferences.edit.undo_steps = 37
    assert bpy.ops.preferences.addon_install(filepath=str(archive), overwrite=True) == {"FINISHED"}
    addon_utils.enable("blendup", default_set=True, persistent=True)
    values = {"auto_export": True, "selected_only": True, "apply_modifiers": False, "export_animations": False}
    for key, value in values.items(): setattr(bpy.context.preferences.addons["blendup"].preferences, key, value)
    addons = Path(bpy.utils.user_resource("SCRIPTS")) / "addons"
    sentinel = addons / "update_sentinel"
    sentinel.mkdir()
    (sentinel / "__init__.py").write_text('bl_info={"name":"Sentinel","version":(1,0,0),"blender":(4,2,0),"category":"System"}\ndef register(): pass\ndef unregister(): pass\n')
    addon_utils.enable("update_sentinel", default_set=True, persistent=True)
    bpy.ops.wm.save_userpref()

    def update(target_archive, name):
        sys.argv = [str(script), "--", str(target_archive), str(root / name)]
        runpy.run_path(str(script), run_name="__main__")

    original = (addons / "blendup/__init__.py").read_bytes()
    update(archive, "enabled-backup")
    assert addon_utils.check("blendup") == (True, True)
    assert {key: getattr(bpy.context.preferences.addons["blendup"].preferences, key) for key in values} == values
    assert "update_sentinel" in bpy.context.preferences.addons
    assert bpy.context.preferences.edit.undo_steps == 37
    assert (root / "enabled-backup/blendup/__init__.py").read_bytes() == original

    addon_utils.disable("blendup", default_set=True)
    bpy.ops.wm.save_userpref()
    update(archive, "disabled-backup")
    assert addon_utils.check("blendup") == (False, False)

    # Activation fails after installation has replaced the files. Restore both
    # the previous addon and the persisted preferences before propagating it.
    addon_utils.enable("blendup", default_set=True, persistent=True)
    bpy.ops.wm.save_userpref()
    userpref = Path(bpy.utils.user_resource("CONFIG")) / "userpref.blend"
    saved_preferences = userpref.read_bytes()
    broken = root / "broken.zip"
    with zipfile.ZipFile(archive) as source, zipfile.ZipFile(broken, "w") as target:
        for name in source.namelist():
            contents = source.read(name)
            if name == "blendup/__init__.py": contents += b'\nraise RuntimeError("Expected update activation failure")\n'
            target.writestr(name, contents)
    try:
        update(broken, "rollback-backup")
        raise AssertionError("A broken addon must fail")
    except RuntimeError:
        pass
    assert (addons / "blendup/__init__.py").read_bytes() == original
    assert userpref.read_bytes() == saved_preferences
    print("BLENDUP_UPDATE_SMOKE_OK preferences, other addons, enablement, backups, activation failure rollback")


if __name__ == "__main__": main()
