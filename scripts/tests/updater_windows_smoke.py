"""Run the packaged updater against isolated profiles and projects.

The application setup is an NSIS fixture that copies the real app binary without
touching the real installation or Windows uninstall registry. Addon updates use
the actual Blender executable and actual packaged updater/maintenance engine.
"""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from build_updater import build_updater
from package_release import ROOT


def main():
    blender = os.environ["BLENDUP_TEST_BLENDER"]
    application = ROOT / "apps/desktop/src-tauri/target/release/blendup.exe"
    root = ROOT / ".dev-tools" / ("updater intégration " + str(time.time_ns()))
    root.mkdir(parents=True)
    installed = root / "Application avec espaces"
    installed.mkdir()
    old_application = b"Previous application fixture"
    (installed / "blendup.exe").write_bytes(old_application)
    project = root / "Projet Étagère"
    engine = project / "Moteur/Godot"
    addon = engine / "addons/blendup"
    addon.mkdir(parents=True)
    (project / ".blendup").mkdir()
    (project / ".blendup/project.json").write_text(json.dumps({"name": "Updater fixture", "engine": "godot", "paths": {"artRoot": "Art", "engineRoot": "Moteur/Godot", "engineAssetsRoot": "Moteur/Godot/Assets"}}), encoding="utf-8")
    godot_config = 'config_version=5\n[editor_plugins]\nenabled=PackedStringArray("res://addons/other/plugin.cfg")\n'
    (engine / "project.godot").write_text(godot_config, encoding="utf-8")
    (addon / "plugin.cfg").write_text('[plugin]\nname="Old BlendUp"\n', encoding="utf-8")
    (addon / "plugin.gd").write_text("old plugin", encoding="utf-8")
    (addon / "custom.txt").write_text("keep this file", encoding="utf-8")
    other = engine / "addons/other"
    other.mkdir()
    (other / "plugin.cfg").write_text("other addon", encoding="utf-8")
    # Seed a fresh profile; never read or modify the user's Blender preferences.
    profile = root / "blender-profile"
    env = dict(os.environ)
    for resource in ("CONFIG", "SCRIPTS", "DATAFILES", "EXTENSIONS"):
        target = profile / resource.lower()
        target.mkdir(parents=True)
        env["BLENDER_USER_" + resource] = str(target)
    env["BLENDER_USER_RESOURCES"] = str(profile)
    env["BLENDUP_SESSION_DIRECTORY"] = str(root / "sessions")
    env["APPDATA"] = str(root / "appdata")
    env["LOCALAPPDATA"] = str(root / "localappdata")
    env["BLENDUP_BACKGROUND_TASK"] = "1"
    seed = subprocess.run([blender, "--background", "--factory-startup", "--python-exit-code", "1", "--python", str(ROOT / "apps/blender-addon/tests/blender_update_smoke.py"), "--", str(ROOT / "apps/blender-addon/blendup.zip"), str(ROOT / "scripts/update_blender_addon.py"), str(profile)], env=env, capture_output=True, timeout=90)
    assert seed.returncode == 0 and b"BLENDUP_UPDATE_SMOKE_OK" in seed.stdout, seed.stdout + seed.stderr
    settings = root / "appdata/BlendUp/user-settings.json"
    settings.parent.mkdir(parents=True)
    settings.write_text(json.dumps({"lastProjectRoot": str(project), "recentProjects": [str(project)], "blenderPath": blender}), encoding="utf-8")
    settings_before = settings.read_bytes()
    # This setup deliberately omits registry writes and always requires /D.
    setup = root / "fixture-setup.exe"
    template = root / "fixture-setup.nsi"
    template.write_text(f'Unicode true\nRequestExecutionLevel user\nOutFile "{setup}"\nSilentInstall silent\nSection\nSetOutPath "$INSTDIR"\nFile /oname=blendup.exe "{application}"\nSectionEnd\n', encoding="utf-8-sig")
    compiler = ROOT / "apps/desktop/src-tauri/target/.tauri/NSIS/makensis.exe"
    subprocess.run([str(compiler), "/V2", str(template)], check=True)
    updater = build_updater(setup, application, ROOT / "apps/blender-addon/blendup.zip", root / "fixture-update.exe")
    request = root / "request avec espaces.json"
    backup = root / "backup"
    request.write_text(json.dumps({"installDirectory": str(installed), "blenderPath": blender, "projectRoots": [str(project), str(project)], "backupDirectory": str(backup)}), encoding="utf-8")
    # NSIS options require quotes around the value, rather than the full option.
    result = subprocess.run(f'"{updater}" /S /REQUEST="{request}"', env=env, timeout=240)
    if not (backup / "report.json").exists():
        logs = list((root / "localappdata/BlendUp/update-logs").glob("*.log"))
        for log in logs: print(log.read_text(encoding="utf-8-sig"))
        raise AssertionError(f"Updater exit {result.returncode}; report missing in {root}")
    report = json.loads((backup / "report.json").read_text(encoding="utf-8"))
    assert result.returncode == 0 and report["success"], report
    assert len(report["components"]) == 2, report
    assert (installed / "blendup.exe").read_bytes() == application.read_bytes()
    assert (backup / "application/blendup.exe").read_bytes() == old_application
    assert settings.read_bytes() == settings_before
    assert (engine / "project.godot").read_text(encoding="utf-8") == godot_config
    assert (addon / "custom.txt").read_text(encoding="utf-8") == "keep this file"
    assert (other / "plugin.cfg").read_text(encoding="utf-8") == "other addon"
    assert (backup / "addons/godot-0/plugin.gd").read_text(encoding="utf-8") == "old plugin"
    for source in (ROOT / "apps/godot-addon/addons/blendup").iterdir():
        if source.suffix in {".gd", ".cfg"}: assert (addon / source.name).read_bytes() == source.read_bytes(), source
    verify = root / "verify_blender.py"
    verify.write_text('import bpy, addon_utils\nassert addon_utils.check("blendup") == (True,True)\nassert "update_sentinel" in bpy.context.preferences.addons\nassert bpy.context.preferences.edit.undo_steps == 37\nprint("UPDATER_PROFILE_VERIFY_OK")\n', encoding="utf-8")
    env["BLENDUP_BACKGROUND_TASK"] = "1"
    checked = subprocess.run([blender, "--background", "--python-exit-code", "1", "--python", str(verify)], env=env, capture_output=True, timeout=60)
    assert checked.returncode == 0 and b"UPDATER_PROFILE_VERIFY_OK" in checked.stdout, checked.stdout + checked.stderr
    print("BLENDUP_WINDOWS_UPDATER_SMOKE_OK packaged EXE, app fixture, real Blender addon, Godot projects, duplicate roots, backups, preferences, Unicode paths")
    print("Test artifacts:", root)


if __name__ == "__main__": main()
