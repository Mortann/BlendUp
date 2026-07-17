"""Smoke test exécuté par le vrai binaire Blender."""

from __future__ import annotations

import json
from pathlib import Path
import sys
import tempfile
import time

import bpy


def main() -> None:
    marker = "--"
    if marker not in sys.argv:
        raise RuntimeError("Chemin de l'add-on manquant.")
    addon_root = Path(sys.argv[sys.argv.index(marker) + 1]).resolve()
    sys.path.insert(0, str(addon_root))

    import blendup
    from blendup.handlers import open_requested_blend_file

    blendup.register()
    try:
        with tempfile.TemporaryDirectory(prefix="blendup_blender_smoke_") as directory:
            root = Path(directory)
            config = {
                "schemaVersion": 2,
                "kind": "project",
                "projectId": "project_smoke",
                "name": "Smoke",
                "engine": "godot",
                "paths": {
                    "artRoot": "Art",
                    "engineRoot": "Godot",
                    "engineAssetsRoot": "Godot/Assets",
                },
            }
            metadata = root / ".blendup"
            metadata.mkdir(parents=True)
            (metadata / "project.json").write_text(json.dumps(config), encoding="utf-8")
            source = root / "Art" / "Blender" / "Smoke" / "Smoke.blend"
            source.parent.mkdir(parents=True)
            bpy.ops.wm.save_as_mainfile(filepath=str(source))

            assert bpy.ops.blendup.refresh() == {"FINISHED"}
            assert bpy.ops.blendup.prepare_workspace() == {"FINISHED"}
            assert all((source.parent / name).is_dir() for name in ("textures", "references", "renders"))
            assert bpy.ops.blendup.validate_asset() == {"FINISHED"}
            assert bpy.ops.blendup.export_asset() == {"FINISHED"}
            assert (root / "Godot" / "Assets" / "Blender" / "Smoke" / "Smoke.glb").is_file()

            other = root / "Art" / "Blender" / "Other" / "Other.blend"
            other.parent.mkdir(parents=True)
            bpy.ops.wm.save_as_mainfile(filepath=str(other))
            bpy.ops.wm.open_mainfile(filepath=str(source))

            bridge = metadata / "blender-bridge"
            bridge.mkdir(parents=True)
            request_id = "smoke_open_request"
            (bridge / "open-request.json").write_text(json.dumps({
                "id": request_id,
                "blendPath": "Art/Blender/Other/Other.blend",
                "expiresAtMs": int(time.time() * 1_000) + 5_000,
            }), encoding="utf-8")
            assert open_requested_blend_file() == 0.25
            acknowledgement = json.loads((bridge / "open-ack.json").read_text(encoding="utf-8"))
            assert acknowledgement == {"id": request_id, "opened": True}
            assert Path(bpy.data.filepath).resolve() == other.resolve()
            assert bpy.app.timers.is_registered(open_requested_blend_file)

        print("BLENDUP_BLENDER_SMOKE_OK")
    finally:
        blendup.unregister()


if __name__ == "__main__":
    main()
