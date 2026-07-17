"""État partagé avec l'application BlendUp."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .project import AssetLocation


def export_status(asset: AssetLocation) -> str:
    if not asset.output.is_file():
        return "ready"
    try:
        return "exported" if asset.output.stat().st_mtime >= asset.source.stat().st_mtime else "outdated"
    except OSError:
        return "error"


def read_state(root: Path) -> dict[str, Any]:
    path = root / ".blendup" / "export-state.json"
    try:
        with path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
        return data if isinstance(data, dict) else {"exports": {}}
    except (OSError, ValueError):
        return {"exports": {}}


def record_export(asset: AssetLocation, success: bool, message: str) -> None:
    state = read_state(asset.project.root)
    exports = state.setdefault("exports", {})
    exports[asset.asset_id] = {
        "success": bool(success),
        "message": "Export terminé." if success else (message.strip() or "L'export Blender a échoué.")[:4000],
        "outputPath": asset.output_relative,
    }
    path = asset.project.root / ".blendup" / "export-state.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".json.tmp")
    with temporary.open("w", encoding="utf-8") as handle:
        json.dump(state, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    temporary.replace(path)
