"""Build the self-contained Windows updater after Tauri's normal setup executable."""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

from package_release import ROOT, check_versions


def build_updater(installer, application, archive, output):
    version, addon_version = check_versions()
    installer, application, archive, output = map(lambda path: Path(path).resolve(), (installer, application, archive, output))
    for path in (installer, application, archive):
        if not path.is_file(): raise ValueError(f"Missing updater payload: {path}")
    compiler = os.environ.get("NSIS_EXE") or shutil.which("makensis") or str(ROOT / "apps/desktop/src-tauri/target/.tauri/NSIS/makensis.exe")
    if not Path(compiler).is_file(): raise ValueError("NSIS compiler not found; build the Tauri NSIS installer first or set NSIS_EXE.")
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="blendup-updater-", dir=output.parent) as directory:
        payload = Path(directory)
        for source, name in ((installer, "setup.exe"), (application, "blendup.exe"), (archive, "blendup.zip")):
            shutil.copy2(source, payload / name)
        # Windows PowerShell 5.1 needs the BOM to read French text as UTF-8.
        script = (ROOT / "scripts/windows/run_update.ps1").read_text(encoding="utf-8")
        (payload / "run_update.ps1").write_text(script, encoding="utf-8-sig")
        (payload / "update.json").write_text(json.dumps({"version": version, "blenderAddonVersion": addon_version}), encoding="utf-8")
        nsis_source = payload / "update.nsi"
        nsis_source.write_text((ROOT / "scripts/windows/update.nsi").read_text(encoding="utf-8"), encoding="utf-8-sig")
        subprocess.run([compiler, "/V2", f"/DAPP_VERSION={version}", f"/DPAYLOAD_DIR={payload}", f"/DOUTPUT_FILE={output}", str(nsis_source)], check=True)
    print(f"Updater built: {output}")
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--installer", type=Path, required=True)
    parser.add_argument("--application", type=Path, default=ROOT / "apps/desktop/src-tauri/target/release/blendup.exe")
    parser.add_argument("--archive", type=Path, default=ROOT / "apps/blender-addon/blendup.zip")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    version, _ = check_versions()
    build_updater(args.installer, args.application, args.archive, args.output or ROOT / f"release/v{version}/BlendUp_{version}_x64-update.exe")


if __name__ == "__main__": main()
