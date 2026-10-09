"""Per-asset UV exclusions shared by Blender and desktop background jobs."""
from __future__ import annotations

import json
from pathlib import Path


def uv_validation_ignored(root: Path, source: Path) -> bool:
    root = Path(root).resolve()
    relative = Path(source).resolve().relative_to(root).as_posix()
    for path in (root / ".blendup/assets").glob("*.json"):
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        if not isinstance(raw, dict):
            continue
        paths = raw.get("paths") if isinstance(raw.get("paths"), dict) else {}
        sources = [raw.get("sourcePath") or paths.get("blenderSource")]
        for key in ("variants", "lods"):
            versions = raw.get(key)
            if isinstance(versions, list):
                sources.extend(item.get("sourcePath") for item in versions if isinstance(item, dict))
        if any(isinstance(value, str) and value.replace("\\", "/").removeprefix("./") == relative for value in sources):
            return raw.get("ignoreUvValidation") is True
    return False
