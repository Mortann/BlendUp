from __future__ import annotations

import json
from pathlib import Path

from .project import load_project, stored_asset_id


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
