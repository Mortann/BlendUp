import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from blendup.core.showcase import arrange
from blendup.core.library import source_assets, publish_index


class ShowcaseTests(unittest.TestCase):
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
