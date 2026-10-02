from __future__ import annotations

import json
from pathlib import Path

from .project import load_project, locate_asset, stored_asset_id, asset_id_for_path
from .export_state import export_status, read_state
from .uv_quality import ALGORITHM_VERSION


def source_assets(root):
    """Refresh from disk even when the desktop application is closed."""
    root = Path(root).resolve()
    config = json.loads((root / ".blendup/project.json").read_text(encoding="utf-8"))
    project = load_project(root)
    assets = []
    art_root = root / project.art_root
    for source in sorted(art_root.rglob("*.blend")):
        if ".variant." in source.stem or ".lod." in source.stem:
            continue
        if any(part in {"textures", "references", "renders"} for part in source.relative_to(art_root).parts[:-1]):
            continue
        relative = source.relative_to(root).as_posix()
        identity = stored_asset_id(root, relative)
        metadata_file = root / ".blendup/assets" / (identity + ".json")
        try:
            metadata = json.loads(metadata_file.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            metadata = {}
        parent = source.parent.parent if source.parent.name == source.stem else source.parent
        stat = source.stat()
        assets.append({"id": identity, "name": source.stem, "folder": parent.relative_to(root).as_posix(),
                       "sourcePath": relative, "tags": metadata.get("tags", []),
                       "sourceSignature": f"{stat.st_size}:{stat.st_mtime_ns}",
                       "variants": metadata.get("variants", []) if isinstance(metadata.get("variants", []), list) else [],
                       "ignoreUvValidation": metadata.get("ignoreUvValidation") is True})
    return {"root": str(root), "projectId": project.project_id, "assets": assets, "mode": "library", "signature": "addon-refresh"}


def publish_index(root):
    """Keep the editor dock current after a Blender save, including when BlendUp is closed."""
    root = Path(root).resolve()
    project = load_project(root)
    manifest = source_assets(root)
    config = json.loads((root / ".blendup/project.json").read_text(encoding="utf-8"))
    policy = config.get("blender", {})
    state = read_state(root).get("exports", {})
    def version_entry(identity, name, relative, ignored):
        entry = {"id": identity, "name": name, "sourcePath": relative, "status": "missing", "godotReady": False,
                 "resourcePath": None, "outputPath": "", "sourceSignature": "", "outputSignature": ""}
        source = (root / relative).resolve()
        if not source.is_relative_to((root / project.art_root).resolve()) or not source.is_file():
            return entry
        asset = locate_asset(source, project)
        status = export_status(asset)
        failure = state.get(asset.asset_id, {})
        if failure.get("success") is False:
            if "UV" not in failure.get("message", "") or (policy.get("validateUvs", False) and not ignored):
                status = "error"
        if project.engine == "godot" and policy.get("validateUvs", False) and not ignored:
            try:
                report = json.loads((root / ".blendup/uv-reports" / relative).with_suffix(".json").read_text(encoding="utf-8"))
                stat = asset.source.stat()
                fresh = (report.get("algorithmVersion") == ALGORITHM_VERSION and report.get("sourceSize") == stat.st_size
                         and str(report.get("sourceModifiedNs")) == str(stat.st_mtime_ns) and not report.get("unsavedChanges", False)
                         and report.get("allowUvOverlap", False) == policy.get("allowUvOverlap", False))
                if not fresh or not report.get("complete") or report.get("score", 0) < policy.get("minimumUvScore", 70):
                    status = "error"
                elif failure.get("success") is False and "UV" in failure.get("message", ""):
                    status = export_status(asset)
            except (OSError, ValueError):
                status = "error"
        ready = project.engine == "godot" and status == "exported"
        entry.update({"status": status, "godotReady": ready, "outputPath": asset.output_relative or "",
                      "sourceSignature": f"{source.stat().st_size}:{source.stat().st_mtime_ns}",
                      "resourcePath": "res://" + asset.output.relative_to(root / project.engine_root).as_posix() if ready else None,
                      "outputSignature": f"{asset.output.stat().st_size}:{asset.output.stat().st_mtime_ns}" if asset.output and asset.output.is_file() else ""})
        return entry

    for entry in manifest["assets"]:
        ignored = entry["ignoreUvValidation"]
        variants = entry.pop("variants", [])
        entry.update(version_entry(entry["id"], entry["name"], entry["sourcePath"], ignored))
        entry["variants"] = [version_entry(str(v.get("id") or asset_id_for_path(v["sourcePath"])),
                                           str(v.get("name") or Path(v["sourcePath"]).stem), v["sourcePath"], ignored)
                             for v in variants if isinstance(v, dict) and isinstance(v.get("sourcePath"), str)]
    index = {"schemaVersion": 2, "projectId": project.project_id, "name": project.name, "artRoot": project.art_root, "assets": manifest["assets"]}
    path = root / ".blendup/library/index.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    import os
    temporary = path.with_name(f"index-{os.getpid()}.tmp")
    temporary.write_text(json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(path)
    return index
