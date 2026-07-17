from __future__ import annotations

import json
from pathlib import Path
import sys
import tempfile
import time
import unittest


ADDON_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ADDON_ROOT))

from blendup.core.export_state import export_status, read_state, record_export
from blendup.core.bridge import acknowledge_open, clear_open_request, read_open_request, requested_blend_file
from blendup.core.project import asset_id_for_path, find_project_root, load_project, locate_asset
from blendup.core.validation import validate_meshes


class FakeMesh:
    def __init__(self, name="Cube", scale=(1, 1, 1), has_uv=True, material_count=1, non_manifold_edges=0):
        self.name = name
        self.scale = scale
        self.has_uv = has_uv
        self.material_count = material_count
        self.non_manifold_edges = non_manifold_edges


class ProjectTests(unittest.TestCase):
    def make_project(self, root: Path, engine="godot") -> None:
        config = {
            "schemaVersion": 2,
            "kind": "project",
            "projectId": "project_test",
            "name": "Test",
            "engine": engine,
            "paths": {
                "artRoot": "Art",
                "engineRoot": "Godot" if engine == "godot" else "Unity",
                "engineAssetsRoot": f"{'Godot' if engine == 'godot' else 'Unity'}/Assets",
            },
        }
        (root / ".blendup").mkdir(parents=True)
        (root / ".blendup" / "project.json").write_text(json.dumps(config), encoding="utf-8")

    def test_finds_project_and_mirrors_godot_path(self):
        with tempfile.TemporaryDirectory(dir=ADDON_ROOT / "tests") as directory:
            root = Path(directory)
            self.make_project(root)
            source = root / "Art" / "Environment" / "Rock.blend"
            source.parent.mkdir(parents=True)
            source.touch()
            self.assertEqual(find_project_root(source), root.resolve())
            asset = locate_asset(source, load_project(root))
            self.assertEqual(asset.output_relative, "Godot/Assets/Environment/Rock.glb")
            self.assertEqual(asset.asset_id, asset_id_for_path("Art/Environment/Rock.blend"))

    def test_mirrors_unity_path_as_fbx(self):
        with tempfile.TemporaryDirectory(dir=ADDON_ROOT / "tests") as directory:
            root = Path(directory)
            self.make_project(root, "unity")
            source = root / "Art" / "Props" / "Crate.blend"
            source.parent.mkdir(parents=True)
            source.touch()
            asset = locate_asset(source)
            self.assertEqual(asset.export_format, "fbx")
            self.assertEqual(asset.output_relative, "Unity/Assets/Props/Crate.fbx")

    def test_reads_legacy_paths(self):
        with tempfile.TemporaryDirectory(dir=ADDON_ROOT / "tests") as directory:
            root = Path(directory)
            (root / ".blendup").mkdir()
            legacy = {"name": "Legacy", "paths": {"artRoot": "Artwork", "unityRoot": "Game", "unityAssetsRoot": "Game/Assets3D"}}
            (root / ".blendup" / "project.json").write_text(json.dumps(legacy), encoding="utf-8")
            project = load_project(root)
            self.assertEqual(project.engine, "unity")
            self.assertEqual(project.engine_assets_root, "Game/Assets3D")

    def test_export_state_matches_file_dates(self):
        with tempfile.TemporaryDirectory(dir=ADDON_ROOT / "tests") as directory:
            root = Path(directory)
            self.make_project(root)
            source = root / "Art" / "Tree.blend"
            source.parent.mkdir()
            source.touch()
            asset = locate_asset(source)
            self.assertEqual(export_status(asset), "ready")
            asset.output.parent.mkdir(parents=True)
            asset.output.touch()
            self.assertEqual(export_status(asset), "exported")
            time.sleep(0.02)
            source.touch()
            self.assertEqual(export_status(asset), "outdated")
            record_export(asset, False, "Test error")
            record = read_state(root)["exports"][asset.asset_id]
            self.assertFalse(record["success"])
            self.assertEqual(record["outputPath"], asset.output_relative)


class ValidationTests(unittest.TestCase):
    def test_reports_actionable_mesh_issues(self):
        issues = validate_meshes([FakeMesh(scale=(2, 1, 1), has_uv=False, material_count=0, non_manifold_edges=3)])
        self.assertEqual(len(issues), 4)
        self.assertTrue(any("Échelle" in issue.message for issue in issues))
        self.assertTrue(any("non-manifold" in issue.message for issue in issues))


class BridgeTests(unittest.TestCase):
    def test_reads_validates_and_acknowledges_open_request(self):
        with tempfile.TemporaryDirectory(dir=ADDON_ROOT / "tests") as directory:
            root = Path(directory)
            target = root / "Art" / "Rock" / "Rock.blend"
            target.parent.mkdir(parents=True)
            target.touch()
            bridge = root / ".blendup" / "blender-bridge"
            bridge.mkdir(parents=True)
            (bridge / "open-request.json").write_text(json.dumps({
                "id": "request_test",
                "blendPath": "Art/Rock/Rock.blend",
                "expiresAtMs": int(time.time() * 1_000) + 5_000,
            }), encoding="utf-8")
            request = read_open_request(root)
            self.assertIsNotNone(request)
            self.assertEqual(requested_blend_file(root, request), target.resolve())
            acknowledge_open(root, request.id, True)
            acknowledgement = json.loads((bridge / "open-ack.json").read_text(encoding="utf-8"))
            self.assertTrue(acknowledgement["opened"])
            clear_open_request(root, request.id)
            self.assertFalse((bridge / "open-request.json").exists())


if __name__ == "__main__":
    unittest.main(verbosity=2)
