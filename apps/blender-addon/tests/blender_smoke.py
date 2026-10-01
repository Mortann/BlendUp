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
    from blendup.scripts.generate_lods import generate

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

            lod_source = source.parent / "Smoke.lod.lod1.blend"
            generate(source, [(lod_source, 0.5)])
            assert lod_source.is_file()
            mesh_objects = [obj for obj in bpy.data.objects if obj.type == "MESH"]
            assert mesh_objects
            assert all(any(modifier.type == "DECIMATE" and modifier.name == "BlendUp LOD" for modifier in obj.modifiers) for obj in mesh_objects)
            assert all(any(abs(modifier.ratio - 0.5) < 0.001 for modifier in obj.modifiers if modifier.type == "DECIMATE") for obj in mesh_objects)
            bpy.ops.wm.open_mainfile(filepath=str(source))

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

            # The same assets can be detached from an engine without implicit FBX exports.
            config["engine"] = "none"
            config["paths"] = {"artRoot": "Art"}
            (metadata / "project.json").write_text(json.dumps(config), encoding="utf-8")
            from blendup.ops.export_ops import current_asset, export_current
            from blendup.core.export_state import export_status
            asset = current_asset()
            assert asset.project.engine == "none"
            assert asset.output is None
            assert export_status(asset) == "local"
            assert not bpy.ops.blendup.export_asset.poll()
            assert bpy.ops.blendup.prepare_workspace() == {"FINISHED"}
            assert bpy.ops.blendup.validate_asset() == {"FINISHED"}
            old_state = (metadata / "export-state.json").read_bytes()
            import blendup.handlers as handlers
            from types import SimpleNamespace
            original_preferences = handlers.preferences
            handlers.preferences = lambda: SimpleNamespace(auto_export=True)
            try:
                handlers.export_after_save(None)
            finally:
                handlers.preferences = original_preferences
            assert (metadata / "export-state.json").read_bytes() == old_state
            try:
                export_current()
                raise AssertionError("A standalone project must not export to an engine")
            except ValueError:
                pass
            assert not (root / "Unity").exists()
            assert not list((root / "Art").rglob("*.fbx"))

        print("BLENDUP_BLENDER_SMOKE_OK")
    finally:
        blendup.unregister()


if __name__ == "__main__":
    main()
