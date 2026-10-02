import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from blendup.core.showcase import arrange
from blendup.core.library import source_assets, publish_index
from blendup.core.asset_policy import uv_validation_ignored


class ShowcaseTests(unittest.TestCase):
    def test_published_variants_keep_stable_ids_and_their_own_export_and_uv_gate(self):
        from blendup.core.uv_quality import ALGORITHM_VERSION
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / ".blendup/assets").mkdir(parents=True)
            config = {"name": "Variants", "engine": "godot", "paths": {"artRoot": "Art", "engineRoot": "Godot", "engineAssetsRoot": "Godot/Assets"}}
            (root / ".blendup/project.json").write_text(json.dumps(config))
            for path in ["Art/Table/Table.blend", "Art/Table/Table.variant.red.blend", "Godot/Assets/Table/Table.glb", "Godot/Assets/Table/variants/red.glb"]:
                file = root / path
                file.parent.mkdir(parents=True, exist_ok=True)
                file.write_bytes(b"test")
            metadata = {"id": "stable-table", "sourcePath": "Art/Table/Table.blend", "variants": [
                {"id": "stable-red", "name": "Rouge", "sourcePath": "Art/Table/Table.variant.red.blend"},
                {"id": "gone", "name": "Absente", "sourcePath": "Art/Table/Table.variant.gone.blend"}]}
            metadata_path = root / ".blendup/assets/stable-table.json"
            metadata_path.write_text(json.dumps(metadata))
            asset = publish_index(root)["assets"][0]
            self.assertEqual(asset["id"], "stable-table")
            self.assertEqual(asset["variants"][0]["id"], "stable-red")
            self.assertEqual(asset["variants"][0]["resourcePath"], "res://Assets/Table/variants/red.glb")
            self.assertFalse(asset["variants"][1]["godotReady"])
            config["blender"] = {"validateUvs": True, "minimumUvScore": 70}
            (root / ".blendup/project.json").write_text(json.dumps(config))
            source = root / metadata["sourcePath"]
            stat = source.stat()
            report = {"algorithmVersion": ALGORITHM_VERSION, "sourceSize": stat.st_size, "sourceModifiedNs": str(stat.st_mtime_ns), "complete": True, "score": 100}
            report_path = (root / ".blendup/uv-reports" / metadata["sourcePath"]).with_suffix(".json")
            report_path.parent.mkdir(parents=True)
            report_path.write_text(json.dumps(report))
            asset = publish_index(root)["assets"][0]
            self.assertTrue(asset["godotReady"])
            self.assertFalse(asset["variants"][0]["godotReady"], "An unchecked variant cannot use the original's UV report")
            metadata["ignoreUvValidation"] = True
            metadata_path.write_text(json.dumps(metadata))
            self.assertTrue(publish_index(root)["assets"][0]["variants"][0]["godotReady"])
    def test_layout_preserves_scale_and_prevents_overlap_for_unequal_assets(self):
        bounds = [((-5, -2, -3), (7, 3, 9)), ((20, 7, 4), (22, 8, 5)), ((0, 0, 1), (1, 1, 2))]
        offsets, floor = arrange(bounds, 2)
        boxes = []
        for (low, high), off in zip(bounds, offsets):
            self.assertEqual(low[2] + off[2], 0)
            box = ([low[i] + off[i] for i in range(3)], [high[i] + off[i] for i in range(3)])
            self.assertLessEqual(abs(box[0][0]), floor[0] / 2)
            self.assertLessEqual(abs(box[1][0]), floor[0] / 2)
            boxes.append(box)
        for i, (a, b) in enumerate(boxes):
            for c, d in boxes[i + 1:]:
                self.assertTrue(b[0] + 2 <= c[0] or d[0] + 2 <= a[0] or b[1] + 2 <= c[1] or d[1] + 2 <= a[1])

    def test_empty_showcase_has_a_floor(self):
        self.assertEqual(arrange([]), ([], (4.0, 4.0)))

    def test_library_excludes_backups_versions_and_uses_custom_roots(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / ".blendup").mkdir()
            (root / ".blendup/project.json").write_text(json.dumps({"schemaVersion":2, "name":"Test", "engine":"none", "paths":{"artRoot":"Sources"}}))
            for path in ["Sources/Props/Table/Table.blend", "Sources/Props/Table/Table.blend1", "Sources/Props/Table/Table.variant.Red.blend", "Sources/Props/Table/Table.lod.lod1.blend"]:
                file = root / path
                file.parent.mkdir(parents=True, exist_ok=True)
                file.touch()
            assets = source_assets(root)["assets"]
            self.assertEqual(len(assets), 1)
            self.assertEqual(assets[0]["folder"], "Sources/Props")

    def test_published_index_updates_without_desktop_and_excludes_blocked_exports(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / ".blendup").mkdir()
            config = {"schemaVersion": 2, "name":"Test", "engine":"godot", "paths":{"artRoot":"Art", "engineRoot":"Engine", "engineAssetsRoot":"Engine/Assets"}}
            path = root / ".blendup/project.json"
            path.write_text(json.dumps(config))
            source = root / "Art/Table.blend"
            source.parent.mkdir()
            source.write_bytes(b"source")
            output = root / "Engine/Assets/Table.glb"
            output.parent.mkdir(parents=True)
            output.write_bytes(b"glb")
            index = publish_index(root)
            self.assertTrue(index["assets"][0]["godotReady"])
            self.assertEqual(index["assets"][0]["resourcePath"], "res://Assets/Table.glb")
            config["blender"] = {"validateUvs":True, "minimumUvScore":70}
            path.write_text(json.dumps(config))
            self.assertFalse(publish_index(root)["assets"][0]["godotReady"])
            from blendup.core.project import locate_asset
            asset = locate_asset(source)
            metadata = root / ".blendup/assets" / (asset.asset_id + ".json")
            metadata.parent.mkdir()
            metadata.write_text(json.dumps({"id": asset.asset_id, "sourcePath": "Art/Table.blend", "ignoreUvValidation": True,
                "variants": [{"sourcePath": "Art/Table.variant.Red.blend"}], "lods": [{"sourcePath": "Art/Table.lod.lod1.blend"}]}))
            self.assertTrue(publish_index(root)["assets"][0]["godotReady"])
            self.assertTrue(uv_validation_ignored(root, source))
            self.assertTrue(uv_validation_ignored(root, root / "Art/Table.variant.Red.blend"))
            self.assertTrue(uv_validation_ignored(root, root / "Art/Table.lod.lod1.blend"))
            self.assertFalse(uv_validation_ignored(root, root / "Art/Other.blend"))
            raw = json.loads(metadata.read_text())
            raw["ignoreUvValidation"] = False
            metadata.write_text(json.dumps(raw))
            self.assertFalse(uv_validation_ignored(root, source))
            self.assertFalse(publish_index(root)["assets"][0]["godotReady"])
