from __future__ import annotations

import json
from pathlib import Path

from .project import load_project, locate_asset, stored_asset_id
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
                       "sourceSignature": f"{stat.st_size}:{stat.st_mtime_ns}"})
    return {"root": str(root), "projectId": project.project_id, "assets": assets, "mode": "library", "signature": "addon-refresh"}


def publish_index(root):
    """Keep the editor dock current after a Blender save, including when BlendUp is closed."""
    root = Path(root).resolve()
    project = load_project(root)
    manifest = source_assets(root)
    config = json.loads((root / ".blendup/project.json").read_text(encoding="utf-8"))
    policy = config.get("blender", {})
    state = read_state(root).get("exports", {})
    for entry in manifest["assets"]:
        asset = locate_asset(root / entry["sourcePath"])
        status = export_status(asset)
        failure = state.get(entry["id"], {})
        if failure.get("success") is False:
            if "UV" not in failure.get("message", "") or policy.get("validateUvs", False):
                status = "error"
        if project.engine == "godot" and policy.get("validateUvs", False):
            try:
                report = json.loads((root / ".blendup/uv-reports" / entry["sourcePath"]).with_suffix(".json").read_text(encoding="utf-8"))
                stat = asset.source.stat()
                fresh = (report.get("algorithmVersion") == ALGORITHM_VERSION and report.get("sourceSize") == stat.st_size
                         and str(report.get("sourceModifiedNs")) == str(stat.st_mtime_ns) and not report.get("unsavedChanges", False)
                         and report.get("allowUvOverlap", False) == policy.get("allowUvOverlap", False))
                if not fresh or not report.get("complete") or report.get("score", 0) < policy.get("minimumUvScore", 70):
                    status = "error"
            except (OSError, ValueError):
                status = "error"
        ready = project.engine == "godot" and status == "exported"
        entry.update({"status": status, "godotReady": ready, "outputPath": asset.output_relative or "",
                      "resourcePath": "res://" + asset.output.relative_to(root / project.engine_root).as_posix() if ready else None,
                      "outputSignature": f"{asset.output.stat().st_size}:{asset.output.stat().st_mtime_ns}" if asset.output and asset.output.is_file() else ""})
    index = {"schemaVersion": 1, "projectId": project.project_id, "name": project.name, "artRoot": project.art_root, "assets": manifest["assets"]}
    path = root / ".blendup/library/index.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    import os
    temporary = path.with_name(f"index-{os.getpid()}.tmp")
    temporary.write_text(json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(path)
    return index
