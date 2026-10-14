"""Install the bundled BlendUp addon, preserving preferences and a rollback copy.

Executed by Blender with -- <archive.zip> <backup directory>.
"""
import ast
import json
from pathlib import Path
import shutil
import sys
import zipfile

import addon_utils
import bpy


def main():
    archive, backup = map(lambda value: Path(value).resolve(), sys.argv[sys.argv.index("--") + 1:])
    with zipfile.ZipFile(archive) as package:
        for name in package.namelist():
            parts = Path(name).parts
            if not parts or parts[0] != "blendup" or ".." in parts or Path(name).is_absolute():
                raise ValueError("Archive BlendUp invalide.")
        info = ast.literal_eval(ast.parse(package.read("blendup/__init__.py").decode("utf-8")).body[0].value)

    addons = Path(bpy.utils.user_resource("SCRIPTS", path="addons", create=True)).resolve()
    installed = addons / "blendup"
    if installed.resolve().parent != addons:
        raise ValueError("Le dossier BlendUp doit être dans les addons du profil Blender.")
    backup.mkdir(parents=True, exist_ok=True)
    previous = bpy.context.preferences.addons.get("blendup")
    enabled = previous is not None
    existed = installed.is_dir()
    keys = ("auto_export", "selected_only", "apply_modifiers", "export_animations")
    preferences = {key: getattr(previous.preferences, key) for key in keys} if previous else {}
    userpref = Path(bpy.utils.user_resource("CONFIG")) / "userpref.blend"
    if userpref.is_file(): shutil.copy2(userpref, backup / "userpref.blend")
    if existed: shutil.copytree(installed, backup / "blendup", ignore=shutil.ignore_patterns("__pycache__"))
    (backup / "preferences.json").write_text(json.dumps({"enabled": enabled, "values": preferences}), encoding="utf-8")

    def unload():
        addon_utils.disable("blendup", default_set=False)
        for name in list(sys.modules):
            if name == "blendup" or name.startswith("blendup."):
                del sys.modules[name]

    try:
        unload()
        assert bpy.ops.preferences.addon_install(filepath=str(archive), overwrite=True) == {"FINISHED"}
        addon_utils.enable("blendup", default_set=True, persistent=True)
        import blendup
        if blendup.bl_info["version"] != info["version"]:
            raise RuntimeError("La version installée ne correspond pas à l'archive.")
        current = bpy.context.preferences.addons.get("blendup")
        if current is None: raise RuntimeError("Impossible d'activer BlendUp.")
        for key, value in preferences.items(): setattr(current.preferences, key, value)
        # Keep a previously disabled addon disabled; enable a first installation.
        if existed and not enabled: addon_utils.disable("blendup", default_set=True)
        assert bpy.ops.wm.save_userpref() == {"FINISHED"}
        print("BLENDUP_UPDATE_ADDON_OK", ".".join(map(str, info["version"])))
    except Exception:
        unload()
        # The absolute target was checked against this Blender profile above.
        if installed.is_dir(): shutil.rmtree(installed)
        if existed: shutil.copytree(backup / "blendup", installed)
        if (backup / "userpref.blend").is_file(): shutil.copy2(backup / "userpref.blend", userpref)
        raise


if __name__ == "__main__": main()
