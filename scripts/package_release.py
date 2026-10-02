"""Prepare release files from the working tree, without committing or publishing."""

import argparse
import ast
import hashlib
import json
from pathlib import Path
import platform
import re
import shutil
import subprocess
import tarfile
import zipfile


ROOT = Path(__file__).resolve().parents[1]


def read_json(path):
    return json.loads((ROOT / path).read_text(encoding="utf-8"))


def check_versions(tag=None):
    version = read_json("package.json")["version"]
    versions = {
        "package.json": version,
        "apps/desktop/package.json": read_json("apps/desktop/package.json")["version"],
        "apps/desktop/src-tauri/tauri.conf.json": read_json("apps/desktop/src-tauri/tauri.conf.json")["version"],
        "package-lock.json": read_json("package-lock.json")["version"],
        "package-lock.json (root)": read_json("package-lock.json")["packages"][""]["version"],
        "package-lock.json (desktop)": read_json("package-lock.json")["packages"]["apps/desktop"]["version"],
    }
    cargo = (ROOT / "apps/desktop/src-tauri/Cargo.toml").read_text(encoding="utf-8")
    versions["Cargo.toml"] = re.search(r'^version\s*=\s*"([^"]+)"', cargo, re.M)[1]
    lock = (ROOT / "apps/desktop/src-tauri/Cargo.lock").read_text(encoding="utf-8")
    versions["Cargo.lock"] = re.search(r'\[\[package\]\]\s*name = "blendup"\s*version = "([^"]+)"', lock)[1]
    for filename, actual in versions.items():
        if actual != version:
            raise ValueError(f"Version mismatch: {filename} = {actual}, expected {version}")
    if tag and tag != f"v{version}":
        raise ValueError(f"Tag {tag} does not match the application version v{version}")
    addon = (ROOT / "apps/blender-addon/blendup/__init__.py").read_text(encoding="utf-8")
    info = ast.literal_eval(ast.parse(addon).body[0].value)
    addon_version = ".".join(map(str, info["version"]))
    manifest = (ROOT / "apps/blender-addon/blendup/blender_manifest.toml").read_text(encoding="utf-8")
    if re.search(r'^version\s*=\s*"([^"]+)"', manifest, re.M)[1] != addon_version:
        raise ValueError("Blender bl_info and manifest versions differ")
    print(f"Versions OK: BlendUp {version}, Blender add-on {addon_version}")
    return version, addon_version


def build_addons(output):
    blender_zip = ROOT / "apps/blender-addon/blendup.zip"
    addon_root = ROOT / "apps/blender-addon"
    # Legacy installation expects the blendup/ Python package at the archive root.
    with zipfile.ZipFile(blender_zip, "w", zipfile.ZIP_DEFLATED) as archive:
        for path in sorted((addon_root / "blendup").rglob("*.py")):
            if "__pycache__" not in path.parts:
                archive.write(path, path.relative_to(addon_root).as_posix())
    shutil.copy2(blender_zip, output / "blendup.zip")
    godot_root = ROOT / "apps/godot-addon"
    with zipfile.ZipFile(output / "blendup-godot.zip", "w", zipfile.ZIP_DEFLATED) as archive:
        for path in sorted((godot_root / "addons/blendup").rglob("*")):
            if path.is_file() and path.suffix in {".gd", ".cfg"}:
                archive.write(path, path.relative_to(godot_root).as_posix())


def source_files():
    listing = subprocess.check_output(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"], cwd=ROOT
    ).decode("utf-8")
    excluded = {".git", ".dev-tools", "release", "node_modules", "target", "dist", "__pycache__"}
    files = []
    for name in sorted(set(listing.split("\0")) - {""}):
        relative = Path(name)
        if excluded.intersection(relative.parts):
            continue
        path = ROOT / relative
        if path.is_file():
            files.append((path, relative.as_posix()))
    if not files:
        raise ValueError("No source files found")
    return files


def build_sources(output, version):
    prefix = f"BlendUp-{version}"
    files = source_files()
    with zipfile.ZipFile(output / f"BlendUp-{version}-source.zip", "w", zipfile.ZIP_DEFLATED) as archive:
        for path, name in files:
            archive.write(path, f"{prefix}/{name}")
    with tarfile.open(output / f"BlendUp-{version}-source.tar.gz", "w:gz") as archive:
        for path, name in files:
            archive.add(path, arcname=f"{prefix}/{name}", recursive=False)
    print(f"Source archives: {len(files)} files from the current working tree")


def expected_installers(version):
    return {
        "Windows": [f"BlendUp_{version}_x64-setup.exe"],
        "Linux": [f"BlendUp_{version}_amd64.deb", f"BlendUp_{version}_amd64.AppImage"],
    }


def find_installers(bundle, names):
    found = []
    for name in names:
        matches = list(bundle.rglob(name))
        if len(matches) != 1:
            raise ValueError(f"Expected one built installer {name} in {bundle}, found {len(matches)}. Build this platform first.")
        found.append(matches[0])
    return found


def digest(path):
    sha = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            sha.update(chunk)
    return sha.hexdigest()


def package(output, version, addon_version, bundle, system):
    names = expected_installers(version)
    if system not in names:
        raise ValueError(f"Unsupported installer platform: {system}")
    installers = find_installers(bundle, names[system])
    build_addons(output)
    for path in installers:
        shutil.copy2(path, output / path.name)
    build_sources(output, version)
    notes = ROOT / f"docs/releases/v{version}.md"
    shutil.copy2(notes, output / "RELEASE_NOTES.md")
    other_system = "Linux" if system == "Windows" else "Windows"
    pending = names[other_system]
    instructions = f"""BlendUp v{version} — fichiers de publication

Installateurs produits sur ce poste : {', '.join(names[system])}
Installateurs à produire sur {other_system} : {', '.join(pending)}
Ils ne sont pas inclus dans cette archive. Le workflow .github/workflows/release.yml
les construit sur GitHub Actions à partir du tag v{version}.

1. Enregistrer et envoyer sur GitHub les changements de cette version, y compris
   les nouveaux fichiers, puis créer le tag v{version} sur ce commit.
   Voir docs/RELEASE.md dans les archives sources pour les commandes.
2. Le workflow crée un brouillon de release avec les installateurs Windows/Linux,
   les extensions Blender/Godot et leurs empreintes SHA-256.
3. Vérifier les deux builds dans Actions, tester les installateurs, compléter
   le texte avec RELEASE_NOTES.md et publier le brouillon.

Pour une publication manuelle, joindre les installateurs et les deux extensions.
GitHub ajoute automatiquement « Source code (zip) » et « Source code (tar.gz) »
à partir du tag ; les archives *-source fournies ici sont une copie locale des
sources actuelles, modifications non commitées comprises.

Blender : installer blendup.zip depuis les préférences, puis activer BlendUp.
L'extension Blender a sa propre version ({addon_version}).
Godot : BlendUp peut installer/mettre à jour le panneau depuis les paramètres ;
sinon extraire blendup-godot.zip à la racine du projet et activer le plugin.

SHA256SUMS.txt contient les empreintes des fichiers de ce dossier (hors lui-même).
La somme de l'archive globale est fournie à côté de celle-ci.
"""
    (output / "LIRE-MOI.txt").write_text(instructions, encoding="utf-8")
    # Extensions are published by the Windows job only. Linux must not publish
    # hashes for its own ZIPs, whose source timestamps may differ between jobs.
    published_names = [*names[system]]
    if system == "Windows":
        published_names.extend(["blendup.zip", "blendup-godot.zip"])
    published = [output / name for name in sorted(published_names)]
    (output / f"SHA256SUMS-{system.lower()}.txt").write_text(
        "".join(f"{digest(path)}  {path.name}\n" for path in published), encoding="utf-8"
    )
    artifacts = [path for path in sorted(output.iterdir()) if path.is_file() and path.name != "SHA256SUMS.txt"]
    (output / "SHA256SUMS.txt").write_text(
        "".join(f"{digest(path)}  {path.name}\n" for path in artifacts), encoding="utf-8"
    )
    complete = output.parent / f"BlendUp-v{version}-release-{system.lower()}.zip"
    with zipfile.ZipFile(complete, "w", zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(output.iterdir()):
            if path.is_file():
                archive.write(path, f"BlendUp-v{version}/{path.name}")
    complete.with_suffix(".zip.sha256").write_text(f"{digest(complete)}  {complete.name}\n", encoding="utf-8")
    print(f"Release files: {output}")
    print(f"Complete archive: {complete}")
    print(f"Pending on {other_system}: {', '.join(pending)}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Only check version consistency")
    parser.add_argument("--tag", help="Check that the release tag matches the application version")
    parser.add_argument("--addons-only", action="store_true", help="Rebuild both extension archives")
    parser.add_argument("--bundle-dir", type=Path, default=ROOT / "apps/desktop/src-tauri/target/release/bundle")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    version, addon_version = check_versions(args.tag)
    if args.check:
        return
    output = (args.output or ROOT / "release" / f"v{version}").resolve()
    if ROOT.resolve() not in output.parents or output == ROOT.resolve():
        raise ValueError("Release output must be a subdirectory of the project")
    # Prevent an output path that would overwrite source files.
    if output.relative_to(ROOT.resolve()).parts[0] != "release":
        raise ValueError("Release output must be inside release/")
    output.mkdir(parents=True, exist_ok=True)
    if args.addons_only:
        build_addons(output)
        print(f"Extension archives: {output}")
    else:
        package(output, version, addon_version, args.bundle_dir, platform.system())


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        raise SystemExit(str(error)) from error
